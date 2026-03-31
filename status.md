# Method Metrics — Status

**Last updated:** 2026-03-30

## What was done

- **#28** Baseline QA: 41 Playwright tests + docs covering all working flows
- **#29** User system: picker, context, switch user, localStorage
- **#16** Type system: reduced to 2 types (Primitive/Derived), killed auto-gen queries, approved dimensions table
- **#18** Unified app shell: persistent left sidebar, Layout component, all routes
- **#19** Dashboard experience: stars, folders, sorting, favorites in sidebar
- **#22** Home page: favorites, recently viewed, recommended dashboards
- **#21** Registry port: Live/Queued tabs, expand panel, search, sort, bulk delete in React
- **#23** Dimensions management: approved filters per metric with add/remove
- **#25** Chart library: My Charts page with search, sort, rename, delete
- **#26** Chart/dashboard management: bulk delete, rename, organize
- **#20** Inline chart builder: dashboard edit mode with drag/resize
- **#17** Closed — covered by #21 and #18
- **#9** README with architecture overview
- **#10** Placeholder route files for 5 unsolved metric families
- **4 Supabase migrations applied** to production (users, type system, dashboard experience, dashboard views)

## What's next

1. **#24 — Graduate 13 verified metrics** through the finished pipeline. Needs Justin to approve each one. Verified SQL is in `knowledge/verified-queries/`.
2. **Deploy builder to Vercel** — the React app has the new shell, sidebar, and all new pages. Needs `cd builder && npm run build && vercel --prod`.
3. **Test the full flow end-to-end** — user picker, registry, dimensions, dashboard starring, chart builder within the new shell.

## Blockers

- #24 requires Justin's approval per metric graduation
- Builder needs Vercel deploy to see new UI live
