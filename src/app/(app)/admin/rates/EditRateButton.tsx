"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateRateAction } from "./actions";

export function EditRateButton({
  rateId,
  resourceName,
  year,
  currentRate,
}: {
  rateId: string;
  resourceName: string;
  year: string;
  currentRate: number;
}) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate.toFixed(2));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const parsed = Number(rate);
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast.error("Rate must be a positive number");
      return;
    }
    startTransition(async () => {
      const result = await updateRateAction(rateId, parsed);
      if (result.ok) {
        toast.success(`Rate updated: ${resourceName} ${year}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Update failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm">Edit</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit rate</DialogTitle>
          <DialogDescription>
            {resourceName} · calendar {year}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rate-input">Loaded rate ($)</Label>
          <Input
            id="rate-input"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Downstream task costs recompute automatically on next page load.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
