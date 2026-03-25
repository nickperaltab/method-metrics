import { invokeAiChart } from './supabase';

const VALID_CHART_TYPES = new Set(['bar', 'line', 'scatter', 'area', 'point', 'arc']);

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

  const metric = metrics.find(m => m.id === result.metric_id);
  if (!metric) {
    return { error: `Unknown metric ID: ${result.metric_id}`, suggestion: 'Try asking for a specific metric by name.' };
  }

  const viewSchema = schemaMap[metric.view_name];
  if (viewSchema) {
    const colNames = new Set(viewSchema.map(f => f.name));
    colNames.add('COUNT'); // Allow COUNT as a virtual y-field
    for (const field of [result.x_field, result.y_field, result.color_field].filter(Boolean)) {
      if (!colNames.has(field)) {
        return { error: `Column "${field}" not found in ${metric.view_name}`, suggestion: `Available columns: ${[...colNames].join(', ')}` };
      }
    }
  }

  if (result.chart_type && !VALID_CHART_TYPES.has(result.chart_type)) {
    result.chart_type = 'bar';
  }

  return {
    metric,
    chartType: result.chart_type || 'bar',
    xField: result.x_field,
    yField: result.y_field,
    colorField: result.color_field || null,
    lastNMonths: result.last_n_months || null,
    explanation: result.explanation || '',
  };
}
