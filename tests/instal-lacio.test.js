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
  for (let fila = 2; fila <= mestre.getMaxRows(); fila++) {
    assert.equal(mestre._cela(fila, colDies)?.formula, formula, `fórmula de la fila ${fila}`);
  }
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


/********************************************************
 * AUDITORIA
 ********************************************************/

const AVIS_AUDITORIA_NETA = 'Auditoria completada: no s\'han detectat inconsistències.';
const DATA_CONTACTE = new Date(2026, 9, 1);

// Sistema coherent: les ofertes 1 a 6 ocupen les files 2 a 7 del mestre.
function escenariAuditable() {
  const o1 = ofertaDeMostra(1, { estat: 'Contactada', gestionada: 'GA1A', dataContacte: DATA_CONTACTE });
  // Assignada amb Data contacte: és el registre d'auditoria, no una incoherència.
  const o2 = ofertaDeMostra(2, { estat: 'Assignada', gestionada: 'GA1B', dataContacte: DATA_CONTACTE });
  const o5 = ofertaDeMostra(5, { estat: 'Assignada', gestionada: 'GA1A' });
  const o6 = ofertaDeMostra(6, { estat: 'Contactada', gestionada: 'GA1A', dataContacte: DATA_CONTACTE });
  const esc = new Escenari({
    ofertes: [o1, o2, ofertaDeMostra(3), ofertaDeMostra(4, { estat: 'Esperant informació' }), o5, o6],
    grups: {
      GA1A: [
        { tipus: 'Contacte', origen: 1 },
        { tipus: 'Acord', origen: 5 },
        { tipus: 'Contacte', origen: 6 },
        { tipus: 'Acord', origen: 'propi' }
      ],
      GA1B: [{ tipus: 'Acord', origen: 2 }]
    }
  });
  esc.reiniciarRegistres();
  return esc;
}

// Cada incoherència, introduïda directament a les dades, i el que n'ha de dir l'auditoria.
const INCOHERENCIES = [
  // La còpia posterior no ha de substituir l'original: si ho fes, també
  // s'informaria d'una oferta Assignada sense cap fila de grup.
  ['ID duplicat al mestre',
    esc => esc.escriureOferta(20, ofertaDeMostra(3, { estat: 'Assignada', gestionada: 'GA2B' })),
    'ID duplicat 3: files 4 i 20 del mestre.'],
  ['oferta utilitzada en diverses files',
    esc => esc.escriureFilaGrup('GA2A', 2, { tipus: 'Acord', origen: 2 }),
    'Oferta 2: utilitzada 2 vegades (GA1B!fila 2, GA2A!fila 2).'],
  ['referència a una oferta inexistent',
    esc => esc.escriureFilaGrup('GA1C', 2, { tipus: 'Acord', origen: 99 }),
    'Oferta 99: apareix en un grup però no existeix al mestre.'],
  ['Tipus del grup incoherent amb l\'estat del mestre',
    esc => esc.escriureFilaGrup('GA1A', 2, { tipus: 'Acord' }),
    'Oferta 1: al grup és Acord, però al mestre consta Contactada.'],
  ['referència d\'un Acord a una oferta Pendent',
    esc => esc.escriureFilaGrup('GA2B', 9, { tipus: 'Acord', origen: 3 }),
    ['Oferta 3: al grup és Acord, però al mestre consta Pendent.',
      'Oferta 3: Gestionada per = [buit], però l\'ús és a GA2B.']],
  // Regressió: també deia «Contactada però sense Data contacte», tot i que
  // l'oferta és Pendent.
  ['referència d\'un Contacte a una oferta Pendent',
    esc => esc.escriureFilaGrup('GA2B', 10, { tipus: 'Contacte', origen: 3 }),
    ['Oferta 3: al grup és Contacte, però al mestre consta Pendent.',
      'Oferta 3: Gestionada per = [buit], però l\'ús és a GA2B.']],
  ['Gestionada per diferent del grup que la fa servir',
    esc => esc.escriureOferta(6, { gestionada: 'GA2B' }),
    'Oferta 5: Gestionada per = GA2B, però l\'ús és a GA1A.'],
  ['Contactada sense Data contacte',
    esc => esc.escriureOferta(7, { dataContacte: '' }),
    'Oferta 6: Contactada però sense Data contacte.'],
  ['oferta activa sense cap fila de grup',
    esc => esc.escriureOferta(5, { estat: 'Assignada', gestionada: 'AF1M' }),
    'Oferta 4: Assignada al mestre però sense cap fila de grup.']
];

test('auditarSistema() no informa de res en un sistema coherent i no escriu res', () => {
  const esc = escenariAuditable();

  const problemes = esc.executar('auditarSistema');

  assert.deepEqual([...problemes], []);
  assert.deepEqual(esc.avisos(), [AVIS_AUDITORIA_NETA]);
  assert.deepEqual(esc.mon.registre, [AVIS_AUDITORIA_NETA]);
  assert.equal(esc.comptador.escriptures(), 0, JSON.stringify(esc.comptador.perMetode));
});

test('auditarSistema() detecta cada tipus d\'incoherència', async t => {
  for (const [nom, alterar, esperats] of INCOHERENCIES) {
    await t.test(nom, () => {
      const esc = escenariAuditable();
      alterar(esc);

      const problemes = esc.executar('auditarSistema');

      const llista = [esperats].flat();
      assert.deepEqual([...problemes], llista);
      assert.deepEqual(esc.avisos(), [`Auditoria: ${llista.length} incidència/es.\n\n${llista.join('\n')}`]);
      assert.equal(esc.comptador.escriptures(), 0, 'l\'auditoria no corregeix res');
    });
  }
});

test('auditarSistema() informa de totes les incoherències alhora i n\'avisa de 20 com a màxim', async t => {
  await t.test('totes alhora', () => {
    const esc = escenariAuditable();
    INCOHERENCIES.forEach(([, alterar]) => alterar(esc));

    const problemes = esc.executar('auditarSistema');

    // Les dues referències a l'oferta 3 compten com un sol ús múltiple: el
    // primer ús (l'Acord) és el que es compara amb el mestre.
    const esperats = INCOHERENCIES
      .filter(([nom]) => nom !== 'referència d\'un Contacte a una oferta Pendent')
      .flatMap(([, , esperats]) => esperats);
    esperats.push('Oferta 3: utilitzada 2 vegades (GA2B!fila 9, GA2B!fila 10).');
    assert.deepEqual([...problemes].sort(), esperats.sort());
  });

  await t.test('més de 20', () => {
    const esc = escenariAuditable();
    for (let i = 0; i < 25; i++) {
      esc.escriureFilaGrup('AF2T', 2 + i, { tipus: 'Acord', origen: 900 + i });
    }

    const problemes = esc.executar('auditarSistema');

    assert.equal(problemes.length, 25);
    const [avis] = esc.avisos();
    const [capcalera, , ...linies] = avis.split('\n');
    assert.equal(capcalera, 'Auditoria: 25 incidència/es.');
    assert.equal(linies.length, 20);
    assert.equal(linies[19], 'Oferta 919: apareix en un grup però no existeix al mestre.');
  });
});
