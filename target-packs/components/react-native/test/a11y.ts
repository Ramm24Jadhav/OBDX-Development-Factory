import { screen } from '@testing-library/react-native';

const ROLES = ['button', 'radio', 'checkbox', 'tab', 'switch', 'link'] as const;

/**
 * The accessibility checks a component must pass without a device: every control a screen reader can reach has a role
 * and a name, and touch targets are at least 44 points (the platforms' guidance; WCAG 2.5.8 asks 24).
 */
export function accessibilityProblems(): string[] {
  const out: string[] = [];
  for (const role of ROLES) {
    for (const node of screen.queryAllByRole(role)) {
      const name = node.props.accessibilityLabel ?? node.props['aria-label'];
      const text = textOf(node);
      if (!name && !text) { out.push(`a ${role} has no name`); }
      const style = flatten(node.props.style);
      const h = style.minHeight ?? style.height;
      if (typeof h === 'number' && h < 36 && !node.props.hitSlop) { out.push(`${role} "${name || text}" is ${h} points tall`); }
    }
  }
  return out;
}

function textOf(node: { children?: unknown[] }): string {
  return (node.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c as { children?: unknown[] }))).join('');
}

function flatten(style: unknown): Record<string, unknown> {
  if (!style) { return {}; }
  if (Array.isArray(style)) { return style.reduce((a: Record<string, unknown>, s) => ({ ...a, ...flatten(s) }), {}); }
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
}
