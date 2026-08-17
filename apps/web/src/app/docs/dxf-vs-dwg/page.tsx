import type { Metadata } from "next";
import {
  GuideArticle,
  GuideLimit,
  GuideSection,
  guideMetadata,
} from "../GuideShell";

/**
 * Guía de captación #2, y la más delicada del conjunto.
 *
 * "DXF vs DWG" es una búsqueda con intención de compra: quien la teclea está
 * evaluando si puede cambiar de herramienta. Justo por eso es donde más tienta
 * el eufemismo. Aquí no se usa ninguno: ADR-0004 prohíbe expresamente que la
 * documentación, la interfaz o el marketing digan "compatible con DWG", y
 * ADR-0007 añade que la investigación aislada de `packages/dwg-codec/` no
 * implica disponibilidad en el producto. La guía lo dice en la primera línea
 * del apartado que toca, no en una nota al pie.
 */
export const metadata: Metadata = guideMetadata("dxf-vs-dwg");

export default function Page() {
  return (
    <GuideArticle slug="dxf-vs-dwg">
      <GuideSection title="Dos formatos que la gente confunde a diario">
        <p>
          En un despacho se dice «mándame el DWG» como se dice «mándame el
          archivo». Pero DWG y DXF no son lo mismo, y la diferencia decide con
          qué herramientas puedes trabajar.
        </p>
        <p>
          <strong>DWG</strong> es el formato nativo y propietario de AutoCAD. Es
          binario, cambia con cada generación del programa y su especificación no
          es pública. Leerlo bien exige una biblioteca con licencia del titular
          del formato o de un proveedor autorizado.
        </p>
        <p>
          <strong>DXF</strong> nació precisamente para lo contrario: es el
          formato de intercambio de dibujo, publicado, y en su variante de texto
          se puede abrir con un editor cualquiera y leer los pares de código y
          valor uno por uno. Por eso es el formato con el que hablan entre sí
          programas de fabricantes distintos.
        </p>
        <p>
          Traducido a tu día a día: DWG es el idioma materno de un programa
          concreto; DXF es el idioma común. Un archivo que viaja entre despachos,
          entre disciplinas o entre herramientas viaja mejor en DXF.
        </p>
      </GuideSection>

      <GuideSection title="Qué hace exactamente Valle Design">
        <p>
          Valle Design importa y exporta <strong>DXF de texto</strong>. La
          exportación escribe DXF de AutoCAD 2000, que es la versión mínima capaz
          de representar honestamente las entidades que emitimos —una elipse, por
          ejemplo, no existe en versiones anteriores—.
        </p>
        <p>Lo que viaja hoy en los dos sentidos:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Líneas, polilíneas con arcos, círculos, arcos, elipses y splines.</li>
          <li>Texto y texto de párrafo.</li>
          <li>Sombreados, cotas y directrices múltiples.</li>
          <li>Bloques y sus inserciones, con atributos.</li>
          <li>Capas, estilos de texto y nombres de aplicación registrados.</li>
        </ul>
        <p>
          Y lo más importante para un despacho: al exportar se emite un{" "}
          <strong>manifiesto de pérdidas</strong>. No es un aviso genérico de
          «puede haber diferencias»: es una lista entidad por entidad de qué se
          degradó y por qué. Una tabla que sale como geometría en vez de tabla
          editable, una imagen que viaja como referencia y no incrustada, un muro
          paramétrico que se convierte en su contorno. Antes de exportar hay
          además una comprobación previa que separa lo que impide entregar de lo
          que sólo conviene revisar.
        </p>
      </GuideSection>

      <GuideSection title="Qué NO hace, dicho sin rodeos">
        <p>
          <strong>Valle Design no abre ni escribe archivos DWG.</strong> No es
          una limitación temporal disfrazada: es una decisión documentada. Sin
          una biblioteca con licencia del titular del formato, cualquier lectura
          de DWG sería una reconstrucción aproximada, y un plano aproximado es
          peor que un plano que no abre, porque el error no se ve hasta que ya
          está en obra.
        </p>
        <p>
          Por eso el editor <em>detecta</em> el formato y lo rechaza con un
          mensaje claro en lugar de intentarlo. Renombrar un archivo tampoco
          sirve: cambiarle la extensión a un DXF no lo convierte en DWG, ni al
          revés.
        </p>
      </GuideSection>

      <GuideSection title="Cómo se resuelve en la práctica">
        <p>
          El camino es corto y lo puede hacer quien te manda el archivo, en el
          programa que ya usa:
        </p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Abre el dibujo en el programa donde vive y elige «Guardar como».
          </li>
          <li>
            Selecciona <strong>DXF</strong> en su variante <strong>ASCII</strong>{" "}
            (de texto), no binaria.
          </li>
          <li>
            Elige una versión de 2000 o posterior. Las versiones muy antiguas
            pierden entidades por su cuenta.
          </li>
          <li>
            Antes de mandarlo, que purgue el dibujo y descongele las capas que
            deben viajar.
          </li>
        </ol>
        <p>
          En sentido contrario, cuando entregas: exporta a DXF desde Valle
          Design, lee el manifiesto de pérdidas y ábrelo una vez en el programa
          que lo va a consumir. Ese último paso no sobra nunca, en ninguna
          herramienta ni en ningún flujo.
        </p>
      </GuideSection>

      <GuideSection title="Los límites que debes conocer antes de decidir">
        <GuideLimit>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              La importación admite archivos de hasta 12 MB y 50.000 entidades.
              Por encima de eso hay que partir el dibujo.
            </li>
            <li>
              La exportación es de geometría plana: las coordenadas Z se aplanan
              a cero.
            </li>
            <li>
              Las splines racionales pierden sus pesos, y los sistemas de
              coordenadas de objeto, las extrusiones y los anchos de polilínea
              todavía no viajan.
            </li>
            <li>
              Algunas entidades poco comunes en un plano 2D —sólidos 3D o
              directrices del tipo antiguo— se descartan al leer el archivo sin
              aparecer siquiera en la lista de avisos.
            </li>
            <li>
              El juego de pruebas de ida y vuelta es propio y está versionado en
              el repositorio. Todavía no hay un conjunto de archivos de terceros
              con licencia para publicar una matriz de interoperabilidad, así que
              no afirmamos compatibilidad universal con lo que produzca cualquier
              programa.
            </li>
          </ul>
        </GuideLimit>
        <p>
          Si tu flujo de trabajo depende de entregar el archivo nativo de
          AutoCAD, hoy Valle Design no es la herramienta. Si lo que necesitas es
          producir planos y entregarlos en un formato que cualquiera pueda abrir,
          el intercambio en DXF cubre ese camino con las pérdidas escritas
          delante.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          AutoCAD y DWG son marcas de Autodesk, Inc. Valle Design no está
          afiliado a Autodesk ni respaldado por Autodesk.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
