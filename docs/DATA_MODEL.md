# Modèle de données — Cyber GRC

> ## ⚠️ À lire avant tout : ce document ne dit plus où vivent les données
>
> Il a été écrit pour le **produit 100 % navigateur**, où l'objet `data` décrit ici
> *était* la base. Depuis le lot L2, **les données vivent sur le serveur, dans
> PostgreSQL** (`../docs/PLAN_SERVEUR.md` §1.3). Ce document n'est pas caduc pour
> autant — il décrit encore deux choses bien réelles, et c'est pour cela qu'il reste :
>
> | Ce qu'il décrit | Statut |
> |---|---|
> | La forme de l'objet `data` **que voient les modules métier**, à travers la façade synchrone `DataStore` préservée par le lot L2 | ✅ **toujours vrai** — c'est ce que le serveur rend sur `/api/donnees`, dans cette forme exacte |
> | La forme du **fichier d'échange `grc-backup`** (enveloppe + charge utile) | ✅ **toujours vrai** — c'est le format de reprise d'une filiale déjà équipée, et de remise des données à une filiale qui sort du groupe (`PLAN_SERVEUR` §2.6) |
> | La **couche de stockage** : IndexedDB, `localStorage`, points de restauration locaux, coffre de chiffrement | ❌ **caduc** — voir §1, réécrit |
> | Les **cascades de suppression** écrites dans `DataStore.deleteX` | ⚠️ **transposées, et pas à l'identique** — voir l'encadré ci-dessous |
>
> Dit autrement : ce document décrit désormais une **représentation de transport**, pas
> un lieu de stockage. La vérité vit dans le schéma relationnel du serveur —
> `backend/db/migrations/` — une cinquantaine de tables, dont les règles
> sont figées dans **[`backend/db/CONVENTIONS.md`](../backend/db/CONVENTIONS.md)** :
> §16 pour le découpage Groupe/Filiale, §17 à §21 pour les arbitrages pris aux portes de
> sécurité S1 et S2. **Ces règles ne sont pas recopiées ici** — deux textes normatifs qui
> se répètent divergent, et la divergence est silencieuse. La correspondance entre les
> deux modèles est au **§1.5**.

> ### Les deux modèles diffèrent volontairement
>
> | Ici (objet `data`) | Là (PostgreSQL) |
> |---|---|
> | une entité **`mesures`** unique | **scindée** en `mesure_catalogue` (la *définition* du contrôle, niveau Groupe ou local) et `mesure_mise_en_oeuvre` (l'*évaluation* du contrôle dans une filiale, unique sur `(filiale_id, mesure_id)`). Sans cette scission, les filiales ne sont plus comparables et la vision Groupe additionne des grandeurs incomparables (`CONVENTIONS.md` §16.2) |
> | une mesure se **supprime** | une mesure du socle Groupe déjà évaluée ou référencée **ne se supprime pas** : elle s'**archive** (`mesure_catalogue.statut` = `active` / `archivee`, plus `archive_le`). Elle reste lisible et reste rattachée à tout ce qui la référence — la preuve historique survit — mais n'est plus proposée pour de nouvelles évaluations (`CONVENTIONS.md` §17.6) |
> | tableaux d'identifiants dans l'objet (`exigences_liees`, `risques_lies`, `actifs_lies`, `mesure_ids`, `dependances[]`, `mappings.refs`) | **tables de liaison** n-n avec de vraies clés étrangères — la liste est au §1.5 |
> | cascades de suppression **écrites dans le code** (`DataStore.deleteX`) | suppressions **portées par le schéma** — mais **pas les mêmes** : voir l'encadré suivant |
> | aucune notion de filiale | **cloisonnement par filiale** : colonne `filiale_id`, Row Level Security activée *et forcée* sur **toutes** les tables (propriétaire compris), **clés étrangères et unicités composites** `(référence, filiale_id)` (`CONVENTIONS.md` §17.1 et §19.1) |
> | `updatedAt` posé par le code appelant | **traçabilité imposée par la base** : **toute** table portant `cree_par` reçoit un déclencheur `before insert` qui **ignore ce que l'appelant envoie** dans `version`, `cree_le` et `cree_par`, et les fixe lui-même (`CONVENTIONS.md` §18.1) — les tables du bloc complet `version` / `cree_le` / `cree_par` / `modifie_le` / `modifie_par` comme les tables de liaison, qui n'en portent qu'une partie. La couverture est **vérifiée** par un garde-fou du schéma, pas seulement affirmée. À la reprise d'un export `grc-backup`, l'auteur tracé est donc **celui qui importe**, à la date de l'import |
> | rien d'équivalent | un compteur **`version`** par enregistrement, qui porte le verrouillage optimiste — voir §1.4 |
> | rien d'équivalent | `documents` et `document_referentiels` portent une **colonne engendrée** (`portee_groupe`, = `filiale_id is null`) qui entre dans une clé étrangère. PostgreSQL refuse qu'on lui donne une valeur : **toute insertion nomme ses colonnes**, et un aller-retour naïf qui relit une ligne entière puis la réinsère échoue (`CONVENTIONS.md` §18.6) |
>
> ### ⚠️ Les cascades du §3 ne se transposent pas telles quelles
>
> Les règles de suppression décrites plus bas ont été écrites pour un produit
> **mono-filiale**, où le rayon d'une suppression ne quittait pas le poste de
> l'utilisateur. En contexte de groupe, elles produisent l'effet inverse de leur
> intention. Relevé dans `pg_constraint` : sur 71 clés étrangères, **43 sont en
> `restrict`, 27 en `cascade`, et une seule en `set null`**.
>
> | Règle du navigateur | Schéma serveur |
> |---|---|
> | l'action tombe avec son exigence / son risque / son évaluation / son incident | `cascade` — **identique** |
> | le test PRA tombe avec son scénario | `cascade` — **identique** |
> | les dépendances d'actifs sont purgées des deux côtés | `cascade` — **identique** |
> | l'incident survit à son risque (`risque_id → null`) | `set null` — **identique**, et c'est la **seule** de tout le schéma |
> | `deleteMesure` **délie** les évaluations et les actions (`mesure_id → null`) | ⚠️ **`restrict`** : la suppression est **refusée**. `actions.mesure_id`, `evaluation_mesures`, `traitement_mesures` et `mesure_mise_en_oeuvre` pointent tous vers `mesure_catalogue` en `restrict` (`CONVENTIONS.md` §17.6) |
> | — | ⚠️ `personnes.utilisateur_id` → `utilisateurs` est également en **`restrict`** (`CONVENTIONS.md` §18.2) |
>
> **Pourquoi.** Un `set null` ou un `cascade` déclenché depuis le niveau **Groupe**
> réécrit les lignes de vingt filiales : il incrémente leur `version` et y inscrit le nom
> de quelqu'un qui n'y a jamais travaillé, dans des lignes que l'auteur ne peut même pas
> lire. Délier reste possible, mais devient un **geste explicite**, fait dans le périmètre
> de celui qui le fait — la couche applicative délie puis supprime, dans la même
> transaction, exactement comme le faisait le navigateur.
>
> Deux choses **ne** changent **pas**, et c'est délibéré : les **identifiants texte**
> restent les clés primaires — c'est ce qui rend la reprise d'un export `grc-backup`
> exacte au round-trip (§1.4) — et les **valeurs d'énumération** sont reprises mot pour
> mot, casse et accents compris.

Version de schéma courante : **`SCHEMA_VERSION = 28`** (défini dans `js/core/datastore.js`).
Elle numérote la **forme de l'objet `data` et du fichier `grc-backup`**, et elle continue de
vivre : c'est elle qui pilote les migrations à la relecture d'un vieil export, y compris
côté serveur, où `backend/src/reprise/` rejoue les paliers **v1 → v28**. Elle est
indépendante du numéro des migrations SQL.

> ⚠️ **Ce paragraphe a annoncé « v12 » pendant quatre montées de version**, du 04/09 au
> 16/09/2026, pendant que les trois endroits qui portent réellement le nombre —
> `js/core/datastore.js`, `backend/src/entites/index.ts` et `backend/src/reprise/index.ts` —
> disaient juste et concordaient (un essai les y oblige,
> `test/reprise/versions-concordantes.test.mjs`). *Le banc sait dire qu'un chiffre du CODE
> est faux ; il ne sait pas dire qu'une phrase d'un document l'est devenue.* C'est le
> constat **Q-219** sous sa forme la plus discrète, et il a été trouvé parce que
> l'utilisateur a demandé « les docs sont à jour ? » — pas par un contrôle.
> v3 (chantier Référentiels) : ajout des tableaux `evaluations` et `mesures`.
> v4 (chantier Incidents) : ajout du tableau `incidents`.
> v5 (chantier Documentaire) : ajout du tableau `documents`.
> v6 (chantier RGPD) : ajout du tableau `traitements`.
> v7 (chantier 3 Correspondances) : ajout du tableau `mappings` (surcouche des correspondances inter-référentiels).
> v8 (chantier 7 Tendances) : ajout du tableau `history` (indicateurs historisés, un point par jour).
> v9 (chantier Cartographie) : ajout du champ `dependances[]` (liens typés actif→actif) sur les actifs.
> v10 (chantier MCO) : refonte des `mco_actions` — passage du modèle « vérification récurrente »
>     (`etat`/`date`/`notes`) au modèle de suivi d'action planifiée (`statut`/`avancement`/dates + responsable).
> v11 (chantier Personnel) : ajout du tableau `personnes` (annuaire) → normalize crée le tableau vide.
>     Les noms de responsables restent stockés en texte dans les entités (rétrocompatible) ; l'annuaire
>     alimente l'autocomplétion des champs « Responsable » et la fiche « affectations ».
> v12 (chantier Référentiels n-n) : une exigence peut être couverte par PLUSIEURS mesures — le lien
>     `evaluations[].mesure_id` (unique) devient `evaluations[].mesure_ids[]` ; normalize convertit
>     l'ancienne valeur en tableau à 1 élément. Propagation « au plus défavorable ».
> v13 (chantier Groupe) : ajout de `risque_catalogue` (socle de risques du Groupe, plus les ajouts
>     propres à chaque filiale) et de `referentiels_actifs` (quels référentiels sont dans le périmètre
>     de ce site). Les deux arrivent VIDES sur une base héritée, et c'est correct.
> v14 (lot L19, action 19.2) : ajout de `derogations` — les écarts de conformité ASSUMÉS, avec leur
>     propriétaire, leur motif et leur échéance. ⚠️ **Aucun champ d'ÉTAT** : « en vigueur », « échue »,
>     « en attente » se DÉRIVENT côté serveur de l'échéance et de la décision du circuit d'approbation
>     (`f_etat_derogation`). Les faire voyager dans le fichier les figerait au jour de l'export, et une
>     reprise faite six mois plus tard réimporterait des dérogations « en vigueur » qui ne le sont plus.
> v15 (lot L19, action 19.3) : ajout de `documents[].mesures_ids[]` — quels CONTRÔLES un document
>     prouve, et non plus seulement quels référentiels il couvre. Un CHAMP, pas une collection.
> v16 (lot L19, actions 19.5 et 19.6) : les mesures portent leur **efficacité** (`efficacite`,
>     `efficacite_constatee_le`, `efficacite_preuve`) et leur **rythme de rejeu**
>     (`frequence_controle`, `dernier_controle`). ⚠️ **Rien n'est converti** : la maturité ne se
>     traduit PAS en efficacité — « documenté, planifié, supervisé » ne dit rien de « est-ce que ça
>     marche ». Et la prochaine échéance n'est pas un champ : elle se dérive (`f_prochain_controle`).
> v17 (lot L20, action 20.3) : ajout de `analyses_impact` — les **analyses d'impact RGPD**
>     (article 35). ⚠️ **Elles POINTENT le registre de l'article 30** (`traitement_id`) et
>     n'en recopient AUCUN champ : ni la finalité, ni les catégories de données, ni les
>     destinataires. Deux réponses à la même question dans un outil produit en audit, c'est
>     une de trop — et la seconde vieillirait sans que personne le sache. ⚠️ **Aucun champ
>     d'état** non plus : « à revoir » se dérive de la date de revue (`f_etat_aipd`), et le
>     faire voyager dans le fichier le figerait au jour de l'export. ⚠️ Et **rien n'est
>     deviné** au palier : on ne fabrique pas une analyse « requise » pour chaque traitement
>     portant des données sensibles. Ce serait inventer une obligation que personne n'a
>     constatée, et remplir le registre de l'article 35 de lignes vides apprendrait à
>     l'ignorer. La présomption s'affiche à l'écran ; elle ne s'écrit pas.
> v18 (lot L20, action 20.4) : ajout de `demandes_droits` — le **registre des demandes
>     d'exercice de droits** (RGPD articles 15 à 22, et retrait du consentement art. 7 §3).
>     ⚠️ **Aucune échéance** : le délai d'un mois de l'article 12 §3 se dérive de la date de
>     réception (`f_echeance_droits`), prorogeable de deux mois — le mécanisme de l'action
>     20.1, repris et non réinventé. Le faire voyager dans le fichier le figerait au jour de
>     l'export, et une reprise faite six mois plus tard rendrait « dans les temps » une
>     demande en retard depuis longtemps. ⚠️ **Et ces lignes emportent les données
>     personnelles d'un TIERS** — la personne qui exerce ses droits, et qui n'est pas un
>     utilisateur du produit. C'est délibéré : un export qui perdrait le nom perdrait la
>     preuve d'avoir répondu à quelqu'un. Le registre de l'article 30 du produit les range,
>     avec leur sort à l'expiration — le nom se **conserve**, le contact s'**anonymise**.
> Migrations transparentes — `normalize` crée les tableaux vides à la volée (et garantit
>     `dependances`, la conversion des anciennes actions MCO, de `mesure_id`→`mesure_ids[]`, et le
>     tableau `mesures_ids` des documents).
> v19 (lot L21, action 21.1) : ajout de `prestataire_sous_traitance` — la **chaîne de
>     sous-traitance** des tiers, exigée par l'article 29 de DORA. On y range l'**arête**
>     (« ce prestataire sous-traite CECI à celui-là »), jamais le **rang**. ⚠️ « Rang 1,
>     rang 2, rang n » se DÉRIVENT du parcours du graphe (`f_chaine_sous_traitance`) : les
>     ranger obligerait quelque chose à les décaler à chaque intercalation, et le jour où ce
>     quelque chose ne repasse pas, le registre d'information remis à l'autorité annonce des
>     rangs faux, en silence. ⚠️ **L'anti-cycle est EN BASE**, pas dans la route : il y a
>     quatre chemins d'écriture (route générique, import généralisé, reprise d'un export,
>     `psql`), et une route ne voit que le sien. ⚠️ Le palier ne **devine** rien : on ne
>     fabrique pas une arête depuis le champ libre `notes` d'un prestataire. La v19 ajoute
>     aussi à `prestataires` les champs du **registre DORA** (LEI, pays, fonction supportée
>     et son caractère critique, type de service, dates et référence contractuelles, pays de
>     traitement des données, substituabilité, plan de sortie daté, date de dernière
>     évaluation) — des colonnes, pas une collection.
> v20 (lot L21, action 21.2) : ajout de `questionnaires_tiers` — l'**envoi** d'un
>     questionnaire de sécurité à un tiers — et de `questionnaire_reponses` — ce qu'il a
>     répondu, question par question. ⚠️ **Aucune de ces deux collections ne porte les
>     QUESTIONS** : le texte des référentiels vit dans les catalogues
>     (`js/data/ref_*.js`), et `code` fait la jointure — exactement comme
>     `evaluations(ref_id, code)` depuis le premier chantier. Les recopier en ferait une
>     seconde source, et la seconde vieillirait : BoostAerospace **révise** son
>     questionnaire. ⚠️ **Aucun champ d'état** non plus : « en retard » se dérive des
>     dates (`f_etat_questionnaire`), et le figer dans le fichier rendrait « dans les
>     temps », six mois après l'export, un questionnaire jamais revenu. ⚠️ Et le produit
>     **n'envoie rien** : `envoye_le` et `relance_le` sont des **faits consignés**. Le
>     portail qui changerait cela est le lot **L28** ; l'export/réimport reste la voie de
>     repli **permanente**, pas un état transitoire.
>
> v21 (lot L24, actions 24.1 et 24.2) : ajout de `campagnes` — ce que le **Groupe**
>     demande à ses filiales : un référentiel, une échéance — et de `campagne_filiales` —
>     la **part** de chaque filiale : qui répond, et les deux faits qu'elle consigne
>     (prise de connaissance, achèvement).
>
>     ⚠️ **`campagnes` est de niveau GROUPE et ne porte AUCUN identifiant de filiale.**
>     Son intitulé, son référentiel et son échéance sont les mêmes vus de Toulouse et vus
>     de Hambourg — c'est le critère du `backend/db/CONVENTIONS.md` §24, et la table est
>     déclarée aux deux listes arbitrées que ce §24 impose. Sa LECTURE est ouverte, parce
>     qu'une filiale doit voir la campagne qui la convoque ; son ÉCRITURE exige
>     l'administration Groupe, comme `utilisateurs`.
>
>     ⚠️ **Une filiale ne voit QUE sa part**, et n'apprend pas combien d'autres sont
>     convoquées : `campagne_filiales` est cloisonnée, et le nombre de destinataires est
>     une information de Groupe.
>
>     ⚠️ **Aucune des deux ne porte l'AVANCEMENT.** Il se compte dans `evaluations` sur le
>     référentiel demandé, à l'instant où on regarde — une colonne d'avancement devrait
>     être remise à jour, et le jour où le traitement ne tourne pas, le produit affirmerait
>     qu'une filiale a répondu quand elle n'a rien fait. Et **aucun pourcentage** n'est
>     rendu par le serveur : le nombre de questions d'un référentiel vit dans les
>     catalogues du frontend, donc c'est l'écran qui divise (décision de l'action 21.2,
>     reprise ici sans être rejugée).
>
> v22 (lot L25, actions 25.1, 25.2 et 25.5) : ajout des cinq collections des **ateliers 1
>     et 2 d'EBIOS RM** — `ebios_connaissances` (la base de connaissances du Groupe :
>     sources de risque types et modes opératoires types), `ebios_etudes` (le cadrage d'une
>     analyse : un périmètre, un exercice), `ebios_valeurs_metier`,
>     `ebios_evenements_redoutes` et `ebios_sources_risque` (les couples source de risque /
>     objectif visé).
>
>     ⚠️ **EN ADDITION, JAMAIS EN REMPLACEMENT — c'est le critère d'acceptation de
>     l'action 25.1, et il est écrit en négatif.** La collection `risques` et ses cinq
>     champs de cotation (`f_frequence`, `g_gravite`, `m_maitrise`, `score_brut`,
>     `score_residuel`) ne bougent pas d'un octet. Le produit porte donc **deux méthodes de
>     cotation en même temps**, et elles ne se parlent pas : une migration qui
>     réinterpréterait les cotations existantes les réattribuerait **en silence**, dans un
>     outil qui sert de preuve en audit — c'est le motif qui a fait refuser la
>     renumérotation du catalogue ANSSI (constat **Q-192**). Le garde-fou
>     `f_verifier_ebios_cadrage()` le mesure : les cinq colonnes sont nommées une par une,
>     et tout déclencheur d'une table EBIOS qui écrirait dans `risques` fait rougir le
>     démarrage.
>
>     ⚠️ **Une valeur métier POINTE le processus du BIA, elle ne le recopie pas** (action
>     25.2) : ni criticité, ni RTO, ni RPO n'ont de jumelle ici, et un essai le mesure dans
>     le catalogue. Même arbitrage qu'à l'AIPD (v17), et pour le même motif — deux réponses
>     à la même question dans un outil produit en audit, c'est une de trop, et la seconde
>     vieillit sans que personne le sache. Le socle de sécurité et les biens supports de
>     l'atelier 1 ne sont pas ressaisis non plus : ce sont les référentiels applicables, le
>     pivot « Mesure de sécurité », les `actifs` et leur cartographie.
>
>     ⚠️ **Aucune collection ne porte la PERTINENCE d'un couple.** Elle se dérive de ses
>     trois critères (`f_ebios_pertinence`), à un seul endroit, et n'est qu'une
>     **suggestion** : ce qui engage l'étude est `retenue`, saisie par un humain, dont le
>     schéma exige la justification. La faire voyager dans le fichier la figerait au jour
>     de l'export, alors que l'animateur révise ses critères en séance. ⚠️ Et elle **se
>     tait** dès qu'un critère manque — pas d'estimation par défaut, motif du critère 25.4.
>
>     ⚠️ **`ebios_connaissances` est MIXTE** — `filiale_id` nul = socle du Groupe, comme
>     `risque_catalogue` : une base de connaissances de menaces partagée est l'objet même
>     de l'action 25.5. Les quatre autres sont purement locales : une étude de portée
>     Groupe voudrait dire que vingt filiales partagent un périmètre et des événements
>     redoutés, ce qui est faux par construction.
>
>     ⚠️ Le palier ne **devine** rien : on ne fabrique pas une étude EBIOS RM à partir des
>     risques déjà cotés. Une cotation F × G × M ne dit ni la valeur métier atteinte, ni la
>     source, ni l'objectif visé — en déduire une étude produirait une analyse que personne
>     n'a conduite.
>
> v23 (lot L25, fin de l'action 25.1) : ajout des trois collections des **ateliers 3, 4
>     et 5** — `ebios_parties_prenantes` (l'écosystème et son évaluation),
>     `ebios_scenarios_strategiques` (les chemins d'attaque) et
>     `ebios_scenarios_operationnels` (les modes opératoires, et la **décision** de
>     traitement).
>
>     ⚠️ **La cartographie n'est pas refaite** (critère 25.2) : `actif_dependances` porte
>     déjà les dépendances typées. Ce que l'atelier 3 ajoute est l'**évaluation** d'une
>     partie prenante — dépendance, pénétration, maturité cyber, confiance — et le lien
>     vers le prestataire du produit quand c'en est un, qu'elle **POINTE** sans recopier
>     ni sa raison sociale, ni sa criticité, ni son niveau d'accès.
>
>     ⚠️ **`ebios_scenarios_strategiques` ne porte AUCUNE gravité.** Celle d'un chemin EST
>     celle de l'événement redouté qu'il réalise ; une colonne ici créerait une seconde
>     réponse à la même question, et la seconde vieillirait dès la prochaine réévaluation
>     de l'atelier 1 — sans que personne le sache. Elle se lit par la jointure, et un essai
>     le mesure **dans le catalogue** plutôt que de le relire.
>
>     ⚠️ **Aucun NIVEAU ne voyage** non plus : celui d'une partie prenante
>     (`f_ebios_niveau_menace`, exposition rapportée à la fiabilité cyber) et celui d'un
>     scénario (`f_ebios_niveau_scenario`, gravité × vraisemblance) se dérivent à la
>     lecture. Les figer dans le fichier les rendrait faux dès la séance suivante.
>
>     ⚠️ **Le plan d'actions n'est pas refait** : `actions.risque_id` existe depuis le
>     premier chantier. Un scénario opérationnel porte donc une **décision** — éviter,
>     réduire, transférer, accepter — et, facultativement, `risque_id`. **C'est un LIEN,
>     pas une conversion** : rien n'est écrit dans `risques`, et le garde-fou de la `046`
>     le mesure dans le catalogue pour toutes les tables `ebios_*`.
>
> v24 (lot L25, action 25.3) : ajout de **`echelles`** et **`echelle_niveaux`** — ce qu'un
>     chiffre de cotation VEUT DIRE. Toutes deux **MIXTES** : `filiale_id` nul = socle du
>     Groupe, renseigné = échelle d'une filiale. Cinq collections gagnent en plus la
>     colonne qui porte l'échelle de leur cotation — `risques` (deux : F et G),
>     `ebios_evenements_redoutes`, `ebios_scenarios_operationnels`,
>     `ebios_sources_risque` et `ebios_parties_prenantes`.
>
>     ⚠️ **LE PALIER NE DEVINE RIEN.** La tentation était d'estampiller les cotations déjà
>     dans le fichier avec l'échelle du Groupe — quatre niveaux, exactement ceux que le
>     navigateur proposait — et l'argument aurait eu l'air solide : *« elles ont forcément
>     été produites sur cette graduation-là, puisqu'il n'y en avait pas d'autre »*. Il est
>     faux : le fichier repris peut venir d'une société rachetée, d'un export bricolé, d'une
>     installation où quelqu'un a saisi des 5. « Il n'y avait pas d'autre échelle » décrit ce
>     que le PRODUIT proposait, jamais ce que l'utilisateur a fait. C'est le motif du constat
>     **Q-192**, et le coût de se tromper n'est pas symétrique : une cotation marquée
>     « non tracée » se voit à l'écran et se corrige en recotant ; une cotation faussement
>     estampillée est indiscernable d'une vraie, **dans l'outil qui sert de preuve en audit**.
>
>     ⚠️ **`revision` n'est PAS le verrouillage optimiste.** Celui-ci s'appelle `_version` et
>     voyage à part (champs structurels). Deux sens sous un nom est le motif du bloquant du
>     6ᵉ passage de la porte S2 ; la migration `049` a donc nommé le second `revision`.
>
>     ⚠️ **Et aucune borne sur `valeur`** : l'échelle EST ce qui borne, et un maximum posé
>     ici refuserait la reprise d'un export produit sur une graduation plus large. C'est
>     l'arbitrage de `risques.f_frequence`, reconduit pour la même raison.
>
> v25 (lot L25, action 25.4) : ajout de **`risque_quantification`** — la quantification
>     financière d'un risque, selon FAIR. **Cloisonnée**, une par risque au plus, et
>     facultative : la plupart des risques n'en portent pas.
>
>     La fréquence d'un événement de perte et sa magnitude s'estiment chacune par un
>     **triplet** `(minimum, plus probable, maximum)`, dont la moyenne PERT —
>     `(min + 4 × probable + max) / 6` — est celle du domaine. La **perte annualisée** est
>     le produit des deux moyennes, augmenté des **pertes secondaires** (amende, litige,
>     clients perdus) quand elles sont estimées.
>
>     ⚠️ **UN TRIPLET INCOMPLET NE REND RIEN**, et le refus est posé à deux étages : une
>     contrainte refuse d'écrire un triplet à deux valeurs, et la dérivation rend `null`
>     sur tout argument nul. Deux valeurs sur trois donneraient un nombre qui AURAIT L'AIR
>     mesuré — et c'est celui-là qu'on cite en comité de direction. C'est le critère 25.4
>     mot pour mot : *pas d'estimation par défaut*.
>
>     ⚠️ **DES PERTES SECONDAIRES ABSENTES NE VALENT PAS ZÉRO.** Le montant ne porte alors
>     que la perte primaire : c'est un **PLANCHER**, que `_secondaireEstimee` marque et que
>     l'écran annonce par un « ≥ ». Écrire `coalesce(secondaire, 0)` aurait toujours abouti
>     — et sous-estimé en silence, c'est-à-dire produit l'estimation par défaut dans le
>     sens rassurant, le pire des deux.
>
>     ⚠️ **NI `perte_annualisee`, NI `secondaire_estimee` NE VOYAGENT dans le fichier
>     d'échange.** Ce sont des colonnes **engendrées** : les faire voyager les rendrait
>     reprenables, et un fichier bricolé porterait un montant que ses propres hypothèses ne
>     produisent pas. Elles sont servies au navigateur sous `_perteAnnualisee` et
>     `_secondaireEstimee` — le souligné initial, réservé à ce que le serveur ajoute, est
>     écarté à l'entrée **par le préfixe**.
>
>     ⚠️ **LE PALIER NE DEVINE RIEN, et la tentation était plus grande qu'au palier
>     précédent** : le produit connaît F, G et M de chaque risque, et une correspondance
>     « gravité 4 → un million d'euros » aurait l'air d'un service rendu. La gravité 4
>     d'une filiale de trois cents personnes et celle d'un groupe de vingt mille ne
>     désignent pas la même somme — et c'est précisément pour cela que l'action 25.4
>     existe : **la cotation ordinale ne se convertit pas en monnaie**.
>
>     ⚠️ **Et c'est la SEULE grandeur du produit qui s'additionne entre filiales.** La
>     consolidation somme les pertes annualisées d'un périmètre, et rend `null` dès que
>     **deux devises** y coexistent — même mécanique qu'aux échelles de la v24, pour la
>     même raison.
>
> v26 (lot L26, action 26.1) : ajout de **`referentiels`**, **`referentiel_domaines`**,
>     **`referentiel_exigences`** et **`referentiel_traductions`** — les catalogues de
>     référentiels entrent en base. Ils vivaient dans six fichiers JavaScript publiés dans
>     la racine web : une évolution de norme était une **livraison de code**, un client ne
>     pouvait pas apporter sa grille, et rien ne **datait** les catalogues.
>
>     Les quatre sont **MIXTES** : `filiale_id` nul = catalogue du socle, lisible de toutes
>     les filiales ; renseigné = grille apportée par une filiale (action 26.2).
>
>     ⚠️ **LES CODES SONT CONSERVÉS À L'OCTET PRÈS**, et c'est le critère du lot. Ils sont
>     la moitié droite de la clé par laquelle toute auto-évaluation est stockée
>     (`evaluations`, clé `ref_id` + `code`). Le semis de la migration `051` a été
>     **engendré** depuis les fichiers source — qui vivent désormais dans
>     `backend/db/catalogues/` — et `test/catalogues/fidelite.test.mjs` compare la base à
>     ces mêmes fichiers, exigence par exigence, à chaque banc. *Un semis engendré une fois
>     est juste une fois ; c'est la comparaison qui le garde juste.*
>
>     ⚠️ **`evaluations.ref_id` n'a PAS de clé étrangère, et n'en aura pas.** Une réponse
>     d'audit doit survivre à l'ARCHIVAGE du catalogue qui l'a produite — c'est ce que
>     l'action 26.3 organise —, et une clé ferait échouer la reprise d'une sauvegarde
>     portant des évaluations d'un catalogue retiré depuis. `referentiels_actifs.ref_id`,
>     lui, en reçoit une : activer un référentiel qui n'existe pas est sans objet.
>
>     ⚠️ **Le palier crée quatre tableaux VIDES**, et c'est la bonne réponse : un export
>     d'avant la v26 n'en porte aucun, et le socle est déjà en base. Ce qui l'empêche
>     d'être détruit n'est pas le palier — c'est que `purgerFiliale()` supprime
>     `where filiale_id = $1`, et que le socle porte `filiale_id` nul par construction.
>
>     ⚠️ **« Accepter » exige sa justification**, et c'est la seule des quatre décisions :
>     les trois autres produisent un travail que quelqu'un verra, accepter ne produit rien
>     — sans sa phrase, la décision est indistinguable d'un oubli.
>
> v27 (lot L22, action 22.4) : ajout de **`connecteurs`** — la configuration des contrôles
>     automatiques (genre, mesure surveillée, fraîcheur attendue, réglages).
>
>     ⚠️ **`collectes` N'EN FAIT PAS PARTIE, et c'est la décision qui compte ici.** La
>     ligne entre les deux tables est celle qui sépare un **réglage** d'une **preuve** :
>     un connecteur se refait à l'identique après une reprise, et le ressaisir filiale par
>     filiale serait une perte pure ; un constat est une preuve datée, au même titre que
>     le journal d'audit, la main courante de crise et les pièces jointes — le faire
>     voyager dans un fichier lisible et éditable lui ôterait sa valeur probante. *On ne
>     restaure pas un constat ; on en produit un nouveau.*
>
>     ⚠️ **Et c'est ce qui a rendu la migration `055` nécessaire.** `configuration` est un
>     `jsonb` ouvert : une entité qui voyage aurait emporté **en clair, dans un fichier
>     d'échange**, le mot de passe qu'un exploitant y aurait rangé. Les clefs admises sont
>     donc **closes en base, par genre** (`f_connecteur_clefs()`), et aucun des trois
>     exécuteurs n'en demande qui soit un secret — les identifiants du lien LDAP et le
>     chemin du démon antivirus viennent de la **configuration du serveur**.
>     ⚠️ La parade n'est **pas** d'interdire les clefs qui *ressemblent* à un secret :
>     `motdepasse_2` passerait, et reconnaître un mot au lieu de mesurer un sens est ce
>     que le `CONVENTIONS.md` §39.1 interdit. C'est la **liste** qui est close.
>
>     ⚠️ **Le palier crée un tableau VIDE**, et il ne doit rien inventer : un connecteur
>     inventé serait un contrôle qu'on croit posé et qui ne s'exécute jamais.
>
> v28 (migration `061`) : ajout des **fiches réflexes de crise** — `fiches_reflexes`,
>     `fiche_reflexe_actions` et `contacts_urgence`. Elles étaient écrites **en dur** dans
>     `js/modules/crise.js` : six rôles, vingt-cinq réflexes, sept contacts — dont quatre
>     lignes de tirets bas que personne ne pouvait remplir.
>
>     ⚠️ **Les trois tables sont MIXTES** : `filiale_id` nul = socle du Groupe, renseigné =
>     version propre à une filiale, qui **REMPLACE** celle du socle pour le même rôle et
>     ne s'y ajoute pas. Deux fiches pour « Responsable IT / SSI » au moment d'une crise,
>     c'est deux colonnes qui se contredisent sous les yeux de quelqu'un qui n'a pas le
>     temps de choisir.
>
>     ⚠️ **Elles VOYAGENT, contrairement à la main courante de crise** — et c'est la même
>     ligne qu'à la v27 : une fiche réflexe est une **procédure**, qu'on refait à
>     l'identique après une reprise ; une main courante est une **preuve datée**.
>
>     ⚠️ **Le palier livre trois tableaux VIDES**, et surtout pas le socle. Y recopier les
>     six fiches aurait donné, sur une base neuve, **deux jeux de portée Groupe pour les
>     mêmes rôles** — celui que la migration sème et celui que le palier invente ; l'unicité
>     `nulls not distinct` refuserait alors la reprise, et le produit rendrait une
>     sauvegarde qu'il ne sait pas relire (motif **Q-194**).
>
>     ⚠️ **`role` n'est pas une référence**, et il ne doit pas être recalé : il est apparié
>     à `crise.role` **en texte**, comme la cellule l'est depuis la migration `003`.
>     `fiche_id`, lui, **en est une** — le serveur réattribue les identifiants à la reprise,
>     et un réflexe qui viserait l'ancien s'imprimerait détaché de sa fiche.

---

## 1. Où vivent les données, et sous quelle forme

### 1.1 La source de vérité est le serveur

| | Avant (produit navigateur) | Depuis le lot L2 |
|---|---|---|
| Source de vérité | IndexedDB `cyber-grc-db`, store `kv`, clé `current` | **PostgreSQL**, sur le serveur, cloisonné par filiale |
| Points de restauration | store `backups`, sur le poste | sauvegarde du serveur (`backend/README.md` §6) |
| Chiffrement au repos | coffre opt-in du navigateur (PBKDF2 600k + AES-256-GCM) | **chiffrement disque de la VM** — le coffre a été retiré : il ne protégeait plus rien |
| Miroir `localStorage` | instantané de secours en clair | supprimé |
| `cyber-context` (« périmètre actif ») | choisi et mémorisé dans le navigateur | **le périmètre vient du serveur** (`/api/session`), en lecture seule ; la clé est purgée au démarrage **et à la fermeture**. Le filtre « donneur d'ordre », qu'elle portait aussi, vit désormais en mémoire (`window.FiltreDonneurOrdre`) — deux choses distinctes, longtemps confondues |
| Export `grc-backup` | sauvegarde | **format d'échange** (`PLAN_SERVEUR` §2.6) |

Ce qui subsiste d'IndexedDB, et rien d'autre : `js/core/persistence.js` sait encore
**lire** la base héritée d'un poste, en lecture seule et sans jamais provoquer de
migration, pour que l'utilisateur puisse l'exporter puis la reprendre.
`idbAvailable()` rend `false` **définitivement**, ce qui fait emprunter partout le
chemin « pas de stockage local ». Rien n'est effacé de ce poste sans un geste
explicite de l'utilisateur, et jamais avant que ses données aient été mises à l'abri.

### 1.2 Ce que les modules métier voient, en revanche, n'a pas changé

C'est la décision qui rend le chantier faisable (`PLAN_SERVEUR` §1.3, risque projet
P3) : **la façade synchrone de `DataStore` est préservée**. Les modules appellent
toujours `getX / addX / updateX / deleteX`, toujours de façon synchrone, sur le même
objet `data` en mémoire. Ce qui a basculé, c'est ce qu'il y a *dessous* :

- au démarrage, `data` est **chargé depuis `/api/donnees`**, dans la forme exacte
  décrite par ce document ;
- `save()` — toujours l'entonnoir unique appelé après chaque mutation — ne réécrit
  plus un instantané complet : il réveille `js/core/sync.js`, qui compare l'état en
  mémoire à un **instantané de référence** et n'envoie que **l'enregistrement
  modifié**, sous verrouillage optimiste ;
- un sondage périodique rapatrie le travail des autres utilisateurs.

### 1.3 Instantané complet (objet `data`)

Inchangé — c'est aussi la charge utile d'un fichier `grc-backup` :

```jsonc
{
  "schemaVersion": 20,   // = SCHEMA_VERSION courant
  "updatedAt": 1730000000000,
  "clients": [],        "exigences": [],   "actions": [],
  "risques": [],        "actifs": [],      "processus": [],
  "crise": [],          "scenarios_pra": [], "tests_pra": [],
  "prestataires": [],   "mco_actions": [], "audits": [],  "revues": [],
  "evaluations": [],    "mesures": [],      // v3 — chantier Référentiels
  "incidents": [],      // v4 — chantier Incidents
  "documents": [],      // v5 — chantier Documentaire
  "traitements": [],    // v6 — chantier RGPD (article 30)
  "mappings": [],       // v7 — chantier 3 (surcouche des correspondances inter-référentiels)
  "history": [],        // v8 — chantier 7 (indicateurs historisés : courbes de tendance)
  "personnes": []       // v11 — chantier Personnel (annuaire)
}
```

**Fichier d'export `grc-backup`** — l'enveloppe, elle aussi inchangée :

```jsonc
{ "format":"grc-backup", "version":12, "encrypted":false, "createdAt":"ISO",
  "app":"cyber-grc-dedienne", "payload": <objet data> }
// `version` = SCHEMA_VERSION au moment de l'export, pas un numéro de format :
// c'est elle qui pilote les migrations à la relecture.
// chiffré : "encrypted":true, "kdf":{salt,iterations,hash}, "cipher":{iv,ct} (payload absent)
```

⚠️ **Le serveur refuse explicitement une enveloppe chiffrée** : la phrase de passe
n'existe plus dans cette version. Un instantané chiffré par l'ancien coffre doit être
exporté depuis l'ancienne version de l'application, en clair, avant d'être repris.

### 1.4 Le numéro de version d'un enregistrement — et pourquoi il n'est pas dans l'enregistrement

Chaque ligne du serveur porte un compteur **`version`**, incrémenté à chaque écriture.
C'est lui qui porte le **verrouillage optimiste**, la parade au risque projet P1 —
*l'écrasement silencieux* : le serveur écrit avec
`update … where id = $1 and version = $2`, et zéro ligne modifiée vaut refus, jamais
écrasement (`CONVENTIONS.md` §15, code `GRC03`).

**Côté navigateur, ce numéro ne vit pas dans l'enregistrement.** Il est tenu dans une
table à part, interne à `js/core/sync.js` (`versions[collection] : id → {v, vmo}`), et
les champs `_version` / `_versionMiseEnOeuvre` que le serveur ajoute sont **retirés
des enregistrements dès leur réception**.

La raison est celle-ci, et elle vaut d'être comprise avant d'être trouvée gênante :
`data` garde ainsi **exactement la forme décrite par ce document** — celle que les
modules connaissent, et celle du fichier `grc-backup`. Un module qui reconstruit un
objet en repartant de ses champs (ce que font plusieurs formulaires) ne peut donc pas
**perdre la version au passage** : ce serait une porte ouverte au risque P1, et elle
serait invisible.

Conséquences pratiques :

- **un export `grc-backup` ne porte aucun numéro de version**, et n'a pas à en porter :
  à la reprise, la base impose `version = 1` à l'insertion et ignore ce qu'on lui
  enverrait (`CONVENTIONS.md` §18.1) ;
- `mesures` en porte **deux**, parce que l'entité est scindée côté serveur (§1.5) :
  celle de la définition et celle de la mise en œuvre.

### 1.5 Correspondance entre l'objet `data` et le schéma serveur

**44 collections, 44 entités.** Les noms coïncident partout sauf pour `mesures` :

| Collection `data` | Table(s) PostgreSQL | Préfixe d'identifiant |
|---|---|---|
| `clients` | `clients` | `CLI` |
| `personnes` | `personnes` | `PERS` |
| `exigences` | `exigences` | `EX` |
| `actions` | `actions` | `ACT` |
| `risques` | `risques` | `RISK` |
| `actifs` | `actifs` | `ACTIF` |
| `processus` | `processus` | `BIA` |
| `crise` | `crise` | `CRISE` |
| `scenarios_pra` | `scenarios_pra` | `SCEN` |
| `tests_pra` | `tests_pra` | `TEST` |
| `prestataires` | `prestataires` | `PREST` |
| `mco_actions` | `mco_actions` | `MCO` |
| `audits` | `audits` | `AUD` |
| `revues` | `revues` | `REV` |
| `evaluations` | `evaluations` | `EVAL` |
| **`mesures`** | **`mesure_catalogue`** (la définition) **+ `mesure_mise_en_oeuvre`** (l'évaluation dans une filiale) | `MESURE`, et `MMO` pour la mise en œuvre |
| `incidents` | `incidents` | `INC` |
| `documents` | `documents` | `DOC` |
| `traitements` | `traitements` | `TRT` |
| `mappings` | `mappings` | `MAP` |
| `history` | `history` | `HIST` |
| `risque_catalogue` | `risque_catalogue` | `RCAT` |
| `referentiels_actifs` | `referentiels_actifs` | `RA` |
| `derogations` | `derogations` | `DER` |
| **`analyses_impact`** | **`analyses_impact`** (l'analyse) **+ `analyse_mesures`** (les contrôles qu'elle PRÉVOIT) | `AIPD` |
| `demandes_droits` | `demandes_droits` | `DSAR` |
| `prestataire_sous_traitance` | `prestataire_sous_traitance` | `SOUS` |
| `questionnaires_tiers` | `questionnaires_tiers` | `QUES` |
| `questionnaire_reponses` | `questionnaire_reponses` | `QREP` |
| **`campagnes`** | **`campagnes`** — ⚠️ de niveau **Groupe**, sans `filiale_id` | `CAMP` |
| `campagne_filiales` | `campagne_filiales` | `CAMPF` |
| **`ebios_connaissances`** | **`ebios_connaissances`** — ⚠️ MIXTE : `filiale_id` nul = socle du **Groupe** | `EBCO` |
| `ebios_etudes` | `ebios_etudes` | `EBET` |
| `ebios_valeurs_metier` | `ebios_valeurs_metier` | `EBVM` |
| `ebios_evenements_redoutes` | `ebios_evenements_redoutes` | `EBER` |
| `ebios_sources_risque` | `ebios_sources_risque` | `EBSR` |
| `ebios_parties_prenantes` | `ebios_parties_prenantes` | `EBPP` |
| `ebios_scenarios_strategiques` | `ebios_scenarios_strategiques` — ⚠️ **sans gravité** : elle est celle de l'événement redouté réalisé | `EBSS` |
| `ebios_scenarios_operationnels` | `ebios_scenarios_operationnels` | `EBSO` |
| **`echelles`** | **`echelles`** — ⚠️ MIXTE : `filiale_id` nul = socle du **Groupe**. Une échelle publiée est **figée** : on en publie une **révision** | `ECHL` |
| **`echelle_niveaux`** | **`echelle_niveaux`** — ⚠️ MIXTE, portée tenue par un **déclencheur** et non par une clé composite (`MATCH SIMPLE` ne contrôle rien quand `filiale_id` est nul) | `ECHN` |
| **`risque_quantification`** | **`risque_quantification`** — ⚠️ **CLOISONNÉE**, à la différence des deux échelles : un montant de perte dépend de la filiale, et une quantification de portée Groupe serait lisible de toutes. Deux champs **dérivés** servis en lecture seule, `_perteAnnualisee` et `_secondaireEstimee` | `FAIR` |
| **`referentiels`** | **`referentiels`** — ⚠️ MIXTE. L'identifiant est celui que `evaluations.ref_id` porte DÉJÀ (« anssi-hygiene », « dora ») : lui en donner un neuf aurait été la renumérotation que le constat **Q-192** a fait refuser. `version` est un ALIAS de `version_referentiel` — la version du TEXTE, pas le verrouillage optimiste | `REFT` |
| **`referentiel_domaines`** | **`referentiel_domaines`** — ⚠️ MIXTE | `REFD` |
| **`referentiel_exigences`** | **`referentiel_exigences`** — ⚠️ MIXTE, et elle porte `referentiel_id` **en plus** de `domaine_id` : c'est la moitié gauche de la clé `(ref_id, code)`, et la clé étrangère **composite** l'empêche de diverger de son domaine | `REFE` |
| **`referentiel_traductions`** | **`referentiel_traductions`** — ⚠️ MIXTE ; le dictionnaire est un **document figé** en `jsonb`, et le FRANÇAIS n'en a pas : il est la source | `REFX` |
| **`fiches_reflexes`** | **`fiches_reflexes`** — ⚠️ MIXTE : `filiale_id` nul = socle du Groupe. Une fiche LOCALE **remplace** celle du socle pour le même rôle, elle ne s'y ajoute pas. `role` est apparié à `crise.role` **en texte**, sans clé étrangère — l'imposer interdirait d'écrire la fiche avant de désigner son titulaire | `FICHE` |
| **`fiche_reflexe_actions`** | **`fiche_reflexe_actions`** — ⚠️ MIXTE ; sa portée est tenue par un **déclencheur**, une clé composite ne pouvant rien dire quand `filiale_id` est nul (`CONVENTIONS.md` §45) | `FREF` |
| **`contacts_urgence`** | **`contacts_urgence`** — ⚠️ MIXTE : les références publiques (CERT-FR, CNIL) au socle, l'assurance et l'infogérant par filiale. `coordonnee` NULLABLE = « à compléter » | `CTCU` |

**La scission des mesures**, en une phrase : l'entité unique du modèle navigateur
portait deux choses de nature différente — la **définition** du contrôle (la même
partout, niveau Groupe) et son **évaluation** (propre à chaque site, niveau Filiale).
Le frontend continue de voir **une** entité ; le serveur en tient **deux**. Sans cela,
les filiales ne sont plus comparables et la vision Groupe additionne des grandeurs
incomparables. Attention au piège : les deux tables portent une colonne `statut`, de
sens **opposé** — cycle de vie du contrôle d'un côté (`active` / `archivee`),
conformité de l'autre. Le `statut` que voit le frontend est celui de la **mise en
œuvre**. `MMO` est le seul identifiant du modèle qui n'existe dans aucun export
`grc-backup` : il est engendré à la reprise, jamais lu depuis un fichier.

**Les tableaux d'identifiants deviennent des tables de liaison** — onze, avec de
vraies clés étrangères :

| Champ de l'objet `data` | Table de liaison |
|---|---|
| `risques[].exigences_liees` | `risque_exigences` |
| `actifs[].risques_lies` | `actif_risques` |
| `actifs[].dependances` | `actif_dependances` |
| `processus[].actifs_lies` | `processus_actifs` |
| `evaluations[].mesure_ids` | `evaluation_mesures` |
| `incidents[].actifs_touches` | `incident_actifs` |
| `documents[].referentiels` | `document_referentiels` |
| `documents[].etiquettes` | `document_etiquettes` |
| `traitements[].mesures_ids` | `traitement_mesures` |
| `analyses_impact[].mesures_ids` | `analyse_mesures` |
| `mappings[].refs` | `mapping_exigences` |

Quelques champs changent de nom de colonne (`tests_pra.date` → `date_test`, par
exemple) ; ces alias sont déclarés une fois dans le registre d'entités du serveur, et
**tout le reste — colonnes, types, contraintes, cloisonnement — est découvert dans le
catalogue PostgreSQL**, jamais recopié.

### 1.5 bis Les tables qui ne sont PAS des collections de `data`

⚠️ **Toutes les tables du schéma ne sont pas des entités**, et les confondre conduit à
chercher dans un export `grc-backup` ce qui n'y a jamais été. Trois familles vivent hors
de `data`, délibérément :

| Famille | Tables | Pourquoi elle n'est pas dans `data` |
|---|---|---|
| **Registres probants** | `journal_audit`, `main_courante_crise`, `collectes`, `pieces_jointes` | Les faire voyager dans un fichier éditable leur ôterait leur valeur de preuve. On ne restaure pas un journal. |
| **Registres techniques** | `migrations_schema`, `controles_schema`, `colonnes_personnelles` | Ils décrivent le SCHÉMA, pas les données : leur contenu est identique dans toutes les filiales par construction. |
| **Configuration de niveau Groupe** | `filiales`, `utilisateurs`, `profils`, `profil_domaines`, `groupes_ad`, `sessions`, **`revues_habilitations`**, **`revue_habilitation_lignes`** | Elles ne décrivent aucune filiale en particulier. Leur écriture est réservée à l'administration Groupe. |

**Les deux tables de la revue des habilitations** (migration `060`, ISO 27001 A.5.18)
méritent un mot, parce que leur rangement a demandé un arbitrage :

- `revues_habilitations` — la campagne : intitulé, périmètre balayé, ouverture, clôture,
  conclusion, prochaine échéance, et le drapeau `balayage_tronque` qui dit qu'un
  instantané est **incomplet** ;
- `revue_habilitation_lignes` — l'instantané **FIGÉ**, une ligne par
  (groupe d'annuaire × compte membre), avec la décision prise, son auteur et sa date.

⚠️ **Elles sont de niveau Groupe, et c'est une DÉCISION**, pas un oubli. Leurs trois
sources — `groupes_ad`, `profils`, `utilisateurs` — le sont toutes, et surtout : **le
périmètre d'une personne n'est stocké nulle part**, il est RÉSOLU à chaque connexion
depuis ses groupes d'annuaire. Les rattacher à une filiale aurait supposé un
rattachement que le modèle n'a pas, c'est-à-dire l'aurait inventé — et une revue fondée
sur un rattachement inventé atteste de ce qui n'a pas été vérifié.

🛑 **Ce qui les protège n'est donc pas la RLS mais la ROUTE.** Leur lecture est ouverte
au niveau des politiques — le §2 de `004_rls.sql` interdit qu'une politique de LECTURE
dépende d'un réglage d'administration —, et la barrière est la déclaration
`{ action: 'lire', domaine: 'administration' }` des routes de `src/habilitations/`, que
le contrôle **T-3** de `test/api/routes.test.mjs` mesure. C'est exactement le régime de
`utilisateurs`, `profils` et `groupes_ad` depuis la porte S1.

⚠️ **L'instantané ne se relit JAMAIS dans l'annuaire.** Une revue close cite donc des
personnes qui ont pu quitter le groupe depuis — c'est voulu : *ce qui sert de preuve ne
se recalcule pas*, et c'est ce qu'on a revu.

### 1.6 Convention d'identifiants

`"<PRÉFIXE>-<horodatage>-<aléa>"` — la forme historique du produit, conservée.

⚠️ Ce qui est normatif est une **propriété, pas un encodage** : la part aléatoire
porte **au moins 52 bits tirés d'un générateur cryptographique**. Le produit fabrique
des identifiants à **cinq endroits, dans trois langages** — trois générateurs aléatoires,
un par langage, et **deux dérivations qui ne tirent rien** —, et les formes diffèrent
légitimement : imposer une forme unique obligerait le navigateur à appeler le serveur
pour créer une ligne. Le tableau des cinq formes, le plancher et son contrôle sont
dans **[`backend/db/CONVENTIONS.md`](../backend/db/CONVENTIONS.md) §2**, qui fait foi ;
ils ne sont pas recopiés ici.

> **Dette soldée.** Ce paragraphe a longtemps porté un avertissement — `Date.now()`
> seul, sujet à collision. Le défaut était **pire** que l'avertissement ne le laissait
> croire : la part aléatoire ne tenait que sur **mille valeurs**, et un import tire les
> siennes dans la même milliseconde. Les mesures, consignées au
> `backend/db/CONVENTIONS.md` §2 et dans le rapport de la porte S2 : **24 collisions sur
> 250 tirages**, et un import qui écrit **223 lignes sur 250 en annonçant le succès** —
> donc un score de conformité faux, dans un outil destiné à servir de preuve en audit.
> Ce fut le seul constat bloquant d'un passage de porte du chantier.

**Ce que les identifiants texte garantissent, et qui explique qu'on les ait gardés
plutôt que de passer à des UUID ou des `serial` :** la reprise d'un export
`grc-backup` est un **round-trip exact**. Les identifiants du fichier deviennent tels
quels les clés primaires, et les huit clés étrangères implicites du modèle (`ref_id`,
`risque_id`, `client_id`, `exigence_id`, `scenario_id`, `mesure_id`, `evaluation_id`,
`incident_id`) continuent de pointer sans table de correspondance.

**Deux exceptions, et elles se lisent dans l'identifiant lui-même.** Les deux sont des
**dérivations** : rien n'y est tiré au hasard, et la marque qui remplace l'horodatage dit
laquelle — un identifiant dérivé n'a pas d'instant de création, et y en laisser un
crédible mentirait au lecteur du journal.

| Marque | Ce qu'elle dit | Dérivée de |
|---|---|---|
| `<PRÉFIXE>-r-<empreinte>` | **le serveur a dû ré-émettre** : l'identifiant du fichier était déjà pris dans le domaine global par une ligne d'une filiale que l'appelant ne voit pas | `(filiale, table, identifiant du fichier)` |
| `<PRÉFIXE>-d-<empreinte>` | **le fichier n'apportait pas d'identifiant** exploitable — cas des exports anciens | `(collection, rang, contenu)` |

Dans le premier cas, le serveur **réécrit toutes les références** de la charge qui
visaient l'identifiant remplacé. Les deux dérivations rendent la reprise
**idempotente** : trois reprises du même fichier convergent sur **une** ligne au lieu
d'en cloner trois.

Le domaine `id_metier` reste **volontairement permissif** (texte non vide, ≤ 64
caractères) : les exports anciens contiennent des identifiants sans suffixe aléatoire
(`ACT-1720000000000`) et des identifiants de processus BIA sans préfixe. C'est le
format *engendré* qui est normé, pas le format *accepté* — une expression régulière
stricte casserait la reprise de données réelles.

---

## 2. Entités

### Client (« Donneur d'ordre ») — `clients`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"CLI-..."` | |
| `nom` | string | |
| `secteur` | string | secteur / description |

Suppression en cascade → supprime les `exigences` rattachées (et leurs `actions`).

### Personne (annuaire) — `personnes` (v11)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"PERS-..."` | |
| `nom` | string | requis |
| `fonction` | string | rôle (RSSI, DPO, Responsable IT…) |
| `service` | string | équipe / département |
| `email` | string | |
| `telephone` | string | |
| `notes` | string | |

Annuaire réutilisé pour l'**autocomplétion** de tous les champs « Responsable »/« Propriétaire »/
« Auditeur » du logiciel (via le `<datalist id="personnes-list">` partagé, peuplé par
`UI.refreshPersonnesDatalist()` à chaque navigation). **Les entités continuent de stocker le NOM en
texte** (rétrocompatible, saisie libre toujours possible) : `personnes` n'est qu'une source de
suggestions. La **fiche personne** agrège ses « affectations » par **correspondance de nom** (module
`/personnel`, lecture seule sur actions, mesures, exigences, actifs, processus, MCO, documents, audits,
traitements). **Supprimer une personne** de l'annuaire **ne touche pas** les responsables déjà saisis
dans les fiches (ce sont des chaînes) — cela retire seulement la suggestion. `getPersonneNames()` fournit
les noms distincts triés.

### Exigence — `exigences`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"EX-..."` | |
| `client_id` | string \| null | `null` = exigence interne ; sinon rattachée à un donneur d'ordre |
| `code` | string | ex. `A.5.1`, `NIS2-21` |
| `intitule` | string | |
| `statut_conformite` | enum | `conforme` \| `partiellement conforme` \| `non conforme` \| `non applicable` |
| `responsable` | string | |
| `commentaire` | string | |

### Action (plan d'actions) — `actions`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"ACT-..."` | |
| `titre` | string | |
| `statut` | enum | `à faire` \| `en cours` \| `terminée` |
| `responsable` | string | |
| `echeance` | date (ISO) | |
| `priorite` | string | optionnel |
| `exigence_id` | string | une action est liée à **l'un** de : exigence, risque, évaluation, incident ou mesure |
| `risque_id` | string | |
| `evaluation_id` | string | lien vers une évaluation de référentiel (v3) |
| `incident_id` | string | lien vers un incident de sécurité (v4) |
| `mesure_id` | string \| null | lien vers une **Mesure de sécurité** pivot (optionnel, rétrocompatible). Plan d'action porté directement par la mesure → couvre toutes les exigences qu'elle porte. `getActionsByMesure(id)` ; `deleteMesure` **délie** les actions (`mesure_id → null`, conservées), comme il délie déjà les évaluations. |
| `commentaire` | string | optionnel — zone de texte libre de la fiche action (`js/modules/actions.js`). Sans contrainte de longueur ni de contenu. |

### Risque (inspiré EBIOS RM, méthode F×G×M) — `risques`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"RISK-..."` | |
| `nom` | string | scénario de risque |
| `f_frequence` | number | Fréquence / vraisemblance |
| `g_gravite` | number | Gravité |
| `m_maitrise` | number | coefficient de Maîtrise (≤ 1) |
| `score_brut` | number | `f × g` |
| `score_residuel` | number | `score_brut × m` |
| `niveau` | enum | `faible` \| `élevé` \| `critique` (dérivé du score résiduel) |
| `description` | string | |
| `exigences_liees` | string[] | ids d'`exigences` |

> Seuils dashboard : résiduel `< 3` non critique, `3–7.9` critique, `≥ 8` très critique.

### Actif — `actifs`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"ACTIF-..."` | |
| `nom` | string | |
| `type` | enum | `Matériel` \| `Logiciel` \| `Donnée` \| `Service` \| `Humain` |
| `criticite` | enum | `faible` \| `modérée` \| `élevée` \| `critique` |
| `responsable` | string | |
| `description` | string | |
| `risques_lies` | string[] | ids de `risques` |
| `dependances` | objet[] | **v9** — liens typés vers d'autres actifs : `{ to: <id d'actif>, type }`. Une arête A→B = « A a besoin de B » pour tous les `type` **sauf `backup`** (voir ci-dessous). |

**Types de dépendance** (`dependances[].type`, module Cartographie) :

| `type` | Libellé | Propage une panne ? |
|--------|---------|:---:|
| `dep` | Dépend de | oui |
| `hosted` | Hébergé sur | oui |
| `flux` | Alimenté par (flux de données) | oui |
| `backup` | Sauvegardé par | **non** (porte la restauration, pas la disponibilité) |

L'**analyse d'impact** (module `/cartographie`) calcule le **rayon d'impact** = fermeture transitive
inverse sur les liens propageants (`dep`/`hosted`/`flux`) + l'usage des processus (`processus.actifs_lies`).
Un actif dont **≥ 2 processus critiques** dépendent est signalé **SPOF** (point de défaillance unique).
`deleteActif(id)` **purge** les `dependances` des autres actifs pointant vers `id` (pas d'arête orpheline).

### Processus / BIA (ISO 22301) — `processus`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | string | préfixe `BIA-` sur les créations récentes ; **les enregistrements anciens n'ont pas de préfixe** et ne sont pas réécrits |
| `nom` | string | |
| `criticite` | string | `Faible` \| `Modérée` \| `Élevée` \| `Critique` — **capitalisées** (voir l'encadré ci-dessous) |
| `rto` | string | Recovery Time Objective, stocké tel qu'affiché (« 4 heures », « 0h (Immédiat - PRA) ») |
| `rpo` | string | Recovery Point Objective, même remarque |
| `responsable` | string | |
| `description` | string | optionnel — champ « Impacts (Interruption) » de la fiche BIA (`js/modules/bia.js`) : ce que coûte l'arrêt du processus (financier, légal, image). |
| `actifs_lies` | string[] | ids d'`actifs` |

> **⚠️ La criticité des processus n'est PAS écrite comme celle des actifs, et c'est à conserver.**
>
> | Entité | Valeurs stockées |
> |---|---|
> | `actifs.criticite` | `faible` · `modérée` · `élevée` · `critique` — **minuscules** |
> | `processus.criticite` | `Faible` · `Modérée` · `Élevée` · `Critique` — **capitalisées** |
>
> La dissymétrie est historique (`js/modules/actifs.js` contre `js/modules/bia.js`) et
> **délibérément conservée** : les comparaisons de l'application portent sur ces chaînes
> exactes, et le schéma serveur les reprend mot pour mot (`ck_actifs_criticite` en
> minuscules ; aucune contrainte sur `processus.criticite`, précisément pour ne pas faire
> échouer la reprise d'exports anciens). **Les « harmoniser » casserait à la fois
> l'affichage et le round-trip `grc-backup`.**

### Cellule de crise — `crise`
`{ id, role, nom, telephone, email, suppleant, notes }`

### Scénario PCA/PRA — `scenarios_pra`
`{ id, nom, description, etapes_pca[], etapes_pra[] }`
Étape (fiche réflexe, matrice RACI) : `{ titre, realisateur, responsable, consulte, informe, actifs, duree, statut }`

### Test PRA — `tests_pra`
`{ id, scenario_id, date, succes: "Oui"|"Non", type_test, bilan }`
- `scenario_id` → id d'un `scenarios_pra`. **Suppression en cascade** : supprimer un scénario
  supprime ses tests (`deleteScenarioPra`). Les tests dont le scénario n'existe plus (orphelins
  hérités d'anciennes suppressions) sont détectés via `getOrphanTests()` et nettoyables via
  `deleteOrphanTests()` (bandeau dédié dans la liste des tests).

### MCO (maintien en condition) — `mco_actions`
`{ id, titre, description, responsable,`
` frequence: "Ponctuelle"|"Hebdomadaire"|"Mensuelle"|"Trimestrielle"|"Semestrielle"|"Annuelle",`
` priorite: "Basse"|"Moyenne"|"Haute"|"Critique",`
` datePrevue, dateReelle, dateCloture,`
` statut: "À planifier"|"En cours"|"Réalisée"|"Annulée",`
` avancement: 0-100, commentaire }`
- `titre` = définition courte de l'action (libellé de la liste) ; `description` = détail.
- **« En retard »** : indicateur *dérivé* (non stocké) — `datePrevue` dépassée alors que le statut
  n'est ni `Réalisée` ni `Annulée`. Calculé par `PraMcoModule.isEnRetard(m)` (source unique,
  réutilisée par le tableau de bord). Passer au statut `Réalisée` force `avancement = 100` et
  complète `dateReelle`/`dateCloture` à la date du jour si vides.
- **Migration v9 → v10** (dans `normalize`, transparente et idempotente) : `etat:"OK"` → `statut:"Réalisée"`
  + `avancement:100` ; `etat:"KO"` → `statut:"En cours"` ; `date` → `dateReelle` ; `notes` → `commentaire` ;
  les anciennes clés `etat`/`date`/`notes` sont purgées après recopie.

### Prestataire / tiers — `prestataires`
`{ id, societe, type, phone, email, notes,`
` criticite?, acces?, supplyChain? }`
- Champs d'évaluation du **risque fournisseur** (optionnels, rétrocompatibles — pas de bump de schéma) :
  - `criticite` : `""|"faible"|"moyenne"|"forte"|"vitale"` (impact si défaillance).
  - `acces` : `""|"aucun"|"limite"|"etendu"` (accès au SI / aux données).
  - Risque inhérent = poids(criticité) × poids(accès) → Faible / Modéré / Élevé / Critique.
  - `supplyChain` : objet de booléens (exigences chaîne d'appro NIS2/DORA) — clés
    `clause, notif, audit, donnees, reversibilite, continuite`.

### Audit interne (ISO 27001 §9.2) — `audits`
`{ id, ref, statut: "Planifié"|"En cours"|"Réalisé", date, perimetre, auditeur, audite, synthese,`
` constats[], ref_id?, items[]? }`
- Constat (libre) : `{ type: "Point fort"|"PA"|"Mineure"|"Majeure", exigence, desc }`
- `ref_id` (optionnel) : id du référentiel sur lequel l'audit est bâti (ex. `anssi-hygiene`), `null` = audit libre.
- `items[]` (optionnel) : **grille de points de contrôle** générée depuis un modèle d'audit
  (`AuditModeles.buildGrid(ref_id)`, catalogue statique — voir §6). Chaque point est un **instantané**
  autoportant (le texte est figé au moment de la génération, gage d'intégrité de l'audit) :
  `{ code, domaine, intitule, aide, ctrl, preuve, type, constat }` où `type` ∈
  `""` (à évaluer) | `conforme` | `fort` | `pa` | `mineure` | `majeure` | `na`, `ctrl` = ce qu'il faut
  vérifier, `preuve` = preuves à demander, `constat` = preuve observée par l'auditeur.
- Taux de conformité = points `conforme`/`fort` ÷ points évalués applicables (`na` exclus).
- Champs optionnels **rétrocompatibles** (pas d'évolution de schéma) ; le tableau de bord et la
  Synthèse comptent les NC de la grille (`mineure`/`majeure`) en plus des constats libres.

### Revue de direction — `revues`
`{ id, date, participants, inputs, outputs }`

### Évaluation de référentiel — `evaluations`
Auto-évaluation d'**une exigence d'un référentiel** (voir §5). Clé métier unique
`(ref_id, code)` ; l'enregistrement est créé à la première évaluation (une exigence
sans enregistrement = « non évaluée »).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"EVAL-..."` | |
| `ref_id` | string | id du référentiel (ex. `anssi-hygiene`) |
| `code` | string | code de l'exigence dans le référentiel (ex. `22`) |
| `statut` | enum | `conforme` \| `partiellement conforme` \| `non conforme` \| `non applicable` \| `""` (non évalué) — questionnaires (`scoring: "conformite"`, ex. AirCyber) : mêmes valeurs, affichées Oui / Non / N-A, sans « partiellement » |
| `maturite` | number | 0-5 (échelle type CMMI) — non utilisé pour les questionnaires (préservé mais ignoré) |
| `commentaire` | string | |
| `preuves` | string | références (l'app ne stocke pas les fichiers) |
| `mesure_ids` | string[] | **v12** — mesures de sécurité couvrant cette exigence (**plusieurs** possibles). Ancien champ unique `mesure_id` migré en tableau. `addMesureToEvaluation`/`removeMesureFromEvaluation` ; `getEvaluationsByMesure` filtre sur l'appartenance au tableau. |
| `updatedAt` | number | |

Les **actions correctives** pointent vers l'évaluation via `action.evaluation_id`.
`deleteEvaluation` supprime en cascade les actions liées ; `deleteEvaluationsByRef`
réinitialise un référentiel entier.

### Mesure de sécurité (pivot) — `mesures`
Contrôle mis en œuvre par l'organisation, **couvrant n-n plusieurs exigences** de
référentiels (le lien est porté par `evaluations[].mesure_ids[]` — et une exigence peut
être couverte par **plusieurs** mesures, v12). Évaluer la mesure puis **propager** recalcule
ses évaluations liées **« au plus défavorable »** de toutes leurs mesures (zéro double saisie).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"MESURE-..."` | |
| `nom` | string | |
| `description` | string | |
| `statut` | enum | même enum de conformité |
| `maturite` | number | 0-5 |
| `responsable` | string | |
| `updatedAt` | number | |

`deleteMesure` délie les évaluations (retire l'id de `mesure_ids[]`). `propagateMesure(id)`
recalcule chaque évaluation couverte **au plus défavorable** de TOUTES ses mesures
(`aggregateFromMesures` : statut le plus faible — conforme seulement si toutes le sont —,
maturité la plus basse ; « non applicable » neutre ; « non évalué » ignoré).

### Incident de sécurité — `incidents` (v4)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"INC-..."` | |
| `titre` | string | |
| `type` | enum | hameçonnage, rançongiciel, intrusion, fuite de données, DoS, perte/vol, erreur, malveillance… |
| `gravite` | enum | `faible` \| `moyenne` \| `élevée` \| `critique` |
| `statut` | enum | `nouveau` \| `en cours` \| `résolu` \| `clôturé` |
| `date_detection` / `date_resolution` | date ISO | |
| `description`, `actions_immediates`, `cause_racine` | string | |
| `actifs_touches` | string[] | ids d'`actifs` |
| `risque_id` | string \| null | lien vers un `risque` EBIOS (le risque qui se matérialise) |
| `declaration_anssi` / `declaration_cnil` | enum | `non requise` \| `à déclarer` \| `déclarée` (aide délais NIS2 24 h/72 h, RGPD 72 h) |

Actions correctives via `action.incident_id`. `deleteIncident` supprime en cascade ses
actions ; `deleteRisque`/`deleteActif` nettoient les références (`risque_id`, `actifs_touches`).

### Document / politique — `documents` (v5)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"DOC-..."` | |
| `titre` | string | |
| `type` | enum | PSSI, charte, procédure, politique de sauvegarde, PCA/PRA… |
| `version` | string | ⚠️ **Dès qu'une pièce jointe de la fiche est marquée « en vigueur », c'est ELLE qui donne ce numéro** (migration `018`, action D1) : la route `POST /api/pieces/documents/<id>/<piece>/en-vigueur` recopie `pieces_jointes.version_piece` ici, dans la même transaction, et **échoue en entier** si elle ne peut pas écrire la fiche. La saisie libre ne subsiste que tant qu'aucun fichier n'est détenu ici — c'est ce qui empêchait le champ d'annoncer « 2.1 » au-dessus du PDF de la 1.4. Correspond à `documents.version_document` (la colonne `version` de la table est le compteur de verrouillage optimiste, §1.4) |
| `proprietaire` | string | |
| `statut` | enum | `brouillon` \| `en validation` \| `en vigueur` \| `à réviser` \| `obsolète`. ⚠️ **`en validation` (migration `019`, action D5)** est l'état pendant lequel le circuit d'approbation du lot L8 tourne. Depuis cet état — **et dès qu'un circuit existe, quel que soit le statut**, sans quoi il suffirait de repasser par `brouillon` — passer à `en vigueur` exige une étape `publication` **approuvée** dans le dernier tour. La base refuse en **`GRC06`**, et le refus est journalisé avec sa route |
| `date_revue` | date ISO | prochaine revue (pilote les alertes) |
| `emplacement` | string | **DOCUMENT RESTÉ AILLEURS** — chemin réseau, GED, intranet. C'est une **référence** que l'application ne lit pas, ne vérifie pas et ne délivre pas ; elle ne saura jamais si ce qui est au bout a changé. ⚠️ **À ne pas confondre avec les pièces jointes de la fiche**, que l'application détient, analyse, empreinte et délivre depuis le lot L6. La note « non stocké par l'app » qui figurait ici était vraie du produit navigateur et **fausse depuis L6** (action D4) |
| `referentiels` | string[] | ids de référentiels couverts |
| `confidentialite` | enum | **NIVEAU DE DIFFUSION** (migration `027`) : `public` \| `interne` \| `confidentiel` \| `restreint`. ⚠️ **Obligatoire, défaut `interne`** — et le défaut n'est pas `public` à dessein : un document dont personne n'a tranché la diffusion ne doit pas être réputé diffusable. C'est le champ qu'un export antérieur à `027` n'a pas, et que la reprise remplit donc par le défaut. « Non classé » est précisément le trou que l'ISO 27001 A.5.12 et le RGPD demandent de fermer |
| `donnees_personnelles` | bool | **le document CONTIENT des données personnelles** — pas « il en parle » (migration `027`). Une procédure qui décrit un traitement n'en contient aucune ; un compte rendu qui nomme des gens, si. Sert à répondre en minutes à une demande d'exercice de droits, et à signaler la combinaison « public + données personnelles » — que la base **n'interdit pas** (un document public nomme légitimement son DPO, article 13) et que l'écran RGPD met en évidence |
| `traitement_id` | `"TRT-..."` \| null | **rattachement au registre de l'article 30** (migration `027`). Deux registres qui cohabitaient sans se connaître. ⚠️ **La règle n'est PAS symétrique** (migration `030`, constat **Q-294**) : un document **local** peut relever d'un traitement **de portée Groupe** — c'est le cas le plus fréquent, et il est sans danger, un traitement de Groupe n'étant effaçable que par l'administration Groupe ; un document de **portée Groupe**, lui, ne peut relever que d'un traitement de portée Groupe (constat N-10 : le socle commun ne doit pas désigner une ligne qu'une filiale peut effacer). « Même filiale **OU** cible de portée Groupe » n'étant pas une clé étrangère mais une **disjonction**, la filiale visée est matérialisée dans `traitement_filiale_id` — **posée par un déclencheur**, jamais crue sur parole : la croire serait un oracle d'existence inter-filiales — et deux clés composites plus deux `check` font le reste. La suppression d'un traitement rattaché est **refusée** (`restrict`) : la couche applicative délie d'abord, à la filiale près |
| `etiquettes` | string[] | **mots de classement libres** (migration `027`), 48 signes au plus, ni virgule ni point-virgule. Table `document_etiquettes`, **jamais une colonne tableau** : ce schéma est strictement relationnel. Normalisées **dans la base** (espaces ramenés à un, extrémités rognées) ; la casse est conservée à l'affichage mais l'unicité par document y est insensible — « RGPD » et « rgpd » sont la même étiquette |
| `notes` | string | plan / sommaire (canevas disponibles) |

> **Les pièces jointes d'une fiche document** (lot L6, complété par L16). Elles ne font pas
> partie de l'objet `data` — l'application les détient à part, dans `pieces_jointes` — mais
> elles portent trois propriétés que la fiche reflète :
>
> | Colonne | Rôle |
> |---|---|
> | `en_vigueur` | LA pièce qui fait foi. Au plus une par porteur **et par filiale** ; c'est elle qui donne `documents.version_document` (migration `018`) |
> | `version_piece` | le numéro de version **du fichier**, annoncé au dépôt |
> | `sha256` · `etat_integrite` · `derniere_verification` | l'empreinte calculée sur le fichier écrit, et le verdict du dernier rapprochement — `non_verifiee`, `conforme`, `ecart`, `fichier_absent` (migration `020`) |
>
> ⚠️ **Depuis la migration `038` (action 19.4), une pièce sert PLUSIEURS porteurs.** Le
> couple `(entite_type, entite_id)` de `pieces_jointes` reste l'**adresse de délivrance** —
> celle que porte l'URL, celle que vise l'unicité « une seule pièce en vigueur par
> porteur », celle que lit le relais de version du document. L'ensemble des porteurs
> servis vit dans **`piece_rattachements`**, et une clé étrangère différée
> (`fk_pieces_jointes_adresse`) impose que l'adresse soit **toujours l'un d'eux**.
>
> Trois conséquences, et la dernière est celle qui se voit à l'écran :
>
> · une procédure déposée **une fois** prouve cinq contrôles — une ligne, un fichier, une
>   empreinte, un quota, et **une seule chose à mettre à jour** le jour où elle change ;
> · supprimer un porteur ne libère le fichier **qu'au dernier** : tant qu'un rattachement
>   subsiste, la pièce **change d'adresse** (et perd son « en vigueur », qui est une
>   propriété du couple pièce-porteur, pas de la pièce) ;
> · `DELETE /api/pieces/<entite>/<id>/<piece>` **détache** au lieu de détruire quand la
>   preuve sert ailleurs. L'écran le dit avant le clic — la liste sert `autres_porteurs`
>   pour cela — et le journal distingue « détachement » de « suppression ».

### Traitement RGPD — `traitements` (v6, article 30)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"TRT-..."` | |
| `nom`, `finalite` | string | |
| `base_legale` | enum | consentement, contrat, obligation légale, intérêt légitime… |
| `responsable` | string | |
| `personnes_concernees`, `categories_donnees` | string | |
| `donnees_sensibles` | bool | catégories particulières (art. 9) |
| `destinataires`, `transfert_hors_ue`, `duree_conservation` | string | |
| `notes` | string | notes libres du responsable de traitement. Collectée par le module depuis l'origine, elle **manquait à ce tableau et au schéma serveur** : le serveur la retirait du corps avant d'enregistrer le reste, et un export existant la portant l'aurait perdue en silence à la reprise — sur le registre de l'article 30. Colonne ajoutée à `traitements` (porte S2, constat M-8) |
| `mesures_ids` | string[] | **réutilise le pivot** `mesures` (`deleteMesure` délie) |

> ⚠️ **`traitements` est une table MIXTE depuis la migration `027`** (`filiale_id`
> nullable, `null` = portée Groupe), comme `documents`. Le registre de chaque entité
> juridique reste le cas ordinaire — c'est ce que l'article 30 demande — mais le GROUPE
> opère aussi des traitements pour toutes ses filiales : l'annuaire commun, le journal
> d'audit de cet outil. Sans ce versant, un document de portée Groupe — la PSSI, la
> charte informatique — n'aurait pu se rattacher à **aucun** traitement, la clé de portée
> exigeant alors les deux extrémités du même côté de la frontière. `traitement_mesures` a
> suivi son parent, pour que l'article 32 reste consignable sur un traitement du Groupe.
>
> ⚠️ **Cette exigence de symétrie est levée depuis la migration `030`** (constat Q-294) —
> dans le seul sens qui est sans danger : *document local → traitement de Groupe*. Le sens
> inverse reste fermé.

### Correspondance inter-référentiels — `mappings` (v7, surcouche)
Le **catalogue par défaut** des correspondances (équivalences entre exigences de
plusieurs référentiels) est **statique** (`js/data/mappings.js`, exposé par
`MappingCatalog`) et **non stocké**. Le tableau `mappings` ne contient que la
**surcouche utilisateur**, fusionnée à l'affichage par `MappingModule` :

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"MAP-..."` \| id du catalogue | un id du catalogue (`map-…`) → **override** du groupe correspondant ; un id `MAP-…` → groupe **personnalisé** |
| `theme` | string | intitulé du thème de sécurité |
| `aide` | string | note pédagogique |
| `refs` | objet | `{ <ref_id>: [codes...] }` — exigences équivalentes par référentiel |
| `_deleted` | bool | si `true` sur un id du catalogue : groupe **masqué** (tombstone) |

Règles de fusion (dans le module) : un groupe du catalogue est remplacé si un
enregistrement de même `id` existe (override), masqué si `_deleted`, sinon affiché
tel quel ; les enregistrements dont l'`id` n'est pas dans le catalogue sont des
groupes personnalisés. `resetMappings()` vide la surcouche (retour au catalogue).
La **propagation** relie toutes les exigences d'un groupe à une même `mesure`
(ajout dans `evaluations[].mesure_ids[]` via `addMesureToEvaluation`, sans écraser les
mesures déjà liées) ou leur applique un même statut — d'où l'accélération de la couverture
croisée et de la SoA.

### Point d'historique — `history` (v8, courbes de tendance)
Instantané **global** des indicateurs clés, **un enregistrement par jour** (clé
`date`). Alimente les courbes de tendance du tableau de bord. Le point du jour est
actualisé tant que la journée court ; les points passés sont figés. Conservation
bornée (`HISTORY_KEEP = 180` jours, les plus récents).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"HIST-..."` | |
| `ts` | number | horodatage de la dernière écriture du point |
| `date` | string | `"YYYY-MM-DD"` (clé métier, un point par jour) |
| `metrics` | objet | `{ conformite (%), maturite (0-5), expo, risques_crit, actions_retard, avancement (%), incidents_ouverts }` |

Écriture via `recordDailySnapshot(metrics)` (upsert du jour, **sans réécriture si
inchangé**), lecture triée via `getHistory()`, remise à zéro via `clearHistory()`.
Les indicateurs sont **toujours calculés sur le périmètre global** (indépendants du
sélecteur de donneur d'ordre) pour une série stable. Effacer l'historique n'affecte
pas les données GRC.

---

## 3. Graphe des relations

```
Client ──1:N──> Exigence ──1:N──> Action
                   ▲                 │ (exigence_id OU risque_id)
                   │ N:M             ▼
                Risque <──1:N── Action
                   ▲ N:M (exigences_liees)
                   │
Actif ──N:M──> Risque (risques_lies)
Actif ──N:M──> Actif (dependances[] : liens typés, v9 — cartographie)

Processus(BIA) ──N:M──> Actif (actifs_lies)
ScenarioPra ──1:N──> TestPra (scenario_id)
Audit ──1:N──> Constat        Revue (autonome)
Crise, Prestataire, McoAction : autonomes
```

Cascades implémentées : `deleteClient`→exigences→actions ; `deleteExigence`→délie
risques + supprime actions liées ; `deleteRisque`→délie actifs + supprime actions liées ;
`deleteActif`→délie incidents (`actifs_touches`) + **purge les `dependances` pointant vers l'actif** (v9) ;
`deleteScenarioPra`→supprime ses tests (`scenario_id`). Les orphelins hérités d'anciennes
suppressions se détectent et se nettoient (`getOrphanTests` / `deleteOrphanTests`) ; côté
serveur, la clé étrangère `tests_pra → scenarios_pra` est en `cascade` et le cas ne se
produit plus.
> ⚠️ **Côté serveur, ces règles ne se transposent pas toutes telles quelles** : les
> suppressions qui touchent `mesure_catalogue` (et `utilisateurs`) sont en `restrict`, pas
> en `set null` — elles sont **refusées**, et le contrôle du socle Groupe s'**archive** au
> lieu de disparaître. Voir l'encadré en tête de document et
> `backend/db/CONVENTIONS.md` §17.6 et §18.2.

---

## 4. Graphe des relations — Référentiels

```
Référentiel (statique) ──1:N──> Exigence de référentiel (code)
                                     │ 1:1 (clé ref_id+code)
                                     ▼
                                 Évaluation ──N:N──> Mesure de sécurité (pivot)
                                     │ 1:N               │ (propage au plus défavorable)
                                     ▼                   ▼
                                  Action ............ (couvre N évaluations, multi-référentiels)
```

Cascades : `deleteEvaluation` → supprime ses actions ; `deleteEvaluationsByRef` →
réinitialise un référentiel ; `deleteMesure` → délie ses évaluations (retire l'id de `mesure_ids[]`).

---

## 5. Référentiels (catalogue statique)

Les référentiels sont un **catalogue statique** chargé au démarrage (registre
`Referentiels`, `js/data/referentiels.js`), **non stocké** dans `data`. Un fichier
de données par référentiel (`js/data/ref_anssi.js`, …), au schéma commun :

```jsonc
{
  "id": "anssi-hygiene", "nom": "...", "editeur": "ANSSI", "version": "42 mesures",
  "description": "...", "aide": "...",
  "domaines": [
    { "id": "...", "nom": "...", "court": "...", "aide": "...",
      "exigences": [ { "code": "1", "titre": "...", "aide": "..." } ] }
  ]
}
```

> ⚠️ **Ne jamais embarquer le texte intégral des normes** (ISO payant/protégé).
> Reformulations originales courtes + identifiant de clause + titre court uniquement.
> ANSSI (guide public) inclus en reformulations maison.

**Terminologie** : au sein d'un référentiel, un item est une « **exigence de
référentiel** » (`{code, titre, aide}`). À ne pas confondre avec l'entité utilisateur
« **Mesure de sécurité** » (`mesures`), le pivot qui **couvre** ces exigences.

Une exigence peut porter des **attributs optionnels** (utilisés par AirCyber) : `niveau`
(`bronze`/`silver`/`gold`), `priorite` (`high`/`medium`/`low`), `cl` (`CL0`…`CL6`). Le
référentiel peut aussi porter `clLabels` (libellés des domaines CL). Les référentiels qui
n'en ont pas n'affichent ni badges, ni filtres, ni panneau « préparation au label ».

Un référentiel peut enfin déclarer **`scoring: "conformite"`** (AirCyber) : questionnaire à
réponses **Oui / Non / N-A** (mêmes valeurs de données `conforme` / `non conforme` /
`non applicable`), **sans échelle de maturité CMMI**. Score = « Oui » ÷ questions applicables
(N/A exclues ; non répondu = « Non ») ; le radar affiche ce taux par domaine CL, filtrable par
niveau de label, et le champ `maturite` des évaluations n'est ni saisi ni interprété (il est
préservé s'il existe, mais exclu des moyennes CMMI du tableau de bord).

Livré : référentiel **ANSSI** + auto-évaluation + radar (it. 4) ; **pivot Mesure de
sécurité** `/mesures` + propagation (it. 5) ; ISO 27001 (Annexe A **et système de management chap. 4-10**) / NIS2 / DORA / **AirCyber réel**
+ **import CSV** des réponses + **niveaux Bronze/Argent/Or, priorité, CL0–CL6** (it. 6, 13, 14) ;
couverture croisée + génération SoA (it. 7).

---

## 6. Modèles d'audit (catalogue statique)

Surcouche **statique** (non stockée dans `data`) qui transforme un référentiel en **grille d'audit
prête à l'emploi**. Registre `AuditModeles` (`js/data/audit_modeles.js`) + un fichier de contenu par
référentiel qui s'auto-enregistre (`js/data/audit_anssi.js`, …), sur le modèle du registre
`Referentiels`.

```jsonc
// audit_<ref>.js
AuditModeles.register("<ref_id>", {
  "<code d'exigence>": [
    { "ctrl": "point de contrôle / vérification à mener", "preuve": "preuves à demander" }
  ]
});
```

- `AuditModeles.buildGrid(ref_id)` **croise** ces points de contrôle avec le registre `Referentiels`
  (domaine + intitulé + aide de chaque exigence) et renvoie la grille à plat
  `{ code, domaine, intitule, aide, ctrl, preuve, type:"", constat:"" }`, ordonnée comme le référentiel.
  Un point peut **surcharger** son `code` / `intitule` (sous-exigence fine, ex. `4.1a`) — c'est ainsi que
  l'audit ISO SMSI descend au « shall » alors que le référentiel reste au niveau des 30 clauses.
- Le module `/audits` **copie** cette grille dans `audit.items[]` (instantané autoportant, cf. §2) et
  y ajoute les constats de l'auditeur. Le catalogue peut donc évoluer sans altérer les audits passés.
- `available()` liste les modèles disponibles (pour le sélecteur) ; `countPoints(id)` donne le volume
  de contrôles ; `nameOf(id)` le libellé lisible.
- **Modèles composites** : `registerComposite(modelId, { nom, sources: [refId...] })` crée un modèle
  « virtuel » dont `buildGrid` **concatène** les grilles des sources — pour auditer en une seule passe
  des exigences réparties sur plusieurs référentiels. Ex. `iso27001-complet` = `iso27001-smsi` +
  `iso-27002-2022`. `available()` place les composites après les modèles simples ; `has`/`isComposite`
  /`countPoints`/`nameOf` les prennent en charge.
- **Modèles dérivés** : `registerDerived(refId, { ctrl?(exigence)->string, preuve? })` génère un point
  de contrôle **par exigence** du référentiel — pour les questionnaires déjà détaillés (AirCyber, 234
  questions) où réécrire les points à la main n'apporte rien. La question devient le point de contrôle
  (consigne d'audit + invite de preuve). `has`/`countPoints`/`buildGrid` les prennent en charge.
- ⚠️ **Reformulations maison uniquement** (même règle que les référentiels : ne jamais embarquer le
  texte intégral des normes).

Livré (7 modèles au sélecteur) :
- **ANSSI** — Hygiène (42 mesures → 46 points de contrôle).
- **ISO/IEC 27001:2022 — Système de management** (`iso27001-smsi`, nouveau référentiel de 30 clauses
  chap. 4-10 ; l'audit éclate chaque clause en **sous-exigences fines** `4.1a`… `6.1.2j`… au niveau de
  chaque « shall » et sous-alinéa → **143 points**).
- **ISO/IEC 27001:2022 — Annexe A** (`iso-27002-2022`, 93 mesures → 93 points).
- **Composite « ISO 27001 complet »** (`iso27001-complet`) = SMSI + Annexe A → **236 points** (= les
  236 exigences de la norme, à la maille des guides de référence).
- **NIS2** (`nis2-art21`, 10 mesures art. 21 + gouvernance art. 20 → 11 points).
- **DORA** (`dora`, 5 piliers → 15 points).
- **AirCyber** (`aircyber`, modèle **dérivé** des 234 questions → 234 points).
