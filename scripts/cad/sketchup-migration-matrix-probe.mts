/**
 * Sonda de la matriz de migración SketchUp→Valle.
 *
 * Imprime la matriz por stdout; `build-sketchup-migration-matrix.mjs` la
 * ejecuta con `tsx` y la vuelca al artefacto — mismo patrón que la sonda del
 * corpus DXF externo.
 *
 * El polyfill de `DOMParser` es EXCLUSIVO de esta sonda (Node no lo trae; el
 * navegador y el worker donde corre `collada-mesh-reader.ts` en producción sí
 * lo tienen nativo). Cubre sólo el subconjunto de la API que
 * `ColladaParser.js` de three usa de verdad — no es un DOM completo. La misma
 * idea, la misma cobertura, que el polyfill de `FileReader` que ya usan los
 * specs de exportación GLB.
 */
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
    return this.childNodes.filter((node) => node.nodeType === ELEMENT_NODE);
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
    return this.childNodes.map((node) => node.textContent).join("");
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

// `GLTFExporter` ensambla el binario con `FileReader` (API de navegador) para
// construir el `.glb` de la escena multi-componente. Mismo polyfill mínimo
// que ya usan los specs de exportación GLB.
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

// `ColladaLoader` escribe avisos informativos con `console.log`/`console.warn`
// ("File version 1.4.1", el aviso de Z-up→Y-up): el contrato de esta sonda es
// UN SOLO JSON por stdout, así que se desvían a stderr mientras corre.
const realConsole = { log: console.log, warn: console.warn, debug: console.debug, info: console.info };
const toStderr = (...args: unknown[]) => process.stderr.write(`${args.map(String).join(" ")}\n`);
console.log = toStderr;
console.warn = toStderr;
console.debug = toStderr;
console.info = toStderr;

const { buildSketchupMigrationMatrix } = await import("../../apps/web/src/lib/cad/interop/sketchup-migration-matrix");
const matrix = await buildSketchupMigrationMatrix();

Object.assign(console, realConsole);
process.stdout.write(JSON.stringify(matrix));
