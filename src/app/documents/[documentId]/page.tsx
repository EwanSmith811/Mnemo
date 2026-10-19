'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Document, Flashcard } from '@/types';
const TOOLS = [
  {
    route: 'graph',
    title: 'Concept map',
    description: 'See how the ideas fit together.',
    action: 'Explore connections',
  },
  {
    route: 'flashcards',
    title: 'Flashcards',
    description: 'Build recall with spaced repetition.',
    action: 'Start reviewing',
  },
  {
    route: 'quiz',
    title: 'Practice quiz',
    description: 'Test your understanding and learn from each answer.',
    action: 'Take a quiz',
  },
  {
    route: 'workbench',
    title: 'Study workbench',
    description: 'Work through each topic, from the brief to applied practice.',
    action: 'Work through a topic',
  },
  {
    route: 'summaries',
    title: 'Topic summaries',
    description: 'Get a clear explanation of the key concepts.',
    action: 'Read the summaries',
  },
  {
    route: 'chat',
    title: 'Ask Mnemo',
    description: 'Talk through a question using your document as context.',
    action: 'Ask a question',
  },
  {
    route: 'verbal',
    title: 'Voice practice',
    description: 'Explain it out loud or let Mnemo quiz you.',
    action: 'Start a conversation',
  },
];
export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/documents/${documentId}`, { signal: controller.signal }),
      fetch(`/api/flashcards/${documentId}`, { signal: controller.signal }),
    ])
      .then(async ([docRes, cardsRes]) => {
        const data = await docRes.json();
        if (!docRes.ok)
          throw new Error(data.error || 'Could not load the document.');
        setDoc(data);
        if (cardsRes.ok) {
          const cards: Flashcard[] = await cardsRes.json();
          setDue(
            cards.filter(
              (c) => new Date(c.next_review_date).getTime() <= Date.now(),
            ).length,
          );
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId]);
  async function remove() {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!res.ok)
        throw new Error('Could not delete the document. Please retry.');
      router.push('/');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not delete the document.',
      );
      setDeleting(false);
    }
  }
  if (loading)
    return (
      <main className="map-status" role="status">
        Loading study material…
      </main>
    );
  return (
    <main className="document-page">
      <Link href="/" className="back-link">
        ← Document library
      </Link>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {doc && (
        <>
          <header className="document-header">
            <div>
              <h1>{doc.filename}</h1>
              <p>
                {doc.file_type.toUpperCase()} <span>·</span>{' '}
                {doc.study_mode === 'nursing' ? 'Nursing' : 'Engineering'}{' '}
                <span>·</span> {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>
            <button className="text-button" onClick={() => setConfirm(true)}>
              Delete document
            </button>
          </header>
          {confirm && (
            <section className="delete-confirmation" role="alert">
              <h2>Delete this document and its study material?</h2>
              <p>
                This removes its concept map, flashcards, quizzes, summaries,
                conversations, and workbench progress. You can’t undo this.
              </p>
              <div>
                <button
                  className="secondary-button"
                  disabled={deleting}
                  onClick={remove}
                >
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  className="secondary-button"
                  disabled={deleting}
                  onClick={() => setConfirm(false)}
                >
                  Keep document
                </button>
              </div>
            </section>
          )}
          <div className="document-summary">
            <span>
              <strong>{doc.concept_node_count}</strong> connected concepts
            </span>
            <span>
              <strong>{doc.flashcard_count}</strong> flashcards
              {due !== null && ` · ${due} due now`}
            </span>
            <span>
              <strong>{doc.quiz_question_count}</strong> practice questions
            </span>
          </div>
          <section className="study-tools">
            <h2>Choose how to study</h2>
            {TOOLS.map((tool) => (
              <Link
                key={tool.route}
                href={`/${tool.route}/${documentId}`}
                className="study-tool-row"
              >
                <div>
                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                </div>
                <span>
                  {tool.action} <span aria-hidden>↗</span>
                </span>
              </Link>
            ))}
          </section>
        </>
      )}
      {!doc && !error && <p className="empty-state">Document not found.</p>}
    </main>
  );
}
