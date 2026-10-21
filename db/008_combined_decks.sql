-- Study sets built from several decks (up to 10) uploaded together.
-- Additive: existing single-deck documents keep part 0 and work unchanged.

-- Each file of a multi-deck upload is read in its own request (keeping every
-- request under the hosting body limit) and parked here until the set is built.
CREATE TABLE public."mnemo-upload_parts" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'pptx', 'ppt', 'pps', 'ppsx')),
  file_size_bytes integer NOT NULL,
  data_base64 text NOT NULL CHECK (length(data_base64) <= 5592408),
  text text NOT NULL,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slides) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mnemo-upload-parts-created" ON public."mnemo-upload_parts" (created_at);

-- How many decks a document was built from.
ALTER TABLE public."mnemo-documents"
  ADD COLUMN part_count integer NOT NULL DEFAULT 1 CHECK (part_count BETWEEN 1 AND 10);

-- One original file per deck. `part` is the deck's order within the set.
ALTER TABLE public."mnemo-document_sources"
  ADD COLUMN part integer NOT NULL DEFAULT 0 CHECK (part BETWEEN 0 AND 9),
  ADD COLUMN filename text NOT NULL DEFAULT '';
ALTER TABLE public."mnemo-document_sources"
  DROP CONSTRAINT "mnemo-document_sources_document_id_key";
ALTER TABLE public."mnemo-document_sources"
  ADD CONSTRAINT "mnemo-document_sources_document_part_key" UNIQUE (document_id, part);

-- Which deck a slide came from; source_number stays its page within that deck.
ALTER TABLE public."mnemo-document_slides"
  ADD COLUMN part integer NOT NULL DEFAULT 0 CHECK (part BETWEEN 0 AND 9);
