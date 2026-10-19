ALTER TABLE public."mnemo-workbench_content"
  ADD COLUMN application_questions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(application_questions) = 'array');
CREATE TABLE public."mnemo-workbench_sessions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  content_id uuid NOT NULL REFERENCES public."mnemo-workbench_content"(id) ON DELETE CASCADE,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  revision integer NOT NULL DEFAULT 0,
  next_review_at timestamptz,
  interval_days integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, group_name)
);
CREATE INDEX "mnemo-workbench-reviews-due"
  ON public."mnemo-workbench_sessions" (document_id, next_review_at);
