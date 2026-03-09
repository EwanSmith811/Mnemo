import { groq } from "./groq";
import type { ConceptGraph } from "@/types";

export async function generateConceptGraph(
  documentText: string,
  filename: string
): Promise<ConceptGraph> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are an expert educator that creates detailed concept maps from documents.
You will be given the text content of a document and must generate a comprehensive concept graph that visually organizes ALL key concepts and their relationships.

You MUST respond with valid JSON in exactly this format:
{
  "nodes": [
    {
      "id": "central",
      "label": "Main Topic Name",
      "definition": "2-3 sentence definition of the central/overarching concept.",
      "group": "Core"
    },
    {
      "id": "node_1",
      "label": "Sub Concept Name",
      "definition": "2-3 sentence definition of this concept.",
      "group": "Group Name"
    }
  ],
  "edges": [
    {
      "source": "central",
      "target": "node_1",
      "relationship": "Description of how these two concepts relate to each other"
    }
  ]
}

Rules:
- The first node MUST have id "central" and represent the overarching topic of the document
- You MUST generate AT LEAST 20 concept nodes, ideally 25-30. This is CRITICAL — do NOT generate fewer than 20 nodes.
- Group similar concepts together using the "group" field (use 4-6 group names). The "group" for the central node should be "Core".
- Node ids must be unique strings (use "central", "node_1", "node_2", etc.)
- Definitions should be concise but educational (2-3 sentences)

GRAPH STRUCTURE (MOST IMPORTANT):
- DO NOT create a star/spoke/hub pattern where every node just connects to the central node. This is the #1 mistake to avoid.
- The central node should connect to ONLY 3-5 major sub-topic nodes directly. NOT more.
- Sub-topic nodes are the real hubs — each should branch out to 3-6 child concepts.
- Child concepts MUST connect laterally to other child concepts, especially across different groups. This is what makes the graph look like a real knowledge web.
- Every node should have 2-5 connections total. A node with only 1 connection is too isolated.
- Aim for 50-70 edges total. At least 30% of edges should be CROSS-LINKS (connecting nodes in different groups that are not in a parent-child relationship).
- Think of it like a real nervous system: concepts influence each other in complex ways. If concept A relates to concept B, and concept B relates to concept C, then A probably also relates to C — add that edge.
- Create "bridge" connections: concepts from Group X that relate to concepts from Group Y. Every group should have at least 3 edges going to nodes in other groups.
- The resulting graph should look like an interconnected web/mesh, NOT a tree or star.

Respond ONLY with the JSON object, no additional text.`,
      },
      {
        role: "user",
        content: `Generate a concept graph from this document titled "${filename}":\n\n${documentText}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content returned from Groq API for concept graph");
  }

  const parsed: ConceptGraph = JSON.parse(content);

  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid concept graph structure from Groq API");
  }

  if (parsed.nodes.length < 10) {
    throw new Error("Concept graph has too few nodes");
  }

  // Validate all edges reference valid node IDs
  const nodeIds = new Set(parsed.nodes.map((n) => n.id));
  for (const edge of parsed.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge references invalid source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge references invalid target node: ${edge.target}`);
    }
  }

  return parsed;
}
