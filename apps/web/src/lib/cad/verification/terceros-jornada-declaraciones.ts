/**
 * LO QUE LA JORNADA DECLARA SOBRE SÍ MISMA.
 *
 * Prosa, no medida: qué defectos destapó el recorrido sobre el plano ajeno y
 * qué se queda fuera de lo que afirma. Vive aparte porque
 * `terceros-jornada.spec.ts` está en el tope de 800 líneas del presupuesto de
 * monolito y esto no es código que comprobar — es lo que el artefacto publica.
 *
 * Cada frase de aquí tiene su comprobación en el spec: si una deja de ser
 * cierta, el spec se pone rojo antes de que el artefacto la repita.
 */
export const DECLARACIONES_DE_LA_JORNADA = {
  loQueLaJornadaDestapoYQueYaEstaArreglado: [
    "P-evidencia-07 · ezdxf NO abría lo que exportamos: MTEXT y HATCH salían sin marcador de " +
      "subclase, y la biblioteca reventaba antes de leer el fichero, ni en modo recover. Arreglado " +
      "el 2026-09-05: abre el fichero entero con cero errores de auditoría, y el control del parche " +
      "dice que ya no hay ninguna entidad que parchear.",
    "P-evidencia-08 · el informe de importación declaraba PERDIDAS 63 cotas que SÍ entraron —el mapa " +
      "de primitivas emitía unsupported_entity por cada DIMENSION mientras el camino semántico las " +
      "importaba— y aconsejaba pedir al remitente que las explotase, que le habría hecho perder " +
      "cotas vivas. Arreglado: las pérdidas declaradas bajan de 72 a las 9 reales (6 LEADER, 3 VIEWPORT).",
    "P-evidencia-09 · el documento se queda con 17 de las 24 capas del fichero, y ningún aviso lo " +
      "mencionaba. Arreglado: `layer_table_pruned` nombra las siete, una por una. No cambia el " +
      "dibujo; el silencio sí importaba.",
    "P-evidencia-11 · los escaneos crudos de MTEXT y HATCH no sabían en qué sección estaban y sacaban " +
      "a espacio modelo lo que vive dentro de un BLOCK, con las coordenadas locales del bloque: 135 " +
      "rótulos y 13 sombreados de este plano, todos en definiciones que ningún INSERT alcanza. " +
      "Arreglado: el censo del lector coincide ahora con el del oráculo, tipo a tipo.",
  ],
  loQueNoSeMide: [
    "El espacio papel: el lector lo excluye a propósito y este plano tiene un Layout1 con 3 VIEWPORT.",
    "El contenido de los 17 bloques: se comparan las inserciones, no lo que hay dentro de cada uno.",
    "Los 6 LEADER: el lector no los soporta y lo declara, así que no hay ámbito comparable para ellos. " +
      "Los 9 MTEXT de espacio modelo SÍ se comparan ya: desde P-evidencia-11 los dos lados hablan del " +
      "mismo ámbito, que es lo que hacía falta para poder compararlos.",
    "El aspecto: que un número sea correcto no dice que el plano se vea igual.",
  ],
  loQueNoAcredita:
    "Ni ezdxf ni dxf-parser son AutoCAD. Esta jornada acredita que un plano ajeno de 1,1 MB entra, se " +
    "mide igual que en una implementación independiente, se modifica, se exporta y lo vuelve a leer " +
    "otro programa. No acredita compatibilidad con AutoCAD, que sólo la acredita AutoCAD.",
};
