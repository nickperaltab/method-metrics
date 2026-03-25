const TEMPORAL_TYPES = new Set(['DATE', 'TIMESTAMP', 'DATETIME']);
const NUMERIC_TYPES = new Set(['INTEGER', 'INT64', 'FLOAT', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC']);

export function mapBqSchemaToGwFields(schemaFields) {
  return schemaFields.map(field => {
    const type = field.type?.toUpperCase() || 'STRING';

    if (TEMPORAL_TYPES.has(type)) {
      return {
        fid: field.name,
        name: formatFieldName(field.name),
        semanticType: 'temporal',
        analyticType: 'dimension',
      };
    }

    if (NUMERIC_TYPES.has(type)) {
      return {
        fid: field.name,
        name: formatFieldName(field.name),
        semanticType: 'quantitative',
        analyticType: 'measure',
      };
    }

    return {
      fid: field.name,
      name: formatFieldName(field.name),
      semanticType: 'nominal',
      analyticType: 'dimension',
    };
  });
}

function formatFieldName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}
