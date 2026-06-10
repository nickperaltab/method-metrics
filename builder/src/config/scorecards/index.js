import salesScorecard from './sales-scorecard.js';
import marketingScorecard from './marketing-scorecard.js';
import trialsBreakdown from './trials-breakdown-scorecard.js';
import syncsBreakdown from './syncs-breakdown-scorecard.js';
import conversionsBreakdown from './conversions-breakdown-scorecard.js';
import funnelScorecard from './funnel-scorecard.js';
import cancellationsBreakdown from './cancellations-breakdown-scorecard.js';
import trialsPlan from './trials-plan-scorecard.js';
import syncsPlan from './syncs-plan-scorecard.js';
import churnPlan from './churn-plan-scorecard.js';
import depRevenue from './dep-revenue-scorecard.js';
import customers from './customers-scorecard.js';
import customerSegments from './customer-segments-scorecard.js';
import revenueEngine from './revenue-engine-scorecard.js';
import channelArr from './channel-arr-scorecard.js';
import netSaas from './net-saas-scorecard.js';
import funnelAcquisition from './funnel-acquisition-scorecard.js';

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
  'revenue-engine': revenueEngine,
  'channel-arr': channelArr,
  'net-saas': netSaas,
  'acquisition-funnel': funnelAcquisition,
  'customers': customers,
  'customer-segments': customerSegments,
};
