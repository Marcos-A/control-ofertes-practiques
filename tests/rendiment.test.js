'use strict';

/*
 * Pressupostos de crides a l'API (TODO.md, secció 2.5). Els límits són la
 * mesura de la v9: una optimització els ha d'ajustar a la baixa i una
 * regressió els fa fallar.
 *
 * Es compten totes les crides a Spreadsheet, Sheet, Range, RangeList,
 * openById i flush. Les lectures i escriptures de dades es comproven a part.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Escenari, GRUPS, ofertaDeMostra, dadesEmpresaDe } = require('./harness/escenari');

// 11 grups × 100 files d'Acord, cadascuna amb una oferta Assignada coherent.
function escenariPle() {
  const ofertes = [];
  const grups = {};
  let id = 1;

  GRUPS.forEach(grup => {
    grups[grup] = [];
    for (let i = 0; i < 100; i++, id++) {
      const oferta = ofertaDeMostra(id, { estat: 'Assignada', gestionada: grup });
      ofertes.push(oferta);
      grups[grup].push({ tipus: 'Acord', origen: id, ...dadesEmpresaDe(oferta) });
    }
  });

  return new Escenari({ ofertes, grups });
}

function detall(comptador) {
  return JSON.stringify(comptador.perMetode, null, 2);
}

test('reconciliació sense res a corregir (11 grups × 100 files)', () => {
  const esc = escenariPle();
  esc.carregar().reconciliarDesDelCompartitSenseLock_();

  const { comptador } = esc;
  assert.equal(comptador.escriptures(), 0, detall(comptador));
  // TODO.md: ≤ 15 lectures de dades (1 del mestre i 1 per grup).
  assert.ok(comptador.perMetode['Range.getValues'] <= 15, detall(comptador));
  // v9: 213 crides, 127 de les quals són Sheet.getName.
  assert.ok(comptador.total <= 213, `${comptador.total} crides:\n${detall(comptador)}`);
});
