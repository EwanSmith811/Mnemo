const CHOICE_LABELS = ["A", "B", "C", "D"] as const;

type SingleAnswerWithLabeledRationale = {
  choices: string[];
  correct_answer: number;
  explanation?: string;
  rationale?: string;
};

function normalizeForSearch(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSignificantTokens(text: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
  ]);

  return normalizeForSearch(text)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function shuffleIndices(length: number) {
  const indices = Array.from({ length }, (_, index) => index);

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices;
}

function remapLabeledRationale(
  text: string,
  oldCorrectIndex: number,
  newOrder: number[]
) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const bestMatch = normalized.match(/Best answer:\s*(.*?)(?=\s*Wrong options:|\s*Rule:|$)/i);
  const wrongMatch = normalized.match(/Wrong options:\s*(.*?)(?=\s*Rule:|$)/i);
  const ruleMatch = normalized.match(/Rule:\s*(.*)$/i);

  if (!wrongMatch?.[1]) {
    return text;
  }

  const wrongOptionMap = new Map<number, string>();
  wrongMatch[1]
    .split(/\s(?=[A-D]\))/)
    .map((entry) => entry.trim())
    .forEach((entry) => {
      const match = entry.match(/^([A-D])\)\s*(.*)$/);
      if (!match) return;
      const oldIndex = CHOICE_LABELS.indexOf(match[1] as (typeof CHOICE_LABELS)[number]);
      if (oldIndex >= 0) {
        wrongOptionMap.set(oldIndex, match[2].trim());
      }
    });

  const rebuiltWrongOptions = newOrder
    .map((oldIndex, newIndex) => ({ oldIndex, newIndex }))
    .filter(({ oldIndex }) => oldIndex !== oldCorrectIndex)
    .map(({ oldIndex, newIndex }) => {
      const explanation = wrongOptionMap.get(oldIndex);
      return explanation ? `${CHOICE_LABELS[newIndex]}) ${explanation}` : null;
    })
    .filter((entry): entry is string => !!entry)
    .join(" ");

  if (!rebuiltWrongOptions) {
    return text;
  }

  const segments = [`Best answer: ${bestMatch?.[1]?.trim() || ""}`.trim()];
  segments.push(`Wrong options: ${rebuiltWrongOptions}`);

  if (ruleMatch?.[1]?.trim()) {
    segments.push(`Rule: ${ruleMatch[1].trim()}`);
  }

  return segments.join(" ").trim();
}

export function questionLeaksCorrectAnswer(
  stem: string,
  correctChoice: string,
  scenario?: string
) {
  const combinedStem = normalizeForSearch(`${scenario ?? ""} ${stem}`);
  const normalizedChoice = normalizeForSearch(correctChoice);

  if (normalizedChoice.length >= 6 && combinedStem.includes(normalizedChoice)) {
    return true;
  }

  const tokens = getSignificantTokens(correctChoice);
  return tokens.length >= 2 && tokens.every((token) => combinedStem.includes(token));
}

export function shuffleSingleAnswerChoices<T extends SingleAnswerWithLabeledRationale>(
  question: T,
  rationaleField?: "explanation" | "rationale"
) {
  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    return question;
  }

  const newOrder = shuffleIndices(question.choices.length);
  const remappedQuestion = {
    ...question,
    choices: newOrder.map((oldIndex) => question.choices[oldIndex]),
    correct_answer: newOrder.indexOf(question.correct_answer),
  };

  if (rationaleField && typeof question[rationaleField] === "string" && question[rationaleField]?.trim()) {
    remappedQuestion[rationaleField] = remapLabeledRationale(
      question[rationaleField] as string,
      question.correct_answer,
      newOrder
    ) as T[typeof rationaleField];
  }

  return remappedQuestion;
}

export function shuffleMultipleSelectChoices<T extends { choices: string[]; correct_answers: number[] }>(
  question: T
) {
  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    return question;
  }

  const newOrder = shuffleIndices(question.choices.length);
  const remappedCorrect = question.correct_answers
    .map((oldIndex) => newOrder.indexOf(oldIndex))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  return {
    ...question,
    choices: newOrder.map((oldIndex) => question.choices[oldIndex]),
    correct_answers: remappedCorrect,
  };
}
