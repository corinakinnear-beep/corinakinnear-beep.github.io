-- Parlā Studio — database schema for Supabase.
-- Run this once in the SQL editor of a fresh project. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- ---------- people ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  email_alerts boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists email_alerts boolean default false;

-- Create a profile row the moment someone signs in for the first time.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, split_part(coalesce(new.email,''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then update public.profiles set email = new.email where id = new.id; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update on auth.users
  for each row execute function public.handle_user_email_change();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designer_id uuid references public.profiles(id),
  pinterest_url text default '',
  pinterest_note text default '',
  rooms text[] default '{}',
  process jsonb default '[]',
  notify_clients boolean default false,
  pin text default '',
  created_at timestamptz default now()
);
alter table public.projects add column if not exists notify_clients boolean default false;
alter table public.projects add column if not exists pin text default '';

create table if not exists public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'client' check (role in ('designer','client')),
  primary key (project_id, user_id)
);

-- Client emails invited before they've ever signed in.
create table if not exists public.project_invites (
  project_id uuid references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'client',
  name text default '',
  primary key (project_id, email)
);
alter table public.project_invites add column if not exists name text default '';

-- Who may start projects. Add a row per designer email.
create table if not exists public.designers (email text primary key, pin text default '');
alter table public.designers add column if not exists pin text default '';
insert into public.designers (email) values ('corina@parladesigns.com'), ('corina.kinnear@gmail.com') on conflict do nothing;
-- set the PIN: update public.designers set pin = '....';
alter table public.designers enable row level security;

create table if not exists public.intake_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  room text default '',
  position bigint default 0
);

create table if not exists public.intake_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  section_id uuid references public.intake_sections(id) on delete cascade,
  position bigint default 0,
  question text default '',
  answer text default '',
  updated_at timestamptz,
  updated_by uuid references public.profiles(id),
  added_by uuid references public.profiles(id),
  seen_by_designer boolean default true,
  directive text default '',
  directive_reviewed boolean default false
);
alter table public.intake_questions add column if not exists directive text default '';
alter table public.intake_questions add column if not exists directive_reviewed boolean default false;

create table if not exists public.directive_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.intake_questions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id),
  room text default '',
  body text default '',
  images text[] default '{}',
  created_at timestamptz default now(),
  edited_at timestamptz,
  read_at timestamptz,
  integrated_at timestamptz
);

create table if not exists public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  position bigint default 0,
  title text not null,
  focus text default '',
  description text default '',
  deliverable text default '',
  due date,
  status text default 'upcoming' check (status in ('upcoming','current','done')),
  standard numeric,
  fee numeric,
  hourly boolean default false,
  payment_status text default 'upcoming' check (payment_status in ('free','upcoming','requested','paid')),
  payment_amount numeric,
  payment_date date
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  "when" timestamptz not null,
  "where" text default '',
  notes text default '',
  change_request jsonb
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  kind text default '',
  url text default '',
  note text default '',
  position bigint default 0,
  created_at timestamptz default now(),
  added_by uuid references public.profiles(id)
);
alter table public.documents add column if not exists created_at timestamptz default now();
alter table public.documents add column if not exists added_by uuid references public.profiles(id);

create table if not exists public.architect_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  url text not null,
  caption text default '',
  position bigint default 0
);

-- ---------- helpers ----------
create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid());
$$;

create or replace function public.is_designer(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid() and role = 'designer');
$$;

-- Called by the app right after sign-in: turns any invites for this email into memberships.
create or replace function public.join_invited_projects() returns void
language plpgsql security definer set search_path = public as $$
declare my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then return; end if;
  insert into public.project_members (project_id, user_id, role)
    select i.project_id, auth.uid(), i.role from public.project_invites i
    where lower(i.email) = lower(my_email)
  on conflict do nothing;
  -- take the name the designer gave on the invite if the profile has none yet
  update public.profiles p set name = i.name
    from public.project_invites i
    where p.id = auth.uid() and lower(i.email) = lower(my_email) and i.name <> ''
      and (p.name is null or p.name = '' or lower(p.name) = lower(split_part(my_email,'@',1)));
end $$;

-- Called by the designer from the app to start a project with the standard template.
create or replace function public.create_project(
  p_name text, p_client_emails text[], p_intake jsonb, p_stages jsonb, p_rooms text[], p_process jsonb default '[]', p_client_names text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; sec jsonb; q text; sid uuid; i int := 0; j int; st jsonb; e text; k int := 0; my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if not exists (select 1 from public.designers d where lower(d.email) = lower(coalesce(my_email,''))) then
    raise exception 'Only the designer can start a project';
  end if;
  insert into public.projects (name, designer_id, rooms, process) values (p_name, auth.uid(), p_rooms, p_process) returning id into pid;
  insert into public.project_members (project_id, user_id, role) values (pid, auth.uid(), 'designer');
  foreach e in array p_client_emails loop
    k := k + 1;
    insert into public.project_invites (project_id, email, role, name) values (pid, lower(e), 'client', coalesce(p_client_names[k], '')) on conflict do nothing;
    -- if that person already has an account, add them now
    insert into public.project_members (project_id, user_id, role)
      select pid, u.id, 'client' from auth.users u where lower(u.email) = lower(e)
    on conflict do nothing;
  end loop;
  for sec in select * from jsonb_array_elements(p_intake) loop
    i := i + 1;
    insert into public.intake_sections (project_id, title, room, position) values (pid, sec->>'title', coalesce(sec->>'room',''), i) returning id into sid;
    j := 0;
    for q in select * from jsonb_array_elements_text(sec->'questions') loop
      j := j + 1;
      insert into public.intake_questions (project_id, section_id, position, question) values (pid, sid, j, q);
    end loop;
  end loop;
  i := 0;
  for st in select * from jsonb_array_elements(p_stages) loop
    i := i + 1;
    insert into public.stages (project_id, position, title, focus, description, deliverable, standard, fee, hourly, status, payment_status)
    values (pid, i, st->>'title', coalesce(st->>'focus',''), st->>'description', st->>'deliverable', (st->>'standard')::numeric, (st->>'fee')::numeric,
            coalesce((st->>'hourly')::boolean,false), case when i = 1 then 'current' else 'upcoming' end,
            case when coalesce((st->>'fee')::numeric,0) = 0 then 'free' else 'upcoming' end);
  end loop;
  return pid;
end $$;

-- Designer renames a project and edits its client list (invites + existing members). Nothing is emailed.
create or replace function public.update_project_clients(p_project uuid, p_name text, p_client_emails text[], p_client_names text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare e text; k int := 0;
begin
  if not public.is_designer(p_project) then raise exception 'Only the designer can edit the project'; end if;
  update public.projects set name = p_name where id = p_project;
  delete from public.project_invites where project_id = p_project and role = 'client' and not (lower(email) = any (select lower(x) from unnest(p_client_emails) x));
  delete from public.project_members m using public.profiles pr where m.project_id = p_project and m.role = 'client' and pr.id = m.user_id and not (lower(pr.email) = any (select lower(x) from unnest(p_client_emails) x));
  foreach e in array p_client_emails loop
    k := k + 1;
    insert into public.project_invites (project_id, email, role, name) values (p_project, lower(e), 'client', coalesce(p_client_names[k], ''))
      on conflict (project_id, email) do update set name = excluded.name;
    insert into public.project_members (project_id, user_id, role)
      select p_project, u.id, 'client' from auth.users u where lower(u.email) = lower(e)
    on conflict do nothing;
    update public.profiles p set name = coalesce(nullif(p_client_names[k],''), p.name) from auth.users u where u.id = p.id and lower(u.email) = lower(e) and (p.name is null or p.name = '' or lower(p.name) = lower(split_part(u.email,'@',1)));
  end loop;
end $$;

-- Email-only sign-in: an invited email (or a designer) may create an account without a confirmation step.
create or replace function public.email_ok(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select i.project_id from public.project_invites i where lower(i.email) = lower(p_email) limit 1),
    (select '00000000-0000-0000-0000-000000000000'::uuid from public.designers d where lower(d.email) = lower(p_email) limit 1));
$$;

-- Designer edits the list of spaces. A space with directives in it can't be removed.
create or replace function public.set_project_rooms(p_project uuid, p_rooms text[]) returns void
language plpgsql security definer set search_path = public as $$
declare r text; i int := 0; busy text;
begin
  if not public.is_designer(p_project) then raise exception 'Only the designer can edit the project'; end if;
  select s.room into busy from public.intake_sections s where s.project_id = p_project and s.room <> '' and not (s.room = any (p_rooms))
    and exists (select 1 from public.intake_questions q where q.section_id = s.id) limit 1;
  if busy is not null then raise exception '"%" still has directives; move or delete them first', busy; end if;
  delete from public.intake_sections s where s.project_id = p_project and s.room <> '' and not (s.room = any (p_rooms));
  foreach r in array p_rooms loop
    i := i + 1;
    if not exists (select 1 from public.intake_sections s where s.project_id = p_project and s.room = r) then
      insert into public.intake_sections (project_id, title, room, position) values (p_project, r, r, i);
    else
      update public.intake_sections set position = i, title = r where project_id = p_project and room = r;
    end if;
  end loop;
  update public.projects set rooms = p_rooms where id = p_project;
end $$;

-- Rename a space everywhere it appears: the project's list, its directives section, and filed messages.
create or replace function public.rename_room(p_project uuid, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_designer(p_project) then raise exception 'Only the designer can edit the project'; end if;
  update public.projects set rooms = array_replace(rooms, p_old, p_new) where id = p_project;
  update public.intake_sections set room = p_new, title = p_new where project_id = p_project and room = p_old;
  update public.notes set room = p_new where project_id = p_project and room = p_old;
end $$;

-- Designer PIN, checked after the email sign-in.
create or replace function public.designer_pin_ok(p_pin text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.designers d join auth.users u on lower(u.email) = lower(d.email) where u.id = auth.uid() and d.pin <> '' and d.pin = p_pin);
$$;

-- Designer chooses to tell the clients about a directive.
create or replace function public.notify_directive(p_question uuid) returns void
language plpgsql security definer set search_path = public as $$
declare q record; pname text;
begin
  select * into q from public.intake_questions where id = p_question;
  if q.id is null or not public.is_designer(q.project_id) then return; end if;
  select name into pname from public.projects where id = q.project_id;
  perform public.notify_project(q.project_id, auth.uid(), 'client', 'New directive · ' || pname, left(coalesce(nullif(q.directive,''), q.question), 400), '#directives');
end $$;

-- Dashboard: one row per project the signed-in designer runs.
create or replace function public.project_summaries() returns table (
  id uuid, name text, clients text, unread int, changed int, stage text, stage_due date,
  meeting timestamptz, meeting_request boolean, payment_requested int, last_activity timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.name,
    (select string_agg(coalesce(pr.name, pr.email), ' & ') from project_members m2 join profiles pr on pr.id=m2.user_id where m2.project_id=p.id and m2.role='client') as clients,
    (select count(*)::int from notes n where n.project_id=p.id and n.read_at is null and n.author_id <> auth.uid()) as unread,
    (select count(*)::int from intake_questions q where q.project_id=p.id and q.updated_by is not null and q.updated_by <> auth.uid() and not q.seen_by_designer) as changed,
    (select s.title from stages s where s.project_id=p.id and s.status='current' order by s.position limit 1) as stage,
    (select s.due from stages s where s.project_id=p.id and s.status='current' order by s.position limit 1) as stage_due,
    (select mt."when" from meetings mt where mt.project_id=p.id order by mt."when" desc limit 1) as meeting,
    (select mt.change_request is not null from meetings mt where mt.project_id=p.id order by mt."when" desc limit 1) as meeting_request,
    (select count(*)::int from stages s where s.project_id=p.id and s.payment_status='requested') as payment_requested,
    greatest((select max(created_at) from notes n where n.project_id=p.id),(select max(created_at) from note_replies r where r.project_id=p.id),(select max(updated_at) from intake_questions q where q.project_id=p.id)) as last_activity
  from projects p join project_members m on m.project_id=p.id
  where m.user_id = auth.uid() and m.role='designer'
  order by last_activity desc nulls last, p.created_at desc;
$$;

-- ---------- row security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.intake_sections enable row level security;
alter table public.intake_questions enable row level security;
alter table public.notes enable row level security;
alter table public.note_replies enable row level security;
alter table public.stages enable row level security;
alter table public.meetings enable row level security;
alter table public.architect_images enable row level security;
alter table public.documents enable row level security;
alter table public.directive_comments enable row level security;
drop policy if exists dcomments_rw on public.directive_comments;
create policy dcomments_rw on public.directive_comments for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));

-- profiles: anyone signed in can read names (needed to show "Brook", "Cori"); you can edit your own
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists projects_member on public.projects;
create policy projects_member on public.projects for select to authenticated using (public.is_member(id));
drop policy if exists projects_designer on public.projects;
create policy projects_designer on public.projects for update to authenticated using (public.is_designer(id));

drop policy if exists members_read on public.project_members;
create policy members_read on public.project_members for select to authenticated using (public.is_member(project_id));
drop policy if exists members_designer on public.project_members;
create policy members_designer on public.project_members for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));

drop policy if exists invites_designer on public.project_invites;
create policy invites_designer on public.project_invites for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));

-- everything inside a project: members read; members write where the app lets them
drop policy if exists sections_rw on public.intake_sections;
create policy sections_rw on public.intake_sections for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));
drop policy if exists questions_rw on public.intake_questions;
create policy questions_rw on public.intake_questions for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));
drop policy if exists notes_rw on public.notes;
create policy notes_rw on public.notes for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));
drop policy if exists replies_rw on public.note_replies;
create policy replies_rw on public.note_replies for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));
drop policy if exists stages_read on public.stages;
create policy stages_read on public.stages for select to authenticated using (public.is_member(project_id));
drop policy if exists stages_designer on public.stages;
create policy stages_designer on public.stages for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));
drop policy if exists meetings_rw on public.meetings;
create policy meetings_rw on public.meetings for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id));
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using (public.is_member(project_id));
drop policy if exists documents_designer on public.documents;
create policy documents_designer on public.documents for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));
drop policy if exists documents_client_add on public.documents;
create policy documents_client_add on public.documents for insert to authenticated with check (public.is_member(project_id) and added_by = auth.uid());
drop policy if exists documents_client_own on public.documents;
create policy documents_client_own on public.documents for delete to authenticated using (added_by = auth.uid());
drop policy if exists images_read on public.architect_images;
create policy images_read on public.architect_images for select to authenticated using (public.is_member(project_id));
drop policy if exists images_designer on public.architect_images;
create policy images_designer on public.architect_images for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('studio', 'studio', true) on conflict (id) do nothing;
drop policy if exists studio_read on storage.objects;
create policy studio_read on storage.objects for select using (bucket_id = 'studio');
drop policy if exists studio_upload on storage.objects;
create policy studio_upload on storage.objects for insert to authenticated with check (bucket_id = 'studio');

-- ---------- email notifications ----------
-- Every event that should email someone goes into this queue. An Edge Function
-- (supabase/functions/notify) drains it and sends through Resend.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  to_user uuid references public.profiles(id) on delete cascade,
  subject text not null,
  body text not null,
  link text default '',
  created_at timestamptz default now(),
  sent_at timestamptz,
  seen_at timestamptz
);
alter table public.notifications add column if not exists seen_at timestamptz;
alter table public.notifications enable row level security;
-- each person sees and marks their own notifications in the app; sending uses the service role
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated using (to_user = auth.uid());
drop policy if exists notifications_seen on public.notifications;
create policy notifications_seen on public.notifications for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

create or replace function public.notify_project(pid uuid, except_user uuid, only_role text, subj text, bod text, lnk text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (project_id, to_user, subject, body, link)
  select pid, m.user_id, subj, bod, lnk
  from public.project_members m join public.profiles pr on pr.id = m.user_id
  where m.project_id = pid and m.user_id is distinct from except_user
    and (only_role is null or m.role = only_role);
  -- rows still queue for the in-app bell; the sender skips people whose email_alerts is off
end $$;

create or replace function public.on_note_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = new.author_id;
  select role into author_role from public.project_members where project_id = new.project_id and user_id = new.author_id;
  if author_role = 'designer' then
    perform public.notify_project(new.project_id, new.author_id, 'client', who || ' added to the conversation · ' || pname, left(new.body, 400), '#conversation');
  else
    perform public.notify_project(new.project_id, new.author_id, 'designer', who || ' added to the conversation · ' || pname, left(new.body, 400), '#conversation');
  end if;
  return new;
end $$;
drop trigger if exists note_insert_notify on public.notes;
create trigger note_insert_notify after insert on public.notes for each row execute function public.on_note_insert();

create or replace function public.on_note_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text;
begin
  if new.body is distinct from old.body then
    select name into pname from public.projects where id = new.project_id;
    select coalesce(name, email) into who from public.profiles where id = new.author_id;
    select role into author_role from public.project_members where project_id = new.project_id and user_id = new.author_id;
    if author_role <> 'designer' then
      perform public.notify_project(new.project_id, new.author_id, 'designer', who || ' edited a note · ' || pname, left(new.body, 400), '#conversation');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists note_edit_notify on public.notes;
create trigger note_edit_notify after update on public.notes for each row execute function public.on_note_edit();

create or replace function public.on_reply_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text; note_room text; note_author uuid;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = new.author_id;
  select role into author_role from public.project_members where project_id = new.project_id and user_id = new.author_id;
  select room, author_id into note_room, note_author from public.notes where id = new.note_id;
  if author_role = 'designer' then
    perform public.notify_project(new.project_id, new.author_id, 'client', who || ' replied' || case when note_room <> '' then ' · ' || note_room else '' end || ' · ' || pname, left(new.body, 400), '#conversation');
  else
    perform public.notify_project(new.project_id, new.author_id, 'designer', who || ' replied' || case when note_room <> '' then ' · ' || note_room else '' end || ' · ' || pname, left(new.body, 400), '#conversation');
  end if;
  return new;
end $$;
drop trigger if exists reply_insert_notify on public.note_replies;
create trigger reply_insert_notify after insert on public.note_replies for each row execute function public.on_reply_insert();

create or replace function public.on_question_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text; sec text;
begin
  if (new.answer is distinct from old.answer or new.directive is distinct from old.directive) and new.updated_by is not null then
    select role into author_role from public.project_members where project_id = new.project_id and user_id = new.updated_by;
    if author_role <> 'designer' then
      select name into pname from public.projects where id = new.project_id;
      select coalesce(name, email) into who from public.profiles where id = new.updated_by;
      select title into sec from public.intake_sections where id = new.section_id;
      perform public.notify_project(new.project_id, new.updated_by, 'designer', who || ' changed a directive · ' || coalesce(sec,'') || ' · ' || pname, left(coalesce(nullif(new.directive,''), new.answer), 400), '#directives');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists question_update_notify on public.intake_questions;
create trigger question_update_notify after update on public.intake_questions for each row execute function public.on_question_update();

create or replace function public.on_question_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text; sec text;
begin
  if new.added_by is not null then
    select role into author_role from public.project_members where project_id = new.project_id and user_id = new.added_by;
    if author_role <> 'designer' then
      select name into pname from public.projects where id = new.project_id;
      select coalesce(name, email) into who from public.profiles where id = new.added_by;
      select title into sec from public.intake_sections where id = new.section_id;
      perform public.notify_project(new.project_id, new.added_by, 'designer', who || ' added a directive · ' || coalesce(sec,'') || ' · ' || pname, left(coalesce(nullif(new.directive,''), new.answer), 400), '#directives');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists question_insert_notify on public.intake_questions;
create trigger question_insert_notify after insert on public.intake_questions for each row execute function public.on_question_insert();

create or replace function public.on_meeting_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text;
begin
  select name into pname from public.projects where id = new.project_id;
  if new.change_request is not null and (old.change_request is null or new.change_request <> old.change_request) then
    select coalesce(name, email) into who from public.profiles where id = (new.change_request->>'by')::uuid;
    perform public.notify_project(new.project_id, (new.change_request->>'by')::uuid, 'designer', who || ' asked to ' || coalesce(new.change_request->>'kind','change') || ' the meeting · ' || pname, coalesce(new.change_request->>'message',''), '#timeline');
  elsif new."when" is distinct from old."when" or new."where" is distinct from old."where" then
    perform public.notify_project(new.project_id, auth.uid(), null, 'Meeting updated · ' || pname, 'Now ' || to_char(new."when" at time zone 'America/Los_Angeles', 'Day, Month DD at HH12:MI AM') || coalesce(' · ' || nullif(new."where",''), ''), '#timeline');
  end if;
  return new;
end $$;
create or replace function public.on_dcomment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text; dir text;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = new.author_id;
  select role into author_role from public.project_members where project_id = new.project_id and user_id = new.author_id;
  select coalesce(nullif(directive,''), question) into dir from public.intake_questions where id = new.question_id;
  perform public.notify_project(new.project_id, new.author_id, case when author_role = 'designer' then 'client' else 'designer' end,
    who || ' commented on a directive · ' || pname, left(coalesce(dir,''), 120) || E'\n— ' || left(new.body, 300), '#directives');
  return new;
end $$;
drop trigger if exists dcomment_insert_notify on public.directive_comments;
create trigger dcomment_insert_notify after insert on public.directive_comments for each row execute function public.on_dcomment_insert();

create or replace function public.on_document_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = new.added_by;
  select role into author_role from public.project_members where project_id = new.project_id and user_id = new.added_by;
  perform public.notify_project(new.project_id, new.added_by, case when author_role = 'designer' then 'client' else 'designer' end,
    coalesce(who,'Someone') || ' added a document · ' || pname, new.title || coalesce(' — ' || nullif(new.note,''), ''), '#documents');
  return new;
end $$;
drop trigger if exists document_insert_notify on public.documents;
create trigger document_insert_notify after insert on public.documents for each row execute function public.on_document_insert();

create or replace function public.on_stage_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.payment_status is distinct from old.payment_status then
    select name into pname from public.projects where id = new.project_id;
    perform public.notify_project(new.project_id, auth.uid(), 'client',
      case new.payment_status when 'requested' then 'Payment requested · ' when 'paid' then 'Payment received · ' else 'Payment updated · ' end || new.title,
      case when new.payment_amount is not null then '$' || to_char(new.payment_amount, 'FM999,999.00') else '' end || ' · ' || pname, '#timeline');
  end if;
  return new;
end $$;
drop trigger if exists stage_payment_notify on public.stages;
create trigger stage_payment_notify after update on public.stages for each row execute function public.on_stage_payment();

create or replace function public.on_meeting_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = auth.uid();
  select role into author_role from public.project_members where project_id = new.project_id and user_id = auth.uid();
  perform public.notify_project(new.project_id, auth.uid(), case when author_role = 'designer' then 'client' else 'designer' end,
    coalesce(who,'Someone') || (case when author_role = 'designer' then ' scheduled a meeting · ' else ' proposed a meeting · ' end) || pname,
    to_char(new."when" at time zone 'America/Los_Angeles', 'Day, Month DD at HH12:MI AM') || coalesce(' · ' || nullif(new."where",''), ''), '#timeline');
  return new;
end $$;
drop trigger if exists meeting_insert_notify on public.meetings;
create trigger meeting_insert_notify after insert on public.meetings for each row execute function public.on_meeting_insert();

drop trigger if exists meeting_change_notify on public.meetings;
create trigger meeting_change_notify after update on public.meetings for each row execute function public.on_meeting_change();
