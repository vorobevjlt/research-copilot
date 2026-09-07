import { createHmac, timingSafeEqual } from "node:crypto";

export type CloneTokenPayload = {
  version: 2;
  userId: string;
  voiceId: string;
  name: string;
};

function tokenSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCloneToken(payload: CloneTokenPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${tokenSignature(encoded, secret)}`;
}

export function readCloneToken(
  token: string,
  userId: string,
  secret: string,
): CloneTokenPayload {
  if (token.length > 2048) throw new Error("Invalid clone token");

  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    throw new Error("Invalid clone token");
  }

  const expected = Buffer.from(tokenSignature(encoded, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new Error("Invalid clone token");
  }

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
    throw new Error("Invalid clone token");
  }

  return payload as CloneTokenPayload;
}

type SongAccessPayload = {
  version: 1;
  user_id: string;
  voice_id: string;
  origin: string;
  expires_at: number;
  nonce: string;
};

export function createSongAccessToken(
  payload: SongAccessPayload,
  secret: string,
) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${tokenSignature(encoded, secret)}`;
}
