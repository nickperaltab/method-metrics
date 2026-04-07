import salesScorecard from './sales-scorecard';
import marketingScorecard from './marketing-scorecard';
import trialsBreakdown from './trials-breakdown-scorecard';
import syncsBreakdown from './syncs-breakdown-scorecard';
import conversionsBreakdown from './conversions-breakdown-scorecard';
import funnelScorecard from './funnel-scorecard';

export const SCORECARDS = {
  'sales-scorecard': salesScorecard,
  'marketing-scorecard': marketingScorecard,
  'trials-breakdown': trialsBreakdown,
  'syncs-breakdown': syncsBreakdown,
  'conversions-breakdown': conversionsBreakdown,
  'funnel': funnelScorecard,
};
