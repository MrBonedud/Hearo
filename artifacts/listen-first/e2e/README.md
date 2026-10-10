# Browser regressions

`pnpm --filter @workspace/listen-first test:e2e` runs the mocked saved-study
regression without a PDF fixture or API server.

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
