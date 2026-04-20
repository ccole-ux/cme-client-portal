"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { MessageSquare, Plus, Send, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string | null;
  last_message_at: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_name: string | null;
  tool_args: unknown;
  tool_result: unknown;
  created_at: string;
};

export function AssistantSidebar({
  projectId,
  slug,
  apiConfigured,
}: {
  projectId: string;
  slug: string;
  apiConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch(
      `/api/ai/conversations?project_id=${projectId}`,
    );
    if (!res.ok) return;
    const json = await res.json();
    setConversations(json.conversations ?? []);
  }, [projectId]);

  useEffect(() => {
    if (open) loadConversations();
  }, [open, loadConversations]);

  async function loadConversation(id: string) {
    setConversationId(id);
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setMessages(json.messages ?? []);
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    setError(null);

    // Optimistic user message.
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msg,
      tool_name: null,
      tool_args: null,
      tool_result: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        user_message: msg,
      }),
    });

    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({ error: "failed" }));
      setError(typeof e === "string" ? e : "Request failed");
      setSending(false);
      return;
    }

    const json = await res.json();
    // Refresh from server so tool rows render in proper order.
    if (json.conversation_id) {
      setConversationId(json.conversation_id);
      await loadConversation(json.conversation_id);
      loadConversations();
    }
    setSending(false);
  }

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 top-1/2 -translate-y-1/2 z-40 h-10 w-10 rounded-full bg-cme-dark-green text-white shadow-lg hover:bg-cme-bright-green transition-colors flex items-center justify-center"
        aria-label="Open AI Assistant"
        title="AI Assistant"
      >
        <Sparkles className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="fixed right-0 top-0 bottom-0 z-40 w-[400px] max-w-[95vw] bg-background border-l shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cme-bright-green" />
          <h3 className="font-display tracking-wide text-sm text-cme-dark-green">
            CME ASSISTANT
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={newConversation}
            title="New conversation"
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close"
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conversation list (collapsible) */}
      {conversations.length > 0 && (
        <div className="border-b">
          <details className="group">
            <summary className="cursor-pointer select-none px-4 py-2 text-[11px] tracking-widest uppercase text-muted-foreground hover:bg-muted">
              Threads ({conversations.length})
            </summary>
            <ul className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => loadConversation(c.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-xs truncate",
                      c.id === conversationId
                        ? "bg-cme-bright-green/10 text-cme-dark-green"
                        : "hover:bg-muted",
                    )}
                  >
                    <MessageSquare className="inline h-3 w-3 mr-1.5 opacity-60" />
                    {c.title ?? "New conversation"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!apiConfigured && (
          <div className="rounded-md border border-cme-yellow/60 bg-cme-yellow/10 p-3 text-xs">
            <strong className="font-semibold">
              AI Assistant requires configuration.
            </strong>
            <p className="mt-1 text-muted-foreground">
              Add <code>ANTHROPIC_API_KEY</code> to Vercel production. See the
              session-run-report for details.
            </p>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              Ask about the workplan, costs, resources, or deliverables. I can
              also propose drafts for changes you want to make — you review
              and submit them.
            </p>
            <div className="grid gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setInput(e)}
                  className="text-left text-xs border rounded px-2 py-1.5 hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} slug={slug} />
        ))}

        {sending && (
          <div className="text-xs text-muted-foreground italic">Thinking…</div>
        )}
        {error && (
          <div className="rounded-md border border-cme-red/40 bg-cme-red/5 p-2 text-xs text-cme-red">
            {error}
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t p-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            apiConfigured
              ? "Ask about the project…"
              : "AI key not yet configured"
          }
          disabled={!apiConfigured || sending}
          rows={2}
          className="flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cme-bright-green disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!apiConfigured || sending || !input.trim()}
          className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-cme-bright-green text-white hover:bg-cme-bright-green/90 disabled:opacity-40"
          title="Send (Enter)"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}

const EXAMPLES = [
  "What's the total forecast cost with escalation?",
  "Which tasks are on the critical path?",
  "Show costs by firm",
  "List deliverables for task 2",
];

function MessageBubble({ m, slug }: { m: Message; slug: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-cme-dark-green/10 text-foreground rounded-lg px-3 py-2 text-sm">
          {m.content}
        </div>
      </div>
    );
  }

  if (m.role === "tool") {
    const result = m.tool_result as { ok?: boolean; data?: unknown; error?: string } | null;
    const draftId =
      result &&
      typeof result === "object" &&
      result.ok &&
      result.data &&
      typeof result.data === "object" &&
      "draft_id" in (result.data as Record<string, unknown>)
        ? (result.data as { draft_id: string }).draft_id
        : null;

    if (draftId) {
      return (
        <div className="rounded-md border border-cme-bright-green/60 bg-cme-bright-green/5 p-2.5 text-xs">
          <div className="font-semibold text-cme-dark-green">
            ✓ Draft created
          </div>
          <p className="mt-0.5 text-muted-foreground">
            The assistant proposed a change. Review it before submitting.
          </p>
          <Link
            href={`/p/${slug}/drafts`}
            className="mt-1.5 inline-block text-cme-dark-green underline"
          >
            Review in Drafts →
          </Link>
        </div>
      );
    }

    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Called {m.tool_name ?? "tool"}
        </summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(m.tool_result, null, 2)}
        </pre>
      </details>
    );
  }

  if (m.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-1.5">
          {m.content && (
            <div className="prose prose-sm text-sm max-w-none">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          )}
          {m.tool_name && (
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
              → {m.tool_name}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
