# ADR-0015: Modelado directo sobre el B-rep facetado, y la identidad que eso amplía

- Estado: aceptado
- Fecha: 2026-08-31

## Contexto

Esta ADR salda una deuda con nombre. `docs/history/execution/decisiones-pendientes-sergio-20260823.md`
ficha #10 la pedía con estas palabras:

> «3D conceptual/facetado vs kernel geométrico exacto. **No resuelto por ingeniería
> en esta ola.** El prompt maestro pide un **ADR comparativo antes de cualquier
> inversión irreversible** (sección 9).»

Nunca se escribió. `docs/adr/` no tiene ninguna entrada sobre 3D, y mientras tanto
el 3D creció solo: la campaña 3D-M1 (PR #99) entregó muros y masas volumétricas, y
`apps/web/src/lib/brep/` es hoy un B-rep de medias-aristas de 9.407 líneas que
importan una veintena de módulos.

El estado medido, para que la decisión no se tome a ciegas:

- **El kernel B-rep existe, es facetado y está enchufado.** Topología half-edge con
  índices, invariantes validadas tras *cada* operación, booleanas por CSG-BSP con
  cosido de uniones en T, extrusión con desmoldeo, barrido, solevado, redondeo,
  chaflán, propiedades másicas calculadas por dos caminos independientes que deben
  coincidir, NURBS y superficies analíticas como portadoras, teselado por tolerancia
  de cuerda, y STEP AP203/AP214 e IGES 5.3 en los dos sentidos. La rúbrica lo puntúa
  6/7 y el punto que falta es de evidencia independiente, no de funcionalidad.
- **El kernel Rust/WASM no es un kernel 3D.** `crates/valle-cad-kernel` son 671
  líneas que teselan arcos, elipses y B-splines; su ABI no tiene una sola coordenada
  Z. Tiene paridad numérica verde y cero importadores.
- **Lo que falta no es geometría: es interacción.** `pushpull` no aparece ni una vez
  en el árbol. `components/cad/viewport/camera-policy.ts` declara que en modo 3D
  «no se dibuja: es un visor». `engine/commands/solids-create.ts` explica que
  PRESSPULL no empuja caras porque «el viewport 2D designa entidades, no caras».
  `lib/cad/ucs-solid.ts` ya sabe convertir una cara en SCU, pero sólo puede elegirla
  mirando a lo largo de la Z del mundo, y su propio comentario lo llama «una regla de
  designación, no de geometría exacta».

La pregunta que había que responder antes de invertir era: **¿el siguiente peso va a
un kernel geométrico exacto (NURBS analítico, intersección superficie-superficie), o
a la interacción de modelado directo sobre el facetado que ya existe?**

## Decisión

### 1. El kernel canónico sigue siendo el B-rep FACETADO en TypeScript

`apps/web/src/lib/brep/` es el kernel geométrico del producto. El 3D exacto —caras
curvas verdaderas, SSI, tolerancias analíticas— queda declarado **«todavía no»**,
nunca «nunca», con su condición de reapertura escrita abajo.

Las razones, en orden de peso:

- **El modelado directo no necesita geometría exacta.** Empujar una cara, dibujar
  sobre una superficie, inferir contra una arista: todas esas operaciones son sobre
  caras planas y sus lazos. El facetado no es una limitación para este producto; es
  la representación correcta para lo que un arquitecto hace todo el día.
- **Un kernel exacto es una inversión irreversible que hoy no compra usuarios.** La
  fila `brep` vale 7 de 220 puntos, y el reparto por peso comercial de la matriz
  anota que vende «en el comparativo, no en el uso diario». Un despacho no compara
  kernels: compara si puede modelar rápido y entregar la lámina.
- **ADR-0003 sigue vigente y aplica igual.** Un kernel exacto en Rust/WASM tendría
  que pasar sus ocho requisitos con perfilado, paridad y fallback. No hay ningún
  perfil que hoy nombre la geometría exacta como el cuello.

**Condición de reapertura, para que esto no sea una puerta cerrada en silencio:** se
reconsidera el 3D exacto cuando exista demanda medida y nombrada —un cliente que
rechace el producto por la faceta, o un intercambio STEP que un receptor real
rechace por la misma razón— y no antes. La faceta se declara al usuario donde
corresponde: `PRODUCT.md` ya dice que «un intercambio STEP/IGES conserva la faceta,
no la superficie exacta que la generó», y ese texto se queda.

### 2. El modelado directo se aplica SÓLO a entidades `solid3d`

Un `solid3d` es un DAG de historia (`nodes` + `root`). El modelado directo lo
**hornea** a la hoja `op:"brep"` que el esquema ya tiene y que `SLICE` ya usa, porque
un cuerpo empujado a mano «no se puede describir como receta de nada». La receta
anterior **no se borra**: queda como nodo huérfano, que es exactamente el material
que el esquema ya conserva a propósito «para rehacer el árbol de otra manera».

`wall` y `opening` **no se hornean nunca.** Un muro que deja de saber su eje, su
grosor y su altura rompe el cuadro de cantidades, `FLATSHOT`, las uniones L/T y el
recorte de vanos. Reciben grips paramétricos propios, no push/pull.

### 3. La identidad del producto se amplía, y se dice dónde para

`IDENTITY.md` declaraba «CAD 2D general y universal». Eso deja de describir el
producto en cuanto se puede empujar una cara con el ratón. La identidad pasa a
**«CAD 2D general y universal, y modelador 3D de modelado directo»**.

Lo que **no** cambia, y sigue candado:

- **No es BIM.** `apps/web/src/lib/cad/bim-claim-boundary.spec.ts` sigue prohibiendo
  la palabra en cualquier cosa que el usuario vea o teclee: faltan IFC, disciplinas
  coordinadas, detección de interferencias y ciclo de vida.
- **No gestiona industrias.** `check-no-industrial-domain.mjs` sigue igual. Modelar
  una nave industrial es dibujar un edificio; operarla no pertenece aquí.
- **No se promete paridad** con SketchUp ni con AutoCAD 3D. Cada capacidad se anuncia
  con su peldaño de `docs/parity/ESCALERA.md` y su límite al lado.

## Consecuencias

- El trabajo 3D de los próximos meses es **de interacción**, no de kernel: designar
  caras, inferir sobre superficies, grips, componentes. El kernel se toca sólo para
  añadir las operaciones de modelado directo que le falten.
- La identidad ampliada obliga a revisar `IDENTITY.md`, `PRODUCT.md`, `README.md` y
  `AGENTS.md` en el mismo cambio. Ninguno se toca «al pasar».
- El horneado a `op:"brep"` exige identidad estable de cara entre ediciones. Entra
  como campo **opcional** `faceTags?`, con el procedimiento aditivo de ADR-0011 §2
  cumplido entero: un sólido que no usa modelado directo serializa byte-idéntico al
  esquema anterior.
- La rúbrica gana una fila de modelado directo. Como toda su evidencia sería
  fabricada por el proyecto, **retiene 1 punto** hasta tener oráculo externo,
  material de terceros o usuario real. Se dice desde el principio para no repetir el
  inflado del 2026-08-20.

## Alternativas rechazadas

- **Kernel geométrico exacto ahora.** Es la inversión más cara del mapa y la que
  menos usuarios compra hoy. Sigue disponible, con su condición de reapertura escrita.
- **Un motor 3D aparte del documento canónico.** Lo prohíbe ADR-0003: el módulo no
  puede definir su propio formato ni una historia paralela. El modelado directo entra
  por `CadDocument` y por el command bus que ya existe.
- **Push/pull sobre `wall` y `opening`.** Convertiría entidades paramétricas en malla
  y rompería en silencio el cuadro de cantidades y las vistas derivadas.
- **Guardar cada empujón como un nodo más del DAG.** El árbol crecería sin techo
  —hay un tope de 256 nodos— y el rebuild se degradaría en cada edición. El horneado
  deja el árbol en un nodo y conserva la receta como huérfana.
- **Derivar la identidad de cara de su geometría** (normal + centroide cuantizado).
  Falla en cuanto dos caras coplanarias se fusionan o el sólido se mueve, y produciría
  el fallo silencioso que este repositorio prohíbe.
