-- =====================================================================================
--  015 — Le souligné initial est réservé aux champs que le SERVEUR ajoute
-- -------------------------------------------------------------------------------------
--  §1  Le garde-fou
--  §2  Consignation, vérification
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-201 de la porte S6
--
--  Le serveur ajoute à l'enregistrement qu'il rend des champs qui ne sont PAS des
--  colonnes : `_version` et `_versionMiseEnOeuvre` (le verrouillage optimiste, tenus
--  hors de l'enregistrement pour que `data` garde sa forme), et `_porteeGroupe`
--  (constat Q-176, vrai quand la ligne est au niveau Groupe).
--
--  `js/core/sync.js` doit les écarter du corps qu'il renvoie, sans quoi le serveur les
--  refuse — et le produit affichait alors « Champs non reconnus par le serveur, donc
--  NON ENREGISTRÉS » **après un enregistrement qui avait réussi**. Un message qui
--  annonce une perte là où il n'y en a pas est pire qu'un silence : il apprend à
--  l'utilisateur à ne plus croire les bandeaux, y compris le jour où ils disent vrai.
--
--  ⚠️ LA RÈGLE EST LE PRÉFIXE, PAS LA LISTE DES TROIS NOMS. Une liste écrite à la main
--  manquerait le quatrième champ structurel du jour où il sera ajouté, et le défaut
--  reviendrait — une omission qui fait « réussir quelque chose en silence alors que
--  c'est faux », donc le mauvais outil (`CLAUDE.md` §3, premier cas).
--
--  Mais un préfixe réservé côté navigateur ne vaut que si le schéma le respecte : une
--  colonne métier nommée `_x` serait SILENCIEUSEMENT écartée de toute écriture, et
--  l'utilisateur verrait sa saisie disparaître sans un mot. C'est très exactement le
--  genre de défaut que ce dépôt paie le plus cher. Ce garde-fou est donc la SECONDE
--  MOITIÉ de la règle : il la vérifie là où elle peut être enfreinte.
--
--  Mesuré avant écriture, sur la base de recette : aucune des colonnes du schéma ne
--  commence par un souligné. Le garde-fou naît vert, et il naît utile.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Il DÉCOUVRE dans `pg_catalog` — jamais une liste de tables recopiée. Une table neuve
-- est donc couverte le jour où elle est créée, sans que personne ait à y penser.
-- =====================================================================================

create or replace function f_verifier_champs_structurels()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        select c.relname as table_nom, a.attname as colonne
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
         where n.nspname = 'public'
           and c.relkind = 'r'
           and a.attnum > 0
           and not a.attisdropped
           and a.attname like '\_%'
         order by c.relname, a.attname
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'prefixe_reserve_au_serveur';
        detail   := 'Le souligné initial est réservé aux champs que le serveur AJOUTE à '
                    'l''enregistrement et qui ne sont pas des colonnes (« _version », '
                    '« _versionMiseEnOeuvre », « _porteeGroupe »). `js/core/sync.js` les '
                    'écarte du corps qu''il renvoie, par le PRÉFIXE et non par une liste '
                    '(constat Q-201). Une colonne portant ce préfixe serait donc écartée '
                    'de toute écriture EN SILENCE, et la saisie de l''utilisateur '
                    'disparaîtrait sans un mot. Renommez la colonne.';
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_champs_structurels() is
    'Refuse toute colonne dont le nom commence par un souligné. Seconde moitié d''une '
    'règle dont la première vit dans « js/core/sync.js » : le navigateur écarte du corps '
    'qu''il renvoie tout champ à souligné initial, parce que le serveur en ajoute qui ne '
    'sont pas des colonnes. Sans ce garde-fou, une colonne métier ainsi nommée serait '
    'écartée en silence de toute écriture (constat Q-201, porte S6). Découvre dans '
    'pg_catalog : une table neuve est couverte le jour où elle est créée.';

-- =====================================================================================
-- §2 — CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Le registre `controles_schema` DÉCOUVRE les garde-fous par leur nom : rien à ajouter
-- à une liste. Un contrôle qui cesserait d'être découvert ne disparaîtrait plus en
-- silence — c'est l'objet du constat Q-5.
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
        raise exception 'Le schéma est en défaut après 015 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, garde-fou du préfixe compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('015', 'le souligné initial est réservé aux champs que le serveur ajoute — sans quoi '
               'une colonne ainsi nommée serait écartée de toute écriture en silence (Q-201)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_champs_structurels();
--   delete from controles_schema where fonction = 'f_verifier_champs_structurels';
--   delete from migrations_schema where version = '015';
--   commit;
-- ⚠️ La rejouer laisse « js/core/sync.js » écarter par préfixe SANS que rien ne
--    garantisse qu'aucune colonne métier ne porte ce préfixe.
-- =====================================================================================
