import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Regressions for screen changes inside the single-page study flow: the report
// opening position, the previous-report notice, and the "How it works" control.
// Only the server boundary is mocked; the real App, storage and live checks run.

const pdf = Buffer.from('%PDF-1.4 screen navigation fixture');
const answer = 'Load balancing distributes requests across several servers so no single server is overloaded.';
const appended = ' It also keeps the service available when one server fails.';
const reportMarker = 'Navigation regression: the explanation matches the source.';

const source = {
  id: 'navigation-source', title: 'Distributed Systems', author: 'Test fixture',
  filename: 'navigation.pdf', downloadUrl: 'https://example.test/navigation.pdf',
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

async function installFixtures(context: BrowserContext) {
  const requests: string[] = [];
  await context.route('**/api/study/demo', route => route.fulfill({ json: source }));
  await context.route('**/api/study/demo/upload', route => route.fulfill({ json: { source, sourceToken: 'navigation-token' } }));
  await context.route('**/api/study/prepare', route => route.fulfill({ json: map }));
  await context.route('**/api/study/allowance', route => route.fulfill({
    json: { dailyLimit: 50, remainingChecks: 40, resetAt: '2099-01-01T00:00:00.000Z', available: true, blockedBy: null },
  }));
  await context.route('**/api/study/evaluate', async route => {
    const input = route.request().postDataJSON();
    requests.push(input.transcript);
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
  return requests;
}

async function openStudy(page: Page, { live }: { live: boolean }) {
  await page.getByTestId('input-file').setInputFiles({ name: source.filename, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  const toggle = page.getByTestId('toggle-live-setup');
  if ((await toggle.isChecked()) !== live) await toggle.click();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();
}

async function startFromLanding(page: Page, live: boolean) {
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await openStudy(page, { live });
}

async function downloadText(page: Page, button: string) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId(button).click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function finishFromBottom(page: Page) {
  // Learners reach "Finish & report" after scrolling through the session.
  await page.getByTestId('button-finish').scrollIntoViewIfNeeded();
  expect(await scrollY(page)).toBeGreaterThan(100);
  await page.getByTestId('button-finish').click();
  await expect(page.getByTestId('button-download-report')).toBeVisible({ timeout: 15_000 });
}

async function expectReportAtTop(page: Page) {
  expect(await scrollY(page)).toBe(0);
  await expect(page.locator('.review-title')).toBeInViewport();
  await expect(page.locator('.review-description')).toBeInViewport();
  await expect(page.getByTestId('button-back-review')).toBeInViewport();
  // The finish button no longer exists, so keyboard focus moves to the report title.
  await expect(page.locator('.review-title')).toBeFocused();
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 720 }]) {
  test(`Finish & report opens the report at its top at ${viewport.width}px, including repeated completions`, async ({ page, context }) => {
    const requests = await installFixtures(context);
    await page.setViewportSize(viewport);
    await startFromLanding(page, false);
    await page.getByTestId('input-transcript').fill(answer);

    await finishFromBottom(page);
    await expectReportAtTop(page);
    await expect(page.locator('.transcript-review')).toContainText(answer);
    await expect(page.getByTestId('assessment-load-balancing')).toContainText(reportMarker);

    // Back to the study keeps the explanation and also starts at the top.
    await page.getByTestId('button-back-review').click();
    await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
    expect(await scrollY(page)).toBe(0);

    // A second completion with more words reports the new explanation only.
    await page.getByTestId('input-transcript').fill(answer + appended);
    await finishFromBottom(page);
    await expectReportAtTop(page);
    await expect(page.locator('.transcript-review')).toContainText(answer + appended);
    expect(requests).toEqual([answer, answer + appended]);
    const report = await downloadText(page, 'button-download-report');
    expect(report).toContain(`Your explanation:\n${answer + appended}\n`);
  });
}

test('the previous-report notice appears only while the draft differs from the last checked report', async ({ page, context }) => {
  await installFixtures(context);
  await startFromLanding(page, true);
  const notice = page.getByTestId('button-download-previous-report');
  // Nothing has been checked yet.
  await expect(notice).toHaveCount(0);

  await page.getByTestId('input-transcript').fill(answer);
  await expect(page.getByTestId('status-live-check')).toContainText('Current explanation checked');
  // The check covers exactly the current draft, so there is no "previous" report.
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(reportMarker);
  await expect(notice).toHaveCount(0);

  // Typing past the checked words makes the last check a previous report.
  await page.getByTestId('toggle-live-session').uncheck();
  await page.getByTestId('input-transcript').fill(answer + appended);
  await expect(notice).toBeVisible();
  await expect(page.getByText('Your previous report covers only its checked explanation')).toBeVisible();
  const previous = await downloadText(page, 'button-download-previous-report');
  expect(previous).toContain(`Your explanation:\n${answer}\n`);
  expect(previous).not.toContain(appended.trim());

  // Restoring the exact checked words makes the notice untrue again.
  await page.getByTestId('input-transcript').fill(answer);
  await expect(notice).toHaveCount(0);

  // After the final report, returning to the same words shows no notice.
  await page.getByTestId('button-finish').click();
  await expect(page.getByTestId('button-download-report')).toBeVisible();
  await page.getByTestId('button-back-review').click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  await expect(notice).toHaveCount(0);
  await page.getByTestId('input-transcript').fill(`${answer} Draft words.`);
  await expect(notice).toBeVisible();
  const afterReport = await downloadText(page, 'button-download-previous-report');
  expect(afterReport).toContain(`Your explanation:\n${answer}\n`);
  expect(afterReport).not.toContain('Draft words.');

  // A new study must not inherit the earlier study's report or notice.
  await page.getByTestId('button-back-setup').click();
  await openStudy(page, { live: true });
  await expect(page.getByTestId('input-transcript')).toHaveValue('');
  await expect(page.locator('[aria-label="Source-backed assessment"]')).toHaveCount(0);
  await expect(notice).toHaveCount(0);
});

test('reopened saved studies show the notice only when the saved draft moved past its report', async ({ page, context }) => {
  await installFixtures(context);
  await startFromLanding(page, true);
  await page.getByTestId('input-transcript').fill(answer);
  await expect(page.getByTestId('status-live-check')).toContainText('Current explanation checked');
  await page.getByTestId('toggle-live-session').uncheck();
  await page.getByTestId('input-transcript').fill(answer + appended);
  await expect(page.getByTestId('button-download-previous-report')).toBeVisible();

  // Leave the edited draft, then complete a second study whose report matches its words.
  await page.getByTestId('button-back-setup').click();
  await openStudy(page, { live: false });
  await page.getByTestId('input-transcript').fill(answer);
  await page.getByTestId('button-finish').click();
  // Checks are spaced at least eight seconds apart, so this final check may queue.
  await expect(page.getByTestId('button-download-report')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('button-new-session').click();

  const studies = await page.evaluate(() => JSON.parse(localStorage.getItem('hearo.saved-studies.v2') ?? '[]'));
  const draft = studies.find((study: { transcript: string }) => study.transcript === answer + appended);
  const report = studies.find((study: { transcript: string; phase: string }) => study.transcript === answer && study.phase === 'review');
  expect(draft?.previousReport?.transcript).toBe(answer);
  expect(report?.previousReport?.transcript).toBe(answer);

  await page.getByTestId('input-file').setInputFiles({ name: source.filename, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.getByTestId(`button-reopen-saved-study-${report.id}`).click();
  await expect(page.getByTestId('button-download-report')).toBeVisible();
  await page.getByTestId('button-back-review').click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  await expect(page.getByTestId('button-download-previous-report')).toHaveCount(0);

  await page.getByTestId('button-back-setup').click();
  await page.getByTestId('input-file').setInputFiles({ name: source.filename, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.getByTestId(`button-reopen-saved-study-${draft.id}`).click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer + appended);
  await expect(page.getByTestId('button-download-previous-report')).toBeVisible();
});

test('"How it works" is offered only where an explanation section exists and reaches it by keyboard', async ({ page, context }) => {
  await installFixtures(context);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const help = page.getByTestId('button-how-it-works');

  // Landing page: the three-step story section.
  await expect(help).toBeVisible();
  await expect(help).toHaveAccessibleName('How it works');
  await help.click();
  await expect(page.locator('.landing-story')).toBeInViewport();
  await expect(page.locator('.landing-story')).toBeFocused();
  expect(await scrollY(page)).toBeGreaterThan(0);

  // Keyboard activation behaves the same as a click.
  await page.evaluate(() => window.scrollTo(0, 0));
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.landing-story')).toBeInViewport();
  await expect(page.locator('.landing-story')).toBeFocused();

  // Setup page: the "Hearo's promise" strip with the same three steps.
  await page.getByTestId('nav-learn').click();
  await expect(page.getByTestId('button-prepare')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 720 });
  await help.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.how-strip')).toBeInViewport();
  await expect(page.locator('.how-strip')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });

  // Study, report and sample screens have no such section, so no dead control.
  await openStudy(page, { live: false });
  await expect(help).toHaveCount(0);
  await page.getByTestId('input-transcript').fill(answer);
  await page.getByTestId('button-finish').click();
  await expect(page.getByTestId('button-download-report')).toBeVisible();
  await expect(help).toHaveCount(0);
  await page.getByTestId('button-home').click();
  await expect(page.getByTestId('screen-landing')).toBeVisible();
  await expect(help).toBeVisible();
  await page.getByTestId('button-start-sample').click();
  await expect(page.getByTestId('screen-offline-sample')).toBeVisible();
  await expect(help).toHaveCount(0);
  // The language switcher keeps its place in the top bar on every screen.
  await expect(page.getByTestId('button-language')).toBeVisible();
});

test('the practice sample keeps keyboard focus and the step start in view on every step', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');
  await page.getByTestId('button-start-sample').click();
  const heading = page.locator('.sample-main h1');
  await page.getByTestId('button-sample-begin').focus();
  await page.keyboard.press('Enter');
  let steps = 0;
  for (;;) {
    // The pressed button was replaced: focus is on the new step's heading, not lost to the page.
    await expect(heading).toBeFocused();
    await expect(page.locator('.sample-step')).toBeInViewport();
    await expect(heading).toHaveAccessibleDescription(/Illustration \d+ \/ \d+|complete/);
    if (await page.getByTestId('sample-report').count()) break;
    // One Tab reaches the control that advances the tour.
    await page.keyboard.press('Tab');
    const next = page.locator('[data-testid="button-sample-next"], [data-testid="button-sample-finish"]');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    steps += 1;
    expect(steps).toBeLessThan(12);
  }
  expect(steps).toBeGreaterThan(1);
  await expect(page.getByTestId('sample-report').getByRole('heading')).toBeInViewport();
});

test('the Saved navigation opens setup at the saved-studies section after it renders', async ({ page, context }) => {
  await installFixtures(context);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  await page.getByTestId('nav-saved').click();
  await expect(page.locator('#saved-studies')).toBeInViewport();
  await expect(page.locator('#saved-studies')).toBeFocused();
  expect(await scrollY(page)).toBeGreaterThan(0);
  // Already on setup: the same control scrolls back to the section.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('nav-saved').click();
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  await expect(page.locator('#saved-studies')).toBeFocused();
});
