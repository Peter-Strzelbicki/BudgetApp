import Constants from 'expo-constants';
import { CheckCircle2, Database, Globe2, Info, Moon, RefreshCw, Server, Sun, Wifi, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Page, PageHeading, Panel, SectionHeader, AnimatedIconButton } from '@/components/budget-ui';
import { API_URL, BackupStatus, getApiStatus, getBackupStatus, getCategories, runBackupNow } from '@/constants/api';
import { BudgetColors, Fonts } from '@/constants/theme';
import { useBudgetTheme } from '@/hooks/use-budget-theme';

type ConnectionState = 'checking' | 'online' | 'offline';

export default function SettingsScreen() {
  const [state, setState] = useState<ConnectionState>('checking');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [databaseTime, setDatabaseTime] = useState<string | null>(null);
  const [categoryCount, setCategoryCount] = useState(0);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupRunning, setBackupRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { mode, toggle: toggleTheme } = useBudgetTheme();

  const check = async () => {
    setState('checking'); setMessage(null);
    try {
      const [status, categories] = await Promise.all([getApiStatus(), getCategories()]);
      setDatabaseTime(status.time); setCategoryCount(categories.length); setState('online');
    } catch (checkError) {
      setState('offline'); setMessage(checkError instanceof Error ? checkError.message : 'The API is unreachable.');
    } finally { setCheckedAt(new Date()); }
  };

  const loadBackupStatus = async () => {
    try {
      setBackupStatus(await getBackupStatus());
    } catch {
      setBackupStatus(null);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    check();
    void loadBackupStatus();
  }, []);

  const forceBackup = async () => {
    setBackupRunning(true);
    setMessage(null);
    try {
      setBackupStatus(await runBackupNow());
    } catch (runError) {
      setMessage(runError instanceof Error ? runError.message : 'The backup could not be started.');
    } finally {
      setBackupRunning(false);
    }
  };

  const webUrl = API_URL.replace(/:3000$/, ':8081');
  return <Page>
    <PageHeading eyebrow="System" title="Connection settings" description="Live status for the private services that power HomeBudget." action={<AnimatedIconButton disabled={state === 'checking'} onPress={check} style={styles.refreshButton}>{state === 'checking' ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <RefreshCw color={BudgetColors.surface} size={16} />}<Text style={styles.refreshText}>Check connection</Text></AnimatedIconButton>} />
    <View style={[styles.statusBanner, state === 'online' ? styles.statusOnline : state === 'offline' ? styles.statusOffline : styles.statusChecking]}>
      {state === 'online' ? <CheckCircle2 color={BudgetColors.green} size={22} /> : state === 'offline' ? <XCircle color={BudgetColors.coral} size={22} /> : <ActivityIndicator color={BudgetColors.blue} />}
      <View style={styles.statusCopy}><Text style={styles.statusTitle}>{state === 'online' ? 'All systems connected' : state === 'offline' ? 'Connection unavailable' : 'Checking services'}</Text><Text style={styles.statusDetail}>{message || (checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : 'Contacting the Raspberry Pi')}</Text></View>
    </View>
    <Panel>
      <SectionHeader title="Service addresses" detail="Current runtime configuration" />
      <ServiceRow icon={<Globe2 color={BudgetColors.blue} size={18} />} label="Web application" value={webUrl} />
      <ServiceRow icon={<Server color={BudgetColors.green} size={18} />} label="Budget API" value={API_URL} />
      <ServiceRow icon={<Database color={BudgetColors.gold} size={18} />} label="Database" value="PostgreSQL · homebudget · port 5432" />
    </Panel>
    <Panel>
      <SectionHeader title="Database check" detail="Verified through the API, never directly from the browser" />
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>Connection</Text><Text style={[styles.metricValue, state === 'online' ? styles.onlineText : styles.offlineText]}>{state === 'online' ? 'Connected' : 'Unavailable'}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Reference data</Text><Text style={styles.metricValue}>{categoryCount} categories</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Database clock</Text><Text style={styles.metricValue}>{databaseTime ? new Date(databaseTime).toLocaleString() : 'Not available'}</Text></View>
      </View>
    </Panel>
    <Panel>
      <SectionHeader title="Database backup" detail="Last successful off-site backup and a manual trigger for the Pi" />
      <View style={styles.backupRow}>
        <View style={styles.backupIcon}><Database color={BudgetColors.gold} size={20} /></View>
        <View style={styles.backupCopy}>
          <Text style={styles.backupTitle}>Last backup</Text>
          <Text style={styles.backupDetail}>
            {backupLoading
              ? 'Checking backup status…'
              : backupStatus?.last_backup_utc
                ? `${new Date(backupStatus.last_backup_utc).toLocaleString()}${backupStatus.backup_name ? ` · ${backupStatus.backup_name}` : ''}`
                : 'No successful backup recorded yet'}
          </Text>
          {!backupLoading && backupStatus?.backup_target ? <Text style={styles.backupHint}>Target: {backupStatus.backup_target}</Text> : null}
        </View>
        <Pressable disabled={backupRunning} onPress={forceBackup} style={({ pressed }) => [styles.backupButton, backupRunning && styles.backupDisabled, pressed && styles.pressed]}>
          {backupRunning ? <ActivityIndicator color={BudgetColors.surface} size="small" /> : <RefreshCw color={BudgetColors.surface} size={16} />}
          <Text style={styles.backupButtonText}>{backupRunning ? 'Running' : 'Force backup'}</Text>
        </Pressable>
      </View>
    </Panel>
    <Panel>
      <SectionHeader title="Appearance" detail="Choose how HomeBudget looks on this device" />
      <View style={styles.appearanceRow}>
        <View style={styles.appearanceIcon}>{mode === 'dark' ? <Moon color={BudgetColors.blue} size={20} /> : <Sun color={BudgetColors.gold} size={20} />}</View>
        <View style={styles.appearanceCopy}><Text style={styles.appearanceTitle}>{mode === 'dark' ? 'Dark mode' : 'Light mode'}</Text><Text style={styles.appearanceDetail}>Applies instantly and remembers your choice on this device</Text></View>
        <Pressable onPress={toggleTheme} style={({ pressed }) => [styles.appearanceButton, pressed && styles.pressed]}>
          <Text style={styles.appearanceButtonText}>Switch to {mode === 'dark' ? 'light' : 'dark'}</Text>
        </Pressable>
      </View>
    </Panel>
    <Panel>
      <SectionHeader title="Network" detail="Raspberry Pi household deployment" />
      <View style={styles.networkRow}><View style={styles.networkIcon}><Wifi color={BudgetColors.green} size={20} /></View><View style={styles.networkCopy}><Text style={styles.networkTitle}>Private home network</Text><Text style={styles.networkDetail}>192.168.2.107 · Web 8081 · API 3000 · PostgreSQL 5432</Text></View></View>
    </Panel>
    <Panel>
      <SectionHeader title="About" detail="App build information" />
      <View style={styles.networkRow}><View style={styles.networkIcon}><Info color={BudgetColors.muted} size={20} /></View><View style={styles.networkCopy}><Text style={styles.networkTitle}>HomeBudget v{Constants.expoConfig?.version ?? '1.0.0'}</Text><Text style={styles.networkDetail}>Running on {Platform.OS} · Expo SDK 57</Text></View></View>
    </Panel>
  </Page>;
}

function ServiceRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.serviceRow}><View style={styles.serviceIcon}>{icon}</View><View style={styles.serviceCopy}><Text style={styles.serviceLabel}>{label}</Text><Text style={styles.serviceValue} selectable>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  refreshButton: { height: 42, paddingHorizontal: 14, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', gap: 7 }, refreshText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, pressed: { opacity: 0.68 },
  statusBanner: { minHeight: 78, borderRadius: 8, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }, statusOnline: { backgroundColor: BudgetColors.greenSoft, borderColor: BudgetColors.successLine }, statusOffline: { backgroundColor: BudgetColors.coralSoft, borderColor: BudgetColors.dangerLine }, statusChecking: { backgroundColor: BudgetColors.blueSoft, borderColor: BudgetColors.infoLine },
  statusCopy: { flex: 1, gap: 3 }, statusTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' }, statusDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  serviceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: BudgetColors.line }, serviceIcon: { width: 36, height: 36, borderRadius: 7, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' }, serviceCopy: { flex: 1, gap: 3 }, serviceLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' }, serviceValue: { color: BudgetColors.ink, fontFamily: Fonts.mono, fontSize: 11 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metric: { minWidth: 180, flex: 1, padding: 14, borderRadius: 7, backgroundColor: BudgetColors.canvas, gap: 5 }, metricLabel: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' }, metricValue: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, onlineText: { color: BudgetColors.green }, offlineText: { color: BudgetColors.coral },
  backupRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, backupIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: BudgetColors.goldSoft, alignItems: 'center', justifyContent: 'center' }, backupCopy: { flex: 1, minWidth: 210, gap: 3 }, backupTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' }, backupDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, backupHint: { color: BudgetColors.faint, fontFamily: Fonts.sans, fontSize: 10 }, backupButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 8, backgroundColor: BudgetColors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, backupButtonText: { color: BudgetColors.surface, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' }, backupDisabled: { opacity: 0.65 },
  networkRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, networkIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: BudgetColors.greenSoft, alignItems: 'center', justifyContent: 'center' }, networkCopy: { flex: 1, gap: 3 }, networkTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' }, networkDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 },
  appearanceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, appearanceIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: BudgetColors.canvas, alignItems: 'center', justifyContent: 'center' }, appearanceCopy: { flex: 1, minWidth: 180, gap: 3 }, appearanceTitle: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '800' }, appearanceDetail: { color: BudgetColors.muted, fontFamily: Fonts.sans, fontSize: 11 }, appearanceButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: BudgetColors.line, backgroundColor: BudgetColors.surface, alignItems: 'center', justifyContent: 'center' }, appearanceButtonText: { color: BudgetColors.ink, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '800' },
});