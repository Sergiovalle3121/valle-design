/**
 * NL→CAD backend (Fase 69) — servicio mediador.
 *
 * Recibe la instrucción en lenguaje natural del usuario, arma el contexto del
 * layout, llama al modelo OpenAI-compatible (CIDE/`CIDE_BASE_URL`) ofreciéndole
 * las herramientas CAD, y devuelve las tool-calls CRUDAS (name + arguments). La
 * validación/normalización a acciones aplicables ocurre en el frontend
 * (`cad-intent.ts` → normalizeToolCalls), única fuente de esa lógica.
 *
 * Degrada con gracia: si el motor no está configurado o falla, responde
 * `{ available:false, ... }` en vez de lanzar 500, igual que el módulo de IA.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CideProvider, CideEngineError } from '../ai/cide-provider';
import { LineEngineeringService } from './line-engineering.service';
import { CAD_INTENT_TOOLS, buildCadIntentSystemPrompt } from './cad-intent-tools';

const CIDE_BASE_URL = process.env.CIDE_BASE_URL || 'http://localhost:11434/v1';
const CIDE_API_KEY = process.env.CIDE_API_KEY || null;
const CIDE_MODEL = process.env.CIDE_MODEL || 'qwen2.5:7b';
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

@Injectable()
export class CadIntentService {
  private readonly logger = new Logger(CadIntentService.name);

  constructor(private readonly layoutService: LineEngineeringService) {}

  /**
   * Interpreta una instrucción NL contra el layout y devuelve las tool-calls que
   * el modelo propuso (sin aplicar). El frontend las valida y aplica.
   */
  async interpret(model: string, revision: string, prompt: string): Promise<CadIntentResponse> {
    const text = (prompt ?? '').trim();
    if (!text) return { available: true, toolCalls: [], message: 'Instrucción vacía.' };

    if (process.env.AI_MOCK === '1') {
      // Modo prueba/CI: sin motor. Devuelve vacío de forma determinista.
      return { available: false, toolCalls: [], message: 'Motor CIDE en modo mock.' };
    }

    const layout = await this.layoutService.getLayout(model, revision);
    const system = buildCadIntentSystemPrompt({
      unit: layout.footprint.unit,
      footprintW: layout.footprint.footprintW,
      footprintH: layout.footprint.footprintH,
      stations: layout.stations
        .filter((s): s is typeof s & { x: number; y: number } => s.x !== null && s.y !== null)
        .map((s) => ({ station: s.station, x: s.x, y: s.y })),
    });

    const provider = new CideProvider({ baseUrl: CIDE_BASE_URL, model: CIDE_MODEL, apiKey: CIDE_API_KEY });
    try {
      const comp = await provider.chat({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        tools: CAD_INTENT_TOOLS,
        maxTokens: CAD_INTENT_MAX_TOKENS,
        temperature: 0,
      });
      return {
        available: true,
        toolCalls: comp.toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments ?? {} })),
        ...(comp.toolCalls.length === 0 && comp.content ? { message: comp.content.slice(0, 300) } : {}),
      };
    } catch (err) {
      const msg = err instanceof CideEngineError ? err.message : 'No se pudo contactar el motor CIDE.';
      this.logger.warn(`cad-intent no disponible para ${model}|${revision}: ${msg}`);
      return {
        available: false,
        toolCalls: [],
        message: 'El motor de IA (CIDE) no está disponible. Configura CIDE_BASE_URL para usar comandos en lenguaje natural.',
      };
    }
  }
}
