import type { DemoTopicPack } from '@workspace/api-client-react';

export type ReplaySentence = { label: string; text: string };

/** Recorded text, not live audio or AI output. All content comes from the approved pack. */
export function demoReplaySentences(pack: DemoTopicPack): ReplaySentence[] {
  const line = (id: number) => {
    const value = pack.reference_lines.find(source => source.line_id === id);
    if (!value) throw new Error(`سطر المرجع ${id} غير متاح.`);
    return value.text;
  };
  const misconception = (id: string) => {
    const value = pack.misconceptions.find(item => item.concept_id === id);
    if (!value) throw new Error('التصحيح المؤلّف غير متاح.');
    return value;
  };
  return [
    { label: 'توزيع الحمل', text: line(1) },
    { label: 'التوسّع الأفقي', text: line(3) },
    { label: 'التخزين المؤقت', text: line(4) },
    { label: 'خطأ مقصود: حداثة البيانات', text: misconception('cache-freshness').wrong_claim },
    { label: 'تكرار البيانات', text: line(7) },
    { label: 'خطأ مقصود: النسخ الاحتياطي', text: misconception('backups').wrong_claim },
    { label: 'تصحيح ذاتي: حداثة البيانات', text: misconception('cache-freshness').correction },
    { label: 'تصحيح ذاتي: النسخ الاحتياطي', text: misconception('backups').correction },
  ];
}
