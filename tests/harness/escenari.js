'use strict';

/*
 * Constructor de fixtures (mestre + 11 grups + Ofertes) i simuladors dels
 * esdeveniments que generen els usuaris: editar una cel·la, enganxar o
 * esborrar un rang i inserir o eliminar files.
 *
 * Les columnes es localitzen per capçalera, com fa l'script, de manera que
 * l'ordre de la fixture és indiferent. Les edicions simulades no apliquen les
 * validacions de dades: la prova decideix quin valor introdueix l'usuari.
 */

const { FakeSpreadsheet, interpretarValor, FILES_PER_DEFECTE } = require('./sheets-fake');
const { crearMon, registrarFitxer } = require('./serveis-fake');
const { carregarScript } = require('./carregar-script');

const ID_MESTRE = 'id-fitxer-mestre-proves';
const ID_COMPARTIT = 'id-fitxer-compartit-proves';

const FULL_MESTRE = 'Ofertes mestre';
const FULL_OFERTES = 'Ofertes';
const FULL_AUXILIAR = '_Sistema_Practiques';

const GRUPS = [
  'GA1A', 'GA1B', 'GA1C', 'GA2A', 'GA2B',
  'GAJ1', 'GAJ2', 'AF1M', 'AF1T', 'AF2M', 'AF2T'
];

// [camp de la fixture, capçalera]. L'ordre és el dels fitxers reals.
const COLUMNES_MESTRE = [
  ['id', 'ID oferta'],
  ['estat', 'Estat'],
  ['gestionada', 'Gestionada per'],
  ['dataContacte', 'Data contacte'],
  ['diesContacte', 'Dies en contacte'],
  ['empresa', 'Empresa'],
  ['personaContacte', 'Persona contacte'],
  ['correu', 'Correu electrònic'],
  ['telefon', 'Telèfon'],
  ['adreca', 'Adreça'],
  ['localitat', 'Localitat'],
  ['cicle', 'Cicle'],
  ['tasques', 'Tasques'],
  ['torn', 'Torn pràctiques'],
  ['dataIncorporacio', 'Data incorporació'],
  ['modalitat', 'Modalitat'],
  ['comentaris', 'Comentaris']
];

// Els fulls de grup reals tenen moltes més columnes que l'script no gestiona
// (dades de l'estudiant, dates, hores...). N'hi ha unes quantes de mostra
// perquè les proves cobreixin columnes alienes a l'script.
const COLUMNES_GRUP = [
  ['tipus', 'Tipus'],
  ['origen', 'Origen'],
  ['personaContacte', 'Persona contacte'],
  ['correu', 'Correu'],
  ['telefon', 'Telèfon'],
  ['adreca', 'Adreça'],
  ['localitat', 'Localitat'],
  ['nomEmpresa', 'Nom empresa'],
  ['nifEmpresa', 'NIF empresa'],
  ['nomEstudiant', 'Nom estudiant'],
  ['dataInici', 'Data inici'],
  ['horesCompletades', 'Hores completades'],
  ['conveniSignat', 'Conveni signat i retornat']
];

const CAPCALERES_OFERTES = [
  'ID oferta', 'Cicle', 'Tasques', 'Torn pràctiques',
  'Localitat', 'Data incorporació', 'Modalitat', 'Comentaris'
];

// Camps de l'oferta del mestre que es copien a la fila del grup.
const CAMPS_EMPRESA_GRUP = Object.freeze({
  personaContacte: 'personaContacte',
  correu: 'correu',
  telefon: 'telefon',
  adreca: 'adreca',
  localitat: 'localitat',
  nomEmpresa: 'empresa'
});


/*
 * Telèfons de mostra: no es pot suposar cap format. Es reparteixen entre les
 * tres formes que pot tenir una cel·la del mestre:
 *   - nombre: dígits seguits escrits en una cel·la amb format automàtic;
 *   - text només amb dígits: columna amb format de text o dades importades;
 *   - text amb espais.
 */
function telefonDeMostra(id) {
  const digits = `93000${String(id).padStart(4, '0')}`;
  switch (id % 3) {
    case 0: return Number(digits);
    case 1: return digits;
    default: return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
}

// Oferta de mostra amb totes les dades omplertes.
function ofertaDeMostra(id, camps = {}) {
  return {
    id,
    estat: 'Pendent',
    empresa: `Empresa ${id}`,
    personaContacte: `Persona ${id}`,
    correu: `contacte${id}@exemple.cat`,
    telefon: telefonDeMostra(id),
    adreca: `Carrer ${id}`,
    cicle: 'GA',
    tasques: `Tasques ${id}`,
    torn: 'Matí',
    localitat: `Localitat ${id}`,
    modalitat: 'Presencial',
    ...camps
  };
}

/*
 * Dades d'empresa que queden a la fila del grup quan l'script hi copia una
 * oferta: els mateixos valors que al mestre, també quan són text amb forma
 * de nombre (l'script els escriu com a text).
 */
function dadesEmpresaDe(oferta) {
  const dades = {};
  for (const [campGrup, campOferta] of Object.entries(CAMPS_EMPRESA_GRUP)) {
    dades[campGrup] = oferta[campOferta] || '';
  }
  return dades;
}


class Escenari {
  /*
   * opcions:
   *   ofertes:  [{ id, estat, ... }] files del mestre a partir de la fila 2
   *   grups:    { GA1A: [{ fila?, tipus, origen, ... }] }
   *   ometreFulls: noms de fulls del compartit que no s'han de crear
   *   capcaleresGrup: substitueix les capçaleres de tots els fulls de grup
   *   instal_lar: executa instal_larSistema() i reinicia els registres (per defecte, sí)
   */
  constructor(opcions = {}) {
    const {
      ofertes = [],
      grups = {},
      ometreFulls = [],
      capcaleresGrup = COLUMNES_GRUP.map(([, capcalera]) => capcalera),
      instal_lar = true
    } = opcions;

    this.mon = crearMon();
    this.mon.idMestre = ID_MESTRE;
    this.mon.idActiu = ID_COMPARTIT;
    this.comptador = this.mon.comptador;

    this.mestre = new FakeSpreadsheet(ID_MESTRE, 'Ofertes de pràctiques - Coordinació', this.comptador);
    this.compartit = new FakeSpreadsheet(ID_COMPARTIT, 'Gestió de pràctiques - Tutors', this.comptador);
    registrarFitxer(this.mon, this.mestre);
    registrarFitxer(this.mon, this.compartit);

    // Com a Sheets, el full creix si les dades no hi caben.
    const ultimaFilaMestre = Math.max(1, ...ofertes.map((oferta, i) => oferta.fila || i + 2));
    const fullMestre = this.mestre._afegirFull(FULL_MESTRE, Math.max(FILES_PER_DEFECTE, ultimaFilaMestre));
    escriureCapcaleres(fullMestre, COLUMNES_MESTRE.map(([, capcalera]) => capcalera));
    // Com al fitxer real, les columnes de dates del mestre tenen format de data.
    ['Data contacte', 'Data incorporació'].forEach(capcalera => {
      const col = COLUMNES_MESTRE.findIndex(([, c]) => c === capcalera) + 1;
      for (let fila = 2; fila <= fullMestre._maxFiles; fila++) {
        fullMestre._celaPerEscriure(fila, col).formatNumero = 'dd/MM/yyyy';
      }
    });

    if (!ometreFulls.includes(FULL_OFERTES)) {
      escriureCapcaleres(this.compartit._afegirFull(FULL_OFERTES), CAPCALERES_OFERTES);
    }
    GRUPS.forEach(grup => {
      if (ometreFulls.includes(grup)) return;
      escriureCapcaleres(this.compartit._afegirFull(grup), capcaleresGrup);
    });

    ofertes.forEach((oferta, i) => this.escriureOferta(oferta.fila || i + 2, oferta));
    Object.entries(grups).forEach(([grup, files]) => {
      files.forEach((dades, i) => this.escriureFilaGrup(grup, dades.fila || i + 2, dades));
    });

    if (instal_lar) {
      this.executar('instal_larSistema');
      this.reiniciarRegistres();
    }
  }

  // Fulls

  get fullMestre() {
    return this.mestre._fulls.find(full => full._nom === FULL_MESTRE);
  }

  get fullOfertes() {
    return this._fullCompartit(FULL_OFERTES);
  }

  get fullAuxiliar() {
    return this._fullCompartit(FULL_AUXILIAR);
  }

  fullGrup(grup) {
    return this._fullCompartit(grup);
  }

  // Columna (1-based) d'una capçalera, llegida sense comptar crides.
  columna(full, capcalera) {
    const capcaleres = full._fila(1);
    const index = capcaleres.findIndex(valor => String(valor).trim() === capcalera);
    if (index < 0) throw new Error(`El full "${full._nom}" no té la capçalera "${capcalera}".`);
    return index + 1;
  }

  // Lectura i escriptura de la fixture (sense comptar crides)

  escriureOferta(fila, oferta) {
    const full = this.fullMestre;
    COLUMNES_MESTRE.forEach(([camp, capcalera]) => {
      if (camp in oferta) full._establir(fila, this.columna(full, capcalera), oferta[camp]);
    });
  }

  escriureFilaGrup(grup, fila, dades) {
    const full = this.fullGrup(grup);
    COLUMNES_GRUP.forEach(([camp, capcalera]) => {
      if (camp in dades) full._establir(fila, this.columna(full, capcalera), dades[camp]);
    });
  }

  // Oferta del mestre per ID (primera aparició), com a objecte.
  oferta(id) {
    const full = this.fullMestre;
    const columnaId = this.columna(full, 'ID oferta');
    for (let fila = 2; fila <= full._files.length; fila++) {
      if (full._valor(fila, columnaId) === id) return this.filaMestre(fila);
    }
    return null;
  }

  filaMestre(fila) {
    return llegirFila(this, this.fullMestre, fila, COLUMNES_MESTRE);
  }

  filaGrup(grup, fila) {
    return llegirFila(this, this.fullGrup(grup), fila, COLUMNES_GRUP);
  }

  // Contingut publicat a Ofertes (sense la capçalera ni les files buides).
  ofertesPublicades() {
    const full = this.fullOfertes;
    const files = [];
    for (let fila = 2; fila <= full._files.length; fila++) {
      const valors = full._fila(fila, CAPCALERES_OFERTES.length);
      if (valors.some(v => v !== '')) files.push(valors);
    }
    return files;
  }

  // Execució

  // Crea un context nou (una execució d'Apps Script) i el retorna.
  carregar(opcions) {
    return carregarScript(this.mon, opcions);
  }

  executar(nomFuncio, ...args) {
    return this.carregar()[nomFuncio](...args);
  }

  avisos() {
    return [...this.mestre._avisos, ...this.compartit._avisos].map(avis => avis.missatge);
  }

  reiniciarRegistres() {
    this.comptador.reiniciar();
    this.mestre._avisos = [];
    this.compartit._avisos = [];
    this.mon.registre = [];
  }

  // Simuladors d'esdeveniments

  /*
   * Edició d'una sola cel·la per l'usuari. La cel·la desa el valor
   * interpretat ("5" -> 5), mentre que e.value i e.oldValue són cadenes, o
   * undefined si la cel·la queda o era buida. columna: número o capçalera.
   */
  editar(full, fila, columna, valor) {
    const col = typeof columna === 'string' ? this.columna(full, columna) : columna;
    const anterior = full._valor(fila, col);
    const buit = valor === '' || valor === null || valor === undefined;

    full._establir(fila, col, buit ? '' : interpretarValor(valor));

    return this._dispararEdicio(full, {
      range: this.comptador.senseComptar(() => full.getRange(fila, col)),
      value: buit ? undefined : String(valor),
      oldValue: valorEsdeveniment(anterior)
    });
  }

  // Enganxa una matriu a partir de (fila, columna): e.value i e.oldValue són undefined.
  enganxar(full, fila, columna, matriu) {
    const col = typeof columna === 'string' ? this.columna(full, columna) : columna;
    matriu.forEach((valors, i) => {
      valors.forEach((valor, j) => full._establir(fila + i, col + j, interpretarValor(valor)));
    });

    return this._dispararEdicio(full, {
      range: this.comptador.senseComptar(() => full.getRange(fila, col, matriu.length, matriu[0].length)),
      value: undefined,
      oldValue: undefined
    });
  }

  // Esborra un rang (tecla Supr). Una sola cel·la equival a editar-la amb ''.
  esborrar(full, fila, columna, numFiles = 1, numColumnes = 1) {
    if (numFiles === 1 && numColumnes === 1) return this.editar(full, fila, columna, '');
    const col = typeof columna === 'string' ? this.columna(full, columna) : columna;
    const buida = Array.from({ length: numFiles }, () => new Array(numColumnes).fill(''));
    return this.enganxar(full, fila, col, buida);
  }

  // Elimina files físicament. Al compartit dispara l'onChange REMOVE_ROW.
  eliminarFiles(full, fila, quantes = 1) {
    this.comptador.senseComptar(() => full.deleteRows(fila, quantes));
    return this._dispararCanviEstructural(full, 'REMOVE_ROW');
  }

  inserirFilesDespres(full, fila, quantes = 1) {
    this.comptador.senseComptar(() => full.insertRowsAfter(fila, quantes));
    return this._dispararCanviEstructural(full, 'INSERT_ROW');
  }

  _dispararEdicio(full, dades) {
    const source = full._spreadsheet;
    const e = { ...dades, source, authMode: 'FULL', triggerUid: 'proves' };
    const handler = source === this.mestre ? 'gestionarEdicioMestre' : 'gestionarEdicioCompartit';
    return this.executar(handler, e);
  }

  _dispararCanviEstructural(full, changeType) {
    // L'script només té trigger onChange al fitxer compartit.
    if (full._spreadsheet !== this.compartit) return undefined;
    return this.executar('gestionarCanviEstructuralCompartit', {
      changeType,
      source: this.compartit,
      authMode: 'FULL',
      triggerUid: 'proves'
    });
  }

  _fullCompartit(nom) {
    return this.compartit._fulls.find(full => full._nom === nom) || null;
  }
}


function escriureCapcaleres(full, capcaleres) {
  capcaleres.forEach((capcalera, i) => full._establir(1, i + 1, capcalera));
}

function llegirFila(escenari, full, fila, columnes) {
  const resultat = {};
  columnes.forEach(([camp, capcalera]) => {
    resultat[camp] = full._valor(fila, escenari.columna(full, capcalera));
  });
  return resultat;
}

// Representació de l'antic valor en un esdeveniment onEdit.
function valorEsdeveniment(valor) {
  if (valor === '' || valor === null || valor === undefined) return undefined;
  if (valor instanceof Date) {
    // Sheets envia el número de sèrie de la data.
    const dies = (valor.getTime() - Date.UTC(1899, 11, 30)) / 86400000
      - valor.getTimezoneOffset() / 1440;
    return String(dies);
  }
  if (typeof valor === 'boolean') return valor ? 'TRUE' : 'FALSE';
  return String(valor);
}


module.exports = {
  Escenari,
  ofertaDeMostra,
  dadesEmpresaDe,
  GRUPS,
  ID_MESTRE,
  ID_COMPARTIT,
  FULL_MESTRE,
  FULL_OFERTES,
  FULL_AUXILIAR,
  CAPCALERES_OFERTES
};
