/**
 * Lanzador de jest con soporte de módulos ESM en el VM (mismo arnés que el
 * monorepo origen). Resuelve jest desde el árbol hoisted del workspace (no
 * vive en apps/api/node_modules).
 */
if (!process.execArgv.includes('--experimental-vm-modules')) {
  process.env.NODE_OPTIONS = [
    process.env.NODE_OPTIONS ?? '',
    '--experimental-vm-modules',
  ]
    .join(' ')
    .trim();
}
require('jest/bin/jest');
