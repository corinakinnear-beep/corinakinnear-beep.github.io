// Parlā Studio — drains public.notifications and sends each one through Resend.
// Deploy: supabase functions deploy notify --no-verify-jwt
// Secrets: RESEND_API_KEY, FROM_EMAIL (e.g. "Parlā Studio <corina@parladesigns.com>"), APP_URL
// Schedule it every 5 minutes with pg_cron (see schema.sql, bottom) or call it from a cron service.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL") || "Parlā Studio <onboarding@resend.dev>";
  const app = Deno.env.get("APP_URL") || "https://parladesigns.com/studio/";
  if (!key) return new Response("RESEND_API_KEY not set", { status: 500 });

  const { data: rows } = await sb.from("notifications").select("id,to_user,subject,body,link").is("sent_at", null).limit(50);
  let sent = 0;
  for (const n of rows ?? []) {
    const { data: p } = await sb.from("profiles").select("email,name,email_alerts").eq("id", n.to_user).single();
    if (!p?.email || !p.email_alerts) { await sb.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", n.id); continue; }
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#20211C;background:#EDE8DF">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#615F55;margin:0 0 20px">Parlā Studio</p>
      <p style="font-size:22px;font-weight:300;line-height:1.3;margin:0 0 18px">${esc(n.subject)}</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#43443C;white-space:pre-wrap;margin:0 0 28px">${esc(n.body)}</p>
      <a href="${app}${n.link}" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#5E6B4F">Open in Studio →</a></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [p.email], subject: n.subject, html })
    });
    if (r.ok) { sent++; await sb.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", n.id); }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
