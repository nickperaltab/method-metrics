/**
 * Channel Trajectory — fixes the Looker YoY table for Marketing.
 * Current-month trajectory vs last-year full month (YoY) and last month (MoM),
 * by channel, for Trials / Syncs / Sync Rate. Backed by the dbt view
 * revenue.int_channel_funnel_trajectory. See docs/superpowers/specs/
 * 2026-07-09-channel-trajectory-scorecard-design.md.
 *
 * `labs: true` surfaces it in the sidebar Labs section for everyone (same as
 * the other bespoke renderer scorecards: acquisition-funnel, motion-funnel,
 * grr-industry) — no admin gate, no star required.
 */
export default {
  id: 'channel-trajectory',
  title: 'Channel Trajectory',
  status: 'pending',
  labs: true,
  renderer: 'channelTrajectory',
  dbtModel: 'int_channel_funnel_trajectory',
};
