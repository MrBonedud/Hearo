import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

export function FeedbackSoundToggle({ enabled, onToggle, supported = true }: { enabled: boolean; onToggle: () => void; supported?: boolean }) {
  const { t } = useTranslation();
  return <button type="button" className="feedback-sound-toggle" aria-pressed={enabled && supported} disabled={!supported} onClick={onToggle} data-testid="button-feedback-sound">
    {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
    <span>{t(!supported ? 'sound.unavailable' : enabled ? 'sound.on' : 'sound.off')}</span>
  </button>;
}
