/**
 * Tool definitions for the CME Project Assistant.
 *
 * Every tool is either read-only (query_*) or PROPOSE-ONLY (propose_*). The
 * assistant can never write canonical data — propose_* tools create drafts
 * scoped to the caller's own proposed_changes rows, which the user must
 * explicitly submit for review via /p/:slug/drafts.
 */

import type { Anthropic } from "@anthropic-ai/sdk";

export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_workplan",
    description:
      "Search and filter the workplan tasks. Returns WBS, name, phase, " +
      "start/finish dates, assigned resources, hours, computed cost, and " +
      "status. Use for questions like 'what tasks are in phase 2?' or " +
      "'which tasks are on the critical path?'.",
    input_schema: {
      type: "object",
      properties: {
        phase: {
          type: "string",
          description:
            "Filter by phase. Allowed values: '1', '1.5', '2', '3', 'PM'.",
        },
        status: {
          type: "string",
          enum: [
            "not_started",
            "in_development",
            "submitted_for_review",
            "accepted",
            "rejected",
            "deferred",
          ],
        },
        search: {
          type: "string",
          description: "Free text search on task name or WBS.",
        },
        include_milestones: {
          type: "boolean",
          description:
            "Default true. Set false to exclude milestones from results.",
        },
        critical_only: {
          type: "boolean",
          description: "Only return tasks on the critical path.",
        },
      },
    },
  },
  {
    name: "query_costs",
    description:
      "Get cost aggregations. Use for questions about total spend, " +
      "spend by firm, by resource, by phase, or by month. All dollar " +
      "amounts include the 3% Jan 1 2027 rate escalation.",
    input_schema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["firm", "resource", "phase", "month", "total"],
          description:
            "'total' returns project-wide totals; the others break down " +
            "by that dimension.",
        },
        metric: {
          type: "string",
          enum: ["hours", "cost"],
        },
      },
      required: ["dimension", "metric"],
    },
  },
  {
    name: "query_deliverables",
    description:
      "List contract deliverables with owner, frequency, delivery note, " +
      "and WBS linkage.",
    input_schema: {
      type: "object",
      properties: {
        task_number: {
          type: "string",
          description:
            "Filter by parent task (e.g., '1', '2', '3', or 'O1').",
        },
        owner: {
          type: "string",
          description: "Filter by owner initials (e.g., 'CC/MN').",
        },
      },
    },
  },
  {
    name: "search_narrative",
    description:
      "Search the project narrative sections (scope, approach, " +
      "assumptions, etc.) for content relevant to a question.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Terms to match against narrative body text.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "query_rate_history",
    description:
      "Get rate history for one or all resources. Use to explain cost " +
      "escalation, compare rates between firms, or surface effective-date " +
      "windows.",
    input_schema: {
      type: "object",
      properties: {
        resource_name: {
          type: "string",
          description:
            "Optional filter by partial name match (e.g., 'Cole' matches " +
            "Christopher Cole). Omit to return all resources.",
        },
        year: {
          type: "integer",
          description: "Filter rates effective in this calendar year.",
        },
      },
    },
  },
  {
    name: "propose_task_update",
    description:
      "Create a DRAFT proposal to update fields on an existing task. The " +
      "draft is saved to the caller's proposed_changes. Will NOT be " +
      "applied until the user submits the draft for review via the Drafts " +
      "tray.",
    input_schema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "UUID of the workplan_tasks row to update.",
        },
        field_updates: {
          type: "object",
          description:
            "Fields to update. Allowed keys: start_date (YYYY-MM-DD), " +
            "finish_date, hours (number), status, notes.",
        },
        reason: {
          type: "string",
          description:
            "Why this change is proposed — surfaces on the draft and in " +
            "review. Always include this.",
        },
      },
      required: ["task_id", "field_updates", "reason"],
    },
  },
  {
    name: "propose_new_task",
    description:
      "Create a DRAFT proposal to add a new task. Will not be applied " +
      "until the user submits the draft.",
    input_schema: {
      type: "object",
      properties: {
        task_name: { type: "string" },
        wbs: {
          type: "string",
          description: "WBS identifier like '2.4.3' or '3.1'.",
        },
        phase: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        finish_date: { type: "string", description: "YYYY-MM-DD" },
        hours: { type: "number" },
        reason: { type: "string" },
      },
      required: [
        "task_name",
        "wbs",
        "phase",
        "start_date",
        "finish_date",
        "reason",
      ],
    },
  },
  {
    name: "propose_delete_task",
    description:
      "Create a DRAFT proposal to remove a task. Will not be applied " +
      "until the user submits the draft.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["task_id", "reason"],
    },
  },
];

export const AI_TOOL_NAMES = AI_TOOLS.map((t) => t.name);
