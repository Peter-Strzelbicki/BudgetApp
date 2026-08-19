import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { formatCurrency } from '@/components/budget-ui';
import { BudgetColors, Fonts } from '@/constants/theme';

export interface InvestmentTrendPoint {
  date: string;
  values: Record<string, number>;
}

export interface InvestmentTrendSeries {
  key: string;
  label: string;
  color: string;
}

const CHART_HEIGHT = 220;
const CHART_WIDTH = 640;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 16;
const PADDING_X = 6;

export function InvestmentTrendChart({ points, series, selectedKey, onSelect }: {
  points: InvestmentTrendPoint[];
  series: InvestmentTrendSeries[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; color: string; date: string; value: number } | null>(null);

  if (points.length === 0) {
    return <View style={styles.placeholder}><Text style={styles.placeholderText}>Add a balance update for an account to see it here.</Text></View>;
  }

  const visibleSeries = series.filter(item => selectedKey === 'both' ? item.key === 'tfsa' || item.key === 'rrsp' : item.key === selectedKey);
  const maxValue = Math.max(...points.map(point => Math.max(...visibleSeries.map(item => point.values[item.key] ?? 0))), 1);
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const plotWidth = CHART_WIDTH - PADDING_X * 2;
  const xFor = (index: number) => points.length === 1 ? PADDING_X + plotWidth / 2 : PADDING_X + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) => PADDING_TOP + plotHeight - (value / maxValue) * plotHeight;
  const coordsBySeries = visibleSeries.map(item => ({
    series: item,
    coords: points.map((point, index) => ({ x: xFor(index), y: yFor(point.values[item.key] ?? 0) })),
  }));
  const latest = points[points.length - 1];

  return <View>
    <View style={styles.filters}>
      {[{ key: 'both', label: 'Both' }, ...series.map(item => ({ key: item.key, label: item.label }))].map(filter => (
        <Pressable key={filter.key} onPress={() => onSelect(filter.key)} style={[styles.filter, selectedKey === filter.key && styles.filterActive]}>
          <Text style={[styles.filterText, selectedKey === filter.key && styles.filterTextActive]}>{filter.label}</Text>
        </Pressable>
      ))}
    </View>
    <View style={styles.legend}>
      {coordsBySeries.map(({ series: item }) => <View key={item.key} style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
        <Text style={styles.legendText}>{item.label}</Text>
        <Text style={[styles.legendValue, { color: item.color }]}>{formatCurrency(latest.values[item.key] ?? 0)}</Text>
      </View>)}
    </View>
    <View style={styles.chartWrap}>
      <Text style={[styles.axisValue, styles.axisValueTop]}>{formatCurrency(maxValue)}</Text>
      <Text style={[styles.axisValue, styles.axisValueBottom]}>$0</Text>
      {hoveredPoint && <View pointerEvents="none" style={styles.tooltip}>
        <Text style={[styles.tooltipLabel, { color: hoveredPoint.color }]}>{hoveredPoint.label}</Text>
        <Text style={styles.tooltipValue}>{formatCurrency(hoveredPoint.value)}</Text>
        <Text style={styles.tooltipDate}>{formatDate(hoveredPoint.date)}</Text>
      </View>}
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
          const y = PADDING_TOP + plotHeight * fraction;
          return <Line key={fraction} x1={PADDING_X} y1={y} x2={CHART_WIDTH - PADDING_X} y2={y} stroke={BudgetColors.line} strokeWidth={1} />;
        })}
        {coordsBySeries.map(({ series: item, coords }) => <Path key={`${item.key}-line`} d={buildSmoothPath(coords)} fill="none" stroke={item.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
        {coordsBySeries.map(({ series: item, coords }) => coords.map((coord, index) => <Circle
          key={`${item.key}-${points[index].date}`}
          cx={coord.x}
          cy={coord.y}
          r={4}
          fill={BudgetColors.surface}
          stroke={item.color}
          strokeWidth={2}
          onPressIn={() => setHoveredPoint({ label: item.label, color: item.color, date: points[index].date, value: points[index].values[item.key] ?? 0 })}
          onPressOut={() => setHoveredPoint(null)}
          {...({
            onMouseEnter: () => setHoveredPoint({ label: item.label, color: item.color, date: points[index].date, value: points[index].values[item.key] ?? 0 }),
            onMouseLeave: () => setHoveredPoint(null),
          } as any)}
        />))}
      </Svg>
    </View>
    <View style={styles.axisRow}>
      {points.length === 1 ? <Text style={[styles.axisLabel, styles.axisLabelCenter]}>{formatDate(points[0].date)}</Text> : <><Text style={styles.axisLabel}>{formatDate(points[0].date)}</Text><Text style={styles.axisLabel}>{formatDate(points[points.length - 1].date)}</Text></>}
    </View>
  </View>;
}

function buildSmoothPath(coords: { x: number; y: number }[]) {
  if (coords.length < 2) return '';
  let path = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    path += ` C ${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return path;
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  placeholder: { minHeight: 90, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  placeholderText: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  filter: { minHeight: 32, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.canvas, justifyContent: 'center' },
  filterActive: { borderColor: BudgetColors.green, backgroundColor: BudgetColors.greenSoft },
  filterText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  filterTextActive: { color: BudgetColors.green },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  legendValue: { fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  chartWrap: { position: 'relative' },
  tooltip: { position: 'absolute', zIndex: 2, top: 10, left: 12, minWidth: 142, padding: 9, borderRadius: 7, backgroundColor: BudgetColors.surface, borderWidth: 1, borderColor: BudgetColors.line, shadowColor: BudgetColors.ink, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  tooltipLabel: { fontFamily: Fonts.sans, fontSize: 10, fontWeight: '800' },
  tooltipValue: { marginTop: 2, color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 15, fontWeight: '900' },
  tooltipDate: { marginTop: 2, color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 },
  axisValue: { position: 'absolute', right: 2, color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' },
  axisValueTop: { top: 4 },
  axisValueBottom: { bottom: 2 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10 },
  axisLabelCenter: { flex: 1, textAlign: 'center' },
});
