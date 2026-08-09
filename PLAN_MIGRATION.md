# Plan de livraison Koxmos

## Cible

Application iOS/Android local-first : passeport chiffré, tuteurs avec avatars locaux, texte OpenAI et conversation vocale OpenAI Realtime.

## Chemin de livraison

1. Construire et tester le binaire mobile qui contient `core/realtime.ts`.
2. Tester les trois tuteurs bilingues sur appareils physiques, Wi-Fi et 4G.
3. Déployer la release backend OpenAI Realtime avec les variables `OPENAI_API_KEY`, `OPENAI_MODEL` et `OPENAI_REALTIME_MODEL`.
4. Contrôler les erreurs, latences, interruptions, crédits débités et agrégats de tokens pendant un pilote fermé.
5. Confirmer le prix après cinquante conversations réelles puis ouvrir la facturation.

## Garde-fous non négociables

- pas de clé OpenAI dans l’application ;
- pas d’enregistrement audio Koxmos ;
- passeport et historique sous contrôle local de la personne ;
- évolution du passeport soumise aux règles pédagogiques du backend ;
- paiement réel interdit tant que le registre transactionnel et le webhook signé ne sont pas disponibles.
