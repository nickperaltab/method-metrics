import { invokeAiChart } from './supabase';

const VALID_CHART_TYPES = new Set(['bar', 'line', 'scatter', 'area', 'point', 'arc', 'horizontal_bar']);

export function buildMetricContext(metrics) {
  const chartable = metrics.filter(m =>
    ['primitive', 'foundational', 'derived'].includes(m.metric_type)
  );
  return chartable.map(m =>
    `- id:${m.id} name:"${m.name}" type:${m.metric_type} view:${m.view_name || 'none'}`
  ).join('\n');
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

  const result = await invokeAiChart({
    prompt,
    metricContext,
    schemaContext,
  });

  if (result.error) {
    return { error: result.error, suggestion: result.suggestion };
  }

  // Normalize: support both metrics array and singular metric_id
  let metricsArr;
  if (Array.isArray(result.metrics) && result.metrics.length > 0) {
    metricsArr = result.metrics;
  } else if (result.metric_id) {
    metricsArr = [{ metric_id: result.metric_id, y_field: result.y_field, label: null }];
  } else {
    return { error: 'AI response missing metric_id or metrics array', suggestion: 'Try rephrasing your request.' };
  }

  // Validate each metric exists
  const resolvedMetrics = [];
  for (const entry of metricsArr) {
    const metric = metrics.find(m => m.id === entry.metric_id);
    if (!metric) {
      return { error: `Unknown metric ID: ${entry.metric_id}`, suggestion: 'Try asking for a specific metric by name.' };
    }

    // Validate columns against schema if available
    const viewSchema = schemaMap[metric.view_name];
    if (viewSchema) {
      const colNames = new Set(viewSchema.map(f => f.name));
      colNames.add('COUNT');
      for (const field of [result.x_field, entry.y_field, result.color_field].filter(Boolean)) {
        if (!colNames.has(field)) {
          return { error: `Column "${field}" not found in ${metric.view_name}`, suggestion: `Available columns: ${[...colNames].join(', ')}` };
        }
      }
    }

    resolvedMetrics.push({ metric, yField: entry.y_field || 'COUNT', label: entry.label || null });
  }

  let chartType = result.chart_type || 'bar';
  if (!VALID_CHART_TYPES.has(chartType)) {
    chartType = 'bar';
  }

  return {
    metrics: resolvedMetrics,
    // Backward compat: expose first metric as top-level metric
    metric: resolvedMetrics[0].metric,
    yField: resolvedMetrics[0].yField,
    chartType,
    xField: result.x_field,
    colorField: result.color_field || null,
    timeBucket: result.time_bucket || 'month',
    lastNMonths: result.last_n_months || null,
    channelFilter: result.channel_filter || null,
    explanation: result.explanation || '',
  };
}
