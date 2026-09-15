# Porte S8 — 10ᵉ passage — RAPPORT DU PÉRIMÈTRE A

> **Base, schéma, cloisonnement, garde-fous.** Contrôles **S1, S2, S3, S4, S5, S14, S16**.

| | |
|---|---|
| **Auditeur** | Périmètre A — indépendant ; aucune des lignes examinées n'a été écrite par moi |
| **Date** | 14/09/2026 |
| **Révision examinée** | **`1646d21`** — relevée par `git rev-parse --short HEAD`, **arbre propre au début et à la fin** |
| **Machine** | `SRV-Infra`, Debian 13, PostgreSQL 17.11, recette en ligne |
| **Matière neuve** | migration `031`, ses cinq garde-fous, les correctifs **Q-312 → Q-334**, le renversement du registre RGPD au-delà du texte |

## ▶ VERDICT DU PÉRIMÈTRE : ❌ **REFUSÉ**

**0 bloquant · 3 majeurs · 3 mineurs · AUCUNE FUITE ENTRE FILIALES.**

Le cloisonnement est **intact et mesuré** : 110/110 sous `grc_app`, 52 tables sur 52 en
`force row level security`, 208 politiques, aucune percée. **Ce n'est pas le produit qui
refuse ce passage, c'est le DISPOSITIF** — et pour la cinquième porte de suite.

Les correctifs de la `031` **tiennent tous sur l'instance qu'ils visaient** : les neuf
mutations qui ne mordaient pas au 9ᵉ passage mordent toutes aujourd'hui. Mais **aucun n'a
été porté à la classe**, et la mesure est brutale :

> **Sur 473 mutations balayées, 269 ne mordent pas** — soit **57 %**. La porte de
> déploiement rend « aucune anomalie » pendant que 78 contraintes sur 142 sont
> **supprimées**, que les quatre déclencheurs qui rendent le journal d'audit inaltérable
> ont **disparu**, et que le rôle de LECTURE a reçu le droit d'écrire sur 49 tables sur 52.

---

## 1. Déclaration d'intégrité

| | |
|---|---|
| `git status --porcelain` **au début** | *(vide — arbre propre)* |
| `git status --porcelain` **à la fin** | *(vide — arbre propre)* |
| **Fichier écrit** | **un seul** : le présent rapport |
| **Où j'ai muté** | bases **jetables** `audit_s8xa` et `audit_s8xa_v` (`createdb` + `node db/migrate.mjs`, 31 migrations, 0 anomalie au départ), et transactions `begin … rollback` avec `savepoint` |
| **Sur la recette `cyber_grc`** | **lecture seule**, plus `install.sh --diagnostic` (ne modifie rien) et deux connexions HTTP légitimes |
| **Ce que j'ai semé, et retiré** | les deux bases jetables — **détruites** ; `pg_database` ne porte plus ni `audit_%` ni `grc_essai%`. Une base d'essai résiduelle de mon propre passage du banc (`grc_essai_non_regression_cps0_1_e0622f0a`, 13 Mo, 0 connexion) a été détruite aussi |
| **Ce qui subsiste, et c'est normal** | mes deux connexions au produit (`rssi.tls`, `rssi.groupe`) ont laissé leurs entrées dans le **journal d'audit**, qui est en ajout seul : 1 901 entrées au `--diagnostic`, **1 907** à la fin. Aucune filiale créée (**2 avant, 2 après** — règle Q-155). Les quatre déclencheurs du journal de la recette sont **présents** et `f_verifier_schema()` y rend **0 anomalie** |
| **Comptes AD** | aucun cas négatif joué ; mots de passe corrects, une tentative chacun |
| **Ce que je n'ai pas fait** | `install.sh --maj`, `preparer_base_dev.sh` sous aucune forme, aucune écriture sur la recette |

---

## 2. Tableau de verdict

| # | Contrôle | Verdict | Preuve chiffrée |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ✅ **passé** | `verifier_cloisonnement.sql` **sous `grc_app`** → **110 contrôles, 110 réussis, 0 échoué**. **52/52** tables en RLS **activée ET forcée**, **208** politiques, **0** table sans `force`. `grc_app` : `bypassrls=false`, `superuser=false`, **0 table possédée**, `CREATE on schema public = false`. Les 4 mutations RLS mordent — y compris la politique **élargie à `true`** (R4) |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** | **2 écrivains** seulement (`db/pool.ts:373`, `auth/transaction.ts:56`), tous deux **paramétrés** (`$1..$4`) ; `resoudre()` est **d'arité zéro** dans les deux implémentations. Un seul chemin fait descendre une valeur de requête vers `grc.filiale_id` (`cycle/index.ts:1357`), **borné par trois contrôles indépendants**. **Sonde discriminante** sur la recette : `rssi.tls` (périmètre = `[TLS]`) → bascule vers `DEU` = **403 `hors_perimetre`**, `filiale_active` **inchangée en base** ; **témoin positif** : bascule vers `TLS` = **200**. `rssi.groupe` reçoit bien `[DEU, TLS]` |
| **S3** | Journal d'audit inaltérable et complet | 🟡 **passé avec réserve** | À cette révision les trois interdits **mordent** : `UPDATE`, `DELETE` et `TRUNCATE` sur `journal_audit` sont refusés (`f_interdit_modification`). Mais **leur présence n'est garantie par rien** (constat **A-1**), et **une troncature totale reste indétectable** : journal vidé → `f_journal_audit_verifier()` rend **RIEN**, c'est-à-dire « sain » (Q-243 **confirmé ouvert**) |
| **S4** | Verrouillage optimiste effectif | ✅ **passé** | Le client **ne peut pas fixer `version`** : `insert … version=999` → stocké **1** ; `update … version=500` → **2**. Écriture concurrente mesurée : écrivain 1 citant la version courante → **1 ligne**, écrivain 2 citant la version **périmée** → **0 ligne affectée**, et sa valeur **n'écrase pas** (titre et version inchangés). La mise à jour perdue est empêchée |
| **S5** | Aucune injection SQL | ✅ **passé** | **130** sites d'exécution SQL ; **aucune valeur** n'est interpolée dans un texte SQL. Les 24 interpolations sont des **noms d'objets**, issus de `pg_catalog`, de constantes gelées ou d'un type TypeScript clos. Les 2 seules occurrences de `'${` dans `src/` sont **hors SQL** (neutralisation de formule CSV, en-tête `Content-Disposition`) — vérifié ligne à ligne. **Injection mesurée** sur `f_domaine_accepte()`, le seul `%s` du dépôt alimenté par un paramètre de fonction et exécutable par `grc_app` : `'text); create table injecte_par_audit(x int); --'` → **refusée par `to_regtype()`**, table créée = **0**. Réserve de discipline : constat **A-5** |
| **S14** | Intégrité des opérations composites | ✅ **passé** | Cascade mesurée : suppression du porteur → **0 pièce restante ET 1 mise en file de purge** (atomique et complète) ; après `rollback` → **1 pièce, 0 en file** ; après un échec **en milieu** d'opération → **1 doc, 1 pièce, 0 en file**. **Aucun état intermédiaire observable** |
| **S16** | **Les garde-fous sont branchés** | ❌ **EN ÉCHEC** | **269 mutations sur 473 balayées ne mordent pas (57 %)** : 133/142 contraintes vidées par `… or true`, **78/142 supprimées franchement**, 9/137 déclencheurs supprimés — dont **les quatre du journal** et le **verrou d'irréversibilité des approbations** —, 49/52 tables ouvertes en écriture au rôle de lecture. Constats **A-1, A-2, A-3** |

---

## 3. Les constats

### 🟠 A-1 — MAJEUR — Les quatre déclencheurs qui rendent le journal inaltérable, et le verrou d'irréversibilité des approbations, se SUPPRIMENT sous zéro anomalie

**Classe « perte de données » : OUI** — perte de la *preuve*, qui est ce que ce produit vend.

`f_verifier_schema()` porte **35 garde-fous**. Aucun ne remarque la disparition de
`trg_journal_audit_interdit_maj`, `…_interdit_suppr`, `…_interdit_vidage`,
`trg_journal_audit_chainage`, ni de `trg_approbations_verrou`.

**Mesuré, de bout en bout, sur base jetable :**

```
=== 1. AVANT mutation : les interdits mordent-ils ? ===
ERROR:  Table journal_audit en ajout seul : opération UPDATE refusée.
ERROR:  Table journal_audit en ajout seul : opération DELETE refusée.
ERROR:  Table journal_audit en ajout seul : opération TRUNCATE refusée.
=== 2. On SUPPRIME les trois interdits + le chaînage ===
 ANOMALIES f_verifier_schema() = 0
=== 3. Le journal est-il encore inaltérable ? ===
 UPDATE : 1 ligne(s) RÉÉCRITE(S)
 DELETE : il reste 0 ligne(s) de journal
```

Et la chaîne complète, jusqu'au **chemin de déploiement réel** :

```
--- 2. SABOTAGE : retirer les 3 interdits + ouvrir le privilège à grc_app ---
 PORTE DE DÉPLOIEMENT : 0 anomalie(s)
--- 3. migrate.mjs (le chemin de déploiement réel) ---
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.
code de retour migrate.mjs = 0
--- 4. LE COMPTE APPLICATIF grc_app réécrit-il le journal ? ---
 apres delete : il reste 0 entree(s)          ← vérifié sous le propriétaire : 0
```

Même résultat sur le **verrou d'approbation** — que le `CLAUDE.md` désigne comme
*« l'irréversibilité n'est pas réécrite en TypeScript : elle vit dans la base »* :

```
=== 1. AVANT : ERROR: Étape d'approbation déjà tranchée (approuve) : la décision est irréversible.
=== 2. On supprime le verrou ===   ANOMALIES = 0
=== 3. decision REECRITE en : refuse par quelqu un d autre
       apres delete : il reste 0 approbation(s)
```

**Pourquoi c'est le motif de la quatrième porte, retourné une fois de plus.** Le
`CONVENTIONS.md` **§39.7**, écrit le 11/09 précisément pour fermer cette classe, dit :
*« une barrière nommée se garde aussi nommément »*. Il a été appliqué aux **cinq pièces de
la `030`** (`f_verifier_barriere_traitement`, écrite le jour même) — et **pas à la barrière
nommée la plus ancienne et la plus importante du produit**, celle de `001_socle.sql` et
`004_rls.sql`. Un `grep` sur `db/migrations/` ne trouve ces trois déclencheurs que dans les
deux fichiers **qui les créent**.

⚠️ **Et l'inversion exacte de Q-281.** Le garde écrit pour fermer Q-281 mesure `tgtype`,
donc l'**armement**. Mesuré :

| Mutation | Verdict |
|---|---|
| **P4** — les déclencheurs **DÉSARMÉS** (`disable trigger`) | ✅ **mord (3 anomalies)** |
| **P3** — les déclencheurs **SUPPRIMÉS** (`drop trigger`) | 🛑 **NE MORD PAS (0)** |

*Le garde voit le désarmement et non la disparition.* Qui lit le garde n'a qu'à supprimer
plutôt que désarmer.

**Ce qui reste, et ce qui ne reste pas.** Le chaînage par empreinte attrape une
**réécriture** (`empreinte_invalide`) et une suppression **au milieu** (`numero_manquant`).
Il n'attrape **ni la troncature de queue, ni le vidage complet** : journal vidé →
`f_journal_audit_verifier()` rend **RIEN**. Et `install.sh --diagnostic` **exclut
explicitement** ce cas de son contrôle : `where anomalie <> 'chaine_tronquee'`
(`deploy/install.sh:1084`). **Aucun des quatre mécanismes** — porte de schéma,
`migrate.mjs`, chaîne, diagnostic — ne voit un journal effacé.

**Pourquoi le banc ne l'a jamais vu.** `test/base/socle.test.mjs` emploie ces déclencheurs
comme un **obstacle à désarmer** (`alter table journal_audit disable trigger …`) pour
éprouver la chaîne. **Aucun essai n'affirme jamais qu'ils EXISTENT.** Banc `test/base`
mesuré : **311 essais, 311 passés** — vert de part en part pendant que la propriété est
absente de la porte.

> **Je ne le classe pas bloquant** — la pose exige les droits du **propriétaire** (`grc_app`
> ne peut pas supprimer un déclencheur), et le chaînage rattrape *a posteriori* la
> réécriture. C'est la même forme que Q-281, classé majeur. **Mais un lecteur peut
> légitimement le lire comme bloquant** : la raison d'être écrite de cette porte, au fronton
> de `migrate.mjs`, est exactement *« une base sabotée passait au vert »*, et le vidage
> complet du registre qui sert de preuve en audit pendant trois ans n'est vu par rien.

---

### 🟠 A-2 — MAJEUR — 133 contraintes `check` sur 142 se vident par « … or true » sous zéro anomalie ; 78 sur 142 sont invisibles même à la SUPPRESSION FRANCHE

La migration `028` a posé `f_contrainte_accepte()`, qui **évalue le prédicat réel** — le bon
remède. La `031` l'a confirmé. Mais son sujet est une **liste écrite à la main de sept
contraintes** (`f_temoins_de_contraintes()`), sur les **142** que porte le schéma.

**Balayage exhaustif** (chaque contrainte reposée `check ((<prédicat d'origine>) or true)`,
nom et littéraux conservés, dans une transaction annulée) :

| Balayage | Ne mordent pas | Mordent |
|---|---|---|
| **142** contraintes vidées par `… or true` | **133** | 9 |
| **142** contraintes **supprimées franchement** | **78** | 64 |

**Le contraste qui nomme la cause**, sur une seule table :

```
 anomalies apres vidage antivirus   (ck_pieces_jointes_en_vigueur)         = 0
 anomalies apres vidage integrite   (ck_pieces_jointes_en_vigueur_integre) = 1
```

Deux barrières **sur la même table**. La seconde a reçu un témoin à la `028` ; la première —
*celle qui empêche une pièce jointe **infectée** ou en **quarantaine** de faire foi*, livrée
avec la chaîne antimalware de L6 — n'en a jamais eu. Prédicat évalué sur la ligne interdite
après vidage : **`ACCEPTEE`**.

**Conséquence réellement écrite en base** (et non seulement évaluée) :

```
=== CONSEQUENCE : contrainte videe -> valeur interdite reellement ecrite ? ===
ERROR:  new row for relation "sessions" violates check constraint "ck_sessions_perimetre"
   (le refus AVANT mutation)
   anomalies apres vidage = 0
   perimetre REELLEMENT ecrit : tout_le_groupe_et_plus
```

Le vocabulaire **du périmètre de session** — `filiale` / `multi` / `groupe` — accepte
désormais n'importe quoi, et la porte de déploiement ne dit rien. `ck_sessions_perimetre`
figure aussi parmi les **78 invisibles à la suppression franche**.

**Parmi ces 78, nommément** : `sessions.ck_sessions_perimetre`,
`sessions.ck_sessions_expiration`, `sessions.ck_sessions_revocation`,
`utilisateurs.ck_utilisateurs_secours`, `utilisateurs.ck_utilisateurs_identifiant_reserve`
(l'usurpation du compte `systeme`), `pieces_jointes.ck_pieces_jointes_quarantaine`,
`pieces_jointes.ck_pieces_jointes_etat`, les quatre de `approbations`, les cinq de
`filiales`, `journal_audit.ck_journal_audit_numero`.

⚠️ **Et une phrase du `CONVENTIONS.md` §39.1 est mesurément fausse.** Elle est écrite *« à
décharge »*, et c'est elle qui justifie de ne pas élargir le dispositif :

> *« les mutations **franches** — contrainte supprimée, colonne rendue nullable, type changé,
> déclencheur déplacé — étaient toutes attrapées. »*

**Contrainte supprimée : 78 sur 142 ne sont attrapées par rien.** L'affirmation est vraie des
sept contraintes que la règle avait sous les yeux, et **fausse du schéma**. C'est, mot pour
mot, la faute que le §39.3 nomme : *« écrire qu'une liste échoue bruyamment ne la fait pas
échouer bruyamment »* — commise dans le paragraphe qui la formule.

**Le remède ne peut pas être sept témoins de plus** : c'est un balayage qui part du
**catalogue** — toute contrainte `check` du schéma doit être soit **éprouvée** par un témoin
des deux sens, soit **déclarée** comme n'ayant pas à l'être, motif écrit, et son absence de
déclaration doit rougir.

---

### 🟠 A-3 — MAJEUR — 49 tables sur 52 acceptent que le rôle de LECTURE reçoive le droit d'écrire, sous zéro anomalie

`f_verifier_privileges()` protège exactement : le droit `CREATE` sur `public`, **une**
colonne de secret (`utilisateurs.mot_de_passe_hash`) et **deux** registres techniques
(`migrations_schema`, `controles_schema`) — plus `colonnes_personnelles`, ajoutée par la
`028`. Toutes sont des **listes écrites à la main** :

```sql
v_secrets   constant text[] := array['utilisateurs.mot_de_passe_hash'];
v_registres constant text[] := array['migrations_schema', 'controles_schema'];
```

**Balayage** (`grant insert, update, delete on <table> to grc_lecture`, sur les 52 tables) :

| Ne mordent pas | Mordent |
|---|---|
| **49** | 3 (`colonnes_personnelles`, `controles_schema`, `migrations_schema`) |

Les 49 comprennent **`sessions`, `session_filiales`, `session_domaines`** — les tables qui
**produisent la décision d'autorisation**, et dont la condition E1 du §22 fait tout un
sujet —, ainsi que `journal_audit`, `profils`, `profil_domaines`, `groupes_ad`, `filiales`
et `utilisateurs`.

Sur le journal, la mesure est directe :

```
🛑 NE MORD PAS (0) | P1 grant update,delete on journal_audit to grc_app
🛑 NE MORD PAS (0) | P2 grant truncate on journal_audit to grc_app
```

⚠️ **Les trois couches du journal sont donc ouvertes par le même trou.** Les politiques RLS
du journal ne bornent ni la modification ni la suppression — mesuré :
`pol_journal_audit_maj (w) using true with check true`, `pol_journal_audit_suppression (d)
using true`. La garantie d'ajout seul repose **entièrement** sur les déclencheurs (A-1) et
sur les privilèges (A-3), et **la porte ne garde ni les uns ni les autres**.

C'est la leçon que la `028` avait elle-même écrite en commentaire — *« une migration a
AFFIRMÉ une propriété au lieu de la POSER »* — fermée pour `colonnes_personnelles` et
laissée ouverte pour les 49 autres.

---

### 🔵 A-4 — MINEUR — Le registre de l'article 30 déclare que treize types ne peuvent porter AUCUNE donnée personnelle ; c'est faux pour la famille des dates et des nombres

Le §39.9 a élargi le balayage au-delà du texte, et **il tient remarquablement bien** : sur
14 mutations d'ajout de colonne, **13 mordent** — `jsonb`, `inet`, `uuid`, `text[]`, `xml`,
`bytea`, `varchar` sont tous réclamés au registre, et un domaine textuel neuf non rangé
rougit. **206 décisions** au registre, chiffre conforme à ce qu'annonce la documentation.

Mais le balayage se **re-resserre** aussitôt sur une liste écrite à la main :

```sql
-- Les types dont AUCUNE valeur ne peut être un nom, une adresse, un identifiant de personne.
v_sans_personne constant text[] := array[
    'bool', 'date', 'int2', 'int4', 'int8', 'numeric', 'float4', 'float8',
    'timestamptz', 'timestamp', 'time', 'timetz', 'interval'
];
```

**Mesuré** : `alter table documents add column montant numeric(12,2)` → **0 anomalie**.

L'affirmation est fausse comme énoncé général : une **date de naissance** est l'exemple
canonique de la donnée personnelle au sens du RGPD, et un **NIR**, un numéro de téléphone ou
un numéro de compte tiennent dans un `int8` ou un `numeric`. **192 colonnes** du schéma
portent ces types.

**Aucune instance aujourd'hui** — j'ai balayé les 192 colonnes à la recherche d'un nom
évoquant une personne et n'ai trouvé que des booléens de classification et deux horodatages.
C'est donc un **risque latent**, et c'est pourquoi je le classe mineur. Mais le registre est
la pièce qu'on présente à un DPO, et la purge *« ne sait chercher que dans du texte »* : le
jour où une colonne `date_naissance date` est ajoutée, **rien ne la réclamera**, et le §39.9
promet l'inverse. La décision mérite d'être reformulée en *« types que la purge ne sait pas
traiter »*, avec le motif écrit — comme le §39.9 le fait déjà, très bien, pour les documents
figés.

---

### 🔵 A-5 — MINEUR — Deux helpers de citation SQL, non partagés, et quatre sites qui n'en emploient aucun ; aucun garde mécanique

Le contrôle S5 **passe** : aucune valeur n'atteint un texte SQL. Mais la propriété tient par
**relecture**, et non par une barrière.

Deux helpers coexistent, de sémantiques différentes, **aucun exporté** :

```ts
// src/entites/index.ts:426 — VALIDE puis cite ; rejette ce qui ne rentre pas
function ident(nom: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nom)) { throw incoherent(…); }
  return `"${nom}"`;
}
// src/cycle/index.ts:623 — ÉCHAPPE sans valider ; accepte tout
function guillemeter(identifiant: string): string {
  return `"${identifiant.replace(/"/gu, '""')}"`;
}
```

**Quatre sites citent à la main**, sans passer par l'un ni l'autre : `entites/index.ts:2016`
(un `update` construit **dans la couche d'accès elle-même, à côté de `ident()`**),
`api/journal.ts:335`, `pieces/depot.ts:97`, `filiales/index.ts:274`. Les quatre sont sûrs
**par leurs sources** (constantes `as const` gelées), mais `` `"${c}"` `` n'échappe rien : le
jour où l'un de ces tableaux cesse d'être littéral, la citation devient cosmétique.

**Aucun contrôle mécanique ne garde cette discipline** : `test/depot/` porte des gardes sur
les expressions rationnelles, l'échappement HTML et les imports commités — **rien sur la
construction du SQL**. C'est exactement le motif du commentaire d'`ident()`, qui se donne
pour raison d'être de *« transformer un futur écart de discipline en échec immédiat plutôt
qu'en injection »* — et qui ne le tient pas hors de son module.

À consigner **avec la fonction** : `f_domaine_accepte(p_domaine text, …)` est le **seul
`%s` du dépôt alimenté par un paramètre**, et elle porte `grant execute … to grc_app`. Elle
est sûre aujourd'hui — `to_regtype()` refuse avant le `format`, mesuré ci-dessus — mais si
un lot futur lui donnait un appelant côté `src/`, `to_regtype` deviendrait l'unique barrière.

---

### 🔵 A-6 — MINEUR — Les neuf correctifs de la `031` sont mordus sur leur instance ; aucun ne l'est sur sa classe

Ce n'est pas un défaut de plus : c'est la **forme commune** de A-1, A-2 et A-3, et elle
mérite d'être nommée, parce que c'est la septième fois que le chantier la rencontre.

**Les neuf mutations qui ne mordaient pas au 9ᵉ passage mordent toutes aujourd'hui :**

```
✅ mord (4) | M42 domaine type_entite vidé par 'or true'
✅ mord (3) | M43 domaine id_metier vidé par 'or true'
✅ mord (1) | M17 déclencheur trg_documents_traitement_portee supprimé
✅ mord (1) | M20 ck_documents_traitement_groupe supprimée
✅ mord (1) | M21 ck_documents_traitement_filiale supprimée
✅ mord (1) | M22 fk_documents_traitement_coherence supprimée
✅ mord (2) | M23 fk_documents_traitement_portee supprimée
✅ mord (1) | M15 ck_documents_confidentialite reposée NOT VALID
✅ mord (1) | M37 défaut 'interne' de documents.confidentialite retiré
```

**Et chacun s'arrête au bord de sa classe** :

| Le correctif de la `031` | Ce qu'il ferme | Ce qu'il laisse ouvert |
|---|---|---|
| `f_domaine_accepte()` **enfin appelée** (Q-312) | les **6** domaines, tous témoignés | rien — la classe est complète ici, c'est le seul cas |
| témoins `not valid` (A-8 du 9ᵉ) | les **7** contraintes témoignées | `not valid` sur les **135 autres** : mesuré, N6 et N7 → **0 anomalie** |
| `f_verifier_barriere_traitement` (Q-313, §39.7) | les **5** pièces de la `030` | les barrières **du journal** et **des approbations** (A-1) |
| `revoke` sur `colonnes_personnelles` (`028`) | **1** table | les **49** autres (A-3) |
| renversement au-delà du texte (§39.9) | `jsonb`, `inet`, et 5 types exotiques de plus | la famille `date`/`numeric`/`int8` (A-4) |

⚠️ Le garde `not valid` est le plus net : son balayage ne parcourt **pas** `pg_constraint`,
il parcourt **les noms de sa propre liste de témoins** —

```sql
select array_agg(distinct v ->> 'c') into v_tables from jsonb_array_elements(v_temoins) v;
foreach v_nom in array v_tables loop … where k.conname = v_nom and not k.convalidated
```

— c'est-à-dire le renversement du §39.3 **écrit à l'envers** : la liste est le sujet du
balayage au lieu d'en être l'exception.

---

## 4. Ce qui tient — avec ses chiffres

C'est aussi une mesure, et ce passage en donne beaucoup.

- **Cloisonnement : 110/110 sous `grc_app`**, 0 échec, transaction annulée en sortie. **Aucune
  fuite entre filiales**, sur aucune sonde.
- **RLS : 52 tables sur 52** en `row security` **activée ET forcée**, **208 politiques**, 35
  tables portant `filiale_id`. Les quatre mutations RLS mordent, **y compris l'élargissement
  d'une politique à `true`** — c'est une évaluation du sens, pas une reconnaissance de mot.
- **`grc_app` est correctement démuni** : pas de `bypassrls`, pas de `superuser`, **0 table
  possédée**, **pas de `CREATE` sur `public`**. L'escalade par `SECURITY DEFINER` est fermée
  à la source.
- **Le point d'appel unique est bien conçu** : `f_verifier_schema()` **découvre** ses
  contrôles dans le catalogue au lieu de les énumérer, refuse bruyamment d'exécuter une
  fonction qui porte le nom sans les propriétés, et signale **cinq cas de manque** distincts
  (registre absent, registre vide, contrôle disparu, contrôle re-signé, aucun contrôle
  découvert). **35 garde-fous consignés, 31 migrations, 52 tables, 0 anomalie.**
- **Les cinq garde-fous neufs de la `031` mordent tous, et sur la classe qu'ils visent** :
  table neuve sans `filiale_id` → 8 anomalies ; colonne `<x>_id` en `text` nu → 2 ; domaine
  textuel neuf non rangé → 1 ; colonne `jsonb` neuve → 1 ; colonne `inet` neuve → 1. **Et le
  témoin inverse reste muet** : la même colonne écrite en `id_metier` → **0 anomalie**. Un
  garde qui crie sur la forme juste serait désarmé au premier agacement ; celui-ci ne crie pas.
- **Les déclencheurs : 128 sur 137** font rougir leur suppression. Le dispositif d'armement
  de Q-281 tient (désarmement → 3 anomalies).
- **`f_contrainte_accepte()` est juste** là où elle est appelée, et le refus d'évaluer un
  prédicat référençant une fonction **non native** (§39.8, constat A-4 du 9ᵉ passage) est
  effectivement posé et **bruyant** (`contrainte_non_eprouvable`).
- **Banc `test/base` : 311 essais, 311 passés**, 28,0 s en concurrence 1.
- **`install.sh --diagnostic` : 14 conformes, 1 réserve, 0 bloquant** ; publication **81
  fichiers servis identiques au dépôt** ; certificat valide jusqu'au 05/10/2027.
- **Le produit échoue fermé** : une transaction qui lit une table cloisonnée sans avoir
  déclaré `grc.filiales` est **refusée**, en nommant la cause et le §.

---

## 5. Ce que je n'ai PAS pu mesurer — dit explicitement

*« Non rejoué » ne vaut ni « passé » ni « en échec ».*

1. **La couverture des vingt actions du journal** (moitié « complet » du contrôle S3) — elle
   relève du **périmètre B**. Je n'ai mesuré que l'inaltérabilité.
2. **La sonde S2 par `/api/donnees`** (paramètres `?filiale=`, en-têtes `X-Filiale`) est
   **non discriminante sur cette recette** : le témoin *sans sonde* rend lui aussi **0 ligne**,
   la filiale `TLS` ne portant aucune donnée. Je la déclare plutôt que de la compter — *un
   essai qui ne fait jamais décider la règle ne la couvre pas* (leçon Q-210). La preuve de S2
   que je retiens est la **sonde discriminante** de bascule de filiale (403 / 200), qui fait
   décider la règle dans les deux sens.
3. **Le banc complet** (≈ 1 930 essais) n'a pas été rejoué : j'ai joué `test/base`
   (311/311). Le compte global de cette révision n'est donc pas mesuré par moi.
4. **`install.sh --maj`** n'a pas été joué (un auditeur travaille en parallèle) : je n'ai pas
   vérifié que le déploiement complet refuse une base sabotée. J'ai mesuré le maillon qui
   compte — **`migrate.mjs` rend le code 0** sur une base dont le journal n'est plus en ajout
   seul.
5. **Le comportement de `f_verifier_schema()` sous `grc_app`** — je l'ai joué sous le
   propriétaire, qui est le chemin de `migrate.mjs` et d'`install.sh`. Un écart éventuel
   entre les deux identités n'est pas mesuré.
6. **A-1 et A-3 ne sont pas une escalade depuis `grc_app` seul** : poser la charge exige
   `drop trigger` ou `grant`, donc les droits du **propriétaire**. Le modèle de menace couvert
   est la **dérive** — migration fautive, restauration ratée, sabotage interne —, qui est
   précisément celui que la porte de schéma déclare traiter, pas l'attaquant distant.

---

## 6. Ce que ce passage propose de retenir, au-delà des constats

1. **Un garde qui ÉPROUVE bien un sujet choisi à la main ne vaut que pour ce sujet.** Le §39
   a remplacé « reconnaître un mot » par « évaluer un prédicat », et c'était juste. Il n'a pas
   remplacé « une liste de sept » par « le catalogue », et c'est là que le trou est resté :
   **7 contraintes éprouvées sur 142**, **3 tables gardées sur 52**, **5 pièces nommées sur
   toutes les barrières nommées du produit**. Le §39.3 donne déjà la règle ; elle n'a pas
   été appliquée aux gardes du §39.1 eux-mêmes.
2. **Mesurer l'armement n'est pas mesurer la présence.** Q-281 a appris à regarder `tgtype` ;
   personne n'a regardé `exists`. Les deux questions sont distinctes et il faut les deux —
   c'est le §39.7 dans l'autre sens.
3. **Une phrase écrite « à décharge » doit être mesurée comme un constat.** Le §39.1 affirme
   que les mutations franches sont toutes attrapées, et cette phrase sert à justifier de ne
   pas aller plus loin. Elle est fausse pour 78 contraintes sur 142. *Une affirmation
   rassurante non mesurée coûte plus cher qu'un constat ouvert.*

---

*Rapport du périmètre A — 10ᵉ passage de la porte S8 — révision `1646d21`, arbre propre au
début et à la fin. Toutes les mutations ont été jouées sur base jetable ou en transaction
annulée ; les bases jetables sont détruites. Aucune filiale créée. Aucun secret n'est
reproduit ici.*
