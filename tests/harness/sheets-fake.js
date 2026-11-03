'use strict';

/*
 * Dobles en memòria del servei de Sheets d'Apps Script (Spreadsheet, Sheet,
 * Range, RangeList i els constructors de validacions i formats condicionals).
 *
 * Reprodueixen els comportaments de Google Sheets dels quals depèn script.gs
 * (vegeu TODO.md, secció 2.3). Les fórmules no s'avaluen: una cel·la amb
 * fórmula retorna '' a getValues(), però compta com a contingut per a
 * getLastRow() i getLastColumn(), igual que a Sheets.
 *
 * Totes les crides públiques de Spreadsheet, Sheet, Range i RangeList passen
 * pel comptador. Els mètodes que comencen per «_» són d'ús intern del banc de
 * proves (fixtures i comprovacions) i no es compten.
 */

const FILES_PER_DEFECTE = 1000;
const COLUMNES_PER_DEFECTE = 26;

const METODES_LECTURA = new Set([
  'getValue', 'getValues', 'getDisplayValue', 'getDisplayValues',
  'getFormula', 'getFormulas', 'getFormulaR1C1', 'getFormulasR1C1',
  'getDataValidation', 'getDataValidations', 'getNumberFormat', 'getNumberFormats'
]);

const METODES_ESCRIPTURA = new Set([
  'setValue', 'setValues', 'clearContent', 'clear',
  'setFormula', 'setFormulaR1C1', 'setNumberFormat',
  'setDataValidation', 'setDataValidations', 'clearDataValidations',
  'setConditionalFormatRules', 'insertRowsAfter', 'insertRowAfter',
  'insertRowsBefore', 'insertRowBefore', 'insertColumnsAfter',
  'deleteRow', 'deleteRows', 'insertSheet', 'hideSheet', 'showSheet'
]);


/********************************************************
 * COMPTADOR DE CRIDES
 ********************************************************/

class Comptador {
  constructor() {
    this._profunditat = 0;
    this._silenci = 0;
    this.reiniciar();
  }

  reiniciar() {
    this.total = 0;
    this.perMetode = {};
  }

  registrar(nom) {
    this.total++;
    this.perMetode[nom] = (this.perMetode[nom] || 0) + 1;
  }

  // Executa fn sense comptar crides: preparació de fixtures i edicions
  // simulades de l'usuari, que no són crides de l'script.
  senseComptar(fn) {
    this._silenci++;
    try {
      return fn();
    } finally {
      this._silenci--;
    }
  }

  lectures() {
    return this._sumar(METODES_LECTURA);
  }

  escriptures() {
    return this._sumar(METODES_ESCRIPTURA);
  }

  _sumar(metodes) {
    return Object.entries(this.perMetode)
      .filter(([nom]) => metodes.has(nom.split('.').pop()))
      .reduce((total, [, n]) => total + n, 0);
  }
}


// Embolcalla els mètodes públics perquè cada crida feta des de fora del doble
// incrementi el comptador. Les crides internes (un mètode que en crida un
// altre) no es compten.
function instrumentar(Classe, prefix) {
  for (const nom of Object.getOwnPropertyNames(Classe.prototype)) {
    if (nom === 'constructor' || nom.startsWith('_')) continue;
    const original = Classe.prototype[nom];
    if (typeof original !== 'function') continue;

    Classe.prototype[nom] = function (...args) {
      const comptador = this._comptador;
      if (comptador._profunditat === 0 && comptador._silenci === 0) {
        comptador.registrar(`${prefix}.${nom}`);
      }
      comptador._profunditat++;
      try {
        return original.apply(this, args);
      } finally {
        comptador._profunditat--;
      }
    };
  }
}


/********************************************************
 * UTILITATS
 ********************************************************/

function celaBuida() {
  return { valor: '', formula: null, validacio: null, formatNumero: null };
}

function teContingut(cela) {
  return Boolean(cela) && (cela.valor !== '' || cela.formula !== null);
}

function copiarValor(valor) {
  return valor instanceof Date ? new Date(valor.getTime()) : valor;
}

// Interpreta un valor com ho fa Sheets en escriure'l: les cadenes numèriques
// es desen com a nombres i TRUE/FALSE com a booleans.
function interpretarValor(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return new Date(valor.getTime());
  if (typeof valor !== 'string') return valor;

  const text = valor.trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  return valor;
}

function dosDigits(n) {
  return String(n).padStart(2, '0');
}

function valorVisible(valor) {
  if (valor instanceof Date) {
    return `${dosDigits(valor.getDate())}/${dosDigits(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }
  if (typeof valor === 'boolean') return valor ? 'TRUE' : 'FALSE';
  return String(valor);
}

function lletraAColumna(lletres) {
  let columna = 0;
  for (const lletra of lletres.toUpperCase()) {
    columna = columna * 26 + (lletra.charCodeAt(0) - 64);
  }
  return columna;
}

function columnaALletra(columna) {
  let lletres = '';
  while (columna > 0) {
    const resta = (columna - 1) % 26;
    lletres = String.fromCharCode(resta + 65) + lletres;
    columna = (columna - resta - 1) / 26;
  }
  return lletres;
}

function parsejarA1(a1) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(String(a1).trim());
  if (!m) throw new Error(`Notació A1 no admesa pel doble: "${a1}"`);

  const columna1 = lletraAColumna(m[1]);
  const fila1 = Number(m[2]);
  if (!m[3]) return { fila: fila1, columna: columna1, numFiles: 1, numColumnes: 1 };

  const columna2 = lletraAColumna(m[3]);
  const fila2 = Number(m[4]);
  return {
    fila: Math.min(fila1, fila2),
    columna: Math.min(columna1, columna2),
    numFiles: Math.abs(fila2 - fila1) + 1,
    numColumnes: Math.abs(columna2 - columna1) + 1
  };
}


/********************************************************
 * SPREADSHEET
 ********************************************************/

class FakeSpreadsheet {
  constructor(id, nom, comptador) {
    this._id = id;
    this._nom = nom;
    this._comptador = comptador;
    this._fulls = [];
    this._avisos = [];
  }

  getId() {
    return this._id;
  }

  getName() {
    return this._nom;
  }

  getSheets() {
    return [...this._fulls];
  }

  getSheetByName(nom) {
    return this._fulls.find(full => full._nom === nom) || null;
  }

  getActiveSheet() {
    return this._fulls[0] || null;
  }

  insertSheet(nom) {
    if (this.getSheetByName(nom)) {
      throw new Error(`A sheet with the name "${nom}" already exists.`);
    }
    return this._afegirFull(nom);
  }

  toast(missatge, titol, segons) {
    this._avisos.push({ missatge: String(missatge), titol, segons });
  }

  _afegirFull(nom, files = FILES_PER_DEFECTE, columnes = COLUMNES_PER_DEFECTE) {
    const full = new FakeSheet(this, nom, this._comptador, files, columnes);
    this._fulls.push(full);
    return full;
  }

  _eliminarFull(nom) {
    this._fulls = this._fulls.filter(full => full._nom !== nom);
  }
}


/********************************************************
 * SHEET
 ********************************************************/

class FakeSheet {
  constructor(spreadsheet, nom, comptador, files, columnes) {
    this._spreadsheet = spreadsheet;
    this._nom = nom;
    this._comptador = comptador;
    this._maxFiles = files;
    this._maxColumnes = columnes;
    // _files[0] és la fila 1. Cada fila és un array de cel·les (o undefined).
    this._files = [];
    this._ocult = false;
    this._reglesFormat = [];
  }

  getName() {
    return this._nom;
  }

  getParent() {
    return this._spreadsheet;
  }

  getMaxRows() {
    return this._maxFiles;
  }

  getMaxColumns() {
    return this._maxColumnes;
  }

  getLastRow() {
    for (let i = this._files.length - 1; i >= 0; i--) {
      const fila = this._files[i];
      if (fila && fila.some(teContingut)) return i + 1;
    }
    return 0;
  }

  getLastColumn() {
    let ultima = 0;
    for (const fila of this._files) {
      if (!fila) continue;
      for (let j = fila.length - 1; j >= ultima; j--) {
        if (teContingut(fila[j])) {
          ultima = j + 1;
          break;
        }
      }
    }
    return ultima;
  }

  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const r = parsejarA1(a);
      return new FakeRange(this, r.fila, r.columna, r.numFiles, r.numColumnes);
    }
    return new FakeRange(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }

  getRangeList(a1s) {
    return new FakeRangeList(this, a1s.map(a1 => this.getRange(a1)));
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  clear() {
    for (const fila of this._files) {
      if (!fila) continue;
      for (const cela of fila) {
        if (!cela) continue;
        cela.valor = '';
        cela.formula = null;
        cela.formatNumero = null;
      }
    }
    return this;
  }

  insertRowsAfter(despresDe, quantes) {
    this._inserirFiles(despresDe, quantes);
    return this;
  }

  insertRowAfter(despresDe) {
    return this.insertRowsAfter(despresDe, 1);
  }

  insertRowsBefore(abansDe, quantes) {
    this._inserirFiles(abansDe - 1, quantes);
    return this;
  }

  insertRowBefore(abansDe) {
    return this.insertRowsBefore(abansDe, 1);
  }

  deleteRows(fila, quantes) {
    if (fila < 1 || fila + quantes - 1 > this._maxFiles) {
      throw new Error('Those rows are out of bounds.');
    }
    if (quantes >= this._maxFiles) {
      throw new Error('You can\'t delete all the rows on the sheet.');
    }
    this._files.splice(fila - 1, quantes);
    this._maxFiles -= quantes;
  }

  deleteRow(fila) {
    this.deleteRows(fila, 1);
  }

  insertColumnsAfter(despresDe, quantes) {
    for (const fila of this._files) {
      if (fila && fila.length > despresDe) fila.splice(despresDe, 0, ...new Array(quantes));
    }
    this._maxColumnes += quantes;
    return this;
  }

  hideSheet() {
    this._ocult = true;
    return this;
  }

  showSheet() {
    this._ocult = false;
    return this;
  }

  isSheetHidden() {
    return this._ocult;
  }

  getConditionalFormatRules() {
    return [...this._reglesFormat];
  }

  setConditionalFormatRules(regles) {
    this._reglesFormat = [...regles];
  }

  // Accés intern (no comptat) per a fixtures i comprovacions.

  _cela(fila, columna) {
    const f = this._files[fila - 1];
    return f ? f[columna - 1] : undefined;
  }

  _celaPerEscriure(fila, columna) {
    let f = this._files[fila - 1];
    if (!f) f = this._files[fila - 1] = [];
    let cela = f[columna - 1];
    if (!cela) cela = f[columna - 1] = celaBuida();
    return cela;
  }

  _valor(fila, columna) {
    const cela = this._cela(fila, columna);
    return cela ? copiarValor(cela.valor) : '';
  }

  _establir(fila, columna, valor) {
    const cela = this._celaPerEscriure(fila, columna);
    cela.valor = valor === null || valor === undefined ? '' : copiarValor(valor);
    cela.formula = null;
  }

  _fila(fila, numColumnes = this._maxColumnes) {
    const valors = [];
    for (let c = 1; c <= numColumnes; c++) valors.push(this._valor(fila, c));
    return valors;
  }

  _inserirFiles(despresDe, quantes) {
    if (despresDe < 0 || despresDe > this._maxFiles) {
      throw new Error('Those rows are out of bounds.');
    }
    if (this._files.length > despresDe) {
      this._files.splice(despresDe, 0, ...new Array(quantes));
    }
    this._maxFiles += quantes;
  }
}


/********************************************************
 * RANGE
 ********************************************************/

class FakeRange {
  constructor(sheet, fila, columna, numFiles, numColumnes) {
    for (const [nom, valor] of [['row', fila], ['column', columna]]) {
      if (!Number.isInteger(valor) || valor < 1) {
        throw new Error(`Invalid ${nom} ${valor} for the range.`);
      }
    }
    if (!Number.isInteger(numFiles) || numFiles < 1) {
      throw new Error('The number of rows in the range must be at least 1.');
    }
    if (!Number.isInteger(numColumnes) || numColumnes < 1) {
      throw new Error('The number of columns in the range must be at least 1.');
    }
    if (fila + numFiles - 1 > sheet._maxFiles || columna + numColumnes - 1 > sheet._maxColumnes) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }

    this._sheet = sheet;
    this._comptador = sheet._comptador;
    this._fila = fila;
    this._columna = columna;
    this._numFiles = numFiles;
    this._numColumnes = numColumnes;
  }

  getSheet() {
    return this._sheet;
  }

  getRow() {
    return this._fila;
  }

  getColumn() {
    return this._columna;
  }

  getNumRows() {
    return this._numFiles;
  }

  getNumColumns() {
    return this._numColumnes;
  }

  getLastRow() {
    return this._fila + this._numFiles - 1;
  }

  getLastColumn() {
    return this._columna + this._numColumnes - 1;
  }

  getA1Notation() {
    return this._a1();
  }

  getValue() {
    return this._sheet._valor(this._fila, this._columna);
  }

  getValues() {
    return this._mapejar((fila, columna) => this._sheet._valor(fila, columna));
  }

  getDisplayValue() {
    return valorVisible(this._sheet._valor(this._fila, this._columna));
  }

  getDisplayValues() {
    return this._mapejar((fila, columna) => valorVisible(this._sheet._valor(fila, columna)));
  }

  setValue(valor) {
    const interpretat = interpretarValor(valor);
    this._recorrer(cela => {
      if (typeof interpretat === 'string' && interpretat.startsWith('=')) {
        cela.valor = '';
        cela.formula = interpretat;
      } else {
        cela.valor = copiarValor(interpretat);
        cela.formula = null;
      }
    });
    return this;
  }

  setValues(valors) {
    if (
      !Array.isArray(valors) ||
      valors.length !== this._numFiles ||
      valors.some(fila => !Array.isArray(fila) || fila.length !== this._numColumnes)
    ) {
      throw new Error(
        `The number of rows or columns in the data does not match the range (${this._numFiles}x${this._numColumnes}).`
      );
    }
    this._recorrer((cela, i, j) => {
      const interpretat = interpretarValor(valors[i][j]);
      if (typeof interpretat === 'string' && interpretat.startsWith('=')) {
        cela.valor = '';
        cela.formula = interpretat;
      } else {
        cela.valor = interpretat;
        cela.formula = null;
      }
    });
    return this;
  }

  // Esborra valors i fórmules; conserva la validació i el format.
  clearContent() {
    this._recorrer(cela => {
      cela.valor = '';
      cela.formula = null;
    });
    return this;
  }

  setFormula(formula) {
    this._recorrer(cela => {
      cela.valor = '';
      cela.formula = formula;
    });
    return this;
  }

  setFormulaR1C1(formula) {
    return this.setFormula(formula);
  }

  getFormula() {
    const cela = this._sheet._cela(this._fila, this._columna);
    return cela && cela.formula ? cela.formula : '';
  }

  getFormulas() {
    return this._mapejar((fila, columna) => {
      const cela = this._sheet._cela(fila, columna);
      return cela && cela.formula ? cela.formula : '';
    });
  }

  getFormulaR1C1() {
    return this.getFormula();
  }

  getFormulasR1C1() {
    return this.getFormulas();
  }

  setNumberFormat(format) {
    this._recorrer(cela => {
      cela.formatNumero = format;
    });
    return this;
  }

  getNumberFormat() {
    const cela = this._sheet._cela(this._fila, this._columna);
    return cela && cela.formatNumero ? cela.formatNumero : 'General';
  }

  setDataValidation(regla) {
    this._recorrer(cela => {
      cela.validacio = regla || null;
    });
    return this;
  }

  setDataValidations(regles) {
    if (
      !Array.isArray(regles) ||
      regles.length !== this._numFiles ||
      regles.some(fila => !Array.isArray(fila) || fila.length !== this._numColumnes)
    ) {
      throw new Error('The number of rows or columns in the data does not match the range.');
    }
    this._recorrer((cela, i, j) => {
      cela.validacio = regles[i][j] || null;
    });
    return this;
  }

  clearDataValidations() {
    return this.setDataValidation(null);
  }

  getDataValidation() {
    const cela = this._sheet._cela(this._fila, this._columna);
    return cela ? cela.validacio : null;
  }

  getDataValidations() {
    return this._mapejar((fila, columna) => {
      const cela = this._sheet._cela(fila, columna);
      return cela ? cela.validacio : null;
    });
  }

  _a1() {
    const inici = columnaALletra(this._columna) + this._fila;
    if (this._numFiles === 1 && this._numColumnes === 1) return inici;
    return `${inici}:${columnaALletra(this.getLastColumn()) + this.getLastRow()}`;
  }

  _mapejar(fn) {
    const resultat = [];
    for (let i = 0; i < this._numFiles; i++) {
      const fila = [];
      for (let j = 0; j < this._numColumnes; j++) fila.push(fn(this._fila + i, this._columna + j));
      resultat.push(fila);
    }
    return resultat;
  }

  _recorrer(fn) {
    for (let i = 0; i < this._numFiles; i++) {
      for (let j = 0; j < this._numColumnes; j++) {
        fn(this._sheet._celaPerEscriure(this._fila + i, this._columna + j), i, j);
      }
    }
  }
}


/********************************************************
 * RANGE LIST
 ********************************************************/

class FakeRangeList {
  constructor(sheet, ranges) {
    this._sheet = sheet;
    this._comptador = sheet._comptador;
    this._ranges = ranges;
  }

  getRanges() {
    return [...this._ranges];
  }

  clearContent() {
    this._ranges.forEach(range => range.clearContent());
    return this;
  }

  clearDataValidations() {
    this._ranges.forEach(range => range.clearDataValidations());
    return this;
  }
}


/********************************************************
 * VALIDACIONS I FORMATS CONDICIONALS
 ********************************************************/

// Regla de validació: es desa per cel·la i les proves la poden inspeccionar.
class FakeDataValidation {
  constructor(dades) {
    this.criteri = dades.criteri;
    this.valors = dades.valors;
    this.interval = dades.interval;
    this.mostrarDesplegable = dades.mostrarDesplegable;
    this.permetInvalid = dades.permetInvalid;
    this.textAjuda = dades.textAjuda;
    Object.freeze(this);
  }

  getCriteriaType() {
    return this.criteri;
  }

  getCriteriaValues() {
    return this.criteri === 'VALUE_IN_LIST'
      ? [this.valors, this.mostrarDesplegable]
      : [this.interval, this.mostrarDesplegable];
  }

  getAllowInvalid() {
    return this.permetInvalid;
  }

  getHelpText() {
    return this.textAjuda;
  }
}

class FakeDataValidationBuilder {
  constructor() {
    this._dades = { permetInvalid: true, textAjuda: null };
  }

  requireValueInList(valors, mostrarDesplegable = true) {
    Object.assign(this._dades, { criteri: 'VALUE_IN_LIST', valors: [...valors], mostrarDesplegable });
    return this;
  }

  requireValueInRange(range, mostrarDesplegable = true) {
    Object.assign(this._dades, {
      criteri: 'VALUE_IN_RANGE',
      interval: { full: range._sheet._nom, a1: range._a1() },
      mostrarDesplegable
    });
    return this;
  }

  setAllowInvalid(permetInvalid) {
    this._dades.permetInvalid = permetInvalid;
    return this;
  }

  setHelpText(text) {
    this._dades.textAjuda = text;
    return this;
  }

  build() {
    return new FakeDataValidation(this._dades);
  }
}

// Regla de format condicional opaca: només se'n poden consultar els rangs.
class FakeConditionalFormatRule {
  constructor(dades) {
    this.condicio = dades.condicio;
    this.valors = dades.valors;
    this.fons = dades.fons;
    this._ranges = dades.ranges;
    Object.freeze(this);
  }

  getRanges() {
    return [...this._ranges];
  }
}

class FakeConditionalFormatRuleBuilder {
  constructor() {
    this._dades = { ranges: [] };
  }

  whenNumberGreaterThanOrEqualTo(n) {
    Object.assign(this._dades, { condicio: 'NUMBER_GREATER_THAN_OR_EQUAL_TO', valors: [n] });
    return this;
  }

  whenNumberBetween(a, b) {
    Object.assign(this._dades, { condicio: 'NUMBER_BETWEEN', valors: [a, b] });
    return this;
  }

  setBackground(color) {
    this._dades.fons = color;
    return this;
  }

  setRanges(ranges) {
    this._dades.ranges = [...ranges];
    return this;
  }

  build() {
    return new FakeConditionalFormatRule(this._dades);
  }
}


instrumentar(FakeSpreadsheet, 'Spreadsheet');
instrumentar(FakeSheet, 'Sheet');
instrumentar(FakeRange, 'Range');
instrumentar(FakeRangeList, 'RangeList');

module.exports = {
  Comptador,
  FakeSpreadsheet,
  FakeSheet,
  FakeRange,
  FakeRangeList,
  FakeDataValidation,
  FakeDataValidationBuilder,
  FakeConditionalFormatRule,
  FakeConditionalFormatRuleBuilder,
  interpretarValor,
  columnaALletra,
  lletraAColumna,
  FILES_PER_DEFECTE,
  COLUMNES_PER_DEFECTE
};
