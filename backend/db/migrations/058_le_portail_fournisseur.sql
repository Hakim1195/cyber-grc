-- =====================================================================================
--  058 — LE PORTAIL FOURNISSEUR : LE PREMIER COMPOSANT HORS VPN
-- -------------------------------------------------------------------------------------
--  Lot L28, arbitrage utilisateur **A3** du 08/09/2026.
--
--  🛑 **CE LOT CHANGE LA NATURE DU PRODUIT.** Jusqu'ici tout vivait derrière un VPN.
--  Il porte donc la porte de sécurité **la plus exigeante du plan**, et sa consigne est
--  écrite : *en cas de doute sur ce lot, on ne livre pas.*
--
--  ⚠️ **L'export / réimport du lot L21.2 RESTE la voie de repli permanente.** Un
--  fournisseur qui ne veut pas d'un accès en ligne doit pouvoir répondre quand même, et
--  rien ici ne le lui retire.
--
--  ── PAS DE COMPTE FOURNISSEUR, ET C'EST DÉLIBÉRÉ (28.1) ──────────────────────────
--
--  Un compte, c'est un mot de passe à réinitialiser, une énumération possible, et une
--  surface qui **vit après la campagne**. Un lien, lui, **expire tout seul**. Le produit
--  n'ouvre donc aucun compte : il émet un lien signé, nominatif, daté, révocable, et
--  portant sur **un seul questionnaire**.
--
--  ── ⚠️ LE LIEN PORTE SA FILIALE, ET C'EST LE §46 QUI PAIE ───────────────────────
--
--  `portail_liens` est **cloisonnée**, et la recherche par empreinte a lieu **avant**
--  qu'un périmètre existe — c'est elle qui va le produire. C'est mot pour mot la
--  circularité du `CONVENTIONS.md` **§46**, découverte au lot L22 huit heures plus tôt,
--  et le remède est le même : le secret porte sa filiale en clair, devant l'aléa. Elle
--  n'est crue de personne — l'empreinte doit encore correspondre à une ligne de cette
--  filiale-là.
--
--  *Une règle écrite la veille et appliquée le lendemain est la seule preuve qu'elle
--  valait la peine d'être écrite.*
--
--  ── 404, JAMAIS 403 ──────────────────────────────────────────────────────────────
--
--  Un lien expiré, révoqué, inconnu, ou visant une autre campagne rend **404**. Un 403
--  confirmerait que la cible existe : c'est l'oracle d'existence du contrôle **S12**, et
--  ici il vaut davantage qu'ailleurs — la surface est publique.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

select set_config('grc.perimetre_groupe', 'oui', true);
select set_config('grc.authentification', 'oui', true);

-- =====================================================================================
-- §1 — TROIS ACTIONS DE JOURNAL DE PLUS (28.8)
-- =====================================================================================

do $$
declare v_predicat text;
begin
    select pg_get_constraintdef(oid) into v_predicat
      from pg_constraint
     where conrelid = to_regclass('public.journal_audit')
       and conname = 'ck_journal_audit_action';

    if v_predicat is null then
        raise exception 'ck_journal_audit_action est introuvable.';
    end if;
    if position(quote_literal('portail_ouverture') in v_predicat) > 0 then
        raise notice 'Le vocabulaire admet deja les actions du portail : rejeu.';
        return;
    end if;
    if position(quote_literal('ia_externe') in v_predicat) = 0 then
        raise exception 'La valeur « ia_externe » est introuvable dans le predicat '
                        'applique : son texte a change, et la substitution a l''aveugle '
                        'est refusee (motif du §4 de la 027).';
    end if;

    execute 'alter table journal_audit drop constraint ck_journal_audit_action';
    execute format(
        'alter table journal_audit add constraint ck_journal_audit_action %s',
        replace(v_predicat, quote_literal('ia_externe'),
                quote_literal('ia_externe') || ', '
             || quote_literal('portail_ouverture') || ', '
             || quote_literal('portail_reponse') || ', '
             || quote_literal('portail_depot')));
    raise notice 'Le journal admet desormais les trois actions du portail.';
end;
$$;

-- =====================================================================================
-- §2 — LES LIENS (28.1)
-- =====================================================================================

create table if not exists portail_liens (
    id         id_metier not null default f_generer_id('PLIEN'),
    filiale_id id_metier not null,

    -- ⚠️ **UN SEUL QUESTIONNAIRE, et la clé est COMPOSITE** : une clé simple serait
    -- satisfaite par un questionnaire INVISIBLE de la filiale voisine (§17.1), et un
    -- lien de la filiale A ouvrirait le questionnaire de la filiale B.
    questionnaire_id id_metier not null,

    -- ⚠️ **L'EMPREINTE, jamais le secret.** Le secret n'existe qu'une fois, au moment
    -- où on le remet ; la base n'en a que le condensat. S'il est perdu, il n'y a pas de
    -- « lien oublié » : on en émet un autre et on révoque celui-ci.
    empreinte empreinte_sha256 not null,
    prefixe   text not null,

    -- Nominatif : à QUI ce lien a été remis. C'est ce qui rend « usage nominatif »
    -- vérifiable après coup, et ce qui permet de révoquer le bon.
    destinataire text not null,

    -- ⚠️ **L'EXPIRATION EST OBLIGATOIRE.** Un lien sans terme n'est plus un lien :
    -- c'est un compte sans mot de passe, c'est-à-dire ce que ce lot refuse.
    expire_le   timestamptz not null,
    revoque_le  timestamptz,
    revoque_par text,

    premiere_ouverture_le timestamptz,
    dernier_usage_le      timestamptz,
    usages                integer not null default 0,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_portail_liens primary key (id),
    constraint fk_portail_liens_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_portail_liens_questionnaire
        foreign key (questionnaire_id, filiale_id)
        references questionnaires_tiers (id, filiale_id) on delete cascade,

    constraint ck_portail_liens_destinataire check (destinataire <> ''),
    constraint ck_portail_liens_prefixe check (prefixe <> ''),
    constraint ck_portail_liens_longueurs check (
        length(destinataire) <= 200 and length(prefixe) <= 40
        and (revoque_par is null or length(revoque_par) <= 200)),
    constraint ck_portail_liens_usages check (usages >= 0),
    -- ⚠️ **Un lien ne vit pas plus de 180 jours.** Une campagne de questionnaires dure
    -- des semaines, pas des saisons — et au-delà, l'adresse a changé de mains.
    constraint ck_portail_liens_duree check (expire_le <= cree_le + interval '180 days')
);

-- ⚠️ La recherche par empreinte est LE chemin d'authentification du portail : sans cet
-- index, chaque ouverture de lien parcourt la table — sur une surface publique.
create unique index if not exists uq_portail_liens_empreinte
    on portail_liens (empreinte);

create index if not exists ix_portail_liens_questionnaire
    on portail_liens (filiale_id, questionnaire_id);

drop trigger if exists trg_portail_liens_maj on portail_liens;
create trigger trg_portail_liens_maj before update on portail_liens
    for each row execute function f_maj_tracabilite();

comment on table portail_liens is
    'Lien d''acces au portail fournisseur (lot L28, action 28.1). ⚠️ PAS DE COMPTE, et '
    'c''est delibere : un compte est un mot de passe a reinitialiser, une enumeration '
    'possible et une surface qui vit apres la campagne — un lien expire tout seul. '
    '⚠️ La base n''a que l''EMPREINTE ; le secret n''existe qu''une fois. ⚠️ La cle vers '
    'le questionnaire est COMPOSITE : une cle simple serait satisfaite par un '
    'questionnaire INVISIBLE de la filiale voisine, et un lien de A ouvrirait celui de B. '
    '⚠️ Un lien expire, revoque ou inconnu rend 404 — jamais 403 : un 403 confirmerait '
    'que la cible existe (controle S12), et la surface est PUBLIQUE.';

comment on column portail_liens.expire_le is
    'OBLIGATOIRE, et borne a 180 jours : un lien sans terme n''est plus un lien, c''est '
    'un compte sans mot de passe — c''est-a-dire ce que ce lot refuse.';

-- =====================================================================================
-- §3 — LA DATE D'ORIGINE D'UNE RÉPONSE REPRISE (28.6)
-- -------------------------------------------------------------------------------------
-- ⚠️ **Une réponse de 2024 présentée comme neuve serait un FAUX EN AUDIT.** Quand un
-- fournisseur reprend ses réponses d'une campagne précédente, la date d'origine voyage
-- avec elle, et l'écran la montre.
--
-- ⚠️ **`null` veut dire « réponse donnée pour CE questionnaire »**, jamais « date
-- inconnue » : c'est le motif du constat Q-192, et l'inverse ferait dater de ce jour
-- une réponse recopiée.
-- =====================================================================================

alter table questionnaire_reponses
    add column if not exists reprise_de_id id_metier,
    add column if not exists reprise_donnee_le date;

do $$
begin
    if not exists (select 1 from pg_constraint
                    where conrelid = to_regclass('public.questionnaire_reponses')
                      and conname = 'ck_questionnaire_reponses_reprise') then
        alter table questionnaire_reponses add constraint ck_questionnaire_reponses_reprise
            check ((reprise_de_id is null) = (reprise_donnee_le is null));
    end if;
end;
$$;

comment on column questionnaire_reponses.reprise_donnee_le is
    'Date a laquelle cette reponse a ete donnee POUR LA PREMIERE FOIS, quand elle est '
    'reprise d''une campagne precedente (action 28.6). ⚠️ NULL veut dire « donnee pour '
    'CE questionnaire », jamais « date inconnue » : l''inverse ferait dater de ce jour '
    'une reponse recopiee, et une reponse de 2024 presentee comme neuve serait un faux '
    'en audit.';

-- =====================================================================================
-- §4 — `type_entite`
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_modele   constant text := quote_literal('ia_appels');
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable.';
    end if;
    if position(quote_literal('portail_liens') in v_predicat) > 0 then
        raise notice 'type_entite admet deja « portail_liens » : rejeu.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « ia_appels » est introuvable dans le predicat.';
    end if;

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s',
                   replace(v_predicat, v_modele,
                           v_modele || ', ' || quote_literal('portail_liens')));
    raise notice 'type_entite admet desormais « portail_liens ».';
end;
$$;

-- =====================================================================================
-- §5 — CLOISONNEMENT
-- =====================================================================================

alter table portail_liens enable row level security;
alter table portail_liens force  row level security;

drop policy if exists pol_portail_liens_lecture on portail_liens;
drop policy if exists pol_portail_liens_ajout on portail_liens;
drop policy if exists pol_portail_liens_maj on portail_liens;
drop policy if exists pol_portail_liens_suppression on portail_liens;

create policy pol_portail_liens_lecture on portail_liens for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_portail_liens_ajout on portail_liens for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_portail_liens_maj on portail_liens for update
    using (filiale_id = f_filiale_ecriture())
    with check (filiale_id = f_filiale_ecriture());
create policy pol_portail_liens_suppression on portail_liens for delete
    using (filiale_id = f_filiale_ecriture());

grant select, insert, update, delete on portail_liens to grc_app;
grant select on portail_liens to grc_lecture;

alter table portail_liens add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_portail_liens_provenance on portail_liens;
create trigger trg_portail_liens_provenance before insert on portail_liens
    for each row execute function f_marquer_provenance();

select f_armer_declencheurs();

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Declencheurs de creation : % table(s).', v_poses;
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Declencheurs « les pieces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §5 bis — LE REGISTRE DE L'ARTICLE 30
-- -------------------------------------------------------------------------------------
-- ⚠️ **`destinataire` est un NOM ou une ADRESSE**, et c'est une donnée personnelle d'une
-- personne qui n'est même pas employée du client : le fournisseur. Elle a donc une fin
-- de vie, et elle est déclarée ici plutôt que découverte le jour d'un contrôle.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
    ('portail_liens', 'destinataire', 'personnelle',
     'Savoir A QUI un acces au portail a ete remis, pour pouvoir le revoquer',
     'Intérêt légitime', 1095, 'anonymiser',
     'Nom ou adresse du correspondant CHEZ LE FOURNISSEUR — une personne qui n''est pas '
     'employee du client. C''est ce qui rend « usage nominatif » verifiable apres coup. '
     'Anonymisee a l''expiration de la retention : la trace de l''acces reste, le nom part.'),
    ('portail_liens', 'prefixe', 'non_personnelle', null, null, null, 'conserver',
     'Premiers signes du secret, pour reconnaitre un lien dans une liste.'),
    ('portail_liens', 'revoque_par', 'personnelle',
     'Savoir qui a coupe un acces',
     'Intérêt légitime', 1095, 'anonymiser',
     'Identifiant de l''utilisateur qui a revoque. Anonymise comme partout ailleurs.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §5 ter — UNE DISPENSE D'UNICITÉ, ET ELLE EST ARBITRÉE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le garde-fou a REFUSÉ le déploiement, et il avait raison de demander.** La règle
-- du `CONVENTIONS.md` §19.1 est qu'une unicité porte `filiale_id`, sans quoi une filiale
-- occupe une valeur dans l'espace d'une autre, qui reçoit un doublon sur une ligne
-- **invisible**.
--
-- `uq_portail_liens_empreinte` y déroge, pour deux raisons qui vont ensemble :
--
--  1. **L'unicité doit être GLOBALE.** Deux filiales ne doivent jamais pouvoir frapper
--     le même secret : le jour où cela arriverait, révoquer l'un laisserait l'autre
--     vivre. C'est le même motif que `uq_pieces_jointes_chemin` et
--     `uq_jetons_api_empreinte`, et la conséquence redoutée par le §19.1 — « une filiale
--     occupe l'espace d'une autre » — est ici **l'effet recherché**.
--  2. **La recherche a lieu AVANT le périmètre.** C'est la circularité du §46 : cette
--     lecture PRODUIT le périmètre, elle ne peut pas en dépendre. Une unicité portant
--     `filiale_id` supposerait qu'on sache déjà dans quelle filiale chercher.
--
-- ⚠️ **La dispense s'écrit à la main, et c'est le bon outil ici** (`CLAUDE.md` §3) :
-- son omission fait **échouer bruyamment** le déploiement, et un humain doit trancher.
-- C'est ce qui vient d'arriver.
-- =====================================================================================

do $$
declare
    v_corps text;
    v_neuf  text;
    v_ancre constant text := quote_literal('uq_jetons_api_empreinte');
begin
    v_corps := pg_get_functiondef('f_verifier_unicite_cloisonnee()'::regprocedure);
    if position(quote_literal('uq_portail_liens_empreinte') in v_corps) > 0 then
        raise notice 'La dispense du portail est deja posee : rejeu, rien a faire.';
        return;
    end if;
    if position(v_ancre in v_corps) = 0 then
        raise exception 'La dispense « uq_jetons_api_empreinte » est introuvable dans '
                        'f_verifier_unicite_cloisonnee() : son texte a change, et la '
                        'substitution a l''aveugle est refusee.';
    end if;

    v_neuf := replace(
        v_corps, v_ancre,
        v_ancre || ','
        || chr(10) || '        -- ⚠️ **GLOBALE A DESSEIN, et la surface est PUBLIQUE** (lot L28).'
        || chr(10) || '        -- Deux filiales ne doivent jamais pouvoir frapper le meme secret :'
        || chr(10) || '        -- revoquer l''un laisserait l''autre vivre. Et la recherche par'
        || chr(10) || '        -- empreinte a lieu AVANT le perimetre — c''est elle qui le produit'
        || chr(10) || '        -- (CONVENTIONS.md §46). Meme motif que uq_jetons_api_empreinte.'
        || chr(10) || '        ' || quote_literal('uq_portail_liens_empreinte'));
    execute v_neuf;
    raise notice 'Dispense posee pour uq_portail_liens_empreinte.';
end;
$$;

-- =====================================================================================
-- §6 — LE GARDE-FOU
-- =====================================================================================

create or replace function f_verifier_portail()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    v_temoins constant jsonb := jsonb_build_array(
        jsonb_build_object('t','portail_liens','n','ck_portail_liens_destinataire',
            'ligne', jsonb_build_object('destinataire',''),
            'e','UN LIEN ANONYME devient emissible : « usage nominatif » cesse d''etre '
                'verifiable, et on ne sait plus lequel revoquer'),
        jsonb_build_object('t','portail_liens','n','ck_portail_liens_usages',
            'ligne', jsonb_build_object('usages', -1),
            'e','le compteur d''usages cesse d''etre un compteur'),
        jsonb_build_object('t','portail_liens','n','ck_portail_liens_duree',
            'ligne', jsonb_build_object(
                'cree_le', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
                'expire_le', to_char(now() + interval '400 days',
                                     'YYYY-MM-DD"T"HH24:MI:SSOF')),
            'e','UN LIEN DE PLUS DE 180 JOURS devient emissible : au-dela, ce n''est '
                'plus un lien de campagne, c''est un compte sans mot de passe — et '
                'l''adresse a change de mains depuis longtemps'))
    ;
    v_valide constant jsonb := jsonb_build_object(
        'destinataire', 'contact@fournisseur.example',
        'prefixe', 'grcp_abcd',
        'usages', 0,
        'cree_le', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'expire_le', to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'));
    v_piece   jsonb;
    v_accepte boolean;
    v_composite boolean;
begin
    if to_regclass('public.portail_liens') is null then
        objet    := 'portail_liens';
        anomalie := 'table_portail_absente';
        detail   := 'La table des liens du portail a disparu.';
        return next;
        return;
    end if;

    -- ── 1. LES CONTRAINTES SONT EPROUVEES, dans les DEUX sens (§39.1) ───────────
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n',
                                          v_piece -> 'ligne');
        if v_accepte is null then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_portail_non_mesurable';
            detail   := format('Le predicat de « %s » n''a pas pu etre evalue.',
                               v_piece ->> 'n');
            return next;
        elsif v_accepte then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_portail_videe';
            detail   := format('La contrainte « %s » ACCEPTE la ligne temoin %s, qu''elle '
                               'doit refuser. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece -> 'ligne', v_piece ->> 'e');
            return next;
        end if;
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n', v_valide);
        if v_accepte is distinct from true then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_portail_refuse_le_normal';
            detail   := format('La contrainte « %s » refuse un lien ordinaire.',
                               v_piece ->> 'n');
            return next;
        end if;
    end loop;

    -- ── 2. L'EXPIRATION EST OBLIGATOIRE ────────────────────────────────────────
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.portail_liens')
           and a.attname = 'expire_le' and not a.attnotnull)
    then
        objet    := 'portail_liens.expire_le';
        anomalie := 'lien_sans_terme';
        detail   := 'L''expiration a cesse d''etre obligatoire : un lien sans terme '
                    'n''est plus un lien, c''est un compte sans mot de passe — '
                    'c''est-a-dire exactement ce que le lot L28 refuse.';
        return next;
    end if;

    -- ── 3. LA CLE VERS LE QUESTIONNAIRE EST COMPOSITE ──────────────────────────
    --    ⚠️ Une cle SIMPLE serait satisfaite par un questionnaire INVISIBLE de la
    --    filiale voisine (§17.1), et un lien de la filiale A ouvrirait celui de B.
    --    Sur une surface PUBLIQUE, c'est la fuite la plus couteuse du produit.
    select count(*) > 0 into v_composite
      from pg_constraint c
     where c.conrelid = to_regclass('public.portail_liens')
       and c.contype = 'f'
       and c.confrelid = to_regclass('public.questionnaires_tiers')
       and cardinality(c.conkey) > 1;
    if not v_composite then
        objet    := 'portail_liens.fk_portail_liens_questionnaire';
        anomalie := 'lien_portail_cle_simple';
        detail   := 'La cle vers le questionnaire n''est plus COMPOSITE : elle serait '
                    'satisfaite par un questionnaire invisible de la filiale voisine, et '
                    'un lien public de la filiale A ouvrirait le questionnaire de B.';
        return next;
    end if;

    -- ── 4. L'UNICITE DE L'EMPREINTE ────────────────────────────────────────────
    if not exists (
        select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where i.indrelid = to_regclass('public.portail_liens')
           and i.indisunique and c.relname = 'uq_portail_liens_empreinte')
    then
        objet    := 'portail_liens.uq_portail_liens_empreinte';
        anomalie := 'empreinte_portail_non_unique';
        detail   := 'L''unicite de l''empreinte a disparu : deux liens pourraient porter '
                    'le meme secret, et la revocation de l''un laisserait l''autre vivre.';
        return next;
    end if;

    -- ── 5. LES TROIS ACTIONS DE JOURNAL EXISTENT (28.8) ────────────────────────
    foreach v_piece in array array[
        to_jsonb('portail_ouverture'::text), to_jsonb('portail_reponse'::text),
        to_jsonb('portail_depot'::text)]
    loop
        v_accepte := f_contrainte_accepte(
            'journal_audit', 'ck_journal_audit_action',
            jsonb_build_object('action', v_piece #>> '{}'));
        if v_accepte is distinct from true then
            objet    := 'journal_audit.' || (v_piece #>> '{}');
            anomalie := 'action_portail_non_journalisable';
            detail   := format('Le journal refuse l''action « %s » : une ouverture de '
                               'lien, une reponse ou un depot venus de l''exterieur '
                               'cesseraient d''etre traces.', v_piece #>> '{}');
            return next;
        end if;
    end loop;

    -- ── 6. LA DATE D'ORIGINE D'UNE REPRISE VA PAR PAIRE (28.6) ─────────────────
    v_accepte := f_contrainte_accepte(
        'questionnaire_reponses', 'ck_questionnaire_reponses_reprise',
        jsonb_build_object('reprise_de_id', 'QREP-1', 'reprise_donnee_le', null));
    if v_accepte is distinct from false then
        objet    := 'questionnaire_reponses.ck_questionnaire_reponses_reprise';
        anomalie := 'reprise_sans_date';
        detail   := 'Une reponse REPRISE peut ne pas porter sa date d''origine : une '
                    'reponse de 2024 presentee comme neuve serait un faux en audit.';
        return next;
    end if;

    return;
end;
$fn$;

comment on function f_verifier_portail() is
    'Garde-fou du portail fournisseur (lot L28). Il EPROUVE trois contraintes dans les '
    'deux sens (§39.1), exige que l''EXPIRATION reste obligatoire — un lien sans terme '
    'est un compte sans mot de passe —, que la cle vers le questionnaire reste COMPOSITE '
    '— une cle simple ouvrirait publiquement le questionnaire de la filiale voisine —, '
    'que l''empreinte reste unique, que les trois actions de journal existent, et qu''une '
    'reponse REPRISE porte sa date d''origine. Decouvert par '
    'f_decouvrir_controles_schema().';

-- =====================================================================================
-- §7 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('058', 'Le portail fournisseur : le PREMIER composant hors VPN. Pas de compte — '
               'un lien signe, nominatif, date, revocable, portant sur UN SEUL '
               'questionnaire, et qui expire tout seul. ⚠️ Le lien porte sa filiale en '
               'clair, application directe du CONVENTIONS.md §46 ecrit le meme jour au '
               'lot L22. ⚠️ Un lien expire, revoque ou inconnu rend 404, jamais 403')
on conflict (version) do nothing;

commit;
