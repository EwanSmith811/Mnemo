import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { groq } from "@/lib/groq";
import {
  compileNclexReferencePacket,
  getNclexExplanationFormatInstructions,
  getNclexQualityChecklist,
  getNclexStemStyleInstructions,
} from "@/lib/nclex-guidance";
import { questionLeaksCorrectAnswer, shuffleSingleAnswerChoices } from "@/lib/nclex-utils";
import type { ConceptNode, NclexQuestion, StudyMode } from "@/types";

function compactGuidance(text: string, maxChars = 2200) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function looksLikeBinaryOppositeOptions(choices: string[]) {
  const normalized = choices.map((choice) => choice.trim().toLowerCase());
  const oppositePatterns = [
    ["increase", "decrease"],
    ["higher", "lower"],
    ["more", "less"],
    ["raise", "lower"],
    ["up", "down"],
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
    "client",
    "patient",
    "nurse",
    "assessment",
    "findings",
    "reports",
    "vital signs",
    "admitted",
    "postoperative",
    "provider",
    "history",
    "symptom",
    "priority",
    "delegat",
  ].some((marker) => normalized.includes(marker));
}

function isValidNclexQuestion(question: NclexQuestion) {
  return (
    typeof question.scenario === "string" &&
    typeof question.question === "string" &&
    Array.isArray(question.choices) &&
    question.choices.length === 4 &&
    typeof question.correct_answer === "number" &&
    question.correct_answer >= 0 &&
    question.correct_answer <= 3 &&
    typeof question.rationale === "string"
  );
}

function isStrongNclexQuestion(question: NclexQuestion) {
  return (
    isValidNclexQuestion(question) &&
    hasClinicalContext(`${question.scenario} ${question.question}`) &&
    !looksLikeBinaryOppositeOptions(question.choices) &&
    !questionLeaksCorrectAnswer(question.question, question.choices[question.correct_answer] || "", question.scenario) &&
    new Set(question.choices.map((choice) => choice.trim().toLowerCase())).size === 4
  );
}

function randomizeNclexQuestion(question: NclexQuestion) {
  return shuffleSingleAnswerChoices(question, "rationale");
}

async function generateSupplementalNclexQuestions(
  groupName: string,
  conceptList: string,
  docContext: string,
  missingCount: number,
  existingQuestions: NclexQuestion[],
  nursingPacketText: string
): Promise<NclexQuestion[]> {
  const avoidList = existingQuestions.map((q, index) => `${index + 1}. ${q.question}`).join("\n");

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
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
- ${getNclexExplanationFormatInstructions().replace("explanation", "rationale")}
- Follow this curated guidance:
${compactGuidance(nursingPacketText)}
- Do not repeat or closely paraphrase any existing questions
- Respond only with JSON`,
        },
        {
          role: "user",
          content: `Concept group: "${groupName}"

Concepts:
${conceptList}

${docContext ? `Document context:\n${docContext.slice(0, 5000)}\n\n` : ""}Existing questions to avoid:
${avoidList || "None"}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
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
    console.error("Workbench supplemental NCLEX generation failed:", error);
    return [];
  }
}

async function refineNclexQuestions(
  questions: NclexQuestion[],
  groupName: string,
  conceptList: string,
  docContext: string,
  nursingPacketText: string
): Promise<NclexQuestion[]> {
  if (questions.length === 0) {
    return [];
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
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
          role: "user",
          content: `Concept group: "${groupName}"

Concepts:
${conceptList}

${docContext ? `Document context:\n${docContext.slice(0, 4000)}\n\n` : ""}Improve these NCLEX questions:
${JSON.stringify(questions)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return questions;
    }

    const parsed = JSON.parse(content) as { questions?: NclexQuestion[] };
    const refined = Array.isArray(parsed.questions) ? parsed.questions : questions;
    return refined.filter(isStrongNclexQuestion).map(randomizeNclexQuestion);
  } catch (error) {
    console.error("Workbench NCLEX refinement failed, falling back:", error);
    return questions;
  }
}

// GET — fetch or generate workbench content for a group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const groupName = request.nextUrl.searchParams.get("group");

    if (!groupName) {
      return NextResponse.json({ error: "group query param required" }, { status: 400 });
    }

    const { data: doc } = await supabase
      .from("documents")
      .select("content, filename, study_mode")
      .eq("id", documentId)
      .maybeSingle();

    const studyMode = (doc?.study_mode ?? "engineers") as StudyMode;

    const { data: existing } = await supabase
      .from("workbench_content")
      .select("*")
      .eq("document_id", documentId)
      .eq("group_name", groupName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ...existing, study_mode: studyMode });
    }

    const { data: graph } = await supabase
      .from("concept_graphs")
      .select("nodes")
      .eq("document_id", documentId)
      .maybeSingle();

    if (!graph) {
      return NextResponse.json({ error: "Concept graph not found" }, { status: 404 });
    }

    const allNodes = graph.nodes as ConceptNode[];
    const groupNodes = allNodes.filter((n) => n.group === groupName && n.id !== "central");

    if (groupNodes.length === 0) {
      return NextResponse.json({ error: "No nodes found in this group" }, { status: 404 });
    }

    const docContext = doc?.content ? doc.content.slice(0, 8000) : "";
    const conceptList = groupNodes
      .map((n) => `- "${n.label}": ${n.definition}`)
      .join("\n");
    const nursingPacket = studyMode === "nursing" ? compileNclexReferencePacket(docContext) : null;
    const nursingPacketText = nursingPacket?.packetText ?? "";

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
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
- Generate 4 inquiry questions and 6 faded blanks.
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
          role: "user",
          content: `Generate group study content for the "${groupName}" concept group in ${studyMode} mode.

Concepts in this group:
${conceptList}

${docContext ? `Document context (from "${doc?.filename}"):\n${docContext}` : ""}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 5000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content from Groq API");
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
      faded_blanks?: { textBefore: string; answer: string; textAfter: string }[];
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

    const inquiryQuestions = (parsed.inquiry_questions || []).map((q) => ({
      ...q,
      keyTerms: q.keyTerms ?? [],
      briefSection: q.briefSection ?? "",
    }));

    const labelToId = new Map(groupNodes.map((n) => [n.label.toLowerCase(), n.id]));
    const requiredNodeIds = (parsed.requiredConcepts ?? [])
      .map((l) => labelToId.get(l.toLowerCase()))
      .filter((id: string | undefined): id is string => !!id);

    const finalRequired = requiredNodeIds.length > 0 ? requiredNodeIds : groupNodes.map((n) => n.id);

    let nclexQuestions = (parsed.nclex_questions || [])
      .filter(isStrongNclexQuestion)
      .map(randomizeNclexQuestion);

    if (studyMode === "nursing" && nclexQuestions.length < 5) {
      const supplemental = await generateSupplementalNclexQuestions(
        groupName,
        conceptList,
        docContext,
        5 - nclexQuestions.length,
        nclexQuestions,
        nursingPacketText
      );
      nclexQuestions = [...nclexQuestions, ...supplemental];
    }

    if (studyMode === "nursing") {
      nclexQuestions = await refineNclexQuestions(
        nclexQuestions.slice(0, Math.max(5, nclexQuestions.length)),
        groupName,
        conceptList,
        docContext,
        nursingPacketText
      );
      if (nclexQuestions.length < 5) {
        const topOff = await generateSupplementalNclexQuestions(
          groupName,
          conceptList,
          docContext,
          5 - nclexQuestions.length,
          nclexQuestions,
          nursingPacketText
        );
        nclexQuestions = [...nclexQuestions, ...topOff];
      }
    }

    const { data: saved, error: saveError } = await supabase
      .from("workbench_content")
      .insert({
        document_id: documentId,
        group_name: groupName,
        brief_html: parsed.brief || "",
        inquiry_questions: inquiryQuestions,
        faded_blanks: parsed.faded_blanks || [],
        engineering_problems: parsed.engineering_problems || [],
        nclex_questions: studyMode === "nursing" ? nclexQuestions : [],
        glossary: parsed.glossary || [],
        node_ids: groupNodes.map((n) => n.id),
        required_node_ids: finalRequired,
      })
      .select()
      .single();

    if (saveError) {
      if (saveError.code === "23505") {
        const { data: racedContent, error: refetchError } = await supabase
          .from("workbench_content")
          .select("*")
          .eq("document_id", documentId)
          .eq("group_name", groupName)
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
    console.error("Workbench content error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load content" },
      { status: 500 }
    );
  }
}

// POST — update group mastery stage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const { group, stage } = await request.json();

    if (!group || typeof stage !== "number" || stage < 0 || stage > 3) {
      return NextResponse.json(
        { error: "group and stage (0-3) required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("workbench_mastery")
      .upsert(
        {
          document_id: documentId,
          group_name: group,
          stage_completed: stage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "document_id,group_name" }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, stage });
  } catch (error) {
    console.error("Workbench mastery error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update mastery" },
      { status: 500 }
    );
  }
}
