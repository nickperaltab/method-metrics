#!/usr/bin/env node
import { createBqClient, makeQuery } from './refresh-snapshots/bq-client.js';

const bq = createBqClient();
const query = makeQuery(bq);

const { rows } = await query(`
  SELECT table_id AS table_name,
         TIMESTAMP_MILLIS(last_modified_time) AS last_modified
  FROM \`project-for-method-dw.revenue.__TABLES__\`
  WHERE type IN (1, 3)
  ORDER BY last_modified DESC
  LIMIT 30
`);
console.table(rows);
