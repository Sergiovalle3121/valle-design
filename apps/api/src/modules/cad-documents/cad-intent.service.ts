/**
 * NL→CAD backend (Fase 69) — servicio mediador.
 *
 * Recibe la instrucción en lenguaje natural del usuario, arma el contexto del
 * layout, llama al motor de IA a través del puerto neutral CadAiProvider
 * (WP2c) ofreciéndole las herramientas CAD, y devuelve las tool-calls CRUDAS
 * (name + arguments). La validación/normalización a acciones aplicables ocurre
 * en el frontend (`cad-intent.ts` → normalizeToolCalls), única fuente de esa
 * lógica.
 *
 * Degrada con gracia: si el puerto no está inyectado, el motor no está
 * configurado (`available:false`) o falla, responde `{ available:false, ... }`
 * en vez de lanzar 500, igual que el módulo de IA.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  CAD_AI_PROVIDER,
  CadAiProviderError,
} from './ports/cad-ai-provider.port';
import type { CadAiProvider } from './ports/cad-ai-provider.port';
import {
  CAD_INTENT_TOOLS,
  buildCadIntentSystemPrompt,
} from './cad-intent-tools';

const CAD_INTENT_MAX_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS) || 700;

export interface CadIntentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CadIntentResponse {
  available: boolean;
  toolCalls: CadIntentToolCall[];
  message?: string;
}

/**
 * Vista mínima del layout que el mediador necesita para armar el prompt. La
 * aporta el LLAMADOR (p. ej. el controller de line-engineering vía su
 * servicio): cad-documents no conoce line-engineering, así que el layout llega
 * como dato, no como dependencia. `LineLayout` la satisface estructuralmente.
 */
export interface CadIntentLayoutContext {
  footprint: { unit: string; footprintW: number; footprintH: number };
  stations: {
    id: string;
    station: string;
    x: number | null;
    y: number | null;
    w: number | null;
    h: number | null;
  }[];
  connectors: { from: string; to: string }[];
}

/** Carga diferida del layout: en modo mock ni siquiera se consulta la BD. */
export type CadIntentLayoutLoader = () => Promise<CadIntentLayoutContext>;

@Injectable()
export class CadIntentService {
  private readonly logger = new Logger(CadIntentService.name);

  constructor(
    @Optional()
    @Inject(CAD_AI_PROVIDER)
    private readonly ai?: CadAiProvider,
  ) {}

  /**
   * Interpreta una instrucción NL contra el layout y devuelve las tool-calls que
   * el modelo propuso (sin aplicar). El frontend las valida y aplica.
   */
  async interpret(
    model: string,
    revision: string,
    prompt: string,
    loadLayout: CadIntentLayoutLoader,
  ): Promise<CadIntentResponse> {
    const text = (prompt ?? '').trim();
    if (!text)
      return { available: true, toolCalls: [], message: 'Instrucción vacía.' };

    if (process.env.AI_MOCK === '1') {
      // Modo prueba/CI: sin motor. Devuelve vacío de forma determinista.
      return {
        available: false,
        toolCalls: [],
        message: 'Motor CIDE en modo mock.',
      };
    }

    const layout = await loadLayout();
    const placed = layout.stations.filter(
      (s): s is typeof s & { x: number; y: number } =>
        s.x !== null && s.y !== null,
    );
    const system = buildCadIntentSystemPrompt({
      unit: layout.footprint.unit,
      footprintW: layout.footprint.footprintW,
      footprintH: layout.footprint.footprintH,
      stations: placed.map((s) => ({ station: s.station, x: s.x, y: s.y })),
    });
    return this.runModel(system, text, model, revision);
  }

  /** Una llamada al modelo con las CAD tools; degrada con gracia si CIDE no está. */
  private async runModel(
    system: string,
    userText: string,
    model: string,
    revision: string,
  ): Promise<CadIntentResponse> {
    const unavailable: CadIntentResponse = {
      available: false,
      toolCalls: [],
      message:
        'El motor de IA (CIDE) no está disponible. Configura CIDE_BASE_URL para usar comandos en lenguaje natural.',
    };
    // Sin puerto o sin motor configurado: misma degradación, sin intentar red.
    if (!this.ai?.available) return unavailable;
    try {
      const comp = await this.ai.chat({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
        tools: CAD_INTENT_TOOLS,
        maxTokens: CAD_INTENT_MAX_TOKENS,
        temperature: 0,
      });
      return {
        available: true,
        toolCalls: comp.toolCalls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments ?? {},
        })),
        ...(comp.toolCalls.length === 0 && comp.content
          ? { message: comp.content.slice(0, 300) }
          : {}),
      };
    } catch (err) {
      const msg =
        err instanceof CadAiProviderError
          ? err.message
          : 'No se pudo contactar el motor CIDE.';
      this.logger.warn(
        `cad-intent no disponible para ${model}|${revision}: ${msg}`,
      );
      return unavailable;
    }
  }
}
