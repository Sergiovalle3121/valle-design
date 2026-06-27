/**
 * Vision→CAD backend (Fase 71) — prompt y armado de mensajes multimodales.
 *
 * Parte pura del endpoint que vectoriza un plano: el system prompt que pide al
 * modelo el JSON de muros/zonas, la validación anti-SSRF de la imagen (solo
 * `data:` URLs en línea, nunca URLs remotas), y el armado del mensaje multimodal
 * en formato OpenAI-compatible. El frontend valida la salida con normalizeVision.
 */

/** System prompt: define el JSON de salida (coords normalizadas 0..1). */
export const VISION_SYSTEM_PROMPT = [
  'Eres un asistente que vectoriza planos de planta. Analiza la imagen del plano y',
  'devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto extra:',
  '{ "walls": [{"x1":0,"y1":0,"x2":1,"y2":0}], "zones": [{"name":"opcional","points":[{"x":0,"y":0}]}], "unitHint":"m" }',
  'Todas las coordenadas NORMALIZADAS en [0,1] respecto al ancho/alto de la imagen,',
  'origen (0,0) en la esquina superior izquierda. Incluye solo muros y zonas claros.',
].join(' ');

/**
 * Solo aceptamos imágenes embebidas como data URL (`data:image/...;base64,...`).
 * Rechazar URLs remotas evita SSRF (que el servidor descargue un recurso interno).
 */
export function isDataImageUrl(url: unknown): url is string {
  return typeof url === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url);
}

/** Mensaje en formato OpenAI-compatible (texto o contenido multimodal). */
export interface VisionChatMessage {
  role: 'system' | 'user';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

/** Arma los mensajes multimodales para la llamada de visión. */
export function buildVisionMessages(imageDataUrl: string): VisionChatMessage[] {
  return [
    { role: 'system', content: VISION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Vectoriza este plano a JSON según el formato indicado.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
