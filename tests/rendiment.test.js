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


/*
 * Sistema carregat per a les edicions: 10 grups amb 50 Acords assignats
 * (ofertes 1 a 500), el grup AF2T buit i 200 ofertes Pendent (501 a 700).
 */
const PRIMERA_PENDENT = 501;

function escenariCarregat() {
  const ofertes = [];
  const grups = {};
  let id = 1;

  GRUPS.filter(grup => grup !== 'AF2T').forEach(grup => {
    grups[grup] = [];
    for (let i = 0; i < 50; i++, id++) {
      const oferta = ofertaDeMostra(id, { estat: 'Assignada', gestionada: grup });
      ofertes.push(oferta);
      grups[grup].push({ tipus: 'Acord', origen: id, ...dadesEmpresaDe(oferta) });
    }
  });
  for (let i = 0; i < 200; i++, id++) ofertes.push(ofertaDeMostra(id));

  return new Escenari({ ofertes, grups });
}

function mesura(comptador) {
  return {
    total: comptador.total,
    getValues: comptador.perMetode['Range.getValues'] || 0,
    escriptures: comptador.escriptures(),
    celes: comptador.celesLlegides
  };
}

function comprovarPressupost(comptador, pressupost) {
  const real = mesura(comptador);
  for (const [clau, maxim] of Object.entries(pressupost)) {
    assert.ok(real[clau] <= maxim, `${clau}: ${real[clau]} > ${maxim}\n${detall(comptador)}`);
  }
  return real;
}

function enganxarAlGrup(files) {
  const esc = escenariCarregat();
  esc.reiniciarRegistres();
  esc.enganxar(esc.fullGrup('AF2T'), 2, 'Tipus',
    Array.from({ length: files }, (_, i) => ['Acord', PRIMERA_PENDENT + i]));
  assert.equal(esc.oferta(PRIMERA_PENDENT + files - 1).estat, 'Assignada');
  return esc.comptador;
}

function enganxarAlMestre(files) {
  const esc = escenariCarregat();
  esc.reiniciarRegistres();
  esc.enganxar(esc.fullMestre, 760, 'Empresa',
    Array.from({ length: files }, (_, i) => [`Empresa nova ${i}`, `Persona ${i}`]));
  assert.equal(esc.filaMestre(760 + files - 1).id, 700 + files);
  return esc.comptador;
}

// Cost de cada fila addicional entre dues mides d'enganxat.
function costPerFila(petit, gran, filesPetit, filesGran) {
  const resultat = {};
  for (const clau of Object.keys(petit)) {
    resultat[clau] = (gran[clau] - petit[clau]) / (filesGran - filesPetit);
  }
  return resultat;
}

test('reserva d\'una oferta (Contacte + ID) en un sistema carregat', () => {
  const esc = escenariCarregat();
  const full = esc.fullGrup('AF2T');
  esc.editar(full, 2, 'Tipus', 'Contacte');
  esc.reiniciarRegistres();

  esc.editar(full, 2, 'Origen', String(PRIMERA_PENDENT));

  assert.equal(esc.oferta(PRIMERA_PENDENT).estat, 'Contactada');
  // v10 en curs: 252 crides (119 Sheet.getName), 14 getValues, 18 escriptures.
  comprovarPressupost(esc.comptador, { total: 252, getValues: 14, escriptures: 18, celes: 38327 });
});

test('enganxar 100 files en un grup', () => {
  // v10 en curs: unes 24 crides i 11 escriptures per fila, sobretot les dades
  // de l'empresa i la validació d'Origen fila per fila (seccions 3.1 i 3.3).
  comprovarPressupost(enganxarAlGrup(100), { total: 2647, getValues: 14, escriptures: 1106, celes: 45124 });
});

test('enganxar 100 files al mestre: el cost creix linealment', () => {
  const mides = [25, 50, 100];
  const [petit, mitja, gran] = mides.map(files => mesura(enganxarAlMestre(files)));

  // v10 en curs: 8 crides per fila, però cada fila rellegeix tota la columna
  // d'IDs (unes 1.000 cel·les amb el mestre de 1.000 files): el cost és el
  // producte de les files enganxades per la mida del mestre (secció 3.2).
  const real = comprovarPressupost(enganxarAlMestre(100), {
    total: 857, getValues: 201, escriptures: 108, celes: 118700
  });
  assert.deepEqual(real, gran);

  // El cost de cada fila addicional no augmenta amb la mida de l'enganxat.
  const primer = costPerFila(petit, mitja, mides[0], mides[1]);
  const segon = costPerFila(mitja, gran, mides[1], mides[2]);
  for (const clau of Object.keys(primer)) {
    assert.ok(segon[clau] <= primer[clau] * 1.05 + 1, `${clau} per fila: ${primer[clau]} → ${segon[clau]}`);
  }
});

test('enganxar al grup: el cost creix linealment', () => {
  const [petit, mitja, gran] = [25, 50, 100].map(files => mesura(enganxarAlGrup(files)));
  const primer = costPerFila(petit, mitja, 25, 50);
  const segon = costPerFila(mitja, gran, 50, 100);
  for (const clau of Object.keys(primer)) {
    assert.ok(segon[clau] <= primer[clau] * 1.05 + 1, `${clau} per fila: ${primer[clau]} → ${segon[clau]}`);
  }
});
