/**
 * La trama de un sombreado AJENO: dónde la guarda el documento canónico.
 *
 * Igual que el esquema 10, esto no estrena una entidad: estrena UN CAMPO
 * opcional sobre una que ya existía, `hatch`. Y vive en su propio archivo por
 * la misma razón del repositorio que dejó escrita `cad-entities-v10.ts`:
 * `cad-document.ts` tiene tope de 800 líneas —el trinquete de
 * `scripts/cad/monolith-budget.json`— y estaba en 799 el día de este cambio,
 * así que lo que se añade se extrae. Documentar el campo dentro de la unión
 * habría costado doce líneas que ese archivo ya no tiene.
 *
 * Este módulo es una HOJA del grafo de carga: su único import es `import
 * type`, que se borra al compilar, así que `cad-document.ts` puede importarlo
 * sin cerrar un ciclo. Es el mismo motivo que explican `cad-entities-v4.ts` y
 * `cad-document-shared.ts`, y no es teórico: `tsc --noEmit` no ve esos ciclos
 * y el producto revienta al cargar con «Cannot access X before
 * initialization».
 *
 * ## Qué arregla
 *
 * La ESCRITURA ya estaba cerrada: el producto resuelve su tabla propia
 * (`hatch-pattern-table.ts`) y el archivo sale con sus líneas de definición.
 * La LECTURA no. Un sombreado ajeno con trama entra al documento como
 * `pattern: "ANSI31"` a secas y se redibuja con NUESTRA tabla, que a escala 1
 * separa 1 unidad donde el archivo ajeno separaba 0.125 —medido en `11-hatch`
 * del corpus admitido—. No es un fallo del lector: `decodeHatch` lee la trama
 * entera y `dwgDatabaseToCanonicalDocument` ya la transporta. Es que el
 * documento no tenía dónde ponerla.
 *
 * ## Por qué es aditivo de verdad
 *
 * `patternDefinition` es opcional-AUSENTE. Un documento guardado antes de este
 * cambio lo omite, serializa byte a byte igual y se dibuja igual que hoy, así
 * que NO sube `CAD_DOCUMENT_SCHEMA` ni pide migración. No renombra ni
 * reinterpreta ningún identificador persistido (IDENTITY.md, ADR-0010): lo
 * único que hace es dar sitio a algo que hasta hoy se tiraba.
 */
import type { CadPoint2 } from "./cad-document";

/** El campo que este cambio añade a `hatch`. Se intersecta con el miembro. */
export interface CadHatchImportedPattern {
  /**
   * La trama tal como venía en el archivo importado, cuando el archivo la
   * traía. Ausente = el sombreado se dibuja con la tabla propia
   * (`hatch-pattern-table.ts`), que es el caso de todo sombreado creado aquí.
   *
   * Los ángulos van en GRADOS, como el resto del documento; los desfases y los
   * trazos, en unidades de dibujo y ya girados al dibujo — la misma forma que
   * `cadHatchPatternDxfLines` produce y que el DXF escribe en los grupos
   * 53/43/44/45/46/79/49.
   *
   * No lleva `scale` ni `double` propios: `scale` y `angle` ya viven en la
   * entidad, y la doble trama del formato se expresa como una familia más en
   * `lines`.
   */
  patternDefinition?: {
    lines: {
      /** Código 53: ángulo de la familia en el dibujo, en GRADOS. */
      angle: number;
      /** Códigos 43/44: punto base de la familia, en unidades de dibujo. */
      base: CadPoint2;
      /** Códigos 45/46: vector entre líneas sucesivas, ya girado al dibujo. */
      offset: CadPoint2;
      /** Códigos 79/49: la secuencia en unidades de dibujo (0 = punto). */
      dashes: number[];
    }[];
  };
}
