"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";

export function DocumentDownloadButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  function download() {
    startTransition(async () => {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.status }));
        toast.error(`Download failed: ${error}`);
        return;
      }
      const { url, filename } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }
  return (
    <Button size="sm" variant="outline" onClick={download} disabled={pending}>
      <DownloadIcon className="h-3 w-3 mr-1" />
      Download
    </Button>
  );
}
