import { expect, test } from '@playwright/test';

for (const status of [429, 503]) {
  test(`allowance read ${status} leaves the explanation editable and saved`, async ({ page }) => {
    const pdf = Buffer.from('%PDF-1.4 allowance recovery fixture');
    const source = {
      id: 'allowance-fixture', title: 'Distributed Systems', author: 'Fixture',
      filename: 'approved.pdf', downloadUrl: 'https://example.test/approved.pdf',
      byteLength: pdf.byteLength, pageCount: 10, scope: 'Slides 4–10',
      referenceText: 'Load balancing distributes requests across servers.',
      referenceLines: [{ id: 'S01', page: 4, text: 'Load balancing distributes requests across servers.' }],
      aiAvailable: true,
    };
    let evaluations = 0;
    await page.route('**/api/study/demo', route => route.fulfill({ json: source }));
    await page.route('**/api/study/demo/upload', route => route.fulfill({
      json: { source, sourceToken: 'fixture-source-token' },
    }));
    await page.route('**/api/study/prepare', route => route.fulfill({
      json: { topic: source.title, nodes: [], edges: [] },
    }));
    await page.route('**/api/study/allowance', route => route.fulfill({
      status, headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' },
      json: { code: status === 429 ? 'allowance_read_throttled' : 'evaluation_budget_unavailable',
        error: 'Retry shortly; editing is still available.' },
    }));
    await page.route('**/api/study/evaluate', route => {
      evaluations++;
      return route.fulfill({ status: 503, json: { error: 'Unexpected evaluation' } });
    });
    await page.goto('/');
    await page.getByTestId('button-start-live').click();
    await page.getByTestId('input-file').setInputFiles({
      name: source.filename, mimeType: 'application/pdf', buffer: pdf,
    });
    await expect(page.getByTestId('status-source-verified')).toBeVisible();
    await page.getByTestId('button-prepare').click();
    const allowanceStatus = page.getByTestId('status-check-allowance');
    await expect(allowanceStatus).toContainText('unavailable');
    const input = page.getByTestId('input-transcript');
    await expect(input).toBeEditable();
    await input.fill('An initial explanation while allowance storage is unavailable.');
    const edited = 'Load balancing distributes requests across servers to improve availability.';
    await input.fill(edited);
    await expect(input).toHaveValue(edited);
    await expect.poll(() => page.evaluate(() => {
      const studies = JSON.parse(localStorage.getItem('hearo.saved-studies.v2') ?? '[]');
      return studies[0]?.transcript;
    })).toBe(edited);
    expect(evaluations).toBe(0);
  });
}
