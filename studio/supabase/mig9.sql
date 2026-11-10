-- Meetings: several time options, a reminder the day before, and notes that become directives
alter table public.meetings add column if not exists options jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists reminder_sent_at timestamptz;
alter table public.intake_questions add column if not exists source_meeting_id uuid references public.meetings(id) on delete set null;

create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  room text default '',
  body text not null default '',
  author_id uuid default auth.uid() references public.profiles(id),
  created_at timestamptz default now(),
  directive_id uuid references public.intake_questions(id) on delete set null,
  skipped boolean default false
);
alter table public.meeting_notes enable row level security;
drop policy if exists meeting_notes_designer on public.meeting_notes;
create policy meeting_notes_designer on public.meeting_notes for all to authenticated using (public.is_designer(project_id)) with check (public.is_designer(project_id));

-- a new time means a new reminder
create or replace function public.meeting_reset_reminder() returns trigger
language plpgsql as $$
begin
  if new."when" is distinct from old."when" then new.reminder_sent_at := null; end if;
  return new;
end $$;
drop trigger if exists meeting_reset_reminder on public.meetings;
create trigger meeting_reset_reminder before update on public.meetings for each row execute function public.meeting_reset_reminder();

create or replace function public.send_meeting_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record; day text;
begin
  for r in select mt.*, p.name as pname from public.meetings mt join public.projects p on p.id = mt.project_id
    where coalesce(mt.status, 'confirmed') = 'confirmed' and mt.reminder_sent_at is null
      and mt."when" > now() and mt."when" <= now() + interval '24 hours'
  loop
    day := case when (r."when" at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date then 'Today' else 'Tomorrow' end;
    perform public.notify_project(r.project_id, null, null, day || ': meeting · ' || r.pname,
      to_char(r."when" at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD at FMHH12:MI AM') || coalesce(' · ' || nullif(r."where", ''), ''), '#timeline');
    update public.meetings set reminder_sent_at = now() where id = r.id;
  end loop;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'studio-meeting-reminders';
select cron.schedule('studio-meeting-reminders', '*/15 * * * *', 'select public.send_meeting_reminders()');

-- notifications list every offered time
create or replace function public.on_meeting_thread() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; who text; author_role text; e jsonb; n_old int; whenx text; subj text; bod text;
begin
  n_old := case when tg_op = 'INSERT' then 0 else coalesce(jsonb_array_length(old.thread), 0) end;
  if coalesce(jsonb_array_length(new.thread), 0) <= n_old then return new; end if;
  e := new.thread -> (jsonb_array_length(new.thread) - 1);
  select name into pname from public.projects where id = new.project_id;
  select coalesce(name, email) into who from public.profiles where id = (e->>'by')::uuid;
  select role into author_role from public.project_members where project_id = new.project_id and user_id = (e->>'by')::uuid;
  if e->>'kind' = 'propose' and coalesce(jsonb_array_length(new.options), 0) > 1 then
    select string_agg(to_char((o #>> '{}')::timestamptz at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD at FMHH12:MI AM'), ' or ') into whenx from jsonb_array_elements(new.options) o;
    whenx := whenx || coalesce(' · ' || nullif(new."where", ''), '');
  else
    whenx := to_char(new."when" at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD at FMHH12:MI AM') || coalesce(' · ' || nullif(new."where", ''), '');
  end if;
  subj := coalesce(who, 'Someone') || case e->>'kind'
      when 'propose' then case when coalesce(jsonb_array_length(new.options), 0) > 1 then ' offered meeting times · ' else ' proposed a meeting · ' end
      when 'set' then ' scheduled a meeting · '
      when 'confirm' then ' confirmed the meeting · '
      when 'decline' then ' can''t make the meeting · '
      else ' replied about the meeting · ' end || pname;
  bod := case when e->>'kind' in ('propose', 'set', 'confirm', 'decline') then whenx else '' end
      || case when coalesce(e->>'message', '') <> '' then case when e->>'kind' in ('propose', 'set', 'confirm', 'decline') then ' — ' else '' end || (e->>'message') else '' end;
  perform public.notify_project(new.project_id, (e->>'by')::uuid, case when author_role = 'designer' then 'client' else 'designer' end, subj, left(bod, 600), '#timeline');
  return new;
end $$;
select 'mig9 ok';
