import assert from "node:assert/strict";
import test from "node:test";
import { checkWithFallback } from "./checker-fallback";

test("OpenAI succeeds without calling Gemini", async () => {
  const calls: string[] = [];
  const output = await checkWithFallback(["OpenAI", "Gemini"], async provider => {
    calls.push(provider);
    return "validated assessment";
  });
  assert.deepEqual(calls, ["OpenAI"]);
  assert.equal(output.provider, "OpenAI");
  assert.equal(output.fallbackUsed, false);
});

test("OpenAI failure or invalid assessment falls back to Gemini once", async () => {
  const calls: string[] = [];
  const output = await checkWithFallback(["OpenAI", "Gemini"], async provider => {
    calls.push(provider);
    if (provider === "OpenAI") throw new Error("Provider failure or invalid grounding");
    return "validated assessment";
  });
  assert.deepEqual(calls, ["OpenAI", "Gemini"]);
  assert.equal(output.provider, "Gemini");
  assert.equal(output.fallbackUsed, true);
});

test("two failed checkers fail explicitly instead of fabricating an assessment", async () => {
  const error = new Error("Both unavailable");
  await assert.rejects(checkWithFallback(["OpenAI", "Gemini"], async () => { throw error; }), error);
});

test("Gemini works by itself when OpenAI is not configured", async () => {
  const output = await checkWithFallback(["Gemini"], async () => "validated assessment");
  assert.equal(output.provider, "Gemini");
});
