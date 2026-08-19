/**
 * Corpus adversarial: aquí acertar es DECIR QUE NO.
 *
 * LA REGLA INVERTIDA. En la mitad de despacho, acertar es producir la
 * geometría pedida. Aquí no hay geometría que producir: cada instrucción es
 * ambigua, se contradice a sí misma, es imposible sobre el plano, mezcla
 * unidades que no se pueden reconciliar o pide una cantidad absurda. El
 * desenlace correcto es UNO: rechazo con error tipado y explícito.
 *
 * POR QUÉ ES LA MITAD QUE MÁS IMPORTA. Un copiloto que rechaza de más molesta;
 * uno que «hace algo» con una orden imposible entrega un plano que se ve bien y
 * está mal. La regla de la casa —fallo cerrado— existe por eso, y esta mitad
 * del banco es lo único que la comprueba sobre lenguaje natural.
 *
 * CÓMO ESTÁN ESCRITAS. Como se teclea de verdad: sin acentos, con faltas de
 * ortografía, con la eñe puesta como n y con la sintaxis atropellada de quien
 * dicta mientras revisa un plano. Que la frase esté mal escrita no es lo que la
 * hace adversarial —eso ya se mide en el corpus normal—; lo que la hace
 * adversarial es que, escrita como esté, no se puede ejecutar sin inventar.
 *
 * NINGÚN CASO SE RETIRA porque el producto lo falle.
 */
import type { NlCadAdversarialFamily, NlCadCase } from "./types";

const a = (
  id: string,
  text: string,
  trait: string,
  family: NlCadAdversarialFamily,
): NlCadCase => ({
  id,
  lane: "adversarial",
  text,
  trait,
  expect: { kind: "reject", family },
});

/**
 * Ambiguas: falta el objeto, la medida o el destino, y no hay forma de
 * deducirlo. «Hazlo más grande» no tiene una respuesta correcta; tiene
 * infinitas, y elegir una es inventar por el usuario.
 */
const AMBIGUAS: NlCadCase[] = [
  a("a-001", "hazlo más grande", "sin objetivo y sin factor", "ambigua"),
  a("a-002", "muévelo para allá", "destino indeterminado", "ambigua"),
  a("a-003", "ponlo bien", "sin criterio", "ambigua"),
  a("a-004", "acomodame el plano como se vea mejor", "juicio estético delegado", "ambigua"),
  a("a-005", "arregla eso", "referente inexistente", "ambigua"),
  a("a-006", "quitalo", "sin objetivo, sin selección nombrada", "ambigua"),
  a("a-007", "mas chico", "fragmento sin verbo ni objeto", "ambigua"),
  a("a-008", "sube eso tantito", "cantidad coloquial no cuantificable", "ambigua"),
  a("a-009", "dibuja lo que falta", "el producto no sabe qué falta", "ambigua"),
  a("a-010", "dejalo como estaba antes de ayer", "estado histórico sin marca", "ambigua"),
  a("a-011", "pon las cosas donde van", "sin criterio de colocación", "ambigua"),
  a("a-012", "muebe la meza para aya", "sin acentos y con faltas: destino indeterminado", "ambigua"),
  a("a-013", "kolokame una puerta donde se vea vien", "faltas de ortografía y destino subjetivo", "ambigua"),
  a("a-014", "hazme el plano de la casa", "encargo completo, no una operación", "ambigua"),
];

/**
 * Contradictorias: las dos mitades de la frase se cancelan. Ejecutar una y
 * callar la otra es exactamente el «resultado a medias que parece correcto»
 * que la casa prohíbe.
 */
const CONTRADICTORIAS: NlCadCase[] = [
  a("a-015", "haz el muro de 15 y también de 20 centímetros", "dos espesores para un muro", "contradictoria"),
  a(
    "a-016",
    "mueve la mesa del comedor 2 metros a la derecha y 2 metros a la izquierda",
    "desplazamientos que se anulan",
    "contradictoria",
  ),
  a("a-017", "gira el portón 90 grados sin girarlo", "orden y su negación", "contradictoria"),
  a("a-018", "borra la cocina pero déjala", "borrar y conservar", "contradictoria"),
  a("a-019", "haz la recámara principal más grande y más chica", "dos escalas opuestas", "contradictoria"),
  a("a-020", "acota todo y no pongas cotas", "acotar y no acotar", "contradictoria"),
  a("a-021", "centra la mesa del comedor en la esquina", "centrar en una esquina", "contradictoria"),
  a("a-022", "alinea los castillos a la izquierda y a la derecha", "dos alineaciones excluyentes", "contradictoria"),
  a("a-023", "pon la puerta abierta y cerrada", "dos estados simultáneos", "contradictoria"),
  a("a-024", "escala la mesa al 150% dejandola del mismo tamano", "escalar sin escalar", "contradictoria"),
];

/**
 * Imposibles sobre este plano: la geometría no existe, es degenerada o no cabe.
 * Un muro de un punto a sí mismo no es un muro corto: no es un muro.
 */
const IMPOSIBLES: NlCadCase[] = [
  a("a-025", "muro de 0,0 a 0,0", "segmento degenerado de longitud cero", "imposible"),
  a("a-026", "haz una recámara de 3 metros dentro de un clóset de 1 metro", "contenido mayor que el contenedor", "imposible"),
  a(
    "a-027",
    "chaflán de 5 metros entre el muro de fachada y el muro de colindancia poniente",
    "chaflán mayor que los muros que corta",
    "imposible",
  ),
  a("a-028", "escala la mesa del comedor al 0%", "factor cero colapsa la geometría", "imposible"),
  a("a-029", "cuarto de 4000,3000 a 0,3000", "rectángulo de altura cero", "imposible"),
  a("a-030", "haz un pasillo de 0 centímetros entre la cama matrimonial y el ropero", "holgura nula", "imposible"),
  a("a-031", "recorta el muro de fachada con el muro de fachada", "un muro no se recorta consigo mismo", "imposible"),
  a("a-032", "haz un arreglo polar de 0 piezas", "arreglo vacío", "imposible"),
  a("a-033", "offset del muro de fachada a 0", "paralela a distancia cero", "imposible"),
  a("a-034", "mete la cochera dentro del medio baño", "el contenedor es menor que el contenido", "imposible"),
  a("a-035", "mide del Castillo K1 al Castillo K1", "distancia de un objeto a sí mismo", "imposible"),
  a("a-036", "muro de 0,0 a 0,25000", "muro más largo que el lote de 20 m", "imposible"),
];

/**
 * Unidades irreconciliables. El producto trabaja en milímetros; el despacho
 * dicta en metros y centímetros. Cuando la frase declara DOS unidades para la
 * misma cota, no hay conversión correcta, sólo una elegida en silencio.
 */
const UNIDADES: NlCadCase[] = [
  a("a-037", "muro de 0,0 a 6000,0 con espesor de 15 cm y también 200 mm", "dos unidades para un espesor", "unidades"),
  a("a-038", "haz un pasillo de 1.20 metros y 40 pulgadas entre la cocina y la sala-comedor", "metros y pulgadas a la vez", "unidades"),
  a("a-039", "distribuye los castillos cada 3 metros y 250 pies", "metros y pies a la vez", "unidades"),
  a("a-040", "pon la puerta a 90 varas de la esquina", "unidad colonial no soportada", "unidades"),
  a("a-041", "haz la trabe de 20 por 40 pulgadas métricas", "unidad inventada", "unidades"),
  a("a-042", "acota las recámaras en pulgadas y en metros a la vez", "dos sistemas de acotado", "unidades"),
  a("a-043", "escala el plano de 1:50 a 3 metros", "escala de impresión mezclada con cota", "unidades"),
  a("a-044", "mueve el tinaco 500 pulgadas y 500 milimetros a la derecha", "dos unidades en un desplazamiento", "unidades"),
];

/**
 * Cantidades absurdas. El límite no es filosófico: 100 000 sillas no caben en
 * un lote de 10 × 20 m, y recortar en silencio a las que sí caben entrega un
 * plano que nadie pidió sin decir que se recortó.
 */
const ABSURDAS: NlCadCase[] = [
  a("a-045", "pon 100000 sillas en la sala-comedor", "cantidad que no cabe en el lote", "absurda"),
  a("a-046", "repite la puerta de acceso 5000 veces cada 1 mm", "repetición imposible y solapada", "absurda"),
  a("a-047", "escala la mesa del comedor 1000000 veces", "factor que desborda el plano", "absurda"),
  a("a-048", "gira el portón 1000000000 grados", "ángulo sin sentido físico", "absurda"),
  a("a-049", "muro de 0,0 a 900000000,0", "muro de 900 km", "absurda"),
  a("a-050", "pon 0 puertas en la recámara principal", "cantidad nula", "absurda"),
  a("a-051", "distribuye las camas cada -3 metros", "separación negativa", "absurda"),
  a("a-052", "haz un arreglo de 99999 por 99999 de los castillos", "arreglo de mil millones de piezas", "absurda"),
  a("a-053", "coloca una puerta de 12 metros de ancho en el medio baño", "carpintería que no cabe en el cuarto", "absurda"),
  a("a-054", "borra todos los objetos del universo", "alcance fuera del documento", "absurda"),
];

export const NL_CAD_CORPUS_ADVERSARIAL: NlCadCase[] = [
  ...AMBIGUAS,
  ...CONTRADICTORIAS,
  ...IMPOSIBLES,
  ...UNIDADES,
  ...ABSURDAS,
];
