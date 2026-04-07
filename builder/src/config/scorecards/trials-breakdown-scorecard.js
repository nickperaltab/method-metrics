/**
 * Trials Breakdown Scorecard
 * One section per approved dimension — all data driven from semantic layer (v_trials).
 *
 * Note: AttributionChannel is NOT a direct column in v_trials (it's derived from
 * individual Att_* flag columns). That breakdown requires a BQ view update (Justin).
 */

export default {
  id: 'trials-breakdown',
  title: 'Trials Breakdown',
  status: 'pending',
  views: {
    v_trials: { dateCol: 'SignupDate' },
  },
  sections: [
    {
      title: 'By Country',
      charts: [
        {
          label: 'Trials by Country',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'SignupCountry',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      charts: [
        {
          label: 'Trials by Vertical',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'Vertical',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      charts: [
        {
          label: 'Trials by Sync Type',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'SyncType',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
  ],
};
