import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { router } from 'expo-router';

import {
  BarChart
} from 'react-native-gifted-charts';

import { getMonthlySummary } from '../constants/api';

// inside HomeScreen():
const [monthlyTotals, setMonthlyTotals] = useState<{ month: number; total: number }[]>([]);

useEffect(() => {
  getMonthlySummary(2026)
    .then(setMonthlyTotals)
    .catch(err => console.log(err));
}, []);

const screenWidth = Dimensions.get("window").width;
const chartWidth = screenWidth - 120;
const barWidth = 100;

// 12 bars
const spacing =
  (chartWidth - (12 * barWidth) - 20) / 11;

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHLY_BUDGET = 3500;

export default function HomeScreen() {
  // Replace this with your real transaction source (context, redux, API, etc.)
  // Shape: { id, date: 'YYYY-MM-DD', amount }
  const [transactions] = useState([
    { id: 1, date: "2026-01-14", amount: 3200 },
    { id: 2, date: "2026-02-03", amount: 3900 },
    { id: 3, date: "2026-03-22", amount: 2800 },
    { id: 4, date: "2026-04-10", amount: 4200 },
    { id: 5, date: "2026-05-18", amount: 3100 },
    { id: 6, date: "2026-06-27", amount: 3500 },
    { id: 7, date: "2026-07-08", amount: 3450 },
  ]);

  const [selectedBar, setSelectedBar] = useState(null);

  // Recomputes automatically whenever `transactions` changes
  const monthlySpending = useMemo(() => {
    const today = new Date();
    const currentMonthIndex = today.getMonth(); // 0 = Jan

    const totalsByMonth = new Array(12).fill(0);
    transactions.forEach(tx => {
      const monthIndex = new Date(tx.date).getMonth();
      totalsByMonth[monthIndex] += tx.amount;
    });

    return totalsByMonth.map((total, index) => {
      const isFuture = index > currentMonthIndex;

      return {
        value: isFuture ? 0 : total,
        label: MONTH_LABELS[index],
        frontColor: isFuture
          ? "transparent"
          : total > MONTHLY_BUDGET
            ? "#F44336"
            : "#4CAF50"
      };
    });
  }, );

  const avgSpending = useMemo(() => {
    const today = new Date();
    const monthsSoFar = today.getMonth() + 1;
    const total = monthlySpending
      .slice(0, monthsSoFar)
      .reduce((sum, m) => sum + m.value, 0);
    return Math.round(total / monthsSoFar);
  }, [monthlySpending]);

  const yearTotal = useMemo(
    () => monthlySpending.reduce((sum, m) => sum + m.value, 0),
    [monthlySpending]
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>
        Home Budget
      </Text>
      <Text style={styles.subtitle}>
        2026 Overview
      </Text>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.label}>
            Monthly Budget
          </Text>
          <Text style={styles.amount}>
            ${MONTHLY_BUDGET.toLocaleString()}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.label}>
            Avg Spending
          </Text>
          <Text style={styles.amount}>
            ${avgSpending.toLocaleString()}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.label}>
            Year Total
          </Text>
          <Text style={styles.amount}>
            ${yearTotal.toLocaleString()}
          </Text>
        </View>
      </View>


      {/* Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>
          2026 Spending vs Budget
        </Text>

        {selectedBar && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              {selectedBar.label}: ${selectedBar.value.toLocaleString()}
            </Text>
          </View>
        )}

        <BarChart
          data={monthlySpending}
          width={chartWidth}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={10}
          endSpacing={10}
          height={300}
          noOfSections={5}
          maxValue={5000}
          stepValue={1000}
          yAxisLabelPrefix="$"
          yAxisLabelWidth={55}
          yAxisTextStyle={{
            color:"#AAAAAA"
          }}
          xAxisLabelTextStyle={{
            color:"#AAAAAA",
            fontSize:10
          }}
          showReferenceLine1={true}
          referenceLine1Position={MONTHLY_BUDGET}
          referenceLine1Config={{
            color:"#FF5252",
            thickness:2,
            dashWidth:6,
            dashGap:6
          }}
          backgroundColor="#1E1E1E"
          disableScroll
          isAnimated
          onPress={(item) => setSelectedBar(item)}
        />
        <Text style={styles.legend}>
          - - - Monthly Budget: ${MONTHLY_BUDGET.toLocaleString()}
        </Text>
      </View>


      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>
        Quick Actions
      </Text>
      
      <Pressable
        style={styles.button}
        onPress={() =>
          router.push('/transactions')
        }
      >
        <Text style={styles.buttonText}>
          💳 Transactions
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() =>
          router.push('/add-transaction')
        }
      >
        <Text style={styles.buttonText}>
          ➕ Add Transaction
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() =>
          router.push('/budget')
        }
      >
        <Text style={styles.buttonText}>
          📊 Budget
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() =>
          router.push('/goals')
        }
      >
        <Text style={styles.buttonText}>
          🎯 Goals
        </Text>
      </Pressable>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container:{
    flex:1,
    backgroundColor:"#121212",
    paddingHorizontal:20
  },

  title:{
    fontSize:34,
    fontWeight:"bold",
    color:"#FFFFFF",
    marginTop:40
  },

  subtitle:{
    fontSize:20,
    color:"#AAAAAA",
    marginBottom:20
  },

  summaryRow:{
    flexDirection:"row",
    justifyContent:"space-between",
    marginBottom:25
  },

  summaryCard:{
    backgroundColor:"#1E1E1E",
    width:"31%",
    padding:12,
    borderRadius:15
  },

  label:{
    fontSize:12,
    color:"#AAAAAA"
  },

  amount:{
    fontSize:17,
    fontWeight:"bold",
    color:"#FFFFFF",
    marginTop:8
  },

  chartCard:{
    backgroundColor:"#1E1E1E",
    padding:15,
    borderRadius:15,
    marginBottom:20
  },

  sectionTitle:{
    fontSize:24,
    fontWeight:"bold",
    color:"#FFFFFF",
    marginBottom:15,
    marginTop:10
  },

  legend:{
    color:"#AAAAAA",
    marginTop:10
  },

  tooltip:{
    alignSelf:"flex-start",
    backgroundColor:"#2A2A2A",
    paddingVertical:6,
    paddingHorizontal:12,
    borderRadius:10,
    marginBottom:10
  },

  tooltipText:{
    color:"#FFFFFF",
    fontSize:13,
    fontWeight:"600"
  },

  button:{
    backgroundColor:"#1E1E1E",
    padding:18,
    borderRadius:15,
    marginBottom:12
  },

  buttonText:{
    color:"#FFFFFF",
    fontSize:18,
    fontWeight:"600"
  }
});