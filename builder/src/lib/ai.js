import { invokeAiChart } from './supabase';

const VALID_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy']);

// Validate AI-returned column names against actual schema. Fixes hallucinated columns.
function validateColumns(dc, resolvedMetrics, schemaMap) {
  const primaryView = resolvedMetrics.find(m => m.view_name)?.view_name;
  if (!primaryView) return;
  const schema = schemaMap[primaryView] || [];
  const validCols = schema.map(f => f.name);

  // Validate group_by_dimension
  if (dc.group_by_dimension && !validCols.includes(dc.group_by_dimension)) {
    const match = validCols.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase());
    dc.group_by_dimension = match || null;
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
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
    showLabels: !!result.show_labels,
    colors: result.colors || null,
    explanation: result.explanation || '',
  };
}

export function buildMetricContext(metrics) {
  const chartable = metrics.filter(m =>
    ['primitive', 'foundational', 'derived'].includes(m.metric_type)
    && m.status === 'live'
  );
  return chartable.map(m => {
    let line = `- id:${m.id} name:"${m.name}" type:${m.metric_type} view:${m.view_name || 'none'}`;
    if (m.formula) line += ` formula:${m.formula}`;
    if (m.depends_on) line += ` depends_on:[${m.depends_on.join(',')}]`;
    if (m.dimensions) line += ` dimensions:${JSON.stringify(m.dimensions)}`;
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
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
    showLabels: !!result.show_labels,
    colors: result.colors || null,
    explanation: result.explanation || '',
  };
}
