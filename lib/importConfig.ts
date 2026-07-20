/**
 * Import Engine — central configuration.
 *
 * Every tunable lives here and is overridable via environment variables. There
 * are NO hardcoded row/page limits anywhere in the import path — the parser
 * reads until EOF and the only real ceiling is server memory (see `maxChunks`,
 * which is derived to be effectively unbounded and exists purely as a safety
 * valve against a runaway/corrupt file).
 *
 * Override any value in .env.local, e.g.:
 *   IMPORT_CHUNK_SIZE=50
 *   IMPORT_DB_BATCH_SIZE=100
 *   IMPORT_MAX_WORKERS=4
 */

const num = (v: string | undefined, def: number): number => {
  const n = v !== undefined ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
};

export interface ImportEngineConfig {
  /** Rows per AI extraction chunk. Smaller = less RAM & lower token pressure. */
  chunkSize: number;
  /** Rows committed per DB transaction (batch insert). */
  databaseBatchSize: number;
  /** Parallel AI chunk/page calls (bounded concurrency, not unbounded fan-out). */
  maxConcurrentWorkers: number;
  /** Min chars of embedded text before a PDF is treated as text (else OCR/vision). */
  ocrThreshold: number;
  /** Rows above this ⇒ processing should stream in the background, not block the UI. */
  backgroundWorkerThresholdRows: number;
  /** Pages above this ⇒ background streaming. */
  backgroundWorkerThresholdPages: number;
  /** Soft memory budget (MB) that bounds how much is held at once. */
  memoryLimitMb: number;
  /** Per-AI-call timeout (ms). */
  timeoutMs: number;
  /** Extra passes to retry any failed chunk/batch before giving up. */
  retryCount: number;
  /** Max output tokens per AI call (high, so a chunk never truncates mid-JSON). */
  aiMaxTokens: number;
  /** Safety ceiling on chunk count — effectively unlimited; guards against runaway files. */
  maxChunks: number;
  /** Max page-images processed per request (each = one vision call). */
  maxImages: number;
}

export const importConfig: ImportEngineConfig = {
  chunkSize: num(process.env.IMPORT_CHUNK_SIZE, 50),
  databaseBatchSize: num(process.env.IMPORT_DB_BATCH_SIZE, 100),
  maxConcurrentWorkers: num(process.env.IMPORT_MAX_WORKERS, 4),
  ocrThreshold: num(process.env.IMPORT_OCR_THRESHOLD, 40),
  backgroundWorkerThresholdRows: num(process.env.IMPORT_BG_THRESHOLD_ROWS, 100),
  backgroundWorkerThresholdPages: num(process.env.IMPORT_BG_THRESHOLD_PAGES, 10),
  memoryLimitMb: num(process.env.IMPORT_MEMORY_LIMIT_MB, 512),
  timeoutMs: num(process.env.IMPORT_TIMEOUT_MS, 60000),
  retryCount: num(process.env.IMPORT_RETRY_COUNT, 1),
  aiMaxTokens: num(process.env.IMPORT_AI_MAX_TOKENS, 8192),
  maxChunks: num(process.env.IMPORT_MAX_CHUNKS, 100000),
  maxImages: num(process.env.IMPORT_MAX_IMAGES, 200),
};

/** True when a job of this size should stream/background rather than block. */
export function shouldRunInBackground(rows: number, pages: number): boolean {
  return rows > importConfig.backgroundWorkerThresholdRows
    || pages > importConfig.backgroundWorkerThresholdPages;
}
