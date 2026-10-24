'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { WorkbenchContent, WorkbenchGroupStatus } from '@/types';
import { safeStudyHtml } from '@/lib/study-html';
import {
  learningSummary,
  practiceItems,
  type Confidence,
  type LearningSession,
} from '@/lib/workbench-learning';

export default function WorkbenchLesson({
  documentId,
  group,
}: {
  documentId: string;
  group: string;
}) {
  const [content, setContent] = useState<WorkbenchContent | null>(null),
    [session, setSession] = useState<LearningSession | null>(null),
    [topics, setTopics] = useState<WorkbenchGroupStatus[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [answer, setAnswer] = useState(''),
    [confidence, setConfidence] = useState<Confidence | null>(null),
    [showHint, setShowHint] = useState(false),
    [showNotes, setShowNotes] = useState(false);
  const sending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function get(url: string) {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Could not prepare this lesson.');
      return data;
    }
    (async () => {
      const [lesson, overview] = await Promise.all([
        get(
          `/api/workbench/${documentId}/content?group=${encodeURIComponent(group)}`,
        ),
        get(`/api/workbench/${documentId}/overview`),
      ]);
      const saved = await get(
        `/api/workbench/${documentId}/session?group=${encodeURIComponent(group)}`,
      );
      if (controller.signal.aborted) return;
      setContent(lesson);
      setTopics(overview);
      setSession(saved);
      if (saved.state.feedback) {
        setAnswer(saved.state.feedback.answer);
        setConfidence(saved.state.feedback.confidence);
      }
    })()
      .catch((e) => {
        if (e.name !== 'AbortError')
          setError(e.message || 'Could not load this lesson.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, group, retry]);
  const items = content ? practiceItems(content) : [];
  const current = items.find(
    (i) => i.id === session?.state.queue[session.state.cursor],
  );
  async function act(action: string) {
    if (!session || sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/workbench/${documentId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group,
          action,
          revision: session.revision,
          answer,
          confidence,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.session) setSession(data.session);
        throw new Error(data.error || 'Could not save your progress.');
      }
      const next = data as LearningSession;
      if (
        next.state.cursor !== session.state.cursor ||
        next.state.phase !== session.state.phase
      ) {
        setAnswer('');
        setConfidence(null);
        setShowHint(false);
        setShowNotes(false);
        requestAnimationFrame(() => heading.current?.focus());
      }
      setSession(next);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your progress. Please retry.',
      );
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function reveal(notes = false) {
    if (
      session?.state.feedback ||
      session?.state.supportUsed ||
      (await act('hint'))
    ) {
      if (notes) setShowNotes((v) => !v);
      else setShowHint(true);
    }
  }
  const state = session?.state;
  const summary = state ? learningSummary(state) : null;
  const topic = topics.find((t) => t.group === group);
  const nextTopic = topics[topics.findIndex((t) => t.group === group) + 1];
  const material = content && (
    <div className="lesson-material">
      <div
        className="lesson-prose"
        dangerouslySetInnerHTML={{ __html: safeStudyHtml(content.brief_html) }}
      />
      {content.study_mode === 'engineers' &&
        content.engineering_problems[0] && (
          <section className="lesson-example">
            <h3>Follow a worked example</h3>
            <p>{content.engineering_problems[0].problem}</p>
            <ol>
              {content.engineering_problems[0].solutionSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p>
              <strong>Result:</strong> {content.engineering_problems[0].answer}{' '}
              {content.engineering_problems[0].unit}
            </p>
            <p>Before moving on, explain why each step is needed.</p>
          </section>
        )}
      {content.glossary.length > 0 && (
        <details className="lesson-glossary">
          <summary>Key terms ({content.glossary.length})</summary>
          <dl>
            {content.glossary.map((entry, i) => (
              <div key={i}>
                <dt>{entry.term}</dt>
                <dd>
                  {entry.definition}
                  {entry.context && <p>{entry.context}</p>}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
  return (
    <main className="workbench-page lesson-page">
      <Link className="back-link" href={`/workbench/${documentId}`}>
        ← All topics
      </Link>
      <header className="workbench-heading">
        <div>
          <h1>{group}</h1>
          <p>
            {topic?.nodeLabels.join(' · ') ||
              'A focused learning session, built from your document.'}
          </p>
        </div>
        <span>
          {content?.study_mode === 'nursing'
            ? 'Clinical reasoning'
            : 'Concepts & problem solving'}
        </span>
      </header>
      {loading ? (
        <section className="workbench-loading" role="status">
          <span className="loading-spinner" />
          <div>
            <h2>Preparing your learning session.</h2>
            <p>
              Building explanations and practice from your source. New topics
              can take a minute; saved lessons open faster.
            </p>
          </div>
        </section>
      ) : !content || !session ? (
        <section className="inline-error" role="alert">
          <p>{error || 'This lesson is unavailable.'}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setLoading(true);
              setError('');
              setRetry((n) => n + 1);
            }}
          >
            Try again
          </button>{' '}
          <Link href={`/workbench/${documentId}`}>Choose another topic</Link>
        </section>
      ) : (
        <div className="lesson-layout">
          <aside className="lesson-sidebar">
            <h2>Your session</h2>
            <ol className="lesson-steps">
              {['Understand', 'Recall', 'Apply', 'Reflect & revisit'].map(
                (label, i) => {
                  const active =
                    state?.phase === 'learn'
                      ? 0
                      : state?.phase === 'complete'
                        ? 3
                        : current?.phase === 'apply'
                          ? 2
                          : 1;
                  return (
                    <li
                      key={label}
                      aria-current={active === i ? 'step' : undefined}
                      className={
                        i === active ? 'is-active' : i < active ? 'is-done' : ''
                      }
                    >
                      <span>{i + 1}</span>
                      {label}
                    </li>
                  );
                },
              )}
            </ol>
            <p>
              Try from memory before opening a hint. Needing help is a useful
              signal for your next review.
            </p>
            <Link href={`/graph/${documentId}`}>See the concept map</Link>
            <div className="lesson-save-status" role="status">
              {busy ? 'Saving your progress…' : 'Progress saved automatically'}
            </div>
          </aside>
          <section className="lesson-main" aria-busy={busy}>
            {error && (
              <div className="inline-error" role="alert">
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setLoading(true);
                    setError('');
                    setRetry((n) => n + 1);
                  }}
                >
                  Reload saved progress
                </button>
              </div>
            )}
            {state?.phase === 'learn' && (
              <>
                <h2 ref={heading} tabIndex={-1}>
                  Start with the idea.
                </h2>
                <p className="lesson-intro">
                  Read for the mechanism: what happens, why it happens, and when
                  it would fail. Then close the explanation and try it yourself.
                </p>
                {material}
                <div className="lesson-actions">
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => act('start')}
                  >
                    Close notes & practice
                  </button>
                  <span>{items.length} questions · hints available</span>
                </div>
              </>
            )}
            {state?.phase === 'practice' && current && (
              <>
                <div className="lesson-question-meta">
                  <span>
                    {current.phase === 'recall'
                      ? 'Recall from memory'
                      : 'Apply the idea'}
                    {(state.attempts[current.id]?.length ?? 0) >
                    (state.feedback ? 1 : 0)
                      ? ' · Try it again'
                      : ''}
                  </span>
                  <span>
                    {state.cursor + 1} / {state.queue.length} attempts
                  </span>
                </div>
                <h2
                  ref={heading}
                  tabIndex={-1}
                  className="lesson-question"
                  dangerouslySetInnerHTML={{
                    __html: safeStudyHtml(current.prompt),
                  }}
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('answer');
                  }}
                >
                  {current.kind === 'choice' ? (
                    <fieldset
                      className="lesson-choices"
                      disabled={busy || !!state.feedback}
                    >
                      <legend>Choose the best answer</legend>
                      {current.choices?.map((choice, i) => (
                        <label
                          key={i}
                          className={answer === String(i) ? 'is-selected' : ''}
                        >
                          <input
                            type="radio"
                            name="practice-answer"
                            value={i}
                            checked={answer === String(i)}
                            onChange={() => setAnswer(String(i))}
                          />
                          <span>{choice}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <div className="lesson-answer">
                      <label htmlFor="practice-answer">
                        {current.kind === 'numeric'
                          ? `Your result${current.unit ? ` (${current.unit})` : ''}`
                          : 'Your answer'}
                      </label>
                      {current.kind === 'numeric' ||
                      current.kind === 'blank' ? (
                        <input
                          id="practice-answer"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          maxLength={6000}
                          disabled={busy || !!state.feedback}
                          inputMode={
                            current.kind === 'numeric' ? 'decimal' : 'text'
                          }
                          autoComplete="off"
                        />
                      ) : (
                        <textarea
                          id="practice-answer"
                          rows={5}
                          placeholder="Explain the idea in your own words…"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          maxLength={6000}
                          disabled={busy || !!state.feedback}
                        />
                      )}
                    </div>
                  )}
                  {!state.feedback && (
                    <>
                      <fieldset className="lesson-confidence" disabled={busy}>
                        <legend>How sure are you?</legend>
                        {(['unsure', 'fairly-sure', 'certain'] as const).map(
                          (value) => (
                            <label
                              key={value}
                              className={
                                confidence === value ? 'is-selected' : ''
                              }
                            >
                              <input
                                type="radio"
                                name="confidence"
                                checked={confidence === value}
                                onChange={() => setConfidence(value)}
                              />
                              {value === 'unsure'
                                ? 'Not sure'
                                : value === 'fairly-sure'
                                  ? 'Fairly sure'
                                  : 'Very sure'}
                            </label>
                          ),
                        )}
                      </fieldset>
                      <div className="lesson-actions">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={busy || !answer.trim() || !confidence}
                        >
                          {busy ? 'Checking & saving…' : 'Check my reasoning'}
                        </button>
                        {current.hints.length > 0 && !showHint && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => reveal()}
                          >
                            Give me a hint
                          </button>
                        )}
                        <button
                          type="button"
                          className="lesson-text-button"
                          disabled={busy}
                          onClick={() => reveal(true)}
                        >
                          {showNotes
                            ? 'Close explanation'
                            : 'Reopen explanation'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
                {showHint && !state.feedback && (
                  <aside className="lesson-hint">
                    <strong>A nudge</strong>
                    <p>{current.hints[0]}</p>
                    <small>
                      This is assisted practice. You’ll see this question again.
                    </small>
                  </aside>
                )}
                {showNotes && !state.feedback && (
                  <aside className="lesson-reference">
                    <h3>Review the explanation</h3>
                    <p>
                      Close this before answering. This attempt will be recorded
                      as assisted.
                    </p>
                    {material}
                  </aside>
                )}
                {state.feedback && (
                  <div
                    className={`lesson-feedback ${state.feedback.correct ? 'is-correct' : 'needs-practice'}`}
                    role="status"
                  >
                    <h3>
                      {state.feedback.correct
                        ? state.feedback.assisted
                          ? 'Correct with support.'
                          : 'Good reasoning.'
                        : 'An idea to strengthen.'}
                    </h3>
                    <p>{state.feedback.feedback}</p>
                    {!state.feedback.correct &&
                      state.feedback.confidence === 'certain' && (
                        <p className="lesson-calibration">
                          You felt very sure about this one. Notice the
                          difference between your reasoning and the explanation.
                        </p>
                      )}
                    <div className="lesson-model-answer">
                      <h4>
                        {current.kind === 'numeric'
                          ? 'Result & worked solution'
                          : 'Compare with the explanation'}
                      </h4>
                      <p>{current.ideal}</p>
                    </div>
                    {(!state.feedback.correct || state.feedback.assisted) &&
                      (state.attempts[current.id]?.length ?? 0) < 2 && (
                        <p>
                          Try this again after a few other questions, with the
                          explanation closed.
                        </p>
                      )}
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => act('next')}
                    >
                      {state.cursor === state.queue.length - 1
                        ? 'Reflect on this session'
                        : 'Next question'}
                    </button>
                  </div>
                )}
              </>
            )}
            {state?.phase === 'complete' && summary && (
              <section className="lesson-reflection">
                <h2 ref={heading} tabIndex={-1}>
                  A little clearer than before.
                </h2>
                <p className="lesson-intro">
                  You finished a practice session on {group}. Coming back later
                  is how you check what stayed with you.
                </p>
                <dl className="lesson-results">
                  <div>
                    <dt>Independent first answers</dt>
                    <dd>
                      {summary.independent} / {summary.total}
                    </dd>
                  </div>
                  <div>
                    <dt>Still need another attempt</dt>
                    <dd>{summary.needsReview.length}</dd>
                  </div>
                </dl>
                {summary.needsReview.length > 0 && (
                  <>
                    <h3>Give these another look</h3>
                    <ul>
                      {summary.needsReview.map((id) => (
                        <li key={id}>
                          {items
                            .find((i) => i.id === id)
                            ?.prompt.replace(/<[^>]*>/g, '')}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {summary.overconfident > 0 && (
                  <p>
                    {summary.overconfident}{' '}
                    {summary.overconfident === 1
                      ? 'answer felt'
                      : 'answers felt'}{' '}
                    certain but needed a correction. Use that as a cue to check
                    your reasoning next time.
                  </p>
                )}
                <div className="lesson-review-plan">
                  <h3>Your next review</h3>
                  <p>
                    {session.next_review_at
                      ? new Date(session.next_review_at).toLocaleString(
                          undefined,
                          {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          },
                        )
                      : 'Return later for another attempt from memory.'}
                  </p>
                  <small>
                    {session.interval_days
                      ? 'A longer gap after a strong independent session.'
                      : 'A short revisit because some answers needed support or correction.'}{' '}
                    The schedule is a practice guide, not a mastery score.
                  </small>
                </div>
                <div className="lesson-actions">
                  <Link
                    className="primary-button"
                    href={
                      nextTopic
                        ? `/workbench/${documentId}/${encodeURIComponent(nextTopic.group)}`
                        : `/workbench/${documentId}`
                    }
                    prefetch={false}
                  >
                    {nextTopic
                      ? 'Learn the next topic'
                      : 'Back to learning path'}
                  </Link>
                  <button
                    className="secondary-button"
                    onClick={() => act('restart')}
                    disabled={busy}
                  >
                    Practice this topic again
                  </button>
                </div>
              </section>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
