import {
  forwardRagResponse,
  ragErrorResponse,
  requestRagService,
} from "@/lib/rag/proxy";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/knowledge/confirm">,
) {
  try {
    const { projectId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/files/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await request.text(),
      },
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
