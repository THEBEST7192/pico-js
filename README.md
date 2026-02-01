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
