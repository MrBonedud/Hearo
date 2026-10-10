import { readFileSync } from 'node:fs';

// Loaded only by playwright.api.config.ts, never by the normal API workflow.
// Fail closed if the test clock is missing or malformed; don't silently use
// real time and turn an expiration regression into a false positive.
const clockFile = process.env.STUDY_TEST_CLOCK_FILE;
if (!clockFile) throw new Error('The isolated API requires STUDY_TEST_CLOCK_FILE.');
const realNow = Date.now.bind(Date);
Date.now = () => {
  const now = JSON.parse(readFileSync(clockFile, 'utf8'));
  if (now === null) return realNow();
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid isolated API clock.');
  return now;
};
