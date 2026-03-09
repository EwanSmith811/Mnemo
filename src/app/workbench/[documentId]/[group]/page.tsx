"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { WorkbenchContent, InquiryQuestion, FadedBlank, EngineeringProblem, GlossaryEntry } from "@/types";

// ── Client-side keyword validation ─────────────────────────────────────
// Multi-layer local check: exact match → stemmed keyword match → bigram
// overlap with idealAnswer. Falls through to API only when uncertain.

function basicStem(word: string): string {
  // Lightweight suffix-stripping (covers ~80% of English inflections)
  return word
    .replace(/(ies)$/i, "y")
    .replace(/(tion|sion)s$/i, "$1")
    .replace(/(ses|zes|xes|ches|shes)$/i, (m) => m.slice(0, -2))
    .replace(/(ness|ment|ence|ance|ity|ous|ive|ful|less|ing|tion|sion|able|ible)$/i, "")
    .replace(/(ed|ly|er|est|s)$/i, "")
    .replace(/(.{3,})s$/i, "$1");
}

function getBigrams(text: string): Set<string> {
  const words = text.split(" ").filter(Boolean);
  const bi = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) bi.add(words[i] + " " + words[i + 1]);
  return bi;
}

function tryLocalValidation(
  userAnswer: string,
  idealAnswer: string,
  keyTerms: string[]
): { correct: boolean; feedback: string } | null {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  const userNorm = normalize(userAnswer);
  const idealNorm = normalize(idealAnswer);

  // Layer 1: exact or near-exact match
  if (userNorm === idealNorm) {
    return { correct: true, feedback: "Correct!" };
  }

  // Precompute stems for both answers (used by layers 2-4)
  const stopWords = new Set(["the","a","an","is","are","was","were","be","been","being","it","its","this","that","which","who","whom","how","what","when","where","why","of","in","to","for","with","on","at","by","from","as","and","or","but","not","no","if","so","do","does","did","has","have","had","can","will","would","should","could","may","might","shall","must","than","then"]);
  const userWords = userNorm.split(" ").filter((w) => w.length > 2 && !stopWords.has(w));
  const idealWords = idealNorm.split(" ").filter((w) => w.length > 2 && !stopWords.has(w));
  const userStemSet = new Set(userWords.map(basicStem));
  const idealStemSet = new Set(idealWords.map(basicStem));

  // Layer 2: stemmed keyword matching
  if (keyTerms && keyTerms.length > 0) {
    const matchedTerms = keyTerms.filter((term) => {
      const termNorm = normalize(term);
      // Substring match
      if (userNorm.includes(termNorm)) return true;
      // All words present (original)
      const termWords = termNorm.split(" ");
      if (termWords.every((w) => userNorm.includes(w))) return true;
      // Stemmed match
      return termWords.every((w) => userStemSet.has(basicStem(w)));
    });

    const ratio = matchedTerms.length / keyTerms.length;

    if (ratio >= 0.65) {
      return { correct: true, feedback: "Good understanding! You covered the key concepts." };
    }
    // Only reject via keyTerms if stem overlap with ideal is ALSO very low
    // (prevents rejecting paraphrased correct answers)
    if (ratio <= 0.15 && userNorm.length > 5) {
      let stemOverlap = 0;
      for (const s of idealStemSet) if (userStemSet.has(s)) stemOverlap++;
      const stemRatio = idealStemSet.size > 0 ? stemOverlap / idealStemSet.size : 0;
      if (stemRatio <= 0.15) {
        const missing = keyTerms.filter((t) => !matchedTerms.includes(t));
        return { correct: false, feedback: `Consider these concepts: ${missing.slice(0, 2).join(", ")}.` };
      }
    }
  }

  // Layer 3: stem-level bag-of-words overlap (catches paraphrasing)
  // e.g. "eliminate redundancy" vs "minimizing data redundancy" — shared stems
  {
    let stemOverlap = 0;
    for (const s of idealStemSet) if (userStemSet.has(s)) stemOverlap++;
    const stemRatio = idealStemSet.size > 0 ? stemOverlap / idealStemSet.size : 0;

    if (stemRatio >= 0.5) {
      return { correct: true, feedback: "Well explained! You captured the key ideas." };
    }
  }

  // Layer 4: bigram overlap with ideal answer (catches near-verbatim answers)
  const idealBigrams = getBigrams(idealNorm);
  if (idealBigrams.size > 0) {
    const userBigrams = getBigrams(userNorm);
    let overlap = 0;
    for (const b of idealBigrams) if (userBigrams.has(b)) overlap++;
    const bigramRatio = overlap / idealBigrams.size;
    if (bigramRatio >= 0.4) {
      return { correct: true, feedback: "Well explained! You captured the key ideas." };
    }
  }

  // Layer 5: confident local rejection — only when BOTH stem and bigram overlap are near zero
  {
    let stemOverlap = 0;
    for (const s of idealStemSet) if (userStemSet.has(s)) stemOverlap++;
    const stemRatio = idealStemSet.size > 0 ? stemOverlap / idealStemSet.size : 0;

    const userBigrams = getBigrams(userNorm);
    let bigramOverlap = 0;
    for (const b of idealBigrams) if (userBigrams.has(b)) bigramOverlap++;
    const bigramRatio = idealBigrams.size > 0 ? bigramOverlap / idealBigrams.size : 0;

    if (stemRatio <= 0.1 && bigramRatio <= 0.05 && userWords.length >= 3) {
      return { correct: false, feedback: "Your answer seems to be missing the core ideas. Re-read the brief and try again." };
    }
  }

  // Uncertain → fall through to API
  return null;
}

// ── Clickable Stage Indicator ───────────────────────────────────────
function StageIndicator({
  current,
  highestReached,
  onNavigate,
  stages,
}: {
  current: number;
  highestReached: number;
  onNavigate: (stage: number) => void;
  stages: { label: string; num: number; color: string }[];
}) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {stages.map((s, i) => {
        const done = highestReached > s.num;
        const active = current === s.num;
        const clickable = s.num <= highestReached && s.num !== current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <button
                onClick={() => clickable && onNavigate(s.num)}
                disabled={!clickable}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all ${
                  clickable ? "cursor-pointer hover:scale-110" : done || active ? "" : "cursor-default"
                } ${
                  done
                    ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                    : active
                    ? s.color === "blue"
                      ? "bg-blue-500/20 text-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.3)]"
                      : s.color === "purple"
                      ? "bg-purple-500/20 text-purple-400 shadow-[0_0_12px_rgba(167,139,250,0.3)]"
                      : s.color === "amber"
                      ? "bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                      : "bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                    : "bg-white/5 text-zinc-600"
                }`}
              >
                {done ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.num
                )}
              </button>
              <span className={`mt-1.5 text-xs font-medium ${
                active ? "text-zinc-300" : clickable ? "text-zinc-400 cursor-pointer" : "text-zinc-600"
              }`}>
                {s.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={`mx-2 h-0.5 w-12 rounded-full transition-all ${
                  done ? "bg-emerald-500/40" : "bg-white/5"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Brief Stage (sectioned cards) ────────────────────────────────────
// Splits HTML at <h3> or <section> boundaries into collapsible cards.
// Falls back to paragraph-by-paragraph cards for plain <p> content.
function splitBriefIntoSections(html: string): { title: string; body: string }[] {
  // Try splitting on <h3> tags first (preferred structured format)
  const h3Parts = html.split(/(?=<h3[\s>])/i);
  if (h3Parts.length > 1) {
    return h3Parts
      .map((part) => {
        const titleMatch = part.match(/<h3[^>]*>(.*?)<\/h3>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "") : "";
        const body = titleMatch ? part.replace(/<h3[^>]*>.*?<\/h3>/i, "").trim() : part.trim();
        return { title, body };
      })
      .filter((s) => s.body.length > 0);
  }

  // Fall back: group every 1-2 paragraphs into a card
  const paragraphs = html
    .split(/<\/p>\s*/i)
    .map((p) => p.replace(/<p[^>]*>/i, "").trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length <= 1) {
    return [{ title: "", body: html }];
  }

  const sections: { title: string; body: string }[] = [];
  for (let i = 0; i < paragraphs.length; i += 2) {
    const chunk = paragraphs.slice(i, i + 2);
    // Use first bold term as a label if available
    const boldMatch = chunk[0].match(/<strong[^>]*>(.*?)<\/strong>/i);
    const title = boldMatch ? boldMatch[1].replace(/<[^>]+>/g, "") : "";
    sections.push({ title, body: chunk.map((p) => `<p>${p}</p>`).join("") });
  }
  return sections;
}

function BriefStage({
  briefHtml,
  glossary,
  onContinue,
  isReview,
  onBack,
}: {
  briefHtml: string;
  glossary: GlossaryEntry[];
  onContinue: () => void;
  isReview?: boolean;
  onBack?: () => void;
}) {
  const sections = splitBriefIntoSections(briefHtml);
  const [expanded, setExpanded] = useState<Set<number>>(new Set(sections.map((_, i) => i)));
  const [vocabPopover, setVocabPopover] = useState<{ term: string; definition: string; context: string; x: number; y: number } | null>(null);

  const toggleSection = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Handle clicks on <strong> tags to show glossary popover
  const handleBriefClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "STRONG") {
      const term = target.textContent?.trim().toLowerCase() || "";
      const entry = glossary.find((g) => g.term.toLowerCase() === term);
      if (entry) {
        const rect = target.getBoundingClientRect();
        setVocabPopover({
          term: entry.term,
          definition: entry.definition,
          context: entry.context,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
        });
      }
    }
  };

  return (
    <div className="animate-fade-in-up space-y-3">
      {/* Glossary popover */}
      {vocabPopover && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setVocabPopover(null)}
        >
          <div
            className="fixed z-50 w-72 rounded-xl glass border border-purple-500/20 p-4 shadow-2xl"
            style={{ left: Math.min(vocabPopover.x - 144, window.innerWidth - 300), top: vocabPopover.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-purple-300">{vocabPopover.term}</span>
              <button onClick={() => setVocabPopover(null)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
            </div>
            <p className="text-sm text-zinc-300 mb-2">{vocabPopover.definition}</p>
            <p className="text-xs text-zinc-500 italic">&ldquo;{vocabPopover.context}&rdquo;</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl glass p-5">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Read & Understand</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Tap each section to expand or collapse it.{glossary.length > 0 ? " Click bolded terms for definitions." : ""}
        </p>

        <div className="space-y-2">
          {sections.map((sec, i) => (
            <div key={i} className="rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden transition-all">
              <button
                onClick={() => toggleSection(i)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-400">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">
                    {sec.title || `Part ${i + 1}`}
                  </span>
                </span>
                <svg
                  className={`h-4 w-4 text-zinc-500 transition-transform ${expanded.has(i) ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded.has(i) && (
                <div
                  className="px-4 pb-4 prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed [&_strong]:text-zinc-100 [&_strong]:cursor-pointer [&_strong]:underline [&_strong]:decoration-purple-500/30 [&_strong]:underline-offset-2 [&_strong:hover]:decoration-purple-400/60 [&_p]:mb-2.5 [&_p:last-child]:mb-0"
                  dangerouslySetInnerHTML={{ __html: sec.body }}
                  onClick={handleBriefClick}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {isReview ? (
        <button
          onClick={onBack}
          className="w-full rounded-xl glass px-6 py-3 text-sm font-medium text-zinc-400 transition-all glass-hover"
        >
          Back to current stage
        </button>
      ) : (
        <button
          onClick={onContinue}
          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
        >
          I understand — continue to Inquiry
        </button>
      )}
    </div>
  );
}

// ── Inquiry state (lifted to parent to survive navigation) ─────────────
interface InquiryProgress {
  currentQ: number;
  completed: number;
  perQuestion: {
    answer: string;
    feedback: { correct: boolean; feedback: string } | null;
    hintsShown: number;
    attempts: number;
    reflectionText: string; // for Reveal & Reflect after 2 wrong
  }[];
}

function makeInquiryProgress(count: number): InquiryProgress {
  return {
    currentQ: 0,
    completed: 0,
    perQuestion: Array.from({ length: count }, () => ({
      answer: "",
      feedback: null,
      hintsShown: 0,
      attempts: 0,
      reflectionText: "",
    })),
  };
}

// ── Inquiry Stage (with client-side pre-validation) ────────────────────
function InquiryStage({
  questions,
  documentId,
  onComplete,
  hasEngineerStage,
  progress,
  onProgressChange,
}: {
  questions: InquiryQuestion[];
  documentId: string;
  onComplete: () => void;
  hasEngineerStage: boolean;
  progress: InquiryProgress;
  onProgressChange: (p: InquiryProgress) => void;
}) {
  const [isValidating, setIsValidating] = useState(false);

  const { currentQ, completed, perQuestion } = progress;
  const qState = perQuestion[currentQ];
  const q = questions[currentQ];

  // Helpers to update progress immutably
  const updateQ = (patch: Partial<typeof qState>) => {
    const next = { ...progress, perQuestion: [...perQuestion] };
    next.perQuestion[currentQ] = { ...qState, ...patch };
    onProgressChange(next);
  };

  const handleSubmit = async () => {
    if (!qState.answer.trim() || isValidating) return;
    setIsValidating(true);
    try {
      const local = tryLocalValidation(qState.answer.trim(), q.idealAnswer, q.keyTerms ?? []);
      if (local) {
        const newAttempts = qState.attempts + 1;
        const justCompleted = local.correct || newAttempts >= 2;
        const next = { ...progress, perQuestion: [...perQuestion] };
        next.perQuestion[currentQ] = { ...qState, feedback: local, attempts: newAttempts };
        if (justCompleted) next.completed = completed + 1;
        onProgressChange(next);
        return;
      }

      const res = await fetch(`/api/workbench/${documentId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          userAnswer: qState.answer.trim(),
          idealAnswer: q.idealAnswer,
        }),
      });
      const data = await res.json();
      const newAttempts = qState.attempts + 1;
      const justCompleted = data.correct || newAttempts >= 2;
      const next = { ...progress, perQuestion: [...perQuestion] };
      next.perQuestion[currentQ] = { ...qState, feedback: data, attempts: newAttempts };
      if (justCompleted) next.completed = completed + 1;
      onProgressChange(next);
    } catch {
      updateQ({ feedback: { correct: false, feedback: "Failed to validate. Please try again." } });
    } finally {
      setIsValidating(false);
    }
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      onProgressChange({ ...progress, currentQ: currentQ + 1 });
    } else {
      onComplete();
    }
  };

  const feedback = qState.feedback;
  const attempts = qState.attempts;
  const canAdvance = feedback && (feedback.correct || attempts >= 2);

  return (
    <div className="rounded-2xl glass p-6 animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Inquiry</h2>
        <span className="text-sm text-zinc-500">
          Question {currentQ + 1} of {questions.length}
        </span>
      </div>

      {/* Progress dots */}
      <div className="mb-6 flex items-center gap-2">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < completed
                ? "bg-purple-400"
                : i === currentQ
                ? "bg-purple-400/50"
                : "bg-white/5"
            }`}
          />
        ))}
      </div>

      <div className="mb-4 rounded-xl bg-white/5 p-4">
        <p
          className="text-sm font-medium text-zinc-200 [&_strong]:font-bold [&_strong]:text-zinc-100"
          dangerouslySetInnerHTML={{ __html: q.question }}
        />
      </div>

      {/* Hints */}
      {q.hints && q.hints.length > 0 && qState.hintsShown < q.hints.length && !feedback && (
        <button
          onClick={() => updateQ({ hintsShown: qState.hintsShown + 1 })}
          className="mb-3 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          Show hint ({qState.hintsShown}/{q.hints.length})
        </button>
      )}
      {qState.hintsShown > 0 && (
        <div className="mb-4 space-y-1">
          {q.hints.slice(0, qState.hintsShown).map((hint, i) => (
            <p key={i} className="text-xs text-zinc-500 italic">
              Hint {i + 1}: {hint}
            </p>
          ))}
        </div>
      )}

      {/* Answer input */}
      {!canAdvance && (
        <div className="mb-4">
          <textarea
            value={qState.answer}
            onChange={(e) => updateQ({ answer: e.target.value })}
            placeholder="Type your answer..."
            rows={3}
            className="w-full resize-none rounded-xl glass px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-purple-500/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!qState.answer.trim() || isValidating}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-40"
          >
            {isValidating ? "Checking..." : "Submit Answer"}
          </button>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          className={`mb-4 rounded-xl p-4 ${
            feedback.correct
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : attempts >= 2
              ? "bg-amber-500/10 border border-amber-500/20"
              : "bg-red-500/10 border border-red-500/20"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {feedback.correct ? (
              <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : attempts >= 2 ? (
              <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`text-sm font-medium ${
              feedback.correct ? "text-emerald-400" : attempts >= 2 ? "text-amber-400" : "text-red-400"
            }`}>
              {feedback.correct ? "Correct!" : attempts >= 2 ? "Let\u2019s learn from this" : "Not quite"}
            </span>
          </div>
          <p className="text-sm text-zinc-400">{feedback.feedback}</p>
          {!feedback.correct && attempts < 2 && (
            <button
              onClick={() => updateQ({ feedback: null, answer: "" })}
              className="mt-2 text-xs text-purple-400 hover:text-purple-300"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Reveal & Reflect — shown after 2 wrong attempts */}
      {feedback && !feedback.correct && attempts >= 2 && (
        <div className="mb-4 rounded-xl bg-white/[0.03] border border-amber-500/15 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">Ideal Answer</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{q.idealAnswer}</p>
          </div>
          {q.briefSection && (
            <p className="text-xs text-zinc-500">
              Found in brief section: <span className="text-blue-400 font-medium">{q.briefSection}</span>
            </p>
          )}
          <div>
            <label className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1 block">
              Reflect — rewrite the answer in your own words
            </label>
            <textarea
              value={qState.reflectionText}
              onChange={(e) => updateQ({ reflectionText: e.target.value })}
              placeholder="I understand this because..."
              rows={2}
              className="w-full resize-none rounded-xl glass px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-amber-500/40"
            />
          </div>
        </div>
      )}

      {canAdvance && (
        <button
          onClick={handleNext}
          disabled={!feedback?.correct && attempts >= 2 && qState.reflectionText.trim().length < 15}
          className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {!feedback?.correct && attempts >= 2 && qState.reflectionText.trim().length < 15
            ? "Write a reflection to continue"
            : currentQ < questions.length - 1
            ? "Next Question"
            : "Continue to Fade"}
        </button>
      )}
    </div>
  );
}

// ── Fade Stage ───────────────────────────────────────────────────────
function FadeStage({
  blanks,
  onComplete,
  hasEngineerStage,
}: {
  blanks: FadedBlank[];
  onComplete: (score: number) => void;
  hasEngineerStage: boolean;
}) {
  const [answers, setAnswers] = useState<string[]>(blanks.map(() => ""));
  const [results, setResults] = useState<(boolean | null)[]>(blanks.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const threshold = Math.max(4, Math.ceil(blanks.length * 0.75));

  const handleSubmit = () => {
    const newResults = blanks.map((blank, i) => {
      const user = answers[i].trim().toLowerCase().replace(/^(a|an|the)\s+/, "");
      const correct = blank.answer.trim().toLowerCase().replace(/^(a|an|the)\s+/, "");
      return user === correct;
    });
    setResults(newResults);
    const s = newResults.filter(Boolean).length;
    setScore(s);
    setSubmitted(true);
    if (s >= threshold) {
      onComplete(s);
    }
  };

  const handleRetry = () => {
    setAnswers(blanks.map(() => ""));
    setResults(blanks.map(() => null));
    setSubmitted(false);
    setScore(0);
  };

  return (
    <div className="rounded-2xl glass p-6 animate-fade-in-up">
      <h2 className="mb-2 text-lg font-semibold text-zinc-100">Fill in the Blanks</h2>
      <p className="mb-6 text-xs text-zinc-500">
        Complete each sentence with the correct term. Score {threshold}/{blanks.length} or better to{hasEngineerStage ? " continue" : " master this group"}.
      </p>

      <div className="space-y-4">
        {blanks.map((blank, i) => (
          <div key={i} className="flex flex-wrap items-baseline gap-1 text-sm text-zinc-300 leading-relaxed">
            <span>{blank.textBefore}</span>
            <input
              type="text"
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setAnswers(next);
              }}
              disabled={submitted}
              className={`wb-blank ${
                submitted
                  ? results[i]
                    ? "wb-blank-correct"
                    : "wb-blank-incorrect"
                  : ""
              }`}
              style={{ width: Math.max(80, blank.answer.length * 10) }}
              placeholder="..."
            />
            <span>{blank.textAfter}</span>
            {submitted && !results[i] && (
              <span className="ml-1 text-xs text-emerald-400">({blank.answer})</span>
            )}
          </div>
        ))}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={answers.some((a) => !a.trim())}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] disabled:opacity-40"
        >
          Check Answers
        </button>
      ) : (
        <div className="mt-6">
          <div
            className={`mb-4 rounded-xl p-4 text-center ${
              score >= threshold
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-amber-500/10 border border-amber-500/20"
            }`}
          >
            <p className={`text-lg font-bold ${score >= threshold ? "text-emerald-400" : "text-amber-400"}`}>
              {score}/{blanks.length}
            </p>
            <p className={`text-sm ${score >= threshold ? "text-emerald-400/80" : "text-amber-400/80"}`}>
              {score >= threshold ? (hasEngineerStage ? "Moving on to Engineer!" : "Group mastered!") : "Almost there — try again"}
            </p>
          </div>
          {score < threshold && (
            <button
              onClick={handleRetry}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Engineer Stage ───────────────────────────────────────────────────────
function EngineerStage({
  problems,
  onComplete,
}: {
  problems: EngineeringProblem[];
  onComplete: () => void;
}) {
  const [currentP, setCurrentP] = useState(0);
  const [answer, setAnswer] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
  const [completed, setCompleted] = useState(0);

  const p = problems[currentP];

  const handleCheck = () => {
    const userNum = parseFloat(answer.replace(/[^\d.\-eE]/g, ""));
    if (isNaN(userNum)) {
      setResult("incorrect");
      return;
    }
    const diff = Math.abs(userNum - p.answer);
    const isCorrect = diff <= p.tolerance;
    setResult(isCorrect ? "correct" : "incorrect");
    if (isCorrect) setCompleted((c) => c + 1);
  };

  const handleNext = () => {
    if (currentP < problems.length - 1) {
      setCurrentP((c) => c + 1);
      setAnswer("");
      setShowSolution(false);
      setResult(null);
    } else {
      onComplete();
    }
  };

  return (
    <div className="rounded-2xl glass p-6 animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Engineer&apos;s Mode</h2>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-medium text-amber-400">
            SOLVE
          </span>
        </div>
        <span className="text-sm text-zinc-500">
          Problem {currentP + 1} of {problems.length}
        </span>
      </div>

      {/* Progress dots */}
      <div className="mb-6 flex items-center gap-2">
        {problems.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < completed
                ? "bg-amber-400"
                : i === currentP
                ? "bg-amber-400/50"
                : "bg-white/5"
            }`}
          />
        ))}
      </div>

      {/* Problem statement */}
      <div className="mb-4 rounded-xl bg-white/5 p-4">
        <p className="text-sm font-medium text-zinc-200 leading-relaxed">{p.problem}</p>
      </div>

      {/* Given data */}
      <div className="mb-5 rounded-xl bg-amber-500/5 border border-amber-500/10 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400/80">Given</p>
        <ul className="space-y-1">
          {p.givenData.map((d, i) => (
            <li key={i} className="text-sm text-zinc-300 font-mono">{d}</li>
          ))}
        </ul>
      </div>

      {/* Answer input */}
      {!result && (
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-zinc-500">
            Your answer ({p.unit})
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter numerical value..."
              className="flex-1 rounded-xl glass px-4 py-3 text-sm text-zinc-100 font-mono placeholder-zinc-600 outline-none transition-all focus:border-amber-500/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCheck();
                }
              }}
            />
            <span className="flex items-center rounded-xl glass px-3 text-sm font-mono text-zinc-400">{p.unit}</span>
          </div>
          <button
            onClick={handleCheck}
            disabled={!answer.trim()}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-40"
          >
            Check Answer
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`mb-4 rounded-xl p-4 ${
            result === "correct"
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-red-500/10 border border-red-500/20"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {result === "correct" ? (
              <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`text-sm font-medium ${result === "correct" ? "text-emerald-400" : "text-red-400"}`}>
              {result === "correct" ? "Correct!" : `Incorrect — answer is ${p.answer} ${p.unit}`}
            </span>
          </div>
        </div>
      )}

      {/* Solution toggle */}
      {result && (
        <div className="mb-4">
          <button
            onClick={() => setShowSolution((v) => !v)}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showSolution ? "Hide solution" : "Show step-by-step solution"}
          </button>
          {showSolution && (
            <div className="mt-3 rounded-xl bg-white/5 p-4 space-y-2">
              {p.solutionSteps.map((step, i) => (
                <p key={i} className="text-sm text-zinc-300">
                  <span className="text-zinc-500 font-mono mr-2">{i + 1}.</span>
                  {step}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <button
          onClick={handleNext}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
        >
          {currentP < problems.length - 1 ? "Next Problem" : "Complete"}
        </button>
      )}
    </div>
  );
}

// ── Complete Stage ───────────────────────────────────────────────────
function CompleteStage({ groupName, hasEngineer }: { groupName: string; hasEngineer: boolean }) {
  return (
    <div className="rounded-2xl glass p-8 text-center animate-fade-in-up">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
        <svg className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-bold text-zinc-100">Group Mastered!</h2>
      <p className="text-sm text-zinc-500">
        You&apos;ve completed all {hasEngineer ? "4" : "3"} stages for the <strong className="text-zinc-300">{groupName}</strong> concept group.
      </p>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function WorkbenchGroupDeepDive() {
  const params = useParams();
  const documentId = params.documentId as string;
  const groupParam = decodeURIComponent(params.group as string);

  const [content, setContent] = useState<WorkbenchContent | null>(null);
  const [nodeLabels, setNodeLabels] = useState<Map<string, string>>(new Map());
  const [inquiryProgress, setInquiryProgress] = useState<InquiryProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(1);
  const [currentStage, setCurrentStage] = useState(1);
  const [engineerMode, setEngineerMode] = useState(false);

  const hasEngineerProblems = (content?.engineering_problems ?? []).length > 0;
  const hasEngineerStage = engineerMode && hasEngineerProblems;
  // Total stages: B=1, I=2, F=3, E=4 (optional), Complete = lastStage+1
  const completeStageNum = hasEngineerStage ? 5 : 4;

  const stages = [
    { label: "Brief", num: 1, color: "blue" },
    { label: "Inquiry", num: 2, color: "purple" },
    { label: "Fade", num: 3, color: "emerald" },
    ...(hasEngineerStage ? [{ label: "Engineer", num: 4, color: "amber" }] : []),
  ];

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workbench/${documentId}/content?group=${encodeURIComponent(groupParam)}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load");
        }
        const data: WorkbenchContent = await res.json();
        setContent(data);
        setInquiryProgress(makeInquiryProgress(data.inquiry_questions.length));

        // Fetch mastery to resume from last stage
        const overviewRes = await fetch(`/api/workbench/${documentId}/overview`);
        if (overviewRes.ok) {
          const overview = await overviewRes.json();
          const group = overview.find((g: { group: string }) => g.group === groupParam);
          if (group) {
            if (group.stageCompleted >= 3) {
              setCurrentStage(completeStageNum);
              setActiveStage(completeStageNum);
            } else if (group.stageCompleted >= 1) {
              setCurrentStage(group.stageCompleted + 1);
              setActiveStage(group.stageCompleted + 1);
            }
            // Build id → label map for concept badges
            const labelsMap = new Map<string, string>();
            const ids: string[] = group.nodeIds ?? [];
            const labels: string[] = group.nodeLabels ?? [];
            ids.forEach((id: string, idx: number) => {
              if (labels[idx]) labelsMap.set(id, labels[idx]);
            });
            setNodeLabels(labelsMap);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load content");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, groupParam]);

  const updateMastery = useCallback(
    async (stageNum: number) => {
      await fetch(`/api/workbench/${documentId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: groupParam, stage: stageNum }),
      });
    },
    [documentId, groupParam]
  );

  const handleBriefComplete = async () => {
    await updateMastery(1);
    setCurrentStage(2);
    setActiveStage(2);
  };

  const handleInquiryComplete = async () => {
    await updateMastery(2);
    setCurrentStage(3);
    setActiveStage(3);
  };

  const handleFadeComplete = async () => {
    if (hasEngineerStage) {
      await updateMastery(2); // Don't mark as fully complete yet
      setCurrentStage(4);
      setActiveStage(4);
    } else {
      await updateMastery(3);
      setCurrentStage(completeStageNum);
      setActiveStage(completeStageNum);
    }
  };

  const handleEngineerComplete = async () => {
    await updateMastery(3);
    setCurrentStage(completeStageNum);
    setActiveStage(completeStageNum);
  };

  const handleStageNavigate = (stage: number) => {
    setActiveStage(stage);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-rose-400" />
          </div>
          <p className="text-zinc-500">Preparing deep dive...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-400">{error || "Content not available"}</p>
          <Link
            href={`/workbench/${documentId}`}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Back to workbench
          </Link>
        </div>
      </div>
    );
  }

  const isReviewing = activeStage < currentStage;

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Nav */}
        <Link
          href={`/workbench/${documentId}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to workbench
        </Link>

        {/* Group title + Engineer's mode toggle */}
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100">{groupParam}</h1>
          {hasEngineerProblems && (
            <button
              onClick={() => setEngineerMode((v) => !v)}
              className={`rounded-xl glass px-3 py-1.5 text-xs font-medium transition-all glass-hover ${
                engineerMode ? "text-amber-400 border-amber-500/20" : "text-zinc-500"
              }`}
            >
              {engineerMode ? "Engineer ON" : "Engineer Mode"}
            </button>
          )}
        </div>

        {/* Concept list */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          {(content.node_ids ?? []).map((id, i) => {
            const isRequired = (content.required_node_ids ?? []).includes(id);
            return (
              <span
                key={id}
                className={`rounded-md px-2 py-0.5 text-xs ${
                  isRequired
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "bg-white/5 text-zinc-500"
                }`}
              >
                {id === "central" ? "Central" : (nodeLabels.get(id) ?? `Concept ${i + 1}`)}{isRequired ? " (required)" : ""}
              </span>
            );
          })}
        </div>

        {/* Stage indicator */}
        <StageIndicator
          current={activeStage}
          highestReached={currentStage}
          onNavigate={handleStageNavigate}
          stages={stages}
        />

        {/* Reviewing indicator */}
        {isReviewing && (
          <div className="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-blue-400">
              Reviewing {stages.find(s => s.num === activeStage)?.label ?? ""} — your progress is saved
            </p>
            <button
              onClick={() => setActiveStage(currentStage)}
              className="text-xs text-blue-300 hover:text-blue-200 underline"
            >
              Return to current stage
            </button>
          </div>
        )}

        {/* Stage content */}
        {activeStage === 1 && (
          <BriefStage
            briefHtml={content.brief_html}
            glossary={content.glossary ?? []}
            onContinue={handleBriefComplete}
            isReview={isReviewing}
            onBack={() => setActiveStage(currentStage)}
          />
        )}
        {activeStage === 2 && !isReviewing && inquiryProgress && (
          <InquiryStage
            questions={content.inquiry_questions}
            documentId={documentId}
            onComplete={handleInquiryComplete}
            hasEngineerStage={hasEngineerStage}
            progress={inquiryProgress}
            onProgressChange={setInquiryProgress}
          />
        )}
        {activeStage === 2 && isReviewing && (
          <div className="rounded-2xl glass p-6 animate-fade-in-up">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">Inquiry Review</h2>
            <div className="space-y-3">
              {content.inquiry_questions.map((q, i) => (
                <div key={i} className="rounded-xl bg-white/5 p-4">
                  <p
                    className="text-sm font-medium text-zinc-200 mb-2 [&_strong]:font-bold [&_strong]:text-zinc-100"
                    dangerouslySetInnerHTML={{ __html: q.question }}
                  />
                  <p className="text-xs text-zinc-500">
                    <span className="text-zinc-400">Answer:</span> {q.idealAnswer}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setActiveStage(currentStage)}
              className="mt-4 w-full rounded-xl glass px-6 py-3 text-sm font-medium text-zinc-400 transition-all glass-hover"
            >
              Back to current stage
            </button>
          </div>
        )}
        {activeStage === 3 && !isReviewing && (
          <FadeStage
            blanks={content.faded_blanks}
            onComplete={handleFadeComplete}
            hasEngineerStage={hasEngineerStage}
          />
        )}
        {activeStage === 4 && hasEngineerStage && !isReviewing && (
          <EngineerStage
            problems={content.engineering_problems}
            onComplete={handleEngineerComplete}
          />
        )}
        {activeStage === completeStageNum && <CompleteStage groupName={groupParam} hasEngineer={hasEngineerStage} />}

        {/* Back to hub link */}
        {activeStage === completeStageNum && (
          <div className="mt-8 text-center">
            <Link
              href={`/workbench/${documentId}`}
              className="rounded-xl glass px-6 py-3 text-sm text-zinc-400 transition-all glass-hover hover-glow-blue inline-block"
            >
              Back to Workbench Hub
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
