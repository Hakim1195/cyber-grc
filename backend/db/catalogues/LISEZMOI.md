# `db/catalogues/` — les catalogues de référentiels, fichiers SOURCE

Ces douze fichiers **ne sont plus chargés par le navigateur**. Depuis la migration
`051` (lot L26, action 26.1), les six catalogues et leurs six dictionnaires de
traduction vivent **en base**, dans `referentiels`, `referentiel_domaines`,
`referentiel_exigences` et `referentiel_traductions` — et le navigateur les reçoit
comme le reste, dans le jeu de données de la filiale.

Ils restent ici pour **deux** raisons, et aucune des deux n'est la nostalgie :

1. **Ils sont la SOURCE du semis.** Le §9 de la migration `051` n'a pas été tapé : il
   a été **engendré** depuis ces fichiers, par un programme qui les charge et les
   recopie. Un semis recopié à la main aurait introduit, sur 424 exigences, au moins
   une différence — un accent, une espace insécable, un « 5.1 » devenu « 5.10 » — et
   cette différence aurait **réattribué une réponse d'audit en silence**. Les codes
   sont la moitié droite de la clé par laquelle toute auto-évaluation est stockée.

2. **Ils sont l'ÉTALON.** `test/catalogues/fidelite.test.mjs` les recharge à chaque
   banc et compare la base, **exigence par exigence, champ par champ**. *Un semis
   engendré une fois est juste une fois ; c'est la comparaison qui le garde juste.*

⚠️ **Conséquence à connaître avant de toucher à l'un d'eux** : corriger une coquille
ici ne corrige plus rien dans le produit. Il faut **une migration**, et le banc
rougira tant que les deux ne diront pas la même chose. C'est voulu : les deux
formes du catalogue ne peuvent pas diverger sans que quelqu'un le sache.

⚠️ **Ils ne sont plus publiés dans la racine web.** Les laisser sous
`cyber-gouvernance_V4/js/data/` les aurait laissés servis par Apache — téléchargeables
et inutilisés, ce qui se lit comme « le produit les charge encore ».
