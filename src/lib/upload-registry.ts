import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import type { StudyMode } from '@/types';
import type { UploadResult } from './upload-progress';

export type RunSQL = (
  sql: string,
  values: unknown[],
) => Promise<Record<string, unknown>[]>;
export type UploadClaim = {
  contentHash: string;
  mode: StudyMode;
  owner: string;
};
type ClaimResult =
  | { kind: 'existing'; document: UploadResult }
  | { kind: 'pending' }
  | { kind: 'claimed'; claim: UploadClaim };

export const studyContentHash = (text: string) =>
  createHash('sha256').update(text).digest('hex');

export class UploadRegistry {
  constructor(private run: RunSQL) {}

  private async completed(contentHash: string, mode: StudyMode) {
    const rows = await this.run(
      `SELECT id AS document_id, flashcard_count, quiz_question_count,
      topic_summary_count, concept_node_count FROM public."mnemo-documents"
      WHERE content_hash = $1 AND study_mode = $2 AND status = 'completed'
        AND NOT is_duplicate LIMIT 1`,
      [contentHash, mode],
    );
    return rows[0] as UploadResult | undefined;
  }

  async claim(contentHash: string, mode: StudyMode): Promise<ClaimResult> {
    const existing = await this.completed(contentHash, mode);
    if (existing) return { kind: 'existing', document: existing };
    const owner = randomUUID();
    const rows = await this.run(
      `INSERT INTO public."mnemo-upload_claims" (content_hash, study_mode, owner, expires_at)
      VALUES ($1, $2, $3, now() + interval '15 minutes')
      ON CONFLICT (content_hash, study_mode) DO UPDATE
        SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
        WHERE "mnemo-upload_claims".expires_at <= now()
      RETURNING owner`,
      [contentHash, mode, owner],
    );
    // The first request may have committed between our initial lookup and claim.
    const committed = await this.completed(contentHash, mode);
    if (committed) {
      if (rows.length) await this.release({ contentHash, mode, owner });
      return { kind: 'existing', document: committed };
    }
    if (!rows.length) return { kind: 'pending' };
    return { kind: 'claimed', claim: { contentHash, mode, owner } };
  }

  async assertOwned(claim: UploadClaim) {
    const rows = await this.run(
      `SELECT owner FROM public."mnemo-upload_claims"
      WHERE content_hash = $1 AND study_mode = $2 AND owner = $3
      AND expires_at > now() FOR UPDATE`,
      [claim.contentHash, claim.mode, claim.owner],
    );
    if (!rows.length)
      throw new Error(
        'The upload lease expired. Retry to check for an existing document.',
      );
  }

  async release(claim: UploadClaim) {
    await this.run(
      `DELETE FROM public."mnemo-upload_claims"
      WHERE content_hash = $1 AND study_mode = $2 AND owner = $3`,
      [claim.contentHash, claim.mode, claim.owner],
    );
  }
}
