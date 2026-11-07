import { EnvironmentInjector, Type, createComponent, reflectComponentType } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import * as pack from '../src';
import { VARIANTS, variantClass } from '../src';

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

const all = JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants.json'), 'utf8')) as {
  components: Record<string, { kind: string; wave: string; variants: { id: string }[] }>;
};
const names: Record<string, Record<string, string>> = {};
for (const g of JSON.parse(readFileSync(join(__dirname, '..', '..', 'catalogue.json'), 'utf8')).categories) { for (const x of g.components ?? []) { names[x.id] = x.names; } }
/** The V1 components: kind, the variant ids (not default) and the pack names. */
const wave1 = { components: Object.fromEntries(Object.entries(all.components).filter(([, c]) => c.wave === 'V1').map(([id, c]) => [id,
  { kind: c.kind, variants: c.variants.map((v) => v.id).filter((v) => v !== 'default'), packs: Object.fromEntries(Object.entries(names[id]).map(([p, n]) => [p, { name: n }])) }])) };

// Every exported component by its element name
const bySelector: Record<string, Type<unknown>> = {};
for (const value of Object.values(pack)) {
  const mirror = typeof value === 'function' ? reflectComponentType(value as Type<unknown>) : null;
  if (mirror) { bySelector[mirror.selector] = value as Type<unknown>; }
}

/** Values for the inputs a component needs before it renders. */
const SAMPLE: Record<string, unknown> = { label: 'Label', heading: 'Heading', text: 'Text', name: 'A. Rao', message: 'Message', number: '1800 123 456' };

describe('every V1 element takes each of its variants', () => {
  for (const [id, c] of Object.entries(wave1.components)) {
    const name = c.packs.angular.name;
    it.each(c.variants)(`${id} (${name}): %s`, async (v) => {
      expect(VARIANTS[name]).toEqual([c.kind, c.variants]);
      // on its own element, as an app uses it
      const host = document.body.appendChild(document.createElement(name));
      const ref = createComponent(bySelector[name], { environmentInjector: TestBed.inject(EnvironmentInjector), hostElement: host });
      for (const i of reflectComponentType(bySelector[name])!.inputs) {
        if (i.templateName in SAMPLE) { ref.setInput(i.templateName, SAMPLE[i.templateName]); }
      }
      ref.setInput('variant', v);
      ref.changeDetectorRef.detectChanges();
      expect(host.classList.contains(`bx-k-${c.kind}`) && host.classList.contains(`bx-v-${v}`)).toBe(true);
      ref.setInput('variant', '');
      ref.changeDetectorRef.detectChanges();
      expect(host.className).not.toContain('bx-v-');
      ref.destroy();
    });
  }
  it('an unknown variant or none keeps the pack\'s own look', () => {
    expect(variantClass('bx-button', 'nope')).toBe('');
    expect(variantClass('bx-dialog', 'material')).toBe('');
  });
});
