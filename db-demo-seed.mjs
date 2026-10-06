import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Guard: Require ALLOW_DEMO_SEED=1
if (process.env.ALLOW_DEMO_SEED !== '1') {
  console.error('Error: ALLOW_DEMO_SEED=1 environment variable is required to run the demo seed.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD || process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'ResponSys2026!';

if (!url || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

// Safety check: refuse when Supabase URL does not match localhost or DEMO_SEED_ALLOWED_PROJECT_REF
const allowedRefs = (process.env.DEMO_SEED_ALLOWED_PROJECT_REF || '').split(',').map(s => s.trim()).filter(Boolean);
const parsedUrl = new URL(url);
const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
const matchesAllowedRef = allowedRefs.some(ref => parsedUrl.hostname.includes(ref));

if (!isLocalhost && !matchesAllowedRef && !process.env.FORCE_DEMO_SEED) {
  console.error(
    `Error: Refusing to seed non-localhost URL (${parsedUrl.hostname}) without matching DEMO_SEED_ALLOWED_PROJECT_REF.`
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const must = async (promise) => {
  const result = await promise;
  if (result.error) throw result.error;
  return result;
};

const accounts = [
  { email: 'admin@responsys.test', name: 'ResponSys Admin', role: 'admin' },
  { email: 'dispatcher@responsys.test', name: 'Asha Dispatcher', role: 'dispatcher' },
  { email: 'volunteer@responsys.test', name: 'Ravi Road Specialist', role: 'civilian' },
  { email: 'volunteer2@responsys.test', name: 'Priya Electrical Tech', role: 'civilian' },
  { email: 'volunteer3@responsys.test', name: 'Karthik Water Specialist', role: 'civilian' },
  { email: 'applicant@responsys.test', name: 'Vikram Volunteer Applicant', role: 'civilian' },
  { email: 'civilian@responsys.test', name: 'Maya Citizen', role: 'civilian' },
  { email: 'citizen.one@responsys.test', name: 'Kiran Rao', role: 'civilian' },
  { email: 'citizen.two@responsys.test', name: 'Anita Devi', role: 'civilian' },
];

const point = (lon, lat) => `SRID=4326;POINT(${lon} ${lat})`;
const age = hours => new Date(Date.now() - hours * 3600000).toISOString();

async function ensureUser(account) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find(u => u.email?.toLowerCase() === account.email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });
    return existing;
  }
  const created = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: account.name },
  });
  if (created.error || !created.data.user) {
    throw created.error || new Error(`Could not create ${account.email}`);
  }
  return created.data.user;
}

// 40 reports around Tirupati across the 4 SC-01 categories with 6 duplicate clusters
const reportDefinitions = [
  // Cluster 1: Bus stand pothole (Parent + 2 dups)
  { key: 'bus-stand-pothole-parent', title: 'Large dangerous pothole at Tirupati bus stand bay 3', cat: 'pothole', sev: 'critical', st: 'assigned', lat: 13.6288, lon: 79.4197, loc: 'Tirupati Central Bus Stand', img: 'pothole-1.jpg' },
  { key: 'bus-stand-pothole-dup1', title: 'Deep crater on road near bus stand bay 3', cat: 'pothole', sev: 'critical', st: 'duplicate', lat: 13.6289, lon: 79.4196, loc: 'Tirupati Bus Stand Bay 3', dupOf: 'bus-stand-pothole-parent', img: 'pothole-2.jpg' },
  { key: 'bus-stand-pothole-dup2', title: 'Severe asphalt depression bus stand entry', cat: 'pothole', sev: 'moderate', st: 'duplicate', lat: 13.6287, lon: 79.4198, loc: 'Tirupati Bus Stand Entry', dupOf: 'bus-stand-pothole-parent', img: 'pothole-3.jpg' },

  // Cluster 2: Renigunta streetlight outage (Parent + 2 dups)
  { key: 'renigunta-light-parent', title: 'Streetlight pole #42 completely dark on Renigunta road', cat: 'streetlight', sev: 'moderate', st: 'assigned', lat: 13.6355, lon: 79.5129, loc: 'Renigunta Main Road', img: 'streetlight-1.jpg' },
  { key: 'renigunta-light-dup1', title: 'Non-functional street light on Renigunta road near pole 42', cat: 'streetlight', sev: 'moderate', st: 'duplicate', lat: 13.6356, lon: 79.5130, loc: 'Renigunta Road Pole 42', dupOf: 'renigunta-light-parent', img: 'streetlight-2.jpg' },
  { key: 'renigunta-light-dup2', title: 'Dark lamp near Renigunta station turn', cat: 'streetlight', sev: 'low', st: 'duplicate', lat: 13.6354, lon: 79.5128, loc: 'Renigunta Station Turn', dupOf: 'renigunta-light-parent', img: 'streetlight-3.jpg' },

  // Cluster 3: Alipiri garbage pile (Parent + 1 dup)
  { key: 'alipiri-garbage-parent', title: 'Overflowing municipal waste bin near Alipiri Gate entrance', cat: 'garbage', sev: 'critical', st: 'in_progress', lat: 13.6350, lon: 79.4067, loc: 'Alipiri Gate Entrance', img: 'garbage-1.jpg' },
  { key: 'alipiri-garbage-dup1', title: 'Huge garbage heap spilling on road at Alipiri Gate', cat: 'garbage', sev: 'critical', st: 'duplicate', lat: 13.6351, lon: 79.4068, loc: 'Alipiri Gate Entrance', dupOf: 'alipiri-garbage-parent', img: 'garbage-2.jpg' },

  // Cluster 4: Tiruchanur water main leak (Parent + 1 dup)
  { key: 'tiruchanur-water-parent', title: 'High-pressure water main pipe burst at Tiruchanur junction', cat: 'water_leak', sev: 'critical', st: 'in_progress', lat: 13.6132, lon: 79.4566, loc: 'Tiruchanur Junction', img: 'water-1.jpg' },
  { key: 'tiruchanur-water-dup1', title: 'Flooding from broken drinking water pipeline Tiruchanur junction', cat: 'water_leak', sev: 'critical', st: 'duplicate', lat: 13.6133, lon: 79.4567, loc: 'Tiruchanur Road', dupOf: 'tiruchanur-water-parent', img: 'water-2.jpg' },

  // Cluster 5: SV University road crater (Parent + 1 dup)
  { key: 'svu-pothole-parent', title: 'Deep road crater outside Sri Venkateswara University gate', cat: 'pothole', sev: 'critical', st: 'triaged', lat: 13.6280, lon: 79.3540, loc: 'SV University Main Gate', img: 'pothole-3.jpg' },
  { key: 'svu-pothole-dup1', title: 'Hazardous pothole right at SV University entrance', cat: 'pothole', sev: 'critical', st: 'duplicate', lat: 13.6281, lon: 79.3541, loc: 'SV University Main Gate', dupOf: 'svu-pothole-parent', img: 'pothole-1.jpg' },

  // Cluster 6: Korlagunta commercial waste (Parent + 1 dup)
  { key: 'korlagunta-garbage-parent', title: 'Accumulated commercial solid waste along Korlagunta road', cat: 'garbage', sev: 'moderate', st: 'triaged', lat: 13.6425, lon: 79.4208, loc: 'Korlagunta Commercial Area', img: 'garbage-3.jpg' },
  { key: 'korlagunta-garbage-dup1', title: 'Dumped commercial trash blocking sidewalk in Korlagunta', cat: 'garbage', sev: 'moderate', st: 'duplicate', lat: 13.6426, lon: 79.4209, loc: 'Korlagunta Sidewalk', dupOf: 'korlagunta-garbage-parent', img: 'garbage-1.jpg' },

  // Individual Reports across categories:
  { key: 'air-bypass-pothole', title: 'Broken asphalt shoulder on Air Bypass Road', cat: 'pothole', sev: 'moderate', st: 'pending', lat: 13.6370, lon: 79.4290, loc: 'Air Bypass Road', img: 'pothole-2.jpg' },
  { key: 'leela-mahal-light', title: 'Flickering high-mast lamp at Leela Mahal Circle', cat: 'streetlight', sev: 'low', st: 'pending', lat: 13.6358, lon: 79.4234, loc: 'Leela Mahal Circle', img: 'streetlight-2.jpg' },
  { key: 'tirumala-bypass-pothole', title: 'Consecutive potholes on Tirumala Bypass descent', cat: 'pothole', sev: 'critical', st: 'triaged', lat: 13.6500, lon: 79.4030, loc: 'Tirumala Bypass Descent', img: 'pothole-1.jpg' },
  { key: 'airport-road-water', title: 'Leaking distribution pipe spraying on Airport road', cat: 'water_leak', sev: 'critical', st: 'reopened', lat: 13.6280, lon: 79.5450, loc: 'Tirupati Airport Road', img: 'water-3.jpg' },
  { key: 'airport-road-garbage', title: 'Illegally dumped construction debris along Airport road', cat: 'garbage', sev: 'moderate', st: 'pending', lat: 13.6273, lon: 79.5429, loc: 'Airport Road Km 4', img: 'garbage-2.jpg' },
  { key: 'market-water-leak', title: 'Water leakage from municipal valve near central market', cat: 'water_leak', sev: 'moderate', st: 'pending', lat: 13.6310, lon: 79.4160, loc: 'Tirupati Central Market', img: 'water-1.jpg' },
  { key: 'railway-pothole', title: 'Uneven sunken asphalt outside Tirupati railway station', cat: 'pothole', sev: 'moderate', st: 'in_progress', lat: 13.6350, lon: 79.4190, loc: 'Tirupati Railway Station West', img: 'pothole-3.jpg' },
  { key: 'kapila-garbage', title: 'Overflowing public trash receptacle near Kapila Theertham', cat: 'garbage', sev: 'low', st: 'closed', lat: 13.6377, lon: 79.4052, loc: 'Kapila Theertham Footpath', img: 'garbage-3.jpg' },
  { key: 'madanapalle-light', title: 'Dark sodium lamp near West approach highway', cat: 'streetlight', sev: 'low', st: 'pending', lat: 13.6310, lon: 79.4080, loc: 'West Approach Road', img: 'streetlight-3.jpg' },
  { key: 'tata-nagar-water', title: 'Drinking water pipeline joint seepage in Tata Nagar', cat: 'water_leak', sev: 'moderate', st: 'resolved_pending_confirmation', lat: 13.6230, lon: 79.4160, loc: 'Tata Nagar Lane 2', img: 'water-2.jpg' },
  { key: 'renigunta-road-drain', title: 'Damaged culvert with water overflow near Renigunta', cat: 'water_leak', sev: 'critical', st: 'assigned', lat: 13.6380, lon: 79.5200, loc: 'Renigunta Highway Cross', img: 'water-3.jpg' },
  { key: 'gandhi-road-light', title: 'Broken bracket on streetlight pole Gandhi Road', cat: 'streetlight', sev: 'low', st: 'closed', lat: 13.6313, lon: 79.4218, loc: 'Gandhi Road North', img: 'streetlight-1.jpg' },
  { key: 'bhavani-nagar-pothole', title: 'Edge collapse pothole on Bhavani Nagar main road', cat: 'pothole', sev: 'moderate', st: 'pending', lat: 13.6210, lon: 79.4250, loc: 'Bhavani Nagar Main Road', img: 'pothole-2.jpg' },
  { key: 'annamayya-light', title: 'Unlit street segment at Annamayya Circle intersection', cat: 'streetlight', sev: 'moderate', st: 'triaged', lat: 13.6295, lon: 79.4210, loc: 'Annamayya Circle', img: 'streetlight-2.jpg' },
  { key: 'maruti-nagar-garbage', title: 'Uncollected domestic waste pile at Maruti Nagar junction', cat: 'garbage', sev: 'moderate', st: 'pending', lat: 13.6340, lon: 79.4320, loc: 'Maruti Nagar Junction', img: 'garbage-1.jpg' },
  { key: 'subramanya-water', title: 'Sub-surface water pipe fracture lifting asphalt slab', cat: 'water_leak', sev: 'critical', st: 'assigned', lat: 13.6250, lon: 79.4180, loc: 'Subramanya Nagar', img: 'water-1.jpg' },
  { key: 'padmavathi-pothole', title: 'Severe road gouge near Sri Padmavathi Mahila Visvavidyalayam', cat: 'pothole', sev: 'moderate', st: 'triaged', lat: 13.6320, lon: 79.3980, loc: 'SPMVV Campus Road', img: 'pothole-1.jpg' },
  { key: 'isckon-road-light', title: 'Fallen overhead streetlight cable on ISKCON temple road', cat: 'streetlight', sev: 'critical', st: 'assigned', lat: 13.6450, lon: 79.4120, loc: 'ISKCON Temple Road', img: 'streetlight-3.jpg' },
  { key: 'kt-road-garbage', title: 'Heavy garbage accumulation near KT road vegetable market', cat: 'garbage', sev: 'critical', st: 'in_progress', lat: 13.6385, lon: 79.4215, loc: 'KT Road Market', img: 'garbage-2.jpg' },
  { key: 'ramanuja-water', title: 'Continuous clean water seepage from buried main', cat: 'water_leak', sev: 'moderate', st: 'pending', lat: 13.6260, lon: 79.4290, loc: 'Ramanuja Circle', img: 'water-2.jpg' },
  { key: 'chandragiri-pothole', title: 'Wide pavement trench on Chandragiri bypass exit', cat: 'pothole', sev: 'critical', st: 'pending', lat: 13.6180, lon: 79.3820, loc: 'Chandragiri Bypass', img: 'pothole-3.jpg' },
  { key: 'tilak-road-light', title: 'Streetlight knocked down by vehicle impact on Tilak Road', cat: 'streetlight', sev: 'critical', st: 'triaged', lat: 13.6300, lon: 79.4150, loc: 'Tilak Road Corner', img: 'streetlight-1.jpg' },
  { key: 'nehru-nagar-garbage', title: 'Plastic and organic refuse strewn over vacant plot', cat: 'garbage', sev: 'low', st: 'closed', lat: 13.6240, lon: 79.4350, loc: 'Nehru Nagar Plot 14', img: 'garbage-3.jpg' },
  { key: 'settipalli-water', title: 'Borewell connection line leaking across Settipalli lane', cat: 'water_leak', sev: 'low', st: 'pending', lat: 13.6410, lon: 79.4500, loc: 'Settipalli Lane 3', img: 'water-3.jpg' },
  { key: 'karakambadi-pothole', title: 'Series of deep monsoon potholes on Karakambadi road', cat: 'pothole', sev: 'critical', st: 'assigned', lat: 13.6520, lon: 79.4600, loc: 'Karakambadi Industrial Road', img: 'pothole-2.jpg' },
  { key: 'zoological-light', title: 'Defective timer causing daytime burning and night outage', cat: 'streetlight', sev: 'low', st: 'pending', lat: 13.6100, lon: 79.3700, loc: 'SV Zoo Park Approach', img: 'streetlight-2.jpg' },
  { key: 'autonagar-garbage', title: 'Industrial scrap and packaging dumped by roadway', cat: 'garbage', sev: 'moderate', st: 'resolved_pending_confirmation', lat: 13.6150, lon: 79.4400, loc: 'Autonagar Phase 1', img: 'garbage-1.jpg' },
  { key: 'daminedu-water', title: 'Underground pipeline rupture eroding road base in Daminedu', cat: 'water_leak', sev: 'critical', st: 'in_progress', lat: 13.6080, lon: 79.4700, loc: 'Daminedu Village Road', img: 'water-1.jpg' },
];

async function seedStorageMedia(users) {
  const demoDir = path.resolve(process.cwd(), 'public', 'demo');
  if (!fs.existsSync(demoDir)) return {};

  const files = fs.readdirSync(demoDir).filter(f => f.endsWith('.jpg'));
  const uploadedPaths = {};

  for (const file of files) {
    const filePath = path.join(demoDir, file);
    const buffer = fs.readFileSync(filePath);
    const storagePath = `demo/${file}`;

    try {
      const { error } = await admin.storage.from('report-media').upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      uploadedPaths[file] = storagePath;
    } catch {
      // If storage bucket is not available in mock/local, keep relative path
      uploadedPaths[file] = `/demo/${file}`;
    }
  }

  return uploadedPaths;
}

async function main() {
  console.log('--- Initializing ResponSys Demo Database Seed ---');
  console.log(`Target: ${url}`);

  // 1. Ensure accounts
  const users = {};
  for (const account of accounts) {
    const user = await ensureUser(account);
    users[account.email] = user;
  }

  // 2. Upsert profiles
  const profileRows = accounts.map(a => ({
    id: users[a.email].id,
    full_name: a.name,
    role: a.role,
    is_active: true,
  }));
  const { error: profErr } = await admin.from('profiles').upsert(profileRows, { onConflict: 'id' });
  if (profErr) throw profErr;

  // 3. Ensure skills in public.skills
  const skillsList = [
    { slug: 'first_aid', label: 'First Aid' },
    { slug: 'electrical', label: 'Electrical Repair' },
    { slug: 'plumbing', label: 'Plumbing & Drainage' },
    { slug: 'road_repair', label: 'Road & Pavement Repair' },
    { slug: 'waste_handling', label: 'Waste Clearance & Sanitation' },
    { slug: 'driving', label: 'Driving & Transport' },
    { slug: 'logistics', label: 'Logistics & Dispatch' },
    { slug: 'languages', label: 'Languages & Translation' },
    { slug: 'heavy_lifting', label: 'Heavy Lifting' },
    { slug: 'tech_support', label: 'Tech & Communications' },
  ];
  await must(admin.from('skills').upsert(skillsList, { onConflict: 'slug' }));

  // 4. Seed 3 Volunteers with distinct skills
  const v1 = users['volunteer@responsys.test'].id;
  const v2 = users['volunteer2@responsys.test'].id;
  const v3 = users['volunteer3@responsys.test'].id;
  const dispatcherId = users['dispatcher@responsys.test'].id;

  await must(admin.from('volunteer_profiles').upsert([
    { user_id: v1, skills: ['road_repair', 'waste_handling'], location: point(79.4192, 13.6288), on_duty: true, max_radius_km: 25 },
    { user_id: v2, skills: ['electrical', 'tech_support'], location: point(79.5120, 13.6360), on_duty: true, max_radius_km: 20 },
    { user_id: v3, skills: ['plumbing', 'logistics'], location: point(79.4560, 13.6130), on_duty: true, max_radius_km: 15 },
  ], { onConflict: 'user_id' }));

  // 5. Seed 1 pending volunteer application
  const applicantId = users['applicant@responsys.test'].id;
  await must(admin.from('volunteer_applications').upsert([
    {
      user_id: applicantId,
      motivation: 'I want to help Tirupati municipal corporation rapidly respond to hazardous civic issues and potholes in my community.',
      availability: { monday: ['morning', 'evening'], wednesday: ['evening'], saturday: ['full_day'] },
      radius_km: 15,
      location: point(79.4200, 13.6300),
      phone: '+919876543210',
      status: 'pending',
    },
  ], { onConflict: 'user_id' }));

  // 6. Seed media files
  const mediaPaths = await seedStorageMedia(users);

  // 7. Seed 40 reports
  const civilianEmails = accounts.filter(a => a.role === 'civilian' && !a.email.startsWith('volunteer') && a.email !== 'applicant@responsys.test').map(a => a.email);
  const reportsToInsert = [];

  for (let i = 0; i < reportDefinitions.length; i++) {
    const def = reportDefinitions[i];
    const reporterEmail = civilianEmails[i % civilianEmails.length];
    reportsToInsert.push({
      seed_key: def.key,
      title: def.title,
      description: `${def.title}. Verified by municipal sensor triangulation and local citizen reporting. Immediate civic response recommended.`,
      category: def.cat,
      severity: def.sev,
      status: def.st,
      reporter_id: users[reporterEmail].id,
      location: point(def.lon, def.lat),
      location_label: def.loc,
      created_at: age((i % 24) * 3 + 2),
      updated_at: age((i % 6) + 1),
    });
  }

  const { data: insertedReports, error: rptErr } = await admin
    .from('reports')
    .upsert(reportsToInsert, { onConflict: 'seed_key' })
    .select('id, seed_key');
  if (rptErr) throw rptErr;

  const idMap = Object.fromEntries(insertedReports.map(r => [r.seed_key, r.id]));

  // 8. Link duplicate relationships for the 6 duplicate clusters
  const duplicateCounts = new Map();
  for (const def of reportDefinitions) {
    if (def.dupOf && idMap[def.dupOf]) {
      const dupId = idMap[def.key];
      const parentId = idMap[def.dupOf];
      await must(admin.from('reports').update({ duplicate_of: parentId, status: 'duplicate' }).eq('id', dupId));
      duplicateCounts.set(parentId, (duplicateCounts.get(parentId) || 0) + 1);
    }
  }
  for (const [parentId, count] of duplicateCounts) {
    await must(admin.from('reports').update({ duplicate_count: count }).eq('id', parentId));
  }

  // 9. Seed report_media records
  const mediaRows = [];
  for (const def of reportDefinitions) {
    const reportId = idMap[def.key];
    const storagePath = mediaPaths[def.img] || `/demo/${def.img}`;
    mediaRows.push({
      report_id: reportId,
      uploaded_by: users['civilian@responsys.test'].id,
      kind: 'original',
      storage_path: storagePath,
      verified: true,
      lat: def.lat,
      lng: def.lon,
      accuracy_m: 4.2,
      captured_at: age(12),
      exif_stripped: true,
      phash_bigint: (1234567890123456n + BigInt(reportDefinitions.indexOf(def))).toString(),
      ai_confidence: 0.94,
      ai_model: 'google/gemini-2.0-flash-001',
      ai_label: { category: def.cat, confidence: 0.94, severity: def.sev },
    });
  }
  // Delete old media rows for these reports and insert new
  const reportIds = Object.values(idMap);
  await must(admin.from('report_media').delete().in('report_id', reportIds));
  await must(admin.from('report_media').insert(mediaRows));

  // 10. Seed Tasks & Assignments
  const tasksToSeed = [
    {
      report_id: idMap['bus-stand-pothole-parent'],
      volunteer_id: v1,
      assigned_by: dispatcherId,
      status: 'accepted',
      notes: 'Fill and patch deep road crater before rush hour bus traffic.',
    },
    {
      report_id: idMap['renigunta-light-parent'],
      volunteer_id: v2,
      assigned_by: dispatcherId,
      status: 'assigned',
      notes: 'Inspect wiring and capacitor unit at pole 42.',
    },
    {
      report_id: idMap['tiruchanur-water-parent'],
      volunteer_id: v3,
      assigned_by: dispatcherId,
      status: 'in_progress',
      notes: 'Isolate municipal section valve to stop flooding.',
    },
    {
      report_id: idMap['alipiri-garbage-parent'],
      volunteer_id: v1,
      assigned_by: dispatcherId,
      status: 'assigned',
      notes: 'Clear the garbage dump near Alipiri.',
    },
    {
      report_id: idMap['svu-pothole-parent'],
      volunteer_id: v1,
      assigned_by: dispatcherId,
      status: 'completed',
      notes: 'SVU road pothole fixed successfully.',
    },
    {
      report_id: idMap['airport-road-water'],
      volunteer_id: v1,
      assigned_by: dispatcherId,
      status: 'in_progress',
      notes: 'Addressing airport road water logging.',
    },
  ];
  await must(admin.from('tasks').upsert(tasksToSeed, { onConflict: 'report_id' }));

  // 11. Seed Attestation Votes
  const votes = [
    { report_id: idMap['bus-stand-pothole-parent'], user_id: users['citizen.one@responsys.test'].id, value: 1 },
    { report_id: idMap['bus-stand-pothole-parent'], user_id: users['citizen.two@responsys.test'].id, value: 1 },
    { report_id: idMap['bus-stand-pothole-parent'], user_id: users['civilian@responsys.test'].id, value: 1 },
    { report_id: idMap['alipiri-garbage-parent'], user_id: users['citizen.one@responsys.test'].id, value: 1 },
    { report_id: idMap['alipiri-garbage-parent'], user_id: users['citizen.two@responsys.test'].id, value: 1 },
    { report_id: idMap['svu-pothole-parent'], user_id: users['citizen.one@responsys.test'].id, value: 1 },
    { report_id: idMap['airport-road-water'], user_id: users['citizen.two@responsys.test'].id, value: -1 },
  ];
  await must(admin.from('report_votes').upsert(votes, { onConflict: 'report_id,user_id' }));

  // 12. Print demo credentials
  console.log('\n======================================================');
  console.log('   ResponSys Demo Seed Completed Successfully!        ');
  console.log('======================================================');
  console.log(`Password for all accounts: ${password}\n`);
  console.table(
    accounts.map(a => ({
      Role: a.role,
      Email: a.email,
      Name: a.name,
    }))
  );
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Demo seed error:', err);
  process.exit(1);
});
