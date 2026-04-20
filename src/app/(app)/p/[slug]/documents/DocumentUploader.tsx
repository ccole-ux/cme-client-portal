"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { UploadIcon } from "lucide-react";

export function DocumentUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(file: File | null) {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a document title");
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("file", file);
    startTransition(async () => {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        if (fileRef.current) fileRef.current.value = "";
        toast.success("Uploaded");
        router.refresh();
      } else {
        const { error } = await res.json().catch(() => ({ error: "failed" }));
        toast.error(`Upload failed: ${error ?? res.status}`);
      }
    });
  }

  return (
    <Card>
      <CardContent
        className={`p-5 space-y-3 border-2 border-dashed rounded-md transition-colors ${
          dragging
            ? "border-cme-bright-green bg-cme-bright-green/5"
            : "border-transparent"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) {
            if (fileRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileRef.current.files = dt.files;
            }
            submit(file);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              Title
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ACTC PCS Contract r1"
              disabled={pending}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              Description
            </span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short context for reviewers"
              disabled={pending}
            />
          </label>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              File (drag + drop or pick)
            </span>
            <input
              ref={fileRef}
              type="file"
              className="block text-xs file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-cme-dark-green file:text-white hover:file:bg-cme-bright-green cursor-pointer"
              disabled={pending}
            />
          </label>
          <Button
            onClick={() => submit(fileRef.current?.files?.[0] ?? null)}
            disabled={pending}
          >
            <UploadIcon className="h-3 w-3 mr-1" />
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
