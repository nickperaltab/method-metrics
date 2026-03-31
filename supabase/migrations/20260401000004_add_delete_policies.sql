-- Add missing DELETE and UPDATE policies for dashboards and saved_charts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dashboards' AND policyname = 'Allow public delete') THEN
    CREATE POLICY "Allow public delete" ON dashboards FOR DELETE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dashboards' AND policyname = 'Allow public update') THEN
    CREATE POLICY "Allow public update" ON dashboards FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_charts' AND policyname = 'Allow public delete') THEN
    CREATE POLICY "Allow public delete" ON saved_charts FOR DELETE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_charts' AND policyname = 'Allow public update') THEN
    CREATE POLICY "Allow public update" ON saved_charts FOR UPDATE USING (true);
  END IF;
END $$;
