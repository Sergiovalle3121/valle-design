import { execSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

function packagePaths(component) {
  return (component.properties ?? [])
    .filter((item) => item.name === "cdx:npm:package:path")
    .map((item) => item.value);
}

/**
 * npm sbom --omit dev currently loses runtime dependencies from workspaces.
 * Select from npm's FULL SBOM using the actual `npm ls --omit=dev` tree, and
 * cross-check that tree against every installed non-dev entry in the lockfile.
 * An optional native package can be marked dev in the lockfile yet still be
 * reached at runtime; npm ls is authoritative for those installed packages.
 */
export function buildProductionSbom(
  fullSbom,
  productionPaths,
  installedLockPaths,
  installedVersions = new Map(),
) {
  if (
    fullSbom.bomFormat !== "CycloneDX" ||
    !Array.isArray(fullSbom.components)
  ) {
    throw new Error(
      "El SBOM completo no es un CycloneDX válido con componentes.",
    );
  }
  const rootRef = fullSbom.metadata?.component?.["bom-ref"];
  if (!rootRef || !productionPaths.has("")) {
    throw new Error("Falta la raíz del repositorio en el SBOM o en npm ls.");
  }

  for (const path of installedLockPaths) {
    if (!productionPaths.has(path)) {
      throw new Error(
        `${path} está instalado como runtime en el lockfile, pero no aparece en npm ls.`,
      );
    }
  }

  const componentsByPath = new Map();
  for (const part of fullSbom.components) {
    const paths = packagePaths(part);
    if (!paths.length) {
      throw new Error(
        `Componente ${part["bom-ref"] ?? part.name} sin ruta npm en SBOM completo.`,
      );
    }
    for (const path of paths) {
      if (componentsByPath.has(path))
        throw new Error(`Ruta duplicada en SBOM completo: ${path}`);
      componentsByPath.set(path, part);
    }
  }

  for (const path of productionPaths) {
    if (path !== "" && !componentsByPath.has(path)) {
      throw new Error(`${path} está en npm ls pero no aparece en el SBOM.`);
    }
    if (
      path !== "" &&
      installedVersions.has(path) &&
      componentsByPath.get(path).version !== installedVersions.get(path)
    ) {
      throw new Error(
        `${path} tiene versión diferente entre el SBOM y el paquete instalado.`,
      );
    }
  }

  // npm uses name@version as bom-ref even for two installed copies or aliases.
  // Fold those copies into one component with all physical paths. Keeping two
  // equal bom-refs would make an invalid CycloneDX document.
  const groups = new Map();
  for (const part of fullSbom.components) {
    const selectedPaths = packagePaths(part).filter((path) =>
      productionPaths.has(path),
    );
    if (!selectedPaths.length) continue;
    const ref = part["bom-ref"];
    if (!ref || ref === rootRef)
      throw new Error(`bom-ref duplicado con la raíz o ausente: ${ref}`);
    const prior = groups.get(ref);
    if (!prior) {
      groups.set(ref, {
        ...part,
        properties: [
          ...(part.properties ?? []).filter(
            (property) =>
              property.name !== "cdx:npm:package:path" &&
              property.name !== "cdx:npm:package:development",
          ),
          ...selectedPaths.map((path) => ({
            name: "cdx:npm:package:path",
            value: path,
          })),
        ],
      });
      continue;
    }
    if (
      prior.version !== part.version ||
      prior.purl !== part.purl ||
      JSON.stringify(prior.licenses ?? []) !==
        JSON.stringify(part.licenses ?? [])
    ) {
      throw new Error(
        `Copias con bom-ref ${ref} difieren en identidad o licencia.`,
      );
    }
    if (prior.name !== part.name) {
      prior.properties.push({
        name: "cdx:npm:package:alias",
        value: part.name,
      });
    }
    prior.properties.push(
      ...selectedPaths.map((path) => ({
        name: "cdx:npm:package:path",
        value: path,
      })),
    );
  }
  const components = [...groups.values()];
  const refs = new Set([rootRef, ...groups.keys()]);
  const dependencyGroups = new Map();
  for (const item of fullSbom.dependencies ?? []) {
    if (!refs.has(item.ref)) continue;
    const group = dependencyGroups.get(item.ref) ?? new Set();
    for (const ref of item.dependsOn ?? []) if (refs.has(ref)) group.add(ref);
    dependencyGroups.set(item.ref, group);
  }
  const dependencies = [...dependencyGroups].map(([ref, dependsOn]) => ({
    ref,
    dependsOn: [...dependsOn],
  }));
  const dependencyRefs = new Set(dependencies.map((item) => item.ref));
  for (const ref of refs) {
    if (!dependencyRefs.has(ref))
      throw new Error(`Falta la lista de dependencias de ${ref}.`);
  }

  return { ...fullSbom, components, dependencies };
}

/** npm can repeat the same name@version bom-ref for aliases and nested copies. */
export function normalizeFullSbom(fullSbom) {
  const paths = new Set([""]);
  for (const part of fullSbom.components ?? []) {
    for (const path of packagePaths(part)) paths.add(path);
  }
  return buildProductionSbom(fullSbom, paths, new Set());
}

export function productionInventory(repoRoot) {
  const root = resolve(repoRoot);
  const output = execSync("npm ls --omit=dev --all --parseable", {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  const productionPaths = new Set();
  const installedVersions = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const real = realpathSync(line.trim());
    const path = relative(root, real).replaceAll("\\", "/");
    if (path === ".." || path.startsWith("../")) {
      throw new Error(`npm ls apuntó fuera del repositorio: ${line}`);
    }
    productionPaths.add(path);
    if (path) {
      installedVersions.set(
        path,
        JSON.parse(readFileSync(join(real, "package.json"), "utf8")).version,
      );
    }
  }

  const lock = JSON.parse(
    readFileSync(join(root, "package-lock.json"), "utf8"),
  );
  if (lock.lockfileVersion !== 3 || !lock.packages) {
    throw new Error(
      "Se requiere package-lock.json v3 para comprobar cobertura.",
    );
  }
  const installedLockPaths = new Set();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.includes("node_modules/") || entry.link || entry.dev === true)
      continue;
    if (existsSync(join(root, path, "package.json")))
      installedLockPaths.add(path);
  }
  return { productionPaths, installedLockPaths, installedVersions };
}

export function assertExactProductionSbom(sbom, inventory) {
  const selected = buildProductionSbom(
    sbom,
    inventory.productionPaths,
    inventory.installedLockPaths,
    inventory.installedVersions,
  );
  if (selected.components.length !== sbom.components.length) {
    throw new Error(
      `SBOM de producción incluye ${sbom.components.length - selected.components.length} componentes ajenos al árbol runtime.`,
    );
  }
  if (selected.dependencies.length !== sbom.dependencies?.length) {
    throw new Error(
      "SBOM de producción incluye referencias de dependencias ajenas al árbol runtime.",
    );
  }
  for (let index = 0; index < selected.dependencies.length; index++) {
    if (
      selected.dependencies[index].dependsOn.length !==
      sbom.dependencies[index].dependsOn.length
    ) {
      throw new Error(
        `Dependencias ajenas al árbol runtime en ${sbom.dependencies[index].ref}.`,
      );
    }
  }
  return selected.components.length;
}
