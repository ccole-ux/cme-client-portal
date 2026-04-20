/**
 * Role-based gating for AI tools. Separated from the server-only
 * tool-handlers module so it can be imported from client components and
 * tested in a Node vitest environment without pulling in Supabase.
 */
const PROPOSE_TOOL_NAMES = new Set([
  "propose_task_update",
  "propose_new_task",
  "propose_delete_task",
]);

export function canInvokeTool(role: string, toolName: string): boolean {
  if (PROPOSE_TOOL_NAMES.has(toolName)) {
    return role !== "actc_viewer";
  }
  return true;
}
