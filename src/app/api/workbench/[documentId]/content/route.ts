export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { ai, AI_TEXT_OPTIONS } from '@/lib/ai';
import {
  compileNclexReferencePacket,
  getNclexExplanationFormatInstructions,
  getNclexQualityChecklist,
  getNclexStemStyleInstructions,
} from '@/lib/nclex-guidance';
import {
  questionLeaksCorrectAnswer,
  shuffleSingleAnswerChoices,
} from '@/lib/nclex-utils';
import type { NclexQuestion, StudyMode } from '@/types';
import {
  validGroup,
  workbenchGroups,
  topicContext,
} from '@/lib/workbench-learning';

function compactGuidance(text: string, maxChars = 2200) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function looksLikeBinaryOppositeOptions(choices: string[]) {
  const normalized = choices.map((choice) => choice.trim().toLowerCase());
  const oppositePatterns = [
    ['increase', 'decrease'],
    ['higher', 'lower'],
    ['more', 'less'],
    ['raise', 'lower'],
    ['up', 'down'],
  ];

  return oppositePatterns.some(([a, b]) => {
    const aMatches = normalized.filter((choice) => choice.includes(a)).length;
    const bMatches = normalized.filter((choice) => choice.includes(b)).length;
    return aMatches >= 2 && bMatches >= 2;
  });
}

function hasClinicalContext(text: string) {
  const normalized = text.toLowerCase();
  return [
    'client',
    'patient',
    'nurse',
    'assessment',
    'findings',
    'reports',
    'vital signs',
    'admitted',
    'postoperative',
    'provider',
    'history',
    'symptom',
    'priority',
    'delegat',
  ].some((marker) => normalized.includes(marker));
}

function isValidNclexQuestion(question: NclexQuestion) {
  return (
    typeof question.scenario === 'string' &&
    typeof question.question === 'string' &&
    Array.isArray(question.choices) &&
    question.choices.length === 4 &&
    Number.isInteger(question.correct_answer) &&
    question.choices.every(
      (choice) => typeof choice === 'string' && !!choice.trim(),
    ) &&
    question.correct_answer >= 0 &&
    question.correct_answer <= 3 &&
    typeof question.rationale === 'string'
  );
}

function isStrongNclexQuestion(question: NclexQuestion) {
  return (
    isValidNclexQuestion(question) &&
    hasClinicalContext(`${question.scenario} ${question.question}`) &&
    !looksLikeBinaryOppositeOptions(question.choices) &&
    !questionLeaksCorrectAnswer(
      question.question,
      question.choices[question.correct_answer] || '',
      question.scenario,
    ) &&
    new Set(question.choices.map((choice) => choice.trim().toLowerCase()))
      .size === 4
  );
}

function randomizeNclexQuestion(question: NclexQuestion) {
  return shuffleSingleAnswerChoices(question, 'rationale');
}

async function generateSupplementalNclexQuestions(
  groupName: string,
  conceptList: string,
  docContext: string,
  missingCount: number,
  existingQuestions: NclexQuestion[],
  nursingPacketText: string,
): Promise<NclexQuestion[]> {
  const avoidList = existingQuestions
    .map((q, index) => `${index + 1}. ${q.question}`)
    .join('\n');

  try {
    const response = await ai.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [
        {
          role: 'system',
          content: `You create only NCLEX-style questions and return valid JSON.

Return exactly this format:
{
  "questions": [
    {
      "scenario": "Brief patient scenario or care setting context.",
      "question": "An NCLEX-style question asking for the best nursing action.",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 1,
      "rationale": "Best answer: ... Wrong options: A) ... B) ... C) ... D) ... Rule: ..."
    }
  ]
}

Rules:
- Generate exactly ${missingCount} new NCLEX-style questions
- Each must be single-best-answer with exactly 4 choices
- Use nursing-specific terminology and plausible distractors
- Include concrete client context without revealing the answer
- Test clinical judgment, prioritization, teaching, follow-up, or delegation rather than simple recall
- Keep most items focused on the best nursing action, but include some alternate stem styles such as need for further teaching, requires immediate follow-up, or evaluation of outcomes
- Do not use increase/decrease style opposite pairs as the main choice structure
- Do not restate the diagnosis, teaching point, or intervention from the correct option inside the stem
- Spread correct answers across A, B, C, and D instead of clustering them
- Stem-style guidance:
${getNclexStemStyleInstructions()}
- ${getNclexExplanationFormatInstructions().replace('explanation', 'rationale')}
- Follow this curated guidance:
${compactGuidance(nursingPacketText)}
- Do not repeat or closely paraphrase any existing questions
- Respond only with JSON`,
        },
        {
          role: 'user',
          content: `Concept group: "${groupName}"

Concepts:
${conceptList}

${docContext ? `Document context:\n${docContext.slice(0, 5000)}\n\n` : ''}Existing questions to avoid:
${avoidList || 'None'}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_completion_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as { questions?: NclexQuestion[] };
    return (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter(isStrongNclexQuestion)
      .map(randomizeNclexQuestion);
  } catch (error) {
    console.error('Workbench supplemental NCLEX generation failed:', error);
    return [];
  }
}

async function refineNclexQuestions(
  questions: NclexQuestion[],
  groupName: string,
  conceptList: string,
  docContext: string,
  nursingPacketText: string,
): Promise<NclexQuestion[]> {
  if (questions.length === 0) {
    return [];
  }

  try {
    const response = await ai.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [
        {
          role: 'system',
          content: `You are an NCLEX-RN item editor. Rewrite these NCLEX questions to improve quality while staying aligned to the concept group and uploaded document.

Return JSON:
{
  "questions": [
    {
      "scenario": "Brief patient scenario or care setting context.",
      "question": "An NCLEX-style question asking for the best nursing action.",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 1,
      "rationale": "Best answer: ... Wrong options: A) ... B) ... C) ... D) ... Rule: ..."
    }
  ]
}

Quality checklist:
${getNclexQualityChecklist()}

Guidance:
${compactGuidance(nursingPacketText, 1600)}

Rules:
- Keep the same number of questions
- Use nursing-specific wording and less obvious distractors
- Keep one clearly best answer
- Add clinical context if the question is too abstract
- Replace opposite-pair options with four distinct plausible nursing actions
- Make the rationale explain both the best answer and the wrong options
- Keep most items action-focused, but vary some stems with further teaching, follow-up, delegation, or evaluation wording
- Remove any stem that gives away the answer by repeating the diagnosis or key intervention from the correct option
- Stem-style guidance:
${getNclexStemStyleInstructions()}
 - Return only revised questions in JSON.`,
        },
        {
          role: 'user',
          content: `Concept group: "${groupName}"

Concepts:
${conceptList}

${docContext ? `Document context:\n${docContext.slice(0, 4000)}\n\n` : ''}Improve these NCLEX questions:
${JSON.stringify(questions)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_completion_tokens: 4500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return questions;
    }

    const parsed = JSON.parse(content) as { questions?: NclexQuestion[] };
    const refined = Array.isArray(parsed.questions)
      ? parsed.questions
      : questions;
    return refined.filter(isStrongNclexQuestion).map(randomizeNclexQuestion);
  } catch (error) {
    console.error('Workbench NCLEX refinement failed, falling back:', error);
    return questions;
  }
}

// GET — fetch or generate workbench content for a group
async function prepareLesson(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const groupName = request.nextUrl.searchParams.get('group');

    if (!validGroup(groupName)) {
      return NextResponse.json(
        { error: 'group query param required' },
        { status: 400 },
      );
    }

    const { data: doc } = await database
      .from('documents')
      .select('content, filename, study_mode')
      .eq('id', documentId)
      .maybeSingle();

    if (!doc)
      return NextResponse.json(
        { error: 'Document not found.' },
        { status: 404 },
      );
    const studyMode = (doc?.study_mode ?? 'engineers') as StudyMode;

    const { data: existing } = await database
      .from('workbench_content')
      .select('*')
      .eq('document_id', documentId)
      .eq('group_name', groupName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ...existing, study_mode: studyMode });
    }

    const { data: graph } = await database
      .from('concept_graphs')
      .select('nodes')
      .eq('document_id', documentId)
      .maybeSingle();

    if (!graph) {
      return NextResponse.json(
        { error: 'Concept graph not found' },
        { status: 404 },
      );
    }

    const { groups } = workbenchGroups({ nodes: graph.nodes, edges: [] });
    const groupNodes = groups.get(groupName) ?? [];

    if (groupNodes.length === 0) {
      return NextResponse.json(
        { error: 'No nodes found in this group' },
        { status: 404 },
      );
    }

    const docContext = doc?.content
      ? topicContext(doc.content, groupNodes)
      : '';
    const conceptList = groupNodes
      .map((n) => `- "${n.label}": ${n.definition}`)
      .join('\n');
    const nursingPacket =
      studyMode === 'nursing' ? compileNclexReferencePacket(docContext) : null;
    const nursingPacketText = nursingPacket?.packetText ?? '';

    const response = await ai.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [
        {
          role: 'system',
          content: `You are an expert educator creating deep-study content for a group of related concepts. Generate content that teaches these concepts together, emphasizing how they connect.

You MUST respond with valid JSON in exactly this format:
{
  "brief": "Educational explanation in sectioned HTML (see rules below).",
  "glossary": [
    { "term": "Key Term", "definition": "Short plain-language definition.", "context": "Example sentence using the term naturally." }
  ],
  "inquiry_questions": [
    {
      "question": "A Socratic question testing understanding. Use <strong> tags to highlight key terms.",
      "idealAnswer": "Expected answer in 1-3 sentences",
      "hints": ["Directional hint pointing to the right section", "Aggressive hint that nearly gives the answer away"],
      "keyTerms": ["term1", "term2", "term3"],
      "briefSection": "Title of the <h3> section containing the answer"
    }
  ],
  "application_questions": [
    { "question": "A new source-grounded scenario requiring prediction, comparison, or explaining a failure.", "idealAnswer": "Reasoning and expected conclusion.", "hints": ["One directional hint"], "keyTerms": [], "briefSection": "" }
  ],
  "faded_blanks": [
    {
      "textBefore": "Text before the blank: ",
      "answer": "key term or phrase",
      "textAfter": " continues with context."
    }
  ],
  "engineering_problems": [
    {
      "problem": "A quantitative problem requiring calculation.",
      "givenData": ["mass = 5 kg", "velocity = 10 m/s"],
      "answer": 250,
      "unit": "J",
      "tolerance": 5,
      "solutionSteps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."]
    }
  ],
  "nclex_questions": [
    {
      "scenario": "Brief patient scenario or care setting context.",
      "question": "An NCLEX-style question asking for the best nursing action.",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 1,
      "rationale": "Best answer: ... Wrong options: A) ... B) ... C) ... D) ... Rule: ..."
    }
  ],
  "requiredConcepts": ["concept label 1", "concept label 2"],
  "optionalConcepts": ["concept label 3"]
}

Rules:
- BRIEF FORMAT: Structure the brief as 3-5 short sections with <h3> headings and concise paragraphs.
- LANGUAGE STYLE: Write clearly and accessibly.
- Every inquiry question must be answerable from the brief.
- Generate 4 inquiry questions, 2 application_questions, and 3 faded blanks.
- Keep the brief to 300-500 words: the core idea, a concrete worked example with reasoning, and a common misconception. Include how these concepts connect. Avoid repeated definitions.
- Inquiry questions test explanation and causal reasoning, not copying a sentence. Do not bold or reveal the answer inside a question.
- Application questions must use a new situation, compare related concepts, or predict what fails when assumptions change. Include the essential reasoning in idealAnswer. Never require unsupported outside knowledge.
- Hints should guide reasoning without giving away the answer.
- Include all facts needed for practice in the brief. Keep examples and explanations aligned to the uploaded source.
- engineering_problems: If study mode is "engineers", generate 2-3 quantitative problems when concepts are quantitative. Otherwise set to [].
- nclex_questions: If study mode is "nursing", generate at least 5 NCLEX-style questions. Otherwise set to [].
  - Use client-centered nursing language
  - Keep one best answer with plausible distractors
  - Include concrete clinical context in the scenario or stem
  - Keep most questions focused on the best nursing action or priority action, but include some alternate stems such as need for further teaching, immediate follow-up, delegation, reassessment, or expected outcome
  - Answer choices must be four distinct plausible nursing actions or interpretations, not binary increase/decrease style opposites
  - Do not reveal the answer by repeating the diagnosis, intervention, or teaching point from the correct option in the scenario or stem
  - Spread correct answers across A, B, C, and D instead of clustering them
  - Make rationales explain why the key is right and why the distractors are wrong
  - Stem-style guidance:
${getNclexStemStyleInstructions()}
  - Follow this guidance:
${nursingPacketText}
- Classify concepts as REQUIRED or OPTIONAL.
- Respond ONLY with the JSON object.`,
        },
        {
          role: 'user',
          content: `Generate group study content for the "${groupName}" concept group in ${studyMode} mode.

Concepts in this group:
${conceptList}

${docContext ? `Document context (from "${doc?.filename}"):\n${docContext}` : ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_completion_tokens: 5000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content from OpenAI API');
    }

    const parsed = JSON.parse(content) as {
      brief?: string;
      glossary?: { term: string; definition: string; context: string }[];
      inquiry_questions?: {
        question: string;
        idealAnswer: string;
        hints: string[];
        keyTerms?: string[];
        briefSection?: string;
      }[];
      application_questions?: import('@/types').InquiryQuestion[];
      faded_blanks?: {
        textBefore: string;
        answer: string;
        textAfter: string;
      }[];
      engineering_problems?: {
        problem: string;
        givenData: string[];
        answer: number;
        unit: string;
        tolerance: number;
        solutionSteps: string[];
      }[];
      nclex_questions?: NclexQuestion[];
      requiredConcepts?: string[];
    };

    if (
      !parsed.brief?.trim() ||
      !Array.isArray(parsed.inquiry_questions) ||
      parsed.inquiry_questions.length < 2 ||
      parsed.inquiry_questions.some(
        (q) =>
          !q ||
          typeof q.question !== 'string' ||
          typeof q.idealAnswer !== 'string' ||
          !q.idealAnswer.trim(),
      ) ||
      !Array.isArray(parsed.application_questions) ||
      parsed.application_questions.length < 2 ||
      parsed.application_questions.some(
        (q) =>
          !q ||
          typeof q.question !== 'string' ||
          typeof q.idealAnswer !== 'string' ||
          !q.idealAnswer.trim(),
      )
    )
      throw new Error(
        'The lesson did not contain usable practice. Please retry.',
      );
    const inquiryQuestions = (parsed.inquiry_questions || []).map((q) => ({
      ...q,
      hints: Array.isArray(q.hints)
        ? q.hints.filter((h) => typeof h === 'string')
        : [],
      keyTerms: Array.isArray(q.keyTerms)
        ? q.keyTerms.filter((t) => typeof t === 'string')
        : [],
      briefSection: q.briefSection ?? '',
    }));

    const applicationQuestions = parsed
      .application_questions!.slice(0, 2)
      .map((q) => ({
        ...q,
        hints: Array.isArray(q.hints)
          ? q.hints.filter((h) => typeof h === 'string')
          : [],
        keyTerms: [],
        briefSection: typeof q.briefSection === 'string' ? q.briefSection : '',
      }));
    const engineeringProblems = (
      Array.isArray(parsed.engineering_problems)
        ? parsed.engineering_problems
        : []
    ).filter(
      (p) =>
        p &&
        typeof p.problem === 'string' &&
        Number.isFinite(p.answer) &&
        Number.isFinite(p.tolerance) &&
        p.tolerance >= 0 &&
        typeof p.unit === 'string' &&
        Array.isArray(p.givenData) &&
        p.givenData.every((v) => typeof v === 'string') &&
        Array.isArray(p.solutionSteps) &&
        p.solutionSteps.every((v) => typeof v === 'string'),
    );
    const glossary = (
      Array.isArray(parsed.glossary) ? parsed.glossary : []
    ).filter(
      (entry) =>
        entry &&
        typeof entry.term === 'string' &&
        typeof entry.definition === 'string' &&
        typeof entry.context === 'string',
    );
    const fadedBlanks = (
      Array.isArray(parsed.faded_blanks) ? parsed.faded_blanks : []
    ).filter(
      (blank) =>
        blank &&
        typeof blank.textBefore === 'string' &&
        typeof blank.answer === 'string' &&
        typeof blank.textAfter === 'string',
    );
    const labelToId = new Map(
      groupNodes.map((n) => [n.label.toLowerCase(), n.id]),
    );
    const requiredNodeIds = (
      Array.isArray(parsed.requiredConcepts) ? parsed.requiredConcepts : []
    )
      .filter((l) => typeof l === 'string')
      .map((l) => labelToId.get(l.toLowerCase()))
      .filter((id: string | undefined): id is string => !!id);

    const finalRequired =
      requiredNodeIds.length > 0
        ? requiredNodeIds
        : groupNodes.map((n) => n.id);

    let nclexQuestions = (
      Array.isArray(parsed.nclex_questions) ? parsed.nclex_questions : []
    )
      .filter(isStrongNclexQuestion)
      .map(randomizeNclexQuestion);

    if (studyMode === 'nursing' && nclexQuestions.length < 5) {
      const supplemental = await generateSupplementalNclexQuestions(
        groupName,
        conceptList,
        docContext,
        5 - nclexQuestions.length,
        nclexQuestions,
        nursingPacketText,
      );
      nclexQuestions = [...nclexQuestions, ...supplemental];
    }

    if (studyMode === 'nursing') {
      nclexQuestions = await refineNclexQuestions(
        nclexQuestions.slice(0, Math.max(5, nclexQuestions.length)),
        groupName,
        conceptList,
        docContext,
        nursingPacketText,
      );
      if (nclexQuestions.length < 5) {
        const topOff = await generateSupplementalNclexQuestions(
          groupName,
          conceptList,
          docContext,
          5 - nclexQuestions.length,
          nclexQuestions,
          nursingPacketText,
        );
        nclexQuestions = [...nclexQuestions, ...topOff];
      }
    }

    const { data: saved, error: saveError } = await database
      .from('workbench_content')
      .insert({
        document_id: documentId,
        group_name: groupName,
        brief_html: parsed.brief || '',
        inquiry_questions: inquiryQuestions,
        application_questions: applicationQuestions,
        faded_blanks: fadedBlanks,
        engineering_problems: engineeringProblems,
        nclex_questions: studyMode === 'nursing' ? nclexQuestions : [],
        glossary,
        node_ids: groupNodes.map((n) => n.id),
        required_node_ids: finalRequired,
      })
      .select()
      .single();

    if (saveError) {
      if (saveError.code === '23505') {
        const { data: racedContent, error: refetchError } = await database
          .from('workbench_content')
          .select('*')
          .eq('document_id', documentId)
          .eq('group_name', groupName)
          .maybeSingle();

        if (refetchError) {
          throw refetchError;
        }

        if (racedContent) {
          return NextResponse.json({ ...racedContent, study_mode: studyMode });
        }
      }

      throw saveError;
    }

    return NextResponse.json({ ...saved, study_mode: studyMode });
  } catch (error) {
    console.error('Workbench content error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load content',
      },
      { status: 500 },
    );
  }
}

// Share concurrent renders/retries on this server; the existing unique key also
// protects persistence if separate server instances finish simultaneously.
const preparing = new Map<string, Promise<{ status: number; body: unknown }>>();
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const group = request.nextUrl.searchParams.get('group');
  if (!validGroup(group))
    return NextResponse.json(
      { error: 'Choose a topic from the workbench.' },
      { status: 400 },
    );
  const key = JSON.stringify([documentId, group]);
  let pending = preparing.get(key);
  if (!pending) {
    pending = prepareLesson(request, context).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    preparing.set(key, pending);
    void pending.finally(() => preparing.delete(key)).catch(() => {});
  }
  const result = await pending;
  return NextResponse.json(result.body, { status: result.status });
}
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Use the learning session to record practice; reading alone does not demonstrate recall.',
    },
    { status: 410 },
  );
}
