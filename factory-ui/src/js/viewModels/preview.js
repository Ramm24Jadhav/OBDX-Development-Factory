/*
 * Screen preview: renders a Screen Model with real Oracle JET components. It runs inside an iframe; the page that
 * hosts it sends the model with postMessage ({type: 'factory-preview', model, highlight}). Clicking a component
 * tells the host which one (factory-preview-select), so the designer can select it.
 */
define(['knockout', 'ojs/ojarraydataprovider', 'ojs/ojconverter-number',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojinputnumber', 'ojs/ojdatetimepicker',
        'ojs/ojselectsingle', 'ojs/ojradioset', 'ojs/ojcheckboxset', 'ojs/ojswitch', 'ojs/ojbutton', 'ojs/ojtable'],
  function (ko, ArrayDataProvider, NumberConverter) {
    const SAMPLE_ACCOUNTS = ['Savings xxxx1234 (INR)', 'Current xxxx5678 (INR)', 'Savings xxxx9012 (USD)'];
    const amountConverter = new NumberConverter.IntlNumberConverter({ style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // OBDX framework components the preview shows like the real ones; others appear as a labelled placeholder
    const LOOKS = { 'account-input': 'account', 'amount-input': 'amount', 'page-section': 'section' };

    /** Columns and two rows of sample data for a table; its options are the column headers. */
    const table = (columns) => {
      const headers = columns.length > 0 ? columns : ['Column 1', 'Column 2'];
      const rows = [1, 2].map((n) => {
        const row = { key: n };
        headers.forEach((header, i) => { row['c' + i] = 'Sample ' + n; });
        return row;
      });
      return {
        columns: headers.map((header, i) => ({ headerText: header, field: 'c' + i })),
        rows: new ArrayDataProvider(rows, { keyAttributes: 'key' })
      };
    };

    function toView(model, highlight) {
      const component = (c) => {
        const look = c.type === 'component' ? (LOOKS[c.component] || 'generic') : null;
        const options = (c.type === 'account' || look === 'account') && (!c.options || c.options.length === 0 || c.options[0] === 'Option 1')
          ? SAMPLE_ACCOUNTS : (c.options || []);
        const optionItems = options.map((label) => ({ value: label, label: label }));
        const params = c.params || {};
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
          value: ko.observable(c.type === 'number' || c.type === 'amount' || c.type === 'date' ? null : (c.defaultValue || null)),
          values: ko.observableArray([]),
          checked: ko.observable(c.defaultValue === 'true' || c.defaultValue === 'on'),
          displayValue: c.defaultValue || 'Sample value',
          optionsProvider: new ArrayDataProvider(optionItems, { keyAttributes: 'value' }),
          css: 'factory-cmp' + (c.id === highlight ? ' factory-highlight' : '')
        };
      };
      return {
        title: model.title || model.name,
        sections: model.sections.map((s) => ({ title: s.title, columns: s.columns || 2, components: s.components.map(component) })),
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
        this.screen(event.data.model ? toView(event.data.model, event.data.highlight) : null);
      };
      const onClick = (event) => {
        const target = event.target.closest('[data-cid]');
        if (target && window.parent !== window) {
          window.parent.postMessage({ type: 'factory-preview-select', id: target.getAttribute('data-cid') }, window.location.origin);
        }
      };

      this.connected = () => {
        document.title = 'Screen preview';
        window.addEventListener('message', onMessage);
        document.addEventListener('click', onClick, true);
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'factory-preview-ready' }, window.location.origin);
        }
      };
      this.disconnected = () => {
        window.removeEventListener('message', onMessage);
        document.removeEventListener('click', onClick, true);
      };
    }

    return PreviewViewModel;
  }
);
