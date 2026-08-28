"use client";

import { useAuth } from "@clerk/nextjs";
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

function apiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  return fallback;
}

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { detail?: string }
    | null;

  if (!response.ok) throw new Error(apiMessage(payload, fallback));
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

function statusLabel(status: string) {
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
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
      reject(new Error(`Storage rejected ${file.name} (${request.status}).`));
    });
    request.addEventListener("error", () => {
      reject(new Error(`Storage upload failed for ${file.name}.`));
    });
    request.addEventListener("abort", () => {
      reject(new Error(`Upload cancelled for ${file.name}.`));
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
      "Unable to load project documents.",
    );
    setDocuments(data);
  }, [basePath]);

  const loadSettings = useCallback(async () => {
    const response = await sameOriginFetch(`${basePath}/settings`);
    const data = await readApi<ProjectSettings>(
      response,
      "Unable to load knowledge settings.",
    );
    setSettings({
      ...data,
      rag_enabled: true,
      answer_mode: "knowledge_only",
    });
  }, [basePath]);

  useEffect(() => {
    if (!isAuthLoaded) {
      setLoading(true);
      return;
    }

    if (!isSignedIn) {
      setLoading(false);
      setError("User is not signed in.");
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
              : "Unable to load the knowledge base.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, isSignedIn, loadDocuments, loadSettings]);

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
          "Some files were skipped. Use PDF, DOCX, PPTX, XLSX, TXT, or MD files up to 50 MB.",
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
            }>(signResponse, `Unable to prepare ${file.name} for upload.`);
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
              `Unable to start processing ${file.name}.`,
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
                          : "Upload failed.",
                    }
                  : upload,
              ),
            );
            await loadDocuments().catch(() => undefined);
          }
        }),
      );
    },
    [basePath, loadDocuments],
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
    if (!window.confirm(`Remove ${document.filename} from this project?`)) return;
    try {
      const response = await sameOriginFetch(
        `${basePath}/documents/${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(apiMessage(payload, "Unable to remove the document."));
      }
      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to remove the document.",
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
      await readApi<ProjectDocument>(response, "Unable to retry the document.");
      await loadDocuments();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Unable to retry the document.",
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
        "Unable to save knowledge settings.",
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
          : "Unable to save knowledge settings.",
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
          aria-label="Close knowledge base"
          onClick={onClose}
        />
      ) : null}
      <aside
        id="project-knowledge-base"
        className={`knowledge-sidebar${open ? " is-open" : ""}`}
        aria-label="Project knowledge base"
      >
        <div className="knowledge-header">
          <div>
            <span className="knowledge-kicker">Project context</span>
            <h2>Knowledge base</h2>
          </div>
          <button
            className="knowledge-close"
            type="button"
            aria-label="Close knowledge base"
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
            Sources <span>{documents.length}</span>
          </button>
          <button
            className={tab === "settings" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Settings
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
              <strong>Add project sources</strong>
              <p>Drop files here, or choose from your device.</p>
              <button type="button" onClick={() => fileInput.current?.click()}>
                Choose files
              </button>
              <small>PDF, DOCX, PPTX, XLSX, TXT, MD · 50 MB each</small>
            </div>

            {citations.length > 0 ? (
              <section className="knowledge-citations" aria-label="Latest answer sources">
                <div className="knowledge-section-heading">
                  <h3>Used in latest answer</h3>
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
                        <strong>{citation.filename ?? "Project source"}</strong>
                        <small>
                          {citation.sheet
                            ? `${citation.sheet}${citation.row_range ? ` · ${citation.row_range}` : ""}`
                            : citation.page
                              ? `Page ${citation.page}`
                              : "Relevant passage"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="knowledge-documents">
              <div className="knowledge-section-heading">
                <h3>Project files</h3>
                {hasActiveDocuments ? <span>Processing</span> : null}
              </div>

              {loading ? <p className="knowledge-empty">Loading sources…</p> : null}

              {!loading && sortedDocuments.length === 0 && uploads.length === 0 ? (
                <p className="knowledge-empty">
                  No sources yet. Uploaded files stay isolated to this project.
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
                          ? "Uploaded 100% · Starting processing"
                          : upload.status === "failed"
                            ? upload.error
                            : `Uploading ${upload.progress}%`}
                      </small>
                      {upload.status !== "failed" ? (
                        <div
                          className="knowledge-upload-progress"
                          role="progressbar"
                          aria-label={`Uploading ${upload.name}`}
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
                        aria-label={`Dismiss ${upload.name}`}
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
                          {failure ?? `${statusLabel(document.processing_status)} · ${formatBytes(document.file_size)}`}
                        </small>
                      </div>
                      <div className="knowledge-document-actions">
                        {document.processing_status === "failed" ? (
                          <button
                            type="button"
                            aria-label={`Retry ${document.filename}`}
                            title="Retry processing"
                            onClick={() => void retryDocument(document)}
                          >
                            ↻
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove ${document.filename}`}
                          title="Remove source"
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
              <p className="knowledge-empty">Loading settings…</p>
            ) : (
              <>
                <fieldset>
                  <legend>Agent</legend>
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
                      <strong>Simple agent</strong>
                      <small>
                        Runs a direct search and answers from the most relevant project sources.
                      </small>
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
                      <strong>Supervisor agent</strong>
                      <small>
                        Coordinates a more thorough, multi-step search across project sources.
                      </small>
                    </div>
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Search strategy</legend>
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
                      <strong>Hybrid search</strong>
                      <small>
                        Combines semantic similarity with exact keyword matching.
                      </small>
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
                      <strong>Multi-query hybrid search</strong>
                      <small>
                        Tries several query variations, then combines semantic and keyword results.
                      </small>
                    </div>
                  </label>
                </fieldset>

                <div className="knowledge-settings-note">
                  Answers stay inside this project’s context and uploaded sources. If
                  the available information is insufficient, the agent will say so.
                </div>

                <button
                  className="knowledge-save"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSettings()}
                >
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
