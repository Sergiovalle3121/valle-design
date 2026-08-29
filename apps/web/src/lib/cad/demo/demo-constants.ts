/**
 * Constantes del modo demostración — MÓDULO HOJA, sin catálogo.
 *
 * `DemoStudio` es primera carga de una página pública: si importara el puerto
 * (que arrastra el conversor de plantillas y las normas mexicanas, ~70 KB gzip
 * medidos), esos bytes viajarían antes del primer pintado. Aquí viven solo los
 * identificadores; el puerto llega por `import()` con el editor.
 */
export const DEMO_DOCUMENT_ID = "demo-local";
/** Clave del dibujo del visitante. Sobrevive a recargas y viaja al registro. */
export const DEMO_STORAGE_KEY = "valle_demo_document";
