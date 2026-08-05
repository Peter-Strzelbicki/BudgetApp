import { Clock } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View pointerEvents="none">
        <Clock color={BudgetColors.muted} size={17} />
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder="HH:MM"
        placeholderTextColor={BudgetColors.faint}
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { height: 44, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  pressed: { opacity: 0.75 },
  input: { flex: 1, height: 42, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
});
