import { queryBq } from './bigquery.js';
import { buildChannelTrajectorySql, shapeChannelTrajectory } from './channelTrajectorySql.js';

export async function fetchChannelTrajectory({ start, end }) {
  const { rows } = await queryBq(buildChannelTrajectorySql({ start, end }));
  return shapeChannelTrajectory(rows);
}
