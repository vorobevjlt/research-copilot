"use client";

import { useAppLocale } from "@/app/locale-provider";
import {
  localizeKnownError,
  type AppDictionary,
  type AppLocale,
} from "@/lib/i18n";
import { VOICE_FILE_ACCEPT, voiceFileDetails } from "@/lib/voice/constants";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const MAX_SONG_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SONG_DURATION = 5 * 60;
const POLL_INTERVAL_MS = 3_000;

type SavedVoice = {
  name: string;
  token: string;
};

type SongSession = {
  accessToken: string;
  serviceUrl: string;
};

type SongJob = {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  phase: string;
  progress: number;
  error?: string | null;
};

type SongVoiceConverterProps = {
  onCreateVoice: () => void;
  onPendingChange: (pending: boolean) => void;
  savedVoice: SavedVoice | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (callback: () => void) => {
      URL.revokeObjectURL(url);
      callback();
    };
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error("timeout"))),
      8_000,
    );

    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timeout);
        finish(() => resolve(audio.duration));
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        finish(() => reject(new Error("decode")));
      },
      { once: true },
    );
    audio.src = url;
  });
}

function apiError(payload: unknown, fallback: string, locale: AppLocale) {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return localizeKnownError(payload.detail, locale);
  }
  return fallback;
}

function phaseLabel(
  phase: string,
  copy: AppDictionary["voice"],
) {
  const labels: Record<string, string> = {
    queued: copy.queuedSong,
    preparing: copy.preparingAudio,
    separating: copy.separatingVocals,
    converting: copy.convertingVocal,
    remixing: copy.remixingSong,
    ready: copy.finishingSong,
  };
  return labels[phase] ?? copy.finishingSong;
}

function waitForNextPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function SongVoiceConverter({
  onCreateVoice,
  onPendingChange,
  savedVoice,
}: SongVoiceConverterProps) {
  const { locale, dictionary } = useAppLocale();
  const copy = dictionary.voice;
  const [song, setSong] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>();
  const [authorized, setAuthorized] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [downloadName, setDownloadName] = useState("converted-song.mp3");
  const audioUrlRef = useRef("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  async function chooseSong(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setError("");
    setSong(null);
    setDuration(undefined);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = "";
    setAudioUrl("");
    if (!voiceFileDetails(file.name)) {
      setError(copy.invalidFile);
      return;
    }
    if (file.size > MAX_SONG_FILE_SIZE) {
      setError(copy.songTooLarge);
      return;
    }

    let nextDuration: number | undefined;
    try {
      const measured = await fileDuration(file);
      if (Number.isFinite(measured) && measured > 0) {
        nextDuration = measured;
      }
    } catch {
      nextDuration = undefined;
    }
    if (nextDuration && nextDuration > MAX_SONG_DURATION) {
      setError(copy.songTooLong);
      return;
    }
    setDuration(nextDuration);
    setSong(file);
  }

  async function prepareSession(signal: AbortSignal) {
    if (!savedVoice) throw new Error(copy.noSongVoice);
    const response = await fetch("/api/song-conversion/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ cloneToken: savedVoice.token }),
      signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | SongSession
      | { detail?: unknown }
      | null;
    if (!response.ok) {
      throw new Error(apiError(payload, copy.songSessionFailed, locale));
    }
    if (
      !payload ||
      !("accessToken" in payload) ||
      typeof payload.accessToken !== "string" ||
      typeof payload.serviceUrl !== "string"
    ) {
      throw new Error(copy.songSessionFailed);
    }
    return payload as SongSession;
  }

  async function readJob(
    session: SongSession,
    jobId: string,
    signal: AbortSignal,
  ) {
    const response = await fetch(
      `${session.serviceUrl}/v1/song-conversions/${encodeURIComponent(jobId)}`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        credentials: "omit",
        cache: "no-store",
        signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | SongJob
      | { detail?: unknown }
      | null;
    if (!response.ok) {
      throw new Error(apiError(payload, copy.songStatusFailed, locale));
    }
    return payload as SongJob;
  }

  async function downloadResult(
    session: SongSession,
    jobId: string,
    signal: AbortSignal,
  ) {
    const response = await fetch(
      `${session.serviceUrl}/v1/song-conversions/${encodeURIComponent(jobId)}/result`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        credentials: "omit",
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(apiError(payload, copy.songFailed, locale));
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("audio/") || blob.size === 0) {
      throw new Error(copy.invalidSongResult);
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    const safeName =
      song?.name
        .replace(/\.[^.]+$/, "")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 48) || "converted-song";
    setDownloadName(`${safeName}-new-voice.mp3`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!savedVoice) {
      setError(copy.noSongVoice);
      return;
    }
    if (!song || !authorized) {
      const missing = [
        !song ? copy.songFileRequirement : "",
        !authorized ? copy.songConsentRequirement : "",
      ].filter(Boolean);
      setError(`${copy.completeFields}: ${missing.join(", ")}.`);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    onPendingChange(true);
    setProgress(2);
    setStatus(copy.preparingSong);

    try {
      const session = await prepareSession(controller.signal);
      setProgress(5);
      setStatus(copy.uploadingSong);
      const body = new FormData();
      body.set("song", song);
      const uploadResponse = await fetch(
        `${session.serviceUrl}/v1/song-conversions`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${session.accessToken}` },
          credentials: "omit",
          body,
          signal: controller.signal,
        },
      );
      const uploadPayload = (await uploadResponse.json().catch(() => null)) as
        | SongJob
        | { detail?: unknown }
        | null;
      if (!uploadResponse.ok) {
        throw new Error(apiError(uploadPayload, copy.songFailed, locale));
      }
      if (!uploadPayload || !("id" in uploadPayload)) {
        throw new Error(copy.songFailed);
      }

      let job = uploadPayload as SongJob;
      while (job.status === "queued" || job.status === "processing") {
        setProgress(job.progress);
        setStatus(phaseLabel(job.phase, copy));
        await waitForNextPoll(controller.signal);
        job = await readJob(session, job.id, controller.signal);
      }
      if (job.status === "failed") {
        throw new Error(
          job.error
            ? localizeKnownError(job.error, locale)
            : copy.songFailed,
        );
      }

      setProgress(100);
      setStatus(copy.songReadyToReview);
      await downloadResult(session, job.id, controller.signal);
    } catch (submissionError) {
      if (
        submissionError instanceof DOMException &&
        submissionError.name === "AbortError"
      ) {
        return;
      }
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : copy.songFailed,
      );
      setStatus("");
      setProgress(0);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setPending(false);
      onPendingChange(false);
    }
  }

  const missingRequirements = [
    !savedVoice ? copy.savedVoiceRequirement : "",
    !song ? copy.songFileRequirement : "",
    !authorized ? copy.songConsentRequirement : "",
  ].filter(Boolean);

  return (
    <form className="voice-studio" noValidate onSubmit={submit}>
      <div className="voice-builder">
        <div className="voice-section-heading">
          <div>
            <span>01</span>
            <div>
              <p>{copy.songIdentity}</p>
              <h2>{copy.songTitle}</h2>
            </div>
          </div>
        </div>
        <p className="song-description">{copy.songDescription}</p>

        {savedVoice ? (
          <div className="saved-voice-card">
            <div className="saved-voice-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>{savedVoice.name}</strong>
              <small>{copy.savedVoiceReady}</small>
            </div>
          </div>
        ) : (
          <div className="song-voice-needed">
            <p>{copy.noSongVoice}</p>
            <button type="button" onClick={onCreateVoice}>
              {copy.createVoiceFirst}
            </button>
          </div>
        )}

        <div className="voice-divider" />

        <div className="voice-section-heading">
          <div>
            <span>02</span>
            <div>
              <p>{copy.songFile}</p>
              <h2>{copy.replaceSongVoice}</h2>
            </div>
          </div>
        </div>

        <label className="voice-upload-card song-upload-card" htmlFor="song-file">
          <input
            className="visually-hidden"
            id="song-file"
            type="file"
            accept={VOICE_FILE_ACCEPT}
            disabled={pending}
            onChange={(event) => void chooseSong(event)}
          />
          <span className="voice-upload-icon" aria-hidden="true">
            ♪
          </span>
          <span className="voice-upload-copy">
            <strong>{copy.songFile}</strong>
            <small>
              {song
                ? `${song.name}${duration ? ` · ${duration.toFixed(1)}s` : ""} · ${formatBytes(song.size)}`
                : copy.songFileHelp}
            </small>
          </span>
          <span className="voice-upload-action">
            {song ? copy.replace : copy.chooseFile}
          </span>
        </label>

        <label className="voice-consent-check song-consent-check">
          <input
            type="checkbox"
            checked={authorized}
            disabled={pending}
            onChange={(event) => setAuthorized(event.target.checked)}
            required
          />
          <span>{copy.songConsent}</span>
        </label>

        {error ? (
          <p className="voice-error" role="alert">
            {error}
          </p>
        ) : null}

        {pending ? (
          <div
            className="song-progress"
            id="song-progress-status"
            aria-live="polite"
          >
            <div>
              <span>{status}</span>
              <strong>{progress}%</strong>
            </div>
            <progress max="100" value={progress} />
          </div>
        ) : (
          <p
            className="voice-submit-status"
            id="song-submit-status"
            data-ready={missingRequirements.length === 0}
          >
            {missingRequirements.length > 0
              ? `${copy.stillNeeded}: ${missingRequirements.join(", ")}.`
              : copy.songReady}
          </p>
        )}

        <button
          className="voice-generate"
          type="submit"
          disabled={pending || missingRequirements.length > 0}
          aria-busy={pending}
          aria-describedby={
            pending ? "song-progress-status" : "song-submit-status"
          }
        >
          <span aria-hidden="true">{pending ? "◌" : "♪"}</span>
          {pending ? status : copy.replaceSongVoice}
        </button>
      </div>

      <aside className="voice-output" aria-label={copy.songOutputLabel}>
        <div className="voice-output-topline">
          <span>{copy.songOutput}</span>
          <span className="synthetic-badge">{copy.convertedBadge}</span>
        </div>

        {audioUrl ? (
          <div className="voice-result">
            <div className="song-result-art" aria-hidden="true">
              <span>♪</span>
            </div>
            <div>
              <p>{copy.songReadyToReview}</p>
              <h2>{song?.name ?? copy.songOutput}</h2>
            </div>
            <audio controls src={audioUrl} preload="metadata">
              {copy.audioUnsupported}
            </audio>
            <a className="voice-download" href={audioUrl} download={downloadName}>
              {copy.downloadSong} <span aria-hidden="true">↓</span>
            </a>
          </div>
        ) : (
          <div className="voice-output-empty">
            <div className="voice-empty-orbit song-empty-orbit" aria-hidden="true">
              <span>♪</span>
            </div>
            <h2>{copy.songEmptyTitle}</h2>
            <p>{copy.songEmptyDescription}</p>
          </div>
        )}

        <div className="voice-privacy-note">
          <span aria-hidden="true">i</span>
          <p>{copy.songPrivacy}</p>
        </div>
      </aside>
    </form>
  );
}
