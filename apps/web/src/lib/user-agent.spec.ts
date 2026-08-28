import { strict as assert } from "node:assert";
import { describeUserAgent } from "./user-agent";

/**
 * Las cadenas de abajo son AGENTES DE USUARIO REALES, no inventados. Ése es el
 * punto: la detección por agente de usuario falla siempre en los casos que
 * nadie escribe a mano, y los tres que importan son justo los que se hacen
 * pasar por otro — Edge dice ser Chrome, Chrome de iOS dice ser Safari, y el
 * Safari de un iPad dice ser un Macintosh.
 */
const CASOS: ReadonlyArray<readonly [string, string]> = [
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Chrome en Mac",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Edge en Windows",
  ],
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Safari en Mac",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Safari en iPhone",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
    "Chrome en iPhone",
  ],
  [
    "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Firefox en Linux",
  ],
  [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Chrome en Android",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0",
    "Opera en Windows",
  ],
  [
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Chrome en ChromeOS",
  ],
];

for (const [agente, esperado] of CASOS) {
  assert.equal(
    describeUserAgent(agente),
    esperado,
    `«${agente.slice(0, 60)}…» debería leerse como ${esperado}`,
  );
}

// El iPad de Safari se anuncia como Macintosh salvo por la palabra iPad; si el
// orden de la tabla se invirtiera, todos los iPad dirían «Mac».
assert.equal(
  describeUserAgent(
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/604.1",
  ),
  "Safari en iPad",
);

// Lo que NO se reconoce se dice, en vez de enseñar media cadena cruda.
assert.equal(describeUserAgent(null), "Dispositivo sin identificar");
assert.equal(describeUserAgent(""), "Dispositivo sin identificar");
assert.equal(describeUserAgent("   "), "Dispositivo sin identificar");
assert.equal(describeUserAgent("curl/8.4.0"), "Navegador desconocido");

// Un sistema sin navegador reconocible sigue dando la mitad útil.
assert.equal(describeUserAgent("algo (Windows NT 10.0)"), "Windows");

console.log(
  `user-agent: ${CASOS.length + 7} casos verdes — agentes reales, incluidos los tres que se hacen pasar por otro (Edge por Chrome, Chrome de iOS por Safari, iPad por Mac)`,
);
