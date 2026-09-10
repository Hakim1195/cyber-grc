-- =====================================================================================
--  023 — LA BARRIÈRE DE PUBLICATION FERME SES DEUX VOIES DE CONTOURNEMENT
-- -------------------------------------------------------------------------------------
--  §1  La mémoire du circuit engagé — voie 1
--  §2  L'insertion, par un déclencheur de CONTRAINTE DIFFÉRÉ — voie 2
--  §3  Le garde-fou, élargi
--  §4  Consignation, vérification
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-280, 7ᵉ passage de la porte S8 (10/09/2026)
--
--  La migration `019` écrit dans son propre en-tête qu'elle ferme DEUX cas, et présente le
--  second comme « la moitié que la formulation littérale de D5 laissait ouverte, et qu'un
--  relecteur aurait trouvée en une minute » :
--
--      « un circuit existe pour ce document, quel que soit son statut : ON NE LE CONTOURNE
--        PAS EN REPASSANT PAR “BROUILLON”. »
--
--  L'auditeur a trouvé les deux voies par lesquelles on le contourne quand même.
--
--  ── VOIE 1 — deux gestes dans l'interface ─────────────────────────────────────────────
--
--  La condition était `v_dernier_tour is null AND old.statut is distinct from 'en
--  validation'`. La seconde moitié ne s'arme que s'il existe **au moins une ligne** dans
--  `approbations`. Un document déclaré « en validation » **avant qu'aucune étape n'ait été
--  prononcée** se publie donc ainsi :
--
--      « en validation » → « en vigueur »   → 409 GRC06, refus journalisé
--      « en validation » → « brouillon »    → 200
--      « brouillon »     → « en vigueur »   → 200, publié sans une seule approbation
--
--  ⚠️ **Le refus et le contournement sont à trois lignes d'écart dans le journal d'audit** :
--  la trace existe, la barrière non.
--
--  **Ce qui manquait est une MÉMOIRE.** Le déclencheur ne regardait que l'état PRÉCÉDENT,
--  et repasser par « brouillon » l'efface. `validation_engagee` retient qu'un circuit a été
--  ouvert, et rien ne l'efface — sinon une publication approuvée, qui la rend sans objet.
--
--  ⚠️ **Le produit n'impose toujours PAS de circuit à tout document**, et c'est le cadrage :
--  un document qui n'est jamais passé par « en validation » et n'a jamais eu d'approbation
--  se publie librement. Ce qui est fermé, c'est de S'EN ÉCHAPPER une fois entré.
--
--  ── VOIE 2 — un seul appel, et elle est pire ──────────────────────────────────────────
--
--  `trg_documents_publication` est déclaré `before UPDATE`. **Rien ne gardait l'INSERTION**,
--  et `POST /api/reprise` insère : une PSSI « en vigueur » avec **zéro approbation**, en un
--  appel. C'est exactement la classe fermée par D2 pour les pièces jointes — *une barrière
--  qui ne vit que sur un chemin ne voit pas le chemin d'à côté* — et elle avait été laissée
--  ouverte ici.
--
--  ⚠️ **UN DÉCLENCHEUR DE CONTRAINTE DIFFÉRÉ, ET PAS UN `after insert` ORDINAIRE.** Une
--  reprise légitime restaure un jeu ENTIER : les documents « en vigueur » et leurs
--  approbations. Selon l'ordre d'insertion, les approbations peuvent arriver APRÈS les
--  documents — un déclencheur immédiat refuserait alors une restauration parfaitement
--  saine, c'est-à-dire casserait la fonction la plus critique du produit pour fermer un
--  contournement. Différé à la fin de la transaction, il voit le jeu complet.
--
--  ⚠️ Et il **mesure l'événement** dès sa première rédaction : leçon de la migration `021`
--  (constat Q-281), appliquée avant d'en avoir besoin plutôt qu'après l'avoir payée.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LA MÉMOIRE DU CIRCUIT ENGAGÉ
-- =====================================================================================

alter table documents
    add column if not exists validation_engagee boolean not null default false;

comment on column documents.validation_engagee is
    'Vrai dès que ce document est passé par « en validation ». ⚠️ RIEN NE L''EFFACE, et '
    'c''est tout son objet (constat Q-280) : le déclencheur de publication ne regardait que '
    'l''état précédent, et repasser par « brouillon » l''effaçait — on publiait alors sans '
    'une seule approbation, en deux gestes. Une publication approuvée la rend sans objet, '
    'elle ne la remet pas à faux.';

-- Rattrapage : un document actuellement « en validation » a, par définition, engagé son
-- circuit. Pas de lecture cloisonnée ici — on n'écrit que d'après la ligne elle-même.
update documents set validation_engagee = true where statut = 'en validation';

create or replace function f_document_validation_engagee() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if new.statut = 'en validation' then
        new.validation_engagee := true;
    end if;
    return new;
end;
$$;

comment on function f_document_validation_engagee() is
    'Pose « validation_engagee » dès qu''un document se dit « en validation ». Constat '
    'Q-280, voie 1.';

drop trigger if exists trg_documents_validation_engagee on documents;
create trigger trg_documents_validation_engagee
    before insert or update of statut on documents
    for each row execute function f_document_validation_engagee();
alter table documents enable always trigger trg_documents_validation_engagee;

-- =====================================================================================
-- §2 — LA BARRIÈRE, ÉLARGIE AUX DEUX VOIES
-- =====================================================================================

create or replace function f_document_publication_exige_approbation() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_dernier_tour integer;
    v_ancien       text := case when tg_op = 'UPDATE' then old.statut else null end;
begin
    -- Rien à décider si le document n'est pas « en vigueur »…
    if new.statut is distinct from 'en vigueur' then
        return new;
    end if;
    -- …ni s'il l'était déjà (une modification de forme ne se refait pas approuver).
    if tg_op = 'UPDATE' and v_ancien = 'en vigueur' then
        return new;
    end if;

    select max(ordre) into v_dernier_tour
      from approbations
     where objet_type = 'document' and objet_id = new.id;

    -- Aucun circuit, jamais passé par « en validation » : le produit n'impose pas de
    -- circuit à tout document (entête de la migration 019). ⚠️ `validation_engagee` est
    -- ce qui ferme la voie 1 : repasser par « brouillon » n'efface plus rien.
    if v_dernier_tour is null
       and v_ancien is distinct from 'en validation'
       and coalesce(new.validation_engagee, false) = false then
        return new;
    end if;

    if exists (
        select 1
          from approbations
         where objet_type = 'document'
           and objet_id = new.id
           and ordre = v_dernier_tour
           and etape = 'publication'
           and statut = 'approuve')
    then
        return new;
    end if;

    -- ⚠️ Apostrophes TYPOGRAPHIQUES : ce message part tel quel à l'utilisateur (GRC06).
    raise exception
        'Ce document ne peut pas être mis « en vigueur » : son circuit d’approbation n’est '
        'pas terminé. La dernière étape — la publication — doit être approuvée avant que le '
        'document fasse foi. Ouvrez le circuit d’approbation depuis la fiche, faites '
        'prononcer les étapes qui manquent, puis revenez changer le statut.'
        using errcode = 'GRC06';
end;
$$;

comment on function f_document_publication_exige_approbation() is
    'Refuse en GRC06 le passage d''un document à « en vigueur » quand son circuit '
    'd''approbation n''est pas conclu. Trois portes d''entrée depuis la migration 023 '
    '(constat Q-280) : le statut précédent « en validation », l''existence d''un circuit, et '
    '« validation_engagee » — la MÉMOIRE, sans laquelle on s''échappait en repassant par '
    '« brouillon ». Appelée à l''UPDATE et, en différé, à l''INSERT : POST /api/reprise '
    'INSÈRE, et créait une PSSI « en vigueur » sans une seule approbation. ⚠️ Ne vérifie '
    'PAS que l''approbation porte encore sur le contenu actuel — c''est empreinte_objet '
    '(constat Q-247).';

-- ── L'insertion, DIFFÉRÉE à la fin de la transaction ────────────────────────────────────
drop trigger if exists trg_documents_publication_insert on documents;
create constraint trigger trg_documents_publication_insert
    after insert on documents
    deferrable initially deferred
    for each row execute function f_document_publication_exige_approbation();

-- ⚠️ **Oublié à la première rédaction, et le garde-fou `armement` de la migration `004` l'a
-- attrapé immédiatement** — la migration a échoué au §4 en nommant le déclencheur et la
-- commande de réparation. C'est exactement l'office d'un garde-fou de schéma, et il valait
-- ici plus qu'une relecture : un déclencheur de contrainte armé « origin » se neutralise
-- d'un « set session_replication_role = replica ».
alter table documents enable always trigger trg_documents_publication_insert;

-- =====================================================================================
-- §3 — LE GARDE-FOU, ÉLARGI : il exige LES DEUX déclencheurs
-- =====================================================================================

create or replace function f_verifier_publication_evenement()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record; v_maj boolean := false; v_ins boolean := false;
begin
    for r in
        select t.tgname, t.tgtype, t.tgenabled, t.tgdeferrable
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where not t.tgisinternal
           and t.tgrelid = 'documents'::regclass
           and p.proname = 'f_document_publication_exige_approbation'
    loop
        if (r.tgtype & 16) <> 0 then           -- UPDATE
            v_maj := true;
            if (r.tgtype & 2) = 0 or (r.tgtype & 1) = 0 then
                objet := 'documents.' || r.tgname;
                anomalie := 'barriere_publication_mauvais_evenement';
                detail := 'La barrière de publication à l''UPDATE doit être « BEFORE UPDATE … '
                          'FOR EACH ROW » (tgtype = ' || r.tgtype || ').';
                return next;
            end if;
        elsif (r.tgtype & 4) <> 0 then         -- INSERT
            v_ins := true;
            if (r.tgtype & 2) <> 0 or (r.tgtype & 1) = 0 or not r.tgdeferrable then
                objet := 'documents.' || r.tgname;
                anomalie := 'barriere_publication_insert_non_differee';
                detail := 'La barrière à l''INSERT doit être un déclencheur de CONTRAINTE '
                          'DIFFÉRÉ (« after insert … deferrable initially deferred »). '
                          'Immédiate, elle refuserait une reprise saine dont les '
                          'approbations arrivent après les documents — elle casserait la '
                          'restauration pour fermer un contournement (constat Q-280).';
                return next;
            end if;
        end if;
        if r.tgenabled <> 'A' then
            objet := 'documents.' || r.tgname;
            anomalie := 'declencheur_desarmable';
            detail := 'Ce déclencheur n''est plus armé en « always ».';
            return next;
        end if;
    end loop;

    if not v_maj then
        objet := 'documents.trg_documents_publication';
        anomalie := 'barriere_publication_update_absente';
        detail := 'Aucun déclencheur d''UPDATE n''appelle la barrière de publication.';
        return next;
    end if;
    if not v_ins then
        objet := 'documents.trg_documents_publication_insert';
        anomalie := 'barriere_publication_insert_absente';
        detail := 'Aucun déclencheur d''INSERT n''appelle la barrière : POST /api/reprise '
                  'INSÈRE, et créerait une PSSI « en vigueur » sans une seule approbation '
                  '(constat Q-280, voie 2).';
        return next;
    end if;
    return;
end;
$$;

grant execute on function f_verifier_publication_evenement() to grc_app;

create or replace function f_verifier_validation_engagee()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare v_vu boolean := false; r record;
begin
    for r in
        select t.tgname, t.tgtype, t.tgenabled
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where not t.tgisinternal and t.tgrelid = 'documents'::regclass
           and p.proname = 'f_document_validation_engagee'
    loop
        v_vu := true;
        -- BEFORE (2) · INSERT (4) · UPDATE (16) · ROW (1)
        if (r.tgtype & 2) = 0 or (r.tgtype & 1) = 0
           or (r.tgtype & 4) = 0 or (r.tgtype & 16) = 0 or r.tgenabled <> 'A' then
            objet := 'documents.' || r.tgname;
            anomalie := 'memoire_validation_mauvais_evenement';
            detail := 'La mémoire du circuit engagé doit être posée « BEFORE INSERT OR '
                      'UPDATE OF statut … FOR EACH ROW », armée « always » (tgtype = '
                      || r.tgtype || ', armement ' || r.tgenabled || '). Sans elle, on '
                      'publie sans approbation en repassant par « brouillon » (Q-280).';
            return next;
        end if;
    end loop;
    if not v_vu then
        objet := 'documents.trg_documents_validation_engagee';
        anomalie := 'memoire_validation_absente';
        detail := 'Rien ne pose « validation_engagee » : la voie 1 du constat Q-280 '
                  'est rouverte.';
        return next;
    end if;
    return;
end;
$$;

grant execute on function f_verifier_validation_engagee() to grc_app;

-- =====================================================================================
-- §4 — CONSIGNATION ET VÉRIFICATION
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
        raise exception 'Le schéma est en défaut après 023 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, les deux voies de publication comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('023', 'la barrière de publication ferme ses deux voies — mémoire du circuit engagé '
               'et déclencheur de contrainte différé à l''insertion (constat Q-280)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop trigger if exists trg_documents_publication_insert on documents;
--   drop trigger if exists trg_documents_validation_engagee on documents;
--   drop function if exists f_document_validation_engagee();
--   drop function if exists f_verifier_validation_engagee();
--   alter table documents drop column if exists validation_engagee;
--   delete from controles_schema where fonction = 'f_verifier_validation_engagee';
--   delete from migrations_schema where version = '023';
--   commit;
-- =====================================================================================
