# Audit d’architecture Koxmos App

Date : 9 août 2026
Périmètre : application Expo/React Native, broker Node, tuteur texte OpenAI, tuteur vocal Aethex, passeport, évaluation, facturation et confidentialité.

## Conclusion exécutive

Koxmos possède une architecture réellement différenciante : un **passeport de compétences local** sert de mémoire durable, tandis qu’un **canvas pédagogique éphémère et multimodal** permet au même parcours de passer du texte à la voix. L’évaluation n’est pas une simple classification par LLM : elle est gouvernée par une machine d’état à cinq preuves consécutives, une confiance minimale, une justification et une progression limitée à un niveau.

Le concept est solide, mais l’implémentation auditée mélangeait encore prototype et cible de production. Les principaux écarts corrigés dans cet audit étaient le stockage local en clair, le verrouillage simulé, la conservation automatique des conversations, la persistance serveur de contenu pédagogique, le faux streaming mobile, la duplication du contexte et le parcours vocal codé en dur pour la Côte d’Ivoire.

Après corrections, le socle est cohérent pour un bêta technique. Il n’est pas encore prêt pour une facturation réelle à grande échelle : le registre fichier synchrone, l’identité client non attestée, l’absence de webhook de paiement, l’absence de tests E2E et la preuve contractuelle de non-rétention Aethex restent des conditions de lancement.

## L’innovation multimodale créée

```text
                         PASSEPORT LOCAL CHIFFRÉ
              compétences · niveaux · preuves · préférences
                                   │
                                   ▼
                    SESSION PÉDAGOGIQUE ÉPHÉMÈRE
                  compétence + niveau + résumé borné
                      ┌────────────┴────────────┐
                      ▼                         ▼
              Tuteur texte                 Tuteur vocal
          OpenAI Agents / SSE          Aethex / WebRTC duplex
           outils d’évaluation          outils d’évaluation
                      └────────────┬────────────┘
                                   ▼
                  GARDE-FOUS D’ÉVALUATION COMMUNS
              5 questions · 5 succès · confiance ≥ 0,70
                 preuves ≥ 80 caractères · saut ≤ 1 niveau
                                   │
                                   ▼
                   MISE À JOUR LOCALE DU PASSEPORT
```

Les propriétés innovantes ne résident pas dans un modèle isolé, mais dans leur composition :

- le passeport est l’état durable contrôlé par la personne, pas la conversation du fournisseur ;
- texte et voix partagent la compétence, le niveau, les derniers tours et la progression d’évaluation ;
- le canal peut changer sans perdre le canvas d’apprentissage ;
- le modèle propose, mais des règles déterministes valident la progression ;
- la preuve et l’historique d’évaluation accompagnent le niveau ;
- la facturation pseudonyme est séparée du contenu pédagogique ;
- les voix sont résolues dynamiquement par pays et langue, sans exposer les clés fournisseur au mobile.

## Workflow de bout en bout

### Création du passeport

1. Le mobile collecte uniquement prénom et pays.
2. Un identifiant pseudonyme aléatoire de 256 bits est généré sur l’appareil.
3. Le profil, les compétences et l’éventuel historique sont chiffrés avant AsyncStorage.
4. La clé de 512 bits est liée à l’appareil dans Keychain/Keystore et accessible seulement quand l’appareil est déverrouillé.
5. L’authentification locale est demandée à la réouverture lorsqu’une biométrie est configurée.

### Formation texte

1. Le mobile crée une session pédagogique éphémère pour la compétence sélectionnée.
2. Il transmet le message courant et au plus six tours récents, limités à 1 200 caractères.
3. Le broker réserve 0,25 crédit, appelle le tuteur avec `store: false`, raisonnement faible et sortie plafonnée à 320 tokens.
4. Les deltas SSE arrivent par le transport natif `expo/fetch` et sont rendus immédiatement.
5. Le broker journalise uniquement tokens, durée et TTFT ; en cas d’échec, le crédit est remboursé.
6. Le transcript reste en mémoire, sauf consentement local explicite.

### Formation vocale

1. Le broker ouvre une session facturable courte, puis résout la voix du pays depuis un cache d’une heure.
2. Les outils Aethex sont vérifiés une fois par agent et par processus.
3. Le mobile négocie WebRTC, envoie l’audio directement au fournisseur et reçoit audio + transcription live.
4. Les tours vocaux alimentent le même canvas local que le texte.
5. Le heartbeat règle la consommation à la seconde ; la fin du fournisseur arrête aussi la facturation côté serveur.
6. Une session est limitée à cinq minutes et fermée automatiquement en cas de timeout ou redémarrage du broker.

### Évaluation

1. L’utilisateur démarre explicitement une évaluation de cinq questions.
2. Après chaque réponse, le tuteur appelle `record_assessment_answer`.
3. Une erreur remet la série consécutive à zéro.
4. `propose_passport_update` n’est accepté qu’à 5/5, avec confiance ≥ 0,70, preuve détaillée et saut maximal d’un niveau.
5. Le mobile refait les mêmes contrôles avant d’écrire le passeport chiffré.

## Audit latence et tokens

### Corrections appliquées

| Point | Avant | Après |
|---|---|---|
| Streaming texte iOS/Android | réponse JSON complète, puis animation artificielle | vrai flux SSE via `expo/fetch` |
| Contexte | résumé serveur + contexte mobile, parfois message courant dupliqué | une seule source, 6 tours et 1 200 caractères maximum |
| Sortie texte | 420 tokens, cible 180 mots | 320 tokens, cible 140 mots |
| Configuration Aethex | vérification distante des outils à chaque ouverture | vérification une fois par agent/processus |
| Catalogue vocal | nouvel appel lors de la sélection puis lors de la connexion | cache pays/langue partagé pendant une heure |
| Heartbeat vocal | intervalle relancé à chaque rendu/transcript | intervalle stable et fermeture fournisseur/facturation au démontage |
| Historique local | écriture à chaque delta | écriture chiffrée débouncée de 800 ms, opt-in |
| Assets voix | 5 PNG de 1 024 px, environ 6,4 Mo | 512 px, environ 1,5 Mo, suffisant au rendu 104 px |
| Mesure | tokens uniquement | input/output/total + durée + TTFT dans le ledger |

La baisse exacte de tokens doit être mesurée sur des conversations réelles. Sur les tours avancés, la suppression du doublon et le passage de 2 000 à 1 200 caractères de contexte peuvent raisonnablement réduire l’entrée de 20 à 45 %, selon la longueur des messages. Cette estimation n’est pas une mesure de production.

### Budget recommandé par interaction texte

- contexte conversation : 1 200 caractères maximum ;
- message courant : 4 000 caractères maximum côté API, avec une limite UX plus courte à ajouter ;
- réponse : 320 tokens maximum et 140 mots demandés ;
- raisonnement : `low` ;
- outils exposés : deux outils d’évaluation seulement ;
- stockage OpenAI : désactivé ;
- métriques à suivre : TTFT p50/p95, durée p50/p95, tokens entrée/sortie, taux d’outil, taux d’annulation et coût par minute pédagogique réussie.

## Confidentialité et sécurité

### Corrigé

- chiffrement local Encrypt-then-MAC avec IV aléatoire par valeur ;
- clé locale dans SecureStore, liée à l’appareil ;
- migration automatique des anciennes valeurs `Settings` puis effacement de celles-ci ;
- suppression du hasard `Math.random` pour identités, compétences, sels et IV ;
- authentification biométrique avec fallback code appareil ;
- historique désactivé par défaut et explicite dans le profil ;
- sessions pédagogiques et transcripts serveur déplacés du fichier disque vers une Map avec TTL de 30 minutes ;
- migration qui retire les anciens contenus pédagogiques du registre fichier ;
- permissions de notification et package sans fonction supprimés ;
- suppression locale possible même si le broker est hors ligne ;
- aucune clé Aethex ou OpenAI dans le bundle mobile.

### Bloquants restants

| Sévérité | Risque | Action requise |
|---|---|---|
| P0 | Le registre de wallet/ledger est un JSON synchrone, mono-processus et non transactionnel. | PostgreSQL, transactions, idempotency keys, verrous et migrations avant paiement réel. |
| P0 | Le header device ID est un secret pseudonyme mais pas une attestation d’application. | App Attest / Play Integrity, jeton broker court et rotation ; ne jamais considérer l’ID comme une authentification forte. |
| P0 | La non-rétention Aethex n’est pas démontrable par le code Koxmos. | DPA, configuration vérifiée, sous-traitants, région, TTL fournisseur et test contractuel. |
| P0 | Recharge Jèko sans checkout ni webhook signé. | Webhook signé, anti-rejeu, rapprochement et idempotence avant activation. |
| P1 | Secret statique du webhook outil Aethex. | Signature HMAC horodatée ou mécanisme natif du fournisseur, fenêtre anti-rejeu et rotation. |
| P1 | Aucun test automatisé fonctionnel ou E2E. | Tests du coffre, import, garde-fous, facturation, déconnexion et parcours texte↔voix. |
| P1 | Pas de pinning/allow-list réseau ni attestation de build. | Durcissement transport après stabilisation des domaines fournisseur. |
| P2 | Les erreurs locales de déchiffrement n’ont pas encore d’écran de récupération. | Écran sûr proposant import, diagnostic et purge volontaire, sans réinitialisation silencieuse. |

## Obsolescence et legacy

### Supprimé ou neutralisé

- endpoint `/v1/assessments` mort et son implémentation commentée ;
- helpers client SSE et assessment inutilisés ;
- notifications factices et permission Android associée ;
- persistance serveur des `learningSessions` ;
- configuration Aethex réappliquée à chaque conversation ;
- hypothèse « voix ivoirienne/french uniquement » ;
- stockage `Settings` en clair comme source active ;
- faux streaming mot par mot ;
- assets voix surdimensionnés.

### À migrer sans précipitation

- `gpt-5-mini` reste un choix volontairement économique pour ce tutorat bien borné. La documentation OpenAI recommande GPT-5.6 Terra comme point de départ pour de nouveaux workloads rapides, mais son prix unitaire est nettement supérieur ; ne migrer qu’après un eval comparant réussite pédagogique, TTFT, tokens et coût total ;
- Expo SDK 54 / React Native 0.81 sont en retard sur la ligne stable 2026. La montée vers SDK 57 implique React Native 0.86, React 19.2.3, Node 22.13+ et la validation de `react-native-webrtc`. Elle doit être réalisée sur une branche dédiée avec rebuild natif et tests appareils ;
- les imports `KOXMOS1` et `KOXMOS2` sont conservés uniquement pour restaurer d’anciens passeports. Fixer une date de fin, mesurer leur usage, puis supprimer les déchiffreurs non authentifiés ;
- `app/index.tsx` et `backend/server.mjs` restent des monolithes, avec des blocs UI historiques commentés dans l’écran principal. Ils doivent être découpés après gel comportemental ;
- `bootstrap-kora.mjs` et la création dynamique d’agents partagent encore des règles dupliquées. Extraire un manifeste de tuteur commun.

## Architecture cible raffinée

```text
app/
  routes/                    navigation seulement
  features/
    onboarding/              profil, consentements, permissions
    passport/                domaine, repository, import/export
    learning-canvas/         session locale texte + voix
    assessment/              machine d’état et validation locale
    tutors/                  catalogue et sélection
    wallet/                  solde et recharge
  infrastructure/
    local-vault/             chiffrement, migrations, purge
    agent-broker/            client HTTP/SSE typé
    realtime/                port + adaptateur Aethex WebRTC
  design/                    tokens, primitives et accessibilité

backend/
  src/
    http/                    routes, schémas et erreurs
    learning/                état éphémère + TTL
    text-agent/              prompt, outils et métriques
    realtime/                port fournisseur + Aethex
    billing/                 service métier + repository PostgreSQL
    identity/                attestation + jetons courts
    observability/           métriques sans contenu
  migrations/
  tests/
```

Règle structurante : les features dépendent de ports (`PassportRepository`, `TutorAgent`, `RealtimeTutor`, `BillingService`) et jamais directement d’OpenAI, Aethex, AsyncStorage ou Express. Cela rend les fournisseurs remplaçables et permet de tester le moteur pédagogique sans réseau.

## Plan de production

### Étape 1 — fiabiliser le comportement actuel

- extraire et tester la machine d’évaluation commune ;
- ajouter tests unitaires du coffre et tests contractuels API ;
- ajouter une suite E2E : onboarding → compétence → texte → voix → évaluation → export/import → suppression ;
- tester les scénarios réseau faible, interruption, solde épuisé et fermeture forcée.

### Étape 2 — rendre le broker industrialisable

- extraire les modules du monolithe ;
- PostgreSQL transactionnel pour wallets, sessions et ledger ;
- idempotence sur création/heartbeat/end/recharge ;
- attestation d’app et jetons courts ;
- webhook Jèko signé ;
- métriques p50/p95 sans texte ni audio.

### Étape 3 — mise à niveau mobile

- branche de migration Expo 54 → 57 ;
- rebuild iOS/Android et validation WebRTC ;
- vérifier taille, cold start, mémoire et accessibilité ;
- supprimer les dépendances explicites réellement inutiles après `expo install --check` ;
- retirer les blocs UI commentés et répartir les écrans par feature.

### Étape 4 — validation terrain

- matrice iPhone/Android entrée et milieu de gamme ;
- Wi-Fi, 4G, latence élevée et pertes de paquets par pays ;
- objectifs : TTFT texte p95 < 1,5 s, première réponse vocale p95 < 2 s, connexion WebRTC p95 < 3 s ;
- vérifier la progression pédagogique et le coût, pas seulement la vitesse.

## Vérifications exécutées

- `npm run type-check` : réussi ;
- `node --check backend/server.mjs` : réussi ;
- `node --check backend/scripts/bootstrap-kora.mjs` : réussi ;
- `npx expo install --check` : dépendances compatibles selon la carte locale du SDK courant (validation réseau indisponible) ;
- `npx expo export --platform ios` : bundle Metro/Hermes réussi, 2 749 modules, bundle 5,01 Mo ;
- smoke test HTTP local : health, création de session pédagogique, démarrage d’évaluation, wallet, création/heartbeat/fin de session vocale et débit à la seconde réussis ;
- audit npm hors ligne application : 0 vulnérabilité connue dans le cache local ;
- audit npm hors ligne backend : 0 vulnérabilité connue dans le cache local ;
- `git diff --check` : réussi.

L’audit npm hors ligne ne remplace pas une analyse CI connectée, un SCA continu ni un pentest.
