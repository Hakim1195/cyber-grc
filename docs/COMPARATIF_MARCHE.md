# Comparatif marché — les 86 fonctionnalités de l'état de l'art GRC

> **Établi le 08/09/2026, rejoué le 16/09/2026** à la clôture de la vague B. C'est
> l'**instrument de mesure** du
> [`PLAN_PRODUIT.md`](PLAN_PRODUIT.md) : la grille se rejoue après chaque porte, et le
> chiffre s'inscrit. Elle ne se recopie pas de mémoire (constat **Q-219**).
>
> **Méthode.** Les fonctionnalités sont relevées chez les plateformes de référence (voir
> §3). Les verdicts sont **mesurés dans le dépôt** — arborescence, schéma, routes, modèle
> de droits —, jamais lus dans la documentation du projet.
>
> ⚠️ **Trois pièges de mesure, tous rencontrés lors de l'établissement de cette grille :**
> 1. Les mots « MFA », « vulnérabilité », « sensibilisation » **apparaissent** dans le
>    dépôt — mais uniquement comme **contenu des référentiels**, c'est-à-dire comme choses
>    *à évaluer*. Ce ne sont pas des fonctions du produit. Comptés **absents**.
> 2. « Le schéma porte le champ » ≠ « l'écran l'exploite ». `referentiels_actifs` a vécu
>    une vague entière écrit par personne (constat **Q-150**).
> 3. Un `grep` insensible à la casse sur un sigle court rend surtout du bruit
>    (`FAIR` → « faire », `LEI` → « client »). Chaque verdict ❌ de cette grille a été
>    vérifié sur les occurrences réelles, pas sur un compte de fichiers.

**Verdict global au 21/09/2026 : 56 ✅ · 17 🟡 · 13 ❌** sur 86 — soit **75 %** en pondérant
les partiels à moitié. ⚠️ **TROIS lignes ont bougé depuis le rejeu intégral du 19/09**, et
chacune est mesurée :

| Ligne | Avant | Après | Ce qui l'a déplacée |
|---|---|---|---|
| **30** — recherche plein texte | 🟡 | ✅ | **L16-D3**, migration `059` |
| **42** — formulaires de notification | ❌ | ✅ | **L20.2** |
| **48** — Kanban / échéancier | 🟡 | ✅ | **L17-A5** |

Les quatre-vingt-trois autres gardent le verdict du 19/09 — *un indicateur qui tairait
quelles lignes il a remesurées serait pire qu'un indicateur en retard.* Un rejeu intégral
est dû au prochain jalon. **Cible du `PLAN_PRODUIT.md` une fois les douze lots joués : 76 ✅ · 2 🟡
· 8 ❌**, les huit restantes étant des non-objectifs nommés un par un (§9 du plan).

> ### ▶ Rejeu du 19/09/2026 — clôture de la vague F, **la dernière du plan**
>
> **53 ✅ · 17 🟡 · 16 ❌ → 53 ✅ · 19 🟡 · 14 ❌.** Pondéré : **~72 % → ~73 %**. Deux
> en-têtes de section faux, de nouveau attrapés par le recompte mécanique — **la
> troisième fois de suite**, et c'est ce qui prouve que la mécanique vaut mieux que
> l'attention.
>
> ⚠️ **LE GAIN EST FAIBLE, ET C'EST HONNÊTE.** Les lots L27 et L28 sont les plus gros de
> la vague, et ils déplacent **quatre lignes**. La raison est écrite dans chacune : ce
> qui est **construit** n'est pas ce qui est **ouvert**.
>
> | # | Avant | Après | Pourquoi pas ✅ |
> |---|---|---|---|
> | 32 | 🟡 | 🟡 | Le portail est **construit et éprouvé** ; `PORTAIL_ACTIF=non` n'enregistre aucune route, et son vhost est livré désactivé. *La porte S15 est la plus exigeante du chantier* |
> | 36 | ❌ | 🟡 | Le **cadre** de l'assistance est là — cinq usages, six barrières, verdict « indisponible » plutôt qu'une invention. Le **modèle**, lui, s'installe sur la boucle locale |
> | 69 | ❌ | 🟡 | Idem : un brouillon de politique se propose, et **ne se publie pas** — `GRC06` reste seul maître |
> | 75 | ❌ | ❌ | **Revu, et laissé ❌ délibérément** : l'utilisateur a validé un portail fournisseur, pas « publier nos preuves sur Internet ». Confondre les deux serait s'accorder une permission qu'on n'a pas reçue |
>
> ⚠️ **Et DEUX lignes sont restées ❌ par arbitrage, non par manque** : **68** (agent de
> détection d'écarts) et **72** (assistant d'évaluation fournisseur). Toutes deux
> demandent à une IA de **décider** — de la conformité, ou de la valeur d'un tiers —, et
> les cinq usages arbitrés **proposent** sans jamais écrire. Le produit répond aux deux
> besoins **sans IA** : le CCM du lot L23 *constate* au lieu de deviner, et le score
> composite de L21.3 se **dérive** de critères qu'un humain relit ligne à ligne.
> *Un score qu'on peut refaire à la main vaut mieux qu'un avis qu'on ne peut pas contester.*
>
> ### ▶ Rejeu du 19/09/2026 — clôture de la vague E
>
> **51 ✅ · 15 🟡 · 20 ❌ → 53 ✅ · 17 🟡 · 16 ❌.** Pondéré : **~68 % → ~72 %**. Les
> dix-huit en-têtes de section et le total sont **recomptés par programme** depuis les
> lignes, jamais additionnés de tête (constat **Q-219**) — et le recompte a de nouveau
> trouvé **deux en-têtes faux**, C et J, désaccordés par les lignes que ce rejeu venait de
> déplacer. *La discipline tient parce qu'elle est mécanique, pas parce qu'on y pense.*
>
> **Les cinq lignes que la vague E a déplacées**, remesurées une par une dans le dépôt :
>
> | # | Avant | Après | Ce qui l'a déplacée |
> |---|---|---|---|
> | 17 | ❌ | 🟡 | Le **CCM** existe de bout en bout — test exécutable, résultat daté et historisé, passage au rouge qui ouvre une action. Ce qui reste 🟡 est le **périmètre des sources**, pas le mécanisme |
> | 20 | ❌ | 🟡 | **Trois** connecteurs locaux, et surtout un **cadre** dont le vocabulaire est clos en base et confronté au registre des exécuteurs |
> | 21 | ❌ | ✅ | La **collecte automatique** : constat daté, rattaché à une mesure, avec sa fraîcheur dérivée — et aucun chemin d'échec ne rend « conforme » |
> | 23 | 🟡 | ✅ | **Jetons d'API** (sujets de droits, jamais un contournement) et **webhooks** signés, drainés hors du service web. ⚠️ Pas de CLI : la ligne passe ✅ sur ses trois autres termes |
> | 52 | ❌ | 🟡 | Le **cadre** accueille un scanner sans architecture nouvelle ; aucun n'est branché |
>
> ⚠️ **CE QUI N'A PAS BOUGÉ, ET QU'IL FAUT DIRE** : les lignes **20** et **52** restent 🟡,
> et la tentation de les passer ✅ parce que « le cadre est là » est exactement ce que cet
> indicateur existe pour empêcher. Un cadre n'est pas un catalogue. Face à 375 connecteurs
> chez Vanta, trois est un commencement — ce qui a changé est que le suivant coûte un
> exécuteur et non une architecture.
>
> ### ▶ Rejeu INTÉGRAL du 19/09/2026 — clôture de la vague D
>
> **46 ✅ · 15 🟡 · 25 ❌ au 18/09 → 51 ✅ · 15 🟡 · 20 ❌.** Pondéré : **~62 % → ~68 %**.
> Le compte est **recompté sur la grille** par un balayage des quatre-vingt-six lignes,
> jamais additionné de tête (constat **Q-219**).
>
> **Les onze lignes que la vague D a déplacées**, remesurées une par une dans le dépôt :
>
> | # | Avant | Après | Ce qui l'a déplacée |
> |---|---|---|---|
> | 1 | 🟡 | 🟡 | 424 exigences **en base** (`051`) — la largeur livrée ne bouge pas, mais elle cesse d'être une limite du produit |
> | 2 | ❌ | 🟡 | La veille : les catalogues sont **datés**, l'ancienneté est dérivée (`052`) |
> | 3 | ✅ | ✅✅ | La suggestion de correspondances, qui manquait, est livrée (26.4) |
> | 4 | ❌ | ✅ | Un client importe sa grille par le moteur du lot L7 (26.2) |
> | 7 | 🟡 | 🟡 | EBIOS RM passe à ✅ dans la ligne ; ReCyF, HDS et SecNumCloud restent à importer |
> | 8 | ✅ | ✅✅ | Les échelles sont configurables, versionnées et **portées par la cotation** (25.3) |
> | 9 | ❌ | ✅ | Les **cinq ateliers** d'EBIOS RM (`046`, `047`) |
> | 10 | ❌ | ✅ | La quantification FAIR (`050`) |
> | 11 | 🟡 | ✅ | `ebios_connaissances` : menaces et modes opératoires types (25.5) |
> | 70 | ❌ | ✅ | La suggestion de mapping — **sans IA**, par similarité de libellés (26.4) |
>
> **Les vingt ❌ restants** ont été confrontés au dépôt par recherche de leur mécanisme —
> `connecteur`, `webhook`, `scanner`, `benchmark`, `phishing`, `page de confiance`, `CMDB`,
> `Jira`, `ServiceNow`, `jeton d'API`, `surface d'attaque`, `vulnérabilité` : **aucune ne
> s'est révélée présente**. ⚠️ Trois touches sont des **faux amis**, ouvertes et écartées à
> la main : « surface d'attaque » dans `serveur.ts` et `multipart.ts` (c'est du durcissement,
> pas une notation externe), « phishing » dans `en.js` (la traduction d'« hameçonnage »), et
> « vulnérabilités » dans `mappings.js` (un thème de correspondance, pas un registre).
>
> 🛑 **ET LE REJEU A TROUVÉ UN DÉFAUT DANS L'INDICATEUR LUI-MÊME.** Les **en-têtes de
> section** — « A. … — 2 ✅ · 2 🟡 · 3 ❌ » — n'avaient **jamais été recomptés** : dix des
> dix-huit contredisaient les lignes qu'elles surplombent, certaines depuis le rejeu du
> 16/09. La section N annonçait « 0 🟡 » alors que la ligne 71 y était 🟡 depuis le lot L17.
>
> *Deux points de mesure de la même grandeur divergent, et la divergence est silencieuse* —
> le constat **Q-219**, dans le document qui sert à mesurer tout le reste, et à l'endroit
> qu'on lit en premier. Les dix-huit en-têtes sont désormais **recomptés par programme**
> depuis les lignes, comme le verdict global.
>
> ### ▶ Rejeu INTÉGRAL du 18/09/2026 — clôture de la vague C
>
> **44 ✅ · 12 🟡 · 30 ❌ au 16/09 → 46 ✅ · 15 🟡 · 25 ❌.** Le compte est **recompté sur la
> grille** par un balayage des quatre-vingt-six lignes, jamais additionné de tête — c'est le
> constat **Q-219** appliqué à l'indicateur qui sert à mesurer le reste. Pondéré :
> **~58 % → ~62 %**.
>
> ⚠️ **CELUI-CI EST INTÉGRAL, et voilà par quoi cela se vérifie** — le rejeu du 16/09 disait
> lui-même n'avoir remesuré que onze lignes, et le `PLAN_ACHEVEMENT.md` §4 exige l'intégral à
> la clôture d'une vague. Les quatre-vingt-six lignes ont été passées en trois balayages, et
> la méthode est écrite parce qu'un « rejeu » qu'on ne peut pas refaire n'est pas une mesure :
>
>  1. **les neuf lignes que la vague C pouvait déplacer** — remesurées une par une dans le
>     dépôt (migrations, routes, écrans, essais) : **5, 31, 32, 34, 35, 39, 48, 66, 78** ;
>  2. **les vingt-cinq ❌** — confrontées au dépôt par recherche de leur mécanisme
>     (`connecteur`, `webhook`, `scanner`, `vulnérabilité`, `benchmark`, `formation`,
>     `phishing`, `page de confiance`, `EBIOS RM`, `FAIR`, surveillance continue) :
>     **aucune ne s'est révélée présente.** ⚠️ Le balayage est *insensible à la casse et aux
>     faux amis* — `FAIR` attrape « faire », `formation` attrape « information » : les deux
>     touches ont été ouvertes et écartées à la main ;
>  3. **les quarante-six ✅ et douze 🟡 antérieurs** — confirmés par l'existence de ce qui les
>     porte : dix-neuf écrans (`js/modules/*.js`) et dix tables du catalogue
>     (`journal_audit`, `attestations_lecture`, `derogations`, `piece_rattachements`,
>     `analyses_impact`, `demandes_droits`, `main_courante`,
>     `declarations_reglementaires`, `document_mesures`, `history`), plus les deux
>     dictionnaires de langue et le répertoire de déploiement.
>
> ⚠️ **Ce que ce troisième balayage ne prouve PAS, et il faut le dire** : qu'un écran existe
> ne dit pas qu'il fonctionne. Ce sont les 2 xxx essais du banc qui le disent, et c'est
> pourquoi ce balayage confirme des verdicts **antérieurs** plutôt qu'il n'en établit de
> nouveaux. Une ligne dont le verdict CHANGE est toujours remesurée au premier niveau.
>
> **Les cinq lignes qui ont bougé, et pourquoi :**
>
> | | Ligne | Ce qui l'a fait bouger |
> |---|---|---|
> | ❌ → ✅ | **35** suivi contractuel et plan de sortie | L21.3 — et les trois dates **alimentent l'échéancier**, ce qui était le critère |
> | ❌ → ✅ | **66** campagne poussée du Groupe | L24.1 — migration `044` : la demande est commune, la part est cloisonnée |
> | ❌ → 🟡 | **5** campagnes d'évaluation, **32** questionnaires, **34** registre DORA | L21.1, L21.2, L24 — livrés, avec ce qui manque **nommé** : le suivi par répondant, le portail (L28), les gabarits XBRL |
> | 🟡 → 🟡 | **39** espace auditeur externe, **48** Kanban, **78** DSAR | motifs REMESURÉS : le neuvième profil n'est pas un espace d'auditeur ; l'échéancier passe à **neuf sources** ; le registre de consentements reste absent |
> | ✅ → ✅ | **31** registre fournisseurs | motif enrichi : le score composite est **dérivé** et son barème **servi** |
>
> ⚠️ **Et une ligne dont le POINTEUR DE LOT était faux** : **37** (univers d'audit, plan
> pluriannuel) renvoyait à **L24**, qui ne le couvre pas — une campagne descendante n'est pas
> un plan d'audit pluriannuel. Aucun lot du `PLAN_PRODUIT` ne le porte aujourd'hui : la ligne
> reste 🟡 et son pointeur le dit, plutôt que de désigner un lot qui ne le fera pas.

> ### ▶ Rejeu du 16/09/2026 — clôture de la vague B
>
> **35 ✅ · 17 🟡 · 34 ❌ au 08/09 → 44 ✅ · 12 🟡 · 30 ❌.** Le chiffre est **recompté sur
> la grille**, ligne par ligne, jamais additionné de tête : c'est le constat **Q-219**
> appliqué à l'indicateur qui sert à mesurer le reste.
>
> **Onze lignes ont bougé, et chacune a été REMESURÉE dans le dépôt** — schéma, routes,
> écrans — et non lue dans le journal des livraisons :
>
> | | Ligne | Ce qui l'a fait bouger |
> |---|---|---|
> | ❌ → ✅ | **18** dérogations datées, **27** attestation de lecture | L19, actions 19.2 et 19.1 |
> | 🟡 → ✅ | **16** contrôles périodiques, **19** maturité ≠ efficacité | L19, actions 19.5 et 19.6 |
> | 🟡 → ✅ | **22** réutilisation d'une preuve, **29** politique ↔ contrôle | L19, actions 19.4 et 19.3 |
> | 🟡 → ✅ | **41** délais réglementaires, **43** main courante, **77** AIPD | L20, actions 20.1, 20.5 et 20.3 |
> | ❌ → 🟡 | **30** recherche, **71** palette | L17, action A3 — la palette est là, l'index plein texte non |
> | 🟡 → 🟡 | **78** DSAR | 20.4 livrée ; **les consentements restent absents**, et la ligne le dit |
>
> ⚠️ **Ce rejeu n'est PAS complet, et le dire fait partie de la mesure.** Seules les lignes
> que les vagues A et B pouvaient déplacer ont été remesurées. Les **soixante-quinze
> autres gardent leur verdict du 08/09** — elles n'ont pas été revérifiées, et une d'elles
> pourrait avoir bougé sans qu'on le sache. Un rejeu intégral est dû à la clôture de la
> vague C.

⚠️ **Ce chiffre brut est trompeur, et c'est le point central.** Les 30 absences ne sont
pas réparties : **19 d'entre elles tiennent dans quatre blocs entiers** (D intégrations,
F tiers, J vulnérabilités, N intelligence artificielle). Hors ces quatre domaines, la
couverture est de **~76 %**, avec un niveau d'exigence technique qui dépasse le marché sur
plusieurs points (§2).

---

## 1. La grille

Légende : ✅ couvert · ✅✅ au-dessus du marché · 🟡 partiel · ❌ absent.
La colonne **Lot** renvoie au lot du `PLAN_PRODUIT.md` qui comble la ligne ; « — » signale
un non-objectif assumé (`PLAN_PRODUIT.md` §6).

### A. Référentiels et conformité multi-normes — 3 ✅ · 4 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 1 | Catalogue large et maintenu | 🟡 | **6 référentiels, 424 exigences EN BASE** (ANSSI 42, ISO 27001 SMSI 30, ISO 27002 93, NIS2 10, DORA 15, AirCyber 234) depuis la migration `051`. La largeur LIVRÉE reste faible face à 50 (Tenacy) et 200+ (CISO Assistant) — mais elle cesse d'être une limite du PRODUIT : un client importe la sienne (ligne 4) | L26 |
| 2 | Veille réglementaire intégrée | 🟡 | **L26 livré le 19/09/2026** : chaque catalogue porte la date de parution de son TEXTE, l'ancienneté est **dérivée** (`f_referentiel_age`), et le guide d'hygiène de l'ANSSI — publié en 2017 — est signalé « à vérifier » dès la livraison. ❌ **Ce qui manque, et qui est un NON-OBJECTIF** : le produit ne va pas chercher la norme sur Internet (risque P3, et `IPAddressDeny=any` l'en empêche). Il date et il signale ; c'est un humain qui vérifie | L26.5 |
| 3 | Mapping inter-référentiels | ✅✅ | Module `/mapping`, 28 groupes + surcouche éditable, propagation « zéro double saisie » — **et la suggestion automatique depuis le 19/09/2026** (`GET /api/catalogues/suggestions`, similarité de libellés, score rendu). ⚠️ Elle **PROPOSE** et n'écrit jamais : une correspondance appliquée sans lecture propagerait un statut de conformité faux | L26.4 |
| 4 | Référentiels personnalisés | ✅ | **L26 livré** : les quatre tables de catalogue sont des entités ordinaires, donc importables par le moteur du lot L7 — référentiel, domaines, exigences. ⚠️ Une grille apportée par une filiale n'est lisible que d'elle, et se comporte comme un catalogue livré : radar, SoA, correspondances, audits | L26.2 |
| 5 | Campagnes d'évaluation | 🟡 | **L24 livré le 18/09/2026** : le Groupe ouvre une campagne sur un référentiel vers N filiales, chacune ne voit QUE sa part, l'avancement se **compte** dans les évaluations, et la relance passe par l'échéancier existant (9ᵉ source). ❌ **Ce qui manque** : le suivi par RÉPONDANT nominatif (le champ existe, l'écran ne l'agrège pas) et l'envoi effectif — le produit prépare, l'humain envoie | L24 |
| 6 | Déclaration d'applicabilité (SoA) | ✅ | Générée, avec couverture croisée | — |
| 7 | Référentiels FR/EU spécifiques | 🟡 | ANSSI ✅ NIS2 ✅ DORA ✅ RGPD ✅ ISO ✅ AirCyber ✅ **EBIOS RM ✅** (L25, cinq ateliers) ; **ReCyF ❌ HDS ❌ SecNumCloud ❌** — mais ils s'IMPORTENT désormais (ligne 4), ce qui les fait passer d'un manque de produit à un travail de contenu | L26 |

### B. Gestion des risques — 6 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 8 | Registre, brut / résiduel | ✅✅ | `risques` : `f_frequence`, `g_gravite`, `m_maitrise`, scores, bornes contraintes en SQL — **et les échelles sont configurables depuis le 19/09/2026** (L25.3) : versionnées, datées, FIGÉES à la publication, socle du Groupe surchargeable par filiale, et **chaque cotation porte l'échelle qui l'a produite**. ⚠️ La consolidation REFUSE d'additionner deux échelles au lieu de le faire en silence | L25.3 |
| 9 | **EBIOS RM outillé** | ✅ | **L25 livré les 18 et 19/09/2026** — les **cinq ateliers** (migrations `046` et `047`) : cadrage et valeurs métier, sources de risque et objectifs visés, écosystème et parties prenantes, scénarios stratégiques et opérationnels, décision de traitement. ⚠️ **EN ADDITION** : la cotation F × G × M n'est ni touchée ni réinterprétée, et `f_verifier_ebios_cadrage()` le MESURE | **L25** |
| 10 | Quantification financière (FAIR) | ✅ | **L25.4 livré le 19/09/2026** (migration `050`) : fréquence et magnitude estimées par TRIPLETS min/probable/max, moyenne PERT, perte annualisée **dérivée** et sommée par la consolidation — la seule grandeur du produit qui traverse les filiales. ⚠️ Un triplet incomplet ne rend RIEN, et des pertes secondaires absentes font un **PLANCHER** annoncé « ≥ » | L25.4 |
| 11 | Bases de connaissances expertes | ✅ | `risque_catalogue` (migration `012`) porte un socle de risques Groupe, **et `ebios_connaissances` (migration `046`) la base de connaissances des MENACES et modes opératoires types** — de portée Groupe, alimentant les ateliers 2 et 4. ⚠️ Un catalogue de VULNÉRABILITÉS techniques reste absent : c'est la ligne 51 | L25.5 |
| 12 | Acceptation de risque avec workflow | ✅ | Circuit typé, et `empreinte_objet` **périme l'approbation quand l'objet change** — plus fin que la moyenne | — |
| 13 | Appétence / seuils | 🟡 | KRI à seuils dans la Synthèse Direction ; pas d'appétence paramétrable | L25 |
| 14 | Agrégation multi-entités | ✅ | `GET /api/consolidation`, module `/groupe` | — |

### C. Mesures et contrôles — 4 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 15 | **Bibliothèque de contrôles unique** | ✅✅ | Pivot « Mesure », scindé `mesure_catalogue` (Groupe) / `mesure_mise_en_oeuvre` (Filiale), n-n vers les exigences. **Séparation plus propre que la plupart des produits** | — |
| 16 | Contrôles périodiques planifiés | ✅ | `mesure_mise_en_oeuvre` porte `frequence_controle` et `dernier_controle` (migration `037`) ; **l'échéance se DÉRIVE** — `f_prochain_controle()`, cinq rythmes éprouvés sur date témoin. Un contrôle jamais joué rend NULL plutôt qu'une échéance inventée | — |
| 17 | **Continuous Control Monitoring** | 🟡 | **Remesuré le 19/09, après L23.** Le mécanisme est **entier** : un connecteur porte un test exécutable, le résultat est daté, historisé et rattaché à une mesure ; le **passage** de vert à rouge ouvre une action et la rattache. ⚠️ Ce qui reste 🟡 et non ✅ est le **périmètre des sources** : trois connecteurs locaux, contre les dizaines qu'un SaaS branche sur un parc entier. *Le cadre existe et il est éprouvé ; c'est le catalogue qui est jeune* | L22.5 (étendre le catalogue) |
| 18 | Exceptions / dérogations datées | ✅ | Table `derogations` (migration `035`) : propriétaire, motif, compensation, **échéance**, et approbation par le circuit L8. ⚠️ **L'état se DÉRIVE** (`f_etat_derogation`) — une dérogation échue redevient une non-conformité sans qu'aucun traitement ait à repasser, et la **rallonger sans la faire réapprouver ne la rallonge pas** | — |
| 19 | Maturité et efficacité distinctes | ✅ | `efficacite` (trois valeurs), `efficacite_constatee_le`, `efficacite_preuve` — **distinctes de la maturité** et non convertibles : « documenté, planifié, supervisé » ne dit rien de « est-ce que ça marche ». Le garde-fou mesure l'efficacité **sur son type** : un entier la rendrait moyennable avec la maturité (migration `037`) | — |

### D. Preuve et intégrations — 4 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 20 | Connecteurs natifs | 🟡 | **Remesuré le 19/09.** **Trois**, tous locaux — sauvegarde, antivirus, annuaire — et surtout un **cadre** : vocabulaire clos en base, registre d'exécuteurs confronté au banc **dans les deux sens**, réglages déclarés et clos (aucun n'est un secret), mode dégradé. Face à 375 (Vanta), 200 (Drata), ~25 (Tenacy), c'est peu ; mais *le catalogue s'étend désormais sans nouvelle architecture*, ce qui était l'objet du lot | L22.5 (étendre) |
| 21 | Collecte automatique de preuves | ✅ | **Livré le 19/09** (migrations `054`, `056`). Chaque passage écrit un constat **daté**, rattaché à une mesure, avec sa source et sa **fraîcheur DÉRIVÉE** — une preuve périmée **redevient absente**, et « périmé » n'est pas « non conforme ». 🛑 **Aucun chemin d'échec ne rend « conforme »** (critère 23.4) : source injoignable, configuration incomplète, démon qui répond sans dater sa base — tout rend « indéterminé », mesuré en balayant le **registre** des exécuteurs et non une liste de trois | — |
| 22 | Registre d'artefacts, réutilisation | ✅ | **Une preuve sert N contrôles sans être déposée N fois** (migration `038`) : `piece_rattachements`, et une clé différée impose que l'adresse de délivrance soit l'un des rattachements. Le fichier n'est libéré qu'au **dernier** détachement — éprouvé sur les six chemins de cascade, découverts dans `pg_constraint` | — |
| 23 | API REST / CLI / webhooks / ITSM | ✅ | **Livré le 19/09** (migration `053`). **Jetons d'API** — portée, filiale, domaines, expiration obligatoire, révocation immédiate, droit d'export distinct ; ⚠️ **un jeton est un sujet de droits** : il bâtit un `EtatSession` et traverse la RLS, et son niveau se rabat sur le **plus faible des domaines demandés**. **Webhooks** sur quatre événements, `https` seul, signés HMAC, drainés par une **unité systemd distincte** — le service web n'appelle jamais vers l'extérieur. **ITSM** : l'aller par l'événement, le retour par un jeton sur la route générique, sans client Jira ni ServiceNow. ⚠️ Reste ❌ : **pas de CLI** | — |
| 24 | Import / export / réversibilité | ✅✅ | Import **20 entités** CSV+XLSX (format lu à la signature binaire), transactionnel, idempotent, cloisonné, journalisé ; export complet ; reprise v1→v12. **Meilleur que la plupart des SaaS** | — |

### E. Gestion documentaire et politiques — 5 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 25 | Cycle de vie complet | ✅ | `brouillon → en vigueur → à réviser → obsolète` ; publication soumise au circuit (**`GRC06`**) | — |
| 26 | Versionnage / version en vigueur | ✅ | Migration `018` : au plus une par porteur **et par filiale**. Comparaison de deux versions ❌ | L17.6 |
| 27 | **Attestation de lecture** | ✅ | `attestations_lecture` (migration `033`) : on n'atteste que pour soi — la personne vient de la session, la version vient du serveur —, et le taux de couverture rend **`null` plutôt que `0`** sur un effectif nul | — |
| 28 | Canevas de politiques | ✅ | Livrés au chantier 5 | — |
| 29 | Politique ↔ contrôle ↔ exigence | ✅ | `document_mesures` (migration `036`) : quels CONTRÔLES un document prouve, en plus des référentiels qu'il couvre. Le panneau est **le même des deux bouts** du lien — deux composants auraient divergé | — |
| 30 | Recherche plein texte | ✅ | **Deux** recherches, et elles ne répondent pas à la même question. La palette `Ctrl+K` et `GET /api/recherche` (L17, A3) retrouvent un enregistrement **par son libellé**, sur quatre entités. `GET /api/recherche/documents` (L16, **D3 — migration `059`, 21/09/2026**) cherche **dans le titre, le type et les annotations** d'un document par un **index plein texte GIN** : accents repliés, racinisation française (« chiffrer » trouve « chiffrement »), classement par pertinence avec le titre en poids `A` et l'annotation en `C`. Les deux sont bornées par la RLS côté serveur et par les droits — jamais par un filtre côté client. ⚠️ **Elle ne rend JAMAIS l'extrait**, seulement OÙ la correspondance a eu lieu : `documents.notes` est en régime « signaler » au registre de l'article 30, et rendre la phrase ferait du produit un moteur de recherche sur les personnes qu'elle nomme. ⚠️ **Reste dehors** : le contenu des pièces jointes, que la spécification range dans un second temps — l'extraire, c'est l'analyser, et l'analyser hors de la chaîne ClamAV du lot L6 ouvrirait une seconde porte d'entrée aux fichiers hostiles | L16.D3 |

### F. Tiers et chaîne d'approvisionnement — 2 ✅ · 3 🟡 · 1 ❌

> **Domaine le plus faible du produit.**

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 31 | Registre fournisseurs criticité / accès | ✅ | `prestataires` : criticité × accès → niveau inhérent, checklist `supply_chain` NIS2/DORA — et depuis **L21.4** un **score composite DÉRIVÉ** (criticité × accès × substituabilité × ancienneté de l'évaluation) dont le barème est **servi** par le serveur, plus recopié dans le navigateur | L21.4 |
| 32 | Questionnaires et portail fournisseur | 🟡 | **L21.2 livré le 17/09**, **et L28 CONSTRUIT le 19/09** : lien signé sans compte, session d'un seul objet, dépôt par **LA** chaîne du lot L6, reprise datée, attestation rendue au fournisseur, vhost séparé. 🛑 **Il reste 🟡 et non ✅ parce que CONSTRUIT N'EST PAS OUVERT** : `PORTAIL_ACTIF=non` n'enregistre aucune route, le vhost est livré désactivé, et la consigne du plan est écrite — *la porte S15 est la plus exigeante du chantier, en cas de doute on ne livre pas*. L'export/réimport demeure la voie de repli **permanente** | **L28** (ouverture après l'ultrareview) |
| 33 | Notation externe / surface d'attaque | ❌ | Absent — **non-objectif**, suppose un service tiers. ⚠️ **À réexaminer après L27**, dont la mécanique le rendrait atteignable — mais l'utilisateur a autorisé une **IA** externe, pas « les services tiers » en général | **—** |
| 34 | **Registre d'information DORA** | 🟡 | **L21.1 livré le 17/09/2026** : LEI, pays, fonction supportée et son caractère critique, contrat, substituabilité, et la **chaîne de sous-traitance** dont le rang se DÉRIVE (anti-cycle en base). L'écran **dit ses propres manques**, ligne par ligne, et la route exige le droit d'**export**. ❌ **Ce qui manque** : les gabarits **XBRL** des normes techniques des autorités européennes — un format de dépôt versionné par l'ESA, qui serait un lot à lui seul. *Le produit prépare, l'humain dépose* | **L21.1** |
| 35 | Suivi contractuel / plan de sortie | ✅ | **L21.3 livré le 17/09/2026** : référence et dates de contrat, revue des clauses, réversibilité, substituabilité, plan de sortie daté — **et les trois dates alimentent l'échéancier existant**, ce qui était le critère d'acceptation. ⚠️ `evalue_le` n'y entre PAS : c'est un fait passé, l'y ranger inverserait son sens | L21.3 |
| 36 | Réponse IA aux questionnaires reçus | 🟡 | **L27 construit le 19/09** : « réponse à un questionnaire client » est l'un des cinq usages, et il **propose à partir des seules preuves fournies**. ⚠️ Il reste 🟡 : le produit apporte le **cadre** — mode local par défaut, six barrières, verdict « indisponible » plutôt qu'une invention —, pas le **modèle**, que l'exploitant installe sur la boucle locale | **L27** |

### G. Audit — 2 ✅ · 2 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 37 | Univers d'audit / plan pluriannuel | 🟡 | Audits datés et planifiables ; ni univers, ni plan pluriannuel | **aucun lot** — remesuré le 18/09 : L24 ne le couvre pas, une campagne descendante n'est pas un plan d'audit pluriannuel |
| 38 | Constats → action → clôture | ✅ | **Grille générée depuis un référentiel** (avec les preuves à demander), typologie de constats, taux calculé | — |
| 39 | Espace auditeur externe | 🟡 | **Remesuré le 18/09** : le profil `AUDITEUR` existe (lecture seule, 26 domaines) et **L24.4 a livré un neuvième profil restreint** — mais c'est un *répondant de campagne*, pas un espace d'auditeur externe : ni jeton d'accès sans compte, ni cloison par mission. ❌ Le vrai chemin est **L28** (accès par lien signé, sans compte) | Profil `AUDITEUR` avec domaines restreints, mais **compte AD interne** — pas un accès invité | L24.4 |
| 40 | Rapport d'audit approuvé | ✅ | Circuit typé `audit` + génération PDF | — |

### H. Incidents et résilience — 5 ✅ · 0 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 41 | Registre et délais réglementaires | ✅ | `f_echeances_reglementaires()` (migration `034`) : les **trois paliers NIS2** (24 h, 72 h, 1 mois) et le **72 h RGPD**, chacun avec sa **référence au texte**, DÉRIVÉS de l'instant de détection — et l'écran dit l'**origine** du compte. `declarations_reglementaires` retient le geste et son accusé de réception | — |
| 42 | Génération des formulaires de notification | ✅ | **Livré le 21/09/2026** (L20, action 20.2) : `/notification/:id`, atteint depuis la fiche d'incident. Deux régimes — **ANSSI/NIS2 article 23** (alerte 24 h, notification 72 h, rapport final un mois) et **CNIL/RGPD article 33** —, pré-remplis depuis l'incident, imprimables. ⚠️ **Chaque rubrique que le produit ne sait pas remplir est NOMMÉE, avec ce que l'autorité attend**, et le document annonce en tête combien il en reste : *un formulaire à moitié rempli est plus dangereux qu'un formulaire vide — vide, on le remplit ; à moitié rempli, on l'envoie.* ⚠️ **Le produit ne transmet RIEN**, et le document le porte en toutes lettres. ⚠️ Il ne reproduit **aucun formulaire officiel** : les téléservices changent sans préavis, et recopier leur maquette ferait vieillir le produit en silence — ce qui est stable est le contenu que le TEXTE exige | **L20.2** |
| 43 | CIRM (runbooks, main courante) | ✅ | Fiches réflexes par rôle, cellule de crise reliée à l'annuaire, et **main courante EN AJOUT SEUL** (migration `041`) : chaînée par empreinte, une entrée par incident, refusée en modification par les quatre couches du §12. ⚠️ Pas de runbook exécutable — ce n'est pas le même objet | — |
| 44 | BIA / RTO / RPO | ✅ | Module dédié | — |
| 45 | **PCA/PRA scénarios et exercices** | ✅✅ | **Quatre modules dédiés**, étapes RACI, exercices. Au-dessus de tout GRC généraliste | — |
| 46 | Gestion de crise | ✅ | Module crise + fiches réflexes imprimables | — |

### I. Plan d'actions et opérations — 2 ✅ · 1 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 47 | Plan d'action unique multi-sources | ✅ | Actions reliées à exigence, **mesure**, risque, incident, audit | — |
| 48 | Kanban / échéancier | ✅ | Échéancier consolidé excellent (**9 sources** depuis L24 : actions, MCO, revues documentaires, incidents, audits, revues de direction, questionnaires fournisseurs, contrats de tiers, campagnes du Groupe — plus calendrier, ICS, Excel). **Kanban ✅ le 21/09/2026** (L17, action A5) : une VUE de `/actions`, colonnes par statut, glisser-déposer **et** deux boutons de déplacement par carte — *une fonctionnalité qui n'existe qu'à la souris est absente pour une partie des utilisateurs* —, filtre par responsable, et une action au statut hors vocabulaire **montrée** plutôt que masquée | L17.5 |
| 49 | Notifications / escalade | ✅ | L12 : relances SMTP sur 6 types d'échéances | — |
| 50 | Renvoi vers Jira / ServiceNow | ❌ | Absent | L22.6 |

### J. Vulnérabilités et posture technique — 0 ✅ · 1 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 51 | Registre de vulnérabilités enrichi | ❌ | Absent | **—** |
| 52 | Ingestion des scanners | 🟡 | **Remesuré le 19/09.** Le **cadre** de connecteurs existe (L22.4) et un scanner y entre sans architecture nouvelle : un genre de plus, un exécuteur, des réglages déclarés. ❌ **Aucun scanner n'est branché** — le catalogue livré est sauvegarde, antivirus, annuaire | L22.5 |
| 53 | Posture / surface d'attaque | ❌ | Absent | **—** |

> **Non-objectif assumé** : le produit doit **ingérer** un scanner par un connecteur, pas
> en devenir un (`PLAN_PRODUIT.md` §6).

### K. Actifs et cartographie — 3 ✅ · 0 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 54 | Inventaire et criticité DICP | ✅ | Module actifs | — |
| 55 | **Dépendances, impact, SPOF** | ✅✅ | Graphe SVG maison, dépendances typées, propagation transitive, SPOF ; « sauvegardé par » ne propage pas de panne. **Rare dans un GRC** | — |
| 56 | Synchro CMDB / découverte | ❌ | Saisie manuelle — point fort de ServiceNow IRM | L22.5 (partiel) |
| 57 | Cartographie du SI (ANSSI) | ✅ | Exportable PNG/SVG | — |

### L. Pilotage, reporting et direction — 4 ✅ · 0 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 58 | Tableaux de bord par rôle | ✅ | Dashboard, Synthèse Direction, vision Groupe | — |
| 59 | KPI / KRI historisés | ✅ | Table `history`, 6 sparklines, KRI à seuils | — |
| 60 | Board reporting | ✅ | Impression PDF native **+ rapport HTML autonome hors-ligne** | — |
| 61 | Pilotage par la valeur / coût | ❌ | Absent — argument central de Tenacy | **—** |
| 62 | Comparaison inter-entités | ✅ | Un domaine hors droits rend **`null`, jamais zéro** | — |
| 63 | Benchmarks sectoriels | ❌ | Absent — **non-objectif** : suppose de transmettre les données du client | **—** |

### M. Multi-entités et gouvernance de groupe — 4 ✅ · 0 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 64 | **Cloisonnement strict et délégation** | ✅✅✅ | RLS **activée et forcée sur 50 tables**, propriétaire compris ; FK et unicités **composites** ; périmètre résolu par le serveur, revérifié à chaque requête. **Plus rigoureux que le multi-tenant applicatif de la majorité des SaaS** | — |
| 65 | Socle Groupe / adaptation locale | ✅✅ | `mesure_catalogue` / `mesure_mise_en_oeuvre` ; `risque_catalogue` mixte ; `documents.filiale_id` nul = portée Groupe | — |
| 66 | Campagne poussée du Groupe | ✅ | **L24.1 livré le 18/09/2026** (migration `044`) : `campagnes` est de niveau **Groupe** — la demande est commune —, `campagne_filiales` porte la **part** de chacune et reste cloisonnée. Une filiale ne voit ni la part de la voisine ni leur **nombre**, et un essai le mesure par la route. La convocation est la seule écriture du produit qui nomme des filiales : trois barrières, et un refus indistinguable de « n'existe pas » | **L24.1** |
| 67 | Comparabilité garantie | ✅ | L'écran Socle **refuse de coter**, pour que les 20 filiales restent comparables | — |

### N. Intelligence artificielle — 1 ✅ · 2 🟡 · 2 ❌

| # | Fonctionnalité | État | Lot |
|---|---|---|---|
| 68 | Agent de conformité / détection d'écarts | ❌ | **Délibérément hors des cinq usages arbitrés.** Un « agent » qui détecte des écarts **décide** de la conformité ; les cinq usages de L27 **proposent** et n'écrivent rien. ⚠️ La détection d'écarts, elle, est livrée **sans IA** — c'est le CCM du lot L23, qui constate au lieu de deviner | **L23**, et non L27 |
| 69 | Génération de réponses et de politiques | 🟡 | **L27 construit le 19/09** : « brouillon de politique » et « réponse à un questionnaire » sont deux des cinq usages. ⚠️ Un brouillon **ne se publie pas** : le circuit d'approbation (`GRC06`) reste seul maître, et l'écran le dit. Reste 🟡 pour la même raison que la ligne 36 — le cadre est là, le modèle s'installe | **L27** |
| 70 | Suggestion automatique de mapping | ✅ | **L26.4 livré le 19/09/2026, et SANS IA** — similarité de libellés (Jaccard sur les mots de quatre lettres et plus, accents retirés), score rendu, seuil affiché. ⚠️ Elle **propose** ; un humain crée. Et les exigences SANS proposition restent dans la liste : leur absence dit où la couverture manque | L26.4 |
| 71 | Recherche universelle, palette, MCP | 🟡 | **Palette `Ctrl+K` livrée** (L17, A3), sans IA ni MCP. Reste L17.1, L17.2 |
| 72 | Assistants d'évaluation fournisseur | ❌ | **Hors des cinq usages, et c'est un arbitrage.** Un assistant qui « évalue » un fournisseur porte un jugement ; le produit en fait un **score composite dérivé** de critères écrits (L21.3), qu'un humain peut relire ligne à ligne. *Un score qu'on peut refaire à la main vaut mieux qu'un avis qu'on ne peut pas contester.* | **L21.3**, et non L27 |

> ✅ **Arbitrage A1 tranché le 08/09/2026** : le modèle **local** est le chemin nominal, et
> un fournisseur **externe de confiance** reste possible, encadré par **six barrières** dont
> une seule est un texte (`PLAN_PRODUIT.md` §7 et lot **L27**). ⚠️ La première barrière n'est
> pas l'avertissement : c'est que `IPAddressDeny=any` de l'unité systemd **ferme la sortie
> réseau** tant que l'exploitant ne l'ouvre pas à la main.

### O. Sensibilisation et formation — 0 ✅ · 0 🟡 · 2 ❌

| # | Fonctionnalité | État | Lot |
|---|---|---|---|
| 73 | Modules de formation et campagnes | ❌ | **—** (marché saturé de spécialistes) |
| 74 | Phishing simulé, complétion reliée à la conformité | ❌ | L22 (connecteur : reverser le taux de complétion comme preuve) |

### P. Trust Center et preuve externe — 0 ✅ · 0 🟡 · 2 ❌

| # | Fonctionnalité | État | Lot |
|---|---|---|---|
| 75 | Page de confiance publique | ❌ | **Revu après L28, et l'arbitrage est écrit.** Un composant exposé existe désormais — le portail —, et la même mécanique rendrait une page de confiance techniquement atteignable. ⚠️ **Je ne l'élargis pas de moi-même** : l'utilisateur a validé un **portail fournisseur**, pas « publier nos preuves de conformité sur Internet », et confondre les deux serait s'accorder une permission qu'on n'a pas reçue. À poser comme une question, le jour où un client le demande |
| 76 | Partage de documents sous NDA | ❌ | **—** même remarque |

### Q. RGPD et vie privée — 2 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 77 | Registre art. 30 et AIPD | ✅ | Registre de l'article 30 (`traitements`, mixte depuis la `027`) **et AIPD de l'article 35** (`analyses_impact`, migration `039`). ⚠️ L'AIPD **POINTE** le registre, elle ne le recopie pas — aucune colonne commune, mesuré dans le catalogue. Et la route rend **aussi les traitements SANS analyse**, avec une **présomption** qui ne décide pas | — |
| 78 | DSAR, consentements, violations | 🟡 | **Remesuré le 18/09** : DSAR ✅ (20.4 — les six droits des art. 15 à 21 **plus le retrait de consentement** de l'art. 7 §3, échéance dérivée, refus motivé ET daté) ; violations ✅ (registre d'incidents + horloge NIS2/RGPD de 20.1). ❌ **Un REGISTRE de consentements reste absent** : le produit traite la demande de retrait, il ne tient pas les consentements | **DSAR livré** (migration `040`) : registre des articles 15 à 22, **délai d'un mois DÉRIVÉ** de la réception (art. 12 §3), prorogation qui exige d'avoir été notifiée, refus qui exige d'être motivé ET daté (art. 12 §4). Les **violations** passent par `incidents` et l'horloge 20.1. ⚠️ **Les consentements restent absents** : ni recueil, ni preuve, ni retrait tracé — seul le retrait ARRIVANT par une demande est enregistré | L20 |
| 79 | Convergence privacy + sécurité | ✅ | `traitement_mesures` relie les traitements **au pivot mesure** — l'argument OneTrust, en plus modeste | — |
| — | *Hors grille* — purge RGPD outillée | ✅ | `POST /api/cycle/purge-rgpd` : suppression de fiche **et anonymisation dans les entités**. Très peu de GRC l'outillent | — |

### R. Plateforme et non-fonctionnel — 6 ✅ · 1 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 80 | SSO / MFA / SCIM / RBAC | 🟡 | **RBAC excellent** : 3 axes, **20 domaines**, 4 niveaux, groupes AD avec appartenance **indirecte**. LDAPS écrit à la main. **MFA ❌ SAML/OIDC ❌ SCIM ❌** | L22 (jetons), à arbitrer |
| 81 | **Journal d'audit inaltérable** | ✅✅✅ | Ajout seul, **chaîné par empreinte**, rôle applicatif sans `DELETE` ni droit de désarmer un déclencheur, 4 couches, vérification de chaîne, rétention outillée, ~29 types d'actions. **Au-dessus du marché** | — |
| 82 | **Souveraineté** | ✅✅✅ | On-premise, sans conteneur, **aucun CDN, aucun service tiers, aucune donnée qui sort**. SecNumCloud sans objet | — |
| 83 | Multilingue FR / EN | ✅ | L10 + L11, ISO 27002 à 200/201 chaînes | — |
| 84 | On-premise | ✅ | **Différenciateur rare** : le marché est SaaS-only | — |
| 85 | Interface non-experts | ✅✅ | `Help.tip()` systématique. Or « interface trop complexe » est le premier *red flag* des grilles de choix françaises | L17, L18 |
| 86 | Coût total de possession | ✅ | Pas de licence, hébergement client, pas de coût de sortie | L18 |

---

## 2. Les sept points où le produit dépasse le marché

Recopiés ici parce qu'un plan d'amélioration doit d'abord dire **ce qu'il n'a pas le droit
d'abîmer** :

1. **Cloisonnement multi-filiales par RLS forcée** (#64) — dans le moteur, pas dans le code
   applicatif ;
2. **Journal chaîné en ajout seul** (#81) — garanti par les privilèges de la base ;
3. **Cartographie de dépendances, impact et SPOF** (#55) ;
4. **Profondeur PCA/PRA** (#45) — territoire des spécialistes de la résilience ;
5. **Séparation catalogue Groupe / mise en œuvre Filiale** (#15, #65) ;
6. **Réversibilité totale** (#24) — argument que les SaaS redoutent ;
7. **Pédagogie intégrée** (#85) — répond au premier motif d'échec des déploiements GRC.

Plus **AirCyber à 234 questions**, que personne d'autre ne porte.

---

## 3. Sources

Relevé du 08/09/2026.

**Marché français** — [NIS2 Radar, comparatif des solutions
GRC](https://nis2-radar.com/comparatifs/solutions-grc-comparatif/) ·
[Tenacy, fiche produit](https://www.tenacy.io/p/fiche-produit/) ·
[EGERIE Risk Manager](https://www.isit.fr/fr/produit/egerie-risk-manager.php) et
[Club EBIOS](https://club-ebios.org/site/egerie-risk-manager/) ·
[CISO Assistant, dépôt communautaire](https://github.com/intuitem/ciso-assistant-community) ·
[Make IT Safe, grille de choix RSSI/DPO](https://www.makeitsafe.fr/outil-grc-grille-de-choix/) ·
[Cyber Analyse, NIS2 sans RSSI dédié](https://cyber-analyse.com/analysis/nis2-quel-plateforme-choisir/) ·
[Silicon, outils de conformité IT 2026](https://www.silicon.fr/cybersecurite-1371/les-meilleurs-outils-de-gestion-de-la-conformite-it-en-2026-227721)

**Marché international** —
[vCSO.ai, matrice de capacités 2026](https://vcso.ai/learn/best-grc-tools-2026/) ·
[Centraleyes, 12 meilleurs outils GRC](https://www.centraleyes.com/best-grc-tools/)

**Cadre et réglementation** —
[Gartner, définition de l'Integrated Risk Management](https://www.gartner.com/en/information-technology/glossary/integrated-risk-management-irm) ·
[CIRM, catégorie Gartner formalisée en janvier 2026](https://ir-os.com/articles/cirm-category-explained) ·
[Registre d'informations DORA](https://bastion.tech/learn-fr/dora/register-of-information/) ·
[Automatiser le registre d'information TIC](https://www.finengyadvisory.fr/post/dora-registre-information)
