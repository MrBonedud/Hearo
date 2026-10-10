import type {
  ConceptAssessment,
  DemoSource,
  StudyEvaluation,
  StudyMap,
} from '@workspace/api-client-react';

const STORAGE_KEY = 'hearo.saved-studies.v2';

const LEGACY_STORAGE_KEY = 'hearo.saved-study.v1';

export const MAX_STUDY_LABEL_LENGTH = 60;
const BACKUP_FORMAT = 'hearo-study-backup';
export const MAX_SAVED_STUDY_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_BACKUP_STUDIES = 500;
export type StudySourceIdentity = {
  id: string;
  title: string;
  pdfSha256: string;
  contentSha256: string;
};

export type SavedStudySession = {
  id: string;
  version: 1;
  savedAt: number;
  label?: string;
  source: StudySourceIdentity;
  map: StudyMap;
  transcript: string;
  evaluation: StudyEvaluation | null;
  phase: 'session' | 'review';
  citedPassageIds: string[];
  overflowText?: string;
  // This snapshot belongs to its own checked text, never the newer draft.
  previousReport?: { transcript: string; evaluation: StudyEvaluation; overflowText?: string };
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

function isSavedStudySession(value: unknown, allowMissingId = false): value is SavedStudySession {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  const source = value.source;
  if (value.previousReport !== undefined && (!isRecord(value.previousReport)
    || typeof value.previousReport.transcript !== 'string'
    || value.previousReport.transcript.length > 12_000
    || !isEvaluation(value.previousReport.evaluation)
    || (value.previousReport.overflowText !== undefined && typeof value.previousReport.overflowText !== 'string'))) return false;
  if (!Array.isArray(value.citedPassageIds) || !value.citedPassageIds.every(id => typeof id === 'string')) return false;
  const citedPassageIds = value.citedPassageIds as string[];
  if ((!allowMissingId && (typeof value.id !== 'string' || !value.id))
    || (allowMissingId && value.id !== undefined && (typeof value.id !== 'string' || !value.id))
    || value.version !== 1
    || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > MAX_STUDY_LABEL_LENGTH))
    || (value.overflowText !== undefined && typeof value.overflowText !== 'string')
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

function normalizeEvaluation(value: StudyEvaluation): StudyEvaluation {
  return {
    topic: value.topic,
    nodes: value.nodes.map(({ id, label, description, status, evidence }) => ({ id, label, description, status, evidence })),
    edges: value.edges.map(({ from, to, label }) => ({ from, to, label })),
    feedback: value.feedback.map(({ statement, status, explanation }) => ({ statement, status, explanation })),
    ...(value.assessments ? {
      assessments: value.assessments.map(({ conceptId, verdict, confidence, studentEvidence, sourceLineIds, explanation, followUp }) => ({
        conceptId, verdict, confidence, studentEvidence, sourceLineIds: [...sourceLineIds], explanation, followUp,
      })),
    } : {}),
  };
}

function normalizeSavedStudy(value: SavedStudySession): SavedStudySession {
  return {
    id: value.id,
    version: 1,
    savedAt: value.savedAt,
    ...(value.label?.trim() ? { label: value.label.trim() } : {}),
    source: {
      id: value.source.id,
      title: value.source.title,
      pdfSha256: value.source.pdfSha256,
      contentSha256: value.source.contentSha256,
    },
    map: {
      topic: value.map.topic,
      nodes: value.map.nodes.map(({ id, label, description, status, evidence }) => ({ id, label, description, status, evidence })),
      edges: value.map.edges.map(({ from, to, label }) => ({ from, to, label })),
    },
    transcript: value.transcript,
    evaluation: value.evaluation ? normalizeEvaluation(value.evaluation) : null,
    phase: value.phase,
    citedPassageIds: [...value.citedPassageIds],
    ...(value.overflowText !== undefined ? { overflowText: value.overflowText } : {}),
    ...(value.previousReport ? {
      previousReport: {
        transcript: value.previousReport.transcript,
        evaluation: normalizeEvaluation(value.previousReport.evaluation),
        ...(value.previousReport.overflowText !== undefined ? { overflowText: value.previousReport.overflowText } : {}),
      },
    } : {}),
  };
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

export type SavedStudiesRead =
  | { status: 'empty' }
  | { status: 'valid'; value: SavedStudySession[] }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export function createSavedStudiesBackup(studies: SavedStudySession[]): string {
  if (studies.length > MAX_BACKUP_STUDIES) throw new Error('This backup contains too many studies.');
  const safeStudies = studies.map(study => {
    if (!isSavedStudySession(study)) throw new Error('A saved study could not be added to the backup.');
    return normalizeSavedStudy(study);
  });
  const backup = JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    studies: safeStudies,
  }, null, 2);
  if (new TextEncoder().encode(backup).byteLength > MAX_SAVED_STUDY_BACKUP_BYTES) {
    throw new Error('This backup would be larger than 10 MB. Export fewer studies at a time.');
  }
  return backup;
}

export function parseSavedStudiesBackup(text: string): { studies: SavedStudySession[]; rejectedCount: number } {
  if (text.length > MAX_SAVED_STUDY_BACKUP_BYTES
    || new TextEncoder().encode(text).byteLength > MAX_SAVED_STUDY_BACKUP_BYTES) {
    throw new Error('This backup file is larger than 10 MB.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid Hearo backup.');
  }
  if (!isRecord(parsed)
    || parsed.format !== BACKUP_FORMAT
    || parsed.version !== 1
    || !Array.isArray(parsed.studies)
    || parsed.studies.length > MAX_BACKUP_STUDIES) {
    throw new Error('This file is not a supported Hearo backup.');
  }
  const studies: SavedStudySession[] = [];
  let rejectedCount = 0;
  for (const item of parsed.studies) {
    if (!isSavedStudySession(item)) {
      rejectedCount += 1;
      continue;
    }
    studies.push(normalizeSavedStudy(item));
  }
  return { studies, rejectedCount };
}

export function importSavedStudies(
  imported: SavedStudySession[],
  storage?: StorageLike,
): { studies: SavedStudySession[]; addedCount: number; duplicateCount: number } {
  const target = resolveStorage(storage);
  if (!target) throw new Error('Saved study storage is unavailable.');
  const existing = readSavedStudies(target);
  if (existing.status === 'unavailable') throw new Error('Saved study storage is unavailable.');
  const studies = existing.status === 'valid' ? existing.value : [];
  const byId = new Map(studies.map(study => [study.id, study]));
  let addedCount = 0;
  let duplicateCount = 0;
  for (const item of imported) {
    if (!isSavedStudySession(item)) {
      duplicateCount += 1;
      continue;
    }
    const safeItem = normalizeSavedStudy(item);
    if (byId.has(safeItem.id)) {
      duplicateCount += 1;
      continue;
    }
    byId.set(safeItem.id, safeItem);
    addedCount += 1;
  }
  const next = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  if (addedCount > 0) {
    target.setItem(STORAGE_KEY, JSON.stringify(next));
    try {
      target.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // The imported v2 history has been saved successfully; a stale legacy copy is harmless.
    }
  }
  return { studies: next, addedCount, duplicateCount };
}

export function readSavedStudy(storage?: StorageLike): SavedStudyRead {
  const result = readSavedStudies(storage);
  if (result.status === 'valid') return { status: 'valid', value: result.value[0] };
  if (result.status === 'empty') return { status: 'empty' };
  return { status: result.status };
}

export function writeSavedStudy(value: SavedStudySession, storage?: StorageLike): SavedStudySession[] {
  if (!isSavedStudySession(value)) throw new Error('The saved study data is invalid.');
  const safeValue = normalizeSavedStudy(value);
  const target = resolveStorage(storage);
  if (!target) throw new Error('Saved study storage is unavailable.');
  const existing = readSavedStudies(target);
  if (existing.status === 'unavailable') throw new Error('Saved study storage is unavailable.');
  const values = existing.status === 'valid' ? existing.value : [];
  const next = [safeValue, ...values.filter(item => item.id !== safeValue.id)]
    .sort((a, b) => b.savedAt - a.savedAt);
  target.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    target.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The v2 history has been saved successfully; a stale legacy copy is harmless.
  }
  return next;
}

export function updateSavedStudyLabel(id: string, label: string, storage?: StorageLike): SavedStudySession[] {
  const normalizedLabel = label.trim();
  if (normalizedLabel.length > MAX_STUDY_LABEL_LENGTH) {
    throw new Error(`Study labels must be ${MAX_STUDY_LABEL_LENGTH} characters or fewer.`);
  }
  const existing = readSavedStudies(storage);
  if (existing.status === 'unavailable') throw new Error('Saved study storage is unavailable.');
  if (existing.status !== 'valid' || !existing.value.some(study => study.id === id)) {
    throw new Error('The saved study could not be found.');
  }
  const study = existing.value.find(item => item.id === id)!;
  const updated: SavedStudySession = { ...study };
  if (normalizedLabel) updated.label = normalizedLabel;
  else delete updated.label;
  return writeSavedStudy(updated, storage);
}
export function deleteSavedStudy(id: string, storage?: StorageLike): SavedStudySession[] {
  const target = resolveStorage(storage);
  if (!target) throw new Error('Saved study storage is unavailable.');
  const existing = readSavedStudies(target);
  if (existing.status === 'unavailable') throw new Error('Saved study storage is unavailable.');
  const next = (existing.status === 'valid' ? existing.value : []).filter(item => item.id !== id);
  if (next.length) target.setItem(STORAGE_KEY, JSON.stringify(next));
  else target.removeItem(STORAGE_KEY);
  return next;
}

export function clearSavedStudies(storage?: StorageLike): void {
  const target = resolveStorage(storage);
  if (!target) throw new Error('Saved study storage is unavailable.');
  target.removeItem(STORAGE_KEY);
  target.removeItem(LEGACY_STORAGE_KEY);
}
export function matchesSource(saved: SavedStudySession, current: StudySourceIdentity): boolean {
  return saved.source.id === current.id
    && saved.source.pdfSha256 === current.pdfSha256
    && saved.source.contentSha256 === current.contentSha256;
}

export function citationsMatchSource(saved: SavedStudySession, source: DemoSource): boolean {
  const availableIds = new Set(source.referenceLines.map(line => line.id));
  return saved.citedPassageIds.every(id => availableIds.has(id))
    && (saved.previousReport?.evaluation.assessments ?? []).every(item => item.sourceLineIds.every(id => availableIds.has(id)));
}

export function matchesVerifiedSource(
  saved: SavedStudySession,
  identity: StudySourceIdentity,
  source: DemoSource,
): boolean {
  return matchesSource(saved, identity) && citationsMatchSource(saved, source);
}

function readLegacyStudy(target: StorageLike): SavedStudiesRead {
  let raw: string | null;
  try {
    raw = target.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fall through and remove the malformed legacy payload.
  }
  if (isSavedStudySession(parsed, true)) {
    const migrated = normalizeSavedStudy({ ...parsed, id: parsed.id || `legacy-${parsed.savedAt}` });
    try {
      target.setItem(STORAGE_KEY, JSON.stringify([migrated]));
      target.removeItem(LEGACY_STORAGE_KEY);
      return { status: 'valid', value: [migrated] };
    } catch {
      return { status: 'unavailable' };
    }
  }
  try {
    target.removeItem(LEGACY_STORAGE_KEY);
    return { status: 'invalid' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function readSavedStudies(storage?: StorageLike): SavedStudiesRead {
  let target: StorageLike;
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return { status: 'unavailable' };
  }
  target = resolved;
  let raw: string | null;
  try {
    raw = target.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return readLegacyStudy(target);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const values = parsed.filter(item => isSavedStudySession(item)).map(normalizeSavedStudy);
      const normalizedJson = JSON.stringify(values);
      if (raw !== normalizedJson) {
        try {
          target.setItem(STORAGE_KEY, normalizedJson);
        } catch {
          return { status: 'unavailable' };
        }
      }
      if (values.length) return { status: 'valid', value: values };
      if (parsed.length === 0) return { status: 'empty' };
    }
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

export function createSavedStudyId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `study-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  try {
    return storage ?? window.localStorage;
  } catch {
    return null;
  }
}
