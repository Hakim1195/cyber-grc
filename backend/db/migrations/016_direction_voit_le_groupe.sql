-- =====================================================================================
--  016 — Le profil Direction voit ce que l'écran Groupe lui montre
-- -------------------------------------------------------------------------------------
--  §1  Les six domaines qui manquaient
--  §2  Vérification, puis enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — constat Q-181, laissé à l'arbitrage et tranché le 05/09/2026
--
--  Le lot L4 a livré `/api/consolidation` et l'écran `#/groupe` : la vision consolidée
--  du groupe, destinée à la Direction (`PLAN_SERVEUR` §3.1). La route lit sept familles
--  — conformité, risques, actions, incidents, documents, actifs, audits — et rend
--  `null`, jamais zéro, pour un domaine que la session ne peut pas lire.
--
--  Le profil `DIRECTION` semé par `007` porte six domaines : `tableau_de_bord`,
--  `synthese`, `echeances`, `exigences`, `referentiels`, `mesures`. Les trois derniers
--  se projettent sur `conformite` (`src/droits/passerelle-api.ts`), les trois premiers
--  sur `pilotage`. **Il ne porte donc AUCUN des six autres**, et l'écran bâti pour la
--  Direction lui affiche « — » sur les risques, les incidents, le plan d'actions, les
--  documents, les actifs et les audits — c'est-à-dire sur presque tout ce qu'une revue
--  de direction ISO 27001 examine.
--
--  ⚠️ Ce n'était pas visible au banc : `null` est le comportement CORRECT de la route
--  pour un domaine fermé, et les essais de consolidation montent leurs propres droits.
--  Personne ne posait la question « et le profil qui EXISTE, que voit-il ? ».
--
--  ── L'arbitrage, et sa borne ───────────────────────────────────────────────────
--
--  On ajoute les six domaines **en lecture seule**, et rien de plus. La Direction ne
--  gagne aucun droit d'écriture, ne gagne ni `rgpd`, ni `personnel`, ni `journal`, ni
--  `droits`, ni `parametres`. Le principe retenu : **le profil doit couvrir exactement
--  ce que l'écran qui lui est destiné agrège** — au-delà, ce serait élargir sans motif ;
--  en deçà, l'écran ment avec un tiret.
--
--  ⚠️ `incidents` porte des données personnelles. La Direction les reçoit en LECTURE,
--  ce qui est la situation d'une revue de direction — elle doit connaître les incidents
--  majeurs. Le DPO reste seul à les instruire (niveau `contribution`).
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LES SIX DOMAINES QUI MANQUAIENT
-- -------------------------------------------------------------------------------------
-- L'insertion est idempotente (`where not exists`), comme celle de `007` : rejouer la
-- migration sur une base qui les porte déjà ne fait rien, et une installation dont
-- l'exploitant aurait retiré un domaine à la main ne se le voit pas réimposer.
-- =====================================================================================

do $$
declare v_ajoutes integer;
begin
    perform set_config('grc.utilisateur', 'migration-016', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    -- ⚠️ `profil_domaines` n'accepte une insertion que sous
    -- `f_administration_groupe()` : le modèle de droits est de portée Groupe, et une
    -- filiale ne se donne pas des droits toute seule. La migration, qui s'exécute sous
    -- le compte propriétaire, doit le poser explicitement — le propriétaire n'est PAS
    -- dispensé des politiques, elles sont « forcées » (001 §RLS).
    perform set_config('grc.administration_groupe', 'oui', true);

    with souhaite (code, domaine, niveau) as (values
        ('DIRECTION', 'risques',   'lecture'),
        ('DIRECTION', 'actions',   'lecture'),
        ('DIRECTION', 'incidents', 'lecture'),
        ('DIRECTION', 'documents', 'lecture'),
        ('DIRECTION', 'actifs',    'lecture'),
        ('DIRECTION', 'audits',    'lecture')
    )
    insert into profil_domaines (profil_id, domaine, niveau)
    select p.id, s.domaine, s.niveau
      from souhaite s
      join profils p on p.code = s.code
     where not exists (select 1 from profil_domaines d
                        where d.profil_id = p.id and d.domaine = s.domaine);

    get diagnostics v_ajoutes = row_count;
    raise notice 'Profil DIRECTION : % domaine(s) de lecture ajouté(s).', v_ajoutes;
end;
$$;

-- =====================================================================================
-- §2 — VÉRIFICATION, PUIS ENREGISTREMENT
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 016 : %', v_anomalies;
    end if;
end;
$$;

insert into migrations_schema (version, nom)
values ('016', 'le profil DIRECTION porte les six domaines que la vision Groupe agrège — sans '
               'eux l''écran bâti pour elle lui affiche « — » sur les risques et les incidents '
               '(constat Q-181)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   delete from profil_domaines d using profils p
--    where d.profil_id = p.id and p.code = 'DIRECTION'
--      and d.domaine in ('risques','actions','incidents','documents','actifs','audits');
--   delete from migrations_schema where version = '016';
--   commit;
-- ⚠️ La rejouer REMET la vision Groupe à « — » sur six indicateurs sur sept.
-- =====================================================================================
