# Plan d'interface — rendre les sections cohérentes

> **Demandé par l'utilisateur le 16/09/2026**, en ces termes : *« il faut rendre plus
> cohérentes les interfaces des sections du logiciel, elles étaient prévues pour une
> utilisation sans conservation de données et maintenant sont prévues pour une conformité
> RGPD. Réorganise le travail pour assurer la pertinence des différentes voies dans les
> sections, éviter les redondances et les répétitions, ainsi que rendre l'interface
> professionnelle, comme dans les grands logiciels de GRC. »*
>
> Ce document **réordonne le travail** du `docs/PLAN_ACHEVEMENT.md` : l'interface passe
> devant la suite de la vague B. Il ne suspend rien d'autre.

---

## 1. Le diagnostic — mesuré, pas ressenti

Le menu porte **32 entrées** réparties en **six sections**, et `js/app.js` déclare
**49 routes**. L'écart n'est pas anodin : il dit que des écrans existent sans porte, et
que d'autres ont une porte pour ce qui n'est qu'une **vue** d'un objet déjà présent
ailleurs.

### 1.1 Ce qui est un DOUBLON de point de vue, pas une entité

| Entrée | Ce qu'elle est réellement | Où elle appartient |
|---|---|---|
| `/matrice` — « Matrice des risques » | une **vue** des risques (bulles F×G), aucune entité propre | onglet de **Risques** |
| `/socle` — « Socle de risques » | le **catalogue** des risques du Groupe (`risque_catalogue`) | onglet de **Risques** |
| `/referentiels-actifs` — « Référentiels applicables » | *quels référentiels s'appliquent ici* (`referentiels_actifs`) | onglet de **Référentiels** |
| `/couverture` — couverture croisée | une **vue** de la conformité — ⚠️ **et elle n'a AUCUNE entrée de menu** : on n'y arrive que par trois liens en bas d'autres écrans | onglet de **Référentiels** |

⚠️ **Quatre entités de conformité, six portes, et l'une des six manquante.** C'est le
symptôme le plus net de l'héritage : chaque capacité livrée a reçu son écran, parce que
c'était le geste le moins cher — jamais sa place dans un ensemble.

### 1.2 Ce qui est RANGÉ AU MAUVAIS ENDROIT

| Entrée | Aujourd'hui | Pourquoi c'est faux | Où |
|---|---|---|---|
| `/prestataires` — « Prestataires & Tiers » | *Continuité (ISO 22301)* | un prestataire est un **tiers**, exactement comme un donneur d'ordre. Le ranger sous la continuité vient de ce qu'on l'a écrit en même temps que le PRA | **Tiers**, avec `/clients` |
| `/audits` — « Contrôles & Audits » | *Continuité (ISO 22301)* | un audit interne porte sur **tout** le SMSI, pas sur la continuité | **Opérations** |
| `/groupe` — « Vision Groupe » | *Administration* | c'est l'écran de la **direction**, celui d'une revue de direction | **Pilotage** |
| `/approbations` | *Administration* | approuver une politique ou accepter un risque est un acte **métier**, pas d'administration | **Documentation** |

### 1.3 L'héritage « sans conservation de données », nommément

Le produit a été conçu pour vivre **dans un navigateur, sans serveur** : la donnée
appartenait à l'utilisateur, qui devait l'exporter lui-même sous peine de la perdre. Trois
traces en subsistent, et elles sont désormais **fausses ou trompeuses** :

1. **`/settings` — « Paramètres & Data »** est un écran d'**export / import de
   sauvegarde**. Sur un produit serveur, la sauvegarde est l'affaire de l'exploitant
   (`pg_dump`, instantané de VM), pas celle du RSSI ; et l'export d'un jeu complet est
   désormais une **permission** (`GRC-EXPORT`) parce qu'il sort la cartographie des
   faiblesses du groupe. ⚠️ Le mot « Data » n'est même pas français, dans un produit dont
   la convention est *« UI en français »*.
2. **Le vocabulaire de la sauvegarde** parle encore de « sauvegarde » là où l'enveloppe
   `grc-backup` est devenue un **format d'échange** (reprise d'un poste, sortie de
   filiale). `docs/DATA_MODEL.md` §1 le dit déjà ; l'écran, non.
3. **Le RGPD n'a qu'une entrée** (`/rgpd`), alors que le produit porte maintenant le
   registre de l'article 30, **le registre des données personnelles du produit lui-même**
   (migration `026`), la **purge** et ses régimes d'expiration, et la **classification**
   des documents (`027`). C'est la matière qui a le plus grandi, et la seule dont
   l'interface n'a pas bougé d'un pixel.

### 1.4 Ce qui se répète d'un écran à l'autre

Chaque module compose **son propre en-tête** : `<div class="dashboard-header">` recopié
vingt-six fois, avec à chaque fois son titre, son sous-titre, ses boutons, et sa propre
idée de l'espacement. Trois conséquences mesurables :

- les **tailles sont posées au cas par cas**, et le chiffre est sans appel : l'échelle
  typographique existe (`--text-xs` … `--text-2xl`) et **aucun des 36 modules ne l'emploie
  — zéro**. À la place, **278 déclarations `font-size` en dur, portant 42 valeurs
  distinctes**, dont `0.7rem`, `.7rem`, `0.72rem`, `.72rem`, `0.74rem`, `0.75rem`,
  `0.76rem` et `0.78rem` — huit tailles pour ce qui est visuellement la même. *Une échelle
  que personne n'emploie n'est pas une échelle, c'est une intention.*
- les **styles en ligne** foisonnent — `audits.js` en porte **118**, `pra_scenarios.js`
  68, `dashboard.js` 62 —, ce qui rend tout changement global impossible sans repasser sur
  trente-six fichiers ;
- **trente modules recomposent `dashboard-header`** à la main, chacun avec sa propre idée
  du sous-titre, des boutons et de l'espacement : un écran sur deux annonce son périmètre,
  l'autre non ; un sur trois porte un bouton d'import, les autres non — **sans règle**.

---

## 2. Les principes, et ils tiennent en quatre lignes

1. **Une entrée de menu = un OBJET qu'on gère.** Une *vue* d'un objet est un onglet, pas
   une entrée. C'est ce qui fait qu'un grand logiciel de GRC tient en huit entrées là où
   celui-ci en porte trente-deux.
2. **Une section = une question métier**, pas un référentiel ni un ordre de livraison.
3. **Un écran ne se compose plus lui-même** : en-tête, onglets, filtres et tableau
   viennent d'un composant partagé. *Ce qui se recopie vingt-six fois diverge vingt-six
   fois.*
4. **Le vocabulaire dit ce que le produit FAIT aujourd'hui**, pas ce qu'il faisait quand
   il vivait dans un navigateur.

---

## 3. Les quatre phases, dans l'ordre de ce qui SE VOIT

### I-1 — L'architecture du menu *(aucun écran réécrit)*

Déplacer, renommer, et ouvrir la porte qui manque. Ne touche que `index.html`, les
dictionnaires `js/i18n/`, et la table des domaines de `js/app.js`.

| Section | Entrées |
|---|---|
| **Pilotage** | Tableau de bord · Synthèse Direction · Échéancier · **Vision Groupe** |
| **Risques & patrimoine** | Actifs · Cartographie · **Risques** *(onglets : registre, matrice, socle)* · BIA |
| **Conformité** | **Référentiels** *(onglets : catalogue, applicables, couverture)* · Exigences · Mesures de sécurité · Correspondances · **Audits** |
| **Opérations** | Plan d'actions · Incidents |
| **Documentation & RGPD** | Documents · **Registre RGPD** · Approbations |
| **Continuité** | Cellule de crise · Scénarios PCA/PRA · Actions préalables · Historique des tests |
| **Tiers** | Donneurs d'ordre · Prestataires · Personnel |
| **Administration** | Imports · Journal d'audit · Paramètres |

**32 entrées → 26**, et **zéro écran sans porte**.

⚠️ **`BIA` reste avec les risques et non avec la continuité**, à contre-courant de l'ISO
22301 : un bilan d'impact métier est ce qui *justifie* les RTO/RPO, et l'utilisateur le
remplit en même temps qu'il recense ses actifs. La norme range par chapitre ; un logiciel
range par geste.

### I-2 — Le gabarit d'écran partagé

Un seul composant `UI.pageHtml({ titre, contexte, onglets, actions })`, employé par les
vingt-six modules. Il apporte d'un coup : l'échelle typographique, le fil d'Ariane, la
barre d'onglets, la place des actions, et l'impression.

C'est **le plus gros gain visuel du chantier**, et c'est aussi ce qui rend le prochain
changement possible en un fichier.

### I-3 — La section RGPD à la hauteur de ce que le produit porte

`/rgpd` devient l'écran d'un DPO, en onglets : **Traitements** (article 30) ·
**Données du produit** (le registre `colonnes_personnelles`) · **Purge & rétention** ·
**Documents classifiés**. Les actions **20.3 (AIPD)** et **20.4 (demandes de droits)** du
`PLAN_ACHEVEMENT` y entrent comme onglets, au lieu de deux entrées de menu de plus.

### I-4 — Solder l'héritage « sans conservation »

`/settings` est scindé selon **qui** s'en sert : ce qui relève de l'**exploitant** part au
guide d'exploitation ; ce qui reste à l'écran est l'**échange de données** (reprise d'un
poste, export de filiale), nommé comme tel, et soumis au droit d'export.

---

## 4. Ce que ce plan ne fait pas

- **Il ne réécrit pas les 26 modules métier.** La façade `DataStore` reste synchrone, les
  formulaires restent où ils sont. On change l'**enveloppe**, pas le contenu.
- **Il ne change aucune donnée, aucune route serveur, aucun droit.** Une entrée de menu
  déplacée ne déplace pas un domaine de droits : `js/app.js` continue de dire quel domaine
  chaque route met en jeu, et `verifierCouvertureDesRoutes()` continue de rougir si une
  route n'en a pas.
- **Il ne touche pas à la charte** : orange `#E9631B`, bleu `#2059A6`, quatre couleurs
  sémantiques réservées aux statuts, aucune police chargée depuis un réseau, aucun emoji.
