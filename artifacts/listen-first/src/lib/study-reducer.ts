import type {
  DemoClaim, DemoConceptState, DemoEvent, DemoMessageResponse, DemoReport, DemoTopicPack,
} from '@workspace/api-client-react';

export type SentenceState = { id: string; text: string; claims: DemoClaim[] };
export type DemoScreenState = {
  sessionId: string | null;
  pack: DemoTopicPack | null;
  sentences: SentenceState[];
  concepts: Record<string, DemoConceptState>;
  latestSentence: Record<string, string | null>;
  report: DemoReport | null;
  error: string | null;
};
export const initialStudyState: DemoScreenState = {
  sessionId: null, pack: null, sentences: [], concepts: {}, latestSentence: {}, report: null, error: null,
};
export type StudyAction =
  | { type: 'response'; response: DemoMessageResponse }
  | { type: 'reset' }
  | { type: 'error'; message: string | null };

/** Every typed or recorded event enters here; sentence IDs also make retries idempotent. */
export function applyStudyEvent(state: DemoScreenState, event: DemoEvent): DemoScreenState {
  if (event.session_id !== state.sessionId) return state;
  switch (event.type) {
    case 'sentence':
      if (state.sentences.some(sentence => sentence.id === event.sentence_id)) return state;
      return { ...state, sentences: [...state.sentences, { id: event.sentence_id, text: event.text, claims: [] }] };
    case 'claim':
      return {
        ...state,
        sentences: state.sentences.map(sentence => sentence.id !== event.sentence_id ? sentence : {
          ...sentence,
          claims: [...sentence.claims.filter(claim => claim.concept_id !== event.claim.concept_id), event.claim],
        }),
      };
    case 'concept_state': {
      if (!state.pack?.concepts.some(concept => concept.id === event.concept_id)) return state;
      const previous = state.latestSentence[event.concept_id];
      const index = (id: string | null | undefined) => state.sentences.findIndex(sentence => sentence.id === id);
      // A late result still annotates its own sentence, but cannot undo a newer explanation.
      if (previous && (event.sentence_id === null || index(event.sentence_id) < index(previous))) return state;
      return {
        ...state,
        concepts: { ...state.concepts, [event.concept_id]: event.state },
        latestSentence: { ...state.latestSentence, [event.concept_id]: event.sentence_id },
      };
    }
    case 'report':
      return { ...state, report: event.report };
    case 'error':
      return { ...state, error: event.message };
  }
}

export function studyReducer(state: DemoScreenState, action: StudyAction): DemoScreenState {
  if (action.type === 'reset') return initialStudyState;
  if (action.type === 'error') return { ...state, error: action.message };
  const response = action.response;
  // Explicit reset is required before another session can take over the screen.
  if (state.sessionId && state.sessionId !== response.session_id) return state;
  const base = {
    ...state, sessionId: response.session_id, pack: response.topic_pack, error: null,
  };
  return response.events.reduce(applyStudyEvent, base);
}
