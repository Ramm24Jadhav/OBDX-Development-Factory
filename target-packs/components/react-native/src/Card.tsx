import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Enter, Press } from './motion';
import { useTheme } from './theme';

export interface CardProps {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Makes the whole card a button (an account to open). Do not put other buttons in it then. */
  onAction?: () => void;
  selected?: boolean;
  testID?: string;
}

/** A card: a heading, the content and actions. */
export function Card({ heading, subheading, children, actions, onAction, selected, testID }: CardProps) {
  const t = useTheme();
  const box = {
    gap: 12, padding: 18, borderRadius: t.radius.card, backgroundColor: t.glass ? t.glass.fill : t.color.surface, borderWidth: selected ? 1.5 : t.border,
    borderColor: selected ? t.color.primary : t.look === 'brutal' ? t.color.text : t.glass ? t.glass.rim : t.color.border,
    ...(t.shadow ? { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 } : {}),
  };
  const body = (
    <>
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
