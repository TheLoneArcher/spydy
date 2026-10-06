begin;

-- A2. Allow capture submit to insert media before the report exists
alter table public.report_media alter column report_id drop not null;

-- A4. Drop stale overloads / insecure 0001 signatures
drop function if exists public.find_similar_reports(double precision, double precision, text, text, text);
drop function if exists public.submit_report(text, text, text, text, double precision, double precision, text, text);
drop function if exists public.become_volunteer(text[], double precision, double precision, integer);

-- A5. Dispatch must run as definer (authenticated has no INSERT/UPDATE on tasks/reports)
create or replace function public.dispatch_task(p_report uuid, p_volunteer uuid, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task uuid;
  v_status text;
begin
  if public.auth_role() not in ('admin', 'dispatcher') then
    raise exception 'dispatcher access required' using errcode = '42501';
  end if;

  select status into v_status from public.reports where id = p_report for update;
  if v_status is null or v_status not in ('pending', 'triaged', 'reopened', 'assigned') then
    raise exception 'report cannot be dispatched from status %', v_status using errcode = '22023';
  end if;

  if not exists (select 1 from public.volunteer_profiles where user_id = p_volunteer and on_duty) then
    raise exception 'volunteer is not on duty' using errcode = '22023';
  end if;

  insert into public.tasks (report_id, volunteer_id, assigned_by, status, notes)
  values (p_report, p_volunteer, auth.uid(), 'assigned', p_notes)
  on conflict (report_id) do update set
    volunteer_id = excluded.volunteer_id,
    assigned_by = excluded.assigned_by,
    status = 'assigned',
    notes = excluded.notes,
    updated_at = now()
  returning id into v_task;

  update public.reports set status = 'assigned', updated_at = now() where id = p_report;

  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  values (p_report, auth.uid(), 'assigned', coalesce(p_notes, 'Task assigned.'), 'public');

  insert into public.notifications (user_id, title, message, link)
  values (p_volunteer, 'New task assigned', coalesce(p_notes, 'You have a new task.'), '/my-tasks');

  return v_task;
end;
$$;
grant execute on function public.dispatch_task(uuid, uuid, text) to authenticated;

-- A6. Confirm resolution: reopen instead of disputed; only reporter can dispute
create or replace function public.confirm_report_resolution(p_report uuid, p_agrees boolean, p_image_path text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reporter uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select reporter_id into reporter from public.reports where id = p_report and status = 'resolved_pending_confirmation';
  if reporter is null then
    raise exception 'report is not awaiting confirmation' using errcode = '22023';
  end if;

  if not p_agrees and auth.uid() <> reporter then
    raise exception 'only the reporter can dispute' using errcode = '42501';
  end if;

  if p_agrees then
    insert into public.resolution_confirmations (report_id, user_id, agrees, verdict, image_path)
    values (p_report, auth.uid(), true, 'confirmed', p_image_path)
    on conflict (report_id, user_id) do update
      set agrees = true, verdict = 'confirmed', image_path = excluded.image_path;
    if auth.uid() = reporter
      or (select count(*) from public.resolution_confirmations where report_id = p_report and verdict = 'confirmed' and user_id <> reporter) >= 2 then
      update public.reports set status = 'closed', updated_at = now() where id = p_report;
    end if;
  else
    insert into public.resolution_confirmations (report_id, user_id, agrees, verdict, image_path)
    values (p_report, auth.uid(), false, 'disputed', p_image_path)
    on conflict (report_id, user_id) do update
      set agrees = false, verdict = 'disputed', image_path = excluded.image_path;
    update public.reports set status = 'reopened', updated_at = now() where id = p_report;
  end if;
end;
$$;
grant execute on function public.confirm_report_resolution(uuid, boolean, text) to authenticated;

-- A7. Realtime: add remaining tables one at a time
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.report_media;
exception when duplicate_object then null;
end $$;

-- A8. Stop writing role-change audits onto a random report
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role() <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_role not in ('civilian', 'dispatcher', 'admin') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'cannot demote self' using errcode = '22023';
  end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- A9. Staff volunteer duty + resource writes
create or replace function public.staff_set_volunteer_duty(p_user uuid, p_on_duty boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role() not in ('admin', 'dispatcher') then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.volunteer_profiles set on_duty = p_on_duty, updated_at = now() where user_id = p_user;
end;
$$;
grant execute on function public.staff_set_volunteer_duty(uuid, boolean) to authenticated;

grant insert, update, delete on public.resources to authenticated;
drop policy if exists resources_staff_write on public.resources;
create policy resources_staff_write on public.resources for all to authenticated
using (public.auth_role() in ('admin', 'dispatcher'))
with check (public.auth_role() in ('admin', 'dispatcher'));

-- A10. Account deactivation RPC (is_active is not a grantable column)
create or replace function public.deactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.profiles set is_active = false where id = auth.uid();
end;
$$;
grant execute on function public.deactivate_my_account() to authenticated;

-- A11. Category → required skill
create or replace function public.skill_for_category(p_category text)
returns skill_type
language plpgsql
stable
set search_path = public
as $$
declare
  v_skill skill_type;
begin
  select e.enumlabel::skill_type
  into v_skill
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'skill_type'
    and (
      (p_category = 'pothole' and e.enumlabel in ('road_repair', 'heavy_lifting', 'logistics'))
      or (p_category = 'streetlight' and e.enumlabel in ('electrical', 'tech_support', 'logistics'))
      or (p_category in ('water_leak', 'water') and e.enumlabel in ('plumbing', 'logistics'))
      or (p_category = 'garbage' and e.enumlabel in ('waste_handling', 'logistics', 'heavy_lifting'))
    )
  order by case e.enumlabel
    when 'road_repair' then 1
    when 'electrical' then 1
    when 'plumbing' then 1
    when 'waste_handling' then 1
    when 'heavy_lifting' then 2
    when 'tech_support' then 2
    when 'logistics' then 3
    else 4
  end
  limit 1;

  return v_skill;
end;
$$;

create or replace function public.set_required_skill()
returns trigger
language plpgsql
as $$
begin
  new.required_skill := coalesce(new.required_skill, public.skill_for_category(new.category::text));
  return new;
end;
$$;

drop trigger if exists reports_set_required_skill on public.reports;
create trigger reports_set_required_skill
  before insert on public.reports
  for each row execute function public.set_required_skill();

update public.reports set required_skill = public.skill_for_category(category::text)
where required_skill is null;

-- apply_volunteer: p_phone must be sendable as null
drop function if exists public.apply_volunteer(text[], double precision, double precision, int, jsonb, text, text);
create function public.apply_volunteer(
  p_skills text[],
  p_lat double precision,
  p_lon double precision,
  p_radius_km int,
  p_availability jsonb,
  p_motivation text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_id uuid;
  v_skill_slug text;
  v_skill_id bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_radius_km < 1 or p_radius_km > 50 then
    raise exception 'travel radius must be between 1 and 50 km' using errcode = '22023';
  end if;
  if length(trim(p_motivation)) < 20 or length(trim(p_motivation)) > 1000 then
    raise exception 'motivation must be between 20 and 1000 characters' using errcode = '22023';
  end if;
  if not public.in_service_area(p_lat, p_lon) then
    raise exception 'volunteer location must be inside the service area' using errcode = '22023';
  end if;
  if array_length(p_skills, 1) is not null then
    foreach v_skill_slug in array p_skills loop
      if not exists (select 1 from public.skills where slug = v_skill_slug) then
        raise exception 'invalid skill: %', v_skill_slug using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.volunteer_applications (
    user_id, motivation, availability, radius_km, location, phone, status, reviewed_by, reviewed_at
  )
  values (
    auth.uid(),
    trim(p_motivation),
    coalesce(p_availability, '{}'::jsonb),
    p_radius_km,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    nullif(trim(coalesce(p_phone, '')), ''),
    'pending',
    null,
    null
  )
  on conflict (user_id) do update set
    motivation = excluded.motivation,
    availability = excluded.availability,
    radius_km = excluded.radius_km,
    location = excluded.location,
    phone = excluded.phone,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    created_at = now()
  returning id into v_app_id;

  delete from public.volunteer_skills where user_id = auth.uid();
  if array_length(p_skills, 1) is not null then
    foreach v_skill_slug in array p_skills loop
      select id into v_skill_id from public.skills where slug = v_skill_slug;
      insert into public.volunteer_skills (user_id, skill_id, level)
      values (
        auth.uid(),
        v_skill_id,
        case
          when p_availability -> 'skill_levels' ->> v_skill_slug in ('beginner', 'intermediate', 'expert') then
            p_availability -> 'skill_levels' ->> v_skill_slug
          else 'intermediate'
        end
      )
      on conflict (user_id, skill_id) do update set level = excluded.level;
    end loop;
  end if;

  if p_phone is not null and trim(p_phone) <> '' then
    update public.profiles set phone = trim(p_phone) where id = auth.uid() and (phone is null or phone = '');
  end if;

  return v_app_id;
end;
$$;
grant execute on function public.apply_volunteer(text[], double precision, double precision, int, jsonb, text, text) to authenticated;

-- E8. Staff can reject / mark duplicate
create or replace function public.advance_report_status(p_report uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if public.auth_role() not in ('admin', 'dispatcher') then
    raise exception 'dispatcher access required' using errcode = '42501';
  end if;

  select status into current_status from public.reports where id = p_report for update;
  if not (
    (current_status = 'pending' and p_status in ('triaged', 'assigned', 'rejected', 'duplicate'))
    or (current_status = 'triaged' and p_status in ('assigned', 'rejected', 'duplicate'))
    or (current_status = 'assigned' and p_status = 'in_progress')
    or (current_status = 'in_progress' and p_status = 'resolved_pending_confirmation')
    or (current_status = 'resolved_pending_confirmation' and p_status in ('closed', 'reopened'))
    or (current_status = 'reopened' and p_status in ('assigned', 'in_progress', 'closed', 'rejected'))
  ) then
    raise exception 'illegal report transition: % -> %', current_status, p_status using errcode = '22023';
  end if;

  update public.reports set status = p_status, updated_at = now() where id = p_report;
  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  values (p_report, auth.uid(), p_status, 'Status set to ' || p_status, 'staff');
end;
$$;
grant execute on function public.advance_report_status(uuid, text) to authenticated;

-- A12. Feed keyset pagination aligned with ORDER BY
create or replace function public.feed_reports(
  p_lat double precision default null,
  p_lon double precision default null,
  p_sort text default 'newest',
  p_status text[] default null,
  p_category text[] default null,
  p_radius_km numeric default null,
  p_mine boolean default false,
  p_limit int default 20,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  title text,
  description text,
  category text,
  severity text,
  status text,
  created_at timestamptz,
  location_label text,
  lat double precision,
  lon double precision,
  distance_m double precision,
  up bigint,
  down bigint,
  score bigint,
  my_vote smallint,
  media_path text,
  ai_label text,
  reporter_name text,
  reporter_avatar text,
  duplicate_count int,
  priority double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user_lat double precision := p_lat;
  v_user_lon double precision := p_lon;
  v_cursor_val double precision;
  v_cursor_time timestamptz;
  v_cursor_id uuid;
begin
  if p_cursor is not null then
    v_cursor_id := (p_cursor ->> 'id')::uuid;
    if p_sort = 'newest' then
      v_cursor_time := (p_cursor ->> 'val')::timestamptz;
    else
      v_cursor_val := (p_cursor ->> 'val')::double precision;
    end if;
  end if;

  return query
  with base_reports as (
    select
      r.id,
      r.title,
      r.description,
      r.category,
      r.severity,
      r.status,
      r.created_at,
      r.location_label,
      r.is_anonymous,
      r.reporter_id,
      r.duplicate_count,
      st_y(r.location::geometry) as r_lat,
      st_x(r.location::geometry) as r_lon,
      case
        when v_user_lat is not null and v_user_lon is not null then
          st_distance(r.location, st_setsrid(st_makepoint(v_user_lon, v_user_lat), 4326)::geography)
        else null
      end as dist_m,
      coalesce((select count(*) from public.report_votes v where v.report_id = r.id and v.value = 1), 0) as up_cnt,
      coalesce((select count(*) from public.report_votes v where v.report_id = r.id and v.value = -1), 0) as down_cnt,
      (select value from public.report_votes where report_id = r.id and user_id = (select auth.uid())) as current_user_vote,
      (
        case r.severity when 'critical' then 3 when 'moderate' then 2 else 1 end * 3
        + coalesce((select count(*) from public.report_votes v where v.report_id = r.id and v.value = 1), 0)
        - coalesce((select count(*) from public.report_votes v where v.report_id = r.id and v.value = -1), 0)
        + 2 * r.duplicate_count
        + extract(epoch from (now() - r.created_at)) / 43200.0
      )::double precision as calc_priority,
      (
        select rm.storage_path from public.report_media rm
        where rm.report_id = r.id and rm.kind = 'original'
        order by rm.created_at asc limit 1
      ) as m_path,
      (
        select coalesce(rm.ai_label::text, '') from public.report_media rm
        where rm.report_id = r.id order by rm.created_at asc limit 1
      ) as a_label,
      p.full_name as raw_reporter_name,
      p.avatar_url as raw_reporter_avatar
    from public.reports r
    left join public.profiles p on p.id = r.reporter_id
    where
      (
        case
          when p_status is not null and array_length(p_status, 1) > 0 then
            r.status = any(p_status)
          else
            r.status not in ('duplicate', 'rejected')
        end
      )
      and (p_category is null or array_length(p_category, 1) is null or r.category::text = any(p_category))
      and (not p_mine or r.reporter_id = (select auth.uid()))
      and (
        p_radius_km is null
        or v_user_lat is null
        or st_dwithin(r.location, st_setsrid(st_makepoint(v_user_lon, v_user_lat), 4326)::geography, (p_radius_km * 1000)::double precision)
      )
  )
  select
    br.id,
    br.title,
    br.description,
    br.category,
    br.severity,
    br.status,
    br.created_at,
    br.location_label,
    br.r_lat as lat,
    br.r_lon as lon,
    br.dist_m as distance_m,
    br.up_cnt as up,
    br.down_cnt as down,
    (br.up_cnt - br.down_cnt) as score,
    br.current_user_vote as my_vote,
    br.m_path as media_path,
    br.a_label as ai_label,
    case when br.is_anonymous then 'Anonymous Citizen' else coalesce(br.raw_reporter_name, 'Citizen') end as reporter_name,
    case when br.is_anonymous then null else br.raw_reporter_avatar end as reporter_avatar,
    br.duplicate_count,
    br.calc_priority as priority
  from base_reports br
  where
    case
      when v_cursor_id is null then true
      when p_sort = 'newest' then
        br.created_at < v_cursor_time or (br.created_at = v_cursor_time and br.id < v_cursor_id)
      when p_sort = 'nearest' and v_user_lat is not null then
        br.dist_m > v_cursor_val or (br.dist_m = v_cursor_val and br.id < v_cursor_id)
      when p_sort = 'most_attested' then
        (br.up_cnt - br.down_cnt) < v_cursor_val
        or ((br.up_cnt - br.down_cnt) = v_cursor_val and br.id < v_cursor_id)
      when p_sort = 'urgent' then
        br.calc_priority < v_cursor_val or (br.calc_priority = v_cursor_val and br.id < v_cursor_id)
      else
        br.created_at < v_cursor_time or (br.created_at = v_cursor_time and br.id < v_cursor_id)
    end
  order by
    case when p_sort = 'nearest' and v_user_lat is not null then br.dist_m end asc nulls last,
    case when p_sort = 'most_attested' then (br.up_cnt - br.down_cnt) end desc,
    case when p_sort = 'urgent' then br.calc_priority end desc,
    case when coalesce(p_sort, 'newest') not in ('nearest', 'most_attested', 'urgent') then extract(epoch from br.created_at) end desc,
    br.id desc
  limit coalesce(p_limit, 20);
end;
$$;
grant execute on function public.feed_reports(double precision, double precision, text, text[], text[], numeric, boolean, int, jsonb) to authenticated;

-- A13. Privacy: hide phones; original photos visible in feed; lock down function execute
drop policy if exists profiles_read_authenticated on public.profiles;
drop policy if exists profiles_read_own_or_staff on public.profiles;
create policy profiles_read_own_or_staff on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.auth_role() in ('admin', 'dispatcher'));

create or replace view public.profiles_public
with (security_invoker = true) as
select id, full_name, avatar_url
from public.profiles
where is_active = true;
grant select on public.profiles_public to authenticated;

drop policy if exists media_read_originals on public.report_media;
create policy media_read_originals on public.report_media
  for select to authenticated
  using (kind = 'original');

-- C6. Login page stats (anon has no table access)
create or replace function public.public_stats()
returns table (closed_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.reports where status = 'closed';
$$;
grant execute on function public.public_stats() to anon, authenticated;

-- B6. Wider Chittoor–Tirupati service polygon (optional coverage)
insert into public.service_areas (name, geom, is_active)
values (
  'Chittoor–Tirupati region',
  st_geogfromtext('SRID=4326;POLYGON((78.9 13.1, 80.1 13.1, 80.1 14.3, 78.9 14.3, 78.9 13.1))'),
  true
)
on conflict (name) do update set geom = excluded.geom, is_active = true;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.public_stats() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
