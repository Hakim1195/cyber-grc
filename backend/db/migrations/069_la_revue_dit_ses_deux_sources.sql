-- =====================================================================================
--  069 — LA REVUE D'ACCÈS DIT SES DEUX SOURCES, JUSQU'À DANS SON PROPRE COMMENTAIRE
--
--  §1  Le commentaire de la table, rectifié
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Elle ne change **aucune structure**. Elle corrige une PHRASE, et le motif d'en faire
--  une migration mérite d'être écrit, parce qu'il se reposera.
--
--  La migration `060` a décrit `revue_habilitation_lignes` ainsi :
--
--      « une ligne par (groupe d'annuaire × compte membre) »
--
--  C'était exact ce jour-là. Depuis la `068`, la revue porte **une ligne de plus par
--  délégation temporaire active** — c'est la cinquième des six propriétés qui rendent la
--  délégation sûre, celle sans laquelle le produit aurait une porte dérobée. La `068` a
--  bien commenté la colonne `source` qu'elle ajoutait ; elle a laissé le commentaire de
--  la TABLE affirmer que l'annuaire est la seule source.
--
--  🛑 **Un auditeur qui lit `\d+ revue_habilitation_lignes` avant de relire une revue y
--  trouve donc écrit, dans la base même, que les délégations n'y sont pas.** Il chercherait
--  ailleurs ce qui est là, ou conclurait que le balayage est incomplet. C'est la classe de
--  défaut que ce chantier a nommée le 14/09/2026 : *le banc sait dire qu'un CHIFFRE d'un
--  document est faux ; il ne sait pas dire qu'une PHRASE est devenue fausse.* Un
--  commentaire de catalogue est de la documentation que personne ne relit jamais — c'est
--  précisément pour cela qu'elle survit longtemps à son objet.
--
--  ⚠️ **Et c'est pourquoi ça passe par une migration et non par une correction de la
--  `060`** : `CONVENTIONS.md` §23 — une migration appliquée ne se réécrit jamais, elle se
--  corrige dans la suivante. Réécrire la `060` ne changerait rien sur les installations
--  déjà déployées, où le faux commentaire resterait en base.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE COMMENTAIRE DE LA TABLE, RECTIFIÉ
-- =====================================================================================

comment on table revue_habilitation_lignes is
    'Instantané FIGÉ d''une revue. DEUX sources, et la colonne « source » le dit : une '
    'ligne par (groupe d''annuaire × compte membre), PLUS une ligne par délégation '
    'temporaire ACTIVE au moment du balayage (migration 068). ⚠️ Le commentaire posé par '
    'la migration 060 ne citait que la première, et il est resté faux le temps que cette '
    'ligne-ci soit écrite : sans la seconde source, la revue A.5.18 serait complète en '
    'apparence et manquerait tous les droits accordés DANS le produit — ceux que personne '
    'n''a inscrits dans l''AD. ⚠️ Les colonnes d''instantané ne se relisent JAMAIS dans '
    'l''annuaire : ce qui sert de preuve ne se recalcule pas (même raisonnement que '
    'l''empreinte d''une approbation, lot L8). Une revue close cite donc des personnes '
    'qui ont pu quitter le groupe depuis, et des délégations depuis expirées — c''est '
    'voulu, c''est ce qu''on a revu.';

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('069', 'la revue d''accès dit ses DEUX sources jusque dans le commentaire de sa '
               'table : la 060 n''y citait que l''annuaire, et un auditeur y lisait donc, '
               'dans la base même, que les délégations temporaires n''y figurent pas')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Reposer le texte de la `060`. Ce serait réintroduire la fausseté : à ne faire que si
--   les délégations temporaires cessaient d'entrer dans la revue, c'est-à-dire jamais
--   sans retirer la `068`.
-- =====================================================================================
