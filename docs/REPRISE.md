# Reprendre le chantier — document de passation

> **Écrit le 16/09/2026.** Il s'adresse à une session Claude Code qui reprend le travail
> sans rien connaître de ce qui précède. Il ne remplace pas `CLAUDE.md` : il dit **ce qui a
> changé récemment**, **ce qui reste**, et **les pièges qui ont coûté cher**.

---

## 1. L'objectif, en une phrase

**Mener le logiciel jusqu'à complet et fonctionnel**, sans bug, avec une interface
**élégante et extrêmement professionnelle** — puis l'utilisateur lancera un `ultrareview`,
et l'on corrigera et sécurisera à partir de son retour.

---

## 2. Les cinq arbitrages de l'utilisateur qui priment sur les documents antérieurs

Ils sont datés, ils ont été rendus explicitement, et **aucun ne se re-débat**.

| | Arbitrage | Conséquence pratique |
|---|---|---|
| **A** | **On arrête les passages de porte** (14/09) | Ne pas rejouer S7/S8. Les constats ouverts du `PLAN_EXECUTION.md` §7 seront traités **avec** le retour de l'`ultrareview`, pas avant. Motif mesuré : 34 rapports pour 28 690 lignes, et **rien en classe 1 ou 2** aux trois derniers passages |
| **B** | **On construit jusqu'à complet** (15/09) | Suivre `docs/PLAN_ACHEVEMENT.md`. Six vagues, ordonnées par **ce qui se voit** |
| **C** | **Le frontend sera refait**, mais **son style se soigne dès maintenant** (15 puis 16/09) | Ne pas bâtir d'écrans jetables ; ne pas bâcler la couche API — c'est elle que le frontend neuf consommera. Mais **soigner le style** |
| **D** | **Style : avec la skill `ui-ux-pro-max`** (16/09) | `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux`. Elle **arbitre**, elle n'impose pas de palette. Pas de `--design-system`, pas de `--stack` |
| **E** | **AUCUN EMOJI**, style élégant et extrêmement professionnel (16/09) | Gardé par `backend/test/depot/aucun-emoji.test.mjs`. Les signes **typographiques** (`→`, `▸`, `·`, `—`) restent permis : ce sont du texte |

---

## 3. Comment jouer le banc — et pourquoi c'est important

```bash
cd backend && npm run banc          # deux passes, ≈ 11 min
cd backend && npm run banc:rapide   # sans les familles navigateur, ≈ 2 min
npm run verifier-types
```

**Ne jamais lancer `node --test` sur tout le dépôt sans `--test-concurrency`.** Mesuré : la
concurrence par défaut lance une trentaine de Chromium, la machine tombe à 134 Mio libres,
et des familles restent bloquées quarante-cinq minutes en ayant consommé cinq secondes de
processeur.

**Ne jamais lancer deux bancs complets en parallèle.** Un banc a tourné **6 h 03**, figé sur
un fichier qui passe en **six secondes** joué seul. `npm run banc` pose désormais un délai de
garde de six minutes par fichier — *un essai doit rougir, jamais se figer*.

**Méthode :** les familles touchées pendant le travail ; le banc **complet une seule fois**,
avant de commiter.

Répartition mesurée : les 115 familles sans navigateur passent en **126 s à concurrence 4** ;
les 19 qui lancent Chromium prennent **520 s** et doivent rester **en série**.

---

## 4. Où en est le travail

### Livré et déployé depuis le 14/09

| | |
|---|---|
| **Jeu de découverte** (L18 bis) | Un groupe industriel fictif complet. Marque de provenance posée **par la base**, inforgeable. Migration `032` |
| **Menu repliable** (L17, A2) | 32 entrées à plat → six sections |
| **Architecture des sections** (16/09) | **Sept** sections, **28** entrées : quatre vues redondantes deviennent des **onglets** (matrice, socle, référentiels applicables, couverture croisée), et la couverture — qui n'avait AUCUNE porte — en gagne une. Le fil d'Ariane déduit sa section du menu. `docs/PLAN_INTERFACE.md` |
| **Lien document ↔ mesure** (L19, 19.3) | « Montrez-moi la procédure » : le chaînon qui manquait entre la gouvernance et la preuve. Migration `036`, schéma **v15** |
| **Contrôle périodique et efficacité** (L19, 19.5 / 19.6) | Un contrôle se rejoue (fréquence, dernier passage, **échéance dérivée**) et son efficacité se constate **séparément de sa maturité**. Migration `037`, schéma **v16** |
| **Recherche globale + `Ctrl+K`** (L17, A3) | Cloisonnée par la RLS, bornée par les droits, budget de trace partagé avec le sondage |
| **Attestation de lecture** (L19, 19.1) | Preuve ISO 27001 A.5.1. Migration `033` |
| **Horloge réglementaire** (L20, 20.1) | Trois paliers NIS2 + 72 h RGPD, dérivés. Migration `034` |
| **Dérogations datées** (L19, 19.2) | L'état est **dérivé**, jamais stocké : une dérogation échue redevient une non-conformité sans qu'aucun traitement n'ait à repasser. Approbation par le circuit L8, inchangé. Migration `035`, schéma **v14** |
| **Les trois écrans qui manquaient** (16/09) | 19.1, 19.2 et 20.1 étaient livrées côté serveur et **aucun écran ne les appelait** — `documents.attestation_requise` n'était même posable par aucun formulaire |
| **Passe de style** | Échelle typographique, chasse fixe pour ce qui se recopie, tableaux (en-tête collant, nombres alignés), impression |

⚠️ **La leçon du 16/09, et elle vaut pour toute la suite** : *une capacité qu'aucun écran
n'appelle est une capacité absente.* Trois lots de suite ont été livrés, éprouvés et verts
sans que personne puisse s'en servir. Un lot n'est fini que lorsqu'un utilisateur peut
l'atteindre — et c'est `test/modules/non-regression.test.mjs` qui le dit, en comptant les
modules du produit.

### Ce qui reste — dans cet ordre

**Vague B, à finir :**

- ~~**19.2** dérogations datées~~ — ✅ **livré le 16/09** (migration `035`) ;
- ~~**19.3** lien document ↔ mesure~~ — ✅ **livré le 16/09** (migration `036`) ;
- **19.4** réutilisation d'une preuve — ⚠️ **le point dur** : le déclencheur
  `f_pieces_suivent_leur_porteur()` (migration `017`) supprime une pièce avec son porteur.
  Seule la suppression du **dernier** rattachement doit libérer le fichier ;
- ~~**19.5** contrôles périodiques ; **19.6** efficacité ≠ maturité~~ — ✅ **livrés le 16/09** (migration `037`) ;
- **20.3** AIPD ; **20.4** demandes d'exercice de droits ; **20.5** main courante de crise
  (**en ajout seul**, comme le journal — elle réutilise les quatre couches du §12).

**Puis** : vague C (L21 tiers et DORA, L24 campagnes), vague D (L25 EBIOS RM, L26 catalogues
ouverts), vague E (L22 ouverture technique, L23 collecte automatique), vague F (L27 IA
locale, L28 portail fournisseur — en dernier, seules surfaces externes).

**Et le frontend**, en parallèle : voir §6.

**L'indicateur** : `docs/COMPARATIF_MARCHE.md` — 86 fonctionnalités, **35 ✅ au 08/09**,
cible **76**. Il se **rejoue**, il ne s'estime pas.

---

## 5. Les pièges qui ont coûté le plus cher — à lire avant d'écrire une migration

1. **Une colonne engendrée doit être déclarée `colonnesReservees`** dans
   `src/entites/index.ts`, sinon le registre refuse le démarrage. *Deux lots de suite s'y
   sont pris.*
2. **`f_poser_tracabilite_insertion()` existe** : on l'APPELLE, on ne réécrit pas son
   déclencheur. Et il faut **aussi** poser le `before update` (`f_maj_tracabilite()`), sans
   quoi `version` cesse d'être un compteur.
3. **Le registre de l'article 30 exige les quatre champs structurés** pour une colonne
   `personnelle` : finalité, base légale, durée, régime d'expiration. Et `signaler` est un
   **régime d'expiration**, jamais une **nature**.
4. **Ne jamais recopier une fonction de garde depuis la migration qui l'a créée** : une
   migration ultérieure l'a peut-être étendue, et la copie **efface** son extension. Le bon
   motif est au §4 de la `027` — lire la fonction **telle qu'elle est appliquée**, insérer à
   côté de son modèle, et **refuser d'agir si le texte a changé**.
5. **Une unicité sur une table cloisonnée doit porter `filiale_id`**, ou être **déclarée**
   dans `f_verifier_unicite_cloisonnee()` avec son motif.
6. **`avecPerimetre()` ANNULE sa transaction par défaut** : `{ annuler: false }` pour semer.
7. **`monterGreffon()` attend le périmètre de l'API** (`utilisateurId`), pas celui du banc
   (`utilisateur`). Le mélange rend un 500 dont la pile désigne `validerPerimetre`.
8. **`personnes.utilisateur_id` référence `utilisateurs.id`**, pas l'identifiant de
   connexion. `perimetre.utilisateurId` porte lui aussi cet `id`.
9. **Un `resume` de journal est une phrase du développeur** : aucune valeur interpolée
   (§29.5). Les chiffres vont dans `valeursApres`, en jsonb. Un contrôle statique le vérifie.
10. **Toute route neuve se déclare** dans `test/api/routes.test.mjs`, et tout fichier importé
    doit être **commité dans le même commit**.
11. **Un garde-fou ÉPROUVE, il ne reconnaît pas un mot** (`CONVENTIONS.md` §39). Et **le
    balayage part du CATALOGUE, jamais d'une liste**.
12. **Une table neuve entre dans TROIS mécanismes** (`CONVENTIONS.md` §40, posé le 16/09) :
    le domaine **`type_entite`** (sans quoi elle est **incréable**, toute création écrivant
    au journal), ses **politiques RLS**, puis **`f_poser_declencheurs_pieces()`** — *dans
    cet ordre*, parce que la découverte des tables porteuses exige que la politique de
    suppression existe déjà. Les trois défauts ont été trouvés par des garde-fous, aucun
    par relecture.

---

## 6. Le frontend — ce qui est décidé, et ce qui reste

**Décidé et à ne pas rouvrir :**

- charte **orange `#E9631B`** (action, marque) et **bleu `#2059A6`** (structure) ; quatre
  couleurs sémantiques **réservées aux statuts** ;
- **aucune police chargée depuis un réseau** — la règle « aucun CDN runtime ni service
  tiers » tient. La skill propose des appariements Google Fonts : **les refuser**. Pile
  système, définie dans `css/tokens.css` ;
- **aucun gestionnaire en ligne** (`onclick=`…) : la CSP du vhost les bloque, et
  l'application a été livrée un temps sans fonctionner pour cette raison ;
- **aucun emoji** (arbitrage E). Icônes **SVG** ou signes typographiques ;
- **l'identifiant se lit dans un attribut du DOM au moment du clic**, jamais capturé en
  fermeture : le serveur réattribue les identifiants à la création.

**Ce qui reste à faire, par ordre d'effet :**

1. **Cohérence de la densité** — l'échelle typographique existe désormais
   (`--text-xs` … `--text-2xl`) ; **les 26 modules ne l'emploient pas encore** et posent
   leurs tailles au cas par cas. C'est le plus gros gain visuel restant.
2. **Les styles en ligne** — les modules portent beaucoup de `style="..."`. Les remonter
   en classes rend l'ensemble homogène et rend le prochain changement possible.
3. **Écran de démarrage par rôle** (L17, A4) et **Kanban du plan d'actions** (A5).
4. **États vides** — chaque écran doit **dire pourquoi** il est vide. Un vide sans
   explication apprend à ne plus croire ce qu'on montre (classe Q-201 / Q-207).
5. **Impression** — la sortie papier est une **pièce d'audit** ; elle mérite une relecture
   écran par écran.

⚠️ **Vérifier dans un vrai navigateur, et pas seulement au banc.** Le défaut du 16/09 en est
la démonstration : la palette `Ctrl+K` **ne se fermait pas** — `display: flex` dans une règle
de classe écrase le `[hidden]` du navigateur — et l'essai était **vert**, parce qu'il
mesurait la **propriété** `hidden` au lieu de la **visibilité réelle**. *Un essai qui mesure
le drapeau au lieu de l'écran ne mesure pas l'écran.*

---

## 7. La boucle de livraison

```bash
cd backend && npm run banc && npm run verifier-types
cd .. && git add <les fichiers, explicitement>   # jamais « git add -A »
git commit && git pull --rebase origin main && git push origin main
sudo bash backend/deploy/install.sh --maj
sudo bash backend/deploy/install.sh --verifier-publication
```

⚠️ **La dernière ligne n'est pas décorative — constat Q-103** : le dépôt était vert pendant
que la machine servait encore l'ancien fichier.

⚠️ **Republier passe TOUJOURS par `install.sh --maj`**, jamais par une copie à la main : le
jeton de version d'`index.html` dérive du contenu, et une copie manuelle sert un fichier que
les navigateurs gardent en cache un mois.

**Après une migration**, réancrer les chiffres du `backend/README.md` §8 — le banc les
confronte au catalogue et rougit sinon : migrations, garde-fous, tables, politiques, clés
étrangères, tables portant `cree_par`, clés composites, décisions au registre.

---

## 8. L'environnement — mesuré, pas supposé

Tout tourne **sur cette machine** : base, annuaire AD simulé (`grc-ad`), serveur, Apache.
La recette est en ligne en permanence sur `https://grc.exemple.interne/`, en profil
**`decouverte`** depuis le 15/09.

**Avant d'écrire qu'une chose est impossible ici, l'essayer.** Trois affirmations fausses sur
l'environnement ont coûté du travail — la règle est au `CLAUDE.md` §0, et elle prime.

Secrets, comptes de recette et lancement du banc : `CLAUDE.local.md` et `SECRETS.local.md`
(hors dépôt).
