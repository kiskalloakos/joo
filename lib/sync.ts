// Tracks the most recent Supabase result so the UI can show a "sync failed" pill.

export type SyncStatus = 'ok' | 'failed';

let status: SyncStatus = 'ok';
let lastError: string | null = null;
const listeners = new Set<(status: SyncStatus, error: string | null) => void>();

function emit() {
  listeners.forEach((fn) => fn(status, lastError));
}

export function reportSyncError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  // Surface the full error in the Metro terminal — the in-app pill only
  // shows "sync failed" without context, which makes diagnosing painful.
  // Serialize inline so it can't render as "[object Object]" and so
  // Postgres' code/details/hint fields are always visible.
  let serialized: string;
  try {
    serialized =
      typeof error === 'object' && error !== null
        ? JSON.stringify(error, Object.getOwnPropertyNames(error))
        : String(error);
  } catch {
    serialized = String(error);
  }
  // eslint-disable-next-line no-console
  console.warn(`[sync] Supabase error: ${serialized}`);
  if (status === 'failed' && lastError === msg) return;
  status = 'failed';
  lastError = msg;
  emit();
}

export function reportSyncSuccess(): void {
  if (status === 'ok') return;
  status = 'ok';
  lastError = null;
  emit();
}

export function subscribeSync(fn: (status: SyncStatus, error: string | null) => void): () => void {
  listeners.add(fn);
  fn(status, lastError);
  return () => {
    listeners.delete(fn);
  };
}

// Wraps a Supabase call's result. Reports success/failure to listeners.
// Supabase clients resolve with `{ error: PostgrestError | null }` rather than throwing.
export async function reportable(
  p: PromiseLike<{ error: { message: string } | null | undefined }>,
): Promise<void> {
  try {
    const { error } = await p;
    if (error) reportSyncError(error);
    else reportSyncSuccess();
  } catch (e) {
    reportSyncError(e);
  }
}
