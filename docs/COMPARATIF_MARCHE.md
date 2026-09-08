# Comparatif marché — les 86 fonctionnalités de l'état de l'art GRC

> **Établi le 08/09/2026.** C'est l'**instrument de mesure** du
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

**Verdict global au 08/09/2026 : 35 ✅ · 17 🟡 · 34 ❌** — soit ~51 % en pondérant les
partiels à moitié. **Cible du `PLAN_PRODUIT.md` une fois les douze lots joués : 76 ✅ · 2 🟡
· 8 ❌**, les huit restantes étant des non-objectifs nommés un par un (§9 du plan).

⚠️ **Ce chiffre brut est trompeur, et c'est le point central.** Les 34 absences ne sont
pas réparties : **19 d'entre elles tiennent dans quatre blocs entiers** (D intégrations,
F tiers, J vulnérabilités, N intelligence artificielle). Hors ces quatre domaines, la
couverture est de **~70 %**, avec un niveau d'exigence technique qui dépasse le marché sur
plusieurs points (§2).

---

## 1. La grille

Légende : ✅ couvert · ✅✅ au-dessus du marché · 🟡 partiel · ❌ absent.
La colonne **Lot** renvoie au lot du `PLAN_PRODUIT.md` qui comble la ligne ; « — » signale
un non-objectif assumé (`PLAN_PRODUIT.md` §6).

### A. Référentiels et conformité multi-normes — 2 ✅ · 2 🟡 · 3 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 1 | Catalogue large et maintenu | 🟡 | **5 référentiels, 394 exigences** (ANSSI 42, ISO 27002 93, NIS2 10, DORA 15, AirCyber 234). Largeur faible face à 50 (Tenacy) et 200+ (CISO Assistant) ; profondeur réelle | L26 |
| 2 | Veille réglementaire intégrée | ❌ | Catalogues **statiques en fichiers JS** : une évolution de norme est une livraison de code | L26 |
| 3 | Mapping inter-référentiels | ✅ | Module `/mapping`, 28 groupes + surcouche éditable, propagation « zéro double saisie ». Manque la suggestion automatique | L26.4 |
| 4 | Référentiels personnalisés | ❌ | Aucun chemin utilisateur : c'est du code | L26 |
| 5 | Campagnes d'évaluation | ❌ | Ni envoi à des contributeurs, ni relance, ni suivi par répondant | L24 |
| 6 | Déclaration d'applicabilité (SoA) | ✅ | Générée, avec couverture croisée | — |
| 7 | Référentiels FR/EU spécifiques | 🟡 | ANSSI ✅ NIS2 ✅ DORA ✅ RGPD ✅ ISO ✅ AirCyber ✅ ; **EBIOS RM ❌ ReCyF ❌ HDS ❌ SecNumCloud ❌** | L25, L26 |

### B. Gestion des risques — 3 ✅ · 2 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 8 | Registre, brut / résiduel | ✅ | `risques` : `f_frequence`, `g_gravite`, `m_maitrise`, scores, bornes contraintes en SQL. **Échelles non configurables** | L25.3 |
| 9 | **EBIOS RM outillé** | ❌ | Aucun atelier, aucune source de risque, aucun chemin d'attaque. La « matrice EBIOS » est une matrice de criticité, pas la méthode | **L25** |
| 10 | Quantification financière (FAIR) | ❌ | Absent. Cotation qualitative seule | L25.4 |
| 11 | Bases de connaissances expertes | 🟡 | `risque_catalogue` (migration `012`) porte un socle de risques Groupe. Pas de catalogue de menaces ni de vulnérabilités types | L25.5 |
| 12 | Acceptation de risque avec workflow | ✅ | Circuit typé, et `empreinte_objet` **périme l'approbation quand l'objet change** — plus fin que la moyenne | — |
| 13 | Appétence / seuils | 🟡 | KRI à seuils dans la Synthèse Direction ; pas d'appétence paramétrable | L25 |
| 14 | Agrégation multi-entités | ✅ | `GET /api/consolidation`, module `/groupe` | — |

### C. Mesures et contrôles — 1 ✅ · 2 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 15 | **Bibliothèque de contrôles unique** | ✅✅ | Pivot « Mesure », scindé `mesure_catalogue` (Groupe) / `mesure_mise_en_oeuvre` (Filiale), n-n vers les exigences. **Séparation plus propre que la plupart des produits** | — |
| 16 | Contrôles périodiques planifiés | 🟡 | `mco_actions` porte fréquence et dates, mais c'est le MCO du PRA — pas un contrôle périodique sur les mesures | L19.5 |
| 17 | **Continuous Control Monitoring** | ❌ | Aucun test automatisé, aucune donnée système. **Fracture n°1 du marché 2026** | **L23** |
| 18 | Exceptions / dérogations datées | ❌ | `non applicable` existe ; la dérogation avec propriétaire, motif et expiration n'existe pas | L19.2 |
| 19 | Maturité et efficacité distinctes | 🟡 | Maturité 0–5 ✅, statut ✅ ; l'efficacité n'est pas une dimension séparée | L19.6 |

### D. Preuve et intégrations — 1 ✅ · 2 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 20 | Connecteurs natifs | ❌ | **Zéro.** Face à 375 (Vanta), 200 (Drata), ~25 (Tenacy) | **L22.5** |
| 21 | Collecte automatique de preuves | ❌ | Dépôt manuel uniquement | **L23.1** |
| 22 | Registre d'artefacts, réutilisation | 🟡 | Coffre excellent (32 tables porteuses, SHA-256 vérifié, ClamAV, quarantaine, version en vigueur) ; **une pièce appartient à un seul porteur** | L19.4 |
| 23 | API REST / CLI / webhooks / ITSM | 🟡 | 31 routes, mais **internes** : session par cookie, pas de jeton, pas de webhook | **L22** |
| 24 | Import / export / réversibilité | ✅✅ | Import **20 entités** CSV+XLSX (format lu à la signature binaire), transactionnel, idempotent, cloisonné, journalisé ; export complet ; reprise v1→v12. **Meilleur que la plupart des SaaS** | — |

### E. Gestion documentaire et politiques — 3 ✅ · 1 🟡 · 2 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 25 | Cycle de vie complet | ✅ | `brouillon → en vigueur → à réviser → obsolète` ; publication soumise au circuit (**`GRC06`**) | — |
| 26 | Versionnage / version en vigueur | ✅ | Migration `018` : au plus une par porteur **et par filiale**. Comparaison de deux versions ❌ | L17.6 |
| 27 | **Attestation de lecture** | ❌ | Absent. Preuve d'audit **ISO 27001 A.5.1** ; standard chez Vanta/Drata | **L19.1** |
| 28 | Canevas de politiques | ✅ | Livrés au chantier 5 | — |
| 29 | Politique ↔ contrôle ↔ exigence | 🟡 | `document_referentiels` relie au référentiel ; **pas de lien au pivot mesure** | L19.3 |
| 30 | Recherche plein texte | ❌ | Action **D3**, reportée après S8 par arbitrage écrit | **L17.1** |

### F. Tiers et chaîne d'approvisionnement — 1 ✅ · 0 🟡 · 5 ❌

> **Domaine le plus faible du produit.**

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 31 | Registre fournisseurs criticité / accès | ✅ | `prestataires` : criticité × accès → niveau inhérent, checklist `supply_chain` NIS2/DORA | L21.4 |
| 32 | Questionnaires et portail fournisseur | ❌ | Absent | L21.2 (export/réimport) puis **L28** (portail exposé, ✅ **validé le 08/09/2026**) |
| 33 | Notation externe / surface d'attaque | ❌ | Absent — **non-objectif**, suppose un service tiers. ⚠️ **À réexaminer après L27**, dont la mécanique le rendrait atteignable — mais l'utilisateur a autorisé une **IA** externe, pas « les services tiers » en général | **—** |
| 34 | **Registre d'information DORA** | ❌ | Ni LEI, ni dates contractuelles, ni chaîne de sous-traitance. **Remise ACPR au 31/03/2026** | **L21.1** |
| 35 | Suivi contractuel / plan de sortie | ❌ | Absent | L21.3 |
| 36 | Réponse IA aux questionnaires reçus | ❌ | Absent | **L27** |

### G. Audit — 2 ✅ · 2 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 37 | Univers d'audit / plan pluriannuel | 🟡 | Audits datés et planifiables ; ni univers, ni plan pluriannuel | L24 |
| 38 | Constats → action → clôture | ✅ | **Grille générée depuis un référentiel** (avec les preuves à demander), typologie de constats, taux calculé | — |
| 39 | Espace auditeur externe | 🟡 | Profil `AUDITEUR` avec domaines restreints, mais **compte AD interne** — pas un accès invité | L24.4 |
| 40 | Rapport d'audit approuvé | ✅ | Circuit typé `audit` + génération PDF | — |

### H. Incidents et résilience — 3 ✅ · 2 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 41 | Registre et délais réglementaires | 🟡 | `declaration_anssi` / `declaration_cnil` en 3 états, aide 24 h/72 h, échéance +72 h. **Pas d'horloge armée sur les 3 paliers NIS2** | **L20.1** |
| 42 | Génération des formulaires de notification | ❌ | Absent | **L20.2** |
| 43 | CIRM (runbooks, main courante) | 🟡 | Fiches réflexes par rôle, contacts, cellule de crise reliée à l'annuaire. **Main courante horodatée ❌** | L20.5 |
| 44 | BIA / RTO / RPO | ✅ | Module dédié | — |
| 45 | **PCA/PRA scénarios et exercices** | ✅✅ | **Quatre modules dédiés**, étapes RACI, exercices. Au-dessus de tout GRC généraliste | — |
| 46 | Gestion de crise | ✅ | Module crise + fiches réflexes imprimables | — |

### I. Plan d'actions et opérations — 2 ✅ · 1 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 47 | Plan d'action unique multi-sources | ✅ | Actions reliées à exigence, **mesure**, risque, incident, audit | — |
| 48 | Kanban / échéancier | 🟡 | Échéancier consolidé excellent (6 sources, calendrier, ICS, Excel). **Kanban ❌** | L17.5 |
| 49 | Notifications / escalade | ✅ | L12 : relances SMTP sur 6 types d'échéances | — |
| 50 | Renvoi vers Jira / ServiceNow | ❌ | Absent | L22.6 |

### J. Vulnérabilités et posture technique — 0 ✅ · 0 🟡 · 3 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 51 | Registre de vulnérabilités enrichi | ❌ | Absent | **—** |
| 52 | Ingestion des scanners | ❌ | Absent | L22 (connecteur) |
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

### M. Multi-entités et gouvernance de groupe — 3 ✅ · 0 🟡 · 1 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 64 | **Cloisonnement strict et délégation** | ✅✅✅ | RLS **activée et forcée sur 50 tables**, propriétaire compris ; FK et unicités **composites** ; périmètre résolu par le serveur, revérifié à chaque requête. **Plus rigoureux que le multi-tenant applicatif de la majorité des SaaS** | — |
| 65 | Socle Groupe / adaptation locale | ✅✅ | `mesure_catalogue` / `mesure_mise_en_oeuvre` ; `risque_catalogue` mixte ; `documents.filiale_id` nul = portée Groupe | — |
| 66 | Campagne poussée du Groupe | ❌ | Le socle existe ; **le mécanisme descendant n'existe pas** | **L24.1** |
| 67 | Comparabilité garantie | ✅ | L'écran Socle **refuse de coter**, pour que les 20 filiales restent comparables | — |

### N. Intelligence artificielle — 0 ✅ · 0 🟡 · 5 ❌

| # | Fonctionnalité | État | Lot |
|---|---|---|---|
| 68 | Agent de conformité / détection d'écarts | ❌ | **L27** |
| 69 | Génération de réponses et de politiques | ❌ | **L27** |
| 70 | Suggestion automatique de mapping | ❌ | **L27** / L26.4 |
| 71 | Recherche universelle, palette, MCP | ❌ | L17.1, L17.2 (**sans IA**) |
| 72 | Assistants d'évaluation fournisseur | ❌ | **L27** |

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
| 75 | Page de confiance publique | ❌ | **—** sans objet en VPN. ⚠️ **À revoir après L28** : un composant exposé existera |
| 76 | Partage de documents sous NDA | ❌ | **—** même remarque |

### Q. RGPD et vie privée — 1 ✅ · 2 🟡 · 0 ❌

| # | Fonctionnalité | État | Mesure | Lot |
|---|---|---|---|---|
| 77 | Registre art. 30 et AIPD | 🟡 | Registre art. 30 **complet** (base légale contrainte à 6 valeurs, transferts, durées). **AIPD ❌** | L20.3 |
| 78 | DSAR, consentements, violations | 🟡 | Violations couvertes via incidents + `declaration_cnil`. **DSAR ❌** | L20.4 |
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
