import { CalendarDays } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface DateInputProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

export function DateInput({ value, onChange, placeholder = 'YYYY-MM-DD' }: DateInputProps) {
  return (
    <View style={styles.container}>
      <CalendarDays color={BudgetColors.muted} size={17} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={BudgetColors.faint}
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />
    </View>
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
  icon: {},
  input: {
    flex: 1,
    height: 40,
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
});
