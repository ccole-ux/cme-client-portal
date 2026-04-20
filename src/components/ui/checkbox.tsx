"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "checked" | "onChange"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  function Checkbox(
    { checked, onCheckedChange, className, ...props },
    ref,
  ) {
    return (
      <span className="relative inline-flex">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className={cn(
            "peer h-4 w-4 shrink-0 rounded border border-primary/50 bg-background appearance-none cursor-pointer",
            "checked:bg-cme-dark-green checked:border-cme-dark-green",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <CheckIcon
          className="h-3 w-3 text-white absolute left-0.5 top-0.5 pointer-events-none opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
    );
  },
);
