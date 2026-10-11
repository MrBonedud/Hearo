import { useEffect, useRef, useState } from 'react';
import { useGetDemoSource, getGetDemoSourceQueryKey, uploadDemoPdf } from '@workspace/api-client-react';
import type { DemoSource, VerifiedDemoSource } from '@workspace/api-client-react';
import { BookOpen, FileText, Upload } from 'lucide-react';
import { sha256 } from '@/lib/study-session-storage';
import type { UiMessage } from '@/i18n/messages';
import { useTranslation } from '@/i18n/useTranslation';

export type SelectedSource = VerifiedDemoSource & { fileUrl: string; selectedName: string; pdfSha256: string };

function uploadError(error: unknown): UiMessage {
  const issue = error as { data?: { error?: string }; message?: string };
  return { raw: issue.data?.error || issue.message || '', fallback: 'source.uploadFailed' };
}

export function SourcePassages({ source, fileUrl }: { source: DemoSource; fileUrl: string }) {
  const { t, plural } = useTranslation();
  return <details className="source-passages" data-testid="details-source-passages">
    <summary data-testid="button-source-passages">{plural('sourcePassages', source.referenceLines.length)}</summary>
    <p className="source-scope" dir="ltr">{source.scope}</p>
    <ol dir="ltr">
      {source.referenceLines.map(line => <li key={line.id} id={`source-${line.id}`} data-testid={`source-${line.id}`}>
        <a href={`${fileUrl}#page=${line.page}`} target="_blank" rel="noreferrer" data-testid={`link-source-${line.id}`}>
          {t('source.slideRef', { id: line.id, page: line.page })}
        </a>
        <p>{line.text}</p>
      </li>)}
    </ol>
  </details>;
}

export function ApprovedPdfSource({ selected, onChange, disabled = false }: {
  selected: SelectedSource | null; onChange: (source: SelectedSource | null) => void; disabled?: boolean;
}) {
  const { t, plural, message } = useTranslation();
  const metadata = useGetDemoSource({ query: { queryKey: getGetDemoSourceQueryKey(), retry: false, staleTime: 30_000 } });
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  async function selectFile(file?: File) {
    if (!file || !metadata.data || disabled) return;
    const requestId = ++generation.current;
    controller.current?.abort();
    onChange(null);
    setError(null);
    setBusy(false);
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      setError({ key: 'source.notPdf' });
      return;
    }
    if (file.size !== metadata.data.byteLength) {
      setError({ key: 'source.sizeMismatch' });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const verified = await uploadDemoPdf(file, { signal: abort.signal });
      if (requestId !== generation.current) return;
      const pdfSha256 = await sha256(await file.arrayBuffer());
      if (requestId !== generation.current) return;
      onChange({ ...verified, fileUrl: URL.createObjectURL(file), selectedName: file.name, pdfSha256 });
    } catch (issue) {
      if (requestId === generation.current && !abort.signal.aborted) setError(uploadError(issue));
    } finally {
      if (requestId === generation.current) setBusy(false);
    }
  }

  return <section className="approved-source" aria-label={t('source.regionLabel')}>
    <div className="label-row"><span className="field-label">{t('source.chooseLabel')}</span><span className="optional-note">{t('source.formatNote')}</span></div>
    {metadata.isLoading && <p role="status">{t('source.loading')}</p>}
    {metadata.isError && <div className="inline-error" role="alert">
      {t('source.loadFailed')}
      <button type="button" onClick={() => metadata.refetch()} data-testid="button-retry-source">{t('common.retry')}</button>
    </div>}
    {metadata.data && <>
      <h2 className="source-title" dir="auto">{metadata.data.title}</h2>
      <p className="source-byline"><bdi>{metadata.data.author}</bdi> · {plural('slides', metadata.data.pageCount)}</p>
      <a className="source-download" href={metadata.data.downloadUrl} target="_blank" rel="noreferrer" data-testid="link-download-approved-pdf">
        <BookOpen size={16} aria-hidden="true" /> {t('source.download')}
      </a>
      <p className="source-scope">{t('source.exactFileHint')}</p>
      <button type="button" className="upload-button source-picker" onClick={() => fileInput.current?.click()} disabled={busy || disabled} data-testid="button-upload-reference">
        <Upload size={16} aria-hidden="true" /> {busy ? t('source.verifying') : t('source.choosePdf')}
      </button>
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="visually-hidden" disabled={busy || disabled}
        aria-label={t('source.inputLabel')} data-testid="input-file"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }} />
      {busy && <p role="status" data-testid="status-upload-pending">{t('source.uploadPending')}</p>}
    </>}
    {error && <p className="inline-error" role="alert" dir="auto" data-testid="status-upload-error">{message(error)}</p>}
    {selected && <div className="verified-source">
      <p role="status" data-testid="status-source-verified">{t('source.verified')}</p>
      <a href={selected.fileUrl} target="_blank" rel="noreferrer" data-testid="link-open-pdf">
        <FileText size={16} aria-hidden="true" /> {t('source.open')} <bdi>{selected.selectedName}</bdi>
      </a>
      <SourcePassages source={selected.source} fileUrl={selected.fileUrl} />
    </div>}
    {metadata.data && !metadata.data.aiAvailable && <p className="ai-unavailable" role="status" data-testid="status-ai-unavailable">
      {t('source.aiUnavailable')}
    </p>}
  </section>;
}
