-- ============================================================
-- Migration 003: Concept Graph
-- ============================================================

-- 1. New table: concept_graphs (one row per document, JSONB nodes + edges)
create table concept_graphs (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  nodes jsonb not null,
  edges jsonb not null,
  created_at timestamp with time zone default now()
);

create unique index idx_concept_graphs_document_id on concept_graphs(document_id);

-- 2. Add concept_node_count to documents
alter table documents add column concept_node_count integer default 0;
