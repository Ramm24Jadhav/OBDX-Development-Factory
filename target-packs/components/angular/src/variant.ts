import { Directive, ElementRef, effect, inject, input } from '@angular/core';

import { VARIANTS } from './variants-table';

export { VARIANTS };

/** The variant class for an element, or '' when it does not take that variant. */
export function variantClass(element: string, variant?: string): string {
  const entry = VARIANTS[element];
  return entry && variant && entry[1].includes(variant) ? `bx-${entry[0]}--${variant}` : '';
}

/**
 * The variant property of every element in the variant table (variants/*.json), as a host directive: an empty variant
 * keeps the pack's own look; the others put bx-<kind>--<variant> on the element, as the JET pack does.
 */
@Directive({ selector: '[bxVariant]' })
export class Variant {
  readonly variant = input('');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let shown = '';
    effect(() => {
      const css = variantClass(host.localName, this.variant());
      if (shown) { host.classList.remove(shown); }
      if (css) { host.classList.add(css); }
      shown = css;
    });
  }
}

/** For a component decorator: hostDirectives: VARIANT. */
export const VARIANT = [{ directive: Variant, inputs: ['variant'] }];
