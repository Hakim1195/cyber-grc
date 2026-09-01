# Ce répertoire ne contient plus de données, et il ne doit plus en contenir

Il a porté, du 31/08/2026 au 01/09/2026, **quatre classeurs de données réelles** :
un registre de risques informatiques, un import de risques, un questionnaire
d'exigences client, et un **fichier de verrou Excel nommant une personne**.

Aucun code de l'application ne les référençait. En revanche, `deploy/install.sh`
recopiait **tout** `cyber-gouvernance_V4/` dans la racine web d'Apache, et ni
`.xlsx` ni `data/` ne figuraient dans les blocs d'interdiction du vhost : ces
fichiers auraient donc été **servis sans aucun contrôle d'accès** sur une
installation réelle — dans un produit dont c'est précisément le métier de
protéger ce genre de contenu. Constat **Q-31** du sixième passage de la porte S2.

Les fichiers sont retirés de l'arbre de travail. **Ils restent dans l'historique
git**, donc dans le dépôt distant : les purger est une décision qui appartient au
propriétaire du dépôt, pas à une session — elle impose une réécriture d'historique
et une poussée forcée.

**La règle qui en découle** : aucun fichier de données ne vit sous
`cyber-gouvernance_V4/`. Les jeux d'essai vivent dans le répertoire de travail
temporaire, hors dépôt ; ce que l'application doit lire au démarrage vient du
serveur. Le frontal et l'installateur portent désormais chacun une exclusion —
deux barrières, parce qu'une seule se contourne en changeant d'extension.
