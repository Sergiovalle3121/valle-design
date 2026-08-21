/**
 * Decodificador de la sección de VARIABLES DE CABECERA R2000 (AC1015) —
 * campaña 2026-08-21, OLA 1.4.
 *
 * La sección (registro 0 del directorio) es un único flujo de bits SIN
 * huecos: la secuencia completa y ordenada está registrada como hecho en
 * SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC, capítulo 9). Este módulo la
 * transcribe para R2000: los condicionales R13-R14 y R2004+/R2007+ no
 * existen en AC1015; los "pre-2004" y "R13-R15" SÍ.
 *
 * El payload que recibe es el que devuelve `readAc1015SectionFrame` (tras
 * el tamaño RL y antes del CRC, ya validados por el marco). Al final del
 * flujo viajan cuatro BS sin nombre de R14+ y relleno aleatorio hasta el
 * límite de byte: el decodificador los CONTABILIZA como tramo opaco y
 * expone dónde aterrizó — nada se ignora en silencio.
 *
 * Los nombres de variable son los del dibujo (DIMASO, LTSCALE…); los
 * valores sin semántica interpretada viajan CRUDOS. MEASUREMENT no está
 * aquí: viaja en la sección Template (hecho registrado).
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  type DwgColorReference,
  type DwgHandleReference,
} from "../codecs/bitcodes.js";
import { throwDwgError } from "../security/parse-error.js";

/** Un punto 3D crudo de la cabecera (sin validar semántica). */
export interface HeaderPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Un punto 2D crudo de la cabecera. */
export interface HeaderPoint2 {
  readonly x: number;
  readonly y: number;
}

/** Un bloque de espacio (paper o model) de la cabecera. */
export interface Ac1015HeaderSpaceBlock {
  readonly insertionBase: HeaderPoint3;
  readonly extentsMin: HeaderPoint3;
  readonly extentsMax: HeaderPoint3;
  readonly limitsMin: HeaderPoint2;
  readonly limitsMax: HeaderPoint2;
  readonly elevation: number;
  readonly ucsOrigin: HeaderPoint3;
  readonly ucsXAxis: HeaderPoint3;
  readonly ucsYAxis: HeaderPoint3;
  readonly ucsName: DwgHandleReference;
  readonly ucsOrthographicReference: DwgHandleReference;
  readonly ucsOrthographicView: number;
  readonly ucsBase: DwgHandleReference;
  readonly ucsOriginTop: HeaderPoint3;
  readonly ucsOriginBottom: HeaderPoint3;
  readonly ucsOriginLeft: HeaderPoint3;
  readonly ucsOriginRight: HeaderPoint3;
  readonly ucsOriginFront: HeaderPoint3;
  readonly ucsOriginBack: HeaderPoint3;
}

/** El bloque de variables de acotación R2000, en su orden del flujo. */
export interface Ac1015HeaderDimensionVariables {
  readonly dimpost: readonly number[];
  readonly dimapost: readonly number[];
  readonly dimscale: number;
  readonly dimasz: number;
  readonly dimexo: number;
  readonly dimdli: number;
  readonly dimexe: number;
  readonly dimrnd: number;
  readonly dimdle: number;
  readonly dimtp: number;
  readonly dimtm: number;
  readonly dimtol: boolean;
  readonly dimlim: boolean;
  readonly dimtih: boolean;
  readonly dimtoh: boolean;
  readonly dimse1: boolean;
  readonly dimse2: boolean;
  readonly dimtad: number;
  readonly dimzin: number;
  readonly dimazin: number;
  readonly dimtxt: number;
  readonly dimcen: number;
  readonly dimtsz: number;
  readonly dimaltf: number;
  readonly dimlfac: number;
  readonly dimtvp: number;
  readonly dimtfac: number;
  readonly dimgap: number;
  readonly dimaltrnd: number;
  readonly dimalt: boolean;
  readonly dimaltd: number;
  readonly dimtofl: boolean;
  readonly dimsah: boolean;
  readonly dimtix: boolean;
  readonly dimsoxd: boolean;
  readonly dimclrd: DwgColorReference;
  readonly dimclre: DwgColorReference;
  readonly dimclrt: DwgColorReference;
  readonly dimadec: number;
  readonly dimdec: number;
  readonly dimtdec: number;
  readonly dimaltu: number;
  readonly dimalttd: number;
  readonly dimaunit: number;
  readonly dimfrac: number;
  readonly dimlunit: number;
  readonly dimdsep: number;
  readonly dimtmove: number;
  readonly dimjust: number;
  readonly dimsd1: boolean;
  readonly dimsd2: boolean;
  readonly dimtolj: number;
  readonly dimtzin: number;
  readonly dimaltz: number;
  readonly dimalttz: number;
  readonly dimupt: boolean;
  readonly dimatfit: number;
  readonly dimtxsty: DwgHandleReference;
  readonly dimldrblk: DwgHandleReference;
  readonly dimblk: DwgHandleReference;
  readonly dimblk1: DwgHandleReference;
  readonly dimblk2: DwgHandleReference;
  readonly dimlwd: number;
  readonly dimlwe: number;
}

/** Los handles estructurales que dan sentido al resto del archivo. */
export interface Ac1015HeaderHandles {
  readonly currentViewportEntityHeader: DwgHandleReference;
  readonly handseed: DwgHandleReference;
  readonly clayer: DwgHandleReference;
  readonly textstyle: DwgHandleReference;
  readonly celtype: DwgHandleReference;
  readonly dimstyle: DwgHandleReference;
  readonly cmlstyle: DwgHandleReference;
  readonly blockControl: DwgHandleReference;
  readonly layerControl: DwgHandleReference;
  readonly styleControl: DwgHandleReference;
  readonly linetypeControl: DwgHandleReference;
  readonly viewControl: DwgHandleReference;
  readonly ucsControl: DwgHandleReference;
  readonly vportControl: DwgHandleReference;
  readonly appidControl: DwgHandleReference;
  readonly dimstyleControl: DwgHandleReference;
  readonly viewportEntityHeaderControl: DwgHandleReference;
  readonly groupDictionary: DwgHandleReference;
  readonly mlineStyleDictionary: DwgHandleReference;
  readonly namedObjectsDictionary: DwgHandleReference;
  readonly layoutsDictionary: DwgHandleReference;
  readonly plotSettingsDictionary: DwgHandleReference;
  readonly plotStylesDictionary: DwgHandleReference;
  readonly paperSpaceBlockRecord: DwgHandleReference;
  readonly modelSpaceBlockRecord: DwgHandleReference;
  readonly byLayerLinetype: DwgHandleReference;
  readonly byBlockLinetype: DwgHandleReference;
  readonly continuousLinetype: DwgHandleReference;
  readonly currentPlotStyleName: DwgHandleReference | undefined;
}

/** Las variables de cabecera R2000 decodificadas, en el orden del flujo. */
export interface Ac1015HeaderVariables {
  readonly unknownDoubles: readonly [number, number, number, number];
  readonly unknownTexts: readonly (readonly number[])[];
  readonly unknownLongs: readonly [number, number];
  readonly dimaso: boolean;
  readonly dimsho: boolean;
  readonly plinegen: boolean;
  readonly orthomode: boolean;
  readonly regenmode: boolean;
  readonly fillmode: boolean;
  readonly qtextmode: boolean;
  readonly psltscale: boolean;
  readonly limcheck: boolean;
  readonly usrtimer: boolean;
  readonly skpoly: boolean;
  readonly angdir: boolean;
  readonly splframe: boolean;
  readonly mirrtext: boolean;
  readonly worldview: boolean;
  readonly tilemode: boolean;
  readonly plimcheck: boolean;
  readonly visretain: boolean;
  readonly dispsilh: boolean;
  readonly pellipse: boolean;
  readonly proxygraphics: number;
  readonly treedepth: number;
  readonly lunits: number;
  readonly luprec: number;
  readonly aunits: number;
  readonly auprec: number;
  readonly attmode: number;
  readonly pdmode: number;
  readonly useri: readonly [number, number, number, number, number];
  readonly splinesegs: number;
  readonly surfu: number;
  readonly surfv: number;
  readonly surftype: number;
  readonly surftab1: number;
  readonly surftab2: number;
  readonly splinetype: number;
  readonly shadedge: number;
  readonly shadedif: number;
  readonly unitmode: number;
  readonly maxactvp: number;
  readonly isolines: number;
  readonly cmljust: number;
  readonly textqlty: number;
  readonly ltscale: number;
  readonly textsize: number;
  readonly tracewid: number;
  readonly sketchinc: number;
  readonly filletrad: number;
  readonly thickness: number;
  readonly angbase: number;
  readonly pdsize: number;
  readonly plinewid: number;
  readonly userr: readonly [number, number, number, number, number];
  readonly chamfera: number;
  readonly chamferb: number;
  readonly chamferc: number;
  readonly chamferd: number;
  readonly facetres: number;
  readonly cmlscale: number;
  readonly celtscale: number;
  readonly menuname: readonly number[];
  readonly tdcreate: readonly [number, number];
  readonly tdupdate: readonly [number, number];
  readonly tdindwg: readonly [number, number];
  readonly tdusrtimer: readonly [number, number];
  readonly cecolor: DwgColorReference;
  readonly psvpscale: number;
  readonly paperSpace: Ac1015HeaderSpaceBlock;
  readonly modelSpace: Ac1015HeaderSpaceBlock;
  readonly dimensions: Ac1015HeaderDimensionVariables;
  readonly tstackalign: number;
  readonly tstacksize: number;
  readonly hyperlinkbase: readonly number[];
  readonly stylesheet: readonly number[];
  readonly flags: number;
  readonly insunits: number;
  readonly cepsntype: number;
  readonly fingerprintGuid: readonly number[];
  readonly versionGuid: readonly number[];
  readonly handles: Ac1015HeaderHandles;
  /** Los cuatro BS sin nombre de R14+ al final del flujo, crudos. */
  readonly trailingUnknownShorts: readonly [number, number, number, number];
  /** Bit donde terminó la última variable; lo demás es relleno declarado. */
  readonly decodedBitLength: number;
  readonly payloadBitLength: number;
}

/**
 * Decodifica el payload COMPLETO de la sección de variables de cabecera de
 * un AC1015 (el payload del marco, tras su tamaño RL). Fallo cerrado con
 * offset ante truncamiento; los valores viajan crudos al modelo.
 */
export function decodeAc1015HeaderVariables(
  payload: Uint8Array,
): Ac1015HeaderVariables {
  const reader = new DwgBitReader(new BoundedByteCursor(payload));
  const payloadBitLength = payload.length * 8;

  const unknownDoubles = [
    reader.readBD(),
    reader.readBD(),
    reader.readBD(),
    reader.readBD(),
  ] as const;
  const unknownTexts = Object.freeze([
    readBytes(reader),
    readBytes(reader),
    readBytes(reader),
    readBytes(reader),
  ]);
  const unknownLongs = [reader.readBL(), reader.readBL()] as const;

  // Pre-2004: el handle del viewport entity header actual.
  const currentViewportEntityHeader = reader.readH();

  const dimaso = bit(reader);
  const dimsho = bit(reader);
  const plinegen = bit(reader);
  const orthomode = bit(reader);
  const regenmode = bit(reader);
  const fillmode = bit(reader);
  const qtextmode = bit(reader);
  const psltscale = bit(reader);
  const limcheck = bit(reader);
  const usrtimer = bit(reader);
  const skpoly = bit(reader);
  const angdir = bit(reader);
  const splframe = bit(reader);
  const mirrtext = bit(reader);
  const worldview = bit(reader);
  const tilemode = bit(reader);
  const plimcheck = bit(reader);
  const visretain = bit(reader);
  const dispsilh = bit(reader);
  const pellipse = bit(reader);

  const proxygraphics = reader.readBS();
  const treedepth = reader.readBS();
  const lunits = reader.readBS();
  const luprec = reader.readBS();
  const aunits = reader.readBS();
  const auprec = reader.readBS();
  const attmode = reader.readBS();
  const pdmode = reader.readBS();
  const useri = [
    reader.readBS(),
    reader.readBS(),
    reader.readBS(),
    reader.readBS(),
    reader.readBS(),
  ] as const;
  const splinesegs = reader.readBS();
  const surfu = reader.readBS();
  const surfv = reader.readBS();
  const surftype = reader.readBS();
  const surftab1 = reader.readBS();
  const surftab2 = reader.readBS();
  const splinetype = reader.readBS();
  const shadedge = reader.readBS();
  const shadedif = reader.readBS();
  const unitmode = reader.readBS();
  const maxactvp = reader.readBS();
  const isolines = reader.readBS();
  const cmljust = reader.readBS();
  const textqlty = reader.readBS();

  const ltscale = reader.readBD();
  const textsize = reader.readBD();
  const tracewid = reader.readBD();
  const sketchinc = reader.readBD();
  const filletrad = reader.readBD();
  const thickness = reader.readBD();
  const angbase = reader.readBD();
  const pdsize = reader.readBD();
  const plinewid = reader.readBD();
  const userr = [
    reader.readBD(),
    reader.readBD(),
    reader.readBD(),
    reader.readBD(),
    reader.readBD(),
  ] as const;
  const chamfera = reader.readBD();
  const chamferb = reader.readBD();
  const chamferc = reader.readBD();
  const chamferd = reader.readBD();
  const facetres = reader.readBD();
  const cmlscale = reader.readBD();
  const celtscale = reader.readBD();

  const menuname = readBytes(reader);

  const tdcreate = [reader.readBL(), reader.readBL()] as const;
  const tdupdate = [reader.readBL(), reader.readBL()] as const;
  const tdindwg = [reader.readBL(), reader.readBL()] as const;
  const tdusrtimer = [reader.readBL(), reader.readBL()] as const;

  const cecolor = reader.readCmC();
  const handseed = reader.readH();
  const clayer = reader.readH();
  const textstyle = reader.readH();
  const celtype = reader.readH();
  const dimstyle = reader.readH();
  const cmlstyle = reader.readH();

  const psvpscale = reader.readBD();
  const paperSpace = readSpaceBlock(reader);
  const modelSpace = readSpaceBlock(reader);

  const dimpost = readBytes(reader);
  const dimapost = readBytes(reader);
  const dimscale = reader.readBD();
  const dimasz = reader.readBD();
  const dimexo = reader.readBD();
  const dimdli = reader.readBD();
  const dimexe = reader.readBD();
  const dimrnd = reader.readBD();
  const dimdle = reader.readBD();
  const dimtp = reader.readBD();
  const dimtm = reader.readBD();
  const dimtol = bit(reader);
  const dimlim = bit(reader);
  const dimtih = bit(reader);
  const dimtoh = bit(reader);
  const dimse1 = bit(reader);
  const dimse2 = bit(reader);
  const dimtad = reader.readBS();
  const dimzin = reader.readBS();
  const dimazin = reader.readBS();
  const dimtxt = reader.readBD();
  const dimcen = reader.readBD();
  const dimtsz = reader.readBD();
  const dimaltf = reader.readBD();
  const dimlfac = reader.readBD();
  const dimtvp = reader.readBD();
  const dimtfac = reader.readBD();
  const dimgap = reader.readBD();
  const dimaltrnd = reader.readBD();
  const dimalt = bit(reader);
  const dimaltd = reader.readBS();
  const dimtofl = bit(reader);
  const dimsah = bit(reader);
  const dimtix = bit(reader);
  const dimsoxd = bit(reader);
  const dimclrd = reader.readCmC();
  const dimclre = reader.readCmC();
  const dimclrt = reader.readCmC();
  const dimadec = reader.readBS();
  const dimdec = reader.readBS();
  const dimtdec = reader.readBS();
  const dimaltu = reader.readBS();
  const dimalttd = reader.readBS();
  const dimaunit = reader.readBS();
  const dimfrac = reader.readBS();
  const dimlunit = reader.readBS();
  const dimdsep = reader.readBS();
  const dimtmove = reader.readBS();
  const dimjust = reader.readBS();
  const dimsd1 = bit(reader);
  const dimsd2 = bit(reader);
  const dimtolj = reader.readBS();
  const dimtzin = reader.readBS();
  const dimaltz = reader.readBS();
  const dimalttz = reader.readBS();
  const dimupt = bit(reader);
  const dimatfit = reader.readBS();
  const dimtxsty = reader.readH();
  const dimldrblk = reader.readH();
  const dimblk = reader.readH();
  const dimblk1 = reader.readH();
  const dimblk2 = reader.readH();
  const dimlwd = reader.readBS();
  const dimlwe = reader.readBS();

  const blockControl = reader.readH();
  const layerControl = reader.readH();
  const styleControl = reader.readH();
  const linetypeControl = reader.readH();
  const viewControl = reader.readH();
  const ucsControl = reader.readH();
  const vportControl = reader.readH();
  const appidControl = reader.readH();
  const dimstyleControl = reader.readH();
  const viewportEntityHeaderControl = reader.readH();
  const groupDictionary = reader.readH();
  const mlineStyleDictionary = reader.readH();
  const namedObjectsDictionary = reader.readH();

  const tstackalign = reader.readBS();
  const tstacksize = reader.readBS();
  const hyperlinkbase = readBytes(reader);
  const stylesheet = readBytes(reader);
  const layoutsDictionary = reader.readH();
  const plotSettingsDictionary = reader.readH();
  const plotStylesDictionary = reader.readH();

  const flags = reader.readBL();
  const insunits = reader.readBS();
  const cepsntype = reader.readBS();
  const currentPlotStyleName =
    cepsntype === 3 ? reader.readH() : undefined;
  const fingerprintGuid = readBytes(reader);
  const versionGuid = readBytes(reader);

  const paperSpaceBlockRecord = reader.readH();
  const modelSpaceBlockRecord = reader.readH();
  const byLayerLinetype = reader.readH();
  const byBlockLinetype = reader.readH();
  const continuousLinetype = reader.readH();

  const trailingUnknownShorts = [
    reader.readBS(),
    reader.readBS(),
    reader.readBS(),
    reader.readBS(),
  ] as const;

  const decodedBitLength = reader.bitPosition;
  if (decodedBitLength > payloadBitLength) {
    // Inalcanzable con el cursor acotado (habría lanzado antes), pero el
    // contrato queda explícito: jamás se decodifica más allá del payload.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      payload.length,
      "The header variables ran past their section payload.",
    );
  }

  return Object.freeze({
    unknownDoubles,
    unknownTexts,
    unknownLongs,
    dimaso,
    dimsho,
    plinegen,
    orthomode,
    regenmode,
    fillmode,
    qtextmode,
    psltscale,
    limcheck,
    usrtimer,
    skpoly,
    angdir,
    splframe,
    mirrtext,
    worldview,
    tilemode,
    plimcheck,
    visretain,
    dispsilh,
    pellipse,
    proxygraphics,
    treedepth,
    lunits,
    luprec,
    aunits,
    auprec,
    attmode,
    pdmode,
    useri,
    splinesegs,
    surfu,
    surfv,
    surftype,
    surftab1,
    surftab2,
    splinetype,
    shadedge,
    shadedif,
    unitmode,
    maxactvp,
    isolines,
    cmljust,
    textqlty,
    ltscale,
    textsize,
    tracewid,
    sketchinc,
    filletrad,
    thickness,
    angbase,
    pdsize,
    plinewid,
    userr,
    chamfera,
    chamferb,
    chamferc,
    chamferd,
    facetres,
    cmlscale,
    celtscale,
    menuname,
    tdcreate,
    tdupdate,
    tdindwg,
    tdusrtimer,
    cecolor,
    psvpscale,
    paperSpace,
    modelSpace,
    dimensions: Object.freeze({
      dimpost,
      dimapost,
      dimscale,
      dimasz,
      dimexo,
      dimdli,
      dimexe,
      dimrnd,
      dimdle,
      dimtp,
      dimtm,
      dimtol,
      dimlim,
      dimtih,
      dimtoh,
      dimse1,
      dimse2,
      dimtad,
      dimzin,
      dimazin,
      dimtxt,
      dimcen,
      dimtsz,
      dimaltf,
      dimlfac,
      dimtvp,
      dimtfac,
      dimgap,
      dimaltrnd,
      dimalt,
      dimaltd,
      dimtofl,
      dimsah,
      dimtix,
      dimsoxd,
      dimclrd,
      dimclre,
      dimclrt,
      dimadec,
      dimdec,
      dimtdec,
      dimaltu,
      dimalttd,
      dimaunit,
      dimfrac,
      dimlunit,
      dimdsep,
      dimtmove,
      dimjust,
      dimsd1,
      dimsd2,
      dimtolj,
      dimtzin,
      dimaltz,
      dimalttz,
      dimupt,
      dimatfit,
      dimtxsty,
      dimldrblk,
      dimblk,
      dimblk1,
      dimblk2,
      dimlwd,
      dimlwe,
    }),
    tstackalign,
    tstacksize,
    hyperlinkbase,
    stylesheet,
    flags,
    insunits,
    cepsntype,
    fingerprintGuid,
    versionGuid,
    handles: Object.freeze({
      currentViewportEntityHeader,
      handseed,
      clayer,
      textstyle,
      celtype,
      dimstyle,
      cmlstyle,
      blockControl,
      layerControl,
      styleControl,
      linetypeControl,
      viewControl,
      ucsControl,
      vportControl,
      appidControl,
      dimstyleControl,
      viewportEntityHeaderControl,
      groupDictionary,
      mlineStyleDictionary,
      namedObjectsDictionary,
      layoutsDictionary,
      plotSettingsDictionary,
      plotStylesDictionary,
      paperSpaceBlockRecord,
      modelSpaceBlockRecord,
      byLayerLinetype,
      byBlockLinetype,
      continuousLinetype,
      currentPlotStyleName,
    }),
    trailingUnknownShorts,
    decodedBitLength,
    payloadBitLength,
  });
}

/** Un bloque PSPACE/MSPACE completo, con sus extensiones R2000. */
function readSpaceBlock(reader: DwgBitReader): Ac1015HeaderSpaceBlock {
  const insertionBase = read3BD(reader);
  const extentsMin = read3BD(reader);
  const extentsMax = read3BD(reader);
  const limitsMin = read2RD(reader);
  const limitsMax = read2RD(reader);
  const elevation = reader.readBD();
  const ucsOrigin = read3BD(reader);
  const ucsXAxis = read3BD(reader);
  const ucsYAxis = read3BD(reader);
  const ucsName = reader.readH();
  const ucsOrthographicReference = reader.readH();
  const ucsOrthographicView = reader.readBS();
  const ucsBase = reader.readH();
  const ucsOriginTop = read3BD(reader);
  const ucsOriginBottom = read3BD(reader);
  const ucsOriginLeft = read3BD(reader);
  const ucsOriginRight = read3BD(reader);
  const ucsOriginFront = read3BD(reader);
  const ucsOriginBack = read3BD(reader);
  return Object.freeze({
    insertionBase,
    extentsMin,
    extentsMax,
    limitsMin,
    limitsMax,
    elevation,
    ucsOrigin,
    ucsXAxis,
    ucsYAxis,
    ucsName,
    ucsOrthographicReference,
    ucsOrthographicView,
    ucsBase,
    ucsOriginTop,
    ucsOriginBottom,
    ucsOriginLeft,
    ucsOriginRight,
    ucsOriginFront,
    ucsOriginBack,
  });
}

function bit(reader: DwgBitReader): boolean {
  return reader.readB() === 1;
}

function read3BD(reader: DwgBitReader): HeaderPoint3 {
  const { x, y, z } = reader.read3BD();
  return Object.freeze({ x, y, z });
}

function read2RD(reader: DwgBitReader): HeaderPoint2 {
  const x = reader.readRD();
  const y = reader.readRD();
  return Object.freeze({ x, y });
}

function readBytes(reader: DwgBitReader): readonly number[] {
  const text = reader.readTV();
  const bytes = new Array<number>(text.bytes.length);
  for (let index = 0; index < text.bytes.length; index += 1) {
    bytes[index] = text.bytes[index]!;
  }
  return Object.freeze(bytes);
}
