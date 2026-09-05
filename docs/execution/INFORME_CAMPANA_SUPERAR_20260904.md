# Informe de cierre — Campaña «Superar a AutoCAD completo»

**4–5 de septiembre de 2026.** Once frentes, tres ventanas de integración, un
coordinador. Corte de partida `25898dc6`; cierre en `main` con las ventanas 1 y 2
(`5c2cc87`) y la ventana 3 en PR #190.

---

## 1 · Las cifras, antes y después

| | al arrancar | al cerrar |
|---|---:|---:|
| Rúbrica, alcance DESTINO | 232/271 (85.6 %) | **239/271 (88.2 %)** |
| Rúbrica, alcance de HOY | 176/197 (89.3 %) | **180/197 (91.4 %)** |
| Puntos con evidencia **INDEPENDIENTE** | 5 | **16** |
| Filas que retienen 1 pt por evidencia propia | 29 | **25** |
| **Filas que llegan a su tope** | **0** | **6** |
| Specs del árbol | 576 | **623** |
| Comandos en el registro | 274 (el encargo decía 243) | **294** |
| Comandos alcanzables con el ratón | 274/274 | **294/294** |
| Éxitos falsos | 0 | **0** |
| Goldens de navegador | 87 | **103** |

Las seis filas que llegan a su tope, por primera vez desde que existe la rúbrica:
Dibujo 2D y precisión · Trabajo ajeno · Bloques y atributos · Modelo 3D y sólidos
B-rep · Modelado 3D (primitivas, SOLIDEDIT y la cota) · Capacidad de crecer.

Y una cifra que dice lo mismo por otro lado: `check:cad-math` pasó de **4 806 a
5 421 casos numéricos verificados contra oráculo independiente**, 0 desviaciones.

### Tres cifras del encargo que estaban mal, y se corrigen

1. **«243 comandos, 243 alcanzables con ratón».** Eran **274** al cortar la rama.
2. **«25 filas retienen 1 punto».** Eran **29**.
3. **«39 brechas».** Son **10 pt de criterios abiertos** más **29 filas** que
   retienen su último punto por evidencia propia. La diferencia no es contable: los
   primeros los cierra código; los segundos, material ajeno o un usuario.

---

## 2 · Frente por frente

| Frente | Entregó | Cierre |
|---|---|---|
| **F1 · DWG en el producto** | HATCH de patrón, INSERT con ATTRIB y espacio papel con VIEWPORT en el writer público; 284/327 entidades ajenas regrabadas (86,9 %); paquete de firma cuyas cifras salen de la evidencia | Parcial. **Ningún lector ajeno ha abierto un archivo de nuestro writer**: `externalOracleVerified = false`, 4 de 24 casos respaldados. Las dos banderas siguen en `false`, comprobado en el código. |
| **F2 · Velocidad sentida** | Kernel WASM **enchufado** (su criterio verifica); trinquete por etapa de `architecture@100k` con candado contra «más rápido porque dibuja menos»; runner de GPU que **se niega a publicar** si no hay GPU | Parcial. El SLO **no se cumple** y el siguiente cuello está medido: teselado, 73,6 % del reparto. Cero cifras de GPU real: el contenedor rasteriza por software. |
| **F3 · El 3D honesto** | SOLIDEDIT de 3 a 8 ramas (8 declaradas ausentes en el propio diálogo); 52 modos de primitivas, 48 escriben; SHELL y fusión de coplanarias | Parcial. La entidad con normal —el cimiento del 3D— **no se abrió**: pedía cambiar el esquema del documento canónico. Ocho ramas siguen fuera, con nombre. |
| **F4 · Express y universal** | Cinco Express Tools, COMPARE entre dos archivos, diez órdenes de PDF, unidades imperiales de punta a punta | Parcial. Faltan ocho Express Tools, cada una con su motivo escrito. |
| **F5 · Architecture** | Catálogo de puertas y ventanas por clave de despacho; cuadro de áreas con **superficie construida**, que es lo que exige una licencia; escaleras por norma | Parcial. IFC queda a decisión del titular, sin insinuarse. |
| **F6 · MEP y Plant 3D** | Cota y montante en las tres órdenes; longitudes en **tres** dimensiones (un montante de 2 m sumaba cero); choques contra muros, huecos y sólidos; sólido de tubería facetado | Parcial, y lo dice en peldaño 0: el sólido se **persiste y no se deriva** —mover la ruta no lo mueve, avisa—, y la holgura de choque es **optimista** porque el tubo se modela macizo. |
| **F7 · Mechanical y Electrical** | El conductor que parece llegar al motor y termina a dos centímetros; NOM ampliada; piezas normalizadas; cuadro de cargas | Parcial. |
| **F8 · Map 3D y Raster** | **Vectorización de escaneos: líneas Y textos**, 296 comprobaciones; COGO y cuadro de construcción | **Criterio abierto de 2 pt otorgado.** Falta un golden de navegador: peldaño 3, no 5. |
| **F9 · Extensibilidad** | La frontera de AutoLISP deja de ser un claim y pasa a ser **matriz medida** | Parcial. |
| **F10 · Escritorio y sin red** | Cascarón de sesión sin red, traducido por claves; **frontera escrita antes que la promesa** | Parcial. |
| **F11 · Evidencia independiente** | 19 DXF ajenos de dos bibliotecas MIT en cinco dialectos, con licencia hasheada; `ezdxf` como oráculo; censo de las 31 filas con tope | **+5 pt y cinco filas al tope.** Falta la **firma humana de derechos**: bloquea 2 pt más. |

---

## 3 · Lo que esta campaña enseñó sobre sí misma

### El punto que se ganó construyendo valía la mitad de lo que prometía

`toolset-raster.vectorizacion` valía 2 puntos. Al completarse, la fila subió **1**:
entró en el conjunto que retiene un punto por carecer de evidencia ajena. Construir
la capacidad entera da la mitad; la otra mitad la da un archivo que no escribimos.

Los otros cinco puntos —los de F11— no vinieron de código nuevo: vinieron de
diecinueve ficheros de terceros. **Es el reparto que el mapa de brechas anunciaba,
medido.**

### Ningún umbral se relajó, y dos bajaron

- `/plantillas` de 356.5 a **294.2 KB**: una página pública de miniaturas viajaba
  con el registro de entidades dentro. Llevaba comiéndose su margen desde el PR #127.
- El estudio de 3980 a **3488.8 KB**: 108 implementaciones de comandos salieron de
  la primera carga. Medido **en CI**: 3358.6 KB, usable en 1374 ms.

### Dos goldens anteriores a la campaña cazaron regresiones propias

El **46** demostró que aceptar pies y pulgadas por teclado había cambiado lo que
significa un número desnudo: `42` pasó a valer 1066.8 en un dibujo en milímetros.
El **77** exigió que la columna nueva del cuadro de superficies se **comprobara** y
no sólo se le dejara sitio. Ninguno se tocó para pasar.

### Seis correcciones a afirmaciones propias, incluidas las del coordinador

1. F1 retiró **tres** afirmaciones suyas sobre un `check:cad` en rojo, y documentó
   por qué se engañó: corrió `git stash -u` con el árbol ya limpio.
2. El grupo A desmintió con una sonda que cinco Express Tools «mutaran con efecto
   verificado»: cuatro declaran su límite.
3. F11 se corrigió **en contra de su propio beneficio**: bajó de 6 filas servibles a
   5 porque un fichero ajeno mostró que cada cota llega con su rótulo escrito dos
   veces sin avisar.
4. **El coordinador concluyó «el rojo de E2E no es de este PR» mirando un fragmento
   de tres**, cuando dos eran regresiones propias.
5. **El coordinador escribió que «la red sólo alcanza GitHub»** y era falso: PyPI,
   crates.io y npm responden. Esos hosts estaban en el `noProxy` que leyó en su
   primera hora. La premisa encogió las colas de F1 y F11.
6. **El coordinador comiteó dos veces el trabajo en vuelo de un agente**, que tuvo
   que verificar después que su contenido había sobrevivido.
7. **El coordinador borró los once árboles de trabajo mientras un agente todavía
   cerraba.** F11 estaba corriendo su verificación final cuando su árbol
   desapareció debajo: perdió su bitácora de cierre, dos peticiones nuevas sin
   commitear, y su sexto entregable quedó COLGADO en el almacén de objetos —
   commiteado a las 01:41:11, cuatro minutos después de que el coordinador
   integrara el frente a las 01:36:55. El propio agente lo rescató a un parche
   antes de que un `git gc` pudiera podarlo, y de ahí se recuperó por cherry-pick.
   Con él, `check:cad-math` sube de 4 806 a 5 421 casos y la rúbrica de 238 a 239.
   **Casi se pierde un punto y 615 casos numéricos por limpiar antes de tiempo.**
   La regla que faltaba: no se retira el andamio hasta que el último agente ha
   dicho que terminó.

### Cuatro engaños de esta máquina, para el siguiente

- **CI usa Node 20; el contenedor trae Node 22.** Un fallo real —`ERR_INVALID_URL`
  en la sonda del manifiesto— sólo aparecía en el 20. Pero `node_modules` se compiló
  con el 22, así que bajo el 20 `better-sqlite3` da 124 fallos **falsos** de la API.
- **El lint corta antes que E2E.** Con lint en rojo, los cuatro fragmentos ni corren.
- **El presupuesto del estudio sin `E2E_PROD=1`** mide contra `next dev` y da ~17 000
  KB, que es basura. Y **con** él mide el ÚLTIMO build: sin reconstruir, mide una
  aplicación vieja.
- **`plan-budget` y el banco de snap fallan bajo carga** y pasan en aislamiento. Ante
  un rojo, re-correr ese spec solo antes de creerlo.

---

## 4 · Lo que queda «todavía no», con fecha

Todo lo de esta sección está declarado en `docs/parity/ESCALERA.md` con su peldaño y
su motivo, fechado el **2026-09-04/05**:

- **DWG:** ningún lector ajeno ha abierto un archivo de nuestro writer. 15 clases sin
  escribir, DIMENSION la de más valor. Las dos banderas, apagadas.
- **Rendimiento:** `architecture@100k` no cumple su SLO. Cero cifras de GPU real.
- **3D:** la entidad con normal, ocho ramas de SOLIDEDIT, la cáscara abierta, los
  cóncavos, Ttr de CYLINDER y CONE.
- **Plant:** el sólido no se deriva de la ruta; la holgura de choque es optimista; el
  diámetro exterior y el catálogo del proyecto no existen; ISOGEN es propietario y
  sin oráculo.
- **Evidencia:** 26 filas retienen su punto. El censo dice por qué cada una: 5
  bloqueadas por un defecto medido, 15 que el corpus de hoy no alcanza y **6 que
  ningún fichero de terceros puede atestiguar**.
- **Tres defectos que el oráculo ajeno destapó y siguen abiertos:** `ezdxf` no abre
  lo que exportamos (MTEXT y HATCH sin marcador de subclase); el informe declara
  perdidas 63 cotas que sí entraron; siete capas no llegan al documento sin que nadie
  lo diga.

---

## 5 · Lo que sólo Sergio puede hacer

Ninguna sesión puede cerrar esto, y por eso va al final y no diluido.

1. **Firmar el paquete DWG y encender las dos banderas.** El motor lee cinco
   versiones en cero discrepancias y escribe doce clases; el producto sigue diciendo
   «no disponible». `docs/adr/0009-*` tiene el paquete de firma con su matriz de
   soporte, sus límites y su checklist, y sus cifras salen de la evidencia para que
   no puedan envejecer. Son dos booleanos y una firma.
2. **Firmar los derechos del corpus de terceros.** El dictamen automático está
   completo: licencia descargada, identificada y hasheada. Falta la firma humana, y
   **bloquea 2 puntos**.
3. **Desplegar y poner el producto delante de usuarios.** Seis de las 26 filas que
   retienen su punto no las cierra ningún fichero: piden a alguien trabajando. Cero
   personas han usado esto.
4. **Decidir el alcance de IFC** y si PIDCLASH, PIDSOLID y MEPRISER merecen órdenes
   propias en la cinta. Las dos preguntas quedaron sin respuesta a propósito.
5. **Medir en una GPU real.** `node scripts/perf/slo-navegador.mjs` está escrito para
   que lo corras tú en tu máquina: comprueba, mide, publica y **se niega** si el
   rasterizador es software, como pasa aquí.

---

## 6 · Método, para la campaña siguiente

Lo que funcionó y conviene repetir:

- **Territorios exclusivos y un buzón de peticiones.** 49 peticiones escritas por
  quien las necesitaba y aplicadas por quien podía. Cero conflictos de dos manos en
  el mismo archivo — el problema que motivó las reglas.
- **Integrar de uno en uno con la suite después de cada uno.** Reveló que el rojo de
  F4 no era de F4 y que el de la ventana 2 era una colisión entre dos trabajos
  nacidos a la vez, no un defecto de ninguno.
- **Un criterio abierto lo otorga quien lo evalúa, no quien lo construye.** Los
  frentes midieron y propusieron; la rúbrica sólo la tocó el coordinador. F8 y F6
  llegaron a avisar de frases de más en sus propias peticiones.
- **Medir cada lado antes de atribuir.** Salvó dos diagnósticos y falló en un tercero,
  que está escrito arriba.

Lo que hay que cambiar:

- **No comitear el trabajo en vuelo de un agente.** Mientras tiene el árbol, sus
  archivos son suyos.
- **No empujar un estado a medio construir sólo porque compile.** Cuatro corridas de
  CI se gastaron aprendiéndolo.
- **Verificar con el runtime que usa CI**, no con el que hay a mano.
