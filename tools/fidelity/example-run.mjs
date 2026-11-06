// Example run data for the side-by-side check of the pages that need a modernization run (Workspace, Validation,
// Review, History). The screenshot tool serves it in the browser only, in place of the run endpoints, so nothing is
// stored and no model is called. The run points at a real change of the test factory, so its files are real.
//   EXAMPLE_CHANGE=<change id> node tools/fidelity/shoot.mjs pages --example modernization-workspace=Workspace ...
export function exampleRoutes(changeId) {
  const runId = '00000000-0000-4000-8000-000000000057';
  const at = (h) => new Date(Date.UTC(2026, 10, 6, 8 + h, 10)).toISOString();
  const run = {
    id: runId, path: 'migration', subject: 'payments', screens: ['Make a payment', 'Payment summary', 'Add payee', 'Manage payees'], technology: 'react',
    requirementId: null, changeId: changeId, changeTitle: 'Payments moved to React', changeStatus: 'GENERATED', state: 'validating', open: true, message: null,
    startedBy: 'admin', startedAt: at(0), finishedAt: null, deliveredRevision: null, securityBy: null, securityAt: null
  };
  const rules = [['R1', 'Same digx services', 'passed'], ['R2', 'Session cookie through OHS', 'passed'], ['R3', 'Nonce from /digx/v1/session/nonce', 'passed'],
    ['R4', 'Server-driven 2FA', 'passed'], ['R5', 'Masked tokens', 'passed'], ['R6', 'Password encryption', 'passed'], ['R7', 'Role menus', 'passed'],
    ['R8', 'Labels and validations', 'failed']].map((r) => ({ id: r[0], text: r[1], result: r[2], failing: r[2] === 'failed' ? ['src/modules/payments/PaymentForm.tsx'] : [] }));
  const detail = {
    run: run, brief: 'Convert the payments module to React with TypeScript. Keep the validation rules, session handling and OBDX service calls.',
    components: [{ element: 'oj-input-text', premium: 'TextField', compatibility: 'direct', uses: 14 }, { element: 'oj-radioset', premium: 'RadioGroup', compatibility: 'direct', uses: 6 },
      { element: 'oj-input-number', premium: 'AmountInput', compatibility: 'mapping', uses: 4 }, { element: 'oj-button', premium: 'Button', compatibility: 'direct', uses: 12 }],
    dependencies: [{ module: 'accounts', state: 'delivered' }, { module: 'payees', state: 'in-progress' }],
    rules: rules, calls: ['/digx/v1/payments/transfers', '/digx/v1/accounts/demandDeposit', '/digx/v1/payments/payees'],
    screenNames: run.screens
  };
  const count = (t, p, f) => ({ total: t, passed: p, failed: f, skipped: t - p - f });
  const validation = {
    run: run,
    build: { number: 58, url: null, job: 'modernize-react', result: 'UNSTABLE', round: 2, startedAt: at(1), finishedAt: at(1), errors: [], log: '' },
    published: true, totals: count(246, 241, 5),
    byType: { unit: count(180, 178, 2), functional: count(24, 23, 1), api: count(18, 18, 0), security: count(10, 10, 0), accessibility: count(8, 6, 2), ui: count(6, 6, 0), performance: count(4, 4, 0) },
    suites: [{ name: 'PaymentForm', type: 'unit', total: 42, passed: 41, failed: 1, skipped: 0, seconds: 3.2, result: 'failed' },
      { name: 'PaymentService', type: 'unit', total: 38, passed: 38, failed: 0, skipped: 0, seconds: 1.4, result: 'passed' },
      { name: 'Make a payment journey', type: 'functional', total: 12, passed: 11, failed: 1, skipped: 0, seconds: 22.5, result: 'failed' },
      { name: 'Payments API contract', type: 'api', total: 18, passed: 18, failed: 0, skipped: 0, seconds: 4.1, result: 'passed' },
      { name: 'Accessibility (axe)', type: 'accessibility', total: 8, passed: 6, failed: 2, skipped: 0, seconds: 6.0, result: 'failed' }],
    failed: [{ suite: 'PaymentForm', type: 'unit', name: 'rejects an amount over the daily limit', error: 'Expected the error "Enter at most 50,000.00" but none was shown.' },
      { suite: 'Accessibility (axe)', type: 'accessibility', name: 'Payment summary', error: 'color-contrast: the fee line is 3.9:1' }],
    coverage: 84.5, gate: 80, rules: rules, calls: detail.calls, images: [], problem: null
  };
  const history = [{ run: Object.assign({}, run, { state: 'delivered', deliveredRevision: 1513, finishedAt: at(3) }), category: 'Migration', branch: 'branches/migration-react',
    files: 42, screens: 38, testsPassed: 246, testsTotal: 246, testsFailed: 0, fileProblems: 0, buildNumber: 58, buildResult: 'SUCCESS', minutes: 34, outcome: 'Delivered',
    steps: [{ at: at(0), by: 'admin', text: 'Run started', minutes: 0 }, { at: at(1), by: 'factory', text: 'Files written', minutes: 12 }, { at: at(2), by: 'Jenkins', text: 'Tests passed', minutes: 9 }],
    producedFiles: [{ path: 'web/src/modules/payments/PaymentForm.tsx', action: 'ADD', check: 'PASSED' }] }];
  return [
    [/\/modernization\/runs\/[^/]+\/detail$/, detail],
    [/\/modernization\/runs\/[^/]+\/validation$/, validation],
    [/\/modernization\/runs$/, [run]],
    [/\/modernization\/history$/, history]
  ];
}
