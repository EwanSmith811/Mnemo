export interface Document {
  id: string;
  filename: string;
  file_type: "pdf" | "pptx";
  study_mode: StudyMode;
  file_size_bytes: number | null;
  extracted_text_length: number | null;
  flashcard_count: number;
  quiz_question_count: number;
  topic_summary_count: number;
  concept_node_count: number;
  status: "processing" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: string;
  document_id: string;
  term: string;
  definition: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review_date: string;
  last_reviewed_at: string | null;
  created_at: string;
}

export type StudyMode = "nursing" | "engineers";

export type QuestionType =
  | "mcq"
  | "multiple_select"
  | "short_answer"
  | "nclex"
  | "engineering";

export interface QuizQuestion {
  id: string;
  document_id: string;
  question: string;
  question_type: QuestionType;
  choices: string[];
  correct_answer: number;
  correct_answers: number[] | null;
  correct_answer_text: string | null;
  numeric_answer: number | null;
  answer_tolerance: number | null;
  answer_unit: string | null;
  explanation: string | null;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  document_id: string;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  answers: QuizAnswer[];
  completed_at: string;
}

export interface QuizAnswer {
  question_id: string;
  question_type: QuestionType;
  selected_answer: number;
  selected_answers: number[];
  typed_answer: string;
  is_correct: boolean;
}

export interface TopicSummary {
  id: string;
  document_id: string;
  topic_name: string;
  summary: string;
  display_order: number;
  created_at: string;
}

export interface QuizSettings {
  questionCount: number;
  questionTypes: QuestionType[];
}

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface GeneratedContent {
  flashcards: { term: string; definition: string }[];
  quiz_questions: {
    question: string;
    question_type: QuestionType;
    choices: string[];
    correct_answer: number;
    correct_answers: number[];
    correct_answer_text: string;
    numeric_answer?: number | null;
    answer_tolerance?: number | null;
    answer_unit?: string | null;
    explanation: string;
  }[];
  topic_summaries: {
    topic_name: string;
    summary: string;
    display_order: number;
  }[];
}

export interface ConceptNode {
  id: string;
  label: string;
  definition: string;
  group: string;
}

export interface ConceptEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface ConceptGraphRow {
  id: string;
  document_id: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  created_at: string;
}

// ── Workbench types ───────────────────────────────────────────────

export interface FadedBlank {
  textBefore: string;
  answer: string;
  textAfter: string;
}

export interface InquiryQuestion {
  question: string;
  idealAnswer: string;
  hints: string[];
  keyTerms: string[];
  briefSection: string; // which <h3> section contains the answer
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  context: string; // example sentence using the term
}

export interface EngineeringProblem {
  problem: string;
  givenData: string[];
  answer: number;
  unit: string;
  tolerance: number;
  solutionSteps: string[];
}

export interface NclexQuestion {
  scenario: string;
  question: string;
  choices: string[];
  correct_answer: number;
  rationale: string;
}

export interface WorkbenchContent {
  id: string;
  document_id: string;
  group_name: string;
  study_mode?: StudyMode;
  brief_html: string;
  inquiry_questions: InquiryQuestion[];
  faded_blanks: FadedBlank[];
  engineering_problems: EngineeringProblem[];
  nclex_questions: NclexQuestion[];
  glossary: GlossaryEntry[];
  node_ids: string[];
  required_node_ids: string[];
  created_at: string;
}

export interface WorkbenchMastery {
  id: string;
  document_id: string;
  group_name: string;
  stage_completed: number;
  updated_at: string;
}

export interface WorkbenchGroupStatus {
  group: string;
  nodeIds: string[];
  nodeLabels: string[];
  requiredNodeIds: string[];
  stageCompleted: number;
  hasContent: boolean;
}
