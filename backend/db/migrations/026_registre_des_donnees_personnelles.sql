-- =====================================================================================
--  026 — LE PRODUIT SAIT QUELLES DONNÉES PERSONNELLES IL DÉTIENT
-- -------------------------------------------------------------------------------------
--  §1  Le registre : une décision par colonne, jamais une liste devinée
--  §2  Le semis — quarante-quatre colonnes, décidées une par une
--  §3  Le verrou d'approbation admet l'ANONYMISATION, jamais l'effacement
--  §4  Le garde-fou : une colonne non décidée fait rougir
--  §5  Consignation, vérification
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — décision utilisateur du 10/09/2026, et constats Q-284 / RGPD
--
--  L'utilisateur l'a posé en une phrase : *« je ne peux pas proposer un logiciel pour gérer
--  la cyber alors que le logiciel même n'est pas conforme, à la base, au RGPD »*. Il a
--  raison, et la mesure lui donne raison deux fois.
--
--  ── CE QUI EXISTAIT, ET POURQUOI CELA NE SUFFISAIT PAS ────────────────────────────────
--
--  La purge RGPD (`src/cycle/index.ts`) est bien faite : elle **découvre** les colonnes
--  textuelles dans `pg_catalog` au lieu d'en tenir une liste, et compare avant/après. Mais
--  elle ne sait **anonymiser** que les colonnes dont le nom figure dans une liste écrite à
--  la main de **cinq** entrées : `responsable`, `proprietaire`, `auditeur`, `participants`,
--  `suppleant` — plus `crise.nom`.
--
--  Mesuré dans le schéma : **quarante colonnes** portent un nom qui désigne une personne, et
--  la table `utilisateurs` en porte quatre de plus qu'aucun motif de nom ne devine —
--  `identifiant`, `upn`, `sid_ad`, `nom_affichage`. Autrement dit : **le produit ne sait pas
--  quelles données personnelles il détient**, et c'est la première question d'un DPO.
--
--  C'est le premier cas du `CLAUDE.md` §3 — *une omission qui fait réussir quelque chose en
--  silence alors que c'est faux* : la purge annonce « terminé » en ayant laissé le nom en
--  place dans trente-cinq colonnes.
--
--  ── CE QUE CE REGISTRE EST, ET CE QU'IL N'EST PAS ─────────────────────────────────────
--
--  Ce n'est pas une liste de plus. C'est **une décision par colonne**, et le garde-fou du §4
--  refuse qu'une colonne candidate reste **non décidée**. « Non personnelle » est une
--  réponse recevable — `actifs.nom` désigne un serveur, `profils.nom` un rôle — mais c'est
--  une réponse qu'il faut **donner**, avec sa justification, et qu'un auditeur peut relire.
--
--  Pour les colonnes personnelles, le registre porte ce que l'article 30 exige : la
--  **finalité**, la **base légale**, la **durée**, et ce qu'on fait à l'expiration. C'est
--  donc aussi, littéralement, **le registre des traitements du produit lui-même** — celui
--  qu'on présente au DPO du client quand il demande ce que l'outil fait de ses données.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE REGISTRE
-- =====================================================================================

create table if not exists colonnes_personnelles (
    table_nom     text not null,
    colonne       text not null,
    nature        text not null,
    finalite      text,
    base_legale   text,
    duree_jours   integer,
    a_expiration  text,
    justification text not null,
    constraint pk_colonnes_personnelles primary key (table_nom, colonne),
    constraint ck_colonnes_personnelles_nature
        check (nature in ('personnelle', 'non_personnelle')),
    constraint ck_colonnes_personnelles_base
        check (base_legale is null or base_legale in
               ('Consentement', 'Contrat', 'Obligation légale', 'Intérêt légitime',
                'Mission d''intérêt public', 'Sauvegarde des intérêts vitaux')),
    constraint ck_colonnes_personnelles_expiration
        check (a_expiration is null or a_expiration in
               ('anonymiser', 'supprimer', 'conserver', 'signaler')),
    -- (la contrainte est remplacée au rejeu par le bloc qui suit la création)
    constraint ck_colonnes_personnelles_justification check (justification <> ''),
    -- ⚠️ **Une donnée personnelle sans RÉGIME n'est pas déclarée, elle est mentionnée.**
    -- L'article 30 exige la finalité, la base légale et la durée ; sans elles, le registre
    -- donnerait l'illusion de la conformité. Une colonne « non personnelle », elle, n'a
    -- besoin que de sa justification.
    constraint ck_colonnes_personnelles_regime check (
        nature <> 'personnelle'
        or (finalite is not null and base_legale is not null
            and duree_jours is not null and a_expiration is not null))
);

comment on table colonnes_personnelles is
    'Registre des données personnelles DU PRODUIT LUI-MÊME — une décision par colonne, '
    'jamais une liste devinée. Il répond aux trois questions d''un DPO : quelles données '
    'l''outil détient, pourquoi, et pour combien de temps. La purge RGPD le LIT au lieu de '
    'porter sa propre liste ; le garde-fou f_verifier_colonnes_personnelles() refuse qu''une '
    'colonne candidate reste non décidée. « non_personnelle » est une réponse recevable — '
    'c''est de ne pas répondre qui ne l''est pas.';
comment on column colonnes_personnelles.a_expiration is
    'Ce qu''on fait quand la durée est écoulée. QUATRE régimes, et le quatrième a été '
    'trouvé par un essai : « anonymiser » (la ligne reste, le nom part — les preuves '
    'd''audit) ; « supprimer » (la ligne entière part — l''annuaire, un secret) ; '
    '« conserver » (on n''y touche pas, et le registre DIT pourquoi — le journal d''audit, '
    'inaltérable par dessein) ; et « signaler » (TEXTE LIBRE : le nom est au milieu d''une '
    'phrase, et le remplacer détruirait la phrase — le produit SIGNALE l''emplacement à un '
    'humain au lieu d''effacer, comme il le fait déjà pour la description d''un incident).';

-- Rejeu : la liste des régimes a gagné « signaler » après coup, et une table déjà créée
-- garderait l'ancienne contrainte.
alter table colonnes_personnelles drop constraint if exists ck_colonnes_personnelles_expiration;
alter table colonnes_personnelles add  constraint ck_colonnes_personnelles_expiration
    check (a_expiration is null or a_expiration in
           ('anonymiser', 'supprimer', 'conserver', 'signaler'));

alter table colonnes_personnelles enable row level security;
alter table colonnes_personnelles force row level security;

-- Registre technique de niveau socle, comme `controles_schema` : aucune donnée de filiale,
-- et il faut pouvoir le lire AVANT que le périmètre existe. Ce qui le protège est le
-- PRIVILÈGE, pas le prédicat — seul le propriétaire y écrit, au fil des migrations.
-- ⚠️ **`drop … if exists` avant chaque `create`, et ce n'est pas de la coquetterie.**
-- `install.sh` promet d'être idempotent, et une migration qui ne se rejoue pas dément
-- cette promesse au pire moment : quand on la corrige. Mesuré en la corrigeant — la
-- seconde application a échoué sur « policy … already exists ».
drop policy if exists pol_colonnes_personnelles_lecture      on colonnes_personnelles;
drop policy if exists pol_colonnes_personnelles_ajout        on colonnes_personnelles;
drop policy if exists pol_colonnes_personnelles_maj          on colonnes_personnelles;
drop policy if exists pol_colonnes_personnelles_suppression  on colonnes_personnelles;

create policy pol_colonnes_personnelles_lecture on colonnes_personnelles
    for select using (true);
create policy pol_colonnes_personnelles_ajout on colonnes_personnelles
    for insert with check (true);
create policy pol_colonnes_personnelles_maj on colonnes_personnelles
    for update using (true) with check (true);
create policy pol_colonnes_personnelles_suppression on colonnes_personnelles
    for delete using (true);

grant select on colonnes_personnelles to grc_app;
grant select on colonnes_personnelles to grc_lecture;

-- =====================================================================================
-- §2 — LE SEMIS : quarante-quatre colonnes, décidées une par une
-- =====================================================================================
--
-- ⚠️ **Les durées suivent `RETENTION_DONNEES` (1 095 jours = 3 ans), qui est le cadrage
-- du `PLAN_SERVEUR` §1.7.** Elles ne sont pas inventées ici : elles disent, colonne par
-- colonne, à partir de quand la donnée n'a plus de raison d'être nominative.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
-- ── Les personnes désignées comme responsables d'un objet ────────────────────────────
('actifs', 'responsable', 'personnelle', 'Savoir à qui s''adresser pour un actif du SI',
 'Intérêt légitime', 1095, 'anonymiser',
 'Nom saisi librement, souvent repris de l''annuaire. Anonymisé à l''expiration : la fiche d''actif garde son sens sans nommer qui en répondait il y a trois ans.'),
('actions', 'responsable', 'personnelle', 'Suivre qui porte une action du plan',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('exigences', 'responsable', 'personnelle', 'Suivre qui répond d''une exigence de conformité',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('mco_actions', 'responsable', 'personnelle', 'Suivre qui porte une action préalable',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('processus', 'responsable', 'personnelle', 'Savoir qui pilote un processus métier',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('mesure_mise_en_oeuvre', 'responsable', 'personnelle', 'Savoir qui met en œuvre une mesure',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('traitements', 'responsable', 'personnelle', 'Nommer le responsable d''un traitement (art. 30)',
 'Obligation légale', 1095, 'anonymiser',
 'Exigé par l''article 30 lui-même. Anonymisé à l''expiration du registre, pas avant.'),
('documents', 'proprietaire', 'personnelle', 'Savoir qui répond d''une politique',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem actifs.responsable.'),
('audits', 'auditeur', 'personnelle', 'Savoir qui a conduit un audit',
 'Intérêt légitime', 1095, 'anonymiser',
 'Le rapport garde sa valeur sans nommer l''auditeur trois ans après.'),
('revues', 'participants', 'personnelle', 'Attester qui a participé à une revue de direction',
 'Intérêt légitime', 1095, 'anonymiser',
 'Plusieurs noms, un par ligne. Anonymisé en bloc : la revue reste attestée, les présents ne sont plus nommés.'),
-- ── La cellule de crise : des personnes ET leurs coordonnées ─────────────────────────
('crise', 'nom', 'personnelle', 'Joindre un membre de la cellule de crise',
 'Intérêt légitime', 1095, 'anonymiser',
 '⚠️ La SEULE table où « nom » désigne une personne et non un objet — c''est pourquoi la liste devinée par le nom de colonne ne peut pas suffire.'),
('crise', 'suppleant', 'personnelle', 'Joindre le suppléant d''un rôle de crise',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem crise.nom.'),
('crise', 'email', 'personnelle', 'Joindre un membre de la cellule de crise',
 'Intérêt légitime', 1095, 'anonymiser',
 'Coordonnée directement identifiante. ⚠️ Elle échappait à la purge : la liste ne cherchait que des noms.'),
('crise', 'telephone', 'personnelle', 'Joindre un membre de la cellule de crise',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem crise.email.'),
-- ── L'annuaire interne ──────────────────────────────────────────────────────────────
('personnes', 'nom', 'personnelle', 'Alimenter l''autocomplétion des champs « responsable »',
 'Intérêt légitime', 1095, 'supprimer',
 'La fiche entière est SUPPRIMÉE, pas anonymisée : une fiche d''annuaire anonyme n''a aucun sens et resterait dans les suggestions.'),
('personnes', 'email', 'personnelle', 'Joindre une personne de l''annuaire',
 'Intérêt légitime', 1095, 'supprimer', 'Idem personnes.nom.'),
('personnes', 'telephone', 'personnelle', 'Joindre une personne de l''annuaire',
 'Intérêt légitime', 1095, 'supprimer', 'Idem personnes.nom.'),
-- ── Les comptes, que AUCUN motif de nom ne devine ────────────────────────────────────
('utilisateurs', 'identifiant', 'personnelle', 'Authentifier un utilisateur contre l''annuaire',
 'Contrat', 1095, 'anonymiser',
 '⚠️ Invisible d''un balayage par nom de colonne — c''est l''argument décisif pour ce registre. Le login identifie directement une personne.'),
('utilisateurs', 'upn', 'personnelle', 'Rapprocher le compte de son objet Active Directory',
 'Contrat', 1095, 'anonymiser', 'Idem identifiant : forme « prenom.nom@domaine ».'),
('utilisateurs', 'sid_ad', 'personnelle', 'Identifier le compte de façon stable malgré un renommage',
 'Contrat', 1095, 'anonymiser',
 'Identifiant technique, mais rattaché à une personne unique et durable : c''est une donnée personnelle au sens de l''article 4.1.'),
('utilisateurs', 'nom', 'personnelle', 'Afficher qui est connecté', 'Contrat', 1095, 'anonymiser', 'Nom de famille.'),
('utilisateurs', 'prenom', 'personnelle', 'Afficher qui est connecté', 'Contrat', 1095, 'anonymiser', 'Prénom.'),
('utilisateurs', 'nom_affichage', 'personnelle', 'Afficher qui est connecté',
 'Contrat', 1095, 'anonymiser', 'Nom tel que l''annuaire le rend.'),
('utilisateurs', 'email', 'personnelle', 'Adresser les relances d''échéance',
 'Contrat', 1095, 'anonymiser', 'Coordonnée directement identifiante.'),
-- ── Les tiers ───────────────────────────────────────────────────────────────────────
('prestataires', 'email', 'personnelle', 'Joindre le contact d''un prestataire',
 'Intérêt légitime', 1095, 'anonymiser',
 'Une adresse de contact désigne le plus souvent une personne physique. Classée personnelle par PRUDENCE : se tromper dans ce sens coûte une anonymisation de trop, dans l''autre une donnée oubliée.'),
('prestataires', 'telephone', 'personnelle', 'Joindre le contact d''un prestataire',
 'Intérêt légitime', 1095, 'anonymiser', 'Idem prestataires.email.'),
-- ── Les traces d'usage ──────────────────────────────────────────────────────────────
('approbations', 'acteur_libelle', 'personnelle', 'Répondre à « qui a validé ce document ? »',
 'Obligation légale', 1095, 'anonymiser',
 '⚠️ CONSTAT Q-284. Cette colonne échappait à la purge parce qu''elle ne s''appelle ni « responsable » ni « auditeur ». Le §3 ouvre au verrou d''irréversibilité la voie de l''anonymisation — la DÉCISION reste indélébile, le NOM ne l''est plus.'),
('imports', 'utilisateur_libelle', 'personnelle', 'Savoir qui a importé un jeu de données',
 'Intérêt légitime', 1095, 'anonymiser', 'Trace d''exploitation, nominative.'),
('sessions', 'agent_utilisateur', 'personnelle', 'Reconnaître un vol de session',
 'Intérêt légitime', 30, 'supprimer',
 'Empreinte de navigateur : identifiante par recoupement. Durée courte — une session expirée n''a plus rien à prouver.'),
('journal_audit', 'utilisateur_libelle', 'personnelle', 'Prouver qui a fait quoi, en audit',
 'Obligation légale', 1095, 'conserver',
 '⚠️ CONSERVÉE, ET C''EST ASSUMÉ. Le journal est INALTÉRABLE par dessein — ni mise à jour ni suppression, chaînage par empreinte. L''anonymiser casserait la chaîne et détruirait la preuve. L''article 17.3.b et 17.3.e couvrent ce cas : obligation légale, et exercice d''un droit. La rétention de trois ans est la borne, et c''est elle qui doit être annoncée à la personne concernée.'),
('journal_audit', 'adresse_ip', 'personnelle', 'Reconnaître une intrusion',
 'Obligation légale', 1095, 'conserver', 'Idem journal_audit.utilisateur_libelle.'),
-- ── Ce qui N'EST PAS une donnée personnelle, et il faut le DIRE ──────────────────────
('actifs', 'nom', 'non_personnelle', null, null, null, null, 'Nom d''un serveur, d''une application, d''un équipement.'),
('clients', 'nom', 'non_personnelle', null, null, null, null, 'Raison sociale d''un donneur d''ordre.'),
('risques', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''un risque.'),
('risque_catalogue', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''un risque du socle Groupe.'),
('processus', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''un processus métier.'),
('profils', 'nom', 'non_personnelle', null, null, null, null, 'Nom d''un profil de droits — un rôle, pas une personne.'),
('groupes_ad', 'nom', 'non_personnelle', null, null, null, null, 'Nom d''un groupe d''annuaire.'),
('mesure_catalogue', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''une mesure de sécurité.'),
('scenarios_pra', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''un scénario de continuité.'),
('traitements', 'nom', 'non_personnelle', null, null, null, null, 'Intitulé d''un traitement du registre art. 30.'),
('migrations_schema', 'nom', 'non_personnelle', null, null, null, null, 'Libellé d''une migration de schéma.'),
('parametres', 'libelle', 'non_personnelle', null, null, null, null, 'Libellé d''un paramètre d''application.'),
('imports', 'nom_fichier', 'non_personnelle', null, null, null, null,
 '⚠️ Le NOM du fichier, pas son contenu. Un fichier importé peut porter des données personnelles — elles sont alors dans les tables métier, décidées ligne par ligne ci-dessus.'),
('pieces_jointes', 'nom_fichier', 'non_personnelle', null, null, null, null, 'Idem imports.nom_fichier.'),
('filiales', 'nom_court', 'non_personnelle', null, null, null, null, 'Raison sociale abrégée d''une filiale.'),
('filiales', 'email', 'non_personnelle', null, null, null, null,
 'Coordonnée de l''ÉTABLISSEMENT (contact@filiale.example), pas d''une personne. ⚠️ Si une filiale y saisit l''adresse nominative de son RSSI, la décision devient fausse — c''est une limite du registre, et elle est dite.'),
('filiales', 'telephone', 'non_personnelle', null, null, null, null, 'Idem filiales.email.'),
-- ── Les huit que le GARDE-FOU a trouvées, et que je n'avais pas vues ─────────────────
--
-- ⚠️ **Elles valent d'être lues : je les avais toutes manquées.** Le semis avait été
-- construit sur un balayage par motif de NOM de colonne — exactement le travers que ce
-- registre existe pour corriger. Le garde-fou du §4, lui, balaie aussi les tables qui
-- EXISTENT POUR PORTER des personnes, et il a rendu ces huit-là dès la première
-- application. C'est la démonstration la plus courte de son utilité.
('crise', 'role', 'personnelle', 'Savoir qui tient quel rôle dans la cellule de crise',
 'Intérêt légitime', 1095, 'anonymiser',
 'Le rôle seul n''identifie personne — mais il ne vit que sur une ligne qui nomme quelqu''un, et le laisser derrière un nom anonymisé rendrait la personne réidentifiable dans une petite structure.'),
('crise', 'notes', 'personnelle', 'Consigner une précision utile en gestion de crise',
 'Intérêt légitime', 1095, 'signaler',
 '⚠️ SAISIE LIBRE, et le régime a été corrigé PAR UN ESSAI : déclarée « anonymiser » d''abord, elle est restée en place à la purge — le nom y est au milieu d''une phrase, et le remplacer détruirait la note. Même classe que « incidents.description » : on signale à un humain, on n''efface pas.'),
('personnes', 'fonction', 'personnelle', 'Décrire le rôle d''une personne de l''annuaire',
 'Intérêt légitime', 1095, 'supprimer', 'La fiche entière est supprimée — idem personnes.nom.'),
('personnes', 'service', 'personnelle', 'Rattacher une personne à un service',
 'Intérêt légitime', 1095, 'supprimer', 'Idem personnes.fonction.'),
('personnes', 'notes', 'personnelle', 'Consigner une précision sur une personne',
 'Intérêt légitime', 1095, 'supprimer',
 'Saisie libre attachée à une personne nommée : le cas le plus sensible de l''annuaire.'),
('sessions', 'perimetre', 'non_personnelle', null, null, null, null,
 'Instantané des droits résolus (filiales, domaines) — décrit un PÉRIMÈTRE, pas une personne. Le lien à la personne est « utilisateur_id », clé étrangère, et il part avec la session.'),
('sessions', 'motif_revocation', 'non_personnelle', null, null, null, null,
 'Motif technique de révocation (« expiration », « déconnexion »), sans saisie libre.'),
('utilisateurs', 'mot_de_passe_hash', 'personnelle', 'Authentifier le compte de secours',
 'Contrat', 1095, 'supprimer',
 '⚠️ Un SECRET, et un secret se supprime — il ne s''anonymise pas. Ne concerne que le compte de secours d''une installation sans annuaire : les comptes d''annuaire n''en portent pas.')
on conflict (table_nom, colonne) do update set
    nature        = excluded.nature,
    finalite      = excluded.finalite,
    base_legale   = excluded.base_legale,
    duree_jours   = excluded.duree_jours,
    a_expiration  = excluded.a_expiration,
    justification = excluded.justification;
-- ⚠️ `do update` et non `do nothing` : une décision CORRIGÉE doit s'appliquer au rejeu.
-- Mesuré — le régime de « crise.notes » est passé d'« anonymiser » à « signaler » après
-- qu'un essai eut montré que le nom y survivait, et un « do nothing » aurait gardé la
-- déclaration fausse en base tout en la corrigeant dans le fichier.

-- =====================================================================================
-- §3 — LE VERROU D'APPROBATION ADMET L'ANONYMISATION, JAMAIS L'EFFACEMENT
-- =====================================================================================
--
--  ⚠️ **C'est la pièce qui résout le conflit du constat Q-284, et elle mérite d'être lue.**
--
--  Deux invariants du produit s'opposaient :
--
--    · **l'irréversibilité** (lot L8) : une décision d'approbation ne se modifie ni ne
--      s'efface, y compris en SQL, y compris pour l'administrateur. C'est ce qui fait qu'un
--      circuit d'approbation prouve quelque chose ;
--    · **le droit à l'effacement** (RGPD art. 17) : une personne peut demander que son nom
--      disparaisse.
--
--  La tentative de les concilier par la recette de D2 — un relais qui SUPPRIME les
--  approbations orphelines — a été **mesurée impossible** : le verrou la refuse, et le
--  relais aurait fait échouer toute suppression en cascade d'un objet portant une décision.
--
--  **La bonne réponse n'était pas de supprimer, c'était de distinguer.** Ce qui doit être
--  indélébile, c'est la DÉCISION : l'étape, son ordre, son verdict, sa date. Le NOM de la
--  personne, lui, est une donnée personnelle soumise à une durée — et l'article 17.3 ne le
--  protège que le temps où il sert à établir un droit.
--
--  Le verrou refuse donc désormais **tout changement de la décision**, et **admet** la seule
--  écriture qui ne touche qu'à l'identité. Une anonymisation ne peut pas s'en servir pour
--  réécrire un verdict : les colonnes qui portent la décision sont comparées une à une.
-- =====================================================================================

create or replace function f_approbations_verrou_decision() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_statut          text := old.statut;
    v_anonymisation   boolean;
begin
    if v_statut in ('approuve', 'refuse') then
        if tg_op = 'UPDATE' then
            -- L'écriture ne touche-t-elle QUE l'identité de l'acteur ? Les colonnes qui
            -- portent la décision sont comparées une à une : rien d'autre ne peut bouger.
            v_anonymisation :=
                    new.statut         is not distinct from old.statut
                and new.etape          is not distinct from old.etape
                and new.ordre          is not distinct from old.ordre
                and new.objet_type     is not distinct from old.objet_type
                and new.objet_id       is not distinct from old.objet_id
                and new.date_decision  is not distinct from old.date_decision
                and new.commentaire    is not distinct from old.commentaire
                and new.filiale_id     is not distinct from old.filiale_id
                and new.version_objet  is not distinct from old.version_objet
                and new.empreinte_objet is not distinct from old.empreinte_objet
                -- …et elle doit ANONYMISER, pas renommer : l'acteur part, il n'est pas
                -- remplacé par quelqu'un d'autre.
                and new.acteur_id is null
                and coalesce(new.acteur_libelle, '') = '';
            if v_anonymisation then
                return new;
            end if;
        end if;
        raise exception
            'Étape d''approbation déjà tranchée (%) : la décision est irréversible.', v_statut
            using errcode = 'GRC02',
                  hint    = 'Créez une nouvelle version de l''objet : le circuit repart du début. '
                            'Voir backend/db/CONVENTIONS.md §15. ⚠️ Une ANONYMISATION est admise '
                            '— elle retire l''acteur sans toucher à la décision, et c''est ce qui '
                            'permet au produit de répondre à une demande d''effacement RGPD sans '
                            'détruire la preuve que le circuit a eu lieu (constat Q-284).';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

comment on function f_approbations_verrou_decision() is
    'Refuse (GRC02) toute modification ou suppression d''une étape d''approbation tranchée — '
    'à UNE exception, ajoutée par la migration 026 : l''ANONYMISATION, c''est-à-dire une '
    'écriture qui met « acteur_id » à NULL et vide « acteur_libelle » SANS toucher à quoi '
    'que ce soit de la décision (statut, étape, ordre, objet, date, commentaire, empreinte). '
    'C''est ce qui réconcilie l''irréversibilité du lot L8 et le droit à l''effacement : la '
    'décision reste indélébile, le nom ne l''est plus. Une étape « annule » reste modifiable.';

-- =====================================================================================
-- §4 — LE GARDE-FOU : une colonne non décidée fait rougir
-- =====================================================================================

create or replace function f_verifier_colonnes_personnelles()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    /* ── SENS 1 : une colonne CANDIDATE non décidée ──────────────────────────────────
       Deux familles de candidates, et il en faut deux :
         (a) toute colonne textuelle dont le NOM désigne une personne — c'est ce que la
             purge cherchait, et cela couvre la plupart des cas ;
         (b) toute colonne textuelle des tables qui EXISTENT POUR PORTER des personnes.
             Sans (b), `utilisateurs.identifiant`, `upn` et `sid_ad` échappaient à tout —
             c'est la mesure qui a justifié ce registre.
       ⚠️ La liste des tables de (b) est écrite à la main, et c'est le cas (a) du
       `CLAUDE.md` §3 : son incomplétude ÉCHOUE BRUYAMMENT ici même, puisqu'une table qui
       s'y ajoute fait apparaître ses colonnes comme non décidées. */
    for r in
        select c.relname::text as table_nom, a.attname::text as colonne
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where c.relkind = 'r'
           and format_type(a.atttypid, a.atttypmod) = 'text'
           and c.relname <> 'colonnes_personnelles'
           and a.attname not in ('cree_par', 'modifie_par')     -- traçabilité : §5 ci-dessous
           and ( a.attname ~ '(responsable|proprietaire|auditeur|participants|suppleant|acteur|prenom|email|telephone|^nom$|nom_court|nom_affichage|libelle|identifiant|^upn$|sid_ad|adresse_ip|agent_utilisateur)'
                 or c.relname in ('utilisateurs', 'personnes', 'crise', 'sessions') )
           and not exists (select 1 from colonnes_personnelles p
                            where p.table_nom = c.relname and p.colonne = a.attname)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'colonne_personnelle_non_decidee';
        detail   := 'Cette colonne textuelle peut porter une donnée personnelle, et le '
                    'registre « colonnes_personnelles » ne dit RIEN d''elle. Décidez : '
                    '« personnelle » — avec sa finalité, sa base légale, sa durée et ce '
                    'qu''on en fait à l''expiration — ou « non_personnelle », avec sa '
                    'justification. ⚠️ « Non personnelle » est une réponse recevable ; ne '
                    'pas répondre ne l''est pas : la purge RGPD laisserait alors la donnée '
                    'en place en annonçant « terminé ».';
        return next;
    end loop;

    /* ── SENS 2 : une entrée du registre qui ne désigne plus rien ────────────────────
       Une colonne renommée ou retirée laisserait une déclaration orpheline : le registre
       dirait couvrir ce qui n'existe plus, et l'on croirait la question réglée. */
    for r in
        select p.table_nom, p.colonne
          from colonnes_personnelles p
         where not exists (
                 select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
                   join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
                                      and not a.attisdropped
                  where c.relname = p.table_nom and a.attname = p.colonne)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'declaration_personnelle_orpheline';
        detail   := 'Le registre déclare cette colonne, et elle n''existe plus dans le '
                    'schéma. Une déclaration orpheline donne à croire qu''une question est '
                    'réglée : retirez-la, ou rétablissez la colonne.';
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_colonnes_personnelles() is
    'DANS LES DEUX SENS : toute colonne textuelle susceptible de porter une donnée '
    'personnelle est DÉCIDÉE au registre, et toute déclaration du registre désigne une '
    'colonne qui existe. ⚠️ Les colonnes de traçabilité « cree_par » / « modifie_par » sont '
    'hors balayage : elles portent un LOGIN, déjà couvert par utilisateurs.identifiant, et '
    'les inscrire une par table ferait quarante-quatre déclarations qui disent la même '
    'chose — un registre illisible cesse d''être lu.';

grant execute on function f_verifier_colonnes_personnelles() to grc_app;

-- =====================================================================================
-- §4 bis — LA COUVERTURE RLS ADMET LE REGISTRE, ET LE DIT
-- =====================================================================================
--
--  ⚠️ **Réémission de `f_verifier_couverture_rls()`, et c'est le motif du §23 des
--  conventions** : une migration appliquée ne se réécrit jamais, elle se corrige dans la
--  suivante. C'est exactement ce que la `005` avait fait de la `004`, et pour la même
--  raison — ajouter une table à `v_sans_filiale_admises`.
--
--  La fonction ci-dessous est **reprise telle qu'elle est appliquée** (`pg_get_functiondef`,
--  pas une recopie de fichier), avec **une seule différence** : `colonnes_personnelles` y
--  entre, avec son motif. ⚠️ C'est la liste écrite à la main du `CLAUDE.md` §3, cas (a) :
--  une table qui apparaît fait rougir deux contrôles, et un humain doit dire si elle porte
--  la même chose pour tout le groupe. Ici, la réponse est oui — et elle est écrite.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_couverture_rls()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- ── LA LISTE EST INVERSÉE DEPUIS LE CONSTAT Q-5 (CONVENTIONS.md §19.5) ───────────
    --
    -- Elle énumérait « les six tables de liaison sans filiale_id » qui devaient être
    -- cloisonnées par leur seule politique. Il y en avait SEPT : import_erreurs manquait
    -- à l'appel, et échappait donc entièrement au garde-fou. Rejoué à la porte S1 : sa
    -- politique de lecture ramenée à « using (true) » ne remontait AUCUNE anomalie, sur
    -- une table dont la migration 003 dit elle-même qu'« une ligne d'erreur cite le
    -- contenu du fichier importé, c'est donc de la donnée de filiale » — un import de
    -- l'annuaire des personnes ou du registre RGPD y dépose des noms verbatim.
    --
    -- C'était la troisième fois qu'une liste écrite à la main produisait un défaut. Le
    -- sens de lecture est donc renversé : le garde-fou DÉCOUVRE dans le catalogue les
    -- tables qui ne portent pas de filiale_id, et EXIGE de chacune un prédicat
    -- cloisonnant, SAUF si elle figure nommément ci-dessous. Une table future oubliée est
    -- désormais réclamée bruyamment au lieu d'être exemptée en silence : le défaut par
    -- défaut est fermé, plus ouvert.
    --
    -- Les tables sans filiale_id dont l'absence de cloisonnement est LÉGITIME et motivée.
    -- Elles sont de niveau Groupe, ou lues avant que le périmètre existe (§6).
    v_sans_filiale_admises constant text[] := array[
        -- ── AJOUTÉE PAR 005_controles_schema.sql, ET C'EST LA SEULE DIFFÉRENCE ─────
        -- avec la version posée par 004 (le reste de cette fonction est recopié
        -- verbatim : une migration appliquée ne se réécrit pas, elle se corrige dans
        -- la suivante — CONVENTIONS.md §23).
        --
        -- controles_schema est un REGISTRE TECHNIQUE, de même nature que
        -- migrations_schema : il garde la dernière observation des garde-fous du
        -- schéma. Il ne contient aucune donnée de filiale — un nom de fonction et sa
        -- signature — et il est lu par f_verifier_schema() AVANT que le périmètre
        -- existe, à chaque migration et à chaque installation. Son écriture n'est pas
        -- tenue par une politique mais par les PRIVILÈGES : le rôle applicatif n'a que
        -- « select » dessus (§2 de cette migration), et f_verifier_privileges() le
        -- vérifie désormais à chaque déploiement.
        -- ── AJOUTÉE PAR 026_registre_des_donnees_personnelles.sql ────────────────
        -- `colonnes_personnelles` est un REGISTRE TECHNIQUE de même nature que
        -- `controles_schema` : il dit, colonne par colonne, quelles données
        -- personnelles LE PRODUIT détient, pourquoi, et pour combien de temps. Il ne
        -- porte aucune donnée de filiale — un nom de table, un nom de colonne, une
        -- finalité, une base légale — et il doit être lisible AVANT que le périmètre
        -- existe : la purge RGPD le lit pour savoir quoi anonymiser, et le garde-fou
        -- f_verifier_colonnes_personnelles() le lit à chaque migration. Son écriture
        -- est fermée par les PRIVILÈGES, pas par un prédicat : le rôle applicatif n'a
        -- que « select » dessus.
        'colonnes_personnelles',
        'controles_schema',
        'filiales',           -- définit la frontière elle-même ; lue avant tout périmètre
        'utilisateurs',       -- identités ; lues pour RÉSOUDRE le périmètre
        'profils',            -- définition des profils métier (niveau Groupe)
        'profil_domaines',    -- droits d'un profil par domaine (niveau Groupe)
        'migrations_schema',  -- registre technique ; écriture fermée par les privilèges
        'sessions',           -- produit le périmètre : sa LECTURE reste non cloisonnée,
                              -- son ÉCRITURE est fermée depuis 007 (f_authentification)
        'session_domaines',   -- idem ; l'exemption ne porte plus que sur la lecture
        'mappings',           -- catalogue de correspondances, niveau Groupe (§16.4)
        -- mapping_exigences : n'est PAS cloisonnable, et la traiter comme les six
        -- liaisons serait une erreur de fait. Son parent (mappings) est de niveau GROUPE,
        -- et son autre extrémité est le couple (ref_id, code) du catalogue statique de
        -- référentiels, qui n'est pas en base. Aucune de ses deux extrémités n'appartient
        -- à une filiale : elle ne peut, par construction, porter aucun lien
        -- inter-filiales. Dérogée EN CONNAISSANCE DE CAUSE — la dérogation ne porte que
        -- sur la LECTURE ; son écriture est réservée à l'administration Groupe depuis le
        -- constat M-4 de la porte S2, et c'est arbitré par écrit au §6.
        'mapping_exigences'
    ];

    -- Dérogations documentées à l'exigence « prédicat non trivial » pour des tables qui
    -- PORTENT, elles, un filiale_id (voir §6). Toute AUTRE table porteuse d'un filiale_id
    -- dont la politique dirait « true » fait échouer la vérification : c'est ce qui
    -- interdit à une migration future d'ouvrir une table en grand par inadvertance.
    v_derogations constant text[] := array[
        'groupes_ad',       -- aiguillage de l'authentification, lu AVANT tout périmètre
        'journal_audit',    -- chaînage : la numérotation exige de voir la chaîne entière
        'session_filiales'  -- c'est la table qui PRODUIT le périmètre ; le filtrer par
                            -- lui-même rendrait toute connexion impossible
    ];
    v_nom text;
    r record;
begin
    for r in
        select c.oid,
               c.relname::text                                             as nom,
               c.relrowsecurity                                            as rls,
               c.relforcerowsecurity                                       as forcee,
               exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)         as porte_filiale
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         -- « r » ET « p » : le commentaire de cette fonction dit « TOUTE table du schéma
         -- public », et le §0 de ce fichier pense déjà à relkind in ('r','p','v','m') pour
         -- le contrôle de propriété. Une table partitionnée échappait ici au balayage —
         -- constat T-11 du troisième passage. Il n'y en a aucune aujourd'hui ; le filet ne
         -- doit pas attendre la première.
         where n.nspname = 'public' and c.relkind in ('r', 'p')
         order by c.relname
    loop
        objet := r.nom;

        if not r.rls then
            anomalie := 'rls_desactivee';
            detail   := 'la table n''a pas « enable row level security » : ses lignes sont '
                        'visibles de toutes les filiales';
            return next;
        end if;

        if not r.forcee then
            anomalie := 'force_absente';
            detail   := 'la table n''a pas « force row level security » : le propriétaire des '
                        'tables échappe aux politiques';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*'))
        then
            anomalie := 'politique_lecture_absente';
            detail   := 'aucune politique permissive de lecture : la table est illisible, ou le '
                        'sera dès qu''une politique d''écriture existera';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*'))
        then
            anomalie := 'politique_ecriture_absente';
            detail   := 'aucune politique permissive d''écriture : toute écriture est refusée '
                        'sans que rien ne le dise';
            return next;
        end if;

        -- Une politique de lecture ne doit JAMAIS dépendre d'un réglage d'administration :
        -- ce serait un moyen, pour un réglage de session, d'élargir la LECTURE.
        if exists (
            select 1 from pg_policy p
             where p.polrelid = r.oid and p.polcmd in ('r', '*')
               and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_administration_groupe%')
        then
            anomalie := 'drapeau_administration_en_lecture';
            detail   := 'une politique de lecture mentionne f_administration_groupe() : un '
                        'réglage de session élargirait la LECTURE, ce que le §2 interdit';
            return next;
        end if;

        -- Politiques qui ne CONSULTENT PAS le périmètre, sur une table qui porte, elle,
        -- une filiale. La détection ne compare plus le prédicat au littéral « true » : elle
        -- exige qu'il MENTIONNE la fonction de périmètre correspondante. Voir la portée
        -- exacte, et ses limites, dans le commentaire de la fonction.
        -- Une table est SOUMISE au cloisonnement si elle porte un filiale_id, ou si elle
        -- n'en porte pas SANS figurer dans la liste des exemptions motivées. Le second
        -- membre est la découverte : ce n'est plus une liste de tables à couvrir, c'est
        -- une liste de tables à NE PAS couvrir, et tout le reste l'est d'office.
        if (r.porte_filiale or not (r.nom = any (v_sans_filiale_admises)))
           and not (r.nom = any (v_derogations)) then
            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*')
                   and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                       !~ '(f_filiales_lecture|f_filiales_autorisees)')
            then
                anomalie := 'lecture_non_cloisonnee';
                detail   := 'une politique de lecture ne consulte pas le périmètre de la session '
                            '(ni f_filiales_lecture, ni f_filiales_autorisees) sur une table '
                            'cloisonnée : toutes les filiales se lisent entre elles. Si la table '
                            'ne porte pas de filiale_id et relève réellement du niveau Groupe, '
                            'elle doit être DÉCLARÉE dans v_sans_filiale_admises, avec son motif';
                return next;
            end if;

            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*')
                   and coalesce(
                           case p.polcmd
                               when 'a' then pg_get_expr(p.polwithcheck, p.polrelid)
                               when 'd' then pg_get_expr(p.polqual, p.polrelid)
                               else coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                             pg_get_expr(p.polqual, p.polrelid))
                           end, 'true') !~ 'f_filiale_ecriture')
            then
                anomalie := 'ecriture_non_cloisonnee';
                detail   := 'une politique d''écriture ne consulte pas la filiale ACTIVE '
                            '(f_filiale_ecriture) sur une table cloisonnée : une filiale peut '
                            'écrire chez une autre. Si la table ne porte pas de filiale_id et '
                            'relève réellement du niveau Groupe, elle doit être DÉCLARÉE dans '
                            'v_sans_filiale_admises, avec son motif';
                return next;
            end if;
        end if;
    end loop;

    -- Les deux listes écrites à la main ne désignent que des EXEMPTIONS ; le §19.5
    -- n'admet une liste écrite que si le garde-fou vérifie qu'elle reste juste. Une
    -- exemption qui ne désigne plus rien — table supprimée, table renommée — dispenserait
    -- silencieusement de cloisonnement la prochaine table qui reprendrait ce nom.
    foreach v_nom in array v_sans_filiale_admises || v_derogations loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'table dispensée de cloisonnement par f_verifier_couverture_rls(), '
                        'mais introuvable dans le schéma : la dérogation ne porte plus sur '
                        'rien et couvrirait toute table future qui reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;

$function$;



-- =====================================================================================
-- §5 — CONSIGNATION ET VÉRIFICATION
-- =====================================================================================

do $$
declare v_mouvements text;
begin
    select string_agg(format('%s : %s', garde_fou, mouvement), ', ')
      into v_mouvements from f_consigner_controles_schema();
    if v_mouvements is not null then
        raise notice 'Registre des garde-fous : %', v_mouvements;
    end if;
end;
$$;

do $$
declare v_anomalies text; v_nombre integer; v_decidees integer; v_perso integer;
begin
    select count(*) filter (where true), count(*) filter (where nature = 'personnelle')
      into v_decidees, v_perso from colonnes_personnelles;
    raise notice 'Registre des données personnelles : % colonne(s) décidée(s), dont % personnelle(s).',
                 v_decidees, v_perso;

    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 026 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, registre des données personnelles compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('026', 'le produit sait quelles données personnelles il détient — registre par '
               'colonne, verrou d''approbation ouvert à l''anonymisation (RGPD, constat Q-284)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_colonnes_personnelles();
--   drop table if exists colonnes_personnelles;
--   delete from controles_schema where fonction = 'f_verifier_colonnes_personnelles';
--   delete from migrations_schema where version = '026';
--   -- ⚠️ Le §3 (verrou ouvert à l'anonymisation) ne s'annule PAS ici : rétablir la
--   --    rédaction d'origine se fait en rejouant le §2 de la migration 001.
--   commit;
-- =====================================================================================
