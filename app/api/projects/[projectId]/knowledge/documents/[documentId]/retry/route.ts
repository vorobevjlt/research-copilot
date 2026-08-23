import {
  forwardRagResponse,
  ragErrorResponse,
  requestRagService,
} from "@/lib/rag/proxy";

export async function POST(
  _request: Request,
  context: RouteContext<
    "/api/projects/[projectId]/knowledge/documents/[documentId]/retry"
  >,
) {
  try {
    const { projectId, documentId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}/retry`,
      { method: "POST" },
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
