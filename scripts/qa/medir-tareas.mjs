// Robot estudiante, sin atajos ni APIs del editor.
// Uso: node scripts/qa/medir-tareas.mjs <etiqueta> [origen]
// Guarda JSON y capturas en apps/web/e2e/.artifacts/medicion-<etiqueta>/.
// Los clics se hacen solo sobre el lienzo y botones con rótulo visible. Las
// lecturas de DOM, capturas y portapapeles son observaciones, nunca acciones.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// En un worktree con `npm ci`, resuelve sus propias dependencias. Para correr
// desde un worktree ligero se puede señalar otro checkout instalado mediante
// VALLE_QA_DEPS_ROOT sin copiar node_modules ni escribir enlaces al repositorio.
const depsPackage = process.env.VALLE_QA_DEPS_ROOT
  ? path.resolve(process.env.VALLE_QA_DEPS_ROOT, 'apps/web/package.json')
  : new URL('../../apps/web/package.json', import.meta.url);
const require = createRequire(depsPackage);
const { chromium } = require('@playwright/test');
const sharp = require('sharp');

const etiqueta = process.argv[2];
if (!etiqueta || !/^[a-z0-9._-]+$/i.test(etiqueta)) {
  throw new Error('Uso: node scripts/qa/medir-tareas.mjs <etiqueta> [origen]');
}
const origin = (process.argv[3] ?? 'https://vallecad.com').replace(/\/$/, '');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/web/e2e/.artifacts', `medicion-${etiqueta}`);
await mkdir(out, { recursive: true });

const report = {
  etiqueta,
  startedAt: new Date().toISOString(),
  origin,
  url: `${origin}/demo`,
  viewport: { width: 1440, height: 769 },
  locale: 'es-MX',
  protocol: 'Contexto limpio; cuatro tareas en la misma sesión. Solo clics en botones con rótulo visible y lienzo, más Enter. DOM/capturas/portapapeles se leen para verificar, nunca para actuar.',
  tasks: [],
  errors: [],
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: report.viewport,
  deviceScaleFactor: 1,
  locale: report.locale,
  storageState: undefined,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));

const pause = ms => page.waitForTimeout(ms);
const round = value => Math.round(value * 100) / 100;
const record = (number, name, limit) => ({
  number, name, limit, actions: [], pass: false, reason: '', evidence: {},
});
const action = (task, kind, target) => task.actions.push({ kind, target, at: new Date().toISOString() });

async function visibleButton(label) {
  // El nombre accesible y el rótulo impreso deben coincidir; un botón con
  // solo aria-label o title no es una ruta que un estudiante pueda ver.
  const candidates = await page.getByRole('button', { name: label, exact: true }).all();
  for (const candidate of candidates) {
    if (await candidate.isVisible() && (await candidate.innerText()).trim() === label) return candidate;
  }
  return null;
}

async function clickButton(task, label) {
  const button = await visibleButton(label);
  if (!button) throw new Error(`No hay botón visible con el rótulo «${label}».`);
  await button.click();
  action(task, 'clic', `botón ${label}`);
}

async function largestCanvas() {
  const index = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')];
    const sizes = list.map((node, index) => ({ index, rect: node.getBoundingClientRect() }))
      .filter(item => item.rect.width > 100 && item.rect.height > 100)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    return sizes[0]?.index ?? -1;
  });
  if (index < 0) throw new Error('No apareció un lienzo visible.');
  return page.locator('canvas').nth(index);
}

async function canvasClick(task, point, label) {
  const canvas = await largestCanvas();
  const box = await canvas.boundingBox();
  if (!box || point.x < box.x + 2 || point.x > box.x + box.width - 2 ||
      point.y < box.y + 2 || point.y > box.y + box.height - 2) {
    throw new Error(`El punto ${label} salió del lienzo.`);
  }
  // No se usa locator.click(): designar por coordenadas es el gesto humano.
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  action(task, 'clic', `lienzo ${label} (${round(point.x)}, ${round(point.y)})`);
  await pause(350);
}

async function scaleBar() {
  // Regla física leída del rótulo y la línea visibles en pantalla. No se lee
  // matriz de cámara ni variable de aplicación. Por ejemplo, «2 m» sobre una
  // barra de 84 px significa 42 px/m en esa vista.
  return page.evaluate(() => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 &&
        box.left < innerWidth && box.top < innerHeight && css.display !== 'none' &&
        css.visibility !== 'hidden';
    };
    for (const label of document.querySelectorAll('span')) {
      if (!visible(label)) continue;
      const match = label.textContent?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i);
      if (!match) continue;
      const line = label.previousElementSibling;
      if (!line || !visible(line)) continue;
      const amount = Number(match[1].replace(',', '.'));
      const meters = amount * ({ mm: 0.001, cm: 0.01, m: 1 })[match[2].toLowerCase()];
      const width = line.getBoundingClientRect().width;
      if (meters > 0 && width > 10) return { label: label.textContent.trim(), widthPx: width, meters, pxPerM: width / meters };
    }
    return null;
  });
}

async function visiblePhrases(pattern, region = null) {
  // Solo texto realmente pintado en el viewport. Las cajas de selección WebGL
  // no se convierten en evidencia textual por mirar estado interno.
  return page.evaluate(({ source, region }) => {
    const test = new RegExp(source, 'i');
    const hits = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent) continue;
      // React puede separar «12.00» y « m²» en nodos de texto hermanos.
      // innerText lee la frase pintada completa, como la ve una persona.
      const phrase = parent.innerText?.replace(/\s+/g, ' ').trim() ?? '';
      if (!phrase || !test.test(phrase)) continue;
      const rect = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 ||
          rect.left >= innerWidth || rect.top >= innerHeight || style.display === 'none' ||
          style.visibility === 'hidden' || Number(style.opacity) < 0.05) continue;
      if (region) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (cx < region.left || cx > region.right || cy < region.top || cy > region.bottom) continue;
      }
      hits.add(phrase.slice(0, 180));
    }
    return [...hits];
  }, { source: pattern.source, region });
}

async function namedCount(kind) {
  const phrases = await visiblePhrases(new RegExp(`(?:\\d+\\s+${kind}s?|${kind}s?\\s*[:·-]?\\s*\\d+)`, 'i'));
  for (const phrase of phrases) {
    const a = phrase.match(new RegExp(`(\\d+)\\s+${kind}s?`, 'i'));
    const b = phrase.match(new RegExp(`${kind}s?\\s*[:·-]?\\s*(\\d+)`, 'i'));
    if (a || b) return { value: Number((a ?? b)[1]), phrase };
  }
  return null;
}

async function canvasPixels() {
  return (await largestCanvas()).screenshot({ animations: 'disabled' });
}

async function changedPixels(before, after) {
  const a = await sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return null;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 3) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) >= 30) changed++;
  }
  return changed;
}

async function capture(task) {
  const file = `${task.number}-${task.pass ? 'pass' : 'fail'}.png`;
  await page.screenshot({ path: path.join(out, file), animations: 'disabled', fullPage: false });
  task.screenshot = file;
  task.actionCount = task.actions.length;
  if (task.actionCount > task.limit) {
    task.pass = false;
    task.reason = `Necesitó ${task.actionCount} acciones; límite ${task.limit}.`;
  }
  report.tasks.push(task);
  console.log(`${task.pass ? 'PASS' : 'FAIL'} ${task.number}. ${task.name} · ${task.actionCount}/${task.limit} acciones · ${task.reason || 'evidencia suficiente'}`);
}

try {
  const response = await page.goto(report.url, { waitUntil: 'networkidle', timeout: 90_000 });
  report.httpStatus = response?.status() ?? null;
  await (await largestCanvas()).waitFor({ state: 'visible', timeout: 60_000 });
  await pause(3_000);
  await page.evaluate(() => document.fonts.ready);
  // Si la futura pantalla de bienvenida se abre, el demo debe pasar a «En
  // blanco» por sí solo a los cinco segundos. El robot no elige una plantilla.
  if ((await visiblePhrases(/¿Qué vas a dibujar\?/i)).length) await pause(5_500);
  report.initialScreenshot = 'inicio.png';
  await page.screenshot({ path: path.join(out, report.initialScreenshot), animations: 'disabled' });

  const canvas = await largestCanvas();
  const box = await canvas.boundingBox();
  const scale = await scaleBar();
  report.scale = scale;
  if (!box || !scale) throw new Error('No se pudo medir la regla visible o el lienzo.');
  const width = 4 * scale.pxPerM;
  const height = 3 * scale.pxPerM;
  const x = box.x + Math.min(190, Math.max(35, (box.width - width) / 6));
  const y = box.y + Math.min(210, Math.max(45, (box.height - height) / 3));
  const corners = [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height },
    { x, y: y + height }, { x, y },
  ];
  report.roomScreenGeometry = { corners, expectedMeters: { width: 4, height: 3 } };
  const roomRegion = { left: x, right: x + width, top: y, bottom: y + height };
  const dimensionRegion = { left: x - 20, right: x + width + 20, top: y - 90, bottom: y + height + 20 };

  // 1. Cuarto de 3 × 4 m. El retorno a la primera esquina cierra la cadena.
  {
    const task = record(1, 'Cuarto de 3 × 4 m con área visible', 8);
    try {
      const before = await visiblePhrases(/m²|m2/i, roomRegion);
      const pixelsBefore = await canvasPixels();
      task.evidence.areaBefore = before;
      await clickButton(task, 'Muro');
      for (let i = 0; i < corners.length; i++) await canvasClick(task, corners[i], `esquina ${i + 1}`);
      await page.keyboard.press('Enter');
      action(task, 'tecla', 'Enter');
      await pause(1_000);
      const after = await visiblePhrases(/m²|m2/i, roomRegion);
      task.evidence.areaAfter = after;
      task.evidence.wallPixelChange = await changedPixels(pixelsBefore, await canvasPixels());
      const added = after.filter(phrase => !before.includes(phrase));
      const area = added.map(phrase => phrase.match(/(\d+(?:[.,]\d+)?)\s*m(?:²|2)/i))
        .filter(Boolean).map(match => Number(match[1].replace(',', '.')))
        .find(value => value >= 11.5 && value <= 12.5);
      task.evidence.newRoomAreaM2 = area ?? null;
      task.pass = area !== undefined;
      task.reason = task.pass ? '' : `El dibujo cambió ${task.evidence.wallPixelChange ?? 'sin medida'} píxeles, pero no apareció un rótulo nuevo de 11.5–12.5 m².`;
    } catch (error) { task.reason = error.message; }
    await capture(task);
  }

  // 2. Puerta y ventana: exige incremento de conteos visibles Y píxeles.
  {
    const task = record(2, 'Puerta y ventana en los muros', 4);
    try {
      const doorBefore = await namedCount('puerta');
      const windowBefore = await namedCount('ventana');
      const pixelsBefore = await canvasPixels();
      await clickButton(task, 'Puerta');
      await canvasClick(task, { x: x + width / 2, y }, 'centro del muro largo');
      const doorAfter = await namedCount('puerta');
      const pixelsDoor = await canvasPixels();
      await clickButton(task, 'Ventana');
      await canvasClick(task, { x: x + width, y: y + height / 2 }, 'centro del muro corto');
      const windowAfter = await namedCount('ventana');
      const pixelsWindow = await canvasPixels();
      const doorPixelChange = await changedPixels(pixelsBefore, pixelsDoor);
      const windowPixelChange = await changedPixels(pixelsDoor, pixelsWindow);
      task.evidence = { doorBefore, doorAfter, windowBefore, windowAfter, doorPixelChange, windowPixelChange };
      task.pass = doorBefore !== null && doorAfter !== null && doorAfter.value === doorBefore.value + 1 &&
        windowBefore !== null && windowAfter !== null && windowAfter.value === windowBefore.value + 1 &&
        doorPixelChange !== null && doorPixelChange > 50 && windowPixelChange !== null && windowPixelChange > 50;
      task.reason = task.pass ? '' :
        doorBefore === null || windowBefore === null || doorAfter === null || windowAfter === null
          ? 'Cambió el lienzo, pero faltan conteos visibles de puerta y ventana para acreditar +1/+1.'
          : 'No se probaron ambos incrementos +1/+1 y ambos cambios de píxeles.';
    } catch (error) { task.reason = error.message; }
    await capture(task);
  }

  // 3. Acotación. La medida debe poder leerse como texto visible.
  {
    const task = record(3, 'Cota de 4.00 m en el muro largo', 4);
    try {
      const before = await visiblePhrases(/4[.,]00\s*m|4[.,]?000\s*mm/i, dimensionRegion);
      const pixelsBefore = await canvasPixels();
      await clickButton(task, 'Cota');
      await canvasClick(task, corners[0], 'primer extremo del muro largo');
      await canvasClick(task, corners[1], 'segundo extremo del muro largo');
      await canvasClick(task, { x: x + width / 2, y: y - 30 }, 'posición de la cota');
      const after = await visiblePhrases(/4[.,]00\s*m|4[.,]?000\s*mm/i, dimensionRegion);
      const pixelChange = await changedPixels(pixelsBefore, await canvasPixels());
      task.evidence = { before, after, pixelChange };
      task.pass = after.some(phrase => !before.includes(phrase)) && pixelChange !== null && pixelChange > 50;
      task.reason = task.pass ? '' : pixelChange !== null && pixelChange > 50
        ? 'La cota cambió el lienzo, pero no se leyó 4.00 m/4000 mm en texto visible.'
        : 'No apareció una cota nueva legible de 4.00 m/4000 mm con cambio de píxeles.';
    } catch (error) { task.reason = error.message; }
    await capture(task);
  }

  // 4. Entrega por enlace. El URL sale del texto visible o del portapapeles
  // que el botón «Copiar enlace» acaba de escribir, igual que al pegarlo.
  {
    const task = record(4, 'Enlace móvil con plano y m²', 3);
    try {
      await clickButton(task, 'Compartir');
      await clickButton(task, 'Copiar enlace');
      let url = await page.evaluate(() => {
        const candidates = [...document.querySelectorAll('a[href], code')];
        for (const node of candidates) {
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) continue;
          const value = node.tagName === 'A' ? node.href : node.textContent?.trim();
          if (/^https?:\/\/.+\/revision(?:[#?]|$)/i.test(value ?? '')) return value;
        }
        return null;
      });
      let urlSource = 'texto visible';
      if (!url) {
        url = await page.evaluate(async () => navigator.clipboard.readText().catch(() => null));
        urlSource = 'portapapeles del botón';
      }
      if (!url || !/^https?:\/\/.+\/revision(?:[#?]|$)/i.test(url)) throw new Error('El botón no entregó un enlace de revisión visible ni copiado.');
      task.evidence.urlSource = urlSource;
      // El token del fragmento no se escribe en el JSON: el enlace concede
      // acceso y la evidencia pública no debe filtrar esa capacidad.
      task.evidence.urlPath = new URL(url).pathname;
      action(task, 'abrir', 'enlace en celular nuevo');
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX', deviceScaleFactor: 1 });
      try {
        const guest = await mobile.newPage();
        const response = await guest.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
        await guest.waitForTimeout(1_000);
        const inspected = await guest.evaluate(() => {
          const plan = [...document.querySelectorAll('svg')].find(svg => /plano/i.test(svg.getAttribute('aria-label') ?? ''));
          const rect = plan?.getBoundingClientRect();
          const planVisible = !!rect && rect.width > 100 && rect.height > 100 &&
            plan.querySelectorAll('path').length > 0;
          let areaVisible = null;
          if (rect) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
              const area = text.match(/\d+(?:[.,]\d+)?\s*m(?:²|2)/i);
              const parent = walker.currentNode.parentElement;
              if (!area || !parent) continue;
              const label = parent.getBoundingClientRect();
              const centerX = label.left + label.width / 2;
              const centerY = label.top + label.height / 2;
              if (label.width > 0 && label.height > 0 && centerX >= rect.left && centerX <= rect.right &&
                  centerY >= rect.top && centerY <= rect.bottom && getComputedStyle(parent).visibility !== 'hidden') {
                areaVisible = area[0];
                break;
              }
            }
          }
          return { planVisible, strokes: plan?.querySelectorAll('path').length ?? 0,
            areaVisible, scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth };
        });
        task.evidence.mobile = { httpStatus: response?.status() ?? null, ...inspected };
        task.pass = response?.status() === 200 && inspected.planVisible && !!inspected.areaVisible &&
          inspected.scrollWidth === inspected.clientWidth;
        task.reason = task.pass ? '' : 'En el celular no quedaron visibles el plano y los m², o hay scroll horizontal.';
        task.mobileScreenshot = '4-celular.png';
        await guest.screenshot({ path: path.join(out, task.mobileScreenshot), animations: 'disabled', fullPage: false });
      } finally { await mobile.close(); }
    } catch (error) { task.reason = error.message; }
    await capture(task);
  }
} catch (error) {
  report.errors.push(`Preparación: ${error.message}`);
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.tasks.length === 4 && report.tasks.every(task => task.pass);
  await writeFile(path.join(out, 'tareas.json'), JSON.stringify(report, null, 2) + '\n');
  console.table(report.tasks.map(task => ({ tarea: task.number, resultado: task.pass ? 'PASS' : 'FAIL', acciones: `${task.actionCount}/${task.limit}`, atasco: task.reason })));
  await context.close();
  await browser.close();
}
if (!report.passed) process.exitCode = 1;
