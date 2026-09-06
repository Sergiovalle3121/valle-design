/**
 * EL PNG SALE CON LA CÁMARA ACTIVA (T-12·2).
 *
 * «Exportar imagen (PNG)» pintaba con la `PerspectiveCamera` cruda del editor
 * aunque el visor estuviera en planta, donde la cámara activa es la
 * ortográfica: el PNG no era lo que había en pantalla. La regla que fija este
 * spec: la cámara del PNG es la del controlador de vista —la misma del bucle
 * de render— y la de perspectiva sólo entra cuando no hay controlador.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type * as THREE from "three";
import { pickCadExportCamera } from "./export-scene-actions";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const orto = { type: "OrthographicCamera" } as unknown as THREE.Camera;
const persp = { type: "PerspectiveCamera" } as unknown as THREE.Camera;

ok(pickCadExportCamera(orto, persp) === orto, "con controlador montado manda su cámara (ortográfica en planta)");
ok(pickCadExportCamera(persp, persp) === persp, "en volumen la activa ES la de perspectiva: no cambia nada");
ok(pickCadExportCamera(undefined, persp) === persp, "sin controlador se cae a la cámara del editor");
ok(pickCadExportCamera(null, null) === null, "sin ninguna cámara no se pinta nada (el llamador sale)");

const acciones = readFileSync(new URL("./export-scene-actions.ts", import.meta.url), "utf8");
const monolito = readFileSync(new URL("./Layout3DEditor.tsx", import.meta.url), "utf8");
ok(
  acciones.includes("pickCadExportCamera(viewControllerRef.current?.camera, cameraRef.current)"),
  "exportPng pide la cámara al controlador de vista y sólo cae a la de perspectiva",
);
ok(!/cam = cameraRef\.current;/.test(acciones), "ya no hay un `cam = cameraRef.current` a secas en la exportación");
ok(monolito.includes("      viewControllerRef,\n      ctxRef,"), "el monolito le pasa el controlador de vista al anfitrión de exportación");
ok(monolito.includes("renderer.render(scene, activeCamera());"), "y el bucle de render usa la misma cámara activa: pantalla y PNG coinciden");

console.log(`ok export-scene-actions: ${checks} comprobaciones`);
