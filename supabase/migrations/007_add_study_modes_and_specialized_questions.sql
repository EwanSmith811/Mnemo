alter table documents
  add column if not exists study_mode text not null default 'engineers'
    check (study_mode in ('nursing', 'engineers'));

alter table workbench_content
  add column if not exists nclex_questions jsonb not null default '[]'::jsonb;

alter table quiz_questions
  drop constraint if exists quiz_questions_question_type_check;

alter table quiz_questions
  add constraint quiz_questions_question_type_check
    check (question_type in ('mcq', 'multiple_select', 'short_answer', 'nclex', 'engineering'));

alter table quiz_questions
  add column if not exists numeric_answer double precision;

alter table quiz_questions
  add column if not exists answer_tolerance double precision;

alter table quiz_questions
  add column if not exists answer_unit text;
