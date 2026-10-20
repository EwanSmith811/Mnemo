'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Markdown from './Markdown';
import { Icon } from './ui';
import type { Document } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updated_at: string;
}
const STARTERS = [
  'What are the three most important ideas in this deck?',
  'Explain the hardest concept as if I’m new to it',
  'What would an exam question on this look like?',
  'Which ideas are easy to confuse, and how do they differ?',
];

function ago(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
const titleFrom = (messages: ChatMessage[]) => {
  const first =
    messages.find((m) => m.role === 'user')?.content ?? 'New conversation';
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
};

export default function DocumentChat() {
  const { documentId } = useParams<{ documentId: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch(`/api/chat/${documentId}/conversations`);
    if (res.ok) setConversations(await res.json());
  }, [documentId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/documents/${documentId}`, { signal: controller.signal })
      .then(async (res) => res.ok && setDoc(await res.json()))
      .catch(() => {});
    fetch(`/api/chat/${documentId}/conversations`, {
      signal: controller.signal,
    })
      .then(async (res) => res.ok && setConversations(await res.json()))
      .catch(() => {});
    return () => controller.abort();
  }, [documentId]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function send(text = input) {
    const content = text.trim();
    if (!content || sending) return;
    const history = [...messages, { role: 'user' as const, content }];
    setMessages(history);
    setInput('');
    setError('');
    setSending(true);
    try {
      const res = await fetch(`/api/chat/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mnemo could not answer.');
      const next = [
        ...history,
        { role: 'assistant' as const, content: data.reply },
      ];
      setMessages(next);
      const saved = await fetch(`/api/chat/${documentId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeId,
          title: titleFrom(next),
          messages: next,
        }),
      });
      if (saved.ok) {
        const { id } = await saved.json();
        setActiveId(id);
        void loadConversations();
      }
    } catch (err) {
      // Keep the failed question out of the history, but give it back to edit.
      setMessages(messages);
      setInput(content);
      setError(err instanceof Error ? err.message : 'Mnemo could not answer.');
    } finally {
      setSending(false);
      field.current?.focus();
    }
  }
  function open(conversation: Conversation | null) {
    setMessages(conversation?.messages ?? []);
    setActiveId(conversation?.id ?? null);
    setError('');
    setListOpen(false);
    field.current?.focus();
  }
  async function remove(id: string) {
    await fetch(`/api/chat/${documentId}/conversations?id=${id}`, {
      method: 'DELETE',
    }).catch(() => {});
    if (activeId === id) open(null);
    void loadConversations();
  }

  return (
    <div className={`chat ${listOpen ? 'list-open' : ''}`}>
      <aside className="chat-list" aria-label="Conversations">
        <div className="chat-list-head">
          <span className="eyebrow">Conversations</span>
          <button
            className="secondary-button is-small"
            onClick={() => open(null)}
          >
            <Icon name="plus" size={14} /> New
          </button>
        </div>
        {conversations.length ? (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  className="chat-list-item"
                  aria-current={c.id === activeId ? 'true' : undefined}
                  onClick={() => open(c)}
                >
                  <strong>{c.title}</strong>
                  <small className="mono">
                    {c.messages.length} msgs · {ago(c.updated_at)}
                  </small>
                </button>
                <button
                  className="icon-button chat-delete"
                  aria-label={`Delete “${c.title}”`}
                  onClick={() => void remove(c.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chat-list-empty">
            Your saved conversations appear here.
          </p>
        )}
        <p className="chat-list-foot mono">{conversations.length}/10 saved</p>
      </aside>
      <button
        className="chat-scrim"
        aria-label="Close conversations"
        tabIndex={listOpen ? 0 : -1}
        onClick={() => setListOpen(false)}
      />

      <section className="chat-main">
        <div className="chat-top">
          <button
            className="secondary-button is-small chat-list-toggle"
            onClick={() => setListOpen(true)}
          >
            <Icon name="menu" size={15} /> History
          </button>
          <span className="eyebrow">
            Grounded in {doc ? doc.filename : 'your deck'}
          </span>
        </div>
        <div className="chat-scroll">
          <div className="chat-thread">
            {!messages.length && (
              <div className="chat-empty">
                <h1 className="display">
                  Ask <em>anything.</em>
                </h1>
                <p className="lede">
                  Answers come from your deck first. When Mnemo goes beyond it,
                  it says so.
                </p>
                <div className="chat-starters">
                  {STARTERS.map((s, i) => (
                    <button
                      key={s}
                      className="card chat-starter rise"
                      style={{ animationDelay: `${i * 60}ms` }}
                      onClick={() => void send(s)}
                    >
                      {s}
                      <span className="arrow" aria-hidden>
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
                <p className="muted chat-tip">
                  Stuck on one slide? The{' '}
                  <Link href={`/learn/${documentId}`}>walkthrough</Link> answers
                  questions with that slide beside you.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-message is-${m.role}`}>
                {m.role === 'assistant' ? (
                  <Markdown content={m.content} />
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            ))}
            {sending && (
              <div
                className="chat-message is-assistant is-typing"
                role="status"
                aria-label="Mnemo is thinking"
              >
                <i />
                <i />
                <i />
              </div>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="slide-composer-box">
            <label htmlFor="chat-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="chat-input"
              ref={field}
              rows={1}
              value={input}
              maxLength={4000}
              placeholder="Ask about your deck…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              className="icon-button slide-send"
              aria-label="Send"
              disabled={!input.trim() || sending}
            >
              <Icon name="send" />
            </button>
          </div>
          <small className="muted">
            AI can be wrong. Check important details against your slides.
          </small>
        </form>
      </section>
    </div>
  );
}
