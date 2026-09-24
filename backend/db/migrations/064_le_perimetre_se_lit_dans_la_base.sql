-- =====================================================================================
--  064 — LE PÉRIMÈTRE SE LIT DANS LA BASE, ET LES SCRIPTS D'EXPLOITATION AUSSI
--
--  §1  Le privilège qui manquait
--  §2  Le garde-fou
--  §3  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Elle est la dernière pièce d'un défaut mesuré le 24/09/2026, en répondant à une
--  question de l'utilisateur — *« on ne peut pas créer de filiale depuis le logiciel »*.
--  Le défaut trouvé était plus grave que celui qu'il désignait : **personne ne portait
--  `/etc/cyber-grc/filiales.conf` dans la table `filiales`.** `insert into filiales`
--  n'existait ni dans `deploy/` ni dans `db/`, et le commentaire d'`install.sh`
--  l'annonçait encore au futur — « que le lot L4 consommera pour semer la table ».
--
--  Les deux moitiés du dispositif lisaient donc DEUX SOURCES DIFFÉRENTES :
--
--    · `deploy/groupes-ad.sh`           → le FICHIER → les groupes créés dans l'annuaire ;
--    · `db/synchroniser-groupes-ad.mjs` → la TABLE   → `groupes_ad`, l'autorité
--      applicative qui décide de ce qu'un groupe ACCORDE.
--
--  Mesuré sur le code compilé, avec deux filiales déclarées et une table vide : **26
--  groupes créés dans l'annuaire, 10 seulement déclarés en base**. `GRC-ADMIN` ne
--  dépendant d'aucune filiale, l'administrateur entrait et le produit avait l'air de
--  marcher ; les seize groupes de filiale, eux, n'accordaient RIEN — un RSSI de site se
--  connectait sans obtenir le moindre accès, sans message d'erreur ni côté annuaire ni
--  côté application. C'est le constat **Q-78** d'un cran plus loin, et avec cette
--  aggravation qu'il ne frappait que les comptes de filiale.
--
--  ── L'ARBITRAGE : LA TABLE EST LA SOURCE, LE FICHIER EST UN AMORÇAGE ─────────────
--
--  Ce n'est pas un choix de goût. Le service tourne sous `ProtectSystem=strict` avec
--  `ReadWritePaths=/var/lib/cyber-grc /var/log/cyber-grc` : `/etc/cyber-grc` lui est en
--  LECTURE SEULE. Un écran ne pourra donc **jamais** écrire `filiales.conf`, et l'y
--  autoriser serait une régression du bac à sable. Le seul sens ouvert est fichier →
--  table, une fois, à l'installation (`db/importer-filiales.mjs`) ; ensuite, une
--  acquisition se déclare **à l'écran**, par un administrateur, avec sa trace au journal.
--
--  ── CE QUE CETTE MIGRATION CHANGE, ET C'EST UNE LIGNE ────────────────────────────
--
--  `deploy/groupes-ad.sh` lit désormais la table. Il l'interroge sous le rôle de
--  SUPERVISION (`grc_lecture`), qui n'avait pas le droit d'exécuter
--  `f_filiales_actives()` — la fonction `security definer` par laquelle on lit le
--  périmètre hors de toute session (`010`, constat Q-132).
--
--  🛑 **ET LE SYMPTÔME ÉTAIT UN REPLI SILENCIEUX.** Sans ce privilège, la requête
--  échouait, le script retombait sur le fichier, et **la sortie était juste par accident**
--  — jusqu'au jour où le fichier et la table divergent, c'est-à-dire après la première
--  acquisition déclarée à l'écran. Le repli est désormais ANNONCÉ par le script ; il reste
--  que la voie nominale doit fonctionner, et c'est ce que cette ligne pose.
--
--  ⚠️ **Ce que le privilège N'OUVRE PAS** : `f_filiales_actives()` rend l'identifiant, le
--  code et la raison sociale des filiales actives — rien de plus, et rien de cloisonné.
--  Le rôle de supervision lit déjà `groupes_ad`, dont chaque nom PORTE le code de la
--  filiale : ce privilège ne lui apprend donc rien qu'il ne puisse déjà déduire. Il
--  n'ouvre aucun accès aux DONNÉES d'une filiale, qui restent bornées par la RLS.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE PRIVILÈGE QUI MANQUAIT
-- =====================================================================================

grant execute on function f_filiales_actives() to grc_lecture;

-- =====================================================================================
-- §2 — LE GARDE-FOU
--
-- ⚠️ **Pourquoi un garde-fou pour un `grant`.** Un privilège se perd sans bruit : un
-- `revoke` dans une migration ultérieure, une restauration partielle, un rôle recréé. Le
-- symptôme serait celui-là même que cette migration ferme — un script d'exploitation qui
-- retombe sur sa source de secours et qui a l'air de marcher.
--
-- ⚠️ **La liste est écrite À LA MAIN, et c'est ici le BON cas** — la seconde ligne du
-- tableau du `CLAUDE.md` §3. Elle nomme les fonctions que les scripts de `deploy/`
-- appellent sous le rôle de supervision. Si l'on en ajoute une sans son `grant`, le
-- script échoue **bruyamment** au premier passage (« permission denied for function »),
-- et un humain doit décider si la supervision a le droit de la voir. Découvrir cette
-- liste dans le catalogue serait au contraire impossible : rien, dans `pg_proc`, ne dit
-- qu'un script de shell appelle une fonction.
-- =====================================================================================

create or replace function f_verifier_privileges_exploitation()
returns table (objet text, anomalie text, detail text)
language sql
stable
-- ⚠️ **PAS `security definer`, et ce n'est pas un oubli.** Un garde-fou de schéma
-- s'exécute sous l'appelant — `f_verifier_schema()`, jouée par le propriétaire —, et
-- `f_verifier_point_appel()` REFUSE un contrôle qui serait `definer` : une fonction
-- de vérification joignable sous l'identité du propriétaire est une porte, pas un
-- contrôle (constat Q5-1, `CONVENTIONS.md` §19.4). Il n'en a d'ailleurs aucun besoin :
-- `pg_proc` et `has_function_privilege()` sont lisibles par tous.
set search_path = pg_catalog, public, pg_temp
as $$
    with attendus (fonction, motif) as (values
        ('f_filiales_actives',
         'deploy/groupes-ad.sh lit le périmètre par elle : sans ce privilège il retombe '
         'sur filiales.conf, et la sortie n''est juste que par accident'),
        ('f_echelle_porteurs',
         'les scripts d''exploitation lisent la déclaration des porteurs d''échelle (049)')
    )
    select a.fonction,
           'privilege_execute_manquant',
           a.motif
      from attendus a
     where exists (select 1 from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = a.fonction)
       and not has_function_privilege('grc_lecture', a.fonction || '()', 'execute')
    union all
    -- CONTRE-TÉMOIN : une fonction de la liste qui n'existerait plus est une anomalie
    -- d'un autre genre, et elle se dit — sans quoi retirer la fonction rendrait ce
    -- garde-fou muet, c'est-à-dire vert (motif du `CONVENTIONS.md` §39).
    select a.fonction,
           'fonction_attendue_absente',
           'la liste du garde-fou nomme une fonction que le schéma ne porte plus : '
           || a.motif
      from attendus a
     where not exists (select 1 from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = a.fonction);
$$;

-- Les mêmes privilèges que les autres garde-fous : PostgreSQL accorde EXECUTE à
-- PUBLIC par défaut, et un contrôle joignable par n'importe qui renseigne sur le
-- schéma (constat Q-136).
revoke all on function f_verifier_privileges_exploitation() from public;
grant execute on function f_verifier_privileges_exploitation() to grc_app;

comment on function f_verifier_privileges_exploitation() is
    'Les fonctions que les scripts de deploy/ appellent sous grc_lecture portent-elles '
    'bien le privilège EXECUTE ? Un privilège perdu fait retomber un script sur sa '
    'source de secours, et il a alors l''air de marcher (migration 064).';

-- =====================================================================================
-- §3 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('064', 'le périmètre se lit dans la base : grc_lecture peut exécuter '
               'f_filiales_actives(), sans quoi deploy/groupes-ad.sh retombait en silence '
               'sur filiales.conf — et la sortie n''était juste que par accident')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_privileges_exploitation();
--   delete from controles_schema where fonction = 'f_verifier_privileges_exploitation';
--   revoke execute on function f_filiales_actives() from grc_lecture;
--   delete from migrations_schema where version = '064';
--   commit;
-- ⚠️ Annuler REMET le défaut : deploy/groupes-ad.sh retombera sur filiales.conf, en le
--    disant — mais la voie nominale sera refermée.
-- =====================================================================================
