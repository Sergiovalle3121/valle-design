/**
 * ACTO 3 DE LA JORNADA · MODIFICAR EL PLANO AJENO CON LOS COMANDOS DEL PRODUCTO
 *
 * Vive fuera del spec por la misma razón que sus hermanos `-relectura`,
 * `-medicion` y `-comandos`: `terceros-jornada.spec.ts` está en el tope de 800
 * líneas del presupuesto de monolito, y el gate dice «divídelo; no lo añadas al
 * manifiesto salvo que exista una razón escrita». No la hay: este acto es una
 * pieza coherente con una entrada y una salida claras.
 *
 * Las entradas van EXPLÍCITAS —el documento recién abierto y la extensión que
 * midió el oráculo— para que el acto no pueda mirar del plano nada que no se le
 * haya dado. Es la misma disciplina que ya seguía el acto 5.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { aplica, conduce, contexto, designa, intro, punto } from "./terceros-jornada-comandos";

export interface EntradasDeLaModificacion {
  documentoAbierto: CadDocument;
  extension: { minX: number; minY: number; maxX: number; maxY: number };
  /** Las 624 longitudes que midió el oráculo, para comprobar que MOVE es rígido. */
  longitudesDelOraculo: readonly number[];
  contador: { comprobaciones: number; magnitudes: number };
  TOL_ORACULO: number;
  ok: (condicion: boolean, mensaje: string) => void;
  eq: <T>(actual: T, esperado: T, mensaje: string) => void;
  cerca: (actual: number, esperado: number, tolerancia: number, mensaje: string) => void;
  comparaOrdenado: (que: string, nuestras: readonly number[], suyas: readonly number[], tolerancia: number) => number;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  deTipo: (documento: CadDocument, tipo: any) => any[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  longitudDe: (entidad: any, nombre: string) => number;
}

export interface SalidaDeLaModificacion {
  documento: CadDocument;
  DESPLAZAMIENTO: { x: number; y: number };
  ANCHO: number;
  ALTO: number;
  NUEVA_LINEA: { desde: { x: number; y: number }; hasta: { x: number; y: number }; longitud: number };
  CAPA_REVISION: string;
}

export function modificaElPlanoAjeno({
  documentoAbierto,
  extension,
  longitudesDelOraculo,
  contador,
  TOL_ORACULO,
  ok,
  eq,
  cerca,
  comparaOrdenado,
  deTipo,
  longitudDe,
}: EntradasDeLaModificacion): SalidaDeLaModificacion {
/**
 * El destino del movimiento lo dicta el ORÁCULO, no el producto: llevar la
 * esquina inferior izquierda del plano al origen es lo primero que hace quien
 * recibe un plano dibujado lejos del cero, y el vector sale de la extensión
 * que midió ezdxf. Si el producto se hubiera medido a sí mismo para decidir
 * cuánto mover, la comprobación de después no probaría nada.
 */
const DESPLAZAMIENTO = {
  x: -extension.minX,
  y: -extension.minY,
};
const ANCHO = extension.maxX - extension.minX;
const ALTO = extension.maxY - extension.minY;

/** La línea que el revisor añade. 3-4-5 en papel: mide 500 EXACTO. */
const NUEVA_LINEA = { desde: { x: 0, y: 0 }, hasta: { x: 300, y: 400 }, longitud: 500 };
const CAPA_REVISION = "VALLE-REVISION";

let documento = documentoAbierto;

{
  // — MOVE: las 961 entidades, de una vez —
  const ids = documento.entities.map((entidad) => entidad.id);
  const movido = conduce(
    "MOVE",
    [designa(ids), punto(0, 0), punto(DESPLAZAMIENTO.x, DESPLAZAMIENTO.y)],
    contexto(documento, ids),
  );
  assert.ok(movido?.kind === "document", "MOVE tenía que escribir");
  contador.comprobaciones += 1;
  eq(movido.commands.length, 961, "MOVE toca las 961 entidades, no una selección parcial");
  eq(
    movido.commands.every((comando) => comando.type === "transform"),
    true,
    "y mover es transformar: ni borra ni recrea, que perdería los identificadores",
  );
  documento = aplica(documento, movido, "MOVE");
  eq(documento.entities.length, 961, "tras mover siguen siendo 961");
}

{
  // — LO QUE UNA TRASLACIÓN NO PUEDE CAMBIAR —
  // Las 624 longitudes vuelven a compararse contra el oráculo. Es la
  // comprobación que delata una transformación que «casi» es rígida.
  const longitudes = deTipo(documento, "line").map((linea) => longitudDe(linea, "línea movida"));
  const suyas = longitudesDelOraculo;
  const peor = comparaOrdenado("longitud de línea tras MOVE", longitudes, suyas, TOL_ORACULO);
  ok(peor <= TOL_ORACULO, `una traslación no cambia una longitud (peor desviación ${peor})`);
  // Y la esquina del plano queda EN el origen, con el ancho y el alto intactos.
  const xs = deTipo(documento, "line").flatMap((linea) => [linea.start.x, linea.end.x]);
  const ys = deTipo(documento, "line").flatMap((linea) => [linea.start.y, linea.end.y]);
  for (const poli of deTipo(documento, "polyline"))
    for (const vertice of poli.vertices) {
      xs.push(vertice.x);
      ys.push(vertice.y);
    }
  cerca(Math.min(...xs), 0, TOL_ORACULO, "la esquina izquierda del plano queda en x = 0");
  cerca(Math.min(...ys), 0, TOL_ORACULO, "y la inferior en y = 0");
  cerca(Math.max(...xs), ANCHO, TOL_ORACULO, "el ancho del plano no cambia al moverlo");
  cerca(Math.max(...ys), ALTO, TOL_ORACULO, "ni el alto");
}

{
  // — LINE: el trazo que añade quien revisa —
  // La capa nueva se añade al documento porque lo que esta jornada verifica es
  // el camino de la GEOMETRÍA; la orden CAPA tiene su propia suite.
  documento = {
    ...documento,
    layers: [
      ...documento.layers,
      { id: CAPA_REVISION, name: CAPA_REVISION, color: "#ff0000", visible: true, locked: false },
    ],
  };
  const dibujada = conduce(
    "LINE",
    [punto(NUEVA_LINEA.desde.x, NUEVA_LINEA.desde.y), punto(NUEVA_LINEA.hasta.x, NUEVA_LINEA.hasta.y), intro],
    contexto(documento, [], CAPA_REVISION),
  );
  documento = aplica(documento, dibujada, "LINE");
  const nueva = documento.entities.find((entidad) => entidad.id.startsWith("jornada"));
  assert.ok(nueva?.type === "line", "la línea nueva tiene que estar en el documento");
  contador.comprobaciones += 1;
  eq(nueva.layer, CAPA_REVISION, "en la capa del revisor, no en la del plano ajeno");
  cerca(longitudDe(nueva, "línea nueva"), NUEVA_LINEA.longitud, 1e-12, "y mide 500: el 3-4-5 de siempre");
  eq(documento.entities.length, 962, "961 del plano ajeno más la del revisor");
}

{
  // — ERASE: una modificación que se comprueba por AUSENCIA —
  const circulos = deTipo(documento, "circle").map((circulo) => circulo.id);
  eq(circulos.length, 9, "los nueve círculos del plano ajeno siguen ahí antes de borrarlos");
  documento = aplica(documento, conduce("ERASE", [designa(circulos), intro], contexto(documento, circulos)), "ERASE");
  eq(deTipo(documento, "circle").length, 0, "y ya no queda ninguno");
  eq(documento.entities.length, 953, "962 − 9");
}
  return { documento, DESPLAZAMIENTO, ANCHO, ALTO, NUEVA_LINEA, CAPA_REVISION };
}
