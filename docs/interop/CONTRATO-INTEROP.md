# El contrato de interoperabilidad: una sola puerta de entrada y salida

Todo formato —el DXF de hoy, el DWG licenciado o propio de mañana, IFC, PDF
vectorial, STEP, lo que pida un cliente— entra y sale del producto por la
MISMA puerta con las MISMAS garantías. Un formato nuevo es un ADAPTADOR que
implementa este contrato; nunca un caso especial dentro de un importador.

## La forma del contrato

```
                    leer(bytes) ────────►  REPRESENTACIÓN     normalizar ──► DOCUMENTO
  bytes del archivo                        NEUTRAL                           CANÓNICO
                    ◄──────── escribir()   (entidades +       ◄── proyectar
                                           diagnósticos +
                                           PÉRDIDAS declaradas)
```

Un adaptador de formato implementa, en TypeScript puro y probable en Node:

```ts
interface CadFormatAdapter {
  /** Identidad del formato y del adaptador, con versión propia. */
  id: string;                     // "dxf", "dwg-proveedor-x", "ifc"
  version: string;                // versión del ADAPTADOR, no del formato
  detects(bytes: Uint8Array): boolean;
  /** bytes → neutral. NUNCA lanza por contenido: devuelve diagnósticos. */
  read(bytes: Uint8Array): {
    entities: NeutralEntity[];    // lo que se entendió
    opaque: OpaqueEntity[];       // lo que se PRESERVA sin entender (proxy)
    diagnostics: Diagnostic[];    // avisos con posición y causa
    losses: LossManifestEntry[];  // lo que NO sobrevivió, nombrado
  };
  /** neutral → bytes. El manifiesto de pérdidas viaja JUNTO al archivo. */
  write(document: NeutralView): {
    bytes: Uint8Array;
    losses: LossManifestEntry[];
  } | { unsupported: string };    // decir «no escribo» es válido; fingir, no
}
```

(Los nombres exactos de los tipos neutrales son los del documento canónico y
su capa `unsupportedEntities`/`lossManifest`, que ya existen; este contrato no
inventa un segundo modelo — declara el que el DXF propio ya practica.)

## Las cinco garantías que ningún adaptador puede rebajar

1. **Pérdida declarada o pérdida prohibida.** Todo lo que no sobreviva al
   viaje aparece en `losses`, con tipo y conteo. La interfaz lo ENSEÑA antes
   de que el usuario comparta el archivo. Una pérdida silenciosa es el defecto
   más grave del producto.
2. **Lo no entendido se PRESERVA, no se tira.** Entidades desconocidas viajan
   opacas (`unsupportedEntities`) y vuelven a salir intactas al reexportar al
   mismo formato.
3. **El original es sagrado.** En formatos de terceros (DWG), el archivo
   recibido se conserva como adjunto byte a byte; el documento editable es una
   DERIVACIÓN declarada, nunca el sustituto del original.
4. **Determinismo.** Mismos bytes → mismo resultado. Nada de depender de
   reloj, azar ni red durante la conversión.
5. **Sin re-encuadre silencioso.** Trasladar coordenadas (p. ej. UTM → marco
   local) sólo con el desplazamiento REGISTRADO en el documento, reversible al
   exportar. (Deuda conocida: una de las dos rutas DXF actuales re-encuadra
   sin registrar — unificarlas bajo este contrato es la entrada R.1/backlog.)

## Estado real hoy (2026-08-22)

- **DXF**: lectura y escritura propias en `apps/web/src/lib/cad/` con
  manifiesto de pérdidas — el adaptador de referencia, aunque aún con DOS
  rutas de importación por unificar (backlog) y tope de 50,000 entidades
  declarado en código.
- **DWG**: detectar-y-decir-no en el producto; laboratorio y códec propio
  aparte (ADR-0012 define las dos vías y el criterio de cambio).
- **PDF**: exportación propia (trazado); importación con corpus propio.
- **IFC/STEP/GIS**: «todavía no» — entrarán como adaptadores de este contrato
  cuando su etapa llegue (mapa de años del anexo de crecimiento).
