import type { CheckLatency } from '@/hooks/use-live-assessment';
import { useTranslation } from '@/i18n/useTranslation';

export function CheckLatencyNote({ latency }: { latency: CheckLatency | null }) {
  const { t, number } = useTranslation();
  if (!latency) return null;
  const kind = t(latency.kind === 'final' ? 'latency.final' : latency.kind === 'retry' ? 'latency.retry' : 'latency.live');
  const seconds = number(latency.ms / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <p className="latency-note" role="status" data-testid="status-check-latency">
    {t(latency.ok ? 'latency.completed' : 'latency.failed', { kind, seconds })}
    <small> {t('latency.note')}</small>
  </p>;
}
