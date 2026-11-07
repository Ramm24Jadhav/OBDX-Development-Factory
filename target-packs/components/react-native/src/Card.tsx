import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Enter, Press } from './motion';
import { GlassBlur, useTheme } from './theme';

export interface CardProps {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Makes the whole card a button (an account to open). Do not put other buttons in it then. */
  onAction?: () => void;
  selected?: boolean;
  /** A style variant from variants.json; the default look when left out. outlined: flat, drawn by its edge. */
  variant?: 'outlined';
  testID?: string;
}

/** A card: a heading, the content and actions. */
export function Card({ heading, subheading, children, actions, onAction, selected, variant, testID }: CardProps) {
  const t = useTheme();
  const box = {
    gap: 12, padding: t.padCard, borderRadius: t.radius.card, backgroundColor: t.glass ? t.glass.fill : t.card, borderWidth: selected ? 1.5 : t.border,
    borderColor: selected ? t.color.primary : t.glass ? t.glass.rim : variant === 'outlined' ? t.color.borderStrong : t.line,
    ...(t.glass ? { overflow: 'hidden' as const } : {}),
    ...(variant === 'outlined' ? {} : t.elevation(2)),
  };
  const body = (
    <>
      <GlassBlur />
      {heading ? (
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{heading}</Text>
          {subheading ? <Text style={{ fontSize: 13, color: t.color.textMuted }}>{subheading}</Text> : null}
        </View>
      ) : null}
      {children ? <View>{children}</View> : null}
      {actions ? <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>{actions}</View> : null}
    </>
  );
  if (!onAction) { return <Enter testID={testID} style={box}>{body}</Enter>; }
  return (
    <Enter>
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={[heading, subheading].filter(Boolean).join(', ') || undefined}
               accessibilityState={selected === undefined ? undefined : { selected }} onPress={onAction}
           style={box}>
      {body}
    </Press>
    </Enter>
  );
}
