"use client";

interface ParsedNclexRationale {
  bestAnswer: string;
  wrongOptions: { label: string; text: string }[];
  rule: string;
}

function parseNclexRationale(text: string): ParsedNclexRationale {
  const normalized = text.replace(/\s+/g, " ").trim();
  const bestMatch = normalized.match(/Best answer:\s*(.*?)(?=\s*Wrong options:|\s*Rule:|$)/i);
  const wrongMatch = normalized.match(/Wrong options:\s*(.*?)(?=\s*Rule:|$)/i);
  const ruleMatch = normalized.match(/Rule:\s*(.*)$/i);

  const wrongOptions = wrongMatch?.[1]
    ? wrongMatch[1]
        .split(/\s(?=[A-D]\))/)
        .map((entry) => {
          const match = entry.trim().match(/^([A-D])\)\s*(.*)$/);
          if (!match) {
            return null;
          }

          return {
            label: match[1],
            text: match[2].trim(),
          };
        })
        .filter((entry): entry is { label: string; text: string } => !!entry && !!entry.text)
    : [];

  return {
    bestAnswer: bestMatch?.[1]?.trim() || text,
    wrongOptions,
    rule: ruleMatch?.[1]?.trim() || "",
  };
}

interface NclexRationaleCardProps {
  text: string;
  variant?: "quiz" | "review" | "workbench";
}

export default function NclexRationaleCard({
  text,
  variant = "quiz",
}: NclexRationaleCardProps) {
  const parsed = parseNclexRationale(text);
  const isCompact = variant === "review";

  return (
    <div className={`rounded-xl border border-emerald-500/15 bg-emerald-500/[0.07] ${isCompact ? "p-4" : "p-5"}`}>
      <div className={`grid gap-3 ${isCompact ? "" : "md:grid-cols-[1.2fr_1fr]"}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            Best Answer
          </p>
          <p className={`mt-2 text-zinc-200 ${isCompact ? "text-sm" : "text-sm leading-relaxed"}`}>
            {parsed.bestAnswer}
          </p>

          {parsed.rule && (
            <div className="mt-3 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              Rule: {parsed.rule}
            </div>
          )}
        </div>

        {parsed.wrongOptions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              Why The Others Are Wrong
            </p>
            <div className="mt-2 space-y-2">
              {parsed.wrongOptions.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded-lg border border-white/6 bg-black/20 px-3 py-2 text-sm text-zinc-300"
                >
                  <span className="mr-2 text-xs font-semibold text-red-300/90">
                    {item.label}
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
