import type { Metadata } from "next";
import {
  GuideArticle,
  GuideLimit,
  GuideSection,
  guideMetadata,
} from "../GuideShell";

/**
 * Guía de captación #3. Su público es el más difícil de convencer y el más
 * fiel una vez convencido: el despacho con veinte años de rutinas propias, que
 * no cambia de herramienta si su biblioteca se queda atrás.
 *
 * Por eso esta guía enseña código que corre de verdad y declara dos límites
 * incómodos en lugar de esconderlos: el intérprete es un subconjunto, y la
 * biblioteca de rutinas se guarda hoy en el navegador y no en el servidor.
 */
export const metadata: Metadata = guideMetadata("automatizar-con-autolisp");

const ejemplo = `;; Numera ejes: pide un punto y coloca el texto correlativo
;; en la capa EJES. Intro para terminar.
(defun c:NUMEJES (/ p n)
  (setq n (getint "\\nNumero inicial: "))
  (while (setq p (getpoint "\\nPunto del eje: "))
    (entmake (list '(0 . "TEXT")
                   (cons 8 "EJES")
                   (cons 10 p)
                   (cons 40 0.25)
                   (cons 1 (itoa n))))
    (setq n (1+ n)))
  (princ))`;

export default function Page() {
  return (
    <GuideArticle slug="automatizar-con-autolisp">
      <GuideSection title="Por qué AutoLISP sigue siendo la herramienta correcta">
        <p>
          En casi cualquier despacho hay un archivo con rutinas que nadie
          recuerda haber escrito y que todo el mundo usa: la que numera ejes, la
          que rellena el cajetín, la que saca la tabla de medición de un plano.
          Cada una ahorra minutos por plano y horas por proyecto, y ninguna
          aparece en el presupuesto.
        </p>
        <p>
          Ese conocimiento está escrito en AutoLISP. No migra solo, no lo
          reemplaza un botón nuevo, y un despacho que cambia de herramienta y lo
          pierde acaba trabajando más lento que antes. Por eso Valle Design trae
          su propio intérprete AutoLISP, y por eso corre donde ya estás: en el
          navegador.
        </p>
      </GuideSection>

      <GuideSection title="Qué entiende el intérprete">
        <p>
          Están las formas especiales que estructuran cualquier rutina —
          <code>defun</code>, <code>setq</code>, <code>if</code>,{" "}
          <code>cond</code>, <code>while</code>, <code>repeat</code>,{" "}
          <code>foreach</code>, <code>lambda</code>, <code>progn</code>— y
          alrededor de ciento treinta funciones integradas. Agrupadas por lo que
          te hará falta:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Entidades:</strong> <code>entget</code>, <code>entmod</code>,{" "}
            <code>entmake</code>, <code>entdel</code>, <code>entnext</code>,{" "}
            <code>entlast</code>, <code>entupd</code> y <code>handent</code>. Se
            trabaja con listas de pares de código DXF, igual que siempre.
          </li>
          <li>
            <strong>Conjuntos de selección:</strong> <code>ssget</code>,{" "}
            <code>ssadd</code>, <code>ssdel</code>, <code>sslength</code>,{" "}
            <code>ssmemb</code> y <code>ssname</code>.
          </li>
          <li>
            <strong>Interacción:</strong> <code>getpoint</code>,{" "}
            <code>getcorner</code>, <code>getdist</code>, <code>getangle</code>,{" "}
            <code>getint</code>, <code>getreal</code>, <code>getstring</code>,{" "}
            <code>getkword</code> e <code>initget</code>, más{" "}
            <code>command</code> para invocar los comandos nativos del editor.
          </li>
          <li>
            <strong>Listas, cadenas y números:</strong> desde <code>car</code> y{" "}
            <code>mapcar</code> hasta <code>strcat</code>, <code>substr</code>,{" "}
            <code>rtos</code>, <code>angtos</code> y <code>wcmatch</code>.
          </li>
          <li>
            <strong>Variables de sistema y tablas:</strong> <code>getvar</code>,{" "}
            <code>setvar</code> y <code>tblsearch</code>.
          </li>
          <li>
            <strong>Errores:</strong> la familia <code>vl-catch-all-*</code>,
            para que una rutina que falla no se lleve por delante la sesión.
          </li>
        </ul>
        <p>
          También hay <strong>DCL</strong>: puedes definir un cuadro de diálogo y
          manejarlo con <code>load_dialog</code>, <code>new_dialog</code>,{" "}
          <code>action_tile</code>, <code>set_tile</code>, <code>get_tile</code>{" "}
          y <code>start_dialog</code>. Los elementos disponibles son los
          habituales: botones, cajas de edición, listas, listas desplegables,
          interruptores, columnas de opciones, filas y columnas con y sin marco.
          Si tu diálogo usa un elemento que todavía no sabemos pintar, se te dice
          cuál en lugar de dibujarlo mal.
        </p>
      </GuideSection>

      <GuideSection title="Una rutina completa, de principio a fin">
        <p>
          Esta numera ejes: pregunta el número inicial, y por cada punto que
          señalas escribe el texto correlativo en la capa EJES.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[.04] p-5 text-sm leading-6 dark:border-white/10 dark:bg-white/[.04]">
          <code>{ejemplo}</code>
        </pre>
        <p>
          Se carga desde el panel de rutinas del editor y se invoca escribiendo{" "}
          <code>NUMEJES</code> en la línea de comandos, como cualquier otro
          comando. A partir de ahí es tuya: cámbiale la capa, la altura del texto
          o el prefijo, y tendrás la versión que usa tu despacho.
        </p>
      </GuideSection>

      <GuideSection title="Se ejecuta aislado, y eso te protege a ti">
        <p>
          Una rutina se descarga, se comparte por correo y se hereda de un
          compañero que ya no está. Ejecutar código de origen incierto con acceso
          total sería una mala idea, así que el intérprete corre dentro de un
          entorno aislado con un presupuesto: un tope de pasos de evaluación, un
          tope de memoria de trabajo, un límite de anidamiento y un límite de
          tiempo. Una rutina con un bucle infinito se detiene con un error, no
          congela tu sesión.
        </p>
        <p>
          Y la superficie disponible está cerrada por diseño: desde una rutina no
          se puede abrir una conexión de red, tocar la página ni evaluar código
          arbitrario del navegador. No es una promesa: hay una prueba automática
          que revisa el código del intérprete y falla si alguna de esas puertas
          aparece.
        </p>
      </GuideSection>

      <GuideSection title="Qué revisar antes de dar una rutina por migrada">
        <GuideLimit>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Es un <strong>subconjunto</strong> del lenguaje. Una rutina que
              dependa de funciones fuera de la lista de arriba —o de
              extensiones ligadas a un producto concreto— necesita adaptarse.
            </li>
            <li>
              <code>command</code> ejecuta comandos nativos, pero no deja un
              comando abierto esperando a que el usuario siga: si la secuencia
              queda a medias, la rutina termina con error en vez de dejarte el
              editor en un estado ambiguo.
            </li>
            <li>
              <code>entdel</code> borra, pero no resucita entidades borradas.
            </li>
            <li>
              Una rutina puede insertar bloques, pero todavía no definirlos.
            </li>
            <li>
              La biblioteca de rutinas se guarda <strong>en tu navegador</strong>
              , con un tope por archivo y por número de archivos. Todavía no
              viaja al servidor, así que quien abra el mismo dibujo en otra
              computadora no la tiene. Guarda una copia de tus <code>.lsp</code>{" "}
              fuera del navegador.
            </li>
          </ul>
        </GuideLimit>
        <p>
          La recomendación práctica: migra primero las rutinas cortas y de mucho
          uso, ejecútalas sobre un dibujo de prueba y compara el resultado con el
          que da tu herramienta actual. Las que dependan de diálogos complejos o
          de funciones específicas de otro programa déjalas para el final.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
