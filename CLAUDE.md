# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static Kill Team build-guide site. No build step, no package manager, no tests. Designed to be served as static files (e.g. GitHub Pages).

## Running locally

The `fetch()` calls in `script.js` require HTTP — opening `index.html` directly as a `file://` URL will fail. Serve from the project root:

Use the VS Code Live Server extension — right-click `index.html` and select **Open with Live Server**.

## Architecture

`index.html` loads Alpine.js from CDN and mounts a single `x-data="kt"` component defined in `script.js`. On init, the component fetches `teams.json` (an index of team shortcode keys), then fetches each `teams/<key>.json` in parallel. All rendering is done client-side via Alpine.js directives — there is no server-side logic.

### Data model

**`data/teams.json`** — index file listing which team JSON files to load (array of shortcode keys).

**`data/teams/<key>.json`** — one file per kill team. Top-level fields:
- `key` — shortcode used in the dropdown and for the filename
- `max_shooting` / `max_melee` — controls how many weapon-group columns the table has; must equal the maximum number of weapons of each type any single loadout has
- `loadouts` — ordered array of loadout objects, one per physical model build; multiple loadouts with the same `operative` name are grouped into a rowspanned operative cell
- `operatives` — map from operative name to stat block (apl, move, save, wounds, abilities); powers the click-to-open modal

**`teams/template_team.json`** — the canonical schema showing every supported field with inline comments. Use this when adding a new team.

### Table rendering (`script.js`)

`allSubRows(team)` flattens all loadouts into a single array of `{cells, cls}` objects consumed by the `x-for` in the template. The key complexity:

- Weapons are split into shooting/melee slots and padded with `null` up to `max_shooting`/`max_melee`. This means slot order is always all shooting then all melee, regardless of declaration order in `weapons[]`.
- Within a loadout, the number of sub-rows (`loadoutHeight`) equals the max profile count across all weapons in that loadout.
- A weapon's name cell rowspans the full loadout height; its profile cells rowspan from their index to the bottom of the loadout (the last profile expands to fill remaining sub-rows).
- The operative name cell rowspans across all consecutive loadouts that share the same `operative` string (`operativeSubrowSpan`).
- The `note` field on a loadout renders as a `↳` annotation inside the rules cell of the last profile of the last weapon.

### Adding a new team

1. Create `teams/<shortcode>.json` using `teams/template_team.json` as the schema.
2. Add the shortcode to the `teams` array in `teams.json`.
3. Verify `max_shooting` and `max_melee` match the widest loadout in the file.

### Damage format

Weapon profiles use `"dmg": "normal/crit"` (e.g. `"3/5"`). The template shows `normal_dmg`/`crit_dmg` as separate fields — the actual team files use the combined `dmg` string. Use the combined format.
