-- Extend only Mnemo's file-format constraint. Existing rows remain valid.
ALTER TABLE public."mnemo-documents"
  DROP CONSTRAINT "mnemo-documents_file_type_check";
ALTER TABLE public."mnemo-documents"
  ADD CONSTRAINT "mnemo-documents_file_type_check"
  CHECK (file_type IN ('pdf', 'pptx', 'ppt', 'pps', 'ppsx'));
