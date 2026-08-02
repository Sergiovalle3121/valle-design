/**
 * Clase utilitaria reusable para el material translúcido (glassmorphism).
 *
 * El estilo vive en globals.css bajo `.glass` (con fallback `@supports` para
 * navegadores sin backdrop-filter y variante para prefers-color-scheme: dark),
 * de modo que el canto de medio píxel y el blur sean consistentes en toda la app.
 *
 * Uso: className={`${glass} rounded-[24px] ...`}
 */
export const glass = 'glass';
