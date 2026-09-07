import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectChat } from "./project-chat";

type ChatPageProps = {
  params: Promise<{ projectId: string }>;
};

type ProjectRecord = {
  id: string;
  name: string;
  context: string;
};

export default async function ProjectChatPage({ params }: ChatPageProps) {
  const dictionary = getDictionary(await getServerLocale());
  const { userId } = await auth.protect();
  const { projectId } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("projects")
    .select("id, name, context")
    .eq("id", projectId)
    .eq("owner_clerk_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Unable to load project", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(dictionary.chat.projectLoadError);
  }
  if (!data) notFound();

  const project = data as ProjectRecord;

  return (
    <main className="chat-app">
      <section className="chat-workspace" id="chat">
        <header className="chat-header">
          <div className="chat-title">
            <span className="mobile-mark" aria-hidden="true">
              AI
            </span>
            <div className="chat-project-title">
              <span>{project.name}</span>
              <small>{dictionary.chat.assistant}</small>
            </div>
          </div>
          <div className="header-actions">
            <Link
              className="voice-studio-link"
              href="/dashboard/voice"
              data-short-label={dictionary.common.voiceShort}
            >
              {dictionary.common.voiceStudio}
            </Link>
            <Link className="change-project-link" href="/dashboard/projects">
              {dictionary.chat.changeProject}
            </Link>
            <UserButton />
          </div>
        </header>

        <div className="chat-canvas">
          <ProjectChat project={project} />
        </div>
      </section>
    </main>
  );
}
