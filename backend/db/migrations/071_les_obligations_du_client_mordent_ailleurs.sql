-- =====================================================================================
--  071 — CE QUE LE DONNEUR D'ORDRE IMPOSE MORD AILLEURS QUE SUR SA PROPRE FICHE
--
--  §1  Le rang des niveaux de diffusion, à UN SEUL endroit
--  §2  Un document peut appartenir à un donneur d'ordre — et son plancher MORD
--  §3  Un incident peut toucher les données d'un donneur d'ordre
--  §4  La notification au client entre dans l'horloge, avec SON délai contractuel
--  §5  Une demande d'exercice de droits peut venir d'un donneur d'ordre
--  §6  Le registre de l'article 30 du produit lui-même
--  §7  Le garde-fou, qui ÉPROUVE
--  §8  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  La `070` a donné au donneur d'ordre son identité, son contrat et le registre de
--  l'article 30 §2. Elle n'a rien fait respecter.
--
--  🛑 **LA DEMANDE DU RSSI NE S'ARRÊTAIT PAS À L'ÉCRAN** : *« et que après soit respecté
--  dans le reste du logiciel »*. C'est la clause la plus exigeante des deux, et c'est elle
--  qui fait la différence entre un écran de plus et une propriété du produit. Sans cette
--  migration, le dossier remis au client serait exact **le jour où on l'imprime**, et rien
--  n'empêcherait le produit de le contredire le lendemain.
--
--  C'est la règle que ce chantier a payée le plus souvent : *une capacité qu'aucun écran
--  n'appelle est une capacité absente* — et sa jumelle, *une exigence que rien ne fait
--  respecter est une exigence affichée.*
--
--  ── LES CINQ BRANCHEMENTS, ET POURQUOI CHACUN EST EN BASE ────────────────────────
--
--  **(1) La classification.** Un donneur d'ordre déclare un plancher de diffusion
--  (ISO 27001 5.12). Un document qui lui appartient ne peut pas descendre en dessous.
--  ⚠️ **En base et non à l'écran** : le moteur d'import du lot L7 écrit sans passer par un
--  écran, et la route de reprise aussi. Une barrière d'écran se contourne par un fichier.
--
--  **(2) Les incidents.** Un incident peut toucher les données d'un client. Le RGPD
--  art. 33 §2 nous oblige, comme sous-traitant, à le notifier au responsable de
--  traitement « dans les meilleurs délais » ; le contrat, lui, dit un nombre d'heures.
--
--  **(3) L'horloge.** Ce délai contractuel est souvent **24 h**, donc plus court que les
--  72 h de NIS2 : c'est lui qui commande le premier geste. 🛑 **Il n'entre PAS dans
--  `f_echeances_reglementaires()`** — cette fonction rend exactement quatre paliers, et son
--  garde-fou le MESURE (à juste titre : la loi en impose quatre, pas cinq). Une fonction
--  SŒUR le calcule, avec le délai en paramètre, parce qu'il vient d'un contrat et non d'un
--  texte. *Le calcul reste à un seul endroit par régime.*
--
--  **(4) Les demandes d'exercice de droits.** Comme sous-traitant, nous ne répondons pas à
--  la personne concernée : nous **assistons** le responsable de traitement (art. 28 §3 e).
--  Une demande peut donc désigner le donneur d'ordre qui l'a transmise.
--
--  **(5) Les sous-traitants ultérieurs** sont déjà branchés par la `070` §4.
--
--  ── POURQUOI PAS DE COLONNE DÉRIVÉE « client_filiale_id » ────────────────────────
--
--  La migration `030` a dû construire, pour `documents.traitement_id`, tout un dispositif :
--  une colonne posée par déclencheur, une colonne engendrée, deux clés étrangères et deux
--  `check`. Motif : `traitements` est une table **MIXTE**, « même filiale OU cible de portée
--  Groupe » est une **disjonction**, et une disjonction n'est pas une clé étrangère
--  (constat Q-294).
--
--  ⚠️ **Rien de tout cela n'est nécessaire ici, et il faut dire pourquoi plutôt que de le
--  recopier par mimétisme** : `clients` n'est **jamais** de portée Groupe — arbitrage de la
--  `002` §1, reconfirmé par l'utilisateur le 24/09/2026. Il n'y a donc aucune disjonction à
--  exprimer et rien à dériver. Un `check (client_id is null or filiale_id is not null)`
--  suffit, et c'est lui qui garantit que la clé composite `MATCH SIMPLE` n'a jamais à
--  traiter le cas où `filiale_id` est nul (`CONVENTIONS.md` §45).
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION, ET IL A ÉTÉ PAYÉ SUR LE DÉPLOIEMENT
-- -------------------------------------------------------------------------------------
-- 🛑 **CETTE MIGRATION PASSAIT SUR UNE BASE VIDE ET ÉCHOUAIT SUR LA RECETTE.** C'est
--    exactement le `CONVENTIONS.md` §42 : *le banc migre des bases VIDES*, et une
--    migration qui n'a jamais rencontré une seule ligne n'a pas été éprouvée.
--
--    Le mécanisme : les quatre `add constraint` du §2, §3, §4 et §5 font **valider les
--    lignes existantes** par PostgreSQL, qui BALAIE donc `documents`, `incidents`,
--    `declarations_reglementaires` et `demandes_droits`. `force row level security`
--    s'appliquant au propriétaire lui-même, ce balayage passe par les politiques de
--    lecture, qui appellent `f_filiales_lecture()`. Sans réglage : **GRC04, « Périmètre
--    non positionné »**, sur une machine qui porte des données — et pas un mot sur une
--    base neuve.
--
-- ⚠️ On déclare le groupe **ENTIER**, et un périmètre partiel serait PIRE que pas de
--    périmètre : les clés se valideraient sur les seules lignes visibles, **en silence**.
--    C'est le motif exact du §0 de la migration `012`, et il se reposera à chaque
--    migration qui ajoute une contrainte à une table cloisonnée non vide.
--
-- `set_config(…, true)` vaut `set local` : les deux réglages meurent avec la transaction.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-071', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LE RANG DES NIVEAUX DE DIFFUSION, À UN SEUL ENDROIT
-- =====================================================================================
-- ⚠️ Le vocabulaire des quatre niveaux est **ordonné**, et cet ordre n'était écrit nulle
--    part : la `027` pose les quatre valeurs, aucune ligne du dépôt ne dit que
--    « confidentiel » est au-dessus d'« interne ». Un plancher exige un ordre. Il est
--    déclaré ici, **en base**, et le §7 l'ÉPROUVE — le recopier en TypeScript en ferait une
--    seconde source (constat Q-219).

create or replace function f_rang_confidentialite(p_niveau text)
returns integer
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case p_niveau
             when 'public'       then 1
             when 'interne'      then 2
             when 'confidentiel' then 3
             when 'restreint'    then 4
             else null
           end;
$$;

comment on function f_rang_confidentialite(text) is
    'Le RANG d''un niveau de diffusion : public 1 < interne 2 < confidentiel 3 < '
    'restreint 4. ⚠️ Cet ordre n''était écrit NULLE PART avant la migration 071 — la 027 '
    'pose les quatre valeurs, pas leur hiérarchie —, et un plancher de classification n''a '
    'aucun sens sans lui. Rend NULL sur une valeur inconnue, ce qui fait échouer toute '
    'comparaison plutôt que de la faire réussir au hasard.';

revoke all on function f_rang_confidentialite(text) from public;
grant execute on function f_rang_confidentialite(text) to grc_app, grc_lecture;

-- =====================================================================================
-- §2 — UN DOCUMENT PEUT APPARTENIR À UN DONNEUR D'ORDRE — ET SON PLANCHER MORD
-- =====================================================================================

alter table documents add column if not exists client_id id_metier;

-- ⚠️ `documents` est MIXTE : `filiale_id` y est NULLABLE, et « nul » veut dire portée
--    Groupe. Un donneur d'ordre, lui, est TOUJOURS local. Un document de portée Groupe ne
--    peut donc appartenir à aucun donneur d'ordre — et sans ce `check`, la clé composite
--    `MATCH SIMPLE` ne vérifierait RIEN dans ce cas (§45).
alter table documents drop constraint if exists ck_documents_client_local;
alter table documents add constraint ck_documents_client_local
    check (client_id is null or filiale_id is not null);

alter table documents drop constraint if exists fk_documents_client;
-- ⚠️ `on delete set null (client_id)` — LA LISTE DE COLONNES N'EST PAS UN ORNEMENT, et
--    c'est le garde-fou `f_verifier_set_null_composites()` (§43, né de la migration 046)
--    qui a refusé cette migration à sa première écriture. Sans la liste, PostgreSQL met à
--    null TOUTES les colonnes de la clé — `filiale_id` comprise, qui est `not null` sur
--    toute table cloisonnée. Effet réel : la purge de `POST /api/reprise` en mode
--    « remplacer » balaie les tables cloisonnées, donc **toute restauration de sauvegarde
--    tombe en 23502** — et rien ne le dit tant qu'aucun donneur d'ordre référencé n'est
--    supprimé. Le schéma se crée, les gardes passent, les écrans marchent.
alter table documents add constraint fk_documents_client
    foreign key (client_id, filiale_id) references clients (id, filiale_id)
    on delete set null (client_id);

create index if not exists ix_documents_client on documents (client_id)
    where client_id is not null;

comment on column documents.client_id is
    'Le donneur d''ordre à qui ce document appartient, quand il en a un. ⚠️ Un document de '
    'portée Groupe n''en a jamais : un donneur d''ordre est toujours local (migration 002 '
    '§1), d''où ck_documents_client_local. ⚠️ « on delete set null » et non « cascade » : '
    'perdre un client ne doit pas détruire une procédure qu''on a écrite pour lui et qui '
    'décrit encore ce qu''on a fait — la trace survit au contrat.';

-- ── LE PLANCHER DE DIFFUSION, POSÉ EN BASE ──────────────────────────────────────────
create or replace function f_document_respecte_le_plancher() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_plancher text;
    v_rang_p   integer;
    v_rang_d   integer;
begin
    if new.client_id is null then
        return new;
    end if;

    -- La lecture passe par la RLS, et c'est voulu : un donneur d'ordre invisible depuis le
    -- périmètre courant n'est pas lu, et la clé étrangère refusera de son côté. On ne
    -- fabrique pas ici un oracle d'existence inter-filiales.
    select c.confidentialite_plancher into v_plancher
      from clients c
     where c.id = new.client_id and c.filiale_id = new.filiale_id;

    if v_plancher is null then
        return new;   -- aucun plancher contractuel connu : rien à opposer.
    end if;

    v_rang_p := f_rang_confidentialite(v_plancher);
    v_rang_d := f_rang_confidentialite(new.confidentialite);

    if v_rang_d is null or v_rang_p is null then
        raise exception
            'Niveau de diffusion inconnu : document « % », plancher du client « % ».',
            new.confidentialite, v_plancher
            using errcode = '23514', hint =
                  'Les quatre niveaux sont public, interne, confidentiel, restreint.';
    end if;

    if v_rang_d < v_rang_p then
        raise exception
            'Ce document est classé « % » alors que le donneur d''ordre % impose au '
            'minimum « % ».', new.confidentialite, new.client_id, v_plancher
            using errcode = '23514',
                  hint = 'Relevez la classification du document, ou corrigez le plancher '
                         'contractuel sur la fiche du donneur d''ordre. Le plancher vient '
                         'du contrat : le baisser est une décision, pas une correction.';
    end if;

    return new;
end;
$$;

comment on function f_document_respecte_le_plancher() is
    'Un document rattaché à un donneur d''ordre ne peut pas être classé SOUS le plancher '
    'de diffusion que ce client impose (ISO 27001 5.12). ⚠️ En base et non à l''écran : le '
    'moteur d''import du lot L7 et la route de reprise écrivent sans passer par un écran, '
    'et une barrière d''écran se contourne par un fichier. ⚠️ Silencieux quand le client '
    'n''a déclaré aucun plancher : l''absence d''exigence contractuelle n''est pas une '
    'exigence de niveau « public ».';

-- 🛑 DÉCLENCHEUR DE CONTRAINTE **DIFFÉRÉ**, ET C'EST LA LEÇON DES CONSTATS Q-194, Q-280 ET
--    Q-284, PAYÉE QUATRE FOIS : *restaurer une sauvegarde gagne.* Une barrière immédiate
--    refuserait une reprise « remplacer » parfaitement saine, pour la seule raison que le
--    document arrive avant le client dans l'ordre d'insertion. Différée, elle laisse la
--    transaction poser ses deux lignes et juge à la fin — même issue sur un état incohérent,
--    aucun faux refus sur un état cohérent.
drop trigger if exists trg_documents_plancher_client on documents;
create constraint trigger trg_documents_plancher_client
    after insert or update of client_id, confidentialite, filiale_id on documents
    deferrable initially deferred
    for each row execute function f_document_respecte_le_plancher();

-- ── ET LE PLANCHER NE PEUT PAS ÊTRE RELEVÉ EN LAISSANT DES DOCUMENTS DESSOUS ────────
-- 🛑 **SANS CECI, LE PLANCHER SERAIT UNE PROMESSE QU'UN SEUL `UPDATE` DÉFAIT EN SILENCE.**
--    Le déclencheur du dessus garde l'écriture des DOCUMENTS ; rien ne gardait l'écriture du
--    CLIENT. Un administrateur relevant le plancher à « restreint » aurait obtenu un
--    contrat affiché comme tenu, avec des documents « interne » dessous — et le dossier
--    remis au client l'aurait affirmé. C'est la classe *« on a corrigé un sens, pas la
--    propriété »*, et elle est revenue sept fois sur ce chantier.
create or replace function f_plancher_client_reste_tenu() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_sous integer;
begin
    if new.confidentialite_plancher is null then
        return new;
    end if;
    if old.confidentialite_plancher is not null
       and f_rang_confidentialite(new.confidentialite_plancher)
           <= f_rang_confidentialite(old.confidentialite_plancher) then
        return new;   -- on n'exige pas plus qu'avant : rien à revérifier.
    end if;

    select count(*) into v_sous
      from documents d
     where d.client_id = new.id
       and d.filiale_id = new.filiale_id
       and f_rang_confidentialite(d.confidentialite)
           < f_rang_confidentialite(new.confidentialite_plancher);

    if v_sous > 0 then
        raise exception
            'Le plancher « % » ne peut pas être posé : % document(s) de ce donneur '
            'd''ordre sont classés en dessous.', new.confidentialite_plancher, v_sous
            using errcode = '23514',
                  hint = 'Reclassez ces documents d''abord. Poser le plancher sans les '
                         'reclasser afficherait au client une exigence contractuelle que '
                         'le produit ne tient pas — ce qui est pire que de ne rien '
                         'afficher.';
    end if;

    return new;
end;
$$;

comment on function f_plancher_client_reste_tenu() is
    'Relever le plancher de diffusion d''un donneur d''ordre est REFUSÉ tant que des '
    'documents lui appartenant sont classés en dessous. 🛑 Sans cette moitié, le plancher '
    'serait une promesse qu''un seul UPDATE défait en silence : le contrat s''afficherait '
    'comme tenu, et le dossier remis au client l''affirmerait. Le BAISSER reste libre — '
    'c''est une décision contractuelle, et elle ne met aucun document en défaut.';

drop trigger if exists trg_clients_plancher_tenu on clients;
create constraint trigger trg_clients_plancher_tenu
    after update of confidentialite_plancher on clients
    deferrable initially deferred
    for each row execute function f_plancher_client_reste_tenu();

-- =====================================================================================
-- §3 — UN INCIDENT PEUT TOUCHER LES DONNÉES D'UN DONNEUR D'ORDRE
-- =====================================================================================

alter table incidents add column if not exists client_id id_metier;

-- `incidents.filiale_id` est NOT NULL : les deux colonnes de la clé composite sont donc
-- non nulles dès que `client_id` l'est, et la vérification a toujours lieu (§45).
alter table incidents drop constraint if exists fk_incidents_client;
-- ⚠️ `on delete set null (client_id)` — LA LISTE DE COLONNES N'EST PAS UN ORNEMENT, et
--    c'est le garde-fou `f_verifier_set_null_composites()` (§43, né de la migration 046)
--    qui a refusé cette migration à sa première écriture. Sans la liste, PostgreSQL met à
--    null TOUTES les colonnes de la clé — `filiale_id` comprise, qui est `not null` sur
--    toute table cloisonnée. Effet réel : la purge de `POST /api/reprise` en mode
--    « remplacer » balaie les tables cloisonnées, donc **toute restauration de sauvegarde
--    tombe en 23502** — et rien ne le dit tant qu'aucun donneur d'ordre référencé n'est
--    supprimé. Le schéma se crée, les gardes passent, les écrans marchent.
alter table incidents add constraint fk_incidents_client
    foreign key (client_id, filiale_id) references clients (id, filiale_id)
    on delete set null (client_id);

create index if not exists ix_incidents_client on incidents (client_id)
    where client_id is not null;

comment on column incidents.client_id is
    'Le donneur d''ordre dont les données sont touchées par cet incident, s''il y en a un. '
    '⚠️ Il ARME une obligation : le RGPD art. 33 §2 impose au sous-traitant de notifier le '
    'responsable de traitement, et le contrat en fixe le délai en heures '
    '(clients.notification_incident_h). ⚠️ « on delete set null » : la fiche d''incident '
    'reste, même si le contrat s''achève — c''est une pièce de la chaîne de preuve.';

-- =====================================================================================
-- §4 — LA NOTIFICATION AU CLIENT ENTRE DANS L'HORLOGE, AVEC SON DÉLAI CONTRACTUEL
-- =====================================================================================
-- 🛑 **ELLE N'ENTRE PAS DANS `f_echeances_reglementaires()`, ET C'EST DÉLIBÉRÉ.** Son
--    garde-fou exige que cette fonction rende EXACTEMENT quatre paliers — trois NIS2 et un
--    RGPD — et il a raison : la loi en impose quatre. Y ajouter un cinquième palier
--    contractuel ferait rougir le déploiement, et le forcer à se taire reviendrait à
--    désarmer le garde qui protège les délais légaux.
--
--    Une fonction SŒUR le calcule. Le délai lui est PASSÉ en paramètre — il vient d'un
--    contrat, pas d'un texte —, ce qui la garde `immutable` et l'empêche de lire une table
--    cloisonnée. *Un calcul par régime, à un seul endroit par régime.*

create or replace function f_echeance_contractuelle(
    p_detecte_le     timestamptz,
    p_date_detection date,
    p_delai_heures   integer
)
returns table (
    regime     text,
    palier     text,
    reference  text,
    echeance   timestamptz,
    origine    text
)
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    with depart as (
        select coalesce(p_detecte_le, p_date_detection::timestamptz) as instant,
               case when p_detecte_le is not null then 'instant' else 'date_seule' end as origine
    )
    select 'contractuel',
           'notification_client',
           'Contrat : notification au donneur d''ordre (RGPD art. 33 §2)',
           d.instant + make_interval(hours => p_delai_heures),
           d.origine
      from depart d
     where d.instant is not null
       and p_delai_heures is not null;
$$;

comment on function f_echeance_contractuelle(timestamptz, date, integer) is
    'L''échéance de notification d''un incident à un donneur d''ordre, DÉRIVÉE de sa '
    'détection et du délai inscrit au contrat — jamais stockée, même motif que l''horloge '
    'réglementaire de la 034. ⚠️ Fonction SŒUR de f_echeances_reglementaires() et non un '
    'palier de plus : celle-là rend exactement quatre paliers, et son garde-fou le mesure '
    'parce que la loi en impose quatre. ⚠️ Rend ZÉRO ligne si la détection est inconnue OU '
    'si aucun délai contractuel n''est déclaré : une échéance sans délai convenu serait une '
    'date inventée, et c''est précisément ce qu''on ne peut pas montrer à un client.';

revoke all on function f_echeance_contractuelle(timestamptz, date, integer) from public;
grant execute on function f_echeance_contractuelle(timestamptz, date, integer)
    to grc_app, grc_lecture;

-- ── LA DÉCLARATION FAITE AU CLIENT SE CONSIGNE AU MÊME ENDROIT QUE LES AUTRES ───────
-- ⚠️ **ARBITRAGE, ET IL A ÉTÉ PESÉ CONTRE LA LEÇON DE LA MIGRATION 063** — *une table qui
--    répond à une question ne doit pas se mettre à en répondre une autre.* Une table
--    `notifications_client` séparée était l'autre voie. Elle a été écartée :
--
--      · la QUESTION est la même — « à qui ce signalement a-t-il été fait, quand, avec
--        quelle référence » —, et seul le DESTINATAIRE change. Le régime le nomme déjà ;
--      · deux tables signifieraient deux endroits où l'on consigne un signalement, deux
--        sources à l'échéancier, deux panneaux « ce qui manque » — et **le jour où l'on
--        oublie l'une, le produit annonce qu'il ne reste rien à faire** ;
--      · le vrai discriminant n'est pas le destinataire, c'est **d'où vient le délai** : la
--        loi ou le contrat. Cela se dit par une colonne, pas par une table.
--
--    Le commentaire de la table, écrit par la `034` et qui disait « à une autorité », est
--    donc AMENDÉ ici — exactement comme la `069` l'a fait pour la revue d'accès : un
--    commentaire de catalogue qui survit à son objet est de la documentation fausse que
--    personne ne relit.

alter table declarations_reglementaires add column if not exists client_id id_metier;

alter table declarations_reglementaires drop constraint if exists fk_declarations_reg_client;
alter table declarations_reglementaires add constraint fk_declarations_reg_client
    foreign key (client_id, filiale_id) references clients (id, filiale_id)
    on delete restrict;

alter table declarations_reglementaires
    drop constraint if exists ck_declarations_reglementaires_regime;
alter table declarations_reglementaires
    add constraint ck_declarations_reglementaires_regime
    check (regime in ('nis2', 'rgpd', 'contractuel'));

alter table declarations_reglementaires
    drop constraint if exists ck_declarations_reglementaires_palier;
alter table declarations_reglementaires
    add constraint ck_declarations_reglementaires_palier
    check (palier in ('alerte_precoce', 'notification', 'rapport_final',
                      'notification_cnil', 'notification_client'));

alter table declarations_reglementaires
    drop constraint if exists ck_declarations_reglementaires_coherence;
alter table declarations_reglementaires
    add constraint ck_declarations_reglementaires_coherence
    check ((regime = 'nis2'  and palier in ('alerte_precoce','notification','rapport_final'))
        or (regime = 'rgpd'  and palier = 'notification_cnil')
        or (regime = 'contractuel' and palier = 'notification_client'));

-- 🛑 **L'ÉQUIVALENCE, DANS LES DEUX SENS.** Une notification contractuelle SANS destinataire
--    est une ligne qui dit « nous avons prévenu quelqu'un » ; une déclaration à l'ANSSI AVEC
--    un client désigné ferait croire que le client a été prévenu. Les deux moitiés sont
--    nécessaires — c'est la leçon §39.6, *reconnaître par ce qui est référencé ET apparier
--    par ce qui est local*, dans sa forme la plus simple.
alter table declarations_reglementaires
    drop constraint if exists ck_declarations_reg_destinataire;
alter table declarations_reglementaires
    add constraint ck_declarations_reg_destinataire
    check ((regime = 'contractuel') = (client_id is not null));

comment on table declarations_reglementaires is
    'Ce qui a été SIGNALÉ, à qui, et quand. TROIS régimes : « nis2 » et « rgpd » vers une '
    'AUTORITÉ, « contractuel » vers un DONNEUR D''ORDRE (migration 071). ⚠️ Le commentaire '
    'posé par la 034 disait « à une autorité » et il est resté vrai jusqu''au 24/09/2026 : '
    'il est amendé ici plutôt que réécrit là-bas (CONVENTIONS.md §23). ⚠️ Elle ne porte '
    'aucune ÉCHÉANCE : elles sont dérivées — f_echeances_reglementaires() pour la loi, '
    'f_echeance_contractuelle() pour le contrat. Stocker une échéance laisserait, après '
    'correction de la date de détection, des échéances calculées sur l''ancienne, sans que '
    'personne le sache. ⚠️ Le produit NE TRANSMET RIEN : il prépare et il consigne, '
    'l''humain envoie — vers une autorité comme vers un client.';

comment on column declarations_reglementaires.client_id is
    'Le donneur d''ordre notifié, pour le seul régime « contractuel ». ⚠️ L''équivalence est '
    'posée dans les DEUX SENS par ck_declarations_reg_destinataire : pas de notification '
    'contractuelle sans destinataire, et pas de client désigné sur une déclaration à une '
    'autorité — qui ferait croire que le client a été prévenu. ⚠️ « on delete restrict » et '
    'non « set null » : effacer le destinataire d''un signalement déjà fait réécrirait '
    'l''histoire, et un donneur d''ordre notifié ne se supprime pas — il s''archive.';

-- =====================================================================================
-- §5 — UNE DEMANDE D'EXERCICE DE DROITS PEUT VENIR D'UN DONNEUR D'ORDRE
-- =====================================================================================
-- ⚠️ **Comme SOUS-TRAITANT, nous ne répondons pas à la personne concernée** : l'article
--    28 §3 e) nous oblige à **assister** le responsable de traitement. Le produit savait
--    déjà tenir une demande adressée à NOUS comme responsable (migration `040`) ; il ne
--    savait pas dire qu'une demande nous arrive PAR un client, pour son compte — et la
--    différence change qui répond, dans quel délai, et qui porte la décision de refus.

alter table demandes_droits add column if not exists client_id id_metier;

alter table demandes_droits drop constraint if exists fk_demandes_droits_client;
-- ⚠️ `on delete set null (client_id)` — LA LISTE DE COLONNES N'EST PAS UN ORNEMENT, et
--    c'est le garde-fou `f_verifier_set_null_composites()` (§43, né de la migration 046)
--    qui a refusé cette migration à sa première écriture. Sans la liste, PostgreSQL met à
--    null TOUTES les colonnes de la clé — `filiale_id` comprise, qui est `not null` sur
--    toute table cloisonnée. Effet réel : la purge de `POST /api/reprise` en mode
--    « remplacer » balaie les tables cloisonnées, donc **toute restauration de sauvegarde
--    tombe en 23502** — et rien ne le dit tant qu'aucun donneur d'ordre référencé n'est
--    supprimé. Le schéma se crée, les gardes passent, les écrans marchent.
alter table demandes_droits add constraint fk_demandes_droits_client
    foreign key (client_id, filiale_id) references clients (id, filiale_id)
    on delete set null (client_id);

create index if not exists ix_demandes_droits_client on demandes_droits (client_id)
    where client_id is not null;

comment on column demandes_droits.client_id is
    'Le donneur d''ordre qui nous a transmis cette demande, quand elle ne nous est pas '
    'adressée en propre. ⚠️ Nous sommes alors SOUS-TRAITANT : nous n''avons pas à répondre '
    'à la personne concernée, nous devons ASSISTER le responsable de traitement '
    '(RGPD art. 28 §3 e). La décision, le refus motivé et le délai lui appartiennent — et '
    'la fiche doit le dire, sans quoi quelqu''un répondra directement à la personne, ce qui '
    'est une faute du sous-traitant.';

-- =====================================================================================
-- §6 — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- =====================================================================================
-- Les colonnes neuves de cette migration sont toutes du domaine `id_metier` : le registre
-- ne les réclame pas (il balaie les colonnes de type `text` nu). Elles y sont inscrites
-- quand même, parce qu'un registre qui ne contient que ce qu'on lui réclame est un registre
-- qu'on relit en se demandant si quelqu'un a décidé, ou si personne n'a regardé.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('documents', 'client_id', 'non_personnelle', null, null, null, null,
   'Identifiant du donneur d''ordre propriétaire : une organisation, pas une personne.'),
  ('incidents', 'client_id', 'non_personnelle', null, null, null, null,
   'Identifiant du donneur d''ordre dont les données sont touchées : une organisation.'),
  ('declarations_reglementaires', 'client_id', 'non_personnelle', null, null, null, null,
   'Identifiant du donneur d''ordre notifié : une organisation.'),
  ('demandes_droits', 'client_id', 'non_personnelle', null, null, null, null,
   'Identifiant du donneur d''ordre qui a transmis la demande : une organisation. ⚠️ La '
   'personne concernée, elle, est nommée par les colonnes de demandes_droits déjà '
   'inscrites au registre par la migration 040.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §7 — LE GARDE-FOU, QUI ÉPROUVE
-- =====================================================================================
-- ⚠️ `CONVENTIONS.md` §39.8, payé TROIS fois : un garde-fou `stable` **ne peut pas
--    insérer**, même dans une sous-transaction annulée. Les contraintes s'éprouvent par
--    `f_contrainte_accepte()`, qui évalue le prédicat sans écrire ; les déclencheurs, eux,
--    se mesurent dans le CATALOGUE — et l'on mesure `tgtype`, pas seulement l'existence :
--    c'est le constat **Q-281**, où cinq gardes vérifiaient qu'un déclencheur existe pendant
--    que ses événements avaient été déplacés et que les barrières étaient mortes.

create or replace function f_verifier_obligations_client()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_t constant timestamptz := timestamptz '2026-03-01 09:00:00+00';
    r   record;
begin
    -- ── (1) L'ORDRE DES NIVEAUX DE DIFFUSION ───────────────────────────────────────
    -- Un plancher n'a de sens que si l'ordre est STRICT et croissant. Le garde le mesure
    -- sur les quatre valeurs plutôt que de relire la fonction : un `case` dont deux
    -- branches rendraient le même rang laisserait « interne » satisfaire « confidentiel ».
    if not (f_rang_confidentialite('public')       <  f_rang_confidentialite('interne')
        and f_rang_confidentialite('interne')      <  f_rang_confidentialite('confidentiel')
        and f_rang_confidentialite('confidentiel') <  f_rang_confidentialite('restreint'))
    then
        objet    := 'f_rang_confidentialite';
        anomalie := 'ordre_de_diffusion_non_strict';
        detail   := 'L''ordre des quatre niveaux de diffusion n''est plus strictement '
                    'croissant. Deux niveaux de rang égal font qu''un document « interne » '
                    'satisfait un plancher « confidentiel » — le contrat s''affiche comme '
                    'tenu et il ne l''est pas.';
        return next;
    end if;
    if f_rang_confidentialite('diffusion libre') is not null then
        objet    := 'f_rang_confidentialite';
        anomalie := 'niveau_inconnu_range';
        detail   := 'Une valeur hors vocabulaire reçoit un rang. Toute comparaison de '
                    'plancher réussirait alors au hasard, au lieu d''échouer.';
        return next;
    end if;

    -- ── (2) L'ÉCHÉANCE CONTRACTUELLE ───────────────────────────────────────────────
    select * into r from f_echeance_contractuelle(v_t, v_t::date, 24);
    if r is null then
        objet    := 'f_echeance_contractuelle';
        anomalie := 'echeance_contractuelle_muette';
        detail   := 'La fonction ne rend RIEN sur un incident détecté avec un délai de '
                    '24 h. Le délai contractuel est souvent plus court que NIS2 : c''est '
                    'lui qui commande le premier geste, et il cesserait d''être armé.';
        return next;
    elsif extract(epoch from (r.echeance - v_t)) / 3600 <> 24 then
        objet    := 'f_echeance_contractuelle';
        anomalie := 'delai_contractuel_faux';
        detail   := format('Un délai de 24 h produit une échéance à %s h de la détection. '
                           'Ce garde ÉPROUVE le calcul sur un instant témoin ; il ne relit '
                           'pas le texte de la fonction.',
                           round(extract(epoch from (r.echeance - v_t)) / 3600, 2));
        return next;
    end if;

    -- ⚠️ Et les deux silences OBLIGATOIRES. Une échéance calculée sans délai convenu est
    --    une date inventée — et c'est précisément celle qu'on ne peut pas montrer à un
    --    client.
    if exists (select 1 from f_echeance_contractuelle(v_t, v_t::date, null)) then
        objet    := 'f_echeance_contractuelle';
        anomalie := 'echeance_sans_delai_convenu';
        detail   := 'La fonction rend une échéance alors qu''AUCUN délai contractuel n''est '
                    'déclaré. Le produit afficherait au client une date que rien ne fonde.';
        return next;
    end if;
    if exists (select 1 from f_echeance_contractuelle(null, null, 24)) then
        objet    := 'f_echeance_contractuelle';
        anomalie := 'echeance_sans_origine';
        detail   := 'La fonction rend une échéance alors que la détection est INCONNUE. '
                    'Une horloge sans origine ne s''affiche pas, elle s''explique — même '
                    'règle que l''horloge réglementaire de la 034.';
        return next;
    end if;

    -- 🛑 (2 bis) LE CONTRACTUEL N'A PAS DÉTEINT SUR LE RÉGLEMENTAIRE. C'est la propriété
    -- que cette migration PROMET, et la seule façon qu'elle a d'être fausse est qu'un
    -- futur bien intentionné ajoute le palier client à la fonction de la loi.
    if exists (select 1 from f_echeances_reglementaires(v_t, v_t::date)
                where regime = 'contractuel' or palier = 'notification_client') then
        objet    := 'f_echeances_reglementaires';
        anomalie := 'palier_contractuel_dans_la_loi';
        detail   := 'Un palier CONTRACTUEL est rendu par la fonction des échéances '
                    'RÉGLEMENTAIRES. Le délai d''un contrat se retrouverait présenté comme '
                    'une obligation légale, et le garde-fou qui compte quatre paliers '
                    'devrait être désarmé pour l''accepter.';
        return next;
    end if;

    -- ── (3) UN DOCUMENT DE PORTÉE GROUPE N'A PAS DE DONNEUR D'ORDRE ─────────────────
    if f_contrainte_accepte('documents', 'ck_documents_client_local',
                            jsonb_build_object('client_id', 'CLI-T', 'filiale_id', null))
    then
        objet    := 'ck_documents_client_local';
        anomalie := 'document_groupe_avec_client';
        detail   := 'Un document de portée GROUPE est accepté avec un donneur d''ordre. Un '
                    'donneur d''ordre est toujours local : la clé composite ne vérifie '
                    'alors RIEN (MATCH SIMPLE, §45), et le document pourrait désigner le '
                    'client d''une filiale quelconque.';
        return next;
    end if;
    if not f_contrainte_accepte('documents', 'ck_documents_client_local',
                                jsonb_build_object('client_id', 'CLI-T',
                                                   'filiale_id', 'FIL-T'))
    then
        objet    := 'ck_documents_client_local';
        anomalie := 'document_local_avec_client_refuse';
        detail   := 'Un document LOCAL rattaché à un donneur d''ordre est refusé : le cas '
                    'nominal du lot est interdit.';
        return next;
    end if;

    -- ── (4) L'ÉQUIVALENCE DU DESTINATAIRE, DANS LES DEUX SENS ──────────────────────
    if f_contrainte_accepte('declarations_reglementaires', 'ck_declarations_reg_destinataire',
                            jsonb_build_object('regime', 'contractuel', 'client_id', null))
    then
        objet    := 'ck_declarations_reg_destinataire';
        anomalie := 'notification_contractuelle_sans_destinataire';
        detail   := 'Une notification contractuelle est acceptée SANS donneur d''ordre. La '
                    'ligne dirait « nous avons prévenu quelqu''un » sans dire qui, et le '
                    'dossier remis au client compterait cette notification comme faite.';
        return next;
    end if;
    if f_contrainte_accepte('declarations_reglementaires', 'ck_declarations_reg_destinataire',
                            jsonb_build_object('regime', 'nis2', 'client_id', 'CLI-T'))
    then
        objet    := 'ck_declarations_reg_destinataire';
        anomalie := 'declaration_autorite_avec_client';
        detail   := 'Une déclaration à l''ANSSI est acceptée avec un donneur d''ordre '
                    'désigné. L''écran ferait croire que le client a été prévenu alors que '
                    'seule l''autorité l''a été — et c''est au client que le contrat nous '
                    'oblige.';
        return next;
    end if;
    if not f_contrainte_accepte('declarations_reglementaires', 'ck_declarations_reg_destinataire',
                                jsonb_build_object('regime', 'contractuel',
                                                   'client_id', 'CLI-T'))
       or not f_contrainte_accepte('declarations_reglementaires',
                                   'ck_declarations_reg_destinataire',
                                   jsonb_build_object('regime', 'rgpd', 'client_id', null))
    then
        objet    := 'ck_declarations_reg_destinataire';
        anomalie := 'destinataire_legitime_refuse';
        detail   := 'Un couple LÉGITIME (contractuel + client, ou rgpd sans client) est '
                    'refusé. Une contrainte qui interdit le cas nominal est pire que son '
                    'absence.';
        return next;
    end if;

    -- ── (5) UN PALIER APPARTIENT À SON RÉGIME, Y COMPRIS LE NEUF ───────────────────
    if f_contrainte_accepte('declarations_reglementaires',
                            'ck_declarations_reglementaires_coherence',
                            jsonb_build_object('regime', 'contractuel',
                                               'palier', 'rapport_final'))
    then
        objet    := 'ck_declarations_reglementaires_coherence';
        anomalie := 'palier_etranger_au_regime_contractuel';
        detail   := 'Un « rapport final » est accepté sous le régime contractuel. Le '
                    'tableau de conformité afficherait un palier que le contrat ne prévoit '
                    'pas — c''est le motif exact de cette contrainte, écrit par la 034.';
        return next;
    end if;

    -- ── (6) LES DEUX DÉCLENCHEURS DU PLANCHER : ÉVÉNEMENTS ET DIFFÉRÉ ──────────────
    -- ⚠️ On mesure `tgtype` et le caractère DIFFÉRÉ, pas l'existence (constat Q-281). Et le
    --    différé n'est pas un détail de confort : immédiat, il refuserait une reprise
    --    « remplacer » saine dont l'ordre d'insertion place le document avant le client —
    --    c'est la classe des constats Q-194, Q-280 et Q-284, et *restaurer une sauvegarde
    --    gagne*.
    for r in
        select * from (values
            ('trg_documents_plancher_client', 'documents'),
            ('trg_clients_plancher_tenu',     'clients')
        ) as v(nom, tbl)
    loop
        if not exists (select 1 from pg_trigger t
                        where t.tgname = r.nom
                          and t.tgrelid = ('public.' || r.tbl)::regclass
                          and not t.tgisinternal
                          and t.tgdeferrable
                          and t.tginitdeferred
                          -- 16 = UPDATE : les deux déclencheurs doivent au moins voir la
                          -- mise à jour, sans quoi relever un plancher ou reclasser un
                          -- document passerait sous le radar.
                          and (t.tgtype::integer & 16) = 16)
        then
            objet    := r.nom;
            anomalie := 'declencheur_du_plancher_absent_ou_immediat';
            detail   := format(
                'Le déclencheur « %s » sur « %s » manque, n''écoute plus la mise à jour, ou '
                'n''est plus DIFFÉRÉ. Absent, le plancher de diffusion du donneur d''ordre '
                'n''est plus qu''un texte sur un écran. Immédiat, il refuse une reprise '
                '« remplacer » parfaitement saine. Les deux sont mesurés ici parce que '
                'vérifier qu''un déclencheur EXISTE laisse passer le déplacement de ses '
                'événements — constat Q-281.', r.nom, r.tbl);
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_obligations_client() is
    'Éprouve que ce qu''un donneur d''ordre impose MORD ailleurs que sur sa fiche : l''ordre '
    'des quatre niveaux de diffusion est strict, l''échéance contractuelle se calcule et se '
    'TAIT quand elle doit (pas de délai convenu, pas de détection), le palier contractuel '
    'n''a pas déteint sur la fonction des échéances LÉGALES, un document de portée Groupe '
    'n''a pas de client, l''équivalence « régime contractuel ⇔ destinataire » tient DANS LES '
    'DEUX SENS, et les deux déclencheurs du plancher sont présents, écoutent la mise à jour '
    'et restent DIFFÉRÉS. ⚠️ Il tente aussi les cas LÉGITIMES : un garde qui refuse tout '
    'serait vert.';

revoke all on function f_verifier_obligations_client() from public;

select f_armer_declencheurs();

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('071', 'ce que le donneur d''ordre impose mord ailleurs : plancher de diffusion sur '
               'ses documents (dans les DEUX sens d''écriture), incident rattaché, '
               'notification contractuelle dans l''horloge avec SON délai, demande de '
               'droits transmise — « respecté dans le reste du logiciel », demande du RSSI')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Retirer les deux déclencheurs de contrainte, les deux fonctions du plancher,
--   f_echeance_contractuelle, f_rang_confidentialite, f_verifier_obligations_client ;
--   ramener les trois `check` de declarations_reglementaires à leur texte de la 034 et
--   reposer son commentaire ; retirer les quatre colonnes `client_id`.
--   ⚠️ Dans cet ordre, et APRÈS avoir retiré la 070 : l'inverse laisse un plancher gardé
--      par rien sur des colonnes qui existent encore.
-- =====================================================================================
