import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const connectionString = process.env.DATABASE_URL;
const password = process.env.DEMO_PASSWORD || 'password';

if (!url || !serviceRoleKey || !connectionString) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL are required.');
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const accounts = [
  { email: 'admin@responsys.com', name: 'ResponSys Admin', role: 'admin' },
  { email: 'dispatcher@responsys.com', name: 'Asha Dispatcher', role: 'dispatcher' },
  { email: 'volunteer@responsys.com', name: 'Ravi Volunteer', role: 'civilian' },
  { email: 'civilian@responsys.com', name: 'Maya Civilian', role: 'civilian' },
];

async function ensureUser(account) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = listed.users.find(user => user.email?.toLowerCase() === account.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: account.name },
  });
  if (error || !data.user) throw error || new Error(`Could not create ${account.email}`);
  return data.user;
}

async function main() {
  await db.connect();
  const users = {};
  for (const account of accounts) {
    users[account.email] = await ensureUser(account);
  }

  for (const account of accounts) {
    const user = users[account.email];
    const { error } = await admin.from('profiles').upsert({
      id: user.id,
      full_name: account.name,
      role: account.role,
      is_active: true,
    });
    if (error) throw error;
  }

  const volunteerId = users['volunteer@responsys.com'].id;
  const dispatcherId = users['dispatcher@responsys.com'].id;
  const civilianId = users['civilian@responsys.com'].id;

  await db.query(`
    insert into public.volunteer_profiles (user_id, skills, location, on_duty, max_radius_km)
    values ($1, array['logistics', 'heavy_lifting']::public.skill_type[], st_setsrid(st_makepoint(72.8777, 19.0760), 4326)::geography, true, 20)
    on conflict (user_id) do update set skills = excluded.skills, location = excluded.location, on_duty = true;

    insert into public.reports (reporter_id, title, description, category, severity, status, location, location_label)
    values
      ($2, 'Large pothole on MG Road', 'Deep pothole causing traffic danger near the main crossing.', 'pothole', 'critical', 'pending', st_setsrid(st_makepoint(72.8258, 18.9322), 4326)::geography, 'MG Road, South Mumbai'),
      ($3, 'Broken streetlight on Linking Road', 'Streetlight has been dark since last night.', 'streetlight', 'moderate', 'assigned', st_setsrid(st_makepoint(72.8347, 19.0660), 4326)::geography, 'Linking Road, Bandra'),
      ($3, 'Overflowing garbage bin near Andheri Station', 'Waste is spilling onto the pavement.', 'garbage', 'critical', 'pending', st_setsrid(st_makepoint(72.8465, 19.1197), 4326)::geography, 'Andheri East Station'),
      ($2, 'Blocked drainage at Juhu Beach Road', 'Blocked drain is causing waterlogging after rain.', 'drainage', 'moderate', 'pending', st_setsrid(st_makepoint(72.8267, 19.1075), 4326)::geography, 'Juhu Beach Road')
    on conflict do nothing;

    insert into public.tasks (report_id, volunteer_id, assigned_by, status, notes)
    select r.id, $1, $4, 'assigned', 'Demo assignment created by the seed script.'
    from public.reports r
    where r.title = 'Broken streetlight on Linking Road'
      and not exists (select 1 from public.tasks t where t.report_id = r.id);

    insert into public.report_events (report_id, actor_id, kind, message)
    select r.id, $4, 'assigned', 'Demo task assigned to Ravi Volunteer.'
    from public.reports r
    where r.title = 'Broken streetlight on Linking Road'
      and not exists (select 1 from public.report_events e where e.report_id = r.id and e.kind = 'assigned');

    insert into public.resources (name, category, quantity_total, quantity_available, location_label, managed_by)
    values ('First aid kits', 'medical_supply', 20, 15, 'Command Center', $4),
           ('Municipal waste truck', 'vehicle', 5, 3, 'Andheri Depot', $4)
    on conflict do nothing;
  `, [volunteerId, civilianId, civilianId, dispatcherId]);

  console.log('Demo accounts and records are ready. Password:', password);
  console.log(accounts.map(account => `${account.role}: ${account.email}`).join('\n'));
}

try {
  await main();
} finally {
  await db.end();
}
