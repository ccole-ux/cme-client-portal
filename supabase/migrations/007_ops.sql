-- 007: Operational tables - comments, documents, audit log, notifications.

CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES users(id),
  body_markdown     text NOT NULL,
  mentions          uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES users(id)
);

CREATE INDEX idx_comments_entity  ON comments (entity_type, entity_id);
CREATE INDEX idx_comments_project ON comments (project_id, created_at DESC);

CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  storage_path   text NOT NULL,
  file_size      bigint,
  mime_type      text,
  version        integer NOT NULL DEFAULT 1,
  uploaded_by    uuid NOT NULL REFERENCES users(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  supersedes_id  uuid REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_documents_project ON documents (project_id, uploaded_at DESC);

CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  payload      jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_project ON audit_log (project_id, created_at DESC);
CREATE INDEX idx_audit_actor   ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log (action, created_at DESC);

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  payload      jsonb,
  seen_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
