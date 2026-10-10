import { expect, test } from '@playwright/test';

const storageKey = 'hearo.saved-studies.v2';
const study = {
  id: 'label-test-study',
  version: 1,
  savedAt: 123,
  source: {
    id: 'approved-demo',
    title: 'Distributed Systems',
    pdfSha256: '0'.repeat(64),
    contentSha256: '1'.repeat(64),
  },
  map: { topic: 'Distributed Systems', nodes: [], edges: [] },
  transcript: 'A saved explanation.',
  evaluation: null,
  phase: 'session',
  citedPassageIds: [],
};

test('saved study labels can be added, edited, and reloaded without changing source or citations', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: storageKey,
    value: [study],
  });

  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  const card = page.getByTestId(`saved-study-${study.id}`);
  await expect(card).toContainText(study.source.title);
  await page.getByTestId(`input-saved-study-label-${study.id}`).fill('Midterm review');
  await page.getByTestId(`button-save-study-label-${study.id}`).click();
  await expect(card.locator('strong')).toHaveText('Midterm review');

  const afterFirstSave = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.[0], storageKey);
  expect(afterFirstSave).toMatchObject({
    label: 'Midterm review',
    savedAt: study.savedAt,
    source: study.source,
    citedPassageIds: [],
  });

  await page.getByTestId(`input-saved-study-label-${study.id}`).fill('Final exam');
  await page.getByTestId(`button-save-study-label-${study.id}`).click();
  const afterSecondSave = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.[0], storageKey);
  expect(afterSecondSave?.label).toBe('Final exam');
  await page.reload();
  await page.getByTestId('button-start-live').click();
  const reloadedCard = page.getByTestId(`saved-study-${study.id}`);
  await expect(reloadedCard.locator('strong')).toHaveText('Final exam');
  await expect(reloadedCard).toContainText(study.source.title);
  const afterReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.[0], storageKey);
  expect(afterReload).toMatchObject({
    label: 'Final exam',
    savedAt: study.savedAt,
    source: study.source,
    citedPassageIds: [],
  });
});
