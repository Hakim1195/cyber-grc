# Porte S8 — sixième passage

> **Auditeur indépendant.** Je n'ai écrit aucune des lignes que j'examine.
> **Date** : 05/09/2026. **Révision examinée** : `0e48a92` — *« Le relevé du §8 pointe sur
> 9de7d51 — 1747 essais »*. **Machine** : `SRV-Infra`, Debian 13 (trixie), PostgreSQL 17.11,
> Apache 2.4.68 (Debian), ClamAV actif, contrôleur de domaine Samba réel `grc-ad`
> (`EXEMPLE.INTERNE`), recette en ligne sur `https://grc.exemple.interne/`.
> **Périmètre d'écriture** : ce fichier, et lui seul. Aucun commit, aucun `git add`.

---

## 0. Ce que ce passage devait faire, et en quoi il diffère des cinq précédents

Les cinq passages précédents cherchaient des défauts. Celui-ci devait répondre à une
**question de décision** : *le client peut-il mettre ce produit en service, et sous quelles
réserves ?*

Cela m'a imposé deux disciplines que les rapports antérieurs n'avaient pas :

1. **mesurer ce qui TIENT avec la même rigueur que ce qui casse** — le §4 est la section la
   plus longue de ce rapport, et c'est délibéré : c'est ce sur quoi le client s'appuiera ;
2. **attacher à chaque constat une conséquence d'exploitation** — ce que le client perd
   concrètement, et si cela empêche ou non un pilote. Un défaut réel sans chemin d'attaque
   vivant est dit comme tel, et il y en a.

---

## 1. LE VERDICT

### 1.1 Verdict de porte

> ## ❌ **REFUSÉE** — 4 majeurs, 8 mineurs, 0 bloquant, **0 fuite entre filiales**
>
> **Un contrôle en échec : S7** — le droit d'export. Deux autres passent **sous réserve
> nommée** : S3 (journal) et S18 (le produit fait ce qu'il doit faire). Les dix-huit sont
> rejoués ; le détail est au §6.
>
> Un contrôle en échec ne se franchit pas — c'est la lecture appliquée à la porte S1 au
> quatrième passage, et elle ne change pas parce que le lot paraît proche de la fin.
>
> ⚠️ **Deux des quatre majeurs ne violent AUCUN des dix-huit contrôles** (Q-232, Q-233) — comme
> les trois bloquants de la porte S2, et pour la même raison : *la grille ne demande nulle part
> que « supprimer » supprime*.

### 1.2 Le tri du `PLAN_EXECUTION` §0 bis

| Classe | Compte | Constats |
|---|---|---|
| **Bloque le fonctionnement** | **0** | — |
| **Fuite ou perte de données** | **0** | aucune filiale ne voit une autre ; aucune saisie ne disparaît. Mesuré : §4.1 et §4.9. ⚠️ **Q-241 est le seul qui approche cette classe**, et je dis au §5 pourquoi il n'y entre pas : la politique de `session_filiales` est trop large, mais **aucune route ne l'expose** et l'écriture est fermée |
| **Tout le reste** | **12** | Q-232 → Q-243 |

⚠️ **Q-232, Q-233 et Q-242 sont à la frontière de la deuxième classe, et je l'ai tranché
explicitement.** Pour **Q-242**, le raisonnement est simple : le compte qui extrait tout par
`/api/rafraichir` **pouvait déjà lire ces données** par `/api/donnees`, qui lui est ouverte.
Aucune donnée ne parvient à quelqu'un qui ne pouvait pas la voir, et le cloisonnement de
filiale s'applique. Ce qui est perdu est la **trace**, pas la donnée. Pour les deux autres : Ils ne sont pas une *perte* de données : ils en sont l'exact opposé — une
donnée qui devait disparaître subsiste. Ils ne sont pas non plus une *fuite entre filiales* :
la RLS borne toujours, et j'ai vérifié qu'aucun autre périmètre ne les atteint. Ils restent
donc en troisième classe, **au même rang que Q-230 dont ils sont la continuation** — la porte
précédente avait classé Q-230 « 🟠 majeur (défaut du PRODUIT) », et il aurait été malhonnête
de classer plus sévèrement le même défaut sur un autre chemin.

### 1.3 **RECOMMANDATION DE MISE EN SERVICE**

> ## ⚠️ **MISE EN SERVICE PILOTE : AUTORISÉE, SOUS CINQ RÉSERVES NOMMÉES**

Je recommande d'**ouvrir le pilote** — une filiale, plus la vue Groupe, comme le prévoit le
`PLAN_SERVEUR` §7 — **après avoir levé R1, R2 et R3**, qui coûtent ensemble moins d'une
journée, et de **ne pas généraliser aux vingt filiales** avant R4 et R5.

Le motif est simple et je le donne sans détour : **le cœur du produit est sain et je l'ai
mesuré**. Le cloisonnement tient à 33/33 et s'effondre proprement au sabotage, le périmètre
résiste à onze sondes qui rendent le même corps à l'octet près, les droits mordent côté
serveur, le verrouillage optimiste distingue cinq situations en cinq messages, la chaîne des
pièces jointes mord huit fois sur huit contre un ClamAV réel, l'atomicité tient sur trois
opérations composites, et le chemin complet — Chromium réel → Apache réel → Active Directory
réel → PostgreSQL — parcourt **33 écrans sans une seule violation de politique de sécurité de
contenu**. **Aucun des douze constats n'ouvre un chemin d'attaque vivant**, et aucun ne fait
sortir une donnée d'une filiale.

Ce qui manque relève de deux familles, et les deux se corrigent :

| # | Réserve | Avant quoi ? | Pourquoi, et ce que ça coûte |
|---|---|---|---|
| **R1** | **Fermer Q-242** — `GET /api/rafraichir` doit laisser une trace quand sa réponse constitue en fait une extraction | **avant le pilote** | C'est le seul contrôle **en échec**, et il touche la promesse centrale du produit : *savoir qui a extrait quelles données*. Le correctif n'est pas « tracer chaque sondage » — la SPA sonde toutes les 20 s — mais **discriminer** : un `depuis` antérieur à l'ouverture de la session, ou un volume au-delà d'un seuil, est une extraction et se journalise. Quelques lignes, au même endroit que le correctif de Q-209 |
| **R2** | **Trancher Q-243** — soit ancrer périodiquement la tête du journal, soit corriger la phrase du `PLAN_SERVEUR` §1.7 | **avant le pilote** | Aujourd'hui deux documents se contredisent, et l'exploitant qui répondra à l'auditeur ISO 27001 ne saura pas lequel citer. La machinerie d'ancrage **existe déjà** (`parametres`, clé `journal.ancrage_<annee>`) ; elle n'est simplement jamais appliquée à la tête vivante. À défaut, **une phrase** suffit — mais il faut l'écrire, parce que le produit répond aujourd'hui `sain: true` sur un journal tronqué |
| **R3** | **Remettre à jour `PLAN_EXECUTION` §7 « Portes franchies » et `README` §8** (Q-237, Q-238, Q-239) | **avant le pilote** | La moins technique et la plus urgente : le tableau que le `CLAUDE.md` déclare *« la seule source des verdicts »* s'arrête à **S3, le 04/09** — huit passages de porte plus tard. Un exploitant qui suit l'ordre de lecture prescrit conclura que L5, L7, L8 et L9 n'ont jamais été soumis à une porte |
| **R4** | **Fermer Q-232 et Q-233** — les pièces jointes doivent suivre leur porteur sur **tous** les chemins de disparition, pas seulement sur celui que l'URL nomme | **avant la généralisation** | Dans un outil qui sert de preuve en audit et qui porte un registre RGPD, « supprimer » qui ne supprime pas est une promesse rompue. Au pilote, sur une filiale, le volume est maîtrisable et l'exploitant peut nettoyer à la main ; à vingt filiales, non. ⚠️ Et le remède doit être **un seul endroit que tous les chemins traversent** — pas six correctifs |
| **R5** | **Écrire une RÉCONCILIATION disque ↔ base**, et la jouer une fois sur l'installation pilote | **avant la généralisation** | Aucun balayeur n'existe. R4 arrête l'hémorragie ; il ne rattrape pas ce qui est déjà par terre — les deux réserves sont distinctes (§7 bis) |

**Ce que j'ajoute à la fiche de mise en service, et qui n'est pas une réserve de sécurité :**
dire à l'exploitant pilote de **ne pas se servir du mode « remplacer » de la reprise** tant que
R4 n'est pas fermé, et de reporter dans son unité systemd le sous-réseau du relais SMTP avant
d'activer les notifications (**Q-186** : *le symptôme mentira sur sa cause*).

**Deux points qui ne sont pas des réserves de sécurité mais qui appartiennent au client**, et
qu'aucune session ne peut trancher — ils sont déjà au registre et je les reconduis tels quels :
**Q-153** (une politique de portée Groupe se valide-t-elle une fois au Groupe, ou filiale par
filiale ?) et le **risque P5** (validation formelle du découpage Groupe/Filiale par le RSSI
groupe, sans trace dans le dépôt). Le second se paie en migration de données s'il est tranché
après la mise en service.

---

## 2. Les correctifs du cinquième passage, éprouvés

Un correctif ne compte que s'il **mord** : on le casse, et le banc doit rougir. Voici le
résultat, correctif par correctif.

| Correctif | Verdict | La mutation jouée |
|---|---|---|
| **Q-230** — les pièces suivent leur porteur (`src/api/index.ts`, route DELETE) | ⚠️ **TIENT SUR SON CHEMIN, NE TIENT PAS SUR LA CLASSE** | Sonde `cascade.probe.mjs` : suppression **directe** d'un risque porteur → ligne, fichier, quota et délivrance disparaissent, correctif confirmé. Mais suppression du **parent** (`scenarios_pra`, `risques`) → l'enfant cascade, **sa pièce reste** : ligne en base, fichier sur disque, `GET` rend **200 avec 125 octets**. Voir **Q-232** |
| **Q-231 (a)** — le durcissement de portée serveur est retiré à la désinstallation | ⚠️ **TIENT SUR L'INSTANCE, NE TIENT PAS SUR LA CLASSE** | L'installation pose **trois** gestes Apache de portée serveur ; la désinstallation en défait **un**. `a2dismod -q -f autoindex` (ligne 528) n'est jamais annulé, et `autoindex` est effectivement désactivé sur cette machine. Voir **Q-235** |
| **Q-231 (b)** — le préfixe AD est lu avant l'effacement | ✅ **TIENT** | `test/deploiement/desinstallation.test.mjs` joue la fonction avec `lire_variable` doublé rendant `ACME-` : le message porte bien `ACME-*`. J'ai relu le bloc extrait — `PREFIXE_GROUPES` est capturé ligne 873, avant le `rm -rf "$CONFIG"` de la ligne 981 |
| **Q-226 / Q-220 / Q-216** — le contrôle de coût des expressions | ❌ **NE TIENT PAS** | Trois formes catastrophiques ajoutées à `src/pieces/clamav.ts` — `/^"([a-z]+)+"$/u` (**2 213 ms pour 28 signes**), `/^(a{1,40}){1,40}$/u` (**41 867 ms pour 32 signes**), `/"([\s\S]*?)"x"/gu` (quadratique, ×8,2). Le fichier rend **5 essais, 5 passés**, la passe de balayage en **15,2 ms** : elle ne les a pas essayées. Voir **Q-234** |
| **Q-229 / Q-221** — le garde des traductions | ❌ **NE TIENT PAS** | `cyber-gouvernance_V4/js/app.js:1199`, `tHtml("compte.acces", …)` → `t("compte.acces", …)`, c'est-à-dire la suppression exacte de l'échappement que le commentaire voisin déclare nécessaire. `test/depot/traductions.test.mjs` rend **15 essais, 15 passés**. Voir **Q-236** |
| **Q-228 / Q-222 / Q-219** — les chiffres du schéma | ⚠️ **TIENT SUR SES SEPT NOMBRES, PAS SUR LE §8** | Les sept nombres gardés sont **tous justes** au catalogue (49 tables, 16 migrations, 196 politiques, 73 clés étrangères, 44 tables `cree_par`, 12 composites, 14 contrôles consignés). Mais cinq nombres du même §8 sont faux et non gardés, et **le sixième garde est vert sur une phrase fausse**. Voir **Q-238** et **Q-240** |
| **Q-209** — la lecture en masse de `/api/donnees` laisse une trace | ⚠️ **TIENT SUR SA ROUTE, NE TIENT PAS SUR LA CLASSE** | `GET /api/donnees` pose bien une entrée `consultation_sensible` — mesuré sur la recette, delta de journal **+1**. Mais `GET /api/rafraichir?depuis=1970-…` rend **la même chose** et n'en pose **aucune** : trois extractions, delta **0**. Voir **Q-242** |
| **Q-223 / Q-224** — désinstallation et sauvegarde avant migration | ✅ **TIENNENT** | Neuf essais **jouent** la fonction avec les commandes doublées ; l'ordre « arrêter avant de retirer » est vérifié, les clichés survivent, un fichier vide ne passe pas pour un export. Rejoués verts au banc complet |
| **Q-225 / Q-227** — la stabilité de la mesure de temps | ✅ **TIENT** | `npm test` complet : **1 747 essais, 1 747 passés, 0 échec**, en 166,8 s. Aucun essai intermittent. Le fichier `cout-expressions` rejoué seul : vert |
| **Q-218** — l'atomicité de la création de filiale a une morsure | ✅ **TIENT** | Remordu : un déclencheur fait échouer l'entrée de journal `creation/filiales` → `POST /api/filiales` rend **500**, `filiales` est **inchangée**, `groupes_ad` aussi ; la filiale témoin, panne levée, passe à **201** avec son entrée de journal. *Une filiale ne peut pas exister sans son entrée au journal* : confirmé |
| **Q-217** — l'exemption fondée sur une borne qui ne s'applique pas | ✅ **TIENT** (l'exemption a disparu avec son détecteur) | Mais l'unique exemption restante, `pieces/multipart.ts`, protège un fichier dont **aucune expression n'est mesurée** : voir Q-234 |
| **Q-215 / Q-208 / Q-197** — les formes déjà trouvées | ✅ **TIENNENT** | Les quatre formes historiques font toujours rougir la morsure (`LE CONTRÔLE MORD`, 14,7 s de mesure). Leur famille, elle, n'est pas fermée |

---

## 3. Ce que j'ai joué — commandes, chiffres, machines

Tout ce qui suit a été exécuté sur `SRV-Infra`. Les sondes vivent dans mon répertoire de
travail temporaire, **jamais sous `backend/test/`**.

### 3.1 Le banc et la compilation

```
# à mon ARRIVÉE, avant toute mutation :
cd backend && set -a && source ~/.grc-essais.env && set +a && npm test
  → ℹ tests 1747 · ℹ suites 449 · ℹ pass 1747 · ℹ fail 0 · ℹ cancelled 0
    ℹ skipped 0 · ℹ todo 0 · ℹ duration_ms 166821.35        [exit 0]

# à mon DÉPART, mutations restaurées, ce rapport écrit :
  → ℹ tests 1747 · ℹ suites 449 · ℹ pass 1746 · ℹ fail 1
    ℹ duration_ms 169358.47

npm run verifier-types            → aucune sortie                [exit 0]
npm audit --omit=dev              → found 0 vulnerabilities      [exit 0]
git status --short                → seul ce rapport, non suivi
git rev-parse --short HEAD        → 0e48a92
```

> ⚠️ **L'unique échec du second passage est causé par CE RAPPORT, et c'est le garde-fou qui
> fait son travail.** `test/documentation/registre.test.mjs` — écrit pour le constat Q-54 —
> balaie `docs/securite/RAPPORT_*.md` et exige que **tout constat nommé dans un rapport de
> porte ait sa ligne au registre**. Il nomme exactement mes douze :
>
> ```
> ✖ TOUT CONSTAT NOMMÉ dans un rapport de porte a sa ligne au registre
>     · Q-232 — nommé dans docs/securite/RAPPORT_S8_SEXIES.md, absent du registre
>     · Q-233 … · Q-243   (douze lignes)
> ```
>
> Il redeviendra vert quand les douze entreront au registre du `PLAN_EXECUTION` §7. **C'est
> une confirmation, pas un défaut** : elle vérifie au passage que ma numérotation est
> contiguë depuis Q-231, et que le mécanisme *« un constat chiffré et non attribué est un
> constat perdu »* mord bien.
>
> ⚠️ **Et son message porte, mot pour mot, le raisonnement de Q-243** : *« la continuité de la
> numérotation NE VOIT PAS ce cas : une queue tronquée laisse un tableau de 1 à N, sans trou,
> parfaitement cohérent — et cinq majeurs en moins »*. Le chantier avait donc **déjà compris**
> qu'une troncature de queue est invisible à une vérification de continuité — il l'a appliqué
> au registre, et **pas à la chaîne du journal**, qui est pourtant le même raisonnement sur le
> même objet. C'est le motif du passage, encore : la leçon apprise à un endroit, non portée à
> l'autre.

> **Comment ce passage a été conduit, et je le dis parce que cela conditionne le poids des
> chiffres.** J'ai mené la mesure moi-même sur tout ce qui décide du verdict — les deux
> majeurs sur les pièces jointes, l'extraction sans trace, la troncature du journal, les deux
> garde-fous mis en défaut par mutation, le parcours navigateur, l'état de la recette. Pour
> élargir la couverture de la grille dans le temps imparti, j'ai fait exécuter en parallèle
> des campagnes de sondes dirigées (cloisonnement, injection SQL, garde-fous du schéma,
> verrouillage optimiste, pièces jointes, rythme, atomicité). **Chaque conclusion décisive
> issue de ces campagnes a été rejouée par moi** avant d'entrer dans ce rapport : c'est ainsi
> que Q-241, Q-242 et Q-243 ont été confirmés, et c'est ainsi qu'une mesure EICAR erronée de
> ma part a été corrigée (§6, contrôle S9).

### 3.2 Les sondes que j'ai écrites

| Sonde | Ce qu'elle mesure |
|---|---|
| `probe-extract.mjs` + `probe-01/03/04/05.mjs` | réplique l'extracteur de `cout-expressions.test.mjs` et l'interroge hors banc |
| `probe-02/06.mjs` | chronomètre les formes candidates, à quatre tailles |
| `cascade.probe.mjs` | scénario PRA → test enfant → pièce → suppression du parent |
| `cascade2.probe.mjs` | risque → action enfant → pièce → suppression du parent |
| `reprise.probe.mjs` | `POST /api/reprise` mode « remplacer », et la récupérabilité de l'orpheline |
| `browser-s17.mjs` | Chromium réel → Apache réel → AD réel, 33 écrans, en-têtes, cookie |
| `browser-s18.mjs` | les gestes réels : créer, saisir, enregistrer, **recharger**, supprimer |
| `rls-sessions.probe.mjs` | ce qu'une session bornée à une filiale voit du substrat de session |
| `journal.probe.mjs`, `journal2.probe.mjs`, `journal3.probe.mjs` | l'ajout seul sous `grc_app` puis sous le **propriétaire** ; les quatre couches retirées une par une ; la détection après altération |
| `journal-queue.probe.mjs` | la troncature de **queue** du journal, comparée à la suppression au milieu |
| `s4-s9-s14.probe.mjs`, `s9-eicar.probe.mjs` | verrouillage optimiste, chaîne des pièces, atomicité, EICAR |

### 3.3 Les mutations jouées dans le dépôt — **toutes restaurées**

| Fichier | Mutation | Restauration vérifiée |
|---|---|---|
| `backend/src/pieces/clamav.ts` | trois expressions catastrophiques ajoutées en fin de fichier | `sha256sum` avant = après = `02006ccd…4924b` ; `git status` vide |
| `cyber-gouvernance_V4/js/app.js` | ligne 1199, `tHtml(` → `t(` | `sha256sum` avant = après = `ea34d89d…615e4` ; `git status` vide |

Les sauvegardes ont été prises **dans mon scratchpad**, et la restauration faite par recopie —
**jamais** par `git checkout`, conformément à la leçon du §7 du plan.

### 3.4 L'état de la recette — rendu tel que trouvé

```
                    à mon arrivée     à mon départ
filiales                    2                2   ✔
risques                     2                2   ✔
pieces_jointes              0                0   ✔
actions                     5                5   ✔
documents                   0                0   ✔
```

**Résidus déclarés, et ils sont inévitables :**

- `journal_audit` : **718 → 773** entrées (+55). Le journal est **en ajout seul par
  construction** : se connecter, naviguer et se voir refuser un droit l'alimentent, et rien
  ne peut l'en défaire — c'est la propriété que le contrôle S3 exige. Les entrées ajoutées
  sont des `connexion_reussie`, `consultation_sensible`, `refus_autorisation`,
  `changement_perimetre`, plus une `creation` et une `suppression` du risque témoin.
- `sessions` : **147 → 153** (+6), pour la même raison.
- Le risque témoin créé au contrôle S18 (`AUDIT-S8-SEXIES-<horodatage>`) a été **supprimé par
  l'interface**, et le décompte est revenu à 2. Les deux risques restants portent bien leur
  nom d'origine, `SAISIE-QUI-NE-DOIT-PAS-DISPARAITRE`.
- **Aucune filiale n'a été créée** (constat Q-155 respecté). **Aucune pièce jointe n'a été
  déposée sur la recette** — toutes mes mesures de pièces jointes sont faites sur des bases
  **jetables**, montées par le vrai `db/migrate.mjs`.
- `backend/db/dev/preparer_base_dev.sh` **n'a jamais été joué**. `install.sh` **n'a jamais été
  joué**, sous aucune option.
- **Une base jetable oubliée a été retirée** : `grc_essai_mesure_agentc_…`, restée d'une
  campagne de mesure. Après retrait : `select count(*) from pg_database where datname like
  'grc_essai%'` → **0**, et aucun rôle PostgreSQL résiduel. Les quatre services tournent
  (`cyber-grc`, `apache2`, `postgresql`, `clamav-daemon` → `active`) et `GET /` rend **200**.
- **Le seul résidu dans le dépôt est ce rapport lui-même** : `git status --short` ne montre
  que `?? docs/securite/RAPPORT_S8_SEXIES.md`. Aucun commit, aucun `git add`.

---

## 4. CE QUI TIENT — mesuré et chiffré

> C'est la section sur laquelle le client s'appuiera. Chaque ligne porte un chiffre et la
> façon dont il a été obtenu. Là où je n'ai pas mesuré moi-même, je le dis.

### 4.1 Le cloisonnement par filiale — la promesse centrale du produit

C'est ce que le client achète, et c'est ce qui tient le mieux.

| Ce qui est mesuré | Chiffre |
|---|---|
| Tables portant `filiale_id`, **découvertes dans `pg_catalog`** et non listées à la main | **33** |
| de ces 33, en `enable` **et** `force row level security` | **33 / 33** |
| toutes tables publiques confondues, en `force row level security` | **49 / 49** |
| `grc_app` : `rolbypassrls` | **false** |
| `grc_app` : `rolsuper` | **false** |
| tables **possédées** par `grc_app` | **0** — les 49 appartiennent à `grc_proprietaire` |
| `set role grc_proprietaire` depuis `grc_app` | **refusé `42501`** ; aucune appartenance croisée dans `pg_auth_members` |
| DDL depuis `grc_app` (`alter table`, `create table`) | **refusées `42501`** |
| **Balayage de fuite** : périmètre A, filiale B peuplée, sur les 32 tables probantes | **31 rendent zéro ligne de B** |
| Recoupement au banc (`test/base/rls.test.mjs` + `test/droits/perimetre-serveur.test.mjs`) | **216 / 216** |

**Et le contrôle rougit quand on le casse** — c'est la seule chose qui distingue un essai
d'un décor. `alter table risques no force row level security` sur la base jetable :

```
CONTRÔLE rejoué : 32/33 → ROUGE, manquante(s) : risques
propriétaire,        périmètre A → lignes de B visibles dans « risques » : 2  (avant : 0)
compte applicatif,   périmètre A → lignes de B visibles                    : 0
```

La fuite provoquée n'atteint **que le propriétaire** — ce qui est exactement ce que
`force row level security` protège, et ce que le compte applicatif ne peut pas devenir.

La 32ᵉ table est `session_filiales` : dérogation **écrite** au registre `v_derogations` de
`004_rls.sql`, et c'est l'objet du constat **Q-241**.

### 4.2 Le chemin complet — Chromium réel → Apache réel → AD réel → PostgreSQL

C'est le contrôle **S17**, et c'est le résultat le plus rassurant de ce passage.

Un **Chromium réel** (Playwright, `/opt/pw-browsers/chromium-1234`) ouvre
`https://grc.exemple.interne/`, s'authentifie **par le vrai formulaire** contre le
**contrôleur de domaine Samba réel** avec le compte `rssi.groupe`, puis parcourt **33 écrans**.

```
1. page d'entrée chargée, titre = "Cyber GRC"
3. après connexion — url = https://grc.exemple.interne/
5. écrans parcourus : 32 / 33 sans erreur
     ✗ #/journal → 403 (refus de droit LÉGITIME, voir §4.6)
6. violations de CSP : 0
8. requêtes en échec : 0
```

**Zéro violation de politique de sécurité de contenu sur 33 écrans.** C'est la propriété que
la porte S2 avait trouvée entièrement fausse — soixante-dix gestionnaires en ligne bloqués — et
elle est tenue, à travers le vhost du dépôt, servi par un Apache 2.4.68 réel.

Les 33 écrans : `dashboard, risques, actions, actifs, exigences, referentiels, conformite,
mesures, incidents, documents, rgpd, audits, bia, crise, pra_scenarios, pra_tests, pra_mco,
pra_prestataires, echeances, synthese, cartographie, matrice, mapping, clients, personnel,
settings, journal, groupe, pieces, imports, approbations, socle, referentiels_actifs`.

### 4.3 Les en-têtes servis, mesurés à travers Apache

Sur `/` **et** sur `/api/session` :

| En-tête | Valeur mesurée |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'…` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `same-origin` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()` |
| `Cache-Control` (sur `/api/`) | **`no-store`** |
| `Server` | `Apache/2.4.68 (Debian)` |

Et le **cookie de session**, lu par le navigateur :

```
grc_session | HttpOnly = true | Secure = true | SameSite = Strict | path = /
```

Les trois propriétés que le contrôle S10 exige sont là, et je les ai lues **depuis le
navigateur**, pas dans un fichier de configuration.

### 4.4 Les bornes de dénis de service, mesurées à travers le frontal

```
corps de 28 Mio  → 413      (borne de corps effective sur /api/, la leçon du 8ᵉ passage S2)
corps de 1 Mio   → 401      (passe la borne, s'arrête à l'authentification)
Transfer-Encoding: chunked → 411
corps minuscule  → 401      (aucun faux positif)
```

La borne **agit sur `/api/`** — c'est précisément ce que le 8ᵉ passage de la porte S2 avait
trouvé faux, et c'est corrigé.

### 4.5 Les droits, vérifiés côté serveur

Trois requêtes, même session `rssi.groupe`, **à travers Apache** :

```
GET  /api/consolidation   → 200   (périmètre groupe : 2 filiales)
GET  /api/import/modeles  → 200
POST /api/filiales        → 403   {"erreur":"droit_insuffisant",
                                   "message":"Cette opération relève de l'administration
                                              de l'application. Votre profil ne la porte pas."}
```

Le compte porte `perimetre_groupe: true`, `administration_groupe: false`, niveau `validation`
sur **12 domaines**, `export: true`. Le refus vient du **serveur**, pas de l'interface.

### 4.6 Le droit d'export : la barrière tient sur les routes qui le déclarent, et le refus est tracé

> ⚠️ **À lire avec le constat Q-242**, qui montre où cette barrière ne s'applique pas. Ce qui
> suit décrit ce qui tient ; le §5 décrit le trou.

Compte `rssi.tls`, qui n'est **pas** membre de `GRC-EXPORT` (vérifié :
`samba-tool group listmembers GRC-EXPORT` → `admin.grc`, `rssi.groupe`) :

```
droits lus à la connexion : export = False | niveau = validation | groupe = False | 12 domaines

GET /api/export          → 403  « L'export des données est une autorisation distincte
                                  de la consultation. »
GET /api/journal/export  → 403  idem
GET /api/consolidation   → 200  mais perimetre.groupe = false, filiales = 1
```

L'entonnoir est **déclaré côté serveur** : trois chemins portent l'action `exporter` —
`GET /api/export`, `GET /api/journal/export` et `POST /api/cycle/sortie-filiale`.
Et le refus **laisse une trace**, relevée dans le journal de la recette :

```
793 | refus_autorisation | USR-…841 | Requête refusée par le modèle de droits : le droit manque.
    | {"route": "/api/journal/export", "methode": "GET", "action_exigee": "exporter", …}
791 | refus_autorisation | USR-…841 | …
    | {"route": "/api/export", "methode": "GET", "action_exigee": "exporter", …}
```

⚠️ **Et l'entrée ne porte aucun nom d'enregistrement** — la leçon du constat Q-118 (la fuite
par la trace) est tenue : le journal dit *quelle route*, *quelle méthode*, *quelle action
exigée*, jamais *quelle donnée*.

⚠️ **Ce qui NE tient pas** : une route qui ne déclare pas `exporter` mais qui rend le jeu
complet — `GET /api/rafraichir` — n'est ni barrée ni tracée. C'est **Q-242**, et c'est
pourquoi le contrôle S7 est marqué en échec.

### 4.7 Le refus de droit est **dit à l'utilisateur**, et bien dit

C'est le point que je n'attendais pas, et il mérite d'être relevé parce que c'est la moitié
que les produits ratent : un 403 qui se traduit par un écran vide.

Le compte `rssi.groupe` n'a pas le domaine `journal`. Voici, **mot pour mot**, ce que Chromium
affiche sur `#/journal` :

> *« Le journal n'a pas pu être lu. Votre profil n'a pas accès au journal d'audit. Ce droit est
> distinct des autres : lire trois ans d'identités n'est pas la même chose que régler
> l'application. Demandez-le à votre exploitant. »*

L'écran conserve son titre, ses filtres et sa pagination ; le refus est un message, pas une
page blanche. Aucune pile d'appel, aucun nom d'objet de base, aucune référence technique.
C'est le contrôle **S12** tenu là où il compte, dans l'interface.

### 4.8 Le journal d'audit — chaînage, portée, vocabulaire

Sur la base de la **recette**, qui porte une vraie histoire de 773 entrées :

```
select count(*) from f_journal_audit_verifier();   →  0     (aucune anomalie de chaînage)
select count(*) from f_verifier_schema();          →  0     (aucune anomalie de schéma)
select count(*) from controles_schema;             → 14     (garde-fous consignés)
```

Et le vocabulaire réellement exercé, compté sur la recette :

```
administration (3)        creation (48)             refus_autorisation (104)
analyse_antivirus (29)    deconnexion (4)           session_expiree (1)
arret (14)                demarrage (15)            suppression (50)
changement_perimetre (15) export (12)               verification_journal (10)
connexion_echouee (133)   import (4)
connexion_reussie (156)   modification (47)
consultation_sensible (148)
```

**17 actions distinctes réellement observées.** Le vocabulaire de la contrainte
`ck_journal_audit_action` en compte **21** depuis la migration `009`, et **les 21 ont un site
d'émission dans `src/`** — je les ai toutes remontées (voir **Q-239**, où le chiffre annoncé
par la documentation est faux *en faveur* du produit).

### 4.9 Le produit fait ce qu'il doit faire — le geste réel, y compris le rechargement

Contrôle **S18**, joué dans Chromium contre la recette :

```
#/risques — lignes avant : 2
formulaire ouvert (« Déclarer un risque »), champs : nom, f, g, m, description
après « Créer le risque » — la ligne apparaît dans le tableau
APRÈS RECHARGEMENT (page.reload, waitUntil networkidle) : la saisie est-elle là ? OUI ✔
lignes après : 3
suppression par l'interface → lignes : 2 | marque encore présente : non ✔
erreurs de page/console pendant les gestes : 2 (401 avant connexion, 403 sur #/journal)
violations CSP : 0
```

**Le rechargement ne détruit rien.** C'est le geste exact qui a fait refuser le 6ᵉ passage de
la porte S2 — *« le bandeau dit de recharger, l'utilisateur recharge, et la saisie
disparaît »* — et il est tenu.

### 4.10 La recette sert bien la révision du dépôt

Comparaison **octet par octet** du répertoire publié `/opt/cyber-grc/frontend` contre
`cyber-gouvernance_V4/` du dépôt, faite sans passer par `install.sh` :

```
fichiers publiés      : 81
identiques au dépôt   : 80 / 81
seul écart            : index.html — et uniquement par le jeton de version
                        (« css/style.css » → « css/style.css?v=0.1.0.011dad0c1310 »),
                        qui dérive du contenu et que `install.sh --maj` pose
non publié             : data/LISEZ-MOI.md — un .md, écarté par la liste blanche de
                        types publiables, exactement comme elle doit le faire
```

**Aucun fichier de données ne se trouve sous la racine web.** La double barrière — liste
blanche dans `install.sh` et `<FilesMatch>` du vhost — fait son travail.

### 4.11 La limitation du rythme

Martèlement de `POST /api/connexion` sur un identifiant **inexistant** (aucun compte réel n'a
été verrouillé) :

```
essais 1 à 5  → 401 en 57–69 ms   (l'annuaire est interrogé)
essais 6 à 9  → 401 en 21–26 ms   (court-circuit : le verrou a pris)
message, identique aux neuf essais :
  « Identifiant ou mot de passe incorrect, ou compte temporairement bloqué »
```

Deux propriétés tenues d'un coup : **le verrouillage est effectif au 6ᵉ essai** (la
description de session annonce « verrouillage après 5 échecs, 15 min »), et **le message
n'est pas un oracle** — il ne dit pas si le compte existe, ni s'il est bloqué. Les échecs
sont journalisés : `connexion_echouee (133)`.

### 4.12 Les secrets

```
grep sur backend/src, backend/deploy, cyber-gouvernance_V4/js pour un secret LITTÉRAL
  → 4 occurrences, TOUTES des références de variable (PGPASSWORD="$(lire_variable …)"),
    aucune valeur en clair

réponse de /api/session          → aucun champ de secret
réponse d'erreur /api/inexistant → {"erreur":"ressource_inconnue",
                                    "message":"Aucune ressource ne répond à GET /api/inexistant.",
                                    "reference":"REQ-1788617572791-62yhg2ax7wn42em8d27sph2b1"}
```

Un identifiant de corrélation, et rien d'autre : ni pile d'appel, ni nom de table, ni chemin
de fichier.

### 4.13 Ce que le banc couvre réellement

**1 747 essais, 449 suites, 0 échec, 166,8 s**, répartis en **19 familles** :
`base, api, navigateur, auth, import, pieces, deploiement, droits, reprise, cycle,
journal-lecture, notifications, approbations, annuaire, depot, modules, filiales,
documentation, journal`.

Ce n'est pas rien, et il faut le dire dans les deux sens : ce banc est ce qui a permis à ce
passage de se concentrer sur les jointures plutôt que sur le cœur. **Mais un banc vert mesure
ce qu'il regarde** — les deux majeurs de ce passage vivent, une fois de plus, *entre* deux
familles d'essais.

### 4.14 Quand la prévention tombe, la DÉTECTION tient — mesuré

C'est le résultat que je placerais en premier devant un auditeur ISO 27001.

Le journal est protégé par **quatre déclencheurs** (`chainage`, `interdit_maj`,
`interdit_suppr`, `interdit_vidage`) et par les **privilèges** (`grc_app` n'a que
`INSERT, SELECT`). La grille reconnaît une limite : elle *« ne protège pas contre un `root`
sur la VM ni contre le propriétaire de la base »*. J'ai voulu savoir ce qui reste **quand
cette limite est franchie**.

Sous le rôle `grc_proprietaire`, j'ai retiré les quatre déclencheurs, puis altéré le journal :

```
journal : 2 entrées, numéros 1 → 2
  AVANT toute altération                          -> 0 anomalie(s)
  (les quatre déclencheurs retirés par le PROPRIÉTAIRE)
  APRÈS altération du résumé de l'entrée 1        -> 1 anomalie(s)   ← l'entrée est NOMMÉE
  APRÈS suppression pure et simple de l'entrée 1  -> 1 anomalie(s)   ← la chaîne est rompue
```

**Le chaînage par empreinte détecte les deux.** Un attaquant qui obtient le rôle propriétaire
peut modifier le journal — c'est écrit et assumé — mais **il ne peut pas le faire sans que
`f_journal_audit_verifier()` le dise**, et cette fonction est appelée depuis l'interface
(bouton « Vérifier le chaînage ») et journalisée sous `verification_journal` (10 occurrences
sur la recette).

C'est la différence entre *« nous empêchons »* et *« nous empêchons, et quand nous
n'empêchons pas, nous voyons »*. La seconde est celle qui vaut en audit.

---

## 5. LES CONSTATS NEUFS

> Numérotés à partir de **Q-232** : j'ai vérifié moi-même que le registre du
> `PLAN_EXECUTION` §7 va jusqu'à **Q-231**
> (`grep -oE '^\| \*\*Q-[0-9]+' | sort -V | tail -1`).

### Q-232 🟠 **majeur — défaut du PRODUIT** — *Une pièce jointe survit à la CASCADE qui emporte son porteur*

**Le fait, mesuré.** Le correctif de Q-230 ne nomme que **l'entité que l'URL désigne** :

```ts
// backend/src/api/index.ts:2193
delete from "pieces_jointes"
 where "entite_type" = $1::type_entite and "entite_id" = $2::text
```

`$1` vaut l'entité demandée. La cascade du schéma s'exécute **ensuite**, et les enfants
qu'elle détruit ne sont jamais nommés.

Sonde `cascade.probe.mjs`, base jetable migrée par le vrai `db/migrate.mjs` :

```
scenario = SCEN-…121   test enfant = TEST-…500
piece = PJ-…52u   fichier = PRESENT
AVANT  — GET /api/pieces/tests_pra/<test>/<piece> -> 200

DELETE /api/entites/scenarios_pra/<scen> -> 200
  scenario encore en base ?              0   (0 attendu)
  test enfant encore en base ?           0   (0 attendu — la cascade a joué)
  LIGNE pieces_jointes encore en base ?  1   ← elle devait valoir 0
  fichier sur le disque                : TOUJOURS LÀ
APRÈS  — GET /api/pieces/tests_pra/<test supprimé>/<piece> -> 200 (125 octets servis)
  quota consommé par la filiale        : 4 221 octets
```

Sonde `cascade2.probe.mjs`, sur le chemin le plus fréquenté du produit :

```
DELETE /api/entites/risques/<risque> -> 200
  action enfant en base ?        0   (cascadée)
  pièce du RISQUE en base ?      0   ✔ le correctif Q-230 fonctionne
  pièce de l'ACTION en base ?    1   ✗
  fichier de l'action présent ?  OUI
  GET /api/pieces/actions/<action cascadée>/<piece> -> 200 (118 octets)
```

**La cause est structurelle, et elle est écrite dans le correctif lui-même** : `pieces_jointes`
porte un lien **polymorphe** (`entite_type`, `entite_id`) et **aucune clé étrangère** vers
l'entité. Le schéma ne *peut* pas cascader, et le code n'a pris le relais qu'à un seul endroit.

**Six gestes utilisateur produisent des orphelines**, dont un à deux niveaux :

| Geste | Détruit en cascade | Pièces perdues de vue |
|---|---|---|
| `DELETE /api/entites/clients/:id` | `exigences`, **puis** leurs `actions` | celles des exigences **et** des actions |
| `DELETE /api/entites/exigences/:id` | ses `actions` | celles des actions |
| `DELETE /api/entites/risques/:id` | ses `actions` | ✅ **mesuré** |
| `DELETE /api/entites/evaluations/:id` | ses `actions` | celles des actions |
| `DELETE /api/entites/incidents/:id` | ses `actions` | celles des actions |
| `DELETE /api/entites/scenarios_pra/:id` | ses `tests_pra` | ✅ **mesuré** — les **rapports d'exercice PRA** |

Les autres cibles des 30 `on delete cascade` du schéma sont des tables de liaison, non
porteuses de pièces.

**Conséquence d'exploitation.** Ce que le client perd concrètement :

- **le droit à l'effacement s'arrête à la ligne métier.** Supprimer un incident supprime ses
  actions, mais le PDF nommé « CV Jean Dupont.pdf » attaché à l'une d'elles reste sur le
  disque, en base, et **se télécharge encore**. Dans un produit qui porte un registre RGPD
  article 30, c'est l'article 17 qui n'est pas tenu ;
- **le quota de la filiale se remplit de fantômes.** Ils sont *récupérables* — j'ai vérifié
  que `DELETE /api/pieces/<entite>/<id>/<piece>` rend **204** et efface ligne et fichier — mais
  **seulement si l'on connaît les identifiants** : l'enregistrement porteur n'existe plus,
  donc aucun écran n'y mène ;
- **aucun chemin d'attaque inter-filiales.** J'ai vérifié : la RLS borne toujours, la route de
  délivrance exige le droit `lire` sur le domaine, et l'identifiant de pièce porte plus de 52
  bits d'aléa. **Ce n'est pas une fuite ; c'est une promesse rompue.**

**Empêche-t-il le pilote ?** Non. Il empêche la **généralisation** : c'est la réserve **R1**.

**Ce que l'essai de non-régression ne voit pas.** `backend/test/pieces/orphelines.test.mjs`
porte trois cas — la matière, la suppression **directe** d'un risque, et le non-effet sur un
autre porteur. **Aucun ne supprime un parent.** Son propre en-tête dit : *« Aucun ne supprimait
son porteur. C'est la jointure entre deux familles d'essais, et personne n'habite la
jointure »* — la même jointure existe **un cran plus bas**, et elle est toujours vide.

---

### Q-233 🟠 **majeur — défaut du PRODUIT** — *La reprise « remplacer » purge une filiale entière et laisse TOUTES ses pièces*

**Le fait, mesuré.** `POST /api/reprise` en mode `remplacer` appelle `purgerFiliale`, dont
l'ordre de purge dérive de `ORDRE_ENTITES = [...REGISTRE.keys()]`. **`pieces_jointes` n'est
pas dans `REGISTRE`** — `grep -rn "pieces_jointes" backend/src/entites/` rend **zéro
résultat**, ce que le commentaire du correctif Q-230 reconnaît d'ailleurs lui-même.

Sonde `reprise.probe.mjs`, base jetable :

```
AVANT  — risques: 3   pieces_jointes: 2   octets: 4 219   fichier: présent

POST /api/reprise mode=remplacer -> 200
  {"applique":true,"mode":"remplacer","bilan":{"supprimes":{
     "clients":1,"exigences":1,"actions":1,"risques":3,"actifs":2,"processus":1,
     "crise":1,"scenarios_pra":1,"prestataires":1,"mco_actions":1,"audits":1,
     "revues":1,"evaluations":1,"mesure_mise_en_oeuvre":1,"incidents":1,"documents":…}}}

APRÈS  — risques: 0   pieces_jointes: 2   octets AU QUOTA: 4 219   fichier: TOUJOURS LÀ
GET /api/pieces/risques/<risque purgé>/<piece> -> 200 (123 octets servis)
GET /api/pieces/risques/<risque purgé>          -> 200 {"pieces":[{…"nom_fichier":
                                                        "preuve-confidentielle.pdf"…}]}
```

Seize collections vidées, **zéro pièce retirée**.

**Conséquence d'exploitation.** C'est **le même défaut que Q-232, à l'échelle d'une filiale
entière**, et c'est le pire des deux :

- l'exploitant qui restaure une sauvegarde d'une filiale conserve **l'intégralité** des pièces
  jointes de l'état précédent, en base, sur le disque, et dans le quota ;
- **et une pièce peut changer de porteur en silence.** La reprise est le seul chemin où les
  identifiants du fichier redeviennent les clés primaires. Si l'export réinjecté contient un
  enregistrement portant l'identifiant d'un enregistrement purgé, **la vieille pièce s'y
  rattache**, sans qu'un mot le dise. C'est le cas nominal d'une restauration : les
  identifiants sont les mêmes. La pièce revient donc — ce qui est heureux — mais **par
  accident, pas par conception**, et rien ne le garantit si les deux jeux divergent ;
- **aucun chemin d'attaque inter-filiales** : la purge et la reprise sont bornées par le
  périmètre de la session.

**Empêche-t-il le pilote ?** Non — mais il faut **dire à l'exploitant pilote de ne pas se
servir du mode « remplacer »** tant que R1 n'est pas fermé, ou d'accepter de nettoyer le
magasin à la main derrière lui.

---

### Q-234 🔵 mineur — *Le contrôle de coût des expressions est aveugle à TOUTE expression contenant un guillemet, et à toute forme à quantificateurs BORNÉS*

**Le motif de fond, pour la cinquième fois : quelque chose de PARTICULIER là où il fallait
quelque chose de GÉNÉRAL.** Le neutraliseur de chaînes a été écrit pour les chaînes du *code*,
et il ne sait pas qu'une **expression rationnelle peut contenir un guillemet**.

**(a) Le guillemet.** `sansChaines()` traite le premier `'`, `"` ou `` ` `` rencontré comme
l'ouverture d'un littéral, y compris **à l'intérieur d'un motif**. Mesuré sur cinq formes :

| Source | Ce que le garde en retient |
|---|---|
| `const re = /^'([a-z]+)+'$/u;` | corps `^'         '$` → **pas de quantificateur → écarté** |
| `const re = /^"([a-z]+)+"$/u;` | corps `^"         "$` → **écarté** |
| `const re = /^([a-z]+)+'$/u;` | **NON EXTRAIT** — le `/` de fin a été aveuglé |
| `const re = /^'([a-z]+)+$/u;` | **NON EXTRAIT** |
| `const re = /"([\s\S]*?)"/gu;` | corps `"          "` → **écarté** — *c'est la forme même de Q-197* |

**Et ce n'est pas théorique** : `src/pieces/multipart.ts` — l'analyseur de dépôt de pièces
jointes, la surface d'analyse la plus exposée du produit — porte **deux** expressions, toutes
deux avec des guillemets :

```ts
72:  const trouve = /;\s*boundary\s*=\s*("([^"]+)"|([^;\s]+))/iu.exec(entete);
77:  if (valeur.length > 70 || !/^[0-9A-Za-z'()+_,\-./:=?]+$/u.test(valeur)) {
```

Passé l'extracteur du garde, ce fichier rend **0 expression extraite, 0 mesurée**. C'est
exactement le fichier dont Q-217 discutait l'exemption.

**(b) Les quantificateurs bornés.** Le filtre `if (!/[*+]|\{\d+,\}/u.test(corps)) continue;`
écarte toute expression qui n'a ni `*`, ni `+`, ni `{n,}`. Or des quantificateurs **bornés
imbriqués** explosent tout autant :

```
/^(a{1,40}){1,40}$/u   sur "a"×n + "!"
   n=20 →     81 ms      n=28 →  2 499 ms
   n=24 →    155 ms      n=32 → 41 867 ms
```

**La mutation, et le garde reste vert.** J'ai ajouté ces trois formes à `src/pieces/clamav.ts`
et joué le fichier :

```
✔ LA MATIÈRE : le balayage trouve bien les expressions du produit          (0,76 ms)
✔ AUCUNE ne grandit plus vite que son entrée, sur des sujets tirés d'elle-même (15,2 ms)
✔ AUCUN `new RegExp` dans `src/` qui ne soit mesuré et admis               (71,4 ms)
✔ LE CONTRÔLE MORD — sur les QUATRE formes trouvées par les portes successives (14 719 ms)
✔ IL N'ACCUSE PAS À TORT — les formes saines du produit passent            (2,1 ms)
ℹ tests 5 · pass 5 · fail 0
```

Les trois formes valent respectivement **2 213 ms pour 28 signes**, **41 867 ms pour 32
signes** et une croissance quadratique — et la passe de balayage s'est terminée en **15,2 ms**,
parce qu'elle ne les a pas essayées.

**Chiffre de couverture** : sur **74** expressions littérales extraites de `src/`, **30**
seulement sont mesurées. Le plancher de l'essai de « matière » est `>= 30`. Il est donc
**exactement** atteint, sans marge : une expression de plus rendue invisible ferait rougir le
garde pour la mauvaise raison.

**Conséquence d'exploitation. Aucune, aujourd'hui.** J'ai vérifié les six expressions de `src/`
qui contiennent un guillemet : elles sont toutes linéaires. **C'est le garde-fou qui est troué,
pas le produit** — et c'est la **cinquième** fois que cette famille passe sous le garde-fou
écrit pour l'arrêter. Le risque est celui d'une expression **future** : un serveur mono-fil
qu'une seule requête gèle, et avec lui `/api/sante`, l'annuaire et les dix-neuf autres filiales.

**Ce que le fichier prétend, et je l'ai jugé là-dessus.** Son en-tête ne dit plus couvrir la
classe : il dit être *« un filet, pas une preuve »*. C'est honnête, et cela change le poids du
constat — mais **un filet dont on connaît la maille doit la déclarer**. Il nomme cinq formes
apprises ; il ne dit nulle part que le guillemet le rend aveugle, ni que les quantificateurs
bornés sont hors de sa portée.

---

### Q-235 🔵 mineur — *La désinstallation laisse un réglage Apache de PORTÉE SERVEUR et la CLÉ PRIVÉE du serveur*

**Q-231 (a) a été fermé sur l'instance, pas sur la classe.** L'installation pose **trois**
gestes Apache de portée serveur ; la désinstallation en défait **un**.

```
posés par l'installation (deploy/install.sh) :
  526:  a2enmod  -q ssl proxy proxy_http headers rewrite deflate expires reqtimeout
  528:  a2dismod -q -f autoindex || true                    ← DÉSACTIVE un module global
  533:  a2enconf -q cyber-grc-durcissement

défaits par desinstaller() (lignes 862-1018) :
  a2dissite cyber-grc
  a2disconf -q cyber-grc-durcissement                       ← le seul des trois
```

**`autoindex` est effectivement désactivé sur cette machine** (`ls
/etc/apache2/mods-enabled/ | grep autoindex` → rien ; le module existe bien dans
`mods-available/`). Le drapeau `-f` force la désactivation même si un autre module en dépend.

**Second résidu, et il est d'une autre nature** : `/etc/ssl/cyber-grc/` — qui porte
`serveur.crt`, `chaine-pki-interne.crt` et **`serveur.key`, la clé privée du serveur** — n'est
retiré par **aucun** des deux modes. Le mot « ssl » n'apparaît pas une fois dans la fonction
`desinstaller()`. Or c'est le mode `--avec-les-donnees` qui annonce, mot pour mot :

> *« ET LES DONNÉES : base « $BASE_NOM », rôles PostgreSQL, pièces jointes, configuration et
> secrets. C'est IRRÉVERSIBLE. »*

**Conséquence d'exploitation.**

- **`autoindex`** : sur une VM partagée, tous les autres sites perdent leurs index de
  répertoire, et **personne ne saura pourquoi** — le logiciel qui l'a fait n'est plus là.
  C'est mot pour mot ce que le commentaire de Q-231 (a) énonce : *« un réglage de portée
  serveur laissé par un logiciel qui n'est plus là est pire qu'un fichier oublié »*. Le produit
  lui-même tient l'hypothèse « d'autres sites existent » : c'est la raison écrite pour laquelle
  la désinstallation refuse de recharger un Apache en défaut.
- **la clé privée** : une machine réputée nettoyée conserve la clé privée du certificat
  serveur, en `0640 root:root`. Si la VM est ensuite recyclée, revendue ou restaurée depuis un
  cliché, la clé part avec elle. **Rien ne l'exploite depuis l'extérieur** — c'est un résidu,
  pas une vulnérabilité — mais c'est un secret que le mode « détruire les secrets » ne détruit
  pas.

**Le garde ne dit rien de l'un ni de l'autre** : `grep -nE "autoindex|a2enmod|ssl/cyber-grc|serveur\.key"
test/deploiement/desinstallation.test.mjs` rend **vide**.

---

### Q-236 🔵 mineur — *Le garde des traductions délimite ses zones HTML à la LIGNE : tout le HTML construit par CONCATÉNATION lui échappe*

Le détecteur corrigé par Q-229 s'ancre bien sur l'**appel** ; mais ses zones sont :

```js
// test/depot/traductions.test.mjs:235-238
for (const m of source.matchAll(/innerHTML\s*=|insertAdjacentHTML\s*\(/gu)) {
    const fin = source.indexOf('\n', m.index);
    zonesHtml.push([m.index, fin < 0 ? source.length : fin]);
}
```

— **la fin de la ligne**, plus l'intérieur d'un `${…}`. Le produit, lui, construit son HTML
par concaténation sur **plusieurs lignes**. Compté par moi
(`grep -rnE "^\s*['\"]<" --include=*.js`, hors `js/lib/`) : **496 lignes commençant par un
littéral HTML, réparties sur 11 fichiers** — `app.js`, `core/reprise.js`, `core/sync.js`,
`core/ui.js`, et les modules `approbations`, `groupe`, `imports`, `journal`, `pieces`,
`referentiels_actifs`, `socle`. Parmi eux, `app.js` et `core/ui.js` sont **précisément les deux
fichiers internationalisés qui emploient ce style**.

Et l'inventaire des puits HTML du frontend, compté de la même façon : `innerHTML` **180**,
`insertAdjacentHTML` **2**, `outerHTML` **0**, `document.write` **0**,
`createContextualFragment` **0**. **Le garde nomme donc les deux seuls puits qui existent** —
son trou n'est pas un puits oublié, c'est **la forme de la zone**.

**La mutation, mesurée.** `js/app.js:1199` porte, sous un commentaire qui déclare la propriété
de sécurité :

```js
    // ⚠️ `profil` est une valeur venue du serveur : elle passe par `tHtml`,
    // qui l'échappe avant de la coudre dans la phrase traduite.
    (profil ? '<div …>' + tHtml("compte.acces", { niveau: profil }) + …
```

`tHtml(` → `t(`, c'est-à-dire l'échappement retiré. Résultat :

```
node --test test/depot/traductions.test.mjs
ℹ tests 15 · pass 15 · fail 0     (durée 308 ms)
```

Le détecteur ne voit rien : il n'y a pas de `${…}`, et la zone `innerHTML =` de la ligne 1192
est vide — l'expression commence à la ligne suivante.

**Neuf formes échappent** au détecteur, dont **deux ont des occurrences réelles** :
`innerHTML =` en fin de ligne avec l'expression en dessous (**11 sites**), et les fonctions
qui *retournent* du HTML concaténé (`ui.js:340 personChipHtml`, `ui.js:344 multiPersonHtml`).
Les sept autres — `outerHTML`, `document.write`, `createContextualFragment`, `innerHTML +=`,
concaténation pure sans gabarit… — n'ont **aucune occurrence réelle aujourd'hui**.

**Conséquence d'exploitation. Aucune, aujourd'hui — vérifié.** J'ai balayé les 275 lignes de
concaténation à la recherche d'une valeur cousue sans `escapeHtml`/`esc`/`UI.badge` : les
sites suspects (`journal.js:390`, `pieces.js:254`) sont **tous correctement échappés**. Le
produit est propre ; c'est le garde qui ne le prouve pas.

**Deux trous voisins, dans le même fichier :**

- **le garde des sœurs charge `js/i18n/index.js` SEUL et SANS DICTIONNAIRE.** `I18n.cles('fr')`
  rend **0 clé** dans son bac, contre **419** quand `index.html` charge `fr.js`/`en.js`. Toutes
  les fonctions sont donc exercées contre un dictionnaire vide, et il n'exerce que le
  **premier** argument. Conséquence : l'exemption de `t`/`tHtml` — justifiée par le fait que
  *« ces deux-là ont leur propre contrôle »*, à savoir le détecteur ci-dessus — est
  **inopérante des deux côtés à la fois** ;
- **`js/core/identite.js` n'est chargé par personne.** C'est le livrable L9, et sa donnée est
  la **raison sociale servie par le serveur**. Sa propre docstring écrit que *« le résultat est
  une donnée de filiale et doit donc encore passer par `escapeHtml` chez l'appelant »* ;
  **10 sites l'injectent en HTML**, tous échappés aujourd'hui, et **aucun garde ne l'exige**.

---

### Q-237 🔵 mineur — *Le journal des portes, déclaré « la seule source des verdicts », a NEUF passages de retard*

Le `CLAUDE.md` prescrit un ordre de lecture et désigne `docs/PLAN_EXECUTION.md` §7 comme
*« le journal des portes (§7, la seule source des verdicts) »*. Voici ce que ce tableau
contient, mesuré :

```
S1 (×6, 31/08) · S2 (×9, 31/08 → 02/09) · S3 (04/09)
                                          ↑ dernière ligne du tableau
```

Et voici ce que `docs/securite/` contient :

```
RAPPORT_S4.md  RAPPORT_S5.md  RAPPORT_S6.md
RAPPORT_S8.md  RAPPORT_S8_BIS.md  RAPPORT_S8_TER.md
RAPPORT_S8_QUATER.md  RAPPORT_S8_QUINQUIES.md
```

**Huit passages de porte manquent au journal**, et **six de leurs rapports ne sont cités nulle
part** dans le document :

```
RAPPORT_S4           : 0 citation      RAPPORT_S8_BIS       : 0 citation
RAPPORT_S5           : 0 citation      RAPPORT_S8_TER       : 0 citation
RAPPORT_S6           : 1 citation      RAPPORT_S8_QUATER    : 0 citation
RAPPORT_S8           : 1 citation      RAPPORT_S8_QUINQUIES : 0 citation
```

**Aucun garde ne lit ce tableau.** `test/documentation/registre.test.mjs` a été écrit pour le
tableau **voisin** — « Registre des constats ouverts » (constats Q-47 et Q-54) — et il ne
regarde que celui-là (`const TITRE = '### Registre des constats ouverts';`). Le tableau des
verdicts, celui que l'ordre de lecture déclare faire autorité, n'est gardé par personne.

**Conséquence d'exploitation, et c'est pourquoi je la place avant le pilote (réserve R3).** Un
exploitant — ou une session future — qui suit l'ordre de lecture prescrit lira que **le dernier
verdict rendu est S3, refusée, le 04/09**, et en conclura que **L5, L7, L8 et L9 n'ont jamais
été soumis à une porte**. C'est faux, et c'est faux dans le sens le plus coûteux : cela invite
à refaire un travail déjà fait, ou à traiter comme non éprouvé ce qui l'a été cinq fois. C'est
la définition même de ce que ce chantier traque : **une trace qui dit autre chose que ce qui
s'est passé.**

---

### Q-238 🔵 mineur — *Cinq nombres du `README` §8 sont faux et non gardés — point 6 du `PLAN_EXECUTION` §5 faux pour la CINQUIÈME porte consécutive*

Le garde de Q-222/Q-228 couvre **sept** nombres, et ces sept-là sont **tous justes** (§4). Les
suivants ne le sont pas — vérifiés un par un :

| Ligne | Ce que le §8 annonce | Réel, mesuré | Comment je l'ai mesuré |
|---|---|---|---|
| **L1435** | « **Neuf** contrôles y sont enregistrés » | **14** | `select count(*) from controles_schema` → 14 ; **le même document dit 14 en L889 et L1213** |
| **L1438** | « `db/migrate.mjs` a fait passer les **7** migrations » | **16** | `ls db/migrations/*.sql \| wc -l` → 16 ; la dernière est `016_direction_voit_le_groupe.sql` |
| **L933** | « `src/entites/` sert les **21 collections** » | **23** | `listerEntites()` compilé et appelé → 23, dont `risque_catalogue` et `referentiels_actifs` |
| **L923** | « …**1030** à la révision citée ci-dessus » | **1747** | la révision citée est `9de7d51` ; L864 et `npm test` disent tous deux 1747 |
| **L754** | `\| L7 → L15 \| ⬜ à faire — vagues 5 à 8 \|` | **L7 et L8 sont livrés** | `src/import/moteur.ts` et `src/approbations/circuit.ts` existent ; le §8 lui-même les décrit ailleurs comme livrés |

**Le garde écrit pour cette classe ne voit pas la dernière ligne.**
`test/documentation/etat-des-lots.test.mjs` confronte la table des lots aux livrables réels —
mais sa liste `PREUVE_DE_LIVRAISON` **s'arrête à L6**. Une table qui annonce « L7 → L15 à
faire » alors que L7, L8 et L9 sont dans le dépôt passe donc au vert.

**Deux nombres sont invisibles par construction** parce qu'ils sont **en toutes lettres** :
« **Neuf** contrôles » (L1435, et la même erreur au §5 L365). Un garde qui cherche
`\*\*(\d[\d\s]*)\*\*` ne les verra jamais.

**Conséquence d'exploitation.** Faible mais réelle, et c'est la raison pour laquelle le §5
point 6 en fait un constat et non une coquille : **un exploitant qui vérifie une installation
compare ces chiffres au réel.** Faux, ils ne mesurent plus rien — pire, ils rassurent. Celui
qui compte 16 migrations là où le document en annonce 7 conclura qu'il a la mauvaise version.

---

### Q-239 🔵 mineur — *« 16 actions sur 20 » : le chiffre est faux dans ses DEUX termes, et il l'est en faveur du produit*

Le `README` §8 (L751, L1515) et le `CLAUDE.md` annoncent : *« le journal émet **16 actions sur
20** (les quatre autres reportées par écrit) »*, les quatre nommées étant `purge`,
`archivage`, `approbation` et `analyse_antivirus`.

Mesuré :

- **le dénominateur est 21, pas 20.** La contrainte `ck_journal_audit_action` porte 21 valeurs
  depuis la migration `009_perimetre_actif.sql`, qui a ajouté `changement_perimetre` ;
- **les 21 ont un site d'émission dans `src/`.** J'ai remonté les quatre prétendument
  manquantes : `analyse_antivirus` → `src/pieces/index.ts:576, 620, 684` ; `approbation` →
  `src/approbations/circuit.ts` ; `archivage` et `purge` → `src/cycle/index.ts:372, 965` ;
  et les trois autres non nommées : `demarrage`/`arret` → `src/serveur.ts:492, 533` ;
  `verification_journal` → `src/api/journal.ts:616` ; `connexion_echouee` →
  `src/auth/index.ts:820` ;
- **17 sont réellement observées** sur la recette (§4.8) : les quatre absentes
  (`session_revoquee`, `approbation`, `purge`, `archivage`) ne sont pas des manques du produit,
  ce sont des actes que personne n'a encore posés sur cette instance.

**Conséquence d'exploitation.** L'erreur va dans le bon sens — le produit fait **plus** que la
documentation n'annonce — mais elle a un coût réel : **les « quatre reportées par écrit » ont
été fermées sans que rien ne le note.** Une réserve qui se referme sans qu'on s'en aperçoive
est le pendant exact de la leçon du §0.3 (*« une réserve écrite n'est pas une réserve
traitée »*) : ici, une réserve **traitée** est restée **écrite**. Un auditeur ISO 27001 à qui
l'on annonce « 16 sur 20 » se demandera lesquelles manquent, et il perdra son temps — comme
j'ai perdu le mien à les chercher.

---

### Q-240 🔵 mineur — *Le sixième garde de `chiffres-du-schema` est VERT sur une phrase FAUSSE, et quatre de ses sept motifs ne lisent toujours qu'une occurrence*

**(a) Le garde valide un nombre que sa phrase rend faux.** Le `README` L1196-1198 écrit :

> *« Relevé dans `pg_constraint` : **12 clés étrangères** dont la seconde colonne visée est le
> `filiale_id` du parent, et **9 unicités** de cette forme. Une **douzième** clé composite vise
> `(id, portee_groupe)` … »*

Mesuré sur le catalogue de la recette :

```sql
select count(*) filter (where array_length(conkey,1)=2)                        -- 12
     , count(*) filter (where … confkey[2] = 'filiale_id')                     -- 11
  from pg_constraint where contype='f';

-- la 12e : fk_document_referentiels_portee -> (id, portee_groupe)
```

**11** clés visent `filiale_id`, pas 12. La phrase se contredit elle-même — 12 « dont
`filiale_id` » **plus** une douzième en ferait 13 — et le garde reste vert parce que **sa
requête compte toutes les clés à deux colonnes**, pas le prédicat que la phrase énonce.

C'est le défaut que Q-222 et Q-228 combattaient, **déplacé de la lecture vers la requête de
comparaison** : le garde ne se trompe plus sur *où* lire, il se trompe sur *quoi* comparer.

**(b) Q-228 est fermé sur le mécanisme, pas sur la portée.** Le garde emploie bien `matchAll`,
mais quatre de ses sept motifs restent calés sur la **formulation du premier bloc** et ne
trouvent donc qu'une occurrence :

| Motif | Première occurrence | Seconde occurrence, invisible |
|---|---|---|
| `\*\*(\d[\d\s]*) tables\*\* en` | L885 | **L1159** — `**49 tables**,` (virgule, pas ` en`) |
| `\*\*(\d[\d\s]*) tables portant` | L887 | **L1202** — `les **44 tables** portant` (les `**` se referment avant « portant ») |
| `…\*\*(?=[ ]*(?:composites\|dont))` | L1196 | **L888** — `**12 clés étrangères composites**` (les `**` après « composites ») |

**Conséquence d'exploitation.** Nulle en exploitation directe — c'est un garde-fou, pas le
produit. Mais elle est réelle au sens du §5 point 6 : *un garde-fou qui ne lit qu'une partie de
son sujet rassure sur le reste*, ce que Q-228 énonçait déjà. Le second bloc du §8 peut dériver
sur trois de ses chiffres sans que rien ne rougisse.

---

### Q-241 🔵 mineur — *La dérogation de `session_filiales` couvre moins que ce que sa politique accorde : une session bornée à une filiale lit la carte d'accès de tout le groupe*

**Le fait, mesuré.** Trois tables du substrat de session portent une politique de lecture
`using (true)` :

```
session_domaines     pol_session_domaines_lecture       using "true"
session_filiales     pol_session_filiales_lecture       using "true"
sessions             pol_sessions_lecture               using "true"
```

Depuis une session applicative **bornée à la filiale A** :

```
  sessions          -> 2 ligne(s) visible(s)
  session_filiales  -> 2 ligne(s) visible(s)
  session_domaines  -> 0 ligne(s)
  filiales          -> 1 ligne  ✔  (la fermeture de Q-132 tient)
  risques           -> 2 lignes ✔

  contenu de session_filiales :
    [{"session_id":"SESS-A","filiale_id":"FIL-ESSAI-A"},
     {"session_id":"SESS-B","filiale_id":"FIL-ESSAI-B"}]     ← la filiale B, depuis A
```

**Il faut distinguer deux cas, et je les sépare parce qu'ils n'ont pas le même statut.**

- **`sessions` et `session_domaines` : arbitrage écrit, à jour, délibéré — pas un constat.**
  Ces deux tables ne portent pas de `filiale_id`. Le registre de dérogations a été **remis à
  jour par la migration `007`, celle du lot L3**, et dit exactement ce qu'il fait :
  *« `sessions` — produit le périmètre : sa LECTURE reste non cloisonnée, son ÉCRITURE est
  fermée depuis 007 »*, *« `session_domaines` — idem ; l'exemption ne porte plus que sur la
  lecture »*. C'est une décision prise en connaissance de cause et tenue à jour. Je la relève
  sans la reprocher.
- **`session_filiales` : la justification écrite ne couvre pas ce que la politique accorde.**
  Cette table **porte un `filiale_id`**, et sa dérogation est motivée ainsi :
  *« c'est la table qui PRODUIT le périmètre ; le filtrer par lui-même rendrait toute
  connexion impossible »*. La circularité est réelle — mais elle justifie qu'une session lise
  **ses propres** lignes, jamais celles des autres. Un prédicat
  `session_id = <celui de la session courante>` lèverait la circularité sans ouvrir la table
  en grand, exactement comme `f_filiales_actives()` le fait ailleurs.

**Ce qui borne la gravité, et il faut le dire aussi nettement que le défaut :**

- **aucune route ne l'expose.** J'ai remonté les **cinq** lectures de ces tables dans tout
  `src/` : `src/auth/sessions.ts:268` (`where s."jeton_empreinte" = $1`), `:297` et `:301`
  (`where "session_id" = $1`), `:404` (suppression bornée), et `src/api/index.ts:1618`
  (l'`exists` **à l'intérieur** de l'`update`, borné par `s."id"`). **Aucune n'est libre** ;
- **l'écriture est bien fermée**, et je l'ai vérifiée : `insert into session_filiales` pour
  s'octroyer la filiale B rend **`42501`**, la politique d'ajout refusant la ligne. C'est la
  condition E1, et elle tient ;
- **`jeton_empreinte` est un SHA-256**, pas le jeton : le lire ne permet pas de rejouer une
  session.

**Conséquence d'exploitation.** **Aucune, aujourd'hui** — l'exploitation exigerait une
injection SQL, et le contrôle S5 est passé sur 69 formes. C'est un défaut de **défense en
profondeur** : la RLS est censée être le filet qui rattrape une erreur applicative, et sur
cette table-là elle ne rattrape rien. Ce qui serait divulgué, si le filet devait servir, est
précisément ce que la migration `010` a refermé sur `filiales` au titre du constat Q-132 :
**la liste des identifiants de filiales du groupe** — et, en prime, qui a le droit de lire
quoi. Le motif écrit alors s'applique mot pour mot : *l'existence même d'une filiale peut
précéder son annonce*.

**Deux propriétés voisines, constatées en chemin, qu'il ne faut surtout pas défaire** :
`utilisateurs` porte un **privilège de colonne** — `grc_app` lit ses 21 colonnes sauf
`mot_de_passe_hash`, seule colonne fermée du schéma ; et `journal_audit` n'accorde à `grc_app`
que `INSERT, SELECT`, si bien que les politiques `pol_journal_audit_maj` et
`pol_journal_audit_suppression`, bien qu'en `using (true)`, sont **inertes** : le refus tombe
un cran plus bas, au privilège.

---

### Q-242 🟠 **majeur — défaut du PRODUIT** — *`GET /api/rafraichir` rend le jeu de données complet, à un compte SANS droit d'export, et ne laisse AUCUNE trace*

**Le fait, mesuré sur la RECETTE, à travers Apache, avec un compte d'annuaire réel.**

Compte `rssi.tls`, dont la session déclare `export: false` et qui n'est pas membre de
`GRC-EXPORT` :

```
GET /api/export                                    -> 403     241 octets
GET /api/donnees                                   -> 200   4 690 octets
GET /api/rafraichir?depuis=1970-01-01T00:00:00.000Z -> 200   4 340 octets
```

Et ce que rend la troisième :

```
clés de premier niveau : ['horodatage', 'modifications', 'volumes', 'tronque']
collections : 5 | enregistrements : 15 | tronque = False
  actions   -> 3 enr., champs : id, titre, statut, priorite, responsable, echeance, …
  risques   -> 2 enr., champs : id, nom, f_frequence, g_gravite, m_maitrise, score_brut, …
  audits    -> 1 enr.      history -> 3 enr.      personnes -> 6 enr.
```

**C'est le jeu de données de la filiale, complet, avec tous ses champs.** Le paramètre
`depuis` est fourni par l'appelant : à `1970-01-01`, « les modifications depuis » sont
*tout*. La borne `BORNES.lignesParSondage = 2000` plafonne un appel et pose un drapeau
`tronque` — un appelant qui fait avancer `depuis` récupère la suite.

**Et la trace, mesurée sur la recette :**

```
journal avant                                      : 812
GET /api/rafraichir?depuis=1970-…  ×3              : 200, 200, 200
journal après trois extractions complètes          : 812     (delta = 0)

témoin — GET /api/donnees                          : 200
journal après                                      : 813     (delta = 1)
   813 | consultation_sensible | Chargement du jeu de données complet de la filiale active
```

**Trois extractions du jeu complet, zéro entrée.** La route sœur, qui rend *la même chose*,
en pose une.

**Conséquence d'exploitation.** Il faut être précis sur ce qui est perdu et sur ce qui ne
l'est pas :

- **ce n'est PAS une élévation de privilège.** Le compte peut lire ces mêmes données par
  `/api/donnees`, qui lui est ouverte et qui **est** tracée. Aucune donnée ne parvient à
  quelqu'un qui ne pouvait pas la voir, et le cloisonnement de filiale s'applique
  normalement ;
- **ce qui est perdu, c'est la RÉPONSE à la question de l'auditeur.** Le `PLAN_SERVEUR` §1.7
  écrit que *« savoir qui a extrait quelles données est une exigence de sécurité »*, et §3.3
  que l'export doit être *« journalisé systématiquement »*. Sur cette route, la question
  **« qui a extrait le jeu complet, et quand ? »** n'a **aucune réponse** — pas même la ligne
  `consultation_sensible` que le correctif de Q-209 a posée sur la route voisine ;
- **c'est le jumeau exact de Q-209**, sur la route que son correctif n'a pas couverte. Sixième
  occurrence du motif : *le cas montré est fermé, la classe ne l'est pas.*

**Le contrôle S7 est donc EN ÉCHEC**, à la lettre de sa preuve attendue (*« Tout export
réussi ou refusé est journalisé »*) comme à son intention.

**Et le garde écrit pour cette classe ne peut pas le voir** :
`backend/test/depot/entonnoir-export.test.mjs` passe 4/4 — il ne balaie que
`cyber-gouvernance_V4/js/`, **jamais le serveur**.

⚠️ **La difficulté du correctif est réelle, et il faut la dire.** `js/core/sync.js:72` sonde
toutes les **20 secondes** : tracer chaque sondage ajouterait ~180 entrées par utilisateur et
par heure, soit des centaines de milliers par jour à vingt filiales — un journal qu'on
n'ouvre plus est un journal qui ne sert plus. Le correctif juste n'est donc pas « tracer
`rafraichir` », c'est **tracer quand la réponse constitue en fait une extraction** : un
`depuis` antérieur à l'ouverture de la session, ou un volume au-delà d'un seuil. Un sondage
normal rend zéro ou trois lignes ; celui que j'ai fait en rend quinze, tout le jeu, et
`tronque: false`. **Rien aujourd'hui ne distingue les deux.**

---

### Q-243 🟠 **majeur — une promesse écrite du cadrage n'est pas tenue** — *Effacer la QUEUE du journal est indétectable, et le produit répond « sain »*

**Le fait, mesuré.** Le `PLAN_SERVEUR` §1.7 promet que le chaînage par empreinte rend
*« toute altération détectable **même par accès direct à la base** »*. C'est vrai d'une
modification et d'une suppression **au milieu**. C'est **faux d'une troncature de queue** :

```
journal : 2 entrées, numéros 1 → 2
  AVANT                                 -> 0 anomalie(s)
  (les quatre déclencheurs retirés par le PROPRIÉTAIRE)
  TRONCATURE DE QUEUE : 1 entrée la plus récente effacée
  APRÈS troncature de QUEUE             -> 0 anomalie(s)      ← rien n'est dénoncé
```

À comparer avec les deux autres altérations, mesurées au §4.14 :

```
  APRÈS altération du résumé            -> 1 anomalie(s)   ← l'entrée est nommée
  APRÈS suppression au MILIEU           -> 1 anomalie(s)   ← la chaîne est rompue
```

C'est une propriété **structurelle** d'une chaîne d'empreintes sans ancrage : la vérification
remonte depuis la tête, et retirer la tête laisse une chaîne parfaitement valide. Le
`CONVENTIONS.md` §12 énumère **cinq** anomalies ; aucune ne couvre ce cas, et **la limite
n'est écrite nulle part**.

**Conséquence d'exploitation.**

- **Il faut le rôle `grc_proprietaire`** — ou `root` sur la VM. C'est la limite que la grille
  s'accorde explicitement (*« elle ne protège pas contre un `root` sur la VM ni contre le
  propriétaire de la base »*), et le compte de service `grc_app` ne peut pas y accéder :
  `set role grc_proprietaire` rend `42501`. **Aucun chemin d'attaque depuis l'application.**
- **Mais le cadrage promet le contraire**, et c'est le cadrage que le client a validé. Un
  administrateur système du groupe — précisément celui dont l'auditeur ISO 27001 demande
  *« peut-il modifier le journal ? »* — peut effacer les N entrées les plus récentes, c'est-à-dire
  celles qui portent ses propres actes, et `GET /api/journal/verification` répondra
  **`sain: true`**. Le produit ne se contente pas de ne pas voir : **il affirme l'intégrité.**
  Un contrôle qui rassure à tort est pire qu'un contrôle absent.
- **Le remède existe déjà à moitié dans le dépôt** : la table `parametres` porte une clé
  `journal.ancrage_<annee>`, mais elle n'est posée qu'**à l'archivage**. Rien n'ancre la
  **tête vivante** de la chaîne. Ancrer périodiquement (numéro courant + empreinte, horodaté,
  hors de `journal_audit`) ferme le cas sans rien réécrire.

**Deux documents se contredisent, et il faut trancher.** Le `PLAN_SERVEUR` §1.7 dit
« détectable même par accès direct à la base » ; le `CONVENTIONS.md` §12 exclut le
propriétaire de la base. Tant que l'un des deux n'est pas corrigé, l'exploitant qui répondra
à l'auditeur ne saura pas lequel citer. **C'est pour cela que je classe ce constat majeur
plutôt que mineur** : le défaut n'est pas la troncature, c'est la phrase qui promet qu'elle
serait vue.

---

## 6. LA GRILLE S1 → S18, REJOUÉE INTÉGRALEMENT

Rejouée intégralement. Un contrôle sans objet est marqué « sans objet », **jamais
« passé »** ; un contrôle non rejoué est marqué « non rejoué », ce qui ne vaut ni l'un ni
l'autre.

| # | Contrôle | Verdict | Ce qui a été mesuré |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ✅ **passé** | **33** tables portent `filiale_id`, découvertes dans `pg_catalog` et non listées à la main ; **33/33** en `enable` **et** `force row level security` ; **49/49** pour toutes les tables publiques. `grc_app` : `rolbypassrls = false`, `rolsuper = false`, **0 table possédée** (les 49 appartiennent à `grc_proprietaire`), `set role grc_proprietaire` refusé `42501`, DDL refusée `42501`. **Balayage de fuite** : périmètre A, filiale B peuplée → **31 des 32 tables probantes rendent zéro ligne de B** ; la 32ᵉ est `session_filiales`, dérogation écrite (voir **Q-241**). **Sabotage** : `alter table risques no force row level security` → le contrôle passe de 33/33 à **32/33 et rouge**, et les 2 lignes de B deviennent visibles au **propriétaire** — pas au compte applicatif. Recoupement : `test/base/rls.test.mjs` + `test/droits/perimetre-serveur.test.mjs` → **216/216** |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** | **Deux** sites d'écriture des réglages dans tout `src/`, et deux seulement : `src/db/pool.ts:375-378` (valeurs **paramétrées** `$1..$4`, issues de `PerimetreSession`) et `src/auth/transaction.ts:56` (`grc.authentification`, **littéral constant**). `resoudre()` ne prend **aucun argument** dans ses trois implémentations. `js/core/api.js` n'expose qu'une fonction portant un identifiant de filiale, `choisirFilialeActive(id)`, vers la route dédiée. **11 sondes hostiles** (entêtes `x-filiale`, `x-utilisateur`, `x-administration-groupe` ; cookies `filiale=`, `grc.filiales=A,B` ; paramètres `?filiale=`, `?filiales=`, `?perimetre=groupe`) → **corps identique à l'octet près (6 419 o) dans les onze cas**, zéro occurrence de la filiale B. **Le choix L4 est revérifié en base** : l'`exists` sur `session_filiales` est **dans** l'`update` (`src/api/index.ts:1617`), pas avant ; filiale hors périmètre → `rowCount 0` → **403 `hors_perimetre`**, indiscernable d'une filiale inexistante (pas d'oracle). **Sabotage** : `filiale_active_id` forcé en base vers B pendant que `session_filiales = [A]` → le crochet compare les deux **à chaque requête** et refuse en `perimetre_perime` |
| **S3** | Journal d'audit inaltérable et complet | ⚠️ **passé sur l'inaltérabilité et la couverture, RÉSERVE sur la détectabilité** | Sous `grc_app` : `update`, `delete`, `truncate`, `drop trigger`, `disable trigger all` → **tous refusés `42501`**, au niveau du **privilège** (le rôle n'a que `INSERT, SELECT`). Sous **`grc_proprietaire`** : `update`, `delete`, `truncate` → **refusés `GRC01`** par les déclencheurs. `f_journal_audit_verifier()` → **0 anomalie** sur la recette (773 entrées) comme sur base neuve. **Vocabulaire** : 21 actions à la contrainte, **21 ont un site d'émission**, **17 observées** sur la recette. **Le refus d'export EST tracé**, avec route, méthode et action exigée — et **sans nom d'enregistrement** (leçon Q-118). **Détection quand la prévention tombe** : voir §4.14 — modification et suppression *au milieu* détectées. ⚠️ **La troncature de QUEUE ne l'est pas**, et le produit répond `sain: true` : constat **Q-243** |
| **S4** | Verrouillage optimiste effectif | ✅ **passé** | Deux `PUT` **simultanés** sur la version 1 → **200 / 409 `conflit_version`**, message explicite (« Cet enregistrement a été modifié entre-temps par quelqu'un d'autre »), `code_grc: GRC03`, `version_actuelle` rendue. Écriture sur une version périmée → **409**. **Le client ne peut pas fixer `version` — il est REFUSÉ, pas ignoré** : `{champs:{version:99}}` → **400** *« Le champ « version » n'appartient pas à l'entité « risques » … Aucune donnée n'a été enregistrée »* ; idem pour `cree_par` et `cree_le`. **Les cinq verdicts d'un `UPDATE 0`, provoqués un par un** : `conflit_version` → 409 ; `invisible` (id inexistant) → **404 `ressource_inconnue`**, sans oracle ; `autre_filiale` → **403 `hors_perimetre`** ; `portee_groupe` (socle commun sans administration Groupe) → **403** ; `refus_politique` (déclencheur `return null` posé exprès) → **403**. Cinq situations, cinq messages distincts, trois codes HTTP. Banc : 32/32 |
| **S5** | Aucune injection SQL | ✅ **passé** | **176** gabarits contenant du SQL dans `src/`, dont **141** sans interpolation ou 100 % `ident()`. Les **35** restants remontés un par un à leur origine : `ident()` (motif `^[a-z_][a-z0-9_]{0,62}$`, exception sinon, alimenté par le REGISTRE et `pg_catalog`) ; `${table}/${colonne}` de la consolidation, borné par un type à **7 couples littéraux** que `tsc` referme ; un fragment SQL **constant** ; des colonnes issues de `CHAMPS_ADMIS` (13 littéraux gelés) ; des `join()` de fragments faits **exclusivement** de `ident(...)` et de `$n`. **Épreuve dynamique : 69 formes envoyées, 63 refusées en 4xx.** Les six servies sont le comportement correct — un `nom = "Robert'); DROP TABLE clients;--"` **stocké verbatim comme valeur**, des filtres de journal rendant `entrees: []`, et `GET /api/modele?entite=sessions` rendant **exactement les mêmes 9 880 octets** que sans paramètre. **Intégrité après les 69 sondes : 49 tables, clients de A = 1.** ⚠️ Le protocole simple accepte le multi-instruction sous `grc_app` (`select 1; select 2` passe) — ce qui rend l'exigence non théorique, et rend le résultat probant |
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | Mesuré **à travers Apache**, session `rssi.groupe` : `GET /api/consolidation` → **200**, `GET /api/import/modeles` → **200**, `POST /api/filiales` → **403 `droit_insuffisant`**. Le compte porte `administration_groupe: false` ; le refus vient du serveur, pas de l'interface. Et dans le navigateur : `#/journal` → 403, avec un message que l'utilisateur comprend (§4.7) |
| **S7** | Le droit d'export est distinct de la lecture | ❌ **EN ÉCHEC** — constat **Q-242** | **La barrière tient sur les routes qui déclarent `exporter`** (elles sont trois : `GET /api/export`, `GET /api/journal/export`, `POST /api/cycle/sortie-filiale`). Compte `rssi.tls`, **non membre de `GRC-EXPORT`** (vérifié dans l'annuaire réel : le groupe compte `admin.grc` et `rssi.groupe`). `GET /api/export` → **403**, `GET /api/journal/export` → **403**, avec le message *« L'export des données est une autorisation distincte de la consultation »*. `GET /api/consolidation` → 200 mais `perimetre.groupe = false, filiales = 1`. **Les deux refus sont au journal** (entrées 791 et 793), avec leur route. ⚠️ **Mais `GET /api/rafraichir?depuis=1970-…` rend le jeu complet au même compte, en 200, et ne laisse AUCUNE trace** — trois extractions, delta de journal **0**, quand `/api/donnees` en pose une. La preuve attendue exige que *« tout export réussi ou refusé »* soit journalisé : elle n'est pas tenue |
| **S8** | Secrets | ✅ **passé** | Balayage de `backend/src`, `backend/deploy` et `cyber-gouvernance_V4/js` pour un secret **littéral** → **4 occurrences, toutes des références de variable** (`PGPASSWORD="$(lire_variable …)"`), aucune valeur en clair. Aucun champ de secret dans `/api/session`. Message d'erreur : `{"erreur":"ressource_inconnue","message":"Aucune ressource ne répond à GET /api/inexistant.","reference":"REQ-…"}` — un identifiant de corrélation, et rien d'autre. **Et une propriété que je n'attendais pas** : `utilisateurs` porte un **privilège de colonne** — `grc_app` lit ses 21 colonnes **sauf `mot_de_passe_hash`**, seule colonne fermée du schéma |
| **S9** | Chaîne de contrôle des pièces jointes | ✅ **passé — 8 contrôles, 8 mordus** | **(1) Liste blanche** : `.exe` (ELF) et `.zip` nu → **400** *« Les fichiers « .exe » ne sont pas acceptés »* ; témoin `.pdf` → 201. **(2) Macros** : un **`.docm` renommé `.docx` avec le MIME docx** → **400** *« Les documents contenant des macros ne sont pas acceptés »* — refusé **par ce que le conteneur OOXML contient** (`word/vbaProject.bin`), pas par l'extension ; témoin `.docx` authentique → 201. **(3) Signature binaire** : ELF renommé `.pdf`, texte renommé `.png` → **400** *« Le contenu ne correspond pas à son extension »*. **(4) ClamAV RÉEL** : chaîne EICAR → **400**, `etat_analyse = infectee`, **1 fichier en quarantaine**, **3** entrées `analyse_antivirus`. **(5) Hors racine web** : magasin en `0700`, arborescence `xx/yy/<sha256>`, **aucun nom d'origine sur le disque**. **(6) Délivrance forcée** : `content-disposition: attachment; filename="…"; filename*=UTF-8''…`, `x-content-type-options: nosniff`, `cache-control: private, no-store`. **(7) Ré-analyse** : pièce saine au dépôt, contenu remplacé par EICAR sur le disque, `date_analyse` vieillie de 200 j → `reanalyserStock` la met en quarantaine (`Eicar-Test-Signature`, `deplaceePhysiquement: true`) et **le téléchargement rend 404** ; `cyber-grc-reanalyse.timer` **actif**, dernier passage relevé. **(8) Quotas** : fichier de **26 215 529 o** → **413 `volume_excessif`** ; quota de filiale abaissé à 40 960 o, 3ᵉ dépôt → **413** *« L'espace de stockage alloué à votre filiale est atteint »*. ⚠️ **Piège de mesure que j'ai rencontré moi-même** : une chaîne EICAR **enveloppée dans un PDF** n'est PAS détectée (`stream: OK`, dépôt en 201) — c'est le comportement connu de ClamAV, dont la signature EICAR exige le fichier de test tel quel, et **non** un défaut du produit. La mesure probante est l'EICAR nue |
| **S10** | Sortie et en-têtes | ✅ **passé** | Lus **depuis Chromium**, sur `/` et sur `/api/session` : CSP stricte (`default-src 'self'; script-src 'self'; object-src 'none'…`), `nosniff`, HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy`, **`Cache-Control: no-store` sur l'API**. Cookie `grc_session` : **HttpOnly ✔ Secure ✔ SameSite=Strict ✔**. Échappement conservé : les sites de concaténation HTML que j'ai balayés sont tous échappés (§Q-236) |
| **S11** | Limitation du rythme et verrouillage | ✅ **passé** | Martèlement de `POST /api/connexion` sur un identifiant **inexistant** (aucun compte réel verrouillé) : essais 1→5 à **57-69 ms**, essais 6→9 à **21-26 ms** — le court-circuit du verrou. Message **identique aux neuf essais** : *« Identifiant ou mot de passe incorrect, ou compte temporairement bloqué »* — **aucun oracle** sur l'existence du compte ni sur son état. Échecs journalisés : `connexion_echouee (133)` sur la recette |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** | Quatre familles de réponse examinées : `ressource_inconnue`, `droit_insuffisant`, `donnee_invalide`, `non_authentifie`. Aucune pile d'appel, aucun nom de table, aucun chemin de fichier, aucun nom d'objet de base. Chaque réponse porte une **référence de corrélation** (`REQ-<horodatage>-<aléa>`) qui permet de retrouver le détail au journal technique sans le divulguer. Et **dans l'interface**, le 403 du journal se traduit par une phrase que l'utilisateur comprend, pas par un écran vide (§4.7) |
| **S13** | Dénis de service applicatifs | ✅ **passé** | À travers Apache : corps de **28 Mio → 413**, corps de 1 Mio → 401 (passe la borne), `Transfer-Encoding: chunked` → **411**, corps minuscule → 401. **La borne agit sur `/api/`** — c'est exactement ce que le 8ᵉ passage de la porte S2 avait trouvé faux. Délais de garde : `connectionTimeout` et `requestTimeout` posés côté Fastify depuis Q-214 (a), **plus larges** que le `ProxyTimeout 60` d'Apache à dessein. ⚠️ Quatre coûts non bornés restent ouverts et datés `V1.1` (Q-214 b, c, d, f) — voir §7 |
| **S14** | Intégrité des opérations composites | ✅ **passé** | **(a) Import rompu en cours** : la ligne 201 répète la clé de la ligne 6 → **409**, et **0 évaluation subsiste** ; le `23505` ne peut survenir *que si* les 199 précédentes étaient physiquement écrites — *« 199 lignes écrites, zéro subsiste »* est **vérifié**, pas recopié. Témoin (fichier sain) → 200, `creees: 250`, 250 en base. La ligne `imports.statut = 'echoue'` survit dans une transaction distincte, délibérément. **(b) Reprise rompue à mi-parcours** : ⚠️ la première tentative (identifiant dupliqué) est refusée **avant écriture** et ne prouve rien ; la panne a donc été posée **à l'écriture**, sur le 30ᵉ actif, les 200 risques étant déjà écrits, **en mode `remplacer`** → **500**, et l'état est **identique** avant/après — `RISK-REPR-%` : 0, `ACT-REPR-%` : 0, et **les données d'origine sont intactes** : *en mode remplacer, la purge préalable est annulée avec le reste*. **(c) Q-218** : déclencheur refusant l'entrée de journal `creation/filiales` → `POST /api/filiales` **500**, `filiales` inchangée, `groupes_ad` inchangée ; témoin panne levée → 201 |
| **S15** | Dépendances | ✅ **passé** | `npm audit --omit=dev` → **`found 0 vulnerabilities`**, code de retour **0**. Deux dépendances de production seulement (`fastify ^5.12.1`, `pg ^8.23.0`), trois de développement. La réserve « non rejoué » que six passages avaient reconduite est bien levée |
| **S16** | Les garde-fous sont branchés | ✅ **passé** | **15** fonctions `f_verifier_*` dans `pg_proc`, dont **14 découvertes** par `f_decouvrir_controles_schema()` et **14 conformes** — la 15ᵉ est `f_verifier_schema()` elle-même, le point d'appel. **14 au registre `controles_schema`**, **0 présente mais non découverte**. Le point d'appel **découvre**, il ne récite pas (`for r in select * from f_decouvrir_controles_schema() loop` puis `execute format(…)`). Il est appelé par `db/migrate.mjs` (code de sortie **7** dédié) **et** par `deploy/install.sh:1877`, en transaction `read only`, avec `statement_timeout=60s`, le code de retour testé **séparément** de la sortie. **Quatre sabotages, quatre détections** : `no force rls` → 1 anomalie + `migrate.mjs` code **7** ; table intruse sans `filiale_id` → **4** anomalies + code **7** ; fonction de contrôle renommée → 1 anomalie citant la signature consignée + code **7** ; garde-fou greffé non conforme → **2** anomalies, **et il n'est pas joué** |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | **Chromium réel → Apache 2.4.68 réel (vhost du dépôt) → Active Directory Samba réel → PostgreSQL 17.11.** Connexion par le **vrai formulaire**, compte `rssi.groupe`. **33 écrans parcourus, 32 sans une erreur**, le 33ᵉ étant un refus de droit légitime et bien dit. **0 violation de politique de sécurité de contenu. 0 requête en échec.** Et la recette sert bien la révision du dépôt : **80 des 81 fichiers publiés sont identiques octet pour octet**, le 81ᵉ (`index.html`) ne différant que par le jeton de version que `install.sh --maj` pose |
| **S18** | Le produit fait ce qu'il doit faire | ⚠️ **passé, avec la réserve Q-232/Q-233** | Le geste complet, dans Chromium contre la recette : ouvrir `#/risques` (2 lignes) → « Déclarer un risque » → remplir → « Créer le risque » → la ligne apparaît → **`page.reload()`** → **la saisie est toujours là** (3 lignes) → supprimer par l'interface → retour à 2. **Le rechargement ne détruit rien** — c'est le geste exact qui a fait refuser le 6ᵉ passage de la porte S2. ⚠️ **La réserve** : « Supprimer » ne supprime pas tout. Sur six chemins de cascade et sur la reprise « remplacer », les pièces jointes du porteur détruit **subsistent et se téléchargent encore** (Q-232, Q-233). Je ne marque pas S18 « en échec » — les gestes aboutissent et ne détruisent rien de ce que l'utilisateur a saisi — mais je refuse de le marquer « passé » sans nommer cette réserve, parce que c'est précisément la classe de défaut pour laquelle S18 a été écrit |

**Récapitulatif : 18 contrôles rejoués. 0 « sans objet ». 0 « non rejoué ». 1 en échec (S7).
2 passés sous réserve nommée (S3, S18).**

---

## 7. LES RÉSERVES OUVERTES, reprises une par une

L'orchestrateur m'a nommé sept réserves. Je les ai toutes **rouvertes et mesurées** plutôt que
reconduites — c'est la leçon la plus chère de ce chantier (*« une réserve écrite n'est pas une
réserve traitée »*), et elle vaut aussi pour l'auditeur qui la relit.

| Réserve | État mesuré | Conséquence d'exploitation | Empêche le pilote ? |
|---|---|---|---|
| **Q-205 b** — un aperçu d'import ne laisse **aucune trace** alors qu'il exécute jusqu'à 5 000 `INSERT` réels | ⚠️ **toujours ouverte**. `src/api/index.ts:2282` lit `apercu`, et aucun appel au journal ne se trouve sur ce chemin | Un utilisateur peut charger 5 000 lignes d'un fichier, les voir écrites puis annulées, **et recommencer autant qu'il veut sans qu'un audit puisse le reconstituer**. Ce n'est pas une fuite — la transaction est annulée — mais c'est un trou dans la traçabilité d'un produit qui sert de preuve en audit | **Non.** À traiter en `V1.1` |
| **Q-206** — deux erreurs de **fond** dans le catalogue AirCyber français | ⚠️ **toujours ouverte, et vérifiée mot pour mot**. `js/data/ref_aircyber.js:608` porte bien *« WAF (web access filtering) »* — c'est *web application firewall* — et `:1335` bien *« ISO 62443 »*, norme qui n'existe pas sous ce nom (c'est **IEC** 62443). La traduction anglaise (`js/data/en/ref_aircyber.js`) écrit les termes justes : **les deux langues divergent sur un point de fait** | Un RSSI qui répond au questionnaire lit une définition fausse d'un terme technique, dans un outil censé faire de la pédagogie. Le coût est de crédibilité, pas de sécurité | **Non**, mais c'est le moins cher à fermer de toute la liste — à condition de corriger **la source CSV**, pas le fichier engendré |
| **Q-214 b** — promotion d'une pièce jointe avant `commit`, sans réconciliation disque ↔ base | ⚠️ **toujours ouverte**, et elle **compose** avec Q-232/Q-233 : le magasin peut porter des fichiers qu'aucune ligne ne réclame, par deux causes distinctes et sans aucun balayeur | Le magasin grossit sans que rien ne le recense. C'est le motif de ma réserve **R5** | **Non**, mais R5 la couvre |
| **Q-214 c** — quota lu puis consommé dans **deux** transactions | ⚠️ **toujours ouverte** | Deux dépôts simultanés peuvent franchir ensemble un quota que chacun respectait. Le dépassement est borné par la taille d'une pièce | **Non** |
| **Q-214 d** — trois collections non bornées | ⚠️ **toujours ouverte** | Coût mémoire non borné sur trois chemins. Le contrôle S13 tient par ailleurs (corps borné, délais posés, pool borné) | **Non** |
| **Q-214 f** — **trois valeurs différentes** pour la borne de corps | ⚠️ **toujours ouverte, et je l'ai chiffrée** : `LimitRequestBody 27262976` (26 Mio) dans le vhost ; `SERVEUR_TAILLE_MAX_CORPS` à **26 214 400** o (25 Mio) côté Fastify ; `PJ_TAILLE_MAX` par défaut à 25 Mio. Mesuré à travers Apache : **28 Mio → 413** | La borne **extérieure agit**, c'est le point qui compte pour la sécurité. Le désordre coûte en **diagnostic** : un envoi entre 25 et 26 Mio est refusé par une couche différente selon le chemin, avec un message différent. C'est la famille du constat du 5ᵉ passage de S2 — *le défaut vit entre des fichiers dont aucun n'a tort seul* | **Non** |
| **Q-186** — `IPAddressDeny=any` doit recevoir le sous-réseau du relais SMTP | ⚠️ **toujours ouverte, et elle est ARMÉE sur cette machine.** `systemctl show -p IPAddressAllow cyber-grc` rend `127.0.0.0/8 ::1/128` ; `cyber-grc-notifications.timer` est **actif**. Le fichier d'unité porte l'avertissement en commentaire (lignes 103-104) | ⚠️ **Le symptôme MENT sur sa cause** : c'est le noyau qui refusera la connexion, pas le relais, et le journal dira « Relais injoignable ». L'exploitant cherchera le pare-feu du client pendant une heure | **Non** — L12 n'est pas dans le périmètre du pilote —, **mais l'instruction doit figurer dans la fiche de mise en service**, pas seulement dans un commentaire de fichier d'unité |

### 7 bis. Le point soulevé par l'orchestrateur : les orphelines antérieures à Q-230

> *« Les installations existantes portent des pièces orphelines antérieures au correctif de
> Q-230, et rien ne les réconcilie. »*

**Confirmé, et c'est plus large que l'énoncé.** `grep -rni "reconcili" backend/src` ne rend
rien ; `retirerDuMagasin` (`src/pieces/magasin.ts:228`) n'a que **trois** appelants, tous liés
à un geste ponctuel — la route DELETE, l'annulation d'un dépôt, la suppression d'une pièce.
**Aucun balayeur, aucune purge d'âge, aucun rapprochement disque ↔ base.**

Ce que cela coûte en exploitation, chiffré autant que je peux le faire :

- **sur la recette : rien.** `pieces_jointes` y compte **0 ligne**, et le magasin est vide.
  L'installation pilote partira donc propre, si elle part de là ;
- **sur toute installation antérieure au 05/09** : les orphelines existent, **personne ne sait
  combien**, et rien ne permet de le savoir depuis le produit — la liste d'une pièce passe par
  son porteur, qui n'existe plus. Un exploitant ne peut les découvrir qu'en comparant à la
  main le contenu du magasin aux `chemin_stockage` de la base ;
- **et Q-232 / Q-233 continuent d'en produire.** Fermer R1 arrête l'hémorragie ; il ne
  rattrape pas ce qui est déjà par terre. **Les deux réserves sont donc distinctes, et R5 ne
  se déduit pas de R4.**

**Ce que je recommande, et c'est peu de travail** : une commande d'exploitation qui liste les
lignes de `pieces_jointes` dont le porteur n'existe plus (le lien est polymorphe, mais
`entite_type` est une énumération close — la requête s'écrit en un `union all` de vingt-trois
`not exists`), et les fichiers du magasin qu'aucune ligne ne réclame. **Lister d'abord,
supprimer sur demande** : dans un produit qui garde trois ans de preuve d'audit, un balayeur
qui efface tout seul serait pire que le défaut.

### 7 ter. Les deux décisions qui appartiennent au client

Reconduites sans changement, parce qu'aucune session ne peut les prendre :

- **Q-153** — une politique de portée Groupe se valide-t-elle **une fois au Groupe**, ou
  **filiale par filiale** ? `approbations.filiale_id` est `not null`, donc c'est aujourd'hui
  la seconde. Les deux se défendent ; fermer l'autre demande une migration.
- **Risque P5** — la **validation formelle du découpage Groupe/Filiale par le RSSI groupe**
  n'a **aucune trace dans le dépôt**. Elle était attendue avant L1 ; L1 a été écrit sur
  l'arbitrage interne du `CONVENTIONS.md` §16.4. **À faire confirmer avant la mise en service
  pilote** : changer le niveau d'une table après coup se paie en migration de données.

---

## 8. Ce que je n'ai PAS pu éprouver

Je sépare **impossible ici** de **non tenté**, parce que six passages de porte ont reconduit
des réserves fausses faute de faire la différence.

### 8.1 Impossible sur cette machine

| Quoi | Pourquoi, exactement |
|---|---|
| **L'Active Directory de PRODUCTION du client** | Règle de prudence, pas limite technique : un banc qui éprouve le cas négatif **verrouille des comptes réels**. L'annuaire simulé `grc-ad` existe pour cela, il est modifiable, et je m'en suis servi. ⚠️ J'ai d'ailleurs pris soin de marteler `POST /api/connexion` sur un identifiant **inexistant** pour le contrôle S11, précisément pour ne verrouiller aucun compte de recette |
| **La sortie SMTP de la VM DU CLIENT** (lot L12) | Celle de *ce* VPS fonctionne — bannière `220 … Microsoft ESMTP MAIL Service ready` sur le port 587 — mais elle ne dit rien de la VM cliente, qui reste à vérifier (`PLAN_SERVEUR` §9). C'est le contexte du constat Q-186 |
| **Le test d'intrusion prévu en L15** | Hors périmètre de la grille, et la grille le dit elle-même. Elle ne protège pas non plus contre un `root` sur la VM ni contre le propriétaire de la base (`CONVENTIONS` §12) — limite que j'ai **mesurée** au §4.14 plutôt que de la reconduire, et la détection tient là où la prévention tombe |

### 8.2 Non tenté — et je le dis franchement

| Quoi | Pourquoi je ne l'ai pas fait |
|---|---|
| **`install.sh --desinstaller` joué pour de vrai** | Interdit sur cette machine — il détruirait la recette dont le client va se servir. Je l'ai éprouvé **par extraction du bloc**, comme le fait le banc : c'est ainsi que j'ai trouvé Q-235, en confrontant ce que l'installation pose à ce que le retrait défait. Cela ne vaut pas un retrait réel sur une VM jetable, et je ne prétends pas le contraire |
| **Une installation complète depuis zéro** (`install.sh` de bout en bout) | Même motif. Le 3ᵉ passage de la porte S2 l'a fait sur une machine neuve, et c'est ce qui avait sorti trois défauts. **Un pilote devrait le refaire sur la VM du client**, et je le recommande explicitement : les défauts d'installation ne se voient que sur une machine qui n'a jamais vu le produit |
| **Le parcours complet en anglais** (lot L10) | L'interface porte un dictionnaire de **419 clés** ; je n'ai parcouru les 33 écrans qu'en français. Une bascule de langue peut casser un rendu sans qu'aucun essai ne le voie — c'est exactement la classe de défaut que Q-236 décrit |
| **Les 26 modules métier sous mutation** | J'ai balayé les 496 lignes de HTML concaténé à la recherche d'une valeur non échappée, et je n'en ai pas trouvé. Ce n'est **pas** une preuve d'absence : c'est un balayage par motif, et Q-236 établit qu'aucun garde ne le fait à ma place |
| **La charge** — vingt filiales, plusieurs centaines d'utilisateurs | Aucune mesure de tenue en charge n'a été faite, par moi ni par personne. Le `PLAN_SERVEUR` ne l'exige pas avant la généralisation, mais **le pilote est le bon moment pour la faire** : c'est le seul moment où un chiffre décevant coûte encore peu |

---

## 9. En un paragraphe

Le produit est **prêt pour un pilote et pas pour vingt filiales**, et l'écart se referme en
moins d'une journée de travail. Le cœur est sain, et ce n'est pas une formule : le
cloisonnement rend 33/33 et s'effondre proprement quand on le sabote, le périmètre résiste à
onze sondes qui rendent le même corps à l'octet près, le verrouillage optimiste distingue cinq
situations en cinq messages, la chaîne des pièces jointes mord huit fois sur huit contre un
ClamAV réel, l'atomicité tient sur trois opérations composites, le journal dénonce sa propre
altération jusque sous le rôle propriétaire — sauf sur sa queue —, et trente-trois écrans
traversent un Apache réel avec un compte d'annuaire réel sans une violation de politique de
sécurité. Ce qui manque est d'une autre nature, et c'est la sixième fois que ce chantier le
rencontre sous le même déguisement : **quelque chose de PARTICULIER là où il fallait quelque
chose de GÉNÉRAL.** Q-230 avait appris au produit à retirer les pièces d'un enregistrement ; il
ne lui a pas appris à les retirer *des enregistrements*. Q-209 avait appris à tracer
`/api/donnees` ; il ne lui a pas appris à tracer *une extraction*. Et les cinq garde-fous
refaits au passage précédent reproduisent tous le même geste — ils ferment le cas qu'on leur a
montré, avec la maille qu'on leur a montrée. Le remède n'est donc pas de fermer douze
constats : c'est, pour chacune de ces deux familles, de **poser un seul endroit que tous les
chemins traversent**, et de le mordre en cassant cet endroit-là.

---

*Rapport rendu le 05/09/2026. Révision examinée : `0e48a92`. Aucun fichier du dépôt modifié
hors celui-ci ; les deux mutations d'épreuve sont restaurées et vérifiées par empreinte. La
recette est rendue à 2 filiales, 2 risques, 0 pièce jointe, 5 actions, 0 document.*
