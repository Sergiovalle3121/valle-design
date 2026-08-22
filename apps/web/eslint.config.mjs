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
    // Artefactos de Playwright: trazas, informes y recursos capturados del
    // navegador. Son JS de terceros generado en tiempo de ejecución; lintarlos
    // ensucia el gate con errores que no vienen del código del producto.
    "e2e/.test-results/**",
    "e2e/.report/**",
  ]),
  {
    // `eslint-plugin-react-hooks` v7 (que arrastra eslint-config-next 16) añade
    // las reglas del React Compiler como ERROR. El editor CAD extraído del
    // origen es anterior a ellas y las incumple en varios sitios, así que
    // romperían el lint por deriva de tooling. Se dejan como avisos visibles
    // —sin bloquear el build— conservando intactas las reglas clásicas
    // `rules-of-hooks` y `exhaustive-deps` (mismo criterio que el origen).
    rules: {
      // En CERO hoy y bloqueadas en error para que no vuelvan (campaña de
      // cimientos): static-components, incompatible-library,
      // set-state-in-render y use-memo.
      "react-hooks/static-components": "error",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/use-memo": "error",
      // Lo prefijado con _ es descarte deliberado, no un olvido.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
