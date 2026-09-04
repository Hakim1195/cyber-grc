# Porte S3 — audit indépendant du lot L3 (authentification, sessions, autorisation)

> **Révision auditée** : `4f76da2f6710471f0703e0df5492699715d60e14`
> (« La vague 3 se referme : 1028/1028, et le registre cesse de mentir sur Q-66 »),
> branche `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU — n'a écrit aucune des lignes examinées, n'écrit que dans
> `docs/securite/`.
> **Date** : 04/09/2026. **Machine** : VM Debian 13 réelle (`SRV-Infra`), installation
> déployée par `deploy/install.sh`, service `cyber-grc` sous systemd, PostgreSQL 17.11,
> Apache 2.4.68 (Debian) sur `https://grc.exemple.interne/`, **Active Directory Samba
> réel** en LDAPS.

---

## Verdict global

> ### ❌ **Deux contrôles en échec : S7 et S18.**
> **0 constat de la classe « fuite entre filiales ».** Le cloisonnement tient, le
> périmètre vient du serveur, l'authentification fonctionne contre un AD réel, les
> droits à trois axes mordent, le verrouillage fonctionne. **Dix-sept constats neufs**
> (Q-88 → Q-104), dont **trois relèvent des deux premières classes du §0 bis** et se
> corrigent avant la fin de la vague.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** au lieu d'opposer un veto.
Le tri :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **Q-88** — l'annuaire `personnes` n'est **jamais** alimenté depuis l'AD : le livrable est du code mort en production, et son essai est vert sur une branche inatteignable | corrigé avant la fin de la vague |
| **Fuite de données** | **Q-89** — le **droit d'export est contournable** depuis l'interface : un profil `export=false` extrait en un clic la synthèse de posture cyber, sans refus et sans trace · **Q-103** — le correctif est commité mais **pas déployé** : la machine en service fuit toujours | corrigé avant la fin de la vague, sans négociation |
| **Tout le reste** | Q-90 → Q-102 et **Q-104**, plus **Q-86** et **Q-87** que la vague n'a pas fermés | marqué **`V1.1`**, la vague continue |

> ⚠️ **État à l'heure de la remise.** Ce verdict porte sur `4f76da2`. Pendant l'audit,
> l'orchestrateur a corrigé Q-88 et Q-89 et commité `294c0eb` ; **j'ai rejoué ces deux
> constats à mon instrument et ils tiennent** (§9), banc **1030/1030**. Mais la correction
> de Q-89 **n'est pas déployée** sur la machine en service, qui reste exposée →
> constat **Q-103**, immédiat. Les seize autres contrôles n'ont pas été rejoués sur
> `294c0eb` : *une mesure faite après coup n'est pas un rejeu de la porte.*

**Le lot L5 (journal d'audit) n'est pas livré**, et ce rapport ne le lui reproche pas :
le contrôle S3 est donc rendu « partiel — inaltérabilité acquise, couverture attendue de
L5 », pas « en échec ».

---

## 1. Ce que j'ai mesuré

Toute affirmation de ce rapport porte sa commande et sa sortie. Un chiffre sans sa
commande n'est pas un chiffre.

### 1.1 Le banc, sur la révision auditée

```
$ cd /home/claude/cyber-grc/backend && set -a && source ~/.grc-essais.env && set +a && npm test
ℹ tests 1028   ℹ suites 229   ℹ pass 1028   ℹ fail 0   ℹ duration_ms 128312
EXIT=0
```

Rejoué **une seconde fois en fin d'audit**, après restauration de toutes mes mutations,
pour que le vert qualifie une **révision** et non mon répertoire de travail (la leçon du
8ᵉ passage de S2) :

```
$ git status --short        # (vide)
$ git rev-parse HEAD        # 4f76da2f6710471f0703e0df5492699715d60e14
$ npm test
ℹ tests 1028   ℹ pass 1028   ℹ fail 0        EXIT=0
```

**Répartition par famille, mesurée famille par famille** — le `README` §5 en donne un
compte faux, voir Q-90 :

```
$ for f in annuaire api auth base deploiement depot documentation droits modules navigateur reprise; do
    node --test "test/$f/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail)"; done
annuaire 48 · api 241 · auth 115 · base 272 · deploiement 65 · depot 3
documentation 17 · droits 83 · modules 33 · navigateur 74 · reprise 77
somme = 1028   (identique au total du banc — aucune famille n'échappe à `npm test`)
```

### 1.2 Dépendances (S15)

```
$ npm audit --omit=dev
found 0 vulnerabilities
$ node -e "…package-lock.json…"
paquets dans le verrou : 66  |  dont dev : 4  |  production : 62
```

Aucun client LDAP en dépendance : l'arbitrage du `CONVENTIONS.md` §28 (client écrit à la
main, 1 009 lignes) est tenu, et `cookie` / `set-cookie-parser` sont présents en
transitives **sans être employés** — `lireCookie` est écrit à la main.

### 1.3 Le chemin complet, contre l'installation déployée (S17)

Chromium réel → Apache 2.4.68 réel (vhost du dépôt, certificat de la PKI interne) →
service systemd → PostgreSQL 17.11 → **Active Directory Samba réel**. C'est la première
fois que la jonction est faite contre l'**installation déployée** et non contre un
montage de banc.

```
$ PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node s17.mjs
statut = 200
écran de connexion présent : true
après connexion (rssi.tls / AD réel) : titre = « Cyber GRC — Dedienne Aerospace »
la raison sociale s'affiche : true        ← constat Q-85, confirmé sur le chemin réel
un identifiant technique FIL- s'affiche : false
parcours de 6 écrans (#/risques #/actions #/incidents #/audits #/mesures #/settings)
pageerror = 0
console error/warn = 1   [« 401 » initial, avant connexion — attendu]
violations CSP = 0
requêtes en échec = 0
```

### 1.4 Politique TLS et frontal

Mesurée avec les précautions que le brief impose — `--capath` n'est pas `--cacert`, et
OpenSSL 3.5 refuse de *proposer* TLS 1.0/1.1 sans `@SECLEVEL=0`.

```
$ curl -sS -o /dev/null -w "%{http_code} verif=%{ssl_verify_result}\n" https://grc.exemple.interne/
200 verif=0                     ← la chaîne valide contre le magasin SYSTÈME, sans --cacert
$ curl -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://grc.exemple.interne/
308 -> https://grc.exemple.interne/
$ for v in tls1 tls1_1 tls1_2 tls1_3; do openssl s_client -connect 127.0.0.1:443 \
      -servername grc.exemple.interne -$v -cipher 'ALL:@SECLEVEL=0'; done
tls1   : alert protocol version (70)   ← REFUSÉ PAR LE SERVEUR, pas par le client
tls1_1 : alert protocol version (70)
tls1_2 : SSL handshake has read 1372 bytes
tls1_3 : SSL handshake has read 2539 bytes
$ openssl s_client -connect 127.0.0.1:443 -servername grc.exemple.interne
Protocol: TLSv1.3   Cipher: TLS_AES_256_GCM_SHA384   Verify return code: 0 (ok)
```

En-têtes servis sur `/api/session` (S10) : `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`,
CSP stricte (`default-src 'self'; script-src 'self'; object-src 'none';
frame-ancestors 'none'`), `Cache-Control: no-store`. **Aucun en-tête CORS** :

```
$ curl -i -H 'Origin: https://mechant.example' https://grc.exemple.interne/api/sante | grep -i access-control
(aucun)
```

Cookie de session, relevé sur une connexion réelle :

```
set-cookie: grc_session=…; Path=/; HttpOnly; SameSite=Strict; Secure
```

— **ni `Max-Age` ni `Expires`**, conformément au `CONVENTIONS.md` §26.2 : l'échéance fait
foi en base.

### 1.5 L'authentification, contre l'Active Directory réel

Huit comptes, huit verdicts. Le périmètre et les droits sont ceux que `groupes_ad` résout,
pas ceux que le navigateur demande.

| Compte | Statut | Portée | admin. Groupe | export | Domaines |
|---|---|---|---|---|---|
| `rssi.tls` | 200 | filiale (1) | non | **non** | 12 |
| `indirect.tls` *(groupe **imbriqué**)* | 200 | filiale (1) | non | non | 12 — **identiques à `rssi.tls`** |
| `contrib.tls` | 200 | filiale (1) | non | non | 3 |
| `qualite.tls` | 200 | filiale (1) | non | non | 12, dont 9 en lecture seule |
| `direction` | 200 | **groupe (2 filiales)** | non | non | 2 |
| `rssi.groupe` | 200 | groupe (2) | non | **oui** | 12 |
| `admin.grc` | 200 | groupe (2) | **oui** | non | 13 |
| `sans.groupe` | **403 `droit_insuffisant`** | — | — | — | — |

**L'appartenance indirecte ouvre bien l'accès** : `indirect.tls`, membre d'un groupe
imbriqué, obtient exactement les droits de `rssi.tls`. Critère d'acceptation du lot tenu.

### 1.6 Condition d'entrée E1 — mesurée sur la base de production

Le substrat de session n'est plus écrivable sans condition. Mesuré comme rôle applicatif
`grc_app`, sur `cyber_grc` :

```
-- SANS grc.authentification
insert into sessions …            → ERROR: new row violates row-level security policy for table "sessions"
insert into session_filiales …    → ERROR: … for table "session_filiales"
insert into session_domaines …    → ERROR: … for table "session_domaines"
update sessions set administrateur = true   → admin_avant 4 … admin_apres 4   (0 ligne touchée)
delete from sessions                        → sessions_restantes 31            (0 ligne touchée)

-- AVEC grc.authentification = 'oui'
insert into sessions …            → insertion acceptee : 1
update sessions set administrateur = true   → admin_apres_avec_auth 31         (l'update MORD)
```

**E1 est fermée.** Le point d'attention que `sessions.ts` documente lui-même est réel et
tenu : l'`update`/`delete` refusé est **silencieux** (0 ligne, pas d'erreur), et c'est la
raison pour laquelle chaque révocation compte ses lignes.

### 1.7 Condition d'entrée E2 — le drapeau d'administration Groupe

Un seul producteur (`ResolveurPerimetreSession`, constructeur). Vérifié **par mutation**
(§4). Aucune route ne le pose : `admin.grc` l'obtient, `rssi.groupe` — même portée Groupe,
même niveau `validation`, sans le profil ADMIN — ne l'obtient pas.

### 1.8 Condition d'entrée E4 — le contrôle avant l'analyse du corps

Mesure de référence de la porte S2 : **291 ms** pour 18 Mio anonymes derrière Apache.

```
$ for i in 1..6; do curl -X POST https://grc.exemple.interne/api/reprise \
      -H 'content-type: application/json' --data-binary @gros.txt (25 165 824 octets); done
code=401  temps = 0,102 · 0,092 · 0,097 · 0,084 · 0,095 · 0,091 s      → médiane ≈ 93 ms
$ (session valide SANS droit d'administration, même corps)
code=403  temps = 0,134 s                                              ← E3 : refus avant analyse
```

**E4 est fermée** : le refus s'effondre d'un facteur ≈ 3, et il est rendu **avant**
l'analyse du corps.

### 1.9 Bornes de corps au frontal (S13) — la famille Q-44 / Q-51 / Q-58

```
$ curl -X POST … --data-binary @41 943 040 octets   https://…/api/reprise   → 413 en 0,013 s
$ curl -X POST … --data-binary @41 943 040 octets   https://…/index.html    → 413 en 0,014 s   (contrôle symétrique)
$ curl -X POST -H 'Transfer-Encoding: chunked' --data-binary @25 Mio  https://…/api/reprise
                                                                     → 411 en 0,013 s, size_upload = 0
$ curl -X POST https://…/api/connexion --data-binary @1 Mio          → 413 en 0,021 s
```

**La réserve que le registre laissait ouverte est levée** : « reste non mesuré, les 18 Mio
en `Content-Length` derrière le vhost d'après la règle ». Mesuré : sous la borne, le corps
est relayé et le service refuse en 93 ms sans l'analyser ; au-dessus, le frontal rend 413
en 13 ms. Q-44, Q-51 et Q-58 sont **fermés au frontal** et peuvent quitter le registre.

### 1.10 Verrouillage et rythme (S11)

Mesuré de bout en bout contre l'AD réel, **compte par compte et adresse par adresse** :

```
témoin  : indirect.tls, bon mot de passe, depuis 10.99.0.1              → 200
5 échecs consécutifs sur indirect.tls                                    → 401 ×5
bon mot de passe, MÊME adresse                                           → 401   ← verrouillé
bon mot de passe, AUTRE adresse (127.0.0.1)                              → 401   ← verrou par COMPTE
autre compte (contrib.tls), MÊME adresse                                 → 200   ← pas de dommage collatéral
```

En base, la trace est lisible par un exploitant :

```
identifiant  | actif | tentatives_echouees |      verrouille_jusqu_a
indirect.tls |   t   |          5          | 2026-09-04 02:20:01.300685+00
```

Barrière **par adresse** (anti-pulvérisation), seuil `AUTH_MAX_TENTATIVES × 4` = 20 :

```
25 échecs CONSÉCUTIFS depuis 10.99.0.1, 25 logins inconnus différents    → 401 ×25
compte VALIDE depuis 10.99.0.1                                           → 401   ← adresse écartée
le même compte depuis 127.0.0.1                                          → 200
```

Échecs journalisés, avec l'adresse et le motif :

```
utilisateur_libelle | adresse_ip |                motif
cible22             | 10.99.0.1  | aucun compte ne correspond au login
```

### 1.11 Le périmètre ne vient jamais du navigateur — S2 rejoué contre la couche qui le FABRIQUE

C'est l'exigence explicite du `CONVENTIONS.md` §22 : *L3 introduit la couche qui fabrique
le périmètre, le contrôle S2 se rejoue contre elle, pas contre les routes.*

Session de `contrib.tls` (une seule filiale, ni Groupe ni administration). Sept formes
d'en-tête, le cookie dupliqué, les paramètres d'URL :

```
X-Filiale-Id: <FIL-DEU>              → périmètre 1cf, groupe=False, admin=False, contrib.tls
X-Filiale: <FIL-DEU>                 → inchangé
X-Perimetre: groupe                  → inchangé
X-Grc-Filiales: <FIL-DEU>            → inchangé
X-Administration-Groupe: oui         → inchangé
Grc-Filiale-Id: <FIL-DEU>            → inchangé
X-Forwarded-User: admin.grc          → inchangé
?filiale=<FIL-DEU>&perimetre=groupe&administration_groupe=oui  → inchangé
```

La propriété tient **par la forme** : `resoudre()` ne prend aucun argument, et
`perimetreFige` est gelé au constructeur à partir des lignes `sessions`,
`session_filiales`, `session_domaines`. Le jeton est une **référence**, jamais une
revendication : il est haché et sert de clé de recherche.

Contrôle adjacent, celui du 5ᵉ passage — un défaut *entre* le vhost et le serveur :
`X-Forwarded-For` forgé par le client est **effacé** par le frontal, et le journal
enregistre l'adresse réelle. Vérifié avec trois adresses sources distinctes :

```
X-Forwarded-For: 203.0.113.66 (forgé)  →  journal : adresse_ip = 127.0.0.1  (la vraie)
source 10.99.0.1                        →  journal : adresse_ip = 10.99.0.1
source 127.0.0.1                        →  journal : adresse_ip = 127.0.0.1
```

Le service n'écoute que sur la boucle locale (`ss -ltn` → `127.0.0.1:3001`) : Apache est
bien le seul point d'entrée.

### 1.12 Cloisonnement (S1) et absence d'oracle (S12)

Une ligne semée dans la filiale **DEU** directement en base :

```
ACT-SONDE-DEU | FIL-…f36 (DEU) | SECRET-DEU-NE-DOIT-PAS-FUIR
```

Vue par les cinq sessions réelles :

```
rssi.tls    : actions=1, fuite DEU=False
contrib.tls : actions=1, fuite DEU=False
direction   : actions=0, fuite DEU=False
admin.grc   : actions=1, fuite DEU=False
rssi.groupe : actions=1, fuite DEU=False        (périmètre de LECTURE = 2 filiales)
export de rssi.groupe : occurrences de « SECRET-DEU » = 0
```

Le jeu servi est celui de la **filiale active**, même pour un périmètre Groupe — décision
écrite dans `src/entites/index.ts` et cohérente avec le report de la consolidation Groupe
au lot L4.

Écriture croisée refusée **sans oracle d'existence** :

```
$ curl -X PUT (session rssi.tls, filiale TLS) …/api/entites/actions/ACT-SONDE-DEU
HTTP/1.1 404 Not Found
{"erreur":"ressource_inconnue","message":"Cet enregistrement n'existe pas dans votre périmètre…"}
```

— un **404**, pas un 403 : la ligne d'une autre filiale n'existe pas, elle n'est pas
« interdite ».

Filtrage des lectures par domaine (S6, en lecture) :

```
admin.grc   : actions 1, audits 1, history 2
contrib.tls : actions 1, audits 0, history 0     (domaines : actions, incidents, actifs)
direction   : actions 0, audits 0, history 2     (domaines : pilotage, conformite)
```

### 1.13 Droits à trois axes, appliqués par le serveur (S6)

```
direction    POST /api/entites/risques        → 403 droit_insuffisant
contrib.tls  POST /api/entites/risques        → 403   (domaine « risques » hors profil)
contrib.tls  POST /api/entites/actions        → 201
qualite.tls  POST /api/entites/mesures        → 403   (conformite = lecture)
qualite.tls  POST /api/entites/audits         → 201   (audits = contribution)  ← MÊME SESSION
```

C'est le **critère d'acceptation exact** du constat Q-66, mesuré sur le chemin réel, avec
l'AD réel. Les `niveaux` par domaine que le serveur rend :

```
{"actifs":"lecture","actions":"lecture","audits":"contribution","continuite":"lecture",
 "conformite":"lecture","documents":"contribution","tiers":"lecture","pilotage":"lecture",
 "incidents":"lecture","personnel":"lecture","rgpd":"lecture","risques":"lecture"}
```

La portée `groupe` d'une création est refusée à qui n'a pas l'administration Groupe :

```
contrib.tls  POST {"portee":"groupe"}  → 403 hors_perimetre
rssi.tls     POST {"portee":"groupe"}  → 403
```

### 1.14 Verrouillage optimiste (S4)

```
POST  …/api/entites/actions                              → 201, id = ACT-1788488733716-…
PUT   …  {"version":1,…}                                 → 200
PUT   …  {"version":1,…}  (la même version)              → 409 {"erreur":"conflit_version","code_grc":"GRC03"}
PUT   …  {"version":2,"champs":{"_version":99,"version":99,"cree_par":"pirate"}}  → 400
```

Le client ne peut **pas** fixer `version` ni `cree_par` : ils sont refusés, pas ignorés.

### 1.15 Journal d'audit (S3)

Inaltérabilité, éprouvée **comme propriétaire de la base** (donc sous `force row level
security`) :

```
update journal_audit …    → ERROR: Table journal_audit en ajout seul : opération UPDATE refusée.
delete from journal_audit → ERROR: … DELETE refusée.
truncate journal_audit    → ERROR: … TRUNCATE refusée.
select f_journal_audit_verifier()  → (0 lignes)     ← chaînage intact
```

Couverture, sur l'installation réelle après une journée d'usage :

```
action             | count
connexion_echouee  |    79
connexion_reussie  |    42
refus_autorisation |     3
deconnexion        |     1
```

Quatre types d'événement, tous d'authentification. **Aucune écriture de données, aucun
export** n'est tracé : c'est le lot L5, et le code le dit à l'endroit exact
(`src/api/index.ts`, route d'export : « le journal d'audit inaltérable est le lot L5 :
cette ligne technique est ce qui existe aujourd'hui, et elle ne se donne pas pour une
preuve »). **Non reproché.** Voir toutefois Q-89 : la grille exige, *au titre de S7*, que
tout export soit journalisé.

### 1.16 Garde-fous branchés (S16)

```
$ select * from controles_schema order by 1;
f_verifier_armement · f_verifier_chemin_recherche · f_verifier_couverture_rls
f_verifier_entropie_identifiants · f_verifier_portee_figee · f_verifier_privileges
f_verifier_substrat_session · f_verifier_tracabilite · f_verifier_unicite_cloisonnee
(9 lignes)
$ select * from f_verifier_schema();
(0 lignes)
```

`f_verifier_schema()` **découvre** ses contrôles (`for r in select * from
f_decouvrir_controles_schema()`), il ne les énumère pas ; il est appelé par
`db/migrate.mjs` (sortie en code 7) **et** par `deploy/install.sh`. Le garde-fou neuf du
lot, `f_verifier_substrat_session()`, est consigné et **éprouvé par mutation** dans
`test/droits/substrat-session.test.mjs`.

### 1.17 Injection SQL et secrets (S5, S8)

Instruits par balayage exhaustif (revue déléguée, résultats recoupés) :

- **76 énoncés SQL distincts** dans le périmètre L3 (61 appels `.query` directs + 17
  constructions passant par deux entonnoirs). **76/76 passent leurs valeurs en `$n`.**
  Ce qui est interpolé est exclusivement un **identifiant** filtré par `ident()` — liste
  blanche `^[a-z_][a-z0-9_]{0,62}$` qui **lève** —, un numéro de paramètre, ou une
  constante gelée. Les noms de colonnes proviennent du **catalogue `pg_catalog`**, pas
  d'une liste écrite à la main.
- Les cinq réglages de session (`grc.utilisateur`, `grc.filiale_id`, `grc.filiales`,
  `grc.administration_groupe`, `grc.authentification`) sont posés par `set_config(…, $n,
  true)` ou par un littéral constant. **Aucun `SET LOCAL` concaténé.** Le domaine
  `id_metier` interdit la virgule, ce qui ferme la scission de `grc.filiales`.
- **Filtre LDAP** : échappement RFC 4515 des cinq caractères, mesuré à l'exécution
  (`*`→`\2a`, `(`→`\28`, `)`→`\29`, `\`→`\5c`, NUL→`\00`). Deux sites de construction, les
  deux échappent. La correspondance étendue AD (`:1.2.840.113556.1.4.1941:`) est refusée
  expressément. Essai d'injection **avec sa mutation** : `test/auth/protocole-ldap.test.mjs`, 18/18.
- Vérifié en vol : une charge hostile est stockée **littéralement**, et le schéma est
  intact.

```
$ curl -X POST … -d '{"champs":{"titre":"x'"'"'); drop table actions; --"}}'
{"enregistrement":{…,"titre":"x'); drop table actions; --",…}}
$ select count(*) … relkind='r'  → 48        (inchangé)
```

- **Secrets** : aucune clé privée, aucune chaîne de connexion porteuse d'identifiants,
  aucune empreinte de production dans les 255 fichiers suivis. Les huit variables
  porteuses de secret de `.env.example` sont **vides** et `secret()` n'accepte pas de
  paramètre `defaut` — un secret codé en dur exigerait de changer la signature. Le corps
  d'erreur est une **liste blanche fermée de six champs** ; `detailJournal` ne sort
  jamais. Le mot de passe présenté n'atteint que deux fonctions (le BER du `bind`, et
  `verifierEmpreinte`). `resumerConfiguration()` est une liste blanche de 15 champs. Le
  jeton en clair ne va qu'au cookie ; la base ne reçoit que l'empreinte SHA-256.

### 1.18 Le produit fait ce qu'il doit faire (S18)

Le geste que la vague 3 ajoute — **une session révoquée pendant une saisie** — mesuré au
navigateur, contre l'installation réelle, avec une révocation **faite en base** comme le
ferait un déprovisionnement (et non simulée par une interception) :

```
saisie « SAISIE-QUI-NE-DOIT-PAS-DISPARAITRE » posée dans le champ « nom » d'un risque neuf
révocation en base : 18 sessions révoquées
clic sur « Enregistrer »
→ 401 POST /api/entites/risques · 401 GET /api/rafraichir
→ voile de reconnexion : PRÉSENT
→ message : « Session expirée — Risque « SAISIE-QUI-NE-DOIT-PAS-DISPARAITRE » : Votre
   session a expiré… Votre saisie reste à l'écran et repartira dès que vous… »
→ bandeau : « 1 modification(s) non enregistrée(s). »
→ pageerror = 0
```

**La saisie n'est pas détruite, et l'utilisateur le sait.** Le critère d'acceptation de
l'agent FRONT est tenu.

Déconnexion : `DELETE /api/connexion` → **204**, la session suivante → **401**, et la
révocation est **en base** (`motif_revocation = 'deconnexion'`), pas seulement oubliée du
navigateur.

---

### 1.19 Le journal du serveur, lu — S12 et S8 par la mesure

> **Cette section remplace une réserve.** La première version de ce rapport écrivait :
> *« je n'ai pas pu lire une seule ligne de pino en production ; S8 et S12 sont établis par
> lecture, pas par mesure »*. L'accès m'a été ouvert (`sg systemd-journal -c "journalctl -u
> cyber-grc …"`) et la réserve est **levée par la mesure**, dans les deux sens.

#### a) Le contrat des deux bouts : générique au client, précis au journal

Douze refus provoqués sur `https://grc.exemple.interne/`, puis relus dans le journal par
leur `reference`. **Rejoué intégralement sur le binaire redéployé** (pid `369777`, voir §9)
pour que la mesure porte sur une seule révision : 42 lignes JSON, `pid` unique.

| Cas provoqué | Ce que reçoit le CLIENT | Ce que dit le JOURNAL |
|---|---|---|
| mot de passe faux, compte connu | « Identifiant ou mot de passe incorrect… » | `identifiants refusés : identifiants refusés par l'annuaire` |
| identifiant inconnu | **le même message, à l'octet près** | `identifiants refusés : aucun compte ne correspond au login` |
| session inventée | « Votre session a expiré ou n'a pas été ouverte. » | `session refusée, motif « inconnue »` |
| session **révoquée** | le même message | `session refusée, motif « revoquee »` |
| champ manquant à la connexion | « Identifiant et mot de passe sont attendus. » | `champ « mot de passe » absent ou du mauvais type` |
| corps JSON tronqué | « La requête n'a pas pu être lue… » | `refus du cadre HTTP : FST_ERR_CTP_INVALID_JSON_BODY FastifyError: Body is not valid JSON…` |
| route inconnue | « Aucune ressource ne répond à GET /api/route-inventee-s12b. » | *(aucune ligne « detail » — seul le `reqId` relie les deux lignes)* |
| refus de droit | « Votre profil ne donne pas accès à cette partie… » | `domaine « risques » hors du profil (domaines : actifs, actions, incidents)` |
| refus d'export | « L'export des données est une autorisation distincte… » | `droit d'export absent (PLAN_SERVEUR §3.3)…` |
| écriture hors périmètre | « Cet enregistrement n'existe pas dans votre périmètre. » | `actions/ACT-SONDE-DEU : absent OU hors du périmètre de lecture — le serveur ne distingue pas les deux, et ne doit pas` |
| entité inconnue (`pg_shadow`) | « « pg_shadow » n'est pas une entité connue… » | `entité inconnue : pg_shadow` |
| champ inconnu | « Le champ « … » n'appartient pas à l'entité « actions »… » | `champ refusé : actions.colonne_inexistante_s12b` |

**Le contrat tient dans les deux sens, et sur les douze cas :** aucun `detail`, aucun code
de cadre, aucune pile, aucun nom d'objet de base n'atteint le navigateur ; et le journal,
lui, distingue ce que la réponse HTTP confond délibérément. Les deux premières lignes le
montrent mieux que tout : **le client ne peut pas séparer « mot de passe faux » de
« compte inexistant », l'exploitant le peut.** C'est exactement le correctif Q-79, vérifié
pour la première fois **par les deux bouts à la fois**.

Le cas `corps JSON tronqué` clôt Q-55 de la même façon : la nomenclature interne de Fastify
(`FST_ERR_CTP_INVALID_JSON_BODY`) est **dans le journal** et **pas** dans la réponse.

Deux observations mineures, qui ne remettent rien en cause :

- **`route inconnue` n'écrit aucune ligne de refus.** Le `setNotFoundHandler` répond sans
  journaliser ; seules « incoming request » et « request completed » portent le `reqId`. La
  référence reste donc retrouvable, mais un exploitant qui cherche « pourquoi ce 404 » n'a
  que l'URL.
- **Le journal nomme le compte de secours là où la réponse HTTP ne le nomme pas** —
  et c'est le comportement voulu. Sondé à l'aveugle avec quatre identifiants candidats :

  ```
  secours     -> HTTP 401   journal : « compte de secours : mot de passe refusé »
  brise-glace -> HTTP 401   journal : « aucun compte ne correspond au login »
  admin       -> HTTP 401   journal : « aucun compte ne correspond au login »
  root        -> HTTP 401   journal : « aucun compte ne correspond au login »
  ```

  Les quatre réponses HTTP sont identiques : **Q-79 tient**. Le journal, lui, m'a appris que
  le compte de secours de cette installation existe et s'appelle `secours` — ce qui est
  précisément sa fonction, et la raison pour laquelle il n'est lisible que par un exploitant.

#### b) L'inverse : un secret a-t-il fui DANS le journal ?

908 lignes balayées (9 heures, deux binaires), avec des mots de passe **choisis pour être
reconnaissables** et envoyés pendant la mesure :

```
MonMotDePasseSecretAuditS12   -> 0 occurrence      SecretRejeuS12b        -> 0
AutreSecretAuditS12           -> 0                 AutreSecretRejeuS12b   -> 0
Contrib-Tls-2026! · Rssi-Tls-2026! · Admin-Grc-2026! · Direction-2026! · P@ssw0rd  -> 0
jeton de session en clair (43 signes base64url)    -> 0
son empreinte SHA-256                              -> 0
grc_session · set-cookie · authorization · "cookie" · motDePasse · password  -> 0
MOT_DE_PASSE · dnService · CN=svc · scrypt$ · empreinte · SESSION_SECRET     -> 0
"body" · "champs"  (le corps de requête n'est jamais journalisé)             -> 0
```

Les 310 chaînes de 43 signes présentes dans le journal sont **toutes** des identifiants
métier (`ACT-…`, `AUD-…`, `FIL-…`, `REQ-…`) — aucun jeton.

Le **résumé de configuration du démarrage**, seul endroit qui journalise la configuration,
est une liste blanche de 15 champs, vérifiée sur la ligne réelle :

```json
{"environnement":"production","version":"0.1.0","ecoute":"127.0.0.1:3001",
 "url_publique":"https://grc.exemple.interne","base":"grc_app@127.0.0.1:5432/cyber_grc",
 "base_ssl":"desactive","base_pool_max":10,"authentification":"annuaire (LDAPS)",
 "ldap_url":"ldaps://dc01.exemple.interne:1636","smtp":"désactivé",
 "retention_journal_jours":1095, …}
```

— l'utilisateur de base **sans son mot de passe**, l'URL LDAP **sans le DN ni le mot de
passe du compte de service**, aucune empreinte, aucun secret de session.

**Piles d'appel** : 17 lignes en portent une, toutes de niveau `50` et toutes **antérieures
au correctif Q-84** (03/09, 23:26) — le refus *fail-closed* de la session provisoire. Elles
sont au journal, ce qui est leur place ; aucune n'a atteint un client. Sur le binaire
courant : **0 ligne ≥ 500**.

#### c) Injection de journal

Un identifiant forgé pour fabriquer une fausse ligne, et un autre porteur de sauts de ligne :

```
identifiant = 'pirate","level":60,"msg":"COMPROMISSION TOTALE","x":"'
identifiant = 'saut\nde\rligne'
→ journal : 6 lignes, 6 JSON valides, 0 ligne non JSON, 0 occurrence de « COMPROMISSION »,
             aucune ligne de niveau ≥ 60
→ journal d'AUDIT : les deux logins sont stockés LITTÉRALEMENT dans `utilisateur_libelle`
   (« saut<LF>de<CR>ligne »), et `f_journal_audit_verifier()` rend 0 anomalie
```

Le journal technique (pino, JSON) est **imperméable**. Le journal d'audit stocke la valeur
telle quelle, ce qui est juste en base — mais la **consultation et l'export du journal**
sont un livrable de L5, et une valeur porteuse de `\n` scindera une ligne dans une sortie
texte ou CSV. Noté pour L5 ; l'asymétrie mérite d'être dite, puisque le témoin
`x-request-id` de `src/serveur.ts`, lui, **retire** les caractères de contrôle.

#### d) S8 — ce qui est réellement journalisé d'un événement d'authentification

Mesuré dans le **journal d'audit**, sur des événements que j'ai provoqués :

| Événement | Tracé ? | Ligne relevée |
|---|---|---|
| connexion réussie | ✅ | `connexion_reussie · Connexion réussie de « contrib.tls » (Dominique Lefevre).` |
| connexion refusée (annuaire) | ✅ | `connexion_echouee · détail « identifiants refusés par l'annuaire »` |
| connexion refusée (login inconnu) | ✅ | `connexion_echouee · détail « aucun compte ne correspond au login »` |
| **compte de secours — usage REFUSÉ** | ✅ | `connexion_echouee · Échec de connexion sur le COMPTE DE SECOURS « secours ». · détail « empreinte scrypt non concordante »` |
| verrouillage par le rythme | ✅ | `connexion_echouee · Connexion refusée : trop de tentatives. · détail « rythme dépassé sur identifiant, encore 900 s »` |
| refus d'autorisation à la connexion | ✅ | `refus_autorisation` (compte sans aucun groupe) |
| déconnexion | ✅ | `deconnexion` |
| **refus de droit sur une ROUTE (403)** | ❌ | rien au journal d'audit — seulement une ligne pino `« Accès refusé par le modèle de droits (le journal d'audit est le lot L5) »` |
| requête sur session révoquée | ❌ *(délibéré)* | 157 entrées avant, **157 après** : un jeton mort rejoué n'écrit pas une entrée par requête dans un journal scellé de trois ans |

Le critère du lot — *« le compte de secours est journalisé à chaque usage »* — est vérifié
**pour l'usage refusé**. L'usage **réussi** n'a pas pu l'être : je ne détiens pas le mot de
passe du compte de secours de cette installation (§6).

#### e) La couverture, chiffrée face au `PLAN_SERVEUR` §1.7

La base déclare **vingt** types d'action ; **quatre** sont émis.

```
$ select pg_get_constraintdef(oid) … journal_audit … contype='c'
administration · analyse_antivirus · approbation · archivage · arret · connexion_echouee
connexion_reussie · consultation_sensible · creation · deconnexion · demarrage · export
import · modification · purge · refus_autorisation · session_expiree · session_revoquee
suppression · verification_journal                                          → 20 déclarées

$ select action, count(*) from journal_audit group by 1
connexion_echouee 95 · connexion_reussie 57 · refus_autorisation 3 · deconnexion 2   → 4 émises
```

Face à la liste explicite du §1.7 :

| Exigé par §1.7 | État |
|---|---|
| connexions réussies **et** échouées | ✅ |
| refus d'autorisation | ◐ **partiel** — seulement à la connexion ; le 403 par requête n'y va pas |
| création / modification / suppression avec valeurs avant et après | ❌ — **lot L5** |
| actions d'administration | ❌ — lots L4/L5 |
| **imports** | ❌ — lot L7 |
| **exports** | ❌ — et c'est **Q-89**, exigé par la grille **au titre de S7**, pas de L5 |

`journaliser()` n'est appelé **que depuis `src/auth/index.ts`** (cinq sites) : aucune
écriture de données, aucun import, aucun export, aucune action d'administration ne passe par
le journal d'audit aujourd'hui. C'est le lot L5, et ce n'est pas reproché — mais la ligne
« exports » l'est.

**Un point qui change de nature.** La dérogation **E6** (lecture du journal non cloisonnée,
reportée à L5) est justifiée dans le `README` §8 par : *« Sans effet tant que le journal est
vide »*. Cette phrase est désormais **fausse**, et je l'ai mesurée : le compte de
supervision `grc_lecture`, en lecture seule et avec son propre mot de passe, lit
**138 entrées** — logins, adresses IP, motifs d'échec, et le nom du compte de secours :

```
$ psql -U grc_lecture -d cyber_grc -c "select count(*) from journal_audit;"     → 138
$ … "select utilisateur_libelle, resume from journal_audit where resume like '%SECOURS%'"
  secours | Échec de connexion sur le COMPTE DE SECOURS « secours ».
```

Le report reste juste ; **sa justification ne l'est plus**. C'est la onzième occurrence du
motif que ce chantier traque, et elle rejoint **Q-90**.

#### f) La référence d'incident — Q-39, vérifié par les deux bouts

**Elle retrouve la requête.** Simulation d'un appel au support : l'utilisateur donne la
`reference` reçue dans son refus, l'exploitant la cherche.

```
$ journalctl -u cyber-grc --grep 'REQ-1788490220485-675bru99xcjo7z7rarnomvyjw'
  02:50:20.485  POST /api/entites/risques  remoteAddress 127.0.0.1        « incoming request »
  02:50:20.562  utilisateur contrib.tls · route /api/entites/:entite
                détail « domaine « risques » hors du profil (domaines : actifs, actions, incidents) »
  02:50:20.562  erreur droit_insuffisant                                   « Requête refusée »
  02:50:20.563  statusCode 403                                             « request completed »
  → 4 lignes retrouvées
```

L'exploitant obtient l'heure, la méthode, l'URL, l'adresse, **l'utilisateur**, la route
déclarée et le motif exact — sans que l'utilisateur ait eu à lui dire autre chose que
`REQ-…`.

**Elle n'est pas choisie par le client**, et le témoin discrimine les deux chemins :

```
en-tête « X-Request-Id: REFERENCE-CHOISIE-PAR-LE-CLIENT »
  · à travers Apache  → reference rendue « REQ-1788490138013-3dbwsqor5h1gpddrrnpw82jwq »
                        et AUCUNE ligne de témoin : le vhost a bien effacé l'en-tête
  · en direct sur 127.0.0.1:3001 → reference « REQ-1788490138028-… », ET la ligne de témoin :
      {"referenceClient":"REFERENCE-CHOISIE-PAR-LE-CLIENT",
       "msg":"En-tête « x-request-id » reçu du client : le frontal devrait l'effacer et
              personne ne le produit. Cette requête n'est pas passée par Apache…"}
deux requêtes portant le MÊME en-tête → deux références distinctes
```

Le témoin de `src/serveur.ts` n'est donc pas décoratif : il **se tait** derrière Apache et
**parle** quand on court-circuite le frontal. C'est la propriété qui vit entre deux fichiers,
et elle est vérifiée des deux côtés.

---

## 2. Verdict par contrôle de la grille §4

| # | Contrôle | Verdict | Sur quoi |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ✅ **passé**, 1 réserve | §1.12 ; RLS `enable`+`force` 48/48 ; le propriétaire lui-même est soumis (ma requête a échoué sans `grc.filiales`) ; `test/base` 272/272. Réserve : sur **cinq** tables à politique conditionnelle, une lecture sans périmètre d'une table **vide** rend `0` sans que la garde s'exerce → **Q-104** |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé — rejoué contre la couche neuve** | §1.11 ; 7 formes d'en-tête, cookie dupliqué, paramètres d'URL, tous inertes ; `resoudre()` sans argument ; E1 fermée (§1.6) |
| **S3** | Journal d'audit inaltérable et complet | ◐ **partiel — inaltérabilité acquise, couverture chiffrée : 4 types sur 20** | §1.15 et **§1.19** ; `update`/`delete`/`truncate` refusés au **propriétaire** ; chaînage intact même après entrées hostiles ; **4 des 20 actions déclarées** sont émises, toutes par le chemin d'authentification |
| **S4** | Verrouillage optimiste effectif | ✅ **passé** | §1.14 ; 409 `GRC03` ; `version` et `cree_par` refusés au client |
| **S5** | Aucune injection SQL | ✅ **passé**, 2 réserves | §1.17 ; 76/76 paramétrés ; réserves : `ident()` n'a **aucun essai**, et `src/entites/index.ts:1859` interpole un nom de colonne **sans** `ident()` (sûr par six clés littérales) → **Q-99** |
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | §1.13 ; une route sans classe d'accès déclarée est **refusée** (500) et non servie ; lecture filtrée par domaine |
| **S7** | Le droit d'export est distinct de la lecture | ❌ **EN ÉCHEC** | §3, **Q-89** : le droit est tenu côté serveur (403/200 mesurés) et **contourné depuis l'interface** ; aucun export n'est journalisé |
| **S8** | Secrets | ✅ **passé — établi par la MESURE, journal du serveur lu** | §1.17 **et §1.19** ; 908 lignes de journal balayées : aucun mot de passe, aucun jeton, aucune empreinte, aucun cookie. Réserves : aucune assertion négative ne garde la propriété ; réserve `LoadCredential=` sans propriétaire → **Q-102** |
| **S9** | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** | lot L6, vague 4 |
| **S10** | Sortie et en-têtes | ✅ **passé** | §1.4 ; CSP stricte, `nosniff`, `no-store`, cookie `HttpOnly`+`SameSite=Strict`+`Secure` sans échéance propre ; 0 violation CSP dans Chromium réel ; aucun en-tête CORS |
| **S11** | Limitation du rythme et verrouillage | ✅ **passé**, 1 réserve | §1.10 ; verrou par compte à 5, par adresse à 20, échecs journalisés ; réserve : un succès **efface** le compteur d'adresse → **Q-98** |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé — les DEUX bouts confrontés** | §1.19 : **douze refus**, message générique au client et détail technique au journal, sans une seule fuite dans l'autre sens ; injection de journal refusée. Réserve : 403 vs 401 distingue « mot de passe juste, aucun accès » → **Q-96** |
| **S13** | Dénis de service applicatifs | ✅ **passé**, 1 réserve | §1.8, §1.9 ; 413 et 411 au frontal en 13 ms, E4 à ≈93 ms, plafonds de collection, registres de limiteurs bornés ; réserve : la table de revalidation n'est **pas** bornée → **Q-97** |
| **S14** | Intégrité des opérations composites | ✅ **passé** *(par le banc, pas par ma mesure)* | l'ouverture de session est **une** transaction (provisionnement + session + journal) ; `test/api/integrite-ecriture.test.mjs` vert. Je n'ai pas provoqué d'échec partiel moi-même — voir §6 |
| **S15** | Dépendances | ✅ **passé** | §1.2 ; `found 0 vulnerabilities` ; 62 paquets de production épinglés par le verrou |
| **S16** | Les garde-fous sont branchés | ✅ **passé**, 1 réserve | §1.16 ; 9 contrôles **découverts** dans le catalogue, 0 anomalie, point d'appel unique, garde-fou neuf mordu ; réserve : je n'ai pas saboté la base **de production** pour voir le chemin d'installation échouer (§6) |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | §1.3 ; première jonction contre l'**installation déployée** et l'**AD réel** ; 0 pageerror, 0 violation CSP |
| **S18** | Le produit fait ce qu'il doit faire | ❌ **EN ÉCHEC** | §1.18 est bon — mais **Q-88** : un livrable nommé du lot (« alimentation de l'annuaire `personnes` depuis l'AD ») ne s'exécute **jamais** en production |

---

## 3. Les constats

Chacun sort avec un **propriétaire nommé** et une **échéance**, ou il n'en sort pas.
Numérotation continue du registre (`PLAN_EXECUTION` §7, qui s'arrête à Q-87).

### 🛑 Q-88 — L'annuaire `personnes` n'est JAMAIS alimenté depuis l'AD : le livrable est du code mort, et son essai est vert sur une branche inatteignable

**Classe §0 bis : 1ʳᵉ — bloque le fonctionnement.**
**Propriétaire : agent A2** (`src/api/index.ts`) · **échéance : avant la fin de la vague 3.**

Le `PLAN_SERVEUR` §1.5 en fait un livrable explicite — *« l'annuaire `personnes` est
alimenté depuis l'AD, ce qui remplace l'actuelle correspondance par nom en texte libre :
les affectations deviennent fiables »* — et le `PLAN_EXECUTION` §3 le confie à l'agent API.

**Mesure sur l'installation déployée**, après **sept connexions réelles** d'identités AD
distinctes (`rssi.tls`, `contrib.tls`, `qualite.tls`, `direction`, `rssi.groupe`,
`admin.grc`, `indirect.tls`) :

```
$ psql -d cyber_grc  (périmètre déclaré, sinon la RLS masque tout — voir §5)
select count(*) from utilisateurs;   →  7
select count(*) from personnes;      →  0
select count(*) from audits;         →  1     ← témoin : les autres tables se remplissent
select count(*) from actions;        →  1
```

**Contre-épreuve sur base neuve**, montage identique à celui de
`test/auth/chaine-http.test.mjs` (serveur réel, annuaire simulé, vraie route de connexion) :

```
$ node --test scratchpad/sonde-annuaire.mjs
{"avant":0,"apresConnexion":0,"apresRequetes":0}
✖ après une connexion RÉELLE, la fiche `personnes` existe-t-elle ?
  AssertionError: personnes attendu 1, mesuré 0
```

**Le mécanisme — un défaut qui vit ENTRE deux fichiers dont aucun n'a tort seul, et c'est
le quatrième de la série.** Aucun des deux fichiers n'est fautif isolément :

| Fichier | Ce qu'il fait, et il a raison |
|---|---|
| `src/api/index.ts:687` | *« si la session vient d'être ouverte et porte une identité, aligner la fiche d'annuaire »* — étape 5 du crochet `onRequest` |
| `src/auth/greffon.ts` | `POST /api/connexion` est déclarée **`publique`** — elle ne peut pas exiger une session, puisqu'elle la crée |

Or le crochet **rend la main à l'étape 2** pour une route publique :

```ts
if (declaration.action === 'publique') return;   // src/api/index.ts:647
…
// ── 5. L'annuaire, à l'ouverture de session seulement ──
if (session.sessionOuverte === true && session.identite != null) {   // :687
  await alimenterAnnuaire(requete, session.perimetre, session.identite);
}
```

Et le **seul** producteur de `sessionOuverte: true` avec une `identite` non nulle est
`ServiceAuthentification.connecter()` (`src/auth/index.ts:388`), dont le résultat est servi
par cette route publique. `authentifier()` — toutes les autres requêtes — rend
`this.appliquer(resolveur, null, false)` : identité `null`, `sessionOuverte` faux
(`:409`). **L'étape 5 est donc structurellement inatteignable en production.**

**Pourquoi le banc ne le voit pas — et c'est la partie qui doit être retenue.**
`test/api/annuaire-ad.test.mjs` monte un authentificateur **fabriqué par l'essai**,
`SessionAvecIdentite`, qui rend `sessionOuverte: true` et une `identite` sur **n'importe
quelle** requête — donc sur une route ordinaire, non publique, où le crochet va jusqu'à
l'étape 5. Les quatre propriétés du fichier sont vertes, et **aucune n'est atteignable
par le produit**. C'est mot pour mot le défaut de **Q-66** (*« la morsure éprouvait le
consommateur contre un `niveaux` fabriqué par l'essai lui-même : elle ne pouvait pas voir
que rien ne le fabriquait en vrai »*) et la famille de **Q-86** (*un vert rendu sur une
branche inatteignable ne vaut rien*). Troisième occurrence en une vague.

**Ce qui n'est pas en cause** : rien n'est détruit, aucune donnée ne fuit, et la saisie
libre des noms continue de fonctionner — l'application reste utilisable. Ce qui est en
cause est qu'un livrable annoncé **ne fait rien**, en silence, et qu'un essai vert le
couvre.

### 🛑 Q-89 — Le droit d'export est contournable depuis l'interface : un profil `export=false` extrait la synthèse de posture en un clic

**Classe §0 bis : 2ᵉ — extraction non autorisée de données de gouvernance.**
**Propriétaire : agent A3** (`cyber-gouvernance_V4/js/modules/synthese.js`) ·
**échéance : avant la fin de la vague 3.** **Contrôle S7 en échec.**

Le `PLAN_SERVEUR` §3.3 est explicite : *« un utilisateur disposant d'un accès Groupe en
lecture peut extraire, en un clic, la cartographie complète des faiblesses du groupe dans
un seul fichier. L'export est donc une permission à part entière, accordée
explicitement, et journalisée systématiquement. »*

**Côté serveur, le droit est tenu** — mesuré :

```
GET /api/export   direction    (export=false) → 403
GET /api/export   qualite.tls  (export=false) → 403 « L'export des données est une autorisation distincte… »
GET /api/export   rssi.groupe  (export=true)  → 200, 988 octets
```

**Côté navigateur, il ne l'est pas.** Mesuré avec Chromium réel, contre l'installation
déployée, avec le compte AD réel `rssi.tls` — **RSSI de filiale, l'utilisateur principal
du produit** :

```
$ PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node s7-synthese.mjs rssi.tls '…'
rssi.tls droits = {"niveau":"validation","export":false,"ecritPilotage":true}
sdDownloadBtn : {"present":true,"desactive":false,"titre":"Télécharger un rapport HTML autonome"}
téléchargement obtenu : Synthese-Direction-2026-09-04.html
taille du fichier extrait : 38 213 octets
```

Contenu du fichier extrait, en clair :

```
Synthèse Direction — Posture Cyber · Périmètre : Vue globale (interne + tous donneurs
d'ordre) · Document confidentiel · Indice de posture : 3/100 (Critique) · Indicateurs
clés : maturité 0.0/5, conformité 0%, couverture dispositif 8% …
```

C'est très exactement l'objet que le §3.3 décrit. Aucun refus, aucun message, et **aucune
trace** : `journal_audit` ne porte aucun événement d'export (§1.15), et le journal
technique non plus, l'extraction étant entièrement fabriquée dans le navigateur.

**Contrôles symétriques**, qui montrent que le discriminant réel n'est pas le droit
d'export mais le droit d'**écriture** :

```
direction    (lecture, export=false)   → bouton DÉSACTIVÉ, titre « Votre profil est en
                                          lecture seule sur cet écran. »   ← pas le bon motif
rssi.tls     (validation, export=false)→ bouton ACTIF, téléchargement de 38 213 octets
rssi.groupe  (validation, export=true) → bouton ACTIF, téléchargement (légitime)
```

**Le mécanisme.** `js/core/session.js` annonce un entonnoir unique :

> *« Toutes les extractions du produit (fichier d'échange `grc-backup`, classeurs Excel,
> PDF d'audit, images de la matrice et de la cartographie, agenda `.ics`) passent par ce
> seul point : c'est ce qui rend le contrôle vérifiable d'un coup d'œil. »*

**La phrase est fausse.** Onze sites appellent `Droits.exigerExport()` ; le douzième,
`downloadReport()` dans `js/modules/synthese.js:917-947`, fabrique un `Blob`, pose
`a.download` et clique — **sans passer par l'entonnoir**. La seule barrière qui reste est
la parade de repli de `js/app.js`, deux expressions régulières écrites à la main :

```js
const MOTIFS_EXPORT = /(export|template|canevas|ics|xlsx|excel|pdf|csv|png|svg|telecharg)/i;
```

L'identifiant du bouton est `sdDownloadBtn`, sa classe `sd-btn-dl` : **aucun des deux ne
correspond**. Le bouton n'est donc pas traité comme un export, et il n'est neutralisé que
par la branche « lecture seule » — d'où la mesure ci-dessus.

**Portée sur les huit profils du socle.** Deux d'entre eux écrivent sur `pilotage` :

```
$ select p.code, d.niveau from profils p join profil_domaines d on d.profil_id = p.id
   where d.domaine in ('tableau_de_bord','synthese') and d.niveau in
         ('contribution','validation','administration');
 ADMIN | administration
 RSSI  | validation
```

Aucun des deux ne porte `GRC-EXPORT` par défaut. **Le RSSI de filiale et l'administrateur
de l'application contournent donc tous deux le droit d'export**, sur l'écran qui produit
précisément le document que le §3.3 nomme.

**Ce que le constat ne dit pas** : `exigerExport()` n'est pas la barrière ultime — le
fichier est composé de données déjà chargées, et `session.js` l'écrit honnêtement. Ce qui
est en cause est ce que le §3.3 vise nommément : *l'extraction en un clic, complète et
silencieuse, par quelqu'un qui n'y a pas droit.*

### 🟠 Q-90 — Le `README` §8 déclare **ouvertes** cinq propriétés que L3 a livrées, et le `README` §5 se contredit dans la même section

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent B4 / rôle DOC** ·
**échéance : avant l'ouverture de la vague 4.**

C'est le **8ᵉ signalement** de documentation périmée (famille Q-4), mais **inversé** : la
documentation ne retarde plus sur le code, elle **nie** ce que le code fait. Un exploitant
— ou le prochain auditeur, ou le RSSI groupe du client — qui lit la table « Dette
reportée » du `README` §8 conclura que L3 n'a livré ni droits par domaine, ni droit
d'export, ni limitation de rythme, ni écriture au journal.

| Ligne du `README` §8, « Dette reportée » | Mesuré |
|---|---|
| « `sessions`, `session_filiales`, `session_domaines` **écrivables sans condition** par le rôle applicatif … parade actuelle : requêtes paramétrées » | **faux** — E1 fermée par `007` : insertion refusée, `update`/`delete` à 0 ligne (§1.6). La même phrase vit dans `CONVENTIONS.md:800` et `:1243`, et dans `CLAUDE.md:702-705` — **quatre documents propagent la phrase périmée**, dont celui qui fait foi |
| « **Aucun contrôle de droits par domaine, aucun droit d'export distinct** … il n'existe pas encore de modèle de droits » | **faux** — §1.13 ; `src/droits/**` livré, `GRC-EXPORT` distinct, 23 groupes `groupes_ad` |
| « **Aucune limitation de rythme** — elle appartient à la couche d'authentification, **qui n'existe pas** » | **faux** — §1.10, verrou par compte et par adresse mesurés |
| « **Aucune écriture au journal d'audit** par l'API » | **faux** — 125 entrées mesurées (§1.15) |
| « un garde-fou exige … au moins **32 caractères** d'aléa » | **faux** — `select prosrc from pg_proc where proname='f_verifier_entropie_identifiants'` → `v_plancher constant numeric := 52` (bits). Le §5 du **même** `README` le dit déjà juste |

Et cinq chiffres faux, dont trois **contredits par le même fichier** :

| Où | Annoncé | Mesuré |
|---|---|---|
| `README.md:330` et `:1137` | « **Huit** contrôles découverts », les 8 nommés, `f_verifier_substrat_session` absent | **9** (`select * from controles_schema` → 9 lignes). `README.md:821` dit « 9 contrôles consignés » |
| `README.md:1086` | « 48 tables en **6 migrations** », énumération 001→006 | **7** (`ls db/migrations/*.sql`, `select count(*) from migrations_schema`) |
| `README.md:548` | « **Six familles d'essais** », tableau totalisant **637**, relevé à `ca73ac6` | **onze familles, 1028** (§1.1) — et `README.md:505`, quarante lignes plus haut, écrit déjà « 1028 essais, onze familles » |
| `README.md:854` | « 637, 651, **969** ici » | **1028** — résidu de Q-87 |
| `README.md:224` | « **Neuf** routes de données, plus le point de santé. Le frontend n'en connaît pas d'autres » | **+2** : `GET /api/export` et `POST`/`DELETE /api/connexion`. Les deux ajouts les plus sensibles de L3 sont absents du tableau des routes |

`backend/db/verifier_cloisonnement.sql:51` et `:1999` parlent des « **47 tables** » ;
`select count(*) … relkind='r'` rend **48**. Ce fichier n'est pas une migration gelée : il
est modifiable, et c'est celui qu'un auditeur joue devant témoin.

Résidus de **Q-77** (« reste ouvert : deux entêtes citent Apache 2.4.58 ») : les deux
entêtes nommés sont toujours là, **et le registre en ignorait cinq autres** —
`deploy/apache/cyber-grc.conf:79, 117, 213, 524, 532` — plus `README.md:1372` et `:1384`,
qui présentent 2.4.58 comme l'Apache installé. La machine porte **2.4.68**.

### 🟠 Q-91 — Trois réglages documentés que personne ne lit — le constat m-2, deuxième et troisième récidives

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : orchestrateur** (`.env.example` lui est réservé)
· **échéance : avant l'ouverture de la vague 4.**

Le constat m-2 de la porte S2 disait : *une variable documentée et sans effet est pire
qu'absente — un exploitant la renseigne et croit avoir choisi.* Trois nouvelles :

```
$ grep -rn "API_RYTHME" backend/src backend/deploy backend/.env.example
backend/.env.example:257:API_RYTHME_MAX_ANONYME=20
backend/.env.example:258:API_RYTHME_FENETRE=15
        ← deux déclarations, AUCUNE lecture
$ grep -rn "AUTH_REVERIFICATION_AD" backend/src backend/.env.example backend/deploy
backend/.env.example:268:AUTH_REVERIFICATION_AD=5
backend/src/auth/index.ts:150: * `AUTH_REVERIFICATION_AD` lui est **demandée dans le rapport**…
        ← une déclaration, une mention en commentaire, AUCUNE lecture
```

Le limiteur anonyme est en réalité câblé sur les réglages de la connexion :

```ts
const limiteur = new LimiteurRythme({
  budget: Math.max(8, config.auth.maxTentatives * 4),
  fenetreMs: config.auth.dureeVerrouillageMinutes * 60_000, …
```

Conséquences concrètes : poser `API_RYTHME_MAX_ANONYME=100` n'a **aucun effet** ;
durcir `AUTH_MAX_TENTATIVES` resserre **en silence** le limiteur anonyme — le couplage
que les deux commentaires disent précisément avoir rompu. Et
`AUTH_REVERIFICATION_AD` — présenté dans `.env.example` comme *« la durée pendant
laquelle un compte révoqué continue de travailler »*, c'est-à-dire la propriété que le
`PLAN_SERVEUR` §1.5 exige — est **figée à 5 minutes** :
`REVALIDATION_PAR_DEFAUT_MS = 5 * 60_000`, surchargeable seulement par un paramètre que
le banc passe et que `src/serveur.ts` ne passe pas.

### 🟠 Q-92 — Le filet navigateur des droits n'exerce jamais la combinaison qui a laissé passer Q-89

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent B3** (`test/navigateur/**`) ·
**échéance : avec le correctif de Q-89, et pas après.**

`test/navigateur/droits.test.mjs` éprouve **deux** profils, présentés comme « les deux
bornes du modèle » :

```js
const DIRECTION = { niveau: 'lecture',      …, export: false };
const RSSI      = { niveau: 'contribution', …, export: true  };
```

**La combinaison (écriture autorisée, export refusé) n'est exercée par aucun essai** —
alors que c'est celle de **six des huit profils du socle**, `rssi.tls` compris. Et l'essai
d'export ne vise qu'**un** site d'extraction, `BackupService.exportPlain()`, qui est
précisément l'un des onze déjà couverts par l'entonnoir. Un essai qui choisit le site où
la barrière existe ne peut pas trouver celui où elle manque.

Ce que le correctif doit rendre impossible n'est pas « ce bouton-ci » : c'est qu'un
**douzième** site d'extraction apparaisse sans entonnoir. Une expression régulière sur
des identifiants de boutons est une liste écrite à la main au sens du `CLAUDE.md` §3, et
son incomplétude **réussit en silence** — c'est la ligne du tableau qui dit « ❌ la liste
est le mauvais outil ».

### 🔵 Q-93 — `CLAUDE.md` §5 et §8 et `PLAN_EXECUTION` §6 décrivent une machine qui n'existe plus

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : rôle DOC** ·
**échéance : avant l'ouverture de la vague 4.**

| Où | Écrit | Mesuré |
|---|---|---|
| `CLAUDE.md:249`, `PLAN_EXECUTION:642` | `pg_ctlcluster **16** main start` | cluster **17** (`pg_lsclusters`) — la commande documentée échoue telle quelle |
| `PLAN_EXECUTION:655` | « la machine de développement porte **PostgreSQL 16** » | **17.11** |
| `PLAN_EXECUTION:657` | « Il n'y a **ni Active Directory, ni ClamAV, ni relais SMTP** » | AD Samba **actif** (LDAPS 127.0.0.1:1636), ClamAV **actif**. Seul le SMTP reste vrai |
| `CLAUDE.md:258` | Playwright à `/opt/node22/lib/node_modules/playwright` | `/usr/lib/node_modules/playwright` — chemin mort de **Q-80**, corrigé dans le `README` §5 par Q-87, **laissé ici** |
| `CLAUDE.md:770` | « **ni Playwright ni Chromium ne sont installés** … le banc n'en joue ici qu'une partie » | tous deux installés ; `navigateur` 74/74 et `modules` 33/33 joués |
| `CLAUDE.md:717` | « les groupes `GRC-*` **n'existent pas encore** » | **23** (`select count(*) from groupes_ad`) — et `CLAUDE.md:754` dit lui-même « 23 groupes `GRC-*` » |

### 🔵 Q-94 — Six symboles cités en commentaire n'existent plus, dont la table des matières du déprovisionnement

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agents A1/A2 pour `src/`, orchestrateur pour
`deploy/`** · **échéance : avant l'ouverture de la vague 4.**

C'est le motif que ce chantier traque depuis dix occurrences : *la justification que
personne ne relit quand l'appelant disparaît.*

| Où | Ce qui est écrit | Ce qui est vrai |
|---|---|---|
| `src/auth/sessions.ts:30` et `:33` | « `revoquerToutesDe()` … `verifier()` — à chaque requête » | `revoquerToutesDe` **n'existe nulle part** ; les vrais noms sont `revoquerSessionsDe()` et `verifierSession()`. ⚠️ `verifier()` **paraît exister** — trois homonymes ailleurs —, donc un balayage « ce symbole existe-t-il quelque part ? » le laisse passer. C'est la **seule table des matières** du mécanisme que le `PLAN_SERVEUR` §1.5 exige |
| `deploy/groupes-ad.sh:141` | « `install.sh` **ne lit jamais** `LDAP_PREFIXE_GROUPES` … **rien ne peut diverger en silence** » | `install.sh:1271` la lit. Trois défauts `GRC-` écrits séparément (`config/index.ts:595`, `install.sh:1271`, `groupes-ad.sh:155`) : la propriété affirmée ne tient plus |
| `src/entites/index.ts:4836` | `f_generer_id()` « n'est la valeur par défaut que de `journal_audit.id` : **une table que ce lot n'écrit jamais** » | la table porte **125 entrées**, écrites par `src/auth/journal.ts`. La conclusion que la phrase soutient — *le durcissement SQL reste inerte* — ne tient plus |
| `src/entites/index.ts:1508` et `:2123` | renvoi au « **§8.7** de ce fichier » | le fichier numérote §1→§11 **sans sous-section**. Recopié depuis dans `RAPPORT_S2.md` et `RAPPORT_S2_BIS.md` |
| `src/erreurs/index.ts:18` | « `RAPPORT_S1` §O-2 et **§934** » | `grep -c 934 RAPPORT_S1.md` → **0** |
| `src/droits/index.ts:4` | « **Quatre fichiers**, et la frontière entre eux » | le tableau qui suit en liste **cinq**, le répertoire en porte **six** |

### 🔵 Q-95 — Aucun essai ne monte la chaîne HTTP complète en **production** contre LDAPS

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A4 / rôle OUTILLAGE** ·
**échéance : avant la mise en service pilote.**

`monterServeurReel` vaut `developpement` par défaut, et **aucun appelant** ne demande la
production avec un annuaire :

```
$ grep -rn "environnement: 'production'" test/
test/api/routes.test.mjs:997            (fail-closed, sans annuaire)
test/auth/secours-sans-annuaire.test.mjs:209, :308   (compte de secours, sans annuaire)
```

La doublure **sait** faire du LDAPS (`demarrerAnnuaire({ tls: true })`) et deux essais
l'exercent — mais **au niveau du client**, jamais derrière le serveur HTTP. La seule
chaîne HTTP jouée en production est donc celle du **compte de secours**. C'est
structurellement pourquoi **Q-84** (`/api/session` à 503 après une connexion réussie) a pu
sortir : son symptôme n'apparaît qu'en production, et le seul essai qui l'y rejoue passe
par le secours. L'essai qui le ferme aujourd'hui mord bien — mais par la propriété
« à l'octet près », pas par le symptôme mesuré le 03/09 (vérifié par mutation, §4).

### 🔵 Q-96 — Un mot de passe juste sans accès se distingue d'un mot de passe faux

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A1** · **échéance : avant la mise en
service pilote.**

```
sans.groupe / Sans-Groupe-2026!   (identifiants VALIDES, aucun groupe)  → 403 droit_insuffisant
sans.groupe / mot de passe faux                                          → 401 non_authentifie
```

Une pulvérisation de mots de passe apprend donc, au code de retour, **quand elle a
trouvé le bon** — même sur un compte sans accès à l'application. Le
`CONVENTIONS.md` §26.2 arbitre les deux codes et l'arbitrage se défend (un utilisateur
légitime doit savoir qu'il lui manque un groupe, pas croire son mot de passe faux) ;
mais le §26.2 écrit aussi que ces refus ne doivent nommer *« ni le domaine attendu, ni le
niveau requis, ni l'existence du compte »*. Le constat n'est pas que l'arbitrage soit
mauvais : c'est qu'il n'est **écrit nulle part comme un oracle assumé**. Verrou par compte
et par adresse (§1.10) en bornent l'exploitation.

### 🔵 Q-97 — La table de suivi de revalidation n'est pas bornée

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A1** · **échéance : avant la mise en
service pilote.**

`src/auth/index.ts:207` : `private readonly derniereRevalidation = new Map<string, number>()`.
Une entrée y est **posée** à chaque revalidation (`:498`) et **retirée** seulement à la
déconnexion (`:434`) et au déprovisionnement (`:546`). Une session qui expire sans
déconnexion laisse son entrée. Aucune éviction, aucun plafond — alors que les deux autres
registres en mémoire du produit en ont un (`ENTREES_MAX = 20 000` dans `tentatives.ts`,
`adressesMax` dans `limiteur.ts`), *et pour la raison exacte que le contrôle S13 nomme* :
« un registre indexé sans plafond est lui-même un déni de service ». Croissance lente
(une entrée par session, quelques dizaines d'octets) : c'est un mineur, pas un risque.

### 🔵 Q-98 — Une connexion réussie efface le compteur d'adresse, qui est la parade anti-pulvérisation

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A1** · **échéance : `V1.1`.**

Mesuré, et c'est **l'erreur de méthode qui m'a coûté une demi-heure** (§5) : 22 échecs
consécutifs depuis une adresse n'ont pas déclenché la barrière parce qu'un succès s'était
glissé au milieu. `LimiteurTentatives.succes()` supprime le compteur **d'adresse** autant
que celui d'identifiant. Un adversaire qui détient **un** compte valide peut donc remettre
le compteur d'adresse à zéro entre deux salves, et pulvériser indéfiniment. Le
comportement est documenté (« il s'efface au succès, pour l'identifiant comme pour
l'adresse ») ; ce qui manque est de dire ce qu'il coûte. Le verrou **par compte**, lui,
n'est pas contournable ainsi.

### 🔵 Q-99 — `ident()` n'a aucun essai, et un nom de colonne s'interpole sans elle

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A2** · **échéance : `V1.1`.**

`ident()` (`src/entites/index.ts:386`) est la liste blanche qui porte **les 16 énoncés SQL
interpolés du produit**. Elle est correcte — elle lève sur tout ce qui n'est pas
`^[a-z_][a-z0-9_]{0,62}$` — et **aucun essai ne la casse pour voir si le banc rougit**
(`grep -rn "ident(" test/ | grep -iE "refus|throw|rejects|liste blanche|injection"` → vide).
Par ailleurs `src/entites/index.ts:1859` interpole un nom de colonne **sans** passer par
elle :

```ts
const colonnes = Object.keys(aEcrire);
const affectations = colonnes.map((c, i) => `"${c}" = $${String(i + 2)}`);
```

Sûr aujourd'hui — les six clés sont des littéraux du fichier — et c'est exactement le cas
que la redondance d'`ident()` existe pour attraper : le type `Record<string, string|null>`
n'interdit pas qu'une boucle future y verse une clé externe.

### 🔵 Q-100 — Le banc et le produit ne nomment pas le même rôle de lecture

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent A4** · **échéance : `V1.1`.**

`test/aide/base.mjs:132` lit `ESSAI_UTILISATEUR_LECTURE` / `ESSAI_MOT_DE_PASSE_LECTURE` ;
le **même rôle** s'appelle `BASE_UTILISATEUR_LECTURE` / `BASE_MOT_DE_PASSE_LECTURE` dans
`.env.example:109-110`, `install.sh:762,911` et `groupes-ad.sh:166-167` — les deux autres
rôles partageant leur nom entre banc et produit **dans la même table**. Sur une machine où
`install.sh` a engendré les secrets, poser le vrai mot de passe n'atteint pas le banc, qui
retombe sur `'dev'`. C'est le motif de **Q-81**, résolu là et laissé ici.

### 🔵 Q-101 — Le pré-vol d'`install.sh` est moins exigeant que la configuration du serveur

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent B2 / rôle DÉPLOIEMENT** ·
**échéance : avant la mise en service pilote.**

Trois configurations passent le pré-vol de l'installateur et **empêchent le service de
démarrer** — l'échec survient 1 500 lignes plus loin, sur `curl /api/sante`, **sans nommer
la variable** : `SMTP_ACTIF=oui` avec le seul `SMTP_HOTE` ; `AUTH_LDAP_ACTIF=non` sans
empreinte de secours (le contrôle est dans une branche `else` jamais atteinte) ;
`AUTH_LDAP_ACTIF=false`, que `config` accepte et qu'`install.sh:809` compare littéralement
à `"non"`. C'est la même famille que **Q-75** : *un contrôle qui n'a pas pu être joué ne
doit pas ressembler à un contrôle réussi.*

### 🔵 Q-102 — La réserve `LoadCredential=` du fichier systemd n'a ni propriétaire ni échéance

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : rôle DÉPLOIEMENT** · **échéance : avant la mise
en service pilote.**

`deploy/systemd/cyber-grc.service:46-49` écrit lui-même : *« les secrets se retrouvent dans
l'environnement du processus, donc dans `/proc/<pid>/environ` … Le passage à
`LoadCredential=` supprimerait cette exposition. »* Réserve juste, honnête, et **jamais
attribuée**. Le `CLAUDE.md` §8 dit ce qu'il faut en penser : *une réserve écrite n'est pas
une réserve traitée* ; six passages ont reconduit « Apache n'est pas éprouvé » pendant que
l'installer prenait une minute.

### 🟠 Q-103 — Le correctif de Q-89 est commité mais **pas déployé** : l'installation qui tourne fuit toujours

**Classe §0 bis : 2ᵉ — l'extraction non autorisée est encore possible sur la machine en
service.** **Propriétaire : rôle DÉPLOIEMENT** · **échéance : immédiate.**

Le correctif de **Q-89** vit dans le dépôt à `294c0eb`. La racine web servie par Apache,
elle, porte encore l'ancien fichier. Mesuré en comparant l'octet :

```
$ curl -sS https://grc.exemple.interne/js/modules/synthese.js -o servi.js
servi (DocumentRoot /opt/cyber-grc/frontend) : 73 200 octets · md5 e99d438ec582
dépôt (cyber-gouvernance_V4/…)               : 74 250 octets · md5 a77c92b3c3cd
occurrences d'« exigerExport » — servi : 0 · dépôt : 2
```

Conséquence, mesurée au Chromium contre l'installation telle qu'elle sert **en ce moment** :

```
compte rssi.tls (export:false), fichier SERVI  → TÉLÉCHARGEMENT Synthese-Direction-2026-09-04.html
compte rssi.tls (export:false), fichier DÉPÔT  → aucun téléchargement, refus affiché
```

Le service Node a été redéployé et redémarré (§9) ; **le frontend ne l'a pas été**. Ce n'est
pas un défaut du correctif — c'est la moitié de la livraison qui manque, et elle est
invisible depuis le dépôt : `npm test` est vert à 1030/1030 pendant que la machine en
service reste ouverte. C'est la forme du défaut que la grille appelle **S17** — *le chemin
que l'utilisateur emprunte, pas celui qui est commode à tester*.

### 🔵 Q-104 — La garde « Périmètre non positionné » ne s'exerce pas sur cinq tables vides

**Classe : 3ᵉ → `V1.1`.** **Propriétaire : agent SCHEMA** · **échéance : `V1.1`.**

Cinq tables portent une politique de lecture **conditionnelle** — `CASE WHEN filiale_id IS
NULL THEN true ELSE (filiale_id = ANY f_filiales_lecture()) END` — parce que leur
`filiale_id` est nullable (socle Groupe) :

```
$ select c.relname from pg_policy p join pg_class c on c.oid = p.polrelid
   where polcmd = 'r' and pg_get_expr(polqual, polrelid) like '%CASE%';
document_referentiels · documents · mesure_catalogue · parametres · personnes
```

PostgreSQL ne peut pas hisser un appel qui dépend de la ligne : sur une table **vide**,
`f_filiales_lecture()` n'est jamais évaluée, et une lecture **sans périmètre déclaré** rend
`0` **sans erreur** — là où les 43 autres tables lèvent « Périmètre non positionné » même à
vide. Mesuré, avec le contrôle symétrique :

```
sans périmètre : documents (0 ligne) -> 0        traitements (0 ligne) -> ERROR
                 parametres (0 ligne) -> 0        incidents   (0 ligne) -> ERROR
                 personnes  (4 lignes) -> ERROR   clients     (0 ligne) -> ERROR
```

**Rien ne fuit** : s'il n'y a pas de ligne, il n'y a rien à voir, et dès qu'une ligne existe
la garde s'exerce. Ce qui est en cause est la **famille du défaut** : une lecture qui
*réussit en silence* alors qu'aucun contrôle ne s'est exercé — la ligne « ❌ la liste est le
mauvais outil » du `CLAUDE.md` §3, appliquée ici à une garde plutôt qu'à une liste. La
conséquence pratique est méthodologique et elle m'a mordu : **un `0` lu ainsi ne distingue
pas *vide* de *non contrôlé***, et un exploitant — ou un auditeur — qui s'y fie conclut
faux. Le remède n'est pas de changer la politique (le `CASE` est juste) mais de le **dire**,
et d'éprouver la garde table par table plutôt qu'une fois pour toutes.

### Les deux constats que la vague devait fermer et n'a pas fermés

| # | État mesuré | Ce que je propose |
|---|---|---|
| **Q-86** — la doublure d'annuaire ne peut pas atteindre la branche « renvoi écarté » | **toujours ouvert.** `test/annuaire/serveur-ldap.mjs:485` : `namingContexts: [BASE_RECHERCHE]` — **un seul** contexte, égal à la base interrogée. `renvoiHorsPerimetre()` ne peut donc rien y écarter, et les trois essais « renvoi » d'`annuaire.test.mjs` restent verts **sans pouvoir atteindre** la branche. L'échéance était « **avant la porte S3** » | maintenu, échéance **reportée par écrit** à la vague 4, propriétaire **agent A4**. Le correctif de Q-83 est bien mordu par ailleurs, grâce au répondeur que B1 a dû écrire lui-même (§4) |
| **Q-87** — le garde-fou des chiffres ne joue pas le banc | **toujours ouvert.** `test/documentation/chiffres-du-banc.test.mjs` confronte le `README` à **lui-même** et aux versions de la machine ; il ne mesure pas le total réel. L'échéance était « **avant la porte S3** ». Conséquence directe et mesurée : les cinq chiffres faux de **Q-90** sont tous passés dessous, dont deux contradictions **internes au même fichier** | maintenu, propriétaire **agent OUTILLAGE**, échéance **avant l'ouverture de la vague 4** — c'est le garde-fou qui empêche Q-90 de revenir une neuvième fois |

### Constats du registre que ma mesure permet de fermer

| # | Mesure | Proposition |
|---|---|---|
| **Q-10** (E4) | 25 Mio anonymes → **401 en ≈93 ms** de médiane, contre 291 ms à S2 (§1.8) | **fermé** |
| **Q-44** | 40 Mio en `Content-Length` sur `/api/reprise` → **413 en 13 ms**, contrôle symétrique sur `/index.html` identique (§1.9) | **fermé** |
| **Q-51**, **Q-58** | `Transfer-Encoding: chunked` → **411 en 13 ms, `size_upload` = 0** ; et la moitié « restée non mesurée » l'est désormais : sous la borne, le corps est relayé et le service refuse sans l'analyser | **fermés** |

---

## 4. Rejeu par mutation des dix-sept constats fermés dans la nuit du 03 au 04/09

*Un correctif accepté n'est pas un correctif sûr. La seule preuve qui vaille est la
mutation : casser le correctif, vérifier que le banc rougit, restaurer.* Protocole :
sauvegarde du fichier hors dépôt, mutation, `npm run build`, exécution ciblée,
restauration, `git status` vide.

| Constat | Mutation appliquée | Verdict du banc | Conclusion |
|---|---|---|---|
| **Q-66** 🛑 | `projeterDroits()` cesse d'émettre `niveaux` (état d'avant le correctif) | **12 rouges** sur 232, dont « CRITÈRE DU LOT : dans la MÊME session, audits accepté, conformité refusée », « et RIEN n'a été écrit », « `niveaux[d]` ne dépasse JAMAIS `niveau` » | ✅ **mord**, et sur le producteur, pas seulement sur le consommateur |
| **Q-70** | `perimetreDe()` reconstruit le périmètre champ par champ et **recalcule** la conjonction | **2 rouges** : « MÉCANIQUE : la conjonction n'est écrite qu'à UN endroit dans `src/` » et l'identité de référence (`Values have same structure but are not reference-equal`) | ✅ **mord** — et confirme la note du registre : **aucune** assertion de valeur ne rougit, les deux calculs étant d'accord |
| **Q-72** 🛑 | la garde de `src/serveur.ts` ignore à nouveau le compte de secours | **2 rouges** : « la garde de montage : `construireServeur` monte bien POST /api/connexion » et « le refus est aussi identique VU DU RÉSEAU » | ✅ **mord** |
| **Q-79** | l'identifiant inconnu redevient **503** quand l'annuaire est désactivé | **5 rouges** sur 9, dont « les six sondes rendent le MÊME refus, à l'octet près » et « les deux chemins comptent PAREIL au rythme » | ✅ **mord** |
| **Q-83** 🛑 | (a) `renvoiHorsPerimetre()` n'écarte **rien** ; (b) écarte **tout** | (a) **4 rouges** dont « les renvois écartés sont NOMMÉS » ; (b) **5 rouges** | ✅ **mord dans les deux sens** |
| **Q-84** 🛑 | `/api/session` re-teste le **type** du résolveur | **1 rouge** : « `POST /api/connexion` rend EXACTEMENT la charge de `GET /api/session` » | ✅ mord — **mais pas par le symptôme mesuré** : « `GET /api/session` rend 200, et non 503 » reste **vert**, l'essai tournant en `developpement`. Voir **Q-95** |
| **Q-85** | la session cesse de porter la filiale nommée | **2 rouges** : « le code et la raison sociale sont là », « une raison sociale corrigée en base est relue » | ✅ **mord** ; et confirmé au navigateur sur l'installation réelle (§1.3) |
| **Q-16** | un identifiant **capturé en fermeture** dans `js/modules/risques.js` | **1 rouge sur 33** : « `/risques` — RisquesModule », et rien d'autre | ✅ **mord, et vise juste** |
| **Q-60** | un `<script src="js/non-commite-secu.js">` publié mais non commité dans `index.html` | **1 rouge**, qui **nomme le site** : « `cyber-gouvernance_V4/index.html:141` déclare « ./js/non-commite-secu.js », qui n'est pas suivi » | ✅ **mord** |
| **Q-64** | *(pas de mutation — c'est une propriété de stabilité)* | `bascule.test.mjs` joué **5 fois de suite** : `44/44` à chaque fois, verdict identique | ✅ **tenu** |
| **Q-53**, **Q-77** | — | garde-fou `test/documentation/` : **17/17**. Il tient la **forme** et les versions d'outils, et **ne peut pas** voir les cinq chiffres faux de Q-90 — c'est **Q-87**, resté ouvert | ◐ **tenu, mais sa portée est plus étroite que ce que le registre laisse croire** |
| **Q-58**, **Q-61**, **Q-62**, **Q-75**, **Q-76** | — | `test/deploiement/` **65/65** ; mécanisme `reserve()`/`bilan`/`exit 3` d'`install.sh` lu et présent ; `survivantes()` remplace bien `decisives()` | ◐ **tenus** ; non mordus par moi (l'installateur exige `root`, §6) |
| **Q-78** | — | mesuré autrement : `select count(*) from groupes_ad` → **23** sur l'installation réelle, et les huit comptes AD résolvent leurs droits | ✅ **tenu** |

**Aucun des dix-sept ne s'est révélé faux.** C'est la première fois, sur ce chantier, qu'un
passage de porte ne trouve pas un correctif accepté qui avait échangé un défaut contre un
autre. La contrepartie est que les deux constats neufs de la classe dure — **Q-88** et
**Q-89** — ne sont **pas** des régressions de correctifs : ce sont des trous que
**personne n'avait cherchés**, l'un parce que son essai était vert sur une branche
inatteignable, l'autre parce que l'essai visait le site où la barrière existe.

---

## 5. Ce que j'ai cru et qui était faux

**Ne pas élaguer cette section.** C'est la plus dense en information du rapport.

**1. J'ai cru mesurer une révocation de session ; je ne mesurais rien.** Pour éprouver
« une session expirée pendant une saisie ne détruit pas la saisie », j'ai révoqué la
session **en base** avec `psql` comme `grc_proprietaire` :

```
update sessions set revoquee_le = now() where revoquee_le is null and utilisateur_id = …
```

puis j'ai cliqué « Enregistrer » au navigateur, et j'ai observé : **201 Created**, aucun
voile, aucun message. J'ai failli écrire que le traitement du 401 ne se déclenchait pas.
La vérité est que **mon `update` n'avait touché aucune ligne** : la migration `007` adosse
l'écriture du substrat à `grc.authentification`, et `force row level security` vaut
**aussi pour le propriétaire**. Le refus est **silencieux** — 0 ligne, pas d'erreur —,
c'est-à-dire exactement ce que l'entête de `src/auth/sessions.ts` prend la peine
d'expliquer et que j'avais lu une heure plus tôt. En repassant le réglage :

```
sessions révoquées en base : 18
→ 401 POST /api/entites/risques · voile PRÉSENT · « 1 modification(s) non enregistrée(s) »
```

La leçon n'est pas « j'ai oublié un réglage » : c'est que **le garde-fou d'E1 est assez
efficace pour tromper l'auditeur qui l'éprouve**, et que toute mesure faite en base sur ce
substrat doit compter ses lignes avant de conclure.

**2. J'ai conclu trop vite que la barrière anti-pulvérisation ne fonctionnait pas.** 22
échecs consécutifs depuis une même adresse, puis un compte valide → **200**. J'ai d'abord
cru à un défaut. En relisant `LimiteurTentatives.succes()`, j'ai vu que **toute connexion
réussie efface le compteur d'adresse** — et j'en avais glissé une au milieu de ma série,
pour vérifier autre chose. Rejoué proprement, 25 échecs **sans aucun succès intercalé** :
la barrière tombe. Deux enseignements : la mesure était fausse, **et** le motif de son
échec est un vrai constat (**Q-98**).

**3. J'ai cru que l'essai de Q-84 rejouait le symptôme du 03/09 ; il n'en rejoue qu'une
conséquence.** Sous ma mutation, « `GET /api/session` rend 200, et non 503 » est resté
**vert**. J'ai d'abord soupçonné un essai décoratif. En fait `monterServeurReel` vaut
`developpement` par défaut, et la session provisoire y **résout** au lieu d'échouer : le
503 ne peut pas apparaître. L'essai mord tout de même, par le contrat « à l'octet près » —
mais par une autre propriété que celle qui a été mesurée. C'est **Q-95**, et je ne l'aurais
pas trouvé sans la mutation.

**4. J'ai écrit une sonde de production qui ne pouvait pas démarrer, et j'ai attribué son
échec à ma mutation.** Ma sonde montait la chaîne réelle en `production` contre la
doublure d'annuaire ; elle a échoué **après restauration** aussi. Cause :

```
ErreurConfiguration: LDAP_URL : liaison en clair refusée en production — l'annuaire est
interrogé en LDAPS (§1.5). · LDAP_VERIFIER_CERTIFICAT : la vérification du certificat du
contrôleur de domaine ne peut pas être désactivée en production.
```

C'est-à-dire **une barrière du produit qui fonctionne**, et que je prenais pour mon
propre défaut. Elle explique aussi pourquoi aucun essai ne monte cette chaîne-là (Q-95).

**5. J'ai cru que `personnes` était vide parce que la RLS me le cachait.** Avant de
conclure sur **Q-88**, j'ai vérifié que ma lecture n'était pas elle-même masquée — c'est le
piège symétrique du point 1. Contrôle : la même transaction, avec le périmètre déclaré,
rend `audits = 1` et `actions = 1` (des lignes que je venais de créer par l'API) et
`personnes = 0`. Le zéro est donc un zéro, pas un aveuglement. **Sans ce contrôle, le
constat le plus important de ce rapport aurait pu être un artefact de mesure.**

**6. J'ai cru que `X-Forwarded-For` était correctement neutralisé sur la foi d'un test
depuis `127.0.0.1`.** L'en-tête forgé n'apparaissait pas au journal — mais l'adresse
réelle **était aussi** `127.0.0.1`, si bien que le résultat était le même que le vhost
efface l'en-tête ou qu'il ne le pose jamais. J'ai refait la mesure depuis trois adresses
sources distinctes : `10.99.0.1` ressort bien comme `10.99.0.1`. **Un contrôle où les deux
hypothèses rendent la même valeur ne contrôle rien** — c'est la forme du défaut que
`install.sh` avait au 8ᵉ passage de S2.

**7. J'ai cru que le compte d'appels SQL était de 23, parce que `grep -rn "\.query("`
en rend 23.** Le motif rate tous les appels génériques `client.query<{…}>(…)` — le
chevron casse la parenthèse. Le compte réel est **61 appels directs**, plus 17
constructions indirectes : **76 énoncés**. Une sous-estimation de 62 % sur le contrôle
S5, obtenue avec la commande la plus naturelle qui soit.

**9. J'ai cru servir au navigateur le fichier corrigé ; je servais le fichier périmé, et
j'ai failli déclarer le correctif Q-89 inopérant.** Pour juger le correctif du coordinateur
avec mon propre instrument, j'ai intercepté `js/modules/synthese.js` dans Chromium pour lui
substituer la version du dépôt. Résultat : `rssi.tls` (`export:false`) **téléchargeait
toujours**. J'ai été à un cheveu d'écrire « le correctif ne tient pas ». Ce qui manquait
était un compteur : en instrumentant l'interception, `interceptions: 1` — alors que le
fichier est demandé une fois au chargement **et** une fois par ma vérification finale. La
cause :

```
requête réelle : https://grc.exemple.interne/js/modules/synthese.js?v=0.1.0.896eb449576b
mon motif      : **/js/modules/synthese.js         → ne correspond PAS (chaîne de requête)
```

Le vhost ajoute une empreinte de version aux ressources ; mon glob ne la prévoyait pas, si
bien que **le chargement initial passait par Apache** et que je mesurais le fichier déployé.
Une route de contexte sur l'expression régulière `/synthese\.js/` a corrigé le tir, et le
verdict s'est inversé. **C'est la forme exacte du défaut que ce chantier traque** — *un
contrôle qui mesure autre chose que ce qu'il annonce* — et je l'ai commis en le cherchant
chez les autres.

**10. J'ai cru que le refus d'export était silencieux ; c'était mon horloge.** Une fois
l'interception juste, le téléchargement ne se produisait plus — mais aucun message
n'apparaissait à l'écran. Cause : j'attendais l'événement de téléchargement pendant
**6 secondes** avant de relever la notification, et celle-ci vit trois à quatre secondes. En
ramenant l'attente à 1,2 s, le message est là : *« L'extraction de données n'est pas
autorisée pour votre profil. Le droit d'export est accordé séparément de la lecture. »* Un
bouton qui ne fait rien et un bouton qui refuse en le disant ne sont pas la même chose, et
ma mesure ne les séparait pas.

**11. J'ai lu `personnes = 0` sans erreur là où toute autre table cloisonnée aurait levé —
et je n'ai pas su pourquoi sur le moment.** Le coordinateur m'a signalé que la garde de
périmètre est évaluée *par ligne*. Mesuré, c'est plus précis que cela, et la nuance compte :

```
sans périmètre déclaré, comme propriétaire :
  traitements  (0 ligne)  -> ERROR : Périmètre non positionné
  incidents    (0 ligne)  -> ERROR
  clients      (0 ligne)  -> ERROR
  documents    (0 ligne)  -> 0        ← aucune erreur
  parametres   (0 ligne)  -> 0
  personnes    (4 lignes) -> ERROR
```

Ce n'est donc pas « la garde est par ligne » en général : c'est que **cinq tables** portent
une politique de lecture *conditionnelle* — `CASE WHEN filiale_id IS NULL THEN true ELSE
… f_filiales_lecture() END` — que PostgreSQL ne peut pas hisser hors du parcours. Sur une
table vide, l'expression n'est jamais évaluée, la garde ne s'exerce pas, et la requête rend
`0` **en silence**. Sur les autres, l'appel est hissé et lève même sans ligne. Ma conclusion
sur Q-88 tenait quand même — j'avais relu avec le périmètre déclaré, et les tables témoins
rendaient des valeurs non nulles —, mais **le premier `0` que j'ai lu ne prouvait rien**, et
je l'ignorais. C'est devenu le constat **Q-104**.

**8. J'ai cru pouvoir mesurer TLS 1.0 avec `openssl s_client -tls1`.** Le brief prévenait,
et il avait raison : sans `-cipher 'ALL:@SECLEVEL=0'`, OpenSSL 3.5 refuse de **proposer**
ces versions, et l'on mesure son propre client. Avec l'option, l'alerte `protocol version
(70)` vient bien du **serveur**.

---

## 6. Ce que je n'ai pas pu vérifier

En distinguant *impossible ici* de *non tenté* — et en gardant à l'esprit que **six
passages ont consigné « Apache n'est pas éprouvé » pendant que l'installer prenait une
minute**.

### Impossible sur cette machine, avec les droits dont je dispose

| Sujet | Pourquoi | Ce que je demande |
|---|---|---|
| ~~Le journal technique du service~~ | ✅ **RÉSERVE LEVÉE.** L'accès m'a été ouvert pendant l'audit (`sg systemd-journal -c "journalctl -u cyber-grc …"`). S8 et S12 sont désormais établis **par la mesure** : voir **§1.19**, qui remplace cette ligne. Ce qu'elle a produit : le contrat des deux bouts vérifié sur douze refus, 908 lignes balayées sans une fuite, l'injection de journal refusée, la référence d'incident retrouvée et le témoin `x-request-id` discriminant. **Une réserve écrite n'est pas une réserve traitée** — celle-ci a coûté une demi-heure et rendu quatre mesures que la lecture n'aurait pas données | — |
| **Le mot de passe du compte de secours** | il n'est pas dans le dépôt (c'est l'objet du contrôle S8) et `/etc/cyber-grc/env` est lisible par `root` seul. Je n'ai donc pu éprouver que l'usage **refusé** du compte de secours, pas l'usage **réussi** — dont le lot fait un critère | fournir un mot de passe de secours jetable à l'auditeur, ou jouer ce cas sur une VM d'essai |
| **`deploy/install.sh` rejoué de bout en bout** | exige `root`. Les constats **Q-75**, **Q-76**, **Q-101** portent sur son comportement, et je n'ai pu qu'en lire les blocs et croire `test/deploiement/` (65/65) | jouer l'installateur **sur une VM jetable**, avec un nom d'hôte désaligné, pour voir le verdict `reserve()` et le code 3 |
| **Sabotage de la base de production** pour voir `f_verifier_schema()` faire échouer le chemin d'installation (S16) | j'aurais cassé l'installation servant à tous les autres contrôles. Le garde-fou neuf est mordu par `test/droits/substrat-session.test.mjs`, et le registre `controles_schema` est peuplé | rien : la couverture par le banc est suffisante, et je le dis plutôt que de le taire |
| **Chromium contre la PKI interne en TLS strict** | `net::ERR_CERT_AUTHORITY_INVALID` : Chromium porte son propre magasin et ignore celui du système. J'ai donc mesuré S17 avec `ignoreHTTPSErrors`, et validé la chaîne **séparément** par `curl` sans `--cacert` (`verif=0`) et par `openssl` (`Verify return code: 0`) | ancrer la racine interne dans une base NSS pour le banc, ou consigner que la validation TLS du navigateur est hors du périmètre du banc |

### Hors de portée de cet environnement (inchangé depuis S2)

L'**Active Directory de production** (le nôtre est un Samba monté pour la recette, avec
deux filiales et huit comptes ; une vraie forêt a des renvois, des groupes de plus de
1 000 membres et une pagination que le client écrit à la main **ne fait pas** —
`CONVENTIONS.md` §28), le **relais SMTP**, une **PKI d'entreprise**, et la charge réelle
de vingt filiales.

### Non tenté, et je le dis plutôt que de le laisser croire

- **S14** : je n'ai pas provoqué d'échec **au milieu** de la transaction d'ouverture de
  session (par exemple un journal indisponible) pour vérifier qu'aucune session orpheline
  ne subsiste. La transaction est unique et le banc est vert, mais **la propriété n'est pas
  mesurée par moi**.
- Je n'ai pas éprouvé le **déprovisionnement par l'annuaire** (compte désactivé dans l'AD →
  sessions révoquées à la revalidation) contre le Samba réel : il aurait fallu modifier des
  comptes du contrôleur de domaine, ce qui sort de la lecture seule. Le chemin est couvert
  par `test/auth/service.test.mjs`.
- Je n'ai pas cherché de défaut dans `src/reprise/**` ni dans les 26 modules métier hors
  de ce que le filet de Q-16 exerce : hors périmètre de la porte S3.
- Je n'ai pas mesuré la **durée de vie** réelle d'une session (`SESSION_DUREE_MAXIMALE=12 h`,
  `SESSION_DUREE_INACTIVITE=30 min`) : il aurait fallu attendre, ou manipuler l'horloge du
  service. Les deux échéances sont éprouvées par le banc avec une horloge injectée.

---

## 7. Ce que je recommande à l'orchestrateur

1. ~~Corriger Q-88 et Q-89~~ — **fait pendant l'audit, et vérifié à mon instrument** (§9).
   Le correctif de Q-89 va au-delà de ce que je demandais : le garde-fou neuf **découvre**
   les sites d'extraction au lieu d'en tenir la liste, ce qui ferme **Q-92** du même geste.
   Reste **Q-103, immédiat** : le frontend corrigé **n'est pas déployé**, et la machine en
   service extrait toujours la synthèse sans droit d'export. Un correctif commité qui ne
   sert pas est un correctif qui ne protège personne.
2. **Fermer Q-87 avant la vague 4.** C'est le seul garde-fou qui empêche Q-90 de revenir
   une neuvième fois, et il est resté ouvert alors que son échéance était *avant cette
   porte*. Cinq chiffres faux sont passés dessous, dont deux **contradictions internes au
   même fichier**.
3. **Retirer du `README` §8 la table « Dette reportée » pour ce qui concerne L3**, plutôt
   que de la corriger ligne à ligne : cinq de ses dix lignes décrivent un produit qui
   n'existe plus. Une table qui nie ce que le lot a livré est plus nuisible qu'absente.
4. ~~Demander l'accès au journal systemd~~ — **accordé pendant l'audit, et la réserve est
   levée par la mesure** (§1.19). Ce qu'elle a rendu et que la lecture n'aurait pas donné :
   le contrat des deux bouts vérifié sur douze refus, l'injection de journal réfutée, la
   couverture du journal d'audit **chiffrée** (4 actions émises sur 20 déclarées), et la
   justification de la dérogation **E6** prise en flagrant délit de fausseté — le journal
   n'est plus vide, `grc_lecture` y lit 138 entrées d'identités. *Une réserve écrite n'est
   pas une réserve traitée* : celle-ci a coûté une demi-heure.
5. **Rejouer la grille sur `294c0eb`.** Mon verdict porte sur `4f76da2` ; deux correctifs
   ont depuis touché le point d'entrée, le greffon de connexion et un module de la SPA. Ce
   chantier a payé deux fois le prix d'un correctif accepté sans rejeu complet.

---

---

## 8. Ce que mes mesures ont laissé sur l'installation de recette

Dit plutôt que nettoyé en douce : mesurer sur une installation vivante y laisse des
traces, et les effacer serait une écriture de plus.

- **Base `cyber_grc`** : quelques enregistrements de sonde créés par l'API — deux `audits`,
  plusieurs `actions` dont une intitulée `x'); drop table actions; --` (sonde d'injection,
  stockée littéralement) — et une ligne semée **directement en base** dans la filiale DEU,
  `ACT-SONDE-DEU / SECRET-DEU-NE-DOIT-PAS-FUIR`, qui a servi au contrôle de cloisonnement
  du §1.12. Aucune donnée réelle n'a été touchée ni supprimée.
- **`journal_audit`** : 125 entrées, dont la quasi-totalité vient de mes sondes
  d'authentification (79 échecs, 42 réussites). Elles ne peuvent pas être retirées — c'est
  le principe même du contrôle S3 —, et c'est bien ainsi : un journal qui garde la trace de
  son auditeur est un journal qui fait son travail.
- **Comptes AD** : `indirect.tls` a été **verrouillé** pour la mesure du §1.10
  (`verrouille_jusqu_a`, quinze minutes) ; le verrou est expiré depuis. Aucun mot de passe
  n'a été changé, aucun compte du contrôleur de domaine n'a été modifié.
- **Sessions** : dix-huit sessions de `rssi.tls` ont été révoquées en base pour la mesure
  du §1.18. Une reconnexion en ouvre une neuve ; rien n'est perdu.
- **Dépôt** : `git status` vide, `HEAD` inchangé, `dist/` reconstruit à l'identique après
  la dernière mutation, banc rejoué **1028/1028** sur la révision auditée.

---

---

## 9. L'arbre a bougé sous moi — deux fois, et il faut le dire

**Le coordinateur me l'a signalé de lui-même, et il a raison de vouloir que ce soit écrit :
c'est une donnée sur la conduite du chantier.** Le `PLAN_EXECUTION` §7 reproche exactement
cela au 7ᵉ passage de S2 — *« l'arbre a bougé sous lui, et une phrase qu'il venait d'écrire
est devenue fausse dix minutes plus tard »*. Le motif s'est reproduit ici, à ceci près qu'il
a été annoncé pendant, et non découvert après.

| Heure (UTC) | Ce qui a changé | Ce que cela invalide |
|---|---|---|
| jusqu'à **02:46** | révision `4f76da2`, service pid `305164` | rien — **c'est la révision que juge ce rapport** |
| **02:48:50** | le service est **redéployé et redémarré** (pid `369777`) avec les correctifs de Q-88 et Q-89 dans l'arbre de travail | ma première batterie S12 (11 refus, 02:46:12) porte sur l'ancien binaire |
| **02:55:28** | commit **`294c0eb`** — « Porte S3 refusée : deux bloquants trouvés par la mesure, corrigés le jour même » — qui embarque aussi **la première version de ce rapport** | la phrase de clôture, qui disait « `HEAD` vaut toujours `4f76da2` » |

**Ce que j'ai fait pour que la mesure reste attribuable.** J'ai relevé le `pid` de chaque
ligne de journal que j'exploite, puis **rejoué intégralement la batterie S12 sur le binaire
redéployé** — douze cas cette fois, `pid` unique `369777` — plutôt que de mélanger deux
binaires dans un même tableau. Résultat : **identique**, plus le cas « session révoquée » que
la première série n'avait pas. Le tableau du §1.19 est celui du rejeu.

### Ce que valent les deux correctifs, jugés à mon instrument

Le coordinateur écrit lui-même : *« ce sont mes correctifs ; je suis le dernier à devoir
juger s'ils tiennent »*. Voici ce que j'ai mesuré, sans reprendre ses chiffres.

**Q-88 — l'annuaire `personnes`.** ✅ **Fermé.** Sur la base de l'installation en service,
périmètre déclaré :

```
$ select nom, email, utilisateur_id is not null as rattachee, cree_par from personnes;
 Camille Marchand  | rssi.tls@exemple.interne    | t | rssi.tls
 Sacha Nguyen      | qualite.tls@exemple.interne | t | qualite.tls
 Claude Fontaine   | admin.grc@exemple.interne   | t | admin.grc
 Dominique Lefevre | contrib.tls@exemple.interne | t | contrib.tls        (4 lignes)
```

Quatre fiches, **avec les identités venues de l'annuaire** (nom d'affichage et courriel AD),
chacune rattachée à son `utilisateur_id`, `cree_par` portant le login. La table était à **0**
avant, mesuré deux fois et par deux chemins (§3, Q-88). Le livrable existe désormais.

**Q-89 — l'entonnoir d'export.** ✅ **Le correctif tient** — vérifié à mon Chromium, contre
le serveur réel et l'AD réel, en substituant le seul fichier corrigé à la copie déployée
(qui est périmée, voir **Q-103**) :

```
rssi.tls    (export:false, validation)      → AUCUN téléchargement
                message : « L'extraction de données n'est pas autorisée pour votre profil.
                            Le droit d'export est accordé séparément de la lecture. »
admin.grc   (export:false, administration)  → AUCUN téléchargement, même message
rssi.groupe (export:true,  validation)      → téléchargement, « Rapport de synthèse
                            téléchargé (HTML autonome). »   ← le cas légitime n'est pas cassé
```

Les deux profils qui contournaient la barrière — RSSI de filiale et ADMIN, ceux que j'avais
nommés — sont arrêtés ; celui qui a le droit passe toujours. **Le garde-fou neuf mord** :

```
$ (garde retirée de downloadReport) node --test test/depot/entonnoir-export.test.mjs
✖ AUCUN fichier ne fabrique un téléchargement sans exiger le droit
   · js/modules/synthese.js — URL.createObjectURL(, attribut « download » d'une ancre
ℹ pass 1 · fail 1
$ (garde restaurée, md5 a77c92b3c3cd identique à l'original)        ℹ pass 2 · fail 0
```

Il **découvre** les sites au lieu d'en tenir la liste, et refuse de conclure s'il en voit
moins de cinq (`sitesVus >= 5`, ligne 112) — ce qui ferme la porte au vert obtenu en
n'éprouvant rien. C'est le remède que **Q-92** réclamait, et il est meilleur que ce que
j'avais demandé.

Banc sur la révision corrigée :

```
$ git rev-parse --short HEAD          → 294c0eb
$ npm test                            → ℹ tests 1030 · pass 1030 · fail 0    EXIT=0
```

### Ce que ce rejeu ne vaut PAS

Le `PLAN_EXECUTION` §7 est explicite, et je m'y tiens : *« une mesure faite après coup par
l'auditeur n'est pas un rejeu de la porte »*. **Le verdict du §2 porte sur `4f76da2`.** Sur
`294c0eb` je n'ai rejoué **que** Q-88 et Q-89, plus le banc entier ; les seize autres
contrôles de la grille n'ont pas été repassés sur cette révision, et deux correctifs qui
touchent `src/api/index.ts`, `src/auth/greffon.ts` et un module de la SPA méritent qu'on le
dise. Ce chantier a payé deux fois le prix d'un correctif accepté sans rejeu complet ; ce
n'en est pas un troisième, mais ce n'est pas un franchissement non plus.

**Et il reste Q-103** : à l'heure où j'écris, la machine en service porte le nouveau binaire
et **l'ancien frontend**. La fuite que Q-89 décrit est encore ouverte sur l'installation,
pendant que le dépôt est vert à 1030/1030.

---

*Rapport rendu le 04/09/2026, complété le même jour après ouverture de l'accès au journal
systemd. Aucune ligne de produit, aucun essai, aucune correction n'a été écrite par cet
auditeur : la seule entrée de `git status` qui lui appartienne est ce fichier. Les mutations
du §4 et du §9 ont toutes été restaurées à l'octet près — empreintes vérifiées — et le banc
rejoué après chacune.*
