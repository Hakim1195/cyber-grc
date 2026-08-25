# Cyber GRC Groupe — serveur applicatif

> Guide d'exploitation. Le cadrage complet du projet vit dans
> [`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md), qui fait autorité.
> Conventions de schéma : [`db/CONVENTIONS.md`](db/CONVENTIONS.md).

**État : lot L0 livré, lot L1 partiel.** Voir « Avancement » en fin de document.

---

## 1. Ce que c'est

Le serveur applicatif de Cyber GRC en édition Groupe : API REST multi-filiales,
adossée à PostgreSQL, authentifiée sur l'Active Directory du groupe.

Contraintes de déploiement, imposées par le client :

- **Debian 13, sans conteneur** — service systemd natif, durci.
- **Apache2 en frontal**, seul point d'entrée. PostgreSQL et ClamAV n'écoutent
  que sur la boucle locale.
- **Aucune exposition Internet** : accès par VPN site-à-site ou VPN client.
- **HTTPS obligatoire**, certificat émis par la PKI interne.

## 2. Installation

```bash
sudo bash deploy/install.sh
```

Le script est idempotent. Au premier passage il crée `/etc/cyber-grc/serveur.env`
à partir de `.env.example` **et s'arrête** : renseignez-le (base, LDAP, SMTP,
secret de session), puis relancez. Aucun secret n'est généré par le script ni
versionné dans le dépôt.

Mise à jour applicative seule, sans toucher aux paquets :

```bash
sudo bash deploy/install.sh --maj
```

**Avant toute montée de version : prenez un instantané Proxmox.** C'est le
filet de retour arrière prévu au plan, et il coûte quelques secondes.

## 3. Arborescence à l'exécution

| Chemin | Contenu | Droits |
|---|---|---|
| `/opt/cyber-grc/backend` | Code compilé | `root:root` |
| `/opt/cyber-grc/frontend` | SPA servie par Apache | `root:root` |
| `/etc/cyber-grc/serveur.env` | Secrets et configuration | `root:cyber-grc` 0640 |
| `/var/lib/cyber-grc/pieces-jointes` | Magasin de pièces jointes | `cyber-grc` 0700 |
| `/var/lib/cyber-grc/quarantaine` | Fichiers rejetés par ClamAV | `cyber-grc` 0700 |
| `/var/log/cyber-grc` | Journaux techniques | `cyber-grc` 0750 |
| `/var/backups/cyber-grc` | Sauvegardes | `root` 0700 |

Le magasin de pièces jointes est en `0700` et **hors de l'arborescence web** :
Apache ne le sert jamais. Les fichiers ne sont délivrés que par l'application,
après contrôle des droits.

## 4. Exploitation courante

```bash
systemctl status cyber-grc          # état
journalctl -u cyber-grc -f          # journaux en direct
systemctl restart cyber-grc         # redémarrage (arrêt propre, drainage)
curl -fsS http://127.0.0.1:3001/api/sante
```

Le service intercepte `SIGTERM` et draine ses connexions avant de sortir
(`SERVEUR_DELAI_ARRET`). Ne le tuez pas avec `-9`.

## 5. Base de données

```bash
cd /opt/cyber-grc/backend && node db/migrate.mjs      # appliquer les migrations
```

Les migrations sont versionnées, transactionnelles et idempotentes : les
rejouer ne casse rien. Le suivi de ce qui est appliqué vit dans la table
`migrations_schema`.

**Deux propriétés à ne jamais casser**, vérifiées en recette :

1. **Cloisonnement par filiale** — la Row Level Security de PostgreSQL filtre
   sur le périmètre de la session, positionné par le serveur et *jamais* par
   une valeur transmise par le navigateur. Un oubli de filtre dans le code ne
   peut donc pas provoquer de fuite entre filiales.
2. **Journal d'audit en ajout seul** — tout `UPDATE` et tout `DELETE` sur
   `journal_audit` sont refusés par la base, y compris au rôle applicatif. Une
   entrée erronée ne se corrige pas : on en ajoute une nouvelle.

Pour le démontrer en audit :

```sql
update journal_audit set action = 'falsifie';
-- ERROR: Table journal_audit en ajout seul : opération UPDATE refusée.
```

## 6. Sauvegarde et restauration

| Niveau | Dispositif | Perte maximale |
|---|---|---|
| Base | Archivage continu des WAL vers un stockage distinct | quelques minutes |
| Pièces jointes | Synchronisation horaire vers un second emplacement | 1 heure |
| Ensemble | Sauvegarde Proxmox intégrale de la VM, quotidienne | 24 h (filet) |

⚠️ **Base et pièces jointes doivent être restaurées à un point cohérent entre
elles**, faute de quoi des enregistrements référencent des fichiers absents.
L'application affiche alors la pièce comme indisponible et le journalise,
plutôt que d'échouer — mais l'incohérence reste à éviter.

**La restauration se teste** : une fois avant la mise en service, puis
annuellement. Sur un outil qui héberge le PCA du groupe, une sauvegarde jamais
restaurée n'est pas une sauvegarde.

## 7. Recette

L'environnement de recette est une seconde VM à l'identique, avec deux règles
non négociables : il est alimenté par une **copie réaliste de la production**
(tester sur une base vide ne révèle rien), et il est **incapable d'envoyer des
courriels** — `SMTP_ACTIF=false` ou `SMTP_REDIRECTION_RECETTE` vers une boîte
de test. L'erreur classique est la campagne de relances partie de la recette
vers vingt filiales.

## 8. Avancement

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ livré |
| **L1 — Schéma relationnel** | 🟡 partiel : socle fait, métier et RLS à écrire |
| L2 — API et bascule de la persistance | ⬜ à faire |
| L3 — Authentification AD et droits | ⬜ à faire |
| L4 → L15 | ⬜ à faire (voir `../docs/PLAN_SERVEUR.md` §7) |

### Fait et vérifié en exécution

- Squelette Node 22 / TypeScript, configuration validée au démarrage (échec
  explicite si une variable requise manque), pool PostgreSQL positionnant le
  périmètre de session, serveur avec point de santé et arrêt propre.
- `db/migrations/001_socle.sql` : **16 tables**, exécution vérifiée sur
  PostgreSQL. Inaltérabilité du journal **prouvée** (`UPDATE` et `DELETE`
  refusés par la base).
- Déploiement complet : unité systemd durcie, vhost Apache, script
  d'installation Debian idempotent.

### Reste à faire sur L1

- `db/migrations/002_metier.sql` — les 21 entités du `DATA_MODEL` et leurs
  tables de liaison, avec la **scission `mesure_catalogue` /
  `mesure_mise_en_oeuvre`** et le découpage Groupe / Filiale / Mixte
  (`PLAN_SERVEUR` §2.2).
- `db/migrations/003_rls.sql` — rôles PostgreSQL, activation de la RLS sur
  toutes les tables portant `filiale_id`, `FORCE ROW LEVEL SECURITY`.
- `db/migrate.mjs` — l'exécuteur de migrations (référencé par `install.sh`,
  **pas encore écrit**).
- `db/verifier_cloisonnement.sql` — la démonstration qu'une session sur la
  filiale A ne voit aucune ligne de la filiale B.
