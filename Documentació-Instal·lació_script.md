# Instal·lació \- Control de pràctiques amb dos fitxers

## Fitxers

- **Fitxer mestre (privat):** Ofertes de pràctiques \- Coordinació  
  - Full obligatori: *Ofertes mestre*  
- **Fitxer compartit:** Gestió de pràctiques \- Tutors  
  - Full obligatori: *Ofertes*  
  - Fulls de grup: GA1A, GA1B, GA1C, GA2A, GA2B, GAJ1, GAJ2, AF1M, AF1T, AF2M, AF2T

## Instal·lació

1. Obre el fitxer compartit.  
2. Ves a **Extensions → Apps Script**.  
3. Substitueix el contingut de `Code.gs` per tot el contingut de `script.gs`.  
4. Obre el fitxer mestre i copia el seu ID de la URL. És el text situat entre `/d/` i `/edit`.  
5. A l'inici de l'script, substitueix:

   ```js
   MASTER_SPREADSHEET_ID: 'ENGANXA_AQUI_ID_FITXER_MESTRE'
   ```

   per l'ID real.

6. Desa l'script.  
7. Executa manualment `instal_larSistema()` una vegada amb el compte de la coordinadora.  
8. Accepta els permisos que demani Google. El sistema necessita accedir tant al fitxer compartit com al mestre privat.  
9. Recarrega el fitxer compartit.

No cal crear els triggers manualment. `instal_larSistema()` elimina els triggers antics d'aquest sistema i en crea tres de nous:

- edició del fitxer compartit;  
- canvi estructural del fitxer compartit;  
- edició del fitxer mestre.

## Actualitzar una instal·lació existent

Per passar a una versió nova de l'script (per exemple, de la v9 a la v10):

1. Al fitxer compartit, ves a **Extensions → Apps Script** i copia l'ID real del fitxer mestre que hi ha a `MASTER_SPREADSHEET_ID`.  
2. Substitueix tot el contingut de `Code.gs` pel nou `script.gs`.  
3. Torna a posar l'ID real a `MASTER_SPREADSHEET_ID` i desa l'script.  
4. Al fitxer compartit, executa **Pràctiques → Reinstal·lar / actualitzar sistema** amb el compte de la coordinadora.  
5. Executa **Pràctiques → Auditar sistema**: no hauria de detectar cap inconsistència.

La reinstal·lació no esborra cap dada: substitueix els triggers, refà les validacions i el full auxiliar, reconcilia i torna a publicar les ofertes.

## Comportament principal

| Acció | Resultat |
| :---- | :---- |
| **Contacte \+ ID Pendent** | L'oferta passa a *Contactada*, queda *Gestionada per* aquell grup i s'enregistra *Data contacte*. |
| **Contacte → Acord** mantenint l'ID | L'oferta passa a *Assignada*. *Data contacte* es conserva com a registre d'auditoria. |
| **Acord \+ ID Pendent** | L'oferta passa directament a *Assignada*. |
| **Acord \+ propi** | No consumeix cap oferta. |
| **Esborrar/alliberar** un Contacte o Acord vinculat a una oferta | L'oferta torna a *Pendent*. |
| **Descartada** | Només es pot establir des del fitxer mestre de coordinació. |
| **Dos grups trien la mateixa oferta** gairebé alhora | Se la queda el primer; el segon rep un avís i la seva cel·la *Origen* es buida. |
| **Tipus o Origen a la fila 102 o més avall** d'un full de grup | Es rebutja: el sistema gestiona les files 2 a 101 (`MAX_ACORDS_PER_GRUP`). |
| **Editar o enganxar dades de l'empresa** d'una oferta activa al mestre | Es copien a la fila del grup que la gestiona. |

*Contactada* i *Assignada* no es poden establir manualment al mestre; els genera el sistema. Si s'enganxen aquests valors, el sistema comprova que existeixi un registre coherent al fitxer compartit (el tipus del grup ha de correspondre amb l'estat i *Gestionada per* ha de coincidir amb el grup). Si no es compleixen aquestes condicions, l'estat es reverteix automàticament a *Pendent*.

## Publicació

El full *Ofertes* del fitxer compartit es regenera automàticament i mostra només:

| ID oferta | Cicle | Tasques | Torn pràctiques | Localitat | Data incorporació | Modalitat | Comentaris |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |

Només s'hi publiquen ofertes amb estat *Pendent*. No s'hi publica cap dada d'empresa o contacte.

## Autocompletat després de reservar una oferta

En seleccionar una oferta en un grup, el sistema emplena:

- Persona contacte  
- Correu  
- Telèfon  
- Adreça  
- Localitat  
- Nom empresa

Els valors es copien tal com són al mestre. Un telèfon escrit al mestre només amb xifres perd els zeros inicials i el signe `+`; per conservar-los, cal escriure'l amb un apòstrof al davant o amb espais (vegeu la guia de coordinació).

## Control de contactes antics

*Dies en contacte* és una fórmula automàtica i només mostra valor quan l'oferta és *Contactada*.

Els llindars inicials són configurables al principi de l'script:

- `CONTACTE_AVIS_DIES`: 7  
- `CONTACTE_CRITIC_DIES`: 14

A partir del primer llindar la cel·la es destaca en groc; a partir del segon, en vermell clar.

## Menú

Després de la instal·lació apareix el menú **Pràctiques** al fitxer compartit, amb opcions per:

- actualitzar la publicació;  
- auditar el sistema;  
- reconciliar-lo;  
- reinstal·lar/actualitzar el sistema.

## Recomanació abans de passar a producció

Fes la primera instal·lació en còpies dels dos fitxers i prova, com a mínim:

- Contacte \+ ID;  
- Contacte → Acord;  
- eliminar un contacte;  
- Acord \+ ID directe;  
- Acord \+ propi;  
- canvi d'una oferta per una altra;  
- esborrat complet d'una fila;  
- eliminació física d'una fila;  
- intent simultani d'assignar la mateixa oferta des de dos grups (se l'ha de quedar el primer);  
- una oferta amb el telèfon escrit sense espais (`0034...` o `+34...`), que s'ha de copiar igual al grup;  
- enganxar dades d'una oferta activa al mestre, que s'han de copiar a la fila del grup.

