import { CalendarDays } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface DateInputProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

export function DateInput({ value, onChange, placeholder = 'Select a date' }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  const open = () => {
    if (!inputRef.current) return;
    if (typeof (inputRef.current as any).showPicker === 'function') {
      (inputRef.current as any).showPicker();
    } else {
      inputRef.current.click();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.display, !value && styles.placeholder]}>{formatted || placeholder}</Text>
      {/* The date input is invisible and overlays the calendar icon so clicking the button triggers it */}
      <View style={styles.iconWrap}>
        <CalendarDays color={BudgetColors.green} size={19} />
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
