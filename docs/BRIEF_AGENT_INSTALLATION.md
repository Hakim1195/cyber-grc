# Brief — installer cyber-grc sur une VM neuve, en observateur

> À lire par l'agent chargé d'installer le produit **sur une machine qui n'est pas
> `SRV-Infra`**. Une page. Tout ce qu'il faut savoir avant la première commande.

## 0. Où vous êtes — et où vous n'êtes PAS

Vous êtes sur une **VM neuve**, chez le client ou en évaluation. **Le §0 de `CLAUDE.md` ne
vous concerne pas** : il décrit la machine de recette de l'auteur (`SRV-Infra`, `Etc/UTC`,
annuaire simulé `grc-ad`, secrets dans `~/.grc-essais.env`, recette `grc-test.site`). Rien de
cela n'existe ici. N'en supposez rien ; **mesurez**.

Le 25/09/2026, la première installation chez un client a échoué **quatre fois**, jamais à
cause du produit — à cause d'hypothèses d'environnement vraies sur `SRV-Infra` et fausses
ailleurs (fuseau horaire, PKI de l'annuaire, encodage d'un certificat, chemin d'un fichier).
Trois sont corrigées. **Votre mission est de trouver la cinquième avant un client.**

## 1. La mission

Installer le produit **comme un exploitant le ferait**, en suivant
[`INSTALLATION_ENTREPRISE.md`](INSTALLATION_ENTREPRISE.md), et **rapporter chaque arrêt
mot pour mot**. Vous n'êtes pas là pour que ça passe : vous êtes là pour voir **où et
pourquoi** ça s'arrête, sur cette machine-ci.

**Deux étages, dans cet ordre :**

| | Quoi | Ce que ça prouve |
|---|---|---|
| **1** | `sudo bash backend/deploy/install.sh --assistant`, répondre **non** au raccordement à l'annuaire → **profil découverte** (certificat autosigné, compte de secours) | l'installateur va-t-il **au bout** sur cette VM — migrations comprises — sans aucune dépendance au SI du client ? |
| **2** | relancer `--assistant` en répondant **oui**, avec l'URL LDAPS, la base, le compte de service et le **certificat de l'AC** du client (n'importe quel encodage : l'installateur convertit) | où l'environnement **réel** diverge de celui de l'auteur |

Puis `sudo bash backend/deploy/install.sh --diagnostic`, et **ouvrir l'application dans un
navigateur** — se connecter (compte de secours à l'étage 1, compte de l'annuaire membre de
`GRC-ADMIN` à l'étage 2). Un diagnostic vert constate une machine ; **la connexion est la
seule preuve**.

## 2. Ce que vous mesurez AVANT de lancer (cinq commandes, à mettre dans le rapport)

```bash
timedatectl | grep -E "Time zone"                          # UTC ou temps civil ?
command -v node; node --version 2>/dev/null                # Node est-il là, et où ?
id; ls -ld .                                               # qui êtes-vous, à qui est le dépôt ?
openssl s_client -connect <dc>:636 </dev/null 2>/dev/null | openssl x509 -noout -text \
  | grep -E "Issuer:|Public-Key|Signature Algorithm|DNS:" | sort -u   # clé, signature, noms du DC
grep nameserver /etc/resolv.conf                           # le résolveur que le service devra joindre
```

⚠️ **`Signature Algorithm: sha1WithRSAEncryption` est la cause la plus probable d'un échec
qui n'a pas encore été vu** : Node refuse un certificat signé en SHA-1 même avec la bonne AC
(mesuré). Si vous le voyez, dites-le en premier dans le rapport — la correction est côté AD
(réémettre en SHA-256), et le produit n'a **pas** d'option pour l'accepter.

## 3. Les règles — elles ne se négocient pas

1. **Jamais `sudo git`** (clone, pull) : le dépôt appartiendrait à root, et `git pull`
   refuserait ensuite de l'ouvrir. `sudo` est pour `install.sh`, pas pour git.
2. **Jamais modifier un fichier versionné pour passer un contrôle.** Un contrôle qui rougit
   est une **trouvaille** : consignez-la, ne la contournez pas. En particulier, l'autorisation
   réseau du service va dans un **drop-in** — jamais dans `deploy/systemd/cyber-grc.service` :
   ```bash
   sudo mkdir -p /etc/systemd/system/cyber-grc.service.d
   printf '[Service]\nIPAddressAllow=<sous-réseau du DC>\nIPAddressAllow=<IP du résolveur>/32\n' \
     | sudo tee /etc/systemd/system/cyber-grc.service.d/reseau.conf && sudo systemctl daemon-reload
   ```
3. **Jamais abaisser la sécurité pour que ça passe** : ni `LDAP_VERIFIER_CERTIFICAT=non`, ni le
   niveau de sécurité d'OpenSSL du système, ni `IPAddressAllow=any`. Si l'installateur exige
   quelque chose que le SI du client ne fournit pas, **c'est le rapport qui le dit**, pas un
   contournement.
4. **Jamais `db/dev/preparer_base_dev.sh`** : il réécrit les mots de passe des rôles PostgreSQL.
5. **Mesurer avant d'affirmer.** Une réserve que vous n'avez pas éprouvée n'est pas une réserve.
6. **Une base à moitié migrée n'est pas à détruire** : une migration refusée annule sa
   transaction, et la relance reprend où elle s'est arrêtée.

## 4. Le rapport — `docs/securite/RAPPORT_INSTALLATION_<date>.md`

Pour **chaque** arrêt : la sortie **brute** (pas résumée), la cause **mesurée** (une commande,
son résultat), et ce qu'un exploitant aurait dû faire — en distinguant ce qui relève du
**SI du client** (certificat, DNS, groupes AD) de ce qui relève de **l'installateur** (message
faux, hypothèse cachée, contrôle qui bloque à tort). Terminez par les cinq mesures du §2 et
par le verdict de la connexion au navigateur.

Ce rapport vaut plus que l'installation elle-même : c'est lui qui ferme la classe.
