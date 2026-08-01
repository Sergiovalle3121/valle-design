/**
 * Adaptador CIDE del puerto CadAiProvider (WP2c).
 *
 * Único lugar (junto con el wiring del módulo) donde cad-documents conoce
 * `../ai/cide-provider`. Construye el CideProvider (chat con tools) o el fetch
 * multimodal (visión) SOLO si `CIDE_BASE_URL` está configurada; sin config el
 * puerto reporta `available:false` y los servicios degradan con gracia sin
 * intentar contactar ningún motor. En Fase 3 el repo Design lo sustituye por
 * su propio proveedor sin tocar el dominio.
 */
import { Injectable } from '@nestjs/common';
import { CideEngineError, CideProvider } from '../ai/cide-provider';
import {
  CadAiChatArgs,
  CadAiChatResult,
  CadAiProvider,
  CadAiProviderError,
  CadAiVisionArgs,
  CadAiVisionResult,
} from './ports/cad-ai-provider.port';

const DEFAULT_CHAT_MODEL = 'qwen2.5:7b';
const DEFAULT_VISION_MODEL = 'qwen2.5vl:7b';
const DEFAULT_VISION_TIMEOUT_MS = 60_000;
const DEFAULT_VISION_MAX_TOKENS = 1_500;

@Injectable()
export class CideAiProviderAdapter implements CadAiProvider {
  /** Configurado ⇔ hay motor. Se lee en caliente para respetar cambios de env. */
  get available(): boolean {
    return Boolean(process.env.CIDE_BASE_URL?.trim());
  }

  private requireBaseUrl(): string {
    const baseUrl = process.env.CIDE_BASE_URL?.trim();
    if (!baseUrl) {
      throw new CadAiProviderError(
        'El motor CIDE no está configurado (CIDE_BASE_URL).',
      );
    }
    return baseUrl;
  }

  private apiKey(): string | null {
    return process.env.CIDE_API_KEY || null;
  }

  /** Chat con tools vía CideProvider (mismo wire contract que hoy). */
  async chat(args: CadAiChatArgs): Promise<CadAiChatResult> {
    const provider = new CideProvider({
      baseUrl: this.requireBaseUrl(),
      model: process.env.CIDE_MODEL || DEFAULT_CHAT_MODEL,
      apiKey: this.apiKey(),
    });
    try {
      const comp = await provider.chat({
        messages: args.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: args.tools,
        maxTokens: args.maxTokens ?? 700,
        temperature: args.temperature,
      });
      return {
        content: comp.content,
        toolCalls: comp.toolCalls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments ?? {},
        })),
      };
    } catch (err) {
      // El fallo del motor cruza el puerto como error neutral, conservando el
      // mensaje (y el status HTTP si lo hubo) para la degradación del servicio.
      if (err instanceof CideEngineError) {
        throw new CadAiProviderError(err.message, err.status);
      }
      throw err;
    }
  }

  /** Llamada multimodal OpenAI-compatible (CideProvider es solo-texto). */
  async vision(args: CadAiVisionArgs): Promise<CadAiVisionResult> {
    const baseUrl = this.requireBaseUrl();
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const apiKey = this.apiKey();
    const model =
      process.env.CIDE_VISION_MODEL ||
      process.env.CIDE_MODEL ||
      DEFAULT_VISION_MODEL;
    const timeoutMs =
      Number(process.env.CIDE_TIMEOUT_MS) || DEFAULT_VISION_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: args.messages,
          temperature: args.temperature ?? 0,
          max_tokens: args.maxTokens ?? DEFAULT_VISION_MAX_TOKENS,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new CadAiProviderError(
          `El motor de visión respondió ${res.status}.`,
          res.status,
        );
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return { raw: data.choices?.[0]?.message?.content ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }
}
