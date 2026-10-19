-- Earlier application versions pre-stringified JSONB parameters. Decode those
-- strings without regenerating material or changing record IDs/study history.
CREATE FUNCTION public."mnemo-repair-json-array"(value jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE depth integer := 0;
BEGIN
  WHILE jsonb_typeof(value) = 'string' AND depth < 4 LOOP
    value := (value #>> '{}')::jsonb;
    depth := depth + 1;
  END LOOP;
  IF value IS NOT NULL AND jsonb_typeof(value) <> 'array' THEN
    RAISE EXCEPTION 'Mnemo JSON repair expected an array; no data was discarded';
  END IF;
  RETURN value;
END;
$$;

-- Explicit allowlist: never inspect or modify another application's tables.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('mnemo-concept_graphs', 'nodes'),
    ('mnemo-concept_graphs', 'edges'),
    ('mnemo-quiz_questions', 'choices'),
    ('mnemo-quiz_questions', 'correct_answers'),
    ('mnemo-quiz_attempts', 'answers'),
    ('mnemo-chat_conversations', 'messages'),
    ('mnemo-workbench_content', 'inquiry_questions'),
    ('mnemo-workbench_content', 'faded_blanks'),
    ('mnemo-workbench_content', 'engineering_problems'),
    ('mnemo-workbench_content', 'nclex_questions'),
    ('mnemo-workbench_content', 'glossary'),
    ('mnemo-workbench_content', 'node_ids'),
    ('mnemo-workbench_content', 'required_node_ids')
  ) AS fields(table_name, column_name)
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = public."mnemo-repair-json-array"(%I) WHERE jsonb_typeof(%I) = ''string''',
      item.table_name, item.column_name, item.column_name, item.column_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (jsonb_typeof(%I) = ''array'')',
      item.table_name, item.table_name || '-' || item.column_name || '-array', item.column_name
    );
  END LOOP;
END;
$$;
DROP FUNCTION public."mnemo-repair-json-array"(jsonb);
