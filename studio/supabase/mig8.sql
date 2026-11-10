-- Meetings: proposed / confirmed / declined, with a short message history
alter table public.meetings add column if not exists status text default 'confirmed';
alter table public.meetings add column if not exists proposed_by uuid references public.profiles(id);
alter table public.meetings add column if not exists thread jsonb default '[]'::jsonb;
update public.meetings mt set
  status = coalesce(mt.status, 'confirmed'),
  proposed_by = coalesce(mt.proposed_by, (select m.user_id from public.project_members m where m.project_id = mt.project_id and m.role = 'designer' limit 1)),
  thread = jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'by', (select m.user_id from public.project_members m where m.project_id = mt.project_id and m.role = 'designer' limit 1),
             'at', now(), 'kind', 'set', 'message', coalesce(mt.notes, ''), 'when', mt."when", 'where', coalesce(mt."where", '')))
    || case when mt.change_request is not null then jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'by', mt.change_request->>'by', 'at', mt.change_request->>'at', 'kind', 'note',
             'message', case when mt.change_request->>'kind' = 'cancel' then 'Asked to cancel. ' else 'Asked to move it. ' end || coalesce(mt.change_request->>'message', ''))) else '[]'::jsonb end
where mt.thread is null or mt.thread = '[]'::jsonb;

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
  whenx := to_char(new."when" at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD at FMHH12:MI AM') || coalesce(' · ' || nullif(new."where", ''), '');
  subj := coalesce(who, 'Someone') || case e->>'kind'
      when 'propose' then ' proposed a meeting · '
      when 'set' then ' scheduled a meeting · '
      when 'confirm' then ' confirmed the meeting · '
      when 'decline' then ' can''t make the meeting · '
      else ' replied about the meeting · ' end || pname;
  bod := case when e->>'kind' in ('propose', 'set', 'confirm', 'decline') then whenx else '' end
      || case when coalesce(e->>'message', '') <> '' then case when e->>'kind' in ('propose', 'set', 'confirm', 'decline') then ' — ' else '' end || (e->>'message') else '' end;
  perform public.notify_project(new.project_id, (e->>'by')::uuid, case when author_role = 'designer' then 'client' else 'designer' end, subj, left(bod, 400), '#timeline');
  return new;
end $$;
drop trigger if exists meeting_insert_notify on public.meetings;
drop trigger if exists meeting_change_notify on public.meetings;
drop trigger if exists meeting_thread_notify on public.meetings;
create trigger meeting_thread_notify after insert or update on public.meetings for each row execute function public.on_meeting_thread();

-- dashboard: "meeting request" now means a proposal waiting on you
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
    (select mt.status = 'proposed' and mt.proposed_by is distinct from auth.uid() from meetings mt where mt.project_id=p.id order by mt."when" desc limit 1) as meeting_request,
    (select count(*)::int from stages s where s.project_id=p.id and s.payment_status='requested') as payment_requested,
    greatest((select max(created_at) from notes n where n.project_id=p.id),(select max(created_at) from note_replies r where r.project_id=p.id),(select max(updated_at) from intake_questions q where q.project_id=p.id)) as last_activity
  from projects p join project_members m on m.project_id=p.id
  where m.user_id = auth.uid() and m.role='designer'
  order by last_activity desc nulls last, p.created_at desc;
$$;
select id, status, jsonb_array_length(thread) as entries, "when" from public.meetings;
