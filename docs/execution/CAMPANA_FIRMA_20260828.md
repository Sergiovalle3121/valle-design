# Campaña de firma propia — estética ultra premium, seguridad de cuenta y comunidad

**Fecha:** 2026-08-28 · **Base:** `main @ a7a33d8` · **Rama:** `claude/valle-design-premium-identity-4hnemt`

> Bitácora de una campaña cerrada. El informe medido, con lo que NO se hizo y
> por qué, está en `docs/execution/INFORME_CAMPANA_FIRMA_20260828.md`.

## El veredicto del dueño (el encargo)

> «Muy minimalista, le falta vida, movimiento y contraste; no siento que sea MI
> producto — parece heredado; quiero algo ultra premium con mi propia firma,
> inspirado en la estética de un CAD profesional pero mío».

Y con él, cinco encargos concretos: (1) que la página no se presente como «el que
compite con AutoCAD»; (2) que la creación de cuenta sea lo más segura Y lo más
bella posible; (3) más información real para el cliente (FAQ de verdad); (4) un
canal donde los usuarios reporten fallas y sugerencias desde dentro del producto;
(5) sembrar el terreno para un modo universitario gratuito.

## La dirección de arte

Lenguaje **«instrumento profesional»**: la mesa de un dibujante de noche.
Fondo carbón profundo (grafito con temperatura, no negro puro), geometría
brillando encima, retícula técnica sutil, acentos que cortan como plumilla.
Vocabulario: retícula de plano como textura, líneas de construcción y marcas de
referencia como motivo gráfico, **el trazo que se dibuja solo**
(`stroke-dashoffset` animado) como firma de movimiento, numeración y cotas como
detalle tipográfico.

**Límite legal absoluto:** inspirarse en las convenciones del CAD profesional
(fondo oscuro, densidad, precisión) está bien. Imitar la imagen comercial de
Autodesk está prohibido — ni su rojo corporativo, ni su tipografía de marca, ni
composiciones que evoquen su identidad, ni la palabra AutoCAD en el branding.

## Reglas de no-detención

1. Nunca preguntar; decidir, bitacorear, seguir. Ítem bloqueado >25 min → backlog.
2. Esta bitácora se actualiza por ítem. Si el contexto se compacta, se relee primero.
3. Tras cada ola: suite completa + goldens con árbol quieto + push.
4. Todo cambio visual pasa por los tokens (`globals.css` + `components/ui`). Cero hex sueltos.
5. Contraste AA ≥ 4.5:1 medido con gate; todo movimiento respeta `prefers-reduced-motion`;
   ningún `data-testid` cambia; los 761 casos de matemática y la Jornada Real intactos.
6. El canvas NO cambia sus colores de datos (ACI es información del plano).
7. Ningún claim nuevo: el gate de honestidad DWG y el tono siguen mandando.

## Cola de la campaña

| Ola | Ítem | Estado |
| --- | --- | --- |
| 0 | 0.1 Paleta v2 oscura por defecto | **hecho** |
| 0 | 0.2 Tipografía display con carácter | **hecho** |
| 0 | 0.3 Sistema de movimiento tokenizado | **hecho** |
| 0 | 0.4 Textura técnica (retícula, marcas de esquina) | **hecho** |
| 0 | 0.5 Primitivas `components/ui` a la identidad nueva | **hecho** |
| 1 | 1.1 Hero con el plano dibujándose | **hecho** |
| 1 | 1.2 Secciones con profundidad | **hecho** |
| 1 | 1.3 FAQ de verdad (20+ preguntas, categorías, buscable) | **hecho** |
| 1 | 1.4 Precios v2 + días de prueba desde configuración | **hecho** (la cifra ya salía de configuración: premisa corregida) |
| 1 | 1.5 Reposicionamiento legal + gate de superficie | **hecho** |
| 1 | 1.6 Móvil a la misma altura | **hecho** |
| 2 | 2.1 Registro y login premium | **hecho** |
| 2 | 2.2 Entrar con Google y Microsoft | **backlog razonado** (ver informe) |
| 2 | 2.3 MFA opcional (TOTP) | **hecho** (API + evidencia PG) |
| 2 | 2.4 La cuenta muestra su seguridad | **hecho** |
| 2 | 2.5 Verificación por enlace pulida | **hecho** (hereda la identidad y el shell nuevo) |
| 3 | 3.1 Nombres humanos de entidades | **hecho** |
| 3 | 3.2 Primera impresión en 2D | **hecho** |
| 3 | 3.3 Cromo del estudio con la identidad nueva | **hecho** |
| 3 | 3.4 Microfeedback de acción | **hecho** |
| 3 | 3.5 Regenerar capturas | **hecho** |
| 4 | 4.1 Centro de comentarios en el producto | **hecho** |
| 4 | 4.2 Panel de administración de comentarios | **hecho** |
| 4 | 4.3 `/novedades` | **hecho** |
| 5 | 5.1 Plan educativo tras flag | **hecho** (mecanismo probado, interruptor apagado) |
| 5 | 5.2 El aula como organización | **hecho** (`/equipo`, invitación pegando la lista) |
| 5 | 5.3 `/educacion` | **hecho** |
| 5 | 5.4 Qué faltaría para encenderlo | **hecho** (informe + aviso al arrancar la API) |
| F | F.1 Suite + Jornada Real + goldens + push | **hecho** |
| F | F.2 Gate de contraste + gate de superficie + antes/después | **hecho** (16 pares nuevos) |
| F | F.3 Informe de cierre | **hecho** |
| F | F.4 BRAND.md y DESIGN_SYSTEM.md actualizados | **hecho** |

## Bitácora

### 00:00 — Arranque

Repositorio en `main @ a7a33d8`, árbol limpio, rama de campaña creada.
Reconocimiento inicial: `globals.css` (831 líneas, tokens semánticos HSL con
`.dark` como inverso fiel del claro), 12 primitivas en `components/ui`, gate
`design-system.spec.ts` con siete reglas, portada de 642 líneas con capturas
reales del producto.

**Hallazgo que corrige el encargo:** el gate de contraste AA «que ya existe» NO
existe — `grep` sobre `scripts/` y `components/ui` no encuentra ningún cálculo de
luminancia relativa ni umbral 4.5:1. Se construye en esta campaña (F.2) en vez de
darlo por hecho.

### 01:10 — OLA 0 cerrada: la firma existe y está medida

**0.1 · Paleta v2.** Sustrato de **grafito cálido** (`#0c0b0b` oscuro / `#f7f5f2`
claro) con acento **violeta eléctrico** (`#8c73fc` / `#6b4def`), ámbar de
plumilla y verde de confirmación. La decisión de fondo: la v1 era un claro de
banca con un oscuro que era su *inverso fiel* — coherente y anónimo. La v2 elige
una temperatura (cálida abajo, fría en el acento) y la sostiene en los dos modos.
El oscuro deja de ser una cortesía nocturna y pasa a ser el DEFAULT del producto
(`layout.tsx` + `ThemeContext`); `system` sigue existiendo pero ahora se pide.

Relieve: el fondo oscuro baja a 4,5 % de luz y la tarjeta sube a 11,5 % —siete
puntos donde la v1 tenía tres— y las sombras oscuras estrenan un `inset` de luz
en el canto superior, que es lo que de verdad separa planos sobre casi-negro.

**El hallazgo que corrigió el encargo.** La instrucción decía «medido con el gate
que ya existe». No existía. Lo que había eran números medidos a mano en los
comentarios de `globals.css` (4,46:1 · 5,38:1 · 3,02:1), correctos y sin nada que
los volviera a comprobar. Se construyó:

* `scripts/design/contrast.mjs` — la aritmética WCAG 2.1 sin dependencias.
* `scripts/design/check-contrast.mjs` — **35 pares por tema, 70 en total**, con
  tres umbrales: 4,5:1 texto, 3:1 gráfico y 1,3:1 *relieve* (criterio propio: la
  queja era «le falta contraste» y en oscuro eso casi nunca es el texto, es que
  los planos no se separan).
* `scripts/design/check-contrast.spec.mjs` — 10 pruebas, incluida la que casi
  nunca se escribe: que el gate DETECTE una paleta ilegible.

El gate cazó dos fallos del primer corte antes que el ojo: el borde claro a 87 %
de luz no despegaba la tarjeta del fondo (1,23:1) y el hover de marca en oscuro
caía a 4,21:1 con letra blanca. Los dos corregidos moviendo el token.

**0.2 · Tipografía.** Display nueva: **Space Grotesk** (OFL 1.1, autohospedada,
`SpaceGrotesk-wght.ttf`, 136 KB). El argumento no es estético: es la hermana
*proporcional* de una monoespaciada, así que comparte esqueleto con la mono que
ya compone cotas, coordenadas y línea de comandos — la marca pasa a tener UNA voz
en dos anchos. Sólo la consumen `display`, `title` y `heading`; el cuerpo sigue en
Inter porque hay documentación que se lee de verdad. Titulares más grandes y más
densos: techo de 68 → 84 px, interlínea 1,04 → 0,98. Escalón nuevo
`.type-sheet-number` (numeración de lámina). `check:fonts` ya exige el archivo.

**0.3 · Movimiento tokenizado.** Tres curvas (`expo`, `spring`, `draw`) y seis
duraciones con nombre de trabajo, no de tamaño (`instant` 90 ms … `draw` 2600 ms),
más cinco clases `.motion-*` para que nadie vuelva a escribir `duration-200` a
mano. Y la firma: `.stroke-draw` / `.stroke-draw-loop` — `stroke-dashoffset`
animado sobre `pathLength="1"`, escalonado con `--draw-delay`.

**El defecto que la regla general escondía.** `prefers-reduced-motion` aplasta la
duración a 0,001 ms y deja cada animación en su fotograma final. Para el bucle del
trazo ese fotograma es el plano **borrado**: quien pide menos movimiento se habría
quedado mirando un lienzo en blanco. Excepción explícita añadida y comentada.

**0.4 · Textura técnica.** `.blueprint-grid` (dos frecuencias, 8 px y 64 px, la
convención del papel milimetrado), `.corner-marks` (marcas de escuadra en un
`::before` con `pointer-events: none`), `.construction-line` y su vertical.
CSS puro, cero imágenes.

**0.5 · Primitivas.** `shadow-control` (filo de luz + sombra) y
`active:translate-y-px` en botón primario y destructivo: un control que se pulsa
hace dos cosas a la vez, y ese par es lo que separa un rectángulo de color de una
tecla. `Surface` estrena `texture` (`none` · `corners` · `grid`) y levita medio
píxel al pasar el puntero cuando es pulsable. Los campos estrenan `focus-glow`.

**Activo nuevo:** `components/brand/PlanDrawing.tsx` — una planta arquitectónica
completa (muros dobles, vanos, puertas con barrido, mobiliario, escalera, cotas
con marcas oblicuas y cajetín) que se traza sola en el orden del oficio. Cero
JavaScript en el cliente: componente de servidor y animación entera en CSS.

**Verdad medida:** `432/432` specs verdes · `check:contrast` 70 pares OK ·
`check:fonts` OK · `tsc --noEmit` limpio.

**Zona de roce anotada:** `apps/web/src/app/page.tsx` queda ROJO a propósito en
`check:surface` — el gate de superficie ya existe y la portada todavía nombra a
la competencia. Es el primer ítem de la OLA 1.

### 02:40 — OLA 1 cerrada: la portada dejó de compararse y empezó a moverse

**1.5 · Reposicionamiento, primero porque bloqueaba.** Fuera de la superficie
pública las comparaciones: el hero decía «una alternativa a AutoCAD en la nube» y
ahora se describe solo; el límite de DXF dice «la versión AC1015» en vez de
nombrar la versión por su marca; la capacidad de automatización pasa a
«Automatización con LISP en el navegador», descrita como el dialecto LISP del
dibujo técnico. La línea de marcas se conserva —el producto lee DXF y esos
nombres viven en la documentación técnica— pero **extraída a
`components/marketing/TrademarkNotice.tsx`**, para que el gate tenga UN archivo
que permitir en vez de una excepción por página.

`scripts/design/check-public-surface.mjs` vigila 19 zonas públicas. Quita
comentarios antes de mirar (el gate juzga lo que el usuario lee, no lo que el
equipo escribe para entenderse) y comprueba las dos mitades: que las marcas no
aparezcan fuera del módulo autorizado **y que el aviso siga montado**. Un gate
que sólo prohibiera se satisface borrando el aviso legal.

**1.1 · El hero se mueve.** `PlanViewport` + `PlanDrawing`: una planta que se
traza sola, dentro de una lámina con su numeración y su cajetín. No finge ser la
aplicación —sin barra de ventana ni paletas falsas— porque una interfaz dibujada
a mano que imita el producto es una mentira barata. Las capturas reales del
editor siguen justo debajo, que es donde tienen que estar.

**Defecto cazado antes de publicarlo:** el halo del visor mide 40 puntos más que
la figura por cada lado, exactamente el defecto que el marco del producto ya
pagó una vez (la portada entera se desplazaba en horizontal en un teléfono de
390). Resuelto con `overflow-x-clip`, el único valor de CSS que permite recortar
un solo eje: corta el sangrado lateral y deja el resplandor arriba y abajo.

**1.2 · «Así se siente».** Tres microdemos animadas (`FeelDemo.tsx`) de lo que
una captura no puede contar: la referencia que imanta al punto exacto, la cota
que nace amarrada, la lámina que sale con el tamaño de página exacto. SVG de 2 KB
que heredan el tema, no GIF de megabytes que envejecen en silencio.

**1.3 · Centro de preguntas.** De 7 a **36 preguntas en 6 categorías**, con
buscador que mira dentro de las respuestas (quien teclea «Argon2» o «CFDI» no
está escribiendo el título de ninguna pregunta) y que normaliza los acentos
(«facturacion» encuentra «facturación»). Sin resultados nunca hay callejón sin
salida: se ofrece soporte, porque la pregunta que nadie previó es justo la que
hay que poder hacerle a una persona.

El texto vive en `lib/marketing/faq.ts` y de ahí sale también el JSON-LD: lo que
ve Google y lo que lee una persona son literalmente el mismo párrafo.
**`public-pages.spec.ts` se amplió para cubrir ese módulo** — si se hubiera
quedado mirando sólo `page.tsx`, la regla de honestidad habría seguido en verde
mientras 36 respuestas nuevas podían prometer lo que quisieran.

**1.4 · La premisa del encargo estaba vencida.** El encargo decía que la portada
dice «14 días gratis» cableado. No: la campaña de lanzamiento ya lo había
resuelto. `TRIAL_DAYS` → catálogo público de la API → `FreeLaunchNote` (portada
y alta) y `PricingCatalog` (precios); el panel usa `TrialBanner` sobre el estado
real de la suscripción. **Verificado, no reescrito.** El único `14` que queda es
`EXPIRY_NOTICE_DAYS`, que es otra cosa: cuándo empieza el aviso de vencimiento.

**Ambiente tokenizado — el hex que sobrevivió a la campaña anterior.** Las capas
atmosféricas (aurora, orbes, malla cónica, halo) llevaban el índigo de la v1 en
SEIS `rgba()` escritos a mano dentro de la hoja. Sobrevivieron porque el gate del
sistema prohíbe el hex en los COMPONENTES y éstos vivían en el CSS, su único
hueco legal — así que seguían pintando el acento viejo con la paleta ya
cambiada. Ahora son `--ambient-tint*`, `--halo-tint` y `--conic-tint` con tema, y
`.dark .aurora-bg` desapareció por innecesario. **La regla que queda escrita: si
un color se repite en la hoja, es un token; «está en globals.css» no basta.**

**Dos páginas públicas nuevas** (adelantadas de las olas 4 y 5 porque el centro
de preguntas ya enlazaba a ellas): `/novedades`, alimentada por un módulo simple
de ocho entradas fechadas y en producción, sin hoja de ruta a propósito; y
`/educacion`, que cuenta lo que un taller puede hacer HOY y dice con todas las
letras que el plan educativo gratuito todavía no está abierto. Las dos en el
sitemap, en la barra pública y en el pie.

**Verdad medida:** `432/432` specs verdes · `build` verde · `check:contrast` 70
pares OK · `check:surface` OK · trinquete de lint 547/547 · `tsc` limpio.

### 04:20 — El segundo factor, y el codificador de QR que lo hace escaneable

**2.3 · MFA (TOTP) — el núcleo, la API y la evidencia.** Escrito a mano y no
importado, porque TOTP son treinta líneas cuya corrección se puede DEMOSTRAR
contra los vectores del propio RFC — un oráculo externo de verdad, no un golden
generado por la misma implementación. `identity-mfa.spec.ts`: **41 aserciones**,
los seis vectores de RFC 6238 §B y los siete de RFC 4648 §10.

Cuatro decisiones que valen más que el algoritmo:

* **El secreto va cifrado** (AES-256-GCM, clave fuera de la base de datos). Un
  secreto TOTP no puede guardarse en hash —hay que reproducir el código— y en
  claro convierte cualquier volcado en la derrota total del factor. GCM y no CBC
  porque además autentica: un secreto manipulado falla al descifrar en vez de
  producir códigos silenciosamente equivocados que el usuario viviría como «mi
  teléfono dejó de funcionar». En producción la clave es obligatoria.
* **`lastUsedStep` contra repetición.** La parte que casi todas las
  implementaciones caseras olvidan: sin ella un código robado sigue sirviendo
  durante los noventa segundos de la ventana de tolerancia.
* **El desafío NO es una sesión a medias.** Es un token de un solo uso en la
  tabla que ya existe. Una sesión con una bandera se convierte en un agujero en
  cuanto un endpoint se olvida de mirar la bandera; una fila que no está en la
  tabla de sesiones no puede autenticar nada por accidente.
* **Desactivar exige la contraseña.** Una sesión abierta en una máquina
  desatendida es justo el escenario contra el que sirve el factor.

**Evidencia contra PostgreSQL real:** se levantó un PostgreSQL 16 local y se
corrió la suite completa. `identity-mfa.pg.spec.ts` ejerce el flujo entero —
**15 pruebas** incluida la carrera de dos peticiones simultáneas con el mismo
código de respaldo, que sobre SQLite no se puede probar porque el motor
serializa toda escritura y la carrera sencillamente no ocurre. Total:
**207/207 en `test:pg`, 37 suites**, con la cadena de migraciones completa
(up → down → up) sobre la base real.

**2.4 · Actividad de la cuenta.** La tabla de auditoría no registraba ni un
inicio de sesión —sólo alta, verificación y restablecimiento— así que la página
de cuenta no tenía nada que enseñar. Ahora hay `identity.signed_in` con su
método, `GET /v1/auth/activity`, y aviso por correo por el outbox transaccional.
El aviso NO se manda en el primer inicio tras el alta: un correo de «inicio de
sesión nuevo» a los diez segundos del de bienvenida enseña a la gente a ignorar
justo el aviso que algún día tendrá que leer con atención.

**El contrato, movido entero.** 7 operaciones nuevas en la OpenAPI, SDK
regenerado, consola de la API regenerada, y los **cuatro** recuentos que el
repositorio mantiene a mano movidos a la vez (`check-design-contract`,
`standalone-contract-router`, `console-contract` ×2). `completeIdentityMfaLogin`
entra en la lista de operaciones sin sesión con su razón escrita: es el segundo
acto del inicio de sesión y ocurre antes de que exista sesión.

**Un error propio, corregido en el acto y convertido en guardia.** Al levantar
PostgreSQL para verificar la migración, la cadena murió con `syntax error at or
near "-"`. Diagnostiqué mal —creí que `json-column-type.ts` debía reconocer
`TEST_DATABASE_URL`— y ese «arreglo» puso **51 suites en rojo**, porque las
entidades pasaron a mapearse a `jsonb` para todo el proceso, incluidas las que
corren sobre SQLite. Revertido.

La causa real era mía: invoqué `npx jest` en vez de `npm run test:pg`. El
repositorio ya tenía la trampa señalizada por dos sitios —el lanzador define
`DATABASE_URL`, y `createPostgresHarness` falla con un mensaje que nombra el
comando correcto—. El único hueco real: `migration-chain.pg.spec.ts` construye
su propio DataSource y se saltaba esa señal. Ahora pasa por ella, y
`json-column-type.spec.ts` fija la frontera para que el próximo que intente
ampliarla se encuentre la explicación en rojo.

**Activo nuevo verificado: el codificador de QR.** Sin dependencias, en
`apps/web/src/lib/qr/`. **1005 comprobaciones verdes**: aritmética de GF(256)
contra una implementación independiente, síndromes nulos en todos los bloques
leídos DE LA MATRIZ (y no nulos al corromperlos), ida y vuelta con un
decodificador escrito aparte, barrido de las 40 versiones, e información de
formato, versión, alineación y capacidades contra los vectores publicados del
estándar.

**Verdad medida:** `433/433` specs web · `756` API (unidad) · `207/207` API
contra PostgreSQL real · contrato 90 operaciones sincronizadas · contraste 70
pares · superficie pública OK · trinquete de lint 547/547 · `tsc` limpio en los
dos workspaces.

### 05:40 — OLA 2: la pantalla donde el cliente entrega sus datos

**2.1 · Registro y login premium.** `AuthShell` pasa a ser una pantalla partida
en escritorio: el formulario a la izquierda y a la derecha el PRODUCTO —el plano
dibujándose— con los sellos de confianza debajo. En móvil el panel desaparece
entero: un panel decorativo que empuja el formulario bajo el pliegue convierte
una ayuda en un obstáculo.

Tres piezas nuevas, cada una con su prueba:

* **`PasswordField`** — mostrar/ocultar (la razón número uno por la que alguien
  falla al registrarse es teclear mal algo que no puede ver), `autocomplete`
  correcto para que los gestores de contraseñas ofrezcan generar y guardar, y el
  medidor sólo al ELEGIR contraseña, nunca al entrar.
* **`lib/password-strength.ts`** — mide ENTROPÍA y castiga los patrones que un
  atacante explota, en vez de premiar clases de carácter. Las pruebas están
  escritas como acusaciones: `P@ssw0rd12` sale **muy débil** (es «password»
  disfrazada) y `caballo grapa bateria correcto` sale **fuerte**. Un medidor que
  felicita a `P@ssw0rd1` empuja a la gente hacia la contraseña que el atacante
  prueba primero.
* **`TrustSeals`** — cuatro afirmaciones, cero escudos decorativos. Cada línea
  nombra un mecanismo concreto que existe en el repositorio y se puede ir a leer.
  La forma fácil de cumplir «que se vea segura» es un escudo verde; es también la
  que destruye lo que venía a construir, porque quien sabe algo reconoce el
  adorno y deduce que lo demás también puede serlo.

**2.4 · La cuenta muestra su seguridad — y el hueco que había.** El API llevaba
desde el primer día ofreciendo `GET /v1/auth/sessions`, el SDK tenía las cuatro
operaciones de sesión tipadas, **y el web no llamaba a ninguna**. Había un
producto que sabía decir «éstas son tus sesiones abiertas y puedes cerrar
cualquiera» y ningún sitio donde lo dijera. `/cuenta` lo dice: sesiones con su
dispositivo aproximado y botón de cerrar, actividad reciente, el segundo factor,
y —por fin escrito— que cambiar la contraseña cierra todas las demás sesiones.
Una defensa que el usuario no conoce es una defensa que no usa.

La página tampoco era **alcanzable**: ninguna navegación del producto enlazaba a
`/cuenta`. Añadido al panel.

**`lib/user-agent.ts`** traduce la cadena cruda a «Chrome en Mac». Probado
contra agentes REALES, incluidos los tres que se hacen pasar por otro: Edge dice
ser Chrome, Chrome de iOS dice ser Safari, y el Safari de un iPad dice ser un
Macintosh.

**El QR, verificado contra un oráculo externo de verdad.** El agente auditor
instaló `qrcode` de npm **sólo en el scratchpad** (nunca en el repositorio, que
es justo lo que este codificador existe para evitar) y comparó la matriz
completa, módulo a módulo, para 49 textos incluyendo uno de capacidad exacta por
cada una de las 40 versiones: **cero discrepancias, máscara elegida incluida**.

Y encontró un defecto real que la ida y vuelta no podía ver: los centros de los
patrones de alineación son lógica CALCULADA compartida entre codificador y
lector, y sólo estaban fijados en 7 de las 40 versiones. Un centro equivocado
desplaza por igual lo que dibuja uno y lo que salta el otro — ida y vuelta en
verde, síndromes nulos, y matriz ilegible. Se demostró con mutación (288 módulos
de diferencia contra un lector real en la v15), se arregló fijando las 40 filas
de la tabla E.1, y la batería de mutación pasó de 6/9 a **9/9 detectadas**.

**Tres cortes por el gate del monolito, y ninguno fue «añadirlo al manifiesto».**
`identity.service.ts` llegó a 931 líneas: el segundo factor salió a
`identity-mfa.service.ts`, con la frontera donde el acoplamiento es real —el
FACTOR aquí, el DESAFÍO y la SESIÓN allá— y la flecha de dependencia en un solo
sentido, porque un `forwardRef` habría sido la señal de que la frontera está mal
puesta. `client.ts` del SDK llegó a 852: la superficie de identidad salió a
`identity.ts`, recibiendo el transporte por parámetro para que la política de
CSRF siga teniendo una sola verdad. Y la suite de QR se partió en dos por la
misma costura por la que se partió el codificador: lo que se contrasta contra un
número publicado, y lo que sólo se puede comprobar dibujando.

**Verdad medida:** `436/436` specs web · `756` API unidad · `207/207` API contra
PostgreSQL real · SDK 9/9 · contrato 90 operaciones · contraste 70 pares ·
superficie pública OK · monolito OK · trinquete de lint 547/547 · `tsc` limpio.

### 06:50 — OLA 3: el estudio deja de hablar en identificadores

**3.1 · Nombres humanos.** El panel de propiedades enseñaba `cad_mt60y4ol_uzfo`
justo donde el usuario mira para saber qué ha designado — y ese identificador
concreto era, literalmente, el de la primera entidad del plano de ejemplo, así
que era el que veía todo el mundo. La lista de entidades tenía el mismo problema
multiplicado por veinte filas indistinguibles.

Ahora: **«Muro 3», «Cota 12», «Texto 5»** — tipo en español del gremio (`opening`
es «Vano», no «Abertura») más ordinal por tipo. El id no desaparece: viaja en el
`title`, a un puntero de distancia, porque un reporte de fallo lo necesita. Y el
`data-testid` sigue llevando el id, que es la identidad real.

El límite está declarado y probado, no escondido: **borrar renumera**. La
alternativa —un contador persistido— convierte el nombre en estado que hay que
migrar, versionar y resolver en conflictos de guardado, y produce «Muro 47»
siendo el tercero de la lista. El nombre es una etiqueta de lectura; la identidad
sigue siendo el id.

**3.2 · Primera impresión en 2D.** El estudio abría SIEMPRE en 3D. Es la peor
bienvenida posible para un CAD 2D: lo primero que ve quien entra a dibujar un
plano es una perspectiva, y su primer gesto es buscar el botón que la apaga. El
3D de este producto está para COMPROBAR volumen, no para diseñar — lo dice su
propia documentación. Ahora abre en 2D y **la elección se recuerda**
(`viewMode` entra en las preferencias del espacio de trabajo), así que quien de
verdad trabaja en 3D lo deja puesto una vez.

**3.4 · Microfeedback.** El editor ya decía «Guardando… → Guardado» y lo decía
inerte. Ahora el indicador RESPIRA mientras guarda —un latido lento es lo que
distingue «trabajando» de «colgado»— y da un pulso único al terminar con la
curva de confirmación de la casa. El pulso se dispara porque la `key` cambia con
el estado y React remonta: sin efecto que compare el estado anterior y sin
temporizador que limpiar.

**Dos extracciones que el gate del monolito forzó, y agradecidas.**
`Layout3DEditor.tsx` sólo puede ENCOGER. Al añadir los nombres se pasó 22 líneas,
y la instrucción del gate es explícita: «mueve el código nuevo a un módulo
aparte». Salieron `CadNativeEntityList` y `CadSaveStatus` — dos bloques de
presentación sin estado que dentro de veinte mil líneas nadie volvía a mirar.
**El monolito bajó de 20 242 a 20 206 líneas** y el presupuesto quedó actualizado.

**Verdad medida:** `437/437` specs web · build verde · contraste 70 pares ·
superficie OK · monolito OK (y más bajo) · lint 547/547 · `tsc` limpio.

### 08:10 — OLA 4: la voz del usuario, con vuelta

**El encargo, con su remate.** «Un canal donde los usuarios reporten fallas y
sugerencias desde dentro del producto» — y la parte que se suele olvidar: **«que
se sienta escuchado es el punto»**.

**Por qué no bastaba el botón que ya había.** `/v1/support/incidents` manda un
correo y se olvida. Sirve para un INCIDENTE: algo se rompió y alguien tiene que
mirarlo hoy. No sirve para la sugerencia que a alguien se le ocurre un martes
dibujando, que sin nadie que la guarde deja de existir en cuanto se cierra la
pestaña de quien la leyó.

**Lo que se construyó.** Tabla `product_feedback` con organización, autor,
clase, mensaje, contexto opcional y **cuatro estados** (nuevo · leído · planeado
· resuelto). Cuatro y no nueve: un tablero con nueve columnas se abandona; con
cuatro, el dueño clasifica cien comentarios en diez minutos, que es la única
forma de que el canal siga vivo dentro de seis meses.

Cuatro operaciones en el contrato (94 en total), su SDK y tres superficies:
el diálogo dentro del estudio y del panel, `/comentarios` («mis comentarios», con
el estado y **qué significa** cada uno) y `/comentarios/admin` para quien opera.

**Cinco decisiones que valen más que el CRUD:**

* **La fila y el aviso, en la misma transacción.** Un aviso sin fila manda al
  dueño a buscar en un panel algo que no existe; una fila sin aviso espera a que
  alguien entre por casualidad.
* **Sin buzón configurado, se guarda igual.** Al revés que el botón de
  incidentes, que falla ruidoso porque allí el correo ES la entrega. Aquí la
  entrega es la fila, y negarse a guardar por falta de configuración sería tirar
  lo que el usuario se molestó en escribir.
* **El contexto técnico se recorta EN EL SERVIDOR** a cinco campos declarados.
  Lo que manda el navegador no se cree. La prueba manda un documento de 40 000
  caracteres y una cookie de sesión, y comprueba que ninguno de los dos llega.
* **La casilla enseña la lista literal de lo que enviaría.** Un «adjuntar
  información de diagnóstico» que no dice qué adjunta es lo que hace que la
  gente lo desmarque por si acaso — y entonces el reporte llega sin nada útil.
* **El comentario sobrevive a su organización pero se va con su autor.**
  `SET NULL` y `CASCADE`: lo que dice sobre el producto sigue siendo cierto
  aunque el despacho ya no exista; el comentario, en cambio, es de quien lo
  escribió.

**La puerta del panel del dueño.** No hay —ni debe haber— un rol de
superadministrador en la base de datos: los cuatro papeles del producto son POR
ORGANIZACIÓN y esa frontera es la que protege el plano de un despacho del de
otro. La lista de operadores vive en configuración (`PRODUCT_OPERATOR_EMAILS`),
no se puede conceder desde dentro del producto, y **falla cerrado**: sin la
variable no hay operadores y el panel devuelve 403 a todo el mundo, incluido
quien lo escribió. Su prueba encontró un defecto real en el primer corte —el
filtro sólo pedía que la cadena contuviera una arroba, así que `@` a secas
entraba en la lista— y ahora exige forma de correo.

**Otro defecto que las pruebas encontraron y que valía la pena.** El arnés de
PostgreSQL construye el esquema desde las ENTIDADES y producción desde las
MIGRACIONES. La entidad no declaraba sus claves foráneas, así que el `ON DELETE
SET NULL` que la migración escribe con cuidado no existía en las pruebas: la
prueba que lo verificaba fallaba sin motivo aparente. Las relaciones están ahora
declaradas, con la nota de por qué.

**Verdad medida:** `437/437` specs web · `760` API unidad · **`217/217` API
contra PostgreSQL real** (10 pruebas nuevas del canal) · contrato 94 operaciones
· build verde · contraste 70 pares · superficie OK · monolito OK · lint 547/547.

### 08:05 — El rojo de la Jornada Real, y por qué era culpa de la campaña

Las tres corridas de CI de las olas 2, 3 y 4 fallaron en el MISMO sitio y por la
misma línea, la primera de la Jornada Real:

```
strict mode violation: getByLabel('/Contrase.*a/iu') resolved to 2 elements:
  1) <input type="password" name="password" …>
  2) <button aria-label="Mostrar la contraseña" …>
```

**Qué pasó de verdad.** `PasswordField` metió DENTRO del campo un segundo control
—el botón de mostrar/ocultar— cuyo nombre accesible contiene, necesariamente, la
palabra «contraseña». Veinte llamadas repartidas por nueve specs pedían la
etiqueta con un patrón suelto, y desde la ola 2 ese patrón casa con dos
elementos. Playwright, con razón, se niega a elegir por su cuenta.

**Lo que NO se hizo: cambiar el producto.** «Mostrar la contraseña» es el nombre
correcto para ese botón —es el que usan los gestores de contraseñas y el que un
lector de pantalla necesita oír— y rebautizarlo para que un localizador de
pruebas no se confunda sería degradar la accesibilidad real por comodidad de la
herramienta. El defecto está en el localizador, no en la interfaz.

**Un rodeo que hay que registrar porque casi cuela.** El primer arreglo fue
`getByLabel("Contraseña", { exact: true })` y dejó los mismos specs en rojo, esta
vez por tiempo agotado: `getByLabel` mira el TEXTO RENDERIZADO de la `<label>`, y
`FieldShell` le pega el asterisco de campo obligatorio. La etiqueta real es
`Contraseña*`, no `Contraseña`. Se comprobó con una sonda —una prueba de usar y
tirar que imprime `["Nombre*","Correo electrónico*","Contraseña*"]`— en vez de
volver a suponer. El arreglo definitivo ancla el principio y no exige igualdad:
`getByLabel(/^Contrase/iu)`, que resuelve a un único `INPUT`.

**Verdad medida:** Jornada Real `10/10` en verde contra el stack real (API NestJS
+ PostgreSQL 16 local), incluido el embudo gratuito.

### 09:20 — OLA 5: los cimientos del modo universitario, y otro hueco del tamaño del de la ola 2

**5.1 · El mecanismo, con el interruptor apagado.**
`modules/education/education-mode.ts`. `EDUCATION_MODE` apagado por defecto y
`EDUCATION_EMAIL_DOMAINS` vacía; con el modo apagado la lista está vacía AUNQUE
esté escrita, para que ninguna ruta futura pueda usarla saltándose el
interruptor. Catorce pruebas escritas como acusaciones, y la que importa:
`malicioso-unam.mx` NO entra. Un `endsWith('unam.mx')` lo habría dejado pasar, y
ese dominio cuesta doce dólares. La comparación es por segmentos de etiqueta.

El plan educativo **no se siembra en el catálogo**, y hay una prueba que lo
comprueba: un plan gratuito publicado mientras el modo está apagado sería una
oferta en la página de precios que ningún alta puede conceder.

**5.2 · El aula como organización — y el hueco.** `GET /v1/organizations/:id/
memberships` y `POST …/invitations` existen desde el primer día, con control de
asientos y correo transaccional, y **el web no llamaba a ninguno**. El producto
sabía invitar a una organización y no había un solo sitio donde hacerlo,
mientras `/educacion` afirmaba «invitas a tus alumnos por correo».

`/equipo` lo arregla por donde un profesor lo necesita: **pegando la lista**.
`lib/education/roster.ts` (25 comprobaciones) acepta comas, líneas,
`Nombre <correo>` y columnas con tabulador; el espacio NO separa, porque si
separara «Ana Ruiz <ana@x.mx>» daría tres entradas rotas y el profesor vería
descartes que no existen. Los descartes **se devuelven con su motivo**: pegar
treinta líneas, ver veintiocho invitaciones y no saber cuáles dos faltan es la
peor forma posible de fallar.

Las invitaciones se mandan en SERIE. El límite de asientos se comprueba en el
servidor y treinta peticiones simultáneas contra ese límite reparten
arbitrariamente quién entra; además, una ráfaga desde el navegador es
indistinguible de un abuso. Al primer 409 se para y se dice cuántas quedaron sin
mandar.

**5.4 · Qué falta para encenderlo**, escrito en el informe: dos decisiones que
no son técnicas —qué dominios se aceptan y con qué capacidad de soporte se
atiende el pico de altas de principio de semestre—. El arranque de la API lo
anuncia en cada despliegue: «Modo universitario: apagado — falta EDUCATION_MODE
y EDUCATION_EMAIL_DOMAINS». Una bandera que sólo se ve leyendo el código es una
bandera que un día alguien cree encendida.

### 10:30 — Los trece goldens en rojo, y por qué ninguno se arregló bajando la prueba

La suite de navegador completa contra el stack real destapó trece fallos. Cero
defectos de producto; cinco causas, y las cinco decisiones vale la pena
escribirlas:

**1 · El panel decía `CIRCLE` y pasó a decir `CÍRCULO`.** La primera reacción
—actualizar ocho aserciones— era la equivocada. Ese panel presume, literalmente
en su subtítulo, de «geometría canónica … DXF sin aproximación persistida», y el
tipo DXF es el dato que sostiene esa promesa: es lo que el profesional va a
encontrar dentro del fichero y lo que nombra un manual. Enseñar sólo `CÍRCULO`
le quitaba esa palabra; enseñar sólo `CIRCLE` era el defecto que la ola 3
arregla. **Se enseñan los dos**, con jerarquía. Ocho goldens vuelven a verde sin
tocarlos, y el producto quedó mejor que antes de la ola.

La cabecera salió a `CadNativeSelectionHeading.tsx` porque el presupuesto del
monolito lo pidió en el momento exacto: al añadir la etiqueta el archivo se pasó
cuatro líneas. El gate no es burocracia — es lo que convierte «añado dos líneas
aquí» en «extraigo el bloque de presentación que nunca debió estar dentro».

**2 · El estudio abre en 2D y los presets de cámara son chrome del 3D.** Siete
goldens medían el pipeline de render, el motor de puntero y la inversión
mundo↔pantalla DEL VISOR 3D, y pulsaban «Vista superior» sin pedir el modo
porque antes venía puesto. Quitarles el preset y dejarlos correr en 2D los
habría dejado VERDES MIDIENDO OTRA COSA, que es la peor forma de arreglar una
prueba. Ahora piden el modo que ejercitan (`e2e/fixtures/view-mode.ts`).

**3 · El id salió del titular del panel.** Dos specs lo buscaban como subcadena
en el texto del panel —uno de ellos barriendo TODOS los botones del documento
con `page.evaluate`—. Ahora lo leen del detalle técnico y designan por
`data-testid`, que es la identidad real y no cambia cuando cambia el idioma de
la interfaz. Las dos aserciones pasaron de aproximadas a exactas.

**4 · La lista de entidades habla en español.** Un golden esperaba `MTEXT` donde
el usuario lee «Texto 1». Se cambió la aserción: el `data-testid` sigue llevando
el id.

**5 · El campo de contraseña ganó un botón que dice «contraseña».** Ver la
entrada de las 08:05.

La regla que se siguió en los cinco: **una prueba se cambia cuando el producto
cambió a propósito y la prueba deja de describirlo; nunca para que deje de
fallar.**

### 11:15 — Antes y después, con el mismo script y dos árboles

Dieciséis pares en `docs/design/before-after/` con sufijo `-firma-antes` /
`-firma-despues`. El «antes» NO son capturas viejas: es `a7a33d8` construido en
un worktree y fotografiado con **los mismos scripts, misma resolución, mismo
tema, mismo encuadre**. Lo único que cambia entre las dos columnas es el
producto.

Y hay un detalle en el «antes» que vale por todo el informe: en
`portada-fold-dark-firma-antes.png`, el panel derecho del editor enseña
dieciocho filas de `cad_mt60y4ol_uzfo`. Ése era el estado real del producto que
el dueño estaba mirando cuando dijo que no lo sentía suyo.
