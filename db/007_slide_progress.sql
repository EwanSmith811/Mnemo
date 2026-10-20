-- Per-slide learning state for the guided walkthrough. One row per slide.
-- 'seen' is recorded on open; 'shaky' and 'understood' come from the learner's
-- own rating after attempting the slide's self-check.
CREATE TABLE public."mnemo-slide_progress" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL UNIQUE REFERENCES public."mnemo-document_slides"(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('seen', 'shaky', 'understood')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-slide-progress-document"
  ON public."mnemo-slide_progress" (document_id);

-- Whether a slide is worth studying. Title, agenda, divider and closing slides
-- are marked 'skip' with a short reason; NULL means not yet checked.
ALTER TABLE public."mnemo-document_slides"
  ADD COLUMN relevance text CHECK (relevance IN ('core', 'skip')),
  ADD COLUMN relevance_reason text NOT NULL DEFAULT '';
