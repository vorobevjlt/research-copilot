"use server";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type CreateProjectState = {
  error: string | null;
};

const MAX_NAME_LENGTH = 80;
const MAX_CONTEXT_LENGTH = 8_000;

export async function createProject(
  _previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const { userId } = await auth.protect();
  const rawName = formData.get("name");
  const rawContext = formData.get("context");

  if (typeof rawName !== "string" || typeof rawContext !== "string") {
    return { error: "Enter a project name and context." };
  }

  const name = rawName.trim();
  const context = rawContext.trim();

  if (!name) return { error: "Project name is required." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Project name must be ${MAX_NAME_LENGTH} characters or less.` };
  }
  if (!context) return { error: "Add some context for the assistant." };
  if (context.length > MAX_CONTEXT_LENGTH) {
    return {
      error: `Project context must be ${MAX_CONTEXT_LENGTH.toLocaleString()} characters or less.`,
    };
  }

  const supabase = getSupabaseAdmin();
  const { error: userError } = await supabase.from("users").upsert(
    { clerk_id: userId },
    { onConflict: "clerk_id", ignoreDuplicates: true },
  );

  if (userError) {
    console.error("Failed to synchronize project owner", {
      code: userError.code,
      message: userError.message,
      details: userError.details,
      hint: userError.hint,
    });
    return { error: "Your account could not be prepared. Please try again." };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ owner_clerk_id: userId, name, context })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create project", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { error: "The project could not be created. Please try again." };
  }

  redirect(`/dashboard/chat/${data.id}`);
}
