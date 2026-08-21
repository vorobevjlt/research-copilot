"use client";

import { useActionState } from "react";
import { createProject, type CreateProjectState } from "./actions";

const initialState: CreateProjectState = { error: null };

type CreateProjectFormProps = {
  autoFocus?: boolean;
};

export function CreateProjectForm({
  autoFocus = false,
}: CreateProjectFormProps) {
  const [state, formAction, pending] = useActionState(
    createProject,
    initialState,
  );

  return (
    <form action={formAction} className="project-form">
      <div>
        <p className="project-kicker">New project</p>
        <h2>Create a context</h2>
        <p className="project-form-copy">
          Tell the assistant what you are working on. This context is included
          in every conversation for the project.
        </p>
      </div>

      <label className="project-field">
        <span>Project name</span>
        <input
          name="name"
          type="text"
          maxLength={80}
          placeholder="e.g. Market research"
          autoComplete="off"
          autoFocus={autoFocus}
          required
        />
      </label>

      <label className="project-field">
        <span>Context</span>
        <textarea
          name="context"
          rows={7}
          maxLength={8000}
          placeholder="Goals, audience, constraints, source material, or anything else the assistant should know..."
          required
        />
      </label>

      <p className="project-form-error" aria-live="polite">
        {state.error}
      </p>

      <button className="project-create-button" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create and open chat"}
      </button>
    </form>
  );
}
