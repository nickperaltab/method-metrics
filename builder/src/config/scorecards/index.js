import salesScorecard from './sales-scorecard';
import marketingScorecard from './marketing-scorecard';
import trialsBreakdown from './trials-breakdown-scorecard';
import syncsBreakdown from './syncs-breakdown-scorecard';

export const SCORECARDS = {
  'sales-scorecard': salesScorecard,
  'marketing-scorecard': marketingScorecard,
  'trials-breakdown': trialsBreakdown,
  'syncs-breakdown': syncsBreakdown,
};
