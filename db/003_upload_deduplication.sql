-- Identity is the actual study input plus study mode, independent of filename.
-- Retain existing duplicate documents and their study history; hide only their
-- extra library entries. Direct document links continue to work.
ALTER TABLE public."mnemo-documents"
  ADD COLUMN content_hash text,
  ADD COLUMN is_duplicate boolean NOT NULL DEFAULT false;

CREATE FUNCTION public."mnemo-hash-document-content"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_hash := encode(sha256(convert_to(NEW.content, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;
CREATE TRIGGER "mnemo-document-content-hash"
  BEFORE INSERT OR UPDATE OF content, content_hash ON public."mnemo-documents"
  FOR EACH ROW EXECUTE FUNCTION public."mnemo-hash-document-content"();
UPDATE public."mnemo-documents"
  SET content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex');
ALTER TABLE public."mnemo-documents" ADD CONSTRAINT "mnemo-document-content-hash-valid"
  CHECK (content_hash IS NOT DISTINCT FROM encode(sha256(convert_to(content, 'UTF8')), 'hex'));

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY content_hash, study_mode ORDER BY created_at, id
  ) AS position
  FROM public."mnemo-documents"
  WHERE status = 'completed' AND content_hash IS NOT NULL
)
UPDATE public."mnemo-documents" d SET is_duplicate = true
FROM ranked r WHERE r.id = d.id AND r.position > 1;

CREATE UNIQUE INDEX "mnemo-documents-unique-study-source"
  ON public."mnemo-documents" (content_hash, study_mode)
  WHERE status = 'completed' AND NOT is_duplicate;

-- Short atomic leases coordinate separate processes/tabs without holding a
-- database connection or transaction open while an AI request runs.
CREATE TABLE public."mnemo-upload_claims" (
  content_hash text NOT NULL,
  study_mode text NOT NULL CHECK (study_mode IN ('engineers', 'nursing')),
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (content_hash, study_mode)
);
