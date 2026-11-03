'use strict';

/*
 * Proves de caracterització de les edicions al full mestre (TODO.md,
 * secció 2.4). Les ofertes 1 a 5 ocupen les files 2 a 6 del mestre.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Escenari, ofertaDeMostra, dadesEmpresaDe } = require('./harness/escenari');

const AVIS_CAMPS_SISTEMA = 'Gestionada per, Data contacte i Dies en contacte són camps gestionats automàticament.';
const AVIS_ESTATS_ACTIUS = 'Contactada i Assignada són estats gestionats automàticament des dels fulls de grup.';
const AVIS_DUPLICATS_MULTIPLES = 'S\'ha revisat l\'edició múltiple de camps del sistema. Els ID duplicats introduïts s\'han descartat preservant sempre el registre preexistent.';

const DATA_ANTIGA = new Date(2026, 8, 15);

function nouEscenari() {
  return new Escenari({
    ofertes: [
      ofertaDeMostra(1),
      ofertaDeMostra(2),
      ofertaDeMostra(3),
      ofertaDeMostra(4, { estat: 'Esperant informació' }),
      ofertaDeMostra(5, { estat: 'Descartada' })
    ]
  });
}

// Reserva l'oferta des d'un grup, com ho faria el tutor.
function reservar(esc, grup, fila, tipus, id) {
  const full = esc.fullGrup(grup);
  esc.editar(full, fila, 'Tipus', tipus);
  esc.editar(full, fila, 'Origen', String(id));
}

function filaDeId(id) {
  return id + 1;
}

function idsPublicats(esc) {
  return esc.ofertesPublicades().map(fila => fila[0]);
}

function metadades(oferta) {
  return [oferta.estat, oferta.gestionada, oferta.dataContacte];
}

function formulaDies(esc, fila) {
  const full = esc.fullMestre;
  return full.getRange(fila, esc.columna(full, 'Dies en contacte')).getFormulaR1C1();
}

// Nombre de sèrie de Sheets d'una data (el que arriba a e.oldValue).
function numeroDeSerie(data) {
  return (data.getTime() - Date.UTC(1899, 11, 30)) / 86400000 - data.getTimezoneOffset() / 1440;
}


test('editar Gestionada per, Data contacte o Dies en contacte es desfà i s\'avisa', async t => {
  await t.test('Gestionada per', () => {
    const esc = nouEscenari();
    reservar(esc, 'GA1A', 2, 'Contacte', 1);
    esc.reiniciarRegistres();

    esc.editar(esc.fullMestre, filaDeId(1), 'Gestionada per', 'GA2B');

    assert.equal(esc.oferta(1).gestionada, 'GA1A');
    assert.deepEqual(esc.avisos(), [AVIS_CAMPS_SISTEMA]);
  });

  await t.test('Gestionada per buida', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(2), 'Gestionada per', 'GA2B');

    assert.equal(esc.oferta(2).gestionada, '');
    assert.deepEqual(esc.avisos(), [AVIS_CAMPS_SISTEMA]);
  });

  await t.test('Data contacte', () => {
    const esc = nouEscenari();
    reservar(esc, 'GA1A', 2, 'Contacte', 1);
    esc.escriureOferta(filaDeId(1), { dataContacte: DATA_ANTIGA });
    esc.reiniciarRegistres();

    esc.editar(esc.fullMestre, filaDeId(1), 'Data contacte', '01/11/2026');

    // L'script restaura e.oldValue, que és el nombre de sèrie de la data.
    // Sheets el mostra com a data perquè la cel·la en conserva el format; el
    // doble no aplica formats i el retorna com a nombre.
    assert.equal(esc.oferta(1).dataContacte, numeroDeSerie(DATA_ANTIGA));
    assert.deepEqual(esc.avisos(), [AVIS_CAMPS_SISTEMA]);
  });

  await t.test('Dies en contacte', () => {
    const esc = nouEscenari();
    const formula = formulaDies(esc, filaDeId(3));
    assert.ok(formula, 'la instal·lació ha de posar la fórmula');

    esc.editar(esc.fullMestre, filaDeId(3), 'Dies en contacte', '12');

    assert.equal(esc.oferta(3).diesContacte, '');
    assert.equal(formulaDies(esc, filaDeId(3)), formula);
    assert.deepEqual(esc.avisos(), [AVIS_CAMPS_SISTEMA]);
  });
});

test('posar manualment Contactada o Assignada es rebutja', async t => {
  for (const estat of ['Contactada', 'Assignada']) {
    await t.test(estat, () => {
      const esc = nouEscenari();
      esc.editar(esc.fullMestre, filaDeId(2), 'Estat', estat);

      assert.deepEqual(metadades(esc.oferta(2)), ['Pendent', '', '']);
      assert.deepEqual(idsPublicats(esc), [1, 2, 3]);
      assert.deepEqual(esc.avisos(), [AVIS_ESTATS_ACTIUS]);
    });
  }

  await t.test('un estat que no és a la llista', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(2), 'Estat', 'Tancada');

    assert.equal(esc.oferta(2).estat, 'Pendent');
    assert.deepEqual(esc.avisos(), ['Estat no vàlid.']);
  });
});

test('canviar l\'estat d\'una oferta vinculada a un grup es rebutja', async t => {
  for (const [tipus, estat] of [['Contacte', 'Contactada'], ['Acord', 'Assignada']]) {
    await t.test(estat, () => {
      const esc = nouEscenari();
      reservar(esc, 'GA1A', 2, tipus, 1);
      const abans = esc.oferta(1);
      esc.reiniciarRegistres();

      esc.editar(esc.fullMestre, filaDeId(1), 'Estat', 'Descartada');

      assert.deepEqual(esc.oferta(1), abans);
      assert.deepEqual(esc.avisos(), [
        'L\'oferta 1 encara està vinculada a un grup. El tutor l\'ha d\'alliberar abans de canviar-ne l\'estat.'
      ]);
    });
  }
});

test('passar una oferta a Pendent, Esperant o Descartada esborra les metadades i republica', async t => {
  await t.test('Pendent → Descartada', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(2), 'Estat', 'Descartada');

    assert.deepEqual(metadades(esc.oferta(2)), ['Descartada', '', '']);
    assert.deepEqual(idsPublicats(esc), [1, 3]);
    assert.deepEqual(esc.avisos(), []);
  });

  await t.test('Esperant informació → Pendent', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(4), 'Estat', 'Pendent');

    assert.deepEqual(metadades(esc.oferta(4)), ['Pendent', '', '']);
    assert.deepEqual(idsPublicats(esc), [1, 2, 3, 4]);
  });

  await t.test('Pendent → Esperant informació', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(1), 'Estat', 'Esperant informació');

    assert.deepEqual(metadades(esc.oferta(1)), ['Esperant informació', '', '']);
    assert.deepEqual(idsPublicats(esc), [2, 3]);
  });

  await t.test('una oferta activa sense ús que la coordinació torna a Pendent', () => {
    const esc = nouEscenari();
    // Metadades sobrants: cap grup no la fa servir.
    esc.escriureOferta(filaDeId(2), { estat: 'Contactada', gestionada: 'GA1A', dataContacte: DATA_ANTIGA });

    esc.editar(esc.fullMestre, filaDeId(2), 'Estat', 'Pendent');

    assert.deepEqual(metadades(esc.oferta(2)), ['Pendent', '', '']);
    assert.ok(formulaDies(esc, filaDeId(2)));
    assert.deepEqual(idsPublicats(esc), [1, 2, 3]);
  });
});

test('un ID duplicat en una sola cel·la es rebutja i es conserva la fila preexistent', async t => {
  await t.test('ID que ja existeix', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(3), 'ID oferta', '1');

    assert.equal(esc.filaMestre(filaDeId(1)).id, 1);
    assert.equal(esc.filaMestre(filaDeId(3)).id, 3);
    assert.deepEqual(idsPublicats(esc), [1, 2, 3]);
    assert.deepEqual(esc.avisos(), ['L\'ID 1 ja existeix a la fila 2. S\'ha conservat el registre existent.']);
  });

  await t.test('ID que no és un enter positiu', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(3), 'ID oferta', 'abc');

    assert.equal(esc.filaMestre(filaDeId(3)).id, 3);
    assert.deepEqual(esc.avisos(), ['ID oferta ha de ser un enter positiu.']);
  });

  await t.test('un ID nou i únic s\'accepta i es publica', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(2), 'ID oferta', '60');

    assert.equal(esc.filaMestre(filaDeId(2)).id, 60);
    assert.deepEqual(idsPublicats(esc), [1, 3, 60]);
    assert.deepEqual(esc.avisos(), []);
  });
});

test('canviar l\'ID d\'una oferta vinculada es rebutja', () => {
  const esc = nouEscenari();
  reservar(esc, 'GA1A', 2, 'Acord', 1);
  esc.reiniciarRegistres();

  esc.editar(esc.fullMestre, filaDeId(1), 'ID oferta', '50');

  assert.equal(esc.filaMestre(filaDeId(1)).id, 1);
  assert.deepEqual([esc.oferta(1).estat, esc.oferta(1).gestionada], ['Assignada', 'GA1A']);
  assert.deepEqual(esc.avisos(), ['No es pot modificar l\'ID 1 perquè està vinculat a un grup.']);
});

test('enganxar diverses files amb ID duplicats només esborra les còpies dins del rang enganxat', () => {
  const esc = nouEscenari();

  // Files 8 a 11: un ID que ja existia, un ID nou repetit dues vegades i un altre de nou.
  esc.enganxar(esc.fullMestre, 8, 'ID oferta', [[1], [20], [20], [21]]);

  const ids = [2, 3, 4, 5, 6, 8, 9, 10, 11].map(fila => esc.filaMestre(fila).id);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, '', 20, '', 21]);
  assert.deepEqual(esc.avisos(), [AVIS_DUPLICATS_MULTIPLES]);
});

test('enganxar Estat Contactada o Assignada sense un ús coherent el torna a Pendent', () => {
  const esc = nouEscenari();
  reservar(esc, 'GA1A', 2, 'Acord', 1);
  reservar(esc, 'GA1B', 2, 'Contacte', 2);
  const reservada = esc.oferta(1);
  esc.reiniciarRegistres();

  // Files 2 a 4 (ofertes 1 a 3), columnes Estat i Gestionada per.
  esc.enganxar(esc.fullMestre, filaDeId(1), 'Estat', [
    ['Assignada', 'GA1A'],  // coherent amb l'Acord de GA1A
    ['Assignada', 'GA1B'],  // GA1B la té com a Contacte
    ['Contactada', 'GA2A']  // cap grup no la fa servir
  ]);

  assert.deepEqual(esc.oferta(1), reservada);
  assert.deepEqual([esc.oferta(2).estat, esc.oferta(2).gestionada, esc.oferta(2).dataContacte], ['Pendent', '', '']);
  assert.deepEqual([esc.oferta(3).estat, esc.oferta(3).gestionada], ['Pendent', '']);
  assert.deepEqual(idsPublicats(esc), [2, 3]);
});

test('ID automàtic: una fila nova amb contingut rep max(ID) + 1 i una fila buida no en rep', async t => {
  await t.test('edició d\'una cel·la', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, 10, 'Empresa', 'Empresa nova');
    esc.esborrar(esc.fullMestre, 12, 'Empresa');

    assert.equal(esc.filaMestre(10).id, 6);
    assert.equal(esc.filaMestre(12).id, '');
    assert.ok(formulaDies(esc, 10));
  });

  await t.test('enganxar diverses files', () => {
    const esc = nouEscenari();
    esc.enganxar(esc.fullMestre, 10, 'Empresa', [
      ['Empresa A', 'Persona A'],
      ['', ''],
      ['Empresa B', 'Persona B']
    ]);

    assert.deepEqual([10, 11, 12].map(fila => esc.filaMestre(fila).id), [6, '', 7]);
  });
});

test('editar les dades d\'una oferta activa les propaga a la fila del grup', async t => {
  await t.test('regressió v9: Telèfon i Localitat incloses', () => {
    const esc = nouEscenari();
    reservar(esc, 'GA1A', 4, 'Contacte', 1);

    esc.editar(esc.fullMestre, filaDeId(1), 'Telèfon', '931234567');
    esc.editar(esc.fullMestre, filaDeId(1), 'Localitat', 'Localitat nova');
    esc.editar(esc.fullMestre, filaDeId(1), 'Empresa', 'Empresa nova');

    // El grup rep el que desa el mestre: el telèfon teclejat sense espais hi
    // queda com a nombre.
    const mestre = esc.oferta(1);
    assert.equal(mestre.telefon, 931234567);
    assert.deepEqual(dadesEmpresaDe(mestre), {
      ...dadesEmpresaDe(ofertaDeMostra(1)), telefon: 931234567, localitat: 'Localitat nova', nomEmpresa: 'Empresa nova'
    });

    const fila = esc.filaGrup('GA1A', 4);
    for (const [camp, valor] of Object.entries(dadesEmpresaDe(mestre))) {
      assert.deepEqual(fila[camp], valor, camp);
    }
    assert.deepEqual(esc.avisos(), []);
  });

  await t.test('una oferta Pendent es republica', () => {
    const esc = nouEscenari();
    esc.editar(esc.fullMestre, filaDeId(2), 'Tasques', 'Tasques noves');

    const publicada = esc.ofertesPublicades().find(fila => fila[0] === 2);
    assert.equal(publicada[2], 'Tasques noves');
  });
});

test('amb el sistema ocupat, un canvi d\'ID es desfà i s\'avisa', () => {
  const esc = nouEscenari();
  esc.mon.bloqueig.ocupat = true;

  esc.editar(esc.fullMestre, filaDeId(2), 'ID oferta', '60');

  assert.equal(esc.filaMestre(filaDeId(2)).id, 2);
  assert.deepEqual(esc.avisos(), ['El sistema està ocupat. Torna-ho a provar d\'aquí uns segons.']);
});
