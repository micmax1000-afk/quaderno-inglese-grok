# Quaderno d'Inglese — V16.2

PWA personale per studiare inglese. **Streaming Gemini** + **modalità offline** per velocità.

## Novità V16.2

- **Frasi già pronte** per Ripeti e traduci (per livello e difficoltà) → zero attesa
- **Traduzioni Oxford offline** (~440 parole frequenti A1–A2) → istantanee
- Valutazione pronuncia **offline di fallback** se Gemini non risponde
- Toggle in Impostazioni: frasi offline / traduzioni offline
- Streaming Gemini solo dove serve (conversazione, tutor, parole non in dizionario)

## Funzioni

| Sezione | Offline | Gemini |
|---------|---------|--------|
| Ripeti | Frasi pronti + valutazione base | Valutazione intelligente (opzionale) |
| Oxford | Traduzioni frequenti | Solo parole non in dizionario |
| Conversazione | — | Streaming correzioni + reply |
| AI Tutor | — | Streaming testo libero |

## Uso

1. Apri `index.html` o pubblica su GitHub Pages
2. Impostazioni → API key Gemini (opzionale se usi solo offline)
3. Tieni attivi i toggle **Frasi offline** e **Traduzioni Oxford offline**

## Struttura

```
index.html
css/app.css
js/app.js
data/oxford3000.js      # lista 3000 parole
data/oxford-it.js       # traduzioni offline
data/sentences.js       # banca frasi
icons/
manifest.webmanifest
sw.js
```
