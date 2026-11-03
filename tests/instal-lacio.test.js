'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ID_MOSTRA } = require('./harness/carregar-script');
const { Escenari, GRUPS, ID_MESTRE, ID_COMPARTIT, ofertaDeMostra } = require('./harness/escenari');

const ESTATS = ['Esperant informació', 'Pendent', 'Contactada', 'Assignada', 'Descartada'];

test('instal_larSistema() amb l\'ID de mostra falla amb un missatge clar', () => {
  const esc = new Escenari({ instal_lar: false });
  const ctx = esc.carregar({ idMestre: ID_MOSTRA });

  assert.throws(() => ctx.instal_larSistema(), /Configura CFG\.MASTER_SPREADSHEET_ID/);
  assert.equal(esc.mon.triggers.length, 0);
});

test('si falta un full al compartit, l\'error l\'anomena', () => {
  const esc = new Escenari({ instal_lar: false, ometreFulls: ['GA2B'] });
  assert.throws(() => esc.executar('instal_larSistema'), /Falten fulls al fitxer compartit: GA2B/);
});

test('si falta una capçalera a un full de grup, l\'error anomena la capçalera i el full', () => {
  const esc = new Escenari({
    instal_lar: false,
    capcaleresGrup: ['Tipus', 'Origen', 'Persona contacte', 'Correu', 'Adreça', 'Localitat', 'Nom empresa']
  });
  assert.throws(() => esc.executar('instal_larSistema'), /Falta la capçalera "Telèfon" al full "GA1A"/);
});

test('una instal·lació correcta deixa el sistema configurat', () => {
  const esc = new Escenari({
    instal_lar: false,
    ofertes: [ofertaDeMostra(1), ofertaDeMostra(2, { estat: 'Esperant informació' }), ofertaDeMostra(3)]
  });
  esc.executar('instal_larSistema');

  // Triggers
  const triggers = esc.mon.triggers.map(t => [t.getHandlerFunction(), t.getEventType(), t.getTriggerSourceId()]);
  assert.deepEqual(triggers.sort(), [
    ['gestionarCanviEstructuralCompartit', 'ON_CHANGE', ID_COMPARTIT],
    ['gestionarEdicioCompartit', 'ON_EDIT', ID_COMPARTIT],
    ['gestionarEdicioMestre', 'ON_EDIT', ID_MESTRE]
  ]);
  assert.equal(esc.mon.propietats.get('PRACTIQUES_SHARED_SPREADSHEET_ID'), ID_COMPARTIT);

  // Full auxiliar ocult amb la llista d'orígens
  const aux = esc.fullAuxiliar;
  assert.ok(aux, 'ha de crear el full auxiliar');
  assert.equal(aux.isSheetHidden(), true);
  assert.ok(aux.getMaxRows() >= 2001);
  assert.deepEqual(aux.getRange(1, 1, 4, 2).getValues(), [
    ['Orígens Acord', 'Orígens Contacte'],
    ['propi', 1],
    [1, 3],
    [3, '']
  ]);

  // Validació d'Estat al mestre, fórmula i format condicional de Dies en contacte
  const mestre = esc.fullMestre;
  const colEstat = esc.columna(mestre, 'Estat');
  const colDies = esc.columna(mestre, 'Dies en contacte');
  const reglaEstat = mestre.getRange(2, colEstat).getDataValidation();
  assert.equal(reglaEstat.criteri, 'VALUE_IN_LIST');
  assert.deepEqual(reglaEstat.valors, ESTATS);
  assert.equal(reglaEstat.permetInvalid, false);
  assert.equal(mestre.getRange(mestre.getMaxRows(), colEstat).getDataValidation(), reglaEstat);

  const formula = mestre.getRange(2, colDies).getFormulaR1C1();
  assert.match(formula, /^=IFERROR\(IF\(RC\[-3\]="Contactada";/);
  assert.equal(mestre.getRange(mestre.getMaxRows(), colDies).getFormulaR1C1(), formula);
  assert.equal(mestre.getRange(2, colDies).getNumberFormat(), '0');

  const regles = mestre.getConditionalFormatRules();
  assert.deepEqual(regles.map(r => [r.condicio, r.valors, r.fons]), [
    ['NUMBER_BETWEEN', [7, 13], '#fff2cc'],
    ['NUMBER_GREATER_THAN_OR_EQUAL_TO', [14], '#f4cccc']
  ]);

  // Validacions de Tipus i Origen als grups (files 2 a 101)
  GRUPS.forEach(grup => {
    const full = esc.fullGrup(grup);
    const colTipus = esc.columna(full, 'Tipus');
    const reglaTipus = full.getRange(2, colTipus).getDataValidation();
    assert.deepEqual(reglaTipus.valors, ['Contacte', 'Acord'], grup);
    assert.equal(full.getRange(101, colTipus).getDataValidation(), reglaTipus, grup);
    assert.equal(full.getRange(102, colTipus).getDataValidation(), null, grup);
  });

  // Publicació
  assert.deepEqual(esc.ofertesPublicades().map(fila => fila[0]), [1, 3]);
  assert.deepEqual(esc.avisos(), ['Sistema de pràctiques instal·lat correctament.']);
});

test('reinstal·lar substitueix els triggers i les regles de format en lloc de duplicar-los', () => {
  const esc = new Escenari();
  esc.mon.triggers.push({
    getUniqueId: () => 'aliè',
    getHandlerFunction: () => 'unaAltraFuncio',
    getEventType: () => 'CLOCK',
    getTriggerSourceId: () => null
  });

  esc.executar('instal_larSistema');

  const handlers = esc.mon.triggers.map(t => t.getHandlerFunction()).sort();
  assert.deepEqual(handlers, [
    'gestionarCanviEstructuralCompartit',
    'gestionarEdicioCompartit',
    'gestionarEdicioMestre',
    'unaAltraFuncio'
  ]);
  assert.equal(esc.fullMestre.getConditionalFormatRules().length, 2);
});
