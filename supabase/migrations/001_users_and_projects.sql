-- CME Client Portal — Session 2 schema
-- 001: Users, projects, project membership.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Global role assigned to each user. Scoped per-project via project_members.role.
CREATE TYPE user_global_role AS ENUM (
  'cme_admin',
  'cme_viewer',
  'actc_reviewer',
  'actc_viewer'
);

CREATE TYPE project_member_role AS ENUM (
  'cme_admin',
  'cme_viewer',
  'actc_reviewer',
  'actc_viewer'
);

CREATE TYPE project_status AS ENUM (
  'prospective',
  'active',
  'on_hold',
  'closed'
);

CREATE TABLE users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  full_name     text,
  firm          text,
  avatar_url    text,
  role          user_global_role NOT NULL DEFAULT 'actc_viewer',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (lower(email));

CREATE TABLE projects (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  client_name            text NOT NULL,
  client_short           text NOT NULL,
  slug                   text NOT NULL UNIQUE,
  baseline_year          integer NOT NULL,
  kickoff_on             date,
  status                 project_status NOT NULL DEFAULT 'prospective',
  started_on             date,
  target_complete_on     date,
  total_hours_baseline   numeric(12,2),
  total_cost_baseline    numeric(14,2),
  description            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_slug ON projects (slug);

CREATE TABLE project_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         project_member_role NOT NULL,
  invited_by   uuid REFERENCES users(id),
  invited_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_user   ON project_members (user_id);
CREATE INDEX idx_project_members_project ON project_members (project_id);
