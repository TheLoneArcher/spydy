begin;

-- =====================================================================
-- 1. EXTENSIONS & GENERAL PRIVILEGE HARDENING
-- =====================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Revoke everything from anon (login-only app)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines in schema public from anon;

-- Profiles: revoke table update, grant only safe columns to authenticated
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, bio, home_area) on public.profiles to authenticated;

-- Reports: revoke direct insert and update from authenticated (use RPCs)
drop policy if exists reports_update_dispatch on public.reports;
drop policy if exists reports_insert_own on public.reports;
revoke insert, update on public.reports from authenticated;

-- Add anonymous and duplicate tracking columns on reports
alter table public.reports add column if not exists is_anonymous boolean not null default false;
alter table public.reports add column if not exists duplicate_of uuid references public.reports(id) on delete set null;
alter table public.reports add column if not exists duplicate_count integer not null default 0;

-- Volunteer profiles: owner reads own; staff reads all; no direct browser insert/update
drop policy if exists volunteer_profiles_read_authenticated on public.volunteer_profiles;
drop policy if exists volunteer_profiles_own on public.volunteer_profiles;
drop policy if exists volunteer_profiles_select on public.volunteer_profiles;
drop policy if exists volunteer_profiles_update on public.volunteer_profiles;

create policy volunteer_profiles_select on public.volunteer_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.auth_role() in ('admin', 'dispatcher'));

create policy volunteer_profiles_update on public.volunteer_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (user_id = (select auth.uid()) or public.auth_role() = 'admin');

revoke insert, update on public.volunteer_profiles from authenticated;

-- Public view for volunteer map labels and feed with 2-decimal rounded coordinates
create or replace view public.volunteer_public as
select
  vp.user_id,
  coalesce(p.full_name, 'Volunteer') as display_name,
  p.avatar_url,
  vp.skills,
  round(st_y(vp.location::geometry)::numeric, 2)::double precision as lat,
  round(st_x(vp.location::geometry)::numeric, 2)::double precision as lon,
  vp.on_duty
from public.volunteer_profiles vp
join public.profiles p on p.id = vp.user_id
where p.is_active = true;

grant select on public.volunteer_public to authenticated;

-- Report events: add visibility column, split public vs staff notes
alter table public.report_events add column if not exists visibility text not null default 'public' check (visibility in ('public', 'staff'));

drop policy if exists events_read_authenticated on public.report_events;
create policy events_read_authenticated on public.report_events
  for select to authenticated
  using (visibility = 'public' or public.auth_role() in ('admin', 'dispatcher'));

-- Report media: private bucket and RLS restricted to reporter, staff, and assigned volunteer
alter table public.report_media add column if not exists phash_bigint bigint;
alter table public.report_media add column if not exists verified boolean not null default false;
alter table public.report_media add column if not exists ai_confidence numeric;
alter table public.report_media add column if not exists ai_model text;
alter table public.report_media add column if not exists exif_stripped boolean not null default false;
alter table public.report_media add column if not exists is_after boolean not null default false;

drop policy if exists media_read_authenticated on public.report_media;
drop policy if exists media_insert_owner on public.report_media;

create policy media_read_authenticated on public.report_media
  for select to authenticated
  using (
    uploaded_by = (select auth.uid())
    or public.auth_role() in ('admin', 'dispatcher')
    or exists (
      select 1 from public.tasks t
      where t.report_id = report_media.report_id and t.volunteer_id = (select auth.uid())
    )
  );

revoke insert, update on public.report_media from authenticated;

-- =====================================================================
-- 2. SERVICE AREAS TABLE & FUNCTIONS
-- =====================================================================

create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  geom geography(polygon, 4326) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.service_areas enable row level security;
drop policy if exists service_areas_read on public.service_areas;
create policy service_areas_read on public.service_areas for select to authenticated using (true);
grant select on public.service_areas to authenticated;

-- Seed Tirupati bounding box as a polygon
insert into public.service_areas (name, geom, is_active)
values (
  'Tirupati Municipal Corporation',
  st_geogfromtext('SRID=4326;POLYGON((79.33 13.55, 79.58 13.55, 79.58 13.72, 79.33 13.72, 79.33 13.55))'),
  true
)
on conflict (name) do update set geom = excluded.geom, is_active = true;

create or replace function public.in_service_area(p_lat double precision, p_lon double precision)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select bool_or(st_covers(geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography))
      from public.service_areas
      where is_active = true
    ),
    false
  );
$$;

grant execute on function public.in_service_area(double precision, double precision) to authenticated;

-- =====================================================================
-- 3. STATUS VOCABULARY HARMONIZATION
-- =====================================================================

-- Migrate legacy status rows
update public.reports set status = 'closed' where status = 'resolved';
update public.reports set status = 'reopened' where status = 'disputed';

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check check (
  status in (
    'pending',
    'triaged',
    'assigned',
    'in_progress',
    'resolved_pending_confirmation',
    'closed',
    'reopened',
    'rejected',
    'duplicate'
  )
);

-- =====================================================================
-- 4. ROLE MANAGEMENT & PROFILE GUARANTEES (RPCs)
-- =====================================================================

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    insert into public.profiles (id, full_name, role, is_active)
    values (
      auth.uid(),
      coalesce((select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()), 'ResponSys Citizen'),
      'civilian',
      true
    )
    on conflict (id) do update set is_active = true
    returning * into v_profile;
  end if;

  return v_profile;
end;
$$;
grant execute on function public.ensure_profile() to authenticated;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
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

  select role into v_old_role from public.profiles where id = p_user;
  update public.profiles set role = p_role where id = p_user;

  -- Audit event (created as a system event in report_events or a notification)
  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  select r.id, auth.uid(), 'role_change', 'Admin changed role of user ' || p_user::text || ' to ' || p_role, 'staff'
  from public.reports r order by r.created_at desc limit 1;
end;
$$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role() <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_user = auth.uid() and not p_active then
    raise exception 'cannot deactivate self' using errcode = '22023';
  end if;

  update public.profiles set is_active = p_active where id = p_user;
end;
$$;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;

-- =====================================================================
-- 5. NOTIFICATIONS TABLE
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);
alter table public.notifications add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists read boolean not null default false;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, update (read) on public.notifications to authenticated;

-- =====================================================================
-- 6. VOLUNTEER APPLICATION WORKFLOW (RPCs)
-- =====================================================================

alter table public.volunteer_applications add column if not exists phone text;
alter table public.volunteer_applications drop constraint if exists volunteer_applications_status_check;
alter table public.volunteer_applications add constraint volunteer_applications_status_check check (
  status in ('pending', 'approved', 'rejected', 'withdrawn')
);

alter table public.volunteer_skills add column if not exists level text not null default 'intermediate' check (
  level in ('beginner', 'intermediate', 'expert')
);

insert into public.skills (slug, label) values
  ('first_aid', 'First Aid'),
  ('electrical', 'Electrical Repair'),
  ('plumbing', 'Plumbing & Drainage'),
  ('road_repair', 'Road & Pavement Repair'),
  ('waste_handling', 'Waste Handling'),
  ('driving', 'Driving & Transport'),
  ('logistics', 'Logistics & Dispatch'),
  ('languages', 'Languages & Translation'),
  ('heavy_lifting', 'Heavy Lifting'),
  ('tech_support', 'Tech & Communications')
on conflict (slug) do update set label = excluded.label;


-- apply_volunteer
drop function if exists public.apply_volunteer(text[], double precision, double precision, integer, jsonb, text, text);
create or replace function public.apply_volunteer(
  p_skills text[],
  p_lat double precision,
  p_lon double precision,
  p_radius_km int,
  p_availability jsonb,
  p_motivation text,
  p_phone text
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

  -- Validate all skills against public.skills
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
    trim(p_phone),
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

  -- Sync volunteer_skills
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
          else
            'intermediate'
        end
      )
      on conflict (user_id, skill_id) do update set level = excluded.level;
    end loop;
  end if;

  -- Update profile phone if provided
  if p_phone is not null and trim(p_phone) <> '' then
    update public.profiles set phone = trim(p_phone) where id = auth.uid() and (phone is null or phone = '');
  end if;

  return v_app_id;
end;
$$;
grant execute on function public.apply_volunteer(text[], double precision, double precision, int, jsonb, text, text) to authenticated;

-- review_volunteer_application
create or replace function public.review_volunteer_application(
  p_application uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.volunteer_applications;
  v_skills text[];
begin
  if public.auth_role() not in ('admin', 'dispatcher') then
    raise exception 'dispatcher or admin access required' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;

  select * into v_app from public.volunteer_applications where id = p_application;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  update public.volunteer_applications
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_application;

  if p_decision = 'approved' then
    -- Gather skill slugs
    select array_agg(s.slug) into v_skills
    from public.volunteer_skills vs
    join public.skills s on s.id = vs.skill_id
    where vs.user_id = v_app.user_id;

    insert into public.volunteer_profiles (user_id, skills, location, on_duty, max_radius_km, updated_at)
    values (v_app.user_id, coalesce(v_skills, '{}'), v_app.location, true, v_app.radius_km, now())
    on conflict (user_id) do update set
      skills = excluded.skills,
      location = excluded.location,
      on_duty = true,
      max_radius_km = excluded.max_radius_km,
      updated_at = now();

    insert into public.notifications (user_id, title, message, link)
    values (
      v_app.user_id,
      'Volunteer Application Approved',
      'Congratulations! Your volunteer application has been approved. You now have access to volunteer tasks.',
      '/my-tasks'
    );
  else
    insert into public.notifications (user_id, title, message, link)
    values (
      v_app.user_id,
      'Volunteer Application Update',
      coalesce(p_note, 'Your volunteer application was reviewed and not accepted at this time. You may re-apply later.'),
      '/volunteer/apply'
    );
  end if;
end;
$$;
grant execute on function public.review_volunteer_application(uuid, text, text) to authenticated;

-- set_volunteer_availability
create or replace function public.set_volunteer_availability(p_on_duty boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.volunteer_profiles
  set on_duty = p_on_duty, updated_at = now()
  where user_id = auth.uid();

  if not found then
    raise exception 'volunteer profile not found' using errcode = 'P0002';
  end if;
end;
$$;
grant execute on function public.set_volunteer_availability(boolean) to authenticated;

-- withdraw_volunteer
create or replace function public.withdraw_volunteer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.volunteer_profiles where user_id = auth.uid();
  update public.volunteer_applications set status = 'withdrawn' where user_id = auth.uid();
end;
$$;
grant execute on function public.withdraw_volunteer() to authenticated;

-- =====================================================================
-- 7. CAPTURE CHALLENGES (FOR CAMERA VERIFICATION)
-- =====================================================================

create table if not exists public.capture_challenges (
  nonce uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.capture_challenges add column if not exists user_id uuid references public.profiles(id) on delete cascade;

alter table public.capture_challenges enable row level security;
drop policy if exists capture_challenges_own on public.capture_challenges;
create policy capture_challenges_own on public.capture_challenges
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.capture_challenges to authenticated;

-- =====================================================================
-- 8. ATTESTATION VOTES & SUMMARY
-- =====================================================================

create or replace function public.vote_thresholds()
returns table (triage_threshold int, max_votes_per_hour int, min_account_age_mins int)
language sql immutable as $$
  select 3 as triage_threshold, 30 as max_votes_per_hour, 10 as min_account_age_mins;
$$;

drop function if exists public.vote_report(uuid, smallint);

create or replace function public.vote_report(p_report uuid, p_value smallint)
returns table (upvotes bigint, downvotes bigint, score bigint, my_vote smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid;
  v_status text;
  v_user_created timestamptz;
  v_user_active boolean;
  v_recent_votes int;
  v_up bigint;
  v_down bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_value not in (-1, 0, 1) then
    raise exception 'vote value must be -1, 0, or 1' using errcode = '22023';
  end if;

  -- Check report existence, reporter, and status
  select reporter_id, status into v_reporter, v_status from public.reports where id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if v_reporter = auth.uid() then
    raise exception 'reporter cannot vote on own report' using errcode = '42501';
  end if;

  if v_status in ('closed', 'rejected', 'duplicate') then
    raise exception 'cannot vote on a % report', v_status using errcode = '22023';
  end if;

  -- Anti-sybil check: account active & at least 10 minutes old
  select created_at, is_active into v_user_created, v_user_active
  from public.profiles where id = auth.uid();

  if not coalesce(v_user_active, false) then
    raise exception 'account is deactivated' using errcode = '42501';
  end if;

  if v_user_created > now() - interval '10 minutes' then
    raise exception 'account must be at least 10 minutes old to attest reports' using errcode = '42501';
  end if;

  -- Rate limit: 30 votes per hour
  select count(*) into v_recent_votes
  from public.report_votes
  where user_id = auth.uid() and updated_at > now() - interval '1 hour';

  if v_recent_votes >= 30 and p_value <> 0 then
    raise exception 'voting rate limit reached (max 30 per hour). Please try later.' using errcode = '22023';
  end if;

  -- Apply vote
  if p_value = 0 then
    delete from public.report_votes where report_id = p_report and user_id = auth.uid();
  else
    insert into public.report_votes (report_id, user_id, value, updated_at)
    values (p_report, auth.uid(), p_value, now())
    on conflict (report_id, user_id) do update
      set value = excluded.value, updated_at = now();
  end if;

  -- Calculate current totals
  select
    count(*) filter (where value = 1),
    count(*) filter (where value = -1)
  into v_up, v_down
  from public.report_votes
  where report_id = p_report;

  -- Auto-triage rule: 3 upvotes auto-triages pending reports
  if v_up >= 3 and v_status = 'pending' then
    update public.reports set status = 'triaged', updated_at = now() where id = p_report;
    insert into public.report_events (report_id, actor_id, kind, message, visibility)
    values (p_report, auth.uid(), 'triaged', 'Community attested: 3 people confirm this issue', 'public');
  end if;

  return query
  select v_up, v_down, (v_up - v_down) as score, p_value as my_vote;
end;
$$;
grant execute on function public.vote_report(uuid, smallint) to authenticated;

-- Report vote summary view
create or replace view public.report_vote_summary as
select
  r.id as report_id,
  count(v.value) filter (where v.value = 1) as up,
  count(v.value) filter (where v.value = -1) as down,
  coalesce(sum(v.value), 0) as score,
  (select value from public.report_votes where report_id = r.id and user_id = (select auth.uid())) as my_vote
from public.reports r
left join public.report_votes v on v.report_id = r.id
group by r.id;

grant select on public.report_vote_summary to authenticated;

-- =====================================================================
-- 9. DUPLICATE PIPELINE & SIMILARITY SEARCH
-- =====================================================================

create or replace function public.find_similar_reports(
  p_lat double precision,
  p_lon double precision,
  p_category text,
  p_title text,
  p_phash bigint default null
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
  distance_m double precision,
  title_sim double precision,
  phash_distance int,
  score double precision,
  media_path text
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      r.id,
      r.title,
      r.description,
      r.category,
      r.severity,
      r.status,
      r.created_at,
      r.location_label,
      st_distance(r.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_m,
      similarity(r.title, p_title)::double precision as title_sim,
      (
        select rm.phash_bigint
        from public.report_media rm
        where rm.report_id = r.id and rm.phash_bigint is not null
        order by rm.created_at asc limit 1
      ) as m_phash,
      (
        select rm.storage_path
        from public.report_media rm
        where rm.report_id = r.id
        order by rm.created_at asc limit 1
      ) as media_path
    from public.reports r
    where r.status not in ('closed', 'rejected', 'duplicate')
      and r.created_at > now() - interval '30 days'
      and (p_category is null or r.category::text = p_category)
      and st_dwithin(r.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, 75)
  )
  select
    c.id,
    c.title,
    c.description,
    c.category,
    c.severity,
    c.status,
    c.created_at,
    c.location_label,
    c.distance_m,
    c.title_sim,
    case
      when p_phash is not null and c.m_phash is not null then
        bit_count((p_phash # c.m_phash)::bit(64))
      else
        null
    end as phash_distance,
    (
      0.4 * greatest(0.0, 1.0 - (c.distance_m / 75.0))
      + 0.3 * c.title_sim
      + 0.3 * case
          when p_phash is not null and c.m_phash is not null then
            greatest(0.0, 1.0 - (bit_count((p_phash # c.m_phash)::bit(64))::double precision / 64.0))
          else 0.5
        end
    )::double precision as score,
    c.media_path
  from candidates c
  order by score desc
  limit 10;
$$;
grant execute on function public.find_similar_reports(double precision, double precision, text, text, bigint) to authenticated;

-- Merge duplicate report (staff only)
create or replace function public.merge_report(p_dup uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup public.reports;
  v_parent public.reports;
begin
  if public.auth_role() not in ('admin', 'dispatcher') then
    raise exception 'dispatcher or admin access required' using errcode = '42501';
  end if;

  if p_dup = p_into then
    raise exception 'cannot merge report into itself' using errcode = '22023';
  end if;

  select * into v_dup from public.reports where id = p_dup;
  select * into v_parent from public.reports where id = p_into;

  if v_dup.id is null or v_parent.id is null then
    raise exception 'one or both reports not found' using errcode = 'P0002';
  end if;

  update public.reports
  set status = 'duplicate',
      duplicate_of = p_into,
      updated_at = now()
  where id = p_dup;

  update public.reports
  set duplicate_count = duplicate_count + 1 + v_dup.duplicate_count,
      updated_at = now()
  where id = p_into;

  -- Re-link media to parent as secondary update media
  update public.report_media
  set report_id = p_into, kind = 'update'
  where report_id = p_dup;

  -- Write audit event
  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  values (p_into, auth.uid(), 'merged', 'Report ' || p_dup::text || ' merged into this issue as duplicate', 'public');
end;
$$;
grant execute on function public.merge_report(uuid, uuid) to authenticated;

-- =====================================================================
-- 10. SUBMIT REPORT RPC (SERVER VERIFIED CAPTURE SUPPORT)
-- =====================================================================

create or replace function public.submit_report(
  p_title text,
  p_description text,
  p_category text,
  p_severity text,
  p_lat double precision,
  p_lon double precision,
  p_label text,
  p_media_id uuid default null,
  p_is_anonymous boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_media public.report_media;
  v_final_lat double precision := p_lat;
  v_final_lon double precision := p_lon;
  v_category text;
  v_similar record;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- If media attached, enforce verification & take location from media
  if p_media_id is not null then
    select * into v_media from public.report_media where id = p_media_id;
    if not found then
      raise exception 'attached media record not found' using errcode = 'P0002';
    end if;

    if v_media.uploaded_by <> auth.uid() then
      raise exception 'cannot attach media uploaded by another user' using errcode = '42501';
    end if;

    if not v_media.verified then
      raise exception 'unverified camera media cannot be submitted as verified proof' using errcode = '22023';
    end if;

    if v_media.lat is not null and v_media.lng is not null then
      -- Verify user didn't nudge more than 50 meters
      if st_distance(
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
        st_setsrid(st_makepoint(v_media.lng, v_media.lat), 4326)::geography
      ) > 50 then
        raise exception 'location cannot be nudged more than 50 meters from camera capture location' using errcode = '22023';
      end if;
      v_final_lat := v_media.lat;
      v_final_lon := v_media.lng;
    end if;
  end if;

  -- Validate service area
  if not public.in_service_area(v_final_lat, v_final_lon) then
    raise exception 'report location is outside the service area' using errcode = '22023';
  end if;

  select coalesce(
    max(e.enumlabel) filter (where e.enumlabel = p_category),
    max(e.enumlabel) filter (where p_category = 'water_leak' and e.enumlabel = 'water'),
    max(e.enumlabel) filter (where e.enumlabel = 'other'),
    p_category
  )
  into v_category
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'issue_category';

  insert into public.reports (
    reporter_id, title, description, category, severity,
    location, location_label, is_anonymous, status, created_at, updated_at
  )
  values (
    auth.uid(),
    left(trim(p_title), 160),
    left(trim(p_description), 4000),
    v_category,
    p_severity,
    st_setsrid(st_makepoint(v_final_lon, v_final_lat), 4326)::geography,
    left(trim(p_label), 240),
    p_is_anonymous,
    'pending',
    now(),
    now()
  )
  returning id into v_report_id;

  -- Associate media
  if p_media_id is not null then
    update public.report_media set report_id = v_report_id where id = p_media_id;
  end if;

  -- Check for auto duplicate detection (score >= 0.85, distance < 30m, same category)
  select * into v_similar
  from public.find_similar_reports(v_final_lat, v_final_lon, v_category, p_title, v_media.phash_bigint)
  where score >= 0.85 and distance_m < 30 and id <> v_report_id
  order by score desc limit 1;

  if v_similar.id is not null then
    update public.reports
    set status = 'duplicate', duplicate_of = v_similar.id
    where id = v_report_id;

    update public.reports
    set duplicate_count = duplicate_count + 1
    where id = v_similar.id;

    insert into public.report_events (report_id, actor_id, kind, message, visibility)
    values (v_report_id, auth.uid(), 'auto_duplicate', 'System marked as duplicate of report ' || v_similar.id::text, 'public');
  else
    insert into public.report_events (report_id, actor_id, kind, message, visibility)
    values (v_report_id, auth.uid(), 'created', 'Report submitted.', 'public');
  end if;

  return v_report_id;
end;
$$;
grant execute on function public.submit_report(text, text, text, text, double precision, double precision, text, uuid, boolean) to authenticated;

-- =====================================================================
-- 11. TASK STATUS TRANSITION GUARDS
-- =====================================================================

create or replace function public.update_task_status(
  p_task uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_report public.reports;
  v_is_staff boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  v_is_staff := public.auth_role() in ('admin', 'dispatcher');

  if v_task.volunteer_id <> auth.uid() and not v_is_staff then
    raise exception 'task access denied' using errcode = '42501';
  end if;

  -- Validate volunteer transition rules
  if not v_is_staff then
    if not (
      (v_task.status = 'assigned' and p_status in ('accepted', 'blocked')) or
      (v_task.status = 'accepted' and p_status in ('en_route', 'blocked')) or
      (v_task.status = 'en_route' and p_status in ('on_site', 'blocked')) or
      (v_task.status = 'on_site' and p_status in ('in_progress', 'blocked')) or
      (v_task.status = 'in_progress' and p_status in ('completed', 'blocked')) or
      (v_task.status = 'blocked' and p_status in ('accepted', 'in_progress'))
    ) then
      raise exception 'illegal task transition for volunteer: % -> %', v_task.status, p_status using errcode = '22023';
    end if;
  end if;

  update public.tasks set status = p_status, updated_at = now() where id = p_task;

  -- Advance corresponding report status
  update public.reports
  set status = case
      when p_status = 'completed' then 'resolved_pending_confirmation'
      when p_status in ('accepted', 'en_route', 'on_site', 'in_progress') then 'in_progress'
      else status
    end,
    updated_at = now()
  where id = v_task.report_id;

  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  values (v_task.report_id, auth.uid(), 'task_' || p_status, coalesce(p_note, 'Task status set to ' || p_status), 'public');
end;
$$;
grant execute on function public.update_task_status(uuid, text, text) to authenticated;

-- =====================================================================
-- 12. FEED RPC: KEYSET PAGINATED FEED
-- =====================================================================

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
  -- Keyset cursor unpack
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
        where rm.report_id = r.id order by rm.created_at asc limit 1
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
      -- Exclude duplicate and rejected by default unless specifically requested
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
        (br.created_at, br.id) < (v_cursor_time, v_cursor_id)
      when p_sort = 'nearest' and v_user_lat is not null then
        (br.dist_m, br.id) > (v_cursor_val, v_cursor_id)
      when p_sort = 'most_attested' then
        ((br.up_cnt - br.down_cnt), br.id) < (v_cursor_val::bigint, v_cursor_id)
      when p_sort = 'urgent' then
        (br.calc_priority, br.id) < (v_cursor_val, v_cursor_id)
      else
        (br.created_at, br.id) < (v_cursor_time, v_cursor_id)
    end
  order by
    case when p_sort = 'nearest' and v_user_lat is not null then br.dist_m end asc nulls last,
    case when p_sort = 'most_attested' then (br.up_cnt - br.down_cnt) end desc,
    case when p_sort = 'urgent' then br.calc_priority end desc,
    br.created_at desc,
    br.id desc
  limit coalesce(p_limit, 20);
end;
$$;
grant execute on function public.feed_reports(double precision, double precision, text, text[], text[], numeric, boolean, int, jsonb) to authenticated;

-- =====================================================================
-- 13. REALTIME PUBLICATION
-- =====================================================================

do $$ begin
  alter publication supabase_realtime add table public.report_media;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

commit;

notify pgrst, 'reload schema';
