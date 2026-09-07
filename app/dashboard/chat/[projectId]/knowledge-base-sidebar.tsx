"use client";

import { useAppLocale } from "@/app/locale-provider";
import { useAuth } from "@clerk/nextjs";
import { localizeKnownError, type AppLocale } from "@/lib/i18n";
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_SIZE,
  type ProjectDocument,
  type ProjectSettings,
  type RagCitation,
} from "@/lib/rag/types";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type KnowledgeBaseSidebarProps = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  citations: RagCitation[];
};

type SidebarTab = "sources" | "settings";

type LocalUpload = {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "confirming" | "failed";
  error?: string;
};

type ApiEnvelope<T> = { data: T };

const activeStatuses = new Set([
  "uploading",
  "queued",
  "processing",
  "partitioning",
  "chunking",
  "summarising",
  "vectorization",
]);
const supportedExtensions = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "txt",
  "md",
]);

function apiMessage(payload: unknown, fallback: string, locale: AppLocale) {
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

async function readApi<T>(
  response: Response,
  fallback: string,
  locale: AppLocale,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { detail?: string }
    | null;

  if (!response.ok) throw new Error(apiMessage(payload, fallback, locale));
  if (!payload || !("data" in payload)) throw new Error(fallback);
  return payload.data;
}

async function sameOriginFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  return fetch(input, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(
  status: string,
  labels: {
    ready: string;
    failed: string;
    queued: string;
    processing: string;
    partitioning: string;
    chunking: string;
    summarising: string;
    vectorization: string;
    uploading: string;
  },
) {
  if (status === "completed") return labels.ready;
  if (status === "failed") return labels.failed;
  if (status === "queued") return labels.queued;
  if (status === "processing") return labels.processing;
  if (status === "partitioning") return labels.partitioning;
  if (status === "chunking") return labels.chunking;
  if (status === "summarising") return labels.summarising;
  if (status === "vectorization") return labels.vectorization;
  if (status === "uploading") return labels.uploading;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function documentError(document: ProjectDocument) {
  const details = document.processing_details;
  if (!details || typeof details !== "object") return null;
  const directError = details.error;
  if (typeof directError === "string") return directError;
  if (
    directError &&
    typeof directError === "object" &&
    "message" in directError &&
    typeof directError.message === "string"
  ) {
    return directError.message;
  }
  return null;
}

function uploadFileToStorage(
  url: string,
  file: File,
  contentType: string,
  onProgress: (progress: number) => void,
  messages: {
    rejected: string;
    failed: string;
    cancelled: string;
  },
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", contentType);

    request.upload.addEventListener("progress", (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      if (total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`${messages.rejected} ${file.name} (${request.status}).`));
    });
    request.addEventListener("error", () => {
      reject(new Error(`${messages.failed} ${file.name}.`));
    });
    request.addEventListener("abort", () => {
      reject(new Error(`${messages.cancelled} ${file.name}.`));
    });

    request.send(file);
  });
}

export function KnowledgeBaseSidebar({
  projectId,
  open,
  onClose,
  citations,
}: KnowledgeBaseSidebarProps) {
  const { locale, dictionary } = useAppLocale();
  const copy = dictionary.knowledge;
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [tab, setTab] = useState<SidebarTab>("sources");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const basePath = `/api/projects/${encodeURIComponent(projectId)}/knowledge`;

  const loadDocuments = useCallback(async () => {
    const response = await sameOriginFetch(basePath);
    const data = await readApi<ProjectDocument[]>(
      response,
      copy.loadDocumentsError,
      locale,
    );
    setDocuments(data);
  }, [basePath, copy.loadDocumentsError, locale]);

  const loadSettings = useCallback(async () => {
    const response = await sameOriginFetch(`${basePath}/settings`);
    const data = await readApi<ProjectSettings>(
      response,
      copy.loadSettingsError,
      locale,
    );
    setSettings({
      ...data,
      rag_enabled: true,
      answer_mode: "knowledge_only",
    });
  }, [basePath, copy.loadSettingsError, locale]);

  useEffect(() => {
    if (!isAuthLoaded) {
      setLoading(true);
      return;
    }

    if (!isSignedIn) {
      setLoading(false);
      setError(copy.signedOut);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([loadDocuments(), loadSettings()])
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : copy.loadError,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, copy.signedOut, isAuthLoaded, isSignedIn, loadDocuments, loadSettings]);

  const hasActiveDocuments = documents.some((document) =>
    activeStatuses.has(document.processing_status),
  );

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !hasActiveDocuments) return;
    const interval = window.setInterval(() => {
      loadDocuments().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [hasActiveDocuments, isAuthLoaded, isSignedIn, loadDocuments]);

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      ),
    [documents],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        return (
          supportedExtensions.has(extension) && file.size <= MAX_DOCUMENT_SIZE
        );
      });

      if (accepted.length !== files.length) {
        setError(
          copy.skippedFiles,
        );
      } else {
        setError("");
      }

      await Promise.all(
        accepted.map(async (file) => {
          const uploadId = crypto.randomUUID();
          let documentId: string | null = null;
          let stored = false;
          setUploads((current) => [
            ...current,
            {
              id: uploadId,
              name: file.name,
              progress: 0,
              status: "uploading",
            },
          ]);

          try {
            const signResponse = await sameOriginFetch(`${basePath}/upload-url`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                file_size: file.size,
                content_type: file.type || "application/octet-stream",
              }),
            });
            const signed = await readApi<{
              document_id: string;
              upload_url: string;
              s3_key: string;
              content_type: string;
            }>(
              signResponse,
              `${copy.prepareUpload} ${file.name} ${copy.forUpload}`,
              locale,
            );
            documentId = signed.document_id;

            await uploadFileToStorage(
              signed.upload_url,
              file,
              signed.content_type,
              (progress) => {
                setUploads((current) =>
                  current.map((upload) =>
                    upload.id === uploadId && upload.progress !== progress
                      ? { ...upload, progress }
                      : upload,
                  ),
                );
              },
              {
                rejected: copy.storageRejected,
                failed: copy.storageUploadFailed,
                cancelled: copy.uploadCancelled,
              },
            );
            stored = true;

            setUploads((current) =>
              current.map((upload) =>
                upload.id === uploadId
                  ? { ...upload, progress: 100, status: "confirming" }
                  : upload,
              ),
            );

            const confirmResponse = await sameOriginFetch(`${basePath}/confirm`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ document_id: signed.document_id }),
            });
            await readApi<ProjectDocument>(
              confirmResponse,
              `${copy.startProcessing} ${file.name}.`,
              locale,
            );
            setUploads((current) =>
              current.filter((upload) => upload.id !== uploadId),
            );
            await loadDocuments();
          } catch (uploadError) {
            if (documentId && !stored) {
              await sameOriginFetch(
                `${basePath}/documents/${encodeURIComponent(documentId)}`,
                { method: "DELETE" },
              ).catch(() => undefined);
            }
            setUploads((current) =>
              current.map((upload) =>
                upload.id === uploadId
                  ? {
                      ...upload,
                      status: "failed",
                      error:
                        uploadError instanceof Error
                          ? uploadError.message
                          : copy.uploadFailed,
                    }
                  : upload,
              ),
            );
            await loadDocuments().catch(() => undefined);
          }
        }),
      );
    },
    [basePath, copy, loadDocuments, locale],
  );

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  async function removeDocument(document: ProjectDocument) {
    if (
      !window.confirm(
        `${copy.removeConfirmPrefix} ${document.filename} ${copy.removeConfirmSuffix}`,
      )
    ) {
      return;
    }
    try {
      const response = await sameOriginFetch(
        `${basePath}/documents/${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(apiMessage(payload, copy.removeError, locale));
      }
      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : copy.removeError,
      );
    }
  }

  async function retryDocument(document: ProjectDocument) {
    setError("");
    try {
      const response = await sameOriginFetch(
        `${basePath}/documents/${encodeURIComponent(document.id)}/retry`,
        { method: "POST" },
      );
      await readApi<ProjectDocument>(response, copy.retryError, locale);
      await loadDocuments();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : copy.retryError,
      );
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError("");
    try {
      const projectOnlySettings: ProjectSettings = {
        ...settings,
        rag_enabled: true,
        answer_mode: "knowledge_only",
      };
      const response = await sameOriginFetch(`${basePath}/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(projectOnlySettings),
      });
      const updated = await readApi<ProjectSettings>(
        response,
        copy.saveError,
        locale,
      );
      setSettings({
        ...updated,
        rag_enabled: true,
        answer_mode: "knowledge_only",
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : copy.saveError,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open ? (
        <button
          className="knowledge-backdrop"
          type="button"
          aria-label={copy.close}
          onClick={onClose}
        />
      ) : null}
      <aside
        id="project-knowledge-base"
        className={`knowledge-sidebar${open ? " is-open" : ""}`}
        aria-label={copy.panelLabel}
      >
        <div className="knowledge-header">
          <div>
            <span className="knowledge-kicker">{copy.kicker}</span>
            <h2>{copy.title}</h2>
          </div>
          <button
            className="knowledge-close"
            type="button"
            aria-label={copy.close}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="knowledge-tabs" role="tablist">
          <button
            className={tab === "sources" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "sources"}
            onClick={() => setTab("sources")}
          >
            {copy.sources} <span>{documents.length}</span>
          </button>
          <button
            className={tab === "settings" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            {copy.settings}
          </button>
        </div>

        {error ? <p className="knowledge-error">{error}</p> : null}

        {tab === "sources" ? (
          <div className="knowledge-content">
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept={DOCUMENT_ACCEPT}
              multiple
              onChange={handleFileInput}
            />
            <div
              className={`knowledge-dropzone${dragging ? " is-dragging" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="knowledge-upload-mark" aria-hidden="true">
                ↑
              </span>
              <strong>{copy.addSources}</strong>
              <p>{copy.dropFiles}</p>
              <button type="button" onClick={() => fileInput.current?.click()}>
                {copy.chooseFiles}
              </button>
              <small>{copy.fileHelp}</small>
            </div>

            {citations.length > 0 ? (
              <section
                className="knowledge-citations"
                aria-label={copy.latestSourcesLabel}
              >
                <div className="knowledge-section-heading">
                  <h3>{copy.usedLatest}</h3>
                  <span>{citations.length}</span>
                </div>
                <div className="knowledge-citation-list">
                  {citations.slice(0, 5).map((citation, index) => (
                    <div
                      className="knowledge-citation"
                      key={citation.chunk_id ?? `${citation.filename}-${index}`}
                    >
                      <span>{index + 1}</span>
                      <div>
                        <strong>{citation.filename ?? copy.projectSource}</strong>
                        <small>
                          {citation.sheet
                            ? `${citation.sheet}${citation.row_range ? ` · ${citation.row_range}` : ""}`
                            : citation.page
                              ? `${copy.page} ${citation.page}`
                              : copy.relevantPassage}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="knowledge-documents">
              <div className="knowledge-section-heading">
                <h3>{copy.projectFiles}</h3>
                {hasActiveDocuments ? <span>{copy.processing}</span> : null}
              </div>

              {loading ? <p className="knowledge-empty">{copy.loadingSources}</p> : null}

              {!loading && sortedDocuments.length === 0 && uploads.length === 0 ? (
                <p className="knowledge-empty">
                  {copy.noSources}
                </p>
              ) : null}

              <div className="knowledge-document-list">
                {uploads.map((upload) => (
                  <article className="knowledge-document" key={upload.id}>
                    <span className="knowledge-file-type">UP</span>
                    <div className="knowledge-document-copy">
                      <strong title={upload.name}>{upload.name}</strong>
                      <small className={`status-${upload.status}`}>
                        {upload.status === "confirming"
                          ? copy.uploadedStarting
                          : upload.status === "failed"
                            ? upload.error
                            : `${copy.uploading} ${upload.progress}%`}
                      </small>
                      {upload.status !== "failed" ? (
                        <div
                          className="knowledge-upload-progress"
                          role="progressbar"
                          aria-label={`${copy.uploading} ${upload.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={upload.progress}
                        >
                          <span style={{ width: `${upload.progress}%` }} />
                        </div>
                      ) : null}
                    </div>
                    {upload.status === "failed" ? (
                      <button
                        type="button"
                        aria-label={`${copy.dismiss} ${upload.name}`}
                        onClick={() =>
                          setUploads((current) =>
                            current.filter((item) => item.id !== upload.id),
                          )
                        }
                      >
                        ×
                      </button>
                    ) : (
                      <span className="knowledge-spinner" aria-hidden="true" />
                    )}
                  </article>
                ))}

                {sortedDocuments.map((document) => {
                  const extension = document.filename.split(".").pop() ?? "FILE";
                  const failure = documentError(document);
                  return (
                    <article className="knowledge-document" key={document.id}>
                      <span className="knowledge-file-type">
                        {extension.slice(0, 4).toUpperCase()}
                      </span>
                      <div className="knowledge-document-copy">
                        <strong title={document.filename}>{document.filename}</strong>
                        <small className={`status-${document.processing_status}`}>
                          {failure ?? `${statusLabel(document.processing_status, copy)} · ${formatBytes(document.file_size)}`}
                        </small>
                      </div>
                      <div className="knowledge-document-actions">
                        {document.processing_status === "failed" ? (
                          <button
                            type="button"
                            aria-label={`${copy.retry} ${document.filename}`}
                            title={copy.retryProcessing}
                            onClick={() => void retryDocument(document)}
                          >
                            ↻
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`${copy.remove} ${document.filename}`}
                          title={copy.removeSource}
                          onClick={() => void removeDocument(document)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <div className="knowledge-content knowledge-settings">
            {loading || !settings ? (
              <p className="knowledge-empty">{copy.loadingSettings}</p>
            ) : (
              <>
                <fieldset>
                  <legend>{copy.agent}</legend>
                  <label className="knowledge-radio-row">
                    <input
                      type="radio"
                      name="agent-type"
                      value="simple"
                      checked={settings.agent_type === "simple"}
                      onChange={() =>
                        setSettings((current) =>
                          current ? { ...current, agent_type: "simple" } : current,
                        )
                      }
                    />
                    <div>
                      <strong>{copy.simpleAgent}</strong>
                      <small>{copy.simpleAgentDescription}</small>
                    </div>
                  </label>
                  <label className="knowledge-radio-row">
                    <input
                      type="radio"
                      name="agent-type"
                      value="agentic"
                      checked={settings.agent_type === "agentic"}
                      onChange={() =>
                        setSettings((current) =>
                          current ? { ...current, agent_type: "agentic" } : current,
                        )
                      }
                    />
                    <div>
                      <strong>{copy.supervisorAgent}</strong>
                      <small>{copy.supervisorAgentDescription}</small>
                    </div>
                  </label>
                </fieldset>

                <fieldset>
                  <legend>{copy.searchStrategy}</legend>
                  <label className="knowledge-radio-row">
                    <input
                      type="radio"
                      name="rag-strategy"
                      value="hybrid"
                      checked={settings.rag_strategy === "hybrid"}
                      onChange={() =>
                        setSettings((current) =>
                          current ? { ...current, rag_strategy: "hybrid" } : current,
                        )
                      }
                    />
                    <div>
                      <strong>{copy.hybridSearch}</strong>
                      <small>{copy.hybridSearchDescription}</small>
                    </div>
                  </label>
                  <label className="knowledge-radio-row">
                    <input
                      type="radio"
                      name="rag-strategy"
                      value="multi-query-hybrid"
                      checked={settings.rag_strategy === "multi-query-hybrid"}
                      onChange={() =>
                        setSettings((current) =>
                          current
                            ? { ...current, rag_strategy: "multi-query-hybrid" }
                            : current,
                        )
                      }
                    />
                    <div>
                      <strong>{copy.multiQuerySearch}</strong>
                      <small>{copy.multiQuerySearchDescription}</small>
                    </div>
                  </label>
                </fieldset>

                <div className="knowledge-settings-note">
                  {copy.settingsNote}
                </div>

                <button
                  className="knowledge-save"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSettings()}
                >
                  {saving ? copy.saving : copy.saveSettings}
                </button>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
