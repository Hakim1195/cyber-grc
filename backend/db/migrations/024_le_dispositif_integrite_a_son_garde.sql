-- =====================================================================================
--  024 — LE DISPOSITIF D'INTÉGRITÉ A ENFIN SON GARDE-FOU
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-289, 7ᵉ passage de la porte S8 (10/09/2026)
--
--  Les migrations `017`, `018` et `019` apportent chacune sa fonction `f_verifier_*`,
--  découverte par le point d'appel unique et consignée au registre. **La `020` n'en apporte
--  aucune.** Rien, dans `f_verifier_schema()`, ne vérifie que les objets sur lesquels repose
--  la vérification d'intégrité existent encore.
--
--  L'objection est recevable, et l'auditeur la formule lui-même : *« le dispositif
--  d'intégrité est du CODE, pas du schéma »*. C'est vrai de la route et du balayage. Mais il
--  **repose sur trois objets de schéma** — deux colonnes et deux contraintes —, et si l'un
--  disparaît, le dispositif ne rend plus rien **sans que personne le sache** : le balayage
--  écrirait dans le vide, la route rendrait un verdict qu'aucune colonne ne retient.
--
--  ⚠️ **C'est exactement la forme du constat Q-281**, deux jours plus tôt : un dispositif
--  qu'on croit gardé parce qu'il est là. Ici, il n'était même pas là.
--
--  ⚠️ **Ce que ce garde-fou NE fait PAS, et pourquoi** : il ne vérifie pas que
--  `cyber-grc-reanalyse.timer` est actif. Un garde-fou de SCHÉMA interroge `pg_catalog` ;
--  l'état d'une unité systemd n'y est pas, et l'y faire entrer demanderait à la base de
--  parler au système — ce que le `PLAN_SERVEUR` §1.9 interdit. Le minuteur est du ressort du
--  `--diagnostic`, et c'est là qu'il a été ajouté.
-- =====================================================================================

begin;

create or replace function f_verifier_dispositif_integrite()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_manque text[] := array[]::text[];
    v_col    text;
    v_ct     text;
begin
    /* ── Les deux colonnes ───────────────────────────────────────────────────── */
    foreach v_col in array array['etat_integrite', 'derniere_verification']
    loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = 'pieces_jointes'::regclass
               and a.attname = v_col and a.attnum > 0 and not a.attisdropped)
        then
            v_manque := v_manque || v_col;
        end if;
    end loop;

    if array_length(v_manque, 1) is not null then
        objet    := 'pieces_jointes';
        anomalie := 'dispositif_integrite_incomplet';
        detail   := 'Colonne(s) manquante(s) : ' || array_to_string(v_manque, ', ') ||
                    '. La vérification d''intégrité (route GET …/integrite et balayage du '
                    'minuteur) écrirait alors dans le vide : elle rendrait un verdict '
                    'qu''aucune colonne ne retient, et l''écart d''une pièce ne serait vu '
                    'par personne — ce que la migration 020 existe pour empêcher '
                    '(constats Q-249 / Q-250, garde posé par Q-289).';
        return next;
    end if;

    /* ── Les deux contraintes qui donnent leur sens aux colonnes ─────────────── */
    foreach v_ct in array array['ck_pieces_jointes_integrite', 'ck_pieces_jointes_integrite_datee']
    loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = 'pieces_jointes'::regclass and c.conname = v_ct)
        then
            objet    := 'pieces_jointes.' || v_ct;
            anomalie := 'contrainte_integrite_absente';
            detail   := case v_ct
                when 'ck_pieces_jointes_integrite' then
                    'Sans elle, « etat_integrite » accepte n''importe quelle valeur : un '
                    'verdict mal orthographié passerait pour un verdict, et « ecart » '
                    'cesserait d''être distinguable.'
                else
                    'Sans elle, une pièce peut porter un verdict SANS date, ou une date '
                    'SANS verdict. Un verdict d''intégrité sans date ne prouve rien : il ne '
                    'dit pas de QUAND il parle.'
                end;
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_dispositif_integrite() is
    'Constat Q-289 : la migration 020 était la SEULE des quatre à n''apporter aucun '
    'garde-fou, alors que la vérification d''intégrité repose sur deux colonnes et deux '
    'contraintes de « pieces_jointes ». Ne vérifie PAS le minuteur systemd — un garde-fou '
    'de schéma interroge pg_catalog, et l''état d''une unité n''y est pas ; c''est le '
    'ressort d''install.sh --diagnostic.';

grant execute on function f_verifier_dispositif_integrite() to grc_app;

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
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 024 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, dispositif d''intégrité compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('024', 'le dispositif de vérification d''intégrité a son garde-fou de schéma — la '
               '020 était la seule des quatre à n''en apporter aucun (constat Q-289)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_dispositif_integrite();
--   delete from controles_schema where fonction = 'f_verifier_dispositif_integrite';
--   delete from migrations_schema where version = '024';
--   commit;
-- =====================================================================================

-- =====================================================================================
--  ADDENDUM — le refus GRC05 NOMME les filiales — constat Q-287
-- -------------------------------------------------------------------------------------
--  Le 7ᵉ passage de la porte S8 a joué le cas et confirmé qu'il est **fail-closed et
--  récupérable** : une politique de portée Groupe portant les pièces de deux filiales n'est
--  supprimable depuis aucune session tant qu'on n'a pas fait le tour — mais le tour existe,
--  et il fonctionne (retirer la pièce TLS depuis TLS, basculer sur DEU, retirer la sienne,
--  puis le document).
--
--  **Ce qui manquait est le nom.** Le refus disait « retirez ces pièces depuis la filiale qui
--  les a déposées » **sans dire laquelle**, et un profil dont le périmètre ne couvre qu'une
--  filiale ne peut pas deviner. L'utilisateur voit un refus, ne sait pas où aller, et
--  conclut à une panne.
--
--  ⚠️ **Le nom des filiales est-il une divulgation ?** Non, et c'est mesuré par le contexte :
--  ce message ne s'atteint que depuis une session qui a le droit de **supprimer une politique
--  de portée Groupe**, c'est-à-dire depuis l'administration Groupe — laquelle lit déjà la
--  liste complète des filiales par `GET /api/filiales`. On ne révèle rien de neuf ; on cesse
--  de cacher ce que l'appelant peut déjà lire.
-- =====================================================================================

begin;

create or replace function f_pieces_suivent_leur_porteur() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_types     text[]  := tg_argv;
    v_restantes integer;
    v_filiales  text;
begin
    -- ⚠️ **CORPS REPRIS À L'IDENTIQUE DE LA MIGRATION 017**, la mise en file comprise.
    -- Ma première rédaction de cet addendum ne réécrivait que le `delete` et **perdait
    -- l'insertion dans `pieces_a_purger`** : les fichiers restaient dans le magasin, et
    -- trois essais de la famille `pieces` l'ont dit aussitôt — « FICHIER RÉSIDUEL … a
    -- disparu et son fichier est resté dans le magasin ». *On ne remplace pas une
    -- fonction dont on n'a lu qu'un fragment.* Seul le HINT change ici.
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
    on conflict (chemin_stockage) do nothing;

    select count(*) into v_restantes
      from pieces_jointes
     where entite_type = any (v_types)
       and entite_id   = old.id;

    if v_restantes > 0 then
        -- ⚠️ Constat Q-287 : on NOMME les filiales. Le CODE de la filiale, pas son
        -- identifiant technique — un utilisateur bascule sur un code, pas sur un
        -- « FIL-1788477623975-… ». Si la jointure ne rend rien, on retombe sur
        -- l'ancienne formulation : un message tronqué est pire qu'un message général.
        select string_agg(distinct coalesce(f.code, p.filiale_id), ', ')
          into v_filiales
          from pieces_jointes p
          left join filiales f on f.id = p.filiale_id
         where p.entite_type = any (v_types)
           and p.entite_id   = old.id;

        raise exception
            'Suppression refusée : % pièce(s) jointe(s) de % « % » appartiennent à une '
            'autre filiale et ne peuvent pas être retirées depuis celle-ci.',
            v_restantes, tg_table_name, old.id
            using errcode = 'GRC05',
                  hint = 'Retirez ces pièces depuis ' ||
                         coalesce('la ou les filiales : ' || v_filiales,
                                  'la filiale qui les a déposées') ||
                         ', puis recommencez. Une pièce jointe ne survit jamais à son '
                         'porteur (constats Q-232 / Q-233) : plutôt que de la laisser '
                         'orpheline, la base refuse la suppression.';
    end if;

    return old;
end;
$$;

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s', objet, anomalie), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après l''addendum 024 : %', v_anomalies;
    end if;
end;
$$;

commit;
