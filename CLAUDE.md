# CLAUDE.md — Contexte projet Cyber GRC

> Fichier de mémoire projet, lu automatiquement au démarrage d'une session Claude Code.
> But : permettre de **reprendre le travail sans perte de contexte** dans un nouveau chat.
> Compléments : **`docs/PLAN_SERVEUR.md` (chantier en cours — fait autorité)**,
> `docs/PLAN.md` (historique frontend), `docs/AUDIT.md`, `docs/DATA_MODEL.md`, `CHANGELOG.md`.

> ## ⚠️ CHANGEMENT DE PARADIGME — LIRE EN PREMIER
>
> Le projet est **passé d'une application 100 % navigateur à une application
> client/serveur multi-filiales**, déployée sur site chez un groupe industriel
> (20+ filiales, acquisitions régulières, sites en France et à l'étranger).
>
> **Le plan de référence est [`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md).** Il est
> validé point par point avec l'utilisateur et le client final. Ne pas le re-débattre :
> l'appliquer. Les sections 2 à 7 ci-dessous décrivent l'**application frontend
> existante**, qui reste la base de code à faire évoluer — pas la cible d'architecture.
>
> **Reprise de travail — dans cet ordre, et l'ordre compte** :
>
> 1. **[`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md)** — le *quoi* (cadrage clos, fait autorité) ;
> 2. **[`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md)** — le *comment* : vagues, périmètre
>    exclusif de chaque agent, grille de sécurité, **journal des portes** (§7, la seule source
>    des verdicts) et **registre des constats ouverts** (§7 également) ;
> 3. **[`backend/README.md`](backend/README.md) §8** — l'état réel des lots et les chiffres
>    rejoués ;
> 4. **[`backend/db/CONVENTIONS.md`](backend/db/CONVENTIONS.md)** pour toute écriture en base.
>
> **Et, pour la suite du produit — ce qui vient APRÈS la mise en service, jamais avant :**
> **[`docs/PLAN_PRODUIT.md`](docs/PLAN_PRODUIT.md)** (le *quoi* de la suite : lots **L17 à
> L28**, ordonnancement, non-objectifs nommés un par un, **et les trois arbitrages TRANCHÉS
> le 08/09/2026** — jeu de découverte autorisé, IA locale par défaut avec externe encadré,
> portail fournisseur validé) et
> **[`docs/COMPARATIF_MARCHE.md`](docs/COMPARATIF_MARCHE.md)** (les 86 fonctionnalités de
> l'état de l'art, mesurées dans le dépôt — **35 ✅ · 17 🟡 · 34 ❌ au 08/09/2026**).
> ⚠️ **Le §0 bis du `PLAN_PRODUIT.md` fait autorité sur l'ordonnancement** : aucun lot L17+
> ne se joue avant que S7 et S8 soient franchies. Seul **L18 (installation)** y échappe, et
> uniquement parce qu'il ne touche ni `src/`, ni le schéma.
>
> ---
>
> ## ▶ L'ÉTAT DU CHANTIER AU 08/09/2026
>
> **Les lots L0 à L14 sont CONSTRUITS. Ne pas les refaire.** Le lot **L15 — durcissement
> final — est EN COURS** : c'est la vague 8, et c'est là que se trouve le travail.
>
> ⚠️ **Construit n'est pas validé, et la nuance est le cœur de ce chantier.**
>
> | Porte | Vague | Passages | Verdict |
> |---|---|---|---|
> | **S1** | V1 — L1 | 6 | ✅ franchie au 5ᵉ, confirmée au 6ᵉ |
> | **S2** | V2 — L2 | 9 | ❌ refusée (franchie au 4ᵉ, refusée ensuite ; les 8ᵉ et 9ᵉ sans bloquant) |
> | **S3** | V3 — L3 | 1 | ❌ refusée — 0 fuite entre filiales, 2 bloquants corrigés le jour même |
> | **S4** | V3 · L5 | 1 | ❌ refusée — 10 constats, dont un « fuite de données » |
> | **S5** | V4 — L4, L6 | 1 | ❌ refusée — 13 constats |
> | **S6** | V6 — L10, L12, L13 | 1 | ❌ refusée — 12 constats |
> | **S7** | V7 — L11, L14 | **1** | ❌ **refusée le 09/09/2026 — 27 constats, 7 bloquants, 0 fuite** |
> | **S8** | V8 — L15 | **9** | ❌ **refusée le 11/09/2026 au soir — 0 bloquant, 12 majeurs, 11 mineurs, 0 fuite ; 2 contrôles sur 18 en échec (S12, S16).** ✅ **Les 23 constats traités le soir même** (migration `031`) — **10ᵉ passage dû** |
>
> **Le 6ᵉ passage de S8 est le meilleur du chantier** — 0 bloquant, 4 majeurs, 8 mineurs,
> **0 fuite entre filiales**, banc **1 747 essais, 1 747 passés** — mais *refusé reste
> refusé*. L'arbitrage du `docs/PLAN_EXECUTION.md` §0 bis fait qu'une porte refusée
> **n'arrête plus la vague : elle trie** en trois classes.
>
> ---
>
> ## ▶▶ REPRENDRE ICI — l'état au 08/09/2026 au soir
>
> ## ▶▶▶ CE QUI A ÉTÉ FAIT LE 11/09/2026 AU SOIR, ET QUI EST NEUF
>
> **Les dix-neuf constats du 8ᵉ passage de la porte S8 sont TRAITÉS** — Q-309 excepté, clos
> par arbitrage (il **confirme** Q-286 : le limiteur de rythme se fait en une fois pour
> toutes les routes coûteuses, jamais route par route). Trois migrations, **`028` à `030`**.
>
> ⚠️ **La leçon du passage n'était pas dans le produit, elle était dans le DISPOSITIF** —
> *sur 41 mutations, 14 ne mordaient pas, et treize visaient des gardes posés dans les trois
> jours précédents.* Elle est désormais une règle : **`backend/db/CONVENTIONS.md` §39**.
>
> 1. **🛑 Q-301 — le journal inscrivait de fausses accusations, indélébiles trois ans.**
>    `GET /api/rafraichir` comptait l'**inventaire de la filiale** et non ce qui sort : une
>    SPA ouverte **sans un geste** écrivait « Extraction du jeu de données (30 lignes
>    rendues) » à côté de `collections: 0`, ≈ 3 750 fois par jour et par onglet. Une
>    variable. ⚠️ **Et l'essai qui prétendait le couvrir ne pouvait pas le voir** : il semait
>    trente lignes fraîches, si bien que l'inventaire et le delta valaient tous deux trente.
>    C'est **un sondage AU REPOS qui n'écrit RIEN** qui mord.
> 2. **Un garde-fou ÉPROUVE.** `f_contrainte_accepte()` **évalue le prédicat réel** d'une
>    contrainte sur des lignes témoins ; `f_verifier_contraintes_eprouvees()` en soumet
>    dix-neuf. La mutation qui faisait tomber cinq gardes — `… or true` en gardant le nom et
>    les quatre littéraux — est vue. ⚠️ Les gardes textuels **restent** : ils nomment *quel*
>    niveau a disparu, là où l'évaluation dit seulement « cette ligne passe ».
> 3. **Le balayage part du CATALOGUE, jamais de la liste.** Trois gardes neufs le font :
>    `f_verifier_registres_techniques()` (toute table sans `filiale_id` est **rangée**),
>    `f_verifier_domaine_identifiants()`, `f_verifier_domaines_textuels()`. Et le registre
>    RGPD est **renversé** : toute colonne textuelle est candidate, **58 → 197 décisions**.
> 4. **Q-294 — dix-neuf filiales ne pouvaient rattacher aucune procédure au traitement que
>    le Groupe opère pour elles.** C'est l'**arbitrage** qui a été corrigé, pas l'écran : le
>    sens *local → Groupe* est ouvert, le sens inverse reste fermé (constat N-10).
> 5. **Q-303 — le produit affirmait, SUR LE CLOISONNEMENT, qu'un document qu'on venait de
>    créer « appartient à une autre filiale ».** ⚠️ **Le correctif évident ne suffisait
>    pas** : `js/core/sync.js` **annonce** désormais le recalage d'identifiant, et l'encart
>    d'approbation s'y rebranche. *Le défaut ne vivait dans aucun fichier.*
> 6. **⚠️ DEUX CONSTATS TROUVÉS EN TRAVAILLANT, ET LES DEUX SONT « ON A CORRIGÉ L'INSTANCE,
>    PAS LA CLASSE »** : **Q-310** — `risque_catalogue.id` et `filiale_id` étaient en `text`
>    nu et acceptaient la chaîne vide, c'est **mot pour mot Q-194** sur la table que la même
>    migration `012` avait créée ; **Q-311** — le garde du §29.5 examinait **une ligne à la
>    fois**, et le produit interpolait sur la ligne suivante, dans une ternaire.
> 7. **Le banc rattrape ce qu'il ne regardait pas** : les sept `BORNES` (Q-304),
>    l'échappement d'une étiquette **décidé** par l'essai (Q-305), le consommateur
>    préexistant du champ à puces (Q-306). ⚠️ **Un essai doit ROUGIR, jamais se figer** :
>    la première rédaction de l'essai des bornes fabriquait `borne + 1` éléments et, contre
>    la mutation `1000 → 100 000 000`, **s'est figée**. Plafond de matière posé — leçon Q-251.
>
> ---
>
> ## ▶▶▶▶ ET LE 9ᵉ PASSAGE A ÉTÉ JOUÉ LE MÊME SOIR — REFUSÉ, PUIS TRAITÉ
>
> **0 bloquant, 12 majeurs, 11 mineurs, 0 fuite entre filiales.** Constats **Q-312 → Q-334**.
> Un seul contrôle en échec de chaque côté : **S16** (périmètre A) et **S12** (périmètre B).
>
> ⚠️ **LE MOTIF NE CHANGE PAS, ET C'EST LA QUATRIÈME PORTE DE SUITE : les deux constats qui
> portent le refus visent les gardes écrits pour fermer le passage d'avant.**
>
> - **Q-312** — `f_domaine_accepte()`, livrée le matin même et **inscrite en règle au
>   `CONVENTIONS.md` §39.1**, n'est appelée **par personne**. Les domaines `id_metier` et
>   `type_entite` se vidaient par « … or true » sous **0 anomalie**, et `insert into risques
>   (id) values ('')` passait — *Q-310, donc Q-194, rouverts par la migration écrite le même
>   jour pour les fermer*.
> - **Q-313** — les cinq pièces de la migration `030` se retiraient **une par une** sous 0
>   anomalie : **N-10 rouvert**, **lien inter-filiales**. Cause :
>   `f_verifier_references_portee()`, renforcé la veille *pour cette classe précise*,
>   reconnaissait une colonne **NOMMÉE** `filiale_id` ; la `030` a nommé la sienne
>   `traitement_filiale_id`. *Reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT* —
>   la règle du §39, retournée contre elle-même.
>
> ✅ **Les vingt-trois constats sont traités** — migration `031`, **cinq garde-fous neufs**
> (35 au total), et chaque correctif **mordu par la mutation qui l'avait révélé**. Les règles
> qui en sortent vivent au `CONVENTIONS.md` **§39.6 à §39.9** :
>
> 1. **reconnaître par ce qui est RÉFÉRENCÉ, apparier par ce qui est LOCAL** — les deux
>    moitiés sont nécessaires, et chacune a coûté un passage de porte ;
> 2. **un garde de CLASSE ne voit pas la disparition d'une PAIRE** : une barrière nommée se
>    garde aussi nommément ;
> 3. **un garde-fou n'exécute pas ce qu'il inspecte** — `stable` ne bloque que l'écriture
>    DIRECTE, et `pg_depend` ne suit pas les appels d'un corps PL/pgSQL ;
> 4. **le balayage du registre RGPD franchit la frontière du texte** — 206 décisions.
>
> ⚠️ **Trois choses à retenir de ce passage, au-delà des constats :**
>
> - **`GRC07` n'arrivait nulle part** (Q-325) : le refus soigné de la `030` devenait un
>   **500 avec pile d'appel**. *Il ÉTAIT éprouvé — en SQL direct, jamais par la route. L'essai
>   prouvait que le déclencheur se déclenche ; personne ne mesurait ce que l'utilisateur
>   reçoit.*
> - **Le plafond de matière avait été posé à un endroit et oublié à l'autre** (Q-327), dans
>   le fichier écrit la veille pour le poser : contre la mutation, le banc ne rendait jamais
>   la main.
> - **A-4 ne s'est PAS reproduit comme le rapport l'annonçait** (Q-315) — `stable` bloque
>   l'écriture directe, et c'est un appel de profondeur un qui passe. *Six constats ont été
>   revérifiés à la main avant d'être consignés ; celui-là a changé de mécanisme en route.*
>
> ✅ **Et ce qui tient** : le contrôle **S7 cesse d'être en échec pour la première fois en
> quatre portes** — Q-301 et Q-302 mesurés fermés dans le journal de la recette, et les
> **quatorze routes `GET`** balayées sous un compte sans droit d'export sans qu'aucune ne
> rende le jeu sans trace. Cloisonnement **110/110**, **34 sondes hostiles** sans une percée,
> **0 fuite entre filiales**, et le parcours complet **ne détruit rien**.
>
> **Le prochain geste : le 10ᵉ passage de la porte S8.**
>
> ---
>
> **Mesuré à la révision `99ea754`** : banc **1 794 essais, 1 794 passés** ;
> `verifier-types` propre ; `npm audit --omit=dev` → 0 vulnérabilité ;
> `verifier_cloisonnement.sql` **sous `grc_app`** → **107/107** ; `f_verifier_schema()`
> → 0 anomalie (17 garde-fous, 20 migrations, 50 tables) ; publication → **81 fichiers
> identiques au dépôt** ; `install.sh --diagnostic` → **12 conformes, 1 réserve, 0
> bloquant**.
>
> **Ce qui a changé le 08/09 au soir, et qui est neuf :**
>
> 1. **Le produit a été comparé au marché**, avec des chiffres, pour la première fois.
>    [`docs/COMPARATIF_MARCHE.md`](docs/COMPARATIF_MARCHE.md) — 86 fonctionnalités de
>    l'état de l'art GRC, chacune **mesurée dans le dépôt** : **35 ✅ · 17 🟡 · 34 ❌**.
>    [`docs/PLAN_PRODUIT.md`](docs/PLAN_PRODUIT.md) en tire **douze lots, L17 → L28**, sept
>    portes neuves (S10 → S16) et **huit non-objectifs nommés un par un**. ⚠️ **Les trois
>    arbitrages qui vous étaient réservés sont TRANCHÉS** (08/09/2026) : **A2** le jeu de
>    découverte est autorisé sous cinq conditions constitutives ; **A1** l'IA est **locale
>    par défaut**, un fournisseur externe restant possible sous **six barrières** (lot
>    **L27**) ; **A3** le **portail fournisseur exposé est validé** (lot **L28**).
> 2. **Le lot L18 — installation — est LIVRÉ**, 18.7 excepté (frontend, après les portes).
>    `install.sh --assistant` (six questions, profil découverte), `install.sh --diagnostic`
>    (**quatorze** sujets, code 0/1/2 — douze à l'origine, quatorze depuis Q-290),
>    [`docs/INSTALLER.md`](docs/INSTALLER.md) (cinq commandes,
>    aucun renvoi), et **le bandeau 18.2 b livré le 09/09/2026** — voir le point 4.
> 5. **❌ LA PORTE S7 A ÉTÉ JOUÉE le 09/09/2026, pour la première fois, et REFUSÉE.** Deux
>    auditeurs indépendants, périmètres exclusifs (L11 les catalogues, L14 la documentation) :
>    **27 constats — 7 bloquants, 11 majeurs, 9 mineurs, 0 fuite de données.** ⚠️ **Elle a
>    démontré son propre motif** : *aucun* de ces 27 constats ne faisait rougir quoi que ce
>    soit. Côté **L11**, les 93 titres anglais de l'Annexe A **sont les intitulés officiels
>    ISO** et le fichier l'écrit lui-même — l'exact inverse du `PLAN_SERVEUR` §4.2, cadrage
>    clos avec le client ; et la prémisse du §4.2 (« les textes français sont des
>    reformulations originales ») est **fausse pour AirCyber**, 55 % du volume, engendré
>    depuis un CSV client. Côté **L14**, les guides envoient l'exploitant vers un **groupe
>    d'annuaire qui n'existe pas** et un **écran qui n'existe pas**, et promettent au DPO une
>    minimisation du journal que la base ne tient pas. ✅ **Ce qui tient** : couverture
>    424/424 sans trou, **NIS2 et DORA conformes au droit de l'Union**, **ANSSI sous Licence
>    Ouverte Etalab** — et son fichier anglais **refuse explicitement** de recopier les
>    titres officiels : la bonne réponse existait dans le dépôt, à côté des deux fichiers ISO.
> 3. **✅ Q-251 est FERMÉ le 09/09/2026** — l'essai de rapport de temps ne mesure plus un
>    rapport entre deux grandeurs d'une milliseconde : chaque côté est joué **R fois dans un
>    seul chronométrage**, R calibré à l'exécution. ⚠️ **« Grossir les tailles » a été
>    essayé et mesuré impossible** : le lecteur refuse un classeur au-delà de ~3,5 Mio
>    décompressés. **Seuil inchangé** ; deux gardes neuves — un plancher, et un plafond
>    unitaire sans lequel l'essai *se figeait au lieu de rougir* sur un lecteur quadratique.
> 4. **✅ 18.2 b — LIVRÉ le 09/09/2026.** Le profil découverte n'était visible que de
>    l'exploitant ; il l'est désormais de **l'utilisateur qui saisit**. `installation.profil`
>    voyage dans la **charte de session** — donc dans `GET /api/session` **et**
>    `POST /api/connexion`, identiques à l'octet près (§26.2) —, et la SPA en tire un
>    bandeau **que personne ne peut fermer** et qui **s'imprime avec les fiches** (une pièce
>    tirée d'une installation de découverte ne doit pas se présenter comme une pièce d'audit
>    ordinaire). ⚠️ **Une valeur inconnue de `CYBER_GRC_PROFIL` REFUSE le démarrage** : la
>    pente naturelle — retomber sur « production » — aurait laissé une faute de frappe
>    éteindre le bandeau **en silence**, c'est-à-dire produire le défaut que ce profil existe
>    pour empêcher. Une valeur **absente** vaut « production » : c'est tout le parc antérieur
>    à L18. Banc **1812/1812** ; les quatre propriétés ont été **cassées une à une** et le
>    banc a rougi à chaque fois. ⚠️ **Onzième livraison à déclarer au 7ᵉ passage de S8.**
>
> ### ⚠️ L'ORDRE DE REPRISE, et il n'est pas négociable
>
> Le `docs/PLAN_PRODUIT.md` **§0 bis** fait autorité : **aucun lot L17+ ne se joue avant
> que S7 et S8 soient franchies.** L18 a été la seule exception, et seulement parce qu'il
> ne touche **ni `src/`, ni le schéma** — il n'ouvrait aucune surface d'audit.
>
> ⚠️ **UNE EXCEPTION DE PLUS A ÉTÉ ACCORDÉE, ET ELLE EST ÉCRITE.** Le **lot RGPD** des
> 10 et 11/09/2026 touche `src/` **et** le schéma — il ne relève donc pas de la dispense
> de L18. Il a été demandé par l'utilisateur comme une **condition de crédibilité du
> produit**, non comme une fonctionnalité : *« je ne peux pas proposer un logiciel pour
> gérer la cyber alors que le logiciel même n'est pas conforme, à la base, au RGPD »*.
> Conséquence à assumer, et à déclarer : **cinq livraisons de plus au 8ᵉ passage de S8**
> (migrations `026` et `027`, la route du registre produit, la classification de la SPA,
> et le composant à puces généralisé).
>
> **Le travail immédiat, dans cet ordre :**
>
> | | Quoi | Pourquoi maintenant |
> |---|---|---|
> | ~~0~~ | ~~**Le lot RGPD — quatre pièces**~~ | ✅ **LIVRÉ les 10 et 11/09/2026.** La purge n'atteignait que **5 noms de colonnes** quand le schéma en porte **40** ; `colonnes_personnelles` (migration `026`) est désormais **le registre de l'article 30 du produit lui-même**, et les documents se classent (`027` : confidentialité, données personnelles, étiquettes, rattachement au registre). ⚠️ **Cinq défauts trouvés par les garde-fous, aucun par moi** — dont le **verrou d'approbation qui refusait la purge** (`409 GRC02`), deux moitiés correctes chacune seule. **Q-284 fermé** par l'issue *(a)*. Règle neuve : `CONVENTIONS.md` **§38** |
> | ~~1~~ | ~~**18.2 b — le bandeau « installation de découverte »**~~ | ✅ **LIVRÉ le 09/09/2026.** Gardé barré, pas effacé : c'est la **onzième livraison** que le 7ᵉ passage de S8 devra examiner, et une ligne effacée est une livraison qu'on oublie de déclarer |
> | ~~1~~ | ~~**Q-251** — l'essai de rapport de temps~~ | ✅ **FERMÉ le 09/09/2026**, et **pas** par « grossir les tailles » : le lecteur refuse un classeur au-delà de ~3,5 Mio décompressés, donc la grande taille franchirait le plafond et l'essai mesurerait un tout autre refus. C'est le **travail** qui a été grossi — R passes dans un seul chronométrage, R calibré à l'exécution. Seuil inchangé |
> | ~~1~~ | ~~**Jouer la porte S7**~~ | ✅ **JOUÉE le 09/09/2026, et REFUSÉE** — 27 constats (**7 bloquants**), 0 fuite de données. ⚠️ **Elle a démontré son propre motif** : aucun des 27 ne faisait rougir quoi que ce soit. *Aucun échec ne la signalait*, et c'est vérifié |
> | **1** | **Traiter les 7 bloquants de S7** | **Q-252 · Q-253 · Q-255** (droit d'auteur des catalogues ISO et AirCyber — **deux exigent un arbitrage de l'utilisateur**) et **Q-264 · Q-265 · Q-266 · Q-267** (les guides décrivent un produit qui n'est pas celui qui tourne). Registre au `docs/PLAN_EXECUTION.md` §7 |
> | ~~2~~ | ~~**Rejouer S8 — 7ᵉ passage**~~ | ✅ **JOUÉ le 10/09/2026, et REFUSÉ** — 0 bloquant, 6 majeurs, 6 mineurs, **0 fuite entre filiales**, 3 contrôles sur 18 en échec. ⚠️ **Sur 12 mutations, 3 ne mordent pas — et les trois sont des gardes posés la veille.** Constats **Q-279 → Q-290** |
> | ~~2~~ | ~~**Les 6 majeurs de S8**~~ | ✅ **TRAITÉS les 10 et 11/09/2026.** ~~Q-279~~ (la trace suit le volume rendu), ~~Q-280~~ (voie 1 fermée, voie 2 **réfutée** avec sa mesure), ~~Q-281~~ (migration `021`, les gardes mesurent `tgtype`), ~~Q-282~~ (`022`, le relais de version vit dans la base), ~~Q-283~~ (deux discriminants qui ne sont pas la taille), ~~**Q-284**~~ **fermé le 11/09** — pas par le remède qu'il prescrivait, **mesuré impossible**, mais en DISTINGUANT : l'indélébile est la décision, pas le nom |
> | ~~2~~ | ~~**Rejouer S8 — 8ᵉ passage**~~ | ✅ **JOUÉ le 11/09/2026, et REFUSÉ** — **deux auditeurs indépendants**, périmètres exclusifs. **1 bloquant, 11 majeurs, 7 mineurs, 0 fuite entre filiales**, constats **Q-291 → Q-309**, **cinq contrôles sur dix-huit en échec**. ⚠️ **Sur 41 mutations, 14 ne mordent pas — et treize visent des gardes posés dans les trois jours précédents.** Le bloquant **Q-301** est le correctif de Q-279, accepté au passage d'avant : il trace **l'inventaire de la filiale** au lieu de ce qui sort, et inscrit de **fausses accusations d'extraction dans le journal inaltérable** |
> | ~~2~~ | ~~**Le bloquant Q-301, puis les dix-huit autres constats de S8**~~ | ✅ **TRAITÉS le 11/09/2026 — les dix-neuf, sauf Q-309 qui est clos par arbitrage.** Migrations **`028`, `029`, `030`** ; quatre garde-fous neufs ; le semis du registre RGPD passe de **58 à 197 décisions** ; **trois familles d'essais neuves ou étendues**. ⚠️ **Le remède commun des cinq est écrit en règle** : `CONVENTIONS.md` **§39** — *un garde-fou ÉPROUVE, il ne reconnaît pas un mot*, et **le balayage part du CATALOGUE, jamais de la liste**. ⚠️ **Deux constats de plus trouvés en travaillant**, tous deux de la classe « on a corrigé l'instance, pas la classe » : **Q-310** (`risque_catalogue.id` en `text` nu — Q-194 rejoué sur la table que la même migration avait créée) et **Q-311** (le garde du §29.5 examinait **une ligne à la fois**, et le produit interpolait sur la suivante) |
> | ~~2~~ | ~~**Rejouer S8 — 9ᵉ passage**~~ | ✅ **JOUÉ le 11/09/2026 au soir, et REFUSÉ** — 0 bloquant, 12 majeurs, 11 mineurs, **0 fuite entre filiales**, constats **Q-312 → Q-334**. ⚠️ **Quatrième porte de suite où les constats porteurs visent les gardes du passage d'avant.** ✅ **Les vingt-trois sont traités le soir même** (migration `031`) |
> | **2** | **Rejouer S8 — 10ᵉ passage** | Par des **auditeurs indépendants**. ⚠️ **Quatre passages de suite** ont trouvé leur constat porteur dans un correctif accepté au passage d'avant : Q-208 deux fois, Q-301, puis Q-312 et Q-313. *Un banc vert ne vaut pas un passage de porte* |
> | **3** | Le reste des constats de **S7** (Q-254, Q-256 → Q-263, Q-268 → Q-278) | ⚠️ **Deux se ferment ENSEMBLE avec un constat plus ancien** : **Q-272** promet dans le guide la propriété que **Q-243** dit absente — la troncature de queue du journal. Corriger un seul des deux endroits laisserait le produit se contredire |
> | **3** | Les constats ouverts : **Q-243, Q-247, Q-234 → Q-244, Q-205 b, Q-206, Q-214 b·c·d·f** | Registre au `docs/PLAN_EXECUTION.md` §7, **seule source** |
>
> **Après les portes seulement** : L16-D3 (la recherche), **L18 bis** (le jeu de
> découverte, autorisé le 08/09 sous cinq conditions constitutives), **L17**, puis
> L19 → L26.
>
> ---
>
> **Un lot neuf avance, hors chemin de mise en service :** **L16, le système documentaire**
> (vague 9, décidée le 07/09/2026). ⚠️ **Le coffre existe déjà** — L6 livre le dépôt, ses huit
> contrôles et le panneau monté sur la fiche document ; `documents.filiale_id` nul porte déjà la
> PSSI de portée Groupe. **Ne pas le refaire.** Ce qui manquait était la gestion :
> ~~version en vigueur~~, ~~zéro orphelin~~, recherche, ~~source de vérité unique~~,
> ~~approbation~~ — **quatre actions sur cinq sont livrées** (D2 le 07/09 ; **D1, D4 et D5 le
> 08/09**). **Reste D3, la recherche, et elle ne se joue pas avant que S8 soit franchie** : une
> recherche est un **oracle**, c'est la surface la plus propice à une fuite entre filiales.
>
> ✅ **Les actions D1, D4 et D5 sont LIVRÉES le 08/09/2026** — migrations `018` et `019`.
> **D1** : la pièce marquée « en vigueur » est celle qui fait foi (au plus une par porteur **et
> par filiale** — l'unicité porte `filiale_id`, sans quoi une filiale recevrait un doublon causé
> par une ligne invisible d'une autre, constat Q-2), et **c'est elle qui donne le numéro de
> version de la fiche** au lieu d'une saisie libre. **D4** : `documents.emplacement` devient
> « Document resté ailleurs » — une référence externe qu'on ne confond plus avec un fichier
> détenu ici ; ⚠️ la phrase « l'application ne stocke pas les fichiers », vraie du produit
> navigateur et **fausse depuis L6**, est retirée des trois endroits où elle traînait. **D5** :
> un document « en validation » ne passe « en vigueur » qu'avec une **publication approuvée**
> (code **`GRC06`**, refus journalisé avec sa route) — et la règle mord **dès qu'un circuit
> existe**, sans quoi il suffisait de repasser par « brouillon ». ⚠️ **Ce qu'elle ne fait pas**
> (constat **Q-247**) : elle ne vérifie pas que l'approbation porte encore sur le contenu
> actuel — cela vit dans `empreinte_objet`, affiché par l'encart, et le refaire en SQL
> dupliquerait une liste d'exclusion.
>
> ✅ **L'empreinte SHA-256 cesse d'être un commentaire (08/09/2026)** — migration `020`.
> Mesuré par balayage de `src/` : `empreinteDe()` n'avait **qu'un seul appelant**, le dépôt.
> L'empreinte était écrite, stockée, servie — et **mordue par rien** (§18.4), alors qu'elle
> porte la promesse centrale du coffre. Elle **s'affiche** désormais sous le nom du fichier,
> dépliable en place ; un bouton **Vérifier** (`GET …/:pieceId/integrite`, déclaré **`lire`**)
> relit le fichier et rend `conforme` / `ecart` / `fichier_absent` ; un **balayage** sur le
> minuteur de ré-analyse inscrit son verdict et **sort en code 1** sur un écart. ⚠️ La route
> **ne persiste rien** : écrire exigerait la filiale ACTIVE, et une session Groupe vérifiant
> la pièce d'une filiale voisine aurait « réussi en silence ». ⚠️ Et le dispositif **ne
> garantit pas l'intégrité** : qui peut écrire dans le magasin peut aussi mettre le `sha256`
> à jour. Il attrape l'écart, pas l'adversaire complet.
>
> ⚠️ **Un défaut de la veille trouvé en écrivant celui-là, et sa leçon vaut au-delà :**
> `normaliserListe()` du panneau **filtre** les champs, et `en_vigueur` / `version_piece` y
> avaient été oubliés — le badge et la colonne seraient restés **vides sur la recette, sans
> une erreur**. Ni le banc navigateur (qui façonne ses réponses) ni les essais de module (qui
> vérifient qu'un écran se rend) ne pouvaient le voir : *le défaut vit entre la route et le
> panneau*. Fermé à la classe — `test/pieces/champs-servis.test.mjs` extrait du texte du
> panneau les champs qu'il **lit** et exige qu'ils traversent la normalisation.
>
> ✅ **L'action D2 — « zéro orphelin » — est LIVRÉE le 07/09/2026**, jouée en premier parce
> qu'elle rapproche de la porte plutôt qu'elle ne l'éloigne : migration `017`, un déclencheur
> `f_pieces_suivent_leur_porteur()` sur **32 tables porteuses découvertes dans le catalogue**,
> et une file `pieces_a_purger` que l'application vide **après le commit**. Une pièce jointe
> suit désormais son porteur sur **tous** les chemins — cascade et `psql` compris. ⚠️ **Et une
> conséquence à connaître** : une reprise « remplacer » détruit désormais les pièces jointes de
> l'état remplacé (`docs/GUIDE_EXPLOITATION.md` §4 bis).
>
> **Ce qui reste avant la mise en service :**
>
> - **jouer la porte S7**, jamais jouée (relecture métier, paraphrase des catalogues) ;
> - **Q-243** — une troncature de **queue** du journal est indétectable : le produit répond
>   `sain: true`. Ancrer la tête de chaîne, ou corriger la phrase du plan qui promet plus ;
> - **Q-234, Q-236, Q-238 → Q-241, Q-244** — gardes qui ne mordent pas assez.
>
> ~~**Q-232 / Q-233** — pièces jointes orphelines~~ : **fermés le 07/09** par l'action D2
> ci-dessus, à la CLASSE et non à l'instance. La leçon vaut d'être retenue au-delà du cas :
> *le relais d'une cascade que le schéma ne peut pas exprimer — un lien polymorphe n'a pas de
> clé étrangère — se prend DANS LA BASE, sur chaque table porteuse, jamais dans les routes.
> Une route ne voit que son chemin ; il y en a toujours un de plus.*
> (`backend/db/CONVENTIONS.md` §8.1.)
>
> ⚠️ **Le banc ne se recopie pas ici** (constat **Q-219**) : il rend le compte que le
> `backend/README.md` §8 relève **à la révision qu'il cite**. Au 07/09 il est
> **entièrement vert**, et la recette tourne en permanence sur cette machine, Active
> Directory réel compris.
>
> ⚠️ Si vous lisez ailleurs « ouvrir la vague 3 », « L3 reste à faire », « L10 → L15 à
> faire », « les seize lots sont livrés », « la couverture du journal est de 4 actions sur
> 20 » ou « aucun essai navigateur n'existe », **c'est périmé**.
>
> **Republier passe TOUJOURS par `install.sh --maj`**, jamais par une copie à la main : le
> jeton de version d'`index.html` dérive du contenu. Et **vérifiez ce qui est servi**
> (`--verifier-publication`) — constat **Q-103** : le dépôt était vert pendant que la
> machine servait encore l'ancien fichier.
>
> ⚠️ **Aucune filiale n'a été créée dans la recette**, délibérément : une filiale active de
> plus fait basculer `f_perimetre_groupe()` à faux pour toute session Groupe jusqu'à sa
> reconnexion (constat **Q-155**).
>

## 0. L'ENVIRONNEMENT DE TRAVAIL — mesuré, pas supposé

> ⚠️ **Lire avant de déclarer quoi que ce soit « hors de portée ».** Cette section existe
> parce que trois affirmations fausses sur l'environnement ont coûté du travail dans la
> seule journée du 04/09/2026 : « la machine est hors ligne » (constat **Q-128**), « aucun
> compte ne porte `GRC-EXPORT` » (**Q-129**), et « ni Playwright ni Chromium ne sont
> installés ». Aucune n'avait été mesurée ; deux venaient de rapports d'agents que j'ai
> recopiés.
>
> **La règle qui en découle, et elle prime sur tout ce que dit ce fichier :** avant d'écrire
> qu'une chose est impossible ici, **essayez-la**. Une commande coûte cinq secondes ; une
> réserve fausse se transmet de session en session et fait renoncer à des vérifications qui
> marchaient.

### 0.1 Où vous êtes

Vous êtes une instance **Claude Code qui s'exécute sur le VPS lui-même** — `SRV-Infra`,
Debian 13, IP publique `212.227.38.92`. Il n'y a **pas** de machine distante : le dépôt, la
base, le serveur applicatif, Apache et l'annuaire tournent tous là où vous tapez vos
commandes.

**Corollaire, et il est libérateur** : tant que cette session existe, l'environnement de
travail vous est accessible. Un doute sur une capacité se lève par une mesure, jamais par une
supposition. Le VPS est **à votre disposition pour ce projet**, et l'objectif est un logiciel
de GRC complet et efficient — pas un prototype qu'on ménage.

### 0.2 Ce dont vous disposez — vérifié le 04/09/2026

| Capacité | État | Comment c'est mesuré |
|---|---|---|
| **`sudo`** | ✅ compte `claude`, mot de passe demandé | `sudo -v` puis `sudo id` → `uid=0(root)` |
| **Internet sortant** | ✅ sans entrave | `GET https://registry.npmjs.org/` → **200 en 60 ms** ; `GET https://github.com/` → **200 en 57 ms** ; `POST` sur la racine du registre → **403 en 56 ms** |
| **GitHub par SSH** | ✅ clé `~/.ssh/id_ed25519` | `ssh -T git@github.com` → « Hi Hakim1195/cyber-grc! You've successfully authenticated » ; distant `git@github.com:Hakim1195/cyber-grc.git` |
| **PostgreSQL 17** | ✅ **déjà installé**, PGDG | `psql --version` → **17.11 (Debian 17.11-1.pgdg13+2)** ; cluster `17/main` en ligne sur 5432. `deploy/install.sh` l'installe déjà (`postgresql-17 postgresql-client-17` depuis PGDG) — **rien à faire de ce côté** |
| **Active Directory simulé** | ✅ conteneur Docker `grc-ad`, **modifiable** | `sudo docker exec grc-ad samba-tool user list` → 12 comptes ; `samba-tool group addmembers` fonctionne. **Vous pouvez y créer les comptes, groupes et unités d'organisation dont vos essais ont besoin** |
| **Playwright + Chromium** | ✅ installés | Chromium à `/opt/pw-browsers/chromium-1234` ; **Playwright global sous `/usr/lib/node_modules/`** (`npm root -g`). ⚠️ **Ce tableau annonçait `/opt/node22/lib/node_modules/` — un chemin QUI N'EXISTE PAS sur cette machine** (constat **Q-288**, 7ᵉ passage de la porte S8). Rien n'était cassé : `test/aide/navigateur.mjs` **découvre** Playwright au lieu de le coder en dur, précisément à cause du constat Q-80. Mais **c'est le §0 de ce fichier qui interdit d'affirmer sans mesurer**, et il portait lui-même une affirmation non mesurée |
| **ClamAV** | ✅ actif | `systemctl is-active clamav-daemon` → `active` |
| **Sortie SMTP vers Microsoft 365** | ✅ **fonctionne** | port 587 vers `smtp.office365.com` → bannière **`220 … Microsoft ESMTP MAIL Service ready`**. Cela répond, **pour ce VPS**, à la vérification du `PLAN_SERVEUR` §9 ; la VM du client reste à vérifier séparément |
| **La recette complète** | ✅ en ligne en permanence | `systemctl is-active cyber-grc apache2 postgresql` ; `https://grc.exemple.interne/` → 200 |

### 0.3 La seule limite connue, et elle n'est pas technique

> ⚠️ **Il y en avait deux ; il n'en reste qu'une, et la façon dont la première est tombée
> vaut d'être lue.** `npm audit --omit=dev` échouait, et le contrôle **S15** était consigné
> « non rejoué » depuis la porte S4 — honnêtement, avec le diagnostic mesuré (`POST
> /-/npm/v1/security/advisories/bulk` → 503 ou sans réponse au-delà de 20 s, quand la même
> URL rend 405 en 202 ms en `HEAD`) et la bonne conclusion : *« à rejouer, c'est peut-être
> passager »*. **Rejoué le 04/09/2026 au soir : `found 0 vulnerabilities`, code de retour 0**
> (constat Q-156). C'était passager. Il a suffi de rejouer.
>
> La leçon est le pendant de celle du §0 : *une réserve écrite n'est pas une réserve
> traitée*, et **« non rejoué » ne vaut ni « passé » ni « en échec »**. Rejouez avant de
> reconduire.

1. **L'AD *de production* du client reste interdit aux essais** — un banc qui éprouve le cas
   négatif verrouille des comptes réels. C'est une règle de prudence, pas une limite
   technique. L'AD **simulé** (`grc-ad`) est là pour ça, et il est à vous.

### 0.4 Les comptes de recette de l'annuaire `grc-ad`

Realm `EXEMPLE.INTERNE`, LDAPS sur `127.0.0.1:1636`. Mot de passe : le login en
**Capitales-Séparées-Par-Traits**, suivi de `-2026!` — `rssi.tls` → `Rssi-Tls-2026!`,
`admin.grc` → `Admin-Grc-2026!`, `rssi.groupe` → `Rssi-Groupe-2026!`.

⚠️ **Ne confondez pas avec `backend/test/annuaire/comptes.mjs`**, qui décrit l'annuaire
**simulé du banc** et emploie d'autres mots de passe (`rssi.tls!2026`). J'ai perdu trois
tentatives sur `admin` — qui n'existe pas, le compte est `admin.grc` — en croyant ce
fichier. Le verrouillage est à cinq tentatives.

### 0.5 Ce qui traîne sur le VPS et qui n'est pas à vous

Des piles Docker **arrêtées** sous `/opt/hm-infra/` — Odoo, cal.com, n8n, traefik, searxng,
un site web. C'est l'essai d'un autre projet, **abandonné** ; l'utilisateur a tranché le
04/09/2026 : *« je ne vais en aucun cas remettre en place l'ancien projet sur Docker, tu peux
faire comme s'il n'existait pas »*. Ne les ménagez pas, ne les redémarrez pas.

**Le seul conteneur qui compte est `grc-ad`.**

---


## 1. Le produit

Logiciel de **gouvernance, risques et conformité (GRC) cyber**. Public :
RSSI/consultants **et** non-experts à sensibiliser → chaque concept doit avoir une
**note pédagogique** (`Help.tip(...)`).

- **Frontend** : `cyber-gouvernance_V4/` — SPA maison (HTML/CSS/JS, sans framework,
  sans build), 26 modules métier. Conservée telle quelle : **seule sa couche de
  persistance a basculé** vers le serveur (`PLAN_SERVEUR` §1.3, lot L2 livré), et la
  façade synchrone `DataStore` est intacte — aucun module métier n'a été réécrit.
- **Backend** : `backend/` — Node.js 22 + TypeScript + PostgreSQL, Debian 13,
  **sans conteneur**, Apache2 en frontal. Lots L0, L1 et L2 livrés ; **pas encore
  d'authentification** (lot L3), donc **il ne sert de données qu'en développement**.
- **Branche** : la consigne utilisateur reste **« tout pousser sur `main`, ne pas créer
  de branche de travail »**. ⚠️ Le chantier serveur est de fait conduit sur
  **`claude/backend-plan-serveur-hj46fs`** : ne pas « corriger » l'un ou l'autre sans
  demander — c'est un arbitrage qui appartient à l'utilisateur, pas à une session.
- **Marque** : Dedienne Aerospace pour le frontend actuel ; la cible serveur rend
  **logo et raison sociale configurables par filiale** (`PLAN_SERVEUR` §6).

## 2. Décisions structurantes (VALIDÉES — ne pas re-débattre)

| Sujet | Décision |
|-------|----------|
| Identité visuelle | **Orange dominant** (Option B) : structure bleue `#2059A6`, action/marque orange `#E9631B`. Couleurs sémantiques strictes (vert=conforme, orange=partiel, rouge=critique, gris=NA) réservées aux statuts. |
| Marque | **Garder Dedienne Aerospace** (logo `assets/logo/logo-dedienne.png`). |
| ~~Chiffrement navigateur~~ | ⚠️ **CADUC depuis le lot L2.** Le coffre opt-in du navigateur est **retiré** : plus aucune donnée n'est stockée sur le poste, et un coffre qui ne protège rien est une fausse assurance. Le chiffrement au repos est celui du **disque de la VM** (`PLAN_SERVEUR` §1.9). L'export de fichier, lui, peut toujours être chiffré. |
| Multi-« Donneurs d'ordre » | **Conservé** (pertinent pour un sous-traitant aéro), libellés génériques. |
| ~~Full frontend~~ | ⚠️ **CADUC depuis le chantier serveur.** Valait pour le produit local. La cible est désormais client/serveur (`docs/PLAN_SERVEUR.md`). Reste vrai : **aucun CDN runtime ni service tiers**, libs embarquées localement. |

### Décisions Référentiels — VALIDÉES & LIVRÉES (chantier 4a/4b)
- **Référentiels** : démarré par **Hygiène ANSSI (42 mesures)** ; suite ISO 27001 (Annexe A) / NIS2 / DORA / AirCyber (4c).
- **Architecture conformité** : entité pivot **« Mesure de sécurité »** reliée n-n aux
  exigences des référentiels (évaluer une mesure propage le statut → zéro double saisie). **Livré.**

## 3. Architecture technique

SPA maison. Chargement par `<script>` séquentiels dans `index.html`.

```
cyber-gouvernance_V4/
├── index.html                 SPA (sidebar + #app), fil d'Ariane + bandeau
├── css/tokens.css             DESIGN TOKENS (source unique des variables)
├── css/style.css              styles (consomme les tokens)
├── assets/logo/               logo Dedienne + favicon
├── js/core/
│   ├── api.js         (L2)    SEUL point du frontend qui parle au réseau (/api/…)
│   ├── session.js     (L2)    périmètre TEL QUE LE SERVEUR LE RÉSOUT (objet gelé, sans mutateur)
│   ├── sync.js        (L2)    BASCULE : chargement, écritures ciblées, verrouillage optimiste, sondage
│   ├── reprise.js     (L2)    reprise de la base héritée d'un poste (export puis import)
│   ├── persistence.js         ne persiste plus rien — LIT la base IndexedDB héritée, en lecture seule
│   ├── crypto.js              Web Crypto (PBKDF2 + AES-GCM) — sert encore à l'export chiffré
│   ├── vault.js               coffre RETIRÉ ; devenu la PORTE DE DÉMARRAGE (liaison au serveur)
│   ├── datastore.js           SOURCE DE VÉRITÉ EN MÉMOIRE ; API CRUD synchrone — façade préservée
│   ├── router.js              routeur par hash (#/route, #/route/:id)
│   ├── ui.js                  helpers partagés (UI.genId, badges, suppression, multi-personnes)
│   └── help.js                composant tooltip pédagogique `Help.tip(text)`
├── js/services/
│   ├── backup.js              export/import `grc-backup` — FORMAT D'ÉCHANGE, plus une sauvegarde
│   ├── importExcel.js, exportExcel.js, exportPDF.js
│   ├── echeances.js           AGRÉGATEUR d'échéances (lecture seule) `window.Echeances`
├── js/modules/                26 modules ; 1 module = 1 domaine (IIFE `XxxModule.renderList/renderDetail`)
│   └── dashboard, synthese, echeances, clients, personnel, actifs, cartographie, risques, matrice, exigences,
│       referentiels, mesures, conformite, mapping, incidents, documents, rgpd,
│       actions, bia, crise, pra_scenarios, pra_mco, pra_tests,
│       pra_prestataires, audits, settings
├── js/lib/xlsx.full.min.js    SheetJS (embarqué)
└── js/app.js                  bootstrap (Vault.boot = liaison serveur → init → routes → breadcrumb/menu)
```

### Conventions
- **UI en français.** Voix active, libellés orientés action.
- Module = IIFE retournant `{ render / renderList / renderDetail }`. Rendu via `app.innerHTML = template`.
- **DataStore : API 100 % synchrone** pour les modules (`getX/addX/updateX/deleteX`).
  L'asynchrone — hier IndexedDB, aujourd'hui le serveur — est absorbé **sous** la façade,
  dans `js/core/sync.js` et là seulement. **Ne pas casser l'API sync** : c'est la parade au
  risque projet P3, et c'est ce qui a permis de basculer 26 modules sans en réécrire un seul.
- **Sécurité XSS** : échapper toute donnée utilisateur injectée en DOM. `escapeHtml` est
  partagé (`window.escapeHtml`) et généralisé à tous les modules — la dette du chantier 9
  est soldée. La porte S2 a néanmoins trouvé deux injections résiduelles : l'échappement
  ne se relâche jamais, y compris dans un panneau de détail ou un `<option>`.
- **Aucun gestionnaire en ligne.** Pas d'`onclick=`, `onchange=`, `oninput=`, `onsubmit=`
  dans le balisage : la **politique de sécurité de contenu du vhost livré les bloque**, et
  l'application ne fonctionnait pas dans sa configuration de déploiement. On branche après
  rendu (`addEventListener`), et **aucune donnée ne voyage dans un attribut de gestionnaire**.
- **L'identifiant d'un enregistrement se lit dans un attribut du DOM au moment du clic,
  jamais capturé en chaîne dans une fermeture.** Écrire
  `row.dataset.id = enr.id` puis `row.onclick = () => Router.navigateTo('/actifs/' + row.dataset.id)`,
  et non `const id = enr.id; …() => …(id)`. Raison : **le serveur réattribue l'identifiant à
  la création** — proposer le sien est refusé (oracle d'existence inter-filiales). Une
  fermeture qui a capturé l'ancien continue donc de viser un enregistrement qui n'existe
  plus, **en silence** : le clic ne mène nulle part, et « Supprimer la sélection » confirme
  une suppression qui n'a pas lieu. Le recalage du balisage — `recalerBalisage()`, interne
  à `js/core/sync.js` et appelé par le renommage — réécrit les **attributs** du balisage
  déjà rendu, mais **il ne peut rien pour une valeur capturée** : la réparation ne tient
  que si la convention est respectée. Capturer l'**objet** (`enr`, puis lire `enr.id`
  au clic) fonctionne aussi, puisque le renommage l'a modifié en place.
- **Une liste écrite à la main est une omission qui attend — sauf quand son objet est
  d'obliger quelqu'un à trancher.** La première moitié de cette règle a produit quatre
  défauts distincts au fil du chantier ; la seconde a été arbitrée récemment, et sans
  elle la règle devient une superstition. Le discriminant n'est pas le sujet de la
  liste, c'est **ce qui arrive le jour où elle devient incomplète** :

  | Ce que produit une omission | Verdict | Ce qu'on écrit à la place |
  |---|---|---|
  | quelque chose **réussit en silence** alors que c'est faux | ❌ la liste est le mauvais outil | on **découvre dans le catalogue** — `pg_catalog` côté base, un parcours de valeurs côté navigateur |
  | quelque chose **échoue bruyamment** et quelqu'un doit décider | ✅ la liste est le bon outil | on l'écrit, on la **fige à deux endroits** qui la comparent au réel, et on dit pourquoi |

  Les trois cas du dépôt, à relire avant d'en écrire un quatrième :
  **(a)** la liste des tables sans `filiale_id` est **écrite à la main, délibérément**
  (`backend/db/CONVENTIONS.md` §24) — une table qui apparaît fait rougir deux contrôles,
  et un humain doit dire si elle porte la même chose pour tout le groupe ;
  **(b)** la liste des champs qui sont des **références**, dans le renommage de
  `js/core/sync.js`, est **refusée** : `/api/modele` rend le *type* d'une colonne, jamais
  sa nature de référence, et un champ neuf oublié pointerait dans le vide sans un mot —
  le constat reste donc ouvert et **affiché**, plutôt que fermé à moitié ;
  **(c)** la liste des **sites de mutation** qu'exigerait une mémorisation du différentiel
  est **refusée** pour la même raison : une invalidation manquée annoncerait « aucune
  modification en attente » alors qu'il y en a.
- **Aucun fichier de données ne vit sous `cyber-gouvernance_V4/`.** L'installateur y
  publiait autrefois **tout** le répertoire dans la racine web d'Apache : quatre classeurs
  de données réelles — dont un fichier de verrou Excel nommant une personne — y sont
  restés un temps, **téléchargeables sans authentification** sur une installation réelle.
  Les jeux d'essai vivent dans le répertoire de travail temporaire, hors dépôt ; ce que
  l'application lit au démarrage vient du serveur. Deux barrières le tiennent désormais —
  une **liste blanche de types publiables** dans `install.sh` (dérivée de ce que la CSP
  autorise à charger) et le `<FilesMatch>` du vhost — et elles vont **par paire** :
  ajouter un type à l'une sans l'autre est ce que le message d'échec rappelle.
- **Pédagogie** : `${Help.tip("explication courte")}` à côté des termes techniques.
- **Design** : n'utiliser que les tokens de `tokens.css`. Semantique stricte.
- **IDs** : **un seul générateur effectif par langage**. Côté navigateur, c'est
  `UI.genId(prefix)` — les deux enveloppes qui existent (`js/core/datastore.js`,
  `js/services/importExcel.js`) se contentent de lui déléguer, avec un repli défensif si
  `UI` n'est pas chargé. Forme `"<PRÉFIXE>-<horodatage>-<aléa>"` ; **ce qui est normatif
  est une propriété, pas un encodage** : au moins 52 bits tirés d'un générateur
  cryptographique (`backend/db/CONVENTIONS.md` §2, qui fait foi — il recense les **cinq**
  endroits où le produit fabrique un identifiant : trois générateurs aléatoires et deux
  dérivations qui ne tirent rien). **Ne jamais recopier la convention dans une fonction
  locale** : le durcissement de l'un de ces générateurs a laissé les autres derrière —
  deux fois. L'une de ces omissions a coûté le seul constat bloquant d'un
  passage de porte — un import qui écrivait *223 lignes sur 250 en annonçant le succès*,
  chiffre mesuré par l'auditeur et consigné au `backend/db/CONVENTIONS.md` §2.

## 4. Persistance & modèle de données (résumé — détail dans DATA_MODEL.md)

> ⚠️ **Depuis le lot L2, les données vivent sur le serveur (PostgreSQL).** Le navigateur
> n'écrit plus rien : ni IndexedDB, ni miroir `localStorage`, ni points de restauration
> locaux, ni coffre de chiffrement. Ce qui suit décrit **la forme de l'objet `data`** — celle
> que voient les modules à travers la façade préservée, et celle du fichier d'échange
> `grc-backup`. C'est une **représentation de transport**, plus un lieu de stockage. La
> correspondance avec les tables du serveur est dans `docs/DATA_MODEL.md` §1.5 ; le compte
> exact, rejoué, est dans `backend/README.md` §8.
>
> Ce qui subsiste d'IndexedDB : `js/core/persistence.js` sait **lire** la base héritée d'un
> poste, en lecture seule, pour permettre sa reprise. Rien n'est effacé d'un poste sans un
> geste explicite de l'utilisateur, et jamais avant que ses données soient à l'abri.
>
> Le **numéro de version** d'un enregistrement (verrouillage optimiste, risque P1) n'est
> **pas** dans l'enregistrement : il est tenu à part dans `js/core/sync.js`, précisément
> pour que `data` garde la forme décrite ici et qu'un module qui reconstruit un objet ne
> puisse pas perdre la version au passage (`docs/DATA_MODEL.md` §1.4).

- `SCHEMA_VERSION = 12` dans `datastore.js` — elle numérote la forme de `data` et du fichier
  `grc-backup`, pas les migrations SQL. Migrations à l'import via `migratePayload` côté
  navigateur, et **paliers v1 → v12 rejoués côté serveur** (`backend/src/reprise/`).
- Entités (tableaux) : clients, exigences, actions, risques, actifs, processus, crise,
  scenarios_pra, tests_pra, prestataires, mco_actions, audits, revues,
  **evaluations** (auto-évaluations de référentiels), **mesures** (pivot « Mesure de sécurité »),
  **incidents** (registre des incidents), **documents** (registre des politiques),
  **traitements** (registre RGPD art. 30, mesures reliées au pivot),
  **mappings** (v7, surcouche des correspondances inter-référentiels ; catalogue par défaut statique),
  **history** (v8, indicateurs historisés — un point par jour pour les courbes de tendance)
  et **personnes** (v11, annuaire — autocomplétion des champs « Responsable » ; le nom reste stocké en
  texte dans les entités, saisie libre conservée).
  Les **actifs** portent en plus un champ **`dependances[]`** (v9, liens typés actif→actif :
  `dep`/`hosted`/`flux`/`backup` — module Cartographie & analyse d'impact).
  Les **`mco_actions`** suivent (v10) un modèle de **suivi d'action planifiée** :
  `{ titre, description, responsable, frequence, priorite, datePrevue, dateReelle, dateCloture,
  statut ("À planifier"|"En cours"|"Réalisée"|"Annulée"), avancement 0–100, commentaire }` —
  « en retard » est *dérivé* via `PraMcoModule.isEnRetard` (réutilisé par le dashboard). Migration
  transparente de l'ancien `{ etat, date, notes }` dans `normalize`.
- Référentiels : catalogue **statique** (registre `js/data/referentiels.js` + fichiers `ref_*.js`),
  hors `data`. Livrés : ANSSI (42), ISO 27001 Annexe A (93, id technique conservé `iso-27002-2022`),
  NIS2 (10), DORA (15), AirCyber/BoostAerospace (234).
  Ne pas embarquer le texte des normes (reformulations originales + identifiants de clauses).
  **Correspondances** inter-référentiels : catalogue statique `js/data/mappings.js` (`MappingCatalog`,
  28 groupes ANSSI↔ISO↔NIS2↔DORA) + surcouche éditable `data.mappings` (module `/mapping`).
  AirCyber = questionnaire réel (généré depuis un CSV via un script du scratchpad, non versionné) ;
  import in-app des réponses (bouton sur la fiche AirCyber, parsing SheetJS, mapping Oui/Non→statut) ;
  métadonnées par question **niveau Bronze/Argent/Or + priorité + domaine CL0–CL6** (badges,
  filtres, panneau « préparation au label »), champs optionnels `niveau`/`priorite`/`cl` + `clLabels` ;
  **radar par domaines CL** (axes CL0–CL6 nommés, `computeClAxes` activé par `clLabels`,
  questions sans CL hors radar mais comptées ailleurs ; autres référentiels : radar thématique inchangé),
  **filtrable par niveau de label** (boutons Global/Bronze/Argent/Or, tracé teinté par niveau) ;
  **`scoring: "conformite"`** : AirCyber se répond **Oui/Non/N-A sans maturité CMMI** — score =
  « Oui » ÷ applicables (N/A exclues, non répondu = Non), mêmes valeurs de `statut` en base,
  `maturite` préservée mais ignorée (exclue aussi des moyennes CMMI du dashboard et de la SoA).
- Export fichier : enveloppe **`grc-backup`** `{ format, version, encrypted, createdAt, app, payload|kdf+cipher }`.

## 5. Lancer & tester (important)

> ⚠️ **La SPA ne démarre plus seule.** Depuis le lot L2, elle charge session, modèle et jeu
> de données **avant** de s'afficher ; sans serveur joignable, elle refuse de démarrer et
> propose « Réessayer ». C'est délibéré : démarrer sur un jeu vide afficherait « aucun
> risque, aucune action, aucun incident » dans un outil qui sert de preuve en audit. Un
> `python3 -m http.server` sur `cyber-gouvernance_V4/` seul ne suffit donc plus.

- **Monter le serveur d'abord** (une fois par poste) :
  `pg_ctlcluster 16 main start` puis, depuis `backend/`,
  `bash db/dev/preparer_base_dev.sh` (rôles + base + migrations). Le serveur ne sert de
  données **qu'en `NODE_ENV=developpement`** : hors de là, il répond `503` — la
  recette comprise, et c'est voulu (`backend/README.md` §7). Il faut aussi **au moins une
  filiale active** en base, sans quoi la session ne se résout pas.
- **Servir la SPA** sur une vraie origine (pas `file://`) avec `/api/**` relayé vers le
  serveur. Le banc d'essai monte exactement cela : `backend/test/aide/navigateur.mjs` sert
  `cyber-gouvernance_V4/` **tel quel** et relaie `/api/**` vers l'instance Fastify réelle —
  c'est le montage à reprendre plutôt qu'à réinventer.
- **Tests headless** : Node + Playwright global — **relevez son chemin plutôt que de le
  recopier** : `npm root -g` (aujourd'hui `/usr/lib/node_modules`, et non
  `/opt/node22/lib/node_modules` qu'annonçait ce paragraphe — constat **Q-288**). Chromium à
  `/opt/pw-browsers`. ⚠️ **Le banc, lui, ne recopie aucun chemin : il DÉCOUVRE** — c'est le
  remède du constat Q-80, et c'est pour cela que rien n'a cassé pendant que ce fichier disait
  faux. Les tests navigateur **vivent désormais dans le dépôt**
  (`backend/test/navigateur/`, joués par `npm test`) : la porte S2 a constaté qu'il n'en
  existait aucun alors que ce paragraphe les impose depuis le début du projet, et que
  **six de ses constats, dont les trois bloquants, ne se voient que là**. Les scripts
  d'exploration et les captures restent dans le scratchpad.
  Toujours vérifier `pageerror`/`console` (objectif : 0 erreur) et prendre des captures pour validation visuelle.
- **Éprouver sous la CSP réelle.** L'application a été livrée un temps sans fonctionner dans
  sa configuration de déploiement : soixante-quatre gestionnaires en ligne étaient bloqués
  par la politique de sécurité de contenu du vhost, et aucun test ne l'avait vu. La règle
  qui en découle : la politique se **lit dans `backend/deploy/apache/cyber-grc.conf`**, elle
  ne se recopie pas à la main.
- ⚠️ **Sur SRV-Infra, le banc a besoin d'une ligne de plus, et ce n'est pas un détail.**
  Les rôles PostgreSQL y portent les secrets engendrés par `deploy/install.sh`, pas le
  mot de passe `dev` que ce paragraphe suppose — et `db/dev/preparer_base_dev.sh` ne
  doit **pas** être joué ici : il les ramènerait à `dev` et casserait le service
  installé. Les secrets sont recopiés dans `~/.grc-essais.env` (0600, hors dépôt) :

      cd backend && set -a && source ~/.grc-essais.env && set +a && npm test

  Sans cela, `test/auth/` échoue sur `password authentication failed for user
  "grc_app"` et les familles navigateur ne trouvent pas Chromium — deux symptômes qui
  n'ont rien à voir avec le code, et qui coûtent une demi-heure chacun (constat Q-81).
- **Banc d'essai serveur** : depuis `backend/`, `npm test` (base, API, reprise, navigateur),
  `npm run verifier-types`, `npm audit --omit=dev`. Chaque fichier de test monte une base
  neuve en appelant le vrai `db/migrate.mjs`.
- Pas de données de démo pré-chargées (interdit par le brief) : les tests injectent leurs propres données.

### Skill UI/UX (aide à la décision design)

Skill projet **`ui-ux-pro-max`** installée dans `.claude/skills/ui-ux-pro-max/` (v2.13.0, MIT,
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)).
Base de connaissances **locale** (CSV) interrogeable par un moteur BM25 en Python — aucun réseau,
aucune dépendance externe, cohérent avec la contrainte « full frontend / rien ne sort de la machine ».

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux   # 119 règles UX/a11y
```

Domaines utiles ici : `ux` (accessibilité, tableaux denses, formulaires, navigation), `chart`
(radars/sparklines), `typography`, `color`, `icons`. **Pas de `--stack`** : aucun des 22 stacks ne
correspond au vanilla JS de l'app (le plus proche, `html-tailwind`, est spécifique à Tailwind).

**Garde-fou** : les tokens de `css/tokens.css` et la charte Dedienne (orange `#E9631B` / bleu
`#2059A6`, sémantique stricte des statuts) restent la référence — la skill sert à *arbitrer*
(contraste, cibles tactiles, densité, lisibilité des tableaux), pas à imposer une palette.
Ne pas utiliser `--design-system` pour regénérer une identité visuelle (décision déjà validée, cf. §2).

## 6. Git / méthode de travail

- Travailler **par itérations** : une fonctionnalité = une livraison testable, commit + push, montrer le résultat.
- **Mettre à jour `CHANGELOG.md`** à chaque itération et `DATA_MODEL.md` si le schéma change.
- Commits en français, descriptifs. Pousser sur **`main`** (consigne utilisateur).
  ⚠️ Plusieurs sessions peuvent travailler en parallèle sur ce dépôt : **faire
  `git pull --rebase origin main` avant de pousser**, sinon la poussée est rejetée.
- Ne PAS ouvrir de PR sans demande explicite.

## 7. État d'avancement du produit NAVIGATEUR (historique — voir docs/PLAN.md pour le détail)

> ⚠️ **Section historique.** Elle recense les chantiers du produit 100 % navigateur, dans
> l'ordre où ils ont été livrés. Elle reste utile — c'est là qu'on retrouve *pourquoi* un
> module est fait comme il est — mais elle **ne décrit pas l'état actuel du produit** :
> la persistance a basculé sur le serveur au lot L2. Ce qui, ci-dessous, concerne le
> stockage local (IndexedDB, points de restauration, coffre opt-in, rappel d'export, quota)
> a été **retiré ou remplacé** ; voir §4 et `docs/DATA_MODEL.md` §1. L'état du chantier en
> cours est au **§8**.

**Fait** : décompression • charte Dedienne + logo • retrait emojis + icônes SVG •
**Sauvegarde complète** (IndexedDB + historique versionné + migration ; enveloppe grc-backup ;
export chiffré PBKDF2 600k ; import validé Remplacer/Fusionner ; rappel d'export ;
protection opt-in + chiffrement au repos) • Phase 0 audit • **Design system** (tokens,
tooltip ⓘ, fil d'Ariane, responsive, a11y) • **Référentiels 4a/4b** (schéma v3
`evaluations`/`mesures` ; référentiel **ANSSI 42 mesures** ; auto-évaluation + **radar de
maturité** SVG ; pivot **« Mesure de sécurité »** + propagation « zéro double saisie »).

**Fait (suite)** : Référentiels **4c** (ISO 27001, NIS2, DORA, **AirCyber réel 234 q** + **import
CSV des réponses**) + **couverture croisée** + **génération SoA** ; **Registre des incidents**
(v4, déclarations NIS2/RGPD) ; **Gestion documentaire** (v5, politiques + alertes de revue +
canevas) ; **Registre RGPD** (v6, traitements art. 30, mesures reliées au pivot, registre
imprimable) ; **Tableau de bord** enrichi (cockpit GRC 360°, graphes SVG maison) ;
**Durcissement** (escapeHtml partagé + IDs anti-collision).

**Fait (Chantier 8 — améliorations modules)** : **Matrice EBIOS** export image PNG/SVG (SVG
autonome → PNG via canvas, sans dépendance) + alerte cohérence brut/résiduel ; **Fiches réflexes
de crise imprimables** (`/crise-fiches` : cartes d'action par rôle + réflexes communs + contacts
d'urgence) ; **Risque fournisseur & chaîne d'appro NIS2/DORA** (criticité × accès → niveau
inhérent + checklist exigences + couverture). Durcissement XSS des modules Crise et Prestataires.

**Fait (Chantier 9 — durcissement)** : **XSS soldé sur tous les modules de saisie** (escapeHtml
généralisé : exigences, risques, crise, prestataires, actifs, clients, bia, pra_scenarios/tests/mco,
audits — vues d'impression et matrice RACI incluses ; correctifs injection HTML des rapports d'audit
et échappements incomplets ; tests Playwright par entité). IDs anti-collision généralisés.

**Fait (Chantier 9 — suite)** : **Cascade/orphelins `tests_pra.scenario_id`** — suppression d'un
scénario PCA/PRA en cascade sur ses tests (confirmation indiquant le nombre impacté) ; détection +
nettoyage des tests orphelins hérités (badge « Orphelin » + bandeau) ; helpers DataStore
`getTestsByScenario`/`getOrphanTests`/`deleteOrphanTests`.

**Fait (Chantier 3 — Correspondances inter-référentiels)** : module **`/mapping`** (« Correspondances »)
— **catalogue pré-rempli** de 28 groupes d'équivalences (ANSSI↔ISO 27001↔NIS2↔DORA) **éditable**
(créer/modifier/masquer/réinitialiser, surcouche `data.mappings`, schéma **v7**) ; **propagation**
(relier tout un groupe à une mesure — préserve « non évalué » — ou appliquer un statut d'un coup) ;
badges de clause colorés selon l'évaluation + cartographie par référentiel ; liens croisés
Référentiels/Couverture. Tests Playwright (0 erreur, round-trip v7 + compat v6).

**Fait (Chantier 7 — Historisation des tendances)** : **courbes d'évolution** sur le tableau de bord
(section « Évolution dans le temps ») — **instantané global capturé une fois par jour** (`history`,
schéma **v8**, dédup par date, conservation 180 j) ; 6 sparklines SVG maison (conformité, maturité,
exposition résiduelle, risques critiques, actions en retard, avancement) avec **variation colorée**
selon le sens « meilleur » ; bouton « Effacer l'historique ». Tests Playwright (0 erreur, round-trip v8).

**Fait (Chantier 7 — Suivi & échéances + comparatif → chantier 7 COMPLET)** : sur le tableau de bord,
**liste des incidents récents** (5 derniers, badge « À déclarer » NIS2/RGPD), **documents à réviser**
(revue échue/proche ou statut « à réviser »/« obsolète », compteur d'alerte) et **conformité
comparative par donneur d'ordre** (barres triées interne + clients). Listes cliquables. Tests Playwright.

**Fait (Chantier 9 — Quota de stockage)** : détection de la **saturation du stockage** (plus d'échec
silencieux) — `DataStore.flush()` renvoie `{ ok, quota }`, observateur `onQuotaExceeded` → **bandeau
d'alerte** dédié ; l'**import Excel** force un enregistrement et prévient si le stockage est plein.
Tests Playwright (simulation de quota).

**Fait (Chantier 9 — Factorisation helpers UI)** : nouveau module partagé **`js/core/ui.js`**
(`window.UI`, chargé après `help.js`). **`UI.wireBulkDelete({remove,confirm,toast,onDone})`** remplace
la logique de **suppression groupée recopiée dans 8 modules** (Exigences, Risques, Actions, Crise, BIA,
Tests PRA, MCO, Prestataires — ~250 lignes dédupliquées). **`UI.badge` / `UI.mappedBadge`** factorisent
les **badges de statut** (`<span class="status …">`) — appliqués à Incidents & Documents.
**`UI.wireDelete({button,confirm,remove,toast,redirect})`** factorise la **suppression depuis la fiche**
(confirm → delete → toast → navigation) recopiée dans **16 modules / 17 boutons** (message statique ou
dynamique — avertissements de cascade préservés ; ids `deleteBtn`/`delBtn`/`delScenarioBtn`).
**`UI.genId(prefix)`** centralise la convention d'id anti-collision `"<PRÉFIXE>-<ts>-<aléa>"`
(23 sites / 17 modules — dette « collisions » soldée ; `updatedAt` non touchés). La **collecte de
formulaire** reste en ligne à dessein (hétérogène + locale). Aucun changement fonctionnel/schéma ;
échappement XSS conservé. Tests Playwright (bulk 20 + smoke 8 + suppression fiche 16 + genId 6, 0 erreur).

**Fait (Chantier 2 — Tooltips pédagogiques)** : **25 notes `Help.tip(ⓘ)`** ajoutées sur les modules
techniques sans aucune aide — **Risques** (EBIOS F/G/M + méthode FxGxM), **BIA** (criticité, RTO, RPO),
**Actifs** (CIA/DICP), **Matrice EBIOS**, **Scénarios PCA/PRA** (PCA vs PRA), **Audits** (typologie des
constats), **MCO**, **Tests PRA** (type d'exercice), **Exigences** (statut de conformité) ;
Conformité/SoA déjà couvert. Icônes accessibles, aucune donnée/schéma touché. Tests Playwright
(présence sur 11 vues, contenu des bulles, ouverture au clic sans navigation ; 0 erreur). i18n
**écartée** (app monolingue, décision utilisateur).

**Fait (AirCyber — radar par domaines CL)** : le **profil de maturité par domaine** d'AirCyber est
construit sur les **domaines de classification CL0–CL6 nommés** (axes = code + nom, étiquettes
multi-lignes, viewBox élargie pour AirCyber seul) au lieu des chapitres du questionnaire.
`computeClAxes()`/`radarAxesFor()` dans `referentiels.js`, activés par la présence de `clLabels` ;
mêmes règles de moyenne que `computeScores`. Les 78 questions sans CL sont hors radar (note
explicative sous le graphique) mais comptées partout ailleurs. Autres référentiels inchangés.
Tests Playwright (22 assertions : axes nommés liste+fiche, géométrie exacte, exclusion sans-CL,
refresh temps réel, non-régression ANSSI ; 0 erreur).

**Fait (AirCyber — radar par niveau de label + score Oui/Non sans CMMI)** : radar de la fiche
**filtrable Global/Bronze/Argent/Or** (`radarNiveau`, tracé + bouton actif teintés par niveau,
note « n questions », vue conservée au refresh, retour à Global à l'ouverture) ; **AirCyber scoré
sans CMMI** (`scoring: "conformite"` dans `ref_aircyber.js`) — réponses **Oui/Non/N-A** (mêmes
valeurs `statut`, « partiellement » hérité affiché mais non proposé), colonne Maturité supprimée,
**score = Oui ÷ applicables** (N/A exclues, non répondu = Non), KPIs/chapitres en %, axes radar =
taux de Oui, panneau « préparation au label » rafraîchi en direct, `maturite` stockée préservée
mais ignorée (saisie et import CSV ne la touchent plus). SoA sans colonne « Mat. » ; dashboard :
moyenne CMMI hors AirCyber, barre AirCyber en % « score Oui/Non ». Autres référentiels inchangés.
Tests Playwright (64 assertions ; 0 erreur).

**Fait (Chantier Cartographie — dépendances entre actifs, schéma v9)** : module **`/cartographie`**
(entrée menu « Cartographie » après « Actifs critiques ») — **graphe SVG maison** des actifs et de leurs
**dépendances typées** (`dep`/`hosted`/`flux`/`backup`), édité depuis la **fiche de chaque actif** (champ
`actif.dependances[]`, rétrocompatible). **Layout en couches** (métier en haut → socle en bas, robuste aux
cycles). **Analyse d'impact Niveau 3** : clic → **rayon d'impact** par propagation transitive (actifs +
processus BIA en aval, dont critiques, RTO) + **détection SPOF** (≥ 2 processus critiques dépendants) ; le
lien **sauvegardé par ne propage pas** une panne (dépendances typées). **Filtres** (type, criticité,
recherche, processus, isolés) ; **export PNG/SVG** (même recette que la matrice). Cascade `deleteActif`
étendue (purge des liens entrants). Tests Playwright (rendu, SPOF exact, impact, filtres, export,
round-trip v9, cascade, édition fiche ; 0 erreur).

**Fait (Chantier MCO — suivi d'action planifiée, schéma v10)** : refonte des champs du module
**`/mco`** (Actions Préalables) — de l'ancien modèle « vérification récurrente » (`etat` OK/KO, `date`,
`notes`) vers un **modèle de suivi d'action planifiée** : **Définition**, **Description**, **Responsable**,
**Priorité**, **Fréquence**, **Statut** (À planifier/En cours/Réalisée/Annulée), **Date programmée**,
**Date de réalisation**, **Date de clôture**, **Avancement %** (curseur), **Commentaire**. Indicateur
**« en retard »** *dérivé* (`PraMcoModule.isEnRetard`, source unique **réutilisée par le dashboard** :
tuile « N en retard » / « Planning tenu » au lieu du décompte OK/KO) → badge liste + bandeau + entête de
fiche. Automatismes (statut « Réalisée » → 100 % + dates du jour ; curseur synchronisé). **Migration
transparente v9→v10** dans `normalize` (OK→Réalisée/100 %, KO→En cours, date→dateReelle, notes→commentaire,
purge des clés obsolètes ; sans perte de donnée). Correctif CSS `.status` (`white-space: nowrap`).
Tests Playwright (44 assertions : migration backup v9, round-trip v10, CRUD UI, auto-complétion, retard,
dashboard ; 0 erreur).

**Fait (Chantier Échéancier — vue consolidée des échéances)** : nouveau module **`/echeances`**
(« Échéancier », menu *Pilotage* après « Synthèse Direction ») — **vue transversale** qui agrège en un
seul endroit toutes les obligations datées du logiciel (plan d'actions, MCO, revues documentaires,
déclarations d'incidents NIS2/RGPD = détection + 72 h, audits planifiés, revues de direction à venir),
**regroupées par urgence** (En retard / Aujourd'hui / Cette semaine / Ce mois-ci / Plus tard / Sans date),
compteurs, filtres (type, « urgents ≤ 7 j », recherche), **lignes cliquables vers la fiche d'origine**,
impression. **Badge compteur d'échéances en retard** sur l'entrée de menu, **visible depuis toute page**
(rafraîchi via `updateActiveNav`). **Aucun changement de schéma** : nouveau service **lecture seule**
`js/services/echeances.js` (`window.Echeances.collect/counts/overdueCount`) qui dérive les échéances des
seules dates existantes (règles alignées sur MCO/documents/incidents). Tests Playwright (34 assertions :
agrégation + exclusions, délai incident +72 h, compteurs/regroupement, badge, filtres, navigation ; 0 erreur).

**Fait (Chantier Échéancier — extensions)** : **vue calendrier mensuel** (bascule Liste/Calendrier,
pastilles colorées par urgence sur chaque jour, navigation de mois, jour courant mis en évidence),
**export Excel** (`buildRows` → SheetJS) et **export Agenda `.ICS`** (`buildICS`, un événement journée
par échéance datée, importable Outlook/Google), et **panneau « Prochaines échéances » sur le tableau de
bord** (section *Suivi & échéances*, top 7 tous modules + badge « N en retard », réutilise `Echeances`).
Tests Playwright (28 assertions ; 0 erreur ; non-régression Échéancier 34 + MCO 44).

**Fait (Chantier Référentiels ↔ Plan d'actions — plan d'action sur le pivot « Mesure »)** : comblement
du chaînon manquant entre l'évaluation d'un référentiel et le plan d'actions. Nouveau lien **optionnel**
`action.mesure_id` (rétrocompatible, sans changement de schéma) → une action peut être rattachée
**directement à une mesure de sécurité** (le pivot), et vaut pour toutes les exigences qu'elle couvre.
**Bloc « Plan d'action » sur la fiche Mesure** (`/mesures/:id` : liste + « Planifier une action »
intitulé/priorité/responsable/échéance). **Chaîne visible côté exigence** (le Détail d'une exigence reliée
affiche le plan d'action de la mesure, en plus du bloc « Actions correctives » par-exigence conservé).
**Traçabilité** dans le plan d'actions (colonne + fiche : « Mesure : … »). `getActionsByMesure` ;
`deleteMesure` **délie** les actions (`mesure_id → null`, conservées), comme les évaluations. Tests
Playwright (20 assertions ; 0 erreur ; non-régression MCO 44 + Échéancier 34 + extensions 28).

**Fait (Chantier Personnel — annuaire réutilisé partout, schéma v11, Phase 1)** : nouveau module
**`/personnel`** (« Personnel », menu après « Donneurs d'ordre ») — annuaire CRUD des personnes/rôles
(nom, fonction, service, email, téléphone, notes ; entité **`personnes`**, v11). **Autocomplétion partout** :
un `<datalist id="personnes-list">` partagé (peuplé par `UI.refreshPersonnesDatalist()` à chaque navigation,
appelé depuis `updateActiveNav`) branche l'annuaire sur **tous les champs « Responsable »/« Propriétaire »/
« Auditeur »** (Actions, Mesures, Exigences, Actifs, BIA, MCO, RGPD, Risques, Documents, Audits). **Choix
« annuaire + autocomplétion » (pas de clé étrangère)** : les entités **stockent toujours le nom en texte**
→ rétrocompatible, saisie libre conservée, **rien de cassé**. **Fiche personne = « où c'est affecté »**
(agrégation par correspondance de nom, lecture seule). **Suppression non destructive** (retire la suggestion,
conserve les noms saisis). Tests Playwright (17 assertions ; migration v10→v11 + round-trip ; 0 erreur ;
non-régression statut création 12 + Mesure↔action 20 + MCO 44 + Échéancier 34 + extensions 28).

**Fait (Chantier Personnel — Phase 2 : multi-personnes + Cellule de crise)** : **champ multi-personnes
réutilisable** (`UI.multiPersonHtml`/`wireMultiPerson`/`getMultiPerson`, chips + autocomplétion annuaire,
saisie libre acceptée, stockage « un nom par ligne » rétrocompatible) appliqué aux **Participants d'une
revue de direction**. **Lien Cellule de crise ↔ annuaire** : champ Nom autocomplété + **pré-remplissage
téléphone/email** depuis l'annuaire (sans écraser une valeur saisie). **Affectations** de la fiche personne
enrichies (appartenance à la Cellule de crise avec rôle, participation aux revues). Tests Playwright
(16 assertions ; 0 erreur ; non-régression Personnel 17 + statut 12 + Mesure↔action 20 + MCO 44 +
Échéancier 34 + extensions 28).

**Fait (Chantier Référentiels — plusieurs mesures par exigence, schéma v12)** : le lien exigence→mesure
passe de la **référence unique** `evaluation.mesure_id` au **tableau** `evaluation.mesure_ids[]` — une
exigence (typiquement une question AirCyber) peut être couverte par **plusieurs mesures**. UI référentiel :
`<select>` unique → **chips** (mesures liées retirables) + « Ajouter » / « Nouvelle », plan d'action de
chaque mesure affiché. **Propagation « au plus défavorable »** (`propagateMesure`→`aggregateFromMesures` :
statut le plus faible — conforme seulement si toutes le sont —, maturité la plus basse ; N/A neutre ;
non-évalué ignoré). Helpers `addMesureToEvaluation`/`removeMesureFromEvaluation` (ajout sans écraser,
dédoublonné) ; `getEvaluationsByMesure`/`deleteMesure`/Couverture/SoA/Correspondances adaptés. **Migration
transparente v11→v12** (valeur unique → tableau à 1 élément). Tests Playwright (16 assertions ; 0 erreur ;
non-régression Mesure↔action 20 + Personnel 17+16 + statut 12 + MCO 44 + Échéancier 34 + extensions 28).

---

## 8. CHANTIER EN COURS — Édition Groupe client/serveur

> **Plan de référence : [`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md)** — cadrage clos,
> validé avec l'utilisateur et le client. **Ne pas re-débattre, appliquer.**
> **Conduite du chantier : [`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md)** — vagues,
> propriété des fichiers, portes de sécurité, définition de « terminé ».
> État détaillé des lots : **[`backend/README.md`](backend/README.md) §8**.

### Contexte client (rappel court)

Groupe industriel, **20+ filiales** (acquisitions régulières, France et étranger).
L'outil devient le support **officiel** de leur gouvernance cyber : il servira de
preuve en audit ISO 27001. Déploiement **sur site**, VM Debian 13 sous Proxmox,
accès par VPN uniquement, **sans conteneur** (contrainte client), authentification
sur l'**Active Directory** du groupe.

### Décisions structurantes du chantier (validées)

| Sujet | Décision |
|---|---|
| Cible | Client/serveur. **La version 100 % locale est abandonnée.** |
| Backend | Node.js 22 + TypeScript (réutilise la logique métier déjà en JS) |
| Base | PostgreSQL, relationnel, cloisonnement par **Row Level Security** |
| Cloisonnement | **Par filiale**, strict. Plus une **vision Groupe** consolidée pour la direction |
| Droits | **3 axes** : périmètre × profil métier × domaine. Pilotés par groupes AD. **Export = permission distincte** |
| Principe directeur | **La façade `DataStore` synchrone est préservée** : les modules frontend ne sont PAS réécrits (voir `PLAN_SERVEUR` §1.3) |
| Concurrence | **Verrouillage optimiste par enregistrement** — le risque n°1 du projet (P1) |
| Langues | FR + EN obligatoires, ES souhaitable |
| Import | **Généralisé à tous les modules** (critère décisif client) |
| Pièces jointes | Intégrées, chaîne antimalware ClamAV, empreinte SHA-256 |
| Journal d'audit | **Inaltérable** (ajout seul, chaîné par empreinte), rétention 3 ans |

### Pièges à ne pas rouvrir

- **`mesures` doit être scindé** en `mesure_catalogue` (niveau Groupe : la définition
  du contrôle) et `mesure_mise_en_oeuvre` (niveau Filiale : statut, maturité,
  responsable). Ne pas reproduire l'entité unique actuelle — sinon les filiales ne
  sont plus comparables et la vision Groupe perd son sens.
- **Activation d'un référentiel par filiale ≠ « non applicable » par exigence.** Les
  deux mécanismes coexistent. Voir `PLAN_SERVEUR` §2.2.
- **JSONB uniquement** pour les documents figés (grille et constats d'audit, étapes
  RACI des scénarios PRA, `supplyChain` des prestataires, `metrics` de l'historique).
  Tout le reste est relationnel, avec de vraies contraintes.
- **Identifiants texte conservés** (`"RISK-<ts>-<alea>"`), pas d'UUID : c'est ce qui
  rend l'import d'un export `grc-backup` exact au round-trip. Ce qui est normatif est
  une **propriété** — au moins 52 bits d'aléa cryptographique —, pas une forme unique :
  le produit en fabrique à **cinq endroits, dans trois langages** (`CONVENTIONS.md` §2).
  **Un seul générateur aléatoire par langage**, jamais de clone local.
- **Le périmètre de session vient du serveur**, jamais d'une valeur transmise par le
  navigateur. Tenu par la **forme** : `resoudre()` ne prend aucun argument, et
  `js/core/api.js` n'expose aucun paramètre de filiale. Les clés `cyber-context` et
  `cyber-vault` du `localStorage` sont purgées au démarrage **et à la fermeture**
  (`js/core/session.js`). Ne pas confondre deux choses longtemps réunies sous une seule
  étiquette « Périmètre Actif » : le **périmètre**, qui vient du serveur et s'affiche en
  lecture seule, et le **filtre « donneur d'ordre »**, simple confort d'affichage interne
  à la filiale — il vit désormais en mémoire (`window.FiltreDonneurOrdre`, `js/app.js`) et
  ne survit plus d'une session à l'autre.
- **Tout contrôle que PostgreSQL applique hors des politiques porte `filiale_id`** —
  clé étrangère, unicité, exclusion. La RLS ne les voit pas : une clé simple est
  satisfaite par une ligne **invisible** de la filiale voisine, et une unicité sans
  `filiale_id` laisse une filiale occuper l'identifiant d'une autre. La porte S1 l'a
  élargie en deux temps : aux clés étrangères d'abord (`CONVENTIONS.md` §17.1), aux
  unicités ensuite (§19.1).
- **Un garde-fou que rien n'appelle est un commentaire.** Tout contrôle automatique du
  schéma se branche sur `f_verifier_schema()`, le point d'appel unique appelé par
  `migrate.mjs` et `install.sh` — et il s'y branche **en respectant la convention
  d'écriture** (`f_verifier_<x>()`, sans argument, rendant `(objet, anomalie, detail)`),
  pas en s'ajoutant à une liste. Ne jamais réintroduire de liste écrite à la main
  (`CONVENTIONS.md` §18.4, §19.4 et §19.5).

### Avancement au 04/09/2026 (clôture de la vague 5)

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** — squelette Node/TS, config validée au démarrage, pool PostgreSQL, serveur + point de santé, unité systemd durcie, vhost Apache + durcissement de portée serveur, `install.sh` idempotent, `backend/README.md` |
| **L1 — Schéma relationnel** | ✅ **livré** (vague 1), corrigé au fil de la porte **S1** — une cinquantaine de tables (compte rejoué dans `backend/README.md` §8), RLS activée **et forcée** partout, propriétaire compris ; clés étrangères et unicités **composites** `(id, filiale_id)` ; traçabilité imposée à l'insertion sur **toutes** les tables qui portent `cree_par`, et **vérifiée** par un garde-fou ; garde-fous du schéma branchés sur `migrate.mjs` **et** `install.sh` via le point d'appel unique `f_verifier_schema()`, et **consignés dans un registre** depuis la migration `005` — un contrôle qui cesse d'être découvert ne disparaît plus en silence |
| **L2 — API et bascule de la persistance** | ⚠️ **livré** (vague 2) **mais NON VALIDÉ** — porte **S2** franchie au 4ᵉ passage, puis **refusée aux 5ᵉ, 6ᵉ, 7ᵉ, 8ᵉ et 9ᵉ** (bloquant aux 6ᵉ et 7ᵉ ; les 8ᵉ et 9ᵉ sans bloquant). **La porte ne se rejoue plus jusqu'au vert** : le tri du §0 bis a pris le relais le 03/09. Corrigé au fil de la porte — couche d'accès générique par entité, **verrouillage optimiste** (risque P1), diagnostic d'`UPDATE 0` en cinq verdicts, chargement du jeu de données d'une filiale, route de reprise transactionnelle, **bascule de `datastore.js` / `persistence.js`** avec la façade synchrone **intacte** (131 membres avant, 131 après, listes identiques), session provisoire **fail-closed** hors développement |
| **L3 — Authentification AD** · **L5 — Journal** | ✅ **livrés** (vague 3, 03–04/09/2026) — LDAPS écrit à la main, sept profils mesurés contre un AD réel, appartenance indirecte par groupe imbriqué ; journal en ajout seul, chaîné, **16 actions sur 20 émises**, lecture cloisonnée (condition E6 fermée). Porte **S4** jouée et refusée, dix constats, la classe dure et cinq majeurs corrigés le jour même |
| **L4 — Multi-filiales** | ✅ **livré** (04/09/2026, vague 4) — sélecteur de filiale active, `GET /api/filiales`, migration `009`. Le client envoie un **choix**, le serveur résout un **périmètre** depuis `session_filiales` relu en base ; la filiale active est revérifiée **à chaque requête**. La **vision Groupe consolidée** est livrée le 04/09 (`GET /api/consolidation`, vague 5) : aucune de ses requêtes ne nomme de filiale, c'est la RLS qui borne, et un domaine hors des droits rend **`null`, jamais zéro**. La **création de filiale** aussi (`POST /api/filiales`) — elle synchronise les groupes d'annuaire dans la même transaction et rend la liste de ceux à créer dans l'AD. ⚠️ **Reste dehors** : `referentiels_actifs` n'est écrit ni lu par personne (constat **Q-150**) |
| **L6 — Pièces jointes** | ✅ **livré** (04/09/2026, vague 4) — les **huit contrôles** du `PLAN_SERVEUR` §1.6 dans un ordre figé, ClamAV réel, SHA-256 sur ce qui est écrit, quarantaine, ré-analyse périodique et son timer. `zip.ts` ouvre le conteneur OOXML : un `.docm` renommé est refusé **par ce que Word y a écrit** |
| **L7 — Import généralisé** | ✅ **livré** (04/09/2026, vague 5) — un moteur, vingt configurations dérivées de `decrire()` ; transactionnel (morsure : 199 lignes écrites, zéro subsiste), idempotent **par le fichier**, cloisonné, journalisé. CSV **et** XLSX, format lu à la signature binaire. ⚠️ Il **crée** ; il ne met pas à jour et ne supprime pas — trois motifs écrits |
| **L8 — Circuit d'approbation** | ✅ **livré** (04/09/2026, vague 5) — documents, acceptation des risques résiduels, rapports d'audit. `empreinte_objet` fait périmer une approbation quand l'objet change. **L'irréversibilité n'est pas réécrite en TypeScript** : elle vit dans la base, et la morsure va la chercher là |
| **L9 — Identité par filiale** | ✅ **livré** (04/09/2026, vague 5) — raison sociale et logo de la filiale active, écrans, impressions et exports ; zéro marque en dur ; PNG/JPEG, jamais SVG. ⚠️ **Les coordonnées ne sont pas livrées** : aucune route ne les rend (constat **Q-160**) |
| **L10 — Internationalisation** | ✅ **livré** (05/09/2026, vague 6) |
| **L11 — Traduction des catalogues** | ✅ **livré** (05/09/2026, vague 7) — ISO 27002 à 200 chaînes sur 201 |
| **L12 — Notifications** | ✅ **livré** (05/09/2026, vague 6) |
| **L13 — Cycle de vie** | ✅ **livré** (05/09/2026, vague 6) |
| **L14 — Documentation** | ✅ **livré** (05/09/2026, vague 7) |
| **L15 — Durcissement final** | 🟡 **en cours** (vague 8) — **porte S8 refusée HUIT fois** (la dernière le 11/09/2026), c'est la condition de mise en service |
| **L16 — Système documentaire** | 🟡 **quatre actions sur cinq livrées** (vague 9) — D2 le 07/09 (les pièces suivent leur porteur), **D1, D4 et D5 le 08/09** (version en vigueur, référence externe assumée, publication soumise au circuit), **plus la vérification d'intégrité** hors des cinq actions (migration `020` : l'empreinte s'affiche et elle est *rapprochée* du fichier, à la demande et par balayage — `db/CONVENTIONS.md` §31.5). **Reste D3, la recherche, pas avant S8.** `docs/PLAN_EXECUTION.md` §3 |
| **L17 — Prise en main** | ⬜ **planifié** (`docs/PLAN_PRODUIT.md`) — recherche globale, palette `Ctrl+K`, écran de démarrage par rôle, regroupement du menu, Kanban. ⚠️ **Pas avant S7 et S8** : il ouvre de la surface neuve |
| **L18 — Installation en une commande** | ✅ **livré — 18.7 excepté.** `--assistant` (six questions, profil découverte, compte de secours dont l'empreinte est calculée par `dist/auth/secours.js`), `--diagnostic` (**quatorze** sujets, code 0/1/2, ne modifie rien — douze à l'origine, quatorze depuis Q-290), `docs/INSTALLER.md` (cinq commandes), **et le bandeau 18.2 b le 09/09/2026** — permanent, non masquable, imprimé avec les fiches. ⚠️ Les six premiers sous-lots ne touchaient **ni `src/` ni le schéma** — c'est ce qui les a autorisés avant les portes ; **18.2 b, lui, touche `src/` et la SPA : à déclarer au 7ᵉ passage de S8**. Reste **18.7** (assistant de premier démarrage), après les portes |
| **L18 bis — Jeu de découverte** | ⬜ **autorisé le 08/09/2026** sous **cinq conditions constitutives** (marque **dans la donnée**, geste volontaire, refus si données réelles, purge par le déclencheur `017`, interdit hors découverte). Il écrit en base : **après les portes** |
| **L19 → L26** | ⬜ **planifiés** (`docs/PLAN_PRODUIT.md`) — preuve et attestation, réglementaire opérationnel, tiers et DORA, ouverture technique, collecte automatique et CCM, campagnes descendantes, EBIOS RM, catalogues ouverts |
| **L27 — Assistance IA** | ⬜ **arbitré le 08/09/2026 (A1)** — modèle **local par défaut** ; un fournisseur **externe de confiance** reste possible sous **six barrières**, dont l'avertissement n'est que la sixième. ⚠️ La première est que `IPAddressDeny=any` **ferme la sortie réseau** tant que l'exploitant ne l'ouvre pas à la main : *une barrière physique, pas une promesse*. Activation **par filiale**, jamais pour le groupe entier. L'IA **propose**, un humain **décide** — aucun des cinq usages n'écrit sans validation. Porte **S16** |
| **L28 — Portail fournisseur** | ⬜ **validé le 08/09/2026 (A3)** — accès par lien signé daté et révocable, **sans compte** ; dépôt de preuve par la chaîne L6 **sans variante simplifiée** ; vhost et limiteur propres ; attestation rendue au fournisseur. ⚠️ **Premier composant du produit exposé hors VPN** : il ne se joue **ni avant S8, ni avec un autre lot**, et sa porte **S15 est la plus exigeante du plan** — *en cas de doute, on ne livre pas*. L'export/réimport de L21.2 **reste la voie de repli permanente** |

Livré aussi en vague 1, hors périmètre strict de L1 : **reprise des exports
`grc-backup`** (`backend/src/reprise/**`, portage serveur des migrations v1 → v12,
module pur) et **base de développement** (`db/dev/preparer_base_dev.sh`).

**État des portes — à lire, pas à deviner.** Les lots L1 et L2 ont été soumis à leur
porte de sécurité six et **huit** fois, chaque passage étant mené par un auditeur qui
n'avait écrit aucune des lignes examinées. **Le verdict de chaque passage vit dans le
journal des portes de [`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md) §7**, avec le
rapport correspondant dans `docs/securite/` — c'est la source, et la seule. Au
02/09/2026 il porte **S1 « CONFIRMÉE FRANCHIE » (6ᵉ passage)** et **S2 ❌ « refusée »
(8ᵉ passage — 0 bloquant, 4 majeurs, 3 mineurs, contrôles S13 et S17 en échec)**, après
un franchissement au 4ᵉ que chaque fermeture de constats a rouvert. Les arbitrages issus de
ces passages sont figés dans `backend/db/CONVENTIONS.md` **§2, §17 à §24** : les lire
avant de toucher au schéma évite de rouvrir ce qui vient d'être fermé.

⚠️ **Ce que les 5ᵉ à 8ᵉ passages enseignent, et qui vaut pour toutes les portes à
venir.** Au 5ᵉ, le défaut qui a fait échouer le lot n'était **dans aucun fichier** : un
désaccord **entre** le vhost et le serveur, dont aucun n'avait tort seul. Au 6ᵉ, le
bloquant visait **un correctif que la porte précédente avait accepté** — il avait échangé
un doublon silencieux contre une **destruction silencieuse**, parce qu'une **même
formulation** servait deux couches : vraie pour la reprise (« rechargez »), destructrice
pour une création bloquée, où recharger jette la saisie. Au 7ᵉ, **encore** un correctif
accepté au passage précédent : la liste blanche du vhost rendait **403 sur `/`**, et
l'application était injoignable à son URL d'entrée — trouvé parce que l'auditeur a
**installé Apache**, ce que six passages avaient consigné comme impossible sans le
tenter. Au 8ᵉ, aucun bloquant — mais deux contrôles en échec, dont un qui affirmait une
barrière que la mesure a démentie. Huit corollaires :

- **Un banc vert mesure ce qu'il regarde, jamais ce qu'il ne regarde pas.** Le cœur du lot
  peut être juste — 81 sondes hostiles sans effet, 107/107 au cloisonnement — pendant que
  le produit détruit le travail de son utilisateur. C'est l'objet des contrôles **S17** et
  **S18**, et aucun contrôle de sécurité n'était en échec dans le cas du bloquant.
- **Un même mot, vrai à un endroit et faux à l'autre, voyage d'autant mieux qu'on a pris
  soin de n'en avoir qu'un.** Mutualiser un libellé n'est sûr que si les deux couches
  partagent la même *situation*, pas seulement le même *code d'erreur*.
- **Un correctif accepté n'est pas un correctif sûr.** La seule preuve qu'il tient est la
  **mutation** — le casser et vérifier que le banc rougit. C'est ainsi que 22 des 28
  constats ont été rejoués au 6ᵉ passage, et c'est ainsi qu'un constat annoncé « fermé et
  vérifié » s'est révélé ne pas l'être.
- **Une réserve écrite n'est pas une réserve traitée.** L'écrire est honnête ; s'y arrêter
  ne l'est plus dès l'instant où la lever coûte moins cher que la reconduire. Une réserve
  doit porter, comme un constat, un **propriétaire et une échéance** — sinon elle devient
  un alibi qui se transmet de passage en passage. Six passages ont reconduit « Apache
  n'est pas éprouvé » ; l'installer a pris une minute et sorti trois défauts.
- **Un contrôle doit interroger le chemin que l'utilisateur emprunte, pas celui qui est
  commode à tester.** La vérification prescrite interrogeait `/index.html` : elle est
  restée **au vert** pendant que `/` rendait 403. Un contrôle qui évite le chemin réel ne
  mesure pas le produit, il se mesure lui-même.
- **Un contrôle qui compare deux déclarations ne contrôle rien ; il faut envoyer et
  constater.** `install.sh` imprimait « ok » en comparant la borne du vhost à celle du
  serveur — alors que celle du vhost **n'agissait pas** sur le chemin mandaté. Il envoie
  désormais un corps hors borne et constate le refus.
- **« Vert » qualifie une révision, jamais un répertoire de travail.** Une quinzaine
  d'instantanés ont été figés « vérifiés et verts » en mesurant l'arbre ; l'un d'eux
  commitait un essai appelant une fonction restée non commitée, et **à cette révision il
  ne s'importait pas**. Le banc ne peut pas le voir : il s'exécute sur l'arbre, où les
  deux fichiers coexistent.
- **Une dépendance d'environnement non déclarée manquera chez quelqu'un d'autre.** Une
  famille entière d'essais tenait à une entrée `/etc/hosts` que rien ne posait : verte
  chez son auteur, **614 sur 628** sur une machine neuve. Le banc ne résout plus aucun
  nom, et un piège fait échouer toute tentative.

**Franchie ne veut pas dire sans réserve, et « corrigé » ne veut pas dire « rejoué ».**
Les constats restants vivent dans le **registre des constats ouverts** du même §7, chacun
avec un **propriétaire nommé, une échéance et un état**. Ce registre n'est ni recopié ni
résumé ici — deux listes des mêmes constats divergent, et la divergence est silencieuse.
Y lire la **colonne d'état**, qui distingue trois situations : *corrigé, en attente du
rejeu* ; *reporté par écrit* à un lot nommé ; *documenté sans être fermé*, quand fermer
coûterait plus cher que le défaut. Ce que le 5ᵉ passage a confirmé : **les constats
fermés depuis le 4ᵉ ont bien été soumis à la porte, et elle a refusé le lot pour un
défaut qu'aucun d'eux ne couvrait.** Un banc vert ne vaut pas un passage de porte. Le
registre existe parce que la vague 1 avait mesuré,
chiffré et écrit un défaut de générateur d'identifiants **sans l'attribuer à personne** :
il est ressorti deux vagues plus tard en **bloquant**, avec un import qui écrivait 223
lignes sur 250 *et annonçait le succès*. **Un constat chiffré et non attribué est un
constat perdu.**

### ▶ REPRENDRE ICI — **L0 à L14 sont construits ; L15, le durcissement final, est en cours.**

> ⚠️ **Réécrit le 05/09/2026.** Si vous lisez ailleurs « la vague 4 est le travail
> immédiat », « L5 reste à faire », « la couverture du journal est de 4 actions sur 20 »
> ou « aucun essai navigateur n'existe », c'est **périmé**. L'arbitrage de curseur vit au
> `docs/PLAN_EXECUTION.md` **§0 bis** et il prime ; l'état des lots et les verdicts se
> lisent au **§7**, seule source.

**Ce qui est construit, et qu'il ne faut pas refaire : les lots L0 à L14.** Le lot **L15 —
durcissement final — est EN COURS** (vague 8), et sa porte **S8 a été jouée six fois et
refusée à chaque passage** : la condition de mise en service **n'est pas remplie**. La
porte **S7 n'a jamais été jouée** et reste due. Le banc
est **entièrement vert** — le compte exact se relève en le jouant, il n'est pas recopié
ici (constat **Q-219**) —, `npm run verifier-types` est propre, et la recette
sert la révision courante (`install.sh --verifier-publication` → **81 fichiers servis
identiques au dépôt**).

**La porte S6 a été jouée le 05/09 et refusée** — douze constats, **Q-194 → Q-205**. Sous
le tri du §0 bis, **onze sont fermés et mordus** ; restent **Q-205 b** (un aperçu d'import
ne laisse aucune trace alors qu'il exécute jusqu'à 5 000 `INSERT` réels) et **Q-206** (deux
erreurs de fond dans le catalogue ANSSI **français**, dont la source est un CSV du client).

**Quatre de ces constats méritent d'être lus, parce qu'ils enseignent plus qu'ils ne coûtent :**

- **Q-194** — le produit ne savait pas relire sa propre sauvegarde. `GET /api/export` puis
  `POST /api/reprise` en mode « remplacer » rendait **409, zéro ligne restaurée**, sur une
  base vierge portant *un seul* risque saisi à la main. La cause tenait en un mot : la
  migration `012` avait écrit `catalogue_id text` au lieu du domaine `id_metier`, que porte
  **toute** colonne d'identifiant du schéma et **par lequel la couche d'écriture découvre**
  qu'il faut convertir le « non renseigné » du navigateur en `NULL`. ⚠️ Le défaut vivait
  **entre trois fichiers dont aucun n'avait tort seul**, et ce qui l'a rendu invisible n'est
  pas sa subtilité : **aucun essai ne faisait passer la sortie d'une route dans l'entrée
  d'une autre**. Chaque moitié était éprouvée ; la jointure ne l'était pas.
- **Q-199** — le lot L12 était livré dans une configuration où il **ne peut pas envoyer**
  (`IPAddressDeny=any` sans le sous-réseau du relais), et le banc était **vert sur cette
  configuration-là**. L'unité disait pourtant, en toutes lettres, ce que l'oubli
  produirait : *une réserve écrite n'est pas une réserve traitée*, pour la énième fois.
- **Q-200** — j'avais écrit un essai qui **verrouillait l'absence de trace** sur
  `/api/consolidation`, en citant une règle que `src/pieces/index.ts` contredit depuis L6.
  **Cinquième occurrence** du motif « un essai qui mesure un défaut et le consacre comme une
  propriété désirable ».
- **Q-201 / Q-207** — le produit annonçait « champs non enregistrés » après un
  enregistrement **réussi**, puis « 1 champ sans destination » après une restauration
  **saine**. Un message qui annonce une perte qui n'a pas eu lieu apprend à ne plus croire
  les bandeaux, **y compris le jour où ils disent vrai**.

**Deux arbitrages qui vous étaient réservés ont été tranchés le 05/09**, et le motif compte
plus que la décision :

- **Q-181** — le profil `DIRECTION` ne portait **aucun** des sept domaines que la vision
  Groupe agrège : l'écran bâti pour elle lui affichait « — » sur presque tout ce qu'examine
  une revue de direction. Migration `016` : les six domaines manquants, **en lecture seule**,
  et rien d'autre. La règle posée est *le profil couvre exactement ce que l'écran qui lui est
  destiné agrège* — en deçà l'écran ment, au-delà c'est un sur-octroi.
- **Q-192** — treize codes ANSSI sur quarante-deux désignent autre chose que ce que le guide
  désigne sous le même numéro. **On ne renumérote pas** : les auto-évaluations sont stockées
  par `(ref_id, code)`, et les renuméroter les réattribuerait **en silence** dans un outil
  produit en audit. L'écart est **affiché** — chaque mesure porte son numéro officiel,
  rappelé là où il diffère seulement.

**Deux règles neuves, à ne pas défaire :**

1. **Le souligné initial est réservé aux champs que le serveur ajoute** (`_version`,
   `_versionMiseEnOeuvre`, `_porteeGroupe`). `js/core/sync.js` et `src/entites/index.ts` les
   écartent **par le préfixe**, jamais par la liste des trois noms ; et la migration `015`
   pose `f_verifier_champs_structurels()`, qui refuse toute colonne ainsi nommée — sans quoi
   une saisie disparaîtrait en silence.
2. **`I18n.valeur()` est un passe-plat** : une valeur absente du dictionnaire repart telle
   quelle, et cette valeur vient de la base. Tout appel non littéral doit être échappé ; un
   contrôle mécanique l'exige, **mesure** que chaque enveloppe échappe vraiment, et ferme le
   contournement par alias.

**La porte S8 — la dernière, celle qui conditionne la mise en service — a été jouée le
05/09 et refusée** : sept constats, **Q-208 → Q-214**, dont **un seul bloquant** et
**aucun de la classe « fuite ou perte de données »**. Six sont fermés et mordus ; restent
quatre points de durcissement groupés sous **Q-214 b, c, d, f**.

**Trois d'entre eux enseignent plus qu'ils ne coûtent, et il faut les lire :**

- **Q-208 — Q-197 était ROUVERT.** Le correctif de la porte S6 avait réécrit les cinq
  expressions qu'il nommait et **en avait laissé deux derrière**, à quelques lignes de sa
  propre note déclarant la famille fermée. **322 octets bloquaient le serveur 2 secondes à
  travers Apache** ; 468 octets, 35 secondes. ⚠️ **Deux passages, deux oublis** : ce n'est
  pas un défaut d'attention, c'est qu'une règle demandant de *juger chaque site* échoue au
  troisième passage. Elle est remplacée par **un interdit absolu** — plus aucun
  `new RegExp` dans l'analyseur, vérifié mécaniquement — et par **une mesure du rapport de
  coût**, car un seuil seul serait satisfait par un code deux fois moins lent mais toujours
  quadratique.
- **Q-210 — notre propre leçon, retournée contre nous.** Les deux correctifs de « fuite de
  données » de S6 étaient justes dans le code ; l'auditeur les a cassés un par un et **le
  banc est resté 30/30 vert**. Ils étaient fermés **dans le code, pas dans le banc**. Ce
  qui rendait l'essai existant creux : ses fiches de contrôle portaient un e-mail nul et un
  e-mail d'espaces, tous deux déjà écartés par un filtre antérieur — la clause corrigée n'y
  était **jamais le filtre discriminant**. *Un essai qui couvre une règle sans jamais la
  faire décider ne la couvre pas.*
- **Q-212 — corriger un symptôme laisse la cause.** Q-203 avait été réparé dans un module ;
  la cause vivait dans **plusieurs fonctions sœurs** de `js/i18n/index.js`. En généralisant
  le contrôle, il a trouvé **une quatrième sœur que l'audit n'avait pas nommée** et **sept**
  sites non échappés là où le rapport en citait deux.

**Deux règles neuves issues de S8, à ne pas défaire :**

3. **Aucune expression rationnelle à coût non borné dans `src/`** — ni construite
   (`new RegExp`), ni littérale portant une classe négative non bornée (`[^x]*`) qu'aucune
   ancre ne retient. ⚠️ **La première rédaction de cette règle ne bannissait que la
   CONSTRUCTION**, au motif que c'était « la seule forme par laquelle un octet de fichier
   devient un motif » : **c'était faux**, et le deuxième passage de S8 l'a démontré avec une
   expression *littérale* quadratique (**Q-215** : 931 octets → 5 994 ms, 20 s à travers
   Apache). Ce qui est dangereux n'est pas l'origine du motif, c'est **sa forme**. Le
   contrôle balaie **tout `src/`** et non le seul analyseur : trois passages ont trouvé trois
   fois la même forme au même endroit, ne regarder que là serait refaire l'erreur d'un cran
   plus haut. Les quatre autres occurrences de `src/` sont **mesurées** (0,1 à 0,4 ms, sujets
   bornés) et inscrites avec leur chiffre — le discriminant n'est pas la forme, c'est **si le
   sujet est borné**, et aucune analyse statique ne le décide.

   ⚠️ **Et la leçon de méthode, qui vaut au-delà de ce fichier** : le commentaire
   d'`elementsXml` décrivait cette forme, en toutes lettres, comme celle qui « rétablirait le
   défaut qu'on ferme » — vingt lignes au-dessus de la ligne fautive, qui a survécu au
   correctif portant ce commentaire. **Écrire la règle dans un commentaire ne suffit pas :
   il faut qu'une machine la vérifie.**
4. **Un identifiant ne peut porter ni guillemet, ni chevron, ni esperluette**
   (`verifierIdentifiant`). La reprise conserve les identifiants du fichier à l'octet près ;
   fermer la source coûte une ligne, échapper les 48 sites d'attribut du frontend serait une
   omission qui attend. Aucun des cinq générateurs du produit n'a jamais pu produire ces
   signes — le round-trip est intact.

**Le travail qui reste, par ordre de valeur** — ⚠️ **réécrit le 08/09/2026** : cette table
annonçait *« rejouer la porte S8 — TROISIÈME passage »* alors qu'elle en avait connu **six**.
Un chiffre faux ici est un constat, pas une coquille (`docs/PLAN_EXECUTION.md` §5).

> ⚠️ **L'ORDRE DE REPRISE FAIT AUTORITÉ EN TÊTE DE CE FICHIER** (« ▶▶ REPRENDRE ICI »), et
> il place **18.2 b** puis **Q-251** avant les portes. La table ci-dessous en est le détail
> pour le seul chemin de mise en service ; elle ne le contredit pas. *Deux listes des mêmes
> travaux divergent, et la divergence est silencieuse* — si vous les trouvez en désaccord,
> **c'est la tête de fichier qui fait foi**, et l'écart est un constat à ouvrir.

| | Contenu | Pourquoi |
|---|---|---|
| **a** | **Rejouer la porte S8 — SEPTIÈME passage** | Six passages, six refus. Depuis le 6ᵉ, **sept livraisons n'ont été soumises à aucun auditeur indépendant** : D2 (migration `017`), D1 · D4 · D5 (`018`, `019`), la vérification d'intégrité (`020`), et les fermetures Q-248 / Q-250. *Un banc vert ne vaut pas un passage de porte*, et *les constats fermés depuis un passage précédent ont déjà fait échouer le suivant* — deux fois sur Q-208 |
| **b** | **Jouer la porte S7, JAMAIS jouée** | Relecture métier et paraphrase délibérée des catalogues (droit d'auteur, `PLAN_SERVEUR` §4.2). Aucun échec ne la signale : c'est le point le plus facile à manquer |
| **c** | **Q-243, Q-247** | Une troncature de **queue** du journal est indétectable — le produit répond `sain: true`. La barrière de publication ne vérifie pas que l'approbation porte encore sur le contenu actuel |
| **d** | **Q-214 b, c, d, f** | Promotion de pièce jointe avant `commit` sans réconciliation disque↔base ; quota lu puis consommé dans deux transactions ; trois collections non bornées ; trois valeurs pour la borne de corps |
| **e** | **Q-205 b, Q-206** | Un aperçu d'import ne laisse aucune trace ; deux erreurs de fond dans le catalogue ANSSI **français**, dont la source est un CSV du client |
| **f** | **Q-234, Q-235, Q-236, Q-238 → Q-241, Q-244** | Gardes qui ne mordent pas assez, et résidus de désinstallation |
| **g** | **Q-186** | Propriétaire : **exploitant** |

### La vague 3 — L3 authentification AD et droits, puis L5 journal

Découpage, sept agents et critères d'acceptation : `PLAN_EXECUTION` **§3**. Dosage de la
délégation — quand déléguer, quand faire soi-même : **§2 bis**, mesuré sur ce qu'a réellement
coûté la vague 2.

**Le point d'accroche existe déjà** : l'interface `ResolveurPerimetre`
(`backend/src/api/session.ts`). L3 en fournit une autre implémentation, et **rien d'autre ne
change** dans `backend/src/api/`. Le fichier dit, ligne par ligne, ce que L3 doit mettre à la
place de chaque approximation provisoire.

**Six conditions d'entrée, fermes et écrites** : `backend/db/CONVENTIONS.md` **§22** (E1 à E6),
chacune disant *où lire* et *comment la porte S3 vérifiera*. Les trois qui coûtent le plus cher
si on les découvre tard :

1. ✅ **E1 est FERMÉE depuis L3** — et ces trois lignes ont continué de la déclarer ouverte une
   vague entière. L'écriture dans `sessions`, `session_filiales` et `session_domaines` exige
   désormais que la transaction ait posé `grc.authentification = 'oui'`
   (`007_authentification.sql` ; `src/auth/transaction.ts:56`), ce que seule la transaction
   d'ouverture de session fait. *Texte périmé, gardé pour son motif : « écrivables sans
   condition — circulaire et assumé, ces tables produisant la décision d'autorisation ; tant que
   ce n'est pas fermé, les requêtes intégralement paramétrées sont la seule parade. »* Les
   requêtes restent intégralement paramétrées, mais ce n'est plus la seule parade (§17.4).
2. **Les clés primaires composites sont reportées**, par un arbitrage écrit et daté (§21).
3. **Toute route qui exige l'administration Groupe la *vérifie* ; aucune ne la *pose*.** Vrai
   aujourd'hui et démontré par un test mécanique — mais c'est une propriété du code, **pas une
   barrière**. À L3 de la faire décider par le modèle de droits (condition E2).

**Ne pas croire acquis** ce que L3 peut casser sans le voir : le périmètre vient du serveur parce
qu'*aucun chemin ne le lit ailleurs* — or L3 introduit précisément la couche qui le **fabrique**,
et devient donc le seul endroit où l'erreur est possible.

**Pour l'AD** : le développement se fait contre un **annuaire LDAP simulé** (livrable de l'agent
OUTILLAGE, `PLAN_EXECUTION` §3). **Ne pas viser un AD de production pour des essais** — un banc
qui éprouve le cas négatif verrouille des comptes réels, et les groupes `GRC-*` n'existent pas
encore. L'AD réel a sa place en recette, encadrée.

**Ce que la vague 2 a réglé, et qu'il ne faut pas re-traiter** — les trois pièges légués à L2
sont **fermés** :

| Piège | Ce qui a été fait |
|---|---|
| `UPDATE 0` ne distingue pas conflit de version, ligne absente et refus RLS | `diagnostiquerEcriture()` tranche **dans la même transaction**, en cinq verdicts |
| Le client ne fixe ni `version`, ni `cree_le`, ni `cree_par` | ces colonnes sont **exclues par construction** ; un champ client qui les viserait est **refusé**, pas ignoré |
| `documents.portee_groupe` est une colonne engendrée entrant dans une clé étrangère | toute insertion **nomme ses colonnes**, liste filtrée sur `engendree = false` — découverte, pas recopiée |

### Ce qui est éprouvé sur cette machine, et ce qui ne l'est pas

> ⚠️ **Réécrit le 03/09/2026, et l'écart valait la peine d'être mesuré.** Ce paragraphe
> décrivait un conteneur portant **Apache 2.4.58 (Ubuntu)** et **PostgreSQL 16.13**. Le
> chantier tourne désormais sur une **VM Debian 13 réelle**, sous KVM, avec un **systemd
> vrai** — et Debian 13 n'embarque **ni** 2.4.58 **ni** PostgreSQL 16. Cinq réserves que
> huit passages de porte avaient reconduites ont été fermées d'un coup ; deux défauts réels
> en sont sortis (constats **Q-72** et **Q-74**), dont un qui **empêchait purement et
> simplement d'ouvrir le produit**. C'est, une fois de plus, *une réserve écrite n'est pas
> une réserve traitée*.

**Éprouvé en conditions réelles sur Debian 13 (trixie), le 03/09/2026 :**

| Ce qui est joué | Ce qui a été mesuré |
|---|---|
| **PostgreSQL 17.11** (PGDG) | les 7 migrations passent ; 48 tables, RLS **activée et forcée 48/48**, 192 politiques, 9 garde-fous enregistrés, 8 profils semés par `007` |
| **`deploy/install.sh` de bout en bout**, en root | cinq passages : arrêt propre en **code 2** sur configuration incomplète, puis installation complète, contrôles de sécurité de la base, unité systemd, frontal |
| **Apache 2.4.68 (Debian)** | l'**URL d'entrée** rend 200 ; un fichier non publiable rend 403 ; borne de corps **28 311 552 o → 413**, `chunked` → **411**, corps minuscule → passe ; 59 scripts servis **2 248 762 → 699 088 octets** en `text/javascript`, cache 7 jours |
| **Unité systemd**, sous un vrai `systemd` | `systemd-analyze security` → **1.3 OK** ; bac à sable mordu **depuis les namespaces du processus réel** et sous l'identité `cyber-grc` (écriture hors `ReadWritePaths` refusée, `InaccessiblePaths` opaque, clé TLS illisible) ; **`IPAddressDeny=any` mesuré pour la première fois**, témoin à l'appui — le service atteint la boucle locale et rien d'autre, pas même l'IP publique de sa machine ; arrêt `SIGTERM` propre relevé au journal |
| **TLS d'une vraie PKI** | PKI à deux niveaux (racine → émettrice → serveur), racine posée dans le magasin du système : `curl` **sans `-k`** rend 200 et `ssl_verify_result=0` ; le serveur émet `alert protocol version` en TLS 1.0 et 1.1, et refuse les suites CBC en 1.2. ⚠️ **Deux pièges de mesure, tous deux rencontrés** : `--cacert` ne remplace **pas** `--capath`, qui reste à `/etc/ssl/certs` — sans `--capath /dev/null`, une racine étrangère « valide » aussi `deb.debian.org`, et la sonde ne prouve rien ; et OpenSSL 3.5 **refuse de proposer** TLS 1.0/1.1 (« no protocols available »), si bien qu'un `-tls1` refusé mesure le CLIENT et non le serveur — il faut `-cipher 'ALL:@SECLEVEL=0'` pour que la question soit seulement posée |
| **ClamAV** | installé et actif (`clamd`, ~1 Gio résident) — l'analyse antivirale est annoncée par le serveur au démarrage ; la **chaîne d'analyse d'une pièce jointe** reste à éprouver au lot L6 |

**L'Active Directory n'est plus hors de portée — et il a immédiatement payé.** Un
contrôleur de domaine **Samba réel** tourne sur cette machine (image `smblds/smblds`,
conteneur `grc-ad`, realm `EXEMPLE.INTERNE`, LDAPS sur `127.0.0.1:1636`), peuplé **depuis
la liste engendrée** par `deploy/groupes-ad.sh --csv` : 23 groupes `GRC-*`, un compte de
service, sept comptes de recette et un **groupe imbriqué** (`equipe-secu-tls` dans
`GRC-TLS-RSSI`) qui éprouve le critère d'appartenance indirecte. Les scripts de montage
et de peuplement vivent dans le répertoire de travail temporaire, hors dépôt.

⚠️ **Ce qu'il a trouvé dès la première connexion, et qu'aucune doublure ne pouvait
montrer** : le détecteur de renvoi LDAP refusait *toute* réponse portant un
`SearchResultReference` — or Active Directory en émet sur **toute** recherche en
sous-arbre depuis la racine du domaine. Aucune connexion n'aboutissait (constat
**Q-83**). C'est le constat **Q-69** — *« écrit, lu, et mordu par rien »* — mordu par le
réel. **Une doublure n'émet que ce que son auteur a prévu** : c'est la limite structurelle
du §25, et elle vaut d'être retenue avant d'écrire la prochaine.

⚠️ **CE PARAGRAPHE DISAIT TROIS CHOSES FAUSSES — voir le §0, qui fait foi.** Il écrivait :
*« ce qui reste hors de portée : le relais SMTP … et, sur cette machine-ci, ni Playwright ni
Chromium ne sont installés »*. Mesuré le 04/09/2026 :

- **Playwright et Chromium sont installés** (`/opt/pw-browsers/chromium-1234`), et les
  familles `test/navigateur/` et `test/modules/` tournent — elles font partie des
  essais du banc ;
- **la sortie SMTP fonctionne** : port 587 vers `smtp.office365.com` rend la bannière
  `220 … Microsoft ESMTP MAIL Service ready` ;
- **la machine n'est pas hors ligne** (constat **Q-128**).

**Ce qui reste vraiment hors de portée est une seule chose** : l'AD **de production** du
client, interdit aux essais parce qu'un banc qui éprouve le cas négatif verrouille des
comptes réels. C'est une règle de prudence, pas une limite technique — l'AD simulé `grc-ad`
existe pour cela, et il est modifiable (§0.2).

ℹ️ **`SRV-Infra` est dédiée à ce projet, et à lui seul.** On y trouve des piles Docker
arrêtées — `hm-infra` et `cyber-grc` sous `/opt/hm-infra/` : Odoo, cal.com, n8n, traefik,
searxng, un site web. **C'est l'essai d'un autre projet, abandonné.** L'utilisateur a
tranché le 04/09/2026 : *« je ne vais en aucun cas remettre en place l'ancien projet sur
Docker, tu peux faire comme s'il n'existait pas »*. Elles ont été arrêtées pour libérer
80/443 et la mémoire, et **elles n'ont pas à être redémarrées** — ne perdez pas de temps
à les ménager, et ne prenez pas leur présence pour une contrainte.

**Le seul conteneur qui compte est `grc-ad`**, le contrôleur de domaine Samba de la
recette (voir ci-dessus) : celui-là doit tourner.

⚠️ **La leçon qui a coûté le plus cher** : *une réserve écrite n'est pas une réserve traitée.*
Six passages ont consigné « Apache n'est pas éprouvé » — honnêtement, sans se contredire —
pendant que l'installer prenait une minute. Corollaire : **un contrôle doit interroger le chemin
que l'utilisateur emprunte, pas celui qui est commode à tester.**


### Vérifications à mener au démarrage du projet (côté client)

- Accès sortant de la VM vers Microsoft 365 (conditionne les notifications, lot L12).
- Existence d'une version anglaise officielle du questionnaire AirCyber (allégerait
  L11 d'un sixième du volume de traduction).
- **Validation formelle du découpage Groupe/Filiale par le RSSI groupe** (risque P5 du
  `PLAN_SERVEUR` §8). Elle était attendue *avant* L1 ; **aucune trace n'en subsiste dans
  le dépôt**, et L1 a été écrit sur le découpage arbitré en interne
  (`backend/db/CONVENTIONS.md` §16.4). À faire confirmer **avant la mise en service
  pilote** : changer le niveau d'une table après coup se paie en migration de données.

### Historique frontend

Le chantier 2 (harmonisation des tableaux denses, KPI, radars ; tooltips restants sur
Actions et Donneurs d'ordre) reste en suspens, sans priorité face au chantier serveur.
