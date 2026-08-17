// Quita los comentarios del archivo de reglas y deja JSON estricto, que es lo
// que acepta el editor de la consola de Firebase sin protestar.
const fs = require('fs');

const ENTRADA = process.argv[2];
const SALIDA  = process.argv[3];

const crudo = fs.readFileSync(ENTRADA, 'utf8');

// Se quitan solo las líneas que son comentario completo. Ninguna regla de este
// archivo contiene "//" dentro de una cadena, así que no hay riesgo de recortar
// una expresión por la mitad — pero se verifica igual más abajo con JSON.parse.
const sinComentarios = crudo
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n');

const objeto = JSON.parse(sinComentarios);   // revienta si quedó algo mal
const bonito = JSON.stringify(objeto, null, 2) + '\n';

// Segunda pasada: lo que se va a escribir tiene que volver a parsear igual.
if (JSON.stringify(JSON.parse(bonito)) !== JSON.stringify(objeto)) {
  console.error('La versión formateada no coincide con el original');
  process.exit(1);
}

fs.writeFileSync(SALIDA, bonito, 'utf8');

const nodos = Object.keys(objeto.rules);
console.log('JSON ESTRICTO OK');
console.log('nodos: ' + nodos.length);
console.log('lineas: ' + bonito.split('\n').length);
console.log('sin comentarios: ' + !/\/\//.test(bonito));
console.log('cerrados: ' + nodos.filter(n => JSON.stringify(objeto.rules[n]) !== '{".read":"auth != null",".write":"auth != null"}').join(', '));
