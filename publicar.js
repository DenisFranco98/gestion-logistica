#!/usr/bin/env node
// Sube la versión de los assets en los HTML y deja version.json igual.
//
// Los dos tienen que ir juntos SIEMPRE: el navegador compara version.json con
// el ?v= que realmente cargó, y si version.json queda atrasado la app no se
// entera de que hay algo nuevo; si queda adelantado, recarga de más.
//
//   node publicar.js            → sube a la letra siguiente (…e → …f)
//   node publicar.js 20260808a  → fija una versión concreta
//   node publicar.js --ver      → solo muestra en qué versión está
const fs = require('fs');
const HTML = ['index.html','gestion-logistica.html','gestiones-diarias.html','control-financiero.html',
              // Página del enlace del correo (restablecer contraseña). No es un
              // módulo, pero carga shared.css y también tiene que versionarse.
              'cuenta.html'];

function actual(){
  const m = fs.readFileSync('index.html','utf8').match(/\?v=([0-9a-z]+)/);
  return m ? m[1] : null;
}

function siguiente(v){
  const m = v.match(/^(\d{8})([a-z]*)$/);
  const hoy = new Date();
  const fecha = hoy.getFullYear()+String(hoy.getMonth()+1).padStart(2,'0')+String(hoy.getDate()).padStart(2,'0');
  if(!m) return fecha+'a';
  // Día nuevo: se arranca de nuevo en 'a'. Mismo día: siguiente letra.
  if(m[1]!==fecha) return fecha+'a';
  const l = m[2]||'a';
  const ult = l.charCodeAt(l.length-1);
  return fecha + (ult<122 ? l.slice(0,-1)+String.fromCharCode(ult+1) : l+'a');
}

const arg = process.argv[2];
const vieja = actual();
if(!vieja){ console.error('No se encontró ningún ?v= en index.html'); process.exit(1); }
if(arg==='--ver'){ console.log(vieja); process.exit(0); }

const nueva = arg || siguiente(vieja);
if(nueva===vieja){ console.error('La versión nueva es igual a la actual ('+vieja+')'); process.exit(1); }

let tocados = 0;
HTML.forEach(f=>{
  if(!fs.existsSync(f)) return;
  const s = fs.readFileSync(f,'utf8');
  const n = s.split('?v='+vieja).join('?v='+nueva);
  if(n!==s){ fs.writeFileSync(f,n); tocados++; }
});
fs.writeFileSync('version.json', JSON.stringify({v:nueva}, null, 2)+'\n');

console.log(vieja+' → '+nueva);
console.log('  HTML actualizados: '+tocados);
console.log('  version.json escrito');
console.log('\nFalta: git add -A && git commit && git push');
