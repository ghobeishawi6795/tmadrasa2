-- 013_education_level.sql
-- Phase 2 of the launch roadmap: elementary/secondary split.
-- Principle (per the roadmap doc): one backend, one database -- branching
-- happens only in UI and content type, never in the schema/API shape beyond
-- this one column.
ALTER TABLE classes ADD COLUMN education_level TEXT NOT NULL DEFAULT 'secondary';
-- elementary | secondary -- admin sets this explicitly when creating a class;
-- default 'secondary' only applies to rows that predate this column.
