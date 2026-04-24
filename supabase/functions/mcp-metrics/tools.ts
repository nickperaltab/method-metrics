/**
 * MCP tool definitions for Metrics.
 *
 * Phase breakdown:
 *   - Day 1 (done):        health_check
 *   - Day 2 (this file):   list_metrics, get_metric, list_dimensions, list_dashboards
 *   - Day 2b (blocked):    query_metric — needs shared loadScorecardData() from other chat
 *   - Day 3 (blocked):     get_dashboard — same blocker
 */
import { z } from 'npm:zod@3';
import {
  listMetrics as catalogListMetrics,
  getMetric as catalogGetMetric,
  DASHBOARDS,
  getDashboardRow,
  type MetricRow,
} from './catalog.ts';
import { runQuery } from './bq.ts';
import { fetchSnapshot } from './snapshots.ts';
import { buildSemanticSql, buildSemanticGroupedSql } from './sql.ts';

export interface ToolContext {
  tokenId: string;
  userEmail: string;
}

export interface ToolResult {
  content: unknown;
  bytesBilled?: number;
  rowsReturned?: number;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

// Shape a metric row for client consumption — strips nulls and internal fields.
function summarizeMetric(m: MetricRow) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    type: m.metric_type,
    status: m.status,
    ...(m.formula ? { formula: m.formula } : {}),
    ...(m.depends_on?.length ? { depends_on: m.depends_on } : {}),
    ...(m.semantic_table ? { source: m.semantic_table } : m.view_name ? { source: m.view_name } : {}),
  };
}

function detailMetric(m: MetricRow) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    // notes holds methodology, caveats, cohort-timing gotchas, and comparisons
    // to sibling metrics. Essential context for answering 'why is this different
    // from that?' questions accurately — return it in the detail view.
    notes: m.notes,
    type: m.metric_type,
    status: m.status,
    formula: m.formula,
    depends_on: m.depends_on ?? [],
    source_view: m.semantic_table ?? m.view_name,
    measure: m.semantic_measure,
    date_column: m.semantic_date_col,
    filters: m.semantic_filters ?? [],
    dimensions: m.semantic_dimensions ?? [],
    primitive_metric_id: m.primitive_metric_id,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'health_check',
    description: 'Returns server status and version. Use to verify connectivity and auth.',
    inputSchema: z.object({}).strict(),
    handler: async (_args, ctx) => ({
      content: {
        ok: true,
        version: '0.1.0',
        user: ctx.userEmail,
        server_time: new Date().toISOString(),
      },
    }),
  },

  {
    name: 'list_metrics',
    description:
      'List available metrics. Returns id, name, description, and source view. ' +
      'Filter by search keyword or metric type. Defaults to live-status metrics only.',
    inputSchema: z.object({
      search: z.string().optional().describe('Case-insensitive substring match on metric name'),
      metric_type: z.enum(['primitive', 'derived']).optional(),
      limit: z.number().int().positive().max(500).optional().default(200),
    }).strict(),
    handler: async (args) => {
      const a = args as { search?: string; metric_type?: string; limit?: number };
      const rows = await catalogListMetrics({
        search: a.search,
        metricType: a.metric_type,
        limit: a.limit,
      });
      return {
        content: {
          count: rows.length,
          metrics: rows.map(summarizeMetric),
        },
        rowsReturned: rows.length,
      };
    },
  },

  {
    name: 'get_metric',
    description:
      'Get the full definition of one metric by id, including source view, measure, ' +
      'date column, filters, dimensions available for breakdown, formula, and dependencies.',
    inputSchema: z.object({
      id: z.number().int().positive(),
    }).strict(),
    handler: async (args) => {
      const a = args as { id: number };
      const row = await catalogGetMetric(a.id);
      if (!row) {
        return { content: { error: `No metric with id ${a.id}` } };
      }
      return { content: detailMetric(row), rowsReturned: 1 };
    },
  },

  {
    name: 'list_dimensions',
    description:
      'List the dimensions available for breaking down a metric (e.g. AttributionChannel, ' +
      'SignupCountry). Use these values in the group_by argument of query_metric.',
    inputSchema: z.object({
      id: z.number().int().positive(),
    }).strict(),
    handler: async (args) => {
      const a = args as { id: number };
      const row = await catalogGetMetric(a.id);
      if (!row) return { content: { error: `No metric with id ${a.id}` } };
      return {
        content: {
          metric_id: row.id,
          metric_name: row.name,
          dimensions: row.semantic_dimensions ?? [],
        },
      };
    },
  },

  {
    name: 'list_dashboards',
    description:
      'List available scorecards (pre-built dashboards). Each scorecard is a curated set ' +
      'of metrics covering a business area (marketing, sales, funnel, customers, etc.). ' +
      'Use get_dashboard(id) to fetch the full scorecard with current values.',
    inputSchema: z.object({
      group: z.enum(['funnel', 'plan', 'revenue', 'customer']).optional(),
    }).strict(),
    handler: async (args) => {
      const a = args as { group?: string };
      const rows = a.group ? DASHBOARDS.filter(d => d.group === a.group) : DASHBOARDS;
      return {
        content: {
          count: rows.length,
          dashboards: rows.map(d => ({
            id: d.id,
            title: d.title,
            description: d.description,
            group: d.group,
          })),
        },
      };
    },
  },

  {
    name: 'query_metric',
    description:
      'Run a metric against BigQuery and return time-bucketed values. Supports month/week/day/quarter/year grain ' +
      'and an optional dimension breakdown (see list_dimensions). Returns {period, value} rows (with an extra ' +
      'column when grouped). Data is live from BQ; the underlying views refresh nightly.',
    inputSchema: z.object({
      id: z.number().int().positive(),
      time_bucket: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
      last_n_months: z.number().int().min(0).max(60).default(12),
      group_by: z.string().optional().describe('Dimension column to break down by — must appear in list_dimensions'),
      end_date_rule: z.enum(['yesterday', 'previous_sunday']).optional(),
    }).strict(),
    handler: async (args) => {
      const a = args as {
        id: number;
        time_bucket: string;
        last_n_months: number;
        group_by?: string;
        end_date_rule?: string;
      };
      const metric = await catalogGetMetric(a.id);
      if (!metric) return { content: { error: `No metric with id ${a.id}` } };
      // Gate ad-hoc querying to verified metrics only. Queued/draft metrics
      // exist (and may show up in scorecard snapshots that were pre-baked
      // before promotion gating), but we don't surface their values via
      // query_metric until they're approved. Snapshots remain available via
      // get_dashboard, which uses pre-computed payloads.
      if (metric.status !== 'live') {
        return { content: {
          error: `Metric ${a.id} (${metric.name}) is status='${metric.status}' — not approved for ad-hoc queries yet. ` +
                 `Pre-built scorecards may still display its snapshot value via get_dashboard. ` +
                 `Ping the metrics owner to verify and promote to 'live'.`,
        } };
      }
      if (!metric.semantic_table || !metric.semantic_measure || !metric.semantic_date_col) {
        return { content: {
          error: `Metric ${a.id} (${metric.name}) does not have semantic fields set and can't be queried via query_metric. Use a different tool or check the metric definition.`,
        } };
      }
      if (a.group_by) {
        const allowed = metric.semantic_dimensions ?? [];
        if (!allowed.includes(a.group_by)) {
          return { content: {
            error: `group_by '${a.group_by}' is not an approved dimension for metric ${a.id}. Available: ${allowed.join(', ') || '(none)'}`,
          } };
        }
      }

      const sql = a.group_by
        ? buildSemanticGroupedSql(metric, a.group_by, a.time_bucket, a.last_n_months, a.end_date_rule)
        : buildSemanticSql(metric, a.time_bucket, a.last_n_months, a.end_date_rule);

      const { rows, bytesBilled } = await runQuery(sql);
      return {
        content: {
          metric_id: metric.id,
          metric_name: metric.name,
          time_bucket: a.time_bucket,
          group_by: a.group_by ?? null,
          row_count: rows.length,
          data_fresh_as_of: 'live (BQ views refresh nightly; call get_dashboard for cached scorecard data)',
          rows,
        },
        bytesBilled,
        rowsReturned: rows.length,
      };
    },
  },

  {
    name: 'get_dashboard',
    description:
      'Return a full scorecard (sections, KPIs, charts) using the nightly cache. Much faster than calling ' +
      'query_metric for each tile individually. Use list_dashboards to discover ids. Response includes ' +
      'data_fresh_as_of + freshness label so you can caveat answers when the cache is stale.',
    inputSchema: z.object({
      id: z.string().min(1),
    }).strict(),
    handler: async (args) => {
      const a = args as { id: string };
      const dash = getDashboardRow(a.id);
      if (!dash) return { content: { error: `Unknown dashboard '${a.id}'. Call list_dashboards to see options.` } };

      const snap = await fetchSnapshot(a.id);
      if (!snap) {
        return { content: {
          error: `No snapshot for '${a.id}' yet. Only scorecards on the nightly refresh cron have snapshots (currently: Marketing). For others, query the underlying metrics individually via list_metrics + query_metric.`,
        } };
      }
      if (snap.freshness === 'expired') {
        return { content: {
          error: `Snapshot for '${a.id}' is older than 48h (last refresh ${snap.refreshedAt}). Treat as unavailable — escalate to whoever owns the nightly refresh.`,
        } };
      }

      return {
        content: {
          dashboard_id: dash.id,
          title: dash.title,
          description: dash.description,
          data_fresh_as_of: snap.refreshedAt,
          freshness: snap.freshness,
          payload: snap.payload,
        },
      };
    },
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map(t => [t.name, t]));
