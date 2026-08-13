// Pruebas de la normalización, que es lo que decide la identidad de cada venta.
// No tocan Firebase ni necesitan credenciales: se cargan las funciones reales de
// api/_lib.js (el require de firebase-admin es lazy justamente para esto).
//
//   node test/local.js
const L = require('../api/_lib');

let ok = 0, fail = 0;
function eq(actual, esperado, titulo) {
  const bien = JSON.stringify(actual) === JSON.stringify(esperado);
  bien ? ok++ : fail++;
  console.log((bien ? '  ok   ' : '  FALLA') + '  ' + titulo +
    (bien ? '' : '\n           esperaba ' + JSON.stringify(esperado) + ' y dio ' + JSON.stringify(actual)));
}

console.log('\nTELÉFONO — el mismo cliente escrito de varias formas da la misma clave');
eq(L.normTelefono('3001112233'), '3001112233', 'tal cual');
eq(L.normTelefono('+57 300 111 2233'), '3001112233', 'con indicativo y espacios');
eq(L.normTelefono('57-3001112233'), '3001112233', 'con indicativo y guion');
eq(L.normTelefono('(300) 111-2233'), '3001112233', 'con paréntesis');
eq(L.normTelefono('  3001112233  '), '3001112233', 'con espacios alrededor');
eq(L.normTelefono(''), '', 'vacío');
eq(L.normTelefono(null), '', 'null');

console.log('\nFECHA — formatos que puede mandar el bot');
eq(L.normFecha('2026-08-13'), '20260813', 'ISO');
eq(L.normFecha('2026-08-13 09:12:00'), '20260813', 'ISO con hora');
eq(L.normFecha('2026-8-3'), '20260803', 'ISO sin ceros');
eq(L.normFecha('13/08/2026'), '20260813', 'dd/mm/aaaa');
eq(L.normFecha('3-8-2026'), '20260803', 'd-m-aaaa');
eq(L.normFecha('nada'), '', 'texto inválido');
eq(L.normFecha(''), '', 'vacío');

console.log('\nCLAVE — misma venta escrita distinto tiene que colisionar (así se detecta el duplicado)');
const a = L.claveVenta('+57 300 111 2233', '2026-08-13');
const b = L.claveVenta('3001112233', '13/08/2026');
eq(a, '3001112233_20260813', 'formato A');
eq(b, '3001112233_20260813', 'formato B');
eq(a === b, true, 'A y B son la MISMA clave');
eq(L.claveVenta('3001112233', 'nada'), '', 'sin fecha válida no hay clave');
eq(L.claveVenta('', '2026-08-13'), '', 'sin teléfono no hay clave');

console.log('\nCLAVE — ventas distintas NO deben colisionar');
eq(L.claveVenta('3001112233', '2026-08-13') !== L.claveVenta('3009998877', '2026-08-13'), true, 'otro cliente, mismo día');
eq(L.claveVenta('3001112233', '2026-08-13') !== L.claveVenta('3001112233', '2026-08-14'), true, 'mismo cliente, otro día');

console.log('\nMES — sale de la fecha de compra');
eq(L.mesDe('2026-08-13'), '2026-08', 'ISO');
eq(L.mesDe('13/08/2026'), '2026-08', 'dd/mm/aaaa');
eq(L.mesDe('01/01/2027'), '2027-01', 'cambio de año');
eq(L.mesDe('nada'), '', 'inválida');

console.log('\nVALOR — el total, venga como venga');
eq(L.aNumero(89000), 89000, 'número');
eq(L.aNumero('89000'), 89000, 'texto');
eq(L.aNumero('89.000'), 89000, 'con puntos de miles');
eq(L.aNumero('$ 89.000'), 89000, 'con símbolo');
eq(L.aNumero('178,000'), 178000, 'con comas');
eq(L.aNumero(''), 0, 'vacío');
eq(L.aNumero('abc'), 0, 'no numérico');

console.log('\nCLAVE DE FIREBASE — sin caracteres prohibidos');
eq(L.fbKey('WS/3D.001'), 'WS_3D_001', 'barra y punto');
eq(L.fbKey('a#b$c[d]e'), 'a_b_c_d_e', 'todos los prohibidos');

console.log('\n' + (fail ? 'FALLARON ' + fail + ' de ' + (ok + fail) : 'Pasaron las ' + ok) + '\n');
process.exit(fail ? 1 : 0);
