-- Redesign metric type system: 2 types + verified dimensions
-- Ticket #16

-- Step 1: Migrate existing types to primitive/derived
-- All current types (primitive, foundational, transform, composite, dimension, breakdown, catalog)
-- map to 'primitive' unless they have a formula (then 'derived')
UPDATE metrics
SET metric_type = CASE
  WHEN formula IS NOT NULL AND formula != '' THEN 'derived'
  ELSE 'primitive'
END
WHERE metric_type NOT IN ('primitive', 'derived');

-- Step 2: Add new columns
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS supported_grains text[] DEFAULT ARRAY['monthly'];
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS measure_expression text;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS base_table text;

-- Step 3: Create approved dimensions table
CREATE TABLE IF NOT EXISTS approved_dimensions (
  id serial PRIMARY KEY,
  metric_id integer REFERENCES metrics(id) ON DELETE CASCADE,
  dimension_name text NOT NULL,
  column_name text NOT NULL,
  description text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_id, column_name)
);

ALTER TABLE approved_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON approved_dimensions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON approved_dimensions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON approved_dimensions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON approved_dimensions FOR DELETE USING (true);

-- Step 4: Seed approved dimensions for existing primitives
-- Trials dimensions (metric_id 54)
INSERT INTO approved_dimensions (metric_id, dimension_name, column_name, description, verified_at) VALUES
  (54, 'Channel', 'Channel', 'Signup channel attribution', now()),
  (54, 'Country', 'SignupCountry', 'Country of signup', now()),
  (54, 'Sync Type', 'SyncType', 'Type of accounting sync', now()),
  (54, 'Vertical', 'Vertical', 'Business vertical', now())
ON CONFLICT (metric_id, column_name) DO NOTHING;

-- Syncs dimensions (metric_id 55)
INSERT INTO approved_dimensions (metric_id, dimension_name, column_name, description, verified_at) VALUES
  (55, 'Channel', 'Channel', 'Signup channel attribution', now()),
  (55, 'Sync Type', 'SyncType', 'Type of accounting sync', now())
ON CONFLICT (metric_id, column_name) DO NOTHING;

-- Conversions dimensions (metric_id 56)
INSERT INTO approved_dimensions (metric_id, dimension_name, column_name, description, verified_at) VALUES
  (56, 'Channel', 'Channel', 'Signup channel attribution', now()),
  (56, 'Country', 'SignupCountry', 'Country of signup', now()),
  (56, 'Vertical', 'Vertical', 'Business vertical', now())
ON CONFLICT (metric_id, column_name) DO NOTHING;

-- Churn dimensions (metric_id 59)
INSERT INTO approved_dimensions (metric_id, dimension_name, column_name, description, verified_at) VALUES
  (59, 'Channel', 'Channel', 'Signup channel attribution', now()),
  (59, 'Country', 'SignupCountry', 'Country of signup', now())
ON CONFLICT (metric_id, column_name) DO NOTHING;

-- Step 5: Set supported_grains for event metrics (trials, syncs, conversions support all grains)
UPDATE metrics SET supported_grains = ARRAY['monthly', 'weekly', 'daily']
WHERE id IN (54, 55, 56);

-- Churn is monthly-only (month-over-month comparison)
UPDATE metrics SET supported_grains = ARRAY['monthly']
WHERE id = 59;

-- Step 6: Populate base_table from view_name for existing metrics
UPDATE metrics SET base_table = view_name WHERE view_name IS NOT NULL AND base_table IS NULL;
