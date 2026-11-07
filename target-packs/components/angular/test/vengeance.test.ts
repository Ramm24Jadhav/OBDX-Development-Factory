import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VENGEANCE_COMPONENTS, revealStep, shareBody } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Vengeance UI ports', () => {
  it('has the 6 components and every one renders and passes axe', async () => {
    expect(VENGEANCE_COMPONENTS.length).toBe(6);
    @Component({ imports: [...VENGEANCE_COMPONENTS], template: `
      <bx-share-sheet text="Payment REF 20931, 250.00 USD to A. Rao" />
      <bx-glass-dock [items]="[{ id: 'pay', label: 'Pay', icon: '↗' }, { id: 'cards', label: 'Cards' }]" value="pay" />
      <bx-aurora-hero heading="Good morning, Priya" text="Your salary has arrived." />
      <bx-reveal-loader text="Bank" [loading]="false"><p>Accounts</p></bx-reveal-loader>
      <bx-border-beam><p>Pre-approved loan</p></bx-border-beam>
      <bx-masked-avatars label="Joint holders" [people]="[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }]" />` })
    class Host {}
    const { el } = await mount(Host);
    expect(await violations(el)).toEqual([]);
  });

  it('the share sheet copies the text and link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    @Component({ imports: [...VENGEANCE_COMPONENTS], template: `<bx-share-sheet text="IBAN GB29" url="https://bank.example/pay" (share)="got.set($event)" />` })
    class Host { got = signal(''); }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: /Share/ }));
    await settle();
    expect(getByRole(el, 'dialog', { name: 'Share' })).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Copy' }));
    await settle();
    expect(writeText).toHaveBeenCalledWith('IBAN GB29\nhttps://bank.example/pay');
    expect(host.got()).toBe('copy');
    expect(getByRole(el, 'status').textContent).toMatch(/Copied/);
    expect(shareBody('Ref 1', 'javascript:alert(1)')).toBe('Ref 1');
  });

  it('the glass dock marks the current shortcut, shows one label for the one in focus and acts', async () => {
    @Component({ imports: [...VENGEANCE_COMPONENTS], template: `<bx-glass-dock [items]="[{ id: 'pay', label: 'Pay' }, { id: 'cards', label: 'Cards' }]" value="cards" (action)="got.set($event)" />` })
    class Host { got = signal(''); }
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'button', { name: 'Cards' }).getAttribute('aria-current')).toBe('page');
    await userEvent.tab();
    await settle();
    expect(el.querySelector('.bx-dock-label')?.textContent).toBe('Pay');
    await userEvent.tab();
    await settle();
    expect(el.querySelector('.bx-dock-label span')?.className).toBe('is-from-right');
    await userEvent.keyboard('{Enter}');
    expect(host.got()).toBe('cards');
  });

  it('the reveal loader covers the content while loading, then lifts and says it is done', async () => {
    vi.useFakeTimers();
    @Component({ imports: [...VENGEANCE_COMPONENTS], template: `<bx-reveal-loader text="Bank" [loading]="loading()" (complete)="done.set(true)"><button type="button">Accounts</button></bx-reveal-loader>` })
    class Host { loading = signal(true); done = signal(false); }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.bx-reveal-bar')).toHaveLength(10);
    expect(el.querySelector('.bx-reveal-content')?.hasAttribute('inert')).toBe(true);
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(el.querySelector('[role=status]')).toBeNull();
    expect(fixture.componentInstance.done()).toBe(true);
    expect([0, 4, 5, 9].map((i) => revealStep(i, 'edges'))).toEqual([0, 4, 4, 0]);
  });

  it('the border beam keeps its lap between 2 and 20 seconds; masked avatars count the rest', async () => {
    @Component({ imports: [...VENGEANCE_COMPONENTS], template: `<bx-border-beam [duration]="60">A</bx-border-beam>
      <bx-masked-avatars label="Joint holders" [max]="2" [people]="[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }, { name: 'Meera Iyer' }]" />` })
    class Host {}
    const { el } = await mount(Host);
    expect(el.querySelector('.bx-border-beam')?.className).toContain('is-lap-20');
    expect(getByRole(el, 'img', { name: 'Priya Nair' })).toBeTruthy();
    expect(el.querySelector('[aria-label="and 1 more"]')?.textContent).toBe('+1');
  });
});
