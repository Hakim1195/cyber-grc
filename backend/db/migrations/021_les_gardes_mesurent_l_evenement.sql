-- =====================================================================================
--  021 — UN GARDE-FOU QUI RECONNAÎT N'EST PAS UN GARDE-FOU QUI MESURE
-- -------------------------------------------------------------------------------------
--  §1  `f_verifier_declencheurs_pieces()` — l'événement, pas seulement le nom
--  §2  `f_verifier_publication_documents()` — idem
--  §3  Consignation, vérification
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-281, 7ᵉ passage de la porte S8 (09/09/2026)
--
--  Les deux garde-fous posés par les migrations `017` et `019` interrogent `pg_trigger`
--  sur le NOM DE LA FONCTION appelée et sur `tgenabled = 'A'` (armé « always »). Ni l'un
--  ni l'autre ne regarde `tgtype`, c'est-à-dire **sur quel événement le déclencheur se
--  déclenche**.
--
--  L'auditeur a déplacé les événements et rejoué le dispositif :
--
--      · les 32 déclencheurs de pièces : `after delete`  →  `after insert`
--      · la barrière de publication    : `before update` →  `before insert`
--
--  `f_verifier_schema()` a rendu **0 anomalie**. `migrate.mjs` et `install.sh
--  --diagnostic` sont restés **au vert**. Les deux barrières étaient **mortes**.
--
--  ⚠️ **Ce n'est pas un défaut de plus : c'est le défaut que tout ce dispositif existe
--  pour empêcher, arrivé au dispositif lui-même.** Le `CLAUDE.md` le formule depuis le
--  premier jour — *un garde-fou que rien n'appelle est un commentaire* —, et sa forme
--  aggravée est celle-ci : *un garde-fou qu'on appelle et qui reconnaît au lieu de
--  mesurer est pire qu'absent, parce qu'il donne à croire que le cas est couvert.* Le
--  verdict vert de ces deux gardes a été cité comme preuve que D2 et D5 tenaient, dans
--  trois documents.
--
--  ── CE QUI EST ATTENDU, ET COMMENT ON LE LIT ──────────────────────────────────────────
--
--  `pg_trigger.tgtype` est un masque de bits :
--
--      1  = FOR EACH ROW        4  = INSERT        16 = UPDATE        64 = INSTEAD OF
--      2  = BEFORE (sinon AFTER) 8 = DELETE        32 = TRUNCATE
--
--  Mesuré sur la recette avant cette migration :
--
--      f_pieces_suivent_leur_porteur              tgtype =  9   →  AFTER DELETE, FOR EACH ROW
--      f_document_publication_exige_approbation   tgtype = 19   →  BEFORE INSERT OR UPDATE… non :
--                                                                  19 = 1+2+16 → BEFORE UPDATE, ROW
--
--  ⚠️ **On vérifie les BITS QUI COMPTENT, pas l'égalité stricte du masque.** Exiger
--  `tgtype = 9` interdirait d'ajouter un jour `after delete or truncate` — une extension
--  légitime ferait rougir un garde-fou, et un garde-fou qui rougit à tort finit par être
--  contourné. On exige donc : le bon moment (BEFORE / AFTER), la bonne opération, et le
--  niveau ligne.
--
--  ⚠️ **Ce que cette migration NE fait PAS** : elle ne corrige pas le constat **Q-280**
--  (la barrière de publication se contourne par `POST /api/reprise`, qui INSÈRE au lieu
--  de mettre à jour). Elle en est le **préalable** : tant que le garde ne mesure pas
--  l'événement, ajouter l'`insert` à la barrière ne serait vérifié par rien.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LES DÉCLENCHEURS DE PIÈCES : « AFTER DELETE », niveau ligne
-- =====================================================================================

create or replace function f_verifier_declencheurs_pieces_evenement()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record;
begin
    for r in
        select c.relname, t.tgname, t.tgtype
          from pg_trigger t
          join pg_proc  p on p.oid = t.tgfoid
          join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal
           and p.proname = 'f_pieces_suivent_leur_porteur'
         order by c.relname
    loop
        -- AFTER (bit 2 à zéro) · DELETE (bit 8) · FOR EACH ROW (bit 1)
        if (r.tgtype & 2) <> 0 or (r.tgtype & 8) = 0 or (r.tgtype & 1) = 0 then
            objet    := r.relname || '.' || r.tgname;
            anomalie := 'declencheur_mauvais_evenement';
            detail   := 'Ce déclencheur appelle bien f_pieces_suivent_leur_porteur, mais il '
                        'ne se déclenche pas sur « AFTER DELETE … FOR EACH ROW » (tgtype = '
                        || r.tgtype || '). Une pièce jointe ne suivrait donc PAS son porteur : '
                        'elle resterait EN BASE, SUR LE DISQUE et DANS LE QUOTA de la filiale '
                        '(constats Q-232 / Q-233). ⚠️ Le garde-fou de la migration 017 ne '
                        'regardait que le NOM de la fonction : il rendait « aucune anomalie » '
                        'sur un déclencheur déplacé (constat Q-281).';
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_declencheurs_pieces_evenement() is
    'Constat Q-281 : vérifie que les déclencheurs de pieces_jointes se déclenchent bien '
    'sur AFTER DELETE … FOR EACH ROW, et pas seulement qu''ils existent. Complète '
    'f_verifier_declencheurs_pieces(), qui mesure la COUVERTURE (quelles tables, quels '
    'arguments) sans mesurer l''ÉVÉNEMENT.';

-- =====================================================================================
-- §2 — LA BARRIÈRE DE PUBLICATION : « BEFORE UPDATE », niveau ligne
-- =====================================================================================

create or replace function f_verifier_publication_evenement()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record;
begin
    for r in
        select t.tgname, t.tgtype
          from pg_trigger t
          join pg_proc  p on p.oid = t.tgfoid
         where not t.tgisinternal
           and t.tgrelid = 'documents'::regclass
           and p.proname = 'f_document_publication_exige_approbation'
    loop
        -- BEFORE (bit 2) · UPDATE (bit 16) · FOR EACH ROW (bit 1)
        if (r.tgtype & 2) = 0 or (r.tgtype & 16) = 0 or (r.tgtype & 1) = 0 then
            objet    := 'documents.' || r.tgname;
            anomalie := 'barriere_publication_mauvais_evenement';
            detail   := 'Ce déclencheur appelle bien f_document_publication_exige_approbation, '
                        'mais il ne se déclenche pas sur « BEFORE UPDATE … FOR EACH ROW » '
                        '(tgtype = ' || r.tgtype || '). Un document pourrait donc passer « en '
                        'vigueur » sans publication approuvée, et le registre afficherait une '
                        'politique que personne n''a validée. ⚠️ Le garde-fou de la migration '
                        '019 ne regardait que le NOM de la fonction et l''armement « always » : '
                        'il rendait « aucune anomalie » sur un déclencheur déplacé (Q-281).';
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_publication_evenement() is
    'Constat Q-281 : vérifie que la barrière de publication se déclenche bien sur BEFORE '
    'UPDATE … FOR EACH ROW. ⚠️ Le jour où le constat Q-280 sera fermé, la barrière devra '
    'mordre AUSSI à l''INSERT (POST /api/reprise crée au lieu de mettre à jour) : c''est '
    'CETTE fonction qu''il faudra alors élargir, sans quoi l''élargissement ne serait '
    'vérifié par rien.';

grant execute on function f_verifier_declencheurs_pieces_evenement() to grc_app;
grant execute on function f_verifier_publication_evenement()        to grc_app;

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
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 021 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, ÉVÉNEMENTS des déclencheurs compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('021', 'les garde-fous mesurent l''ÉVÉNEMENT des déclencheurs, pas seulement leur '
               'nom — constat Q-281 du 7ᵉ passage de la porte S8')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_declencheurs_pieces_evenement();
--   drop function if exists f_verifier_publication_evenement();
--   delete from controles_schema where fonction in (
--       'f_verifier_declencheurs_pieces_evenement', 'f_verifier_publication_evenement');
--   delete from migrations_schema where version = '021';
--   commit;
-- =====================================================================================
