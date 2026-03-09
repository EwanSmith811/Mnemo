"use client";

import type { QuizQuestion, QuizAnswer } from "@/types";

interface ScoreDisplayProps {
  score: {
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    answers: QuizAnswer[];
  };
  questions: QuizQuestion[];
}

export default function ScoreDisplay({ score, questions }: ScoreDisplayProps) {
  const percentage =
    score.score_percentage ||
    Math.round((score.correct_answers / score.total_questions) * 100);

  let gradeGradient = "from-red-500 to-red-600";
  let gradeGlow = "shadow-[0_0_40px_rgba(239,68,68,0.2)]";
  if (percentage >= 90) {
    gradeGradient = "from-emerald-400 to-green-500";
    gradeGlow = "shadow-[0_0_40px_rgba(34,197,94,0.2)]";
  } else if (percentage >= 70) {
    gradeGradient = "from-blue-400 to-indigo-500";
    gradeGlow = "shadow-[0_0_40px_rgba(59,130,246,0.2)]";
  } else if (percentage >= 50) {
    gradeGradient = "from-amber-400 to-yellow-500";
    gradeGlow = "shadow-[0_0_40px_rgba(245,158,11,0.2)]";
  }

  const choiceLabels = ["A", "B", "C", "D"];

  return (
    <div>
      {/* Score summary */}
      <div className="mb-10 text-center animate-fade-in-up">
        <div className={`mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br ${gradeGradient} ${gradeGlow}`}>
          <span className="text-4xl font-bold text-white">{percentage}%</span>
        </div>
        <p className="text-lg text-zinc-300">
          {score.correct_answers} out of {score.total_questions} correct
        </p>
        {percentage >= 90 && (
          <p className="mt-1 text-sm text-emerald-400">Excellent work!</p>
        )}
        {percentage >= 70 && percentage < 90 && (
          <p className="mt-1 text-sm text-blue-400">Good job! Keep studying to improve.</p>
        )}
        {percentage < 70 && (
          <p className="mt-1 text-sm text-zinc-500">Review your flashcards and try again.</p>
        )}
      </div>

      {/* Question review */}
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-lg font-semibold text-zinc-200">Review</h3>
        <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className="space-y-4">
        {questions.map((question, index) => {
          const answer = score.answers.find(
            (a) => a.question_id === question.id
          );
          const isCorrect = answer?.is_correct ?? false;
          const qType = question.question_type || "mcq";

          return (
            <div
              key={question.id}
              className={`rounded-xl glass p-4 ${
                isCorrect
                  ? "border-emerald-500/20"
                  : "border-red-500/20"
              }`}
            >
              <div className="mb-2 flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${
                    isCorrect ? "bg-emerald-500" : "bg-red-500"
                  }`}
                >
                  {isCorrect ? "\u2713" : "\u2717"}
                </span>
                <div>
                  <span className="mr-2 inline-block rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500 border border-white/5">
                    {qType === "mcq" && "MCQ"}
                    {qType === "multiple_select" && "Multi-Select"}
                    {qType === "short_answer" && "Short Answer"}
                  </span>
                  <p className="mt-1 font-medium text-zinc-200">
                    {index + 1}. {question.question}
                  </p>
                </div>
              </div>

              {/* MCQ review */}
              {qType === "mcq" && (
                <>
                  {answer && !isCorrect && (
                    <p className="ml-7 text-sm text-red-400">
                      Your answer: {choiceLabels[answer.selected_answer]}.{" "}
                      {question.choices[answer.selected_answer]}
                    </p>
                  )}
                  <p className="ml-7 text-sm text-emerald-400">
                    Correct: {choiceLabels[question.correct_answer]}.{" "}
                    {question.choices[question.correct_answer]}
                  </p>
                </>
              )}

              {/* Multiple select review */}
              {qType === "multiple_select" && (
                <>
                  {answer && !isCorrect && (
                    <p className="ml-7 text-sm text-red-400">
                      Your selections:{" "}
                      {(answer.selected_answers || [])
                        .map(
                          (i) => `${choiceLabels[i]}: ${question.choices[i]}`
                        )
                        .join(", ") || "None"}
                    </p>
                  )}
                  <p className="ml-7 text-sm text-emerald-400">
                    Correct:{" "}
                    {(question.correct_answers || [])
                      .map((i) => `${choiceLabels[i]}: ${question.choices[i]}`)
                      .join(", ")}
                  </p>
                </>
              )}

              {/* Short answer review */}
              {qType === "short_answer" && (
                <>
                  {answer && !isCorrect && (
                    <p className="ml-7 text-sm text-red-400">
                      Your answer: {answer.typed_answer || "(empty)"}
                    </p>
                  )}
                  <p className="ml-7 text-sm text-emerald-400">
                    Correct: {question.correct_answer_text}
                  </p>
                </>
              )}

              {question.explanation && (
                <p className="ml-7 mt-1 text-sm text-zinc-500">
                  {question.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
