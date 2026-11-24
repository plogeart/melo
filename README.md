# Mélo – lecteur de musique perso

Application web installable (PWA) : un seul code pour PC et téléphone. La musique est stockée **dans l'appareil** (IndexedDB du navigateur), rien ne part sur un serveur.

## Mettre l'app en ligne (une fois)

Pour être installable sur téléphone, l'app doit être servie en HTTPS. Le plus simple et gratuit : **GitHub Pages**.
Seul le code de l'app y est hébergé – tes MP3 ne quittent jamais tes appareils.

1. Crée un compte sur github.com puis un dépôt (ex. `melo`).
2. « Add file → Upload files » : envoie tous les fichiers de ce dossier (sauf `.claude/`).
3. Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. L'app est dispo à `https://<ton-pseudo>.github.io/melo/`.

## Installer

- **PC (Chrome / Edge)** : ouvre l'adresse → icône « Installer » dans la barre d'adresse.
- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

## Transférer entre PC et téléphone

- **Exporter tout** (barre latérale) ou **Exporter** sur une playlist → fichier `.melo` (MP3 + playlists + likes).
- Mets-le sur OneDrive, puis sur l'autre appareil : **Importer** → choisis le fichier.
- L'import **fusionne** : un même son n'est jamais dupliqué (reconnu par son contenu), les playlists sont complétées.
- Tu peux aussi importer directement des MP3 (sélection multiple, ou glisser-déposer sur PC).

## Mettre à jour l'app

Après avoir modifié un fichier, change `VERSION` dans `sw.js` (ex. `melo-v2`) puis renvoie les fichiers sur GitHub.

## Tester en local

```
python -m http.server 8765
```
puis http://localhost:8765 – tests de la logique : `node lib.test.mjs`.
