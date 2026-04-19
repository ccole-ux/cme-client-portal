import { requireCmeAdmin } from "@/lib/supabase/dal";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCmeAdmin();
  return <>{children}</>;
}
