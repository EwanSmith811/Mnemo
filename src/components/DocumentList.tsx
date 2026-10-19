'use client';
import Link from 'next/link';
import type { Document } from '@/types';
export default function DocumentList({
  documents,
  isLoading,
}: {
  documents: Document[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="empty-state" role="status">
        <span className="loading-spinner" /> Loading documents…
      </div>
    );
  if (!documents.length)
    return (
      <div className="empty-state">
        <h3>Your next study session starts here.</h3>
        <p>
          Add a document above. Your study material will appear in this library.
        </p>
      </div>
    );
  return (
    <div className="document-list">
      {documents.map((doc) => {
        const content = (
          <>
            <span className="file-type">{doc.file_type.toUpperCase()}</span>
            <div className="document-name">
              <h3>{doc.filename}</h3>
              <p>
                {doc.study_mode === 'nursing' ? 'Nursing' : 'Engineering'}{' '}
                <span>·</span>{' '}
                {new Date(doc.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              {doc.status === 'failed' && (
                <p className="text-red-300">
                  {doc.error_message ||
                    'Processing failed. Upload the document again.'}
                </p>
              )}
            </div>
            <div className="document-counts">
              <span>{doc.concept_node_count} concepts</span>
              <span>{doc.flashcard_count} flashcards</span>
            </div>
            <span className={`document-status status-${doc.status}`}>
              {doc.status === 'completed'
                ? 'Ready to study'
                : doc.status === 'processing'
                  ? 'Processing'
                  : 'Failed'}
            </span>
            <span className="document-arrow" aria-hidden>
              ↗
            </span>
          </>
        );
        return doc.status === 'completed' ? (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="document-row"
          >
            {content}
          </Link>
        ) : (
          <article key={doc.id} className="document-row">
            {content}
          </article>
        );
      })}
    </div>
  );
}
