'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Document } from '@/types';
import {
  nextAction,
  studySteps,
  type StepId,
  type StudyProgress,
} from '@/lib/study-plan';
import { BackLink, Meter, Modal, PageLoading, stagger } from '@/components/ui';

const STEP_ROUTES: Record<StepId, string> = {
  learn: 'learn',
  flashcards: 'flashcards',
  quiz: 'quiz',
  workbench: 'workbench',
};
const MORE = [
  [
    'graph',
    'Concept map',
    'See how every idea connects, then build a memory story.',
  ],
  [
    'summaries',
    'Topic summaries',
    'A clean, plain-language summary of each topic.',
  ],
  [
    'chat',
    'Ask Mnemo',
    'Ask anything about the deck and get a grounded answer.',
  ],
  ['verbal', 'Voice practice', 'Explain it out loud, or let Mnemo quiz you.'],
] as const;

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [progress, setProgress] = useState<StudyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/documents/${documentId}`, { signal: controller.signal }),
      fetch(`/api/documents/${documentId}/progress`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([docRes, progressRes]) => {
        const data = await docRes.json();
        if (!docRes.ok)
          throw new Error(data.error || 'Could not load the document.');
        setDoc(data);
        if (progressRes.ok) setProgress(await progressRes.json());
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
      setConfirm(false);
    }
  }

  if (loading) return <PageLoading label="Opening your study plan" />;
  if (!doc)
    return (
      <main className="page is-narrow">
        <BackLink href="/">Library</BackLink>
        <div className="empty-state">
          <h2>Deck not found.</h2>
          <p>{error || 'It may have been deleted.'}</p>
          <Link className="primary-button" href="/">
            Back to library
          </Link>
        </div>
      </main>
    );

  const steps = progress ? studySteps(progress) : [];
  const next = progress ? nextAction(documentId, progress) : null;
  const name = doc.filename.replace(/\.[^.]+$/, '');
  return (
    <main className="page dashboard">
      <BackLink href="/">Library</BackLink>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <header className="dashboard-head">
        <div>
          <span className="eyebrow rise">
            <b>{doc.file_type.toUpperCase()}</b>
            {doc.study_mode === 'nursing' ? 'Nursing' : 'Engineering'} · Added{' '}
            {new Date(doc.created_at).toLocaleDateString()}
          </span>
          <h1 className="display rise" style={stagger(1)}>
            {name}
          </h1>
        </div>
        <dl className="dashboard-stats rise" style={stagger(2)}>
          {progress && progress.slides.total > 0 && (
            <div>
              <dt>Slides</dt>
              <dd>{progress.slides.total}</dd>
            </div>
          )}
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
      </header>

      {next && (
        <section className="next-up rise" style={stagger(3)}>
          <div className="next-up-copy">
            <span className="eyebrow">Next up</span>
            <h2>{next.title}</h2>
            <p>{next.detail}</p>
          </div>
          <Link className="primary-button is-large" href={next.href}>
            {next.cta} <span className="arrow">↗</span>
          </Link>
          <svg className="next-up-art" viewBox="0 0 200 200" aria-hidden>
            {[86, 64, 42].map((r, i) => (
              <circle
                key={r}
                cx="100"
                cy="100"
                r={r}
                style={{ animationDelay: `${i * -2}s` }}
              />
            ))}
            <circle cx="100" cy="100" r="5" className="next-up-core" />
          </svg>
        </section>
      )}

      {steps.length > 0 && (
        <section className="plan" aria-labelledby="plan-title">
          <div className="section-title">
            <h2 id="plan-title">Your study plan</h2>
            <p>Understand it, recall it, test it, then use it.</p>
          </div>
          <ol className="plan-steps">
            {steps.map((step, i) => {
              const active = next?.step === step.id;
              return (
                <li key={step.id} className="rise" style={stagger(i + 4)}>
                  <Link
                    href={`/${STEP_ROUTES[step.id]}/${documentId}`}
                    className={`plan-step ${step.done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
                  >
                    <span className="plan-step-num mono">
                      {step.done ? '✓' : `0${i + 1}`}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                    <Meter
                      value={step.progress}
                      tone={step.done ? 'good' : undefined}
                    />
                    <span className="plan-step-state mono">
                      {step.done
                        ? 'Done'
                        : active
                          ? 'Up next'
                          : step.progress > 0
                            ? 'In progress'
                            : 'Not started'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="more-tools" aria-labelledby="more-title">
        <div className="section-title">
          <h2 id="more-title">More ways in</h2>
          <p>Use these whenever something doesn’t click.</p>
        </div>
        <div className="more-grid">
          {MORE.map(([route, title, text], i) => (
            <Link
              key={route}
              href={`/${route}/${documentId}`}
              className={`card more-tool more-tool-${route} rise`}
              style={stagger(i + 8)}
            >
              <span className="more-tool-glyph" aria-hidden />
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="arrow" aria-hidden>
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="dashboard-foot">
        <button className="text-button" onClick={() => setConfirm(true)}>
          Delete this deck
        </button>
      </footer>
      {confirm && (
        <Modal
          title="Delete this deck?"
          description="This removes its walkthrough progress, flashcards, quizzes, summaries, conversations and workbench sessions. You can’t undo this."
          onClose={() => setConfirm(false)}
          busy={deleting}
        >
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={deleting}
              onClick={() => setConfirm(false)}
            >
              Keep it
            </button>
            <button
              className="danger-button"
              disabled={deleting}
              onClick={remove}
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
