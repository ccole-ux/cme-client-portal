"use client";

import { DownloadIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Scope = "draft" | "canonical" | "submission" | "version" | "narrative";

export function DownloadMenu({
  slug,
  scope,
  scopeId,
  size = "default",
  label,
}: {
  slug: string;
  scope: Scope;
  scopeId?: string;
  size?: "default" | "sm";
  label?: string;
}) {
  async function download(format: "pdf" | "xlsx" | "csv") {
    const url = buildUrl(scope, scopeId, format, slug);
    toast.loading("Preparing download…", { id: "download" });
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        toast.error(`Download failed: ${error}`, { id: "download" });
        return;
      }
      const blob = await res.blob();
      const name = suggestedFilename(res.headers.get("content-disposition"), slug, scope, scopeId, format);
      triggerDownload(blob, name);
      toast.success("Downloaded", { id: "download" });
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`, { id: "download" });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          size === "sm"
            ? "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
            : "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        }
      >
        <DownloadIcon className="h-3 w-3" />
        {label ?? "Download"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          {scopeLabel(scope)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {scope !== "narrative" && (
          <DropdownMenuItem onSelect={() => download("pdf")}>
            PDF (branded)
          </DropdownMenuItem>
        )}
        {scope === "narrative" && (
          <DropdownMenuItem onSelect={() => download("pdf")}>
            PDF
          </DropdownMenuItem>
        )}
        {scope !== "narrative" && (
          <DropdownMenuItem onSelect={() => download("xlsx")}>
            Excel (.xlsx)
          </DropdownMenuItem>
        )}
        {scope !== "narrative" && (
          <DropdownMenuItem onSelect={() => download("csv")}>
            CSV (flat)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function scopeLabel(scope: Scope): string {
  switch (scope) {
    case "draft":
      return "Your draft";
    case "canonical":
      return "Canonical baseline";
    case "submission":
      return "This submission";
    case "version":
      return "This version";
    case "narrative":
      return "Narrative";
  }
}

function buildUrl(
  scope: Scope,
  scopeId: string | undefined,
  format: "pdf" | "xlsx" | "csv",
  slug: string,
): string {
  if (scope === "submission" || scope === "version") {
    if (!scopeId) throw new Error(`${scope} scope requires scopeId`);
    return `/api/export/workplan/${scope}/${scopeId}?format=${format}&project=${encodeURIComponent(slug)}`;
  }
  if (scope === "narrative") {
    return `/api/export/narrative?format=${format}&project=${encodeURIComponent(slug)}`;
  }
  return `/api/export/workplan/${scope}?format=${format}&project=${encodeURIComponent(slug)}`;
}

function suggestedFilename(
  disposition: string | null,
  slug: string,
  scope: Scope,
  scopeId: string | undefined,
  format: string,
): string {
  if (disposition) {
    const match = /filename="?([^"]+)"?/.exec(disposition);
    if (match) return match[1];
  }
  const today = new Date().toISOString().slice(0, 10);
  const tag = scopeId ? `${scope}-${scopeId.slice(0, 8)}` : scope;
  return `${slug.toUpperCase()}-${tag}-${today}.${format}`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
