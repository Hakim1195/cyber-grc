# Rapport de la porte de sécurité S1 — second passage (re-jeu intégral)

> Deuxième revue adversariale indépendante de la vague 1 (lot L1), après les correctifs
> apportés à la suite du refus du 31 août 2026. La porte est **rejouée intégralement**
> (`docs/PLAN_EXECUTION.md` §1) : les quinze contrôles de la grille §4, tous, et pas
> seulement les correctifs.
>
> **L'auteur de ce rapport n'a écrit aucune ligne du code examiné, et n'est pas non plus
> l'auteur du premier rapport d'audit.** Travail en lecture seule ; aucun fichier du code
> livré n'a été modifié. Tous les essais ont été rejoués depuis zéro sur une base dédiée
> (`grc_audit2`, PostgreSQL 16.13), montée à partir des quatre migrations, avec le jeu de
> privilèges de la production reproduit à la main. Les scripts d'attaque et les copies
> mutées du dépôt vivent hors du dépôt.
>
> Date : 31 août 2026 · Périmètre : `backend/db/**`, `backend/src/**`, `backend/test/**`,
> `backend/deploy/**` · Rapport précédent :
> [`RAPPORT_S1.md`](RAPPORT_S1.md) · Arbitrages : `backend/db/CONVENTIONS.md` §17.

---

## 1. Verdict

> ## Porte REFUSÉE
>
> Un constat bloquant, **neuf** : la base ne vérifie jamais que la filiale d'**écriture**
> appartient au périmètre de **lecture**, si bien qu'une session peut créer des lignes — y
> compris **une entrée de journal d'audit chaînée et scellée, attribuée à un utilisateur
> d'une autre filiale** — dans une filiale qu'elle ne lit même pas. Le contrôle existe, mais
> seulement dans le TypeScript (`pool.ts:validerPerimetre`) ; la base, qui est censée être le
> filet quand le code se trompe (`PLAN_SERVEUR` §1.9), laisse passer.

Ce verdict ne dit rien de mauvais du travail de correction. **Il faut le dire nettement :
les correctifs de la vague 1-bis sont bons.** Le bloquant B-1 est fermé, et je l'ai vérifié
par mon propre balayage du catalogue, écrit sans lire le leur ; M-1 et M-3 sont fermés et
prouvés ; m-2, m-3, m-4 et m-5 aussi. Le banc d'essai, que j'ai attaqué par huit mutations
tirées au hasard dans le périmètre corrigé, **tombe huit fois sur huit** — dont deux fois par
un balayage systématique du catalogue, qui est exactement ce qui manquait au premier passage.
La démonstration de cloisonnement est passée de 28 à 59 contrôles.

Le refus tient à ce qu'un second regard trouve ailleurs. Les trois constats majeurs neufs et
le bloquant ont **la même forme que B-1** : une propriété de cloisonnement affirmée dans un
commentaire, appliquée à un endroit, oubliée à un autre, et non couverte par le banc d'essai
ni par la démonstration. Aucun n'est difficile à corriger : le bloquant tient en une
condition dans une fonction — et j'ai vérifié que cette condition **ne casse aucun des 210
tests existants**, ce qui prouve à la fois qu'elle est sûre et que rien ne l'éprouve
aujourd'hui.

**Décompte** : 1 bloquant · 3 majeurs · 4 mineurs · 5 observations. Tous neufs.

---

## 2. Le sort des constats du premier passage

Pour chacun : le statut, et **la preuve que j'ai rejouée moi-même**. Je n'ai repris aucune
sortie du premier rapport ni aucun résultat annoncé par les correcteurs.

| # | Constat | Statut |
|---|---|---|
| **B-1** | Sept clés étrangères traversant la frontière de filiale | **corrigé et vérifié** |
| **M-1** | `search_path` non figé, masquage par `pg_temp` | **corrigé et vérifié** |
| **M-2** | Substrat d'authentification non protégé | **corrigé partiellement + report écrit** — mais la barrière n'en est pas une (§4, N-4 et remarque ci-dessous) |
| **M-3** | Drapeau Groupe : appropriation et destruction du socle | **corrigé et vérifié** |
| **m-1** | Oracle d'existence par les messages de contrainte | **non corrigé** — conforme au report annoncé (S12 / L2) |
| **m-2** | Virgule admise par le domaine `id_metier` | **corrigé et vérifié** |
| **m-3** | Garde-fou de couverture aveugle au prédicat non trivial | **corrigé et vérifié**, avec sa limite écrite honnêtement |
| **m-4** | Journal écrit sur le périmètre de lecture | **corrigé et vérifié** |
| **m-5** | Bornes de la reprise payées après `JSON.parse` | **corrigé et mesuré** |
| **m-6** | Écarts au périmètre d'écriture des agents | **traité au niveau du plan** ; les commits restent transverses |

### B-1 — corrigé et vérifié

**Ce que j'ai fait.** J'ai refait le balayage moi-même, par requête sur `pg_constraint`,
sans lire le leur : classer chaque table (`filiale_id` absent / nullable / non nul), puis
lister **toutes** les clés étrangères dont l'enfant et le parent portent tous deux un
`filiale_id`, et marquer celles qui ne portent pas `filiale_id` dans leurs colonnes.

```
        enfant         |      colonnes_enfant       |      parent      | colonnes_parent | suppression |     forme
-----------------------+----------------------------+------------------+-----------------+-------------+----------------
 actions               | {evaluation_id,filiale_id} | evaluations      | {id,filiale_id} | cascade     | COMPOSITE
 actions               | {exigence_id,filiale_id}   | exigences        | {id,filiale_id} | cascade     | COMPOSITE
 actions               | {incident_id,filiale_id}   | incidents        | {id,filiale_id} | cascade     | COMPOSITE
 actions               | {risque_id,filiale_id}     | risques          | {id,filiale_id} | cascade     | COMPOSITE
 document_referentiels | {document_id,filiale_id}   | documents        | {id,filiale_id} | cascade     | COMPOSITE
 evaluation_mesures    | {evaluation_id,filiale_id} | evaluations      | {id,filiale_id} | cascade     | COMPOSITE
 exigences             | {client_id,filiale_id}     | clients          | {id,filiale_id} | cascade     | COMPOSITE
 incidents             | {risque_id,filiale_id}     | risques          | {id,filiale_id} | set null    | COMPOSITE
 tests_pra             | {scenario_id,filiale_id}   | scenarios_pra    | {id,filiale_id} | cascade     | COMPOSITE
 traitement_mesures    | {traitement_id,filiale_id} | traitements      | {id,filiale_id} | cascade     | COMPOSITE
 actions               | {mesure_id}                | mesure_catalogue | {id}            | restrict    | *** SIMPLE ***
 document_referentiels | {document_id}              | documents        | {id}            | cascade     | *** SIMPLE ***
 evaluation_mesures    | {mesure_id}                | mesure_catalogue | {id}            | restrict    | *** SIMPLE ***
 mesure_mise_en_oeuvre | {mesure_id}                | mesure_catalogue | {id}            | restrict    | *** SIMPLE ***
 traitement_mesures    | {mesure_id}                | mesure_catalogue | {id}            | restrict    | *** SIMPLE ***
```

Les sept clés du constat sont composites. Les cinq restantes qui apparaissent « simples »
sont **légitimes et expliquées** : quatre visent `mesure_catalogue`, table **mixte** dont le
`filiale_id` est nullable — une clé composite y est impossible (`MATCH SIMPLE` la neutralise
dès que la colonne est nulle) ; elles sont tenues par le déclencheur
`f_coherence_mesure_catalogue()` et par `on delete restrict`. La cinquième double la clé
composite de `document_referentiels` pour couvrir le cas de portée Groupe.

**Les vingt-deux tentatives d'écriture transfrontière**, jouées sous `grc_app`, périmètre
strictement `FIL-A` :

```
### 01 actions.risque_id -> risque de B          ERROR: viole fk_actions_risque
### 02 actions.exigence_id -> exigence de B      ERROR: viole fk_actions_exigence
### 03 actions.incident_id -> incident de B      ERROR: viole fk_actions_incident
### 04 actions.evaluation_id -> evaluation de B  ERROR: viole fk_actions_evaluation
### 05 exigences.client_id -> client de B        ERROR: viole fk_exigences_client
### 06 incidents.risque_id -> risque de B        ERROR: viole fk_incidents_risque
### 07 tests_pra.scenario_id -> scenario de B    ERROR: viole fk_tests_pra_scenario
### 08 actions.mesure_id -> mesure LOCALE de B   ERROR: Mesure MESURE-LOC-B inaccessible à la filiale FIL-A
### 09 mesure_mise_en_oeuvre -> mesure LOCALE B  ERROR: idem
### 10 evaluation_mesures -> mesure LOCALE de B  ERROR: idem
### 11 traitement_mesures -> mesure LOCALE de B  ERROR: idem
### 12 document_referentiels (fil A) -> doc B    ERROR: viole fk_document_referentiels_coherence
### 13 document_referentiels (fil NULL) -> doc B ERROR: new row violates row-level security policy
### 14 evaluation_mesures -> evaluation de B     ERROR: viole fk_evaluation_mesures_evaluation
### 15 traitement_mesures -> traitement de B     ERROR: viole fk_traitement_mesures_traitement
### 16 actif_risques -> risque de B              ERROR: new row violates row-level security policy
### 17 risque_exigences -> exigence de B         ERROR: new row violates row-level security policy
### 18 incident_actifs -> actif de B             ERROR: new row violates row-level security policy
### 20 processus_actifs -> actif de B            ERROR: new row violates row-level security policy
### 22 referentiels_actifs pour B                ERROR: new row violates row-level security policy
```

**Détail au crédit des correcteurs, qui n'était pas acquis** : les messages de clé
étrangère ne divulguent pas la valeur cherchée. `DETAIL: Key is not present in table
"risques".` — sans le couple `(RISK-B1, FIL-A)` que PostgreSQL affiche d'ordinaire, parce
que `force row level security` rend la ligne invisible à l'appelant. La correction ferme
donc aussi, incidemment, un demi-oracle.

**Et le filet a été posé** : le banc d'essai porte désormais un **balayage** du catalogue
(« LE BALAYAGE : aucune clé étrangère entre deux tables cloisonnées n'est simple »), et
`verifier_cloisonnement.sql` un contrôle par clé. C'est ce qui manquait, et c'est ce qui
empêche la récidive au prochain ajout d'entité. Vérifié par mutation (§3, S1).

### M-1 — corrigé et vérifié

**Les dix-huit fonctions du schéma figent leur chemin de recherche, `pg_temp` nommé en
dernier.** Aucune exception :

```
            proname             | prosecdef |                reglages                 |       prop
--------------------------------+-----------+-----------------------------------------+------------------
 f_administration_groupe        | f         | search_path=pg_catalog, public, pg_temp | grc_proprietaire
 f_approbations_verrou_decision | f         | search_path=pg_catalog, public, pg_temp | grc_proprietaire
 f_coherence_mesure_catalogue   | f         | search_path=pg_catalog, public, pg_temp | grc_proprietaire
 …  (18 lignes, toutes prosecdef = f, toutes avec pg_temp en queue)
```

**Les attaques rejouées, avec `TEMPORARY` réaccordé de force** pour que la seule défense
éprouvée soit le `search_path` (et non l'absence de privilège) :

```
### TEMOIN — sans masquage, le garde-fou voit-il l'anomalie posée exprès sur history ?
 history | force_absente | la table n'a pas « force row level security »        <-- oui

### T3b — avec pg_class ET pg_policy masqués par des tables temporaires
 history | force_absente | la table n'a pas « force row level security »        <-- toujours oui

### T1b — chaînage : journal_audit masqué, table temporaire portant numero = 999999
 numero |    prec    |           resume
      1 |            | entree posee apres masquage
      2 | ff7c15fc4c | entree legitime 1
      3 | 42ee55fa47 | entree legitime 2
      4 | eba98e340d | apres masquage                <-- numérotation et chaînage RÉELS

### T2 — mesure_catalogue masquée : le déclencheur de cohérence est-il désarmé ?
ERROR:  Mesure MESURE-LOC-B inaccessible à la filiale FIL-A                      <-- non

### T6 — masquage d'une FONCTION dans pg_temp (pg_temp.f_filiales_lecture)
 risques_vus = 1                                                                 <-- ignorée

### T7 — vérification du chaînage après toutes ces tentatives
 (0 rows)                                                                        <-- chaîne intacte
```

**Le garde-fou de migration existe et il est porteur.** J'ai retiré `pg_temp` du
`search_path` d'**une seule** fonction — le piège exact que le §17.2 décrit — et la migration
refuse de s'appliquer :

```
NOTICE:  Couverture RLS vérifiée : aucune anomalie, 188 politiques sur 47 tables.
ERROR:  Chemin de recherche non figé — 1 fonction(s) :
  - f_coherence_mesure_catalogue() : pg_temp_non_relegue (search_path figé mais sans pg_temp
    explicite (search_path=pg_catalog, public) : le schéma temporaire reste consulté EN
    PREMIER, le réglage ne ferme rien)
```

**Le privilège `TEMPORARY` est bien retiré**, et pas seulement en production :

```
 current_user | temp | creer_public
 grc_app      | f    | f
```

Les trois endroits qui créent une base appliquent la même ACL. `deploy/install.sh` fait le
`revoke temporary` **nommé** puis le vérifie ; `db/dev/preparer_base_dev.sh` s'appuie sur le
`revoke all` puis **vérifie** ; `test/aide/base.mjs` s'appuie sur le `revoke all` et c'est un
**test** (`test/base/rls.test.mjs`) qui vérifie. Le §17.2 écrit « explicite et vérifié aux
trois endroits » ; à la lettre, deux des trois sont implicites — la propriété, elle, est
vérifiée aux trois. Nuance de rédaction, pas d'écart de fond.

### M-2 — corrigé partiellement, avec report écrit — mais la barrière n'en est pas une

**Ce qui a été fait, et qui est juste.** Les sept tables ont été scindées en deux groupes.
Quatre — `utilisateurs`, `profils`, `profil_domaines`, `groupes_ad` — passent à une écriture
conditionnée par `f_administration_groupe()`, lecture laissée ouverte. Trois — `sessions`,
`session_filiales`, `session_domaines` — restent ouvertes, **avec une décision écrite et
datée** (`CONVENTIONS` §17.4), un raisonnement de circularité que je confirme, et — détail
qui compte — **un test qui épingle le report** et qui tombera le jour où L3 le lèvera.
C'est exactement la forme de report que le premier rapport demandait.

**Ce que je dois dire quand même.** `f_administration_groupe()` lit
`current_setting('grc.administration_groupe')`. C'est un réglage de session ordinaire, que
le rôle applicatif **pose lui-même** :

```
### A1 — sans le drapeau : écriture dans utilisateurs refusée ?
ERROR:  new row violates row-level security policy for table "utilisateurs"
### A2 — le rôle applicatif peut-il POSER le drapeau lui-même ?
set local grc.administration_groupe = 'oui';    SET
 drapeau = oui
### A3 — avec le drapeau, la même écriture passe-t-elle ?
INSERT 0 1
```

La correction est donc **réelle contre la classe « oubli de filtre applicatif »** — un code
qui ne pose pas le drapeau n'écrit pas, et c'est précisément la défense en profondeur que
le `PLAN_SERVEUR` §1.9 réclame. Elle est **nulle contre la classe « injection SQL dans le
rôle applicatif »**, qui est celle que le §17.4 nomme lui-même deux paragraphes plus bas.
Le §17.4 écrit « Corrigé en V1-bis : **écriture réservée à l'administration Groupe** » sans
dire de quoi est faite cette réserve. Ce n'est pas un privilège, c'est une déclaration que
l'attaquant fait sur lui-même. À écrire tel quel dans le document normatif : c'est la seule
correction que je demande sur M-2 (voir aussi N-4, qui en fait un défaut à part entière).

### M-3 — corrigé et vérifié

Les deux mécanismes annoncés au §17.6 existent et mordent. **Portée figée** — les cinq
tables mixtes portent le déclencheur ; l'appropriation et la promotion sont refusées dans
les deux sens :

```
### M3a — la filiale A, drapeau posé, modifie le contenu du socle Groupe
UPDATE 1                                                       <-- opération d'administration, admise
### M3b — APPROPRIATION : basculer la ligne Groupe dans la filiale A
ERROR:  Table mesure_catalogue : la portée d'une ligne ne change pas (Groupe -> FIL-A).
### M3c — EXPULSION : basculer une ligne locale A vers le Groupe
ERROR:  Table mesure_catalogue : la portée d'une ligne ne change pas (FIL-A -> Groupe).
### M3d — même essai sur documents / personnes / parametres
ERROR:  Table documents  : la portée d'une ligne ne change pas (Groupe -> FIL-A).
ERROR:  Table personnes  : la portée d'une ligne ne change pas (Groupe -> FIL-A).
ERROR:  Table parametres : la portée d'une ligne ne change pas (Groupe -> FIL-A).
```

Le déclencheur va au-delà de ce que le §17.6 promet : il refuse aussi le passage
`FIL-A -> FIL-B` d'une ligne mixte locale. C'est plus strict, et c'est bien.

**Le socle ne s'évapore plus.** Les quatre références à `mesure_catalogue` sont en
`restrict`, et la mise en œuvre de l'Allemagne survit à la tentative de Toulouse :

```
### M3e — chaque filiale met en oeuvre la mesure du socle    INSERT 0 1 (A) ; INSERT 0 1 (B)
### M3f — la filiale A, drapeau posé, supprime le socle Groupe
ERROR:  update or delete on table "mesure_catalogue" violates foreign key constraint
        "fk_mesure_mise_en_oeuvre_mesure" on table "mesure_mise_en_oeuvre"
```

**Ce que le `restrict` rend impossible, et qu'il ne fallait pas casser.** Je l'ai cherché,
c'est la première chose qu'un changement d'action de suppression menace. Réponse : **rien de
légitime n'est cassé**, et j'ai vérifié les deux chemins qui comptent.

*Une filiale peut-elle bloquer une opération d'une autre ?* Non. Pour bloquer la suppression
d'une mesure **locale** de A, il faudrait que B la référence ; le déclencheur de cohérence
l'en empêche, y compris depuis un périmètre de lecture Groupe (le prédicat exige
`m.filiale_id = new.filiale_id`, pas seulement la visibilité). Vérifié : cas 08 à 11
ci-dessus, refusés.

*Le retrait d'un contrôle du socle Groupe reste-t-il possible ?* Oui, et en **une seule
transaction**, comme le §17.6 le promet — à condition de basculer la filiale active :

```
### D3 — retrait Groupe en UNE transaction (périmètre FIL-A,FIL-B)
set_config('grc.filiale_id','FIL-A'); delete from mesure_mise_en_oeuvre …  DELETE 1
set_config('grc.filiale_id','FIL-B'); delete from mesure_mise_en_oeuvre …  DELETE 1
delete from mesure_catalogue where id='MESURE-SOCLE';                      DELETE 1
```

Deux réserves, que je classe en mineur et en observation plus bas : cette manœuvre exige de
changer `grc.filiale_id` en cours de transaction, ce qui est précisément le geste que le
bloquant N-1 rend dangereux ; et l'alternative annoncée à la suppression — « il s'archive » —
**n'existe pas dans le schéma** (N-6).

### m-1 — non corrigé, conformément au report annoncé

Reproduit tel quel. Le report vers S12 / L2 est le bon endroit ; je le confirme.

```
### O1 — sonder l'existence de RISK-B1 depuis la filiale A
ERROR:  duplicate key value violates unique constraint "pk_risques"
### O2 — même sonde sur un identifiant inexistant
INSERT 0 1
### O6 — sonder l'existence d'une FILIALE par son code
ERROR:  duplicate key value violates unique constraint "uq_filiales_code"
```

Deux nuances **favorables** que le premier rapport n'avait pas relevées : la voie « clé
étrangère » ne divulgue plus la valeur (voir B-1), et le message du déclencheur de cohérence
est délibérément indistinct entre « mesure inconnue » et « mesure locale d'une autre
filiale » — vérifié, les deux sondes rendent le même texte. Reste la voie « clé en double »,
qui rend un booléen. Le format d'identifiant `<PRÉFIXE>-<millisecondes>-<aléa 0..999>`
(`random()`, non cryptographique) garde l'espace de recherche étroit ; c'est un arbitrage
figé et justifié, à porter au modèle de menace plutôt qu'à rouvrir.

### m-2 — corrigé et vérifié

Le domaine refuse la virgule et les espaces de bord, et **reste volontairement permissif par
ailleurs** — ce qui est le bon arbitrage, la reprise d'exports anciens en dépend :

```
       and value !~ ','
       and value = btrim(value, E' \t\r\n'));
```

Mutation 6 (§3) : réouvrir la virgule fait tomber le test dédié.

### m-3 — corrigé et vérifié, avec sa limite écrite

Le garde-fou ne compare plus au littéral `true` : il exige que le prédicat **mentionne** les
fonctions de périmètre. J'ai essayé quatre évasions :

```
### GF0 — état sain                                                       (0 rows)
### GF1 — prédicat « filiale_id is not null » (le piège de m-3)
 risques | lecture_non_cloisonnee | une politique de lecture ne consulte pas le périmètre…
### GF2 — prédicat « f_filiales_lecture() is not null » (mention sans usage)
 (0 rows)                                                                 <-- passe encore
### GF3 — force row level security retirée
 risques | force_absente | la table n'a pas « force row level security »
### GF4 — politique de LECTURE mentionnant f_administration_groupe
 risques | drapeau_administration_en_lecture | un réglage de session élargirait la LECTURE
```

GF2 est la limite résiduelle, et elle est **écrite dans le commentaire de la fonction, mot
pour mot, avec l'exemple exact** : « il ne peut pas attraper une politique qui NOMME la bonne
fonction en s'en servant mal, par exemple `f_filiales_lecture() is not null` … Un garde-fou
auquel on prête plus de portée qu'il n'en a endort la vigilance au lieu de l'entretenir. »
C'est la règle du §17.5 appliquée à elle-même. Rien à redire.

### m-4 — corrigé et vérifié

La politique d'ajout du journal consulte désormais la **filiale active** :

```
 pol_journal_audit_ajout | CASE WHEN (filiale_id IS NULL) THEN true
                           ELSE ((filiale_id)::text = f_filiale_ecriture()) END
```

Et l'essai correspondant, depuis un périmètre Groupe :

```
### S3.4 — périmètre FIL-A,FIL-B ; filiale active FIL-A ; écrire une trace chez B
ERROR:  new row violates row-level security policy for table "journal_audit"
```

Mutation 7 (§3) : rétablir l'ancien prédicat fait tomber deux tests. *Le commentaire de
`004_rls.sql` décrivant la dérogation du journal, lui, n'a pas suivi : il dit encore « une
entrée ne peut être attribuée qu'à une filiale du périmètre de la session ». Le code est
plus strict que son commentaire — sans danger, mais à remettre en phase.*

### m-5 — corrigé et mesuré

Le comptage se fait maintenant **avant** l'allocation (`preAnalyserJson`, balayage lexical à
mémoire constante). J'ai refait la mesure du premier rapport, à l'identique :

```
### D1 — 59 Mio, tableau de 30 M d'entiers (admis par le plafond, refusé par le budget)
  statut=invalide code=entree-trop-complexe
  temps=68 ms     heap 4->63 Mio    rss 46->111 Mio
### D2 — 64 Mio + 1 caractère
  statut=invalide code=entree-trop-volumineuse       temps=0 ms
### D3 — imbrication 100 000 niveaux
  statut=invalide code=enveloppe-inconnue            temps=28 ms
### D4 — 59 Mio en une seule chaîne JSON (budget NON dépassé, cas légitime)
  statut=invalide code=charge-non-reconnue           temps=116 ms   rss 119->237 Mio
```

**4 642 ms → 68 ms ; 611 Mio → 111 Mio de RSS.** La correction fait ce qu'elle annonce. Le
cas D4 (un fichier volumineux mais peu ramifié) reste borné par le plafond de taille, et en
pratique par la limite de corps HTTP (26 Mio), plus basse que le plafond de reprise (64 Mio).
L'amplificateur systemd (`StartLimitBurst=5` / `StartLimitIntervalSec=300`) est inchangé,
mais sa condition de déclenchement — la tuerie par `MemoryMax` — n'est plus atteignable par
ce chemin.

### m-6 — traité au niveau du plan ; les commits restent transverses

`docs/PLAN_EXECUTION.md` §2 a été amendé : `backend/src/reprise/**` est attribué au rôle
REPRISE, `backend/test/aide/**` à OUTILLAGE, et la lacune est nommée (« Un rôle absent de ce
tableau est une lacune, pas une permission »). C'est la bonne réponse.

Le fait demeure que le commit de correction `eef2806` touche quinze fichiers relevant de
cinq rôles, `backend/db/CONVENTIONS.md` et `docs/PLAN_EXECUTION.md` — les deux réservés à
l'orchestrateur — compris. Je le note pour la discipline, pas pour l'effet : le contenu est
juste. **Ce n'est pas un constat de sécurité.**

---

## 3. La grille §4 — les quinze contrôles, rejoués

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | **échec** (N-1) |
| S2 | Le périmètre ne vient jamais du navigateur | réserve (N-4) |
| S3 | Journal d'audit inaltérable et complet | réserve |
| S4 | Verrouillage optimiste effectif | moitié base : passé ; moitié API : sans objet (L2) |
| S5 | Aucune injection SQL | passé |
| S6 | Droits vérifiés côté serveur à chaque requête | sans objet (L3) |
| S7 | Le droit d'export est distinct de la lecture | sans objet (L3) |
| S8 | Secrets | passé |
| S9 | Chaîne de contrôle des pièces jointes | sans objet (L6) |
| S10 | Sortie et en-têtes | partiel — frontal posé, session sans objet (L3) |
| S11 | Limitation du rythme et verrouillage | sans objet (L3) |
| S12 | Les erreurs ne renseignent pas l'attaquant | réserve |
| S13 | Dénis de service applicatifs | passé, avec une réserve d'exploitation |
| S14 | Intégrité des opérations composites | réserve (N-3) |
| S15 | Dépendances | passé |

**Mise en place commune à tous les essais.** Base neuve `grc_audit2`, ACL de production
reproduite à la main (`revoke all on database … from public` ; `connect` nommé ;
`revoke temporary` sur `grc_app` et `grc_lecture`), quatre migrations appliquées par
`db/migrate.mjs` :

```
Migrations Cyber GRC — base « grc_audit2 » sur 127.0.0.1:5432, compte propriétaire « grc_proprietaire »
  001_socle.sql ............... appliquée en 109 ms
  002_metier_noyau.sql ........ appliquée en  77 ms
  003_metier_operations.sql ... appliquée en 109 ms
  004_rls.sql ................. appliquée en  42 ms
Schéma à jour : 4 migration(s) appliquée(s) sur 4.        exit=0
```

Deux filiales semées (`FIL-A` Toulouse, `FIL-B` Allemagne), avec risques, clients, exigences,
incidents, évaluations, scénarios PRA, actifs, traitements, documents, personnes, paramètres,
un socle Groupe et une mesure locale de chaque côté.

---

### S1 — Cloisonnement par filiale non contournable · ÉCHEC

#### Ce qui tient, et que j'ai éprouvé

**Lecture.** Une session `FIL-A` ne voit rien de `FIL-B`, sur toutes les familles :

```
### N1 — AUCUN réglage de périmètre : lecture d'une table cloisonnée
ERROR:  Périmètre non positionné : la transaction lit une table cloisonnée sans avoir
        déclaré grc.filiales.                                          (SQLSTATE GRC04)
### N2 — liaison sans filiale_id : même refus
### N3 — table mixte : même refus
### N6 — écriture sans filiale active
ERROR:  Périmètre non positionné : écriture dans une table cloisonnée sans filiale active.
```

Le comportement par défaut est **fail-closed et bruyant** : ni silence, ni fuite. C'est la
bonne conception.

**Rôles.** `grc_app` : ni `SUPERUSER`, ni `BYPASSRLS`, ni `CREATEDB`, ni `CREATEROLE`, ni
`REPLICATION`, sans `TEMPORARY`, sans `CREATE` sur `public`, propriétaire d'aucun objet.
Privilèges de table exactement conformes au `CONVENTIONS` §14 — seules deux tables dérogent,
dans le bon sens :

```
      relname      |    grc_app
-------------------+---------------
 journal_audit     | INSERT,SELECT
 migrations_schema | SELECT
```

**Couverture.** 47 tables, toutes en `enable` **et** `force row level security`, 188
politiques ; `f_verifier_couverture_rls()` ne renvoie aucune ligne, et `force RLS`
s'applique **aussi au propriétaire** — vérifié par accident dès mon semis, qui a été refusé
tant que je n'avais pas posé le périmètre.

**Écriture.** Une ligne ne peut pas changer de filiale, ni en famille 1 (les deux moitiés de
la politique de mise à jour visent la même filiale active), ni en famille 2 (déclencheur) :

```
### P1 — périmètre Groupe : déplacer une ligne de A vers B (famille 1)
ERROR:  new row violates row-level security policy for table "risques"
### P2 — périmètre Groupe : déplacer un document local A vers B (famille 2)
ERROR:  Table documents : la portée d'une ligne ne change pas (FIL-A -> FIL-B).
### P4 — périmètre Groupe : écrire chez B alors que la filiale ACTIVE est A
ERROR:  new row violates row-level security policy for table "risques"
```

**Liaisons.** Les politiques d'écriture des six liaisons sans `filiale_id` exigent
`f_filiale_ecriture()` — la filiale **active**, pas le périmètre — **des deux côtés**. Un
périmètre Groupe ne peut donc pas fabriquer de liaison transfrontière. C'est le point que je
suis allé chercher en premier, et il tient.

**La démonstration** `verifier_cloisonnement.sql`, jouée sur base neuve : **59 contrôles,
59 réussis, 0 échoué** (28 au premier passage).

#### Ce qui ne tient pas

Deux constats neufs, développés au §4 : **N-1** (bloquant, la filiale d'écriture n'est pas
vérifiée contre le périmètre de lecture) et **N-2** (majeur, la table `filiales` est
réinscriptible sans condition par n'importe quelle filiale).

Les deux partagent la structure de B-1 : la propriété est affirmée dans un commentaire du
code, appliquée à un endroit, oubliée à un autre, et **le garde-fou automatique ne peut pas
la voir** — `f_verifier_couverture_rls()` ne balaie que les tables portant un `filiale_id` et
les six liaisons ; `filiales` n'en porte pas, elle est hors du champ du balayage par
construction.

---

### S2 — Le périmètre ne vient jamais du navigateur · réserve

**Chemins de code.** Un seul endroit du serveur alimente les réglages, et par le protocole
étendu :

```
$ grep -rn "set_config" backend/src --include=*.ts
src/db/pool.ts:232:    `select set_config('grc.utilisateur', $1, true),
src/db/pool.ts:233:            set_config('grc.filiale_id',  $2, true),
src/db/pool.ts:234:            set_config('grc.filiales',    $3, true)`,
```

`avecTransaction` exige un `PerimetreSession` obligatoire, refuse un périmètre vide, refuse
une écriture sans filiale active, et refuse une filiale active hors du périmètre lisible
(`validerPerimetre`). `db/migrate.mjs` ne pose aucun réglage `grc.*`.

**Adresse du client.** `deploy/apache/cyber-grc.conf:111-116` efface `X-Forwarded-For`,
`X-Forwarded-Host`, `X-Forwarded-Server`, `X-Real-IP` et `Forwarded` **avant** que mod_proxy
n'ajoute la vraie adresse. `SERVEUR_PROXY_DE_CONFIANCE` vaut `127.0.0.1` par défaut, et la
valeur `oui` — qui croirait tous les en-têtes — déclenche un avertissement au démarrage.
C'est le bon motif.

**La réserve.** `appliquerPerimetre` pose **trois** réglages et n'en réinitialise aucun
quatrième. `grc.administration_groupe` n'est jamais écrit, jamais effacé — et le pool
`pg` ne fait pas de `DISCARD` à la libération d'une connexion. Un réglage posé en portée
session survit donc au recyclage. Constat **N-4**, démontré sur un vrai pool.

---

### S3 — Journal d'audit inaltérable et complet · réserve

**Les quatre couches, éprouvées une par une, sous `grc_app` :**

```
update journal_audit set resume='efface' where numero=1;        ERROR: permission denied
update journal_audit set resume='efface' where numero=999999;   ERROR: permission denied
delete from journal_audit where numero=1;                       ERROR: permission denied
truncate journal_audit;                                         ERROR: permission denied
set local session_replication_role = replica;   ERROR: permission denied to set parameter
```

Les trois déclencheurs du journal sont en mode `ALWAYS` (`tgenabled = 'A'`), le seul qui
résiste à `session_replication_role`. `grc_app` ne possède aucun objet, donc ne peut pas les
désarmer.

**Forge d'entrée.** Le client fournit `numero=1`, `horodatage='1999-01-01'`, `empreinte` et
`empreinte_precedente` : tout est écrasé.

```
 numero | horodatage |   emp    |   prec   | resume
      5 | 2026-08-31 | 50315424 | 69c65fd3 | forge      <-- numéro, date et empreintes réels
```

**Chaînage.** `f_journal_audit_verifier()` ne renvoie rien après toutes mes tentatives, y
compris après les attaques `pg_temp` de M-1.

**Ce qui vaut la réserve — et l'exposition est plus large qu'annoncée.**

La lecture du journal n'est pas cloisonnée. La dérogation est documentée, son argument
technique est exact (le chaînage exige de voir la chaîne entière) et je le confirme. Mais je
mesure l'exposition, parce que le chiffre compte :

```
### J — ce que la filiale de Toulouse lit du journal de l'Allemagne
 numero | filiale_id |    action    |          resume                    | valeurs_apres
      5 | FIL-B      | modification | Revision du risque majeur allemand |
   {"nom": "Fuite de donnees client BMW", "gravite": 4, "commentaire": "tres confidentiel"}
```

Et, ce que le premier rapport n'avait pas relevé : **le journal se lit sans aucun périmètre.**
Toutes les autres tables cloisonnées échouent en `GRC04` quand `grc.filiales` n'est pas posé ;
`journal_audit` rend tout :

```
### N4 — AUCUN réglage de périmètre
 entrees | avec_charge_utile
       5 |                 1
```

L'exposition n'est donc pas « une filiale voit les autres », c'est « **toute transaction du
rôle applicatif, même sans périmètre résolu, lit l'intégralité des données de toutes les
filiales** » via `valeurs_avant` / `valeurs_apres`. La correction esquissée dans la migration
(fonctions de chaînage en `security definer`, politique resserrée) reste la bonne ; elle doit
être un **livrable ferme de L5**.

Deux constats s'y ajoutent : **N-1** permet de fabriquer une entrée dans le registre d'une
autre filiale — ce que le commentaire de la migration déclare impossible — et **N-5** montre
que l'acteur inscrit dans l'entrée est fourni par le client.

**Complétude** : la contrainte `ck_journal_audit_action` liste les vingt actions attendues,
`export` et `import` compris. Rien ne les émet (L5) : **sans objet à ce stade**, à établir à
la porte S3.

---

### S4 — Verrouillage optimiste effectif · moitié base passée, moitié API sans objet

```
### S4.1 — le client peut-il fixer version lui-même ?
select id, version from risques where id='RISK-A1';            -->  version 1
update risques set nom='v2', version=999 where id='RISK-A1';   -->  UPDATE 1
select id, version, modifie_par …                              -->  version 2, alice   (999 ignoré)

### S4.2 — cree_le / cree_par réinscriptibles ?
update risques set cree_par='usurpateur', cree_le='1999-01-01' …
select id, cree_par, cree_le::date, version …                  -->  alice | 2026-08-31 | 3  (gelés)

### S4.3 — deux écritures concurrentes sur la MÊME version
update risques set nom='ecriture 1' where id='RISK-A1' and version = 3;   -->  UPDATE 1
update risques set nom='ecriture 2' where id='RISK-A1' and version = 3;   -->  UPDATE 0
```

La traduction du zéro ligne en `GRC03` appartient au lot L2 : **sans objet**.

**À reporter à la porte S2** : `f_maj_tracabilite()` incrémente `version` quelle que soit
l'origine de la mise à jour. Avec B-1 corrigé, une action d'intégrité référentielle ne
traverse plus la frontière de filiale ; mais N-1 rouvre le même effet par un autre chemin,
et O-2 du premier rapport (un `UPDATE 0` refusé par la politique, indiscernable d'un conflit
de version) reste entier.

---

### S5 — Aucune injection SQL · passé

```
$ grep -rnE 'query\(`|query\(.*\$\{|execute\(' backend/src --include=*.ts
(aucun résultat)
```

**Migrations** : tout le SQL dynamique passe par `format` avec `%I` / `%L`, et les valeurs
viennent de tableaux constants déclarés dans le même bloc `do $$` (`v_ouvertes`,
`v_configuration`, `v_liaisons`, `v_derogations`) ou de `current_user`. Aucune entrée
utilisateur n'atteint un `execute`.

**`migrate.mjs`** : les trois requêtes portant des données sont paramétrées (`lignes 433`,
`451`, `645`) ; le contenu de la migration est envoyé tel quel, ce qui est l'objet même de
l'outil. Le nom de base est validé par liste blanche avant tout usage.

**Scripts shell** : `litteral()` et `valider_identifiant()` dans `install.sh`, doublement du
guillemet simple et entrée standard (jamais `argv`) pour les mots de passe dans
`preparer_base_dev.sh`. Rien à redire.

**Ce que j'ai essayé pour le mettre en défaut** : j'ai cherché un `execute` dont le format
proviendrait d'un `select` sur une table (donc d'une donnée écrivable par `grc_app`) ; il n'y
en a pas. J'ai cherché une interpolation dans `test/aide/base.mjs` (`create database ${nom}`)
— le nom est engendré localement et passé par `nomJetableOuEchec`.

---

### S6 — Droits vérifiés côté serveur · sans objet (L3)

Le serveur n'expose que `/api/sante`. Le contrôle sera jouable à la porte S3.

Le substrat de l'autorisation, lui, est figé maintenant : voir M-2 ci-dessus et **N-2**
(`filiales`, la table qui définit la frontière de cloisonnement, reste réinscriptible sans
condition alors que quatre de ses voisines ont été fermées).

---

### S7 — Le droit d'export est distinct de la lecture · sans objet (L3)

Le schéma le prévoit (`sessions.peut_exporter`, `groupes_ad.accorde_export`, action `export`
dans `ck_journal_audit_action`). Rien ne l'applique ni ne le journalise encore.

---

### S8 — Secrets · passé

- **Dépôt et historique** : aucun `.env`, `.pem`, `.key`, `id_rsa` n'a jamais été suivi
  (`git log --all --diff-filter=A`). `.gitignore` couvre `backend/.env*` avec exception
  explicite pour `.env.example`, qui ne porte que des clés vides.
- **Seul mot de passe en dur** : `MOT_DE_PASSE="dev"` dans `preparer_base_dev.sh:41`, assumé,
  encadré par un garde-fou qui refuse `NODE_ENV=production`.
- **`ps`** : les deux scripts passent `PGPASSWORD` par l'environnement du seul processus
  fils, jamais par la ligne de commande.
- **Sorties** : j'ai lancé `migrate.mjs` avec `BASE_MOT_DE_PASSE_PROPRIETAIRE='motdepasse-tres-secret'`
  et cherché la chaîne dans toute la sortie — aucune occurrence.
- **`resumerConfiguration()`** est une liste blanche de champs ; c'est le seul objet
  journalisé au démarrage, et il ne contient aucun secret. `lecteur.secret()` n'inclut jamais
  la valeur dans un message d'erreur.
- **Journaux** : `redact` sur `authorization`, `cookie`, `set-cookie`.
- **Vidage de cœur** : `LimitCORE=0`, `CoredumpFilter=0x00`.

---

### S9 — Chaîne de contrôle des pièces jointes · sans objet (L6)

Seules les métadonnées existent. Aucun des huit contrôles du `PLAN_SERVEUR` §1.6 n'est
implémenté ; ClamAV est absent de la machine. Deux préparatifs corrects sont en place :
`NoExecPaths=/var/lib/cyber-grc` et `Require all denied` sur le magasin.

Une observation de conception à porter à L6 : `pieces_jointes` référence son entité par un
couple `(entite_type, entite_id)` **sans clé étrangère ni contrôle de cohérence**. Une
filiale peut donc déclarer une pièce jointe rattachée à un objet d'une autre (N-9).

---

### S10 — Sortie et en-têtes · partiel

Posé et correct côté frontal : CSP stricte sans `unsafe-eval` ni `unsafe-inline` sur les
scripts (`style-src 'unsafe-inline'` reste la concession de l'application actuelle),
`nosniff`, `X-Frame-Options: DENY`, HSTS un an avec `includeSubDomains`, `Referrer-Policy`,
COOP/CORP, `Permissions-Policy`, `ServerSignature Off`, TLS 1.2/1.3 seulement.
L'API pose elle-même `nosniff` et `cache-control: no-store`, en défense en profondeur.

Il n'existe pas encore de cookie de session : `HttpOnly` / `SameSite` / `Secure` sont **sans
objet**, à établir à la porte S3.

*Observation* : `setNotFoundHandler` renvoie `Aucune ressource ne répond à ${method} ${url}`
— une réflexion de l'entrée du client dans le corps de réponse. Sérialisée en JSON et servie
avec `nosniff`, elle n'est pas exploitable ; à ne pas reproduire dans un futur gabarit HTML.

---

### S11 — Limitation du rythme et verrouillage · sans objet (L3)

Aucun point d'authentification. Deux garde-fous de plateforme existent et compteront :
`StartLimitIntervalSec=300` / `StartLimitBurst=5`, `TasksMax=256`, `LimitNOFILE=8192`.

---

### S12 — Les erreurs ne renseignent pas l'attaquant · réserve

**Ce qui est bon.** Au-delà de 500, la réponse est
`{erreur:'erreur_interne', message:"…", reference:<uuid>}` — aucune pile, aucun nom d'objet
de base ; le détail part au journal technique. `/api/sante` est délibérément avare :
`verifierBase()` place le message d'erreur dans un champ commenté « réservé au journal,
jamais renvoyé au client », et j'ai vérifié dans `serveur.ts` que la réponse ne porte que
`{ok, latence_ms}`.

**Les réserves, inchangées.**

1. Le chemin `< 500` renvoie `erreur.message` tel quel. Aujourd'hui il ne porte que des
   messages de validation Fastify ; dès L2, un `GRC04` ou le `23514` de
   `f_coherence_mesure_catalogue` — dont le texte **cite l'identifiant de la mesure et la
   filiale** — sortirait tel quel. À traiter par une table de traduction SQLSTATE, pas par un
   passe-plat.
2. m-1 : les messages de contrainte restent un oracle d'existence inter-filiales.

À porter au crédit des auteurs : les messages du déclencheur de cohérence sont écrits pour
**ne pas** distinguer « mesure inconnue » de « mesure locale d'une autre filiale », et je l'ai
vérifié sur les deux sondes. C'est le bon réflexe.

---

### S13 — Dénis de service applicatifs · passé, avec une réserve d'exploitation

| Borne | Où | Valeur |
|---|---|---|
| Taille de corps HTTP | `serveur.ts` via `SERVEUR_TAILLE_MAX_CORPS` | 26 Mio (max admis 1 Gio) |
| Délai de requête SQL | `pool.ts`, `options` libpq — donc sur **toute** requête | 15 s |
| Transaction inactive | `pool.ts` | borné |
| Attente de verrou | `pool.ts` | 5 s |
| Pool | `pool.ts`, min 1 / max 200 | 10 |
| Plafond de reprise | `reprise/index.ts` | 64 Mio, 2 000 000 nœuds, profondeur 16 |
| Mémoire du service | unité systemd | `MemoryHigh=1G`, `MemoryMax=2G` |
| Processus / descripteurs | unité systemd | `TasksMax=256`, `LimitNOFILE=8192` |

m-5 est fermé et mesuré (voir §2). Poser les délais de garde **à la connexion** reste le bon
choix.

**Réserve.** Le plafond de reprise (64 Mio) est supérieur à la limite de corps HTTP par
défaut (26 Mio) : c'est la plus basse qui gouverne, donc sans danger, mais les deux valeurs
gagneraient à être liées comme le sont déjà `PIECES_JOINTES_TAILLE_MAX` et
`SERVEUR_TAILLE_MAX_CORPS` (une vérification croisée existe pour ce dernier couple, pas pour
celui-ci). Et `SERVEUR_TAILLE_MAX_CORPS` accepte jusqu'à 1 Gio : une valeur d'exploitation
malheureuse rouvrirait le sujet.

**Pagination et bornes de liste** : sans objet, aucune requête de liste n'existe.

**Non mesuré** : le coût des politiques de liaison (deux `exists` corrélés par ligne) à
l'échelle de vingt filiales sur trois ans. Voir §6.

---

### S14 — Intégrité des opérations composites · réserve

**Migrations transactionnelles — vérifié par mutation.** J'ai introduit une panne au milieu
de `004_rls.sql` (`select 1/0;` juste avant le §8) sur une base portant 001 à 003 :

```
### état AVANT 004 :   politiques=0 | fonctions=12
ERROR:  division by zero
### état APRÈS l'échec de 004 :  politiques=0 | fonctions=12 | migrations_enregistrees=3
```

Aucun état intermédiaire. La base est exactement dans son état antérieur.

**`migrate.mjs` — les quatre propriétés du plan §3, éprouvées une par une :**

```
### G1  deuxième passage                     « Schéma à jour, rien à appliquer »        code 0
### G3  migration appliquée puis modifiée    « DIVERGENCE »                             code 4
### G4  nom hors convention (003b_…)         « Nom de migration hors convention »       code 5
### G5  numéro en double                     « Numéro de migration en double »          code 5
### G7  migration qui ne s'enregistre pas    « s'est appliquée mais ne s'est pas enregistrée ;
                                               le schéma A ÉTÉ modifié »                code 6
### G9  trou dans la numérotation            « !! Trou dans la numérotation entre 004 et 007 »
### G12 compte propriétaire absent           « Configuration incomplète »               code 2
```

L'outil est solide, et son message d'échec distingue correctement « la transaction a été
annulée » de « le schéma a été modifié ». C'est la distinction qui compte pour l'exploitant.

**La réserve** est le constat **N-3** : `deploy/install.sh --reprendre-propriete` rend à
`grc_app` l'écriture sur `migrations_schema`, ce qui **désarme le garde-fou d'empreinte
ci-dessus**. Démonstration au §4.

**Reprise** : le fichier n'est jamais appliqué partiellement ; `lireEnveloppe` rend un statut,
jamais une exception, et n'écrit rien en base.

---

### S15 — Dépendances · passé

```
$ npm audit
found 0 vulnerabilities
```

Cinq dépendances directes, aucune ajoutée depuis le premier passage : `fastify@^5.12.1`,
`pg@^8.23.0`, `typescript@^5.9.3`, `@types/node`, `@types/pg` — 66 entrées au verrou.
Les intervalles sont en `^` mais `package-lock.json` est versionné : l'épinglage réel est
assuré. Moteur borné (`node >=22.11.0 <25`). `npm run verifier-types` : exit 0, mode `strict`.

---

## 4. Les constats neufs

### N-1 · BLOQUANT — La base ne vérifie jamais que la filiale d'écriture appartient au périmètre de lecture

**Où.** `004_rls.sql:298` — `f_filiale_ecriture()` rend `grc.filiale_id` après avoir vérifié
qu'il est **non nul**, et rien d'autre. Aucune politique du schéma ne recoupe cette valeur
avec `f_filiales_autorisees()`. Le contrôle existe une seule fois dans tout le produit, en
TypeScript :

```
  if (perimetre.filialeId !== null && !perimetre.filiales.includes(perimetre.filialeId)) {
    throw new ErreurPerimetre(…);          // src/db/pool.ts, validerPerimetre()
  }
```

**Pourquoi c'est un défaut.** Le `PLAN_SERVEUR` §1.9 pose que « un oubli de filtre dans le
code ne peut pas provoquer de fuite inter-filiales » : la RLS est le filet **sous** le code,
pas sa doublure. Ici le filet n'existe pas — la seule maille est dans le code qu'il est censé
rattraper.

**Scénario, rejoué de bout en bout.** Périmètre de **lecture** = `FIL-A` seulement ; filiale
**active** = `FIL-B` :

```
### W1 — la session ne lit que FIL-A
select set_config('grc.filiales','FIL-A',true), set_config('grc.filiale_id','FIL-B',true);
select count(*) from risques;                                    -->  1   (elle ne voit que A)

-- ... et elle écrit chez B :
insert into risques (id, filiale_id, nom) values ('RISK-HORS','FIL-B','ecrit par une session
                                                   qui ne lit pas B');        INSERT 0 1

-- la ligne existe-t-elle vraiment ? (vue depuis B)
    id     | filiale_id |                  nom                   | cree_par
 RISK-HORS | FIL-B      | ecrit par une session qui ne lit pas B  | alice
```

**Et le journal d'audit avec.** `004_rls.sql` affirme, à l'endroit exact de la dérogation de
lecture : « **Personne ne peut donc fabriquer de preuve dans le registre d'une autre
filiale.** » C'est faux :

```
### W3
select set_config('grc.filiales','FIL-A',true), set_config('grc.filiale_id','FIL-B',true);
insert into journal_audit (filiale_id, utilisateur_libelle, action, resume, entite_type,
                           entite_id, valeurs_apres)
  values ('FIL-B','bruno','suppression','Suppression du risque majeur par bruno',
          'risques','RISK-B1','{"forge": true}'::jsonb);              INSERT 0 1

 numero | filiale_id | utilisateur_libelle |    action    |                 resume
      6 | FIL-B      | bruno               | suppression  | Suppression du risque majeur par bruno
```

L'entrée est **numérotée, horodatée par le serveur, chaînée et scellée par empreinte** —
c'est-à-dire qu'elle est, pour l'auditeur ISO 27001 qui vérifiera la chaîne, indiscernable
d'une entrée authentique. Le mécanisme d'inaltérabilité, qui est excellent, garantit ici
l'intégrité d'une fausse preuve. Combiné à N-5 (l'acteur est fourni par le client), la trace
accuse un utilisateur nommé de la filiale visée.

**Ce que ça vaut, honnêtement.** Ce **n'est pas une fuite de confidentialité** : la lecture
reste cloisonnée, et `UPDATE` / `DELETE` sont bloqués parce que PostgreSQL applique aussi la
politique de `SELECT` aux lignes qu'ils doivent lire — vérifié (`UPDATE 0`, `DELETE 0`). C'est
une brèche d'**intégrité** et de **valeur probante** en écriture, et elle porte sur la table
qui existe précisément pour faire preuve.

**Pourquoi bloquant plutôt que majeur.** Les trois raisons qui ont fait de B-1 un bloquant
s'appliquent mot pour mot :

1. **La vague 1 fige le schéma.** Corriger maintenant, c'est une condition dans une fonction.
   Corriger après la mise en service, c'est un `create or replace` sur une base vivante
   **plus** l'impossibilité de distinguer les lignes déjà plantées des lignes légitimes.
2. **Le défaut n'est couvert ni par le banc d'essai ni par la démonstration.** J'ai injecté
   la correction dans une copie hors dépôt et rejoué la suite complète :
   `210 tests, 210 pass, 0 fail`. Aucun test ne change de résultat — ce qui prouve à la fois
   que la correction ne casse aucun usage légitime **et** que rien n'éprouve la propriété.
3. **La démonstration affirme le contraire.** Le commentaire cité ci-dessus, et le message
   final de `verifier_cloisonnement.sql` (« ne peut pas fabriquer d'entrée dans le journal
   d'une autre, pas même avec un périmètre de lecture qui la couvre »), disent l'inverse de ce
   que la base fait. Le contrôle C49 teste le cas « filiale lue mais non active » ; personne
   n'a testé « filiale **ni** lue **ni** active », qui est le cas ouvert.

**Correction suggérée.** Dans `f_filiale_ecriture()`, après la vérification de non-nullité :

```sql
if not (v_filiale = any (f_filiales_autorisees())) then
    raise exception 'Filiale active % hors du périmètre lisible de la session.', v_filiale
        using errcode = 'GRC04';
end if;
```

Aucun flux légitime n'en souffre : `PERIMETRE_SYSTEME` échoue déjà en amont (filiale active
nulle), et le retrait Groupe d'un contrôle du socle bascule entre des filiales **du**
périmètre. Ajouter le cas d'essai correspondant dans `test/base/rls.test.mjs` et un contrôle
dans `verifier_cloisonnement.sql` fait partie du correctif : c'est leur absence qui a laissé
passer le défaut.

---

### N-2 · MAJEUR — La table `filiales` est réinscriptible sans condition par n'importe quelle filiale

**Où.** `004_rls.sql:1173` — `filiales` figure dans le tableau `v_ouvertes`, qui reçoit
`using (true)` et `with check (true)` sur les **quatre** verbes. Le motif écrit à côté ne
justifie que la lecture : « la liste des filiales du groupe n'est pas une donnée de filiale,
et l'authentification la lit avant tout périmètre ».

**Pourquoi c'est un défaut.** La correction de M-2 a créé exactement le bon motif — lecture
ouverte, écriture réservée à l'administration Groupe — et l'a appliqué à `utilisateurs`,
`profils`, `profil_domaines` et `groupes_ad`. `filiales` est au moins autant une table de
paramétrage que celles-là : elle porte l'**identité** de chaque filiale (raison sociale,
logo — le lot L9), son **statut de cycle de vie** (`active` / `archivee` / `sortie` — le lot
L13) et sa **date de sortie**. Et c'est la table qui **définit la frontière** de tout le
cloisonnement.

**Scénario, rejoué.** Session `grc_app`, périmètre strictement `FIL-A` :

```
### F2 — la filiale A renomme la filiale B
update filiales set raison_sociale='Detournee par Toulouse' where id='FIL-B';    UPDATE 1
  id   |     raison_sociale     | version | modifie_par
 FIL-B | Detournee par Toulouse |       2 | alice

### F3 — la filiale A archive la filiale B
update filiales set statut='archivee' where id='FIL-B';                          UPDATE 1

### F4 — la filiale A crée une filiale
insert into filiales (id, code, raison_sociale) values ('FIL-PIRATE','ZZZ','…'); INSERT 0 1

### F5 — la filiale A supprime une filiale vide
delete from filiales where id='FIL-PIRATE';                                      DELETE 1

### F6 — filiale peuplée : protégée par les « restrict » (comportement correct)
ERROR:  update or delete on table "filiales" violates foreign key constraint …
```

**Et la pathologie de B-1, reproduite par ce chemin.** `filiales.logo_piece_jointe_id`
référence `pieces_jointes` — table de **niveau filiale** — en `on delete set null` :

```
### L1 — la filiale A dépose une pièce jointe CHEZ ELLE
insert into pieces_jointes (id, filiale_id, …) values ('PJ-A1','FIL-A',…);       INSERT 0 1
### L2 — ... et la pose comme LOGO de la filiale B
update filiales set logo_piece_jointe_id='PJ-A1' where id='FIL-B';               UPDATE 1
  id   |  raison_sociale   | logo_piece_jointe_id
 FIL-B | Filiale Allemagne | PJ-A1                          <-- le logo de B est un fichier de A
### L3 — puis A supprime SA pièce jointe : le logo de B tombe
delete from pieces_jointes where id='PJ-A1';                                     DELETE 1
  id   | logo_piece_jointe_id | version | modifie_par
 FIL-B |                      |       3 | alice
```

**La version de la ligne de la filiale allemande a été incrémentée par une suppression faite
à Toulouse, et le nom de l'auteur y est inscrit.** C'est mot pour mot ce que B-1 décrivait —
sur un chemin que la correction de B-1 ne couvre pas, parce que `filiales` ne porte pas de
`filiale_id` et échappe donc par construction au balayage de
`f_verifier_couverture_rls()`.

**Amplification à prévoir.** `statut = 'sortie'` avec `date_sortie` est l'entrée du cycle de
vie du lot L13 (purges conformes au RGPD). Le jour où L13 agira sur ce champ, une filiale
pourra déclencher la sortie d'une autre.

**Ce qui atténue.** Aucun point d'entrée n'expose aujourd'hui l'écriture de `filiales` (la
création de filiale est L4, l'identité par filiale L9). La lecture ouverte, elle, est
légitime et doit le rester.

**Correction suggérée.** Déplacer `'filiales'` de `v_ouvertes` vers `v_configuration` dans
`004_rls.sql` §6 : lecture `true`, écriture `f_administration_groupe()`. J'ai éprouvé le
coût : la modification fait tomber une large part du banc d'essai, parce que **les fixtures
sèment les filiales sous une session applicative ordinaire** — c'est-à-dire que le banc
d'essai repose aujourd'hui sur la propriété défectueuse. Il faut donc semer sous le drapeau
d'administration, et ajouter le cas d'essai « la filiale A ne modifie pas la fiche de la
filiale B ».

*Même remarque, de moindre portée, pour `mappings` et `mapping_exigences` : catalogue de
correspondances de niveau Groupe, réinscriptible par n'importe quelle filiale pour les vingt
autres. Je ne l'érige pas en constat séparé — le contenu n'est pas une donnée de filiale —
mais l'arbitrage mérite d'être écrit plutôt que déduit.*

---

### N-3 · MAJEUR — `install.sh --reprendre-propriete` rouvre `migrations_schema` en écriture et désarme le garde-fou d'empreinte

**Où.** `deploy/install.sh:594-611`, chemin `--reprendre-propriete`.

```sql
grant select, insert, update, delete on all tables    in schema public to $ROLE_APP;
...
-- Le verrou du journal d'audit est reposé APRÈS les grants généraux, sinon le
-- « grant … on all tables » que l'on vient de faire le rouvrirait (CONVENTIONS §12).
        execute format('revoke update, delete, truncate on journal_audit from %I', '$ROLE_APP');
```

Le raisonnement est **exact** — et appliqué à une seule table. `004_rls.sql` §1 en verrouille
**deux** :

> « `migrations_schema` — grc_app peut aujourd'hui `update migrations_schema set empreinte = …`.
> Or cette empreinte est précisément le garde-fou qui détecte la RÉÉCRITURE d'une migration
> déjà appliquée (`db/migrate.mjs`, code de sortie 4). Un service compromis pourrait donc
> maquiller une migration falsifiée. »

Le `grant … on all tables` rend ce privilège, et rien ne le reprend. Les instructions
manuelles imprimées par le script (lignes 650-651) reproduisent la même omission. Et la
**vérification finale** de `install.sh` (§11) contrôle minutieusement la propriété et les
privilèges de `journal_audit`, l'héritage de rôle, le propriétaire de la base — **jamais
`migrations_schema`**.

**Preuve.** Jeu de privilèges du chemin de reprise reproduit à la main, puis :

```
 privilege_type
 DELETE | INSERT | SELECT | UPDATE          <-- grc_app sur migrations_schema

### R1 — une migration DÉJÀ APPLIQUÉE est falsifiée, et son empreinte maquillée par grc_app
  (ajout de « create table porte_derobee (id text); » à 002_metier_noyau.sql)
  psql -U grc_app -c "update migrations_schema set empreinte = '<sha du fichier falsifié>' …"
  $ node db/migrate.mjs
    Schéma à jour : 4 migration(s), rien à appliquer.
  >>> le garde-fou anti-réécriture ne dit plus rien.

### R2 — grc_app fait SAUTER une future migration de durcissement
  psql -U grc_app -c "insert into migrations_schema (version, nom) values ('005','005_durcissement.sql')"
  $ node db/migrate.mjs
    005_durcissement.sql ........ déjà appliquée
    Schéma à jour : 5 migration(s), rien à appliquer.
  $ psql -c "select coalesce(to_regclass('public.durcissement_005')::text,'ABSENTE')"
     ABSENTE
```

**Scénario.** Le chemin `--reprendre-propriete` est celui qu'on emploie **après** avoir
constaté une installation fautive — c'est-à-dire au moment où l'on répare, et où l'on a le
plus besoin que les privilèges soient justes. Après cette réparation, un service compromis
peut (a) réécrire une migration déjà passée en maquillant son empreinte, et (b) faire
**ignorer en silence** une migration de sécurité à venir : `migrate.mjs` annoncera « Schéma à
jour » alors que le durcissement n'a jamais été appliqué. L'exploitant n'a aucun moyen de le
voir — c'est précisément ce que la ligne « le registre s'écrit sous le compte propriétaire »
existe pour empêcher.

**Correction suggérée.** Trois lignes : reposer
`revoke insert, update, delete, truncate on migrations_schema from $ROLE_APP` après le
`grant … on all tables`, l'ajouter aux instructions manuelles imprimées, et étendre la
vérification finale du §11 à `migrations_schema` sur le modèle du bloc `journal_audit`.

---

### N-4 · MAJEUR — Le drapeau d'administration Groupe survit au recyclage d'une connexion du pool

**Où.** `src/db/pool.ts:230-237`, `appliquerPerimetre()`. Trois réglages sont posés en portée
transaction ; le quatrième, `grc.administration_groupe`, n'est **ni posé ni effacé**. Le pool
`pg` n'émet pas de `DISCARD` à la libération d'une connexion.

**Pourquoi c'est un défaut.** L'en-tête du fichier affirme :

> « **Le réglage est local à la transaction.** Il meurt au `commit` ou au `rollback` : une
> connexion rendue au pool ne peut pas emporter le périmètre de l'utilisateur précédent. »

C'est vrai des trois réglages posés. Ce ne l'est pas du quatrième, qui décide de l'écriture
sur `utilisateurs`, `profils`, `profil_domaines`, `groupes_ad` et sur toutes les lignes de
portée Groupe des cinq tables mixtes.

**Preuve, sur un vrai pool `pg` (`max: 1`, deux transactions successives) :**

```
T1 (admin) : « set grc.administration_groupe = 'oui' »  — portée SESSION, pas SET LOCAL
             connexion rendue au pool
T2 (utilisateur ordinaire, connexion recyclée) :
  { drapeau: 'oui', admin: true, ecriture: 'ACCEPTEE' }
```

La transaction T2 a posé son propre périmètre par `appliquerPerimetre` — donc tout ce que le
serveur sait faire — et a **quand même** hérité du drapeau, puis créé un compte dans
`utilisateurs`.

**Scénario.** Le drapeau n'est posé par aucun chemin de code **aujourd'hui** : c'est un défaut
**latent**, et je le dis franchement. Il devient réel au premier chemin d'administration
Groupe (L3 pour le provisionnement, L4 pour la création de filiale), et il se déclenchera sur
une faute banale : un `set` au lieu d'un `set_config(…, true)`, ou un `set_config(…, false)`
laissé par une mise au point. La conséquence est une élévation de privilège **silencieuse et
persistante**, portée par une connexion recyclée, et attribuée à des utilisateurs qui n'ont
rien demandé.

**Correction suggérée.** Poser le quatrième réglage **explicitement et toujours**, dans le
même appel :

```sql
select set_config('grc.utilisateur', $1, true),
       set_config('grc.filiale_id',  $2, true),
       set_config('grc.filiales',    $3, true),
       set_config('grc.administration_groupe', $4, true)   -- 'oui' ou '' — jamais absent
```

Le réglage devient alors local à la transaction **par construction**, et l'affirmation de
l'en-tête redevient vraie. Ajouter au `PerimetreSession` le champ correspondant, et un test
qui pose le drapeau en portée session puis vérifie qu'une transaction suivante ne l'hérite
pas.

---

### N-5 · MINEUR — L'acteur inscrit au journal d'audit est fourni par le client

**Où.** `001_socle.sql`, table `journal_audit` : `utilisateur_id` et `utilisateur_libelle`
sont sans valeur par défaut, et `f_journal_audit_chainage()` ne les touche pas — elle fixe
`numero`, `horodatage`, `empreinte_precedente` et `empreinte`, rien d'autre.

**Pourquoi.** Toutes les autres tables du schéma tirent leur traçabilité de
`f_utilisateur_courant()` (défaut de `cree_par`, réécriture de `modifie_par` par
`f_maj_tracabilite`). La seule table dont l'objet **est** de faire preuve laisse l'auteur en
saisie libre. Vérifié : avec `grc.utilisateur = 'alice'`, une entrée insérée avec
`utilisateur_libelle = 'bruno'` est conservée telle quelle, puis scellée.

**Scénario.** Seul ou combiné à N-1 : une entrée forgée accuse nommément un tiers, et la
chaîne d'empreintes la certifie. Un défaut applicatif banal (une variable confondue) produit
le même effet sans intention.

**Correction.** Donner à `utilisateur_libelle` le défaut `f_utilisateur_courant()`, ou —
mieux — l'écraser dans le déclencheur de chaînage comme le sont déjà l'horodatage et le
numéro. Le coût est nul et la propriété devient structurelle.

---

### N-6 · MINEUR — « Il s'archive » : la promesse n'a pas de mécanisme

**Où.** `CONVENTIONS` §17.6 (« Un contrôle que des filiales ont évalué ne disparaît pas : il
s'archive »), `002_metier_noyau.sql:386` (« il ne peut plus s'évaporer : il s'archive »), et
le message final de `verifier_cloisonnement.sql`.

**Fait.** `mesure_catalogue` porte `id, filiale_id, reference, nom, description, domaine,
version, cree_le, cree_par, modifie_le, modifie_par`. **Aucune colonne d'état, de statut ni
d'archivage.** `filiales` en a une (`statut`), `mesure_catalogue` non.

**Pourquoi ça compte.** Le `restrict` est juste, et je le soutiens. Mais il ferme une porte
en promettant une autre issue qui n'existe pas. Un exploitant qui suit le document ira
chercher le bouton « archiver » et ne le trouvera pas ; il finira par supprimer les mises en
œuvre des vingt filiales, ce que le `restrict` cherchait justement à éviter. C'est la règle du
§17.5 — ne pas prêter à un garde-fou plus de portée qu'il n'en a — appliquée cette fois au
document normatif.

**Correction.** Soit ajouter la colonne (`statut` ou `retire_le`) et la politique qui va avec,
soit récrire les trois textes pour dire ce que le schéma fait : « il reste ». Un des deux,
maintenant.

---

### N-7 · MINEUR — Un `search_path` de session divergent entre le pool et le banc d'essai

**Où.** `pool.ts` pose `-c search_path=public` à la connexion. Une session `psql` ordinaire
hérite de `"$user", public`. J'ai vérifié que la différence est **sans effet** depuis que les
dix-huit fonctions figent le leur — c'est précisément ce que la correction de M-1 achète.

Je le consigne pour une raison : le `search_path` de la connexion n'est plus une mesure de
sécurité, seulement une commodité. Le commentaire de `pool.ts` le présente encore comme une
« décision de conception » ; c'est vrai, mais il ne faut plus compter dessus, et la migration
le dit mieux que le pool.

---

### Observations (sans scénario d'exploitation)

**N-8 — `migrate.mjs` applique sans un mot une migration au numéro inférieur au plus haut
déjà appliqué.** Un fichier `000_prealable.sql` déposé après coup sur une base portant 001 à
004 est appliqué immédiatement, hors de l'ordre que son numéro annonce. L'outil détecte les
trous et les doublons ; il ne détecte pas la rétro-numérotation. Une ligne de vérification
(« le numéro le plus bas à appliquer est inférieur au numéro le plus haut appliqué ») rendrait
le service. Faute d'exploitation possible — le numéro doit être libre, et les doublons sont
déjà refusés —, c'est une observation.

**N-9 — Références polymorphes sans clé étrangère ni contrôle de cohérence.**
`approbations.(objet_type, objet_id)` et `pieces_jointes.(entite_type, entite_id)` désignent
une entité sans que rien ne vérifie qu'elle existe, ni qu'elle appartient à la même filiale :

```
### P6 — pièce jointe de la filiale A déclarée sur un risque de la filiale B
insert into pieces_jointes (id, filiale_id, entite_type, entite_id, …)
  values ('PJ-X','FIL-A','risques','RISK-B1', …);                            INSERT 0 1
  id  | filiale_id | entite_type | entite_id
 PJ-X | FIL-A      | risques     | RISK-B1
```

L'effet est **borné à la filiale de la ligne** (elle reste chez A, invisible de B), donc ce
n'est pas une brèche. Mais L6 servira les pièces jointes et L8 fera avancer les approbations
sur ces couples ; le motif de `f_coherence_mesure_catalogue()` s'y appliquerait tel quel, et
c'est maintenant qu'il coûte le moins cher.

**N-10 — La clé composite de `document_referentiels` est neutralisée pour les lignes de portée
Groupe.** `MATCH SIMPLE` ignore une clé composite dès qu'une de ses colonnes est nulle ; c'est
la clé simple doublée qui prend le relais, et elle ne vérifie pas la portée. Avec le drapeau
d'administration (auto-déclaré, cf. M-2) :

```
### DR — ligne de portée GROUPE pointant vers un document LOCAL de la filiale B
insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-B1','anssi',null);
                                                                             INSERT 0 1
  la filiale B supprime son document :                                       DELETE 1
  lignes_groupe_restantes = 0                        <-- la ligne Groupe a suivi
```

Une opération ordinaire d'une filiale détruit une ligne de portée Groupe. L'objet détruit est
une ligne de liaison, l'impact est faible, et le chemin exige le drapeau — d'où l'observation
plutôt que le constat. Le remède est le même que pour N-9 : un déclencheur de cohérence de
portée.

**N-11 — Les déclencheurs neufs sont armés en `origin`, pas en `always`.** Les cinq
déclencheurs de portée et les quatre de cohérence portent `tgenabled = 'O'`, alors que les
trois du journal portent `'A'`. Sans effet aujourd'hui : `grc_app` ne peut pas poser
`session_replication_role` (vérifié), et le propriétaire est hors modèle de menace. À aligner
si l'un de ces déclencheurs venait à porter une garantie opposable.

**N-12 — `src/reprise/index.ts` porte toujours deux octets NUL** (offsets 59446 et 59723,
lignes 1533 et 1539). L'observation O-5 du premier rapport n'a pas été traitée ; l'usage reste
délibéré et correct, mais `file(1)` classe le fichier « data » et `grep` le traite en binaire,
ce qui gêne la revue — je l'ai constaté en le lisant.

**N-13 — Trois textes normatifs en décalage avec le code qu'ils décrivent** :
`f_interdit_changement_portee()` renvoie l'utilisateur au « §17.1 » au lieu du §17.6 ; le
commentaire de la dérogation du journal décrit encore l'écriture sur le périmètre de lecture
(corrigée par m-4) ; le §17.2 écrit « explicite et vérifié aux trois endroits » là où deux des
trois s'appuient sur un `revoke all` implicite (la vérification, elle, est bien aux trois).
Aucun effet technique ; à remettre en phase, parce que ces textes sont la mémoire du projet.

---

## 5. Le banc d'essai mord-il encore ?

Exigence de la porte : un test qui passe quoi qu'on fasse ne prouve rien. Le banc d'essai a
changé de mécanique depuis le premier passage (noms de bases jetables, ACL de production
appliquée, migrations lancées par le binaire réel). J'ai copié le backend hors du dépôt et
cassé **huit** propriétés, tirées dans le périmètre corrigé.

| # | Propriété cassée | Résultat |
|---|---|---|
| 1 | `fk_actions_risque` remise en clé simple | **3 échecs**, dont « LE BALAYAGE : aucune clé étrangère entre deux tables cloisonnées n'est simple » |
| 2 | `pg_temp` retiré du `search_path` d'**une** fonction | **La migration refuse de s'appliquer** (`pg_temp_non_relegue`) ; toute la suite tombe |
| 3 | Déclencheur `trg_mesure_catalogue_portee_figee` retiré | **4 échecs**, dont « les cinq tables mixtes portent toutes le déclencheur » |
| 4 | `fk_mesure_mise_en_oeuvre_mesure` remise en `cascade` | **3 échecs**, dont « LE BALAYAGE : les quatre références au catalogue sont en restrict » |
| 5 | `test/aide/base.mjs` réaccorde `temporary` | **2 échecs**, dont « et le refus est EFFECTIF, pas seulement déclaré » |
| 6 | Virgule réadmise par le domaine `id_metier` | **1 échec**, précisément ciblé |
| 7 | Journal réécrit sur le périmètre de lecture (régression m-4) | **2 échecs** |
| 8 | `utilisateurs` remise en écriture ouverte (régression M-2) | **1 échec** |

**Huit sur huit.** Et deux d'entre elles tombent sur un **balayage du catalogue** plutôt que
sur un cas particulier — c'est exactement le filet dont l'absence avait laissé passer B-1, et
il est maintenant en place pour les clés étrangères comme pour les actions de suppression.

Deux mesures complémentaires, plus instructives que les mutations :

- **Injecter la correction de N-1** (la condition d'appartenance dans `f_filiale_ecriture()`)
  laisse `210 tests, 210 pass, 0 fail`. La propriété n'est éprouvée par rien.
- **Injecter la correction de N-2** (déplacer `filiales` vers les tables de configuration)
  fait tomber une large part du banc d'essai, parce que les fixtures sèment les filiales sous
  une session applicative. Le banc d'essai **dépend** de la propriété défectueuse.

**Conclusion : la sensibilité du banc d'essai est excellente ; sa couverture reste son point
faible**, et elle l'est exactement là où les constats neufs se trouvent. C'était déjà la
conclusion du premier passage ; elle se vérifie une seconde fois, sur d'autres cas. Le remède
structurel n'est pas d'ajouter des cas, c'est d'ajouter des **balayages** : le motif employé
pour les clés étrangères et pour les `restrict` devrait l'être aussi pour « toute table de
niveau Groupe dont l'écriture est ouverte est-elle dans une liste explicitement arbitrée ? ».

---

## 6. La définition de « terminé » (§5)

| # | Point | Constat |
|---|---|---|
| 1 | **Ça compile** | OK — `npm run verifier-types`, exit 0, mode `strict` |
| 2 | **Ça s'applique depuis zéro** | OK — quatre migrations rejouées sur base neuve par `migrate.mjs`, sans intervention |
| 3 | **C'est prouvé** | OK — `npm test` : **210 tests, 0 échec** ; `verifier_cloisonnement.sql` : **59 contrôles, 59 réussis** |
| 4 | **C'est conforme** | Réserve — N-1 et N-2 sont des écarts de fond au `CONVENTIONS` §11 et §4 ; N-6 est un écart du §17.6 à lui-même ; N-13 liste trois textes en décalage |
| 5 | **C'est en français** | OK, sans exception, y compris les messages d'erreur et les `comment on` |
| 6 | **C'est documenté** | Non évalué — hors de mon périmètre (agent DOC) |
| 7 | **C'est dans le périmètre** | Réserve — les commits de correction sont transverses (cf. m-6) |
| 8 | **Les manques sont dits** | OK, et remarquable. Le report L3 des trois tables de session est écrit, daté, **et épinglé par un test qui tombera quand il sera levé**. La dérogation de lecture du journal est annoncée et sa correction esquissée. C'est la meilleure partie du dossier. |

---

## 7. Ce que la grille ne couvre pas à ce stade

**Six des quinze contrôles sont sans objet ou partiels** parce que le code qu'ils visent
n'existe pas : S6, S7, S9, S11, la moitié API de S4, la moitié « session » de S10. Une porte
S1 franchie ne dirait donc rien de la sécurité du produit — seulement que le schéma et le
cloisonnement sont sains. Trois angles morts, reconduits :

1. **Le cloisonnement n'est prouvé qu'au niveau SQL.** Rien de bout en bout — navigateur,
   Apache, Fastify, PostgreSQL — n'a pu être éprouvé : la chaîne s'arrête à `/api/sante`.
   C'est l'objet de la porte S4.
2. **L'autorisation n'existe pas.** La RLS répond à « quelles lignes », jamais à « qui a le
   droit de faire quoi ». Tant que L3 n'est pas livré, **toute personne disposant des
   identifiants `grc_app` a un accès complet** au socle d'authentification (trois tables de
   session, report écrit) et au journal — et, avec N-1, une capacité d'écriture dans
   n'importe quelle filiale.
3. **La complétude du journal est invérifiable.** Vingt actions prévues, aucune émise.

**Ce qui reste explicitement pour le test d'intrusion de L15**, et que la grille ne remplacera
pas : l'enchaînement de faiblesses mineures en chemin d'attaque complet (typiquement m-1 pour
énumérer, puis N-1 pour écrire), la couche Apache en conditions réelles (renégociation TLS,
désynchronisation de requêtes, contrebande d'en-têtes vers le mandataire), la robustesse du
VPN comme chemin d'accès unique, la résistance des exports et des pièces jointes à un contenu
piégé, et l'ingénierie sociale sur le compte de secours.

**Limites assumées, reconduites telles quelles** : ni `root` sur la VM, ni le propriétaire de
la base ne sont dans le modèle de menace (`CONVENTIONS` §12). J'ai reproduit la limite pour la
constater — le propriétaire désarme un déclencheur et vide le journal — et c'est bien le
chaînage qui rend l'opération **détectable**, comme annoncé.

---

## 8. Ce que je n'ai pas pu vérifier ici

| Sujet | Pourquoi |
|---|---|
| **PostgreSQL 17** | La machine porte **16.13**, la cible est **17**. Aucune fonctionnalité postérieure à 15 n'est employée, et le garde de version en tête de `004` exige 15 minimum. Mais le comportement de la RLS, des contrôles d'intégrité référentielle, de `MATCH SIMPLE` sur les clés composites (N-10) et de `pg_temp` n'a été observé qu'en 16. **À rejouer sur 17 avant la mise en service.** |
| **`install.sh` de bout en bout** | Ni Debian 13, ni Apache, ni systemd, ni `apt`. Le script a été **lu**, et son bloc de privilèges **reproduit à la main** — c'est ainsi que N-3 a été établi. Le reste (unité systemd, vhost, création d'utilisateur système, droits de fichiers) repose sur la lecture. S10 et une partie de S8 sont donc des contrôles documentaires. |
| **ClamAV** | Absent. S9 reste sans objet jusqu'à la porte S4. |
| **Active Directory / LDAPS** | Absent. S6, S7 et S11 attendent la doublure d'annuaire (livrable OUTILLAGE de la vague 3). |
| **Relais SMTP** | Absent. La non-fuite par courriel (porte S6) n'est pas éprouvable. |
| **Volumétrie réelle** | Essais sur quelques dizaines de lignes. Les politiques de liaison font deux `exists` corrélés par ligne ; leur coût à l'échelle de vingt filiales sur trois ans n'a pas été mesuré. À surveiller en L2 : un plan qui dégénère se paierait sur le chemin le plus chaud. **Non testé, donc non affirmé.** |
| **Concurrence réelle sur le journal** | `f_journal_audit_chainage()` prend un verrou consultatif de transaction pour sérialiser la numérotation. Je n'ai pas mesuré son effet sous charge : c'est un point de sérialisation global, sur la table la plus écrite du produit. À éprouver en L5. |
| **Documentation d'exploitation** | `README.md` §8, `CHANGELOG.md`, `DATA_MODEL.md` relèvent de l'agent DOC. Le point 6 de la définition de « terminé » n'est pas évalué par ce rapport. |
| **Synchronisation NTP** | L'horodatage du journal est posé côté serveur (`clock_timestamp()`, jamais par le client — vérifié), mais la synchronisation de la source de temps est une propriété de la VM, à vérifier au déploiement. |

---

## 9. Conditions de re-passage

La porte sera rejouée **intégralement**, une troisième fois. Pour qu'elle soit franchissable :

1. **N-1 corrigé** — la condition d'appartenance dans `f_filiale_ecriture()`, **plus** un cas
   d'essai dans `test/base/rls.test.mjs` (écriture dans une filiale hors périmètre : refusée)
   et un contrôle dans `verifier_cloisonnement.sql`. Sans les deux ajouts, le correctif ne
   compte pas : c'est leur absence qui a laissé passer le défaut, exactement comme pour B-1.
   Corriger aussi le commentaire de `004_rls.sql` qui affirme aujourd'hui le contraire.
2. **N-2 corrigé** — `filiales` déplacée vers les tables de configuration, fixtures du banc
   d'essai adaptées, et un cas d'essai « la filiale A ne modifie pas la fiche de la filiale B ».
   Arbitrer par la même occasion `mappings` / `mapping_exigences`, en l'écrivant.
3. **N-3 corrigé** — `revoke` reposé sur `migrations_schema` dans le chemin
   `--reprendre-propriete` et dans les instructions imprimées, et vérification finale étendue.
4. **N-4 corrigé** — le quatrième réglage posé explicitement à chaque transaction, et un test
   qui vérifie qu'il ne s'hérite pas d'une connexion recyclée.
5. **N-5 et N-6 arbitrés** — corrigés, ou reportés avec la décision écrite dans
   `CONVENTIONS.md`, comme l'a été le report L3 des tables de session. Un report assumé et daté
   est acceptable ; un silence ne l'est pas.
6. **M-2 : la nature de la barrière écrite au §17.4.** Le drapeau d'administration est une
   déclaration que la session fait sur elle-même, pas un privilège. Le §17.4 doit le dire, sans
   quoi la porte S3 héritera d'une protection qu'elle croira acquise.
7. **N-8 à N-13** — traitables dans la vague 2, à condition d'être inscrits.

Le reste du travail de la vague 1 n'appelle aucune reprise. **Les corrections apportées depuis
le premier passage sont bonnes, et le banc d'essai les tient.**

---

*Rapport établi par l'agent SECU-2, en lecture seule sur le dépôt. Aucun fichier du code livré
n'a été modifié ; aucun commit n'a été fait. Les bases et scripts d'essai vivent hors du dépôt.
Base d'audit `grc_audit2` conservée en l'état ; les bases de travail (`grc_mut`,
`grc_audit2_demo`) ont été supprimées. Les bases `grc_audit` et `grc_correctif` des travaux
précédents n'ont pas été touchées.*
