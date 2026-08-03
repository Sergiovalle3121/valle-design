import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
const session = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
const context = readFileSync(new URL("../contexts/DesignAuthContext.tsx", import.meta.url), "utf8");
assert.doesNotMatch(session, /localStorage|refresh_token|Authorization:\s*Bearer/);
assert.doesNotMatch(context, /localStorage|refresh_token|Authorization:\s*Bearer/);

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const mockE2eSources = globSync("e2e/**/*.ts", {
  cwd: webRoot,
  ignore: ["e2e/real/**"],
})
  .map((file) => readFileSync(`${webRoot}/${file}`, "utf8"))
  .join("\n");

assert.doesNotMatch(
  mockE2eSources,
  /AXOS_SESSION_SECRET|axos_access_token|\bmasterJwt\b|\bloginAsMaster\b|Authorization:\s*Bearer|\blocalStorage\b/i,
  "Los fixtures Playwright herméticos deben usar cookies first-party y CSRF standalone.",
);
