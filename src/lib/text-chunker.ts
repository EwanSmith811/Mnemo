const MAX_INPUT_CHARS = 400_000; // ~100k tokens, leaving room for prompt + output

export function prepareTextForLLM(rawText: string): {
  text: string;
  wasTruncated: boolean;
} {
  const cleaned = rawText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (cleaned.length <= MAX_INPUT_CHARS) {
    return { text: cleaned, wasTruncated: false };
  }

  const truncated = cleaned.substring(0, MAX_INPUT_CHARS);
  const lastPeriod = truncated.lastIndexOf('.');
  const cutoff =
    lastPeriod > MAX_INPUT_CHARS * 0.9 ? lastPeriod + 1 : MAX_INPUT_CHARS;

  return {
    text: cleaned.substring(0, cutoff),
    wasTruncated: true,
  };
}
