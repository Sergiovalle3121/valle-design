# Extensibilidad: guía del desarrollador

Esta página es para quien va a **traerse las rutinas que ya tiene** o a
**escribir código nuevo contra el editor**. Dice cómo se carga un `.lsp`, cómo
se escribe un plugin, qué garantiza el anfitrión mientras tu código corre y qué
permisos existen.

No trae ni una cifra. Todas viven en un solo sitio y se generan de la tabla del
intérprete en caliente:

- **La matriz de cobertura AutoLISP** — `docs/api/autolisp-cobertura.json`:
  cada función del lenguaje, en una de tres columnas (implementada · con límite
  declarado · todavía no), con el límite o el motivo escrito al lado.
- Se regenera con `cd apps/web && npx tsx src/lib/lisp/cobertura.spec.ts --update`
  y la vigila `apps/web/src/lib/lisp/cobertura.spec.ts`, que lee la tabla viva y
  se pone rojo si el JSON no la refleja: una función nueva sin clasificar es
  rojo, y una clasificada que ya no existe también.

Lo que **no** va a existir aquí —`.NET`, VBA, ObjectARX— está dicho con su
motivo y con el camino que sí existe en `docs/api/PUENTE-DOTNET-VBA.md`.

## Las dos superficies que corren en el navegador del usuario

| Superficie | Con qué se escribe | Estado |
| --- | --- | --- |
| Rutinas AutoLISP y diálogos DCL | El lenguaje de siempre, en un `.lsp` | Cargable hoy desde el editor |
| Plugins del estudio (`CadPlugin`) | TypeScript contra `apps/web/src/lib/lisp/plugins/api.ts` | Contrato completo, **sin cablear al editor** |

La segunda fila hay que leerla entera: el manifiesto, los permisos que se hacen
cumplir, el ciclo de vida y dos plugins de ejemplo existen y están probados,
pero ningún código fuera de `apps/web/src/lib/lisp/` importa todavía ese
registro. Por la regla de la casa —un subsistema sin importador fuera de sí
mismo no está implementado— eso significa que **hoy no hay forma de que un
tercero instale un plugin**. El diseño del cableado que falta está escrito
entero en `docs/history/execution/frentes-superar-20260904/ext-peticiones.md`.

Las otras dos superficies del producto —la API HTTP y los webhooks— viven en
`docs/api/POLITICA-API-PUBLICA.md` y en `docs/cad/third-party-extension-policy.md`.

## Cómo se carga un `.lsp`

1. **APPLOAD desde la paleta de rutinas** del editor. El navegador entrega el
   fichero, `apps/web/src/components/cad/lisp/appload.ts` lo valida —se lee de
   verdad, no se acepta a ciegas— y lo guarda en la biblioteca del estudio.
   Los ficheros se leen **uno a uno y en el orden en que los elegiste**: una
   rutina puede llamar a una función definida en otro fichero, y de un comando
   `c:` repetido gana el último. Un fichero con un paréntesis sin cerrar se
   reporta con su nombre y **no** detiene a los demás.
2. **Cada `(defun c:MICOMANDO …)` se convierte en un comando del editor**, en el
   mismo registro que los nativos. Se teclea como cualquier otro y su geometría
   sale por el mismo camino: un lote, un `commitChange`, un paso de deshacer.
3. **Desde dentro de una rutina, `load` trae otro fichero** de la biblioteca —el
   `(load "utiles")` con el que empieza media biblioteca de despacho—. No lee
   del disco: el intérprete no alcanza el sistema de ficheros, y si nadie montó
   biblioteca lo dice en vez de devolver nil fingiendo que el fichero no existe.
4. La biblioteca vive hoy en el navegador del usuario. Persistirla en el
   servidor exige un endpoint que todavía no existe, y está declarado como tal
   en `apps/web/src/lib/lisp/index.ts`.

Para el diálogo, el analizador DCL (`apps/web/src/lib/lisp/dcl/parser.ts`)
acepta el fichero entero y nombra los controles que no sabe pintar, en vez de
quedarse callado con los que entiende.

## Qué garantiza el anfitrión mientras tu código corre

Cuatro promesas, y las cuatro son ejecutables — están escritas en
`apps/web/src/lib/lisp/index.ts` y comprobadas por specs vecinas:

1. **Una sola puerta de escritura.** `entmake`, `entmod`, `entdel`, `command` y
   la API de plugins salen todos por `apply`, que recibe el vocabulario canónico
   de mutación del producto (`apps/web/src/lib/lisp/host.ts`). No hay una
   segunda puerta, así que tu rutina no puede saltarse el historial ni la
   disciplina de guardado — y deshacer después de ejecutarla deja el dibujo en
   un estado que alguien compuso.
2. **El presupuesto no se puede capturar.** Pasos, celdas, profundidad y reloj
   se miden (`apps/web/src/lib/lisp/budget.ts`), y el corte por presupuesto
   **no** lo atrapa `vl-catch-all-apply`: un límite que el código medido puede
   ignorar no es un límite. Las cifras del presupuesto están en
   `docs/cad/third-party-extension-policy.md`.
3. **El intérprete no alcanza nada del anfitrión.** Ni red, ni DOM, ni
   almacenamiento, ni el `eval` de JavaScript, ni el proceso.
   `apps/web/src/lib/lisp/sandbox-surface.spec.ts` lo comprueba sobre el código
   fuente y publica en cada corrida el inventario completo de dependencias
   externas del subsistema: añadir una nueva rompe el gate y obliga a
   justificarla.
4. **Se dice que no en vez de mentir.** Lo que el traductor no sabe construir
   sin perder estado se rechaza nombrando el tipo; un filtro con operadores
   lógicos se rechaza en vez de aplicarse a medias; una variable que no está en
   la tabla del producto no se inventa. La lista completa de negativas, con su
   motivo, es la tercera columna de la matriz, y sale de
   `apps/web/src/lib/lisp/builtins/unavailable.ts` — el mismo texto que lanza el
   intérprete es el que publica el documento.

Lo que **no** se garantiza: aislamiento entre rutinas (dos `.lsp` cargados
comparten entorno), procedencia (no se firma ni se revisa lo que cargas) y
protección contra lo que una rutina haga con tu dibujo dentro de su presupuesto.
Cargar el `.lsp` de un tercero es la misma decisión que en cualquier CAD de
escritorio.

## Cómo se lee la matriz de cobertura

Cada entrada de `docs/api/autolisp-cobertura.json` trae su nombre, en qué tabla
vive —el núcleo del lenguaje, que se evalúa sin dibujo, o la tabla CAD, que
necesita documento— y su columna:

- `implementada` — hace su trabajo y no tiene una frontera propia que declarar.
- `limite` — funciona, **con una frontera escrita** que cambia un resultado y
  hay que conocer antes de portar la rutina. Ejemplos que se pagan caro si se
  descubren tarde: el punto que devuelve `entsel` es el centro del contorno y no
  el clic; `tblsearch`, `tblnext` y `tblobjname` sólo conocen la tabla `LAYER`;
  `getvar` y `setvar` hablan de la tabla de variables del producto y lo que no
  está en ella se rechaza en vez de inventarse.
- `todaviaNo` — la función existe y **se niega diciendo qué falta y por qué**.
  Ahí están `nentsel`, `getfiled`, la E/S de ficheros, los reactores `vlr-*` y
  el objeto de aplicación de ActiveX. No es «nunca»: es lo que hoy no está, y el
  día que se implemente se borra de esa lista, que es lo que la hace aparecer en
  la columna de al lado.

El puente Visual LISP de **entidades** sí existe: `vlax-ename->vla-object` da un
objeto respaldado por el dibujo, con sus `vla-get-*`/`vla-put-*`, `vlax-get`,
`vlax-put` y la familia `vlax-curve-*`
(`apps/web/src/lib/lisp/builtins/vlax.ts`). Lo que no existe es el objeto de
**aplicación**, y la diferencia está explicada en el documento del puente.

## Cómo se escribe un plugin

Un plugin es un objeto con manifiesto, comandos y paneles. El contrato está en
`apps/web/src/lib/lisp/plugins/api.ts` y los dos ejemplos completos —uno que
dibuja y otro que sólo lee— en
`apps/web/src/lib/lisp/plugins/examples/marco-lamina.ts` y
`apps/web/src/lib/lisp/plugins/examples/recuento-capas.ts`. Léelos antes de
escribir el tuyo: son la plantilla, y están sujetos por su propia spec para que
no envejezcan cuando la API cambie.

Lo que hay que saber para escribirlo:

- **El manifiesto declara `permisos`, y es obligatorio.** Un plugin sin permisos
  declarados se rechaza al alta; no hay «todo por defecto».
- **Un comando de plugin es un comando corriente**: una máquina de estados pura
  que entra en el mismo registro compuesto que los nativos. Por eso su geometría
  hereda el paso único de deshacer sin hacer nada especial.
- **Un plugin nunca pisa un nombre del producto.** El choque se detecta al alta y
  el alta es todo-o-nada: no queda medio plugin registrado.
- **El ciclo de vida es `register` → `activate` → `deactivate` → `unregister`**,
  y no deja huérfanos aunque tu `activate` lance. Reactivar vuelve a comprobar
  los choques.
- **La escritura sale por `apply`**, igual que la de una rutina LISP. No recibes
  el documento mutable.

### Los permisos

Son cuatro y están declarados en
`apps/web/src/lib/lisp/plugins/permissions.ts`, cada uno con la frase que se le
enseña al usuario cuando se le pide —esa frase es canónica y vive sólo ahí—:

| Permiso | Qué abre |
| --- | --- |
| `documento:lectura` | Leer entidades, capas y variables del dibujo abierto |
| `documento:escritura` | Aplicar comandos canónicos sobre el dibujo |
| `comandos:registro` | Publicar comandos con nombre en el registro del editor |
| `ui:panel` | Montar un panel en el editor |

Se hacen cumplir en **dos** puertas, y la segunda es la que importa: además de
la API del documento, el propio motor comprueba `documento:escritura` antes de
aplicar el resultado de un comando de plugin —incluida la variable que decide en
qué capa nace lo siguiente—. Sin esa segunda puerta, un plugin sin permiso de
escritura habría registrado un comando que dibuja, y habría dibujado.

Un permiso que falta no se resuelve devolviendo un valor vacío: se lanza un
error con el plugin y el permiso como datos, y ese error **no** lo atrapa
`vl-catch-all-apply` — la misma decisión que con el corte por presupuesto.

## Si añades algo al lenguaje

Añadir una función a la tabla es la mitad del trabajo. La otra mitad es decir en
qué columna cae:

1. Si está entera, no toques la matriz: se regenera y aparece como implementada.
2. Si tiene una frontera, escríbela en la tabla de límites de
   `apps/web/src/lib/lisp/cobertura.spec.ts` **y** provócala en la sección de
   límites del mismo fichero. Un límite escrito y no comprobado es una promesa;
   uno comprobado es una frontera.
3. Si no está, decláralo en `apps/web/src/lib/lisp/builtins/unavailable.ts` con
   su motivo. La función existirá y se negará con ese texto, y ese mismo texto
   es el que publica la matriz.
4. Regenera con `--update` y revisa el diff. El gate no te dejará publicar una
   función sin clasificar.
