-- Migration 14: Remove Estimate column from issues and seed 8 standard labels for all organizations

-- 1. Safely drop estimate column from issues
ALTER TABLE IF EXISTS issues DROP COLUMN IF EXISTS estimate;

-- 2. Seed 8 core standard labels for all organizations if they don't already exist
INSERT INTO labels (organization_id, name, color, description)
SELECT o.id, l.name, l.color, l.description
FROM organizations o
CROSS JOIN (
  VALUES
    ('Bug', '#EF4444', 'Something isn''t working as expected'),
    ('Feature', '#8B5CF6', 'New functionality or enhancement'),
    ('Improvement', '#3B82F6', 'Refining existing behavior or UX'),
    ('Documentation', '#10B981', 'Improvements to documentation'),
    ('Design', '#EC4899', 'UI/UX visual and design tasks'),
    ('Backend', '#F59E0B', 'Server-side, API, or database tasks'),
    ('Frontend', '#06B6D4', 'Client-side web application tasks'),
    ('Performance', '#F97316', 'Performance, latency, and scaling work')
) AS l(name, color, description)
ON CONFLICT (organization_id, name) DO NOTHING;
