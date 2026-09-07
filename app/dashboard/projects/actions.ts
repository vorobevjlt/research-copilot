"use server";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type CreateProjectState = {
  error: string | null;
};

const MAX_NAME_LENGTH = 80;
const MAX_CONTEXT_LENGTH = 8_000;
const DEFAULT_PROJECT_SETTINGS = {
  embedding_model: "text-embedding-3-large",
  rag_strategy: "hybrid",
  agent_type: "simple",
  chunks_per_search: 20,
  final_context_size: 6,
  similarity_threshold: 0.3,
  number_of_queries: 3,
  reranking_enabled: false,
  reranking_model: "rerank-english-v3.0",
  vector_weight: 0.7,
  keyword_weight: 0.3,
  rag_enabled: true,
  answer_mode: "knowledge_only",
} as const;

export async function createProject(
  _previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const copy = getDictionary(await getServerLocale()).projectForm;
  const { userId } = await auth.protect();
  const rawName = formData.get("name");
  const rawContext = formData.get("context");

  if (typeof rawName !== "string" || typeof rawContext !== "string") {
    return { error: copy.enterNameAndContext };
  }

  const name = rawName.trim();
  const context = rawContext.trim();

  if (!name) return { error: copy.nameRequired };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: copy.nameTooLong };
  }
  if (!context) return { error: copy.contextRequired };
  if (context.length > MAX_CONTEXT_LENGTH) {
    return { error: copy.contextTooLong };
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
    return { error: copy.accountError };
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
    return { error: copy.createError };
  }

  const { error: settingsError } = await supabase
    .from("project_settings")
    .upsert(
      { project_id: data.id, ...DEFAULT_PROJECT_SETTINGS },
      { onConflict: "project_id" },
    );

  if (settingsError) {
    console.error("Failed to create default project settings", {
      projectId: data.id,
      code: settingsError.code,
      message: settingsError.message,
      details: settingsError.details,
      hint: settingsError.hint,
    });

    const { error: rollbackError } = await supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("owner_clerk_id", userId);

    if (rollbackError) {
      console.error("Failed to roll back project without settings", {
        projectId: data.id,
        code: rollbackError.code,
        message: rollbackError.message,
        details: rollbackError.details,
        hint: rollbackError.hint,
      });
    }

    return { error: copy.prepareError };
  }

  redirect(`/dashboard/chat/${data.id}`);
}
