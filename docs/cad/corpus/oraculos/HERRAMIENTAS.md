# Registro de herramientas — los oráculos de este corpus

El mismo registro que `docs/TOOLS.md` del repositorio de conformidad
(`valle-design-dwg-conformance`) exige para el origen `tool-converted-original`,
aplicado aquí a las herramientas que **leen** en vez de convertir. Cada entrada
archiva **hechos observados y verificables**; donde una herramienta no publica
términos, este registro lo dice tal cual — no se inventan términos ni se
parafrasean licencias que no existen.

Lo que este archivo NO es: una lista de deseos. Una herramienta sólo entra aquí
después de haberse ejecutado en una máquina declarada y de haber producido un
artefacto. Las que se intentaron y no entraron están en la segunda mitad, con su
comando y su salida real.

El censo ejecutable de todo esto vive en
`docs/cad/evidence/oraculos-externos-disponibilidad.json` y lo vigila
`apps/web/src/lib/cad/verification/oraculos-externos.spec.ts`, que **vuelve a
sondear la máquina en cada corrida**. La regla es de una sola dirección y
conviene leerla antes de nada:

> Una herramienta **admisible** declarada ausente que **aparece** pone la suite
> en rojo, porque un oráculo disponible y no usado es evidencia que se está
> dejando en la mesa. Una herramienta declarada presente que **falta** no la
> pone en rojo: se declara la ausencia y se usa su medición congelada, en vez de
> fingirla.

---

## ezdxf 1.4.4 <a id="ezdxf-1-4-4"></a>

- **Nombre:** ezdxf
- **Versión:** 1.4.4
- **Papel:** oráculo **B** del corpus de terceros. Segunda lectura independiente
  de los diecinueve DXF ajenos: ve HATCH, LEADER, VIEWPORT y estilos de cota
  donde el oráculo A (`dxf-parser`) es ciego, y declara el dialecto real de cada
  archivo.
- **Lenguaje:** Python 3.11 (paquete binario, ruedas `manylinux`)
- **Autor / titular:** Manfred Moitzi (`me@mozman.at`)
- **Licencia:** MIT
- **Texto de la licencia:** `licencias/ezdxf-1.4.4-MIT.txt`, 1 071 bytes
- **SHA-256 del texto de la licencia:**
  `db97ca426fc0d2b8124145de0f36181db73e6e713ce642d42fed2efc442edf19`
- **Aviso de copyright conservado:** `Copyright (c) 2020 Manfred Moitzi`
- **Origen:** PyPI — `pip install ezdxf==1.4.4`
- **Rueda instalada:**
  `ezdxf-1.4.4-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl`
- **SHA-256 de la rueda:**
  `7f75a4f2924ebdda0f5b2779ff2135ba92de2596c95a8fa9b1d9ebcabea1be41`
- **Tamaño de la rueda:** 5 794 671 bytes
- **Comprobación de procedencia (hecho observado, 2026-09-05):** el sha256 de la
  rueda descargada **coincide** con el digest que publica el índice en
  <https://pypi.org/pypi/ezdxf/1.4.4/json> para ese mismo nombre de fichero, con
  fecha de publicación `2026-05-14T09:27:09Z` y tamaño 5 794 671. Es la única
  comprobación de origen que esta sesión puede hacer sin firmas: se archiva
  diciendo exactamente lo que es.
- **Fecha de instalación:** 2026-09-04 (registro completado el 2026-09-05)
- **Estado de los términos:** publicados, permisivos y descargados. MIT autoriza
  usar, copiar y distribuir conservando el aviso de copyright, que viaja en
  `licencias/`. Los bytes de la herramienta **no** entran a este repositorio.
- **Uso autorizado:** ejecución local como **lector** de material ajeno y de lo
  que Valle exporta. Nunca como fuente de código: su implementación ni se
  consulta ni se copia.
- **Artefactos que produce:**
  - `ezdxf-1.4.4.json` — el censo de los diecinueve archivos en cuatro ámbitos.
  - `medidas-floorplan-ezdxf.json` — las medidas del plano ajeno y de lo que
    exportamos a partir de él.
  - `medidas-cuatro-filas-ezdxf.json` — las medidas por capacidad de los siete
    archivos que sirven a las cuatro suites por fila.
- **Cómo se regenera:** `python3 docs/cad/corpus/oraculos/censo-ezdxf.py`
  (acepta `--destino RUTA`, que es como el arnés lo reejecuta sin sobrescribir
  el artefacto contra el que compara).

## steputils 0.1 <a id="steputils-0-1"></a>

- **Nombre:** steputils
- **Versión:** 0.1
- **Papel:** oráculo **C** del modelador 3D. Lee el STEP (ISO 10303-21,
  AP203/AP214) que exporta `apps/web/src/lib/brep/step-export.ts`. Hasta el
  2026-09-05 el único lector que había leído nuestro STEP era el nuestro:
  `interop.spec.ts` compara volumen, área y género del sólido reimportado contra
  el original, lo cual está bien salvo por que lo escribe y lo lee la misma casa.
- **Lenguaje:** Python 3.11 (rueda pura)
- **Autor / titular:** Manfred Moitzi (`me@mozman.at`)
- **Licencia:** MIT
- **Texto de la licencia:** `licencias/steputils-0.1-MIT.txt`, 1 103 bytes
- **SHA-256 del texto de la licencia:**
  `2d07e6d2bbaec0adc374f2412fda27635cf6c6c1a8d6ff3a5c128785abb602f5`
- **Aviso de copyright conservado:** `Copyright (c) 2019, Manfred Moitzi`
- **Origen:** PyPI — `pip install steputils==0.1`
- **Rueda instalada:** `steputils-0.1-py3-none-any.whl`
- **SHA-256 de la rueda:**
  `8d3dd966b8778a6b5bcc6613414ba6adcd9948d313c67dec4feb328afcc2f582`
- **Tamaño de la rueda:** 93 330 bytes
- **Comprobación de procedencia (hecho observado, 2026-09-05):** el sha256 de la
  rueda descargada coincide con el digest publicado en
  <https://pypi.org/pypi/steputils/json> para `steputils-0.1-py3-none-any.whl`,
  publicada el `2022-03-29T03:56:45Z` con tamaño 93 330.
- **Fecha de instalación:** 2026-09-05
- **Estado de los términos:** publicados, permisivos y descargados.
- **Uso autorizado:** ejecución local como **lector** de lo que Valle exporta.
- **Artefacto que produce:** `steputils-0.1.json` — el recuento de entidades de
  la parte 21, los vértices, las longitudes de arista y los contornos por cara
  de los cinco sólidos que el spec exporta, cada uno anclado al sha256 de sus
  bytes.
- **Cómo se regenera** (el orden importa: el spec escribe los ficheros que el
  script lee):

  ```sh
  cd apps/web && npx tsx src/lib/cad/verification/oraculos-externos.spec.ts
  cd ../.. && python3 docs/cad/corpus/oraculos/censo-steputils.py
  ```

- **Los dos límites de esta herramienta, escritos antes de usarla:**
  1. **Mismo autor que `ezdxf`.** Contra el oráculo B no es un testigo
     independiente. Contra el producto sí lo es, que es lo que se le pide. Se
     eligió porque los lectores de STEP alternativos al alcance
     (`pythonocc-core`, `ifcopenshell`) son **LGPL**, y `CORPUS_POLICY.md` los
     prohíbe sin excepción.
  2. **Es un analizador, no un kernel.** Cuenta entidades y resuelve
     referencias; no reconstruye el sólido. Que lea nuestro STEP acredita que el
     fichero es parte 21 válida y que su topología cuadra —los cinco sólidos
     satisfacen Euler-Poincaré con los números que él mismo leyó—; **no**
     acredita que un CAD mecánico comercial lo abra.
  3. **Defecto propio observado:** `DataSection.__iter__` de steputils 0.1
     devuelve `odict_values` en Python 3.11, que no es un iterador, y revienta
     con `TypeError: iter() returned non-iterator of type 'odict_values'`. El
     censo lo esquiva recorriendo `instances.values()`. Un oráculo con defectos
     sirve mientras estén escritos; uno con defectos callados, no.

## dxf-parser 1.1.2 <a id="dxf-parser-1-1-2"></a>

- **Nombre:** dxf-parser
- **Versión:** 1.1.2
- **Papel:** oráculo **A** del corpus de terceros. Es el único de los tres que
  **corre en CI**, porque ya es dependencia declarada de `apps/web`.
- **Licencia:** MIT (GDS Storefront Estimating). El texto viaja en
  `docs/cad/corpus/licencias/gdsestimating-dxf-parser-MIT.txt`, hasheado en
  `manifest.json`.
- **Origen:** npm, a través de `package-lock.json`. Su sha512 lo fija el lockfile
  y por eso no se repite aquí: sería la misma cifra en dos sitios.
- **Límite que hay que decir siempre:** **comparte motor con el lector de
  producción** (`apps/web/src/lib/cad/dxf-import.ts` importa esta misma
  biblioteca). Contra él se mide la CONVERSIÓN, no el análisis; y cuando los dos
  rechazan el mismo fichero por el mismo sitio —como pasó con `blocks2.dxf` y
  `$XCLIPFRAME`— eso no es confirmación, es la prueba de que son el mismo. Por
  eso hacía falta el oráculo B.
- **Punto ciego medido:** no emite HATCH. Donde `ezdxf` cuenta sombreados, él
  cuenta cero.

---

# Lo que se intentó y no entró

Esta mitad importa tanto como la de arriba. Un registro que sólo listara lo que
funcionó dejaría al siguiente repitiendo los mismos intentos.

## ODA File Converter 27.1 — ausente, y su ausencia es de una persona

- **Estado:** no está en esta máquina. `command -v ODAFileConverter` → vacío.
- **Admisible:** **sí**. El repositorio de conformidad ya lo registra entero en
  su `docs/TOOLS.md` (versión, sha256 del MSI, origen y estado de términos
  observado: la página de descarga **no publica términos** y el MSI **no
  incorpora EULA**) y autoriza su ejecución local como conversor/validador. Por
  eso su aparición en esta máquina pondría la suite en **rojo**: habría que
  usarlo.
- **Intento, 2026-09-05:**

  ```console
  $ curl -sS -o /dev/null -w '%{http_code}' https://www.opendesign.com/guestfiles/oda_file_converter
  curl: (56) CONNECT tunnel failed, response 403
  http=000
  ```

- **Motivo por el que no entra, y no es la red:** la descarga exige registro y
  **aceptación de términos por una persona**. Un agente no acepta términos en
  nombre de nadie. Es trabajo del titular, y sus pasos ya están escritos y
  generados en `docs/cad/evidence/dwg-firma-encendido-20260904.md` §7.

## LibreDWG (`dwg2dxf` y familia) — descartada por licencia, no por falta de intento

- **Estado:** ninguno de sus diez binarios está en la máquina.
- **Admisible:** **no**. `CORPUS_POLICY.md`, «Material prohibido»: GPL, AGPL,
  LGPL, MPL, SSPL, BUSL y todo lo source-available quedan fuera **sin excepción
  y sin discusión**. LibreDWG es GPL-3.0-or-later.
- **Intento, 2026-09-05:**

  ```console
  $ apt-cache search libredwg
  (salida vacía, código 0)

  $ apt-get update -o Acquire::http::Timeout=6 -o Acquire::Retries=0
  Err: http://archive.ubuntu.com/ubuntu noble InRelease
    Connection failed [IP: 91.189.91.83 80]
  W: Failed to fetch https://ppa.launchpadcontent.net/... Invalid response from
     proxy: HTTP/1.1 403 Forbidden
  ```

- **Lo que eso significa:** el índice de paquetes de sistema no es alcanzable
  desde esta sesión (los registros de paquetes de lenguaje sí: PyPI responde), y
  además el paquete no existe para esta distribución — el frente DWG ya lo midió
  el 2026-09-04 con el índice presente y la búsqueda vacía.
- **La conclusión que cierra la cola:** aunque el binario llegara mañana, **la
  licencia lo excluye**. La petición «cablear un segundo oráculo binario
  `dwg2dxf`» no queda pendiente: queda **cerrada con motivo**. Lo que sigue
  abierto es tener un segundo validador de DWG, y ése tendría que ser otro
  binario con otra licencia.
- **Y una razón que no es de licencia**, ya escrita en
  `dwg-firma-encendido-20260904.md` §6: compilar el fuente en la máquina donde se
  escribe una reimplementación clean-room es la contaminación que ADR-0007 existe
  para evitar. Los oráculos valen **sólo como binarios**.

## IfcOpenShell — descartada dos veces

- **Estado:** ausente. `python3 -c "import ifcopenshell"` → `ModuleNotFoundError`.
- **Admisible:** **no**, y por dos motivos independientes:
  1. **LGPL-3.0-or-later** (clasificador publicado en PyPI, consultado el
     2026-09-05). Prohibida.
  2. **No hay superficie de producto contra la que sería oráculo.** Valle Design
     no emite ni consume IFC, y no lo pretende: modelar volúmenes no lo convierte
     en BIM, y `bim-claim-boundary.spec.ts` es el gate que lo sostiene. Un
     oráculo sin superficie no es un pendiente, es una confusión de alcance.

## pythonocc-core (OpenCASCADE) — el kernel que habría sido mejor

- **Estado:** ausente. `python3 -c "import OCC"` → `ModuleNotFoundError`.
- **Admisible:** **no**. LGPL-2.1 (OpenCASCADE Technology Public License).
- **Por qué se anota igualmente:** es la razón por la que el oráculo C es un
  analizador de la parte 21 y no un kernel. Con OCC, el STEP exportado se
  reconstruiría como sólido y se podría afirmar «otro kernel obtiene el mismo
  volumen». Con `steputils` sólo se puede afirmar «otro programa lee el fichero,
  cuenta la misma topología y ésta cierra por Euler-Poincaré». Es menos, y por
  eso está escrito como menos.

## Los veintiún binarios sondeados

`command -v` sobre los diez de LibreDWG (`dwgread`, `dwgwrite`, `dwg2dxf`,
`dxf2dwg`, `dwg2SVG`, `dwgbmp`, `dwggrep`, `dwglayers`, `dwgfilter`,
`dwgrewrite`), los dos de ODA (`ODAFileConverter`, `teigha`), `IfcConvert`,
`DRAWEXE`, `gmsh`, `FreeCAD`, `FreeCADCmd`, `qcad`, `librecad`, `blender` y
`openscad`. **Los veintiuno vuelven en blanco.** Diecinueve de ellos son además
inadmisibles por licencia, así que su aparición no crearía obligación alguna;
los dos de ODA sí, y por eso son los únicos cuyo `command -v` puede poner la
suite en rojo.

## Lo que este registro no dice

- No dice que estas herramientas sean AutoCAD, ni SolidWorks, ni CATIA. Ninguna
  afirmación derivada de aquí puede decir «compatible con AutoCAD».
- No dice que una herramienta presente **funcione**: eso lo dicen sus artefactos
  congelados y sus anclas de sha256, no este censo.
- No cubre el disco: `command -v` mide la ruta del proceso. Una herramienta
  instalada fuera del `PATH` no se ve, y en Windows el sondeo entero saldría en
  blanco.
