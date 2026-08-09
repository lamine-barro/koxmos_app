---
type: product-migration-plan
status: proposed
updated: 2026-08-07
source_web: ../../../KOXMOS/koxmos.com
---

# Koxmos App — migration mobile native

Ce dossier porte la migration de **Koxmos Web** vers une application iOS et Android native. La cible conserve exactement l'identité Koxmos : logo existant, design noir et blanc, typographie, composants, icônes Lucide, tuteurs et avatars.

Le principe produit est simple : **ni inscription, ni OTP, ni compte cloud**. Au premier lancement, Koxmos demande uniquement le **prénom** et le **pays**. Le profil est une identité locale liée au téléphone et protégée par son code de sécurité ou sa biométrie. Le passeport de compétences et l'historique restent exclusivement sur le téléphone, chiffrés et effaçables par la personne. Les échanges vocaux passent directement entre l’application et **OpenAI Realtime** via WebRTC, avec un secret éphémère créé par le broker Koxmos ; le broker ne relaie ni audio ni transcript.

Le plan exécutable, les décisions d'architecture, les phases et critères de validation sont dans [PLAN_MIGRATION.md](./PLAN_MIGRATION.md).

L’architecture effectivement auditée, le workflow multimodal texte ↔ voix, les optimisations appliquées et les risques de production sont documentés dans [ARCHITECTURE_AUDIT.md](./ARCHITECTURE_AUDIT.md). `PLAN_MIGRATION.md` reste un document cible historique : en cas d’écart, l’audit décrit l’état réel du code.

Le MVP inclut un passeport local protégé par le verrouillage de l'appareil, des mises à jour IA automatiques mais soumises à des garde-fous pédagogiques, un portefeuille pseudonyme et un compteur serveur à la seconde pour les sessions vocales (`100 FCFA/minute`). Le broker de facturation est délibérément limité au développement tant qu'un registre PostgreSQL transactionnel n'est pas implémenté.

## Périmètre

- iOS et Android, application React Native bare / Expo Development Build ;
- audio bidirectionnel temps réel avec OpenAI Realtime ;
- sélecteur local de tuteur : Texte (GPT-5.6 Luna) ou Vocal (GPT-Realtime-2.1 mini) ;
- onboarding minimal : prénom et pays uniquement ;
- identité locale liée au téléphone, déverrouillée avec le code système ou la biométrie ;
- passeport, progression, préférences et transcriptions optionnelles chiffrés localement ;
- export et import manuels de passeports chiffrés, sans synchronisation cloud ;
- même expérience que `BUSINESS/KOXMOS/koxmos.com`, adaptée aux gestes et contraintes mobiles ;
- aucune base de données produit, analytique nominative ou sauvegarde de conversation côté Koxmos.

## Hors périmètre initial

- compte cloud, synchronisation automatique multi-appareils et récupération à distance ;
- recharge/paiement in-app avant clarification de son modèle local-first ;
- enregistrement audio, partage automatique ou sauvegarde distante des conversations.

## Confidentialité fournisseur vocal

La promesse produit doit rester exacte : Koxmos ne conserve pas l’audio. Toute affirmation sur la rétention par le fournisseur vocal dépend des réglages et engagements contractuels OpenAI applicables au compte ; elle doit être validée avant publication.
