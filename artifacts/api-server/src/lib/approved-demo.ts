import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { EvaluateStudyResponse } from "@workspace/api-zod";
import pack from "../../../../shared/topic-packs/system-design-slides.json";

export const approvedDemo = pack;
export const referenceText = pack.referenceLines
  .map(line => `[${line.id} | slide ${line.page}] ${line.text}`).join("\n");
const tokenSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const tokenLifetimeMs = 2 * 60 * 60 * 1000;

export function matchesApprovedPdf(bytes: Buffer): boolean {
  return bytes.length === pack.byteLength
    && bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    && createHash("sha256").update(bytes).digest("hex") === pack.sha256;
}

export function issueSourceToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    hash: pack.sha256, expires: now + tokenLifetimeMs,
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", tokenSecret).update(payload).digest("base64url")}`;
}

export function validSourceToken(token: unknown, now = Date.now()): boolean {
  if (typeof token !== "string" || token.length > 1024) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", tokenSecret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.hash === pack.sha256 && Number.isFinite(data.expires) && data.expires > now;
  } catch { return false; }
}

export function sourceMetadata(aiAvailable: boolean) {
  const { id, title, author, filename, downloadUrl, byteLength, pageCount, scope, referenceLines } = pack;
  return { id, title, author, filename, downloadUrl, byteLength, pageCount, scope, referenceLines, referenceText, aiAvailable };
}

export function initialMap() {
  return {
    topic: pack.title,
    nodes: pack.concepts.map(concept => ({
      id: concept.id, label: concept.label, description: concept.description,
      status: "skipped" as const, evidence: null,
    })),
    edges: pack.edges,
  };
}

const assessmentSchema = EvaluateStudyResponse.shape.assessments.unwrap();
const normalized = (text: string) => text.replace(/\s+/gu, " ").trim();

/** The model chooses passage IDs, never generates source quotations or page numbers. */
export function groundedEvaluation(raw: unknown, transcript: string) {
  const assessments = assessmentSchema.parse(raw);
  if (assessments.length !== pack.concepts.length
    || new Set(assessments.map(item => item.conceptId)).size !== pack.concepts.length
    || assessments.some(item => !pack.concepts.some(concept => concept.id === item.conceptId))) {
    throw new Error("Assessment must contain each source objective exactly once.");
  }
  const checked = pack.concepts.map(concept => {
    const item = assessments.find(value => value.conceptId === concept.id)!;
    const citesSource = item.sourceLineIds.length > 0
      && item.sourceLineIds.every(id => concept.supportingLines.includes(id));
    const citesStudent = Boolean(item.studentEvidence?.trim())
      && normalized(transcript).includes(normalized(item.studentEvidence || ""));
    if (item.verdict !== "not_demonstrated" && (!citesSource || !citesStudent || item.confidence === "low")) {
      return {
        conceptId: concept.id, verdict: "not_demonstrated" as const, confidence: "low" as const,
        studentEvidence: null, sourceLineIds: [],
        explanation: "The proposed assessment could not be verified against both your answer and the source. No understanding or misconception has been recorded.",
        followUp: concept.question,
      };
    }
    if (item.verdict === "not_demonstrated") {
      return { ...item, studentEvidence: null, sourceLineIds: [], followUp: item.followUp.trim() || concept.question };
    }
    return { ...item, sourceLineIds: [...new Set(item.sourceLineIds)], followUp: item.followUp.trim() || concept.question };
  });
  const map = initialMap();
  return EvaluateStudyResponse.parse({
    ...map,
    nodes: map.nodes.map(node => {
      const item = checked.find(value => value.conceptId === node.id)!;
      return {
        ...node,
        status: item.verdict === "supported" ? "understood" : item.verdict === "contradicted" ? "incorrect" : "skipped",
        evidence: item.sourceLineIds.length ? pack.referenceLines
          .filter(line => item.sourceLineIds.includes(line.id))
          .map(line => `[${line.id}, slide ${line.page}] ${line.text}`).join("\n") : null,
      };
    }),
    assessments: checked,
    feedback: checked.filter(item => item.verdict === "supported" || item.verdict === "contradicted")
      .map(item => ({
        statement: item.studentEvidence!,
        status: item.verdict === "supported" ? "understood" : "incorrect",
        explanation: item.explanation,
      })),
  });
}
