/*******************************************************
 * CONTROL D'OFERTES I ACORDS DE PRÀCTIQUES
 * v10 (en curs): correccions trobades amb el banc de proves. El text de les
 *     ofertes es copia literalment al grup i a Ofertes (es perdien els zeros
 *     inicials i el signe + dels telèfons, i el text que començava per = es
 *     convertia en fórmula); el límit del full auxiliar es comprova abans de
 *     publicar; l'auditoria ja no informa de la Data contacte d'ofertes que
 *     no són Contactada.
 * v9: rendiment (reconciliació amb lectures i neteges en bloc, escriptures
 *     només dels valors que canvien, memòria cau d'execució per a fitxers,
 *     capçaleres i usos de les ofertes) i correcció de Telèfon i Localitat,
 *     que s'esborraven en reconciliar o en editar el mestre.
 * v8: reconciliació diferida per evitar assignacions fantasma quan el
 *     bloqueig no és disponible durant edicions múltiples de grup.
 * v7: correcció d'ofertes òrfenes, protecció d'enganxats múltiples al mestre,
 *     preservació de Data contacte en transicions Contacte↔Acord,
 *     memòria cau d'execució per al mestre,
 *     nou camp «Localitat» publicat a Ofertes.
 * v6: republicació fiable després d'alliberar ofertes
 * v5: correcció de neteja de dades d'oferta en esborrats múltiples
 * Versió optimitzada 2026-09-03: bloquejos curts i validacions incrementals.
 * Manté la fórmula 'Dies en contacte' adaptada a Espanya (Català), separador ';'.
 * ARQUITECTURA DE DOS FITXERS
 *
 * FITXER MESTRE (només coordinació)
 *   Full: Ofertes mestre
 *
 * FITXER COMPARTIT (tutors)
 *   Full: Ofertes
 *   Fulls de grup:
 *     GA1A, GA1B, GA1C, GA2A, GA2B,
 *     GAJ1, GAJ2, AF1M, AF1T, AF2M, AF2T
 *
 * IMPORTANT
 * 1. Aquest projecte d'Apps Script ha d'estar vinculat al FITXER COMPARTIT.
 * 2. Enganxa l'ID del fitxer mestre a CFG.MASTER_SPREADSHEET_ID.
 * 3. Executa instal_larSistema() una vegada amb el compte de coordinació.
 *
 * Els triggers instal·lables s'executen amb els permisos de la persona
 * que els instal·la. Per això els tutors poden reservar una oferta sense
 * tenir accés directe al fitxer mestre privat.
 *******************************************************/

const CFG = Object.freeze({
  // === CAL CONFIGURAR AQUEST VALOR ===
  MASTER_SPREADSHEET_ID: 'ENGANXA_AQUI_ID_FITXER_MESTRE',

  MASTER_SHEET: 'Ofertes mestre',
  SHARED_OFFERS_SHEET: 'Ofertes',
  AUX_SHEET: '_Sistema_Practiques',

  GRUPS: [
    'GA1A', 'GA1B', 'GA1C', 'GA2A', 'GA2B',
    'GAJ1', 'GAJ2', 'AF1M', 'AF1T', 'AF2M', 'AF2T'
  ],

  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  MAX_ACORDS_PER_GRUP: 100,
  MAX_ORIGENS_AUXILIAR: 2000,

  // Si la llista supera aquest límit, una fila que ja té una oferta
  // assignada queda sense desplegable individualitzat (per evitar límits
  // de Google Sheets), però el control de l'script continua sent estricte.
  MAX_INDIVIDUAL_DROPDOWN_ITEMS: 450,

  // Llindars de format condicional al mestre. Es poden canviar lliurement.
  CONTACTE_AVIS_DIES: 7,
  CONTACTE_CRITIC_DIES: 14,

  LOCK_TIMEOUT_MS: 2500,
  RECONCILIATION_LOCK_TIMEOUT_MS: 15000,

  PROP_SHARED_ID: 'PRACTIQUES_SHARED_SPREADSHEET_ID',
  PROP_RECONCILIACIO_PENDENT: 'PRACTIQUES_RECONCILIACIO_PENDENT',

  MASTER_HEADERS: Object.freeze({
    ID: 'ID oferta',
    ESTAT: 'Estat',
    GESTIONADA: 'Gestionada per',
    DATA_CONTACTE: 'Data contacte',
    DIES_CONTACTE: 'Dies en contacte',
    EMPRESA: 'Empresa',
    PERSONA_CONTACTE: 'Persona contacte',
    CORREU: 'Correu electrònic',
    TELEFON: 'Telèfon',
    ADRECA: 'Adreça',
    CICLE: 'Cicle',
    TASQUES: 'Tasques',
    TORN: 'Torn pràctiques',
    LOCALITAT: 'Localitat',
    DATA_INCORPORACIO: 'Data incorporació',
    MODALITAT: 'Modalitat',
    COMENTARIS: 'Comentaris'
  }),

  PUBLIC_HEADERS: Object.freeze([
    'ID oferta',
    'Cicle',
    'Tasques',
    'Torn pràctiques',
    'Localitat',
    'Data incorporació',
    'Modalitat',
    'Comentaris'
  ]),

  GROUP_HEADERS: Object.freeze({
    TIPUS: 'Tipus',
    ORIGEN: 'Origen',
    PERSONA_CONTACTE: 'Persona contacte',
    CORREU: 'Correu',
    TELEFON: 'Telèfon',
    ADRECA: 'Adreça',
    LOCALITAT: 'Localitat',
    NOM_EMPRESA: 'Nom empresa'
  }),

  TIPUS: Object.freeze({
    CONTACTE: 'Contacte',
    ACORD: 'Acord'
  }),

  ORIGEN: Object.freeze({
    PROPI: 'propi'
  }),

  ESTATS: Object.freeze({
    ESPERANT: 'Esperant informació',
    PENDENT: 'Pendent',
    CONTACTADA: 'Contactada',
    ASSIGNADA: 'Assignada',
    DESCARTADA: 'Descartada'
  })
});


/********************************************************
 * MEMÒRIA CAU D'EXECUCIÓ DEL MESTRE
 *
 * Cada trigger d'Apps Script s'executa en un context net (_cacheOfertesMestre_
 * neix com a null). La primera crida a obtenirMapaOfertesMestre_() llegeix el
 * full sencer del mestre una sola vegada; les lectures posteriors dins del
 * mateix trigger reutilitzen la còpia en memòria. Qualsevol funció que
 * escrigui al mestre ha de cridar invalidarCacheOfertesMestre_() perquè la
 * propera lectura obtingui dades fresques.
 ********************************************************/

let _cacheOfertesMestre_ = null;
let _cacheUsosOfertes_ = null;

// Objectes que no canvien durant una execució: es resolen una sola vegada.
let _cacheMestre_ = null;
let _cacheCompartit_ = null;
let _cacheFullMestre_ = null;
let _cacheColumnesMestre_ = null;
const _cacheFullsGrup_ = new Map();
// Per nom i per objecte: Apps Script pot retornar objectes diferents per al
// mateix full (getSheetByName, e.range.getSheet()); amb l'objecte ja vist no
// cal ni tornar a llegir-ne el nom.
const _cacheColumnesGrup_ = new Map();
const _cacheColumnesPerFull_ = new Map();
const _cacheFilesGrupAssegurades_ = new Set();
const _cacheFullsGrupAssegurats_ = new Set();

function obtenirMapaOfertesMestre_() {
  if (_cacheOfertesMestre_) return _cacheOfertesMestre_;

  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);
  const lastRow = sheet.getLastRow();
  const map = new Map();

  if (lastRow >= CFG.FIRST_DATA_ROW) {
    const numRows = lastRow - CFG.FIRST_DATA_ROW + 1;
    const values = sheet
      .getRange(CFG.FIRST_DATA_ROW, 1, numRows, Math.max(...Object.values(cols)))
      .getValues();

    for (let i = 0; i < values.length; i++) {
      const offer = construirOfertaDesDeFila_(values[i], i + CFG.FIRST_DATA_ROW, cols);
      if (offer === null || map.has(offer.id)) continue;
      map.set(offer.id, offer);
    }
  }

  _cacheOfertesMestre_ = map;
  return _cacheOfertesMestre_;
}

function construirOfertaDesDeFila_(values, row, cols) {
  const id = normalitzarId_(values[cols.id - 1]);
  if (id === null) return null;

  return {
    id,
    row,
    estat: normalitzarText_(values[cols.estat - 1]),
    gestionada: normalitzarText_(values[cols.gestionada - 1]),
    dataContacte: values[cols.dataContacte - 1],
    empresa: values[cols.empresa - 1],
    personaContacte: values[cols.personaContacte - 1],
    correu: values[cols.correu - 1],
    telefon: values[cols.telefon - 1],
    adreca: values[cols.adreca - 1],
    cicle: values[cols.cicle - 1],
    tasques: values[cols.tasques - 1],
    torn: values[cols.torn - 1],
    localitat: values[cols.localitat - 1],
    dataIncorporacio: values[cols.dataIncorporacio - 1],
    modalitat: values[cols.modalitat - 1],
    comentaris: values[cols.comentaris - 1]
  };
}

function invalidarCacheOfertesMestre_() {
  _cacheOfertesMestre_ = null;
}

function invalidarCacheUsosOfertes_() {
  _cacheUsosOfertes_ = null;
}

// Cal cridar-la just després d'obtenir el bloqueig: garanteix que les
// comprovacions es fan amb dades fresques i no amb una lectura anterior.
function invalidarCachesDades_() {
  invalidarCacheOfertesMestre_();
  invalidarCacheUsosOfertes_();
}


/********************************************************
 * RECONCILIACIÓ DIFERIDA
 *
 * Quan una edició múltiple d'un full de grup no pot obtenir el bloqueig
 * per reconciliar, marca un senyal perquè la propera execució de qualsevol
 * trigger completi la reconciliació pendent. Això evita que el mestre
 * quedi amb estats orfes (oferta assignada sense ús real al compartit).
 ********************************************************/

function marcarReconciliacioPendent_() {
  try {
    PropertiesService.getScriptProperties()
      .setProperty(CFG.PROP_RECONCILIACIO_PENDENT, 'true');
  } catch (e) {
    Logger.log('No s\'ha pogut marcar la reconciliació pendent: ' + e.message);
  }
}

function executarReconciliacioPendentSiCal_() {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(CFG.PROP_RECONCILIACIO_PENDENT) !== 'true') return;

    const lock = LockService.getScriptLock();
    if (!obtenirLock_(lock, CFG.RECONCILIATION_LOCK_TIMEOUT_MS)) return;

    try {
      reconciliarDesDelCompartitSenseLock_();
      SpreadsheetApp.flush();
      props.deleteProperty(CFG.PROP_RECONCILIACIO_PENDENT);
    } finally {
      lock.releaseLock();
    }

    actualitzarPublicacioIAuxiliarSenseLock_();
  } catch (e) {
    Logger.log('Error en reconciliació diferida: ' + e.message);
  }
}


/********************************************************
 * INSTAL·LACIÓ
 ********************************************************/

function instal_larSistema() {
  validarConfiguracio_();

  const shared = SpreadsheetApp.getActiveSpreadsheet();
  const master = SpreadsheetApp.openById(CFG.MASTER_SPREADSHEET_ID);

  const props = PropertiesService.getScriptProperties();
  props.setProperty(CFG.PROP_SHARED_ID, shared.getId());
  props.deleteProperty(CFG.PROP_RECONCILIACIO_PENDENT);

  validarEstructuraCompartida_(shared);
  validarEstructuraMestre_(master);

  crearFullAuxiliar_(shared);
  configurarValidacioEstatsMestre_(master);
  configurarFormulesDiesContacte_(master);
  configurarFormatContactesAntics_(master);
  configurarValidacioTipus_(shared);

  const lock = LockService.getScriptLock();
  lock.waitLock(CFG.RECONCILIATION_LOCK_TIMEOUT_MS);
  try {
    reconciliarDesDelCompartitSenseLock_();
  } finally {
    lock.releaseLock();
  }
  actualitzarPublicacioIAuxiliarSenseLock_();
  refrescarTotesValidacionsOrigen_();

  instal_larTriggers_(shared, master);

  shared.toast(
    'Sistema de pràctiques instal·lat correctament.',
    'Pràctiques',
    8
  );
}


function instal_larTriggers_(shared, master) {
  const handlers = new Set([
    'gestionarEdicioCompartit',
    'gestionarEdicioMestre',
    'gestionarCanviEstructuralCompartit'
  ]);

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.has(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp
    .newTrigger('gestionarEdicioCompartit')
    .forSpreadsheet(shared)
    .onEdit()
    .create();

  ScriptApp
    .newTrigger('gestionarCanviEstructuralCompartit')
    .forSpreadsheet(shared)
    .onChange()
    .create();

  ScriptApp
    .newTrigger('gestionarEdicioMestre')
    .forSpreadsheet(master)
    .onEdit()
    .create();
}


function crearFullAuxiliar_(shared) {
  let sheet = shared.getSheetByName(CFG.AUX_SHEET);
  if (!sheet) sheet = shared.insertSheet(CFG.AUX_SHEET);

  const requiredRows = CFG.MAX_ORIGENS_AUXILIAR + 1;
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }

  if (sheet.getMaxColumns() < 2) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 2 - sheet.getMaxColumns());
  }

  sheet.clear();
  sheet.getRange('A1').setValue('Orígens Acord');
  sheet.getRange('B1').setValue('Orígens Contacte');

  if (!sheet.isSheetHidden()) sheet.hideSheet();
}


/********************************************************
 * TRIGGERS
 ********************************************************/

function gestionarEdicioCompartit(e) {
  if (!e || !e.range) return;

  // Reconciliació diferida: si una edició múltiple anterior no va poder
  // reconciliar per bloqueig, ho fem ara abans de processar l'edició actual.
  executarReconciliacioPendentSiCal_();

  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();

  try {
    // La pestanya Ofertes és una publicació generada pel sistema.
    if (name === CFG.SHARED_OFFERS_SHEET) {
      actualitzarPublicacio();
      avisarEn_(e.source, 'La pestanya Ofertes es genera automàticament i no s\'ha d\'editar manualment.');
      return;
    }

    if (!CFG.GRUPS.includes(name)) return;
    if (range.getRow() < CFG.FIRST_DATA_ROW) return;

    const cols = obtenirColumnesGrup_(sheet);

    if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) {
      gestionarEdicioMultipleGrup_(e, cols);
      return;
    }

    const col = range.getColumn();
    if (col === cols.tipus) {
      gestionarCanviTipus_(e, cols);
    } else if (col === cols.origen) {
      gestionarCanviOrigen_(e, cols);
    }
  } catch (error) {
    avisarEn_(e.source, 'No s\'ha pogut completar l\'operació: ' + error.message);
  }
}


function assignarIdAutomaticSiCal_(sheet, row, cols) {
  const idCell = sheet.getRange(row, cols.id);
  if (normalitzarId_(idCell.getValue()) !== null) return;

  // Comprovem que la fila no sigui completament buida (excepte ID).
  const lastCol = Math.max(...Object.values(cols));
  const rowValues = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const teContingut = rowValues.some(function(v, idx) {
    return idx !== cols.id - 1 && v !== '' && v !== null && v !== undefined;
  });
  if (!teContingut) return;

  // Cerquem l'ID màxim existent.
  const lastRow = sheet.getLastRow();
  let maxId = 0;
  if (lastRow >= CFG.FIRST_DATA_ROW) {
    const ids = sheet.getRange(CFG.FIRST_DATA_ROW, cols.id, lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const id = normalitzarId_(ids[i][0]);
      if (id !== null && id > maxId) maxId = id;
    }
  }

  idCell.setValue(maxId + 1);
}


function gestionarEdicioMestre(e) {
  if (!e || !e.range) return;

  // Reconciliació diferida pendent d'un bloqueig anterior.
  executarReconciliacioPendentSiCal_();

  const sheet = e.range.getSheet();
  if (sheet.getName() !== CFG.MASTER_SHEET) return;
  if (e.range.getRow() < CFG.FIRST_DATA_ROW) return;

  try {
    const cols = obtenirColumnesMestre_(sheet);

    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) {
      gestionarEdicioMultipleMestre_(e, cols);
      return;
    }

    const col = e.range.getColumn();

    if ([cols.gestionada, cols.dataContacte, cols.diesContacte].includes(col)) {
      restaurarValor_(e.range, e.oldValue);
      configurarFormulaDiesFila_(sheet, e.range.getRow(), cols);
      avisarEn_(e.source, 'Gestionada per, Data contacte i Dies en contacte són camps gestionats automàticament.');
      return;
    }

    if (col === cols.id) {
      gestionarCanviIdMestre_(e, cols);
      return;
    }

    // Auto-assignar ID si la fila no en té.
    if (col !== cols.id) {
      assignarIdAutomaticSiCal_(sheet, e.range.getRow(), cols);
    }

    if (col === cols.estat) {
      gestionarCanviEstatMestre_(e, cols);
      return;
    }

    configurarFormulaDiesFila_(sheet, e.range.getRow(), cols);

    const offer = obtenirOfertaPerFilaMestre_(sheet, e.range.getRow(), cols);
    if (offer && offer.id !== null) {
      if (offer.estat === CFG.ESTATS.PENDENT) {
        actualitzarPublicacio();
      } else if (
        offer.estat === CFG.ESTATS.CONTACTADA ||
        offer.estat === CFG.ESTATS.ASSIGNADA
      ) {
        sincronitzarDadesOfertaActiva_(offer);
      }
    }
  } catch (error) {
    avisarEn_(e.source, 'No s\'ha pogut completar l\'operació: ' + error.message);
  }
}


function gestionarCanviEstructuralCompartit(e) {
  if (!e) return;
  if (!['REMOVE_ROW', 'INSERT_ROW'].includes(e.changeType)) return;

  // Reconciliació diferida pendent d'un bloqueig anterior.
  executarReconciliacioPendentSiCal_();

  try {
    CFG.GRUPS.forEach(group => {
      const sheet = obtenirFullGrup_(group);
      if (sheet) assegurarFilesGrup_(sheet);
    });

    const lock = LockService.getScriptLock();
    lock.waitLock(CFG.RECONCILIATION_LOCK_TIMEOUT_MS);
    try {
      reconciliarDesDelCompartitSenseLock_();
    } finally {
      lock.releaseLock();
    }
    actualitzarPublicacioIAuxiliarSenseLock_();
    // Canvi estructural excepcional: aquí sí convé reconstruir totes les validacions.
    refrescarTotesValidacionsOrigen_();
  } catch (error) {
    avisar_('No s\'ha pogut reconciliar el sistema després del canvi de files: ' + error.message);
  }
}


/********************************************************
 * EDICIÓ DELS FULLS DE GRUP
 ********************************************************/

function gestionarCanviTipus_(e, cols) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const group = sheet.getName();

  const newType = normalitzarText_(e.value);

  if (newType && !Object.values(CFG.TIPUS).includes(newType)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'Tipus no vàlid.');
    return;
  }

  let calSincronitzarVistes = false;
  let calPoblar = null;
  let calNetejar = null;
  let forcarNetejaOferta = false;
  let valorOrigenFinal = undefined;

  // TRAM CRÍTIC: només comprovacions i canvis d'estat que han de ser atòmics.
  const lock = LockService.getScriptLock();
  if (!obtenirLock_(lock, CFG.LOCK_TIMEOUT_MS)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'El sistema està ocupat. Torna-ho a provar d\'aquí uns segons.');
    return;
  }

  try {
    invalidarCachesDades_();
    const originCell = sheet.getRange(row, cols.origen);
    const currentOriginRaw = originCell.getValue();
    const currentId = normalitzarId_(currentOriginRaw);
    const currentText = normalitzarText_(currentOriginRaw);

    if (!newType) {
      if (currentId !== null) {
        calNetejar = obtenirOfertaPerId_(currentId);
        alliberarOfertaSiCorresponSenseLock_(currentId, group);
        calSincronitzarVistes = true;
      }
      valorOrigenFinal = '';
    } else if (
      (newType === CFG.TIPUS.CONTACTE && currentText === CFG.ORIGEN.PROPI)
    ) {
      valorOrigenFinal = '';
      calNetejar = null;
    } else if (currentId !== null) {
      const offer = obtenirOfertaPerId_(currentId);
      if (!offer) {
        valorOrigenFinal = '';
        forcarNetejaOferta = true;
      } else if (!esUsUnicDeFila_(currentId, group, row)) {
        restaurarValor_(e.range, e.oldValue);
        avisarEn_(e.source, `L'oferta ${currentId} està vinculada a una altra fila.`);
        return;
      } else {
        const targetState = newType === CFG.TIPUS.CONTACTE
          ? CFG.ESTATS.CONTACTADA
          : CFG.ESTATS.ASSIGNADA;

        if (
          offer.gestionada === group &&
          [CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat)
        ) {
          actualitzarEstatOfertaActivaSenseLock_(offer, targetState, group);
          calPoblar = offer;
          calSincronitzarVistes = true;
        } else if (offer.estat === CFG.ESTATS.PENDENT) {
          reservarOfertaSenseLock_(offer, targetState, group);
          calPoblar = offer;
          calSincronitzarVistes = true;
        } else {
          restaurarValor_(e.range, e.oldValue);
          avisarEn_(e.source, `L'oferta ${currentId} ja no està disponible.`);
          return;
        }
      }
    }
  } finally {
    lock.releaseLock();
  }

  // TREBALL NO CRÍTIC: fora del lock.
  const originCell = sheet.getRange(row, cols.origen);
  if (valorOrigenFinal !== undefined) {
    if (valorOrigenFinal === '') originCell.clearContent();
    else originCell.setValue(valorOrigenFinal);
    invalidarCacheUsosOfertes_();
  }
  if (calNetejar) netejarDadesOfertaFila_(sheet, row, cols);
  else if (forcarNetejaOferta) netejarDadesOfertaFila_(sheet, row, cols);
  if (calPoblar) poblarDadesOfertaFila_(sheet, row, cols, calPoblar);
  if (calSincronitzarVistes) actualitzarPublicacioIAuxiliarSenseLock_();
  aplicarValidacioOrigenFila_(sheet, row, cols);
}


function gestionarCanviOrigen_(e, cols) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const group = sheet.getName();
  const type = normalitzarText_(sheet.getRange(row, cols.tipus).getValue());

  const newRaw = e.value === undefined ? '' : e.value;
  const newText = normalitzarText_(newRaw);
  const newId = normalitzarId_(newRaw);
  const oldRaw = e.oldValue === undefined ? '' : e.oldValue;
  const oldId = normalitzarId_(oldRaw);

  if (!type) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'Selecciona primer el Tipus.');
    return;
  }

  let calSincronitzarVistes = false;
  let calNetejar = null;
  let calPoblar = null;

  const lock = LockService.getScriptLock();
  if (!obtenirLock_(lock, CFG.LOCK_TIMEOUT_MS)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'El sistema està ocupat. Torna-ho a provar d\'aquí uns segons.');
    return;
  }

  try {
    invalidarCachesDades_();
    if (!newText) {
      if (oldId !== null) {
        calNetejar = obtenirOfertaPerId_(oldId);
        alliberarOfertaSiCorresponSenseLock_(oldId, group);
        calSincronitzarVistes = true;
      }
    } else if (newText === CFG.ORIGEN.PROPI) {
      if (type === CFG.TIPUS.CONTACTE) {
        restaurarValor_(e.range, e.oldValue);
        avisarEn_(e.source, 'Un Contacte ha de tenir com a origen una oferta Pendent.');
        return;
      }
      if (oldId !== null) {
        calNetejar = obtenirOfertaPerId_(oldId);
        alliberarOfertaSiCorresponSenseLock_(oldId, group);
        calSincronitzarVistes = true;
      }
    } else if (newId === null) {
      restaurarValor_(e.range, e.oldValue);
      avisarEn_(e.source,
        type === CFG.TIPUS.CONTACTE
          ? 'Un Contacte ha de tenir com a origen una oferta Pendent.'
          : 'L\'Origen ha de ser propi o l\'ID d\'una oferta Pendent.'
      );
      return;
    } else if (oldId !== null && oldId === newId) {
      // Cap canvi de negoci.
    } else {
      // Validem el nou ID ABANS d'alliberar l'antic.
      const newOffer = obtenirOfertaPerId_(newId);
      if (!newOffer || newOffer.estat !== CFG.ESTATS.PENDENT) {
        restaurarValor_(e.range, e.oldValue);
        avisarEn_(e.source, `L'oferta ${newId} no està Pendent i no es pot seleccionar.`);
        return;
      }

      if (teAlgunUs_(newId, group, row)) {
        restaurarValor_(e.range, e.oldValue);
        avisarEn_(e.source, `L'oferta ${newId} ja està vinculada a una altra fila.`);
        return;
      }

      const targetState = type === CFG.TIPUS.CONTACTE
        ? CFG.ESTATS.CONTACTADA
        : CFG.ESTATS.ASSIGNADA;

      if (oldId !== null) {
        calNetejar = obtenirOfertaPerId_(oldId);
        alliberarOfertaSiCorresponSenseLock_(oldId, group);
      }

      reservarOfertaSenseLock_(newOffer, targetState, group);
      calPoblar = newOffer;
      calSincronitzarVistes = true;
    }
  } finally {
    lock.releaseLock();
  }

  // Fora del lock: dades visibles, publicació, auxiliar i validació local.
  if (calNetejar) netejarDadesOfertaFila_(sheet, row, cols);
  if (calPoblar) poblarDadesOfertaFila_(sheet, row, cols, calPoblar);
  if (calSincronitzarVistes) actualitzarPublicacioIAuxiliarSenseLock_();
  aplicarValidacioOrigenFila_(sheet, row, cols);
}


function gestionarEdicioMultipleGrup_(e, cols) {
  const range = e.range;
  const firstCol = range.getColumn();
  const lastCol = range.getLastColumn();

  if (cols.tipus < firstCol || cols.tipus > lastCol) {
    if (cols.origen < firstCol || cols.origen > lastCol) return;
  }

  const lock = LockService.getScriptLock();
  if (!obtenirLock_(lock, CFG.RECONCILIATION_LOCK_TIMEOUT_MS)) {
    // No podem reconciliar ara: marquem la reconciliació com a pendent
    // perquè la propera execució de qualsevol trigger la completi.
    // Sense aquesta guarda, el mestre podria quedar amb ofertes assignades
    // sense cap ús real al compartit (bug d'assignació fantasma).
    marcarReconciliacioPendent_();
    avisarEn_(e.source,
      'No s\'ha pogut reconciliar ara. Es reconciliarà automàticament en la propera acció.'
    );
    return;
  }

  try {
    reconciliarDesDelCompartitSenseLock_();
    // La reconciliació pot haver retornat ofertes a Pendent al fitxer mestre.
    // Ho fem efectiu abans de reconstruir la publicació del fitxer compartit.
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Fora del bloqueig global: només actualitzem la projecció i les files tocades.
  actualitzarPublicacioIAuxiliarSenseLock_();
  refrescarValidacionsFilesGrup_(range.getSheet(), range.getRow(), range.getLastRow(), cols);
}


/********************************************************
 * OPERACIONS SOBRE EL MESTRE
 ********************************************************/

function reservarOfertaSenseLock_(offer, targetState, group) {
  if (!offer || offer.estat !== CFG.ESTATS.PENDENT) {
    throw new Error('L\'oferta ja no està disponible.');
  }

  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);

  sheet.getRange(offer.row, cols.estat).setValue(targetState);
  sheet.getRange(offer.row, cols.gestionada).setValue(group);

  if (targetState === CFG.ESTATS.CONTACTADA) {
    sheet.getRange(offer.row, cols.dataContacte).setValue(new Date());
  }
  // Per a Assignada directa (Acord + ID sense fase de Contacte prèvia):
  // no establim Data contacte perquè no hi ha hagut fase de contacte.

  configurarFormulaDiesFila_(sheet, offer.row, cols);
  invalidarCacheOfertesMestre_();
}


function actualitzarEstatOfertaActivaSenseLock_(offer, targetState, group) {
  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);

  sheet.getRange(offer.row, cols.estat).setValue(targetState);
  sheet.getRange(offer.row, cols.gestionada).setValue(group);

  if (targetState === CFG.ESTATS.CONTACTADA) {
    // Només establim la data si no n'hi ha cap: preservem la data original
    // del primer contacte perquè la coordinadora mantingui la traçabilitat.
    const currentDate = sheet.getRange(offer.row, cols.dataContacte).getValue();
    if (!(currentDate instanceof Date)) {
      sheet.getRange(offer.row, cols.dataContacte).setValue(new Date());
    }
  }
  // Per a Assignada: conservem Data contacte com a registre d'auditoria.
  // La fórmula Dies en contacte ja només mostra valor per a Contactada,
  // de manera que no hi ha soroll visual.

  configurarFormulaDiesFila_(sheet, offer.row, cols);
  invalidarCacheOfertesMestre_();
}


function alliberarOfertaSiCorresponSenseLock_(offerId, group) {
  const offer = obtenirOfertaPerId_(offerId);
  if (!offer) return;

  if (
    ![CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat) ||
    offer.gestionada !== group
  ) {
    return;
  }

  // Si encara hi ha algun altre ús, no l'alliberem automàticament.
  if (teAlgunUs_(offerId, null, null)) return;

  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);

  sheet.getRange(offer.row, cols.estat).setValue(CFG.ESTATS.PENDENT);
  sheet.getRange(offer.row, cols.gestionada).clearContent();
  sheet.getRange(offer.row, cols.dataContacte).clearContent();
  configurarFormulaDiesFila_(sheet, offer.row, cols);
  invalidarCacheOfertesMestre_();
}


function gestionarCanviIdMestre_(e, cols) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const newId = normalitzarId_(e.value);
  const oldId = normalitzarId_(e.oldValue);

  // El bloqueig evita que dues edicions simultànies puguin superar
  // la comprovació d'unicitat abans que l'altra quedi registrada.
  const lock = LockService.getScriptLock();
  if (!obtenirLock_(lock, CFG.LOCK_TIMEOUT_MS)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'El sistema està ocupat. Torna-ho a provar d\'aquí uns segons.');
    return;
  }

  try {
    invalidarCachesDades_();
    if (newId === null) {
      if (normalitzarText_(e.value)) {
        restaurarValor_(e.range, e.oldValue);
        avisarEn_(e.source, 'ID oferta ha de ser un enter positiu.');
      }
      return;
    }

    // PRINCIPI D'INTEGRITAT: davant d'un duplicat, la fila que ja existia
    // sempre té prioritat. Només es desfà l'edició actual.
    const duplicateRow = trobarFilaAmbIdOferta_(newId, row);
    if (duplicateRow !== null) {
      restaurarValor_(e.range, e.oldValue);
      avisarEn_(e.source, `L'ID ${newId} ja existeix a la fila ${duplicateRow}. S'ha conservat el registre existent.`);
      return;
    }

    if (oldId !== null && oldId !== newId && teAlgunUs_(oldId, null, null)) {
      restaurarValor_(e.range, e.oldValue);
      avisarEn_(e.source, `No es pot modificar l'ID ${oldId} perquè està vinculat a un grup.`);
      return;
    }

    configurarFormulaDiesFila_(sheet, row, cols);
  } finally {
    lock.releaseLock();
  }

  // La publicació es refresca fora del bloqueig curt d'unicitat.
  actualitzarPublicacio();
}


function gestionarCanviEstatMestre_(e, cols) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const newState = normalitzarText_(e.value);
  const oldState = normalitzarText_(e.oldValue);
  const id = normalitzarId_(sheet.getRange(row, cols.id).getValue());

  const allowed = Object.values(CFG.ESTATS);
  if (newState && !allowed.includes(newState)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'Estat no vàlid.');
    return;
  }

  // Contactada i Assignada sempre provenen d'una acció dels tutors.
  if ([CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(newState)) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source, 'Contactada i Assignada són estats gestionats automàticament des dels fulls de grup.');
    return;
  }

  if (
    id !== null &&
    [CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(oldState) &&
    teAlgunUs_(id, null, null)
  ) {
    restaurarValor_(e.range, e.oldValue);
    avisarEn_(e.source,
      `L'oferta ${id} encara està vinculada a un grup. El tutor l'ha d'alliberar abans de canviar-ne l'estat.`
    );
    return;
  }

  // Els estats gestionats per coordinació no conserven metadades de reserva.
  sheet.getRange(row, cols.gestionada).clearContent();
  sheet.getRange(row, cols.dataContacte).clearContent();
  configurarFormulaDiesFila_(sheet, row, cols);

  actualitzarPublicacio();
}


function gestionarEdicioMultipleMestre_(e, cols) {
  const range = e.range;
  const firstCol = range.getColumn();
  const lastCol = range.getLastColumn();

  const touchesId = cols.id >= firstCol && cols.id <= lastCol;
  const touchesEstat = cols.estat >= firstCol && cols.estat <= lastCol;
  const touchesSystemColumns = [
    cols.id, cols.estat, cols.gestionada, cols.dataContacte, cols.diesContacte
  ].some(col => col >= firstCol && col <= lastCol);

  let hiHaviaDuplicats = false;
  if (touchesId) {
    // En enganxats/edicions de diverses cel·les, onEdit no proporciona oldValue
    // per cada cel·la. Corregim els duplicats de manera conservadora:
    // qualsevol coincidència que ja existia fora del rang editat és l'original
    // i es preserva; les còpies introduïdes dins del rang s'esborren.
    hiHaviaDuplicats = corregirDuplicatsIntroduitsPerEdicioMultipleMestre_(e, cols);
  }

  // Bug 2 fix: si l'enganxat inclou la columna Estat, comprovem que
  // cap fila dins del rang hagi quedat amb Contactada/Assignada sense
  // un ús real al fitxer compartit. Sense aquesta guarda, un Ctrl-V
  // podria crear estats actius orfes que no es detectarien fins a la
  // reconciliació.
  if (touchesEstat) {
    const sheet = e.range.getSheet();
    const firstRow = range.getRow();
    const lastRow = range.getLastRow();
    const numRows = lastRow - firstRow + 1;

    const estats = sheet
      .getRange(firstRow, cols.estat, numRows, 1)
      .getValues();
    const ids = sheet
      .getRange(firstRow, cols.id, numRows, 1)
      .getValues();

    const uses = construirMapaUsosOfertes_();
    const gestionades = sheet
      .getRange(firstRow, cols.gestionada, numRows, 1)
      .getValues();
    let reverted = 0;

    for (let i = 0; i < numRows; i++) {
      const estatVal = normalitzarText_(estats[i][0]);
      if (![CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(estatVal)) continue;

      const id = normalitzarId_(ids[i][0]);
      const gestionadaPer = normalitzarText_(gestionades[i][0]);
      const row = firstRow + i;
      const useList = id !== null ? (uses.get(id) || []) : [];

      // Comprovem tres condicions de coherència:
      // 1. Existeix algun ús real de l'ID al compartit.
      // 2. El tipus del registre al grup és coherent amb l'estat del mestre
      //    (Contacte → Contactada, Acord → Assignada).
      // 3. Gestionada per coincideix amb el grup que té l'ús.
      const expectedType = estatVal === CFG.ESTATS.CONTACTADA
        ? CFG.TIPUS.CONTACTE
        : CFG.TIPUS.ACORD;

      const coherentUse = useList.find(
        u => u.type === expectedType && u.group === gestionadaPer
      );

      if (!coherentUse) {
        // L'estat actiu no és coherent amb cap ús real → revertim a Pendent.
        sheet.getRange(row, cols.estat).setValue(CFG.ESTATS.PENDENT);
        sheet.getRange(row, cols.gestionada).clearContent();
        sheet.getRange(row, cols.dataContacte).clearContent();
        configurarFormulaDiesFila_(sheet, row, cols);
        reverted++;
      }
    }

    if (reverted > 0) {
      invalidarCacheOfertesMestre_();
    }
  }

  if (hiHaviaDuplicats) {
    avisarEn_(e.source,
      'S\'ha revisat l\'edició múltiple de camps del sistema. Els ID duplicats introduïts s\'han descartat preservant sempre el registre preexistent.'
    );
  }

  // Auto-assignar IDs a files noves dins del rang editat.
  if (!touchesId) {
    const sheet = e.range.getSheet();
    const firstRow = range.getRow();
    const lastRow2 = range.getLastRow();
    for (let r = firstRow; r <= lastRow2; r++) {
      assignarIdAutomaticSiCal_(sheet, r, cols);
    }
  }

  configurarFormulesDiesContacte_(e.source);
  actualitzarPublicacio();
}


function corregirDuplicatsIntroduitsPerEdicioMultipleMestre_(e, cols) {
  const sheet = e.range.getSheet();
  const firstEditedRow = e.range.getRow();
  const lastEditedRow = e.range.getLastRow();
  const lastRow = sheet.getLastRow();
  if (lastRow < CFG.FIRST_DATA_ROW) return;

  const lock = LockService.getScriptLock();
  if (!obtenirLock_(lock, CFG.RECONCILIATION_LOCK_TIMEOUT_MS)) {
    // Si no podem obtenir el bloqueig (p. ex. per una execució concurrent
    // generada per l'auto-ID), saltem la comprovació de duplicats.
    // La reconciliació els detectarà si n'hi ha.
    return false;
  }

  try {
    const ids = sheet
      .getRange(CFG.FIRST_DATA_ROW, cols.id, lastRow - CFG.FIRST_DATA_ROW + 1, 1)
      .getValues();

    let corrected = false;
    const occurrences = new Map();
    for (let i = 0; i < ids.length; i++) {
      const id = normalitzarId_(ids[i][0]);
      if (id === null) continue;
      const row = i + CFG.FIRST_DATA_ROW;
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push(row);
    }

    occurrences.forEach((rows, id) => {
      if (rows.length < 2) return;

      const outsideEdited = rows.filter(r => r < firstEditedRow || r > lastEditedRow);
      const insideEdited = rows.filter(r => r >= firstEditedRow && r <= lastEditedRow);

      let keepRow;
      if (outsideEdited.length > 0) {
        // Prioritat absoluta al registre que ja existia abans de l'edició múltiple.
        keepRow = outsideEdited[0];
      } else {
        // Si totes les còpies s'han creat en el mateix enganxat, conservem
        // només la primera aparició dins del rang editat.
        keepRow = insideEdited[0];
      }

      rows.forEach(r => {
        if (r === keepRow) return;
        // Només modifiquem files afectades per l'edició actual. Mai esborrem
        // una ocurrència preexistent situada fora del rang editat.
        if (r >= firstEditedRow && r <= lastEditedRow) {
          sheet.getRange(r, cols.id).clearContent();
          corrected = true;
        }
      });
    });

    return corrected;
  } finally {
    lock.releaseLock();
  }
}


/********************************************************
 * PUBLICACIÓ I LLISTES AUXILIARS
 ********************************************************/

function actualitzarPublicacio() {
  validarConfiguracio_();
  // És una projecció derivada del mestre: no cal bloquejar la transacció global.
  // La integritat es garanteix en les funcions de reserva/alliberament.
  actualitzarPublicacioIAuxiliarSenseLock_();
}


function actualitzarPublicacioIAuxiliarSenseLock_() {
  /*
   * IMPORTANT: aquesta funció sovint s'executa immediatament després d'haver
   * modificat el fitxer mestre (p. ex. Contactada -> Pendent en alliberar una
   * oferta). Com que el mestre i el compartit són dos Spreadsheet diferents,
   * forcem primer l'enviament de totes les escriptures pendents abans de tornar
   * a llegir el mestre. Això evita republicar una instantània antiga on l'oferta
   * encara apareixia com a Contactada/Assignada.
   */
  SpreadsheetApp.flush();

  const shared = obtenirCompartit_();
  const masterSheet = obtenirFullMestre_();
  const publicSheet = shared.getSheetByName(CFG.SHARED_OFFERS_SHEET);
  const aux = shared.getSheetByName(CFG.AUX_SHEET);

  const cols = obtenirColumnesMestre_(masterSheet);
  const lastRow = masterSheet.getLastRow();
  const pending = [];

  if (lastRow >= CFG.FIRST_DATA_ROW) {
    const lastCol = Math.max(...Object.values(cols));
    const values = masterSheet
      .getRange(CFG.FIRST_DATA_ROW, 1, lastRow - 1, lastCol)
      .getValues();

    values.forEach((row, i) => {
      const id = normalitzarId_(row[cols.id - 1]);
      const state = normalitzarText_(row[cols.estat - 1]);
      if (id === null || state !== CFG.ESTATS.PENDENT) return;

      pending.push({
        id,
        cicle: row[cols.cicle - 1],
        tasques: row[cols.tasques - 1],
        torn: row[cols.torn - 1],
        localitat: row[cols.localitat - 1],
        dataIncorporacio: row[cols.dataIncorporacio - 1],
        modalitat: row[cols.modalitat - 1],
        comentaris: row[cols.comentaris - 1]
      });
    });
  }

  pending.sort((a, b) => a.id - b.id);

  // Abans d'escriure res: si l'error saltés a mitja publicació, l'auxiliar
  // quedaria buit i els desplegables d'Origen sense opcions.
  // La columna A de l'auxiliar conté propi + les ofertes Pendent.
  if (pending.length + 1 > CFG.MAX_ORIGENS_AUXILIAR) {
    throw new Error('Hi ha massa ofertes Pendent per al rang auxiliar configurat.');
  }

  // Publicació: només ofertes Pendent i sense dades de contacte.
  const requiredPublicRows = Math.max(pending.length + 1, 2);
  if (publicSheet.getMaxRows() < requiredPublicRows) {
    publicSheet.insertRowsAfter(
      publicSheet.getMaxRows(),
      requiredPublicRows - publicSheet.getMaxRows()
    );
  }

  publicSheet.getRange(1, 1, 1, CFG.PUBLIC_HEADERS.length)
    .setValues([CFG.PUBLIC_HEADERS]);

  const rowsToClear = publicSheet.getMaxRows() - 1;
  publicSheet.getRange(2, 1, rowsToClear, CFG.PUBLIC_HEADERS.length).clearContent();

  if (pending.length > 0) {
    publicSheet.getRange(2, 1, pending.length, CFG.PUBLIC_HEADERS.length)
      .setValues(pending.map(o => [
        o.id,
        comText_(o.cicle),
        comText_(o.tasques),
        comText_(o.torn),
        comText_(o.localitat),
        comText_(o.dataIncorporacio),
        comText_(o.modalitat),
        comText_(o.comentaris)
      ]));
  }

  // Auxiliar A = Acord (propi + pendents), B = Contacte (només pendents).
  const maxRows = CFG.MAX_ORIGENS_AUXILIAR;
  aux.getRange(2, 1, maxRows, 2).clearContent();

  const acordValues = [[CFG.ORIGEN.PROPI], ...pending.map(o => [o.id])];
  const contacteValues = pending.map(o => [o.id]);

  if (acordValues.length > 0) {
    aux.getRange(2, 1, acordValues.length, 1).setValues(acordValues);
  }
  if (contacteValues.length > 0) {
    aux.getRange(2, 2, contacteValues.length, 1).setValues(contacteValues);
  }
}


/********************************************************
 * VALIDACIONS
 ********************************************************/

function configurarValidacioEstatsMestre_(master) {
  const sheet = master.getSheetByName(CFG.MASTER_SHEET);
  const cols = obtenirColumnesMestre_(sheet);
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(CFG.ESTATS), true)
    .setAllowInvalid(false)
    .setHelpText('Selecciona un estat vàlid. Contactada i Assignada els gestiona l\'script.')
    .build();

  sheet.getRange(2, cols.estat, numRows, 1).setDataValidation(rule);
}


function configurarValidacioTipus_(shared) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(CFG.TIPUS), true)
    .setAllowInvalid(false)
    .setHelpText('Contacte o Acord.')
    .build();

  CFG.GRUPS.forEach(group => {
    const sheet = obtenirFullGrup_(group);
    assegurarFilesGrup_(sheet);
    const cols = obtenirColumnesGrup_(sheet);
    sheet.getRange(2, cols.tipus, CFG.MAX_ACORDS_PER_GRUP, 1)
      .setDataValidation(rule);
  });
}


function obtenirReglaOrigenComunaAcord_() {
  const shared = obtenirCompartit_();
  const aux = shared.getSheetByName(CFG.AUX_SHEET);
  const source = aux.getRange(2, 1, CFG.MAX_ORIGENS_AUXILIAR, 1);

  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(source, true)
    .setAllowInvalid(false)
    .setHelpText('Selecciona propi o una oferta Pendent.')
    .build();
}


function obtenirReglaOrigenComunaContacte_() {
  const shared = obtenirCompartit_();
  const aux = shared.getSheetByName(CFG.AUX_SHEET);
  const source = aux.getRange(2, 2, CFG.MAX_ORIGENS_AUXILIAR, 1);

  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(source, true)
    .setAllowInvalid(false)
    .setHelpText('Selecciona una oferta Pendent.')
    .build();
}


function obtenirPendentsIds_() {
  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(cols.id, cols.estat)).getValues();
  return values
    .filter(row => normalitzarText_(row[cols.estat - 1]) === CFG.ESTATS.PENDENT)
    .map(row => normalitzarId_(row[cols.id - 1]))
    .filter(id => id !== null)
    .sort((a, b) => a - b);
}


function obtenirReglaOrigenAmbIdActual_(type, currentId, pendingIds) {
  const base = type === CFG.TIPUS.ACORD
    ? [CFG.ORIGEN.PROPI, ...pendingIds]
    : [...pendingIds];

  if (!base.includes(currentId)) base.push(currentId);

  if (base.length > CFG.MAX_INDIVIDUAL_DROPDOWN_ITEMS) {
    // Sense validació visual: evita el triangle vermell i els límits de
    // requireValueInList. L'script continua validant estrictament l'edició.
    return null;
  }

  return SpreadsheetApp.newDataValidation()
    .requireValueInList(base, true)
    .setAllowInvalid(false)
    .setHelpText('Inclou l\'oferta actual de la fila i les opcions que continuen disponibles.')
    .build();
}


function aplicarValidacioOrigenFila_(sheet, row, cols, pendingIdsOpt) {
  const cell = sheet.getRange(row, cols.origen);
  const type = normalitzarText_(sheet.getRange(row, cols.tipus).getValue());
  const currentId = normalitzarId_(cell.getValue());

  if (!type) {
    cell.clearDataValidations();
    return;
  }

  if (currentId !== null) {
    const pendingIds = pendingIdsOpt || obtenirPendentsIds_();
    const rule = obtenirReglaOrigenAmbIdActual_(type, currentId, pendingIds);
    if (rule) cell.setDataValidation(rule);
    else cell.clearDataValidations();
    return;
  }

  if (type === CFG.TIPUS.CONTACTE) {
    cell.setDataValidation(obtenirReglaOrigenComunaContacte_());
  } else {
    cell.setDataValidation(obtenirReglaOrigenComunaAcord_());
  }
}


function refrescarValidacionsFilesGrup_(sheet, firstRow, lastRow, cols) {
  const start = Math.max(CFG.FIRST_DATA_ROW, firstRow);
  const end = Math.min(CFG.FIRST_DATA_ROW + CFG.MAX_ACORDS_PER_GRUP - 1, lastRow);
  if (end < start) return;

  const pendingIds = obtenirPendentsIds_();
  for (let row = start; row <= end; row++) {
    aplicarValidacioOrigenFila_(sheet, row, cols, pendingIds);
  }
}


function refrescarTotesValidacionsOrigen_() {
  const pendingIds = obtenirPendentsIds_();
  const ruleAcord = obtenirReglaOrigenComunaAcord_();
  const ruleContacte = obtenirReglaOrigenComunaContacte_();

  /*
   * IMPORTANT DE RENDIMENT:
   * no fem 1.100 setDataValidation() individuals. Llegim cada grup en bloc,
   * construïm la matriu de regles en memòria i fem UNA sola escriptura per
   * grup amb setDataValidations(). Això evita reproduir el coll d'ampolla
   * de la primera arquitectura del sistema.
   */
  CFG.GRUPS.forEach(group => {
    const sheet = obtenirFullGrup_(group);
    assegurarFilesGrup_(sheet);
    const cols = obtenirColumnesGrup_(sheet);

    const types = sheet.getRange(2, cols.tipus, CFG.MAX_ACORDS_PER_GRUP, 1).getValues();
    const origins = sheet.getRange(2, cols.origen, CFG.MAX_ACORDS_PER_GRUP, 1).getValues();

    const validations = [];

    for (let i = 0; i < CFG.MAX_ACORDS_PER_GRUP; i++) {
      const type = normalitzarText_(types[i][0]);
      const currentId = normalitzarId_(origins[i][0]);
      let rule = null;

      if (type === CFG.TIPUS.CONTACTE) {
        rule = currentId !== null
          ? obtenirReglaOrigenAmbIdActual_(type, currentId, pendingIds)
          : ruleContacte;
      } else if (type === CFG.TIPUS.ACORD) {
        rule = currentId !== null
          ? obtenirReglaOrigenAmbIdActual_(type, currentId, pendingIds)
          : ruleAcord;
      }

      validations.push([rule]);
    }

    sheet.getRange(2, cols.origen, CFG.MAX_ACORDS_PER_GRUP, 1)
      .setDataValidations(validations);
  });
}


/********************************************************
 * DADES DE L'OFERTA A LA FILA DEL GRUP
 ********************************************************/

function poblarDadesOfertaFila_(sheet, row, cols, offer) {
  if (!offer) return;

  const valors = {};
  Object.keys(CAMPS_DADES_GRUP_).forEach(camp => {
    valors[camp] = offer[CAMPS_DADES_GRUP_[camp]] || '';
  });
  escriureCampsFila_(sheet, row, cols, valors);
}


function netejarDadesOfertaFila_(sheet, row, cols) {
  sheet
    .getRangeList(Object.keys(CAMPS_DADES_GRUP_).map(camp => columnToLetter_(cols[camp]) + row))
    .clearContent();
}


/*
 * Escriu a la fila els valors indicats (camp -> valor) amb una crida per cada
 * tram de columnes contigües: amb l'ordre habitual dels fulls de grup, una
 * sola crida. Si algú mou les columnes, continua funcionant amb més crides.
 */
function escriureCampsFila_(sheet, row, cols, valors) {
  const camps = Object.keys(valors).sort((a, b) => cols[a] - cols[b]);

  for (let i = 0; i < camps.length;) {
    let j = i;
    while (j + 1 < camps.length && cols[camps[j + 1]] === cols[camps[j]] + 1) j++;

    const tram = camps.slice(i, j + 1).map(camp => comText_(valors[camp]));
    sheet.getRange(row, cols[camps[i]], 1, tram.length).setValues([tram]);
    i = j + 1;
  }
}


function sincronitzarDadesOfertaActiva_(offer) {
  if (!offer || !offer.gestionada || !CFG.GRUPS.includes(offer.gestionada)) return;

  const sheet = obtenirFullGrup_(offer.gestionada);
  const cols = obtenirColumnesGrup_(sheet);

  const lastRow = CFG.MAX_ACORDS_PER_GRUP + 1;
  const origins = sheet.getRange(2, cols.origen, CFG.MAX_ACORDS_PER_GRUP, 1).getValues();

  for (let i = 0; i < origins.length; i++) {
    if (normalitzarId_(origins[i][0]) === offer.id) {
      poblarDadesOfertaFila_(sheet, i + 2, cols, offer);
      return;
    }
  }
}


/********************************************************
 * RECONCILIACIÓ DESPRÉS D'EDICIONS MÚLTIPLES / FILES
 ********************************************************/

/*
 * Camps de dades de l'oferta que es copien a la fila del grup
 * (clau: camp del full de grup, valor: camp de l'oferta del mestre).
 */
const CAMPS_DADES_GRUP_ = Object.freeze({
  personaContacte: 'personaContacte',
  correu: 'correu',
  telefon: 'telefon',
  adreca: 'adreca',
  localitat: 'localitat',
  nomEmpresa: 'empresa'
});


/*
 * RENDIMENT: cada full de grup es llegeix amb UNA sola crida i totes les
 * neteges d'un full s'apliquen amb UNA sola crida (RangeList). Només es
 * netegen les cel·les que realment tenen contingut i només s'escriuen al
 * mestre i als grups els valors que han canviat. Abans, una reconciliació
 * podia fer milers de crides dins del bloqueig encara que no hi hagués res
 * a corregir.
 */
function reconciliarDesDelCompartitSenseLock_() {
  const masterSheet = obtenirFullMestre_();
  const mcols = obtenirColumnesMestre_(masterSheet);

  // Som dins del bloqueig: descartem qualsevol lectura anterior del mestre.
  invalidarCachesDades_();
  const masterMap = obtenirMapaOfertesMestre_();

  const uses = new Map();
  const grups = [];

  CFG.GRUPS.forEach(group => {
    const sheet = obtenirFullGrup_(group);
    assegurarFilesGrup_(sheet);
    const ctx = llegirBlocGrup_(group, sheet);
    grups.push(ctx);

    for (let i = 0; i < CFG.MAX_ACORDS_PER_GRUP; i++) {
      const type = normalitzarText_(valorBlocGrup_(ctx, i, 'tipus'));
      const rawOrigin = valorBlocGrup_(ctx, i, 'origen');
      const originText = normalitzarText_(rawOrigin);
      const id = normalitzarId_(rawOrigin);

      if (!type) {
        // Si s'esborren Tipus i Origen alhora, originText ja és buit.
        // Igualment hem de netejar sempre les dades importades de l'oferta.
        afegirNetejaFila_(ctx, i, originText !== '');
        continue;
      }

      if (type === CFG.TIPUS.CONTACTE && id === null) {
        afegirNetejaFila_(ctx, i, originText !== '');
        continue;
      }

      if (type === CFG.TIPUS.ACORD) {
        if (originText === CFG.ORIGEN.PROPI) {
          // Acord propi: les dades de l'empresa les introdueix l'usuari
          // manualment. No s'han de netejar mai en la reconciliació.
          continue;
        }
        if (id === null) {
          // Important en esborrats múltiples: si Origen queda buit, les dades
          // carregades des de l'oferta també han de desaparèixer.
          afegirNetejaFila_(ctx, i, originText !== '');
          continue;
        }
      }

      if (![CFG.TIPUS.CONTACTE, CFG.TIPUS.ACORD].includes(type) || id === null) {
        continue;
      }

      if (!uses.has(id)) uses.set(id, []);
      uses.get(id).push({ group, type, ctx, i, row: i + CFG.FIRST_DATA_ROW });
    }
  });

  const preserved = new Map();

  uses.forEach((entries, id) => {
    const offer = masterMap.get(id);

    if (!offer || [CFG.ESTATS.ESPERANT, CFG.ESTATS.DESCARTADA].includes(offer.estat)) {
      entries.forEach(entry => afegirNetejaFila_(entry.ctx, entry.i, true));
      return;
    }

    let keep = null;

    if (
      [CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat) &&
      offer.gestionada
    ) {
      const expectedType = offer.estat === CFG.ESTATS.CONTACTADA
        ? CFG.TIPUS.CONTACTE
        : CFG.TIPUS.ACORD;

      keep = entries.find(e => e.group === offer.gestionada && e.type === expectedType) ||
             entries.find(e => e.group === offer.gestionada) ||
             null;
    }

    /*
     * Si l'oferta ja era activa i no queda cap ús al grup que la gestionava,
     * no permetem que una referència enganxada en un altre grup la "robi".
     * Netegem aquestes referències; més avall l'oferta activa quedarà sense
     * ús i tornarà a Pendent.
     */
    if (
      [CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat) &&
      offer.gestionada &&
      !entries.some(e => e.group === offer.gestionada)
    ) {
      entries.forEach(entry => afegirNetejaFila_(entry.ctx, entry.i, true));
      return;
    }

    if (!keep) keep = entries[0];

    entries.forEach(entry => {
      if (entry !== keep) afegirNetejaFila_(entry.ctx, entry.i, true);
    });

    preserved.set(id, keep);
  });

  // Ajustem l'estat del mestre segons l'únic ús preservat.
  preserved.forEach((entry, id) => {
    const offer = masterMap.get(id);
    if (!offer) return;

    const targetState = entry.type === CFG.TIPUS.CONTACTE
      ? CFG.ESTATS.CONTACTADA
      : CFG.ESTATS.ASSIGNADA;

    if (
      offer.estat === CFG.ESTATS.PENDENT ||
      (
        [CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat) &&
        offer.gestionada === entry.group
      )
    ) {
      const canviEstat = offer.estat !== targetState;
      const canviGestionada = offer.gestionada !== entry.group;
      // Si ja era Contactada amb data, no reiniciem el rellotge.
      // Per a Assignada: conservem Data contacte com a registre d'auditoria.
      const calData = targetState === CFG.ESTATS.CONTACTADA &&
        !(offer.dataContacte instanceof Date);

      if (canviEstat) masterSheet.getRange(offer.row, mcols.estat).setValue(targetState);
      if (canviGestionada) masterSheet.getRange(offer.row, mcols.gestionada).setValue(entry.group);
      if (calData) masterSheet.getRange(offer.row, mcols.dataContacte).setValue(new Date());
      if (canviEstat || canviGestionada || calData) {
        configurarFormulaDiesFila_(masterSheet, offer.row, mcols);
      }

      poblarDadesOfertaFilaSiCal_(entry.ctx, entry.i, offer);
    }
  });

  // Qualsevol oferta activa que ja no tingui ús real torna a Pendent.
  masterMap.forEach(offer => {
    if (![CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat)) return;
    if (preserved.has(offer.id)) return;

    masterSheet.getRange(offer.row, mcols.estat).setValue(CFG.ESTATS.PENDENT);
    masterSheet.getRange(offer.row, mcols.gestionada).clearContent();
    masterSheet.getRange(offer.row, mcols.dataContacte).clearContent();
    configurarFormulaDiesFila_(masterSheet, offer.row, mcols);
  });

  // Una sola crida per full de grup per aplicar totes les neteges.
  grups.forEach(ctx => {
    if (ctx.neteges.length > 0) ctx.sheet.getRangeList(ctx.neteges).clearContent();
  });

  // La reconciliació pot haver escrit múltiples canvis al mestre i als grups.
  // Invalidem la memòria cau perquè qualsevol lectura posterior obtingui dades fresques.
  invalidarCachesDades_();
}


function llegirBlocGrup_(group, sheet) {
  const cols = obtenirColumnesGrup_(sheet);
  const allCols = Object.values(cols);
  const firstCol = Math.min(...allCols);
  const lastCol = Math.max(...allCols);
  const values = sheet
    .getRange(CFG.FIRST_DATA_ROW, firstCol, CFG.MAX_ACORDS_PER_GRUP, lastCol - firstCol + 1)
    .getValues();

  return { group, sheet, cols, firstCol, values, neteges: [] };
}


function valorBlocGrup_(ctx, i, camp) {
  return ctx.values[i][ctx.cols[camp] - ctx.firstCol];
}


// Anota (sense escriure encara) les cel·les a netejar d'una fila del grup.
// Només s'hi afegeixen les cel·les que tenen contingut.
function afegirNetejaFila_(ctx, i, netejarOrigen) {
  const row = i + CFG.FIRST_DATA_ROW;
  if (netejarOrigen) ctx.neteges.push(columnToLetter_(ctx.cols.origen) + row);

  Object.keys(CAMPS_DADES_GRUP_).forEach(camp => {
    if (!esBuit_(valorBlocGrup_(ctx, i, camp))) {
      ctx.neteges.push(columnToLetter_(ctx.cols[camp]) + row);
    }
  });
}


// Escriu a la fila del grup només els camps que difereixen de l'oferta.
function poblarDadesOfertaFilaSiCal_(ctx, i, offer) {
  const canvis = {};

  Object.keys(CAMPS_DADES_GRUP_).forEach(camp => {
    const nou = offer[CAMPS_DADES_GRUP_[camp]] || '';
    if (!valorsIguals_(valorBlocGrup_(ctx, i, camp), nou)) canvis[camp] = nou;
  });

  escriureCampsFila_(ctx.sheet, i + CFG.FIRST_DATA_ROW, ctx.cols, canvis);
}


/********************************************************
 * AUDITORIA
 ********************************************************/

function auditarSistema() {
  validarConfiguracio_();
  const problems = [];
  const master = obtenirMestre_();
  const shared = obtenirCompartit_();
  const sheet = master.getSheetByName(CFG.MASTER_SHEET);
  const cols = obtenirColumnesMestre_(sheet);
  const lastRow = sheet.getLastRow();

  const seen = new Map();
  const masterMap = new Map();

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, Math.max(...Object.values(cols))).getValues();
    values.forEach((row, i) => {
      const realRow = i + 2;
      const id = normalitzarId_(row[cols.id - 1]);
      if (id === null) return;

      if (seen.has(id)) {
        problems.push(`ID duplicat ${id}: files ${seen.get(id)} i ${realRow} del mestre.`);
      } else {
        seen.set(id, realRow);
      }

      // En cas d'una inconsistència prèvia, la primera aparició és la canònica.
      // No permetem que una còpia posterior substitueixi silenciosament l'original.
      if (!masterMap.has(id)) {
        masterMap.set(id, {
          id,
          row: realRow,
          estat: normalitzarText_(row[cols.estat - 1]),
          gestionada: normalitzarText_(row[cols.gestionada - 1]),
          dataContacte: row[cols.dataContacte - 1]
        });
      }
    });
  }

  const uses = construirMapaUsosOfertes_();

  uses.forEach((entries, id) => {
    if (entries.length > 1) {
      problems.push(`Oferta ${id}: utilitzada ${entries.length} vegades (${entries.map(e => `${e.group}!fila ${e.row}`).join(', ')}).`);
    }

    const offer = masterMap.get(id);
    if (!offer) {
      problems.push(`Oferta ${id}: apareix en un grup però no existeix al mestre.`);
      return;
    }

    const entry = entries[0];
    const expectedState = entry.type === CFG.TIPUS.CONTACTE
      ? CFG.ESTATS.CONTACTADA
      : CFG.ESTATS.ASSIGNADA;

    if (offer.estat !== expectedState) {
      problems.push(`Oferta ${id}: al grup és ${entry.type}, però al mestre consta ${offer.estat || '[buit]'}.`);
    }
    if (offer.gestionada !== entry.group) {
      problems.push(`Oferta ${id}: Gestionada per = ${offer.gestionada || '[buit]'}, però l'ús és a ${entry.group}.`);
    }
    // Amb l'estat real: si l'oferta no és Contactada, ja s'ha informat de
    // l'estat incoherent i la manca de data no és cap incidència.
    if (offer.estat === CFG.ESTATS.CONTACTADA && !(offer.dataContacte instanceof Date)) {
      problems.push(`Oferta ${id}: Contactada però sense Data contacte.`);
    }
    // Data contacte es conserva intencionadament en Assignada com a registre
    // d'auditoria (indica quan es va iniciar el contacte). No és una inconsistència.
  });

  masterMap.forEach(offer => {
    if ([CFG.ESTATS.CONTACTADA, CFG.ESTATS.ASSIGNADA].includes(offer.estat) && !uses.has(offer.id)) {
      problems.push(`Oferta ${offer.id}: ${offer.estat} al mestre però sense cap fila de grup.`);
    }
  });

  const message = problems.length === 0
    ? 'Auditoria completada: no s\'han detectat inconsistències.'
    : `Auditoria: ${problems.length} incidència/es.\n\n` + problems.slice(0, 20).join('\n');

  avisarEn_(shared, message);
  Logger.log(message);
  return problems;
}


function reconciliarSistemaManualment() {
  const lock = LockService.getScriptLock();
  lock.waitLock(CFG.RECONCILIATION_LOCK_TIMEOUT_MS);
  try {
    reconciliarDesDelCompartitSenseLock_();
  } finally {
    lock.releaseLock();
  }

  actualitzarPublicacioIAuxiliarSenseLock_();
  refrescarTotesValidacionsOrigen_();
  avisar_('Reconciliació completada.');
}


/********************************************************
 * FORMULES I FORMAT DEL MESTRE
 ********************************************************/

/**
 * Retorna la fórmula R1C1 per a "Dies en contacte" amb la sintaxi
 * corresponent a la configuració regional Espanya (Català):
 * separador d'arguments ";".
 *
 * IFERROR és només una protecció defensiva. La fórmula deixa la cel·la
 * buida si l'oferta no està Contactada o si Data contacte no és vàlida.
 */
function formulaDiesContacteR1C1_(cols) {
  const offEstat = cols.estat - cols.diesContacte;
  const offData = cols.dataContacte - cols.diesContacte;

  return (
    `=IFERROR(` +
      `IF(RC[${offEstat}]="${CFG.ESTATS.CONTACTADA}";` +
        `IF(ISNUMBER(RC[${offData}]);TODAY()-INT(RC[${offData}]);"");` +
        `""` +
      `);` +
      `""` +
    `)`
  );
}


function configurarFormulesDiesContacte_(master) {
  const sheet = master.getSheetByName(CFG.MASTER_SHEET);
  const cols = obtenirColumnesMestre_(sheet);
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);

  const range = sheet.getRange(2, cols.diesContacte, numRows, 1);
  range.setFormulaR1C1(formulaDiesContacteR1C1_(cols));
  range.setNumberFormat('0');
}


function configurarFormulaDiesFila_(sheet, row, cols) {
  const cell = sheet.getRange(row, cols.diesContacte);
  cell.setFormulaR1C1(formulaDiesContacteR1C1_(cols));
  cell.setNumberFormat('0');
}


function configurarFormatContactesAntics_(master) {
  const sheet = master.getSheetByName(CFG.MASTER_SHEET);
  const cols = obtenirColumnesMestre_(sheet);
  const range = sheet.getRange(2, cols.diesContacte, Math.max(sheet.getMaxRows() - 1, 1), 1);

  const rules = sheet.getConditionalFormatRules().filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r => r.getColumn() === cols.diesContacte && r.getNumColumns() === 1);
  });

  const critical = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThanOrEqualTo(CFG.CONTACTE_CRITIC_DIES)
    .setBackground('#f4cccc')
    .setRanges([range])
    .build();

  const warning = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(CFG.CONTACTE_AVIS_DIES, CFG.CONTACTE_CRITIC_DIES - 1)
    .setBackground('#fff2cc')
    .setRanges([range])
    .build();

  sheet.setConditionalFormatRules([...rules, warning, critical]);
}


/********************************************************
 * CONSULTES I MAPES
 ********************************************************/

function obtenirOfertaPerId_(offerId) {
  const id = normalitzarId_(offerId);
  if (id === null) return null;
  return obtenirMapaOfertesMestre_().get(id) || null;
}


function obtenirOfertaPerFilaMestre_(sheet, row, cols) {
  const values = sheet.getRange(row, 1, 1, Math.max(...Object.values(cols))).getValues()[0];
  // Inclou tots els camps (també Telèfon i Localitat): sincronitzarDadesOfertaActiva_
  // els copia al grup i, si faltessin, s'hi escriurien buits.
  return construirOfertaDesDeFila_(values, row, cols);
}


function trobarFilaAmbIdOferta_(offerId, excludedRow) {
  const sheet = obtenirFullMestre_();
  const cols = obtenirColumnesMestre_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const ids = sheet.getRange(2, cols.id, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const row = i + 2;
    if (row === excludedRow) continue;
    if (normalitzarId_(ids[i][0]) === offerId) return row;
  }
  return null;
}


/*
 * Mapa id -> usos als fulls de grup. Es construeix una sola vegada per
 * execució (abans es reconstruïa en cada teAlgunUs_/esUsUnicDeFila_, amb
 * 11 fulls llegits cada vegada). S'ha d'invalidar amb
 * invalidarCacheUsosOfertes_() quan s'escriu Tipus u Origen d'un grup.
 */
function construirMapaUsosOfertes_() {
  if (_cacheUsosOfertes_) return _cacheUsosOfertes_;

  const map = new Map();

  CFG.GRUPS.forEach(group => {
    const sheet = obtenirFullGrup_(group);
    const cols = obtenirColumnesGrup_(sheet);
    const firstCol = Math.min(cols.tipus, cols.origen);
    const width = Math.abs(cols.tipus - cols.origen) + 1;
    const values = sheet
      .getRange(CFG.FIRST_DATA_ROW, firstCol, CFG.MAX_ACORDS_PER_GRUP, width)
      .getValues();

    for (let i = 0; i < values.length; i++) {
      const id = normalitzarId_(values[i][cols.origen - firstCol]);
      if (id === null) continue;
      const type = normalitzarText_(values[i][cols.tipus - firstCol]);
      if (![CFG.TIPUS.CONTACTE, CFG.TIPUS.ACORD].includes(type)) continue;

      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ group, row: i + CFG.FIRST_DATA_ROW, type });
    }
  });

  _cacheUsosOfertes_ = map;
  return _cacheUsosOfertes_;
}


function teAlgunUs_(offerId, excludeGroup, excludeRow) {
  const uses = construirMapaUsosOfertes_().get(offerId) || [];
  return uses.some(use => !(use.group === excludeGroup && use.row === excludeRow));
}


function esUsUnicDeFila_(offerId, group, row) {
  const uses = construirMapaUsosOfertes_().get(offerId) || [];
  return uses.length === 1 && uses[0].group === group && uses[0].row === row;
}


/********************************************************
 * ESTRUCTURA I CAPÇALERES
 ********************************************************/

function validarConfiguracio_() {
  if (
    !CFG.MASTER_SPREADSHEET_ID ||
    CFG.MASTER_SPREADSHEET_ID === 'ENGANXA_AQUI_ID_FITXER_MESTRE'
  ) {
    throw new Error(
      'Configura CFG.MASTER_SPREADSHEET_ID amb l\'ID real del fitxer mestre abans d\'instal·lar el sistema.'
    );
  }
}


function validarEstructuraCompartida_(shared) {
  const missing = [];
  if (!shared.getSheetByName(CFG.SHARED_OFFERS_SHEET)) missing.push(CFG.SHARED_OFFERS_SHEET);
  CFG.GRUPS.forEach(g => {
    if (!shared.getSheetByName(g)) missing.push(g);
  });

  if (missing.length) {
    throw new Error('Falten fulls al fitxer compartit: ' + missing.join(', '));
  }

  const publicSheet = shared.getSheetByName(CFG.SHARED_OFFERS_SHEET);
  validarCapcaleresExactes_(publicSheet, CFG.PUBLIC_HEADERS);

  CFG.GRUPS.forEach(g => {
    const sheet = shared.getSheetByName(g);
    assegurarFilesGrup_(sheet);
    obtenirColumnesGrup_(sheet); // força validació de les capçaleres requerides
  });
}


function validarEstructuraMestre_(master) {
  const sheet = master.getSheetByName(CFG.MASTER_SHEET);
  if (!sheet) throw new Error(`No existeix el full "${CFG.MASTER_SHEET}" al fitxer mestre.`);
  obtenirColumnesMestre_(sheet);
}


function validarCapcaleresExactes_(sheet, expected) {
  const current = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  expected.forEach((header, i) => {
    if (normalitzarText_(current[i]) !== header) {
      throw new Error(`Capçalera incorrecta a ${sheet.getName()}!${columnToLetter_(i + 1)}1. S\'esperava "${header}".`);
    }
  });
}


function assegurarFilesGrup_(sheet) {
  if (_cacheFullsGrupAssegurats_.has(sheet)) return;
  const name = sheet.getName();
  _cacheFullsGrupAssegurats_.add(sheet);
  if (_cacheFilesGrupAssegurades_.has(name)) return;

  const required = CFG.MAX_ACORDS_PER_GRUP + 1;
  const maxRows = sheet.getMaxRows();
  if (maxRows < required) {
    sheet.insertRowsAfter(maxRows, required - maxRows);
  }
  _cacheFilesGrupAssegurades_.add(name);
}


// Les capçaleres no canvien durant una execució: es llegeixen una sola vegada.
function obtenirColumnesMestre_(sheet) {
  if (_cacheColumnesMestre_) return _cacheColumnesMestre_;

  const h = mapaCapcaleres_(sheet);
  const M = CFG.MASTER_HEADERS;
  const name = sheet.getName();

  _cacheColumnesMestre_ = {
    id: columnaObligatoria_(h, M.ID, name),
    estat: columnaObligatoria_(h, M.ESTAT, name),
    gestionada: columnaObligatoria_(h, M.GESTIONADA, name),
    dataContacte: columnaObligatoria_(h, M.DATA_CONTACTE, name),
    diesContacte: columnaObligatoria_(h, M.DIES_CONTACTE, name),
    empresa: columnaObligatoria_(h, M.EMPRESA, name),
    personaContacte: columnaObligatoria_(h, M.PERSONA_CONTACTE, name),
    correu: columnaObligatoria_(h, M.CORREU, name),
    telefon: columnaObligatoria_(h, M.TELEFON, name),
    adreca: columnaObligatoria_(h, M.ADRECA, name),
    cicle: columnaObligatoria_(h, M.CICLE, name),
    tasques: columnaObligatoria_(h, M.TASQUES, name),
    torn: columnaObligatoria_(h, M.TORN, name),
    localitat: columnaObligatoria_(h, M.LOCALITAT, name),
    dataIncorporacio: columnaObligatoria_(h, M.DATA_INCORPORACIO, name),
    modalitat: columnaObligatoria_(h, M.MODALITAT, name),
    comentaris: columnaObligatoria_(h, M.COMENTARIS, name)
  };
  return _cacheColumnesMestre_;
}


function obtenirColumnesGrup_(sheet) {
  if (_cacheColumnesPerFull_.has(sheet)) return _cacheColumnesPerFull_.get(sheet);

  const name = sheet.getName();
  let cols = _cacheColumnesGrup_.get(name);
  if (!cols) {
    const h = mapaCapcaleres_(sheet);
    const G = CFG.GROUP_HEADERS;

    cols = {
      tipus: columnaObligatoria_(h, G.TIPUS, name),
      origen: columnaObligatoria_(h, G.ORIGEN, name),
      personaContacte: columnaObligatoria_(h, G.PERSONA_CONTACTE, name),
      correu: columnaObligatoria_(h, G.CORREU, name),
      telefon: columnaObligatoria_(h, G.TELEFON, name),
      adreca: columnaObligatoria_(h, G.ADRECA, name),
      localitat: columnaObligatoria_(h, G.LOCALITAT, name),
      nomEmpresa: columnaObligatoria_(h, G.NOM_EMPRESA, name)
    };
    _cacheColumnesGrup_.set(name, cols);
  }
  _cacheColumnesPerFull_.set(sheet, cols);
  return cols;
}


function mapaCapcaleres_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const values = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = new Map();

  values.forEach((value, index) => {
    const key = normalitzarText_(value);
    if (key && !map.has(key)) map.set(key, index + 1);
  });

  return map;
}


function columnaObligatoria_(headers, name, sheetName) {
  if (!headers.has(name)) {
    throw new Error(`Falta la capçalera "${name}" al full "${sheetName}".`);
  }
  return headers.get(name);
}


/********************************************************
 * SPREADSHEETS
 ********************************************************/

// openById és car: cada fitxer s'obre una sola vegada per execució.
function obtenirMestre_() {
  if (_cacheMestre_) return _cacheMestre_;
  validarConfiguracio_();
  _cacheMestre_ = SpreadsheetApp.openById(CFG.MASTER_SPREADSHEET_ID);
  return _cacheMestre_;
}


function obtenirCompartit_() {
  if (_cacheCompartit_) return _cacheCompartit_;
  const id = PropertiesService.getScriptProperties().getProperty(CFG.PROP_SHARED_ID);
  if (!id) {
    throw new Error('No s\'ha registrat l\'ID del fitxer compartit. Executa instal_larSistema().');
  }
  _cacheCompartit_ = SpreadsheetApp.openById(id);
  return _cacheCompartit_;
}


function obtenirFullMestre_() {
  if (_cacheFullMestre_) return _cacheFullMestre_;
  const sheet = obtenirMestre_().getSheetByName(CFG.MASTER_SHEET);
  if (!sheet) throw new Error(`No existeix el full "${CFG.MASTER_SHEET}" al fitxer mestre.`);
  _cacheFullMestre_ = sheet;
  return _cacheFullMestre_;
}


function obtenirFullGrup_(group) {
  if (_cacheFullsGrup_.has(group)) return _cacheFullsGrup_.get(group);
  const sheet = obtenirCompartit_().getSheetByName(group);
  if (!sheet) throw new Error(`No existeix el full de grup "${group}" al fitxer compartit.`);
  _cacheFullsGrup_.set(group, sheet);
  return sheet;
}


/********************************************************
 * UTILITATS
 ********************************************************/

function normalitzarText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}


function normalitzarId_(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) return value;
    return null;
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}


function restaurarValor_(range, oldValue) {
  // Pot tornar a escriure Tipus u Origen: els usos llegits ja no són vàlids.
  invalidarCacheUsosOfertes_();
  if (oldValue === undefined || oldValue === null || oldValue === '') {
    range.clearContent();
  } else {
    range.setValue(oldValue);
  }
}


/*
 * setValue(s) interpreta les cadenes com si s'haguessin teclejat: el text
 * "0034930000001" es desaria com a nombre (sense els zeros), "+34930000001"
 * perdria el signe i "=..." seria una fórmula. Un apòstrof inicial força el
 * text: Sheets no el desa ni el retorna en llegir la cel·la. Els nombres i les
 * dates es copien tal qual.
 */
function comText_(value) {
  return typeof value === 'string' && value !== '' ? '\'' + value : value;
}


function esBuit_(value) {
  return value === '' || value === null || value === undefined;
}


function valorsIguals_(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return normalitzarText_(a) === normalitzarText_(b);
}


function obtenirLock_(lock, timeoutMs) {
  try {
    lock.waitLock(timeoutMs);
    return true;
  } catch (e) {
    return false;
  }
}


function avisar_(message) {
  try {
    obtenirCompartit_().toast(message, 'Pràctiques', 8);
  } catch (e) {
    Logger.log(message);
  }
}


function avisarEn_(spreadsheet, message) {
  try {
    spreadsheet.toast(message, 'Pràctiques', 8);
  } catch (e) {
    Logger.log(message);
  }
}


function columnToLetter_(column) {
  let temp = '';
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}


/********************************************************
 * MENÚ
 ********************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Pràctiques')
    .addItem('Actualitzar ofertes publicades', 'actualitzarPublicacio')
    .addItem('Auditar sistema', 'auditarSistema')
    .addItem('Reconciliar sistema', 'reconciliarSistemaManualment')
    .addSeparator()
    .addItem('Reinstal·lar / actualitzar sistema', 'instal_larSistema')
    .addToUi();
}
