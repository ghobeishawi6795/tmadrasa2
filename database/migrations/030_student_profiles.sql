-- Extended student profile. Sensitive fields remain school-scoped and are never exposed cross-tenant.
ALTER TABLE students ADD COLUMN birth_date TEXT;
ALTER TABLE students ADD COLUMN national_id TEXT;
ALTER TABLE students ADD COLUMN address TEXT;
ALTER TABLE students ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE students ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE students ADD COLUMN notes TEXT;
ALTER TABLE students ADD COLUMN photo_data TEXT;
CREATE INDEX IF NOT EXISTS idx_students_national_id ON students(school_id,national_id);
