import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { groq } from "@/lib/groq";
import type { ConceptNode } from "@/types";

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

    // Check if content already exists for this group
    const { data: existing } = await supabase
      .from("workbench_content")
      .select("*")
      .eq("document_id", documentId)
      .eq("group_name", groupName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(existing);
    }

    // Fetch the concept graph to get all nodes in this group
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

    // Fetch document content for richer context
    const { data: doc } = await supabase
      .from("documents")
      .select("content, filename")
      .eq("id", documentId)
      .maybeSingle();

    const docContext = doc?.content ? doc.content.slice(0, 8000) : "";

    // Build concept list for the prompt
    const conceptList = groupNodes
      .map((n) => `- "${n.label}": ${n.definition}`)
      .join("\n");

    // Generate via Groq — group-level content with required/optional classification
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
  "requiredConcepts": ["concept label 1", "concept label 2"],
  "optionalConcepts": ["concept label 3"]
}

Rules:
- BRIEF FORMAT: Structure the brief as 3-5 SHORT sections, each with an <h3> title and 1-2 concise paragraphs wrapped in <p> tags. Example:
  <h3>What is [Concept]?</h3><p>Short, clear explanation...</p>
  <h3>How [Concept A] connects to [Concept B]</h3><p>Short explanation...</p>
  <h3>Why this matters</h3><p>Real-world significance...</p>
- LANGUAGE STYLE: Write at a clear accessible level — like explaining to a smart friend, not a textbook. Use short sentences (under 20 words when possible). Avoid jargon unless defining it. Wrap key vocabulary in <strong> tags on first use.
- Each section should be self-contained and digestible in ~15 seconds of reading.
- ANSWERS IN THE BRIEF: CRITICAL — every inquiry question's answer MUST be clearly stated or directly derivable from the brief. If a student reads the brief carefully, they should be able to answer every inquiry question. Do NOT ask questions requiring outside knowledge.
- GLOSSARY: Include 4-8 key vocabulary terms from the brief. Each entry needs a plain-language definition and a contextual example sentence. These should correspond to the <strong> terms in the brief.
- INQUIRY QUESTIONS:
  - Generate 4 questions that test deep understanding across the group.
  - briefSection: must exactly match one of the <h3> titles in the brief where the answer is found.
  - HINTS — exactly 2 per question:
    - Hint 1: A directional nudge — tell the student which section or concept to re-read. Example: "Look at how [Concept A] relates to [Concept B] in the brief."
    - Hint 2: An aggressive giveaway — restate the answer with one key word blanked out, or provide all but the final connecting idea. Example: "The answer involves _____ causing reduced blood flow, which leads to..."
  - keyTerms: 3-5 essential words/phrases for client-side validation. Choose specific, unambiguous terms.
- Generate 6 faded blanks spanning all concepts (single-word or short-phrase answers, 1-3 words).
- engineering_problems: Generate 2-3 quantitative problems if concepts are quantitative. Otherwise set to [].
  - Each problem must have a clear numerical answer
  - tolerance is the acceptable error margin (e.g., 5 means ±5)
  - solutionSteps should walk through the complete calculation
  - Use realistic values and proper units
- Classify concepts as REQUIRED (core, must-know) or OPTIONAL (supplementary, nice-to-know).
  - At least half should be REQUIRED
  - requiredConcepts and optionalConcepts must exactly match the provided concept labels
- Respond ONLY with the JSON object, no additional text.`,
        },
        {
          role: "user",
          content: `Generate group study content for the "${groupName}" concept group.

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

    const parsed = JSON.parse(content);

    // Ensure keyTerms and briefSection exist on all inquiry questions (fallback for older LLM output)
    const inquiryQuestions = (parsed.inquiry_questions || []).map(
      (q: { question: string; idealAnswer: string; hints: string[]; keyTerms?: string[]; briefSection?: string }) => ({
        ...q,
        keyTerms: q.keyTerms ?? [],
        briefSection: q.briefSection ?? "",
      })
    );

    // Map required/optional labels back to node IDs
    const labelToId = new Map(groupNodes.map((n) => [n.label.toLowerCase(), n.id]));
    const requiredLabels: string[] = parsed.requiredConcepts ?? [];
    const requiredNodeIds = requiredLabels
      .map((l: string) => labelToId.get(l.toLowerCase()))
      .filter((id: string | undefined): id is string => !!id);

    // If LLM didn't classify properly, default: all nodes are required
    const finalRequired = requiredNodeIds.length > 0
      ? requiredNodeIds
      : groupNodes.map((n) => n.id);

    // Store in DB
    const { data: saved, error: saveError } = await supabase
      .from("workbench_content")
      .insert({
        document_id: documentId,
        group_name: groupName,
        brief_html: parsed.brief || "",
        inquiry_questions: inquiryQuestions,
        faded_blanks: parsed.faded_blanks || [],
        engineering_problems: parsed.engineering_problems || [],
        glossary: parsed.glossary || [],
        node_ids: groupNodes.map((n) => n.id),
        required_node_ids: finalRequired,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return NextResponse.json(saved);
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

    // Upsert mastery for the group
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

    if (error) throw error;

    return NextResponse.json({ success: true, stage });
  } catch (error) {
    console.error("Workbench mastery error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update mastery" },
      { status: 500 }
    );
  }
}
