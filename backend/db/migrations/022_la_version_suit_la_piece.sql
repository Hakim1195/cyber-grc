-- =====================================================================================
--  022 — LA VERSION D'UNE FICHE SUIT LA PIÈCE QUI LA PORTE, SUR TOUS LES CHEMINS
-- -------------------------------------------------------------------------------------
--  §1  Le relais, dans la base
--  §2  Le garde-fou
--  §3  Consignation, vérification
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-282, 7ᵉ passage de la porte S8 (10/09/2026)
--
--  L'action D1 existe pour une phrase, écrite dans `src/pieces/index.ts` :
--
--      « la version d'une politique se déclare avec le fichier qui la porte, PAS dans un
--        champ voisin qui peut annoncer “2.1” au-dessus du PDF de la 1.4 »
--
--  `documents.version_document` est pourtant écrit par **une route et une seule** — la
--  promotion `POST …/en-vigueur`. Supprimez ensuite la pièce, et le champ subsiste :
--
--      POST   …/pieces          version=1.4        → PJ-…
--      POST   …/<pj>/en-vigueur                    → 200,  version_document = 1.4
--      DELETE …/<pj>                               → 204,  version_document = 1.4
--                                                          pièces restantes = 0
--
--  Ce n'est plus « 2.1 au-dessus du PDF de la 1.4 » : c'est **1.4 au-dessus de rien**, et
--  `GET /api/donnees` sert ce « 1.4 » à la SPA. Le produit sert de preuve en audit.
--
--  ── POURQUOI DANS LA BASE, ET PAS DANS LA ROUTE DE SUPPRESSION ────────────────────────
--
--  C'est la leçon de **D2**, écrite au `CONVENTIONS.md` §8.1 et payée par les constats
--  Q-232 / Q-233 : *le relais d'une cascade que le schéma ne peut pas exprimer se prend
--  DANS LA BASE, sur la table porteuse, jamais dans les routes. Une route ne voit que son
--  chemin ; il y en a toujours un de plus.* Les chemins qui retirent une pièce sont ici :
--  la route de suppression, le déclencheur de la migration `017` quand le porteur
--  disparaît, une cascade, et `psql`. Un correctif de route en couvrirait un.
--
--  ── LA VALEUR EST RECALCULÉE, JAMAIS EFFACÉE ──────────────────────────────────────────
--
--  Le déclencheur ne met pas `null` : il **relit** la pièce marquée « en vigueur » pour ce
--  document et pose sa version — donc `null` s'il n'y en a plus, et la bonne valeur s'il en
--  reste une (démotion d'une pièce au profit d'une autre). Poser `null` aveuglément aurait
--  effacé la version dans le cas où une autre pièce fait encore foi.
--
--  ⚠️ **`security definer`, et le motif est mesuré.** Le déclencheur écrit dans `documents`
--  depuis la session qui supprime la pièce. Une politique de portée **Groupe** n'est pas
--  modifiable depuis une session de filiale : sans `definer`, la mise à jour toucherait
--  **zéro ligne** et le champ resterait périmé — c'est-à-dire le défaut qu'on ferme,
--  conservé pour le seul cas où il est le plus visible. La fonction ne peut rien divulguer :
--  elle écrit, dans le document que la pièce désignait, une valeur tirée des pièces de ce
--  même document. Elle n'est appelable que par le déclencheur, et l'exécution est retirée
--  à `public` (`CONVENTIONS.md` §11, constat Q-136).
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE RELAIS
-- =====================================================================================

create or replace function f_version_document_suit_la_piece()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_document text;
    v_version  text;
begin
    v_document := coalesce(old.entite_id, new.entite_id);
    if coalesce(old.entite_type, new.entite_type) is distinct from 'documents' then
        return null;
    end if;

    -- ⚠️ **NE RIEN FAIRE quand rien ne fait foi, ni avant ni après.** Sans cette
    -- garde, déposer une pièce ORDINAIRE — non promue — effaçait la version que
    -- l'utilisateur avait saisie à la main sur la fiche. C'est une régression
    -- que la première rédaction de ce déclencheur a introduite, et que l'essai
    -- « LA MATIÈRE » de D1 a attrapée immédiatement : il pose délibérément une
    -- saisie libre (« 0.9-projet ») pour prouver que la promotion la remplace.
    -- Le relais n'a d'objet que si une pièce EN VIGUEUR entre en scène ou en
    -- sort ; le reste ne le regarde pas.
    if coalesce(old.en_vigueur, false) = false and coalesce(new.en_vigueur, false) = false then
        return null;
    end if;

    select p.version_piece into v_version
      from pieces_jointes p
     where p.entite_type = 'documents'
       and p.entite_id   = v_document
       and p.en_vigueur
     limit 1;

    update documents
       set version_document = v_version
     where id = v_document
       and version_document is distinct from v_version;

    -- ⚠️ **Aucune exception si rien n'est touché, et c'est délibéré.** La RLS est
    -- FORCÉE, `security definer` n'y change rien : une session dont le périmètre
    -- ne couvre pas ce document — une politique de portée Groupe vue depuis une
    -- filiale — ne pourra pas le mettre à jour. Lever ici ferait **échouer la
    -- suppression de la pièce**, c'est-à-dire casser un geste légitime pour
    -- corriger un affichage. Le résidu est nommé au registre (Q-282) : la fiche
    -- garde alors son numéro jusqu'à ce qu'une session qui en a le droit touche
    -- une de ses pièces.

    return null;
end;
$$;

comment on function f_version_document_suit_la_piece() is
    'Constat Q-282 : « version_document » est RECALCULÉ depuis la pièce en vigueur dès '
    'qu''une pièce de ce document apparaît, change d''état ou disparaît — quel que soit le '
    'chemin (route, déclencheur 017, cascade, psql). Sans lui, supprimer la pièce qui fait '
    'foi laissait la fiche annoncer sa version AU-DESSUS DE ZÉRO FICHIER. « security '
    'definer » : une politique de portée Groupe n''est pas modifiable depuis une session de '
    'filiale, et sans cela le relais toucherait zéro ligne dans le cas le plus visible.';

drop trigger if exists trg_pieces_version_document on pieces_jointes;
create trigger trg_pieces_version_document
    after insert or delete or update of en_vigueur, version_piece on pieces_jointes
    for each row execute function f_version_document_suit_la_piece();

-- « always » : mêmes motifs qu'au §19.4 — « set session_replication_role = replica »
-- désarmerait le relais avec le déclencheur.
alter table pieces_jointes enable always trigger trg_pieces_version_document;

-- ── PAS DE RATTRAPAGE DES FICHES DÉJÀ MENTEUSES, ET C'EST LE SCHÉMA QUI L'INTERDIT ─────
--
-- La tentation était d'ajouter ici un `update` qui remet toutes les fiches d'accord avec
-- leur pièce. **Le produit s'y refuse, et il a raison** : une migration s'exécute sous
-- `grc_proprietaire`, la RLS est **forcée** — le propriétaire y est soumis comme tout le
-- monde —, et le garde-fou `GRC04` refuse toute lecture d'une table cloisonnée par une
-- transaction qui n'a pas déclaré son périmètre :
--
--     ERR 022 : Périmètre non positionné : la transaction lit une table cloisonnée sans
--               avoir déclaré grc.filiales.
--
-- ⚠️ **Trois tentatives, et le refus a tenu aux trois** — `update` direct, puis une
-- fonction « security definer », puis la même en fonction temporaire. `security definer`
-- change l'UTILISATEUR, pas le fait que la RLS est forcée : seul un superutilisateur y
-- échapperait, et le `PLAN_SERVEUR` §1.9 interdit que le produit en emploie un.
--
-- **Ce n'est donc pas une limite à contourner, c'est la promesse centrale du produit qui
-- fonctionne** : aucune écriture ne traverse les filiales, pas même la nôtre, pas même
-- pour bien faire. Une correction de données qui exige de voir vingt filiales à la fois
-- est une correction qui doit se faire filiale par filiale, depuis une session qui en a
-- le droit.
--
-- **Les fiches déjà menteuses convergent d'elles-mêmes** : le déclencheur ci-dessus
-- recalcule `version_document` dès qu'une pièce de ce document est ajoutée, promue,
-- démue ou retirée. Une fiche qui n'a plus aucune pièce et porte encore un numéro reste
-- fausse jusqu'à ce qu'on lui en dépose une — c'est le résidu, il est nommé au registre
-- avec le constat Q-282, et il ne concerne que les fiches abîmées AVANT cette migration.

-- =====================================================================================
-- §2 — LE GARDE-FOU — et il MESURE L'ÉVÉNEMENT (leçon de la migration 021)
-- =====================================================================================

create or replace function f_verifier_version_suit_piece()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record; v_vu boolean := false;
begin
    for r in
        select t.tgname, t.tgtype, t.tgenabled
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where not t.tgisinternal
           and t.tgrelid = 'pieces_jointes'::regclass
           and p.proname = 'f_version_document_suit_la_piece'
    loop
        v_vu := true;
        -- AFTER (bit 2 à zéro) · INSERT (4) · DELETE (8) · UPDATE (16) · ROW (1)
        if (r.tgtype & 2) <> 0 or (r.tgtype & 1) = 0
           or (r.tgtype & 4) = 0 or (r.tgtype & 8) = 0 or (r.tgtype & 16) = 0 then
            objet := 'pieces_jointes.' || r.tgname;
            anomalie := 'relais_version_mauvais_evenement';
            detail := 'Le relais de version doit se déclencher sur « AFTER INSERT OR DELETE '
                      'OR UPDATE … FOR EACH ROW » (tgtype = ' || r.tgtype || '). Amputé d''un '
                      'événement, la fiche document annoncerait de nouveau une version '
                      'au-dessus de zéro fichier (constat Q-282).';
            return next;
        end if;
        if r.tgenabled <> 'A' then
            objet := 'pieces_jointes.' || r.tgname;
            anomalie := 'relais_version_desarmable';
            detail := 'Le relais n''est plus armé en « always » : « set session_replication_'
                      'role = replica » le neutraliserait.';
            return next;
        end if;
    end loop;

    if not v_vu then
        objet := 'pieces_jointes.trg_pieces_version_document';
        anomalie := 'relais_version_absent';
        detail := 'Aucun déclencheur n''appelle f_version_document_suit_la_piece() : '
                  'supprimer la pièce qui fait foi laisserait la fiche annoncer sa version '
                  'au-dessus de zéro fichier (constat Q-282). Rejouez le §1 de la 022.';
        return next;
    end if;
    return;
end;
$$;

comment on function f_verifier_version_suit_piece() is
    'Constat Q-282, et il MESURE L''ÉVÉNEMENT dès sa première rédaction — c''est la leçon '
    'de la migration 021 (constat Q-281) : un garde-fou qui reconnaît un déclencheur sans '
    'regarder « tgtype » rend « aucune anomalie » sur une barrière morte.';

grant execute on function f_verifier_version_suit_piece() to grc_app;

-- =====================================================================================
-- §3 — CONSIGNATION ET VÉRIFICATION
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
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 022 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, relais de version compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('022', 'la version d''une fiche document suit la pièce qui la porte, sur tous les '
               'chemins — constat Q-282 du 7ᵉ passage de la porte S8')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop trigger if exists trg_pieces_version_document on pieces_jointes;
--   drop function if exists f_version_document_suit_la_piece();
--   drop function if exists f_verifier_version_suit_piece();
--   delete from controles_schema where fonction = 'f_verifier_version_suit_piece';
--   delete from migrations_schema where version = '022';
--   commit;
-- =====================================================================================
