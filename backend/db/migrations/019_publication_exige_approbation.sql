-- =====================================================================================
--  019 — UN DOCUMENT EN VALIDATION NE SE PUBLIE PAS TOUT SEUL
-- -------------------------------------------------------------------------------------
--  §1  Le statut « en validation » — l'état pendant lequel le circuit tourne
--  §2  Le déclencheur : passer « en vigueur » exige une publication approuvée
--  §3  Le garde-fou
--  §4  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — action D5 de la vague 9 (`docs/PLAN_EXECUTION.md` §3)
--
--  Le lot L8 livre le circuit d'approbation, et il le livre bien : quatre étapes pour un
--  document — rédaction, revue, approbation, publication —, chaque décision horodatée,
--  attribuée et IRRÉVERSIBLE (déclencheur `trg_approbations_verrou`, code `GRC02`).
--
--  **Mais rien ne le reliait au document.** Le circuit vivait à côté : on pouvait le
--  laisser à mi-chemin, ouvrir la fiche, choisir « en vigueur » dans la liste déroulante,
--  enregistrer — et le registre documentaire affichait une politique en vigueur que
--  personne n'avait approuvée. La question d'audit, elle, ne change pas : *« qui a validé
--  cette PSSI ? »* Le produit répondait « personne, mais elle est en vigueur ».
--
--  ── CE QUI DÉCLENCHE LA BARRIÈRE, ET POURQUOI PAS TOUJOURS ────────────────────────────
--
--  Le produit **n'impose pas** un circuit à tout document : la moitié des procédures d'un
--  site n'en réclame pas, et l'exiger partout ferait qu'on cesserait de s'en servir. La
--  règle est donc celle-ci, en deux cas qui se lisent séparément :
--
--    · le document est **« en validation »** — quelqu'un a explicitement dit qu'il passe
--      par un circuit : la publication approuvée est exigée, même si aucune étape n'a
--      encore été écrite (sinon le statut ne voudrait rien dire) ;
--    · **un circuit existe** pour ce document, quel que soit son statut : on ne le
--      contourne pas en repassant par « brouillon ». C'est la moitié que la formulation
--      littérale de D5 laissait ouverte, et qu'un relecteur aurait trouvée en une minute.
--
--  Dans les deux cas, ce qui est exigé est **une étape `publication` approuvée dans le
--  DERNIER tour** (`ordre` = le numéro de tour, `src/approbations/circuit.ts`). Approuver
--  la publication suppose d'avoir franchi les trois étapes précédentes : c'est l'ordre du
--  circuit, et il est tenu par la route.
--
--  ── CE QUE CE DÉCLENCHEUR NE FAIT PAS, ET IL FAUT LE DIRE (§17.5) ─────────────────────
--
--  Il **ne vérifie pas que l'approbation porte encore sur le contenu actuel**. Le lot L8
--  tient cette question par `empreinte_objet` — « une approbation vaut pour une version de
--  l'objet » —, et l'encart du circuit affiche la péremption. La refaire ici obligerait à
--  recopier `COLONNES_HORS_EMPREINTE` (`src/approbations/index.ts`) dans du SQL : deux
--  copies d'une même liste, qui finiraient par ne plus dire la même chose — exactement ce
--  que le `CONVENTIONS.md` §19.5 interdit. Le chemin « approuver, modifier le texte, puis
--  publier » reste donc ouvert dans la BASE ; il est **visible** dans l'écran, et il est
--  inscrit au registre des constats plutôt que passé sous silence.
--
--  ── ET UNE CONSÉQUENCE DE PORTÉE À CONNAÎTRE ─────────────────────────────────────────
--
--  Le déclencheur lit `approbations` **sous la RLS de l'appelant** : les étapes portent la
--  filiale qui a mené le circuit. Sur une politique de PORTÉE GROUPE approuvée depuis la
--  filiale A, une session dont le périmètre ne contient pas A ne verra pas ces étapes et
--  sera **refusée**. C'est le bon sens du refus — fail-closed —, et le cas normal ne s'y
--  heurte pas : une politique Groupe se publie depuis une session de périmètre Groupe, qui
--  lit toutes ses filiales.
--
--  Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 019_publication_exige_approbation.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE STATUT « EN VALIDATION »
-- -------------------------------------------------------------------------------------
-- Valeur AJOUTÉE, aucune retirée : les quatre statuts existants gardent leur sens, et
-- aucune ligne en base ne change. C'est ce qui rend la migration sûre sur une base servie.
-- =====================================================================================

alter table documents drop constraint ck_documents_statut;
alter table documents add constraint ck_documents_statut check (statut in (
    'brouillon', 'en validation', 'en vigueur', 'à réviser', 'obsolète'));

comment on column documents.statut is
    'Cycle de vie du document. « en validation » (migration 019) est l''état pendant lequel '
    'le circuit d''approbation du lot L8 tourne : depuis cet état, passer « en vigueur » '
    'EXIGE une étape « publication » approuvée dans le dernier tour '
    '(trg_documents_publication, code GRC06). La même exigence s''applique dès qu''un '
    'circuit existe pour ce document, quel que soit son statut — sans quoi il suffirait de '
    'repasser par « brouillon » pour contourner.';

-- =====================================================================================
-- §2 — LE DÉCLENCHEUR
-- =====================================================================================

create or replace function f_document_publication_exige_approbation() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_dernier_tour integer;
begin
    -- Rien à décider si le document ne DEVIENT pas « en vigueur ».
    if new.statut is distinct from 'en vigueur' or old.statut = 'en vigueur' then
        return new;
    end if;

    select max(ordre) into v_dernier_tour
      from approbations
     where objet_type = 'document' and objet_id = new.id;

    -- Aucun circuit, et le document ne se disait pas « en validation » : le produit
    -- n'impose pas de circuit à tout document (voir l'entête).
    if v_dernier_tour is null and old.statut is distinct from 'en validation' then
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

    -- ⚠️ Apostrophes TYPOGRAPHIQUES (’) et non droites : ce message part tel quel à
    -- l'utilisateur (`src/erreurs/index.ts`, cas GRC06), et le reste des textes du
    -- produit emploie l'apostrophe typographique. Un message de la base qui détonne
    -- se lit comme une fuite technique, ce qu'il n'est pas.
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
    'd''approbation n''est pas conclu : soit parce qu''il se disait « en validation », soit '
    'parce qu''un circuit existe (on ne le contourne pas en repassant par « brouillon »). '
    'Exige une étape « publication » APPROUVÉE dans le dernier tour. ⚠️ Ne vérifie PAS que '
    'l''approbation porte encore sur le contenu actuel — c''est empreinte_objet, tenue par '
    'le lot L8, et la recopier ici dupliquerait COLONNES_HORS_EMPREINTE (§19.5).';

create trigger trg_documents_publication before update on documents
    for each row execute function f_document_publication_exige_approbation();

-- « always » : sans cet armement, « set session_replication_role = replica » désarmerait
-- la barrière avec le déclencheur (CONVENTIONS.md §19.4).
alter table documents enable always trigger trg_documents_publication;

-- =====================================================================================
-- §3 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Il se branche seul (convention de découverte de f_verifier_schema()). Ce qu'il attrape :
-- le déclencheur retiré, le déclencheur désarmé, et le statut « en validation » disparu du
-- « check » — ce dernier cas étant le plus discret, puisque le déclencheur resterait là,
-- correct, et ne pourrait simplement plus jamais s'appliquer au premier de ses deux cas.
-- =====================================================================================

create or replace function f_verifier_publication_documents()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if not exists (
        select 1 from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = 'documents'::regclass
           and not t.tgisinternal
           and p.proname = 'f_document_publication_exige_approbation')
    then
        objet    := 'documents';
        anomalie := 'publication_sans_barriere';
        detail   := 'Le déclencheur « trg_documents_publication » a disparu : un document '
                    'peut redevenir « en vigueur » sans que son circuit d''approbation soit '
                    'conclu, et le registre affichera une politique que personne n''a '
                    'validée. C''est la question d''audit la plus systématique sur un '
                    'système documentaire. Rejouez le §2 de la migration 019.';
        return next;
    elsif exists (
        select 1 from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = 'documents'::regclass
           and not t.tgisinternal
           and p.proname = 'f_document_publication_exige_approbation'
           and t.tgenabled <> 'A')
    then
        objet    := 'documents.trg_documents_publication';
        anomalie := 'declencheur_desarmable';
        detail   := 'Le déclencheur n''est plus armé en « always » : '
                    '« set session_replication_role = replica » le neutraliserait, et la '
                    'barrière d''approbation avec lui.';
        return next;
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'ck_documents_statut'
           and conrelid = 'documents'::regclass
           and pg_get_constraintdef(oid) like '%en validation%')
    then
        objet    := 'documents.statut';
        anomalie := 'statut_en_validation_absent';
        detail   := 'Le « check » de documents.statut n''admet plus « en validation ». Le '
                    'déclencheur de publication reste en place et paraît correct, mais son '
                    'PREMIER cas — « le document se disait en validation » — ne peut plus '
                    'se produire : la barrière ne tient plus que sur l''existence d''un '
                    'circuit. Une barrière à moitié désarmée est pire qu''une barrière '
                    'absente, parce qu''elle rassure.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_publication_documents() is
    'Vérifie la barrière de publication documentaire (migration 019, action D5) : le '
    'déclencheur existe, il est armé en « always », et le statut « en validation » est '
    'toujours admis par ck_documents_statut. Un schéma sain ne renvoie AUCUNE ligne.';

grant execute on function f_verifier_publication_documents() to grc_app;

-- =====================================================================================
-- §4 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
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
        raise exception 'Le schéma est en défaut après 019 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, barrière de publication comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('019', 'un document « en validation » ne passe « en vigueur » qu''avec une étape '
               'de publication approuvée — statut neuf, déclencheur GRC06 et garde-fou '
               '(action D5)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop trigger if exists trg_documents_publication on documents;
--   drop function if exists f_document_publication_exige_approbation();
--   drop function if exists f_verifier_publication_documents();
--   delete from controles_schema where fonction = 'f_verifier_publication_documents';
--   update documents set statut = 'brouillon' where statut = 'en validation';
--   alter table documents drop constraint ck_documents_statut;
--   alter table documents add constraint ck_documents_statut check (statut in (
--       'brouillon', 'en vigueur', 'à réviser', 'obsolète'));
--   delete from migrations_schema where version = '019';
--   commit;
-- ⚠️ La rejouer PERD une information : les documents « en validation » sont ramenés à
--    « brouillon », et le lien entre le registre documentaire et le circuit d'approbation
--    disparaît — une politique peut de nouveau être « en vigueur » sans avoir été validée.
-- =====================================================================================
