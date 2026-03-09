-- ============================================================
-- Migration 002: Topic Summaries, Quiz Question Types, Custom Flashcards
-- ============================================================

-- 1. New table: topic_summaries
create table topic_summaries (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  topic_name text not null,
  summary text not null,
  display_order integer not null default 0,
  created_at timestamp with time zone default now()
);

create index idx_topic_summaries_document_id on topic_summaries(document_id);

-- 2. Add question_type, correct_answers, correct_answer_text to quiz_questions
alter table quiz_questions
  add column question_type text not null default 'mcq'
    check (question_type in ('mcq', 'multiple_select', 'short_answer'));

alter table quiz_questions
  add column correct_answers jsonb;

alter table quiz_questions
  add column correct_answer_text text;

-- 3. Add topic_summary_count to documents
alter table documents
  add column topic_summary_count integer default 0;
