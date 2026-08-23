import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";

export class RagProxyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function requireProjectAccess(projectId: string) {
  const session = await auth();
  if (!session.userId) {
    throw new RagProxyError("User is not signed in.", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_clerk_id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("Unable to authorize project access", {
      projectId,
      code: error.code,
      message: error.message,
    });
    throw new RagProxyError("Unable to authorize project access.", 500);
  }

  if (!data) throw new RagProxyError("Project not found.", 404);

  const token = await session.getToken();
  if (!token) throw new RagProxyError("A valid session token is required.", 401);

  return { session, supabase, token };
}

export async function requestRagService(
  projectId: string,
  path: string,
  init: RequestInit = {},
) {
  const { token } = await requireProjectAccess(projectId);
  const baseUrl = process.env.RAG_SERVER_URL;

  if (!baseUrl) {
    throw new RagProxyError("The knowledge service is not configured.", 503);
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");

  return fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    cache: "no-store",
  });
}

export function forwardRagResponse(response: Response) {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

export function ragErrorResponse(error: unknown) {
  if (error instanceof RagProxyError) {
    return Response.json({ detail: error.message }, { status: error.status });
  }

  console.error("Knowledge service request failed", error);
  return Response.json(
    { detail: "The knowledge service request failed." },
    { status: 502 },
  );
}
