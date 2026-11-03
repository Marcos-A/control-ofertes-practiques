'use strict';

/*
 * Dobles dels serveis globals d'Apps Script que fa servir script.gs:
 * SpreadsheetApp, LockService, PropertiesService, ScriptApp i Logger.
 *
 * L'estat persistent (fitxers, propietats, triggers, bloqueig, registre)
 * viu en un «món» compartit entre execucions. Cada execució d'un trigger
 * crea uns serveis nous sobre el mateix món (vegeu carregar-script.js).
 */

const {
  Comptador,
  FakeDataValidationBuilder,
  FakeConditionalFormatRuleBuilder
} = require('./sheets-fake');


function crearMon() {
  return {
    comptador: new Comptador(),
    fitxers: new Map(),
    idActiu: null,
    propietats: new Map(),
    triggers: [],
    seguentIdTrigger: 1,
    // ocupat: true fa que waitLock falli (simula el sistema ocupat).
    bloqueig: { ocupat: false, retingut: false, adquisicions: 0, alliberaments: 0, intentsFallits: 0 },
    registre: [],
    menus: [],
    alertes: []
  };
}


function registrarFitxer(mon, spreadsheet) {
  mon.fitxers.set(spreadsheet._id, spreadsheet);
}


function crearServeis(mon) {
  const comptador = mon.comptador;

  function comptar(nom) {
    if (comptador._silenci === 0) comptador.registrar(nom);
  }

  const SpreadsheetApp = {
    openById(id) {
      comptar('SpreadsheetApp.openById');
      const fitxer = mon.fitxers.get(id);
      if (!fitxer) throw new Error(`No s'ha trobat cap fitxer amb l'ID "${id}".`);
      return fitxer;
    },

    getActiveSpreadsheet() {
      comptar('SpreadsheetApp.getActiveSpreadsheet');
      return mon.fitxers.get(mon.idActiu) || null;
    },

    flush() {
      comptar('SpreadsheetApp.flush');
    },

    newDataValidation() {
      return new FakeDataValidationBuilder();
    },

    newConditionalFormatRule() {
      return new FakeConditionalFormatRuleBuilder();
    },

    getUi() {
      return {
        createMenu(nom) {
          const menu = { nom, elements: [] };
          const constructor = {
            addItem(text, funcio) {
              menu.elements.push({ text, funcio });
              return constructor;
            },
            addSeparator() {
              menu.elements.push({ separador: true });
              return constructor;
            },
            addToUi() {
              mon.menus.push(menu);
            }
          };
          return constructor;
        },
        alert(missatge) {
          mon.alertes.push(String(missatge));
        }
      };
    }
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock(timeoutMs) {
          if (mon.bloqueig.ocupat) {
            mon.bloqueig.intentsFallits++;
            throw new Error(`Lock timeout: no s'ha obtingut el bloqueig en ${timeoutMs} ms.`);
          }
          mon.bloqueig.retingut = true;
          mon.bloqueig.adquisicions++;
        },
        tryLock(timeoutMs) {
          try {
            this.waitLock(timeoutMs);
            return true;
          } catch (e) {
            return false;
          }
        },
        hasLock() {
          return mon.bloqueig.retingut;
        },
        releaseLock() {
          mon.bloqueig.retingut = false;
          mon.bloqueig.alliberaments++;
        }
      };
    }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(clau) {
          return mon.propietats.has(clau) ? mon.propietats.get(clau) : null;
        },
        setProperty(clau, valor) {
          mon.propietats.set(clau, String(valor));
          return this;
        },
        deleteProperty(clau) {
          mon.propietats.delete(clau);
          return this;
        },
        getProperties() {
          return Object.fromEntries(mon.propietats);
        }
      };
    }
  };

  const ScriptApp = {
    getProjectTriggers() {
      return [...mon.triggers];
    },

    deleteTrigger(trigger) {
      mon.triggers = mon.triggers.filter(t => t.getUniqueId() !== trigger.getUniqueId());
    },

    newTrigger(funcio) {
      return {
        forSpreadsheet(spreadsheet) {
          const idOrigen = typeof spreadsheet === 'string' ? spreadsheet : spreadsheet._id;
          const crear = tipus => ({
            create() {
              const trigger = crearTrigger(mon, funcio, tipus, idOrigen);
              mon.triggers.push(trigger);
              return trigger;
            }
          });
          return {
            onEdit: () => crear('ON_EDIT'),
            onChange: () => crear('ON_CHANGE'),
            onOpen: () => crear('ON_OPEN'),
            onFormSubmit: () => crear('ON_FORM_SUBMIT')
          };
        }
      };
    }
  };

  const Logger = {
    log(missatge) {
      mon.registre.push(String(missatge));
      return Logger;
    }
  };

  return { SpreadsheetApp, LockService, PropertiesService, ScriptApp, Logger };
}


function crearTrigger(mon, funcio, tipus, idOrigen) {
  const id = String(mon.seguentIdTrigger++);
  return {
    getUniqueId: () => id,
    getHandlerFunction: () => funcio,
    getEventType: () => tipus,
    getTriggerSourceId: () => idOrigen
  };
}


module.exports = { crearMon, crearServeis, registrarFitxer };
