/**
 * La matriz de migración se puede volver a MEDIR, no sólo leer: si el
 * cosedor o un lector cambian de comportamiento, este spec lo nota antes que
 * un revisor mirando el JSON generado.
 */
import assert from "node:assert/strict";

// Polyfills de Node — ver la cabecera de `mesh-document-import.spec.ts` para
// el porqué exacto de cada uno.
class NodeFileReader {
  onload: ((event: { target: NodeFileReader }) => void) | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  result: ArrayBuffer | string | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => this.onerror?.(error));
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => this.onerror?.(error));
  }
}
(globalThis as { FileReader?: unknown }).FileReader ??= NodeFileReader;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
class XmlNode {
  nodeType: number;
  nodeName: string;
  childNodes: XmlNode[] = [];
  private attrs = new Map<string, string>();
  text = "";
  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }
  get children(): XmlNode[] {
    return this.childNodes.filter((n) => n.nodeType === ELEMENT_NODE);
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) as string) : null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  get textContent(): string {
    if (this.nodeType === TEXT_NODE) return this.text;
    return this.childNodes.map((n) => n.textContent).join("");
  }
  getElementsByTagName(name: string): XmlNode[] {
    const out: XmlNode[] = [];
    const visit = (node: XmlNode) => {
      for (const child of node.childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          if (child.nodeName === name) out.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }
}
function decodeXmlEntities(raw: string): string {
  return raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function parseXmlDocument(source: string): XmlNode {
  const text = source.replace(/<\?xml[^?]*\?>/, "");
  const len = text.length;
  let i = 0;
  function parseElement(): XmlNode {
    i += 1;
    const nameStart = i;
    while (i < len && !/[\s/>]/.test(text[i])) i += 1;
    const element = new XmlNode(ELEMENT_NODE, text.slice(nameStart, i));
    for (;;) {
      while (i < len && /\s/.test(text[i])) i += 1;
      if (text[i] === "/" || text[i] === ">") break;
      const attrNameStart = i;
      while (i < len && text[i] !== "=" && !/\s/.test(text[i])) i += 1;
      const attrName = text.slice(attrNameStart, i);
      while (i < len && /\s/.test(text[i])) i += 1;
      i += 1;
      while (i < len && /\s/.test(text[i])) i += 1;
      const quote = text[i];
      i += 1;
      const valueStart = i;
      while (i < len && text[i] !== quote) i += 1;
      element.setAttribute(attrName, decodeXmlEntities(text.slice(valueStart, i)));
      i += 1;
    }
    if (text[i] === "/") {
      i += 2;
      return element;
    }
    i += 1;
    for (;;) {
      if (text.startsWith("</", i)) {
        i = text.indexOf(">", i) + 1;
        break;
      }
      if (text.startsWith("<!--", i)) {
        i = text.indexOf("-->", i) + 3;
        continue;
      }
      if (text[i] === "<") {
        element.childNodes.push(parseElement());
      } else {
        const nextTag = text.indexOf("<", i);
        const raw = text.slice(i, nextTag === -1 ? len : nextTag);
        i = nextTag === -1 ? len : nextTag;
        if (raw.trim().length > 0) {
          const textNode = new XmlNode(TEXT_NODE, "#text");
          textNode.text = decodeXmlEntities(raw);
          element.childNodes.push(textNode);
        }
      }
    }
    return element;
  }
  while (i < len && /\s/.test(text[i])) i += 1;
  const root = parseElement();
  const doc = new XmlNode(9, "#document");
  doc.childNodes.push(root);
  return doc;
}
class NodeDOMParser {
  parseFromString(text: string): XmlNode {
    return parseXmlDocument(text);
  }
}
(globalThis as { DOMParser?: unknown }).DOMParser ??= NodeDOMParser;

async function main(): Promise<void> {
  const { buildSketchupMigrationMatrix } = await import("./sketchup-migration-matrix");
  const matrix = await buildSketchupMigrationMatrix();

  assert.equal(matrix.corpusSintetico, true, "declara honestamente que es corpus sintético");
  assert.ok(/no consiguió/.test(matrix.limitacion), "la limitación de procedencia está escrita, no implícita");
  assert.ok(matrix.casos.length >= 5, "al menos los cinco casos base");

  let checks = 0;
  for (const caso of matrix.casos) {
    assert.equal(caso.caras.coinciden, true, `${caso.id}: caras esperadas vs cosidas`);
    assert.equal(caso.volumen.coincide, true, `${caso.id}: volumen esperado vs calculado (${caso.volumen.errorRelativo})`);
    assert.equal(caso.componentes.todosPreservados, true, `${caso.id}: componentes preservados`);
    assert.equal(caso.cuerpoCerrado, true, `${caso.id}: cuerpo cerrado`);
    checks += 4;
  }
  const multi = matrix.casos.find((caso) => caso.id === "escena-multi-componente-gltf");
  assert.ok(multi && multi.componentes.encontrados === 3, "la escena multi-componente conserva sus 3 sólidos");
  checks += 1;

  console.log(`✔ sketchup-migration-matrix: ${checks} aserciones verdes sobre ${matrix.casos.length} casos`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
