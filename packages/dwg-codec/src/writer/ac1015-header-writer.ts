/**
 * Emisor de la sección de VARIABLES DE CABECERA R2000 — campaña 2026-08-21,
 * OLA 3.1.
 *
 * Espejo exacto de `decodeAc1015HeaderVariables`: emite la secuencia
 * completa registrada como hecho (SOURCE_REGISTER, capítulo 9 de la ODS).
 * Los DEFAULTS de `createAc1015HeaderVariables` son los valores MEDIDOS del
 * fixture 01-vacio del corpus admitido (nuestro propio dibujo convertido por
 * la herramienta independiente): un conjunto completo y coherente que un
 * lector ajeno acepta, incluida la disposición canónica de handles
 * estructurales (controles 0x01-0x0B con código 3, diccionarios, capa "0"
 * en 0x10, ByLayer/ByBlock/Continuous en 0x15/0x14/0x16, *Model_Space en
 * 0x1D). Determinista: los timestamps por defecto son fijos.
 */
import type {
  Ac1015HeaderSpaceBlock,
  Ac1015HeaderVariables,
  HeaderPoint3,
} from "../container/ac1015-header-variables.js";
import type { DwgHandleReference } from "../codecs/bitcodes.js";
import { DwgBitEmitter } from "./dwg-bit-emitter.js";

/** Una referencia de handle del modelo de cabecera, lista para emitir. */
function handle(code: number, value: number): DwgHandleReference {
  return Object.freeze({
    code,
    value,
    byteLength: value === 0 ? 0 : byteLengthOf(value),
  }) as DwgHandleReference;
}

function byteLengthOf(value: number): number {
  let length = 0;
  let rest = value;
  while (rest > 0) {
    length += 1;
    rest = Math.floor(rest / 256);
  }
  return length;
}

const ZERO3: HeaderPoint3 = Object.freeze({ x: 0, y: 0, z: 0 });

function spaceBlockDefaults(): Ac1015HeaderSpaceBlock {
  return Object.freeze({
    insertionBase: ZERO3,
    extentsMin: Object.freeze({ x: 1e20, y: 1e20, z: 1e20 }),
    extentsMax: Object.freeze({ x: -1e20, y: -1e20, z: -1e20 }),
    limitsMin: Object.freeze({ x: 0, y: 0 }),
    limitsMax: Object.freeze({ x: 12, y: 9 }),
    elevation: 0,
    ucsOrigin: ZERO3,
    ucsXAxis: Object.freeze({ x: 1, y: 0, z: 0 }),
    ucsYAxis: Object.freeze({ x: 0, y: 1, z: 0 }),
    ucsName: handle(5, 0),
    ucsOrthographicReference: handle(5, 0),
    ucsOrthographicView: 0,
    ucsBase: handle(5, 0),
    ucsOriginTop: ZERO3,
    ucsOriginBottom: ZERO3,
    ucsOriginLeft: ZERO3,
    ucsOriginRight: ZERO3,
    ucsOriginFront: ZERO3,
    ucsOriginBack: ZERO3,
  });
}

/**
 * Un juego COMPLETO y coherente de variables de cabecera con los valores
 * medidos del corpus (fixture 01-vacio). `overrides` reemplaza campos de
 * primer nivel (p. ej. `handles`, `modelSpace` o `insunits` enteros).
 */
export function createAc1015HeaderVariables(
  overrides: Partial<Ac1015HeaderVariables> = {},
): Ac1015HeaderVariables {
  const defaults: Ac1015HeaderVariables = {
    unknownDoubles: [412148564080, 1, 1, 1],
    unknownTexts: Object.freeze([
      Object.freeze([0x6d]),
      Object.freeze([]),
      Object.freeze([]),
      Object.freeze([]),
    ]),
    unknownLongs: [0, 0],
    dimaso: true,
    dimsho: true,
    plinegen: false,
    orthomode: false,
    regenmode: true,
    fillmode: true,
    qtextmode: false,
    psltscale: true,
    limcheck: false,
    usrtimer: true,
    skpoly: false,
    angdir: false,
    splframe: false,
    mirrtext: false,
    worldview: true,
    tilemode: true,
    plimcheck: false,
    visretain: true,
    dispsilh: false,
    pellipse: false,
    proxygraphics: 1,
    treedepth: 3020,
    lunits: 2,
    luprec: 4,
    aunits: 0,
    auprec: 0,
    attmode: 1,
    pdmode: 0,
    useri: [0, 0, 0, 0, 0],
    splinesegs: 8,
    surfu: 6,
    surfv: 6,
    surftype: 6,
    surftab1: 6,
    surftab2: 6,
    splinetype: 6,
    shadedge: 3,
    shadedif: 70,
    unitmode: 0,
    maxactvp: 64,
    isolines: 4,
    cmljust: 0,
    textqlty: 50,
    ltscale: 1,
    textsize: 0.2,
    tracewid: 0.05,
    sketchinc: 0.1,
    filletrad: 0,
    thickness: 0,
    angbase: 0,
    pdsize: 0,
    plinewid: 0,
    userr: [0, 0, 0, 0, 0],
    chamfera: 0,
    chamferb: 0,
    chamferc: 0,
    chamferd: 0,
    facetres: 0.5,
    cmlscale: 1,
    celtscale: 1,
    menuname: Object.freeze([0x2e]),
    tdcreate: [2461273, 58247617],
    tdupdate: [2461273, 58247625],
    tdindwg: [0, 1],
    tdusrtimer: [0, 1],
    cecolor: Object.freeze({ index: 256 }),
    psvpscale: 0,
    paperSpace: spaceBlockDefaults(),
    modelSpace: spaceBlockDefaults(),
    dimensions: Object.freeze({
      dimpost: Object.freeze([]),
      dimapost: Object.freeze([]),
      dimscale: 1,
      dimasz: 0.18,
      dimexo: 0.0625,
      dimdli: 0.38,
      dimexe: 0.18,
      dimrnd: 0,
      dimdle: 0,
      dimtp: 0,
      dimtm: 0,
      dimtol: false,
      dimlim: false,
      dimtih: true,
      dimtoh: true,
      dimse1: false,
      dimse2: false,
      dimtad: 0,
      dimzin: 0,
      dimazin: 0,
      dimtxt: 0.18,
      dimcen: 0.09,
      dimtsz: 0,
      dimaltf: 25.4,
      dimlfac: 1,
      dimtvp: 0,
      dimtfac: 1,
      dimgap: 0.09,
      dimaltrnd: 0,
      dimalt: false,
      dimaltd: 2,
      dimtofl: false,
      dimsah: false,
      dimtix: false,
      dimsoxd: false,
      dimclrd: Object.freeze({ index: 0 }),
      dimclre: Object.freeze({ index: 0 }),
      dimclrt: Object.freeze({ index: 0 }),
      dimadec: 0,
      dimdec: 4,
      dimtdec: 4,
      dimaltu: 2,
      dimalttd: 2,
      dimaunit: 0,
      dimfrac: 0,
      dimlunit: 2,
      dimdsep: 46,
      dimtmove: 2,
      dimjust: 0,
      dimsd1: false,
      dimsd2: false,
      dimtolj: 1,
      dimtzin: 0,
      dimaltz: 0,
      dimalttz: 0,
      dimupt: false,
      dimatfit: 3,
      dimtxsty: handle(5, 0x11),
      dimldrblk: handle(5, 0),
      dimblk: handle(5, 0),
      dimblk1: handle(5, 0),
      dimblk2: handle(5, 0),
      dimlwd: 65534,
      dimlwe: 65534,
    }),
    tstackalign: 1,
    tstacksize: 70,
    hyperlinkbase: Object.freeze([]),
    stylesheet: Object.freeze([]),
    flags: 10781,
    insunits: 0,
    cepsntype: 0,
    fingerprintGuid: asciiBytes("{0e2dec01-9d40-44ca-b648-bdd649298ecf}"),
    versionGuid: asciiBytes("{FAEB1C32-E019-11D5-929B-00C0DF256EC4}"),
    handles: Object.freeze({
      currentViewportEntityHeader: handle(5, 0),
      handseed: handle(0, 0xac),
      clayer: handle(5, 0x10),
      textstyle: handle(5, 0x11),
      celtype: handle(5, 0x14),
      dimstyle: handle(5, 0x20),
      cmlstyle: handle(5, 0x18),
      blockControl: handle(3, 0x01),
      layerControl: handle(3, 0x02),
      styleControl: handle(3, 0x03),
      linetypeControl: handle(3, 0x05),
      viewControl: handle(3, 0x06),
      ucsControl: handle(3, 0x07),
      vportControl: handle(3, 0x08),
      appidControl: handle(3, 0x09),
      dimstyleControl: handle(3, 0x0a),
      viewportEntityHeaderControl: handle(3, 0x0b),
      groupDictionary: handle(5, 0x0d),
      mlineStyleDictionary: handle(5, 0x17),
      namedObjectsDictionary: handle(3, 0x0c),
      layoutsDictionary: handle(5, 0x1a),
      plotSettingsDictionary: handle(5, 0x19),
      plotStylesDictionary: handle(5, 0x0e),
      paperSpaceBlockRecord: handle(5, 0x1b),
      modelSpaceBlockRecord: handle(5, 0x1d),
      byLayerLinetype: handle(5, 0x15),
      byBlockLinetype: handle(5, 0x14),
      continuousLinetype: handle(5, 0x16),
      currentPlotStyleName: undefined,
    }),
    trailingUnknownShorts: [65535, 65535, 65535, 65535],
    decodedBitLength: 0,
    payloadBitLength: 0,
  };
  return Object.freeze({ ...defaults, ...overrides });
}

function asciiBytes(value: string): readonly number[] {
  return Object.freeze([...value].map((c) => c.charCodeAt(0)));
}

/**
 * Emite el payload COMPLETO de la sección de variables (lo que va tras el
 * tamaño RL del marco y antes de su CRC), con relleno de ceros hasta el
 * límite de byte. `decodedBitLength`/`payloadBitLength` del modelo se
 * ignoran: son medidas del lector.
 */
export function encodeAc1015HeaderVariables(
  vars: Ac1015HeaderVariables,
): Uint8Array {
  const e = new DwgBitEmitter();

  for (const value of vars.unknownDoubles) e.emitBD(value);
  for (const text of vars.unknownTexts) e.emitTV([...text]);
  for (const value of vars.unknownLongs) e.emitBL(value);

  emitHandle(e, vars.handles.currentViewportEntityHeader);

  for (const flag of [
    vars.dimaso,
    vars.dimsho,
    vars.plinegen,
    vars.orthomode,
    vars.regenmode,
    vars.fillmode,
    vars.qtextmode,
    vars.psltscale,
    vars.limcheck,
    vars.usrtimer,
    vars.skpoly,
    vars.angdir,
    vars.splframe,
    vars.mirrtext,
    vars.worldview,
    vars.tilemode,
    vars.plimcheck,
    vars.visretain,
    vars.dispsilh,
    vars.pellipse,
  ]) {
    e.pushBit(flag ? 1 : 0);
  }

  for (const value of [
    vars.proxygraphics,
    vars.treedepth,
    vars.lunits,
    vars.luprec,
    vars.aunits,
    vars.auprec,
    vars.attmode,
    vars.pdmode,
    ...vars.useri,
    vars.splinesegs,
    vars.surfu,
    vars.surfv,
    vars.surftype,
    vars.surftab1,
    vars.surftab2,
    vars.splinetype,
    vars.shadedge,
    vars.shadedif,
    vars.unitmode,
    vars.maxactvp,
    vars.isolines,
    vars.cmljust,
    vars.textqlty,
  ]) {
    e.emitBS(value);
  }

  for (const value of [
    vars.ltscale,
    vars.textsize,
    vars.tracewid,
    vars.sketchinc,
    vars.filletrad,
    vars.thickness,
    vars.angbase,
    vars.pdsize,
    vars.plinewid,
    ...vars.userr,
    vars.chamfera,
    vars.chamferb,
    vars.chamferc,
    vars.chamferd,
    vars.facetres,
    vars.cmlscale,
    vars.celtscale,
  ]) {
    e.emitBD(value);
  }

  e.emitTV([...vars.menuname]);

  for (const value of [
    ...vars.tdcreate,
    ...vars.tdupdate,
    ...vars.tdindwg,
    ...vars.tdusrtimer,
  ]) {
    e.emitBL(value);
  }

  e.emitBS(vars.cecolor.index);
  emitHandle(e, vars.handles.handseed);
  emitHandle(e, vars.handles.clayer);
  emitHandle(e, vars.handles.textstyle);
  emitHandle(e, vars.handles.celtype);
  emitHandle(e, vars.handles.dimstyle);
  emitHandle(e, vars.handles.cmlstyle);

  e.emitBD(vars.psvpscale);
  emitSpaceBlock(e, vars.paperSpace);
  emitSpaceBlock(e, vars.modelSpace);

  const d = vars.dimensions;
  e.emitTV([...d.dimpost]);
  e.emitTV([...d.dimapost]);
  for (const value of [
    d.dimscale,
    d.dimasz,
    d.dimexo,
    d.dimdli,
    d.dimexe,
    d.dimrnd,
    d.dimdle,
    d.dimtp,
    d.dimtm,
  ]) {
    e.emitBD(value);
  }
  for (const flag of [d.dimtol, d.dimlim, d.dimtih, d.dimtoh, d.dimse1, d.dimse2]) {
    e.pushBit(flag ? 1 : 0);
  }
  e.emitBS(d.dimtad);
  e.emitBS(d.dimzin);
  e.emitBS(d.dimazin);
  for (const value of [
    d.dimtxt,
    d.dimcen,
    d.dimtsz,
    d.dimaltf,
    d.dimlfac,
    d.dimtvp,
    d.dimtfac,
    d.dimgap,
    d.dimaltrnd,
  ]) {
    e.emitBD(value);
  }
  e.pushBit(d.dimalt ? 1 : 0);
  e.emitBS(d.dimaltd);
  for (const flag of [d.dimtofl, d.dimsah, d.dimtix, d.dimsoxd]) {
    e.pushBit(flag ? 1 : 0);
  }
  e.emitBS(d.dimclrd.index);
  e.emitBS(d.dimclre.index);
  e.emitBS(d.dimclrt.index);
  for (const value of [
    d.dimadec,
    d.dimdec,
    d.dimtdec,
    d.dimaltu,
    d.dimalttd,
    d.dimaunit,
    d.dimfrac,
    d.dimlunit,
    d.dimdsep,
    d.dimtmove,
    d.dimjust,
  ]) {
    e.emitBS(value);
  }
  e.pushBit(d.dimsd1 ? 1 : 0);
  e.pushBit(d.dimsd2 ? 1 : 0);
  for (const value of [d.dimtolj, d.dimtzin, d.dimaltz, d.dimalttz]) {
    e.emitBS(value);
  }
  e.pushBit(d.dimupt ? 1 : 0);
  e.emitBS(d.dimatfit);
  emitHandle(e, d.dimtxsty);
  emitHandle(e, d.dimldrblk);
  emitHandle(e, d.dimblk);
  emitHandle(e, d.dimblk1);
  emitHandle(e, d.dimblk2);
  e.emitBS(d.dimlwd);
  e.emitBS(d.dimlwe);

  const h = vars.handles;
  emitHandle(e, h.blockControl);
  emitHandle(e, h.layerControl);
  emitHandle(e, h.styleControl);
  emitHandle(e, h.linetypeControl);
  emitHandle(e, h.viewControl);
  emitHandle(e, h.ucsControl);
  emitHandle(e, h.vportControl);
  emitHandle(e, h.appidControl);
  emitHandle(e, h.dimstyleControl);
  emitHandle(e, h.viewportEntityHeaderControl);
  emitHandle(e, h.groupDictionary);
  emitHandle(e, h.mlineStyleDictionary);
  emitHandle(e, h.namedObjectsDictionary);

  e.emitBS(vars.tstackalign);
  e.emitBS(vars.tstacksize);
  e.emitTV([...vars.hyperlinkbase]);
  e.emitTV([...vars.stylesheet]);
  emitHandle(e, h.layoutsDictionary);
  emitHandle(e, h.plotSettingsDictionary);
  emitHandle(e, h.plotStylesDictionary);

  e.emitBL(vars.flags);
  e.emitBS(vars.insunits);
  e.emitBS(vars.cepsntype);
  if (vars.cepsntype === 3) {
    emitHandle(e, h.currentPlotStyleName ?? handle(5, 0));
  }
  e.emitTV([...vars.fingerprintGuid]);
  e.emitTV([...vars.versionGuid]);

  emitHandle(e, h.paperSpaceBlockRecord);
  emitHandle(e, h.modelSpaceBlockRecord);
  emitHandle(e, h.byLayerLinetype);
  emitHandle(e, h.byBlockLinetype);
  emitHandle(e, h.continuousLinetype);

  for (const value of vars.trailingUnknownShorts) e.emitBS(value);

  return e.toBytes();
}

function emitHandle(e: DwgBitEmitter, reference: DwgHandleReference): void {
  e.emitH(reference.code, reference.value);
}

function emitSpaceBlock(e: DwgBitEmitter, block: Ac1015HeaderSpaceBlock): void {
  emit3BD(e, block.insertionBase);
  emit3BD(e, block.extentsMin);
  emit3BD(e, block.extentsMax);
  e.emitRD(block.limitsMin.x);
  e.emitRD(block.limitsMin.y);
  e.emitRD(block.limitsMax.x);
  e.emitRD(block.limitsMax.y);
  e.emitBD(block.elevation);
  emit3BD(e, block.ucsOrigin);
  emit3BD(e, block.ucsXAxis);
  emit3BD(e, block.ucsYAxis);
  emitHandle(e, block.ucsName);
  emitHandle(e, block.ucsOrthographicReference);
  e.emitBS(block.ucsOrthographicView);
  emitHandle(e, block.ucsBase);
  emit3BD(e, block.ucsOriginTop);
  emit3BD(e, block.ucsOriginBottom);
  emit3BD(e, block.ucsOriginLeft);
  emit3BD(e, block.ucsOriginRight);
  emit3BD(e, block.ucsOriginFront);
  emit3BD(e, block.ucsOriginBack);
}

function emit3BD(e: DwgBitEmitter, point: HeaderPoint3): void {
  e.emitBD(point.x);
  e.emitBD(point.y);
  e.emitBD(point.z);
}
