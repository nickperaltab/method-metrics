import salesScorecard from './sales-scorecard';
import marketingScorecard from './marketing-scorecard';
import trialsBreakdown from './trials-breakdown-scorecard';
import syncsBreakdown from './syncs-breakdown-scorecard';
import conversionsBreakdown from './conversions-breakdown-scorecard';
import funnelScorecard from './funnel-scorecard';
import cancellationsBreakdown from './cancellations-breakdown-scorecard';
import trialsPlan from './trials-plan-scorecard';
import syncsPlan from './syncs-plan-scorecard';
import churnPlan from './churn-plan-scorecard';
import depRevenue from './dep-revenue-scorecard';
import customers from './customers-scorecard';

export const SCORECARDS = {
  'sales-scorecard': salesScorecard,
  'marketing-scorecard': marketingScorecard,
  'trials-breakdown': trialsBreakdown,
  'syncs-breakdown': syncsBreakdown,
  'conversions-breakdown': conversionsBreakdown,
  'funnel': funnelScorecard,
  'cancellations-breakdown': cancellationsBreakdown,
  'trials-plan': trialsPlan,
  'syncs-plan': syncsPlan,
  'churn-plan': churnPlan,
  'dep-revenue': depRevenue,
  'customers': customers,
};
