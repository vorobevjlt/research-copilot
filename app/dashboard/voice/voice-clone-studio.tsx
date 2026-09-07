"use client";

import { useAppLocale } from "@/app/locale-provider";
import {
  localizeKnownError,
  type AppDictionary,
  type AppLocale,
} from "@/lib/i18n";
import {
  CONSENT_PHRASES,
  MAX_VOICE_FILE_SIZE,
  MAX_VOICE_TEXT_LENGTH,
  VOICE_FILE_ACCEPT,
  voiceFileDetails,
  type ConsentLanguage,
} from "@/lib/voice/constants";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type SavedVoice = {
  name: string;
  token: string;
};

type AudioField = "consent" | "sample";

const STORAGE_KEY = "research-copilot.voice-clone.xtts-v2";
const WAVEFORM_HEIGHTS = Array.from(
  { length: 19 },
  (_, index) => 22 + ((index * 17) % 54),
);
const LANGUAGE_CODES = Object.keys(CONSENT_PHRASES) as ConsentLanguage[];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeHeader(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
}

function errorMessage(payload: unknown, fallback: string, locale: AppLocale) {
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

function audioDuration(file: File, readError: string) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error(readError));
    }, 8000);

    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error(readError));
      },
      { once: true },
    );
    audio.src = url;
  });
}

async function validateAudio(file: File, copy: AppDictionary["voice"]) {
  if (!voiceFileDetails(file.name)) {
    throw new Error(copy.invalidFile);
  }
  if (file.size > MAX_VOICE_FILE_SIZE) {
    throw new Error(copy.fileTooLarge);
  }

  try {
    const duration = await audioDuration(file, copy.browserReadError);
    if (!Number.isFinite(duration) || duration <= 0) return undefined;
    return duration;
  } catch {
    return undefined;
  }
}

function selectedFileLabel(file: File, duration?: number) {
  const durationLabel = duration ? ` · ${duration.toFixed(1)}s` : "";
  return `${file.name}${durationLabel} · ${formatBytes(file.size)}`;
}

export function VoiceCloneStudio() {
  const { locale, dictionary } = useAppLocale();
  const copy = dictionary.voice;
  const [savedVoice, setSavedVoice] = useState<SavedVoice | null>(null);
  const [useSavedVoice, setUseSavedVoice] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [language, setLanguage] = useState<ConsentLanguage>(locale);
  const [consentRecording, setConsentRecording] = useState<File | null>(null);
  const [voiceSample, setVoiceSample] = useState<File | null>(null);
  const [durations, setDurations] = useState<Partial<Record<AudioField, number>>>(
    {},
  );
  const [text, setText] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [downloadName, setDownloadName] = useState("cloned-voice-speech.wav");
  const audioUrlRef = useRef("");

  useEffect(() => {
    let voice: SavedVoice | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<SavedVoice>;
      if (typeof parsed.name === "string" && typeof parsed.token === "string") {
        voice = { name: parsed.name, token: parsed.token };
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    if (!voice) return;
    const frame = window.requestAnimationFrame(() => {
      setSavedVoice(voice);
      setUseSavedVoice(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  function rememberVoice(voice: SavedVoice) {
    setSavedVoice(voice);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voice));
  }

  async function forgetVoice() {
    if (!savedVoice) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/voice-clone", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ cloneToken: savedVoice.token }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(errorMessage(payload, copy.deleteError, locale));
      }
      window.localStorage.removeItem(STORAGE_KEY);
      setSavedVoice(null);
      setUseSavedVoice(false);
    } catch (deletionError) {
      setError(
        deletionError instanceof Error
          ? deletionError.message
          : copy.deleteError,
      );
    } finally {
      setDeleting(false);
    }
  }

  function showAudio(blob: Blob, name: string) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    const safeName =
      name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 48) || "cloned-voice";
    setDownloadName(`${safeName}-speech.wav`);
  }

  async function chooseAudio(
    event: ChangeEvent<HTMLInputElement>,
    field: AudioField,
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setError("");
    try {
      const duration = await validateAudio(file, copy);
      setDurations((current) => ({ ...current, [field]: duration }));
      if (field === "consent") setConsentRecording(file);
      else setVoiceSample(file);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : copy.fileUseError,
      );
    }
  }

  const missingRequirements: string[] = [];
  if (useSavedVoice) {
    if (!savedVoice) missingRequirements.push(copy.savedVoiceRequirement);
  } else {
    if (!voiceName.trim()) missingRequirements.push(copy.voiceNameRequirement);
    if (!consentRecording) missingRequirements.push(copy.consentRecordingRequirement);
    if (!voiceSample) missingRequirements.push(copy.voiceSampleRequirement);
    if (!consentConfirmed) missingRequirements.push(copy.consentConfirmationRequirement);
  }
  if (!text.trim()) missingRequirements.push(copy.speechTextRequirement);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (missingRequirements.length > 0) {
      setError(
        `${copy.completeFields}: ${missingRequirements.join(", ")}.`,
      );
      return;
    }

    setPending(true);

    try {
      let response: Response;
      if (useSavedVoice) {
        if (!savedVoice) {
          throw new Error(copy.chooseVoice);
        }
        response = await fetch("/api/voice-clone", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            cloneToken: savedVoice.token,
            language,
            text,
          }),
        });
      } else {
        if (!consentRecording || !voiceSample) {
          throw new Error(copy.addRecordings);
        }
        const body = new FormData();
        body.set("voiceName", voiceName);
        body.set("language", language);
        body.set("consentRecording", consentRecording);
        body.set("voiceSample", voiceSample);
        body.set("text", text);
        body.set("consentConfirmed", String(consentConfirmed));
        response = await fetch("/api/voice-clone", {
          method: "POST",
          credentials: "same-origin",
          body,
        });
      }

      const returnedToken = response.headers.get("x-voice-clone-token");
      const returnedName = decodeHeader(
        response.headers.get("x-voice-clone-name"),
        savedVoice?.name || voiceName,
      );
      if (returnedToken) {
        rememberVoice({ name: returnedName, token: returnedToken });
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = errorMessage(payload, copy.unableGenerate, locale);
        if (returnedToken) {
          setUseSavedVoice(true);
          throw new Error(
            `${copy.partialFailure} ${message}`,
          );
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("audio/") || blob.size === 0) {
        throw new Error(copy.invalidAudio);
      }
      showAudio(blob, returnedName);
      setUseSavedVoice(true);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : copy.unableGenerate,
      );
    } finally {
      setPending(false);
    }
  }

  const activeName = useSavedVoice ? savedVoice?.name ?? copy.savedVoice : voiceName;

  return (
    <form className="voice-studio" noValidate onSubmit={submit}>
      <div className="voice-builder">
        <div className="voice-section-heading">
          <div>
            <span>01</span>
            <div>
              <p>{copy.voiceIdentity}</p>
              <h2>
                {useSavedVoice ? copy.useSavedVoice : copy.createCustomVoice}
              </h2>
            </div>
          </div>
          {savedVoice ? (
            <button
              className="voice-mode-button"
              type="button"
              onClick={() => {
                setUseSavedVoice((current) => !current);
                setError("");
              }}
            >
              {useSavedVoice
                ? copy.createAnother
                : `${copy.useVoice} ${savedVoice.name}`}
            </button>
          ) : null}
        </div>

        {useSavedVoice && savedVoice ? (
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
            <button
              type="button"
              disabled={deleting || pending}
              onClick={() => void forgetVoice()}
            >
              {deleting ? copy.deleting : copy.forget}
            </button>
          </div>
        ) : (
          <div className="voice-new-fields">
            <div className="voice-field-row">
              <label className="voice-field">
                <span>{copy.voiceName}</span>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(event) => setVoiceName(event.target.value)}
                  maxLength={64}
                  autoComplete="off"
                  placeholder={copy.voiceNamePlaceholder}
                  required
                />
              </label>
              <label className="voice-field">
                <span>{copy.voiceAndSpeechLanguage}</span>
                <select
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as ConsentLanguage)
                  }
                >
                  {LANGUAGE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {dictionary.languageNames[code]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="consent-script">
              <span>{copy.readConsent}</span>
              <p lang={language}>{CONSENT_PHRASES[language]}</p>
            </div>

            <div className="voice-upload-grid">
              <label className="voice-upload-card" htmlFor="consent-recording">
                <input
                  className="visually-hidden"
                  id="consent-recording"
                  type="file"
                  accept={VOICE_FILE_ACCEPT}
                  onChange={(event) => void chooseAudio(event, "consent")}
                />
                <span className="voice-upload-icon" aria-hidden="true">
                  C
                </span>
                <span className="voice-upload-copy">
                  <strong>{copy.consentRecording}</strong>
                  <small>
                    {consentRecording
                      ? selectedFileLabel(
                          consentRecording,
                          durations.consent,
                        )
                      : copy.consentRecordingHelp}
                  </small>
                </span>
                <span className="voice-upload-action">
                  {consentRecording ? copy.replace : copy.chooseFile}
                </span>
              </label>

              <label className="voice-upload-card" htmlFor="voice-sample">
                <input
                  className="visually-hidden"
                  id="voice-sample"
                  type="file"
                  accept={VOICE_FILE_ACCEPT}
                  onChange={(event) => void chooseAudio(event, "sample")}
                />
                <span className="voice-upload-icon" aria-hidden="true">
                  S
                </span>
                <span className="voice-upload-copy">
                  <strong>{copy.voiceSample}</strong>
                  <small>
                    {voiceSample
                      ? selectedFileLabel(voiceSample, durations.sample)
                      : copy.voiceSampleHelp}
                  </small>
                </span>
                <span className="voice-upload-action">
                  {voiceSample ? copy.replace : copy.chooseFile}
                </span>
              </label>
            </div>

            <label className="voice-consent-check">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(event) => setConsentConfirmed(event.target.checked)}
                required
              />
              <span>
                {copy.consentConfirmation}
              </span>
            </label>
          </div>
        )}

        <div className="voice-divider" />

        <div className="voice-section-heading">
          <div>
            <span>02</span>
            <div>
              <p>{copy.speechContent}</p>
              <h2>{copy.speechTitle}</h2>
            </div>
          </div>
          <small>{text.length.toLocaleString()} / {MAX_VOICE_TEXT_LENGTH.toLocaleString()}</small>
        </div>

        {useSavedVoice ? (
          <label className="voice-field">
            <span>{copy.speechLanguage}</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as ConsentLanguage)
              }
            >
              {LANGUAGE_CODES.map((code) => (
                <option key={code} value={code}>
                  {dictionary.languageNames[code]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="voice-field voice-text-field">
          <span className="visually-hidden">{copy.textToSpeak}</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_VOICE_TEXT_LENGTH}
            rows={8}
            placeholder={copy.textPlaceholder}
            required
          />
        </label>

        {error ? (
          <p className="voice-error" role="alert">
            {error}
          </p>
        ) : null}

        <p
          className="voice-submit-status"
          id="voice-submit-status"
          data-ready={missingRequirements.length === 0}
        >
          {missingRequirements.length > 0
            ? `${copy.stillNeeded}: ${missingRequirements.join(", ")}.`
            : copy.readyToGenerate}
        </p>

        <button
          className="voice-generate"
          type="submit"
          disabled={pending}
          aria-busy={pending}
          aria-describedby="voice-submit-status"
        >
          <span aria-hidden="true">{pending ? "◌" : "▶"}</span>
          {pending
            ? useSavedVoice
              ? copy.generating
              : copy.creating
            : useSavedVoice
              ? copy.generateSaved
              : copy.cloneAndGenerate}
        </button>
      </div>

      <aside className="voice-output" aria-label={copy.outputLabel}>
        <div className="voice-output-topline">
          <span>{copy.output}</span>
          <span className="synthetic-badge">{copy.syntheticBadge}</span>
        </div>

        {audioUrl ? (
          <div className="voice-result">
            <div className="voice-result-art" aria-hidden="true">
              {WAVEFORM_HEIGHTS.map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div>
              <p>{copy.readyToReview}</p>
              <h2>{activeName || copy.customVoice}</h2>
            </div>
            <audio controls src={audioUrl} preload="metadata">
              {copy.audioUnsupported}
            </audio>
            <a className="voice-download" href={audioUrl} download={downloadName}>
              {copy.download} <span aria-hidden="true">↓</span>
            </a>
          </div>
        ) : (
          <div className="voice-output-empty">
            <div className="voice-empty-orbit" aria-hidden="true">
              <span />
            </div>
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyDescription}</p>
          </div>
        )}

        <div className="voice-privacy-note">
          <span aria-hidden="true">i</span>
          <p>{copy.privacy}</p>
        </div>
      </aside>
    </form>
  );
}
