import { ComponentType, HTMLAttributes, useEffect, useRef, useState } from 'react';

/** Whether a control at this element bends its backdrop: the Liquid glass look, and the user has not asked for less transparency or system colours. */
export function wantsLens(element: Element | null): boolean {
  if (!element?.closest('.bx-look-liquid')) return false;
  return typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)').matches;
}

/**
 * The bending lens of a Liquid glass control (glass.json), drawn by Glisse: put it first inside the control. Glisse loads only under the
 * liquid look. Nothing behind it is marked as moving content, so Glisse fits the lens once per size and runs no frame loop.
 */
export function Lens() {
  const slot = useRef<HTMLSpanElement>(null);
  const [Glass, setGlass] = useState<ComponentType<HTMLAttributes<HTMLDivElement>> | null>(null);
  useEffect(() => {
    let live = true;
    if (wantsLens(slot.current)) import('glisse').then((m) => { if (live) setGlass(() => m.Glass); }, () => undefined);
    return () => { live = false; };
  }, []);
  return Glass ? <Glass className="bx-lens" aria-hidden="true" /> : <span ref={slot} hidden />;
}
