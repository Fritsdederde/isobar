# Isobar

Eigen weerapp van Ray. Combineert zes weermodellen tot één verwachting en laat zien hoe zeker die is.

## Wat de app doet
- **Nu**: temperatuur, weerpraatje, regen per kwartier (2 uur), per uur (48 uur).
- **Buiten**: kies een dag en Fietsen, Wandelen, MTB of Paarden → cijfer (1–10) en een kort praatje. Paarden en MTB wegen kou, wind, gevoelstemperatuur, regen en drassigheid (regen van de 7 dagen ervoor).
- **14 dagen**: min/max per dag. Strak getekend = modellen eens, wazig = onzeker.
- **6 weken**: trend voor temperatuur, neerslag en wind, met spreiding en normaal.
- **Terugkijken**: mm regen per dag (7 dagen en 4 weken), tegenover normaal en vorig jaar.
- **Modellen**: de zes modellen naast elkaar en "Wie had gelijk?" (weegt mee in het gemiddelde).
- **Achtergrond**: echte luchtdrukkaart (isobaren, H/L). Beweegt mee met scrollen; knop "Kaart" voor de volledige kaart met tijdschuif.

## Bestanden
| Bestand | Inhoud |
|---|---|
| `index.html`, `style.css` | pagina en vormgeving |
| `js/data.js` | ophalen, bewaren en middelen van de modellen |
| `js/text.js` | weerpraatje, grote lijn, activiteitenscores |
| `js/map.js` | de weerkaart (canvas) |
| `js/geo.js` | kustlijnen en landsgrenzen van Europa (Natural Earth) |
| `js/ui.js` | de schermen |
| `sw.js`, `manifest.webmanifest`, `icons/` | maakt er een app van op de telefoon |
| `test/test_mock.py` | test op iPhone-formaat met nagebootste data (Playwright) |

## Data
Alles komt gratis en zonder sleutel van [Open-Meteo](https://open-meteo.com) (CC BY 4.0):
KNMI Harmonie, ICON, ECMWF, GFS, Météo-France, UKMO; zes weken: ECMWF EC46 + GFS-ensemble;
normaal: 10 jaar archief; "wie had gelijk": Previous Runs API. Geen eigen server nodig.

## Bijwerken
Vraag Claude om een aanpassing in deze map. Staat de app op GitHub Pages, dan moet de nieuwe
versie daarna nog online gezet worden; verhoog dan ook `VERSION` in `sw.js`.

## Scores aanpassen
De weging staat in `js/text.js`: `W.fiets`, `W.wandel`, `W.bodem` en het blok `soort === 'paard'` in `W.activiteit`.
