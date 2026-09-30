# L'appliance Proxmox — construire, sceller, figer, prouver

> Une VM **vierge et qui fonctionne** : le produit installé, aucune donnée, aucun secret
> partagé entre deux clones. Livrée dans le format natif de Proxmox (`vzdump … .vma.zst`),
> restaurable en une commande. Ce document dit **comment on la fabrique** et **comment on
> prouve qu'elle est livrable** — les deux, sinon ce n'est qu'un fichier.

## 0. Ce que c'est, et ce que ce n'est pas

| | |
|---|---|
| **profil** | **découverte** — le seul qui démarre sans annuaire (en production le produit refuse de démarrer sans AD : fail-closed, voulu). Le bandeau le dit dans le produit |
| **données** | aucune. Catalogues chargés, base vide, un compte de secours dont le mot de passe est **engendré au premier démarrage** de chaque clone |
| **raccordement au client** | après, et sur place : `install.sh --assistant`, oui à l'annuaire — c'est là que son certificat, son DNS et ses groupes entrent (`INSTALLATION_ENTREPRISE.md`) |
| **ce qu'elle n'embarque pas** | aucune clé d'hôte SSH, aucun `machine-id`, aucun secret, aucune clé autorisée, aucune trace de l'auteur — vérifié par un balayage qui **refuse** le scellement si une valeur secrète survit |

## 1. Construire — dans Proxmox, jamais en exportant une machine qui a vécu

1. **Une Debian 13 vierge** dans Proxmox : `qemu-guest-agent`, fuseau `Europe/Paris` (il
   exerce un défaut fermé le 25/09/2026), un compte local non-root (ex. `grc`, dans `sudo`).
2. Cloner le dépôt **avec ce compte, jamais `sudo git`**, à l'étiquette de livraison :
   ```bash
   git clone https://github.com/Hakim1195/cyber-grc.git && cd cyber-grc && git checkout v1.0-labo
   ```
3. Installer en **profil découverte** :
   ```bash
   sudo bash backend/deploy/install.sh --assistant      # « non » au raccordement à l'annuaire
   sudo bash backend/deploy/install.sh --diagnostic
   ```
4. **Ouvrir le produit dans un navigateur** et se connecter avec le compte de secours choisi
   à l'étape 3. Tant que ce n'est pas fait, on ne scelle pas.

## 2. Sceller — une fois, en root, puis éteindre

```bash
sudo bash backend/deploy/appliance/sceller.sh --source ~/cyber-grc --compte grc
sudo shutdown -h now
```

Ce qu'il fait, dans l'ordre : arrête le service ; **embarque le dépôt** à
`/usr/local/src/cyber-grc` (le premier démarrage en aura besoin, et il ne doit dépendre ni d'un
répertoire personnel ni de `/opt`) ; arme `cyber-grc-premier-demarrage.service` ; **lit puis
efface** les secrets de `/etc/cyber-grc/env` (`SESSION_SECRET`, les trois mots de passe de
rôles, l'empreinte du compte de secours, le mot de passe du compte de service, SMTP) ; retire
clés d'hôte SSH, `machine-id`, historiques, session Claude, clés autorisées, caches ; puis
**balaie tout le disque à la recherche des valeurs effacées** et **refuse** s'il en retrouve
une, en nommant le fichier. Il écrit `/etc/cyber-grc/SCELLE` avec la date et l'étiquette.

⚠️ `--compte grc` : le mot de passe de ce compte local **expirera au premier démarrage** —
le destinataire le change à sa première connexion. Donnez-lui-en un connu avant de sceller.

## 3. Figer — le format natif de Proxmox

Sur l'hôte Proxmox, VM **éteinte** :

```bash
vzdump <VMID> --mode stop --compress zstd --dumpdir /var/lib/vz/dump
sha256sum /var/lib/vz/dump/vzdump-qemu-<VMID>-*.vma.zst > cyber-grc-appliance.sha256
```

Le `.vma.zst` (2 à 3 Go) **est** le livrable, avec son empreinte à côté. Pour un autre
hyperviseur : `qemu-img convert -O vmdk` sur le disque de la VM, et le même scellement.

Pour des déploiements répétés : `qm template <VMID>`, puis des clones — chaque clone tire
ses secrets **au premier démarrage**.

## 4. Le premier démarrage — ce que voit le destinataire

`qmrestore cyber-grc-appliance.vma.zst <NOUVEAU-VMID>`, démarrer. `cyber-grc-premier-demarrage`
s'exécute **une seule fois** (marque `/var/lib/cyber-grc/premier-demarrage.fait` **et**
`ConditionPathExists=!` sur l'unité — deux barrières, parce que régénérer les secrets à chaque
boot invaliderait toutes les sessions) :

1. `machine-id` neuf, clés d'hôte SSH neuves ;
2. nom et URL : lus dans `/etc/cyber-grc/premier-demarrage.conf` s'il existe
   (`NOM_HOTE=`, `URL_PUBLIQUE=https://…`), sinon le nom de la machine ;
3. **compte de secours** : mot de passe **engendré**, empreinte calculée **par le code du
   produit** (`dist/auth/secours.js`), déposé dans `/root/cyber-grc-premier-demarrage.txt`
   (0600) — le destinataire le lit, se connecte, le change ;
4. `install.sh --maj --reinitialiser-mots-de-passe` : `SESSION_SECRET` et les trois mots de
   passe de rôles **régénérés** par l'installateur lui-même, service republié ;
5. le compte local expire son mot de passe ; l'unité se désarme.

Tout est dans `journalctl -u cyber-grc-premier-demarrage`.

## 5. Prouver — sans quoi ce n'est pas un livrable

Sur **un autre** VMID (ou un autre Proxmox) : `qmrestore`, démarrer, lire
`/root/cyber-grc-premier-demarrage.txt`, **ouvrir le navigateur et se connecter**. Puis :

```bash
sudo bash /usr/local/src/cyber-grc/backend/deploy/install.sh --diagnostic
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub     # différente de celle de la VM d'origine
```

Deux clones restaurés de la même image doivent avoir **deux** empreintes d'hôte, **deux**
`machine-id`, **deux** mots de passe de secours. Si l'un des trois est égal, le scellement a
échoué quelque part — et c'est le balayage de `sceller.sh` qu'il faut relire.

Les scripts sont éprouvés par `backend/test/deploiement/appliance.test.mjs` : scellement joué
sur une racine factice (le balayage **mord** sur un secret caché dans un fichier inconnu),
premier démarrage joué avec un `install.sh` doublé (options exactes, empreinte `scrypt$`,
refus du rejeu, arrêt avant toute régénération sur une URL invalide).
