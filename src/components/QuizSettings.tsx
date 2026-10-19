'use client';

import { useState } from 'react';
import type { QuestionType, QuizSettings } from '@/types';

interface QuizSettingsProps {
  totalQuestionsByType: Record<QuestionType, number>;
  onStart: (settings: QuizSettings) => void;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  multiple_select: 'Multiple Select',
  short_answer: 'Short Answer',
  nclex: 'NCLEX Style',
  engineering: 'Engineering Workout',
};

export default function QuizSettingsPanel({
  totalQuestionsByType,
  onStart,
}: QuizSettingsProps) {
  const totalAvailable = Object.values(totalQuestionsByType).reduce(
    (a, b) => a + b,
    0,
  );

  const [selectedTypes, setSelectedTypes] = useState<Set<QuestionType>>(
    new Set(
      (Object.keys(totalQuestionsByType) as QuestionType[]).filter(
        (t) => totalQuestionsByType[t] > 0,
      ),
    ),
  );

  const availableForSelected = [...selectedTypes].reduce(
    (sum, t) => sum + (totalQuestionsByType[t] || 0),
    0,
  );

  const maxQuestions = Math.min(20, availableForSelected);
  const [questionCount, setQuestionCount] = useState(
    Math.min(10, maxQuestions),
  );

  const toggleType = (type: QuestionType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const effectiveMax = Math.min(
    20,
    [...selectedTypes].reduce(
      (sum, t) => sum + (totalQuestionsByType[t] || 0),
      0,
    ),
  );
  const effectiveCount = Math.min(questionCount, effectiveMax);

  const handleStart = () => {
    onStart({
      questionCount: effectiveCount,
      questionTypes: [...selectedTypes],
    });
  };

  if (totalAvailable === 0) {
    return (
      <div className="py-12 text-center text-zinc-500">
        No quiz questions available for this document.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl glass p-6 glow-purple">
      <h2 className="mb-6 text-center text-lg font-semibold text-zinc-100">
        Quiz Settings
      </h2>

      {/* Question types */}
      <div className="mb-6">
        <label className="mb-3 block text-sm font-medium text-zinc-400">
          Question Types
        </label>
        <div className="space-y-2">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => {
            const count = totalQuestionsByType[type] || 0;
            if (count === 0) return null;
            return (
              <label
                key={type}
                className={`flex cursor-pointer items-center gap-3 rounded-xl glass px-4 py-3 transition-all ${
                  selectedTypes.has(type)
                    ? 'border-purple-500/30 glow-purple'
                    : 'glass-hover'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.has(type)}
                  onChange={() => toggleType(type)}
                  className="h-4 w-4 rounded border-zinc-600 bg-transparent text-purple-500 focus:ring-purple-500"
                />
                <span className="flex-1 text-sm font-medium text-zinc-200">
                  {TYPE_LABELS[type]}
                </span>
                <span className="text-xs text-zinc-500">{count} available</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Question count slider */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-zinc-400">
          Number of Questions:{' '}
          <span className="gradient-text-blue font-bold">{effectiveCount}</span>
        </label>
        <input
          type="range"
          min={Math.min(5, effectiveMax)}
          max={effectiveMax}
          value={effectiveCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-zinc-600">
          <span>{Math.min(5, effectiveMax)}</span>
          <span>{effectiveMax}</span>
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={selectedTypes.size === 0 || effectiveCount === 0}
        className="w-full rounded-xl bg-emerald-300 py-3 text-sm font-medium text-white transition-all  disabled:opacity-50"
      >
        Start Quiz
      </button>
    </div>
  );
}
