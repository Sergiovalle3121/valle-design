import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
const session = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
const context = readFileSync(new URL("../contexts/DesignAuthContext.tsx", import.meta.url), "utf8");
assert.doesNotMatch(session, /localStorage|refresh_token|Authorization:\s*Bearer/);
assert.doesNotMatch(context, /localStorage|refresh_token|Authorization:\s*Bearer/);
