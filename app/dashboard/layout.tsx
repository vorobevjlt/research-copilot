import { getSupabaseAdmin } from "@/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const { userId } = await auth.protect();
  const { error } = await getSupabaseAdmin().from("users").upsert(
    { clerk_id: userId },
    { onConflict: "clerk_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Unable to synchronize signed-in user", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Unable to prepare your account.");
  }

  return <>{children}</>;
}
