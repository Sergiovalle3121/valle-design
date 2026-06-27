/**
 * Vision→CAD backend (Fase 71) — servicio que llama al modelo multimodal.
 *
 * Manda la imagen del plano (data URL) al endpoint OpenAI-compatible (CIDE) con
 * el VISION_SYSTEM_PROMPT y devuelve el JSON CRUDO que el modelo produjo. El
 * frontend lo valida/mapea con normalizeVision (cad-vision.ts). Degrada con
 * gracia si el motor no está disponible. Cliente propio (no usa CideProvider,
 * que es solo-texto) para no tocar el módulo de IA compartido.
 */
import { Injectable, Logger } from '@nestjs/common';
import { buildVisionMessages, isDataImageUrl } from './cad-vision-prompt';

const CIDE_BASE_URL = process.env.CIDE_BASE_URL || 'http://localhost:11434/v1';
const CIDE_API_KEY = process.env.CIDE_API_KEY || null;
const CIDE_VISION_MODEL = process.env.CIDE_VISION_MODEL || process.env.CIDE_MODEL || 'qwen2.5vl:7b';
const VISION_TIMEOUT_MS = Number(process.env.CIDE_TIMEOUT_MS) || 60000;

export interface CadVisionResponse {
  available: boolean;
  /** JSON crudo que devolvió el modelo (lo valida el frontend con normalizeVision). */
  raw: string;
  message?: string;
}

@Injectable()
export class CadVisionService {
  private readonly logger = new Logger(CadVisionService.name);

  /** Vectoriza un plano (data URL) a JSON crudo de muros/zonas. */
  async vectorize(imageDataUrl: string): Promise<CadVisionResponse> {
    if (!isDataImageUrl(imageDataUrl)) {
      return { available: true, raw: '', message: 'La imagen debe ser un data URL embebido (data:image/...;base64,...).' };
    }
    if (process.env.AI_MOCK === '1') {
      return { available: false, raw: '', message: 'Motor de visión en modo mock.' };
    }

    const endpoint = `${CIDE_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(CIDE_API_KEY ? { Authorization: `Bearer ${CIDE_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: CIDE_VISION_MODEL,
          messages: buildVisionMessages(imageDataUrl),
          temperature: 0,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Motor de visión respondió ${res.status}`);
        return { available: false, raw: '', message: `El motor de visión respondió ${res.status}.` };
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content ?? '';
      return { available: true, raw };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      this.logger.warn(`Visión no disponible: ${aborted ? 'timeout' : (err as Error).message}`);
      return {
        available: false,
        raw: '',
        message: 'El motor de visión (CIDE) no está disponible. Configura CIDE_VISION_MODEL / CIDE_BASE_URL.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
