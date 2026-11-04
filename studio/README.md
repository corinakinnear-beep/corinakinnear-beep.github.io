# Parlā Studio

Private client portal for Parla design projects. Lives at parladesigns.com/studio/ with no links back to the main site.

## Files
- `index.html`, `studio.css`, `app.js` — the app (static, no build step)
- `sample.js` — Brook and Evan's sample project; also the template for new projects (intake questions, stages, rooms)
- `config.js` — Supabase URL and anon key. Blank = preview mode with sample data.
- `supabase/schema.sql` — database tables, row security, storage bucket, and the functions the app calls

## Going live (one time, about 15 minutes)
1. Create a new Supabase project (free tier). Name it `parla-studio`.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → URL Configuration: Site URL `https://parladesigns.com/studio/`, and add the same URL to Redirect URLs. (Email sign-in is on by default; the magic-link email template can be customized under Authentication → Email Templates.)
4. Settings → API: copy the Project URL and the anon public key into `config.js`.
5. Publish the `studio/` folder to parladesigns.com as `/studio/`.
6. Open the page, sign in with corina@parladesigns.com, and use "Start a project" to create the first project with the clients' emails. They sign in with those emails and land in it.

## Roles
- The email in `config.js` (`DESIGNER_EMAIL`) is the designer: sees unread counts, marks notes read/integrated, files notes by room, edits the timeline, payments, meeting, documents, and can start new projects.
- Everyone else is a client of whatever projects their email was invited to.

## Not yet built
- Email notifications (to Cori when a client edits an answer or leaves a note; to clients when Cori replies). Needs an email sender (Resend) wired to a database trigger. In-app badges cover this for now.
- Smarter room-sorting. Today a note is filed by the room words it uses (kitchen, closet, loft…) the moment it's posted, and anything ambiguous goes to Unsorted; a scheduled Claude task can re-read Unsorted a few times a day once the project is live.
