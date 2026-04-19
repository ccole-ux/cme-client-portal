-- 006: AI assistant conversations and messages.

CREATE TYPE ai_message_role AS ENUM ('user', 'assistant', 'tool', 'system');

CREATE TABLE ai_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conv_user ON ai_conversations (user_id, last_message_at DESC);

CREATE TABLE ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             ai_message_role NOT NULL,
  content          text,
  tool_name        text,
  tool_args        jsonb,
  tool_result      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_msg_conv ON ai_messages (conversation_id, created_at);

-- Backfill FK added after ai_conversations exists (proposed_changes.ai_conversation_id from 004).
ALTER TABLE proposed_changes
  ADD CONSTRAINT fk_proposed_changes_ai_conversation
  FOREIGN KEY (ai_conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL;
