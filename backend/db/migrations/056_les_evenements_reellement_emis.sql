-- =====================================================================================
--  056 — CE QUI EST ADMIS N'EST PAS CE QUI EST ÉMIS
-- -------------------------------------------------------------------------------------
--  Lot L22, action 22.3 — la moitié qui manquait, et elle a été trouvée EN CONSTRUISANT
--  l'écran qui devait proposer les abonnements.
--
--  ⚠️ **`echeance_franchie` était admis par la contrainte depuis la `053`, et ÉMIS PAR
--  PERSONNE.** Un exploitant se serait abonné, l'écran aurait montré l'abonnement actif,
--  la file serait restée vide, et rien n'aurait dit pourquoi. C'est mot pour mot le
--  danger que le garde-fou de la `053` écrivait dans son propre témoin — *« un abonnement
--  à un événement QUE RIEN N'ÉMET : l'intégration a l'air en place et ne se déclenche
--  jamais »* — et il visait le cas où la contrainte se vide, pas celui où elle est juste
--  et où l'émetteur manque. **La barrière regardait dans une direction ; le trou était
--  dans l'autre.**
--
--  ── CE QUE CE FICHIER POSE ────────────────────────────────────────────────────────
--
--  1. **`f_emettre_evenement()`** — l'enfilage, extrait du déclencheur, pour qu'un
--     émetteur qui n'est PAS un déclencheur puisse s'en servir. Un franchissement
--     d'échéance n'est l'insertion d'aucune ligne : c'est un fait DÉRIVÉ, constaté par
--     le minuteur des relances (lot L12) qui parcourt déjà l'échéancier.
--  2. **`f_evenements_emis()`** — la déclaration : quels événements le produit émet, et
--     **par quel moyen**. C'est une liste écrite à la main, et c'est délibéré : son
--     omission fait **échouer bruyamment** un garde-fou, ce qui est le cas (b) du
--     tableau des listes du `CLAUDE.md` §3 — le bon usage d'une liste.
--  3. **`f_verifier_evenements_emis()`** — qui la confronte au réel dans les DEUX sens.
--
--  ⚠️ **Pourquoi une déclaration plutôt qu'une découverte pure ?** Parce qu'aucune
--  découverte ne peut voir un émetteur écrit en TypeScript : `pg_depend` ne suit pas les
--  appels d'un corps PL/pgSQL (`CONVENTIONS.md` §39.8), et il suit encore moins ceux d'un
--  service. Découvrir les déclencheurs et s'arrêter là aurait déclaré
--  `echeance_franchie` inexistant — c'est-à-dire refait le défaut, d'un cran plus haut.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

select set_config('grc.perimetre_groupe', 'oui', true);
select set_config('grc.authentification', 'oui', true);

-- =====================================================================================
-- §1 — L'ENFILAGE, EXTRAIT DU DÉCLENCHEUR
-- =====================================================================================

create or replace function f_emettre_evenement(
    p_evenement  text,
    p_filiale_id text,
    p_entite     text,
    p_id         text,
    p_complement jsonb default '{}'::jsonb)
returns integer
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$em$
declare
    v_abonnement record;
    v_charge jsonb;
    v_enfiles integer := 0;
begin
    -- ⚠️ Un objet de portée Groupe n'appartient à aucune filiale, et rien ne dit à
    -- laquelle des vingt son événement devrait partir. On sort, plutôt que de choisir.
    if p_filiale_id is null then
        return 0;
    end if;

    -- ⚠️ **La charge ne porte PAS le contenu.** Un webhook part vers un outil tiers,
    -- sur le réseau du client ou au-delà : y mettre la description d'un incident de
    -- sécurité serait une extraction de données par la porte qu'on vient d'ouvrir.
    -- L'abonné reçoit de quoi VENIR CHERCHER, avec le jeton d'API qui le borne.
    -- ⚠️ `p_complement` suit la même règle : il porte des NOMBRES et des DATES
    -- (combien d'échéances, laquelle est la plus proche), jamais un intitulé.
    v_charge := jsonb_build_object(
        'evenement',  p_evenement,
        'entite',     p_entite,
        'id',         p_id,
        'filiale',    p_filiale_id,
        'survenu_le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        || coalesce(p_complement, '{}'::jsonb);

    for v_abonnement in
        select a.id from abonnements_evenements a
         where a.filiale_id = p_filiale_id
           and a.evenement = p_evenement and a.actif
    loop
        insert into evenements_sortants
            (filiale_id, abonnement_id, evenement, charge)
        values (p_filiale_id, v_abonnement.id, p_evenement, v_charge);
        v_enfiles := v_enfiles + 1;
    end loop;

    return v_enfiles;
end;
$em$;

comment on function f_emettre_evenement(text, text, text, text, jsonb) is
    'Enfile un evenement sortant pour chaque abonnement ACTIF de la filiale (action '
    '22.3). ⚠️ EXTRAITE du declencheur pour qu''un emetteur qui n''est pas un '
    'declencheur puisse s''en servir : un franchissement d''echeance n''est l''insertion '
    'd''aucune ligne, c''est un fait DERIVE que le minuteur des relances constate. '
    '⚠️ La charge ne porte PAS le contenu — l''abonne recoit de quoi VENIR CHERCHER.';

grant execute on function f_emettre_evenement(text, text, text, text, jsonb) to grc_app;

-- Le déclencheur s'appuie désormais dessus : un seul enfilage, donc une seule règle
-- sur ce qui part et ce qui ne part pas.
create or replace function f_enfiler_evenement()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$tr$
begin
    -- ⚠️ **On sort TÔT s'il n'y a pas d'abonné** : sans cela, chaque création
    -- d'incident paierait un parcours de table pour rien, sur toutes les
    -- installations — et elles n'auront, pour la plupart, jamais d'abonnement.
    if new.filiale_id is null then
        return new;
    end if;
    if not exists (select 1 from abonnements_evenements a
                    where a.filiale_id = new.filiale_id
                      and a.evenement = tg_argv[0] and a.actif)
    then
        return new;
    end if;

    perform f_emettre_evenement(tg_argv[0], new.filiale_id, tg_table_name::text, new.id);
    return new;
end;
$tr$;

-- =====================================================================================
-- §2 — LA DÉCLARATION
-- =====================================================================================

create or replace function f_evenements_emis()
returns table (evenement text, emission text, note text)
    language sql immutable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$ev$
    select * from (values
        ('incident_cree',       'declencheur',
         'A l''insertion d''une ligne dans « incidents ».'),
        ('approbation_refusee', 'declencheur',
         'A l''insertion d''un refus dans « approbations ».'),
        ('action_creee',        'declencheur',
         'A l''insertion d''une ligne dans « actions » — c''est la moitie « aller » de '
         'l''action 22.6, le retour se faisant par jeton d''API sur la route generique.'),
        ('echeance_franchie',   'service',
         'Constate par le minuteur des relances (lot L12), qui parcourt deja '
         'l''echeancier. Un franchissement n''est l''insertion d''AUCUNE ligne : c''est '
         'un fait derive, et aucun declencheur ne peut le voir.')
    ) as d(evenement, emission, note);
$ev$;

comment on function f_evenements_emis() is
    'Les evenements que le produit EMET, et par quel moyen (action 22.3). ⚠️ C''est une '
    'liste ECRITE, et c''est le bon outil ici : son omission fait echouer BRUYAMMENT '
    'f_verifier_evenements_emis(), ce qui est le cas (b) du tableau des listes du '
    'CLAUDE.md §3. ⚠️ Une decouverte pure ne suffisait pas : aucune ne voit un emetteur '
    'ecrit en TypeScript — pg_depend ne suit pas les appels d''un corps PL/pgSQL '
    '(CONVENTIONS.md §39.8), et encore moins ceux d''un service. S''arreter aux '
    'declencheurs aurait declare « echeance_franchie » inexistant.';

-- =====================================================================================
-- §3 — LE GARDE-FOU, DANS LES DEUX SENS
-- =====================================================================================

create or replace function f_verifier_evenements_emis()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    v_d       record;
    v_trouve  text;
    v_accepte boolean;
begin
    if to_regprocedure('public.f_evenements_emis()') is null then
        objet    := 'f_evenements_emis';
        anomalie := 'declaration_evenements_absente';
        detail   := 'La declaration des evenements emis a disparu : l''ecran des '
                    'abonnements proposerait a nouveau des evenements que rien n''emet.';
        return next;
        return;
    end if;

    -- ── 1. TOUT CE QUI EST DÉCLARÉ EST ADMIS PAR LA CONTRAINTE ───────────────────
    --    Sinon l'écran propose un abonnement que la base refuse d'écrire.
    for v_d in select * from f_evenements_emis() loop
        v_accepte := f_contrainte_accepte(
            'abonnements_evenements', 'ck_abonnements_evenements_evenement',
            jsonb_build_object('evenement', v_d.evenement));
        if v_accepte is distinct from true then
            objet    := 'abonnements_evenements.' || v_d.evenement;
            anomalie := 'evenement_declare_non_admis';
            detail   := format('L''evenement « %s » est declare emis, et la contrainte '
                               'le REFUSE : l''ecran le proposerait, et l''abonnement '
                               'echouerait a l''ecriture.', v_d.evenement);
            return next;
        end if;

        -- ── 2. UN ÉVÉNEMENT DÉCLARÉ « declencheur » A UN DÉCLENCHEUR ────────────
        if v_d.emission = 'declencheur' then
            select t.tgname into v_trouve
              from pg_trigger t
              join pg_proc p on p.oid = t.tgfoid
             where p.proname = 'f_enfiler_evenement'
               and not t.tgisinternal
               and split_part(encode(t.tgargs, 'escape'), chr(92) || '000', 1)
                   = v_d.evenement
             limit 1;
            if v_trouve is null then
                objet    := 'evenement.' || v_d.evenement;
                anomalie := 'evenement_declare_sans_declencheur';
                detail   := format('« %s » est declare emis PAR UN DECLENCHEUR, et aucun '
                                   'declencheur ne l''emet. Un exploitant s''abonnerait, '
                                   'l''ecran montrerait l''abonnement actif, la file '
                                   'resterait vide, et rien ne dirait pourquoi.',
                                   v_d.evenement);
                return next;
            end if;
        end if;
    end loop;

    -- ── 3. L'AUTRE SENS : UN DÉCLENCHEUR QUI ÉMET CE QUI N'EST PAS DÉCLARÉ ───────
    --    L'écran ne le proposerait jamais : l'événement partirait pour personne.
    for v_trouve in
        select distinct split_part(encode(t.tgargs, 'escape'), chr(92) || '000', 1)
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where p.proname = 'f_enfiler_evenement' and not t.tgisinternal
    loop
        if not exists (select 1 from f_evenements_emis() e
                        where e.evenement = v_trouve) then
            objet    := 'evenement.' || v_trouve;
            anomalie := 'evenement_emis_non_declare';
            detail   := format('Un declencheur emet « %s », qui n''est declare nulle '
                               'part : l''ecran des abonnements ne le proposera jamais, '
                               'et l''evenement partira pour personne.', v_trouve);
            return next;
        end if;
    end loop;

    -- ── 4. LA CONTRAINTE N'ADMET RIEN AU-DELÀ DE LA DÉCLARATION ─────────────────
    v_accepte := f_contrainte_accepte(
        'abonnements_evenements', 'ck_abonnements_evenements_evenement',
        jsonb_build_object('evenement', 'evenement-qui-n-existe-pas'));
    if v_accepte is distinct from false then
        objet    := 'abonnements_evenements.ck_abonnements_evenements_evenement';
        anomalie := 'vocabulaire_evenements_ouvert';
        detail   := 'La contrainte accepte un evenement arbitraire : le vocabulaire a '
                    'cesse d''etre clos, et la confrontation ci-dessus ne mesure plus '
                    'rien — elle passerait sur n''importe quelle valeur.';
        return next;
    end if;

    return;
end;
$fn$;

comment on function f_verifier_evenements_emis() is
    'Confronte la declaration des evenements emis au reel, DANS LES DEUX SENS (action '
    '22.3) : declare mais refuse par la contrainte, declare « declencheur » sans '
    'declencheur, emis par un declencheur sans etre declare, et vocabulaire cesse d''etre '
    'clos. ⚠️ Ce garde est ne d''un defaut REEL : « echeance_franchie » etait admis depuis '
    'la 053 et emis par personne — la barriere de la 053 regardait dans une direction, et '
    'le trou etait dans l''autre. Decouvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §4 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('056', 'Ce qui est ADMIS n''est pas ce qui est EMIS : « echeance_franchie » etait '
               'admis depuis la 053 et emis par personne. L''enfilage est extrait du '
               'declencheur pour qu''un fait DERIVE puisse l''emettre, la liste des '
               'emetteurs est declaree, et un garde-fou la confronte au reel dans les '
               'deux sens')
on conflict (version) do nothing;

commit;
