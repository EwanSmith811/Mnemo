import { Worker } from 'node:worker_threads';
import { join } from 'node:path';

// Legacy binary PowerPoint readers can encounter malformed record chains.
// Isolate parsing so time and memory limits also apply to synchronous work.
const PARSER_TIMEOUT_MS = 10_000;
export async function extractLegacyPowerPoint(buffer: Buffer): Promise<string> {
  const signature = Buffer.from('d0cf11e0a1b11ae1', 'hex');
  if (buffer.length < 512 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error(
      'Invalid binary PowerPoint file. Export it as PPTX or PDF and try again.',
    );
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      join(process.cwd(), 'src/lib/powerpoint-worker.mjs'),
      {
        workerData: { buffer },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      },
    );
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'PowerPoint parsing took too long. Export it as PPTX or PDF and try again.',
          ),
        ),
      PARSER_TIMEOUT_MS,
    );
    function finish(error?: Error, text?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(text!);
    }
    worker.once('message', (result: { text?: unknown; error?: boolean }) => {
      if (result.error || typeof result.text !== 'string')
        finish(
          new Error(
            'Could not read this legacy PowerPoint file. Export it as PPTX or PDF and try again.',
          ),
        );
      else finish(undefined, result.text.replace(/\r\n?/g, '\n'));
    });
    worker.once('error', () =>
      finish(
        new Error(
          'Could not read this PowerPoint file. Export it as PPTX or PDF and try again.',
        ),
      ),
    );
    worker.once('exit', (code) => {
      if (!settled)
        finish(
          new Error(
            `PowerPoint parser stopped before completing (exit ${code}).`,
          ),
        );
    });
  });
}
