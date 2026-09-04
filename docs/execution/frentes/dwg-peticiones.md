# Peticiones de F1 · DWG dentro del producto

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-dwg-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-dwg-01 · Un lugar donde guardar la trama de un sombreado AJENO

- **Archivo:** `apps/web/src/lib/cad/cad-document.ts` (esquema del documento canónico,
  archivo COMPARTIDO por R2) y, si el coordinador decide subir versión de esquema,
  `apps/web/src/lib/cad/cad-document-migrate.ts`.
- **Por qué:** entrega 2/5 del frente (HATCH de patrón). La ESCRITURA ya está cerrada: el
  producto resuelve su tabla propia y el DWG sale con sus líneas de definición. La
  LECTURA no: un sombreado ajeno con trama entra al documento como `pattern: "ANSI31"` y
  se redibuja con NUESTRA tabla, que a escala 1 separa 1 unidad donde el archivo ajeno
  separaba 0.125 (medido en `11-hatch` del corpus admitido). No es un error del lector
  —`decodeHatch` lee la trama entera y `dwgDatabaseToCanonicalDocument` ya la
  transporta—: es que el documento del producto no tiene dónde ponerla.
- **Cambio exacto:** añadir al miembro `type: "hatch"` de la unión de entidades un campo
  OPCIONAL, sin cambiar ningún campo existente:

  ```ts
  /**
   * La trama tal como venía en el archivo importado, cuando el archivo la
   * traía. Ausente = el sombreado se dibuja con la tabla propia
   * (`hatch-pattern-table.ts`), que es el caso de todo sombreado creado aquí.
   * Los ángulos van en GRADOS, como el resto del documento; los desfases y
   * los trazos, en unidades de dibujo y ya girados al dibujo — la misma
   * forma que `cadHatchPatternDxfLines` produce y que el DXF escribe en
   * 53/43/44/45/46/79/49.
   */
  patternDefinition?: {
    lines: {
      angle: number;
      base: CadPoint2;
      offset: CadPoint2;
      dashes: number[];
    }[];
  };
  ```

  No lleva `scale` ni `double` propios: `scale` y `angle` ya viven en la entidad, y la
  doble trama del formato se expresa como una familia más en `lines`. Es aditivo y
  opcional, así que NO necesita subir la versión de esquema ni migración: un documento
  guardado antes lo omite y se comporta igual que hoy. Si el coordinador prefiere subirla
  igualmente, la migración es identidad.
- **Cómo se comprueba:** con el campo en el esquema, este frente cierra el círculo en
  `dwg-document-bridge-entities.ts` (territorio propio) y lo prueba con una spec que
  importe `11-hatch` del corpus admitido y afirme que la separación del ANSI31 leído es
  0.125 y no 1 — hoy esa spec no se puede ni escribir. `apps/web/src/lib/cad/
  cad-document.spec.ts` y `persisted-identifiers.spec.ts` deben seguir verdes: el campo es
  nuevo y opcional, no renombra nada persistido.
- **Estado:** pendiente
