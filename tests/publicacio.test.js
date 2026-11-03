'use strict';

/*
 * Proves de caracterització de la publicació al full Ofertes, del full
 * auxiliar i de les validacions d'Origen (TODO.md, secció 2.4).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Escenari, ofertaDeMostra, dadesEmpresaDe, CAPCALERES_OFERTES, FULL_AUXILIAR
} = require('./harness/escenari');

const MAX_INDIVIDUAL_DROPDOWN_ITEMS = 450;
const MAX_ORIGENS_AUXILIAR = 2000;

const INTERVAL_ACORD = { full: FULL_AUXILIAR, a1: 'A2:A2001' };
const INTERVAL_CONTACTE = { full: FULL_AUXILIAR, a1: 'B2:B2001' };

// Ofertes desordenades per ID, amb tots els estats i una fila Pendent sense ID.
function escenariVariat() {
  const assignada = ofertaDeMostra(8, { estat: 'Assignada', gestionada: 'GA1A' });
  return new Escenari({
    ofertes: [
      ofertaDeMostra(7, { dataIncorporacio: new Date(2027, 0, 11), comentaris: 'Comentari 7' }),
      ofertaDeMostra(3, { torn: 'Tarda', modalitat: 'Híbrida' }),
      ofertaDeMostra(10, { estat: 'Esperant informació' }),
      ofertaDeMostra(1),
      ofertaDeMostra(5, { estat: 'Descartada' }),
      assignada,
      { estat: 'Pendent', empresa: 'Empresa sense ID', cicle: 'AF' }
    ],
    grups: { GA1A: [{ tipus: 'Acord', origen: 8, ...dadesEmpresaDe(assignada) }] }
  });
}

function idsPublicats(esc) {
  return esc.ofertesPublicades().map(fila => fila[0]);
}

// Contingut de les columnes A i B de l'auxiliar a partir de la fila 2.
function columnaAuxiliar(esc, columna) {
  const full = esc.fullAuxiliar;
  const valors = [];
  for (let fila = 2; fila <= full.getMaxRows(); fila++) {
    const valor = full._valor(fila, columna);
    if (valor !== '') valors.push([fila, valor]);
  }
  return valors;
}

function reglaOrigen(esc, grup, fila) {
  const full = esc.fullGrup(grup);
  return esc.comptador.senseComptar(
    () => full.getRange(fila, esc.columna(full, 'Origen')).getDataValidation()
  );
}

function ofertesPendents(quantes) {
  return Array.from({ length: quantes }, (_, i) => ofertaDeMostra(i + 1));
}


test('Ofertes conté només les Pendent, ordenades per ID i sense dades de contacte', () => {
  const esc = escenariVariat();
  const o7 = esc.oferta(7);
  const o3 = esc.oferta(3);
  const o1 = esc.oferta(1);

  const fila = o => [o.id, o.cicle, o.tasques, o.torn, o.localitat, o.dataIncorporacio, o.modalitat, o.comentaris];
  assert.deepEqual(esc.fullOfertes._fila(1, CAPCALERES_OFERTES.length), CAPCALERES_OFERTES);
  assert.deepEqual(esc.ofertesPublicades(), [fila(o1), fila(o3), fila(o7)]);
  assert.ok(esc.ofertesPublicades()[2][5] instanceof Date, 'Data incorporació es publica com a data');

  // Cap cel·la del full conté dades de contacte de cap oferta.
  const contactes = new Set();
  for (const id of [1, 3, 5, 7, 8, 10]) {
    const o = esc.oferta(id);
    [o.empresa, o.personaContacte, o.correu, o.telefon, o.adreca].forEach(v => contactes.add(String(v)));
  }
  const full = esc.fullOfertes;
  for (let f = 1; f <= full.getMaxRows(); f++) {
    for (const valor of full._fila(f)) {
      assert.ok(!contactes.has(String(valor)), `dada de contacte publicada a la fila ${f}: ${valor}`);
    }
  }
});

test('les files sobrants de publicacions anteriors s\'esborren', async t => {
  await t.test('en republicar des del menú', () => {
    const esc = escenariVariat();
    for (let f = 1; f <= 40; f++) {
      esc.fullOfertes._fila(f, CAPCALERES_OFERTES.length).forEach((_, c) => {
        esc.fullOfertes._establir(f, c + 1, `antic ${f}-${c + 1}`);
      });
    }

    esc.executar('actualitzarPublicacio');

    assert.deepEqual(esc.fullOfertes._fila(1, CAPCALERES_OFERTES.length), CAPCALERES_OFERTES);
    assert.deepEqual(idsPublicats(esc), [1, 3, 7]);
    assert.equal(esc.fullOfertes.getLastRow(), 4);
  });

  await t.test('en reservar una oferta, la llista s\'escurça', () => {
    const esc = escenariVariat();
    const full = esc.fullGrup('GA2A');
    esc.editar(full, 2, 'Tipus', 'Contacte');
    esc.editar(full, 2, 'Origen', '1');

    assert.deepEqual(idsPublicats(esc), [3, 7]);
    assert.equal(esc.fullOfertes.getLastRow(), 3);
  });
});

test('les dades de text es publiquen tal com són al mestre', () => {
  // Regressió: setValues interpretava el text com si s'hagués teclejat.
  const literals = {
    cicle: '+GA', tasques: '=Tasques', torn: '0800', localitat: '08001',
    modalitat: '-Presencial', comentaris: '+34 Comentari'
  };
  const esc = new Escenari({ ofertes: [ofertaDeMostra(1, literals)] });

  const [fila] = esc.ofertesPublicades();
  assert.deepEqual(fila, [1, '+GA', '=Tasques', '0800', '08001', '', '-Presencial', '+34 Comentari']);
  assert.equal(esc.fullOfertes.getRange(2, 3).getFormula(), '');
});

test('el full Ofertes creix si hi ha més ofertes Pendent que files', () => {
  const esc = new Escenari({ ofertes: ofertesPendents(1100) });

  assert.ok(esc.fullOfertes.getMaxRows() >= 1101);
  assert.equal(esc.ofertesPublicades().length, 1100);
  assert.deepEqual(esc.ofertesPublicades().at(-1)[0], 1100);
});

test('auxiliar: columna A = propi + IDs Pendent; columna B = IDs Pendent', () => {
  const esc = escenariVariat();
  for (let f = 2; f <= 60; f++) {
    esc.fullAuxiliar._establir(f, 1, `antic A${f}`);
    esc.fullAuxiliar._establir(f, 2, `antic B${f}`);
  }

  esc.executar('actualitzarPublicacio');

  assert.deepEqual(esc.fullAuxiliar._fila(1, 2), ['Orígens Acord', 'Orígens Contacte']);
  assert.deepEqual(columnaAuxiliar(esc, 1), [[2, 'propi'], [3, 1], [4, 3], [5, 7]]);
  assert.deepEqual(columnaAuxiliar(esc, 2), [[2, 1], [3, 3], [4, 7]]);
  assert.equal(esc.fullAuxiliar.isSheetHidden(), true);
});

test('auxiliar: més ofertes Pendent de les que hi caben és un error i no toca res', () => {
  // Les ofertes es creen com a Esperant informació perquè la instal·lació
  // funcioni, i després passen a Pendent. Amb propi, la columna A
  // necessitaria 2.001 files de les 2.000 disponibles.
  const esc = new Escenari({
    ofertes: [
      ofertaDeMostra(1),
      ...Array.from({ length: MAX_ORIGENS_AUXILIAR - 1 }, (_, i) =>
        ofertaDeMostra(i + 2, { estat: 'Esperant informació' }))
    ]
  });
  const publicades = esc.ofertesPublicades();
  const auxiliar = [columnaAuxiliar(esc, 1), columnaAuxiliar(esc, 2)];
  assert.deepEqual(auxiliar, [[[2, 'propi'], [3, 1]], [[2, 1]]]);

  for (let i = 1; i < MAX_ORIGENS_AUXILIAR; i++) {
    esc.escriureOferta(i + 2, { estat: 'Pendent' });
  }

  assert.throws(
    () => esc.executar('actualitzarPublicacio'),
    /Hi ha massa ofertes Pendent per al rang auxiliar configurat/
  );
  // Regressió: abans l'error saltava quan Ofertes ja s'havia reescrit i
  // l'auxiliar s'havia buidat, i els desplegables d'Origen quedaven sense
  // opcions. Ara es conserva la publicació anterior.
  assert.deepEqual(esc.ofertesPublicades(), publicades);
  assert.deepEqual([columnaAuxiliar(esc, 1), columnaAuxiliar(esc, 2)], auxiliar);
});

test('validacions d\'Origen', async t => {
  function escenariAmbFiles() {
    const esc = escenariVariat();
    esc.escriureFilaGrup('GA1A', 3, { tipus: 'Contacte' });
    esc.escriureFilaGrup('GA1A', 4, { tipus: 'Acord' });
    esc.escriureFilaGrup('GA1A', 5, { tipus: 'Acord', origen: 'propi' });
    esc.escriureFilaGrup('GA1A', 6, { origen: 'propi' });
    esc.executar('reconciliarSistemaManualment');
    return esc;
  }

  await t.test('regla comuna per a les files sense ID i cap regla sense Tipus', () => {
    const esc = escenariAmbFiles();

    for (const fila of [3, 4, 5]) {
      const regla = reglaOrigen(esc, 'GA1A', fila);
      assert.equal(regla.criteri, 'VALUE_IN_RANGE', `fila ${fila}`);
      assert.equal(regla.permetInvalid, false, `fila ${fila}`);
    }
    assert.deepEqual(reglaOrigen(esc, 'GA1A', 3).interval, INTERVAL_CONTACTE);
    assert.deepEqual(reglaOrigen(esc, 'GA1A', 4).interval, INTERVAL_ACORD);
    assert.deepEqual(reglaOrigen(esc, 'GA1A', 5).interval, INTERVAL_ACORD);
    // La reconciliació ha esborrat l'Origen de la fila sense Tipus.
    assert.equal(reglaOrigen(esc, 'GA1A', 6), null);
    assert.equal(reglaOrigen(esc, 'GA1A', 101), null);

    // Mateixes regles en una edició d'una sola cel·la.
    const full = esc.fullGrup('GA2A');
    esc.editar(full, 3, 'Tipus', 'Contacte');
    esc.editar(full, 4, 'Tipus', 'Acord');
    assert.deepEqual(reglaOrigen(esc, 'GA2A', 3).interval, INTERVAL_CONTACTE);
    assert.deepEqual(reglaOrigen(esc, 'GA2A', 4).interval, INTERVAL_ACORD);
  });

  await t.test('regla individual amb l\'ID actual per a les files amb ID', () => {
    const esc = escenariAmbFiles();

    const acord = reglaOrigen(esc, 'GA1A', 2);
    assert.equal(acord.criteri, 'VALUE_IN_LIST');
    assert.deepEqual(acord.valors, ['propi', 1, 3, 7, 8]);
    assert.equal(acord.permetInvalid, false);

    // Mateixa regla en una edició d'una sola cel·la.
    const full = esc.fullGrup('GA2A');
    esc.editar(full, 2, 'Tipus', 'Contacte');
    esc.editar(full, 2, 'Origen', '3');
    assert.deepEqual(reglaOrigen(esc, 'GA2A', 2).valors, [1, 7, 3]);

    esc.esborrar(full, 2, 'Tipus');
    assert.equal(reglaOrigen(esc, 'GA2A', 2), null);
  });

  await t.test(`cap regla si la llista supera ${MAX_INDIVIDUAL_DROPDOWN_ITEMS} opcions`, () => {
    // propi + 448 Pendent + l'ID actual = 450 opcions: encara hi ha regla.
    const alLimit = new Escenari({
      ofertes: ofertesPendents(449),
      grups: { GA1A: [{ tipus: 'Acord', origen: 449 }] }
    });
    assert.equal(reglaOrigen(alLimit, 'GA1A', 2).valors.length, MAX_INDIVIDUAL_DROPDOWN_ITEMS);

    // propi + 449 Pendent + l'ID actual = 451 opcions: sense regla.
    const perSobre = new Escenari({
      ofertes: ofertesPendents(450),
      grups: { GA1A: [{ tipus: 'Acord', origen: 450 }] }
    });
    assert.equal(perSobre.oferta(450).estat, 'Assignada');
    assert.equal(reglaOrigen(perSobre, 'GA1A', 2), null);

    // També en una edició d'una sola cel·la, i la reserva continua controlada.
    const full = perSobre.fullGrup('GA1B');
    perSobre.editar(full, 2, 'Tipus', 'Contacte');
    perSobre.editar(full, 2, 'Origen', '1');
    assert.equal(perSobre.oferta(1).estat, 'Contactada');
    assert.deepEqual(reglaOrigen(perSobre, 'GA1B', 2).valors.length, 449);

    perSobre.editar(perSobre.fullGrup('GA1C'), 2, 'Tipus', 'Acord');
    perSobre.editar(perSobre.fullGrup('GA1C'), 2, 'Origen', '2');
    assert.equal(perSobre.oferta(2).estat, 'Assignada');
    // propi + 447 Pendent + 2 = 449: torna a haver-hi regla.
    assert.equal(reglaOrigen(perSobre, 'GA1C', 2).valors.length, 449);
  });
});
