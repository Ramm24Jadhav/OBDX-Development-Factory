/*
 * Variants (variants/*.json): every component in the variant table takes a variant property. An empty variant keeps the
 * pack's own look; the others wrap the component in a display: contents element with the class bx-<kind>--<variant>,
 * the same class the JET and Angular packs put on their host elements, so one skin serves all three. In this pack the
 * material variant of a foundation component renders @mui/material (material.tsx).
 */
import { ComponentType, createElement } from 'react';

import { MATERIAL } from './material';
import { VARIANTS } from './variants-table';

export { VARIANTS };

/** The variant class for a component, or '' when it does not take that variant. */
export function variantClass(name: string, variant?: string): string {
  const entry = VARIANTS[name];
  return entry && variant && entry[1].includes(variant) ? `bx-${entry[0]}--${variant}` : '';
}

/** The component with a variant property (see above). */
export function withVariant<P extends object>(name: string, Base: ComponentType<P>) {
  const Material = MATERIAL[name] as ComponentType<P> | undefined;
  function Variant({ variant, ...props }: P & { variant?: string }) {
    const css = variantClass(name, variant);
    const inner = createElement(css && variant === 'material' && Material ? Material : Base, props as P);
    return css ? <div className={css} style={{ display: 'contents' }}>{inner}</div> : inner;
  }
  Variant.displayName = name;
  return Variant;
}
