---
title: Plan de migration Koxmos Web → Koxmos App native
status: proposed
owner: Etudesk / Koxmos
updated: 2026-08-07
---

# Plan de migration Koxmos Web → application mobile native

## Résultat cible

Livrer Koxmos sur iOS et Android avec la même expérience que le prototype web, sans son parcours d'inscription : passeport de compétences, niveaux et provenance, choix d'un tuteur, avatars, appel vocal live, progression et profil. La personne peut choisir son agent : **Texte (GPT-5 mini)** ou **Vocal (Aethex Kora AI)**. L'application doit paraître et réagir comme Koxmos, avec une interface **noire et blanche**, le logo actuel, des icônes **Lucide** et les avatars de tuteurs existants.

Il n'y a ni inscription, ni OTP, ni compte Koxmos distant. La première ouverture demande seulement le **prénom** et le **pays**, puis crée une identité locale aléatoire liée au téléphone et protégée par le code de sécurité du téléphone ou la biométrie. Le prénom permet au tuteur de s'adresser naturellement à la personne ; le pays choisit la langue et le catalogue de tuteurs. Le passeport, la progression et les éventuelles transcriptions sont stockés **uniquement sur le téléphone**. Une session AethexAI reçoit un flux audio temporaire pour répondre en temps réel ; aucun backend Koxmos ne persiste la conversation.

## Écart à combler depuis le web

| Domaine | Prototype web actuel | Cible native locale-first |
|---|---|---|
| Client | Vite, HTML/CSS/JS | React Native + TypeScript, Expo Development Build puis builds iOS/Android |
| Passeport / profil | SQLite du serveur Python | SQLite chiffré sur l'appareil, clé protégée par Keychain/Keystore ; export/import chiffré manuel |
| Authentification | E-mail OTP, cookie serveur | Aucune inscription ni OTP ; prénom + pays locaux, identité aléatoire, verrouillage par code système/PIN ou biométrie |
| Tuteurs | `market-config.js`, PNG locaux | Catalogue local versionné, mêmes noms, spécialisations et PNG empaquetés |
| Voix live | OpenAI Realtime WebRTC, secret créé par le serveur | SDK/API AethexAI avec transport WebRTC ou WebSocket audio natif ; jeton éphémère uniquement |
| Tutor mode texte | Aucun équivalent live direct | GPT-5 mini via session API éphémère, messages affichés et effacés par défaut à la fermeture |
| Transcriptions | Envoyées et conservées en SQLite serveur | Affichage en mémoire ; conservation locale uniquement avec consentement explicite |
| Évaluation / niveau | Outil serveur et historique distant | Résultat éphémère AethexAI, validation locale et écriture dans le passeport local |
| Diagnostics | Télémétrie serveur | Compteurs techniques anonymisés locaux, partage manuel et opt-in seulement |

## Architecture cible

```text
                      ┌──────────────────────────────────┐
                      │          Koxmos App native         │
                      │ iOS / Android · React Native TS    │
                      ├──────────────────────────────────┤
                      │ UI Koxmos noir/blanc · Lucide      │
                      │ Tuteurs & avatars empaquetés       │
                      │ Audio engine + interruption        │
                      │ PassportRepository + import/export │
                      └──────────────┬───────────────────┘
                                     │ audio live + jeton court
                                     ▼
                      ┌──────────────────────────────────┐
                      │ AethexAI Realtime                 │
                      │ STT / raisonnement / TTS           │
                      │ politique zéro-rétention à valider │
                      └──────────────────────────────────┘

   Téléphone uniquement : SQLCipher + fichiers chiffrés + Secure Enclave/Keystore
   Koxmos : aucun transcript, aucun passeport, aucune base cloud utilisateur
```

### Modules de l'app

```text
app/
  onboarding/             prénom + pays, création locale du profil, consentement et permission micro
  passport/               compétences, niveaux, recherche, export/import/suppression
  tutors/                 sélection du tuteur, catalogue et avatars
  live-session/           audio duplex, waveform, mute, interruption, reprise
  text-session/           streaming de texte, interruptions et rendu des messages
  profile/                préférences, stockage, confidentialité et diagnostics
core/
  db/                     migrations SQLite chiffrées et repositories
  crypto/                 clés, chiffrement des exports et effacement sécurisé
  aethex/                 contrat de session, transport, reconnexion, garde-fous
  design/                 tokens, composants, Lucide et accessibilité
assets/                   logo Koxmos et avatars actuels
```

## Invariants de confidentialité et sécurité

1. **Local par défaut.** Le passeport, profil, historique et préférences ne quittent jamais l'appareil sans une action explicite de l'utilisateur.
2. **Sans inscription.** Seuls le prénom et le pays sont demandés au premier lancement ; l'identifiant est généré sur l'appareil. Le code du téléphone ou la biométrie déverrouille les données, sans e-mail, numéro ou mot de passe Koxmos.
3. **Aucune conversation en cloud Koxmos.** Pas de proxy qui journalise l'audio, pas d'analytics de contenu, pas de sauvegarde serveur.
4. **Traitement AethexAI minimal.** Audio et contexte de session limités à ce qui est indispensable ; jeton à durée de vie courte, jamais de clé fournisseur dans l'application.
5. **Mode d'agent local.** La préférence Texte/Vocal est sauvegardée dans le passeport local. Le contenu de la conversation n'est pas utilisé pour profiler la personne ni synchronisé par Koxmos.
6. **Pas d'enregistrement audio par défaut.** Les transcriptions restent seulement en mémoire durant l'appel ; « Conserver le résumé / transcript » est un choix séparé, local et révocable.
7. **Chiffrement au repos.** Base SQLCipher, clés dans iOS Keychain / Android Keystore, protection biométrique ou code de l'appareil pour ouvrir l'app.
8. **Export/import sous contrôle.** Le fichier de passeport est chiffré avec une phrase secrète choisie lors de l'export, sans clé serveur. L'import demande cette phrase secrète et propose fusion ou remplacement après aperçu.
9. **Effacement vérifiable.** « Supprimer mes données » détruit base, clés, fichiers audio éventuels, cache et jetons. Un export chiffré local est proposé avant suppression.
10. **Réseau strict.** HTTPS/WSS, certificate pinning si supporté, allow-list des domaines AethexAI et OpenAI, interdiction de logs contenant texte, audio, jeton ou identifiant personnel.

> Risque à lever : aucune architecture mobile ne peut, seule, garantir que le fournisseur vocal ne conserve rien. Ce point dépend du contrat de traitement, de la configuration d'AethexAI et de ses sous-traitants. La promesse publique ne sera publiée qu'après preuve écrite et test de non-rétention.

## UX et fidélité au design Koxmos

- Réutiliser `koxmos-logo.png`, les avatars `voices/*.png`, les noms de tuteurs et le catalogue marché depuis le prototype.
- Transposer les composants tels quels : cartes à bord noir, rayons 12/22/28, surfaces blanches, zone live noire, accent vert déjà employé (`#59e391`) pour le statut vocal et le niveau actif.
- Utiliser `lucide-react-native` avec épaisseur légère cohérente et labels accessibles ; ne pas substituer les symboles système par défaut.
- Conserver la mise en avant des tuteurs (carrousel horizontal), l’anneau audio autour de l’avatar, la waveform, les actions mute/interruption/terminer et l'état de connexion.
- Ajouter les comportements natifs : haptique discret, Safe Area, permissions just-in-time, reprise de l'appel après interruption réseau et mode audio arrière-plan uniquement pendant une session active.

### Onboarding minimal

L'onboarding tient sur un seul écran, sans création de compte :

1. Champ **Prénom** (obligatoire, 1 à 40 caractères) ; il est affiché uniquement dans l'app et, pendant l'appel, peut être envoyé à AethexAI comme contexte éphémère du tuteur.
2. Sélecteur **Pays** (obligatoire) ; il détermine la langue de l'interface et les deux tuteurs recommandés. La sélection est modifiable dans le profil local.
3. Bouton « Continuer » : crée immédiatement l'identifiant aléatoire local, la base chiffrée et le passeport vide. Aucune vérification e-mail, numéro, mot de passe ou appel réseau.
4. Le consentement micro est demandé seulement lorsque la personne démarre sa première conversation, jamais durant l'onboarding.

Le prénom et le pays figurent dans l'export chiffré afin de permettre une restauration fidèle sur un autre téléphone. À l'import, ils peuvent être remplacés par les valeurs de l'appareil cible.

## Contrat AethexAI à finaliser

Avant de coder l'adaptateur, obtenir la documentation et valider ces points :

| Question | Exigence Koxmos |
|---|---|
| Transport audio | WebRTC privilégié ; sinon WebSocket PCM/Opus duplex documenté |
| Latence | cible médiane aller-retour < 900 ms sur 4G ; mesure p95 par pays |
| Authentification | jeton de session éphémère délivré par un service minimal à partir d'un identifiant pseudonyme de l'appareil, sans e-mail, transcript ni profil |
| Contexte tuteur | instructions, voix, langue et niveau transmis pour la session, jamais de mémoire distante persistante |
| Rétention | zéro audio/transcript/contenu, logs techniques minimisés et durée écrite |
| Données | régions, sous-traitants, chiffrement en transit/repos, effacement et DPA |
| Événements | interruption, VAD, transcript partiel/final, erreur, fin et outil de niveau |
| Résilience | reconnexion, reprise idempotente, limites, quotas et statut temps réel |

Si AethexAI ne propose pas de jeton sûr directement pour mobile, utiliser un **broker de jetons minimal** : il vérifie l'intégrité de l'app et crée un jeton AethexAI ; il ne reçoit jamais l'audio, les transcriptions, le passeport ou le prompt complet.

## Double mode d'agent

Le passeport affiche un sélecteur persistant, stocké localement :

| Mode | Agent | Interface | Données envoyées durant la session |
|---|---|---|---|
| Texte | GPT-5 mini | conversation de type messagerie, réponse streamée, boutons interrompre/terminer | prénom, pays, compétence active, niveau et dernier message nécessaires à la réponse |
| Vocal | Aethex Kora AI | avatar, anneau audio, waveform, mute/interruption/fin | flux audio temporaire, prénom, pays, compétence active et niveau |

Le changement de mode n'efface pas le passeport. Une conversation active doit être terminée avant de basculer. Dans les deux modes, le transcript disparaît à la fermeture sauf si la personne confirme sa conservation locale.

## Feuille de route

### Phase 0 — cadrage et preuve fournisseur (3 à 5 jours)

- Geler l'inventaire fonctionnel du web et constituer les captures de référence iOS/Android.
- Valider le contrat AethexAI ci-dessus et réaliser une session de test audio sur appareils physiques.
- Écrire la notice de confidentialité et les écrans de consentement avec la formulation exacte validée.
- Décider du format d'export/import chiffré et du mécanisme de jeton éphémère pseudonyme.

**Sortie :** contrat d'interface AethexAI, matrice de données, design tokens et critères d'acceptation signés.

### Phase 1 — socle natif, design system et stockage (1 semaine)

- Créer l'app TypeScript React Native avec Expo Development Build et modules natifs nécessaires à l'audio/chiffrement.
- Importer logo, avatars et icônes Lucide ; implémenter tokens et composants Koxmos.
- Mettre en place SQLCipher, gestion des migrations, Keychain/Keystore et repositories de passeport.
- Implémenter l'onboarding prénom + pays, la création du profil local, le verrouillage appareil/biométrie, l'écran confidentialité, l'export/import chiffré et la purge complète.

**Sortie :** application navigable hors-ligne avec le passeport complet, persisté localement et visuellement fidèle.

### Phase 2 — parité fonctionnelle hors audio (1 semaine)

- Ajouter, modifier, masquer, supprimer, exporter, importer et rechercher une compétence ; niveaux Débutant à Expert et provenance déclarée/évaluée.
- Porter les marchés FR/EN, le catalogue de tuteurs, profil, progression et écrans historiques locaux.
- Ajouter les tests de migration de base, accessibilité VoiceOver/TalkBack et snapshots visuels.

**Sortie :** parité du passeport et du profil sans dépendance réseau.

### Phase 3 — session vocale AethexAI (1 à 2 semaines)

- Construire `AethexRealtimeClient` derrière une interface indépendante du fournisseur.
- Gérer permission microphone, PCM/Opus, VAD, lecture audio faible latence, interruption (barge-in), mute et fin propre.
- Afficher waveform/anneau avatar depuis les niveaux audio, états réseau, erreurs explicites et reconnexion limitée.
- Ne conserver que l'état live en mémoire ; écrire localement seulement le résumé/niveau approuvé par l'utilisateur à la fin.

**Sortie :** appels réels sur iOS et Android, avec latence et stabilité mesurées sur Wi-Fi et 4G.

### Phase 4 — durcissement, performance et bêta (1 semaine)

- Tests de sécurité : clés, logs, export, suppression, proxy réseau, appareil perdu et jailbreak/root détectable sans bloquer abusivement.
- Tests de charge sur le broker de jetons, chaos réseau, appels entrants, mise en veille, Bluetooth et casques filaires.
- Instrumentation locale opt-in : latence, erreurs et qualité réseau, sans contenu vocal ou identifiant personnel.
- Bêta fermée, validation Store/Play et procédure de support sans accès aux données locales.

**Sortie :** release candidate, dossier de confidentialité et checklist stores.

## Critères de performance et d'acceptation

| Axe | Seuil de lancement |
|---|---|
| Démarrage à froid | < 2,5 s sur appareil Android de référence |
| Écran passeport | interaction < 100 ms pour 100 compétences locales |
| Audio live | première réponse audible < 2 s ; RTT médian < 900 ms en 4G exploitable |
| Stabilité | 30 min d'appel sans fuite mémoire/arrêt audio sur appareils de test |
| Reconnexion | reprise explicite après retour réseau sans fuite de jeton ni doublon de compétence |
| Confidentialité | audit démontre 0 transcript/passeport dans logs, analytics, sauvegardes ou serveur Koxmos |
| Export/import | un passeport exporté sur un appareil est importable hors-ligne sur un autre avec sa phrase secrète ; aucune donnée ne transite par Koxmos |
| Suppression | données et clés locales supprimées ; l'app redémarre sans ancien profil |
| Parité visuelle | validation côte à côte avec l'app web sur les écrans définis en Phase 0 |
| Accessibilité | parcours intégral au lecteur d'écran, contrastes et cibles tactiles >= 44 pt |

## Tests indispensables

- Unitaires : chiffrement, migrations, repository de compétences, moteur de niveaux, purge et export.
- Intégration : permissions, cycle de vie audio, appels interrompus, offline, reprise réseau et expiration de jeton.
- E2E : saisie prénom + pays → création du profil → ajout de compétence → export chiffré → import sur un appareil propre → sélection tuteur → appel → validation locale → effacement.
- Réels : iPhone récent + ancien, Android entrée/milieu de gamme ; Wi-Fi, 4G, réseau dégradé, Bluetooth, appel téléphonique entrant.
- Sécurité : inspection du trafic, recherche de PII dans les logs/builds, test de restauration d'une sauvegarde locale et revue des permissions.

## Décisions explicites pour le MVP

1. **Pas de synchronisation automatique multi-appareil.** Le passage d'un téléphone à l'autre se fait exclusivement par export/import chiffré, choisi par la personne.
2. **Aucune inscription.** Le premier lancement demande seulement prénom et pays, puis crée un profil local ; la sécurité repose sur le verrouillage du téléphone, avec biométrie proposée si disponible.
3. **Pas de paiement dans la première version.** Le crédit minute serveur actuel contredit une expérience strictement locale ; le modèle économique sera défini après la validation voice-first.
4. **Conservation de texte en opt-in.** Par défaut, aucune transcription n'est conservée après fermeture de l'appel ; le niveau et un résumé peuvent être sauvegardés localement avec confirmation.
5. **AethexAI isolé par adaptateur.** Changer de fournisseur vocal ne doit toucher ni au passeport ni aux écrans.

## Risques et parades

| Risque | Parade |
|---|---|
| AethexAI ne garantit pas zéro rétention | ne pas faire la promesse absolue ; négocier DPA/configuration ou changer de fournisseur |
| SDK mobile absent ou transport Web only | prototype natif WebRTC/WS avant Phase 1 ; prévoir module natif dédié, jamais WebView pour l'audio live |
| Latence mobile Afrique de l'Ouest | codec adaptatif, VAD côté appareil, reprise réseau, mesure terrain et réponses vocales courtes |
| Clé fournisseur exposée | jetons courts, attestation d'app, rotation, absence de clé longue durée dans le binaire |
| Perte du téléphone | chiffrement, biométrie optionnelle, effacement local ; assumer l'absence de restauration cloud |
| Divergence design web/mobile | tokens partagés documentés, captures de référence et revue visuelle à chaque phase |

## Livrables attendus

- application iOS/Android native et dépôt dédié ;
- paquet d'assets Koxmos (logo, avatars, design tokens, Lucide) ;
- adaptateur AethexAI et broker de jetons minimal si nécessaire ;
- schéma de base locale, plan de migration et tests de purge/export ;
- politique de confidentialité locale-first, DPA AethexAI et preuves de non-rétention ;
- rapport de tests performance, sécurité, accessibilité et parité visuelle.
