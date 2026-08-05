import { Clock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BudgetColors, Fonts } from '@/constants/theme';

interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
}

function to12h(hhmm: string) {
  const [hStr = '0', mStr = '0'] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const isPM = h >= 12;
  return { text: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, isPM };
}

function to24h(text: string, isPM: boolean): string {
  const [hStr = '12', mStr = '00'] = text.split(':');
  let h = Math.min(Math.max(parseInt(hStr, 10) || 12, 1), 12);
  const m = Math.min(parseInt(mStr, 10) || 0, 59);
  if (isPM && h !== 12) h += 12;
  else if (!isPM && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const init = to12h(value || '12:00');
  const [text, setText] = useState(init.text);
  const [isPM, setIsPM] = useState(init.isPM);
  const lastValueRef = useRef(value);

  // Sync when an edited transaction's stored time is loaded
  useEffect(() => {
    if (value && value !== lastValueRef.current) {
      lastValueRef.current = value;
      const { text: t, isPM: pm } = to12h(value);
      setText(t);
      setIsPM(pm);
    }
  }, [value]);

  const commit = (newText: string, newIsPM: boolean) => {
    const result = to24h(newText, newIsPM);
    lastValueRef.current = result;
    onChange(result);
  };

  const toggleAMPM = () => {
    const next = !isPM;
    setIsPM(next);
    commit(text, next);
  };

  return (
    <View style={styles.container}>
      <Clock color={BudgetColors.muted} size={17} />
      <TextInput
        value={text}
        onChangeText={(t) => setText(t.replace(/[^0-9:]/g, '').slice(0, 5))}
        onBlur={() => commit(text, isPM)}
        onSubmitEditing={() => commit(text, isPM)}
        placeholder="12:00"
        placeholderTextColor={BudgetColors.faint}
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <Pressable onPress={toggleAMPM} style={({ pressed }) => [styles.ampm, pressed && styles.pressed]}>
        <Text style={styles.ampmText}>{isPM ? 'PM' : 'AM'}</Text>
      </Pressable>
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
    gap: 10,
    paddingHorizontal: 12,
  },
  input: { flex: 1, height: 42, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13 },
  ampm: { height: 30, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' },
  ampmText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
