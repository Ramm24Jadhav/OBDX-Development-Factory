import { ReactNode, useRef, useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';

import { Enter, Press, useSlide } from './motion';
import { useTheme } from './theme';

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  content?: ReactNode;
}

export interface TabsProps {
  label: string;
  tabs: ReadonlyArray<Tab>;
  selection: string;
  onSelectionChange: (id: string) => void;
  testID?: string;
}

/**
 * Tabs (oj-tab-bar): a segmented track that scrolls when the tabs do not fit; the chosen tab's marker slides to it
 * (motion.json: change "slide") and its content shows under it.
 */
export function Tabs({ label, tabs, selection, onSelectionChange, testID }: TabsProps) {
  const t = useTheme();
  const current = tabs.find((x) => x.id === selection);
  const places = useRef(new Map<string, { x: number; width: number }>());
  const [, measured] = useState(0);
  const at = places.current.get(selection);
  const left = useSlide(at?.x ?? 0);
  const width = useSlide(at?.width ?? 0);
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label}
                  contentContainerStyle={{ padding: 4, gap: 4, borderRadius: t.radius.card, backgroundColor: t.color.surface3 }}>
        {at ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, bottom: 4, left, width, borderRadius: t.radius.control,
          backgroundColor: t.color.surface }} /> : null}
        {tabs.map((x, i) => {
          const on = x.id === selection;
          return (
            <Press key={x.id} testID={testID ? `${testID}-${x.id}` : undefined} accessibilityRole="tab" accessibilityLabel={x.label}
                   accessibilityHint={`Tab ${i + 1} of ${tabs.length}`} accessibilityState={{ selected: on, disabled: !!x.disabled }}
                   disabled={x.disabled} onPress={() => onSelectionChange(x.id)}
                   onLayout={(e) => { places.current.set(x.id, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }); measured((n) => n + 1); }}
                   style={{ minHeight: t.minTouch - 4, justifyContent: 'center', paddingHorizontal: 16, borderRadius: t.radius.control,
                     backgroundColor: on && !at ? t.color.surface : 'transparent', opacity: x.disabled ? 0.5 : 1 }}>
              <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? t.color.primaryText : t.color.textBody }}>{x.label}</Text>
            </Press>
          );
        })}
      </ScrollView>
      {current && current.content !== undefined
        ? <Enter key={current.id} effect="fade" testID={testID ? `${testID}-panel` : undefined}>{current.content}</Enter> : null}
    </View>
  );
}
