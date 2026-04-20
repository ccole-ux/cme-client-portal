import { describe, expect, it } from "vitest";
import { canInvokeTool } from "./permissions";

describe("canInvokeTool", () => {
  const roles = [
    "cme_admin",
    "cme_reviewer",
    "cme_viewer",
    "actc_reviewer",
    "actc_viewer",
  ];

  it("every role can call read-only query tools", () => {
    for (const r of roles) {
      expect(canInvokeTool(r, "query_workplan")).toBe(true);
      expect(canInvokeTool(r, "query_costs")).toBe(true);
      expect(canInvokeTool(r, "query_deliverables")).toBe(true);
      expect(canInvokeTool(r, "search_narrative")).toBe(true);
      expect(canInvokeTool(r, "query_rate_history")).toBe(true);
    }
  });

  it("actc_viewer cannot call propose tools (read-only role)", () => {
    expect(canInvokeTool("actc_viewer", "propose_task_update")).toBe(false);
    expect(canInvokeTool("actc_viewer", "propose_new_task")).toBe(false);
    expect(canInvokeTool("actc_viewer", "propose_delete_task")).toBe(false);
  });

  it("every other role can propose — drafts are self-scoped by RLS", () => {
    const canPropose = roles.filter((r) => r !== "actc_viewer");
    for (const r of canPropose) {
      expect(canInvokeTool(r, "propose_task_update")).toBe(true);
      expect(canInvokeTool(r, "propose_new_task")).toBe(true);
      expect(canInvokeTool(r, "propose_delete_task")).toBe(true);
    }
  });
});
