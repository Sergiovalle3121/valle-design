/**
 * Vision→CAD backend (Fase 71) — servicio que llama al modelo multimodal.
 *
 * Manda la imagen del plano (data URL) al motor de visión a través del puerto
 * neutral CadAiProvider (WP2c) con el VISION_SYSTEM_PROMPT y devuelve el JSON
 * CRUDO que el modelo produjo. El frontend lo valida/mapea con normalizeVision
 * (cad-vision.ts). Degrada con gracia si el puerto no está inyectado, el motor
 * no está configurado (`available:false`) o la llamada falla.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { buildVisionMessages, isDataImageUrl } from './cad-vision-prompt';
import {
  CAD_AI_PROVIDER,
  CadAiProviderError,
} from './ports/cad-ai-provider.port';
import type { CadAiProvider } from './ports/cad-ai-provider.port';

export interface CadVisionResponse {
  available: boolean;
  /** JSON crudo que devolvió el modelo (lo valida el frontend con normalizeVision). */
  raw: string;
  message?: string;
}

@Injectable()
export class CadVisionService {
  private readonly logger = new Logger(CadVisionService.name);

  constructor(
    @Optional()
    @Inject(CAD_AI_PROVIDER)
    private readonly ai?: CadAiProvider,
  ) {}

  /** Vectoriza un plano (data URL) a JSON crudo de muros/zonas. */
  async vectorize(imageDataUrl: string): Promise<CadVisionResponse> {
    if (!isDataImageUrl(imageDataUrl)) {
      return {
        available: true,
        raw: '',
        message:
          'La imagen debe ser un data URL embebido (data:image/...;base64,...).',
      };
    }
    if (process.env.AI_MOCK === '1') {
      return {
        available: false,
        raw: '',
        message: 'Motor de visión en modo mock.',
      };
    }

    const unavailable: CadVisionResponse = {
      available: false,
      raw: '',
      message:
        'El motor de visión (CIDE) no está disponible. Configura CIDE_VISION_MODEL / CIDE_BASE_URL.',
    };
    // Sin puerto, sin motor configurado o sin soporte de visión: misma
    // degradación de siempre, sin intentar red.
    if (!this.ai?.available || !this.ai.vision) return unavailable;
    try {
      const { raw } = await this.ai.vision({
        messages: buildVisionMessages(imageDataUrl),
      });
      return { available: true, raw };
    } catch (err) {
      if (err instanceof CadAiProviderError && err.status !== undefined) {
        this.logger.warn(`Motor de visión respondió ${err.status}`);
        return {
          available: false,
          raw: '',
          message: `El motor de visión respondió ${err.status}.`,
        };
      }
      const aborted = err instanceof Error && err.name === 'AbortError';
      this.logger.warn(
        `Visión no disponible: ${aborted ? 'timeout' : (err as Error).message}`,
      );
      return unavailable;
    }
  }
}
