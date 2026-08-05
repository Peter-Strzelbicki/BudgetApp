import { CalendarDays } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface DateInputProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

export function DateInput({ value, onChange, placeholder = 'YYYY-MM-DD' }: DateInputProps) {
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View pointerEvents="none">
        <CalendarDays color={BudgetColors.muted} size={17} style={styles.icon} />
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={BudgetColors.faint}
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    backgroundColor: BudgetColors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {},
  input: {
    flex: 1,
    height: 40,
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
});
