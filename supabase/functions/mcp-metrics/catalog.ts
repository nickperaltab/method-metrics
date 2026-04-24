/**
 * Read-side helpers for the metric + dashboard catalog.
 *
 * Uses the Supabase service role client so we can read every metric
 * regardless of RLS. Do not expose the service role beyond this module.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return cached;
}

export interface MetricRow {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  metric_type: string | null;
  status: string | null;
  view_name: string | null;
  formula: string | null;
  depends_on: number[] | null;
  semantic_table: string | null;
  semantic_measure: string | null;
  semantic_date_col: string | null;
  semantic_filters: string[] | null;
  semantic_dimensions: string[] | null;
  primitive_metric_id: number | null;
}

const METRIC_COLUMNS = [
  'id', 'name', 'description', 'notes', 'metric_type', 'status',
  'view_name', 'formula', 'depends_on',
  'semantic_table', 'semantic_measure', 'semantic_date_col',
  'semantic_filters', 'semantic_dimensions',
  'primitive_metric_id',
].join(',');

export async function listMetrics(opts: {
  status?: string;
  search?: string;
  metricType?: string;
  limit?: number;
} = {}): Promise<MetricRow[]> {
  let q = client().from('metrics').select(METRIC_COLUMNS).order('id');
  q = q.eq('status', opts.status ?? 'live');
  if (opts.metricType) q = q.eq('metric_type', opts.metricType);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as MetricRow[]) ?? [];
}

export async function getMetric(id: number): Promise<MetricRow | null> {
  const { data, error } = await client()
    .from('metrics')
    .select(METRIC_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MetricRow | null);
}

/**
 * Dashboard catalog — static metadata mirroring builder/src/config/scorecards/.
 * Keep in sync when a new scorecard ships. Section/chart data comes from the
 * shared loadScorecardData() (lands in the other chat's PR; wires in Day 3).
 */
export interface DashboardRow {
  id: string;
  title: string;
  description: string;
  group: string | null;
  status: 'approved' | 'draft';
}

export const DASHBOARDS: DashboardRow[] = [
  { id: 'marketing-scorecard', title: 'Marketing Scorecard', description: 'Trials, Syncs, and conversion health by channel and week.', group: null, status: 'approved' },
  { id: 'sales-scorecard', title: 'Sales Scorecard', description: 'Conversions, New Net SaaS, DEP revenue — weekly budget/forecast/actual.', group: null, status: 'approved' },
  { id: 'funnel', title: 'Funnel', description: 'Trials → Syncs → Conversions pipeline with Sync Rate and Conversion Rate.', group: 'funnel', status: 'approved' },
  { id: 'customers', title: 'Customers', description: 'Customer count, retention, and churn by segment.', group: 'customer', status: 'approved' },
  { id: 'customer-segments', title: 'Customer Segments', description: 'Customers grouped by license tier × DEP status.', group: 'customer', status: 'approved' },
  { id: 'trials-breakdown', title: 'Trials Breakdown', description: 'Trials by channel, country, industry, sync type.', group: 'funnel', status: 'approved' },
  { id: 'syncs-breakdown', title: 'Syncs Breakdown', description: 'Syncs by channel, country, sync type.', group: 'funnel', status: 'approved' },
  { id: 'conversions-breakdown', title: 'Conversions Breakdown', description: 'Conversions by channel.', group: 'funnel', status: 'approved' },
  { id: 'cancellations-breakdown', title: 'Cancellations Breakdown', description: 'Cancellations by segment and reason.', group: 'customer', status: 'approved' },
  { id: 'trials-plan', title: 'Trials Plan', description: 'Trials budget vs forecast vs actual.', group: 'plan', status: 'approved' },
  { id: 'syncs-plan', title: 'Syncs Plan', description: 'Syncs budget vs forecast vs actual.', group: 'plan', status: 'approved' },
  { id: 'churn-plan', title: 'Churn Plan', description: 'Churn budget vs forecast vs actual.', group: 'plan', status: 'approved' },
  { id: 'dep-revenue', title: 'DEP Revenue', description: 'DEP revenue plan and actuals.', group: 'revenue', status: 'approved' },
];

export function getDashboardRow(id: string): DashboardRow | null {
  return DASHBOARDS.find(d => d.id === id) ?? null;
}
