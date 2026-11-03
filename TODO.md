# TODO: proves automatitzades i optimització (fase 2)

Pla de treball pendent per a [`script.gs`](script.gs). Està pensat perquè una persona o un agent el pugui continuar sense context previ.

**Estat actual:** v9 (commit `610fc06`). La fase 1 d'optimització està feta: reconciliació en bloc, memòria cau d'execució i correcció de Telèfon i Localitat. El banc de proves (secció 2) ja existeix, amb les proves de fidelitat dels dobles, d'instal·lació i el primer pressupost de rendiment; també hi ha les proves de reconciliació, d'edició als fulls de grup (incloses les edicions múltiples i els canvis estructurals) d'edició al mestre, de publicació i d'auditoria: la secció 2.4 està completa. Els pressupostos de rendiment de la secció 2.5 estan fixats: ara toquen les optimitzacions de la fase 2.

**Ordre recomanat:**
1. Primer, el banc de proves (secció 2) i les proves de caracterització de la v9 actual.
2. Després, les optimitzacions de la fase 2 (secció 3), una per commit, amb les proves en verd abans i després de cada canvi.

---

## 1. Context imprescindible

### 1.1 Arquitectura (resum)

- L'script està vinculat al **fitxer compartit** (tutors) i obre el **fitxer mestre** (coordinació) amb `openById`.
- Hi ha tres triggers instal·lables:
  - `gestionarEdicioCompartit`: onEdit del fitxer compartit.
  - `gestionarCanviEstructuralCompartit`: onChange del fitxer compartit.
  - `gestionarEdicioMestre`: onEdit del fitxer mestre.
- Cada execució d'un trigger comença amb l'estat global net. Les memòries cau (`_cache*`) només viuen durant una execució.
- L'script localitza les columnes per capçalera. Les columnes dels fulls de grup que no fa servir (dades de l'estudiant, dates, hores...) es poden moure, amagar, eliminar o reanomenar sense cap conseqüència.
- El cost real d'Apps Script és el **nombre de crides** al servei de Sheets (`getRange`, `getValue(s)`, `setValue(s)`, `clearContent`, `openById`...), no el JavaScript en si.

### 1.2 Invariants que no es poden trencar

- **Bloqueig:** les comprovacions d'unicitat i els canvis d'estat al mestre (reserva, alliberament, reconciliació) es fan dins de `LockService.getScriptLock()`. Els bloquejos han de durar el mínim possible: la publicació i les validacions van fora del bloqueig.
- **Memòria cau:**
  - Just després d'obtenir el bloqueig cal cridar `invalidarCachesDades_()`.
  - Qualsevol escriptura al mestre ha d'invalidar `_cacheOfertesMestre_`.
  - Qualsevol escriptura de Tipus u Origen en un grup ha d'invalidar `_cacheUsosOfertes_`.
- **Integritat d'IDs:** davant d'un duplicat, la fila preexistent sempre té prioritat.
- **Acord propi:** les dades d'una fila amb Origen `propi` les escriu el tutor i la reconciliació no les toca mai.
- **Publicació:** el full `Ofertes` només mostra ofertes Pendent i mai dades de contacte de l'empresa.
- **Data contacte:** es conserva en passar de Contactada a Assignada (registre d'auditoria).
- `CFG.MASTER_SPREADSHEET_ID` s'ha de mantenir amb el valor de mostra `ENGANXA_AQUI_ID_FITXER_MESTRE` al repositori.
- La carpeta `privat/` conté còpies dels fitxers reals (amb dades personals) només per consultar-ne l'estructura. Està exclosa de git i de Docker i no se n'ha de copiar cap dada a les proves ni als commits. Les fixtures de `tests/harness/escenari.js` reprodueixen l'ordre real de les columnes amb dades inventades.

### 1.3 Convencions del repositori

- Comentaris del codi, documentació i missatges de commit en **català**.
- En text català no s'usa el guió llarg (—): cal fer servir dos punts, comes, parèntesis o un guionet.
- Els commits **no** han d'incloure línies `Co-Authored-By` ni cap atribució a eines d'IA.
- Un canvi per commit, amb un missatge descriptiu (vegeu l'historial).

---

## 2. Banc de proves local

### 2.1 Enfocament

Proves d'integració sobre **dobles en memòria** dels serveis d'Apps Script. L'objectiu és executar `script.gs` sense modificar-lo, simular edicions reals dels usuaris i comprovar l'estat final dels fulls (mestre, grups, `Ofertes`, `_Sistema_Practiques`). També es compten les crides a l'API per detectar regressions de rendiment.

- **Entorn:** Node.js 22 LTS amb l'executor de proves integrat (`node --test`, `node:assert`). No cal cap dependència externa.
- **Execució:** dins d'un contenidor al servidor remot (secció 2.6). En local només cal Node.
- **Càrrega de l'script:**
  - `script.gs` es llegeix com a text i s'avalua amb `vm.runInContext` en un context que exposa els serveis falsos.
  - Abans d'avaluar-lo es substitueix el valor de mostra de `MASTER_SPREADSHEET_ID` per un ID de prova; si no, `validarConfiguracio_()` falla.
- **Una execució de trigger = un context `vm` nou** sobre les mateixes dades en memòria. Així es reprodueix el reinici de l'estat global d'Apps Script i les memòries cau no es filtren entre execucions. Les dades dels fulls viuen fora del context i es comparteixen entre execucions.

### 2.2 Estructura proposada

```
package.json                 scripts.test = "node --test \"tests/**/*.test.js\""
Dockerfile                   imatge mínima per executar les proves
.dockerignore
tests/
  harness/
    sheets-fake.js           FakeSpreadsheet, FakeSheet, FakeRange, FakeRangeList,
                             constructors de validacions i formats condicionals,
                             comptador de crides
    serveis-fake.js          LockService, PropertiesService, ScriptApp, Logger,
                             SpreadsheetApp (openById, getActiveSpreadsheet, flush,
                             newDataValidation, newConditionalFormatRule, getUi)
    carregar-script.js       crea un context vm nou amb els serveis i hi avalua script.gs
    escenari.js              constructor de fixtures (mestre + 11 grups + Ofertes + auxiliar)
                             i simuladors d'esdeveniments (editar, enganxar, inserir/eliminar files)
  reconciliacio.test.js
  edicio-grup.test.js
  edicio-mestre.test.js
  publicacio.test.js
  instal-lacio.test.js
  rendiment.test.js
```

### 2.3 Requisits de fidelitat dels dobles

Els dobles han de reproduir aquests comportaments de Google Sheets; si no, les proves donaran falsos positius:

- [x] `getValues()` retorna `''` per a cel·les buides, nombres com a `number` i dates com a `Date`.
- [x] `getDisplayValues()` retorna cadenes.
- [x] En un esdeveniment onEdit d'una sola cel·la, `e.value` i `e.oldValue` són **cadenes** (o `undefined` si la cel·la era o queda buida), mentre que la cel·la emmagatzema el valor interpretat: `"5"` es desa com a `5`.
- [x] En edicions de diverses cel·les (enganxar, esborrar un rang), `e.value` i `e.oldValue` són `undefined`.
- [x] `e.range` i `e.source` apunten als objectes falsos. L'esdeveniment onChange té `changeType` (`INSERT_ROW`, `REMOVE_ROW`...) i `source`.
- [x] `getLastRow()` i `getLastColumn()` ignoren les files i columnes buides del final; `getMaxRows()` i `getMaxColumns()` retornen la mida de la graella.
- [x] `insertRowsAfter`, `deleteRow(s)` i `insertRow(s)` desplacen les dades (cal per a les proves de canvi estructural).
- [x] `clearContent()` esborra valors i fórmules però conserva la validació i el format.
- [x] `getRangeList(a1s).clearContent()` interpreta notació A1 (`"D12"`, `"AA3"`).
- [x] `setFormulaR1C1` i `setNumberFormat` es desen per poder-los comprovar.
- [x] `setDataValidation(s)` i `clearDataValidations()` desen la regla per cel·la. El constructor de regles admet `requireValueInList`, `requireValueInRange`, `setAllowInvalid`, `setHelpText` i `build`.
- [x] `getConditionalFormatRules` i `setConditionalFormatRules` funcionen amb regles opaques.
- [x] `toast(msg, títol, s)` registra els missatges per comprovar els avisos a l'usuari.
- [x] `LockService.getScriptLock().waitLock(ms)` es pot configurar perquè falli i simular el sistema ocupat. `releaseLock()` també s'ha de poder comprovar.
- [x] `PropertiesService.getScriptProperties()` és un magatzem clau-valor persistent entre execucions dins d'una mateixa prova.
- [x] **Comptador de crides:** totes les crides de `FakeSheet`, `FakeRange`, `FakeRangeList` i `openById` incrementen un comptador que les proves poden llegir i reiniciar, amb el detall per mètode.
- [x] Altres comportaments que l'script necessita i que no eren a la llista: `insertSheet`, `insertColumnsAfter`, `hideSheet`/`isSheetHidden`, `clear()`, `RangeList.getRanges`, `getRanges` de les regles de format, `whenNumberBetween`/`whenNumberGreaterThanOrEqualTo`/`setBackground`/`setRanges` del constructor de formats, `ScriptApp.newTrigger`/`getProjectTriggers`/`deleteTrigger`/`getHandlerFunction` i `getUi().createMenu`.
- [x] Una cel·la amb fórmula retorna `''` a `getValues()` (les fórmules no s'avaluen), però compta com a contingut per a `getLastRow()`, igual que a Sheets. Per això, després d'instal·lar, el `getLastRow()` del mestre és l'última fila del full (la fórmula de Dies en contacte ocupa tota la columna).
- [x] `setValue("5")` desa `5`, com a Sheets (afecta `restaurarValor_`), i els rangs fora de la graella llancen un error.
- [ ] Formats de número: a Sheets, `getValue()` d'una cel·la amb format de data retorna un `Date` encara que s'hi hagi escrit un nombre. El doble desa els formats però no els aplica. Afecta `restaurarValor_` a Data contacte (la prova comprova el nombre de sèrie).

### 2.4 Casos de prova

Cada cas parteix d'una fixture mínima, simula l'esdeveniment i comprova l'estat final i els avisos.

**Edició als fulls de grup** (`edicio-grup.test.js`, correspon a la llista de proves del README)

- [x] Contacte + ID Pendent: l'oferta passa a Contactada, Gestionada per = grup, Data contacte = avui i les 6 dades de l'empresa a la fila del grup (incloses Telèfon i Localitat).
- [x] Contacte → Acord: l'oferta passa a Assignada i Data contacte es conserva.
- [x] Acord + ID directe: Assignada sense Data contacte.
- [x] Acord + `propi`: no es toca el mestre i les dades manuals es conserven.
- [x] Contacte + `propi`: es rebutja amb avís i es restaura el valor anterior.
- [x] Canviar l'ID d'Origen per un altre de Pendent: l'antic torna a Pendent i el nou es reserva.
- [x] Triar un ID que no està Pendent o que ja usa una altra fila: es rebutja i el mestre no canvia.
- [x] Esborrar Origen o Tipus: l'oferta torna a Pendent i les dades de la fila s'esborren.
- [x] Origen sense Tipus: es rebutja amb «Selecciona primer el Tipus».
- [x] Sistema ocupat (bloqueig no disponible): es restaura el valor anterior, s'avisa i el mestre no canvia.
- [x] Edició del full `Ofertes`: es republica i s'avisa.

**Edicions múltiples i canvis estructurals**

- [x] Esborrar un rang de diverses files: totes les ofertes afectades tornen a Pendent i les dades s'esborren.
- [x] Enganxar el mateix ID en dos grups: només es conserva l'ús del grup que la gestionava.
- [x] Eliminar físicament una fila (onChange `REMOVE_ROW`): l'oferta queda òrfena i torna a Pendent.
- [x] Edició múltiple amb el bloqueig ocupat: es marca la propietat `PRACTIQUES_RECONCILIACIO_PENDENT` i la propera execució de qualsevol trigger la completa i l'esborra.

**Reconciliació** (`reconciliacio.test.js`)

- [x] Regressió v9: Telèfon i Localitat es conserven i s'emplenen si falten.
- [x] Les dades sobrants en files sense Tipus s'esborren; les files `propi` no es toquen.
- [x] Una oferta activa sense cap ús torna a Pendent i se n'esborren Gestionada per i Data contacte.
- [x] Referències a ofertes Esperant informació, Descartada o inexistents: s'esborren.
- [x] Una oferta activa d'un grup no la pot «robar» una referència enganxada en un altre grup.
- [x] Idempotència: una segona execució seguida no fa cap escriptura.

**Edició al mestre** (`edicio-mestre.test.js`)

- [x] Editar Gestionada per, Data contacte o Dies en contacte: es restaura el valor i s'avisa.
- [x] Posar manualment Contactada o Assignada: es rebutja.
- [x] Canviar l'estat d'una oferta vinculada a un grup: es rebutja.
- [x] Passar una oferta a Pendent, Esperant o Descartada: s'esborren les metadades i es republica.
- [x] ID duplicat en una sola cel·la: es rebutja i es conserva la fila preexistent.
- [x] Canviar l'ID d'una oferta vinculada: es rebutja.
- [x] Enganxar diverses files amb ID duplicats: només s'esborren les còpies dins del rang enganxat.
- [x] Enganxar Estat Contactada/Assignada sense ús coherent: torna a Pendent.
- [x] ID automàtic: una fila nova amb contingut rep `max(ID) + 1`; una fila buida no en rep.
- [x] Editar dades d'una oferta activa: es propaguen a la fila del grup (regressió v9: Telèfon i Localitat incloses).

**Publicació** (`publicacio.test.js`)

- [x] `Ofertes` conté només les Pendent, ordenades per ID i sense dades de contacte.
- [x] Les files sobrants de publicacions anteriors s'esborren.
- [x] Auxiliar: columna A = `propi` + IDs Pendent; columna B = IDs Pendent.
- [x] Validacions d'Origen: regla comuna per a files sense ID, regla individual amb l'ID actual per a files amb ID, i cap regla si se supera `MAX_INDIVIDUAL_DROPDOWN_ITEMS`.

**Instal·lació i auditoria** (`instal-lacio.test.js`)

- [x] `instal_larSistema()` amb l'ID de mostra falla amb un missatge clar.
- [x] Falten fulls o capçaleres: error amb el nom del full i de la capçalera.
- [x] Instal·lació correcta: tres triggers (i s'eliminen els anteriors), full auxiliar ocult, validacions i formats condicionals aplicats.
- [x] `auditarSistema()` detecta cada tipus d'incoherència i no informa de res en un sistema coherent.

### 2.5 Proves de rendiment

Pressupostos de crides a l'API per detectar regressions. Els valors s'han de fixar amb la mesura real de la v9 i ajustar-los a la baixa després de cada optimització.

- [x] Reconciliació sense res a corregir (11 grups × 100 files): 0 escriptures, ≤ 15 `getValues` i ≤ 213 crides en total. Mesura de la v9: 12 `getValues` (les «unes 12 crides» de la prova preliminar només comptaven les lectures de dades) i 213 crides, 127 de les quals són `Sheet.getName` (vegeu 3.3).
- [x] Reserva d'una oferta (Contacte + ID) en un sistema carregat (10 grups × 50 Acords i 200 ofertes Pendent): ≤ 252 crides (119 són `Sheet.getName`), 14 `getValues`, 18 escriptures i 38.327 cel·les llegides.
- [x] Enganxar 100 files en un grup: ≤ 2.647 crides i 1.106 escriptures (unes 24 crides i 11 escriptures per fila: dades de l'empresa i validació d'Origen fila per fila, seccions 3.1 i 3.3), 14 `getValues` i 45.124 cel·les. El cost per fila no augmenta amb la mida de l'enganxat.
- [x] Enganxar 100 files al mestre: ≤ 857 crides, 201 `getValues`, 108 escriptures i 118.700 cel·les. El cost per fila no augmenta amb la mida de l'enganxat, però cada fila rellegeix tota la columna d'IDs (unes 1.000 cel·les): el cost és el producte de les files enganxades per la mida del mestre. Després de la secció 3.2 hauria de quedar en unes poques cel·les per fila.
- [x] El comptador suma també les cel·les llegides (`celesLlegides`), perquè el nombre de crides no reflecteix el volum de dades.

### 2.6 Execució en contenidor

`Dockerfile` proposat:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY script.gs ./
COPY tests ./tests
CMD ["node", "--test", "tests/"]
```

```sh
docker build -t practiques-tests .
docker run --rm practiques-tests
```

Alternativa sense construir imatge, des de l'arrel del projecte:

```sh
docker run --rm --network none -v "$PWD":/app:ro -w /app node:22-alpine node --test "tests/**/*.test.js"
```

- [x] Afegir `package.json` (sense dependències), `Dockerfile` i `.dockerignore` (`.git`, `*.md`, `.claude/`, `privat/`, `*.xlsx`).
- [x] A Node 22, `node --test tests/` tracta la carpeta com un fitxer i falla: cal el patró `"tests/**/*.test.js"`, que Node expandeix sense necessitat de shell.
- [x] Documentar l'execució de les proves en una secció nova del README.
- [ ] (Opcional) GitHub Actions: un flux que executi `node --test` a cada push i a cada PR.

---

## 3. Optimitzacions pendents (fase 2)

Cada tasca indica la funció afectada, el problema i la solució proposada. Les línies canvien amb el temps, així que cal cercar pel nom de la funció.

### 3.1 Validacions després d'una edició múltiple en un grup

- [x] **`refrescarValidacionsFilesGrup_`** crida `aplicarValidacioOrigenFila_` fila per fila. Cada crida fa 2 lectures, reconstrueix la regla comuna (que torna a buscar el full auxiliar) i fa una escriptura.
  - **Solució:** reutilitzar el patró de `refrescarTotesValidacionsOrigen_` limitat al rang editat:
    - llegir Tipus i Origen del rang amb una sola crida;
    - construir les dues regles comunes una sola vegada;
    - escriure-ho tot amb un sol `setDataValidations`.
  - Convé extreure una funció comuna que facin servir totes dues.
  - Fet: `refrescarValidacionsFilesGrup_` és el camí comú de l'edició d'una cel·la (`aplicarValidacioOrigenFila_`), del rang enganxat i de la reconstrucció completa (`refrescarTotesValidacionsOrigen_`). Les regles comunes i la llista de Pendent es construeixen només si calen (`crearContextReglesOrigen_`). Enganxar 100 files en un grup: de 1.442 a 946 crides i de 406 a 307 escriptures.

### 3.2 Edicions múltiples al mestre

- [x] **`gestionarEdicioMultipleMestre_` → `assignarIdAutomaticSiCal_`** s'executa per cada fila del rang i cada vegada rellegeix tota la columna d'IDs: el cost creix quadràticament.
  - **Solució:**
    - llegir el bloc del rang editat i la columna d'IDs una sola vegada;
    - calcular el màxim una vegada;
    - assignar IDs consecutius a les files amb contingut i sense ID;
    - escriure la columna d'IDs del rang amb un sol `setValues`.
  - Fet: `assignarIdsAutomatics_` llegeix la columna d'IDs una vegada i escriu cada tram de files consecutives amb un sol `setValues`; l'edició d'una cel·la també l'usa i `assignarIdAutomaticSiCal_` s'elimina. Enganxar 100 files al mestre: de 746 a 45 crides, de 108 a 7 escriptures i de 120.300 a 19.799 cel·les.
- [x] **`configurarFormulesDiesContacte_(e.source)`** reescriu la fórmula de tota la columna (`getMaxRows`) a cada edició múltiple.
  - **Solució:** aplicar-la només al rang de files editat, i només si el rang toca columnes del sistema.
  - Fet: `configurarFormulesDiesFiles_` comprova la fórmula de les files editades amb una lectura i només l'escriu si alguna és diferent (cobreix també les files noves d'un enganxat al final del full).
- [x] Bloc `touchesEstat`:
  - les tres lectures (Estat, ID, Gestionada per) es poden fer amb una sola;
  - les reversions, amb `RangeList` per a les neteges.
  - Fet: `revertirEstatsActiusIncoherents_` treballa sobre la lectura única del bloc editat i esborra Gestionada per i Data contacte amb un sol `RangeList`.
- [x] Eliminar la variable no usada `touchesSystemColumns`. També es pot fer servir per evitar la reescriptura de fórmules quan el rang no toca columnes del sistema.
  - Fet: eliminada; la comprovació de la fórmula ja evita la reescriptura.
- [x] `corregirDuplicatsIntroduitsPerEdicioMultipleMestre_` fa `return;` (retorna `undefined`) quan el full no té dades. Ha de retornar `false`, igual que les altres sortides.
  - Fet.

### 3.3 Sobrecost per edició

- [x] **`poblarDadesOfertaFila_`** i **`netejarDadesOfertaFila_`** fan 6 crides cadascuna.
  - **Solució:**
    - basar-les en `CAMPS_DADES_GRUP_`;
    - netejar amb un sol `getRangeList(...).clearContent()`;
    - per poblar, escriure només els camps que canvien (com fa `poblarDadesOfertaFilaSiCal_`) o fer un sol `setValues` si les columnes són contigües.
  - Fet: `escriureCampsFila_` escriu amb un `setValues` per tram de columnes contigües (una sola crida amb l'ordre real) i la neteja és un sol `RangeList`. També l'usa la reconciliació. Enganxar 100 files en un grup: de 2.542 a 1.542 crides i de 1.106 a 606 escriptures.
- [x] **`configurarFormulaDiesFila_`** (2 crides) s'executa a gairebé totes les edicions del mestre, encara que la fórmula no s'hagi tocat.
  - **Solució:** mantenir-la només on es restaura la columna Dies en contacte o es crea una fila nova, i treure-la de les edicions de dades normals i dels canvis d'estat.
  - Prerequisit: comprovar amb proves que la fórmula ja és a totes les files des de la instal·lació.
  - Fet d'una altra manera: el mestre no té trigger onChange i una fila inserida a mà no té la fórmula, de manera que treure-la de les edicions normals deixaria files sense fórmula. Ara llegeix la fórmula i només l'escriu si falta o és diferent (una lectura en lloc de dues escriptures). La prova d'instal·lació comprova totes les files. Escriptures: reserva de 13 a 11, enganxar 100 files en un grup de 606 a 406, edició al mestre de 3 a 1.
  - A la prova manual: comprovar que `getFormulaR1C1()` retorna exactament la fórmula escrita (si Sheets la normalitza, es continuaria reescrivint com abans, sense cap error).
- [ ] **`actualitzarPublicacioIAuxiliarSenseLock_`** esborra i reescriu tot el full `Ofertes` i les 2.000 files de l'auxiliar a cada crida.
  - **Solució:**
    - llegir el contingut publicat actual i no escriure res si és idèntic;
    - esborrar només les files sobrants;
    - fer que retorni la llista d'IDs Pendent, perquè les validacions no hagin de tornar a llegir el mestre (`obtenirPendentsIds_`).
- [x] **`gestionarEdicioMestre`** llegeix la fila sencera en dues funcions diferents (`assignarIdAutomaticSiCal_` i `obtenirOfertaPerFilaMestre_`).
  - **Solució:** llegir-la una vegada i passar els valors.
  - Fet: la fila es llegeix una vegada i es passa a `assignarIdAutomaticSiCal_` i `gestionarCanviEstatMestre_`; `obtenirOfertaPerFilaMestre_` ja no cal. Edició al mestre: de 30 a 26 crides.

- [x] **`obtenirColumnesMestre_`** i **`obtenirColumnesGrup_`** criden `sheet.getName()` una vegada per capçalera obligatòria (17 al mestre i 8 per grup), i `assegurarFilesGrup_` també el crida. En una reconciliació són 127 de les 213 crides.
  - **Solució:** llegir el nom una sola vegada al començament de cada funció.
  - Fet: el nom es llegeix una vegada i les columnes també es desen per objecte de full. Reconciliació: de 213 a 109 crides; reserva: de 252 a 147.

### 3.4 Neteja i coherència (sense impacte funcional)

- [x] `sincronitzarDadesOfertaActiva_`: variable no usada `lastRow`. Es pot llegir només la columna Origen fent servir `CFG.FIRST_DATA_ROW` en lloc del literal `2`. Fet: ara és `sincronitzarDadesOfertesActives_`, que agrupa les ofertes per grup.
- [ ] `auditarSistema`: construeix el seu propi mapa del mestre. Pot reutilitzar `construirOfertaDesDeFila_` mantenint la detecció de duplicats.
- [ ] Substituir els literals `2` per `CFG.FIRST_DATA_ROW` a tot el fitxer.
- [ ] Actualitzar el comentari de la secció «MEMÒRIA CAU D'EXECUCIÓ DEL MESTRE» perquè descrigui totes les memòries cau i les regles d'invalidació (vegeu 1.2).

### 3.5 A investigar

- [ ] `gestionarCanviEstructuralCompartit` fa una reconciliació completa i refà totes les validacions per a qualsevol inserció o eliminació de files del fitxer compartit, encara que sigui al full `Ofertes`. L'esdeveniment onChange no informa del full afectat.
  - Cal valorar si `e.source.getActiveSheet()` és fiable en aquest context.
  - Si no ho és, deixar-ho com està (és un cas poc freqüent).

---

## 4. Criteris d'acceptació

- [x] `node --test "tests/**/*.test.js"` passa en verd dins del contenidor.
- [x] Totes les proves de la secció 2.4 existeixen i passen contra la v9 **abans** de començar la fase 2.
- [ ] Cada optimització de la secció 3 va en un commit propi i no trenca cap prova.
- [ ] Els pressupostos de crides de la secció 2.5 es fixen i s'ajusten a la baixa a mesura que s'optimitza.
- [ ] La capçalera de `script.gs` documenta la nova versió (v10) i el README explica com executar les proves.
- [ ] Comprovar en una còpia real que el text amb forma de nombre o de fórmula es copia literalment al grup i a `Ofertes` (`comText_`): un telèfon `0034...` o `+34...` sense espais, i un comentari que comenci per `=` o `+`. Els dobles reprodueixen l'apòstrof inicial, però no s'ha pogut verificar amb Sheets.
- [ ] Prova manual final en còpies dels dos fitxers reals, seguint la llista de proves del README: el banc de proves no cobreix els bloquejos reals, el temps dels triggers, els permisos ni la visualització dels desplegables.
