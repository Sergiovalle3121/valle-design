import type { Metadata } from "next";
import {
  GuideArticle,
  GuideLimit,
  GuideSection,
  guideMetadata,
} from "../GuideShell";

/**
 * Guía de captación #4. Es la que mejor explica por qué un CAD no es un
 * programa de dibujo con capas: la asociatividad. El argumento comercial y el
 * argumento técnico son el mismo, así que la guía no necesita adornar nada.
 */
export const metadata: Metadata = guideMetadata("acotacion-asociativa");

export default function Page() {
  return (
    <GuideArticle slug="acotacion-asociativa">
      <GuideSection title="La cota que miente">
        <p>
          Casi todos los errores caros de obra que nacen en un plano tienen la
          misma forma: alguien movió una línea y el número que la medía se quedó
          donde estaba. El plano se ve bien. El número se lee bien. Y no
          corresponde a nada.
        </p>
        <p>
          Pasa porque hay dos maneras muy distintas de poner una medida en un
          dibujo, y desde lejos parecen la misma. Una es escribir un texto que
          dice «3.45». La otra es colocar una cota que mide, de verdad, la
          distancia entre dos puntos concretos de la geometría. La primera es una
          etiqueta; la segunda es un instrumento.
        </p>
      </GuideSection>

      <GuideSection title="Qué significa «asociativa»">
        <p>
          Una cota asociativa no guarda un número: guarda a qué está enganchada.
          Al colocarla, queda amarrada a puntos identificables del dibujo —el
          extremo de una línea, el centro de un círculo, el arranque de un arco—
          y el valor se calcula a partir de ellos.
        </p>
        <p>
          La consecuencia es la que buscas: cuando mueves, estiras o giras esa
          geometría, la cota se regenera sola. No hay que acordarse, ni revisar,
          ni volver a acotar. En Valle Design esa regeneración no es una utilidad
          aparte que haya que invocar: está en el camino por el que pasan todas
          las modificaciones de entidades, de modo que cualquier comando que
          cambie la geometría deja las cotas al día.
        </p>
        <p>Los puntos a los que una cota puede engancharse hoy son:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>El inicio y el final de una línea o de una spline.</li>
          <li>El centro de un círculo, de un arco o de una elipse.</li>
          <li>El arranque y el final del arco.</li>
          <li>Los extremos del eje mayor de una elipse.</li>
          <li>Los puntos de control de una spline.</li>
          <li>El punto de inserción de un texto de párrafo.</li>
        </ul>
      </GuideSection>

      <GuideSection title="Cuando el enganche se rompe, se dice">
        <p>
          ¿Y si borras la línea que una cota medía? Aquí es donde se separan las
          herramientas serias de las que no lo son. La respuesta fácil sería
          dejar la cota con su último valor: el plano seguiría viéndose
          impecable y estaría mintiendo.
        </p>
        <p>
          Lo que hace Valle Design es marcar esa cota como{" "}
          <strong>desasociada</strong>. La cota sigue ahí —no se borra tu
          trabajo— pero queda señalada como lo que es: un número que ya no está
          respaldado por nada. Revisar las cotas desasociadas antes de publicar
          es un paso de dos minutos que evita una llamada desde la obra.
        </p>
      </GuideSection>

      <GuideSection title="Los tipos de cota que tienes disponibles">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Lineal</strong> (<code>DIMLINEAR</code>, alias{" "}
            <code>DLI</code>): distancias horizontales y verticales. Es la que
            más vas a usar en una planta.
          </li>
          <li>
            <strong>Alineada</strong> (<code>DIMALIGNED</code>): mide en la
            dirección real del elemento, no en la del papel.
          </li>
          <li>
            <strong>Angular</strong> (<code>DIMANGULAR</code>): el ángulo entre
            dos elementos.
          </li>
          <li>
            <strong>Radio y diámetro</strong> (<code>DIMRADIUS</code> y{" "}
            <code>DIMDIAMETER</code>): para arcos y círculos.
          </li>
          <li>
            <strong>Longitud de arco</strong>: para desarrollos curvos.
          </li>
        </ul>
        <p>
          El aspecto lo gobierna el estilo de cota (<code>DIMSTYLE</code>):
          altura y posición del texto, tipo de marca en el extremo —flecha
          abierta, marca inclinada de arquitectura o punto—, unidades del valor
          y precisión decimal. Definir el estilo del despacho una vez y aplicarlo
          es lo que hace que un juego de planos se lea como un juego y no como
          cinco archivos sueltos.
        </p>
      </GuideSection>

      <GuideSection title="No sólo las cotas: el sombreado y las llamadas también">
        <p>
          La misma idea se aplica a otras dos cosas que suelen quedarse atrás
          cuando el dibujo cambia. El <strong>sombreado</strong> queda asociado a
          su contorno: si modificas el contorno, el relleno lo sigue en vez de
          quedarse flotando fuera del área. Y las <strong>directrices
          múltiples</strong> mantienen su punto de anclaje sobre la geometría a
          la que apuntan, de modo que una llamada no se queda señalando el aire
          cuando mueves el elemento que describe.
        </p>
      </GuideSection>

      <GuideSection title="Cómo acotar para que la asociatividad funcione">
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Usa siempre las referencias a objetos al indicar los puntos de la
            cota. Es lo que crea el enganche; hacer clic «cerca» del extremo crea
            una cota que mide el sitio donde hiciste clic, no el extremo.
          </li>
          <li>
            Define el estilo de cota antes de acotar, no después de tener
            doscientas.
          </li>
          <li>
            Ten las cotas en su propia capa: podrás apagarlas mientras dibujas y
            controlar su grosor de trazo al imprimir.
          </li>
          <li>
            Antes de publicar, revisa que no quedan cotas desasociadas. Es la
            comprobación con mejor relación entre tiempo invertido y error
            evitado de toda la entrega.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="Qué esperar al intercambiar el archivo">
        <p>
          Las cotas viajan en la exportación DXF y vuelven a entrar en la
          importación, con la información propia que Valle Design registra para
          reconstruir el enganche. En un ida y vuelta dentro de Valle Design la
          asociatividad se conserva.
        </p>
        <GuideLimit>
          <p>
            Cuando el archivo se abre en otro programa, la asociatividad depende
            de cómo ese programa interprete la información adicional del archivo.
            Trátalo como lo que es: la geometría y los valores viajan; el
            enganche, no siempre. Si vas a entregar el archivo para que alguien
            lo siga editando, avísalo.
          </p>
          <p>
            Y una cota colocada apuntando al vacío en lugar de a un punto de la
            geometría nace sin asociación. Se ve igual, pero no se actualizará
            nunca.
          </p>
        </GuideLimit>
      </GuideSection>
    </GuideArticle>
  );
}
