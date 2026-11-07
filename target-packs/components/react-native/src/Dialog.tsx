import { ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, Text, View } from 'react-native';

import { IconButton } from './Button';
import { MODAL_FADE, useOpen } from './motion';
import { useTheme } from './theme';

/** The modal panel is the dialog on a device; on the web react-native-web draws the Modal itself as the named dialog, so there is one. */
export const panelRole = (title: string) => (Platform.OS === 'web' ? {} : { role: 'dialog' as const, 'aria-modal': true, accessibilityLabel: title });

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** 'none' keeps it open on the back button and outside taps, and hides the close button. */
  cancelBehavior?: 'icon' | 'escape' | 'none';
  testID?: string;
}

/** A modal dialog (oj-dialog): the screen behind is hidden from screen readers, and the back button closes it unless cancelBehavior is 'none'. */
export function Dialog({ open, onOpenChange, title, description, children, footer, cancelBehavior = 'icon', testID }: DialogProps) {
  const t = useTheme();
  const locked = cancelBehavior === 'none';
  const close = () => { if (!locked) { onOpenChange(false); } };
  const spring = useOpen(open, 'dialog');
  return (
    <Modal visible={open} transparent animationType={MODAL_FADE} accessibilityLabel={title} onRequestClose={close} statusBarTranslucent testID={testID ? `${testID}-modal` : undefined}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
        <Pressable style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
                   accessible={false} onPress={close} />
        <Animated.View testID={testID} accessibilityViewIsModal {...panelRole(title)}
              style={[spring, { backgroundColor: t.raised, borderRadius: t.radius.overlay, padding: 20, gap: 12, maxHeight: '90%', borderWidth: t.border, borderColor: t.line,
                ...t.elevation(3) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: 18, fontWeight: t.weightTitle, color: t.color.text }}>{title}</Text>
            {cancelBehavior === 'icon' ? <IconButton testID={testID ? `${testID}-close` : undefined} label="Close" icon="close" onAction={close} /> : null}
          </View>
          {description ? <Text style={{ fontSize: 14, color: t.color.textMuted }}>{description}</Text> : null}
          {children}
          {footer ? <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
