import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { AI_TOOLS } from "@/lib/ai/tools";
import { runTool, type ToolExecContext } from "@/lib/ai/tool-handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-5";
const MAX_TOOL_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are the CME Project Assistant helping a team manage the A26-0057 project — a $1.36M SaaS replacement for Alameda CTC's Project Controls System. Your role is to answer questions about the workplan, schedule, costs, resources, and deliverables, and to help users propose changes.

CRITICAL RULES:
- You cannot directly edit the workplan. The propose_* tools create DRAFTS that the user must explicitly submit for review.
- When a user asks to make a change, always clarify what they want, then call the appropriate propose_* tool, then tell them: "I've created a draft. Review it in the Drafts tab and click Submit when ready."
- Always cite specific data you retrieved (WBS numbers, task names, dollar amounts) rather than speaking in generalities.
- If you don't have data on something, say so — don't make up numbers.
- Current date context: The portal is live as of April 20, 2026. Project kickoff is May 1, 2026.
- Escalation policy: All 2027 work uses 3% escalated rates from the B7 R26-003 baseline. Current forecast with escalation: $1,363,308. Signed baseline: $1,356,256.

Be concise and professional. Stakeholders include ACTC staff and CME team members.`;

type AiMessageRow = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_name: string | null;
  tool_args: unknown;
  tool_result: unknown;
  created_at: string;
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI Assistant requires configuration. ANTHROPIC_API_KEY is not set on the server.",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "actc_viewer";

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    project_id,
    conversation_id,
    user_message,
  }: {
    project_id: string;
    conversation_id: string | null;
    user_message: string;
  } = body;

  if (!project_id || !user_message?.trim()) {
    return NextResponse.json(
      { error: "project_id and user_message are required" },
      { status: 400 },
    );
  }

  // Resolve / create conversation.
  let conversationId = conversation_id;
  if (!conversationId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conv, error: convErr } = await (supabase.from(
      "ai_conversations",
    ) as any)
      .insert({
        project_id,
        user_id: user.id,
        title: user_message.slice(0, 80),
      })
      .select("id")
      .single();
    if (convErr || !conv) {
      return NextResponse.json(
        { error: "failed to create conversation" },
        { status: 500 },
      );
    }
    conversationId = conv.id as string;
  }

  // Load prior messages for context.
  const { data: priorRows } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const priorMessages = (priorRows ?? []) as AiMessageRow[];

  // Save the user's new message.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("ai_messages") as any).insert({
    conversation_id: conversationId,
    role: "user",
    content: user_message,
  });

  // Build Anthropic messages[] from prior + new.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of priorMessages) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content ?? "" });
    } else if (m.role === "assistant" && m.content) {
      messages.push({ role: "assistant", content: m.content });
    }
    // Tool rows are rebuilt inline during the loop; don't re-inject here.
  }
  messages.push({ role: "user", content: user_message });

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const ctx: ToolExecContext = {
    projectId: project_id,
    userId: user.id,
    conversationId,
    role,
  };

  // Tool-use loop. Cap iterations defensively so a runaway model can't burn
  // the whole maxDuration on back-to-back tool calls.
  let finalText = "";
  const assembledAssistantBlocks: Anthropic.ContentBlockParam[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: AI_TOOLS,
      messages,
    });

    const toolUses: Anthropic.ToolUseBlock[] = [];
    let textThisTurn = "";

    for (const block of resp.content) {
      if (block.type === "text") {
        textThisTurn += block.text;
        assembledAssistantBlocks.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        toolUses.push(block);
        assembledAssistantBlocks.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
    if (textThisTurn) finalText = textThisTurn;

    // Record this assistant turn. The loop may write multiple turns if tools
    // fire; keep them as separate rows for audit clarity.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("ai_messages") as any).insert({
      conversation_id: conversationId,
      role: "assistant",
      content: textThisTurn || null,
      tool_name: toolUses.length > 0 ? toolUses.map((t) => t.name).join(",") : null,
      tool_args:
        toolUses.length > 0
          ? toolUses.map((t) => ({ name: t.name, input: t.input }))
          : null,
    });

    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
      // Model is done.
      break;
    }

    // Execute all tool calls, collect results.
    messages.push({
      role: "assistant",
      content: resp.content as Anthropic.ContentBlockParam[],
    });

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await runTool(
        tu.name,
        (tu.input as Record<string, unknown>) ?? {},
        ctx,
      );
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("ai_messages") as any).insert({
        conversation_id: conversationId,
        role: "tool",
        content: null,
        tool_name: tu.name,
        tool_args: tu.input ?? null,
        tool_result: result,
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });
  }

  // Bump conversation timestamp.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("ai_conversations") as any)
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    reply: finalText || "(no response)",
    blocks: assembledAssistantBlocks,
  });
}
