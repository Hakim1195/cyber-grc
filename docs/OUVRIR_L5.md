# Ouvrir le lot L5 — le journal d'audit

> Écrit le 04/09/2026, à la clôture de la vague 3, pour qu'une session neuve démarre
> sur du mesuré et non sur du raconté. **Lisez-le en entier avant d'écrire une ligne :
> il tient en dix minutes et il évite deux jours.**

## 1. D'où vous partez

Le lot **L3 est construit et fonctionne**. Un utilisateur ouvre une session depuis un
**Active Directory réel**, ses trois axes sont résolus, l'interface s'affiche avec ses
droits. Ce n'est pas une affirmation de document : la recette **tourne en permanence sur
cette machine**, et vous pouvez la voir en une commande (§4).

La porte **S3 a été jouée une fois et refusée** — 15 constats, contrôles S7 et S18 en
échec, **zéro fuite entre filiales**. Les deux bloquants sont corrigés et mordus. Le
verdict et le détail vivent dans `securite/RAPPORT_S3.md` ; l'état constat par constat
dans `PLAN_EXECUTION.md` §7, **seule source des verdicts**.

**Banc : 1030 essais, 1030 passés, 0 échec**, sur PostgreSQL 17.11, Debian 13 et
Apache 2.4.68 réels.

## 2. Ce que L5 doit livrer, et ce qui manque — chiffré

Le périmètre est au `PLAN_SERVEUR` **§1.7**. L'écart a été **mesuré** à la porte S3, il
n'est pas estimé :

> **4 actions émises sur 20 déclarées** en base.
>
> **Émises** : connexion réussie · connexion refusée (annuaire, puis login inconnu) ·
> usage du compte de secours, réussi **comme** refusé — le critère du lot · verrouillage
> par le rythme · déconnexion.
>
> **Absentes** : le refus de droit par requête (technique seulement) · création,
> modification, suppression d'enregistrements · administration · imports · **exports**.
>
> `journaliser()` n'est appelé que depuis `src/auth/index.ts`.

**L'absence de journalisation des exports est nommée au constat Q-89** : le droit
d'export a été rendu inviolable, mais aucun export n'est tracé — or c'est exactement ce
qu'un auditeur ISO 27001 demande à voir.

**Le resserrement de la lecture du journal est un livrable ferme** (`CONVENTIONS.md`
§22, condition **E6**). Il ne pouvait pas être fait plus tôt : le chaînage par empreinte
impose l'ordre. ⚠️ **Et la justification qui le reportait est réfutée.** Le `README` §8
écrit « sans effet tant que le journal est vide » ; mesuré à la porte S3, `grc_lecture`
— compte de supervision en lecture seule — lit **138 entrées**, logins et adresses IP
compris.

## 3. Trois choses à ne pas croire acquises

1. **Le journal est en ajout seul, et c'est éprouvé** — `update` et `delete` sont
   refusés **même au propriétaire**, quatre couches cumulatives au `CONVENTIONS.md` §12.
   Mais sa **couverture** ne l'est pas. Un journal inaltérable et incomplet prouve moins
   qu'il n'en a l'air, et c'est précisément l'écart du §2.
2. **Une valeur d'utilisateur atterrit littéralement dans le journal d'audit**, sauts de
   ligne compris : l'auditeur l'a mesuré en forgeant un login contenant du JSON. Le
   chaînage n'en souffre pas et rien ne fuit — mais **un export texte du journal
   scinderait la ligne**, et l'export est un livrable de ce lot.
3. **Les constats ouverts qui touchent L5** : **Q-90** (le `README` déclare *ouvertes*
   cinq propriétés que L3 a livrées — la documentation ne retarde plus, elle nie),
   **Q-91** (trois réglages documentés que personne ne lit), **Q-92**, **Q-95**,
   **Q-104**. À lire au registre avant de commencer.

## 4. La machine — ce qui tourne, et comment y toucher

`SRV-Infra` est **dédiée à ce projet**. Les piles Docker arrêtées (`hm-infra`,
`cyber-grc`) sont l'essai d'un autre projet, **abandonné** : faites comme si elles
n'existaient pas. Le seul conteneur qui compte est **`grc-ad`**, l'annuaire Samba.

```bash
# voir que tout tourne
systemctl is-active cyber-grc apache2 postgresql
curl -s -o /dev/null -w '%{http_code}\n' https://grc.exemple.interne/

# une connexion réelle, contre l'AD
curl -s -H 'Content-Type: application/json' \
  -d '{"identifiant":"rssi.tls","motDePasse":"Rssi-Tls-2026!"}' \
  https://grc.exemple.interne/api/connexion

# le banc — la ligne source est OBLIGATOIRE sur cette machine
cd backend && set -a && source ~/.grc-essais.env && set +a && npm test

# ce qui est SERVI est-il ce que le dépôt porte ?  (constat Q-103)
sudo bash backend/deploy/install.sh --verifier-publication
```

⚠️ **Ne jouez JAMAIS `db/dev/preparer_base_dev.sh`** : il ramènerait les mots de passe
des rôles à `dev` et casserait le service installé.

⚠️ **Un correctif du serveur exige `npm run build` puis un redéploiement ; un correctif
du frontend exige `install.sh --maj`.** Le constat **Q-103** est né de cet oubli : le
dépôt était vert pendant que la machine servait encore l'ancien fichier, et la fuite
d'export restait ouverte en vol. *Un banc vert sur l'arbre ne dit rien du commit, et un
commit vert ne dit rien de la machine.*

## 5. Comment conduire la vague

`PLAN_EXECUTION.md` **§2 bis** : la passe de préparation **avant** tout agent, la table
de lancement dont aucune case n'est vide, le choix du modèle par agent, et l'audit
indépendant — **un par vague, jamais négociable**. Le §3 porte la table de la vague 3,
qui sert de modèle.

Ce que la vague 3 a coûté et qui vaut d'être su : **deux agents sur quatre auraient
travaillé contre un décor** faute d'outillage — Playwright n'était pas installé, et les
chiffres du banc n'étaient pas mesurés. Les deux prérequis étaient à la charge de
l'orchestrateur, et le §2 bis le dit : *l'outillage manquant est le vrai premier agent.*
