# Browser regressions

`pnpm --filter @workspace/listen-first test:e2e` runs the mocked browser
regressions without a PDF fixture or API server.

## Checking allowance regressions

```sh
pnpm --filter @workspace/listen-first exec playwright test --config=playwright.config.ts check-allowance.spec.ts
```

The allowance suite uses the real App, React Query and live-assessment hook with
mocked API responses and a controlled browser clock. It covers UTC midnight
recovery, consumption by a second tab in the same browser context, refetch on
visibility/focus, stale-balance removal after failed reads, shared-service
exhaustion, and a last in-flight result arriving after a poll reports zero.
It also checks that editing and previous-report downloads stay usable while
automatic checking is paused, and that a final check remains requestable after
an allowance read fails. No paid AI requests are made.

## Real study API smoke test

From the repository root:

```sh
TEST_APPROVED_PDF=/absolute/path/to/original-approved.pdf \
  pnpm --filter @workspace/listen-first test:e2e:api
```

This reuses the API tests' `TEST_APPROVED_PDF` convention. Supply the exact
original PDF linked by the app, not a renamed substitute. Keep fixture bytes
outside Git (for example, in the ignored `generated-artifacts/` directory).
No PDF is bundled, downloaded automatically, or fabricated by this test.
Missing or incorrect fixtures fail explicitly rather than skipping coverage.

Playwright starts and stops an isolated API on port 4175 and web app on port
4176. Both ports must be free; existing servers are deliberately not reused.
The test-only Vite config forwards `/api` requests unchanged to that API.
Metadata, raw PDF upload, and preparation use real routes and response shapes.
The test also reloads a saved draft, rejects an equal-length one-byte mutation,
and requires verification of the original PDF before recovery.

AI credentials are blank in the test API process and browser evaluation requests
are intercepted. The smoke test does not call a paid model or verify AI quality.
