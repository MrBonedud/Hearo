# Public AI checking limits

The public `/api/study/evaluate` endpoint initially permits **30 evaluation attempts per
signed browser session** and **500 overall per UTC calendar day**. Owners can change
these shared PostgreSQL settings without editing code (see below). Both reset at
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
scripts/node_modules/.bin/tsx artifacts/api-server/src/tools/check-limits.ts init
```

Apply the same schema through the existing deployment database-migration
process, then initialize the policy once in that database using the owner command.
Do not recreate or truncate `evaluation_daily_budgets` on startup.
Counters are reserved transactionally under a shared PostgreSQL advisory lock.
Entries older than seven days are removed during reservations. No learner
answers, provider credentials or IP addresses are stored in the budget table.

## Owner controls

Run these commands from the workspace root in a trusted terminal with access to
the **intended database**. They use the existing `DATABASE_URL`; do not paste
credentials into commands, source files, or chat. This is an owner-only operations
tool, not a public HTTP endpoint or a learner setting.

```sh
# View the currently stored policy.
scripts/node_modules/.bin/tsx artifacts/api-server/src/tools/check-limits.ts show

# Change both limits together (example: 20 per session and 300 overall).
scripts/node_modules/.bin/tsx artifacts/api-server/src/tools/check-limits.ts set 20 300
```

Both counts must be whole numbers from **0 to 1,000,000**, with no decimals,
negative values, or additional arguments. Zero in either field deliberately
pauses checks for that scope. The fields are independent: the overall ceiling
still wins when it is lower than a session ceiling. PostgreSQL enforces the
same ranges and a single policy row. `init` inserts the initial 30/500 policy
only when absent; it never overwrites an existing policy. `set` requires an
initialized policy, validates before writing, and commits both fields atomically.
Commands print the stored counts on success and exit nonzero on failure.

Every reservation reads the policy inside the same transaction and shared lock
as its counters; there is no process cache, client override, environment-value
override, or fallback to hardcoded limits. Owner updates take that same lock.
The policy row is also locked until the reservation commits, protecting against
concurrent manual SQL updates. All instances using this database see committed
changes on their next reservation, with no restart.

**Lowering a limit never deletes or refunds existing usage.** If today's count
is already at or above the new limit, new checks stop immediately until UTC
midnight or the owner raises the limit above that count. Already-reserved checks
can finish; changing settings does not cancel provider calls in progress.
Raising a limit grants only the additional headroom, not a fresh daily allowance.
UTC reset changes counters, not the policy. An unavailable database or lock
timeout rolls back both owner updates and reservations.

Development and deployment may use separate databases. A workspace command
only changes its configured database, not production automatically. Apply the
schema and owner command through your trusted deployment operations process
against production before releasing this code; no credentials are accepted from
learners. Keep database write access restricted to trusted operators/services.

Missing signing configuration, database outages, missing tables, or missing/invalid policy reject checks
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
