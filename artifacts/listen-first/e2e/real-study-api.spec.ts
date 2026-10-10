import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import pack from '../../../shared/topic-packs/system-design-slides.json' with { type: 'json' };

const clockFile = path.resolve(import.meta.dirname, '../../../generated-artifacts/study-api-clock.json');
test.beforeEach(() => writeFileSync(clockFile, 'null'));
test.afterEach(() => writeFileSync(clockFile, 'null'));

for (const failure of ['server error', 'interrupted request'] as const) {
  test(`a PDF upload ${failure} preserves the saved draft and allows real API recovery`, async ({ page }) => {
    const fixture = process.env.TEST_APPROVED_PDF;
    if (!fixture) throw new Error('TEST_APPROVED_PDF is required; run with playwright.api.config.ts.');
    const approvedPdf = readFileSync(fixture);
    expect(approvedPdf.length).toBe(pack.byteLength);
    const file = { name: 'original-approved.pdf', mimeType: 'application/pdf', buffer: approvedPdf };
    const storageKey = 'hearo.saved-studies.v2';
    const savedStudies = page.locator('[aria-label="Saved studies"]');
    const reopen = page.locator('[data-testid^="button-reopen-saved-study-"]');
    let evaluationAttempts = 0;
    let preparationAttempts = 0;
    page.on('request', request => {
      if (request.url().endsWith('/api/study/prepare')) preparationAttempts++;
    });
    // Even an accidental evaluation must never reach a paid provider.
    await page.route('**/api/study/evaluate', route => {
      evaluationAttempts++;
      return route.fulfill({ status: 503, json: { error: 'Evaluation disabled in upload recovery test.' } });
    });

    await page.goto('/');
    await page.getByTestId('button-start-live').click();
    await page.getByTestId('toggle-live-setup').uncheck();
    const initialUpload = page.waitForResponse('**/api/study/demo/upload');
    await page.getByTestId('input-file').setInputFiles(file);
    const initialResponse = await initialUpload;
    expect(initialResponse.status()).toBe(200);
    expect((await initialResponse.json()).source.aiAvailable).toBe(false);
    await expect(page.getByTestId('status-source-verified')).toBeVisible();
    const preparation = page.waitForResponse('**/api/study/prepare');
    await page.getByTestId('button-prepare').click();
    expect((await preparation).status()).toBe(200);
    const answer = 'Load balancing distributes requests across servers and keeps working when a server fails.';
    await page.getByTestId('input-transcript').fill(answer);
    await expect.poll(() => page.evaluate(key =>
      JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.transcript, storageKey)).toBe(answer);

    await page.reload();
    await page.getByTestId('button-start-live').click();
    await expect(savedStudies).toContainText(answer);
    const savedBefore = await page.evaluate(key => localStorage.getItem(key), storageKey);
    expect(JSON.parse(savedBefore!)).toEqual([
      expect.objectContaining({ transcript: answer, phase: 'session', evaluation: null }),
    ]);

    // Hold only this upload so the unverified pending state is also observable.
    // The initial upload, preparation, metadata, and subsequent retry use real routes.
    let releaseUpload!: () => void;
    const heldUpload = new Promise<void>(resolve => { releaseUpload = resolve; });
    await page.route('**/api/study/demo/upload', async route => {
      expect(route.request().postDataBuffer()?.equals(approvedPdf)).toBe(true);
      await heldUpload;
      if (failure === 'server error') {
        await route.fulfill({ status: 503, json: { error: 'Verification temporarily unavailable. Please try again.' } });
      } else {
        await route.abort('connectionreset');
      }
    }, { times: 1 });
    await page.getByTestId('input-file').setInputFiles(file);
    await expect(page.getByTestId('status-upload-pending')).toBeVisible();
    await expect(page.getByTestId('button-upload-reference')).toBeDisabled();
    await expect(page.getByTestId('button-prepare')).toBeDisabled();
    await expect(page.getByTestId('link-open-pdf')).toHaveCount(0);
    await expect(reopen).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(savedBefore);
    releaseUpload();

    const error = page.getByTestId('status-upload-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText(failure === 'server error' ? 'Please try again' : /fetch|network/i);
    await expect(page.getByTestId('status-upload-pending')).toHaveCount(0);
    await expect(page.getByTestId('status-source-verified')).toHaveCount(0);
    await expect(page.getByTestId('link-open-pdf')).toHaveCount(0);
    await expect(page.getByTestId('details-source-passages')).toHaveCount(0);
    await expect(page.getByTestId('button-prepare')).toBeDisabled();
    await expect(reopen).toHaveCount(0);
    await expect(page.getByTestId('button-upload-reference')).toBeEnabled();
    await expect(page.getByTestId('input-file')).toBeEnabled();
    await expect(savedStudies).toContainText(answer);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(savedBefore);
    expect(preparationAttempts).toBe(1);

    // Reselect the identical file, without a reload or synthetic success response.
    const retryUpload = page.waitForResponse('**/api/study/demo/upload');
    await page.getByTestId('input-file').setInputFiles(file);
    const recovered = await retryUpload;
    expect(recovered.status()).toBe(200);
    expect(recovered.request().headers()['content-type']).toBe('application/pdf');
    expect(recovered.request().postDataBuffer()?.equals(approvedPdf)).toBe(true);
    expect(await recovered.json()).toMatchObject({
      source: { id: pack.id, aiAvailable: false }, sourceToken: expect.any(String),
    });
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId('status-source-verified')).toBeVisible();
    await expect(page.getByTestId('link-open-pdf')).toHaveAttribute('href', /^blob:/);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(savedBefore);
    await expect(reopen).toHaveCount(1);
    await reopen.click();
    await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
    await expect.poll(() => page.evaluate(key =>
      JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.transcript, storageKey)).toBe(answer);
    expect(evaluationAttempts).toBe(0);
  });
}

test('real API verifies the source, prepares a study, and recovers only with the original PDF', async ({ page }) => {
  const fixture = process.env.TEST_APPROVED_PDF;
  if (!fixture) throw new Error('TEST_APPROVED_PDF is required; run with playwright.api.config.ts.');
  const approvedPdf = readFileSync(fixture);
  expect(approvedPdf.length).toBe(pack.byteLength);
  const changedPdf = Buffer.from(approvedPdf);
  changedPdf[changedPdf.length - 20] ^= 1;
  expect(changedPdf.length).toBe(approvedPdf.length);

  // Defense in depth: no evaluation request can reach even the key-free API.
  let evaluationAttempts = 0;
  await page.route('**/api/study/evaluate', route => {
    evaluationAttempts++;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Evaluation disabled in source recovery smoke test.' }),
    });
  });

  await page.goto('/');
  const metadataResponse = page.waitForResponse('**/api/study/demo');
  await page.getByTestId('button-start-live').click();
  const metadata = await (await metadataResponse).json();
  expect(metadata.id).toBe(pack.id);
  expect(metadata.aiAvailable).toBe(false);
  expect(metadata.sourceToken).toBeUndefined();
  await page.getByTestId('toggle-live-setup').uncheck();

  const uploadResponse = page.waitForResponse('**/api/study/demo/upload');
  await page.getByTestId('input-file').setInputFiles({
    name: 'renamed-approved-source.pdf', mimeType: 'application/pdf', buffer: approvedPdf,
  });
  const uploaded = await uploadResponse;
  expect(uploaded.status()).toBe(200);
  expect(uploaded.request().headers()['content-type']).toBe('application/pdf');
  expect(uploaded.request().postDataBuffer()?.equals(approvedPdf)).toBe(true);
  const verified = await uploaded.json();
  expect(verified.source).toEqual(metadata);
  expect(verified.sourceToken).toEqual(expect.any(String));
  expect(verified.sourceToken.length).toBeGreaterThan(0);
  await expect(page.getByTestId('status-source-verified')).toBeVisible();

  const preparationResponse = page.waitForResponse('**/api/study/prepare');
  await page.getByTestId('button-prepare').click();
  const prepared = await preparationResponse;
  expect(prepared.status()).toBe(200);
  expect(prepared.request().postDataJSON()).toEqual({
    topic: metadata.title, referenceText: metadata.referenceText, sourceToken: verified.sourceToken,
  });
  expect(await prepared.json()).toEqual({
    topic: pack.title,
    nodes: pack.concepts.map(concept => ({
      id: concept.id, label: concept.label, description: concept.description,
      status: 'skipped', evidence: null,
    })),
    edges: pack.edges,
  });
  await expect(page.getByTestId('input-transcript')).toBeVisible();
  const answer = 'A load balancer distributes requests across multiple servers.';
  await page.getByTestId('input-transcript').fill(answer);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hearo.saved-studies.v2') ?? '[]');
    return saved[0]?.transcript;
  })).toBe(answer);

  await page.reload();
  await page.getByTestId('button-start-live').click();
  await expect(page.locator('[aria-label="Saved studies"]')).toBeVisible();
  await expect(page.getByTestId('button-prepare')).toBeDisabled();
  await expect(page.locator('[data-testid^="button-reopen-saved-study-"]')).toHaveCount(0);

  const rejectedResponse = page.waitForResponse('**/api/study/demo/upload');
  await page.getByTestId('input-file').setInputFiles({
    name: 'renamed-approved-source.pdf', mimeType: 'application/pdf', buffer: changedPdf,
  });
  expect((await rejectedResponse).status()).toBe(400);
  await expect(page.getByTestId('status-upload-error')).toContainText('Use the original Stanford PDF');
  await expect(page.getByTestId('status-source-verified')).toHaveCount(0);
  await expect(page.getByTestId('button-prepare')).toBeDisabled();
  await expect(page.locator('[data-testid^="button-reopen-saved-study-"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Saved studies"]')).toContainText(answer);

  const recoveredResponse = page.waitForResponse('**/api/study/demo/upload');
  await page.getByTestId('input-file').setInputFiles({
    name: 'renamed-approved-source.pdf', mimeType: 'application/pdf', buffer: approvedPdf,
  });
  expect((await recoveredResponse).status()).toBe(200);
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  await page.locator('[data-testid^="button-reopen-saved-study-"]').click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  expect(evaluationAttempts).toBe(0);
});

test('two-hour source expiry rejects checks without losing the saved explanation, and the original PDF restores access', async ({ page }) => {
  const fixture = process.env.TEST_APPROVED_PDF;
  if (!fixture) throw new Error('TEST_APPROVED_PDF is required; run with playwright.api.config.ts.');
  const approvedPdf = readFileSync(fixture);
  expect(approvedPdf.length).toBe(pack.byteLength);
  const issuedAt = Date.now();
  writeFileSync(clockFile, JSON.stringify(issuedAt));
  const answer = 'A load balancer distributes requests across servers. توزيع الطلبات بين الخوادم.';
  let expiredEvaluation: { error: string } | undefined;
  const evaluationRequests: unknown[] = [];
  // Browser evaluation stays intercepted. Only an explicitly expired request
  // is sent directly to the real, key-free API below to check its auth guard.
  await page.route('**/api/study/evaluate', route => {
    evaluationRequests.push(route.request().postDataJSON());
    return route.fulfill({
      status: expiredEvaluation ? 400 : 503,
      contentType: 'application/json',
      body: JSON.stringify(expiredEvaluation ?? { error: 'Evaluation disabled in source expiry test.' }),
    });
  });
  const savedStudies = () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hearo.saved-studies.v2') ?? '[]');
    // Returning to setup legitimately saves again. Compare every persisted
    // content field and study ID, not the time of that unchanged save.
    return saved.map(({ savedAt: _savedAt, ...contents }: { savedAt: number; [key: string]: unknown }) => contents);
  });
  const uploadOriginal = async () => {
    const response = page.waitForResponse('**/api/study/demo/upload');
    await page.getByTestId('input-file').setInputFiles({
      name: pack.filename, mimeType: 'application/pdf', buffer: approvedPdf,
    });
    const uploaded = await response;
    expect(uploaded.status()).toBe(200);
    const verified = await uploaded.json();
    expect(verified.source.aiAvailable).toBe(false);
    await expect(page.getByTestId('status-source-verified')).toBeVisible();
    return verified;
  };
  const expiresAt = (token: string) => {
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(payload.hash).toBe(pack.sha256);
    expect(payload.expires).toEqual(expect.any(Number));
    return payload.expires as number;
  };

  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await page.getByTestId('toggle-live-setup').uncheck();
  const verified = await uploadOriginal();
  expect(expiresAt(verified.sourceToken)).toBe(issuedAt + 2 * 60 * 60 * 1000);
  const sourceInput = {
    topic: verified.source.title, referenceText: verified.source.referenceText,
    sourceToken: verified.sourceToken,
  };
  const preparedResponse = page.waitForResponse('**/api/study/prepare');
  await page.getByTestId('button-prepare').click();
  const prepared = await preparedResponse;
  expect(prepared.status()).toBe(200);
  const map = await prepared.json();
  await page.getByTestId('input-transcript').fill(answer);
  await expect.poll(async () => (await savedStudies())[0]?.transcript).toBe(answer);
  const originalSaved = await savedStudies();
  expect(originalSaved).toHaveLength(1);

  // At the last valid millisecond it still works; at expiry it must fail.
  writeFileSync(clockFile, JSON.stringify(expiresAt(verified.sourceToken) - 1));
  expect((await page.request.post('/api/study/prepare', { data: sourceInput })).status()).toBe(200);
  writeFileSync(clockFile, JSON.stringify(expiresAt(verified.sourceToken)));
  const deniedPrepare = await page.request.post('/api/study/prepare', { data: sourceInput });
  expect(deniedPrepare.status()).toBe(400);
  expect((await deniedPrepare.json()).error).toContain('two-hour session expired');
  const evaluationInput = {
    ...sourceInput, transcript: answer, nodes: map.nodes, edges: map.edges,
  };
  const deniedEvaluation = await page.request.post('/api/study/evaluate', { data: evaluationInput });
  expect(deniedEvaluation.status()).toBe(400);
  expiredEvaluation = await deniedEvaluation.json();
  expect(expiredEvaluation?.error).toContain('Select the PDF again if your session expired');
  await page.getByTestId('button-finish').click();
  await expect(page.getByTestId('status-session-error')).toContainText(expiredEvaluation!.error);
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  expect(evaluationRequests).toEqual([evaluationInput]);
  expect(await savedStudies()).toEqual(originalSaved);

  // Exercise the preparation prompt too, with a genuinely issued token.
  await page.getByTestId('button-back-setup').click();
  await expect(page.locator('[aria-label="Saved studies"]')).toContainText(answer);
  const setupVerified = await uploadOriginal();
  writeFileSync(clockFile, JSON.stringify(expiresAt(setupVerified.sourceToken)));
  const rejectedPreparation = page.waitForResponse('**/api/study/prepare');
  await page.getByTestId('button-prepare').click();
  expect((await rejectedPreparation).status()).toBe(400);
  await expect(page.getByTestId('status-setup-error')).toContainText('If your two-hour session expired, select it again');
  await expect(page.locator('[aria-label="Saved studies"]')).toContainText(answer);
  expect(await savedStudies()).toEqual(originalSaved);

  const renewed = await uploadOriginal();
  expect(renewed.sourceToken).not.toBe(setupVerified.sourceToken);
  const renewedPrepare = await page.request.post('/api/study/prepare', {
    data: { ...sourceInput, sourceToken: renewed.sourceToken },
  });
  expect(renewedPrepare.status()).toBe(200);
  expect(await renewedPrepare.json()).toEqual(map);
  // Re-upload issues a fresh authorization; it must not revive an old one.
  expect((await page.request.post('/api/study/prepare', { data: sourceInput })).status()).toBe(400);
  await page.locator('[data-testid^="button-reopen-saved-study-"]').click();
  await expect(page.getByTestId('input-transcript')).toHaveValue(answer);
  expect(await savedStudies()).toEqual(originalSaved);
  expect(evaluationRequests).toHaveLength(1);
});
