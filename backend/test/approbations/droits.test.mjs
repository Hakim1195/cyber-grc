/**
 * droits.test.mjs — **le niveau `validation`, premier usage du troisième axe.**
 *
 * `src/api/droits.ts` le déclare depuis le lot L3 avec cette note : *« `validation`
 * n'est encore exercé par aucune route (le circuit d'approbation est le lot L8) ;
 * il est néanmoins déclaré, parce qu'un niveau absent du type serait un niveau
 * qu'un profil AD ne peut pas porter. »* C'est ici qu'il s'exerce.
 *
 * Ce que ce fichier mesure, et pourquoi chaque point :
 *
 *  · un profil **Contribution** — celui qui rédige le document — ne le tranche
 *    pas. C'est **le** point du lot : sans lui, approuver serait une écriture
 *    ordinaire, et le circuit ne prouverait rien ;
 *  · le refus vient d'un **crochet `onRequest`**, jamais du corps de la route.
 *    Deux preuves, et la seconde est la vraie : le texte, puis le
 *    **comportement** — sur un refus, la route n'a rien écrit, rien lu, rien
 *    journalisé en `approbation`, et un corps illisible n'a même pas été
 *    analysé ;
 *  · un refus **laisse une trace** `refus_autorisation` : « qui a tenté
 *    d'approuver sans en avoir le droit » est une question d'audit.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import {
  etapesEnBase,
  journalEnBase,
  monterApprobations,
  profil,
  SessionDEssai,
  sessionSite,
} from './aide.mjs';

const LOGIN = 'rssi.toulouse';

let base;
let serveur;
let session;
let proprietaire;

const url = (entite, id) => `/api/approbations/${entite}/${id}`;

function avec(droits) {
  session.poser(sessionSite(FILIALE_A, LOGIN), droits);
}

async function decider(entite, id, etape) {
  return await serveur.appeler('POST', url(entite, id), {
    corps: { etape, decision: 'approuve' },
  });
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, await base.connexion('app'));
  session = new SessionDEssai(sessionSite(FILIALE_A, LOGIN), profil('validation'));
  serveur = await monterApprobations(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Lire n'est pas trancher
 * ===================================================================== */

describe('Le niveau exigé pour DÉCIDER n’est pas celui exigé pour LIRE', () => {
  test('un profil Lecture consulte le circuit', async () => {
    avec(profil('lecture'));
    const r = await serveur.appeler('GET', url('documents', 'DOC-A'));
    assert.equal(r.statut, 200);
    assert.equal(r.corps.circuit.etapeAttendue, 'redaction');
  });

  test('un profil Lecture ne tranche rien, et n’écrit rien', async () => {
    avec(profil('lecture'));
    const r = await decider('documents', 'DOC-A', 'redaction');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'droit_insuffisant');
    assert.equal((await etapesEnBase(base, proprietaire, 'document', 'DOC-A')).length, 0);
  });

  test('LE POINT DU LOT : un profil Contribution ne tranche pas davantage', async () => {
    // Il rédige le document, il le modifie, il crée les risques — et c'est
    // exactement pour cela qu'il ne doit pas les approuver. `NIVEAU_MINIMAL`
    // associe `ecrire` à `contribution` : c'est la déclaration
    // `acces.niveau: 'validation'` de la route qui RESSERRE le plancher, et le
    // crochet parent qui prononce le refus. Sans elle, cette requête passerait.
    avec(profil('contribution'));
    const r = await decider('documents', 'DOC-A', 'redaction');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'droit_insuffisant');
    assert.match(r.corps.message, /profil de validation/u);
    // Le message ne dit ni le niveau requis ni le domaine : les énumérer
    // dirait à qui n'y a pas droit ce qu'il faudrait obtenir.
    assert.ok(!/validation »|documents|contribution/u.test(r.corps.message));
    assert.equal((await etapesEnBase(base, proprietaire, 'document', 'DOC-A')).length, 0);
  });

  test('un profil Validation tranche', async () => {
    avec(profil('validation'));
    const r = await decider('documents', 'DOC-A', 'redaction');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-A');
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].statut, 'approuve');
  });

  test('un profil Administration aussi : chaque niveau contient le précédent', async () => {
    avec(profil('administration'));
    const r = await decider('documents', 'DOC-A', 'revue');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
  });
});

/* =====================================================================
 *  §2 — Le niveau PAR DOMAINE prime, et les deux crochets s'accordent
 * ===================================================================== */

describe('Le niveau par domaine prime, comme pour deciderAcces', () => {
  test('Validation partout, mais Contribution sur « documents » : refusé là, admis ailleurs', async () => {
    avec(profil('validation', { niveaux: { documents: 'contribution' } }));
    const surDocument = await decider('documents', 'DOC-A', 'approbation');
    assert.equal(surDocument.statut, 403, JSON.stringify(surDocument.corps));
    assert.equal(surDocument.corps.erreur, 'droit_insuffisant');

    // Le même profil, le même geste, un autre domaine : admis. Sans ce second
    // appel, le 403 ci-dessus pourrait venir du profil entier et non du domaine.
    const surRisque = await decider('risques', 'RISK-A', 'proposition');
    assert.equal(surRisque.statut, 201, JSON.stringify(surRisque.corps));
  });

  test('Contribution partout, mais Validation sur « audits » : admis là, refusé ailleurs', async () => {
    // Le champ `niveaux` REMPLACE le niveau de session pour le domaine qu'il
    // nomme — c'est ce que fait `deciderAcces`, et les deux crochets doivent
    // dire la même chose. S'ils divergeaient, une requête serait admise par
    // l'un et refusée par l'autre selon l'ordre où ils s'exécutent.
    avec(profil('contribution', { niveaux: { audits: 'validation' } }));
    assert.equal((await decider('audits', 'AUD-A', 'redaction')).statut, 201);
    assert.equal((await decider('documents', 'DOC-A', 'approbation')).statut, 403);
  });

  test('un domaine absent du profil est refusé plus tôt, par le crochet PARENT', async () => {
    avec(profil('validation', { domaines: ['risques'] }));
    const r = await decider('documents', 'DOC-A', 'approbation');
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'droit_insuffisant');
    // Le message est celui du modèle de droits, pas celui du circuit : les deux
    // refus se distinguent, et c'est ce qui permet de dire lequel a parlé.
    assert.match(r.corps.message, /ne donne pas accès à cette partie/u);
    // La lecture aussi est refusée : ce n'est pas un droit d'écriture, c'est le
    // domaine entier.
    assert.equal((await serveur.appeler('GET', url('documents', 'DOC-A'))).statut, 403);
  });
});

/* =====================================================================
 *  §3 — Le refus vient du CROCHET, et il laisse une trace
 * ===================================================================== */

describe('Un refus de niveau se prononce avant la route, et se journalise', () => {
  test('il est prononcé AVANT l’analyse du corps (condition E4)', async () => {
    // Un corps illisible avec un profil insuffisant doit rendre **403**, pas
    // 400 : si l'analyse du corps avait lieu d'abord, le serveur travaillerait
    // pour un appelant qu'il va refuser — c'est la mesure de E4, et le 9ᵉ
    // passage de la porte S2 a chiffré ce que cela coûte.
    avec(profil('contribution'));
    const r = await serveur.appeler('POST', url('documents', 'DOC-A'), {
      corps: '{ ceci n’est pas du JSON',
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'droit_insuffisant');
  });

  test('un refus écrit « refus_autorisation », jamais « approbation »', async () => {
    const avantRefus = (await journalEnBase(base, proprietaire, 'refus_autorisation')).length;
    const avantAppro = (await journalEnBase(base, proprietaire, 'approbation')).length;

    avec(profil('contribution'));
    assert.equal((await decider('risques', 'RISK-A', 'acceptation')).statut, 403);

    const refus = await journalEnBase(base, proprietaire, 'refus_autorisation');
    assert.equal(refus.length, avantRefus + 1, '« Qui a tenté d’approuver » est une question d’audit.');
    const derniere = refus[refus.length - 1];
    assert.equal(derniere.utilisateur_libelle, LOGIN);
    assert.equal(derniere.filiale_id, FILIALE_A);
    assert.equal(derniere.valeurs_apres.methode, 'POST');
    // ── Ces trois assertions ont CHANGÉ de champ, et il faut dire pourquoi ──
    //
    // La trace était écrite par un crochet propre à ce greffon, qui savait
    // qu'il parlait d'approbations (`entite_type`) et pourquoi il refusait
    // (`motif: 'niveau_validation_absent'`). Ce crochet a disparu : le refus de
    // niveau se prononce désormais dans `onRequest`, comme tous les autres, et
    // c'est `tracerRefusDroit` — commun à toutes les routes — qui écrit.
    //
    // Ce qu'on y perd : `entite_type` vaut `null`, parce que le crochet commun
    // ne sait pas nommer une entité pour une route qui n'en désigne pas une.
    // Ce qu'on y gagne : le refus est écrit de la MÊME façon pour toutes les
    // routes du produit, au lieu d'une variante par greffon — et l'information
    // n'est pas perdue, elle est dans le GABARIT de route, que le crochet
    // enregistre exprès (« la route est un gabarit, jamais l'URL reçue »).
    assert.equal(derniere.entite_type, null);
    assert.equal(derniere.valeurs_apres.route, '/api/approbations/:entite/:entiteId');
    assert.equal(derniere.valeurs_apres.action_exigee, 'ecrire');
    assert.equal(derniere.valeurs_apres.domaine_exige, 'risques');
    // Aucune décision n'a été inscrite au journal : la route n'a pas tourné.
    assert.equal((await journalEnBase(base, proprietaire, 'approbation')).length, avantAppro);
  });

  test('le corps de la route n’a pas tourné du tout : rien n’a bougé en base', async () => {
    // C'est la preuve qui compte. Le contrôle textuel de `contrat.test.mjs`
    // dit que le fichier ne PEUT pas refuser par lui-même ; celui-ci dit que
    // le fichier n'a pas été atteint.
    avec(profil('validation'));
    const avant = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');

    avec(profil('lecture'));
    assert.equal((await decider('risques', 'RISK-A', 'acceptation')).statut, 403);
    assert.deepEqual(await etapesEnBase(base, proprietaire, 'risque', 'RISK-A'), avant);
  });
});
