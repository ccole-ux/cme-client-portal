"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DraftRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Remove this draft?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Draft removed");
        router.refresh();
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "remove failed" }));
        toast.error(`Remove failed: ${error ?? res.status}`);
      }
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={remove}
      disabled={pending}
      className="text-cme-red hover:text-cme-red"
    >
      Remove
    </Button>
  );
}
