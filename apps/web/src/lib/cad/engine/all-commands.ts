/**
 * Los 106 módulos de comandos, con `import` ESTÁTICO. GENERADO — no se edita a mano.
 *
 * Lo escribe `node scripts/cad/build-command-manifest.mjs --write` y `--check`
 * lo verifica, del mismo tirón que `command-manifest.ts`.
 *
 * ## Para qué, y para qué NO
 *
 * PARA NODE: los specs y las sondas que ejecutan comandos de verdad. Un
 * `.spec.ts` se carga como CommonJS y no admite `await` de nivel superior, así
 * que no puede pedir `cadWarmAllCommands()`; con una línea —`import
 * "../all-commands"`— tiene las 291 implementaciones y sigue probando lo mismo
 * que probaba. En Node cargarlas todas no cuesta bytes de red.
 *
 * NO PARA EL NAVEGADOR. Importar esto desde el estudio deshace entero el arreglo
 * de carga del 2026-09-04 y devuelve las 291 implementaciones al primer chunk.
 * Lo impiden dos gates: `build-command-manifest.mjs --check`, que nombra el
 * fichero culpable en segundos, y `e2e/performance/frontend-load-budget.spec.ts`,
 * que mide lo que el navegador descarga de verdad contra un techo que sólo baja.
 */
import { cadRegisterCommandModules } from "./lazy-commands";

import * as m000 from "./commands/annotate-dimension-chains";
import * as m001 from "./commands/annotate-dimensions";
import * as m002 from "./commands/annotate-dimensions-angular";
import * as m003 from "./commands/annotate-dimensions-radial";
import * as m004 from "./commands/annotate-hatch";
import * as m005 from "./commands/annotate-leaders";
import * as m006 from "./commands/annotate-quick";
import * as m007 from "./commands/annotate-quickleader";
import * as m008 from "./commands/annotate-styles";
import * as m009 from "./commands/annotate-table-edit";
import * as m010 from "./commands/annotate-text";
import * as m011 from "./commands/annotate-tolerance";
import * as m012 from "./commands/architecture-roof";
import * as m013 from "./commands/architecture-stair";
import * as m014 from "./commands/automation-actions";
import * as m015 from "./commands/automation-script";
import * as m016 from "./commands/blocks";
import * as m017 from "./commands/blocks-burst";
import * as m018 from "./commands/blocks-edit";
import * as m019 from "./commands/clipboard";
import * as m020 from "./commands/compare-drawings";
import * as m021 from "./commands/data-extraction-commands";
import * as m022 from "./commands/delivery-review";
import * as m023 from "./commands/design-center";
import * as m024 from "./commands/dimension-tolerance";
import * as m025 from "./commands/draw-annotation-v4";
import * as m026 from "./commands/draw-basics";
import * as m027 from "./commands/draw-construction";
import * as m028 from "./commands/draw-curves";
import * as m029 from "./commands/draw-fills";
import * as m030 from "./commands/draw-opening";
import * as m031 from "./commands/draw-pline";
import * as m032 from "./commands/draw-points";
import * as m033 from "./commands/draw-rectang";
import * as m034 from "./commands/draw-rings";
import * as m035 from "./commands/draw-spline";
import * as m036 from "./commands/draw-wall";
import * as m037 from "./commands/drawing-fields";
import * as m038 from "./commands/dynamic-block";
import * as m039 from "./commands/electrical-circuit";
import * as m040 from "./commands/electrical-tag";
import * as m041 from "./commands/electrical-wire";
import * as m042 from "./commands/etransmit-commands";
import * as m043 from "./commands/express-tools";
import * as m044 from "./commands/geo-location";
import * as m045 from "./commands/groups";
import * as m046 from "./commands/history-commands";
import * as m047 from "./commands/inquiry-list";
import * as m048 from "./commands/inquiry-measure";
import * as m049 from "./commands/inquiry-region";
import * as m050 from "./commands/interop-dxf";
import * as m051 from "./commands/layout-commands";
import * as m052 from "./commands/manage-audit";
import * as m053 from "./commands/manage-laytrans";
import * as m054 from "./commands/manage-recover";
import * as m055 from "./commands/manage-standards";
import * as m056 from "./commands/map-import";
import * as m057 from "./commands/mechanical-annotate";
import * as m058 from "./commands/mechanical-parts";
import * as m059 from "./commands/mechanical-symbols";
import * as m060 from "./commands/mep-symbol";
import * as m061 from "./commands/mep-tracing";
import * as m062 from "./commands/modify-align";
import * as m063 from "./commands/modify-array";
import * as m064 from "./commands/modify-basics";
import * as m065 from "./commands/modify-blend";
import * as m066 from "./commands/modify-cleanup";
import * as m067 from "./commands/modify-edges";
import * as m068 from "./commands/modify-foreign";
import * as m069 from "./commands/modify-join";
import * as m070 from "./commands/modify-mirror";
import * as m071 from "./commands/modify-pedit";
import * as m072 from "./commands/modify-stretch";
import * as m073 from "./commands/modify-transform";
import * as m074 from "./commands/parametric-dimensions";
import * as m075 from "./commands/parametric-geometry";
import * as m076 from "./commands/pdf-underlay-commands";
import * as m077 from "./commands/plant-equipment";
import * as m078 from "./commands/plant-iso";
import * as m079 from "./commands/plant-line";
import * as m080 from "./commands/plant-route";
import * as m081 from "./commands/plot-commands";
import * as m082 from "./commands/raster-image";
import * as m083 from "./commands/reference-edit";
import * as m084 from "./commands/select-query";
import * as m085 from "./commands/select-similar";
import * as m086 from "./commands/settings-layer-tools";
import * as m087 from "./commands/settings-mexican-standard";
import * as m088 from "./commands/settings-palettes";
import * as m089 from "./commands/settings-variables";
import * as m090 from "./commands/sheet-set-commands";
import * as m091 from "./commands/solids-create";
import * as m092 from "./commands/solids-edit";
import * as m093 from "./commands/solids-flatshot";
import * as m094 from "./commands/solids-inquiry";
import * as m095 from "./commands/solids-interop";
import * as m096 from "./commands/solids-modify";
import * as m097 from "./commands/solids-primitives";
import * as m098 from "./commands/solids-push-face";
import * as m099 from "./commands/solview-commands";
import * as m100 from "./commands/ucs-commands";
import * as m101 from "./commands/ucs-view-commands";
import * as m102 from "./commands/view-navigation";
import * as m103 from "./commands/view-navigation-3d";
import * as m104 from "./commands/view-visual";
import * as m105 from "./commands/xrefs";

cadRegisterCommandModules([
  m000,
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
  m008,
  m009,
  m010,
  m011,
  m012,
  m013,
  m014,
  m015,
  m016,
  m017,
  m018,
  m019,
  m020,
  m021,
  m022,
  m023,
  m024,
  m025,
  m026,
  m027,
  m028,
  m029,
  m030,
  m031,
  m032,
  m033,
  m034,
  m035,
  m036,
  m037,
  m038,
  m039,
  m040,
  m041,
  m042,
  m043,
  m044,
  m045,
  m046,
  m047,
  m048,
  m049,
  m050,
  m051,
  m052,
  m053,
  m054,
  m055,
  m056,
  m057,
  m058,
  m059,
  m060,
  m061,
  m062,
  m063,
  m064,
  m065,
  m066,
  m067,
  m068,
  m069,
  m070,
  m071,
  m072,
  m073,
  m074,
  m075,
  m076,
  m077,
  m078,
  m079,
  m080,
  m081,
  m082,
  m083,
  m084,
  m085,
  m086,
  m087,
  m088,
  m089,
  m090,
  m091,
  m092,
  m093,
  m094,
  m095,
  m096,
  m097,
  m098,
  m099,
  m100,
  m101,
  m102,
  m103,
  m104,
  m105,
]);
