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
    v_category::issue_category,
    p_severity,
    st_setsrid(st_makepoint(v_final_lon, v_final_lat), 4326)::geography,
    left(trim(p_label), 240),
    p_is_anonymous,
    'pending',
    now(),
    now()
  )
  returning id into v_report_id;

  if p_media_id is not null then
    update public.report_media set report_id = v_report_id where id = p_media_id;
  end if;

  select * into v_similar
  from public.find_similar_reports(v_final_lat, v_final_lon, v_category, p_title, coalesce(v_media.phash_bigint, 0))
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

  update public.reports
  set status = (case
      when p_status = 'completed' then 'resolved_pending_confirmation'::text
      when p_status in ('accepted', 'en_route', 'on_site', 'in_progress') then 'in_progress'::text
      else status::text
    end)::report_status,
    updated_at = now()
  where id = v_task.report_id;

  insert into public.report_events (report_id, actor_id, kind, message, visibility)
  values (v_task.report_id, auth.uid(), 'task_' || p_status, coalesce(p_note, 'Task status set to ' || p_status), 'public');
end;
$$;
