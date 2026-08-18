import { CopilotChat } from "@copilotkit/react-core/v2";
import { auth } from "@clerk/nextjs/server";

export default async function ChatPage() {
  await auth.protect();
  return (
    <main className="chat-app">
      <section className="chat-workspace" id="chat">
        <header className="chat-header">
          <div className="chat-title">
            <span className="mobile-mark" aria-hidden="true">
              AI
            </span>
            <span>AI Assistant</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="m7 10 5 5 5-5"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="header-actions">
            <span className="header-avatar">Y</span>
          </div>
        </header>

        <div className="chat-canvas">
          <CopilotChat
            className="chat-surface"
            autoScroll="pin-to-send"
            throttleMs={0}
            labels={{
              welcomeMessageText: "How can I help you today?",
              chatInputPlaceholder: "Message",
              chatDisclaimerText: "",
            }}
          />
        </div>
      </section>
    </main>
  );
}
