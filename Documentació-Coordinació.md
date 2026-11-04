# Guia d'ús \- Coordinació de pràctiques

## 1\. Per a què serveix el sistema?

El sistema permet registrar totes les ofertes de pràctiques rebudes i publicar als tutors només les que encara estan disponibles.

Hi ha dos fitxers:

- **Ofertes de pràctiques \- Coordinació**: fitxer mestre, d'ús exclusiu de la coordinadora.  
- **Gestió de pràctiques \- Tutors**: fitxer compartit amb els tutors.

>   
> **Important:** el fitxer de Coordinació és el registre mestre. No s'ha de compartir amb els tutors, perquè conté les dades de contacte de les empreses.

## 2\. Què ha de fer la coordinadora quan rep una oferta?

Afegir una fila nova a *Ofertes mestre* i completar les dades disponibles.

### Camps principals

- **ID oferta**: número únic de l'oferta. S'assigna automàticament en començar a completar una fila nova. Si la fila ja té contingut però no té ID, el sistema l'hi assigna en la propera edició.  
- **Estat**: situació actual de l'oferta.  
- **Empresa**, **Persona contacte**, **Correu electrònic**, **Telèfon** i **Adreça**: dades que els tutors no veuran mentre l'oferta sigui simplement publicada.  
- **Cicle**, **Tasques**, **Torn pràctiques**, **Localitat**, **Data incorporació**, **Modalitat** i **Comentaris**: informació que sí es publica als tutors.

Un telèfon escrit només amb xifres es converteix en un número i perd els zeros inicials i el signe `+` (`0034...`, `+34...`). Per conservar-los, escriu-lo amb un apòstrof al davant (`'0034930000001`), amb espais (`+34 930 000 001`) o dona format de text pla a la columna *Telèfon*. El sistema copia als tutors el telèfon exactament com queda al mestre.

Les columnes *Gestionada per*, *Data contacte* i *Dies en contacte* són controlades pel sistema quan un tutor comença a gestionar una oferta.

Si corregeixes les dades de l'empresa d'una oferta *Contactada* o *Assignada* (editant una cel·la o enganxant-ne diverses), el sistema les copia a la fila del grup que la gestiona.

## 3\. Estats de les ofertes

### Esperant informació

L'oferta encara no està preparada per publicar-se perquè falta informació de l'empresa.

### Pendent

L'oferta està disponible.

Quan una oferta passa a *Pendent*, apareix automàticament a la pestanya *Ofertes* del fitxer compartit.

### Contactada

Un tutor ha reservat l'oferta perquè s'ha posat en contacte amb l'empresa.

En aquest moment:

- deixa d'estar disponible per als altres tutors;  
- *Gestionada per* indica quin grup la gestiona;  
- *Data contacte* registra quan va començar la gestió;  
- *Dies en contacte* mostra quant temps porta en aquest estat.

### Assignada

El contacte ha acabat en un acord.

L'oferta continua vinculada al grup. *Data contacte* es conserva com a registre d'auditoria (indica quan es va iniciar el contacte original), però *Dies en contacte* queda buit perquè ja no cal controlar la durada del contacte.

### Posposada

Ara no podem oferir alumnat a l'empresa, però l'empresa vol reprendre el procés de selecció més endavant.

- Només la coordinadora la pot marcar com a *Posposada*.  
- No es publica: els tutors no la veuen.  
- Si un tutor l'està gestionant (*Contactada* o *Assignada*), primer l'ha d'alliberar.  
- Pots anotar a *Comentaris* quan cal tornar a contactar l'empresa (per exemple, «tornar a trucar al febrer»). Els tutors no ho veuen mentre l'oferta estigui posposada.  
- Per reprendre-la, torna-la a posar a *Pendent* i es tornarà a publicar.

### Descartada

L'oferta no s'utilitzarà.

Només la coordinadora ha de marcar una oferta com a *Descartada*.

## 4\. Control de les ofertes Contactades

La columna *Dies en contacte* serveix per detectar ofertes que fa massa temps que estan reservades sense arribar a acord.

Si una oferta roman molts dies com a *Contactada*, la coordinadora pot preguntar al tutor responsable què està passant.

El color de la cel·la ajuda a identificar visualment els contactes que s'estan allargant.

## 5\. Què veuen els tutors?

A la pestanya *Ofertes* del fitxer compartit només apareixen les ofertes que estan *Pendent*.

Els tutors hi veuen:

- ID oferta  
- Cicle  
- Tasques  
- Torn pràctiques  
- Localitat  
- Data incorporació  
- Modalitat  
- Comentaris

No hi veuen el nom de l'empresa ni les dades de contacte.

Quan un tutor registra un *Contacte* i selecciona una oferta, el sistema reserva l'oferta i mostra les dades necessàries a la fila del seu grup.

## 6\. Si un contacte no prospera

El tutor ha d'eliminar/alliberar aquell contacte al seu full de grup.

El sistema torna automàticament l'oferta a *Pendent* perquè pugui ser gestionada de nou.

Si l'empresa vol continuar més endavant, la coordinadora l'ha de passar a *Posposada*. Si l'oferta realment s'ha de rebutjar, l'ha de passar a *Descartada*.

## 7\. Què no convé fer manualment?

Per evitar incoherències:

- no dupliquis un ID oferta;  
- no modifiquis manualment *Gestionada per*;  
- no introdueixis manualment *Data contacte* o *Dies en contacte*;  
- no enganxis *Contactada* o *Assignada* manualment a la columna *Estat* \- el sistema revertirà a *Pendent* qualsevol estat actiu que no estigui recolzat per un registre coherent als fulls de grup;  
- no intentis alliberar des del mestre una oferta que encara està vinculada a un registre d'un grup;  
- no comparteixis el fitxer mestre amb els tutors.

Les assignacions i els alliberaments s'han de produir des de les pestanyes dels grups.

## Origen dels registres dels grups

Quan el registre procedeix d'una oferta publicada, *Origen* és l'ID de l'oferta.

Si l'acord s'ha aconseguit per una via diferent de les ofertes publicades, *Origen* és *propi*.

## 8\. Resum del flux habitual

```
Es rep una oferta
        ↓
Esperant informació   (si encara falten dades)
        ↓
Pendent               → visible als tutors
        ↓
Contactada            → un tutor la reserva
        ↓
Assignada             → es formalitza l'acord
```

Si el contacte no prospera:

```
Contactada → Pendent
```

Si l'empresa vol continuar més endavant:

```
Coordinadora → Posposada → (més endavant) Pendent
```

Si una oferta s'ha de rebutjar:

```
Coordinadora → Descartada
```

## 9\. Documentació per a cursos futurs

El sistema està pensat per utilitzar un conjunt de fitxers per curs acadèmic.

El fitxer mestre pot contenir centenars d'ofertes. No està limitat als 100 registres de les pestanyes de grup.

Abans de començar un curs nou és recomanable:

- duplicar els fitxers del sistema;  
- conservar els originals del curs anterior com a historial;  
- revisar els noms dels grups;  
- comprovar que l'script continua vinculat al nou fitxer mestre;  
- fer una prova amb una oferta fictícia abans de començar a treballar.

Si en el futur es modifica l'estructura de columnes, els noms dels grups o els estats, també s'ha de revisar l'script abans d'utilitzar el sistema.  
