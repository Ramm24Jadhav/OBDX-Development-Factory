import { TestBed } from '@angular/core/testing';

import { {{Screen}}Page } from './{{Screen}}Page';

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as data-testid.
const ids = [{{componentIds}}];

describe('{{Screen}}Page', () => {
  it('shows every field and action of the approved design', async () => {
    const fixture = TestBed.createComponent({{Screen}}Page);
    await fixture.whenStable();
    for (const id of ids) {
      expect(fixture.nativeElement.querySelector(`[data-testid="${id}"]`)).toBeTruthy();
    }
  });
{{requiredTest:
  it('asks for the required fields', async () => {
    const fixture = TestBed.createComponent({{Screen}}Page);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('[data-testid="{{primaryAction}}"] button, button[data-testid="{{primaryAction}}"]').click();
    await fixture.whenStable();
    const messages = Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]')) as HTMLElement[];
    expect(messages.filter((m) => /^!?\s*Enter /.test(m.textContent!.trim())).length).toBe({{requiredCount}});
  });
}}
});
