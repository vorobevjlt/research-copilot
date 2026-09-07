import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import {
  createSongAccessToken,
  readCloneToken,
} from "@/lib/voice/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 6 * 60 * 60;

class SongSessionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function jsonError(error: unknown) {
  const known =
    error instanceof SongSessionError
      ? error
      : new SongSessionError("Unable to prepare song conversion.", 502);
  if (!(error instanceof SongSessionError)) {
    console.error("Song conversion session failed", error);
  }
  return Response.json(
    { detail: known.message },
    { status: known.status, headers: { "cache-control": "no-store" } },
  );
}

function configuredService() {
  const configuredUrl = process.env.XTTS_SERVICE_URL?.trim();
  const apiKey = process.env.XTTS_SERVICE_API_KEY?.trim();
  const signingSecret =
    process.env.VOICE_CLONE_SIGNING_SECRET?.trim() || apiKey;
  if (!configuredUrl || !apiKey || !signingSecret) {
    throw new SongSessionError("Voice Studio is not configured.", 503);
  }

  let serviceUrl: URL;
  try {
    serviceUrl = new URL(configuredUrl);
  } catch {
    throw new SongSessionError("XTTS_SERVICE_URL is not a valid URL.", 503);
  }
  if (!["http:", "https:"].includes(serviceUrl.protocol)) {
    throw new SongSessionError("XTTS_SERVICE_URL must use HTTP or HTTPS.", 503);
  }

  return {
    apiKey,
    serviceUrl: serviceUrl.toString().replace(/\/$/, ""),
    signingSecret,
  };
}

export async function POST(request: Request) {
  try {
    const requestOrigin = request.headers.get("origin");
    const origin = new URL(request.url).origin;
    if (!requestOrigin || requestOrigin !== origin) {
      throw new SongSessionError("Cross-origin requests are not allowed.", 403);
    }

    const session = await auth();
    if (!session.userId) {
      throw new SongSessionError("User is not signed in.", 401);
    }

    const body = (await request.json().catch(() => null)) as
      | { cloneToken?: unknown }
      | null;
    if (!body || typeof body.cloneToken !== "string") {
      throw new SongSessionError("A saved voice is required.", 400);
    }

    const config = configuredService();
    let voice;
    try {
      voice = readCloneToken(
        body.cloneToken.trim(),
        session.userId,
        config.signingSecret,
      );
    } catch {
      throw new SongSessionError("The saved voice reference is invalid.", 400);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const accessToken = createSongAccessToken(
      {
        version: 1,
        user_id: session.userId,
        voice_id: voice.voiceId,
        origin,
        expires_at: expiresAt,
        nonce: randomBytes(16).toString("hex"),
      },
      config.apiKey,
    );

    return Response.json(
      {
        accessToken,
        expiresAt,
        serviceUrl: config.serviceUrl,
        voiceName: voice.name,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
