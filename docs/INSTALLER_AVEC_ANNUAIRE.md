# Installer sur une VM vierge quand l'annuaire est prêt — la procédure

> **Une page, huit étapes, vingt minutes.** Pour refaire une machine du logiciel **à
> l'identique** quand l'Active Directory est déjà en place — compte de service, groupes
> `GRC-*`, comptes — et que le certificat serveur existe. C'est le chemin que le labo du
> 30/09/2026 a prouvé (connexion `admin.grc` mesurée dans le journal d'audit), réduit à ce
> qu'un humain tape, dans l'ordre, sur une **Debian 13 fraîchement installée**.
>
> Ce qu'elle n'est pas : la **préparation** d'une première mise en service chez un client
> ([`INSTALLATION_ENTREPRISE.md`](INSTALLATION_ENTREPRISE.md)), ni le côté annuaire
> ([`ANNUAIRE_ACTIVE_DIRECTORY.md`](ANNUAIRE_ACTIVE_DIRECTORY.md)) — ici, tout cela est fait.
>
> 🛑 **Si une étape ci-dessous manque ou ne marche pas telle quelle, c'est un défaut de
> cette page** : notez la commande et sa sortie, et signalez-les. C'est ainsi qu'elle a été
> écrite, et c'est ainsi qu'elle restera juste.

## Vos valeurs

Les commandes portent celles du labo ; remplacez-les par les vôtres, et rien d'autre.

| | Labo du 30/09/2026 | La vôtre |
|---|---|---|
| Contrôleur de domaine (FQDN · IP) | `AD-01.dedaero.lan` · `192.168.10.238` | |
| Base de recherche | `DC=dedaero,DC=lan` | |
| DN du compte de service | `CN=svc-grc,OU=Comptes de service,DC=dedaero,DC=lan` | |
| Passerelle / résolveur de secours | `192.168.10.254` | |
| Nom public du produit | `grc.dedaero.lan` | |
| Compte local de la VM | `kevin` (dans `sudo`) | |
| Filiales | `TLS` Site de Toulouse `FR` · `DEU` Filiale allemande `DE` | |
| Révision du dépôt | `v1.1-labo` | |

## 0. Avant de toucher la VM neuve — trois fichiers et un mot de passe

| Quoi | Où le prendre |
|---|---|
| le **mot de passe de `svc-grc`** | vous l'avez tapé sur le contrôleur ; il ne se lit nulle part |
| **`AD-CA.cer`**, le certificat de l'AC | sur le contrôleur, `C:\AD-CA.cer` (`certutil '-ca.cert' C:\AD-CA.cer` s'il n'y est plus). N'importe quel encodage : l'installateur convertit |
| le **certificat serveur ET sa clé** | sur la machine qui les porte, en root — le certificat seul ne sert à rien sans la clé |

```bash
# sur la machine actuelle du logiciel
sudo tar -C /etc/ssl/cyber-grc -czf ~/tls-grc.tgz serveur.crt serveur.key chaine-pki-interne.crt && sudo chown "$USER" ~/tls-grc.tgz
```

Pas de certificat à reprendre ? Une nouvelle demande signée par l'AC prend deux minutes :
`ANNUAIRE_ACTIVE_DIRECTORY.md` §9.

## 1. La VM

Debian 13, installation réseau standard : **4 Go, 40 Go**, fuseau `Europe/Paris`,
`openssh-server` et `qemu-guest-agent` cochés, un compte non-root dans `sudo`. Rien d'autre —
l'installateur pose PostgreSQL, Node, Apache et ClamAV lui-même.

Relevez son adresse (`ip -4 -br addr`), puis, depuis votre poste :

```bash
scp AD-CA.cer tls-grc.tgz kevin@<ip-de-la-vm>:
```

(Depuis le contrôleur, `scp` existe aussi : `scp C:\AD-CA.cer kevin@<ip-de-la-vm>:`.)

## 2. Le résolveur de la VM, c'est le contrôleur

Sans cela, `AD-01.dedaero.lan` ne se résout pas, et rien de ce qui suit ne marche.

```bash
printf 'nameserver 192.168.10.238\n' | sudo tee /etc/resolv.conf.head
sudo reboot
```

Une Debian 13 fraîche est sous **dhcpcd** : ce fichier est repris en tête de
`/etc/resolv.conf` à chaque bail, et la passerelle reste derrière en secours. Le redémarrage
évite de relancer le client DHCP à la main (la VM y perd son adresse quelques secondes). Autre
gestionnaire de réseau : `INSTALLATION_ENTREPRISE.md` §1.4.

```bash
getent hosts AD-01.dedaero.lan            # → 192.168.10.238   AD-01.dedaero.lan
```

## 3. La sortie réseau du service

L'unité livrée ferme tout sauf la boucle locale. Le contrôleur **et** le résolveur, en `/32` :

```bash
sudo mkdir -p /etc/systemd/system/cyber-grc.service.d
printf '[Service]\nIPAddressAllow=192.168.10.238/32\nIPAddressAllow=192.168.10.254/32\n' \
  | sudo tee /etc/systemd/system/cyber-grc.service.d/reseau.conf
```

Le service n'existe pas encore : ce fichier l'attend, et l'installateur vérifiera qu'il couvre
bien les deux adresses.

## 4. Le certificat serveur — AVANT l'installation

En production, l'installateur **n'engendre aucun certificat** ; sans ces trois fichiers,
Apache ne démarre pas.

```bash
sudo install -d -m 0755 /etc/ssl/cyber-grc
sudo tar -C /etc/ssl/cyber-grc -xzf ~/tls-grc.tgz && sudo chmod 0600 /etc/ssl/cyber-grc/serveur.key && rm ~/tls-grc.tgz
sudo openssl x509 -in /etc/ssl/cyber-grc/serveur.crt -noout -subject -enddate     # CN=grc.dedaero.lan, et la date
```

## 5. Le dépôt, puis l'assistant

```bash
sudo apt update && sudo apt install -y git curl ca-certificates
git clone https://github.com/Hakim1195/cyber-grc.git && cd cyber-grc && git checkout v1.1-labo
sudo bash backend/deploy/install.sh --assistant
```

**Jamais `sudo git`** : le dépôt appartiendrait à root, et `git pull` refuserait ensuite de
l'ouvrir. L'assistant pose ses questions, puis installe tout ; répondez :

| Question | Réponse |
|---|---|
| Adresse à laquelle vos utilisateurs accéderont | `https://grc.dedaero.lan` |
| Raccorder le produit à votre Active Directory maintenant | **oui** |
| URL LDAPS du contrôleur de domaine | `ldaps://AD-01.dedaero.lan:636` |
| Base de recherche (DN) | `DC=dedaero,DC=lan` |
| DN du compte de service (lecture seule) | `CN=svc-grc,OU=Comptes de service,DC=dedaero,DC=lan` |
| Mot de passe de ce compte (non affiché) | celui de `svc-grc` |
| Chemin du certificat de l'AC | `/home/kevin/AD-CA.cer` |
| Activer les relances par courriel | **non** (ou oui, avec votre relais SMTP) |
| Code court de la filiale · Raison sociale · Pays | `TLS` · `Site de Toulouse` · `FR` — puis **oui**, `DEU` · `Filiale allemande` · `DE` — puis **non** |
| Écrire cette configuration et installer | **oui** |

Il copie le certificat de l'AC à sa place, vérifie le LDAPS **par Node, avec cette AC** —
la ligne `LDAPS : AD-01.dedaero.lan:636 répond, et NODE le reconnaît` —, éprouve la borne de
corps du frontal, contrôle que le certificat servi couvre `grc.dedaero.lan`, et se termine par
`Installation terminée.` en **code 0**. Un **code 2** nomme ce qui manque ; corrigez, relancez.

## 6. Le nom DNS pointe vers la nouvelle VM

Sur le contrôleur — la VM neuve a une autre adresse que l'ancienne :

```powershell
Remove-DnsServerResourceRecord -ZoneName dedaero.lan -Name grc -RRType A -Force
Add-DnsServerResourceRecordA   -ZoneName dedaero.lan -Name grc -IPv4Address <ip-de-la-vm>
```

(Ou éteignez l'ancienne VM et donnez son adresse à la nouvelle.) Les postes gardent l'ancienne
réponse jusqu'à l'expiration du cache : `ipconfig /flushdns` sur le poste de test.

## 7. Les portes — ce que vous devez voir

```bash
sudo bash backend/deploy/install.sh --diagnostic       # 16 conformes, 1 réserve (SMTP_ACTIF=non), 0 bloquant
sudo bash backend/deploy/groupes-ad.sh --verifier      # les 26 groupes existent déjà : les trois listes concordent
```

Puis, depuis un poste du domaine, `https://grc.dedaero.lan/` **sans avertissement** :

| Compte | Attendu |
|---|---|
| `admin.grc` | l'application, **Administration** dans le menu. Journal d'audit : `connexion_reussie`, `perimetre: groupe`, `administrateur: true` |
| `sans.groupe` | entre, et **rien n'est ouvert** (403) — il n'est dans aucun groupe `GRC-*` |
| `indirect.tls` | la filiale TLS, par le groupe imbriqué `equipe-secu-tls` |

`Administration → Habilitations → Groupes d'annuaire` doit annoncer **26 présents, 0
inattendu**.

## 8. (Si vous le voulez) un compte de secours

En production l'assistant n'en pose aucun. Si l'annuaire tombe, c'est la seule porte :

```bash
sudo bash -c 'umask 077; read -rsp "Mot de passe : " m; printf "%s" "$m" > /root/secours.txt; echo'
sudo bash backend/deploy/install.sh --secours-fichier=/root/secours.txt
```

Douze caractères au moins ; le fichier est effacé une fois l'empreinte posée ; **vous seul
l'avez lu** — jamais un agent, jamais une commande.

---

## Ce qui se passe mal, et sa réparation

| Ce que vous voyez | Ce que c'est | Ce qu'il faut faire |
|---|---|---|
| `getent hosts AD-01…` ne répond rien | le résolveur n'est pas le contrôleur | étape 2 — et vérifiez `/etc/resolv.conf` après le redémarrage |
| `install: invalid group 'cyber-grc'` juste après les questions | installateur antérieur au 30/09/2026 : il copiait l'AC avec un groupe qui n'existait pas encore | `git checkout v1.1-labo` ou plus récent |
| `LDAP_CA (…) n'est PAS lisible par le compte de service` | vous avez pointé `LDAP_CA` à la main vers un fichier sous `/home` | laissez l'assistant le copier, ou `chown root:cyber-grc` + `chmod 0640` comme il l'indique |
| l'installateur nomme un **émetteur** qu'il ne peut pas vérifier | ce n'est pas l'AC du contrôleur, ou le fichier est celui du DC | reprenez `C:\AD-CA.cer` (étape 0) |
| `IPAddressAllow` ne couvre pas le contrôleur ou le résolveur | drop-in absent ou adresse fausse | étape 3, puis `sudo systemctl daemon-reload && sudo bash backend/deploy/install.sh --maj` |
| Apache refuse de démarrer sur un fichier `.crt` | les trois fichiers ne sont pas à leur place | étape 4 |
| « le certificat servi ne couvre pas grc.dedaero.lan » | ce n'est pas le bon certificat, ou l'URL donnée n'est pas son nom | étape 4 et la première réponse de l'étape 5 |
| le navigateur avertit encore | le poste n'a pas l'AC du domaine, ou vise l'ancienne adresse | poste hors domaine : importer `AD-CA.cer` ; sinon `ipconfig /flushdns` |
| on entre, et **rien n'est ouvert** (403) | le compte n'est dans aucun groupe `GRC-*` | `ANNUAIRE_ACTIVE_DIRECTORY.md` §8 |
| **401** pour tous les comptes | annuaire injoignable **depuis le service**, ou mot de passe de `svc-grc` faux | `--diagnostic`, ligne `annuaire` ; étape 3 ; ressaisir par `--assistant` |

## Et après

Une machine bâtie ainsi n'a jamais vu ni agent ni outil de développement : c'est **celle qu'on
scelle** pour en faire une image redéployable — [`APPLIANCE_PROXMOX.md`](APPLIANCE_PROXMOX.md)
§2. Pour la vie d'après — sauvegardes, rétention, acquisitions — `GUIDE_EXPLOITATION.md`.
