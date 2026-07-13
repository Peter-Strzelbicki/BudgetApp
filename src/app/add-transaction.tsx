import { addTransaction, getCategories, getPeople, getSubcategories } from '@/constants/api';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

interface Category {
  category_id: number;
  name: string;
  display_order: number;
}

interface Subcategory {
  subcategory_id: number;
  category_id: number;
  name: string;
  display_order: number;
}

interface Person {
  person_id: number;
  name: string;
  is_household: boolean;
}

export default function AddTransaction() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<number | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);

  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, peeps] = await Promise.all([
          getCategories(),
          getPeople(),
        ]);
        setCategories(cats);
        setPeople(peeps);
      } catch (error) {
        console.error('Failed to load form data:', error);
        Alert.alert('Error', 'Failed to load categories and people');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      const loadSubcategories = async () => {
        const subs = await getSubcategories(selectedCategory);
        setSubcategories(subs);
        setSelectedSubcategory(null);
      };
      loadSubcategories();
    }
  }, [selectedCategory]);

  const handleSubmit = async () => {
    if (!selectedSubcategory || !amount || !date) {
      Alert.alert('Validation', 'Please fill in Category, Subcategory, Amount, and Date');
      return;
    }

    setSubmitting(true);
    try {
      await addTransaction({
        subcategory_id: selectedSubcategory,
        transaction_date: date,
        amount: parseFloat(amount),
        location: location || undefined,
        paid_by_person_id: selectedPerson || undefined,
        notes: notes || undefined,
      });

      Alert.alert('Success', 'Transaction added successfully!', [
        {
          text: 'OK',
          onPress: () => resetForm(),
        },
      ]);
    } catch (error) {
      console.error('Failed to add transaction:', error);
      Alert.alert('Error', 'Failed to add transaction. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSelectedPerson(null);
    setAmount('');
    setLocation('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Add Transaction</Text>

      {/* Category Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.optionsContainer}>
          {categories.map((cat) => (
            <Pressable
              key={cat.category_id}
              style={[
                styles.option,
                selectedCategory === cat.category_id && styles.optionSelected,
              ]}
              onPress={() => setSelectedCategory(cat.category_id)}
            >
              <Text
                style={[
                  styles.optionText,
                  selectedCategory === cat.category_id && styles.optionTextSelected,
                ]}
              >
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Subcategory Selection */}
      {selectedCategory && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subcategory</Text>
          <View style={styles.optionsContainer}>
            {subcategories.map((sub) => (
              <Pressable
                key={sub.subcategory_id}
                style={[
                  styles.option,
                  selectedSubcategory === sub.subcategory_id && styles.optionSelected,
                ]}
                onPress={() => setSelectedSubcategory(sub.subcategory_id)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedSubcategory === sub.subcategory_id && styles.optionTextSelected,
                  ]}
                >
                  {sub.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Amount Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Amount *</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor="#666"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
      </View>

      {/* Date Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Date *</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#666"
          value={date}
          onChangeText={setDate}
        />
      </View>

      {/* Location Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Costco, Amazon"
          placeholderTextColor="#666"
          value={location}
          onChangeText={setLocation}
        />
      </View>

      {/* Paid By Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paid By (Optional)</Text>
        <View style={styles.optionsContainer}>
          {people.map((person) => (
            <Pressable
              key={person.person_id}
              style={[
                styles.option,
                selectedPerson === person.person_id && styles.optionSelected,
              ]}
              onPress={() => setSelectedPerson(person.person_id)}
            >
              <Text
                style={[
                  styles.optionText,
                  selectedPerson === person.person_id && styles.optionTextSelected,
                ]}
              >
                {person.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notes Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Add any additional notes..."
          placeholderTextColor="#666"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Submit Button */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Add Transaction</Text>
          )}
        </Pressable>

        <Pressable style={styles.resetButton} onPress={resetForm} disabled={submitting}>
          <Text style={styles.resetButtonText}>Clear Form</Text>
        </Pressable>
      </View>

      <View style={styles.spacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 40,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#AAAAAA',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  notesInput: {
    textAlignVertical: 'top',
    minHeight: 100,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333333',
    minWidth: '48%',
  },
  optionSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  optionText: {
    color: '#AAAAAA',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  resetButtonText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '600',
  },
  spacing: {
    height: 30,
  },
});
