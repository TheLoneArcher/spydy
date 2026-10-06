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
            r.status::text = any(p_status)
          else
            r.status::text not in ('duplicate', 'rejected')
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
    br.category::text,
    br.severity::text,
    br.status::text,
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
