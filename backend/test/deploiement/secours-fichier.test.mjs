/**
 * secours-fichier.test.mjs — le mot de passe du compte de secours SANS terminal.
 *
 * Trouvé le 30/09/2026 par l'agent qui installait en labo : `SECOURS_MDP=""` en tête
 * d'install.sh fait que ce mot de passe ne pouvait venir que de l'assistant interactif.
 * Sans terminal, le profil découverte installait un produit où PERSONNE ne pouvait entrer.
 * `--secours-fichier=` le lit dans un fichier 0600, appartenant à qui lance, et l'EFFACE.
 */
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { extraireFonction, jouerScript } from '../aide/install.mjs';

const corps = extraireFonction('lire_secours_fichier');
const dossiers = [];
after(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

function jouer(motDePasse, mode) {
  const d = mkdtempSync(join(tmpdir(), 'secours-')); dossiers.push(d);
  const f = join(d, 'secours.txt'); writeFileSync(f, `${motDePasse}\n`); chmodSync(f, mode);
  const r = jouerScript(`${corps}\nlire_secours_fichier "${f}"\nprintf 'MDP=[%s]\\n' "$SECOURS_MDP"\n`, {}, d, 'secours');
  return { ...r, reste: existsSync(f) };
}

describe('--secours-fichier : un mot de passe sans terminal, jamais en clair ailleurs', () => {
  test('fichier 0600, douze caractères ou plus : lu SANS son retour à la ligne, puis EFFACÉ', () => {
    const r = jouer('Labo-Decouverte-2026', 0o600);
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /MDP=\[Labo-Decouverte-2026\]/, 'le mot de passe est posé tel quel, sans le \\n');
    assert.equal(r.reste, false, 'le fichier est consommé : il ne doit pas rester sur le disque');
  });

  test('🛑 fichier lisible par d’autres (0644) : REFUSÉ, et le fichier n’est pas touché', () => {
    const r = jouer('Labo-Decouverte-2026', 0o644);
    assert.notEqual(r.code, 0); assert.match(r.sortie, /0600/);
    assert.equal(r.reste, true, 'on ne consomme pas ce qu’on a refusé');
  });

  test('moins de douze caractères : REFUSÉ — ce compte donne l’administration Groupe', () => {
    const r = jouer('court', 0o600);
    assert.notEqual(r.code, 0); assert.match(r.sortie, /douze/);
  });
});
