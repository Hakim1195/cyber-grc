-- =====================================================================================
--  070 — LE DONNEUR D'ORDRE CESSE D'ÊTRE UN NOM : LE REGISTRE DE L'ARTICLE 30 §2
--
--  §1  Le donneur d'ordre : son identité, son contrat, ce qu'il nous impose
--  §2  `traitements_pour_client` — le registre du SOUS-TRAITANT (RGPD art. 30 §2)
--  §3  Les mesures de sécurité rattachées (art. 30 §2 d, art. 32)
--  §4  Les sous-traitants ultérieurs déclarés au client (art. 28 §2 et §4)
--  §5  Le registre de l'article 30 du produit lui-même
--  §6  Le garde-fou, qui ÉPROUVE
--  §7  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Demande du **RSSI du client**, transmise le 24/09/2026 : dans le module « Donneurs
--  d'ordre », *« il veut qu'on puisse montrer au client comment on traite ses données »*,
--  conformément au RGPD, à DORA et à ISO 27001, *« et que ça soit respecté dans le reste
--  du logiciel »*.
--
--  🛑 **CE N'EST PAS UNE DEMANDE D'ÉCRAN. C'EST UN TROU DE CONFORMITÉ DU PRODUIT.**
--  Mesuré dans le dépôt avant d'écrire une ligne :
--
--      un DONNEUR D'ORDRE porte  2 champs  (nom, secteur)        — écran de   198 lignes
--      un PRESTATAIRE    porte 22 champs  (LEI, pays, contrat,
--                                          fonction critique,
--                                          pays des données,
--                                          plan de sortie, chaîne) — écran de 1 265 lignes
--
--  Et surtout : **« article 28 » apparaît huit fois dans le dépôt, et les huit fois c'est
--  DORA.** L'**article 28 du RGPD** — les obligations du SOUS-TRAITANT — et l'**article 30
--  §2** — le registre que le sous-traitant tient POUR CHAQUE responsable de traitement —
--  n'apparaissent **nulle part**. Zéro occurrence.
--
--  Le produit sait donc parfaitement documenter **ce que nous exigeons de nos
--  fournisseurs**, et il ne sait rien dire de **ce que nos clients exigent de nous**. Dans
--  une filière aéronautique, c'est le second qui se présente en audit client — et c'est
--  exactement la même classe que la demande du 10/09/2026 : *« je ne peux pas proposer un
--  logiciel pour gérer la cyber alors que le logiciel même n'est pas conforme au RGPD »*,
--  vue de l'autre côté du miroir.
--
--  ── LES TROIS TEXTES, ET CE QUE CHACUN EXIGE DE NOUS COMME FOURNISSEUR ───────────
--
--  **RGPD art. 28** — quand nous traitons des données personnelles pour le compte d'un
--  donneur d'ordre, nous sommes SOUS-TRAITANT et il est RESPONSABLE DE TRAITEMENT. Le
--  contrat doit porter : traitement sur instruction documentée (§3 a), confidentialité
--  (§3 b), sécurité de l'art. 32 (§3 c), autorisation des sous-traitants ultérieurs
--  (§2 et §4), assistance aux demandes d'exercice de droits (§3 e), restitution ou
--  suppression en fin de contrat (§3 g), audits (§3 h).
--
--  **RGPD art. 30 §2** — le sous-traitant tient SON PROPRE registre. Son contenu est
--  imposé et il n'est PAS celui du §1 : identité du responsable de traitement **et de son
--  DPO**, catégories de traitements effectués **pour le compte de chacun**, transferts
--  hors Union **et leurs garanties**, description des mesures de sécurité.
--
--  **DORA** — le miroir du registre d'information de l'article 28, vu du fournisseur : si
--  un donneur d'ordre est une **entité financière**, nous sommes son prestataire de
--  services TIC et nous lui devons ce qu'il doit inscrire dans SON registre.
--  ⚠️ **Et DORA ne s'applique qu'aux entités financières** : le groupe est industriel. Une
--  colonne `entite_financiere_dora` le DÉCLARE, et l'écran ne montre le régime que si elle
--  est vraie. Imposer DORA à tous les donneurs d'ordre afficherait un régime qui ne les
--  concerne pas, ce qui est pire que de ne rien afficher : cela apprend à ignorer l'écran.
--
--  **ISO 27001** — A.5.31 (exigences légales et **contractuelles** : déjà porté par
--  `exigences.client_id`, qui existe), A.5.34 (protection des DCP), A.5.24 à A.5.26
--  (notification d'incident, ici vers le client et selon SON délai), A.8.10 (effacement),
--  5.12/5.13 (classification et marquage — d'où le plancher de confidentialité).
--
--  ── CE QUI EST RÉUTILISÉ, ET NON REFAIT ─────────────────────────────────────────
--
--  🛑 **La règle la plus importante de cette migration est ce qu'elle N'AJOUTE PAS.**
--    · les **exigences contractuelles** du client : `exigences.client_id` existe depuis la
--      `002`. Rien à créer.
--    · les **sous-traitants ultérieurs** et leur chaîne : `prestataires` et
--      `prestataire_sous_traitance` les portent, rang **dérivé**, anti-cycle en base
--      (`042`). Le §4 ne fait que DÉCLARER lesquels touchent les données de ce client.
--    · les **mesures de sécurité** de l'art. 32 : le pivot `mesure_catalogue` /
--      `mesure_mise_en_oeuvre` les porte avec leur statut et leur maturité. Le §3 rattache.
--    · la **classification** : `documents.confidentialite` existe depuis la `027`, avec son
--      vocabulaire de quatre niveaux. Le plancher du client s'y branche — il ne le double
--      pas, et le §6 MESURE que les deux vocabulaires ne divergent pas.
--    · l'**auto-évaluation du référentiel que le client impose** : AirCyber pour la filière
--      aéro, déjà en base depuis L26.
--
--  ── LE SEUL ARBITRAGE DE SCHÉMA, ET IL A ÉTÉ POSÉ À L'UTILISATEUR ────────────────
--
--  **`traitements_pour_client` NE réutilise PAS la table `traitements`**, et ce n'est pas
--  un choix d'esthétique. Ajouter une colonne `rôle` à `traitements` était la réponse
--  courte et fausse :
--
--    · `finalite` et `base_legale` y sont celles de qui traite. Côté sous-traitant, la
--      finalité est **l'instruction du client** et la base légale est **la sienne**, pas la
--      nôtre. La moitié des colonnes perdrait son sens dans chaque rôle ;
--    · le §2 exige des champs que le §1 n'a pas (le DPO du responsable, la garantie de
--      transfert) et n'exige pas des champs que le §1 impose ;
--    · et deux registres **juridiquement distincts** mêlés dans une table divergent en
--      silence — le jour où l'un est purgé, exporté ou consolidé, l'autre suit sans que
--      personne l'ait voulu.
--
--  C'est mot pour mot la leçon de la migration `063` : *une table qui répond à une
--  question ne doit pas se mettre à en répondre une autre.*
--
--  ⚠️ **La PORTÉE reste la filiale**, arbitrage utilisateur confirmé le 24/09/2026. La
--  `002` §1 l'avait tranché — *« un donneur d'ordre de Toulouse n'a pas à être visible en
--  Allemagne »* — et c'est juridiquement exact : deux filiales servant le même groupe
--  client sont **deux sous-traitants distincts**, avec deux contrats et deux registres.
--  Conséquence assumée et dite : l'identité du client sera saisie deux fois.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE DONNEUR D'ORDRE : SON IDENTITÉ, SON CONTRAT, CE QU'IL NOUS IMPOSE
-- =====================================================================================

alter table clients add column if not exists pays                     text;
alter table clients add column if not exists entite_financiere_dora    boolean not null default false;
alter table clients add column if not exists lei                       text;
alter table clients add column if not exists contact_rt_nom            text;
alter table clients add column if not exists contact_rt_email          text;
alter table clients add column if not exists contact_dpo_nom           text;
alter table clients add column if not exists contact_dpo_email         text;
alter table clients add column if not exists contrat_reference         text;
alter table clients add column if not exists contrat_debut             date;
alter table clients add column if not exists contrat_fin               date;
alter table clients add column if not exists contrat_revue_le          date;
alter table clients add column if not exists droit_audit               text;
alter table clients add column if not exists fin_de_contrat            text;
alter table clients add column if not exists confidentialite_plancher  text;
alter table clients add column if not exists notification_incident_h   integer;

-- ── Les formes ──────────────────────────────────────────────────────────────────────
-- ⚠️ Le LEI n'est utile QUE si le client est une entité financière — mais on ne l'y
--    contraint pas : un industriel peut en porter un, et refuser la saisie d'une donnée
--    vraie parce qu'elle n'est pas obligatoire est une façon de perdre de l'information.
alter table clients drop constraint if exists ck_clients_lei;
alter table clients add constraint ck_clients_lei
    check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$');

alter table clients drop constraint if exists ck_clients_pays;
alter table clients add constraint ck_clients_pays
    check (pays is null or pays ~ '^[A-Z]{2}$');

-- ── Les contacts de l'article 30 §2 a) ──────────────────────────────────────────────
-- 🛑 **CE SONT LES DEUX SEULS CHAMPS QUE LE TEXTE NOMME EXPLICITEMENT** : « le nom et les
--    coordonnées du ou des responsables du traitement pour le compte desquels le
--    sous-traitant agit, […] ainsi que du délégué à la protection des données ». Un
--    registre §2 sans eux n'est pas un registre §2 incomplet : ce n'en est pas un.
alter table clients drop constraint if exists ck_clients_courriels;
alter table clients add constraint ck_clients_courriels
    check ((contact_rt_email  is null or contact_rt_email  ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
       and (contact_dpo_email is null or contact_dpo_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

alter table clients drop constraint if exists ck_clients_contrat_periode;
alter table clients add constraint ck_clients_contrat_periode
    check (contrat_debut is null or contrat_fin is null or contrat_fin >= contrat_debut);

-- ── Le droit d'audit (RGPD art. 28 §3 h, DORA art. 30 §3) ───────────────────────────
alter table clients drop constraint if exists ck_clients_droit_audit;
alter table clients add constraint ck_clients_droit_audit
    check (droit_audit is null or droit_audit in
           ('aucun', 'sur demande', 'annuel', 'certification acceptée'));

-- ── La fin de contrat (RGPD art. 28 §3 g) ───────────────────────────────────────────
-- ⚠️ « non défini » N'EST PAS une valeur du vocabulaire, et c'est délibéré : l'absence se
--    dit par `null`, et l'écran la SIGNALE comme un manque. Une valeur « non défini »
--    aurait l'air d'une décision prise.
alter table clients drop constraint if exists ck_clients_fin_de_contrat;
alter table clients add constraint ck_clients_fin_de_contrat
    check (fin_de_contrat is null or fin_de_contrat in
           ('restitution', 'suppression', 'restitution puis suppression'));

-- ── Le plancher de classification (ISO 27001 5.12, et §4 de la migration 071) ───────
-- 🛑 **LE VOCABULAIRE EST CELUI DE `documents.confidentialite`, POSÉ PAR LA `027`.** S'ils
--    divergeaient, le plancher deviendrait insatisfiable : aucun document ne pourrait plus
--    être rattaché à ce client, et le refus parlerait d'un niveau qui n'existe pas. Le §6
--    ÉPROUVE les deux contraintes l'une contre l'autre — il ne compare pas leur texte.
alter table clients drop constraint if exists ck_clients_confidentialite_plancher;
alter table clients add constraint ck_clients_confidentialite_plancher
    check (confidentialite_plancher is null or confidentialite_plancher in
           ('public', 'interne', 'confidentiel', 'restreint'));

-- ── Le délai CONTRACTUEL de notification d'incident ─────────────────────────────────
-- ⚠️ Souvent 24 h dans un contrat aéronautique, donc **plus court que NIS2**. Le produit
--    doit pouvoir armer l'échéance la plus contraignante, pas la plus connue.
--    Borné à 720 h (30 jours) : au-delà, ce n'est plus une notification d'incident.
alter table clients drop constraint if exists ck_clients_notification_incident;
alter table clients add constraint ck_clients_notification_incident
    check (notification_incident_h is null
           or (notification_incident_h >= 1 and notification_incident_h <= 720));

-- ── Les bornes de matière (motif Q-214 d, Q-327) ────────────────────────────────────
alter table clients drop constraint if exists ck_clients_longueurs;
alter table clients add constraint ck_clients_longueurs
    check ((contact_rt_nom    is null or length(contact_rt_nom)    <= 200)
       and (contact_rt_email  is null or length(contact_rt_email)  <= 320)
       and (contact_dpo_nom   is null or length(contact_dpo_nom)   <= 200)
       and (contact_dpo_email is null or length(contact_dpo_email) <= 320)
       and (contrat_reference is null or length(contrat_reference) <= 200));

comment on column clients.entite_financiere_dora is
    'Le donneur d''ordre est-il une ENTITÉ FINANCIÈRE au sens de DORA (art. 2) ? ⚠️ S''il '
    'l''est, NOUS sommes son prestataire de services TIC, et nous lui devons ce qu''il doit '
    'inscrire dans son registre d''information (art. 28 §3) : notre identité, notre pays, '
    'notre chaîne de sous-traitance, et si nous soutenons une fonction critique. Faux par '
    'défaut : DORA ne s''applique pas à un donneur d''ordre industriel, et afficher son '
    'régime à tout le monde apprendrait à ignorer l''écran.';
comment on column clients.contact_dpo_email is
    'Coordonnées du délégué à la protection des données DU CLIENT — nommément exigées par '
    'le RGPD art. 30 §2 a). ⚠️ C''est la personne à qui nous devons notifier une violation '
    'de données (art. 33 §2) : sans elle, la notification n''a pas de destinataire.';
comment on column clients.confidentialite_plancher is
    'Niveau de confidentialité MINIMAL que ce donneur d''ordre impose à ses données '
    '(ISO 27001 5.12). Même vocabulaire que documents.confidentialite, et le garde-fou '
    'f_verifier_sous_traitance_rgpd() ÉPROUVE que les deux ne divergent pas : un plancher '
    'exprimé dans un vocabulaire étranger serait insatisfiable, et le refus citerait un '
    'niveau qui n''existe pas. Nul = aucune exigence contractuelle connue, et l''écran le '
    'signale comme un MANQUE plutôt que comme une décision.';
comment on column clients.notification_incident_h is
    'Délai CONTRACTUEL de notification d''un incident à ce donneur d''ordre, en heures. '
    '⚠️ Souvent 24 h, donc plus court que les 72 h de NIS2 : c''est lui qui commande le '
    'premier geste. Dérivé en échéance par f_echeance_contractuelle() (migration 071), '
    'jamais stocké — même motif que l''horloge réglementaire de la 034.';
comment on column clients.fin_de_contrat is
    'Sort des données à la fin du contrat : restitution, suppression, ou les deux '
    '(RGPD art. 28 §3 g). ⚠️ Nul veut dire « non convenu », et c''est un MANQUE que le '
    'dossier client nomme — pas une valeur du vocabulaire, qui aurait l''air d''une '
    'décision prise.';

-- =====================================================================================
-- §2 — `traitements_pour_client` — LE REGISTRE DU SOUS-TRAITANT (RGPD art. 30 §2)
-- =====================================================================================

create table if not exists traitements_pour_client (
    id          id_metier   not null default f_generer_id('TPC'),
    filiale_id  id_metier   not null,
    client_id   id_metier   not null,

    intitule              text not null,
    -- art. 30 §2 b) : « les catégories de traitements effectués pour le compte de chaque
    -- responsable du traitement ». C'est le seul champ que le texte rend obligatoire en
    -- plus de l'identité : il est donc « not null ».
    categories_traitement text not null,
    categories_donnees    text,
    personnes_concernees  text,
    donnees_sensibles     boolean not null default false,
    -- art. 28 §3 a) : le traitement se fait sur INSTRUCTION DOCUMENTÉE. Cette colonne
    -- désigne l'instruction — une annexe de contrat, un bon de commande, un cahier des
    -- charges. Sans elle, « nous traitons sur instruction » est une affirmation sans pièce.
    instruction_reference text,
    -- art. 30 §2 c) : les transferts vers un pays tiers, ET l'identification des garanties
    -- (art. 46). Les deux vont par PAIRE, et la contrainte le pose.
    transfert_hors_ue     text,
    transfert_garantie    text,
    duree_conservation    text,
    fin_de_traitement     text,
    revue_le              date,
    notes                 text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_traitements_pour_client primary key (id),
    -- Cible des clés étrangères composites venues du pivot du §3 (§17.1).
    constraint uq_traitements_pour_client_id_filiale unique (id, filiale_id),

    constraint fk_traitements_pour_client_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- 🛑 CLÉ COMPOSITE (§17.1) : un donneur d'ordre de la filiale voisine est INVISIBLE, et
    -- une clé simple serait satisfaite PAR LUI — le registre d'une filiale se rattacherait
    -- au client d'une autre, et personne ne le verrait. « cascade » : supprimer un donneur
    -- d'ordre emporte le registre tenu pour lui, qui n'a plus d'objet (§8).
    constraint fk_traitements_pour_client_client
        foreign key (client_id, filiale_id) references clients(id, filiale_id)
        on delete cascade,

    constraint ck_traitements_pour_client_intitule
        check (intitule <> '' and length(intitule) <= 300),
    constraint ck_traitements_pour_client_categories
        check (categories_traitement <> '' and length(categories_traitement) <= 4000),

    -- 🛑 LA CONTRAINTE QUI PORTE L'ARTICLE 46, ET C'EST LE CONSTAT D'AUDIT LE PLUS
    -- FRÉQUENT : un transfert hors Union déclaré SANS garantie identifiée. Déclarer le
    -- transfert et taire la garantie donne un registre qui a l'air complet et qui
    -- documente une infraction.
    constraint ck_traitements_pour_client_transfert
        check (transfert_hors_ue is null
               or btrim(transfert_hors_ue) = ''
               or (transfert_garantie is not null and btrim(transfert_garantie) <> '')),

    constraint ck_traitements_pour_client_longueurs
        check ((categories_donnees    is null or length(categories_donnees)    <= 4000)
           and (personnes_concernees  is null or length(personnes_concernees)  <= 2000)
           and (instruction_reference is null or length(instruction_reference) <= 300)
           and (transfert_hors_ue     is null or length(transfert_hors_ue)     <= 2000)
           and (transfert_garantie    is null or length(transfert_garantie)    <= 2000)
           and (duree_conservation    is null or length(duree_conservation)    <= 500)
           and (fin_de_traitement     is null or length(fin_de_traitement)     <= 500)
           and (notes                 is null or length(notes)                 <= 4000))
);

create index if not exists ix_traitements_pour_client_filiale
    on traitements_pour_client (filiale_id, client_id);
create index if not exists ix_traitements_pour_client_revue
    on traitements_pour_client (filiale_id, revue_le);

alter table traitements_pour_client
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_traitements_pour_client_provenance on traitements_pour_client;
create trigger trg_traitements_pour_client_provenance
    before insert on traitements_pour_client
    for each row execute function f_marquer_provenance();
alter table traitements_pour_client
    enable always trigger trg_traitements_pour_client_provenance;

-- ⚠️ Le nom d'un déclencheur de traçabilité est NORMATIF : `trg_<table>_maj`. L'abréger
--    pour tenir en 63 caractères le rend INVISIBLE au garde de traçabilité, sans erreur
--    (leçon de la vague G1). Ici : 35 caractères, aucune tentation.
-- ⚠️ `f_init_tracabilite()` À L'INSERTION, et pas seulement `f_maj_tracabilite()` à la
--    mise à jour : sans lui, **l'appelant fixe lui-même `version`, `cree_le` et
--    `cree_par`** (§18.1). C'est le garde-fou `tracabilite` qui l'a exigé, pas moi — et
--    dans un registre destiné à être montré à un client, un `cree_par` que l'appelant
--    choisit n'est pas une trace, c'est une déclaration.
drop trigger if exists trg_traitements_pour_client_creation on traitements_pour_client;
create trigger trg_traitements_pour_client_creation before insert on traitements_pour_client
    for each row execute function f_init_tracabilite();
alter table traitements_pour_client
    enable always trigger trg_traitements_pour_client_creation;

drop trigger if exists trg_traitements_pour_client_maj on traitements_pour_client;
create trigger trg_traitements_pour_client_maj before update on traitements_pour_client
    for each row execute function f_maj_tracabilite();
alter table traitements_pour_client
    enable always trigger trg_traitements_pour_client_maj;

alter table traitements_pour_client enable row level security;
alter table traitements_pour_client force  row level security;

drop policy if exists pol_traitements_pour_client_lecture     on traitements_pour_client;
drop policy if exists pol_traitements_pour_client_ajout       on traitements_pour_client;
drop policy if exists pol_traitements_pour_client_maj         on traitements_pour_client;
drop policy if exists pol_traitements_pour_client_suppression on traitements_pour_client;

create policy pol_traitements_pour_client_lecture on traitements_pour_client for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_traitements_pour_client_ajout on traitements_pour_client for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_traitements_pour_client_maj on traitements_pour_client for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_traitements_pour_client_suppression on traitements_pour_client for delete
    using (filiale_id = f_filiale_ecriture());

comment on table traitements_pour_client is
    'LE REGISTRE DE L''ARTICLE 30 §2 DU RGPD : ce que NOUS traitons POUR LE COMPTE d''un '
    'donneur d''ordre, quand nous sommes SOUS-TRAITANT et qu''il est RESPONSABLE DE '
    'TRAITEMENT. ⚠️ Ce n''est PAS la table « traitements », qui est le registre de '
    'l''article 30 §1 — celui où nous sommes responsable. Les deux registres sont '
    'juridiquement distincts : ici la finalité est l''INSTRUCTION du client et la base '
    'légale est LA SIENNE, pas la nôtre. Les mêler dans une table les ferait diverger en '
    'silence le jour où l''un est purgé, exporté ou consolidé (motif de la migration 063 : '
    'une table qui répond à une question ne doit pas se mettre à en répondre une autre). '
    'Identifiant "TPC-…".';
comment on column traitements_pour_client.categories_traitement is
    'Article 30 §2 b) : « les catégories de traitements effectués pour le compte de chaque '
    'responsable du traitement ». Seul champ que le texte rend obligatoire en plus de '
    'l''identité du responsable — donc « not null ».';
comment on column traitements_pour_client.transfert_garantie is
    'La garantie du transfert hors Union (RGPD art. 46) : clauses contractuelles types, '
    'BCR, décision d''adéquation. 🛑 La contrainte ck_traitements_pour_client_transfert la '
    'rend OBLIGATOIRE dès qu''un transfert est déclaré : un transfert sans garantie '
    'identifiée est le constat d''audit le plus fréquent, et le taire donnerait un registre '
    'qui a l''air complet et qui documente une infraction.';
comment on column traitements_pour_client.instruction_reference is
    'L''INSTRUCTION DOCUMENTÉE au sens de l''article 28 §3 a) : annexe de contrat, bon de '
    'commande, cahier des charges. Sans elle, « nous traitons sur instruction » est une '
    'affirmation sans pièce, et c''est la première question d''un auditeur.';

comment on policy pol_traitements_pour_client_lecture on traitements_pour_client is
    'Le registre est TOUJOURS local : deux filiales servant le même groupe client sont deux '
    'sous-traitants distincts, avec deux contrats et deux registres. Une ligne de portée '
    'Groupe ferait dire au registre d''une filiale un traitement qu''elle n''opère pas.';

-- =====================================================================================
-- §3 — LES MESURES DE SÉCURITÉ RATTACHÉES (art. 30 §2 d, art. 32)
-- =====================================================================================
-- ⚠️ **On ne ressaisit rien.** Le pivot « Mesure de sécurité » porte déjà le statut, la
--    maturité et le responsable. Le registre §2 doit rendre « une description générale des
--    mesures de sécurité » : elle se CONSTRUIT depuis le pivot, elle ne se retape pas dans
--    un champ de texte que personne ne mettra à jour.

create table if not exists traitement_client_mesures (
    traitement_pour_client_id id_metier   not null,
    mesure_id                 id_metier   not null,
    filiale_id                id_metier   not null,
    cree_le                   timestamptz not null default now(),
    cree_par                  text        not null default f_utilisateur_courant(),

    constraint pk_traitement_client_mesures
        primary key (traitement_pour_client_id, mesure_id),

    -- Composite : les deux colonnes sont non nulles, donc la vérification a TOUJOURS lieu
    -- (§45 — une clé composite ne contrôle rien quand une colonne est nulle).
    constraint fk_traitement_client_mesures_traitement
        foreign key (traitement_pour_client_id, filiale_id)
        references traitements_pour_client (id, filiale_id) on delete cascade,

    -- Vise le CATALOGUE (§16.3), et « restrict » et non « cascade » (§17.6) : une
    -- suppression dans le socle Groupe ne doit pas défaire les rattachements RGPD de
    -- filiales qu'elle ne voit pas. Même raisonnement que fk_traitement_mesures_mesure.
    constraint fk_traitement_client_mesures_mesure
        foreign key (mesure_id) references mesure_catalogue(id) on delete restrict,

    constraint fk_traitement_client_mesures_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict
);

create index if not exists ix_traitement_client_mesures_filiale
    on traitement_client_mesures (filiale_id, mesure_id);
create index if not exists ix_traitement_client_mesures_mesure
    on traitement_client_mesures (mesure_id);

alter table traitement_client_mesures
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_traitement_client_mesures_provenance on traitement_client_mesures;
create trigger trg_traitement_client_mesures_provenance
    before insert on traitement_client_mesures
    for each row execute function f_marquer_provenance();
alter table traitement_client_mesures
    enable always trigger trg_traitement_client_mesures_provenance;

-- `f_init_creation()` et non `f_init_tracabilite()` : un pivot ne porte ni `version` ni
-- `modifie_*`. Même choix que `traitement_mesures`, dont c'est le jumeau.
drop trigger if exists trg_traitement_client_mesures_creation on traitement_client_mesures;
create trigger trg_traitement_client_mesures_creation before insert on traitement_client_mesures
    for each row execute function f_init_creation();
alter table traitement_client_mesures
    enable always trigger trg_traitement_client_mesures_creation;

-- 🛑 **CELUI-CI N'A ÉTÉ RÉCLAMÉ PAR AUCUN GARDE-FOU, ET C'EST LE PLUS IMPORTANT DES
--    TROIS.** `mesure_catalogue` est une table MIXTE : son `filiale_id` est nullable, et
--    « nul » y veut dire « socle du Groupe ». Une clé étrangère vers elle ne peut donc PAS
--    être composite — il n'existe pas de couple `(id, filiale_id)` référençable quand la
--    colonne est nulle (`CONVENTIONS.md` §45). Sans ce déclencheur, **une filiale
--    rattacherait au registre de son client une mesure LOCALE d'une filiale voisine** :
--    invisible à la lecture, elle apparaîtrait dans le dossier remis au client comme une
--    mesure de sécurité que cette filiale n'a jamais mise en œuvre.
--
--    ⚠️ Aucune clé étrangère ne peut l'exprimer, et c'est exactement pourquoi la `004` a
--    écrit `f_coherence_mesure_catalogue()` — elle l'a posé sur les quatre tables qui
--    visaient alors le catalogue. Ce pivot est la cinquième, et il est passé à un cheveu
--    d'être la seule sans barrière : les gardes de traçabilité et de provenance ont crié,
--    celui-là se serait tu.
drop trigger if exists trg_traitement_client_mesures_coherence on traitement_client_mesures;
create trigger trg_traitement_client_mesures_coherence
    before insert or update on traitement_client_mesures
    for each row execute function f_coherence_mesure_catalogue();
alter table traitement_client_mesures
    enable always trigger trg_traitement_client_mesures_coherence;

alter table traitement_client_mesures enable row level security;
alter table traitement_client_mesures force  row level security;

drop policy if exists pol_traitement_client_mesures_lecture     on traitement_client_mesures;
drop policy if exists pol_traitement_client_mesures_ajout       on traitement_client_mesures;
drop policy if exists pol_traitement_client_mesures_maj         on traitement_client_mesures;
drop policy if exists pol_traitement_client_mesures_suppression on traitement_client_mesures;

create policy pol_traitement_client_mesures_lecture on traitement_client_mesures for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_traitement_client_mesures_ajout on traitement_client_mesures for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_traitement_client_mesures_maj on traitement_client_mesures for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_traitement_client_mesures_suppression on traitement_client_mesures for delete
    using (filiale_id = f_filiale_ecriture());

comment on table traitement_client_mesures is
    'Les mesures de sécurité qui couvrent un traitement fait pour le compte d''un donneur '
    'd''ordre — « une description générale des mesures de sécurité » exigée par le RGPD '
    'art. 30 §2 d), renvoyée à l''article 32. ⚠️ Elle RATTACHE au pivot existant, elle ne '
    'recopie ni statut ni maturité : une description figée dans un champ de texte est vraie '
    'le jour où on l''écrit et fausse la semaine suivante.';

-- =====================================================================================
-- §4 — LES SOUS-TRAITANTS ULTÉRIEURS DÉCLARÉS AU CLIENT (art. 28 §2 et §4)
-- =====================================================================================
-- 🛑 **C'EST UNE OBLIGATION, PAS UN CONFORT.** L'article 28 §2 interdit de recruter un
--    sous-traitant ultérieur sans l'autorisation écrite du responsable de traitement, et
--    le §4 nous rend responsable de ses manquements. Le produit connaît déjà nos
--    prestataires et leur chaîne (`042`) : ce qu'il ne savait pas dire, c'est LESQUELS
--    touchent les données de CE client — donc lesquels doivent lui être déclarés.
--
-- ⚠️ **On ne duplique pas le prestataire**, on le DÉSIGNE. La chaîne, le pays, le rang et
--    le score restent là où ils sont calculés.

create table if not exists client_sous_traitants (
    client_id      id_metier   not null,
    prestataire_id id_metier   not null,
    filiale_id     id_metier   not null,
    -- La DATE de l'autorisation du responsable de traitement (art. 28 §2). Nulle = pas
    -- encore autorisé, et le dossier client le nomme comme un manque BLOQUANT : recruter
    -- sans autorisation est une infraction, pas un retard administratif.
    autorise_le    date,
    role           text,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),

    constraint pk_client_sous_traitants primary key (client_id, prestataire_id),

    constraint fk_client_sous_traitants_client
        foreign key (client_id, filiale_id) references clients (id, filiale_id)
        on delete cascade,
    constraint fk_client_sous_traitants_prestataire
        foreign key (prestataire_id, filiale_id) references prestataires (id, filiale_id)
        on delete cascade,
    constraint fk_client_sous_traitants_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    constraint ck_client_sous_traitants_role
        check (role is null or (role <> '' and length(role) <= 500))
);

create index if not exists ix_client_sous_traitants_filiale
    on client_sous_traitants (filiale_id, client_id);
create index if not exists ix_client_sous_traitants_prestataire
    on client_sous_traitants (prestataire_id);

alter table client_sous_traitants
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_client_sous_traitants_provenance on client_sous_traitants;
create trigger trg_client_sous_traitants_provenance
    before insert on client_sous_traitants
    for each row execute function f_marquer_provenance();
alter table client_sous_traitants
    enable always trigger trg_client_sous_traitants_provenance;

drop trigger if exists trg_client_sous_traitants_creation on client_sous_traitants;
create trigger trg_client_sous_traitants_creation before insert on client_sous_traitants
    for each row execute function f_init_creation();
alter table client_sous_traitants
    enable always trigger trg_client_sous_traitants_creation;

alter table client_sous_traitants enable row level security;
alter table client_sous_traitants force  row level security;

drop policy if exists pol_client_sous_traitants_lecture     on client_sous_traitants;
drop policy if exists pol_client_sous_traitants_ajout       on client_sous_traitants;
drop policy if exists pol_client_sous_traitants_maj         on client_sous_traitants;
drop policy if exists pol_client_sous_traitants_suppression on client_sous_traitants;

create policy pol_client_sous_traitants_lecture on client_sous_traitants for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_client_sous_traitants_ajout on client_sous_traitants for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_client_sous_traitants_maj on client_sous_traitants for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_client_sous_traitants_suppression on client_sous_traitants for delete
    using (filiale_id = f_filiale_ecriture());

comment on table client_sous_traitants is
    'Quels de NOS prestataires touchent les données d''un donneur d''ordre donné — donc '
    'lesquels sont des SOUS-TRAITANTS ULTÉRIEURS à lui déclarer (RGPD art. 28 §2 et §4). '
    '⚠️ Elle DÉSIGNE, elle ne duplique pas : la chaîne de sous-traitance, le pays, le rang '
    'et le score restent dans prestataires / prestataire_sous_traitance (migration 042), là '
    'où ils sont calculés. ⚠️ « autorise_le » nul est un manque BLOQUANT du dossier client : '
    'recruter un sous-traitant ultérieur sans l''autorisation écrite du responsable de '
    'traitement est une infraction, pas un retard administratif.';

-- =====================================================================================
-- §5 — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- =====================================================================================
-- ⚠️ **Le produit se déclare à son propre registre** (`colonnes_personnelles`, migration
--    `026`). Toute colonne textuelle neuve est une décision à prendre, et l'omettre fait
--    rougir le déploiement — c'est le seul motif pour lequel ce lot ne peut pas introduire
--    des données personnelles en silence.
--
-- 🛑 **ET IL Y A UNE IRONIE À NOMMER ICI** : ce lot documente comment nous traitons les
--    données de nos clients, et il introduit lui-même quatre données personnelles — le nom
--    et le courriel du responsable de traitement et de son DPO. Ce sont des personnes
--    réelles, chez le client. Les inscrire au registre n'est donc pas une formalité de
--    schéma : c'est la cohérence minimale du produit avec son propre discours.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('clients', 'contact_rt_nom', 'personnelle',
   'Identifier la personne qui représente le responsable de traitement.',
   'Obligation légale', 1095, 'anonymiser',
   'RGPD art. 30 §2 a) : le registre du sous-traitant doit porter « le nom et les '
   'coordonnées du ou des responsables du traitement pour le compte desquels le '
   'sous-traitant agit ». ⚠️ « anonymiser » et non « supprimer » : effacer la ligne '
   'détruirait la preuve qu''un registre a été tenu, et c''est elle que l''autorité '
   'demande.'),
  ('clients', 'contact_rt_email', 'personnelle',
   'Joindre le responsable de traitement, notamment pour notifier une violation.',
   'Obligation légale', 1095, 'anonymiser',
   'Même base que le nom. ⚠️ C''est aussi l''adresse à laquelle l''article 33 §2 nous '
   'oblige à notifier une violation de données : sans elle, l''obligation n''a pas de '
   'destinataire.'),
  ('clients', 'contact_dpo_nom', 'personnelle',
   'Identifier le délégué à la protection des données du client.',
   'Obligation légale', 1095, 'anonymiser',
   'RGPD art. 30 §2 a), qui nomme le DPO explicitement à côté du responsable de '
   'traitement.'),
  ('clients', 'contact_dpo_email', 'personnelle',
   'Joindre le délégué à la protection des données du client.',
   'Obligation légale', 1095, 'anonymiser',
   'RGPD art. 30 §2 a). C''est le point de contact d''une notification de violation, et '
   'd''une demande d''exercice de droits que nous devons relayer (art. 28 §3 e).'),
  ('traitements_pour_client', 'personnes_concernees', 'personnelle',
   'Décrire les catégories de personnes dont les données sont traitées pour ce client.',
   'Obligation légale', 1095, 'signaler',
   'Champ libre : il décrit des CATÉGORIES, mais rien n''empêche d''y écrire un nom. '
   '« signaler » plutôt qu''« anonymiser » — même régime que traitements.personnes_'
   'concernees, dont c''est l''exact pendant côté sous-traitant : la purge le signale à '
   'un humain au lieu de détruire une mention dont elle ne peut pas juger.'),
  ('traitements_pour_client', 'notes', 'personnelle',
   'Consigner ce qui ne tient dans aucun champ du registre.',
   'Intérêt légitime', 1095, 'signaler',
   'Champ libre pouvant nommer un interlocuteur chez le client. Même régime que '
   'traitements.notes et crise.notes — le 4ᵉ régime, né du constat que le nom se cache au '
   'milieu d''une phrase.')
on conflict (table_nom, colonne) do nothing;

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('clients', 'pays', 'non_personnelle', null, null, null, null,
   'Code pays ISO 3166-1 alpha-2 d''une organisation, pas d''une personne.'),
  ('clients', 'lei', 'non_personnelle', null, null, null, null,
   'Identifiant d''entité juridique (ISO 17442) : une organisation. Même décision que '
   'prestataires.lei.'),
  ('clients', 'contrat_reference', 'non_personnelle', null, null, null, null,
   'Référence d''un contrat entre deux organisations. Même décision que '
   'prestataires.contrat_reference.'),
  ('clients', 'droit_audit', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : la modalité du droit d''audit prévue au contrat.'),
  ('clients', 'fin_de_contrat', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : le sort des données en fin de contrat (RGPD art. 28 §3 g).'),
  ('clients', 'confidentialite_plancher', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : le niveau de diffusion minimal imposé par le client.'),
  ('traitements_pour_client', 'intitule', 'non_personnelle', null, null, null, null,
   'Intitulé d''une activité de traitement. ⚠️ Décision alignée sur traitements.nom, dont '
   'c''est le pendant : un intitulé désigne un traitement, pas une personne.'),
  ('traitements_pour_client', 'categories_traitement', 'non_personnelle', null, null, null,
   'signaler',
   'Article 30 §2 b) : les CATÉGORIES de traitements. Champ libre, donc « signaler » — '
   'même régime que traitements.finalite, dont c''est l''équivalent côté sous-traitant.'),
  ('traitements_pour_client', 'categories_donnees', 'non_personnelle', null, null, null,
   'signaler',
   'Les catégories de données, pas les données. Même décision et même régime que '
   'traitements.categories_donnees.'),
  ('traitements_pour_client', 'instruction_reference', 'non_personnelle', null, null, null,
   null,
   'Référence d''un document contractuel (annexe, bon de commande) entre organisations.'),
  ('traitements_pour_client', 'transfert_hors_ue', 'non_personnelle', null, null, null,
   'signaler',
   'Description d''un transfert : un pays, un destinataire organisationnel. Champ libre, '
   'donc « signaler » — même décision que traitements.transfert_hors_ue.'),
  ('traitements_pour_client', 'transfert_garantie', 'non_personnelle', null, null, null,
   'signaler',
   'La garantie invoquée (clauses types, BCR, décision d''adéquation). Champ libre pouvant '
   'citer un signataire.'),
  ('traitements_pour_client', 'duree_conservation', 'non_personnelle', null, null, null,
   null,
   'Une durée exprimée en clair. Même décision que traitements.duree_conservation.'),
  ('traitements_pour_client', 'fin_de_traitement', 'non_personnelle', null, null, null,
   null,
   'Le sort des données à la fin du traitement, décrit en clair (art. 28 §3 g).'),
  ('client_sous_traitants', 'role', 'non_personnelle', null, null, null, null,
   'Ce que le sous-traitant ultérieur fait pour ce client : une prestation, pas une '
   'personne.'),
  ('traitements_pour_client', 'provenance', 'non_personnelle', null, null, null, null,
   'Marque d''origine de la ligne : saisie, découverte, reprise ou socle.'),
  ('traitement_client_mesures', 'provenance', 'non_personnelle', null, null, null, null,
   'Marque d''origine de la ligne : saisie, découverte, reprise ou socle.'),
  ('client_sous_traitants', 'provenance', 'non_personnelle', null, null, null, null,
   'Marque d''origine de la ligne : saisie, découverte, reprise ou socle.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §6 — LE GARDE-FOU, QUI ÉPROUVE
-- =====================================================================================
-- ⚠️ `CONVENTIONS.md` §39 : un garde-fou **ÉPROUVE** — il tente la valeur interdite et
--    constate le refus. Il ne relit pas le texte de la contrainte. Mesuré quatre fois sur
--    ce chantier : `check (x in ('a','b') or true)` garde son nom et ses littéraux, et rend
--    **zéro anomalie**.
--
-- 🛑 **ET IL ÉPROUVE AUSSI LE NON-BRUIT** : une valeur LÉGITIME doit être acceptée. Sans
--    cette moitié, un garde qui refuse tout serait vert, et le produit serait mort.
--
-- ⚠️ **Les témoins sont des littéraux, jamais des lignes lues en base** (§41, et la leçon
--    payée une quatrième fois par la migration `068`) : `f_contrainte_accepte()` n'évalue
--    que le prédicat, sans insérer. Un garde conditionné à trouver une filiale existante
--    rend **zéro anomalie sur une base neuve**, c'est-à-dire ce qu'il rend quand tout va
--    bien.

create or replace function f_verifier_sous_traitance_rgpd()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les quatre niveaux de diffusion, et une valeur étrangère pour éprouver le refus.
    v_niveaux constant text[] := array['public', 'interne', 'confidentiel', 'restreint'];
    v_niveau  text;
begin
    -- ── (1) LE TRANSFERT HORS UNION EXIGE SA GARANTIE (RGPD art. 46) ────────────────
    -- C'est le constat d'audit le plus fréquent, et la contrainte est ce qui l'empêche.
    if f_contrainte_accepte('traitements_pour_client',
                            'ck_traitements_pour_client_transfert',
                            jsonb_build_object('transfert_hors_ue', 'États-Unis',
                                               'transfert_garantie', null)) then
        objet    := 'ck_traitements_pour_client_transfert';
        anomalie := 'transfert_sans_garantie_admis';
        detail   := 'Un transfert hors Union est accepté SANS garantie identifiée. Le '
                    'registre de l''article 30 §2 aurait l''air complet et documenterait '
                    'une infraction à l''article 46 — c''est le constat d''audit le plus '
                    'fréquent, et cette contrainte est ce qui l''empêche.';
        return next;
    end if;

    -- Le non-bruit : un transfert AVEC garantie doit passer.
    if not f_contrainte_accepte('traitements_pour_client',
                                'ck_traitements_pour_client_transfert',
                                jsonb_build_object('transfert_hors_ue', 'États-Unis',
                                                   'transfert_garantie',
                                                   'Clauses contractuelles types 2021/914')) then
        objet    := 'ck_traitements_pour_client_transfert';
        anomalie := 'transfert_legitime_refuse';
        detail   := 'Un transfert accompagné de ses clauses contractuelles types est '
                    'REFUSÉ. Le registre devient impossible à tenir pour tout client hors '
                    'Union — une contrainte qui refuse le cas légitime est pire que son '
                    'absence.';
        return next;
    end if;

    -- ── (2) LE PLANCHER DE CLASSIFICATION PARLE LA MÊME LANGUE QUE LES DOCUMENTS ────
    -- 🛑 C'est l'invariant que personne ne verrait autrement. Si les deux vocabulaires
    -- divergeaient, le plancher deviendrait INSATISFIABLE : aucun document ne pourrait
    -- plus être rattaché au client, et le refus citerait un niveau qui n'existe pas. Le
    -- garde ne compare pas les deux TEXTES de contrainte — il les ÉPROUVE tous les deux
    -- sur les mêmes valeurs, ce qui est la seule mesure qui survive à une réécriture.
    foreach v_niveau in array v_niveaux loop
        if not f_contrainte_accepte('clients', 'ck_clients_confidentialite_plancher',
                                    jsonb_build_object('confidentialite_plancher', v_niveau))
        then
            objet    := 'ck_clients_confidentialite_plancher';
            anomalie := 'plancher_refuse_un_niveau_de_document';
            detail   := format(
                'Le niveau « %s » est accepté par documents.confidentialite et REFUSÉ par '
                'le plancher du donneur d''ordre. Un client ne peut donc pas exiger un '
                'niveau que ses propres documents portent : l''exigence contractuelle '
                'devient insaisissable, et le refus cite un niveau qui existe.', v_niveau);
            return next;
        end if;

        if not f_contrainte_accepte('documents', 'ck_documents_confidentialite',
                                    jsonb_build_object('confidentialite', v_niveau))
        then
            objet    := 'ck_documents_confidentialite';
            anomalie := 'document_refuse_un_niveau_de_plancher';
            detail   := format(
                'Le niveau « %s » est accepté comme plancher d''un donneur d''ordre et '
                'REFUSÉ sur un document. Aucun document ne pourrait satisfaire ce '
                'plancher : le client verrait une exigence contractuelle que le produit '
                'rend impossible à honorer.', v_niveau);
            return next;
        end if;
    end loop;

    -- Et le refus, des deux côtés, sur une valeur étrangère : sans cette moitié, les deux
    -- contraintes vidées par « or true » passeraient la boucle ci-dessus au vert.
    if f_contrainte_accepte('clients', 'ck_clients_confidentialite_plancher',
                            jsonb_build_object('confidentialite_plancher', 'diffusion libre'))
    then
        objet    := 'ck_clients_confidentialite_plancher';
        anomalie := 'plancher_hors_vocabulaire_admis';
        detail   := 'Le plancher accepte « diffusion libre », qui n''est pas un niveau de '
                    'diffusion du produit. Un plancher hors vocabulaire ne peut être '
                    'comparé à rien : il serait affiché au client et n''empêcherait rien.';
        return next;
    end if;

    -- ── (3) LE DÉLAI CONTRACTUEL DE NOTIFICATION RESTE UN DÉLAI ────────────────────
    if f_contrainte_accepte('clients', 'ck_clients_notification_incident',
                            jsonb_build_object('notification_incident_h', 0)) then
        objet    := 'ck_clients_notification_incident';
        anomalie := 'delai_nul_admis';
        detail   := 'Un délai de notification de 0 heure est accepté. L''échéance tomberait '
                    'à l''instant de la détection, et l''incident serait « en retard » avant '
                    'd''avoir été qualifié — un indicateur toujours rouge n''est plus lu.';
        return next;
    end if;
    if not f_contrainte_accepte('clients', 'ck_clients_notification_incident',
                                jsonb_build_object('notification_incident_h', 24)) then
        objet    := 'ck_clients_notification_incident';
        anomalie := 'delai_contractuel_usuel_refuse';
        detail   := 'Le délai de 24 heures est REFUSÉ, alors que c''est le délai '
                    'contractuel le plus répandu dans la filière. La contrainte interdit '
                    'le cas nominal.';
        return next;
    end if;

    -- ── (4) LES CLÉS COMPOSITES, NOMMÉMENT (§39.7) ─────────────────────────────────
    -- ⚠️ Un garde de CLASSE ne voit pas la disparition d'une PAIRE : `f_verifier_references_
    -- portee()` balaie les clés étrangères, mais c'est ici que l'on dit POURQUOI ces
    -- trois-là doivent être composites. Une clé simple vers `clients` serait satisfaite
    -- par le donneur d'ordre d'une filiale voisine — INVISIBLE —, et le registre de
    -- l'article 30 §2 d'une filiale se rattacherait au client d'une autre.
    if not exists (
        select 1 from pg_constraint
         where conname = 'fk_traitements_pour_client_client'
           and conrelid = 'public.traitements_pour_client'::regclass
           and cardinality(conkey) = 2)
    then
        objet    := 'fk_traitements_pour_client_client';
        anomalie := 'cle_vers_le_client_non_composite';
        detail   := 'La clé étrangère du registre vers le donneur d''ordre n''est plus '
                    'COMPOSITE. Une clé simple est satisfaite par une ligne d''une filiale '
                    'voisine, que la RLS rend invisible (§17.1) : le registre de '
                    'l''article 30 §2 pourrait se rattacher au client d''une autre filiale, '
                    'et aucun écran ne le montrerait.';
        return next;
    end if;
    if not exists (
        select 1 from pg_constraint
         where conname = 'fk_client_sous_traitants_prestataire'
           and conrelid = 'public.client_sous_traitants'::regclass
           and cardinality(conkey) = 2)
    then
        objet    := 'fk_client_sous_traitants_prestataire';
        anomalie := 'cle_vers_le_prestataire_non_composite';
        detail   := 'La déclaration des sous-traitants ultérieurs pointe vers un '
                    'prestataire par une clé SIMPLE. Une filiale déclarerait à son client '
                    'un sous-traitant qu''elle ne voit pas, et le dossier remis au client '
                    'nommerait une société qu''elle n''a jamais contractée.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_sous_traitance_rgpd() is
    'Éprouve les quatre propriétés du registre de l''article 30 §2 : un transfert hors '
    'Union exige sa garantie (art. 46), le plancher de classification du donneur d''ordre '
    'parle LE MÊME vocabulaire que documents.confidentialite — éprouvé des deux côtés sur '
    'les mêmes valeurs, jamais comparé par le texte —, un délai de notification reste un '
    'délai, et les deux clés vers le client et vers le prestataire restent COMPOSITES. '
    '⚠️ Il tente les valeurs interdites ET les valeurs légitimes : un garde qui refuse tout '
    'serait vert.';

revoke all on function f_verifier_sous_traitance_rgpd() from public;

-- L'armement, qui est une TROISIÈME chose (§19.4) : on DÉCOUVRE, on ne recopie pas.
select f_armer_declencheurs();

-- ⚠️ **L'ORDRE EST UNE CONTRAINTE, PAS UN STYLE** (§40.2) : le prédicat de découverte de
--    `f_poser_declencheurs_pieces()` exige que la politique de SUPPRESSION de la table soit
--    cloisonnée. Appelée avant le §2, elle ne verrait pas les tables neuves, équiperait
--    toutes les autres, rendrait un compte plausible et **les laisserait démunies sans une
--    erreur**.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §7 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('070', 'le donneur d''ordre cesse d''être un nom : registre de l''article 30 §2 du '
               'RGPD (nous SOUS-TRAITANT), identité et contrat du client, sous-traitants '
               'ultérieurs à lui déclarer — « article 28 » apparaissait huit fois dans le '
               'dépôt et les huit fois c''était DORA')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   drop function if exists f_verifier_sous_traitance_rgpd();
--   drop table if exists client_sous_traitants, traitement_client_mesures,
--                        traitements_pour_client;
--   alter table clients drop column if exists … (les quinze colonnes du §1)
--   delete from colonnes_personnelles where table_nom in
--       ('traitements_pour_client', 'client_sous_traitants')
--      or (table_nom = 'clients' and colonne in (…));
--   ⚠️ Retirer aussi la migration 071, qui branche ces colonnes sur les documents, les
--      incidents et les demandes de droits : l'annuler seule laisserait des références.
-- =====================================================================================
