"use client";

import { useState, useRef } from "react";
import type { TopicSummary } from "@/types";

export default function TopicSummaryDialog({
  documentId,
}: {
  documentId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const openDialog = async () => {
    dialogRef.current?.showModal();
    if (!hasFetched) {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/summaries/${documentId}`);
        const data = await res.json();
        setSummaries(Array.isArray(data) ? data : []);
      } catch {
        setSummaries([]);
      } finally {
        setIsLoading(false);
        setHasFetched(true);
      }
    }
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm font-medium transition-all glass-hover hover-glow-green"
      >
        <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-zinc-300">Topic Summaries</span>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-3xl rounded-2xl glass-strong p-0 shadow-xl text-zinc-100"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <div className="flex h-[70vh] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-100">Topic Summaries</h2>
            <button
              onClick={closeDialog}
              className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
              <div className="text-center">
                <div className="relative mx-auto mb-3 h-8 w-8">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-400" />
                </div>
                Loading summaries...
              </div>
            </div>
          ) : summaries.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
              No topic summaries available.
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Topic list */}
              <div className="w-48 shrink-0 overflow-y-auto border-r border-white/5">
                {summaries.map((s, index) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedIndex(index)}
                    className={`block w-full px-4 py-3 text-left text-sm transition-all ${
                      index === selectedIndex
                        ? "bg-emerald-500/10 font-medium text-emerald-400"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                    }`}
                  >
                    {s.topic_name}
                  </button>
                ))}
              </div>

              {/* Summary content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <h3 className="mb-3 text-lg font-semibold text-zinc-100">
                  {summaries[selectedIndex].topic_name}
                </h3>
                <div className="space-y-3 text-sm leading-relaxed text-zinc-400">
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
      </dialog>
    </>
  );
}
