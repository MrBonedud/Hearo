import { expect, test } from '@playwright/test';

const source = {
  id: 'approved-demo',
  title: 'Distributed Systems',
  author: 'Hearo demo',
  filename: 'approved-slides.pdf',
  downloadUrl: 'https://example.test/approved.pdf',
  byteLength: 1234,
  pageCount: 10,
  scope: 'Slides 4–10',
  referenceText: 'Load balancing distributes requests across servers.',
  referenceLines: [{ id: 'S01', page: 4, text: 'Load balancing distributes requests across servers.' }],
  aiAvailable: true,
};

const fingerprint = {
  id: source.id,
  title: source.title,
  pdfSha256: '0'.repeat(64),
  contentSha256: '1'.repeat(64),
};

const studies = [
  {
    id: 'backup-draft',
    version: 1,
    savedAt: 100,
    source: fingerprint,
    map: { topic: source.title, nodes: [], edges: [] },
    transcript: 'Draft to continue later.',
    evaluation: null,
    phase: 'session',
    citedPassageIds: [],
  },
  {
    id: 'backup-report',
    version: 1,
    savedAt: 200,
    source: fingerprint,
    map: { topic: source.title, nodes: [], edges: [] },
    transcript: 'A completed explanation.',
    evaluation: {
      topic: source.title,
      nodes: [],
      edges: [],
      feedback: [],
      assessments: [{
        conceptId: 'load-balancing',
        verdict: 'supported',
        studentEvidence: 'requests across servers',
        sourceLineIds: ['S01'],
        confidence: 'high',
        explanation: 'The explanation matches the source.',
        followUp: 'What benefit does this provide?',
      }],
    },
    phase: 'review',
    citedPassageIds: ['S01'],
  },
];

test('learners can export and import multiple saved drafts and reports', async ({ page }) => {
  await page.addInitScript(({ key, savedStudies }) => {
    localStorage.setItem(key, JSON.stringify(savedStudies));
  }, { key: 'hearo.saved-studies.v2', savedStudies: studies });
  await page.route('**/api/study/demo', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(source),
  }));

  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await expect(page.getByTestId('saved-study-backup-draft')).toBeVisible();
  await expect(page.getByTestId('saved-study-backup-report')).toBeVisible();

  const downloadReady = page.waitForEvent('download');
  await page.getByTestId('button-export-study-backup').click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(/^hearo-study-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The study backup download could not be read.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks).toString('utf8');
  const exported = JSON.parse(backup) as { studies: Array<Record<string, unknown>> };
  expect(exported.studies).toHaveLength(2);
  expect(backup).not.toContain('sourceToken');
  expect(backup).not.toContain('pdfBytes');

  page.on('dialog', dialog => dialog.accept());
  await page.getByTestId('button-clear-saved-studies').click();
  await expect(page.getByTestId('saved-study-backup-draft')).toHaveCount(0);
  await page.getByTestId('input-import-study-backup').setInputFiles({
    name: 'saved-studies.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });

  await expect(page.getByTestId('saved-study-backup-draft')).toBeVisible();
  await expect(page.getByTestId('saved-study-backup-report')).toBeVisible();
  await expect(page.getByTestId('status-storage')).toContainText('Choose and verify the same PDF');
  await expect(page.getByTestId('button-reopen-saved-study-backup-draft')).toHaveCount(0);
});
