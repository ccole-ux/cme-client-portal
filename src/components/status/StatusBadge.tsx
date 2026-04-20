import { cn } from "@/lib/utils";
import {
  TASK_STATUS_CLASS,
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/status";

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        TASK_STATUS_CLASS[status],
        className,
      )}
    >
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
