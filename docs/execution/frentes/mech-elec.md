# F7 · Toolsets Mechanical y Electrical

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/mechanical*`
- `apps/web/src/lib/cad/electrical*`
- `apps/web/src/lib/cad/engine/commands/std*|balloon*|bom*|weld*|dimtol*|ae*`
- `specs y goldens`

## Cola

1. Mechanical: piezas normalizadas más allá de tornillería y perfiles (rodamientos, chavetas, arandelas); BOM asociativa que se actualiza (hoy se genera); globos con estilos; agujeros y chaflanes normalizados; símbolos de acabado completos; cálculo básico de ejes y resortes.

2. Electrical: catálogo de componentes con referencias padre/hijo entre esquemas; terminales y borneras; PLC por módulos; reportes (de cables, de componentes, de/a); NOM-001 ampliada más allá de conductores, a protecciones y canalizaciones.

## Cierre

Filas Mechanical y Electrical a 4/4 salvo evidencia independiente.

## Lo que hay que tener presente

Nada de vocabulario industrial de gestión. Las normas que se citen deben ser verificables y citadas con su referencia.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/mech-elec-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-mech-elec` sobre la rama `campana/superar/mech-elec`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-mech-elec
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Reconocimiento del territorio, antes de tocar una línea

Medido, no supuesto. Lo que YA está construido en mi territorio:

- **Mechanical.** `lib/cad/mechanical-parts.ts` (tornillería ISO 4017/4032/7089 en M6–M24 y las
  cinco secciones de acero IMCA PTR/OC/LI/CPS/IPR como bloques `MECH-…`),
  `mechanical-symbols.ts` (globo, soldadura ISO 2553/AWS A2.4 con nueve tipos, acabado ISO 1302
  con tipo, Ra y dirección de estrías), `mechanical-bom.ts` (la lista como TABLE) y seis órdenes
  registradas: STDPART, STEELSHAPE, BALLOON, BOM, WELDSYMBOL, SURFACESYMBOL (más DIMTOLERANCE,
  que vive en `dimension-tolerance.ts`, fuera de mis archivos pero dentro de la fila).
- **Electrical.** `lib/cad/electrical/` con `wire-numbering.ts` (el número sale del dibujo,
  choques y marcas ilegibles), `device-tags.ts` (etiqueta en los ATRIBUTOS del bloque, ocho
  familias), `nom-conductors.ts` (ampacidad 310-15(b)(16) a 75 °C, resistencia Cap. 9 Tabla 8,
  tope del conductor pequeño 240-4(D)) y `circuit-check.ts` (caída con la longitud REAL de la
  polilínea). Seis órdenes: AEWIRE, AEWIRELIST, AETAG, AETAGLIST, AECIRCUIT, AECHECK.
- **Rúbrica al reconocer:** ambas filas ya están en **3/4**, y el punto que retienen es por
  «toda su evidencia es propia» — o sea, mi cierre («4/4 salvo evidencia independiente») YA
  está cumplido por el corte. Lo que queda no es puntuación: es PROFUNDIDAD de la cola.
- Las siete specs del territorio corren verdes hoy (84 + 42 + 31 + 25 + 28 + 25 + 26 = 261
  comprobaciones, 1,8 s cada una con `npx tsx`).

**La restricción que ordena toda la cola, y que sólo se ve reconociendo:** un **nombre de
comando nuevo** no cabe en este frente sin petición previa. `engine/command-summaries.spec.ts`
y `components/cad/ribbon/command-icons.spec.ts` son fail-closed —todo comando registrado tiene
resumen e icono—, y ambos archivos están fuera de mi territorio. Añadir un nombre nuevo dejaría
mi rama ROJA hasta la ventana de integración, y un frente que baja la suite se revierte (R5).
Por eso **toda la cola entrega capacidad por opciones nuevas de órdenes que ya existen y por
módulos nuevos dentro de `mechanical*`/`electrical/`**, sin tocar `engine/index.ts`,
`ribbon.ts`, `alias-table.ts` ni `command-integrity-exemptions.json`. Lo que exige nombre nuevo
va al «todavía no» de abajo, con su petición escrita cuando toque.

Comprobado también, para no romper lo ajeno: los goldens `84-cad-plano-de-fabricacion.spec.ts`
y `93-cad-circuito-nom.spec.ts` afirman con `toContainText`/regex sobre subcadenas, así que
añadir opciones a un mensaje o renglones DETRÁS del resumen no los rompe; añadir un PASO nuevo
a AEWIRE o a AECIRCUIT sí los rompería (se comerían un punto tecleado), y por eso no se toca su
secuencia.

### 2026-09-04 · La cola, ordenada por valor comercial por hora

1. **`BOM Actualizar`: la lista de materiales deja de mentir.** Hoy BOM se GENERA; si se
   inserta otro tornillo, la tabla del plano queda vieja y nadie avisa. Con `Actualizar`, BOM
   marca su tabla (`context.metadata.mechanical = "bom"`), la vuelve a encontrar y la
   SUSTITUYE por id (`{ type: "replace" }`, que conserva id y orden de dibujo). Sería el primer
   cuadro que se actualiza solo en todo el producto: hoy no hay ni uno.
2. **La NOM más allá del conductor: protección estándar y tierra física.** `AECHECK` gana dos
   reglas citadas: la capacidad nominal del interruptor debe ser una de las estándar del
   Art. 240-6(A), y el calibre del conductor de puesta a tierra de equipos que la Tabla 250-122
   pide para esa protección. Ataca justo el límite que hoy declaramos («no revisa el conductor
   de puesta a tierra»), y ese límite se reescribe con lo que pase a mirar.
3. **Rodamientos y chavetas: los dos normalizados que faltan.** STDPART gana `Rodamiento`
   (series 6200/6300, ISO 15, dibujado con la representación simplificada de ISO 8826-1) y
   `Chaveta` (paralela forma A, ISO 773 / DIN 6885, b × h por diámetro de eje). Se cuentan
   solas en la lista de materiales porque son bloques `MECH-…` como los demás.
4. **Reporte DE/A: de qué componente a qué componente va cada conductor.** Conectividad por
   proximidad declarada entre el extremo de la polilínea y el punto de inserción del símbolo,
   y AEWIRELIST lo dice —incluidos los conductores con un extremo SUELTO, que es el error que
   hoy no ve nadie—.
5. **Terminales y borneras.** Familia de bornera en las etiquetas y regleta leída del dibujo
   con sus bornes repetidos, en AETAGLIST.

## «Todavía no»

Con fecha, con motivo, y sin insinuar que estén hechos.

- **2026-09-04 · Agujeros y chaflanes normalizados.** Exige un nombre de comando nuevo
  (`HOLE`/`CHAMFERSTD`) y por tanto resumen, icono, alias, patrón de cinta y regeneración de
  `ui-command-reach.json`: cinco archivos fuera de mi territorio. Se escribirá como petición
  cuando la cola de arriba esté cerrada; meterlo antes dejaría la rama roja toda la ventana.
- **2026-09-04 · E/S de PLC por módulos.** Mismo motivo (nombre nuevo) y, además, no cabe en
  «unas pocas horas»: el módulo con sus direcciones y sus bornes es un catálogo, no una orden.
- **2026-09-04 · Referencias cruzadas padre/hijo ENTRE ESQUEMAS.** La referencia de AutoCAD
  Electrical es «hoja.renglón», y en este documento las entidades no pertenecen a una hoja: el
  espacio papel tiene ventanas, no membresía de entidad. Sin una noción de hoja no se puede
  escribir la referencia sin inventarla. Lo que SÍ cabe —el vínculo padre/hijo por etiqueta
  dentro de un dibujo— se hará si sobra ventana después de los cinco de arriba.
- **2026-09-04 · Llenado de canalización (NOM-001-SEDE Cap. 9, Tablas 1, 4 y 5).** El cálculo
  es trivial; las tablas no. Este entorno no tiene red salvo GitHub, así que las áreas de
  conductor y de tubo se transcribirían de memoria y no se podrían cotejar contra el texto
  oficial. Publicar una tabla normativa sin poder verificarla es exactamente el claim sin
  evidencia que la casa prohíbe. Se reabre con acceso al texto de la norma.
- **2026-09-04 · Cálculo de ejes y resortes.** Cabe técnicamente, pero es una calculadora de
  ingeniería, no dibujo: su valor por hora está por debajo de los cinco de arriba y arrastra el
  riesgo de leerse como memorial de cálculo. Última de la fila.
