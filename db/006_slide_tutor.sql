CREATE TABLE public."mnemo-document_slides" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  source_number integer NOT NULL CHECK (source_number >= 1),
  kind text NOT NULL CHECK (kind IN ('slide','page')),
  title text NOT NULL,
  text text NOT NULL,
  notes text NOT NULL DEFAULT '',
  text_truncated boolean NOT NULL DEFAULT false,
  UNIQUE(document_id, position)
);
CREATE TABLE public."mnemo-slide_explanations" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL UNIQUE REFERENCES public."mnemo-document_slides"(id) ON DELETE CASCADE,
  explanation jsonb NOT NULL CHECK (jsonb_typeof(explanation) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."mnemo-slide_threads" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL UNIQUE REFERENCES public."mnemo-document_slides"(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array'),
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."mnemo-document_sources" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public."mnemo-documents"(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('pdf','pptx','ppsx','ppt','pps')),
  data_base64 text NOT NULL,
  preview_pdf_base64 text,
  CHECK (length(data_base64) <= 5592408),
  CHECK (length(preview_pdf_base64) <= 22369624)
);
