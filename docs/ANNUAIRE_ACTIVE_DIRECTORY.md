# Côté annuaire — ce que fait l'administrateur du domaine, commande par commande

> Le pendant de [`INSTALLATION_ENTREPRISE.md`](INSTALLATION_ENTREPRISE.md), pour **la personne
> qui tient l'Active Directory**. Chaque commande ci-dessous a été **exécutée dans cet ordre**
> le 30/09/2026 sur un Windows Server 2022 (PowerShell 5.1, AD DS, AD CS), dans un labo bâti
> de zéro, et a produit le résultat indiqué. Ce qui n'a pas été mesuré est dit tel quel.
>
> Les valeurs sont celles du labo — domaine `dedaero.lan`, contrôleur `AD-01`
> (`192.168.10.238`), VM du logiciel `192.168.10.167`, nom public `grc.dedaero.lan`.
> Remplacez-les par les vôtres ; ne changez rien d'autre.

## 0. Ce que le produit attend de l'annuaire — et ce qu'il n'y fera jamais

Le produit **lit** l'annuaire : il lie un compte de service, cherche l'utilisateur qui se
connecte, lit ses groupes (imbrications comprises). **Il n'y écrit jamais** — le client LDAP
n'implémente que « lier », « rechercher » et « fermer », et cette absence n'est pas un
réglage. Tout ce qui suit est donc **votre** geste, et il n'y en a que six :

| | Vous créez | Le produit en fait |
|---|---|---|
| §2 | une **unité d'organisation** et un **compte de service** en lecture seule | sa liaison LDAPS |
| §4–§5 | une **AC d'entreprise** (si le domaine n'en a pas) et **son certificat exporté** | la confiance dans le LDAPS du contrôleur |
| §6 | un **nom DNS** pour l'application | son URL publique et le nom de son certificat |
| §7 | les **groupes `GRC-*`**, par le script que l'installateur engendre | les droits — filiale × profil × domaine |
| §8 | les **appartenances**, dont **`GRC-ADMIN`** | le premier administrateur. Sans lui : personne |
| §9 | la **signature du certificat serveur** par votre AC | un site sans avertissement dans les navigateurs |

**Deux situations.** Chez un client, le domaine existe : commencez au **§2**. Pour un labo
bâti de zéro, le §1 fait d'un serveur vierge un contrôleur, et le §3 y met des comptes d'essai.

## 1. (Labo seulement) D'un serveur vierge à un contrôleur de domaine

```powershell
# IP statique — on garde l'adresse que le DHCP avait donnée
Set-NetIPInterface -InterfaceAlias Ethernet -AddressFamily IPv4 -Dhcp Disabled
Remove-NetIPAddress -InterfaceAlias Ethernet -AddressFamily IPv4 -Confirm:$false
Remove-NetRoute -InterfaceAlias Ethernet -DestinationPrefix 0.0.0.0/0 -Confirm:$false
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.10.238 -PrefixLength 24 -DefaultGateway 192.168.10.254
Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 192.168.10.254

# Le rôle, le nom, la forêt — le serveur redémarre à la promotion
Install-WindowsFeature AD-Domain-Services -IncludeManagementTools
Rename-Computer -NewName AD-01 -Restart
Import-Module ADDSDeployment
Install-ADDSForest -DomainName 'dedaero.lan' -DomainNetbiosName 'DEDAERO' -InstallDns `
  -SafeModeAdministratorPassword (Read-Host -AsSecureString 'DSRM') `
  -DomainMode WinThreshold -ForestMode WinThreshold -Force
```

Après la promotion, le DNS du serveur passe seul à `127.0.0.1`, et le **redirecteur DNS** a
repris l'ancien résolveur (`192.168.10.254`) sans qu'on le lui demande — mesuré ; vérifiez
avec `Get-DnsServerForwarder`, et posez-le avec `Add-DnsServerForwarder` s'il manque : la VM
du logiciel résoudra **par le contrôleur**, et elle a besoin d'atteindre ses dépôts Debian.

## 2. L'unité d'organisation et le compte de service

```powershell
$base = (Get-ADDomain).DistinguishedName
New-ADOrganizationalUnit -Name 'Comptes de service' -Path $base -Description 'Comptes de service'
New-ADOrganizationalUnit -Name 'Cyber-GRC' -Path "OU=Comptes de service,$base" `
  -Description 'Groupes GRC-* (script engendré par la machine Cyber-GRC)'

$pw = Read-Host -AsSecureString 'Mot de passe de svc-grc'     # tapé, jamais écrit
New-ADUser -Name 'svc-grc' -SamAccountName 'svc-grc' -UserPrincipalName 'svc-grc@dedaero.lan' `
  -Path "OU=Comptes de service,$base" -AccountPassword $pw -Enabled $true `
  -PasswordNeverExpires $true -CannotChangePassword $true `
  -Description 'Compte de liaison LDAP Cyber-GRC (lecture seule)'
```

- **« Lecture seule » ne se configure pas : elle vient de l'absence de tout droit
  supplémentaire.** Le compte n'appartient qu'à *Utilisateurs du domaine*, dont l'accès par
  défaut à l'annuaire est la lecture. N'y ajoutez rien.
- **`PasswordNeverExpires`** n'est pas du confort : le jour où ce mot de passe expire,
  **plus personne ne se connecte au produit**.
- Ce que vous transmettez à l'installateur : le **DN complet** —
  `CN=svc-grc,OU=Comptes de service,DC=dedaero,DC=lan` —, la **base de recherche**
  `DC=dedaero,DC=lan`, le **FQDN et l'adresse du contrôleur**, et **le mot de passe par un
  autre canal que le reste** — jamais dans un message, jamais dans un fichier qui quitte le
  serveur. Côté Debian, il entre dans un fichier `0600` lu par l'installateur, pas dans une
  commande (`INSTALLER.md`, « Sans terminal »).

## 3. (Labo seulement) Les comptes d'essai et le groupe imbriqué

Les dix comptes de la recette, un mot de passe de labo commun, et le groupe **imbriqué** qui
éprouve l'appartenance indirecte — `indirect.tls` n'est dans aucun groupe `GRC-*`, il n'entre
que parce que `equipe-secu-tls` sera membre de `GRC-TLS-RSSI` (§8). `sans.groupe` est le
témoin négatif : il entre, et ne doit rien voir.

```powershell
$pw = Read-Host -AsSecureString 'Mot de passe de labo'
foreach ($u in 'admin.grc','rssi.groupe','rssi.tls','contrib.tls','qualite.tls','direction',
               'indirect.tls','sans.groupe','rssi.deu','contrib.deu') {
  New-ADUser -Name $u -SamAccountName $u -UserPrincipalName "$u@dedaero.lan" -AccountPassword $pw -Enabled $true
}
New-ADGroup -Name 'equipe-secu-tls' -SamAccountName 'equipe-secu-tls' -GroupCategory Security -GroupScope Global -Path "CN=Users,$base"
Add-ADGroupMember -Identity 'equipe-secu-tls' -Members 'indirect.tls'
```

## 4. L'autorité de certification — si le domaine n'en a pas

Le produit exige un LDAPS dont le certificat est **signé en SHA-256 avec une clé d'au moins
2048 bits** : Node refuse SHA-1 même avec la bonne AC, et 1024 bits n'est accepté qu'en
réserve (`INSTALLATION_ENTREPRISE.md` §1.3). Une AC racine d'entreprise en dix minutes,
sans redémarrage :

```powershell
Install-WindowsFeature ADCS-Cert-Authority -IncludeManagementTools
Install-AdcsCertificationAuthority -CAType EnterpriseRootCA -CACommonName 'DEDAERO-AD-01-CA' `
  -CryptoProviderName 'RSA#Microsoft Software Key Storage Provider' -KeyLength 2048 `
  -HashAlgorithmName SHA256 -ValidityPeriod Years -ValidityPeriodUnits 10 -Force

# Le contrôleur s'inscrit SEUL avec le modèle « DomainController » — il faut l'attendre
gpupdate /force
certutil -pulse
Get-ChildItem Cert:\LocalMachine\My          # tant que c'est vide, le LDAPS n'est pas prêt
Test-NetConnection AD-01.dedaero.lan -Port 636
certutil -store My                            # attendu : CN=AD-01.dedaero.lan, sha256RSA, 2048 bits
```

## 5. Exporter le certificat de l'AC — ce que l'installateur épingle

Le contrôleur **ne présente que sa feuille** sur le port 636, jamais l'AC qui l'a signée :
sans ce fichier, l'installateur s'arrête en **nommant** l'émetteur qu'il ne peut pas vérifier.

```powershell
certutil '-ca.cert' C:\AD-CA.cer              # LES APOSTROPHES SONT OBLIGATOIRES sous PowerShell
certutil -encode -f C:\AD-CA.cer C:\AD-CA.txt # le même, en texte Base-64 : c'est lui qui voyage
certutil -hashfile C:\AD-CA.cer SHA256        # l'empreinte à donner de vive voix
```

Sans les apostrophes, PowerShell coupe `-ca.cert` en deux et certutil répond « Trop
d'arguments » — mesuré. L'installateur accepte le fichier **sous n'importe quel encodage**
(DER, Base-64, PKCS#7 : il convertit), et **affiche l'empreinte de ce qu'il a capturé** : elle
doit être celle que vous lui donnez — si elle diffère, quelque chose s'est placé entre les
deux machines.

## 6. Le nom DNS de l'application

```powershell
Add-DnsServerResourceRecordA -ZoneName dedaero.lan -Name grc -IPv4Address 192.168.10.167
Resolve-DnsName grc.dedaero.lan -Type A -Server 192.168.10.238
```

Ce nom est **l'URL publique** du produit (`SERVEUR_URL_PUBLIQUE=https://grc.dedaero.lan`) et
**le nom du certificat serveur** (§9). Les trois doivent être le même mot : l'installateur
interroge réellement le port 443 et compare.

## 7. Les groupes — exécuter le script engendré, tel quel

L'installateur engendre le script depuis **la table des filiales** du produit :

```bash
sudo bash backend/deploy/groupes-ad.sh --powershell \
     --ou 'OU=Cyber-GRC,OU=Comptes de service,DC=dedaero,DC=lan' > creer-groupes-grc.ps1
```

Vous le recevez tel quel et vous l'exécutez tel quel — **ne le retapez pas** :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\creer-groupes-grc.ps1
```

- `-ExecutionPolicy Bypass` ne vaut que pour ce processus ; la stratégie de la machine ne
  change pas.
- Le script est **idempotent et ne supprime jamais rien** : il compte, nomme, et **sort en
  erreur** si un seul groupe n'a pas pu être créé. Attendu pour deux filiales :
  `26 attendu(s) - 26 cree(s) - 0 deja present(s) - 0 en echec`.
- Le fichier commence par une **marque d'ordre d'octets UTF-8** et double toutes les
  apostrophes, droites et typographiques. 🛑 **Ce n'était pas le cas le 30/09/2026 avant
  midi** : PowerShell 5.1 a refusé d'analyser le script (« n’ayant » dans la description de
  `GRC-ADMIN`), puis a transformé « é » en « Ã© » — les deux corrigés dans l'engendreur
  (révisions `617a24b` et suivante), et gardés par le banc. Si vous recopiez le texte depuis
  un message au lieu de transférer le fichier, réécrivez-le **avec** la marque :
  `$t = Get-Content -Raw -Encoding UTF8 .\source.ps1; Set-Content .\creer-groupes-grc.ps1 -Value $t -Encoding UTF8`.

## 8. Les appartenances — sans `GRC-ADMIN`, personne n'administre

```powershell
Add-ADGroupMember GRC-ADMIN            admin.grc
Add-ADGroupMember GRC-EXPORT           admin.grc,rssi.groupe
Add-ADGroupMember GRC-GROUPE-RSSI      rssi.groupe
Add-ADGroupMember GRC-GROUPE-DIRECTION direction
Add-ADGroupMember GRC-TLS-RSSI         rssi.tls,equipe-secu-tls     # le groupe imbriqué
Add-ADGroupMember GRC-TLS-CONTRIB      contrib.tls
Add-ADGroupMember GRC-TLS-QUALITE      qualite.tls
Add-ADGroupMember GRC-TLS-AUDITEUR     qualite.tls
Add-ADGroupMember GRC-DEU-RSSI         rssi.deu
Add-ADGroupMember GRC-DEU-CONTRIB      contrib.deu
Get-ADGroupMember GRC-TLS-RSSI -Recursive     # attendu : rssi.tls ET indirect.tls
```

🛑 **La seule ligne obligatoire est la première.** Il n'existe **aucun** administrateur livré
avec le produit : le premier accès s'obtient en mettant un compte réel dans `GRC-ADMIN`, et
dans `GRC-EXPORT` s'il doit extraire des données. Sans cela, tout est installé, tout répond,
les comptes entrent — et **personne ne peut rien administrer** (403). Côté Debian,
`groupes-ad.sh --verifier` confronte ensuite vos groupes à ce que le produit déclare.

## 9. Signer le certificat du serveur avec l'AC du domaine

Sans cela, le site fonctionne mais **chaque navigateur du domaine avertit** — et apprend aux
utilisateurs à passer outre. Trois gestes, sur deux machines :

**Sur la VM Debian**, l'installateur engendre la clé et la demande (aucun secret dans une CSR) :

```bash
sudo bash -c 'umask 077; openssl req -new -newkey rsa:3072 -nodes \
  -keyout /etc/ssl/cyber-grc/serveur.key.nouvelle -out /etc/ssl/cyber-grc/grc.csr \
  -subj "/CN=grc.dedaero.lan" -addext "subjectAltName=DNS:grc.dedaero.lan" -addext "extendedKeyUsage=serverAuth"'
sudo chmod 0644 /etc/ssl/cyber-grc/grc.csr        # c'est lui qui part vers le contrôleur
```

**Sur le contrôleur**, avec le modèle `WebServer` (publié par défaut — `Get-CATemplate` le dit) :

```powershell
certreq -q -config 'AD-01.dedaero.lan\DEDAERO-AD-01-CA' -submit -attrib "CertificateTemplate:WebServer" C:\grc.csr C:\grc.cer
```

Réponse attendue : *délivré* (« Issued »), demande numérotée. Si elle reste *en attente*,
l'AC exige une approbation : `certutil -resubmit <n°>`, ou la console **certsrv**. 🛑
**`C:\grc.cer` est DÉJÀ du Base-64** : ne lui appliquez pas `certutil -encode`, le contenu
serait encodé deux fois et Debian répondrait « unable to load certificate » — mesuré.
Renvoyez-le tel quel.

**Sur la VM Debian**, les trois fichiers du vhost — puis Apache, puis l'installateur :

```bash
sudo install -m 0644 grc.cer                             /etc/ssl/cyber-grc/serveur.crt
sudo install -m 0600 /etc/ssl/cyber-grc/serveur.key.nouvelle /etc/ssl/cyber-grc/serveur.key
sudo install -m 0644 /etc/cyber-grc/ca-active-directory.pem  /etc/ssl/cyber-grc/chaine-pki-interne.crt
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo bash backend/deploy/install.sh --maj && sudo bash backend/deploy/install.sh --diagnostic   # ligne « certificat »
```

Le modèle `WebServer` délivre pour **deux ans** (labo : jusqu'au 29/09/2028) : notez la date,
le diagnostic la rappelle. Et **ne laissez pas traîner** la clé sous son nom temporaire, ni la
CSR, ni des copies `.decouverte` des anciens fichiers : une clé privée en double est une clé
qu'on oublie.

## 10. Les pièges mesurés

| Symptôme | Cause | Remède |
|---|---|---|
| `certutil` : « Trop d'arguments » | `-ca.cert` coupé en deux par PowerShell | `certutil '-ca.cert' …` — les apostrophes (§5) |
| le script des groupes : *chaîne non terminée*, aucun groupe créé | apostrophe typographique dans une description | engendreur corrigé (`617a24b`) ; ré-engendrez le script |
| descriptions de groupes en « Ã© » | fichier `.ps1` sans marque d'ordre d'octets, lu en ANSI par PowerShell 5.1 | engendreur corrigé ; ou `Set-Content -Encoding UTF8` (§7) |
| Debian : « unable to load certificate » sur `grc.cer` | Base-64 encodé deux fois | renvoyer `grc.cer` tel quel (§9) |
| `Cert:\LocalMachine\My` vide après AD CS, port 636 fermé | l'auto-inscription du contrôleur n'est pas passée | `gpupdate /force`, `certutil -pulse`, attendre (§4) |
| l'installateur nomme un émetteur qu'il « ne peut pas vérifier » | le contrôleur ne présente que sa feuille | lui donner `AD-CA.cer` (§5) |
| les comptes entrent, **403** partout | aucun groupe `GRC-*`, ou `GRC-ADMIN` vide | §8 |
| `indirect.tls` refusé | `equipe-secu-tls` n'est pas membre de `GRC-TLS-RSSI` | §8, `-Recursive` le montre |

## 11. Ce que vous renvoyez à l'installateur

```
[ ] FQDN et adresse du contrôleur         AD-01.dedaero.lan · 192.168.10.238
[ ] base de recherche                     DC=dedaero,DC=lan
[ ] DN du compte de service               CN=svc-grc,OU=Comptes de service,DC=dedaero,DC=lan
[ ] son mot de passe                      par un AUTRE canal, sans expiration
[ ] certificat de l'AC                    AD-CA.txt (Base-64) + son empreinte SHA-256 de vive voix
[ ] nom DNS de l'application              grc.dedaero.lan → 192.168.10.167
[ ] DN de l'OU des groupes                OU=Cyber-GRC,OU=Comptes de service,DC=dedaero,DC=lan
[ ] script des groupes exécuté            « N attendu(s) - N cree(s) - 0 en echec »
[ ] LA personne mise dans GRC-ADMIN       nommément
[ ] certificat serveur signé              grc.cer, tel quel
```
