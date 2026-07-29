import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  FileSpreadsheet,
  ReceiptText,
  Upload,
  WalletCards,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ErrorNotice,
  formatCurrency,
  Page,
  PageHeading,
  Panel,
  SectionHeader,
  StatCard,
} from '@/components/budget-ui';
import {
  commitWorkbookImport,
  previewWorkbookImport,
  WorkbookImportPreview,
  WorkbookImportResult,
} from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function ImportScreen() {
  const [preview, setPreview] = useState<WorkbookImportPreview | null>(null);
  const [result, setResult] = useState<WorkbookImportResult | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseWorkbook = async () => {
    setSelecting(true);
    setError(null);
    setResult(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: XLSX_MIME,
        multiple: false,
        copyToCacheDirectory: true,
        base64: false,
      });
      if (selection.canceled) return;
      const nextPreview = await previewWorkbookImport(selection.assets[0]);
      setPreview(nextPreview);
      setShowWarnings(false);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'The workbook could not be read.');
    } finally {
      setSelecting(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError(null);
    try {
      const importResult = await commitWorkbookImport(preview.import_id);
      setResult(importResult);
      setPreview(null);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'The workbook could not be imported.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Page>
      <PageHeading
        eyebrow="Data migration"
        title="Import budget history"
        description="Bring monthly plans and past transactions into the household ledger from an Excel workbook."
      />

      {error && <ErrorNotice message={error} />}

      <Panel>
        <View style={styles.pickerRow}>
          <View style={styles.fileIcon}>
            <FileSpreadsheet color={BudgetColors.green} size={28} />
          </View>
          <View style={styles.pickerCopy}>
            <Text style={styles.pickerTitle}>{preview?.file_name || 'Excel workbook'}</Text>
            <Text style={styles.pickerDetail}>Monthly budget sheets in .xlsx format, up to 10 MB</Text>
          </View>
          <Pressable
            disabled={selecting || committing}
            onPress={chooseWorkbook}
            style={({ pressed }) => [styles.chooseButton, selecting && styles.disabled, pressed && styles.pressed]}>
            {selecting ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Upload color={BudgetColors.surface} size={17} />}
            <Text style={styles.chooseText}>{selecting ? 'Reading workbook' : preview ? 'Choose another' : 'Choose workbook'}</Text>
          </Pressable>
        </View>
      </Panel>

      {preview && (
        <>
          <View style={styles.stats}>
            <StatCard
              label="Months found"
              value={String(preview.summary.months)}
              detail={`${formatMonth(preview.summary.first_month)} to ${formatMonth(preview.summary.last_month)}`}
              icon={<CalendarRange color={BudgetColors.blue} size={19} />}
              accent={BudgetColors.blue}
            />
            <StatCard
              label="Monthly plans"
              value={preview.summary.budget_lines.toLocaleString()}
              detail="Budget amounts to update"
              icon={<WalletCards color={BudgetColors.green} size={19} />}
            />
            <StatCard
              label="Transactions"
              value={preview.summary.transactions.toLocaleString()}
              detail={`${preview.summary.detailed_transactions} detailed · ${preview.summary.generated_transactions} fixed`}
              icon={<ReceiptText color={BudgetColors.coral} size={19} />}
              accent={BudgetColors.coral}
            />
          </View>

          <Panel>
            <SectionHeader title="Month coverage" detail="Sheets ready to import" />
            <View style={styles.months}>
              {preview.sheets.map(sheet => (
                <View key={`${sheet.year}-${sheet.month}`} style={styles.monthChip}>
                  <Text style={styles.monthName}>{formatMonth(`${sheet.year}-${String(sheet.month).padStart(2, '0')}`)}</Text>
                  <Text style={styles.monthCount}>{sheet.transactions} entries</Text>
                </View>
              ))}
            </View>
          </Panel>

          <Panel>
            <SectionHeader title="Transaction sample" detail="First rows in chronological order" />
            {preview.sample_transactions.map((transaction, index) => (
              <View key={`${transaction.transaction_date}-${transaction.location}-${index}`} style={[styles.sampleRow, index === 0 && styles.sampleRowFirst]}>
                <View style={styles.sampleGlyph}>
                  <ReceiptText color={BudgetColors.green} size={16} />
                </View>
                <View style={styles.sampleCopy}>
                  <Text style={styles.sampleTitle}>{transaction.location}</Text>
                  <Text style={styles.sampleDetail}>{transaction.transaction_date} · {transaction.category} / {transaction.subcategory}</Text>
                </View>
                <Text style={styles.sampleAmount}>{formatCurrency(transaction.amount, 2)}</Text>
              </View>
            ))}
          </Panel>

          {preview.warning_count > 0 && (
            <Panel style={styles.warningPanel}>
              <Pressable onPress={() => setShowWarnings(value => !value)} style={({ pressed }) => [styles.warningHeader, pressed && styles.pressed]}>
                <AlertTriangle color={BudgetColors.gold} size={20} />
                <View style={styles.warningCopy}>
                  <Text style={styles.warningTitle}>{preview.warning_count} workbook adjustment{preview.warning_count === 1 ? '' : 's'}</Text>
                  <Text style={styles.warningDetail}>Dates or labels repaired during preview</Text>
                </View>
                <Text style={styles.warningAction}>{showWarnings ? 'Hide' : 'Review'}</Text>
              </Pressable>
              {showWarnings && (
                <View style={styles.warningList}>
                  {preview.warnings.map((warning, index) => (
                    <View key={`${warning.sheet}-${warning.cell}-${index}`} style={styles.warningRow}>
                      <Text style={styles.warningLocation}>{warning.sheet}{warning.cell ? ` · ${warning.cell}` : ''}</Text>
                      <Text style={styles.warningMessage}>{warning.message}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Panel>
          )}

          <View style={styles.confirmPanel}>
            <View style={styles.confirmCopy}>
              <Text style={styles.confirmTitle}>Ready to import</Text>
              <Text style={styles.confirmDetail}>Monthly plans will be updated. Matching transactions already in the database will be skipped.</Text>
            </View>
            <Pressable
              disabled={committing}
              onPress={commit}
              style={({ pressed }) => [styles.importButton, committing && styles.disabled, pressed && styles.pressed]}>
              {committing ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <Upload color={BudgetColors.surface} size={18} />}
              <Text style={styles.importText}>{committing ? 'Importing' : 'Import workbook'}</Text>
            </Pressable>
          </View>
        </>
      )}

      {result && (
        <Panel style={styles.successPanel}>
          <View style={styles.successHeader}>
            <View style={styles.successIcon}><CheckCircle2 color={BudgetColors.green} size={25} /></View>
            <View style={styles.successCopy}>
              <Text style={styles.successTitle}>Workbook imported</Text>
              <Text style={styles.successDetail}>{result.months_imported} months and {result.budget_lines_upserted} budget lines processed</Text>
            </View>
          </View>
          <View style={styles.resultGrid}>
            <ResultMetric label="Added" value={result.transactions_inserted} />
            <ResultMetric label="Already present" value={result.transactions_skipped} />
            <ResultMetric label="New categories" value={result.subcategories_created.length} />
          </View>
          <View style={styles.successActions}>
            <Pressable onPress={() => router.navigate('/budget')} style={({ pressed }) => [styles.resultLink, pressed && styles.pressed]}>
              <Text style={styles.resultLinkText}>View budgets</Text><ArrowRight color={BudgetColors.green} size={15} />
            </Pressable>
            <Pressable onPress={() => router.navigate('/transactions')} style={({ pressed }) => [styles.resultLink, pressed && styles.pressed]}>
              <Text style={styles.resultLinkText}>View transactions</Text><ArrowRight color={BudgetColors.green} size={15} />
            </Pressable>
          </View>
        </Panel>
      )}
    </Page>
  );
}

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return <View style={styles.resultMetric}><Text style={styles.resultValue}>{value.toLocaleString()}</Text><Text style={styles.resultLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  fileIcon: { width: 52, height: 52, borderRadius: 8, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  pickerCopy: { flex: 1, minWidth: 210, gap: 3 }, pickerTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' }, pickerDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  chooseButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, chooseText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.68 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, monthChip: { minWidth: 118, flexGrow: 1, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 7, backgroundColor: BudgetColors.canvas, borderWidth: 1, borderColor: BudgetColors.line, gap: 2 }, monthName: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' }, monthCount: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 9 },
  sampleRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: BudgetColors.line }, sampleRowFirst: { borderTopWidth: 0 }, sampleGlyph: { width: 32, height: 32, borderRadius: 6, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' }, sampleCopy: { flex: 1, minWidth: 0, gap: 2 }, sampleTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, sampleDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 }, sampleAmount: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  warningPanel: { borderColor: '#E9D499', backgroundColor: '#FFFCF4' }, warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, warningCopy: { flex: 1, gap: 2 }, warningTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' }, warningDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10 }, warningAction: { color: '#8A6516', fontFamily: Fonts.sans, fontSize: 11, fontWeight: '800' }, warningList: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#E9D499' }, warningRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0E4C4', gap: 2 }, warningLocation: { color: '#8A6516', fontFamily: Fonts.sans, fontSize: 9, fontWeight: '800' }, warningMessage: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  confirmPanel: { padding: 18, borderRadius: 8, backgroundColor: BudgetColors.greenSoft, borderWidth: 1, borderColor: '#C6DCCA', flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }, confirmCopy: { flex: 1, minWidth: 230, gap: 3 }, confirmTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' }, confirmDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 }, importButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 7, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, importText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
  successPanel: { borderColor: '#C6DCCA' }, successHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, successIcon: { width: 46, height: 46, borderRadius: 8, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' }, successCopy: { flex: 1, gap: 3 }, successTitle: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 21, fontWeight: '700' }, successDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  resultGrid: { marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, resultMetric: { minWidth: 130, flex: 1, padding: 13, borderRadius: 7, backgroundColor: BudgetColors.canvas, gap: 3 }, resultValue: { color: BudgetColors.ink, fontFamily: Fonts.serif, fontSize: 22, fontWeight: '700' }, resultLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' },
  successActions: { marginTop: 18, flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, resultLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 }, resultLinkText: { color: BudgetColors.green, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
});