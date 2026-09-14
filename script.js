// Kill Team build guides — Alpine.js component.
// Reads teams.json (index of team keys), then fetches one <key>.json per team
// alongside index.html. Designed to be served as static files (GitHub Pages).

// Heroicons "information-circle" (outline) for the ⓘ buttons. Uses currentColor,
// so .op-info / .weapon-info control its colour and hover state.
const INFO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-full h-full" aria-hidden="true">'
  + '<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />'
  + '</svg>';

document.addEventListener('alpine:init', () => {
  Alpine.data('kt', () => ({
    data: { teams: [] },
    selectedKey: '',
    loading: true,
    error: '',
    openOperative: null,
    openWeapon: null,
    theme: 'system',

    async init() {
      this.initTheme();

      // ESC closes the modal.
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (this.openOperative) this.openOperative = null;
          if (this.openWeapon) this.openWeapon = null;
        }
      });

      try {
        const idxRes = await fetch('data/teams.json', { cache: 'no-cache' });
        if (!idxRes.ok) throw new Error(`data/teams.json → HTTP ${idxRes.status}`);
        const idx = await idxRes.json();
        const keys = (idx && Array.isArray(idx.teams)) ? idx.teams : [];
        if (!keys.length) throw new Error('teams.json had no teams[] entries');

        const fetched = await Promise.all(keys.map(async k => {
          const r = await fetch(`data/teams/${k}.json`, { cache: 'no-cache' });
          if (!r.ok) throw new Error(`data/teams/${k}.json → HTTP ${r.status}`);
          return r.json();
        }));

        this.data = { teams: fetched };
        this.selectedKey = fetched[0]?.key || '';
      } catch (e) {
        this.error = e.message || String(e);
      } finally {
        this.loading = false;
      }
    },

    // Modal handling — event delegation off the team section.
    handleOpClick(e) {
      const opLabel = e.target.closest('.op-label');
      if (opLabel) {
        const team = this.data.teams.find(t => t.key === this.selectedKey);
        if (!team?.operatives) return;
        const data = team.operatives[opLabel.dataset.op];
        if (!data) return;
        this.openOperative = { name: opLabel.dataset.op, ...data };
        return;
      }
      const weaponLabel = e.target.closest('.weapon-label');
      if (weaponLabel) {
        const team = this.data.teams.find(t => t.key === this.selectedKey);
        if (!team) return;
        const name = weaponLabel.dataset.weapon;
        for (const loadout of team.loadouts) {
          for (const w of (loadout.weapons || [])) {
            if (w.name === name && w.abilities?.length) {
              this.openWeapon = { name, abilities: w.abilities };
              return;
            }
          }
        }
      }
    },

    // Theme: 'light' | 'dark' | 'system'. The inline <head> script applies the saved
    // choice before first paint; these keep the toggle and the <html> class in sync.
    initTheme() {
      let saved = 'system';
      try { saved = localStorage.getItem('kt-theme') || 'system'; } catch (e) {}
      this.theme = ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
      this.applyTheme();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.theme === 'system') this.applyTheme();
      });
    },

    setTheme(theme) {
      this.theme = theme;
      try { localStorage.setItem('kt-theme', theme); } catch (e) {}
      this.applyTheme();
    },

    applyTheme() {
      const dark = this.theme === 'dark'
        || (this.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    },

    closeOperative() { this.openOperative = null; },
    closeWeapon() { this.openWeapon = null; },

    htmlEscape(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    // Approx 200px for the operative column + 590px per weapon column group
    // (name + profile + atk + dmg + rules).
    tableStyle(team) {
      const cols = (team.max_shooting || 0) + (team.max_melee || 0);
      return `min-width: ${200 + cols * 640}px`;
    },

    // Build header cells from per-team max counts.
    headerCells(team) {
      const cells = [{ text: 'Operative', cls: '' }];
      for (let i = 0; i < (team.max_shooting || 0); i++) {
        cells.push({ text: 'Shooting ' + (i + 1), cls: 'border-l border-l-accent-dim pl-[14px]' });
        cells.push({ text: 'Profile',             cls: 'text-left w-[100px]' });
        cells.push({ text: 'Atk',                 cls: 'text-center w-[50px]' });
        cells.push({ text: 'Hit',                 cls: 'text-center w-[50px]' });
        cells.push({ text: 'Dmg',                 cls: 'text-center w-[60px]' });
        cells.push({ text: 'Rules',               cls: '' });
      }
      for (let i = 0; i < (team.max_melee || 0); i++) {
        cells.push({ text: 'Melee ' + (i + 1), cls: 'text-melee border-l border-l-melee/40 pl-[14px]' });
        cells.push({ text: 'Profile',          cls: 'text-left w-[100px]' });
        cells.push({ text: 'Atk',              cls: 'text-center w-[50px]' });
        cells.push({ text: 'Hit',              cls: 'text-center w-[50px]' });
        cells.push({ text: 'Dmg',              cls: 'text-center w-[60px]' });
        cells.push({ text: 'Rules',            cls: '' });
      }
      return cells;
    },

    // Name cell with shooting/melee type badge.
    nameCellHtml(weapon) {
      const type = weapon.type || 'shooting';
      const badge = type === 'melee' ? 'M' : 'S';
      const badgeBase = 'inline-block font-display text-[9px] tracking-[0.1em] uppercase py-px px-[5px] rounded-sm mr-2 align-[1px] min-w-[14px] text-center';
      const badgeCls = type === 'melee'
        ? badgeBase + ' bg-melee/[0.12] text-melee'
        : badgeBase + ' bg-accent/[0.18] text-accent';
      const badgeHtml = '<span class="' + badgeCls + '" title="' + type + '">' + badge + '</span>';
      const nameEscaped = this.htmlEscape(weapon.name);
      if (weapon.abilities && weapon.abilities.length) {
        return '<span class="weapon-label" data-weapon="' + nameEscaped + '">'
          + badgeHtml + nameEscaped
          + '<span class="weapon-info" aria-label="Weapon details">' + INFO_ICON + '</span>'
          + '</span>';
      }
      return badgeHtml + nameEscaped;
    },

    // APL / Move / Save / Wounds row shown under the operative name.
    // Stats are stored as integers, so the " and + suffixes are added here.
    opStatsHtml(op) {
      const withSuffix = (v, suffix) => (typeof v === 'number' ? v + suffix : v);
      const stats = [
        ['APL', op.apl],
        ['Move', withSuffix(op.move, '"')],
        ['Save', withSuffix(op.save, '+')],
        ['Wounds', op.wounds],
      ];
      return '<div class="flex gap-3 mt-1.5">'
        + stats.map(([label, value]) =>
            '<div class="flex flex-col">'
              + '<span class="font-display text-[9px] text-accent tracking-[0.12em]">' + label + '</span>'
              + '<span class="font-mono font-semibold text-[12px] text-ink tracking-normal">' + this.htmlEscape(value) + '</span>'
            + '</div>'
          ).join('')
        + '</div>';
    },

    // Max profile count across the weapons in this loadout (min 1).
    loadoutHeight(loadout) {
      const profileCounts = (loadout.weapons || []).map(w => (w.profiles || []).length || 1);
      return profileCounts.length ? Math.max(1, ...profileCounts) : 1;
    },

    // Total profile sub-rows for all consecutive loadouts of this operative starting at idx.
    operativeSubrowSpan(team, idx) {
      const loadouts = team.loadouts;
      const op = loadouts[idx].operative;
      let total = 0;
      for (let i = idx; i < loadouts.length && loadouts[i].operative === op; i++) {
        total += this.loadoutHeight(loadouts[i]);
      }
      return total;
    },

    // Render one profile's rules cell content (single profile, not stacked).
    rulesForProfile(profile) {
      const r = profile.rules || [];
      return r.length ? r.map(x => this.htmlEscape(x)).join(', ') : '—';
    },

    // Generate sub-rows for one loadout. Each weapon's profiles get their own sub-row; the
    // weapon NAME cell rowspans the full loadout height (max profile count across the loadout's
    // weapons). For weapons with fewer profiles than the loadout height, the *last* profile's
    // cells rowspan downward to fill the remaining sub-rows.
    subRowsFor(team, loadoutIdx) {
      const loadouts = team.loadouts;
      const loadout = loadouts[loadoutIdx];

      // Split weapons by type and pad with nulls up to the team's max slot counts.
      const weapons = loadout.weapons || [];
      const shooting = [];
      const melee = [];
      weapons.forEach((w, i) => {
        const entry = { weapon: w, origIdx: i };
        if (w.type === 'melee') melee.push(entry);
        else shooting.push(entry);
      });
      while (shooting.length < (team.max_shooting || 0)) shooting.push(null);
      while (melee.length < (team.max_melee || 0)) melee.push(null);
      const slots = [...shooting, ...melee];

      const N = this.loadoutHeight(loadout);
      const isFirstOfOperative = loadoutIdx === 0
        || loadouts[loadoutIdx - 1].operative !== loadout.operative;
      const opRowspan = isFirstOfOperative ? this.operativeSubrowSpan(team, loadoutIdx) : 0;

      // Note attaches to whichever weapon was last in the original loadout.weapons array.
      const note = loadout.note || null;
      const noteOnIdx = weapons.length - 1;

      const opCellCls = 'bg-head border-r-2 border-r-accent font-display text-[14px] tracking-[0.04em] uppercase text-ink whitespace-nowrap w-[200px]';
      const wnameCls  = 'font-mono text-xs text-ink border-l border-l-rule pl-[14px] font-medium whitespace-nowrap';
      const wprofileCls = 'font-sans text-xs text-ink font-medium w-[100px]';
      const wattkCls  = 'font-mono font-semibold text-center text-ink w-[50px]';
      const whitCls   = 'font-mono font-semibold text-center text-ink w-[50px]';
      const wdmgCls   = 'font-mono font-semibold text-center text-ink w-[60px]';
      const wrulesCls = 'text-ink-dim text-xs';

      const emptyBase = 'font-mono text-ink-empty text-center';
      const wnameEmptyCls   = emptyBase + ' text-xs border-l border-l-rule pl-[14px] whitespace-nowrap';
      const wprofileEmptyCls = emptyBase + ' w-[100px]';
      const wattkEmptyCls   = emptyBase + ' w-[50px]';
      const whitEmptyCls    = emptyBase + ' w-[50px]';
      const wdmgEmptyCls    = emptyBase + ' w-[60px]';
      const wrulesEmptyCls  = emptyBase + ' text-xs';

      const subRows = [];
      for (let i = 0; i < N; i++) {
        const cells = [];
        let cls = '';

        // Operative cell only on the first sub-row of the first loadout of a new operative.
        if (i === 0 && isFirstOfOperative) {
          cls = 'new-op';
          const opName = loadout.operative;
          const opData = team.operatives && team.operatives[opName];
          const escaped = this.htmlEscape(opName);
          // The pop-up only lists abilities, so the ⓘ button is only offered when there are some.
          const nameHtml = opData && opData.abilities && opData.abilities.length
            ? '<span class="op-label" data-op="' + escaped + '">'
                + escaped
                + '<span class="op-info" aria-label="Operative abilities">' + INFO_ICON + '</span>'
              + '</span>'
            : escaped;
          const opHtml = nameHtml + (opData ? this.opStatsHtml(opData) : '');
          cells.push({
            cls: opCellCls,
            html: opHtml,
            rowspan: opRowspan,
          });
        }

        for (let s = 0; s < slots.length; s++) {
          const entry = slots[s];

          if (!entry) {
            // Empty weapon slot: emit 5 dashes on the first sub-row, rowspanned to fill.
            if (i === 0) {
              cells.push({ cls: wnameEmptyCls,    html: '—', rowspan: N });
              cells.push({ cls: wprofileEmptyCls, html: '—', rowspan: N });
              cells.push({ cls: wattkEmptyCls,    html: '—', rowspan: N });
              cells.push({ cls: whitEmptyCls,     html: '—', rowspan: N });
              cells.push({ cls: wdmgEmptyCls,     html: '—', rowspan: N });
              cells.push({ cls: wrulesEmptyCls,   html: '—', rowspan: N });
            }
            continue;
          }

          const weapon = entry.weapon;
          const X = (weapon.profiles || []).length || 1;

          // Weapon NAME cell on first sub-row only, rowspanning all profile sub-rows.
          if (i === 0) {
            cells.push({ cls: wnameCls, html: this.nameCellHtml(weapon), rowspan: N });
          }

          // Emit profile cells if profile i exists for this weapon.
          if (i < X) {
            const profile = weapon.profiles[i];
            // Last profile of a short weapon expands downward to fill remaining sub-rows.
            const profileRowspan = (i === X - 1) ? (N - i) : 1;
            const profileName = profile.name ? this.htmlEscape(profile.name) : '—';
            let rulesHtml = this.rulesForProfile(profile);
            if (note && entry.origIdx === noteOnIdx && i === X - 1) {
              rulesHtml += '<div class="mt-1 py-1 px-2 border-l-2 border-l-accent bg-accent/[0.06] text-ink text-[11.5px] italic">↳ ' + this.htmlEscape(note) + '</div>';
            }
            const dmgHtml = this.htmlEscape(profile.normal_dmg) + '/' + this.htmlEscape(profile.crit_dmg);
            cells.push({ cls: wprofileCls, html: profileName,                        rowspan: profileRowspan });
            cells.push({ cls: wattkCls,    html: this.htmlEscape(profile.atk),       rowspan: profileRowspan });
            cells.push({ cls: whitCls,     html: this.htmlEscape(profile.hit) + '+', rowspan: profileRowspan });
            cells.push({ cls: wdmgCls,     html: dmgHtml,                            rowspan: profileRowspan });
            cells.push({ cls: wrulesCls,   html: rulesHtml,                          rowspan: profileRowspan });
          }
          // If i >= X, no cells for this weapon in this sub-row — they were already rowspanned.
        }

        subRows.push({ cells, cls });
      }
      return subRows;
    },

    // Flat array of all sub-rows across all loadouts, for a single x-for in the template.
    allSubRows(team) {
      const out = [];
      team.loadouts.forEach((_, lIdx) => {
        this.subRowsFor(team, lIdx).forEach(sr => out.push(sr));
      });
      return out;
    },
  }));
});
