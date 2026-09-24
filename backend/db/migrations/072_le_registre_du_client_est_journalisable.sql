-- =====================================================================================
--  072 — LE REGISTRE DE L'ARTICLE 30 §2 ENTRE DANS LE VOCABULAIRE DU JOURNAL
--
--  §1  `type_entite` admet les trois tables du lot
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — ET C'EST LE BANC QUI L'A TROUVÉE
--
--  🛑 **SANS ELLE, L'ÉCRAN DES DONNEURS D'ORDRE NE POUVAIT RIEN ENREGISTRER.**
--
--  `journal_audit.entite_type` porte le domaine `type_entite`, un **vocabulaire CLOS**
--  (migration `001`). Toute écriture par les routes génériques journalise, et une table
--  absente de ce domaine est donc **INCRÉABLE** — `CONVENTIONS.md` §40.1 le dit en toutes
--  lettres, et je l'ai quand même oublié en écrivant la `070`.
--
--  ⚠️ **Et le refus qui remontait ne désignait RIEN.** Le message d'erreur se construit
--  depuis la convention `ck_<table>_<sujet>` ; le nom qui remontait ici était
--  `type_entite_check`, dont le premier morceau n'est pas « ck ». L'utilisateur recevait
--  donc *« Une valeur de l'enregistrement n'est pas admise. »* — vrai, inattaquable, et
--  sans aucun moyen de savoir quel champ corriger. Il n'y en avait aucun à corriger.
--
--  ⚠️ **Le banc l'a trouvé, pas moi, et il faut dire lequel** : le balayage de
--  `test/api/entites-familles.test.mjs` crée **chaque entité du registre par sa route
--  générique, avec ses seuls champs obligatoires**. C'est précisément l'essai qui n'a pas
--  d'autre raison d'exister que celle-ci — et il a fallu instrumenter la traduction des
--  erreurs pour faire dire au refus de quelle contrainte il venait. *Un refus qui ne nomme
--  pas ce qu'il refuse coûte une heure à chaque fois.*
--
--  ── POURQUOI UNE MIGRATION DE PLUS, ET PAS UNE CORRECTION DE LA `070` ────────────
--
--  `CONVENTIONS.md` §23 : une migration appliquée ne se réécrit jamais, elle se corrige
--  dans la suivante. La `070` et la `071` sont posées sur la recette ; les réécrire ne
--  changerait rien là où elles sont déjà passées.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — `type_entite` ADMET LES TROIS TABLES DU LOT
-- -------------------------------------------------------------------------------------
-- La substitution part d'un MODÈLE : si le texte appliqué a changé depuis, on **refuse
-- plutôt que d'appliquer de travers** (motif du §4 de la `027`, repris par la `049`).
--
-- ⚠️ **Les TROIS tables, et pas seulement celle qui est une entité.**
-- `traitement_client_mesures` et `client_sous_traitants` sont des LIAISONS : elles
-- n'apparaissent dans aucun registre d'entités, mais la couche d'écriture journalise
-- aussi les liens qu'elle pose. Les omettre aurait rendu la pose d'une mesure ou la
-- déclaration d'un sous-traitant impossibles — c'est-à-dire **exactement le même défaut,
-- deux écrans plus loin**, et découvert par un clic au lieu d'un essai.
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''echelle_niveaux''';
    v_ajouts   constant text := '''echelle_niveaux'', ''traitements_pour_client'', '
                                '''traitement_client_mesures'', ''client_sous_traitants''';
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée, '
                        'et cette migration n''a rien à étendre.';
    end if;
    if position('''traitements_pour_client''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà le registre de l''article 30 §2 : rejeu, rien '
                     'à faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « echelle_niveaux » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les trois tables du registre de l''article '
                 '30 §2 du RGPD.';
end;
$$;

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('072', 'le registre de l''article 30 §2 entre dans le vocabulaire CLOS de '
               'journal_audit.entite_type : sans cela ses trois tables étaient '
               'INCRÉABLES par les routes génériques, et le refus qui remontait ne '
               'désignait aucun champ — parce qu''il n''y en avait aucun à corriger')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Retirer les trois valeurs du prédicat. ⚠️ À ne faire qu'APRÈS avoir retiré les
--   migrations `070` et `071` : l'inverse rend les trois tables incréables en laissant
--   croire que le défaut vient de la saisie.
-- =====================================================================================
