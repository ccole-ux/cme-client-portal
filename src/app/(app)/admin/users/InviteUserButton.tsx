"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Project = { id: string; name: string };

const ROLES = [
  {
    value: "cme_admin",
    label: "CME Admin",
    description: "Full access — manage users, edit canonical data, review submissions.",
  },
  {
    value: "cme_reviewer",
    label: "CME Reviewer",
    description:
      "Can review submissions from ACTC and accept/reject changes. Cannot manage users or directly edit the workplan.",
  },
  {
    value: "cme_viewer",
    label: "CME Viewer",
    description: "Read-only access to unpublished drafts and full project data.",
  },
  {
    value: "actc_reviewer",
    label: "ACTC Reviewer",
    description: "Can propose drafts and submit them for CME review.",
  },
  {
    value: "actc_viewer",
    label: "ACTC Viewer",
    description: "Read-only access to published workplan data.",
  },
] as const;

export function InviteUserButton({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>(
    "actc_viewer",
  );
  const [projectId, setProjectId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          project_id: projectId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Invite failed");
        return;
      }
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setRole("actc_viewer");
      setProjectId("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-cme-bright-green hover:bg-cme-bright-green/90">
            Invite user
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">
              INVITE USER
            </DialogTitle>
            <DialogDescription>
              Supabase sends a magic-link invite. The user lands at
              /invite/:token and is attached to the project (if selected) on
              first sign-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              required
              value={role}
              onChange={(e) =>
                setRole(e.target.value as (typeof ROLES)[number]["value"])
              }
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {ROLES.find((r) => r.value === role)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !email}
              className="bg-cme-bright-green hover:bg-cme-bright-green/90"
            >
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
