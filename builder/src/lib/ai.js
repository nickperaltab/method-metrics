import { invokeAiChart } from './supabase';

const VALID_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy', 'variance']);
const VALID_STYLE_OPERATORS = new Set(['<', '<=', '>', '>=', '==', '!=']);

export function normalizeStyleRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => {
      const target = rule.target || rule.target_series || rule.series;
      const compareTo = rule.compareTo || rule.compare_to || rule.compare_series || rule.compare;
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

// Deterministic post-processing: apply keyword-based overrides to the AI's data_config.
// Moves all trigger-word logic out of the system prompt and into reliable frontend code.
export function applyPromptOverrides(userPrompt, dc, echartsType, resolvedMetrics, approvedDimensions) {
  const prompt = userPrompt.toLowerCase();

  // 1. group_by_dimension — only fires if AI left it null
  if (!dc.group_by_dimension) {
    const GROUP_BY_TRIGGERS = [
      { patterns: ['by channel', 'by attribution channel', 'per channel', 'across channels', 'channel breakdown', 'by source'], dimension: 'AttributionChannel' },
      { patterns: ['by country', 'per country', 'across countries', 'by region'], dimension: 'SignupCountry' },
      { patterns: ['by vertical', 'by industry'], dimension: 'Vertical' },
      { patterns: ['by sync type'], dimension: 'SyncType' },
    ];
    for (const { patterns, dimension } of GROUP_BY_TRIGGERS) {
      if (patterns.some(p => prompt.includes(p))) {
        if (approvedDimensions && approvedDimensions.length > 0) {
          const primaryMetric = resolvedMetrics[0];
          const approved = approvedDimensions.filter(d => d.metric_id === primaryMetric?.id).map(d => d.column_name);
          if (approved.includes(dimension)) dc.group_by_dimension = dimension;
        }
        break;
      }
    }
  }

  // 2. channel_filter — only if no group_by breakdown and AI left it null
  if (!dc.channel_filter && !dc.group_by_dimension) {
    const CHANNELS = ['SEO', 'PPC', 'OPN', 'Social', 'Email', 'Referral', 'Direct', 'Partners', 'Content', 'Remarketing'];
    for (const ch of CHANNELS) {
      if (new RegExp(`\\b${ch}\\b`, 'i').test(userPrompt)) { dc.channel_filter = ch; break; }
    }
  }

  // 3. show_labels
  if (['data labels', 'show values', 'add numbers', 'label the', 'show numbers'].some(t => prompt.includes(t))) {
    dc.show_labels = true;
  }

  // 4. time_bucket — only override for explicit week/day requests
  if (/\bby week\b|\bweekly\b/.test(prompt)) dc.time_bucket = 'week';
  else if (/\bby day\b|\bdaily\b/.test(prompt)) dc.time_bucket = 'day';

  // 5. stacked_bar guard — can't render stacked without a dimension
  if (echartsType === 'stacked_bar' && !dc.group_by_dimension) echartsType = 'bar';

  return echartsType;
}

// Validate AI-returned column names against actual schema and approved dimensions.
export function validateColumns(dc, resolvedMetrics, schemaMap, approvedDimensions) {
  const primaryView = resolvedMetrics.find(m => m.view_name)?.view_name;
  if (!primaryView) return;
  const schema = schemaMap[primaryView] || [];
  const validCols = schema.map(f => f.name);

  // Validate group_by_dimension — must be an explicitly approved dimension.
  // If no approvedDimensions list is provided, reject all group_by_dimension values
  // to prevent unapproved schema columns from being used as dimensions.
  if (dc.group_by_dimension) {
    if (approvedDimensions && approvedDimensions.length > 0) {
      const primaryMetric = resolvedMetrics[0];
      const approved = approvedDimensions
        .filter(d => d.metric_id === primaryMetric?.id)
        .map(d => d.column_name);
      if (approved.length === 0 || !approved.includes(dc.group_by_dimension)) {
        const match = approved.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase());
        dc.group_by_dimension = match || null;
      }
    } else {
      // No approved dimensions list — reject all unapproved dimensions
      dc.group_by_dimension = null;
    }
  }

  // Validate x_field — only correct it if schema is loaded and the field is invalid.
  // If schema is empty (still loading), leave x_field as-is so the query can still run.
  if (dc.x_field && validCols.length > 0 && !validCols.includes(dc.x_field)) {
    const match = validCols.find(c => c.toLowerCase() === dc.x_field.toLowerCase());
    dc.x_field = match || schema.find(f => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(f.type))?.name || dc.x_field;
  }
}

export async function generateChartSpecWithHistory(messages, metrics, schemaMap, currentChartSpec, approvedDimensions) {
  const metricContext = buildMetricContext(metrics, approvedDimensions);
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

  let echartsType = VALID_TYPES.has(result.echarts_type) ? result.echarts_type : 'bar';
  const dc = result.data_config || {};
  validateColumns(dc, resolvedMetrics, schemaMap, approvedDimensions);
  const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  echartsType = applyPromptOverrides(lastUserMsg, dc, echartsType, resolvedMetrics, approvedDimensions);

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
      styleRules: normalizeStyleRules(dc.style_rules || result.style_rules),
      labels: dc.labels || resolvedMetrics.map(m => m.name),
      targetLine: dc.target_line ? { value: Number(dc.target_line.value), label: dc.target_line.label || '', color: dc.target_line.color || '#ef4444' } : null,
      orientation: dc.orientation || null,
    },
    echartsType,
    showLabels: !!(dc.show_labels || result.show_labels),
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

  let echartsType = VALID_TYPES.has(result.echarts_type) ? result.echarts_type : 'bar';
  const dc = result.data_config || {};
  validateColumns(dc, resolvedMetrics, schemaMap);
  echartsType = applyPromptOverrides(prompt, dc, echartsType, resolvedMetrics, null);

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
      styleRules: normalizeStyleRules(dc.style_rules || result.style_rules),
      labels: dc.labels || resolvedMetrics.map(m => m.name),
      targetLine: dc.target_line ? { value: Number(dc.target_line.value), label: dc.target_line.label || '', color: dc.target_line.color || '#ef4444' } : null,
      orientation: dc.orientation || null,
    },
    echartsType,
    showLabels: !!(dc.show_labels || result.show_labels),
    colors: result.colors || null,
    explanation: result.explanation || '',
  };
}
