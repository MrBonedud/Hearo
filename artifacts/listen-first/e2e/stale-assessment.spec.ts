import { expect, test, type Page } from '@playwright/test';

const storageKey = 'hearo.saved-studies.v2';
const firstPdf = Buffer.from('%PDF-1.4 first verified fixture');
const secondPdf = Buffer.from('%PDF-1.4 other verified fixture');
const originalAnswer = 'Load balancing spreads requests across servers to improve availability.';
const editedAnswer = 'A single server handles every request with no distribution of work.';
const staleMarker = 'STALE_RESPONSE_MUST_NOT_APPEAR';
const freshMarker = 'Fresh assessment for the current explanation.';
const prefixMarker = 'Assessment for the checked prefix only.';
const appendedWords = ' It also keeps the service available when one server fails.';
const appendedAnswer = originalAnswer + appendedWords;

const firstSource = {
  id: 'verified-first', title: 'Distributed Systems', author: 'Test fixture',
  filename: 'first.pdf', downloadUrl: 'https://example.test/first.pdf',
  byteLength: firstPdf.byteLength, pageCount: 10, scope: 'Slides 4–10',
  referenceText: 'Load balancing distributes requests across servers.',
  referenceLines: [
    { id: 'S01', page: 4, text: 'Load balancing distributes requests across servers.' },
    { id: 'S03', page: 6, text: 'Other servers can continue serving requests when one server fails.' },
  ],
  aiAvailable: true,
};
const secondSource = {
  ...firstSource, id: 'verified-second', title: 'Availability',
  filename: 'second.pdf', downloadUrl: 'https://example.test/second.pdf',
  byteLength: secondPdf.byteLength,
  referenceText: 'Distributing requests improves availability.',
  referenceLines: [{ id: 'S02', page: 5, text: 'Distributing requests improves availability.' }],
};

function studyMap(topic: string) {
  return {
    topic, nodes: [{
      id: 'load-balancing', label: 'Load balancing',
      description: 'Distribute requests across servers.', status: 'skipped', evidence: null,
    }], edges: [],
  };
}

function assessment(topic: string, transcript: string, lineId: string, explanation: string) {
  const map = studyMap(topic);
  return {
    ...map,
    nodes: [{ ...map.nodes[0], status: 'understood', evidence: transcript }],
    feedback: [],
    assessments: [{
      conceptId: 'load-balancing', verdict: 'supported', studentEvidence: transcript,
      sourceLineIds: [lineId], confidence: 'medium', explanation,
      followUp: 'Explain the availability benefit.',
    }],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function savedStudies(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), storageKey);
}

async function verifyAndPrepare(page: Page, buffer: Buffer, name: string) {
  await page.getByTestId('input-file').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();
}

async function installFixtures(page: Page, delayFinal = false) {
  const started = deferred();
  const release = deferred();
  const delivered = deferred();
  const finalStarted = deferred();
  const finalRelease = deferred();
  let attempts = 0;
  const requests: Array<{ sourceToken: string; transcript: string }> = [];
  await page.route('**/api/study/allowance', route => route.fulfill({
    json: { remainingChecks: 50, dailyLimit: 50, resetAt: '2099-01-01T00:00:00.000Z', available: true },
  }));
  await page.route('**/api/study/demo', route => route.fulfill({ json: firstSource }));
  await page.route('**/api/study/demo/upload', route => {
    const bytes = route.request().postDataBuffer();
    if (bytes?.equals(firstPdf)) {
      return route.fulfill({ json: { source: firstSource, sourceToken: 'first-token' } });
    }
    if (bytes?.equals(secondPdf)) {
      return route.fulfill({ json: { source: secondSource, sourceToken: 'second-token' } });
    }
    return route.fulfill({ status: 400, json: { error: 'Unverified fixture.' } });
  });
  await page.route('**/api/study/prepare', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: studyMap(input.topic) });
  });
  await page.route('**/api/study/evaluate', async route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    const isFirst = ++attempts === 1;
    if (isFirst) {
      started.resolve();
      await release.promise;
    } else if (delayFinal) {
      finalStarted.resolve();
      await finalRelease.promise;
    }
    const selected = input.sourceToken === 'first-token' ? firstSource : secondSource;
    await route.fulfill({
      json: assessment(selected.title, input.transcript,
        delayFinal && !isFirst ? 'S03' : selected.referenceLines[0].id,
        isFirst ? delayFinal ? prefixMarker : staleMarker : freshMarker),
    });
    if (isFirst) delivered.resolve();
  });
  return { started, release, delivered, finalStarted, finalRelease, requests };
}

async function downloadText(page: Page, button: string) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId(button).click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function expectUnassessed(page: Page, answer: string) {
  // Live checks remain enabled until the old response has been processed:
  // disabling them earlier would mask broken text/source freshness guards.
  await expect(page.getByTestId('status-live-check')).toContainText('Waiting for your explanation');
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  await expect(page.locator('[aria-label="Source-backed assessment"]')).toHaveCount(0);
  await expect(page.getByTestId('button-download-previous-report')).toHaveCount(0);
  await expect(page.getByText(staleMarker)).toHaveCount(0);
  await page.getByTestId('toggle-live-session').uncheck();
  await expect.poll(async () => {
    const studies = await savedStudies(page);
    return studies.find((study: { transcript: string }) => study.transcript === answer)?.evaluation;
  }).toBeNull();
  for (const study of await savedStudies(page)) {
    expect(study.evaluation).toBeNull();
    expect(study.previousReport).toBeUndefined();
    expect(study.citedPassageIds).toEqual([]);
    expect(study.map.nodes.every((node: { status: string }) => node.status === 'skipped')).toBe(true);
  }
  expect(JSON.stringify(await savedStudies(page))).not.toContain(staleMarker);
}

async function expectFreshReport(page: Page, answer: string, sourceId: string) {
  await page.getByTestId('button-finish').click();
  await expect(page.getByTestId('button-download-report')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(freshMarker);
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(answer);
  await expect(page.getByText(staleMarker)).toHaveCount(0);
  await expect.poll(async () => {
    const study = (await savedStudies(page)).find(
      (item: { source: { id: string }; transcript: string }) =>
        item.source.id === sourceId && item.transcript === answer,
    );
    return {
      phase: study?.phase,
      explanation: study?.evaluation?.assessments[0]?.explanation,
      evidence: study?.evaluation?.assessments[0]?.studentEvidence,
    };
  }).toEqual({ phase: 'review', explanation: freshMarker, evidence: answer });
  const report = await downloadText(page, 'button-download-report');
  expect(report).toContain(answer);
  expect(report).toContain(freshMarker);
  expect(report).not.toContain(staleMarker);
}

test('a delayed result cannot grade replaced text or become its saved report', async ({ page }) => {
  const pending = await installFixtures(page);
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await verifyAndPrepare(page, firstPdf, 'first.pdf');
  await page.getByTestId('input-transcript').fill(originalAnswer);
  await pending.started.promise;
  expect(pending.requests[0]).toMatchObject({ sourceToken: 'first-token', transcript: originalAnswer });
  await page.getByTestId('input-transcript').fill(editedAnswer);
  await expect.poll(async () => (await savedStudies(page))[0]?.transcript).toBe(editedAnswer);
  pending.release.resolve();
  await pending.delivered.promise;
  await expectUnassessed(page, editedAnswer);
  await expectFreshReport(page, editedAnswer, firstSource.id);
  expect(pending.requests).toHaveLength(2);
  expect(pending.requests[1]).toMatchObject({ sourceToken: 'first-token', transcript: editedAnswer });
});

test('a delayed checked prefix stays separate from appended draft words until the exact final check', async ({ page }) => {
  const pending = await installFixtures(page, true);
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await verifyAndPrepare(page, firstPdf, 'first.pdf');
  await page.getByTestId('input-transcript').fill(originalAnswer);
  await pending.started.promise;
  expect(pending.requests).toEqual([expect.objectContaining({
    sourceToken: 'first-token', transcript: originalAnswer,
  })]);

  // Append rather than replace: the old result is valid live prefix feedback.
  await page.getByTestId('input-transcript').press('End');
  await page.getByTestId('input-transcript').pressSequentially(appendedWords);
  await expect(page.getByTestId('input-transcript')).toHaveValue(appendedAnswer);
  await expect.poll(async () => (await savedStudies(page))[0]?.transcript).toBe(appendedAnswer);
  pending.release.resolve();
  await pending.delivered.promise;
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(prefixMarker);
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(originalAnswer);
  await expect(page.getByTestId('assessment-load-balancing')).not.toContainText(appendedWords.trim());
  await expect(page.getByTestId('status-live-check')).toContainText('More words awaiting a check');
  // Keep the next check explicit so both pending snapshots can be inspected.
  await page.getByTestId('toggle-live-session').uncheck();

  const prefixEvaluation = assessment(firstSource.title, originalAnswer, 'S01', prefixMarker);
  const expectAppendedDraft = async () => {
    await expect.poll(async () => await savedStudies(page)).toEqual([
      expect.objectContaining({
        transcript: appendedAnswer,
        phase: 'session',
        evaluation: null,
        citedPassageIds: [],
        map: studyMap(firstSource.title),
        previousReport: { transcript: originalAnswer, evaluation: prefixEvaluation },
      }),
    ]);
  };
  await expectAppendedDraft();
  const previousDownload = await downloadText(page, 'button-download-previous-report');
  expect(previousDownload).toContain(`Your explanation:\n${originalAnswer}\n`);
  expect(previousDownload).toContain(`You said: ${originalAnswer}\n`);
  expect(previousDownload).toContain(prefixMarker);
  expect(previousDownload).toContain('Reference S01, slide 4:');
  expect(previousDownload).not.toContain(appendedWords.trim());
  expect(previousDownload).not.toContain(freshMarker);
  expect(previousDownload).not.toContain('Reference S03');

  await page.getByTestId('button-finish').click();
  await pending.finalStarted.promise;
  expect(pending.requests).toHaveLength(2);
  expect(pending.requests[1]).toMatchObject({ sourceToken: 'first-token', transcript: appendedAnswer });
  await expect(page.getByTestId('button-finish')).toContainText('Completing your final check');
  await expect(page.getByTestId('button-download-report')).toHaveCount(0);
  await expectAppendedDraft();

  pending.finalRelease.resolve();
  await expect(page.getByTestId('button-download-report')).toBeVisible();
  const finalEvaluation = assessment(firstSource.title, appendedAnswer, 'S03', freshMarker);
  await expect.poll(async () => await savedStudies(page)).toEqual([
    expect.objectContaining({
      transcript: appendedAnswer,
      phase: 'review',
      evaluation: finalEvaluation,
      citedPassageIds: ['S03'],
      map: { topic: finalEvaluation.topic, nodes: finalEvaluation.nodes, edges: finalEvaluation.edges },
      previousReport: { transcript: appendedAnswer, evaluation: finalEvaluation, overflowText: '' },
    }),
  ]);
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(appendedAnswer);
  await expect(page.getByTestId('assessment-load-balancing')).toContainText(freshMarker);
  await expect(page.getByText(prefixMarker)).toHaveCount(0);
  const finalDownload = await downloadText(page, 'button-download-report');
  expect(finalDownload).toContain(`Your explanation:\n${appendedAnswer}\n`);
  expect(finalDownload).toContain(`You said: ${appendedAnswer}\n`);
  expect(finalDownload).toContain(freshMarker);
  expect(finalDownload).toContain('Reference S03, slide 6:');
  expect(finalDownload).not.toContain(prefixMarker);
  expect(finalDownload).not.toContain('Reference S01');
  expect(pending.requests).toHaveLength(2);
});

test('a delayed result from another verified source is ignored even for identical text', async ({ page }) => {
  const pending = await installFixtures(page);
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await verifyAndPrepare(page, firstPdf, 'first.pdf');
  await page.getByTestId('input-transcript').fill(originalAnswer);
  await pending.started.promise;
  await page.getByTestId('button-back-setup').click();
  await verifyAndPrepare(page, secondPdf, 'second.pdf');
  // Identical text isolates source freshness from the transcript-prefix guard.
  await page.getByTestId('input-transcript').fill(originalAnswer);
  await expect.poll(async () => (await savedStudies(page)).length).toBe(2);
  await expect.poll(async () => {
  const studies = await savedStudies(page);
    return studies.find((study: { source: { id: string } }) => study.source.id === secondSource.id)?.transcript;
  }).toBe(originalAnswer);
  pending.release.resolve();
  await pending.delivered.promise;
  await expectUnassessed(page, originalAnswer);
  await expectFreshReport(page, originalAnswer, secondSource.id);
  expect(pending.requests).toHaveLength(2);
  expect(pending.requests[1]).toMatchObject({ sourceToken: 'second-token', transcript: originalAnswer });
  const studies = await savedStudies(page);
  expect(studies.find((study: { source: { id: string } }) => study.source.id === firstSource.id).evaluation).toBeNull();
  expect(JSON.stringify(studies)).not.toContain(staleMarker);
});
