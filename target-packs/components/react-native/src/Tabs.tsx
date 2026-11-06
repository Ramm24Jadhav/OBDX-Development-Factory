import { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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

/** Tabs (oj-tab-bar): a segmented track that scrolls when the tabs do not fit; the chosen tab's content shows under it. */
export function Tabs({ label, tabs, selection, onSelectionChange, testID }: TabsProps) {
  const t = useTheme();
  const current = tabs.find((x) => x.id === selection);
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label}
                  contentContainerStyle={{ padding: 4, gap: 4, borderRadius: t.radius.card, backgroundColor: t.color.surface3 }}>
        {tabs.map((x, i) => {
          const on = x.id === selection;
          return (
            <Pressable key={x.id} testID={testID ? `${testID}-${x.id}` : undefined} accessibilityRole="tab" accessibilityLabel={x.label}
                       accessibilityHint={`Tab ${i + 1} of ${tabs.length}`} accessibilityState={{ selected: on, disabled: !!x.disabled }}
                       disabled={x.disabled} onPress={() => onSelectionChange(x.id)}
                       style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: t.radius.control,
                         backgroundColor: on ? t.color.surface : 'transparent', opacity: x.disabled ? 0.5 : 1 }}>
              <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? t.color.primaryText : t.color.textBody }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {current && current.content !== undefined ? <View testID={testID ? `${testID}-panel` : undefined}>{current.content}</View> : null}
    </View>
  );
}
