# F9 · Buzón de peticiones

Cada entrada: qué archivo, qué cambio exacto, por qué, qué prueba lo
verifica. Las que tocan el monolito llevan el componente ya escrito y
probado fuera, y el diff mínimo de montaje.

---

## P-01 · Pasar el fondo real del lienzo a `defaultCadRenderStyle` (territorio F7 · `viewport/`)

**Archivo:** `apps/web/src/components/cad/viewport/render-pipeline-host.ts`

**Por qué.** T-13 (ver `F9.md`) añadió `legibleDefaultInk` en
`lib/cad/render/render-style.ts`: cuando la tinta por defecto del dibujo
(blanco de ACI 7, o `CAD_RENDER_DEFAULT_COLOR`) cae bajo 3:1 de contraste
contra el fondo del lienzo, se invierte a blanco o negro, lo que se vea.
`defaultCadRenderStyle` ya acepta un tercer parámetro opcional
`backgroundColor` para esto — con valor por defecto (`0x0a0f1e`, el preset
Oscuro) para que NINGÚN llamador actual cambie de comportamiento sin
tocarlo explícitamente. `styleOf` en `render-pipeline-host.ts:279` es el
único punto de la app que llama a `defaultCadRenderStyle` para pintar la
escena real, y hoy no pasa el fondo activo — así que el arreglo está
CONSTRUIDO pero no ENTRA EN VIGOR hasta que este archivo lo pase.

**Qué cambio exacto.**

1. Añadir un campo mutable con el fondo activo (número `0xRRGGBB`) a
   `CadViewportRenderHost`, inicializado con el mismo valor por defecto de
   `render-style.ts` (`0x0a0f1e`) para que el estado inicial no cambie:

   ```ts
   private backgroundColor = 0x0a0f1e;

   /** Fondo actual del lienzo (THEMES[theme].bg): T-13, para que la tinta
    * por defecto (legibleDefaultInk) sepa contra qué fondo tiene que verse. */
   setBackgroundColor(color: number): void {
     if (this.backgroundColor === color) return;
     this.backgroundColor = color;
     // Reinvalidar el estilo de toda entidad visible para que la tinta por
     // defecto se recalcule contra el nuevo fondo — el mismo camino que ya
     // usa `setSelection` para forzar un recoloreado sin reconstruir malla.
   }
   ```

2. En `styleOf` (línea 279), pasar el fondo:

   ```diff
   -    const style = defaultCadRenderStyle(entity, this.document ?? undefined);
   +    const style = defaultCadRenderStyle(entity, this.document ?? undefined, this.backgroundColor);
   ```

3. Dónde llamar a `setBackgroundColor`: en el mismo sitio donde
   `Layout3DEditor.tsx` aplica `THEMES[theme]` a la escena (hoy
   `Layout3DEditor.tsx:2323`, `const th = THEMES[themeRef.current]`), añadir
   una llamada a `renderHost.setBackgroundColor(th.bg)` — esto SÍ toca el
   monolito (una línea) y por eso es la mitad B de esta petición, dirigida
   al coordinador/F1, no a F7.

**Qué prueba lo verifica.** `render-pipeline-host.spec.ts` (si no existe,
crear uno mínimo): construir el host con un documento cuya capa "0" no
declare color explícito (así el estilo cae en ACI 7 blanco), llamar
`setBackgroundColor(0xeaf0f8)` (el preset Claro) y afirmar que
`styleOf(entity).color !== 0xffffff` y que
`packedContrastRatio(styleOf(entity).color, 0xeaf0f8) >= 3`
(`packedContrastRatio` ya exportado de `render-style.ts`). Sin esta prueba,
el wiring puede aplicarse y no invalidar el estilo cacheado, y el defecto
seguiría vivo en la práctica aunque el mecanismo exista.

---

## P-02 · `Layout3DEditor.tsx:2058-2061` — desacoplar el tema del lienzo del tema de la app (o, como mínimo, aplicar P-01)

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`

**Por qué.** Hoy:

```ts
useEffect(() => {
  setTheme(resolvedScheme === "light" ? "light" : "dark");
}, [resolvedScheme]);
```

fuerza el lienzo 3D a seguir el esquema de la APP (claro/oscuro de toda la
interfaz) cada vez que el usuario cambia el tema, ignorando cualquier
elección de tema del LIENZO que hubiera hecho antes (`night`, `studio`, o
incluso `light`/`dark` elegido a propósito de forma independiente). Con
`legibleDefaultInk` (T-13) ya en `render-style.ts`, este forzado deja de
BORRAR el plano — la tinta por defecto ahora se adapta a cualquier fondo,
incluido el que resulte de este forzado —, pero sigue cambiando el lienzo
sin que el usuario lo haya pedido, que es un defecto de UX aparte (no
bloqueante, no de integridad).

**Qué cambio exacto — dos opciones, de menor a mayor alcance:**

1. **Mínimo (recomendado para esta ola):** aplicar P-01 (pasar
   `THEMES[theme].bg` a `renderHost.setBackgroundColor`) en el mismo
   `useEffect` que ya escribe `themeRef.current = theme` (línea 2057-2058),
   para que CUALQUIER tema resultante —forzado o no— mantenga la tinta
   legible. Esto por sí solo cierra el bloqueante de T-13 sin decidir nada
   sobre si el forzado debe existir.
2. **Completo (fuera de alcance de esta ola, a valorar por el titular):**
   que el lienzo recuerde su propio tema por separado del tema de la app
   (persistido junto a las demás preferencias de `cadWorkspaceStorageKey`),
   y que el `useEffect` de la línea 2059-2061 sólo aplique el tema de la app
   la PRIMERA vez (sin preferencia guardada), no en cada cambio. Esto es una
   decisión de producto (¿debe el lienzo seguir el tema de la app por
   defecto?) que no me corresponde tomar unilateralmente.

**Qué prueba lo verifica.** Golden nuevo (numerado 160-169, territorio F9):
cambiar el tema de la app de oscuro a claro con un dibujo que tenga
entidades en capa "0" sin color explícito, y afirmar que las entidades
siguen siendo visibles (golpe de contraste ≥3:1 vía captura de píxel, o al
menos que el color de instancia en el buffer de la GPU no sea
`0xffffff` sobre un fondo claro). Pendiente de escribir: depende de que P-01 esté aplicado (el golden
necesita que el fondo real llegue al pipeline de render para tener algo que
afirmar) — lo añado a mi cola en cuanto esa petición se aplique.

---

## P-03 · (para `BACKLOG.md`, no la toco yo) Precachear el núcleo de comandos del service worker — T-75(d)

**No es una petición de archivo a otro frente: es una propuesta de entrada
para `docs/execution/BACKLOG.md`, que el coordinador es quien edita (§3
prohíbe que yo lo toque). El service worker SÍ es mi territorio, pero el
trabajo es demasiado grande y demasiado arriesgado para hacerlo dentro de
esta ola sin revisión: un error en un service worker no falla ruidoso,
falla mudo semanas después en la máquina de un usuario, y ARREGLÉ la
honestidad de la fila (ver bitácora T-75d) precisamente para no fingir que
esto ya está resuelto.**

**El hueco medido.** `service-worker-policy.ts`: `SW_PRECACHE_URLS` sólo
lleva el cascarón (`/sin-conexion`, manifiesto, iconos, dos `.woff2`).
`/_next/static/*` es `stale-while-revalidate` — se sirve de caché SÓLO
después de haberse pedido una vez. Los 108 módulos de comandos en carga
diferida (`lib/cad/commands/lazy.ts` es la puerta, pero cada comando del
registro es su propio `import()`) nunca se precachean: un comando que la
persona no tecleó en esta pestaña, sin red, falla al intentar descargar su
chunk.

**Por qué no es un fix de una tarde.** Los nombres de archivo de
`/_next/static/chunks/*.js` llevan el hash de contenido de Webpack/Next y
no se conocen hasta que el build termina — igual que `PRELOAD_FONTS` se
genera desde el manifiesto de fuentes (`scripts/design/subset-fonts.py`),
precachear "el núcleo de comandos" exige:

1. Definir QUÉ ES el núcleo (¿los comandos que aparecen en `dibujar`,
   `acotar`, `referenciar a objeto`, `empujar cara`? ¿Los que la Ola 1 del
   flujo de 10 segundos usa?) — es una decisión de producto, no técnica.
2. Un script que lea `.next/app-build-manifest.json` (o equivalente) tras
   el build, resuelva los chunks reales de esos módulos, y los inyecte en
   `SW_PRECACHE_URLS` — cambia la naturaleza de ese array de "lista fija"
   a "generada", como ya pasó con las fuentes.
3. `cache.addAll` es todo-o-nada (`service-worker-policy.ts` lo explica: es
   deliberado). Si UN chunk del núcleo falla en `install`, el worker entero
   no instala — nadie tiene NINGÚN offline, ni siquiera el cascarón que
   funciona hoy. Eso exige probarlo contra un build real antes de fusionar,
   no contra un mock.
4. El propio `SW_CACHE_NAME` deriva de un hash de la política — añadir los
   chunks del núcleo lo cambia, fuerza reinstalación en todos los
   navegadores con el worker viejo, y hay que medir esa transición.

**Lo que SÍ se hizo mientras tanto (T-75d, en esta rama):** la fila
`dibujar-acotar-modelar` de `offline-capability-matrix.ts` decía
`seNota: "Nada. Es el único trozo del producto donde la red no se echa de
menos."` — falso para un comando no cacheado. Corregida para explicar la
condición real (código YA descargado) y con un spec nuevo
(`offline-capability-matrix.spec.ts`, bloque 14) que falla si alguien la
revierte a esa frase.

**Qué probaría la entrada de BACKLOG cuando alguien la tome:** un golden
que simule Playwright con `context.setOffline(true)` DESPUÉS de un primer
`goto` (para que el cascarón y los core chunks ya se hayan precacheado
según la política nueva), abra el estudio, teclee un comando del núcleo
declarado, y confirme que ejecuta — y otro que confirme que install() del
worker sigue en verde con la lista ampliada contra un build real.

---

## P-04 · Montar `SaveStatusPanel` sustituyendo el toast de 12 s — T-75(a)

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`

**El componente ya está escrito, probado y fuera del monolito:**
`apps/web/src/components/cad/studio/SaveStatusPanel.tsx` +
`SaveStatusPanel.spec.ts` (11/11 verdes). Recibe `issue: {kind, title?,
message} | null` y dos callbacks OPCIONALES (`onRetry`, `onExportDxf`): sin
ellos se degrada a mostrar el texto completo con un botón "Detalles", sin
fingir acciones que no harían nada. No tiene ningún `setTimeout`: es
persistente mientras `issue` no sea `null`.

**Por qué no lo monté yo mismo.** `CadStatusBar.tsx` (donde vive hoy
`saveIssue`, ya fuera del monolito) tiene su altura ajustada al píxel contra
CUATRO goldens (19, 67, 68, 72 — el propio archivo lo dice en un comentario:
"36 px de barra frente a los 75 de antes"), y ya hay un historial escrito
de un aviso flotante (`fixed right-3 top-[11.5rem]`, la barra de llamada)
que tapaba un botón real. Decidir la posición sin poder correr esos cuatro
goldens localmente habría sido adivinar sobre una superficie que ya se
midió mal una vez. Prefiero entregar el componente listo y que quien tiene
el árbol completo decida dónde flota.

**Lo que hay que cambiar, en tres sitios:**

1. **El tipo `saveIssue` pierde el título de `describeCadSaveFailure` hoy
   mismo**, con o sin este panel — es un defecto aparte que este panel deja
   visible. En la declaración del estado (busca
   `const [saveIssue, setSaveIssue] = useState<{`):

   ```diff
    const [saveIssue, setSaveIssue] = useState<{
      kind: "conflict" | "offline" | "server";
   +  title?: string;
      message: string;
      serverVersion?: number;
    } | null>(null);
   ```

   Y en `CadStatusBarSaveState` (`components/cad/studio/CadStatusBar.tsx`,
   mío, ya actualizado en este mismo PR) el campo `title?: string` ya está
   declarado — sólo falta que el monolito lo rellene.

2. **El manejador principal** (busca `const aviso = describeCadSaveFailure(saveError);` — hay DOS apariciones, la primera dentro de la rama que ya llama a `setSaveIssue`):

   ```diff
        const aviso = describeCadSaveFailure(saveError);
        if (requestIsActive) {
          if (aviso.kind === "offline") setConnectionState("offline");
          setSaveIssue({
            kind: aviso.kind === "offline" ? "offline" : "server",
   +        title: aviso.title,
            message: aviso.message,
          });
   -      toast.error(aviso.message, aviso.title);
        }
        return null;
      }
   ```

   El toast de la RAMA DE CONFLICTO (`toast.error(saveError.message, "Conflicto CAS")`, unas líneas antes) puede quedarse o pasar también al panel (`setSaveIssue({kind: "conflict", title: "Conflicto CAS", message: saveError.message, serverVersion: saveError.serverVersion})` ya lo hace, sólo añade `title`) — es una decisión de UX menor, no de arquitectura.

3. **El segundo manejador** (`runCanonicalSave`, la segunda aparición de
   `const aviso = describeCadSaveFailure(saveError);`) **hoy NO llama a
   `setSaveIssue` en absoluto** — sólo saca el toast. Es un hueco de
   cobertura que este panel también destaparía si no se corrige a la vez:
   sin el `setSaveIssue`, ese camino de guardado seguiría sin aviso
   persistente aunque el panel exista.

   ```diff
        const aviso = describeCadSaveFailure(saveError);
        if (aviso.kind === "offline") setConnectionState("offline");
   -    toast.error(aviso.message, aviso.title);
   +    setSaveIssue({
   +      kind: aviso.kind === "offline" ? "offline" : "server",
   +      title: aviso.title,
   +      message: aviso.message,
   +    });
        return null;
      } finally {
   ```

4. **Montar el panel.** En `CadStatusBar.tsx` (mío) o en el nivel del
   estudio donde ya flotan otros overlays (`CadViewportPrompt`,
   `viewport-hints.tsx`, mío también): `import { SaveStatusPanel } from
   "@/components/cad/studio/SaveStatusPanel"` y
   `<SaveStatusPanel issue={saveState.saveIssue} onRetry={() => void save()} onExportDxf={() => /* el mismo handler del botón DXF existente */} />`
   — `save` es la función ya definida unas líneas después del segundo
   manejador (`const save = async (): Promise<Layout | null> => {`); el
   handler de exportar DXF ya existe en algún punto del monolito para el
   botón de la paleta, búscalo por `exportCadDocumentDxf` o el
   `data-testid` del botón de exportar.

**Qué prueba lo verifica.** `SaveStatusPanel.spec.ts` ya cubre el
componente puro. Falta un golden de integración (fuera de mi alcance sin
el montaje real): provocar un guardado fallido de verdad y afirmar que el
panel PERSISTE más allá de 12 s (a diferencia del toast) y que
"Reintentar" dispara un segundo intento real.

---

## P-05 · Los 9 `outline-none` que quedan del trinquete de foco visible (T-73/d)

**Contexto.** `foco-visible.spec.ts` (`components/ui/`) contaba 27
controles con `outline-none` y ningún sustituto visible del anillo de
foco. Las 18 que vivían fuera del monolito ya llevan
`focus-visible:ring-2 focus-visible:ring-ring` en este mismo commit, y el
techo de `foco-visible-budget.json` bajó de 27 a **9** — el trinquete sólo
baja, y no puede bajar más de aquí sin tocar `Layout3DEditor.tsx`, donde
viven las 9 restantes. Mismo arreglo, mecánico, en las 9 líneas:

```diff
  # línea 15408 — selector de estado de aprobación del plano
- className="type-caption rounded-md px-1.5 py-1 bg-muted/60 border border-border outline-none"
+ className="type-caption rounded-md px-1.5 py-1 bg-muted/60 border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 16267 — caja de búsqueda de la paleta Ctrl+K (ver también P-06,
  # que le falta bastante más que el foco)
- className="min-w-0 flex-1 bg-transparent type-small text-foreground placeholder:text-muted-foreground outline-none"
+ className="min-w-0 flex-1 bg-transparent type-small text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17137 — ancho de pasillo (herramienta de distribución)
- className="w-20 rounded-md bg-muted/60 px-2 py-1 text-right outline-none"
+ className="w-20 rounded-md bg-muted/60 px-2 py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17351 — longitud del muro seleccionado
- className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none"
+ className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17379 — ángulo del muro seleccionado (misma clase que la anterior)
- className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none"
+ className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17424 — nombre visible del activo seleccionado
- className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none"
+ className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17441 — capa del objeto seleccionado
- className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none"
+ className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17463 — tags del objeto seleccionado
- className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none"
+ className="w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  # línea 17477 — notas del objeto seleccionado
- className="w-full resize-none rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none"
+ className="w-full resize-none rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
```

**Por qué no lo hago yo.** Las 9 líneas están dentro de
`Layout3DEditor.tsx`, territorio de F1. Es el mismo patrón exacto que ya
se aplicó a las 18 restantes — cero riesgo de comportamiento, sólo una
clase Tailwind añadida — pero el archivo tiene su propio trinquete de
tamaño y dueño.

**Después de aplicar.** Baja `maximo` en
`components/ui/foco-visible-budget.json` de 9 a 0 y actualiza su `nota`.
El trinquete llega a cero por primera vez.

---

## P-06 · La paleta Ctrl+K no tiene ni un atributo de accesibilidad (T-73/i)

**Contexto.** Es la superficie insignia del producto y hoy, para un
lector de pantalla, no existe como diálogo: es un `<div>` flotante sin
`role`, sin `aria-modal`, sin `aria-label` y sin trampa de foco. El propio
patrón ya existe en el repo, probado y en uso en los ocho cuadros del
editor (`CadDialogShell.tsx`, `components/cad/dialogs/`) — no hace falta
inventar nada, sólo aplicarlo aquí.

**Dónde.** El estado (`showPalette`, `paletteQuery`) se declara en las
líneas 1516-1517; el marcado de la paleta ocupa aproximadamente las
líneas 16251-16320 (input de búsqueda en 16255-16268, lista de resultados
desde 16292).

**Qué falta, mínimo defendible:**

```diff
- <div className="absolute top-3 right-3 ...">
+ <div
+   className="absolute top-3 right-3 ..."
+   role="dialog"
+   aria-modal="true"
+   aria-label="Buscar comando, herramienta o símbolo"
+ >
```

Más la trampa de foco: el mismo `useEffect` con captura de `keydown` para
Tab/Shift+Tab que ya usa `CadDialogShell.tsx` (líneas 73-106 de ese
archivo), apuntando al contenedor de la paleta en vez de a
`panelRef`. Ctrl+K vive dentro del monolito y no puede importar
`CadDialogShell` sin envolver TODO el `<div>` en él (cambiaría el
marcado/estilos existentes) — la alternativa mínima es copiar sólo la
lógica de la trampa de foco (las ~35 líneas del `useEffect`, no el
componente completo), tal como está documentado en `CadDialogShell.tsx`.

**Por qué no lo hago yo.** Marcado y estado dentro de
`Layout3DEditor.tsx`. El input de búsqueda (línea 16267) ya lleva el
anillo de foco por P-05; esta petición es el resto: rol, nombre accesible
y trampa de foco.

**Qué prueba lo verificaría.** No existe hoy ninguna spec de
accesibilidad para Ctrl+K — los dos e2e existentes
(`e2e/auditoria/refutacion-cmdk-silla.spec.ts`,
`refutacion-palabra-imprimir.spec.ts`) prueban qué bloque se inserta, no
sus atributos ARIA. Un golden nuevo que abra con Ctrl+K, confirme
`role="dialog"` y `aria-modal`, y que Tab cicle dentro sin escapar a la
paleta de capas de abajo, cerraría T-73(i).

---

## P-07 · El portal a `document.body` deja TODO el editor fuera de cualquier landmark (T-73/e)

**Contexto.** `axe-estudio.spec.ts` subió el filtro para que `moderate`
reprima de verdad (T-73/e) — con una única excepción nombrada, `region`,
documentada en el propio archivo con el `id` de los nodos que la disparan:
un rótulo de la barra (`.flex-nowrap > .type-small.font-semibold`), un
elemento de visibilidad responsiva (`.xl\:inline`) y el selector de estado
de aprobación (`select[aria-label="Estado de aprobación del plano"]`,
línea 15408). `page-has-heading-one` —la otra mitad de este mismo
hallazgo— ya está resuelta sin tocar el monolito: `CadStudioHost.tsx`
envuelve todo en `<main aria-label="Estudio de dibujo">` con un
`<h1 className="sr-only">` dentro.

**Por qué ese `<main>` no basta para `region`.** El editor entero se pinta
con `createPortal(<div>...</div>, document.body)` (línea ~18451) para que
sus overlays `position:fixed` escapen el `backdrop-filter` del contenedor
—si no, quedarían atrapados dentro de su propia caja en vez del viewport.
Un portal de React sale del árbol del DOM aunque el componente siga
colgado del árbol de React: el `<main>` de `CadStudioHost` envuelve el
`<h1>` y las capas de colaboración (que SÍ están en el flujo normal), pero
el editor portado se pinta como hijo directo de `<body>`, fuera de
cualquier landmark — de ahí que sólo `region` (no `page-has-heading-one`)
siga sin resolverse.

**El arreglo, en una línea.** Cambiar el segundo argumento de ese
`createPortal` de `document.body` a un contenedor que YA sea un landmark.
No hace falta que el contenedor lo cree el monolito: `CadStudioHost.tsx`
puede crear un `<div>` con `role="region"` (o reutilizar su propio
`<main>` si el `id` se expone) e insertarlo en `document.body` con un
`ref`, y pasarle ese nodo al editor por una prop existente o nueva. Como
mínimo defendible, sólo dentro del monolito:

```diff
- return createPortal(
+ const contenedorPortal =
+   typeof document !== "undefined"
+     ? (document.getElementById("cad-editor-portal-root") ?? document.body)
+     : document.body;
+ return createPortal(
    <div
      data-color-scheme={resolvedScheme}
      ...
    >
      ...
    </div>,
-   document.body,
+   contenedorPortal,
  );
```

Con `CadStudioHost.tsx` (mío) creando ese `<div id="cad-editor-portal-root" role="region" aria-label="Editor" />`
como hermano del `<main>`, insertado una sola vez al montar (un `useEffect`
con `document.body.appendChild`/`removeChild`, o de forma más simple un
`<div id="cad-editor-portal-root" />` fijo en el propio `layout.tsx` raíz
de la app, fuera del árbol de React del estudio pero presente en TODAS las
rutas). La segunda opción es más simple y no depende de que
`CadStudioHost` monte antes que el editor intente portar.

**Por qué no lo hago yo.** El `createPortal` y su segundo argumento están
dentro de `Layout3DEditor.tsx`. El contenedor destino sí lo puedo crear yo
(en `layout.tsx` raíz o en `CadStudioHost.tsx`), y lo dejo listo si quien
aplique esta petición lo prefiere así — avísenme y lo agrego en el mismo
commit.

**Qué prueba lo verifica.** `axe-estudio.spec.ts` ya lo detecta: al
aplicar esto, quitar `'region'` de `MODERADAS_PENDIENTES_DE_PETICION` (que
queda vacío) y confirmar que el aviso `region` desaparece del log de
`avisos no bloqueantes` en ambos temas.

---
