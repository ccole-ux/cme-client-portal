import Link from "next/link";
import { redirect } from "next/navigation";
import { LetterheadTop } from "@/components/brand/LetterheadTop";
import { LetterheadBottom } from "@/components/brand/LetterheadBottom";
import { LogoMark } from "@/components/brand/LogoMark";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invite — CME Client Portal" };

type Params = Promise<{ token: string }>;

export default async function InviteClaimPage({ params }: { params: Params }) {
  await params; // token is advisory for Session 2; membership is seeded at invite time.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Session 2 flow: inviteUserByEmail seeds project_members with accepted_at
  // already set when a project is attached. This page is the post-signin
  // landing for invited users — once authenticated, send them home.
  if (user) redirect("/");

  return (
    <>
      <LetterheadTop className="w-full h-20 md:h-28" />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <LogoMark size={96} />
          <Card className="w-full border-cme-gray/40">
            <CardHeader>
              <CardTitle className="font-display tracking-wider text-cme-dark-green">
                WELCOME TO CME
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                To accept your invite, click the sign-in link in your email. It
                will bring you back here and sign you in automatically.
              </p>
              <p className="text-muted-foreground">
                If the link has expired, you can request a fresh one.
              </p>
              <Button
                render={<Link href="/login">Request a new link</Link>}
                className="w-full bg-cme-yellow text-cme-black hover:bg-cme-yellow/90"
              />
            </CardContent>
          </Card>
        </div>
      </main>
      <LetterheadBottom className="w-full h-20 md:h-28" />
    </>
  );
}
