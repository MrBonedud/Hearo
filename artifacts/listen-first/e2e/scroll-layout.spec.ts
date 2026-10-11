import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Scroll-model regressions: the document is the only vertical scroller, side
// panels stick only while they fit, and the concept map never hides concepts
// behind an unannounced horizontal scroll. Only the server boundary is mocked.

const pdf = Buffer.from('%PDF-1.4 scroll layout fixture');
const answer = 'Load balancing distributes requests across several servers so no single server is overloaded.';
const source = {
  id: 'scroll-source', title: 'Distributed Systems', author: 'Test fixture',
  filename: 'scroll.pdf', downloadUrl: 'https://example.test/scroll.pdf',
  byteLength: pdf.byteLength, pageCount: 10, scope: 'Slides 4–10',
  referenceText: answer,
  referenceLines: [{ id: 'S01', page: 4, text: answer }],
  aiAvailable: true,
};
const map = {
  topic: source.title,
  nodes: [
    { id: 'root', label: 'Scale out vs. scale up', description: answer, status: 'skipped', evidence: null },
    { id: 'left', label: 'Load balancing', description: answer, status: 'skipped', evidence: null },
    { id: 'right', label: 'Data sharding', description: answer, status: 'skipped', evidence: null },
  ],
  edges: [{ from: 'root', to: 'left', label: 'distribute work' }, { from: 'root', to: 'right', label: 'scale storage' }],
};

async function installFixtures(context: BrowserContext) {
  await context.route('**/api/study/demo', route => route.fulfill({ json: source }));
  await context.route('**/api/study/demo/upload', route => route.fulfill({ json: { source, sourceToken: 'scroll-token' } }));
  await context.route('**/api/study/prepare', route => route.fulfill({ json: map }));
  await context.route('**/api/study/allowance', route => route.fulfill({
    json: { dailyLimit: 50, remainingChecks: 40, resetAt: '2099-01-01T00:00:00.000Z', available: true, blockedBy: null },
  }));
}

async function openSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('button-start-sample').click();
  await expect(page.getByTestId('screen-offline-sample')).toBeVisible();
}

const documentOverflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('sample reference excerpts open in the page flow with their real slide text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSample(page);
  await page.getByTestId('button-sample-begin').click();

  // Closed: no hidden list of unexplained entries in the page.
  await expect(page.getByTestId('list-sample-excerpts')).toHaveCount(0);
  await page.getByTestId('button-sample-excerpts').click();
  const list = page.getByTestId('list-sample-excerpts');
  await expect(list).toBeVisible();
  await expect(page.getByText('Exact lines from the approved English slides that this sample draws on.')).toBeVisible();

  const items = list.locator('li');
  await expect(items).toHaveCount(21);
  const texts = await items.locator('p').allTextContents();
  expect(texts.every(text => text.trim().length > 10)).toBe(true);
  await expect(page.getByTestId('sample-excerpt-S04-01')).toContainText('S04-01 · Slide 4');
  await expect(page.getByTestId('sample-excerpt-S04-01')).toContainText('Expand capacity by adding more instances');
  // The current concept's lines are marked, so the map and its evidence read together.
  await expect(list.locator('li.is-used')).toHaveCount(3);
  await expect(page.getByTestId('sample-excerpt-S04-02')).toContainText('Used in this step');

  // The list is not an inner scroll box: wheeling over it moves the page.
  const inner = await list.evaluate(element => ({ overflowY: getComputedStyle(element).overflowY, extra: element.scrollHeight - element.clientHeight }));
  expect(inner.overflowY === 'visible' || inner.extra <= 1).toBe(true);
  await page.getByTestId('sample-excerpt-S05-01').scrollIntoViewIfNeeded();
  const box = (await page.getByTestId('sample-excerpt-S05-01').boundingBox())!;
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);

  // The aside is in normal flow and the footer stays reachable below the excerpts.
  expect(await page.getByTestId('sample-concept-map').evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.keyboard.press('End');
  await expect(page.locator('.site-footer')).toBeInViewport();
  expect(await documentOverflowX(page)).toBe(0);

  // Moving to the next concept moves the markers with it.
  await page.getByTestId('button-sample-next').click();
  await expect(page.getByTestId('sample-excerpt-S04-01')).not.toContainText('Used in this step');
  await expect(page.getByTestId('sample-excerpt-S05-01')).toContainText('Used in this step');
});

for (const locale of ['en-US', 'ar-JO']) {
  test(`the concept map fits a 375px phone without hidden concepts (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale });
    const page = await context.newPage();
    await openSample(page);
    const graph = page.getByTestId('concept-map-graph');
    await expect(graph).toBeVisible();
    const fit = await graph.evaluate(element => ({ graph: element.getBoundingClientRect().width, container: element.parentElement!.clientWidth }));
    expect(fit.graph).toBeLessThanOrEqual(fit.container);
    await expect(page.getByTestId('text-map-scroll-hint')).toHaveCount(0);
    for (const id of ['scaling', 'load-balancing', 'stateless-servers', 'sharding', 'replication', 'caching']) {
      const node = page.getByTestId(`concept-${id}`);
      const label = await node.locator('strong').evaluate(element => ({ clipped: element.scrollHeight > element.clientHeight + 1 }));
      expect(label.clipped, `${id} label is clipped`).toBe(false);
    }
    expect(await documentOverflowX(page)).toBe(0);
    await context.close();
  });
}

test('a map wider than a 320px screen scrolls inside the map and says so', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openSample(page);
  await expect(page.getByTestId('text-map-scroll-hint')).toBeVisible();
  // The map scrolls by keyboard as well as by touch.
  const scroller = page.locator('.concept-map-scroll');
  await expect(scroller).toHaveAttribute('tabindex', '0');
  await expect(scroller).toHaveAttribute('aria-label', 'Concept graph, scroll sideways on small screens');
  expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await scroller.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await documentOverflowX(page)).toBe(0);
});

test('the study map panel sticks only while it fits below the top bar', async ({ page, context }) => {
  await installFixtures(context);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await page.getByTestId('input-file').setInputFiles({ name: source.filename, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  const toggle = page.getByTestId('toggle-live-setup');
  if (await toggle.isChecked()) await toggle.click();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();

  const panel = page.getByTestId('panel-study-map');
  const position = () => panel.evaluate(element => getComputedStyle(element).position);
  await expect.poll(position).toBe('sticky');

  // On a short screen the same panel would hide its own bottom, so it scrolls with the page.
  await page.setViewportSize({ width: 1280, height: 500 });
  await expect.poll(position).toBe('static');
  await page.getByTestId('button-source-passages').click();
  await page.keyboard.press('End');
  await expect(page.locator('.map-foot')).toBeInViewport();
  await expect(page.locator('.site-footer')).toBeInViewport();
  const passages = await page.locator('.source-passages ol').evaluate(element => element.scrollHeight - element.clientHeight);
  expect(passages).toBeLessThanOrEqual(1);
});
