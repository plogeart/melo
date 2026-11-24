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

## Ajouter un son depuis un lien (PC uniquement)

Sur PC, le champ « Coller un lien YouTube… » en haut convertit le lien en MP3 (titre, artiste, pochette) et l'ajoute à la bibliothèque. Marche aussi avec SoundCloud, Bandcamp, etc.

- Avant d'ajouter des liens : double-clic sur **`convertisseur.bat`** et laisse la fenêtre ouverte. Le script met yt-dlp à jour à chaque lancement, parce que YouTube change souvent.
- Outils nécessaires (déjà installés sur ce PC) : `python -m pip install -U "yt-dlp[default]"` et `winget install Gyan.FFmpeg`.
- Le convertisseur n'écoute que sur ce PC et n'accepte que les requêtes venant de Mélo.
- `convert_server.py` et `convertisseur.bat` n'ont pas besoin d'être envoyés sur GitHub (mais ça ne gêne pas).
- Pour un projet de cours, fais ta démo avec des vidéos libres de droits ou les tiennes.

## Mettre à jour l'app

Après avoir modifié un fichier, change `VERSION` dans `sw.js` (ex. `melo-v3`) puis renvoie les fichiers sur GitHub.

## Tester en local

```
python -m http.server 8765
```
puis http://localhost:8765 – tests de la logique : `node lib.test.mjs`.
