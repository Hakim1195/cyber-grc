# Plan de refonte serveur — Cyber GRC Groupe

> Plan définitif de passage de l'application 100 % navigateur à une **application
> client/serveur multi-filiales**, déployée sur site chez un groupe industriel.
> Contexte produit : `CLAUDE.md`. Schéma actuel : `DATA_MODEL.md`. Dette : `AUDIT.md`.
>
> Ce document est la référence de cadrage. Il fige les décisions, décrit l'architecture
> cible, le schéma de données, le modèle de droits, et découpe le projet en lots livrables.

Légende : ✅ acté · 🔴 chemin critique

---

## 0. Cadrage

### 0.1 Objet

Le client est un **groupe industriel en expansion** (plus de vingt filiales, acquisitions
régulières, sites en France et à l'étranger). L'outil doit devenir le support **officiel**
de sa gouvernance et de sa résilience cyber — c'est-à-dire servir de preuve en audit
ISO 27001 et de tableau de bord de la conformité NIS2/DORA/AirCyber.

Trois exigences structurent tout le reste :

1. **Cloisonnement par filiale** — chaque site possède ses propres données, sans exception.
2. **Consolidation Groupe** — la direction dispose d'une vue agrégée sur l'ensemble.
3. **Aucune perte, aucun conflit** — plusieurs utilisateurs travaillent simultanément.

### 0.2 Décisions actées

| Sujet | Décision |
|---|---|
| Déploiement | VM **Debian 13** sur Proxmox, au siège du groupe. **Pas de conteneurs** (contrainte client). |
| Accès | LAN du siège, **VPN site-à-site** pour les filiales, **VPN client** pour les nomades. Aucune exposition Internet. |
| Frontal | **Apache2** en reverse proxy, HTTPS obligatoire, certificat issu de la **PKI interne**. |
| Backend | **Node.js + TypeScript** — permet de réutiliser la logique métier déjà écrite en JS (échéances, scoring, propagation, migrations). |
| Base de données | **PostgreSQL**, modèle relationnel, cloisonnement par **Row Level Security**. |
| Authentification | **Active Directory** (LDAP), groupes AD pilotant périmètre et droits. |
| Modèle de droits | **Trois axes** : périmètre × profil métier × domaine fonctionnel. |
| Langues | **Français et anglais obligatoires**, espagnol souhaitable. Choix mémorisé par utilisateur. |
| Import | **Généralisé à tous les modules** — critère décisif pour l'intégration des sociétés rachetées. |
| Pièces jointes | **Intégrées**, avec chaîne de contrôle antimalware. |
| Journalisation | **Inaltérable**, niveau ISO 27001, rétention **3 ans**. |
| Circuit d'approbation | Documents **+ acceptation des risques + rapports d'audit**. |
| Marque | **Par filiale** (logo, raison sociale, coordonnées) sur écrans, rapports et exports. |
| Disponibilité | **99 %** — pas de haute disponibilité, VM unique suffisante. |
| RTO / RPO | Demande client 24 h ; **cible retenue : RPO de quelques minutes, RTO de 2 à 3 h**. |
| Rétention | **3 ans**, puis archivage ou purge. Sortie de filiale traitée. |
| Version locale | **Abandonnée.** Cible unique : client/serveur. |
| Documentation | **Incluse au projet** (guide utilisateur + guide d'exploitation). |

### 0.3 Hypothèses validées

Retenues par défaut lors du cadrage, puis confirmées par le client.

- Certificat serveur émis par la **PKI interne** du groupe (ADCS), déployé sur les postes par GPO.
- **Authentification forte portée par le VPN** — l'application ne gère pas son propre second facteur.
- Un **compte administrateur de secours applicatif**, indépendant de l'AD, pour le cas où le
  compte de service serait bloqué (expiration de mot de passe, verrouillage).
- L'**historique des tendances démarre à la mise en service** — pas de reconstitution rétroactive.
- **Déploiement pilote sur une filiale** avant généralisation.
- La **version de l'application est tracée** dans le journal, pour qu'un rapport produit
  deux ans plus tôt reste attribuable.
- Les **sessions expirent** après inactivité (durée paramétrable, 30 min par défaut).

### 0.4 Hors périmètre

- La version 100 % navigateur : abandonnée, non maintenue.
- Toute exposition publique de l'application.
- Le stockage des textes normatifs (règle inchangée : reformulations originales uniquement).

### 0.5 Séparation socle / spécifique

Le code est organisé pour distinguer **le socle produit réutilisable** de **la configuration
propre à ce client** (nomenclature des groupes AD, profils métier, chartes graphiques,
référentiels applicables). Aucune valeur propre au client n'est écrite en dur.

Cette discipline a deux mérites : elle rend le socle réutilisable, et elle matérialise la
frontière entre ce qui est spécifique à ce déploiement et ce qui ne l'est pas.

---

## 1. Architecture technique et sécurité

### 1.1 Vue d'ensemble

```
                    ┌─────────────────────────────────────────┐
   VPN site-à-site  │  VM Debian 13 (Proxmox, siège)          │
   VPN client       │                                         │
        │           │  Apache2  ── TLS, en-têtes de sécurité   │
        └──────────►│     │      reverse proxy                 │
                    │     ▼                                    │
                    │  Service Node/TypeScript (systemd)       │
                    │     │  API REST · sessions · droits      │
                    │     │  moteur d'import · journal          │
                    │     ├──────────────┬──────────────┐      │
                    │     ▼              ▼              ▼      │
                    │  PostgreSQL   Magasin de     ClamAV      │
                    │  (RLS)        pièces jointes  (daemon)   │
                    │                (hors webroot)            │
                    └─────────────────────────────────────────┘
                              │                    │
                         AD (LDAPS)          Relais SMTP
```

Aucun composant n'est joignable directement : Apache est le seul point d'entrée, PostgreSQL
et ClamAV n'écoutent que sur la boucle locale.

### 1.2 Pile et déploiement

| Composant | Choix | Remarque |
|---|---|---|
| Système | Debian 13 | Sauvegardes Proxmox intégrales, gérées en interne |
| Frontal | Apache2 (`mod_proxy`, `mod_ssl`, `mod_headers`) | Termine le TLS, sert le frontend statique |
| Application | Node.js LTS + TypeScript, service **systemd** | Utilisateur dédié sans shell |
| Base | PostgreSQL, **dépôt officiel PGDG** | Maîtrise de la version dans la durée, plutôt que le dépôt Debian |
| Antivirus | ClamAV (`clamav-daemon` + `freshclam`) | Analyse à l'envoi et ré-analyse périodique |
| Ordonnancement | **timers systemd** | Instantané quotidien, ré-analyse, purges, relances |

L'absence de conteneurs impose un packaging natif, mais offre en contrepartie le
**durcissement systemd**, qui parle directement à un auditeur ISO : `ProtectSystem=strict`,
`PrivateTmp`, `NoNewPrivileges`, `ProtectHome`, capacités réduites au strict nécessaire.

**Mise à jour** : script de déploiement idempotent, migrations de schéma versionnées et
réversibles, **instantané Proxmox avant chaque montée de version** comme filet de retour arrière.

### 1.3 Principe directeur : la façade synchrone est préservée 🔴

C'est la décision qui rend le projet réalisable dans un délai raisonnable.

L'application compte **~17 100 lignes de JavaScript** et **~330 appels** répartis sur
**125 méthodes** du `DataStore`. Tout réécrire en asynchrone serait un chantier de plusieurs
mois à haut risque de régression, pour un bénéfice nul côté utilisateur.

À la place :

1. **À la connexion**, le backend renvoie l'intégralité du jeu de données de la filiale active.
   Le volume est faible — quelques milliers d'enregistrements — et la charge utile est compressée.
2. **En mémoire**, l'objet `data` reste exactement ce qu'il est aujourd'hui. Tous les modules
   continuent d'appeler `getRisques()` en synchrone, **sans modification**.
3. **En écriture**, la fonction `save()` — déjà un entonnoir unique appelé après chaque
   mutation — n'envoie plus l'instantané complet mais **une écriture ciblée sur l'entité modifiée**.
4. **Un rafraîchissement périodique** léger récupère les modifications des autres utilisateurs.
   À dix utilisateurs simultanés par filiale, un sondage suffit ; aucun temps réel n'est nécessaire.

Ce schéma a un bénéfice inattendu mais décisif : il est **le mieux adapté à une liaison VPN
internationale**. Un chargement initial de quelques secondes, puis une interface instantanée.
Un modèle interrogeant le serveur à chaque clic serait pénible depuis un site distant.

### 1.4 Concurrence et intégrité

Le modèle actuel réécrit l'instantané complet à chaque enregistrement. Transposé tel quel
au serveur, **le dernier qui enregistre écrase silencieusement le travail des autres**. C'est
le principal risque technique du projet, et il est invisible tant qu'on n'est pas en production.

Parade retenue — **verrouillage optimiste par enregistrement** :

- Chaque ligne porte un numéro de version, incrémenté à chaque écriture.
- Une écriture transmet la version lue ; si elle ne correspond plus, le serveur refuse.
- L'interface affiche alors « modifié entre-temps » et propose de recharger l'enregistrement.
- Deux personnes travaillant sur deux enregistrements différents ne se gênent jamais.

Les opérations composites (propagation d'une mesure, cascades de suppression, import d'un
lot) s'exécutent dans une **transaction unique** : elles réussissent entièrement ou pas du tout.

### 1.5 Authentification et annuaire

- **Liaison LDAPS** vers l'AD, avec un compte de service en lecture seule.
- Résolution des **groupes AD imbriqués** (une appartenance indirecte doit être reconnue).
- À la connexion : vérification des identifiants, lecture des appartenances, dérivation du
  périmètre et des droits, création d'une session serveur.
- **Provisionnement automatique** : un utilisateur inconnu mais membre d'un groupe autorisé
  est créé à sa première connexion. Aucune administration manuelle des comptes.
- **Déprovisionnement immédiat** : la désactivation du compte AD, ou le retrait du groupe,
  coupe l'accès à la connexion suivante et invalide les sessions actives.
- L'annuaire `personnes` est **alimenté depuis l'AD**, ce qui remplace l'actuelle
  correspondance par nom en texte libre — les affectations (« mes actions », « mes échéances »)
  deviennent fiables.

### 1.6 Pièces jointes — chaîne de contrôle

**Aucun dispositif ne garantit l'absence de malware** : un antivirus a un taux de détection
partiel, et un PDF peut embarquer du script par conception. Ce qui est atteignable, et
défendable en audit, est une défense en profondeur où chaque couche rattrape les angles
morts de la précédente.

| # | Contrôle | Objet |
|---|---|---|
| 1 | **Liste blanche** de types (PDF, bureautique, images, texte) | Une liste noire est toujours incomplète |
| 2 | **Rejet des formats à macros** (`.docm`, `.xlsm`, `.pptm`), exécutables, archives | Vecteurs classiques |
| 3 | **Vérification par signature binaire**, pas par extension | Un exécutable renommé en `.pdf` est refusé |
| 4 | **Analyse ClamAV** avant écriture définitive, quarantaine sinon | Détection connue |
| 5 | **Stockage hors arborescence web**, nom aléatoire opaque | Apache ne sert jamais ces fichiers |
| 6 | **Délivrance par l'application** après contrôle des droits, en téléchargement forcé (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`) | Rien ne s'exécute dans le contexte du navigateur |
| 7 | **Ré-analyse périodique** du stock | Un fichier propre aujourd'hui peut être détecté dans six mois — décisif sur 3 ans de rétention |
| 8 | **Quotas par filiale** et taille maximale par fichier | Maîtrise du volume |

**Empreinte SHA-256 calculée à l'envoi et stockée.** Ce n'est pas une mesure antimalware :
c'est ce qui transforme une pièce jointe en **preuve vérifiable**. Un auditeur peut s'assurer
qu'un rapport de test PRA n'a pas été remplacé après coup.

**Cas particulier des logos de filiale** : même chaîne de contrôle, et **PNG ou JPEG
exclusivement — pas de SVG**, qui peut contenir du script et deviendrait un vecteur
d'injection directement dans l'interface.

**Volumétrie estimée** : de l'ordre de 10 à 15 Go pour vingt filiales sur trois ans.

### 1.7 Journal d'audit inaltérable

L'outil servant à **justifier officiellement** la gouvernance du groupe, un auditeur posera
la question : *« le RSSI peut-il modifier le journal ? »*. Si la réponse est oui, le journal
ne prouve rien.

- **Table en ajout seul** : ni mise à jour ni suppression, y compris pour un administrateur
  applicatif (droits PostgreSQL restreints, aucun point d'entrée d'écriture dans l'API).
- **Chaînage par empreinte** : chaque entrée intègre l'empreinte de la précédente, ce qui
  rend toute altération détectable même par accès direct à la base.
- **Couverture** : connexions réussies **et échouées**, refus d'autorisation, création /
  modification / suppression avec valeurs avant et après, actions d'administration
  (création de filiale, changement de droits), **imports** et **exports**.
- **Les exports sont journalisés au même titre que les modifications** — savoir qui a extrait
  quelles données est une exigence de sécurité autant qu'une trace d'audit.
- Horodatage sur une **source de temps synchronisée** (NTP), point systématiquement vérifié en audit.
- **Rétention 3 ans**, sauvegardé avec la base.

Le journal contenant des identités sur trois ans, il constitue lui-même un traitement de
données personnelles : **l'outil doit figurer dans le registre article 30 du groupe** —
registre qu'il héberge.

### 1.8 Sauvegarde, restauration, continuité

| Niveau | Dispositif | Perte maximale |
|---|---|---|
| Base | **Archivage continu des journaux de transactions** (WAL) vers un stockage distinct | Quelques minutes |
| Pièces jointes | Synchronisation horaire vers un second emplacement | 1 heure |
| Ensemble | Sauvegarde Proxmox intégrale de la VM, quotidienne | 24 h (filet) |

RTO réaliste : **2 à 3 heures** (restauration puis vérification). Très en deçà des 24 h demandées.

**Point de vigilance** : base et pièces jointes doivent être restaurées à un point **cohérent
entre elles**, faute de quoi des enregistrements référencent des fichiers absents. L'application
est conçue pour afficher une pièce indisponible comme telle et la journaliser, plutôt que
d'échouer. La **restauration est testée** au moins une fois avant la mise en service, puis
annuellement — sur un outil qui héberge le PCA du groupe, c'est un minimum.

**Continuité** : le VPN devient le chemin d'accès unique. Or l'outil héberge les fiches
réflexes de crise et les scénarios PRA. **L'export hors ligne des fiches de crise reste
obligatoire** : une procédure de crise qui exige le réseau pour être lue est inutilisable.

### 1.9 Durcissement applicatif

- Vérification des droits **côté serveur à chaque requête** — jamais un simple masquage d'interface.
- Cloisonnement par filiale appliqué par la **RLS PostgreSQL**, en défense en profondeur du
  filtrage applicatif : un oubli de filtre dans le code ne peut pas provoquer de fuite inter-filiales.
- Échappement systématique en sortie (l'acquis du chantier 9 est conservé), politique de
  sécurité de contenu stricte, en-têtes de sécurité posés par Apache.
- Limitation du rythme des tentatives de connexion, verrouillage temporaire.
- Aucun secret dans le frontend ; secrets serveur hors dépôt, lisibles du seul compte de service.
- Chiffrement au repos assuré par le **chiffrement disque de la VM** (le coffre navigateur disparaît).
- **Revue de sécurité et test d'intrusion avant mise en service** : un outil de cybersécurité
  compromis est un produit mort.

### 1.10 Environnement de recette

Non négociable. Seconde VM, à l'identique.

- Alimenté par une **copie réaliste de la production** — tester sur une base vide ne révèle rien.
- **Incapable d'envoyer des courriels** (relais désactivé ou redirigé vers une boîte de test).
  L'erreur classique est la campagne de relances partie de la recette vers vingt filiales.
- Toute montée de version y est validée avant production.

### 1.11 Notifications par courriel

Fonction à forte valeur (relances d'échéances, alertes de revue documentaire, incidents à
déclarer), mais **jamais bloquante** : l'application fonctionne normalement si le relais est
indisponible.

Deux difficultés propres à leur contexte (Office 365, pas de serveur local) :

- La VM doit disposer d'un **accès sortant vers Microsoft** — à vérifier au démarrage,
  potentiellement absent sur un réseau interne.
- Microsoft a largement fermé l'**authentification SMTP basique** ; selon la configuration du
  tenant, la voie moderne passe par un enregistrement d'application et OAuth2.

Le paramétrage est donc **entièrement configurable dans l'interface** (hôte, port, chiffrement,
mode d'authentification, adresse d'expédition) avec un **bouton de test**. À signaler à leur
IT : l'envoi depuis leur domaine suppose une **autorisation SPF**, sans quoi tout part en indésirable.

---

## 2. Schéma de données

### 2.1 Principes

**Relationnel là où il y a des relations à protéger, JSONB là où il y a un document figé.**

Le modèle actuel porte **huit clés étrangères implicites** (`ref_id`, `risque_id`, `client_id`,
`exigence_id`, `scenario_id`, `mesure_id`, `evaluation_id`, `incident_id`) sans aucune contrainte
pour les faire respecter. Le projet a déjà dû livrer un chantier entier pour rattraper les
**tests PRA orphelins** dont le `scenario_id` pointait dans le vide. En PostgreSQL, un
`ON DELETE CASCADE` rend cette classe de défaut structurellement impossible.

À l'inverse, certaines structures **doivent rester des documents**. `audits.items[]` est
explicitement décrit comme « un instantané autoportant, le texte est figé au moment de la
génération, gage d'intégrité de l'audit » : le normaliser détruirait la garantie construite
à dessein. Restent donc en JSONB : la grille et les constats d'audit, les étapes RACI des
scénarios PRA, les exigences de chaîne d'approvisionnement des prestataires, et les
indicateurs d'historique.

Les **catalogues statiques** (référentiels, modèles d'audit, correspondances par défaut)
restent des fichiers, hors base — aucun changement de ce côté.

### 2.2 Découpage Groupe / Filiale / Mixte

C'est la décision la plus structurante : **une vision Groupe n'a de sens que si les filiales
partagent un socle commun.** Si chaque site invente son catalogue de contrôles et son échelle
de cotation, le tableau de bord de la direction additionne des grandeurs incomparables.

| Entité | Niveau | Justification |
|---|---|---|
| `mesures` (catalogue) | **Groupe** | Socle de contrôles commun — condition de la comparabilité |
| `mappings` | **Groupe** | Correspondances inter-référentiels, définies une fois |
| Échelle de cotation des risques | **Groupe** | Sans quoi les risques ne s'additionnent pas |
| Référentiels applicables | **Groupe + local** | Socle imposé, ajouts possibles par filiale |
| `documents` | **Mixte** | Politique groupe applicable partout + procédures locales |
| `personnes` | **Mixte** | Annuaire alimenté par l'AD, rattachement par filiale |
| `clients` (donneurs d'ordre) | Filiale | Chaque site a ses propres contrats |
| `exigences` | Filiale | |
| `evaluations` | Filiale | La mise en œuvre diffère d'un site à l'autre |
| `risques`, `actifs`, `processus` | Filiale | |
| `actions`, `mco_actions` | Filiale | |
| `incidents` | Filiale | |
| `crise`, `scenarios_pra`, `tests_pra` | Filiale | |
| `prestataires` | Filiale | |
| `audits`, `revues` | Filiale | |
| `traitements` (RGPD) | Filiale | Chaque entité juridique tient son propre registre |
| `history` | Filiale + agrégat Groupe | |

#### Une conséquence importante : scinder `mesures`

L'entité `mesures` porte aujourd'hui **deux choses de nature différente** : la *définition*
du contrôle (nom, description) et son *évaluation* (statut, maturité, responsable). En
contexte de groupe, elles ne vivent pas au même niveau.

- **La définition appartient au Groupe** : « chiffrement des postes de travail » est le même
  contrôle partout, et c'est ce qui rend les filiales comparables.
- **La mise en œuvre appartient à la filiale** : son statut, sa maturité, son responsable et
  ses preuves diffèrent d'un site à l'autre.

Le schéma cible sépare donc `mesure_catalogue` (Groupe, avec possibilité de mesures locales)
de `mesure_mise_en_oeuvre` (Filiale). La propagation « au plus défavorable » vers les
évaluations s'applique alors **au sein d'une filiale**, exactement comme aujourd'hui.

#### Activation des référentiels ≠ « non applicable »

Deux mécanismes complémentaires, à ne pas confondre :

- **Activation par filiale** : quels référentiels sont dans le périmètre de ce site. Un
  référentiel non activé n'apparaît pas. Le Groupe impose un socle, la filiale peut ajouter.
- **« Non applicable » par exigence** : écarte un point précis *à l'intérieur* d'un référentiel
  pratiqué. Ce mécanisme existe déjà et reste inchangé.

S'en servir pour écarter un référentiel entier obligerait à cocher 234 cases pour AirCyber,
filiale par filiale, et fausserait les statistiques.

### 2.3 Tables du socle (nouvelles)

| Table | Rôle |
|---|---|
| `filiales` | Code, raison sociale, logo, coordonnées, pays, langue par défaut, statut (active / archivée / sortie), dates d'entrée et de sortie |
| `utilisateurs` | Identité AD, langue choisie, dernière connexion, état |
| `sessions` | Sessions serveur, expiration, périmètre et droits résolus |
| `groupes_ad` | Correspondance groupe AD → filiale + profil |
| `profils` / `profil_domaines` | Définition des profils métier et de leurs accès par domaine |
| `journal_audit` | Journal en ajout seul, chaîné par empreinte |
| `pieces_jointes` | Métadonnées, empreinte SHA-256, état d'analyse, rattachement à une entité |
| `approbations` | Circuit de validation (objet, étape, acteur, date, commentaire) |
| `referentiels_actifs` | Référentiels activés par filiale |
| `imports` | Traçabilité des imports (auteur, fichier, entité, volumes, erreurs) |
| `parametres` | Configuration (relais SMTP, seuils, rétention) |

### 2.4 Cloisonnement technique

Chaque table de niveau filiale porte une colonne `filiale_id` non nulle, et une **politique
RLS** filtrant sur la filiale de la session. Le rôle applicatif PostgreSQL ne peut pas
contourner la politique. Le périmètre est positionné en début de transaction depuis la
session serveur — **jamais depuis une valeur transmise par le navigateur**.

C'est ce qui permet d'affirmer en audit, et de démontrer, que la filiale de Toulouse ne peut
techniquement pas lire les données de la filiale allemande.

### 2.5 Liaisons n-n

Les relations aujourd'hui stockées en tableaux de chaînes deviennent des tables de liaison
avec contraintes : `risques.exigences_liees`, `actifs.risques_lies`, `processus.actifs_lies`,
`incidents.actifs_touches`, `evaluations.mesure_ids`, `traitements.mesures_ids`,
`documents.referentiels`, et `actifs.dependances` (qui conserve son type de lien en attribut
de la relation).

### 2.6 Migration depuis le modèle actuel

Le format d'export **`grc-backup`** est conservé — non plus comme mécanisme de sauvegarde
(remplacé par les sauvegardes serveur), mais comme **format d'échange** :

- reprise des données d'une filiale déjà équipée de la version locale ;
- **export d'une filiale sortant du groupe**, remis à l'acquéreur.

Les migrations `normalize` existantes (v1 → v12) sont portées côté serveur pour absorber
n'importe quel export ancien.

### 2.7 Cycle de vie et archivage

- **Rétention 3 ans**, puis archivage en lecture seule ou purge selon la nature.
- **Sortie d'une filiale** : export complet (données + pièces jointes), passage en archive
  pour la durée de rétention obligatoire, puis purge.
- **Purge RGPD** : l'annuaire, les contacts de crise et les incidents contiennent des données
  personnelles ; « on garde tout indéfiniment » n'est pas défendable, a fortiori dans un outil
  qui héberge le registre article 30 du groupe.

À noter honnêtement : **l'argument du gain de place ne tient pas pour les données** — quelques
milliers d'enregistrements par filiale ne pèsent rien. Il tient pour les **pièces jointes**,
seul volume réel. Les vrais motifs d'archivage sont le RGPD et la lisibilité.

---

## 3. Modèle de droits

### 3.1 Les trois axes

Le besoin dépasse les seuls informaticiens : le client mentionne des accès pour les **RH** et
le **service qualité**. Un modèle à deux axes (périmètre × rôle) ne suffit pas — le service
qualité a besoin des audits et des documents, pas de la cartographie des vulnérabilités.

| Axe | Valeurs |
|---|---|
| **Périmètre** | Une filiale · plusieurs filiales · Groupe entier |
| **Profil métier** | Détermine les domaines accessibles (§3.2) |
| **Niveau** | Lecture · Contribution · Validation · Administration |

Un droit est le croisement des trois. La direction dispose d'un accès **Groupe en lecture** ;
un RSSI de site n'a que sa filiale ; un RSSI groupe en cumule plusieurs.

### 3.2 Profils métier

Plutôt qu'une matrice ingérable, des profils prédéfinis :

| Profil | Domaines accessibles |
|---|---|
| **RSSI** | Tous les domaines de sa filiale |
| **Contributeur** | Actions, incidents, actifs, MCO — saisie courante |
| **Qualité** | Audits, documents, revues de direction, conformité |
| **RH** | Personnel, registre RGPD (lecture), incidents impliquant du personnel |
| **DPO** | Registre RGPD, incidents, documents |
| **Direction** | Tableau de bord, synthèse, conformité — en lecture, périmètre Groupe |
| **Auditeur** | Lecture large, aucune écriture, pour les audits externes |
| **Administrateur** | Filiales, droits, paramètres, journal |

Les profils sont **configurables** (table `profils`), non figés dans le code — c'est aussi ce
qui rend le socle réutilisable.

### 3.3 Le droit d'export est distinct de la lecture

Un utilisateur disposant d'un accès Groupe en lecture peut extraire, en un clic, la
cartographie complète des faiblesses du groupe dans un seul fichier. L'**export est donc une
permission à part entière**, accordée explicitement, et **journalisée systématiquement**.

C'est une position facile à défendre devant un auditeur, et cohérente avec la nature des
données hébergées.

### 3.4 Groupes Active Directory

L'AD du groupe est bien structuré en unités d'organisation, mais rien n'y est prévu pour cet
outil. Leur équipe créera les groupes nécessaires : ils doivent donc être **listés
explicitement**, avec une convention stricte.

```
GRC-<FILIALE>-<PROFIL>      ex. GRC-TLS-RSSI, GRC-TLS-QUALITE, GRC-DEU-CONTRIB
GRC-GROUPE-<PROFIL>         ex. GRC-GROUPE-DIRECTION, GRC-GROUPE-RSSI
GRC-EXPORT                  droit d'export, transversal
GRC-ADMIN                   administration de l'application
```

L'appartenance à un groupe suffit : aucun compte n'est créé à la main dans l'application, et
la gouvernance des accès reste chez l'IT. La liste exacte des groupes à créer sera fournie
comme livrable d'exploitation, prête à exécuter.

Précision technique : les **groupes imbriqués** doivent être résolus récursivement, une
appartenance indirecte devant être reconnue.

### 3.5 Circuit d'approbation

Étendu au-delà des seuls documents, le mécanisme étant identique :

| Objet | Circuit | Motif |
|---|---|---|
| **Documents / politiques** | Rédaction → revue → approbation → publication | « Qui a validé cette politique ? » est une question d'audit systématique |
| **Acceptation des risques résiduels** | Proposition → acceptation par le propriétaire du risque | **Exigé explicitement par l'ISO 27001** ; son absence est un constat classique |
| **Rapports d'audit interne** | Rédaction → validation | Fige le rapport et son auteur |

Chaque étape est horodatée, attribuée, journalisée, et **irréversible** une fois franchie
(une nouvelle version repart du début).

---

## 4. Internationalisation

Deux chantiers de nature très différente, à ne pas confondre.

### 4.1 L'interface — mécanique

**115 notes pédagogiques** `Help.tip()`, **32 formatages de date codés en `fr-FR`**, et
l'ensemble des libellés répartis sur une trentaine de modules. Externalisation des chaînes,
dictionnaires par langue chargés au démarrage, choix mémorisé dans le profil serveur.
Volumineux mais sans difficulté conceptuelle.

### 4.2 Les catalogues — de la traduction spécialisée

| Contenu | Volume |
|---|---|
| Exigences de référentiels (titre + aide) | **424** |
| Points de contrôle d'audit (contrôle + preuves) | **312** |
| Groupes de correspondances (thème + aide) | 28 |

Soit de l'ordre de **1 500 textes métier**. Ce n'est pas du développement : c'est de la
traduction spécialisée, relue par quelqu'un qui connaît le domaine, parce qu'un auditeur la lira.

**Deux points de vigilance :**

- **Droit d'auteur.** Les textes français sont des reformulations originales, ce qui protège le
  produit. En anglais, une reformulation fidèle d'un intitulé de l'Annexe A converge très vite
  vers le titre officiel ISO — qui est précisément le texte protégé. Traduire en **paraphrasant
  délibérément**, jamais littéralement.
- **Économie possible** : le questionnaire AirCyber (234 questions) existe probablement déjà en
  anglais dans la filière aéronautique. **À demander au client** — cela supprimerait à soi seul
  un sixième du volume.

### 4.3 Ce qui n'est pas traduit

**Les données saisies.** Un risque rédigé en français par la filiale de Toulouse restera en
français pour le lecteur allemand. C'est la norme, mais il faut le dire d'emblée.

Corollaire : ce qui se consolide proprement entre filiales, ce sont les **données structurées**
(statuts, scores, niveaux) — argument supplémentaire en faveur du socle commun du §2.2.

### 4.4 Stratégie retenue

Anglais **complet sur l'interface** dès la première version ; traduction des catalogues
**échelonnée référentiel par référentiel**, avec repli automatique sur le français tant qu'une
traduction manque. L'espagnol devient alors une simple addition de dictionnaires, sans
développement supplémentaire.

---

## 5. Import généralisé

Le client qualifie ce point de **décisif** : intégrer une société rachetée en ressaisissant à
la main ses incidents, ses actifs et ses prestataires est hors de question.

**Le point de départ est plus bas qu'attendu** : `importExcel.js` ne couvre aujourd'hui que
**trois entités sur vingt et une** (exigences, risques, actifs), avec **un seul modèle
téléchargeable**, et l'audit interne note qu'il « ne valide ni le schéma ni les types ».

Le besoin appelle un **moteur générique**, pas vingt importeurs artisanaux :

- **Description déclarative** des colonnes attendues par entité — un importeur, vingt configurations.
- **Modèle Excel téléchargeable** pour chaque entité, pour que la société rachetée le remplisse correctement.
- **Aperçu avant validation** et **rapport d'erreurs ligne par ligne**.
- **Transactionnel** : tout ou rien, jamais d'import à moitié appliqué.
- **Idempotent** : réimporter le même fichier ne duplique pas.
- **Cloisonné** : un import s'applique à la filiale active, jamais ailleurs.
- **Journalisé** : auteur, fichier, entité, volumes, erreurs.
- **Reprise complète** : import d'un export `grc-backup` pour une filiale déjà équipée.

C'est un lot de travail comparable à un module métier, et il est nommé comme tel au §7.

---

## 6. Identité visuelle par filiale

La marque est aujourd'hui inscrite **en dur à 17 endroits**, dont **10 vues imprimables** et
l'export SVG de la matrice des risques — c'est-à-dire précisément les documents qu'un auditeur
aura entre les mains.

Chaque filiale dispose donc de son **logo, sa raison sociale et ses coordonnées**, appliqués
aux écrans, aux impressions et aux exports Excel et PDF. Une société rachetée présentant un
rapport à la marque de sa maison mère, cela passe mal.

Les logos passent par la chaîne de contrôle du §1.6, **PNG ou JPEG uniquement**.

---

## 7. Lots livrables

Ordonnés par dépendance. Le chemin critique est signalé 🔴.

| # | Lot | Contenu | Dépend de |
|---|---|---|---|
| **L0** | **Socle d'infrastructure** | VM, Debian, Apache + TLS, PostgreSQL, systemd durci, recette, sauvegardes et **restauration testée** | — |
| **L1** 🔴 | **Schéma relationnel & migration** | Modèle complet, contraintes, RLS, portage des migrations v1→v12, reprise `grc-backup` | L0 |
| **L2** 🔴 | **API & bascule de la persistance** | Endpoints par entité, chargement initial, écritures ciblées, verrouillage optimiste, rafraîchissement — `save()` détourné, **modules inchangés** | L1 |
| **L3** 🔴 | **Authentification AD & droits** | LDAPS, sessions, trois axes, profils, groupes AD, droit d'export, synchronisation de l'annuaire | L2 |
| **L4** | **Multi-filiales & vision Groupe** | Cloisonnement RLS, sélecteur de filiale, scission du catalogue de mesures, activation des référentiels, consolidation direction, création de filiale | L3 |
| **L5** | **Journal d'audit** | Table en ajout seul, chaînage, couverture complète, consultation et export | L3 |
| **L6** | **Pièces jointes** | Chaîne de contrôle complète, ClamAV, empreintes, quotas, ré-analyse | L3 |
| **L7** | **Import généralisé** | Moteur déclaratif, modèles par entité, aperçu, transactionnel, idempotent | L4 |
| **L8** | **Circuit d'approbation** | Documents, acceptation des risques, rapports d'audit | L5 |
| **L9** | **Identité par filiale** | Logos, coordonnées, rapports et exports personnalisés | L4 |
| **L10** | **Internationalisation — interface** | Externalisation, dictionnaires, sélecteur, formats de date | L2 |
| **L11** | **Internationalisation — catalogues** | Traduction échelonnée des 1 500 textes métier | L10 |
| **L12** | **Notifications** | Relais SMTP configurable, relances d'échéances, alertes | L4 |
| **L13** | **Cycle de vie** | Archivage, sortie de filiale, purges RGPD, rétention | L4, L6 |
| **L14** | **Documentation** | Guide utilisateur (par profil, FR/EN), guide d'exploitation, liste des groupes AD | tous |
| **L15** | **Durcissement final** | Revue de sécurité, test d'intrusion, corrections | tous |

**Chemin critique** : L0 → L1 → L2 → L3 → L4. Tant que ces cinq lots ne sont pas livrés, rien
d'autre ne peut être mis en service. Les lots L5 à L13 sont largement parallélisables ensuite.

**Jalon de mise en service pilote** : L0 à L6 sur **une filiale**, avec la vue Groupe, avant
généralisation aux vingt.

### Ampleur

Entre le backend, le multi-filiales, les droits, l'internationalisation, l'import généralisé,
les pièces jointes, le circuit d'approbation et la documentation, **le projet se compte en
mois, pas en semaines**. Le découpage ci-dessus permet des livraisons intermédiaires réellement
utilisables, mais il ne réduit pas le volume total.

---

## 8. Risques du projet

| # | Risque | Gravité | Parade |
|---|---|---|---|
| P1 | **Écrasement silencieux** entre utilisateurs simultanés | Critique | Verrouillage optimiste par enregistrement (§1.4) — à traiter dans L2, pas après |
| P2 | **Volume de traduction** des catalogues sous-estimé | Élevé | Échelonnement + repli sur le français ; demander la version anglaise d'AirCyber |
| P3 | **Régression** sur les 17 100 lignes existantes | Élevé | Façade synchrone préservée : les modules ne sont pas réécrits (§1.3) |
| P4 | **Absence d'accès sortant** vers Microsoft 365 | Moyen | À vérifier tôt ; les notifications sont une fonction non bloquante |
| P5 | **Découpage Groupe/Filiale** contesté après coup | Élevé | Validation formelle par le RSSI groupe **avant** L1 |
| P6 | **Pièce jointe malveillante** | Élevé | Défense en profondeur (§1.6) ; le risque résiduel est assumé et documenté |
| P7 | **Restauration jamais testée** | Critique | Test de restauration inclus dans L0, rejoué annuellement |

---

## 9. Vérifications à mener au démarrage

Le cadrage est clos : ces points ne sont pas des arbitrages en attente, mais des faits à
établir en début de projet.

- **Accès sortant de la VM vers Microsoft 365** — conditionne le lot L12 (notifications).
- **Existence d'une version anglaise officielle du questionnaire AirCyber** — allègerait le
  lot L11 d'environ un sixième du volume de traduction.
- **Validation formelle du découpage Groupe / Filiale par le RSSI groupe** — à obtenir avant
  le lot L1, la remise en cause après création du schéma étant coûteuse.
