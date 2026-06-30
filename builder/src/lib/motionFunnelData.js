// builder/src/lib/motionFunnelData.js
import { queryBq } from './bigquery.js';
import { buildJointSql, buildSplitValuesSql, buildGoalRetentionSql } from './motionFunnelSql.js';

export async function fetchJoint({ startMonth, endMonth, splitKey, splitValue }) {
  const { rows } = await queryBq(buildJointSql({ startMonth, endMonth, splitKey, splitValue }));
  return { rows };
}

export async function fetchSplitValues({ startMonth, endMonth, splitKey }) {
  const { rows } = await queryBq(buildSplitValuesSql({ startMonth, endMonth, splitKey }));
  return { rows };
}

export async function fetchGoalRetention({ startMonth, endMonth, goal, splitKey, splitValue }) {
  const { rows } = await queryBq(buildGoalRetentionSql({ startMonth, endMonth, goal, splitKey, splitValue }));
  return { rows };
}
