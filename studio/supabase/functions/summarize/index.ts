// Parlā Studio — keeps a short directive-style summary ready for each conversation.
// Deploy: supabase functions deploy summarize --no-verify-jwt
// Secrets: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional), DESIGNER_NAME (optional)
// Called two ways:
//   - by pg_cron every 5 minutes with the service role key and an empty body: summarizes every note flagged summary_stale
//   - by the app with the signed-in user's token and {"note_id": "..."}: summarizes that one note now and returns it
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const DESIGNER = Deno.env.get("DESIGNER_NAME") || "Corina";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Note = { id: string; body: string; author_id: string; room: string; project_id: string };

async function summarize(admin: ReturnType<typeof createClient>, n: Note): Promise<string> {
  const { data: replies } = await admin.from("note_replies").select("author_id,body,created_at").eq("note_id", n.id).order("created_at");
  const ids = [n.author_id, ...(replies ?? []).map((r: { author_id: string }) => r.author_id)];
  const { data: people } = await admin.from("profiles").select("id,name,email").in("id", ids);
  const { data: members } = await admin.from("project_members").select("user_id,role").eq("project_id", n.project_id);
  const who = (id: string) => {
    const p = (people ?? []).find((x: { id: string }) => x.id === id);
    const m = (members ?? []).find((x: { user_id: string }) => x.user_id === id);
    return `${p?.name || p?.email || "Someone"} (${m?.role === "designer" ? "designer" : "client"})`;
  };
  const transcript = [`${who(n.author_id)}: ${n.body}`, ...(replies ?? []).map((r: { author_id: string; body: string }) => `${who(r.author_id)}: ${r.body}`)].join("\n\n");

  const system = `You turn a conversation between an interior designer (${DESIGNER}) and her clients into a design directive.
Write two or three short sentences addressed to the clients in the second person ("You want…", "Keep…"), statements only, no questions, no greetings, no names.
Keep only decisions, preferences and constraints that matter to the design, with their specifics (which wall, which room, materials, sizes, what to avoid). Drop pleasantries and uncertainty.
If the designer made a decision in a reply, state it as an instruction. Output only the sentences.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, system, messages: [{ role: "user", content: `Space: ${n.room || "not sorted yet"}\n\n${transcript}` }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const out = await r.json();
  const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Empty summary");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);
  const admin = createClient(URL, SERVICE);
  const auth = req.headers.get("Authorization") || "";
  let body: { note_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body from cron */ }

  // One note, right now, for a signed-in member of its project.
  if (body.note_id) {
    const user = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: n, error } = await user.from("notes").select("id,body,author_id,room,project_id,summary,summary_stale").eq("id", body.note_id).single();
    if (error || !n) return json({ error: "Not allowed" }, 403);
    if (n.summary && !n.summary_stale) return json({ summary: n.summary, cached: true });
    try {
      const summary = await summarize(admin, n as Note);
      await admin.from("notes").update({ summary, summary_at: new Date().toISOString(), summary_stale: false }).eq("id", n.id);
      return json({ summary });
    } catch (e) { return json({ error: String(e) }, 502); }
  }

  // The scheduled sweep: only with the service role key.
  if (auth !== `Bearer ${SERVICE}`) return json({ error: "Not allowed" }, 403);
  const { data: rows } = await admin.from("notes").select("id,body,author_id,room,project_id").eq("summary_stale", true).order("created_at", { ascending: false }).limit(10);
  let done = 0; const errors: string[] = [];
  for (const n of rows ?? []) {
    try {
      const summary = await summarize(admin, n as Note);
      await admin.from("notes").update({ summary, summary_at: new Date().toISOString(), summary_stale: false }).eq("id", n.id);
      done++;
    } catch (e) { errors.push(String(e)); }
  }
  return json({ done, errors });
});
