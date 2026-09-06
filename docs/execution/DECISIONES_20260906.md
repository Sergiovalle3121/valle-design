# Registro de decisiones — Campaña «El lunes de un arquitecto» (2026-09-06)

> Régimen de la sesión: horas sin detenerse y **sin preguntar**. Cada duda se
> resuelve con la opción más conservadora (§3.4.1 del prompt maestro) y se
> anota aquí **mientras se decide**, con el cuarto campo —qué haría falta para
> elegir lo otro— que convierte «no preguntar» en «preguntar en diferido».
>
> Prompt maestro: `docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`.
> Bitácora: `docs/execution/CAMPANA_LUNES_20260906.md`.

## D-01 · El techo del manifiesto de auditoría: 14, no 11
Qué se dudó ......  El prompt maestro ordena «bajar el techo de 28 a 11». El gate
                    (`check-auditoria-manifest.mjs`) exige que el techo sea
                    igual al número de ficheros en disco, y los tres `arnes`
                    (00-arranque, planta, precision) se quedan a propósito.
Qué se eligió ....  Techo 14 = 11 con defecto vivo + 3 arnes. La nota del
                    manifiesto lo explica.
Por qué es lo conservador ...  El gate tiene razón (regla 3 de la casa). 11
                    haría rojo el gate; cambiar el gate para excluir arneses
                    sería relajarlo.
Qué haría falta para elegir lo otro ...  Decidir que los arneses vivan en otra
                    carpeta (por ejemplo `e2e/arnes/`) con su propio gate.

## D-02 · Sesiones hermanas con Sonnet 5, por directiva del titular
Qué se dudó ......  El titular pidió a mitad de sesión abrir sesiones paralelas
                    con Sonnet 5 «para cosas que no necesiten Fable». Cuáles y
                    cómo integrar sin romper la regla del monolito ni el buzón.
Qué se eligió ....  Una sesión por frente con territorio exclusivo (§5.2), cada
                    una en su rama `claude/f<N>-…` y con PR borrador contra
                    `main`. Ninguna toca los ficheros de F0 (`rubric.json`,
                    `ESCALERA.md`, `BACKLOG.md`, `monolith-budget.json`,
                    `manifiesto.json`) ni `Layout3DEditor.tsx`: escriben
                    peticiones en `docs/execution/frentes/<frente>-peticiones.md`
                    y el coordinador las aplica y vuelve a medir (§3.3·2).
                    Integración frente por frente en esta rama, con suite
                    completa después de cada uno (§5.5).
Por qué es lo conservador ...  Reproduce el método que ya funcionó (49
                    peticiones, cero conflictos) y mantiene un solo escritor
                    por archivo caliente.
Qué haría falta para elegir lo otro ...  Permitir a los frentes editar
                    `rubric.json` directamente exigiría un merge de JSON a mano
                    en cada integración.

## D-03 · `FASE4_TESTIGO_AJENO_20260905.md` se queda en `docs/execution/`
Qué se dudó ......  Si archivarlo con las bitácoras (T-0D). No lleva prefijo
                    `INFORME_`, pero es el cierre medido de la fase 4 (#191).
Qué se eligió ....  Se queda: es evidencia medida, no un plan vencido, que es
                    el criterio de `AGENTS.md` para los `INFORME_*`.
Por qué es lo conservador ...  Mover un documento que otros enlazan rompe
                    enlaces; dejarlo no rompe nada.
Qué haría falta para elegir lo otro ...  Renombrarlo `INFORME_FASE4_…` y
                    corregir sus enlaces entrantes en el mismo commit.

## D-04 · Las cuarenta entradas «Frase» de Ctrl+K se OCULTAN, no se cablean
Qué se dudó ......  T-12·5 ofrece dos salidas honestas: retirar las cuarenta
                    entradas «Frase» (y sus tres cadenas del «copiloto») o
                    cerrar el circuito bajo un nombre que no mienta.
                    `no-ai-boundary.spec.ts` dice que el registro de frases
                    «sigue existiendo —y debe seguir—».
Qué se eligió ....  Retirar las entradas de la PALETA y las tres cadenas; el
                    parser (`commands/registry.ts`) se queda intacto, como
                    pide el guardián. `command-palette.spec.ts` defiende que
                    no vuelvan; golden 119 lo mira en el navegador.
Por qué es lo conservador ...  El preview terminaba en un estado que nadie
                    pinta (`commandPreview` sólo alimenta una ref) y el
                    «Aplicar» estaba muerto (`applyCommand`, retirado en el
                    paso 0 con prueba de eslint): cerrar el circuito es
                    construir una interfaz nueva; ocultar es un `git revert`.
Qué haría falta para elegir lo otro ...  Decidir que las frases se ejecuten
                    desde la línea de comandos (sin panel) y construir la
                    vista previa en `CadCommandLine`, con golden.

## D-05 · El frente F2 trabaja en un árbol de trabajo aparte con `node_modules` por hardlink
Qué se dudó ......  Editar ficheros fuera del monolito mientras el agente de
                    extracción edita el monolito en el árbol principal: un
                    typecheck a media edición daría rojos falsos a los dos.
Qué se eligió ....  `git worktree` en `/home/user/valle-design-f2` con
                    `node_modules` copiado por hardlink (`cp -al`); el enlace
                    simbólico no sirve: Turbopack rechaza un `node_modules`
                    que apunte fuera de la raíz del proyecto.
Por qué es lo conservador ...  Un escritor por árbol, como en la campaña
                    anterior (once árboles, 1,2 GB, cero conflictos).
Qué haría falta para elegir lo otro ...  Nada: es el método de la casa.

## D-07 · Los contenedores traen un `main` viejo: cada frente comprueba su base
Qué se dudó ......  Al integrar F4 apareció «no merge base»: su rama cuelga de
                    `1478471` (PR #121, de agosto). El clon de los contenedores
                    trae `main` en ese commit —el de esta sesión también—, y
                    una sesión que hace `checkout -b` desde ahí trabaja sobre
                    un árbol de hace un mes. F10 y F11 nacieron de `2fd2bfd`
                    (bien); F3, F5, F8 y F9 no habían empujado aún.
Qué se eligió ....  Aviso por rutina a los cinco frentes con la orden exacta:
                    `git fetch origin main && git merge-base HEAD origin/main`;
                    si la base es vieja, `git rebase origin/main` (rama
                    propia), gates otra vez sobre el árbol nuevo,
                    `push --force-with-lease` y nota en su bitácora. Mientras,
                    el coordinador no integra ninguna rama cuya base no sea
                    `2fd2bfd` o `4800017`.
Por qué es lo conservador ...  Integrar una rama nacida de agosto sería
                    aplicar diffs contra código que ya no existe; y `main`
                    usa squash, así que «se aplican diffs, no se fusionan
                    ramas antiguas» (§3.2).
Qué haría falta para elegir lo otro ...  Nada: es un defecto del entorno
                    (instantánea del clon) que conviene que el titular sepa,
                    porque volverá a pasar en cada sesión nueva.

## D-08 · Territorios concedidos a petición de los frentes (F8, F9)
Qué se dudó ......  F8 pidió el gate de términos y aviso al crear la cuenta
                    (T-63d) en `AuthPage.tsx` y `modules/identity`, que no
                    estaban en su lista; F9 pidió `viewport/render-pipeline-
                    host.ts` (territorio F7, sin sesión) para que el fondo real
                    del lienzo llegue a `defaultCadRenderStyle` (T-13).
Qué se eligió ....  Conceder ambos, acotados: F8 sólo `AuthPage.tsx`,
                    `app/register/**` y la parte 2 dentro de `identity`
                    (metadata del evento `identity.registered`, sin tocar
                    `modules/legal`); F9 sólo `setBackgroundColor` + `styleOf`
                    + su spec. Las líneas del monolito (mitad B de F9-P-01,
                    `nativeMassHosts` de F5-P-03, `onDrop` de F8-2) las tiende
                    el coordinador al integrar.
Por qué es lo conservador ...  Un solo escritor por archivo se mantiene;
                    ningún otro frente tenía esos archivos abiertos, y dejar
                    el hueco sin dueño era dejarlo sin arreglar.
Qué haría falta para elegir lo otro ...  Nada: la §5.2 del prompt maestro
                    permite al coordinador reasignar territorio.

## D-09 · `toolset-electrical.esquemas` se renombra a lo que verifica (F5-P-01, opción A)
Qué se dudó ......  El criterio cobra 2 pt por «símbolos normalizados,
                    numeración de conductores y etiquetado» y la evidencia
                    prueba las dos últimas mitades, no símbolos de esquema de
                    control (IEC 60617): `grep -rniE 'bobina|contactor|
                    relevador|guardamotor|seccionador|60617' apps packages`
                    sin aciertos de producto.
Qué se eligió ....  Opción A de la petición: el texto del criterio pasa a
                    «numeración de conductores y etiquetado de componentes»,
                    el `gap` declara los símbolos de esquema ausentes y
                    ESCALERA gana la fila en peldaño 0. Los 2 pt se mantienen
                    porque la evidencia sí prueba lo que el texto nuevo dice.
Por qué es lo conservador ...  Cambia una frase, no una cifra: la rúbrica
                    deja de prometer lo que no mide sin inventar un hueco
                    nuevo con puntos a mano.
Qué haría falta para elegir lo otro ...  Construir los símbolos IEC 60617
                    como bloques con atributos y su golden (ficha futura).

## D-10 · MinIO (AGPL) sólo por red como oráculo: pregunta del titular, no del coordinador (F10-P-08)
Qué se dudó ......  `CORPUS_POLICY.md` prohíbe AGPL «sin excepción»; la lista
                    describe bibliotecas enlazadas o redistribuidas. Un
                    servidor MinIO contactado sólo por red desde el cliente
                    S3 del producto no se enlaza ni se redistribuye.
Qué se eligió ....  No arrancar MinIO ni contar `object-storage.s3` con
                    evidencia independiente hasta que el titular lea la
                    política y decida. Queda en el informe de cierre.
Por qué es lo conservador ...  La política es del titular y la lectura
                    amplia («sólo lo enlazado») no está escrita.
Qué haría falta para elegir lo otro ...  Una línea del titular en
                    `CORPUS_POLICY.md` (o aquí) diciendo que el acceso por red
                    a un servidor AGPL no es material prohibido; entonces
                    F10 corre el adaptador S3 contra MinIO y congela el censo.

## D-11 · `hypothesis` (MPL-2.0) sale del prompt maestro como oráculo sugerido (F10-P-07)
Qué se dudó ......  La ficha T-03 sugería «radamsa, atheris o hypothesis»;
                    hypothesis es MPL-2.0 (PyPI, `license_expression`), que
                    `CORPUS_POLICY.md` prohíbe.
Qué se eligió ....  Corregir la ficha: `atheris` (Apache-2.0, rueda cp311) es
                    el fuzzer ajeno; hypothesis se nombra sólo como excluido.
                    En este entorno hypothesis se instaló al inicio de la
                    sesión (antes del aviso) y no entró en ningún artefacto
                    ni spec: se desinstala.
Por qué es lo conservador ...  Un dato de licencia equivocado en el prompt
                    maestro se hereda en cada sesión siguiente.
Qué haría falta para elegir lo otro ...  Nada.

## D-12 · Con la beta DWG encendida, el estudio no convierte: dice por dónde entra (T-16)
Qué se dudó ......  La ficha pide que las dos puertas den «la misma
                    respuesta» al mismo archivo, con la bandera apagada y
                    encendida. Con la beta apagada es directo (la misma
                    frase). Con la beta encendida el tablero ADMITE el `.dwg`
                    (worker → documento), pero el plano de FONDO del estudio
                    sólo sabe pintar DXF de texto: ¿convertir (DWG →
                    documento → DXF de fondo) o decirlo?
Qué se eligió ....  Decirlo. `admitStudioBackdropFile` devuelve el mismo
                    veredicto que `validateImportFile` (admitido) y, como el
                    fondo no lo pinta, un mensaje que nombra la puerta por la
                    que entra («Importar como documento»). Y el tablero pasa
                    a decir la razón DWG del contrato para un `.dwg` con las
                    puertas cerradas, en vez de «formato no soportado»: el
                    archivo se reconoce, y el usuario sabe qué hacer.
                    Ninguna bandera se enciende: la beta se ejercita sólo
                    en el spec de Node, contra la misma función.
Por qué es lo conservador ...  Convertir metería el códec DWG en el camino
                    del fondo (otra superficie que auditar y una ola entera
                    con su oráculo), y la mentira que T-16 señala se quita
                    con la puerta compartida. Cambiar la frase del tablero
                    cambia UNA clase del fuzzer (`dwg-sin-proveedor`) y una
                    aserción; no cambia ningún identificador persistido.
Qué haría falta para elegir lo otro ...  Un `.dwg` real del corpus autorizado
                    entrando como fondo y midiéndose contra su DXF de oráculo,
                    en una ola con ficha propia.

## D-13 · Las tres pruebas de auditoría de T-20 se gradúan ADAPTADAS al flujo de OFFSET de T-23
Qué se dudó ......  Con el pinzamiento cediendo el clic, TRIM pasó en sus
                    seis combinaciones, pero los cuatro casos de OFFSET
                    seguían rojos: desde T-23 (F3, 0f9c226) OFFSET pide el
                    LADO con un punto, como AutoCAD, y las pruebas —escritas
                    antes— pinchaban el objeto y daban Intro, que ahora
                    significa «salir sin desfasar». ¿Se gradúan las pruebas
                    cambiando su recorrido, o se dejan rojas hasta que
                    alguien decida sobre el flujo?
Qué se eligió ....  Adaptar el recorrido (un clic más, en el lado) y
                    graduarlas: lo que miden —que el clic sobre el
                    pinzamiento del objeto designado llegue al comando— es
                    exactamente lo mismo, y el nuevo prompt («lado») es
                    además una aserción mejor, porque sólo aparece si el
                    clic anterior llegó. Los `expect.soft` pasan a duros, los
                    títulos dicen lo que ahora se afirma y el diagnóstico
                    original queda en el archivo como memoria.
Por qué es lo conservador ...  El flujo con lado es paridad con AutoCAD ya
                    integrada (golden 40 y 26 lo defienden); revertirlo para
                    que pasaran pruebas viejas sería retroceder. Dejarlas
                    rojas mantendría un techo de auditoría inflado por un
                    defecto que ya no existe.
Qué haría falta para elegir lo otro ...  Que el titular prefiera el OFFSET
                    por signo tecleado; entonces T-23 se revisa, no esto.

## D-14 · La casilla de términos del alta enlaza SIN versión cuando `GET /v1/legal/documents` falla (F8-1, T-63d)
Qué se dudó ......  La casilla nombra la versión vigente que sirve el API
                    pública. Si esa petición falla (red, API caída a
                    medias), ¿se bloquea el alta (fallo cerrado), se deja
                    crear la cuenta sin casilla (fallo abierto), o se
                    muestra la casilla con los enlaces a las páginas y sin
                    número de versión?
Qué se eligió ....  Lo tercero: la casilla sigue siendo obligatoria y
                    enlaza a `/terms` y `/privacy`, que son las páginas del
                    producto con el texto vigente; lo único que no se
                    escribe es una versión que no se ha leído del API. El
                    botón sigue deshabilitado hasta marcarla.
Por qué es lo conservador ...  Bloquear el alta por una petición auxiliar
                    convertiría un fallo de red en una cuenta que no
                    existe; crearla sin casilla es exactamente el defecto
                    que T-63d señala. Un enlace sin número es verdad; un
                    número inventado no. El registro server-owned de la
                    versión aceptada es la parte 2 (frente F8), donde el
                    servidor conoce la versión sin preguntarle al cliente.
Qué haría falta para elegir lo otro ...  Que el titular prefiera el fallo
                    cerrado; entonces la casilla muestra «no se pudieron
                    cargar los términos» y un reintento, y el botón queda
                    deshabilitado.

## D-15 · Bajo un SCU inclinado el imán se queda con lo que está EN el plano, y las sombras 2D se saltan (T-52, racimo A)
Qué se dudó ......  Al proyectar el punto real del cursor (con cota) para
                    el enganche 3D, el índice de aristas devolvía candidatos
                    OCULTOS: el centroide de la cara de abajo y la arista de
                    delante se proyectan bajo el cursor que está sobre la
                    fachada, y el índice no sabe qué tapa el sólido. ¿Se
                    enseña al índice a ocultar (líneas ocultas, una ola), se
                    deja el imán como estaba (con la sombra, que aplanaba la
                    cota) o se filtra por el plano de trabajo?
Qué se eligió ....  Filtrar por el plano: bajo un SCU inclinado sólo
                    engancha lo que dista del plano menos que la apertura;
                    los candidatos 2D (proyecciones en planta de todo) y el
                    rastreo se saltan, y sin enganche el punto es el del rayo
                    contra el plano, con su cota. Con el SCU en el mundo nada
                    cambia (la sombra ES el punto). Y los dos píxeles de la
                    prueba de auditoría se acercaron al centro para que ambos
                    clics caigan sobre la fachada: a 55 px por debajo el rayo
                    cortaba el plano bajo el suelo (cota negativa, geometría
                    correcta pero no «sobre la fachada»).
Por qué es lo conservador ...  Un imán que engancha lo que no se ve es peor
                    que ninguno; la oclusión de verdad es una ola (el
                    anfitrión ya calcula aristas ocultas, el índice no las
                    usa). Filtrar al plano recupera exactamente el gesto de
                    AutoCAD con el SCU en una cara: engancha a las aristas y
                    vértices de ESA cara. Lo que se pierde (enganchar a otro
                    sólido delante, fuera del plano) queda declarado.
Qué haría falta para elegir lo otro ...  Llevar las aristas ocultas del
                    anfitrión al índice de enganche (visibilidad por candidato)
                    y entonces quitar el filtro al plano.

## D-16 · Las capas de la xref son capas del anfitrión («XREF|<xref>|<capa>») y el filtro de nombres corre sólo al renombrar (T-41)
Qué se dudó ......  Tres caminos para que las capas del plano ajeno
                    sobrevivan: (a) una tabla de capas POR xref dentro de la
                    referencia, que manda sobre el anfitrión (VISRETAIN=0);
                    (b) proyectarlas como capas del anfitrión con prefijo,
                    que se apagan como cualquier otra y cuyo estado se guarda
                    con el plano (VISRETAIN=1); (c) dejar la capa única y
                    añadir un cuadro de «capas de la xref» con visibilidad
                    aparte. Y al probar (b), el gestor rechazaba APAGAR una
                    capa cuyo nombre lleva `|`: el filtro de caracteres DXF
                    corría sobre el nombre existente en cualquier parche.
Qué se eligió ....  (b): al adjuntar, una capa `XREF|<xref>|<capa>` por cada
                    capa de origen (su «0» incluida, como AutoCAD), con id
                    `xref:<id>:layer:<capa>`, el color, tipo de línea y
                    grosor del remitente y `locked:false`; las entidades
                    proyectadas conservan su capa; al desligar se retiran
                    reasignando a una capa que sobreviva al lote, y al
                    enlazar (bind) se quedan, que es donde viven las
                    entidades ya del anfitrión. Descargar y recargar no tocan
                    la tabla, así que lo apagado sigue apagado. El filtro de
                    nombres corre sólo cuando el parche trae `name`: apagar,
                    congelar, bloquear o cambiar el color no renombran; el
                    `|` sigue prohibido al renombrar (es el separador).
Por qué es lo conservador ...  No toca el esquema del documento ni el gestor
                    de capas: son capas normales, con la persistencia, el
                    deshacer y el congelado por ventana que ya tienen, y el
                    nombre es el que un usuario de AutoCAD espera al abrir el
                    DXF. (a) pedía un esquema nuevo y otro gestor; (c) dejaba
                    las entidades aplastadas. Relajar el filtro es lo mínimo:
                    la validación de un nombre NUEVO no cambia.
Qué haría falta para elegir lo otro ...  Que al recargar una xref los cambios
                    de capa del REMITENTE tengan que ganar a los del
                    anfitrión (VISRETAIN=0): entonces la tabla por xref (a)
                    con una política de reconciliación, y una atenuación de
                    xref (`XDWGFADECTL`) que hoy no existe.

## D-17 · F9 (#200) no se integra en la rama de campaña esta noche: su fusión cruza el mismo archivo que F8 partió
Qué se dudó ......  La cabeza 160cd14 de F9 (que arregla su propia regresión:
                    la sugerencia de la línea de comandos se comía el Enter
                    y catorce goldens tecleaban un comando y ejecutaban
                    otro) fusiona con tres conflictos: `scripts/lint-budget.json`
                    (formato por archivo de F9 contra el techo global),
                    `docs/governance/assisted-development-log.json` (dos
                    entradas nuevas) y `apps/web/src/app/dashboard/page.tsx`,
                    que F8 partió (`dcfe15c`) y F9 partió de OTRA manera
                    (`import-status.tsx`, `archive-document.tsx`) sobre una
                    base anterior. ¿Resolverlo desde el coordinador, elegir un
                    lado, o dejar el PR abierto?
Qué se eligió ....  Dejarlo abierto: los dos lados cambiaron la misma lógica
                    y elegir uno pierde comportamiento (el botón de borrar
                    plano de F9, o la partición de F8). Cuando #194 esté en
                    `main`, la sesión F9 —que conoce su propia partición—
                    fusiona `origin/main` en su rama, regenera el trinquete de
                    lint con `--update` sobre el árbol fusionado (sólo baja),
                    suma las dos entradas del registro y pasa sus gates; el
                    titular o el coordinador fusionan #200 después, con su CI
                    verde sobre esa cabeza.
Por qué es lo conservador ...  Un conflicto de dos refactorizaciones del
                    mismo archivo resuelto a ciegas a las diez de la noche es
                    exactamente el «estado a medio construir» que la campaña
                    prohíbe empujar. El coste es un PR más que fusionar
                    mañana; el beneficio es que cada lado lo resuelve quien lo
                    escribió, con su CI.
Qué haría falta para elegir lo otro ...  Que el conflicto fuera sólo de
                    imports o de un archivo generado: entonces se resuelve
                    aquí (como se hará con `lint-budget.json` cuando F9
                    fusione `main`, adoptando su formato por archivo).

---

# Decisiones del frente F10 · Evidencia independiente (2026-09-06)

Escritas por la sesión F10 en su rama; el coordinador las trae aquí tal cual,
renumeradas D-F10-nn para no chocar con las del coordinador (D-01…D-11). La
D-F10-06 (MinIO por red) es la misma pregunta que D-10; la D-F10-02
(hypothesis) es la misma corrección que D-11.

## D-F10-01 · Dónde vive el material GIS de terceros

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

## D-F10-02 · Sustituir `hypothesis` por `atheris` sin preguntar

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

## D-F10-03 · No fabricar material para `toolset-raster` cuando el real no llega

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

## D-F10-04 · No anclar «cita y fecha» de la NOM-001-SEDE sin verificarla en vivo

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

## D-F10-05 · No usar el banco de tornillería FreeCAD ni la tabla de LibreCAD sin verificar licencia archivo por archivo

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
                    error que D-F10-02 corrigió (`hypothesis`): una fuente
                    nombrada como candidato que en realidad es inadmisible.
                    No se tuvo tiempo en esta sesión de descargar y leer los
                    términos de esos archivos concretos.
Qué haría falta para elegir lo otro ...... Descargar el archivo de datos
                    concreto (no el repositorio entero) y leer si declara una
                    licencia propia distinta de la del programa que lo aloja,
                    con esa declaración archivada igual que las demás
                    licencias de este frente.

## D-F10-06 · No arrancar `dockerd` para tirar de una imagen de MinIO (AGPL)

Qué se dudó ...... `independencia-por-fila.json` sugiere MinIO real como
                    oráculo de `object-storage.s3`. El binario directo
                    (`dl.min.io`) no es alcanzable, pero Docker Hub sí
                    responde, y `dockerd` está instalado aunque no arrancado.
                    ¿Se arranca el demonio para tirar de `minio/minio` y
                    correr el servidor?
Qué se eligió ..... No. El clasificador de seguridad de la sesión bloqueó el
                    intento de arrancar `dockerd` por su cuenta ("sobrepasa
                    lo que este modo autoriza sin permiso explícito"), y se
                    aceptó el bloqueo sin buscar un rodeo.
Por qué es lo conservador ...... Arrancar un demonio de sistema es una
                    acción de alcance mucho mayor que escribir un censo o un
                    spec: puede quedar corriendo, consumir recursos
                    compartidos con otros frentes, o dejar estado a medias si
                    la sesión termina a mitad de la descarga. Y aparte de la
                    red hay una pregunta de licencia sin resolver: el censo
                    llama a MinIO «AGPL», y `CORPUS_POLICY.md` prohíbe AGPL
                    «sin excepción y sin discusión» en su lista de material
                    PROHIBIDO — pero esa lista, leída entera, describe
                    material que se IMPORTA, se ENLAZA o se REDISTRIBUYE
                    (los tres casos ya excluidos —LibreDWG, IfcOpenShell,
                    pythonocc-core— son bibliotecas que un script importa).
                    Un servidor AGPL en su PROPIO proceso, contactado sólo
                    por red desde un cliente que no enlaza ni redistribuye su
                    código, es un caso distinto —el mismo principio por el
                    que hablar con PostgreSQL o MySQL desde software
                    propietario no hereda su licencia— y ningún caso previo
                    de este repositorio lo resuelve. Decidir esa distinción
                    por cuenta propia, sin que el titular la confirme, sería
                    exactamente el tipo de interpretación legal que este
                    frente no está en posición de hacer solo.
Qué haría falta para elegir lo otro ...... Permiso explícito para arrancar
                    `dockerd` (o que `dl.min.io` entre al `noProxy` y se
                    pueda usar el binario suelto, sin demonio de contenedores
                    de por medio), Y que el titular confirme si un servidor
                    AGPL contactado sólo por red cuenta como material
                    prohibido bajo `CORPUS_POLICY.md` o si la prohibición es
                    sólo para lo que se enlaza o se redistribuye.
