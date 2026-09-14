/**
 * Channel Funnel — trial → sync → paying by click-derived channel, including AIO.
 *
 * Backed by revenue.v_channel_funnel, which roots in int_cookie_clicks rather
 * than Account.Att_*. That is the only reason AIO can appear: there is no
 * Att_AIO column and adding one costs three coordinated repo deploys.
 *
 * Same channel vocabulary as Channel Trajectory (PPC, SEO, OPN, Direct...), but
 * a different basis, so the two will NOT reconcile. Deliberate — see the model
 * header on v_channel_funnel.
 *
 * `labs: true` surfaces it in the sidebar Labs section, same as the other
 * bespoke-renderer scorecards.
 */
export default {
  id: 'channel-funnel',
  title: 'Channel Funnel',
  status: 'pending',
  labs: true,
  renderer: 'channelFunnel',
  dbtModel: 'v_channel_funnel',
};
