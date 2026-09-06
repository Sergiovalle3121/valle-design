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

## P-08 · Ctrl+8/Ctrl+9 no son los de AutoCAD, y el comentario lo niega (T-74/h)

**Contexto.** AutoCAD real: `Ctrl+8` abre QuickCalc, `Ctrl+9` alterna la
ventana de la línea de comandos. Este producto: `Ctrl+8` abre el gestor de
estilos, `Ctrl+9` abre Ajustes de dibujo (`DSETTINGS`) —y el comentario en
`editor-keyboard.ts:233-234` afirma que los dos «son como en AutoCAD»,
cuando no lo son. `editor-keyboard.spec.ts:128-137` fija ese
comportamiento actual como si fuera el correcto («Ctrl+9 abre DSETTINGS»).

**Por qué esto es UNA petición, no dos ediciones sueltas.** La decisión
(`toggle-draft-settings` → `toggle-draft-settings`) vive en
`editor-keyboard.ts`, que SÍ es mío — pero la EJECUCIÓN de la acción nueva
(alternar la visibilidad de `CadCommandLineDock`) vive dentro de
`Layout3DEditor.tsx`. Si yo cambiara sólo `editor-keyboard.ts`, `Ctrl+9`
dejaría de hacer NADA hasta que alguien con acceso al monolito aplicara la
otra mitad — un atajo que hoy funciona (mal, pero funciona) quedaría muerto
mientras tanto. Las dos mitades van juntas, en un solo commit de quien
aplique esto.

**No hay QuickCalc en este producto** (ni lo hay en la vara de la
campaña: no es una promesa comercial declarada) — inventarlo sería una
funcionalidad nueva fuera del alcance de esta ficha. Por eso `Ctrl+8`
se queda en el gestor de estilos: no es AutoCAD, pero es un atajo real a
una paleta real, y quitarlo sin nada que ponerle sería peor. Lo que SÍ se
arregla es la mentira del comentario y el hueco real: `Ctrl+9` sí tiene
equivalente en este producto (la línea de comandos existe) y hoy no está
atado a nada parecido.

**`editor-keyboard.ts`** (mío, NO aplicado — ver el porqué arriba):

```diff
   | { type: "reveal-properties" }
   | { type: "toggle-styles" }
-  | { type: "toggle-draft-settings" }
+  | { type: "toggle-command-line" }
```
```diff
-  // Ctrl+1 propiedades, Ctrl+2 DesignCenter, Ctrl+3 paletas, Ctrl+8 estilos y
-  // Ctrl+9 DSETTINGS — como en AutoCAD.
-  // No pasan por matchCadShortcut porque su registro vive fuera de la sesión
-  // que las cableó; cuando el registro las admita, estas tres líneas se
-  // sustituyen por sus ids.
+  // Ctrl+1 propiedades y Ctrl+2/Ctrl+3 (abajo) sí son como en AutoCAD.
+  // Ctrl+8 NO lo es: el real es QuickCalc, que este producto no tiene: se
+  // deja en el gestor de estilos —un atajo real a una paleta real— en vez
+  // de quitarlo sin nada que ofrecer. Ctrl+9 real es alternar la línea de
+  // comandos, y aquí SÍ hay línea de comandos que alternar: corregido.
+  // Ninguno pasa por matchCadShortcut porque su registro vive fuera de la
+  // sesión que las cableó; cuando el registro las admita, estas líneas se
+  // sustituyen por sus ids.
   if ((event.ctrlKey || event.metaKey) && event.key === "1")
     return { type: "reveal-properties" };
   if ((event.ctrlKey || event.metaKey) && event.key === "8")
     return { type: "toggle-styles" };
   if ((event.ctrlKey || event.metaKey) && event.key === "9")
-    return { type: "toggle-draft-settings" };
+    return { type: "toggle-command-line" };
```

**`editor-keyboard.spec.ts:133-137`** (mío, NO aplicado — misma razón):

```diff
 eq(
   interpretEditorKeyBeforeEngine(key({ key: "9", ctrlKey: true }), BEFORE),
-  { type: "toggle-draft-settings" },
-  "Ctrl+9 abre DSETTINGS",
+  { type: "toggle-command-line" },
+  "Ctrl+9 alterna la línea de comandos — como en AutoCAD; DSETTINGS sigue tecleable (DS/SE)",
 );
```

**`Layout3DEditor.tsx`** — tres cambios:

1. Nuevo estado, junto a donde ya viven los demás `showX` de paletas:
   ```diff
   + const [commandLineHidden, setCommandLineHidden] = useState(false);
   ```
2. El ejecutor (línea ~13495):
   ```diff
   -      case "toggle-draft-settings":
   -        paletteHost.toggleDraftSettings();
   -        return;
   +      case "toggle-command-line":
   +        setCommandLineHidden((hidden) => !hidden);
   +        return;
   ```
3. El montaje (línea ~16231), condicionado:
   ```diff
   -    <CadCommandLineDock
   +    {!commandLineHidden && <CadCommandLineDock
        ...
   -    />
   +    />}
   ```
   Con cuidado de que ocultar el muelle NO oculte el manejador de teclas de
   fase 0 (`editor-keyboard.ts`) que enfoca la caja al recibir un carácter:
   ese manejador no depende del montaje del Dock, así que teclear con la
   línea oculta debería reaparecerla — o, más simple y más seguro, que
   `Ctrl+9` con la línea oculta la muestre Y le dé foco. Decisión de UX
   menor que quien aplique esto puede ajustar; el diff de arriba es el
   mínimo que cierra el hallazgo (Ctrl+9 dejó de mentir sobre DSETTINGS y
   ahora hace algo real).

**Verificado (lo que sí pude probar sin tocar el monolito):** `DSETTINGS`
sigue siendo un comando tecleable real (`DS`/`SE`/`RM`/`DDRMODES` como
alias, `command-manifest.ts:264`) — perder el atajo de teclado no pierde
la función, sólo un camino a ella.

---

## P-09 · `PROPERTIES`/`PR` avisa «no montada» de una paleta que SÍ está montada (T-74/b)

**Contexto.** `PROPERTIES` (alias `PR`, `CH`, `MO`, `DDMODIFY`,
`settings-palettes.ts:539-548`) es un `paletteCommand` con `target:
"properties"`. `requestCadUi` (`use-command-engine.ts:480`) resuelve el
target contra los manejadores que se hayan registrado con
`registerCadUiHandler` (`palette-command-bus.ts`) — y hoy **nadie registra
`"properties"`**, así que `PR` siempre cae en el mensaje de
`unavailable` ("La paleta de propiedades no está montada..."), aunque
`CadEntityPropertiesPanel` sí está montado (`Layout3DEditor.tsx:626,16609`,
como panel derecho anclado).

**La buena noticia: ya existe la función que lo revela.**
`revealPropertiesPalette` (`Layout3DEditor.tsx:2122-2134`, escrita para
Ctrl+1 — ver `executeEditorKeyAction`, caso `"reveal-properties"`,
línea ~13490) hace exactamente lo que `PR` necesita: cierra los paneles
profesionales que comparten el panel derecho, sale de modo enfoque, y
abre el dock derecho si estaba cerrado. `"layer-manager"` ya resolvió
este MISMO problema con el MISMO patrón (`Layout3DEditor.tsx:12428-12440`,
comentario incluido: «el aviso era un límite falso, no uno real») — este
es el molde exacto a copiar, una pestaña de indentación más abajo.

```diff
+  /**
+   * Igual que "layer-manager" arriba: `PROPERTIES`/`PR` avisaba que la
+   * paleta "no está montada" cuando SÍ lo está (`CadEntityPropertiesPanel`,
+   * panel derecho) — nadie se había apuntado a "properties" en el bus de
+   * paletas. `revealPropertiesPalette` ya existe para Ctrl+1; esto la
+   * conecta también al comando tecleado/despachado desde la cinta.
+   */
+  useEffect(() => {
+    return registerCadUiHandler("properties", () => {
+      revealPropertiesPalette();
+      return true;
+    });
+  }, [revealPropertiesPalette]);
```

Colocado justo debajo del `useEffect` de `"layer-manager"`
(`Layout3DEditor.tsx:12428-12440`), donde `registerCadUiHandler` ya está
importado y el patrón ya está a la vista.

**Por qué no lo hago yo.** `revealPropertiesPalette` y el `useEffect` que
la conectaría viven dentro de `Layout3DEditor.tsx`. `registerCadUiHandler`
(`palette-command-bus.ts`) sí es mío, pero no hay nada que registrar
sin la función a la que apuntar.

**Qué NO resuelve esta petición, a propósito:** `OPTIONS`/`OP` y
`UCSMAN`/`UC` (los otros dos hallazgos de T-74/b) no tienen ningún
diálogo real en el repo hoy — no es un cableado que falte, es una
superficie que no existe. Arreglar su mensaje sin construir el diálogo
sería cosmético; construir el diálogo es una decisión de producto (¿qué
variables expone OPTIONS? ¿qué controla UCSMAN en un editor sin UCS
paramétrico?) fuera de esta ronda. `TOOLPALETTES`/`TP` tampoco se toca
aquí — ver el hallazgo (e) más abajo, que es la misma familia de problema
pero sin panel al que apuntar todavía.

**Qué prueba lo verifica.** No hay golden hoy que teclee `PR` y confirme
qué mensaje sale — sería el golden natural para esta petición: teclear
`PR`, confirmar que el panel de propiedades queda visible (no el aviso de
"no montada" en el diálogo) y que el `useEffect` de arriba no rompe el
Ctrl+1 existente (mismo `revealPropertiesPalette`, dos caminos).

---

## P-10 · El menú del botón derecho es el mismo tenga designado un muro, una cota o nada (T-74/f)

**Contexto.** El manejador de apertura
(`handleCadContextMenu`, `Layout3DEditor.tsx:13899-13923`) sólo mira la
preferencia `rightClickAction` (repetir/Enter/por defecto) para decidir
qué hacer al pulsar — nunca qué hay designado. El menú en sí
(`Layout3DEditor.tsx:15877-15944`) es una lista ESTÁTICA de cinco
entradas (Repetir último comando / Enter-terminar comando / Seleccionar
todo / Eliminar selección / Mostrar propiedades); lo único que reacciona
a la selección es el `disabled` de "Eliminar selección"
(`selList.length === 0 && nativeSelectionIds.length === 0` — cuenta,
no tipo). AutoCAD real cambia el CONTENIDO del menú según qué está bajo
el cursor: clic derecho en un muro ofrece sus propiedades y comandos de
muro; en una cota, sus estilos; en nada, el menú genérico de arriba.

**Qué falta, con dónde engancharlo.** El menú necesita leer el tipo de
la entidad ancla de la selección —`nativeSelectionIndexRef.current`
(la misma fuente que ya usa el panel de propiedades) da acceso a la
entidad por id— y anteponer entradas específicas por `entity.type` antes
de las cinco genéricas. Ejemplo mínimo defendible (no exhaustivo — el
catálogo completo de acciones por tipo es una decisión de producto: qué
comandos ofrecer para un muro vs. una cota vs. un bloque):

```diff
+ const entidadAncla = anchorId ? nativeSelectionIndexRef.current?.entity(anchorId) : null;
  {cadContextMenu && (
    <div ...>
+     {entidadAncla?.type === "wall" && (
+       <button onClick={() => { invoke("PROPERTIES"); closeContextMenu(); }}>
+         Propiedades del muro
+       </button>
+     )}
+     {entidadAncla?.type === "dimension" && (
+       <button onClick={() => { invoke("DIMSTYLE"); closeContextMenu(); }}>
+         Estilo de cota
+       </button>
+     )}
      {/* las cinco entradas genéricas de siempre, sin cambios */}
    </div>
  )}
```

`anchorId` es lo que ya usa el panel de propiedades para decidir qué
entidad mostrar (buscar `selSnap`/`anchorId` cerca de la línea 17402 en
esta misma revisión) — reutilizar esa misma variable evita que el menú y
el panel puedan decir cosas distintas sobre "qué está designado".

**Por qué no lo hago yo.** Tanto el manejador de apertura como el
marcado del menú viven enteros dentro de `Layout3DEditor.tsx`; no existe
un `CadContextMenu.tsx` que extraer sin tocar el monolito primero.

**Qué prueba lo verificaría.** Un golden que designe un muro, abra el
menú con botón derecho, y confirme una entrada específica de muro que
hoy no existe; repetir con una cota y con nada designado, confirmando en
ese último caso el menú genérico de siempre (regresión: que "nada
designado" no rompa ni oferte acciones sin sentido).

---

## P-11 · Sólo tres pestañas de lámina, arriba, dicen «Model», sin Ctrl+RePág (T-74/g)

**Contexto.** La tira de pestañas (`Layout3DEditor.tsx:14764-14797`) vive
en la barra de acceso rápido, ARRIBA del lienzo (AutoCAD las pone abajo,
pero moverlas es un cambio de layout más grande, fuera de esta
petición — el hallazgo real y barato de arreglar es el resto). Línea
14773: el literal `"Model"` en inglés, suelto en una interfaz que por lo
demás está en español. Línea 14775:
`{orderedPaperSpaces.slice(0, 3).map(...)}` — un límite de TRES
pestañas visibles; el resto sólo se alcanza abriendo el gestor de
láminas con el botón "Layout" (14787-14796). Y no existe Ctrl+RePág
(`PageDown`)/Ctrl+AvPág (`PageUp`) en ningún punto del árbol —
confirmado: cero resultados para `PageUp`/`PageDown` en
`editor-keyboard.ts`.

**Diffs, en dos mitades independientes:**

1. **La etiqueta y el límite** (`Layout3DEditor.tsx`, mecánico):
   ```diff
   - <span>Model</span>
   + <span>Espacio modelo</span>
   ```
   ```diff
   - {orderedPaperSpaces.slice(0, 3).map((space) => (
   + {orderedPaperSpaces.slice(0, MAX_TABS_VISIBLES).map((space) => (
   ```
   con `MAX_TABS_VISIBLES` elegido por quien mida cuánto ancho le sobra a
   la barra de acceso rápido con el resto de sus controles — no es un
   número que deba adivinar sin verlo en pantalla.

2. **Ctrl+RePág/Ctrl+AvPág** — la interpretación SÍ es mía
   (`editor-keyboard.ts`, no aplicada aquí por la misma razón que P-08:
   sería un atajo muerto sin la otra mitad):
   ```diff
     | { type: "toggle-command-line" }
   + | { type: "cycle-sheet"; direction: 1 | -1 }
   ```
   ```diff
   + if ((event.ctrlKey || event.metaKey) && event.key === "PageDown")
   +   return { type: "cycle-sheet", direction: 1 };
   + if ((event.ctrlKey || event.metaKey) && event.key === "PageUp")
   +   return { type: "cycle-sheet", direction: -1 };
   ```
   y en `executeEditorKeyAction` (`Layout3DEditor.tsx:13484`):
   ```diff
   +      case "cycle-sheet":
   +        selectPaperSpace(/* siguiente/anterior sobre orderedPaperSpaces, envolviendo */);
   +        return;
   ```
   (el nombre exacto de la función que cambia de lámina activa hay que
   confirmarlo en el punto de aplicación — busca cerca de la línea 14775
   dónde el clic en una pestaña cambia de lámina, y reutiliza esa misma
   ruta).

**Por qué no lo hago yo.** Todo lo del punto 1 y el `case` del punto 2
viven dentro de `Layout3DEditor.tsx`.

**Qué prueba lo verificaría.** Un golden con más de tres láminas
(fixture nuevo) que confirme que aparecen todas hasta `MAX_TABS_VISIBLES`
sin abrir el gestor, que la etiqueta dice "Espacio modelo", y que
Ctrl+AvPág/Ctrl+RePág ciclan entre ellas en el orden de la tira.

---

## P-12 · No hay ni una sola pestaña contextual de la cinta (T-74/a)

**Contexto.** AutoCAD muestra una pestaña extra —"Muro", "Cota"— cuando
hay algo de ese tipo designado, con los comandos que de verdad se usan
sobre ESE tipo de entidad. Aquí `CAD_RIBBON_TABS` (`ribbon.ts:63-71`) es
una lista fija de siete pestañas (inicio/insertar/anotar/paramétrico/
vista/salida/administrar) y `&lt;CadRibbon&gt;` (mío, `CadRibbon.tsx`) no
recibe ni conoce nada sobre qué está designado — sólo `dispatch` y
`readOnly` (`Layout3DEditor.tsx:15459-15462`).

**Por qué esto es más grande que P-05..P-11: no hay dato que filtrar
todavía.** La selección vive enteramente dentro del monolito, en estado
local sin publicar — `nativeSelectionIndexRef`
(`Layout3DEditor.tsx:1975`, el mismo índice que ya usa el panel de
propiedades y que P-10 propone reutilizar para el menú contextual) y
`selSummary`/selección legacy (`1536`). No existe ningún equivalente a
`palette-host.ts` (el store externo que SÍ expone el estado de las
paletas) para "qué tipo de entidad está designada ahora mismo". Sin ese
dato saliendo del monolito, no hay nada que el lado de la cinta (mío)
pueda filtrar — por eso esta petición empieza pidiendo el DATO, no el
filtro.

**Diseño mínimo defendible, en dos mitades:**

1. **Monolito: publicar el tipo de selección.** Un patrón como
   `registerCadUiHandler`/`palette-host.ts` pero de sólo lectura —o, más
   simple, una prop nueva en `&lt;CadRibbon&gt;`:
   ```diff
     <CadRibbon
       dispatch={(name) => commandEngineRef.current.invoke(name)}
       readOnly={drawingReadOnly}
   +   selectionKind={anchorEntityType}
     />
   ```
   donde `anchorEntityType` es `nativeSelectionIndexRef.current?.entity(anchorId)?.type ?? null`
   recalculado donde ya se recalcula `selSnap` para el panel de
   propiedades (cerca de la línea 17402) — un `useMemo` más sobre un valor
   que el monolito YA deriva para otra cosa, no una fuente de verdad
   nueva.

2. **Fuera del monolito: la pestaña contextual en sí** (esto sí lo puedo
   escribir yo, una vez llegue el dato): un mapa
   `CAD_CONTEXTUAL_TABS: Partial<Record&lt;CadNativeEntityType, CadRibbonTabMeta &amp; { panels: ... }&gt;&gt;`
   en `ribbon.ts`, y en `CadRibbon.tsx` insertar esa pestaña (activada
   automáticamente al aparecer, como en AutoCAD) cuando `selectionKind`
   coincide con una clave del mapa, quitarla cuando deja de coincidir.
   Qué comandos va cada pestaña contextual (¿"Muro" con
   WALLLENGTH/WALLTHICKNESS/lo que exista? ¿"Cota" con los estilos de
   `DIMSTYLE`?) es una decisión de producto tipo por tipo, no algo que
   deba inventar sin que alguien del frente de producto lo revise.

**Por qué no lo hago yo (ni la mitad 2 sola).** La mitad 1 necesita tocar
`Layout3DEditor.tsx` para exponer el dato. Sin él, escribir la mitad 2 a
ciegas sería una pestaña contextual que nunca aparece — trabajo
demostrable pero inútil hasta que la otra mitad llegue. Se documentan las
dos juntas para que quien tenga acceso al monolito pueda aplicar la
mitad 1 y pedirme la mitad 2 en un seguimiento, en vez de que esta ficha
se quede a medias en cualquiera de los dos lados.

**Alcance de esta petición:** es un diseño, no un diff mecánico como P-05
o P-09 — el catálogo de qué comandos van en cada pestaña contextual es
trabajo de producto que excede una ficha de mecánica. Se deja documentado
para la siguiente ronda de este frente, con el punto de enganche exacto
(`nativeSelectionIndexRef`, línea 1975) para no tener que volver a
investigarlo desde cero.

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
