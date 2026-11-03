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

## Comportament principal

| Acció | Resultat |
| :---- | :---- |
| **Contacte \+ ID Pendent** | L'oferta passa a *Contactada*, queda *Gestionada per* aquell grup i s'enregistra *Data contacte*. |
| **Contacte → Acord** mantenint l'ID | L'oferta passa a *Assignada*. *Data contacte* es conserva com a registre d'auditoria. |
| **Acord \+ ID Pendent** | L'oferta passa directament a *Assignada*. |
| **Acord \+ propi** | No consumeix cap oferta. |
| **Esborrar/alliberar** un Contacte o Acord vinculat a una oferta | L'oferta torna a *Pendent*. |
| **Descartada** | Només es pot establir des del fitxer mestre de coordinació. |

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
- intent simultani d'assignar la mateixa oferta des de dos grups.

