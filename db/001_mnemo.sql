-- Additive PostgreSQL schema. Only Mnemo-owned objects are created.
-- Applied atomically and exactly once by scripts/migrate.mjs.
CREATE TABLE public."mnemo-documents" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'pptx')),
  study_mode text NOT NULL CHECK (study_mode IN ('nursing', 'engineers')),
  file_size_bytes integer,
  extracted_text_length integer,
  content text,
  flashcard_count integer NOT NULL DEFAULT 0,
  quiz_question_count integer NOT NULL DEFAULT 0,
  topic_summary_count integer NOT NULL DEFAULT 0,
  concept_node_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-documents-created" ON public."mnemo-documents" (created_at DESC);
CREATE TABLE public."mnemo-flashcards" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  term text NOT NULL,
  definition text NOT NULL,
  ease_factor real NOT NULL DEFAULT 2.5,
  interval integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  next_review_date timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-flashcards-due" ON public."mnemo-flashcards"(document_id, next_review_date);
CREATE TABLE public."mnemo-quiz_questions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  question text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'multiple_select', 'short_answer', 'nclex', 'engineering')),
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer integer NOT NULL DEFAULT -1,
  correct_answers jsonb,
  correct_answer_text text,
  numeric_answer double precision,
  answer_tolerance double precision,
  answer_unit text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-quiz-questions-document" ON public."mnemo-quiz_questions"(document_id);
CREATE TABLE public."mnemo-quiz_attempts" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  total_questions integer NOT NULL,
  correct_answers integer NOT NULL,
  score_percentage real NOT NULL,
  answers jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-quiz-attempts-document" ON public."mnemo-quiz_attempts"(document_id);
CREATE TABLE public."mnemo-topic_summaries" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  topic_name text NOT NULL,
  summary text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-summaries-order" ON public."mnemo-topic_summaries"(document_id, display_order);
CREATE TABLE public."mnemo-concept_graphs" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."mnemo-chat_conversations" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-conversations-recent" ON public."mnemo-chat_conversations"(document_id, updated_at DESC);
CREATE TABLE public."mnemo-workbench_content" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  brief_html text NOT NULL,
  inquiry_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  faded_blanks jsonb NOT NULL DEFAULT '[]'::jsonb,
  engineering_problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  nclex_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  glossary jsonb NOT NULL DEFAULT '[]'::jsonb,
  node_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_node_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, group_name)
);
CREATE TABLE public."mnemo-workbench_mastery" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  stage_completed integer NOT NULL DEFAULT 0 CHECK (stage_completed BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, group_name)
);

-- Counts update with the same transaction as material changes, including
-- concurrent inserts, rather than trusting a stale count read by an API route.
CREATE FUNCTION public."mnemo-sync-document-counts"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE doc uuid; delta integer;
BEGIN
  IF TG_OP = 'INSERT' THEN doc := NEW.document_id; delta := 1;
  ELSE doc := OLD.document_id; delta := -1;
  END IF;
  IF TG_TABLE_NAME = 'mnemo-flashcards' THEN
    UPDATE public."mnemo-documents" SET flashcard_count = greatest(0, flashcard_count + delta), updated_at = now() WHERE id = doc;
  ELSIF TG_TABLE_NAME = 'mnemo-quiz_questions' THEN
    UPDATE public."mnemo-documents" SET quiz_question_count = greatest(0, quiz_question_count + delta), updated_at = now() WHERE id = doc;
  ELSIF TG_TABLE_NAME = 'mnemo-topic_summaries' THEN
    UPDATE public."mnemo-documents" SET topic_summary_count = greatest(0, topic_summary_count + delta), updated_at = now() WHERE id = doc;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "mnemo-flashcard-count" AFTER INSERT OR DELETE ON public."mnemo-flashcards"
  FOR EACH ROW EXECUTE FUNCTION public."mnemo-sync-document-counts"();
CREATE TRIGGER "mnemo-question-count" AFTER INSERT OR DELETE ON public."mnemo-quiz_questions"
  FOR EACH ROW EXECUTE FUNCTION public."mnemo-sync-document-counts"();
CREATE TRIGGER "mnemo-summary-count" AFTER INSERT OR DELETE ON public."mnemo-topic_summaries"
  FOR EACH ROW EXECUTE FUNCTION public."mnemo-sync-document-counts"();
