export const DOCUMENT_ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.txt,.md,application/pdf,text/plain,text/markdown";

export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;

export type AnswerMode = "combined" | "knowledge_only";
export type AgentType = "simple" | "agentic";
export type RagStrategy = "hybrid" | "multi-query-hybrid";

export type ProjectDocument = {
  id: string;
  project_id: string;
  filename: string;
  s3_key: string;
  file_size: number;
  file_type: string;
  processing_status: string;
  processing_details: Record<string, unknown> | null;
  source_type: "file" | "url";
  source_url: string | null;
  enabled: boolean;
  created_at: string;
};
export type ProjectSettings = {
  id: string;
  project_id: string;
  embedding_model: string;
  rag_strategy: RagStrategy;
  agent_type: AgentType;
  chunks_per_search: number;
  final_context_size: number;
  similarity_threshold: number;
  number_of_queries: number;
  reranking_enabled: boolean;
  reranking_model: string;
  vector_weight: number;
  keyword_weight: number;
  rag_enabled: boolean;
  answer_mode: AnswerMode;
};

export type RagCitation = {
  chunk_id?: string;
  document_id?: string;
  filename?: string;
  page?: number | string | null;
  sheet?: string | null;
  row_range?: string | null;
};
