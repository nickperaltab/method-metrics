-- Create users table for simple user system (no auth, just identity)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email text,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (but allow anon read/write for now — no auth yet)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON users FOR INSERT WITH CHECK (true);

-- Seed initial users
INSERT INTO users (name, email, role) VALUES
  ('Justin', 'justinporter@hey.com', 'admin'),
  ('Nic', null, 'admin')
ON CONFLICT (name) DO NOTHING;

-- Add created_by column to dashboards
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

-- Add created_by column to saved_charts
ALTER TABLE saved_charts ADD COLUMN IF NOT EXISTS created_by_user uuid REFERENCES users(id);

-- Add created_by column to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
