"use client";

import { useState } from "react";
import type { QuizQuestion, QuestionType, QuizAnswer } from "@/types";
import ScoreDisplay from "./ScoreDisplay";

interface QuizPlayerProps {
  questions: QuizQuestion[];
  documentId: string;
  onQuizComplete?: (score: {
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    answers: QuizAnswer[];
  }, questions: QuizQuestion[]) => void;
}

interface UserAnswer {
  question_id: string;
  question_type: QuestionType;
  selected_answer: number;
  selected_answers: number[];
  typed_answer: string;
}

export default function QuizPlayer({
  questions,
  documentId,
  onQuizComplete,
}: QuizPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<number>>(
    new Set()
  );
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState<{
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    answers: QuizAnswer[];
  } | null>(null);

  if (questions.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500">
        No quiz questions available.
      </div>
    );
  }

  if (quizComplete && score) {
    // If parent wants to handle the results screen, hand off control
    if (onQuizComplete) return null;
    return <ScoreDisplay score={score} questions={questions} />;
  }

  const question = questions[currentIndex];
  const questionType = question.question_type || "mcq";
  const choiceLabels = ["A", "B", "C", "D"];

  const isCurrentCorrect = (): boolean => {
    switch (questionType) {
      case "mcq":
        return selectedAnswer === question.correct_answer;
      case "multiple_select": {
        const correctSet = new Set(question.correct_answers || []);
        return (
          correctSet.size === selectedAnswers.size &&
          [...correctSet].every((v) => selectedAnswers.has(v))
        );
      }
      case "short_answer":
        return (
          typedAnswer.trim().toLowerCase() ===
          (question.correct_answer_text || "").trim().toLowerCase()
        );
      default:
        return false;
    }
  };

  const handleMCQSelect = (choiceIndex: number) => {
    if (showResult) return;
    setSelectedAnswer(choiceIndex);
    setShowResult(true);
  };

  const handleMultiSelectToggle = (choiceIndex: number) => {
    if (showResult) return;
    setSelectedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(choiceIndex)) {
        next.delete(choiceIndex);
      } else {
        next.add(choiceIndex);
      }
      return next;
    });
  };

  const handleSubmitAnswer = () => {
    setShowResult(true);
  };

  const buildCurrentAnswer = (): UserAnswer => ({
    question_id: question.id,
    question_type: questionType,
    selected_answer: selectedAnswer ?? -1,
    selected_answers: [...selectedAnswers],
    typed_answer: typedAnswer,
  });

  const handleNext = async () => {
    const currentAnswer = buildCurrentAnswer();
    const newAnswers = [...userAnswers, currentAnswer];
    setUserAnswers(newAnswers);

    if (currentIndex === questions.length - 1) {
      try {
        const res = await fetch(`/api/quiz/${documentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: newAnswers }),
        });
        const data = await res.json();
        setScore(data);
        setQuizComplete(true);
        onQuizComplete?.(data, questions);
      } catch {
        const graded = newAnswers.map((a) => ({
          ...a,
          is_correct: false,
        }));
        setScore({
          total_questions: questions.length,
          correct_answers: 0,
          score_percentage: 0,
          answers: graded,
        });
        setQuizComplete(true);
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setSelectedAnswers(new Set());
      setTypedAnswer("");
      setShowResult(false);
    }
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-zinc-500">
          <span>
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span>
            {Math.round((currentIndex / questions.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
            style={{
              width: `${(currentIndex / questions.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Question type badge */}
      <div className="mb-3">
        <span className="inline-block rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-400 border border-white/10">
          {questionType === "mcq" && "Multiple Choice"}
          {questionType === "multiple_select" && "Select All That Apply"}
          {questionType === "short_answer" && "Short Answer"}
        </span>
      </div>

      {/* Question */}
      <h2 className="mb-6 text-lg font-semibold text-zinc-100">{question.question}</h2>

      {/* MCQ choices */}
      {questionType === "mcq" && (
        <div className="space-y-3">
          {question.choices.map((choice, i) => {
            let style = "glass glass-hover";
            if (showResult) {
              if (i === question.correct_answer) {
                style = "border-emerald-500/40 bg-emerald-500/10 glow-green";
              } else if (
                i === selectedAnswer &&
                i !== question.correct_answer
              ) {
                style = "border-red-500/40 bg-red-500/10";
              } else {
                style = "glass opacity-40";
              }
            } else if (i === selectedAnswer) {
              style = "border-purple-500/40 bg-purple-500/10 glow-purple";
            }

            return (
              <button
                key={i}
                onClick={() => handleMCQSelect(i)}
                disabled={showResult}
                className={`flex w-full items-center gap-3 rounded-xl p-4 text-left transition-all ${style}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-medium text-zinc-400">
                  {choiceLabels[i]}
                </span>
                <span className="text-zinc-200">{choice}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Multiple select choices */}
      {questionType === "multiple_select" && (
        <>
          <div className="space-y-3">
            {question.choices.map((choice, i) => {
              const isSelected = selectedAnswers.has(i);
              const correctSet = new Set(question.correct_answers || []);

              let style = "glass glass-hover";
              if (showResult) {
                if (correctSet.has(i)) {
                  style = "border-emerald-500/40 bg-emerald-500/10 glow-green";
                } else if (isSelected && !correctSet.has(i)) {
                  style = "border-red-500/40 bg-red-500/10";
                } else {
                  style = "glass opacity-40";
                }
              } else if (isSelected) {
                style = "border-purple-500/40 bg-purple-500/10 glow-purple";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleMultiSelectToggle(i)}
                  disabled={showResult}
                  className={`flex w-full items-center gap-3 rounded-xl p-4 text-left transition-all ${style}`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      isSelected
                        ? "border-purple-500 bg-purple-500 text-white"
                        : "border-zinc-600"
                    }`}
                  >
                    {isSelected && "\u2713"}
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-medium text-zinc-400">
                    {choiceLabels[i]}
                  </span>
                  <span className="text-zinc-200">{choice}</span>
                </button>
              );
            })}
          </div>
          {!showResult && (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedAnswers.size === 0}
              className="mt-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50"
            >
              Submit Answer
            </button>
          )}
        </>
      )}

      {/* Short answer input */}
      {questionType === "short_answer" && (
        <>
          <div className="mb-4">
            <input
              type="text"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              disabled={showResult}
              placeholder="Type your answer..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && typedAnswer.trim() && !showResult) {
                  handleSubmitAnswer();
                }
              }}
              className="w-full rounded-xl glass px-4 py-3 text-base text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-purple-500/40 focus:glow-purple disabled:opacity-60"
            />
          </div>
          {!showResult && (
            <button
              onClick={handleSubmitAnswer}
              disabled={!typedAnswer.trim()}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50"
            >
              Submit Answer
            </button>
          )}
        </>
      )}

      {/* Result feedback */}
      {showResult && (
        <div className="mt-6 animate-fade-in">
          {isCurrentCorrect() ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-emerald-400">
              Correct!
            </div>
          ) : (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400">
              {questionType === "mcq" && (
                <>
                  Incorrect. The correct answer is{" "}
                  {choiceLabels[question.correct_answer]}:{" "}
                  {question.choices[question.correct_answer]}
                </>
              )}
              {questionType === "multiple_select" && (
                <>
                  Incorrect. The correct answers are:{" "}
                  {(question.correct_answers || [])
                    .map((i) => `${choiceLabels[i]}: ${question.choices[i]}`)
                    .join(", ")}
                </>
              )}
              {questionType === "short_answer" && (
                <>
                  Incorrect. The correct answer is:{" "}
                  {question.correct_answer_text}
                </>
              )}
            </div>
          )}

          {question.explanation && (
            <p className="mt-3 text-sm text-zinc-500">
              {question.explanation}
            </p>
          )}

          <button
            onClick={handleNext}
            className="mt-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
          >
            {currentIndex === questions.length - 1
              ? "See Results"
              : "Next Question"}
          </button>
        </div>
      )}
    </div>
  );
}
