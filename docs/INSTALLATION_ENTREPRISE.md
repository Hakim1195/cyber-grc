# Première mise en service chez le client — le déroulé

> **Ce document est un DÉROULÉ, pas un tutoriel.** Il sert une fois : le jour où le produit
> entre pour la première fois sur la VM d'une entreprise, avec un vrai Active Directory, un
> vrai certificat et de vraies données.
>
> | Document | Ce qu'il fait | Quand le lire |
> |---|---|---|
> | [`INSTALLER.md`](INSTALLER.md) | **le chemin** — cinq commandes, une page | pour découvrir, ou quand on connaît déjà |
> | **celui-ci** | **la préparation, l'ordre, et les portes de contrôle** | avant la première mise en service réelle |
> | [`GUIDE_EXPLOITATION.md`](GUIDE_EXPLOITATION.md) | **la vie d'après** — sauvegardes, rétention, acquisitions, pannes | une fois en service |
>
> ⚠️ **Il ne recopie aucun chiffre des deux autres** : deux listes des mêmes choses
> divergent, et la divergence est silencieuse (constat **Q-275**). Quand il a besoin d'un
> compte, il donne **la commande qui le rend**.

---

## 0. Les trois choses qui font échouer une première installation

Elles ne sont pas techniques, et aucune ne se voit dans un message d'erreur clair. Les voici
avant tout le reste, parce que **chacune se prépare des jours à l'avance, auprès de
quelqu'un d'autre que vous**.

| | Ce qui bloque | Pourquoi ça ne se voit pas | Auprès de qui |
|---|---|---|---|
| **1** | le **certificat TLS** n'est pas en place | en production l'installateur **n'en engendre AUCUN** : Apache refuse de démarrer, et l'erreur parle d'un fichier, pas d'un certificat | l'équipe PKI / sécurité |
| **2** | l'unité systemd **ferme la sortie réseau** (`IPAddressDeny=any`) | le service démarre, l'installation dit « terminée », et **aucune connexion n'aboutit** — le contrôleur de domaine est injoignable depuis le service, alors qu'il répond depuis le shell | l'équipe réseau (adresse du DC, du résolveur DNS, du relais SMTP) |
| **3** | **personne n'est membre de `GRC-ADMIN`** | le produit est installé, l'annuaire répond, les comptes se connectent… et **aucun d'eux ne peut rien administrer**. Un compte sans groupe `GRC-*` reçoit **403** : authentifié, sans aucun droit | l'administrateur du domaine |

🛑 **Le troisième est le plus vicieux, et il mérite d'être compris avant le jour J.** Le
produit sépare **authentification** et **autorisation** : le mot de passe est vérifié par
l'annuaire (liaison LDAP sous le nom distinctif de l'utilisateur), mais **les droits viennent
de l'appartenance aux groupes `GRC-*`**. Il n'existe **aucun** administrateur par défaut,
aucun compte « admin/admin », et c'est délibéré — un compte d'administration livré avec le
produit est une porte que personne ne referme.

**Conséquence pratique** : désignez **nommément**, avant le jour J, la personne qui sera le
premier administrateur, et faites-la mettre dans `GRC-ADMIN` **dans le même geste** que la
création des groupes.

---

## 0 bis. Le PREMIER ACCÈS ADMINISTRATEUR — la question qu'il faut se poser avant

> *« Comment on fait le premier accès admin au logiciel ? »* — question de l'utilisateur,
> 25/09/2026. Elle mérite sa section, parce que la réponse surprend.

🛑 **IL N'EXISTE AUCUN COMPTE ADMINISTRATEUR LIVRÉ AVEC LE PRODUIT.** Pas de `admin/admin`,
pas de mot de passe imprimé à la fin de l'installation, pas d'assistant de premier démarrage
qui crée un compte. *Un compte d'administration livré avec le produit est une porte que
personne ne referme.*

Le premier accès s'obtient en **mettant un vrai compte de l'annuaire dans `GRC-ADMIN`** :

| | Qui | Quoi |
|---|---|---|
| 1 | vous | `install.sh --assistant` — le produit **déclare aussitôt** les groupes attendus, `GRC-ADMIN` compris |
| 2 | vous | `groupes-ad.sh --powershell > creer-groupes-grc.ps1` |
| 3 | **l'administrateur du domaine** | exécute le script **et ajoute votre compte à `GRC-ADMIN`** (plus `GRC-EXPORT` si vous devez extraire des données) |
| 4 | vous | vous connectez avec **votre identifiant et votre mot de passe AD habituels**. « Administration » apparaît dans le menu |

⚠️ **Le mot de passe n'est jamais vérifié par le produit** : il est présenté à l'annuaire, qui
tranche (liaison LDAP sous le nom distinctif de l'utilisateur). Le produit ne stocke aucun mot
de passe d'utilisateur — la seule empreinte qu'il détienne est celle du compte de secours
ci-dessous, et une contrainte de base interdit à tout autre compte d'en porter une.

### 🛑 Votre voie de retour si l'annuaire tombe — elle n'est PAS posée automatiquement

⚠️ **En production, l'assistant ne crée AUCUN compte de secours.** Il ne le propose que si
vous répondez « non » à la question de l'annuaire, c'est-à-dire en profil découverte. En
l'état, donc : **si l'annuaire devient injoignable, ou si le mot de passe du compte de service
expire, plus personne n'entre.**

Les deux peuvent coexister — un annuaire actif **et** un compte de secours. Pour en poser un,
après l'installation :

```bash
# 1 — Calculer l'empreinte. Le mot de passe n'est JAMAIS écrit sur le disque : seule
#     cette empreinte scrypt entre dans la configuration. Douze caractères au minimum.
printf '%s' 'VotreMotDePasseDeSecours' | node --input-type=module -e "
const m = await import('file:///chemin/vers/cyber-grc/backend/dist/auth/secours.js');
const b=[]; for await (const c of process.stdin) b.push(c);
process.stdout.write(await m.engendrerEmpreinte(Buffer.concat(b).toString('utf8')));
"
# → scrypt$16384$8$1$…

# 2 — Déclarer les deux variables dans /etc/cyber-grc/env
#     AUTH_COMPTE_SECOURS_IDENTIFIANT=secours.grc
#     AUTH_COMPTE_SECOURS_EMPREINTE=scrypt$16384$8$1$…

sudo systemctl restart cyber-grc
```

⚠️ **C'est l'empreinte engendrée par le code du produit lui-même** qui entre dans la
configuration — jamais une empreinte calculée à la main dans un shell, dont le format
divergerait le jour où les paramètres `scrypt` changent.

Ce compte donne l'**administration Groupe**, et **chacun de ses usages est journalisé** —
réussi comme refusé. *Une porte dérobée dont personne ne sait qu'elle a servi n'est pas un
filet, c'est un trou.* Ce n'est **pas** la porte d'entrée : c'est le filet.

✅ **Comment savoir s'il est en place, sans ouvrir un fichier** : **Administration →
Habilitations → Groupes d'annuaire**, encart « Liaison Active Directory ». Il dit le
contrôleur, la base, le compte de service, et **si un compte de secours est configuré**.

---

## 1. Ce qu'il faut obtenir avant de toucher la VM

### 1.1 La machine

| | |
|---|---|
| Système | **Debian 13**, installation minimale |
| Ressources | 4 Go de RAM, 40 Go de disque — le disque porte la base **et les pièces jointes** |
| Accès | `root` ou `sudo`, et un terminal interactif (l'assistant en a besoin) |
| Sortie Internet | **uniquement pour l'installation** : PostgreSQL 17 vient du dépôt PGDG, et `npm` des dépendances. Elle peut être refermée après |

⚠️ **Le produit lui-même n'a pas besoin d'Internet pour fonctionner** — aucun CDN, aucun
service tiers. Ce qu'il lui faut, ce sont les **trois destinations internes** du §1.4.

### 1.2 Le nom et le certificat — le prérequis n° 1

Demandez à l'équipe réseau **un nom DNS** qui pointe vers la VM (par exemple
`grc.exemple.interne`), et à l'équipe PKI **un certificat serveur pour ce nom exactement**.

Puis déposez **trois fichiers**, aux chemins que le vhost livré attend :

```bash
sudo install -d -m 0755 /etc/ssl/cyber-grc
sudo install -m 0644 votre-certificat.crt   /etc/ssl/cyber-grc/serveur.crt
sudo install -m 0600 votre-cle-privee.key   /etc/ssl/cyber-grc/serveur.key
sudo install -m 0644 votre-chaine-ca.crt    /etc/ssl/cyber-grc/chaine-pki-interne.crt
```

🛑 **En profil PRODUCTION, l'installateur n'engendre rien.** C'est écrit dans son code, et
c'est voulu : *« un certificat auto-signé qui apparaît tout seul dans une installation
d'entreprise est un certificat que personne n'a décidé, et que les navigateurs refuseront —
en apprenant aux utilisateurs à passer outre les avertissements TLS. »*

⚠️ **Le nom du certificat doit couvrir le nom que les utilisateurs taperont.** L'installateur
le vérifie en interrogeant réellement le port 443 et en comparant au `SERVEUR_URL_PUBLIQUE`
que vous aurez donné — il ne se contente pas de lire un fichier.

⚠️ **Le vhost n'est installé que s'il est ABSENT.** Si vous l'adaptez à votre SI, une mise à
jour ne l'écrasera pas — mais elle ne le mettra pas à jour non plus. Le recopier à la main
est alors votre geste, pas celui du script.

### 1.3 Le compte de service de l'annuaire

Demandez à l'administrateur du domaine **un compte de service dédié**, et donnez-lui cette
liste telle quelle :

| | |
|---|---|
| Droits | **lecture seule** sur l'annuaire. Le produit **n'écrit jamais** dans l'AD — la capacité n'existe pas dans le code |
| Ce qu'il doit pouvoir lire | les objets utilisateur sous la base de recherche, et **les appartenances aux groupes, imbrications comprises** |
| Mot de passe | **qui n'expire pas**, ou un renouvellement planifié — le jour où il expire, **personne ne se connecte plus** |
| À nous transmettre | l'**URL LDAPS** (`ldaps://dc01.exemple.interne:636`), la **base de recherche** (`DC=exemple,DC=interne`), le **DN complet** du compte, son mot de passe |
| Et aussi | **le certificat de l'autorité qui signe le certificat LDAPS du contrôleur** |

⚠️ **Ce dernier point est oublié une fois sur deux.** Sans lui, la validation TLS de la
liaison LDAPS repose sur le magasin d'autorités du système, **qui ne contient pas la PKI
interne** : la liaison échoue. Déposez-le et déclarez-le :

```
# dans /etc/cyber-grc/env
LDAP_CA=/etc/ssl/cyber-grc/ca-annuaire.crt
```

**Les valeurs que vous n'avez pas à demander** — elles portent un défaut qui convient à un
Active Directory standard, et ne se changent que si votre annuaire est particulier :

| Variable | Défaut |
|---|---|
| `LDAP_FILTRE_UTILISATEUR` | `(&(objectClass=user)(sAMAccountName={login}))` |
| `LDAP_ATTRIBUT_IDENTIFIANT` | `sAMAccountName` |
| `LDAP_ATTRIBUTS_PROFIL` | `displayName, givenName, sn, mail, telephoneNumber, department, title` |
| `LDAP_PREFIXE_GROUPES` | `GRC-` |
| `LDAP_GROUPES_IMBRIQUES` | vrai — un compte membre d'un groupe lui-même membre d'un `GRC-*` reçoit le droit |

### 1.4 Les trois destinations à ouvrir — le prérequis n° 2

L'unité systemd est livrée avec `IPAddressDeny=any` et `IPAddressAllow=localhost`. C'est un
bac à sable réel : **le service ne peut joindre que la boucle locale**. Il faut donc autoriser,
une par une, les destinations dont il a besoin.

| Destination | Pourquoi | Sans elle |
|---|---|---|
| le **contrôleur de domaine** (LDAPS, 636) | authentifier, lire les groupes | personne ne se connecte |
| le **résolveur DNS** de l'entreprise | résoudre le nom du contrôleur | idem — *et seulement si `LDAP_URL` porte un nom ; avec une adresse littérale, la question ne se pose pas* |
| le **relais SMTP** (587) | les relances d'échéance | aucune relance ne part, en silence |

Cela s'écrit dans un **fichier d'extension**, jamais en modifiant l'unité livrée :

```bash
sudo systemctl edit cyber-grc      # ouvre un drop-in
```

```ini
[Service]
IPAddressAllow=10.20.30.40/32      # le contrôleur de domaine
IPAddressAllow=10.20.30.53/32      # le résolveur DNS, si LDAP_URL porte un nom
IPAddressAllow=10.20.40.25/32      # le relais SMTP, si vous activez les relances
```

⚠️ **N'écrivez JAMAIS `IPAddressAllow=any`** : la section entière cesse de filtrer, et vous
perdez la barrière sans que rien ne le dise.

✅ **Bonne nouvelle : l'installateur contrôle cette liste**, compare les adresses du
contrôleur et du résolveur à ce qu'elle couvre, et le **dit** — c'est un défaut mesuré qui
lui a valu ce contrôle (constat **Q-199** : le lot des notifications avait été livré dans une
configuration où il ne *pouvait pas* envoyer, et le banc était vert sur cette
configuration-là).

Côté **pare-feu** : `443/tcp` en entrée depuis le réseau des utilisateurs (ou le VPN), et les
trois sorties ci-dessus. Rien d'autre.

### 1.5 La liste des filiales

Code court et raison sociale, pour chaque entité à créer. Le code **nomme les groupes
d'annuaire** et **ne se modifie plus après coup** : `TLS` donnera `GRC-TLS-RSSI`,
`GRC-TLS-CONTRIB`, etc. Choisissez-les avec la personne qui gère l'annuaire.

⚠️ **Il en faut au moins une.** Sans filiale active, la session ne se résout pas et le produit
refuse de démarrer — c'est un refus franc, pas un écran vide.

### 1.6 Ce que ça fait de groupes à créer

**8 par filiale, plus 8 de niveau Groupe, plus 2 transversaux.** Pour trois filiales :
8 × 3 + 8 + 2 = **34 groupes**. Vous n'aurez pas à les écrire : l'étape 4 du §3 les engendre.

⚠️ **`GRC-ADMIN` n'existe qu'au niveau Groupe** — il n'y a pas d'administrateur d'une seule
filiale, parce qu'administrer l'application est un acte de portée Groupe.

---

## 2. La veille — préparer la VM

```bash
# 1. Le produit
sudo apt update && sudo apt install -y git
git clone https://github.com/Hakim1195/cyber-grc.git
cd cyber-grc

# 2. Le certificat (§1.2) — AVANT l'installation, sinon Apache ne démarrera pas
sudo install -d -m 0755 /etc/ssl/cyber-grc
#   … déposez serveur.crt, serveur.key, chaine-pki-interne.crt, ca-annuaire.crt

# 3. Vérifier que la VM atteint bien les trois destinations, DEPUIS LE SHELL
#    (ce n'est pas encore le service, mais si ça échoue ici, ça échouera là)
getent hosts dc01.exemple.interne
openssl s_client -connect dc01.exemple.interne:636 -brief </dev/null
```

⚠️ **Ne lancez pas `--assistant` la veille** : il écrit la configuration et installe. Faites-le
le jour J, quand l'administrateur du domaine est joignable.

---

## 3. Le jour J — dans cet ordre, avec ses portes

### Étape 1 — L'assistant

```bash
cd cyber-grc
sudo bash backend/deploy/install.sh --assistant
```

Il pose **six questions** : l'adresse publique, puis — si vous répondez **oui** à « raccorder
le produit à votre Active Directory maintenant » — l'URL LDAPS, la base de recherche, le DN du
compte de service et son mot de passe ; puis le relais de messagerie si vous voulez les
relances. Il vous fait ensuite **saisir vos filiales**.

Tout le reste porte un défaut sûr, et **les secrets internes sont engendrés** : il ne vous les
demandera jamais et ne les affichera jamais.

> 🛑 **Répondez OUI à la question de l'annuaire.** Répondre « non » pose une installation de
> **découverte** — délibérée, fonctionnelle, mais **qui n'est pas une production** : pas
> d'annuaire, pas de courriel, certificat auto-signé, et un compte de secours applicatif pour
> seule porte d'entrée. Elle le dit partout, y compris par un bandeau que personne ne peut
> fermer et **qui s'imprime avec les fiches**. *Un profil dégradé qu'on ne voit pas devient une
> production par oubli.*

⚠️ **Cette étape porte vos filiales EN BASE**, une seule fois, si la base n'en connaît aucune.
À partir de là **c'est la base qui fait foi**, et une acquisition se déclare dans le produit
(**Administration → Filiales**) — éditer `filiales.conf` n'agit plus.

**🚦 PORTE 1 — l'installation s'est-elle achevée ?** Si le script s'arrête en **code 2**, il
nomme ce qui manque dans `/etc/cyber-grc/env`. Complétez, relancez : **les secrets déjà
engendrés sont conservés**. Une installation à moitié faite est pire qu'une installation
refusée — c'est pour cela qu'il s'arrête au lieu d'inventer des valeurs.

### Étape 2 — Le diagnostic

```bash
sudo bash backend/deploy/install.sh --diagnostic
```

Il rend l'état de **quinze sujets**, chaque ligne disant **quoi faire**, et sort en **0**
(conforme), **1** (réserves) ou **2** (bloquant). ⚠️ **Il ne modifie rien** : jouable sur une
production qu'on n'ose pas toucher.

**🚦 PORTE 2 — deux lignes décident de la suite :**

- **`annuaire`** doit dire que le contrôleur est **joignable**. S'il ne l'est pas, c'est le
  §1.4 : la liste blanche de l'unité, puis le pare-feu. **Rien ne sert de continuer avant.**
- **`certificat`** doit donner une date de validité. Sinon, c'est le §1.2.

Le reste peut attendre : `messagerie` en réserve est acceptable si vous n'avez pas encore le
relais, et se corrige plus tard.

### Étape 3 — Engendrer les groupes d'annuaire

```bash
sudo bash backend/deploy/groupes-ad.sh --powershell \
     --ou 'OU=Cyber GRC,OU=Groupes,DC=exemple,DC=interne' > creer-groupes-grc.ps1
```

Le script lit **la base** — donc vos filiales telles qu'elles y sont — et rend un script
PowerShell prêt à exécuter. Relisez-le : il ne fait que des `New-ADGroup`.

⚠️ **Il est idempotent et ne supprime jamais rien** : relancé après une acquisition, il ne crée
que ce qui manque. *Retirer un groupe retirerait des accès sans que personne l'ait décidé.*

### Étape 4 — L'administrateur du domaine exécute, ET remplit `GRC-ADMIN`

Transmettez `creer-groupes-grc.ps1` à l'administrateur du domaine, avec **deux demandes** :

1. **exécuter le script** ;
2. **ajouter la personne désignée au §0 dans `GRC-ADMIN`**, et — si elle doit aussi extraire
   des données — dans `GRC-EXPORT`.

🛑 **La seconde demande n'est pas optionnelle.** Sans elle, le produit est installé, l'annuaire
répond, les comptes se connectent — et **personne ne peut rien administrer**. C'est la panne
n° 1 d'une première mise en service, et elle ne ressemble pas à une panne.

**🚦 PORTE 3 — les trois listes concordent-elles ?** Le produit sait le dire lui-même :

```bash
sudo bash backend/deploy/groupes-ad.sh --verifier
```

Il confronte **la table des filiales**, **la déclaration applicative** (`groupes_ad`) et **ce
que l'annuaire porte réellement**, et nomme ce qui manque de chaque côté. C'est ce contrôle qui
a trouvé, sur notre propre recette, trois groupes déclarés dans l'application et **absents de
l'annuaire** : quiconque les aurait reçus serait entré **sans aucun droit, en silence**.

### Étape 5 — La première connexion

Ouvrez `https://votre-nom/` et connectez-vous avec le compte mis dans `GRC-ADMIN`.

**🚦 PORTE 4 — que voyez-vous ?**

| Ce que vous obtenez | Ce que ça veut dire |
|---|---|
| l'application, et **Administration** dans le menu | ✅ c'est bon |
| **401** « identifiant ou mot de passe incorrect » | le mot de passe, **ou** l'annuaire injoignable, **ou** le compte verrouillé (5 échecs, 15 min). La ligne `annuaire` du diagnostic tranche |
| **403** — vous entrez, mais rien n'est ouvert | **le compte n'est dans aucun groupe `GRC-*`** : c'est l'étape 4, demande n° 2 |

⚠️ **401 et « login inconnu » rendent le même message, à l'octet près.** C'est délibéré :
les distinguer dirait à un attaquant quels identifiants existent.

### Étape 6 — Armer ce qui doit tourner tout seul

```bash
# Ce que l'installateur a déjà armé — vérifiez-le plutôt que de le supposer
systemctl list-timers 'cyber-grc*'
```

Trois minuteurs : les **relances** d'échéance, les **événements sortants**, et la
**ré-analyse antivirale** des pièces jointes.

**Et ce que l'installateur ne fait PAS à votre place : les sauvegardes.** Trois choses sont à
sauvegarder, et **une sauvegarde de base seule ne restaure pas le produit** :

| | Pourquoi |
|---|---|
| la base PostgreSQL | les données |
| le répertoire des **pièces jointes** | elles vivent sur le disque, référencées par empreinte — une restauration partielle rend des documents d'audit introuvables |
| `/etc/cyber-grc/env` | il porte les secrets ; sans lui la base est illisible |

🛑 **Testez une restauration avant la mise en service, pas après.** Le détail est au
`GUIDE_EXPLOITATION.md` §4.

---

## 4. Avant de dire « c'est en service »

Jouez ces cinq commandes et gardez leur sortie : c'est votre procès-verbal de mise en service.

```bash
# 1. Quinze sujets, et le bilan chiffré
sudo bash backend/deploy/install.sh --diagnostic

# 2. Ce qui est SERVI est bien ce que le dépôt porte
sudo bash backend/deploy/install.sh --verifier-publication

# 3. Les trois listes de groupes concordent
sudo bash backend/deploy/groupes-ad.sh --verifier

# 4. Les minuteurs sont armés
systemctl list-timers 'cyber-grc*'

# 5. Le profil est bien « production » — pas « découverte »
sudo grep '^CYBER_GRC_PROFIL=' /etc/cyber-grc/env || echo 'absent → vaut production'
```

Puis, **dans le produit**, quatre vérifications que seul un humain peut faire :

- **Administration → Habilitations → Groupes d'annuaire → « Vérifier l'annuaire »** : la
  cohérence est-elle complète ?
- **Administration → Habilitations → Matrice** : le profil de chaque futur utilisateur ouvre-t-il
  bien ce qu'il doit ouvrir ?
- **Administration → Filiales** : la liste est-elle exacte ?
- **Connectez un compte NON administrateur** et vérifiez qu'il voit sa filiale et rien d'autre.

⚠️ **Un diagnostic vert ne vaut pas une recette.** Il constate une machine ; il n'éprouve ni le
cloisonnement sous sondes hostiles, ni les droits de chaque profil.

---

## 5. Les cinq pannes de première installation

| Symptôme | Cause | Réparation |
|---|---|---|
| Apache ne démarre pas, erreur sur un fichier `.crt` | le certificat n'est pas aux trois chemins attendus | §1.2 |
| « Installation terminée », et **personne ne se connecte** | l'unité systemd ferme la sortie : le contrôleur est injoignable **depuis le service** | §1.4, puis `--diagnostic` ligne `annuaire` |
| La liaison LDAPS échoue alors que le DC répond | le certificat du DC est signé par une PKI interne absente du magasin système | `LDAP_CA=` (§1.3) |
| On entre, et **rien n'est ouvert** (403) | aucun groupe `GRC-*` pour ce compte | étape 4, demande n° 2 |
| `https://votre-nom/` rend **403** | la liste blanche de publication ne couvre pas « / » | `sudo bash backend/deploy/install.sh --maj` |

**Et une sixième, qui n'est pas une panne** : les écrans sont **vides** à la première
ouverture. C'est voulu — aucune donnée de démonstration n'est chargée. *Un outil qui affiche
« aucun risque » sur une base vide ne mentirait pas ; un outil qui affiche de faux risques,
si.*

---

## 6. Revenir en arrière

L'installateur prend un **cliché de la base avant chaque migration**, et il le **vérifie** :

```bash
ls -lt /var/backups/cyber-grc/avant-migration-*.sql.gz | head
```

Pour retirer le logiciel **en gardant les données** :

```bash
sudo bash backend/deploy/install.sh --desinstaller
```

Pour tout détruire, il faut le demander explicitement **et** fournir un export vérifié — le
journal d'audit a une rétention de trois ans et fait preuve en audit :

```bash
sudo bash backend/deploy/install.sh --desinstaller --avec-les-donnees \
     --export-verifie=/chemin/vers/export-grc-backup.json
```

---

## 7. La fiche à imprimer

```
AVANT LE JOUR J
[ ] VM Debian 13, 4 Go / 40 Go, accès root
[ ] nom DNS pointant vers la VM
[ ] certificat serveur pour ce nom + clé + chaîne  → /etc/ssl/cyber-grc/
[ ] certificat de l'AC qui signe le LDAPS du contrôleur → LDAP_CA=
[ ] compte de service AD en LECTURE SEULE, mot de passe qui n'expire pas
[ ] URL LDAPS · base de recherche · DN du compte · mot de passe
[ ] adresses à ouvrir : contrôleur de domaine · résolveur DNS · relais SMTP
[ ] pare-feu : 443/tcp en entrée
[ ] liste des filiales : code court + raison sociale
[ ] LA PERSONNE qui sera le premier administrateur, nommément
[ ] l'administrateur du domaine est joignable le jour J
[ ] décidé : pose-t-on un COMPTE DE SECOURS ? (l'assistant n'en pose aucun
    en production — sans lui, un annuaire qui tombe ferme le produit à tous)

LE JOUR J
[ ] 1. install.sh --assistant            → PORTE 1 : achevé, ou code 2 corrigé
[ ] 2. install.sh --diagnostic           → PORTE 2 : annuaire joignable, certificat valide
[ ] 3. groupes-ad.sh --powershell        → le script est engendré et relu
[ ] 4. l'admin du domaine exécute        → ET met la personne dans GRC-ADMIN
[ ]    groupes-ad.sh --verifier          → PORTE 3 : les trois listes concordent
[ ] 5. première connexion                → PORTE 4 : Administration est dans le menu
[ ]    l'encart « Liaison Active Directory » dit ce qui est configuré
[ ]    compte de secours posé, si décidé — et son mot de passe mis au coffre
[ ] 6. minuteurs armés · SAUVEGARDES en place · restauration TESTÉE

AVANT DE DIRE « EN SERVICE »
[ ] les cinq commandes du §4, sortie conservée
[ ] les quatre vérifications dans le produit
[ ] profil = production (pas « découverte »)
```

---

## 8. Ce que l'installateur ne fera jamais à votre place

- **Il n'écrit pas dans votre Active Directory.** La capacité n'existe pas dans le code : le
  client LDAP n'implémente que « lier », « rechercher » et « fermer ». Il lit les
  appartenances et vous *rend la liste* des groupes à créer. *Une capacité absente ne se
  réactive pas par une erreur de configuration.*
- **Il ne crée aucun compte administrateur.** Il n'y a pas de « admin/admin » à changer plus
  tard, et donc pas de porte qu'on oublie de refermer.
- **Il ne charge aucune donnée de démonstration.**
- **Il ne remplace pas un mot de passe de rôle existant**, ni ne reprend la propriété d'une
  base existante, sans qu'on le lui demande.
- **Il ne fait pas vos sauvegardes.**
