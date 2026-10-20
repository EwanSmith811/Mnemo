'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import FlashcardViewer from '@/components/FlashcardViewer';
import { AddDialog, GenerateDialog } from '@/components/StudyDialogs';
import { BackLink, PageLoading } from '@/components/ui';
import type { Flashcard, ReviewRating } from '@/types';

const LIMIT = 100;
const byDue = (cards: Flashcard[]) =>
  [...cards].sort(
    (a, b) =>
      new Date(a.next_review_date).getTime() -
      new Date(b.next_review_date).getTime(),
  );
function until(date: Date, now: number) {
  const ms = date.getTime() - now;
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export default function FlashcardsPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<Flashcard[] | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/flashcards/${documentId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || 'Could not load flashcards.');
        setCards(byDue(Array.isArray(data) ? data : []));
      })
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError('Could not load your flashcards. Reload to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const due = useMemo(
    () => cards.filter((c) => new Date(c.next_review_date).getTime() <= now),
    [cards, now],
  );
  const fresh = cards.filter((c) => !c.last_reviewed_at).length;
  const nextDue = cards.find(
    (c) => new Date(c.next_review_date).getTime() > now,
  );
  const slots = Math.max(0, LIMIT - cards.length);

  async function review(id: string, rating: ReviewRating) {
    const res = await fetch(`/api/flashcards-review/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) throw new Error('Could not save this review.');
    const updated: Flashcard = await res.json();
    setCards((list) => byDue(list.map((c) => (c.id === id ? updated : c))));
    return updated;
  }
  function start(list: Flashcard[]) {
    setSession(list);
    setSessionKey((k) => k + 1);
  }
  async function generate(count: number) {
    const res = await fetch(`/api/flashcards/${documentId}/more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Could not generate flashcards.');
    const added: Flashcard[] = Array.isArray(data.flashcards)
      ? data.flashcards
      : [];
    if (!added.length)
      throw new Error('No new, distinct cards could be found in this deck.');
    setCards((list) => byDue([...list, ...added]));
  }

  if (loading) return <PageLoading label="Shuffling your cards" />;
  return (
    <main className="page is-reading">
      <BackLink href={`/documents/${documentId}`}>Study plan</BackLink>
      {session ? (
        <FlashcardViewer
          key={sessionKey}
          cards={session}
          onReview={review}
          onDone={() => setSession(null)}
        />
      ) : (
        <>
          <header className="page-head">
            <div>
              <span className="eyebrow rise">
                <b>02</b> Flashcards
              </span>
              <h1 className="rise">
                Recall it, <em>then</em> flip.
              </h1>
              <p className="lede">
                Cards come back on a spaced schedule, right before you’d forget
                them. Missed cards return later in the same session.
              </p>
            </div>
            <div className="page-head-actions">
              <GenerateDialog
                label="Generate more"
                noun="cards"
                description="Mnemo will look for terms and ideas in this deck that don’t have a card yet."
                max={Math.min(10, slots)}
                onGenerate={generate}
              />
              <AddDialog<Flashcard>
                label="Add card"
                title="Add your own card"
                description="Write it in your own words; that alone helps it stick."
                endpoint={`/api/flashcards/${documentId}`}
                disabled={!slots}
                fields={[
                  {
                    name: 'term',
                    label: 'Term',
                    placeholder: 'e.g. Preload',
                    maxLength: 500,
                  },
                  {
                    name: 'definition',
                    label: 'Definition',
                    placeholder: 'What it means, in a sentence or two',
                    multiline: true,
                    maxLength: 20000,
                  },
                ]}
                onAdd={(card) => setCards((list) => byDue([...list, card]))}
              />
            </div>
          </header>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!cards.length ? (
            <div className="empty-state">
              <h2>No cards yet.</h2>
              <p>Generate a batch from the deck, or write your own.</p>
            </div>
          ) : (
            <section className="cards-start">
              <div className="cards-start-main">
                <div className="cards-stack" aria-hidden>
                  {[2, 1, 0].map((i) => (
                    <span key={i} style={{ '--n': i } as CSSProperties}>
                      {i === 0 && (due[0] ?? cards[0]).term}
                    </span>
                  ))}
                </div>
                <div className="cards-start-copy">
                  {due.length ? (
                    <>
                      <h2 className="display">
                        <span className="mono">{due.length}</span>{' '}
                        {due.length === 1 ? 'card is' : 'cards are'}{' '}
                        <em>due.</em>
                      </h2>
                      <p>
                        {fresh
                          ? `${fresh} of them ${fresh === 1 ? 'is' : 'are'} new. `
                          : ''}
                        About {Math.max(1, Math.round(due.length * 0.15))} min.
                      </p>
                      <button
                        className="primary-button is-large"
                        onClick={() => start(due)}
                      >
                        Start review <span className="arrow">→</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <h2 className="display">
                        All caught <em>up.</em>
                      </h2>
                      <p>
                        {nextDue
                          ? `Next card is due in ${until(new Date(nextDue.next_review_date), now)}. Reviewing early gives your memory less to work against.`
                          : 'Nothing is scheduled.'}
                      </p>
                      <button
                        className="secondary-button is-large"
                        onClick={() => start(cards)}
                      >
                        Practise all {cards.length} anyway
                      </button>
                    </>
                  )}
                </div>
              </div>
              <dl className="cards-stats">
                <div>
                  <dt>Due now</dt>
                  <dd>{due.length}</dd>
                </div>
                <div>
                  <dt>New</dt>
                  <dd>{fresh}</dd>
                </div>
                <div>
                  <dt>In deck</dt>
                  <dd>{cards.length}</dd>
                </div>
                <div>
                  <dt>Free slots</dt>
                  <dd>{slots}</dd>
                </div>
              </dl>
            </section>
          )}
          {cards.length > 0 && (
            <section className="cards-list">
              <button
                className="text-button"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Hide' : 'Browse'} all {cards.length} cards
              </button>
              {showAll && (
                <ul>
                  {cards.map((c) => (
                    <li key={c.id}>
                      <strong>{c.term}</strong>
                      <p>{c.definition}</p>
                      <span className="mono">
                        {new Date(c.next_review_date).getTime() <= now
                          ? 'Due'
                          : `In ${until(new Date(c.next_review_date), now)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
