# TODO: noves columnes de dates al mestre i plantilles

Pla de treball pendent per a [`script.gs`](script.gs). Està pensat perquè una persona o un agent el pugui continuar sense context previ.

**Estat actual:** v11 (estat Posposada), publicada. El pla anterior (banc de proves, fase 2 d'optimització i proves manuals de la v10) es va completar el 2026-11-03 i es pot consultar a l'historial de git d'aquest fitxer.

**Ordre recomanat:**
1. Data recepció oferta (secció 2).
2. Data últim canvi d'estat (secció 3).
3. Data represa (secció 4), quan la coordinació ho confirmi.
4. Plantilles XLSX (secció 5), quan ja hi hagi totes les columnes noves.

Cada tasca va en un commit propi, amb proves noves i les existents en verd. Les tres columnes noves s'han d'afegir al mestre real **abans** de publicar l'script que les fa servir: les columnes es localitzen per capçalera i, si en falta una, l'script s'atura. Afegir-les abans no trenca la versió anterior.

---

## 1. Context imprescindible

### 1.1 Arquitectura (resum)

- L'script està vinculat al **fitxer compartit** (tutors) i obre el **fitxer mestre** (coordinació) amb `openById`.
- Hi ha tres triggers instal·lables, creats per `instal_larTriggers_`:
  - `gestionarEdicioCompartit`: onEdit del fitxer compartit.
  - `gestionarCanviEstructuralCompartit`: onChange del fitxer compartit.
  - `gestionarEdicioMestre`: onEdit del fitxer mestre.
- Els triggers s'executen amb els permisos del compte de coordinació que els instal·la.
- Cada execució d'un trigger comença amb l'estat global net. Les memòries cau (`_cache*`) només viuen durant una execució.
- L'script localitza les columnes per capçalera. Les columnes dels fulls de grup que no fa servir es poden moure, amagar, eliminar o reanomenar.
- El cost real d'Apps Script és el **nombre de crides** al servei de Sheets, no el JavaScript. `tests/rendiment.test.js` fixa pressupostos de crides: qualsevol canvi que els augmenti s'ha de justificar i ajustar-hi.

### 1.2 Invariants que no es poden trencar

- **Bloqueig:** les comprovacions d'unicitat i els canvis d'estat al mestre (reserva, alliberament, reconciliació) es fan dins de `LockService.getScriptLock()`, i `alliberarLock_` fa `flush()` abans d'alliberar-lo. La publicació i les validacions van fora del bloqueig.
- **Memòria cau:** just després d'obtenir el bloqueig, `invalidarCachesDades_()`; qualsevol escriptura al mestre invalida `_cacheOfertesMestre_`; qualsevol escriptura de Tipus u Origen en un grup invalida `_cacheUsosOfertes_`.
- **Integritat d'IDs:** davant d'un duplicat, la fila preexistent sempre té prioritat.
- **Acord propi:** les dades d'una fila amb Origen `propi` les escriu el tutor i la reconciliació no les toca mai.
- **Publicació:** el full `Ofertes` només mostra ofertes Pendent i mai dades de contacte. Les columnes de dates noves **no** es publiquen.
- **Data contacte:** es conserva en passar de Contactada a Assignada (registre d'auditoria).
- **Estats fora de circulació** (`ESTATS_FORA_DE_CIRCULACIO`: Esperant informació, Posposada, Descartada): els posa la coordinació, no es publiquen i la reconciliació esborra les referències dels grups.
- `CFG.MASTER_SPREADSHEET_ID` es manté amb el valor de mostra `ENGANXA_AQUI_ID_FITXER_MESTRE` al repositori.
- La carpeta `privat/` conté còpies dels fitxers reals (amb dades personals) només per consultar-ne l'estructura. Està exclosa de git i de Docker i no se n'ha de copiar cap dada a les proves, als commits ni a les plantilles.

### 1.3 Convencions del repositori

- Comentaris del codi, documentació i missatges de commit en **català**.
- En text català no s'usa el guió llarg: cal fer servir dos punts, comes, parèntesis o un guionet.
- Els commits **no** han d'incloure línies `Co-Authored-By` ni cap atribució a eines d'IA.
- Les proves s'executen en un contenidor (vegeu el README):
  `docker run --rm --network none -v "$PWD":/app:ro -w /app node:22-alpine node --test "tests/**/*.test.js"`
- Abans de publicar una versió: capçalera de `script.gs`, README, guies de coordinació, tutories i instal·lació, i captures que mostrin canvis visibles.

---

## 2. Columna «Data recepció oferta»

Data en què l'oferta entra al sistema. L'escriu l'script automàticament i la coordinació la pot corregir a mà.

- [ ] Afegir `DATA_RECEPCIO: 'Data recepció oferta'` a `CFG.MASTER_HEADERS` i a `obtenirColumnesMestre_`.
- [ ] Quan una fila rep un ID per primera vegada, si la columna és buida, escriure-hi la data d'avui:
  - ID automàtic (`assignarIdsAutomatics_`), tant en l'edició d'una cel·la com en un enganxat;
  - ID escrit a mà en una fila sense data (`gestionarCanviIdMestre_`).
- [ ] No sobreescriure mai una data existent (escrita a mà o enganxada amb la fila).
- [ ] La coordinació la pot editar lliurement: no s'afegeix a la llista de camps protegits (Gestionada per, Data contacte, Dies en contacte).
- [ ] Validació de data a la columna (`requireDate()`), configurada a la instal·lació com la d'Estat. Cal afegir-la al doble de `newDataValidation` si no hi és.
- [ ] Escriure-la en bloc amb els IDs automàtics (mateixos trams de files consecutives) per no afegir crides per fila.
- [ ] Proves: fila nova d'una cel·la, enganxat de diverses files, fila amb data ja posada, ID manual, edició manual de la data; ajustar `rendiment.test.js` si cal.

**Decidit:** les ofertes que ja existeixen quan s'instal·la la versió queden sense data. La coordinació la pot posar a mà si la coneix.

## 3. Columna «Data últim canvi d'estat»

Data de l'últim canvi d'Estat, sigui qui sigui qui el faci. L'escriu l'script i la coordinació la pot corregir a mà.

- [ ] Afegir `DATA_CANVI_ESTAT: 'Data últim canvi d\'estat'` a `CFG.MASTER_HEADERS` i a `obtenirColumnesMestre_`.
- [ ] Escriure la data d'avui a tots els llocs on l'Estat canvia realment (no si s'escriu el mateix valor):
  - canvi manual de la coordinació (`gestionarCanviEstatMestre_`);
  - reserva d'un tutor (`reservarOfertaSenseLock_`);
  - Contacte ↔ Acord (`actualitzarEstatOfertaActivaSenseLock_`);
  - alliberament (`alliberarOfertaSiCorresponSenseLock_`);
  - reconciliació: ajust d'estat dels usos preservats i retorn a Pendent de les ofertes sense ús;
  - reversió d'un enganxat incoherent (`revertirEstatsActiusIncoherents_`);
  - reactivació d'una oferta Posposada (secció 4), quan existeixi.
- [ ] Al mestre, aprofitar les escriptures que ja es fan a la mateixa fila (Estat i Gestionada per) per no afegir crides; ajustar els pressupostos de `rendiment.test.js` amb la mesura nova.
- [ ] La coordinació la pot editar lliurement (no és un camp protegit). Validació de data a la columna.
- [ ] Proves: cada camí de la llista anterior, escriure el mateix estat (no canvia la data) i edició manual.

**Decidit: edicions múltiples.** En enganxar o esborrar diverses cel·les, onEdit no dona el valor anterior de cada cel·la, de manera que no es pot saber quines files han canviat d'estat. Regla:

- Si el rang editat inclou la columna Estat però **no** la de Data últim canvi d'estat, es posa la data d'avui a totes les files del rang amb Estat no buit. És un canvi d'estat deliberat de la coordinació (o files noves enganxades).
- Si el rang inclou **totes dues** columnes (per exemple, en copiar files senceres), es respecten les dates enganxades i no s'hi escriu res.
- Les files que l'script corregeix (`revertirEstatsActiusIncoherents_`) reben la data perquè sí que canvien d'estat.
- Excepció acceptada: enganxar els mateixos estats que ja hi havia, sense la columna de data, posa la data d'avui. És un cas rar i la data es pot corregir a mà.

Es descarta guardar una còpia dels estats (columna oculta o propietats) per comparar: cal mantenir-la a cada camí que escriu l'estat, es pot desincronitzar i afegeix lectures i escriptures per una diferència mínima.

## 4. Columna «Data represa» (pendent de confirmació de la coordinació)

Data en què una oferta Posposada torna automàticament a Pendent.

- [ ] Afegir `DATA_REPRESA: 'Data represa'` a `CFG.MASTER_HEADERS`. Només admet dates; no es publica.
- [ ] Trigger diari instal·lable (`ScriptApp.newTrigger('reactivarOfertesPosposades').timeBased().everyDays(1).atHour(7)`), creat a `instal_larTriggers_` i eliminat en reinstal·lar com els altres.
- [ ] `reactivarOfertesPosposades()`: amb el bloqueig, passar a Pendent les files Posposada amb data d'avui o anterior; després, republicar fora del bloqueig.
- [ ] En editar el mestre: una data d'avui o anterior en una fila Posposada la reactiva a l'acte.
- [ ] **Avís a la coordinació:** la data es conserva després de reactivar. Un format condicional destaca les cel·les ID i Data represa de les files Pendent amb data (sense tocar Estat, que ja té el color del desplegable). La coordinació esborra la data per donar-la per vista.
- [ ] Perquè la data no es reactivi fora de lloc, l'script l'esborra quan un tutor reserva l'oferta o quan la coordinació canvia l'Estat a mà a un valor que no és Posposada.
- [ ] Una data en una fila que no és Posposada (ni Pendent reactivada) es rebutja amb avís.
- [ ] Opcional, a decidir: correu diari a la coordinació amb les ofertes reactivades (requereix el permís d'enviar correu).
- [ ] Proves: reactivació pel trigger diari, data passada en editar, data futura, esborrar la data, reserva després de reactivar, canvi d'estat manual.

## 5. Plantilles XLSX dels dos fitxers

Fitxers buits i ja formatats per pujar a Drive i convertir a Sheets en un desplegament nou.

- [ ] Generar-les amb un script de Node (en Docker) que llegeixi `CFG` de `script.gs`: noms dels fulls, `GRUPS` i capçaleres. No editar-les a mà.
- [ ] Només disseny: capçaleres, ordre i amplada de columnes, fila de capçalera fixada, colors. Les validacions, fórmules i formats condicionals del sistema els posa `instal_larSistema()`.
- [ ] El format es llegeix de `privat/` **quan hi hagi les còpies noves amb les columnes de dates**, sense copiar-ne cap dada.
- [ ] Proposta per a la llista de grups: mantenir-la a `CFG` (Apps Script no pot llegir un fitxer d'entorn) i moure `GRUPS` i `MASTER_SPREADSHEET_ID` al principi de `CFG` com els dos únics valors a configurar.
- [ ] Excepció a `.gitignore` (ara ignora tots els `*.xlsx`), per exemple `!/plantilles/*.xlsx`.
- [ ] Prova a CI que obre les plantilles i comprova que fulls i capçaleres coincideixen amb `CFG`.
- [ ] Afegir el pas a la guia d'instal·lació i al README.
