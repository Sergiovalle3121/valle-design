import {
  Ajv2020,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import { compareCodeUnits } from "./safe-path.js";

const addFormats =
  addFormatsModule as unknown as typeof import("ajv-formats").default;

function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  return [...errors]
    .map((error) => {
      const location = error.instancePath === "" ? "/" : error.instancePath;
      return `${location} ${error.message ?? "failed validation"}`;
    })
    .sort(compareCodeUnits)
    .join("; ");
}

function compileSchema(
  schema: unknown,
  documentLabel: string,
): ValidateFunction {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
    validateFormats: true,
  });
  addFormats(ajv);

  try {
    return ajv.compile(schema as AnySchema);
  } catch (error) {
    throw new Error(
      `${documentLabel}: schema is invalid under strict Ajv 2020`,
      {
        cause: error,
      },
    );
  }
}

export function assertSchemaCompiles(
  schema: unknown,
  documentLabel: string,
): void {
  compileSchema(schema, documentLabel);
}

export function assertSchemaValid<T>(
  schema: unknown,
  value: unknown,
  documentLabel: string,
): asserts value is T {
  const validate = compileSchema(schema, documentLabel);

  if (!validate(value)) {
    throw new Error(
      `${documentLabel}: schema validation failed: ${formatSchemaErrors(validate.errors ?? [])}`,
    );
  }
}
