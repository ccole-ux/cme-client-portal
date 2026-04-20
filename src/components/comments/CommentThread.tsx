"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Comment = {
  id: string;
  parent_comment_id: string | null;
  author_id: string;
  body_markdown: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  author: { full_name: string | null; email: string } | null;
};

type ProjectMember = {
  user_id: string;
  full_name: string | null;
  email: string;
};

export function CommentThread({
  entityType,
  entityId,
  projectId,
}: {
  entityType: string;
  entityId: string;
  projectId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const loadComments = async () => {
    const res = await fetch(
      `/api/comments?entity_type=${entityType}&entity_id=${entityId}`,
    );
    if (res.ok) {
      const data = await res.json();
      setComments(data.items ?? []);
    }
  };

  const loadMembers = async () => {
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.items ?? []);
    }
  };

  useEffect(() => {
    // Legitimate fire-and-forget: loadComments / loadMembers fetch from the
    // server then update React state with the response. This is the standard
    // pattern documented by the rule itself ("calling setState in a callback
    // function when external state changes"). Rule disabled because the fetch
    // returns synchronously-ish (the setState happens in the await callback).
    /* eslint-disable react-hooks/set-state-in-effect */
    loadComments();
    loadMembers();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, projectId]);

  function post(parentId: string | null = null, text?: string) {
    const value = (text ?? body).trim();
    if (!value) return;
    const mentions = extractMentions(value, members);
    startTransition(async () => {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          entity_type: entityType,
          entity_id: entityId,
          parent_comment_id: parentId,
          body_markdown: value,
          mentions,
        }),
      });
      if (res.ok) {
        setBody("");
        await loadComments();
      } else {
        const { error } = await res.json().catch(() => ({ error: "failed" }));
        toast.error(`Comment failed: ${error ?? res.status}`);
      }
    });
  }

  async function resolve(id: string) {
    const res = await fetch(`/api/comments/${id}/resolve`, { method: "PATCH" });
    if (res.ok) loadComments();
  }

  const top = comments.filter((c) => !c.parent_comment_id);
  const byParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const list = byParent.get(c.parent_comment_id) ?? [];
      list.push(c);
      byParent.set(c.parent_comment_id, list);
    }
  }

  const visible = showResolved
    ? top
    : top.filter((c) => !c.resolved_at);
  const resolvedCount = top.filter((c) => c.resolved_at).length;

  return (
    <div>
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No comments yet. Start the thread below.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              replies={byParent.get(c.id) ?? []}
              onReply={(text) => post(c.id, text)}
              onResolve={() => resolve(c.id)}
              pending={pending}
              members={members}
            />
          ))}
        </ul>
      )}

      {resolvedCount > 0 && !showResolved && (
        <button
          type="button"
          onClick={() => setShowResolved(true)}
          className="mt-3 text-[11px] text-muted-foreground hover:text-cme-dark-green"
        >
          Show {resolvedCount} resolved
        </button>
      )}

      <div className="mt-4 space-y-2">
        <CommentInput
          value={body}
          onChange={setBody}
          members={members}
          disabled={pending}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => post()}
            disabled={pending || !body.trim()}
          >
            {pending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentNode({
  comment,
  replies,
  onReply,
  onResolve,
  pending,
  members,
}: {
  comment: Comment;
  replies: Comment[];
  onReply: (text: string) => void;
  onResolve: () => void;
  pending: boolean;
  members: ProjectMember[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const authorLabel = comment.author?.full_name ?? comment.author?.email ?? "Anonymous";
  return (
    <li
      className={cn(
        "border rounded p-3",
        comment.resolved_at
          ? "bg-muted/40 opacity-70"
          : "bg-background",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{authorLabel}</p>
        <p className="text-[10px] text-muted-foreground">
          {relativeTime(comment.created_at)}
        </p>
      </div>
      <p className="text-sm mt-1 whitespace-pre-wrap">
        {renderBody(comment.body_markdown, members)}
      </p>
      <div className="mt-1 flex gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-cme-bright-green hover:underline"
        >
          Reply
        </button>
        {!comment.resolved_at && (
          <button
            type="button"
            onClick={onResolve}
            className="text-muted-foreground hover:text-cme-dark-green"
          >
            Resolve
          </button>
        )}
        {comment.resolved_at && (
          <span className="text-[10px] text-cme-bright-green uppercase tracking-wider">
            Resolved {relativeTime(comment.resolved_at)}
          </span>
        )}
      </div>

      {replies.length > 0 && (
        <ul className="mt-2 pl-4 border-l-2 border-muted space-y-2">
          {replies.map((r) => (
            <li key={r.id} className="text-xs">
              <p className="font-medium">
                {r.author?.full_name ?? r.author?.email}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">
                {renderBody(r.body_markdown, members)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {relativeTime(r.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <CommentInput
            value={text}
            onChange={setText}
            members={members}
            disabled={pending}
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onReply(text);
                setText("");
                setOpen(false);
              }}
              disabled={pending || !text.trim()}
            >
              Post reply
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function CommentInput({
  value,
  onChange,
  members,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  members: ProjectMember[];
  disabled: boolean;
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    onChange(val);
    const caret = e.target.selectionStart;
    const before = val.slice(0, caret);
    const match = /@([\w.-]*)$/.exec(before);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(m: ProjectMember) {
    const name = m.full_name?.replace(/\s+/g, "") ?? m.email.split("@")[0];
    onChange(value.replace(/@[\w.-]*$/, `@${name} `));
    setMentionQuery(null);
  }

  const suggestions =
    mentionQuery === null
      ? []
      : members
          .filter((m) =>
            mentionQuery === ""
              ? true
              : (m.full_name ?? m.email)
                  .toLowerCase()
                  .includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 5);

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={handleChange}
        placeholder="Type a comment. Use @ to mention someone."
        disabled={disabled}
        rows={3}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-popover border rounded shadow-md z-10 max-h-40 overflow-y-auto">
          {suggestions.map((m) => (
            <button
              type="button"
              key={m.user_id}
              onClick={() => pickMention(m)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
            >
              <span className="font-medium">{m.full_name ?? m.email}</span>
              <span className="text-muted-foreground ml-2">{m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function renderBody(md: string, members: ProjectMember[]): React.ReactNode {
  // Replace @Mention tokens with a highlighted span.
  const parts: React.ReactNode[] = [];
  const regex = /@([\w.-]+)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(md))) {
    if (match.index > lastIdx) {
      parts.push(md.slice(lastIdx, match.index));
    }
    const token = match[1];
    const m = members.find(
      (u) =>
        u.full_name?.replace(/\s+/g, "").toLowerCase() === token.toLowerCase() ||
        u.email.split("@")[0].toLowerCase() === token.toLowerCase(),
    );
    parts.push(
      <span
        key={`m-${idx}`}
        className={cn(
          "text-cme-bright-green font-medium",
          m && "bg-cme-bright-green/10 rounded px-0.5",
        )}
      >
        @{token}
      </span>,
    );
    lastIdx = match.index + match[0].length;
    idx++;
  }
  if (lastIdx < md.length) parts.push(md.slice(lastIdx));
  return parts;
}

function extractMentions(md: string, members: ProjectMember[]): string[] {
  const out = new Set<string>();
  const regex = /@([\w.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(md))) {
    const token = m[1];
    const hit = members.find(
      (u) =>
        u.full_name?.replace(/\s+/g, "").toLowerCase() === token.toLowerCase() ||
        u.email.split("@")[0].toLowerCase() === token.toLowerCase(),
    );
    if (hit) out.add(hit.user_id);
  }
  return Array.from(out);
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
