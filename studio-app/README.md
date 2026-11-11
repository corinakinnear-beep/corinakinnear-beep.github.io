# Studio

A private client portal for a designer and their clients: one page per project with design directives by room, messages filed by room,
documents, a timeline with payments, meetings with propose/confirm and notes, and a dashboard of every project.
Sign-in is by email alone. Anyone who signs up can run projects; the people they invite are clients.

This is the generic version. It carries no designer identity: the designer's name, phone, reply-to address and payment information come from their Settings,
the sending address and app link from the Supabase function secrets, the time zone from the designer's browser, and nothing is hard-coded to a person or domain.

## Files
- `index.html`, `studio.css`, `app.js` — the app (static, no build step)
- `template.js` — the starter template (rooms, phases, first-meeting questions, stages). Each designer edits their own copy in Settings; new projects start from it.
- `sample.js` — the invented sample projects shown in preview mode
- `config.js` — Supabase URL and key (blank = preview mode), `OPEN_SIGNUP`, and `SIGNIN` (`"email"` or `"link"`)
- `supabase/schema.sql` — tables, row security, storage bucket, notification and reminder triggers, the dashboard query
- `supabase/functions/notify` — sends queued notifications through Resend
- `supabase/functions/summarize` — optional AI: summarizes a conversation into a directive and drafts directives from meeting notes

## Going live
1. Create a Supabase project. Authentication → Providers → Email: turn **Confirm email** off (email-only sign-in needs it). SQL Editor → run `supabase/schema.sql`.
2. Settings → API Keys: copy the Project URL and publishable key into `config.js`.
3. Edge Functions → deploy `notify` (secrets `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL`). `FROM_EMAIL` is the one verified sending address; emails go out as "<Designer> via Studio" with replies to the designer.
4. Optional AI: deploy `summarize` with JWT verification off (`--no-verify-jwt`) and secrets `GEMINI_API_KEY` (a free Google AI Studio key) and optionally `GEMINI_MODEL`. Leave the key unset and the AI is simply off; the app falls back to rough drafts. On Google's free tier, prompts may be used to improve their products, so don't use it for work you can't share.
5. Schedule three jobs with pg_cron (the commented block at the bottom of `schema.sql`: swap in your project ref and key): `notify` every 5 minutes, `summarize` every 5 minutes, meeting reminders every 15 minutes.
6. Resend: verify your sending domain, create an API key.
7. Host the folder anywhere static (GitHub Pages, Netlify). Share a project with a client using Copy project link in the project box.

## What each person can set (Settings)
Name, phone, reply-to address, payment information (shown to a client when a payment is requested), email alerts on or off (default off, per person), a PIN, and their template for new projects.

## Know the trade-offs
- **Email-only sign-in is convenience, not security.** The password is derived from the email address, so anyone who knows a client's email can open that project. Set `SIGNIN: "link"` to have a sign-in link emailed instead.
- **The PIN is a prompt in the app, not a lock on the data.** It keeps someone at your unlocked device out; it does not stop a person who calls the database directly. Five wrong tries lock it for 15 minutes.
- Don't put anything in a project you'd mind a stranger with a client's email reading.

## Restricting who can start projects
Insert emails into `public.designers`. While that table is empty, anyone who signs in can start a project.
