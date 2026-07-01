# Changelog — Cyber GRC

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Application 100 % frontend (HTML/CSS/JS, sans backend).

## [Non publié]

### Phase 0 — Audit
- Ajout de `docs/DATA_MODEL.md` (schéma de données de référence).
- Ajout de `docs/AUDIT.md` (état des lieux, dette technique, plan priorisé).

### Persistance & sauvegarde
- **Refonte du stockage** : migration de `localStorage` (clé unique) vers
  **IndexedDB** (`js/core/persistence.js`), avec source de vérité en mémoire
  (API `DataStore` synchrone inchangée pour les modules).
- Migration automatique et transparente des données `localStorage` existantes,
  audits/revues inclus dans la sauvegarde unifiée.
- **Points de restauration versionnés** (automatiques toutes les 10 min +
  manuels, dédupliqués, historique glissant de 20) avec restauration en 1 clic.
- Sauvegarde de sécurité automatique avant tout import / restauration.
- `navigator.storage.persist()` demandé (réduit le risque de purge).
- Page **Paramètres** enrichie : état du stockage, quota, historique, export/import.
- Miroir localStorage de secours + flush avant fermeture d'onglet.

### Design & identité
- Application de la **charte Dedienne Aerospace** : couleurs échantillonnées sur
  le logo officiel (bleu `#2059A6`, orange `#E9631B`), variables CSS centralisées.
- Intégration du **logo officiel** (`logo-dedienne.png`) dans la barre latérale,
  favicon dédié.
- **Icônes SVG professionnelles** (style trait) sur toutes les entrées de menu.
- **Suppression de tous les emojis** (244 occurrences) au profit d'un rendu pro.
- Retrait des mentions de marques tierces (ancien branding, noms de concurrents).

### Mise en route
- Décompression de l'archive initiale dans l'espace de travail.
