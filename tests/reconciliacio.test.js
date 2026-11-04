'use strict';

/*
 * Proves de caracterització de la reconciliació (TODO.md, secció 2.4).
 *
 * La instal·lació ja reconcilia: cada prova parteix d'un escenari coherent,
 * altera les dades directament (sense disparar cap esdeveniment, com si
 * s'haguessin perdut edicions) i executa la reconciliació manual.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Escenari, ofertaDeMostra, dadesEmpresaDe } = require('./harness/escenari');

const BUIT = Object.freeze({
  personaContacte: '', correu: '', telefon: '', adreca: '', localitat: '', nomEmpresa: ''
});

const DATA_CONTACTE = new Date(2026, 9, 1);

// Oferta Assignada a un grup amb la fila d'Acord corresponent.
function assignada(id, grup, camps = {}) {
  return ofertaDeMostra(id, { estat: 'Assignada', gestionada: grup, ...camps });
}

function filaAcord(oferta, camps = {}) {
  return { tipus: 'Acord', origen: oferta.id, ...dadesEmpresaDe(oferta), ...camps };
}

function reconciliar(esc) {
  esc.executar('reconciliarSistemaManualment');
}

function dadesEmpresaFila(esc, grup, fila) {
  const { personaContacte, correu, telefon, adreca, localitat, nomEmpresa } = esc.filaGrup(grup, fila);
  return { personaContacte, correu, telefon, adreca, localitat, nomEmpresa };
}


test('regressió v9: Telèfon i Localitat es conserven i s\'emplenen si falten', () => {
  const o1 = assignada(1, 'GA1A');
  const o2 = assignada(2, 'GA1A');
  const esc = new Escenari({
    ofertes: [o1, o2],
    grups: { GA1A: [filaAcord(o1), filaAcord(o2)] }
  });

  esc.escriureFilaGrup('GA1A', 3, { telefon: '', localitat: '' });
  reconciliar(esc);

  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(o1));
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 3), dadesEmpresaDe(o2));
  assert.equal(esc.oferta(1).estat, 'Assignada');
  assert.equal(esc.oferta(2).estat, 'Assignada');
});

test('les dades sobrants en files sense Tipus s\'esborren i les files propi no es toquen', () => {
  const manuals = {
    personaContacte: 'Persona manual', correu: 'manual@exemple.cat', telefon: '930001111',
    adreca: 'Carrer manual', localitat: 'Localitat manual', nomEmpresa: 'Empresa manual'
  };
  const esc = new Escenari();
  const sobrants = dadesEmpresaDe(ofertaDeMostra(9));

  esc.escriureFilaGrup('GA1A', 2, { ...sobrants });                                  // sense Tipus ni Origen
  esc.escriureFilaGrup('GA1A', 3, { origen: 'propi', ...sobrants });                // Origen sense Tipus
  esc.escriureFilaGrup('GA1A', 4, { tipus: 'Contacte', ...sobrants });              // Contacte sense Origen
  esc.escriureFilaGrup('GA1A', 5, { tipus: 'Acord', ...sobrants });                 // Acord sense Origen
  esc.escriureFilaGrup('GA1A', 6, { tipus: 'Acord', origen: 'propi', ...manuals }); // acord propi
  esc.escriureFilaGrup('GA1A', 7, { nomEstudiant: 'Estudiant', ...sobrants });     // columna aliena

  reconciliar(esc);

  for (const fila of [2, 3, 4, 5, 7]) {
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', fila), BUIT, `fila ${fila}`);
  }
  assert.equal(esc.filaGrup('GA1A', 3).origen, '');
  assert.equal(esc.filaGrup('GA1A', 4).tipus, 'Contacte');
  assert.equal(esc.filaGrup('GA1A', 5).tipus, 'Acord');

  assert.equal(esc.filaGrup('GA1A', 6).tipus, 'Acord');
  assert.equal(esc.filaGrup('GA1A', 6).origen, 'propi');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 6), manuals);
  assert.equal(esc.filaGrup('GA1A', 7).nomEstudiant, 'Estudiant');
});

test('una oferta activa sense cap ús torna a Pendent sense Gestionada per ni Data contacte', () => {
  const esc = new Escenari({
    ofertes: [
      ofertaDeMostra(1, { estat: 'Contactada', gestionada: 'GA1A', dataContacte: DATA_CONTACTE }),
      assignada(2, 'GA1B', { dataContacte: DATA_CONTACTE })
    ]
  });

  // La instal·lació ja les ha alliberat.
  for (const id of [1, 2]) {
    const oferta = esc.oferta(id);
    assert.equal(oferta.estat, 'Pendent', `oferta ${id}`);
    assert.equal(oferta.gestionada, '', `oferta ${id}`);
    assert.equal(oferta.dataContacte, '', `oferta ${id}`);
  }
  assert.deepEqual(esc.ofertesPublicades().map(fila => fila[0]), [1, 2]);

  // Una oferta que torna a quedar activa sense ús també s'allibera.
  esc.escriureOferta(3, { estat: 'Contactada', gestionada: 'GA2A', dataContacte: DATA_CONTACTE });
  reconciliar(esc);

  assert.deepEqual(
    [esc.oferta(2).estat, esc.oferta(2).gestionada, esc.oferta(2).dataContacte],
    ['Pendent', '', '']
  );
  assert.deepEqual(esc.ofertesPublicades().map(fila => fila[0]), [1, 2]);
});

test('una referència a una oferta Pendent la reserva per al grup', () => {
  const o1 = ofertaDeMostra(1);
  const o2 = ofertaDeMostra(2);
  const esc = new Escenari({ ofertes: [o1, o2] });

  esc.escriureFilaGrup('GA1A', 2, { tipus: 'Contacte', origen: 1 });
  esc.escriureFilaGrup('GA1B', 2, { tipus: 'Acord', origen: 2 });
  const abans = Date.now();
  reconciliar(esc);

  const contactada = esc.oferta(1);
  assert.equal(contactada.estat, 'Contactada');
  assert.equal(contactada.gestionada, 'GA1A');
  assert.ok(contactada.dataContacte instanceof Date);
  assert.ok(contactada.dataContacte.getTime() >= abans);

  const assignadaDirecta = esc.oferta(2);
  assert.equal(assignadaDirecta.estat, 'Assignada');
  assert.equal(assignadaDirecta.gestionada, 'GA1B');
  assert.equal(assignadaDirecta.dataContacte, '');

  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(o1));
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1B', 2), dadesEmpresaDe(o2));
  assert.deepEqual(esc.ofertesPublicades(), []);
});

test('les referències a ofertes Esperant informació, Posposada, Descartada o inexistents s\'esborren', () => {
  const esperant = ofertaDeMostra(1, { estat: 'Esperant informació' });
  const descartada = ofertaDeMostra(2, { estat: 'Descartada' });
  const posposada = ofertaDeMostra(3, { estat: 'Posposada' });
  const esc = new Escenari({ ofertes: [esperant, descartada, posposada] });

  esc.escriureFilaGrup('GA1A', 2, { tipus: 'Contacte', origen: 1, ...dadesEmpresaDe(esperant) });
  esc.escriureFilaGrup('GA1A', 3, { tipus: 'Acord', origen: 2, ...dadesEmpresaDe(descartada) });
  esc.escriureFilaGrup('GA1A', 4, { tipus: 'Acord', origen: 99, ...dadesEmpresaDe(ofertaDeMostra(99)) });
  esc.escriureFilaGrup('GA1A', 5, { tipus: 'Contacte', origen: 3, ...dadesEmpresaDe(posposada) });
  reconciliar(esc);

  for (const fila of [2, 3, 4, 5]) {
    const dades = esc.filaGrup('GA1A', fila);
    assert.equal(dades.origen, '', `fila ${fila}`);
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', fila), BUIT, `fila ${fila}`);
  }
  // El Tipus es conserva: el tutor pot triar una altra oferta.
  assert.equal(esc.filaGrup('GA1A', 2).tipus, 'Contacte');
  assert.equal(esc.oferta(1).estat, 'Esperant informació');
  assert.equal(esc.oferta(2).estat, 'Descartada');
  assert.equal(esc.oferta(3).estat, 'Posposada');
  assert.equal(esc.oferta(99), null);
});

test('una oferta activa d\'un grup no la pot «robar» una referència enganxada en un altre grup', async t => {
  await t.test('si el grup que la gestiona encara la fa servir, es conserva aquest ús', () => {
    const o1 = assignada(1, 'GA1A');
    const esc = new Escenari({ ofertes: [o1], grups: { GA1A: [filaAcord(o1)] } });

    esc.escriureFilaGrup('GA2B', 5, filaAcord(o1));
    reconciliar(esc);

    assert.equal(esc.oferta(1).estat, 'Assignada');
    assert.equal(esc.oferta(1).gestionada, 'GA1A');
    assert.equal(esc.filaGrup('GA1A', 2).origen, 1);
    assert.equal(esc.filaGrup('GA2B', 5).origen, '');
    assert.deepEqual(dadesEmpresaFila(esc, 'GA2B', 5), BUIT);
  });

  await t.test('si el grup que la gestiona ja no la fa servir, torna a Pendent', () => {
    const o1 = assignada(1, 'GA1A');
    const esc = new Escenari({ ofertes: [o1], grups: { GA1A: [filaAcord(o1)] } });

    esc.escriureFilaGrup('GA1A', 2, { tipus: '', origen: '' });
    esc.escriureFilaGrup('GA2B', 5, filaAcord(o1));
    reconciliar(esc);

    assert.deepEqual(
      [esc.oferta(1).estat, esc.oferta(1).gestionada],
      ['Pendent', '']
    );
    assert.equal(esc.filaGrup('GA2B', 5).origen, '');
    assert.deepEqual(dadesEmpresaFila(esc, 'GA2B', 5), BUIT);
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), BUIT);
    assert.deepEqual(esc.ofertesPublicades().map(fila => fila[0]), [1]);
  });
});

test('idempotència: una segona reconciliació seguida no fa cap escriptura', () => {
  const o1 = assignada(1, 'GA1A');
  const o2 = ofertaDeMostra(2);
  const o3 = ofertaDeMostra(3, { estat: 'Contactada', gestionada: 'GA1B', dataContacte: DATA_CONTACTE });
  const esc = new Escenari({
    ofertes: [o1, o2, o3],
    grups: { GA1A: [filaAcord(o1)], GA1B: [{ tipus: 'Contacte', origen: 3, ...dadesEmpresaDe(o3) }] }
  });

  // Incoherències de tots els tipus que corregeix la reconciliació.
  esc.escriureFilaGrup('GA1A', 2, { telefon: '', localitat: '' });
  esc.escriureFilaGrup('GA1A', 3, { tipus: 'Acord', origen: 2 });
  esc.escriureFilaGrup('GA2A', 2, filaAcord(o1));
  esc.escriureFilaGrup('GA2A', 3, { ...dadesEmpresaDe(o2) });
  esc.escriureFilaGrup('GA1B', 2, { tipus: '' });

  esc.executar('reconciliarDesDelCompartitSenseLock_');
  assert.ok(esc.comptador.escriptures() > 0, 'la primera reconciliació ha de corregir dades');

  const mestre = [1, 2, 3].map(id => esc.oferta(id));
  esc.reiniciarRegistres();
  esc.executar('reconciliarDesDelCompartitSenseLock_');

  assert.equal(esc.comptador.escriptures(), 0, JSON.stringify(esc.comptador.perMetode, null, 2));
  assert.deepEqual([1, 2, 3].map(id => esc.oferta(id)), mestre);
});
