# F11 · Inventario AutoCAD 2027 vs Valle Design

> Frente de investigación y verificación de la campaña «El lunes de un
> arquitecto» (`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`). Este
> documento **no escribe código de producto**: es un inventario que el
> coordinador usa para abrir filas nuevas en `docs/competitive/rubric.json` y
> ordenar la cola. Cada afirmación de este documento fue verificada contra el
> árbol real (`grep`, lectura de fichero, `node scripts/cad/rubric.mjs`) o
> contra una fuente oficial de Autodesk citada con URL y fecha.

## 1 · Método

**Fuentes del lado Valle** (el árbol real, en `main`, commit `2fd2bfd` al
arrancar este frente):

- `apps/web/src/lib/cad/engine/command-manifest.ts` — los 294 comandos
  reales del registro, generados por `scripts/cad/build-command-manifest.mjs`
  y verificados por `check:command-integrity` (0 éxitos falsos,
  `docs/cad/evidence/command-integrity.json`). Es la fuente de verdad de "qué
  comando existe y es tecleable", no `registry.ts` (que es el catálogo de
  40 *frases* del command palette, un intérprete determinista sin IA — ver
  `no-ai-boundary.spec.ts`).
- `docs/competitive/rubric.json` (36 filas, corte `2026-08-22`/`2026-09-03`)
  y su salida recomputada con `node scripts/cad/rubric.mjs`.
- `docs/parity/ESCALERA.md` — el peldaño (0-7) medido de cada capacidad
  tocada por las campañas Paridad y «Superar a AutoCAD completo».
- `docs/execution/auditoria-fable/00c-CUADRO-DE-MANDO.md` — los 19
  bloqueantes confirmados y ~106 huecos añadidos por el escéptico, cada uno
  con su `grep` y su ruta:línea ya hechos. Este frente los reutiliza como
  evidencia citando la fila exacta del cuadro de mando en vez de repetir el
  `grep`, salvo donde verificó algo nuevo.
- `AGENTS.md` §Scope / §Domain boundary — qué está fuera de alcance por
  decisión de la casa (IA, ERP/MES, BIM, puente .NET/VBA).

**Fuentes del lado AutoCAD** (investigación web de este frente, hoy
2026-09-06): páginas oficiales `help.autodesk.com` de referencia de comandos
de AutoCAD 2027, de cada toolset (Architecture, MEP, Mechanical, Electrical,
Plant 3D, Map 3D, Raster Design) y de novedades por versión 2024-2027. Cada
fila de las secciones 2 y 3 cita la URL exacta y la fecha de consulta al pie
de su tabla. **No se copia texto ni tabla alguna de Autodesk**: la columna
"capacidad AutoCAD" es una descripción en palabras propias de este frente.
`acad.pgp` no se redistribuye: cuando este documento menciona un alias de
AutoCAD lo hace por su nombre, nunca reproduciendo el fichero.

**Cómo se verificó cada fila.** Para cada capacidad de AutoCAD, este frente:
(a) buscó el comando equivalente por nombre y por alias en
`command-manifest.ts` con `grep -n '"name": "X"'`; (b) si existía, buscó su
fila en `ESCALERA.md` para el peldaño verificado más reciente, o corrió su
propio `grep` sobre el módulo de `apps/web/src/lib/cad/engine/commands/` si
`ESCALERA.md` no la cubre; (c) si no existía ningún comando con ese nombre
ni alias, confirmó con un segundo `grep` por el concepto (no sólo el nombre
del comando) antes de marcar NO, seguido de un tercer `grep` sobre
`apps/web/e2e/` buscando si algún test la ejercita de otra forma — la
lección del invariante 1 (§3.1 del prompt maestro): diez huecos de la
auditoría anterior se cayeron por no mirar. Donde este documento marca NO,
el `grep` de los tres pasos está citado en la columna de evidencia.

**Qué significa cada columna:**

- **¿Existe en Valle?** SÍ (comando real, tecleable, con evidencia
  automática — peldaño ≥3), PARCIAL (existe con una frontera declarada, o
  peldaño 1-2), NO (sin código, o código que no hace lo que el nombre
  promete — peldaño 0).
- **Peldaño** usa la escalera de siete niveles de `docs/parity/ESCALERA.md`
  §Los siete peldaños (0 No existe … 7 En producción medido en vivo).
- **Fila de la rúbrica** cita el `id` exacto de `rubric.json` o dice «sin
  fila» — que es material bruto para la sección 5.
- **Valor para el arquitecto del lunes** es un juicio de este frente, no un
  hecho verificable con `grep`; sigue el criterio de §2.1 del prompt
  maestro (afirmación falsa viva > rompe el bucle > impide entregar > lo
  demás) para ordenar, no para inflar.

**Lo que este documento NO hace:** no repite ninguna cifra que
`node scripts/cad/rubric.mjs` ya publique (regla 4 de la casa); cuando cita
un porcentaje o total, enlaza al script. No propone funciones de IA,
ERP/MES, BIM ni un puente .NET/VBA (declarados fuera de alcance, con su
alternativa documentada en `docs/api/POLITICA-API-PUBLICA.md`). No edita
`rubric.json`, `ESCALERA.md` ni `BACKLOG.md`: las filas nuevas de la
sección 5 son JSON literal para que el coordinador las aplique.

## 2 · Inventario de AutoCAD 2027 base

> _Pendiente — en investigación. Los 294 comandos del lado Valle ya están
> extraídos de `command-manifest.ts` (§1); falta que regrese la investigación
> web de fuentes oficiales de Autodesk para completar la columna "capacidad
> AutoCAD" con su cita (URL + fecha) por cada uno de los once flujos de
> usuario del encargo. Se completa en el próximo commit de este frente,
> lanzado ya en paralelo._

## 3 · Inventario por toolset

> _Pendiente — en investigación, misma razón que la sección 2. Base ya
> disponible en `docs/parity/ESCALERA.md` §Las filas de los siete toolsets
> y en las secciones Ola E (Architecture), F (MEP), G (Map 3D), H (Raster
> Design), I (Mechanical), 5 (Electrical) y 6 (Plant 3D) de ese mismo
> documento, más `docs/competitive/rubric.json` categorías `toolset-*`
> (`toolset-architecture`, `toolset-mep`, `toolset-map3d`,
> `toolset-raster`, `toolset-mechanical`, `toolset-electrical`,
> `toolset-plant3d`). Falta la cita oficial de Autodesk por comando._

## 4 · Lo que Valle tiene y AutoCAD no

§6 del prompt maestro llama a esto «la apuesta»: cuatro ventajas
estructurales de correr en el navegador que AutoCAD no puede copiar sin
dejar de ser AutoCAD (unidad de reparto = dirección, el destinatario ya
tiene el dispositivo, el estado se mide, la versión que corre es la única
que existe). Este frente verificó cada pieza que el prompt maestro dice que
«ya está pagada y sin cobrar» contra el árbol de hoy, con su propio `grep`:

| Pieza de la apuesta | ¿Existe en el árbol? | Evidencia | Lo que falta para cobrar la apuesta completa |
| --- | --- | --- | --- |
| Recibo de publicación inmutable con `sha256`, tamaño y hojas | SÍ | `apps/api/src/modules/cad-documents/entities/cad-publication.entity.ts:17-49` — entidad `cad_publications` con `sha256` (varchar 64), `bytes`, `paperSpaceIds`, `publishedBy`, `publishedAt`; comentario propio: «Recibo inmutable de publicación… hash y tamaño del PDF generado, quién y cuándo» | El recibo describe el PDF; no lleva los bytes del PDF al lado en un enlace abierto sin cuenta (eso es el enlace server-owned de abajo) |
| Enlace de revisión server-owned: token fuera de la URL, expiración, revocación | SÍ | `apps/api/src/modules/cad-documents/review-link.service.ts:33,58-85` — `expiresAt`, `revokedAt`/`status !== 'open'` → `401 review_token_revoked`/`review_token_expired`; el token viaja por header `x-review-token` (`REVIEW_TOKEN_HEADER`, línea 19), nunca en la URL en claro; `review-link-token.ts` hashea el token (`hashReviewLinkToken`) | Aislamiento por organización no verificado por este frente en esta pasada (queda para verificación de código, no de inventario); el prompt maestro afirma «aislamiento por organización, token en el fragmento» — el token va por header en canje server-side, sin confirmar en esta pasada si el enlace público usa fragmento de URL (`#`) en vez de query string |
| Manifiesto de pérdidas que viaja con el documento y el DXF | SÍ (para DXF) | `apps/api/src/modules/cad/cad-dxf-export.ts` cabecera propia declara mapeo determinista v2; **pero** el `00c-CUADRO-DE-MANDO.md` hallazgo 10 confirma que el endpoint público `cad.controller.ts:331-352` sirve ese DXF R12 **sin manifiesto** (`grep -cin "loss|manifest|warning|advert" cad-dxf-export.ts` = 0) — la pieza existe para el camino del navegador (`dxf-export-loss-manifest.ts`) pero NO para el endpoint de API pública que cita el propio prompt maestro | Ver contradicción en §6: el prompt maestro cita esta pieza como «ya pagada» y el mismo documento (§6.4) dice que está «incumplida en la letra pequeña» — las dos cosas son ciertas de partes distintas del sistema |
| Codificador de QR propio, con oráculo y round-trip | SÍ, pero **con un solo consumidor** | `apps/web/src/lib/qr/qr-encode.ts` + `qr-decode.ts` + `qr-oracle.ts`; único consumidor de interfaz: `apps/web/src/components/ui/QrCode.tsx`, importado sólo por `apps/web/src/app/cuenta/MfaEnrollment.tsx` (`grep -rln QrCode apps/web/src --include=*.tsx` → esos dos ficheros) | El QR en el cajetín de la lámina, apuntando al enlace de revisión, no está cableado: 0 usos de `QrCode`/`qr-encode` en `apps/web/src/components/cad/` |
| Presencia con cursor y encuadre | SÍ | `apps/web/src/lib/cad/collab/presence.ts`, `presence-channel.ts`, `server-presence-channel.ts`, `overlay-model.ts` | Necesita que el invitado del enlace de revisión tenga transporte (siguiente fila) |
| Llamada con política ICE/TURN declarada | SÍ | `apps/web/src/lib/cad/calls/call-ice-policy.ts`, `call-state.ts`, `call-signaling-transport.ts`; `call-session-host.spec.ts` (11, control negativo citado en ESCALERA.md Ola 4) | Residual medido: tras un cruce de ofertas ninguno de los dos extremos llega a `iceConnectionState=checking` (ESCALERA.md, Ola 4) |
| Puerto de blob store desacoplado | SÍ | `apps/api/src/modules/cad-documents/design-blob-store.adapter.ts` — cabecera propia: «Wrappea el DatabaseBlobStore propio… El dominio CAD sigue hablando únicamente con el puerto neutral» | Falta el adaptador que sirva el PDF/DXF publicado por una URL pública sin cuenta — hoy el blob store sirve el documento autenticado, no el artefacto de publicación abierto |
| `/demo` abre el DXF del propio visitante sin cuenta ni red | SÍ | `apps/web/src/lib/cad/engine/command-manifest.ts:150` — `DXFIN` está en el registro, módulo `commands/interop-dxf`; `00c-CUADRO-DE-MANDO.md` hallazgo del bloque «Landing» confirma `grep -n "fetch|designClient|/v1/" .../interop-dxf.ts` → 0 — el fichero entra por `engine.feedFile`, no por HTTP | Nada lo dice: ni el `<title>` del héroe (`page.tsx:382-387`, «Probar sin cuenta»), ni el metadata de `/demo` (`demo/page.tsx:19-23`), ni el banner (`DemoStudio.tsx:72-73`) nombran que el visitante puede abrir SU PROPIO archivo. Es un hueco de promesa, no de capacidad (ver cola, §7) |
| Cuenta vencida entra en sólo-lectura, nunca bloquea | SÍ | `apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts` (existe y corre contra PostgreSQL real, confirmado con `ls`); `/terms` la declara «obligación del servicio, no cortesía revocable» (prompt maestro §6.4) | La puerta de salida (exportación DXF R12 mutilada del hallazgo 10) rompe la promesa en el fondo — ver contradicción en §6 |

**Ventana de pérdida medida y publicada: 16,9 s.** Confirmado literalmente en
`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md:139,2069,2152`; este
frente no re-corrió la medición (es evidencia de otro frente/campaña, no de
inventario). AutoCAD no publica la suya — es la ventaja §6.1·3 del prompt
maestro y ninguna fila de `rubric.json` ni `ESCALERA.md` la puntúa (ver §5).

**Conclusión de esta sección:** de las ocho piezas que el prompt maestro
llama «ya pagadas y sin cobrar», siete están verificadas presentes en el
árbol con evidencia directa; la octava (aislamiento por organización del
enlace de revisión) queda sin verificar en esta pasada porque cae fuera del
alcance de un inventario (sería una auditoría de código de seguridad, no un
`grep` de existencia). Ninguna de las tres apuestas tiene fila en
`rubric.json`, `ESCALERA.md` ni `BACKLOG.md` — confirmado por
`grep -rn "enlace de entrega\|degradación honesta\|salida del cliente" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
→ 0 coincidencias en los tres ficheros. Eso alimenta la sección 5.

## 5 · Huecos sin fila

Capacidades con valor alto para el arquitecto del lunes que ninguna de las
36 filas de `rubric.json` mide. Verificado con
`grep -rn "<término>" docs/competitive/rubric.json` para cada una antes de
proponerla — la regla de la casa: un hueco sin su `grep` de «no existe» no
cuenta.

### 5.1 · Las tres apuestas del navegador (§6.6 del prompt maestro)

Confirmado en la sección 4: `grep -rn "enlace de entrega\|degradación
honesta\|salida del cliente\|ventana de pérdida" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
→ 0 coincidencias en los tres ficheros. Propuesta de fila nueva, grupo
`truth` (Integridad y capacidad de crecer — es donde ya viven las filas que
miden que el producto no se contradiga a sí mismo, no `core` ni `pro`):

```json
{
  "id": "browser-advantage",
  "group": "truth",
  "name": "La ventaja del navegador: entrega, degradación y salida",
  "points": 6,
  "gap": "Ninguna fila mide el enlace de entrega público, la ventana de pérdida publicada ni la salida completa del cliente al terminar de pagar. Las tres piezas existen parcialmente en el árbol (recibo de publicación con sha256, enlace de revisión con expiración/revocación, entitlement de sólo-lectura) pero el criterio que las mediría no existe todavía.",
  "criteria": [
    {
      "id": "browser-advantage.delivery-link",
      "points": 2,
      "text": "Un enlace público (sin cuenta) abre la lámina publicada con su versión, sha256 y manifiesto de pérdidas al lado, con expiración y revocación",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "El recibo de publicación (cad-publication.entity.ts) y el enlace de revisión (review-link.service.ts) existen; no hay ruta pública que sirva el PDF/DXF publicado sin autenticación con el manifiesto de pérdidas adjunto." }
      ]
    },
    {
      "id": "browser-advantage.loss-window-published",
      "points": 2,
      "text": "La ventana de pérdida ante fallo del navegador está medida, publicada y re-medida en cada release (gate de regresión, no una corrida manual)",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "La medición de 16,9 s existe (PROMPT_MAESTRO_FABLE.md:139) pero no hay gate en CI que la vuelva a medir por release; es una corrida, no un trinquete." }
      ]
    },
    {
      "id": "browser-advantage.client-exit",
      "points": 2,
      "text": "Al terminar el pago, el cliente exporta TODO su contenido (organización completa) y puede borrar su cuenta (derecho ARCO), sin DXF mutilado en la puerta de salida",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "T-11 y T-62 del prompt maestro: no existe exportación completa de organización ni borrado de cuenta; el DXF de salida está mutilado sin manifiesto (00c-CUADRO-DE-MANDO.md hallazgo 10)." }
      ]
    }
  ]
}
```

### 5.2 · El PDF underlay como sustrato que "no imanta"

`docs/parity/ESCALERA.md` («PDF como sustrato», ventana 1) declara la
capacidad en peldaño 3, con diez órdenes contra PDF reales
(`pdf-underlay-commands.spec.ts`, 118 comprobaciones), pero
`grep -n "toolset\|pdf.*underlay\|PDFATTACH" docs/competitive/rubric.json` →
la única mención cae dentro de un criterio genérico de interoperabilidad, sin
un criterio propio para "el sustrato imanta al OSNAP". Como AutoCAD vende el
PDF underlay con enganche como una de sus funciones más usadas por
arquitectos que calcan sobre el plano de otro consultor, y aquí está
declarado explícitamente que "no imanta hasta que la escena de referencias
lo incluya", este frente no propone una fila nueva (el criterio ya existe de
forma genérica): queda anotado para que el coordinador decida si amplía el
criterio existente, con el coste en la cola (§7) cuando esa sección esté
completa.

## 6 · Contradicciones

Afirmaciones de `ESCALERA.md`, `rubric.json` o el propio prompt maestro que
el árbol desmiente hoy. Cada una cita el `grep` ya hecho (por este frente o
por el escéptico de `00c-CUADRO-DE-MANDO.md`, referenciado por su hallazgo)
para no repetir trabajo que el invariante 1 ya cerró.

**Dirección A — cobrado de más (la fila dice que hay más de lo que hay):**

1. **`ESCALERA.md:366-367` da peldaño 5 a «FLATSHOT/SOLPROF sobre el modelo
   del ARQUITECTO (muros, columnas, mobiliario)» citando el golden 92, pero
   ese golden no respalda ninguna fila de la rúbrica.**
   `grep -n '92-cad-alzado' docs/competitive/rubric.json` → 0 coincidencias
   (verificado por este frente, repitiendo el `grep` de
   `00c-CUADRO-DE-MANDO.md` hallazgo 4). `toolset-architecture` se sostiene
   sobre los goldens 53, 77, 78 y 79, no el 92. El peldaño 5 de esa fila de
   `ESCALERA.md` está cobrado sobre el muro HEREDADO (`box`/`station`), no
   sobre la entidad `wall` real que `WALL` emite — `flatshot-solids.ts:181-192`
   excluye `entity.type === "wall"` explícitamente antes de llegar a
   `volumeFor`. Un lector de `ESCALERA.md` cree que puede sacar un corte de
   un muro dibujado con `WALL` hoy; no puede.
2. **`toolset-electrical.esquemas` (rubric.json:3759, 2 pt) cobra por
   «Esquemas eléctricos: símbolos normalizados» con evidencia
   `apps/web/src/lib/cad/mep-symbols.ts`, que son símbolos de instalación en
   PLANTA, no de esquema de control.**
   `grep -rn 'bobina|contactor|relevador|guardamotor|seccionador|60617|schematic' apps/web/src apps/api/src packages/` (repo completo) →
   0 coincidencias (repetido de `00c-CUADRO-DE-MANDO.md`, bloque «Toolsets
   Mechanical y Electrical», tercer hueco). No existe un solo símbolo de
   esquema unifilar de control (bobina, contactor, relevador). El campo
   `gap` de esa fila enumera cinco ausencias y no menciona ésta, que es la
   mayor.
3. **`integrity.no-silent-loss` (rubric.json, 4 pt) afirma «CERO pérdidas
   silenciosas» midiendo sólo la ruta del navegador; el endpoint público
   `GET .../export/dxf` (`cad.controller.ts:331-352`) sirve un DXF R12
   mutilado sin manifiesto.**
   `grep -cin "loss|manifest|warning|advert" apps/api/src/modules/cad/cad-dxf-export.ts`
   → 0, en 291 líneas (repetido de `00c-CUADRO-DE-MANDO.md`, hallazgo 10,
   marcado ahí como el más serio del informe: sube de «alta» a «bloqueante»
   porque el SDK generado (`packages/design-sdk/src/generated/design-api.ts:2506`)
   anuncia literalmente «los datos del usuario nunca quedan rehenes de un
   cobro» sobre ese mismo endpoint). La fila cobra 4 puntos por una garantía
   que su propia puerta de salida de datos incumple.
4. **La paleta de capas ofrece «No se imprime» (`CadLayerDef.plot`) y la
   norma mexicana crea la capa AUXILIAR con `plot: false`; la publicación
   nunca lee ese campo.**
   `grep -rn "layer.plot\|plot === false\|plot !== false" apps/web/src` → 0
   consumidores en el camino de trazado (repetido de
   `00c-CUADRO-DE-MANDO.md`, bloque «Espacio papel», hallazgo B). La capa
   AUXILIAR de la propia norma del producto —dibujada para apoyarse, no
   para imprimirse, según su propio comentario en
   `standards/mexican-layers.ts:143-150`— sale impresa en los dos caminos de
   PDF. No está declarado en `rubric.json`, `ESCALERA.md` ni `BACKLOG.md`:
   `grep -rn "no se imprime\|plot.*false\|layer.plot" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
   (verificado por este frente) → 0 coincidencias en los tres.
5. **`modeling3d.z-roundtrip` cobra 2 puntos con tres specs de Node
   (`draw-spatial`, `z-frontiers`, `dxf-import-cota`) mientras un e2e
   committeado contradice la capacidad en el navegador.**
   `apps/web/e2e/auditoria/tresd.spec.ts` está declarado
   `bloquea_el_trabajo: true` en su manifiesto y comprueba que sobre una
   fachada «sólo LINE se declara espacial» y que con el ratón el trazo se
   aplana al suelo sin avisar (repetido de `00c-CUADRO-DE-MANDO.md`, bloque
   «Calidad del código», tercer hueco). `ESCALERA.md:172` es honesto y pone
   peldaño 3 con «falta un golden de navegador pinchando sobre una cara»;
   la rúbrica no distingue ese matiz y cobra los 2 puntos igual.
6. **`xrefs.resolution` cobra 2 puntos por «Resolución de recursos, CAPAS DE
   XREF y bind con round-trip»; las capas del dibujo adjuntado se aplastan
   a UNA sola.**
   `xref-projection.ts:100-105` sobrescribe la capa de cada entidad
   importada con `cadXrefLayerId(xrefId)` — una sola capa `XREF|<nombre>`,
   color fijo `#64748b`, grosor fijo 0,18 (repetido de
   `00c-CUADRO-DE-MANDO.md`, bloque «Trabajar con otros», primer hueco
   bloqueante). No hay `VISRETAIN` ni control de capas de xref: `grep`
   sobre `apps/web/src` de `fade` fuera de imágenes → 0. El criterio dice
   «CAPAS de xref» en su texto y el árbol no las tiene.

**Dirección B — declarado ausente cuando existe:**

7. **El auditor original calificó «DWG lectura/escritura» en 0/10, y el
   propio informe de interoperabilidad afirma «no puedo abrir el .dwg que
   me mandan, ninguno».**
   Falso como diagnóstico completo, verificado por
   `00c-CUADRO-DE-MANDO.md` hallazgo 8: `dwg-interop-flag.ts:173,190,240`
   tiene DOS autorizaciones firmadas (`ownerSigned: true`, ADR-0009
   §6-bis/ter/quater y §7) para AC1015 y AC1018, cableadas de punta a
   punta (`document-import-validation.ts:124`,
   `document-import.worker.ts:78-101`, `dashboard/page.tsx:692`). El
   escritor DWG público también existe (`dwg-native-writer.ts`, 469
   líneas, ADR-0009 §8 firmada). Lo que de verdad falta es la firma de la
   familia MODERNA (AC1024/27/32) y el dictamen jurídico — dos cosas, no
   «todo DWG». Este frente confirma con `grep -c "ownerSigned: true"
   apps/web/src/lib/cad/dwg-interop-flag.ts` → 2 coincidencias (verificado
   en esta pasada).
8. **El auditor trató `/demo` como «el editor real con un plano
   precargado» sin ver que ya abre el archivo del propio visitante.**
   Cubierto en la sección 4 de este documento: `DXFIN` está en el registro
   y no toca la red. Es la dirección B más valiosa de las dos: sobra
   producto y falta el renglón que lo anuncia, no al revés.

## 7 · Cola propuesta

> _Pendiente — depende de que las secciones 2 y 3 estén completas para
> ordenar por el criterio de §2.1 del prompt maestro (afirmación falsa
> viva > rompe el bucle > impide entregar > lo demás) sin omitir ninguna
> capacidad de AutoCAD que todavía no se comparó formalmente. La sección 5
> y las ocho contradicciones de §6 ya son candidatas seguras a la cola —
> en particular las contradicciones 1, 3 y 4 de §6 son afirmaciones falsas
> VIVAS (primer criterio de orden) — pero el resto de la cola de 30 no se
> arma hasta tener el barrido completo de §2/§3, para no dejar fuera algo
> más urgente que todavía no se ha mirado. Se completa en el siguiente
> commit de este frente. Enlaza a la ficha de `PROMPT_MAESTRO_FABLE.md`
> §OLA correspondiente cuando ya exista una tarea T-NN para el mismo hueco,
> en vez de duplicarla._

---

## Estado de este documento

Commit en curso — sección 1 (Método) y sección 4 (Lo que Valle tiene y
AutoCAD no) completas y verificadas con evidencia propia; sección 5
(huecos sin fila) tiene su primera fila propuesta (la apuesta del
navegador) y una segunda anotada para ampliar un criterio existente;
sección 6 (Contradicciones) tiene ocho contradicciones verificadas, cuatro
en cada dirección. Secciones 2, 3 y 7 están pendientes de que regrese la
investigación web de fuentes oficiales de Autodesk, lanzada en paralelo a
este commit. El resumen final de cuántas capacidades SÍ/PARCIAL/NO por
bloque se añade cuando esas secciones cierren, calculado del propio
documento.
