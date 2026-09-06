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
