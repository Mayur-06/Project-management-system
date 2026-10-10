-- 15_ai_conversations_history.sql
-- Create database-backed AI conversation history tables with RLS

CREATE TABLE IF NOT EXISTS ai_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
    sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'agent')),
    content TEXT NOT NULL,
    tools_json JSONB DEFAULT '[]'::jsonb,
    interrupt_json JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_threads_org_user ON ai_threads(organization_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created ON ai_messages(thread_id, created_at ASC);

-- Enable RLS
ALTER TABLE ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can manage their own AI threads within their organization" ON ai_threads;
DROP POLICY IF EXISTS "Users can manage AI messages of their threads" ON ai_messages;

-- RLS Policy: ai_threads
CREATE POLICY "Users can manage their own AI threads within their organization"
ON ai_threads
FOR ALL
USING (
    user_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.organization_id = ai_threads.organization_id
          AND wm.user_id = auth.uid()
    )
)
WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.organization_id = ai_threads.organization_id
          AND wm.user_id = auth.uid()
    )
);

-- RLS Policy: ai_messages
CREATE POLICY "Users can manage AI messages of their threads"
ON ai_messages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM ai_threads t
        WHERE t.id = ai_messages.thread_id
          AND t.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM ai_threads t
        WHERE t.id = ai_messages.thread_id
          AND t.user_id = auth.uid()
    )
);
