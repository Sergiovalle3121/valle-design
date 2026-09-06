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
