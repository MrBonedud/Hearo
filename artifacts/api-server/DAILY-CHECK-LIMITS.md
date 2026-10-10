# Public AI checking limits

The public `/api/study/evaluate` endpoint permits **30 evaluation attempts per
signed browser session** and **500 overall per UTC calendar day**. Both reset at
00:00 UTC. A reservation counts even if a provider fails, the response is invalid,
the process crashes, or the browser disconnects. One evaluation can attempt at
most two providers, with automatic SDK retries disabled; existing input and
output size bounds remain in place. These are request-count ceilings, not exact
dollar caps; provider prices and token use can vary.

The HttpOnly, SameSite=Lax session cookie persists across reloads, source
selection and restarts. All API instances must share the same `SESSION_SECRET`
and PostgreSQL database. Anonymous users can obtain a new session by clearing
cookies; **the overall limit cannot be bypassed this way**. These limits are not
an authenticated per-person entitlement.

Before starting the API against a new database, apply the additive schema:

```sh
pnpm --filter @workspace/db run push
```

Apply the same schema through the existing deployment database-migration
process. Do not recreate or truncate `evaluation_daily_budgets` on startup.
Counters are reserved transactionally under a shared PostgreSQL advisory lock.
Entries older than seven days are removed during reservations. No learner
answers, provider credentials or IP addresses are stored in the budget table.

Missing signing configuration, database outages or missing tables reject checks
with a safe 503 and a 60-second retry hint, without calling a provider. The
authored non-AI demo stays available. Exhausted budgets return 429 with
`code: evaluation_budget_exceeded`, `scope`, `retryAt` (UTC ISO timestamp),
`retryAfterSeconds`, and `Retry-After`. Cooldown rejections retain their existing
short-retry message and do not consume daily allowance.

The client pauses automatic checks after errors and leaves editing available.
It saves the current draft and the most recent successful report with that
report's original checked text, separately. The previous-report download must
never imply that newer, unchecked words were assessed.

Run budget tests against a development database using:

```sh
scripts/node_modules/.bin/tsx --test \
  artifacts/api-server/src/lib/evaluation-budget.test.ts
```

The database tests use and remove their own temporary schema; they do not
consume public allowance.
