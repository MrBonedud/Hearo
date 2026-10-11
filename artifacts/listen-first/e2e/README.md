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

The previous-report notice is shown only while the draft differs from the
words the kept report checked. `makePreviousReport` therefore expects no notice
right after a check of identical text; `expectEditableAndDownloadable` edits the
draft before downloading, which still covers the visible notice.

## Screen navigation regressions

```sh
pnpm --filter @workspace/listen-first exec playwright test --config=playwright.config.ts screen-navigation.spec.ts
```

Covers single-page screen changes with mocked API responses:

- "Finish & report" opens the report at its top with focus on its title, at
  1280px and 375px, including a second completion and "Back to my explanation".
- The previous-report notice appears only when the draft moved past the checked
  words, in the live flow, after a final report, in a new study, and when
  reopening saved studies.
- "How it works" is shown only on screens with that section (landing and
  setup) and reaches it by click, Enter and Space.
- The practice sample keeps keyboard focus on the new step's heading and its
  start in view after each Next/Finish.
- The Saved navigation reveals the saved-studies section after setup renders.

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

Upload recovery regressions also hold a verification request, then simulate
either a retryable server error or a dropped connection. They confirm that no
unverified PDF can be opened or prepared, saved draft contents remain unchanged,
and choosing the same original file again verifies through the real API and
reopens the saved explanation. Only the failing upload is intercepted; successful
uploads and preparation are not mocked.

The expiration regression advances only the isolated API's clock (using a
test-only Node preload and an ignored clock file in `generated-artifacts/`).
It checks the final valid millisecond and the exact two-hour expiry boundary,
rejects real preparation and evaluation requests after expiry, displays the
server's re-verification prompts, and preserves the saved multilingual draft.
Re-uploading the original PDF issues a fresh token and restores preparation and
draft recovery without reviving the expired token. The clock is reset between
tests; no production route, authorization lifetime, or normal workflow changes.

AI credentials are blank in the test API process and browser evaluation requests
are intercepted. The expiry test sends one explicitly expired evaluation directly
to the key-free API, then uses that real rejection for the intercepted browser
request. The smoke tests do not call a paid model or verify AI quality.
