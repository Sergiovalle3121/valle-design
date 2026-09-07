# ADR-0017: Spike medido de kernel 3D exacto (manifold-3d vs opencascade.js)

- Estado: aceptado — el spike se cierra y fija un candidato preferente y una
  condición de reapertura. **No autoriza ninguna integración.** Integrar es un
  trabajo aparte, con su propia ADR y el gate de ADR-0003 completo.
- Fecha: 2026-09-07

## Contexto

ADR-0016 dejó el 3D exacto (caras curvas verdaderas, NURBS analítico,
intersección superficie-superficie) declarado **«todavía no»**, con una
condición de reapertura explícita: «se reconsidera el 3D exacto cuando exista
demanda medida y nombrada [...] y no antes». Esta ADR no activa esa condición
— nadie la ha nombrado todavía — sino que responde una pregunta previa y más
barata: **si algún día se nombra, ¿hay que escribir un kernel geométrico
exacto desde cero, o existe algo libre que se pueda medir hoy?** Escribir un
kernel B-rep NURBS propio con SSI (intersección superficie-superficie) tarda
años; evaluar dos candidatos libres compilables a WASM tarda una tarde. Esa
diferencia de costo es la que justifica este spike incluso sin demanda
nombrada todavía: cuando la condición de ADR-0016 se cumpla, la pregunta de
«¿con qué?» ya está contestada con cifras, no con una promesa de vendor.

`AGENTS.md` (sección «Native/WASM entry gate») y ADR-0003 exigen, para
cualquier EXTENSIÓN del kernel nativo: perfilado que identifique un cuello de
botella real, benchmark antes/después con hardware y navegador declarados,
mejora material (no una micro-medición favorable), paridad diferencial,
límites de memoria, fallback funcional, toolchain pineado y build
reproducible, y revisión de licencias/SBOM. Este spike **no cumple ese gate**
— no hay integración que perfilar todavía, ni fallback, ni paridad con nada
existente — y no pretende cumplirlo. Lo que entrega es la mitad que sí se
puede hacer sin tocar producto: medir de verdad los dos candidatos con los que
ese gate tendría que lidiar el día que alguien lo invoque.

## Metodología

Todo el trabajo vive fuera del repositorio, en `/tmp/kernel-spike-20260907/`
(`npm init -y`, `npm install manifold-3d`, `npm install opencascade.js`, sin
tocar `package.json` ni `package-lock.json` del producto). Hardware: contenedor
Linux x86_64, 4 vCPU, 15 GiB RAM, Node.js v22.22.2, sin GPU. **Esto es Node,
no navegador** — es la limitación honesta de este spike: no hay Chromium
disponible en este entorno para medir dentro de un Worker real. Los tiempos de
ejecución de booleana (cómputo puro de CPU) trasladan razonablemente porque V8
es el mismo motor; el tiempo de **descarga de red** del binario de 63 MB de
opencascade.js **no se midió** — no hay forma honesta de simularlo sin una
conexión real — y se trata por separado más abajo con cifras de referencia,
no como medición propia.

Caso de prueba idéntico para ambos kernels: dos cajas de 10×10×10 que se
traslapan 4 unidades en X (caja A de (0,0,0) a (10,10,10), caja B de (6,0,0) a
(16,10,10)). Volumen exacto conocido por geometría elemental: unión = 1600,
resta = 600, intersección = 400. Caso adicional con un cilindro (r=5, h=10),
volumen exacto = π·r²·h = 785.398163397448. 20 repeticiones por operación tras
1 de calentamiento; se reporta media/mediana/mín/máx. `manifold-3d` evalúa las
booleanas de forma perezosa (el costo real sólo se paga al consultar una
propiedad derivada); la medición fuerza esa evaluación con `.volume()` dentro
de la ventana cronometrada para no reportar un número falso.

`opencascade.js@1.1.1` envuelve OCCT `V7_4_0p1` y no publica tipos TypeScript;
las firmas de cada símbolo embind (sufijo `_N` por sobrecarga — p. ej.
`BRepPrimAPI_MakeBox_3(gp_Pnt, gp_Pnt)`) se verificaron por prueba y error
contra los propios mensajes de la biblioteca («invalid number of parameters»),
no se adivinaron ni se copiaron de un tutorial. La API es anterior al
`Message_ProgressRange` (no existe esa clase en este build): `BRepAlgoAPI_Cut`/
`Fuse`/`Common` usan constructor por defecto + `SetArguments`/`SetTools` +
`Build()` sin argumentos.

`dist/opencascade.wasm.js` se publica como ESM crudo pensado para un bundler
(webpack + `file-loader`, según su propio README) y Node plano no puede
`require()`lo tal cual. Para medir sin bundler y sin falsear nada se generó un
shim **idéntico byte a byte** salvo la última línea (`export default
opencascade;` → `module.exports = opencascade;`); el binario `.wasm` cargado
es el artefacto publicado en npm, sin modificar un solo byte.

Scripts reales usados (quedan en el scratch, que se elimina al cerrar este
spike — ver «Limpieza» al final):

- `/tmp/kernel-spike-20260907/bench-manifold.mjs`
- `/tmp/kernel-spike-20260907/bench-occt.cjs`
- `/tmp/kernel-spike-20260907/occt-cjs-shim.js`
- `/tmp/kernel-spike-20260907/result-manifold.json`
- `/tmp/kernel-spike-20260907/result-occt.json`

## Alternativas medidas

| Criterio | manifold-3d 3.5.1 | opencascade.js 1.1.1 (OCCT V7_4_0p1) |
| --- | --- | --- |
| Representación | Malla + predicados exactos sobre esa malla (la malla en sí ya aproxima toda superficie curva) | B-rep NURBS real; caras curvas analíticas |
| `.wasm` real servido al navegador | 541,470 B (0.516 MB) | 65,864,037 B (62.81 MB) — **121.6× más grande** |
| JS glue | 74,762 B | 330,809 B |
| Total artefacto runtime | 616,232 B (0.588 MB) | 66,194,846 B (63.13 MB) — **107.4× más grande** |
| Init (Node, disco caliente, media de 3 corridas: manifold 23.5/23.6/24.4 ms; occt 1438.7/1393.5/1313.1 ms) | ~24 ms | ~1,382 ms (1.4 s) — **~57× más lento**, y **no incluye** la descarga de red del binario (ver nota abajo) |
| Booleana representativa — resta, mediana de 20 reps (cajas 10×10×10, traslape 4) | 0.281 ms (`subtract`) | 56.58 ms (`cut`) — **~201× más lento** |
| Booleana — unión, mediana | 0.387 ms (`union`) | 62.15 ms (`fuse`) — **~161× más lento** |
| Booleana — intersección, mediana | 0.253 ms (`intersect`) | 55.10 ms (`common`) — **~218× más lento** |
| Exactitud — booleana de cajas | error absoluto = 0 (predicado exacto sobre la malla de entrada, sin aproximación adicional) | error absoluto ≈ 1.1×10⁻¹³ (ruido de punto flotante `double`, no error de método) |
| Exactitud — cilindro (superficie curva) | error relativo = **0.1606%** (limitado por teselado a 64 segmentos; es el mismo tipo de límite que ya tiene el B-rep facetado de Valle Design, ADR-0016) | error relativo ≈ **1.45×10⁻¹⁴ %** — cara cilíndrica analítica real, `BRepGProp` integra sin discretizar |
| STEP/IGES nativos | No — sólo malla (OBJ, GLB, 3MF, etc.); no hay B-rep NURBS que exportar | Sí, nativo (motor STEP/IGES de OCCT, el mismo estándar que ya soporta el B-rep facetado propio de Valle Design) |
| Licencia declarada (verificada leyendo `LICENSE` + `package.json`, no asumida) | **Apache-2.0** — el enunciado de este spike decía «MIT»; es incorrecto, corregido aquí con el archivo real | `LGPL-2.1-only` (núcleo OCCT) + «Open CASCADE Exception 1.0» (aplica río arriba, **no viene incluida en el paquete npm** — ver sección de licencia) |
| Bucket en `scripts/check-dependency-licenses.mjs` (este repo) | `ALLOWED` — pasa el gate sin proceso nuevo | `REVIEW_PREFIXES` (`LGPL*`) — el propio script ya declara que esto **no se aprueba en automático**, requiere decisión humana |

La corrección de licencia (Apache-2.0, no MIT) es en sí un hallazgo del spike:
el enunciado original asumía MIT sin verificar, exactamente el tipo de dato
que este ejercicio existe para no dar por sentado.

## Veredicto

**manifold-3d es el candidato preferente si algún día se activa la condición
de reapertura de ADR-0016**, con esta salvedad explícita: manifold-3d no
resuelve por sí solo el «todavía no» de ADR-0016, porque sigue siendo una
representación de malla. Lo que resuelve es la mitad de exactitud que sí
importa para booleanas — predicados robustos sin fallos de coincidencia
numérica en las intersecciones, que es la clase de bug que un CSG-BSP casero
sufre — a una fracción del costo de tamaño, carga y cómputo de OCCT, bajo una
licencia que ya pasa el gate del repo sin proceso nuevo. Si la demanda nombrada
que reabra ADR-0016 es «las booleanas fallan/se ven mal en casos degenerados»,
manifold-3d la ataca. Si la demanda nombrada es «un cliente/receptor STEP
rechaza la faceta porque necesita superficie NURBS real» — el escenario que
ADR-0016 nombra literalmente como condición de reapertura — **sólo
opencascade.js la resuelve**, porque manifold-3d no tiene ni lee ni escribe
B-rep NURBS.

Es decir: son candidatos para problemas distintos, no intercambiables.

- **Si la reapertura es por robustez/calidad de booleanas en malla**: manifold-3d,
  sin duda razonable — 0.6 MB, 24 ms de init, booleanas sub-milisegundo,
  Apache-2.0 sin fricción legal. La inversión de integración (semanas, no años)
  se paga a sí misma rápido.
- **Si la reapertura es por STEP/IGES/NURBS reales**: opencascade.js es la única
  opción libre con esa capacidad, pero entra con una factura que hay que mirar
  con los ojos abiertos: 63 MB de WASM (cargarlo en cada sesión de estudio de
  un usuario con conexión mala es un costo de producto real, no sólo técnico),
  ~1.4 s de instanciación en servidor sin contar la descarga, booleanas
  ~150-220× más lentas para el caso trivial medido aquí (una geometría real de
  producción con miles de caras sería más lenta todavía, no se midió), y una
  licencia que el propio gate de este repositorio manda a revisión legal
  explícita, no a aprobación automática.

**Ninguno de los dos se integra en este cambio.** Este spike cierra la
pregunta de «¿hace falta escribir un kernel exacto desde cero?» con un no
rotundo — ambos son production-grade, mantenidos, y compilan a WASM hoy — y deja
un mapa de costos real para el día que ADR-0016 se reabra.

## Sección de licencia (OCCT / LGPL-2.1 + Open CASCADE Exception) — obligatoria

Esta sección existe porque `scripts/check-dependency-licenses.mjs` ya declara,
en su propio comentario de política, que LGPL «no se bloquea automáticamente»
pero que «sus obligaciones dependen de la modalidad de enlace (dinámico vs
estático) [...] borrarla por reflejo sería tan irresponsable como ignorarla».
Este spike hace esa tarea, no la esquiva.

**Qué es realmente la licencia.** OCCT (el núcleo C++ que opencascade.js
compila) se licencia río arriba bajo GNU LGPL v2.1 **más** la «Open CASCADE
Exception 1.0». El paquete npm `opencascade.js@1.1.1` sólo incluye el texto
LGPL-2.1 estándar en su `LICENSE` (verificado: `grep -i exception` sobre ese
archivo no encuentra la excepción de Open CASCADE, sólo las cláusulas de
excepción genéricas que ya trae la LGPL en su §6). El texto de la excepción,
obtenido directamente del repositorio oficial de OCCT
(`Open-Cascade-SAS/OCCT`, archivo `OCCT_LGPL_EXCEPTION.txt`), dice:

> «El código objeto (es decir, no fuente) de un "work that uses the Library"
> puede incorporar material de un archivo de cabecera que es parte de la
> Library. Como excepción especial a la GNU LGPL v2.1, puede distribuir ese
> código objeto que incorpora material de archivos de cabecera de las
> bibliotecas Open CASCADE Technology bajo los términos que elija, siempre que
> dé un aviso prominente en la documentación de soporte de que ese código usa
> o está basado en funcionalidades provistas por Open CASCADE Technology.»

Esta excepción es **estrecha**: sólo cubre el código objeto derivado de
inlines/plantillas de cabecera (típicamente el pegamento embind que
opencascade.js autogenera), y sólo a cambio de un aviso prominente — no
elimina ninguna obligación de la LGPL sobre el propio cuerpo compilado de
OCCT que queda embebido en `opencascade.wasm.wasm`.

**Qué exige el relinking dinámico en un producto propietario servido como web
app.** LGPL v2.1 §6 aplica cuando se combina («enlaza») la Library con código
propietario para formar un programa. Exige permitir al usuario modificar la
Library y depurarla, y satisfacer UNA de cuatro vías: (a) acompañar el trabajo
con el código fuente completo de la Library más los cambios usados, en forma
apta para re-enlazar; (b) usar un mecanismo de biblioteca compartida que
permita al usuario sustituir la Library por una versión modificada compatible
(enlace dinámico verdadero); (c) una oferta escrita, válida al menos 3 años, de
proveer esos materiales a cualquier tercero; o (d) verificar que el
destinatario ya los tiene. **El WASM de opencascade.js es un único binario
monolítico compilado por Emscripten — no hay mecanismo de biblioteca
compartida real (no usa `dylink` de WASM) — así que la vía (b) no está
disponible tal como se distribuye hoy.** Eso deja únicamente (a)/(c)/(d): hacer
disponible, de forma accesible para quien recibe el binario, el código fuente
exacto de OCCT y los parches de build usados para producirlo, en forma
suficiente para recompilar. Como OCCT es público en GitHub y el propio
`opencascade.js` publica su `Dockerfile`/`make.py`/`patches/` también en
público, la obligación es satisfacible — pero exige que Valle Design **fije y
publique de forma alcanzable por el usuario final** el commit exacto de OCCT y
el conjunto de parches usados para el binario que sirve, con el mismo espíritu
de pineo reproducible que ADR-0003 ya exige para el toolchain Rust. No basta
con «está en GitHub en algún lado»: la obligación es hacia quien recibió el
binario, no hacia quien puede leer un repositorio privado.

**Qué avisos hay que incluir.** `NOTICE` y `THIRD_PARTY_NOTICES.md` ya
existen en este repositorio y ya declaran el patrón correcto (SBOM +
allowlist + avisos de fuentes OFL) para dependencias permisivas. Para OCCT
haría falta añadir, en ese mismo patrón: el texto LGPL-2.1 completo, el aviso
de copyright de OCCT, y el texto verbatim de la «Open CASCADE Exception 1.0»
citado arriba — que hoy **no existe en ningún archivo de este repositorio ni
en el paquete npm**, habría que traerlo de la fuente oficial de OCCT. Además,
por la excepción misma, el pegamento embind que usa Valle Design necesita «un
aviso prominente [...] de que usa o está basado en» OCCT — una frase concreta,
no una mención genérica en una lista de dependencias.

**Qué implica «distribuir» cuando el WASM se sirve desde un CDN al navegador
del cliente.** La LGPL v2.1 es anterior a la era de red y no tiene la cláusula
de «uso en red» de la AGPL — interactuar con un programa que corre en un
servidor ajeno no es «distribución» bajo LGPL/GPLv2 (es el «agujero ASP» que
la AGPL existe para cerrar). **Pero este no es ese caso**: cuando el navegador
descarga `opencascade.wasm.wasm` desde un CDN, un copia del código objeto
compilado de OCCT viaja a la máquina del cliente y se **ejecuta ahí**, no en
un servidor de Valle Design. Eso es funcionalmente idéntico a distribuir una
DLL compilada a cada cliente — es «conveying» de una copia en forma binaria a
cada destinatario individual, no interacción de red con un servicio. La
consecuencia práctica es que la obligación de aviso/fuente/re-enlace se activa
**por cada visitante anónimo del navegador**, no sólo hacia quien tenga acceso
al repositorio privado del producto. Un `THIRD_PARTY_NOTICES.md` que sólo vive
en un repo privado (que es exactamente el patrón que usa hoy este repositorio
para OFL/MIT/Apache, y que es correcto para esas licencias) **no alcanza** para
LGPL en este escenario: haría falta una superficie de avisos legales
alcanzable desde el propio producto en producción — una página «Avisos
legales» pública, no un archivo Markdown en un repo al que el usuario final
nunca tiene acceso.

**Contraste con manifold-3d.** Apache-2.0 no tiene obligación de copyleft ni
de re-enlace: preservar avisos de copyright/`NOTICE` (si el proyecto upstream
trae uno) y una concesión de patentes defensiva. Cero superficie legal nueva:
el pipeline existente de `npm run sbom && npm run check:licenses` ya lo cubre,
y el bucket `ALLOWED` del script de licencias lo confirma sin intervención
humana.

**Conclusión de esta sección**: la obligación LGPL+excepción de OCCT es
satisfacible, no es un bloqueo automático (por algo el script del repo la
manda a revisión, no a la lista bloqueada) — pero exige trabajo de producto
real (una página de avisos pública, un pineo de fuente reproducible) que hoy
no existe en ningún lado del repositorio, y una revisión legal humana explícita
antes de servir ese WASM a un solo usuario de producción. Eso no es un
detalle de trámite: es una de las dos razones (junto al tamaño/latencia) por
las que este spike no recomienda opencascade.js como primer movimiento si la
reapertura de ADR-0016 llega antes por el lado de robustez de booleanas que
por el lado de NURBS/STEP real.

## Bandera propuesta: `EXACT_KERNEL` (para integración futura, NO hecha aquí)

Si ADR-0016 se reabre, la integración —cuando exista, con su propia ADR y el
gate completo de ADR-0003— debería entrar detrás de una bandera:

- `EXACT_KERNEL=off` (default) — el B-rep facetado de `apps/web/src/lib/brep/`
  sigue siendo el único kernel geométrico, sin cambio de comportamiento.
- `EXACT_KERNEL=manifold` — booleanas de malla robustas (predicados exactos)
  como *motor alterno* detrás de la misma interfaz `solid3d`, con fallback al
  BSP-CSG actual si el WASM falla o no está disponible; no reemplaza el
  documento canónico ni introduce un segundo formato (ADR-0003 lo prohíbe).
- `EXACT_KERNEL=occt` — B-rep NURBS real para import/export STEP/IGES de alta
  fidelidad y booleanas exactas sobre superficie analítica, con la superficie
  legal de avisos públicos resuelta ANTES de activarla en producción, no
  después.

Cualquiera de las dos requiere, sin excepción, los ocho puntos del gate de
ADR-0003 (perfilado real, benchmark con hardware/navegador declarados, mejora
material, paridad diferencial, límites de memoria, fallback funcional,
toolchain pineado y reproducible, SBOM/licencias) más la condición de
reapertura de ADR-0016 nombrada y medida. Este spike no cumple ese gate y no
lo intenta: sólo dice qué costaría cada opción si algún día hay que cumplirlo.

## Limpieza del scratch

`/tmp/kernel-spike-20260907/` pesaba 137 MB en disco al cerrar este spike (la
mayor parte, 64 MB de `node_modules/opencascade.js` más ~46 MB de
dependencias transitorias de la CLI de manifold-3d — `sharp`, `esbuild-wasm`,
`@gltf-transform/*` — que no forman parte del artefacto que un bundle de
navegador cargaría, sólo de las herramientas de línea de comandos de esos
paquetes). Se elimina al cerrar este cambio; el repositorio real no lo
contiene en ningún momento.

## Consecuencias

- La pregunta «¿hay que escribir un kernel exacto desde cero?» queda
  contestada: no, hay dos opciones libres de calidad de producción,
  compilables a WASM, con costos y licencias medidos, no supuestos.
- Ningún código de producto cambia en este ADR. `EXACT_KERNEL` no existe
  todavía en ningún flag store del repositorio; se documenta como diseño
  futuro, no como trabajo pendiente de este cambio.
- La condición de reapertura de ADR-0016 sigue siendo la misma y sigue sin
  cumplirse: nadie ha nombrado todavía un cliente que rechace el producto por
  la faceta ni un receptor STEP que rechace el intercambio actual.
- Si esa condición se cumple, este ADR reduce el trabajo de decisión de meses
  (evaluar candidatos) a días (leer esta tabla y decidir cuál de los dos
  problemas es el que realmente se nombró).
- La corrección de licencia de manifold-3d (Apache-2.0, no MIT) debe
  propagarse a cualquier material de venta o comparativo que ya haya asumido
  MIT, si existiera.

## Alternativas rechazadas

- **Integrar cualquiera de los dos candidatos ya**, aprovechando que ya están
  medidos. Rechazado: no hay demanda nombrada que active la condición de
  reapertura de ADR-0016, y ninguno de los dos pasó el gate de ocho puntos de
  ADR-0003 (no hay perfilado de un cuello de botella real, ni paridad, ni
  fallback, ni revisión legal humana consumada — sólo insumos para esa
  revisión).
- **Escribir un kernel B-rep NURBS propio con SSI en Rust/WASM.** Es la
  inversión de años que este spike existe para evitar mientras no haga falta;
  sigue disponible como opción de largo plazo si algún día ninguna biblioteca
  libre cubre una necesidad muy específica del producto.
- **Aceptar la licencia de opencascade.js sin la sección legal detallada.**
  El enunciado de esta tarea la exige explícitamente y el propio gate de
  licencias del repositorio la manda a revisión humana, no a aprobación
  automática; una ADR que la esquivara no serviría para decidir nada.
- **Confiar en el `LICENSE` incluido en el paquete npm de opencascade.js como
  fuente completa de los términos.** Se verificó que NO incluye el texto de
  la «Open CASCADE Exception 1.0» que sí aplica río arriba; usar sólo ese
  archivo habría producido una sección legal incompleta.
