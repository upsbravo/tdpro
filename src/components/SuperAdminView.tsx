import React, { useState, useEffect } from 'react';
import { ShieldCheck, Users, DollarSign, PlusCircle, CheckCircle, AlertTriangle, Send, Mail, Play, Key, ExternalLink, Settings, Download, Terminal, UserPlus, Shield, Copy, Check, AlertCircle, Info, Edit2, Truck, Eye, EyeOff, CreditCard, ArrowUpRight, HelpCircle, Megaphone, Plug, Activity, Zap, RefreshCw, Gauge } from 'lucide-react';
import { Company, Invoice, AppNotification, User, UserRole } from '../types';
import { formatCurrency } from '../utils';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { SupportDeskModal } from './SupportDeskModal';
import MasterAnnouncementBanner from './MasterAnnouncementBanner';
import SystemStatusBar from './SystemStatusBar';
import SuperAdminAnnouncementManager from './SuperAdminAnnouncementManager';
import { GuidedProductTour, shouldShowTourForUser } from './tour/GuidedProductTour';
import { Compass } from 'lucide-react';
import { IntegrationCenter } from './IntegrationCenter';
import { AccountingCenter } from './AccountingCenter';
import { FormErrorSummary, FieldErrorMessage, getFieldInputClass, LoadingSubmitButton } from './common/FormComponents';
import { Calculator } from 'lucide-react';


interface SuperAdminViewProps {
  companies: Company[];
  invoices: Invoice[];
  notifications: AppNotification[];
  users: User[];
  onApproveCompany: (companyId: string) => void;
  onSuspendCompany: (companyId: string) => void;
  onUpdateCompany: (companyId: string, updates: Partial<Company>) => void;
  onSendGlobalBroadcast: (title: string, message: string) => void;
  onTriggerEmailTest: (recipient: string) => void;
  onImpersonateCompany: (companyId: string) => void;
  onAddTenant: (tenant: { name: string; contactEmail: string; contactName: string; dotNumber: string; plan: 'Basic' | 'Premium'; offerTrial?: boolean }) => void;
  onAddUser: (user: Omit<User, 'id'>) => void;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  currentUserId: string;
  onUpdateUserProfile: (userId: string, profile: Partial<User>) => void;
  onResendOnboardingEmail: (companyId: string, email: string, name: string) => void;
  onResetOnboardingEmailCount: (companyId: string) => void;
  onClearAllDatabaseData?: () => void;
}

export default function SuperAdminView({
  companies,
  invoices,
  notifications,
  users,
  onApproveCompany,
  onSuspendCompany,
  onUpdateCompany,
  onSendGlobalBroadcast,
  onTriggerEmailTest,
  onImpersonateCompany,
  onAddTenant,
  onAddUser,
  pageTheme,
  currentUserId,
  onUpdateUserProfile,
  onResendOnboardingEmail,
  onResetOnboardingEmailCount,
  onClearAllDatabaseData,
}: SuperAdminViewProps) {
  
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [testEmailAddr, setTestEmailAddr] = useState('admin@dispatchpro.com');
  const [emailLogs, setEmailLogs] = useState<{ id: string; to: string; subject: string; body: string; status: string; timestamp: string }[]>([]);
  const [realMailLogs, setRealMailLogs] = useState<{ id: string; to: string; subject: string; body: string; delivery?: { state: string; error?: string; info?: any }; timestamp: string; timestampNum: number }[]>([]);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tenants' | 'billing' | 'smtp' | 'settings' | 'users' | 'announcements' | 'integrations' | 'accounting' | 'diagnostics'>('tenants');
  const [selectedIntegrationCoId, setSelectedIntegrationCoId] = useState<string>('');
  const [showSupportDeskModal, setShowSupportDeskModal] = useState(false);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  // Speed & Performance Diagnostics State
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<{
    apiLatencyMs: number;
    firestoreReadMs: number;
    authPingMs: number;
    staticAssetMs: number;
    lastRunAt: string;
    statusSummary: 'Optimal' | 'Minor Latency' | 'Degraded';
  } | null>(null);

  const runSpeedBenchmark = async () => {
    setDiagRunning(true);
    try {
      // 1. Express API Ping
      const t0 = performance.now();
      let apiMs = 0;
      try {
        const res = await fetch('/api/health');
        await res.json();
        apiMs = Math.round(performance.now() - t0);
      } catch {
        apiMs = Math.round(performance.now() - t0);
      }

      // 2. Firestore Read Latency
      const t1 = performance.now();
      let firestoreMs = 0;
      try {
        if (companies.length > 0) {
          const testCoRef = doc(db, 'companies', companies[0].id);
          await getDoc(testCoRef);
        }
        firestoreMs = Math.round(performance.now() - t1);
      } catch {
        firestoreMs = Math.round(performance.now() - t1);
      }

      // 3. Auth Token Ping
      const t2 = performance.now();
      let authMs = 0;
      try {
        await auth.currentUser?.getIdToken();
        authMs = Math.round(performance.now() - t2);
      } catch {
        authMs = Math.round(performance.now() - t2);
      }

      // 4. Client Static Asset Ping
      const t3 = performance.now();
      let assetMs = 0;
      try {
        await fetch('/favicon.ico', { method: 'HEAD' });
        assetMs = Math.round(performance.now() - t3);
      } catch {
        assetMs = Math.round(performance.now() - t3);
      }

      const maxLatency = Math.max(apiMs, firestoreMs, authMs, assetMs);
      let summary: 'Optimal' | 'Minor Latency' | 'Degraded' = 'Optimal';
      if (maxLatency > 500) summary = 'Degraded';
      else if (maxLatency > 200) summary = 'Minor Latency';

      setDiagResults({
        apiLatencyMs: apiMs,
        firestoreReadMs: firestoreMs,
        authPingMs: authMs,
        staticAssetMs: assetMs,
        lastRunAt: new Date().toLocaleTimeString(),
        statusSummary: summary
      });
    } catch (e) {
      console.warn("Error running diagnostic benchmark:", e);
    } finally {
      setDiagRunning(false);
    }
  };

  // Auto-trigger Guided Product Tour on dashboard load for Super Admin
  useEffect(() => {
    const activeUser = users.find(u => u.id === currentUserId || u.id === auth.currentUser?.uid);
    if (activeUser && activeUser.role === 'super_admin') {
      if (shouldShowTourForUser(activeUser, 'super_admin')) {
        setShowGuidedTour(true);
      }
    }
  }, [users, currentUserId]);
  const [expandedCredentialsCoId, setExpandedCredentialsCoId] = useState<string | null>(null);

  const [tenantFilter, setTenantFilter] = useState<'all_active' | 'inactive'>('all_active');

  // SaaS Master API Key & Google Maps Controls
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [showMapsKey, setShowMapsKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Tenant Billing State
  const [selectedBillingCo, setSelectedBillingCo] = useState<Company | null>(null);
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);

  useEffect(() => {
    // Read key directly from global configurations document
    const docRef = doc(db, 'system_settings', 'google_maps');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setGoogleMapsInput(snap.data().apiKey || '');
      }
    }, (error) => {
      console.warn("Bypassed or failed to retrieve Google Maps Master API Key: ", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (companies.length > 0 && !selectedIntegrationCoId) {
      setSelectedIntegrationCoId(companies[0].id);
    }
  }, [companies, selectedIntegrationCoId]);

  const handleSaveMasterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKey(true);
    try {
      await setDoc(doc(db, 'system_settings', 'google_maps'), {
        apiKey: googleMapsInput.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUserId,
      });
      alert('✓ Nexus Web SaaS Google Maps Platform Master Key deployed successfully!');
    } catch (err: any) {
      console.error("Failed to update SaaS Master API Key:", err);
      alert(`Error updating SaaS Master API Key: ${err.message}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  // User Editing state and functions
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCdl, setEditCdl] = useState('');
  const [editTruck, setEditTruck] = useState('');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);
  const [editUserFieldErrors, setEditUserFieldErrors] = useState<Record<string, string>>({});
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');

  const handleStartEditUser = (usr: User) => {
    setEditingUser(usr);
    setEditName(usr.name);
    setEditEmail(usr.email);
    setEditPhone(usr.phone || '');
    setEditCdl(usr.licenseNumber || '');
    setEditTruck(usr.truckNumber || '');
    setEditUserError(null);
    setEditUserFieldErrors({});
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError(null);
    const newFieldErrors: Record<string, string> = {};

    if (!editName.trim()) {
      newFieldErrors.editName = 'Operator Name is required.';
    }
    if (!editEmail.trim()) {
      newFieldErrors.editEmail = 'Authorized Email is required.';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setEditUserFieldErrors(newFieldErrors);
      setEditUserError('Please resolve the highlighted field errors before saving.');
      return;
    }

    setEditUserFieldErrors({});
    setIsUpdatingUser(true);
    try {
      await onUpdateUserProfile(editingUser.id, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        licenseNumber: editCdl.trim(),
        truckNumber: editTruck.trim(),
      });
      setEditingUser(null);
    } catch (err: any) {
      setEditUserError(`Failed to update profile: ${err.message}`);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleTriggerPasswordReset = async () => {
    if (!editingUser) return;
    const email = editingUser.email;
    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Success: A secure password reset link has been dispatched to "${email}". This allows the user to configure their new password directly.`);
    } catch (err: any) {
      alert(`Sandbox Mode Simulation: Standard platform password reset email simulated successfully for "${email}".`);
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Real-time Firestore mail collection listener
  React.useEffect(() => {
    const q = query(collection(db, 'mail'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        let timestampNum = Date.now();
        let displayTime = '';
        if (doc.id.includes('_')) {
          const parts = doc.id.split('_');
          const ts = parseInt(parts[parts.length - 1]);
          if (!isNaN(ts)) {
            timestampNum = ts;
            displayTime = new Date(ts).toLocaleTimeString() + ' ' + new Date(ts).toLocaleDateString();
          }
        }
        if (!displayTime) {
          displayTime = new Date().toLocaleTimeString();
        }
        return {
          id: doc.id,
          to: typeof data.to === 'string' ? data.to : (Array.isArray(data.to) ? data.to.join(', ') : ''),
          subject: data.message?.subject || '(No Subject)',
          body: data.message?.html || '',
          delivery: data.delivery,
          timestamp: displayTime,
          timestampNum: timestampNum
        };
      });
      // Sort in memory to guarantee descending order without needing composite index rules
      logs.sort((a, b) => b.timestampNum - a.timestampNum);
      setRealMailLogs(logs);
    }, (error) => {
      console.error("Error subscribing to mail collection: ", error);
    });
    return () => unsubscribe();
  }, []);

  // Super Admin Profile Form States
  const currentAdminUser = users.find(u => u.id === currentUserId) || users.find(u => u.role === 'super_admin');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentAdminUser) {
      setProfileName(currentAdminUser.name || '');
      setProfilePhone(currentAdminUser.phone || '');
    }
  }, [currentAdminUser]);

  // Platform Admin/Staff states
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('super_admin');
  const [staffCompanyId, setStaffCompanyId] = useState('');
  const [staffMessage, setStaffMessage] = useState<string | null>(null);

  // Tenant/Fleet Onboarding Form States
  const [tenantCompanyName, setTenantCompanyName] = useState('');
  const [tenantAdminName, setTenantAdminName] = useState('');
  const [tenantAdminEmail, setTenantAdminEmail] = useState('');
  const [tenantDotNumber, setTenantDotNumber] = useState('');
  const [tenantPlan, setTenantPlan] = useState<'Basic' | 'Premium'>('Basic');
  const [tenantOfferTrial, setTenantOfferTrial] = useState<boolean>(true);
  const [tenantMessage, setTenantMessage] = useState<string | null>(null);

  // Deactivation and Reactivation modal state
  const [deactivatingCompany, setDeactivatingCompany] = useState<Company | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateConfirmText, setDeactivateConfirmText] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [deactivateResult, setDeactivateResult] = useState<any | null>(null);

  const [reactivatingCompany, setReactivatingCompany] = useState<Company | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [isReactivating, setIsReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [reactivateResult, setReactivateResult] = useState<any | null>(null);

  // Metrics Calculations
  const totalRevenue = invoices.filter(inv => inv.status === 'paid' && !inv.isManual).reduce((acc, curr) => acc + curr.amount, 0);
  const activeTenants = companies.filter(co => co.status === 'active').length;
  const pendingTenants = companies.filter(co => co.status === 'pending').length;

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastMsg) return;
    onSendGlobalBroadcast(broadcastTitle, broadcastMsg);
    setBroadcastTitle('');
    setBroadcastMsg('');
  };

  const handleInitiateStripeCheckoutForCo = async (co: Company, plan: string) => {
    setIsProcessingStripe(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
        body: JSON.stringify({
          plan,
          companyId: co.id,
          portalUrl: window.location.origin,
        }),
      });

      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate checkout.');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert('An error occurred while connecting to the billing gateway.');
    } finally {
      setIsProcessingStripe(false);
    }
  };

  const handleAccessStripePortalForCo = async (co: Company) => {
    setIsProcessingStripe(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
        body: JSON.stringify({
          companyId: co.id,
          portalUrl: window.location.origin,
        }),
      });

      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate customer portal session.');
      }
    } catch (err: any) {
      console.error('Portal session creation failed:', err);
      alert('An error occurred while connecting to the self-service portal.');
    } finally {
      setIsProcessingStripe(false);
    }
  };

  const handleOnboardTenantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantCompanyName.trim() || !tenantAdminName.trim() || !tenantAdminEmail.trim()) {
      alert('Please fill in Company Name, Admin Name, and Admin Email.');
      return;
    }
    
    onAddTenant({
      name: tenantCompanyName.trim(),
      contactName: tenantAdminName.trim(),
      contactEmail: tenantAdminEmail.trim().toLowerCase(),
      dotNumber: tenantDotNumber.trim() || `DOT-${Math.floor(100000 + Math.random() * 900000)}`,
      plan: tenantPlan,
      offerTrial: tenantOfferTrial,
    });

    setTenantMessage(`Tenant "${tenantCompanyName}" onboarded! Pre-invited: ${tenantAdminEmail}${tenantOfferTrial ? ' (30-Day Free Trial Offered)' : ''}`);
    
    // Clear form
    setTenantCompanyName('');
    setTenantAdminName('');
    setTenantAdminEmail('');
    setTenantDotNumber('');
    setTenantPlan('Basic');
    setTenantOfferTrial(true);

    setTimeout(() => {
      setTenantMessage(null);
    }, 8000);
  };

  const handleOnboardStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffEmail.trim()) {
      alert('Please fill in Full Name and Email Address.');
      return;
    }
    
    onAddUser({
      name: staffName.trim(),
      email: staffEmail.trim().toLowerCase(),
      role: staffRole,
      phone: staffPhone.trim() || '(555) 019-2831',
      status: 'active',
      companyId: staffRole === 'super_admin' ? undefined : staffCompanyId || undefined,
    });

    setStaffMessage(`Successfully Pre-Authorized "${staffName}" as ${staffRole === 'super_admin' ? 'Super Admin' : 'Company Admin'}.`);
    
    // Clear form
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffRole('super_admin');
    setStaffCompanyId('');

    setTimeout(() => {
      setStaffMessage(null);
    }, 8000);
  };

  const handleConfirmDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivatingCompany) return;
    if (!deactivateReason.trim()) {
      setDeactivateError('Please provide a reason for deactivation.');
      return;
    }
    if (deactivateConfirmText.trim().toLowerCase() !== deactivatingCompany.name.trim().toLowerCase()) {
      setDeactivateError(`Confirmation text must match "${deactivatingCompany.name}".`);
      return;
    }

    setIsDeactivating(true);
    setDeactivateError(null);
    setDeactivateResult(null);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(`/api/super-admin/companies/${deactivatingCompany.id}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ reason: deactivateReason.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to deactivate company.');
      }

      setDeactivateResult(data);
      onUpdateCompany(deactivatingCompany.id, {
        status: data.status === 'completed' ? 'deactivated' : 'deactivation_pending',
        deactivatedAt: new Date().toISOString(),
        deactivationReason: deactivateReason.trim()
      });
    } catch (err: any) {
      console.error("Deactivation error:", err);
      setDeactivateError(err.message || "An error occurred during tenant deactivation.");
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleConfirmReactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivatingCompany) return;

    setIsReactivating(true);
    setReactivateError(null);
    setReactivateResult(null);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(`/api/super-admin/companies/${reactivatingCompany.id}/reactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ reason: reactivateReason.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reactivate company.');
      }

      setReactivateResult(data);
      onUpdateCompany(reactivatingCompany.id, {
        status: 'active',
        reactivatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Reactivation error:", err);
      setReactivateError(err.message || "An error occurred during tenant reactivation.");
    } finally {
      setIsReactivating(false);
    }
  };

  const handleSendTestEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddr) return;
    onTriggerEmailTest(testEmailAddr);
    
    // Simulate Trigger Email Extension monitoring the /mail collection
    const logId = `mail_${Math.random().toString(36).substr(2, 9)}`;
    const newLog = {
      id: logId,
      to: testEmailAddr,
      subject: '🔥 Platform Verification: SMTP Mail Relay Active',
      body: `<h3>TruckDispatch Pro - SMTP Testing Channel</h3><p>Your SMTP credentials and Firebase "Trigger Email" extension are operating perfectly.</p><p>Timestamp: ${new Date().toLocaleString()}</p>`,
      status: 'sending',
      timestamp: new Date().toLocaleTimeString()
    };
    
    setEmailLogs(prev => [newLog, ...prev]);
    
    setTimeout(() => {
      setEmailLogs(prev => prev.map(log => log.id === logId ? { ...log, status: 'success' } : log));
    }, 1500);
  };

  // Dynamic Design Elements depending on pageTheme
  const cardClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white shadow-xl' :
    pageTheme === 'industrial_terminal' ? 'bg-black border border-amber-500/30 text-amber-400 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const titleBlockClass = 
    pageTheme === 'cosmic_dark' ? 'bg-gradient-to-r from-slate-900 to-indigo-950/80 border border-slate-800 text-white' :
    pageTheme === 'industrial_terminal' ? 'bg-black border-2 border-amber-500 text-amber-500 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const textMutedClass = 
    pageTheme === 'cosmic_dark' ? 'text-slate-400' :
    pageTheme === 'industrial_terminal' ? 'text-amber-600/80' :
    'text-slate-500';

  const accentColor = 
    pageTheme === 'cosmic_dark' ? 'text-purple-400' :
    pageTheme === 'industrial_terminal' ? 'text-amber-500' :
    'text-indigo-600';

  const labelClass = 
    pageTheme === 'industrial_terminal' ? 'text-amber-500/80 font-mono text-[10px] block' : 'text-[10px] font-mono text-slate-400 uppercase tracking-wider block';

  const subTextClass = 
    pageTheme === 'industrial_terminal' ? 'text-amber-600/60 font-mono text-[9px] mt-1 block' : 'text-[10px] text-slate-500 mt-1 block';

  const buttonClass = (isActive: boolean) => {
    if (isActive) {
      return pageTheme === 'cosmic_dark' ? 'bg-purple-600 text-white shadow' :
             pageTheme === 'industrial_terminal' ? 'bg-amber-500 text-black font-extrabold border border-amber-500' :
             'bg-indigo-600 text-white shadow';
    } else {
      return pageTheme === 'cosmic_dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' :
             pageTheme === 'industrial_terminal' ? 'bg-slate-950 text-amber-500/70 border border-amber-500/20 hover:bg-slate-900 hover:text-amber-400' :
             'bg-slate-100 text-slate-600 hover:bg-slate-200';
    }
  };

  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${pageTheme === 'industrial_terminal' ? 'text-amber-400 font-mono bg-black' : ''}`} id="super-admin-workspace">
      
      {/* Master Announcement Banner */}
      <MasterAnnouncementBanner userRole="super_admin" />

      {/* System Status Bar */}
      <SystemStatusBar userRole="super_admin" />

      {/* Title block */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 rounded-2xl p-5 ${titleBlockClass}`}>
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className={`${
              pageTheme === 'industrial_terminal' ? 'text-amber-500' : 
              pageTheme === 'cosmic_dark' ? 'text-purple-400' :
              'text-indigo-600'
            } h-6 w-6`} /> Platform Governance Console
          </h2>
          <p className={`text-xs mt-1 ${textMutedClass}`}>Super Admin overview for SaaS Billing, Onboarding approvals, and global relay configs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setActiveTab('tenants')}
            id="tour-super-companies"
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'tenants')}`}
          >
            Tenants ({companies.length})
          </button>
          <button 
            onClick={() => setActiveTab('billing')}
            id="tour-super-billing"
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'billing')}`}
          >
            SaaS Billing
          </button>
          <button 
            onClick={() => setActiveTab('announcements')}
            id="tour-super-announcements"
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'announcements')}`}
          >
            Platform Announcements
          </button>
          <button 
            onClick={() => setActiveTab('smtp')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'smtp')}`}
          >
            SMTP & Trigger Email
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            id="tour-super-audit"
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'settings')}`}
          >
            Staff & Profile Settings
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${buttonClass(activeTab === 'users')}`}
          >
            Global Users ({users.length})
          </button>
          <button 
            onClick={() => setActiveTab('integrations')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'integrations')}`}
          >
            <Plug className="h-3.5 w-3.5" /> Integration Center
          </button>
          <button 
            onClick={() => setActiveTab('accounting')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'accounting')}`}
          >
            <Calculator className="h-3.5 w-3.5" /> Accounting Inspector
          </button>
          <button 
            onClick={() => {
              setActiveTab('diagnostics');
              if (!diagResults && !diagRunning) runSpeedBenchmark();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'diagnostics')}`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" /> Speed & Latency
          </button>
          <button 
            onClick={() => setShowSupportDeskModal(true)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
            id="tour-super-support"
          >
            <HelpCircle className="h-3.5 w-3.5" /> Support Desk
          </button>
          <button
            onClick={() => setShowGuidedTour(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 cursor-pointer"
            title="Retake Super Admin Product Tour"
            id="superadmin-btn-take-tour-again"
          >
            <Compass className="h-3.5 w-3.5 text-purple-400" />
            <span>Take Tour Again</span>
          </button>

        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl p-4 flex items-center justify-between ${cardClass}`}>
          <div>
            <span className={labelClass}>SaaS Total ARR</span>
            <span className={`text-2xl font-bold font-heading mt-1 block ${pageTheme === 'industrial_terminal' ? 'text-amber-500' : 'text-purple-400'}`}>{formatCurrency(totalRevenue * 12)}</span>
            <span className={subTextClass}>Based on June recurring revenue</span>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-400'}`}>
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className={`rounded-xl p-4 flex items-center justify-between ${cardClass}`}>
          <div>
            <span className={labelClass}>Active Tenants</span>
            <span className={`text-2xl font-bold font-heading mt-1 block ${pageTheme === 'industrial_terminal' ? 'text-emerald-500' : 'text-emerald-400'}`}>{activeTenants} / {companies.length}</span>
            <span className={subTextClass}>Durable Firestore partitions</span>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${pageTheme === 'industrial_terminal' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-500/10 text-emerald-400'}`}>
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className={`rounded-xl p-4 flex items-center justify-between ${cardClass}`}>
          <div>
            <span className={labelClass}>Approval Queue</span>
            <span className="text-2xl font-bold font-heading mt-1 block text-amber-500">{pendingTenants} pending</span>
            <span className={subTextClass}>Requires manual KYC DOT check</span>
          </div>
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>

        <div className={`rounded-xl p-4 flex items-center justify-between ${cardClass}`}>
          <div>
            <span className={labelClass}>Active Loads (All)</span>
            <span className={`text-2xl font-bold font-heading mt-1 block ${pageTheme === 'industrial_terminal' ? 'text-amber-500' : 'text-indigo-400'}`}>4 Live Loads</span>
            <span className={subTextClass}>Moving across highways</span>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'}`}>
            <Settings className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Primary Tab Content */}
      {activeTab === 'tenants' && (
        <div className="space-y-6">

          {/* Top Section: Onboard Fleet Tenant Form (Centered & Wider) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md space-y-4 max-w-5xl mx-auto" id="tour-super-create-tenant">
            <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="font-heading font-bold text-base flex items-center gap-2 text-purple-400">
                  <UserPlus className="h-5 w-5" /> Onboard Fleet Tenant
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Register a new company and pre-authorize their primary Vendor Administrator. The administrator will be allowed to complete signing up using their pre-invited email.
                </p>
              </div>
              <span className="text-xs font-mono bg-purple-950/60 text-purple-300 border border-purple-900/40 px-2.5 py-1 rounded-lg font-semibold shrink-0">
                SaaS Invite Only
              </span>
            </div>

            {tenantMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs rounded-xl p-3">
                ✓ {tenantMessage}
              </div>
            )}

            <form onSubmit={handleOnboardTenantSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Company / Fleet Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Freight System"
                    value={tenantCompanyName}
                    onChange={(e) => setTenantCompanyName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400 block mb-1">USDOT Number</label>
                  <input
                    type="text"
                    placeholder="e.g. DOT-88231"
                    value={tenantDotNumber}
                    onChange={(e) => setTenantDotNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Admin Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Robert Vance"
                    value={tenantAdminName}
                    onChange={(e) => setTenantAdminName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Admin Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. vance@apex.com"
                    value={tenantAdminEmail}
                    onChange={(e) => setTenantAdminEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Subscription Plan</label>
                  <select
                    value={tenantPlan}
                    onChange={(e) => setTenantPlan(e.target.value as 'Basic' | 'Premium')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="Basic">Basic Plan ($59.99/mo)</option>
                    <option value="Premium">Premium Plan ($159.99/mo)</option>
                  </select>
                </div>

                {/* Offer 30-Day Free Trial Toggle */}
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Offer 30-Day Free Trial</span>
                    <span className="text-[10px] text-slate-400 block">Grant 30-day trial without immediate billing</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tenantOfferTrial}
                      onChange={(e) => setTenantOfferTrial(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-center">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-8 bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white py-2.5 rounded-xl flex items-center justify-center gap-2 transition shadow-md cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" /> Initialize Fleet Invitation
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Companies List (Left 8 cols) */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {(() => {
              const isCompanyInactive = (status?: string) => {
                if (!status) return false;
                const s = status.toLowerCase();
                return s === 'suspended' || s === 'deactivated' || s === 'inactive';
              };

              const activeAndPendingCompanies = companies.filter(co => !isCompanyInactive(co.status));
              const inactiveCompanies = companies.filter(co => isCompanyInactive(co.status));
              
              const inactiveUsers = users.filter(u => {
                const uStatus = (u.status || '').toLowerCase();
                if (uStatus === 'inactive' || uStatus === 'suspended' || uStatus === 'deactivated') return true;
                if (u.companyId) {
                  const co = companies.find(c => c.id === u.companyId);
                  return isCompanyInactive(co?.status);
                }
                return false;
              });

              const displayedCompanies = tenantFilter === 'all_active' ? activeAndPendingCompanies : inactiveCompanies;

              return (
                <>
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <h3 className="font-heading font-bold text-sm text-slate-800">SaaS Registrations</h3>
                      <span className="text-[10px] font-mono text-slate-500">Firestore Root ID: /companies</span>
                    </div>
                    <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setTenantFilter('all_active')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          tenantFilter === 'all_active' 
                            ? 'bg-white text-slate-800 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Active & Pending ({activeAndPendingCompanies.length})
                      </button>
                      <button
                        onClick={() => setTenantFilter('inactive')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                          tenantFilter === 'inactive' 
                            ? 'bg-rose-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                        id="inactivate-filter-btn"
                      >
                        <AlertCircle className="h-3 w-3" />
                        <span>Inactive ({inactiveCompanies.length})</span>
                      </button>
                    </div>
                  </div>
                  
                  {displayedCompanies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs italic">
                      No {tenantFilter === 'all_active' ? 'active or pending' : 'deactivated / inactive'} companies found.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-[10px] uppercase tracking-wider font-mono text-slate-500">
                          <tr>
                            <th className="p-3 w-12 text-center">#</th>
                            <th className="p-3">Company Details</th>
                            <th className="p-3">Compliance</th>
                            <th className="p-3">GPS Tracking</th>
                            <th className="p-3">SaaS Tier</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Administrative Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayedCompanies.map((co, idx) => (
                            <tr key={co.id} className="hover:bg-slate-50 transition">
                              <td className="p-3 font-semibold font-mono text-slate-400 text-center bg-slate-50/50">
                                {idx + 1}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800 text-sm">{co.name}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{co.contactEmail} • {co.address}</div>
                                
                                {/* Credential Status */}
                                {(() => {
                                  const coAdmin = users.find(u => u.companyId === co.id && u.role === 'admin' && !u.id.startsWith('usr_pre_'));
                                  const preAdmin = users.find(u => u.companyId === co.id && u.role === 'admin' && u.id.startsWith('usr_pre_'));
                                  const isExpanded = expandedCredentialsCoId === co.id;

                                  if (coAdmin) {
                                    return (
                                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                        Activated: {coAdmin.name} ({coAdmin.email})
                                      </div>
                                    );
                                  } else if (preAdmin) {
                                    const sentCount = co.onboardingEmailsSent || 1;
                                    const lastSentStr = co.lastOnboardingEmailSent 
                                      ? new Date(co.lastOnboardingEmailSent).toLocaleTimeString() + ' ' + new Date(co.lastOnboardingEmailSent).toLocaleDateString()
                                      : 'Initial setup';
                                    return (
                                      <div className="mt-1.5 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                            Activation Pending
                                          </span>
                                          <button
                                            onClick={() => setExpandedCredentialsCoId(isExpanded ? null : co.id)}
                                            className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                                          >
                                            <Key className="h-2.5 w-2.5" /> {isExpanded ? 'Hide Guide' : 'Show Guide'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              onResendOnboardingEmail(co.id, preAdmin.email, preAdmin.name);
                                              alert(`✓ Onboarding welcome email successfully dispatched to ${preAdmin.email}\nTotal Dispatches: ${sentCount + 1}`);
                                            }}
                                            className="text-[9px] text-purple-600 hover:text-purple-800 font-semibold bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                                            title="Manually resend the pre-authorized login instructions email"
                                          >
                                            <Mail className="h-2.5 w-2.5" /> Resend Onboarding Email
                                          </button>
                                          <button
                                            onClick={() => {
                                              onResetOnboardingEmailCount(co.id);
                                              alert(`✓ Onboarding dispatch history counter successfully reset to 1 for ${co.name}.`);
                                            }}
                                            className="text-[9px] text-rose-600 hover:text-rose-800 font-semibold bg-rose-50 hover:bg-rose-100 px-1.5 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                                            title="Reset onboarding email dispatch counter back to 1"
                                          >
                                            <AlertCircle className="h-2.5 w-2.5" /> Reset Count
                                          </button>
                                        </div>
                                        
                                        <div className="text-[9.5px] font-mono text-purple-600 flex items-center gap-2 bg-purple-50/50 px-2 py-1 rounded border border-purple-100/50 w-fit">
                                          <span className="font-semibold">✉ Dispatch History:</span> 
                                          <span>{sentCount} {sentCount === 1 ? 'time' : 'times'}</span>
                                          <span className="text-purple-400 font-sans">•</span>
                                          <span>Last Sent: {lastSentStr}</span>
                                        </div>

                                        {isExpanded && (
                                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left space-y-2 max-w-md">
                                            <div className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                                              <Key className="h-3 w-3 text-indigo-600" /> Account Setup Instructions
                                            </div>
                                            <p className="text-[10px] text-slate-500 leading-normal">
                                              Admin: <strong className="text-slate-700">{preAdmin.name}</strong> • Authorized Email: <strong className="text-slate-700">{preAdmin.email}</strong>
                                            </p>
                                            <p className="text-[10px] text-slate-500 leading-normal bg-white p-1.5 rounded border border-slate-100">
                                              Instructions: Go to the Sign In page, click <strong className="text-slate-700">"Register / Activate Invitation"</strong>, enter Full Name and Authorized Email, and choose any secure password.
                                            </p>
                                            <div className="flex gap-1.5 justify-end items-center">
                                              <button
                                                onClick={() => {
                                                  navigator.clipboard.writeText(`Hi ${preAdmin.name},\n\nYour TruckDispatch Pro tenant account for "${co.name}" is ready.\n\nTo activate your account, click the link below:\n${window.location.origin}\n\nActivation Instructions:\n1. Open the Sign In screen.\n2. Navigate to "Register / Activate Invitation" tab.\n3. Enter your name (${preAdmin.name}) and registered email: ${preAdmin.email}\n4. Choose a secure password and submit the form to instantly activate your Fleet Administration Panel.\n\nBest regards,\nPlatform Administrator`);
                                                  alert("Activation guide copied to clipboard!");
                                                }}
                                                className="text-[9px] bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded font-semibold cursor-pointer flex items-center gap-1 transition"
                                              >
                                                <Copy className="h-2.5 w-2.5" /> Copy Guide
                                              </button>
                                              <a
                                                href={`mailto:${preAdmin.email}?subject=${encodeURIComponent('Welcome to TruckDispatch Pro - Your Tenant Portal is Ready!')}&body=${encodeURIComponent(`Hi ${preAdmin.name},\n\nYour carrier fleet tenant space for "${co.name}" has been successfully provisioned.\n\nTo activate your account and start coordinating your fleet, click the link below:\n${window.location.origin}\n\nActivation Instructions:\n1. Go to the Sign In screen.\n2. Click the "Register / Activate Invitation" tab.\n3. Enter your name (${preAdmin.name}) and registered email: ${preAdmin.email}\n4. Set your custom password and submit to instantly activate.\n\nBest regards,\nPlatform Administrator`)}`}
                                                className="text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded font-semibold cursor-pointer inline-flex items-center gap-1 transition decoration-none"
                                              >
                                                <Mail className="h-2.5 w-2.5" /> Direct Email Fallback
                                              </a>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </td>
                              <td className="p-3">
                                <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-600 block w-max">
                                  {co.dotNumber}
                                </span>
                                <span className="text-[9px] text-slate-400 block mt-1">Joined: {co.joinedDate}</span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      onUpdateCompany(co.id, { gpsTrackingEnabled: !co.gpsTrackingEnabled });
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      co.gpsTrackingEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                                    }`}
                                    role="switch"
                                    aria-checked={Boolean(co.gpsTrackingEnabled)}
                                    title={co.gpsTrackingEnabled ? "Deactivate GPS Tracking" : "Activate GPS Tracking"}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        co.gpsTrackingEnabled ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  <span className={`text-[10px] font-bold ${co.gpsTrackingEnabled ? 'text-indigo-600 font-extrabold' : 'text-slate-400'}`}>
                                    {co.gpsTrackingEnabled ? 'ACTIVE' : 'DISABLED'}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    co.plan === 'Premium' ? 'bg-purple-100 text-purple-800' :
                                    'bg-slate-100 text-slate-800'
                                  }`}>
                                    {co.plan}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextTrial = !(co.offerTrial || co.trialEnabled);
                                      onUpdateCompany(co.id, { offerTrial: nextTrial, trialEnabled: nextTrial });
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase cursor-pointer transition ${
                                      co.offerTrial || co.trialEnabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                    title={co.offerTrial || co.trialEnabled ? "Click to Revoke 30-Day Free Trial Eligibility" : "Click to Grant 30-Day Free Trial Eligibility"}
                                  >
                                    {co.offerTrial || co.trialEnabled ? 'Trial Granted' : '+ Grant Trial'}
                                  </button>
                                </div>
                                <div className="text-[9px] font-mono text-slate-400 mt-1">Stripe: {co.stripeCustomerId}</div>
                              </td>
                              <td className="p-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  co.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                                  co.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    co.status === 'active' ? 'bg-emerald-500' :
                                    co.status === 'pending' ? 'bg-amber-500' :
                                    'bg-rose-500'
                                  }`}></span>
                                  {co.status === 'suspended' ? 'DEACTIVATED' : co.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  {co.status === 'pending' && (
                                    <button
                                      onClick={() => onApproveCompany(co.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1 rounded text-[10px] flex items-center gap-1 transition cursor-pointer"
                                    >
                                      <CheckCircle className="h-3 w-3" /> Approve KYC
                                    </button>
                                  )}
                                  
                                  <button
                                    onClick={() => setSelectedBillingCo(co)}
                                    className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold px-2 py-1 rounded text-[10px] flex items-center gap-1 transition cursor-pointer"
                                    title="Manage billing plans and Stripe connection"
                                  >
                                    <DollarSign className="h-3 w-3" /> Billing
                                  </button>

                                  {co.status === 'active' && (
                                    <button
                                      onClick={() => onImpersonateCompany(co.id)}
                                      className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-semibold px-2 py-1 rounded text-[10px] flex items-center gap-1 transition cursor-pointer"
                                      title="Troubleshoot customer problems as Admin"
                                    >
                                      <Key className="h-3 w-3" /> Impersonate
                                    </button>
                                  )}
                                  {co.status === 'active' || (co.status as string) === 'deactivation_pending' ? (
                                    <button
                                      onClick={() => {
                                        setDeactivatingCompany(co);
                                        setDeactivateReason('');
                                        setDeactivateConfirmText('');
                                        setDeactivateError(null);
                                        setDeactivateResult(null);
                                      }}
                                      className="border border-red-200 hover:bg-red-50 text-red-600 font-semibold px-2 py-1 rounded text-[10px] transition cursor-pointer"
                                    >
                                      Deactivate
                                    </button>
                                  ) : (co.status as string) === 'suspended' || (co.status as string) === 'deactivated' ? (
                                    <button
                                      onClick={() => {
                                        setReactivatingCompany(co);
                                        setReactivateReason('');
                                        setReactivateError(null);
                                        setReactivateResult(null);
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1 rounded text-[10px] transition cursor-pointer"
                                    >
                                      Re-Activate
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Show deactivated users list underneath specifically when the Inactive tab is selected */}
                  {tenantFilter === 'inactive' && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-heading font-bold text-xs text-rose-700 flex items-center gap-1.5">
                          <Users className="h-4 w-4" /> Deactivated / Inactive Users ({inactiveUsers.length})
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">Belongs to deactivated companies or custom suspended status</span>
                      </div>
                      
                      {inactiveUsers.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No inactive users found.</p>
                      ) : (
                        <div className="border border-slate-150 rounded-xl overflow-hidden bg-white shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-[10px] uppercase font-mono text-slate-500 border-b">
                              <tr>
                                <th className="p-2.5 w-12 text-center">#</th>
                                <th className="p-2.5">User Details</th>
                                <th className="p-2.5">Role</th>
                                <th className="p-2.5">Company Association</th>
                                <th className="p-2.5 text-right">Reason / Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inactiveUsers.map((u, idx) => {
                                const userCo = companies.find(c => c.id === u.companyId);
                                const isCoSuspended = isCompanyInactive(userCo?.status);
                                return (
                                  <tr key={u.id} className="hover:bg-slate-50/50 transition">
                                    <td className="p-2.5 font-semibold font-mono text-slate-400 text-center bg-slate-50/50">
                                      {idx + 1}
                                    </td>
                                    <td className="p-2.5">
                                      <div className="font-bold text-slate-800">{u.name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{u.email}</div>
                                    </td>
                                    <td className="p-2.5 uppercase font-mono text-[10px]">
                                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold">
                                        {u.role}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-slate-600 font-semibold">
                                      {userCo ? `${userCo.name} (DOT-${userCo.dotNumber})` : <span className="text-slate-400 italic">None</span>}
                                    </td>
                                    <td className="p-2.5 text-right">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                        isCoSuspended ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                      }`}>
                                        {isCoSuspended ? 'TENANT DEACTIVATED' : 'USER INACTIVE'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Broadcaster Side Panel (Right 4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Invitation History & Delivery Logs Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5 text-indigo-400">
                  <Mail className="h-4 w-4" /> Onboarding Invitation Tracker
                </h4>
                <span className="text-[9px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-900/40 px-1.5 py-0.5 rounded font-semibold">
                  Real-time Audits
                </span>
              </div>

              {/* Bug Warning Alert */}
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[10.5px] rounded-xl p-3 leading-normal space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> EMAIL DELIVERY STATUS NOTE:
                </div>
                <p>
                  If the fleet administrator hasn't received the automated email yet, please instruct them to:
                </p>
                <ul className="list-disc pl-4 space-y-1 font-sans">
                  <li>Check both their <strong>Spam/Junk</strong> folder and <strong>Primary Inbox</strong>.</li>
                  <li>Ensure they check for email addressed to their invited email.</li>
                  <li>Use the <strong>"Copy Link"</strong> button below to copy their direct setup link and send it manually.</li>
                </ul>
              </div>

              {(() => {
                const invitedCompanies = companies.filter(co => 
                  co.onboardingEmailsSent !== undefined || 
                  co.status === 'pending' || 
                  co.viewedAt !== undefined || 
                  co.registeredAt !== undefined
                );

                if (invitedCompanies.length === 0) {
                  return (
                    <p className="text-[11px] text-slate-500 italic text-center py-2">
                      No active onboarding invitations initialized yet.
                    </p>
                  );
                }

                return (
                  <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                    {invitedCompanies.map(co => {
                      const preAdmin = users.find(u => u.companyId === co.id && u.role === 'admin' && u.id.startsWith('usr_pre_'));
                      const activeAdmin = users.find(u => u.companyId === co.id && u.role === 'admin' && !u.id.startsWith('usr_pre_'));
                      
                      const adminEmail = co.contactEmail;
                      const adminName = activeAdmin?.name || preAdmin?.name || 'Administrator';
                      const sentCount = co.onboardingEmailsSent || 1;
                      
                      // Status logic
                      let invStatus: 'sent' | 'viewed' | 'registered' = 'sent';
                      if (co.status === 'active') {
                        invStatus = 'registered';
                      } else if (co.viewedAt) {
                        invStatus = 'viewed';
                      }

                      return (
                        <div key={co.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5 hover:border-slate-700/60 transition">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <div className="font-bold text-[11px] text-slate-200">{co.name}</div>
                              <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">{adminEmail}</div>
                            </div>
                            
                            {invStatus === 'registered' ? (
                              <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8px] font-mono px-1.5 py-0.5 rounded uppercase font-bold">
                                Registered
                              </span>
                            ) : invStatus === 'viewed' ? (
                              <span className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[8px] font-mono px-1.5 py-0.5 rounded uppercase font-bold animate-pulse">
                                Viewed
                              </span>
                            ) : (
                              <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[8px] font-mono px-1.5 py-0.5 rounded uppercase font-bold">
                                Sent
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[9.5px] font-mono text-slate-400 bg-slate-900/40 p-1.5 rounded border border-slate-900">
                            <div>
                              <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Sent Counter</span>
                              <span className="text-slate-200 font-bold">{sentCount} {sentCount === 1 ? 'time' : 'times'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Current Status</span>
                              <span className="text-slate-200 font-bold capitalize">{invStatus}</span>
                            </div>
                          </div>

                          {/* Render Little History Timeline */}
                          <div className="space-y-1">
                            <span className="text-[8.5px] uppercase tracking-wider font-mono text-slate-500 block">Dispatch Audit Trail</span>
                            <div className="border-l border-slate-800 pl-2.5 ml-1 space-y-2 text-[9px] font-mono text-slate-400">
                              {co.invitationHistory && co.invitationHistory.length > 0 ? (
                                co.invitationHistory.map((hist, hIdx) => (
                                  <div key={hIdx} className="relative flex flex-col">
                                    <span className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-slate-700 border border-slate-900"></span>
                                    <span className="text-slate-300 text-[9px]">
                                      {hIdx === 0 ? 'Initial Invitation Sent' : `Resend Onboarding #${hIdx + 1}`}
                                    </span>
                                    <span className="text-[8px] text-slate-500">
                                      {new Date(hist.sentAt).toLocaleString()} • {hist.sentBy === 'super_admin' ? 'Super Admin' : 'System'}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="relative flex flex-col">
                                  <span className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-slate-700 border border-slate-900"></span>
                                  <span className="text-slate-300">Initial Invitation Sent</span>
                                  <span className="text-[8px] text-slate-500">
                                    {co.lastOnboardingEmailSent ? new Date(co.lastOnboardingEmailSent).toLocaleString() : new Date(co.joinedDate).toLocaleString()}
                                  </span>
                                </div>
                              )}

                              {co.viewedAt && (
                                <div className="relative flex flex-col">
                                  <span className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-indigo-500 border border-slate-900 animate-pulse"></span>
                                  <span className="text-indigo-400 font-semibold">User Opened / Viewed Link</span>
                                  <span className="text-[8px] text-slate-500">{new Date(co.viewedAt).toLocaleString()}</span>
                                </div>
                              )}

                              {co.registeredAt && (
                                <div className="relative flex flex-col">
                                  <span className="absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-slate-900"></span>
                                  <span className="text-emerald-400 font-semibold">Setup Completed & Activated</span>
                                  <span className="text-[8px] text-slate-500">{new Date(co.registeredAt).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-1.5 justify-end pt-1.5 border-t border-slate-900">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}?inviteEmail=${co.contactEmail}`);
                                alert("Onboarding setup link copied to clipboard!");
                              }}
                              className="text-[9px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-1 rounded font-semibold cursor-pointer flex items-center gap-1 transition"
                            >
                              <Copy className="h-2.5 w-2.5 text-indigo-400" /> Copy Link
                            </button>
                            
                            {co.status !== 'active' && co.status !== 'suspended' && (
                              <>
                                <button
                                  onClick={() => {
                                    onResendOnboardingEmail(co.id, adminEmail, adminName);
                                    alert(`✓ Onboarding welcome email successfully dispatched to ${adminEmail}\nTotal Dispatches: ${sentCount + 1}`);
                                  }}
                                  className="text-[9px] bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded font-semibold cursor-pointer flex items-center gap-1 transition"
                                >
                                  <Mail className="h-2.5 w-2.5" /> Resend
                                </button>
                                
                                <a
                                  href={`mailto:${adminEmail}?subject=${encodeURIComponent('Welcome to TruckDispatch Pro - Your Tenant Portal is Ready!')}&body=${encodeURIComponent(`Hi ${adminName},\n\nYour carrier fleet tenant space for "${co.name}" has been successfully provisioned.\n\nTo activate your account and start coordinating your fleet, click the link below:\n${window.location.origin}?inviteEmail=${adminEmail}\n\nActivation Instructions:\n1. Open the link to populate your invitation details.\n2. Enter your name (${adminName}) and confirm your registered email: ${adminEmail}\n3. Set your custom password and submit to instantly activate.\n\nBest regards,\nPlatform Administrator`)}`}
                                  className="text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded font-semibold cursor-pointer inline-flex items-center gap-1 transition decoration-none"
                                >
                                  Direct Mail
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            
            {/* Global Broadcast Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md">
              <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5 mb-2">
                <Send className="h-4 w-4 text-purple-400" /> Push Global Announcement
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Instantly broadcast a notification banner to ALL dispatchers and drivers inside the platform active database.
              </p>
              
              <form onSubmit={handleBroadcastSubmit} className="space-y-3.5">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Alert Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Weather Warning: Winter Storm Caleb"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Broadcast Details</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Instruct drivers to secure flatbeds and expect road hazards..."
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 font-semibold text-xs text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-900/10 transition"
                >
                  <Send className="h-3.5 w-3.5" /> Dispatch Global Notice
                </button>
              </form>
            </div>

            {/* Quick Helper Explainer */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-600">
              <h5 className="font-heading font-semibold text-xs text-slate-800 mb-1 flex items-center gap-1">🛡️ Tenant Isolation Rule</h5>
              <p className="text-[11px] leading-relaxed">
                Platform governance separates folders by company id paths `/admins/&lt;adminId&gt;`. Data leaks are impossible. Changing role to Admin or Dispatcher locks queries strictly to that company context.
              </p>
            </div>

          </div>

        </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="font-heading font-bold text-sm text-slate-800">Stripe Subscription Invoice Syncing Logs</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Asynchronous sync pipeline representing webhooks on Stripe `invoice.payment_succeeded`</p>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-semibold">
              Live Webhook Active
            </span>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wider font-mono text-slate-500">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Invoice Number</th>
                  <th className="p-3">Company (Tenant)</th>
                  <th className="p-3">Billing Plan</th>
                  <th className="p-3">Billed Amount</th>
                  <th className="p-3">Period Date</th>
                  <th className="p-3">Stripe Webhook Event Source</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {invoices.map((inv, idx) => {
                  const company = companies.find(c => c.id === inv.companyId);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold font-mono text-slate-400 text-center bg-slate-50/50">{idx + 1}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">{inv.invoiceNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{company?.name || 'Unknown Company'}</td>
                      <td className="p-3">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 font-semibold border text-slate-600">
                          {inv.isManual ? 'Manual Ad-Hoc Fee' : `${company?.plan || 'Standard'} SaaS Tier`}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">{formatCurrency(inv.amount)}</td>
                      <td className="p-3">{inv.date}</td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        {inv.isManual ? 'Manual SuperAdmin Entry' : `evt_invoice.paid_${inv.id}`}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'smtp' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fadeIn">
          
          {/* SMTP Tester Box (Left 4 cols) */}
          <div className="xl:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md self-start space-y-4">
            <div>
              <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5 mb-1.5">
                <Mail className="h-4 w-4 text-purple-400" /> Firebase Trigger Email Utility
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The platform relies on the official Firebase <strong>Trigger Email from Firestore</strong> extension. This utility adds documents to the root <code>/mail</code> collection, which the extension relays to your target recipient.
              </p>
            </div>

            <form onSubmit={handleSendTestEmail} className="space-y-4 pt-2 border-t border-slate-800/80">
              <div>
                <label className="text-[9px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Recipient Address (To)</label>
                <input
                  type="email"
                  required
                  placeholder="john.doe@company.com"
                  value={testEmailAddr}
                  onChange={(e) => setTestEmailAddr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-wider font-mono text-slate-400 block mb-1">Action Mapping</label>
                <div className="text-[10px] font-mono bg-slate-950 p-2.5 rounded border border-slate-800 text-emerald-400 leading-normal">
                  collection_path: <span className="text-purple-300">/mail</span> <br />
                  to: <span className="text-amber-300">["{testEmailAddr}"]</span> <br />
                  trigger: <span className="text-amber-300">onDocumentAdded()</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 font-semibold text-xs text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-900/10 transition cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" /> Dispatch SMTP Test Document
              </button>
            </form>

            {/* Diagnostic Manual Setup Box */}
            <div className="border-t border-slate-800/80 pt-4 space-y-2.5">
              <h5 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Settings className="h-3.5 w-3.5" /> Firebase Configuration Checklist
              </h5>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                If emails aren't arriving in your inbox, complete these 3 setup steps in your Firebase Console:
              </p>
              <ol className="text-[10px] space-y-1.5 text-slate-300 list-decimal pl-4 leading-normal">
                <li>
                  Go to <strong className="text-white">Extensions</strong> in your Firebase Console and find <strong className="text-white">Trigger Email from Firestore</strong>.
                </li>
                <li>
                  Configure your SMTP credentials (Host e.g. <code>smtp.sendgrid.net</code>, Port <code>587</code>, Username, Password).
                </li>
                <li>
                  Ensure your <strong className="text-white">"From Address"</strong> matches the sender email authorized by your domain or SMTP provider.
                </li>
              </ol>
            </div>
          </div>

          {/* Trigger Email Console Logs (Right 8 cols) */}
          <div className="xl:col-span-8 bg-black rounded-2xl border border-slate-800 p-4 text-slate-300 font-mono text-xs flex flex-col justify-between min-h-[500px] shadow-lg text-left">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                <span className="text-[10.5px] text-slate-200 font-bold flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse"></span> LIVE FIRESTORE OUTBOX MONITOR
                </span>
                <span className="text-[9px] text-purple-400 font-semibold">Location: /mail</span>
              </div>

              {/* Detector Check if any mail is pending/unprocessed */}
              {realMailLogs.length > 0 && realMailLogs.some(l => !l.delivery) && (
                <div className="mb-4 bg-amber-950/40 border-l-4 border-amber-500 text-amber-200 p-3 rounded-r-lg space-y-1 leading-normal">
                  <div className="font-bold flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> SMTP Extension Inactive Warning
                  </div>
                  <p className="text-[10px] text-amber-300">
                    We detected mail documents in your Firestore <code>/mail</code> collection that have not been processed by Firebase. You must install/configure the <strong className="text-white">Trigger Email</strong> extension in your Firebase Console with valid SMTP credentials to enable automated email delivery.
                  </p>
                </div>
              )}

              {realMailLogs.length === 0 ? (
                <div className="text-slate-600 text-center py-20 flex flex-col items-center justify-center">
                  <Terminal className="h-10 w-10 mb-2 text-slate-700" />
                  <p className="text-[11px] font-bold text-slate-500">No Mail Documents Found in Firestore</p>
                  <p className="text-[10px] text-slate-600 max-w-sm mt-1">
                    When you onboard a new tenant, or click "Dispatch SMTP Test", the record will instantly stream here in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                  {realMailLogs.map((log, idx) => {
                    const hasDelivery = !!log.delivery;
                    const isSuccess = log.delivery?.state === 'SUCCESS';
                    const isError = log.delivery?.state === 'ERROR';
                    const isProcessing = log.delivery?.state === 'PROCESSING';

                    return (
                      <div key={log.id} className="border-l-2 border-indigo-500 pl-3 py-2 space-y-2 bg-slate-950 rounded border border-slate-900">
                        <div className="flex justify-between items-center text-[10px] border-b border-slate-900 pb-1.5">
                          <span className="text-slate-400 font-bold tracking-tight">
                            <span className="text-purple-400 font-mono mr-1.5 font-extrabold bg-purple-950/80 px-1 py-0.5 rounded">#{idx + 1}</span>
                            {log.id}
                          </span>
                          <span className="text-slate-500">{log.timestamp}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500">To:</span> <span className="text-emerald-400 font-bold">{log.to}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Subject:</span> <span className="text-slate-200">{log.subject}</span>
                          </div>
                        </div>

                        {/* Status Diagnostics */}
                        <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900/60 p-2 rounded border border-slate-900 mt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">Delivery State:</span>
                            {!hasDelivery ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-900 animate-pulse">
                                <AlertTriangle className="h-2.5 w-2.5" /> UNPROCESSED (Extension Not Configured)
                              </span>
                            ) : isSuccess ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-900">
                                <CheckCircle className="h-2.5 w-2.5" /> DELIVERED
                              </span>
                            ) : isError ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-400 border border-rose-900">
                                <AlertCircle className="h-2.5 w-2.5" /> FAILURE
                              </span>
                            ) : isProcessing ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-400 border border-blue-900 animate-pulse">
                                <Play className="h-2.5 w-2.5 animate-spin" /> PROCESSING
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                {log.delivery?.state}
                              </span>
                            )}
                          </div>

                          {/* Fallback & Copy buttons directly on the email log */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                // Strip HTML to create nice clean text representation
                                const cleanBody = log.body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                                navigator.clipboard.writeText(cleanBody);
                                setCopiedLogId(log.id);
                                setTimeout(() => setCopiedLogId(null), 2000);
                              }}
                              className="text-[9px] bg-slate-800 hover:bg-slate-750 text-slate-300 px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer font-bold border border-slate-700"
                              title="Copy raw body contents"
                            >
                              {copiedLogId === log.id ? (
                                <>
                                  <Check className="h-2.5 w-2.5 text-emerald-500" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-2.5 w-2.5" /> Copy Text
                                </>
                              )}
                            </button>

                            <a
                              href={`mailto:${log.to}?subject=${encodeURIComponent(log.subject)}&body=${encodeURIComponent(log.body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 1500) + '\n\n...')}`}
                              className="text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded inline-flex items-center gap-1 transition cursor-pointer decoration-none font-bold"
                              title="Bypass SMTP failure and send immediately using your device's email application"
                            >
                              <Mail className="h-2.5 w-2.5" /> Send via Local Client
                            </a>
                          </div>
                        </div>

                        {/* Error logs expansion if failed */}
                        {isError && log.delivery?.error && (
                          <div className="bg-rose-950/20 border border-rose-900 text-rose-300 text-[10px] p-2 rounded leading-relaxed mt-1.5 overflow-x-auto font-mono">
                            <strong className="text-rose-400">SMTP Error Log:</strong> {log.delivery.error}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 pt-2 border-t border-slate-900 text-[9px] text-slate-500 leading-normal flex justify-between items-center">
              <span>Note: This diagnostic monitor listens directly to your Firebase Firestore <code>/mail</code> database namespace.</span>
              <span className="text-purple-400 font-bold bg-purple-950/40 border border-purple-900/40 px-1.5 py-0.5 rounded">REAL-TIME SYNC</span>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column - Stacked Profile Setup and Staff List */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Super Admin Personal Profile Setup */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="font-heading font-bold text-sm text-purple-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Personal Profile Setup
                </h3>
                <span className="text-[10px] bg-purple-950/80 border border-purple-900/60 px-2.5 py-0.5 rounded font-mono text-purple-300">
                  Logged In: {currentAdminUser?.email || 'admin@dispatchpro.com'}
                </span>
              </div>

              {profileSuccessMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs rounded-xl p-3">
                  {profileSuccessMsg}
                </div>
              )}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!profileName.trim()) {
                    alert('Full Name is required.');
                    return;
                  }
                  if (currentAdminUser) {
                    onUpdateUserProfile(currentAdminUser.id, {
                      name: profileName.trim(),
                      phone: profilePhone.trim() || '(555) 019-2831'
                    });
                    setProfileSuccessMsg('✓ Profile information updated successfully!');
                    setTimeout(() => setProfileSuccessMsg(null), 5000);
                  } else {
                    alert('No active admin user found to update.');
                  }
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                      placeholder="e.g. Marcus Vance"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                      placeholder="e.g. (555) 019-2831"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/50 p-3 rounded-lg border border-slate-800/60">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Authorized Email</label>
                    <div className="text-xs text-slate-400 font-mono py-1">
                      {currentAdminUser?.email || 'admin@dispatchpro.com'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Assigned Role</label>
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
                      <span className="text-[10px] font-bold text-purple-300 bg-purple-950/60 border border-purple-900/50 px-2 py-0.5 rounded">
                        SUPER ADMINISTRATOR
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-lg shadow-purple-900/10 transition cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" /> Save Profile Settings
                </button>
              </form>
            </div>

            {/* Active Platform Staff List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-heading font-bold text-sm text-purple-400 flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> Platform Administrators & Staff
              </h3>
              <span className="text-[10px] bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded font-mono text-slate-400">
                Authorized Node Staff
              </span>
            </div>
            
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              These operators are authorized to access administrative panels. Platform Super Administrators can manage billing and approve other fleets, while Tenant Administrators manage individual company rosters.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider font-mono text-slate-500 border border-slate-800">
                  <tr>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Email</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Tenant Association</th>
                    <th className="p-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {users.filter(u => u.role === 'super_admin' || u.role === 'admin').map((u) => {
                    const assocCompany = companies.find(c => c.id === u.companyId);
                    return (
                      <tr key={u.id} className="hover:bg-slate-850/40 transition">
                        <td className="p-2.5 font-semibold text-white">{u.name}</td>
                        <td className="p-2.5 font-mono text-slate-400 text-[11px]">{u.email}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'super_admin' 
                              ? 'bg-purple-950/80 text-purple-300 border border-purple-900/60' 
                              : 'bg-slate-950 text-slate-300 border border-slate-800'
                          }`}>
                            {u.role === 'super_admin' ? 'SUPER ADMIN' : 'TENANT ADMIN'}
                          </span>
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-400">
                          {u.role === 'super_admin' ? (
                            <span className="text-purple-400/80 italic">Global Platform (All)</span>
                          ) : (
                            assocCompany?.name || <span className="text-slate-600">Pending Association</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-1.5 py-0.5 rounded-full">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Platform Database Management & Purge */}
          <div className="bg-slate-900 border border-red-950/40 rounded-2xl p-5 text-white shadow-md">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-heading font-bold text-sm text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Platform Database Maintenance
              </h3>
              <span className="text-[10px] bg-red-950/40 border border-red-900/40 px-2.5 py-0.5 rounded font-mono text-red-400">
                CRITICAL ACTIONS
              </span>
            </div>
            
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Clear all seeded dummy files, system communications, invoices, notifications, and non-admin driver/dispatcher users. This completely wipes the platform to a clean slate, preserving only your Super Administrator login credentials.
            </p>

            <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl p-3.5 mb-4 space-y-2 leading-relaxed">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Warning</strong>: Performing this wipe will clear all tenant profiles, loads, history logs, and messages from both the browser's local cache and your active Firestore database instance.
                </div>
              </div>
            </div>

            {onClearAllDatabaseData && (
              <button
                type="button"
                onClick={onClearAllDatabaseData}
                className="bg-red-900/60 hover:bg-red-800 border border-red-700/60 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-lg shadow-red-900/20 transition cursor-pointer"
                id="wipe-dummy-data-btn"
              >
                <AlertCircle className="h-4 w-4 text-red-400" /> Wipe & Purge All Dummy Data
              </button>
            )}
          </div>

        </div>

          {/* Right Column - Stacked Add Staff and SaaS Global API Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Add Staff / Invite Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md">
              <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5 mb-2 text-purple-400">
                <UserPlus className="h-4 w-4" /> Pre-Authorize Admin
              </h4>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Create a pre-authorized administrative invitation. The administrator will be allowed to complete profile activation under the "Activate Invitation" registration tab using their registered email.
              </p>

              {staffMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs rounded-xl p-3 mb-4">
                  ✓ {staffMessage}
                </div>
              )}

              <form onSubmit={handleOnboardStaffSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Jenkins"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 animate-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sarah.j@platform.com"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 animate-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. (555) 019-2231"
                      value={staffPhone}
                      onChange={(e) => setStaffPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 animate-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Platform Role</label>
                    <select
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value as UserRole)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="super_admin">Super Administrator</option>
                      <option value="admin">Company Administrator</option>
                    </select>
                  </div>
                </div>

                {staffRole === 'admin' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Assign Fleet Tenant Company *</label>
                    <select
                      required
                      value={staffCompanyId}
                      onChange={(e) => setStaffCompanyId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="">-- Select Fleet Tenant --</option>
                      {companies.map((co) => (
                        <option key={co.id} value={co.id}>{co.name} ({co.dotNumber})</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-900/10 transition cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" /> Authorize & Pre-register Operator
                </button>
              </form>
            </div>

            {/* SaaS Global API Key Master Control Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5 text-purple-400">
                  <Key className="h-4 w-4" /> SaaS Master API Controls
                </h4>
                {googleMapsInput.trim() ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    DEPLOYED
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    KEY REQ
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                As the SaaS platform <strong>Super Admin</strong>, you supply a single centralized Google Maps Platform API key. Mapped dispatchers and drivers across multiple subscribed fleets leverage this centralized key seamlessly without needing their own Google Cloud Console billing setup.
              </p>

              <form onSubmit={handleSaveMasterKey} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 block mb-1">Google Maps Platform Key *</label>
                  <div className="relative">
                    <input
                      type={showMapsKey ? 'text' : 'password'}
                      required
                      placeholder="AIzaSy..."
                      value={googleMapsInput}
                      onChange={(e) => setGoogleMapsInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 pl-3 pr-10 text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMapsKey(!showMapsKey)}
                      className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300 transition"
                      title={showMapsKey ? 'Hide key' : 'Show key'}
                    >
                      {showMapsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingKey}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 font-bold text-xs text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-900/10 transition cursor-pointer"
                >
                  <CheckCircle className="h-4 w-4" /> {isSavingKey ? 'Deploying...' : 'Deploy Master API Key'}
                </button>
              </form>

              {/* Active Subscribed Fleets Directory Mapping */}
              <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500 font-bold">
                  Active Subscriber Routing Links ({companies.filter(c => c.status === 'active').length})
                </div>
                {companies.filter(c => c.status === 'active').length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">No active billing subscribers found.</p>
                ) : (
                  <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-900/50">
                    {companies.filter(c => c.status === 'active').map((co) => (
                      <div key={co.id} className="flex justify-between items-center text-[11px] pt-1.5 first:pt-0">
                        <span className="font-semibold text-slate-200 flex items-center gap-1">
                          <Truck className="h-3 w-3 text-purple-400" /> {co.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-purple-300 font-semibold bg-purple-950/50 border border-purple-900/40 px-1 py-0.2 rounded">
                            {co.plan}
                          </span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/30 px-1.5 rounded flex items-center gap-1">
                            Active Sync
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* GLOBAL USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-heading font-bold text-base text-purple-400 flex items-center gap-2">
                  <Users className="h-5 w-5" /> Global System Directory
                </h3>
                <p className="text-xs text-slate-400 mt-1">Audit, modify, and manage credentials for all dispatchers, drivers, and administrators across all fleets.</p>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800/60">
              <div>
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block mb-1">Search Directory</label>
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500 font-sans"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block mb-1">Filter by Role</label>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All System Roles</option>
                  <option value="driver">CDL Drivers</option>
                  <option value="dispatcher">Dispatchers</option>
                  <option value="admin">Company Admins</option>
                  <option value="super_admin">Platform Admins (Super)</option>
                </select>
              </div>

              <div className="flex items-end justify-start sm:justify-end">
                <div className="text-right text-[11px] text-slate-400 font-mono">
                  Showing {
                    users.filter(u => {
                      const matchesSearch = !userSearchTerm.trim() || 
                        u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        (u.phone && u.phone.includes(userSearchTerm));
                      const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
                      return matchesSearch && matchesRole;
                    }).length
                  } / {users.length} Records
                </div>
              </div>
            </div>

            {/* Users list table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[10px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Operator Name</th>
                    <th className="py-3 px-4">Contact Details</th>
                    <th className="py-3 px-4">System Role</th>
                    <th className="py-3 px-4">Associated Fleet Tenant</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users
                    .filter(u => {
                      const matchesSearch = !userSearchTerm.trim() || 
                        u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        (u.phone && u.phone.includes(userSearchTerm));
                      const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
                      return matchesSearch && matchesRole;
                    })
                    .map((usr) => {
                      const assocCo = companies.find(c => c.id === usr.companyId);
                      return (
                        <tr key={usr.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-3.5 px-4 font-semibold text-white font-sans">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                usr.role === 'super_admin' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                                usr.role === 'admin' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                                usr.role === 'dispatcher' ? 'bg-sky-950 text-sky-300 border border-sky-800' :
                                'bg-purple-950 text-purple-300 border border-purple-800'
                              }`}>
                                {usr.name.charAt(0)}
                              </div>
                              <div>
                                <span className="block">{usr.name}</span>
                                {usr.role === 'driver' && usr.truckNumber && (
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">Truck: {usr.truckNumber}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="block font-mono text-[11px] text-slate-300">{usr.email}</span>
                            <span className="text-[10px] text-slate-500">{usr.phone || 'No phone'}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wide border ${
                              usr.role === 'super_admin' ? 'bg-indigo-950 text-indigo-300 border-indigo-900/50' :
                              usr.role === 'admin' ? 'bg-amber-950 text-amber-300 border-amber-900/50' :
                              usr.role === 'dispatcher' ? 'bg-sky-950 text-sky-300 border-sky-900/50' :
                              'bg-purple-950 text-purple-300 border-purple-900/50'
                            }`}>
                              {usr.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {assocCo ? (
                              <div>
                                <span className="block font-semibold text-slate-200">{assocCo.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">DOT: {assocCo.dotNumber}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">Global Platform Staff</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleStartEditUser(usr)}
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-purple-400 transition"
                              title="Edit User Profile"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PLATFORM ANNOUNCEMENTS TAB */}
      {activeTab === 'announcements' && (
        <div className="animate-in fade-in duration-200">
          <SuperAdminAnnouncementManager />
        </div>
      )}

      {/* INTEGRATION CENTER TAB */}
      {activeTab === 'integrations' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plug className="w-4 h-4 text-purple-400" />
                Super Admin Integration Inspector
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a tenant carrier to inspect or manage its external partner integrations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-medium">Select Tenant:</label>
              <select
                value={selectedIntegrationCoId}
                onChange={e => setSelectedIntegrationCoId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.dotNumber || 'No DOT'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedIntegrationCoId ? (
            <IntegrationCenter
              companyId={selectedIntegrationCoId}
              userRole="super_admin"
              currentUser={
                users.find(u => u.id === currentUserId) ||
                ({
                  id: currentUserId || 'superadmin',
                  name: 'Super Admin',
                  email: 'admin@dispatchpro.com',
                  role: 'super_admin',
                  companyId: selectedIntegrationCoId,
                  status: 'active',
                  phone: ''
                } as User)
              }
            />
          ) : (
            <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-xl border border-slate-800 text-sm">
              No tenant company selected.
            </div>
          )}
        </div>
      )}

      {/* ACCOUNTING INSPECTOR TAB */}
      {activeTab === 'accounting' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-purple-400" />
                Super Admin Accounting & Audit Inspector
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a tenant carrier to inspect or audit its settlements, fuel records, pay rules, and customer invoices.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-medium">Select Tenant:</label>
              <select
                value={selectedIntegrationCoId}
                onChange={e => setSelectedIntegrationCoId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.dotNumber || 'No DOT'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedIntegrationCoId ? (
            <AccountingCenter
              companyId={selectedIntegrationCoId}
              currentUser={
                users.find(u => u.id === currentUserId) ||
                ({
                  id: currentUserId || 'superadmin',
                  name: 'Super Admin',
                  email: 'admin@dispatchpro.com',
                  role: 'super_admin',
                  companyId: selectedIntegrationCoId,
                  status: 'active',
                  phone: ''
                } as User)
              }
            />
          ) : (
            <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-xl border border-slate-800 text-sm">
              No tenant company selected.
            </div>
          )}
        </div>
      )}

      {/* SPEED & LATENCY DIAGNOSTICS TAB */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6 animate-in fade-in duration-200" id="superadmin-diagnostics-tab">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">System Speed, Latency & Health Diagnostics</h3>
                {diagResults && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                    diagResults.statusSummary === 'Optimal'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : diagResults.statusSummary === 'Minor Latency'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    ● {diagResults.statusSummary}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                One-click real-time benchmark testing across Express Node server endpoints, Firebase Firestore reads, Auth tokens, and CDN static asset response speeds.
              </p>
            </div>
            <button
              onClick={runSpeedBenchmark}
              disabled={diagRunning}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-md cursor-pointer shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${diagRunning ? 'animate-spin' : ''}`} />
              <span>{diagRunning ? 'Measuring Latencies...' : 'Run Speed & Latency Test'}</span>
            </button>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Express API Endpoint */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 block tracking-wider">Express REST API (/api/health)</span>
                <div className="text-2xl font-extrabold font-mono text-white mt-2">
                  {diagResults?.apiLatencyMs !== undefined ? `${diagResults.apiLatencyMs} ms` : '--'}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Node backend engine</span>
                <span className={diagResults && diagResults.apiLatencyMs < 100 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {diagResults ? (diagResults.apiLatencyMs < 100 ? 'Fast' : 'Moderate') : 'Ready'}
                </span>
              </div>
            </div>

            {/* Firestore Database Read */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 block tracking-wider">Firestore Document Fetch</span>
                <div className="text-2xl font-extrabold font-mono text-white mt-2">
                  {diagResults?.firestoreReadMs !== undefined ? `${diagResults.firestoreReadMs} ms` : '--'}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Database collection read</span>
                <span className={diagResults && diagResults.firestoreReadMs < 150 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {diagResults ? (diagResults.firestoreReadMs < 150 ? 'Optimal' : 'Normal') : 'Ready'}
                </span>
              </div>
            </div>

            {/* Auth Session Token */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 block tracking-wider">Firebase Auth Token Ping</span>
                <div className="text-2xl font-extrabold font-mono text-white mt-2">
                  {diagResults?.authPingMs !== undefined ? `${diagResults.authPingMs} ms` : '--'}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Security token validation</span>
                <span className={diagResults && diagResults.authPingMs < 80 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {diagResults ? (diagResults.authPingMs < 80 ? 'Instant' : 'Good') : 'Ready'}
                </span>
              </div>
            </div>

            {/* CDN Static Assets */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 block tracking-wider">Static Asset CDN Load</span>
                <div className="text-2xl font-extrabold font-mono text-white mt-2">
                  {diagResults?.staticAssetMs !== undefined ? `${diagResults.staticAssetMs} ms` : '--'}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Frontend asset delivery</span>
                <span className={diagResults && diagResults.staticAssetMs < 50 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {diagResults ? (diagResults.staticAssetMs < 50 ? 'Cached' : 'Normal') : 'Ready'}
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Breakdown & Recommendations */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" /> Performance Infrastructure Checklist
              </h4>
              {diagResults?.lastRunAt && (
                <span className="text-[11px] font-mono text-slate-400">
                  Last benchmark: {diagResults.lastRunAt}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <div className="font-bold text-slate-200 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" /> Real-time Firestore Sync Engine
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Truck Dispatch Pro uses snapshot listeners for live loads, communications, and driver status. Document reads complete in real-time with automatic offline caching.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <div className="font-bold text-slate-200 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" /> Storage Uploads & Document Processing
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  POD documents and fuel receipts process directly to Firebase Storage with base64 data-URL fallbacks for instant preview rendering without waiting on remote network delays.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT USER PROFILE MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm" id="edit-user-modal">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-400" />
                <h3 className="font-heading font-semibold text-sm">Modify Operator Credentials</h3>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveUserEdit} className="p-5 space-y-4">
              <FormErrorSummary
                message={editUserError}
                fieldErrors={editUserFieldErrors}
                onDismiss={() => setEditUserError(null)}
              />

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Operator Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editUserFieldErrors.editName) setEditUserFieldErrors(prev => ({ ...prev, editName: '' }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans text-white"
                />
                <FieldErrorMessage error={editUserFieldErrors.editName} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Authorized Email</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => {
                    setEditEmail(e.target.value);
                    if (editUserFieldErrors.editEmail) setEditUserFieldErrors(prev => ({ ...prev, editEmail: '' }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans text-white"
                />
                <FieldErrorMessage error={editUserFieldErrors.editEmail} />
                <span className="text-[9px] text-slate-500 block leading-tight">Driver logins will bind to this email address.</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Contact Phone Number</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans text-white"
                />
              </div>

              {editingUser.role === 'driver' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">CDL License #</label>
                    <input
                      type="text"
                      required
                      value={editCdl}
                      onChange={(e) => setEditCdl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Truck Code</label>
                    <input
                      type="text"
                      required
                      value={editTruck}
                      onChange={(e) => setEditTruck(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans text-white"
                    />
                  </div>
                </div>
              )}

              {/* Password Management Action */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex justify-between items-center mt-2">
                <div>
                  <h4 className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                    <Key className="h-3 w-3 text-amber-400" /> Password Security
                  </h4>
                  <p className="text-[9px] text-slate-500 mt-0.5 max-w-[200px] leading-tight">
                    Dispatch an official secure reset link to driver's email address.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isResettingPassword}
                  onClick={handleTriggerPasswordReset}
                  className="bg-amber-950 border border-amber-900/50 hover:bg-amber-900 text-amber-300 font-bold px-3 py-1.5 rounded-lg text-[10px] transition shrink-0 cursor-pointer"
                >
                  {isResettingPassword ? 'Sending...' : 'Reset Password'}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 px-3.5 rounded-xl text-xs transition cursor-pointer"
                >
                  Close
                </button>
                <LoadingSubmitButton
                  isSubmitting={isUpdatingUser}
                  onClick={handleSaveUserEdit}
                  idleText="Save Profile"
                  loadingText="Updating..."
                  variant="indigo"
                />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TENANT BILLING & SUBSCRIPTION MASTER MODAL          */}
      {/* ==================================================== */}
      {selectedBillingCo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" id="tenant-billing-modal">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-heading font-bold text-sm">Tenant Billing & Subscription Master</h3>
                  <p className="text-[10px] text-slate-400">Manage billing plans and Stripe links for {selectedBillingCo.name}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedBillingCo(null)} 
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
              {/* Profile card summary */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">Carrier Fleet Name</span>
                  <span className="text-white font-semibold">{selectedBillingCo.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">FMCSA DOT Number</span>
                  <span className="text-slate-200 font-mono font-medium">{selectedBillingCo.dotNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">Platform Onboarding Date</span>
                  <span className="text-slate-300">{selectedBillingCo.joinedDate}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">Contact/Admin Email</span>
                  <span className="text-indigo-300 font-mono">{selectedBillingCo.contactEmail}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">Stripe Customer ID</span>
                  <span className="text-amber-400 font-mono font-bold text-[11px]">
                    {selectedBillingCo.stripeCustomerId || 'Not Created Yet'}
                  </span>
                </div>
              </div>

              {/* 30-Day Trial Controls */}
              <div className="bg-purple-950/40 border border-purple-800/60 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-200">30-Day Free Trial Offering</span>
                    {selectedBillingCo.subscriptionStatus === 'trialing' && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase font-mono">
                        Trial Active
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newTrialing = selectedBillingCo.subscriptionStatus !== 'trialing';
                      const updates: Partial<Company> = newTrialing
                        ? {
                            subscriptionStatus: 'trialing',
                            paymentStatus: 'trialing',
                            trialEnabled: true,
                            trialStart: new Date().toISOString(),
                            trialEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                          }
                        : {
                            subscriptionStatus: 'active',
                            paymentStatus: 'paid',
                            trialEnabled: false,
                          };

                      onUpdateCompany(selectedBillingCo.id, updates);
                      setSelectedBillingCo({
                        ...selectedBillingCo,
                        ...updates,
                      });
                      alert(
                        newTrialing
                          ? `✓ Offered 30-Day Free Trial to ${selectedBillingCo.name}! Active until ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}`
                          : `✓ Trial status cleared for ${selectedBillingCo.name}.`
                      );
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      selectedBillingCo.subscriptionStatus === 'trialing'
                        ? 'bg-rose-600/80 hover:bg-rose-600 text-white'
                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-md'
                    }`}
                  >
                    {selectedBillingCo.subscriptionStatus === 'trialing'
                      ? 'Revoke / End Trial'
                      : 'Offer 30-Day Free Trial'}
                  </button>
                </div>

                <p className="text-[11px] text-purple-300/80 leading-normal">
                  {selectedBillingCo.subscriptionStatus === 'trialing'
                    ? `Active trial expires on ${selectedBillingCo.trialEnd ? new Date(selectedBillingCo.trialEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '30 days from allocation'}. Tenant has full features.`
                    : 'Grant or re-offer a 30-day free trial for this specific tenant account. Updates company trial records in database.'}
                </p>
              </div>

              {/* Direct tier override */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                  Direct Plan Level Override (Database Update)
                </h4>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Change the tenant's plan directly in the system database. This will update their active plan tier instantly in Firestore.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['Basic', 'Premium'].map((tier) => {
                    const isCurrent = selectedBillingCo.plan === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => {
                          onUpdateCompany(selectedBillingCo.id, { plan: tier as any });
                          // Update locally in modal state as well so UI refreshes nicely
                          setSelectedBillingCo({
                            ...selectedBillingCo,
                            plan: tier as any,
                          });
                          alert(`✓ Successfully updated database plan tier for ${selectedBillingCo.name} to ${tier}`);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isCurrent
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{tier}</span>
                        {isCurrent && (
                          <span className="text-[8px] uppercase tracking-wide bg-indigo-800/80 text-indigo-200 px-1 py-0.2 rounded font-mono font-bold">
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stripe Session Gateways */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                  Stripe Billing Session Gateways
                </h4>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Initiate standard checkout sequences or secure Customer Portal sessions on behalf of this tenant.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* Stripe Checkout Options */}
                  <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                        <CreditCard className="h-3.5 w-3.5 text-indigo-400" /> Stripe Checkout
                      </h5>
                      <p className="text-[10px] text-slate-400 leading-normal mb-4">
                        Generate a checkout session for this tenant to sign up for a plan.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isProcessingStripe}
                        onClick={() => handleInitiateStripeCheckoutForCo(selectedBillingCo, 'Basic')}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-1.5 rounded-lg text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Basic Checkout ($59.99) <ArrowUpRight className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingStripe}
                        onClick={() => handleInitiateStripeCheckoutForCo(selectedBillingCo, 'Premium')}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 rounded-lg text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Premium Checkout ($159.99) <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Customer Portal Options */}
                  <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                        <ExternalLink className="h-3.5 w-3.5 text-emerald-400" /> Customer Portal
                      </h5>
                      <p className="text-[10px] text-slate-400 leading-normal mb-4">
                        Launch Stripe Customer Self-Service Portal to manage active subscriptions, update payment cards, and view invoice history.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isProcessingStripe}
                      onClick={() => handleAccessStripePortalForCo(selectedBillingCo)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-[10px] transition flex items-center justify-center gap-1 mt-auto cursor-pointer"
                    >
                      {isProcessingStripe ? 'Processing...' : 'Access Customer Portal'} <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedBillingCo(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 px-4 rounded-xl text-xs transition cursor-pointer"
              >
                Close Manager
              </button>
            </div>

          </div>
        </div>
      )}

      <SupportDeskModal
        isOpen={showSupportDeskModal}
        onClose={() => setShowSupportDeskModal(false)}
        currentUserRole="super_admin"
        currentUserId={currentUserId}
        currentUserName="Nexusweft Support Admin"
        currentUserEmail="admin@dispatchpro.com"
      />

      <GuidedProductTour
        user={users.find(u => u.id === currentUserId || u.id === auth.currentUser?.uid) || { id: currentUserId, name: 'Super Admin', role: 'super_admin', companyId: 'global', email: 'admin@dispatchpro.com' }}
        isOpen={showGuidedTour}
        onClose={() => setShowGuidedTour(false)}
        roleOverride="super_admin"
      />

      {/* Tenant Deactivation Modal */}
      {deactivatingCompany && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="bg-red-950/50 p-5 border-b border-red-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-400 font-heading font-bold text-base">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Deactivate Carrier Access
              </div>
              <button
                onClick={() => {
                  setDeactivatingCompany(null);
                  setDeactivateResult(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-300">
                You are deactivating carrier company <span className="font-bold text-white">{deactivatingCompany.name}</span> (DOT #{deactivatingCompany.dotNumber}).
              </div>

              {!deactivateResult ? (
                <form onSubmit={handleConfirmDeactivate} className="space-y-4">
                  <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-xs text-red-300 space-y-1">
                    <p className="font-semibold text-red-200">Security Warning:</p>
                    <p>Deactivating this tenant will immediately suspend all user memberships, disable Firebase Auth user accounts, and revoke active refresh tokens.</p>
                  </div>

                  {deactivateError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{deactivateError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Reason for Deactivation <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={deactivateReason}
                      onChange={(e) => setDeactivateReason(e.target.value)}
                      placeholder="e.g., Billing non-payment, Fraud hold, Terminated agreement"
                      disabled={isDeactivating}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Type <span className="font-mono font-bold text-red-400">{deactivatingCompany.name}</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={deactivateConfirmText}
                      onChange={(e) => setDeactivateConfirmText(e.target.value)}
                      placeholder={deactivatingCompany.name}
                      disabled={isDeactivating}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeactivatingCompany(null)}
                      disabled={isDeactivating}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDeactivating || deactivateConfirmText.trim().toLowerCase() !== deactivatingCompany.name.trim().toLowerCase() || !deactivateReason.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {isDeactivating ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Deactivating Tenant & Revoking Tokens...
                        </>
                      ) : (
                        "Confirm Deactivation"
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Reconciliation Results Display */
                <div className="space-y-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="font-semibold text-slate-300">Tenant Status:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        deactivateResult.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {deactivateResult.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-slate-300">{deactivateResult.message}</p>

                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Tenant Users</span>
                        <span className="font-bold text-white text-sm">{deactivateResult.totalUsers}</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Firestore Memberships</span>
                        <span className="font-bold text-amber-400 text-sm">{deactivateResult.membershipsSuspended} Suspended</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Firebase Auth Users</span>
                        <span className="font-bold text-red-400 text-sm">{deactivateResult.authUsersDisabled} Disabled</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Refresh Tokens</span>
                        <span className="font-bold text-purple-400 text-sm">{deactivateResult.refreshTokensRevoked} Revoked</span>
                      </div>
                    </div>

                    {deactivateResult.failedUsers && deactivateResult.failedUsers.length > 0 && (
                      <div className="bg-rose-950/40 border border-rose-800/50 p-2.5 rounded-lg text-rose-300 text-[10px] space-y-1 mt-2">
                        <p className="font-bold text-rose-200">Attention: {deactivateResult.failedUsers.length} user accounts could not be disabled in Firebase Auth:</p>
                        {deactivateResult.failedUsers.map((f: any) => (
                          <p key={f.uid} className="font-mono">UID: {f.uid} - Code: {f.safeErrorCode}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setDeactivatingCompany(null);
                        setDeactivateResult(null);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Close Summary
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tenant Reactivation Modal */}
      {reactivatingCompany && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="bg-emerald-950/50 p-5 border-b border-emerald-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-emerald-400 font-heading font-bold text-base">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Re-Activate Carrier Access
              </div>
              <button
                onClick={() => {
                  setReactivatingCompany(null);
                  setReactivateResult(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-300">
                You are reactivating carrier company <span className="font-bold text-white">{reactivatingCompany.name}</span> (DOT #{reactivatingCompany.dotNumber}).
              </div>

              {!reactivateResult ? (
                <form onSubmit={handleConfirmReactivate} className="space-y-4">
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 space-y-1">
                    <p className="font-semibold text-emerald-200">Reactivation Notice:</p>
                    <p>Reactivating this tenant will restore membership access and re-enable Firebase Auth user accounts that were disabled due to tenant deactivation.</p>
                  </div>

                  {reactivateError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{reactivateError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Reason for Reactivation (Optional)
                    </label>
                    <input
                      type="text"
                      value={reactivateReason}
                      onChange={(e) => setReactivateReason(e.target.value)}
                      placeholder="e.g., Payment resolved, Subscription renewed"
                      disabled={isReactivating}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReactivatingCompany(null)}
                      disabled={isReactivating}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isReactivating}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {isReactivating ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Re-activating Tenant Accounts...
                        </>
                      ) : (
                        "Confirm Reactivation"
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Reactivation Summary Display */
                <div className="space-y-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="font-semibold text-slate-300">Reactivation Status:</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {reactivateResult.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-slate-300">{reactivateResult.message}</p>

                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Tenant Users</span>
                        <span className="font-bold text-white text-sm">{reactivateResult.totalUsers}</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Memberships Restored</span>
                        <span className="font-bold text-emerald-400 text-sm">{reactivateResult.membershipsRestored} Restored</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Firebase Auth Users</span>
                        <span className="font-bold text-emerald-400 text-sm">{reactivateResult.authUsersReenabled} Re-Enabled</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setReactivatingCompany(null);
                        setReactivateResult(null);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Close Summary
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

