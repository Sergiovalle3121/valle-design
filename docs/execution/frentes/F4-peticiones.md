# F4 · Peticiones al coordinador (fuera de mi territorio)

## #1 · Unificar `publishSheetSetPdf()` con el emisor bueno (decisión §0 de F4.md)

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`
(prohibido para F4 — sólo el coordinador lo edita).

**Por qué:** `publishSheetSetPdf()` (13617–13878) dibuja el PDF a mano con
`jspdf` importado directamente, duplicando lo que `renderCadPlotPdf`
(`lib/cad/plot/plot-pdf.ts`, territorio F4) ya hace con specs, tabla de
plumas, incrustación de fuente y cajetín paramétrico. Los botones "Publicar
PDF" (líneas 15720 y 18811) llaman a esta función, así que TODAS las
correcciones de F4 sobre `plot-pdf.ts`/`plot-fidelity.ts`/`paper-space.ts`
(T-19, T-31, T-36) no llegan al botón real hasta que se unifique.

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

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx:2858,2867`
(prohibido para F4).

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

## #4 · `scripts/cad/monolith-budget.json`: registrar el crecimiento de `cad-document.ts` (T-11c)

**Archivo:** `scripts/cad/monolith-budget.json` (prohibido para F4 — lo aplica
el coordinador).

**Por qué:** T-11(c) añade el campo opcional `dxfBackgroundLossManifest` a
`CadDocument` (`apps/web/src/lib/cad/cad-document.ts`) más su manejo en
`commitChange`/`serializeCadDocument` — 4 líneas netas, el mínimo posible sin
sacrificar el clon profundo que la propia spec de este archivo exige (ver
`cad-document-migrate.spec.ts`, caso "el clon es profundo"). El archivo
estaba en 799/800 líneas ANTES de esta ficha (por razones ajenas a F4), así
que el mínimo necesario lo deja en **803**, 3 por encima del techo por
defecto. No está en `allowances` hoy, así que `check:monolith-budget` (parte
de `check:cad`) lo marca como archivo nuevo que supera 800.

Comprobé que no hay forma honesta de evitarlo sin: (a) gatear el conteo con
líneas fusionadas artificialmente (rechazado: reduce legibilidad para burlar
un contador, no una razón real), o (b) recortar comentarios ajenos ya
razonados de otras secciones del archivo (rechazado: no es mi contenido y
esta ficha no es la ocasión para editarlo). Dividir `cad-document.ts` es un
proyecto propio, no cabe en esta ficha.

**Cambio exacto (diff literal):**

```diff
     "apps/api/src/load-probe/review-concurrency.main.ts": 887,
     "apps/api/src/migration-cli/import.ts": 809,
     "apps/web/src/components/cad/editor/Layout3DEditor.tsx": 19002,
+    "apps/web/src/lib/cad/cad-document.ts": 803,
     "apps/web/src/lib/cad/commands/parser.ts": 1515,
```

(Equivalente a correr `node scripts/cad/check-monolith-budget.mjs --update
--allow-growth` sobre el árbol de esta rama — lo hice localmente para
confirmar el número exacto y lo revertí antes de commitear, porque el
archivo es territorio exclusivo del coordinador.)

**Prueba que lo verifica:** `npm run check:cad` (la línea "Presupuesto de
monolito: 0 problema(s)"). Con este único cambio aplicado, el resto de
`check:cad` ya está verde sobre esta rama (typecheck, lint, tests, DXF
evidence con el espejo local).

**Estado:** pendiente del coordinador. Mientras tanto, esta rama queda con
`check:cad` en rojo por esta única línea; todo lo demás (typecheck, lint,
`npx turbo run test --filter=web --filter=valle-design-api`) está verde.

---

## #3 · Doc-mismatch de arranque

`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md` y los demás
documentos de §0 no existían en `main` ni en ninguna rama remota al abrir
esta sesión (07:39 UTC). No es una petición de cambio de código, sólo un aviso
para el coordinador: si esos documentos existen sólo en su árbol de trabajo
local, F4 (y presumiblemente F3/F5/F8/F9/F10/F11) no pudieron leerlos y
trabajaron sólo con el resumen ya inlineado en el mensaje de arranque de cada
frente.
