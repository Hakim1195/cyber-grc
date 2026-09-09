# Rapport de porte S7 — lot L14, la documentation

> **Périmètre exclusif** : `docs/GUIDE_EXPLOITATION.md` (373 lignes) et
> `docs/GUIDE_UTILISATEUR.md` (293 lignes). Rien d'autre. Le lot **L11** (traduction des
> catalogues) est traité par un autre auditeur ; je n'y ai pas touché.
>
> **Auditeur** : SECU indépendant — je n'ai écrit aucune des lignes examinées.
> **Date** : 09/09/2026. **Machine** : `SRV-Infra`, Debian 13, révision `ecbb226`.
> **Méthode** : les guides n'ont pas été relus, ils ont été **mesurés** — 34 commandes
> jouées sur la machine réelle, la base réelle et l'annuaire réel. Constats numérotés à
> partir de **Q-264**, soit à la suite immédiate de ceux de l'auditeur de L11 (Q-252 → Q-263).
>
> ⚠️ **Renumérotés après coup, et le motif vaut d'être dit.** Ce rapport a d'abord été écrit
> seize rangs plus loin dans la suite : l'orchestrateur avait réservé une plage pour que les
> deux auditeurs, qui travaillaient en parallèle, ne se collisionnent pas. **Deux garde-fous
> du dépôt l'ont refusé coup sur coup**, et tous deux avaient raison.
> `test/documentation/registre.test.mjs` a d'abord rougi sur « LA NUMÉROTATION est continue
> et sans doublon » — un trou dans la suite ne se distingue pas d'un constat perdu, et une
> plage réservée est exactement le genre de convention qui devient fausse. Puis, la
> renumérotation faite, il a rougi une seconde fois sur « TOUT CONSTAT NOMMÉ dans un rapport
> de porte a sa ligne au registre » : la note qui expliquait la renumérotation **citait les
> anciens numéros**, et le garde les a lus comme des constats égarés. Il avait encore raison
> — un numéro écrit dans un rapport de porte est une promesse de ligne au registre, quelle
> que soit l'intention de qui l'écrit. D'où cette rédaction, qui dit le déplacement sans
> invoquer un seul numéro qui n'existe pas. La suite est continue, et les renvois ont été
> repris dans les cinq documents qui les citent.
>
> **Aucun secret n'est recopié dans ce rapport.**

---

## 1. Verdict

### ❌ **PORTE S7 REFUSÉE sur le périmètre L14.**

**Motif** : les deux guides décrivent, à quatre endroits mesurables, un produit qui n'est
pas celui qui tourne — un **groupe d'annuaire qui n'existe pas** et qui, créé tel que le
guide le nomme, n'accorderait **aucun accès** ; un **écran d'administration qui n'existe
pas**, seul chemin donné pour créer une filiale au moment d'une acquisition ; une
**garantie de chiffrement du courriel** que la configuration livrée permet de désactiver ;
et une **propriété de minimisation des données** promise au DPO que le journal d'audit ne
tient pas.

C'est exactement le défaut que ce chantier paie depuis le début, appliqué au seul lot dont
c'est la matière : *un document qui décrit ce qu'il croit plutôt que ce qui est.*

---

## 2. Compte des constats

| Gravité | Nombre | Références |
|---|---|---|
| 🛑 **bloquant** | **4** | Q-264, Q-265, Q-266, Q-267 |
| 🟠 **majeur** | **6** | Q-268, Q-269, Q-270, Q-271, Q-272, Q-273 |
| 🔵 **mineur** | **5** | Q-274, Q-275, Q-276, Q-277, Q-278 |
| **Total** | **15** | |

Aucun constat de la classe « fuite de données entre filiales » : ce n'est pas la surface de
ce lot, et rien de ce qui a été mesuré ne suggère qu'un guide induirait une telle fuite.

---

## 3. Les constats

### 🛑 Q-264 — Le guide promet au DPO une minimisation que le journal ne tient pas

**Énoncé.** `docs/GUIDE_UTILISATEUR.md:40`, section « Ce qui vaut pour tout le monde »,
lue par les huit profils :

> « Les suppressions y conservent **le différentiel**, pas l'enregistrement entier. »

C'est **l'inverse de ce qui est écrit dans la convention qui fait foi**, et l'inverse de ce
que porte la base.

**Preuve — la convention.** `backend/db/CONVENTIONS.md:1657` (§29.4), tableau normatif :

| Action | `valeurs_avant` | `valeurs_apres` |
|---|---|---|
| `modification` | les valeurs **précédentes des seuls champs modifiés** | leurs valeurs neuves |
| `suppression` | **l'enregistrement supprimé** | `null` |

Le différentiel est la règle de la **modification**. La **suppression** conserve
l'enregistrement.

**Preuve — la mesure**, sur la base de la recette :

```
select (select count(*) from jsonb_object_keys(valeurs_avant)) from journal_audit
 where action='suppression' and entite_type='risques';      →  13
select count(*) from information_schema.columns
 where table_name='risques';                                →  16
```

Et le contenu réel d'une de ces entrées porte `nom` et `description` en clair :

```json
{"id":"RISK-…","nom":"Risque de recette — aller-retour Q-194",
 "description":"chaine vide envoyee explicitement", "niveau":"", …}
```

Pour comparaison, une `modification` mesurée sur la même base ne porte **qu'une seule
clé** de chaque côté — le différentiel, lui, existe bien, mais pas là où le guide le place.

**Pourquoi c'est bloquant.** Le même guide, §5, s'adresse au **délégué à la protection des
données** et lui dit que « les purges de données personnelles anonymisent » et que « le
journal d'audit n'est jamais purgé ». Un DPO qui compose ces trois phrases conclut que la
suppression d'une fiche ne laisse au journal qu'un différentiel technique. La réalité est
qu'elle y laisse **l'enregistrement métier complet, pour trois ans**. Le
`CONVENTIONS.md:1697` (§29.6) le dit d'ailleurs sans détour — *« ce que le journal contient
par construction et qu'il faut assumer : des identités, des adresses IP, et des valeurs
métier avant/après — sur trois ans »* — mais cette phrase n'a jamais traversé jusqu'au
guide. Un DPO répondrait de travers à une demande d'effacement, sur la foi du document
qu'on lui a remis.

**Ce qu'il faudrait faire** (non fait) : réécrire la phrase pour dire ce que dit §29.4 —
*« une modification n'écrit que les champs changés ; une suppression conserve
l'enregistrement supprimé »* — et faire remonter l'avertissement de §29.6 dans la section 5
du guide, où le DPO le lira.

---

### 🛑 Q-265 — Le groupe d'annuaire de l'administrateur n'existe pas

**Énoncé.** `docs/GUIDE_UTILISATEUR.md:253` titre la section de l'administrateur :

> `## 8. Administrateur — ` **`GRC-GROUPE-ADMIN`**

Ce groupe **n'existe nulle part** — ni dans l'engendreur, ni dans la base, ni dans
l'annuaire. Le groupe réel est **`GRC-ADMIN`**, de périmètre `transversal`.

**Preuve — le dépôt.** Une seule occurrence dans tout le dépôt, et c'est la ligne fautive :

```
$ grep -rn "GRC-GROUPE-ADMIN" . --include=*.md --include=*.ts --include=*.sh --include=*.sql
docs/GUIDE_UTILISATEUR.md:253:## 8. Administrateur — `GRC-GROUPE-ADMIN`
```

**Preuve — l'engendreur.** `deploy/groupes-ad.sh --csv` rend 23 groupes ; `ADMIN` n'y
figure **pas** sous la forme `GRC-GROUPE-<PROFIL>`, contrairement aux sept autres profils :

```
GRC-GROUPE-AUDITEUR;groupe;;AUDITEUR;…
GRC-GROUPE-CONTRIB;groupe;;CONTRIB;…
GRC-GROUPE-DIRECTION;groupe;;DIRECTION;…
GRC-GROUPE-DPO;groupe;;DPO;…
GRC-GROUPE-QUALITE;groupe;;QUALITE;…
GRC-GROUPE-RH;groupe;;RH;…
GRC-GROUPE-RSSI;groupe;;RSSI;…
GRC-EXPORT;transversal;;;Droit d'extraction…
GRC-ADMIN;transversal;;;Administration de l'application…
```

**Preuve — l'annuaire réel** (`sudo docker exec grc-ad samba-tool group list`) : `GRC-ADMIN`
est présent, `GRC-GROUPE-ADMIN` absent.

**Preuve — la base** :

```
select nom, perimetre, accorde_admin from groupes_ad where nom ilike '%ADMIN%';
  GRC-ADMIN | transversal | t
select count(*) from groupes_ad where lower(nom)='grc-groupe-admin';   →  0
```

**Pourquoi c'est bloquant, et pas une coquille.** `src/droits/resolution.ts:96` ne
*décompose pas* le nom du groupe : il le **cherche** dans `groupes_ad`. Un nom absent de la
table « n'accorde rien et est journalisé comme ignoré » (entête du fichier, ligne 12). Un
administrateur d'annuaire qui suit le guide crée donc `GRC-GROUPE-ADMIN`, y place le compte
d'administration, et ce compte **entre sans obtenir aucun droit** — pas même la lecture. Le
registre porte déjà ce scénario, joué en vrai : constat **Q-78**, *« après une installation
complète et réussie, PERSONNE ne peut utiliser le produit »*. Le guide rouvre le même piège
par le seul nom.

**Note attenante (🔵, comptée en Q-278).** Le tableau de `GUIDE_EXPLOITATION.md:104`
annonce « **trois** familles de groupes » et n'en liste que trois — `GRC-<CODE>-<PROFIL>`,
`GRC-GROUPE-<PROFIL>`, `GRC-EXPORT` — alors que l'engendreur en produit **quatre** formes,
`GRC-ADMIN` étant la quatrième. Elle est rattrapée par l'avertissement de la ligne 112, mais
hors du tableau que l'on recopie.

**Ce qu'il faudrait faire** : remplacer `GRC-GROUPE-ADMIN` par `GRC-ADMIN` en titre de §8,
et ajouter la forme transversale au tableau du §2 de l'autre guide.

---

### 🛑 Q-266 — L'écran d'administration n'existe pas, et c'est le seul chemin donné pour une acquisition

**Énoncé.** Les deux guides envoient l'administrateur sur un écran « Administration » pour
les trois gestes de cycle de vie :

- `GUIDE_UTILISATEUR.md:262` — « **Créer une filiale** | **Administration** | La réponse vous
  donne la liste des groupes AD à créer » ;
- `GUIDE_UTILISATEUR.md:266` — « **Faire sortir une filiale** | **Administration** » ;
- `GUIDE_EXPLOITATION.md:120` — « Créer la filiale **dans l'application** (`POST /api/filiales`,
  **ou l'écran d'administration**) ».

**Il n'y a pas d'écran « Administration », et il n'y a aucune interface pour ces trois
routes.**

**Preuve — les entrées de menu réellement servies** (extraction de
`cyber-gouvernance_V4/index.html`) : 31 entrées, dont *Vision Groupe*, *Approbations*,
*Socle de risques*, *Référentiels applicables*, *Imports*, *Journal d'audit*, *Paramètres &
Data*. **Aucune ne s'appelle « Administration ».**

**Preuve — la SPA n'appelle jamais ces routes** :

```
$ grep -rn "api/filiales\|sortie-filiale\|purge-rgpd" cyber-gouvernance_V4/js/
js/core/identite.js:23://    ni `/api/session`, ni `/api/filiales` (les deux ne rendent que
js/app.js:569:     * `api/filiales` **n'existe pas encore** ; l'appeler à chaque démarrage
$ grep -rn "Créer une filiale\|creerFiliale\|post…/filiales" cyber-gouvernance_V4/js/
(aucun résultat)
```

`GET /api/filiales` est consommé, et uniquement pour peupler le **sélecteur de filiale
active** (`js/app.js:587`). `POST /api/filiales`, `POST /api/cycle/sortie-filiale` et
`POST /api/cycle/purge-rgpd` existent côté serveur — je les ai relevés dans l'énumération
des routes — et **aucune ligne de la SPA ne les appelle**.

**Pourquoi c'est bloquant.** Le `GUIDE_EXPLOITATION.md` §2 est **entièrement consacré** au
scénario « quand le client rachète une société », c'est-à-dire au fait générateur du produit
(20+ filiales, acquisitions régulières). Son point 1 est « créer la filiale dans
l'application ». L'exploitant qui l'applique cherche un écran qui n'existe pas, se rabat sur
`POST /api/filiales` — et **aucun des deux guides ne lui dit comment l'appeler** : pas de
`curl`, pas un mot sur le cookie de session, pas la forme du corps, pas le fait qu'il lui
faut `GRC-ADMIN`. Il reste bloqué au moment précis où le guide devait le porter.

**Ce qu'il faudrait faire** : soit livrer l'écran, soit — et c'est le rôle d'un guide — dire
la vérité : que ces trois gestes se font aujourd'hui par appel d'API, et donner l'appel
complet. La seconde branche ne coûte rien et ferme le trou tout de suite.

---

### 🛑 Q-267 — « STARTTLS est exigé, aucun repli en clair » : la configuration livrée dit le contraire

**Énoncé.** `GUIDE_EXPLOITATION.md:174-181`, sous le titre **« Ce que le produit garantit,
et qu'il faut pouvoir dire à un RSSI qui le demandera »** :

> « **STARTTLS est exigé** : sans lui, l'envoi est refusé — il n'y a **aucun repli en
> clair**, et `AUTH` n'est jamais émis sur un canal non chiffré ».

La seconde moitié est vraie. **La première est fausse.**

**Preuve — la configuration accepte le clair.**
`backend/src/notifications/reglages.ts:161` :

```ts
['starttls', 'tls', 'aucun'],
'starttls',
```

`SMTP_CHIFFREMENT=aucun` est une valeur **valide** ; `starttls` n'est que le **défaut**.

**Preuve — le code part alors en clair.** `backend/src/notifications/smtp.ts:685-700` :

```ts
/** Ouvre la prise : TLS implicite (465) ou clair (587/25). */
…
if (relais.chiffrement === 'tls') { … tls.connect(…) … }
const prise = net.connect({ host: relais.hote, port: relais.port }, …
```

et le bloc STARTTLS de la ligne 579 est gardé par `if (relais.chiffrement === 'starttls')` :
en `aucun`, il n'est **pas traversé**. Le message part sur une prise TCP nue.

**Preuve — ce qui est réellement garanti**, et le fichier le dit lui-même
(`smtp.ts:60-65`, propriété de sûreté n° 3) :

> « **Les identifiants ne partent jamais en clair.** `AUTH` est refusé tant que le canal
> n'est pas chiffré, quelle que soit la configuration. Le `SMTP_CHIFFREMENT=aucun` de la
> configuration **n'est un avertissement que pour un relais qui n'exige pas
> d'authentification** ; combiné à `SMTP_MODE_AUTH=basique`, il ferait circuler le mot de
> passe […] ».

Et la barrière correspondante, `smtp.ts:611-616`, refuse `AUTH` — **pas l'envoi**.

**Pourquoi c'est bloquant.** La phrase est explicitement fournie comme **la réponse à donner
à un RSSI**. Elle affirme une barrière de plus que celle qui existe. Un exploitant qui a
posé `SMTP_CHIFFREMENT=aucun` pour faire passer un relais interne récalcitrant — cas
banal — répondra en toute bonne foi que rien ne circule en clair, alors que ses relances
partent en clair sur le réseau du client.

**Ce qu'il faudrait faire** : reformuler en deux affirmations distinctes et exactes — *le
défaut est STARTTLS, et un relais qui ne l'annonce pas est refusé ; `SMTP_CHIFFREMENT=aucun`
est possible et fait circuler le message en clair ; `AUTH` n'est jamais émis sur un canal
non chiffré, quelle que soit la configuration.* Cette dernière est la seule garantie
inconditionnelle, et elle est solide : elle mérite d'être dite pour ce qu'elle est.

---

### 🟠 Q-268 — La section Direction décrit un défaut corrigé il y a quatre jours

**Énoncé.** `GUIDE_UTILISATEUR.md:107-114` :

> « ⚠️ **Ce que votre profil ne montre PAS** […] : le profil *Direction* livré avec le
> produit n'ouvre **ni les risques, ni les incidents**. Sur l'écran Vision Groupe, ces
> colonnes affichent donc `—`, et non `0`. **Ce n'est pas une panne, et ce n'est
> probablement pas ce que vous voulez.** Si la direction doit voir combien de risques
> critiques porte chaque filiale, il faut ajouter les domaines `risques` et `incidents` au
> profil […]. Voir le constat **Q-181** au registre du projet. »

**C'est faux depuis le 05/09/2026.** La migration `016_direction_voit_le_groupe.sql` a
fermé Q-181 en ajoutant les six domaines manquants.

**Preuve** — mesuré dans la base de la recette :

```
select p.code, string_agg(d.domaine||':'||d.niveau,', ' order by d.domaine)
  from profils p join profil_domaines d on d.profil_id=p.id
 where p.code='DIRECTION' group by p.code;

DIRECTION | actifs:lecture, actions:lecture, audits:lecture, documents:lecture,
            echeances:lecture, exigences:lecture, incidents:lecture, mesures:lecture,
            referentiels:lecture, risques:lecture, synthese:lecture, tableau_de_bord:lecture
```

`risques:lecture` **et** `incidents:lecture` sont présents. Douze domaines, pas six.

**Conséquence.** Un membre de la direction lit qu'il ne verra pas les risques, et n'ouvre
donc pas l'écran ; ou bien il ouvre un ticket ; ou bien un administrateur, suivant la
consigne du guide, modifie un profil qui n'a pas besoin de l'être. Le guide invite en outre
à consulter Q-181 « au registre du projet » comme s'il était ouvert : il est **fermé**
(`docs/PLAN_EXECUTION.md`, arbitrage du 05/09).

**Ce qu'il faudrait faire** : supprimer l'avertissement et le remplacer par la description
du profil réel — douze domaines en lecture, risques et incidents compris.

---

### 🟠 Q-269 — « RSSI : tous les domaines » est faux, et le guide se contredit lui-même

**Énoncé.** `GUIDE_UTILISATEUR.md:53` : « **Votre périmètre** : votre filiale, **tous les
domaines**, au niveau *validation* ».

**Mesuré : 26 domaines sur 30.** Manquent `droits`, `filiales`, `journal`, `parametres`.

**Preuve** — le domaine de référence porte 30 valeurs :

```
CHECK (VALUE = ANY (ARRAY['tableau_de_bord','synthese','echeances','donneurs_ordre',
 'personnel','actifs','cartographie','risques','exigences','referentiels','mesures',
 'correspondances','actions','incidents','documents','rgpd','bia','crise','pra','mco',
 'tests_pra','prestataires','audits','revues','pieces_jointes','imports','parametres',
 'filiales','droits','journal']))
```

et `profil_domaines` en attribue 26 à `RSSI`, aucun des quatre ci-dessus.

**Le guide se contredit** : son §8 range « **Lire le journal d'audit** » parmi « ce que
**vous seul** pouvez faire » (l'administrateur). Les deux phrases ne peuvent pas être vraies
ensemble, et c'est la seconde qui est exacte. Le fait est du reste corroboré par le compte de
recette `rssi.tls`, dont la fiche interne précise « **sans** le domaine `journal` ».

**Ce qu'il faudrait faire** : écrire « tous les domaines métier de votre filiale — le
journal d'audit, les droits, les paramètres et la gestion des filiales restent à
l'administration ». C'est plus court et c'est vrai.

---

### 🟠 Q-270 — Le contributeur ne peut pas « rédiger une politique »

**Énoncé.** `GUIDE_UTILISATEUR.md:120-125` :

> « **Votre périmètre** : votre filiale, sur **quatre domaines** — actifs, plan d'actions,
> incidents, actions préalables (MCO) —, au niveau *contribution*. […] Concrètement : **vous
> rédigez une politique, vous ne l'approuvez pas** ».

Les deux phrases se contredisent à trois lignes d'intervalle, et la mesure tranche pour la
première.

**Preuve** :

```
CONTRIB | actifs:contribution, actions:contribution, incidents:contribution, mco:contribution
```

Quatre domaines, exactement ceux qu'annonce le guide — c'est juste, et c'est à porter au
crédit du document. Mais `documents` n'en fait **pas** partie : un contributeur ne voit pas
l'écran *Documents*, et n'y écrit donc rien. L'exemple choisi pour illustrer son niveau est
précisément celui qu'il ne peut pas faire.

**Ce qu'il faudrait faire** : remplacer l'exemple par un geste de son périmètre réel —
*« vous déclarez un incident, vous ne clôturez pas le circuit d'acceptation d'un risque »*,
la seconde moitié de la phrase, qui est juste, suffit seule.

---

### 🟠 Q-271 — La procédure d'acquisition ignore l'outil livré pour la faire

**Énoncé.** `GUIDE_EXPLOITATION.md:93` ouvre le §2 par la bonne règle :

> « **Ils ne s'écrivent pas à la main, ils s'engendrent** — sinon ils périment à la première
> acquisition »

puis ne donne qu'une commande, `groupes-ad.sh --csv`. Et la procédure d'acquisition
(lignes 118-124) dit, en point 2 : « **créer ces groupes dans l'annuaire** » — sans dire
comment, et en reléguant la régénération du CSV au point 4, « **pour vos archives** ».

**Ce que le script fait réellement**, mesuré (`groupes-ad.sh --aide`) :

| Option | Ce qu'elle fait | Documentée dans le guide ? |
|---|---|---|
| *(sans option)* | la liste, un nom par ligne | ❌ |
| `--powershell` | **script PowerShell idempotent `New-ADGroup`, à exécuter sur un contrôleur de domaine** | ❌ |
| `--csv` | `nom;perimetre;filiale;profil;description` | ✅ |
| `--verifier` | **éprouve la déclaration des filiales et la confronte à `groupes_ad`** | ❌ |
| `--ou`, `--prefixe`, `--profils` | paramètres de l'engendrement | ❌ |

Les deux options manquantes sont **exactement** celles dont le §2 a besoin. Jouées :

```
$ sudo bash backend/deploy/groupes-ad.sh --powershell --ou 'OU=Test,DC=exemple,DC=interne'
# Engendré par deploy/groupes-ad.sh — … total : 23 groupe(s)
# À exécuter sur un contrôleur de domaine, ou sur un poste d'administration
$ sudo bash backend/deploy/groupes-ad.sh --verifier
==> Groupes AD : 23 attendu(s) — 2 filiale(s) active(s), 8 profil(s), préfixe « GRC- »
  ok  déclaration des filiales saine (…, 2 ligne(s) dont 0 hors périmètre)
  ok  groupes_ad : les 23 groupes de la convention sont déclarés, et rien d'autre
  (code 0)
```

**Aggravant** : `docs/INSTALLER.md:50`, page écrite quatre jours plus tard, fait de
`--powershell` son **étape 4** et explique son idempotence. Le runbook — le document que
l'exploitant ouvrira le jour de l'acquisition, six mois après l'installation — est donc
**en retard sur la page d'installation**, sur le geste même dont il traite. Le §2 prêche
l'engendrement et laisse créer à la main.

**Ce qu'il faudrait faire** : mettre `--powershell` au point 2 de la procédure
d'acquisition, `--verifier` au point 4 en remplacement de « pour vos archives », et lister
les six options du script.

---

### 🟠 Q-272 — « Une entrée supprimée casse la chaîne, et la rupture se voit » : faux pour la queue

**Énoncé.** `GUIDE_EXPLOITATION.md:15-17`, en tête du document, **première** des « cinq
choses à savoir avant de toucher à quoi que ce soit » :

> « Il est chaîné par empreinte : **une entrée modifiée ou supprimée casse la chaîne, et la
> rupture se voit.** »

**C'est faux pour une troncature de queue**, et le projet le sait : constat **Q-243**,
ouvert, 🟠 majeur, propriétaire *orchestrateur*, échéance `V1.1`
(`docs/PLAN_EXECUTION.md:1469`) :

> « **Une troncature de QUEUE du journal est indétectable** : le produit répond
> `sain: true`. La vérification suit la chaîne d'empreintes, qui ne dit rien de ce qui a été
> retiré **après** le dernier maillon lu. […] Le remède est d'ancrer la tête […], **ou
> corriger la phrase du `PLAN_SERVEUR` §1.7 qui promet plus que ce qui est tenu**. »

**Pourquoi c'est un constat neuf et non un doublon de Q-243.** Q-243 nomme **une seule**
phrase à corriger, celle du `PLAN_SERVEUR` §1.7. Le `GUIDE_EXPLOITATION.md` porte **la même
sur-promesse**, au premier paragraphe du document destiné à l'exploitant, et n'est pas visé
par le constat. C'est le motif *« corriger le symptôme laisse la cause »* (Q-212), retourné :
ici on a nommé un site et laissé le second — et le second est celui que lit la personne qui
décidera, un jour, si un journal est digne de foi.

**Aggravant mesuré** : `install.sh --diagnostic` affiche `ok journal — ajout seul, chaîne
intacte — chaîne entière (902 entrées)`. Sur un journal amputé de sa queue, cette ligne
resterait verte. Le guide §1 la présente comme un des douze sujets contrôlés.

**Ce qu'il faudrait faire** : ajouter une phrase — *« une entrée modifiée ou retirée **au
milieu** de la chaîne se voit ; un retrait des **dernières** entrées ne se voit pas encore
(constat Q-243), et c'est la raison de l'ancrage prescrit au §5 »*. Cela rattache
l'avertissement à la procédure de rétention, qui est le seul endroit où l'exploitant peut
agir.

---

### 🟠 Q-273 — L'installation de découverte est invisible pour qui doit l'exploiter

**Énoncé.** Depuis le 08/09/2026, `install.sh --assistant` pose, quand on répond « aucun
annuaire », une **installation de découverte** : pas d'AD, pas de courriel, **certificat
auto-signé**, et un **compte de secours applicatif**.

**Le `GUIDE_EXPLOITATION.md` n'en dit pas un mot.**

**Preuve** :

```
$ grep -n "découverte\|secours\|auto-signé" docs/GUIDE_EXPLOITATION.md docs/GUIDE_UTILISATEUR.md
(aucun résultat)
$ grep -n "découverte\|secours" docs/INSTALLER.md
73:## Juste voir le produit ? Le profil découverte
76:… pas d'annuaire, pas de courriel, un certificat auto-signé, et un compte de secours…
85:Le compte de secours donne l'administration Groupe…
```

Et le mécanisme existe bien — `install.sh:679` (`A_PROFIL="decouverte"`), `install.sh:827`
(certificat engendré par `openssl`), `install.sh:1115` (« *Acceptable en découverte ; à
corriger avant toute mise en service* »).

**Ce que le compte de secours accorde, mesuré dans le code** :
`backend/src/auth/index.ts:791` —

```ts
groupes: [`${prefixe.toUpperCase()}ADMIN`],
```

c'est-à-dire **`GRC-ADMIN`** : l'administration Groupe entière, sans annuaire, sur
vérification d'une empreinte `scrypt` posée dans `/etc/cyber-grc/env`.

**Pourquoi c'est majeur.** Le §0 du guide s'intitule « les cinq choses à savoir avant de
toucher à quoi que ce soit » et le §6 « ce que ce produit ne fait pas ». Ni l'un ni l'autre
ne mentionne qu'il existe un chemin d'authentification **hors annuaire** ouvrant tous les
droits. Un exploitant qui reprend une machine posée par quelqu'un d'autre ne saura ni
reconnaître un profil dégradé, ni qu'un tel compte peut exister, ni qu'il faut le retirer
avant mise en service. Le `--diagnostic` le signalerait (`install.sh:962`), mais le guide
n'apprend pas à le chercher — sur la recette il ne s'est pas déclenché, l'installation étant
nominale.

**Ce qu'il faudrait faire** : une sous-section au §1 — *reconnaître une installation de
découverte* (`CYBER_GRC_PROFIL=decouverte`, la ligne du `--diagnostic`), *ce qu'elle n'a
pas* (AD, courriel, certificat vérifiable), et *ce qu'il faut faire avant toute mise en
service* (retirer le compte de secours, poser un vrai certificat, brancher l'annuaire).

---

### 🔵 Q-274 — Le report de la version anglaise est écrit et daté, mais son argument est périmé

**Énoncé.** Le contrat du lot est explicite (`docs/PLAN_SERVEUR.md:624`) : « **L14 |
Documentation | Guide utilisateur (par profil, FR/EN), guide d'exploitation, liste des
groupes AD** ». La version anglaise est donc **au contrat**, et elle n'est pas livrée.

**Le report EST un choix écrit, daté et attribué** — c'est le constat **Q-182**
(`docs/PLAN_EXECUTION.md:1408`) : gravité 🔵, propriétaire *orchestrateur*, échéance `V1.1`,
état *ouvert*. Sur la forme, il satisfait la règle du chantier (« *un constat chiffré et non
attribué est un constat perdu* ») : rien à redire.

**Mais son argument ne tient plus.** Il énonce :

> « **la version anglaise attend L10/L11 délibérément** : un guide écrit avant que
> l'interface soit traduite nommerait des écrans et des boutons qui n'existent pas encore
> sous ce nom […]. Ce n'est pas un report de confort, c'est un **ordre de dépendance**. »

L'argument était bon. Il est **échu** : `docs/PLAN_EXECUTION.md:1053` (vague 7) porte
« **L11 traduction des catalogues, L14 documentation — ✅ livrés (05/09/2026)** », et L10
(internationalisation) est livré le 05/09 également. La dépendance invoquée était donc
**déjà satisfaite le jour même où le constat a été écrit**, et l'est depuis quatre jours.

**Verdict sur la question posée** : le report **est** un choix écrit, pas un oubli — mais
son motif est aujourd'hui **caduc**, et un constat dont la justification a expiré est
exactement ce que le chantier appelle *une réserve écrite qui n'est pas une réserve
traitée*. Il doit être ré-ancré sur un motif encore vrai (arbitrage de priorité assumé,
V1.1) ou reprogrammé.

**Ce qu'il faudrait faire** : réécrire la colonne d'état de Q-182 — « la dépendance L10/L11
est levée depuis le 05/09 ; le report est désormais un arbitrage de priorité, décidé le
JJ/MM par X » —, ou planifier la traduction.

---

### 🔵 Q-275 — « dix commandes » renvoie à une page qui en titre cinq

**Énoncé.** `GUIDE_EXPLOITATION.md:34-37` : « **Lisez [`INSTALLER.md`](INSTALLER.md)** — une
page, **dix commandes**, les six valeurs que le script ne peut pas deviner, et les **trois
pannes** de démarrage ».

**Mesuré dans `docs/INSTALLER.md`** : le bandeau de la ligne 3 dit bien « une page, dix
commandes, aucun renvoi », mais le titre de section de la ligne 35 est « **## Les cinq
commandes** », et le bloc en contient cinq numérotées. Les autres commandes de la page (mise
à jour, désinstallation) portent d'autres titres. « Les six valeurs » ✅ et « les trois
pannes » ✅ sont exacts (tableau de trois lignes, ligne 92).

Le chiffre est faux dans `INSTALLER.md` d'abord — hors périmètre L14 — mais le
`GUIDE_EXPLOITATION.md` le **recopie**, et c'est le motif *« deux listes des mêmes choses
divergent, et la divergence est silencieuse »*.

**Ce qu'il faudrait faire** : le guide ne devrait pas compter les commandes d'un autre
fichier. Écrire « une page, sans renvoi » et laisser `INSTALLER.md` maître de ses chiffres.

---

### 🔵 Q-276 — Une tâche hebdomadaire prescrite sans commande jouable

**Énoncé.** `GUIDE_EXPLOITATION.md:142`, tableau d'exploitation courante :

| Quand | Quoi | Commande |
|---|---|---|
| chaque semaine | la chaîne du journal | `GET /api/journal/verification` (périmètre Groupe) |

Toutes les autres lignes du tableau portent une commande de terminal ; celle-ci porte une
route HTTP, sans `curl`, sans cookie, sans dire qu'elle exige le domaine `journal`.

**Mesuré** : la route existe (`src/api/journal.ts:579`) et sa garde est
`config: { acces: { action: 'lire', domaine: 'journal', perimetre: 'groupe' } }`
(ligne 595). Le domaine `journal` n'est porté que par le profil **ADMIN** — l'exploitant, en
tant que tel, ne l'a pas. Non authentifié, la route rend 401 (mesuré :
`curl https://grc.exemple.interne/api/session` → `401`).

**Et la tâche est désormais couverte ailleurs** : `install.sh --diagnostic`, joué ce jour,
rend `ok journal — ajout seul, chaîne intacte — chaîne entière (902 entrées)`. Le §1 du
guide présente d'ailleurs le diagnostic comme remplaçant trois commandes ; celle-ci n'a pas
suivi.

**Ce qu'il faudrait faire** : mettre `install.sh --diagnostic` dans la colonne « Commande »
et garder la route en note, avec la mention qu'elle demande une session d'administration
Groupe. (Voir Q-272 pour la réserve de fond sur ce que la vérification ne voit pas.)

---

### 🔵 Q-277 — L'auditeur externe : une exclusion oubliée sur quatre

**Énoncé.** `GUIDE_UTILISATEUR.md:240` : « **lecture seule**, sur presque tout — mais pas
sur le journal d'audit, ni sur les droits, ni sur les paramètres ».

**Mesuré** : `AUDITEUR` porte **26 domaines sur 30**, tous en `lecture`. Les quatre absents
sont `droits`, `filiales`, `journal`, `parametres` — le guide en cite trois et oublie
**`filiales`**.

Le « presque tout » couvre l'approximation, et l'incidence pratique est nulle (un auditeur
externe n'a rien à faire dans la gestion des filiales). Je le consigne parce que la même
liste, écrite à un domaine près, est aussi celle du RSSI (Q-269) et que l'exhaustivité est
ce qui distingue un guide de droits d'une paraphrase.

**Ce qu'il faudrait faire** : ajouter `filiales` à l'énumération, dans les deux sections.

---

### 🔵 Q-278 — « Exportez d'abord » : l'administrateur n'a pas le droit d'export

**Énoncé.** `GUIDE_UTILISATEUR.md:266`, sur le geste **irréversible** :

> « **Faire sortir une filiale** | Administration | ⚠️ **Exportez d'abord.** Une filiale
> sortie disparaît de tous les périmètres, et l'exporter après demanderait de contourner le
> cloisonnement. »

**Mesuré** : `GRC-ADMIN` **n'accorde pas** l'export.

```
select nom, perimetre, accorde_admin, accorde_export from groupes_ad
 where nom ilike '%ADMIN%' or nom ilike '%EXPORT%';

 GRC-ADMIN  | transversal | t | f
 GRC-EXPORT | transversal | f | t
```

C'est cohérent avec la doctrine du produit — *lire n'est pas extraire* —, que le même guide
énonce très bien en §7 et §10. Mais §8 prescrit un export en préalable d'une opération sans
retour, sans dire à l'administrateur qu'il lui faut **en plus** `GRC-EXPORT`, et qu'un
compte d'administration nu verra le bouton d'export rester inerte. Le compte de recette
`admin.grc` porte d'ailleurs les deux groupes, ce qui masque le défaut à qui teste avec lui.

Ce constat comptabilise aussi la note attenante de **Q-265** : le tableau du
`GUIDE_EXPLOITATION.md:104` annonce « trois familles de groupes » là où l'engendreur en
produit quatre.

**Ce qu'il faudrait faire** : ajouter « (nécessite `GRC-EXPORT` en plus de `GRC-ADMIN`) » à
la ligne « Faire sortir une filiale », et compléter le tableau des familles.

---

## 4. Les commandes que j'ai réellement jouées

**34 commandes**, toutes sur `SRV-Infra`, aucune destructive.

### Scripts de déploiement

| # | Commande | Résultat |
|---|---|---|
| 1 | `sudo bash backend/deploy/install.sh --diagnostic` | **12 conformes, 1 réserve (`SMTP_ACTIF=non`), 0 bloquant** ; les 12 sujets annoncés par le guide sont bien les 12 rendus |
| 2 | *idem, code de retour isolé* | **code 1** — conforme à la promesse « 0/1/2 » du §1 |
| 3 | `sudo bash backend/deploy/install.sh --verifier-publication` | `ok publication conforme : 81 fichier(s) servis identiques au dépôt`, **code 0** |
| 4 | `sudo bash backend/deploy/groupes-ad.sh --csv` | **23 groupes**, en-tête portant bien l'avertissement cité par le guide §2 |
| 5 | `sudo bash backend/deploy/groupes-ad.sh --verifier` | `ok groupes_ad : les 23 groupes de la convention sont déclarés, et rien d'autre`, **code 0** |
| 6 | `sudo bash backend/deploy/groupes-ad.sh --powershell --ou '…'` | script `New-ADGroup` engendré, 23 groupes |
| 7 | `sudo bash backend/deploy/groupes-ad.sh --aide` | six options, dont deux non documentées par le guide (Q-271) |
| 8 | `grep -n -- '--[a-z-]*)' backend/deploy/install.sh` | 9 options : `--maj --seulement-base --reprendre-propriete --reinitialiser-mots-de-passe --verifier-publication --diagnostic --assistant --desinstaller --avec-les-donnees` — **toutes celles que les guides citent existent** |

### Services, minuteurs, réseau

| # | Commande | Résultat |
|---|---|---|
| 9 | `sudo systemctl is-active cyber-grc apache2 postgresql clamav-daemon` | `active` × 4 |
| 10 | `sudo systemctl list-timers --all 'cyber-grc*'` | 2 minuteurs : `cyber-grc-reanalyse.timer` (dernier 09/09 00:18), `cyber-grc-notifications.timer` |
| 11 | `sudo systemctl status cyber-grc-reanalyse` | `inactive (dead)`, dernier passage code 0 |
| 12 | `sudo journalctl -u cyber-grc-reanalyse -n 12` | **le §4 quater est vrai, et vérifié sur cette machine** : passage du 08/09 → `Intégrité : 2 pièce(s) rapprochée(s), 1 conforme(s), 1 écart(s)` puis `Main process exited, status=1/FAILURE` — le code 1 sur écart, exactement comme annoncé |
| 13 | `sudo systemctl status cyber-grc-notifications.timer` | `active (waiting)`, armé depuis 4 jours |
| 14 | `curl -w '%{http_code} %{ssl_verify_result}' https://grc.exemple.interne/` | **200**, `ssl_verify_result=0` |
| 15 | `curl https://grc.exemple.interne/api/session` | **401** `non_authentifie` — conforme au §6 |
| 16 | `curl https://grc.exemple.interne/api/donnees` | **401** |
| 17 | `sudo grep NODE_ENV /etc/cyber-grc/env` | `NODE_ENV=production` |
| 18 | `cd backend && npm audit --omit=dev` | `found 0 vulnerabilities` — la ligne mensuelle du §3 tient |

### Annuaire

| # | Commande | Résultat |
|---|---|---|
| 19 | `sudo docker exec grc-ad samba-tool group list` | **23 groupes `GRC-*`** + `equipe-secu-tls` ; `GRC-ADMIN` présent, **`GRC-GROUPE-ADMIN` absent** (Q-265) |

> ⚠️ **Je n'ai éprouvé aucun cas négatif d'authentification** : le verrouillage tombe à cinq
> tentatives et les comptes de recette sont partagés. Les affirmations de droits ci-dessus
> sont mesurées **dans la base et dans le code**, jamais par une tentative de connexion.

### Base de données

| # | Commande | Résultat |
|---|---|---|
| 20 | `select … from profils` | **8 profils**, tous `socle` et `actif` : ADMIN, AUDITEUR, CONTRIB, DIRECTION, DPO, QUALITE, RH, RSSI — le guide en couvre bien huit |
| 21 | `select … from profil_domaines join profils` | la table complète des droits — base de Q-268, Q-269, Q-270, Q-277 |
| 22 | `select pg_get_constraintdef(…) where conname like '%domaine%'` | **30 domaines** au total |
| 23 | `select nom, perimetre, accorde_admin, accorde_export from groupes_ad …` | `GRC-ADMIN`(admin, **pas** export) / `GRC-EXPORT`(export, pas admin) — Q-278 |
| 24 | `select count(*) from groupes_ad where lower(nom)='grc-groupe-admin'` | **0** — Q-265 |
| 25 | `select action, count(*) from journal_audit group by action` | 18 actions distinctes, 902 entrées ; `suppression` 53, `modification` 49 |
| 26 | `select count(*) from jsonb_object_keys(valeurs_avant) … action='suppression'` | **13 clés** — Q-264 |
| 27 | `select count(*) from information_schema.columns where table_name='risques'` | **16 colonnes** — Q-264 |
| 28 | `select valeurs_avant … action='suppression'` | l'enregistrement entier, `nom` et `description` compris — Q-264 |
| 29 | `select … from journal_audit where action='modification'` | **1 clé** avant / 1 après — le différentiel existe, mais pour la modification |
| 30 | `select count(*) from pieces_a_purger` *(sous `grc_lecture`)* | **refus RLS attendu** : « Périmètre non positionné » — le cloisonnement mord ; la file n'a pas été lue autrement |

### Dépôt et code

| # | Commande | Résultat |
|---|---|---|
| 31 | `node -e "listerEntites()"` sur `dist/entites` | **23 entités** — la phrase « L'écran Imports couvre les 23 entités » du guide est **exacte** (c'est le commentaire de `src/import/index.ts`, qui dit « vingt », qui est périmé — hors périmètre) |
| 32 | extraction des entrées de menu de `index.html` | **31 entrées** ; *Vision Groupe*, *Approbations*, *Socle de risques*, *Référentiels applicables*, *Imports*, *Journal d'audit* existent — **aucune « Administration »** (Q-266) |
| 33 | `grep -rn "api/filiales\|sortie-filiale\|purge-rgpd" cyber-gouvernance_V4/js/` | **aucun appel** — Q-266 |
| 34 | vérification des six renvois croisés des guides | `CONVENTIONS.md` **§12** (l. 500) ✅, **§34.3** (l. 2269) ✅, **§37.5** (l. 2491) ✅ ; `backend/README.md` **§6** (l. 644) ✅ ; `INSTALLER.md` ✅ ; `deploy/retention.sh` ✅ existe |

### Ce que je n'ai PAS joué, et pourquoi

| Commande | Motif |
|---|---|
| `db/dev/preparer_base_dev.sh` | **interdit** — ramènerait les rôles au mot de passe `dev` et casserait le service installé (Q-81) |
| `install.sh --maj` | modifie l'état servi ; hors mandat d'un auditeur |
| `install.sh --desinstaller [--avec-les-donnees]` | destructif |
| `install.sh --reinitialiser-mots-de-passe`, `--reprendre-propriete` | modifient la base |
| `install.sh --assistant` | écrit la configuration ; **vérifié par lecture** (`install.sh:586,679,818-836,959-962`) |
| `deploy/retention.sh` (même `--simuler`) | touche le journal d'audit, la seule table qui fait preuve. **Vérifié par lecture** : les quatre étapes du §5 du guide sont bien celles du script — export, **ancrage `journal.ancrage_<annee>` dans `parametres`** (l. 24-25), désactivation/suppression/réactivation, journalisation ; et le script **refuse** si l'ancrage ne correspond pas au premier maillon survivant (l. 233-240). ✅ Le §5 est exact |
| toute tentative de connexion échouée sur `grc-ad` | verrouillage à cinq tentatives |

---

## 5. Ce qui est bon — et il y en a

Une porte qui ne dit que le négatif ne se lit pas. Ce qui suit a été **mesuré**, pas
supposé, et tient :

**Le guide d'exploitation**

- **Le §4 quater sur l'intégrité des pièces jointes est exemplaire, et il est vrai.** Les
  deux cadences annoncées — « 30 jours, 2 000 pièces » pour l'empreinte, « 90 jours et 500 »
  pour l'antivirus — sont exactement `DELAI_INTEGRITE_JOURS_PAR_DEFAUT = 30` et
  `DELAI_REANALYSE_JOURS_PAR_DEFAUT = 90` (`src/pieces/exploitation.ts:189,322`). Les trois
  verdicts `conforme` / `ecart` / `fichier_absent` sont ceux du journal réel, et **le code de
  sortie 1 sur écart a été constaté au journal du 08/09**. Le paragraphe final — *« ne
  présentez pas ce contrôle comme une garantie d'intégrité ; présentez-le pour ce qu'il est,
  une détection d'écart »* — est le genre d'honnêteté que le reste du document devrait imiter
  partout (cf. Q-267, Q-272).
- **Le §4 bis est là, complet, et au bon endroit.** L'avertissement demandé — une reprise
  « remplacer » **détruit les pièces jointes** de l'état remplacé depuis la migration `017` —
  est écrit **deux fois** : en pointeur au §4 (l. 204-205, dans la section des sauvegardes,
  où l'exploitant le lira avant d'agir) et en développement au §4 bis (l. 217-228), avec la
  précision qui compte — *« le fichier `grc-backup` ne transporte pas les pièces jointes : il
  ne les rendra donc pas »* — et l'exclusion explicite du mode « fusionner ». Les deux
  exceptions (quarantaine, journal) et le refus `GRC05` y sont. **Rien à redire.**
- **Le §4 ter** décrit correctement les deux nouveautés des migrations `018`/`019`, `GRC06`
  et le 409 compris ; les deux codes existent bien dans `src/`.
- **Le §5 sur la rétention est exact**, y compris son point le plus subtil : l'ancrage de
  l'empreinte du dernier maillon archivé, et l'avertissement « sautez l'étape 2 et vous
  détruisez la seule preuve ». Le script `retention.sh` l'impose réellement.
- **Le §7, tableau de diagnostic**, est un vrai retour d'expérience : chacune de ses six
  lignes correspond à un défaut effectivement rencontré et consigné au registre.
- **Les six renvois croisés sont tous justes** — c'est rare, et ce n'était pas acquis.
- **Le §1 est à jour du 08/09** : il intègre `--assistant` et `--diagnostic`, livrés
  l'avant-veille, et sa mise en garde « un diagnostic vert ne vaut pas passage de porte » est
  exactement la bonne.

**Le guide utilisateur**

- **Le §0 « Un tiret n'est pas un zéro »** est la meilleure page des deux documents : elle
  explique une décision de conception fine, et la justifie par l'usage (preuve en audit).
- **Les sections 4 (Qualité), 5 (DPO) et 6 (RH) sont exactes au domaine et au niveau près.**
  Vérifié une par une contre `profil_domaines` : `QUALITE` = audits/revues/documents en
  contribution, exigences/mesures/référentiels en lecture, et **`cartographie: aucun`** —
  le guide cite ce dernier point *nommément*, et il est bien dans la base. `DPO` = rgpd en
  validation, incidents en contribution, documents et personnel en lecture. `RH` = personnel
  en contribution, incidents et rgpd en lecture. **Trois profils sur huit, sans une erreur.**
- **Le compte des domaines du contributeur est juste** (quatre, et les bons) — seule
  l'illustration qui suit est fausse (Q-270).
- **Tous les écrans nommés existent** et portent le libellé cité : *Vision Groupe*,
  *Synthèse Direction*, *Échéancier*, *Approbations*, *Socle de risques*, *Référentiels
  applicables*, *Imports*, *Journal d'audit*, *Risques (EBIOS)*, *Personnel*. Seul
  « Administration » manque (Q-266).
- **« L'écran Imports couvre les 23 entités » est exact** — mesuré 23. Le guide est ici
  **plus juste que le code**, dont le commentaire annonce encore « vingt configurations ».
- **Le §10, « Quand quelque chose refuse »**, est la bonne idée du document : traduire six
  messages en cause et en geste. Ses six lignes sont fidèles au modèle.
- **Le §9 sur la langue est vrai aujourd'hui** : `langue_defaut` est bien joint par
  `GET /api/session` (`src/api/index.ts:1486`) et lu par `js/core/session.js:125`. La
  famille Q-168 est fermée, et le guide dit juste.

**Sur la forme, enfin** : les deux guides sont écrits pour être **lus par la bonne personne
au bon moment** — « pour qui », « ce que ce guide n'est pas », et la règle « quand les deux
se contredisent, c'est le README qui a raison et ce fichier qui est périmé — dites-le ». Ce
rapport est, en un sens, l'exercice de ce droit.

---

## 6. Remarques hors périmètre

Signalées sans être comptées, l'auditeur de L11 ou l'orchestrateur en décidera :

1. **`docs/INSTALLER.md`** (lot L18) se contredit : bandeau « dix commandes » (l. 3) contre
   titre « Les cinq commandes » (l. 35). Source de Q-275.
2. **`backend/src/import/index.ts:2`** et `moteur.ts:2` annoncent « **vingt** configurations
   dérivées » ; `listerEntites()` en rend **23**. Le guide utilisateur est à jour, le
   commentaire du code non.
3. **`cyber-gouvernance_V4/js/i18n/index.js:148`** porte encore l'avertissement *« ce que le
   serveur n'envoie pas encore : `filiales.langue_defaut` […] ne figure PAS dans le bloc
   `filiale_active` »*, daté du 05/09 — **et il est faux depuis le même jour**
   (`src/api/index.ts:1476-1486` l'ajoute, avec un commentaire disant précisément qu'il l'a
   ajouté). Le repli défensif ne casse rien, mais c'est un commentaire qui décrit ce qu'il
   croit : le motif exact que ce rapport traque.
4. **`CLAUDE.md` §3** décrit « 26 modules métier » ; il y en a **33** dans
   `js/modules/`. J'ai failli en tirer un constat contre le guide utilisateur avant de
   mesurer — le guide avait raison, la mémoire projet est périmée.

---

## 7. Ce qu'il faut retenir

Les quinze constats se rangent en deux familles, et une seule compte vraiment.

**Neuf sur quinze sont des affirmations qui étaient vraies et ne le sont plus** — le profil
Direction corrigé par la migration `016`, l'outil `--powershell` livré le 08/09, la langue de
filiale jointe le 05/09, la version anglaise dont la dépendance est levée. Aucune n'était un
mensonge à l'écriture. Toutes sont devenues fausses **parce que le produit a avancé et que le
document ne l'a pas suivi** — c'est-à-dire le fonctionnement normal d'une documentation qui
n'est mordue par rien.

**Six sont d'une autre nature** : Q-264, Q-265, Q-266, Q-267, Q-269 et Q-270 n'ont **jamais**
été vraies. Le journal n'a jamais stocké un différentiel à la suppression ; `GRC-GROUPE-ADMIN`
n'a jamais existé ; l'écran d'administration n'a jamais été livré ; `SMTP_CHIFFREMENT=aucun` a
toujours été une valeur acceptée ; le RSSI n'a jamais eu le domaine `journal` ; le
contributeur n'a jamais eu le domaine `documents`. Elles ont été écrites d'après ce que le
plan **prévoyait**, non d'après ce que la machine **fait** — et elles ont traversé une
livraison de lot sans que rien ne les arrête, parce que **aucun contrôle du dépôt ne confronte
ces deux fichiers au produit**.

C'est le fond du constat, et il dépasse les quinze : le chantier sait, depuis la porte S8,
qu'*écrire la règle dans un commentaire ne suffit pas — il faut qu'une machine la vérifie*
(règle 3, issue de Q-215). **Cette leçon n'a jamais été appliquée à la documentation.** Les
droits par profil, les noms de groupes AD, les codes d'erreur, les libellés de menu et les
options de scripts que citent ces deux guides sont tous **découvrables mécaniquement** — dans
`profil_domaines`, dans la sortie de `groupes-ad.sh --csv`, dans `index.html`, dans les
`--aide`. Un essai qui extrait ces citations des guides et les confronte à la source aurait
attrapé **onze des quinze constats de ce rapport**, dont trois des quatre bloquants.

Tant qu'il n'existe pas, chaque passage de porte re-mesurera à la main ce qu'une machine
devrait dire en trois secondes — et le lot L14 vieillira de nouveau à la livraison suivante.

