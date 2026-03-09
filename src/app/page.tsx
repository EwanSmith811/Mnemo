"use client";

import { useState, useEffect } from "react";
import UploadForm from "@/components/UploadForm";
import DocumentList from "@/components/DocumentList";
import type { Document } from "@/types";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="min-h-screen px-6 py-12">
      {/* Hero section */}
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center animate-fade-in-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-zinc-400 glow-purple">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            AI-Powered Study Tools
          </div>
          <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="gradient-text">Mnemo</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400 sm:text-xl">
            Upload any document. Get flashcards, quizzes, summaries, and
            concept maps — all generated instantly by AI.
          </p>
          <div className="mx-auto mt-6 glow-line w-48" />
        </div>

        {/* Upload section */}
        <div className="mx-auto max-w-2xl mb-16 animate-fade-in-up delay-200" style={{ opacity: 0 }}>
          <UploadForm onUploadComplete={fetchDocuments} />
        </div>

        {/* Documents section */}
        <div className="animate-fade-in-up delay-300" style={{ opacity: 0 }}>
          <div className="mb-6 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-zinc-200">Your Documents</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <DocumentList documents={documents} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
