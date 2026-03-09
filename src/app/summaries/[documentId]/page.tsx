"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { TopicSummary } from "@/types";

export default function SummariesPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/summaries/${documentId}`);
        const data = await res.json();
        setSummaries(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load summaries:", err);
        setSummaries([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [documentId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-400" />
          </div>
          <p className="text-zinc-500">Loading summaries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/documents/${documentId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to document
        </Link>

        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-2xl font-bold gradient-text-emerald">Topic Summaries</h1>
          <div className="mt-2 glow-line-emerald w-16" />
        </div>

        {summaries.length === 0 ? (
          <div className="rounded-2xl glass py-16 text-center text-zinc-500">
            No topic summaries available for this document.
          </div>
        ) : (
          <div className="flex gap-6 rounded-2xl glass-emerald overflow-hidden animate-fade-in-up delay-100" style={{ opacity: 0 }}>
            {/* Topic list sidebar */}
            <div className="w-56 shrink-0 border-r border-white/5">
              {summaries.map((s, index) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedIndex(index)}
                  className={`block w-full px-5 py-4 text-left text-sm transition-all ${
                    index === selectedIndex
                      ? "bg-emerald-500/10 font-medium text-emerald-400 border-r-2 border-emerald-400"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                  } ${index !== summaries.length - 1 ? "border-b border-white/5" : ""}`}
                >
                  {s.topic_name}
                </button>
              ))}
            </div>

            {/* Summary content */}
            <div className="flex-1 px-6 py-6">
              <h2 className="mb-4 text-xl font-semibold text-zinc-100">
                {summaries[selectedIndex].topic_name}
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-zinc-400">
                {summaries[selectedIndex].summary
                  .split("\n\n")
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
