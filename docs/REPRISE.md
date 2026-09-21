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
| **Recherche documentaire** (L16, **D3** — 21/09/2026) | Le lot L16 est COMPLET. `documents.recherche`, `tsvector` **ENGENDRÉ** sur `titre` (poids A), `type` (B), `notes` (C), index GIN, repli d'accents **sans extension** — `unaccent` exige le superutilisateur qu'une migration n'a pas. Route `GET /api/recherche/documents`, champ sur l'écran « Gestion documentaire ». Migration `059`. ⚠️ **Reportée cinq fois**, et le motif est devenu la FORME de l'essai : *une recherche est un oracle* — aucune requête ne nomme de filiale, un contrôle de forme lit la source pour l'exiger, et un terme présent UNIQUEMENT chez la voisine ne remonte jamais (avec son **témoin positif**, sans lequel le contrôle serait vert sur une route qui ne rend rien). ⚠️ **Elle ne rend JAMAIS l'extrait** : `notes` est en régime « signaler » au registre de l'article 30. ⚠️ **Cinq garde-fous l'ont refusée avant qu'elle passe**, aucun prévu — dont le registre sur un régime non textuel (la purge aurait avorté pour toutes les filiales, Q-300) et `relecture-apres-ecriture` qui a exigé l'attente de la poussée : *un document créé à l'instant doit être trouvable* |
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
campagnes descendantes~~ ✅ livré le 18/09. ~~**Le geste suivant est le rejeu INTÉGRAL de
`docs/COMPARATIF_MARCHE.md`**~~ ✅ **FAIT le 18/09** — les 86 lignes en trois balayages,
méthode écrite dans le document. ⚠️ Le `PLAN_ACHEVEMENT.md` §4 l'impose à **chaque** clôture
de vague : il sera donc **redû à la clôture de la vague D**, qui n'est pas close.
*Il se rejoue, il ne s'estime pas.* Puis vague D (L25 EBIOS RM, L26 catalogues
ouverts), vague E (L22 ouverture technique, L23 collecte automatique), vague F (L27 IA
locale, L28 portail fournisseur — en dernier, seules surfaces externes).

**Et le frontend**, en parallèle : voir §6.

**L'indicateur** : `docs/COMPARATIF_MARCHE.md` — 86 fonctionnalités, **51 ✅ · 15 🟡 ·
20 ❌ (~68 %) au rejeu INTÉGRAL du 19/09**, à la clôture de la vague D (35 ✅ au 08/09,
44 ✅ au rejeu partiel du 16/09, 46 ✅ au rejeu intégral du 18/09), cible **76**. Il se **rejoue**, il ne s'estime pas — et
celui-ci est le premier intégral : les 86 lignes en trois balayages, dont la méthode est
écrite dans le document pour qu'on puisse la refaire. ⚠️ Ce que le troisième balayage ne
prouve pas est dit aussi : *qu'un écran existe ne dit pas qu'il fonctionne* — il confirme
des verdicts antérieurs, il n'en établit pas.

---

### ▶ OÙ REPRENDRE — au 19/09/2026, après la vague F

# 🛑 **LES SIX VAGUES DU `PLAN_ACHEVEMENT.md` SONT CONSTRUITES.**

**Le geste suivant n'est plus un lot : c'est l'`ultrareview`**, que le plan place à la
fin, sur le logiciel complet — et que **l'utilisateur seul peut lancer** (`/code-review
ultra`). Puis les constats restés ouverts du `docs/PLAN_EXECUTION.md` §7 (≈ 30, dont
Q-243 et l'oracle d'existence B-1), puis le durcissement final et la mise en service.

| | |
|---|---|
| **Livré ce jour** | **L27** — assistance par IA, locale par défaut, six barrières (migration `057`) ; **L28** — portail fournisseur (migration `058`, vhost dédié). Écran « Assistance IA » en onglet des Paramètres |
| **Le geste suivant** | **L'ULTRAREVIEW.** Elle n'est pas lançable depuis une session : elle est déclenchée par l'utilisateur, et facturée |
| **Mesuré** | **58 migrations** · **89 tables** · **356 politiques** · **62 garde-fous** · **494 décisions** · publication **85 fichiers** · indicateur **53 ✅ · 19 🟡 · 14 ❌ (~73 %)** · `--diagnostic` **14 conformes, 2 réserves, 0 bloquant** sur **quinze** sujets |

## 🛑 CE QUI EST CONSTRUIT N'EST PAS CE QUI EST OUVERT — À LIRE AVANT DE TOUCHER À L27 OU L28

| | État réel | Ce qu'il faut pour l'ouvrir |
|---|---|---|
| **IA locale** | **fonctionne**, et c'est mesuré sur la machine : `IPAddressDeny=::/0 0.0.0.0/0`, seule la boucle locale autorisée, et l'assistance répond | un modèle sur `127.0.0.1`. Sans lui, le produit dit « indisponible » — il n'invente pas |
| **IA externe** | **fermée** : `CYBER_GRC_IA_EXTERNE` absent, et sans lui **aucune** ligne d'activation n'entre en base, quelle que soit la route | le réglage, une activation par filiale avec ses quatre champs de confiance, **et** l'ouverture de la sortie réseau |
| **Portail** | **aucune route montée** — `PORTAIL_ACTIF=non` n'enregistre rien. Vhost livré **désactivé** | `a2ensite`, un certificat, un limiteur au pare-feu — **et la porte S15** |

⚠️ **LA CONSIGNE DU PLAN PRIME SUR L'ENVIE D'AVANCER** : *« la porte S15 est la plus
exigeante du plan […] en cas de doute sur ce lot, on ne livre pas »*. Ce n'est pas une
réserve qu'on reconduit ; c'est l'ordonnancement que le plan a fixé le 08/09.

⚠️ **ET LA RECETTE PORTE UN TÉMOIN, PAS UN MODÈLE.** `IA_URL_LOCALE` y vise un petit
service d'essai posé le 19/09 pour mesurer le chemin nominal — vingt lignes qui renvoient
une phrase. **Ce n'est pas un modèle**, et le retirer ne casse rien : l'assistance
répondra « indisponible », ce qu'elle doit faire.

⚠️ **CE QUE LA VAGUE F A APPRIS :**

1. **Le `CONVENTIONS.md` §46 a payé le lendemain de son écriture** — `portail_liens` est
   dans la même circularité que `jetons_api`, et le défaut n'a **pas** été refait.
2. 🛑 **Une mutation est passée, et c'était la plus dangereuse du lot** : mettre le
   périmètre du portail en Groupe/administration laissait **treize essais sur quatorze
   verts**. L'essai mesure désormais **le périmètre lui-même**.
3. **Le banc a corrigé la date d'origine d'une reprise** : `cree_le` est la date où la
   ligne est entrée dans *ce système*, pas celle où le fournisseur a répondu.
4. **Un en-tête neuf a fait rougir le frontal**, et la bonne réponse n'était pas la
   dérogation : `X-Grc-Lien` est **effacé** au vhost interne, où il n'a rien à faire.
   *On ferme ce qui n'a pas à passer, au lieu d'expliquer pourquoi il peut passer.*
5. **Un balayage du catalogue rencontre des tables qui ne sont pas des entités**, et la
   bonne réponse n'est ni de le rétrécir ni de lui apprendre à tout semer : c'est de
   **borner, puis de MESURER la borne**. `CONVENTIONS.md` **§48**. ⚠️ *Un filtre ajouté à
   un balayage sans l'essai qui le justifie est une régression, même quand le banc
   redevient vert.*

---

### ▶ Historique — au 19/09/2026, après la vague E

**LES VAGUES C, D ET E SONT CLOSES. Il reste la vague F, et elle seule.**

| | |
|---|---|
| **Livré ce jour** | **L22** — jetons d'API, événements sortants, cadre de connecteurs (migrations `053`, `055`, `056`) ; **L23** — collecte automatique de preuve, CCM, historique du contrôle (`054`). Schéma `data` en **v27**. Deux écrans : « Ouverture technique » en onglet des Paramètres, « Collecte automatique » en onglet des Mesures |
| **Le geste suivant** | **Le rejeu INTÉGRAL de `docs/COMPARATIF_MARCHE.md`** (le `PLAN_ACHEVEMENT.md` §4 l'impose à chaque clôture de vague), puis la **vague F** — **L27** (IA locale par défaut, six barrières pour l'externe) et **L28** (portail fournisseur, le premier composant hors VPN). Après quoi : l'**ultrareview** sur le logiciel complet |
| **Mesuré après L23** | **56 migrations** · **86 tables** · **344 politiques** · **60 garde-fous** · **477 décisions** |

⚠️ **CE QUE LA VAGUE E A APPRIS, ET QU'IL FAUT LIRE AVANT DE TOUCHER À L22 OU L23 :**

1. **Ce qui est ADMIS n'est pas ce qui est ÉMIS.** `echeance_franchie` a vécu une journée
   entière dans le vocabulaire des abonnements sans qu'aucun émetteur existe. Le garde-fou
   qui gardait ce vocabulaire **nommait ce danger dans son propre témoin** : il regardait le
   cas où la contrainte se **vide**, pas celui où elle est juste et où l'émetteur manque.
   `f_evenements_emis()` et son garde le confrontent désormais au catalogue **dans les deux
   sens**. *Un vocabulaire clos ne dit rien de ce qui le peuple.*
2. **Un essai peut couvrir une règle sans jamais la faire décider** (constat **Q-210**), et
   cette fois dans l'essai écrit pour tenir le critère **le plus important du lot**. Il
   restait vert contre la mutation. *Il n'a été vu que parce que la mutation a été jouée.*
3. **Une intersection de droits peut être décorative.** Émettre un jeton exige
   l'administration ; comparer au niveau **global** du compte ne retranchait donc jamais
   rien. C'est le niveau **par domaine** qui décide, et le jeton se rabat sur le **plus
   faible** des domaines demandés.
4. **Un `text[]` a empêché le serveur de démarrer.** Le catalogue de la couche d'entités
   balaie **toutes** les tables, entités ou non, et refuse bruyamment un type qu'il ne sait
   pas nommer. `jetons_api.domaines` n'est l'affaire d'aucune entité, et il a quand même
   tout arrêté. *Une table hors du registre n'est pas hors du catalogue.*
5. 🛑 **UN JETON ÉMIS RENDAIT 401, ET LE BANC ÉTAIT VERT.** `jetons_api` est cloisonnée,
   et la recherche par empreinte précède le périmètre qu'elle produit : la ligne était
   invisible à la seule transaction qui devait la voir. **Dix-huit essais mesuraient les
   jetons** — tous appelaient `verifierJeton()` sous un périmètre posé. *Le banc mesurait
   la fonction ; personne ne mesurait ce que l'appelant reçoit.* C'est **Q-325 reproduit**,
   huit jours plus tard, dans un autre lot. Le remède : le secret porte sa filiale en
   clair, et une famille entière monte le serveur réel avec un vrai `Bearer`.
   ⚠️ **Trois remèdes plus simples ont été écartés** parce que chacun heurtait une
   barrière que le produit avait de bonnes raisons de poser — c'est écrit dans
   `emettreJeton()`, et il faut le lire avant de « simplifier ».
6. **Un lot n'est pas livré tant que son écran n'a pas été CLIQUÉ.** Cinq défauts de cette
   vague viennent de là, et zéro du banc : le formulaire d'émission n'offrait aucun
   domaine, le menu des abonnements en cachait un sur quatre, la collecte était
   inatteignable depuis les mesures, et huit classes CSS étaient écrites sans être
   définies — *le défaut du matin, refait le soir*.

---

### ▶ Historique — au 19/09/2026 au soir, après la vague D

**La vague C est CLOSE, et la vague D est ENTAMÉE.** ⚠️ **Cette section se lit du HAUT vers
le BAS, et elle est CHRONOLOGIQUE** : ce qui suit immédiatement est la livraison du 18/09,
ce qui la suit celle du 19. **L'état le plus récent est en bas**, et il est résumé ici pour
qu'on n'ait pas à le chercher :

| | |
|---|---|
| **Livré, dans l'ordre** | EBIOS RM ateliers 1 à 5 (migrations `046`, `047`, schéma `data` **v23**), copie du journal vers un agrégateur, écran **Paramètres** en quatre onglets, puis **les échelles de cotation** (migration `049`, schéma `data` **v24**) |
| **Le geste suivant** | **Le rejeu INTÉGRAL de `docs/COMPARATIF_MARCHE.md`**, que le `PLAN_ACHEVEMENT.md` §4 impose à la clôture d'une vague. Puis la **vague E** — L22 (jetons, événements, connecteurs) et L23 (collecte automatique, CCM). ✅ *La vague D est CLOSE : L25 et L26 sont livrés en entier* |
| **Mesuré après L26** | **52 migrations** · **81 tables** · **324 politiques** · **56 garde-fous** · **455 décisions** · publication **82 fichiers** (douze de moins : les catalogues ont quitté la racine web) |
| **Déployé** | oui, sur la recette, et **parcouru au navigateur** — c'est là que trois défauts sur quatre ont été trouvés |

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
  aurait été une barrière que la migration suivante devrait abattre. ✅ **Et elle l'a
  rendue ainsi le 19/09** (migration `049`) — sans abattre quoi que ce soit, ce qui était
  tout l'objet de la précaution.

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

~~**Le geste suivant** : **25.3**~~ ✅ **LIVRÉE le 19/09/2026** — migration `049`, schéma
`data` en **v24**, écran en onglet du sujet « risques ». Échelles versionnées, datées et
**figées dès leur publication** ; socle du Groupe surchargeable par filiale ; chaque
cotation porte l'échelle qui l'a produite, et `null` s'y lit « non tracée », jamais
« celle du Groupe ».

⚠️ **Trois choses à en retenir, et aucune n'est venue d'une relecture :**

1. 🛑 **La première rédaction du figeage cassait la reprise** — `GET /api/export` puis
   `POST /api/reprise` rendait **409**, *le produit produisait une sauvegarde qu'il
   refusait de relire*. Classe des trois conflits de la `041` et des constats Q-194 /
   Q-284 : **restaurer une sauvegarde gagne**. Et le remède lui-même a été faux d'abord —
   `xmin = pg_current_xact_id()` compare à la transaction de PREMIER NIVEAU, alors que la
   couche d'écriture pose un **point de reprise à chaque insertion**.
2. ⚠️ **Une quatrième provenance est née : `socle`.** Le jeu de découverte refusait de se
   charger sur une base neuve parce que les vingt lignes du socle des échelles comptaient
   pour des données réelles. Le domaine était **incomplet** — une ligne livrée par une
   migration n'est ni saisie, ni de découverte, ni reprise. **L26 en aura besoin** : il
   fera entrer les cinq catalogues en base, par milliers de lignes.
3. ⚠️ **La consolidation refuse d'additionner** dès que deux échelles sont EMPLOYÉES dans
   le périmètre : `expositionResiduelle` devient `null`, et l'écran dit pourquoi. Sans
   cela, la réconciliation du §2.2 aurait été une phrase. ⚠️ Un défaut de plus s'y cachait,
   invisible autrement : l'agrégat `id_metier[]` revenait du pilote `pg` en **chaîne**, et
   `new Set` la découpait en caractères — l'exposition aurait été nulle **en permanence**.
4. ⚠️ **Trois défauts trouvés EN CLIQUANT sur la recette, après 2 230 essais verts** —
   la leçon n° 4 de ce document, vérifiée une fois de plus. L'écran archivait le socle du
   Groupe (refusé en 403, et **le refus était avalé**) ; le socle et l'échelle locale sont
   tous deux « en vigueur » et le `find()` prenait la première venue ; le socle
   disparaissait de l'écran, filtré sur son statut. ⚠️ **Et un quatrième, de style** :
   `class="card"` et `class="muted"` n'existaient dans aucune feuille — les trois écrans
   livrés les 18 et 19/09 se rendaient **à plat**. *Une classe écrite n'est pas une classe
   définie, et aucun essai ne le dit.*
5. ⚠️ **Deux garanties déclaratives ne garantissaient rien** quand `filiale_id` est nul —
   `CONVENTIONS.md` **§45** : une clé étrangère composite (`MATCH SIMPLE` dispense de
   contrôle) et une unicité (deux NULL sont distincts). Les deux trous s'ouvrent ensemble
   sur toute table MIXTE.

✅ **L'ACTION 25.4 EST LIVRÉE LE 19/09/2026 — la quantification financière (FAIR).**
Migration `050`, schéma `data` en **v25**, panneau sur la fiche de risque, et une colonne
de plus à la vision Groupe. **Le lot L25 est COMPLET ; le geste suivant est L26.**

⚠️ **Ce qu'il faut savoir avant d'y toucher :**

1. **C'est la réponse à la limite que 25.3 venait de rendre visible.** La consolidation
   refuse d'additionner deux expositions **ordinales** ; une somme d'argent, à devise
   égale, s'additionne toujours. ⚠️ Et elle refuse là aussi dès que **deux devises**
   coexistent — même mécanique, même motif.
2. **Un triplet incomplet ne rend RIEN**, et le refus est posé à **deux étages** : la
   contrainte refuse la donnée, la dérivation rend `null`. Deux valeurs sur trois
   donneraient un nombre qui *aurait l'air* mesuré, et c'est celui-là qu'on cite en
   comité de direction.
3. **Des pertes secondaires absentes ne valent pas ZÉRO** : le montant devient un
   **PLANCHER**, marqué par une colonne engendrée et affiché « ≥ ». `coalesce(…, 0)`
   aurait toujours abouti et sous-estimé en silence — l'estimation par défaut *dans le
   sens rassurant* est la plus dangereuse des deux.
4. **Le montant est INÉCRIVABLE** — colonne `generated always`, servie sous
   `_perteAnnualisee`. Il n'y a donc **pas d'aperçu en direct** pendant la saisie : il
   faudrait une seconde implémentation de la dérivation, qui divergerait de celle que la
   consolidation additionne (**Q-219**). Le montant apparaît à l'enregistrement.

🛑 **ET LE PIÈGE ANNONCÉ CI-DESSOUS ÉTAIT RÉEL — il est fermé par la SECONDE issue.**
`f_verifier_ebios_cadrage()` balaie désormais le **catalogue entier**. ⚠️ **Mesuré, pas
supposé** : la rédaction d'origine, remise en place avec un déclencheur fautif sur
`risque_quantification`, rend **0 anomalie** là où la rédaction élargie en rend une. *Un
garde qui ne regarde pas rend zéro anomalie — c'est-à-dire exactement ce qu'il rend quand
tout va bien.* L'essai garde les **deux moitiés** : sans la seconde, on saurait que le
garde actuel mord, sans savoir si l'élargissement a servi à quelque chose.

🛑 **UN DÉFAUT TROUVÉ AU NAVIGATEUR SUR LA RECETTE, APRÈS UN BANC VERT — le sixième en
une semaine, et la leçon n° 4 de ce document vérifiée une fois de plus.** On enregistre une
estimation complète, et le panneau affiche « estimation incomplète ». Le montant existait :
la base l'avait calculé, la route l'avait renvoyé — et **`js/core/sync.js` ne lisait de la
réponse que deux choses**, l'identifiant définitif et le numéro de version.

*Le défaut ne vivait ni dans la base, ni dans la route, ni dans l'écran : il vivait dans ce
qu'une couche intermédiaire choisissait de ne pas garder.* Il ne pouvait apparaître qu'avec
la **première entité dont un champ AFFICHÉ est calculé par la base**. ⚠️ Le remède ferme la
classe **par le PRÉFIXE** — `sync.js` adopte tout champ à souligné initial rendu par le
serveur —, et non par une liste, qui aurait manqué le prochain en silence.

⚠️ **Et l'essai qui le garde a failli être creux** : sa première rédaction restait verte
sous la mutation, parce que le **sondage** finissait par rapporter la modification. Ce qui
mord est le **compte des rechargements** (`test/navigateur/quantification.test.mjs`).

✅ **LE LOT L26 EST LIVRÉ LE 19/09/2026 — LES CATALOGUES OUVERTS, ET LA VAGUE D EST
CLOSE.** Migrations `051` et `052`, schéma `data` en **v26**, écran « Gestion des
catalogues » en onglet du sujet « référentiels ».

⚠️ **Ce qu'il faut savoir avant d'y toucher :**

1. **Les codes sont la clé, et ils sont conservés à l'octet près.** Les auto-évaluations
   sont stockées par `(ref_id, code)`. Le semis de la `051` a été **ENGENDRÉ** depuis
   `backend/db/catalogues/*.js` — les fichiers qui servaient de catalogue au navigateur,
   sortis de la racine web —, et `test/catalogues/fidelite.test.mjs` compare la base à ces
   mêmes fichiers, champ par champ, à chaque banc. ⚠️ **Corriger une coquille dans un de
   ces fichiers ne corrige plus rien dans le produit** : il faut une migration, et le banc
   rougit tant que les deux ne disent pas la même chose.
2. **Le registre du navigateur n'a pas changé d'interface — il a changé de source.**
   `Referentiels.get()`, `all()`, `flatExigences()` sont intacts ; `hydrater()` les
   alimente depuis `data`. C'est le principe du lot L2, reconduit.
3. **`evaluations.ref_id` n'a PAS de clé étrangère**, et le garde-fou le vérifie
   POSITIVEMENT. Elle a l'air d'un oubli ; le jour où quelqu'un la pose, une réponse
   d'audit cesse de survivre à l'archivage du catalogue qui l'a produite.

🛑 **DEUX DÉFAUTS TROUVÉS PAR LE BANC, ET LE PREMIER ÉTAIT GRAVE** : le balayage de
renommage de `js/core/sync.js` réécrivait les **codes du catalogue ANSSI** (« 7 → 4
valeur(s) » au lieu d'une) — les quatre collections de catalogue en sont désormais
écartées ; et une colonne `jsonb` était tenue pour **changée à chaque fois**, de sorte
qu'une filiale ne pouvait plus **relire son propre export** (403 sur le socle). ⚠️ Ce
second défaut **dormait depuis les premières colonnes `jsonb`** : il ne s'était jamais vu
parce qu'aucune de ces tables ne porte de ligne de portée Groupe.

⚠️ **ET DEUX AUTRES EN CLIQUANT SUR LA RECETTE** — le septième et le huitième de la
semaine : l'écran perdait sa **barre d'onglets** (`ongletsHtml` attend la liste que
`ongletsDe` compose, pas une route, et il rendait la chaîne vide **sans une erreur**), et
la **veille était INERTE** — colonne, dérivation et garde-fou livrés, et aucune fenêtre de
surveillance. *Une capacité qu'aucune donnée n'active est une capacité absente.*

⚠️ **Et la migration de 25.4 avait été refusée TROIS FOIS par `f_verifier_schema()`** — trois colonnes
`jsonb` sans décision au registre de l'article 30, quatre tables sans déclencheur de
pièces, une unicité sans `filiale_id`. La troisième correction était elle-même fautive :
le régime « signaler » construit une comparaison **textuelle** que la base refuse sur un
`jsonb`, et la purge — transactionnelle — s'en serait avortée **pour toutes les filiales**
(constat **Q-300**). *Cinquième fois qu'un installateur rattrape un lot qu'il n'a pas vu
naître.*

Deux critères d'acceptation méritent d'être lus avant d'écrire une ligne :

- **L25 est le lot le plus risqué du plan** : il touche la méthode, donc les données déjà
  saisies. Les ateliers EBIOS RM se font **en ADDITION**, jamais en remplacement — une
  migration qui réinterpréterait les cotations F×G×M existantes réattribuerait **en silence**
  des valeurs produites en audit. C'est le motif qui a fait refuser la renumérotation ANSSI
  (constat **Q-192**) ;
- **L26.1 doit conserver les codes à l'octet près** : les auto-évaluations sont stockées par
  `(ref_id, code)`, et une divergence silencieuse réattribuerait des réponses d'audit.

**Ce qui reste des lots livrés, nommé plutôt que tu** : 24.2 en partie (agrégation par
répondant) et les gabarits **XBRL** de DORA (format de dépôt versionné par l'ESA).

⚠️ ~~20.2 (formulaires ANSSI/CNIL)~~ et ~~L17 A4 et A5~~ — ✅ **LIVRÉS le 21/09/2026**,
gardés barrés plutôt qu'effacés. **20.2** : un formulaire pré-rempli depuis la fiche
d'incident, pour les deux régimes, qui **dit ses propres manques** — *un formulaire à
moitié rempli est plus dangereux qu'un formulaire vide : vide, on le remplit ; à moitié
rempli, on l'envoie.* Le produit ne transmet rien, et le document le porte en toutes
lettres.

⚠️ ~~L16-D3 (recherche documentaire)~~ — ✅ **LIVRÉE le 21/09/2026**, migration `059`. Gardée
barrée plutôt qu'effacée : elle avait été reportée **cinq fois**, et une ligne effacée est un
travail qu'on oublie d'avoir fait. `documents.recherche` est un `tsvector` **engendré** sur
`titre` (poids A), `type` (B) et `notes` (C), index GIN, repli d'accents par une fonction
immuable — **sans extension**, `unaccent` exigeant le superutilisateur qu'une migration n'a
pas. Route `GET /api/recherche/documents`, champ sur l'écran « Gestion documentaire ».
**Trois garde-fous ont refusé la migration avant qu'elle passe**, et aucun n'avait été
prévu par moi : le régime `signaler` sur une colonne non textuelle (la purge aurait avorté
pour toutes les filiales, constat Q-300), le type `tsvector` non rangé, et la couche de
conversion qui ne le connaissait pas.

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

1. ~~**Cohérence de la densité**~~ — ✅ **FAITE**, et cette ligne est gardée barrée plutôt
   qu'effacée. Elle annonçait, jusqu'au 21/09/2026, que *« les 26 modules n'emploient pas
   encore »* l'échelle typographique et *« posent leurs tailles au cas par cas »*, en la
   désignant comme **le plus gros gain visuel restant**. ⚠️ **Mesuré : 316 emplois de
   `var(--text-*)` dans `js/modules/`, contre 2 tailles en dur — et les deux sont en `pt`,
   dans des règles d'impression, donc légitimes.** Le travail avait été fait ; la phrase,
   elle, envoyait la session suivante le refaire. *Une liste de travaux restants qui garde
   un travail achevé coûte plus cher qu'une liste incomplète : elle est crue.*
2. **Les styles en ligne** — première passe faite le 21/09/2026 : **1 205 → 895**.
   ⚠️ **Le gain n'est pas le compte, c'est ce qu'il a sorti** : `style="color:red"`
   apparaissait **39 fois dans 17 modules** sur les astérisques de champ obligatoire — une
   couleur BRUTE, hors du système de tokens, et qui empruntait le rouge que le produit
   réserve aux statuts CRITIQUES. Une pièce d'audit vit de ce code couleur ; le diluer sur
   une marque de saisie est un défaut, pas un détail. Elle a désormais son token,
   `--marque-requis`, non sémantique.
   Onze classes utilitaires couvrent les motifs répétés plus de quinze fois (270 attributs
   convertis, dont 24 **fusionnés** dans une classe existante — remplacer sans fusionner
   aurait produit deux attributs `class`, dont le second est ignoré en silence).
   ⚠️ **Les 895 restants ne se convertissent PAS de force** : sur 565 motifs distincts, la
   plupart ne servent qu'un écran, et les nommer produirait des classes à un seul usage —
   des noms à retenir sans rien en échange.
3. ~~**Écran de démarrage par rôle** (L17, A4) et **Kanban du plan d'actions** (A5)~~ —
   ✅ **LIVRÉS le 21/09/2026**. Ils étaient les deux seuls items de la vague V-A jamais
   construits, et **V-A n'avait aucune ligne de clôture** — elle en a une désormais.
   *Une vague qu'on n'a pas déclarée close reste ouverte sans que personne le remarque :
   c'est ainsi que deux écrans sont restés dus onze jours pendant que quatre vagues
   postérieures se fermaient.*
4. ~~**États vides**~~ — ✅ **MESURÉ FAIT le 21/09/2026**, et gardé barré. La règle tient :
   *chaque écran doit dire POURQUOI il est vide, un vide sans explication apprend à ne plus
   croire ce qu'on montre* (classe Q-201 / Q-207). Mais le travail, lui, était fait : sur
   les **onze modules qui portent un bloc `empty-state`, les onze l'expliquent** — aucun ne
   se contente d'un titre.
   ⚠️ **C'est la DEUXIÈME ligne de cette liste trouvée fausse le même jour**, après la
   densité typographique. Une liste de travaux restants se relit en MESURANT, pas en
   reconduisant : deux sessions de suite auraient refait un travail achevé.
5. **Impression** — la sortie papier est une **pièce d'audit** ; elle mérite une relecture
   écran par écran. *(Toujours dû au 21/09/2026.)*

6. ~~**Les couleurs sémantiques employées comme couleurs d'action**~~ — ✅ **CORRIGÉ le
   21/09/2026.** La charte réserve vert / orange / rouge / gris **aux statuts**
   (`CLAUDE.md` §2), et le produit les employait sur des verbes : **huit boutons**
   « Enregistrer », « Historiser » peints du vert « conforme » ; « Export Data (Excel) »
   en `#1d6f42` **écrit en dur**, hors tokens ; « Imprimer Rapport (PDF) » en `#c0392b`,
   le rouge « critique », sur une impression. *Le lecteur d'un rapport s'appuie sur ce
   code couleur — le diluer sur des verbes le rend illisible.*

7. ~~**`.status` défigurait le français**~~ — ✅ **CORRIGÉ le 21/09/2026**, et c'est la
   leçon de méthode de la passe. `text-transform: capitalize` est la règle ANGLAISE : une
   capitale à chaque mot. À l'écran, « **En Retard De 190 J** », « **Non Critique** ».
   ⚠️ **Il avait été contourné SEPT FOIS, écran par écran** — `.apr-table .status`,
   `.att-table .status`, `.der-table .status`, `.aipd-table .status`… *à chaque fois
   l'instance, jamais la classe.* Corrigé à la classe par `::first-letter` — un simple
   `none` aurait rendu « à faire », les valeurs étant stockées en minuscule — et les sept
   contournements sont retirés.

⚠️ **Et ces quatre défauts n'ont été vus qu'en CAPTURANT LES ÉCRANS.** Le banc était
entièrement vert avant comme après : il mesure qu'un écran se rend et que son contenu est
juste, jamais qu'il est lisible. *Prévoir ce temps, et regarder les images.*

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
La recette est en ligne en permanence sur `https://grc-test.site/`, en profil
**`decouverte`** depuis le 15/09.

**Avant d'écrire qu'une chose est impossible ici, l'essayer.** Trois affirmations fausses sur
l'environnement ont coûté du travail — la règle est au `CLAUDE.md` §0, et elle prime.

Secrets, comptes de recette et lancement du banc : `CLAUDE.local.md` et `SECRETS.local.md`
(hors dépôt).
