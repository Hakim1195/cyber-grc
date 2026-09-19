-- =====================================================================================
--  048 — LE CATALOGUE DES RÉGLAGES : la table « parametres » cesse d'être morte
--
--  §0  Le périmètre de la migration
--  §1  Le catalogue, au niveau GROUPE
--  §2  Le garde-fou — un réglage se DÉCIDE, il ne s'invente pas
--  §3  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  `parametres` existe depuis la `001`. Elle porte tout ce qu'il faut — catégorie, clé,
--  valeur, valeur par défaut, type, secret, libellé, description, « modifiable » —, elle
--  est cloisonnée, elle est MIXTE (une ligne à `filiale_id` nul est le réglage du Groupe,
--  une ligne renseignée la surcharge d'une filiale) — et **aucun écran ne la montre** :
--  absente du registre d'entités, absente du modèle de reprise, absente de la carte des
--  domaines.
--
--  ⚠️ **« Personne ne la lit » aurait été FAUX, et il a fallu le mesurer pour le savoir.**
--  Deux mécanismes y écrivaient déjà, sans papiers :
--
--    · `src/notifications/relances.ts` — `notifications.derniere_relance`, la fenêtre
--      anti-doublon du lot L12, une clé par filiale ;
--    · `deploy/retention.sh` — `journal.ancrage_<année>`, l'empreinte du dernier maillon
--      archivé, sans laquelle la chaîne du journal ne se vérifie plus de part et d'autre
--      d'une coupure (`CONVENTIONS.md` §12).
--
--  Les deux ont été trouvés par le banc, en cassant : le garde du §2.2 a refusé l'écriture
--  de L12, et la contrainte du §2.1 a fait échouer le script de rétention. *Une table
--  qu'on croit morte mérite d'être interrogée avant d'être décrite ainsi* — c'est la règle
--  du `CLAUDE.md` §0, appliquée à une table plutôt qu'à une machine.
--
--  Ce qui reste vrai, et qui motive cette migration : **rien ne l'expose**. Un exploitant
--  ne peut ni voir ni ajuster un seul paramètre du produit, et les deux seuils ci-dessous
--  sont écrits en dur dans le navigateur. C'est la moitié du constat **Q-150** qui
--  s'applique — *« la table existe et aucun écran ne s'en sert »*.
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST LE CŒUR ───────────────────────
--
--  **Elle n'ouvre PAS un magasin de clés-valeurs libre.** Un réglage que le produit ne
--  LIT pas est un réglage qui ment : l'exploitant le modifie, croit avoir agi, et rien
--  ne change. C'est le constat **Q-91** — *« trois variables vivaient dans `.env.example`,
--  chacune avec un paragraphe expliquant ce qu'elle règle, et aucune n'était lue nulle
--  part »* —, et le dépôt porte déjà un garde-fou pour cette classe
--  (`test/depot/reglages-lus.test.mjs`).
--
--  Le catalogue est donc **fermé** : il ne contient que des réglages dont un consommateur
--  existe, et `test/depot/reglages-catalogue-lus.test.mjs` refuse qu'une clé y entre sans
--  que `cyber-gouvernance_V4/js/` la lise.
--
--  ── LES DEUX PREMIERS, ET POURQUOI CEUX-LÀ ───────────────────────────────────────
--
--  Ce ne sont pas des réglages inventés pour remplir un écran : ce sont deux seuils
--  **déjà écrits en dur** dans le produit, et qui n'ont aucune raison d'être les mêmes
--  chez un sous-traitant de vingt personnes et chez un site de production continue :
--
--    · `echeances.seuil_urgent_jours` — `js/services/echeances.js` range dans « cette
--      semaine » ce qui échoit sous **7 jours** ;
--    · `documents.preavis_revue_jours` — `js/modules/documents.js` signale une revue
--      documentaire **30 jours** avant sa date.
--
--  ⚠️ **Ils sont de niveau GROUPE avec surcharge par filiale**, et non l'inverse : un
--  groupe qui compare ses filiales a besoin d'une valeur commune par défaut, et d'une
--  filiale qui puisse dire « chez moi, c'est autrement » en le sachant.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 048_le_catalogue_des_reglages.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- `parametres` est cloisonnée et `force row level security` vaut pour le propriétaire :
-- sans périmètre, l'insertion des lignes de niveau Groupe serait refusée par la politique
-- d'ajout, qui exige `f_administration_groupe()`. Motif du §0 de la `012`.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-048', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LE CATALOGUE, AU NIVEAU GROUPE
-- -------------------------------------------------------------------------------------
-- ⚠️ `filiale_id` NUL : ce sont les valeurs du Groupe. Une filiale qui veut autre chose
-- écrit SA ligne, avec la même clé — c'est ce que l'unicité
-- `uq_parametres_cle (filiale_id, cle)` autorise, et ce que le patron mixte de cette
-- table a toujours prévu.
--
-- ⚠️ `valeur` reste NULLE ici, et `valeur_defaut` porte la valeur : la distinction n'est
-- pas cosmétique. « Personne n'a rien changé » et « quelqu'un a explicitement remis la
-- valeur d'origine » sont deux faits différents, et l'écran doit pouvoir les distinguer
-- pour dire « hérité » plutôt que « réglé ».
-- =====================================================================================

insert into parametres
    (id, filiale_id, categorie, cle, valeur, valeur_defaut, type_valeur, libelle,
     description, modifiable)
values
  (f_generer_id('PARAM'), null, 'affichage', 'echeances.seuil_urgent_jours',
   null, '7', 'entier',
   'Échéancier : seuil « urgent », en jours',
   'Une échéance qui tombe dans ce délai est rangée avec les urgentes, et compte dans le '
   'badge du menu. Sept jours convient à un rythme hebdomadaire ; un site en production '
   'continue préfère souvent trois.',
   true),
  (f_generer_id('PARAM'), null, 'affichage', 'documents.preavis_revue_jours',
   null, '30', 'entier',
   'Documents : préavis avant une revue, en jours',
   'Un document dont la revue tombe dans ce délai est signalé « à réviser » et remonte au '
   'tableau de bord. Trente jours laisse le temps d''un circuit d''approbation ; une '
   'organisation qui valide en comité trimestriel en met souvent quatre-vingt-dix.',
   true),
  -- ── ⚠️ UNE CLÉ QUI VIVAIT DÉJÀ, SANS PAPIERS ──────────────────────────────────────
  --
  -- `src/notifications/relances.ts` écrit `notifications.derniere_relance` par filiale
  -- depuis le lot L12 : c'est la fenêtre anti-doublon, l'horodatage du dernier passage.
  -- La table n'était donc pas tout à fait morte — elle avait UN consommateur, côté
  -- serveur, et aucun papier.
  --
  -- Mesuré en écrivant cette migration, pas supposé : le déclencheur du §2.2 a refusé
  -- l'écriture de L12 à l'exécution suivante du banc, et c'est ainsi qu'on l'a su. *Une
  -- table « que personne ne lit » mérite d'être vérifiée avant d'être décrite ainsi.*
  --
  -- ⚠️ `modifiable = false` : ce n'est PAS un réglage, c'est un ÉTAT. L'écran des
  -- Paramètres n'affiche que les lignes modifiables — exposer un horodatage interne à
  -- côté d'un seuil que l'on ajuste inviterait à le « corriger », et une fenêtre
  -- anti-doublon remise à zéro renvoie des courriels déjà partis.
  (f_generer_id('PARAM'), null, 'notifications', 'notifications.derniere_relance',
   null, '', 'texte',
   'Notifications : dernier passage des relances (technique)',
   'Horodatage du dernier envoi de relances pour cette filiale. Écrit par la tâche '
   'planifiée du lot L12, jamais à la main : c''est lui qui empêche deux exécutions '
   'rapprochées d''expédier deux fois. Le remettre à vide ferait repartir des courriels '
   'déjà envoyés.',
   false)
on conflict (filiale_id, cle) do nothing;

comment on column parametres.valeur_defaut is
    'Valeur du Groupe, posée par la migration qui déclare le réglage. ⚠️ Distincte de '
    '« valeur » : « personne n''a rien changé » et « quelqu''un a explicitement remis la '
    'valeur d''origine » sont deux faits différents, et l''écran dit « hérité » sur le '
    'premier. Une ligne de catalogue (filiale_id nul) porte « valeur_defaut » et laisse '
    '« valeur » nulle ; une surcharge de filiale fait l''inverse.';

-- =====================================================================================
-- §2 — LES DEUX PROPRIÉTÉS SONT DANS LE SCHÉMA, PAS DANS UN GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ **La première rédaction en faisait un `f_verifier_*()`, et c'était interdit.**
-- `CONVENTIONS.md` §41 : *un garde-fou de schéma ne lit AUCUNE ligne d'une table
-- cloisonnée* — `install.sh` appelle `f_verifier_schema()` sans périmètre, et la lecture
-- échoue en `GRC04`. Le banc l'a dit à l'exécution suivante.
--
-- Et le §41 donne son propre remède, mot pour mot : *« un garde qui doit lire des lignes
-- est souvent le signe qu'une contrainte manque »*. C'était le cas ici, deux fois.
-- =====================================================================================

-- ── 2.1 — Une ligne de CATALOGUE est complète ───────────────────────────────────────
--
-- Sans libellé, l'écran affiche une clé technique ; sans valeur par défaut, une filiale
-- qui n'a rien réglé n'a AUCUNE valeur, et le consommateur retombe sur une constante du
-- code — le réglage ne règle alors plus rien.
--
-- ⚠️ **LE DISCRIMINANT EST « modifiable », PAS « niveau Groupe », et il a été trouvé en
-- cassant le produit.** La première rédaction visait toute ligne à `filiale_id` nul — et
-- `deploy/retention.sh` a cessé de fonctionner : il écrit l'**ancrage du journal**
-- (`journal.ancrage_<année>`) au niveau Groupe, avec un libellé mais sans valeur par
-- défaut, puisqu'un ancrage n'en a pas. Le banc l'a dit.
--
-- La règle juste est celle que la table portait déjà dans le commentaire de sa colonne
-- `modifiable` : *« false = paramètre technique, ajustable seulement par migration ou par
-- l'exploitation »*. Un réglage **offert à l'écran** doit porter de quoi s'afficher et de
-- quoi être hérité ; un ÉTAT que le produit écrit pour lui-même ne doit rien.
--
-- ⚠️ Et elle ne vise pas les surcharges de filiale : elles tiennent libellé et valeur par
-- défaut de leur ligne de catalogue. Les exiger recopierait le libellé dans chaque
-- filiale, et les copies divergeraient.
alter table parametres drop constraint if exists ck_parametres_catalogue_complet;
alter table parametres add  constraint ck_parametres_catalogue_complet check (
    filiale_id is not null
    or not modifiable
    or (libelle is not null and libelle <> '' and valeur_defaut is not null));

comment on constraint ck_parametres_catalogue_complet on parametres is
    'Un réglage OFFERT À L''ÉCRAN (niveau Groupe et « modifiable ») porte son libellé et '
    'sa valeur par défaut. Sans libellé, l''écran des Paramètres affiche une clé technique ; sans '
    'valeur par défaut, une filiale qui n''a rien réglé n''a aucune valeur et le '
    'consommateur retombe sur une constante du code, si bien que le réglage ne règle '
    'plus rien. ⚠️ Elle ne vise NI les surcharges de filiale — qui tiennent les deux de '
    'leur ligne de catalogue —, NI les paramètres techniques (« modifiable » faux), comme '
    'l''ancrage du journal qu''écrit deploy/retention.sh : un état que le produit tient '
    'pour lui-même n''a ni libellé à afficher ni valeur à hériter.';

-- ── 2.2 — Aucune surcharge sans sa ligne de catalogue ───────────────────────────────
--
-- ⚠️ **C'est la propriété qui ferme le magasin**, et elle ne peut pas être une clé
-- étrangère : la cible serait « la ligne de même `cle` dont `filiale_id` est nul »,
-- c'est-à-dire un index PARTIEL, et PostgreSQL refuse qu'une clé étrangère en vise un.
--
-- Elle se prend donc DANS LA BASE, par un déclencheur — jamais dans la route. Il y a
-- quatre chemins d'écriture (route générique, greffon, reprise d'un export, `psql`), et
-- une route ne voit que le sien : c'est la leçon du `CONVENTIONS.md` §8.1.
create or replace function f_parametres_cle_au_catalogue()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if new.filiale_id is null then
        return new;   -- c'est LE catalogue : il ne se référence pas lui-même
    end if;
    if not exists (select 1 from parametres c
                    where c.filiale_id is null and c.cle = new.cle) then
        raise exception
            'Le réglage « % » n''existe pas au catalogue du Groupe : une filiale ne peut '
            'pas surcharger une clé que le produit ne lit nulle part.', new.cle
            using errcode = '23514',
                  hint = 'Un réglage se DÉCIDE : il entre au catalogue par une migration, '
                         'avec son libellé, sa valeur par défaut et un endroit du produit '
                         'qui le lit (constat Q-91).';
    end if;
    return new;
end;
$$;

comment on function f_parametres_cle_au_catalogue() is
    'Refuse qu''une filiale surcharge un réglage absent du catalogue du Groupe. ⚠️ Pris '
    'DANS LA BASE et non dans une route : il y a quatre chemins d''écriture, et une route '
    'ne voit que le sien (CONVENTIONS.md §8.1). Une surcharge orpheline serait un réglage '
    'que le produit ne lit pas — celui qui l''a posé croit avoir agi, et rien ne change '
    '(constat Q-91).';

drop trigger if exists trg_parametres_cle_au_catalogue on parametres;
create trigger trg_parametres_cle_au_catalogue
    before insert or update of cle, filiale_id on parametres
    for each row execute function f_parametres_cle_au_catalogue();
alter table parametres enable always trigger trg_parametres_cle_au_catalogue;

-- ── 2.3 — Le garde-fou, qui n'inspecte QUE le catalogue système ─────────────────────
--
-- Il ne lit aucune ligne de `parametres` : il vérifie que les deux pièces ci-dessus
-- EXISTENT, dans `pg_constraint` et `pg_trigger`. C'est tout ce qu'un garde-fou de schéma
-- a le droit de faire ici (§41), et c'est tout ce dont on a besoin — les propriétés,
-- elles, sont désormais tenues par la base à chaque écriture.
create or replace function f_verifier_parametres_catalogue()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if not exists (
        select 1 from pg_constraint c
         where c.conrelid = to_regclass('public.parametres')
           and c.conname = 'ck_parametres_catalogue_complet'
           and c.convalidated)
    then
        objet    := 'parametres.ck_parametres_catalogue_complet';
        anomalie := 'reglage_catalogue_sans_garde';
        detail   := 'La contrainte qui exige un libellé et une valeur par défaut sur une '
                    'ligne de catalogue a disparu. L''écran des Paramètres afficherait '
                    'alors une clé technique, et une filiale qui n''a rien réglé n''aurait '
                    'aucune valeur — le réglage ne réglerait plus rien.';
        return next;
    end if;

    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.parametres')
           and t.tgname = 'trg_parametres_cle_au_catalogue'
           and not t.tgisinternal
           -- ⚠️ `tgenabled = 'A'` : un déclencheur simplement POSÉ se désarme dès qu'une
           --    session bascule en « replica ». C'est la leçon de la migration `021`,
           --    où deux gardes vérifiaient qu'un déclencheur existe sans jamais
           --    regarder s'il était armé (constat Q-281).
           and t.tgenabled = 'A')
    then
        objet    := 'parametres.trg_parametres_cle_au_catalogue';
        anomalie := 'reglage_hors_catalogue_possible';
        detail   := 'Le déclencheur qui refuse une surcharge orpheline a disparu ou n''est '
                    'pas armé « always ». Une filiale pourrait alors régler une clé que le '
                    'produit ne lit nulle part : celui qui l''a posée croit avoir agi, et '
                    'rien ne change (constat Q-91).';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_parametres_catalogue() is
    'Garde-fou du catalogue des réglages. ⚠️ Il n''inspecte QUE le catalogue système — '
    'pg_constraint et pg_trigger —, JAMAIS les lignes de « parametres » : un garde-fou de '
    'schéma ne lit aucune ligne d''une table cloisonnée, parce qu''install.sh appelle '
    'f_verifier_schema() sans périmètre (CONVENTIONS.md §41). Les deux propriétés sont '
    'tenues par la base elle-même : une contrainte et un déclencheur.';

-- =====================================================================================
-- §3 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('048', 'le catalogue des réglages : « parametres », vivante depuis la 001 et lue '
               'par personne, porte enfin deux seuils que le produit écrivait en dur — et '
               'un garde-fou refuse qu''une filiale surcharge une clé absente du catalogue')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_parametres_catalogue();
--   delete from controles_schema where fonction = 'f_verifier_parametres_catalogue';
--   delete from parametres where cle in ('echeances.seuil_urgent_jours',
--                                        'documents.preavis_revue_jours');
--   delete from migrations_schema where version = '048';
--   commit;
--   ⚠️ Annuler REMET les seuils en dur : les filiales qui les avaient ajustés perdent
--     leur réglage, et le produit se remet à sept et trente jours sans le dire.
-- =====================================================================================
