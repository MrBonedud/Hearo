import source from '../../../../shared/topic-packs/system-design-slides.json';

// Prepared illustrations, never a substitute for evaluating a learner.
export const offlineSampleSource = source;
export const offlineSampleSteps = [
  { conceptId: 'scaling', narration: 'Scale out يضيف مثيلات أخرى، بينما Scale up ينتقل إلى مثيل أكبر. مع تعدد المثيلات نحتاج إلى توزيع العمل بينها.', lineIds: ['S04-01', 'S04-02', 'S04-03'], status: 'supported', statusLabel: 'Prepared supported example' },
  { conceptId: 'load-balancing', narration: 'موزّع الحمل يوزّع طلبات HTTP على خوادم أمامية متعددة، ويبقي حزم اتصال TCP الواحد على الخادم نفسه. يمكن اختيار الخادم عشوائيًا أو بحسب الحمل، والتوقف عن استخدام خادم يتعطل.', lineIds: ['S05-01', 'S06-01', 'S06-02', 'S06-03', 'S07-01'], status: 'supported', statusLabel: 'Prepared supported example' },
  { conceptId: 'stateless-servers', narration: 'الخوادم عديمة الحالة تسهّل توزيع الحمل: طلبات المستخدم قد تذهب إلى خوادم مختلفة مع قاعدة بيانات مشتركة، بينما WebSockets تربط المتصفح بخادم معين.', lineIds: ['S08-01', 'S08-02', 'S08-03', 'S08-04'], status: 'supported', statusLabel: 'Prepared supported example' },
  { conceptId: 'sharding', narration: 'Sharding يوزّع قاعدة البيانات على عدة مثيلات، ويسمّى كل جزء Data shard. هذا المثال لم يشرح بعد تعقيد تقسيم البيانات داخل التطبيق.', lineIds: ['S09-01', 'S09-02', 'S09-04'], status: 'partial', statusLabel: 'Prepared incomplete example' },
  { conceptId: 'replication', narration: 'Replication يحتفظ بأكثر من نسخة من البيانات لتحمّل الأعطال؛ يذكر المرجع أن ثلاث نسخ خيار شائع.', lineIds: ['S09-03'], status: 'supported', statusLabel: 'Prepared supported example' },
  { conceptId: 'caching', narration: 'خطأ مكتوب مسبقًا للتوضيح: «التخزين المؤقت يسرّع الكتابات تلقائيًا، فلا حاجة لإرسالها إلى DBMS».', lineIds: ['S10-03'], status: 'contradicted', statusLabel: 'Prepared misconception · not a learner judgement' },
] as const;

export type OfflineSampleState = { step: number; finished: boolean };
export const initialOfflineSampleState: OfflineSampleState = { step: -1, finished: false };

export function offlineSampleReducer(state: OfflineSampleState, action: 'start' | 'next' | 'back'): OfflineSampleState {
  if (action === 'start') return { step: 0, finished: false };
  if (state.step < 0 || state.finished) return state;
  if (action === 'back') return { step: Math.max(0, state.step - 1), finished: false };
  return state.step === offlineSampleSteps.length - 1
    ? { ...state, finished: true }
    : { step: state.step + 1, finished: false };
}
