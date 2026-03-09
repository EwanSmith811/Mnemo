-- Workbench: pre-generated content per concept group
CREATE TABLE workbench_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  brief_html text NOT NULL,
  inquiry_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  faded_blanks jsonb NOT NULL DEFAULT '[]'::jsonb,
  engineering_problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  node_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_node_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_workbench_content_doc_group ON workbench_content(document_id, group_name);

-- Mastery tracking per group per document
CREATE TABLE workbench_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  stage_completed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_workbench_mastery_doc_group ON workbench_mastery(document_id, group_name);
