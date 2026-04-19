"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Props = {
  next?: string;
  initialError?: string;
};

export function LoginForm({ next, initialError }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const redirect = new URL(
        "/auth/callback",
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin,
      );
      if (next) redirect.searchParams.set("next", next);
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect.toString() },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setSent(true);
    });
  }

  return (
    <Card className="w-full border-cme-gray/40">
      <CardContent className="p-6">
        {sent ? (
          <div className="text-center space-y-3">
            <p className="font-display tracking-wide text-cme-dark-green text-lg">
              CHECK YOUR EMAIL
            </p>
            <p className="text-sm text-cme-black/70">
              We sent a sign-in link to{" "}
              <span className="font-medium">{email}</span>. The link is valid
              for 60 minutes.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-xs text-cme-bright-green underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-cme-yellow text-cme-black hover:bg-cme-yellow/90"
              disabled={pending || !email}
            >
              {pending ? "Sending…" : "Send magic link"}
            </Button>
            <p className="text-xs text-cme-black/50 text-center">
              Google sign-in coming soon. Use your invited email for now.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
