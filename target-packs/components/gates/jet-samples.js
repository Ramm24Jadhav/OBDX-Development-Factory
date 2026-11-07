/*
 * The sample data of the JET gallery's examples (jet-gallery.html), one place for the gallery the gates run on and the
 * factory's Component factory page, which shows the same examples live. A function of knockout, so each page gets its own.
 */
define([], function () {
  return function (ko) {
  var vm = {
    // the banking widgets' variant (variants/v4.json) the page shows; empty for each one's own look
    variant: ko.observable(''),
    name: ko.observable('A. Sharma'),
    amount: ko.observable(1250),
    account: ko.observable('S'),
    alerts: ko.observableArray(['E']),
    speed: ko.observable('N'),
    day: ko.observable('2026-11-12'),
    tab: ko.observable('c'),
    bulk: ko.observableArray([]), accTab: ko.observable(''), txTab: ko.observable(''),
    message: ko.observable(''), period: ko.observable({ from: '2025-10-01', to: '2025-12-31' }), format: ko.observable('PDF'), terms: ko.observableArray([]), income: ko.observable(6000), saving: ko.observable(400), stars: ko.observable(0), places: [{ id: 'b1', name: 'London Bridge', type: 'branch', address: '1 Tooley St', distance: '0.4 km', hours: 'Open until 17:00' }, { id: 'a1', name: 'Borough ATM', type: 'atm', address: 'Borough High St', distance: '0.7 km' }], chat: [{ id: 'm1', from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }, { id: 'm2', from: 'customer', text: 'My card is stuck in an ATM.', time: '10:03' }], faq: [{ id: 'f1', title: 'How do I reset my password?', body: 'Choose Forgot password on the sign-in page.' }, { id: 'f2', title: 'Is mobile banking secure?', body: 'Yes: every sign-in and payment is checked, and codes expire.' }],
    cats: ko.observableArray([]), structure: ko.observable('Sweep'), signIn: ko.observableArray(['Passkey']), codesBy: ko.observable('SMS'), theme: ko.observable('System'), lang: ko.observable('en'), languages: [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }, { value: 'es', label: 'Español' }], alerts: ko.observableArray([]), quiet: ko.observable(true), approvers: [{ value: 'fh', label: 'Finance head' }, { value: 'tr', label: 'Treasury' }, { value: 'cfo', label: 'CFO' }], reroute: ko.observable(''),
    code: ko.observable(''), pin: ko.observable(''), controls: ko.observableArray(['Online payments']), blocked: ko.observable(false), emi: ko.observable('6 months'), points: ko.observable(5000), limit: ko.observable(2000), timeoutOpen: ko.observable(false), openTimeout: function () { vm.timeoutOpen(true); },
    account: ko.observable('s'), accounts: [{ value: 's', label: 'Savings ·· 4821', meta: 'Available 12,150.00' }, { value: 'c', label: 'Current ·· 7730', meta: 'Overdraft 1,000.00' }, { value: 'y', label: 'Salary ·· 1094' }], iban: ko.observable('GB29NWBK60161331926819'), payees: [{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }, { id: 'p2', name: 'J. Mehta', meta: 'Barclays ·· 1180' }], txns: [{ id: 't1', description: 'Coffee House', date: 'Today 08:14', amount: -4.5 }, { id: 't2', description: 'Salary', date: '31 Dec', amount: 3200 }, { id: 't3', description: 'Electricity', date: '28 Dec', amount: -86.2 }], txFilter: ko.observableArray([]), repeat: ko.observable('Once'), maturity: ko.observable(''), bills: [{ id: 'b1', title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }, { id: 'b2', title: 'Card ·· 4821', meta: 'Due 18 Jan', value: '640.00' }],
    saving: ko.observable(5000), show: ko.observable('Week'), filters: ko.observableArray(['Card']), crumbs: ['Accounts', 'Savings ·· 4821', 'Statement'], navSel: ko.observable('Accounts'), sheetOpen: ko.observable(false), openSheet: function () { vm.sheetOpen(true); }, page: ko.observable(2), faq: [{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank; up to 2 working days to other banks.' }, { id: 'b', title: 'Can I cancel a payment?', body: 'Yes, until it is sent.' }], openFaq: ko.observableArray(['a']), notes: [{ id: 'n1', title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }, { id: 'n2', title: 'New statement ready', meta: 'Today', value: 'Dec' }],
    remarks: ko.observable('Rent for November'),
    secret: ko.observable('s3cret-pass'),
    copies: ko.observable(2),
    currency: ko.observable('INR'),
    picked: ko.observableArray(['S']),
    paperless: ko.observable(true),
    period: ko.observable({ from: '2026-10-01', to: '2026-10-31' }),
    query: ko.observable('rent'),
    payee: ko.observable('P1'),
    proof: ko.observableArray([{ name: 'statement-october.pdf', type: 'application/pdf', size: 248000 }]),
    reasonError: [{ severity: 'error', summary: 'Say why you are cancelling.', detail: 'Say why you are cancelling.' }],
    pinError: [{ severity: 'error', summary: 'The PIN is wrong. 2 tries left.', detail: 'The PIN is wrong. 2 tries left.' }],
    tenureError: [{ severity: 'error', summary: 'Enter 60 or less.', detail: 'Enter 60 or less.' }],
    payees: [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }],
    selected: ko.observable({ row: ['t2'], column: [] }),
    refError: [{ severity: 'error', summary: 'Use letters and numbers only.', detail: 'Use letters and numbers only.' }],
    kwdError: [{ severity: 'error', summary: 'Enter at most 10.000.', detail: 'Enter at most 10.000.' }],
    accounts: [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }],
    channels: [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }],
    speeds: [{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }],
    tabs: [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }, { id: 'l', label: 'Loans', disabled: true }],
    messages: [
      { severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.', autoTimeout: -1 },
      { severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: -1 },
      { severity: 'warning', summary: 'Your session ends in 2 minutes', autoTimeout: -1 }
    ],
    rows: [
      { id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: '-1,240.00' },
      { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: '85,000.00' },
      { id: 't3', date: '09 Nov 2026', text: 'Card payment', amount: '-3,499.00' }
    ],
    columns: [{ headerText: 'Date', field: 'date' }, { headerText: 'Description', field: 'text', sortable: 'disabled' }, { headerText: 'Amount', field: 'amount', style: 'text-align:right' }]
  };
    return vm;
  };
});
