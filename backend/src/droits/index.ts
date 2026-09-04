/**
 * Le modèle de droits à trois axes — point d'entrée du module.
 *
 * Quatre fichiers, et la frontière entre eux est celle de la responsabilité :
 *
 * | Fichier | Ce qu'il porte |
 * |---|---|
 * | `modele.ts` | le vocabulaire — niveaux, portées, les trente domaines, le cumul |
 * | `resolution.ts` | la traduction « groupes AD → droits », qui lit `groupes_ad` |
 * | `resolveur.ts` | `ResolveurPerimetre` : **le seul endroit où un périmètre se fabrique** |
 * | `groupes-ad.ts` | l'engendrement des groupes attendus depuis la configuration |
 * | `passerelle-api.ts` | la projection sur le vocabulaire du point d'entrée |
 */

export {
  cumuler,
  DOMAINES,
  estDomaine,
  estNiveau,
  NIVEAUX,
  suffit,
} from './modele.js';
export type {
  DomaineFonctionnelBase,
  DroitsResolus,
  NiveauDroit,
  PorteeSession,
} from './modele.js';

export { ErreurSocleDroits, ouvreUnAcces, resoudreDroits } from './resolution.js';
export type { OptionsResolution } from './resolution.js';

export { ResolveurPerimetreSession } from './resolveur.js';
export type { EtatSession, FilialeActive } from './resolveur.js';

export {
  groupesAttendus,
  lireFilialesActives,
  lireProfilsActifs,
  synchroniserGroupesAd,
} from './groupes-ad.js';
export type {
  BilanSynchronisation,
  FilialeConnue,
  GroupeAttendu,
  ProfilConnu,
} from './groupes-ad.js';

export { DOMAINE_API_PAR_DOMAINE_BASE, projeterDroits } from './passerelle-api.js';
