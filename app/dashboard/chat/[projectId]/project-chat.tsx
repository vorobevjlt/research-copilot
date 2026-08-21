"use client";

import { CopilotChat, useAgentContext } from "@copilotkit/react-core/v2";

type ProjectChatProps = {
  project: {
    id: string;
    name: string;
    context: string;
  };
};

export function ProjectChat({ project }: ProjectChatProps) {
  useAgentContext({
    description:
      "The active project. Treat this context as authoritative background and keep answers scoped to it unless the user asks otherwise.",
    value: {
      projectName: project.name,
      projectContext: project.context,
    },
  });

  return (
    <CopilotChat
      className="chat-surface"
      threadId={project.id}
      autoScroll="pin-to-send"
      throttleMs={0}
      labels={{
        welcomeMessageText: `What would you like to work on in ${project.name}?`,
        chatInputPlaceholder: "Message",
        chatDisclaimerText: "",
      }}
    />
  );
}
