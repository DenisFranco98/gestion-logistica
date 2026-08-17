// Despliega el sitio a Firebase Hosting desde una copia limpia FUERA de OneDrive.
//
// POR QUÉ NO SE DESPLIEGA DIRECTO DESDE EL REPO: el proyecto vive dentro de
// OneDrive con "Archivos a Petición", así que cada archivo y cada carpeta es un
// reparse point (8.571 de ellos). El CLI de Firebase hace stat sobre eso, cree
// que una carpeta es un archivo y muere con "EISDIR: illegal operation on a
// directory, read" — sin decir cuál. Copiar a una carpeta normal lo resuelve.
//
//   node desplegar-firebase.js            → despliega
//   node desplegar-firebase.js --solo-copiar   → prepara la copia y no sube nada
//
// Lo que se sube es lo mismo que publica GitHub Pages hoy, menos functions/ (es
// código de servidor, y ahí vive reglas-firebase.json, que describe los permisos
// de toda la base), los .zip, el CNAME y las herramientas de consola.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const PROYECTO = 'gestion-logistica-86fd7';
const DESTINO = path.join(os.tmpdir(), 'redking-deploy');

// Nombres de primer nivel que NO se suben.
const EXCLUIR = new Set([
  '.git', '.github', '.claude', '.firebaserc', '.gitignore',
  'functions', 'node_modules',
  'firebase.json', 'desplegar-firebase.js', 'publicar.js',
  'CNAME', 'README.md',
]);
const EXCLUIR_EXT = new Set(['.zip', '.log', '.md']);

function copiar(desde, hacia, esRaiz) {
  fs.mkdirSync(hacia, { recursive: true });
  for (const entrada of fs.readdirSync(desde, { withFileTypes: true })) {
    const nombre = entrada.name;
    if (esRaiz && EXCLUIR.has(nombre)) continue;
    if (nombre.startsWith('.')) continue;
    if (EXCLUIR_EXT.has(path.extname(nombre).toLowerCase())) continue;

    const origen = path.join(desde, nombre);
    const meta = fs.statSync(origen);   // statSync sigue el reparse point y dice la verdad
    if (meta.isDirectory()) copiar(origen, path.join(hacia, nombre), false);
    else fs.copyFileSync(origen, path.join(hacia, nombre));
  }
}

// La copia se rehace entera cada vez: si no, un archivo borrado del repo seguiría
// publicándose para siempre.
fs.rmSync(DESTINO, { recursive: true, force: true });
copiar(REPO, DESTINO, true);

// El firebase.json de la copia es mínimo a propósito: acá ya no hay nada que
// ignorar porque solo se copió lo que va. cleanUrls replica /gestion-logistica ->
// .html de GitHub Pages, y el rewrite es lo que hace falta para que history
// .pushState sobreviva a un F5.
fs.writeFileSync(path.join(DESTINO, 'firebase.json'), JSON.stringify({
  hosting: {
    public: '.',
    cleanUrls: true,
    ignore: ['firebase.json'],
    rewrites: [{ source: '**', destination: '/index.html' }],
  },
}, null, 2) + '\n');

const cuenta = (function contar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? contar(path.join(dir, e.name)) : 1), 0);
})(DESTINO);
console.log('copiados ' + cuenta + ' archivos a ' + DESTINO);

if (process.argv.includes('--solo-copiar')) process.exit(0);

// shell:true es obligatorio en Windows — desde Node 24, spawn se niega a ejecutar
// un .cmd directamente (EINVAL) por el agujero de inyección de argumentos en cmd.
// Acá no hay riesgo: los argumentos son constantes de este archivo, no entran de
// afuera. Si algún día salen de la línea de comandos, hay que escaparlos.
execFileSync(
  process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
  ['deploy', '--only', 'hosting', '--project', PROYECTO, '--non-interactive'],
  { cwd: DESTINO, stdio: 'inherit', shell: process.platform === 'win32' }
);
