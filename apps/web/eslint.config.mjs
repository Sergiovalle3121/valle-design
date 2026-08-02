import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `eslint-plugin-react-hooks` v7 (que arrastra eslint-config-next 16) añade
    // las reglas del React Compiler como ERROR. El editor CAD extraído del
    // origen es anterior a ellas y las incumple en varios sitios, así que
    // romperían el lint por deriva de tooling. Se dejan como avisos visibles
    // —sin bloquear el build— conservando intactas las reglas clásicas
    // `rules-of-hooks` y `exhaustive-deps` (mismo criterio que el origen).
    rules: {
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
]);

export default eslintConfig;
