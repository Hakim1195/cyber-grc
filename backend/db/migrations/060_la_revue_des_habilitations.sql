-- =====================================================================================
--  060 — LA REVUE DES HABILITATIONS (ISO 27001 A.5.18, NIS2 art. 21)
--
--  §0   Le périmètre de la migration
--  §1   Les deux tables — une campagne, et l'instantané qu'elle fige
--  §2   `type_entite` gagne deux valeurs
--  §3   Cloisonnement : la couverture RLS, et l'ARBITRAGE qu'elle enregistre
--  §4   Le registre de l'article 30 — une revue nomme des personnes
--  §5   Le garde-fou — il ÉPROUVE, il ne reconnaît pas un mot
--  §6   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  L'écran d'habilitations livré le 22/09/2026 rend le modèle de droits VISIBLE et
--  MODIFIABLE. Il ne répond pas encore à la question qu'un auditeur pose juste après :
--
--      *« Montrez-moi la dernière revue de vos droits d'accès. Qui l'a faite, quand,
--        sur quoi, et qu'en a-t-on conclu ? »*
--
--  C'est l'exigence **A.5.18 de l'ISO 27001** — « les droits d'accès doivent être revus
--  à intervalles réguliers » — et c'est aussi ce que NIS2 attend au titre de la maîtrise
--  des accès. Sans elle, l'écran reste un panneau d'administration ; avec elle, il
--  devient une **pièce de conformité**, ce qui est la raison d'être du produit.
--
--  ── CE QUE LA REVUE PORTE, ET POURQUOI IL FALLAIT LIRE L'ANNUAIRE À L'ENVERS ───────
--
--  Tout le produit interroge l'annuaire **depuis une personne** : « à quels groupes
--  appartient-elle ? ». C'est ce dont l'authentification a besoin, et c'est tout ce
--  qu'il savait faire. Une revue pose la question **inverse** : « qui appartient à ce
--  groupe ? ». Aucune des deux réponses ne se déduit de l'autre, et le produit n'en
--  gardait aucune : il ne stocke pas les appartenances, il les RÉSOUT à chaque
--  connexion.
--
--  `ServiceAnnuaire.membresDuGroupe()` a donc été écrite pour ce lot, **en lecture
--  seule**, et elle suit les imbrications — une revue qui ne verrait que les membres
--  directs oublierait précisément les personnes qu'un groupe imbriqué fait entrer
--  (le cas `equipe-secu-tls` éprouvé à la porte S3), et *une revue incomplète est pire
--  qu'une revue absente : elle atteste que rien n'a été trouvé.*
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS, ET NE FERA JAMAIS ──────────────────────
--
--  🛑 **Elle ne retire personne d'un groupe.** La décision « retirer » est consignée,
--  datée, attribuée — et **exécutée par l'administrateur de l'annuaire**. Le produit
--  n'écrit jamais dans l'Active Directory (arbitrage utilisateur du 22/09/2026), et
--  c'est une capacité ABSENTE : `ClientLdap` n'implémente que `lier`, `rechercher` et
--  `fermer`. Une revue qui exécuterait ses propres conclusions serait d'ailleurs une
--  revue sans contrôle : le principe même de l'exercice est que quelqu'un décide, et
--  que quelqu'un d'autre applique.
--
--  ── ⚠️ L'INSTANTANÉ EST FIGÉ, ET C'EST TOUTE LA VALEUR PROBANTE ───────────────────
--
--  Une ligne de revue garde le login, le nom d'affichage et le groupe **tels qu'ils
--  étaient à l'ouverture de la campagne**. Les relire dans l'annuaire au moment de
--  l'affichage rendrait la revue inutilisable en audit : on ne saurait plus ce qui a
--  été revu, seulement ce qui existe aujourd'hui. C'est le même raisonnement que
--  l'empreinte figée d'une approbation (lot L8) et que la main courante de crise
--  (action 20.5) : **ce qui sert de preuve ne se recalcule pas.**
--
--  ⚠️ Corollaire assumé : une revue close cite des personnes qui ont pu quitter le
--  groupe depuis. C'est voulu — c'est ce qu'on a revu.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §1 crée des tables et valide leurs contraintes ; le §4 écrit au registre de
-- l'article 30. Sans périmètre déclaré, une validation qui traverse une table
-- cloisonnée ne verrait aucune ligne et passerait pour un mauvais motif
-- (`CONVENTIONS.md` §42). On déclare le groupe ENTIER, jamais une filiale.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-060', true);
    perform set_config('grc.filiales',
                       coalesce((select string_agg(id, ',') from filiales), ''), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LES DEUX TABLES
-- -------------------------------------------------------------------------------------
-- `revues_habilitations`      : la campagne — qui, quand, sur quoi, et son verdict.
-- `revue_habilitation_lignes` : l'instantané figé, une ligne par (groupe × compte).
-- =====================================================================================

create table revues_habilitations (
    id            id_metier   not null,
    intitule      text        not null,
    -- Le PÉRIMÈTRE de la revue, en toutes lettres : ce qu'elle a effectivement
    -- balayé. Sans cette phrase, une revue close ne dit pas ce qu'elle n'a PAS
    -- regardé, et une revue partielle présentée comme complète est un faux.
    perimetre     text        not null,
    ouverte_le    timestamptz not null default now(),
    ouverte_par   text        not null default f_utilisateur_courant(),
    close_le      timestamptz,
    close_par     text,
    -- La conclusion écrite par celui qui clôt. ⚠️ Obligatoire à la clôture : une
    -- revue sans conclusion ne prouve que le fait d'avoir regardé.
    conclusion    text,
    -- Prochaine échéance : c'est elle qui alimente l'échéancier. `null` = aucune
    -- périodicité décidée, ce qui n'est PAS « pas de revue à faire » — l'écran le dit.
    prochaine_le  date,
    -- ⚠️ La lecture de l'annuaire peut être TRONQUÉE (bornes du contrôle S13). Une
    -- revue fondée sur un balayage incomplet doit le porter, sinon elle atteste de ce
    -- qu'elle n'a pas vu.
    balayage_tronque boolean  not null default false,
    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,
    constraint pk_revues_habilitations      primary key (id),
    constraint ck_revues_hab_intitule       check (intitule <> ''),
    constraint ck_revues_hab_perimetre      check (perimetre <> ''),
    -- Close ⇒ close_par ET conclusion. Les trois vont ensemble ou aucune :
    -- « close par personne » et « close sans conclusion » sont deux façons de
    -- produire une attestation vide.
    constraint ck_revues_hab_cloture        check (
        (close_le is null and close_par is null and conclusion is null)
     or (close_le is not null and close_par is not null and conclusion is not null
         and conclusion <> '')),
    constraint ck_revues_hab_ordre          check (close_le is null or close_le >= ouverte_le)
);

create index ix_revues_hab_ouverture on revues_habilitations (ouverte_le desc);
create index ix_revues_hab_prochaine on revues_habilitations (prochaine_le)
    where prochaine_le is not null;

create trigger trg_revues_habilitations_maj before update on revues_habilitations
    for each row execute function f_maj_tracabilite();
-- ⚠️ **« always », jamais « origin »** : un déclencheur armé en « origin » est
-- neutralisé par « set session_replication_role = replica », et la garantie qu'il
-- porte avec lui — ici le verrouillage optimiste (`CONVENTIONS.md` §19.4). Trouvé
-- par `f_verifier_declencheurs()`, qui refuse le déploiement.
alter table revues_habilitations enable always trigger trg_revues_habilitations_maj;

comment on table revues_habilitations is
    'Revue périodique des droits d''accès (ISO 27001 A.5.18, NIS2 art. 21). Table de '
    'NIVEAU GROUPE : ses trois sources — groupes_ad, profils, utilisateurs — le sont '
    'toutes, et le périmètre d''une personne n''est stocké nulle part, il est résolu à '
    'chaque connexion. ⚠️ Ce qui protège cette table n''est PAS la RLS mais la ROUTE : '
    'sa lecture est ouverte au niveau des politiques (le §2 de 004_rls interdit qu''une '
    'politique de LECTURE dépende d''un réglage d''administration), et la barrière est '
    'la déclaration « lire / administration » des routes de src/habilitations/. Même '
    'régime que utilisateurs, profils et groupes_ad.';
comment on column revues_habilitations.perimetre is
    'Ce que la revue a effectivement balayé, en toutes lettres. Une revue qui ne dit pas '
    'ce qu''elle n''a PAS regardé se lit comme une revue complète.';
comment on column revues_habilitations.balayage_tronque is
    'Vrai si la lecture de l''annuaire a atteint sa borne : l''instantané est INCOMPLET, '
    'et la revue ne peut pas être présentée comme exhaustive.';
comment on column revues_habilitations.prochaine_le is
    'Prochaine revue attendue. Alimente l''échéancier. NULL veut dire « aucune '
    'périodicité décidée », jamais « rien à faire » : l''écran distingue les deux.';

create table revue_habilitation_lignes (
    id            id_metier   not null,
    revue_id      id_metier   not null,
    -- ── L'INSTANTANÉ, FIGÉ ────────────────────────────────────────────────────
    -- Ces quatre colonnes gardent l'annuaire TEL QU'IL ÉTAIT. Les relire à
    -- l'affichage rendrait la revue inutilisable en audit : on ne saurait plus ce
    -- qui a été revu, seulement ce qui existe aujourd'hui.
    groupe_nom    text        not null,
    compte_login  text        not null,
    compte_nom    text        not null,
    -- Le compte était-il DÉSACTIVÉ dans l'annuaire au moment du balayage ? Un
    -- compte désactivé encore membre d'un groupe d'accès est l'anomalie la plus
    -- fréquente d'une revue, et la plus facile à manquer.
    compte_desactive boolean  not null default false,
    -- Membre par IMBRICATION : l'accès ne se voit pas dans le groupe lui-même.
    indirect      boolean     not null default false,
    -- Ce que le groupe accordait au moment du balayage — figé aussi.
    profil_code   text,
    perimetre_groupe text     not null,
    -- ── LA DÉCISION ───────────────────────────────────────────────────────────
    -- « a_examiner » est l'état initial et il est SIGNIFIANT : une revue close
    -- dont des lignes restent à examiner n'est pas une revue faite.
    decision      text        not null default 'a_examiner',
    decide_par    text,
    decide_le     timestamptz,
    commentaire   text,
    -- ⚠️ `version` et `f_maj_tracabilite` — et non le simple horodatage d'une table
    -- fille. Une ligne de revue se MODIFIE (on y prend une décision), à plusieurs,
    -- et deux décisions concurrentes sur la même ligne doivent se voir : sans le
    -- compteur, la seconde écrase la première en silence (risque P1). Trouvé par
    -- `f_verifier_tracabilite()`, qui a refusé le déploiement.
    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,
    constraint pk_revue_hab_lignes      primary key (id),
    constraint fk_revue_hab_lignes_revue foreign key (revue_id)
        references revues_habilitations(id) on delete cascade,
    -- Un couple (groupe, compte) ne figure qu'une fois dans une revue.
    constraint uq_revue_hab_lignes      unique (revue_id, groupe_nom, compte_login),
    constraint ck_revue_hab_champs      check (groupe_nom <> '' and compte_login <> ''
                                               and compte_nom <> ''),
    constraint ck_revue_hab_decision    check (decision in (
        'a_examiner', 'maintenu', 'a_retirer', 'a_verifier')),
    -- Une décision prise porte son auteur ET sa date. ⚠️ « a_examiner » ne peut
    -- pas en porter : ce n'est pas une décision, c'est l'absence de décision.
    constraint ck_revue_hab_signature   check (
        (decision = 'a_examiner' and decide_par is null and decide_le is null)
     or (decision <> 'a_examiner' and decide_par is not null and decide_le is not null)),
    -- ⚠️ « a_retirer » et « a_verifier » EXIGENT un motif. « maintenu » n'en exige
    -- pas : c'est la décision par défaut d'une revue saine, et l'exiger ferait
    -- écrire « RAS » quatre cents fois — ce qui n'est pas un motif, c'est une
    -- habitude qui apprend à ne plus lire.
    constraint ck_revue_hab_motif       check (
        decision not in ('a_retirer', 'a_verifier')
     or (commentaire is not null and commentaire <> ''))
);

create index ix_revue_hab_lignes_revue on revue_habilitation_lignes (revue_id, groupe_nom);
create index ix_revue_hab_lignes_decision on revue_habilitation_lignes (revue_id, decision);

-- ⚠️ **Le NOM du déclencheur est normatif** : `f_verifier_tracabilite()` le cherche
-- sous la forme exacte `trg_<table>_maj`, et ne le trouve pas autrement. Abrégé en
-- `trg_revue_hab_lignes_maj`, il existait, il était armé — et le garde-fou concluait
-- « aucun déclencheur before update », donc « le verrouillage optimiste ne mord plus ».
-- Un garde qui cherche par le nom exige que le nom soit exact ; c'est le prix de la
-- découverte par convention, et il est payé une fois.
create trigger trg_revue_habilitation_lignes_maj before update on revue_habilitation_lignes
    for each row execute function f_maj_tracabilite();
alter table revue_habilitation_lignes
    enable always trigger trg_revue_habilitation_lignes_maj;

comment on table revue_habilitation_lignes is
    'Instantané FIGÉ d''une revue : une ligne par (groupe d''annuaire × compte membre), '
    'avec la décision prise. ⚠️ Les colonnes d''instantané ne se relisent JAMAIS dans '
    'l''annuaire : ce qui sert de preuve ne se recalcule pas (même raisonnement que '
    'l''empreinte d''une approbation, lot L8). Une revue close cite donc des personnes '
    'qui ont pu quitter le groupe depuis — c''est voulu, c''est ce qu''on a revu.';
comment on column revue_habilitation_lignes.decision is
    'a_examiner (état initial, SIGNIFIANT : la ligne n''a pas été revue) · maintenu · '
    'a_retirer · a_verifier. ⚠️ « a_retirer » est une CONSIGNE pour l''administrateur de '
    'l''annuaire : le produit n''écrit jamais dans l''Active Directory.';
comment on column revue_habilitation_lignes.indirect is
    'Le compte est membre par IMBRICATION : son accès ne se voit pas dans le groupe '
    'lui-même. C''est ce qu''une revue manuelle oublie le plus souvent.';
comment on column revue_habilitation_lignes.compte_desactive is
    'Le compte était désactivé dans l''annuaire au moment du balayage. Un compte '
    'désactivé encore membre d''un groupe d''accès est l''anomalie la plus fréquente.';

-- =====================================================================================
-- §2 — `type_entite` GAGNE DEUX VALEURS
-- -------------------------------------------------------------------------------------
-- Le journal d'audit et les pièces jointes désignent une entité par ce domaine. Sans
-- ces deux valeurs, journaliser l'ouverture d'une revue échouerait en 23514 — ce qui,
-- la trace étant écrite DANS la transaction, ferait échouer la revue elle-même.
-- =====================================================================================

do $$
declare
    v_def text;
begin
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where contypid = 'type_entite'::regtype and contype = 'c';
    if v_def is null then
        raise exception 'Le domaine type_entite est introuvable : 060 suppose 001.';
    end if;
    if v_def like '%revues_habilitations%' then
        raise notice 'type_entite porte déjà les valeurs de 060.';
    else
        execute 'alter domain type_entite drop constraint ' ||
                (select quote_ident(conname) from pg_constraint
                  where contypid = 'type_entite'::regtype and contype = 'c');
        execute 'alter domain type_entite add constraint type_entite_check check ('
             || replace(substring(v_def from 7), '''collectes''::text]',
                        '''collectes''::text, ''revues_habilitations''::text, '
                        '''revue_habilitation_lignes''::text]')
             || ')';
    end if;
end;
$$;

do $$
begin
    if (select pg_get_constraintdef(oid) from pg_constraint
         where contypid = 'type_entite'::regtype and contype = 'c')
       not like '%revue_habilitation_lignes%'
    then
        raise exception 'type_entite n''a pas gagné les deux valeurs de 060 : la '
                        'substitution n''a pas mordu, et le journal refuserait la revue.';
    end if;
end;
$$;

-- =====================================================================================
-- §3 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- 🛑 **CE QUI PROTÈGE CES DEUX TABLES EST LA ROUTE, PAS LA RLS**, et il faut le dire
-- parce que c'est inhabituel dans ce schéma.
--
-- Le §2 de `004_rls.sql` interdit qu'une politique de **lecture** dépende de
-- `f_administration_groupe()` — « un réglage de session élargirait la LECTURE » —, et
-- ces tables ne portent pas de `filiale_id` : il n'existe donc aucun prédicat de lecture
-- qui les bornerait. Leur lecture est ouverte, exactement comme celle de `utilisateurs`,
-- `profils` et `groupes_ad` depuis la porte S1, et pour la même raison.
--
-- La barrière est la déclaration `{ action: 'lire', domaine: 'administration' }` des
-- routes de `src/habilitations/`, et `test/api/routes.test.mjs` la MESURE — les routes
-- y sont inscrites au contrôle T-3, joignables par personne hors développement.
-- =====================================================================================

alter table revues_habilitations      enable row level security;
alter table revues_habilitations      force  row level security;
alter table revue_habilitation_lignes enable row level security;
alter table revue_habilitation_lignes force  row level security;

drop policy if exists pol_revues_habilitations_lecture     on revues_habilitations;
drop policy if exists pol_revues_habilitations_ajout       on revues_habilitations;
drop policy if exists pol_revues_habilitations_maj         on revues_habilitations;
drop policy if exists pol_revues_habilitations_suppression on revues_habilitations;

create policy pol_revues_habilitations_lecture on revues_habilitations
    for select using (true);
create policy pol_revues_habilitations_ajout on revues_habilitations
    for insert with check (f_administration_groupe());
create policy pol_revues_habilitations_maj on revues_habilitations
    for update using (f_administration_groupe()) with check (f_administration_groupe());
create policy pol_revues_habilitations_suppression on revues_habilitations
    for delete using (f_administration_groupe());

comment on policy pol_revues_habilitations_lecture on revues_habilitations is
    'Lecture OUVERTE au niveau des politiques, et c''est une CONSÉQUENCE, pas un choix : '
    'la table ne porte pas de filiale_id, et le §2 de 004_rls interdit qu''une politique '
    'de lecture dépende du drapeau d''administration. La barrière est la route, déclarée '
    '« lire / administration », et le contrôle T-3 la mesure.';

drop policy if exists pol_revue_hab_lignes_lecture     on revue_habilitation_lignes;
drop policy if exists pol_revue_hab_lignes_ajout       on revue_habilitation_lignes;
drop policy if exists pol_revue_hab_lignes_maj         on revue_habilitation_lignes;
drop policy if exists pol_revue_hab_lignes_suppression on revue_habilitation_lignes;

create policy pol_revue_hab_lignes_lecture on revue_habilitation_lignes
    for select using (true);
create policy pol_revue_hab_lignes_ajout on revue_habilitation_lignes
    for insert with check (f_administration_groupe());
create policy pol_revue_hab_lignes_maj on revue_habilitation_lignes
    for update using (f_administration_groupe()) with check (f_administration_groupe());
create policy pol_revue_hab_lignes_suppression on revue_habilitation_lignes
    for delete using (f_administration_groupe());

-- Les deux installateurs du §40 : ils DÉCOUVRENT dans le catalogue, ils ne reçoivent
-- pas de liste. ⚠️ `f_poser_declencheurs_pieces()` n'équipera PAS ces deux tables —
-- son prédicat exige une politique de suppression cloisonnée —, et c'est juste : on
-- n'attache pas de pièce jointe à une ligne de revue. L'appeler quand même est la
-- discipline du §40.3 : un balayage se rejoue, il ne se suppose pas.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Déclencheurs de création : % table(s) équipée(s).', v_poses;
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §4 — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- -------------------------------------------------------------------------------------
-- ⚠️ **Une revue des habilitations NOMME DES PERSONNES**, c'est même tout son objet :
-- login, nom d'affichage, et le fait qu'elles aient ou non un accès. C'est de la donnée
-- personnelle, et elle a une fin de vie — trois ans, alignés sur la rétention du journal
-- d'audit, parce qu'une revue est une pièce probante du même ordre.
--
-- ⚠️ **`a_expiration = 'anonymiser'` et non « supprimer »** : effacer la ligne
-- détruirait la revue, c'est-à-dire la preuve qu'elle a eu lieu et sur quel volume.
-- Anonymiser garde le fait — « 412 accès revus, 7 retirés » — et retire l'identité.
-- C'est l'issue (a) du constat **Q-284**, appliquée ici sans avoir à la redécouvrir.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('revues_habilitations', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('revues_habilitations', 'intitule', 'non_personnelle', null, null, null, null,
   'Intitulé de la campagne de revue : une phrase de gestion.'),
  ('revues_habilitations', 'perimetre', 'non_personnelle', null, null, null, null,
   'Ce que la revue a balayé : des groupes d''annuaire, pas des personnes.'),
  ('revues_habilitations', 'ouverte_le', 'non_personnelle', null, null, null, null,
   'Date d''ouverture : une date de gestion.'),
  ('revues_habilitations', 'ouverte_par', 'personnelle',
   'Savoir QUI a ouvert la revue : sans cela, la revue n''engage personne.',
   'Obligation légale', 1095, 'anonymiser',
   'ISO 27001 A.5.18 et NIS2 art. 21. Identifiant de l''utilisateur. Anonymiser plutôt '
   'que supprimer : effacer la ligne détruirait la preuve que la revue a eu lieu '
   '(issue (a) du constat Q-284).'),
  ('revues_habilitations', 'close_le', 'non_personnelle', null, null, null, null,
   'Date de clôture : une date de gestion.'),
  ('revues_habilitations', 'close_par', 'personnelle',
   'Savoir QUI a clos la revue et en a signé la conclusion.',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur. Même motif que « ouverte_par ».'),
  ('revues_habilitations', 'conclusion', 'personnelle',
   'Consigner le verdict de la revue et ce qu''il engage.',
   'Intérêt légitime', 1095, 'signaler',
   'SAISIE LIBRE dont le sujet est la revue, pas une personne — mais un nom y figure '
   'souvent (« accès de M. Ollier à revoir avec les RH »). Le remplacer détruirait la '
   'phrase, et cette phrase EST la conclusion. Régime « signaler » : le produit montre '
   'l''emplacement, un humain tranche.'),
  ('revues_habilitations', 'prochaine_le', 'non_personnelle', null, null, null, null,
   'Prochaine échéance de revue : une date de gestion.'),
  ('revues_habilitations', 'balayage_tronque', 'non_personnelle', null, null, null, null,
   'Booléen technique : la lecture de l''annuaire a-t-elle atteint sa borne.'),
  ('revues_habilitations', 'version', 'non_personnelle', null, null, null, null,
   'Compteur de verrouillage optimiste.'),
  ('revues_habilitations', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('revues_habilitations', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),
  ('revues_habilitations', 'modifie_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('revues_habilitations', 'modifie_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),

  ('revue_habilitation_lignes', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('revue_habilitation_lignes', 'revue_id', 'non_personnelle', null, null, null, null,
   'Référence à la campagne de revue.'),
  ('revue_habilitation_lignes', 'groupe_nom', 'non_personnelle', null, null, null, null,
   'Nom d''un groupe d''annuaire : une structure, pas une personne.'),
  ('revue_habilitation_lignes', 'compte_login', 'personnelle',
   'Désigner sans ambiguïté le compte dont l''accès est revu (ISO 27001 A.5.18).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de connexion. ⚠️ FIGÉ à l''ouverture de la revue : le relire dans '
   'l''annuaire rendrait la revue inutilisable en audit. Anonymiser à l''expiration '
   'garde le FAIT — « 412 accès revus » — et retire l''identité.'),
  ('revue_habilitation_lignes', 'compte_nom', 'personnelle',
   'Rendre la revue lisible par un humain : un login seul ne se relit pas.',
   'Obligation légale', 1095, 'anonymiser',
   'Nom d''affichage, figé à l''ouverture de la revue.'),
  ('revue_habilitation_lignes', 'compte_desactive', 'non_personnelle', null, null, null,
   null,
   'Booléen : le compte était-il désactivé dans l''annuaire au moment du balayage.'),
  ('revue_habilitation_lignes', 'indirect', 'non_personnelle', null, null, null, null,
   'Booléen : l''appartenance passe-t-elle par un groupe imbriqué.'),
  ('revue_habilitation_lignes', 'profil_code', 'non_personnelle', null, null, null, null,
   'Code du profil accordé par le groupe, figé : un paramétrage, pas une personne.'),
  ('revue_habilitation_lignes', 'perimetre_groupe', 'non_personnelle', null, null, null,
   null,
   'Périmètre accordé par le groupe (filiale / groupe / transversal), figé.'),
  ('revue_habilitation_lignes', 'decision', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : a_examiner / maintenu / a_retirer / a_verifier.'),
  ('revue_habilitation_lignes', 'decide_par', 'personnelle',
   'Savoir QUI a décidé du maintien ou du retrait d''un accès (ISO 27001 A.5.18).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur qui a tranché. Une décision sans auteur n''engage '
   'personne, et c''est précisément ce qu''une revue doit produire.'),
  ('revue_habilitation_lignes', 'decide_le', 'non_personnelle', null, null, null, null,
   'Horodatage de la décision.'),
  ('revue_habilitation_lignes', 'commentaire', 'personnelle',
   'Motiver un retrait ou une vérification : le schéma l''EXIGE pour ces deux décisions.',
   'Intérêt légitime', 1095, 'signaler',
   'SAISIE LIBRE dont le sujet est l''accès, pas une personne — mais un nom y figure '
   'souvent (« a quitté le service, vu avec Mme Ferrand »). Régime « signaler ».'),
  ('revue_habilitation_lignes', 'version', 'non_personnelle', null, null, null, null,
   'Compteur de verrouillage optimiste.'),
  ('revue_habilitation_lignes', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('revue_habilitation_lignes', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),
  ('revue_habilitation_lignes', 'modifie_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('revue_habilitation_lignes', 'modifie_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §4 bis — LA COUVERTURE RLS ENREGISTRE L'ARBITRAGE DU §24
-- -------------------------------------------------------------------------------------
-- ⚠️ `f_verifier_couverture_rls()` DÉCOUVRE dans le catalogue les tables sans
-- `filiale_id` et EXIGE de chacune un prédicat cloisonnant, SAUF si elle est DÉCLARÉE
-- avec son motif. C'est le renversement posé au constat Q-5 : une table future oubliée
-- est réclamée bruyamment au lieu d'être exemptée en silence.
--
-- La fonction est donc recopiée **verbatim** avec les deux noms ajoutés — une migration
-- appliquée ne se réécrit pas, elle se corrige dans la suivante (`CONVENTIONS.md` §23).
-- Le motif complet est dans le corps, et il faut le lire avant de le reconduire : c'est
-- un ARBITRAGE, pas un oubli.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_couverture_rls()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- ── LA LISTE EST INVERSÉE DEPUIS LE CONSTAT Q-5 (CONVENTIONS.md §19.5) ───────────
    --
    -- Elle énumérait « les six tables de liaison sans filiale_id » qui devaient être
    -- cloisonnées par leur seule politique. Il y en avait SEPT : import_erreurs manquait
    -- à l'appel, et échappait donc entièrement au garde-fou. Rejoué à la porte S1 : sa
    -- politique de lecture ramenée à « using (true) » ne remontait AUCUNE anomalie, sur
    -- une table dont la migration 003 dit elle-même qu'« une ligne d'erreur cite le
    -- contenu du fichier importé, c'est donc de la donnée de filiale » — un import de
    -- l'annuaire des personnes ou du registre RGPD y dépose des noms verbatim.
    --
    -- C'était la troisième fois qu'une liste écrite à la main produisait un défaut. Le
    -- sens de lecture est donc renversé : le garde-fou DÉCOUVRE dans le catalogue les
    -- tables qui ne portent pas de filiale_id, et EXIGE de chacune un prédicat
    -- cloisonnant, SAUF si elle figure nommément ci-dessous. Une table future oubliée est
    -- désormais réclamée bruyamment au lieu d'être exemptée en silence : le défaut par
    -- défaut est fermé, plus ouvert.
    --
    -- Les tables sans filiale_id dont l'absence de cloisonnement est LÉGITIME et motivée.
    -- Elles sont de niveau Groupe, ou lues avant que le périmètre existe (§6).
    v_sans_filiale_admises constant text[] := array[
        -- ── AJOUTÉE PAR 005_controles_schema.sql, ET C'EST LA SEULE DIFFÉRENCE ─────
        -- avec la version posée par 004 (le reste de cette fonction est recopié
        -- verbatim : une migration appliquée ne se réécrit pas, elle se corrige dans
        -- la suivante — CONVENTIONS.md §23).
        --
        -- controles_schema est un REGISTRE TECHNIQUE, de même nature que
        -- migrations_schema : il garde la dernière observation des garde-fous du
        -- schéma. Il ne contient aucune donnée de filiale — un nom de fonction et sa
        -- signature — et il est lu par f_verifier_schema() AVANT que le périmètre
        -- existe, à chaque migration et à chaque installation. Son écriture n'est pas
        -- tenue par une politique mais par les PRIVILÈGES : le rôle applicatif n'a que
        -- « select » dessus (§2 de cette migration), et f_verifier_privileges() le
        -- vérifie désormais à chaque déploiement.
        -- ── AJOUTÉE PAR 026_registre_des_donnees_personnelles.sql ────────────────
        -- `colonnes_personnelles` est un REGISTRE TECHNIQUE de même nature que
        -- `controles_schema` : il dit, colonne par colonne, quelles données
        -- personnelles LE PRODUIT détient, pourquoi, et pour combien de temps. Il ne
        -- porte aucune donnée de filiale — un nom de table, un nom de colonne, une
        -- finalité, une base légale — et il doit être lisible AVANT que le périmètre
        -- existe : la purge RGPD le lit pour savoir quoi anonymiser, et le garde-fou
        -- f_verifier_colonnes_personnelles() le lit à chaque migration. Son écriture
        -- est fermée par les PRIVILÈGES, pas par un prédicat : le rôle applicatif n'a
        -- que « select » dessus.
        'colonnes_personnelles',
        'controles_schema',
        'filiales',           -- définit la frontière elle-même ; lue avant tout périmètre
        'utilisateurs',       -- identités ; lues pour RÉSOUDRE le périmètre
        -- ── AJOUTÉE PAR 044_les_campagnes_descendantes.sql ──────────────────────
        -- `campagnes` porte LA MÊME CHOSE POUR TOUT LE GROUPE — l'intitulé d'une
        -- demande, son référentiel, son échéance —, et c'est le critère du §24.
        -- Ce qui diffère d'une filiale à l'autre (qui répond, où elle en est) vit
        -- dans `campagne_filiales`, qui porte un filiale_id et reste cloisonnée.
        -- ⚠️ Sa LECTURE est ouverte à dessein : une filiale doit voir la campagne
        -- qui la convoque. Elle n'apprend pas pour autant QUI D'AUTRE est convoqué —
        -- cette information est au §2 de la 044, sous politique cloisonnante. Son
        -- ÉCRITURE, elle, exige f_administration_groupe(), comme `utilisateurs`.
        'campagnes',
        -- ── AJOUTÉES PAR 060_la_revue_des_habilitations.sql ─────────────────────
        --
        -- ⚠️ **C'est un ARBITRAGE, pas un oubli** (`CONVENTIONS.md` §24), et il doit
        -- être lu avant d'être reconduit.
        --
        -- Une revue des droits d'accès (ISO 27001 A.5.18) porte sur la correspondance
        -- entre les groupes de l'annuaire et les profils du produit, et sur les comptes
        -- qui appartiennent à ces groupes. Ses trois sources — `groupes_ad`, `profils`,
        -- `utilisateurs` — sont **toutes de niveau Groupe**, et figurent déjà ici. La
        -- revue porte donc, elle aussi, la même chose pour tout le groupe.
        --
        -- ⚠️ **La rendre cloisonnée aurait exigé d'inventer un rattachement que le
        -- modèle n'a pas** : le périmètre d'une personne n'est stocké nulle part, il est
        -- RÉSOLU à chaque connexion depuis ses groupes d'annuaire. Rattacher une ligne
        -- de revue à une filiale aurait supposé ce rattachement, c'est-à-dire l'aurait
        -- inventé — et une revue fondée sur un rattachement inventé atteste de ce qui
        -- n'a pas été vérifié.
        --
        -- 🛑 **CE QUI PROTÈGE CES DEUX TABLES N'EST DONC PAS LA RLS, MAIS LA ROUTE**,
        -- et il faut le dire parce que c'est inhabituel : leur lecture est ouverte au
        -- niveau des politiques — le §2 interdit qu'une politique de LECTURE dépende
        -- d'un réglage d'administration —, et la seule barrière est la déclaration
        -- `{ action: 'lire', domaine: 'administration' }` des routes de
        -- `src/habilitations/`. C'est exactement le régime de `utilisateurs`, de
        -- `profils` et de `groupes_ad` depuis la porte S1, pour la même raison.
        -- Leur ÉCRITURE, elle, exige `f_administration_groupe()`.
        'revues_habilitations',
        'revue_habilitation_lignes',
        'profils',            -- définition des profils métier (niveau Groupe)
        'profil_domaines',    -- droits d'un profil par domaine (niveau Groupe)
        'migrations_schema',  -- registre technique ; écriture fermée par les privilèges
        'sessions',           -- produit le périmètre : sa LECTURE reste non cloisonnée,
                              -- son ÉCRITURE est fermée depuis 007 (f_authentification)
        'session_domaines',   -- idem ; l'exemption ne porte plus que sur la lecture
        'mappings',           -- catalogue de correspondances, niveau Groupe (§16.4)
        -- mapping_exigences : n'est PAS cloisonnable, et la traiter comme les six
        -- liaisons serait une erreur de fait. Son parent (mappings) est de niveau GROUPE,
        -- et son autre extrémité est le couple (ref_id, code) du catalogue statique de
        -- référentiels, qui n'est pas en base. Aucune de ses deux extrémités n'appartient
        -- à une filiale : elle ne peut, par construction, porter aucun lien
        -- inter-filiales. Dérogée EN CONNAISSANCE DE CAUSE — la dérogation ne porte que
        -- sur la LECTURE ; son écriture est réservée à l'administration Groupe depuis le
        -- constat M-4 de la porte S2, et c'est arbitré par écrit au §6.
        'mapping_exigences'
    ];

    -- Dérogations documentées à l'exigence « prédicat non trivial » pour des tables qui
    -- PORTENT, elles, un filiale_id (voir §6). Toute AUTRE table porteuse d'un filiale_id
    -- dont la politique dirait « true » fait échouer la vérification : c'est ce qui
    -- interdit à une migration future d'ouvrir une table en grand par inadvertance.
    v_derogations constant text[] := array[
        'groupes_ad',       -- aiguillage de l'authentification, lu AVANT tout périmètre
        'journal_audit',    -- chaînage : la numérotation exige de voir la chaîne entière
        'session_filiales'  -- c'est la table qui PRODUIT le périmètre ; le filtrer par
                            -- lui-même rendrait toute connexion impossible
    ];
    v_nom text;
    r record;
begin
    for r in
        select c.oid,
               c.relname::text                                             as nom,
               c.relrowsecurity                                            as rls,
               c.relforcerowsecurity                                       as forcee,
               exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)         as porte_filiale
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         -- « r » ET « p » : le commentaire de cette fonction dit « TOUTE table du schéma
         -- public », et le §0 de ce fichier pense déjà à relkind in ('r','p','v','m') pour
         -- le contrôle de propriété. Une table partitionnée échappait ici au balayage —
         -- constat T-11 du troisième passage. Il n'y en a aucune aujourd'hui ; le filet ne
         -- doit pas attendre la première.
         where n.nspname = 'public' and c.relkind in ('r', 'p')
         order by c.relname
    loop
        objet := r.nom;

        if not r.rls then
            anomalie := 'rls_desactivee';
            detail   := 'la table n''a pas « enable row level security » : ses lignes sont '
                        'visibles de toutes les filiales';
            return next;
        end if;

        if not r.forcee then
            anomalie := 'force_absente';
            detail   := 'la table n''a pas « force row level security » : le propriétaire des '
                        'tables échappe aux politiques';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*'))
        then
            anomalie := 'politique_lecture_absente';
            detail   := 'aucune politique permissive de lecture : la table est illisible, ou le '
                        'sera dès qu''une politique d''écriture existera';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*'))
        then
            anomalie := 'politique_ecriture_absente';
            detail   := 'aucune politique permissive d''écriture : toute écriture est refusée '
                        'sans que rien ne le dise';
            return next;
        end if;

        -- Une politique de lecture ne doit JAMAIS dépendre d'un réglage d'administration :
        -- ce serait un moyen, pour un réglage de session, d'élargir la LECTURE.
        if exists (
            select 1 from pg_policy p
             where p.polrelid = r.oid and p.polcmd in ('r', '*')
               and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_administration_groupe%')
        then
            anomalie := 'drapeau_administration_en_lecture';
            detail   := 'une politique de lecture mentionne f_administration_groupe() : un '
                        'réglage de session élargirait la LECTURE, ce que le §2 interdit';
            return next;
        end if;

        -- Politiques qui ne CONSULTENT PAS le périmètre, sur une table qui porte, elle,
        -- une filiale. La détection ne compare plus le prédicat au littéral « true » : elle
        -- exige qu'il MENTIONNE la fonction de périmètre correspondante. Voir la portée
        -- exacte, et ses limites, dans le commentaire de la fonction.
        -- Une table est SOUMISE au cloisonnement si elle porte un filiale_id, ou si elle
        -- n'en porte pas SANS figurer dans la liste des exemptions motivées. Le second
        -- membre est la découverte : ce n'est plus une liste de tables à couvrir, c'est
        -- une liste de tables à NE PAS couvrir, et tout le reste l'est d'office.
        if (r.porte_filiale or not (r.nom = any (v_sans_filiale_admises)))
           and not (r.nom = any (v_derogations)) then
            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*')
                   and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                       !~ '(f_filiales_lecture|f_filiales_autorisees)')
            then
                anomalie := 'lecture_non_cloisonnee';
                detail   := 'une politique de lecture ne consulte pas le périmètre de la session '
                            '(ni f_filiales_lecture, ni f_filiales_autorisees) sur une table '
                            'cloisonnée : toutes les filiales se lisent entre elles. Si la table '
                            'ne porte pas de filiale_id et relève réellement du niveau Groupe, '
                            'elle doit être DÉCLARÉE dans v_sans_filiale_admises, avec son motif';
                return next;
            end if;

            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*')
                   and coalesce(
                           case p.polcmd
                               when 'a' then pg_get_expr(p.polwithcheck, p.polrelid)
                               when 'd' then pg_get_expr(p.polqual, p.polrelid)
                               else coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                             pg_get_expr(p.polqual, p.polrelid))
                           end, 'true') !~ 'f_filiale_ecriture')
            then
                anomalie := 'ecriture_non_cloisonnee';
                detail   := 'une politique d''écriture ne consulte pas la filiale ACTIVE '
                            '(f_filiale_ecriture) sur une table cloisonnée : une filiale peut '
                            'écrire chez une autre. Si la table ne porte pas de filiale_id et '
                            'relève réellement du niveau Groupe, elle doit être DÉCLARÉE dans '
                            'v_sans_filiale_admises, avec son motif';
                return next;
            end if;
        end if;
    end loop;

    -- Les deux listes écrites à la main ne désignent que des EXEMPTIONS ; le §19.5
    -- n'admet une liste écrite que si le garde-fou vérifie qu'elle reste juste. Une
    -- exemption qui ne désigne plus rien — table supprimée, table renommée — dispenserait
    -- silencieusement de cloisonnement la prochaine table qui reprendrait ce nom.
    foreach v_nom in array v_sans_filiale_admises || v_derogations loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'table dispensée de cloisonnement par f_verifier_couverture_rls(), '
                        'mais introuvable dans le schéma : la dérogation ne porte plus sur '
                        'rien et couvrirait toute table future qui reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;

$function$;

-- =====================================================================================
-- §4 ter — LE REGISTRE TECHNIQUE RANGE LES DEUX TABLES
-- -------------------------------------------------------------------------------------
-- ⚠️ `f_verifier_registres_techniques()` DÉCOUVRE toute table sans `filiale_id` et
-- exige qu'elle soit rangée dans l'une des deux familles : « registre technique », que
-- seul le déploiement écrit, ou « écrite par l'application », dont l'écriture est tenue
-- par une politique RLS. **Ne pas répondre n'est pas une option** — c'est ce qu'a fait
-- la migration `026` pour `colonnes_personnelles`, qui AFFIRMAIT dans un commentaire ce
-- que rien ne tenait (constat **Q-291**).
--
-- **La décision, ici : écrites par l'APPLICATION.** Ouvrir une revue, décider ligne à
-- ligne et la clore sont des gestes d'administrateur, faits depuis le produit. Leur
-- écriture est donc tenue par `f_administration_groupe()`, et le rôle applicatif y a
-- bien les quatre verbes — ce qu'un registre technique n'aurait pas.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_registres_techniques()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- (1) LES REGISTRES : écrits par le déploiement sous le compte propriétaire, jamais
    --     par un rôle de connexion. Un rôle qui pourrait les écrire pourrait effacer
    --     l'alarme avant de la déclencher.
    v_registres constant text[] := array[
        'migrations_schema',      -- empreinte des migrations appliquées (Q-5)
        'controles_schema',       -- dernière observation des garde-fous (Q-5)
        'colonnes_personnelles'   -- registre de l'article 30 DU PRODUIT (Q-291)
    ];
    -- (2) LES TABLES SANS FILIALE QUE L'APPLICATION ÉCRIT LÉGITIMEMENT. Elles sont de
    --     niveau Groupe, ou elles produisent le périmètre lui-même, ou ce sont des
    --     liaisons qui se cloisonnent par leur parent. Leur écriture est tenue par une
    --     politique RLS, pas par les privilèges.
    v_ecrites_par_l_application constant text[] := array[
        'filiales', 'utilisateurs', 'profils', 'profil_domaines',
        'sessions', 'session_domaines',
        'mappings', 'mapping_exigences',
        'actif_dependances', 'actif_risques', 'incident_actifs',
        'processus_actifs', 'risque_exigences', 'import_erreurs',
        -- AJOUTÉE PAR 044 : niveau Groupe, écriture tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges.
        'campagnes',
        -- ── AJOUTÉES PAR 060, ET C'EST UNE DÉCISION ──────────────────────────
        -- Écrites par l'APPLICATION, pas par le déploiement : ouvrir une revue,
        -- décider ligne à ligne et la clore sont des gestes d'administrateur, faits
        -- depuis le produit. Leur écriture est donc tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges — et le rôle
        -- applicatif y a bien les quatre verbes, contrairement à un registre.
        'revues_habilitations',
        'revue_habilitation_lignes'
    ];
    r      record;
    v_nom  text;
begin
    /* ── SENS 1 : une table sans filiale_id que PERSONNE n'a rangée ──────────────── */
    for r in
        select c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relkind = 'r'
           and not exists (select 1 from pg_attribute a
                            where a.attrelid = c.oid and a.attname = 'filiale_id'
                              and a.attnum > 0 and not a.attisdropped)
           and not (c.relname::text = any (v_registres))
           and not (c.relname::text = any (v_ecrites_par_l_application))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'table_sans_filiale_non_rangee';
        detail   := 'Cette table ne porte pas de « filiale_id », et rien ne dit QUI '
                    'l''écrit. Décidez dans f_verifier_registres_techniques() : « registre '
                    'technique » — écrit par le seul déploiement, et les rôles de connexion '
                    'n''y ont que « select » — ou « écrite par l''application », son écriture '
                    'étant alors tenue par une politique RLS. ⚠️ Ne pas répondre, c''est ce '
                    'qu''a fait la migration 026 pour « colonnes_personnelles » : elle a '
                    'AFFIRMÉ dans un commentaire que le rôle applicatif n''y avait que '
                    '« select », et le rôle applicatif pouvait la vider (constat Q-291).';
        return next;
    end loop;

    /* ── SENS 2 : un registre déclaré et introuvable ─────────────────────────────── */
    foreach v_nom in array v_registres loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'registre_declare_introuvable';
            detail   := 'table déclarée « registre technique » et introuvable : le contrôle '
                        'ne porte plus sur rien, et il couvrirait toute table future qui '
                        'reprendrait ce nom.';
            return next;
            continue;
        end if;

        /* ── SENS 3 : un registre RÉINSCRIPTIBLE — la mesure, pas la déclaration ── */
        for r in
            select rr.rolname::text as role_nom,
                   concat_ws(', ',
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'insert')   then 'insert'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'update')   then 'update'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'delete')   then 'delete'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'truncate') then 'truncate' end)
                       as verbes
              from pg_roles rr
             where rr.rolcanlogin and not rr.rolsuper
               and rr.oid <> (select d.datdba from pg_database d where d.datname = current_database())
               and (has_table_privilege(rr.oid, v_nom::regclass, 'insert')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'update')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'delete')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'truncate'))
             order by 1
        loop
            objet    := v_nom;
            anomalie := 'registre_reinscriptible';
            detail   := format('le rôle de connexion « %s » détient %s sur un registre '
                               'technique. Corriger : revoke insert, update, delete, truncate '
                               'on %I from %I;   ⚠️ Et vérifier « alter default privileges » : '
                               'c''est par là que colonnes_personnelles avait hérité des quatre '
                               'verbes sans qu''aucune ligne de sa migration ne le dise '
                               '(constat Q-291).',
                               r.role_nom, r.verbes, v_nom, r.role_nom);
            return next;
        end loop;
    end loop;

    /* ── SENS 4 : une table rangée « écrite par l'application » et introuvable ───── */
    foreach v_nom in array v_ecrites_par_l_application loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'table_rangee_introuvable';
            detail   := 'table déclarée « écrite par l''application » et introuvable : la '
                        'déclaration couvrirait toute table future qui reprendrait ce nom, '
                        'et lui accorderait le silence sans que personne ne décide.';
            return next;
        end if;
    end loop;

    return;
end;
$function$;

-- =====================================================================================
-- §5 — LE GARDE-FOU — IL ÉPROUVE, IL NE RECONNAÎT PAS UN MOT
-- -------------------------------------------------------------------------------------
-- ⚠️ `CONVENTIONS.md` §39.1 : un `check (… or true)` passe au vert sous zéro anomalie
-- si le garde se contente de relire le texte de la contrainte (constat **Q-312**). Ce
-- garde-ci **SOUMET** les cas interdits dans une sous-transaction annulée, et compte les
-- refus. Une contrainte vidée est donc vue, quel que soit le texte qui reste.
--
-- Quatre propriétés, et chacune ferme un défaut qui produirait une attestation FAUSSE :
--
--  1. une décision prise SANS auteur ni date est refusée — sinon la revue n'engage
--     personne, et c'est le seul point sur lequel un auditeur insistera ;
--  2. « a_examiner » ne peut PAS porter d'auteur — sinon « non revu » et « revu » se
--     confondent, et une revue paraîtrait faite ;
--  3. « a_retirer » et « a_verifier » exigent un motif — un retrait sans motif ne se
--     défend pas six mois plus tard ;
--  4. une clôture SANS conclusion est refusée — une revue close et vide atteste du seul
--     fait d'avoir regardé.
-- =====================================================================================

create or replace function f_verifier_revue_habilitations()
returns table(objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_refus   integer := 0;
    v_verdict boolean;
    r         record;
    -- Les quatre cas INTERDITS, et le cas nominal. Chacun est un jeu de valeurs
    -- soumis au PRÉDICAT RÉEL de la contrainte — jamais une relecture de son texte.
    v_cas constant jsonb := jsonb_build_array(
      jsonb_build_object(
        'table', 'revue_habilitation_lignes', 'contrainte', 'ck_revue_hab_signature',
        'attendu', false, 'anomalie', 'decision_sans_auteur_admise',
        'detail', 'une décision « maintenu » sans decide_par ni decide_le est admise : '
                  'la revue n''engagerait personne',
        'valeurs', jsonb_build_object('decision', 'maintenu',
                                      'decide_par', null, 'decide_le', null)),
      jsonb_build_object(
        'table', 'revue_habilitation_lignes', 'contrainte', 'ck_revue_hab_signature',
        'attendu', false, 'anomalie', 'non_decision_signee_admise',
        'detail', '« a_examiner » peut porter un auteur : « non revu » et « revu » se '
                  'confondraient, et la revue paraîtrait faite',
        'valeurs', jsonb_build_object('decision', 'a_examiner',
                                      'decide_par', 'quelqu''un',
                                      'decide_le', '2026-01-01T00:00:00Z')),
      jsonb_build_object(
        'table', 'revue_habilitation_lignes', 'contrainte', 'ck_revue_hab_motif',
        'attendu', false, 'anomalie', 'retrait_sans_motif_admis',
        'detail', 'un retrait d''accès est admis sans motif : il ne se défendrait pas '
                  'six mois plus tard',
        'valeurs', jsonb_build_object('decision', 'a_retirer', 'commentaire', null)),
      jsonb_build_object(
        'table', 'revues_habilitations', 'contrainte', 'ck_revues_hab_cloture',
        'attendu', false, 'anomalie', 'cloture_sans_conclusion_admise',
        'detail', 'une revue peut être close sans conclusion : elle n''atteste alors '
                  'que du fait d''avoir regardé',
        'valeurs', jsonb_build_object('close_le', '2026-01-01T00:00:00Z',
                                      'close_par', 'quelqu''un', 'conclusion', null)),
      -- ⚠️ **LE CAS NOMINAL, ET IL EST NÉCESSAIRE.** Un garde qui n'éprouve que des
      -- refus rend zéro anomalie sur une contrainte devenue « false » — c'est-à-dire
      -- sur une table où plus rien n'entre. Le contre-témoin est la moitié qui manque
      -- le plus souvent (constat Q-210, et le cas négatif de D3).
      jsonb_build_object(
        'table', 'revue_habilitation_lignes', 'contrainte', 'ck_revue_hab_motif',
        'attendu', true, 'anomalie', 'cas_nominal_refuse',
        'detail', 'une décision COMPLÈTE et motivée est refusée : la table serait '
                  'inutilisable, et le garde-fou muet pour la pire des raisons',
        'valeurs', jsonb_build_object('decision', 'a_retirer',
                                      'commentaire', 'A quitté le service.'))
    );
begin
    -- ── (a) Les deux tables existent-elles, et portent-elles la RLS ? ───────────────
    foreach objet in array array['revues_habilitations', 'revue_habilitation_lignes'] loop
        if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relname = objet) then
            anomalie := 'table_absente';
            detail   := 'la revue des habilitations ne peut pas fonctionner sans cette table';
            return next;
        elsif not (select c.relrowsecurity and c.relforcerowsecurity
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = objet) then
            anomalie := 'rls_incomplete';
            detail   := 'row level security absente ou non forcée ; le propriétaire '
                        'contournerait les politiques';
            return next;
        end if;
    end loop;

    -- ── (b) LES QUATRE PROPRIÉTÉS, ÉPROUVÉES SUR LE PRÉDICAT RÉEL ──────────────────
    --
    -- ⚠️ **Ce garde n'écrit RIEN, et c'est une contrainte, pas un choix de style.**
    -- La première rédaction insérait des lignes témoins dans une sous-transaction
    -- annulée : PostgreSQL l'a refusée — « INSERT is not allowed in a non-volatile
    -- function ». Et `f_verifier_schema()` DOIT rester `stable` : c'est ce qui
    -- l'empêche d'agir sur ce qu'il inspecte (`CONVENTIONS.md` §39.8).
    --
    -- `f_contrainte_accepte()` évalue le prédicat RÉEL de la contrainte sur une ligne
    -- témoin, sans rien insérer. Un `check (… or true)` est donc vu, quel que soit le
    -- texte qui reste — c'est le remède du constat **Q-312**.
    for r in select * from jsonb_array_elements(v_cas) as c(cas) loop
        v_verdict := f_contrainte_accepte(
            r.cas ->> 'table', r.cas ->> 'contrainte', r.cas -> 'valeurs');

        if v_verdict is null then
            -- « je n'ai pas pu mesurer » : la contrainte a disparu, ou son prédicat
            -- appelle une fonction non épinglée. Les deux sont des anomalies, et la
            -- seconde est le constat A-4 — un garde n'évalue pas ce qui peut agir.
            objet    := r.cas ->> 'table';
            anomalie := 'contrainte_non_mesurable';
            detail   := format('« %s » est absente, ou son prédicat appelle une fonction '
                               'que ce garde refuse d''évaluer', r.cas ->> 'contrainte');
            return next;
        elsif v_verdict = (r.cas ->> 'attendu')::boolean then
            v_refus := v_refus + 1;
        else
            objet    := r.cas ->> 'table';
            anomalie := r.cas ->> 'anomalie';
            detail   := r.cas ->> 'detail';
            return next;
        end if;
    end loop;

    if v_refus < jsonb_array_length(v_cas) then
        objet    := 'revue_habilitation_lignes';
        anomalie := 'contraintes_non_eprouvees';
        detail   := format('%s cas concluants sur %s : au moins une propriété de la revue '
                           'ne mord plus, et une revue qui n''engage personne ne prouve '
                           'rien', v_refus, jsonb_array_length(v_cas));
        return next;
    end if;
end;
$$;

comment on function f_verifier_revue_habilitations() is
    'Éprouve les quatre propriétés d''une revue d''habilitations en SOUMETTANT des jeux '
    'de valeurs au prédicat RÉEL de chaque contrainte (f_contrainte_accepte), jamais en '
    'relisant son texte — un « check (… or true) » passerait sinon au vert sous zéro '
    'anomalie (constat Q-312). ⚠️ Il mesure aussi que le cas NOMINAL passe : un garde '
    'qui n''éprouve que des refus est muet sur une contrainte devenue « false », '
    'c''est-à-dire sur une table où plus rien n''entre. ⚠️ Il n''écrit RIEN : '
    'f_verifier_schema() est « stable », et c''est ce qui l''empêche d''agir sur ce '
    'qu''il inspecte (§39.8).';

grant execute on function f_verifier_revue_habilitations() to grc_app;

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

-- ⚠️ Le registre des garde-fous n'est pas une liste qu'on alimente : il est
-- DÉCOUVERT dans le catalogue (`f_decouvrir_controles_schema()`) et consigné ici.
-- Y insérer à la main serait la liste écrite à la main que le §18.4 proscrit.
select f_consigner_controles_schema();

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select count(*), string_agg(format('%s/%s: %s', objet, anomalie, detail), ' | ')
      into v_nombre, v_anomalies
      from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 060 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, revue des habilitations comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('060', 'la revue des habilitations (ISO 27001 A.5.18) : un instantané FIGÉ de qui '
               'appartient à quel groupe d''annuaire, une décision datée et signée par '
               'ligne, et aucune écriture dans l''Active Directory — le produit consigne, '
               'l''administrateur de l''annuaire exécute')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_revue_habilitations();
--   delete from controles_schema where fonction = 'f_verifier_revue_habilitations';
--   drop table if exists revue_habilitation_lignes;
--   drop table if exists revues_habilitations;
--   delete from colonnes_personnelles where table_nom in
--       ('revues_habilitations', 'revue_habilitation_lignes');
--   delete from migrations_schema where version = '060';
--   commit;
-- ⚠️ **Annuler DÉTRUIT les revues déjà faites**, c'est-à-dire les pièces qui prouvent
--    qu'elles ont eu lieu. Exportez-les avant, ou ne les annulez pas : une revue perdue
--    ne se refait pas — on ne peut pas revenir à l'annuaire d'il y a six mois.
--    Le domaine `type_entite` garde ses deux valeurs : les retirer casserait la
--    relecture du journal d'audit, qui les cite.
-- =====================================================================================
