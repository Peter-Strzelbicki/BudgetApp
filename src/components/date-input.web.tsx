import { CalendarDays } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface DateInputProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

export function DateInput({ value, onChange, placeholder = 'Select a date' }: DateInputProps) {
  const formatted = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      <Text pointerEvents="none" style={[styles.display, !value && styles.placeholder]}>{formatted || placeholder}</Text>
      <View pointerEvents="none" style={styles.iconWrap}>
        <CalendarDays color={BudgetColors.green} size={19} />
      </View>
      <input
        aria-label="Choose date"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.currentTarget.showPicker?.()}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          cursor: 'pointer',
          width: '100%',
          height: '100%',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BudgetColors.line,
    backgroundColor: BudgetColors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    position: 'relative',
  },
  display: {
    flex: 1,
    color: BudgetColors.ink,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  placeholder: {
    color: BudgetColors.faint,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
