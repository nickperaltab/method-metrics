<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Method Metrics AI Chart Builder. A new `src/lib/posthog.js` singleton was created using `posthog-js` (the browser SDK), initialized from `VITE_POSTHOG_API_KEY` and `VITE_POSTHOG_HOST` environment variables. Events were added across three files covering the full user journey: BigQuery authentication, AI chart generation, chart saves, dashboard creation, user feedback, and conversation history loading. Users are identified by their Google email when they connect BigQuery, and `posthog.reset()` is called on disconnect.

| Event | Description | File |
|---|---|---|
| `bq_connected` | User successfully connected BigQuery via Google OAuth | `src/hooks/useBqAuth.js` |
| `bq_disconnected` | User manually disconnected BigQuery | `src/hooks/useBqAuth.js` |
| `chart_generated` | AI successfully generated a chart from a user prompt | `src/components/ChatExplorer.jsx` |
| `chart_generation_failed` | AI returned an error or no data when generating a chart | `src/components/ChatExplorer.jsx` |
| `chart_saved` | User saved a chart to Supabase, optionally adding it to a dashboard | `src/components/ChatExplorer.jsx` |
| `chart_updated` | User updated an existing saved chart | `src/components/ChatExplorer.jsx` |
| `dashboard_created` | User created a new dashboard while saving a chart | `src/components/ChatExplorer.jsx` |
| `chart_feedback_submitted` | User submitted thumbs-up or thumbs-down feedback on an AI chart response | `src/components/FeedbackButtons.jsx` |
| `conversation_loaded` | User loaded a previous chart conversation from history | `src/components/ChatExplorer.jsx` |
| `time_range_changed` | User changed the time range on an existing chart | `src/components/ChatExplorer.jsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard**: [Analytics basics](https://us.posthog.com/project/390394/dashboard/1494107)
- **Chart Generation Over Time** (generated vs failed, daily): [qz9XXMNG](https://us.posthog.com/project/390394/insights/qz9XXMNG)
- **Chart → Save Conversion Funnel**: [ZQSUGmuB](https://us.posthog.com/project/390394/insights/ZQSUGmuB)
- **Chart Feedback Sentiment** (thumbs up vs down, weekly): [gWvwitMP](https://us.posthog.com/project/390394/insights/gWvwitMP)
- **BQ Connections (New Users)**, weekly: [9uQ26Ior](https://us.posthog.com/project/390394/insights/9uQ26Ior)
- **Most Used Chart Types** (last 30 days): [iEKCxg2J](https://us.posthog.com/project/390394/insights/iEKCxg2J)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
