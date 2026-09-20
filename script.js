// Kill Team build guides — Alpine.js component.
// Reads teams.json (index of team keys), then fetches one <key>.json per team
// alongside index.html. Designed to be served as static files (GitHub Pages).

// Heroicons "information-circle" (outline) for the ⓘ buttons. Uses currentColor,
// so .op-info / .weapon-info control its colour and hover state.
const INFO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-full h-full" aria-hidden="true">'
  + '<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />'
  + '</svg>';

const TIP_OFFSCREEN = 'top: -9999px; left: -9999px';

document.addEventListener('alpine:init', () => {
  Alpine.data('kt', () => ({
    data: { teams: [] },
    selectedKey: '',
    loading: true,
    error: '',
    openOperative: null,
    openWeapon: null,
    theme: 'system',
    view: 'all',
    rosters: {},
    ruleGlossary: [],
    tip: null,
    tipStyle: TIP_OFFSCREEN,

    async init() {
      this.initTheme();

      window.addEventListener('resize', () => this.syncAllStickyOffsets());
      window.addEventListener('scroll', () => this.hideRuleTip(), true);

      // ESC closes the modal.
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (this.openOperative) this.openOperative = null;
          if (this.openWeapon) this.openWeapon = null;
          if (this.tip) this.hideRuleTip();
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

        // Optional: the site still works without it, just with no rule tooltips.
        try {
          const rulesRes = await fetch('data/rules.json', { cache: 'no-cache' });
          if (rulesRes.ok) {
            const parsed = await rulesRes.json();
            // Longest key first so "Piercing Crits 1" matches before "Piercing".
            this.ruleGlossary = (parsed.rules || []).slice()
              .sort((a, b) => b.key.length - a.key.length);
          }
        } catch (_) { /* no glossary, no tooltips */ }

        fetched.forEach(t => this.assignLoadoutIds(t));
        this.data = { teams: fetched };
        this.selectedKey = fetched[0]?.key || '';
        this.restoreFromUrl();
        this.$watch('selectedKey', () => this.syncUrl());
      } catch (e) {
        this.error = e.message || String(e);
      } finally {
        this.loading = false;
        this.$nextTick(() => this.syncTeamSelect());
      }
    },

    // The dropdown's <option>s come from an x-for that renders after x-model has
    // already pushed selectedKey onto the <select>, so with no matching option yet
    // the browser falls back to the first one. A team restored from ?team=… left the
    // dropdown showing AoD while the table showed the right team; re-assert the value
    // once the options exist.
    syncTeamSelect(tries = 0) {
      const sel = this.$refs.teamSelect;
      if (sel && sel.options.length) {
        sel.value = this.selectedKey;
        return;
      }
      if (tries < 5) requestAnimationFrame(() => this.syncTeamSelect(tries + 1));
    },

    // Table clicks (roster buttons, ⓘ pop-ups) — event delegation off the team section.
    handleOpClick(e) {
      const kw = e.target.closest('.rule-kw');
      if (kw) {
        if (this.tip && this.tip.key === kw.dataset.rule) this.hideRuleTip();
        else this.showRuleTip(kw);
        return;
      }
      this.hideRuleTip();
      const addBtn = e.target.closest('.roster-add');
      if (addBtn) { this.addToRoster(this.selectedKey, addBtn.dataset.loadout); return; }
      const removeBtn = e.target.closest('.roster-remove');
      if (removeBtn) { this.removeFromRoster(this.selectedKey, Number(removeBtn.dataset.entry)); return; }
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

    // Roster: per team, an ordered list of loadout ids (repeats allowed, one entry per model).
    // Ids are derived from operative + weapon names, so saved links survive reordering a team file.
    assignLoadoutIds(team) {
      const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const seen = {};
      (team.loadouts || []).forEach(l => {
        const base = [l.operative, ...(l.weapons || []).map(w => w.name)].map(slug).join('.');
        seen[base] = (seen[base] || 0) + 1;
        l._id = seen[base] > 1 ? base + '-' + seen[base] : base;
      });
    },

    rosterFor(team) {
      return this.rosters[team.key] || [];
    },

    addToRoster(teamKey, id) {
      this.rosters = { ...this.rosters, [teamKey]: [...(this.rosters[teamKey] || []), id] };
      this.syncUrl();
    },

    removeFromRoster(teamKey, entry) {
      const next = [...(this.rosters[teamKey] || [])];
      next.splice(entry, 1);
      this.rosters = { ...this.rosters, [teamKey]: next };
      this.syncUrl();
    },

    clearRoster(teamKey) {
      this.rosters = { ...this.rosters, [teamKey]: [] };
      this.syncUrl();
    },

    setView(view) {
      this.view = view;
      this.syncUrl();
    },

    // Consecutive loadouts share an operative cell while this key matches. Roster entries each
    // get their own key, so two Raptors show as two separate operatives.
    groupKey(loadout) {
      return loadout._group ?? loadout.operative;
    },

    // The team as the table should show it: every loadout, or in roster view only the rostered
    // loadouts (team-file order) with the weapon columns narrowed to fit them.
    viewTeam(team) {
      if (this.view !== 'roster') return team;
      const index = new Map(team.loadouts.map((l, i) => [l._id, i]));
      const entries = this.rosterFor(team)
        .map((id, entry) => ({ id, entry }))
        .filter(e => index.has(e.id))
        .sort((a, b) => index.get(a.id) - index.get(b.id) || a.entry - b.entry);
      const loadouts = entries.map((e, i) => ({ ...team.loadouts[index.get(e.id)], _entry: e.entry, _group: i }));
      const widest = melee => Math.max(0, ...loadouts.map(l => (l.weapons || []).filter(w => (w.type === 'melee') === melee).length));
      return { ...team, loadouts, max_shooting: widest(false), max_melee: widest(true), _roster: true };
    },

    // "+ Add" (all loadouts) or "× Remove" (roster view) for one loadout's roster cell.
    rosterButtonHtml(team, loadout) {
      const base = 'font-display uppercase text-[10px] tracking-[0.08em] px-2 py-1 border whitespace-nowrap cursor-pointer transition-colors duration-150';
      if (team._roster) {
        return '<button type="button" class="roster-remove ' + base + ' border-rule-strong text-ink-dim hover:border-danger hover:text-danger"'
          + ' data-entry="' + loadout._entry + '" aria-label="Remove from roster">× Remove</button>';
      }
      const count = this.rosterFor(team).filter(id => id === loadout._id).length;
      return '<button type="button" class="roster-add ' + base + ' border-accent-dim text-accent hover:bg-accent hover:text-on-accent"'
        + ' data-loadout="' + this.htmlEscape(loadout._id) + '" aria-label="Add to roster">+ Add'
        + (count ? ' ×' + count : '')
        + '</button>';
    },

    // The roster column sticks to the right edge of the Operative column, whose
    // real width is set by the widest operative name/stat row, not by its w-[200px]
    // hint (the table uses auto layout). Measure it and hand it to the CSS.
    syncStickyOffsets(pane) {
      const op = pane.querySelector('td.op-cell, th.op-cell');
      if (!op) return;
      const w = op.getBoundingClientRect().width;
      if (w > 0) pane.style.setProperty('--op-w', w + 'px');
    },

    // Column widths shift with the viewport, so re-measure every visible pane.
    syncAllStickyOffsets() {
      document.querySelectorAll('.table-pane').forEach(pane => {
        if (pane.offsetParent !== null) this.syncStickyOffsets(pane);
      });
    },

    // URL holds the state: ?team=<key>&roster=<id>,<id>&view=roster, so links and reloads restore it.
    restoreFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const team = this.data.teams.find(t => t.key === params.get('team'));
      if (team) this.selectedKey = team.key;
      const current = this.data.teams.find(t => t.key === this.selectedKey);
      const ids = (params.get('roster') || '').split(',').filter(Boolean);
      if (current && ids.length) {
        const valid = new Set(current.loadouts.map(l => l._id));
        this.rosters = { ...this.rosters, [current.key]: ids.filter(id => valid.has(id)) };
      }
      if (params.get('view') === 'roster') this.view = 'roster';
    },

    syncUrl() {
      const parts = [];
      if (this.selectedKey) parts.push('team=' + encodeURIComponent(this.selectedKey));
      const current = this.data.teams.find(t => t.key === this.selectedKey);
      const ids = current ? this.rosterFor(current) : [];
      if (ids.length) parts.push('roster=' + ids.map(id => encodeURIComponent(id)).join(','));
      if (this.view === 'roster') parts.push('view=roster');
      const query = parts.length ? '?' + parts.join('&') : '';
      history.replaceState(null, '', window.location.pathname + query + window.location.hash);
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

    // Approx 200px for the operative column + 84px roster column + 640px per weapon column group
    // (name + profile + atk + dmg + rules).
    tableStyle(team) {
      const cols = (team.max_shooting || 0) + (team.max_melee || 0);
      return `min-width: ${284 + cols * 640}px`;
    },

    // Build header cells from per-team max counts.
    headerCells(team) {
      const cells = [{ text: 'Operative', cls: 'op-cell' }, { text: '', cls: 'roster-col w-[84px]' }];
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
      const key = this.groupKey(loadouts[idx]);
      let total = 0;
      for (let i = idx; i < loadouts.length && this.groupKey(loadouts[i]) === key; i++) {
        total += this.loadoutHeight(loadouts[i]);
      }
      return total;
    },

    // Render one profile's rules cell content (single profile, not stacked).
    // Longest-first match of a rule string against the glossary. The keyword must be
    // followed by end of string, a space or "(" so "Seek" doesn't match "Seeker".
    ruleLookup(text) {
      const lower = text.toLowerCase();
      return this.ruleGlossary.find(rule => {
        if (!lower.startsWith(rule.key)) return false;
        const next = lower.charAt(rule.key.length);
        return next === '' || next === ' ' || next === '(';
      }) || null;
    },

    rulesForProfile(profile) {
      const r = profile.rules || [];
      if (!r.length) return '—';
      return r.map(x => {
        const escaped = this.htmlEscape(x);
        const rule = this.ruleLookup(x);
        // Team-specific rules (Neutron Fragment*, Shield, …) aren't in the glossary
        // and stay as plain text — they're covered by the team's footnotes.
        if (!rule) return escaped;
        return '<span class="rule-kw" tabindex="0" role="button" aria-label="'
          + escaped + ' — what does this do?" data-rule="' + this.htmlEscape(rule.key) + '">'
          + escaped + '</span>';
      }).join(', ');
    },

    // Tooltips are rendered at body level and positioned fixed, because the table
    // scrolls inside .table-pane and anything absolute inside it would be clipped.
    showRuleTip(el) {
      const rule = this.ruleGlossary.find(r => r.key === el.dataset.rule);
      if (!rule) return;
      this.tip = rule;
      this.$nextTick(() => this.positionRuleTip(el));
    },

    hideRuleTip() {
      this.tip = null;
      this.tipStyle = TIP_OFFSCREEN;
    },

    positionRuleTip(el) {
      const tipEl = this.$refs.ruleTip;
      if (!tipEl) return;
      const r = el.getBoundingClientRect();
      const t = tipEl.getBoundingClientRect();
      const margin = 8;
      // Above the keyword by default, below it when there isn't room.
      let top = r.top - t.height - margin;
      if (top < margin) top = r.bottom + margin;
      // Centred, then clamped so it never hangs off either edge.
      let left = r.left + (r.width / 2) - (t.width / 2);
      left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin));
      this.tipStyle = `top: ${Math.round(top)}px; left: ${Math.round(left)}px`;
    },

    // Delegated off the team section, like the click handlers.
    handleRuleOver(e) {
      const kw = e.target.closest('.rule-kw');
      if (kw) this.showRuleTip(kw);
      else if (this.tip) this.hideRuleTip();
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
        || this.groupKey(loadouts[loadoutIdx - 1]) !== this.groupKey(loadout);
      const opRowspan = isFirstOfOperative ? this.operativeSubrowSpan(team, loadoutIdx) : 0;

      // Note attaches to whichever weapon was last in the original loadout.weapons array.
      const note = loadout.note || null;
      const noteOnIdx = weapons.length - 1;

      const opCellCls = 'op-cell bg-head border-r-2 border-r-accent font-display text-[14px] tracking-[0.04em] uppercase text-ink whitespace-nowrap w-[200px]';
      const wnameCls  = 'font-mono text-xs text-ink border-l border-l-rule pl-[14px] font-medium whitespace-nowrap';
      const wprofileCls = 'font-sans text-xs text-ink font-medium w-[100px]';
      const wattkCls  = 'font-mono font-semibold text-center text-ink w-[50px]';
      const whitCls   = 'font-mono font-semibold text-center text-ink w-[50px]';
      const wdmgCls   = 'font-mono font-semibold text-center text-ink w-[60px]';
      const wrulesCls = 'text-ink-dim text-xs';
      const rosterCellCls = 'roster-col bg-panel text-center w-[84px]';

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

        // Roster button on the first sub-row of every loadout, spanning the whole loadout.
        if (i === 0) {
          cells.push({ cls: rosterCellCls, html: this.rosterButtonHtml(team, loadout), rowspan: N });
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
