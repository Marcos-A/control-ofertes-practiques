'use strict';

/*
 * Carrega script.gs sense modificar-lo en un context vm nou.
 *
 * Una execució de trigger = un context nou: l'estat global de l'script
 * (memòries cau _cache*) neix net, com a Apps Script, mentre que les dades
 * dels fulls viuen al món i es comparteixen entre execucions.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { crearServeis } = require('./serveis-fake');

const RUTA_SCRIPT = path.join(__dirname, '..', '..', 'script.gs');
const ID_MOSTRA = 'ENGANXA_AQUI_ID_FITXER_MESTRE';
const LINIA_ID = `MASTER_SPREADSHEET_ID: '${ID_MOSTRA}'`;

const scriptsCompilats = new Map();


function obtenirScriptCompilat(idMestre) {
  if (scriptsCompilats.has(idMestre)) return scriptsCompilats.get(idMestre);

  let font = fs.readFileSync(RUTA_SCRIPT, 'utf8');
  if (!font.includes(LINIA_ID)) {
    throw new Error(`No s'ha trobat «${LINIA_ID}» a script.gs: cal actualitzar carregar-script.js.`);
  }
  // Sense substituir el valor de mostra, validarConfiguracio_() falla.
  if (idMestre !== ID_MOSTRA) {
    font = font.replace(LINIA_ID, `MASTER_SPREADSHEET_ID: '${idMestre}'`);
  }

  const script = new vm.Script(font, { filename: 'script.gs' });
  scriptsCompilats.set(idMestre, script);
  return script;
}


function carregarScript(mon, { idMestre = mon.idMestre } = {}) {
  const context = vm.createContext({
    ...crearServeis(mon),
    // L'script compara amb instanceof Date: ha de compartir el Date de les
    // proves perquè les dates dels fulls i les de l'script siguin del mateix tipus.
    Date,
    console
  });
  obtenirScriptCompilat(idMestre).runInContext(context);
  return context;
}


module.exports = { carregarScript, ID_MOSTRA };
