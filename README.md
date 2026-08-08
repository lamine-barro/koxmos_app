---
type: product-migration-plan
status: proposed
updated: 2026-08-07
source_web: ../../../KOXMOS/koxmos.com
---

# Koxmos App — migration mobile native

Ce dossier porte la migration de **Koxmos Web** vers une application iOS et Android native. La cible conserve exactement l'identité Koxmos : logo existant, design noir et blanc, typographie, composants, icônes Lucide, tuteurs et avatars.

Le principe produit est simple : **ni inscription, ni OTP, ni compte cloud**. Au premier lancement, Koxmos demande uniquement le **prénom** et le **pays**. Le profil est une identité locale liée au téléphone et protégée par son code de sécurité ou sa biométrie. Le passeport de compétences et l'historique restent exclusivement sur le téléphone, chiffrés et effaçables par la personne. Ils peuvent être exportés et importés volontairement sous forme chiffrée. Les échanges avec le tuteur vocal sont diffusés en direct vers **AethexAI** pour produire la réponse audio ; ils ne sont ni archivés par l'application ni synchronisés vers un cloud Koxmos.

Le plan exécutable, les décisions d'architecture, les phases et critères de validation sont dans [PLAN_MIGRATION.md](./PLAN_MIGRATION.md).

Le MVP inclut un passeport local protégé par le verrouillage de l'appareil, des mises à jour IA automatiques mais soumises à des garde-fous pédagogiques, un portefeuille pseudonyme et un compteur serveur à la seconde pour les sessions vocales (`100 FCFA/minute`). Le broker de facturation est délibérément limité au développement tant qu'un registre PostgreSQL transactionnel n'est pas implémenté. Le transport vocal AethexAI et le paiement Mobile Money ne doivent être activés qu'après fourniture des contrats, SDK, URLs de session, jetons courts et webhooks vérifiés des fournisseurs.

## Périmètre

- iOS et Android, application React Native bare / Expo Development Build ;
- audio bidirectionnel temps réel avec AethexAI ;
- sélecteur local de tuteur : Texte (GPT-5 mini) ou Vocal (Aethex Kora AI) ;
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

## Décision à obtenir avant l'intégration AethexAI

La promesse « rien n'est sauvegardé sur le cloud » nécessite une confirmation contractuelle et technique d'AethexAI : traitement éphémère, absence de rétention des audio/transcriptions/logs de contenu, région d'hébergement, sous-traitants et procédure de suppression. Sans cette confirmation, l'application peut promettre « aucune conservation par Koxmos », mais pas « zéro conservation chez le fournisseur vocal ».
