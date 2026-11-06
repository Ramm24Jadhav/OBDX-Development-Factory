/**
 * The component style saved in the factory's Component factory (component-style.json): a design (look), motion, light or
 * dark, and a brand colour. Replace component-style.json with the workspace's style (the Component factory, or
 * GET /api/workspaces/{id}/component-style) and the whole app follows it.
 */
export type Look = 'elevated' | 'soft' | 'glass' | 'outline' | 'vivid' | 'pill' | 'brutal' | 'redwood' | 'liquid';

export interface ComponentStyle {
  look?: Look;
  motion?: { hover?: 'none' | 'lift' | 'glow' | 'shine'; click?: 'none' | 'press' | 'ripple' | 'bounce'; scroll?: 'none' | 'fadeup' | 'scale' | 'slide' | 'blur' };
  mode?: 'light' | 'dark';
  brand?: 'workspace' | 'indigo' | 'emerald' | 'burgundy' | 'gold';
}

/** The Component factory's brand swatches; "workspace" keeps the bank's own primary colour. */
export const BRANDS: Record<string, string | undefined> = { indigo: '#4f46e5', emerald: '#059669', burgundy: '#9f1239', gold: '#b45309' };

/** The classes for the app's root element. */
export function styleClasses(style: ComponentStyle = {}): string[] {
  const m = style.motion ?? {};
  const motion = (['hover', 'click', 'scroll'] as const).filter((k) => m[k] && m[k] !== 'none').map((k) => `obdx-motion-${k}-${m[k]}`);
  return [`obdx-look-${style.look ?? 'elevated'}`, ...motion, ...(style.mode === 'dark' ? ['obdx-dark'] : [])];
}

/** Puts the style on the root element: its classes, and the brand colour when the style picks one. */
export function applyStyle(root: HTMLElement, style: ComponentStyle = {}): void {
  root.classList.add(...styleClasses(style));
  const brand = BRANDS[style.brand ?? 'workspace'];
  if (brand) root.style.setProperty('--obdx-primary', brand);
}
