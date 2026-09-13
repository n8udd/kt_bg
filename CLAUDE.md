# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static Kill Team build-guide site. No build step, no package manager, no tests. Designed to be served as static files (e.g. GitHub Pages).

## Running locally

The `fetch()` calls in `script.js` require HTTP — opening `index.html` directly as a `file://` URL will fail. Serve with Docker Compose from the project root (nothing is installed on the host):

    docker compose up -d        # site at http://localhost:8020
    docker compose down

PDF tools (pdftotext, pdfplumber) live in the `tools` container and run on demand:

    docker compose run --rm tools pdftotext -layout pdf/<file>.pdf -
    docker compose run --rm tools python -c "import pdfplumber; ..."

## Architecture

`index.html` loads Alpine.js and the Tailwind Play CDN (theme config is inline in `index.html`) and mounts a single `x-data="kt"` component defined in `script.js`. On init, the component fetches `data/teams.json` (an index of team shortcode keys), then fetches each `data/teams/<key>.json` in parallel. All rendering is done client-side via Alpine.js directives — there is no server-side logic.

### Data model

**`data/teams.json`** — index file listing which team JSON files to load (array of filenames without `.json`, in dropdown order).

**`data/teams/<key>.json`** — one file per kill team. Top-level fields:
- `key` — unique team id; the dropdown `<option>` value and the selector for which section is visible. Should match the filename.
- `name` — label shown in the dropdown
- `subtitle` — small line above the intro (errata date, loadout count)
- `intro` — plain text shown above the table (rendered with `x-text`, so HTML is shown literally)
- `footnotes_html` — HTML shown below the table (rendered with `x-html`). `<span class="marker">` is styled only inside this block.
- `faction_rules` / `strategy_ploys` / `firefight_ploys` / `equipment` — arrays of `{name, text}` (plain text) rendered as panels below the table; a panel is hidden when its array is missing or empty
- `max_shooting` / `max_melee` — controls how many weapon-group columns the table has; must equal the maximum number of weapons of each type any single loadout has
- `loadouts` — ordered array of loadout objects, one per physical model build; multiple loadouts with the same `operative` name are grouped into a rowspanned operative cell
- `operatives` — map from operative name to stat block (`apl`, `move`, `save`, `wounds` as integers, plus `abilities`: array of `{name, tag?, text}` where `text` is HTML); powers the click-to-open modal. An operative with no entry renders without the ⓘ button.

Loadout fields:
- `operative` — must match a key in `operatives`; loadouts for the same operative must be consecutive
- `weapons[]` — `{name, type, profiles, abilities?}`. `type` is `"shooting"` or `"melee"` (anything other than `"melee"` is treated as shooting). Optional `abilities` (`{name, tag?, text}`) adds an ⓘ button that opens the weapon modal, which shows the first weapon in the team with that `name` that has abilities.
- `profiles[]` — `{atk, hit, normal_dmg, crit_dmg, rules, name?}`; `name` labels the profile on multi-profile weapons. See Damage and hit format.
- `note` — optional plain-text string (HTML-escaped)

**`data/teams/template_team.json`** — the reference schema, using placeholder values to describe each field (JSON has no comments). It doesn't show weapon-level `abilities`; see `aod.json` for that. It isn't listed in `teams.json`, so it never appears on the site. Use it when adding a new team.

### Table rendering (`script.js`)

`allSubRows(team)` flattens all loadouts into a single array of `{cells, cls}` objects consumed by the `x-for` in the template. The key complexity:

- Weapons are split into shooting/melee slots and padded with `null` up to `max_shooting`/`max_melee`. This means slot order is always all shooting then all melee, regardless of declaration order in `weapons[]`.
- Within a loadout, the number of sub-rows (`loadoutHeight`) equals the max profile count across all weapons in that loadout.
- A weapon's name cell rowspans the full loadout height; its profile cells rowspan from their index to the bottom of the loadout (the last profile expands to fill remaining sub-rows).
- The operative name cell rowspans across all consecutive loadouts that share the same `operative` string (`operativeSubrowSpan`).
- The `note` field on a loadout renders as a `↳` annotation inside the rules cell of the last profile of the weapon declared last in `weapons[]` (declaration order, not column order).

### Adding a new team

1. Create `data/teams/<shortcode>.json` using `data/teams/template_team.json` as the schema.
2. Add the shortcode to the `teams` array in `data/teams.json`.
3. Verify `max_shooting` and `max_melee` match the widest loadout in the file.

### Damage and hit format

Each profile stores damage as two integer fields, `normal_dmg` and `crit_dmg` (e.g. `"normal_dmg": 3, "crit_dmg": 5`), which `script.js` renders as `3/5` in the Dmg column. There is no combined `dmg` string — a profile that uses one renders as `/`. `hit` is also a bare integer; the `+` is added at render time, so write `"hit": 3`, not `"3+"`.

Weapon range is a rule string in `rules`, written as `"Range 8\""` (never `Rng`), matching the rules PDFs.
