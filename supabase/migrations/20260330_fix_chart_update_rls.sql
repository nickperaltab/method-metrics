DO $$ BEGIN
  CREATE POLICY anon_update_charts ON saved_charts FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
