/**
 * Puerto neutral del motor de IA del CAD (WP2c).
 *
 * Cubre los dos usos actuales: el chat con tools de `cad-intent.service`
 * (antes `CideProvider.chat`) y la llamada multimodal de `cad-vision.service`
 * (antes un `fetch` OpenAI-compatible propio). Los tipos son PROPIOS del
 * puerto — cad-documents no importa nada de `../ai` — y `cad-intent-tools.ts`
 * declara su contrato de herramientas con `CadAiToolSpec` porque el CAD es el
 * dueño legítimo de esos tipos. En el repo Design (Fase 3) el adaptador CIDE
 * se sustituye por el proveedor propio sin tocar el dominio.
 */

/** Herramienta ofrecida al modelo (forma `function` OpenAI, params JSON-Schema). */
export interface CadAiToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Invocación de herramienta que el modelo pidió, con argumentos parseados. */
export interface CadAiToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Mensaje de texto plano para el chat con tools. */
export interface CadAiChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CadAiChatArgs {
  messages: CadAiChatMessage[];
  tools?: CadAiToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface CadAiChatResult {
  content: string;
  toolCalls: CadAiToolCall[];
}

/** Mensaje multimodal (texto o texto+imagen); `VisionChatMessage` lo satisface. */
export interface CadAiVisionMessage {
  role: 'system' | 'user';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

export interface CadAiVisionArgs {
  messages: CadAiVisionMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CadAiVisionResult {
  /** JSON crudo que devolvió el modelo (lo valida el frontend). */
  raw: string;
}

/**
 * Fallo del motor de IA visto desde el puerto. `status` viaja cuando el motor
 * respondió HTTP no-2xx, para que los servicios conserven su degradación
 * actual (mensajes con el código de estado) sin conocer el transporte.
 */
export class CadAiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CadAiProviderError';
  }
}

export interface CadAiProvider {
  /** false ⇒ el motor no está configurado; los servicios degradan con gracia. */
  readonly available: boolean;
  chat(args: CadAiChatArgs): Promise<CadAiChatResult>;
  /** Opcional: no todo proveedor soporta visión multimodal. */
  vision?(args: CadAiVisionArgs): Promise<CadAiVisionResult>;
}

/** Token de inyección del puerto (opcional en cad-intent/cad-vision). */
export const CAD_AI_PROVIDER = Symbol('CAD_AI_PROVIDER');
