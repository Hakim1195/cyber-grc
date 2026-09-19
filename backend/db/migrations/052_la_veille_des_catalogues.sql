-- =====================================================================================
--  052 — LA VEILLE DES CATALOGUES : LA FENÊTRE DE SURVEILLANCE EST UNE DÉCISION
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  L'action 26.5 est livrée par la migration `051` : `referentiels.publie_le` date le
--  TEXTE, `duree_alerte_mois` dit au bout de combien de temps le produit signale, et
--  `f_referentiel_age()` dérive les quatre états — « a_jour », « a_verifier »,
--  « non_surveille », « date_inconnue ».
--
--  ⚠️ **ET ELLE ÉTAIT INERTE.** La `051` sème les six catalogues avec leur date de
--  parution et **aucune durée d'alerte** : `f_referentiel_age()` rendait donc
--  « non_surveille » pour tous les six, et le produit ne signalait rien — jamais.
--
--  *Une capacité qu'aucune donnée n'active est une capacité absente*, et c'est la
--  variante de la leçon du `docs/REPRISE.md` §4 : là c'était un écran qui manquait, ici
--  c'est la valeur sans laquelle le mécanisme se tait. Vu **en cliquant sur la recette**,
--  après un banc entièrement vert — septième fois en une semaine.
--
--  ── POURQUOI UNE MIGRATION DE PLUS, ET NON UNE CORRECTION DE LA `051` ────────────
--
--  Parce qu'une migration appliquée ne se réécrit jamais (`CONVENTIONS.md` §13) : le
--  déploiement refuse une migration dont le texte a changé, et il a raison — deux
--  installations porteraient alors le même numéro pour deux contenus différents.
--
--  ⚠️ **Et ce découpage dit quelque chose de juste** : la fenêtre de surveillance n'est
--  pas une propriété de la norme, c'est une DÉCISION du Groupe. Elle se change, par
--  l'écran, sans toucher au catalogue — et le fait qu'elle arrive par une migration
--  distincte de celle qui pose les catalogues est cohérent avec cela.
--
--  ── LES VALEURS, ET CE QUI LES MOTIVE ───────────────────────────────────────────
--
--  **Soixante mois — cinq ans — pour les quatre textes normatifs.** C'est l'ordre de
--  grandeur du cycle de révision d'une norme ISO, et celui qu'a mis NIS2 à remplacer
--  NIS1. En deçà, le produit crierait au loup tous les deux ans sur des textes qui
--  n'ont pas bougé ; au-delà, il se tairait pendant qu'une révision est parue.
--
--  ⚠️ **Et le guide d'hygiène de l'ANSSI bascule IMMÉDIATEMENT en « à vérifier »**, parce
--  qu'il date de 2017. Ce n'est pas un effet de bord : c'est **vrai**, et c'est
--  exactement ce que l'action 26.5 doit dire. Un signal qui ne se déclencherait sur
--  aucun des six catalogues livrés serait un signal qu'on ne verrait jamais s'allumer —
--  et dont personne ne saurait, le jour venu, s'il fonctionne.
--
--  **AirCyber reste sans durée**, et garde « date_inconnue » : BoostAerospace ne publie
--  pas de date de parution vérifiable. Lui donner une fenêtre reviendrait à surveiller
--  une date qu'on a inventée — le signal serait faux **dans les deux sens**, et il aurait
--  l'air mesuré.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE
-- -------------------------------------------------------------------------------------
-- L'écriture porte sur des lignes de portée Groupe, que la politique de mise à jour
-- réserve à l'administration Groupe (`CONVENTIONS.md` §42).
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-052', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LA FENÊTRE DE SURVEILLANCE DES CATALOGUES DU SOCLE
-- -------------------------------------------------------------------------------------
-- ⚠️ `filiale_id is null` : on ne touche QUE le socle du Groupe. Une grille apportée par
-- une filiale (action 26.2) porte la fenêtre que cette filiale lui a donnée, et ce n'est
-- pas au Groupe d'en décider à sa place.
--
-- ⚠️ `duree_alerte_mois is null` : on ne réécrit pas une décision déjà prise. Rejouer
-- cette migration sur une base où l'exploitant a changé la fenêtre ne doit pas la
-- ramener à sa valeur d'origine — c'est la différence entre semer et imposer.
-- =====================================================================================

update referentiels
   set duree_alerte_mois = 60
 where filiale_id is null
   and duree_alerte_mois is null
   and publie_le is not null
   and id in ('anssi-hygiene', 'iso27001-smsi', 'iso-27002-2022', 'nis2-art21', 'dora');

-- =====================================================================================
-- §2 — LE SEMIS SE VÉRIFIE, IL NE S'ESPÈRE PAS
-- -------------------------------------------------------------------------------------
-- ⚠️ Le garde-fou du §10 de la `051` ne peut pas le faire : le `CONVENTIONS.md` §41
-- interdit à un garde-fou de schéma de LIRE des lignes d'une table cloisonnée, et
-- `install.sh` appelle `f_verifier_schema()` sans périmètre. Le contrôle est donc ici, à
-- l'endroit et au moment où le périmètre existe.
--
-- ⚠️ **On vérifie aussi que le signal S'ALLUME**, et pas seulement qu'il est armé : sans
-- cette seconde moitié, une fenêtre de six cents mois passerait le contrôle en laissant
-- le produit muet — ce que cette migration existe pour corriger.
-- =====================================================================================

do $$
declare
    v_surveilles integer;
    v_a_verifier integer;
begin
    select count(*) filter (where f_referentiel_age(publie_le, duree_alerte_mois)
                                  <> 'non_surveille'),
           count(*) filter (where f_referentiel_age(publie_le, duree_alerte_mois)
                                  = 'a_verifier')
      into v_surveilles, v_a_verifier
      from referentiels
     where filiale_id is null;

    if v_surveilles < 5 then
        raise exception 'Seuls % catalogue(s) du socle sont surveillés : la veille de '
                        'l''action 26.5 resterait muette sur les autres, et personne ne '
                        'le verrait — « non surveillé » ne se distingue pas, à l''écran, '
                        'de « rien à signaler ».', v_surveilles;
    end if;
    if v_a_verifier < 1 then
        raise exception 'Aucun catalogue du socle n''est signalé « à vérifier ». Le guide '
                        'd''hygiène de l''ANSSI date de 2017 : s''il passe pour à jour, '
                        'c''est que la dérivation ou la fenêtre est fausse — et le signal '
                        'ne s''allumerait sur AUCUN des six catalogues livrés, donc jamais.';
    end if;
    raise notice 'Veille des catalogues : % surveillé(s), dont % à vérifier.',
                 v_surveilles, v_a_verifier;
end;
$$;

-- =====================================================================================
-- §3 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('052', 'La veille des catalogues (action 26.5) : la fenêtre de surveillance des '
               'cinq textes normatifs du socle est posée à soixante mois — le guide de '
               'l''ANSSI, publié en 2017, bascule immédiatement en « à vérifier », et '
               'c''est VRAI. AirCyber reste sans date : elle n''est pas publique, et en '
               'inventer une rendrait le signal faux dans les deux sens')
on conflict (version) do nothing;

commit;
