import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database setup.');
}

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Connected to database, starting setup...');

  try {
    await client.query(`
      -- 1. Enable PostGIS
      CREATE EXTENSION IF NOT EXISTS postgis;

      -- Drop existing tables and types if they exist
      DROP TABLE IF EXISTS resources CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS report_updates CASCADE;
      DROP TABLE IF EXISTS tasks CASCADE;
      DROP TABLE IF EXISTS need_reports CASCADE;
      DROP TABLE IF EXISTS volunteers CASCADE;
      DROP TABLE IF EXISTS profiles CASCADE;

      DROP TYPE IF EXISTS role_type CASCADE;
      DROP TYPE IF EXISTS skill_type CASCADE;
      DROP TYPE IF EXISTS severity_type CASCADE;
      DROP TYPE IF EXISTS status_type CASCADE;
      DROP TYPE IF EXISTS notif_type CASCADE;
      DROP TYPE IF EXISTS resource_category CASCADE;
      DROP TYPE IF EXISTS issue_category CASCADE;

      -- 2. Custom ENUM types
      CREATE TYPE role_type AS ENUM ('admin', 'volunteer');
      CREATE TYPE skill_type AS ENUM ('medical', 'logistics', 'heavy_lifting', 'tech_support');
      CREATE TYPE severity_type AS ENUM ('critical', 'moderate', 'low');
      CREATE TYPE status_type AS ENUM ('pending', 'dispatched', 'in_progress', 'verified');
      CREATE TYPE notif_type AS ENUM ('assignment', 'status_change', 'new_report', 'system');
      CREATE TYPE resource_category AS ENUM ('medical_supply', 'vehicle', 'equipment', 'food', 'shelter');
      CREATE TYPE issue_category AS ENUM ('pothole', 'streetlight', 'garbage', 'water_leakage', 'road_damage', 'drainage', 'other');

      -- 3. Tables
      CREATE TABLE profiles (
        id UUID PRIMARY KEY,
        full_name TEXT NOT NULL,
        role role_type NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        phone TEXT
      );

      CREATE TABLE volunteers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
        skills skill_type[] NOT NULL DEFAULT '{}',
        last_location GEOGRAPHY(POINT),
        location_updated_at TIMESTAMPTZ,
        is_available BOOLEAN DEFAULT true,
        phone TEXT,
        total_tasks_completed INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE need_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity severity_type NOT NULL,
        category issue_category DEFAULT 'other',
        ai_category issue_category,
        status status_type NOT NULL DEFAULT 'pending',
        required_skill skill_type,
        location GEOGRAPHY(POINT) NOT NULL,
        location_label TEXT NOT NULL,
        submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        image_url TEXT,
        duplicate_of UUID REFERENCES need_reports(id) ON DELETE SET NULL,
        ai_confidence FLOAT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id UUID REFERENCES need_reports(id) ON DELETE CASCADE UNIQUE,
        volunteer_id UUID REFERENCES volunteers(id) ON DELETE CASCADE,
        assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        status status_type NOT NULL DEFAULT 'pending',
        notes TEXT,
        completion_note TEXT,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE report_updates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id UUID REFERENCES need_reports(id) ON DELETE CASCADE,
        author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type notif_type NOT NULL,
        is_read BOOLEAN DEFAULT false,
        related_report_id UUID REFERENCES need_reports(id) ON DELETE CASCADE,
        related_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        category resource_category NOT NULL,
        quantity_available INTEGER NOT NULL,
        quantity_total INTEGER NOT NULL,
        location_label TEXT NOT NULL,
        managed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 4. Enable RLS
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE need_reports ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE report_updates ENABLE ROW LEVEL SECURITY;
      ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "Open access profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access volunteers" ON volunteers FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access need_reports" ON need_reports FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access report_updates" ON report_updates FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
      CREATE POLICY "Open access resources" ON resources FOR ALL USING (true) WITH CHECK (true);

      -- 5. Create updated_at trigger function
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_volunteers_updated_at ON volunteers;
      CREATE TRIGGER update_volunteers_updated_at
          BEFORE UPDATE ON volunteers
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_need_reports_updated_at ON need_reports;
      CREATE TRIGGER update_need_reports_updated_at
          BEFORE UPDATE ON need_reports
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_resources_updated_at ON resources;
      CREATE TRIGGER update_resources_updated_at
          BEFORE UPDATE ON resources
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      -- 6. Storage Bucket for report-images
      INSERT INTO storage.buckets (id, name, public) VALUES ('report-images', 'report-images', true)
      ON CONFLICT (id) DO NOTHING;

      CREATE POLICY "Public read report-images" ON storage.objects FOR SELECT USING (bucket_id = 'report-images');
      CREATE POLICY "Auth upload report-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'report-images');

      -- 7. Realtime setup
      DROP PUBLICATION IF EXISTS supabase_realtime;
      CREATE PUBLICATION supabase_realtime;
      ALTER PUBLICATION supabase_realtime ADD TABLE need_reports, tasks, volunteers, report_updates, resources;

    `);
    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Error during setup:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
