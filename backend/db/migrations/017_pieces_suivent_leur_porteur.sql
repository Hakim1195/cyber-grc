-- =====================================================================================
--  017 — Une pièce jointe suit son porteur, QUEL QUE SOIT LE CHEMIN
-- -------------------------------------------------------------------------------------
--  §1  La file de purge du magasin — « la ligne d'abord, le fichier après le commit »
--  §2  Le déclencheur : les pièces suivent leur porteur
--  §3  La pose des déclencheurs — DÉCOUVERTE dans le catalogue, jamais récitée
--  §4  Le garde-fou : une table porteuse sans déclencheur est une anomalie
--  §5  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constats Q-230, Q-232 et Q-233, portes S8 (5ᵉ et 6ᵉ passages)
--
--  `pieces_jointes` porte un rattachement POLYMORPHE — (`entite_type`, `entite_id`) —
--  et AUCUNE clé étrangère vers l'entité qu'elle documente : la seule de la table vise
--  `filiales`. **Le schéma ne peut donc pas cascader**, et rien ne prenait le relais.
--
--  Le correctif de Q-230 avait pris le relais À UN SEUL ENDROIT : la route
--  `DELETE /api/entites/:entite/:identifiant`, qui ne nomme que l'entité que l'URL
--  désigne. Mesuré au 6ᵉ passage de la porte S8 :
--
--    · supprimer un SCÉNARIO PRA cascade sur ses `tests_pra` ; la pièce du test reste,
--      et `GET /api/pieces/tests_pra/<test supprimé>/<pj>` rend **200, 125 octets** ;
--    · supprimer un RISQUE cascade sur ses `actions` ; la pièce de l'action reste ;
--    · `POST /api/reprise` en mode « remplacer » vide SEIZE collections et ne retire
--      **aucune** pièce — `pieces_jointes` n'est pas dans le registre des entités.
--
--  ⚠️ **C'est la sixième fois sur ce chantier qu'un correctif traite l'INSTANCE au
--  lieu de la CLASSE**, et l'auditeur l'a écrit noir sur blanc : *« le remède doit être
--  un seul endroit que tous les chemins traversent — pas six correctifs »*.
--
--  Cette migration est cet endroit-là. Le relais n'est plus pris par une route : il est
--  pris par LA BASE, sur chaque table porteuse, par un déclencheur `after delete`. Tout
--  chemin de disparition le traverse — la suppression directe, la cascade du schéma
--  (30 `on delete cascade`), la purge de `POST /api/reprise`, la purge RGPD d'une fiche
--  d'annuaire, et jusqu'à un `delete` tapé dans `psql`.
--
--  ── LA SECONDE MOITIÉ : LE FICHIER ──────────────────────────────────────────────────
--
--  Retirer la LIGNE ne retire pas le FICHIER, et le critère de D2 est double : zéro
--  ligne orpheline ET zéro fichier résiduel dans le magasin. Or l'ordre n'est pas
--  indifférent (`src/pieces/magasin.ts`) : **le fichier se retire APRÈS le commit**.
--  L'inverse laisserait, sur une transaction annulée, une ligne pointant dans le vide —
--  une preuve d'audit perdue. Le déclencheur ne peut donc pas toucher au disque.
--
--  Il inscrit le chemin dans `pieces_a_purger`, et c'est l'application qui vide cette
--  file **après le commit**. La file est le point de rendez-vous : ce qu'une panne
--  laisse dedans est retrouvé au balayage suivant, au lieu d'être perdu de vue.
--
--  ── CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE, ET QUI A CHANGÉ LA CONCEPTION ────────────────
--
--  La première rédaction posait le déclencheur sur TOUTE table que `type_entite` admet.
--  Mesuré sur une base jetable : une politique de suppression qui appelle
--  `f_filiale_ecriture()` **lève GRC04 même quand AUCUNE ligne n'est candidate** — la
--  fonction est évaluée par le scan, pas par la ligne. Un déclencheur sur `sessions`
--  aurait donc fait échouer la purge des sessions expirées, qui s'exécute sans filiale
--  active. La règle de pose est donc : **une table dont la politique de suppression est
--  cloisonnée** (elle nomme `f_filiale_ecriture()` ou `f_administration_groupe()`).
--  `sessions` — politique `f_authentification()` — en est exclue, et aucune route ne
--  peut y attacher de pièce : l'énumération que la route de dépôt accepte est dérivée
--  de `DOMAINE_PAR_ENTITE`, et le banc la compare aux tables équipées.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LA FILE DE PURGE DU MAGASIN
-- -------------------------------------------------------------------------------------
-- Elle est CLOISONNÉE, et ce n'était pas gratuit : une file commune aurait été plus
-- commode à balayer, mais elle aurait laissé une filiale constater qu'une autre vient
-- de supprimer quelque chose — un oracle, faible mais réel, là où tout le reste du
-- schéma en ferme. Le balayage périodique itère donc sur les filiales, comme le fait
-- déjà la ré-analyse du stock (`src/pieces/exploitation.ts`).
-- =====================================================================================

create table pieces_a_purger (
    chemin_stockage text        not null,
    piece_id        id_metier   not null,
    filiale_id      id_metier   not null,
    entite_type     type_entite not null,
    entite_id       id_metier   not null,
    -- Une pièce INFECTÉE a son fichier en quarantaine, pas dans le magasin, et il n'est
    -- pas effacé : c'est la matière de l'équipe sécurité, et
    -- `DELETE /api/pieces/…` s'en abstient déjà (`src/pieces/index.ts`). La file porte
    -- le drapeau pour que le balayeur applique LA MÊME règle — sans quoi supprimer un
    -- risque effacerait la preuve d'une tentative d'intrusion.
    quarantaine     boolean     not null default false,
    motif           text        not null,
    cree_le         timestamptz not null default now(),
    constraint pk_pieces_a_purger primary key (chemin_stockage),
    constraint fk_pieces_a_purger_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- Même forme que `ck_pieces_jointes_chemin` : ce qui entre ici vient d'une ligne de
    -- `pieces_jointes`, et le balayeur le passe à `resoudreDansMagasin()`. La contrainte
    -- ferme la traversée de répertoire une seconde fois, du côté de la file.
    constraint ck_pieces_a_purger_chemin check (
        chemin_stockage ~ '^([0-9a-f]{2}/)*[0-9a-f]{64}$'),
    constraint ck_pieces_a_purger_motif  check (motif <> '')
);

create index ix_pieces_a_purger_filiale on pieces_a_purger (filiale_id, cree_le);

comment on table pieces_a_purger is
    'File des fichiers du magasin dont la LIGNE a disparu : le déclencheur '
    'f_pieces_suivent_leur_porteur() y inscrit ce qu''il retire de pieces_jointes, et '
    'l''application vide la file APRÈS le commit (src/pieces/purge.ts). L''ordre n''est '
    'pas indifférent — un fichier effacé avant une transaction qui échoue laisserait une '
    'ligne pointant dans le vide, c''est-à-dire une preuve d''audit perdue ; l''ordre '
    'retenu laisse au pire un fichier que rien ne délivre, et la file dit lequel. '
    'Constats Q-232 et Q-233, porte S8.';
comment on column pieces_a_purger.motif is
    'Ce qui a fait disparaître la ligne, pour le diagnostic : « porteur_supprime:<table> ». '
    'Aucune donnée d''utilisateur n''y entre.';
comment on column pieces_a_purger.quarantaine is
    'Vrai si le fichier est en QUARANTAINE et non dans le magasin : le balayeur ne '
    'l''efface pas, exactement comme la route de suppression d''une pièce.';

-- ── Row Level Security : le contrat de la famille « niveau filiale » (004_rls.sql §3) ─
alter table pieces_a_purger enable row level security;
alter table pieces_a_purger force  row level security;

create policy pol_pieces_a_purger_lecture on pieces_a_purger for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_pieces_a_purger_ajout on pieces_a_purger for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_pieces_a_purger_maj on pieces_a_purger for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_pieces_a_purger_suppression on pieces_a_purger for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_pieces_a_purger_lecture on pieces_a_purger is
    'Lecture : les lignes de tout le périmètre de la session.';
comment on policy pol_pieces_a_purger_ajout on pieces_a_purger is
    'Ajout : dans la seule filiale ACTIVE. Le déclencheur n''y inscrit que ce qu''il a pu '
    'retirer de pieces_jointes, dont la politique de suppression est la même.';
comment on policy pol_pieces_a_purger_maj on pieces_a_purger is
    'Modification : dans la seule filiale active. Aucun chemin de l''application ne '
    'modifie une ligne de la file ; la politique existe pour que le garde-fou de '
    'couverture RLS trouve une écriture cloisonnée sur les quatre commandes.';
comment on policy pol_pieces_a_purger_suppression on pieces_a_purger is
    'Suppression : dans la seule filiale active — c''est le balayeur, une fois le fichier '
    'retiré du disque.';

-- Les privilèges par défaut de `001_socle.sql` §0 couvrent déjà les tables créées par le
-- propriétaire ; on les repose explicitement, parce qu'une migration jouée sous un autre
-- rôle les manquerait, et qu'une table sans « grant » rendrait le service aveugle en
-- production sans que rien ne l'ait dit (même motif qu'au §10 de 001).
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on pieces_a_purger to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on pieces_a_purger to grc_lecture';
    end if;
end;
$$;

-- =====================================================================================
-- §2 — LE DÉCLENCHEUR
-- -------------------------------------------------------------------------------------
-- Un seul corps, posé sur N tables, paramétré par les valeurs de `entite_type` qui
-- désignent la table. Le prédicat n'existe donc qu'en un exemplaire : c'est lui que
-- l'auditeur lit, et il ne peut pas diverger d'une table à l'autre.
-- =====================================================================================

create or replace function f_pieces_suivent_leur_porteur() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_types     text[]  := tg_argv;
    v_restantes integer;
begin
    with retirees as (
        delete from pieces_jointes
              where entite_type = any (v_types)
                and entite_id   = old.id
          returning id, filiale_id, entite_type, entite_id, chemin_stockage, quarantaine
    )
    insert into pieces_a_purger
        (chemin_stockage, piece_id, filiale_id, entite_type, entite_id, quarantaine, motif)
    select chemin_stockage, id, filiale_id, entite_type, entite_id, quarantaine,
           'porteur_supprime:' || tg_table_name
      from retirees
    -- Le chemin est unique dans `pieces_jointes` (256 bits d'aléa, unicité globale) :
    -- un conflit ne peut venir que d'une ligne de file qu'un balayage précédent n'a pas
    -- encore consommée. La garder telle quelle est le bon geste.
    on conflict (chemin_stockage) do nothing;

    -- ── LA CEINTURE : ce que la RLS refuse de retirer ne part PAS en silence ─────────
    --
    -- Le `delete` ci-dessus est soumis à `pol_pieces_jointes_suppression`
    -- (`filiale_id = f_filiale_ecriture()`). Dans le cas nominal, la pièce et son
    -- porteur sont de la même filiale et la politique passe. Le cas qui ne l'est pas
    -- existe : une politique de PORTÉE GROUPE (`documents.filiale_id` nul) peut porter
    -- des pièces déposées par PLUSIEURS filiales, et la supprimer depuis
    -- l'administration Groupe d'une filiale ne peut pas retirer celles des autres.
    --
    -- On refuse alors la suppression, plutôt que de laisser une orpheline : c'est très
    -- exactement le défaut qu'on ferme ici, et le rouvrir d'un cran plus haut serait la
    -- septième occurrence du motif. La lecture, elle, porte sur tout le périmètre — un
    -- reste invisible même en lecture supposerait une pièce hors du périmètre d'une
    -- session qui vient pourtant d'écrire dans la filiale de son porteur.
    select count(*) into v_restantes
      from pieces_jointes
     where entite_type = any (v_types)
       and entite_id   = old.id;

    if v_restantes > 0 then
        raise exception
            'Suppression refusée : % pièce(s) jointe(s) de % « % » appartiennent à une '
            'autre filiale et ne peuvent pas être retirées depuis celle-ci.',
            v_restantes, tg_table_name, old.id
            using errcode = 'GRC05',
                  hint = 'Retirez ces pièces depuis la filiale qui les a déposées, puis '
                         'recommencez. Une pièce jointe ne survit jamais à son porteur '
                         '(constats Q-232 / Q-233) : plutôt que de la laisser orpheline, '
                         'la base refuse la suppression.';
    end if;

    return old;
end;
$$;

comment on function f_pieces_suivent_leur_porteur() is
    'Déclencheur « after delete » posé sur toute table porteuse de pièces jointes : il '
    'retire de pieces_jointes ce que le rattachement polymorphe (entite_type, entite_id) '
    'y attachait, et inscrit les chemins dans pieces_a_purger pour que l''application '
    'retire les fichiers APRÈS le commit. Il prend le relais que le schéma ne peut pas '
    'prendre — un lien polymorphe n''a pas de clé étrangère, donc pas de cascade — et il '
    'le prend pour TOUS les chemins de disparition à la fois : suppression directe, '
    'cascade du schéma, purge de la reprise « remplacer », purge RGPD, psql. Ses '
    'arguments sont les valeurs de entite_type qui désignent la table. Constats Q-230, '
    'Q-232, Q-233 (porte S8).';

-- =====================================================================================
-- §3 — LA POSE — DÉCOUVERTE DANS LE CATALOGUE
-- -------------------------------------------------------------------------------------
-- ⚠️ AUCUNE LISTE DE TABLES N'EST ÉCRITE ICI (`CONVENTIONS.md` §19.5). Une table
-- porteuse oubliée ferait « réussir en silence quelque chose de faux » — une suppression
-- qui laisse une orpheline —, et c'est le cas où la liste est le mauvais outil. Le
-- prédicat de découverte est :
--
--   · la table est ADMISE par le domaine `type_entite` (elle peut donc être nommée par
--     le rattachement polymorphe) ;
--   · elle porte une colonne `id` (c'est ce que `entite_id` référence) ;
--   · sa politique de SUPPRESSION est cloisonnée — elle nomme `f_filiale_ecriture()` ou
--     `f_administration_groupe()`. Voir l'entête : une politique non cloisonnée signale
--     le substrat, où aucune pièce ne se dépose et où une filiale active n'est pas
--     garantie.
--
-- L'ADMISSION SE MESURE PAR UN TRANSTYPAGE, jamais en relisant le texte de la contrainte
-- du domaine : c'est la base elle-même qui répond, et la réponse reste juste le jour où
-- une migration élargit le domaine (ce qu'a fait `013`).
-- =====================================================================================

do $$
declare
    r          record;
    v_admise   boolean;
    v_types    text[];
    v_poses    integer := 0;
begin
    for r in
        select c.oid, c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'id'
                          and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_policy p
                        where p.polrelid = c.oid and p.polcmd = 'd'
                          and (pg_get_expr(p.polqual, p.polrelid) like '%f_filiale_ecriture%'
                            or pg_get_expr(p.polqual, p.polrelid) like '%f_administration_groupe%'))
         order by c.relname
    loop
        begin
            execute format('select %L::type_entite', r.relname);
            v_admise := true;
        exception when others then
            v_admise := false;
        end;
        if not v_admise then continue; end if;

        -- Les valeurs de `entite_type` qui désignent CETTE table. Elle porte son propre
        -- nom ; `mesure_catalogue` porte en plus « mesures », parce que l'API scinde
        -- l'entité en deux tables (`PLAN_SERVEUR` §2.2) et continue de l'appeler
        -- « mesures » à la route de dépôt. Le §4 refuse toute valeur admise par le
        -- domaine qui ne serait ni une table équipée, ni un alias porté par l'une.
        v_types := array[r.relname::text];
        if r.relname = 'mesure_catalogue' then
            v_types := array_append(v_types, 'mesures'::text);
        end if;

        execute format(
            'create trigger %I after delete on %I for each row '
            'execute function f_pieces_suivent_leur_porteur(%s)',
            'trg_' || r.relname || '_pieces', r.relname,
            (select string_agg(quote_literal(t), ', ') from unnest(v_types) t));
        -- « always » : le garde-fou f_verifier_armement() refuse tout autre armement —
        -- un déclencheur désarmable est un garde-fou qu'on peut retirer sans migration.
        execute format('alter table %I enable always trigger %I',
                       r.relname, 'trg_' || r.relname || '_pieces');
        v_poses := v_poses + 1;
    end loop;

    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
    if v_poses = 0 then
        raise exception 'Aucune table porteuse découverte : le prédicat de découverte ne '
                        'reconnaît plus le schéma, et « zéro orpheline » ne voudrait rien dire.';
    end if;
end;
$$;

-- Le rattachement polymorphe se lisait jusqu'ici par `ix_pieces_jointes_entite`, dont la
-- première colonne est `filiale_id` : le déclencheur, lui, interroge (entite_type,
-- entite_id) sans filiale — c'est la RLS qui borne. Sans cet index, chaque suppression
-- de porteur balaierait toute la table.
create index ix_pieces_jointes_porteur on pieces_jointes (entite_type, entite_id);

comment on index ix_pieces_jointes_porteur is
    'Lecture du rattachement polymorphe SANS filiale : c''est ainsi que '
    'f_pieces_suivent_leur_porteur() interroge la table, la RLS bornant le résultat.';

-- =====================================================================================
-- §4 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Découvert par `f_decouvrir_controles_schema()` sur son seul nom, joué par
-- `f_verifier_schema()`, donc par `db/migrate.mjs` ET par `deploy/install.sh`
-- (`CONVENTIONS.md` §18.4). Il naît dans le même commit que ce qu'il garde (§19.4).
--
-- Il vérifie LES DEUX SENS (§20.2) :
--   1. toute table porteuse découverte porte son déclencheur ;
--   2. toute valeur admise par `type_entite` qui n'est PAS une table est portée par les
--      arguments d'un déclencheur — sans quoi « mesures » redeviendrait un angle mort.
-- =====================================================================================

create or replace function f_verifier_declencheurs_pieces()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r          record;
    v_admise   boolean;
    v_couverts text[] := array[]::text[];
    v_valeur   text;
begin
    /* Les valeurs que les déclencheurs posés couvrent réellement, lues dans le
       catalogue : `pg_get_triggerdef` rend les arguments entre apostrophes, et ce sont
       les seuls littéraux apostrophés de la définition. */
    select coalesce(array_agg(m[1]), array[]::text[]) into v_couverts
      from pg_trigger t
      join pg_proc  p on p.oid = t.tgfoid,
           lateral regexp_matches(pg_get_triggerdef(t.oid), '''([a-z_]+)''', 'g') m
     where p.proname = 'f_pieces_suivent_leur_porteur' and not t.tgisinternal;

    /* ── SENS 1 : une table porteuse sans déclencheur ─────────────────────────────── */
    for r in
        select c.oid, c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'id'
                          and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_policy p
                        where p.polrelid = c.oid and p.polcmd = 'd'
                          and (pg_get_expr(p.polqual, p.polrelid) like '%f_filiale_ecriture%'
                            or pg_get_expr(p.polqual, p.polrelid) like '%f_administration_groupe%'))
         order by c.relname
    loop
        begin
            execute format('select %L::type_entite', r.relname);
            v_admise := true;
        exception when others then
            v_admise := false;
        end;
        if not v_admise then continue; end if;

        if not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = r.oid and not t.tgisinternal
               and p.proname = 'f_pieces_suivent_leur_porteur')
        then
            objet    := r.relname;
            anomalie := 'porteur_sans_declencheur';
            detail   := 'Cette table peut être désignée par le rattachement polymorphe de '
                        'pieces_jointes, et sa suppression est cloisonnée — elle est donc '
                        'porteuse. Sans « trg_' || r.relname || '_pieces », supprimer une '
                        'de ses lignes laisserait la pièce EN BASE, SUR LE DISQUE et DANS '
                        'LE QUOTA de la filiale, et GET /api/pieces/… continuerait de la '
                        'délivrer (constats Q-232 / Q-233). Rejouez la pose du §3 de la '
                        'migration 017.';
            return next;
        elsif not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = r.oid and not t.tgisinternal
               and p.proname = 'f_pieces_suivent_leur_porteur'
               and pg_get_triggerdef(t.oid) like '%' || quote_literal(r.relname) || '%')
        then
            objet    := r.relname;
            anomalie := 'declencheur_sans_son_propre_type';
            detail   := 'Le déclencheur est posé mais ne porte pas « ' || r.relname ||
                        ' » parmi ses arguments : il ne retirerait donc PAS les pièces '
                        'attachées sous ce nom. Un déclencheur qui ne mord pas est pire '
                        'qu''un déclencheur absent — il donne à croire que le cas est '
                        'couvert.';
            return next;
        end if;
    end loop;

    /* ── SENS 2 : une valeur admise sans table ni alias ───────────────────────────── */
    for v_valeur in
        select m[1]
          from pg_constraint c,
               lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
         where c.contypid = 'type_entite'::regtype
         order by 1
    loop
        if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r' and c.relname = v_valeur)
        then
            continue;   -- c'est une table : le sens 1 s'en charge
        end if;
        if v_valeur = any (v_couverts) then
            continue;   -- alias porté par un déclencheur
        end if;
        objet    := 'type_entite.' || v_valeur;
        anomalie := 'valeur_sans_porteur';
        detail   := '« ' || v_valeur || ' » est admise par le domaine type_entite mais ne '
                    'désigne aucune table, et aucun déclencheur ne la porte parmi ses '
                    'arguments. Une pièce attachée sous ce nom ne suivrait donc jamais son '
                    'porteur. C''est le cas de « mesures », que l''API emploie alors que '
                    'la table est « mesure_catalogue » : l''alias se déclare au §3 de la '
                    'migration 017. Décidez — alias, ou valeur à retirer du domaine.';
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_declencheurs_pieces() is
    'Vérifie, DANS LES DEUX SENS, que toute pièce jointe suit son porteur. Sens 1 : '
    'toute table que type_entite admet, portant « id » et dont la politique de '
    'suppression est cloisonnée, porte son déclencheur — et ce déclencheur porte bien '
    'son propre nom parmi ses arguments. Sens 2 : toute valeur admise par type_entite '
    'qui ne désigne aucune table est portée en ALIAS par un déclencheur (cas de '
    '« mesures » → mesure_catalogue). Découvre dans pg_catalog, ne récite aucune liste : '
    'une table porteuse ajoutée demain est réclamée bruyamment. Un schéma sain ne '
    'renvoie AUCUNE ligne. Constats Q-232 / Q-233, porte S8 — « le remède doit être un '
    'seul endroit que tous les chemins traversent, pas six correctifs ».';

grant execute on function f_verifier_declencheurs_pieces() to grc_app;

-- =====================================================================================
-- §5 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
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
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 017 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, déclencheurs des pièces compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('017', 'une pièce jointe suit son porteur quel que soit le chemin — déclencheur '
               'sur chaque table porteuse et file de purge du magasin (Q-232 / Q-233)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   do $$ declare r record; begin
--     for r in select c.relname, t.tgname from pg_trigger t
--                join pg_class c on c.oid = t.tgrelid
--                join pg_proc  p on p.oid = t.tgfoid
--               where p.proname = 'f_pieces_suivent_leur_porteur' and not t.tgisinternal
--     loop execute format('drop trigger %I on %I', r.tgname, r.relname); end loop;
--   end; $$;
--   drop function if exists f_pieces_suivent_leur_porteur();
--   drop function if exists f_verifier_declencheurs_pieces();
--   delete from controles_schema where fonction = 'f_verifier_declencheurs_pieces';
--   drop index if exists ix_pieces_jointes_porteur;
--   drop table if exists pieces_a_purger;
--   delete from migrations_schema where version = '017';
--   commit;
-- ⚠️ La rejouer rouvre Q-232 et Q-233 : « supprimer » cesse de supprimer sur cinq des
--    six chemins, et la reprise « remplacer » laisse TOUTES les pièces de la filiale.
-- =====================================================================================
