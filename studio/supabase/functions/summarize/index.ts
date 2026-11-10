// Parlā Studio — keeps a short directive-style summary ready for each conversation.
// Deploy: supabase functions deploy summarize --no-verify-jwt
// Secrets: GEMINI_API_KEY (required, free tier from aistudio.google.com), GEMINI_MODEL (optional), DESIGNER_NAME (optional)
// Called two ways:
//   - by pg_cron every 5 minutes with the service role key and an empty body: summarizes every note flagged summary_stale
//   - by the app with the signed-in user's token and {"note_id": "..."}: summarizes that one note now and returns it
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("GEMINI_API_KEY");
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
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

  const system = `You turn a conversation between an interior designer (${DESIGNER}) and her clients into a design directive: a short brief the designer will design to.
Write one to three short sentences as directives, not as a description of what someone wants. Lead with the thing itself. Example: "Entertainment unit on the northern wall with inlaid storage for books, using the pitched ceiling space. Keep the storage integrated into that un-walkable area."
Never start with "You want", "They want", "The clients" or a name. No questions, no greetings, no hedging. Keep only decisions, preferences and constraints that matter to the design, with their specifics (which wall, which room, materials, sizes, what to avoid). If the designer decided something in a reply, state it as the directive. Output only the sentences.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: `Space: ${n.room || "not sorted yet"}\n\n${transcript}` }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const out = await r.json();
  const text = ((out.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map(p => p.text || "").join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Empty summary");
  return text;
}

// Meeting notes -> draft directives. Related notes are merged; every note id comes back in exactly one draft.
type MNote = { id: string; room: string; body: string; question?: string };
async function draftFromNotes(notes: MNote[], rooms: string[]): Promise<{ room: string; directive: string; note_ids: string[] }[]> {
  const system = `You help an interior designer (${DESIGNER}) turn the notes she typed during a client meeting or call into design directives. Some notes are a question she asked (Q) and the clients' answer (A); the directive comes from the answer, read in light of the question: short briefs she will design to.
Combine notes about the same thing into one directive; keep different topics separate. Each directive is one to three short sentences that lead with the thing itself, for example: "Entertainment unit on the northern wall with inlaid storage for books, using the pitched ceiling space. Keep the storage integrated into that un-walkable area."
Never start with "You want", "They want", "The clients" or a name. No questions, no hedging. Keep the specifics (walls, materials, sizes, what to avoid).
Room must be one of: ${rooms.map(r => JSON.stringify(r)).join(", ")}. Use the note's room when it has one; otherwise pick the best fit.
Every note id must appear in exactly one item. Return only a JSON array of {"room": string, "directive": string, "note_ids": string[]}.`;
  const text = notes.map(n => `[${n.id}] (${n.room || "no room"}) ${n.question ? `Q: ${n.question} — A: ` : ""}${n.body}`).join("\n");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.3, responseMimeType: "application/json" },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const out = await r.json();
  const raw = ((out.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map(p => p.text || "").join("");
  const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
  const ids = new Set(notes.map(n => n.id)), seen = new Set<string>();
  const drafts = (Array.isArray(parsed) ? parsed : []).map((d: { room?: string; directive?: string; note_ids?: string[] }) => ({
    room: rooms.includes(d.room || "") ? d.room! : "",
    directive: String(d.directive || "").replace(/\s+/g, " ").trim(),
    note_ids: (d.note_ids || []).filter(id => ids.has(id) && !seen.has(id) && (seen.add(id), true)),
  })).filter(d => d.directive && d.note_ids.length);
  // anything the model dropped comes back as its own draft
  for (const n of notes) if (!seen.has(n.id)) drafts.push({ room: n.room, directive: n.body, note_ids: [n.id] });
  return drafts;
}

function roleOf(auth: string): string {
  const t = auth.replace(/^Bearer\s+/i, "");
  if (!t) return "";
  if (t === SERVICE || t.startsWith("sb_secret_")) return "service_role";
  if (t.startsWith("sb_publishable_")) return "anon";
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub ? "user" : (p.role || "");
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);
  const admin = createClient(URL, SERVICE);
  const auth = req.headers.get("Authorization") || "";
  let body: { note_id?: string; meeting_note_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body from cron */ }

  // Meeting notes -> directive drafts, for the designer (row security only lets her read them).
  if (Array.isArray(body.meeting_note_ids) && body.meeting_note_ids.length) {
    const user = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: notes, error } = await user.from("meeting_notes").select("id,room,body,question,project_id").in("id", body.meeting_note_ids.slice(0, 200));
    if (error || !notes?.length) return json({ error: "Not allowed" }, 403);
    const { data: proj } = await admin.from("projects").select("rooms").eq("id", notes[0].project_id).single();
    try { return json({ drafts: await draftFromNotes(notes as MNote[], (proj?.rooms ?? []) as string[]) }); }
    catch (e) { return json({ error: String(e) }, 502); }
  }

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

  // The scheduled sweep: with a project key (service or publishable), never with a person's sign-in token.
  if (!["service_role", "anon"].includes(roleOf(auth))) return json({ error: "Not allowed" }, 403);
  const { data: rows } = await admin.from("notes").select("id,body,author_id,room,project_id").eq("summary_stale", true).order("summary_at", { ascending: true, nullsFirst: true }).limit(10);
  let done = 0; const errors: string[] = [];
  await Promise.all((rows ?? []).map(async (n) => {
    try {
      const summary = await summarize(admin, n as Note);
      await admin.from("notes").update({ summary, summary_at: new Date().toISOString(), summary_stale: false }).eq("id", n.id);
      done++;
    } catch (e) {
      errors.push(String(e));
      await admin.from("notes").update({ summary_at: new Date().toISOString() }).eq("id", n.id);
    }
  }));
  return json({ done, errors });
});
