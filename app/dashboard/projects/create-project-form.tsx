"use client";

import { useAppLocale } from "@/app/locale-provider";
import { useActionState } from "react";
import { createProject, type CreateProjectState } from "./actions";

const initialState: CreateProjectState = { error: null };

type CreateProjectFormProps = {
  autoFocus?: boolean;
};

export function CreateProjectForm({
  autoFocus = false,
}: CreateProjectFormProps) {
  const { dictionary } = useAppLocale();
  const [state, formAction, pending] = useActionState(
    createProject,
    initialState,
  );

  return (
    <form action={formAction} className="project-form">
      <div>
        <p className="project-kicker">{dictionary.projectForm.kicker}</p>
        <h2>{dictionary.projectForm.title}</h2>
        <p className="project-form-copy">{dictionary.projectForm.description}</p>
      </div>

      <label className="project-field">
        <span>{dictionary.projectForm.name}</span>
        <input
          name="name"
          type="text"
          maxLength={80}
          placeholder={dictionary.projectForm.namePlaceholder}
          autoComplete="off"
          autoFocus={autoFocus}
          required
        />
      </label>

      <label className="project-field">
        <span>{dictionary.projectForm.context}</span>
        <textarea
          name="context"
          rows={7}
          maxLength={8000}
          placeholder={dictionary.projectForm.contextPlaceholder}
          required
        />
      </label>

      <p className="project-form-error" aria-live="polite">
        {state.error}
      </p>

      <button className="project-create-button" type="submit" disabled={pending}>
        {pending ? dictionary.projectForm.creating : dictionary.projectForm.create}
      </button>
    </form>
  );
}
