# Reprendre le chantier — document de passation

> **Écrit le 16/09/2026.** Il s'adresse à une session Claude Code qui reprend le travail
> sans rien connaître de ce qui précède. Il ne remplace pas `CLAUDE.md` : il dit **ce qui a
> changé récemment**, **ce qui reste**, et **les pièges qui ont coûté cher**.

---

## 1. L'objectif, en une phrase

**Mener le logiciel jusqu'à complet et fonctionnel**, sans bug, avec une interface
**élégante et extrêmement professionnelle** — puis l'utilisateur lancera un `ultrareview`,
et l'on corrigera et sécurisera à partir de son retour.

---

## 2. Les cinq arbitrages de l'utilisateur qui priment sur les documents antérieurs

Ils sont datés, ils ont été rendus explicitement, et **aucun ne se re-débat**.

| | Arbitrage | Conséquence pratique |
|---|---|---|
| **A** | **On arrête les passages de porte** (14/09) | Ne pas rejouer S7/S8. Les constats ouverts du `PLAN_EXECUTION.md` §7 seront traités **avec** le retour de l'`ultrareview`, pas avant. Motif mesuré : 34 rapports pour 28 690 lignes, et **rien en classe 1 ou 2** aux trois derniers passages |
| **B** | **On construit jusqu'à complet** (15/09) | Suivre `docs/PLAN_ACHEVEMENT.md`. Six vagues, ordonnées par **ce qui se voit** |
| **C** | **Le frontend sera refait**, mais **son style se soigne dès maintenant** (15 puis 16/09) | Ne pas bâtir d'écrans jetables ; ne pas bâcler la couche API — c'est elle que le frontend neuf consommera. Mais **soigner le style** |
| **D** | **Style : avec la skill `ui-ux-pro-max`** (16/09) | `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux`. Elle **arbitre**, elle n'impose pas de palette. Pas de `--design-system`, pas de `--stack` |
| **E** | **AUCUN EMOJI**, style élégant et extrêmement professionnel (16/09) | Gardé par `backend/test/depot/aucun-emoji.test.mjs`. Les signes **typographiques** (`→`, `▸`, `·`, `—`) restent permis : ce sont du texte |

---

## 3. Comment jouer le banc — et pourquoi c'est important

```bash
cd backend && npm run banc          # deux passes, ≈ 11 min
cd backend && npm run banc:rapide   # sans les familles navigateur, ≈ 2 min
npm run verifier-types
```

**Ne jamais lancer `node --test` sur tout le dépôt sans `--test-concurrency`.** Mesuré : la
concurrence par défaut lance une trentaine de Chromium, la machine tombe à 134 Mio libres,
et des familles restent bloquées quarante-cinq minutes en ayant consommé cinq secondes de
processeur.

**Ne jamais lancer deux bancs complets en parallèle.** Un banc a tourné **6 h 03**, figé sur
un fichier qui passe en **six secondes** joué seul. `npm run banc` pose désormais un délai de
garde de six minutes par fichier — *un essai doit rougir, jamais se figer*.

**Méthode :** les familles touchées pendant le travail ; le banc **complet une seule fois**,
avant de commiter.

Répartition mesurée : les 115 familles sans navigateur passent en **126 s à concurrence 4** ;
les 19 qui lancent Chromium prennent **520 s** et doivent rester **en série**.

---

## 4. Où en est le travail

### Livré et déployé depuis le 14/09

| | |
|---|---|
| **Profil « répondant de campagne »** (L24, action 24.4) | Migration `045` : un **neuvième** profil de socle, trois domaines ouverts (`referentiels` et `exigences` en contribution, `echeances` en lecture) et vingt-sept **fermés nommément**. ⚠️ Il existe parce que la MESURE a démenti l'hypothèse : `CONTRIB` porte `actifs, actions, incidents, mco`, et aucun ne se projette sur `conformite` — un contributeur ne pouvait donc pas répondre à la campagne qu'on lui adresse. Élargir `CONTRIB` aurait accordé la conformité entière à tous les contributeurs de toutes les filiales. ⚠️ **Conséquence d'exploitation** : un groupe d'annuaire de plus par filiale (26 au lieu de 23 pour deux filiales) — `install.sh` aligne `groupes_ad` seul, `groupes-ad.sh --csv` rend la liste à créer dans l'AD |
| **Campagnes descendantes** (L24, ses quatre actions) | Le Groupe ouvre une campagne sur un référentiel, vers N filiales, avec échéance — et suit l'avancement de chacune. Migration `044`, schéma **v21**. ⚠️ **Une filiale ne voit QUE sa part**, ni celle de la voisine ni leur nombre ; l'avancement se **COMPTE** dans les évaluations ; les relances réutilisent L12 (9ᵉ source de l'échéancier, **aucune route d'envoi neuve**). ⚠️ **Deux leçons** : `campagnes` n'a pas de `filiale_id` et **trois garde-fous ont refusé la migration** jusqu'à ce que l'arbitrage soit écrit (`CONVENTIONS.md` §24.1) ; et **l'interdit « une filiale ne se retire pas d'une campagne » a dû être RETIRÉ**, parce qu'il rendait la reprise « remplacer » impossible — classe des trois conflits de la `041`, tranchée pareil : *restaurer une sauvegarde gagne* |
| **Déconvoquer** (L24, trouvé au navigateur) | ⚠️ **Sans elle, une campagne convoquée était INDESTRUCTIBLE**, et le défaut ne vivait dans aucune couche : la clé en `restrict` (juste), le chargement qui ne sert que la filiale active (juste), et un écran qui savait convoquer sans savoir déconvoquer. `POST /api/campagnes/:id/deconvoquer` + un bouton par part. ⚠️ Et mon premier correctif était FAUX — j'ai ajouté une inversion des suppressions sans voir que `appliquer()` en faisait déjà une : les deux s'annulaient, et le correctif introduisait le défaut |
| **Tiers, chaîne de sous-traitance et DORA** (L21, ses quatre actions) | Registre d'information DORA, **chaîne de sous-traitance** (l'arête est stockée, le **rang se dérive**, l'anti-cycle est **en base**), questionnaire fournisseur qui **s'exporte et se réimporte** — le produit n'envoie rien —, suivi contractuel, et **score composite dérivé** dont le barème est SERVI. Migrations `042` et `043`, schéma **v20**. ⚠️ **Deux leçons** : la `043` avait été livrée *mordue par rien* (23 essais et cinq mutations l'ont fermée), et le critère de 21.3 — « les échéances contractuelles alimentent l'échéancier existant » — **n'était tenu nulle part**, alors que la migration l'écrivait dans le commentaire de sa propre colonne |
| **Jeu de découverte** (L18 bis) | Un groupe industriel fictif complet. Marque de provenance posée **par la base**, inforgeable. Migration `032` |
| **Menu repliable** (L17, A2) | 32 entrées à plat → six sections |
| **Architecture des sections** (16/09) | **Sept** sections, **28** entrées : quatre vues redondantes deviennent des **onglets** (matrice, socle, référentiels applicables, couverture croisée), et la couverture — qui n'avait AUCUNE porte — en gagne une. Le fil d'Ariane déduit sa section du menu. `docs/PLAN_INTERFACE.md` |
| **Lien document ↔ mesure** (L19, 19.3) | « Montrez-moi la procédure » : le chaînon qui manquait entre la gouvernance et la preuve. Migration `036`, schéma **v15** |
| **Contrôle périodique et efficacité** (L19, 19.5 / 19.6) | Un contrôle se rejoue (fréquence, dernier passage, **échéance dérivée**) et son efficacité se constate **séparément de sa maturité**. Migration `037`, schéma **v16** |
| **Main courante de crise** (L20, 20.5) | **En ajout seul**, quatre couches du §12 réutilisées, chaîne **par incident** — ce qu'on produit en fin de crise est la main courante d'UNE crise. Aucun bouton « modifier » ni « supprimer », et un essai l'exige. Migration `041` |
| **Demandes d'exercice de droits** (L20, 20.4) | RGPD art. 15 à 22. L'échéance d'un mois se **dérive** de la réception ; un refus non motivé, une prorogation non notifiée et une réponse sans date sont **refusés par le schéma**. Migration `040`, schéma **v18** |
| **Analyse d'impact RGPD** (L20, 20.3) | Article 35. Elle **POINTE** le registre de l'article 30 au lieu de le recopier, son état se **dérive** de la date de revue, et le produit rend une **présomption** — jamais une décision : deux des trois cas de l'article 35 §3 ne sont pas mesurables avec ce que le registre porte. Migration `039`, schéma **v17** |
| **Réutilisation d'une preuve** (L19, 19.4) | Une procédure déposée **une fois** prouve cinq contrôles : une empreinte, un quota, une chose à mettre à jour. Le fichier n'est libéré qu'au **dernier** détachement, et l'écran dit « Détacher » tant qu'il reste un porteur. Migration `038` — schéma `data` **inchangé**, les pièces ne font pas partie de l'instantané |
| **Recherche globale + `Ctrl+K`** (L17, A3) | Cloisonnée par la RLS, bornée par les droits, budget de trace partagé avec le sondage |
| **Attestation de lecture** (L19, 19.1) | Preuve ISO 27001 A.5.1. Migration `033` |
| **Horloge réglementaire** (L20, 20.1) | Trois paliers NIS2 + 72 h RGPD, dérivés. Migration `034` |
| **Dérogations datées** (L19, 19.2) | L'état est **dérivé**, jamais stocké : une dérogation échue redevient une non-conformité sans qu'aucun traitement n'ait à repasser. Approbation par le circuit L8, inchangé. Migration `035`, schéma **v14** |
| **Les trois écrans qui manquaient** (16/09) | 19.1, 19.2 et 20.1 étaient livrées côté serveur et **aucun écran ne les appelait** — `documents.attestation_requise` n'était même posable par aucun formulaire |
| **Passe de style** | Échelle typographique, chasse fixe pour ce qui se recopie, tableaux (en-tête collant, nombres alignés), impression |

⚠️ **La leçon du 18/09, et c'est la QUATRIÈME fois en quatre jours** : *vérifier au
navigateur sur la recette trouve ce que deux mille essais ne voient pas.* Le parcours complet
de L21 — créer un tiers, ses dates de contrat, un questionnaire, consigner l'envoi, regarder
l'échéancier, supprimer le tiers — tenait partout **sauf à la dernière étape** : l'échéancier
gardait l'échéance d'un questionnaire dont le porteur venait d'être supprimé. La base
cascade ; la façade en mémoire ne le refaisait pas. *Un défaut peut ne vivre ni dans la base,
ni dans la route, mais dans l'écart entre deux cascades* — et aucune des deux moitiés n'a
tort seule, ce qui est exactement pourquoi le banc ne le voyait pas.

⚠️ **La leçon du 16/09, et elle vaut pour toute la suite** : *une capacité qu'aucun écran
n'appelle est une capacité absente.* Trois lots de suite ont été livrés, éprouvés et verts
sans que personne puisse s'en servir. Un lot n'est fini que lorsqu'un utilisateur peut
l'atteindre — et c'est `test/modules/non-regression.test.mjs` qui le dit, en comptant les
modules du produit.

### Ce qui reste — dans cet ordre

**Vague B, à finir :**

- ~~**19.2** dérogations datées~~ — ✅ **livré le 16/09** (migration `035`) ;
- ~~**19.3** lien document ↔ mesure~~ — ✅ **livré le 16/09** (migration `036`) ;
- ~~**19.4** réutilisation d'une preuve~~ — ✅ **livré le 16/09** (migration `038`).
  ⚠️ **L'invariant est POSÉ, pas surveillé** : `fk_pieces_jointes_adresse`, différée,
  impose que l'adresse de délivrance d'une pièce soit l'un de ses rattachements ; deux
  déclencheurs la rendent tenable, et `f_pieces_suivent_leur_porteur()` ne supprime plus
  que les pièces qui n'ont **plus aucun** rattachement. Les six chemins de cascade sont
  éprouvés un par un, découverts dans `pg_constraint`. **Deux règles neuves en sont
  sorties** : `CONVENTIONS.md` **§41** (un garde-fou de schéma ne lit aucune ligne d'une
  table cloisonnée — `install.sh` l'appelle sans périmètre), et **§42** (une migration qui
  reprend des données se joue SUR des données : le banc migre des bases vides, et le §2 de
  reprise des trente-huit migrations lui échappait — c'est un **déploiement refusé** qui
  l'a dit, après 2 031 essais verts). Plus la mesure qui a servi à trouver la première :
  *une mutation qui ne mord pas dit que l'essai ne fait pas décider la règle* (Q-210) ;
- ~~**19.5** contrôles périodiques ; **19.6** efficacité ≠ maturité~~ — ✅ **livrés le 16/09** (migration `037`) ;
- ~~**20.3** AIPD~~ — ✅ **livré le 16/09** (migration `039`, schéma **v17**). ⚠️ Le critère
  d'acceptation est **négatif** — *« le registre art. 30 n'est pas dupliqué : l'AIPD POINTE
  le traitement »* —, et c'est lui qui a piloté la conception : `traitement_id` est
  `not null`, aucune colonne de `traitements` n'a de jumelle, et **un essai le mesure dans
  le catalogue** plutôt que de le relire. L'état se dérive (`f_etat_aipd`) : une analyse
  validée dont la revue est échue redevient « à revoir » toute seule. Et le produit
  **refuse de décider** qu'une AIPD est requise — il rend une PRÉSOMPTION sur le seul des
  trois cas de l'article 35 §3 que le registre permette de mesurer, sans filtrer la liste ;
- ~~**20.4** demandes d'exercice de droits~~ — ✅ **livré le 16/09** (migration `040`,
  schéma **v18**). L'échéance d'un mois de l'article 12 §3 se **dérive** de la date de
  réception — le mécanisme de 20.1, repris et non réinventé — et **trois règles du texte
  sont posées dans le schéma** : un refus se motive ET se date (art. 12 §4), une
  prorogation se **notifie**, une réponse est datée ;
- ~~**20.5** main courante de crise~~ — ✅ **livré le 16/09** (migration `041`), **en ajout
  seul**, par les quatre couches du §12 **réutilisées**. ⚠️ **Trois conflits entre cet
  invariant et un balayage qui supprime, dans une seule migration** — la clé étrangère vers
  `incidents` (qui rendait la reprise « remplacer » impossible, classe **Q-284**), la
  colonne `provenance` (qui rendait la purge du jeu de découverte impossible), et l'essai
  lui-même, qui affirmait une propriété que le mécanisme ne promet pas. **Les trois trouvés
  par le banc, aucun par relecture.**

**⇒ LA VAGUE B EST CLOSE.** Les lots **L19 et L20 sont entiers**. Le `docs/PLAN_ACHEVEMENT.md`
§4 impose de rejouer l'indicateur à la clôture d'une vague : *« il se rejoue, il ne s'estime
pas »*.

**⇒ LA VAGUE C EST CLOSE** : ~~L21 tiers et DORA~~ ✅ livré les 17 et 18/09, ~~L24
campagnes descendantes~~ ✅ livré le 18/09. **Le geste suivant est le rejeu INTÉGRAL de
`docs/COMPARATIF_MARCHE.md`** — le `PLAN_ACHEVEMENT.md` §4 l'impose à la clôture d'une
vague, *« il se rejoue, il ne s'estime pas »*, et celui du 16/09 n'avait remesuré que onze
lignes sur quatre-vingt-six. Puis vague D (L25 EBIOS RM, L26 catalogues
ouverts), vague E (L22 ouverture technique, L23 collecte automatique), vague F (L27 IA
locale, L28 portail fournisseur — en dernier, seules surfaces externes).

**Et le frontend**, en parallèle : voir §6.

**L'indicateur** : `docs/COMPARATIF_MARCHE.md` — 86 fonctionnalités, **46 ✅ · 15 🟡 ·
25 ❌ (~62 %) au rejeu INTÉGRAL du 18/09**, à la clôture de la vague C (35 ✅ au 08/09,
44 ✅ au rejeu partiel du 16/09), cible **76**. Il se **rejoue**, il ne s'estime pas — et
celui-ci est le premier intégral : les 86 lignes en trois balayages, dont la méthode est
écrite dans le document pour qu'on puisse la refaire. ⚠️ Ce que le troisième balayage ne
prouve pas est dit aussi : *qu'un écran existe ne dit pas qu'il fonctionne* — il confirme
des verdicts antérieurs, il n'en établit pas.

---

### ▶ OÙ REPRENDRE — au 18/09/2026 au soir

**La vague C est CLOSE, et la vague D est ENTAMÉE.**

✅ **Livré le 18/09 au soir — EBIOS RM, ateliers 1 et 2** (actions **25.1** en partie,
**25.2** et **25.5**) : migration `046`, schéma `data` en **v22**, greffon `src/ebios/`
(une route, `GET /api/ebios/etat`), écran `js/modules/ebios.js` monté en **onglet du sujet
« risques »**, à côté de « Matrice F×G ».

Cinq collections neuves : `ebios_connaissances` (la base de connaissances du Groupe, MIXTE
comme `risque_catalogue`), `ebios_etudes`, `ebios_valeurs_metier`,
`ebios_evenements_redoutes`, `ebios_sources_risque`.

⚠️ **Ce qu'il faut savoir avant d'y toucher :**

- **EN ADDITION, jamais en remplacement.** `risques` et ses cinq colonnes de cotation ne
  bougent pas. Le produit porte **deux méthodes de cotation en même temps**, et le garde-fou
  `f_verifier_ebios_cadrage()` le tient : il nomme les cinq colonnes **une par une** et
  refuse tout déclencheur EBIOS qui écrirait dans `risques`. *Une propriété négative ne se
  voit pas à l'usage — elle ne se mesure qu'en la cherchant.*
- **La pertinence d'un couple se DÉRIVE** (`f_ebios_pertinence`) et n'est qu'une
  **suggestion** ; elle **se tait** dès qu'un critère manque. Ce qui engage l'étude est
  `retenue`, dont le schéma exige la justification.
- **Une valeur métier POINTE le processus du BIA** : ni criticité, ni RTO, ni RPO n'ont de
  jumelle, et un essai le mesure dans le catalogue.
- **L'échelle n'est PAS figée à quatre niveaux** : le schéma borne 1 à 10, parce que
  l'action **25.3** rendra les échelles configurables et versionnées. Un `check (1..4)`
  aurait été une barrière que la migration suivante devrait abattre.

⚠️ **Deux enseignements, et aucun n'est venu d'une relecture** :
`f_verifier_portee_figee()` a **refusé le déploiement** — la table mixte n'avait pas son
déclencheur de portée figée, *troisième fois qu'un installateur appelable rattrape un lot
qu'il n'a pas vu naître* (`CONVENTIONS.md` §40) ; et
`test/modules/non-regression.test.mjs` a **refusé l'écran**, qui dessinait sa liste depuis
le serveur au lieu de la mémoire — ce qui retirait à `recalerBalisage()` ce sur quoi mordre,
et faisait qu'une étude créée n'apparaissait qu'au rechargement suivant.

✅ **Livré le 19/09 — les ateliers 3, 4 et 5** (migration `047`, schéma `data` en **v23**,
trois collections de plus) : l'écosystème et ses parties prenantes évaluées sur quatre
critères, les chemins d'attaque, les modes opératoires et la **décision** de traitement.
**L'action 25.1 est complète, et 25.2 avec elle.**

⚠️ **Ce qu'il faut savoir avant d'y toucher :**

- **un chemin ne porte AUCUNE gravité** — c'est celle de l'événement redouté qu'il
  réalise, lue par la jointure. Le garde-fou refuse toute colonne `gravite` ou `niveau`
  sur cette table ;
- **rattacher un scénario à un risque du registre est un LIEN, pas une conversion** : rien
  n'est écrit dans `risques`, et l'essai relit ses cinq colonnes de cotation **et sa
  `version`** de part et d'autre ;
- **« accepter » exige sa justification**, et c'est la seule des quatre décisions : les
  trois autres produisent un travail visible, accepter ne produit rien ;
- **un garde de CLASSE est né** — `f_verifier_set_null_composites()` refuse toute clé
  composite en `set null` sans liste de colonnes, ce que la `046` avait payé de dix essais
  et de toute restauration de sauvegarde (`CONVENTIONS.md` §43).

✅ **Livré le 19/09 — deux demandes de l'utilisateur, hors chemin des lots :**

- **les logs partent vers un agrégateur** (Graylog, SIEM) : chaque entrée du journal
  d'audit est écrite en une ligne JSON sur la sortie standard, marquée
  `"flux":"journal_audit"` ; `journald` la recueille, `rsyslog` la pousse. **C'est rsyslog
  qui sort, jamais le service** — `IPAddressDeny=any` reste fermé. Recette :
  `GUIDE_EXPLOITATION.md` §5 quater. ⚠️ **Ni `valeurs_avant`, ni `valeurs_apres`** (le
  contenu relève du droit d'export, Q-330) et la ligne **ne part qu'après le `commit`** ;
- **« Échange de données » devient Paramètres**, en quatre onglets — Identité, Réglages,
  Échange, Jeu de découverte.

⚠️ **Trois choses apprises en cassant, et aucune par relecture :**

1. **`insert … returning` applique la politique de LECTURE.** Une entrée transversale du
   journal — démarrage, arrêt, refus d'autorisation — n'a pas de filiale, donc personne ne
   la relit : l'insertion échouait en `42501`, et comme ces appelants ont le droit
   d'avaler l'erreur, **le service démarrait sans tracer son propre démarrage**.
   `CONVENTIONS.md` **§44** ;
2. **`src/db/pool.ts` ne pouvait value-importer aucun module de `src/`**, parce qu'un
   essai importait son SOURCE TypeScript. Cet essai charge désormais le module compilé ;
3. **`parametres` n'était PAS une table morte.** Deux mécanismes y écrivaient sans
   papiers — la fenêtre anti-doublon de L12 et **l'ancrage du journal** de
   `deploy/retention.sh`, sans lequel la chaîne ne se vérifie plus de part et d'autre
   d'une coupure. Les deux ont été trouvés parce que mes garde-fous neufs les ont cassés.
   *Une table qu'on croit morte mérite d'être interrogée avant d'être décrite ainsi.*

**Le geste suivant** : **25.3** (échelles configurables et **versionnées** par filiale —
le schéma borne déjà 1 à 10 et non 1 à 4, précisément pour ne pas avoir à abattre une
barrière), **25.4** (quantification FAIR), puis **L26** (catalogues ouverts). Deux critères
d'acceptation méritent d'être lus avant d'écrire une ligne :

- **L25 est le lot le plus risqué du plan** : il touche la méthode, donc les données déjà
  saisies. Les ateliers EBIOS RM se font **en ADDITION**, jamais en remplacement — une
  migration qui réinterpréterait les cotations F×G×M existantes réattribuerait **en silence**
  des valeurs produites en audit. C'est le motif qui a fait refuser la renumérotation ANSSI
  (constat **Q-192**) ;
- **L26.1 doit conserver les codes à l'octet près** : les auto-évaluations sont stockées par
  `(ref_id, code)`, et une divergence silencieuse réattribuerait des réponses d'audit.

**Ce qui reste des lots livrés, nommé plutôt que tu** : 20.2 (formulaires ANSSI/CNIL), 24.2
en partie (agrégation par répondant), L17 A4 et A5 (écran de démarrage par rôle, Kanban),
L16-D3 (recherche documentaire), et les gabarits XBRL de DORA.

⚠️ **ET LA LEÇON DE CES DEUX JOURS, QUI VAUT PLUS QUE LES LOTS** : **six défauts ont été
trouvés en vérifiant AU NAVIGATEUR sur la recette, aucun par le banc.** Un écran qui perd sa
barre d'onglets, un bloc de création invisible pour le seul compte qui en a le droit, une
campagne convoquée indestructible, une échéance fantôme après une cascade. *Aucun ne faisait
rougir quoi que ce soit, et tous se voyaient en dix minutes de clics.* Prévoyez ce temps.

---

## 5. Les pièges qui ont coûté le plus cher — à lire avant d'écrire une migration

1. **Une colonne engendrée doit être déclarée `colonnesReservees`** dans
   `src/entites/index.ts`, sinon le registre refuse le démarrage. *Deux lots de suite s'y
   sont pris.*
2. **`f_poser_tracabilite_insertion()` existe** : on l'APPELLE, on ne réécrit pas son
   déclencheur. Et il faut **aussi** poser le `before update` (`f_maj_tracabilite()`), sans
   quoi `version` cesse d'être un compteur.
3. **Le registre de l'article 30 exige les quatre champs structurés** pour une colonne
   `personnelle` : finalité, base légale, durée, régime d'expiration. Et `signaler` est un
   **régime d'expiration**, jamais une **nature**.
4. **Ne jamais recopier une fonction de garde depuis la migration qui l'a créée** : une
   migration ultérieure l'a peut-être étendue, et la copie **efface** son extension. Le bon
   motif est au §4 de la `027` — lire la fonction **telle qu'elle est appliquée**, insérer à
   côté de son modèle, et **refuser d'agir si le texte a changé**.
5. **Une unicité sur une table cloisonnée doit porter `filiale_id`**, ou être **déclarée**
   dans `f_verifier_unicite_cloisonnee()` avec son motif.
6. **`avecPerimetre()` ANNULE sa transaction par défaut** : `{ annuler: false }` pour semer.
7. **`monterGreffon()` attend le périmètre de l'API** (`utilisateurId`), pas celui du banc
   (`utilisateur`). Le mélange rend un 500 dont la pile désigne `validerPerimetre`.
8. **`personnes.utilisateur_id` référence `utilisateurs.id`**, pas l'identifiant de
   connexion. `perimetre.utilisateurId` porte lui aussi cet `id`.
9. **Un `resume` de journal est une phrase du développeur** : aucune valeur interpolée
   (§29.5). Les chiffres vont dans `valeursApres`, en jsonb. Un contrôle statique le vérifie.
10. **Toute route neuve se déclare** dans `test/api/routes.test.mjs`, et tout fichier importé
    doit être **commité dans le même commit**.
11. **Un garde-fou ÉPROUVE, il ne reconnaît pas un mot** (`CONVENTIONS.md` §39). Et **le
    balayage part du CATALOGUE, jamais d'une liste**.
12. **Un `on delete set null` sur une clé COMPOSITE nullifie TOUTE la clé**, `filiale_id`
    comprise — et elle est `not null` partout (`CONVENTIONS.md` §43). Écrire
    `on delete set null (<colonne>)`. ⚠️ **Rien ne le dit tant qu'aucun parent RÉFÉRENCÉ
    n'est supprimé** : le schéma se crée, les gardes passent, les écrans marchent. Puis la
    purge de `POST /api/reprise` en mode « remplacer » tombe en `23502`, le message accuse
    *« le champ filiale_id est obligatoire »* sur une suppression, et il nomme `clients`
    parce que c'est l'entité que la purge passe à `executer()`. **Toute restauration de
    sauvegarde est alors impossible.** Dix essais sont tombés d'un coup le 18/09 ; aucune
    relecture ne l'avait vu.
13. **`UI.wireDelete` et `UI.wireBulkDelete` prennent un IDENTIFIANT, pas un élément.**
    Ils font eux-mêmes le `getElementById` **à partir d'une chaîne**, et rendent la main
    **sans un mot** quand ils ne trouvent rien — ce qui est juste là où le bouton n'existe
    pas (lecture seule), et le pire qui soit là où il existe : un bouton visible dont le
    clic ne produit ni dialogue, ni requête, ni message. Fermé pour tous les modules par
    `test/depot/branchements-muets.test.mjs`. ⚠️ **Trouvé au navigateur, et d'aucune autre
    façon** : le banc éprouve qu'un écran s'affiche et qu'un renommage le suit, jamais
    qu'une suppression depuis la fiche aboutit.
14. **Une table neuve entre dans TROIS mécanismes** (`CONVENTIONS.md` §40, posé le 16/09) :
    le domaine **`type_entite`** (sans quoi elle est **incréable**, toute création écrivant
    au journal), ses **politiques RLS**, puis **`f_poser_declencheurs_pieces()`** — *dans
    cet ordre*, parce que la découverte des tables porteuses exige que la politique de
    suppression existe déjà. Les trois défauts ont été trouvés par des garde-fous, aucun
    par relecture.

---

## 6. Le frontend — ce qui est décidé, et ce qui reste

**Décidé et à ne pas rouvrir :**

- charte **orange `#E9631B`** (action, marque) et **bleu `#2059A6`** (structure) ; quatre
  couleurs sémantiques **réservées aux statuts** ;
- **aucune police chargée depuis un réseau** — la règle « aucun CDN runtime ni service
  tiers » tient. La skill propose des appariements Google Fonts : **les refuser**. Pile
  système, définie dans `css/tokens.css` ;
- **aucun gestionnaire en ligne** (`onclick=`…) : la CSP du vhost les bloque, et
  l'application a été livrée un temps sans fonctionner pour cette raison ;
- **aucun emoji** (arbitrage E). Icônes **SVG** ou signes typographiques ;
- **l'identifiant se lit dans un attribut du DOM au moment du clic**, jamais capturé en
  fermeture : le serveur réattribue les identifiants à la création.

**Ce qui reste à faire, par ordre d'effet :**

1. **Cohérence de la densité** — l'échelle typographique existe désormais
   (`--text-xs` … `--text-2xl`) ; **les 26 modules ne l'emploient pas encore** et posent
   leurs tailles au cas par cas. C'est le plus gros gain visuel restant.
2. **Les styles en ligne** — les modules portent beaucoup de `style="..."`. Les remonter
   en classes rend l'ensemble homogène et rend le prochain changement possible.
3. **Écran de démarrage par rôle** (L17, A4) et **Kanban du plan d'actions** (A5).
4. **États vides** — chaque écran doit **dire pourquoi** il est vide. Un vide sans
   explication apprend à ne plus croire ce qu'on montre (classe Q-201 / Q-207).
5. **Impression** — la sortie papier est une **pièce d'audit** ; elle mérite une relecture
   écran par écran.

⚠️ **Vérifier dans un vrai navigateur, et pas seulement au banc.** Le défaut du 16/09 en est
la démonstration : la palette `Ctrl+K` **ne se fermait pas** — `display: flex` dans une règle
de classe écrase le `[hidden]` du navigateur — et l'essai était **vert**, parce qu'il
mesurait la **propriété** `hidden` au lieu de la **visibilité réelle**. *Un essai qui mesure
le drapeau au lieu de l'écran ne mesure pas l'écran.*

---

## 7. La boucle de livraison

```bash
cd backend && npm run banc && npm run verifier-types
cd .. && git add <les fichiers, explicitement>   # jamais « git add -A »
git commit && git pull --rebase origin main && git push origin main
sudo bash backend/deploy/install.sh --maj
sudo bash backend/deploy/install.sh --verifier-publication
```

⚠️ **La dernière ligne n'est pas décorative — constat Q-103** : le dépôt était vert pendant
que la machine servait encore l'ancien fichier.

⚠️ **Republier passe TOUJOURS par `install.sh --maj`**, jamais par une copie à la main : le
jeton de version d'`index.html` dérive du contenu, et une copie manuelle sert un fichier que
les navigateurs gardent en cache un mois.

**Après une migration**, réancrer les chiffres du `backend/README.md` §8 — le banc les
confronte au catalogue et rougit sinon : migrations, garde-fous, tables, politiques, clés
étrangères, tables portant `cree_par`, clés composites, décisions au registre.

---

## 8. L'environnement — mesuré, pas supposé

Tout tourne **sur cette machine** : base, annuaire AD simulé (`grc-ad`), serveur, Apache.
La recette est en ligne en permanence sur `https://grc.exemple.interne/`, en profil
**`decouverte`** depuis le 15/09.

**Avant d'écrire qu'une chose est impossible ici, l'essayer.** Trois affirmations fausses sur
l'environnement ont coûté du travail — la règle est au `CLAUDE.md` §0, et elle prime.

Secrets, comptes de recette et lancement du banc : `CLAUDE.local.md` et `SECRETS.local.md`
(hors dépôt).
