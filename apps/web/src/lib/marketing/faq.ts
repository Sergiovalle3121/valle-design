import { DOC_GUIDES, PRICING_PATH, docGuidePath } from "@/config/site-routes";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * EL CENTRO DE PREGUNTAS.
 *
 * ── QUÉ SUSTITUYE Y POR QUÉ ─────────────────────────────────────────────────
 * La portada llevaba siete preguntas. Siete preguntas no son un FAQ: son la
 * lista de objeciones que se le ocurrieron a quien escribió la página. Un
 * comprador de CAD llega con veinte dudas concretas —«¿me abre este archivo?»,
 * «¿dónde quedan mis planos?», «¿qué pasa el día que deje de pagar?»— y cada
 * una que no encuentra respondida es una pestaña que se cierra.
 *
 * Las preguntas de aquí NO están inventadas para rellenar. Salen de tres sitios
 * y sólo de esos tres:
 *
 *   1. Lo que las guías de `/docs` ya responden en largo — el FAQ da la
 *      respuesta corta y ENLAZA, en vez de repetirla y desincronizarse.
 *   2. Los límites que el producto ya declara en su superficie de honestidad.
 *      Un límite escondido en una sección que nadie lee no es honestidad.
 *   3. Las dudas obvias de alguien que nunca ha usado esto y está decidiendo si
 *      teclea su correo.
 *
 * ── LA REGLA DE CONTENIDO ───────────────────────────────────────────────────
 * Ninguna respuesta promete nada que no esté probado, ninguna publica una cifra
 * de precio (`/precios` es la única verdad sobre importes) y ninguna se
 * describe por comparación con otro producto: cuando hace falta hablar de
 * intercambio se habla del FORMATO. `check:surface` lo vigila.
 *
 * ── POR QUÉ ES UN MÓDULO Y NO JSX ───────────────────────────────────────────
 * Porque el mismo texto viaja a tres sitios: la página, el buscador del centro
 * de preguntas y el JSON-LD de `FAQPage`. Con el texto en el JSX, lo que ve
 * Google y lo que lee una persona empiezan a divergir en la primera edición
 * apurada — y una respuesta distinta en el resultado de búsqueda que en la
 * página es exactamente la clase de detalle que quema la confianza antes de la
 * primera visita.
 */

export type FaqCategoryId =
  | "empezar"
  | "dibujo"
  | "archivos"
  | "cuenta"
  | "precios"
  | "educacion";

export interface FaqCategory {
  id: FaqCategoryId;
  /** Numeración de lámina: el detalle tipográfico de la dirección de arte. */
  numero: string;
  label: string;
  /** Una línea que dice de qué va la categoría antes de abrir nada. */
  resumen: string;
}

export interface FaqEntry {
  categoria: FaqCategoryId;
  pregunta: string;
  /** Respuesta en texto plano: viaja igual a la página y al JSON-LD. */
  respuesta: string;
  /** Enlace a la guía que lo cuenta largo, cuando existe. */
  enlace?: { texto: string; href: string };
}

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  {
    id: "empezar",
    numero: "01",
    label: "Empezar",
    resumen: "Qué necesitas, qué encontrarás el primer día y cuánto tardas.",
  },
  {
    id: "dibujo",
    numero: "02",
    label: "Dibujo",
    resumen: "Cómo se dibuja, se acota y se imprime un plano de verdad.",
  },
  {
    id: "archivos",
    numero: "03",
    label: "Archivos e intercambio",
    resumen: "Qué formatos entran, cuáles salen y qué se pierde por el camino.",
  },
  {
    id: "cuenta",
    numero: "04",
    label: "Cuenta y seguridad",
    resumen: "Dónde viven tus planos, quién los ve y cómo se protege el acceso.",
  },
  {
    id: "precios",
    numero: "05",
    label: "Precios y plan gratuito",
    resumen: "Qué cuesta, qué incluye el lanzamiento y qué pasa al terminar.",
  },
  {
    id: "educacion",
    numero: "06",
    label: "Educación",
    resumen: "Lo que estamos preparando para escuelas y talleres de proyectos.",
  },
] as const;

const guia = (slug: (typeof DOC_GUIDES)[number]["slug"], texto: string) => ({
  texto,
  href: docGuidePath(slug),
});

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  /* ── 01 · EMPEZAR ──────────────────────────────────────────────────────── */
  {
    categoria: "empezar",
    pregunta: "¿Qué necesito para empezar a dibujar?",
    respuesta:
      "Un navegador actualizado y una cuenta. No hay instalador, ni gestor de licencias, ni una computadora concreta donde viva el programa: entras, abres un documento y dibujas. Conviene un ratón con rueda —el encuadre y el zoom del editor están pensados para eso— y una pantalla de al menos 1280 puntos de ancho para que quepan las paletas sin estrecharse.",
  },
  {
    categoria: "empezar",
    pregunta: "Vengo de otro CAD de escritorio. ¿Tengo que reaprender a dibujar?",
    respuesta:
      "No. La línea de comandos entiende la tabla de alias de siempre: escribes L y dibuja una línea, C un círculo, TR recorta. Las referencias a objetos, el rastreo polar y la entrada por coordenadas funcionan como esperas, y el orden de las preguntas de cada comando es el que ya tienes en la mano. Tu memoria muscular sirve desde el primer minuto; lo que cambia es dónde vive el archivo, no cómo se dibuja.",
    enlace: guia("dibujar-planta-arquitectonica", "Dibujar una planta paso a paso"),
  },
  {
    categoria: "empezar",
    pregunta: "¿Cuánto tardo en tener mi primer plano impreso?",
    respuesta:
      "La guía de planta arquitectónica va de la unidad de dibujo a la lámina en PDF y está pensada para hacerse de una sentada. El camino corto: creas el documento, dibujas los muros, acotas, colocas una presentación con su papel y su escala, y exportas. Nada de eso requiere configuración previa: el documento nuevo ya viene con capas, estilo de cota y cajetín listos.",
    enlace: guia("dibujar-planta-arquitectonica", "La guía completa"),
  },
  {
    categoria: "empezar",
    pregunta: "¿Funciona en tableta?",
    respuesta:
      "Sí, con puntero grueso: cuando el navegador declara que se toca con el dedo, los controles del editor crecen hasta los 44 puntos que fijan Apple y Google, y hay gestos de encuadre y zoom con dos dedos. Es cómodo para revisar, comentar y hacer correcciones puntuales. Para levantar un plano entero sigue siendo mejor un ratón: el dibujo de precisión se apoya en la posición exacta del puntero.",
  },
  {
    categoria: "empezar",
    pregunta: "¿Puedo probarlo sin registrarme?",
    respuesta:
      "El editor exige cuenta, porque cada documento vive aislado en la organización a la que pertenece y eso no se puede resolver sin saber quién eres. Lo que sí puedes hacer sin dar una tarjeta es crear la cuenta y entrar: el alta pide correo y contraseña, nada más.",
  },
  {
    categoria: "empezar",
    pregunta: "¿En qué idioma está?",
    respuesta:
      "En español de México, incluida la línea de comandos y el vocabulario de dibujo. Las plantillas, los cajetines y las normas de rotulación que trae de fábrica también son las mexicanas. La interfaz tiene conmutador de idioma y el inglés está disponible.",
  },

  /* ── 02 · DIBUJO ───────────────────────────────────────────────────────── */
  {
    categoria: "dibujo",
    pregunta: "¿Qué puedo dibujar exactamente?",
    respuesta:
      "Líneas, polilíneas con arcos, círculos, arcos, rectángulos, polígonos, elipses y splines, sobre capas con su color, su tipo de línea y su grosor. Encima: bloques con atributos compartidos por organización, sombreado asociativo al contorno y texto de párrafo con maquetación real. Los muros resuelven solos su unión en esquina, en T y en continuación colineal mientras los dibujas.",
  },
  {
    categoria: "dibujo",
    pregunta: "¿Las cotas se actualizan solas si muevo el dibujo?",
    respuesta:
      "Sí, y es la diferencia que más se nota en obra. La cota queda amarrada a la geometría que mide: mueves el muro y el número cambia con él. Hay cota lineal, alineada, angular, de radio y de diámetro, con estilos de cota que se aplican al plano entregado. Una medida escrita a mano encima de una línea acaba mintiendo el día que alguien mueve esa línea, y nadie se entera hasta que está construido.",
    enlace: guia("acotacion-asociativa", "Por qué la cota debe moverse con el dibujo"),
  },
  {
    categoria: "dibujo",
    pregunta: "¿Puedo imprimir a escala de verdad?",
    respuesta:
      "Sí. Colocas el dibujo en una presentación, eliges tamaño de papel y escala normalizada, y la lámina sale a PDF con el tamaño de página exacto, su cajetín y su escala gráfica. Una unidad de dibujo mide en el papel lo que la escala dice que mide. Hay papeles de A4 a A0, carta y tabloide, escalas de 1:1 a 1:5000, varias ventanas por lámina cada una a su escala, y tablas de plumas que deciden color y grosor de cada trazo.",
    enlace: guia("imprimir-planos-pdf-escala", "Imprimir a escala, paso a paso"),
  },
  {
    categoria: "dibujo",
    pregunta: "¿Puedo automatizar tareas repetitivas?",
    respuesta:
      "Sí, con el intérprete LISP que corre dentro del navegador: lector, evaluador, funciones de entidad por códigos DXF, conjuntos de selección y diálogos DCL, todo en un entorno aislado con presupuesto de pasos y de tiempo para que una rutina con un bucle infinito no se lleve la pestaña por delante. Es un subconjunto del lenguaje: una rutina que dependa de funciones fuera de esa superficie necesita adaptarse, así que pruébala antes de darla por migrada.",
    enlace: guia("automatizar-con-autolisp", "Automatizar con rutinas LISP"),
  },
  {
    categoria: "dibujo",
    pregunta: "¿Dónde se guardan mis rutinas?",
    respuesta:
      "Hoy en el navegador de la computadora donde las escribiste, no en el servidor. Eso significa que no viajan solas a otra máquina y que borrar los datos del navegador se las lleva. Es una limitación real y está en la cola: guarda una copia del texto de las rutinas que te importen.",
  },
  {
    categoria: "dibujo",
    pregunta: "¿El muro aloja puertas y ventanas?",
    respuesta:
      "Todavía no. Los muros resuelven sus uniones solos —esquina, T y continuación colineal—, pero una puerta o una ventana se coloca hoy como bloque encima del muro: el muro no recorta su hueco. El plano sale correcto y la puerta se ve donde va; lo que falta es que el hueco sea una propiedad del muro en vez de un dibujo encima.",
  },
  {
    categoria: "dibujo",
    pregunta: "¿Hay 3D?",
    respuesta:
      "Hay una vista tridimensional del modelo para comprobar el volumen de lo dibujado, no un modelador. Valle Design es un CAD 2D: su trabajo es producir planos correctos, y el 3D está para verificar, no para diseñar. Todo documento abre en 2D salvo que tú hayas dejado otra vista activa.",
  },
  {
    categoria: "dibujo",
    pregunta: "¿Puedo trabajar con otra persona en el mismo plano?",
    respuesta:
      "De forma asíncrona, sí: compartes con enlaces que caducan y se pueden revocar, se comentan puntos concretos de la geometría, y el guardado resuelve el conflicto en vez de sobrescribir. Lo que no hay es edición simultánea: dos personas no mueven la misma línea al mismo tiempo con cursores en vivo. Preferimos decirlo así de claro a que se descubra en el peor momento.",
  },
  {
    categoria: "dibujo",
    pregunta: "¿Qué pasa si se me cae la conexión mientras dibujo?",
    respuesta:
      "El producto está pensado para trabajar conectado y no prometemos un modo sin conexión, porque no lo hemos medido. Sí existe una red debajo: hay borradores de recuperación guardados en tu navegador durante siete días, para que un cierre accidental no se lleve el trabajo de la sesión. El comportamiento con la red caída, en varias pestañas o con cierre forzado no está medido todavía, así que no lo anunciamos como garantía.",
  },

  /* ── 03 · ARCHIVOS E INTERCAMBIO ───────────────────────────────────────── */
  {
    categoria: "archivos",
    pregunta: "¿Cómo intercambio planos con quien usa otro programa?",
    respuesta:
      "En DXF de texto, que es el formato estándar de intercambio que cualquier programa de dibujo sabe abrir y escribir. Valle Design lo importa y lo exporta con comprobación previa y un manifiesto de pérdidas que dice, entidad por entidad, qué no viajó igual. Pide a tus colaboradores una copia en DXF y entrégales DXF: es el terreno común.",
    enlace: guia("dxf-vs-dwg", "Qué significa cada formato para tu despacho"),
  },
  {
    categoria: "archivos",
    pregunta: "¿Abre archivos DWG?",
    respuesta:
      "No en la versión pública. Existe una lectura en beta muy acotada que hoy está apagada por defecto, y cuando está apagada el editor DETECTA ese formato y lo rechaza con un mensaje claro en vez de fingir que lo entiende y devolverte un dibujo roto. Un plano degradado en silencio es peor que un plano que no abre, porque el error viaja hasta la obra.",
    enlace: guia("dxf-vs-dwg", "La diferencia entre los dos formatos"),
  },
  {
    categoria: "archivos",
    pregunta: "¿Qué se pierde al importar o exportar?",
    respuesta:
      "Lo que se pierda te lo decimos por escrito y entidad por entidad: cada intercambio viaja con un manifiesto de pérdidas. Los límites conocidos: se escribe DXF en la versión AC1015 y sólo geometría plana, así que la Z se aplana; la importación admite hasta 12 MB y 50.000 entidades por archivo. Y una advertencia honesta sobre nuestro propio corpus: el de ida y vuelta es material nuestro, todavía no hay uno de archivos de terceros con licencia para publicar una matriz de interoperabilidad.",
  },
  {
    categoria: "archivos",
    pregunta: "¿Puedo llevarme mis planos si me voy?",
    respuesta:
      "Siempre, y no depende de que sigas pagando. Exportas a DXF y a PDF cuando quieras, y si el periodo gratuito o la suscripción terminan la sesión conserva el permiso de ver y exportar: abres, ves y te llevas tus dibujos. Un producto que secuestra el trabajo del cliente para retenerlo no merece al cliente.",
  },
  {
    categoria: "archivos",
    pregunta: "¿Importa nubes de puntos, raster georreferenciado o GIS?",
    respuesta:
      "No. Nada de LAS, GeoTIFF ni el juego completo de formatos de sistemas de información geográfica. Si tu flujo de trabajo depende de eso, hoy no somos tu herramienta y preferimos decirlo antes de que lo descubras tú.",
  },
  {
    categoria: "archivos",
    pregunta: "¿Qué tan grande puede ser un plano?",
    respuesta:
      "El editor está medido con planos densos y el intercambio tiene sus topes escritos: 12 MB y 50.000 entidades por archivo importado. Por encima de eso el importador te lo dice antes de empezar en vez de morirse a la mitad. Los documentos grandes se guardan por una ruta comprimida con la misma garantía de escritura que los pequeños.",
  },

  /* ── 04 · CUENTA Y SEGURIDAD ───────────────────────────────────────────── */
  {
    categoria: "cuenta",
    pregunta: "¿Dónde quedan mis planos y quién puede verlos?",
    respuesta:
      "En el servidor del despliegue, aislados por organización. Cada consulta al documento comprueba en el servidor que tu sesión pertenece a esa organización: el navegador no puede pedir un documento de otra diciendo que sí. Lo que sale fuera, sale por enlaces de revisión que caducan y se pueden revocar en cualquier momento.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Cómo se guarda mi contraseña?",
    respuesta:
      "Con Argon2id, que es el algoritmo de derivación de claves recomendado hoy para contraseñas. Nunca se guarda tu contraseña, sólo un derivado del que no se puede volver atrás, y el tráfico viaja cifrado. La sesión del navegador es una cookie opaca marcada HttpOnly: ni un solo token de sesión, de verificación o de recuperación se guarda donde una página pueda leerlo.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Tengo que verificar mi correo?",
    respuesta:
      "Sí, es obligatorio. Sin verificación no hay acceso al editor. Es incómodo un minuto y evita dos cosas: que alguien registre una cuenta con el correo de otra persona, y que pierdas el acceso el día que necesites recuperar la contraseña de una dirección que nadie comprobó nunca.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Puedo ver desde dónde se ha entrado a mi cuenta?",
    respuesta:
      "Sí. La página de cuenta lista tus sesiones activas con el dispositivo aproximado y desde cuándo, y puedes cerrar cualquiera a distancia. Cambiar la contraseña cierra todas las demás sesiones automáticamente, que es lo que hay que poder hacer cuando sospechas que alguien más entró.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Puedo añadir un segundo factor?",
    respuesta:
      "Sí, con una aplicación de códigos temporales. Se activa desde tu cuenta escaneando un código y confirmando un número, y a partir de ahí el inicio de sesión lo pide. Al activarlo recibes códigos de respaldo de un solo uso: guárdalos, porque son la salida si pierdes el teléfono.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Cómo invito a mi equipo?",
    respuesta:
      "Desde tu organización, por correo. Cada persona entra con su propia cuenta y su propio permiso: hay cuatro papeles —propietario, administrador, miembro y observador— y los permisos los decide el servidor, nunca el navegador. Un observador puede ver y comentar sin poder modificar el plano.",
  },
  {
    categoria: "cuenta",
    pregunta: "¿Qué pasa si borro algo sin querer?",
    respuesta:
      "Cada documento guarda sus versiones y puedes consultarlas y compararlas. Dentro de la sesión está el deshacer de siempre; entre sesiones, la versión guardada anterior. Y para el accidente puro —cerrar la pestaña a media faena— hay borradores de recuperación en tu navegador durante siete días.",
  },

  /* ── 05 · PRECIOS Y PLAN GRATUITO ──────────────────────────────────────── */
  {
    categoria: "precios",
    pregunta: "¿Cuánto cuesta?",
    respuesta:
      "Los planes y sus condiciones están en la página de precios, y esa página los lee del catálogo vigente del producto. Aquí no se publica ninguna cifra a propósito: dos verdades sobre el mismo importe es una de más.",
    enlace: { texto: "Ver precios", href: PRICING_PATH },
  },
  {
    categoria: "precios",
    pregunta: "¿Me van a pedir la tarjeta para empezar?",
    respuesta:
      "No. El alta pide correo y contraseña, y ni menciona un medio de pago. La duración del periodo gratuito la anuncia el propio producto leyendo su configuración, así que lo que ves prometido en la portada es exactamente lo que la cuenta te concede.",
    enlace: { texto: "Ver precios", href: PRICING_PATH },
  },
  {
    categoria: "precios",
    pregunta: "¿Qué pasa el día que termine el periodo gratuito?",
    respuesta:
      "No se te cobra nada y no pierdes tus planos. La cuenta pasa a un modo de sólo lectura: abres, ves y exportas a DXF y a PDF todo lo que tengas. Lo que se detiene es dibujar cosas nuevas. Además recibes aviso con antelación, no un corte por sorpresa.",
  },
  {
    categoria: "precios",
    pregunta: "¿Puedo cancelar cuando quiera?",
    respuesta:
      "Sí, desde el portal de facturación, sin contrato anual obligatorio y sin tener que escribir a nadie. Conservas el acceso hasta el final del periodo que ya pagaste.",
  },
  {
    categoria: "precios",
    pregunta: "¿Emiten factura?",
    respuesta:
      "Sí, con CFDI y los datos fiscales de tu despacho. Los importes se publican en pesos mexicanos con el impuesto ya dentro, para que la cifra que ves sea la que se cobra.",
  },

  /* ── 06 · EDUCACIÓN ────────────────────────────────────────────────────── */
  {
    categoria: "educacion",
    pregunta: "¿Hay algo para alumnos y profesores?",
    respuesta:
      "Lo estamos preparando: un plan educativo gratuito, activable con el correo de la institución, pensado para que un profesor abra el taller como organización, invite a su grupo y revise los planos de sus alumnos con los enlaces de revisión y los comentarios anclados que el producto ya tiene. Todavía no está abierto y no queremos anunciarlo como si lo estuviera.",
  },
  {
    categoria: "educacion",
    pregunta: "Doy clase. ¿Puedo usarlo ya con mi grupo?",
    respuesta:
      "Puedes, con las mismas herramientas que un despacho: creas la organización del taller, invitas a tus alumnos por correo, cada uno trabaja su documento y tú revisas y comentas sobre la geometría. Lo que aún no existe es el plan gratuito por dominio institucional, así que hoy el grupo entra por la vía normal. Déjanos tu contacto en la página de educación y te avisamos en cuanto abramos.",
    enlace: { texto: "La propuesta para universidades", href: "/educacion" },
  },
  {
    categoria: "educacion",
    pregunta: "¿Los alumnos pueden compartir planos entre ellos?",
    respuesta:
      "Dentro de la misma organización, sí: los documentos del taller son del taller, y quien pertenece a él los ve según su papel. Para enseñar un plano fuera del grupo están los enlaces de revisión, que caducan y se revocan. Lo que un alumno no puede hacer es ver los documentos de otro taller, porque el aislamiento por organización es la misma regla que protege a un despacho.",
  },
  {
    categoria: "educacion",
    pregunta: "¿Qué necesita una escuela para que esto funcione en un aula?",
    respuesta:
      "Navegadores actualizados y conexión. No hay que instalar nada en las máquinas del laboratorio ni gestionar licencias por equipo, que suele ser la mitad del trabajo de montar una clase de dibujo. Cada alumno entra con su cuenta desde cualquier máquina y encuentra su trabajo.",
  },
] as const;

/**
 * La forma plana que consume el JSON-LD de `FAQPage`.
 *
 * Es el MISMO texto que lee una persona, sin resumir ni reescribir: si el
 * resultado de búsqueda dijera algo distinto de la página, el visitante llega
 * sintiéndose engañado antes de ver el producto. El enlace no viaja al
 * marcado —un enlace dentro de una respuesta estructurada no aporta— pero su
 * ausencia no cambia ni una palabra de lo que se afirma.
 */
export const FAQ_FOR_STRUCTURED_DATA: readonly (readonly [string, string])[] =
  FAQ_ENTRIES.map(({ pregunta, respuesta }) => [pregunta, respuesta] as const);

/** Cuántas preguntas hay, para no escribir la cifra a mano en la página. */
export const FAQ_COUNT = FAQ_ENTRIES.length;

/** Enlace de escape cuando ninguna respuesta sirve. Siempre visible. */
export const FAQ_FALLBACK_HREF = COMMERCIAL_LINKS.support;

/** Las guías largas, para el pie del centro de preguntas. */
export const FAQ_GUIDES = DOC_GUIDES;
