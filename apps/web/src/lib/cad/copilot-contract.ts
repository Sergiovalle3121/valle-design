import { openAiCompatibleToolSchemas } from "./commands";

export interface CadCopilotContextObject {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
}
export interface CadCopilotSafeContext {
  unit: "mm" | "m";
  objects: CadCopilotContextObject[];
  redactions: string[];
}
export interface CadCopilotToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
export interface CadCopilotValidatedCall {
  ok: boolean;
  call?: CadCopilotToolCall;
  error?: string;
}

const SENSITIVE = [
  /customer/gi,
  /cliente/gi,
  /supplier/gi,
  /proveedor/gi,
  /operator/gi,
  /employee/gi,
  /empleado/gi,
];

export function redactCadCopilotText(value: string): {
  text: string;
  redacted: boolean;
} {
  let text = value;
  let redacted = false;
  for (const pattern of SENSITIVE) {
    text = text.replace(pattern, () => {
      redacted = true;
      return "[redacted]";
    });
  }
  return { text, redacted };
}
export function buildCadCopilotSafeContext(
  objects: CadCopilotContextObject[],
  unit: "mm" | "m" = "mm",
): CadCopilotSafeContext {
  const redactions: string[] = [];
  return {
    unit,
    objects: objects.map((object) => {
      const label = redactCadCopilotText(object.label);
      if (label.redacted) redactions.push(object.id);
      return { ...object, label: label.text };
    }),
    redactions,
  };
}
export function cadCopilotToolSchemas() {
  return openAiCompatibleToolSchemas();
}
export function validateCadCopilotToolCall(
  raw: unknown,
): CadCopilotValidatedCall {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "Tool call inválida." };
  const call = raw as Partial<CadCopilotToolCall>;
  if (typeof call.name !== "string")
    return { ok: false, error: "Tool call sin nombre." };
  if (
    !cadCopilotToolSchemas().some(
      (schema) => schema.function.name === call.name,
    )
  )
    return { ok: false, error: `Tool no registrada: ${call.name}.` };
  if (
    !call.arguments ||
    typeof call.arguments !== "object" ||
    Array.isArray(call.arguments)
  )
    return { ok: false, error: "Argumentos de tool inválidos." };
  return {
    ok: true,
    call: {
      name: call.name,
      arguments: call.arguments as Record<string, unknown>,
    },
  };
}
