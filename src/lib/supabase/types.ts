// Placeholder. Regenerate after migrations land:
//   npx supabase gen types typescript --project-id qodxdzgormqtbqiakhxn > src/lib/supabase/types.ts
//
// Keep only the tables + enums the Session 2 code touches. Sessions 3+ will
// replace this with the real generated file.

export type UserGlobalRole =
  | "cme_admin"
  | "cme_viewer"
  | "actc_reviewer"
  | "actc_viewer";

export type ProjectStatus = "prospective" | "active" | "on_hold" | "closed";

export type ProjectMemberRole = UserGlobalRole;

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          firm: string | null;
          avatar_url: string | null;
          role: UserGlobalRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          firm?: string | null;
          avatar_url?: string | null;
          role?: UserGlobalRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          name: string;
          client_name: string;
          client_short: string;
          slug: string;
          baseline_year: number;
          kickoff_on: string | null;
          status: ProjectStatus;
          started_on: string | null;
          target_complete_on: string | null;
          total_hours_baseline: number | null;
          total_cost_baseline: number | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["projects"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: ProjectMemberRole;
          invited_by: string | null;
          invited_at: string;
          accepted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["project_members"]["Row"],
          "id" | "invited_at"
        > & {
          id?: string;
          invited_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["project_members"]["Insert"]
        >;
      };
      workplan_snapshots: {
        Row: {
          id: string;
          project_id: string;
          snapshot_type: "submission" | "accepted_version" | "manual";
          snapshot_label: string | null;
          version_number: number;
          captured_at: string;
          captured_by: string;
          submission_id: string | null;
          data: unknown;
          narrative_data: unknown;
          notes: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["workplan_snapshots"]["Row"],
          "id" | "captured_at" | "version_number"
        > & {
          id?: string;
          captured_at?: string;
          version_number?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["workplan_snapshots"]["Insert"]
        >;
      };
      audit_log: {
        Row: {
          id: string;
          project_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          payload: unknown;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["audit_log"]["Row"],
          "id" | "created_at"
        > & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
      };
    };
    Enums: {
      user_global_role: UserGlobalRole;
      project_status: ProjectStatus;
      project_member_role: ProjectMemberRole;
    };
  };
};
