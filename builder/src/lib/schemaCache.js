// Shared schema cache — singleton across Explorer and ChatExplorer
// Stores BQ view column metadata: { viewName: [{name, type}, ...] }
const schemaCache = {};
export default schemaCache;
