import { createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import {
  CONSENT_PHRASES,
  MAX_VOICE_FILE_SIZE,
  MAX_VOICE_TEXT_LENGTH,
  voiceFileDetails,
  type ConsentLanguage,
  type VoiceFileExtension,
} from "@/lib/voice/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REQUEST_TIMEOUT_MS = 295_000;

type CloneTokenPayload = {
  version: 2;
  userId: string;
  voiceId: string;
  name: string;
};

type VoiceServiceConfig = {
  apiKey: string;
  baseUrl: string;
  signingSecret: string;
};

class VoiceCloneError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function jsonError(error: unknown, headers: HeadersInit = {}) {
  const knownError =
    error instanceof VoiceCloneError
      ? error
      : new VoiceCloneError("Unable to generate the voice audio.", 502);

  if (!(error instanceof VoiceCloneError)) {
    console.error("Voice generation failed", error);
  }

  return Response.json(
    { detail: knownError.message },
    {
      status: knownError.status,
      headers: {
        "cache-control": "no-store",
        ...Object.fromEntries(new Headers(headers)),
      },
    },
  );
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

type AudioUpload = {
  extension: VoiceFileExtension;
  file: File;
  mimeType: string;
};

function getAudioFile(
  formData: FormData,
  key: string,
  label: string,
): AudioUpload {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) {
    throw new VoiceCloneError(`${label} is required.`, 400);
  }
  if (value.size > MAX_VOICE_FILE_SIZE) {
    throw new VoiceCloneError(`${label} must be 10 MiB or smaller.`, 400);
  }

  const details = voiceFileDetails(value.name);
  if (!details) {
    throw new VoiceCloneError(
      `${label} must be MPEG, WAV, OGG, AAC, FLAC, WebM, or MP4 audio.`,
      400,
    );
  }
  return { file: value, ...details };
}

function normalizedAudioFile(upload: AudioUpload, baseName: string) {
  return new File(
    [new Blob([upload.file], { type: upload.mimeType })],
    `${baseName}.${upload.extension}`,
    { type: upload.mimeType },
  );
}

function validateText(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VoiceCloneError(`${label} is required.`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new VoiceCloneError(
      `${label} must be ${maximum.toLocaleString()} characters or fewer.`,
      400,
    );
  }
  return trimmed;
}

function getVoiceServiceConfig(): VoiceServiceConfig {
  const configuredUrl = process.env.XTTS_SERVICE_URL?.trim();
  const apiKey = process.env.XTTS_SERVICE_API_KEY?.trim();
  const signingSecret =
    process.env.VOICE_CLONE_SIGNING_SECRET?.trim() || apiKey;

  if (!configuredUrl || !apiKey || !signingSecret) {
    throw new VoiceCloneError(
      "Voice Studio is not configured. Add XTTS_SERVICE_URL and XTTS_SERVICE_API_KEY to the server environment.",
      503,
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new VoiceCloneError("XTTS_SERVICE_URL is not a valid URL.", 503);
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new VoiceCloneError("XTTS_SERVICE_URL must use HTTP or HTTPS.", 503);
  }

  return {
    apiKey,
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    signingSecret,
  };
}

function tokenSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createCloneToken(payload: CloneTokenPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${tokenSignature(encoded, secret)}`;
}

function readCloneToken(token: string, userId: string, secret: string) {
  if (token.length > 2048) {
    throw new VoiceCloneError("The saved voice reference is invalid.", 400);
  }
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    throw new VoiceCloneError("The saved voice reference is invalid.", 400);
  }

  const expected = Buffer.from(tokenSignature(encoded, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new VoiceCloneError("The saved voice reference is invalid.", 400);
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<CloneTokenPayload>;
    if (
      payload.version !== 2 ||
      payload.userId !== userId ||
      typeof payload.voiceId !== "string" ||
      !/^voice_[0-9a-f]{32}$/.test(payload.voiceId) ||
      typeof payload.name !== "string"
    ) {
      throw new Error("Invalid payload");
    }
    return payload as CloneTokenPayload;
  } catch {
    throw new VoiceCloneError("The saved voice reference is invalid.", 400);
  }
}

async function voiceServiceError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { detail?: unknown }
    | null;
  const detail =
    typeof payload?.detail === "string" ? payload.detail.trim() : "";

  if (response.status === 401 || response.status === 403) {
    return new VoiceCloneError(
      "The XTTS service rejected its API credentials.",
      503,
    );
  }

  const clientStatus =
    response.status === 429
      ? 429
      : response.status === 404
        ? 404
        : response.status < 500
          ? 400
          : 502;
  return new VoiceCloneError(detail || fallback, clientStatus);
}

async function callVoiceService(
  path: string,
  init: RequestInit,
  config: VoiceServiceConfig,
  fallback: string,
) {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${config.apiKey}`);
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new VoiceCloneError(
        "The XTTS service took too long to respond. It may still be loading the model.",
        504,
      );
    }
    throw new VoiceCloneError("Unable to reach the XTTS voice service.", 502);
  }

  if (!response.ok) throw await voiceServiceError(response, fallback);
  return response;
}

async function createVoice(
  upload: AudioUpload,
  userId: string,
  name: string,
  config: VoiceServiceConfig,
) {
  const body = new FormData();
  body.set("user_id", userId);
  body.set("name", name);
  body.set("audio_sample", normalizedAudioFile(upload, "voice-sample"));

  const response = await callVoiceService(
    "/v1/voices",
    { method: "POST", body },
    config,
    "The XTTS service rejected the voice sample.",
  );
  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  if (
    !payload ||
    typeof payload.id !== "string" ||
    !/^voice_[0-9a-f]{32}$/.test(payload.id)
  ) {
    throw new VoiceCloneError(
      "The XTTS service returned an invalid voice reference.",
      502,
    );
  }
  return payload.id;
}

async function generateSpeech(
  savedVoice: CloneTokenPayload,
  text: string,
  language: ConsentLanguage,
  config: VoiceServiceConfig,
) {
  return callVoiceService(
    "/v1/speech",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: savedVoice.userId,
        voice_id: savedVoice.voiceId,
        text,
        language,
      }),
    },
    config,
    "The XTTS service could not generate speech.",
  );
}

async function deleteVoice(
  savedVoice: CloneTokenPayload,
  config: VoiceServiceConfig,
) {
  await callVoiceService(
    `/v1/voices/${encodeURIComponent(savedVoice.voiceId)}?user_id=${encodeURIComponent(savedVoice.userId)}`,
    { method: "DELETE" },
    config,
    "The XTTS service could not delete the saved voice.",
  );
}

function audioResponse(response: Response, name: string, cloneToken: string) {
  const safeName =
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 48) || "cloned-voice";
  const contentType = response.headers.get("content-type") || "audio/wav";

  if (!response.body) {
    throw new VoiceCloneError("The XTTS service returned no audio.", 502);
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${safeName}-speech.wav"`,
      "content-type": contentType,
      "x-voice-clone-name": encodeURIComponent(name),
      "x-voice-clone-token": cloneToken,
    },
  });
}

function validateSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new VoiceCloneError("Cross-origin requests are not allowed.", 403);
  }
}

async function authenticatedUser(request: Request) {
  validateSameOrigin(request);
  const session = await auth();
  if (!session.userId) {
    throw new VoiceCloneError("User is not signed in.", 401);
  }
  return session.userId;
}

export async function DELETE(request: Request) {
  try {
    const userId = await authenticatedUser(request);
    const config = getVoiceServiceConfig();
    const body = (await request.json().catch(() => null)) as
      | { cloneToken?: unknown }
      | null;
    if (!body) throw new VoiceCloneError("Invalid request body.", 400);

    const cloneToken = validateText(
      body.cloneToken,
      2048,
      "Saved voice reference",
    );
    const savedVoice = readCloneToken(
      cloneToken,
      userId,
      config.signingSecret,
    );
    await deleteVoice(savedVoice, config);
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  let cloneToken = "";
  let cloneName = "";

  try {
    const userId = await authenticatedUser(request);
    const config = getVoiceServiceConfig();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | { cloneToken?: unknown; language?: unknown; text?: unknown }
        | null;
      if (!body) throw new VoiceCloneError("Invalid request body.", 400);

      cloneToken = validateText(body.cloneToken, 2048, "Saved voice reference");
      const savedVoice = readCloneToken(
        cloneToken,
        userId,
        config.signingSecret,
      );
      cloneName = savedVoice.name;
      const text = validateText(body.text, MAX_VOICE_TEXT_LENGTH, "Text");
      const language = validateText(body.language, 8, "Speech language");
      if (!Object.hasOwn(CONSENT_PHRASES, language)) {
        throw new VoiceCloneError("Choose a supported XTTS language.", 400);
      }
      const speech = await generateSpeech(
        savedVoice,
        text,
        language as ConsentLanguage,
        config,
      );
      return audioResponse(speech, cloneName, cloneToken);
    }

    if (!contentType.includes("multipart/form-data")) {
      throw new VoiceCloneError("Expected an audio upload form.", 415);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_VOICE_FILE_SIZE * 2 + 128 * 1024
    ) {
      throw new VoiceCloneError("The combined upload is too large.", 413);
    }

    const formData = await request.formData();
    if (getString(formData, "consentConfirmed") !== "true") {
      throw new VoiceCloneError(
        "Confirm that the speaker owns the voice and authorized its use.",
        400,
      );
    }

    cloneName = validateText(getString(formData, "voiceName"), 64, "Voice name");
    const text = validateText(
      getString(formData, "text"),
      MAX_VOICE_TEXT_LENGTH,
      "Text",
    );
    const language = getString(formData, "language") as ConsentLanguage;
    if (!Object.hasOwn(CONSENT_PHRASES, language)) {
      throw new VoiceCloneError("Choose a supported XTTS language.", 400);
    }

    // The consent recording is validated as part of the consent gate, but only
    // the separate speech sample is sent to and retained by the XTTS service.
    getAudioFile(formData, "consentRecording", "Consent recording");
    const voiceSample = getAudioFile(formData, "voiceSample", "Voice sample");
    const voiceId = await createVoice(
      voiceSample,
      userId,
      cloneName,
      config,
    );

    const savedVoice: CloneTokenPayload = {
      version: 2,
      userId,
      voiceId,
      name: cloneName,
    };
    cloneToken = createCloneToken(savedVoice, config.signingSecret);

    const speech = await generateSpeech(savedVoice, text, language, config);
    return audioResponse(speech, cloneName, cloneToken);
  } catch (error) {
    const headers = new Headers();
    if (cloneToken) {
      headers.set("x-voice-clone-token", cloneToken);
      headers.set("x-voice-clone-name", encodeURIComponent(cloneName));
    }
    return jsonError(error, headers);
  }
}
