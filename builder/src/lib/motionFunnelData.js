// builder/src/lib/motionFunnelData.js
import { queryBq } from './bigquery.js';
import { buildMotionFunnelSql, buildMotionLensSql } from './motionFunnelSql.js';

export async function fetchMotionFunnel({ startMonth, endMonth }) {
  const { rows } = await queryBq(buildMotionFunnelSql({ startMonth, endMonth }));
  return rows;
}

export async function fetchMotionLens({ startMonth, endMonth, lens }) {
  const { rows } = await queryBq(buildMotionLensSql({ startMonth, endMonth, lens }));
  return rows;
}
