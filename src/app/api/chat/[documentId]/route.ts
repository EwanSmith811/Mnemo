import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { isStudyMessages } from '@/lib/request-validation';
import { ai, AI_TEXT_OPTIONS } from '@/lib/ai';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const { messages } = (await request.json()) as { messages: ChatMessage[] };

    if (!isStudyMessages(messages)) {
      return NextResponse.json(
        {
          error:
            'Provide a conversation of up to 100 messages (60,000 characters total).',
        },
        { status: 400 },
      );
    }

    // Fetch document content for RAG context
    const { data: doc, error: docError } = await database
      .from('documents')
      .select('filename, content')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      );
    }

    // Build the RAG context — truncate to ~60k chars to leave room for conversation
    const documentContext = doc.content ? doc.content.slice(0, 60000) : '';

    // Also fetch flashcards and summaries for supplementary context
    const [flashcardsRes, summariesRes] = await Promise.all([
      database
        .from('flashcards')
        .select('term, definition')
        .eq('document_id', documentId)
        .limit(50),
      database
        .from('topic_summaries')
        .select('topic_name, summary')
        .eq('document_id', documentId),
    ]);

    const flashcardContext =
      flashcardsRes.data
        ?.map((f) => `- ${f.term}: ${f.definition}`)
        .join('\n') || '';

    const summaryContext =
      summariesRes.data
        ?.map((s) => `## ${s.topic_name}\n${s.summary}`)
        .join('\n\n') || '';

    const systemPrompt = `You are a knowledgeable study assistant helping a student understand their study material. You have access to the full content of their document "${doc.filename}" as well as generated flashcards and topic summaries from it.

DOCUMENT CONTENT:
${documentContext}

${summaryContext ? `\nTOPIC SUMMARIES:\n${summaryContext}` : ''}

${flashcardContext ? `\nKEY TERMS:\n${flashcardContext}` : ''}

INSTRUCTIONS:
- When the student asks a question, PRIORITIZE information found in the document above.
- If the document contains relevant information, cite or reference it directly.
- If the document does NOT cover the topic, you may use your general knowledge but clearly state "Based on my general knowledge (not found in your document):" before that part of your answer.
- Be concise and brief — keep answers to 2-4 sentences unless the student explicitly asks for a detailed explanation.
- If the student asks you to explain a concept, relate it back to other concepts in their document to help build connections.
- Format responses with markdown for readability (headers, bold, lists, etc) but keep them short.
- Be encouraging and supportive as a study companion.
- Avoid long-winded answers. Get to the point quickly.`;

    const response = await ai.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });

    const reply =
      response.choices[0]?.message?.content ||
      "I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 },
    );
  }
}
