"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { XIcon } from "lucide-react";

export function TaskDrawerShell({
  closeHref,
  children,
}: {
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.push(closeHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <>
      <Link
        href={closeHref}
        aria-label="Close"
        className="fixed inset-0 bg-black/20 z-40"
      />
      <aside
        role="dialog"
        aria-label="Task details"
        className="fixed right-0 top-0 bottom-0 w-full md:w-[560px] bg-background border-l z-50 overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] tracking-widest uppercase text-cme-bright-green">
            Task detail
          </span>
          <Link
            href={closeHref}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Close drawer"
          >
            <XIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </>
  );
}
