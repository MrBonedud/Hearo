import type {
  ConceptAssessment,
  DemoSource,
  StudyEvaluation,
  StudyMap,
} from '@workspace/api-client-react';

const STORAGE_KEY = 'hearo.saved-study.v1';

export type StudySourceIdentity = {
  id: string;
  title: string;
  pdfSha256: string;
  contentSha256: string;
};

export type SavedStudySession = {
  version: 1;
  savedAt: number;
  source: StudySourceIdentity;
  map: StudyMap;
  transcript: string;
  evaluation: StudyEvaluation | null;
  phase: 'session' | 'review';
  citedPassageIds: string[];
};

export type SavedStudyRead =
  | { status: 'empty' }
  | { status: 'valid'; value: SavedStudySession }
  | { status: 'invalid' }
  | { status: 'unavailable' };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStudyMap(value: unknown): value is StudyMap {
  if (!isRecord(value) || typeof value.topic !== 'string' || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false;
  const validStatuses = new Set(['understood', 'incorrect', 'skipped']);
  return value.nodes.every(node => isRecord(node)
    && typeof node.id === 'string'
    && typeof node.label === 'string'
    && typeof node.description === 'string'
    && validStatuses.has(String(node.status))
    && (typeof node.evidence === 'string' || node.evidence === null))
    && value.edges.every(edge => isRecord(edge)
      && typeof edge.from === 'string'
      && typeof edge.to === 'string'
      && typeof edge.label === 'string');
}

function isAssessment(value: unknown): value is ConceptAssessment {
  if (!isRecord(value) || !Array.isArray(value.sourceLineIds)) return false;
  return typeof value.conceptId === 'string'
    && ['supported', 'partially_understood', 'contradicted', 'not_demonstrated'].includes(String(value.verdict))
    && (typeof value.studentEvidence === 'string' || value.studentEvidence === null)
    && value.sourceLineIds.every(id => typeof id === 'string')
    && ['low', 'medium', 'high'].includes(String(value.confidence))
    && typeof value.explanation === 'string'
    && typeof value.followUp === 'string';
}

function isEvaluation(value: unknown): value is StudyEvaluation {
  if (!isRecord(value) || !isStudyMap({ topic: value.topic, nodes: value.nodes, edges: value.edges }) || !Array.isArray(value.feedback)) return false;
  if (value.assessments !== undefined && (!Array.isArray(value.assessments) || !value.assessments.every(isAssessment))) return false;
  return value.feedback.every(item => isRecord(item)
    && typeof item.statement === 'string'
    && ['understood', 'incorrect'].includes(String(item.status))
    && typeof item.explanation === 'string');
}

function isSavedStudySession(value: unknown): value is SavedStudySession {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  const source = value.source;
  if (!Array.isArray(value.citedPassageIds) || !value.citedPassageIds.every(id => typeof id === 'string')) return false;
  const citedPassageIds = value.citedPassageIds as string[];
  if (value.version !== 1
    || typeof value.savedAt !== 'number'
    || !Number.isFinite(value.savedAt)
    || typeof source.id !== 'string'
    || typeof source.title !== 'string'
    || typeof source.pdfSha256 !== 'string'
    || !/^[a-f\d]{64}$/i.test(source.pdfSha256)
    || typeof source.contentSha256 !== 'string'
    || !/^[a-f\d]{64}$/i.test(source.contentSha256)
    || !isStudyMap(value.map)
    || typeof value.transcript !== 'string'
    || value.transcript.length > 12_000
    || (value.evaluation !== null && !isEvaluation(value.evaluation))
    || !['session', 'review'].includes(String(value.phase))
    || (value.phase === 'review' && value.evaluation === null)) return false;

  const expectedCitations = value.evaluation && Array.isArray(value.evaluation.assessments)
    ? [...new Set(value.evaluation.assessments.flatMap(item => item.sourceLineIds))]
    : [];
  return expectedCitations.length === citedPassageIds.length
    && expectedCitations.every(id => citedPassageIds.includes(id));
}

export async function createSourceIdentity(source: DemoSource, pdfSha256: string): Promise<StudySourceIdentity> {
  const content = JSON.stringify({
    id: source.id,
    title: source.title,
    referenceText: source.referenceText,
    referenceLines: source.referenceLines.map(({ id, page, text }) => ({ id, page, text })),
  });
  return {
    id: source.id,
    title: source.title,
    pdfSha256,
    contentSha256: await sha256(content),
  };
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is not available in this browser.');
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readSavedStudy(storage?: StorageLike): SavedStudyRead {
  let target: StorageLike;
  try {
    target = storage ?? window.localStorage;
  } catch {
    return { status: 'unavailable' };
  }
  let raw: string | null;
  try {
    raw = target.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSavedStudySession(parsed)) return { status: 'valid', value: parsed };
  } catch {
    // Treat malformed JSON like any other invalid versioned payload.
  }
  try {
    target.removeItem(STORAGE_KEY);
    return { status: 'invalid' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function writeSavedStudy(value: SavedStudySession, storage?: StorageLike): void {
  if (!isSavedStudySession(value)) throw new Error('The saved study data is invalid.');
  (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(value));
}

export function deleteSavedStudy(storage?: StorageLike): void {
  (storage ?? window.localStorage).removeItem(STORAGE_KEY);
}

export function matchesSource(saved: SavedStudySession, current: StudySourceIdentity): boolean {
  return saved.source.id === current.id
    && saved.source.pdfSha256 === current.pdfSha256
    && saved.source.contentSha256 === current.contentSha256;
}

export function citationsMatchSource(saved: SavedStudySession, source: DemoSource): boolean {
  const availableIds = new Set(source.referenceLines.map(line => line.id));
  return saved.citedPassageIds.every(id => availableIds.has(id));
}
