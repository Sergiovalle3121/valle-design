/**
 * CIDE provider — the self-hosted inference client.
 *
 * CIDE ("Cognitive Intelligence & Decision Engine") is Axos OS's own AI. It does
 * NOT call any external AI vendor (no Anthropic, no DeepSeek, no OpenAI cloud).
 * Instead it talks to an **OpenAI-compatible** inference server that the
 * operator runs and controls — Ollama, vLLM, llama.cpp, TGI — serving an
 * open-weight model. The whole conversation, and all grounded business data,
 * stays inside your own infrastructure.
 *
 * This is a tiny, dependency-free client (Node 20+ global `fetch`) that speaks
 * the Chat Completions API with function/tool calling. Swapping the engine (CPU
 * Ollama in dev → a GPU vLLM cluster in prod) is purely a `CIDE_BASE_URL`
 * change; no code change.
 */

/** A tool offered to the model (OpenAI `function` shape, JSON-Schema params). */
export interface CideToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool invocation the model asked for, with parsed arguments. */
export interface CideToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** A chat message in the OpenAI-compatible wire format. */
export interface CideMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface CideUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CideCompletion {
  content: string;
  toolCalls: CideToolCall[];
  usage: CideUsage;
}

export interface CideProviderOptions {
  /** Base URL of the OpenAI-compatible server, e.g. http://localhost:11434/v1 */
  baseUrl: string;
  /** Model tag to serve, e.g. "qwen2.5:7b". */
  model: string;
  /** Optional bearer token (local engines like Ollama need none). */
  apiKey?: string | null;
  /** Per-request timeout. Local models can be slow on CPU. */
  timeoutMs?: number;
}

interface ChatArgs {
  messages: CideMessage[];
  tools?: CideToolSpec[];
  maxTokens: number;
  temperature?: number;
  /**
   * Señal externa de cancelación (p. ej. `POST /ai/runs/:id/cancel`). Se
   * combina con el timeout del provider; al abortarse, la petición al motor
   * se corta de verdad y se lanza {@link CideAbortError} — no basta con
   * ignorar la respuesta.
   */
  signal?: AbortSignal;
}

interface StreamArgs extends ChatArgs {
  /** Called with each text fragment as the engine streams the answer. */
  onDelta: (text: string) => void;
}

/** Shape of the OpenAI-compatible chat completion response we rely on. */
interface RawCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One streamed chunk of an OpenAI-compatible chat completion (SSE `data:`). */
export interface RawStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/**
 * Reassembles a streamed completion from its SSE chunks. Content is forwarded
 * live via `onDelta`; tool-call fragments (which arrive split across chunks,
 * keyed by `index`) are concatenated; usage is taken from the final chunk when
 * the engine includes it. Pure and engine-agnostic, so it is unit-tested on its
 * own (Ollama and vLLM emit the same OpenAI delta shape).
 */
export class StreamAssembler {
  private content = '';
  private readonly toolCalls = new Map<
    number,
    { id?: string; name?: string; args: string }
  >();
  private usage: CideUsage = { inputTokens: 0, outputTokens: 0 };

  push(chunk: RawStreamChunk, onDelta?: (text: string) => void): void {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) {
      this.content += delta.content;
      onDelta?.(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      const acc = this.toolCalls.get(idx) ?? { args: '' };
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name = tc.function.name;
      if (tc.function?.arguments) acc.args += tc.function.arguments;
      this.toolCalls.set(idx, acc);
    }
    if (chunk.usage) {
      this.usage = {
        inputTokens: chunk.usage.prompt_tokens ?? this.usage.inputTokens,
        outputTokens: chunk.usage.completion_tokens ?? this.usage.outputTokens,
      };
    }
  }

  finish(): CideCompletion {
    const toolCalls: CideToolCall[] = [...this.toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, c]) => c.name)
      .map(([i, c]) => ({
        id: c.id || `call_${i}`,
        name: c.name as string,
        arguments: parseArgs(c.args),
      }));
    return { content: this.content.trim(), toolCalls, usage: this.usage };
  }
}

export class CideEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CideEngineError';
  }
}

/** La petición al motor fue abortada por una cancelación externa. */
export class CideAbortError extends Error {
  constructor() {
    super('La petición al motor de CIDE fue cancelada.');
    this.name = 'CideAbortError';
  }
}

export class CideProvider {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey: string | null;
  private readonly timeoutMs: number;

  constructor(opts: CideProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.endpoint = `${this.baseUrl}/chat/completions`;
    this.model = opts.model;
    this.apiKey = opts.apiKey?.trim() || null;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  /**
   * Liveness probe — GET `${baseUrl}/models`. Returns the model tags the engine
   * is currently serving so an admin can confirm CIDE is reachable and that the
   * configured model is actually loaded. Throws {@link CideEngineError} when the
   * engine is unreachable or replies with a non-2xx status.
   */
  async ping(timeoutMs = 8_000): Promise<{ models: string[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new CideEngineError(
        `No se pudo contactar al motor de CIDE en ${this.baseUrl}: ${reason}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new CideEngineError(
        `El motor de CIDE respondió ${res.status} al listar modelos: ${text.slice(0, 300)}`,
        res.status,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id?: string }>;
    };
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string');
    return { models };
  }

  /** Build the OpenAI-compatible request body shared by chat() and chatStream(). */
  private buildBody(args: ChatArgs, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: args.messages,
      max_tokens: args.maxTokens,
      temperature: args.temperature ?? 0.2,
      stream,
    };
    // Ask the engine to include token usage in the final streamed chunk (vLLM
    // honours this; engines that don't simply ignore the unknown field).
    if (stream) body.stream_options = { include_usage: true };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }
    return body;
  }

  private async post(
    body: Record<string, unknown>,
    signal: AbortSignal,
    external?: AbortSignal,
  ): Promise<Response> {
    try {
      return await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: external ? AbortSignal.any([signal, external]) : signal,
      });
    } catch (e) {
      if (external?.aborted) throw new CideAbortError();
      const reason = e instanceof Error ? e.message : String(e);
      throw new CideEngineError(
        `No se pudo contactar al motor de CIDE en ${this.endpoint}: ${reason}`,
      );
    }
  }

  private async assertOk(res: Response): Promise<void> {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new CideEngineError(
        `El motor de CIDE respondió ${res.status}: ${text.slice(0, 500)}`,
        res.status,
      );
    }
  }

  /** One model turn. Returns the assistant text and any tool calls it requested. */
  async chat(args: ChatArgs): Promise<CideCompletion> {
    if (args.signal?.aborted) throw new CideAbortError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.post(
        this.buildBody(args, false),
        controller.signal,
        args.signal,
      );
    } finally {
      clearTimeout(timer);
    }
    await this.assertOk(res);

    const data = (await res.json()) as RawCompletion;
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls: CideToolCall[] = (msg.tool_calls ?? [])
      .filter((tc) => tc.function?.name)
      .map((tc, i) => ({
        id: tc.id || `call_${i}`,
        name: tc.function!.name as string,
        arguments: parseArgs(tc.function?.arguments),
      }));

    return {
      content: (msg.content ?? '').trim(),
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * One streaming model turn. Identical wire contract to {@link chat} but reads
   * the response as Server-Sent Events, forwarding text fragments through
   * `onDelta` as they arrive and returning the fully assembled completion (text
   * + any tool calls). The agentic loop can therefore stream the final answer
   * while still handling tool calls between rounds.
   */
  async chatStream(args: StreamArgs): Promise<CideCompletion> {
    if (args.signal?.aborted) throw new CideAbortError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.post(
        this.buildBody(args, true),
        controller.signal,
        args.signal,
      );
      await this.assertOk(res);
      if (!res.body) {
        throw new CideEngineError('El motor de CIDE no devolvió un flujo.');
      }
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      const assembler = new StreamAssembler();
      let buffer = '';
      for (;;) {
        if (args.signal?.aborted) {
          await reader.cancel().catch(() => undefined);
          throw new CideAbortError();
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            assembler.push(JSON.parse(payload) as RawStreamChunk, args.onDelta);
          } catch {
            /* keep-alive or partial frame — ignore */
          }
        }
      }
      return assembler.finish();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Tool-call arguments arrive as a JSON string; tolerate malformed output. */
function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
