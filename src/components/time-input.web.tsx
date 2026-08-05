import { Clock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const formatted = value
    ? (() => {
        const [h, m] = value.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0);
        return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
      })()
    : '';

  return (
    <View style={styles.container}>
      <Text style={[styles.display, !value && styles.placeholder]}>{formatted || 'Select a time'}</Text>
      <View pointerEvents="none" style={styles.iconWrap}>
        <Clock color={BudgetColors.green} size={19} />
      </View>
      <input
        aria-label="Choose time"
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
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
  display: { flex: 1, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  placeholder: { color: BudgetColors.faint },
  iconWrap: { marginLeft: 8 },
});
