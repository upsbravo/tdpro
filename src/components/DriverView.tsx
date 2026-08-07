import React, { useState, useEffect } from 'react';
import { Truck, Navigation, MessageSquare, AlertCircle, CheckCircle, ShieldCheck, MapPin, Camera, Compass, RefreshCw, Send, Bell, ShieldAlert, FileCheck, FileText, Download, Settings, Mail, Phone, BellRing, Smartphone, Check } from 'lucide-react';
import { Company, User as AppUser, Load, Message, LoadStatus } from '../types';
import { formatWeight, formatDate, formatCurrency } from '../utils';
import { uploadFileToStorage } from '../firebase';
import PodScanner from './PodScanner';
import DriverCompletedHistory from './DriverCompletedHistory';
import DriverPendingLoad from './DriverPendingLoad';
import DriverBreakdownModal from './DriverBreakdownModal';
import CompanyAlertCenterModal from './CompanyAlertCenterModal';
import { sendDriverNotificationAlert } from '../services/notificationService';
import LegalViewerModal from './legal/LegalViewerModal';
import { db, auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { GuidedProductTour, shouldShowTourForUser } from './tour/GuidedProductTour';
import { AccountingCenter } from './AccountingCenter';

interface DriverViewProps {
  company: Company;
  driver: AppUser;
  loads: Load[];
  messages: Message[];
  users: AppUser[];
  onUpdateLoadStatus: (loadId: string, status: LoadStatus) => void;
  onUpdateLoad?: (loadId: string, updates: Partial<Load>) => void;
  onUploadPod: (loadId: string, podDataUrl: string, fileName: string) => void;
  onSendMessage: (loadId: string | undefined, channel: 'load' | 'general', text: string, attachmentName?: string, attachmentUrl?: string) => void;
  onToggleGpsConsent: (loadId: string, accepted: boolean, statusToUpdate?: LoadStatus) => void;
  onSimulateGpsTick: (loadId: string) => void;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  onUpdateUserProfile: (userId: string, updates: Partial<AppUser>) => void | Promise<void>;
  onOpenSettings?: () => void;
  googleMapsKey?: string;
  isSandbox?: boolean;
}

export default function DriverView({
  company,
  driver,
  loads,
  messages,
  users,
  onUpdateLoadStatus,
  onUpdateLoad,
  onUploadPod,
  onSendMessage,
  onToggleGpsConsent,
  onSimulateGpsTick,
  pageTheme,
  onUpdateUserProfile,
  onOpenSettings,
  googleMapsKey = '',
  isSandbox = true,
}: DriverViewProps) {
  
  const [demoFallback, setDemoFallback] = useState(isSandbox);
  const [chatInput, setChatInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [activeDriverTab, setActiveDriverTab] = useState<'task' | 'chat' | 'notifs' | 'settlements'>('task');
  const [driverFile, setDriverFile] = useState<string | null>(null);
  const [driverFileUrl, setDriverFileUrl] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [showPastHistory, setShowPastHistory] = useState(false);
  const [sendingTestAlert, setSendingTestAlert] = useState(false);
  const [testAlertSentSuccess, setTestAlertSentSuccess] = useState(false);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [showAlertCenterModal, setShowAlertCenterModal] = useState(false);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  // Driver First-Login Compliance Modal state
  const [showDriverComplianceModal, setShowDriverComplianceModal] = useState<boolean>(() => {
    return !driver?.driverTermsAcceptedAt && !driver?.legalAcceptedAt;
  });

  // Trigger Guided Product Tour ONLY after Driver Compliance Consent is finished
  useEffect(() => {
    if (driver && driver.role === 'driver' && !showDriverComplianceModal) {
      if (shouldShowTourForUser(driver, 'driver')) {
        setShowGuidedTour(true);
      }
    }
  }, [driver, showDriverComplianceModal]);
  const [drvTerms, setDrvTerms] = useState(false);
  const [drvGps, setDrvGps] = useState(false);
  const [drvSms, setDrvSms] = useState(false);
  const [drvSos, setDrvSos] = useState(false);
  const [drvSafety, setDrvSafety] = useState(false);
  const [drvSignerName, setDrvSignerName] = useState(driver.name || '');
  const [isSubmittingDriverConsent, setIsSubmittingDriverConsent] = useState(false);

  const [showDriverLegalModal, setShowDriverLegalModal] = useState(false);
  const [selectedDriverLegalSlug, setSelectedDriverLegalSlug] = useState('driver-terms');

  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(driver.notificationPreferences?.emailAlerts ?? true);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(driver.notificationPreferences?.smsAlerts ?? true);
  const [loadStatusAlertsEnabled, setLoadStatusAlertsEnabled] = useState(driver.notificationPreferences?.loadStatusAlerts ?? true);

  const [lastViewedChatTime, setLastViewedChatTime] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(`last_viewed_chat_${driver?.id || 'default'}`);
      return stored ? parseInt(stored) : Date.now();
    } catch {
      return Date.now();
    }
  });

  // Update last viewed time whenever active driver tab is chat or when new messages arrive on chat
  useEffect(() => {
    if (activeDriverTab === 'chat') {
      const now = Date.now();
      setLastViewedChatTime(now);
      try {
        localStorage.setItem(`last_viewed_chat_${driver?.id || 'default'}`, now.toString());
      } catch (err) {
        console.error(err);
      }
    }
  }, [activeDriverTab, messages, driver?.id]);

  // Find loads assigned to this driver
  let assignedLoads = loads.filter(l => l.assignedDriverId === driver?.id && l.companyId === company.id);
  if (assignedLoads.length === 0 && demoFallback) {
    // Fallback: if no loads are specifically assigned to this driver's ID, allow testing/previewing using any loads of the company
    assignedLoads = loads.filter(l => l.companyId === company.id);
  }
  const completedLoads = assignedLoads.filter(l => l.status === 'delivered');
  const openLoads = assignedLoads.filter(l => l.status !== 'delivered' && l.status !== 'canceled');

  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);

  // Active or primary in-transit load
  const activeInTransitLoad = openLoads.find(l => l.status === 'in_transit') || openLoads.find(l => l.status === 'dispatched') || openLoads[0] || null;

  // Active load currently being focused/viewed in detail
  const activeLoad = openLoads.find(l => l.id === selectedLoadId) || activeInTransitLoad;
  const pendingLoad = !activeLoad ? assignedLoads.find(l => l.status === 'booked') : null;

  // Upcoming Loads: other open assigned loads sorted by pickup time
  const upcomingLoads = openLoads
    .filter(l => l.id !== activeLoad?.id)
    .sort((a, b) => {
      const timeA = a.pickup?.dateTime ? new Date(a.pickup.dateTime).getTime() : 0;
      const timeB = b.pickup?.dateTime ? new Date(b.pickup.dateTime).getTime() : 0;
      return timeA - timeB;
    });

  const handleAcceptLoad = (loadId: string) => {
    const nowIso = new Date().toISOString();
    if (onUpdateLoad) {
      onUpdateLoad(loadId, {
        driverAcceptanceStatus: 'accepted',
        driverAcceptedAt: nowIso
      });
    } else {
      const targetLoad = loads.find(l => l.id === loadId);
      if (targetLoad) {
        targetLoad.driverAcceptanceStatus = 'accepted';
        targetLoad.driverAcceptedAt = nowIso;
      }
    }
    const target = loads.find(l => l.id === loadId);
    alert(`Load #${target?.loadNumber || loadId} accepted successfully!`);
  };

  const handleDeclineLoad = (loadId: string) => {
    const reason = prompt('Please enter a reason for declining this load assignment (optional):');
    if (reason === null) return;
    const nowIso = new Date().toISOString();
    if (onUpdateLoad) {
      onUpdateLoad(loadId, {
        driverAcceptanceStatus: 'declined',
        driverDeclinedAt: nowIso,
        driverDeclineReason: reason.trim() || 'Declined by driver'
      });
    }
    const target = loads.find(l => l.id === loadId);
    alert(`Load #${target?.loadNumber || loadId} declined.`);
    onSendMessage(loadId, 'load', `⚠️ Driver ${driver.name} declined load assignment #${target?.loadNumber}. Reason: ${reason.trim() || 'None provided'}`);
  };

  // Dynamic dispatcher resolution
  const getDispatcherName = () => {
    const currentLoad = activeLoad || pendingLoad;
    let dispatcher = currentLoad?.assignedDispatcherId ? users.find(u => u.id === currentLoad.assignedDispatcherId) : null;
    
    // Fallback: search for dispatcher or admin sender inside the messages
    if (!dispatcher && currentLoad) {
      const dispatcherMessages = messages.filter(
        m => m.channel === 'load' && m.loadId === currentLoad.id && m.companyId === company.id && (m.senderRole === 'dispatcher' || m.senderRole === 'admin')
      );
      if (dispatcherMessages.length > 0) {
        const lastMsg = dispatcherMessages[dispatcherMessages.length - 1];
        dispatcher = users.find(u => u.id === lastMsg.senderId) || null;
      }
    }
    
    // Fallback: find any active dispatcher in the same company
    if (!dispatcher) {
      dispatcher = users.find(u => u.companyId === company.id && u.role === 'dispatcher') || null;
    }
    
    // Fallback: find any admin in the same company
    if (!dispatcher) {
      dispatcher = users.find(u => u.companyId === company.id && u.role === 'admin') || null;
    }
    
    return dispatcher ? `${dispatcher.name} (DISP)` : 'Tom Miller (DISP)';
  };

  const handleSaveDriverConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drvTerms || !drvGps || !drvSms || !drvSos || !drvSafety) {
      alert('You must review and accept all 5 driver compliance items to activate your driver terminal.');
      return;
    }
    if (!drvSignerName.trim()) {
      alert('Please enter your full legal signature.');
      return;
    }

    setIsSubmittingDriverConsent(true);
    try {
      const consentId = `consent_drv_${Date.now()}`;
      const timestamp = new Date().toISOString();

      try {
        await setDoc(doc(db, 'admins', company.id, 'drivers', driver.id, 'consents', consentId), {
          id: consentId,
          companyId: company.id,
          driverId: driver.id,
          driverName: drvSignerName.trim(),
          driverPhone: driver.phone || '',
          consentsAccepted: [
            'Driver Terms of Use & Privacy Policy',
            'Load-based GPS Location Tracking Consent',
            'SMS Notification Opt-In',
            'Breakdown & SOS Alert Disclaimer',
            'FMCSA Mobile Device Safety Rule'
          ],
          ipAddress: '127.0.0.1',
          userAgent: navigator.userAgent,
          signedAt: timestamp,
          status: 'accepted'
        });
      } catch (firestoreErr) {
        console.warn('Direct Firestore consent log write failed (proceeding with backend profile update):', firestoreErr);
      }

      // Update local profile & parent user profile
      if (onUpdateUserProfile) {
        await onUpdateUserProfile(driver.id, {
          driverTermsAcceptedAt: timestamp,
          gpsConsentAcceptedAt: timestamp,
          smsConsentAcceptedAt: timestamp,
          legalAcceptedAt: timestamp
        });
      }

      setShowDriverComplianceModal(false);
    } catch (err: any) {
      console.error('Failed to save driver consent:', err);
      alert('Error saving consent signature. Please try again or check connection.');
    } finally {
      setIsSubmittingDriverConsent(false);
    }
  };

  const handleStatusChange = () => {
    if (!activeLoad) return;
    
    // Status Flow: booked -> dispatched -> in_transit -> delivered
    let nextStatus: LoadStatus = 'booked';
    if (activeLoad.status === 'booked') {
      nextStatus = 'dispatched';
    } else if (activeLoad.status === 'dispatched') {
      // Transitioning to In-Transit requires GPS privacy consent verification if subscription GPS is enabled or load-specific GPS is required
      if (activeLoad.gpsTrackingRequired !== false && (company.gpsTrackingEnabled || activeLoad.gpsTrackingRequired) && !activeLoad.gpsConsentAccepted) {
        setShowConsentModal(true);
        return;
      }
      nextStatus = 'in_transit';
    } else if (activeLoad.status === 'in_transit') {
      if (!activeLoad.podUrl) {
        // To mark as Delivered, they must upload POD document first
        setShowScanner(true);
        return;
      }
      nextStatus = 'delivered';
    }

    onUpdateLoadStatus(activeLoad.id, nextStatus);
  };

  const handleAcceptGpsConsent = () => {
    if (activeLoad) {
      onToggleGpsConsent(activeLoad.id, true, 'in_transit');
      setShowConsentModal(false);
    }
  };

  const handleSavePodScan = (podDataUrl: string, fileName: string) => {
    if (activeLoad) {
      onUploadPod(activeLoad.id, podDataUrl, fileName);
      setShowScanner(false);
      alert(`Proof of Delivery sent to dispatch!\nDocument reference: ${fileName}.\nNow click 'Deliver Load Completed' to finalize delivery.`);
    }
  };

  const handleDeliverLoadComplete = () => {
    if (activeLoad && activeLoad.podUrl) {
      onUpdateLoadStatus(activeLoad.id, 'delivered');
      alert(`Load successfully marked as DELIVERED & COMPLETED.`);
    }
  };

  const hasLoad = !!(activeLoad || pendingLoad);
  const [chatChannel, setChatChannel] = useState<'load' | 'general'>(hasLoad ? 'load' : 'general');

  // Sync sub-tab if load presence changes
  useEffect(() => {
    if (hasLoad) {
      setChatChannel('load');
    } else {
      setChatChannel('general');
    }
  }, [hasLoad]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput && !driverFile) return;
    
    if (chatChannel === 'general') {
      onSendMessage(undefined, 'general', chatInput, driverFile || undefined, driverFileUrl || undefined);
    } else {
      const targetLoadId = activeLoad?.id || pendingLoad?.id;
      if (!targetLoadId) return;
      onSendMessage(targetLoadId, 'load', chatInput, driverFile || undefined, driverFileUrl || undefined);
    }
    
    setChatInput('');
    setDriverFile(null);
    setDriverFileUrl(null);
  };

  const activeLoadId = activeLoad?.id || pendingLoad?.id || 'none';
  
  const displayedMessages = messages.filter(m => {
    if (chatChannel === 'general') {
      return m.channel === 'general' && m.companyId === company.id;
    } else {
      return m.channel === 'load' && m.loadId === activeLoadId && m.companyId === company.id;
    }
  });

  const hasNewDispatcherMessage = messages.some(m => {
    const isDispatcher = m.senderRole === 'dispatcher' || m.senderRole === 'admin';
    if (!isDispatcher) return false;
    
    const messageTime = new Date(m.timestamp).getTime();
    if (messageTime <= lastViewedChatTime) return false;

    const isGeneral = m.channel === 'general' && m.companyId === company.id;
    const isActiveLoad = m.channel === 'load' && m.loadId === activeLoadId && m.companyId === company.id;
    
    return isGeneral || isActiveLoad;
  });

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto space-y-6" id="driver-mobile-workspace">
      
      {/* Simulation Frame mimicking a rugged cargo terminal (Zebra/Honeywell style) */}
      <div className="bg-zinc-900 border-8 border-zinc-800 rounded-3xl shadow-2xl text-white overflow-hidden flex flex-col justify-between min-h-[640px] relative">
        
        {/* Driver Profile Summary */}
        <div className="bg-zinc-950 p-3.5 border-b border-zinc-800 flex flex-wrap gap-2 justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-sm text-yellow-500 border border-zinc-700">
              CDL
            </div>
            <div>
              <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold">OPERATOR ELD</span>
              <div className="flex items-center gap-1">
                <h3 className="font-heading text-xs font-bold leading-tight">{driver.name}</h3>
                {onOpenSettings && (
                  <button 
                    onClick={onOpenSettings}
                    className="p-0.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-yellow-500 transition cursor-pointer flex items-center justify-center"
                    title="Open Profile Settings & Password Reset"
                    id="driver-profile-settings-btn"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => setShowGuidedTour(true)}
                  className="p-0.5 px-1.5 hover:bg-zinc-800 rounded text-yellow-400 hover:text-yellow-300 transition cursor-pointer flex items-center gap-1 text-[9px] font-bold border border-zinc-700/60"
                  title="Take Driver Tour Again"
                  id="driver-btn-take-tour-again"
                >
                  <Compass className="h-3 w-3" />
                  <span>Tour</span>
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={driver.dutyStatus || 'Off Duty'}
              onChange={(e) => onUpdateUserProfile(driver.id, { dutyStatus: e.target.value as any })}
              className={`bg-zinc-900 border border-zinc-800 text-[10px] font-bold py-1 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500 cursor-pointer ${
                driver.dutyStatus === 'On Duty' ? 'text-emerald-500' :
                driver.dutyStatus === 'On Break' ? 'text-amber-500' :
                'text-zinc-400'
              }`}
            >
              <option value="On Duty">🟢 On Duty</option>
              <option value="Off Duty">⚫ Off Duty</option>
              <option value="On Break">🟡 On Break</option>
            </select>
            <div className="text-right font-mono text-[10px] bg-zinc-900 px-2 py-1 rounded text-zinc-400 border border-zinc-800 flex flex-col items-end leading-tight">
              <div>TRK: <span className="text-yellow-500 font-bold">{driver.truckNumber}</span></div>
              <div className="text-[8px] text-zinc-500 font-semibold">DISP: <span className="text-zinc-300">{getDispatcherName().replace(' (DISP)', '')}</span></div>
            </div>
          </div>
        </div>

        {/* Emergency / Breakdown Quick Banner */}
        <div className="bg-red-950/60 border-b border-red-900/60 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-red-400 font-bold text-[11px]">
            <ShieldAlert className="h-4 w-4 animate-pulse text-red-500" />
            <span>BREAKDOWN / SOS MODE</span>
          </div>
          <button
            onClick={() => setShowBreakdownModal(true)}
            id="tour-driver-sos"
            className="bg-red-600 hover:bg-red-500 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wide transition flex items-center gap-1 cursor-pointer shadow-md shadow-red-950 border border-red-400/40"
          >
            <AlertCircle className="h-3 w-3" />
            <span>Report Breakdown</span>
          </button>
        </div>

        {/* Active Workspace Screen */}
        <div className="flex-grow p-3 bg-zinc-950 overflow-y-auto space-y-4">
          
          {/* Driver navigation tabs */}
          <div className="grid grid-cols-4 gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 shrink-0 text-center">
            <button
              onClick={() => setActiveDriverTab('task')}
              className={`py-1.5 rounded text-[10px] font-bold uppercase transition ${activeDriverTab === 'task' ? 'bg-yellow-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              🚚 Jobs
            </button>
            <button
              onClick={() => setActiveDriverTab('chat')}
              className={`py-1.5 rounded text-[10px] font-bold uppercase transition relative ${activeDriverTab === 'chat' ? 'bg-yellow-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              💬 Chat
              {hasNewDispatcherMessage && (
                <span className="absolute top-1 right-2 h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button
              onClick={() => setActiveDriverTab('notifs')}
              className={`py-1.5 rounded text-[10px] font-bold uppercase transition relative ${activeDriverTab === 'notifs' ? 'bg-yellow-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              🔔 Alert
              <span className="absolute top-1 right-2 h-1.5 w-1.5 bg-red-500 rounded-full"></span>
            </button>
            <button
              onClick={() => setActiveDriverTab('settlements')}
              className={`py-1.5 rounded text-[10px] font-bold uppercase transition relative ${activeDriverTab === 'settlements' ? 'bg-yellow-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              📑 Pay Stubs
            </button>
          </div>

            <>
              {activeDriverTab === 'task' && (
                <div className="space-y-3.5 animate-[fadeIn_0.15s]">
                  
                  {/* ELD Operator Compliance Profile Card */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">ELD Operator Profile</span>
                        <span className="text-[8px] font-mono text-zinc-500">
                          DISP: <span className="text-yellow-500 font-bold">{getDispatcherName().replace(' (DISP)', '')}</span>
                        </span>
                      </div>
                      <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 font-mono text-[8.5px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                        ● COMPLIANT & ACTIVE
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">Driver Name</span>
                        <span className="font-bold text-zinc-200">{driver.name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">CDL Number</span>
                        <span className="font-bold text-yellow-500 font-mono">{driver.licenseNumber || 'CDL-TX-882910'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">Registered Phone</span>
                        <span className="font-bold text-zinc-300">{driver.phone || '(555) 019-2831'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">ELD Email</span>
                        <span className="font-bold text-zinc-300 truncate block">{driver.email}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">Assigned Truck</span>
                        <span className="font-bold text-zinc-200 font-mono">{driver.truckNumber || 'TRK-9021'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[8.5px] uppercase font-mono block">Carrier DOT License</span>
                        <span className="font-bold text-zinc-200 font-mono">{company?.dotNumber || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setShowPastHistory(!showPastHistory)}
                        className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold hover:text-white transition cursor-pointer"
                        id="driver-completed-history-toggle-btn"
                      >
                        <span className="flex items-center gap-1.5">📁 Past Completed Loads ({completedLoads.length})</span>
                        <span className="text-[9px] text-yellow-500 font-bold bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850">
                          {showPastHistory ? 'COLLAPSE ▲' : 'VIEW PAST ▼'}
                        </span>
                      </button>
                      
                      {showPastHistory && (
                        <div className="mt-2.5 animate-[fadeIn_0.15s] overflow-hidden">
                          <DriverCompletedHistory completedLoads={completedLoads} />
                        </div>
                      )}
                    </div>
                  </div>

                  {activeLoad ? (
                    <>
                      {/* Load Identity */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 relative">
                    {activeLoad.urgent && (
                      <span className="absolute -top-2 right-3 bg-red-600 text-white font-mono text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border border-red-500 animate-pulse">
                        ⚠️ URGENT LOAD
                      </span>
                    )}

                    {/* Driver Load Acceptance Banner */}
                    {activeLoad.driverAcceptanceStatus === 'accepted' ? (
                      <div className="bg-emerald-950/60 border border-emerald-800/60 rounded-lg p-2 flex items-center justify-between text-[10px]">
                        <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-400" /> LOAD ACCEPTED
                        </span>
                        <span className="text-emerald-500/80 font-mono text-[9px]">
                          {activeLoad.driverAcceptedAt ? formatDate(activeLoad.driverAcceptedAt) : 'Accepted'}
                        </span>
                      </div>
                    ) : activeLoad.driverAcceptanceStatus === 'declined' ? (
                      <div className="bg-rose-950/60 border border-rose-800/60 rounded-lg p-2 text-[10px] space-y-1">
                        <div className="text-rose-400 font-mono font-bold flex items-center gap-1">
                          ⚠️ LOAD DECLINED BY DRIVER
                        </div>
                        {activeLoad.driverDeclineReason && (
                          <div className="text-rose-300 text-[9px] italic">
                            Reason: {activeLoad.driverDeclineReason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-950/60 border border-amber-700/60 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-amber-400 font-mono font-bold text-[10px] flex items-center gap-1">
                            ⚠️ Assignment Acceptance Required
                          </span>
                          <span className="text-amber-500 font-mono text-[9px] animate-pulse">PENDING</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptLoad(activeLoad.id)}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" /> Accept Load Assignment
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineLoad(activeLoad.id)}
                            className="py-1.5 px-3 bg-zinc-900 hover:bg-rose-950 text-rose-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800 rounded text-[10px] font-bold uppercase transition cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                      <span className="text-[10px] font-mono text-zinc-500">LOAD ID #</span>
                      <strong className="text-sm font-mono font-bold text-yellow-500">{activeLoad.loadNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                      <span className="text-[10px] font-mono text-zinc-500">BROKER / SHIPPER</span>
                      <strong className="text-xs font-bold text-zinc-200">{activeLoad.companyName || 'Not Specified'}</strong>
                    </div>

                    {activeLoad.carrierName && (
                      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                        <span className="text-[10px] font-mono text-zinc-500">CARRIER COMPANY</span>
                        <strong className="text-xs font-bold text-yellow-500">{activeLoad.carrierName}</strong>
                      </div>
                    )}

                    {activeLoad.temperature && (
                      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                        <span className="text-[10px] font-mono text-zinc-500">❄️ REEFER TEMPERATURE</span>
                        <strong className="text-xs font-mono font-bold text-rose-400 bg-rose-950/45 px-2 py-0.5 rounded border border-rose-900/30">{activeLoad.temperature}</strong>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[11px] border-b border-zinc-800 pb-2.5">
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">Cargo Commodity</span>
                        <span className="font-bold">{activeLoad.cargoType}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">Freight Weight</span>
                        <span className="font-bold">{formatWeight(activeLoad.weight)}</span>
                      </div>
                    </div>

                    {/* Routing list */}
                    <div className="space-y-3.5 pt-1 text-[11px]">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1">Routing Stops & Schedule</div>
                      
                      {/* Pickups */}
                      {((activeLoad.pickups && activeLoad.pickups.length > 0) ? activeLoad.pickups : [activeLoad.pickup]).map((stop, sIdx) => (
                        <div key={`pu-${sIdx}`} className="flex gap-2.5 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-850/50">
                          <div className="h-5 w-5 rounded bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center font-bold text-yellow-500 text-[9px] font-mono shrink-0 mt-0.5">
                            PU {sIdx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <strong className="text-zinc-200 block text-xs leading-snug">{stop.facilityName}</strong>
                            <span className="text-[10px] text-zinc-500 block mt-0.5">{stop.address}</span>
                            
                            <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1.5 border-t border-zinc-850 text-[10px]">
                              {stop.dateTime && (
                                <div className="text-yellow-500 font-mono">
                                  <span className="text-zinc-500 block text-[8px] uppercase">Schedule Time</span>
                                  📅 {stop.dateTime}
                                </div>
                              )}
                              {stop.referenceNumber && (
                                <div className="text-zinc-300 font-mono">
                                  <span className="text-zinc-500 block text-[8px] uppercase">PU Ref / PO</span>
                                  🔑 {stop.referenceNumber}
                                </div>
                              )}
                            </div>
                            {(stop.notes || stop.specialInstructions) && (
                              <div className="mt-2 text-[9.5px] text-zinc-400 bg-zinc-900/60 p-1.5 rounded border border-zinc-850 leading-relaxed font-mono">
                                {stop.notes && <div className="text-zinc-300">📝 {stop.notes}</div>}
                                {stop.specialInstructions && <div className="text-red-400 mt-1">⚠️ {stop.specialInstructions}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Deliveries */}
                      {((activeLoad.deliveries && activeLoad.deliveries.length > 0) ? activeLoad.deliveries : [activeLoad.delivery]).map((stop, sIdx) => (
                        <div key={`del-${sIdx}`} className="flex gap-2.5 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-850/50">
                          <div className="h-5 w-5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-500 text-[9px] font-mono shrink-0 mt-0.5">
                            SO {sIdx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <strong className="text-zinc-200 block text-xs leading-snug">{stop.facilityName}</strong>
                            <span className="text-[10px] text-zinc-500 block mt-0.5">{stop.address}</span>
                            
                            <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1.5 border-t border-zinc-850 text-[10px]">
                              {stop.dateTime && (
                                <div className="text-emerald-400 font-mono">
                                  <span className="text-zinc-500 block text-[8px] uppercase">Schedule Time</span>
                                  📅 {stop.dateTime}
                                </div>
                              )}
                              {stop.referenceNumber && (
                                <div className="text-zinc-300 font-mono">
                                  <span className="text-zinc-500 block text-[8px] uppercase">PO / SO Ref</span>
                                  🔑 {stop.referenceNumber}
                                </div>
                              )}
                            </div>
                            {(stop.notes || stop.specialInstructions) && (
                              <div className="mt-2 text-[9.5px] text-zinc-400 bg-zinc-900/60 p-1.5 rounded border border-zinc-850 leading-relaxed font-mono">
                                {stop.notes && <div className="text-zinc-300">📝 {stop.notes}</div>}
                                {stop.specialInstructions && <div className="text-red-400 mt-1">⚠️ {stop.specialInstructions}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Shareable Dispatch Documents with Driver */}
                    {activeLoad.attachments && activeLoad.attachments.length > 0 && (
                      <div className="border-t border-zinc-800 pt-3 space-y-2" id="driver-dispatch-documents-list">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">Dispatch Documents (Click to Open)</span>
                        <div className="space-y-1.5">
                          {activeLoad.attachments.map((file, idx) => (
                            <a
                              key={idx}
                              href={file.url}
                              download={file.name}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg hover:border-indigo-500 transition cursor-pointer text-[11px] text-zinc-200 hover:text-indigo-400 font-mono"
                            >
                              <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                              <span className="truncate flex-1 text-[10px]">{file.name}</span>
                              <Download className="h-3.5 w-3.5 text-zinc-500 hover:text-indigo-400 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Tactical Action Button */}
                  <div className="space-y-3 pt-2">
                    {activeLoad.status === 'in_transit' && activeLoad.podUrl && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2.5">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 block">Proof of Delivery Scanned</span>
                        <div className="aspect-[4/3] rounded-lg border border-zinc-700 bg-white overflow-hidden flex items-center justify-center max-w-[180px] mx-auto">
                          <img src={activeLoad.podUrl} alt="Uploaded POD" className="w-full h-auto object-contain" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowScanner(true)}
                            className="flex-1 py-2 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-[10px] font-bold text-yellow-500 transition"
                          >
                            🔄 Re-Scan POD
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={activeLoad.status === 'in_transit' && activeLoad.podUrl ? handleDeliverLoadComplete : handleStatusChange}
                      className={`w-full py-3.5 px-4 rounded-xl font-heading font-extrabold text-xs uppercase tracking-wide shadow-lg active:scale-98 transition flex items-center justify-center gap-2 ${
                        activeLoad.status === 'booked' ? 'bg-indigo-600 text-white hover:bg-indigo-500' :
                        activeLoad.status === 'dispatched' ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400' :
                        activeLoad.status === 'in_transit' ? (activeLoad.podUrl ? 'bg-purple-600 text-white hover:bg-purple-500 animate-pulse' : 'bg-emerald-600 text-white hover:bg-emerald-500') :
                        'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <Truck className="h-4 w-4 shrink-0" />
                      {activeLoad.status === 'booked' && '1. Acknowledge Load Dispatch'}
                      {activeLoad.status === 'dispatched' && '2. Set Roll Mode (In-Transit)'}
                      {activeLoad.status === 'in_transit' && (!activeLoad.podUrl ? '3. Scan Proof of Delivery (POD)' : '4. Confirm Cargo Delivered (Complete Load)')}
                      {activeLoad.status === 'delivered' && 'Cargo Delivered Successfully'}
                    </button>

                    {/* Manual simulated GPS Polling Button while In-Transit */}
                    {activeLoad.status === 'in_transit' && (
                      activeLoad.gpsTrackingRequired === false ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 text-xs text-zinc-400 font-mono">
                          <Compass className="h-4 w-4 text-zinc-500 shrink-0" />
                          <span>📡 GPS Tracking Disabled for this load ("GPS Tracking Required" is OFF)</span>
                        </div>
                      ) : (company.gpsTrackingEnabled || activeLoad.gpsTrackingRequired) && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
                          <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono">
                            <Compass className="h-4 w-4 text-emerald-400 animate-spin" />
                            <span>GPS Tracker Streaming</span>
                          </div>
                          <button
                            onClick={() => {
                              onSimulateGpsTick(activeLoad.id);
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-[9px] font-mono font-bold px-2 py-1 rounded text-yellow-500 border border-zinc-700 flex items-center gap-1.5 transition"
                          >
                            <RefreshCw className="h-3 w-3" /> Pole Next Coordinate
                          </button>
                        </div>
                      )
                    )}
                  </div>
                  {/* Privacy Consent Block */}
                  {company.gpsTrackingEnabled ? (
                    <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3 text-[10px] text-zinc-500 leading-normal space-y-1.5">
                      <span className="font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-yellow-500" /> GPS Compliance Rule
                      </span>
                      <p>
                        Platform streams coordinates ONLY while state is marked as <strong>In-Transit</strong>. Driver holds consent authority. Turn roll mode off or deliver load to lock GPS telemetry.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 p-3 text-[10px] text-zinc-500 text-center">
                      📡 Real-time GPS Telemetry Offline under subscription.
                    </div>
                  )}

                  {/* Upcoming Loads Section */}
                  {(upcomingLoads.length > 0 || driver.multiLoadEnabled) && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-yellow-500" />
                          <h3 className="text-xs font-bold text-zinc-200 font-heading uppercase tracking-wide">
                            Upcoming Assigned Loads ({upcomingLoads.length})
                          </h3>
                        </div>
                        {driver.multiLoadEnabled && (
                          <span className="text-[9px] font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40 font-bold">
                            Multi-Load Active
                          </span>
                        )}
                      </div>

                      {upcomingLoads.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 text-center py-2">
                          No additional upcoming loads currently queued.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {upcomingLoads.map((uLoad) => {
                            const acceptance = uLoad.driverAcceptanceStatus || 'pending';
                            const isCurrentlySelected = selectedLoadId === uLoad.id;

                            return (
                              <div key={uLoad.id} className={`bg-zinc-950 p-3 rounded-lg border space-y-2.5 ${isCurrentlySelected ? 'border-yellow-500 ring-1 ring-yellow-500/30' : 'border-zinc-800'}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold font-mono text-yellow-500">#{uLoad.loadNumber}</span>
                                    <span className="text-[9px] font-mono uppercase bg-zinc-850 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-750">
                                      {uLoad.status}
                                    </span>
                                  </div>
                                  {acceptance === 'accepted' ? (
                                    <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/40 flex items-center gap-1">
                                      <Check className="h-3 w-3" /> ACCEPTED
                                    </span>
                                  ) : acceptance === 'declined' ? (
                                    <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/40">
                                      DECLINED
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-900/40 animate-pulse">
                                      PENDING
                                    </span>
                                  )}
                                </div>

                                {/* Pickup & Delivery Summary */}
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-zinc-900/60 p-2 rounded border border-zinc-850">
                                  <div>
                                    <span className="text-zinc-500 block text-[8px] uppercase">Pickup Location</span>
                                    <span className="text-zinc-200 block truncate font-bold">{uLoad.pickup?.facilityName || uLoad.pickup?.address || 'N/A'}</span>
                                    <span className="text-yellow-500 text-[9px]">📅 {uLoad.pickup?.dateTime || 'Scheduled'}</span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500 block text-[8px] uppercase">Delivery Location</span>
                                    <span className="text-zinc-200 block truncate font-bold">{uLoad.delivery?.facilityName || uLoad.delivery?.address || 'N/A'}</span>
                                    <span className="text-emerald-400 text-[9px]">📅 {uLoad.delivery?.dateTime || 'Scheduled'}</span>
                                  </div>
                                </div>

                                {/* Freight details */}
                                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                  <span>Commodity: <strong className="text-zinc-200">{uLoad.cargoType}</strong></span>
                                  <span>Weight: <strong className="text-zinc-200">{formatWeight(uLoad.weight)}</strong></span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-1 border-t border-zinc-850">
                                  {acceptance === 'pending' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleAcceptLoad(uLoad.id)}
                                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 cursor-pointer"
                                      >
                                        <Check className="h-3 w-3" /> Accept
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeclineLoad(uLoad.id)}
                                        className="py-1.5 px-3 bg-zinc-900 hover:bg-rose-950 text-rose-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800 rounded text-[10px] font-bold uppercase transition cursor-pointer"
                                      >
                                        Decline
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLoadId(isCurrentlySelected ? null : uLoad.id)}
                                    className="flex-1 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-yellow-500 border border-zinc-700 rounded text-[10px] font-bold uppercase transition cursor-pointer"
                                  >
                                    {isCurrentlySelected ? 'Viewing Load' : 'Focus Details'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : pendingLoad ? (
                <DriverPendingLoad pendingLoad={pendingLoad} onUpdateLoadStatus={onUpdateLoadStatus} />
              ) : (
                <div className="text-center py-8 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 space-y-2">
                  <CheckCircle className="h-10 w-10 text-zinc-700 mx-auto" />
                  <p className="text-xs">No active or pending loads assigned to truck {driver.truckNumber || 'TRK-9021'}.</p>
                </div>
              )}

              {/* Past Completed Loads History - Moved inside profile card */}

            </div>
          )}

              {activeDriverTab === 'chat' && (
                <div className="flex flex-col justify-between h-[420px] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 animate-[fadeIn_0.15s]">
                  <div className="p-2 border-b border-zinc-800 bg-zinc-950 flex flex-col gap-1.5 shrink-0">
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                      <span>{chatChannel === 'general' ? '📢 General Dispatch Room' : `RE: ${activeLoad?.loadNumber || pendingLoad?.loadNumber || 'Fleet Support'}`}</span>
                      <span className="text-yellow-500">{getDispatcherName()}</span>
                    </div>

                    {hasLoad && (
                      <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-850">
                        <button
                          type="button"
                          onClick={() => setChatChannel('load')}
                          className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition ${
                            chatChannel === 'load' 
                              ? 'bg-yellow-500 text-zinc-950 shadow-sm' 
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          📦 Load Chat ({activeLoad?.loadNumber || pendingLoad?.loadNumber})
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatChannel('general')}
                          className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition ${
                            chatChannel === 'general' 
                              ? 'bg-yellow-500 text-zinc-950 shadow-sm' 
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          📢 General Chat
                        </button>
                      </div>
                    )}
                  </div>

                  {/* direct messaging */}
                  <div className="flex-grow p-3 space-y-2 overflow-y-auto max-h-[300px]" id="driver-chat-messages-container">
                    {displayedMessages.length === 0 ? (
                      <div className="text-center py-12 text-[11px] text-zinc-500 font-mono">
                        {chatChannel === 'general' 
                          ? 'No broadcast messages in general room yet.' 
                          : 'No active thread messages for this load.'}
                      </div>
                    ) : (
                      displayedMessages.map((msg) => {
                        const isSelf = msg.senderId === driver.id;
                        return (
                          <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[90%] ${isSelf ? 'ml-auto' : 'mr-auto'}`}>
                            <span className="text-[8px] text-zinc-500 font-mono mb-0.5">
                              {msg.senderName.split(' ')[0]} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className={`p-2.5 rounded-xl text-xs leading-tight ${isSelf ? 'bg-yellow-500 text-zinc-950 font-semibold rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none'}`}>
                              <div>{msg.text}</div>
                              {msg.attachmentName && (
                                <div className={`mt-1.5 p-1 rounded flex items-center gap-1 border text-[9px] font-mono ${
                                  isSelf ? 'bg-yellow-600 border-yellow-400 text-zinc-950' : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                                }`}>
                                  <FileText className="h-2.5 w-2.5 shrink-0" />
                                  {msg.attachmentUrl ? (
                                    <a
                                      href={msg.attachmentUrl}
                                      download={msg.attachmentName}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline font-bold hover:opacity-80 break-all"
                                    >
                                      {msg.attachmentName}
                                    </a>
                                  ) : (
                                    <span className="font-bold break-all">{msg.attachmentName}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* msg input */}
                  <form onSubmit={handleSendMessage} className="p-2 border-t border-zinc-800 bg-zinc-950 flex flex-col gap-1.5 shrink-0">
                    {driverFile && (
                      <div className="text-[9px] font-mono text-yellow-500 bg-zinc-900 rounded px-2 py-0.5 flex justify-between items-center border border-zinc-800">
                        <span className="truncate">Attached: <strong>{driverFile}</strong></span>
                        <button type="button" onClick={() => { setDriverFile(null); setDriverFileUrl(null); }} className="text-zinc-400 hover:text-white ml-2 cursor-pointer">✕</button>
                      </div>
                    )}
                    <div className="flex gap-1.5 w-full">
                      <input
                        type="text"
                        placeholder="Reply to Dispatch..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="flex-grow bg-zinc-900 border border-zinc-800 rounded-lg text-xs py-1.5 px-2.5 text-white focus:outline-none focus:border-yellow-500"
                      />
                      
                      <label
                        id="driver-chat-file-upload-label"
                        className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${isUploadingFile ? 'bg-indigo-900 border-indigo-700 text-indigo-200 animate-pulse' : driverFile ? 'bg-yellow-500 border-yellow-400 text-zinc-950' : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-400'}`}
                        title={isUploadingFile ? "Uploading..." : "Attach a photo or document"}
                      >
                        <FileText id="driver-chat-file-upload-icon" className="h-3.5 w-3.5" />
                        <input
                          id="driver-chat-file-upload-input"
                          type="file"
                          disabled={isUploadingFile}
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                setIsUploadingFile(true);
                                setDriverFile(`${file.name} (Uploading...)`);
                                const loadIdPart = chatChannel === 'load' ? (activeLoad?.id || 'general') : 'general';
                                const storagePath = `communications/${company.id}/${loadIdPart}/${Date.now()}_${file.name}`;
                                const url = await uploadFileToStorage(file, storagePath);
                                setDriverFile(file.name);
                                setDriverFileUrl(url);
                              } catch (err) {
                                console.error("Failed to upload file to Storage:", err);
                                alert("Failed to upload attachment. Please try again.");
                                setDriverFile(null);
                                setDriverFileUrl(null);
                              } finally {
                                setIsUploadingFile(false);
                              }
                            }
                          }}
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={isUploadingFile}
                        className="bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs transition shrink-0 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeDriverTab === 'notifs' && (
                <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1 animate-[fadeIn_0.15s]" id="driver-notification-settings-panel">
                  {/* Driver Notification Channel Status Banner */}
                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-500">
                        <BellRing className="h-4 w-4" />
                        <span>Dispatch Alert Channels</span>
                      </div>
                      <span className="text-[9px] font-mono uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                        Active & Monitored
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                        <div className="text-[10px] text-zinc-400 font-semibold">Email Alerts</div>
                        <div className="text-xs font-bold text-zinc-200 truncate mt-0.5">{driver.email}</div>
                      </div>

                      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                        <div className="text-[10px] text-zinc-400 font-semibold">SMS Phone</div>
                        <div className="text-xs font-bold text-zinc-200 mt-0.5">{driver.phone || 'N/A'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Bulletins Feed */}
                  <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                      <span>BULLETIN BOARD</span>
                      <span>07:00 AM</span>
                    </div>
                    <strong className="text-xs text-yellow-500 block">📢 Texas Heat Warning</strong>
                    <p className="text-[10px] text-zinc-400 leading-normal">
                      High temperatures exceeding 102F expected. Please continuous-run refrigeration compressors. Do not park reefers empty.
                    </p>
                  </div>
                  
                  <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                      <span>LOAD ASSIGNED</span>
                      <span>Today</span>
                    </div>
                    <strong className="text-xs text-zinc-200 block">✓ Load Dispatch & Tracking System Active</strong>
                    <p className="text-[10px] text-zinc-400 leading-normal">
                      Automated Email and SMS alerts enabled for driver load assignments and status progression.
                    </p>
                  </div>
                </div>
              )}

              {activeDriverTab === 'settlements' && (
                <div className="space-y-3 animate-[fadeIn_0.15s]">
                  <AccountingCenter
                    companyId={company.id}
                    currentUser={driver}
                  />
                </div>
              )}
            </>

        </div>
      </div>

      {/* GPS PRIVACY CONSENT DIALOG */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" id="gps-consent-modal">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-yellow-500">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="font-heading font-semibold text-sm">ELD Privacy Authorization</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              FMCSA driver privacy covenants require explicit CDL operator consent before activating real-time GPS telemetry trackers.
            </p>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10.5px] text-slate-400 leading-normal space-y-1">
              <strong>Scope of Consent</strong>: <br />
              • Real-time coordinates mapped on Dispatch dashboard <br />
              • Route tracking records stored inside Firestore gpsHistory <br />
              • Immediate termination upon marking cargo Delivered
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowConsentModal(false)}
                className="flex-1 py-2 border border-slate-700 hover:bg-slate-800 rounded-lg text-xs text-slate-300 transition"
              >
                Refuse Routing
              </button>
              <button
                onClick={handleAcceptGpsConsent}
                className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg text-xs font-bold text-slate-950 transition"
              >
                Authorize & Roll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUGGED SCANNER POD MODAL POPUP */}
      {showScanner && activeLoad && (
        <PodScanner
          loadNumber={activeLoad.loadNumber}
          onSavePod={handleSavePodScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* DRIVER BREAKDOWN / SOS MODAL */}
      <DriverBreakdownModal
        company={company}
        driver={driver}
        activeLoad={activeLoad}
        assignedLoads={assignedLoads}
        isOpen={showBreakdownModal}
        onClose={() => setShowBreakdownModal(false)}
        onAlertCreated={() => setShowAlertCenterModal(true)}
      />

      {/* COMPANY ALERT CENTER MODAL */}
      <CompanyAlertCenterModal
        company={company}
        currentUser={driver}
        loads={loads}
        isOpen={showAlertCenterModal}
        onClose={() => setShowAlertCenterModal(false)}
      />

      {/* DRIVER FIRST-LOGIN COMPLIANCE CONSENT MODAL */}
      {showDriverComplianceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl text-white p-6 space-y-4 my-auto">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-white">Driver Terminal Legal Authorization</h3>
                <p className="text-xs text-zinc-400">CDL Operator Onboarding Compliance & Telemetry Agreement</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Welcome to <strong>{company.name}</strong>'s dispatch network. FMCSA, ELD privacy regulations, and carrier policies require you to review and acknowledge the following 5 compliance items before accessing load assignments:
            </p>

            <form onSubmit={handleSaveDriverConsent} className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-xs text-zinc-300">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drvTerms}
                    onChange={(e) => setDrvTerms(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    1. I agree to the <button type="button" onClick={() => { setSelectedDriverLegalSlug('driver-terms'); setShowDriverLegalModal(true); }} className="text-amber-400 underline font-semibold">CDL Driver Terms of Use & Privacy Policy</button>.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drvGps}
                    onChange={(e) => setDrvGps(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    2. I consent to <button type="button" onClick={() => { setSelectedDriverLegalSlug('gps-location-consent'); setShowDriverLegalModal(true); }} className="text-amber-400 underline font-semibold">load-based GPS location tracking</button> while assigned to active cargo loads.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drvSms}
                    onChange={(e) => setDrvSms(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    3. I consent to receiving operational <button type="button" onClick={() => { setSelectedDriverLegalSlug('sms-terms'); setShowDriverLegalModal(true); }} className="text-amber-400 underline font-semibold">SMS text message alerts</button> for load status, dispatch instructions, and safety alerts (Msg & data rates apply; reply STOP to opt-out).
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drvSos}
                    onChange={(e) => setDrvSos(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    4. I acknowledge that the Breakdown / SOS Emergency alert button notifies dispatch only and <strong>does NOT contact 911 or emergency services</strong>. I will call 911 immediately if in danger.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drvSafety}
                    onChange={(e) => setDrvSafety(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    5. I agree never to operate hand-held mobile devices or dispatch terminals while driving, adhering to FMCSA safety rule 49 CFR § 392.80.
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1 font-mono">
                  CDL Driver Signature (Full Name) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={drvSignerName}
                  onChange={(e) => setDrvSignerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 border-t border-zinc-800 flex justify-between items-center">
                <span className="text-[10px] text-zinc-500 font-mono">Timestamp & Device Logged</span>
                <button
                  type="submit"
                  disabled={isSubmittingDriverConsent}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-lg cursor-pointer"
                >
                  {isSubmittingDriverConsent ? 'Recording Consent...' : 'Sign & Activate Terminal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRIVER LEGAL DOCUMENT VIEWER MODAL */}
      <LegalViewerModal
        isOpen={showDriverLegalModal}
        onClose={() => setShowDriverLegalModal(false)}
        initialSlug={selectedDriverLegalSlug}
      />

      <GuidedProductTour
        user={driver}
        isOpen={showGuidedTour}
        onClose={() => setShowGuidedTour(false)}
        roleOverride="driver"
      />

    </div>
  );
}
