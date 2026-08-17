import type { Metadata } from "next";
import {
  GuideArticle,
  GuideLimit,
  GuideSection,
  guideMetadata,
} from "../GuideShell";

/**
 * Guía de captación #1. Es la que más tráfico debería traer —"cómo dibujar una
 * planta arquitectónica" es una búsqueda de intención clarísima— así que el
 * texto tiene que aguantar la comparación con la práctica real del despacho: si
 * alguien la sigue paso a paso, tiene que llegar a la lámina. Cada comando
 * citado existe en el registro del editor; los que no existen no se citan.
 */
export const metadata: Metadata = guideMetadata("dibujar-planta-arquitectonica");

export default function Page() {
  return (
    <GuideArticle slug="dibujar-planta-arquitectonica">
      <GuideSection title="Antes de la primera línea: decide la unidad">
        <p>
          El error más caro de una planta no se comete dibujando, se comete
          antes: no acordar en qué unidad se trabaja. Si el documento está en
          milímetros, un muro de 15 centímetros se dibuja con un grosor de 150.
          Si está en metros, ese mismo muro es 0.15. Todo lo que viene después
          —las cotas, las escalas de impresión, el tamaño del texto— depende de
          esa decisión, y cambiarla a mitad del plano significa rehacer la
          acotación.
        </p>
        <p>
          La convención más común en despachos mexicanos para obra es dibujar en
          metros a tamaño real y dejar que la escala de impresión haga el resto.
          Dibujar a tamaño real no es opcional ni un capricho: es lo que permite
          medir sobre el dibujo, calcular superficies y que la lámina impresa a
          1:50 diga la verdad.
        </p>
      </GuideSection>

      <GuideSection title="Paso 1. Prepara las capas antes de dibujar">
        <p>
          Una planta sin capas se convierte en un plano imposible de mantener a
          la tercera revisión. Abre el gestor de capas y crea, como mínimo, esta
          estructura:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>MUROS</strong>, con grosor de línea grueso: es la línea que
            manda en la lectura del plano.
          </li>
          <li>
            <strong>EJES</strong>, con un tipo de línea de eje y color tenue.
          </li>
          <li>
            <strong>COTAS</strong> y <strong>TEXTOS</strong>, separadas de la
            geometría para poder apagarlas cuando trabajas.
          </li>
          <li>
            <strong>MOBILIARIO</strong> y <strong>REFERENCIA</strong>, para todo
            lo que se dibuja pero no se construye.
          </li>
        </ul>
        <p>
          Cada capa lleva su color, su tipo de línea y su grosor de línea. Ese
          grosor es el que después traducirá la tabla de plumas al imprimir, así
          que asignarlo bien ahora ahorra pelear con la impresión al final. Las
          capas se pueden apagar, congelar, bloquear y aislar; bloquear la capa
          de ejes mientras dibujas muros evita moverlos sin querer.
        </p>
      </GuideSection>

      <GuideSection title="Paso 2. Traza los ejes y luego los muros">
        <p>
          Dibuja primero la retícula de ejes con líneas en la capa EJES. Es la
          estructura sobre la que se apoyará todo lo demás y la referencia a la
          que engancharás los muros.
        </p>
        <p>
          Después usa el comando <code>WALL</code> para los muros. A diferencia
          de dibujar dos líneas paralelas, el muro guarda su receta —eje, grosor
          y altura— en lugar de un contorno fijo. Eso tiene una consecuencia muy
          concreta y muy útil: al encadenar tramos, las uniones se resuelven
          solas. La esquina se ingletea, el muro que llega a otro por el centro
          hace su empalme en T, y dos tramos alineados se continúan sin dejar la
          costura de sus testeros. Si mueves un muro, las uniones se rehacen
          solas, porque nunca se guardaron: se derivan cada vez que se dibuja.
        </p>
        <p>
          Un detalle que conviene conocer: las uniones sólo se calculan cuando
          los extremos coinciden de verdad. La tolerancia es minúscula a
          propósito. No se sueldan dos muros que dejaste separados un
          centímetro, porque eso sería cambiarte el dibujo que hiciste por otro
          que no hiciste. Usa las referencias a objetos para encadenar y las
          uniones aparecerán solas.
        </p>
        <GuideLimit>
          <p>
            Las puertas y las ventanas todavía no son entidades alojadas en el
            muro: se colocan como bloques encima. El muro aún no recorta su
            hueco, así que hoy el vano se resuelve con el bloque y, si lo
            necesitas limpio, partiendo el tramo de muro.
          </p>
        </GuideLimit>
      </GuideSection>

      <GuideSection title="Paso 3. Dibuja con precisión, no con puntería">
        <p>
          Un plano no se dibuja a ojo. Tres ayudas hacen todo el trabajo:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Referencias a objetos:</strong> engancha el cursor a un
            extremo, un punto medio, una intersección, un centro o una
            perpendicular. Es lo que garantiza que los extremos coincidan
            exactamente y que las uniones de muro se resuelvan.
          </li>
          <li>
            <strong>Rastreo polar:</strong> fija los ángulos de trabajo para que
            las ortogonales salgan ortogonales y los quiebres a 45 grados sean
            exactos.
          </li>
          <li>
            <strong>Entrada por teclado:</strong> escribe la distancia en la
            dirección en la que apuntas y olvídate del zoom. La línea de
            comandos entiende los alias de siempre, así que <code>L</code>
            dibuja línea, <code>C</code> círculo y <code>TR</code> recorta.
          </li>
        </ul>
        <p>
          Cuando la planta tenga forma, limpia con <code>TRIM</code>,{" "}
          <code>EXTEND</code>, <code>FILLET</code> y <code>CHAMFER</code>, y
          resuelve las repeticiones con <code>ARRAY</code> en vez de copiar a
          mano.
        </p>
      </GuideSection>

      <GuideSection title="Paso 4. Acota lo que se va a construir">
        <p>
          Pasa a la capa COTAS y acota con <code>DIMLINEAR</code> (alias{" "}
          <code>DLI</code>) para las medidas ortogonales,{" "}
          <code>DIMALIGNED</code> para las inclinadas, <code>DIMANGULAR</code>{" "}
          para los ángulos y <code>DIMRADIUS</code> o <code>DIMDIAMETER</code>{" "}
          para los arcos. Antes de empezar, define tu estilo de cota con{" "}
          <code>DIMSTYLE</code>: altura de texto, tipo de marca, unidades y
          precisión. Un plano donde cada cota tiene su propio criterio se lee
          como un borrador.
        </p>
        <p>
          Estas cotas son asociativas: quedan amarradas al punto de la geometría
          que miden. Si desplazas un muro, el número se recalcula solo. Y si
          borras aquello que la cota medía, la cota se marca como desasociada en
          lugar de quedarse enseñando un número que ya no corresponde a nada. Esa
          diferencia es la que evita entregar un plano con medidas viejas.
        </p>
      </GuideSection>

      <GuideSection title="Paso 5. Sombrea, rotula y da de alta los bloques">
        <p>
          Con <code>HATCH</code> (alias <code>H</code>) rellenas muros, patios o
          áreas de proyecto; el sombreado queda asociado a su contorno, así que
          si el contorno cambia, el relleno lo sigue. Con <code>MTEXT</code>{" "}
          escribes los rótulos de local, y con <code>MLEADER</code> las
          llamadas con directriz. El mobiliario y las carpinterías conviene
          resolverlos como bloques con <code>BLOCK</code> e <code>INSERT</code>:
          se insertan una vez y se actualizan en todas partes.
        </p>
      </GuideSection>

      <GuideSection title="Paso 6. Arma la presentación y publica">
        <p>
          El dibujo vive en el espacio modelo a tamaño real; la lámina se arma en
          una presentación. Crea una con <code>LAYOUT</code>, abre las ventanas
          con <code>MVIEW</code> y dale a cada una su escala: la planta general a
          1:100 o 1:50, y los detalles a 1:20 o 1:10 en su propia ventana. En
          cada ventana puedes congelar las capas que estorben, de modo que el
          plano de instalaciones no aparezca en la lámina de arquitectura.
        </p>
        <p>
          Después, <code>PAGESETUP</code> para elegir tamaño de papel y tabla de
          plumas, y <code>PLOT</code> para emitir el PDF. La lámina sale con el
          tamaño de página exacto, su cajetín y su escala gráfica. Hay una guía
          entera dedicada a esto, porque es donde más planos se echan a perder.
        </p>
      </GuideSection>

      <GuideSection title="Paso 7. Guarda, versiona y manda a revisión">
        <p>
          El documento vive en el servidor de tu organización. Además del
          guardado explícito hay autoguardado, y ambos pasan por la misma cola,
          así que no compiten entre sí. Puedes crear versiones consultables y
          compararlas para ver qué cambió entre dos entregas.
        </p>
        <p>
          Para que alguien externo lo revise, genera un enlace de revisión: tiene
          caducidad y se puede revocar. Los comentarios quedan anclados a la
          geometría, no sueltos en un correo, de forma que quien los lee sabe a
          qué línea se refieren.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
