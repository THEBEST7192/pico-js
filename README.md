# pico-js

Lokal multiplayer puslespill platformer med innebygd nivåredigering i nettleseren.

## Nettleser-API-er

Oversikt over nettleser-API brukt i prosjektet:

- **Gamepad API**
  - **Prosess:** Bruker polling via `navigator.getGamepads()` 60 ganger i sekundet for å fange opp input. Implementert med støtte for opptil 4 spillere i [Game.ts](src/game/Game.ts).
  - **Funksjon:** Mapper styrespaker til bevegelse og knapper til handlinger (hopp/bær). Håndterer dynamisk ut- og innkobling av kontrollere ved å matche ID og indeks.
- **LocalStorage API**
  - Lagrer nivådata som JSON-strenger lokalt i nettleseren slik at fremgang bevares ved oppdatering av siden.
- **File, Blob og URL API**
  - Brukes i [App.tsx](src/App.tsx) for import og eksport av nivåfiler. `Blob` og `URL.createObjectURL` genererer nedlastbare filer, mens `file.text()` leser opplastede filer.

## Skripter

Utviklingsmodus
- npm run dev

Bygg (Build)
- npm run build

Linting
- npm run lint

Fiks lint-feil
- npm run ling

## Ressurser

Designressurser brukt i prosjektet er lisensiert under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Grafikk

**[Xbox Controller Icons Free](https://www.figma.com/community/file/1271153059120916114/xbox-controller-icons-free)**
- **Skaper:** [Alric Monteiro](https://www.figma.com/@alricmonteiro)
- **Lisens:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Link:** [Fil på Figma Community](https://www.figma.com/community/file/1271153059120916114)

**[PlayStation Controller Icons](https://www.figma.com/community/file/968584708653901737/playstation-controller-icons)**
- **Skaper:** [Antoine Plu](https://www.figma.com/@antoineplu)
- **Lisens:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Link:** [Fil på Figma Community](https://www.figma.com/community/file/968584708653901737)