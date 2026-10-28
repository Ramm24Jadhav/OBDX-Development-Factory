/*
 * Screen preview: renders a Screen Model with real Oracle JET components, inside a frame that looks like an OBDX
 * page (bank header, breadcrumb, page title, steps of the journey) and filled with realistic sample data. It runs
 * inside an iframe; the page that hosts it sends the model with postMessage ({type: 'factory-preview', model,
 * highlight, context}). Clicking a component tells the host which one (factory-preview-select), so the designer can
 * select it.
 */
define(['knockout', 'ojs/ojarraydataprovider', 'ojs/ojconverter-number',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojinputnumber', 'ojs/ojdatetimepicker',
        'ojs/ojselectsingle', 'ojs/ojradioset', 'ojs/ojcheckboxset', 'ojs/ojswitch', 'ojs/ojbutton', 'ojs/ojtable'],
  function (ko, ArrayDataProvider, NumberConverter) {
    const SAMPLE_ACCOUNTS = ['Savings xxxx1234 · ₹2,45,000.00', 'Current xxxx5678 · ₹8,12,450.50', 'Savings xxxx9012 · $12,400.00'];
    const amountConverter = new NumberConverter.IntlNumberConverter({ style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // OBDX framework components the preview shows like the real ones; others appear as a labelled placeholder
    const LOOKS = { 'account-input': 'account', 'amount-input': 'amount', 'page-section': 'section' };
    const PLACEHOLDERS = ['Option 1', 'Option 2', 'Column 1', 'Column 2'];

    /**
     * Sample values a bank's screen would show, picked by words in a field's name or label: [words, text, number].
     * The first match wins, so the more specific words come first.
     */
    const SAMPLES = [
      [['demat', 'trading account'], ['DMAT-0042 1875', 'DMAT-0042 2290'], null],
      [['ifsc'], ['HDFC0001234'], null],
      [['pan'], ['ABCPK1234F'], null],
      [['email', 'e-mail'], ['priya.sharma@example.com'], null],
      [['mobile', 'phone'], ['+91 98765 43210'], null],
      [['reference', 'ref', 'order id', 'orderid'], ['ORD-2026-00142', 'ORD-2026-00139'], null],
      [['symbol', 'share', 'stock', 'scrip'], ['INFY · Infosys Ltd', 'TCS · Tata Consultancy Services'], null],
      [['status'], ['Open', 'Executed'], null],
      [['side', 'buy/sell', 'buy or sell', 'direction'], ['Buy', 'Sell'], null],
      [['validity'], ['Day', 'Good till cancelled'], null],
      [['currency'], ['INR', 'USD'], null],
      [['payee', 'beneficiary', 'customer name', 'name'], ['Priya Sharma', 'Rahul Verma'], null],
      [['remark', 'remarks', 'narrative', 'purpose', 'description', 'notes'], ['Monthly investment', 'Rent for October'], null],
      [['city'], ['Mumbai', 'Pune'], null],
      [['quantity', 'qty', 'units', 'count'], ['50', '120'], 50],
      [['gain', 'loss', 'p&l'], ['+₹3,240.00', '-₹1,105.50'], 3240],
      [['price', 'amount', 'value', 'cost', 'balance', 'limit', 'fee', 'fees', 'charge', 'charges'], ['₹1,520.40', '₹3,912.75'], 25000],
      [['date', 'time', 'dob'], ['28 Oct 2026, 10:42', '27 Oct 2026, 15:08'], null]
    ];

    /** "settlementAccount Settlement account" becomes " settlement account settlement account ", for whole-word matches. */
    const words = (text) => ' ' + (text || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9&/]+/g, ' ') + ' ';
    const sampleFor = (text) => {
      const padded = words(text);
      const match = SAMPLES.find(([keys]) => keys.some((key) => padded.includes(' ' + key + ' ')));
      return match ? { texts: match[1], number: match[2] } : null;
    };

    /** Columns and two rows of sample data for a table; its options are the column headers. */
    const table = (columns) => {
      const headers = columns.length > 0 ? columns : ['Column 1', 'Column 2'];
      const rows = [0, 1].map((n) => {
        const row = { key: n };
        headers.forEach((header, i) => {
          const sample = sampleFor(header);
          row['c' + i] = sample ? sample.texts[n % sample.texts.length] : (n === 0 ? 'Sample' : 'Example');
        });
        return row;
      });
      return {
        columns: headers.map((header, i) => ({ headerText: header, field: 'c' + i })),
        rows: new ArrayDataProvider(rows, { keyAttributes: 'key' })
      };
    };

    const today = () => new Date().toISOString().slice(0, 10);

    /** The value a field shows in the preview: its default, else a realistic sample. */
    const sampleValue = (c, look, options) => {
      const sample = sampleFor((c.name || '') + ' ' + (c.label || ''));
      if (c.type === 'date') {
        return c.defaultValue && /^\d{4}-\d{2}-\d{2}/.test(c.defaultValue) ? c.defaultValue.slice(0, 10) : today();
      }
      if (c.type === 'number' || c.type === 'amount' || look === 'amount') {
        const parsed = Number(c.defaultValue);
        return c.defaultValue && !isNaN(parsed) ? parsed : sample && sample.number !== null ? sample.number : (c.type === 'number' ? 1 : 25000);
      }
      if (c.type === 'select' || c.type === 'account' || look === 'account' || c.type === 'radio') {
        const real = options.filter((o) => !PLACEHOLDERS.includes(o));
        return c.defaultValue && options.includes(c.defaultValue) ? c.defaultValue : (c.type === 'radio' ? null : real[0] || null);
      }
      if (c.type === 'text' || c.type === 'textarea' || c.type === 'display') {
        return c.defaultValue || (sample ? sample.texts[0] : null);
      }
      return c.defaultValue || null;
    };

    /**
     * @param context optional: bank (name in the header), breadcrumb, steps (screen names of the journey) and step
     *                (index of this screen), warnings (by component id), editing (true in the designer)
     */
    function toView(model, highlight, context) {
      const ctx = context || {};
      const warnings = ctx.warnings || {};
      const component = (c) => {
        const look = c.type === 'component' ? (LOOKS[c.component] || 'generic') : null;
        const options = (c.type === 'account' || look === 'account') && (!c.options || c.options.length === 0 || c.options[0] === 'Option 1')
          ? SAMPLE_ACCOUNTS : (c.options || []);
        const optionItems = options.map((label) => ({ value: label, label: label }));
        const params = c.params || {};
        const value = sampleValue(c, look, options);
        return {
          look: look,
          tag: c.component ? '<' + c.component + '>' : '',
          params: Object.keys(params).map((key) => key + (params[key] ? ': ' + params[key] : '')),
          table: c.type === 'table' ? table(c.options || []) : null,
          id: c.id,
          type: c.type,
          label: c.label,
          required: c.required === true,
          readonly: c.readonly === true,
          placeholder: c.placeholder || '',
          helpText: c.helpText || '',
          maxLength: c.maxLength || null,
          counter: c.maxLength ? 'remaining' : 'none',
          converter: c.type === 'amount' || look === 'amount' ? amountConverter : null,
          value: ko.observable(value),
          values: ko.observableArray([]),
          checked: ko.observable(c.defaultValue === 'true' || c.defaultValue === 'on'),
          displayValue: value === null || value === undefined ? 'Sample value' : String(value),
          optionsProvider: new ArrayDataProvider(optionItems, { keyAttributes: 'value' }),
          warning: warnings[c.id] || '',
          css: 'factory-cmp' + (c.id === highlight ? ' factory-highlight' : '') + (warnings[c.id] ? ' factory-warning-mark' : '')
        };
      };
      const steps = (ctx.steps || []).length > 1 ? ctx.steps.map((name, i) => ({
        number: i + 1, name: name, css: 'factory-obdx-step' + (i === ctx.step ? ' factory-obdx-step-current' : i < ctx.step ? ' factory-obdx-step-done' : '')
      })) : [];
      return {
        bank: ctx.bank || 'Online banking',
        breadcrumb: ctx.breadcrumb || 'Dashboard',
        editing: ctx.editing === true,
        steps: steps,
        title: model.title || model.name,
        sections: model.sections.map((s) => ({
          id: s.id,
          title: s.title,
          columns: s.columns || 2,
          css: 'factory-preview-section' + (s.id === highlight ? ' factory-highlight' : '') + (warnings[s.id] ? ' factory-warning-mark' : ''),
          warning: warnings[s.id] || '',
          components: s.components.map(component)
        })),
        actions: model.actions.map((a) => ({
          id: a.id, label: a.label,
          chroming: a.kind === 'primary' ? 'callToAction' : a.kind === 'link' ? 'borderless' : 'outlined',
          css: 'factory-cmp' + (a.id === highlight ? ' factory-highlight' : '')
        }))
      };
    }

    function PreviewViewModel() {
      this.screen = ko.observable(null);

      const onMessage = (event) => {
        if (event.origin !== window.location.origin || !event.data || event.data.type !== 'factory-preview') {
          return;
        }
        this.screen(event.data.model ? toView(event.data.model, event.data.highlight, event.data.context) : null);
      };
      const onClick = (event) => {
        const target = event.target.closest('[data-cid]') || event.target.closest('[data-sid]');
        if (target && window.parent !== window) {
          const id = target.getAttribute('data-cid') || target.getAttribute('data-sid');
          window.parent.postMessage({ type: 'factory-preview-select', id: id }, window.location.origin);
        }
      };

      // The designer can drop components from its palette onto the preview: show where, and tell it on drop.
      let dropTarget = null;
      const markDrop = (element) => {
        if (dropTarget !== element) {
          if (dropTarget) {
            dropTarget.classList.remove('factory-drop-target');
          }
          dropTarget = element;
          if (dropTarget) {
            dropTarget.classList.add('factory-drop-target');
          }
        }
      };
      const targetOf = (event) => event.target.closest('.factory-preview-section [data-cid]') || event.target.closest('[data-sid]');
      const onDragOver = (event) => {
        if (window.parent === window) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        markDrop(targetOf(event));
      };
      const onDrop = (event) => {
        event.preventDefault();
        const component = event.target.closest('.factory-preview-section [data-cid]');
        const section = event.target.closest('[data-sid]');
        markDrop(null);
        window.parent.postMessage({
          type: 'factory-preview-drop',
          targetId: component ? component.getAttribute('data-cid') : null,
          sectionId: section ? section.getAttribute('data-sid') : null
        }, window.location.origin);
      };
      const onDragLeave = (event) => {
        if (!event.relatedTarget) {
          markDrop(null);
        }
      };

      this.connected = () => {
        document.title = 'Screen preview';
        window.addEventListener('message', onMessage);
        document.addEventListener('click', onClick, true);
        document.addEventListener('dragover', onDragOver);
        document.addEventListener('drop', onDrop);
        document.addEventListener('dragleave', onDragLeave);
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'factory-preview-ready' }, window.location.origin);
        }
      };
      this.disconnected = () => {
        window.removeEventListener('message', onMessage);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('dragover', onDragOver);
        document.removeEventListener('drop', onDrop);
        document.removeEventListener('dragleave', onDragLeave);
      };
    }

    return PreviewViewModel;
  }
);
