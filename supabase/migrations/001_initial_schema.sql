-- Drop existing tables (safe to re-run)
drop table if exists quiz_attempts cascade;
drop table if exists quiz_questions cascade;
drop table if exists flashcards cascade;
drop table if exists documents cascade;

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Documents: upload metadata
create table documents (
  id uuid primary key default uuid_generate_v4(),
  filename text not null,
  file_type text not null check (file_type in ('pdf', 'pptx')),
  file_size_bytes integer,
  extracted_text_length integer,
  flashcard_count integer default 0,
  quiz_question_count integer default 0,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  error_message text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Flashcards: term/definition with SM-2 spaced repetition fields
create table flashcards (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  term text not null,
  definition text not null,
  ease_factor real not null default 2.5,
  interval integer not null default 0,
  repetitions integer not null default 0,
  next_review_date timestamp with time zone default now(),
  last_reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index idx_flashcards_document_id on flashcards(document_id);
create index idx_flashcards_next_review on flashcards(next_review_date);

-- Quiz questions: multiple choice
create table quiz_questions (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  question text not null,
  choices jsonb not null,
  correct_answer integer not null,
  explanation text,
  created_at timestamp with time zone default now()
);

create index idx_quiz_questions_document_id on quiz_questions(document_id);

-- Quiz attempts: score history
create table quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  total_questions integer not null,
  correct_answers integer not null,
  score_percentage real not null,
  answers jsonb not null,
  completed_at timestamp with time zone default now()
);

create index idx_quiz_attempts_document_id on quiz_attempts(document_id);
