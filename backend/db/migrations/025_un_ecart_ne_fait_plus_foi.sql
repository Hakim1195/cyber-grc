-- =====================================================================================
--  025 — UNE PIÈCE DONT L'INTÉGRITÉ EST EN ÉCART NE FAIT PLUS FOI
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-285, 7ᵉ passage de la porte S8 (10/09/2026)
--
--  La migration `020` a donné au produit de quoi CONSTATER qu'un fichier du magasin ne
--  correspond plus à son empreinte : la route `GET …/integrite`, et un balayage sur le
--  minuteur qui **inscrit** le verdict et **sort en code 1**. L'auditeur l'a joué, fichier
--  altéré à la main :
--
--      INTÉGRITÉ : le fichier du magasin ne correspond plus à son empreinte.
--      Intégrité : 1 pièce rapprochée, 0 conforme, 1 écart, 0 fichier absent.
--      psql : etat_integrite = ecart | derniere_verification = 2026-09-10 09:31:34
--
--  **Le dispositif fonctionne. Et il n'en tire aucune conséquence.**
--  `ck_pieces_jointes_en_vigueur` exige `etat_analyse = 'saine'` et pas de quarantaine ;
--  **`etat_integrite` n'y entre pas**. Une pièce dont on vient d'établir que son contenu a
--  changé continue donc de porter le badge « en vigueur » — c'est-à-dire de **faire foi**,
--  dans un outil produit en audit ISO 27001.
--
--  ── CE QU'ON FAIT, ET CE QU'ON NE FAIT PAS ────────────────────────────────────────────
--
--  ⚠️ **On ne cesse PAS de délivrer le fichier.** `CONDITION_DELIVRABLE` n'est pas touchée :
--  refuser la délivrance retirerait à l'exploitant le seul moyen d'aller VOIR ce que le
--  fichier est devenu — au moment précis où il en a besoin. Un écart d'intégrité est une
--  alerte, pas une mise sous scellés.
--
--  ⚠️ **On cesse de dire qu'il FAIT FOI.** C'est exactement la distinction que l'action D1
--  a introduite : « en vigueur » n'est pas « présent », c'est *« celle-ci est la pièce qui
--  fait référence »*. Une pièce dont l'empreinte ne correspond plus ne peut pas tenir ce
--  rôle, et le lui laisser tenir est le seul vrai défaut ici.
--
--  ⚠️ **`not valid`, et ce n'est pas un raccourci.** La contrainte ne vérifie pas les lignes
--  DÉJÀ en base — pour la même raison qu'aux migrations `022` et à l'annulation de la 024 :
--  une migration ne peut pas parcourir une table cloisonnée sans périmètre, et la RLS est
--  FORCÉE, propriétaire compris. `not valid` borne donc **l'avenir** : toute écriture
--  ultérieure est vérifiée. Une pièce déjà en écart ET en vigueur — s'il en existe — sera
--  refusée à sa prochaine mise à jour, et le balayage la nommera d'ici là. La validation a
--  posteriori (`validate constraint`) se fera filiale par filiale, depuis une session qui
--  en a le droit ; c'est inscrit au registre.
-- =====================================================================================

begin;

alter table pieces_jointes
    add constraint ck_pieces_jointes_en_vigueur_integre
    check (not en_vigueur or etat_integrite is distinct from 'ecart')
    not valid;

comment on constraint ck_pieces_jointes_en_vigueur_integre on pieces_jointes is
    'Constat Q-285 : une pièce dont le rapprochement d''intégrité a rendu « ecart » ne peut '
    'plus être marquée « en vigueur ». Le dispositif de la migration 020 CONSTATAIT l''écart '
    'sans en tirer de conséquence : la pièce continuait de FAIRE FOI. ⚠️ La délivrance, '
    'elle, n''est PAS touchée — un écart est une alerte, pas une mise sous scellés, et '
    'l''exploitant doit pouvoir aller voir ce que le fichier est devenu.';

-- ── Le garde-fou : la contrainte existe, ET elle porte sur le bon champ ─────────────────
create or replace function f_verifier_ecart_ne_fait_pas_foi()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare v_def text;
begin
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'pieces_jointes'::regclass
       and c.conname  = 'ck_pieces_jointes_en_vigueur_integre';

    if v_def is null then
        objet    := 'pieces_jointes.ck_pieces_jointes_en_vigueur_integre';
        anomalie := 'ecart_peut_faire_foi';
        detail   := 'Rien n''empêche une pièce dont l''intégrité est en écart de porter '
                    '« en vigueur ». Le rapprochement de la migration 020 constaterait '
                    'l''écart, l''inscrirait, sortirait en code 1 — et la pièce continuerait '
                    'de FAIRE FOI dans un outil produit en audit (constat Q-285).';
        return next;
        return;
    end if;

    -- ⚠️ On vérifie que la contrainte parle bien d'`etat_integrite` : une contrainte du bon
    -- nom portant sur autre chose serait le défaut que le constat Q-281 a rendu célèbre —
    -- un garde qui reconnaît au lieu de mesurer.
    if position('etat_integrite' in v_def) = 0 or position('en_vigueur' in v_def) = 0 then
        objet    := 'pieces_jointes.ck_pieces_jointes_en_vigueur_integre';
        anomalie := 'ecart_contrainte_hors_sujet';
        detail   := 'La contrainte existe mais ne met pas en rapport « en_vigueur » et '
                    '« etat_integrite » : ' || v_def;
        return next;
    end if;
    return;
end;
$$;

comment on function f_verifier_ecart_ne_fait_pas_foi() is
    'Constat Q-285. ⚠️ Vérifie le CONTENU de la contrainte, pas seulement son existence : '
    'une contrainte du bon nom portant sur autre chose est le défaut du constat Q-281.';

grant execute on function f_verifier_ecart_ne_fait_pas_foi() to grc_app;

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
        raise exception 'Le schéma est en défaut après 025 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, un écart ne fait plus foi.';
end;
$$;

insert into migrations_schema (version, nom)
values ('025', 'une pièce dont l''intégrité est en écart ne peut plus être « en vigueur » — '
               'le dispositif de la 020 constatait sans conclure (constat Q-285)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   alter table pieces_jointes drop constraint if exists ck_pieces_jointes_en_vigueur_integre;
--   drop function if exists f_verifier_ecart_ne_fait_pas_foi();
--   delete from controles_schema where fonction = 'f_verifier_ecart_ne_fait_pas_foi';
--   delete from migrations_schema where version = '025';
--   commit;
-- =====================================================================================
