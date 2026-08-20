/**
 * EL PERFILADO NO LE CUESTA NADA A PRODUCCIÓN, Y CUANDO MIDE, MIDE BIEN.
 *
 * `render-profile.ts` entró en la rama `claude/p1-ola2` con el mensaje «WIP sin
 * verificar» y llegó a `main` igual: lo importan `pipeline.ts` y
 * `pipeline-offthread.ts` —el camino que corre en el editor— pero no lo cubría
 * ningún spec. Se apoyaba en una AFIRMACIÓN de su cabecera: apagada «no se pide
 * reloj, no se asigna nada y no se recorre nada». Eso es justo lo que aquí se
 * fija, porque el módulo tiene dos modos de fallar en silencio y los dos son
 * caros:
 *
 *   · Que la bandera se quede ENCENDIDA. El estado es un puntero de módulo, así
 *     que un arnés que no para su perfil se lo deja puesto a todo el proceso: el
 *     editor pagaría dos `performance.now()` por cada entidad teselada, para
 *     siempre y sin que nada lo denuncie.
 *
 *   · Que el centinela 0 deje de protegerse. `cadRenderMark` devuelve 0 cuando
 *     está apagada, y ese 0 puede sobrevivir a un `startCadRenderProfile` que
 *     ocurra en medio. Si `cadRenderStage` lo aceptara como un instante real
 *     acumularía `now() - 0`, es decir, el tiempo entero desde que arrancó el
 *     reloj: una etapa con millones de milisegundos que parece un dato y no lo
 *     es. Es el caso de FALLO CERRADO del módulo y se comprueba explícitamente.
 *
 * No se mide aquí el SOBRECOSTE en milisegundos: un número de rendimiento con la
 * máquina compartida no sería evidencia de nada. Eso vive en el arnés del
 * benchmark, con sus condiciones declaradas. Aquí se fija el CONTRATO.
 */
import { strict as assert } from "node:assert";
import {
  CAD_RENDER_COUNTERS,
  CAD_RENDER_STAGES,
  cadRenderCount,
  cadRenderMark,
  cadRenderProfiling,
  cadRenderStage,
  cadRenderStageTotalMs,
  startCadRenderProfile,
  stopCadRenderProfile,
} from "./render-profile";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Quema CPU de verdad: hace falta que el reloj avance entre dos marcas. */
function trabajo(): void {
  let sink = 0;
  for (let index = 0; index < 200_000; index += 1) sink += Math.sqrt(index);
  if (sink < 0) throw new Error("inalcanzable");
}

// ── Apagada por defecto ──────────────────────────────────────────────────────
// Importar el módulo no puede encender nada: si el estado inicial fuera otro,
// bastaría con que el editor importara el pipeline para empezar a pagar relojes.
ok(!cadRenderProfiling(), "recién importado, el perfilado está APAGADO");
ok(cadRenderMark() === 0, "apagada, `cadRenderMark` devuelve el centinela 0");
ok(
  cadRenderMark() === 0 && cadRenderMark() === 0,
  "apagada, la marca es 0 siempre: no hay reloj de por medio que la haga variar",
);

// Apagada, nada de lo que se le mande acumula ni revienta.
cadRenderStage("tessellate", 0);
cadRenderStage("batchPush", 12_345);
cadRenderCount("chunks", 7);
ok(!cadRenderProfiling(), "acumular con el perfilado apagado no lo enciende");

// ── Encendida: acumula tiempo, llamadas y contadores ─────────────────────────
startCadRenderProfile();
ok(cadRenderProfiling(), "`startCadRenderProfile` enciende la medición");

const marca = cadRenderMark();
ok(marca > 0, "encendida, la marca es un instante real y no el centinela");
trabajo();
cadRenderStage("tessellate", marca);

const segunda = cadRenderMark();
trabajo();
cadRenderStage("tessellate", segunda);
cadRenderCount("chunks");
cadRenderCount("offThreadEntities", 40);

const perfil = stopCadRenderProfile();
ok(!cadRenderProfiling(), "`stopCadRenderProfile` APAGA la medición");
ok(perfil.calls.tessellate === 2, "dos etapas cerradas cuentan dos llamadas");
ok(perfil.ms.tessellate > 0, "una etapa con trabajo dentro acumula tiempo positivo");
ok(perfil.counters.chunks === 1, "el contador sin cantidad suma uno");
ok(perfil.counters.offThreadEntities === 40, "el contador con cantidad suma esa cantidad");
ok(
  perfil.calls.batchPush === 0 && perfil.ms.batchPush === 0,
  "lo que se acumuló ANTES de encender no entra en el perfil",
);

// ── El centinela 0 no se acepta como instante ────────────────────────────────
// Éste es el fallo cerrado: una marca tomada apagada que se cierra encendida.
startCadRenderProfile();
cadRenderStage("viewDiff", 0);
const conCentinela = stopCadRenderProfile();
ok(
  conCentinela.calls.viewDiff === 0 && conCentinela.ms.viewDiff === 0,
  "una marca con centinela 0 se descarta en vez de acumular el reloj entero",
);

// ── Encender descarta lo de la corrida anterior ──────────────────────────────
startCadRenderProfile();
const previa = cadRenderMark();
trabajo();
cadRenderStage("batchPush", previa);
startCadRenderProfile();
const limpio = stopCadRenderProfile();
ok(
  limpio.calls.batchPush === 0 && limpio.ms.batchPush === 0,
  "`startCadRenderProfile` descarta lo acumulado por una corrida anterior",
);

// ── Parar dos veces no revienta ──────────────────────────────────────────────
// Un arnés que para dos veces es un error del arnés, no una corrida que tirar:
// devolver un perfil vacío deja el fallo a la vista sin abortar la medición.
const vacio = stopCadRenderProfile();
ok(
  cadRenderStageTotalMs(vacio) === 0,
  "parar sin perfil en curso devuelve un perfil vacío en vez de fallar",
);

// ── Todas las etapas y contadores existen y son números ──────────────────────
// Protege de estrenar una etapa en el tipo y olvidarla en el array: `ms[stage]`
// sería `undefined` y el total saldría NaN, que es un número que pasa
// desapercibido en un JSON de evidencia.
startCadRenderProfile();
const completo = stopCadRenderProfile();
for (const stage of CAD_RENDER_STAGES) {
  ok(completo.ms[stage] === 0, `la etapa ${stage} arranca en 0 y no en undefined`);
  ok(completo.calls[stage] === 0, `las llamadas de ${stage} arrancan en 0`);
}
for (const counter of CAD_RENDER_COUNTERS)
  ok(completo.counters[counter] === 0, `el contador ${counter} arranca en 0`);
ok(
  Number.isFinite(cadRenderStageTotalMs(completo)),
  "el total de un perfil recién creado es finito, no NaN",
);

// ── El total es la suma de las etapas ────────────────────────────────────────
startCadRenderProfile();
const a = cadRenderMark();
trabajo();
cadRenderStage("tessellate", a);
const b = cadRenderMark();
trabajo();
cadRenderStage("visibleBatches", b);
const sumado = stopCadRenderProfile();
const suma = CAD_RENDER_STAGES.reduce((total, stage) => total + sumado.ms[stage], 0);
ok(
  Math.abs(cadRenderStageTotalMs(sumado) - suma) < 1e-6,
  "`cadRenderStageTotalMs` es exactamente la suma de las etapas",
);

// El módulo queda como lo encontró: apagado. Los specs comparten proceso con
// nadie, pero la costumbre importa: este estado es global.
ok(!cadRenderProfiling(), "el spec deja el perfilado apagado, como lo encontró");

console.log(
  `render-profile: ${checks} comprobaciones verdes — el perfilado nace y muere APAGADO, la marca ` +
    `apagada es el centinela 0 y nunca pide reloj, una marca con centinela se descarta en vez de ` +
    `acumular el tiempo entero desde el arranque, encender descarta la corrida anterior, parar dos ` +
    `veces devuelve vacío en vez de fallar y el total cuadra con la suma de las etapas.`,
);
