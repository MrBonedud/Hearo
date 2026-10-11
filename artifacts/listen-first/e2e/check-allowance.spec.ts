import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const pdf = Buffer.from('%PDF-1.4 allowance test fixture');
const answer = 'Load balancing distributes requests across servers.';
const reportMarker = 'Allowance regression: the explanation matches the source.';
const beforeReset = new Date('2026-10-10T23:59:50.000Z');
const resetAt = '2026-10-11T00:00:00.000Z';
const nextReset = '2026-10-12T00:00:00.000Z';

const source = {
  id: 'allowance-source', title: 'Distributed Systems', author: 'Test fixture',
  filename: 'allowance.pdf', downloadUrl: 'https://example.test/allowance.pdf',
  byteLength: pdf.byteLength, pageCount: 10, scope: 'Slides 4–10',
  referenceText: answer,
  referenceLines: [{ id: 'S01', page: 4, text: answer }],
  aiAvailable: true,
};
const map = {
  topic: source.title,
  nodes: [{
    id: 'load-balancing', label: 'Load balancing', description: answer,
    status: 'skipped', evidence: null,
  }],
  edges: [],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// These routes exercise the real App, React Query and useLiveAssessment.
// Only the server boundary is mocked; no paid models or PDF fixture are needed.
async function installFixtures(context: BrowserContext) {
  const state = {
    remaining: 5,
    resetAt,
    blockedBy: null as 'session' | 'overall' | null,
    failRead: false,
    reads: 0,
    requests: [] as Array<{ transcript: string; sourceToken: string }>,
    holdEvaluation: false,
    started: deferred(),
    release: deferred(),
  };
  await context.route('**/api/study/demo', route => route.fulfill({ json: source }));
  await context.route('**/api/study/demo/upload', route => {
    expect(route.request().postDataBuffer()?.equals(pdf)).toBe(true);
    return route.fulfill({ json: { source, sourceToken: 'allowance-token' } });
  });
  await context.route('**/api/study/prepare', route => route.fulfill({ json: map }));
  await context.route('**/api/study/allowance', route => {
    state.reads++;
    if (state.failRead) return route.fulfill({ status: 503, json: { error: 'Read unavailable' } });
    return route.fulfill({
      json: {
        dailyLimit: 10, remainingChecks: state.remaining, resetAt: state.resetAt,
        available: state.remaining > 0 && state.blockedBy !== 'overall',
        blockedBy: state.remaining === 0 ? 'session' : state.blockedBy,
      },
    });
  });
  await context.route('**/api/study/evaluate', async route => {
    const input = route.request().postDataJSON();
    state.requests.push(input);
    state.remaining = Math.max(0, state.remaining - 1);
    state.started.resolve();
    if (state.holdEvaluation) await state.release.promise;
    await route.fulfill({
      json: {
        ...map, nodes: [{ ...map.nodes[0], status: 'understood', evidence: input.transcript }],
        feedback: [],
        assessments: [{
          conceptId: 'load-balancing', verdict: 'supported', studentEvidence: input.transcript,
          sourceLineIds: ['S01'], confidence: 'medium', explanation: reportMarker,
          followUp: 'Explain the availability benefit.',
        }],
      },
    });
  });
  return state;
}

async function prepare(page: Page) {
  // Install before React Query creates its polling timers.
  await page.clock.install({ time: new Date(beforeReset.getTime() - 60_000) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await page.getByTestId('input-file').setInputFiles({
    name: source.filename, mimeType: 'application/pdf', buffer: pdf,
  });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();
  await expect(page.getByTestId('status-check-allowance')).toContainText('Checks remaining');
  // Freeze timers only after setup has settled, with no explanation/debounce yet.
  await page.clock.pauseAt(beforeReset);
}

// Network promises use real time; React Query batches their notifications with
// timers. Drain those timers in small controlled steps without real-time sleeps.
async function expectStatus(page: Page, testId: string, text: string) {
  await expect.poll(async () => {
    await page.clock.runFor(10);
    return page.getByTestId(testId).textContent();
  }).toContain(text);
}

async function expectBalance(page: Page, remaining: number) {
  await expectStatus(page, 'status-check-allowance', `${remaining} / 10`);
}

async function expectEditableAndDownloadable(page: Page) {
  const input = page.getByTestId('input-transcript');
  await expect(input).toBeEditable();
  await input.fill(`${answer} I can keep editing while checks are paused.`);
  await expect(input).toHaveValue(`${answer} I can keep editing while checks are paused.`);
  await expect(page.getByTestId('toggle-live-session')).toBeEnabled();
  await expect(page.getByTestId('button-finish')).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('button-download-previous-report').click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain(reportMarker);
}

async function makePreviousReport(page: Page) {
  await page.getByTestId('input-transcript').fill(answer);
  await page.clock.runFor(1500);
  await expectStatus(page, 'status-live-check', 'Current explanation checked');
  // The kept report covers exactly this draft, so it is not "previous" yet;
  // expectEditableAndDownloadable edits the draft and then downloads it.
  await expect(page.getByTestId('button-download-previous-report')).toHaveCount(0);
}

test('an exhausted allowance resets at UTC midnight and resumes automatic checking', async ({ page, context }) => {
  const state = await installFixtures(context);
  state.remaining = 0;
  await prepare(page);
  await expectBalance(page, 0);
  await expect(page.getByTestId('status-check-allowance')).toContainText('No checks remain today');
  await expect(page.getByTestId('status-check-allowance').locator('time')).toHaveAttribute('datetime', resetAt);
  await page.getByTestId('input-transcript').fill(answer);
  await page.clock.runFor(2000);
  expect(state.requests).toHaveLength(0);
  state.remaining = 10;
  state.resetAt = nextReset;
  // Cross midnight and the 30-second poll without a reload or manual retry.
  await page.clock.runFor(30_000);
  await expectBalance(page, 10);
  await expect(page.getByTestId('status-check-allowance')).not.toContainText('No checks remain today');
  await expect(page.getByTestId('status-check-allowance')).not.toHaveClass('saved-study-warning');
  await expect(page.getByTestId('status-check-allowance').locator('time')).toHaveAttribute('datetime', nextReset);
  expect(await page.evaluate(() => new Date().toISOString())).toMatch(/^2026-10-11/);
  await page.clock.runFor(1500);
  await expectStatus(page, 'status-live-check', 'Current explanation checked');
  expect(state.requests).toHaveLength(1);
  await expectBalance(page, 9); // onSettled refreshes without another polling interval
});

test('another tab consumes the shared browser allowance and polling pauses only automatic checks', async ({ page, context }) => {
  const state = await installFixtures(context);
  state.remaining = 2;
  await prepare(page);
  await makePreviousReport(page);
  await expectBalance(page, 1);
  const otherTab = await context.newPage();
  await otherTab.goto('/');
  // A second page in the same browser context spends the last check. Keep the
  // first page untouched so only its poll (not an onSettled callback) refreshes.
  const result = await otherTab.evaluate(async input => {
    const response = await fetch('/api/study/evaluate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }, { ...map, referenceText: source.referenceText, sourceToken: 'allowance-token', transcript: answer });
  expect(result.status).toBe(200);
  expect(result.body.assessments[0].explanation).toBe(reportMarker);
  expect(state.requests).toHaveLength(2);
  await otherTab.close();
  // The original tab has no mutation/refetch of its own: its poll must see zero.
  await page.clock.runFor(30_000);
  await expectBalance(page, 0);
  await expectStatus(page, 'status-live-check', 'Live checks paused until the UTC reset');
  await expectEditableAndDownloadable(page);
  await page.clock.runFor(10_000);
  expect(state.requests).toHaveLength(2);
});

test('returning to the tab refetches allowance before the next poll', async ({ page, context }) => {
  const state = await installFixtures(context);
  await prepare(page);
  await expectBalance(page, 5);
  const reads = state.reads;
  // React Query listens for visibilitychange, not a synthetic window focus.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  state.remaining = 1;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await expectBalance(page, 1);
  expect(state.reads).toBe(reads + 1);
  await expect(page.getByTestId('status-check-allowance')).toContainText('Few checks remain');
  await expect(page.getByTestId('status-check-allowance')).toHaveClass('saved-study-warning');
  expect(state.requests).toHaveLength(0);
});

test('a failed allowance poll hides a stale balance but leaves editing, downloads and final checks usable', async ({ page, context }) => {
  const state = await installFixtures(context);
  await prepare(page);
  await makePreviousReport(page);
  await expectBalance(page, 4);
  state.failRead = true;
  await page.clock.runFor(30_000);
  await expectStatus(page, 'status-check-allowance', 'Allowance is unavailable');
  await expect(page.getByTestId('status-check-allowance')).not.toContainText('4 / 10');
  await expect(page.getByTestId('status-check-allowance').locator('time')).toHaveCount(0);
  await expectEditableAndDownloadable(page);
  await page.clock.runFor(10_000);
  expect(state.requests).toHaveLength(1);
  await page.getByTestId('button-finish').click();
  await expect.poll(async () => {
    await page.clock.runFor(10);
    return page.getByTestId('button-download-report').isVisible();
  }).toBe(true);
  expect(state.requests).toHaveLength(2);
});

test('the last in-flight live result is still applied after polling sees zero', async ({ page, context }) => {
  const state = await installFixtures(context);
  state.remaining = 1;
  state.holdEvaluation = true;
  await prepare(page);
  await page.getByTestId('input-transcript').fill(answer);
  await page.clock.runFor(1500);
  await state.started.promise;
  await expectStatus(page, 'status-live-check', 'Checking silently');
  await page.clock.runFor(30_000);
  await expectBalance(page, 0);
  await expect(page.getByTestId('status-check-allowance')).toContainText('Automatic checks are paused');
  state.release.resolve();
  await expectStatus(page, 'status-live-check', 'Live checks paused until the UTC reset');
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(reportMarker);
  await expect(page.getByTestId('concept-load-balancing')).toHaveClass(/status-understood/);
  await expectEditableAndDownloadable(page);
  await page.clock.runFor(10_000);
  expect(state.requests).toHaveLength(1);
});

test('shared service exhaustion does not describe a positive browser balance as zero', async ({ page, context }) => {
  const state = await installFixtures(context);
  await prepare(page);
  await makePreviousReport(page);
  state.blockedBy = 'overall';
  await page.clock.runFor(30_000);
  await expectStatus(page, 'status-check-allowance', 'The shared service has reached its daily limit');
  await expectBalance(page, 4);
  await expect(page.getByTestId('status-check-allowance')).not.toContainText('No checks remain today');
  await expectEditableAndDownloadable(page);
  await page.clock.runFor(10_000);
  expect(state.requests).toHaveLength(1);
});
