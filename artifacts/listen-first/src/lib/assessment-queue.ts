/** Serialize model requests, coalesce identical work, and reuse exact snapshots. */
export class AssessmentQueue<Input, Result> {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Promise<Result>>();
  private completed: { key: string; result: Result } | null = null;
  private lastStarted = -Infinity;

  constructor(
    private transport: (input: Input) => Promise<Result>,
    private intervalMs = 8000,
    private now = () => Date.now(),
    private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  ) {}

  request(key: string, input: Input, force = false): Promise<Result> {
    const pending = this.pending.get(key);
    if (pending) return pending;
    // A cached result must not jump ahead of an outstanding, different snapshot.
    const job = this.tail.catch(() => undefined).then(async () => {
      if (!force && this.completed?.key === key) return this.completed.result;
      const delay = Math.max(0, this.intervalMs - (this.now() - this.lastStarted));
      if (delay) await this.sleep(delay);
      this.lastStarted = this.now();
      const result = await this.transport(input);
      this.completed = { key, result };
      return result;
    });
    this.pending.set(key, job);
    this.tail = job;
    void job.finally(() => {
      if (this.pending.get(key) === job) this.pending.delete(key);
    }).catch(() => undefined);
    return job;
  }
}

export function isCheckedPrefix(checked: string, current: string): boolean {
  return Boolean(checked) && (current === checked || current.startsWith(`${checked} `));
}
