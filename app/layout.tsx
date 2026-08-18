import { CopilotKit } from "@copilotkit/react-core";
import { ClerkProvider } from "@clerk/nextjs";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en">
      <body>
        <ClerkProvider>
          <CopilotKit runtimeUrl="/api">{children}</CopilotKit>
        </ClerkProvider>
      </body>
    </html>
  );
}
