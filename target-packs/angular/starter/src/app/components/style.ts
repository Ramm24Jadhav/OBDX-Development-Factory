/** The component style saved in the Component factory: a look, motion on hover, click and scroll, and light or dark. */
export interface ComponentStyle {
  look?: 'elevated' | 'soft' | 'glass' | 'outline' | 'vivid' | 'pill' | 'brutal' | 'redwood' | 'liquid';
  motion?: { hover?: 'lift' | 'glow' | 'shine'; click?: 'press' | 'ripple' | 'bounce'; scroll?: 'fadeup' | 'scale' | 'slide' | 'blur' };
  mode?: 'light' | 'dark';
}

/** The classes to put on the app's root element for a component style (the same classes as the premium JET pack). */
export function styleClasses(style: ComponentStyle = {}): string {
  const m = style.motion ?? {};
  return ['bx-theme', `bx-look-${style.look ?? 'elevated'}`, m.hover ? `bx-motion-hover-${m.hover}` : '', m.click ? `bx-motion-click-${m.click}` : '',
    m.scroll ? `bx-motion-scroll-${m.scroll}` : '', style.mode === 'dark' ? 'bx-dark' : ''].filter(Boolean).join(' ');
}
