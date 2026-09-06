# F4 · Peticiones al coordinador (fuera de mi territorio)

## #1 · Unificar `publishSheetSetPdf()` con el emisor bueno (decisión §0 de F4.md)

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`
(prohibido para F4 — sólo el coordinador lo edita).

**Por qué:** `publishSheetSetPdf()` (línea 13366 tras rebasar sobre `main`
real el 2026-09-06; era 13617 al escribir esto por primera vez — el archivo
sigue moviéndose bajo trabajo paralelo, así que localízala por nombre, no por
número) dibuja el PDF a mano con `jspdf` importado directamente, duplicando
lo que `renderCadPlotPdf` (`lib/cad/plot/plot-pdf.ts`, territorio F4) ya hace
con specs, tabla de plumas, incrustación de fuente y cajetín paramétrico. Los
botones "Publicar PDF" (`onClick={() => void publishSheetSetPdf()}`, dos
apariciones) llaman a esta función, así que TODAS las correcciones de F4
sobre `plot-pdf.ts`/`plot-fidelity.ts`/`paper-space.ts` (T-19, T-31, T-36 —
T-19 y T-36 ya ARREGLADAS en mi territorio) no llegan al botón real hasta
que se unifique.

**Cambio exacto (diff literal):**

```diff
-  const publishSheetSetPdf = async () => {
+  const publishSheetSetPdf = async () => {
     if (!data || publishingSheetSet) return;
     if (!paperSpaces.some((space) => space.includeInPublish !== false)) {
       toast.error(
         "Crea o incluye al menos una hoja antes de publicar.",
         "Hojas",
       );
       return;
     }
     setPublishingSheetSet(true);
     setPublicationWarnings([]);
     try {
       // Persist the definition first; publication advances the same CAS token.
       const saved = await save();
       const canonical = loadedCadDocumentRef.current;
       if (!saved || !canonical) return;
-      const plan = buildCadPublishPlan(canonical, new Date().toISOString());
-      setPublicationWarnings(plan.warnings);
-      if (!plan.sheets.length) {
-        toast.error("El conjunto no contiene hojas publicables.", "Hojas");
-        return;
-      }
-      const { jsPDF } = await import("jspdf");
-      const first = plan.sheets[0];
-      const pdf = new jsPDF({ ... });
-      /* … ~220 líneas de dibujo a mano con jsPDF … */
-      const buffer = pdf.output("arraybuffer");
-      const fileName = `${model}-${revision}-sheet-set.pdf`.replace(/[^\w.\-]+/g, "_");
-      /* … auditoría de publicación … */
-      const blob = new Blob([buffer], { type: "application/pdf" });
+      // publishCadSheetSet ya envuelve renderCadPlotPdf: cajetín, fuentes con
+      // aviso de incrustación/sustitución, tabla de plumas, portada e índice.
+      // El conjunto de planos de esta lámina es un CadSheetSet de una sola
+      // "hoja lógica" por presentación incluida — build inline aquí porque
+      // el editor de lámina única no tiene un CadSheetSet persistido propio.
+      const set = buildInlineSheetSetFromPaperSpaces(canonical, paperSpaces);
+      const result = await publishCadSheetSet({
+        set,
+        documents: new Map([[canonical.id, canonical]]),
+        date: new Date().toISOString().slice(0, 10),
+      });
+      setPublicationWarnings(result.warnings);
+      if (result.pageCount === 0) {
+        toast.error("El conjunto no contiene hojas publicables.", "Hojas");
+        return;
+      }
+      const fileName = `${model}-${revision}-sheet-set.pdf`.replace(/[^\w.\-]+/g, "_");
+      const blob = new Blob([result.bytes as unknown as BlobPart], { type: "application/pdf" });
       /* … el resto de la función (auditoría de publicación, descarga, toasts) sigue igual … */
```

`buildInlineSheetSetFromPaperSpaces` es una función pequeña nueva (mapear
`paperSpaces` del documento a un `CadSheetSet` de una entrada por lámina,
`documentId: canonical.id`, `layoutId: space.id`) — no existe hoy porque el
editor de lámina única nunca necesitó un `CadSheetSet` real; sheet-set.ts
(territorio F4) ya expone los tipos, así que puedo escribirla en
`lib/cad/sheet-set/` si el coordinador prefiere que la aporte yo y sólo
cablee la llamada.

**Import a retirar:** `jspdf` deja de usarse en este archivo (queda como
dependencia de `plot-pdf.ts`/`pdf/` si la usan ahí — comprobar antes de
quitarla de `package.json`).

**Prueba que lo verifica:** golden nuevo F4 (130) — publicar una lámina con
una capa "no se imprime", un texto y una ventana con escala 1:50, abrir el
PDF con el oráculo de T-31 (`pypdf`/`pdfminer.six`) y afirmar que el PDF que
sale del BOTÓN (no de PLOT) ya no imprime la capa oculta y ya incrusta/avisa
fuentes. Hasta que esta petición se aplique, ese golden sólo puede cubrir el
camino PLOT/PUBLISH — lo digo explícito en el golden para que no finja cubrir
el botón.

**Estado:** pendiente del coordinador.

---

## #2 · Reseteo de manifiesto de pérdidas DXF de fondo (T-11 c)

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`, la
llamada `setDxfWarnings([])` al abrir el documento (línea 2858 tras rebasar
sobre `main` real el 2026-09-06 — coincide con el número original por
casualidad; hay otras dos apariciones de `setDxfWarnings([])`, en `removeDxf`
y en el botón de limpiar avisos, que NO son ésta: localízala por el bloque
que sigue a `dxfModelRef.current = null; dxfMetaRef.current = null;` dentro
del efecto de carga del documento) (prohibido para F4).

**Por qué:** `lib/cad/dxf-export-loss-manifest.ts` (territorio F4) calcula el
manifiesto de pérdidas del DXF de fondo; hoy es de sesión (se pierde al
recargar/reabrir el documento) porque el monolito lo mantiene en estado
efímero de React en vez de leerlo del documento persistido. F4 hace viajar el
campo (opcional, lectura tolerante) en el documento — ver bitácora T-11(c)
más abajo cuando quede terminada — pero el RESET del estado efímero en las
líneas 2858 y 2867 (`setDxfBackgroundLossManifest(null)` o equivalente al
cambiar de documento/reimportar) pertenece al coordinador.

**Cambio exacto:** diff pendiente — se añade en cuanto la ficha T-11(c) quede
arreglada en mi territorio (el campo del documento y su lectura tolerante
tienen que existir primero para que el diff del reset tenga sentido).

**Prueba que lo verifica:** golden — importar DXF de fondo con pérdidas,
recargar el documento (cerrar/reabrir el editor), afirmar que el manifiesto
sigue visible.

**Estado:** pendiente de que F4 termine T-11(c) en su propio territorio.

---

## #4 · `scripts/cad/monolith-budget.json`: registrar el crecimiento de `cad-document.ts` (T-11c) y `paper-space.ts` (T-19, T-30, T-36)

**Archivo:** `scripts/cad/monolith-budget.json` (prohibido para F4 — lo aplica
el coordinador).

**Por qué:** T-11(c) añade el campo opcional `dxfBackgroundLossManifest` a
`CadDocument` (`apps/web/src/lib/cad/cad-document.ts`) más su manejo en
`commitChange`/`serializeCadDocument` — 4 líneas netas, el mínimo posible sin
sacrificar el clon profundo que la propia spec de este archivo exige (ver
`cad-document-migrate.spec.ts`, caso "el clon es profundo"). El archivo
estaba en 799/800 líneas ANTES de esta ficha (por razones ajenas a F4), así
que el mínimo necesario lo deja en **804**, 4 por encima del techo por
defecto. No está en `allowances` hoy, así que `check:monolith-budget` (parte
de `check:cad`) lo marca como archivo nuevo que supera 800.

Comprobé que no hay forma honesta de evitarlo sin: (a) gatear el conteo con
líneas fusionadas artificialmente (rechazado: reduce legibilidad para burlar
un contador, no una razón real), o (b) recortar comentarios ajenos ya
razonados de otras secciones del archivo (rechazado: no es mi contenido y
esta ficha no es la ocasión para editarlo). Dividir `cad-document.ts` es un
proyecto propio, no cabe en esta ficha.

`paper-space.ts` YA estaba en `allowances` (896, tocado por olas anteriores)
por razones ajenas a F4. T-19·3 (capa `plot:false` nunca imprime) y T-19·4
(fuga de espacio papel: una entidad de PAPEL dejaba de excluirse de la
proyección de MODELO, y el contorno real de una ventana poligonal viaja ahora
en vez de perderse), T-36 (escala anotativa resuelta por ventana) y T-30
(paperCommands: lo dibujado directamente sobre el papel), suman 79 líneas —
la nueva asignación es **975**.
Igual que con `cad-document.ts`: probé activamente evitar el crecimiento
(revisé línea por línea si algo se podía comprimir sin tocar comentarios
ajenos) y no cupo sin sacrificar la claridad del propio arreglo o gatear el
contador con líneas fusionadas artificialmente.

**Cambio exacto (diff literal):**

```diff
     "apps/api/src/load-probe/review-concurrency.main.ts": 887,
     "apps/api/src/migration-cli/import.ts": 809,
     "apps/web/src/components/cad/editor/Layout3DEditor.tsx": 19002,
+    "apps/web/src/lib/cad/cad-document.ts": 804,
     "apps/web/src/lib/cad/commands/parser.ts": 1515,
```

y, más abajo en el mismo objeto `allowances` (orden alfabético existente):

```diff
-    "apps/web/src/lib/cad/paper-space.ts": 896,
+    "apps/web/src/lib/cad/paper-space.ts": 975,
```

(Equivalente a correr `node scripts/cad/check-monolith-budget.mjs --update
--allow-growth` sobre el árbol de esta rama — lo hice localmente para
confirmar los números exactos y lo revertí antes de commitear cada vez,
porque el archivo es territorio exclusivo del coordinador.)

**Prueba que lo verifica:** `npm run check:cad` (la línea "Presupuesto de
monolito: 0 problema(s)"). Con estos dos cambios aplicados, el resto de
`check:cad` ya está verde sobre esta rama (typecheck, lint, tests, DXF
evidence con el espejo local).

**Estado:** pendiente del coordinador. Mientras tanto, esta rama queda con
`check:cad` en rojo por estas dos líneas; todo lo demás (typecheck, lint,
`npx turbo run test --filter=web --filter=valle-design-api`) está verde.

---

## #3 · Doc-mismatch de arranque

`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md` y los demás
documentos de §0 no existían en el `main` que este contenedor tenía clonado
al abrir la sesión (07:39 UTC) — el clon estaba 127 commits desactualizado
(ver "Rebase sobre origin/main real" en F4.md). Sobre el `main` real SÍ
existen, en `docs/execution/auditoria-fable/dimensiones/`. Corregido: no es
un doc-mismatch real, era un clon viejo. Se deja la entrada para que quede
escrito el hallazgo, no para pedir nada.

---

## #5 · `entity-commands.ts`: el aplicador genérico de "insert" no distingue espacio destino (T-19·4 y T-30)

**Archivo:** `apps/web/src/lib/cad/entity-commands.ts` (fuera de mi
territorio explícito — no está en la lista de F4).

**Por qué:** el mismo síntoma de raíz aparece en DOS fichas mías. El
aplicador genérico de `{type:"insert", entity}` añade TODA entidad nueva a
`document.modelSpace.entityIds` (draw order), sin mirar si el comando que la
generó pretendía colocarla en el PAPEL de la presentación activa en vez de
en el modelo. Efectos:
- (T-19·4, YA MITIGADO en mi territorio) el contorno de una ventana
  poligonal —que SÍ se añade correctamente a `paperSpace.entityIds` desde
  `viewport-operations.ts`— queda TAMBIÉN en `modelSpace.entityIds`, y
  `buildCadPublishPlan` lo excluye ahora de la proyección de modelo con
  aviso. Arreglado el síntoma en el PDF; la causa (la entidad vive en dos
  sitios en el documento) sigue ahí.
- (T-30, sin mitigar) no hay forma de que un comando de dibujo (LINE, TEXT)
  ejecutado con el editor en ESPACIO PAPEL escriba en
  `paperSpace.entityIds` en vez de en `modelSpace.entityIds`. El camino de
  LECTURA/EXPORTACIÓN de `paperCommands` (mi territorio) ya está listo y
  probado; falta la AUTORÍA.

**Cambio que se necesita (no aporto el diff — no conozco el archivo lo
bastante para no romper el resto del aplicador):** el comando genérico de
inserción necesita saber en qué espacio se ejecutó (probablemente vía
`CadCommandContext`, que ya sabe `activeLayout`/`activeSpace` en algún
punto del motor) y, cuando el espacio activo es PAPEL, añadir el id a
`paperSpaces[activeLayoutId].entityIds` en vez de a `modelSpace.entityIds`
— nunca a los dos.

**Prueba que lo verifica:** spec en `entity-commands.spec.ts` (o donde viva
la suite del aplicador): dibujar una LINE con el espacio activo en PAPEL
produce una entidad en `paperSpace.entityIds` y NO en `modelSpace.entityIds`.
Golden de extremo a extremo (dibujar en papel con el editor real, publicar,
verlo en el PDF y no en ninguna ventana) una vez este cambio y el de T-30
estén los dos aplicados.

**Estado:** pendiente del coordinador — no bloquea T-19·4 ni T-30, que ya
están arregladas en el lado que me toca.
