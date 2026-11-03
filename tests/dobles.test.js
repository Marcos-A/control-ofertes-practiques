'use strict';

// Fidelitat dels dobles respecte de Google Sheets (TODO.md, secció 2.3).
// Si alguna d'aquestes proves falla, les altres poden donar falsos positius.

const test = require('node:test');
const assert = require('node:assert/strict');

const { Comptador, FakeSpreadsheet, FakeDataValidationBuilder } = require('./harness/sheets-fake');
const { Escenari } = require('./harness/escenari');

function nouFull(files = 10, columnes = 5) {
  const comptador = new Comptador();
  const spreadsheet = new FakeSpreadsheet('id', 'Prova', comptador);
  return { full: spreadsheet._afegirFull('Full', files, columnes), comptador, spreadsheet };
}

test('getValues retorna \'\' per a cel·les buides i conserva nombres i dates', () => {
  const { full } = nouFull();
  const data = new Date(2026, 8, 1);
  full.getRange(1, 1, 1, 3).setValues([[5, data, '']]);

  const [[nombre, dataLlegida, buit]] = full.getRange(1, 1, 1, 3).getValues();
  assert.equal(nombre, 5);
  assert.ok(dataLlegida instanceof Date);
  assert.equal(dataLlegida.getTime(), data.getTime());
  assert.notEqual(dataLlegida, data, 'ha de retornar una còpia');
  assert.equal(buit, '');
  assert.equal(full.getRange(9, 5).getValue(), '');
});

test('getDisplayValues retorna cadenes', () => {
  const { full } = nouFull();
  full.getRange(1, 1, 1, 2).setValues([[5, new Date(2026, 8, 1)]]);
  assert.deepEqual(full.getRange(1, 1, 1, 3).getDisplayValues(), [['5', '01/09/2026', '']]);
});

test('setValue interpreta les cadenes numèriques com fa Sheets', () => {
  const { full } = nouFull();
  full.getRange(1, 1).setValue('5');
  full.getRange(1, 2).setValue('propi');
  assert.equal(full.getRange(1, 1).getValue(), 5);
  assert.equal(full.getRange(1, 2).getValue(), 'propi');
});

test('setValue perd els zeros inicials i el signe +, i l\'apòstrof força el text', () => {
  const { full } = nouFull();
  full.getRange(1, 1).setValue('0034930000001');
  full.getRange(1, 2).setValue('+34930000001');
  full.getRange(1, 3).setValue('\'0034930000001');
  full.getRange(1, 4).setValue('\'=SUMA(1;2)');
  full.getRange(2, 1, 1, 2).setValues([['\'+34930000001', '\'5']]);

  assert.deepEqual(full.getRange(1, 1, 1, 4).getValues(), [[34930000001, 34930000001, '0034930000001', '=SUMA(1;2)']]);
  assert.equal(full.getRange(1, 4).getFormula(), '');
  assert.deepEqual(full.getRange(2, 1, 1, 2).getValues(), [['+34930000001', '5']]);
});

test('getLastRow i getLastColumn ignoren el final buit, però compten les fórmules', () => {
  const { full } = nouFull(10, 5);
  assert.equal(full.getLastRow(), 0);
  full.getRange(3, 2).setValue('x');
  assert.equal(full.getLastRow(), 3);
  assert.equal(full.getLastColumn(), 2);
  full.getRange(7, 4).setFormulaR1C1('=R[0]C[-1]');
  assert.equal(full.getLastRow(), 7);
  assert.equal(full.getLastColumn(), 4);
  assert.equal(full.getRange(7, 4).getValue(), '');
  assert.equal(full.getMaxRows(), 10);
  assert.equal(full.getMaxColumns(), 5);
});

test('els rangs fora de la graella llancen un error', () => {
  const { full } = nouFull(10, 5);
  assert.throws(() => full.getRange(10, 1, 2, 1), /outside the dimensions/);
  assert.throws(() => full.getRange(1, 6), /outside the dimensions/);
  assert.throws(() => full.getRange(2, 1, 0, 1), /at least 1/);
});

test('inserir i eliminar files desplacen les dades', () => {
  const { full } = nouFull(10, 2);
  full.getRange(2, 1, 3, 1).setValues([['a'], ['b'], ['c']]);

  full.insertRowsAfter(2, 2);
  assert.equal(full.getMaxRows(), 12);
  assert.deepEqual(full._fila(5, 1), ['b']);

  full.deleteRows(3, 2);
  full.deleteRow(2);
  assert.equal(full.getMaxRows(), 9);
  assert.deepEqual(full.getRange(2, 1, 2, 1).getValues(), [['b'], ['c']]);
});

test('clearContent esborra valors i fórmules però conserva validació i format', () => {
  const { full } = nouFull();
  const regla = new FakeDataValidationBuilder().requireValueInList(['a', 'b']).build();
  const cela = full.getRange(2, 2);
  cela.setValue('a').setDataValidation(regla).setNumberFormat('0');
  full.getRange(3, 2).setFormulaR1C1('=1');

  full.getRange(2, 2, 2, 1).clearContent();
  assert.equal(cela.getValue(), '');
  assert.equal(full.getRange(3, 2).getFormulaR1C1(), '');
  assert.equal(cela.getDataValidation(), regla);
  assert.equal(cela.getNumberFormat(), '0');
});

test('getRangeList interpreta notació A1', () => {
  const { full } = nouFull(30, 30);
  full.getRange(12, 4).setValue('x');
  full.getRange(3, 27).setValue('y');
  full.getRangeList(['D12', 'AA3']).clearContent();
  assert.equal(full.getRange('D12').getValue(), '');
  assert.equal(full.getRange(3, 27).getValue(), '');
  assert.equal(full.getRange('B2:C4').getNumRows(), 3);
});

test('setDataValidations desa una regla per cel·la', () => {
  const { full } = nouFull();
  const regla = new FakeDataValidationBuilder()
    .requireValueInRange(full.getRange(2, 1, 5, 1))
    .setAllowInvalid(false)
    .setHelpText('ajuda')
    .build();
  full.getRange(1, 2, 2, 1).setDataValidations([[regla], [null]]);
  assert.deepEqual(regla.interval, { full: 'Full', a1: 'A2:A6' });
  assert.equal(full.getRange(1, 2).getDataValidation(), regla);
  assert.equal(full.getRange(2, 2).getDataValidation(), null);
});

test('el comptador registra les crides externes, no les internes', () => {
  const { full, comptador } = nouFull();
  full.getRange(1, 1, 2, 2).getValues();
  full.getRangeList(['A1', 'B2']).clearContent();
  comptador.senseComptar(() => full.getRange(1, 1).setValue(1));

  assert.deepEqual(comptador.perMetode, {
    'Sheet.getRange': 1,
    'Range.getValues': 1,
    'Sheet.getRangeList': 1,
    'RangeList.clearContent': 1
  });
  assert.equal(comptador.lectures(), 1);
  assert.equal(comptador.escriptures(), 1);
});

test('una edició simulada envia cadenes a l\'esdeveniment i desa el valor interpretat', () => {
  const esc = new Escenari({ instal_lar: false });
  const full = esc.fullGrup('GA1A');
  const esdeveniments = [];
  esc.executar = (handler, e) => esdeveniments.push({ handler, e });

  esc.editar(full, 2, 'Origen', '5');
  esc.editar(full, 2, 'Origen', '');
  esc.enganxar(full, 3, 'Tipus', [['Acord', 'propi']]);

  const [primer, segon, tercer] = esdeveniments;
  assert.equal(primer.handler, 'gestionarEdicioCompartit');
  assert.equal(primer.e.value, '5');
  assert.equal(primer.e.oldValue, undefined);
  assert.equal(segon.e.value, undefined);
  assert.equal(segon.e.oldValue, '5');
  assert.equal(tercer.e.value, undefined);
  assert.equal(tercer.e.range.getNumColumns(), 2);
  assert.equal(esc.filaGrup('GA1A', 3).origen, 'propi');
  // Les escriptures simulades de l'usuari no compten: només la crida getNumColumns de la prova.
  assert.equal(esc.comptador.total, 1);
});

test('cada execució és un context nou amb les mateixes dades', () => {
  const esc = new Escenari({ instal_lar: false });
  const primer = esc.carregar();
  const segon = esc.carregar();
  assert.notEqual(primer.obtenirMapaOfertesMestre_, segon.obtenirMapaOfertesMestre_);
  assert.ok(primer.SpreadsheetApp.openById('id-fitxer-mestre-proves') === segon.SpreadsheetApp.openById('id-fitxer-mestre-proves'));
});
