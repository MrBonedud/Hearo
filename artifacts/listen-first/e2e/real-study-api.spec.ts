import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import pack from '../../../shared/topic-packs/system-design-slides.json' with { type: 'json' };

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
