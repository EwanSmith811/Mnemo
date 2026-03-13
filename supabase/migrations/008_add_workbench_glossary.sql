alter table workbench_content
  add column if not exists glossary jsonb not null default '[]'::jsonb;
