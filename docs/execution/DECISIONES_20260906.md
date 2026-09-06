# Registro de decisiones — 2026-09-06

Frente que escribe: **F10 · Evidencia independiente**. Formato de
`PROMPT_MAESTRO_FABLE.md` §3.4.2: una entrada por duda, escrita mientras se
decide, no al final.

## D-01 · Dónde vive el material GIS de terceros

Qué se dudó ...... Si el shapefile de Natural Earth podía vivir dentro de
                    `docs/cad/corpus/terceros/` (junto al corpus DXF) o
                    necesitaba su propio árbol.
Qué se eligió ..... Su propio árbol: `docs/cad/corpus/terceros-gis/`, hermano
                    de `terceros/`, nunca subdirectorio suyo.
Por qué es lo conservador ...... La primera vez que se puso ahí,
                    `dxf-corpus-terceros.spec.ts` (que recorre TODO
                    `terceros/` exigiendo que cada archivo esté en
                    `manifest.json`, el manifiesto DXF) lo marcó como archivo
                    sin declarar y rompió la suite completa —lo confirmó
                    `npx turbo run test --filter=web`, 629/630—. Compartir un
                    árbol entre dos manifiestos de dos familias de material
                    distintas es exactamente el tipo de acoplamiento que un
                    gate ajeno no puede anticipar.
Qué haría falta para elegir lo otro ...... Que `dxf-corpus-terceros.spec.ts`
                    se reescribiera para filtrar por extensión o por
                    manifiesto declarante, cosa que este frente no toca
                    (territorio de quien mantiene esa dimensión).

## D-02 · Sustituir `hypothesis` por `atheris` sin preguntar

Qué se dudó ...... `PROMPT_MAESTRO_FABLE.md` nombra `hypothesis` como
                    candidato para `json-import.fuzzing`. Verificado contra
                    PyPI, es MPL-2.0. ¿Se detiene el frente a esperar
                    confirmación, o se sustituye por su cuenta?
Qué se eligió ..... Sustituir por `atheris` (Google, Apache-2.0, PyPI, wheel
                    `cp311` disponible) sin detenerse, y escribir la petición
                    de corrección del prompt maestro en el buzón
                    (`F10-peticiones.md`, P-F10-07) en vez de esperar a que
                    alguien la apruebe primero.
Por qué es lo conservador ...... `CORPUS_POLICY.md` prohíbe MPL «sin
                    excepción y sin discusión»: no es una zona gris que
                    amerite pausa, es una regla ya escrita. Detenerse a
                    preguntar algo que la propia casa ya respondió sería el
                    tipo de parada que la sesión tiene prohibida (§3.4).
Qué haría falta para elegir lo otro ...... Que el titular decidiera que
                    `CORPUS_POLICY.md` no aplica a herramientas de
                    verificación (sólo al corpus de material), lo cual
                    contradice cómo ya se usó esa política para excluir
                    LibreDWG/IfcOpenShell/pythonocc-core como oráculos.

## D-03 · No fabricar material para `toolset-raster` cuando el real no llega

Qué se dudó ...... `loc.gov`/`tile.loc.gov` no son alcanzables desde esta
                    sesión y el lector de raster del producto no decodifica
                    JPEG/TIFF (que es como la Library of Congress sirve
                    HABS/HAER). ¿Se genera un PNG sintético con geometría
                    conocida por construcción, ya que el material real no
                    llega?
Qué se eligió ..... No. Se declara el candidato BLOQUEADO con la evidencia
                    exacta del intento (comando, código de salida, motivo) y
                    se pasa al siguiente, sin fabricar nada.
Por qué es lo conservador ...... `PROMPT_MAESTRO_FABLE.md` ya cuenta la
                    trampa que este mismo frente se comió una vez con
                    `toolset-raster.vectorizacion`: construir la capacidad
                    con un escaneo que la propia suite generó subió la fila
                    UN punto de los dos, porque ese material sigue siendo
                    «evidencia fabricada por casa» aunque tenga forma de
                    imagen. Repetir el error con un PNG sintético para ESTA
                    fila sería la misma trampa con otro disfraz.
Qué haría falta para elegir lo otro ...... Que `loc.gov` entre al `noProxy`
                    de una sesión futura, o que aparezca un escaneo de
                    dominio público ya servido en PNG/BMP, o que se instale
                    Pillow para convertir un TIFF/JPEG alcanzable por otra
                    vía.

## D-04 · No anclar «cita y fecha» de la NOM-001-SEDE sin verificarla en vivo

Qué se dudó ...... `nom-conductors.ts` ya cita artículos concretos de la
                    NOM-001-SEDE (Tabla 310-15(b)(16), Art. 240-4(D), Tabla
                    250-122, etc.) de memoria/entrenamiento, declarando por
                    escrito que le falta el cotejo contra el texto oficial.
                    ¿Se completa ese cotejo citando una fecha de publicación
                    del DOF sin haber podido abrir el documento oficial en
                    esta sesión?
Qué se eligió ..... No. Se intentó `www.dof.gob.mx` y `sidof.segob.gob.mx`
                    (los dos devuelven `CONNECT tunnel failed, response
                    403`) y se declaró el candidato BLOQUEADO con el comando
                    exacto, en vez de escribir una fecha no comprobada.
Por qué es lo conservador ...... La regla 1 de la casa: «ningún claim sin
                    evidencia». Una fecha de publicación del DOF escrita de
                    memoria es precisamente el tipo de cifra que
                    `PROMPT_MAESTRO_FABLE.md` prohíbe («ninguna cifra vive en
                    dos lugares […] una cifra escrita a mano en un doc es un
                    defecto aunque hoy coincida») — y aquí ni siquiera
                    coincidiría con certeza, porque no se pudo comprobar.
Qué haría falta para elegir lo otro ...... Acceso de red a `dof.gob.mx`/
                    `sidof.segob.gob.mx`, o que el titular aporte el PDF
                    oficial ya descargado con su fecha, para anclarlo por
                    sha256 como se hizo con las licencias de este frente.

## D-05 · No usar el banco de tornillería FreeCAD ni la tabla de LibreCAD sin verificar licencia archivo por archivo

Qué se dudó ...... `independencia-por-fila.json` sugiere el banco de
                    tornillería del taller Fasteners de FreeCAD para
                    `toolset-mechanical`, y `PROMPT_MAESTRO_FABLE.md` sugiere
                    una tabla de alias de LibreCAD para la línea de comandos.
                    Los DOS programas ya están marcados LGPL/GPL —inadmisibles—
                    en `HERRAMIENTAS.md`. ¿Se asume que el archivo de datos
                    concreto (no el programa) tiene una licencia distinta,
                    como sugiere el censo, y se usa?
Qué se eligió ..... No, sin comprobarlo archivo por archivo primero. Se dejó
                    en el backlog de `F10.md` con la advertencia explícita:
                    si el banco/tabla hereda la licencia del repositorio que
                    lo aloja, `CORPUS_POLICY.md` lo excluye igual que excluyó
                    LibreDWG.
Por qué es lo conservador ...... Dar por buena una sugerencia del prompt sin
                    mirar la licencia real sería repetir el mismo tipo de
                    error que D-02 corrigió (`hypothesis`): una fuente
                    nombrada como candidato que en realidad es inadmisible.
                    No se tuvo tiempo en esta sesión de descargar y leer los
                    términos de esos archivos concretos.
Qué haría falta para elegir lo otro ...... Descargar el archivo de datos
                    concreto (no el repositorio entero) y leer si declara una
                    licencia propia distinta de la del programa que lo aloja,
                    con esa declaración archivada igual que las demás
                    licencias de este frente.
