'use client';
import Link from 'next/link';
import type { Document } from '@/types';
import { stagger } from './ui';

const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export default function DocumentList({
  documents,
  isLoading,
}: {
  documents: Document[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="document-grid" role="status" aria-label="Loading decks">
        {[0, 1, 2].map((i) => (
          <div key={i} className="document-card is-skeleton">
            <span className="skeleton" style={{ width: 54, height: 22 }} />
            <span className="skeleton" style={{ width: '80%', height: 26 }} />
            <span className="skeleton" style={{ width: '45%', height: 14 }} />
          </div>
        ))}
      </div>
    );
  if (!documents.length)
    return (
      <div className="empty-state">
        <h3>Nothing here yet.</h3>
        <p>
          Upload your first deck above and it will live here, ready to study.
        </p>
      </div>
    );
  return (
    <div className="document-grid">
      {documents.map((doc, i) => {
        const content = (
          <>
            <div className="document-card-top">
              <span className="file-type mono">{doc.file_type}</span>
              <span className="chip">
                {doc.study_mode === 'nursing' ? 'Nursing' : 'Engineering'}
              </span>
            </div>
            <h3>{doc.filename.replace(/\.[^.]+$/, '')}</h3>
            {doc.status === 'failed' ? (
              <p className="document-card-error">
                {doc.error_message ||
                  'Processing failed. Upload the document again.'}
              </p>
            ) : (
              <dl className="document-card-stats">
                <div>
                  <dt>Concepts</dt>
                  <dd>{doc.concept_node_count}</dd>
                </div>
                <div>
                  <dt>Cards</dt>
                  <dd>{doc.flashcard_count}</dd>
                </div>
                <div>
                  <dt>Questions</dt>
                  <dd>{doc.quiz_question_count}</dd>
                </div>
              </dl>
            )}
            <div className="document-card-foot">
              <span className="mono">{date(doc.created_at)}</span>
              {doc.status === 'completed' ? (
                <span className="document-card-open">
                  Study <span className="arrow">↗</span>
                </span>
              ) : (
                <span
                  className={`chip ${doc.status === 'failed' ? 'is-bad' : 'is-warn'}`}
                >
                  {doc.status === 'failed' ? 'Failed' : 'Processing'}
                </span>
              )}
            </div>
          </>
        );
        return doc.status === 'completed' ? (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="document-card rise"
            style={stagger(Math.min(i, 8))}
          >
            {content}
          </Link>
        ) : (
          <article
            key={doc.id}
            className="document-card rise"
            style={stagger(Math.min(i, 8))}
          >
            {content}
          </article>
        );
      })}
    </div>
  );
}
