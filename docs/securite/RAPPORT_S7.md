# RAPPORT — PORTE DE SÉCURITÉ **S7**

**Lot examiné** : **L11 — traduction anglaise des catalogues**. Rien d'autre.
(L14 — documentation — est instruit par un autre auditeur ; ce rapport n'y touche pas.)

**Date** : 09/09/2026 · **Révision mesurée** : `ecbb226` · **Auditeur** : agent SECU indépendant,
auteur d'aucune des lignes examinées.

**Critère, cité mot pour mot** — `docs/PLAN_EXECUTION.md` §3 (ligne 833) :

> **Porte S7** : relecture métier, paraphrase délibérée (droit d'auteur, `PLAN_SERVEUR` §4.2).

`docs/PLAN_SERVEUR.md` §4.2, cadrage validé avec le client :

> **Droit d'auteur.** Les textes français sont des reformulations originales, ce qui protège le
> produit. En anglais, une reformulation fidèle d'un intitulé de l'Annexe A converge très vite
> vers le titre officiel ISO — qui est précisément le texte protégé. Traduire en **paraphrasant
> délibérément**, jamais littéralement.

⚠️ **Ne pas confondre deux « S7 ».** La **porte** S7 est celle-ci. Le **contrôle** S7 de la
grille de sécurité (`docs/PLAN_EXECUTION.md` ligne 926) est un tout autre sujet — « le droit
d'export est distinct de la lecture ». Les constats Q-89 et Q-242 portent « contrôle S7 en
échec » et **ne concernent pas cette porte** (constat Q-262 ci-dessous).

---

## 1. VERDICT

# ❌ **REFUSÉE**

**Motif, en une phrase :** la propriété que cette porte existe pour vérifier — *paraphraser
délibérément, jamais littéralement* — **n'est pas tenue pour les deux catalogues ISO**, qui sont
précisément les seuls dont le texte est vendu sous licence, et **les fichiers de traduction le
déclarent eux-mêmes par écrit** (« reprendre les intitulés officiels était juste », « vérifiés
contre plusieurs sources concordantes », « *Networks security* (pluriel, **tel quel**) »).

Deux aggravations indépendantes : le produit **affiche en anglais** que ces titres sont
reformulés alors qu'ils ne le sont pas ; et la prémisse du §4.2 — « les textes français sont des
reformulations originales » — est **fausse pour AirCyber**, dont les 234 questions françaises
sont l'export CSV du questionnaire BoostAerospace, scories de transcription comprises.

**Ce que ce verdict ne dit pas.** Le travail de traduction lui-même est, sur le fond, **de très
bonne qualité** : couverture mécanique irréprochable, terminologie de métier juste, arbitrages
écrits et souvent excellents (§5 ci-dessous). Le défaut n'est pas la compétence du traducteur ;
c'est que **la politique appliquée aux deux catalogues ISO est exactement l'inverse de celle que
le client a validée** — et qu'elle a été appliquée en toute conscience, en le disant.

---

## 2. COMPTE DES CONSTATS

| Gravité | Nombre | Numéros |
|---|---|---|
| 🛑 **Bloquant** | **3** | Q-252, Q-253, Q-255 |
| 🟠 **Majeur** | **5** | Q-254, Q-256, Q-257, Q-258, Q-259 |
| 🔵 **Mineur** | **4** | Q-260, Q-261, Q-262, Q-263 |
| **Total** | **12** | Q-252 → Q-263 |

**Classe « fuite ou perte de données » : 0.** Aucun constat de ce rapport ne touche le
cloisonnement, l'exfiltration ou la perte de saisie. L11 n'écrit rien en base et n'ajoute aucune
route ; sa surface est un jeu de chaînes statiques servies au navigateur.

**Régime juridique, catalogue par catalogue — un verdict global aurait été faux :**

| Catalogue | Régime | Verdict droit d'auteur |
|---|---|---|
| **ISO/IEC 27002:2022** (Annexe A, 93) | norme vendue sous licence, texte protégé | 🛑 **Q-252** — intitulés officiels repris |
| **ISO/IEC 27001:2022** (chap. 4-10, 30) | idem | 🛑 **Q-253** — intitulés de clause repris, et la reformulation française **supprimée** |
| **NIS2** (10) | directive (UE) 2022/2555, acte législatif de l'Union, 24 versions authentiques, réutilisation libre | ✅ **conforme au droit, en écart assumé et motivé avec le §4.2** — voir §5 |
| **DORA** (15) | règlement (UE) 2022/2554, idem | ✅ **idem** |
| **ANSSI Hygiène** (42) | **Licence Ouverte v2.0 (Etalab)** — réutilisation, adaptation et exploitation commerciale libres, **sous condition d'attribution** | ✅ **le meilleur fichier du lot** — il refuse explicitement de recopier les titres officiels et dit pourquoi |
| **AirCyber / BoostAerospace** (234) | questionnaire d'un consortium privé, aucune licence trouvée dans le dépôt | 🛑 **Q-255** — le français est **repris tel quel**, l'anglais en est une **œuvre dérivée** |

---

## 3. LES CONSTATS

### 🛑 Q-252 — Les 93 titres anglais de l'Annexe A **sont les intitulés officiels d'ISO/IEC 27002:2022**, pas une paraphrase. Le fichier le déclare.

**Énoncé.** `cyber-gouvernance_V4/js/data/en/ref_iso27002.js` rend en anglais les 93 mesures de
l'Annexe A **en reprenant les intitulés de la norme**, c'est-à-dire exactement le texte que le
§4.2 nomme « précisément le texte protégé » et interdit d'atteindre. Ce n'est pas une
convergence accidentelle d'un traducteur consciencieux : c'est une **méthode revendiquée**.

**Preuve n° 1 — l'aveu écrit, dans le fichier même** (`en/ref_iso27002.js`, lignes 21-27) :

> `// 1. TERMINOLOGIE NORMATIVE, PAS TRADUCTION DU FRANÇAIS. ISO/IEC 27002:2022 a`
> `//    des intitulés anglais officiels, et c'est ce vocabulaire qu'un auditeur`
> `//    lit : […] Les intitulés ont été vérifiés`
> `//    contre plusieurs sources concordantes plutôt que devinés — d'où`
> `//    « Physical entry » (et non le « Physical entry controls » de 2013),`
> `//    « Networks security » (pluriel, tel quel), « Supporting utilities ».`

« Vérifiés contre plusieurs sources concordantes » et « **tel quel** » décrivent une
**reproduction**, pas une paraphrase. Le fichier voisin le confirme en toutes lettres
(`en/ref_iso27001_smsi.js`, lignes 22-25) :

> `//    ÉCART AVEC en/ref_iso27002.js, VOULU. Pour l'Annexe A, reprendre les`
> `//    intitulés officiels était juste : ce sont des NOMS DE MESURES, distincts`
> `//    deux à deux, et l'auditeur les cherche mot pour mot.`

**Preuve n° 2 — la forme de l'anglais trahit la source.** Deux titres ne sont pas de l'anglais
qu'un traducteur produit à partir du français :

| Code | FR (source du produit) | EN livré | Ce que la forme démontre |
|---|---|---|---|
| **7.2** | Contrôle des accès physiques | **Physical entry** | l'anglais est **plus court que le français** et incomplet hors contexte. Une traduction du FR donne « Physical access control ». « Physical entry » n'existe que comme intitulé de la norme 2022 — et le commentaire le dit, en opposant la version 2013 |
| **8.20** | Sécurité des réseaux | **Networks security** | pluriel **agrammatical** en anglais. Toute traduction du FR donne « Network security ». Le commentaire écrit « (pluriel, **tel quel**) » |

**Preuve n° 3 — l'anglais diverge du français vers un troisième texte.** Une traduction rend le
français ; ici l'anglais **ajoute ce que le français n'a pas** :

| Code | FR | EN | Écart |
|---|---|---|---|
| 5.9 | Inventaire des actifs | Inventory of **information and** assets | l'anglais élargit |
| 5.34 | Protection des données personnelles | **Privacy and protection of PII** | « privacy », « PII » n'ont aucun antécédent français |
| 5.30 | Continuité TIC | **ICT readiness for business continuity** | quatre mots ajoutés |
| 7.11 | Services supports (utilities) | **Supporting utilities** | |
| 5.2 | Rôles et responsabilités sécurité | **Information security** roles and responsibilities | |

**Preuve n° 4 — la règle du dépôt est violée**, indépendamment du §4.2.
`js/data/referentiels.js` ligne 14 : « *NB : on n'embarque **JAMAIS** le texte intégral des
normes (reformulations originales courtes + identifiant de clause + titre court uniquement)* ».

**Introduit par L11 ou préexistant ?** **Introduit par L11.** Le catalogue français est une
abréviation de son côté (28 signes de moyenne, max 47) et ne converge pas ; c'est la traduction
qui va chercher la norme.

**Volume concerné** : **93 intitulés** + les 4 noms de thèmes (« Organizational controls »,
« People controls », « Physical controls », « Technological controls », eux aussi ceux d'ISO).

**Ce qu'il faudrait faire** — *non fait, ce n'est pas le rôle de la porte.* Réécrire les 93
titres **depuis le français**, comme le fichier ANSSI a su le faire, en acceptant qu'ils
diffèrent de la norme. L'argument « l'auditeur les cherche mot pour mot » est **faux dans ce
produit** : l'auditeur cherche par **numéro de clause** (`5.9`, `8.20`), qui est affiché, stable,
non protégé, et qui est déjà la clé de stockage des évaluations. Le titre n'est pas la poignée de
recherche ; le code l'est.

**Ce que je n'ai PAS pu mesurer** : je n'ai pas le texte officiel d'ISO/IEC 27002:2022 sous la
main et **je ne l'ai pas consulté**. Je ne peux donc pas produire un diff titre-à-titre contre la
norme, et je ne l'affirme pas. Ce que j'établis repose **entièrement sur ce que le dépôt déclare
de lui-même** (preuve n° 1), sur la forme interne de l'anglais (preuve n° 2) et sur la divergence
mesurable FR→EN (preuve n° 3). C'est suffisant pour refuser la porte : le lot revendique par
écrit la méthode que le §4.2 interdit.

---

### 🛑 Q-253 — Chapitres 4 à 10 d'ISO/IEC 27001 : L11 a **supprimé** la reformulation française et l'a remplacée par l'intitulé de clause de la norme.

**Énoncé.** Le mécanisme est différent de Q-252 et plus grave, parce qu'il est **régressif** : le
catalogue français avait délibérément transformé les intitulés de clause (des substantifs) en
**phrases d'action**, ce qui est la reformulation originale que le §4.2 dit protectrice. La
traduction anglaise **défait ce travail** et restitue le substantif de la norme.

**Preuve — huit cas, tous dans `en/ref_iso27001_smsi.js` :**

| Code | FR (phrase d'action, reformulée) | EN livré | Ligne |
|---|---|---|---|
| 7.1 | Fournir les ressources nécessaires au SMSI | **Resources** | 109 |
| 7.2 | Assurer les compétences des personnes | **Competence** | 110 |
| 7.3 | Sensibiliser le personnel | **Awareness** | 111 |
| 7.4 | Organiser la communication interne et externe | **Communication** | 112 |
| 7.5.3 | Maîtriser la diffusion et la protection des documents | **Control of documented information** | 115 |
| 9.2.1 | Réaliser des audits internes | **Internal audit** | — |
| 9.3.1 | Réaliser des revues de direction | **Management review** | — |
| 10.2 | Traiter les non-conformités et mener les actions correctives | **Nonconformity and corrective action** | — |
| 6.1.1 | Planifier les actions face aux risques et opportunités | **Actions to address risks and opportunities** | — |

**Double défaut, et le second est un défaut de produit, pas de droit.**

1. **Droit d'auteur** : « Resources », « Competence », « Awareness », « Communication » sont les
   intitulés de clause d'ISO/IEC 27001:2022. Le français ne les portait pas ; l'anglais les
   rétablit. C'est la convergence que le §4.2 décrit, réalisée à l'envers du sens de la
   traduction.
2. **Relecture métier** : dans une grille d'auto-évaluation, une ligne dont le titre est le seul
   mot **« Communication »** ne dit pas ce qu'il faut évaluer. Or **c'est précisément l'argument
   que l'en-tête du fichier avance pour justifier de ne PAS reprendre les intitulés** aux
   chapitres 4-10 (lignes 25-30) : « *ISO intitule « General » les clauses 6.1.1, 7.5.1, 9.2.1 ET
   9.3.1 — quatre lignes du tableau porteraient le même titre, et aucune ne se lirait.* » Le
   fichier a vu le problème pour « General », l'a résolu pour « General », et **l'a reproduit
   pour huit autres clauses** en écrivant « le français les a nommées ; l'anglais les nomme
   aussi, avec les MOTS de la norme ». Les nommer « avec les mots de la norme », c'est ne pas les
   nommer.

**Ce qui tient malgré tout, et qui est du bon travail** : les clauses 6.1.2/8.2 et 6.1.3/8.3
gardent la distinction *définir le processus* / *l'exécuter* (« …process » vs « Performing… » /
« Implementing… »), et l'en-tête explique pourquoi — sans elle, « un RSSI évaluerait deux fois la
même chose ». Cette page-là de raisonnement est exemplaire.

**Introduit par L11 ?** **Oui, entièrement.** Le français ne portait aucun de ces substantifs.

**Ce qu'il faudrait faire.** Traduire les phrases d'action françaises en phrases d'action
anglaises — « Provide the resources the ISMS needs », « Keep people competent », etc. Cela
règle le droit d'auteur **et** la lisibilité du tableau d'un seul geste.

---

### 🛑 Q-255 — La prémisse du §4.2 est **fausse pour AirCyber** : le français n'est pas une reformulation, c'est l'export CSV du questionnaire — et l'anglais en est une œuvre dérivée.

**Énoncé.** Le §4.2 fonde toute la stratégie de droit d'auteur sur une phrase : « *Les textes
français sont des reformulations originales, ce qui protège le produit.* » Pour le plus gros des
six catalogues — **234 questions, 55 % du volume d'exigences** — cette phrase est fausse, et le
dépôt le dit dans les cinq premières lignes du fichier concerné.

**Preuve n° 1 — la déclaration du fichier français** (`js/data/ref_aircyber.js`, lignes 4-6) :

> `// Référentiel AirCyber (BoostAerospace) — questionnaire de maturité de la filière`
> `// aéronautique. Généré depuis l'export CSV du questionnaire, enrichi du mapping`
> `// niveau (Bronze/Argent/Or) / priorité / domaine CL0-CL6 (fichier de suivi fourni).`

**« Généré depuis l'export CSV du questionnaire »** — pas *reformulé à partir de*. Et à la
différence de `ref_anssi.js` (ligne 5 : « *Contenu = REFORMULATIONS ORIGINALES COURTES + aide
pédagogique (aucun texte de norme copié)* »), **ce fichier ne revendique aucune reformulation**.

**Preuve n° 2 — la mesure, qui tranche seule.** Longueur des intitulés d'exigence, par catalogue
(mesuré sur les 424 exigences) :

```
anssi-hygiene      n= 42  moyenne= 46 signes  max= 65
iso-27002-2022     n= 93  moyenne= 28 signes  max= 47
nis2-art21         n= 10  moyenne= 41 signes  max= 64
dora               n= 15  moyenne= 31 signes  max= 41
iso27001-smsi      n= 30  moyenne= 42 signes  max= 60
aircyber           n=234  moyenne=164 signes  max=587      ← 4× les autres
```

Cinq catalogues tiennent la règle du dépôt (« *reformulations originales COURTES* »).
Le sixième est **quatre fois plus long**, avec **5 questions de plus de 400 signes**.

**Preuve n° 3 — les scories de transcription, qui ne survivent qu'à une reprise brute.**
Mesuré sur les 234 titres français : **188 doubles espaces ou espaces avant ponctuation**,
**10 phrases collées** sans séparateur, **22 questions sans ponctuation finale**. Exemples
lisibles dans le catalogue livré :

- `parc/7.2` : « **documentation, la nomenclature et les schémas des équipements ICS sont-ils
  tenus à jour ?** » — la phrase commence **au milieu d'un mot manquant** (« La ») ;
- `serveurs/5.11` : « Avez-vous un accès Wifi visiteur**"** isolé du reste du réseau de
  l'Entreprise ? (Connexion spécifique, Wifi dédié ?)**"** » — guillemets orphelins d'un champ CSV ;
- `parc/2.1` : deux questions distinctes **concaténées sans espace** (« …smartphones, etc..)**D**isposez-vous… ») ;
- `parc/2.11` : « Avez-vous **définit** des règles… » — faute de la source, conservée.

Une reformulation ne produit pas de guillemet orphelin ni de majuscule manquante en tête de
phrase. **Ce sont les artefacts d'un export.**

**Preuve n° 4 — L11 le savait.** `en/ref_aircyber.js`, parti pris n° 7 :

> `// 7. LES SCORIES DE L'EXPORT CSV SONT NETTOYÉES EN ANGLAIS. Le catalogue`
> `//    français porte, tel qu'il a été engendré, des guillemets orphelins au`
> `//    milieu ou en fin de question (4.11, 5.11, 5.14.2) et une majuscule`
> `//    manquante en tête (7.2, « documentation, la nomenclature… »).`

Le lot a **identifié** que le français était un export brut, l'a écrit, en a tiré un constat sur
deux erreurs de fait (Q-206) — et **n'a jamais posé la question du droit d'auteur** que ce constat
appelait.

**La conséquence, et la partie qui est le fait de L11.** Une traduction fidèle d'un texte protégé
est une **œuvre dérivée** : elle ne réduit pas l'exposition, elle l'étend à une seconde langue.
L11 a produit 234 traductions fidèles — et de bonne facture, ce qui aggrave plutôt le point.

- **Préexistant à L11** : la reprise verbatim du français (234 questions).
- **Introduit par L11** : l'œuvre dérivée anglaise (234 traductions), livrée dans un produit
  destiné à 20 filiales et à des sites à l'étranger.

**Ce qu'il faudrait faire** — *non fait.*
1. **Vérifier avec le client** sous quelle licence il détient le questionnaire AirCyber, et si
   elle couvre la reproduction dans un outil déployé sur 20+ filiales, en deux langues. Le dépôt
   ne contient **aucune trace** d'une licence, d'une cession ou d'une autorisation.
2. **Corriger la phrase du §4.2** : elle promet une protection que le produit n'a pas, et c'est
   sur cette phrase que la porte devait s'appuyer. *Ancrer la promesse ou corriger le texte* —
   c'est exactement la forme du constat Q-243.
3. Ne pas « réparer » en reformulant les 234 questions : **une auto-évaluation stockée par
   `(ref_id, code)` serait réattribuée en silence** à une question dont l'énoncé a changé (c'est
   l'argument qui a fait trancher Q-192, et il vaut ici).

---

### 🟠 Q-254 — Le produit affiche **en anglais** une affirmation fausse : « *Titles are reworded — refer to the official standard for the exact text.* »

**Preuve.** Deux fichiers, deux chaînes servies à l'écran :

- `en/ref_iso27002.js:56` → `aide: "…Titles are reworded — refer to the official standard for the exact text."`
- `en/ref_iso27001_smsi.js:56` → même phrase.

Or, pour ces deux catalogues précisément, les titres **ne sont pas reformulés** : Q-252 et Q-253
établissent le contraire, sur la foi des en-têtes de ces mêmes fichiers. Le français dit la même
chose (`ref_iso27002.js:29`, « Intitulés reformulés »), mais en français elle est **vraie** — les
titres FR sont bien des abréviations maison.

**Pourquoi c'est majeur et pas mineur.** Une mention d'avertissement inexacte n'est pas neutre :
en cas de litige, elle démontre que l'éditeur **connaissait** la question du droit d'auteur et a
publié une déclaration qui ne correspond pas à ce qu'il fait. Une absence de mention aurait été
moins défavorable. Et vis-à-vis de l'utilisateur, c'est un bandeau qui annonce quelque chose de
faux — la famille de défauts Q-201 / Q-207 (« un message qui annonce une perte qui n'a pas eu
lieu apprend à ne plus croire les bandeaux »), retournée : ici le message rassure à tort.

**Ce qu'il faudrait faire.** La phrase redevient vraie **le jour où Q-252 et Q-253 sont fermés**.
Tant qu'ils ne le sont pas, elle doit être retirée ou dire le vrai — pas l'inverse.

---

### 🟠 Q-256 — Couverture annoncée non tenue : **312 points de contrôle d'audit et 28 groupes de correspondances ne sont pas traduits du tout**, et la grille d'audit anglaise sort **bilingue**.

**Preuve — ce que le §4.2 compte** :

| Contenu | Volume annoncé | Traduit ? |
|---|---|---|
| Exigences de référentiels (titre + aide) | **424** | ✅ **424 / 424**, mesuré |
| **Points de contrôle d'audit (contrôle + preuves)** | **312** | ❌ **0** |
| **Groupes de correspondances (thème + aide)** | **28** | ❌ **0** |

**Mesuré :**

```
$ ls cyber-gouvernance_V4/js/data/en/
ref_aircyber.js  ref_anssi.js  ref_dora.js  ref_iso27001_smsi.js  ref_iso27002.js  ref_nis2.js
   → aucun en/audit_*.js, aucun en/mappings.js

$ cat cyber-gouvernance_V4/js/data/audit_*.js | grep -c 'ctrl:'      → 312
$ cat cyber-gouvernance_V4/js/data/audit_*.js | grep -c 'preuve:'    → 312
$ grep -c 'id: "map-' cyber-gouvernance_V4/js/data/mappings.js       → 28
```

**Ce n'est pas seulement une absence : c'est un document bilingue.** `AuditModeles.buildGrid()`
(`js/data/audit_modeles.js`) construit chaque ligne de grille avec :

- `intitule` et `aide` **issus de `Referentiels.get(refId)`** → **traduits**, donc anglais ;
- `ctrl` et `preuve` **issus de `js/data/audit_*.js`** → **français, sans chemin de traduction**.

Et pour AirCyber, modèle *dérivé* (`audit_aircyber.js:19-22`), les **234 lignes** portent une
phrase française codée en dur :

> `ctrl: "Contrôler la mise en œuvre effective et exiger les preuves ; confronter à la réponse déclarée au questionnaire AirCyber."`
> `preuve: "Documentation, configuration ou enregistrement démontrant la mise en œuvre, cohérent avec la réponse déclarée au questionnaire AirCyber."`

Rendu tel quel par `js/modules/audits.js:449-450`, sous un libellé lui aussi français
(`<strong>Preuves à demander :</strong>`).

**Pourquoi c'est majeur.** Le rapport d'audit est **le document que le produit existe pour
fabriquer** — « il servira de preuve en audit ISO 27001 » (`CLAUDE.md` §8). Un rapport dont
l'intitulé d'exigence est en anglais et le point de contrôle en français n'est pas une traduction
partielle : c'est un livrable qu'un auditeur anglophone ne peut pas utiliser, et il n'y a
**aucun indicateur** qui le signale — `Referentiels.couverture("en")` ne compte que les
référentiels et annonce **100 %** sur les cinq catalogues non-AirCyber.

**Ce qu'il faudrait faire.** Soit livrer `en/audit_*.js` et `en/mappings.js` sur le modèle exact
des six fichiers existants (indexation `<refId>/<code>`, repli sur le français), soit **inscrire
l'écart au registre avec un propriétaire et une échéance** et le dire à l'écran. Ce qui n'est pas
tenable, c'est l'état actuel : annoncé dans le cadrage, absent du produit, invisible de
l'instrument.

---

### 🟠 Q-257 — Le contrôle mécanique existant **ne mesure rien de ce que la porte S7 exige**, et son unique assertion de couverture est `assert.ok(faits >= 0)`.

**Mesuré** — `backend/test/depot/traductions-catalogues.test.mjs`, joué à `ecbb226` :

```
# tests 5   # pass 5   # fail 0
Couverture EN des catalogues :
  anssi-hygiene        118 / 118   (100 %)
  iso-27002-2022       201 / 202   (100 %)
  iso27001-smsi         85 / 85    (100 %)
  nis2-art21            36 / 36    (100 %)
  dora                  49 / 49    (100 %)
  aircyber             266 / 502   (53 %)
  TOTAL                755 / 992   (76 %)
```

**Ce qu'il mesure, et c'est réel :** que le mécanisme est branché ; qu'au moins 900 chaînes ont
été chargées (garde-fou anti-« vert sur rien », bien vu) ; qu'**aucune clé de traduction ne
désigne une exigence inexistante** ; qu'aucune chaîne ne porte `<` ou `>` (Q-204) ; et il
**imprime** la couverture même au vert.

**Ce qu'il ne mesure pas — et c'est tout le critère de la porte :**

1. **La paraphrase.** Rien, nulle part, ne compare une chaîne anglaise à un intitulé officiel ni
   ne mesure sa distance au français. **Les 93 titres de Q-252 passent au vert.** Un fichier dont
   les titres anglais seraient copiés-collés d'une norme est indistinguable, pour cet essai, d'un
   fichier paraphrasé.
2. **Le seuil de couverture.** L'assertion est, littéralement :
   `assert.ok(faits >= 0);` — vraie de toute exécution possible, y compris d'un répertoire `en/`
   vide. Le commentaire l'assume (« aucun seuil n'est imposé ici »), et l'argument tient pour un
   *seuil* ; il ne tient pas pour **zéro**, qui ne distingue plus « livré » de « pas commencé ».
3. **Les 312 points de contrôle et les 28 correspondances** (Q-256) : la liste `CATALOGUES` du
   fichier ne nomme que les six `ref_*`. L'instrument ne peut pas voir ce qu'il ne parcourt pas.
4. **Le sens.** Aucun contrôle ne peut décider qu'une traduction dit la même chose — et c'est
   normal. Mais alors **la relecture humaine est le seul instrument**, et elle doit être nommée,
   datée et signée. Elle ne l'est nulle part.

**Ce qui passerait au vert alors que c'est faux** (l'exercice imposé) :
un `en/ref_iso27002.js` intégralement copié depuis la table des matières de la norme ; un
`en/ref_dora.js` où chaque titre serait la phrase complète du règlement ; un `en/` où
`audit_*.js` et `mappings.js` n'existent pas — **c'est le cas réel** ; une traduction dont un
titre dirait l'inverse du français.

**Un point de forme, mineur mais à corriger avec le reste** : le test des clés orphelines découpe
le fichier à `source.indexOf('exigences')` — dans `en/ref_aircyber.js`, cette première occurrence
est **à la ligne 10, dans un commentaire d'en-tête**, pas sur la clé `exigences:` (ligne 168). La
fenêtre d'analyse est donc décidée par une phrase de commentaire. Aujourd'hui c'est inoffensif
(la fenêtre est trop large, jamais trop étroite) ; le jour où quelqu'un « corrige » le découpage
en visant plus serré, il pourra le viser après les clés.

**Ce qu'il faudrait faire.** (a) Remplacer `assert.ok(faits >= 0)` par un plancher par catalogue,
déclaré au registre — un chiffre qu'on baisse en connaissance de cause vaut mieux qu'aucun
chiffre. (b) Étendre le parcours à `audit_*` et `mappings`. (c) Acter par écrit que la paraphrase
**n'est pas mécaniquement décidable**, et faire porter aux six en-têtes le **nom et la date du
relecteur métier** — ce que la porte S7 réclame et qui n'existe dans aucun des six fichiers.

---

### 🟠 Q-258 — La question que le §4.2 imposait de poser au client n'a **aucune trace de réponse**, et L11 a fabriqué une version anglaise **concurrente** du questionnaire AirCyber.

**Preuve.** `docs/PLAN_SERVEUR.md` §4.2, second point de vigilance :

> **Économie possible** : le questionnaire AirCyber (234 questions) existe probablement déjà en
> anglais dans la filière aéronautique. **À demander au client** — cela supprimerait à soi seul un
> sixième du volume.

Repris comme vérification d'ouverture de projet (`PLAN_SERVEUR` ligne 668, et `CLAUDE.md`,
« Vérifications à mener au démarrage du projet ») et comme parade au **risque P2** du §8
(« Volume de traduction des catalogues sous-estimé — […] demander la version anglaise
d'AirCyber »).

**Mesuré** : `grep` sur l'ensemble de `docs/` ne rend que l'énoncé de la question — jamais une
réponse, une date, ni un nom. **La question n'a pas été posée, ou sa réponse n'a pas été
consignée**, et L11 a traduit les 234 questions par lui-même.

**Pourquoi c'est majeur, et pas un simple gâchis d'effort.** AirCyber n'est pas un référentiel
qu'on s'applique à soi : c'est un **questionnaire que le donneur d'ordre envoie à ses
fournisseurs**, et dont les réponses alimentent un **label** (Bronze / Argent / Or — le produit
affiche un panneau « préparation au label »). Deux filiales du groupe, l'une en français, l'autre
en anglais, répondront à **deux formulations différentes de la même question**, dont **l'anglaise
n'est pas celle de BoostAerospace**. L'écart n'est pas théorique : L11 a délibérément **corrigé
deux erreurs de fait de la source** dans sa version anglaise (WAF, IEC 62443 — constat **Q-206**,
déjà ouvert), de sorte que les deux langues **ne posent déjà plus la même question**.

**Ce qu'il faudrait faire.** Poser la question au client, et **consigner la réponse avec sa
date** — y compris si la réponse est « il n'en existe pas ». Si une version officielle existe,
elle remplace la nôtre : sur un questionnaire de label, la formulation qui fait foi est celle du
consortium. Cela répond du même coup, en partie, à Q-255.

---

### 🟠 Q-259 — ANSSI code 34 : le français demande d'**encadrer l'usage**, l'anglais demande d'**adopter une politique**. L'évaluation est partagée entre les deux.

**Preuve** (`en/ref_anssi.js`, domaine `nomadisme`) :

| Code | FR | EN |
|---|---|---|
| **34** | **Encadrer l'usage** des terminaux mobiles | **Adopt a policy** for mobile devices |

**Pourquoi ça compte dans ce produit précisément.** Les auto-évaluations sont stockées par
`(ref_id, code)` — une seule ligne pour les deux langues (`CLAUDE.md` §4, et c'est l'argument
même qui a fait trancher Q-192). Un évaluateur anglophone qui lit « Adopt a policy for mobile
devices » coche « conforme » sur l'**existence d'un document** ; un évaluateur francophone qui lit
« Encadrer l'usage des terminaux mobiles » coche « conforme » sur un **MDM qui applique la
règle**. La même ligne de base porte alors deux verdicts qui ne parlent pas de la même preuve —
dans un outil produit en audit.

**Pourquoi 🟠 et non 🛑.** Les deux formulations restent **à l'intérieur de la même mesure
ANSSI** ; ce n'est pas une exigence qui en désigne une autre, c'est la preuve demandée qui
change. J'ai retenu majeur, et je le dis explicitement pour que la gravité ne soit pas discutée
plus tard : si un second cas du même type apparaît, la classe devient bloquante.

**Hypothèse non vérifiée, signalée comme telle** : « Adopt a policy for mobile devices » ressemble
à l'intitulé de la mesure **33** du guide ANSSI anglais — c'est-à-dire, compte tenu du décalage
+1 documenté par Q-192, à **la mesure que le code 34 recouvre**. Si c'est exact, l'anglais est
allé chercher le guide là où l'en-tête du fichier jure de ne pas le faire (parti pris n° 2 :
« *LES TITRES DE MESURES, EUX, SONT TRADUITS DU CATALOGUE — PAS RECOPIÉS DU GUIDE* »). **Je n'ai
pas le guide anglais et ne l'affirme pas** ; l'écart FR↔EN, lui, est mesuré et se suffit.

---

### 🔵 Q-260 — Un faux ami, et une même notion rendue de deux façons dans deux catalogues.

**Preuve.**

| Où | FR | EN | Problème |
|---|---|---|---|
| ANSSI 24 | Protéger la messagerie **professionnelle** | Protect **professional** email | **faux ami**. En anglais, *a professional email* est un courriel bien rédigé. La messagerie d'entreprise se dit *corporate email* / *business email* |
| AirCyber 5.4 | vos **mails entreprise** | your **corporate email** | ✅ juste — et c'est la preuve que le lot connaît le bon terme |
| ANSSI, domaine `acces` | Authentifier et contrôler les accès | Authenticate and control **accesses** | *access* est indénombrable ; *accesses* n'est pas idiomatique. Ce libellé s'affiche **sur un axe de radar** |
| ANSSI 9 | Attribuer les droits au juste besoin | Grant rights **on need alone** | tournure non idiomatique ; l'usage est *on a need-to-know basis* / *on the least-privilege principle* |
| ANSSI 30 | Réserver les comptes d'admin… | Use **admin** accounts for **admin** tasks only | registre familier deux fois dans un titre normatif ; *administrator* ailleurs dans le même fichier |

**Pourquoi c'est mineur.** Aucun de ces cas ne change ce qui est évalué. Mais l'incohérence
ANSSI/AirCyber sur *email* est exactement ce que la porte appelle « incohérence de vocabulaire
d'un catalogue à l'autre », et elle se corrige en un mot.

---

### 🔵 Q-261 — « Station blanche » → « media sanitisation station » : en anglais de la sécurité, *sanitisation* désigne l'**effacement**, pas l'**analyse**.

**Preuve** (`en/ref_aircyber.js`, parti pris n° 5, et les entrées `ext/Ext55`, `ext/Ext57`) :

- FR `Ext55` : « Disposez-vous de **stations blanches** […] afin de vous assurer de l'**innocuité**
  des médias amovibles » → EN : « Do you provide **media sanitisation stations** […] to confirm
  that the removable media […] carry nothing harmful? »
- FR `Ext57` : « Un des **antivirus** utilisé sur les stations blanches est-il différent… » → EN :
  « Is one of the **anti-virus engines** used on the **media sanitisation stations** different… »

Une station blanche **analyse** un support ; elle ne l'efface pas. *Media sanitization* est le
terme consacré (NIST SP 800-88) pour la **destruction des données** d'un support. `Ext57` le
contredit dans la phrase suivante en parlant de moteurs antivirus.

**Pourquoi mineur** : la finalité (« carry nothing harmful ») est portée par le reste de la
phrase, donc le sens de l'exigence n'est pas perdu — c'est le **terme fixé** qui est mal choisi.
Et l'en-tête le fixe « une fois pour toutes » : le corriger est **une ligne**
(*media scanning kiosk*, *clean station*, *USB decontamination station*).

---

### 🔵 Q-262 — « S7 » désigne **deux choses différentes** dans le document qui fait autorité.

**Preuve** — `docs/PLAN_EXECUTION.md` :

- ligne **926** : `| **S7** | Le droit d'export est distinct de la lecture | §3.3 | …` — c'est un
  **contrôle** de la grille de sécurité ;
- ligne **1094** : `| **S7** | — | ⬜ jamais jouée — relecture métier et paraphrase délibérée
  (droit d'auteur, PLAN_SERVEUR §4.2)…` — c'est la **porte** que ce rapport instruit.

Deux constats ouverts du registre portent « **contrôle S7 en échec** » (Q-89 ligne 1315,
Q-242 ligne 1468) et se lisent, pour qui arrive sur la porte, comme des échecs de celle-ci. Ils
n'ont **rien à voir** : ils concernent le droit d'export.

**Pourquoi c'est un constat et pas une coquille** : le §7 est « la seule source des verdicts ».
Une source unique dont un identifiant désigne deux objets produit exactement la divergence
silencieuse que le chantier combat par ailleurs — et j'ai dû lever l'ambiguïté avant de savoir ce
que j'auditais.

**Ce qu'il faudrait faire.** Renommer l'un des deux — les contrôles de la grille en `C7`,
ou les portes en `P7` — et corriger les renvois de Q-89 et Q-242.

---

### 🔵 Q-263 — Les champs traduisibles d'un référentiel sont une **liste écrite à la main**, et un champ neuf y a déjà échappé.

**Preuve** (`js/data/referentiels.js`) : `traduire()` ne recopie que `nom`, `version`, `editeur`,
`description`, `aide`, `domaines` ; `couverture()` ne compte que quatre champs de niveau
référentiel (« `let total = 4;` »). Ce sont deux listes écrites à la main, à deux endroits, qui
doivent rester d'accord.

**L'omission a déjà eu lieu.** `js/data/ref_anssi.js` porte, ajouté **après L11** (fichier daté du
07/09, quand les cinq autres `ref_*.js` datent du 03/09), un champ `noteNumerotation` : **295
signes de prose française** expliquant le décalage de numérotation. Il n'est **ni traduisible, ni
compté** — l'instrument annonce `anssi-hygiene 118/118 (100 %)`. Il se trouve qu'aujourd'hui
**rien ne l'affiche** (`grep -rn noteNumerotation js/modules/` → aucun rendu), donc le défaut est
**latent** : la chaîne est morte. Le jour où quelqu'un l'affiche — c'est manifestement ce pour
quoi elle a été écrite — elle sortira en français sur l'écran anglais, **sans que rien ne le
signale**, et la couverture continuera d'annoncer 100 %.

C'est le cas n° 1 du tableau de `CLAUDE.md` §3 : *une omission qui fait réussir quelque chose en
silence alors que c'est faux* → la liste est le mauvais outil, il faut **découvrir** les champs.

**À signaler dans le même mouvement, hors périmètre L11 mais sur le même écran** : le rendu du
constat Q-192, `renvoiOfficiel()` (`js/modules/referentiels.js:535-545`), écrit quatre chaînes
françaises en dur — `"guide ANSSI n° "`, `"propre à cet outil"`, `"hors guide"`, `"guide : "` —
affichées sur **13 des 42 mesures ANSSI**. Le fichier appartient au périmètre de L10
(interface) ; le contenu est le constat de L11. Je le dis plutôt que de le laisser tomber entre
les deux lots.

**Ce qu'il faudrait faire.** Faire découvrir les champs traduisibles par parcours de l'objet
(comme le fait déjà, très bien, le contrôle anti-balise du même fichier d'essai), plutôt que par
énumération.

---

## 4. CE QUE J'AI MESURÉ / CE QUE JE N'AI PAS PU MESURER

### 4.1 Mesuré — commande ou citation à l'appui

| Ce qui est mesuré | Résultat |
|---|---|
| Les **424 paires FR↔EN** d'exigences, lues intégralement (97 530 signes) | six catalogues, dix domaines AirCyber compris |
| Exigences sans entrée de traduction | **0 / 424** |
| Titres anglais **vides** | **0** |
| Titres anglais **identiques au français** (non-traduction déguisée) | **0** |
| Clés de traduction **orphelines** (ne désignant aucune exigence FR) | **0** |
| Domaines orphelins | **0** |
| Aides d'exigence : FR renseignée, EN absente | **0 / 190** |
| Couverture `Referentiels.couverture("en")` | 755 / 992 (76 %) — détail au Q-257 |
| Écart AirCyber 266/502 | **entièrement expliqué et vérifié** : 234 aides absentes **des deux côtés**, + `nom` et `version` non traduits à dessein. L'en-tête l'annonçait ; c'est exact |
| Écart ISO 27002 201/202 | `nom` non traduit à dessein (désignation de norme). Exact |
| `backend/test/depot/traductions-catalogues.test.mjs` | **5 tests, 5 passés**, 0 échec (rejoué) |
| Longueur des intitulés par catalogue | tableau du Q-255 |
| Scories CSV du catalogue AirCyber français | 188 doubles espaces · 10 phrases collées · 22 sans ponctuation finale · 5 questions > 400 signes |
| `en/audit_*.js`, `en/mappings.js` | **inexistants** (`ls`) |
| Points de contrôle d'audit / groupes de correspondances | **312** `ctrl:` · **312** `preuve:` · **28** groupes |
| Chemin de traduction de la grille d'audit | `buildGrid()` traduit l'intitulé, jamais `ctrl`/`preuve` — lu dans `audit_modeles.js` |
| Chargement des six `en/ref_*.js` par la SPA | `index.html` lignes 131-136 — **oui**, après les catalogues FR |
| Cohérence orthographique déclarée (Oxford dans les titres ISO, britannique dans les aides) | **tenue** : `organization` n'apparaît que dans des titres et noms de domaine ; aucune aide ne l'écrit |
| Licence de réutilisation des guides ANSSI | **Licence Ouverte v2.0 (Etalab)** — réutilisation, adaptation, exploitation commerciale libres, **sous condition d'attribution** (source + date de dernière mise à jour). L'`editeur: "ANSSI"` est affiché (`js/modules/referentiels.js:362, 458`) ; la date de version du guide, elle, n'apparaît nulle part — à compléter si l'on veut être strict |

### 4.2 Non mesuré — dit explicitement, jamais supposé

1. **Je n'ai pas le texte officiel d'ISO/IEC 27001:2022 ni d'ISO/IEC 27002:2022**, et je ne l'ai
   pas consulté. **Aucune de mes conclusions ne repose sur un diff contre la norme.** Q-252 et
   Q-253 s'appuient sur (a) ce que les fichiers déclarent d'eux-mêmes, (b) la forme interne de
   l'anglais, (c) la divergence FR→EN mesurable. Si quelqu'un veut le diff, il faut acheter la
   norme — et c'est une dépense qui se justifie avant une mise en service.
2. **Je n'ai pas le guide ANSSI en anglais.** L'hypothèse du Q-259 (le titre anglais du code 34
   serait celui de la mesure 33 officielle) est signalée comme non vérifiée.
3. **Je n'ai pas le questionnaire AirCyber officiel**, ni ses conditions de licence, ni l'export
   CSV d'origine. Le caractère verbatim du français est établi par les **artefacts de
   transcription** et par la déclaration du fichier, pas par une comparaison à la source.
4. **Je n'ai pas ouvert le produit en anglais dans un navigateur.** Les écarts de rendu (grille
   d'audit bilingue, `renvoiOfficiel` français) sont établis **par lecture du chemin de code**,
   pas par capture d'écran. C'est une réserve, et elle a un propriétaire : elle se lève en une
   session avec Chromium, qui est installé (`CLAUDE.md` §0.2).
5. **Je n'ai pas relu les 190 aides pédagogiques anglaises phrase à phrase** — j'ai relu les 424
   titres intégralement et lu les aides des passages sensibles (chap. 7 et 9 d'ISO 27001, NIS2,
   DORA). Une relecture métier exhaustive des aides reste due.
6. **Je ne suis pas juriste.** Q-252, Q-253 et Q-255 décrivent une **exposition à faire
   qualifier**, pas une contrefaçon établie. Ce que j'affirme est factuel : la consigne validée
   avec le client n'est pas appliquée, et le dépôt le dit lui-même.

---

## 5. CE QUI EST BON — et qui doit survivre à la correction

Une porte qui ne dit que le négatif ne se lit pas. Ce qui suit tient, et il ne faut **pas** le
casser en fermant les constats.

1. **La couverture mécanique est irréprochable, et c'est rare.** 424 exigences, **0 manquante,
   0 vide, 0 orpheline, 0 titre laissé en français, 190 aides sur 190**. L'indexation
   `<domaineId>/<code>` — et le refus explicite d'indexer par le seul code — écarte d'emblée « le
   défaut qui se lit parfaitement et qui est entièrement faux ». **La question 3 de cette porte
   (couverture et cohérence) est répondue par l'affirmative**, aux 312 + 28 textes près (Q-256).

2. **`en/ref_anssi.js` est le fichier que le §4.2 décrit, et il faut le prendre pour modèle.** Il
   dispose d'un guide officiel en anglais, et il **refuse d'en recopier les titres**, en
   argumentant :

   > « *LES TITRES DE MESURES, EUX, SONT TRADUITS DU CATALOGUE — PAS RECOPIÉS DU GUIDE. […]
   > D'abord la règle du dépôt : reformulations originales courtes, jamais le texte de la source.
   > Ensuite, et surtout : les titres FRANÇAIS du catalogue sont DÉJÀ des reformulations […].
   > Recopier les titres officiels anglais ferait dire à l'écran anglais autre chose qu'à l'écran
   > français — et, avec le décalage ci-dessus, le ferait dire SOUS LE MAUVAIS NUMÉRO.* »

   C'est le raisonnement exact que Q-252 et Q-253 auraient dû recevoir. **Le lot savait le
   faire** : il l'a fait sur le seul catalogue où la licence ne l'exigeait pas, et pas sur les
   deux où elle l'exige.

3. **Le contresens DORA évité, et écrit.** `en/ref_dora.js` refuse « Oversight of critical ICT
   providers » pour l'exigence 4.3 parce que, dans DORA, *Oversight* désigne le cadre européen
   exercé **par les autorités** sur les prestataires désignés critiques — pas ce que fait
   l'entité. Le titre dit « **Monitoring** ». C'est de la relecture métier de haut niveau, du
   genre qu'un traducteur non spécialiste rate à coup sûr.

4. **La règle « la directive et le règlement sont des originaux anglais, pas des traductions ».**
   NIS2 et DORA ont 24 versions linguistiques également authentiques ; traduire « depuis le
   français » aurait produit un vocabulaire introuvable dans le texte. D'où *incident handling*
   (et non *incident management*), *supply chain security*, *ICT* et jamais *IT*. **C'est un
   écart assumé avec la lettre du §4.2, et il est juridiquement correct** : le §4.2 aurait dû
   prévoir l'exception, pas L11 s'y soumettre. Je ne l'ai pas compté comme constat contre le lot.

5. **Les distinctions de sens tenues au chapitre 6/8 d'ISO 27001** (définir le processus vs
   l'exécuter) et le refus d'appeler quatre lignes « General ». Le raisonnement est le bon ; c'est
   sa **mise en œuvre** qui a dérapé sur huit clauses (Q-253).

6. **AirCyber : 234 traductions d'une qualité qui dépasse la source.** Les questions françaises
   sont longues, mal ponctuées, parfois amputées ; l'anglais est fluide, correctement segmenté,
   et **conserve la forme interrogative question par question** — décision juste : « une question
   retournée en énoncé cesserait d'appeler une réponse ». Les termes de métier sont fixés une
   fois pour toutes et bien choisis : *IT estate* (et non *IT park*), *jump server*, *acceptable
   use policy*, *protocol break*, *control engineer*, *production test bench*. La distinction
   *supplier* / *subcontractor* / *contractor*, motivée par 5.14 où le français emploie deux de
   ces mots dans la même phrase, est exactement le genre d'arbitrage qu'on attend d'un traducteur
   spécialisé.

7. **Traduire a servi de relecture, et l'a prouvé.** Le lot a trouvé, en traduisant, deux erreurs
   de fond du catalogue français (WAF ≠ *web access filtering* ; IEC 62443 ≠ « ISO 62443 ») —
   constat **Q-206**, ouvert et correctement analysé, y compris sur le point délicat : corriger
   le fichier engendré serait écrasé au prochain rejeu du CSV, il faut traiter la source. Je
   confirme ce constat et je ne le renumérote pas.

8. **Le garde-fou anti-balise (Q-204) est bien construit** : il **découvre** les chaînes par
   parcours de l'objet au lieu de nommer les champs, il balaie **les deux langues** (le français
   est la source : une balise qui y entrerait s'afficherait aussi), il refuse de passer s'il a vu
   moins de 1 500 valeurs, et **il est mordu** par un test dédié. C'est la forme que les autres
   contrôles de ce fichier devraient avoir (Q-257, Q-263).

9. **Q-192 est correctement traité, et le raisonnement mérite d'être conservé** : treize codes
   ANSSI sur quarante-deux désignent autre chose que le guide ; on **ne renumérote pas**, parce
   que les auto-évaluations sont stockées par `(ref_id, code)` et qu'une renumérotation les
   réattribuerait en silence dans un outil produit en audit ; l'écart est **affiché**. Le fichier
   de traduction refuse de « corriger » de son côté, ce qui ferait coexister deux vérités. C'est
   la bonne décision, et elle est écrite.

---

## 6. CE QU'IL RESTE À FAIRE POUR FRANCHIR S7

Par ordre — et le premier point est la condition, pas une amélioration.

| | Quoi | Constat |
|---|---|---|
| **1** | **Reparaphraser les 93 titres de l'Annexe A et les 8 intitulés de clause d'ISO 27001**, depuis le français, en acceptant qu'ils diffèrent de la norme. Le numéro de clause reste la poignée de recherche | Q-252, Q-253 |
| **2** | **Faire qualifier juridiquement l'exposition AirCyber** et vérifier la licence détenue par le client. Corriger la phrase du §4.2, qui promet une protection que le produit n'a pas | Q-255 |
| **3** | Retirer ou rendre vraie la mention « *Titles are reworded* » | Q-254 |
| **4** | Livrer `en/audit_*.js` et `en/mappings.js`, **ou** inscrire l'écart au registre avec propriétaire et échéance | Q-256 |
| **5** | Poser au client la question du questionnaire AirCyber anglais, et **consigner la réponse avec sa date** | Q-258 |
| **6** | Aligner ANSSI 34, et les points de vocabulaire | Q-259, Q-260, Q-261 |
| **7** | Donner à l'essai un plancher de couverture, l'étendre aux 312 + 28 textes, et **faire porter aux six en-têtes le nom et la date du relecteur métier** — la paraphrase n'est pas mécaniquement décidable, elle doit donc être signée | Q-257 |
| **8** | Découvrir les champs traduisibles au lieu de les énumérer ; lever `noteNumerotation` | Q-263 |
| **9** | Désambiguïser « S7 » dans le document qui fait autorité | Q-262 |
| **10** | Ouvrir le produit **en anglais dans Chromium** et regarder les écrans Référentiels, Audits et Correspondances. Cette réserve n'a pas de raison d'être reconduite : Playwright et Chromium sont installés | réserve §4.2 (5) |

---

*Rapport S7, premier passage. Les constats Q-252 à Q-263 sont à reporter au registre des constats
ouverts de `docs/PLAN_EXECUTION.md` §7 — seule source — avec un propriétaire nommé et une
échéance. Un constat chiffré et non attribué est un constat perdu.*
