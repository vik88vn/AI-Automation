import Anthropic from "@anthropic-ai/sdk";

// Canonical chat shape — modeled after Anthropic since their tool API is the cleanest.
// All providers convert to/from this internally.
export type ChatBlock = Anthropic.Messages.TextBlock | Anthropic.Messages.ToolUseBlock;
export type ChatMessage = Anthropic.Messages.MessageParam;
export type ToolDef = Anthropic.Messages.Tool;

export interface ChatResult {
  content: ChatBlock[];
  stopReason: string;
  raw?: unknown;
}

export interface ChatOpts {
  system: string;
  tools: ToolDef[];
  messages: ChatMessage[];
  maxTokens: number;
}

export interface LLMProvider {
  name: ProviderName;
  modelId: string;
  chat(opts: ChatOpts): Promise<ChatResult>;
  health(): Promise<{ ok: boolean; detail: string }>;
}

export type ProviderName = "anthropic" | "openai" | "ollama";

export type ProviderConfig =
  | { provider: "anthropic"; apiKey: string; model?: string }
  | { provider: "openai"; apiKey: string; model?: string; baseUrl?: string }
  | { provider: "ollama"; model?: string; baseUrl?: string };

const DEFAULTS = {
  anthropicModel: "claude-opus-4-7",
  openaiModel: "gpt-4o",
  ollamaModel: "llama3.1",
  ollamaBaseUrl: "http://localhost:11434",
  openaiBaseUrl: "https://api.openai.com/v1",
};

// ──────────────────────────────────────────────────────────────────────────────
// Anthropic
// ──────────────────────────────────────────────────────────────────────────────

export const ANTHROPIC_MODEL_SUGGESTIONS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];
export const OPENAI_MODEL_SUGGESTIONS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"];
export const OLLAMA_MODEL_SUGGESTIONS = [
  "llama3.1",
  "llama3.2",
  "qwen2.5",
  "qwen2.5-coder",
  "mistral",
];

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string = DEFAULTS.anthropicModel) {
    this.client = new Anthropic({ apiKey });
    this.modelId = model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    try {
      const res = await this.client.messages.create({
        model: this.modelId,
        max_tokens: opts.maxTokens,
        tools: opts.tools,
        system: [
          { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
        ],
        messages: opts.messages,
      });
      const content = res.content.filter(
        (b): b is ChatBlock => b.type === "text" || b.type === "tool_use"
      );
      return { content, stopReason: res.stop_reason ?? "", raw: res };
    } catch (err) {
      throw wrapAnthropicError(err, this.modelId);
    }
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: `anthropic ready (${this.modelId})` };
  }
}

export function wrapAnthropicError(err: unknown, modelId: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;

  if (status === 404 && /not_found_error/.test(message)) {
    const m = message.match(/model:\s*([\w.\-:]+)/i);
    const tried = m ? m[1] : modelId;
    const suggestions = ANTHROPIC_MODEL_SUGGESTIONS.map((s) => `  • ${s}`).join("\n");
    return new Error(
      `Anthropic model "${tried}" not found. Open Settings (gear icon) → Anthropic → Model and pick one of:\n${suggestions}\nOr clear the model field to use the default (${DEFAULTS.anthropicModel}).`
    );
  }
  if (status === 401) {
    return new Error(
      `Anthropic API key rejected (401 unauthorized). Open Settings (gear icon) → Anthropic → API key.`
    );
  }
  if (status === 429) {
    return new Error(
      `Anthropic rate-limited or out of credits (429). Try a smaller model (e.g. claude-haiku-4-5), wait, or check your account.`
    );
  }
  return err instanceof Error ? err : new Error(message);
}

// ──────────────────────────────────────────────────────────────────────────────
// OpenAI (chat completions API; no openai package dep, just fetch)
// ──────────────────────────────────────────────────────────────────────────────

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  readonly modelId: string;

  constructor(
    private readonly apiKey: string,
    model: string = DEFAULTS.openaiModel,
    private readonly baseUrl: string = DEFAULTS.openaiBaseUrl
  ) {
    this.modelId = model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const messages = convertToOpenAIMessages(opts.system, opts.messages);
    const tools = opts.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.input_schema as Record<string, unknown>,
      },
    }));
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages,
        tools,
        max_tokens: opts.maxTokens,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw wrapOpenAIError(res.status, text, this.modelId);
    }
    const data = (await res.json()) as {
      choices: Array<{ finish_reason: string; message: OpenAIMessage }>;
    };
    return convertFromOpenAIResponse(data);
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: `openai ready (${this.modelId})` };
  }
}

function wrapOpenAIError(status: number, body: string, modelId: string): Error {
  if (status === 404 || /model_not_found|does not exist|invalid.*model/i.test(body)) {
    const suggestions = OPENAI_MODEL_SUGGESTIONS.map((s) => `  • ${s}`).join("\n");
    return new Error(
      `OpenAI model "${modelId}" not found. Open Settings (gear icon) → OpenAI → Model and pick one of:\n${suggestions}\nOr clear the model field to use the default (${DEFAULTS.openaiModel}).`
    );
  }
  if (status === 401) {
    return new Error(
      `OpenAI API key rejected (401 unauthorized). Open Settings (gear icon) → OpenAI → API key.`
    );
  }
  if (status === 429) {
    return new Error(
      `OpenAI rate-limited or out of quota (429). Try a smaller model (e.g. gpt-4o-mini), wait, or check your account.`
    );
  }
  return new Error(`OpenAI HTTP ${status}: ${body.slice(0, 300)}`);
}

function convertToOpenAIMessages(system: string, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role as "user" | "assistant", content: m.content });
      continue;
    }
    const blocks = m.content;
    if (m.role === "user") {
      const toolResults = blocks.filter(
        (b): b is Anthropic.Messages.ToolResultBlockParam => b.type === "tool_result"
      );
      const textBlocks = blocks.filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: extractStringContent(tr.content),
        });
      }
      if (textBlocks.length > 0) {
        out.push({ role: "user", content: textBlocks.map((t) => t.text).join("\n") });
      }
    } else {
      const textBlocks = blocks.filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      const toolUses = blocks.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
      );
      const text = textBlocks.map((t) => t.text).join("\n");
      const tool_calls: OpenAIToolCall[] | undefined =
        toolUses.length > 0
          ? toolUses.map((tu) => ({
              id: tu.id,
              type: "function" as const,
              function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
            }))
          : undefined;
      out.push({
        role: "assistant",
        content: text.length > 0 ? text : null,
        tool_calls,
      });
    }
  }
  return out;
}

function convertFromOpenAIResponse(data: {
  choices: Array<{ finish_reason: string; message: OpenAIMessage }>;
}): ChatResult {
  const choice = data.choices[0];
  if (!choice) return { content: [], stopReason: "no_choice" };
  const content: ChatBlock[] = [];
  if (choice.message.content) {
    content.push(textBlock(choice.message.content));
  }
  for (const tc of choice.message.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      input = {};
    }
    content.push(toolUseBlock(tc.id, tc.function.name, input));
  }
  const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
  return { content, stopReason, raw: data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Ollama (local)
// ──────────────────────────────────────────────────────────────────────────────

interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}
interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama" as const;
  readonly modelId: string;

  constructor(
    model: string = DEFAULTS.ollamaModel,
    private readonly baseUrl: string = DEFAULTS.ollamaBaseUrl
  ) {
    this.modelId = model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const messages = convertToOllamaMessages(opts.system, opts.messages);
    const tools = opts.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.input_schema as Record<string, unknown>,
      },
    }));
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.modelId,
        messages,
        tools,
        stream: false,
        options: { temperature: 0.2, num_ctx: 16384 },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      message: OllamaMessage;
      done_reason?: string;
    };
    return convertFromOllamaResponse(data);
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`);
      if (!r.ok) return { ok: false, detail: `ollama HTTP ${r.status}` };
      const data = (await r.json()) as { models?: Array<{ name?: string }> };
      const names = (data.models ?? [])
        .map((m) => m.name)
        .filter((x): x is string => Boolean(x));
      const found = names.some(
        (n) => n === this.modelId || n.startsWith(`${this.modelId}:`)
      );
      return found
        ? { ok: true, detail: `ollama ready (${this.modelId})` }
        : {
            ok: false,
            detail: `ollama reachable but model "${this.modelId}" not pulled. Available: ${names.join(", ") || "<none>"}. Run: ollama pull ${this.modelId}`,
          };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        detail: `ollama unreachable at ${this.baseUrl} (${message}). Install: https://ollama.com`,
      };
    }
  }
}

function convertToOllamaMessages(system: string, messages: ChatMessage[]): OllamaMessage[] {
  // Same shape as OpenAI's tool-call protocol; recent Ollama versions accept it.
  const out: OllamaMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role as "user" | "assistant", content: m.content });
      continue;
    }
    const blocks = m.content;
    if (m.role === "user") {
      const toolResults = blocks.filter(
        (b): b is Anthropic.Messages.ToolResultBlockParam => b.type === "tool_result"
      );
      const textBlocks = blocks.filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: extractStringContent(tr.content),
        });
      }
      if (textBlocks.length > 0) {
        out.push({ role: "user", content: textBlocks.map((t) => t.text).join("\n") });
      }
    } else {
      const textBlocks = blocks.filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      const toolUses = blocks.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
      );
      const text = textBlocks.map((t) => t.text).join("\n");
      const tool_calls: OllamaToolCall[] | undefined =
        toolUses.length > 0
          ? toolUses.map((tu) => ({
              id: tu.id,
              function: {
                name: tu.name,
                arguments: (tu.input ?? {}) as Record<string, unknown>,
              },
            }))
          : undefined;
      out.push({ role: "assistant", content: text, tool_calls });
    }
  }
  return out;
}

function convertFromOllamaResponse(data: {
  message: OllamaMessage;
  done_reason?: string;
}): ChatResult {
  const content: ChatBlock[] = [];
  const msg = data.message;
  if (msg.content && msg.content.trim().length > 0) content.push(textBlock(msg.content));
  const toolCalls = msg.tool_calls ?? [];
  for (let i = 0; i < toolCalls.length; i += 1) {
    const tc = toolCalls[i];
    let input: Record<string, unknown>;
    if (typeof tc.function.arguments === "string") {
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        input = {};
      }
    } else {
      input = tc.function.arguments as Record<string, unknown>;
    }
    content.push(
      toolUseBlock(tc.id ?? `ollama_${Date.now()}_${i}`, tc.function.name, input)
    );
  }
  const stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";
  return { content, stopReason, raw: data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function extractStringContent(
  content: Anthropic.Messages.ToolResultBlockParam["content"]
): string {
  if (typeof content === "string") return content;
  return (content ?? [])
    .map((c) => (c.type === "text" ? c.text : ""))
    .filter(Boolean)
    .join("");
}

function textBlock(text: string): Anthropic.Messages.TextBlock {
  return {
    type: "text",
    text,
    citations: null,
  } as Anthropic.Messages.TextBlock;
}

function toolUseBlock(
  id: string,
  name: string,
  input: unknown
): Anthropic.Messages.ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
  } as Anthropic.Messages.ToolUseBlock;
}

// ──────────────────────────────────────────────────────────────────────────────
// Selection
// ──────────────────────────────────────────────────────────────────────────────

export interface ProviderResolverInput {
  preferred?: "auto" | ProviderName;
  anthropicKey?: string;
  anthropicModel?: string;
  openaiKey?: string;
  openaiModel?: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
}

// Default behaviour: Ollama wins unless an Anthropic or OpenAI key is supplied.
// Explicit selection in `preferred` overrides auto.
export function resolveProviderConfig(input: ProviderResolverInput): ProviderConfig {
  const pref = input.preferred ?? "auto";
  const anthropicKey = input.anthropicKey?.trim();
  const openaiKey = input.openaiKey?.trim();

  if (pref === "anthropic") {
    if (!anthropicKey) throw new Error("Provider 'anthropic' selected but no API key set in settings.");
    return { provider: "anthropic", apiKey: anthropicKey, model: input.anthropicModel };
  }
  if (pref === "openai") {
    if (!openaiKey) throw new Error("Provider 'openai' selected but no API key set in settings.");
    return { provider: "openai", apiKey: openaiKey, model: input.openaiModel };
  }
  if (pref === "ollama") {
    return {
      provider: "ollama",
      model: input.ollamaModel,
      baseUrl: input.ollamaBaseUrl,
    };
  }
  // auto
  if (anthropicKey) {
    return { provider: "anthropic", apiKey: anthropicKey, model: input.anthropicModel };
  }
  if (openaiKey) {
    return { provider: "openai", apiKey: openaiKey, model: input.openaiModel };
  }
  return {
    provider: "ollama",
    model: input.ollamaModel,
    baseUrl: input.ollamaBaseUrl,
  };
}

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey, config.model);
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
    case "ollama":
      return new OllamaProvider(config.model, config.baseUrl);
  }
}
