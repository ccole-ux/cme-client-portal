import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["cme_admin", "cme_viewer", "actc_reviewer", "actc_viewer"]),
  project_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "cme_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, role, project_id } = parsed.data;

  const admin = createAdminClient();
  const redirectTo = new URL(
    "/auth/callback",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).toString();

  // Supabase sends a magic-link invite using its built-in templates (no Resend
  // in Session 2). The metadata lands on auth.users and is surfaced by the
  // handle_new_auth_user trigger when the invitee first signs in.
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        role,
        invited_by: user.id,
        invited_project_id: project_id ?? null,
      },
    });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const invitedUserId = invited.user?.id;

  // Seed public.users immediately so roles are enforced before the user signs
  // in. Trigger handle_new_auth_user would insert on first login, but we want
  // the admin console to reflect the invitee right away.
  if (invitedUserId) {
    await admin
      .from("users")
      .upsert(
        {
          id: invitedUserId,
          email,
          role,
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    if (project_id) {
      await admin.from("project_members").upsert(
        {
          project_id,
          user_id: invitedUserId,
          role,
          invited_by: user.id,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "project_id,user_id" },
      );
    }
  }

  return NextResponse.json({ ok: true, user_id: invitedUserId });
}
