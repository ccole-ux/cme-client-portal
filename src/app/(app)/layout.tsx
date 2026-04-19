import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app/AppSidebar";
import { getSessionUser, getCurrentProfile } from "@/lib/supabase/dal";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();

  // First sign-in: auth.users row exists but the trigger may be racing.
  // Fall back to a minimal shell profile so the UI still renders.
  const shell = profile ?? {
    id: user.id,
    email: user.email ?? "",
    full_name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
    firm: null,
    avatar_url: null,
    role: "actc_viewer" as const,
    created_at: "",
    updated_at: "",
  };

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar
        profile={{
          full_name: shell.full_name,
          email: shell.email,
          role: shell.role,
        }}
      />
      <main className="flex-1 min-w-0">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
