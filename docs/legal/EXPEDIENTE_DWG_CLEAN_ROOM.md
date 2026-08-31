# Expediente para el dictamen jurídico externo — códec DWG propio

- **Fecha**: 2026-08-31
- **Titular**: Sergio Valle Zárate (@sergiovalle3121)
- **Para**: el despacho o abogado que emita el dictamen que ADR-0004 y
  ADR-0007 exigen **antes** de cualquier disponibilidad comercial del DWG
- **Estado del gate que este expediente sirve**: `legalReviewCleared: false`
  en `apps/web/src/lib/cad/dwg-interop-flag.ts`. Ningún avance de ingeniería
  lo mueve; sólo el dictamen.

Este documento reúne los hechos verificables para que quien dictamine no tenga
que leer código. **No es una opinión jurídica ni pretende anticiparla**: es el
expediente de procedencia. Cada afirmación de aquí se puede comprobar contra
un artefacto del repositorio, y donde algo no está probado se dice.

---

## 1. Qué se construyó, en una frase

Una implementación **original**, en TypeScript, que lee y escribe archivos del
formato DWG, escrita sin usar ni consultar ninguna implementación ajena del
formato, para que un producto CAD propio pueda interoperar con los archivos de
sus clientes.

Lo que **no** se hizo, y consta por diseño y por gate automatizado:

- No se copió, tradujo, portó ni adaptó código, headers, bindings, tablas
  generadas, comentarios ni tests de Autodesk, ODA (Open Design Alliance),
  RealDWG, LibreDWG ni ningún otro codec.
- No se descompiló ningún binario, no se eludió ninguna protección técnica y
  no se usó material filtrado.
- No se contrató ni se integró ningún SDK comercial de terceros. La decisión
  de no hacerlo es explícita y está fechada (ADR-0014, 2026-08-24).
- El paquete tiene **cero dependencias en tiempo de ejecución**.

## 2. Procedencia: las nueve fuentes, una por una

El registro vive en `packages/dwg-codec/SOURCE_REGISTER.json` y un gate
automatizado (`npm run check:provenance`) falla si un archivo del paquete no
está cubierto por una fuente `allowed`. Hoy: **9/9 fuentes permitidas cubren
147 archivos del paquete y 21 fixtures**.

| Fuente | Tipo | Qué aportó |
| --- | --- | --- |
| `VALLE-OWNER-DWG0-2026-08-09` | Directiva del titular | La autorización de trabajo y sus límites de ingeniería (95 archivos derivados) |
| `VALLE-REPO-BASE-C792F938` | Repositorio propio | Arquitectura y frontera DWG preexistentes (10) |
| `VALLE-REPO-BASE-8BE49A55` | Repositorio propio | Espacio de trabajo, CI y frontera de producto (36) |
| **`ODA-ODS-DWG-5.4.1-PUBLIC`** | **Documentación pública** | **Hechos técnicos del formato (54)** — ver §3 |
| `VALLE-CORPUS-AC1015-INTAKE-DAE5E77` | Medición propia | Observaciones de bytes sobre el corpus propio (18) |
| `VALLE-CORPUS-INTAKE-A60EBE2` | Medición propia | Observaciones de bytes sobre el corpus propio (19) |
| `VALLE-CORPUS-R2010-OBJECT-HEADER` | Medición propia | Estructura del encabezado de objeto moderno (6) |
| `AJV-8.20.0-OFFICIAL` | Paquete MIT | Sólo herramienta de desarrollo, no runtime (3) |
| `AJV-FORMATS-3.0.1-OFFICIAL` | Paquete MIT | Sólo herramienta de desarrollo, no runtime (3) |

**Fuentes de código ajeno: ninguna.** Las únicas fuentes externas al titular
son un documento de especificación y dos paquetes MIT de desarrollo.

## 3. La distinción que sostiene el caso técnico

Es la parte sobre la que conviene que el dictamen se pronuncie, así que se
expone sin adornos.

### 3.1 Especificación consultada, implementación jamás consultada

La única fuente documental externa sobre el formato es la **Open Design
Specification for .dwg files, versión 5.4.1**, descargada del sitio oficial de
ODA (sección de descargas para invitados) el 2026-08-14. Sus términos, tal
como se registraron: *«facts only, no redistribution»*.

De ella se extrajeron **hechos técnicos mínimos y enumerados** —anchos de
campo, órdenes de bytes, polinomios de CRC, secuencias de secciones, valores
de centinela— que están listados uno a uno en el registro. **No se copió el
documento**, no está en el repositorio, y no se reprodujo prosa ni tablas
extensas de él. La implementación es original.

Lo que **no** se consultó, en ningún momento y por regla escrita: el código
fuente del ODA SDK, de RealDWG, de LibreDWG o de cualquier otro codec.

### 3.2 Binario ejecutado como oráculo, nunca inspeccionado

Para comprobar que los archivos escritos son válidos se ejecuta **ODA File
Converter 27.1** como caja negra: se le pasa un archivo y se mira si lo acepta
y qué produce. Su código no se inspecciona, no se descompila y no se enlaza.
El programa no forma parte del producto ni de sus dependencias; sus bytes
nunca entran al repositorio.

Un hecho observado que consta tal cual en `docs/TOOLS.md` del repositorio de
conformidad, sin interpretarlo: **la página de descarga no publica términos de
licencia y el instalador MSI no incorpora texto de EULA** (se inspeccionó su
tabla `Binary`: sólo contiene mapas de bits). Se archiva el hecho, no una
conclusión sobre él. Es una de las preguntas de §6.

### 3.3 Medición propia sobre archivos propios

Tres de las nueve fuentes son mediciones del titular sobre sus **propios**
archivos. La más reciente (2026-08-31) resolvió por medición una estructura
del formato que antes se creía imposible de derivar sin consultar una
implementación ajena — y la resolvió **sin consultar ninguna**, comparando
ocho dibujos de autoría propia convertidos a cinco versiones distintas del
formato. Es el caso que mejor ilustra el método: la respuesta salió de los
archivos del propio titular, no de la obra de nadie.

## 4. Cadena de custodia del corpus

Los archivos DWG contra los que se prueba el códec viven en un repositorio
separado, `valle-design-dwg-conformance`, con su propia política
(`CORPUS_POLICY.md`).

- **Origen**: 100 % de autoría propia. Son dibujos DXF que el titular generó
  con scripts propios y convirtió a DWG con la herramienta de §3.2. Ni un solo
  archivo procede de un cliente, de una instalación de AutoCAD, de Internet ni
  de un tercero. Origen declarado por bundle: `tool-converted-original`.
- **Prohibiciones explícitas y con gate**: planos de clientes, ejemplos
  instalados con software de terceros, archivos encontrados al azar, material
  con licencia GPL/AGPL/LGPL/MPL/SSPL/BUSL o source-available, secretos, datos
  personales.
- **Aserción de esquema**: cada manifiesto declara `containsClientData: false`
  como constante del esquema, no como campo rellenable.
- **Integridad**: cadena de SHA-256 en tres niveles (índice → manifiesto →
  cada archivo), commit fijado y verificado por el consumidor, e inventario
  bidireccional que rechaza tanto un archivo sin manifestar como un manifiesto
  sin archivo.
- **Atestaciones**: los acuerdos firmados se guardan **fuera** del repositorio
  y sólo se referencian (`attestationRef`).
- **Donaciones de terceros**: existe el procedimiento (`docs/DONACIONES.md`)
  con su texto mínimo de permiso escrito. **Hoy hay cero donaciones**: ningún
  archivo de un tercero ha entrado nunca.

## 5. Lo que deliberadamente NO se hace

- **TrustedDWG**: el escritor **no emite ni imita** el sello de Autodesk.
  Consecuencia asumida: AutoCAD mostrará su aviso de «no TrustedDWG» al abrir
  un archivo escrito por este códec. Es el comportamiento correcto y se
  documentará al usuario, no se ocultará.
- **Marcas ajenas**: no se afirma certificación, afiliación, paridad ni
  compatibilidad total. «DWG» y «AutoCAD» son marcas de Autodesk y así se
  declara en el sitio.
- **Afirmaciones de compatibilidad**: hay un gate automatizado
  (`dwg-surface-honesty.spec.ts`) que **rompe el build** si una superficie
  pública menciona DWG sin declarar su límite en la misma frase. Hoy el
  producto dice que **no** abre DWG, porque la capacidad está apagada.
- **Disponibilidad comercial**: `productionAvailable: false`. Las banderas de
  importación nacen apagadas y son condición *necesaria y no suficiente*: aun
  encendidas a mano, el gate sigue cerrado mientras los hechos que declara
  sean falsos — y `legalReviewCleared` es uno de ellos.

## 6. Preguntas concretas al dictamen

No se pide una bendición general. Se piden cuatro respuestas:

1. **Suficiencia del clean-room documentado.** ¿El procedimiento de §2-§3
   —registro de fuente previo a derivar, extracción de hechos enumerados,
   implementación original, cero consulta de implementaciones ajenas— es
   suficiente para sostener que el códec es obra original y no derivada? ¿Qué
   faltaría documentar?

2. **Uso de la especificación bajo sus términos.** Extraer hechos técnicos
   mínimos de la Open Design Specification 5.4.1, descargada públicamente bajo
   «facts only, no redistribution», sin redistribuir el documento y sin copiar
   su prosa: ¿es un uso conforme a esos términos y a la legislación aplicable
   (México, y los mercados a los que se venda)?

3. **Ejecución del conversor sin EULA publicada.** Ejecutar localmente ODA
   File Converter como oráculo de validación sobre archivos propios, sin
   inspeccionarlo ni enlazarlo, cuando **su página de descarga no publica
   términos y su instalador no incorpora EULA** (§3.2): ¿qué riesgo real
   existe y cómo conviene mitigarlo? ¿Debe buscarse un segundo validador
   independiente antes de vender?

4. **Redacción comercial admisible.** ¿Qué se puede afirmar en el sitio, en la
   UI y en un contrato sobre la capacidad DWG, y qué no? En particular: cómo
   describir la compatibilidad por versión y por entidad sin inducir a error,
   y cómo presentar el aviso de «no TrustedDWG» de AutoCAD.

## 7. Riesgos declarados, sin suavizar

Se enumeran aquí para que el dictamen los tenga delante, no para minimizarlos.

1. **Un solo oráculo externo.** Toda la verificación de interoperabilidad pasa
   por ODA File Converter. No existe una segunda implementación independiente
   que confirme los resultados.
2. **Nunca verificado contra AutoCAD real.** No se ha abierto un archivo
   escrito por este códec en AutoCAD. La política propia prohíbe, por eso
   mismo, la frase «compatible con AutoCAD».
3. **Corpus sintético de un único productor.** 57 archivos, 25 dibujos
   distintos, todos generados por el titular y convertidos por la misma
   herramienta. La evidencia demuestra compatibilidad con lo que ese corpus
   ejercita — no con cualquier DWG del mundo real (objetos proxy, verticales
   AEC, objetos personalizados de terceros).
4. **El oráculo corre en una sola máquina.** La del titular. Mientras siga
   así, el corpus no se regenera en integración continua.
5. **Un solo revisor humano** para el origen `tool-converted-original`, por
   enmienda firmada del 2026-08-20. La propia enmienda declara el riesgo
   asumido: no hay una segunda persona que pueda vetar un error de derechos
   del titular.
6. **Cobertura parcial del formato.** El códec lee dos versiones de forma
   completa (R2000 y R2004) y escribe una (R2000) con siete tipos de entidad.
   Las versiones modernas (2010/2013/2018) abren su contenedor y su encabezado
   de objeto, pero no su cuerpo. Nada de esto está disponible en el producto.

---

## Anexo — Dónde comprobar cada afirmación

| Afirmación | Artefacto |
| --- | --- |
| Registro de fuentes y hechos | `packages/dwg-codec/SOURCE_REGISTER.json` |
| Gate que exige cobertura de procedencia | `npm run check:provenance` |
| Política clean-room operativa | `packages/dwg-codec/CLEAN_ROOM_POLICY.md` |
| Decisiones fechadas y firmadas | `docs/adr/0004`, `0007`, `0009`, `0012`, `0014`, `0015` |
| Matriz de capacidades y sus límites | `packages/dwg-codec/CAPABILITIES.md` |
| Política y custodia del corpus | `valle-design-dwg-conformance/CORPUS_POLICY.md` |
| Registro de la herramienta oráculo | `valle-design-dwg-conformance/docs/TOOLS.md` |
| Procedimiento de donación | `valle-design-dwg-conformance/docs/DONACIONES.md` |
| Gate de honestidad de la superficie pública | `apps/web/src/lib/cad/verification/dwg-surface-honesty.spec.ts` |
| Estado de los gates de promoción | `apps/web/src/lib/cad/dwg-interop-flag.ts` |
| Evidencia medida | `docs/cad/evidence/dwg-*.json` |
