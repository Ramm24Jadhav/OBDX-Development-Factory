/*
 * Modernization page: how far the move of a workspace's OBDX application is, and the plan for it, from evidence. The
 * inventory scanned from the code (modules, screens and their size, services, roles, flows), the stack from the codebase
 * facts, the rules of the workspace's version pack and of the version it moves to (usage of what they forbid is found
 * with code search and checked against each rule's pattern), the workspace's target (Oracle JET, or a new React Native
 * or React app in its own folder) and the factory's changes.
 *
 * A module counts as converted, in progress or failed from the changes that write files into the new app's folder for
 * it (a folder or file name in the app that names the module); nothing else is recorded about a conversion, so the page
 * never says a migration is complete. Everything else is a detected fact with its source, or an estimate said to be
 * one; model-written text appears only in the assistant panel.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/assistant', '../services/toast', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant, toast, pageRequests) {
    const pill = ui.pill;
    const lastSegment = (id) => id.substring(id.lastIndexOf('/') + 1);
    // Days of work per screen by size, for the effort estimate
    const DAYS = { S: 1, M: 3, L: 5 };
    const SIZE = { S: 'Small', M: 'Medium', L: 'Large' };
    const PHASE = { S: 'Phase 1', M: 'Phase 2', L: 'Phase 3' };
    // Evidence rows shown per opportunity before "more in ..."
    const EVIDENCE = 6;
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const go = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    /** The Code page's viewer at the given lines. */
    const openInCode = (path, from, to) => {
      pageRequests.codeFile({ path: path, startLine: from || 1, endLine: to || from || 1 });
      go('code');
    };
    const openChange = (id) => {
      pageRequests.change(id);
      go('changes');
    };
    // Where a fact comes from (shown next to it); AI text is only in the assistant panel
    const SOURCE = {
      scan: 'Detected: code scan', rules: 'Detected: version pack rules', target: 'Detected: target pack check', profile: 'Detected: codebase facts',
      setting: 'Workspace setting', pack: 'Version pack', estimate: 'Estimate'
    };
    const source = (key) => ({ text: SOURCE[key], css: 'fx-badge ' + (key === 'estimate' ? 'fx-badge--warning' : key === 'setting' || key === 'pack' ? 'fx-badge--neutral' : 'fx-badge--info') + ' factory-mz-src' });
    // Gate and prerequisite states
    const STATE = {
      ok: { text: 'Done', tone: 'green' }, pass: { text: 'Passes', tone: 'green' },
      todo: { text: 'To do', tone: 'amber' }, fail: { text: 'Fails', tone: 'red' },
      unknown: { text: 'Unknown', tone: 'grey' }, untracked: { text: 'Not tracked', tone: 'grey' }
    };
    const state = (key) => Object.assign({ key: key }, pill(STATE[key].text, STATE[key].tone));
    // A module's conversion, from the changes that write its files into the new app
    const CONVERSION = {
      done: { name: 'Converted', sub: 'app code delivered', status: 'DELIVERED', dot: 'is-success' },
      progress: { name: 'In progress', sub: 'a change is open', status: 'GENERATING', dot: 'is-primary' },
      failed: { name: 'Failed', sub: 'its change or build failed', status: 'FAILED', dot: 'is-danger' },
      todo: { name: 'Not started', sub: 'no change writes it yet', status: 'DRAFT', dot: '' }
    };
    const conversionStatus = (key) => Object.assign(ui.status(CONVERSION[key].status, CONVERSION[key].name), { key: key });
    const sizePill = (c) => (c === 'L' ? pill('Large', 'red') : c === 'M' ? pill('Medium', 'amber') : pill('Small', 'green'));
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');

    /**
     * The module a file of the new app belongs to: the first folder or file name under the app folder that names a
     * module (payments/, PaymentsScreen.tsx, payment-list/), or null.
     */
    function moduleOfAppFile(path, folder, modules) {
      if (!folder || !path || path.indexOf(folder.replace(/\/$/, '') + '/') !== 0) {
        return null;
      }
      const parts = path.slice(folder.replace(/\/$/, '').length + 1).split('/');
      parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^.]+$/, '');
      for (const part of parts) {
        const key = norm(part);
        const hit = modules.find((m) => m.key && (key === m.key || (m.key.length >= 4 && key.indexOf(m.key) === 0)));
        if (hit) {
          return hit.name;
        }
      }
      return null;
    }

    /** What a change says about the modules it writes: done, progress, failed, or null (abandoned). */
    function changeState(c) {
      if (c.status === 'CLOSED') {
        return c.closedReason === 'MERGED' ? 'done' : null;
      }
      if (c.status === 'FAILED' || c.buildStatus === 'FAILED') {
        return 'failed';
      }
      return c.status === 'DELIVERED' ? 'done' : 'progress';
    }

    /** A literal word from a rule's regular expression, to find candidate files with code search. */
    function searchTerm(regex) {
      const words = regex.replace(/\\[sdwbSDWB]/g, ' ').replace(/\\(.)/g, '$1').split(/[^A-Za-z0-9_.-]+/).filter((w) => w.length >= 4);
      return words.sort((a, b) => b.length - a.length)[0] || null;
    }

    /** A rule's Java regular expression as a JavaScript one (inline flags become flags), or null when it cannot be read. */
    function toRegExp(regex) {
      const m = regex.match(/^\(\?([imsx]+)\)/);
      const flags = m ? m[1].replace(/x/g, '') : '';
      try {
        return new RegExp(m ? regex.slice(m[0].length) : regex, flags);
      } catch (e) {
        return null;
      }
    }

    function ModernizationViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canScan = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canWrite = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_REQUIREMENTS'));
      this.workspace = ko.observable(null);
      this.inventory = ko.observable(null);
      this.profile = ko.observable(null);
      this.channel = ko.observable(null);
      this.packs = ko.observableArray([]);
      this.changes = ko.observableArray([]);
      this.checks = ko.observable(null);
      this.targetChecks = ko.observable(null);
      this.findings = ko.observableArray([]);
      this.searchingFindings = ko.observable(false);
      this.loading = ko.observable(false);
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      // Loading problems stay on the page; the result of an action is a toast
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      const factOf = (key) => (this.profile() ? this.profile().facts.find((x) => x.key === key && x.value) || null : null);
      const fact = (key) => (factOf(key) ? factOf(key).value : null);
      this.scannedText = ko.pureComputed(() => (this.inventory() ? ui.when(this.inventory().scannedAt) : ''));
      this.version = ko.pureComputed(() => (this.workspace() ? this.workspace().obdxVersion : ''));
      // The target version is the newest version pack
      this.target = ko.pureComputed(() => (this.version() === '22.x' ? '25.x' : this.version()));
      this.upgrade = ko.pureComputed(() => !!this.version() && this.version() !== this.target());
      // A new app (React Native or React) rather than the bank's Oracle JET UI
      this.newApp = ko.pureComputed(() => !!this.channel() && this.channel().target !== 'jet');
      const targetJava = ko.pureComputed(() => (this.targetChecks() ? this.targetChecks().javaLevel : this.checks() ? this.checks().javaLevel : null));
      this.statusText = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return '';
        }
        const s = inv.summary;
        const to =this.channel() ? (this.newApp() ? this.channel().title.replace(/\s*\(.*\)$/, '') + ' app' : 'Oracle JET') : '';
        return 'r' + inv.revision + ' analysed ' + this.scannedText() + ' · ' + plural(s.screens, 'screen') + ' in ' + plural(s.modules, 'module')
          + ' · OBDX ' + this.version() + (this.upgrade() ? ' to ' + this.target() : '') + (to ? ', ' + to : '');
      });

      // Source and target: version, technology, Java; each with where the value comes from (the channel is its own card)
      this.endpoints = ko.pureComputed(() => {
        const ui1 = factOf('ui.jetVersion') || factOf('ui.architecture');
        const java = factOf('backend.javaVersion');
        const tech = (f, prefix) => (f ? (prefix || '') + f.value.replace(/\s*\(\d+ files?\)$/, '') : 'Not detected');
        const factSource = (f) => (f ? { text: 'Codebase facts: ' + (f.status === 'detected' ? 'detected, ' + String(f.confidence).toLowerCase() + ' confidence' : f.status),
          css: 'factory-mz-endsrc' } : { text: 'Unknown', css: 'factory-mz-endsrc' });
        const plain = (key) => ({ text: SOURCE[key], css: 'factory-mz-endsrc' });
        return [
          { id: 'mzSourceVersion', label: 'From', value: 'OBDX ' + this.version(), src: plain('setting') },
          { id: 'mzSourceTech', label: 'Built with', value: (ui1 ? tech(ui1, factOf('ui.jetVersion') ? 'Oracle JET ' : '') : 'UI not detected') + (java ? ' · Java ' + java.value : ''), src: factSource(ui1 || java) },
          { id: 'mzTargetVersion', label: 'To', value: 'OBDX ' + this.target() + (targetJava() ? ' · Java ' + targetJava() : ''), src: plain('pack') }
        ];
      });
      this.changeChannel = () => {
        pageRequests.codeTab('settings');
        go('code');
      };

      // Rules: this workspace's pack and, for an upgrade, the target version's pack; usage of what they forbid
      const ruleKey = (r) => r.id;
      const ownRules = ko.pureComputed(() => (this.checks() ? this.checks().rules : []));
      const targetRules = ko.pureComputed(() => (this.targetChecks() ? this.targetChecks().rules : []));
      this.newRules = ko.pureComputed(() => {
        const own = new Set(ownRules().map(ruleKey));
        return targetRules().filter((r) => !own.has(r.id));
      });
      const critical = ko.pureComputed(() => this.findings().filter((f) => f.severity === 'ERROR').length);

      // ---------- Modules: their screens, findings and conversion ----------

      const moduleKeys = ko.pureComputed(() => (this.inventory() ? this.inventory().modules : []).map((m) => ({ name: m.name, key: norm(m.name) })));
      // The module of a file of the bank's code: a screen's file, else a folder that names a module
      const moduleOfFile = (path) => {
        const inv = this.inventory();
        if (!inv || !path) {
          return '';
        }
        const screen = inv.screens.find((s) => s.files.indexOf(path) >= 0);
        if (screen) {
          return screen.module;
        }
        const keys = path.split('/').slice(0, -1).map(norm);
        const hit = moduleKeys().find((m) => keys.indexOf(m.key) >= 0);
        return hit ? hit.name : '';
      };
      // The changes that write files of the new app, by module (newest first)
      const changesByModule = ko.pureComputed(() => {
        const map = {};
        const channel = this.channel();
        if (!this.newApp() || !channel.appFolder) {
          return map;
        }
        this.changes().forEach((c) => {
          const paths = (c.files || []).map((f) => f.path).concat(c.plan && c.plan.items ? c.plan.items.map((i) => i.path) : []);
          const names = new Set(paths.map((p) => moduleOfAppFile(p, channel.appFolder, moduleKeys())).filter(Boolean));
          names.forEach((n) => { (map[n] = map[n] || []).push(c); });
        });
        Object.keys(map).forEach((n) => map[n].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
        return map;
      });
      const conversionOf = (name) => {
        const list = changesByModule()[name] || [];
        const latest = list.find((c) => changeState(c));
        return { key: latest ? changeState(latest) : 'todo', change: latest || null, changes: list };
      };
      this.modules = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const outside = new Set(inv.calls.filter((c) => !c.endpoint).map((c) => c.method + ' ' + c.path));
        const findings = this.findings();
        return inv.modules.map((m) => {
          const screens = inv.screens.filter((x) => x.module === m.name)
            .sort((a, b) => 'SML'.indexOf(a.complexity) - 'SML'.indexOf(b.complexity) || a.name.localeCompare(b.name));
          const calls = new Set([].concat.apply([], screens.map((x) => x.calls)));
          const out = Array.from(calls).filter((c) => outside.has(c) || outside.has(c.replace(/^\?/, 'GET'))).length;
          const size = m.complexity.L ? 'L' : m.complexity.M ? 'M' : 'S';
          const conversion = conversionOf(m.name);
          const uses = findings.filter((f) => f.module === m.name);
          return {
            name: m.name, screens: screens, count: m.screens, large: m.complexity.L || 0, medium: m.complexity.M || 0, small: m.complexity.S || 0,
            calls: calls.size, outside: out, size: size, findings: uses, conversion: conversion,
            days: screens.reduce((sum, x) => sum + DAYS[x.complexity], 0),
            text: (m.name + ' ' + screens.map((x) => x.name + ' ' + x.files.join(' ')).join(' ')).toLowerCase()
          };
        });
      });

      // The four boxes: how far the conversion is (they filter the modules; pressed again, all modules)
      this.boxFilter = ko.observable('');
      this.boxes = ko.pureComputed(() => ['done', 'progress', 'failed', 'todo'].map((key) => {
        const n = this.modules().filter((m) => m.conversion.key === key).length;
        const c = CONVERSION[key];
        const tone = key === 'done' ? ' has-done' : key === 'failed' ? ' has-failed' : key === 'progress' ? ' has-work' : '';
        return {
          key: key, name: c.name, count: n, sub: c.sub, css: 'factory-rq-stage factory-mz-box' + (n ? tone : ''),
          pressed: this.boxFilter() === key ? 'true' : 'false',
          label: c.name + ': ' + plural(n, 'module') + ', ' + c.sub + (this.boxFilter() === key ? '. Showing these; press again for all modules.' : '. Show these modules.'),
          pick: () => { this.boxFilter(this.boxFilter() === key ? '' : key); this.tab('modules'); }
        };
      }));
      this.progressLine = ko.pureComputed(() => {
        const all = this.modules().length;
        const done = this.modules().filter((m) => m.conversion.key === 'done').length;
        return all ? done + ' of ' + plural(all, 'module') + ' converted' : '';
      });
      // The target card: the channel, its target pack and the app folder
      this.targetCard = ko.pureComputed(() => {
        const c = this.channel();
        if (!c) {
          return { title: 'Loading…', sub: '', css: 'factory-mz-target' };
        }
        if (c.target === 'jet') {
          return { title: 'Oracle JET', sub: 'The bank\'s OBDX UI: no new app chosen', css: 'factory-mz-target' };
        }
        return {
          title: c.title.replace(/\s*\(.*\)$/, ''),
          sub: 'Target pack ' + c.target + ' · app in ' + c.appFolder + '/ ' + (c.appFolderExists ? '(found)' : '(not in the code yet)'),
          css: 'factory-mz-target' + (c.appFolderExists ? ' has-done' : ' has-mine')
        };
      });

      // The module list: chips by size and forbidden usage, a search; the boxes filter by conversion
      this.sizeFilter = ko.observable('all');
      this.moduleSearch = ko.observable('');
      const matchesSearch = (m) => {
        const text = this.moduleSearch().trim().toLowerCase();
        return !text || m.text.indexOf(text) >= 0;
      };
      const SIZE_CHIPS = [
        { value: 'all', label: 'All', test: () => true },
        { value: 'L', label: 'Large screens', test: (m) => m.size === 'L', dot: 'is-danger' },
        { value: 'M', label: 'Medium', test: (m) => m.size === 'M', dot: 'is-warning' },
        { value: 'S', label: 'Small only', test: (m) => m.size === 'S', dot: 'is-success' },
        { value: 'forbidden', label: 'Forbidden usage', test: (m) => m.findings.length > 0 }
      ];
      this.moduleChips = ko.pureComputed(() => {
        const base = this.modules().filter((m) => !this.boxFilter() || m.conversion.key === this.boxFilter());
        return SIZE_CHIPS.map((c) => ({
          value: c.value, dot: c.dot ? 'factory-rq-fdot ' + c.dot : '', n: base.filter(c.test).length,
          text: c.label + ' ' + base.filter(c.test).length,
          pressed: this.sizeFilter() === c.value ? 'true' : 'false', pick: () => this.sizeFilter(c.value)
        })).filter((c) => c.value === 'all' || c.n > 0 || this.sizeFilter() === c.value);
      });
      const visibleModules = ko.pureComputed(() => {
        const chip = SIZE_CHIPS.find((c) => c.value === this.sizeFilter()) || SIZE_CHIPS[0];
        return this.modules().filter((m) => (!this.boxFilter() || m.conversion.key === this.boxFilter()) && chip.test(m) && matchesSearch(m));
      });
      this.moduleName = ko.observable('');
      this.module = ko.pureComputed(() => {
        const list = visibleModules();
        return list.find((m) => m.name === this.moduleName()) || list[0] || null;
      });
      this.moduleItems = (m) => [
        { value: 'convert', label: this.newApp() ? 'Convert to the ' + this.channel().title.replace(/\s*\(.*\)$/, '') + ' app' : 'Choose the new app', disabled: !this.inventory() },
        { value: 'code', label: 'Show the first screen in Code', disabled: !m.screens.length },
        { value: 'ask', label: 'Ask the assistant about this module' },
        { value: 'change', label: 'Open its latest change', disabled: !m.conversion.change }
      ];
      const moduleAction = (m, action) => {
        if (action === 'convert') {
          this.startConversion(m.name);
        } else if (action === 'code') {
          openInCode(m.screens[0].files[0], 1, 1);
        } else if (action === 'ask') {
          this.askAbout('How should the ' + m.name + ' module (' + plural(m.count, 'screen') + ': ' + m.screens.map((x) => x.name + ' ' + SIZE[x.complexity].toLowerCase()).join(', ')
            + ') be moved' + (this.newApp() ? ' to the ' + this.channel().title + ' app' : ' to OBDX ' + this.target()) + '?');
        } else if (action === 'change' && m.conversion.change) {
          openChange(m.conversion.change.id);
        }
      };
      this.moduleRows = ko.pureComputed(() => {
        const on = this.module();
        return visibleModules().map((m) => {
          const status = conversionStatus(m.conversion.key);
          const sizes = [m.large ? m.large + ' L' : '', m.medium ? m.medium + ' M' : '', m.small ? m.small + ' S' : ''].filter(Boolean).join(' ');
          return {
            name: m.name, css: 'factory-rq-row factory-mz-row' + (on && on.name === m.name ? ' is-on' : ''), current: on && on.name === m.name ? 'true' : null,
            sub: plural(m.count, 'screen') + ' (' + sizes + ') · ' + plural(m.calls, 'call') + (m.outside ? ', ' + m.outside + ' outside' : ''),
            status: status, showStatus: this.newApp(), size: m.size === 'L' ? pill('Large screens', 'red') : m.size === 'M' ? pill('Medium', 'amber') : pill('Small', 'green'),
            uses: m.findings.length ? plural(m.findings.length, 'forbidden use') : '',
            when: m.conversion.change ? ui.when(m.conversion.change.updatedAt) : '',
            label: m.name + ', ' + plural(m.count, 'screen') + (this.newApp() ? ', ' + status.text : ''),
            pick: () => { this.moduleName(m.name); this.moduleTab('screens'); },
            menuItems: this.moduleItems(m), menu: (event) => moduleAction(m, event.detail.value)
          };
        });
      });
      this.modulesShown = ko.pureComputed(() => {
        const n = visibleModules().length;
        const all = this.modules().length;
        return n === all ? plural(all, 'module') : n + ' of ' + all + ' shown';
      });
      this.moduleFilterName = ko.pureComputed(() => (this.boxFilter() ? CONVERSION[this.boxFilter()].name : ''));
      this.clearModuleFilters = () => {
        this.boxFilter('');
        this.sizeFilter('all');
        this.moduleSearch('');
      };

      // The module beside the list: one header, the facts, Screens, Findings and Changes
      this.moduleTab = ko.observable('screens');
      this.moduleTabs = ui.tabs(this.moduleTab, [
        { value: 'screens', label: 'Screens', n: ko.pureComputed(() => (this.module() ? this.module().screens.length : 0)) },
        { value: 'findings', label: 'Findings', n: ko.pureComputed(() => (this.module() ? this.module().findings.length : 0)) },
        { value: 'changes', label: 'Changes', n: ko.pureComputed(() => (this.module() ? this.module().conversion.changes.length : 0)) }
      ]);
      this.moduleView = ko.pureComputed(() => {
        const m = this.module();
        if (!m) {
          return null;
        }
        const conv = m.conversion;
        const appName = this.newApp() ? this.channel().title.replace(/\s*\(.*\)$/, '') : '';
        const phases = ['S', 'M', 'L'].map((c) => ({ c: c, n: m.screens.filter((x) => x.complexity === c).length })).filter((p) => p.n)
          .map((p) => PHASE[p.c] + ': ' + plural(p.n, SIZE[p.c].toLowerCase() + ' screen')).join(', ');
        return {
          name: m.name, status: conversionStatus(conv.key), showStatus: this.newApp(),
          sub: plural(m.count, 'screen') + ' · ' + plural(m.calls, 'service call') + ' · ' + plural(m.findings.length, 'forbidden use'),
          phases: phases + ' · ' + plural(m.days, 'day') + ' (estimate)',
          services: plural(m.calls, 'service') + ' called' + (m.outside ? ', ' + m.outside + ' outside this code (usually Oracle product services)' : ', all in this code'),
          conversion: !this.newApp() ? 'No new app chosen. Choose React Native or React to convert this module.'
            : conv.change ? CONVERSION[conv.key].name + ': ' + conv.change.title + ' (' + ui.status(conv.change.status).text.toLowerCase() + (conv.change.buildStatus ? ', build ' + String(conv.change.buildStatus).toLowerCase() : '') + ', ' + ui.when(conv.change.updatedAt) + ').'
              : 'Not started: no change writes this module into ' + this.channel().appFolder + '/ yet.',
          primary: !this.newApp() ? { label: 'Choose the new app', run: () => this.startConversion(m.name) }
            : conv.key === 'progress' || conv.key === 'failed' ? { label: 'Open the change', run: () => openChange(conv.change.id) }
              : { label: conv.key === 'done' ? 'Convert again' : 'Convert to ' + appName, run: () => this.startConversion(m.name) },
          menuItems: this.moduleItems(m), menu: (event) => moduleAction(m, event.detail.value)
        };
      });
      this.moduleScreens = ko.pureComputed(() => {
        const inv = this.inventory();
        const m = this.module();
        if (!inv || !m) {
          return [];
        }
        const names = {};
        inv.screens.forEach((s) => { names[s.id] = s.name; });
        return m.screens.map((s) => ({
          name: s.name, file: s.files[0], files: s.files.join(', '), size: sizePill(s.complexity), phase: PHASE[s.complexity],
          meta: plural(s.fields.length, 'field') + ' · ' + plural(s.actions, 'action') + ' · ' + plural(s.calls.length, 'call')
            + (s.opens.length ? ' · opens ' + s.opens.map((id) => names[id] || lastSegment(id)).join(', ') : ''),
          calls: s.calls.join(', ') || 'No service calls',
          open: () => openInCode(s.files[0], 1, 1)
        }));
      });
      this.moduleFindings = ko.pureComputed(() => (this.module() ? this.module().findings : []));
      this.moduleChanges = ko.pureComputed(() => (this.module() ? this.module().conversion.changes : []).map((c) => {
        const st = changeState(c);
        return {
          title: c.title, status: st ? conversionStatus(st) : ui.status('CLOSED', 'Abandoned'), when: ui.when(c.updatedAt),
          sub: ui.status(c.status).text + (c.buildStatus ? ' · build ' + String(c.buildStatus).toLowerCase() : '') + (c.deliveredRevision ? ' · delivered at r' + c.deliveredRevision : ''),
          open: () => openChange(c.id)
        };
      }));

      // ---------- Start a conversion: the new app, the app in the code, a requirement per module ----------

      this.startOpen = ko.observable(false);
      this.draftTarget = ko.observable('react-native');
      this.draftFolder = ko.observable('');
      this.convertModule = ko.observable('');
      this.choices = ko.pureComputed(() => this.packs().filter((p) => p.id !== 'jet').map((p) => ({
        id: p.id, title: p.title, description: p.description, folder: p.defaultAppFolder,
        pressed: this.draftTarget() === p.id ? 'true' : 'false',
        current: this.channel() && this.channel().target === p.id,
        pick: () => {
          const before = this.packs().find((x) => x.id === this.draftTarget());
          this.draftTarget(p.id);
          if (!this.draftFolder() || (before && this.draftFolder() === before.defaultAppFolder)) {
            this.draftFolder(this.channel() && this.channel().target === p.id ? this.channel().appFolder : p.defaultAppFolder || '');
          }
        }
      })));
      // Saved: the sheet's choice is the workspace's target now
      this.targetSaved = ko.pureComputed(() => !!this.channel() && this.channel().target === this.draftTarget()
        && (this.channel().appFolder || '') === this.draftFolder().trim().replace(/\/$/, ''));
      this.saveTip = ko.pureComputed(() => (!this.canScan() ? 'Changing the target needs Manage code.' : this.targetSaved() ? 'This is the workspace\'s target.' : null));
      this.starterUrl = ko.pureComputed(() => 'api/targets/' + encodeURIComponent(this.draftTarget()) + '/starter.zip');
      this.appStep = ko.pureComputed(() => {
        const c = this.channel();
        if (!this.targetSaved()) {
          return { st: state('unknown'), text: 'Save the target first; then the factory looks for the app in its folder.' };
        }
        return c.appFolderExists ? { st: state('ok'), text: 'Found in ' + c.appFolder + '/: converted screens are written there.' }
          : { st: state('todo'), text: 'Not in the code yet. Download the starter project, commit it to ' + c.appFolder + '/ with TortoiseSVN, then import again on Code.' };
      });
      this.convertOptions = ko.pureComputed(() => this.modules().map((m) => ({ value: m.name, label: m.name + ' (' + plural(m.count, 'screen') + ', ' + CONVERSION[m.conversion.key].name.toLowerCase() + ')' })));
      this.convertScreens = ko.pureComputed(() => {
        const m = this.modules().find((x) => x.name === this.convertModule());
        return m ? m.screens.map((s) => ({ name: s.name, size: sizePill(s.complexity), file: s.files[0] })) : [];
      });
      this.writeTip = ko.pureComputed(() => (!this.canWrite() ? 'Writing a requirement needs Edit requirements.'
        : !this.newApp() || !this.targetSaved() ? 'Save a React Native or React target first.' : !this.convertModule() ? 'Choose a module.' : null));
      this.startConversion = (name) => {
        const c = this.channel();
        const chosen = c && c.target !== 'jet' ? c.target : (this.packs().find((p) => p.id === 'react-native') ? 'react-native' : (this.packs().find((p) => p.id !== 'jet') || {}).id || '');
        const pack = this.packs().find((p) => p.id === chosen);
        this.draftTarget(chosen);
        this.draftFolder(c && c.target === chosen ? c.appFolder || '' : pack ? pack.defaultAppFolder || '' : '');
        const next = this.modules().find((m) => m.conversion.key === 'todo') || this.modules()[0];
        this.convertModule(typeof name === 'string' ? name : next ? next.name : '');
        this.startOpen(true);
      };
      this.saveTarget = () => {
        const id = this.workspaceId();
        api.put('workspaces/' + id + '/target', { target: this.draftTarget(), appFolder: this.draftFolder().trim() || null })
          .then((t) => {
            if (id === this.workspaceId()) {
              this.channel(t);
              this.draftFolder(t.appFolder || '');
            }
            toast.success('Target saved: ' + t.title + (t.appFolder ? ' in ' + t.appFolder + '/' : '') + '.');
            return api.get('workspaces/' + id + '/checks').then((own) => { if (id === this.workspaceId()) { this.checks(own); } });
          })
          .catch(actionError);
      };
      // The requirement the Requirements page opens with, filled in from the analysis (nothing is sent from here)
      this.writeRequirement = () => {
        const m = this.modules().find((x) => x.name === this.convertModule());
        const c = this.channel();
        if (!m || !c) {
          return;
        }
        const app = c.title.replace(/\s*\(.*\)$/, '');
        const text = 'Convert the ' + m.name + ' module of the OBDX UI to the ' + c.title + ' app in ' + c.appFolder + '/.\n\n'
          + 'Screens (from the modernization analysis of r' + this.inventory().revision + '), small ones first:\n'
          + m.screens.map((s) => '- ' + s.name + ' (' + s.files[0] + '): ' + plural(s.fields.length, 'field') + ', ' + plural(s.actions, 'action')
            + (s.calls.length ? ', calls ' + s.calls.join(', ') : '')).join('\n')
          + '\n\nKeep the services the screens call as they are. Follow the target pack\'s folders and components, and keep the screens\' fields, actions and texts.';
        pageRequests.newRequirement({ mode: 'text', title: 'Convert ' + m.name + ' to ' + app, text: text });
        this.startOpen(false);
        go('requirements');
      };

      // ---------- The one problem, or the next step ----------

      this.problem = ko.pureComputed(() => {
        const inv = this.inventory();
        const w = this.workspace();
        const c = this.channel();
        if (!inv || !w) {
          return null;
        }
        if (w.indexedRevision != null && inv.revision !== w.indexedRevision) {
          return { css: 'factory-rqd-problem', lead: 'The analysis is older than the code.', detail: 'It is of r' + inv.revision + '; the code is indexed at r' + w.indexedRevision + '.',
            fix: this.canScan() ? { label: 'Run Analysis', run: () => this.scan() } : null };
        }
        const failed = this.modules().filter((m) => m.conversion.key === 'failed');
        if (failed.length) {
          return { css: 'factory-rqd-problem is-error', lead: plural(failed.length, 'module') + (failed.length === 1 ? ' has' : ' have') + ' a failed conversion.',
            detail: failed.map((m) => m.name + ' (' + m.conversion.change.title + ')').join(', ') + '.', fix: { label: 'Show them', run: () => { this.boxFilter('failed'); this.tab('modules'); } } };
        }
        if (c && c.target !== 'jet' && !c.appFolderExists) {
          return { css: 'factory-rqd-problem', lead: 'The ' + c.title.replace(/\s*\(.*\)$/, '') + ' app is not in the code yet.',
            detail: 'Download the starter project, commit it to ' + c.appFolder + '/ and import again; converted screens are written there.',
            fix: { label: 'Download the starter', run: () => { window.location.href = 'api/targets/' + encodeURIComponent(c.target) + '/starter.zip'; } } };
        }
        if (!this.searchingFindings() && critical()) {
          return { css: 'factory-rqd-problem is-error', lead: plural(critical(), 'use') + ' of forbidden APIs ' + (critical() === 1 ? 'breaks' : 'break') + ' an error rule.',
            detail: 'Replace them before the move; each finding says what to use instead.', fix: { label: 'Show them', run: () => { this.severityFilter('ERROR'); this.tab('findings'); } } };
        }
        const java = fact('backend.javaVersion');
        if (java && targetJava() && Number(java) < targetJava()) {
          return { css: 'factory-rqd-problem', lead: 'Java ' + java + ' is below the Java ' + targetJava() + ' of OBDX ' + this.target() + '.',
            detail: 'Plan the Java upgrade with the move.', fix: { label: 'Open the codebase facts', run: () => { pageRequests.codeTab('facts'); go('code'); } } };
        }
        return null;
      });
      this.nextLine = ko.pureComputed(() => {
        if (!this.inventory() || !this.channel()) {
          return '';
        }
        if (!this.newApp()) {
          return this.upgrade() ? 'Plan the upgrade to OBDX ' + this.target() + ' on the Plan tab, or choose a new app (React Native or React) to convert modules.'
            : 'Choose a new app (React Native or React) to convert modules, and follow each one here.';
        }
        const next = this.modules().filter((m) => m.conversion.key === 'todo').sort((a, b) => a.days - b.days)[0];
        return next ? 'Convert ' + next.name + ' (' + plural(next.count, 'screen') + ', about ' + plural(next.days, 'day') + ' by the estimate): the smallest module not started.'
          : 'Every module has a change. Retest the user flows on the Plan tab when they are delivered.';
      });

      // ---------- Tabs: Modules, Findings, Plan ----------

      this.tab = ko.observable('modules');
      this.tabs = ui.tabs(this.tab, [
        { value: 'modules', label: 'Modules', n: ko.pureComputed(() => this.modules().length) },
        { value: 'findings', label: 'Findings', n: ko.pureComputed(() => (this.searchingFindings() ? '…' : this.findings().length)) },
        { value: 'plan', label: 'Plan', n: '' }
      ]);
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('mo-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };

      // Opportunities (Plan › What to do): each one detected, with its evidence and where it comes from
      this.opportunities = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const s = inv.summary;
        const list = [];
        const add = (o) => {
          const evidence = o.evidence.slice(0, EVIDENCE).map((e) => Object.assign({ open: e.path ? () => openInCode(e.path, e.from, e.to) : null }, e));
          list.push(Object.assign(o, {
            level: pill(o.level, o.level === 'High' ? 'red' : o.level === 'Medium' ? 'amber' : 'green'), src: source(o.source), evidence: evidence,
            more: o.evidence.length > EVIDENCE ? (o.evidence.length - EVIDENCE) + ' more on ' + o.tabLabel : '', showMore: () => this.tab(o.tab)
          }));
        };
        if (this.upgrade()) {
          const javaNow = fact('backend.javaVersion');
          add({ id: 'framework', name: 'Upgrade OBDX ' + this.version() + ' to ' + this.target(), count: plural(this.newRules().length, 'new rule'), level: 'High', source: 'pack',
            why: 'The OBDX ' + this.target() + ' version pack checks Java ' + (this.targetChecks() ? this.targetChecks().javaLevel : '?') + ' code'
              + (javaNow ? ' (this code: Java ' + javaNow + ')' : ' (this code\'s Java version is not detected)') + ' and adds the rules below.',
            evidence: this.newRules().map((r) => ({ text: r.title, detail: r.id + ' · ' + (r.severity === 'ERROR' ? 'error' : 'warning') })), tab: 'findings', tabLabel: 'Findings' });
        }
        if (this.findings().length) {
          add({ id: 'forbidden', name: 'Replace forbidden APIs and components', count: plural(this.findings().length, 'use'), level: critical() ? 'High' : 'Medium', source: 'rules',
            why: critical() + ' of them break an error rule. Found with code search and checked against each rule\'s pattern.',
            evidence: this.findings().map((f) => ({ text: f.path, detail: f.ruleId + ' · lines ' + f.lines, path: f.path, from: f.startLine, to: f.endLine })), tab: 'findings', tabLabel: 'Findings' });
        }
        if (s.complexity.L) {
          const large = inv.screens.filter((x) => x.complexity === 'L');
          add({ id: 'large', name: 'Rework the large screens', count: plural(large.length, 'screen'), level: 'Medium', source: 'scan',
            why: 'Large by fields, actions, services and screens opened (the score in the analysis).',
            evidence: large.map((x) => ({ text: x.name, detail: x.module + ' · score ' + x.score, path: x.files[0] })), tab: 'modules', tabLabel: 'Modules' });
        }
        const outside = inv.calls.filter((c) => !c.endpoint);
        if (outside.length) {
          add({ id: 'outside', name: 'Check the services outside this code', count: plural(outside.length, 'service'), level: 'Medium', source: 'scan',
            why: 'The UI calls them but they are not in this codebase; usually Oracle OBDX product services.',
            evidence: outside.map((c) => ({ text: c.method + ' ' + c.path, detail: 'called by ' + c.screens.map(lastSegment).join(', ') })), tab: 'modules', tabLabel: 'Modules' });
        }
        const channel = this.channel();
        if (channel && channel.target !== 'jet' && !channel.appFolderExists) {
          add({ id: 'app', name: 'Add the ' + channel.title + ' app to the code', count: '1 folder', level: 'High', source: 'target',
            why: 'The target channel\'s app folder has no package.json yet; commit the starter project there first.',
            evidence: [{ text: (channel.appFolder || '') + '/', detail: 'app folder (workspace setting)' }], tab: 'plan', tabLabel: 'Plan' });
        }
        return list;
      });

      // Migration phases by size (estimates: 1, 3 and 5 days per small, medium and large screen)
      this.phases = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        return ['S', 'M', 'L'].map((c, i) => {
          const screens = inv.screens.filter((x) => x.complexity === c);
          return {
            n: i + 1, name: 'Phase ' + (i + 1) + ': ' + SIZE[c].toLowerCase() + ' screens', count: screens.length, days: screens.length * DAYS[c],
            text: plural(screens.length, 'screen') + ' · ' + plural(screens.length * DAYS[c], 'day'),
            modules: Array.from(new Set(screens.map((x) => x.module))).join(', ') || 'none'
          };
        });
      });
      this.effortText = ko.pureComputed(() => plural(this.phases().reduce((sum, p) => sum + p.days, 0), 'day') + ' in total (1, 3 and 5 days per small, medium and large screen)');

      // Findings: compatibility of the two packs, and usage of what their rules forbid
      this.compatibility = ko.pureComputed(() => {
        const own = this.checks();
        const target = this.targetChecks();
        if (!own) {
          return [];
        }
        const rows = [{ name: 'Java level', now: 'Java ' + own.javaLevel + ' (' + own.javaLevelSource + ')', then: target ? 'Java ' + target.javaLevel : 'Same' }];
        if (target) {
          const targetIds = new Set(target.rules.map(ruleKey));
          const dropped = own.rules.filter((r) => !targetIds.has(r.id));
          rows.push({ name: 'Rules added', now: '–', then: this.newRules().map((r) => r.id).join(', ') || 'None' });
          rows.push({ name: 'Rules dropped', now: dropped.map((r) => r.id).join(', ') || 'None', then: '–' });
        }
        return rows;
      });
      this.severityFilter = ko.observable('');
      this.findingSearch = ko.observable('');
      this.findingModule = ko.observable('');
      this.severityChips = ko.pureComputed(() => [{ value: '', label: 'All' }, { value: 'ERROR', label: 'Errors', dot: 'is-danger' }, { value: 'WARNING', label: 'Warnings', dot: 'is-warning' }].map((c) => {
        const n = this.findings().filter((f) => !c.value || f.severity === c.value).length;
        return { value: c.value || 'all', dot: c.dot ? 'factory-rq-fdot ' + c.dot : '', text: c.label + ' ' + n, pressed: this.severityFilter() === c.value ? 'true' : 'false', pick: () => this.severityFilter(c.value) };
      }));
      this.findingModuleOptions = ko.pureComputed(() => [{ value: '', label: 'All modules' }]
        .concat(Array.from(new Set(this.findings().map((f) => f.module).filter(Boolean))).sort().map((m) => ({ value: m, label: m }))));
      this.visibleFindings = ko.pureComputed(() => {
        const text = this.findingSearch().trim().toLowerCase();
        return this.findings().filter((f) => (!this.severityFilter() || f.severity === this.severityFilter())
          && (!this.findingModule() || f.module === this.findingModule())
          && (!text || (f.rule + ' ' + f.ruleId + ' ' + f.path).toLowerCase().indexOf(text) >= 0));
      });
      this.findingsShown = ko.pureComputed(() => {
        const n = this.visibleFindings().length;
        return n === this.findings().length ? plural(n, 'use') : n + ' of ' + this.findings().length + ' shown';
      });
      this.clearFindingFilters = () => {
        this.severityFilter('');
        this.findingSearch('');
        this.findingModule('');
      };
      this.findingsSummary = ko.pureComputed(() => {
        const n = this.findings().length;
        return this.searchingFindings() ? 'Searching the code...' : n + ' use' + (n === 1 ? '' : 's') + ' of forbidden APIs, ' + critical() + ' breaking an error rule.';
      });
      const findUsage = (workspaceId, rules) => {
        this.findings([]);
        const candidates = rules.filter((r) => r.forbid && r.enabled && r.matchesProfile !== false).map((r) => ({ rule: r, term: searchTerm(r.forbid) })).filter((c) => c.term);
        if (!candidates.length) {
          return Promise.resolve();
        }
        this.searchingFindings(true);
        return Promise.all(candidates.map((c) => api.get('workspaces/' + workspaceId + '/search?q=' + encodeURIComponent(c.term) + '&limit=20').then((res) => {
          const pattern = toRegExp(c.rule.forbid);
          if (!pattern) {
            return [];
          }
          const seen = {};
          return res.results.filter((hit) => !seen[hit.path] && pattern.test(hit.snippet) && (seen[hit.path] = true)).map((hit) => ({
            rule: c.rule.title, ruleId: c.rule.id, severity: c.rule.severity, path: hit.path, module: moduleOfFile(hit.path) || hit.path.split('/').slice(-2, -1)[0] || '',
            startLine: hit.startLine, endLine: hit.endLine, lines: hit.startLine + '-' + hit.endLine, replacement: c.rule.message,
            pack: c.rule.origin === 'TARGET' ? 'Target pack' : c.rule.target ? 'OBDX ' + this.target() + ' only' : c.rule.origin === 'BANK' ? 'Bank pack' : 'OBDX ' + this.version(),
            pill: c.rule.severity === 'ERROR' ? pill('Error', 'red') : pill('Warning', 'amber'),
            open: () => openInCode(hit.path, hit.startLine, hit.endLine),
            menuAction: (event) => {
              const action = event.detail.value;
              if (action === 'ask') {
                this.askAbout('How do I replace "' + c.rule.title + '" (' + c.rule.id + ') in ' + hit.path + ' lines ' + hit.startLine + '-' + hit.endLine + '? The rule says: ' + c.rule.message);
              } else {
                ui.copy(hit.path).then(() => toast.success('Copied ' + hit.path), () => toast.error('Could not copy. Select the text and copy it instead.'));
              }
            }
          }));
        }).catch(() => []))).then((lists) => {
          if (workspaceId === this.workspaceId()) {
            this.findings([].concat.apply([], lists));
          }
        }).finally(() => this.searchingFindings(false));
      };
      // The rules searched: this workspace's, plus the ones only the target version has (marked target)
      const searchRules = () => ownRules().concat(this.newRules().map((r) => Object.assign({ target: true }, r)));
      this.ruleRows = ko.pureComputed(() => ownRules().map((r) => ({ r: r, pack: r.origin === 'TARGET' ? r.source : r.origin === 'BANK' ? 'Bank pack' : 'OBDX ' + this.version() }))
        .concat(this.newRules().map((r) => ({ r: r, pack: 'OBDX ' + this.target() + ' only' })))
        .map((x) => ({
          id: x.r.id, title: x.r.title, message: x.r.message, pack: x.pack, appliesTo: x.r.appliesTo,
          severity: x.r.severity === 'ERROR' ? pill('Error', 'red') : pill('Warning', 'amber'),
          on: !x.r.enabled ? 'Off' + (x.r.disabledBy ? ' (' + x.r.disabledBy + ')' : '') : x.r.matchesProfile === false ? 'Not for this code' : 'On'
        })));
      this.ruleSummary = ko.pureComputed(() => {
        const rows = this.ruleRows();
        return rows.length + ' rules, ' + rows.filter((r) => r.on === 'On').length + ' on for this code';
      });
      // The menu of each forbidden usage row (opening the file is its own button)
      this.findingItems = [{ value: 'ask', label: 'Ask the assistant how to replace it' }, { value: 'copy', label: 'Copy the file path' }];

      // Plan: services and roles, prerequisites, validation gates, flows and rollback
      this.serviceCounts = ko.pureComputed(() => {
        const inv = this.inventory();
        return inv ? plural(inv.calls.length, 'service call') + ' from the screens (' + inv.calls.filter((c) => !c.endpoint).length + ' outside this code) and '
          + plural(inv.endpoints.length, 'backend service') + ' in this code' : '';
      });
      this.openCodeMap = () => {
        pageRequests.codeTab('map');
        go('code');
      };
      this.roles = ko.pureComputed(() => (this.inventory() ? this.inventory().roles : []).map((r) => ({ name: r.name, source: r.source, evidence: r.evidence.join(', ') })));
      this.flows = ko.pureComputed(() => (this.inventory() ? this.inventory().flows : []).map((f) => ({ name: f.name, steps: f.steps.join(' → ') })));
      this.csvUrl = ko.pureComputed(() => 'api/workspaces/' + this.workspaceId() + '/inventory/screens.csv');
      this.prerequisites = ko.pureComputed(() => {
        const w = this.workspace();
        const inv = this.inventory();
        if (!w || !inv) {
          return [];
        }
        const java = fact('backend.javaVersion');
        const channel = this.channel();
        const list = [
          { text: 'Code imported and indexed', detail: w.indexedRevision != null ? 'Indexed at r' + w.indexedRevision + '.' : 'Import the code on the Code page.', state: w.indexedRevision != null ? 'ok' : 'todo' },
          { text: 'Analysis matches the indexed code', detail: w.indexedRevision == null || inv.revision === w.indexedRevision ? 'Analysis of r' + inv.revision + '.'
            : 'Analysis of r' + inv.revision + ', code indexed at r' + w.indexedRevision + '. Run Analysis again.', state: w.indexedRevision == null || inv.revision === w.indexedRevision ? 'ok' : 'todo' },
          { text: 'Codebase facts', detail: this.profile() ? 'Discovered at r' + this.profile().revision + '.' : 'No codebase facts yet: refresh discovery on Code › Codebase facts.', state: this.profile() ? 'ok' : 'todo' },
          { text: 'Java ' + (targetJava() || '?') + ' for OBDX ' + this.target(), detail: java ? 'This code: Java ' + java + ' (codebase facts).' : 'The Java version is not detected; set it on Code › Codebase facts.',
            state: !java || !targetJava() ? 'unknown' : Number(java) >= targetJava() ? 'ok' : 'todo' }
        ];
        if (channel && channel.target !== 'jet') {
          list.push({ text: channel.title + ' app in ' + channel.appFolder + '/', detail: channel.appFolderExists ? 'Found in the code (target pack check).' : 'Not in the code yet: commit the starter project there.',
            state: channel.appFolderExists ? 'ok' : 'todo' });
        }
        return list.map((p) => Object.assign(p, { st: state(p.state) }));
      });
      this.gates = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const errors = critical();
        const warnings = this.findings().length - errors;
        return [
          { text: 'No breaks of error rules', detail: this.searchingFindings() ? 'Searching the code...' : errors + ' found in the code (version pack rules).', state: this.searchingFindings() ? 'unknown' : errors ? 'fail' : 'pass' },
          { text: 'Warnings reviewed', detail: warnings + ' warning' + (warnings === 1 ? '' : 's') + ' in the code. The factory does not record reviews of them.', state: warnings ? 'untracked' : 'pass' },
          { text: 'Changes pass their checks and build', detail: 'Each factory change runs the quick checks and its build before delivery (Build, Test & Review).', state: 'untracked' },
          { text: 'User flows retested', detail: inv.flows.length + ' flow' + (inv.flows.length === 1 ? '' : 's') + ' found in the code to retest. The factory does not record test results for a migration.', state: 'untracked' }
        ].map((g) => Object.assign(g, { st: state(g.state) }));
      });
      this.gateText = ko.pureComputed(() => {
        const g = this.gates();
        const pass = g.filter((x) => x.state === 'pass').length;
        return 'Not complete. The factory does not record a migration as complete; ' + pass + ' of ' + g.length + ' gates pass now'
          + (this.newApp() && this.progressLine() ? ', and ' + this.progressLine() + ' (app code delivered).' : '.');
      });
      this.rollback = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const list = [
          'The analysis is of r' + inv.revision + ': the revision to go back to if a phase fails.',
          'Factory changes are delivered on their own SVN branch, one commit per change; the main line stays as it is until the bank merges them.'
        ];
        if (inv.summary.callsWithoutBackend) {
          list.push(inv.summary.callsWithoutBackend + ' services the UI calls are outside this code (usually Oracle product services); they do not roll back with it.');
        }
        list.push(fact('data.scriptFolders') ? 'Database scripts (' + fact('data.scriptFolders') + ') are not part of this analysis: plan their rollback separately.'
          : 'Database changes are not part of this analysis: plan their rollback separately.');
        return list;
      });
      this.notes = ko.pureComputed(() => (this.inventory() ? this.inventory().notes : []));
      this.historyOpen = ko.observable(false);
      this.openHistory = () => this.historyOpen(true);

      // The assistant: model-written answers from the page's data, in a side panel the user opens
      this.ai = assistant.create(() => {
        const inv = this.inventory();
        if (!inv) {
          return '';
        }
        const s = inv.summary;
        return 'Workspace on OBDX ' + this.version() + ', target ' + this.target() + ', target channel ' + (this.channel() ? this.channel().title : 'unknown')
          + '.\nInventory: ' + s.screens + ' screens in ' + s.modules + ' modules (small ' + s.complexity.S
          + ', medium ' + s.complexity.M + ', large ' + s.complexity.L + '), ' + s.endpoints + ' backend services, ' + s.calledServices + ' services called by the UI ('
          + s.callsWithoutBackend + ' outside this code), ' + s.roles + ' roles, ' + s.flows + ' flows.\nModules: ' + this.modules().map((m) => m.name + ' (' + m.count + ' screens'
            + (this.newApp() ? ', ' + CONVERSION[m.conversion.key].name.toLowerCase() : '') + ')').join(', ')
          + '\nStack: ' + this.endpoints().map((r) => r.label + ': ' + r.value).join('; ')
          + '\nRules only in the target version: ' + this.newRules().map((r) => r.id + ' (' + r.title + ')').join('; ')
          + '\nForbidden usage found: ' + this.findings().slice(0, 40).map((f) => f.ruleId + ' in ' + f.path + ':' + f.lines).join('; ')
          + '\nLarge screens: ' + inv.screens.filter((x) => x.complexity === 'L').slice(0, 20).map((x) => x.name).join(', ');
      }, ['What are the main changes for the upgrade?', 'Draft a migration plan', 'Which screens should go first?', 'Explain the forbidden usage']);
      this.aiOpen = ko.observable(false);
      this.openAssistant = () => this.aiOpen(true);
      this.askAbout = (question) => {
        this.aiOpen(true);
        this.ai.ask(question);
      };

      // ---------- Before the first analysis: the start steps ----------

      this.startSteps = ko.pureComputed(() => {
        const w = this.workspace();
        const c = this.channel();
        const indexed = w && w.indexedRevision != null;
        return [
          { n: 1, title: 'Import the code', text: indexed ? 'Indexed at r' + w.indexedRevision + '.' : 'Import the workspace\'s code on the Code page.', st: state(indexed ? 'ok' : 'todo') },
          { n: 2, title: 'Choose the new app', text: c ? (c.target === 'jet' ? 'Oracle JET for now: an OBDX upgrade only. React Native or React can be chosen any time.' : c.title + ' in ' + c.appFolder + '/.') : 'Loading…',
            st: state(c && c.target !== 'jet' ? 'ok' : 'unknown') },
          { n: 3, title: 'Run Analysis', text: 'Scans the screens, services, roles and flows, without a model. It runs again after every import.', st: state('todo') }
        ];
      });
      this.openCode = () => go('code');

      const show = (inventory) => {
        this.errorMessage('');
        this.inventory(inventory);
        this.emptyMessage(inventory ? '' : 'This workspace has not been analysed yet.');
      };
      const load = (id) => {
        this.inventory(null);
        this.profile(null);
        this.workspace(null);
        this.channel(null);
        this.changes([]);
        this.checks(null);
        this.targetChecks(null);
        this.findings([]);
        this.errorMessage('');
        this.emptyMessage('');
        this.moduleName('');
        this.clearModuleFilters();
        this.clearFindingFilters();
        if (!id) {
          return;
        }
        const current = () => id === this.workspaceId();
        this.loading(true);
        api.get('workspaces/' + id + '/target').then((t) => { if (current()) { this.channel(t); } }).catch(() => null);
        if (!this.packs().length) {
          api.get('targets').then((list) => this.packs(list || [])).catch(() => null);
        }
        api.get('workspaces/' + id + '/changes/details').then((list) => { if (current()) { this.changes(list || []); } }).catch(() => null);
        // A workspace whose code was never indexed has no profile, so it is not asked for
        const workspace = api.get('workspaces/' + id).then((w) => {
          if (current()) {
            this.workspace(w);
          }
          if (w.indexedRevision != null) {
            api.get('workspaces/' + id + '/profile').then((p) => { if (current()) { this.profile(p); } }).catch(() => null);
          }
          return w;
        });
        Promise.all([workspace, api.get('workspaces/' + id + '/checks')]).then(([w, own]) => {
          const to = w.obdxVersion === '22.x' ? '25.x' : w.obdxVersion;
          return (to !== w.obdxVersion ? api.get('workspaces/' + id + '/checks?version=' + encodeURIComponent(to)) : Promise.resolve(null)).catch(() => null)
            .then((other) => {
              if (current()) {
                this.checks(own);
                this.targetChecks(other);
                findUsage(id, searchRules());
              }
            });
        }).catch(() => null);
        api.get('workspaces/' + id + '/inventory')
          .then((inventory) => { if (current()) { show(inventory || null); } })
          .catch((e) => { if (current()) { showError(e); } })
          .finally(() => { if (current()) { this.loading(false); } });
      };
      this.scan = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/inventory/scan')
          .then((inventory) => { show(inventory); toast.success('Analysis done: ' + (inventory ? inventory.summary.screens + ' screens in ' + inventory.summary.modules + ' modules.' : 'nothing to scan.')); })
          .catch(actionError).finally(() => this.busy(false));
      };
      this.rescanFindings = () => findUsage(this.workspaceId(), searchRules())
        .then(() => toast.info('Searched the code again: ' + this.findings().length + ' use' + (this.findings().length === 1 ? '' : 's') + ' of forbidden APIs.'));
      this.moreItems = ko.pureComputed(() => [
        { value: 'scan', label: 'Run Analysis again', disabled: this.busy() || !this.canScan() || !this.workspaceId() },
        { value: 'findings', label: 'Search for forbidden usage again', disabled: !this.inventory() || this.searchingFindings() },
        { value: 'csv', label: 'Download screens as CSV', disabled: !this.inventory() },
        { value: 'target', label: 'Change the target in Code › Settings' },
        { value: 'map', label: 'Open Code › Map', disabled: !this.inventory() },
        { value: 'facts', label: 'Open the codebase facts' },
        { value: 'checks', label: 'Open the quick check rules' }]);
      this.moreAction = (event) => {
        const action = event.detail.value;
        if (action === 'scan') {
          this.scan();
        } else if (action === 'findings') {
          this.rescanFindings();
        } else if (action === 'csv') {
          window.location.href = this.csvUrl();
        } else if (action === 'target') {
          this.changeChannel();
        } else if (action === 'map') {
          this.openCodeMap();
        } else if (action === 'facts' || action === 'checks') {
          pageRequests.codeTab(action);
          go('code');
        }
      };
      this.goTab = (name) => () => this.tab(name);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Code analysis page loaded.');
        document.title = 'Code analysis';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ModernizationViewModel;
  }
);
