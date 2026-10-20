'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PracticeTabs from '@/components/PracticeTabs';
import type { WorkbenchGroupStatus } from '@/types';
import { learningSummary } from '@/lib/workbench-learning';

export default function WorkbenchHub() {
  const { documentId } = useParams<{ documentId: string }>();
  const [groups, setGroups] = useState<WorkbenchGroupStatus[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workbench/${documentId}/overview`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGroups(data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setError('Could not load your topics. Try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, retry]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const inProgress = groups.find(
    (g) => g.session && g.session.state.phase !== 'complete',
  );
  const due = groups.filter(
    (g) =>
      g.session?.state.phase === 'complete' &&
      g.session.next_review_at &&
      new Date(g.session.next_review_at).getTime() <= now,
  );
  const recommended =
    inProgress ?? due[0] ?? groups.find((g) => !g.session) ?? groups[0];
  const total = groups.reduce((sum, g) => sum + g.nodeIds.length, 0);
  const link = (g: WorkbenchGroupStatus) =>
    `/workbench/${documentId}/${encodeURIComponent(g.group)}`;
  return (
    <main className="workbench-page">
      <PracticeTabs documentId={documentId} />
      <header className="workbench-heading">
        <div>
          <h1>Make it click.</h1>
          <p>
            Understand the idea. Retrieve it from memory. Use it in a new
            situation.
          </p>
        </div>
        <span>
          {groups.length} topics · {total} concepts
        </span>
      </header>
      {loading ? (
        <div className="workbench-loading" role="status">
          <span className="loading-spinner" /> Loading your learning path…
        </div>
      ) : error ? (
        <div className="inline-error" role="alert">
          {error}{' '}
          <button
            className="secondary-button"
            onClick={() => {
              setLoading(true);
              setError('');
              setRetry((r) => r + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {recommended && (
            <section className="workbench-next">
              <div>
                <h2>
                  {inProgress
                    ? 'Pick up where you left off.'
                    : due.length
                      ? 'Bring it back to mind.'
                      : 'Your next learning session.'}
                </h2>
                <p>
                  {inProgress
                    ? 'Your answers and position are saved.'
                    : due.length
                      ? `${due.length} ${due.length === 1 ? 'topic is' : 'topics are'} ready for another attempt from memory.`
                      : 'Start with a focused topic, then let practice show you what needs attention.'}
                </p>
                <strong>{recommended.group}</strong>
              </div>
              <Link
                className="primary-button"
                href={link(recommended)}
                prefetch={false}
              >
                {inProgress
                  ? 'Continue session'
                  : due.length
                    ? 'Review this topic'
                    : recommended.session
                      ? 'Practice again'
                      : 'Start learning'}{' '}
                <span aria-hidden>↗</span>
              </Link>
            </section>
          )}
          <section className="workbench-path" aria-labelledby="topics-title">
            <div className="workbench-section-heading">
              <h2 id="topics-title">Your learning path</h2>
              <span>One topic at a time. Progress comes from practice.</span>
            </div>
            {groups.map((g, i) => {
              const s = g.session;
              const summary = s ? learningSummary(s.state) : null;
              const isDue = due.includes(g);
              return (
                <Link
                  className="workbench-topic"
                  href={link(g)}
                  key={g.group}
                  prefetch={false}
                >
                  <span className="workbench-topic-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{g.group}</h3>
                    <p>{g.nodeLabels.join(' · ')}</p>
                  </div>
                  <div className="workbench-topic-state">
                    <strong>
                      {!s
                        ? 'Not started'
                        : s.state.phase !== 'complete'
                          ? 'In progress'
                          : isDue
                            ? 'Review due'
                            : 'Session complete'}
                    </strong>
                    <span>
                      {!s
                        ? `${g.nodeIds.length} concepts`
                        : s.state.phase !== 'complete'
                          ? `${s.state.cursor} practice steps saved`
                          : summary
                            ? `${summary.independent}/${summary.total} independent first answers`
                            : ''}
                    </span>
                    {s?.state.phase === 'complete' &&
                      s.next_review_at &&
                      !isDue && (
                        <small>
                          Review{' '}
                          {new Date(s.next_review_at).toLocaleDateString(
                            undefined,
                            { month: 'short', day: 'numeric' },
                          )}
                        </small>
                      )}
                  </div>
                  <span aria-hidden>↗</span>
                </Link>
              );
            })}
            {!groups.length && (
              <p className="empty-message">
                No topics are available yet. Open the concept map to check this
                document’s concepts.
              </p>
            )}
          </section>
          <aside className="workbench-method">
            <h2>A session is a starting point.</h2>
            <p>
              Try before revealing. Use hints when you need them. Missed and
              assisted answers return later in the session, and topics come back
              for spaced review. Finishing a session is practice—not a claim of
              lasting mastery.
            </p>
            <Link href={`/flashcards/${documentId}`}>
              Use flashcards between sessions ↗
            </Link>
          </aside>
        </>
      )}
    </main>
  );
}
