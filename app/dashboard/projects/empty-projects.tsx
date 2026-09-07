"use client";

import { useAppLocale } from "@/app/locale-provider";
import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";

export function EmptyProjects() {
  const { dictionary } = useAppLocale();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <section
      className="projects-first"
      aria-label={dictionary.projectForm.projectsLabel}
    >
      {isCreating ? (
        <div className="projects-first-form">
          <button
            className="projects-back-button"
            type="button"
            onClick={() => setIsCreating(false)}
          >
            <span aria-hidden="true">←</span> {dictionary.projectForm.back}
          </button>
          <CreateProjectForm autoFocus />
        </div>
      ) : (
        <div className="projects-first-empty">
          <div>
            <p className="project-kicker">{dictionary.projectForm.emptyKicker}</p>
            <h1 id="first-project-heading">{dictionary.projectForm.emptyTitle}</h1>
            <p>{dictionary.projectForm.emptyDescription}</p>
          </div>

          <button
            className="projects-empty-action"
            type="button"
            onClick={() => setIsCreating(true)}
          >
            <span aria-hidden="true">+</span> {dictionary.projectForm.emptyAction}
          </button>
        </div>
      )}
    </section>
  );
}
