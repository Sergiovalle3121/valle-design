import type { Metadata } from "next";
import {
  GuideArticle,
  GuideLimit,
  GuideSection,
  guideMetadata,
} from "../GuideShell";

/**
 * Guía de captación #5. Es el último metro del embudo y el primero donde un
 * plano se echa a perder: la escala. Toda la guía se apoya en lo que el motor
 * de trazado hace de verdad —papeles, escalas normalizadas, tablas de plumas,
 * emisión del PDF con el tamaño de página exacto— y declara el único límite
 * abierto, que es la fidelidad tipográfica.
 */
export const metadata: Metadata = guideMetadata("imprimir-planos-pdf-escala");

export default function Page() {
  return (
    <GuideArticle slug="imprimir-planos-pdf-escala">
      <GuideSection title="Dibujar a tamaño real, imprimir a escala">
        <p>
          Un plano bien hecho vive dos vidas. En el espacio modelo se dibuja a
          tamaño real: un muro de tres metros mide tres metros, sin trucos. En la
          presentación se prepara la hoja de papel, con su tamaño en milímetros,
          su cajetín y sus ventanas.
        </p>
        <p>
          La escala es el puente entre las dos. Cuando dices 1:50, estás diciendo
          que cada milímetro del papel representa cincuenta milímetros de la
          realidad. Por eso una escala normalizada importa tanto: permite medir
          sobre la lámina impresa con un escalímetro y obtener la medida real. Un
          plano impreso «para que quepa» no se puede medir, y eso lo convierte en
          una ilustración.
        </p>
      </GuideSection>

      <GuideSection title="Paso 1. Crea la presentación y elige el papel">
        <p>
          Con <code>LAYOUT</code> creas la presentación. Los tamaños disponibles
          cubren lo que se usa en un despacho: A4, A3, A2, A1 y A0 de la serie
          ISO, más carta y tabloide, y también un tamaño a medida si lo
          necesitas.
        </p>
        <p>
          Elige el papel pensando en la escala a la que quieres entregar, no al
          revés. Una planta de vivienda de 12 por 9 metros entra cómodamente en
          un A3 a 1:100 y necesita un A1 para salir a 1:50. Decidirlo ahora evita
          rehacer el cajetín al final.
        </p>
      </GuideSection>

      <GuideSection title="Paso 2. Abre las ventanas y dale a cada una su escala">
        <p>
          Con <code>MVIEW</code> abres las ventanas de la presentación. Cada
          ventana es una mirilla al espacio modelo, y cada una tiene su propia
          escala. Eso es lo que permite poner la planta general a 1:100 y, en la
          misma lámina, un detalle constructivo a 1:10.
        </p>
        <p>
          La escala se indica por su denominador: escribes 50 para 1:50. Las
          escalas normalizadas van desde 1:1 hasta 1:5000, pasando por las que se
          usan a diario: 1:20, 1:25, 1:50, 1:75, 1:100, 1:200, 1:500. Si prefieres
          que la elija el programa, hay un ajuste automático que toma la mayor
          escala normalizada que quepa en el papel: nunca inventa una escala
          intermedia sólo para llenar la hoja.
        </p>
        <p>
          Dos costumbres que ahorran disgustos: congela en cada ventana las capas
          que no deben aparecer en esa lámina —así el plano de instalaciones no
          se cuela en la de arquitectura— y bloquea la ventana cuando la escala
          esté bien, para que un zoom accidental no te la cambie.
        </p>
      </GuideSection>

      <GuideSection title="Paso 3. El texto y las cotas se miden en el papel">
        <p>
          Este es el punto donde más planos se estropean. La altura de un texto o
          de una cota no se decide en el dibujo: se decide en el papel. Un rótulo
          legible mide entre 2,5 y 3,5 milímetros impreso, y punto.
        </p>
        <p>
          Lo que cambia es cuánto tiene que medir ese texto en el modelo para
          salir de ese tamaño. A 1:50, un texto de 2,5 milímetros en papel debe
          medir 125 unidades en un dibujo en milímetros; a 1:100, 250. Si tienes
          una lámina con una ventana a 1:100 y un detalle a 1:5, el mismo rótulo
          no puede servir para las dos: el comportamiento anotativo existe
          justamente para que la misma anotación salga a 2,5 milímetros en ambas.
        </p>
      </GuideSection>

      <GuideSection title="Paso 4. Configura la página antes de trazar">
        <p>
          Con <code>PAGESETUP</code> defines cómo se traza la lámina. Lo que
          decides aquí:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Qué área se traza:</strong> la presentación completa, los
            límites del dibujo, la extensión de lo dibujado, una ventana que
            señalas o lo que se ve en pantalla.
          </li>
          <li>
            <strong>La escala del trazado:</strong> ajustar al papel o una
            proporción explícita entre milímetros de papel y unidades de dibujo.
          </li>
          <li>
            <strong>Márgenes, centrado y desplazamiento</strong> dentro de la
            hoja.
          </li>
          <li>
            <strong>La tabla de plumas:</strong> el archivo que decide con qué
            color y qué grosor sale cada trazo. Se admiten tablas por color y
            tablas con estilos nombrados, y las habituales monocromas para
            entregar en blanco y negro.
          </li>
        </ul>
        <p>
          Antes de emitir nada hay una comprobación previa que avisa de los dos
          fallos clásicos: que el dibujo se sale del área imprimible del papel
          elegido y que falta la tabla de plumas que la configuración esperaba.
          Los dos se corrigen en un minuto antes de trazar y cuestan una
          reimpresión después.
        </p>
      </GuideSection>

      <GuideSection title="Paso 5. Emite el PDF">
        <p>
          Con <code>PLOT</code> sale el PDF: una página por hoja, con el tamaño
          de página exacto del papel configurado, y los trazos con el color y el
          grosor que dictó la tabla de plumas. El cajetín lleva su escala escrita
          y la lámina puede llevar su barra de escala gráfica, que es la que
          sobrevive a una fotocopia reducida.
        </p>
        <p>
          Sobre las fuentes conviene entender una cosa: un PDF puede llevarlas de
          dos maneras. Las catorce familias estándar del formato —Helvetica,
          Times, Courier— no viajan dentro del archivo porque todos los visores
          las tienen, y se ven igual en cualquier sitio. Cualquier otra familia
          tiene que ir incrustada o el visor la sustituirá, y una sustitución
          cambia las anchuras y descoloca los rótulos del cajetín.
        </p>
        <p>
          Valle Design hace las dos cosas: si recibe el programa de la fuente, la
          incrusta; si no, mapea la familia a la estándar más cercana y{" "}
          <strong>lo deja escrito en el resultado del trazado</strong>. Nunca
          afirma haber incrustado una fuente que no tenía.
        </p>
      </GuideSection>

      <GuideSection title="Comprobación antes de entregar">
        <ol className="list-decimal space-y-2 pl-6">
          <li>Abre el PDF y mide una distancia conocida con el escalímetro.</li>
          <li>
            Comprueba que la escala del cajetín coincide con la de la ventana
            principal.
          </li>
          <li>
            Revisa que ninguna cota aparezca marcada como desasociada.
          </li>
          <li>
            Mira los grosores: si todo sale del mismo trazo, la tabla de plumas
            no se aplicó.
          </li>
          <li>
            Verifica que los rótulos del cajetín no se salen de su recuadro; si
            lo hacen, es señal de sustitución de fuente.
          </li>
        </ol>
        <GuideLimit>
          <p>
            Todavía no publicamos una medición de fidelidad tipográfica ni un
            objetivo de tiempo de publicación con máquina declarada. El emisor te
            dice qué fuentes incrustó y cuáles sustituyó, pero la comprobación
            visual del cajetín sigue siendo tuya en esta versión.
          </p>
        </GuideLimit>
      </GuideSection>
    </GuideArticle>
  );
}
