import { invokeAiChart } from './supabase';

const VALID_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area']);

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

  return {
    metrics: resolvedMetrics,
    metricIds,
    dataConfig: {
      xField: dc.x_field || null,
      yFields: dc.y_fields || ['COUNT'],
      timeBucket: dc.time_bucket || 'month',
      lastNMonths: dc.last_n_months || null,
      channelFilter: dc.channel_filter || null,
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
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

  // Validate echarts_type
  const echartsType = VALID_TYPES.has(result.echarts_type) ? result.echarts_type : 'bar';

  // Validate data_config
  const dc = result.data_config || {};

  return {
    metrics: resolvedMetrics,
    metricIds,
    dataConfig: {
      xField: dc.x_field || null,
      yFields: dc.y_fields || ['COUNT'],
      timeBucket: dc.time_bucket || 'month',
      lastNMonths: dc.last_n_months || null,
      channelFilter: dc.channel_filter || null,
      labels: dc.labels || resolvedMetrics.map(m => m.name),
    },
    echartsType,
    explanation: result.explanation || '',
  };
}
