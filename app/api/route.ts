
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";

const ollama = createOpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: ollama.chat(process.env.OLLAMA_MODEL ?? "llama3.1:8b"),
      maxSteps: 5,
    }),
  },
});

const endpoint = copilotRuntimeNextJSAppRouterEndpoint({
  runtime,
  endpoint: "/api",
});

export async function POST(req: NextRequest) {
  return endpoint.handleRequest(req);
}
