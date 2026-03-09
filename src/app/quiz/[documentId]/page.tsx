"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QuizPlayer from "@/components/QuizPlayer";
import QuizSettingsPanel from "@/components/QuizSettings";
import ScoreDisplay from "@/components/ScoreDisplay";
import type { QuizQuestion, QuestionType, QuizSettings, QuizAnswer } from "@/types";

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function QuizPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<QuizQuestion[]>([]);
  const [quizKey, setQuizKey] = useState(0);
  const [phase, setPhase] = useState<"loading" | "settings" | "quiz" | "results">("loading");
  const [completedScore, setCompletedScore] = useState<{
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    answers: QuizAnswer[];
  } | null>(null);
  const [completedQuestions, setCompletedQuestions] = useState<QuizQuestion[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/quiz/${documentId}`);
        const data: QuizQuestion[] = await res.json();
        setAllQuestions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load quiz:", err);
        setAllQuestions([]);
      } finally {
        setPhase("settings");
      }
    }
    load();
  }, [documentId]);

  const totalQuestionsByType = useMemo(() => {
    const counts: Record<QuestionType, number> = {
      mcq: 0,
      multiple_select: 0,
      short_answer: 0,
    };
    allQuestions.forEach((q) => {
      const type = q.question_type || "mcq";
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [allQuestions]);

  const handleStartQuiz = (settings: QuizSettings) => {
    const { questionCount, questionTypes } = settings;
    const typeSet = new Set(questionTypes);

    const eligible = allQuestions.filter((q) =>
      typeSet.has(q.question_type || "mcq")
    );
    const shuffled = shuffleArray(eligible);
    const selected = shuffled.slice(0, questionCount);

    setFilteredQuestions(selected);
    setIsExhausted(false);
    setQuizKey((k) => k + 1);
    setPhase("quiz");
  };

  const handleQuizComplete = (
    score: { total_questions: number; correct_answers: number; score_percentage: number; answers: QuizAnswer[] },
    questions: QuizQuestion[]
  ) => {
    setCompletedScore(score);
    setCompletedQuestions(questions);
    setPhase("results");
  };

  const handleAddMore = async () => {
    // Check if already at hard limit
    if (allQuestions.length >= 100) {
      setIsExhausted(true);
      return;
    }

    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/quiz/${documentId}/more`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingQuestions: allQuestions.map((q) => q.question),
          questionCount: 10,
        }),
      });
      const data = await res.json();
      if (data.exhausted || data.limitReached || !data.questions?.length) {
        setIsExhausted(true);
      } else {
        const newQs: QuizQuestion[] = data.questions;
        // Merge into allQuestions so the settings panel shows the updated count
        setAllQuestions((prev) => [...prev, ...newQs]);
        setIsExhausted(false);
      }
    } catch {
      setIsExhausted(true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-400" />
          </div>
          <p className="text-zinc-500">Loading quiz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
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
          <h1 className="text-2xl font-bold gradient-text-purple">Quiz</h1>
          <div className="mt-2 glow-line-purple w-16" />
        </div>

        {phase === "settings" && (
          <div className="animate-fade-in-up delay-100 space-y-4" style={{ opacity: 0 }}>
            <QuizSettingsPanel
              totalQuestionsByType={totalQuestionsByType}
              onStart={handleStartQuiz}
            />
            <div className="rounded-2xl glass p-5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Question pool</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {allQuestions.length} question{allQuestions.length !== 1 ? "s" : ""} total — generate more to expand variety
                  </p>
                </div>
                {!isExhausted ? (
                  <button
                    onClick={handleAddMore}
                    disabled={isLoadingMore}
                    className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.3)] disabled:opacity-50 shrink-0"
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Generating...
                      </span>
                    ) : (
                      "+ Generate more"
                    )}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">
                    {allQuestions.length >= 100 ? "Question limit (100) reached" : "Pool exhausted"}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === "quiz" && (
          <div className="animate-fade-in">
            <QuizPlayer
              key={quizKey}
              questions={filteredQuestions}
              documentId={documentId}
              onQuizComplete={handleQuizComplete}
            />
          </div>
        )}

        {phase === "results" && completedScore && (
          <div className="animate-fade-in-up space-y-4">
            <ScoreDisplay score={completedScore} questions={completedQuestions} />
            <div className="mt-6">
              <button
                onClick={() => setPhase("settings")}
                className="w-full rounded-xl glass px-6 py-3 text-sm font-medium text-zinc-400 transition-all glass-hover"
              >
                Start new quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
