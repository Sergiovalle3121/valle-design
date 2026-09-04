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

1. **`BOM Actualizar`: la lista de materiales deja de mentir.** ENTREGADO el 2026-09-04, ver
   la entrada de abajo. Hoy BOM se GENERA; si se
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

### 2026-09-04 · Entregado 1/5 · `BOM Actualizar`: la lista deja de mentir

Hecho y verificado. La tabla que inserta BOM nace marcada con
`context.metadata.mechanical = "bom"` (`CAD_BOM_MARK`, hermana de la marca del globo), y
`buildCadMechanicalBomTable` acepta un id forzado. Con eso, la opción de teclado **Actualizar**
del descriptor BOM localiza las tablas de lista del documento
(`findCadMechanicalBomTables`), recalcula las filas con el MISMO `buildCadMechanicalBom` que
las escribió y las devuelve con `{ type: "replace", entityId, entity }` — que conserva id,
punto de inserción, capa, orden de dibujo y las referencias que la apunten. Es el primer cuadro
autoactualizable del producto: antes de hoy, `grep -R "Actualizar" engine/commands` daba cero.

Decisiones que no eran obvias, con su motivo:

- **Se actualizan TODAS las tablas marcadas, no la última.** Todas dicen la misma lista del
  mismo dibujo; dejar una sin tocar es dejar el plano mintiendo en esa. Es el criterio de
  `UPDATEFIELD`, que ya refresca todos los campos del dibujo.
- **Si nada cambió, no se escribe.** Se compara CELDA a CELDA (no sólo las cifras: renombrar un
  bloque cambia el texto sin cambiar la cuenta) y se termina con mensaje. Un paso de deshacer
  vacío es ruido, como el Intro sin texto de `TABLEDIT`.
- **El renglón dice cifras, no «Hecho»:** «de 1 posición(es) y 2 unidad(es) a 2 posición(es) y
  3 unidad(es)». El «antes» se lee de las CELDAS de la tabla, que es lo que el usuario tenía
  delante. Con varias tablas que se contradecían entre sí no se inventa un «antes» único: se
  dice que no decían lo mismo.
- **Lo que el dibujante ajustó sobrevive:** giro, estilo, ancho de columna (si el número de
  columnas no cambió) y las demás claves de `context`. La orden recalcula filas, no rediseña el
  cuadro.
- **Sin ninguna tabla de lista se niega diciéndolo** y remite a insertarla con BOM y un punto.

Evidencia: `npx tsx src/lib/cad/mechanical.spec.ts` → 90 comprobaciones (eran 84);
`npx tsx src/lib/cad/engine/commands/mechanical.spec.ts` → 179 (eran 151); `npm run typecheck`
verde; `npm run check:command-integrity` → 290 comandos, 83 mutan, 0 éxitos falsos (BOM
conserva su veredicto «muta» y `docs/cad/evidence/command-integrity.json` no cambia);
`npm run check:cad` completo en verde. Ningún archivo fuera del territorio: no se registró
nombre nuevo, así que `command-summaries`, `command-icons`, `alias-table` y `ribbon` siguen
intactos y el resumen de paleta de BOM sigue siendo cierto.

### 2026-09-04 · Entregado 2/5 · La NOM más allá del conductor: capacidad estándar y tierra física

Hecho y verificado. `AECHECK` gana dos reglas citadas **sin pedirle un dato nuevo al
dibujante**: la protección ya viaja en los metadatos desde `AECIRCUIT`, así que dos artículos
más de la NOM-001-SEDE se pueden aplicar sobre lo que el dibujo YA declara.

- **Art. 240-6(A) — la capacidad tiene que ser una de las que se fabrican.** Es el único error
  de esta familia que las reglas anteriores no pueden cazar: un «22 A» tecleado por error tiene
  ampacidad que lo respalda (el 10 AWG llega a 30 A) y una caída que sale bien, así que pasaba
  en silencio — y en la obra se compra un 20 o un 25, con lo que el plano deja de describir la
  instalación. `CAD_NOM_STANDARD_BREAKER_AMPS` (15…6000) más las cinco que el artículo añade
  sólo para fusibles (1, 3, 6, 10, 601), que se aceptan porque el dibujo declara «protección» y
  no si es fusible o interruptor: marcar un fusible de 6 A sería una falsa alarma, y una
  revisión que da falsas alarmas se apaga.
- **Tabla 250-122 — el calibre mínimo de puesta a tierra de equipos.** El dato que el cuadro de
  cargas mexicano lleva y que hasta hoy no se decía en ninguna parte del producto. La trampa de
  esa tabla, que está afirmada en la spec, es que su columna dice «sin exceder de»: una
  protección de 30 A NO cae en la fila de 20 A sino en la de 60, así que su tierra es 10 AWG y
  no 12 — devolver el 12 sería devolver un calibre insuficiente, que es peor que no decir nada.

Decisiones con motivo:

- **Es AVISO y no negativa.** El Art. 240-6 admite en sus incisos (B) y (C) capacidades
  distintas en interruptores de disparo ajustable con acceso restringido. Casi siempre es un
  dedazo, pero llamarlo incumplimiento sería afirmar más de lo que dice la norma. Y se dan **las
  dos** capacidades vecinas, no «la correcta»: bajar protege el conductor pero puede disparar
  con la carga real, y subir obliga a revisar otra vez el calibre. Esa decisión es del
  proyectista.
- **Los dos renglones van DETRÁS del que resume el circuito.** Si fueran delante, `findings`
  nunca estaría vacío y el circuito aprobado perdería la línea con sus números — la que el
  golden 93 y el dibujante leen. El renglón de tierra informa siempre y **no toca el veredicto**:
  no es un hallazgo.
- **`CAD_NOM_CHECK_LIMITS` se reescribió porque decía algo falso.** Decía «sin tierra»; desde
  hoy la tierra sí se dice. El límite verdadero es otro y se declara tal cual: *la tierra física
  se calcula de la protección con la Tabla 250-122, no se coteja contra un conductor de tierra
  dibujado* — porque el documento todavía no distingue un conductor de tierra de uno de fase.
  Sigue sin haber corrección por temperatura, agrupamiento, 125 % de carga continua ni llenado
  de tubo, y la caída sigue siendo resistiva.
- **`groundGauge` lleva su unidad** («12 AWG», «250 kcmil»): arriba de 4/0 la norma cambia de
  unidad y el renglón no puede escribir «250 AWG», que no significa nada.
- **La spec rápida duplica a propósito las tres subcadenas del golden 93** («caída es del 6.1 %
  en 30.0 m», «con 8 AWG bajaría del tope», «No es memorial de cálculo»). Ese golden tarda
  minutos y sólo corre en CI; estas tres líneas cuestan milisegundos, así que el golden no puede
  romperse sin que la spec lo cace primero.

Procedencia, dicha sin adorno: las dos tablas se transcribieron **sin acceso al texto oficial en
línea** —este entorno sólo alcanza GitHub; `curl` a `dof.gob.mx` devuelve 403 del proxy—, en la
misma condición en que ya estaban la ampacidad de la 310-15(b)(16) y la resistencia del Cap. 9
Tabla 8. El módulo lo dice en su cabecera: el cotejo contra la norma impresa no es una cortesía,
es el control que falta.

Evidencia: `npx tsx src/lib/cad/electrical/circuit-check.spec.ts` → **88** comprobaciones (eran
42); `npx tsx src/lib/cad/engine/commands/electrical-circuit.spec.ts` → **41** (eran 28), con los
tres alimentadores tecleados enteros que enseñan los escalones por la ORDEN y no sólo por la
biblioteca (60 A → 10 AWG, 100 A → 8 AWG, 200 A → 6 AWG). Las otras cinco specs del territorio
siguen verdes (wire-numbering 25, device-tags 31, electrical-wire 26, electrical-tag 25,
mechanical 90 + 179), y `data-extraction-commands` 27 también. `npm run typecheck` verde;
`npm run check:command-integrity` → 290 comandos, 0 éxitos falsos y
`docs/cad/evidence/command-integrity.json` sin cambio; `npm run check:cad` sale 0.

Ningún archivo fuera del territorio: cinco de `electrical/` y `engine/commands/`, más esta
bitácora y una petición (P-mech-elec-01, la columna de tierra en el cuadro de cargas, que vive
en `data-extraction/` y por tanto no toco).

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
