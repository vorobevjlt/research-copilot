"use client";

import { useAppLocale } from "@/app/locale-provider";
import {
  CopilotChat,
  CopilotKit,
  useAgent,
  useAgentContext,
} from "@copilotkit/react-core/v2";
import { useEffect, useMemo, useState } from "react";
import type { RagCitation } from "@/lib/rag/types";
import { KnowledgeBaseSidebar } from "./knowledge-base-sidebar";

type ProjectChatProps = {
  project: {
    id: string;
    name: string;
    context: string;
  };
};

function reportProjectAgentError({ type, error }: { type: string; error?: unknown }) {
  console.error("Project agent error", {
    type,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function ProjectChat({ project }: ProjectChatProps) {
  const headers = useMemo(() => ({ "x-project-id": project.id }), [project.id]);

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      headers={headers}
      credentials="include"
      useSingleEndpoint
      onError={reportProjectAgentError}
    >
      <ProjectChatExperience project={project} />
    </CopilotKit>
  );
}

function ProjectChatExperience({ project }: ProjectChatProps) {
  const { locale, dictionary } = useAppLocale();
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const { agent } = useAgent({ agentId: "default" });
  const projectContext = useMemo(
    () => ({
      projectId: project.id,
      projectName: project.name,
      projectContext: project.context,
      interfaceLanguage: locale,
    }),
    [locale, project.context, project.id, project.name],
  );

  useAgentContext({
    description: dictionary.chat.agentInstructions,
    value: projectContext,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function hydrateMessages() {
      if (agent.messages.length > 0) return;
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/messages`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        data?: Array<{ id: string; role: string; content: string }>;
      };
      const messages = (payload.data ?? [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.content,
        }));
      if (messages.length > 0 && agent.messages.length === 0) {
        agent.setMessages(messages as Parameters<typeof agent.setMessages>[0]);
      }
    }

    void hydrateMessages().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Unable to restore project messages", error);
      }
    });
    return () => controller.abort();
  }, [agent, project.id]);

  const agentState = agent.state as { citations?: RagCitation[] } | undefined;
  const citations = Array.isArray(agentState?.citations) ? agentState.citations : [];

  return (
    <div className="project-chat-experience">
      <div className="project-chat-main">
        <button
          className="knowledge-open"
          type="button"
          aria-expanded={knowledgeOpen}
          aria-controls="project-knowledge-base"
          onClick={() => setKnowledgeOpen(true)}
        >
          <span aria-hidden="true">▤</span>
          {dictionary.chat.knowledge}
        </button>
        <CopilotChat
          agentId="default"
          className="chat-surface"
          threadId={project.id}
          autoScroll="pin-to-send"
          scrollView={{ className: "chat-scroll-region" }}
          throttleMs={0}
          labels={{
            welcomeMessageText: `${dictionary.chat.welcomePrefix} ${project.name}?`,
            chatInputPlaceholder: dictionary.chat.messagePlaceholder,
            chatDisclaimerText: "",
          }}
        />
      </div>
      <KnowledgeBaseSidebar
        projectId={project.id}
        open={knowledgeOpen}
        onClose={() => setKnowledgeOpen(false)}
        citations={citations}
      />
    </div>
  );
}
