/*
 * Report page for bank administrators, opened without signing in. With ?token=... (an issue link) it reports an error
 * with logs and screenshots; with ?follow=... (the follow link a report returns) it shows that issue: its status, and
 * once an engineer released it the summary and the steps meant for the bank, and lets them say it works now or still
 * fails (with new logs). Only the token in the address gives access (?ojr=report&embed=1&token=...).
 */
define(['knockout', '../accUtils', '../services/api', '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, ui, toast) {
    const POLL_MS = 5000;
    const ACCEPTED = '.log,.txt,.out,.png,.jpg,.jpeg';
    const RESULT_WORDS = { CHECKING: 'Being checked', ERROR_GONE: 'The original error is gone', STILL_FAILING: 'Still failing',
      DIFFERENT_ERROR: 'A different error', NOT_COMPARABLE: 'Sent to the support team', FAILED: 'Sent to the support team',
      BANK_WORKS: 'Works now', BANK_STILL_FAILING: 'Still failing' };

    function ReportViewModel() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token') || '';
      this.followToken = ko.observable(params.get('follow') || '');
      this.accepted = ACCEPTED;
      this.errorMessage = ko.observable('');
      this.loading = ko.observable(true);
      const showError = (error) => this.errorMessage(ui.errorText(error));

      // Reporting through an issue link
      this.page = ko.observable(null);
      this.name = ko.observable('');
      this.email = ko.observable('');
      this.description = ko.observable('');
      this.environment = ko.observable('');
      this.environmentOptions = [{ value: '', label: 'Not sure' }].concat(['DEV', 'SIT', 'UAT', 'PROD'].map((e) => ({ value: e, label: e })));
      this.logText = ko.observable('');
      const files = ko.observableArray([]);
      this.fileRows = ko.pureComputed(() => files().map((f) => ({ name: f.name, remove: () => files.remove(f) })));
      this.filesSelected = (event) => { files(files().concat(Array.from(event.target.files || []))); event.target.value = ''; };
      this.canSend = ko.pureComputed(() => !!this.name().trim() && !!(this.description().trim() || this.logText().trim() || files().length));
      this.followUrl = ko.observable('');

      this.send = () => {
        const form = new FormData();
        [['name', this.name()], ['email', this.email()], ['description', this.description()], ['environment', this.environment()],
          ['logText', this.logText()]].forEach((p) => { if (p[1]) { form.append(p[0], p[1]); } });
        files().forEach((f) => form.append('files', f));
        api.upload('issue-report/' + encodeURIComponent(token), form).then((r) => {
          this.followUrl(window.location.origin + window.location.pathname + '?ojr=report&embed=1&follow=' + encodeURIComponent(r.followToken));
          this.description(''); this.logText(''); files([]);
          this.errorMessage('');
        }).catch(showError);
      };
      this.copyFollow = () => ui.copy(this.followUrl()).then(() => toast.success('Link copied.')).catch(() => toast.error('Select the link and copy it.'));
      this.reportAnother = () => this.followUrl('');

      // Following one issue
      this.view = ko.observable(null);
      this.steps = ko.pureComputed(() => (this.view() ? this.view().steps.map((s, i) => ({ title: (i + 1) + '. ' + s.action, why: s.why || '' })) : []));
      this.checks = ko.pureComputed(() => (this.view() ? this.view().checks.map((c) => ({
        result: RESULT_WORDS[c.result] || c.result, summary: c.summary, meta: c.by.replace(/^bank: /, '') + ' · ' + new Date(c.at).toLocaleString()
      })) : []));
      this.statusCss = ko.pureComputed(() => {
        const s = this.view() ? this.view().status : '';
        return 'fx-badge ' + (s === 'RESOLVED' ? 'fx-badge--success' : s === 'ESCALATED' ? 'fx-badge--warning' : 'fx-badge--primary');
      });
      this.answerName = ko.observable('');
      this.stillLog = ko.observable('');
      const stillFiles = ko.observableArray([]);
      this.stillRows = ko.pureComputed(() => stillFiles().map((f) => ({ name: f.name, remove: () => stillFiles.remove(f) })));
      this.stillSelected = (event) => { stillFiles(stillFiles().concat(Array.from(event.target.files || []))); event.target.value = ''; };
      const followBase = () => 'issue-follow/' + encodeURIComponent(this.followToken());
      let timer = null;
      const showView = (v) => {
        this.view(v);
        this.errorMessage('');
        clearTimeout(timer);
        if (v.checks.some((c) => c.result === 'CHECKING') || (!v.released && v.status !== 'RESOLVED' && v.status !== 'ESCALATED')) {
          timer = setTimeout(load, POLL_MS);
        }
      };
      const load = () => api.get(followBase()).then(showView).catch(showError).finally(() => this.loading(false));
      this.works = () => api.post(followBase() + '/works', { name: this.answerName() })
        .then((v) => { showView(v); toast.success('Thank you. The support team can see it works now.'); }).catch(showError);
      this.stillFailing = () => {
        const form = new FormData();
        form.append('name', this.answerName());
        if (this.stillLog()) { form.append('logText', this.stillLog()); }
        stillFiles().forEach((f) => form.append('files', f));
        api.upload(followBase() + '/still-failing', form).then((v) => {
          this.stillLog(''); stillFiles([]); showView(v);
          toast.success('Sent. The support team sees it, and the new logs are compared with the first ones.');
        }).catch(showError);
      };

      this.connected = () => {
        accUtils.announce('Report an issue page loaded.');
        document.title = this.followToken() ? 'Your reported issue' : 'Report an issue';
        if (this.followToken()) {
          load();
        } else if (token) {
          api.get('issue-report/' + encodeURIComponent(token)).then((p) => this.page(p)).catch(showError).finally(() => this.loading(false));
        } else {
          this.errorMessage('This page needs the link the support team sent you.');
          this.loading(false);
        }
      };
      this.disconnected = () => clearTimeout(timer);
    }

    return ReportViewModel;
  }
);
