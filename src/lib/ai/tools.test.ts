import { describe, expect, it } from "vitest";
import { AI_TOOLS, AI_TOOL_NAMES } from "./tools";

describe("AI_TOOLS", () => {
  it("exposes query + propose tools the sidebar advertises", () => {
    const names = new Set(AI_TOOL_NAMES);
    expect(names.has("query_workplan")).toBe(true);
    expect(names.has("query_costs")).toBe(true);
    expect(names.has("query_deliverables")).toBe(true);
    expect(names.has("search_narrative")).toBe(true);
    expect(names.has("query_rate_history")).toBe(true);
    expect(names.has("propose_task_update")).toBe(true);
    expect(names.has("propose_new_task")).toBe(true);
    expect(names.has("propose_delete_task")).toBe(true);
  });

  it("every tool has a non-empty description", () => {
    for (const t of AI_TOOLS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect((t.description ?? "").length).toBeGreaterThan(10);
    }
  });

  it("every tool input_schema is an object schema", () => {
    for (const t of AI_TOOLS) {
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("propose tools require a reason field — keeps the audit trail honest", () => {
    const proposers = AI_TOOLS.filter((t) => t.name.startsWith("propose_"));
    expect(proposers.length).toBeGreaterThan(0);
    for (const p of proposers) {
      const required = (p.input_schema as { required?: string[] }).required ??
        [];
      expect(required).toContain("reason");
    }
  });
});
