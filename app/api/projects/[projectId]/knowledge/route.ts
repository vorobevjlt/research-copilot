import {
  forwardRagResponse,
  ragErrorResponse,
  requestRagService,
} from "@/lib/rag/proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/knowledge">,
) {
  try {
    const { projectId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
