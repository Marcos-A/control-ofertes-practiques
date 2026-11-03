'use strict';

/*
 * Proves de caracterització de les edicions als fulls de grup (TODO.md,
 * secció 2.4). Corresponen a la llista de proves manuals del README.
 *
 * Cada edició simulada és una execució nova del trigger, com a Apps Script.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Escenari, ofertaDeMostra, dadesEmpresaDe } = require('./harness/escenari');

const BUIT = Object.freeze({
  personaContacte: '', correu: '', telefon: '', adreca: '', localitat: '', nomEmpresa: ''
});

const MANUALS = Object.freeze({
  personaContacte: 'Persona manual', correu: 'manual@exemple.cat', telefon: '931111111',
  adreca: 'Carrer manual', localitat: 'Localitat manual', nomEmpresa: 'Empresa manual'
});

const AVIS_OCUPAT = 'El sistema està ocupat. Torna-ho a provar d\'aquí uns segons.';

// Tres ofertes Pendent, una Esperant informació i una Descartada.
function nouEscenari(opcions = {}) {
  return new Escenari({
    ofertes: [
      ofertaDeMostra(1),
      ofertaDeMostra(2),
      ofertaDeMostra(3),
      ofertaDeMostra(4, { estat: 'Esperant informació' }),
      ofertaDeMostra(5, { estat: 'Descartada' })
    ],
    ...opcions
  });
}

function dadesEmpresaFila(esc, grup, fila) {
  const { personaContacte, correu, telefon, adreca, localitat, nomEmpresa } = esc.filaGrup(grup, fila);
  return { personaContacte, correu, telefon, adreca, localitat, nomEmpresa };
}

function mateixDia(a, b) {
  return a instanceof Date && a.toDateString() === b.toDateString();
}

function idsPublicats(esc) {
  return esc.ofertesPublicades().map(fila => fila[0]);
}

function estatMestre(esc) {
  return [1, 2, 3, 4, 5].map(id => esc.oferta(id));
}

// Tipus i Origen introduïts per l'usuari, un després de l'altre.
function triar(esc, grup, fila, tipus, origen) {
  const full = esc.fullGrup(grup);
  esc.editar(full, fila, 'Tipus', tipus);
  esc.editar(full, fila, 'Origen', String(origen));
}


test('Contacte + ID Pendent reserva l\'oferta i copia les dades de l\'empresa', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Contacte', 1);

  const oferta = esc.oferta(1);
  assert.equal(oferta.estat, 'Contactada');
  assert.equal(oferta.gestionada, 'GA1A');
  assert.ok(mateixDia(oferta.dataContacte, new Date()), 'Data contacte ha de ser avui');

  // Les 6 dades, incloses Telèfon i Localitat (regressió v9).
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));

  assert.deepEqual(idsPublicats(esc), [2, 3]);
  assert.deepEqual(esc.avisos(), []);
});

test('Contacte → Acord passa l\'oferta a Assignada i conserva Data contacte', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Contacte', 1);
  // Un contacte iniciat fa dies: si la data es reiniciés, seria la d'avui.
  const dataContacte = new Date(2026, 8, 15);
  esc.escriureOferta(2, { dataContacte });

  esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Acord');

  const oferta = esc.oferta(1);
  assert.equal(oferta.estat, 'Assignada');
  assert.equal(oferta.gestionada, 'GA1A');
  assert.ok(oferta.dataContacte instanceof Date);
  assert.equal(oferta.dataContacte.getTime(), dataContacte.getTime());
  assert.equal(esc.filaGrup('GA1A', 2).origen, 1);
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));

  // I en tornar a Contacte, el rellotge de Dies en contacte no es reinicia.
  esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Contacte');

  assert.equal(esc.oferta(1).estat, 'Contactada');
  assert.equal(esc.oferta(1).dataContacte.getTime(), dataContacte.getTime());
});

test('Acord + ID directe passa l\'oferta a Assignada sense Data contacte', () => {
  const esc = nouEscenari();
  triar(esc, 'GA2B', 7, 'Acord', 2);

  const oferta = esc.oferta(2);
  assert.equal(oferta.estat, 'Assignada');
  assert.equal(oferta.gestionada, 'GA2B');
  assert.equal(oferta.dataContacte, '');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA2B', 7), dadesEmpresaDe(ofertaDeMostra(2)));
  assert.deepEqual(idsPublicats(esc), [1, 3]);
});

test('Acord + propi no toca el mestre i conserva les dades manuals', () => {
  const esc = nouEscenari();
  esc.escriureFilaGrup('GA1A', 2, { ...MANUALS });
  const mestre = estatMestre(esc);

  triar(esc, 'GA1A', 2, 'Acord', 'propi');

  assert.deepEqual(estatMestre(esc), mestre);
  assert.equal(esc.filaGrup('GA1A', 2).origen, 'propi');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), MANUALS);
  assert.deepEqual(esc.avisos(), []);
});

test('Contacte + propi es rebutja i es restaura el valor anterior', async t => {
  await t.test('sense valor anterior, Origen queda buit', () => {
    const esc = nouEscenari();
    const mestre = estatMestre(esc);
    triar(esc, 'GA1A', 2, 'Contacte', 'propi');

    assert.equal(esc.filaGrup('GA1A', 2).origen, '');
    assert.deepEqual(estatMestre(esc), mestre);
    assert.deepEqual(esc.avisos(), ['Un Contacte ha de tenir com a origen una oferta Pendent.']);
  });

  await t.test('amb una oferta reservada, es conserva la reserva', () => {
    const esc = nouEscenari();
    triar(esc, 'GA1A', 2, 'Contacte', 1);
    const mestre = estatMestre(esc);
    esc.reiniciarRegistres();

    esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', 'propi');

    assert.equal(esc.filaGrup('GA1A', 2).origen, 1);
    assert.deepEqual(estatMestre(esc), mestre);
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));
    assert.deepEqual(esc.avisos(), ['Un Contacte ha de tenir com a origen una oferta Pendent.']);
  });
});

test('canviar l\'ID d\'Origen per un altre de Pendent allibera l\'antic i reserva el nou', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Acord', 1);

  esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', '3');

  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Pendent', '']);
  assert.deepEqual([esc.oferta(3).estat, esc.oferta(3).gestionada], ['Assignada', 'GA1A']);
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(3)));
  assert.deepEqual(idsPublicats(esc), [1, 2]);
});

test('triar un ID no disponible es rebutja i el mestre no canvia', async t => {
  const casos = [
    ['Esperant informació', 4, 'L\'oferta 4 no està Pendent i no es pot seleccionar.'],
    ['Descartada', 5, 'L\'oferta 5 no està Pendent i no es pot seleccionar.'],
    ['inexistent', 99, 'L\'oferta 99 no està Pendent i no es pot seleccionar.'],
    ['reservada per un altre grup', 1, 'L\'oferta 1 no està Pendent i no es pot seleccionar.']
  ];

  for (const [nom, id, avis] of casos) {
    await t.test(nom, () => {
      const esc = nouEscenari();
      triar(esc, 'GA1B', 3, 'Acord', 1);
      esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Contacte');
      const mestre = estatMestre(esc);
      esc.reiniciarRegistres();

      esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', String(id));

      assert.equal(esc.filaGrup('GA1A', 2).origen, '');
      assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), BUIT);
      assert.deepEqual(estatMestre(esc), mestre);
      assert.deepEqual(esc.avisos(), [avis]);
    });
  }

});

test('una referència sense reserva en un altre grup no impedeix reservar l\'oferta', () => {
  const esc = nouEscenari();
  // Resta d'una incoherència prèvia: una referència a la 2 que no s'ha reservat.
  esc.escriureFilaGrup('GA2A', 4, { tipus: 'Acord', origen: 2 });
  esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Acord');
  esc.reiniciarRegistres();

  esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', '2');

  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada], ['Assignada', 'GA1A']);
  assert.deepEqual(esc.avisos(), []);

  // La reconciliació conserva la reserva i neteja la resta.
  esc.executar('reconciliarSistemaManualment');
  assert.equal(esc.filaGrup('GA1A', 2).origen, 2);
  assert.equal(esc.filaGrup('GA2A', 4).origen, '');
  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada], ['Assignada', 'GA1A']);
});

test('esborrar Origen o Tipus retorna l\'oferta a Pendent i esborra les dades de la fila', async t => {
  for (const columna of ['Origen', 'Tipus']) {
    await t.test(`esborrar ${columna}`, () => {
      const esc = nouEscenari();
      triar(esc, 'GA1A', 2, 'Contacte', 1);

      esc.esborrar(esc.fullGrup('GA1A'), 2, columna);

      const oferta = esc.oferta(1);
      assert.deepEqual([oferta.estat, oferta.gestionada, oferta.dataContacte], ['Pendent', '', '']);
      assert.equal(esc.filaGrup('GA1A', 2).origen, '');
      assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), BUIT);
      assert.deepEqual(idsPublicats(esc), [1, 2, 3]);
    });
  }
});

test('Origen sense Tipus es rebutja amb «Selecciona primer el Tipus»', () => {
  const esc = nouEscenari();
  const mestre = estatMestre(esc);

  esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', '1');

  assert.equal(esc.filaGrup('GA1A', 2).origen, '');
  assert.deepEqual(estatMestre(esc), mestre);
  assert.deepEqual(esc.avisos(), ['Selecciona primer el Tipus.']);
});

test('amb el sistema ocupat es restaura el valor anterior, s\'avisa i el mestre no canvia', async t => {
  await t.test('edició d\'Origen', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Contacte');
    const mestre = estatMestre(esc);
    esc.reiniciarRegistres();
    esc.mon.bloqueig.ocupat = true;

    esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', '1');

    assert.equal(esc.filaGrup('GA1A', 2).origen, '');
    assert.deepEqual(estatMestre(esc), mestre);
    assert.deepEqual(esc.avisos(), [AVIS_OCUPAT]);
    assert.equal(esc.mon.bloqueig.intentsFallits, 1);
  });

  await t.test('edició de Tipus', () => {
    const esc = nouEscenari();
    triar(esc, 'GA1A', 2, 'Contacte', 1);
    const mestre = estatMestre(esc);
    esc.reiniciarRegistres();
    esc.mon.bloqueig.ocupat = true;

    esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Acord');

    assert.equal(esc.filaGrup('GA1A', 2).tipus, 'Contacte');
    assert.deepEqual(estatMestre(esc), mestre);
    assert.deepEqual(esc.avisos(), [AVIS_OCUPAT]);
  });
});

test('una edició del full Ofertes el republica i avisa', () => {
  const esc = nouEscenari();
  const publicades = esc.ofertesPublicades();

  esc.editar(esc.fullOfertes, 2, 3, 'Text manual');
  esc.editar(esc.fullOfertes, 6, 1, '77');

  assert.deepEqual(esc.ofertesPublicades(), publicades);
  assert.deepEqual(esc.avisos(), [
    'La pestanya Ofertes es genera automàticament i no s\'ha d\'editar manualment.',
    'La pestanya Ofertes es genera automàticament i no s\'ha d\'editar manualment.'
  ]);
});


/********************************************************
 * EDICIONS MÚLTIPLES I CANVIS ESTRUCTURALS
 ********************************************************/

test('esborrar un rang de diverses files retorna totes les ofertes a Pendent', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Contacte', 1);
  triar(esc, 'GA1A', 3, 'Acord', 2);
  triar(esc, 'GA1A', 4, 'Acord', 3);
  esc.reiniciarRegistres();

  esc.esborrar(esc.fullGrup('GA1A'), 2, 'Tipus', 3, 2);

  for (const id of [1, 2, 3]) {
    const oferta = esc.oferta(id);
    assert.deepEqual([oferta.estat, oferta.gestionada, oferta.dataContacte], ['Pendent', '', ''], `oferta ${id}`);
  }
  for (const fila of [2, 3, 4]) {
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', fila), BUIT, `fila ${fila}`);
  }
  assert.deepEqual(idsPublicats(esc), [1, 2, 3]);
  assert.deepEqual(esc.avisos(), []);
});

test('enganxar el mateix ID en dos grups només conserva l\'ús del grup que la gestionava', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Acord', 1);

  esc.enganxar(esc.fullGrup('GA2A'), 5, 'Tipus', [['Acord', 1]]);

  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Assignada', 'GA1A']);
  assert.equal(esc.filaGrup('GA1A', 2).origen, 1);
  assert.equal(esc.filaGrup('GA2A', 5).origen, '');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA2A', 5), BUIT);
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));
});

test('enganxar diverses files amb ID Pendent les reserva totes', () => {
  const esc = nouEscenari();

  esc.enganxar(esc.fullGrup('GA1C'), 2, 'Tipus', [['Contacte', 1], ['Acord', 2], ['Acord', 'propi']]);

  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Contactada', 'GA1C']);
  assert.ok(mateixDia(esc.oferta(1).dataContacte, new Date()));
  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada], ['Assignada', 'GA1C']);
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1C', 2), dadesEmpresaDe(ofertaDeMostra(1)));
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1C', 3), dadesEmpresaDe(ofertaDeMostra(2)));
  assert.deepEqual(idsPublicats(esc), [3]);

  // Les validacions d'Origen de les files enganxades s'han refet.
  const full = esc.fullGrup('GA1C');
  const colOrigen = esc.columna(full, 'Origen');
  assert.deepEqual(full.getRange(2, colOrigen).getDataValidation().valors, [3, 1]);
  assert.deepEqual(full.getRange(3, colOrigen).getDataValidation().valors, ['propi', 3, 2]);
  assert.equal(full.getRange(4, colOrigen).getDataValidation().criteri, 'VALUE_IN_RANGE');
});

test('eliminar físicament una fila deixa l\'oferta òrfena i la retorna a Pendent', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Acord', 1);
  triar(esc, 'GA1A', 3, 'Acord', 2);

  esc.eliminarFiles(esc.fullGrup('GA1A'), 2);

  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Pendent', '']);
  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada], ['Assignada', 'GA1A']);
  assert.equal(esc.filaGrup('GA1A', 2).origen, 2);
  assert.deepEqual(idsPublicats(esc), [1, 3]);
  // El full de grup continua tenint lloc per a 100 files de dades.
  assert.ok(esc.fullGrup('GA1A').getMaxRows() >= 101);
});

test('edició múltiple amb el bloqueig ocupat: la propera execució de qualsevol trigger reconcilia', async t => {
  const PROPIETAT = 'PRACTIQUES_RECONCILIACIO_PENDENT';
  const seguents = {
    'una edició al compartit': esc => esc.editar(esc.fullGrup('GA2B'), 9, 'Nom estudiant', 'Estudiant'),
    'una edició al mestre': esc => esc.editar(esc.fullMestre, 4, 'Comentaris', 'Comentari'),
    'un canvi estructural': esc => esc.inserirFilesDespres(esc.fullGrup('GA2B'), 50)
  };

  for (const [nom, seguent] of Object.entries(seguents)) {
    await t.test(nom, () => {
      const esc = nouEscenari();
      esc.mon.bloqueig.ocupat = true;

      esc.enganxar(esc.fullGrup('GA1A'), 2, 'Tipus', [['Acord', 1]]);

      assert.equal(esc.mon.propietats.get(PROPIETAT), 'true');
      assert.equal(esc.oferta(1).estat, 'Pendent');
      assert.deepEqual(esc.avisos(), [
        'No s\'ha pogut reconciliar ara. Es reconciliarà automàticament en la propera acció.'
      ]);

      esc.mon.bloqueig.ocupat = false;
      seguent(esc);

      assert.equal(esc.mon.propietats.has(PROPIETAT), false);
      assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Assignada', 'GA1A']);
      assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));
      assert.deepEqual(idsPublicats(esc), [2, 3]);
    });
  }
});

test('les dades de text de l\'oferta es copien al grup tal com són al mestre', async t => {
  // Regressió: setValue interpretava el text com si s'hagués teclejat i es
  // perdien els zeros inicials i el signe +, o el text es convertia en fórmula.
  const literals = {
    telefon: '0034930000001',
    localitat: '+34 Localitat',
    personaContacte: '=Persona',
    correu: '0034@exemple.cat',
    adreca: '08001',
    empresa: '+34930000001'
  };
  const esperat = dadesEmpresaDe(ofertaDeMostra(1, literals));
  assert.equal(esperat.telefon, '0034930000001');

  function escenari() {
    return new Escenari({ ofertes: [ofertaDeMostra(1, literals), ofertaDeMostra(2)] });
  }

  await t.test('en reservar l\'oferta', () => {
    const esc = escenari();
    triar(esc, 'GA1A', 2, 'Contacte', 1);
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), esperat);
    assert.equal(esc.fullGrup('GA1A').getRange(2, esc.columna(esc.fullGrup('GA1A'), 'Persona contacte')).getFormula(), '');
  });

  await t.test('en editar una dada al mestre', () => {
    const esc = escenari();
    triar(esc, 'GA1A', 2, 'Acord', 1);
    esc.escriureOferta(2, { telefon: '0034930000002' });
    esc.editar(esc.fullMestre, 2, 'Comentaris', 'Comentari');
    assert.equal(esc.filaGrup('GA1A', 2).telefon, '0034930000002');
  });

  await t.test('en reconciliar', () => {
    const esc = escenari();
    esc.escriureFilaGrup('GA1A', 2, { tipus: 'Acord', origen: 1 });
    esc.executar('reconciliarSistemaManualment');
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), esperat);

    // I una segona reconciliació no les torna a escriure.
    esc.reiniciarRegistres();
    esc.executar('reconciliarDesDelCompartitSenseLock_');
    assert.equal(esc.comptador.escriptures(), 0);
  });
});

test('les dades de l\'empresa es copien i s\'esborren bé encara que les columnes s\'hagin mogut', () => {
  // Columnes desordenades i una columna aliena enmig de les de l'empresa.
  const esc = nouEscenari({
    capcaleresGrup: [
      'Nom estudiant', 'Telèfon', 'Origen', 'Localitat', 'Persona contacte', 'Data inici',
      'Correu', 'Tipus', 'Nom empresa', 'Hores completades', 'Adreça', 'NIF empresa',
      'Conveni signat i retornat'
    ]
  });
  esc.escriureFilaGrup('GA1A', 2, { nomEstudiant: 'Estudiant', dataInici: 'Setembre' });

  triar(esc, 'GA1A', 2, 'Acord', 1);
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));
  assert.equal(esc.filaGrup('GA1A', 2).nomEstudiant, 'Estudiant');

  esc.editar(esc.fullGrup('GA1A'), 2, 'Origen', '2');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(2)));

  esc.esborrar(esc.fullGrup('GA1A'), 2, 'Origen');
  assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), BUIT);
  const fila = esc.filaGrup('GA1A', 2);
  assert.deepEqual([fila.nomEstudiant, fila.tipus], ['Estudiant', 'Acord']);
  assert.equal(esc.fullGrup('GA1A')._valor(2, esc.columna(esc.fullGrup('GA1A'), 'Data inici')), 'Setembre');
});

test('Tipus i Origen només es gestionen a les files 2 a 101', async t => {
  const AVIS = 'Només es poden registrar contactes i acords a les files 2 a 101.';

  await t.test('una reserva a la fila 102 es rebutja', () => {
    const esc = nouEscenari();
    const full = esc.fullGrup('GA1A');

    esc.editar(full, 102, 'Tipus', 'Contacte');
    esc.editar(full, 102, 'Origen', '1');

    assert.deepEqual(metadadesOferta(esc.oferta(1)), ['Pendent', '']);
    assert.deepEqual([esc.filaGrup('GA1A', 102).tipus, esc.filaGrup('GA1A', 102).origen], ['', '']);
    assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 102), BUIT);
    assert.deepEqual(esc.avisos(), [AVIS, AVIS]);

    // La reconciliació no hi troba res a desfer.
    esc.executar('reconciliarSistemaManualment');
    assert.equal(esc.oferta(1).estat, 'Pendent');
  });

  await t.test('la fila 101 encara es gestiona', () => {
    const esc = nouEscenari();
    triar(esc, 'GA1A', 101, 'Acord', 1);
    assert.deepEqual(metadadesOferta(esc.oferta(1)), ['Assignada', 'GA1A']);
    assert.deepEqual(esc.avisos(), []);
  });

  await t.test('les altres columnes de les files següents no es toquen', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullGrup('GA1A'), 150, 'Nom estudiant', 'Estudiant');
    assert.equal(esc.filaGrup('GA1A', 150).nomEstudiant, 'Estudiant');
    assert.deepEqual(esc.avisos(), []);
  });
});

function metadadesOferta(oferta) {
  return [oferta.estat, oferta.gestionada];
}

/*
 * Dues seleccions gairebé simultànies: la segona arriba al full abans que
 * s'hagi executat el trigger de la primera. Els triggers s'executen en
 * l'ordre de les edicions, i el primer obté el bloqueig.
 */
function seleccionarAlhora(esc, primera, segona, id) {
  const ordre = [primera, segona].map(([grup, fila]) => {
    const full = esc.fullGrup(grup);
    const col = esc.columna(full, 'Origen');
    full._establir(fila, col, id);
    return { full, fila, col };
  });
  ordre.forEach(({ full, fila, col }) => esc.carregar().gestionarEdicioCompartit({
    range: esc.comptador.senseComptar(() => full.getRange(fila, col)),
    value: String(id),
    oldValue: undefined,
    source: esc.compartit,
    authMode: 'FULL',
    triggerUid: 'proves'
  }));
}

test('dues seleccions simultànies de la mateixa oferta: guanya la primera', async t => {
  for (const tipus of ['Contacte', 'Acord']) {
    await t.test(tipus, () => {
      const esc = nouEscenari();
      esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', tipus);
      esc.editar(esc.fullGrup('GA1B'), 5, 'Tipus', tipus);
      esc.reiniciarRegistres();

      // Regressió: la selecció de GA1B, encara sense processar, feia que GA1A
      // es rebutgés, i l'oferta acabava a GA1B.
      seleccionarAlhora(esc, ['GA1A', 2], ['GA1B', 5], 1);

      assert.equal(esc.oferta(1).gestionada, 'GA1A');
      assert.equal(esc.filaGrup('GA1A', 2).origen, 1);
      assert.deepEqual(dadesEmpresaFila(esc, 'GA1A', 2), dadesEmpresaDe(ofertaDeMostra(1)));
      assert.equal(esc.filaGrup('GA1B', 5).origen, '');
      assert.deepEqual(dadesEmpresaFila(esc, 'GA1B', 5), BUIT);
      assert.deepEqual(esc.avisos(), ['L\'oferta 1 no està Pendent i no es pot seleccionar.']);

      assert.deepEqual([...esc.executar('auditarSistema')], []);
    });
  }
});

test('dues seleccions simultànies: alliberar una oferta no s\'impedeix per la selecció d\'un altre grup', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Contacte', 1);
  esc.editar(esc.fullGrup('GA1B'), 5, 'Tipus', 'Contacte');
  esc.reiniciarRegistres();

  // GA1A canvia la 1 per la 2 i, abans que es processi, GA1B tria la 1.
  const fullA = esc.fullGrup('GA1A');
  const fullB = esc.fullGrup('GA1B');
  fullA._establir(2, esc.columna(fullA, 'Origen'), 2);
  fullB._establir(5, esc.columna(fullB, 'Origen'), 1);
  esc.carregar().gestionarEdicioCompartit({
    range: fullA.getRange(2, esc.columna(fullA, 'Origen')), value: '2', oldValue: '1',
    source: esc.compartit, authMode: 'FULL', triggerUid: 'proves'
  });
  esc.carregar().gestionarEdicioCompartit({
    range: fullB.getRange(5, esc.columna(fullB, 'Origen')), value: '1', oldValue: undefined,
    source: esc.compartit, authMode: 'FULL', triggerUid: 'proves'
  });

  // La 1 s'ha alliberat en canviar-la GA1A i després l'ha reservada GA1B.
  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Contactada', 'GA1B']);
  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada], ['Contactada', 'GA1A']);
  assert.deepEqual([...esc.executar('auditarSistema')], []);
});

test('dues edicions simultànies: el canvi de Tipus del grup que la gestiona no es bloqueja', () => {
  const esc = nouEscenari();
  triar(esc, 'GA1A', 2, 'Contacte', 1);
  esc.editar(esc.fullGrup('GA1B'), 5, 'Tipus', 'Acord');
  esc.reiniciarRegistres();

  // GA1B tria la 1 i, abans que es processi, GA1A passa el Contacte a Acord.
  const fullB = esc.fullGrup('GA1B');
  const colB = esc.columna(fullB, 'Origen');
  fullB._establir(5, colB, 1);
  esc.editar(esc.fullGrup('GA1A'), 2, 'Tipus', 'Acord');
  esc.carregar().gestionarEdicioCompartit({
    range: fullB.getRange(5, colB), value: '1', oldValue: undefined,
    source: esc.compartit, authMode: 'FULL', triggerUid: 'proves'
  });

  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Assignada', 'GA1A']);
  assert.equal(esc.filaGrup('GA1B', 5).origen, '');
  assert.deepEqual(esc.avisos(), ['L\'oferta 1 no està Pendent i no es pot seleccionar.']);
});
