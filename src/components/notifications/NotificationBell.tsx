"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  seen_at: string | null;
  created_at: string;
  project_id: string | null;
};

type Project = {
  id: string;
  slug: string;
  client_short: string;
};

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) setItems(d.items);
        if (d?.projects) setProjects(indexProjects(d.projects));
      })
      .catch(() => {});
  }, [open]);

  const unread = items.filter((n) => !n.seen_at).length;

  async function markAllRead() {
    const res = await fetch("/api/notifications", { method: "PATCH" });
    if (res.ok) {
      setItems((prev) => prev.map((n) => ({ ...n, seen_at: n.seen_at ?? new Date().toISOString() })));
      startTransition(() => router.refresh());
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="relative inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-muted">
        <BellIcon className="h-4 w-4 text-cme-dark-green" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-cme-red text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0 max-h-[70vh]">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-display tracking-wider text-cme-dark-green text-xs uppercase">
            Notifications
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[11px] text-cme-bright-green hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            You have no notifications yet.
          </div>
        ) : (
          <ul className="divide-y max-h-[60vh] overflow-y-auto">
            {items.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                project={n.project_id ? projects[n.project_id] : undefined}
                onClick={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function indexProjects(list: Project[]): Record<string, Project> {
  const out: Record<string, Project> = {};
  for (const p of list) out[p.id] = p;
  return out;
}

function NotificationItem({
  notification: n,
  project,
  onClick,
}: {
  notification: Notification;
  project: Project | undefined;
  onClick: () => void;
}) {
  const url = buildUrl(n, project?.slug);
  return (
    <li>
      <Link
        href={url}
        onClick={onClick}
        className={cn(
          "block px-3 py-2.5 hover:bg-accent/50",
          !n.seen_at && "bg-cme-yellow/5",
        )}
      >
        <div className="flex items-start gap-2">
          {!n.seen_at && (
            <span className="h-2 w-2 rounded-full bg-cme-bright-green mt-1.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {labelFor(n)}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {project?.client_short ?? ""} · {relativeTime(n.created_at)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function labelFor(n: Notification): string {
  const p = n.payload ?? {};
  const title = typeof (p as Record<string, unknown>).title === "string"
    ? (p as Record<string, string>).title
    : null;
  if (title) return title;
  switch (n.kind) {
    case "comment.mention":
      return "You were mentioned in a comment";
    case "submission.pending":
      return "New submission needs review";
    case "submission.reviewed":
      return "Your submission was reviewed";
    case "document.uploaded":
      return "A new document was added";
    default:
      return n.kind;
  }
}

function buildUrl(n: Notification, slug: string | undefined): string {
  if (!slug) return "/";
  const base = `/p/${slug}`;
  switch (n.kind) {
    case "submission.pending":
      return `${base}/review`;
    case "submission.reviewed":
      return `${base}/submissions`;
    case "document.uploaded":
      return `${base}/documents`;
    case "comment.mention":
      return n.entity_type === "workplan_task" && n.entity_id
        ? `${base}/gantt?task=${n.entity_id}`
        : `${base}/activity`;
    default:
      return `${base}/activity`;
  }
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
