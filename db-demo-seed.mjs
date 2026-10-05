import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD || 'password';
if (!url || !serviceRoleKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const box = { minLat: 13.55, maxLat: 13.72, minLon: 79.33, maxLon: 79.58 };
const accounts = [
  { email: 'admin@responsys.com', name: 'ResponSys Admin', role: 'admin' },
  { email: 'dispatcher@responsys.com', name: 'Asha Dispatcher', role: 'dispatcher' },
  { email: 'volunteer@responsys.com', name: 'Ravi Volunteer', role: 'civilian' },
  { email: 'civilian@responsys.com', name: 'Maya Civilian', role: 'civilian' },
  { email: 'citizen.one@responsys.com', name: 'Kiran Rao', role: 'civilian' },
  { email: 'citizen.two@responsys.com', name: 'Anita Devi', role: 'civilian' },
  { email: 'volunteer.two@responsys.com', name: 'Suresh Kumar', role: 'civilian' },
];

const reports = [
  ['bus-stand-pothole-a', 'Deep pothole at Tirupati bus stand', 'pothole', 'critical', 'pending', 13.6287, 79.4198, 'Tirupati bus stand'],
  ['bus-stand-pothole-b', 'Pothole beside the bus stand crossing', 'pothole', 'critical', 'pending', 13.6289, 79.4196, 'Tirupati bus stand'],
  ['bus-stand-pothole-c', 'Road crater near bus stand entrance', 'pothole', 'moderate', 'triaged', 13.6288, 79.4197, 'Tirupati bus stand'],
  ['renigunta-light-a', 'Streetlight out on Renigunta Road', 'streetlight', 'moderate', 'assigned', 13.6355, 79.5129, 'Renigunta Road'],
  ['renigunta-light-b', 'Dark streetlight near Renigunta Road', 'streetlight', 'moderate', 'assigned', 13.6356, 79.5130, 'Renigunta Road'],
  ['renigunta-light-c', 'Streetlight failure by the station turn', 'streetlight', 'low', 'in_progress', 13.6354, 79.5128, 'Renigunta Road'],
  ['alipiri-garbage', 'Overflowing garbage near Alipiri Gate', 'garbage', 'critical', 'in_progress', 13.6350, 79.4067, 'Alipiri Gate'],
  ['renigunta-drain', 'Blocked drain near Renigunta railway station', 'drainage', 'moderate', 'resolved_pending_confirmation', 13.6366, 79.5122, 'Renigunta railway station'],
  ['tiruchanur-water', 'Water leakage near Tiruchanur junction', 'water_leakage', 'critical', 'closed', 13.6132, 79.4566, 'Tiruchanur junction'],
  ['air-bypass-road', 'Broken shoulder on Air Bypass Road', 'road_damage', 'moderate', 'pending', 13.6370, 79.4290, 'Air Bypass Road'],
  ['leela-mahal-light', 'Flickering light at Leela Mahal Circle', 'streetlight', 'low', 'pending', 13.6358, 79.4234, 'Leela Mahal Circle'],
  ['korlagunta-garbage', 'Garbage collection missed in Korlagunta', 'garbage', 'moderate', 'triaged', 13.6425, 79.4208, 'Korlagunta'],
  ['tirumala-bypass-pothole', 'Potholes on Tirumala bypass', 'pothole', 'critical', 'assigned', 13.6500, 79.4030, 'Tirumala bypass'],
  ['svu-drainage', 'Water pooling near SV University', 'drainage', 'moderate', 'reopened', 13.6265, 79.3535, 'SV University area'],
  ['gandhi-road-light', 'Streetlight out on Gandhi Road', 'streetlight', 'low', 'closed', 13.6313, 79.4218, 'Gandhi Road'],
  ['airport-road-water', 'Leaking pipe on Tirupati airport road', 'water_leakage', 'critical', 'disputed', 13.6280, 79.5450, 'Tirupati airport road'],
  ['airport-road-garbage', 'Dumped waste along airport road', 'garbage', 'moderate', 'pending', 13.6273, 79.5429, 'Tirupati airport road'],
  ['market-drain', 'Blocked drain by the central market', 'drainage', 'moderate', 'pending', 13.6310, 79.4160, 'Central market'],
  ['railway-pothole', 'Uneven road outside Tirupati station', 'road_damage', 'moderate', 'in_progress', 13.6350, 79.4190, 'Tirupati railway station'],
  ['kapila-garbage', 'Overflowing bin near Kapila Theertham', 'garbage', 'low', 'closed', 13.6377, 79.4052, 'Kapila Theertham'],
  ['madanapalle-light', 'Dark lamp near the west approach', 'streetlight', 'low', 'pending', 13.6310, 79.4080, 'West approach road'],
  ['svu-pothole', 'Pothole at SV University gate', 'pothole', 'critical', 'pending', 13.6280, 79.3540, 'SV University gate'],
  ['tata-nagar-water', 'Water seepage in Tata Nagar', 'water_leakage', 'moderate', 'triaged', 13.6230, 79.4160, 'Tata Nagar'],
  ['renigunta-road-drain', 'Drain overflow after rain', 'drainage', 'critical', 'assigned', 13.6380, 79.5200, 'Renigunta Road'],
  ['airport-road-shoulder', 'Damaged shoulder near the airport turn', 'road_damage', 'low', 'resolved_pending_confirmation', 13.6260, 79.5490, 'Airport road turn'],
];

const point = (lon, lat) => ({ type: 'Point', coordinates: [lon, lat] });
const age = hours => new Date(Date.now() - hours * 3600000).toISOString();

async function ensureUser(account) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find(user => user.email?.toLowerCase() === account.email);
  if (existing) return existing;
  const created = await admin.auth.admin.createUser({ email: account.email, password, email_confirm: true, user_metadata: { full_name: account.name } });
  if (created.error || !created.data.user) throw created.error || new Error(`Could not create ${account.email}`);
  return created.data.user;
}

async function main() {
  const users = Object.fromEntries(await Promise.all(accounts.map(async account => [account.email, await ensureUser(account)])));
  let result = await admin.from('profiles').upsert(accounts.map(account => ({ id: users[account.email].id, full_name: account.name, role: account.role, is_active: true })), { onConflict: 'id' });
  if (result.error) throw result.error;

  const { data: existingReports, error: listError } = await admin.from('reports').select('id, location, seed_key');
  if (listError) throw listError;
  const outsideIds = (existingReports ?? []).filter(row => {
    const coords = row.location?.coordinates;
    return Array.isArray(coords) && (coords[1] < box.minLat || coords[1] > box.maxLat || coords[0] < box.minLon || coords[0] > box.maxLon);
  }).map(row => row.id);
  if (outsideIds.length) {
    result = await admin.from('reports').delete().in('id', outsideIds);
    if (result.error) throw result.error;
  }
  result = await admin.from('reports').delete().in('title', ['Large pothole on MG Road', 'Broken streetlight on Linking Road', 'Overflowing garbage bin near Andheri Station', 'Blocked drainage at Juhu Beach Road']);
  if (result.error) throw result.error;
  result = await admin.from('resources').delete().in('location_label', ['Command Center', 'Andheri Depot']);
  if (result.error) throw result.error;

  const reporterIds = accounts.filter(account => account.role === 'civilian').map(account => users[account.email].id);
  const reportRows = reports.map(([seed_key, title, category, severity, status, lat, lon, location_label], index) => ({
    seed_key, title, description: `${title}. Residents have asked for a response in this area.`, category, severity, status,
    reporter_id: reporterIds[index % reporterIds.length], location: point(lon, lat), location_label,
    created_at: age((index % 18) * 6 + 1), updated_at: age((index % 6) * 2),
  }));
  result = await admin.from('reports').upsert(reportRows, { onConflict: 'seed_key' }).select('id, seed_key');
  if (result.error) throw result.error;
  const ids = Object.fromEntries(result.data.map(row => [row.seed_key, row.id]));

  const volunteer = users['volunteer@responsys.com'].id;
  const dispatcher = users['dispatcher@responsys.com'].id;
  result = await admin.from('volunteer_profiles').upsert([
    { user_id: volunteer, skills: ['logistics', 'heavy_lifting'], location: point(79.4192, 13.6288), on_duty: true, max_radius_km: 20 },
    { user_id: users['volunteer.two@responsys.com'].id, skills: ['logistics'], location: point(79.512, 13.636), on_duty: true, max_radius_km: 15 },
  ], { onConflict: 'user_id' });
  if (result.error) throw result.error;

  result = await admin.from('report_votes').upsert([
    { report_id: ids['bus-stand-pothole-a'], user_id: users['civilian@responsys.com'].id, value: 1 },
    { report_id: ids['bus-stand-pothole-a'], user_id: users['citizen.one@responsys.com'].id, value: 1 },
    { report_id: ids['airport-road-water'], user_id: users['citizen.two@responsys.com'].id, value: -1 },
    { report_id: ids['renigunta-drain'], user_id: users['civilian@responsys.com'].id, value: 1 },
  ], { onConflict: 'report_id,user_id' });
  if (result.error) throw result.error;
  result = await admin.from('resolution_confirmations').upsert({ report_id: ids['renigunta-drain'], user_id: users['civilian@responsys.com'].id, agrees: true, verdict: 'confirmed' }, { onConflict: 'report_id,user_id' });
  if (result.error) throw result.error;

  result = await admin.from('tasks').upsert([
    { report_id: ids['renigunta-light-a'], volunteer_id: volunteer, assigned_by: dispatcher, status: 'assigned', notes: 'Inspect the streetlight and confirm the power fault.' },
    { report_id: ids['alipiri-garbage'], volunteer_id: users['volunteer.two@responsys.com'].id, assigned_by: dispatcher, status: 'in_progress', notes: 'Coordinate pickup with the local sanitation team.' },
    { report_id: ids['renigunta-drain'], volunteer_id: volunteer, assigned_by: dispatcher, status: 'completed', notes: 'Drain cleared; awaiting citizen confirmation.' },
  ], { onConflict: 'report_id' }).select('id, report_id');
  if (result.error) throw result.error;
  const reniguntaTask = result.data.find(row => row.report_id === ids['renigunta-drain']);
  if (reniguntaTask) {
    result = await admin.from('task_updates').delete().eq('task_id', reniguntaTask.id);
    if (result.error) throw result.error;
    result = await admin.from('task_updates').insert([
      { task_id: reniguntaTask.id, author_id: volunteer, status: 'accepted', note: 'Accepted the assignment.', created_at: age(8) },
      { task_id: reniguntaTask.id, author_id: volunteer, status: 'on_site', note: 'On site at the railway station drain.', created_at: age(5) },
      { task_id: reniguntaTask.id, author_id: volunteer, status: 'completed', note: 'Cleared the blockage and checked water flow.', created_at: age(1) },
    ]);
    if (result.error) throw result.error;
  }

  result = await admin.from('report_events').delete().in('report_id', reports.slice(0, 8).map(([seed_key]) => ids[seed_key]));
  if (result.error) throw result.error;
  result = await admin.from('report_events').insert(reports.slice(0, 8).map(([seed_key], index) => ({ report_id: ids[seed_key], actor_id: dispatcher, kind: index % 2 ? 'triaged' : 'created', message: index % 2 ? 'Reviewed by dispatch.' : 'Seeded demo report.', created_at: age(index + 1) })));
  if (result.error) throw result.error;
  result = await admin.from('resources').upsert([
    { seed_key: 'first-aid-kits', name: 'First aid kits', category: 'medical_supply', quantity_total: 20, quantity_available: 15, location_label: 'Tirupati command center', managed_by: dispatcher },
    { seed_key: 'waste-truck', name: 'Municipal waste truck', category: 'vehicle', quantity_total: 5, quantity_available: 3, location_label: 'Renigunta depot', managed_by: dispatcher },
  ], { onConflict: 'seed_key' });
  if (result.error) throw result.error;

  console.log(`Seeded ${reports.length} Andhra Pradesh reports, demo accounts, tasks, updates, events, and resources.`);
  console.log(accounts.map(account => `${account.role}: ${account.email}`).join('\n'));
}

await main();
