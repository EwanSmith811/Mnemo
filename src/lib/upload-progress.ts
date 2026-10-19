export type UploadStage = 'uploading' | 'reading' | 'generating' | 'saving';
export type UploadResult = {
  document_id: string;
  flashcard_count: number;
  quiz_question_count: number;
  topic_summary_count: number;
  concept_node_count: number;
};
export type UploadEvent =
  | { type: 'progress'; stage: UploadStage; ready?: 'materials' | 'graph' }
  | ({ type: 'complete' } & UploadResult)
  | { type: 'error'; message: string }
  | { type: 'heartbeat' };

/** NDJSON frames may cross network chunks, including inside UTF-8 characters. */
export async function readUploadProgress(
  response: Response,
  onProgress: (event: Extract<UploadEvent, { type: 'progress' }>) => void,
): Promise<UploadResult> {
  if (!response.ok || !response.body)
    throw new Error('Could not start the upload. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: UploadResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as UploadEvent;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'progress') onProgress(event);
    if (event.type === 'complete') {
      if (!/^[0-9a-f-]{36}$/i.test(event.document_id))
        throw new Error(
          'The upload returned an invalid document. Check your library before retrying.',
        );
      result = event;
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop()!;
      lines.forEach(consume);
      if (done) break;
    }
    consume(pending);
    if (!result)
      throw new Error(
        'The connection ended before generation finished. Check your document library before retrying.',
      );
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
