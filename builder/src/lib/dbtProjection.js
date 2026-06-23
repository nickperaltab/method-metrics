// Pure projection of dbt manifest.json -> slim, app-facing model metadata.
const INCLUDED_SCHEMAS = new Set(['revenue', 'revenue_metrics']);

function bareName(nodeId) {
  // 'model.method_metrics.int_customer_mrr' -> 'int_customer_mrr'
  // 'source.method_metrics.revenue.Funnel' -> 'Funnel'
  return nodeId.split('.').pop();
}

export function projectManifest(manifest) {
  const nodes = manifest?.nodes || {};
  // Gather column tests if any test nodes exist (best-effort; may be empty).
  const testsByModelCol = {}; // `${modelName}` -> Set<string>
  for (const node of Object.values(nodes)) {
    if (node.resource_type !== 'test') continue;
    const deps = node.depends_on?.nodes || [];
    const colName = node.test_metadata?.kwargs?.column_name || node.column_name || null;
    const testName = node.test_metadata?.name || node.name;
    const qualified = colName ? `${testName}(${colName})` : testName;
    for (const dep of deps) {
      if (!dep.startsWith('model.')) continue;
      const mn = bareName(dep);
      (testsByModelCol[mn] ||= new Set()).add(qualified);
    }
  }

  const models = [];
  for (const node of Object.values(nodes)) {
    if (node.resource_type !== 'model') continue;
    if (!INCLUDED_SCHEMAS.has(node.schema)) continue;
    const deps = node.depends_on?.nodes || [];
    models.push({
      name: node.name,
      alias: node.alias || node.name,
      relation_name: node.relation_name || null,
      description: node.description || '',
      original_file_path: node.original_file_path || null,
      refs: deps.filter(d => d.startsWith('model.')).map(bareName),
      sources: deps.filter(d => d.startsWith('source.')).map(bareName),
      columns: Object.values(node.columns || {}).map(c => ({ name: c.name, description: c.description || '' })),
      compiled_sql: node.compiled_code || node.raw_code || '',
      tests: testsByModelCol[node.name] ? [...testsByModelCol[node.name]] : [],
    });
  }
  models.sort((a, b) => a.name.localeCompare(b.name));
  return { models };
}
