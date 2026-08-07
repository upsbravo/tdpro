import React, { useState, useEffect } from 'react';
import {
  Layers,
  Truck,
  Radio,
  CreditCard,
  Calculator,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plug,
  ExternalLink,
  ShieldAlert,
  Clock,
  Search,
  Wrench,
  Info,
  Settings2,
  X,
  FileCheck2,
  AlertTriangle,
  RotateCcw,
  Upload,
  ShieldCheck,
  FileText,
  Sparkles,
  Activity
} from 'lucide-react';
import { auth } from '../firebase';
import { User, UserRole } from '../types';

export interface IntegrationItem {
  providerId: string;
  providerName: string;
  category: 'load_board' | 'fleet_management' | 'fuel_card' | 'eld_gps' | 'accounting' | 'maintenance';
  description: string;
  isPartnerApprovalRequired: boolean;
  capabilities: string[];
  status: 'not_connected' | 'connected' | 'connected_limited' | 'attention_required' | 'error' | 'disconnected' | 'pending_partner_approval';
  connectedByUid?: string | null;
  connectedAt?: string | null;
  disconnectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastError?: string | null;
  realmId?: string | null;
  accountMappingComplete?: boolean;
  configSummary?: Record<string, any>;
}

export interface IntegrationLog {
  id: string;
  providerId: string;
  action: string;
  entityType?: string;
  localEntityId?: string;
  externalEntityId?: string;
  realmId?: string;
  status: 'success' | 'error' | 'failed' | 'info' | 'pending';
  message: string;
  startedAt: string;
  finishedAt?: string;
  recordsProcessed?: number;
  error?: string | null;
}

interface IntegrationCenterProps {
  companyId: string;
  userRole: UserRole;
  currentUser: User;
}

export const IntegrationCenter: React.FC<IntegrationCenterProps> = ({
  companyId,
  userRole,
  currentUser
}) => {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, { type: 'success' | 'error' | 'info'; text: string }>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'integrations' | 'logs'>('integrations');

  // Generic Platform Integration Modal & State
  const [selectedGenericIntegration, setSelectedGenericIntegration] = useState<IntegrationItem | null>(null);
  const [genericCredentials, setGenericCredentials] = useState({
    apiKey: '',
    clientId: '',
    accountNumber: ''
  });
  const [connectingGeneric, setConnectingGeneric] = useState(false);

  // Shopmonkey Diagnostics & Location State
  const [showShopmonkeyDiagModal, setShowShopmonkeyDiagModal] = useState(false);
  const [shopmonkeyDiagnostics, setShopmonkeyDiagnostics] = useState<any[]>([]);
  const [loadingShopmonkeyDiag, setLoadingShopmonkeyDiag] = useState(false);
  const [probingShopmonkey, setProbingShopmonkey] = useState(false);

  const handleFetchShopmonkeyDiagnostics = async () => {
    setShowShopmonkeyDiagModal(true);
    setLoadingShopmonkeyDiag(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/integrations/shopmonkey/diagnostics/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setShopmonkeyDiagnostics(data.diagnostics || []);
      }
    } catch (err) {
      console.error('Failed to fetch Shopmonkey diagnostics:', err);
    } finally {
      setLoadingShopmonkeyDiag(false);
    }
  };

  const handleProbeShopmonkeyCapabilities = async (locationId?: string) => {
    setProbingShopmonkey(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/integrations/shopmonkey/probe-capabilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId, locationId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to probe capabilities');

      setActionFeedback(prev => ({
        ...prev,
        shopmonkey: {
          type: data.connectionStatus === 'connected' ? 'success' : 'info',
          text: `Capability probe finished (${data.connectionStatus}).`
        }
      }));
      await fetchIntegrations();
    } catch (err: any) {
      setActionFeedback(prev => ({
        ...prev,
        shopmonkey: { type: 'error', text: err.message || 'Capability probe failed.' }
      }));
    } finally {
      setProbingShopmonkey(false);
    }
  };

  const handleSelectShopmonkeyLocation = async (locationId: string) => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/integrations/shopmonkey/select-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId, locationId })
      });
      if (res.ok) {
        await handleProbeShopmonkeyCapabilities(locationId);
      }
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  };

  const handleOpenGenericModal = (item: IntegrationItem) => {
    setSelectedGenericIntegration(item);
    setGenericCredentials({
      apiKey: '',
      clientId: '',
      accountNumber: ''
    });
  };

  const handleSubmitGenericConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGenericIntegration) return;

    const providerId = selectedGenericIntegration.providerId;
    const providerName = selectedGenericIntegration.providerName;

    setConnectingGeneric(true);
    setActionLoading(prev => ({ ...prev, [providerId]: 'connect' }));

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const endpoint = providerId === 'shopmonkey'
        ? '/api/integrations/shopmonkey/test-connection'
        : `/api/integrations/${providerId}/connect`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          credentials: genericCredentials
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.userMessage || data.error || `Failed to connect ${providerName}`;
        const diagId = data.supportDiagnosticId ? ` (Diagnostic Ref: ${data.supportDiagnosticId})` : '';
        throw new Error(`${errorMsg}${diagId}`);
      }

      setSelectedGenericIntegration(null);
      setActionFeedback(prev => ({
        ...prev,
        [providerId]: {
          type: data.status === 'connected' ? 'success' : 'info',
          text: data.message || data.userMessage || `Successfully connected ${providerName}!`
        }
      }));
      await fetchIntegrations();
    } catch (err: any) {
      setActionFeedback(prev => ({
        ...prev,
        [providerId]: {
          type: 'error',
          text: err.message || `Failed to connect ${providerName}`
        }
      }));
      setSelectedGenericIntegration(null);
    } finally {
      setConnectingGeneric(false);
      setActionLoading(prev => ({ ...prev, [providerId]: '' }));
    }
  };

  // Fuel Import Modal State
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [fuelProvider, setFuelProvider] = useState<'fleet_one' | 'wex' | 'comdata' | 'fuelman' | 'other'>('fleet_one');
  const [fuelMethod, setFuelMethod] = useState<'csv' | 'pdf' | 'fleetio' | 'direct_api'>('csv');
  const [fuelCsvText, setFuelCsvText] = useState('');
  const [fuelCsvFileName, setFuelCsvFileName] = useState('');
  const [fuelCsvRows, setFuelCsvRows] = useState<any[]>([]);
  const [fuelCsvParsing, setFuelCsvParsing] = useState(false);
  const [fuelPdfFileName, setFuelPdfFileName] = useState('');
  const [fuelPdfRows, setFuelPdfRows] = useState<any[]>([]);
  const [fuelPdfParsing, setFuelPdfParsing] = useState(false);
  const [fuelPdfBase64, setFuelPdfBase64] = useState('');
  const [fuelSubmitting, setFuelSubmitting] = useState(false);
  const [fuelFeedback, setFuelFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleOpenFuelModal = (item?: IntegrationItem) => {
    setShowFuelModal(true);
    setFuelFeedback(null);
    setFuelCsvText('');
    setFuelCsvFileName('');
    setFuelCsvRows([]);
    setFuelPdfFileName('');
    setFuelPdfRows([]);
    setFuelPdfBase64('');
    if (item?.providerId === 'wex') {
      setFuelProvider('wex');
    } else {
      setFuelProvider('fleet_one');
    }
  };

  const handleFuelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFuelCsvFileName(file.name);
    setFuelCsvParsing(true);
    setFuelFeedback(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setFuelCsvText(text);
      const parsed = parseClientCsv(text);
      setFuelCsvRows(parsed);
      setFuelCsvParsing(false);
    };
    reader.onerror = () => {
      setFuelFeedback({ type: 'error', text: 'Failed to read CSV file' });
      setFuelCsvParsing(false);
    };
    reader.readAsText(file);
  };

  const parseClientCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const splitLine = (lineStr: string) => {
      const res: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < lineStr.length; i++) {
        const c = lineStr[i];
        if (c === '"' || c === "'") inQ = !inQ;
        else if (c === ',' && !inQ) {
          res.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else cur += c;
      }
      res.push(cur.trim().replace(/^["']|["']$/g, ''));
      return res;
    };

    const headers = splitLine(lines[0]);
    const result: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = splitLine(lines[i]);
      if (vals.length === 0) continue;
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        row[h] = vals[idx] !== undefined ? vals[idx] : '';
      });
      result.push(row);
    }
    return result;
  };

  const handleFuelCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fuelCsvText && fuelCsvRows.length === 0) {
      setFuelFeedback({ type: 'error', text: 'Please select a CSV file to upload.' });
      return;
    }

    setFuelSubmitting(true);
    setFuelFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/fuel/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          provider: fuelProvider,
          rows: fuelCsvRows,
          csvText: fuelCsvText
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import fuel CSV');

      setFuelFeedback({
        type: 'success',
        text: data.message || `Imported ${data.importedCount} fuel records (${data.skippedDuplicatesCount} duplicate(s) skipped).`
      });

      await fetchIntegrations();
    } catch (err: any) {
      setFuelFeedback({ type: 'error', text: err.message || 'Failed to import fuel CSV' });
    } finally {
      setFuelSubmitting(false);
    }
  };

  const handleFuelPdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFuelPdfFileName(file.name);
    setFuelFeedback(null);
    setFuelPdfRows([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const resultStr = (event.target?.result as string) || '';
      setFuelPdfBase64(resultStr);
    };
    reader.onerror = () => {
      setFuelFeedback({ type: 'error', text: 'Failed to read PDF file' });
    };
    reader.readAsDataURL(file);
  };

  const handleFuelPdfExtract = async () => {
    if (!fuelPdfBase64) {
      setFuelFeedback({ type: 'error', text: 'Please select a PDF report file first.' });
      return;
    }

    setFuelPdfParsing(true);
    setFuelFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/fuel/parse-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          pdfBase64: fuelPdfBase64,
          provider: fuelProvider,
          mimeType: 'application/pdf'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract fuel data from PDF');

      setFuelPdfRows(data.rows || []);
      setFuelFeedback({
        type: 'success',
        text: data.message || `Successfully extracted ${data.extractedCount || 0} fuel transaction(s) from PDF report!`
      });
    } catch (err: any) {
      setFuelFeedback({ type: 'error', text: err.message || 'Failed to parse PDF fuel report' });
    } finally {
      setFuelPdfParsing(false);
    }
  };

  const handleFuelPdfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fuelPdfRows.length === 0) {
      setFuelFeedback({ type: 'error', text: 'No extracted fuel records to import. Please extract PDF data first.' });
      return;
    }

    setFuelSubmitting(true);
    setFuelFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/fuel/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          provider: fuelProvider,
          rows: fuelPdfRows
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import fuel PDF records');

      setFuelFeedback({
        type: 'success',
        text: data.message || `Successfully imported ${data.importedCount} fuel entries from PDF report.`
      });

      await fetchIntegrations();
    } catch (err: any) {
      setFuelFeedback({ type: 'error', text: err.message || 'Failed to import fuel PDF entries' });
    } finally {
      setFuelSubmitting(false);
    }
  };

  const handleFleetioFuelSync = async () => {
    setFuelSubmitting(true);
    setFuelFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/fuel/sync-fleetio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync Fleetio fuel');

      setFuelFeedback({
        type: 'success',
        text: data.message || 'Synced Fleet One / EFS fuel through Fleetio bridge!'
      });

      await fetchIntegrations();
    } catch (err: any) {
      setFuelFeedback({ type: 'error', text: err.message || 'Failed to sync Fleetio fuel' });
    } finally {
      setFuelSubmitting(false);
    }
  };

  const handleDirectApiRequest = async () => {
    setFuelSubmitting(true);
    setFuelFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/fuel/request-direct-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          providerId: fuelProvider === 'fleet_one' ? 'fleet_one' : 'wex'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request direct API setup');

      setFuelFeedback({
        type: 'success',
        text: data.message || 'Direct API / File Feed setup requested successfully!'
      });

      await fetchIntegrations();
    } catch (err: any) {
      setFuelFeedback({ type: 'error', text: err.message || 'Failed to submit direct API setup request' });
    } finally {
      setFuelSubmitting(false);
    }
  };
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [qbMapping, setQbMapping] = useState({
    incomeAccountIdForLoadRevenue: '4000 - Freight Revenue',
    incomeAccountIdForFuelSurcharge: '4100 - Fuel Surcharge Revenue',
    expenseAccountIdForFuel: '5000 - Fuel Expense',
    expenseAccountIdForOwnerOperatorSettlement: '5100 - Driver & OO Compensation',
    expenseAccountIdForAdvances: '5200 - Driver Cash Advances',
    expenseAccountIdForDispatchFees: '5300 - Dispatch & Logistics Fees',
    accountsPayableAccountId: '2000 - Accounts Payable',
    accountsReceivableAccountId: '1100 - Accounts Receivable'
  });

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/integrations/company/${companyId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load integration status');
      }

      const data = await res.json();
      setIntegrations(data.integrations || []);
      setLogs(data.logs || []);
    } catch (err: any) {
      console.error('Error fetching integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountMapping = async () => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/integrations/quickbooks/account-mapping?companyId=${companyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mapping) {
          setQbMapping(prev => ({ ...prev, ...data.mapping }));
        }
      }
    } catch (err) {
      console.error('Error fetching account mapping:', err);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    fetchAccountMapping();
  }, [companyId]);

  // Listen for OAuth Popup PostMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1') && !origin.includes('tdpro.cloud')) {
        return;
      }

      if (event.data?.type === 'QUICKBOOKS_OAUTH_SUCCESS') {
        fetchIntegrations();
        fetchAccountMapping();
        setActionFeedback(prev => ({
          ...prev,
          quickbooks: {
            type: 'success',
            text: 'QuickBooks Online connected successfully! Please verify account mapping before syncing.'
          }
        }));
      } else if (event.data?.type === 'QUICKBOOKS_OAUTH_ERROR') {
        setActionFeedback(prev => ({
          ...prev,
          quickbooks: { type: 'error', text: event.data.error || 'QuickBooks authorization was canceled or failed.' }
        }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [companyId]);

  // Connect QuickBooks OAuth Popup Launcher
  const handleConnectQuickBooks = async () => {
    // Permission check for dispatcher
    if (userRole === 'dispatcher') {
      const perms = (currentUser as any).permissions || (currentUser as any).dispatcherPermissions || {};
      if (!perms.integrations?.connectQuickBooks) {
        alert('Access Denied: Dispatchers cannot connect QuickBooks Online unless explicitly authorized by Tenant Admin.');
        return;
      }
    }

    setActionLoading(prev => ({ ...prev, quickbooks: 'connect' }));
    setActionFeedback(prev => ({ ...prev, quickbooks: { type: 'info', text: 'Opening QuickBooks Online OAuth 2.0 portal...' } }));

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/integrations/quickbooks/connect?companyId=${companyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate QuickBooks connection');

      if (data.url) {
        const popup = window.open(data.url, 'qb_oauth_popup', 'width=650,height=750,scrollbars=yes,status=yes');
        if (!popup) {
          alert('Please allow popups for this browser window to authorize your QuickBooks Online company.');
        }
      }
    } catch (err: any) {
      setActionFeedback(prev => ({ ...prev, quickbooks: { type: 'error', text: err.message || 'Failed to connect QuickBooks' } }));
    } finally {
      setActionLoading(prev => ({ ...prev, quickbooks: '' }));
    }
  };

  // Disconnect Handler
  const handleDisconnect = async (providerId: string) => {
    if (userRole === 'dispatcher') {
      const perms = (currentUser as any).permissions || (currentUser as any).dispatcherPermissions || {};
      if (!perms.integrations?.connectQuickBooks) {
        alert('Access Denied: Dispatchers cannot disconnect integrations.');
        return;
      }
    }

    if (!window.confirm(`Are you sure you want to disconnect ${providerId === 'quickbooks' ? 'QuickBooks Online' : providerId}? Tokens will be revoked.`)) {
      return;
    }

    setActionLoading(prev => ({ ...prev, [providerId]: 'disconnect' }));
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const endpoint = providerId === 'quickbooks'
        ? '/api/integrations/quickbooks/disconnect'
        : `/api/integrations/${providerId}/disconnect`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect');

      setActionFeedback(prev => ({
        ...prev,
        [providerId]: { type: 'success', text: data.message || 'Integration disconnected successfully.' }
      }));
      await fetchIntegrations();
    } catch (err: any) {
      setActionFeedback(prev => ({
        ...prev,
        [providerId]: { type: 'error', text: err.message || 'Failed to disconnect' }
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [providerId]: '' }));
    }
  };

  // Sync Handler
  const handleSyncNow = async (providerId: string) => {
    if (userRole === 'dispatcher') {
      const perms = (currentUser as any).permissions || (currentUser as any).dispatcherPermissions || {};
      if (!perms.integrations?.syncApprovedRecords && !perms.quickbooksSync) {
        alert('Access Denied: Your dispatcher profile does not have permission to sync approved accounting records.');
        return;
      }
    }

    setActionLoading(prev => ({ ...prev, [providerId]: 'sync' }));
    setActionFeedback(prev => ({ ...prev, [providerId]: { type: 'info', text: 'Syncing approved accounting records...' } }));

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const endpoint = providerId === 'quickbooks'
        ? '/api/integrations/quickbooks/sync'
        : `/api/integrations/${providerId}/sync`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setActionFeedback(prev => ({
        ...prev,
        [providerId]: { type: 'success', text: data.message || `Sync completed! Processed ${data.recordsProcessed ?? 0} records.` }
      }));
      await fetchIntegrations();
    } catch (err: any) {
      setActionFeedback(prev => ({
        ...prev,
        [providerId]: { type: 'error', text: err.message || 'Sync failed' }
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [providerId]: '' }));
    }
  };

  // Retry Failed Sync Handler
  const handleRetrySync = async (syncLogId: string) => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/integrations/quickbooks/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId, syncLogId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retry sync');

      alert(data.message || 'Retry initiated successfully.');
      await fetchIntegrations();
    } catch (err: any) {
      alert(err.message || 'Retry failed');
    }
  };

  // Save Account Mapping Handler
  const handleSaveAccountMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMapping(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/integrations/quickbooks/account-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          mapping: qbMapping
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save account mapping');

      setShowMappingModal(false);
      setActionFeedback(prev => ({
        ...prev,
        quickbooks: { type: 'success', text: 'QuickBooks General Ledger account mapping saved successfully!' }
      }));
      await fetchIntegrations();
    } catch (err: any) {
      alert(err.message || 'Failed to save account mapping');
    } finally {
      setSavingMapping(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'load_board':
        return <Layers className="w-5 h-5 text-blue-600" />;
      case 'fleet_management':
        return <Truck className="w-5 h-5 text-indigo-600" />;
      case 'fuel_card':
        return <CreditCard className="w-5 h-5 text-emerald-600" />;
      case 'eld_gps':
        return <Radio className="w-5 h-5 text-amber-600" />;
      case 'accounting':
        return <Calculator className="w-5 h-5 text-purple-600" />;
      case 'maintenance':
        return <Wrench className="w-5 h-5 text-rose-600" />;
      default:
        return <Plug className="w-5 h-5 text-gray-600" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'load_board': return 'Load Board';
      case 'fleet_management': return 'Fleet Management';
      case 'fuel_card': return 'Fuel Cards';
      case 'eld_gps': return 'ELD & GPS';
      case 'accounting': return 'Accounting';
      case 'maintenance': return 'Maintenance';
      default: return category;
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        );
      case 'connected_limited':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Connected (Limited)
          </span>
        );
      case 'attention_required':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Attention Required
          </span>
        );
      case 'error':
      case 'reconnect_required':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Reconnect Required
          </span>
        );
      case 'disconnected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <XCircle className="w-3.5 h-3.5" />
            Disconnected
          </span>
        );
      case 'not_connected':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            <Plug className="w-3.5 h-3.5" />
            Not Connected
          </span>
        );
    }
  };

  const filteredIntegrations = integrations.filter(item => {
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesSearch =
      item.providerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Title Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Plug className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">Integrations & QuickBooks Online</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Connect QuickBooks Online via official OAuth 2.0 to sync load invoices, carrier bills, fuel expenses, and live payment status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchIntegrations}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>
        </div>

        {/* Enterprise Security Banner */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 space-y-1">
            <p className="font-semibold">OAuth 2.0 Security & Encryption Standard</p>
            <p>
              Tenant credentials and OAuth tokens are encrypted server-side using AES-256 and never exposed in browser code. Super Admins and Dispatchers cannot view tenant passwords or raw tokens.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'integrations'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Connected Platforms ({filteredIntegrations.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Sync Logs ({logs.length})
          </button>
        </div>

        {activeTab === 'integrations' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
            >
              <option value="all">All Categories</option>
              <option value="accounting">Accounting</option>
              <option value="load_board">Load Boards</option>
              <option value="fleet_management">Fleet Management</option>
              <option value="fuel_card">Fuel Cards</option>
              <option value="eld_gps">ELD & GPS</option>
            </select>
          </div>
        )}
      </div>

      {activeTab === 'integrations' && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : filteredIntegrations.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Plug className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-800">No Integrations Found</h3>
              <p className="text-sm text-gray-500 mt-1">Try adjusting your search query or category filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIntegrations.map(item => {
                const isQB = item.providerId === 'quickbooks';
                const isShopmonkey = item.providerId === 'shopmonkey';
                const isConnected = item.status === 'connected' || item.status === 'connected_limited';
                const isAttention = item.status === 'attention_required';
                const isBusy = Boolean(actionLoading[item.providerId]);
                const feedback = actionFeedback[item.providerId];

                return (
                  <div
                    key={item.providerId}
                    className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-lg border ${isQB ? 'bg-emerald-50 border-emerald-200' : isShopmonkey ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-200'}`}>
                            {getCategoryIcon(item.category)}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                              {item.providerName}
                              {isQB && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">OAuth 2.0</span>}
                              {isShopmonkey && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">API v3</span>}
                            </h3>
                            <span className="text-xs font-medium text-gray-500">
                              {getCategoryLabel(item.category)}
                            </span>
                          </div>
                        </div>
                        {renderStatusBadge(item.status)}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-gray-600 mb-4 leading-relaxed">{item.description}</p>

                      {/* Shopmonkey Capability Probe Matrix & Location Selector */}
                      {isShopmonkey && (
                        <div className="mb-4 space-y-3">
                          {item.configSummary?.locations && item.configSummary.locations.length > 0 && (
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Shopmonkey Location:</label>
                              <select
                                value={item.configSummary.selectedLocationId || item.configSummary.locations[0]?.id}
                                onChange={(e) => handleSelectShopmonkeyLocation(e.target.value)}
                                className="w-full text-xs py-1.5 px-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-800 font-medium focus:ring-2 focus:ring-rose-500"
                              >
                                {item.configSummary.locations.map((loc: any) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.name} ({loc.id})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {item.configSummary?.testedCapabilities && item.configSummary.testedCapabilities.length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Resource Capability Matrix</p>
                                <button
                                  onClick={() => handleProbeShopmonkeyCapabilities(item.configSummary?.selectedLocationId)}
                                  disabled={probingShopmonkey}
                                  className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                                >
                                  <RefreshCw className={`w-3 h-3 ${probingShopmonkey ? 'animate-spin' : ''}`} />
                                  Probe API
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {item.configSummary.testedCapabilities.map((cap: any) => (
                                  <div
                                    key={cap.capability}
                                    className={`p-1.5 rounded-md border text-[11px] flex items-center justify-between ${
                                      cap.available
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                        : 'bg-rose-50 border-rose-200 text-rose-900'
                                    }`}
                                  >
                                    <span className="font-medium">{cap.name}</span>
                                    {cap.available ? (
                                      <span className="font-bold text-emerald-700 text-[10px] bg-emerald-100 px-1 py-0.2 rounded">OK</span>
                                    ) : (
                                      <span className="font-bold text-rose-700 text-[10px] bg-rose-100 px-1 py-0.2 rounded">
                                        {cap.safeErrorCode || '403'}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {item.status === 'connected_limited' && (
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Financial & PM Features Gated</span>
                              </div>
                              <p className="text-[11px] text-amber-800">
                                Shopmonkey API key is valid, but some resources returned 403 Forbidden. Automatic PM recalculations and invoice deductions remain disabled until resource access is authorized.
                              </p>
                            </div>
                          )}

                          {item.configSummary?.supportDiagnosticId && (
                            <div className="flex items-center justify-between text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-200">
                              <span className="text-gray-500">Diagnostic ID:</span>
                              <span className="font-mono font-bold text-gray-800">{item.configSummary.supportDiagnosticId}</span>
                              <button
                                onClick={handleFetchShopmonkeyDiagnostics}
                                className="text-blue-600 hover:underline font-semibold ml-2"
                              >
                                View Logs
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Capabilities Chips for Non-Shopmonkey */}
                      {!isShopmonkey && (
                        <div className="mb-4">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                            Capabilities
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.capabilities.map(cap => (
                              <span
                                key={cap}
                                className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* QuickBooks Account Mapping Complete Notice */}
                      {isQB && isConnected && (
                        <div className="mb-4">
                          {!item.accountMappingComplete ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                <span>Account Mapping Required</span>
                              </div>
                              <p className="text-[11px]">
                                QuickBooks connected. Complete account mapping before syncing accounting records.
                              </p>
                              <button
                                onClick={() => setShowMappingModal(true)}
                                className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 rounded transition"
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                                Configure Account Mapping
                              </button>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-medium">
                                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                                <span>Account Mapping Complete</span>
                              </div>
                              <button
                                onClick={() => setShowMappingModal(true)}
                                className="text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                Edit Mapping
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Feedback Message */}
                      {feedback && (
                        <div
                          className={`p-2.5 rounded-lg text-xs mb-4 border ${
                            feedback.type === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : feedback.type === 'error'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {feedback.text}
                        </div>
                      )}

                      {/* Connection Metadata */}
                      {isConnected && (
                        <div className="text-[11px] text-gray-500 space-y-1 mb-4 border-t border-gray-100 pt-2">
                          {item.realmId && (
                            <div className="flex items-center justify-between">
                              <span>Intuit Realm ID:</span>
                              <span className="font-mono font-bold text-gray-700">{item.realmId}</span>
                            </div>
                          )}
                          {item.connectedAt && (
                            <div className="flex items-center justify-between">
                              <span>Connected Date:</span>
                              <span>{new Date(item.connectedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                          {item.lastSyncAt && (
                            <div className="flex items-center justify-between">
                              <span>Last Sync:</span>
                              <span>{new Date(item.lastSyncAt).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer Action Buttons */}
                    <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleSyncNow(item.providerId)}
                            disabled={isBusy}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                            Sync Now
                          </button>
                          {(item.category === 'fuel_card' || item.providerId === 'wex' || item.providerId === 'fleet_one') && (
                            <button
                              onClick={() => handleOpenFuelModal(item)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition flex items-center gap-1"
                              title="Set Up Fuel Import"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Fuel Import
                            </button>
                          )}
                          {isQB && (
                            <button
                              onClick={() => setShowMappingModal(true)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                              title="Account Mapping"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDisconnect(item.providerId)}
                            disabled={isBusy}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition disabled:opacity-50"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            if (item.category === 'fuel_card' || item.providerId === 'wex' || item.providerId === 'fleet_one') {
                              handleOpenFuelModal(item);
                            } else if (isQB) {
                              handleConnectQuickBooks();
                            } else {
                              handleOpenGenericModal(item);
                            }
                          }}
                          disabled={isBusy}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50 shadow-sm"
                        >
                          {isBusy ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (item.category === 'fuel_card' || item.providerId === 'wex' || item.providerId === 'fleet_one') ? (
                            <Upload className="w-4 h-4" />
                          ) : (
                            <Plug className="w-4 h-4" />
                          )}
                          {(item.category === 'fuel_card' || item.providerId === 'wex' || item.providerId === 'fleet_one')
                            ? 'Set Up Fuel Import'
                            : `Connect ${item.providerName}`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Sync Activity Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              QuickBooks & Integration Audit Logs
            </h3>
            <span className="text-xs text-gray-500">{logs.length} records</span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">No sync logs recorded yet</p>
              <p className="text-xs text-gray-400 mt-1">Logs will appear when connections or accounting sync operations are executed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Message / Error</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                        {log.startedAt ? new Date(log.startedAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800 uppercase tracking-wide">
                        {log.providerId}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-700 capitalize">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                        {log.entityType || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {log.status === 'success' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            Success
                          </span>
                        ) : log.status === 'error' || log.status === 'failed' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                            Failed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 max-w-md truncate">
                        {log.error || log.message || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(log.status === 'error' || log.status === 'failed') && (
                          <button
                            onClick={() => handleRetrySync(log.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ACCOUNT MAPPING MODAL */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">QuickBooks Online General Ledger Mapping</h3>
                  <p className="text-xs text-gray-500">Map Truck Dispatch Pro accounting categories to your QuickBooks Chart of Accounts.</p>
                </div>
              </div>
              <button
                onClick={() => setShowMappingModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountMapping} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Load Freight Revenue (Income)
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.incomeAccountIdForLoadRevenue}
                    onChange={e => setQbMapping(prev => ({ ...prev, incomeAccountIdForLoadRevenue: e.target.value }))}
                    placeholder="e.g. 4000 - Freight Revenue"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Fuel Surcharge Income
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.incomeAccountIdForFuelSurcharge}
                    onChange={e => setQbMapping(prev => ({ ...prev, incomeAccountIdForFuelSurcharge: e.target.value }))}
                    placeholder="e.g. 4100 - Fuel Surcharge Revenue"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Fuel Expense
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.expenseAccountIdForFuel}
                    onChange={e => setQbMapping(prev => ({ ...prev, expenseAccountIdForFuel: e.target.value }))}
                    placeholder="e.g. 5000 - Fuel Expense"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Driver & OO Compensation (Expense)
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.expenseAccountIdForOwnerOperatorSettlement}
                    onChange={e => setQbMapping(prev => ({ ...prev, expenseAccountIdForOwnerOperatorSettlement: e.target.value }))}
                    placeholder="e.g. 5100 - Driver & OO Compensation"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Driver Advances Expense
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.expenseAccountIdForAdvances}
                    onChange={e => setQbMapping(prev => ({ ...prev, expenseAccountIdForAdvances: e.target.value }))}
                    placeholder="e.g. 5200 - Driver Cash Advances"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Dispatch & Logistics Fees Expense
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.expenseAccountIdForDispatchFees}
                    onChange={e => setQbMapping(prev => ({ ...prev, expenseAccountIdForDispatchFees: e.target.value }))}
                    placeholder="e.g. 5300 - Dispatch & Logistics Fees"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Accounts Payable (A/P)
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.accountsPayableAccountId}
                    onChange={e => setQbMapping(prev => ({ ...prev, accountsPayableAccountId: e.target.value }))}
                    placeholder="e.g. 2000 - Accounts Payable"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Accounts Receivable (A/R)
                  </label>
                  <input
                    type="text"
                    required
                    value={qbMapping.accountsReceivableAccountId}
                    onChange={e => setQbMapping(prev => ({ ...prev, accountsReceivableAccountId: e.target.value }))}
                    placeholder="e.g. 1100 - Accounts Receivable"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMapping}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {savingMapping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Account Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generic Integration Connection Modal */}
      {selectedGenericIntegration && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                  <Plug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Connect {selectedGenericIntegration.providerName}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Configure API credentials to integrate with Truck Dispatch Pro
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedGenericIntegration(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitGenericConnect} className="mt-4 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>AES-256 Server-Side Encryption</span>
                </div>
                <p className="text-[11px] text-blue-800">
                  Your platform API keys and tokens are encrypted and managed securely via backend microservices.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  API Key / Token
                </label>
                <input
                  type="password"
                  required
                  value={genericCredentials.apiKey}
                  onChange={e => setGenericCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Enter API Key or Auth Token"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Account Number / Client ID <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={genericCredentials.clientId}
                  onChange={e => setGenericCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                  placeholder="e.g. ACC-884920"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedGenericIntegration(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingGeneric}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {connectingGeneric ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                  Establish Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fuel Import Modal */}
      {showFuelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Set Up Fuel Import
                  </h3>
                  <p className="text-xs text-gray-500">
                    Import transactions from Fleet One, EFS, WEX, Comdata, or Corpay
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFuelModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {/* Security Callout */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Fleet One / EFS Security Notice</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Fleet One / EFS fuel transactions may be imported by CSV, synced through Fleetio EFS integration, or connected through approved WEX/EFS API or file-feed access. Do not enter your Fleet One password into DD Pro.
                </p>
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Select Fuel Card Provider
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'fleet_one', label: 'Fleet One / EFS' },
                    { id: 'wex', label: 'WEX' },
                    { id: 'comdata', label: 'Comdata' },
                    { id: 'fuelman', label: 'Fuelman / Corpay' },
                    { id: 'other', label: 'Other' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFuelProvider(p.id as any)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left transition ${
                        fuelProvider === p.id
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection Method Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Select Connection Method
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setFuelMethod('csv'); setFuelFeedback(null); }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      fuelMethod === 'csv'
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 text-blue-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Upload className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Upload CSV</span>
                    </div>
                    <span className="text-[11px] text-gray-500">Import CSV file downloaded from fuel card portal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFuelMethod('pdf'); setFuelFeedback(null); }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      fuelMethod === 'pdf'
                        ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 text-purple-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                      <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Upload PDF (AI)</span>
                      <span className="ml-auto bg-purple-100 text-purple-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500">Auto-parse driver & truck fuel statements via Gemini AI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFuelMethod('fleetio'); setFuelFeedback(null); }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      fuelMethod === 'fleetio'
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 text-blue-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Connect Fleetio</span>
                    </div>
                    <span className="text-[11px] text-gray-500">Sync Fleet One / EFS fuel through Fleetio bridge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFuelMethod('direct_api'); setFuelFeedback(null); }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      fuelMethod === 'direct_api'
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 text-blue-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Plug className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Request Direct API</span>
                    </div>
                    <span className="text-[11px] text-gray-500">Request WEX / EFS direct API or SFTP file feed</span>
                  </button>
                </div>
              </div>

              {/* METHOD 1: CSV Upload */}
              {fuelMethod === 'csv' && (
                <form onSubmit={handleFuelCsvSubmit} className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-700">
                      Select Fuel Transaction CSV File
                    </label>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFuelFileChange}
                      className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition cursor-pointer border border-gray-200 rounded-xl p-1"
                    />
                  </div>

                  {fuelCsvParsing && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      Parsing CSV headers and rows...
                    </div>
                  )}

                  {fuelCsvRows.length > 0 && !fuelCsvParsing && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">
                          CSV Preview ({fuelCsvRows.length} record{fuelCsvRows.length > 1 ? 's' : ''} detected)
                        </span>
                        <span className="text-[11px] text-emerald-600 font-medium">
                          Auto-mapped fields ready
                        </span>
                      </div>

                      <div className="max-h-40 overflow-x-auto overflow-y-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-left text-[11px] text-gray-600">
                          <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1.5">Date</th>
                              <th className="px-2.5 py-1.5">Card #</th>
                              <th className="px-2.5 py-1.5">Truck</th>
                              <th className="px-2.5 py-1.5">Merchant</th>
                              <th className="px-2.5 py-1.5">Gallons</th>
                              <th className="px-2.5 py-1.5">Total ($)</th>
                              <th className="px-2.5 py-1.5">Odometer</th>
                              <th className="px-2.5 py-1.5">Tran ID</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {fuelCsvRows.slice(0, 5).map((r, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.transactionDate || r.date || r.fuelDate || r['Transaction Date'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.cardNumberMasked || r.cardNumber || r['Card Number'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.truckNumber || r.truck || r.unit || r['Truck Number'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.merchant || r.vendor || r['Merchant'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.gallonsDecimal || r.gallons || r['Gallons'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.totalAmountCents ? (r.totalAmountCents/100).toFixed(2) : (r.totalAmount || r.amount || '-')}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.odometer || r['Odometer'] || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.providerTransactionId || r.transactionId || r['Transaction ID'] || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {fuelFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      fuelFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {fuelFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                      <span>{fuelFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFuelModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={fuelSubmitting || (!fuelCsvText && fuelCsvRows.length === 0)}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                      {fuelSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Import Fuel Entries
                    </button>
                  </div>
                </form>
              )}

              {/* METHOD 2: PDF Upload with Gemini AI */}
              {fuelMethod === 'pdf' && (
                <form onSubmit={handleFuelPdfSubmit} className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-purple-800">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>AI Multi-Driver & Multi-Truck PDF Parser</span>
                    </div>
                    <p className="text-[11px] text-purple-800 leading-relaxed">
                      Upload your Fleet One, EFS, WEX, or fuel card PDF statement. Gemini AI automatically extracts transaction dates, driver names, truck numbers, card numbers, fuel stations, gallons, prices, and totals.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-700">
                      Select Fuel Card Statement PDF File
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFuelPdfFileChange}
                        className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition cursor-pointer border border-gray-200 rounded-xl p-1"
                      />
                      <button
                        type="button"
                        onClick={handleFuelPdfExtract}
                        disabled={!fuelPdfBase64 || fuelPdfParsing}
                        className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-sm disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                      >
                        {fuelPdfParsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {fuelPdfParsing ? 'Extracting with AI...' : 'Parse PDF with AI'}
                      </button>
                    </div>
                  </div>

                  {fuelPdfParsing && (
                    <div className="flex items-center gap-2 text-xs text-purple-700 p-3 bg-purple-50 rounded-xl border border-purple-100">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Analyzing PDF document pages and parsing fuel card transaction records...</span>
                    </div>
                  )}

                  {fuelPdfRows.length > 0 && !fuelPdfParsing && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Parsed Transactions ({fuelPdfRows.length} record{fuelPdfRows.length > 1 ? 's' : ''} extracted)
                        </span>
                        <span className="text-[11px] text-purple-700 font-semibold bg-purple-100 px-2 py-0.5 rounded-full">
                          Ready to import
                        </span>
                      </div>

                      <div className="max-h-52 overflow-x-auto overflow-y-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-left text-[11px] text-gray-600">
                          <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1.5">Date</th>
                              <th className="px-2.5 py-1.5">Driver / Card</th>
                              <th className="px-2.5 py-1.5">Truck</th>
                              <th className="px-2.5 py-1.5">Merchant & Location</th>
                              <th className="px-2.5 py-1.5">Gallons</th>
                              <th className="px-2.5 py-1.5">Total ($)</th>
                              <th className="px-2.5 py-1.5">Product</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {fuelPdfRows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-purple-50/30">
                                <td className="px-2.5 py-1.5 whitespace-nowrap font-medium text-gray-800">{r.transactionDate}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">
                                  <div className="font-semibold text-gray-800">{r.driverId || 'Fleet Card'}</div>
                                  <div className="text-[10px] text-gray-400">{r.cardNumberMasked || '-'}</div>
                                </td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap font-bold text-blue-700">{r.truckNumber || '-'}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">
                                  <div className="font-medium">{r.merchant || 'Fuel Stop'}</div>
                                  <div className="text-[10px] text-gray-400">{[r.city, r.state].filter(Boolean).join(', ')}</div>
                                </td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap">{r.gallonsDecimal ? r.gallonsDecimal.toFixed(1) : '-'} gal</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap font-bold text-emerald-700">
                                  ${r.totalAmountCents ? (r.totalAmountCents / 100).toFixed(2) : '0.00'}
                                </td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-500">{r.productType || 'DIESEL'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {fuelFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      fuelFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {fuelFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                      <span>{fuelFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFuelModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={fuelSubmitting || fuelPdfRows.length === 0}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                      {fuelSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Import {fuelPdfRows.length > 0 ? `${fuelPdfRows.length} ` : ''}Parsed Entries
                    </button>
                  </div>
                </form>
              )}

              {/* METHOD 2: Fleetio Bridge */}
              {fuelMethod === 'fleetio' && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  {integrations.some(i => i.providerId === 'fleetio' && i.status === 'connected') ? (
                    <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Fleetio Fleet Management Connected</span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Sync Fleet One / EFS fuel entries automatically from Fleetio into DD Pro fuel_entries.
                      </p>
                      <button
                        type="button"
                        onClick={handleFleetioFuelSync}
                        disabled={fuelSubmitting}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
                      >
                        {fuelSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync Fleet One / EFS fuel through Fleetio
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span>Fleetio Not Connected</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Fleetio integration is not currently connected. Connect Fleetio first in the Integration Center to enable Fleetio fuel syncing.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowFuelModal(false);
                          const fleetioItem = integrations.find(i => i.providerId === 'fleetio');
                          if (fleetioItem) handleOpenGenericModal(fleetioItem);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition"
                      >
                        <Plug className="w-4 h-4" />
                        Connect Fleetio Integration
                      </button>
                    </div>
                  )}

                  {fuelFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      fuelFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {fuelFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                      <span>{fuelFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFuelModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* METHOD 3: Direct API / File Feed Setup */}
              {fuelMethod === 'direct_api' && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-2xl space-y-2 text-xs text-purple-900">
                    <div className="font-bold text-purple-900 flex items-center gap-2">
                      <Plug className="w-4 h-4 text-purple-600" />
                      <span>Request WEX / Fleet One / EFS Direct API or SFTP File Feed</span>
                    </div>
                    <p className="text-[11px] text-purple-800 leading-relaxed">
                      WEX and Fleet One offer direct API and automated SFTP fuel transaction file feeds for high-volume fleets. Submitting a request creates a pending partner approval record at <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-900 font-mono">/companies/{companyId}/integrations/fleet_one</code>.
                    </p>
                  </div>

                  {fuelFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      fuelFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {fuelFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                      <span>{fuelFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFuelModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDirectApiRequest}
                      disabled={fuelSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                      {fuelSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                      Request Direct API / File Feed Setup
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shopmonkey Diagnostic Logs Modal */}
      {showShopmonkeyDiagModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                  <Activity className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Shopmonkey Diagnostic Logs</h3>
                  <p className="text-xs text-gray-500">API status history, capability probing results, and request traces</p>
                </div>
              </div>
              <button
                onClick={() => setShowShopmonkeyDiagModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {loadingShopmonkeyDiag ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-medium">Loading diagnostic records...</p>
                </div>
              ) : shopmonkeyDiagnostics.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                  <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-700">No Diagnostic Records Found</p>
                  <p className="text-xs text-gray-500 mt-1">Run an API test or capability probe to record traces.</p>
                </div>
              ) : (
                shopmonkeyDiagnostics.map((diag, idx) => (
                  <div key={diag.supportDiagnosticId || idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          diag.httpStatus === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          HTTP {diag.httpStatus}
                        </span>
                        <span className="font-mono text-xs font-bold text-gray-800">{diag.httpMethod} {diag.httpPathname}</span>
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">{diag.createdAt ? new Date(diag.createdAt).toLocaleString() : ''}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-white p-2.5 rounded-lg border border-gray-200">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Error Code:</span>
                        <span className="font-mono font-bold text-rose-700">{diag.errorCode || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Request ID:</span>
                        <span className="font-mono text-gray-700">{diag.requestId || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Location ID:</span>
                        <span className="font-mono text-gray-700">{diag.locationId || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Credential Ref:</span>
                        <span className="font-mono text-gray-700">{diag.credentialRef || 'Masked Key'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Diagnostic Ref ID:</span>
                        <span className="font-mono font-bold text-blue-700">{diag.supportDiagnosticId}</span>
                      </div>
                    </div>

                    {diag.userMessage && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium">
                        {diag.userMessage}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => handleProbeShopmonkeyCapabilities()}
                disabled={probingShopmonkey}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingShopmonkey ? 'animate-spin' : ''}`} />
                Run Live Capability Probe
              </button>
              <button
                onClick={() => setShowShopmonkeyDiagModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
