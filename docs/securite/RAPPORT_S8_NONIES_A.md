# Porte S8 — 9ᵉ passage — PÉRIMÈTRE A : base, schéma, cloisonnement, garde-fous

| | |
|---|---|
| **Auditeur** | indépendant — n'a écrit aucune des lignes examinées |
| **Date** | 11/09/2026 |
| **Révision examinée** | `bdb1e40` (« Réancrer les chiffres sur 30f2d84 : 1907 essais, 110/110 au cloisonnement ») |
| **Machine** | `SRV-Infra`, Debian 13, PostgreSQL 17.11 |
| **Contrôles du périmètre** | S1, S2, S3, S4, S5, S14, S16 |
| **Verdict du périmètre** | ❌ **refusé** — 6 majeurs, 6 mineurs, **0 fuite entre filiales** |

> **Numérotation.** Étiquettes locales **A-1 … A-12**, *aucune plage `Q-` réservée* :
> l'orchestrateur numérotera après consolidation. Une plage réservée est exactement le
> genre de convention qui devient fausse, et la leçon a déjà été apprise deux fois.

---

## Déclaration d'intégrité

`git status --porcelain` joué **au début** et **à la fin** de l'audit :

```
début (avant toute action) :   (vide)   — HEAD = bdb1e4077b92f740491b86e8584d25db2b982f22
fin   (après tout l'audit)  :   ?? docs/securite/RAPPORT_S8_NONIES_A.md
```

Le **seul** fichier écrit est le présent rapport. Aucun fichier du produit, du banc ou de
la documentation n'a été modifié.

**Où j'ai muté.** Toutes les mutations de schéma ont été jouées :

* soit sur une **base jetable** `audit_s8na`, créée par `createdb` + `node db/migrate.mjs`
  (30 migrations, 0 anomalie au départ), **détruite à la fin de l'audit** ;
* soit dans une **transaction annulée** (`begin … rollback`), avec `savepoint` pour que
  l'échec d'une sonde n'avale pas les suivantes.

**Sur la recette `cyber_grc`, je n'ai fait que LIRE**, plus `install.sh --diagnostic`, qui
ne modifie rien et le dit. **Aucune filiale créée**, `db/dev/preparer_base_dev.sh` **jamais
joué**, **aucun compte de `grc-ad` éprouvé au cas négatif**. Aucun secret ne figure ici.

**Contrôle de non-régression après l'audit**, sur la recette :

```
0 anomalie | 30 migrations | 30 gardes | 208 politiques
2 filiale(s) (inchangé)
0 ligne(s) « __charge__ » (la charge d'essai de A-4 n'existait que sur la base jetable)
197 déclarations au registre (inchangé)
```

> ℹ️ **Une phrase du `CLAUDE.md` à rectifier au passage, et elle est mesurable.** Elle
> écrit : *« Aucune filiale n'a été créée dans la recette, délibérément »*. La recette en
> porte **deux**, semées le 03/09/2026 par `systeme` (`TLS` Toulouse, `DEU` Deutschland) —
> et il en faut au moins une, le même fichier le dit au §5 (*« au moins une filiale active,
> sans quoi la session ne se résout pas »*). La phrase veut dire « aucune **de plus** », à
> cause du constat Q-155 ; lue telle quelle, elle ferait croire à la session suivante que
> la recette ne peut pas résoudre une session. Deux mots suffisent.

---

## 1. Verdict des sept contrôles

| Contrôle | Verdict | Preuve |
|---|---|---|
| **S1** — cloisonnement non contournable | ✅ **passé** | `db/verifier_cloisonnement.sql` **sous `grc_app`** → **110 contrôles, 110 réussis, 0 échoué**. **Trente-quatre sondes hostiles de ma main** sur les surfaces neuves (§3) — chemin `documents → traitements`, verrou d'approbation, étiquettes — **aucune ne franchit**. RLS **52/52 activée, 52/52 forcée**. |
| **S2** — le périmètre ne vient jamais du navigateur | ✅ **passé** | Le déclencheur de `030` **écrase** la valeur envoyée par le client (sondes P4 et P7, mesurées) ; `grc_app` ne peut ni désarmer le déclencheur (P8 : « must be owner of table documents ») ni poser `session_replication_role` (P9 : « permission denied to set parameter »). `traitement_filiale_id` est déclarée `colonnesReservees` côté API. |
| **S3** — journal inaltérable | ✅ **passé** *(sur mon périmètre)* | `install.sh --diagnostic` → « journal : ajout seul, chaîne intacte — chaîne entière (1624 entrées) ». `ck_journal_audit_action` porte un témoin **évalué** (M9 mord) **et** son garde vérifie `convalidated` (M16b mord). *La couverture des vingt actions relève du périmètre B.* |
| **S4** — verrouillage optimiste / irréversibilité | ✅ **passé** | Dix sondes sur le verrou d'approbation refait (§3.3) : **huit refus justes** (dont le renommage d'`id`, le cas même de Q-299) **et deux acceptations légitimes** — l'anonymisation passe, une étape non tranchée reste supprimable. La barrière ne casse pas le produit. |
| **S5** — aucune injection SQL | ✅ **passé** | `f_contrainte_accepte()` : nom de table injecté → `NULL`, sans dommage ; valeur injectée → `false`, le paramètre voyage bien en `using`. ⚠️ **La faiblesse de cette surface n'est pas l'injection, c'est l'EXÉCUTION** — voir **A-4**. |
| **S14** — intégrité des opérations composites | ✅ **passé** | Les trois migrations neuves sont chacune **un seul `begin;` / un seul `commit;`** : `030` pose le déclencheur, les deux clés étrangères et les deux `check` **dans la même transaction** — aucun état intermédiaire observable. L'ordre d'écriture de la reprise est **dérivé du graphe des clés découvert au catalogue**, donc il a absorbé `030` sans qu'une ligne change (mesuré : `documents → traitements`, aucun cycle). ⚠️ Voir **A-11** : rien ne l'éprouve. |
| **S16** — les garde-fous sont branchés | ❌ **en échec** | Les **30** garde-fous sont bien découverts, joués et consignés, et le chemin **fait échouer** le déploiement (`migrate.mjs` → **code 7** sur une base sabotée, mesuré ; `install.sh` traite le code 7 par `echec`). Mais **A-1** — `f_domaine_accepte()`, livrée par `028` §2 et inscrite comme règle au `CONVENTIONS.md` §39.1, **n'est appelée par personne** — et **A-2** — *tout* le dispositif de barrière de la migration `030` n'est gardé par rien. |

---

## 2. Les constats

### 🟠 A-1 — `f_domaine_accepte()` n'est appelée par PERSONNE, et les deux domaines se vident par la mutation même que `028` existe pour fermer

**Énoncé.** La migration `028` §2 livre `f_domaine_accepte()` en écrivant :

> « Le pendant pour un DOMAINE. Même principe, autre objet […] on mesure le sens qui porte
> la barrière : **une valeur que le produit emploie est-elle réellement admise ?** »

et le `backend/db/CONVENTIONS.md` **§39.1** l'inscrit en règle, dans un tableau dont la
colonne s'intitule « Ce qu'on fait » :

| Objet | Ce qu'on ne fait plus | Ce qu'on fait |
|---|---|---|
| un domaine | extraire ses valeurs par expression régulière | `f_domaine_accepte(domaine, valeur)` |

**C'est faux.** Aucun garde-fou ne l'appelle. Mesuré dans le catalogue, puis dans le dépôt :

```
=== 1. QUI APPELLE f_domaine_accepte() ? ===
   dans le dépôt :
     backend/db/migrations/028_les_gardes_eprouvent.sql
     backend/db/CONVENTIONS.md
```

Deux fichiers : **celui qui la crée, et celui qui promet qu'on s'en sert.** Zéro appelant.

**La conséquence, mesurée.** La mutation sournoise de Q-292 — la contrainte vidée qui garde
son nom et ses littéraux — **fonctionne encore sur les deux domaines** :

```
NE MORD PAS | M42 domaine type_entite : VIDÉ par « or true »
NE MORD PAS | M43 domaine id_metier  : VIDÉ par « or true »
```

et ce que cela ouvre a été joué jusqu'au bout, sur la base jetable :

```
f_verifier_schema apres les DEUX domaines vides : 0 anomalie(s)
insert into risques (id, …) values ('',          …);   -- ACCEPTÉ
insert into risques (id, …) values ('  RSK-1  ', …);   -- ACCEPTÉ
risques ecrits avec un identifiant illegal : 2
```

**C'est le constat Q-310 rouvert — donc Q-194 — par la migration écrite le même jour pour
le fermer.** La `029` §1 a remis le domaine `id_metier` sur deux colonnes de
`risque_catalogue` en expliquant que *« le domaine est ce par quoi la couche d'écriture
DÉCOUVRE qu'un identifiant ne peut être ni vide ni non rogné »* ; la `028` a livré l'outil
qui mesure cette propriété ; **personne ne les a branchés l'un à l'autre.** Le domaine
`type_entite` se vide de la même façon, et il borne le lien polymorphe des pièces jointes —
c'est-à-dire la cascade de la migration `017` (action D2).

⚠️ **À décharge**, et il faut le dire : la mutation **franche** mord. Retirer une valeur du
domaine fait rougir `f_verifier_declencheurs_pieces` :

```
MORD | M41 domaine type_entite : une valeur du produit RETIRÉE | 2 anomalie(s)
       <<declencheurs_pieces|type_entite.actif|valeur_sans_porteur>>
```

Le défaut n'est donc pas que rien ne regarde le domaine ; c'est que **ce qui le regarde LIT
son texte**, et que l'outil écrit pour ne plus le lire dort dans le catalogue. C'est
littéralement le contrôle **S16** — *un garde-fou que rien n'invoque est un commentaire* —
appliqué à un garde-fou livré **par la migration qui porte ce contrôle en titre**.

L'essai neuf `test/base/gardes-eprouves.test.mjs` le confirme par omission : il éprouve la
contrainte vidée (`ck_documents_confidentialite`) sous tous les angles, et **aucun de ses
vingt essais ne vide un domaine**.

**Remède.** Un `f_verifier_domaines_eprouves()` sur le modèle du §2 bis : quelques témoins
(`id_metier` refuse `''` et `'  x  '` ; `type_entite` admet chaque valeur du registre
d'entités et refuse une valeur inventée), branché par la découverte.

---

### 🟠 A-2 — Tout le dispositif de barrière de la migration `030` est hors de portée des garde-fous, et le garde qui devrait le voir le manque d'un NOM DE COLONNE

**Énoncé.** La migration `030` énumère, dans son propre en-tête, les quatre pièces qui
tiennent la règle, et écrit **« il faut les quatre »** :

```
fk … (traitement_id, traitement_filiale_id)    -> traitements (id, filiale_id)
fk … (traitement_id, traitement_portee_groupe) -> traitements (id, portee_groupe)
check  filiale_id is not null or traitement_filiale_id is null   ← N-10 fermé
check  traitement_filiale_id is null or traitement_filiale_id = filiale_id
```

**Aucune des quatre n'est gardée, ni le déclencheur qui les alimente.** Cinq mutations, cinq
fois zéro anomalie :

```
NE MORD PAS | M17 supprimer le déclencheur trg_documents_traitement_portee
NE MORD PAS | M20 supprimer ck_documents_traitement_groupe (N-10 rouvert)
NE MORD PAS | M21 supprimer ck_documents_traitement_filiale
NE MORD PAS | M22 supprimer fk_documents_traitement_coherence
NE MORD PAS | M23 supprimer fk_documents_traitement_portee
```

**Les conséquences ont été jouées jusqu'au bout**, sur la base jetable, avec deux filiales
(`FIL-AUD-A` Toulouse, `FIL-AUD-B` Allemagne) :

```
### C20 : ck_documents_traitement_groupe SUPPRIMEE -> N-10 rouvert ?
C20 -> la PSSI de PORTEE GROUPE designe le traitement LOCAL de FIL-AUD-A
C20 -> f_verifier_schema : 0 anomalie(s)

### C21 : ck_documents_traitement_filiale SUPPRIMEE -> lien inter-filiales ?
C21 -> document de FIL-AUD-A rattache au traitement de FIL-AUD-B
C21 -> f_verifier_schema : 0 anomalie(s)

### C23 : fk_documents_traitement_portee SUPPRIMEE -> traitement_id non verifie ?
C23 -> document rattache a un traitement INEXISTANT : TRT-INEXISTANT
C23 -> f_verifier_schema : 0 anomalie(s)
```

C20 est **le constat N-10 de la porte S1** — *« la politique que les vingt filiales lisent
désignerait une ligne qu'UNE filiale peut effacer »* — rouvert par le retrait d'une seule
ligne, en silence. C21 est un **lien inter-filiales**. C23 fait de `traitement_id` un champ
qui ne référence plus rien.

**La cause est identifiée, et elle est exactement le motif de la porte.**
`f_verifier_references_portee()` — le garde que la `028` §3 vient de **renforcer pour cette
classe précise** (Q-297) — reconnaît une clé composite à ceci : *l'une de ses colonnes
référençantes s'appelle `filiale_id`*. La `030` a nommé la sienne `traitement_filiale_id`.
Le garde ne voit donc pas la paire. Mesuré, sur les huit clés composites du schéma visant
une table mixte :

```
              conname               |  source   |    cible    |              colonnes_ref              | vue_par_le_garde
------------------------------------+-----------+-------------+----------------------------------------+------------------
 fk_document_etiquettes_coherence   | document… | documents   | document_id+filiale_id                 | t
 fk_document_referentiels_coherence | document… | documents   | document_id+filiale_id                 | t
 fk_traitement_mesures_traitement   | traiteme… | traitements | traitement_id+filiale_id               | t
 fk_document_etiquettes_portee      | document… | documents   | document_id+portee_groupe              | f
 fk_document_referentiels_portee    | document… | documents   | document_id+portee_groupe              | f
 fk_traitement_mesures_portee       | traiteme… | traitements | traitement_id+portee_groupe            | f
 fk_documents_traitement_coherence  | documents | traitements | traitement_id+traitement_filiale_id    | f
 fk_documents_traitement_portee     | documents | traitements | traitement_id+traitement_portee_groupe | f
```

Les trois « compagnes » en `portee_groupe` n'ont pas à être vues — elles sont ce que le
garde exige. **La paire livrée hier est la seule dont les DEUX moitiés sont invisibles.**

Et le garde mord parfaitement là où il voit — deux témoins joués :

```
MORD | M25 supprimer fk_document_etiquettes_portee (clé VUE) | reference_portee_sans_compagne
MORD | M26 compagne posée sur une AUTRE colonne (Q-297)      | reference_portee_sans_compagne
```

⚠️ **Le schéma livré, lui, est correct** : les quatre pièces sont en place et le
cloisonnement tient (§3.1, sondes P1 à P10). Le défaut est l'**absence de barrière contre la
régression** — c'est-à-dire précisément ce que le contrôle S16 mesure, et ce que trois
passages consécutifs ont vu se produire dans le correctif du passage d'avant.

**Remède.** Faire reposer `f_verifier_references_portee()` non sur le NOM de la colonne
référençante, mais sur **ce qu'elle référence** : toute clé composite dont une colonne vise
`<cible>.filiale_id` nullable, quel que soit son nom local. Le catalogue le dit (`confkey`).
Et ajouter un garde d'existence pour le déclencheur et les quatre contraintes de `030`, sur
le modèle de `f_verifier_publication_documents()`.

---

### 🟠 A-3 — Le renversement du registre RGPD s'arrête au type `text` : huit colonnes `jsonb` et une `inet` ne sont réclamées par personne

**Énoncé.** La `029` §3 renverse le balayage — *« toute colonne textuelle du schéma est
candidate, et le registre est la liste des décisions »* — et c'est un vrai progrès : une
table neuve, une colonne `varchar(120)`, une colonne `char(40)` font toutes rougir
(mutations M5, M30, M31, mordues). **Mais le renversement ne franchit pas la frontière du
texte**, et le registre est l'artefact qu'on présente à un DPO pour répondre à *« quelles
données personnelles votre outil détient-il ? »*.

Mesuré : **197 déclarations, 196 colonnes textuelles balayées.** La déclaration en trop est
la preuve du défaut :

```
   table_nom   |  colonne   |   nature    |  regime   | type_reel
---------------+------------+-------------+-----------+-----------
 journal_audit | adresse_ip | personnelle | conserver | inet
```

Une adresse IP **est** une donnée personnelle, les auteurs le savent — ils l'ont inscrite
**à la main**, parce que le balayage ne l'atteint pas. Et la colonne jumelle ne l'est pas :

```
         colonne          |        registre
--------------------------+-------------------------
 journal_audit.adresse_ip | personnelle / conserver
 sessions.adresse_ip      | NON DÉCIDÉE
```

**La même donnée, du même type, dans la table voisine.** Et `sessions.agent_utilisateur`
est, lui, déclaré `personnelle / supprimer` : la table `sessions` est **déclarée à moitié**.

Les huit colonnes `jsonb` ne sont **aucune** décidée :

```
           colonne           | decidee
-----------------------------+---------
 audits.constats             | f
 audits.items                | f
 history.metrics             | f
 journal_audit.valeurs_apres | f
 journal_audit.valeurs_avant | f
 prestataires.supply_chain   | f
 scenarios_pra.etapes_pca    | f
 scenarios_pra.etapes_pra    | f
```

Deux d'entre elles méritent d'être lues : `journal_audit.valeurs_avant` et `valeurs_apres`
portent, **par construction**, une copie des valeurs de la ligne écrite — donc de **toutes**
les colonnes que le registre déclare `personnelle`. Et `audits.constats` / `audits.items`
portent la grille et les constats d'un audit, rédigés en prose par un auditeur, quand
`audits.synthese` — la prose voisine — est déclarée `signaler`.

⚠️ **À décharge** : les quinze colonnes `date` du schéma sont toutes des dates métier
(échéance, date d'audit, date de test) — aucune date de naissance. Le trou est réel, il
n'est pas béant.

**C'est la forme exacte que Q-295 a fermée pour le texte** : *une liste écrite à la main
dont l'incomplétude réussit en silence*. Elle a été fermée pour `text`, `varchar` et
`bpchar`, et laissée ouverte pour tout le reste.

**Remède.** Étendre le balayage à **toutes** les colonnes, et déclarer l'exclusion des types
qui ne peuvent pas porter de personne (`integer`, `boolean`, `date`…) là où elle s'applique
— comme `f_verifier_domaines_textuels()` le fait déjà, avec élégance, pour les domaines.

---

### 🟠 A-4 — Un garde-fou EXÉCUTE désormais ce qu'il inspecte, sous l'identité du propriétaire — et la migration affirme le contraire

**Énoncé.** `f_contrainte_accepte()` évalue le prédicat réel d'une contrainte :

```sql
execute format('select (%s) from (select (jsonb_populate_record(null::%I, $1)).*) as t',
               v_predicat, p_table) into v_resultat using p_valeurs;
```

La migration `028` §2 déclare cette surface inerte :

> « ⚠️ **Ce qui est exécuté ne vient pas d'un utilisateur** : `pg_get_expr` rend
> l'expression telle que le catalogue la détient, et les valeurs témoins voyagent en
> PARAMÈTRE (`using`), jamais par concaténation. »

Les **valeurs** voyagent en paramètre — c'est vrai, je l'ai vérifié (contrôle S5). Mais
c'est le **prédicat** qui est concaténé et exécuté, et la phrase ne dit rien de ce qu'il
peut faire. Mesuré :

```
--- une fonction STABLE bloque-t-elle l'écriture ? ---
appel effectue
lignes ecrites depuis une fonction STABLE : 1

--- et via execute format, comme f_contrainte_accepte ---
f_contrainte_accepte rend : true
EFFET DE BORD : 1 ligne(s) ecrite(s)
```

**Le marqueur `stable` n'empêche pas l'écriture**, et `f_contrainte_accepte()` a exécuté un
prédicat qui écrit, puis a répondu `true` comme si de rien n'était.

**L'amplification, jouée de bout en bout.** `f_verifier_schema()` est `SECURITY DEFINER`,
détenue par `grc_proprietaire`, et son exécution est accordée à `grc_app` :

```
=== grc_app peut-il écrire colonnes_personnelles en direct ? (Q-291) ===
ERROR:  permission denied for table colonnes_personnelles
=== grc_app appelle f_verifier_schema() (SECURITY DEFINER) ===
4 anomalie(s)
=== la charge a-t-elle écrit, sous l'identité du PROPRIÉTAIRE ? ===
1 ligne(s) « __charge__ » dans colonnes_personnelles
```

Le rôle applicatif, à qui la migration `028` §1 vient précisément de retirer l'écriture sur
le registre de l'article 30, **y a fait écrire une ligne** en appelant le garde-fou.

⚠️ **Le modèle de menace, dit honnêtement.** Poser la charge exige un `alter table`, donc
les droits du **propriétaire**. Ce n'est donc **pas** une escalade depuis le rôle applicatif
seul : c'est une **frontière de confiance neuve**, introduite par cette livraison, que la
migration déclare inexistante sans l'avoir mesurée. C'est la leçon de Q-291 — *« une
migration a AFFIRMÉ une propriété au lieu de la POSER »* — retournée contre le §1 qui la
formule. ⚠️ À décharge : le sabotage est **bruyant** (4 anomalies), les autres témoins
l'ayant vu.

⚠️ Et la portée est plus large qu'il n'y paraît : `install.sh --diagnostic`, joué **en
root** sur la machine de production, passe par ce même chemin.

**Remède.** Avant d'évaluer, refuser tout prédicat dont une fonction référencée est
`provolatile = 'v'` — le catalogue le dit (`pg_depend` → `pg_proc.provolatile`) — et rendre
`null`, c'est-à-dire « je n'ai pas pu mesurer », ce que l'appelant traite déjà correctement.

---

### 🟠 A-5 — Dix-huit des quatre-vingt-deux justifications « vocabulaire clos ou valeur technique » ne sont adossées à AUCUNE contrainte

**Énoncé.** Quatre-vingt-deux déclarations du registre motivent leur `non_personnelle` par
la formule « Vocabulaire clos ou valeur technique […] Aucune saisie libre, aucune
personne. » **Dix-huit portent sur une colonne `text` nue, sans contrainte `check` ni
domaine** :

```
 approbations.version_objet · audits.perimetre · documents.version_document
 import_erreurs.colonne · journal_audit.version_application · mesure_catalogue.domaine
 migrations_schema.version · pieces_jointes.extension · pieces_jointes.resultat_analyse
 pieces_jointes.signature_virale · pieces_jointes.type_mime · pieces_jointes.version_piece
 processus.criticite · processus.rpo · processus.rto · referentiels_actifs.motif
 traitements.duree_conservation · traitements.transfert_hors_ue
```

La majorité est bénigne (un type MIME, un numéro de version). **Trois ne le sont pas**, et
la frontière que le registre s'est lui-même donnée les range ailleurs :

* **`audits.perimetre`** — justification : *« un périmètre — des filiales et des domaines,
  jamais une personne. **Aucune saisie libre.** »* C'est un `text` libre. Un périmètre
  d'audit se tape à la main (« périmètre : site de Toulouse, équipe de M. Dupont »), et la
  prose voisine `audits.synthese` est déclarée `signaler` ;
* **`referentiels_actifs.motif`** — le motif d'activation d'un référentiel : de la prose,
  comme `filiales.notes`, déclarée `signaler` ;
* **`traitements.transfert_hors_ue`** — quand `traitements.destinataires`, dans la même
  table, est déclaré `personnelle / signaler`.

⚠️ **Ce constat est de la classe de Q-291 : affirmer au lieu de poser.** Et le remède est
désormais à portée de main — la `028` a livré `f_contrainte_accepte()` : un garde peut
exiger qu'une déclaration invoquant « vocabulaire clos » porte **effectivement** une
contrainte qui refuse une valeur témoin.

⚠️ **À décharge, et il faut le dire** : le registre est soigné, et il sait nommer ses
propres limites. `filiales.email` écrit : *« Coordonnée de l'ÉTABLISSEMENT […] Si une
filiale y saisit l'adresse nominative de son RSSI, la décision devient fausse — c'est une
limite du registre, et elle est dite. »* Trois autres justifications que j'ai cherché à
prendre en défaut sont **exactes et vérifiables** : `pieces_jointes.chemin_stockage`
(`CHECK (chemin_stockage ~ '^([0-9a-f]{2}/)*[0-9a-f]{64}$')` — dérivé de l'empreinte, comme
annoncé), `sessions.motif_revocation` (contrainte `ck_sessions_revocation`) et
`prestataires.societe`.

---

### 🟠 A-6 — `pieces_jointes.nom_fichier` : la justification répond à une AUTRE question que celle qui est posée

**Énoncé.** La colonne porte **le nom de fichier saisi par l'utilisateur**, conservé tel
quel. Mesuré dans `src/pieces/index.ts`, fonction `normaliserNomFichier` : elle ne retire
que les composants de chemin (`split` sur `/` et `\`), les caractères de commande, et borne
à 255 signes. `CV_Jean_DUPONT.pdf` est donc stocké mot pour mot — et **renvoyé dans
l'en-tête `content-disposition`**.

Sa déclaration au registre est `non_personnelle`, **sans régime**, et sa justification est :

> « ⚠️ Le NOM du fichier, pas son contenu. Un fichier importé peut porter des données
> personnelles — elles sont alors dans les tables métier, décidées ligne par ligne
> ci-dessus. »

**Elle argumente sur le CONTENU du fichier, quand la colonne porte son NOM.** La question
posée — *un nom de personne peut-il figurer là ?* — n'est pas traitée. `imports.nom_fichier`
porte la même déclaration (« Idem ») et le même défaut.

**L'incohérence est interne à une seule table** : dans `pieces_jointes`, la `description` —
saisie libre où un nom peut figurer — est déclarée `signaler` ; le `nom_fichier`, saisie
libre où un nom figure **plus souvent encore**, n'est rien. La frontière que le registre
applique partout ailleurs s'arrête ici. Mesuré, par nom de colonne :

```
   colonne   | n  | signaler | sans_regime
-------------+----+----------+-------------
 titre       |  4 |        4 |           0
 commentaire |  6 |        6 |           0
 notes       |  6 |        5 |           0
 description | 12 |        9 |           3
 nom_fichier |  2 |        0 |           2
```

**Remède.** Deux lignes : `signaler` sur les deux `nom_fichier`. Le régime existe, il est lu
par la purge (`src/cycle/index.ts:786`), et c'est exactement le cas qu'il décrit.

---

### 🟡 A-7 — `f_domaine_accepte()` calcule `v_ok` et l'ignore

```sql
execute format('select ($1::%s) is not null', p_domaine) into v_ok using p_valeur;
return true;                     -- ← v_ok n'est jamais lu
```

Conséquence mesurée :

```
type_entite / valeur inventee -> false
type_entite / documents       -> true
type_entite / NULL            -> true    (v_ok vaudrait FALSE)
domaine inexistant            -> NULL
```

Le discriminant réel est l'échec de la conversion, ce qui est défendable ; mais une variable
calculée puis jetée dans un outil de mesure **neuf** est une intention perdue — et personne
ne s'en est aperçu, parce que rien ne l'appelle (**A-1**).

---

### 🟡 A-8 — `not valid` échappe au garde générique, et la réserve de `025` est désormais levable

**Deux moitiés.**

*(a)* Une contrainte reposée `not valid` conserve son prédicat, donc `f_contrainte_accepte()`
la voit juste — mais **les lignes déjà en base ne sont pas validées**, et le garde générique
ne le dit pas :

```
NE MORD PAS | M15  contrainte reposée NOT VALID
MORD        | M16b ck_journal_audit_action NOT VALID → vocabulaire_non_valide
```

`f_verifier_vocabulaire_journal()` vérifie `convalidated` ; `f_verifier_contraintes_eprouvees()`,
qui a vocation à couvrir la classe, ne le vérifie pas. La propriété a été perdue en
généralisant.

*(b)* **Une contrainte du schéma livré est effectivement `not valid`** — mesuré sur la
recette comme sur la base jetable :

```
      tbl       |               conname                | contype | convalidated
----------------+--------------------------------------+---------+--------------
 pieces_jointes | ck_pieces_jointes_en_vigueur_integre  | c       | f
```

C'est **délibéré et écrit** (`025` §1 : *« une migration ne peut pas parcourir une table
cloisonnée sans périmètre »*, et *« la validation a posteriori se fera filiale par filiale
[…] c'est inscrit au registre »*). ⚠️ **Mais le motif est tombé depuis** : les migrations
`029` et `030` ouvrent chacune par un **§0 qui pose le périmètre du groupe entier**,
précisément pour qu'un `add constraint` puisse balayer des tables cloisonnées. La technique
qui lève la réserve a été inventée deux migrations plus tard et **n'a pas été appliquée en
arrière**. *Une réserve écrite n'est pas une réserve traitée.*

---

### 🟡 A-9 — Le déclencheur de `030` est armé `update OF traitement_id`, et laisse un état incohérent atteignable

`create trigger … before insert or update **of traitement_id** on documents`. Une
modification qui ne nomme pas `traitement_id` ne le réveille pas. Mesuré :

```
=== P5c : document SANS traitement, poser traitement_filiale_id ===
UPDATE 1
P5c -> traitement_id=<null> traitement_filiale_id=FIL-AUD-A portee=false
```

Le document ne relève d'aucun traitement et porte pourtant la filiale d'un traitement — ce
que le commentaire de la colonne exclut (*« nulle quand ce traitement est de portée
Groupe »*).

⚠️ **Toutes les variantes DANGEREUSES sont rattrapées**, et je les ai jouées une par une
(§3.1) : viser la filiale voisine → `ck_documents_traitement_filiale` ; prétendre la portée
Groupe → `fk_documents_traitement_portee` ; prétendre une filiale sur une cible Groupe →
`fk_documents_traitement_coherence`. Et le chemin n'est pas atteignable par l'API, la
colonne étant déclarée `colonnesReservees`. **Ni fuite, ni escalade : une incohérence
résiduelle.** Elle est citée parce qu'un `update of` est une optimisation dont le coût est
exactement ce genre d'angle mort, et parce qu'elle disparaît en retirant deux mots.

---

### 🟡 A-10 — Quatre-vingt-une bases d'essai orphelines sur la grappe qui sert la recette, et le seul nettoyage documenté est sous interdit

Mesuré sur le cluster de production :

```
87 bases au total
81 bases « grc_essai_% » résiduelles
 3 bases « essai_% » ou « probe »
cluster total : 1124 MB          cyber_grc : 17 MB
```

**98,5 % du cluster est du résidu d'essais.** Le disque n'est pas en cause (217 Gio libres),
le cloisonnement non plus (la RLS y reste fermée — une lecture sans périmètre rend le refus
attendu). Ce qui est en cause, c'est que **rien ne le voit et rien ne le nettoie** :

* `install.sh --diagnostic` surveille `/var/lib/cyber-grc` et `/var/backups/cyber-grc`
  (« occupé à 5 % » pour chacun) — **pas** le répertoire de données PostgreSQL ;
* le banc supprime pourtant bien sa base, dans un `after()` : les orphelines viennent des
  **interruptions**, dont le mémo de projet documente deux, de 45 et 76 minutes ;
* le message d'erreur du banc prescrit le remède :
  `bash db/dev/preparer_base_dev.sh --purger-bases-essai` — **et le mémo de projet interdit
  ce script sans réserve sur cette machine** (« jamais `db/dev/preparer_base_dev.sh` ici »,
  constat Q-81).

⚠️ **L'interdit est plus large que le danger.** Lu ligne à ligne, le mode
`--purger-bases-essai` `exit 0` **avant** la section « rôles » : il ne ramène aucun mot de
passe à `dev`. La consigne, écrite pour une bonne raison, empêche le nettoyage qu'elle
prescrit par ailleurs.

Résidu adjacent : un rôle de connexion **`probe_app`** subsiste sur la grappe. Il ne peut
pas se connecter à `cyber_grc` (`has_database_privilege` → `f`) ni lire aucune de ses
tables, mais il peut se connecter à plusieurs bases résiduelles et à `postgres`. Personne ne
l'a déclaré.

---

### 🟡 A-11 — Aucun essai ne fait passer `documents.traitement_id` d'un export à une reprise

La liaison neuve traverse deux routes (`GET /api/export` → `POST /api/reprise`) et un ordre
d'écriture. **Cet ordre est juste**, et je l'ai vérifié plutôt que supposé :
`ordreEcriture()` trie sur `this.catalogue.clesEtrangeres`, **découvert au catalogue** par
une requête qui ne filtre rien, et il n'y a **aucun cycle** — `documents → traitements`
seulement. La reprise a donc absorbé `030` sans qu'une ligne de TypeScript change, ce qui
est exactement ce que le `CONVENTIONS.md` §19.5 promet.

Mais **rien ne l'éprouve** : aucun fichier de `test/` ne pose `traitement_id` dans une
charge de reprise. Or, avec l'ordre inverse, l'échec est franc et total — je l'ai joué :

```
=== simulation : documents PUIS traitements ===
ERROR:  Le traitement « TRT-R » n'existe pas dans votre périmètre.
CONTEXT:  PL/pgSQL function f_documents_traitement_portee() line 19 at RAISE
```

*« Aucun essai ne faisait passer la sortie d'une route dans l'entrée d'une autre »* est
l'énoncé littéral du constat Q-194. Il vaut de nouveau, sur la liaison livrée hier.

---

### 🟡 A-12 — Le défaut « interne » de `documents.confidentialite` n'est gardé par personne

```
NE MORD PAS | M37 le défaut « interne » retiré
```

La migration `027` annonce « `confidentialite` (4 niveaux, **défaut interne**) » et
`f_verifier_classification_documents()` mord bien sur le `not null` (M36) et sur les niveaux
(M13). Le **défaut**, lui, n'est vérifié par rien. La conséquence échoue du bon côté —
`not null` sans défaut refuse toute création qui ne nomme pas la colonne —, donc la sévérité
est basse ; mais la couche d'écriture **découvre** `avecDefaut` pour décider si un champ est
obligatoire, et un défaut qui disparaît rend obligatoire un champ que l'interface croit
facultatif.

---

## 3. Les sondes hostiles — trente-quatre, aucune ne franchit

### 3.1 Le chemin neuf `documents → traitements` (treize sondes)

| | Sonde | Attendu | Mesuré |
|---|---|---|---|
| P1 | document **LOCAL A** → traitement **GROUPE** (le sens ouvert par Q-294) | accepté | ✅ accepté, `traitement_filiale_id=<null>`, `portee=true` |
| P2 | document LOCAL A → traitement **LOCAL B**, session Groupe (cible **visible**) | refus | ✅ `ck_documents_traitement_filiale` |
| P3 | document **GROUPE** → traitement **LOCAL** (constat N-10) | refus | ✅ `ck_documents_traitement_groupe` |
| P4 | le client **envoie** `traitement_filiale_id` menteur à l'insertion | écrasé | ✅ écrasé → `<null>` |
| P5a | modifier `traitement_filiale_id` seul → filiale voisine | refus | ✅ `ck_documents_traitement_filiale` |
| P5b | modifier `traitement_filiale_id` seul → `null` (prétendre Groupe) | refus | ✅ `fk_documents_traitement_portee` |
| P5d | document déjà Groupe, poser sa propre filiale | refus | ✅ `fk_documents_traitement_coherence` |
| P6 | session **mono-filiale**, viser le traitement **invisible** de B | refus | ✅ `GRC07`, sans distinguer « absent » de « invisible » |
| P7 | insertion avec `traitement_filiale_id=B` et `traitement_id` nul | écrasé | ✅ `<null>` |
| P8 | `grc_app` désarme le déclencheur | refus | ✅ « must be owner of table documents » |
| P9 | `grc_app` pose `session_replication_role = replica` | refus | ✅ « permission denied to set parameter » |
| P10 | supprimer le traitement Groupe référencé par un doc local | refus | ✅ `restrict` |

⚠️ Seule **P5c** passe — voir **A-9**. Elle ne crée ni fuite ni escalade.

### 3.2 La prémisse de l'arbitrage Q-294, éprouvée

L'arbitrage de la `030` repose sur une affirmation : *« un traitement de portée Groupe n'est
effaçable que par l'administration Groupe, jamais par la filiale qui le désigne »*. Je l'ai
mesurée plutôt que crue, depuis une session de filiale ordinaire :

```
--- La filiale VOIT-ELLE le traitement Groupe ?        vu : 1
--- Peut-elle en CRÉER un de portée Groupe ?           ERROR: new row violates row-level security policy
--- Peut-elle le SUPPRIMER ?                           DELETE 0   → 1 ligne(s) restante(s)
--- Peut-elle le MODIFIER ?                            UPDATE 0   → nom inchangé
--- Peut-elle le faire BASCULER vers sa filiale ?      UPDATE 0   → filiale_id=<null>
```

**La prémisse tient.** L'ouverture du sens `local → Groupe` est fondée.

### 3.3 Le verrou d'approbation refait (dix sondes)

```
--- V1  : renommer id sous couvert d'anonymisation (le cas de Q-299)  ERROR: GRC02
--- V2  : changer statut approuve -> refuse                           ERROR: GRC02
--- V3  : changer commentaire                                         ERROR: GRC02
--- V4  : antidater date_decision                                     ERROR: GRC02
--- V5  : changer empreinte_objet                                     ERROR: GRC02
--- V6  : anonymisation LEGITIME            UPDATE 1 → « personne retirée » / acteur_id=<null>
--- V7  : SUBSTITUTION de nom (« Paul Martin »)                       ERROR: GRC02
--- V8  : changer acteur_id vers quelqu'un d'autre                    ERROR: GRC02
--- V9  : SUPPRIMER la decision                                       ERROR: GRC02
--- V10 : une etape NON TRANCHEE se supprime      DELETE 1 → supprimee : true
```

**Q-299 est fermé**, et la barrière ne casse pas le produit : V6 et V10 passent. La
comparaison en bloc `to_jsonb(new) - <liste>` a été sondée sur les deux angles suggérés :
l'ordre des clés est sans effet (`jsonb` normalise — mesuré `true`), et la table
`approbations` ne porte **aucune** colonne `numeric`, `float` ou `json` (mesuré : 0). ⚠️ Une
réserve à inscrire pour l'avenir, puisque la promesse est *« une colonne ajoutée demain est
protégée d'office »* : `'{"a":1.0}'::jsonb = '{"a":1.00}'::jsonb` rend **`true`** (mesuré).
Une colonne `numeric` ajoutée demain serait comparée à l'égalité numérique, non à l'identité
de son écriture.

### 3.4 Les étiquettes documentaires (six sondes)

```
--- E1 : meme etiquette en CASSE differente   ERROR: Ce document porte déjà l'étiquette « rgpd », à la casse près.
--- E2 : insertion avec espaces               E2 -> [Audit 2026]        (normalisée)
--- E3 (Q-298) : MODIFICATION non normalisée  E3 -> [deux espaces]      (normalisée AUSSI à la modification)
--- E4 (Q-298) : MODIFICATION vers une casse existante   ERROR: … à la casse près.
--- E5 : etiquette avec virgule               ERROR: ck_document_etiquettes_valeur
--- E6 : etiquette vide                       ERROR: Une étiquette vide (ou faite d'espaces) ne classe rien.
```

**Q-298 est fermé** : la normalisation est armée à la modification comme à l'insertion, et
l'unicité insensible à la casse mord des deux côtés.

### 3.5 Les chemins détournés vers le registre RGPD (Q-291)

```
grc_app          : select
grc_lecture      : select
grc_proprietaire : select,INSERT,UPDATE,DELETE,TRUNCATE
```

* **appartenance de rôle** : aucune (`pg_auth_members` vide pour les rôles `grc%`) ;
* **fonction `security definer`** touchant la table et exécutable par `grc_app` : aucune ;
* **`alter default privileges`** : `grc_app=arwd` **est toujours en vigueur** pour les
  tables futures — mais la table neuve qui en hériterait **fait rougir** (M3 mordue :
  `table_sans_filiale_non_rangee` + trois anomalies RLS). La cause racine subsiste, la
  classe est fermée bruyamment.

**Q-291 est fermé**, sur mon périmètre — sous la réserve de **A-4**, qui est un autre chemin.

---

## 4. Les mutations jouées — **9 sur 43 ne mordent pas**

> Deux mutations supplémentaires (M11, M12) sont des **essais inverses** : elles doivent
> rester MUETTES, et elles le sont. Elles ne comptent pas dans le ratio.
> Une mutation de la **déclaration** d'un garde — ranger `colonnes_personnelles` parmi les
> tables « écrites par l'application » — a été jouée et **n'est pas comptée** : modifier la
> décision humaine que le garde matérialise n'est pas la contourner. La RLS de ces quatorze
> tables a été vérifiée séparément (14/14 activées **et** forcées, 3 politiques d'écriture
> chacune), et le retrait de la RLS sur l'une d'elles fait rougir (M46).

### Celles qui mordent (34)

| # | Mutation | Ce qui rougit |
|---|---|---|
| M1 | `grant insert on colonnes_personnelles to grc_app` | `registres_techniques → registre_reinscriptible` |
| M2 | idem pour `grc_lecture` | idem |
| M3 | table neuve **sans** `filiale_id` | `table_sans_filiale_non_rangee` + 3 RLS |
| M4 | `colonnes_personnelles` retirée de `v_registres` (corps réel, repris de `pg_get_functiondef`) | `table_sans_filiale_non_rangee` |
| M5 | table neuve **avec** `filiale_id` et colonnes textuelles | 2 × `colonne_personnelle_non_decidee` + 4 RLS |
| M6 | `ck_documents_confidentialite` vidée par `… or … is not null` **(la mutation de Q-292)** | `contrainte_laisse_passer_l_interdit` |
| M7 | la même vidée par `… or true` | idem |
| M8 | `ck_pieces_jointes_en_vigueur_integre` vidée | idem |
| M9 | `ck_journal_audit_action` vidée | idem + 2 × `vocabulaire_journal` |
| M10 | « en validation » retiré de `ck_documents_statut` | `contrainte_refuse_une_valeur_legitime` + `publication_documents` |
| M13 | contrainte éprouvée **supprimée** | `contrainte_non_eprouvable` + `classification_documents` |
| M14 | contrainte éprouvée **renommée** | idem |
| M16b | `ck_journal_audit_action` reposée `not valid` | `vocabulaire_non_valide` |
| M18 | déclencheur `030` armé `replica` | `armement → declencheur_desarmable` |
| M19 | déclencheur `030` `disable` | idem |
| M24 | corps du déclencheur `030` vidé | `chemin_recherche → search_path_non_fige` |
| M25 | `fk_document_etiquettes_portee` supprimée (clé **vue**) | `reference_portee_sans_compagne` |
| M26 | compagne posée sur une **autre** colonne (Q-297) | idem |
| M27 | `risque_catalogue.id` repassée en `text` nu (Q-310) | `identifiant_sans_domaine` + registre |
| M28 | colonne `<x>_id` neuve en `text` nu | idem |
| M29 | domaine textuel neuf non rangé | `domaine_textuel_non_range` |
| M30 | colonne `varchar(120)` neuve **(Q-296)** | `colonne_personnelle_non_decidee` |
| M31 | colonne `char(40)` neuve | idem |
| M32 | colonne supprimée → déclaration orpheline | `declaration_personnelle_orpheline` |
| M34 | colonne **booléenne** déclarée `signaler` **(Q-300)** | `declaration_personnelle_de_mauvais_type` |
| M35 | registre vidé | **196** × `colonne_personnelle_non_decidee` |
| M36 | `documents.confidentialite` rendue nullable | `classification_absente_ou_facultative` |
| M38 | `documents.donnees_personnelles` rendue nullable | idem |
| M39 | table `document_etiquettes` supprimée | 6 anomalies, 4 contrôles distincts |
| M40 | index `uq_document_etiquettes_casse` supprimé | `unicite_casse_absente` |
| M41 | valeur retirée du domaine `type_entite` | `declencheurs_pieces → valeur_sans_porteur` |
| M44 | registre déclaré et **supprimé** (sens 2) | `registre_declare_introuvable` + 3 |
| M45 | table « écrite par l'application » supprimée (sens 4) | `table_rangee_introuvable` + 3 |
| M46 | `no force row level security` sur une table du groupe | `couverture_rls → force_absente` |

### Celles qui NE mordent PAS (9) — le chiffre le plus utile du rapport

| # | Mutation | Conséquence mesurée | Constat |
|---|---|---|---|
| **M42** | domaine `type_entite` **vidé** par `… or true` | 0 anomalie ; le lien polymorphe des pièces jointes n'est plus borné | **A-1** |
| **M43** | domaine `id_metier` **vidé** par `… or true` | 0 anomalie ; `risques` accepte `''` et `'  RSK-1  '` — **Q-310/Q-194 rouverts** | **A-1** |
| **M17** | déclencheur `trg_documents_traitement_portee` **supprimé** | 0 anomalie | **A-2** |
| **M20** | `ck_documents_traitement_groupe` supprimée | 0 anomalie ; **N-10 rouvert** (mesuré C20) | **A-2** |
| **M21** | `ck_documents_traitement_filiale` supprimée | 0 anomalie ; **lien inter-filiales** (mesuré C21) | **A-2** |
| **M22** | `fk_documents_traitement_coherence` supprimée | 0 anomalie | **A-2** |
| **M23** | `fk_documents_traitement_portee` supprimée | 0 anomalie ; `traitement_id` ne référence plus rien (mesuré C23) | **A-2** |
| **M15** | contrainte reposée `not valid` | 0 anomalie ; les lignes existantes ne sont plus validées | **A-8** |
| **M37** | défaut `'interne'` retiré de `documents.confidentialite` | 0 anomalie ; échoue du bon côté | **A-12** |

### Les essais inverses (2) — ils doivent rester muets, et ils le sont

| # | Mutation | Attendu | Mesuré |
|---|---|---|---|
| M11 | `ck_documents_confidentialite` réécrite en `= any (array[…])` | muette | ✅ 0 anomalie |
| M12 | un cinquième niveau légitime ajouté | muette | ✅ 0 anomalie |

**Sept des neuf mutations qui ne mordent pas visent les livraisons du jour** — les domaines
que `028` prétend éprouver, et les quatre barrières de `030`. C'est le **quatrième passage
consécutif** où le défaut principal vit dans le correctif accepté au passage d'avant.

> **Comparaison honnête.** Le 8ᵉ passage a rendu **10 sur 33** sur ce périmètre (14 sur 41
> au total). Ce passage rend **9 sur 43** : le dispositif progresse en proportion — et la
> concentration des manques sur le neuf, elle, ne progresse pas.

---

## 5. Ce qui tient — chiffré, et il faut le lire

Un rapport qui ne dit que le mauvais cesse d'être lu. Ce passage a mesuré **beaucoup de
choses justes**, et plusieurs sont des fermetures nettes de constats du 8ᵉ passage.

| | Mesuré |
|---|---|
| **Cloisonnement** | `verifier_cloisonnement.sql` **sous `grc_app`** → **110 contrôles, 110 réussis, 0 échoué** ; **34 sondes hostiles de ma main**, **aucune ne franchit** ; **0 fuite entre filiales** |
| **RLS** | **52 tables, 52 activées, 52 forcées**, 208 politiques ; `grc_app` sans `bypassrls`, non propriétaire |
| **Garde-fous** | **30 découverts, 30 joués, 30 consignés**, **0 anomalie** sur la recette comme sur une base neuve |
| **Le chemin de déploiement ÉCHOUE vraiment** | base sabotée → `migrate.mjs` **code de retour 7**, avec le détail nommé ; `install.sh` traite le code 7 par `echec`, et `--diagnostic` par `diag_bloquant` |
| **Q-291 fermé** | `grc_app` et `grc_lecture` n'ont plus que `select` ; aucune appartenance de rôle, aucune fonction `security definer` détournable ; une table neuve qui hériterait des privilèges par défaut **fait rougir** |
| **Q-292 fermé** | les deux mutations sournoises que l'auditeur précédent avait fait passer (`or … is not null`, `is not null and is not null`) **mordent maintenant toutes les deux**, et une réécriture **légitime** reste muette (M11, M12) — le garde n'est pas seulement bruyant |
| **Q-294 fermé, et sa prémisse éprouvée** | le sens `local → Groupe` est ouvert (P1) ; les trois sens dangereux restent fermés (P2, P3, P5a/b/d) ; une filiale ne peut ni créer, ni effacer, ni modifier, ni s'approprier un traitement de portée Groupe (§3.2) |
| **Q-296 fermé** | `f_colonnes_textuelles()` **regarde le type, pas son texte** : `varchar(120)` et `char(40)` sont réclamés au registre (M30, M31) — le défaut était **plus large** que ce que le constat avait mesuré, et le correctif le couvre |
| **Q-297 fermé** | la compagne doit protéger **la même colonne** : M26 mord, et M25 (témoin) aussi |
| **Q-298 fermé** | la normalisation des étiquettes est armée à la **modification** comme à l'insertion (E3), et l'unicité à la casse mord des deux côtés (E1, E4) |
| **Q-299 fermé** | dix sondes : huit refus justes, **deux acceptations légitimes** — la barrière ne casse pas le produit |
| **Q-300 fermé** | une déclaration dont le type dément le régime fait rougir (M34) |
| **Q-293 fermé** | le régime `signaler` **est lu** par la purge (`src/cycle/index.ts:786`) — il ne vit plus seulement dans la base |
| **Q-310 fermé sur l'instance** | `risque_catalogue.id` porte le domaine, et une colonne d'identifiant qui le perd fait rougir (M27, M28) — ⚠️ la **classe** reste ouverte par **A-1** |
| **`f_contrainte_accepte()` : la sûreté d'injection** | nom de table injecté → `NULL` sans dommage ; valeur injectée → `false`, paramètre en `using` ; `not null` (contype `n`), contrainte absente, table absente, témoin de mauvais type → chacun rendu **honnêtement**, et l'appelant traite `null` comme une anomalie |
| **Escalade par `SECURITY DEFINER`** | fermée à la source : `grc_app` **n'a pas `CREATE` sur le schéma `public`** (mesuré `f`), donc il ne peut pas planter une fonction `f_verifier_<x>()` que le point d'appel jouerait sous l'identité du propriétaire |
| **`f_verifier_schema()` lui-même** | il dit **aussi** quand il en trouve moins : registre absent, registre vide, contrôle disparu, contrôle re-signé, aucun contrôle découvert — cinq cas distincts, et le pire (« zéro contrôle ») est nommé |
| **S14** | trois migrations, trois `begin`/`commit` uniques ; `030` pose ses cinq pièces dans une seule transaction ; l'ordre d'écriture de la reprise est **dérivé du catalogue** et a absorbé `030` sans une ligne de code (aucun cycle, mesuré) |
| **Les chiffres de la documentation** | **tous vérifiés justes** : 52 tables, 208 politiques, 30 migrations, 30 garde-fous consignés, 0 anomalie, 110/110 au cloisonnement, `--diagnostic` **14 conformes / 1 réserve / 0 bloquant**, publication **81 fichiers identiques au dépôt** |
| **Banc** | `test/base` → **295 essais, 295 passés** (26,3 s). Banc complet : voir §6 |
| **La qualité du registre RGPD** | 197 décisions, **chacune justifiée** ; quatre familles cohérentes ; le régime `signaler` appliqué à 42 colonnes ; trois justifications que j'ai cherché à prendre en défaut se sont révélées **exactes et vérifiables**, et `filiales.email` **nomme sa propre limite** |

---

## 6. Le banc

`node --test --test-concurrency=1 "test/**/*.test.mjs"`, joué à la révision `bdb1e40`.

```
# tests 1907
# suites 496
# pass 1907
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 850155.812833
```

**1907 essais, 1907 passés, 0 échec, 0 annulé, 0 sauté** — en 14 min 10 s, concurrence 1.
**Le chiffre annoncé par `backend/README.md` §8 et par le `CHANGELOG.md` est exact.** La
famille `test/base` seule, rejouée à part : **295 essais, 295 passés** en 26,3 s.

⚠️ **Et c'est précisément le sujet de ce rapport** : *un banc vert mesure ce qu'il regarde,
jamais ce qu'il ne regarde pas*. Les neuf mutations du §4 qui ne mordent pas ont toutes été
jouées **sur un schéma dont ce banc était vert**.

---

## 7. Recommandation

**Le périmètre A est refusé**, sans bloquant et **sans fuite entre filiales**.

**Tri en trois classes :**

| Classe | Constats |
|---|---|
| **Bloque le fonctionnement** | **aucun** |
| **Fuite ou perte de données entre filiales** | **aucun** — 110/110, 34 sondes hostiles sans effet. ⚠️ **A-2** *ouvrirait* une fuite si une migration future retirait une ligne, mais **le schéma livré ne fuit pas** |
| **Le reste** | **6 majeurs** : A-1, A-2, A-3, A-4, A-5, A-6 — **6 mineurs** : A-7, A-8, A-9, A-10, A-11, A-12 |

**Les deux à traiter en premier, et ils se traitent ensemble** : **A-1** et **A-2** sont le
même défaut sous deux angles — *un outil de mesure livré et non branché* (A-1), *un garde
qui reconnaît un nom de colonne au lieu de mesurer ce que la clé référence* (A-2). C'est le
**motif que la migration `028` porte en titre**, reproduit dans la migration elle-même et
dans sa sœur du même jour. Tant que ce motif se reproduit à l'intérieur du correctif qui le
nomme, la porte ne peut pas être franchie : *ce n'est pas le produit qui est en cause, c'est
le dispositif*, pour le quatrième passage consécutif.

**A-4** mérite d'être lu avant d'être classé : il ne se referme pas, il se **déclare**. Un
garde-fou qui exécute ce qu'il inspecte est un choix défendable — c'est même le seul moyen
de ne pas être trompé par un `or true` — mais il ouvre une frontière de confiance que la
migration nie en une phrase. **Écrire cette frontière, et refuser les prédicats volatils,
coûte moins que de la découvrir au passage suivant.**

**A-3, A-5 et A-6** sont trois trous du **même artefact**, celui qu'on présente à un DPO.
Ils se ferment pour quelques lignes chacun, et l'un d'eux — `sessions.adresse_ip` non
déclarée quand `journal_audit.adresse_ip` l'est — est de ceux qu'un lecteur extérieur trouve
en trente secondes.
