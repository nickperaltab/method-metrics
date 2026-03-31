-- Dashboard views tracking for recently viewed
-- Ticket #22

CREATE TABLE IF NOT EXISTS dashboard_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_views_user_recent ON dashboard_views(user_id, viewed_at DESC);

ALTER TABLE dashboard_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON dashboard_views FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON dashboard_views FOR INSERT WITH CHECK (true);
