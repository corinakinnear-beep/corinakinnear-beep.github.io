# Studio

A private client portal for a designer and their clients: one page per project with Directives (intake by room),
an ongoing conversation filed by room, documents and mood boards, a process timeline with payments, and the next meeting.
Email-link sign-in, no passwords. Anyone who signs up can run projects; the people they invite are clients.

This is the generic version. It carries no designer identity: the designer's name comes from their profile,
the from-address and app link from the Supabase function secrets, and nothing is hard-coded to a person or domain.

## Files
- `index.html`, `studio.css`, `app.js` — the app (static, no build step)
- `sample.js` — the sample project shown in preview mode; also the template for new projects (intake questions, stages, rooms)
- `config.js` — Supabase URL and key. Blank = preview mode.
- `supabase/schema.sql` — tables, row security, storage bucket, notification triggers, the dashboard query
- `supabase/functions/notify/index.ts` — sends queued notifications through Resend

## Going live
1. Create a Supabase project. SQL Editor → run `supabase/schema.sql`.
2. Authentication → URL Configuration: Site URL = where the app will live; add it (with `/**`) to Redirect URLs.
3. Settings → API Keys: copy the Project URL and publishable key into `config.js`.
4. Edge Functions → deploy `notify` (paste `supabase/functions/notify/index.ts`). Secrets: `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL`.
   Schedule it with pg_cron every 5 minutes (see the bottom of schema.sql for the `cron.schedule` example — swap in your project ref and key).
5. Resend: add and verify your sending domain, create an API key.
6. Host the folder anywhere static (GitHub Pages, Netlify).

## Restricting who can start projects
Insert emails into `public.designers`. While that table is empty, anyone who signs in can start a project.
