# Économie vocale OpenAI Realtime

Le prix public Koxmos est **100 FCFA/minute**. Le modèle par défaut est [`gpt-realtime-2.1-mini`](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) : audio entrant `$10 / 1M tokens`, audio sortant `$20 / 1M tokens`, texte entrant `$0.60 / 1M` et texte sortant `$2.40 / 1M`.

## Calcul opérationnel

Pour un taux de change de travail `1 USD = 600 FCFA` (à remplacer par le taux comptable réellement payé), le coût fournisseur d’une session est :

```text
coût FCFA = 0,006 × tokens audio entrants
           + 0,012 × tokens audio sortants
           + 0,00036 × tokens texte entrants
           + 0,00144 × tokens texte sortants
```

La marge avant infrastructure, paiement, support et taxes est :

```text
100 × minutes facturées − coût OpenAI FCFA
```

## Décision économique

Le tarif de 100 FCFA/minute est **viable seulement si le coût OpenAI moyen reste sous 40–50 FCFA/minute**. Cela laisse 50–60 FCFA pour VPS, paiement, taxes, support et marge. Il n’est pas prudent de l’affirmer avant des appels réels : les tarifs OpenAI sont par tokens audio, pas par minute ; le ratio parole utilisateur / parole tuteur change donc fortement le coût.

Le code enregistre désormais, sans texte ni audio, les agrégats `response.usage` de chaque réponse Realtime dans le ledger `openai_realtime`. Après 50 appels réels, calcule :

```text
coût moyen/min = somme(coût OpenAI par session) / somme(minutes facturées)
```

Seuils :

- ≤ 35 FCFA/min : 100 FCFA/min est sain pour un pilote.
- 35–50 FCFA/min : prix possible, mais marge fragile ; limiter les réponses du tuteur.
- > 50 FCFA/min : remonter à 150 FCFA/min, réduire la parole du tuteur, ou réserver la voix aux offres premium.

Les sessions Koxmos sont plafonnées à cinq minutes, les réponses sont courtes et le VAD sémantique réduit les tours inutiles : ce sont les trois contrôles qui protègent le mieux ce modèle économique.
