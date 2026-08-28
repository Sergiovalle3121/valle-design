# Informe de cierre — Campaña de firma propia

**Fecha:** 2026-08-28 · **Base:** `main @ a7a33d8` · **Rama:** `claude/valle-design-premium-identity-4hnemt`
**Bitácora completa:** [`../history/execution/CAMPANA_FIRMA_20260828.md`](../history/execution/CAMPANA_FIRMA_20260828.md)

---

## 1. El encargo, en las palabras del dueño

> «Muy minimalista, le falta vida, movimiento y contraste; no siento que sea MI
> producto — parece heredado; quiero algo ultra premium con mi propia firma,
> inspirado en la estética de un CAD profesional pero mío».

Y cinco encargos concretos: que la página no se presente como «el que compite
con AutoCAD»; que la creación de cuenta sea lo más segura Y lo más bella
posible; más información real para el cliente; un canal donde los usuarios
reporten fallas y sugerencias desde dentro del producto; y sembrar el terreno
para un modo universitario gratuito.

---

## 2. Lo que se hizo, ola por ola

### Ola 0 — La firma existe y está medida

**Paleta v2: grafito cálido con violeta eléctrico, y el oscuro por defecto.** La
v1 era un claro de banca con un oscuro que era su inverso fiel: coherente y
anónimo. La v2 elige una temperatura y la sostiene. El oscuro deja de ser una
cortesía nocturna y pasa a ser el modo del producto, porque es el sustrato del
oficio: geometría fina brillando sobre fondo oscuro.

**El hallazgo que corrigió el encargo.** La instrucción decía «contraste AA
medido con el gate que ya existe». No existía: `grep` sobre `scripts/` y
`components/ui` no encontraba ni un cálculo de luminancia relativa. Se construyó
primero (`scripts/design/contrast.mjs` + `check-contrast.mjs`, 70 pares en dos
temas) y sólo después se cortó la paleta — construir la regla y luego cortar. El
gate encontró **dos fallos en el primer corte**: un borde claro con 1,23:1 de
relieve y el violeta de hover con 4,21:1 sobre blanco. Sin él, los dos habrían
salido a producción con la campaña puesta.

**Tipografía display propia** (Space Grotesk, autohospedada, OFL 1.1), **sistema
de movimiento tokenizado** (cinco duraciones y tres curvas con nombre, entre
ellas `--ease-draw`) y **textura técnica** (`.blueprint-grid`, `.corner-marks`,
`.construction-line`).

**La excepción de `prefers-reduced-motion` que hubo que escribir a mano.** Un
trazo animado que simplemente deja de animarse DESAPARECE: `stroke-dashoffset`
se queda en su valor inicial y el dibujo no llega a verse. La regla fuerza
`stroke-dashoffset: 0` y `opacity: 1`. Respetar la preferencia es enseñar el
dibujo COMPLETO, no un lienzo en blanco.

### Ola 1 — La portada deja de compararse y empieza a moverse

**Reposicionamiento.** El hero decía «una alternativa a AutoCAD en la nube». La
referencia nominativa con aviso de marcas es legal y aun así se retiró, porque
el dueño decidió que su producto no se presenta por comparación — y
comercialmente es lo correcto: definirse contra otro le regala el marco al otro.
Donde hace falta hablar de intercambio se habla del **formato**.

Lo que se conserva a propósito: la **línea de marcas del pie**, extraída a
`components/marketing/TrademarkNotice.tsx` para que el gate tenga un archivo que
permitir en vez de una excepción por página. Y la compatibilidad de comandos y
alias vive en guías y preguntas frecuentes, no en marketing.

**El gate de superficie** revisa 19 zonas públicas, quita comentarios antes de
mirar —juzga lo que el usuario lee, no lo que el equipo escribe para
entenderse— y comprueba las DOS mitades: que no aparezcan marcas ajenas fuera
del módulo autorizado **y que el aviso siga montado**. Un gate que sólo
prohibiera se satisface borrando el aviso legal.

**El hero se mueve:** `PlanViewport` + `PlanDrawing`, una planta que se traza
sola dentro de una lámina con numeración y cajetín. No finge ser la aplicación
—una interfaz dibujada a mano que imita el producto es una mentira barata— y las
capturas reales del editor siguen justo debajo.

**Centro de preguntas:** de 7 a 36 respuestas en 6 categorías, con buscador que
mira dentro de las respuestas y normaliza acentos. El texto vive en
`lib/marketing/faq.ts` y alimenta también el JSON-LD, así que el buscador y la
persona leen el mismo párrafo.

**Una premisa del encargo, verificada en vez de reescrita:** los días de prueba
YA salían de configuración (`TRIAL_DAYS` → catálogo público → portada). Se
comprobó y se dejó como estaba.

### Ola 2 — La pantalla donde el cliente entrega sus datos

**Registro y login premium:** `AuthShell` a pantalla partida, con el plano
dibujándose a la derecha y los sellos de confianza. En móvil el panel desaparece
entero: un panel decorativo que empuja el formulario bajo el pliegue convierte
una ayuda en un obstáculo.

**`PasswordField`** añade mostrar/ocultar —la razón número uno por la que alguien
falla al registrarse es teclear mal algo que no puede ver— y `autoComplete`
correcto, que es lo que hace que un gestor de contraseñas ofrezca generar y
guardar.

**El medidor mide ENTROPÍA, no clases de carácter.** Sus pruebas están escritas
como acusaciones: `P@ssw0rd12` sale **muy débil** (es «password» disfrazada, y
las reglas de crackeo deshacen la sustitución antes de empezar) y una frase de
cuatro palabras sale **fuerte**. Un medidor que felicita a `P@ssw0rd1` empuja a
la gente hacia la contraseña que el atacante prueba primero.

**Segundo factor TOTP escrito a mano y demostrado contra los vectores del RFC**
—un oráculo externo que no puede heredar nuestros errores— con cuatro decisiones
que pesan más que el algoritmo: secreto cifrado con AES-256-GCM y la clave fuera
de la base; `lastUsedStep` que impide repetir un código dentro de su ventana; el
desafío entre contraseña y código como token de un solo uso y no como sesión a
medias; y desactivar exige la contraseña.

**El QR, contra un oráculo externo:** matriz módulo a módulo contra una
implementación ajena para 49 textos, uno de capacidad exacta por cada una de las
40 versiones — cero discrepancias. La auditoría encontró un defecto que la ida y
vuelta no podía ver (los centros de alineación son lógica compartida entre
codificador y lector, y sólo estaban fijados en 7 de 40 versiones) y la batería
de mutación pasó de 6/9 a 9/9 detectadas.

**Un hueco de producto, no de interfaz.** El API ofrecía `GET /v1/auth/sessions`
desde el primer día y el SDK tenía las cuatro operaciones tipadas; **el web no
llamaba a ninguna**. Había un producto que sabía decir «éstas son tus sesiones
abiertas» y ningún sitio donde lo dijera. `/cuenta` lo dice, y además dice —por
fin escrito— que cambiar la contraseña cierra las demás sesiones. Una defensa
que el usuario no conoce es una defensa que no usa.

### Ola 3 — El estudio deja de hablar en identificadores

**Nombres humanos.** El panel enseñaba `cad_mt60y4ol_uzfo` justo donde el
usuario mira para saber qué designó — y ese identificador era literalmente el de
la primera entidad del plano de ejemplo, el que veía todo el mundo. Ahora «Muro
3», «Cota 12», «Texto 5»: tipo en el español del gremio —`opening` es «Vano», no
«Abertura»— más ordinal por tipo.

**Y el remate que la suite de goldens obligó a pensar mejor.** El panel de
propiedades nativas presume, literalmente en su subtítulo, de «geometría
canónica … DXF sin aproximación persistida». Sustituir `CIRCLE` por `CÍRCULO`
dejaba al profesional sin la palabra que va a encontrar dentro del fichero.
Ahora enseña **las dos**, con jerarquía: el nombre en español manda y el tipo
DXF va al lado como etiqueta técnica. Es lo que hace la paleta de propiedades de
cualquier CAD localizado.

**Primera impresión en 2D.** El estudio abría siempre en 3D: la peor bienvenida
posible para un CAD de planos, donde el primer gesto del usuario es buscar el
botón que la apaga. Ahora abre en 2D y la elección se recuerda.

**Microfeedback:** «Guardando… → Guardado» ya se decía, y se decía inerte. Ahora
el indicador respira mientras guarda —un latido lento distingue «trabajando» de
«colgado», que es la pregunta real de alguien cuyo plano lleva dos segundos sin
confirmar— y da un pulso único al terminar.

### Ola 4 — La voz del usuario, con vuelta

**Por qué no bastaba el botón que ya había.** `/v1/support/incidents` manda un
correo y se olvida: sirve para un incidente. No sirve para la sugerencia que a
alguien se le ocurre un martes dibujando, que sin nadie que la guarde deja de
existir en cuanto se cierra la pestaña de quien la leyó.

Tabla `product_feedback` con **cuatro** estados —nuevo, leído, planeado,
resuelto—. Cuatro y no nueve: un tablero con nueve columnas se abandona; con
cuatro, cien comentarios se clasifican en diez minutos, que es la única forma de
que el canal siga vivo dentro de seis meses.

Cinco decisiones que valen más que el CRUD: la fila y el aviso van en la misma
transacción; sin buzón configurado **se guarda igual** (la entrega es la fila, no
el correo); el contexto técnico se recorta **en el servidor** a cinco campos
declarados; la casilla enseña la lista literal de lo que enviaría; y el
comentario sobrevive a su organización (`SET NULL`) pero se va con su autor
(`CASCADE`).

**La puerta del panel del dueño.** No hay —ni debe haber— un rol de
superadministrador en la base: los cuatro papeles son POR ORGANIZACIÓN y esa
frontera protege el plano de un despacho del de otro. La lista de operadores
vive en configuración, no se concede desde dentro del producto y **falla
cerrado**.

### Ola 5 — Los cimientos del modo universitario, con el interruptor apagado

**El mecanismo, no la promesa.** `modules/education/education-mode.ts`:
`EDUCATION_MODE` apagado por defecto y `EDUCATION_EMAIL_DOMAINS` vacía. Las dos
condiciones son necesarias y ninguna tiene un valor por defecto razonable —una
lista por defecto sería adivinar qué universidad le importa al dueño, y un modo
encendido por defecto regalaría el producto a quien registrara un dominio con
«edu» dentro—.

**Donde esto se rompe de verdad es el subdominio.** Las universidades reparten
el correo del alumnado en subdominios (`@alumnos.unam.mx`) mientras el
profesorado usa el dominio raíz: una comparación exacta deja fuera justo a
quienes va dirigido. Se acepta el dominio y sus subdominios **por segmentos de
etiqueta, nunca por sufijo de cadena** — un `endsWith('unam.mx')` acepta
`malicioso-unam.mx`, que es un dominio que cualquiera compra por doce dólares.
Hay una prueba que lo intenta.

**El plan educativo NO se siembra en el catálogo**, y hay una prueba que lo
comprueba: publicar un plan gratuito mientras el modo está apagado pondría en la
página de precios una oferta que ningún alta puede conceder.

**El aula como organización, y otro hueco del mismo tamaño que el de la ola 2.**
`GET /v1/organizations/:id/memberships` y `POST …/invitations` existen, están
probados, tienen control de asientos y correo transaccional — y **el web no
llamaba a ninguno de los dos**. El producto sabía invitar a una organización y
no había un solo sitio donde hacerlo, mientras `/educacion` afirmaba «invitas a
tus alumnos por correo». `/equipo` lo arregla, y lo hace por donde un profesor
lo necesita: **pegando la lista**. `lib/education/roster.ts` acepta las formas
que llegan de verdad —comas, líneas, `Nombre <correo>`, columnas con
tabulador—, normaliza, quita duplicados y **devuelve los descartes con su
motivo**, porque tirarlos en silencio es la peor opción: el profesor pega treinta
líneas, ve veintiocho invitaciones y no sabe cuáles dos faltan.

Las invitaciones se mandan **en serie**, no en paralelo: el límite de asientos se
comprueba en el servidor y treinta peticiones simultáneas contra ese límite
producen un reparto arbitrario de quién entra.

---

## 3. Lo que NO se hizo, y por qué

### 2.2 · Entrar con Google y Microsoft — backlog razonado

Es lo que más subiría la conversión del alta y aun así no entra en esta campaña,
por una razón concreta y no por tiempo: **OAuth no es una pantalla, es un
proveedor de identidad**. Encenderlo bien exige decidir y probar la fusión de
cuentas (qué pasa cuando alguien se registró con contraseña y luego entra con
Google desde el mismo correo), la verificación de correo heredada del proveedor,
qué ocurre si el proveedor deja de confirmar el correo, la revocación, y el
segundo factor cuando el proveedor ya hizo uno. Cada una de esas decisiones es
una puerta de entrada a las cuentas de los clientes.

Media implementación de OAuth es peor que ninguna: crea un segundo camino de
autenticación con la mitad de las defensas del primero. La campaña prefirió
dejar el camino de contraseña **más fuerte** —segundo factor, sesiones visibles,
actividad auditada, medidor honesto— que abrir uno nuevo a medio cerrar.

**Lo que haría falta para hacerlo:** una decisión del dueño sobre fusión de
cuentas por correo verificado, y una campaña propia con su suite contra los dos
proveedores reales.

### Invitación por lote en el servidor

`/equipo` manda las invitaciones una a una contra el endpoint que existe. Un
endpoint de lote añadiría **atomicidad** (o entran las treinta o ninguna) y **un
solo veredicto de asientos** en vez de descubrir el límite en la invitación
número doce. Es trabajo de contrato (OpenAPI + SDK + consola) y no se improvisa
al final de una campaña.

### El plan educativo, encendido

Faltan dos decisiones que no son técnicas y que le tocan al dueño: **qué
dominios institucionales se aceptan** y **con qué capacidad de soporte** se
atiende el pico de altas del principio de un semestre. Con esas dos tomadas,
encenderlo es poner dos variables de entorno y dar de alta la fila del plan por
migración revisada.

### `reset-password` sigue con el campo de contraseña sencillo

La pantalla donde alguien ELIGE una contraseña nueva no tiene todavía
mostrar/ocultar ni medidor. No es un olvido de diseño sino un límite de alcance:
cambiarla ahora tocaba un formulario que tres pruebas de navegador conducen, y
no se abre esa puerta en el cierre de una campaña. Es el primer ítem del backlog
de la siguiente.

---

## 4. Los tres errores propios que valen más que los aciertos

**1 · Diagnostiqué mal un error de PostgreSQL y «arreglé» lo que no estaba
roto.** Un `syntax error at or near "-"` me llevó a tocar `json-column-type.ts`
para que reconociera `TEST_DATABASE_URL`: **51 suites en rojo**, porque las
entidades pasaron a `jsonb` para todo el proceso, incluidas las de SQLite.
Revertido. La causa real era invocar `npx jest` en vez de `npm run test:pg`, que
ya exporta la variable. El repositorio lo señalizaba por dos sitios y el único
hueco real era `migration-chain.pg.spec.ts`, que construye su propio
`DataSource`. Ahora pasa por la misma señal, con la explicación al lado.

**2 · Un gate que referenciaba un archivo que no existía.** `check:surface`
llamaba a un spec que nunca llegué a escribir: CI rojo en dos commits seguidos
por algo que en local no fallaba porque el gate no se corría entero.

**3 · La Jornada Real en rojo tres corridas seguidas, y el rodeo del arreglo.**
`PasswordField` metió dentro del campo un segundo control cuyo nombre accesible
contiene, necesariamente, la palabra «contraseña»; veinte llamadas repartidas
por nueve specs pedían la etiqueta con un patrón suelto y pasaron a casar con
dos elementos. **No se cambió el producto:** «Mostrar la contraseña» es el
nombre correcto para ese botón y rebautizarlo para que un localizador no se
confunda sería degradar la accesibilidad real por comodidad de la herramienta.
El primer arreglo —`{ exact: true }`— dejó los mismos specs en rojo por tiempo
agotado, porque `getByLabel` mira el TEXTO RENDERIZADO y `FieldShell` le pega el
asterisco de campo obligatorio: la etiqueta real es `Contraseña*`. Se comprobó
con una sonda que imprime las etiquetas reales en vez de volver a suponer.

---

## 5. Lo que la suite de navegador encontró, y lo que se decidió con ello

Trece goldens en rojo tras las olas 2 y 3. Ninguno era un defecto del producto y
**ninguno se arregló bajando la prueba**:

| Causa | Qué se hizo |
| ----- | ----------- |
| El campo de contraseña ganó un botón con la palabra «contraseña» dentro | El localizador se ancla al principio (`/^Contrase/iu`), 19 sitios |
| El panel decía `CIRCLE` y pasó a decir `CÍRCULO` | El panel enseña **las dos**: nombre humano + tipo DXF. Ocho goldens vuelven a verde sin tocarlos |
| La lista de entidades habla en español | Un golden pasa a esperar «Texto», que es lo que el usuario lee |
| El id salió del titular del panel | Dos specs lo leen del detalle técnico — y de paso pasan de buscar una subcadena a una aserción exacta |
| El estudio abre en 2D y los presets de cámara son chrome del 3D | Los goldens que miden el visor 3D **piden el modo que ejercitan** (`enter3DView`). Dejarlos correr en 2D los habría dejado verdes midiendo otra cosa |

La regla que se siguió en los cinco casos: **una prueba se cambia cuando el
producto cambió a propósito y la prueba deja de describirlo; nunca para que deje
de fallar.**

---

## 6. Verdad medida

Todo lo de esta tabla se corrió en esta máquina, no se estimó.

| Qué | Resultado |
| --- | --------- |
| Specs de `apps/web` | **438 / 438** |
| API, pruebas de unidad | **774** pasadas (36 suites de PostgreSQL omitidas fuera de su carril) |
| API contra **PostgreSQL 16 real** | **217 / 217** en 38 suites |
| Contrato de diseño | **94** operaciones OpenAPI = SDK = router Nest |
| Gate de contraste | **70** pares en dos temas; el más ajustado, 1,09:1 sobre un mínimo de 1,05:1 |
| Gate de superficie pública | **19** zonas, cero marcas ajenas fuera del aviso del pie |
| Fuentes autohospedadas | 5 archivos, cero imports a un tercero |
| Presupuesto de monolito | OK — `Layout3DEditor.tsx` **20 199** líneas (bajó desde 20 206) |
| Trinquete de lint | **547 / 547**, la curva no subió |
| Integridad de comandos | **192** comandos, **0** éxitos falsos |
| Candado legal | versión vigente con hash íntegro y espejo web/API coincidente |
| Dirección de imports | **566** archivos de `lib/` sin dependencias hacia `components/` ni `app/` |
| **La Jornada Real** (full-stack, sin mocks) | **10 / 10** contra la API NestJS real y PostgreSQL |
| **Suite de navegador completa** (goldens + público + full-stack real) | **172 / 172**, 0 fallos, en 39,7 min |

### Qué NO cubrió esa corrida, dicho por su nombre

19 pruebas se saltaron, y las dos razones son las declaradas del repositorio, no
un descuido:

- **10 de `e2e/performance/`**, por `CAD_PERF_E2E=0` — que es exactamente lo que
  pone el job de E2E en CI: la suite de medida vive en su propio carril
  (`e2e-perf`) desde que consumir su techo de una hora dejó a `main` cinco días
  sin veredicto de corrección.
- **9 de `dwg-import-real.spec.ts`**, que exigen `VALLE_DWG_CORPUS_MIRROR`
  apuntando al repo hermano; CI lo clona, esta máquina no lo tiene.

Con una consecuencia que conviene escribir en vez de dejar implícita: el retoque
de `cad-viewport-100k.spec.ts` —lee el identificador del detalle técnico, porque
salió del titular del panel— **no se ejecutó**. Corre en el job de rendimiento,
que sólo se dispara fuera de los pull requests. Lo que sí está verificado es la
forma del localizador: el mismo patrón `[title^="Identificador técnico:"]` es el
que usan los goldens 12 y 22, y los dos pasan.

### La corrida sucia y la limpia

La primera pasada terminó en **170 / 2**. Los dos fallos —el golden 22 y la
prueba de accesibilidad móvil— se arreglaron DESPUÉS de que corrieran, así que
ese 170 era un número parcheado, no un veredicto. Se reconstruyó el árbol y se
volvió a correr la suite entera: **172 / 172**. Un recuento al que se le quitan
los fallos a mano no es una medida; es una opinión con formato de tabla.

---

## 7. Antes y después

Dieciséis pares en [`../design/before-after/`](../design/before-after/) con
sufijo `-firma-antes` / `-firma-despues`. El «antes» **no** son capturas viejas:
es `a7a33d8` construido en un worktree y fotografiado con **los mismos scripts,
misma resolución, mismo tema, mismo encuadre**. Lo único que cambia entre las dos
columnas es el producto.

Y hay un detalle en el «antes» que vale por todo este informe: en
`portada-fold-dark-firma-antes.png`, el panel derecho del editor enseña
dieciocho filas de `cad_mt60y4ol_uzfo`. Ése era el estado real del producto que
el dueño estaba mirando cuando dijo que no lo sentía suyo.

---

## 8. Cómo se comprueba todo esto

```bash
npm run check:contrast     # 70 pares de contraste en los dos temas
npm run check:surface      # 19 zonas públicas sin marcas ajenas, y el aviso montado
npm run check:fonts        # las tres familias, autohospedadas
npm run check:monolith-budget
npm run check:lint-budget
npm run test               # specs de web, API y paquetes
cd apps/api && npm run test:pg          # contra PostgreSQL real
cd apps/web && npx playwright test      # goldens + full-stack real
```

---

## 9. Lo que sigue, en orden de valor

1. **`reset-password` con `PasswordField`.** Es la otra pantalla donde alguien
   ELIGE una contraseña y hoy no tiene ni mostrar/ocultar ni medidor.
2. **Invitación por lote en el servidor**, con atomicidad y un solo veredicto de
   asientos.
3. **Entrar con Google y Microsoft**, con la decisión de fusión de cuentas
   tomada antes de escribir la primera línea.
4. **Encender el modo universitario**: dos variables de entorno y una migración,
   cuando el dueño decida los dominios y la capacidad de soporte.
5. **Regenerar las capturas del producto** cada vez que el cromo del estudio
   cambie: el script existe justamente para que no envejezcan en silencio.
