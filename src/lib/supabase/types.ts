export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          project_id: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          project_id: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          project_id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["ai_message_role"]
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["ai_message_role"]
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["ai_message_role"]
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          payload: Json | null
          project_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          payload?: Json | null
          project_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          payload?: Json | null
          project_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      change_submissions: {
        Row: {
          id: string
          project_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitter_id: string
          submitter_note: string | null
        }
        Insert: {
          id?: string
          project_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitter_id: string
          submitter_note?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitter_id?: string
          submitter_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_submissions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_submissions_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body_markdown: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
          parent_comment_id: string | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body_markdown: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_markdown?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          project_id: string
          ref_code: string
          sort_order: number
          status: Database["public"]["Enums"]["deliverable_status"]
          title: string
          updated_at: string
          wbs_links: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          project_id: string
          ref_code: string
          sort_order?: number
          status?: Database["public"]["Enums"]["deliverable_status"]
          title: string
          updated_at?: string
          wbs_links?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          ref_code?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["deliverable_status"]
          title?: string
          updated_at?: string
          wbs_links?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          description: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          project_id: string
          storage_path: string
          supersedes_id: string | null
          title: string
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          description?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          project_id: string
          storage_path: string
          supersedes_id?: string | null
          title: string
          uploaded_at?: string
          uploaded_by: string
          version?: number
        }
        Update: {
          description?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          project_id?: string
          storage_path?: string
          supersedes_id?: string | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_sections: {
        Row: {
          body_markdown: string
          created_at: string
          id: string
          is_published: boolean
          project_id: string
          section_key: string
          sort_order: number
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body_markdown?: string
          created_at?: string
          id?: string
          is_published?: boolean
          project_id: string
          section_key: string
          sort_order?: number
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_markdown?: string
          created_at?: string
          id?: string
          is_published?: boolean
          project_id?: string
          section_key?: string
          sort_order?: number
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "narrative_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          payload: Json | null
          project_id: string | null
          seen_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          payload?: Json | null
          project_id?: string | null
          seen_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          project_id?: string | null
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          baseline_year: number
          client_name: string
          client_short: string
          created_at: string
          description: string | null
          id: string
          kickoff_on: string | null
          name: string
          slug: string
          started_on: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_complete_on: string | null
          total_cost_baseline: number | null
          total_hours_baseline: number | null
          updated_at: string
        }
        Insert: {
          baseline_year: number
          client_name: string
          client_short: string
          created_at?: string
          description?: string | null
          id?: string
          kickoff_on?: string | null
          name: string
          slug: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_complete_on?: string | null
          total_cost_baseline?: number | null
          total_hours_baseline?: number | null
          updated_at?: string
        }
        Update: {
          baseline_year?: number
          client_name?: string
          client_short?: string
          created_at?: string
          description?: string | null
          id?: string
          kickoff_on?: string | null
          name?: string
          slug?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_complete_on?: string | null
          total_cost_baseline?: number | null
          total_hours_baseline?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      proposed_changes: {
        Row: {
          ai_conversation_id: string | null
          applied_at: string | null
          change_data: Json
          entity_id: string | null
          entity_type: string
          id: string
          operation: Database["public"]["Enums"]["change_operation"]
          project_id: string
          proposed_at: string
          proposed_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["proposed_change_status"]
          submission_id: string | null
          via_ai: boolean
        }
        Insert: {
          ai_conversation_id?: string | null
          applied_at?: string | null
          change_data: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          operation: Database["public"]["Enums"]["change_operation"]
          project_id: string
          proposed_at?: string
          proposed_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proposed_change_status"]
          submission_id?: string | null
          via_ai?: boolean
        }
        Update: {
          ai_conversation_id?: string | null
          applied_at?: string | null
          change_data?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          operation?: Database["public"]["Enums"]["change_operation"]
          project_id?: string
          proposed_at?: string
          proposed_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proposed_change_status"]
          submission_id?: string | null
          via_ai?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_proposed_changes_ai_conversation"
            columns: ["ai_conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_changes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_changes_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_changes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_changes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "change_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_rate_history: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string | null
          rate_loaded: number
          rate_source: string | null
          resource_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          rate_loaded: number
          rate_source?: string | null
          resource_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          rate_loaded?: number
          rate_source?: string | null
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_rate_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_rate_history_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          avatar_url: string | null
          b7_classification: string | null
          created_at: string
          firm: string
          full_name: string
          id: string
          is_active: boolean
          role_description: string | null
        }
        Insert: {
          avatar_url?: string | null
          b7_classification?: string | null
          created_at?: string
          firm: string
          full_name: string
          id?: string
          is_active?: boolean
          role_description?: string | null
        }
        Update: {
          avatar_url?: string | null
          b7_classification?: string | null
          created_at?: string
          firm?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role_description?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          firm: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_global_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          firm?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_global_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          firm?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_global_role"]
          updated_at?: string
        }
        Relationships: []
      }
      workplan_snapshots: {
        Row: {
          captured_at: string
          captured_by: string
          data: Json
          id: string
          narrative_data: Json | null
          notes: string | null
          project_id: string
          snapshot_label: string | null
          snapshot_type: Database["public"]["Enums"]["snapshot_type"]
          submission_id: string | null
          version_number: number
        }
        Insert: {
          captured_at?: string
          captured_by: string
          data: Json
          id?: string
          narrative_data?: Json | null
          notes?: string | null
          project_id: string
          snapshot_label?: string | null
          snapshot_type: Database["public"]["Enums"]["snapshot_type"]
          submission_id?: string | null
          version_number: number
        }
        Update: {
          captured_at?: string
          captured_by?: string
          data?: Json
          id?: string
          narrative_data?: Json | null
          notes?: string | null
          project_id?: string
          snapshot_label?: string | null
          snapshot_type?: Database["public"]["Enums"]["snapshot_type"]
          submission_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workplan_snapshots_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_snapshots_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "change_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      workplan_task_resources: {
        Row: {
          cost_override: number | null
          hours: number
          id: string
          notes: string | null
          resource_id: string
          task_id: string
        }
        Insert: {
          cost_override?: number | null
          hours?: number
          id?: string
          notes?: string | null
          resource_id: string
          task_id: string
        }
        Update: {
          cost_override?: number | null
          hours?: number
          id?: string
          notes?: string | null
          resource_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workplan_task_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_task_resources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workplan_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workplan_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          finish_date: string | null
          id: string
          is_milestone: boolean
          is_published: boolean
          notes: string | null
          parent_wbs: string | null
          phase: string | null
          project_id: string
          sort_order: number
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_updated_at: string | null
          status_updated_by: string | null
          task_name: string
          updated_at: string
          updated_by: string | null
          wbs: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          id?: string
          is_milestone?: boolean
          is_published?: boolean
          notes?: string | null
          parent_wbs?: string | null
          phase?: string | null
          project_id: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_updated_at?: string | null
          status_updated_by?: string | null
          task_name: string
          updated_at?: string
          updated_by?: string | null
          wbs: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finish_date?: string | null
          id?: string
          is_milestone?: boolean
          is_published?: boolean
          notes?: string | null
          parent_wbs?: string | null
          phase?: string | null
          project_id?: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_updated_at?: string | null
          status_updated_by?: string | null
          task_name?: string
          updated_at?: string
          updated_by?: string | null
          wbs?: string
        }
        Relationships: [
          {
            foreignKeyName: "workplan_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_tasks_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workplan_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_cme_admin: { Args: never; Returns: boolean }
      is_cme_staff: { Args: never; Returns: boolean }
      is_cme_viewer: { Args: never; Returns: boolean }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
    }
    Enums: {
      ai_message_role: "user" | "assistant" | "tool" | "system"
      change_operation: "create" | "update" | "delete"
      deliverable_status:
        | "not_started"
        | "in_development"
        | "submitted_for_review"
        | "accepted"
        | "rejected"
        | "deferred"
      project_member_role:
        | "cme_admin"
        | "cme_viewer"
        | "actc_reviewer"
        | "actc_viewer"
      project_status: "prospective" | "active" | "on_hold" | "closed"
      proposed_change_status:
        | "draft"
        | "submitted"
        | "accepted"
        | "rejected"
        | "withdrawn"
        | "applied"
      snapshot_type: "submission" | "accepted_version" | "manual"
      submission_status:
        | "pending_review"
        | "accepted"
        | "rejected"
        | "mixed"
        | "withdrawn"
      task_status:
        | "not_started"
        | "in_development"
        | "submitted_for_review"
        | "accepted"
        | "rejected"
        | "deferred"
      user_global_role:
        | "cme_admin"
        | "cme_viewer"
        | "actc_reviewer"
        | "actc_viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_message_role: ["user", "assistant", "tool", "system"],
      change_operation: ["create", "update", "delete"],
      deliverable_status: [
        "not_started",
        "in_development",
        "submitted_for_review",
        "accepted",
        "rejected",
        "deferred",
      ],
      project_member_role: [
        "cme_admin",
        "cme_viewer",
        "actc_reviewer",
        "actc_viewer",
      ],
      project_status: ["prospective", "active", "on_hold", "closed"],
      proposed_change_status: [
        "draft",
        "submitted",
        "accepted",
        "rejected",
        "withdrawn",
        "applied",
      ],
      snapshot_type: ["submission", "accepted_version", "manual"],
      submission_status: [
        "pending_review",
        "accepted",
        "rejected",
        "mixed",
        "withdrawn",
      ],
      task_status: [
        "not_started",
        "in_development",
        "submitted_for_review",
        "accepted",
        "rejected",
        "deferred",
      ],
      user_global_role: [
        "cme_admin",
        "cme_viewer",
        "actc_reviewer",
        "actc_viewer",
      ],
    },
  },
} as const

// Short aliases used across the app.
export type UserGlobalRole = Database["public"]["Enums"]["user_global_role"];
export type ProjectMemberRole =
  Database["public"]["Enums"]["project_member_role"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type SnapshotType = Database["public"]["Enums"]["snapshot_type"];
