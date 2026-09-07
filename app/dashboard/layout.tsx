import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const dictionary = getDictionary(await getServerLocale());
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
    throw new Error(dictionary.projects.accountError);
  }

  return <>{children}</>;
}
