begin;

create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'ResponSys user',
  role text not null default 'civilian' check (role in ('civilian', 'dispatcher', 'admin')),
  is_active boolean not null default true,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null default 'other',
  severity text not null default 'moderate' check (severity in ('critical', 'moderate', 'low')),
  status text not null default 'pending' check (status in ('pending', 'triaged', 'assigned', 'in_progress', 'resolved', 'resolved_pending_confirmation', 'closed', 'disputed', 'reopened', 'rejected', 'duplicate')),
  location geography(point, 4326) not null,
  location_label text,
  required_skill text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  skills text[] not null default '{}',
  location geography(point, 4326),
  on_duty boolean not null default true,
  max_radius_km integer not null default 10,
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  volunteer_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'accepted', 'en_route', 'on_site', 'in_progress', 'completed', 'blocked')),
  notes text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  quantity_total integer not null check (quantity_total >= 0),
  quantity_available integer not null check (quantity_available >= 0),
  location_label text not null,
  managed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_location_gist on public.reports using gist (location);
create index if not exists reports_status_idx on public.reports(status);
create index if not exists reports_created_at_idx on public.reports(created_at desc);

create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = (select auth.uid()) and is_active = true $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.submit_report(
  p_title text, p_description text, p_category text, p_severity text,
  p_lat double precision, p_lon double precision, p_label text, p_image_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare report_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_lat not between 13.55 and 13.72 or p_lon not between 79.33 and 79.58 then
    raise exception 'report location is outside the service area' using errcode = '22023';
  end if;
  insert into public.reports (reporter_id, title, description, category, severity, location, location_label)
  values (auth.uid(), left(trim(p_title), 160), left(trim(p_description), 4000), p_category, p_severity,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, left(trim(p_label), 240))
  returning id into report_id;
  insert into public.report_events (report_id, actor_id, kind, message)
  values (report_id, auth.uid(), 'created', 'Report submitted.');
  return report_id;
end;
$$;

create or replace function public.become_volunteer(p_skills text[], p_lat double precision, p_lon double precision, p_radius_km integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into public.volunteer_profiles (user_id, skills, location, max_radius_km)
  values (auth.uid(), p_skills, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, greatest(1, least(p_radius_km, 100)))
  on conflict (user_id) do update set skills = excluded.skills, location = excluded.location, max_radius_km = excluded.max_radius_km, on_duty = true;
end;
$$;

create or replace function public.dispatch_task(p_report uuid, p_volunteer uuid, p_notes text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare task_id uuid;
begin
  if public.auth_role() not in ('admin', 'dispatcher') then raise exception 'dispatcher access required' using errcode = '42501'; end if;
  insert into public.tasks (report_id, volunteer_id, assigned_by, status, notes)
  values (p_report, p_volunteer, auth.uid(), 'assigned', p_notes)
  on conflict (report_id) do update set volunteer_id = excluded.volunteer_id, assigned_by = excluded.assigned_by, status = 'assigned', notes = excluded.notes, updated_at = now()
  returning id into task_id;
  update public.reports set status = 'assigned', updated_at = now() where id = p_report;
  insert into public.report_events (report_id, actor_id, kind, message) values (p_report, auth.uid(), 'assigned', coalesce(p_notes, 'Task assigned.'));
  return task_id;
end;
$$;

create or replace function public.update_task_status(p_task uuid, p_status text, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare task_row public.tasks;
begin
  select * into task_row from public.tasks where id = p_task;
  if task_row.volunteer_id <> auth.uid() and public.auth_role() not in ('admin', 'dispatcher') then raise exception 'task access denied' using errcode = '42501'; end if;
  update public.tasks set status = p_status, updated_at = now() where id = p_task;
  update public.reports set status = case when p_status = 'completed' then 'resolved_pending_confirmation' when p_status in ('accepted', 'en_route', 'on_site', 'in_progress') then 'in_progress' else status end, updated_at = now() where id = task_row.report_id;
  insert into public.report_events (report_id, actor_id, kind, message) values (task_row.report_id, auth.uid(), p_status, coalesce(p_note, 'Task status updated.'));
end;
$$;

create or replace function public.nearby_open_reports()
returns table (id uuid, title text, description text, category text, severity text, status text, required_skill text, location_label text, lat double precision, lon double precision, created_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  select r.id, r.title, r.description, r.category, r.severity, r.status, r.required_skill, r.location_label,
    st_y(r.location::geometry), st_x(r.location::geometry), r.created_at
  from public.reports r where r.status in ('pending', 'triaged', 'reopened', 'assigned') order by r.created_at desc;
$$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.report_events enable row level security;
alter table public.resources enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid()) or public.auth_role() = 'admin') with check (id = (select auth.uid()) or public.auth_role() = 'admin');
drop policy if exists reports_read_authenticated on public.reports;
create policy reports_read_authenticated on public.reports for select to authenticated using (true);
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists reports_update_dispatch on public.reports;
create policy reports_update_dispatch on public.reports for update to authenticated using (public.auth_role() in ('admin', 'dispatcher') or reporter_id = (select auth.uid())) with check (public.auth_role() in ('admin', 'dispatcher') or reporter_id = (select auth.uid()));
drop policy if exists volunteer_profiles_read_authenticated on public.volunteer_profiles;
create policy volunteer_profiles_read_authenticated on public.volunteer_profiles for select to authenticated using (true);
drop policy if exists volunteer_profiles_own on public.volunteer_profiles;
create policy volunteer_profiles_own on public.volunteer_profiles for all to authenticated using (user_id = (select auth.uid()) or public.auth_role() in ('admin', 'dispatcher')) with check (user_id = (select auth.uid()) or public.auth_role() in ('admin', 'dispatcher'));
drop policy if exists tasks_read_authenticated on public.tasks;
create policy tasks_read_authenticated on public.tasks for select to authenticated using (volunteer_id = (select auth.uid()) or public.auth_role() in ('admin', 'dispatcher') or exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = (select auth.uid())));
drop policy if exists events_read_authenticated on public.report_events;
create policy events_read_authenticated on public.report_events for select to authenticated using (true);
drop policy if exists resources_read_authenticated on public.resources;
create policy resources_read_authenticated on public.resources for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.profiles, public.reports, public.volunteer_profiles, public.tasks, public.report_events, public.resources to authenticated;
grant insert, update on public.profiles, public.reports, public.volunteer_profiles to authenticated;
grant execute on function public.submit_report, public.become_volunteer, public.dispatch_task, public.update_task_status, public.nearby_open_reports to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.reports, public.tasks, public.volunteer_profiles, public.report_events;
exception when duplicate_object then null;
end $$;

commit;