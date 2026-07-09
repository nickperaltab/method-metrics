import { queryBq } from './bigquery.js';
import { buildChannelTrajectorySql, shapeChannelTrajectory } from './channelTrajectorySql.js';

export async function fetchChannelTrajectory() {
  const rows = await queryBq(buildChannelTrajectorySql());
  return shapeChannelTrajectory(rows);
}
