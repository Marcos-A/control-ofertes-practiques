# Control d'ofertes i acords de pràctiques

Script de Google Apps Script per gestionar les ofertes de pràctiques d'un centre educatiu entre la coordinació i els tutors de grup, amb dos fulls de càlcul de Google Sheets.

La coordinació registra les ofertes en un fitxer privat. Els tutors només veuen les ofertes disponibles, sense dades de l'empresa. Quan un tutor reserva una oferta des del full del seu grup, el sistema la bloqueja per als altres grups i li mostra les dades de contacte.

## Com funciona

El sistema fa servir dos fitxers:

| Fitxer | Qui hi accedeix | Fulls |
|---|---|---|
| **Ofertes de pràctiques - Coordinació** (mestre) | Només la coordinació | `Ofertes mestre` |
| **Gestió de pràctiques - Tutors** (compartit) | Coordinació i tutors | `Ofertes` i un full per grup |

Fulls de grup configurats per defecte: `GA1A`, `GA1B`, `GA1C`, `GA2A`, `GA2B`, `GAJ1`, `GAJ2`, `AF1M`, `AF1T`, `AF2M`, `AF2T`.

L'script està vinculat al fitxer compartit. Els triggers s'instal·len amb el compte de la coordinació, de manera que els tutors poden reservar ofertes sense tenir accés al fitxer mestre.

### Cicle de vida d'una oferta

```
Esperant informació   (falten dades)
        ↓
Pendent               → es publica als tutors
        ↓
Contactada            → un tutor l'ha reservada
        ↓
Assignada             → hi ha acord

Si el contacte no prospera:   Contactada → Pendent
Si s'ha d'aturar per ara:     la coordinació la passa a Posposada
                              (i més endavant, de nou a Pendent)
Si s'ha de rebutjar:          la coordinació la passa a Descartada
```

### Què fan els tutors

Al full del seu grup, cada registre té un **Tipus** i un **Origen**:

| Situació | Tipus | Origen | Efecte |
|---|---|---|---|
| Vull contactar amb una oferta | Contacte | ID de l'oferta | L'oferta passa a *Contactada* i s'emplenen les dades de l'empresa |
| El contacte prospera | Contacte → Acord | (el mateix ID) | L'oferta passa a *Assignada* |
| Acord directe d'una oferta | Acord | ID de l'oferta | L'oferta passa directament a *Assignada* |
| Acord aconseguit pel meu compte | Acord | `propi` | No consumeix cap oferta; les dades s'introdueixen a mà |
| El contacte no prospera | (esborrar el registre) | | L'oferta torna a *Pendent* |

En reservar una oferta, el sistema emplena automàticament **Persona contacte**, **Correu**, **Telèfon**, **Adreça**, **Localitat** i **Nom empresa**, tal com són al mestre. Els registres es fan a les files 2 a 101 de cada full de grup (`MAX_ACORDS_PER_GRUP`); més avall, el sistema rebutja Tipus i Origen.

### Funcionalitats principals

- Publicació automàtica al full `Ofertes` només de les ofertes *Pendent*, sense dades d'empresa ni de contacte.
- Reserva exclusiva: dos grups no poden tenir la mateixa oferta alhora (amb bloquejos de `LockService`). Si dos tutors la trien gairebé alhora, se la queda qui l'ha triada primer.
- Assignació automàtica d'`ID oferta` a les files noves del mestre.
- Els canvis de dades d'una oferta activa al mestre (editats o enganxats) es copien a la fila del grup que la gestiona.
- Columna **Dies en contacte** amb format condicional: groc a partir de 7 dies i vermell a partir de 14 (configurable).
- Reconciliació automàtica després d'enganxats, esborrats múltiples o eliminació de files, i reconciliació diferida si el sistema està ocupat.
- Menú **Pràctiques** al fitxer compartit per actualitzar la publicació, auditar, reconciliar i reinstal·lar el sistema.

## Instal·lació

1. Crea (o duplica) els dos fitxers amb els fulls indicats a dalt.
2. Obre el **fitxer compartit** i ves a **Extensions → Apps Script**.
3. Substitueix el contingut de `Code.gs` pel contingut de [`script.gs`](script.gs).
4. Copia l'ID del **fitxer mestre** de la seva URL (el text entre `/d/` i `/edit`) i enganxa'l a l'inici de l'script:
   ```js
   MASTER_SPREADSHEET_ID: 'ENGANXA_AQUI_ID_FITXER_MESTRE',
   ```
5. Desa l'script.
6. Executa manualment `instal_larSistema()` una vegada **amb el compte de la coordinació** i accepta els permisos.
7. Recarrega el fitxer compartit. Hi apareixerà el menú **Pràctiques**.

No cal crear triggers a mà: `instal_larSistema()` elimina els antics i en crea tres de nous (edició del compartit, canvi estructural del compartit i edició del mestre).

### Actualitzar una instal·lació existent

1. A l'editor d'Apps Script, copia l'ID real de `MASTER_SPREADSHEET_ID`.
2. Substitueix el contingut de `Code.gs` pel nou [`script.gs`](script.gs), torna a posar-hi l'ID real i desa.
3. Executa **Pràctiques → Reinstal·lar / actualitzar sistema** amb el compte de la coordinació i, després, **Pràctiques → Auditar sistema**.

La reinstal·lació no esborra dades: substitueix els triggers, refà les validacions i el full auxiliar, reconcilia i torna a publicar.

> **Atenció:** no publiquis l'ID real del fitxer mestre en aquest repositori. Mantén el valor de mostra a `script.gs` i posa l'ID real només a la còpia de l'editor d'Apps Script.

### Configuració

A l'objecte `CFG`, a l'inici de l'script, es poden ajustar:

| Clau | Per defecte | Descripció |
|---|---|---|
| `GRUPS` | 11 grups | Noms dels fulls de grup |
| `MAX_ACORDS_PER_GRUP` | `100` | Files gestionades per full de grup |
| `CONTACTE_AVIS_DIES` | `7` | Dies per marcar un contacte en groc |
| `CONTACTE_CRITIC_DIES` | `14` | Dies per marcar un contacte en vermell |

Si canvies l'estructura de columnes, els noms dels grups o els estats, revisa l'script abans de fer-lo servir.

## Proves recomanades

Abans de passar a producció, instal·la el sistema en còpies dels dos fitxers i prova com a mínim:

- Contacte + ID
- Contacte → Acord
- Eliminar un contacte
- Acord + ID directe
- Acord + propi
- Canviar una oferta per una altra
- Esborrar completament una fila
- Eliminar físicament una fila
- Intentar assignar la mateixa oferta des de dos grups alhora: se l'ha de quedar el primer grup
- Una oferta amb el telèfon escrit sense espais (`0034...` o `+34...`): s'ha de copiar igual al grup
- Enganxar dades d'una oferta activa al mestre: s'han de copiar a la fila del grup

## Proves automatitzades

La carpeta [`tests/`](tests/) conté proves d'integració que executen `script.gs` sense modificar-lo sobre dobles en memòria dels serveis d'Apps Script. No cal cap dependència externa, només Node.js 22 o posterior. Es poden executar en un contenidor, sense instal·lar res a la màquina:

```sh
docker run --rm --network none -v "$PWD":/app:ro -w /app node:22-alpine node --test "tests/**/*.test.js"
```

O bé construint la imatge:

```sh
docker build -t practiques-tests .
docker run --rm practiques-tests
```

Amb Node instal·lat, n'hi ha prou amb `npm test`. GitHub Actions executa les mateixes proves a cada push i a cada PR ([`.github/workflows/proves.yml`](.github/workflows/proves.yml)).

A més del comportament, les proves de [`rendiment.test.js`](tests/rendiment.test.js) fixen el nombre màxim de crides a l'API de Sheets, d'escriptures i de cel·les llegides de les operacions principals, per detectar regressions de rendiment.

Les proves no substitueixen la prova manual en còpies dels fitxers reals: no cobreixen els bloquejos reals, el temps dels triggers, els permisos ni la visualització dels desplegables.

## Documentació

- [Guia d'instal·lació](Documentació-Instal·lació_script.md)
- [Guia d'ús per a la coordinació](Documentació-Coordinació.md)
- [Guia d'ús per als tutors](Documentació-Tutories.md)

## Nou curs acadèmic

El sistema està pensat per fer servir un joc de fitxers per curs. Abans de començar un curs nou:

1. Duplica els dos fitxers i conserva els originals com a historial.
2. Revisa els noms dels grups a `CFG.GRUPS`.
3. Actualitza `MASTER_SPREADSHEET_ID` amb l'ID del nou fitxer mestre i torna a executar `instal_larSistema()`.
4. Fes una prova amb una oferta fictícia.

## Nota de desenvolupament

Aquest projecte s'ha desenvolupat sota direcció i revisió humanes, amb el suport d'eines d'intel·ligència artificial en parts del codi, la depuració i la documentació. Les decisions sobre el funcionament del sistema i la responsabilitat sobre el resultat corresponen a la persona responsable del projecte.
