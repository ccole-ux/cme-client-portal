import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PatchSchema = z
  .object({
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    finish_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    status: z
      .enum([
        "not_started",
        "in_development",
        "submitted_for_review",
        "accepted",
        "rejected",
        "deferred",
      ])
      .optional(),
    task_name: z.string().min(1).optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
    return NextResponse.json(
      { error: "Only CME admins can edit tasks directly. Use proposed-changes." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (
    parsed.data.start_date &&
    parsed.data.finish_date &&
    parsed.data.start_date > parsed.data.finish_date
  ) {
    return NextResponse.json(
      { error: "start_date must be on or before finish_date" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("workplan_tasks")
    .update({
      ...parsed.data,
      updated_by: user.id,
      ...(parsed.data.status !== undefined
        ? {
            status_updated_at: new Date().toISOString(),
            status_updated_by: user.id,
          }
        : {}),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
