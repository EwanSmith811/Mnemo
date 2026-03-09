"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Document, Flashcard } from "@/types";

const featureCards = [
  {
    key: "flashcards",
    href: (id: string) => `/flashcards/${id}`,
    title: "Study Flashcards",
    desc: "Review with spaced repetition",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    gradient: "from-blue-500/20 to-cyan-500/20",
    glowClass: "hover-glow-blue",
    glassClass: "glass-blue",
    iconColor: "text-blue-400",
    accentColor: "text-blue-400",
    glowLineClass: "glow-line-blue",
  },
  {
    key: "summaries",
    href: (id: string) => `/summaries/${id}`,
    title: "Topic Summaries",
    desc: "Key concepts explained simply",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    gradient: "from-emerald-500/20 to-green-500/20",
    glowClass: "hover-glow-emerald",
    glassClass: "glass-emerald",
    iconColor: "text-emerald-400",
    accentColor: "text-emerald-400",
    glowLineClass: "glow-line-emerald",
  },
  {
    key: "quiz",
    href: (id: string) => `/quiz/${id}`,
    title: "Take Quiz",
    desc: "MCQ, multiple select, short answer",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    gradient: "from-purple-500/20 to-pink-500/20",
    glowClass: "hover-glow-purple",
    glassClass: "glass-purple",
    iconColor: "text-purple-400",
    accentColor: "text-purple-400",
    glowLineClass: "glow-line-purple",
  },
  {
    key: "graph",
    href: (id: string) => `/graph/${id}`,
    title: "Concept Graph",
    desc: "Visual concept map with relationships",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    gradient: "from-amber-500/20 to-orange-500/20",
    glowClass: "hover-glow-amber",
    glassClass: "glass-amber",
    iconColor: "text-amber-400",
    accentColor: "text-amber-400",
    glowLineClass: "glow-line-amber",
  },
  {
    key: "chat",
    href: (id: string) => `/chat/${id}`,
    title: "Study Chat",
    desc: "AI assistant with your document context",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    gradient: "from-teal-500/20 to-cyan-500/20",
    glowClass: "hover-glow-teal",
    glassClass: "glass-teal",
    iconColor: "text-teal-400",
    accentColor: "text-teal-400",
    glowLineClass: "glow-line-teal",
  },
  {
    key: "workbench",
    href: (id: string) => `/workbench/${id}`,
    title: "Workbench",
    desc: "Deep-dive into individual concepts",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
      </svg>
    ),
    gradient: "from-rose-500/20 to-red-500/20",
    glowClass: "hover-glow-rose",
    glassClass: "glass-rose",
    iconColor: "text-rose-400",
    accentColor: "text-rose-400",
    glowLineClass: "glow-line-rose",
  },
  {
    key: "verbal",
    href: (id: string) => `/verbal/${id}`,
    title: "Verbal Quiz",
    desc: "Voice conversation with AI tutor",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
    gradient: "from-indigo-500/20 to-violet-500/20",
    glowClass: "hover-glow-indigo",
    glassClass: "glass-indigo",
    iconColor: "text-indigo-400",
    accentColor: "text-indigo-400",
    glowLineClass: "glow-line-indigo",
  },
];

export default function DocumentDetail() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const docsRes = await fetch("/api/documents");
        const docs: Document[] = await docsRes.json();
        const found = docs.find((d) => d.id === documentId) || null;
        setDoc(found);

        const cardsRes = await fetch(`/api/flashcards/${documentId}`);
        const cards: Flashcard[] = await cardsRes.json();
        const now = new Date();
        const due = cards.filter(
          (c) => new Date(c.next_review_date) <= now
        ).length;
        setDueCount(due);
      } catch (err) {
        console.error("Failed to load document:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [documentId]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/");
      } else {
        const data = await res.json();
        console.error("Delete failed:", data.error);
        setIsDeleting(false);
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-400" />
          </div>
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-400">Document not found.</p>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Nav */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to documents
        </Link>

        {/* Header */}
        <div className="mb-10 animate-fade-in-up">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold text-zinc-100">{doc.filename}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                <span className="rounded-full glass px-3 py-1">{doc.file_type.toUpperCase()}</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                <span>{doc.flashcard_count} flashcards</span>
                <span>{doc.quiz_question_count} quiz questions</span>
              </div>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="shrink-0 rounded-xl glass px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/30"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mb-8 rounded-2xl glass p-5 border-red-500/20 animate-fade-in">
            <p className="mb-4 text-sm text-red-300">
              Are you sure you want to delete this document? This will permanently
              remove all flashcards, quiz questions, and summaries.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-all hover:bg-red-500/30 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="rounded-xl glass px-4 py-2 text-sm text-zinc-400 transition-all glass-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Feature cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 animate-fade-in-up delay-200" style={{ opacity: 0 }}>
          {featureCards.map((card) => (
            <Link
              key={card.key}
              href={card.href(documentId)}
              className={`group relative overflow-hidden rounded-2xl ${card.glassClass} p-6 transition-all duration-300 glass-hover ${card.glowClass}`}
            >
              {/* Gradient orb in corner */}
              <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${card.gradient} opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-100`} />

              <div className="relative">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} ${card.iconColor}`}>
                  {card.icon}
                </div>
                <h2 className={`mb-1 text-lg font-semibold ${card.accentColor} transition-colors group-hover:brightness-125`}>
                  {card.title}
                </h2>
                <p className="text-sm text-zinc-500">{card.desc}</p>
                <div className={`mt-3 ${card.glowLineClass} w-12 transition-all duration-300 group-hover:w-full`} />

                {/* Extra info per card */}
                {card.key === "flashcards" && (
                  <p className={`mt-3 text-sm font-medium ${dueCount > 0 ? "text-blue-400" : "text-emerald-400"}`}>
                    {dueCount > 0 ? `${dueCount} card${dueCount !== 1 ? "s" : ""} due for review` : "All caught up!"}
                  </p>
                )}
                {card.key === "summaries" && (
                  <p className="mt-3 text-sm font-medium text-emerald-400">
                    {doc.topic_summary_count} topics
                  </p>
                )}
                {card.key === "quiz" && (
                  <p className="mt-3 text-sm font-medium text-purple-400">
                    {doc.quiz_question_count} questions
                  </p>
                )}
                {card.key === "graph" && (
                  <p className="mt-3 text-sm font-medium text-amber-400">
                    {doc.concept_node_count} concepts
                  </p>
                )}
                {card.key === "chat" && (
                  <p className="mt-3 text-sm font-medium text-teal-400">
                    Ask anything
                  </p>
                )}
                {card.key === "workbench" && (
                  <p className="mt-3 text-sm font-medium text-rose-400">
                    {doc.concept_node_count} concepts to explore
                  </p>
                )}
                {card.key === "verbal" && (
                  <p className="mt-3 text-sm font-medium text-indigo-400">
                    Explain or be quizzed
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
