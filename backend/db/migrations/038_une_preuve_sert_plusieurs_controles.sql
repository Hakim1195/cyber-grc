-- =====================================================================================
--  038 — Une preuve sert PLUSIEURS contrôles, et le fichier ne se libère qu'au DERNIER
-- -------------------------------------------------------------------------------------
--  §0  Le périmètre de la migration
--  §1  La table `piece_rattachements` — l'ensemble des porteurs que sert une pièce
--  §2  La reprise de l'existant — un rattachement par pièce déjà déposée
--  §2 bis L'INVARIANT, posé dans le schéma : fk_pieces_jointes_adresse
--  §3  Le rattachement d'origine se pose TOUT SEUL (`after insert on pieces_jointes`)
--  §4  Cloisonnement
--  §5  Un rattachement retiré fait CHANGER D'ADRESSE, il ne tue pas
--  §6  `f_pieces_suivent_leur_porteur()` — réécrit : le DERNIER rattachement libère
--  §7  Le garde-fou
--  §8  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — action 19.4 du `docs/PLAN_ACHEVEMENT.md`, « le point dur »
--
--  Un auditeur ISO 27001 demande la même procédure devant cinq contrôles différents. Le
--  produit obligeait à la DÉPOSER cinq fois : cinq lignes, cinq fichiers, cinq empreintes
--  distinctes du même contenu, cinq quotas consommés — et, le jour où la procédure change,
--  QUATRE CHANCES D'EN OUBLIER UNE. Un coffre de preuves qui multiplie ses exemplaires
--  fabrique ses propres contradictions.
--
--  ── ⚠️ CE QUI REND L'ACTION DURE, ET QU'IL NE FAUT PAS CASSER ────────────────────────
--
--  La migration `017` a fermé les constats Q-232 / Q-233 en posant, sur chaque table
--  porteuse, un déclencheur qui SUPPRIME LA PIÈCE AVEC SON PORTEUR. C'est la garantie
--  « zéro orpheline », et elle vaut par sa brutalité : tout chemin de disparition la
--  traverse — suppression directe, cascade du schéma, purge de la reprise, purge RGPD,
--  et jusqu'à un `delete` tapé dans `psql`.
--
--  Réutiliser une pièce la met en tension avec elle-même : si la pièce suit son porteur
--  et qu'elle en a cinq, le premier porteur supprimé emporterait la preuve des quatre
--  autres. **La règle devient donc : une pièce suit SES porteurs, et seul le retrait du
--  DERNIER libère le fichier.** « Zéro orpheline » ne bouge pas d'un pouce — ce qui
--  change est la définition d'être orpheline.
--
--  ── LE DISPOSITIF, ET POURQUOI IL N'EST PAS UNE COLONNE DE PLUS ──────────────────────
--
--  `pieces_jointes.(entite_type, entite_id)` reste **l'adresse de délivrance** : c'est
--  elle que porte l'URL `GET /api/pieces/:entite/:entiteId/:pieceId`, elle que vise
--  l'unicité partielle « une seule pièce en vigueur par porteur », elle que lit le relais
--  de version du document. La casser aurait touché six mécanismes livrés.
--
--  `piece_rattachements` porte **l'ensemble des porteurs servis**, ET IL CONTIENT
--  L'ADRESSE : l'invariant est *« l'adresse de délivrance d'une pièce est toujours l'un
--  de ses rattachements »*. Il n'est pas affirmé, il est POSÉ par deux déclencheurs
--  (§3 et §5) et MESURÉ par un garde-fou (§7) qui compte les lignes réelles.
--
--  ⚠️ **La conséquence qui compte** : quand le porteur d'adresse disparaît et qu'il reste
--  des rattachements, la pièce **change d'adresse** au lieu de mourir. Elle perd au
--  passage son « en vigueur » — faire foi pour un porteur ne se transmet pas à un autre.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- ⚠️ Motif du §0 de la `012`, redit par la leçon du 11/09 : `add constraint` VALIDE les
-- lignes existantes, et `force row level security` vaut pour le propriétaire. Une
-- migration qui touche une table cloisonnée doit donc poser le périmètre du groupe
-- entier, sans quoi elle valide sur un sous-ensemble vide et croit avoir vérifié.
-- =====================================================================================

select set_config('grc.authentification', 'oui', true);
select set_config('grc.utilisateur',      'migration:038', true);
select set_config('grc.administration_groupe', 'oui', true);
select set_config('grc.filiales_lecture',
                  (select coalesce(string_agg(id, ','), '') from filiales), true);

-- =====================================================================================
-- §1 — LA TABLE `piece_rattachements`
-- -------------------------------------------------------------------------------------
-- Forme de `document_mesures` (migration `036`) : ni version, ni déclencheur de mise à
-- jour — *un lien ne se modifie pas, il se supprime et se recrée*.
--
-- ⚠️ **Elle est de niveau FILIALE, pas mixte.** Une pièce jointe porte toujours une
-- filiale (`pieces_jointes.filiale_id not null`), y compris quand son porteur est de
-- portée Groupe : c'est la filiale qui l'a déposée, qui la voit dans son quota et qui
-- peut la retirer. Le rattachement hérite de cette filiale, jamais de celle du porteur —
-- le porteur n'en a pas toujours une.
--
-- ⚠️ **Aucune clé étrangère vers le PORTEUR, et c'est structurel** : le rattachement est
-- polymorphe, comme `pieces_jointes` l'est depuis `001`. Le relais que le schéma ne peut
-- pas prendre est pris par le déclencheur du §6, sur chaque table porteuse — c'est
-- exactement le dispositif de la `017`, et il n'est pas réinventé ici.
-- =====================================================================================

create table if not exists piece_rattachements (
    piece_id     id_metier   not null,
    -- Recopie de la filiale de la PIÈCE, tenue cohérente par la clé composite ci-dessous,
    -- jamais par une saisie. Elle est ici pour que la RLS filtre sans jointure.
    filiale_id   id_metier   not null,
    entite_type  type_entite not null,
    entite_id    id_metier   not null,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),

    -- ⚠️ `filiale_id` entre dans la clé primaire alors qu'il est fonctionnellement
    -- déterminé par `piece_id` : c'est la règle §19.1 — *toute unicité d'une table
    -- cloisonnée porte la filiale*. Sans elle, l'unicité serait satisfaite par une ligne
    -- INVISIBLE d'une filiale voisine, et le message de doublon serait un oracle.
    constraint pk_piece_rattachements primary key (piece_id, filiale_id, entite_type, entite_id),

    -- Clé COMPOSITE (§17.1) : une pièce d'une autre filiale ne peut pas être rattachée
    -- ici même si son identifiant est connu. `cascade` — le rattachement n'a plus d'objet
    -- quand la pièce disparaît.
    constraint fk_piece_rattachements_piece
        foreign key (piece_id, filiale_id)
        references pieces_jointes (id, filiale_id) on delete cascade,
    constraint fk_piece_rattachements_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict
);

comment on table piece_rattachements is
    'Les porteurs qu''une même pièce jointe sert (n-n, action 19.4). Une procédure '
    'déposée une fois prouve cinq contrôles : cinq rattachements, UN fichier, UNE '
    'empreinte, UN quota. ⚠️ L''INVARIANT de la table est que l''adresse de délivrance '
    'd''une pièce — pieces_jointes.(entite_type, entite_id) — est TOUJOURS l''un de ses '
    'rattachements : il est posé par trg_pieces_jointes_rattachement (à l''insertion) et '
    'par trg_piece_rattachements_retrait (au retrait, qui fait CHANGER D''ADRESSE au lieu '
    'de tuer), et mesuré par f_verifier_rattachements_pieces(). Le fichier du magasin '
    'n''est libéré qu''au retrait du DERNIER rattachement — « zéro orpheline » (Q-232 / '
    'Q-233) ne bouge pas : c''est la définition d''être orpheline qui change.';

comment on column piece_rattachements.filiale_id is
    'Recopie du filiale_id de la PIÈCE, jamais de celui du porteur — un porteur de portée '
    'Groupe n''en a pas. Tenue cohérente par fk_piece_rattachements_piece.';
comment on column piece_rattachements.entite_type is
    'Le porteur servi, dans le vocabulaire de l''URL (« mesures » désigne mesure_catalogue). '
    'Même domaine que pieces_jointes.entite_type : les deux colonnes se comparent.';

create index ix_piece_rattachements_porteur on piece_rattachements (entite_type, entite_id);

comment on index ix_piece_rattachements_porteur is
    'Lecture du rattachement polymorphe SANS filiale : c''est ainsi que la liste des '
    'pièces d''un porteur interroge la table, et ainsi que '
    'f_pieces_suivent_leur_porteur() retire les rattachements d''un porteur supprimé. La '
    'RLS borne le résultat.';

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values
  ('piece_rattachements', 'piece_id', 'non_personnelle',
   'Identifiant technique de la pièce jointe rattachée.'),
  ('piece_rattachements', 'filiale_id', 'non_personnelle',
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('piece_rattachements', 'entite_type', 'non_personnelle',
   'Vocabulaire clos : la table porteuse servie.'),
  ('piece_rattachements', 'entite_id', 'non_personnelle',
   'Identifiant technique du porteur servi.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`) : la table naissant après elle, son balayage
-- ne peut pas l'avoir vue.
alter table piece_rattachements
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_piece_rattachements_provenance on piece_rattachements;
create trigger trg_piece_rattachements_provenance before insert on piece_rattachements
    for each row execute function f_marquer_provenance();

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('piece_rattachements', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (saisie / decouverte / '
        'reprise), posée par la migration 032. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- La table porte `cree_par` : c'est LE critère de `f_verifier_tracabilite()`, et non
-- « se modifie-t-elle » (leçon de la `036`, §40 des conventions). On APPELLE
-- l'installateur, on ne recopie pas son déclencheur (§40.3).
select f_poser_tracabilite_insertion();

-- =====================================================================================
-- §2 — LA REPRISE DE L'EXISTANT
-- -------------------------------------------------------------------------------------
-- Chaque pièce déjà déposée sert exactement un porteur : le sien. L'invariant vaut donc
-- dès la première seconde, et le garde-fou du §7 peut être exigeant sans période de
-- grâce. ⚠️ Le §0 a posé le périmètre du groupe entier : sans lui, cette insertion
-- n'aurait vu que les pièces d'une filiale et le garde aurait refusé le déploiement —
-- ce qui, du reste, est ce qu'il doit faire.
-- =====================================================================================

insert into piece_rattachements (piece_id, filiale_id, entite_type, entite_id, cree_le, cree_par)
select p.id, p.filiale_id, p.entite_type, p.entite_id, p.cree_le, p.cree_par
  from pieces_jointes p
on conflict do nothing;

-- ── ⚠️ L'INVARIANT N'EST PAS SURVEILLÉ, IL EST IMPOSÉ ───────────────────────────────
--
-- **Première rédaction : un garde-fou qui COMPTAIT les lignes.** Il mesurait bien, et il
-- était faux pour une autre raison — il lisait `pieces_jointes`, table cloisonnée, et
-- `f_verifier_schema()` est appelé par `install.sh` **sans périmètre** : le contrôle
-- levait `GRC04` au lieu de rendre son verdict. Le banc l'a dit tout de suite.
--
-- La bonne réponse n'était pas d'assouplir le garde, c'était de **poser la propriété dans
-- le schéma**. Cette clé étrangère dit, en une ligne et pour toujours : *l'adresse de
-- délivrance d'une pièce EST l'un de ses rattachements*. Plus rien ne peut l'enfreindre —
-- ni une route, ni `psql`, ni une reprise.
--
-- ⚠️ **`deferrable initially deferred`, et ce n'est pas un confort** : la pièce est
-- insérée AVANT que le déclencheur du §3 pose son rattachement, et le retrait d'un
-- rattachement précède d'un instant la réadresse du §5. Une vérification immédiate
-- refuserait les deux gestes légitimes. Différée, elle est vérifiée **au commit**, c'est-
-- à-dire au seul moment où la question a un sens.
--
-- ⚠️ **`on delete no action`, jamais `cascade`** : si retirer un rattachement emportait la
-- pièce, le dernier détachement détruirait la preuve que les autres porteurs invoquent —
-- c'est-à-dire exactement le défaut que cette migration ferme.
alter table pieces_jointes drop constraint if exists fk_pieces_jointes_adresse;
alter table pieces_jointes
    add constraint fk_pieces_jointes_adresse
    foreign key (id, filiale_id, entite_type, entite_id)
    references piece_rattachements (piece_id, filiale_id, entite_type, entite_id)
    on delete no action on update no action
    deferrable initially deferred;

comment on constraint fk_pieces_jointes_adresse on pieces_jointes is
    'L''INVARIANT de la migration 038, posé plutôt que surveillé : l''adresse de délivrance '
    'd''une pièce — (entite_type, entite_id) — est toujours l''un de ses rattachements. '
    'Différée parce que les deux gestes légitimes la traversent : la pièce naît avant son '
    'rattachement (§3), et le retrait précède la réadresse (§5). « no action » parce qu''un '
    '« cascade » ferait détruire par le dernier détachement la preuve que les autres '
    'porteurs invoquent.';

-- =====================================================================================
-- §3 — LE RATTACHEMENT D'ORIGINE SE POSE TOUT SEUL
-- -------------------------------------------------------------------------------------
-- ⚠️ **Il n'est PAS posé par la route de dépôt, et c'est la décision du §.** Une route
-- ne voit que son chemin ; il y en a toujours un de plus (`CONVENTIONS.md` §8.1). Le
-- dépôt passe aujourd'hui par `POST /api/pieces/:entite/:entiteId` et par
-- `POST /api/pieces/logo` ; demain par autre chose. Une insertion dans `pieces_jointes`
-- qui n'aurait pas son rattachement serait une pièce que personne ne délivre plus —
-- c'est-à-dire une preuve perdue, en silence.
-- =====================================================================================

create or replace function f_piece_declare_son_porteur() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    insert into piece_rattachements (piece_id, filiale_id, entite_type, entite_id)
    values (new.id, new.filiale_id, new.entite_type, new.entite_id)
    on conflict do nothing;
    return null;
end;
$$;

comment on function f_piece_declare_son_porteur() is
    'Déclencheur « after insert on pieces_jointes » : toute pièce naît avec le '
    'rattachement de son porteur d''origine. C''est la moitié POSITIVE de l''invariant de '
    'piece_rattachements — l''adresse de délivrance est toujours l''un des rattachements — '
    'et elle vit dans la base plutôt que dans la route de dépôt parce qu''une route ne '
    'voit que son chemin (CONVENTIONS.md §8.1).';

drop trigger if exists trg_pieces_jointes_rattachement on pieces_jointes;
create trigger trg_pieces_jointes_rattachement after insert on pieces_jointes
    for each row execute function f_piece_declare_son_porteur();

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Contrat de la famille « niveau filiale » (`004_rls.sql` §3). ⚠️ Conséquence à
-- assumer, et elle est voulue : **on ne réutilise que les pièces de SA filiale active**.
-- Réutiliser celle d'une filiale voisine créerait une preuve dont le retrait dépend d'un
-- geste qu'on ne peut pas faire, et un oracle d'existence au passage.
-- =====================================================================================

alter table piece_rattachements enable row level security;
alter table piece_rattachements force  row level security;

drop policy if exists pol_piece_rattachements_lecture     on piece_rattachements;
drop policy if exists pol_piece_rattachements_ajout       on piece_rattachements;
drop policy if exists pol_piece_rattachements_maj         on piece_rattachements;
drop policy if exists pol_piece_rattachements_suppression on piece_rattachements;

create policy pol_piece_rattachements_lecture on piece_rattachements for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_piece_rattachements_ajout on piece_rattachements for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_piece_rattachements_maj on piece_rattachements for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_piece_rattachements_suppression on piece_rattachements for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_piece_rattachements_lecture on piece_rattachements is
    'Lecture : les rattachements de tout le périmètre de la session.';
comment on policy pol_piece_rattachements_ajout on piece_rattachements is
    'Ajout : dans la seule filiale ACTIVE — on ne réutilise que ses propres pièces.';
comment on policy pol_piece_rattachements_maj on piece_rattachements is
    'Modification : dans la seule filiale active. Aucun chemin ne modifie un rattachement '
    '— un lien se supprime et se recrée —, la politique existe pour que le garde-fou de '
    'couverture RLS trouve une écriture cloisonnée sur les quatre commandes.';
comment on policy pol_piece_rattachements_suppression on piece_rattachements is
    'Suppression : dans la seule filiale active.';

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on piece_rattachements to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on piece_rattachements to grc_lecture';
    end if;
end;
$$;

-- ⚠️ **L'ORDRE N'EST PAS UN STYLE** (`CONVENTIONS.md` §40.2) : l'installateur découvre
-- les tables porteuses par un prédicat dont une condition est *« la politique de
-- SUPPRESSION est cloisonnée »*. Appelé avant le §4, il ne verrait pas la table neuve, il
-- équiperait toutes les autres et rendrait un compte plausible.
-- ⚠️ `piece_rattachements` ne sera PAS équipée : elle ne porte pas de colonne `id`, donc
-- le rattachement polymorphe ne peut pas la désigner. L'appel est là pour la règle, et
-- parce qu'une table future qui l'oublierait coûterait un déploiement.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §5 — UN RATTACHEMENT RETIRÉ FAIT CHANGER D'ADRESSE, IL NE TUE PAS
-- -------------------------------------------------------------------------------------
-- La seconde moitié de l'invariant. Quand le rattachement retiré est celui qui servait
-- d'ADRESSE DE DÉLIVRANCE et qu'il en reste d'autres, la pièce est réadressée vers l'un
-- des survivants — sinon l'URL de délivrance désignerait un porteur qui n'existe plus, et
-- la pièce deviendrait indélivrable sans que rien ne l'ait dit.
--
-- ⚠️ **Elle perd son « en vigueur » au passage, et ce n'est pas une précaution technique.**
-- « Cette pièce fait foi » est une propriété DU COUPLE pièce-porteur : la version en
-- vigueur d'une PSSI ne devient pas la version en vigueur d'un contrôle de chiffrement
-- parce que le document a été supprimé. Techniquement, la transmettre heurterait de
-- surcroît `uq_pieces_jointes_en_vigueur` dès que le nouveau porteur a déjà la sienne —
-- et une suppression échouerait pour une raison que personne ne comprendrait.
--
-- ⚠️ **Le cas de la cascade est celui qui décide de la forme.** Quand c'est la PIÈCE qui
-- disparaît, `fk_piece_rattachements_piece` cascade sur ses rattachements et ce
-- déclencheur s'exécute pour chacun : l'`update` ne touche alors AUCUNE ligne, la pièce
-- n'existant plus dans l'instantané. C'est pour cela qu'il est écrit comme une mise à
-- jour conditionnelle et non comme une recherche suivie d'un test.
-- =====================================================================================

create or replace function f_rattachement_retire() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_type text;
    v_id   text;
begin
    select r.entite_type, r.entite_id into v_type, v_id
      from piece_rattachements r
     where r.piece_id   = old.piece_id
       and r.filiale_id = old.filiale_id
     order by r.entite_type, r.entite_id
     limit 1;

    if v_type is null then
        -- Plus aucun porteur : la pièce est orpheline, et c'est à celui qui a retiré le
        -- rattachement de décider ce qu'il en fait — la route de détachement supprime la
        -- ligne, le déclencheur du §6 aussi. Réadresser n'a plus d'objet ici.
        return null;
    end if;

    update pieces_jointes
       set entite_type = v_type::type_entite,
           entite_id   = v_id,
           en_vigueur  = false
     where id          = old.piece_id
       and filiale_id  = old.filiale_id
       and entite_type = old.entite_type
       and entite_id   = old.entite_id;

    return null;
end;
$$;

comment on function f_rattachement_retire() is
    'Déclencheur « after delete on piece_rattachements » : si le rattachement retiré '
    'était l''ADRESSE DE DÉLIVRANCE de la pièce et qu''il en reste d''autres, la pièce est '
    'réadressée vers l''un des survivants et perd son « en vigueur » — faire foi est une '
    'propriété du couple pièce-porteur, elle ne se transmet pas. C''est la seconde moitié '
    'de l''invariant de piece_rattachements. Quand c''est la PIÈCE qui disparaît, la '
    'cascade fait passer ici sans que l''update touche quoi que ce soit : la ligne n''est '
    'plus là.';

drop trigger if exists trg_piece_rattachements_retrait on piece_rattachements;
create trigger trg_piece_rattachements_retrait after delete on piece_rattachements
    for each row execute function f_rattachement_retire();

-- =====================================================================================
-- §6 — `f_pieces_suivent_leur_porteur()` — LE DERNIER RATTACHEMENT LIBÈRE
-- -------------------------------------------------------------------------------------
-- ⚠️ **La fonction est REMPLACÉE EN ENTIER, après lecture entière.** La leçon du 10/09 :
-- « on ne remplace pas une fonction dont on n'a lu qu'une partie » — la mise en file
-- `pieces_a_purger` avait été perdue ainsi. Les trois pièces de la version `017` sont
-- toutes reprises : le retrait, la mise en file APRÈS commit, et la CEINTURE `GRC05`.
--
-- Ce qui change tient en une phrase : **le retrait porte désormais sur les RATTACHEMENTS
-- du porteur, et seule une pièce qui n'en a plus aucun est supprimée.**
-- =====================================================================================

create or replace function f_pieces_suivent_leur_porteur() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_types     text[]  := tg_argv;
    v_restantes integer;
begin
    -- ── 1. Le porteur disparaît : les rattachements qu'il détenait aussi ────────────
    --
    -- Le déclencheur du §5 s'exécute pour chacun : une pièce qui sert encore ailleurs
    -- CHANGE D'ADRESSE ici même, et sort donc du champ du retrait ci-dessous.
    delete from piece_rattachements
          where entite_type = any (v_types)
            and entite_id   = old.id;

    -- ── 2. Ce qui ne sert plus rien : la ligne, puis le fichier APRÈS le commit ──────
    --
    -- L'ordre n'est pas indifférent (`src/pieces/magasin.ts`) : un fichier effacé avant
    -- une transaction qui échoue laisserait une ligne pointant dans le vide, c'est-à-dire
    -- une preuve d'audit perdue. Le déclencheur ne touche donc pas au disque ; il inscrit
    -- le chemin, et l'application vide la file après le commit.
    with retirees as (
        delete from pieces_jointes pj
              where pj.entite_type = any (v_types)
                and pj.entite_id   = old.id
                and not exists (select 1 from piece_rattachements r
                                 where r.piece_id = pj.id and r.filiale_id = pj.filiale_id)
          returning id, filiale_id, entite_type, entite_id, chemin_stockage, quarantaine
    )
    insert into pieces_a_purger
        (chemin_stockage, piece_id, filiale_id, entite_type, entite_id, quarantaine, motif)
    select chemin_stockage, id, filiale_id, entite_type, entite_id, quarantaine,
           'porteur_supprime:' || tg_table_name
      from retirees
    -- Le chemin est unique dans `pieces_jointes` (256 bits d'aléa, unicité globale) :
    -- un conflit ne peut venir que d'une ligne de file qu'un balayage précédent n'a pas
    -- encore consommée. La garder telle quelle est le bon geste.
    on conflict (chemin_stockage) do nothing;

    -- ── 3. LA CEINTURE : ce que la RLS refuse de retirer ne part PAS en silence ──────
    --
    -- Le `delete` ci-dessus est soumis à `pol_pieces_jointes_suppression`
    -- (`filiale_id = f_filiale_ecriture()`), et le retrait des rattachements à la
    -- politique jumelle. Dans le cas nominal, la pièce et son porteur sont de la même
    -- filiale et les deux passent. Le cas qui ne l'est pas existe : un porteur de PORTÉE
    -- GROUPE (`documents.filiale_id` nul) peut porter des pièces déposées par PLUSIEURS
    -- filiales, et le supprimer depuis l'administration Groupe d'une filiale ne peut pas
    -- retirer celles des autres.
    --
    -- On refuse alors la suppression, plutôt que de laisser une orpheline : c'est très
    -- exactement le défaut que la `017` ferme, et le rouvrir d'un cran plus haut serait
    -- la septième occurrence du motif.
    --
    -- ⚠️ **Le compte porte sur les PIÈCES, pas sur les rattachements**, et la nuance est
    -- la livraison : une pièce dont le rattachement à ce porteur a été retiré et qui sert
    -- encore ailleurs a changé d'adresse — elle n'est plus comptée, et c'est bien ce
    -- qu'on veut. Ce qui reste compté est une pièce qui pointe TOUJOURS vers le porteur
    -- supprimé, c'est-à-dire une orpheline.
    select count(*) into v_restantes
      from pieces_jointes
     where entite_type = any (v_types)
       and entite_id   = old.id;

    if v_restantes > 0 then
        raise exception
            'Suppression refusée : % pièce(s) jointe(s) de % « % » appartiennent à une '
            'autre filiale et ne peuvent pas être retirées depuis celle-ci.',
            v_restantes, tg_table_name, old.id
            using errcode = 'GRC05',
                  hint = 'Retirez ces pièces depuis la filiale qui les a déposées, puis '
                         'recommencez. Une pièce jointe ne survit jamais à son porteur '
                         '(constats Q-232 / Q-233) : plutôt que de la laisser orpheline, '
                         'la base refuse la suppression.';
    end if;

    return old;
end;
$$;

comment on function f_pieces_suivent_leur_porteur() is
    'Déclencheur « after delete » posé sur toute table porteuse de pièces jointes : il '
    'retire les RATTACHEMENTS que le porteur détenait (piece_rattachements), et supprime '
    'de pieces_jointes les seules pièces qui n''en ont plus AUCUN — inscrivant leurs '
    'chemins dans pieces_a_purger pour que l''application retire les fichiers APRÈS le '
    'commit. ⚠️ Depuis la migration 038, une preuve sert plusieurs contrôles : seul le '
    'retrait du DERNIER rattachement libère le fichier ; une pièce qui sert encore '
    'ailleurs change d''adresse (f_rattachement_retire). Il prend le relais que le schéma '
    'ne peut pas prendre — un lien polymorphe n''a pas de clé étrangère, donc pas de '
    'cascade — et il le prend pour TOUS les chemins de disparition à la fois : '
    'suppression directe, cascade du schéma, purge de la reprise « remplacer », purge '
    'RGPD, psql. Ses arguments sont les valeurs de entite_type qui désignent la table. '
    'Constats Q-230, Q-232, Q-233 (porte S8) ; action 19.4.';

-- Les déclencheurs neufs de cette migration sont armés « always » comme tout le schéma
-- (§19.4) : `f_armer_declencheurs()` découvre, on ne recopie pas ses `alter table`.
select f_armer_declencheurs();

-- =====================================================================================
-- §7 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Découvert par `f_decouvrir_controles_schema()` sur son seul nom, joué par
-- `f_verifier_schema()`, donc par `db/migrate.mjs` ET par `deploy/install.sh`.
--
-- ⚠️ **Il MESURE, il ne reconnaît pas un mot** (`CONVENTIONS.md` §39). Les trois sens
-- comptent des lignes réelles ou lisent `tgtype` — jamais le texte d'un corps de
-- fonction, qu'un « … or true » viderait sans que rien ne bouge.
-- =====================================================================================

create or replace function f_verifier_rattachements_pieces()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_tgtype smallint;
    v_def    text;
begin
    /* ── ⚠️ CE GARDE NE LIT AUCUNE LIGNE, ET C'EST UNE CORRECTION ─────────────────────
       Sa première rédaction comptait les pièces dont l'adresse n'était pas rattachée.
       Elle mesurait juste — et levait `GRC04` chez `install.sh`, qui appelle
       `f_verifier_schema()` sans périmètre : un garde-fou qui exige un contexte
       d'application ne peut pas garder un déploiement. La propriété a été déplacée dans
       le SCHÉMA (fk_pieces_jointes_adresse) ; ce qui reste ici vérifie que les trois
       pièces du dispositif sont en place, et le fait dans `pg_catalog`. */

    /* ── SENS 1 : l'invariant est-il POSÉ ? ───────────────────────────────────────── */
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'pieces_jointes'::regclass
       and c.conname  = 'fk_pieces_jointes_adresse';
    if v_def is null then
        objet    := 'pieces_jointes';
        anomalie := 'invariant_adresse_absent';
        detail   := 'fk_pieces_jointes_adresse a disparu : plus rien n''impose qu''une pièce '
                    'soit délivrée à l''une des adresses qu''elle sert. La suppression du '
                    'porteur cesserait alors de retirer la pièce, et Q-232 / Q-233 se '
                    'rouvriraient. Rejouez le §2 bis de la migration 038.';
        return next;
    else
        if v_def not like '%DEFERRABLE%' then
            objet    := 'pieces_jointes';
            anomalie := 'invariant_adresse_immediat';
            detail   := 'fk_pieces_jointes_adresse n''est plus différée : elle refuserait le '
                        'dépôt lui-même, la pièce naissant avant son rattachement. Un produit '
                        'où l''on ne peut plus rien déposer est un produit arrêté.';
            return next;
        end if;
        if v_def like '%ON DELETE CASCADE%' then
            objet    := 'pieces_jointes';
            anomalie := 'invariant_adresse_cascade';
            detail   := 'fk_pieces_jointes_adresse cascade à la suppression : détacher une '
                        'preuve d''un porteur DÉTRUIRAIT la pièce que les autres porteurs '
                        'invoquent. C''est le défaut exact que l''action 19.4 ferme.';
            return next;
        end if;
    end if;

    /* ── SENS 2 : les deux déclencheurs, MESURÉS SUR `tgtype` ──────────────────────── */
    /* Leçon Q-281 : vérifier qu'un déclencheur EXISTE ne dit rien de ce qu'il écoute.
       Un événement déplacé laissait deux barrières mortes sous 0 anomalie. Les bits de
       `tgtype` : 1 = par ligne, 2 = BEFORE, 4 = INSERT, 8 = DELETE. */
    select t.tgtype into v_tgtype
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'pieces_jointes'::regclass and not t.tgisinternal
       and p.proname = 'f_piece_declare_son_porteur';
    if v_tgtype is null then
        objet    := 'pieces_jointes';
        anomalie := 'declencheur_rattachement_absent';
        detail   := 'trg_pieces_jointes_rattachement a disparu : une pièce déposée ne '
                    'porterait plus le rattachement de son porteur d''origine, et le dépôt '
                    'échouerait au commit sur fk_pieces_jointes_adresse — c''est-à-dire que '
                    'plus personne ne pourrait déposer de preuve. Rejouez le §3 de la '
                    'migration 038.';
        return next;
    elsif (v_tgtype & 1) <> 1 or (v_tgtype & 2) <> 0 or (v_tgtype & 4) <> 4 then
        objet    := 'pieces_jointes';
        anomalie := 'declencheur_rattachement_mal_arme';
        detail   := 'trg_pieces_jointes_rattachement n''est plus un « after insert » par '
                    'ligne (tgtype = ' || v_tgtype || '). Il existe et ne mord plus : '
                    'c''est le motif exact du constat Q-281.';
        return next;
    end if;

    select t.tgtype into v_tgtype
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'piece_rattachements'::regclass and not t.tgisinternal
       and p.proname = 'f_rattachement_retire';
    if v_tgtype is null then
        objet    := 'piece_rattachements';
        anomalie := 'declencheur_retrait_absent';
        detail   := 'trg_piece_rattachements_retrait a disparu : retirer le rattachement qui '
                    'sert d''adresse ne réadresserait plus la pièce, et supprimer un porteur '
                    'd''une preuve partagée serait REFUSÉ au commit. Rejouez le §5 de la '
                    'migration 038.';
        return next;
    elsif (v_tgtype & 1) <> 1 or (v_tgtype & 2) <> 0 or (v_tgtype & 8) <> 8 then
        objet    := 'piece_rattachements';
        anomalie := 'declencheur_retrait_mal_arme';
        detail   := 'trg_piece_rattachements_retrait n''est plus un « after delete » par '
                    'ligne (tgtype = ' || v_tgtype || ').';
        return next;
    end if;

    /* ── SENS 3 : un rattachement ne survit pas à sa pièce ─────────────────────────── */
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'piece_rattachements'::regclass
       and c.conname  = 'fk_piece_rattachements_piece';
    if v_def is null or v_def not like '%ON DELETE CASCADE%' then
        objet    := 'piece_rattachements';
        anomalie := 'rattachement_sans_cascade';
        detail   := 'fk_piece_rattachements_piece a disparu ou ne cascade plus : une pièce '
                    'supprimée laisserait ses rattachements derrière elle, et les écrans de '
                    'ses porteurs continueraient de l''annoncer.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_rattachements_pieces() is
    'Vérifie que le dispositif de l''action 19.4 est entier : (1) fk_pieces_jointes_adresse '
    'IMPOSE que l''adresse de délivrance d''une pièce soit l''un de ses rattachements — '
    'différée, et jamais en cascade ; (2) les deux déclencheurs qui rendent cet invariant '
    'tenable sont en place ET écoutent le bon événement, mesuré sur tgtype (leçon Q-281 : '
    'un déclencheur qui existe sans mordre est pire qu''absent) ; (3) un rattachement ne '
    'survit pas à sa pièce. ⚠️ Il ne lit AUCUNE ligne des tables cloisonnées, et c''est '
    'une correction : install.sh appelle f_verifier_schema() SANS périmètre, et un garde '
    'qui exige un contexte d''application ne peut pas garder un déploiement. Un schéma '
    'sain ne renvoie AUCUNE ligne.';

grant execute on function f_verifier_rattachements_pieces() to grc_app;

-- =====================================================================================
-- §8 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
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
        raise exception 'Le schéma est en défaut après 038 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, rattachements des pièces compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('038', 'une preuve sert plusieurs contrôles — piece_rattachements, et le fichier '
               'du magasin n''est libéré qu''au retrait du DERNIER rattachement (19.4)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop trigger if exists trg_piece_rattachements_retrait on piece_rattachements;
--   drop trigger if exists trg_pieces_jointes_rattachement on pieces_jointes;
--   drop function if exists f_rattachement_retire();
--   drop function if exists f_piece_declare_son_porteur();
--   alter table pieces_jointes drop constraint if exists fk_pieces_jointes_adresse;
--   drop function if exists f_verifier_rattachements_pieces();
--   delete from controles_schema where fonction = 'f_verifier_rattachements_pieces';
--   -- ⚠️ ET REPOSER LA VERSION `017` DE f_pieces_suivent_leur_porteur(), sans quoi le
--   --    retrait ne porte plus sur rien et TOUTE pièce survit à son porteur.
--   drop table if exists piece_rattachements;
--   delete from migrations_schema where version = '038';
--   commit;
-- ⚠️ La rejouer fait perdre les réutilisations : chaque pièce ne sert plus que l'adresse
--    qu'elle porte, et les preuves rattachées ailleurs cessent d'être délivrées là.
-- =====================================================================================
