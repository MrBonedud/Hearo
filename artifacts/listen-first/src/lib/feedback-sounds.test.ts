import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackSoundGate, FEEDBACK_SOUND_COOLDOWN_MS, playFeedbackTone } from './feedback-sounds';

const item = (conceptId: string, verdict: 'supported' | 'contradicted' | 'partially_understood' | 'not_demonstrated',
  confidence: 'high' | 'medium' | 'low' = 'high') => ({ conceptId, verdict, confidence });

test('off by default, no replay of unchanged verdict after enabling', () => {
  const gate = new FeedbackSoundGate();
  assert.equal(gate.next([item('a', 'supported')], false, 0), null);
  assert.equal(gate.next([item('a', 'supported')], true, 10000), null);
  assert.equal(gate.next([item('a', 'contradicted')], true, 20000), 'contradicted');
});

test('only new supported or contradicted verdicts produce a sound', () => {
  const gate = new FeedbackSoundGate();
  assert.equal(gate.next([], true, 0), null);
  assert.equal(gate.next([item('a', 'not_demonstrated'), item('b', 'partially_understood')], true, 0), null);
  assert.equal(gate.next([item('a', 'supported')], true, 1), 'supported');
  assert.equal(gate.next([item('a', 'supported')], true, 10000), null);
  assert.equal(gate.next([item('a', 'supported'), item('b', 'supported')], true, 10001), 'supported');
});

test('uncertain checks remain silent even with positive or negative verdicts', () => {
  const gate = new FeedbackSoundGate();
  assert.equal(gate.next([item('a', 'supported', 'low'), item('b', 'contradicted', 'low')], true, 0), null);
  assert.equal(gate.next([item('a', 'supported', 'medium')], true, 1000), 'supported');
});

test('one tone per batch, contradiction takes precedence, no stale queued sound', () => {
  const gate = new FeedbackSoundGate();
  assert.equal(gate.next([item('a', 'supported'), item('b', 'contradicted')], true, 0), 'contradicted');
  assert.equal(gate.next([item('b', 'supported')], true, FEEDBACK_SOUND_COOLDOWN_MS - 1), null);
  assert.equal(gate.next([item('b', 'supported')], true, FEEDBACK_SOUND_COOLDOWN_MS + 1), null);
  assert.equal(gate.next([item('c', 'supported')], true, FEEDBACK_SOUND_COOLDOWN_MS + 1), 'supported');
});

test('new study resets baseline and cooldown', () => {
  const gate = new FeedbackSoundGate();
  assert.equal(gate.next([item('a', 'supported')], true, 0), 'supported');
  gate.reset();
  assert.equal(gate.next([item('a', 'supported')], true, 1), 'supported');
});

test('synthesized sounds are short, quiet, cancellable and silent in suspended contexts', () => {
  const starts: number[] = [];
  const stops: number[] = [];
  const volumes: number[] = [];
  let created = 0;
  let disconnected = 0;
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const context = {
    state: 'running', currentTime: 10, destination: {},
    createOscillator() {
      created++;
      return { type: '', frequency: parameter, connect() {}, disconnect() { disconnected++; },
        start(at: number) { starts.push(at); }, stop(at?: number) { if (at !== undefined) stops.push(at); }, onended: null };
    },
    createGain() {
      return { gain: { ...parameter, linearRampToValueAtTime(volume: number) { volumes.push(volume); } },
        connect() {}, disconnect() { disconnected++; } };
    },
  };
  const cancel = playFeedbackTone(context as unknown as AudioContext, 'supported');
  assert.equal(created, 2);
  assert.ok(stops.every(at => at - 10 < 0.25));
  assert.ok(volumes.every(volume => volume <= 0.03));
  assert.equal(starts[0], 10);
  cancel();
  assert.equal(disconnected, 4);
  playFeedbackTone(context as unknown as AudioContext, 'contradicted');
  assert.equal(created, 3);
  context.state = 'suspended';
  playFeedbackTone(context as unknown as AudioContext, 'supported');
  assert.equal(created, 3);
});
