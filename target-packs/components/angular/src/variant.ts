import { Directive, ElementRef, effect, inject, input } from '@angular/core';

import { VARIANTS } from './variants-table';

export { VARIANTS };

/** The variant classes for an element (bx-k-<kind> bx-v-<variant>), or '' when it does not take that variant. */
export function variantClass(element: string, variant?: string): string {
  const entry = VARIANTS[element];
  return entry && variant && entry[1].includes(variant) ? `bx-k-${entry[0]} bx-v-${variant}` : '';
}

/**
 * The variant property of every element in the variant table (variants.json), as a host directive: an empty variant
 * keeps the pack's own look; the others put bx-k-<kind> bx-v-<variant> on the element, as the JET pack does.
 */
@Directive({ selector: '[bxVariant]' })
export class Variant {
  readonly variant = input('');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let shown: string[] = [];
    effect(() => {
      const css = variantClass(host.localName, this.variant()).split(' ').filter(Boolean);
      host.classList.remove(...shown);
      host.classList.add(...css);
      shown = css;
    });
  }
}

/** For a component decorator: hostDirectives: VARIANT. */
export const VARIANT = [{ directive: Variant, inputs: ['variant'] }];
