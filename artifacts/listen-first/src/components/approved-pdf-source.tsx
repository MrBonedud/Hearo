import { useEffect, useRef, useState } from 'react';
import { useGetDemoSource, getGetDemoSourceQueryKey, uploadDemoPdf } from '@workspace/api-client-react';
import type { DemoSource, VerifiedDemoSource } from '@workspace/api-client-react';
import { BookOpen, FileText, Upload } from 'lucide-react';

export type SelectedSource = VerifiedDemoSource & { fileUrl: string; selectedName: string };

function uploadError(error: unknown) {
  const issue = error as { data?: { error?: string }; message?: string };
  return issue.data?.error || issue.message || 'تعذّر التحقق من الملف. Unable to verify this file. Try again.';
}

export function SourcePassages({ source, fileUrl }: { source: DemoSource; fileUrl: string }) {
  return <details className="source-passages" data-testid="details-source-passages">
    <summary data-testid="button-source-passages">نصوص المصدر · {source.referenceLines.length} source passages</summary>
    <p className="source-scope" dir="ltr">{source.scope}</p>
    <ol dir="ltr">
      {source.referenceLines.map(line => <li key={line.id} id={`source-${line.id}`} data-testid={`source-${line.id}`}>
        <a href={`${fileUrl}#page=${line.page}`} target="_blank" rel="noreferrer" data-testid={`link-source-${line.id}`}>
          {line.id} · Slide {line.page}
        </a>
        <p>{line.text}</p>
      </li>)}
    </ol>
  </details>;
}

export function ApprovedPdfSource({ selected, onChange, disabled = false }: {
  selected: SelectedSource | null; onChange: (source: SelectedSource | null) => void; disabled?: boolean;
}) {
  const metadata = useGetDemoSource({ query: { queryKey: getGetDemoSourceQueryKey(), retry: false, staleTime: 30_000 } });
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  async function selectFile(file?: File) {
    if (!file || !metadata.data || disabled) return;
    const requestId = ++generation.current;
    controller.current?.abort();
    onChange(null);
    setError('');
    setBusy(false);
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      setError('اختر ملف PDF فقط. Text files, images, and other formats are not supported.');
      return;
    }
    if (file.size !== metadata.data.byteLength) {
      setError('حجم الملف لا يطابق النسخة المعتمدة. Download the original PDF using the link above.');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const verified = await uploadDemoPdf(file, { signal: abort.signal });
      if (requestId !== generation.current) return;
      onChange({ ...verified, fileUrl: URL.createObjectURL(file), selectedName: file.name });
    } catch (issue) {
      if (requestId === generation.current && !abort.signal.aborted) setError(uploadError(issue));
    } finally {
      if (requestId === generation.current) setBusy(false);
    }
  }

  return <section className="approved-source" aria-label="Approved English slide PDF">
    <div className="label-row"><span className="field-label" lang="ar" dir="rtl">اختر ملف العرض المعتمد</span><span className="optional-note">English slides · PDF only</span></div>
    {metadata.isLoading && <p role="status">Loading the approved source…</p>}
    {metadata.isError && <div className="inline-error" role="alert">
      Source information could not be loaded.
      <button type="button" onClick={() => metadata.refetch()} data-testid="button-retry-source">Retry</button>
    </div>}
    {metadata.data && <>
      <h2 className="source-title">{metadata.data.title}</h2>
      <p className="source-byline">{metadata.data.author} · {metadata.data.pageCount} slides</p>
      <a className="source-download" href={metadata.data.downloadUrl} target="_blank" rel="noreferrer" data-testid="link-download-approved-pdf">
        <BookOpen size={15} /> Get the original PDF from Stanford
      </a>
      <p className="source-scope" lang="ar" dir="rtl">حمّل الملف من الرابط، ثم اختره هنا. يُقبل هذا الملف فقط؛ لا يمكن استخدام ملف آخر بتغيير اسمه.</p>
      <button type="button" className="upload-button source-picker" onClick={() => fileInput.current?.click()} disabled={busy || disabled} data-testid="button-upload-reference">
        <Upload size={16} /> {busy ? 'جارٍ التحقق · Verifying…' : 'اختيار ملف PDF · Choose PDF'}
      </button>
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="visually-hidden" disabled={busy || disabled}
        aria-label="Choose the approved PDF" data-testid="input-file"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }} />
      {busy && <p role="status" data-testid="status-upload-pending">Checking file contents on the server…</p>}
    </>}
    {error && <p className="inline-error" role="alert" dir="auto" data-testid="status-upload-error">{error}</p>}
    {selected && <div className="verified-source">
      <p role="status" data-testid="status-source-verified">تم التحقق من الملف · Exact PDF verified</p>
      <a href={selected.fileUrl} target="_blank" rel="noreferrer" data-testid="link-open-pdf">
        <FileText size={15} /> Open <bdi>{selected.selectedName}</bdi>
      </a>
      <SourcePassages source={selected.source} fileUrl={selected.fileUrl} />
    </div>}
    {metadata.data && !metadata.data.aiAvailable && <p className="ai-unavailable" role="status" data-testid="status-ai-unavailable">
      AI checking is not connected yet. You can open the source and draft an answer; no assessment will be invented.
    </p>}
  </section>;
}
