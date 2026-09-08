-- =====================================================================================
--  020 — VÉRIFIER QUE LE FICHIER SUR LE DISQUE EST ENCORE CELUI QU'ON A EMPREINTÉ
-- -------------------------------------------------------------------------------------
--  §1  Une vingt-deuxième action de journal : « verification_integrite »
--  §2  Le verdict, porté par la ligne — et l'index qui rend le balayage possible
--  §3  Le garde-fou du vocabulaire, étendu
--  §4  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — une promesse à moitié tenue, mesurée le 08/09/2026
--
--  Le lot L6 calcule un SHA-256 « sur ce qui a été ÉCRIT » — `empreinteDe()` relit le
--  disque plutôt que d'empreinter ce qui a été reçu —, le range avec la ligne, et le rend
--  par l'API. C'est ce qui transforme une pièce jointe en **preuve vérifiable** : un
--  auditeur à qui l'on donne l'empreinte peut s'assurer qu'un rapport n'a pas été
--  remplacé après coup.
--
--  Sauf que `empreinteDe()` n'était appelée qu'à **UN SEUL endroit du produit** : le
--  dépôt. Mesuré par balayage de `src/` — un seul appelant. Conséquences, et la seconde
--  est la plus gênante :
--
--    · l'empreinte n'était **affichée nulle part** : le panneau la chargeait en mémoire
--      et ne la montrait pas. On ne pouvait donc pas la recopier pour comparer ;
--    · **rien ne la revérifiait**. La ré-analyse périodique est ANTIVIRALE : elle repasse
--      le fichier à ClamAV, elle ne le compare pas à son empreinte. Le produit ne savait
--      donc pas répondre à « le fichier sur le disque est-il encore celui qu'on a
--      empreinté ? » — et un écart, qu'il vienne d'une corruption de stockage ou d'une
--      substitution, **n'aurait été vu par personne**.
--
--  ⚠️ C'est exactement le motif que ce chantier traque : *un garde-fou que rien
--  n'appelle est un commentaire* (§18.4). L'empreinte était écrite, stockée, servie — et
--  mordue par rien.
--
--  ── POURQUOI UNE ACTION DE JOURNAL DE PLUS, ET PAS UN RÉEMPLOI ───────────────────────
--
--  Même raisonnement qu'au §1 de la migration `009`, et les trois candidats au réemploi
--  sont écartés pour des motifs qui se mesurent :
--
--    · `analyse_antivirus` — c'est le verdict d'un DÉMON sur la NOCIVITÉ d'un contenu.
--      Une vérification d'intégrité ne dit rien de la nocivité : elle dit que les octets
--      ont changé. Les confondre ferait répondre « oui, analysé » à la question « ce
--      fichier a-t-il été altéré ? », ce qui est faux dans les deux sens ;
--    · `consultation_sensible` — rien n'est délivré, aucun octet ne sort du produit.
--      Ranger là une vérification gonflerait la seule action par laquelle un auditeur
--      compte les extractions ;
--    · `modification` — c'est le vocabulaire des écritures MÉTIER, et personne n'a
--      modifié quoi que ce soit : c'est précisément le contraire qu'on constate.
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS (§17.5) ───────────────────────────────────────
--
--  Elle ne vérifie rien elle-même : elle pose le vocabulaire et le lieu du verdict. La
--  vérification vit dans `src/pieces/` — une route à la demande, et un balayage sur le
--  minuteur qui porte déjà la ré-analyse.
--
--  Et elle ne fait pas de l'intégrité une garantie : un attaquant qui écrit dans le
--  magasin peut aussi bien mettre l'empreinte à jour dans la base. Ce que ce dispositif
--  attrape est **l'écart** — corruption de stockage, restauration partielle, substitution
--  faite en dehors de l'application —, pas un adversaire qui tient les deux. Le dire ici
--  vaut mieux que de laisser croire.
--
--  Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 020_verification_integrite.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE VOCABULAIRE DU JOURNAL
-- -------------------------------------------------------------------------------------
-- REMPLACÉE en une seule instruction, comme au §1 de `009` : pas de fenêtre pendant
-- laquelle le journal serait sans vocabulaire.
--
-- ⚠️ `ActionJournal` (`src/auth/journal.ts`) déclare les mêmes valeurs en TypeScript.
-- Ce n'est pas une duplication qu'on tolère, c'est le dispositif : une action présente
-- d'un seul côté fait échouer l'insertion **bruyamment** en 23514 (`CLAUDE.md` §3, cas b).
-- =====================================================================================

alter table journal_audit drop constraint ck_journal_audit_action;
alter table journal_audit add constraint ck_journal_audit_action check (action in (
    'connexion_reussie', 'connexion_echouee', 'deconnexion',
    'session_expiree', 'session_revoquee', 'refus_autorisation',
    'creation', 'modification', 'suppression', 'consultation_sensible',
    'export', 'import', 'administration', 'approbation',
    'analyse_antivirus', 'purge', 'archivage',
    'demarrage', 'arret', 'verification_journal',
    'changement_perimetre',
    'verification_integrite'));

-- =====================================================================================
-- §2 — LE VERDICT, PORTÉ PAR LA LIGNE
-- -------------------------------------------------------------------------------------
-- Deux colonnes, et pas une de plus. Elles servent le BALAYAGE — reprendre là où il en
-- était, et laisser une trace consultable — pas la vérification à la demande, qui ne
-- persiste rien (voir `src/pieces/index.ts` : elle est une LECTURE, et une lecture qui
-- écrirait échouerait sur les pièces d'une filiale voisine, en silence).
-- =====================================================================================

alter table pieces_jointes
    add column derniere_verification timestamptz,
    add column etat_integrite text not null default 'non_verifiee',
    add constraint ck_pieces_jointes_integrite check (
        etat_integrite in ('non_verifiee', 'conforme', 'ecart', 'fichier_absent')),
    -- Un verdict est daté, ou n'a pas eu lieu. Même forme que
    -- `ck_approbations_decision` et `ck_pieces_jointes_analyse` : l'état et sa date ne
    -- peuvent pas se contredire.
    add constraint ck_pieces_jointes_integrite_datee check (
        (etat_integrite = 'non_verifiee') = (derniere_verification is null));

comment on column pieces_jointes.etat_integrite is
    'Verdict du dernier RAPPROCHEMENT entre le fichier du magasin et le sha256 de cette '
    'ligne : « conforme », « ecart » (les octets ont changé), « fichier_absent » (plus '
    'rien à lire), ou « non_verifiee ». ⚠️ Ce n''est PAS une garantie d''intégrité : qui '
    'peut écrire dans le magasin peut aussi mettre le sha256 à jour ici. Ce que le '
    'dispositif attrape est l''ÉCART — corruption, restauration partielle, substitution '
    'faite hors de l''application. Posé par le balayage du minuteur '
    '(src/pieces/exploitation.ts) ; la vérification à la demande, elle, ne persiste rien.';
comment on column pieces_jointes.derniere_verification is
    'Horodatage du dernier rapprochement. Pilote l''ordre du balayage : les pièces jamais '
    'vérifiées d''abord, puis les plus anciennes.';

-- L'index qui rend le balayage praticable : mêmes pièces que la ré-analyse — celles que
-- l'application délivre aujourd'hui —, ordonnées par ancienneté de vérification.
create index ix_pieces_jointes_integrite on pieces_jointes (derniere_verification nulls first)
    where etat_analyse = 'saine' and not quarantaine;

comment on index ix_pieces_jointes_integrite is
    'Balayage d''intégrité : les pièces délivrables, les jamais vérifiées en tête. '
    'Partiel, comme ix_pieces_jointes_reanalyse — une pièce en quarantaine n''est pas '
    'rapprochée : son fichier a pu être déplacé par l''exploitation, et l''écart serait '
    'alors attendu.';

-- =====================================================================================
-- §3 — LE GARDE-FOU DU VOCABULAIRE, ÉTENDU
-- -------------------------------------------------------------------------------------
-- On RÉÉMET `f_verifier_vocabulaire_journal()` plutôt que d'en ajouter un second : deux
-- garde-fous sur la même contrainte finiraient par ne plus dire la même chose, et c'est
-- très exactement ce que le §19.5 interdit. La fonction garde son nom, sa signature et
-- sa place au registre — la découverte de `f_verifier_schema()` ne voit aucun mouvement.
--
-- ⚠️ PORTÉE EXACTE, écrite avant le code : il tient que la contrainte EXISTE, qu'elle est
-- VALIDÉE, et que son texte déclare les deux actions que des lots ont ajoutées après le
-- socle. Il ne lit pas TypeScript, et ne peut donc rien dire de l'accord entre les deux
-- listes : cet accord-là est tenu par le 23514 de l'insertion, et mesuré par le banc.
-- =====================================================================================

create or replace function f_verifier_vocabulaire_journal()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
    v_trouvee boolean := false;
    v_exigees constant text[] := array['changement_perimetre', 'verification_integrite'];
    v_motifs  constant text[] := array[
        'C''est l''action que le sélecteur de filiale du lot L4 émet à chaque basculement '
        '(CONVENTIONS.md §30.4, migration 009). Sans elle, le changement de filiale échoue '
        'en 23514 AU CLIC DE L''UTILISATEUR, et le journal cesse de porter la trace du seul '
        'geste par lequel une session change de périmètre d''écriture.',
        'C''est l''action qu''émet le rapprochement d''une pièce jointe avec son empreinte '
        '(migration 020). Sans elle, la vérification d''intégrité échoue en 23514 — et, '
        'plus grave, un ÉCART constaté entre le fichier du magasin et son sha256 ne '
        'laisserait AUCUNE trace : ni le balayage du minuteur, ni la vérification demandée '
        'depuis une fiche ne pourraient consigner ce qu''ils ont vu.'];
    i integer;
begin
    for r in
        select k.conname::text                as nom,
               k.convalidated                 as validee,
               pg_get_constraintdef(k.oid)    as definition
          from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'journal_audit'
           and k.conname = 'ck_journal_audit_action'
           and k.contype = 'c'
    loop
        v_trouvee := true;

        if not r.validee then
            objet    := r.nom;
            anomalie := 'vocabulaire_non_valide';
            detail   := 'ck_journal_audit_action est déclarée « not valid » : elle ne '
                        'contrôle plus les lignes déjà présentes, et une action hors '
                        'vocabulaire a donc pu entrer dans un journal scellé sans que rien '
                        'ne le dise.';
            return next;
        end if;

        for i in 1 .. array_length(v_exigees, 1) loop
            if position(v_exigees[i] in r.definition) = 0 then
                objet    := r.nom;
                anomalie := v_exigees[i] || '_absent';
                detail   := format(
                    'le vocabulaire du journal ne déclare plus « %s » : « %s ». %s',
                    v_exigees[i], r.definition, v_motifs[i]);
                return next;
            end if;
        end loop;
    end loop;

    -- Cas séparé, et non cumulé avec les précédents : la contrainte ABSENTE ne dit pas la
    -- même chose qu'une contrainte incomplète. Sans elle, « action » redevient du texte
    -- libre, et le journal accepte n'importe quel mot — y compris une faute de frappe qui
    -- ferait disparaître un événement de toutes les recherches par action.
    if not v_trouvee then
        objet    := 'ck_journal_audit_action';
        anomalie := 'vocabulaire_absent';
        detail   := 'La contrainte de vocabulaire du journal d''audit a disparu : la '
                    'colonne « action » redevient du texte libre. Une faute de frappe '
                    'suffirait alors à faire disparaître un événement de toutes les '
                    'recherches par action, sans qu''aucune insertion n''échoue.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_vocabulaire_journal() is
    'Vérifie que ck_journal_audit_action existe, est VALIDÉE, et déclare les actions que '
    'les lots ont ajoutées après le socle : « changement_perimetre » (migration 009, lot '
    'L4) et « verification_integrite » (migration 020). Ne lit pas TypeScript : l''accord '
    'entre les deux listes est tenu par le 23514 de l''insertion et mesuré par le banc. '
    'Un schéma sain ne renvoie AUCUNE ligne.';

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
        raise exception 'Le schéma est en défaut après 020 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, vérification d''intégrité comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('020', 'vérification d''intégrité des pièces jointes — action de journal '
               '« verification_integrite », verdict et date portés par la ligne, index de '
               'balayage, garde-fou du vocabulaire étendu')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop index if exists ix_pieces_jointes_integrite;
--   alter table pieces_jointes
--       drop constraint if exists ck_pieces_jointes_integrite_datee,
--       drop constraint if exists ck_pieces_jointes_integrite,
--       drop column if exists etat_integrite,
--       drop column if exists derniere_verification;
--   -- ⚠️ Le vocabulaire ne se rétracte PAS tant qu'une entrée le porte : le journal est
--   --    en ajout seul, et retirer la valeur rendrait la contrainte fausse sur des lignes
--   --    déjà scellées. Vérifier d'abord :
--   --    select count(*) from journal_audit where action = 'verification_integrite';
--   delete from migrations_schema where version = '020';
--   commit;
-- =====================================================================================
