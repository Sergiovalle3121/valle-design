# F5 · Toolsets — buzón de peticiones

Formato: qué archivo, qué cambio EXACTO, por qué, qué prueba lo verifica.
El coordinador (F0) las aplica; no las aplico yo porque `rubric.json`,
`ESCALERA.md`, `BACKLOG.md`, `monolith-budget.json` y `manifiesto.json` son
territorio exclusivo de F0 (§5.2 del prompt maestro).

---

## P-01 · `toolset-electrical.esquemas` cobra 2 pt con evidencia que no es de esquemas (T-15)

**Archivo:** `docs/competitive/rubric.json`, entrada `toolset-electrical.esquemas`
(hoy en torno a la línea 3759).

**Qué dice hoy:**
```json
{
  "id": "toolset-electrical.esquemas",
  "points": 2,
  "text": "Esquemas eléctricos: símbolos normalizados, numeración de conductores y etiquetado de componentes, todo derivado del dibujo",
  ...
}
```

**Por qué está mal cobrado.** El texto empieza con «Esquemas eléctricos:
símbolos normalizados» y la evidencia que lo respalda
(`mep-symbols.ts`, `wire-numbering.spec.ts`, `electrical-wire.spec.ts`,
`device-tags.spec.ts`, `electrical-tag.spec.ts`, el golden 93) prueba
numeración de conductores y etiquetado de componentes — las dos MITADES
finales del texto — pero CERO símbolos de esquema de control. Los ocho
símbolos de `mep-symbols.ts` son de INSTALACIÓN en planta (válvula,
difusor, rejilla, luminaria, contacto, apagador, tablero, extractor), no
de esquema unifilar/de control. Verificado el 2026-09-06:
`grep -rniE 'bobina|contactor|relevador|guardamotor|seccionador|60617'
apps/web/src apps/api/src packages` no devuelve NINGÚN acierto en código de
producto (sólo falsos positivos de «rebobina/rebobinar» en LISP, y menciones
de la propia auditoría en `docs/`). No existe un solo símbolo de esquema de
control en todo el árbol.

**Qué pido, dos opciones — decide el titular, no yo:**

**Opción A (la que pido por defecto, más barata hoy):** renombrar el
criterio a lo que de verdad verifica y mover «símbolos normalizados» fuera
del texto cobrado:

```json
{
  "id": "toolset-electrical.esquemas",
  "points": 2,
  "text": "Numeración de conductores y etiquetado de componentes, derivados del dibujo y visibles en el plano (ATTRIB/lámina)",
  ...
}
```

Y añadir al campo `gap` de esa misma fila (o crear uno si no existe) la
frase: *«No existe ningún símbolo de esquema de control — bobina, contacto
NA/NC, contactor, guardamotor, seccionador (IEC 60617). El criterio
`esquemas` sólo verifica numeración y etiquetado; los símbolos normalizados
de INSTALACIÓN en planta (`mep-symbols.ts`) no son símbolos de esquema y no
deberían contar como si lo fueran.»*

**Opción B (más cara, no la construí en esta sesión):** dejar el texto y el
`id` como están, y que una ola futura construya los símbolos IEC 60617 de
esquema de control como bloques nuevos con `attributes` (bobina, contacto
NA/NC, contactor, guardamotor, seccionador), con su golden. Entonces sí
cobraría lo que promete.

**Qué prueba lo verifica:** si se elige A, ningún cambio de código —sólo
que `node scripts/cad/rubric.mjs --markdown --check` siga en verde tras
regenerar la matriz desde el JSON editado, y que
`docs/competitive/autocad-2027-gap-matrix.md` se regenere del guion (nunca
a mano). Si se elige B, el golden nuevo que la ficha describiría.

**Relacionado:** `docs/parity/ESCALERA.md`, sección «La instalación
eléctrica (Ola 5)» — declara honestamente cuatro peldaños en 0 pero no
menciona este quinto (símbolos de esquema). Si se aplica la opción A, esa
sección debería ganar una fila «Símbolos de esquema de control (bobina,
contactor…)» en peldaño 0, con su motivo, para que dejen de estar
«declarados en cuatro sitios y saltados en el quinto» (cita del escéptico,
`00c-CUADRO-DE-MANDO.md`).

---

## P-02 · `ESCALERA.md:366-367` cobra el peldaño 5 de FLATSHOT sobre el muro EQUIVOCADO (T-33)

**Archivo:** `docs/parity/ESCALERA.md`, sección «De 3D a documentación (Ola
4, 2026-09-03)», primeras dos filas de la tabla (hoy en torno a las líneas
366-367).

**Qué dice hoy** (cito literal):

> `FLATSHOT`/`SOLPROF` sobre el modelo del ARQUITECTO (muros, columnas,
> mobiliario), no sólo sobre `solid3d` | 5 | golden 92 sobre el documento que
> recibe el servidor: `UCS X 90` + `FLATSHOT` sobre dos muros en L deja el
> alzado con la altura del muro y cuenta lo excluido con su motivo;
> `flatshot-solids.spec.ts` (30) | Nada de peldaño para lo que hace. La
> altura sale del catálogo de arquetipos del visor: un `kind` que no está en
> él se queda fuera Y se cuenta, en vez de salir con la altura de otra cosa.

**Por qué está mal cobrado.** El golden 92 dibuja el muro con `{type: 'box',
kind: 'wall'}` — la entidad HEREDADA de compatibilidad — y **no** la entidad
`{type: 'wall'}` que el comando `WALL` (la orden BIM del producto, la que un
arquitecto usa hoy) realmente emite (`engine/commands/draw-wall.ts:74-79`,
`wallEntity()`). Verificado el 3 de septiembre por el escéptico y otra vez
hoy: `grep -n '92-cad-alzado' docs/competitive/rubric.json` no devuelve
NADA — ese golden no es evidencia de ninguna fila de la rúbrica. Cobrar el
peldaño 5 de «el modelo del ARQUITECTO» con un golden que nunca dibuja con
`WALL` es la misma clase de error que `toolset-electrical.esquemas` (P-01):
la evidencia mide una capacidad distinta de la que el texto promete.

**Qué pido.** Cambiar la columna «Evidencia» para citar el golden y el spec
NUEVOS que sí ejercitan `WALL`/`type:"wall"`:

```
Evidencia (nueva): golden 140 (`e2e/golden/140-cad-alzado-muro-nativo.spec.ts`)
sobre el documento que recibe el servidor: `UCS X 90` + `FLATSHOT` sobre TRES
muros nativos en L con una puerta alojada deja el alzado con la altura DEL
MURO (2.700 mm, la de la entidad, no la de un catálogo de arquetipos) y el
dintel de la puerta a 2.100; `flatshot-solids.spec.ts` (51, secciones 9-12).
El golden 92 (muro heredado) sigue siendo evidencia legítima de que el `box`
de compatibilidad TAMBIÉN funciona, pero no es la evidencia que este peldaño
necesita.
```

Y en la columna «Qué falta para el siguiente»: añadir que **SECTION** ya
lee el mismo cuerpo del muro nativo (compartido con FLATSHOT vía
`cadWallWorldBody`, `flatshot-solids.ts`), pero **SLICE sigue sin muros a
propósito** — convertiría la entidad en `solid3d` horneado, violando «wall
and opening stay parametric» de `AGENTS.md`.

**Qué prueba lo verifica:** el golden 140 y las secciones 9-12 de
`flatshot-solids.spec.ts`, ambos ya escritos en esta sesión (rama
`claude/f5-toolsets`).

**Relacionado — `rubric.json`, grupo `toolset-architecture`:** verificado
hoy que `grep -n "92-cad-alzado" docs/competitive/rubric.json` no devuelve
nada — la fila NO cita el golden 92 (se sostiene sobre los goldens
53/77/78/79, según el escéptico). Es decir, `rubric.json` no necesita
corrección por esto: el error está sólo en `ESCALERA.md`, que SÍ citaba el
golden 92 como si fuera evidencia de rúbrica. Dejo la nota aquí para que
quien aplique esta petición no la busque también en el JSON y pierda
tiempo. Si en el futuro se decide sumar el golden 140 como evidencia
adicional de `toolset-architecture` (subiría su solidez, no su puntaje —
ya está en 3/4), es una decisión de F0, no una corrección de un error.

---

## P-03 · Un cable de una línea para que `VSCURRENT` alcance muros y masas (T-10a)

**Para:** F1 (único frente autorizado a tocar `Layout3DEditor.tsx`).

**Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`,
dentro de `useCadStudioCommandEngine({...})`, en la llamada a
`cadStudioEngineBridges({...})` (hoy en torno a la línea 4893-4909).

**Qué dice hoy** (cito literal, línea 4902):
```tsx
      osnapOverrideRef: engineOsnapOverrideRef,
      solidShadeHost: solidShadeHostRef,
      setLinetypeScale: setDocumentLinetypeScale,
```

**Qué cambio pido, EXACTO:**
```tsx
      osnapOverrideRef: engineOsnapOverrideRef,
      solidShadeHost: solidShadeHostRef,
      nativeMassHosts: nativeMassHostsRef,
      setLinetypeScale: setDocumentLinetypeScale,
```

Una línea. `nativeMassHostsRef` ya existe en el monolito (línea 1929,
`useRef<CadNativeMassHosts | null>(null)`) y ya se usa en otros dos sitios
(línea 6099 al montarlo, línea 16347 pasado a `Cad3DSolidDiagnostics`), así
que no hace falta declarar nada nuevo — sólo pasar la ref que ya vive ahí.

**Por qué esta línea sola basta.** `cadStudioEngineBridges(...)` se ESPARCE
directamente en las opciones del motor (`...cadStudioEngineBridges({...})`,
línea 4893), y esta sesión ya amplió esa función (`studio-engine-bridges.ts`)
para que:
1. `visualStyle` llame a los DOS anfitriones (`solidShadeHost` y
   `nativeMassHosts`) con el mismo estilo — hoy sólo llega al primero,
   así que `VSCURRENT` confirma un cambio que sobre `wall`/piso/cielorraso/
   cubierta no ocurre (T-10a, el hueco mejor probado de la auditoría).
2. Un `currentVisualStyle` nuevo, que lee el estilo VIGENTE de cualquiera
   de los dos anfitriones montados — es lo que arregla que `VSCURRENT` +
   Intro devuelva un mensaje vacío en vez del estilo vigente.

Los dos ya fluyen a `useCadStudioCommandEngine` (`use-command-engine.ts`,
que ya amplié con el campo `currentVisualStyle?`) y de ahí a
`cadStudioCommandContext` (`studio-context.ts`, también ampliado); todo el
cableado nuevo es ADITIVO y opcional en cada parada, así que nada se rompe
mientras esta línea no se aplique — el comportamiento de hoy sigue
funcionando exactamente igual, sólo que `wall`/`room` no reciben el
estilo hasta que se aplique.

**Qué prueba lo verifica:** `apps/web/e2e/golden/47-cad-solids.spec.ts`
(ampliado en esta sesión con un muro nativo sembrado en el documento) SE
LLEGÓ A ESCRIBIR con una aserción de escena
(`cad-3d-solid-diagnostics[data-visual-style]`) y se corrió de verdad en
navegador: dio rojo exacto (`Expected: "wireframe", Received: "shaded"`),
confirmando que el hueco es precisamente este cable y ningún otro. Esa
aserción se retiró del golden (queda como comentario en la sección
VSCURRENT, con el texto exacto a reponer) para no dejar la suite en rojo
por una línea que sólo F1 puede tender. **Cuando se aplique esta
petición:** reponer en `47-cad-solids.spec.ts`, sección VSCURRENT, las dos
líneas `await expect(page.getByTestId("cad-3d-solid-diagnostics")).toHaveAttribute("data-visual-style", "wireframe" / "shaded")`
que el comentario deja escritas, y re-correr los goldens 140 y 47 —
deberían pasar los dos.

**Relacionado, sin construir en esta sesión (declarado en `F5.md`):** la
persistencia del estilo visual entre recargas de página sigue en memoria
del anfitrión (`private style`) y se pierde al refrescar. No es parte de
esta petición: es una decisión de arquitectura (dónde vive el estado de
un editor de 20.000 líneas) que no me corresponde tomar a solas.

---
