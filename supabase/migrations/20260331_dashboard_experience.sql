-- Dashboard experience: stars, folders, approved flag
-- Ticket #19

-- Add approved flag to dashboards
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;

-- Dashboard folders
CREATE TABLE IF NOT EXISTS dashboard_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dashboard_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON dashboard_folders FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON dashboard_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON dashboard_folders FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON dashboard_folders FOR DELETE USING (true);

-- Add folder reference to dashboards
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES dashboard_folders(id) ON DELETE SET NULL;

-- Dashboard stars (per-user)
CREATE TABLE IF NOT EXISTS dashboard_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dashboard_id, user_id)
);

ALTER TABLE dashboard_stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON dashboard_stars FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON dashboard_stars FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete" ON dashboard_stars FOR DELETE USING (true);
