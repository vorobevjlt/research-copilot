import {
  RagProxyError,
  ragErrorResponse,
  requireProjectAccess,
} from "@/lib/rag/proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/messages">,
) {
  try {
    const { projectId } = await context.params;
    const { session, supabase } = await requireProjectAccess(projectId);
    const { data, error } = await supabase
      .from("messages")
      .select("id, content, role, created_at")
      .eq("chat_id", projectId)
      .eq("clerk_id", session.userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new RagProxyError("Unable to load project messages.", 500);
    }

    return Response.json({ data: data ?? [] });
  } catch (error) {
    return ragErrorResponse(error);
  }
}
