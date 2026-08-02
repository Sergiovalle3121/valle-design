const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const root=join(__dirname,'..','src'); const violations=[];
function walk(dir){ for(const name of readdirSync(dir)){ const path=join(dir,name); const s=statSync(path); if(s.isDirectory()) walk(path); else if(name.endsWith('.module.ts')) { const source=readFileSync(path,'utf8'); if(/PlatformEntitlementClient/.test(source)) violations.push(path); } } }
walk(root); if(violations.length){ console.error('PlatformEntitlementClient no puede registrarse en módulos productivos:\n'+violations.join('\n')); process.exit(1) } console.log('Gate OK: ningún módulo productivo registra PlatformEntitlementClient.');
