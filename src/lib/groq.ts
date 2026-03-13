import OpenAI from "openai";

let client: OpenAI | null = null;

function getGroqClient(): OpenAI {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  return client;
}

export const groq = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return getGroqClient()[prop as keyof OpenAI];
  },
});
