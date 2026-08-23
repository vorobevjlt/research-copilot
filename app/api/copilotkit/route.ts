import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";
import type { NextRequest } from "next/server";
import {
  RagProxyError,
  ragErrorResponse,
  requireProjectAccess,
} from "@/lib/rag/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const projectId = request.headers.get("x-project-id")?.trim();
    if (!projectId) throw new RagProxyError("Project ID is required.", 400);

    const { token } = await requireProjectAccess(projectId);
    const baseUrl = process.env.RAG_SERVER_URL;
    if (!baseUrl) {
      throw new RagProxyError("The knowledge service is not configured.", 503);
    }

    const runtimeInstance = new CopilotRuntime({
      agents: {
        default: new LangGraphHttpAgent({
          agentId: "default",
          url: new URL("/api/agents/project", baseUrl).toString(),
          headers: {
            authorization: `Bearer ${token}`,
            "x-project-id": projectId,
          },
        }),
      },
    });

    const endpoint = copilotRuntimeNextJSAppRouterEndpoint({
      runtime: runtimeInstance,
      endpoint: "/api/copilotkit",
    });

    return endpoint.handleRequest(request);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
