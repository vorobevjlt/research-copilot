import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { CreateProjectForm } from "./create-project-form";
import { EmptyProjects } from "./empty-projects";

type ProjectSummary = {
  id: string;
  name: string;
  context: string;
  created_at: string;
};

export default async function ProjectsPage() {
  const dictionary = getDictionary(await getServerLocale());
  const { userId } = await auth.protect();
  const { data, error } = await getSupabaseAdmin()
    .from("projects")
    .select("id, name, context, created_at")
    .eq("owner_clerk_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load projects", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(dictionary.projects.loadError);
  }

  const projects = (data ?? []) as ProjectSummary[];

  return (
    <main className="projects-page">
      <div className="projects-shell">
        <header className="projects-header">
          <Link className="projects-brand" href="/">
            {dictionary.common.brand}
          </Link>
          <div className="projects-header-actions">
            <Link className="voice-studio-link" href="/dashboard/voice">
              {dictionary.common.voiceStudio}
            </Link>
            <UserButton />
          </div>
        </header>

        {projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <>
            <div className="projects-intro">
              <p className="project-kicker">{dictionary.projects.kicker}</p>
              <h1>{dictionary.projects.title}</h1>
              <p>{dictionary.projects.description}</p>
            </div>

            <div className="projects-layout">
              <section
                className="projects-list"
                aria-labelledby="projects-heading"
              >
                <div className="projects-list-heading">
                  <h2 id="projects-heading">{dictionary.projects.yours}</h2>
                  <span
                    aria-label={`${projects.length} ${dictionary.projects.countLabel}`}
                  >
                    {projects.length}
                  </span>
                </div>

                <div className="project-cards">
                  {projects.map((project) => (
                    <Link
                      className="project-card"
                      href={`/dashboard/chat/${project.id}`}
                      key={project.id}
                    >
                      <div>
                        <h3>{project.name}</h3>
                        <p>{project.context}</p>
                      </div>
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </section>

              <aside>
                <CreateProjectForm />
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
