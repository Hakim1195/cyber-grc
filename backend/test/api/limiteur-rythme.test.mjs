/**
 * limiteur-rythme.test.mjs — le compteur qui borne les requêtes sans session.
 *
 * ── Pourquoi un essai unitaire en plus de l'essai par HTTP ───────────────────
 *
 * `droits-application.test.mjs` prouve que le verrou **s'exerce** : au bout de
 * N refus, la réponse devient 429, et l'authentificateur n'est plus appelé. Ce
 * qu'il ne peut pas prouver, ce sont les propriétés qui vivent dans le temps et
 * dans la mémoire :
 *
 *  · le verrou **expire** — un essai qui dort quinze minutes est un essai que
 *    personne ne joue ;
 *  · le registre est **borné** — mille adresses forgées ne doivent pas remplir
 *    la mémoire du service (contrôle S13) ;
 *  · un refus de service (503) **ne compte pas**, et c'est une règle du code
 *    appelant, éprouvée là-haut ; ici on éprouve que le compteur, lui, ne compte
 *    que ce qu'on lui donne.
 *
 * L'horloge est **injectée** : c'est ce qui rend le temps observable sans
 * l'attendre, et sans rendre le banc intermittent (constat Q-64).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';

/** Une horloge qu'on avance à la main. */
function horlogeReglable(depart = 1_000_000) {
  let maintenant = depart;
  const horloge = () => maintenant;
  horloge.avancer = (ms) => {
    maintenant += ms;
  };
  return horloge;
}

async function limiteur(reglages) {
  const { LimiteurRythme } = await moduleCompile('api/limiteur.js');
  return new LimiteurRythme(reglages);
}

describe('Le compteur de refus non authentifiés', () => {
  test('une adresse neuve passe, et rien n’est retenu tant qu’elle ne fait rien de mal', async () => {
    const l = await limiteur({ budget: 3, fenetreMs: 60_000, adressesMax: 64, horloge: horlogeReglable() });
    for (let i = 0; i < 100; i += 1) assert.equal(l.verifier('10.0.0.1').bloque, false);
    assert.equal(l.taille(), 0, 'Un appelant qui ne se fait jamais refuser ne coûte pas une entrée.');
  });

  test('le budget atteint verrouille, et le verdict porte la durée', async () => {
    const l = await limiteur({ budget: 3, fenetreMs: 60_000, adressesMax: 64, horloge: horlogeReglable() });
    assert.equal(l.enregistrerRefus('10.0.0.1').bloque, false);
    assert.equal(l.enregistrerRefus('10.0.0.1').bloque, false);
    const troisieme = l.enregistrerRefus('10.0.0.1');
    assert.equal(troisieme.bloque, true, 'Le troisième refus sur un budget de trois verrouille.');
    assert.equal(troisieme.attendreS, 60);
    assert.equal(l.verifier('10.0.0.1').bloque, true);
  });

  test('le verrou n’atteint QUE l’adresse fautive', async () => {
    const l = await limiteur({ budget: 2, fenetreMs: 60_000, adressesMax: 64, horloge: horlogeReglable() });
    l.enregistrerRefus('10.0.0.1');
    l.enregistrerRefus('10.0.0.1');
    assert.equal(l.verifier('10.0.0.1').bloque, true);
    assert.equal(l.verifier('10.0.0.2').bloque, false, 'Le voisin ne doit pas payer.');
  });

  test('le verrou EXPIRE — sans quoi une erreur de manipulation dure toujours', async () => {
    const horloge = horlogeReglable();
    const l = await limiteur({ budget: 2, fenetreMs: 60_000, adressesMax: 64, horloge });
    l.enregistrerRefus('10.0.0.1');
    l.enregistrerRefus('10.0.0.1');
    assert.equal(l.verifier('10.0.0.1').bloque, true);

    horloge.avancer(59_000);
    assert.equal(l.verifier('10.0.0.1').bloque, true, 'Il ne doit pas expirer avant l’heure.');
    horloge.avancer(2_000);
    assert.equal(l.verifier('10.0.0.1').bloque, false, 'Il doit expirer à l’heure.');
    assert.equal(l.taille(), 0, 'Et l’entrée expirée ne doit pas rester en mémoire.');
  });

  test('la fenêtre glisse : deux refus espacés ne s’additionnent pas', async () => {
    const horloge = horlogeReglable();
    const l = await limiteur({ budget: 2, fenetreMs: 60_000, adressesMax: 64, horloge });
    l.enregistrerRefus('10.0.0.1');
    horloge.avancer(61_000);
    assert.equal(l.enregistrerRefus('10.0.0.1').bloque, false, 'Le compteur repart à zéro.');
  });

  test('S13 — le registre est BORNÉ : mille adresses forgées n’en font pas mille entrées', async () => {
    const l = await limiteur({ budget: 5, fenetreMs: 60_000, adressesMax: 32, horloge: horlogeReglable() });
    for (let i = 0; i < 1000; i += 1) l.enregistrerRefus(`10.1.${String(i >> 8)}.${String(i % 256)}`);
    assert.ok(l.taille() <= 32, `Registre non borné : ${String(l.taille())} entrées.`);
  });

  test('le plafond du registre n’est pas un plancher : le service reste servi', async () => {
    // Un registre saturé qui bloquerait tout le monde serait un déni de service
    // que l'adversaire déclenche lui-même. Le comportement attendu est l'inverse :
    // il relâche, il ne resserre pas.
    const l = await limiteur({ budget: 5, fenetreMs: 60_000, adressesMax: 32, horloge: horlogeReglable() });
    for (let i = 0; i < 1000; i += 1) l.enregistrerRefus(`10.2.${String(i >> 8)}.${String(i % 256)}`);
    assert.equal(l.verifier('192.168.0.9').bloque, false);
  });

  test('les réglages absurdes sont ramenés à des valeurs tenables', async () => {
    // Une configuration à zéro ne doit pas verrouiller tout le monde au premier
    // appel, ni faire boucler l’éviction.
    const l = await limiteur({ budget: 0, fenetreMs: 0, adressesMax: 0, horloge: horlogeReglable() });
    assert.equal(l.verifier('10.0.0.1').bloque, false);
    assert.equal(l.enregistrerRefus('10.0.0.1').bloque, true, 'Un budget de 1 verrouille au premier refus.');
  });
});
