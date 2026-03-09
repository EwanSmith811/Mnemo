"use client";

import Link from "next/link";
import type { Document } from "@/types";

interface DocumentListProps {
  documents: Document[];
  isLoading: boolean;
}

export default function DocumentList({
  documents,
  isLoading,
}: DocumentListProps) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-zinc-500">
        <div className="relative mx-auto mb-4 h-8 w-8">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-400" />
        </div>
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl glass py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
          <svg className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-zinc-500">No documents yet. Upload a PDF or PowerPoint to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <Link
          key={doc.id}
          href={doc.status === "completed" ? `/documents/${doc.id}` : "#"}
          className={`group block rounded-2xl glass p-5 transition-all duration-300 ${
            doc.status === "completed"
              ? "glass-hover hover-glow-blue"
              : "pointer-events-none opacity-50"
          }`}
        >
          <div className="mb-3 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10">
              <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <StatusBadge status={doc.status} />
          </div>

          <h3 className="mb-1 truncate font-medium text-zinc-200 transition-colors group-hover:text-white">
            {doc.filename}
          </h3>
          <p className="mb-3 text-xs text-zinc-500">
            {doc.file_type.toUpperCase()} &middot;{" "}
            {new Date(doc.created_at).toLocaleDateString()}
          </p>

          {doc.status === "completed" && (
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="rounded-full bg-white/5 px-2 py-0.5">{doc.flashcard_count} cards</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5">{doc.quiz_question_count} questions</span>
            </div>
          )}

          {doc.status === "failed" && doc.error_message && (
            <p className="mt-2 text-xs text-red-400">{doc.error_message}</p>
          )}
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Document["status"] }) {
  const styles = {
    processing: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    failed: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status === "processing" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
