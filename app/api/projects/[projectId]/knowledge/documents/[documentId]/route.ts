import {
  forwardRagResponse,
  ragErrorResponse,
  requestRagService,
} from "@/lib/rag/proxy";

export async function DELETE(
  _request: Request,
  context: RouteContext<
    "/api/projects/[projectId]/knowledge/documents/[documentId]"
  >,
) {
  try {
    const { projectId, documentId } = await context.params;
    const response = await requestRagService(
      projectId,
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}`,
      { method: "DELETE" },
    );
    return forwardRagResponse(response);
  } catch (error) {
    return ragErrorResponse(error);
  }
}
