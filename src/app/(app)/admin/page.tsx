import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin — CME Client Portal" };

const CARDS = [
  {
    href: "/admin/users",
    title: "USERS",
    description: "Invite users, manage roles, revoke access.",
  },
  {
    href: "/admin/projects",
    title: "PROJECTS",
    description: "Create and configure client projects.",
  },
  {
    href: "/admin/rates",
    title: "RATES",
    description: "Resource rate schedule and escalation overrides.",
  },
  {
    href: "/admin/snapshots",
    title: "SNAPSHOTS",
    description: "Capture and review workplan versions.",
  },
  {
    href: "/admin/audit",
    title: "AUDIT LOG",
    description: "Trace every change across the portal.",
  },
];

export default function AdminLandingPage() {
  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME CONSOLE
        </p>
        <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
          ADMIN
        </h1>
      </header>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full hover:border-cme-bright-green transition-colors">
              <CardHeader>
                <CardTitle className="font-display tracking-wider text-cme-dark-green">
                  {c.title}
                </CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Open →
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
