# Sesión con un arquitecto de verdad

## Por qué existe este documento

`docs/execution/CAD_ACCEPTANCE_JOURNEY_IV.md` declara 50 pasos con evidencia
ejecutable, 45 de ellos `browser-proven`. Eso demuestra que el código corre. No
demuestra que una persona que no escribió ese código pueda hacer los 50 pasos
sin que nadie le diga cómo.

Esa diferencia es la que decide si un despacho paga 199 al mes. Un arquitecto
no abandona AutoCAD por una tabla de capacidades: lo abandona cuando comprueba
que su martes normal sale igual de bien. Y no lo comprueba leyendo, lo
comprueba intentándolo.

Esta guía es el procedimiento para esa tarde. Dura entre 90 y 120 minutos.

## La regla que hace o rompe la sesión

**No ayudes.** Ni una vez. Ni aunque duela.

Cuando el arquitecto se atasca, el impulso de decir «está en el menú de la
derecha» es casi irresistible, y es exactamente el dato que has ido a buscar.
Un atasco resuelto por ti es un atasco que el siguiente cliente vivirá solo, en
su oficina, sin nadie a quien preguntar, y por el que cancelará la
suscripción sin decirte por qué.

Si se atasca: cronometra, anota qué intentó, y espera. Si a los tres minutos
sigue atascado, apúntalo como fallo y pásale la siguiente tarea. Sólo entonces
puedes enseñarle cómo era, si él quiere saberlo.

Corolarios, todos aprendidos por gente que arruinó su primera sesión:

- **No expliques el producto antes de empezar.** Ni un tour, ni «esto es como
  el AutoCAD pero…». Siéntalo delante y dale la primera tarea.
- **No defiendas nada.** Cuando diga «esto está mal hecho», la respuesta es
  «¿qué esperabas que pasara?», no una explicación de por qué está así.
- **No preguntes si le gusta.** Te dirá que sí por educación. Pregunta qué
  haría después, y observa qué hace.
- **Cállate.** El silencio incómodo es la herramienta. Aguántalo.

## Antes de que llegue

1. **Máquina y arranque.** Un solo equipo, el del despacho si se puede, no el
   de desarrollo. Deja el producto ya abierto y con sesión iniciada: la sesión
   es sobre dibujar, no sobre darse de alta.
2. **Sus propios archivos.** Pídele con antelación que traiga **dos planos
   reales suyos** con los que haya trabajado esta semana, y el formato en que
   los tenga. Si trae un formato que el producto no acepta, no lo conviertas
   tú: eso ya es el primer hallazgo y se anota tal cual.
3. **Grabación.** Pantalla y audio, con su permiso explícito y grabado al
   principio. La cara no hace falta; las manos y el cursor, sí. Si dice que no,
   la sesión se hace igual y tomas notas a mano: su permiso no se negocia ni se
   insiste.
4. **Un cronómetro por tarea** y esta guía impresa para ir anotando encima.
5. **Un segundo observador**, si puede ser, que sólo anote. El que dirige no
   ve la mitad de lo que pasa.

## Las tareas

Se dan **como se las daría un cliente**, no como pasos de software. Nada de
«usa el comando de sombreado»: eso le enseña el producto y arruina la medida.
Lee la tarea en voz alta, entrégala escrita, y cállate.

Cronometra cada una. Anota **el tiempo hasta que lo consigue** o **el momento
en que se rinde**.

### Tarea 1 · El archivo del cliente entra (15 min)
> «Este es el plano que te mandó el cliente. Ábrelo y dime si llegó completo.»

Usa **su** archivo, no uno nuestro. Lo que importa no es que abra: es si él
sabe decir que llegó completo, y si tiene razón. Si algo se perdió y él no lo
nota, apúntalo aparte: un cliente que no nota lo que se perdió es un cliente
que descubre el problema en obra.

### Tarea 2 · Dibujar sobre lo que llegó (20 min)
> «Añade el muro que falta en la fachada norte, en su capa, con el grosor que
> usas normalmente.»

Aquí se mide lo esencial: capas, precisión, referencia a objetos, y si el muro
se une con los que ya estaban.

### Tarea 3 · Que el plano diga lo que mide (20 min)
> «Acota esa crujía y ponle el texto que llevaría para obra.»

Cotas y texto. Observa si las cotas siguen al muro cuando lo mueve, porque el
día que no lo hagan, lo descubrirá con el plano ya impreso.

### Tarea 4 · Los acabados (15 min)
> «Raya el piso de la recámara con el patrón que uses para el acabado.»

Sombreado. Si la habitación tiene un hueco dentro —una columna, un muro—,
observa qué pasa con el hueco. Es donde suele romperse.

### Tarea 5 · Sale a imprimir (20 min)
> «Necesito esto en PDF, a escala 1:50, tamaño carta, para llevarlo a obra.»

La escala es la prueba. Si sale a una escala que no es 1:50 y él no lo nota,
es un fallo grave aunque el PDF se vea bien: en obra se mide con escalímetro.

### Tarea 6 · Vuelve al cliente (10 min)
> «Devuélveselo al cliente en el mismo formato en que te lo mandó.»

Ida y vuelta completa. Ábrelo después en su AutoCAD, delante de él, y que sea
**él** quien diga si está bien.

### Tarea 7 · La pregunta que vale la sesión (5 min)
> «Es martes, tienes esto que entregar hoy, y sólo tienes este programa.
> ¿Qué haces?»

La respuesta honesta a esa pregunta es el resultado de la tarde.

## Qué anotar, tarea por tarea

| Campo | Qué es |
| --- | --- |
| Tiempo | Segundos hasta conseguirlo, o hasta que se rinde |
| Desenlace | `lo hace solo` · `lo hace tras atascarse` · `se rinde` · `cree que lo hizo y está mal` |
| Primer intento | Qué buscó primero, aunque no existiera. Eso es dónde lo esperaba |
| Palabra que usó | Cómo lo llamó él. Si el producto lo llama de otra forma, es un fallo de nombre |
| Cita literal | Lo que dijo, con sus palabras y sus groserías si las hubo |

**«Cree que lo hizo y está mal» es la categoría más grave de todas**, por
encima de «se rinde». Quien se rinde pregunta; quien entrega un plano mal
escalado pierde un cliente y no vuelve nunca. Márcalo en rojo.

## Severidad, para no discutirla después

- **Bloqueante** — no puede terminar un encargo que hoy termina en AutoCAD.
- **Silencioso** — el producto da un resultado equivocado con apariencia
  correcta. Se trata como bloqueante aunque la tarea «se complete».
- **Fricción** — lo consigue, pero por un camino que él no habría encontrado
  solo. Suma: tres fricciones en una tarde cancelan igual que un bloqueante.
- **Cosmético** — le molesta y no le impide nada.

## El cierre, en caliente

Las cinco preguntas, en este orden y sin adornarlas:

1. ¿Qué fue lo peor?
2. ¿Qué esperabas que estuviera y no estaba?
3. Si esto costara 199 al mes y AutoCAD 2.179, ¿qué usarías el lunes?
4. ¿Qué tendría que ser verdad para que cambiaras?
5. ¿A quién de tu despacho **no** se lo pondrías delante, y por qué?

La 3 casi siempre se contesta «AutoCAD», y está bien: lo que importa es la
razón, porque esa razón es la lista de trabajo. La 5 destapa lo que la 3
esconde por cortesía.

## Después

Dentro de las 24 horas siguientes, mientras se recuerda:

1. Un archivo por hallazgo, con la cita literal y el minuto de la grabación.
2. Cada bloqueante y cada silencioso se convierte en un spec que **falla hoy**.
   Se comitea en rojo, con la cita del arquitecto en el comentario. Un fallo que
   sólo vive en un documento se olvida; uno que rompe la suite, no.
3. Los pasos de `CAD_ACCEPTANCE_JOURNEY_IV.md` que la sesión desmintió se
   anotan ahí mismo: siguen siendo `browser-proven` y además ahora se sabe que
   una persona no los consigue. Las dos cosas son ciertas y las dos importan.
4. Lo que la sesión mida se publica tal cual salga. Si sale mal, ese es el
   resultado. Un arquitecto que se rinde en la tarea 5 vale más que veinte
   puntos de cualquier rúbrica, y sólo vale si se apunta.
