"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";

export function EmptyProjects() {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <section className="projects-first" aria-label="Projects">
      {isCreating ? (
        <div className="projects-first-form">
          <button
            className="projects-back-button"
            type="button"
            onClick={() => setIsCreating(false)}
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <CreateProjectForm autoFocus />
        </div>
      ) : (
        <div className="projects-first-empty">
          <div>
            <p className="project-kicker">Your projects</p>
            <h1 id="first-project-heading">No projects yet</h1>
            <p>
              Create a project to give your conversations a shared context.
            </p>
          </div>

          <button
            className="projects-empty-action"
            type="button"
            onClick={() => setIsCreating(true)}
          >
            <span aria-hidden="true">+</span> Create new project
          </button>
        </div>
      )}
    </section>
  );
}
