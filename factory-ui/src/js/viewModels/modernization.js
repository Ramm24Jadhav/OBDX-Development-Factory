/*
 * Modernization page: planning an OBDX upgrade or a new channel from evidence. The inventory scanned from the code
 * (modules, screens and their complexity, services, roles, flows), the stack from the Project Profile, the rules of
 * the workspace's version pack and of the version it moves to (usage of what they forbid is found with code search and
 * checked against each rule's pattern), and the workspace's target channel. Everything on the page is a detected fact
 * with its source, or an estimate said to be one; model-written text appears only in the assistant panel.
 * Migration completion is not recorded by the factory: the plan shows the gates and their state, never "complete".
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/assistant', '../services/toast', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant, toast, pageRequests) {
    const pill = ui.pill;
    const lastSegment = (id) => id.substring(id.lastIndexOf('/') + 1);
    // Days of work per screen by complexity, for the effort estimate
    const DAYS = { S: 1, M: 3, L: 5 };
    const SIZE = { S: 'Small', M: 'Medium', L: 'Large' };
    // Evidence rows shown per opportunity before "more in ..."
    const EVIDENCE = 6;
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const go = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    /** The Code page's viewer at the given lines. */
    const openInCode = (path, from, to) => {
      pageRequests.codeFile({ path: path, startLine: from || 1, endLine: to || from || 1 });
      go('code');
    };
    // Where a fact comes from (shown next to it); AI text is only in the assistant panel
    const SOURCE = {
      scan: 'Detected: code scan', rules: 'Detected: version pack rules', target: 'Detected: target pack check', profile: 'Detected: Project Profile',
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
      this.workspace = ko.observable(null);
      this.inventory = ko.observable(null);
      this.profile = ko.observable(null);
      this.channel = ko.observable(null);
      this.checks = ko.observable(null);
      this.targetChecks = ko.observable(null);
      this.findings = ko.observableArray([]);
      this.searchingFindings = ko.observable(false);
      this.loading = ko.observable(false);
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.tab = ko.observable('overview');
      this.tabs = ui.tabs(this.tab, [
        { value: 'overview', label: 'Overview' }, { value: 'findings', label: 'Findings' }, { value: 'dependencies', label: 'Dependencies' },
        { value: 'plan', label: 'Plan' }, { value: 'history', label: 'History' }
      ]);
      // Loading problems stay on the page; the result of an action is a toast
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      const summary = ko.pureComputed(() => (this.inventory() ? this.inventory().summary : null));
      const factOf = (key) => (this.profile() ? this.profile().facts.find((x) => x.key === key && x.value) || null : null);
      const fact = (key) => (factOf(key) ? factOf(key).value : null);
      this.scannedText = ko.pureComputed(() => (this.inventory() ? ui.when(this.inventory().scannedAt) : ''));
      this.version = ko.pureComputed(() => (this.workspace() ? this.workspace().obdxVersion : ''));
      // The target is the newest version pack
      this.target = ko.pureComputed(() => (this.version() === '22.x' ? '25.x' : this.version()));
      this.upgrade = ko.pureComputed(() => !!this.version() && this.version() !== this.target());
      this.statusText = ko.pureComputed(() => {
        const inv = this.inventory();
        const s = summary();
        return inv ? 'Analysis of r' + inv.revision + ' on ' + this.scannedText() + ': ' + s.screens + ' screens in ' + s.modules + ' modules.' : '';
      });

      // Source and target: version, technology, channel; each with where the value comes from
      this.endpoints = ko.pureComputed(() => {
        const ui1 = factOf('ui.jetVersion') || factOf('ui.architecture');
        const java = factOf('backend.javaVersion');
        const channel = this.channel();
        const tech = (f, prefix) => (f ? (prefix || '') + f.value.replace(/\s*\(\d+ files?\)$/, '') : 'Not detected');
        const factSource = (f) => (f ? { text: 'Project Profile: ' + (f.status === 'detected' ? 'detected, ' + String(f.confidence).toLowerCase() + ' confidence' : f.status),
          css: 'fx-badge fx-badge--info factory-mz-src' } : { text: 'Unknown', css: 'fx-badge fx-badge--neutral factory-mz-src' });
        const targetJava = this.targetChecks() ? this.targetChecks().javaLevel : this.checks() ? this.checks().javaLevel : null;
        return [
          { id: 'mzSourceVersion', label: 'Source version', value: 'OBDX ' + this.version(), src: source('setting') },
          { id: 'mzSourceTech', label: 'Source technology', value: (ui1 ? tech(ui1, factOf('ui.jetVersion') ? 'Oracle JET ' : '') : 'UI not detected') + (java ? ' · Java ' + java.value : ''), src: factSource(ui1 || java) },
          { id: 'mzTargetVersion', label: 'Target version', value: 'OBDX ' + this.target() + (targetJava ? ' · Java ' + targetJava : ''), src: source('pack') },
          { id: 'mzTargetChannel', label: 'Target channel', value: channel ? channel.title + (channel.appFolder ? ' in ' + channel.appFolder + '/' : '') : '–', src: source('setting') }
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

      // Opportunities: each one detected, with its evidence (files at lines, rule ids) and where it comes from
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
            more: o.evidence.length > EVIDENCE ? (o.evidence.length - EVIDENCE) + ' more in ' + o.tabLabel : '', showMore: () => this.tab(o.tab)
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
            evidence: large.map((x) => ({ text: x.name, detail: x.module + ' · score ' + x.score, path: x.files[0] })), tab: 'plan', tabLabel: 'Plan' });
        }
        const outside = inv.calls.filter((c) => !c.endpoint);
        if (outside.length) {
          add({ id: 'outside', name: 'Check the services outside this code', count: plural(outside.length, 'service'), level: 'Medium', source: 'scan',
            why: 'The UI calls them but they are not in this codebase; usually Oracle OBDX product services.',
            evidence: outside.map((c) => ({ text: c.method + ' ' + c.path, detail: 'called by ' + c.screens.map(lastSegment).join(', ') })), tab: 'dependencies', tabLabel: 'Dependencies' });
        }
        const channel = this.channel();
        if (channel && channel.target !== 'jet' && !channel.appFolderExists) {
          add({ id: 'app', name: 'Add the ' + channel.title + ' app to the code', count: '1 folder', level: 'High', source: 'target',
            why: 'The target channel\'s app folder has no package.json yet; commit the starter project there first.',
            evidence: [{ text: (channel.appFolder || '') + '/', detail: 'app folder (workspace setting)' }], tab: 'plan', tabLabel: 'Plan' });
        }
        return list;
      });

      // Migration phases by complexity (estimates: 1, 3 and 5 days per small, medium and large screen)
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
            screens: screens.map((x) => ({ name: x.name, module: x.module, path: x.files[0], open: () => openInCode(x.files[0], 1, 1) }))
          };
        });
      });
      this.effortText = ko.pureComputed(() => plural(this.phases().reduce((sum, p) => sum + p.days, 0), 'day') + ' in total (1, 3 and 5 days per small, medium and large screen)');
      // Risk: the screen size mix, as one bar
      this.risk = ko.pureComputed(() => {
        const s = summary();
        if (!s || !s.screens) {
          return [];
        }
        return [{ key: 'L', label: 'Large', tone: 'danger' }, { key: 'M', label: 'Medium', tone: 'warning' }, { key: 'S', label: 'Small', tone: 'success' }].map((p) => ({
          label: p.label, n: s.complexity[p.key], css: 'factory-mz-mix-' + p.tone, style: { flexGrow: String(s.complexity[p.key]) },
          text: p.label + ': ' + s.complexity[p.key]
        }));
      });
      this.riskLabel = ko.pureComputed(() => 'Screens by size: ' + this.risk().map((r) => r.text).join(', '));
      this.riskRows = ko.pureComputed(() => {
        const s = summary();
        if (!s) {
          return [];
        }
        return [
          { text: 'Breaks of error rules', n: critical(), tab: 'findings' },
          { text: 'Large screens', n: s.complexity.L, tab: 'plan' },
          { text: 'Services outside this code', n: s.callsWithoutBackend, tab: 'dependencies' }
        ].map((r) => Object.assign(r, { pill: r.n ? pill(String(r.n), 'amber') : pill('0', 'green'), open: () => this.tab(r.tab) }));
      });

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
      this.findingSearchInput = ui.value(this.findingSearch);
      this.findingModule = ko.observable('');
      this.severityOptions = [{ value: '', label: 'All severities' }, { value: 'ERROR', label: 'Errors' }, { value: 'WARNING', label: 'Warnings' }];
      this.findingModuleOptions = ko.pureComputed(() => [{ value: '', label: 'All modules' }]
        .concat(Array.from(new Set(this.findings().map((f) => f.module).filter(Boolean))).sort().map((m) => ({ value: m, label: m }))));
      this.visibleFindings = ko.pureComputed(() => {
        const text = this.findingSearch().trim().toLowerCase();
        return this.findings().filter((f) => (!this.severityFilter() || f.severity === this.severityFilter())
          && (!this.findingModule() || f.module === this.findingModule())
          && (!text || (f.rule + ' ' + f.ruleId + ' ' + f.path).toLowerCase().indexOf(text) >= 0));
      });
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
            rule: c.rule.title, ruleId: c.rule.id, severity: c.rule.severity, path: hit.path, module: hit.path.split('/').slice(-2, -1)[0] || '',
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

      // Dependencies: impact per module, the services the screens call, the backend services and roles
      this.moduleRows = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const outside = new Set(inv.calls.filter((c) => !c.endpoint).map((c) => c.method + ' ' + c.path));
        return inv.modules.map((m) => {
          const screens = inv.screens.filter((x) => x.module === m.name);
          const calls = new Set([].concat.apply([], screens.map((x) => x.calls)));
          const out = Array.from(calls).filter((c) => outside.has(c) || outside.has(c.replace(/^\?/, 'GET'))).length;
          return {
            name: m.name, screens: m.screens, large: m.complexity.L || 0, calls: calls.size, outside: out,
            pill: m.complexity.L ? pill('Has large screens', 'red') : m.complexity.M ? pill('Medium', 'amber') : pill('Small', 'green')
          };
        });
      });
      // The services the screens call and the backend services are on Code › Map (one list of the same scan)
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

      // Plan: the screens by phase, prerequisites, validation gates and rollback
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.moduleFilter = ko.observable('');
      this.moduleOptions = ko.pureComputed(() => [{ value: '', label: 'All modules' }].concat((this.inventory() ? this.inventory().modules : []).map((m) => ({ value: m.name, label: m.name }))));
      this.screenRows = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const text = this.search().trim().toLowerCase();
        const names = {};
        inv.screens.forEach((s) => { names[s.id] = s.name; });
        return inv.screens.filter((s) => !this.moduleFilter() || s.module === this.moduleFilter())
          .filter((s) => !text || (s.name + ' ' + s.files.join(' ') + ' ' + s.calls.join(' ')).toLowerCase().indexOf(text) >= 0)
          .map((s) => ({
            name: s.name, module: s.module, file: s.files[0], files: s.files.join(', '),
            wave: s.complexity === 'S' ? 'Phase 1' : s.complexity === 'M' ? 'Phase 2' : 'Phase 3',
            pill: s.complexity === 'L' ? pill('Large', 'red') : s.complexity === 'M' ? pill('Medium', 'amber') : pill('Small', 'green'),
            fields: s.fields.length, actions: s.actions, calls: s.calls.join(', ') || '-',
            opens: s.opens.map((id) => names[id] || lastSegment(id)).join(', ') || '-', open: () => openInCode(s.files[0], 1, 1)
          }));
      });
      this.flows = ko.pureComputed(() => (this.inventory() ? this.inventory().flows : []).map((f) => ({ name: f.name, steps: f.steps.join(' → ') })));
      this.csvUrl = ko.pureComputed(() => 'api/workspaces/' + this.workspaceId() + '/inventory/screens.csv');
      this.prerequisites = ko.pureComputed(() => {
        const w = this.workspace();
        const inv = this.inventory();
        if (!w || !inv) {
          return [];
        }
        const java = fact('backend.javaVersion');
        const targetJava = this.targetChecks() ? this.targetChecks().javaLevel : this.checks() ? this.checks().javaLevel : null;
        const channel = this.channel();
        const list = [
          { text: 'Code imported and indexed', detail: w.indexedRevision != null ? 'Indexed at r' + w.indexedRevision + '.' : 'Import the code on the Code page.', state: w.indexedRevision != null ? 'ok' : 'todo' },
          { text: 'Analysis matches the indexed code', detail: w.indexedRevision == null || inv.revision === w.indexedRevision ? 'Analysis of r' + inv.revision + '.'
            : 'Analysis of r' + inv.revision + ', code indexed at r' + w.indexedRevision + '. Run Analysis again.', state: w.indexedRevision == null || inv.revision === w.indexedRevision ? 'ok' : 'todo' },
          { text: 'Project Profile', detail: this.profile() ? 'Discovered at r' + this.profile().revision + '.' : 'No profile yet: refresh discovery on the Project Profile page.', state: this.profile() ? 'ok' : 'todo' },
          { text: 'Java ' + (targetJava || '?') + ' for OBDX ' + this.target(), detail: java ? 'This code: Java ' + java + ' (Project Profile).' : 'The Java version is not detected; confirm it on the Project Profile page.',
            state: !java || !targetJava ? 'unknown' : Number(java) >= targetJava ? 'ok' : 'todo' }
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
        return 'Not complete. The factory does not record a migration as complete; ' + pass + ' of ' + g.length + ' gates pass now.';
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
          + s.callsWithoutBackend + ' outside this code), ' + s.roles + ' roles, ' + s.flows + ' flows.\nModules: ' + inv.modules.map((m) => m.name + ' (' + m.screens + ')').join(', ')
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

      const show = (inventory) => {
        this.errorMessage('');
        this.inventory(inventory);
        this.emptyMessage(inventory ? '' : 'This workspace has not been analysed yet. Import its code (Code page), then Run Analysis.');
      };
      const load = (id) => {
        this.inventory(null);
        this.profile(null);
        this.workspace(null);
        this.channel(null);
        this.checks(null);
        this.targetChecks(null);
        this.findings([]);
        this.errorMessage('');
        this.emptyMessage('');
        if (!id) {
          return;
        }
        const current = () => id === this.workspaceId();
        this.loading(true);
        api.get('workspaces/' + id + '/target').then((t) => { if (current()) { this.channel(t); } }).catch(() => null);
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
        { value: 'findings', label: 'Search for forbidden usage again', disabled: !this.inventory() || this.searchingFindings() },
        { value: 'csv', label: 'Download screens as CSV', disabled: !this.inventory() },
        { value: 'profile', label: 'Open the Project Profile' },
        { value: 'packs', label: 'Open the Version Packs' }]);
      // The menu of each forbidden usage row (opening the file is its own button)
      this.findingItems = [{ value: 'ask', label: 'Ask the assistant how to replace it' }, { value: 'copy', label: 'Copy the file path' }];
      this.moreAction = (event) => {
        const action = event.detail.value;
        if (action === 'findings') {
          this.rescanFindings();
        } else if (action === 'csv') {
          window.location.href = this.csvUrl();
        } else {
          go(action);
        }
      };
      this.goTab = (name) => () => this.tab(name);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Modernization page loaded.');
        document.title = 'Modernization';
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
