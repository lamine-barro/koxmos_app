# Audit d’architecture Koxmos

Date : 9 août 2026 · périmètre : application mobile, broker Node, passeport local, évaluation et facturation.

## Architecture active

```text
Passeport local chiffré → session pédagogique éphémère
                              ├─ texte : OpenAI via le broker
                              └─ voix : OpenAI Realtime / WebRTC
                                      ├─ secret éphémère créé par le broker
                                      ├─ audio direct mobile → OpenAI
                                      └─ outils Koxmos validés par le broker
```

Le passeport reste sur le téléphone. Le broker garde seulement un résumé borné en mémoire pour la continuité, puis le purge. Le modèle ne peut proposer une évolution de niveau qu’après cinq réponses réussies ; le backend valide cette proposition avant toute écriture locale.

## Points forts

- audio direct WebRTC : pas de proxy audio Koxmos, donc moins de latence et de bande passante serveur ;
- clé OpenAI permanente uniquement sur le backend ;
- sessions limitées à cinq minutes, facturation serveur à la seconde ;
- agrégats de tokens Realtime journalisés sans audio ni transcript ;
- trois tuteurs bilingues et avatars locaux versionnés.

## Risques à traiter avant facturation à grande échelle

1. Remplacer le registre fichier par PostgreSQL transactionnel et des webhooks de paiement vérifiés.
2. Distribuer le nouveau binaire mobile avant de basculer le backend vocal en production.
3. Mesurer cinquante appels réels avant de confirmer 100 FCFA/minute comme tarif durable.
4. Ajouter des tests E2E sur réseau lent, interruption, solde nul et évaluation vocale.
5. Vérifier la politique de conservation applicable au compte OpenAI avant toute promesse publique de non-rétention fournisseur.
