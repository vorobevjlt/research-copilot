import {
  forwardRagResponse,
  ragErrorResponse,
  requestRagService,
} from "@/lib/rag/proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/knowledge/settings">,
) {
  try {
    const { projectId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/settings`,
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
export async function PUT(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/knowledge/settings">,
) {
  try {
    const { projectId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/settings`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: await request.text(),
      },
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
