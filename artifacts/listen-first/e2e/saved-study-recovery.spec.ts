import { expect, test } from '@playwright/test';

const approvedPdf = Buffer.from('%PDF-1.4 approved source fixture');
const changedPdf = Buffer.from('%PDF-1.4 approvEd source fixture');
const storageKey = 'hearo.saved-studies.v2';

const source = {
  id: 'approved-demo',
  title: 'Distributed Systems',
  author: 'Hearo demo',
  filename: 'approved-slides.pdf',
  downloadUrl: 'https://example.test/approved.pdf',
  byteLength: approvedPdf.byteLength,
  pageCount: 10,
  scope: 'Slides 4–10',
  referenceText: 'Load balancing distributes requests across servers to improve capacity and availability.',
  referenceLines: [{ id: 'S01', page: 4, text: 'Load balancing distributes requests across servers.' }],
  aiAvailable: true,
};

const studyMap = {
  topic: source.title,
  nodes: [{
    id: 'load-balancing',
    label: 'Load balancing',
    description: 'Distribute requests across servers.',
    status: 'skipped' as const,
    evidence: null,
  }],
  edges: [],
};

const successfulAssessment = {
  topic: source.title,
  nodes: [{ ...studyMap.nodes[0], status: 'understood' as const, evidence: 'requests across servers' }],
  edges: [],
  feedback: [],
  assessments: [{
    conceptId: 'load-balancing',
    verdict: 'supported',
    studentEvidence: 'requests across servers',
    sourceLineIds: ['S01'],
    confidence: 'medium',
    explanation: 'The answer matches the source.',
    followUp: 'What benefit does this provide?',
  }],
};

test('a failed assessment leaves a reloaded draft retryable and source-bound', async ({ page }) => {
  let assessmentAttempts = 0;

  await page.route('**/api/study/demo', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(source),
  }));
  await page.route('**/api/study/demo/upload', route => {
    const uploaded = route.request().postDataBuffer();
    if (uploaded?.equals(approvedPdf)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ source, sourceToken: 'test-source-token' }),
      });
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'This is not the approved source.' }),
    });
  });
  await page.route('**/api/study/prepare', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(studyMap),
  }));
  await page.route('**/api/study/evaluate', route => {
    assessmentAttempts++;
    if (assessmentAttempts === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated assessment failure. Please retry.' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successfulAssessment),
    });
  });

  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await page.getByTestId('input-file').setInputFiles({
    name: 'approved-slides.pdf',
    mimeType: 'application/pdf',
    buffer: approvedPdf,
  });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();

  // Turn off the timer while drafting so the first assessment below is the
  // deliberate post-reload request, not an incidental check before reload.
  await page.getByTestId('toggle-live-session').uncheck();
  const answer = 'Load balancing spreads requests across servers so the service can handle more work.';
  await page.getByTestId('input-transcript').fill(answer);
  await expect.poll(() => page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]')[0];
    return saved?.transcript;
  }, storageKey)).toBe(answer);

  await page.reload();
  await page.getByTestId('button-start-live').click();
  await expect(page.locator('[aria-label="Saved studies"]')).toContainText('Draft');
  await page.getByTestId('input-file').setInputFiles({
    name: 'approved-slides.pdf',
    mimeType: 'application/pdf',
    buffer: approvedPdf,
  });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.locator('[data-testid^="button-reopen-saved-study-"]').click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);

  // Take a stable before/after snapshot around the forced provider failure.
  await page.getByTestId('toggle-live-session').uncheck();
  const savedBeforeFailure = await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]')[0];
    return {
      transcript: saved?.transcript,
      evaluation: saved?.evaluation,
      phase: saved?.phase,
      citedPassageIds: saved?.citedPassageIds,
    };
  }, storageKey);
  expect(savedBeforeFailure).toMatchObject({
    transcript: answer,
    evaluation: null,
    phase: 'session',
    citedPassageIds: [],
  });

  await page.getByTestId('toggle-live-session').check();
  await expect(page.getByTestId('button-retry-live')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  const savedAfterFailure = await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]')[0];
    return {
      transcript: saved?.transcript,
      evaluation: saved?.evaluation,
      phase: saved?.phase,
      citedPassageIds: saved?.citedPassageIds,
    };
  }, storageKey);
  expect(savedAfterFailure).toEqual(savedBeforeFailure);

  await page.getByTestId('button-retry-live').click();
  // The app intentionally spaces model requests by eight seconds, including
  // an explicit retry immediately after the failed automatic check.
  await expect(page.getByTestId('status-live-check')).toContainText(
    'Current explanation checked',
    { timeout: 15_000 },
  );
  await expect.poll(() => page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]')[0];
    return saved?.evaluation?.assessments?.[0]?.verdict;
  }, storageKey)).toBe('supported');

  await page.getByTestId('button-back-setup').click();
  await page.getByTestId('input-file').setInputFiles({
    name: 'approved-slides.pdf',
    mimeType: 'application/pdf',
    buffer: changedPdf,
  });
  await expect(page.getByTestId('status-upload-error')).toContainText('not the approved source');
  await expect(page.locator('[aria-label="Saved studies"]')).toBeVisible();

  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-testid^="button-delete-saved-study-"]').click();
  await expect(page.locator('[data-testid^="button-delete-saved-study-"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
});
