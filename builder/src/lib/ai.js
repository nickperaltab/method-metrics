import { invokeAiChart } from './supabase';

const VALID_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy', 'variance']);
const VALID_STYLE_OPERATORS = new Set(['<', '<=', '>', '>=', '==', '!=']);

function normalizeStyleRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => {
      const target = rule.target || rule.target_series || rule.series;
      const compareTo = rule.compare_to || rule.compare_series || rule.compare;
      const thresholdValue = rule.threshold ?? rule.value ?? null;
      const parsedThreshold = thresholdValue != null && !Number.isNaN(Number(thresholdValue))
        ? Number(thresholdValue)
        : null;
      const operator = VALID_STYLE_OPERATORS.has(rule.operator) ? rule.operator : '<';
      const color = typeof rule.color === 'string' ? rule.color : '#f87171';
      return { target, compareTo, threshold: parsedThreshold, operator, color };
    })
    .filter(r => r.target && (r.compareTo || r.threshold != null));
}

// Validate AI-returned column names against actual schema and approved dimensions.
function validateColumns(dc, resolvedMetrics, schemaMap, approvedDimensions) {
  const primaryView = resolvedMetrics.find(m => m.view_name)?.view_name;
  if (!primaryView) return;
  const schema = schemaMap[primaryView] || [];
  const validCols = schema.map(f => f.name);

  // Validate group_by_dimension — must be an approved dimension if we have them
  if (dc.group_by_dimension) {
    if (approvedDimensions && approvedDimensions.length > 0) {
      const primaryMetric = resolvedMetrics[0];
      const approved = approvedDimensions
        .filter(d => d.metric_id === primaryMetric?.id)
        .map(d => d.column_name);
      if (approved.length > 0 && !approved.includes(dc.group_by_dimension)) {
        const match = approved.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase());
        dc.group_by_dimension = match || null;
      }
    } else if (!validCols.includes(dc.group_by_dimension)) {
      const match = validCols.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase());
      dc.group_by_dimension = match || null;
    }
  }

  // Validate x_field — fall back to first DATE column if invalid
  if (dc.x_field && !validCols.includes(dc.x_field)) {
    const match = validCols.find(c => c.toLowerCase() === dc.x_field.toLowerCase());
    dc.x_field = match || schema.find(f => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(f.type))?.name || null;
  }
}

export async function generateChartSpecWithHistory(messages, metrics, schemaMap, currentChartSpec) {
  const metricContext = buildMetricContext(metrics);
  const schemaContext = buildSchemaContext(schemaMap);

  const aiMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const result = await invokeAiChart({
    messages: aiMessages,
    metricContext,
    schemaContext,
    currentChartSpec: currentChartSpec || null,
  });

  if (result.type === 'text') {
    return { type: 'text', content: result.content, suggestion: result.suggestion || null };
  }

  if (result.error) {
    return { error: result.error, suggestion: result.suggestion };
  }

  const metricIds = result.metric_ids || (result.metric_id ? [result.metric_id] : []);
  if (metricIds.length === 0) {
    return { error: 'No metrics specified in AI response' };
  }

  const resolvedMetrics = [];
  for (const id of metricIds) {
    const m = metrics.find(x => x.id === id);
    if (!m) return { error: `Unknown metric ID: ${id}` };
    resolvedMetrics.push(m);
  }

  const echartsType = VALID_TYPES.has(result.echarts_type) ? result.echarts_type : 'bar';
  const dc = result.data_config || {};
  validateColumns(dc, resolvedMetrics, schemaMap);

  return {
    metrics: resolvedMetrics,
    metricIds,
    dataConfig: {
      xField: dc.x_field || null,
      yFields: dc.y_fields || ['COUNT'],
      timeBucket: dc.time_bucket || 'month',
      lastNMonths: dc.last_n_months != null ? dc.last_n_months : null,
      channelFilter: dc.channel_filter || null,
      groupByDimension: dc.group_by_dimension || null,
      yearFilter: Array.isArray(dc.year_filter) ? dc.year_filter : null,
      yoyMode: dc.yoy_mode || 'value',
      yoyMonths: Array.isArray(dc.yoy_months) ? dc.yoy_months : null,
      endDateRule: dc.end_date_rule || null,
      styleRules: normalizeStyleRules(dc.style_rules),
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
    showLabels: !!result.show_labels,
    colors: result.colors || null,
    explanation: result.explanation || '',
  };
}

export function buildMetricContext(metrics, approvedDimensions) {
  const chartable = metrics.filter(m =>
    ['primitive', 'derived'].includes(m.metric_type)
    && m.status === 'live'
  );
  return chartable.map(m => {
    let line = `- id:${m.id} name:"${m.name}" type:${m.metric_type} view:${m.view_name || 'none'}`;
    if (m.notes) line += ` desc:"${m.notes}"`;
    if (m.chart_sql) line += ` has_chart_sql:true`;
    if (m.formula) line += ` formula:${m.formula}`;
    if (m.depends_on) line += ` depends_on:[${m.depends_on.join(',')}]`;
    if (m.supported_grains) line += ` grains:[${m.supported_grains.join(',')}]`;
    // Only include approved dimensions, not raw schema columns
    if (approvedDimensions) {
      const dims = approvedDimensions.filter(d => d.metric_id === m.id);
      if (dims.length > 0) {
        line += ` dimensions:[${dims.map(d => d.column_name).join(',')}]`;
      }
    }
    return line;
  }).join('\n');
}

export function buildSchemaContext(schemaMap) {
  return Object.entries(schemaMap)
    .map(([view, fields]) =>
      `${view}: ${fields.map(f => `${f.name}(${f.type})`).join(', ')}`
    )
    .join('\n');
}

export async function generateChartSpec(prompt, metrics, schemaMap) {
  const metricContext = buildMetricContext(metrics);
  const schemaContext = buildSchemaContext(schemaMap);

  const result = await invokeAiChart({ prompt, metricContext, schemaContext });

  if (result.type === 'text') {
    return { type: 'text', content: result.content, suggestion: result.suggestion || null };
  }

  if (result.error) {
    return { error: result.error, suggestion: result.suggestion };
  }

  // Normalize metric_ids
  const metricIds = result.metric_ids || (result.metric_id ? [result.metric_id] : []);
  if (metricIds.length === 0) {
    return { error: 'No metrics specified in AI response' };
  }

  // Resolve metric objects
  const resolvedMetrics = [];
  for (const id of metricIds) {
    const m = metrics.find(x => x.id === id);
    if (!m) return { error: `Unknown metric ID: ${id}` };
    resolvedMetrics.push(m);
  }

  const echartsType = VALID_TYPES.has(result.echarts_type) ? result.echarts_type : 'bar';
  const dc = result.data_config || {};
  validateColumns(dc, resolvedMetrics, schemaMap);

  return {
    metrics: resolvedMetrics,
    metricIds,
    dataConfig: {
      xField: dc.x_field || null,
      yFields: dc.y_fields || ['COUNT'],
      timeBucket: dc.time_bucket || 'month',
      lastNMonths: dc.last_n_months != null ? dc.last_n_months : null,
      channelFilter: dc.channel_filter || null,
      groupByDimension: dc.group_by_dimension || null,
      yearFilter: Array.isArray(dc.year_filter) ? dc.year_filter : null,
      yoyMode: dc.yoy_mode || 'value',
      yoyMonths: Array.isArray(dc.yoy_months) ? dc.yoy_months : null,
      endDateRule: dc.end_date_rule || null,
      styleRules: normalizeStyleRules(dc.style_rules),
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
    showLabels: !!result.show_labels,
    colors: result.colors || null,
    explanation: result.explanation || '',
  };
}
