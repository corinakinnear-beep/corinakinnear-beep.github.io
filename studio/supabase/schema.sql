-- Parlā Studio — database schema for Supabase.
-- Run this once in the SQL editor of a fresh project. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- ---------- people ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz default now()
);

-- Create a profile row the moment someone signs in for the first time.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, split_part(coalesce(new.email,''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
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
  created_at timestamptz default now()
);

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
  primary key (project_id, email)
);

create table if not exists public.intake_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  room text default '',
  position int default 0
);

create table if not exists public.intake_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  section_id uuid references public.intake_sections(id) on delete cascade,
  position int default 0,
  question text default '',
  answer text default '',
  updated_at timestamptz,
  updated_by uuid references public.profiles(id),
  added_by uuid references public.profiles(id),
  seen_by_designer boolean default true
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
  position int default 0,
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
  position bigint default 0
);

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
end $$;

-- Called by the designer from the app to start a project with the standard template.
create or replace function public.create_project(
  p_name text, p_client_emails text[], p_intake jsonb, p_stages jsonb, p_rooms text[], p_process jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; sec jsonb; q text; sid uuid; i int := 0; j int; st jsonb; e text;
begin
  insert into public.projects (name, designer_id, rooms, process) values (p_name, auth.uid(), p_rooms, p_process) returning id into pid;
  insert into public.project_members (project_id, user_id, role) values (pid, auth.uid(), 'designer');
  foreach e in array p_client_emails loop
    insert into public.project_invites (project_id, email, role) values (pid, lower(e), 'client') on conflict do nothing;
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
  sent_at timestamptz
);
alter table public.notifications enable row level security;
-- nobody reads the queue from the app; the function uses the service role

create or replace function public.notify_project(pid uuid, except_user uuid, only_role text, subj text, bod text, lnk text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (project_id, to_user, subject, body, link)
  select pid, m.user_id, subj, bod, lnk
  from public.project_members m
  where m.project_id = pid and m.user_id is distinct from except_user
    and (only_role is null or m.role = only_role);
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
  if new.answer is distinct from old.answer and new.updated_by is not null then
    select role into author_role from public.project_members where project_id = new.project_id and user_id = new.updated_by;
    if author_role <> 'designer' then
      select name into pname from public.projects where id = new.project_id;
      select coalesce(name, email) into who from public.profiles where id = new.updated_by;
      select title into sec from public.intake_sections where id = new.section_id;
      perform public.notify_project(new.project_id, new.updated_by, 'designer', who || (case when tg_op = 'INSERT' then ' added a directive' else ' changed a directive' end) || ' · ' || coalesce(sec,'') || ' · ' || pname, left(new.answer, 400), '#directives');
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
      perform public.notify_project(new.project_id, new.added_by, 'designer', who || ' added a directive · ' || coalesce(sec,'') || ' · ' || pname, left(new.answer, 400), '#directives');
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
    perform public.notify_project(new.project_id, (new.change_request->>'by')::uuid, 'designer', who || ' asked to ' || coalesce(new.change_request->>'kind','change') || ' the meeting · ' || pname, coalesce(new.change_request->>'message',''), '#meeting');
  elsif new."when" is distinct from old."when" or new."where" is distinct from old."where" then
    perform public.notify_project(new.project_id, null, 'client', 'Meeting updated · ' || pname, 'Now ' || to_char(new."when" at time zone 'America/Los_Angeles', 'Day, Month DD at HH12:MI AM') || coalesce(' · ' || nullif(new."where",''), ''), '#meeting');
  end if;
  return new;
end $$;
drop trigger if exists meeting_change_notify on public.meetings;
create trigger meeting_change_notify after update on public.meetings for each row execute function public.on_meeting_change();
