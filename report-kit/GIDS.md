# hackmywebsite.ai-rapporten maken

Deze gids zorgt dat elk scanrapport dezelfde vorm krijgt: rustig, kort en in gewone taal, met de details ingeklapt. Dat geldt of je het rapport zelf schrijft, door een AI laat schrijven of later door `report_html.mjs` laat bouwen.

## Wat er in de kit zit

| Bestand | Waarvoor |
|---|---|
| `hackmywebsite-report.css` | Alle opmaak: kleuren (licht en donker), onderdelen, animaties, telefoon, print |
| `hackmywebsite-report.js` | Risicokaart, filters, inklappen, tooltips, kopieerknoppen. Leest alles uit de HTML |
| `voorbeeld.html` | Compleet werkend rapport met verzonnen gegevens. **Dit is het sjabloon** |
| `bundle.mjs` | Voegt CSS en JS samen tot Ã©Ã©n deelbaar HTML-bestand |
| `GIDS.md` | Dit bestand: werkwijze, schrijfregels en de prompt |

## Werkwijze in vier stappen

1. **Scan draaien.** Daarna staan `findings.json` en `scan.json` in `scans/<scan-id>/`.
2. **Bron schrijven.** Kopieer `voorbeeld.html` naar `scans/<scan-id>/rapport.src.html` en zet de twee paden naar de kit op `../../report-kit/`. Vul de inhoud met de prompt hieronder, of schrijf hem zelf met de regels uit deze gids.
3. **Bundelen.**
   ```bash
   node report-kit/bundle.mjs scans/<scan-id>/rapport.src.html scans/<scan-id>/rapport.html
   ```
4. **Controleren** met de lijst onderaan. Pas daarna delen.

## De opbouw (vast, in deze volgorde)

1. **Bovenbalk:** merk, navigatie, thema en afdrukken.
2. **Kop:** het eindoordeel in maximaal acht woorden, drie korte zinnen uitleg en twee knoppen.
3. **Overzicht:** Ã©Ã©n rode melding (alleen bij kritiek of hoog), drie cijfers en een ernstbalk.
4. **Risicokaart:** wordt automatisch gebouwd uit de bevindingen.
5. **Stappenplan:** de bevindingen samengevoegd tot klussen, in drie kolommen: Vandaag, Deze week, Deze maand.
6. **Bevindingen:** Ã©Ã©n ingeklapte regel per punt. Open je een punt, dan zie je drie vragen. Het technische bewijs zit daaronder, nog een keer ingeklapt.
7. **Achtergrond:** Wat goed gaat, Grenzen, Woordenlijst en Over dit rapport. Alles ingeklapt.
8. **Volgende stap:** een donker blok met de eerste klus.

**Minder is meer.** Voeg geen extra secties, kaarten of grafieken toe. Twijfel je of iets erin moet, zet het dan in een inklapblok of laat het weg.

## Schrijven in gewone taal

Je schrijft voor een eigenaar van een website, niet voor een beveiligingsexpert. Taalniveau B1.

- **Kort.** Een zin heeft maximaal ongeveer 20 woorden. Elk antwoord bestaat uit Ã©Ã©n tot drie zinnen.
- **Concreet.** Noem wat iemand ziet en kan doen: "30 e-mailadressen van klanten", niet "PII-exposure".
- **Je-vorm en actief.** "Iedereen kan je klantenlijst lezen", niet "Er is sprake van ongeautoriseerde toegang".
- **Geen em dashes (â€”)** en geen emoji's. Gebruik een komma, een dubbele punt of een nieuwe zin.
- **Vaktermen** krijg je niet altijd weg. Zet ze dan in `<span class="term" data-term="id">` en geef ze een uitleg in de woordenlijst (`id="woord-<id>"`). In de titel van een bevinding horen geen vaktermen.
- **Eerlijk over onzekerheid.** Is iets vermoedelijk, zeg dan: "Een scanner meldt dat..., we konden dat zelf niet herhalen."
- **Niet overdrijven.** Geen woorden als "catastrofaal" of "enorm lek". De ernst blijkt uit de feiten.

### Per bevinding drie vragen

| Vraag | Wat erin staat | Voorbeeld |
|---|---|---|
| **Wat is er aan de hand?** (`data-lede`) | Wat iemand kan doen en waar, zonder jargon. Deze tekst staat ook in het zijpaneel van de kaart. | "Wie in de link het nummer met Ã©Ã©n verhoogt, ziet de bestelling van een andere klant." |
| **Wat kan er misgaan?** | Het gevolg voor het bedrijf of de klant. Noem de AVG als het om persoonsgegevens gaat. | "Iemand heeft in een paar minuten je hele klantenbestand." |
| **Wat moet er gebeuren?** | Wat er moet veranderen, en hoe je kunt testen dat het werkt. | "Test met twee accounts: B mag de bestelling van A niet zien." |

De **titel** is een uitkomst in gewone taal ("De verzendlijst van je nieuwsbrief ligt open"), geen techniek ("IDOR op /api/x"). De techniek staat in het bewijsblok: verzoek, antwoord, oorzaak, technische oplossing en Ã©Ã©n zin over de beoordeling.

### Vertaalhulp

| Scanner zegt | Rapport zegt |
|---|---|
| Broken access control, unauthenticated | Iedereen kan dit zonder inloggen |
| IDOR | Wie een nummer in de link verandert, ziet gegevens van een ander |
| PII exposure | Persoonsgegevens (e-mail, naam, adres) zijn te lezen |
| Missing rate limiting | Je kunt het eindeloos proberen, er zit geen rem op |
| Missing CSP | Een extra slot op welke scripts mogen draaien ontbreekt |
| Deprecated TLS | Oude versleuteling staat nog aan |
| Open redirect | Je site kan bezoekers doorsturen naar een vreemde site |
| SSRF | Je server laat zich gebruiken om interne adressen op te vragen |
| Information disclosure | De site verraadt interne informatie |
| Input validation | Invoer wordt niet gecontroleerd op de juiste vorm |

## Beoordelen: schade, gemak en ernst

- **Ernst** (`data-sev`): `critical` wordt `kritiek`, `high` wordt `hoog`, `medium` wordt `middel`, `low` wordt `laag` en `info` blijft `info`.
- **Schade** (`data-impact`, 1 tot 5): volgt uit de ernst. Kritiek is 5, hoog 4, middel 3, laag 2, info 1.
- **Gemak van misbruik** (`data-ease`, 1 tot 5): de vuistregel uit `report_html.mjs`:
  - Begin bij 5 voor `access-control`, `auth` en `pii`.
  - Begin bij 4 voor `injection` en `misconfig`, en bij 3 voor de rest.
  - Was er geen inlog nodig? Dan Ã©Ã©n stap hoger, tot maximaal 5. Wel inlog nodig? Dan Ã©Ã©n stap lager.
  - Is het punt vermoedelijk? Dan nog Ã©Ã©n stap lager.

  Wijk af als het bewijs daarom vraagt, bijvoorbeeld als er een script nodig is. Zet de reden in de beoordelingszin (`tech__note`).
- **Zone op de kaart** rekent de kit uit: gemak maal schade. Vanaf 20 is het direct oplossen, vanaf 12 snel, vanaf 6 inplannen, de rest rustig.
- **Nummering:** sorteer op urgentie. Eerst op zone, dan op ernst, dan op gemak. Punt 1 is wat als eerste moet.

## Het stappenplan

- Voeg punten met **dezelfde oorzaak** samen tot Ã©Ã©n klus, bijvoorbeeld drie beheerpagina's die dezelfde inlogfout hebben.
- Kolommen:
  - **Vandaag:** kritiek en hoog.
  - **Deze week:** middel, plus alles wat minder dan een uur werk is.
  - **Deze maand:** de rest.
- Per klus:
  - een titel met het werkwoord vooraan ("Zet de beheerpagina's op slot"),
  - maximaal twee zinnen,
  - de nummers die de klus oplost (`.ref`),
  - de moeite: klein, middel of groot.
- Zijn er persoonsgegevens uitgelekt, zet er dan een waarschuwing onder: kijk in de logs of iemand de gegevens al heeft opgehaald, en meld een datalek mogelijk binnen 72 uur bij de Autoriteit Persoonsgegevens.

## Privacy en veiligheid

- **Maskeer persoonsgegevens** in het bewijs: `es***@live.nl`, `J*** de V***`, `***` voor adressen. Laat aantallen staan ("30 unieke e-mailadressen").
- Geen wachtwoorden, tokens, sessiecookies of API-sleutels in het rapport, ook niet gedeeltelijk.
- Het rapport is vertrouwelijk: `noindex` blijft staan en het hoort niet op een openbare plek.

## Technische haken (voor wie de HTML bouwt)

| Haak | Betekenis |
|---|---|
| `details.finding[data-finding]` | EÃ©n bevinding, met de kenmerken `data-n`, `data-ease`, `data-impact`, `data-sev` en `data-status` (`bevestigd` of `vermoedelijk`) |
| `.finding__title`, `.where`, `[data-lede]` | Titel, plek en korte uitleg, gelezen door het zijpaneel van de kaart |
| `[data-matrix]` met `data-y-labels` en `data-x-labels` | De risicokaart. Vijf labels per as, gescheiden door een verticale streep |
| `[data-preview]` met `[data-slot]` | Het zijpaneel naast de kaart |
| `[data-open="n"]` | Knop die punt n opent en ernaartoe springt |
| `[data-filter]`, `[data-expand-all]` | Filter op ernst en alles openklappen |
| `[data-reveal]`, `[data-stagger]`, `[data-enter]` | Vervagen in beeld bij scrollen, een voor een, of bij het laden |
| `[data-count]` | Getal dat optelt |
| `.meter[data-value]` | Schaal van vijf blokjes |
| `[data-term]` met `#woord-<id>` | Vakterm met tooltip uit de woordenlijst |
| `[data-print]` | Afdrukken. Alle inklapblokken gaan eerst open |
| `.code-wrap > pre.code` | Bewijs met kopieerknop. Kleuren: `c-bad`, `c-ok`, `c-key`, `c-mute` |

## Prompt om een rapport te laten schrijven

Kopieer dit blok naar een AI-assistent. Voeg `voorbeeld.html`, `GIDS.md`, `findings.json` en `scan.json` toe.

```text
Je schrijft een beveiligingsrapport in het Nederlands voor de eigenaar van een website.
Die persoon is geen beveiligingsexpert. Schrijf op taalniveau B1.

Bronnen:
- findings.json: de bevindingen (title, severity, status, category, request,
  response, evidence, impact, rootCause, fix)
- scan.json: gegevens van de scan (url, startedAt, endedAt, steps, spentUsd)
- voorbeeld.html: het sjabloon. Neem de structuur, klassen en data-kenmerken
  exact over.
- GIDS.md: de regels voor taal, beoordeling, stappenplan en privacy.

Lever Ã©Ã©n bestand op: rapport.src.html, gebaseerd op voorbeeld.html, met:
1. Een eindoordeel van maximaal acht woorden in de h1, met drie korte zinnen
   eronder.
2. Per bevinding een details.finding met de juiste data-n, data-ease,
   data-impact, data-sev en data-status. Volg de vuistregels uit GIDS.md.
   Nummer de bevindingen op urgentie.
3. Per bevinding de drie vragen in gewone taal, met elk Ã©Ã©n tot drie zinnen.
   Het technische bewijs komt in .tech: verzoek, antwoord, oorzaak,
   technische oplossing en Ã©Ã©n beoordelingszin.
4. Een stappenplan waarin punten met dezelfde oorzaak zijn samengevoegd tot
   klussen, verdeeld over Vandaag, Deze week en Deze maand.
5. Wat goed ging, de grenzen van de test, een woordenlijst met een item voor
   elke data-term, en Over dit rapport met de scangegevens.
6. Kloppende aantallen in de cijfers, de ernstbalk, de filters en de knoppen.

Harde regels:
- Nooit een em dash (â€”) en nooit emoji's.
- Maskeer elk e-mailadres, elke naam en elk adres in het bewijs (es***@live.nl).
  Neem geen wachtwoorden, tokens of cookies op.
- Geen vaktermen in titels. Elke vakterm in lopende tekst krijgt een
  data-term met een uitleg in de woordenlijst.
- Verzin niets. Staat iets niet in de bronnen, laat het dan weg.
  Vermoedelijke punten noem je eerlijk vermoedelijk.
- Voeg geen secties, kaarten of grafieken toe die niet in voorbeeld.html
  staan. Minder is meer.

Geef daarna een lijst van wat je hebt samengevoegd of weggelaten, en waarom.
```

## Controlelijst voor je deelt

- [ ] Geen em dash: `grep -c "â€”" rapport.html` geeft 0.
- [ ] Geen volledige e-mailadressen, namen of adressen in het bewijs, alleen gemaskeerde.
- [ ] Elke `data-term` heeft een `id="woord-..."` in de woordenlijst.
- [ ] De aantallen kloppen: kop, cijfers, ernstbalk, filters, "Alle N bevindingen" en het stappenplan.
- [ ] Elke `.ref` en elke `data-open` wijst naar een bestaand punt.
- [ ] Geopend op een telefoon: niets schuift horizontaal.
- [ ] Afdrukvoorbeeld: alles klapt open en de bovenbalk verdwijnt.
