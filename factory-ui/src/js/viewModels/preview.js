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

    /** A designer's CSS for an element: "&" stands for the element; plain declarations apply to it directly. */
    const scopeCss = (css, selector) => (css.includes('{') ? css.split('&').join(selector) : selector + ' { ' + css + ' }');

    /**
     * The page an element with its own HTML or script is drawn in: a sandboxed frame without the factory's origin,
     * so the script reaches only that frame. It reports its height and clicks to the preview.
     */
    const elementPage = (c) => {
      const base = 'body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;color:#1f2937;background:transparent}'
        + 'label{display:block;font-size:12px;color:#4b5563;margin-bottom:4px}'
        + 'input,select,textarea{box-sizing:border-box;width:100%;min-height:36px;padding:6px 10px;border:1px solid #c9cfd8;border-radius:6px;font:inherit}'
        + 'button{min-height:36px;padding:0 14px;border-radius:6px;border:1px solid #2b6cb0;background:#2b6cb0;color:#fff;font:inherit;cursor:pointer}';
      const css = c.css ? scopeCss(c.css, 'body') : '';
      const html = c.html || '<label>' + (c.label || '') + '</label><div id="element"></div>';
      const script = (c.script || '').replace(/<\/script/gi, '<\\/script');
      const reporter = '(function(){var id=' + JSON.stringify(c.id) + ';'
        + 'function size(){parent.postMessage({type:"factory-element-size",id:id,height:document.documentElement.scrollHeight},"*");}'
        + 'window.addEventListener("load",size);if(window.ResizeObserver){new ResizeObserver(size).observe(document.body);}'
        // A click selects the element, except in its inputs and buttons, so they can be tried out
        + 'document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("input,select,textarea,button,a,label")){return;}'
        + 'parent.postMessage({type:"factory-element-click",id:id},"*");},true);})();';
      return '<!doctype html><html><head><meta charset="utf-8"><style>' + base + css.replace(/<\/style/gi, '') + '</style></head><body>'
        + html + '<script>' + reporter + '<\/script><script>' + script + '<\/script></body></html>';
    };

    /** The CSS of every element that has CSS but no HTML of its own, scoped to the element in the page. */
    const elementStyles = (model) => model.sections.reduce((all, s) => all.concat(s.components), [])
      .filter((c) => c.css && !c.html && !c.script)
      .map((c) => scopeCss(c.css, '[data-cid="' + String(c.id).replace(/"/g, '') + '"]'))
      .join('\n').replace(/<\/style/gi, '');

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
        const look = c.type === 'component' && !c.html && !c.script ? (LOOKS[c.component] || 'generic') : null;
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
          // An element with its own HTML or script is drawn by it, in its own sandboxed frame
          type: c.html || c.script ? 'custom' : c.type,
          srcdoc: c.html || c.script ? elementPage(c) : '',
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
          // Where the values come from, shown on the canvas while designing
          api: c.dataSource && c.dataSource.api ? c.dataSource.api : '',
          visibleWhen: c.visibleWhen || null,
          requiredWhen: c.requiredWhen || null,
          baseRequired: c.required === true,
          baseCss: 'factory-cmp' + (c.id === highlight ? ' factory-highlight' : '') + (warnings[c.id] ? ' factory-warning-mark' : '')
        };
      };
      const editing = ctx.editing === true;
      const sections = model.sections.map((s) => ({
        id: s.id,
        title: s.title,
        columns: s.columns || 2,
        css: 'factory-preview-section' + (s.id === highlight ? ' factory-highlight' : '') + (warnings[s.id] ? ' factory-warning-mark' : ''),
        warning: warnings[s.id] || '',
        components: s.components.map(component)
      }));
      // Conditions follow the values typed on the canvas: a field shows, or becomes mandatory, only while another one
      // meets its condition. While designing, a hidden field stays on the canvas, faded, so it can still be selected.
      const views = {};
      sections.forEach((s) => s.components.forEach((v) => { views[v.id] = v; }));
      const holds = (condition) => {
        const other = condition && views[condition.field];
        if (!other) {
          return true;
        }
        const raw = other.type === 'switch' ? other.checked() : other.type === 'checkbox' ? other.values() : other.value();
        const values = Array.isArray(raw) ? raw.map(String) : raw === null || raw === undefined || raw === false ? [] : [String(raw)];
        const filled = values.some((v) => v.trim() !== '');
        switch (condition.operator) {
          case 'empty': return !filled;
          case 'equals': return values.includes(String(condition.value || ''));
          case 'notEquals': return !values.includes(String(condition.value || ''));
          default: return filled;
        }
      };
      Object.keys(views).forEach((id) => {
        const v = views[id];
        v.shown = ko.pureComputed(() => holds(v.visibleWhen));
        v.required = ko.pureComputed(() => v.baseRequired || (!!v.requiredWhen && holds(v.requiredWhen)));
        v.display = ko.pureComputed(() => (v.shown() || editing ? '' : 'none'));
        v.css = ko.pureComputed(() => v.baseCss + (v.shown() ? '' : ' factory-conditional-hidden')
          + (v.visibleWhen || v.requiredWhen ? ' factory-conditional' : ''));
      });
      return {
        bank: ctx.bank || 'Online banking',
        breadcrumb: ctx.breadcrumb || 'Dashboard',
        editing: editing,
        // The journey's steps show in the designer's strip; the page itself shows none
        steps: [],
        title: model.title || model.name,
        sections: sections,
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
        let style = document.getElementById('factory-element-css');
        if (!style) {
          style = document.createElement('style');
          style.id = 'factory-element-css';
          document.head.appendChild(style);
        }
        style.textContent = event.data.model ? elementStyles(event.data.model) : '';
      };

      // Elements with their own HTML run in sandboxed frames (origin "null"): they report their height and clicks.
      const onElementMessage = (event) => {
        const frame = [...document.querySelectorAll('.factory-element-frame')].find((f) => f.contentWindow === event.source);
        if (!frame || !event.data) {
          return;
        }
        if (event.data.type === 'factory-element-size') {
          frame.style.height = Math.min(Math.max(Number(event.data.height) || 0, 24), 2000) + 'px';
        } else if (event.data.type === 'factory-element-click' && window.parent !== window) {
          const holder = frame.closest('[data-cid]');
          if (holder) {
            window.parent.postMessage({ type: 'factory-preview-select', id: holder.getAttribute('data-cid') }, window.location.origin);
          }
        }
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
        window.addEventListener('message', onElementMessage);
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
        window.removeEventListener('message', onElementMessage);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('dragover', onDragOver);
        document.removeEventListener('drop', onDrop);
        document.removeEventListener('dragleave', onDragLeave);
      };
    }

    return PreviewViewModel;
  }
);
