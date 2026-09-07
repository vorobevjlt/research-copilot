import { UserButton } from "@clerk/nextjs";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import Link from "next/link";
import { VoiceCloneStudio } from "./voice-clone-studio";

export default async function VoiceStudioPage() {
  const dictionary = getDictionary(await getServerLocale());

  return (
    <main className="voice-page">
      <div className="voice-shell">
        <header className="voice-header">
          <Link className="projects-brand" href="/dashboard/projects">
            {dictionary.common.brand}
          </Link>
          <div className="voice-header-actions">
            <Link className="voice-back-link" href="/dashboard/projects">
              {dictionary.common.projects}
            </Link>
            <UserButton />
          </div>
        </header>

        <section className="voice-intro" aria-labelledby="voice-studio-title">
          <p className="project-kicker">{dictionary.voicePage.kicker}</p>
          <h1 id="voice-studio-title">{dictionary.voicePage.title}</h1>
          <p>{dictionary.voicePage.description}</p>
        </section>

        <VoiceCloneStudio />
      </div>
    </main>
  );
}
