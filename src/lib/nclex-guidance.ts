const NCLEX_CURATED_SOURCES = [
  {
    title: "2026 NCLEX-RN Test Plan",
    url: "https://www.ncsbn.org/publications/2026-nclex-rn-test-plan",
    authority: "NCSBN",
    focus: [
      "Client Needs categories",
      "safe and effective care",
      "clinical judgment emphasis",
    ],
  },
  {
    title: "NCLEX-RN Test Plan PDF (2026)",
    url: "https://www.ncsbn.org/public-files/2026_RN_Test-Plan_English-F.pdf",
    authority: "NCSBN",
    focus: [
      "content distribution",
      "management of care",
      "safety and infection prevention",
    ],
  },
  {
    title: "Clinical Judgment Measurement Model",
    url: "https://www.nclex.com/clinical-judgment-measurement-model.page",
    authority: "NCSBN / NCLEX",
    focus: [
      "recognize cues",
      "analyze cues",
      "prioritize hypotheses",
      "generate solutions",
      "take action",
      "evaluate outcomes",
    ],
  },
  {
    title: "Building a Method for Writing Clinical Judgment Items for Entry-Level Nursing Exams",
    url: "https://www.ncsbn.org/publications/building-a-method-for-writing-clinical-judgment-items-for-entry-Level-nursing-exams",
    authority: "NCSBN",
    focus: [
      "clinical judgment item design",
      "entry-level nursing decisions",
      "case-based reasoning",
    ],
  },
  {
    title: "Delegation",
    url: "https://www.ncsbn.org/nursing-regulation/practice/delegation.page",
    authority: "NCSBN",
    focus: [
      "delegation responsibilities",
      "assignment vs delegation",
      "RN, LPN/LVN, UAP roles",
    ],
  },
];

const GLOBAL_NCLEX_RULES = [
  "Use client-centered nursing language, not generic classroom wording.",
  "Favor realistic entry-level RN decision making over trivia recall.",
  "Make every option clinically plausible so the best answer wins on priority, safety, scope, or nursing process.",
  "Use single-best-answer logic. Avoid ties, absolutes, and cue words that make the key obvious.",
  "Prefer assessment before implementation when assessment is needed for safe care.",
  "When prioritizing, lean on ABCs, acute vs chronic, unstable vs stable, and immediate safety threats.",
  "When delegation appears, respect RN responsibility for assessment, teaching, evaluation, and unstable clients.",
  "Rationales must explain why the correct answer is best and why each distractor is less appropriate.",
];

const DISTRACTOR_RULES = [
  "Distractors should sound like reasonable nursing actions, but fail because they are lower priority, outside scope, premature, incomplete, or unsafe.",
  "Avoid joke answers, obviously reckless actions, or distractors that differ wildly in length or specificity.",
  "Avoid two answer choices that are nearly synonyms.",
  "Make wrong options fail for NCLEX-style reasons such as wrong priority, wrong sequencing, wrong delegation target, or wrong client focus.",
  "Do not use simplistic opposite-pair choices like increase/decrease, higher/lower, or more/less unless every option is embedded in a distinct clinical action.",
];

const RATIONALE_RULES = [
  "Explain the correct answer first in one direct sentence.",
  "Then explain each wrong option separately using explicit nursing reasoning.",
  "Name the rule being applied when relevant: ABCs, safety, nursing process, delegation, scope, unstable vs stable, acute vs chronic.",
  "Keep rationales concrete and document-aligned rather than generic test-prep filler.",
];

const STEM_STYLE_RULES = [
  "Most items should still ask for the best nursing action, priority action, or first action.",
  "Include some alternate clinical-judgment stems such as which finding needs immediate follow-up, which client statement shows need for further teaching, which task can be delegated, which assessment requires priority reassessment, or which outcome shows the intervention was effective.",
  "Use realistic nursing actions, client statements, findings, and delegation decisions instead of diagnosis giveaways or straight definition recall.",
];

const NCLEX_THEME_RULES = [
  {
    label: "Management of Care and Delegation",
    keywords: ["delegate", "delegation", "assignment", "uap", "cna", "lpn", "lvn", "charge", "supervise", "scope"],
    guidance: [
      "Use RN/LPN-LVN/UAP scope distinctions carefully.",
      "Keep unstable, newly admitted, freshly postoperative, or newly changing clients with the RN.",
      "Delegated tasks should be routine, predictable, and low risk when appropriate.",
    ],
  },
  {
    label: "Safety and Infection Prevention",
    keywords: ["isolation", "infection", "sterile", "ppe", "sepsis", "fall", "restraint", "safety", "aspiration"],
    guidance: [
      "Make immediate safety hazards outrank convenience or efficiency.",
      "Use infection-control steps in correct sequence.",
      "Prefer least restrictive, least invasive, and prevention-oriented choices when appropriate.",
    ],
  },
  {
    label: "Pharmacological and Parenteral Therapies",
    keywords: ["medication", "drug", "insulin", "anticoagulant", "iv", "infusion", "dose", "adverse", "contraindication"],
    guidance: [
      "Medication items should emphasize monitoring, contraindications, adverse effects, and safe administration.",
      "Wrong options should fail because they miss monitoring, timing, safety checks, or expected responses.",
    ],
  },
  {
    label: "Physiological Adaptation and Risk",
    keywords: ["airway", "breathing", "circulation", "hemodynamic", "shock", "bleeding", "oxygen", "respiratory", "chest pain"],
    guidance: [
      "ABCs and unstable-vs-stable logic should dominate priorities.",
      "Wrong answers can be clinically relevant but lower priority than preserving oxygenation, perfusion, or neurologic status.",
    ],
  },
  {
    label: "Health Promotion and Maintenance",
    keywords: ["prenatal", "newborn", "vaccination", "screening", "development", "teaching", "education", "prevention"],
    guidance: [
      "Use anticipatory guidance, prevention, and expected developmental or health-maintenance teaching.",
      "Wrong options should sound helpful but be mistimed, incomplete, or not client-centered.",
    ],
  },
  {
    label: "Psychosocial Integrity",
    keywords: ["anxiety", "depression", "grief", "therapeutic", "communication", "coping", "mental health", "suicide"],
    guidance: [
      "Use therapeutic communication principles and safety first.",
      "Distractors often fail because they block communication, give false reassurance, or shift focus away from the client.",
    ],
  },
];

export interface NclexReferencePacket {
  packetText: string;
  sourceText: string;
  activeThemes: string[];
}

function normalizeText(text: string) {
  return text.toLowerCase();
}

export function compileNclexReferencePacket(documentText: string): NclexReferencePacket {
  const normalized = normalizeText(documentText);
  const activeThemes = NCLEX_THEME_RULES
    .filter((theme) => theme.keywords.some((keyword) => normalized.includes(keyword)))
    .slice(0, 4);

  const fallbackThemes = activeThemes.length > 0
    ? activeThemes
    : NCLEX_THEME_RULES.filter((theme) =>
        ["Management of Care and Delegation", "Safety and Infection Prevention", "Physiological Adaptation and Risk"].includes(theme.label)
      );

  const sourceText = NCLEX_CURATED_SOURCES
    .map((source) => `- ${source.authority}: ${source.title} (${source.url}) | Focus: ${source.focus.join(", ")}`)
    .join("\n");

  const themeText = fallbackThemes
    .map((theme) => `- ${theme.label}: ${theme.guidance.join(" ")}`)
    .join("\n");

  const packetText = `Curated NCLEX guidance:
Sources:
${sourceText}

Global NCLEX item-writing rules:
${GLOBAL_NCLEX_RULES.map((rule) => `- ${rule}`).join("\n")}

Distractor-writing rules:
${DISTRACTOR_RULES.map((rule) => `- ${rule}`).join("\n")}

Rationale-writing rules:
${RATIONALE_RULES.map((rule) => `- ${rule}`).join("\n")}

Stem-style rules:
${STEM_STYLE_RULES.map((rule) => `- ${rule}`).join("\n")}

Document-relevant nursing themes:
${themeText}`;

  return {
    packetText,
    sourceText,
    activeThemes: fallbackThemes.map((theme) => theme.label),
  };
}

export function getNclexExplanationFormatInstructions() {
  return `Format each explanation as one compact paragraph using this structure:
Best answer: [why the correct option is best]. Wrong options: A) [why wrong], B) [why wrong], C) [why wrong], D) [why wrong]. Rule: [NCLEX rule or framework].`;
}

export function getNclexQualityChecklist() {
  return [
    "Client-centered nursing terminology is used naturally.",
    "Exactly one answer is clearly best.",
    "Distractors are plausible and fail for nursing-specific reasons.",
    "The question tests clinical judgment, prioritization, delegation, safety, or nursing process rather than obvious recall.",
    "The rationale explains both the correct answer and the distractors.",
    "The item aligns with the uploaded document content.",
    "The question includes enough clinical context to require judgment without revealing the answer.",
    "The answer choices are distinct nursing actions or interpretations, not just binary opposites.",
    "The stem does not directly reveal the correct answer by repeating the diagnosis, medication, or exact teaching point from the key option.",
    "The item set includes some stem variation beyond only asking for the most appropriate nursing action.",
  ].map((item) => `- ${item}`).join("\n");
}

export function getNclexStemStyleInstructions() {
  return STEM_STYLE_RULES.map((rule) => `- ${rule}`).join("\n");
}
