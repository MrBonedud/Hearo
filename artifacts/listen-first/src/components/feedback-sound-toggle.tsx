import { Volume2, VolumeX } from 'lucide-react';

export function FeedbackSoundToggle({ enabled, onToggle, supported = true }: { enabled: boolean; onToggle: () => void; supported?: boolean }) {
  return <button type="button" className="feedback-sound-toggle" aria-pressed={enabled && supported} disabled={!supported} onClick={onToggle} data-testid="button-feedback-sound">
    {enabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
    <span>{!supported ? 'الصوت غير متاح في هذا المتصفح · Sound unavailable' : enabled ? 'الصوت يعمل · Feedback sound on' : 'الصوت متوقف · Feedback sound off'}</span>
  </button>;
}
