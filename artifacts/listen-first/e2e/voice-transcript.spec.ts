import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Voice-to-transcript integrity. The browser's SpeechRecognition is replaced by
// a scripted fake so result, end and error events arrive in a controlled order;
// no real microphone or recogniser is involved. Everything else is the real app,
// and only the server boundary is mocked.

const pdf = Buffer.from('%PDF-1.4 voice transcript fixture');
const reference = 'Load balancing distributes requests across several servers so no single server is overloaded.';
const source = {
  id: 'voice-source', title: 'Distributed Systems', author: 'Test fixture',
  filename: 'voice.pdf', downloadUrl: 'https://example.test/voice.pdf',
  byteLength: pdf.byteLength, pageCount: 10, scope: 'Slides 4–10',
  referenceText: reference,
  referenceLines: [{ id: 'S01', page: 4, text: reference }],
  aiAvailable: true,
};
const map = {
  topic: source.title,
  nodes: [{ id: 'load-balancing', label: 'Load balancing', description: reference, status: 'skipped', evidence: null }],
  edges: [],
};

type Item = [text: string, isFinal: boolean];
declare global {
  interface Window {
    __speech: {
      instances: Array<{ stopCalls: number; aborted: boolean }>;
      result: (items: Item[], resultIndex: number, instance?: number) => void;
      end: (instance?: number) => void;
      error: (code: string, instance?: number) => void;
    };
  }
}

function installFakeRecognition() {
  type Handlers = { onresult: ((event: unknown) => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
  class FakeRecognition {
    continuous = false; interimResults = false; lang = '';
    onresult: Handlers['onresult'] = null; onend: Handlers['onend'] = null; onerror: Handlers['onerror'] = null;
    stopCalls = 0; aborted = false;
    constructor() { window.__speech.instances.push(this); }
    start() {}
    // Like the real API, stop() only requests an end; tests decide when onend fires.
    stop() { this.stopCalls++; }
    abort() { this.aborted = true; }
  }
  const pick = (index?: number) => {
    const all = window.__speech.instances as unknown as FakeRecognition[];
    return all[index ?? all.length - 1];
  };
  window.__speech = {
    instances: [],
    result(items, resultIndex, instance) {
      pick(instance).onresult?.({ resultIndex, results: items.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) });
    },
    end(instance) { pick(instance).onend?.(); },
    error(code, instance) { pick(instance).onerror?.({ error: code }); },
  };
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
}

async function installFixtures(context: BrowserContext) {
  const submitted: string[] = [];
  await context.addInitScript(installFakeRecognition);
  await context.route('**/api/study/demo', route => route.fulfill({ json: source }));
  await context.route('**/api/study/demo/upload', route => route.fulfill({ json: { source, sourceToken: 'voice-token' } }));
  await context.route('**/api/study/prepare', route => route.fulfill({ json: map }));
  await context.route('**/api/study/allowance', route => route.fulfill({
    json: { dailyLimit: 50, remainingChecks: 40, resetAt: '2099-01-01T00:00:00.000Z', available: true, blockedBy: null },
  }));
  await context.route('**/api/study/evaluate', async route => {
    const input = route.request().postDataJSON();
    submitted.push(input.transcript);
    await route.fulfill({
      json: {
        ...map, nodes: [{ ...map.nodes[0], status: 'understood', evidence: input.transcript }],
        feedback: [],
        assessments: [{
          conceptId: 'load-balancing', verdict: 'supported', studentEvidence: input.transcript,
          sourceLineIds: ['S01'], confidence: 'medium', explanation: 'Voice regression report.',
          followUp: 'Explain the availability benefit.',
        }],
      },
    });
  });
  return submitted;
}

async function openStudy(page: Page) {
  await page.goto('/');
  await page.getByTestId('button-start-live').click();
  await page.getByTestId('input-file').setInputFiles({ name: source.filename, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('status-source-verified')).toBeVisible();
  // Live checking off: the only evaluation request is the learner's final submission.
  const toggle = page.getByTestId('toggle-live-setup');
  if (await toggle.isChecked()) await toggle.click();
  await page.getByTestId('button-prepare').click();
  await expect(page.getByTestId('input-transcript')).toBeVisible();
}

const speak = (page: Page, resultIndex: number, ...items: Item[]) =>
  page.evaluate(([index, list]) => window.__speech.result(list as Item[], index as number), [resultIndex, items] as const);
const endRecognition = (page: Page, instance?: number) => page.evaluate(index => window.__speech.end(index), instance);
const recognitionError = (page: Page, code: string, instance?: number) =>
  page.evaluate(([value, index]) => window.__speech.error(value as string, index as number | undefined), [code, instance] as const);

/** Selects the first occurrence of `word` in the transcript, like a double-click would. */
async function selectWord(page: Page, word: string) {
  await page.getByTestId('input-transcript').evaluate((element, target) => {
    const input = element as HTMLTextAreaElement;
    const start = input.value.indexOf(target);
    if (start < 0) throw new Error(`"${target}" is not in the transcript`);
    input.focus();
    input.setSelectionRange(start, start + target.length);
  }, word);
}

const caret = (page: Page) => page.getByTestId('input-transcript').evaluate(element => {
  const input = element as HTMLTextAreaElement;
  return [input.selectionStart, input.selectionEnd];
});

const FIRST: Item = ['The database store the user information.', true];

test('recording locks the text clearly, pausing lets the last words land, then one word can be corrected', async ({ page, context }) => {
  await installFixtures(context);
  await openStudy(page);
  const transcript = page.getByTestId('input-transcript');
  const mic = page.getByTestId('button-microphone');

  await mic.click();
  await expect(mic).toHaveText('Pause listening');
  const lock = page.getByTestId('status-transcript-locked');
  await expect(lock).toContainText('New words are added to the end of your text. Pause to edit it.');
  await expect(transcript).toHaveAttribute('readonly', '');
  await expect(transcript).toHaveAttribute('aria-describedby', 'transcript-lock-note');

  await speak(page, 0, ['The database store the user information.', true]);
  await expect(transcript).toHaveValue('The database store the user information.');

  // Scenario D: typing while recognition can still append is refused visibly, not mixed in.
  await selectWord(page, 'store');
  await page.keyboard.type('stores');
  await expect(transcript).toHaveValue('The database store the user information.');
  await expect(lock).toBeVisible();

  // New speech goes to the end without throwing the learner's selection to the end.
  await speak(page, 1, FIRST, ['Caching helps.', true]);
  await expect(transcript).toHaveValue('The database store the user information. Caching helps.');
  expect(await caret(page)).toEqual([13, 18]);

  // Provisional words are shown apart from the editable text.
  await speak(page, 2, FIRST, ['Caching helps.', true], ['It also', false]);
  await expect(page.getByTestId('text-interim')).toContainText('Not added yet');
  await expect(page.getByTestId('text-interim')).toContainText('It also');
  await expect(transcript).toHaveValue('The database store the user information. Caching helps.');

  await page.getByTestId('button-pause-to-edit').click();
  expect(await page.evaluate(() => window.__speech.instances[0].stopCalls)).toBe(1);
  // Still waiting for the recogniser: the last words may arrive, so editing stays locked.
  await expect(mic).toHaveText('Adding your last words…');
  await expect(mic).toBeDisabled();
  await expect(lock).toContainText('Adding the last words you said. You can edit in a moment.');
  await expect(transcript).toHaveAttribute('readonly', '');

  await speak(page, 2, FIRST, ['Caching helps.', true], ['It also keeps sessions.', true]);
  await endRecognition(page);
  await expect(lock).toHaveCount(0);
  await expect(transcript).not.toHaveAttribute('readonly', '');
  await expect(transcript).toBeFocused();
  await expect(page.getByTestId('text-interim')).toHaveCount(0);
  await expect(mic).toHaveText('Continue explaining aloud');
  await expect(transcript).toHaveValue('The database store the user information. Caching helps. It also keeps sessions.');

  // Scenario A: only the intended word changes.
  await selectWord(page, 'store');
  await page.keyboard.type('stores');
  await expect(transcript).toHaveValue('The database stores the user information. Caching helps. It also keeps sessions.');
  expect(await caret(page)).toEqual([19, 19]);
});

test('normal text editing keeps the caret where the learner puts it (Scenario H)', async ({ page, context }) => {
  await installFixtures(context);
  await openStudy(page);
  const transcript = page.getByTestId('input-transcript');
  await page.getByTestId('button-microphone').click();
  await speak(page, 0, ['Load balancing spreads requests.', true], ['Sharding splits data.', true]);
  await page.getByTestId('button-microphone').click();
  await endRecognition(page);
  await expect(transcript).toHaveValue('Load balancing spreads requests. Sharding splits data.');
  await expect(transcript).not.toHaveAttribute('readonly', '');

  // Insert in the middle with the arrow keys, then keep typing: no jump to the end.
  await transcript.click();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 'Load balancing'.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' evenly');
  expect(await caret(page)).toEqual([21, 21]);
  await page.keyboard.type(' always');
  await expect(transcript).toHaveValue('Load balancing evenly always spreads requests. Sharding splits data.');

  // Backspace and Delete remove only the characters beside the caret.
  for (let i = 0; i < ' always'.length; i++) await page.keyboard.press('Backspace');
  await expect(transcript).toHaveValue('Load balancing evenly spreads requests. Sharding splits data.');
  await page.keyboard.press('Delete');
  await page.keyboard.type('_');
  await expect(transcript).toHaveValue('Load balancing evenly_spreads requests. Sharding splits data.');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(' ');

  // Select and replace a portion, then copy and paste a word elsewhere.
  await selectWord(page, 'splits');
  await page.keyboard.type('partitions');
  await expect(transcript).toHaveValue('Load balancing evenly spreads requests. Sharding partitions data.');
  await selectWord(page, 'requests');
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' More ');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(transcript).toHaveValue('Load balancing evenly spreads requests. Sharding partitions data. More requests');

  // Line breaks survive, and Ctrl+A selects everything without changing it.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line.');
  await expect(transcript).toHaveValue('Load balancing evenly spreads requests. Sharding partitions data. More requests\nSecond line.');
  await page.keyboard.press('ControlOrMeta+A');
  const length = (await transcript.inputValue()).length;
  expect(await caret(page)).toEqual([0, length]);
  await page.keyboard.press('ArrowRight');
  expect(await caret(page)).toEqual([length, length]);
});

test('late, repeated and error callbacks after a pause never change the edited text (Scenarios B and E)', async ({ page, context }) => {
  await installFixtures(context);
  await openStudy(page);
  const transcript = page.getByTestId('input-transcript');
  const mic = page.getByTestId('button-microphone');

  await mic.click();
  await speak(page, 0, ['Sharding splits data across nodes.', true]);
  await mic.click();
  await endRecognition(page);
  await selectWord(page, 'nodes');
  await page.keyboard.type('servers');
  const edited = 'Sharding splits data across servers.';
  await expect(transcript).toHaveValue(edited);

  // Scenario B: callbacks from the ended session arrive after the edit.
  await speak(page, 0, ['Sharding splits data across nodes.', true], ['late words', true]);
  await speak(page, 1, ['Sharding splits data across nodes.', true], ['more late words', false]);
  await endRecognition(page);
  await recognitionError(page, 'network');
  await expect(transcript).toHaveValue(edited);
  await expect(page.getByTestId('text-interim')).toHaveCount(0);
  await expect(page.getByTestId('status-mic-message')).toHaveCount(0);
  expect(await caret(page)).toEqual([35, 35]);

  // A recogniser that never confirms the pause is released after a short wait;
  // whatever it sends afterwards is ignored.
  await mic.click();
  await speak(page, 0, ['Replication keeps copies.', true]);
  await mic.click();
  await expect(mic).toHaveText('Continue explaining aloud', { timeout: 5_000 });
  expect(await page.evaluate(() => window.__speech.instances[1].aborted)).toBe(true);
  await speak(page, 0, ['Replication keeps copies.', true], ['ignored after release', true]);
  const resumed = `${edited} Replication keeps copies.`;
  await expect(transcript).toHaveValue(resumed);

  // Scenario E: an error during a later recording keeps all accepted and edited text.
  await selectWord(page, 'keeps');
  await page.keyboard.type('stores');
  await mic.click();
  await speak(page, 0, ['If one fails', false]);
  await recognitionError(page, 'network');
  await endRecognition(page);
  await expect(page.getByTestId('status-mic-message')).toContainText('Speech transcription stopped.');
  // The provisional words are kept rather than lost, at the end of the text.
  await expect(transcript).toHaveValue('Sharding splits data across servers. Replication stores copies. If one fails');
  await expect(transcript).not.toHaveAttribute('readonly', '');
  expect(await page.evaluate(() => window.__speech.instances.length)).toBe(3);
});

test('resumed speech joins the corrected text once and the exact corrected text is submitted once (Scenarios C, F and G)', async ({ page, context }) => {
  const submitted = await installFixtures(context);
  await openStudy(page);
  const transcript = page.getByTestId('input-transcript');
  const mic = page.getByTestId('button-microphone');

  // Scenario C: repeated and cumulative finals in the browser.
  await mic.click();
  await speak(page, 0, ['Caching', true]);
  await speak(page, 0, ['Caching', true]);
  await speak(page, 1, ['Caching', true], ['Caching speeds up reads.', true]);
  await speak(page, 1, ['Caching', true], ['Caching speeds up reads.', true]);
  await expect(transcript).toHaveValue('Caching speeds up reads.');
  await mic.click();
  await endRecognition(page);

  await selectWord(page, 'reads');
  await page.keyboard.type('repeated reads');
  await expect(transcript).toHaveValue('Caching speeds up repeated reads.');

  // Scenario F: resuming starts one new session and appends after the correction.
  await expect(mic).toHaveText('Continue explaining aloud');
  await mic.click();
  expect(await page.evaluate(() => window.__speech.instances.length)).toBe(2);
  await speak(page, 0, ['It lowers database load.', true]);
  await mic.click();
  await endRecognition(page);
  await expect(transcript).toHaveValue('Caching speeds up repeated reads. It lowers database load.');

  await selectWord(page, 'lowers');
  await page.keyboard.type('reduces');
  const finalText = 'Caching speeds up repeated reads. It reduces database load.';
  await expect(transcript).toHaveValue(finalText);

  // Scenario G: a fast double click submits the exact corrected text once.
  await page.getByTestId('button-finish').dblclick();
  await expect(page.getByTestId('button-download-report')).toBeVisible({ timeout: 15_000 });
  expect(submitted).toEqual([finalText]);

  const download = page.waitForEvent('download');
  await page.getByTestId('button-download-report').click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain(finalText);

  // Returning to the session shows the same text: nothing reverted after submission.
  await page.getByTestId('button-back-review').click();
  await expect(transcript).toHaveValue(finalText);
  expect(submitted).toEqual([finalText]);
});
