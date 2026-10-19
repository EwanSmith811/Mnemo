import 'server-only';
import OpenAI from 'openai';

let client: OpenAI | undefined;
export const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
// Preserve the app's fast, non-reasoning behavior and sampling controls on Luna.
// Keep model-specific parameters together so streaming and JSON routes agree.
export const AI_TEXT_OPTIONS = {
  model: AI_MODEL,
  ...(AI_MODEL.startsWith('gpt-6-luna')
    ? { reasoning_effort: 'none' as const }
    : {}),
};

export function getAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY)
    throw new Error('Missing OPENAI_API_KEY environment variable.');
  return (client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120_000,
    maxRetries: 2,
  }));
}
// Lazy initialization lets the application build before deployment secrets exist.
export const ai = new Proxy({} as OpenAI, {
  get(_target, property) {
    const instance = getAI();
    const value = Reflect.get(instance, property);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
