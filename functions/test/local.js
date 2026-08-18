// Pruebas de la normalización, que es lo que decide la identidad de cada venta.
// No tocan Firebase ni necesitan credenciales: se cargan las funciones reales de
// api/_lib.js (el require de firebase-admin es lazy justamente para esto).
//
//   node test/local.js
const L = require('../lib');

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

console.log('\nVALOR — el punto de miles que JSON lee como decimal');
// Casos reales: el bot manda el importe sin comillas y "99.990" llega como 99,99.
eq(L.aNumero(99.99), 99990, 'el bot mandó 99.990 sin comillas');
eq(L.aNumero(69.9), 69900, 'el bot mandó 69.900 sin comillas');
eq(L.aNumero(111.984), 111984, 'el bot mandó 111.984 sin comillas');
eq(L.aNumero(117), 117000, 'el bot mandó 117.000 sin comillas');
eq(L.aNumero(157477.5), 157478, 'decimal por encima del umbral: se respeta');
eq(L.aNumero(99990), 99990, 'sin punto ya venía bien');

console.log('\nVALOR — importes CON CÉNTIMOS (el que llegó a producción como millones)');
// El bot manda unas veces "69.990" y otras "69.990,00". Quedarse con los dígitos a
// secas convertía el segundo en 6.999.000: el error es exactamente ×100 y en una
// tabla larga no salta a la vista. Lo que decide es cuántos dígitos hay después
// del último separador: 1 o 2 son céntimos, 3 son miles.
eq(L.aNumero('69.990,00'), 69990, '"69.990,00" (el caso real) NO son 6.999.000');
eq(L.aNumero('79.990,00'), 79990, '"79.990,00" tampoco');
eq(L.aNumero('69990.00'), 69990, 'con punto decimal y sin miles');
eq(L.aNumero('69990,5'), 69990, 'un solo decimal');
eq(L.aNumero('1.234.567,89'), 1234567, 'miles y céntimos juntos');
eq(L.aNumero('69,990.00'), 69990, 'formato inglés: 69,990.00');
eq(L.aNumero('$ 69.990,00'), 69990, 'con símbolo y céntimos');
// Y lo de siempre tiene que seguir funcionando igual.
eq(L.aNumero('69.990'), 69990, 'sin céntimos sigue siendo miles');
eq(L.aNumero('1.234.567'), 1234567, 'tres grupos de miles');
eq(L.aNumero('178,000'), 178000, 'coma de miles con 3 dígitos');

console.log('\nCANTIDAD — NO se le aplica la corrección de miles');
eq(L.aEntero(2), 2, 'dos unidades siguen siendo dos');
eq(L.aEntero(1), 1, 'una');
eq(L.aEntero('3'), 3, 'como texto');
eq(L.aEntero(''), 0, 'vacía');
eq(L.aNumero(2) !== L.aEntero(2), true, 'valor y cantidad se tratan distinto a propósito');

console.log('\nCLAVE DE FIREBASE — sin caracteres prohibidos');
eq(L.fbKey('WS/3D.001'), 'WS_3D_001', 'barra y punto');
eq(L.fbKey('a#b$c[d]e'), 'a_b_c_d_e', 'todos los prohibidos');

console.log('\n' + (fail ? 'FALLARON ' + fail + ' de ' + (ok + fail) : 'Pasaron las ' + ok) + '\n');
process.exit(fail ? 1 : 0);
