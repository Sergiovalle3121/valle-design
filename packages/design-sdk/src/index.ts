/**
 * @valle/design-sdk — SDK TypeScript de la API v1 de Valle Design (CAD).
 *
 * - `paths`/`components`/`operations`: tipos GENERADOS desde
 *   `packages/contracts/specs/design-api.v1.yaml` (openapi-typescript,
 *   `npm run generate`). No editar a mano.
 * - `createDesignClient`: cliente fetch fino tipado (ver ./client).
 */

export type { paths, components, operations } from "./generated/design-api";
export * from "./client";
