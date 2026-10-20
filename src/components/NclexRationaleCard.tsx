'use client';

interface ParsedNclexRationale {
  bestAnswer: string;
  wrongOptions: { label: string; text: string }[];
  rule: string;
}

function parseNclexRationale(text: string): ParsedNclexRationale {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const bestMatch = normalized.match(
    /Best answer:\s*(.*?)(?=\s*Wrong options:|\s*Rule:|$)/i,
  );
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
        .filter(
          (entry): entry is { label: string; text: string } =>
            !!entry && !!entry.text,
        )
    : [];

  return {
    bestAnswer: bestMatch?.[1]?.trim() || text,
    wrongOptions,
    rule: ruleMatch?.[1]?.trim() || '',
  };
}

export default function NclexRationaleCard({ text }: { text: string }) {
  const parsed = parseNclexRationale(text);
  return (
    <div className="rationale">
      <div>
        <span className="eyebrow">
          <b>Best answer</b>
        </span>
        <p>{parsed.bestAnswer}</p>
        {parsed.rule && <p className="rationale-rule">Rule · {parsed.rule}</p>}
      </div>
      {parsed.wrongOptions.length > 0 && (
        <div>
          <span className="eyebrow">Why the others are wrong</span>
          <ul>
            {parsed.wrongOptions.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <span className="mono">{item.label}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
