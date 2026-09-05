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

## Ventana de integración 2 · 2026-09-04 · aplicadas por el coordinador

Las dos peticiones de este frente se aplicaron. Nada quedó pendiente y nada se rechazó
entero; lo único que no se aplicó al pie de la letra es un literal DENTRO de P-01, y está
dicho en su Estado con el motivo.

Estas peticiones se escribieron ANTES del refactor del registro perezoso. No las tocó:
ninguna de las dos registra un nombre de orden nuevo —es la restricción que el propio
frente se puso—, así que ni `lazy-commands.ts` ni el manifiesto generado
(`engine/command-manifest.ts`) entran aquí. Lo que sí cambió por debajo son las CIFRAS que
las peticiones citan de memoria: el árbol tiene hoy **294** comandos, no 290, y los tres
gates de comandos cuadran entre sí en ese número.

Verificación de la ventana, medida y no supuesta:

```
npm run typecheck                                -> 8/8
node scripts/cad/build-command-manifest.mjs      -> 294 comandos en 108 módulos
npm run check:command-integrity                  -> 294 · 0 éxitos falsos
node scripts/cad/ui-command-reach.mjs            -> 294 de 294 alcanzables
node scripts/cad/check-ribbon-coverage.mjs       -> 294 en la cinta, 294 en el registro
npm test (apps/web)                              -> 604/604 specs verdes
npx tsx .../data-extraction-commands.spec.ts     -> 37 comprobaciones (eran 27)
npx tsx .../command-summaries.spec.ts            -> 294 resúmenes para 294 comandos
```

Lo que queda para la pasada de evaluación del coordinador, y que NO se toca aquí porque
`docs/parity/ESCALERA.md` está prohibido en esta ventana:

- La tabla de la fila Electrical de ESCALERA **no tiene ni una fila de puesta a tierra**:
  `grep -n "tierra\|250-122" docs/parity/ESCALERA.md` da cero. El entregable 2/5 de este
  frente (Art. 240-6(A) y Tabla 250-122) y la columna que añade P-01 no están representados
  en el peldaño de nadie. Es un hueco de la escalera, no un claim falso.
- La línea 391, «Revisión contra la NOM-001-SEDE con la longitud REAL del plano», cita
  `` `circuit-check.spec.ts` (42) ``; esa spec va hoy por **88** (el frente la subió al
  entregar la capacidad estándar del Art. 240-6(A) y la tierra). La cifra está corta, no
  inflada, así que no afirma de más — pero está vieja.

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
- **Estado:** **aplicada** (ventana 2, 2026-09-04) — commit `b740c31`.
  Los cuatro puntos, en `apps/web/src/lib/cad/data-extraction/circuit-schedule-table.ts`:
  la columna entra entre `"Calibre AWG"` y `"Protección (A)"` (once encabezados),
  `dash(check.groundGauge)` entra en esa misma posición de cada fila, el título se sustituyó
  palabra por palabra por el que diseñó la petición, y `scheduleTable` pasa de `1_400` a
  `1_550`.
  **Lo que NO se aplicó al pie de la letra:** el punto 1 dicta el literal `"Tierra (AWG)"` y
  el punto 2, tres renglones después, dice que `groundGauge` ya trae su unidad y recomienda
  `"Tierra (mín.)"`. Los dos no pueden ser ciertos a la vez. Se escribió **`"Tierra (mín.)"`**,
  que es la recomendación del propio frente, porque `"(AWG)"` sería FALSO en cuanto la
  protección pase de 1.600 A: la Tabla 250-122 cambia de unidad ahí y `cadNomGroundLabel`
  devuelve «250 kcmil». Poner la unidad en el encabezado habría metido en la tabla justo el
  claim sin evidencia que la campaña existe para cerrar. El motivo quedó escrito en el
  código, encima de la constante.
  **Comprobación**, en `data-extraction-commands.spec.ts`, que pasa de **27 a 37**
  comprobaciones: se afirma **por posición de celda** y no por subcadena —«12 AWG» suelto en
  el JSON no dice en qué columna cayó—. El documento de prueba gana un segundo circuito, un
  alimentador `C-2` de 200 A en 3/0, que es lo que la petición pedía medir. Quedan afirmados:
  la cabecera 2/3/4 (`Calibre AWG` · `Tierra (mín.)` · `Protección (A)`), las once columnas,
  C-1 (20 A) → `12 AWG`, C-2 (200 A) → `6 AWG`, que la fase y la protección de C-2 siguen en
  su sitio corridas una columna, que el título ya **no** dice «tierra ni llenado de tubo», y
  que sí dice de qué está hecha la columna nueva.
  Comprobado además que nadie más depende de la forma de esta tabla:
  `CIRCUIT_HEADERS`/`buildCadCircuitScheduleTable` sólo los usa `data-extraction-commands.ts`,
  y el golden 93 no la toca, como la petición decía.

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
- **Estado:** **aplicada** (ventana 2, 2026-09-04) — commit `b740c31`. La línea de
  `CAD_COMMAND_SUMMARIES.STDPART` se sustituyó por la de la petición, **tal cual**, sin tocar
  ninguna otra clave. Medido: **102** caracteres, por debajo del tope de 110.
  Corrección de una cifra de la petición, que se escribió antes del registro perezoso:
  `command-summaries.spec.ts` imprime hoy «294 resúmenes para 294 comandos, 0 exclusiones»,
  no 290 para 290. La spec sigue verde y el tope se cumple.
  `check-ribbon-coverage.mjs` no ve un nombre nuevo, como la petición anticipaba: 294 en la
  cinta y 294 en el registro. `command-icons.ts`, `ribbon.ts` y `alias-table.ts` no se
  tocaron — STDPART ya existía en las tres.
