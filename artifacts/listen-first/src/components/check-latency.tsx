import type { CheckLatency } from '@/hooks/use-live-assessment';

export function CheckLatencyNote({ latency }: { latency: CheckLatency | null }) {
  if (!latency) return null;
  const kind = latency.kind === 'final' ? 'Final check' : latency.kind === 'retry' ? 'Retried check' : 'Live check';
  return <p className="latency-note" role="status" data-testid="status-check-latency">
    {kind} {latency.ok ? 'completed' : 'failed'} · end-to-end checking latency {(latency.ms / 1000).toFixed(2)} s
    <small> Measured in this browser from request to response. This is not speech-recognition latency.</small>
  </p>;
}
