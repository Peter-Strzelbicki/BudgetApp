import { getTransactions } from '@/constants/api';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

interface Transaction {
  transaction_id: number;
  transaction_date: string;
  amount: number;
  location: string | null;
  notes: string | null;
  subcategory: string;
  category: string;
  paid_by: string | null;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const data = await getTransactions(month, year);
        setTransactions(data);
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [month, year]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const monthName = new Date(year, month - 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Transactions</Text>

      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <Pressable style={styles.navButton} onPress={handlePrevMonth}>
          <Text style={styles.navButtonText}>← Prev</Text>
        </Pressable>
        <Text style={styles.monthDisplay}>{monthName}</Text>
        <Pressable style={styles.navButton} onPress={handleNextMonth}>
          <Text style={styles.navButtonText}>Next →</Text>
        </Pressable>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Spending</Text>
        <Text style={styles.summaryAmount}>
          ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.transactionCount}>
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Transactions List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No transactions found</Text>
        </View>
      ) : (
        <View style={styles.transactionsList}>
          {transactions.map((transaction) => (
            <View key={transaction.transaction_id} style={styles.transactionCard}>
              <View style={styles.transactionHeader}>
                <View style={styles.transactionInfo}>
                  <Text style={styles.subcategoryText}>
                    {transaction.subcategory}
                  </Text>
                  <Text style={styles.categoryText}>{transaction.category}</Text>
                </View>
                <Text style={styles.amountText}>
                  ${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.transactionDetails}>
                <Text style={styles.dateText}>
                  📅 {new Date(transaction.transaction_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                {transaction.location && (
                  <Text style={styles.locationText}>📍 {transaction.location}</Text>
                )}
                {transaction.paid_by && (
                  <Text style={styles.paidByText}>👤 {transaction.paid_by}</Text>
                )}
              </View>

              {transaction.notes && (
                <Text style={styles.notesText}>Note: {transaction.notes}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 40,
    marginBottom: 20,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  navButton: {
    backgroundColor: '#1E1E1E',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  navButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  monthDisplay: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  summaryLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    marginBottom: 8,
  },
  summaryAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionCount: {
    color: '#888888',
    fontSize: 12,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 16,
  },
  transactionsList: {
    marginBottom: 30,
  },
  transactionCard: {
    backgroundColor: '#1E1E1E',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  transactionInfo: {
    flex: 1,
  },
  subcategoryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  amountText: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
  },
  transactionDetails: {
    marginBottom: 8,
  },
  dateText: {
    color: '#AAAAAA',
    fontSize: 12,
    marginBottom: 4,
  },
  locationText: {
    color: '#AAAAAA',
    fontSize: 12,
    marginBottom: 4,
  },
  paidByText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  notesText: {
    color: '#999999',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
});