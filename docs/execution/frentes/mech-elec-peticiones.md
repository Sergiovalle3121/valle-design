# Peticiones de F7 · Toolsets Mechanical y Electrical

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-mech-elec-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-mech-elec-01 · La tierra física, también en la columna del cuadro de cargas

- **Archivo:** `apps/web/src/lib/cad/data-extraction/circuit-schedule-table.ts`
  (territorio de data-extraction, no mío) y su spec
  `apps/web/src/lib/cad/engine/commands/data-extraction-commands.spec.ts`.
- **Por qué:** el entregable 2/5 de este frente añadió `CadCircuitCheck.groundGauge`
  —el calibre mínimo de puesta a tierra de equipos que la Tabla 250-122 de la
  NOM-001-SEDE pide para la protección declarada—. `AECHECK` ya lo dice en su renglón,
  pero el ENTREGABLE de un proyecto eléctrico mexicano es el cuadro de cargas, y ahí
  la tierra sigue sin aparecer. El dato ya está calculado: sólo falta la columna.
- **Cambio exacto:**
  1. En `CIRCUIT_HEADERS`, insertar `"Tierra (AWG)"` **entre** `"Calibre AWG"` y
     `"Protección (A)"` — junto al calibre de fase, que es donde se lee de corrido —,
     quedando once encabezados en vez de diez.
  2. En `buildCadCircuitScheduleTable`, insertar en cada fila, en esa misma posición,
     `dash(check.groundGauge)`. `groundGauge` ya trae su unidad («12 AWG», «250 kcmil»),
     así que el encabezado debe leer `"Tierra"` a secas si se prefiere no repetirla;
     mi recomendación es `"Tierra (mín.)"`, que dice que es un mínimo y no una medida.
  3. En el título del cuadro, sustituir el fragmento
     `(sin temperatura, agrupamiento, 125 % de carga continua, tierra ni llenado de tubo)`
     por `(sin temperatura, agrupamiento, 125 % de carga continua ni llenado de tubo; la
     tierra es el mínimo de la Tabla 250-122 calculado de la protección, no la medida de
     un conductor del dibujo)`. Sin ese cambio el título negaría una columna que la tabla
     ya trae, que es exactamente el claim sin evidencia al revés.
  4. `scheduleTable(...)` se llama hoy con ancho `1_400`; con once columnas conviene
     `1_550` para que la columna nueva no estreche a las demás.
- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/commands/data-extraction-commands.spec.ts`
  afirmando (a) que la fila de un circuito de 20 A trae `12 AWG` en la celda de tierra,
  (b) que la de 200 A trae `6 AWG`, y (c) que el título ya no dice «ni llenado de tubo»
  precedido de «tierra». El golden 93 no toca esta tabla, así que no se ve afectado.
- **Estado:** pendiente

### P-mech-elec-02 · El resumen de paleta de STDPART se quedó corto: ahora son cinco familias

- **Archivo:** `apps/web/src/lib/cad/engine/command-summaries.ts`, línea del
  catálogo `CAD_COMMAND_SUMMARIES.STDPART` (territorio del motor de comandos,
  no mío: `command-summaries.spec.ts` es fail-closed y lo aplica el coordinador).
- **Por qué:** el entregable 3/5 de este frente añadió a STDPART las familias
  **Rodamiento** (rígido de bolas de las series 6200 y 6300 de ISO 15, dibujado
  con la representación simplificada de ISO 8826-1) y **Chaveta** (paralela
  forma A de ISO 773 / DIN 6885, con `t1` y `t2` en la denominación). No se
  registró ningún nombre de orden nuevo —entran como opciones del primer prompt
  de STDPART—, así que el gate no falla; pero la línea que el dibujante lee en
  la paleta sigue diciendo que STDPART hace tres cosas cuando hace cinco. Un
  resumen que se queda corto esconde capacidad ya construida, que es la versión
  suave del claim sin evidencia.
- **Cambio exacto:** sustituir

  ```ts
  STDPART: "Normalizado como bloque: tornillo ISO 4017, tuerca ISO 4032, rondana ISO 7089.",
  ```

  por

  ```ts
  STDPART: "Normalizado como bloque: tornillo, tuerca y rondana ISO, rodamiento ISO 15 y chaveta paralela ISO 773.",
  ```

  Son 102 caracteres, por debajo del tope de 110 que afirma
  `command-summaries.spec.ts`; las normas de la tornillería se abrevian a «ISO»
  porque en 110 caracteres no caben las cinco con su número, y las dos nuevas se
  nombran con la suya, que es el dato que todavía no está en ninguna parte de la
  interfaz. Ninguna otra clave cambia, y `command-icons.ts`, `ribbon.ts` y
  `alias-table.ts` no se tocan: STDPART ya existía en las tres.
- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/command-summaries.spec.ts`
  (sigue en 290 resúmenes para 290 comandos, con el largo dentro del tope) y
  `node scripts/cad/check-ribbon-coverage.mjs`, que no ve un nombre nuevo.
- **Estado:** pendiente
