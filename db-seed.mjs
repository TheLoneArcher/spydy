import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database seeding.');
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Connected to database, starting seed...');

  try {
    const adminId = '11111111-1111-1111-1111-111111111111';
    const vol1Id = '22222222-2222-2222-2222-222222222222';
    const vol2Id = '33333333-3333-3333-3333-333333333333';

    await client.query(`
      -- Insert Profiles
      INSERT INTO profiles (id, full_name, role, phone) VALUES 
      ('${adminId}', 'Command Center', 'admin', '1234567890'),
      ('${vol1Id}', 'Rajesh Kumar', 'volunteer', '0987654321'),
      ('${vol2Id}', 'Priya Sharma', 'volunteer', '1122334455')
      ON CONFLICT (id) DO NOTHING;

      -- Insert Volunteers
      INSERT INTO volunteers (profile_id, skills, last_location) VALUES 
      ('${vol1Id}', '{"logistics", "heavy_lifting"}', ST_GeomFromText('POINT(72.8777 19.0760)', 4326)),
      ('${vol2Id}', '{"medical", "tech_support"}', ST_GeomFromText('POINT(72.8362 19.0596)', 4326))
      ON CONFLICT (profile_id) DO NOTHING;

      -- Insert Need Reports
      INSERT INTO need_reports (id, title, description, severity, category, status, location, location_label, submitted_by) VALUES 
      ('a1111111-1111-1111-1111-111111111111', 'Large pothole on MG Road', 'Huge pothole causing traffic jam and danger to bikers.', 'critical', 'pothole', 'pending', ST_GeomFromText('POINT(72.8258 18.9322)', 4326), 'MG Road, South Mumbai', '${vol1Id}'),
      ('a2222222-2222-2222-2222-222222222222', 'Broken streetlight on Linking Road', 'Streetlight is completely dark since last night.', 'moderate', 'streetlight', 'pending', ST_GeomFromText('POINT(72.8347 19.0660)', 4326), 'Linking Road, Bandra', '${vol2Id}'),
      ('a3333333-3333-3333-3333-333333333333', 'Overflowing garbage bin at Andheri Station', 'Garbage bin is overflowing and scattered all over.', 'critical', 'garbage', 'pending', ST_GeomFromText('POINT(72.8465 19.1197)', 4326), 'Andheri East Station', '${vol1Id}'),
      ('a4444444-4444-4444-4444-444444444444', 'Water pipe leak on Carter Road', 'Water is leaking heavily from main pipeline.', 'moderate', 'water_leakage', 'pending', ST_GeomFromText('POINT(72.8250 19.0690)', 4326), 'Carter Road Promenade', '${vol2Id}'),
      ('a5555555-5555-5555-5555-555555555555', 'Road surface damage near Bandra Fort', 'Road surface is uneven and damaged.', 'low', 'road_damage', 'pending', ST_GeomFromText('POINT(72.8188 19.0408)', 4326), 'Bandra Fort', '${vol1Id}'),
      ('a6666666-6666-6666-6666-666666666666', 'Blocked drainage at Juhu Beach Road', 'Drainage is completely blocked causing waterlogging.', 'critical', 'drainage', 'pending', ST_GeomFromText('POINT(72.8267 19.1075)', 4326), 'Juhu Beach Road', '${vol2Id}'),
      ('a7777777-7777-7777-7777-777777777777', 'Multiple potholes on Western Express Highway', 'Several deep potholes on WEH near airport.', 'moderate', 'pothole', 'pending', ST_GeomFromText('POINT(72.8540 19.0888)', 4326), 'WEH Airport Stretch', '${vol1Id}'),
      ('a8888888-8888-8888-8888-888888888888', 'Damaged streetlight near Powai Lake', 'Streetlight pole is bent and non-functional.', 'low', 'streetlight', 'pending', ST_GeomFromText('POINT(72.9051 19.1287)', 4326), 'Powai Lake Side', '${vol2Id}')
      ON CONFLICT DO NOTHING;

      -- Select volunteers to use in tasks
      WITH vol1 AS (SELECT id FROM volunteers WHERE profile_id = '${vol1Id}' LIMIT 1),
           vol2 AS (SELECT id FROM volunteers WHERE profile_id = '${vol2Id}' LIMIT 1)
      INSERT INTO tasks (report_id, volunteer_id, assigned_by, status) 
      SELECT 'a1111111-1111-1111-1111-111111111111', id, '${adminId}', 'dispatched' FROM vol1
      UNION ALL
      SELECT 'a3333333-3333-3333-3333-333333333333', id, '${adminId}', 'in_progress' FROM vol2
      ON CONFLICT DO NOTHING;

      -- Update report statuses
      UPDATE need_reports SET status = 'dispatched' WHERE id = 'a1111111-1111-1111-1111-111111111111';
      UPDATE need_reports SET status = 'in_progress' WHERE id = 'a3333333-3333-3333-3333-333333333333';

      -- Insert Report Updates
      INSERT INTO report_updates (report_id, author_id, message) VALUES 
      ('a1111111-1111-1111-1111-111111111111', '${adminId}', 'Assigned task to Rajesh Kumar.'),
      ('a3333333-3333-3333-3333-333333333333', '${adminId}', 'Assigned task to Priya Sharma.'),
      ('a3333333-3333-3333-3333-333333333333', '${vol2Id}', 'On site, inspecting the garbage situation.')
      ON CONFLICT DO NOTHING;

      -- Insert Resources
      INSERT INTO resources (name, category, quantity_available, quantity_total, location_label, managed_by) VALUES 
      ('First Aid Kit Type A', 'medical_supply', 15, 20, 'Command Center Main HQ', '${adminId}'),
      ('Municipal Waste Truck', 'vehicle', 3, 5, 'Andheri Depot', '${adminId}'),
      ('Heavy Drill Machine', 'equipment', 2, 2, 'Bandra Workshop', '${adminId}'),
      ('Sandbags Pack', 'equipment', 100, 150, 'Juhu Beach Post', '${adminId}'),
      ('Emergency Relief Tent', 'shelter', 10, 10, 'Powai Reserve', '${adminId}')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Database seeded successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await client.end();
  }
}

main();
