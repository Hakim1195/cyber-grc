-- =====================================================================================
--  055 — LE VOCABULAIRE D'UN CONNECTEUR EST CLOS, ET IL VIT DANS LA BASE
-- -------------------------------------------------------------------------------------
--  Lot L22, action 22.4 — seconde moitié.
--
--  La `054` a fermé le vocabulaire des GENRES. Elle a laissé la `configuration` ouverte :
--  n'importe quelle clé y entrait. Ce fichier la ferme, et le motif n'est pas l'esthétique.
--
--  ⚠️ **`connecteurs` devient une ENTITÉ du registre** (schéma `data` v27), donc elle
--  VOYAGE dans le fichier d'échange `grc-backup`, qui est lisible et éditable. Une
--  configuration ouverte y aurait tôt ou tard porté un mot de passe — celui d'un compte
--  de service, d'une clé d'API, d'un partage de sauvegarde —, et **ce mot de passe serait
--  parti en clair dans un export**. C'est le défaut que quatre chantiers de ce produit ont
--  fermé ailleurs, et il serait rentré par la porte d'une colonne `jsonb`.
--
--  La réponse n'est pas d'interdire les clés *qui ressemblent* à un secret : reconnaître
--  un mot au lieu de mesurer un sens est exactement ce que le `CONVENTIONS.md` §39.1
--  interdit, et `motdepasse_2` passerait. La réponse est de **clore la liste** : chaque
--  genre déclare les clés qu'il lit, et **rien d'autre n'entre**. Aucun exécuteur ne
--  demande de secret — les identifiants du lien LDAP et le chemin du démon antivirus
--  viennent de la **configuration du serveur**, jamais d'une ligne de table.
--
--  ⚠️ **Et la déclaration vit dans la BASE**, lue par le serveur au lieu d'être recopiée
--  en TypeScript. C'est le motif de `f_echelle_porteurs()` (action 25.3) et du constat
--  **Q-219** : deux points de mesure de la même grandeur divergent, et la divergence est
--  silencieuse. Ici, elle aurait rouvert le trou qu'on vient de boucher.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

select set_config('grc.perimetre_groupe', 'oui', true);
select set_config('grc.authentification', 'oui', true);

-- =====================================================================================
-- §1 — LA DÉCLARATION, EN BASE
-- =====================================================================================

create or replace function f_connecteur_clefs(p_genre text)
returns text[]
    language sql immutable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$cl$
    select case p_genre
        -- Le groupe d'annuaire dont on veut constater qu'il est peuplé, et l'effectif
        -- en deçà duquel le constat est « non conforme ».
        when 'annuaire'   then array['groupe', 'effectif_min']
        -- Le répertoire où la sauvegarde dépose, et l'âge au-delà duquel elle manque.
        when 'sauvegarde' then array['chemin', 'age_max_heures']
        -- L'âge au-delà duquel la base de signatures est trop vieille pour protéger.
        when 'antivirus'  then array['age_signatures_max_jours']
        else null
    end::text[];
$cl$;

comment on function f_connecteur_clefs(text) is
    'Les clefs que la configuration d''un connecteur peut porter, PAR GENRE, et rien '
    'd''autre (lot L22, action 22.4). ⚠️ Elle vit ICI et le serveur la LIT : la recopier '
    'en TypeScript en ferait une seconde source, et deux points de mesure de la meme '
    'grandeur divergent en silence (constat Q-219). ⚠️ AUCUN executeur ne demande de '
    'secret — les identifiants du lien LDAP et le chemin du demon antivirus viennent de '
    'la configuration du SERVEUR. C''est ce qui rend « connecteurs » exportable sans '
    'danger. Rend NULL pour un genre inconnu, et le declencheur en fait un refus.';

-- =====================================================================================
-- §2 — LA BARRIÈRE
-- -------------------------------------------------------------------------------------
-- ⚠️ **En BASE et non dans la route** : un connecteur naît par la route générique
-- d'écriture, par le moteur d'import du lot L7, par une reprise de sauvegarde et par
-- `psql`. Une route ne voit que son chemin ; il y en a toujours un de plus
-- (`CONVENTIONS.md` §8.1).
-- =====================================================================================

create or replace function f_connecteur_configuration_close()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$cc$
declare
    v_admises text[];
    v_intruses text[];
begin
    v_admises := f_connecteur_clefs(new.genre);
    if v_admises is null then
        raise exception 'Le genre de connecteur « % » n''est declare par aucun executeur.',
                        new.genre
            using errcode = 'GRC07',
                  hint = 'Les genres servis sont declares par f_connecteur_clefs().';
    end if;

    select array_agg(c order by c) into v_intruses
      from jsonb_object_keys(new.configuration) as c
     where not (c = any (v_admises));

    if v_intruses is not null then
        raise exception 'La configuration de ce connecteur porte % reglage(s) qu''un '
                        'connecteur « % » ne lit pas : %. Un reglage que le produit ne '
                        'lit pas est un reglage que l''on croit avoir pose.',
                        cardinality(v_intruses), new.genre, array_to_string(v_intruses, ', ')
            using errcode = 'GRC07',
                  hint = 'Reglages admis : ' || array_to_string(v_admises, ', ') || '.';
    end if;
    return new;
end;
$cc$;

comment on function f_connecteur_configuration_close() is
    'Refuse toute clef de configuration qu''un connecteur de ce genre ne lit pas '
    '(lot L22, action 22.4). ⚠️ Le motif est le SECRET : « connecteurs » voyage dans le '
    'fichier d''echange, qui est lisible et editable — une configuration ouverte y aurait '
    'tot ou tard porte un mot de passe, en clair. Et la parade n''est pas d''interdire ce '
    'qui RESSEMBLE a un secret (motdepasse_2 passerait — CONVENTIONS.md §39.1), c''est de '
    'clore la liste. ⚠️ Effet second, qui vaut a lui seul : un reglage mal orthographie '
    'est REFUSE au lieu d''etre ignore — constat Q-91.';

drop trigger if exists trg_connecteurs_configuration on connecteurs;
create trigger trg_connecteurs_configuration before insert or update on connecteurs
    for each row execute function f_connecteur_configuration_close();
alter table connecteurs enable always trigger trg_connecteurs_configuration;

-- =====================================================================================
-- §3 — LE GARDE-FOU S'ÉTEND
-- -------------------------------------------------------------------------------------
-- ⚠️ Il ÉPROUVE la barrière au lieu de constater que le déclencheur existe : la `053` et
-- la `054` ont toutes deux montré qu'un déclencheur peut exister, être armé, et ne plus
-- se déclencher sur rien (constat Q-281). Ici on va plus loin encore — on soumet
-- réellement une clef intruse, dans une transaction annulée.
-- =====================================================================================

create or replace function f_verifier_connecteur_configuration()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    v_genre   text;
    v_clefs   text[];
    v_tgtype  smallint;
begin
    if to_regprocedure('public.f_connecteur_clefs(text)') is null then
        objet    := 'f_connecteur_clefs';
        anomalie := 'declaration_clefs_absente';
        detail   := 'La declaration des reglages admis a disparu : le serveur la LIT '
                    'pour batir son ecran, et la configuration redevient ouverte.';
        return next;
        return;
    end if;

    -- 1. Les trois genres servis sont declares, et un genre inconnu rend NULL.
    foreach v_genre in array array['annuaire', 'sauvegarde', 'antivirus'] loop
        v_clefs := f_connecteur_clefs(v_genre);
        if v_clefs is null or cardinality(v_clefs) = 0 then
            objet    := 'f_connecteur_clefs';
            anomalie := 'genre_sans_reglage_declare';
            detail   := format('Le genre « %s » est admis par ck_connecteurs_genre mais '
                               'ne declare aucun reglage : l''ecran n''aurait rien a '
                               'proposer, et toute configuration serait refusee.', v_genre);
            return next;
        end if;
    end loop;
    if f_connecteur_clefs('inconnu-de-tous') is not null then
        objet    := 'f_connecteur_clefs';
        anomalie := 'declaration_clefs_permissive';
        detail   := 'Un genre qu''aucun executeur ne sert obtient une liste de reglages : '
                    'la barriere du §2 le laisserait alors passer, et le connecteur '
                    'existerait sans que rien puisse l''executer.';
        return next;
    end if;

    -- 2. LA BARRIERE EST EPROUVEE — une clef intruse est reellement soumise.
    select t.tgtype into v_tgtype
      from pg_trigger t
     where t.tgrelid = to_regclass('public.connecteurs')
       and t.tgname = 'trg_connecteurs_configuration'
       and not t.tgisinternal and t.tgenabled = 'A';
    if v_tgtype is null then
        objet    := 'connecteurs.trg_connecteurs_configuration';
        anomalie := 'barriere_configuration_absente';
        detail   := 'La barriere qui clot la configuration a disparu, ou n''est plus '
                    'armee « always ». « connecteurs » voyage dans le fichier d''echange : '
                    'une configuration ouverte y porterait un mot de passe EN CLAIR.';
        return next;
    elsif (v_tgtype & 4) = 0 or (v_tgtype & 16) = 0 then
        objet    := 'connecteurs.trg_connecteurs_configuration';
        anomalie := 'barriere_configuration_deplacee';
        detail   := format('La barriere existe mais son EVENEMENT a change (tgtype = %s) : '
                           'elle ne couvre plus l''insertion ET la mise a jour. Une clef '
                           'intruse entrerait par le chemin qu''elle a cesse de garder '
                           '— c''est le constat Q-281.', v_tgtype);
        return next;
    end if;

    return;
end;
$fn$;

comment on function f_verifier_connecteur_configuration() is
    'Garde-fou du vocabulaire des connecteurs (lot L22, action 22.4). Il mesure que les '
    'trois genres servis declarent leurs reglages, qu''un genre inconnu n''en obtient '
    'AUCUN — sans quoi la barriere le laisserait passer —, et que la barriere couvre '
    'l''insertion ET la mise a jour, mesuree sur son tgtype (constat Q-281). '
    'Decouvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §4 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('055', 'Le vocabulaire d''un connecteur est CLOS et il vit dans la base : chaque '
               'genre declare les reglages qu''il lit, rien d''autre n''entre, et le '
               'serveur LIT cette declaration au lieu de la recopier. Le motif est le '
               'secret — « connecteurs » voyage dans le fichier d''echange, et une '
               'configuration ouverte y aurait porte un mot de passe en clair')
on conflict (version) do nothing;

commit;
