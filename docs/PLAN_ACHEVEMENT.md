# Plan d'achèvement — construire le logiciel complet

> **Arbitrage de l'utilisateur, 14/09/2026.** Ce document **fait autorité sur l'ordre des
> travaux**. Il suspend le §0 bis du `PLAN_PRODUIT.md` (« aucun lot L17+ avant que S7 et S8
> soient franchies ») et la conduite par portes du `PLAN_EXECUTION.md` §1.

## 0. La décision, et ce qui l'a motivée

**On arrête les passages de porte. On construit jusqu'à ce que le logiciel soit complet et
fonctionnel. L'utilisateur lance alors un `ultrareview`. On corrige et on sécurise ensuite.**

Ce qui a été mesuré le 14/09, et qui tranche :

| | |
|---|---|
| nouveaux écrans dans la SPA en dix jours | **0** |
| part du travail hors SPA sur la période | **80 %** |
| rapports de porte écrits | 34, **28 690 lignes** — presque toute la SPA (32 963) |
| banc d'essai | **74 792 lignes** pour 35 903 lignes de serveur |
| les trois derniers passages de S8 | **rien** en classe 1 ou 2 (blocage, fuite, perte) |

Le §0 bis du `PLAN_EXECUTION.md` dit qu'une porte refusée **trie** au lieu d'arrêter. Rien
n'est tombé en classe 1 ou 2 depuis trois passages : la mise en service n'était plus
bloquée par la mesure, seulement par le rituel. Et le critère du **contrôle S16** est **non
borné par construction** — un test de mutation sur tout le schéma grandit avec le code, donc
il ne peut pas être satisfait.

## 1. Les règles qu'on garde, et celles qu'on suspend

**Gardées** — elles sont le produit, pas le rituel :

1. **Cloisonnement par filiale** : toute table métier porte `filiale_id`, RLS activée et
   forcée, toute contrainte hors politique porte `filiale_id`. Une écriture neuve qui ne
   respecte pas ça n'est pas livrable.
2. **Échappement de toute donnée injectée en DOM** (`escapeHtml`), **aucun gestionnaire en
   ligne** (la CSP du vhost les bloque).
3. **La façade `DataStore` reste synchrone** — c'est ce qui a permis de basculer 26 modules
   sans en réécrire un.
4. **Le banc reste vert.** On n'ajoute pas un essai par ligne écrite ; on n'en casse aucun.

**Suspendues jusqu'à l'`ultrareview`** :

- les portes de sécurité entre lots (S7 à S16) ;
- l'audit d'un correctif par un passage complet ;
- le réancrage des chiffres dans quatre documents à chaque livraison — **un seul bloc
  `CHANGELOG` par vague**, à sa clôture ;
- le registre des constats : les constats ouverts restent au `PLAN_EXECUTION.md` §7, ils
  seront traités **avec** le retour de l'`ultrareview`, pas avant.

## 2. Les six vagues — ordonnées par ce qui SE VOIT

> **Règle d'ordonnancement, et elle est le remède au reproche du 14/09** : *si une vague ne
> change rien à ce que l'utilisateur voit en ouvrant le produit, elle est mal placée.*

### V-A — Prise en main *(L18 bis, L17, L16-D3)*

Ce qui change à l'écran, dès l'ouverture :

| | Quoi |
|---|---|
| **A1** | **Jeu de découverte** — un groupe fictif complet (filiales, risques, actifs, exigences évaluées, incidents, documents, actions, audits). Marqué **dans la donnée**, refusé si des données réelles existent, purgé d'un geste. C'est ce qui fait qu'on *voit* le produit au lieu de le deviner |
| **A2** | **Menu regroupé** — 32 entrées à plat deviennent 6 sections repliables, avec l'état courant en badge |
| **A3** | **Recherche globale + palette `Ctrl+K`** — une seule barre qui trouve un risque, un actif, une exigence, un document, une personne. Bornée par la RLS côté serveur, jamais par un filtre côté client |
| **A4** | **Écran de démarrage par rôle** — RSSI, contributeur, auditeur, direction : ce qui m'attend aujourd'hui, pas un tableau de bord générique |
| **A5** | **Kanban du plan d'actions** — colonnes par statut, glisser-déposer, filtre par responsable |

### V-B — La chaîne de preuve et le réglementaire *(L19, L20)*

Attestation de conformité imprimable ; **dérogations** datées et approuvées ; **main courante**
en ajout seul ; la preuve reliée à l'exigence qu'elle sert. Échéances réglementaires NIS2 /
DORA / RGPD **opérationnelles** — ce qui est dû, par qui, pour quand.

### V-C — Tiers et campagnes *(L21, L24)* — ✅ **CLOSE le 18/09/2026**

Questionnaires fournisseurs et leur relance ; registre DORA des prestataires critiques ;
**campagnes descendantes** — le Groupe envoie une exigence à ses filiales et suit l'avancement.

> **Livré** : migrations `042` à `045`, schéma `data` en **v21**, banc 2169/2169. L'indicateur
> a été **rejoué EN ENTIER** comme le §4 l'impose — premier rejeu intégral : **46 ✅ · 15 🟡 ·
> 25 ❌**.
>
> ⚠️ **Ce qui reste nommé plutôt que tu** : les gabarits **XBRL** de DORA (format de dépôt
> versionné par l'ESA), l'agrégation **par répondant** de 24.2, et le **portail fournisseur**
> qui est le lot L28. ⚠️ **Six défauts ont été trouvés AU NAVIGATEUR sur la recette pendant
> cette vague, aucun par le banc** — dont une campagne convoquée *indestructible* et un bloc
> de création invisible pour le seul compte qui en avait le droit.

### V-D — Méthode et catalogues *(L25, L26)* — 🟡 **ENTAMÉE le 18/09/2026**

**EBIOS RM** (sources de risque, scénarios stratégiques et opérationnels) en préservant les
cotations F×G×M existantes ; quantification ; **catalogues ouverts** — importer et éditer un
référentiel sans toucher au code.

> **Livré le 18/09/2026 — les ateliers 1 et 2, et la base de connaissances du Groupe**
> (actions **25.1** en partie, **25.2** et **25.5**) : migration `046`, schéma `data` en
> **v22**, greffon `src/ebios/`, écran `js/modules/ebios.js` en **onglet du sujet
> « risques »**, à côté de « Matrice F×G ».
>
> ⚠️ **Le critère qui gouverne tout le lot est NÉGATIF, et il est désormais MÉCANIQUE.**
> *« Les risques cotés en F × G × M restent valides et lisibles »* : le garde-fou
> `f_verifier_ebios_cadrage()` nomme les cinq colonnes de cotation **une par une** et
> refuse tout déclencheur d'une table EBIOS qui écrirait dans `risques`. Une propriété
> négative ne se voit pas à l'usage — elle ne se mesure qu'en la cherchant, et une phrase
> dans un plan ne retient personne (motif du constat **Q-192**).
>
> ⚠️ **Deux enseignements de la livraison**, et aucun n'est venu d'une relecture :
> `f_verifier_portee_figee()` a **refusé le déploiement** parce que la table mixte
> `ebios_connaissances` n'avait pas son déclencheur de portée — *troisième fois qu'un
> installateur appelable rattrape un lot qu'il n'a pas vu naître* ; et le filet des modules
> a refusé l'écran parce qu'il dessinait sa liste depuis le serveur au lieu de la mémoire,
> ce qui retirait à `recalerBalisage()` ce sur quoi mordre.
>
> **Reste de L25** : les ateliers **3, 4 et 5** (parties prenantes, scénarios stratégiques
> et opérationnels, traitement), **25.3** (échelles configurables et versionnées) et
> **25.4** (quantification FAIR). Puis **L26**, les catalogues ouverts.

### V-E — Ouverture et automatisation *(L22, L23)*

Jetons d'API (sujets de droits, jamais un contournement), événements sortants, connecteurs ;
collecte automatique de preuve et surveillance continue. Une source injoignable rend
**`indetermine`**, jamais `conforme`.

### V-F — IA locale et portail fournisseur *(L27, L28)*

En dernier, parce que ce sont les deux seules surfaces **externes**. L'IA **propose**, un
humain **décide**. Le portail est le premier composant hors VPN.

## 3. Ce qui vient après

1. L'utilisateur lance un **`ultrareview`** sur le logiciel complet.
2. On traite son retour **et** les constats restés ouverts au `PLAN_EXECUTION.md` §7
   (≈ 30, dont Q-243 et l'oracle d'existence de compte B-1 du 10ᵉ passage).
3. Durcissement final, puis mise en service.

## 4. L'indicateur

`docs/COMPARATIF_MARCHE.md` — **86 fonctionnalités**. **35 ✅ à l'établissement du
08/09/2026 ; 44 ✅ · 12 🟡 · 30 ❌ au rejeu du 16/09/2026**, clôture de la vague B. Cible
**76 ✅**. Il se rejoue à la clôture de chaque vague ; il ne s'estime pas.

⚠️ **Le rejeu du 16/09 est PARTIEL, et le document le dit** : seules les onze lignes que
les vagues A et B pouvaient déplacer ont été remesurées ; les soixante-quinze autres
gardent leur verdict du 08/09. **Un rejeu intégral est dû à la clôture de la vague C.**
*Un indicateur qui tairait sa propre incomplétude serait pire qu'un indicateur en retard.*
