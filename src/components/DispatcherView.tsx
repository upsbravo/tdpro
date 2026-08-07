import React, { useState, useEffect } from 'react';
import { ClipboardList, PlusCircle, UserPlus, MessageSquare, MapPin, Navigation, Map as MapIcon, AlertCircle, User, UserCog, Check, Send, Paperclip, ChevronRight, BarChart3, Download, Truck as TruckIcon, Compass, CheckCircle2, ShieldAlert, Edit2, Key, Bell, Info, Flag, FileText, Sparkles, Loader2, Search, ChevronDown, ChevronUp, Calendar, ZoomIn, ZoomOut, RotateCcw, Locate, Trash2, Archive, Clock, X } from 'lucide-react';
import { Company, User as AppUser, Load, Message, Stop, LoadStatus, AppNotification, DriverAlert, hasDispatcherPermission, OwnerOperatorCompany, Truck as FleetTruck } from '../types';
import { sanitizeNumber } from '../utils/sanitizeData';
import { formatCurrency, formatWeight, formatDate, checkTruckPmGuard } from '../utils';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { auth, db, uploadFileToStorage } from '../firebase';
import LoadEditWorkspace from './LoadEditWorkspace';
import RateConfirmationsView from './RateConfirmationsView';
import CompanyAlertCenterModal from './CompanyAlertCenterModal';
import MasterAnnouncementBanner from './MasterAnnouncementBanner';
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin, useMap as useMapInstance } from '@vis.gl/react-google-maps';
import { sendDriverNotificationAlert } from '../services/notificationService';
import { getPlanFeatures } from '../utils/planFeatures';
import { GuidedProductTour, shouldShowTourForUser } from './tour/GuidedProductTour';
import { AccountingCenter } from './AccountingCenter';
import { ComplianceCenter } from './ComplianceCenter';
import FleetEquipmentCenter from './fleet/FleetEquipmentCenter';
import { UnifiedDriverOnboardingModal } from './UnifiedDriverOnboardingModal';
import { FormErrorSummary, FieldErrorMessage, getFieldInputClass, LoadingSubmitButton } from './common/FormComponents';
import { Calculator, ShieldCheck } from 'lucide-react';

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(GOOGLE_MAPS_KEY) && GOOGLE_MAPS_KEY !== 'YOUR_API_KEY';

// Standard MapPolyline component using google maps context
function MapPolyline({ path, strokeColor = '#818cf8', strokeWidth = 3, strokeOpacity = 1.0, dashed = false }: {
  path: { lat: number; lng: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  dashed?: boolean;
}) {
  const map = useMapInstance();

  useEffect(() => {
    if (!map || path.length < 2) return;

    const options: google.maps.PolylineOptions = {
      path,
      strokeColor,
      strokeOpacity,
      strokeWeight: strokeWidth,
    };

    if (dashed) {
      options.strokeOpacity = 0;
      options.icons = [{
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: strokeOpacity,
          scale: 3,
          strokeColor,
        },
        offset: '0',
        repeat: '20px'
      }];
    }

    const polyline = new google.maps.Polyline(options);
    polyline.setMap(map);

    return () => {
      polyline.setMap(null);
    };
  }, [map, path, strokeColor, strokeWidth, strokeOpacity, dashed]);

  return null;
}

interface DispatcherViewProps {
  company: Company;
  loads: Load[];
  users: AppUser[];
  messages: Message[];
  onAddLoad: (load: Omit<Load, 'id' | 'loadNumber' | 'companyId' | 'gpsHistory' | 'gpsConsentAccepted' | 'status'> & { loadNumber?: string; rcNumber?: string; pickups?: Stop[]; deliveries?: Stop[] }) => void | Promise<void>;
  onAssignDriver: (loadId: string, driverId: string) => void;
  onUpdateLoadStatus: (loadId: string, status: LoadStatus) => void;
  onSendMessage: (loadId: string | undefined, channel: 'load' | 'general', text: string, attachmentName?: string, attachmentUrl?: string) => void;
  onAddUser: (user: Omit<AppUser, 'id'>, password?: string) => void | Promise<void>;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  onUpdateUserProfile: (userId: string, updates: Partial<AppUser>) => void | Promise<void>;
  notifications?: AppNotification[];
  onUpdateLoad: (loadId: string, updates: Partial<Load>) => void;
  googleMapsKey?: string;
  trucks?: FleetTruck[];
}

function PermissionLockedScreen({ title, description, permissionName }: { title: string, description: string, permissionName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-12 text-center my-6 mx-4 min-h-[450px] animate-in fade-in duration-300">
      <div className="bg-purple-50 text-purple-600 p-4 rounded-2xl mb-4 shadow-sm border border-purple-100">
        <ShieldAlert className="h-10 w-10 animate-bounce" />
      </div>
      <h3 className="font-heading font-bold text-slate-800 text-sm">{title}</h3>
      <p className="text-[11px] text-slate-400 max-w-sm mt-1.5 leading-relaxed">
        {description}
      </p>
      <div className="mt-5 bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-1.5 font-mono text-[9px] text-slate-500 uppercase font-bold">
        <span>Required Permission:</span>
        <span className="text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">
          {permissionName}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-2.5">
        Please contact your tenant administrator to enroll your dispatcher profile in this capability.
      </p>
    </div>
  );
}

export default function DispatcherView({
  company,
  loads,
  users,
  messages,
  onAddLoad,
  onAssignDriver,
  onUpdateLoadStatus,
  onSendMessage,
  onAddUser,
  pageTheme,
  onUpdateUserProfile,
  notifications = [],
  onUpdateLoad,
  googleMapsKey = '',
  trucks = [],
}: DispatcherViewProps) {

  const activeUserObj = users.find(u => u.id === auth.currentUser?.uid);
  const isTenantAdminOrSuperAdmin = activeUserObj?.role === 'admin' || activeUserObj?.role === 'super_admin';
  const planFeatures = getPlanFeatures(company.plan, company.subscriptionStatus);

  const getPermission = (permKey: keyof NonNullable<AppUser['dispatcherPermissions']>) => {
    const activeUser = users.find(u => u.id === auth.currentUser?.uid);
    if (!activeUser) return true;
    if (activeUser.role !== 'dispatcher') return true;
    if (!activeUser.dispatcherPermissions) return true;
    return activeUser.dispatcherPermissions[permKey] !== false;
  };

  const handleAddLoadLocal = async (load: any) => {
    if (!hasDispatcherPermission(activeUserObj, 'loads', 'create') && !getPermission('createLoads')) {
      alert('Access Denied: Your administrator has disabled load creation for your dispatcher profile.');
      return;
    }
    await onAddLoad(load);
  };

  const handleAssignDriverLocal = (loadId: string, driverId: string) => {
    if (!hasDispatcherPermission(activeUserObj, 'loads', 'assignDriver') && !getPermission('assignDrivers')) {
      alert('Access Denied: Your administrator has disabled driver assignment for your dispatcher profile.');
      return;
    }
    onAssignDriver(loadId, driverId);
  };

  const handleAddUserLocal = async (user: any, password?: string) => {
    if (!hasDispatcherPermission(activeUserObj, 'drivers', 'create') && !getPermission('createDrivers')) {
      alert('Access Denied: Your administrator has disabled driver registration for your dispatcher profile.');
      return;
    }
    await onAddUser(user, password);
  };

  const handleUpdateUserProfileLocal = (userId: string, updates: Partial<AppUser>) => {
    if (!hasDispatcherPermission(activeUserObj, 'drivers', 'edit') && !getPermission('updateDriverOperationalInfo')) {
      alert('Access Denied: Your administrator has disabled updating driver operational info for your dispatcher profile.');
      return;
    }
    onUpdateUserProfile(userId, updates);
  };

  const handleSendMessageLocal = (loadId: string | undefined, channel: 'load' | 'general', text: string, attachmentName?: string, attachmentUrl?: string) => {
    if (!getPermission('loadChat')) {
      alert('Access Denied: Your administrator has disabled chat operations for your dispatcher profile.');
      return;
    }
    onSendMessage(loadId, channel, text, attachmentName, attachmentUrl);
  };
  
  const resolvedMapsKey = googleMapsKey || GOOGLE_MAPS_KEY || (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY || '';
  const hasValidKeyResolved = Boolean(resolvedMapsKey) && resolvedMapsKey !== 'YOUR_API_KEY';

  const [activeTab, setActiveTab] = useState<'loads' | 'map' | 'chat' | 'reports' | 'drivers' | 'rate_confirmations' | 'archive' | 'accounting' | 'compliance' | 'fleet_equipment'>('loads');
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(loads[0]?.id || null);
  const [liveLocations, setLiveLocations] = useState<any[]>([]);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mapMode, setMapMode] = useState<'mock' | 'real'>(hasValidKeyResolved ? 'real' : 'mock');

  useEffect(() => {
    if (hasValidKeyResolved) {
      setMapMode('real');
    } else {
      setMapMode('mock');
    }
  }, [hasValidKeyResolved]);

  // Driver Onboarding & Truck Assignment States
  const [showUnifiedOnboardingModal, setShowUnifiedOnboardingModal] = useState<boolean>(false);
  const [showDriverAssignModal, setShowDriverAssignModal] = useState<boolean>(false);
  const [selectedDriverForAssign, setSelectedDriverForAssign] = useState<AppUser | null>(null);
  const [companyTrucksList, setCompanyTrucksList] = useState<any[]>([]);
  const activeTrucksList = (trucks && trucks.length > 0) ? trucks : companyTrucksList;
  const [selectedTruckIdForDriver, setSelectedTruckIdForDriver] = useState<string>('');
  const [currentAssignedTruckForDriver, setCurrentAssignedTruckForDriver] = useState<any | null>(null);
  const [driverAssignType, setDriverAssignType] = useState<'primary' | 'secondary'>('primary');
  const [driverAssignReason, setDriverAssignReason] = useState<string>('truck_change');
  const [driverAssignNotes, setDriverAssignNotes] = useState<string>('');
  const [driverAssignConflictError, setDriverAssignConflictError] = useState<any | null>(null);
  const [driverAssignSubmitting, setDriverAssignSubmitting] = useState<boolean>(false);

  // Active Fleet Noticeboard Pagination & Search States (Overview Tab)
  const [noticeboardSearchQuery, setNoticeboardSearchQuery] = useState<string>('');
  const [noticeboardPage, setNoticeboardPage] = useState<number>(1);
  const [noticeboardRowsPerPage, setNoticeboardRowsPerPage] = useState<number>(10);

  // Active Fleet Noticeboard Pagination States (Drivers Registry Tab)
  const [driverTabNoticeboardPage, setDriverTabNoticeboardPage] = useState<number>(1);
  const [driverTabRowsPerPage, setDriverTabRowsPerPage] = useState<number>(10);

  const [showDriverHistoryModal, setShowDriverHistoryModal] = useState<boolean>(false);
  const [selectedDriverForHistory, setSelectedDriverForHistory] = useState<AppUser | null>(null);
  const [driverHistoryLedger, setDriverHistoryLedger] = useState<any[]>([]);
  const [loadingDriverHistoryLedger, setLoadingDriverHistoryLedger] = useState<boolean>(false);

  const canLaunchOnboardingWizard = isTenantAdminOrSuperAdmin ||
    hasDispatcherPermission(activeUserObj, 'drivers', 'onboardWizard') ||
    hasDispatcherPermission(activeUserObj, 'drivers', 'create') ||
    getPermission('createDrivers');

  const canEditDriver = isTenantAdminOrSuperAdmin ||
    hasDispatcherPermission(activeUserObj, 'drivers', 'edit') ||
    getPermission('updateDriverOperationalInfo');

  // Edit Driver Profile Modal States
  const [editingDriver, setEditingDriver] = useState<AppUser | null>(null);
  const [editDriverName, setEditDriverName] = useState<string>('');
  const [editDriverEmail, setEditDriverEmail] = useState<string>('');
  const [editDriverPhone, setEditDriverPhone] = useState<string>('');
  const [editDriverCdl, setEditDriverCdl] = useState<string>('');
  const [editDriverTruck, setEditDriverTruck] = useState<string>('');
  const [editDriverOwnerOperator, setEditDriverOwnerOperator] = useState<string>('');
  const [editDriverOwnerOperatorCompanyId, setEditDriverOwnerOperatorCompanyId] = useState<string>('');
  const [editDriverDutyStatus, setEditDriverDutyStatus] = useState<string>('Off Duty');
  const [editDriverMultiLoadEnabled, setEditDriverMultiLoadEnabled] = useState<boolean>(false);
  const [editDriverMaximumOpenLoads, setEditDriverMaximumOpenLoads] = useState<number>(5);
  const [editDriverNotes, setEditDriverNotes] = useState<string>('');
  const [isSavingDriverEdit, setIsSavingDriverEdit] = useState<boolean>(false);

  const handleOpenEditDriverModal = (driver: AppUser) => {
    if (!canEditDriver) {
      alert('Access Denied: Your administrator has disabled updating driver operational info for your dispatcher profile. Please request your Fleet Administrator to enable the "Edit Driver Details" toggle in Staff Access Control.');
      return;
    }
    setEditingDriver(driver);
    setEditDriverName(driver.name || '');
    setEditDriverEmail(driver.email || '');
    setEditDriverPhone(driver.phone || '');
    setEditDriverCdl(driver.licenseNumber || (driver as any).cdlNumber || '');
    setEditDriverTruck(driver.truckNumber || '');
    setEditDriverDutyStatus(driver.dutyStatus || 'Off Duty');
    setEditDriverMultiLoadEnabled(driver.multiLoadEnabled ?? false);
    setEditDriverMaximumOpenLoads(driver.maximumOpenLoads ?? 5);
    setEditDriverNotes(driver.notes || '');

    const targetOOId = driver.ownerOperatorCompanyId;
    const targetOOName = (driver.ownerOperatorName || '').trim().toLowerCase();
    let matchedOOId = '';
    let matchedOOName = driver.ownerOperatorName || '';

    if (targetOOId) {
      const matchedById = ownerCompanies.find(o => o.id === targetOOId);
      if (matchedById) {
        matchedOOId = matchedById.id;
        matchedOOName = matchedById.legalName || matchedById.dbaName || matchedById.ownerName || '';
      }
    }
    if (!matchedOOId && targetOOName) {
      const matchedByName = ownerCompanies.find(o =>
        o.legalName?.toLowerCase() === targetOOName ||
        o.dbaName?.toLowerCase() === targetOOName ||
        o.ownerName?.toLowerCase() === targetOOName
      );
      if (matchedByName) {
        matchedOOId = matchedByName.id;
        matchedOOName = matchedByName.legalName || matchedByName.dbaName || matchedByName.ownerName || '';
      }
    }

    setEditDriverOwnerOperatorCompanyId(matchedOOId);
    setEditDriverOwnerOperator(matchedOOName);
  };

  const handleSaveDriverEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    if (!canEditDriver) {
      alert('Access Denied: Your administrator has disabled updating driver operational info for your dispatcher account.');
      return;
    }

    setIsSavingDriverEdit(true);
    try {
      const updates: Partial<AppUser> = {
        name: editDriverName.trim(),
        email: editDriverEmail.trim(),
        phone: editDriverPhone.trim(),
        licenseNumber: editDriverCdl.trim(),
        truckNumber: editDriverTruck.trim(),
        ownerOperatorName: editDriverOwnerOperator.trim(),
        ownerOperatorCompanyId: editDriverOwnerOperatorCompanyId,
        dutyStatus: editDriverDutyStatus as any,
        multiLoadEnabled: editDriverMultiLoadEnabled,
        maximumOpenLoads: editDriverMaximumOpenLoads,
        notes: editDriverNotes.trim(),
        ...(editDriverMultiLoadEnabled !== editingDriver.multiLoadEnabled ? {
          multiLoadEnabledAt: new Date().toISOString(),
          multiLoadEnabledByUid: activeUserObj?.id
        } : {})
      };

      await handleUpdateUserProfileLocal(editingDriver.id, updates);
      setEditingDriver(null);
    } catch (err: any) {
      console.error('Error saving driver profile updates:', err);
      alert(`Failed to update driver profile: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingDriverEdit(false);
    }
  };

  const fetchCompanyTrucks = async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/trucks/${company.id}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCompanyTrucksList(data.trucks || []);
      }
    } catch (err) {
      console.warn("Failed to fetch trucks:", err);
    }
  };

  useEffect(() => {
    if (company?.id) {
      fetchCompanyTrucks();
    }
  }, [company?.id]);

  const handleOpenDriverAssignModal = async (driver: AppUser) => {
    setSelectedDriverForAssign(driver);
    setSelectedTruckIdForDriver('');
    setCurrentAssignedTruckForDriver(null);
    setDriverAssignType('primary');
    setDriverAssignReason('truck_change');
    setDriverAssignNotes('');
    setDriverAssignConflictError(null);
    setShowDriverAssignModal(true);

    const idToken = await auth.currentUser?.getIdToken();
    const drvId = driver.id || (driver as any).uid;

    let trkList: any[] = [];
    try {
      const res = await fetch(`/api/fleet/trucks/${company.id}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        trkList = data.trucks || [];
        setCompanyTrucksList(trkList);
      }
    } catch (e) {
      console.warn("Failed fetching company trucks:", e);
    }

    const currentList = trkList.length > 0 ? trkList : activeTrucksList;

    // Fetch driver active assignment from history ledger
    let activeAssignedTruckId = '';
    let activeAssignedTruckObj: any = null;

    try {
      const asgRes = await fetch(`/api/fleet/truck-assignments/${company.id}?driverId=${drvId}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (asgRes.ok) {
        const asgData = await asgRes.json();
        const activeAsg = (asgData.assignments || []).find((a: any) => a.status === 'active');
        if (activeAsg) {
          activeAssignedTruckId = activeAsg.truckId;
        }
      }
    } catch (e) {
      console.warn("Failed fetching driver active assignment:", e);
    }

    if (activeAssignedTruckId) {
      activeAssignedTruckObj = currentList.find((t: any) => t.id === activeAssignedTruckId) || null;
    }

    if (!activeAssignedTruckObj) {
      // Fallback matching against driver object properties and truck list
      const matched = currentList.find((t: any) =>
        t.currentDriverId === drvId ||
        t.assignedDriverId === drvId ||
        (driver.currentTruckId && t.id === driver.currentTruckId) ||
        (driver.truckNumber && String(t.truckNumber).trim() === String(driver.truckNumber).trim()) ||
        (driver.currentTruckNumber && String(t.truckNumber).trim() === String(driver.currentTruckNumber).trim()) ||
        (driver.assignedTruck && String(t.truckNumber).trim() === String(driver.assignedTruck).trim())
      );
      if (matched) {
        activeAssignedTruckId = matched.id;
        activeAssignedTruckObj = matched;
      }
    }

    setSelectedTruckIdForDriver(activeAssignedTruckId);
    setCurrentAssignedTruckForDriver(activeAssignedTruckObj);
  };

  const handleUnassignDriverFromTruck = async () => {
    if (!selectedDriverForAssign) return;
    if (!confirm(`Are you sure you want to unassign ${selectedDriverForAssign.name} from their currently assigned truck?`)) return;

    setDriverAssignSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const drvId = selectedDriverForAssign.id || (selectedDriverForAssign as any).uid;

      const res = await fetch('/api/fleet/truck-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId: company.id,
          truckId: 'unassign',
          driverId: drvId,
          reason: 'manual_unassign',
          notes: 'Driver unassigned from modal'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to unassign driver');
        return;
      }

      setShowDriverAssignModal(false);
      setSelectedDriverForAssign(null);
      setCurrentAssignedTruckForDriver(null);
      alert(data.message || `${selectedDriverForAssign.name} was successfully unassigned from the truck.`);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Error unassigning driver');
    } finally {
      setDriverAssignSubmitting(false);
    }
  };

  const handleSaveDriverTruckAssignment = async (override = false) => {
    if (!selectedDriverForAssign || !selectedTruckIdForDriver) return;
    setDriverAssignSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/fleet/truck-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId: company.id,
          truckId: selectedTruckIdForDriver,
          driverId: selectedDriverForAssign.id || (selectedDriverForAssign as any).uid,
          assignmentType: driverAssignType,
          reason: driverAssignReason,
          notes: driverAssignNotes,
          overrideConflict: override
        })
      });

      const data = await res.json();
      if (res.status === 409 && data.requiresOverride) {
        setDriverAssignConflictError(data);
        setDriverAssignSubmitting(false);
        return;
      }

      if (!res.ok) {
        alert(data.error || 'Failed to save truck assignment');
        setDriverAssignSubmitting(false);
        return;
      }

      setShowDriverAssignModal(false);
      setSelectedDriverForAssign(null);
      setCurrentAssignedTruckForDriver(null);
      setDriverAssignConflictError(null);
      alert(data.message || 'Driver assigned to truck successfully!');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Error submitting assignment');
    } finally {
      setDriverAssignSubmitting(false);
    }
  };

  const handleOpenDriverHistoryModal = async (driver: AppUser) => {
    setSelectedDriverForHistory(driver);
    setShowDriverHistoryModal(true);
    setLoadingDriverHistoryLedger(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const drvId = driver.id || (driver as any).uid;
      const res = await fetch(`/api/fleet/truck-assignments/${company.id}?driverId=${drvId}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDriverHistoryLedger(data.assignments || []);
      }
    } catch (err) {
      console.warn("Error fetching driver history:", err);
    } finally {
      setLoadingDriverHistoryLedger(false);
    }
  };

  useEffect(() => {
    if (!selectedLoadId || !company.id) {
      setLiveLocations([]);
      return;
    }

    try {
      const locationsColRef = collection(db, 'admins', company.id, 'loads', selectedLoadId, 'locations');
      const q = query(locationsColRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const points: any[] = [];
        snapshot.forEach((doc) => {
          points.push({ id: doc.id, ...doc.data() });
        });
        setLiveLocations(points);
      }, (err) => {
        console.warn("Error listening to live location updates from subcollection:", err);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn("Failed to subscribe to live locations subcollection:", e);
      setLiveLocations([]);
    }
  }, [selectedLoadId, company.id]);

  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [testingAlertDriverId, setTestingAlertDriverId] = useState<string | null>(null);
  const [testAlertSuccessMsg, setTestAlertSuccessMsg] = useState<string | null>(null);
  const [showAlertCenterModal, setShowAlertCenterModal] = useState(false);
  const [selectedAlertIdForModal, setSelectedAlertIdForModal] = useState<string | null>(null);
  const [breakdownAlerts, setBreakdownAlerts] = useState<DriverAlert[]>([]);
  const [ownerCompanies, setOwnerCompanies] = useState<OwnerOperatorCompany[]>([]);

  useEffect(() => {
    if (!company?.id) return;
    const alertsRef = collection(db, 'admins', company.id, 'driver_alerts');
    const unsubscribe = onSnapshot(alertsRef, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriverAlert));
      setBreakdownAlerts(list);
    }, (err) => {
      console.warn('Driver alerts snapshot error:', err);
    });

    let list1: OwnerOperatorCompany[] = [];
    let list2: OwnerOperatorCompany[] = [];

    const mergeAndSetOwnerCompanies = () => {
      const map = new Map<string, OwnerOperatorCompany>();
      [...list1, ...list2].forEach(item => {
        if (item && item.id) {
          map.set(item.id, item);
        }
      });
      setOwnerCompanies(Array.from(map.values()));
    };

    const ooRef1 = collection(db, 'admins', company.id, 'owner_operator_companies');
    const unsubscribeOO1 = onSnapshot(ooRef1, (snap) => {
      list1 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OwnerOperatorCompany));
      mergeAndSetOwnerCompanies();
    }, (err) => {
      console.warn('Owner companies snapshot error in DispatcherView (owner_operator_companies):', err);
    });

    const ooRef2 = collection(db, 'admins', company.id, 'owner_operators');
    const unsubscribeOO2 = onSnapshot(ooRef2, (snap) => {
      list2 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OwnerOperatorCompany));
      mergeAndSetOwnerCompanies();
    }, (err) => {
      console.warn('Owner companies snapshot error in DispatcherView (owner_operators):', err);
    });

    fetch(`/api/personnel/owner-operator-companies?companyId=${company.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.ownerOperatorCompanies)) {
          data.ownerOperatorCompanies.forEach((item: any) => {
            if (item && item.id && !list1.some(x => x.id === item.id) && !list2.some(x => x.id === item.id)) {
              list1.push(item);
            }
          });
          mergeAndSetOwnerCompanies();
        }
      })
      .catch(() => {});

    return () => {
      unsubscribe();
      unsubscribeOO1();
      unsubscribeOO2();
    };
  }, [company?.id]);

  const activeBreakdownCount = breakdownAlerts.filter(alert =>
    ['open', 'acknowledged', 'in_progress'].includes(alert.status)
  ).length;

  const hasActiveBreakdownAlert = activeBreakdownCount > 0;
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  // Auto-trigger Guided Product Tour on dashboard load for Dispatcher role
  useEffect(() => {
    const activeUser = users.find(u => u.id === auth.currentUser?.uid);
    if (activeUser && (activeUser.role === 'dispatcher' || activeUser.role === 'admin')) {
      if (shouldShowTourForUser(activeUser, 'dispatcher')) {
        setShowGuidedTour(true);
      }
    }
  }, [users]);
  
  // Create Load Form States
  const [showCreateLoad, setShowCreateLoad] = useState(false);
  const [cargoType, setCargoType] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [weight, setWeight] = useState(35000);
  const [value, setValue] = useState(90000);
  const [rate, setRate] = useState(2800);
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  
  // Dynamic stops & parameters
  const [formLoadNumber, setFormLoadNumber] = useState('');
  const [temperature, setTemperature] = useState('');
  const [formPickups, setFormPickups] = useState<Stop[]>([
    {
      facilityName: '',
      address: '',
      dateTime: '',
      contactName: '',
      contactPhone: '',
      notes: '',
      referenceNumber: '',
      specialInstructions: ''
    }
  ]);
  const [formDeliveries, setFormDeliveries] = useState<Stop[]>([
    {
      facilityName: '',
      address: '',
      dateTime: '',
      contactName: '',
      contactPhone: '',
      notes: '',
      referenceNumber: '',
      specialInstructions: ''
    }
  ]);

  // Chat Feed States
  const [chatInput, setChatInput] = useState('');
  const [selectedChatChannel, setSelectedChatChannel] = useState<'load' | 'general'>('load');
  const [simulatedFile, setSimulatedFile] = useState<string | null>(null);
  const [simulatedFileUrl, setSimulatedFileUrl] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // AI Parsing States
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);

  const handleAutoParse = async () => {
    if (!parseFile) {
      setParseError("Please select a PDF or Image rate confirmation file first.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParseSuccess(null);

    try {
      // Read the file as a base64 string
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(parseFile);
      const base64Data = await base64Promise;

      console.log("Sending file to backend for AI parsing...");
      const response = await fetch("/api/parse-rate-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: base64Data,
          mimeType: parseFile.type
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to parse document");
      }

      // Pre-populate form fields
      if (data.companyName) setCompanyName(data.companyName);
      if (data.carrierName) setCarrierName(data.carrierName);
      if (data.cargoType) setCargoType(data.cargoType);
      if (data.weight) setWeight(sanitizeNumber(data.weight, 35000));
      if (data.value) setValue(sanitizeNumber(data.value, 90000));
      if (data.rate) setRate(sanitizeNumber(data.rate, 2800));
      if (data.notes !== undefined) setNotes(data.notes);
      if (data.urgent !== undefined) setUrgent(Boolean(data.urgent));
      if (data.loadNumber) setFormLoadNumber(data.loadNumber);
      if (data.temperature) setTemperature(data.temperature);

      if (data.pickups && data.pickups.length > 0) {
        setFormPickups(data.pickups.map((p: any) => ({
          facilityName: p.facilityName || '',
          address: p.address || '',
          dateTime: p.dateTime || '',
          contactName: p.contactName || '',
          contactPhone: p.contactPhone || '',
          notes: p.notes || '',
          referenceNumber: p.referenceNumber || '',
          specialInstructions: p.specialInstructions || ''
        })));
      }

      if (data.deliveries && data.deliveries.length > 0) {
        setFormDeliveries(data.deliveries.map((d: any) => ({
          facilityName: d.facilityName || '',
          address: d.address || '',
          dateTime: d.dateTime || '',
          contactName: d.contactName || '',
          contactPhone: d.contactPhone || '',
          notes: d.notes || '',
          referenceNumber: d.referenceNumber || '',
          specialInstructions: d.specialInstructions || ''
        })));
      }

      setParseSuccess(`✨ Gemini AI successfully scraped "${parseFile.name}"! Form fields and stops have been auto-populated with precise load, PO, reference details, and temperature guidelines. Please review the details below.`);
    } catch (err: any) {
      console.error("AI parsing error:", err);
      setParseError(err.message || "An unexpected error occurred while parsing. Please try uploading another document or enter details manually.");
    } finally {
      setIsParsing(false);
    }
  };

  // Add Driver Form States
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverCdl, setDriverCdl] = useState('');
  const [driverTruck, setDriverTruck] = useState('');
  const [driverOwnerOperator, setDriverOwnerOperator] = useState('');
  const [driverFormError, setDriverFormError] = useState<string | null>(null);
  const [driverFieldErrors, setDriverFieldErrors] = useState<Record<string, string>>({});

  // Create Load Form States
  const [createLoadError, setCreateLoadError] = useState<string | null>(null);
  const [isSavingLoad, setIsSavingLoad] = useState(false);

  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [loadSearchQuery, setLoadSearchQuery] = useState('');
  const [loadPage, setLoadPage] = useState<number>(1);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archivePage, setArchivePage] = useState<number>(1);

  useEffect(() => {
    setLoadPage(1);
  }, [statusFilter, loadSearchQuery]);

  useEffect(() => {
    setArchivePage(1);
  }, [archiveSearchQuery]);
  const [cleanDataOnly, setCleanDataOnly] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'all' | 'delivered' | 'transit'>('all');
  
  // Driver Manual Location Override states
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedOverrideDriverId, setSelectedOverrideDriverId] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideCity, setOverrideCity] = useState('');
  const [overrideState, setOverrideState] = useState('');
  const [overrideDateTime, setOverrideDateTime] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideMultiLoadEnabled, setOverrideMultiLoadEnabled] = useState(false);
  const [overrideMaximumOpenLoads, setOverrideMaximumOpenLoads] = useState(5);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [showFleetTracker, setShowFleetTracker] = useState(true);

  // Custom Archive Confirmation Modal State
  const [archiveTarget, setArchiveTarget] = useState<{
    type: 'load' | 'driver';
    id: string;
    label: string;
    status?: string;
  } | null>(null);

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;

    if (archiveTarget.type === 'load') {
      if (archiveTarget.status === 'in_transit' || archiveTarget.status === 'delivered') {
        setArchiveTarget(null);
        return;
      }
      onUpdateLoad(archiveTarget.id, {
        status: 'canceled',
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: 'Dispatcher'
      });
    } else if (archiveTarget.type === 'driver') {
      if (!getPermission('legalWaiverRecords')) {
        alert('Access Denied: Your administrator has disabled managing legal waiver / archive records for your dispatcher profile.');
        return;
      }
      await onUpdateUserProfile(archiveTarget.id, {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: 'Dispatcher'
      });
    }
    setArchiveTarget(null);
  };

  const handleOpenOverrideModal = (driverId: string) => {
    const drv = companyDrivers.find(d => d.id === driverId);
    if (drv) {
      setSelectedOverrideDriverId(driverId);
      setOverrideEnabled(drv.manualLocationEnabled || false);
      setOverrideCity(drv.manualCity || '');
      setOverrideState(drv.manualState || '');
      setOverrideDateTime(drv.manualDateTime || '');
      setOverrideNotes(drv.manualNotes || '');
      setOverrideMultiLoadEnabled(drv.multiLoadEnabled ?? false);
      setOverrideMaximumOpenLoads(drv.maximumOpenLoads ?? 5);
      setShowOverrideModal(true);
    }
  };

  const handleOpenGeneralOverrideModal = () => {
    if (companyDrivers.length > 0) {
      const firstDrv = companyDrivers[0];
      setSelectedOverrideDriverId(firstDrv.id);
      setOverrideEnabled(firstDrv.manualLocationEnabled || false);
      setOverrideCity(firstDrv.manualCity || '');
      setOverrideState(firstDrv.manualState || '');
      setOverrideDateTime(firstDrv.manualDateTime || '');
      setOverrideNotes(firstDrv.manualNotes || '');
      setOverrideMultiLoadEnabled(firstDrv.multiLoadEnabled ?? false);
      setOverrideMaximumOpenLoads(firstDrv.maximumOpenLoads ?? 5);
    } else {
      setSelectedOverrideDriverId('');
      setOverrideEnabled(false);
      setOverrideCity('');
      setOverrideState('');
      setOverrideDateTime('');
      setOverrideNotes('');
      setOverrideMultiLoadEnabled(false);
      setOverrideMaximumOpenLoads(5);
    }
    setShowOverrideModal(true);
  };

  const handleOverrideDriverChange = (driverId: string) => {
    setSelectedOverrideDriverId(driverId);
    const drv = companyDrivers.find(d => d.id === driverId);
    if (drv) {
      setOverrideEnabled(drv.manualLocationEnabled || false);
      setOverrideCity(drv.manualCity || '');
      setOverrideState(drv.manualState || '');
      setOverrideDateTime(drv.manualDateTime || '');
      setOverrideNotes(drv.manualNotes || '');
      setOverrideMultiLoadEnabled(drv.multiLoadEnabled ?? false);
      setOverrideMaximumOpenLoads(drv.maximumOpenLoads ?? 5);
    } else {
      setOverrideEnabled(false);
      setOverrideCity('');
      setOverrideState('');
      setOverrideDateTime('');
      setOverrideNotes('');
      setOverrideMultiLoadEnabled(false);
      setOverrideMaximumOpenLoads(5);
    }
  };

  const handleSaveOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOverrideDriverId) {
      alert('Please select a driver.');
      return;
    }
    
    setIsSavingOverride(true);
    try {
      const drv = companyDrivers.find(d => d.id === selectedOverrideDriverId);
      await handleUpdateUserProfileLocal(selectedOverrideDriverId, {
        manualLocationEnabled: overrideEnabled,
        manualCity: overrideEnabled ? overrideCity.trim() : '',
        manualState: overrideEnabled ? overrideState.trim() : '',
        manualDateTime: overrideEnabled ? overrideDateTime.trim() : '',
        manualNotes: overrideEnabled ? overrideNotes.trim() : '',
        multiLoadEnabled: overrideMultiLoadEnabled,
        maximumOpenLoads: overrideMaximumOpenLoads,
        ...(overrideMultiLoadEnabled !== drv?.multiLoadEnabled ? {
          multiLoadEnabledAt: new Date().toISOString(),
          multiLoadEnabledByUid: activeUserObj?.id
        } : {})
      });
      setShowOverrideModal(false);
    } catch (err) {
      console.error("Error saving manual location override: ", err);
      alert("Failed to save location override.");
    } finally {
      setIsSavingOverride(false);
    }
  };
  
  // Helpers and state for secure temporary passwords
  const generateTempPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pass = 'Temp!';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };
  
  const [driverPassword, setDriverPassword] = useState(() => generateTempPassword());
  const [isOnboarding, setIsOnboarding] = useState(false);



  const handleAddDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverFormError(null);
    const newFieldErrors: Record<string, string> = {};

    if (!driverName.trim()) {
      newFieldErrors.driverName = 'Full Name is required.';
    }
    if (!driverEmail.trim()) {
      newFieldErrors.driverEmail = 'Email Address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail.trim())) {
      newFieldErrors.driverEmail = 'Enter a valid email address.';
    }
    if (!driverPassword || driverPassword.length < 6) {
      newFieldErrors.driverPassword = 'Password must be at least 6 characters long.';
    }

    const emailLower = driverEmail.trim().toLowerCase();
    const existing = users.find(u => u.email.toLowerCase() === emailLower);
    if (existing) {
      newFieldErrors.driverEmail = `Email already registered under "${existing.name}".`;
      setDriverFormError(`The email "${driverEmail}" is already registered in the platform under user "${existing.name}" (${existing.role}). Please enter a unique email address.`);
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setDriverFieldErrors(newFieldErrors);
      if (!existing) {
        setDriverFormError('Please resolve the highlighted field errors before submitting.');
      }
      return;
    }

    setDriverFieldErrors({});
    setIsOnboarding(true);

    try {
      await handleAddUserLocal({
        name: driverName.trim(),
        email: emailLower,
        role: 'driver',
        companyId: company.id,
        status: 'active',
        phone: driverPhone.trim() || '(555) 019-2831',
        licenseNumber: driverCdl.trim() || 'CDL-TX-882910',
        truckNumber: driverTruck.trim() || `TRK-${Math.floor(100 + Math.random() * 900)}`,
        ownerOperatorName: driverOwnerOperator.trim(),
      }, driverPassword);

      // Success: Reset fields and close form
      setDriverName('');
      setDriverEmail('');
      setDriverPhone('');
      setDriverCdl('');
      setDriverTruck('');
      setDriverOwnerOperator('');
      setDriverPassword(generateTempPassword());
      setDriverFormError(null);
      setDriverFieldErrors({});
      setShowAddDriver(false);
    } catch (err: any) {
      console.error("CDL driver onboarding error: ", err);
      setDriverFormError(`Onboarding Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsOnboarding(false);
    }
  };

  // Active Company Drivers & Dispatchers
  const companyDrivers = users.filter(u => u.companyId === company.id && u.role === 'driver' && u.status !== 'inactive' && !u.isArchived);
  const filteredDrivers = companyDrivers.filter(drv => {
    const q = driverSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      drv.name.toLowerCase().includes(q) ||
      drv.email.toLowerCase().includes(q) ||
      (drv.phone && drv.phone.toLowerCase().includes(q)) ||
      (drv.ownerOperatorName && drv.ownerOperatorName.toLowerCase().includes(q)) ||
      (drv.truckNumber && drv.truckNumber.toLowerCase().includes(q)) ||
      (drv.licenseNumber && drv.licenseNumber.toLowerCase().includes(q))
    );
  });
  const companyLoads = loads.filter(l => l.companyId === company.id && !l.isArchived);
  const selectedLoad = companyLoads.find(l => l.id === selectedLoadId);

  // Helper to check for duplicate load numbers across the company
  const isLoadNumberDuplicate = (loadNum: string | undefined, currentId: string) => {
    if (!loadNum || !loadNum.trim()) return false;
    const cleanNum = loadNum.trim().toLowerCase();
    return companyLoads.some(l => l.loadNumber?.trim().toLowerCase() === cleanNum && l.id !== currentId);
  };

  // Filtered Loads
  const filteredLoads = companyLoads.filter(l => {
    const q = loadSearchQuery.trim().toLowerCase();
    if (q) {
      // Search globally across all loads when search query exists
      return (
        (l.loadNumber && l.loadNumber.toLowerCase().includes(q)) ||
        (l.id && l.id.toLowerCase().includes(q)) ||
        (l.cargoType && l.cargoType.toLowerCase().includes(q)) ||
        (l.companyName && l.companyName.toLowerCase().includes(q)) ||
        (l.carrierName && l.carrierName.toLowerCase().includes(q)) ||
        (l.pickup && l.pickup.facilityName && l.pickup.facilityName.toLowerCase().includes(q)) ||
        (l.pickup && l.pickup.address && l.pickup.address.toLowerCase().includes(q)) ||
        (l.delivery && l.delivery.facilityName && l.delivery.facilityName.toLowerCase().includes(q)) ||
        (l.delivery && l.delivery.address && l.delivery.address.toLowerCase().includes(q)) ||
        (l.notes && l.notes.toLowerCase().includes(q)) ||
        (l.assignedDriverId && (() => {
          const drvObj = companyDrivers.find(d => d.id === l.assignedDriverId);
          return drvObj ? (
            drvObj.name.toLowerCase().includes(q) ||
            (drvObj.truckNumber && drvObj.truckNumber.toLowerCase().includes(q)) ||
            (drvObj.ownerOperatorName && drvObj.ownerOperatorName.toLowerCase().includes(q))
          ) : false;
        })())
      );
    }
    if (statusFilter === 'all') return true;
    return l.status === statusFilter;
  });

  const loadsPerPage = 25;
  const totalLoadPages = Math.ceil(filteredLoads.length / loadsPerPage);
  const currentLoadPage = Math.min(loadPage, totalLoadPages || 1);
  const startLoadIndex = (currentLoadPage - 1) * loadsPerPage;
  const endLoadIndex = Math.min(filteredLoads.length, currentLoadPage * loadsPerPage);
  const paginatedLoads = filteredLoads.slice(startLoadIndex, endLoadIndex);

  const companyArchivedLoads = loads.filter(l => l.companyId === company.id && l.isArchived);
  const filteredArchivedLoads = companyArchivedLoads.filter(l => {
    if (!archiveSearchQuery.trim()) return true;
    const q = archiveSearchQuery.toLowerCase();
    return (
      (l.loadNumber && l.loadNumber.toLowerCase().includes(q)) ||
      (l.cargoType && l.cargoType.toLowerCase().includes(q)) ||
      (l.id && l.id.toLowerCase().includes(q)) ||
      (l.companyName && l.companyName.toLowerCase().includes(q)) ||
      (l.carrierName && l.carrierName.toLowerCase().includes(q)) ||
      (l.pickup?.facilityName && l.pickup.facilityName.toLowerCase().includes(q)) ||
      (l.pickup?.address && l.pickup.address.toLowerCase().includes(q)) ||
      (l.delivery?.facilityName && l.delivery.facilityName.toLowerCase().includes(q)) ||
      (l.delivery?.address && l.delivery.address.toLowerCase().includes(q))
    );
  });

  const archiveLoadsPerPage = 25;
  const totalArchivePages = Math.ceil(filteredArchivedLoads.length / archiveLoadsPerPage);
  const currentArchivePage = Math.min(archivePage, totalArchivePages || 1);
  const startArchiveIndex = (currentArchivePage - 1) * archiveLoadsPerPage;
  const endArchiveIndex = Math.min(filteredArchivedLoads.length, currentArchivePage * archiveLoadsPerPage);
  const paginatedArchivedLoads = filteredArchivedLoads.slice(startArchiveIndex, endArchiveIndex);

  const handleCreateLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoadError(null);

    if (!cargoType.trim()) {
      setCreateLoadError('Cargo type / commodity is required.');
      return;
    }
    if (formPickups.length === 0 || !formPickups[0].facilityName?.trim() || !formPickups[0].address?.trim()) {
      setCreateLoadError('Please complete the primary Pickup facility name and street address.');
      return;
    }
    if (formDeliveries.length === 0 || !formDeliveries[0].facilityName?.trim() || !formDeliveries[0].address?.trim()) {
      setCreateLoadError('Please complete the primary Delivery facility name and street address.');
      return;
    }

    setIsSavingLoad(true);

    // Process pickups and deliveries, applying defaults
    const processedPickups = formPickups.map((p, idx) => ({
      ...p,
      facilityName: p.facilityName.trim(),
      address: p.address.trim(),
      dateTime: p.dateTime || new Date(Date.now() + 86400000 + (idx * 3600000)).toISOString(),
      contactName: p.contactName || 'Warehouse Shipping',
      contactPhone: p.contactPhone || '(555) 555-0100',
      notes: p.notes || '',
      referenceNumber: p.referenceNumber || '',
      specialInstructions: p.specialInstructions || ''
    }));

    const processedDeliveries = formDeliveries.map((d, idx) => ({
      ...d,
      facilityName: d.facilityName.trim(),
      address: d.address.trim(),
      dateTime: d.dateTime || new Date(Date.now() + 172800000 + (idx * 3600000)).toISOString(),
      contactName: d.contactName || 'Receiving Dock Mgr',
      contactPhone: d.contactPhone || '(555) 555-0120',
      notes: d.notes || '',
      referenceNumber: d.referenceNumber || '',
      specialInstructions: d.specialInstructions || ''
    }));

    // For backwards compatibility with standard single pickup/delivery displays:
    const mainPickup = processedPickups[0];
    const mainDelivery = processedDeliveries[processedDeliveries.length - 1];

    // Combine any parsed temperature with the overall notes
    let finalNotes = notes;
    if (temperature) {
      finalNotes = `[Reefer Temperature: ${temperature}]\n\n${finalNotes}`;
    }

    try {
      await handleAddLoadLocal({
        cargoType,
        companyName,
        carrierName,
        temperature,
        weight: sanitizeNumber(weight, 35000),
        value: sanitizeNumber(value, 90000),
        rate: sanitizeNumber(rate, 2800),
        urgent,
        notes: finalNotes,
        pickup: mainPickup,
        delivery: mainDelivery,
        pickups: processedPickups,
        deliveries: processedDeliveries,
        loadNumber: formLoadNumber ? formLoadNumber.trim() : undefined,
        rcNumber: formLoadNumber ? formLoadNumber.trim() : undefined
      });

      // Reset Form & Close
      setShowCreateLoad(false);
      setCargoType('');
      setCompanyName('');
      setCarrierName('');
      setFormLoadNumber('');
      setTemperature('');
      setFormPickups([
        { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }
      ]);
      setFormDeliveries([
        { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }
      ]);
      
      // Reset AI Parser States
      setParseFile(null);
      setParseError(null);
      setParseSuccess(null);
      setCreateLoadError(null);
    } catch (error) {
      console.error("Failed to register load in Firestore:", error);
      setCreateLoadError('Failed to register new load in the database. Please check your network connection or security permissions.');
    } finally {
      setIsSavingLoad(false);
    }
  };

  const handleOpenCreateLoad = () => {
    setCompanyName('');
    setCarrierName('');
    setCargoType('');
    setWeight(35000);
    setValue(90000);
    setRate(2800);
    setUrgent(false);
    setNotes('');
    setFormLoadNumber('');
    setTemperature('');
    setFormPickups([
      { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }
    ]);
    setFormDeliveries([
      { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }
    ]);
    setParseFile(null);
    setParseError(null);
    setParseSuccess(null);
    setShowCreateLoad(true);
  };

  const handleSendMessageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput && !simulatedFile) return;

    handleSendMessageLocal(
      selectedChatChannel === 'load' ? selectedLoadId || undefined : undefined,
      selectedChatChannel,
      chatInput,
      simulatedFile || undefined,
      simulatedFileUrl || undefined
    );

    setChatInput('');
    setSimulatedFile(null);
    setSimulatedFileUrl(null);

    // Real-time synchronization to assigned driver's workspace (no automated mock replies)
  };

  const handleExportCsv = () => {
    const headers = 'Load Number,Cargo Type,Weight,Rate,Pickup Facility,Delivery Facility,Status\n';
    const rows = companyLoads.map(l => 
      `"${l.loadNumber}","${l.cargoType}",${l.weight},${l.rate},"${l.pickup.facilityName}","${l.delivery.facilityName}","${l.status}"`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `${company.name.replace(/\s+/g, '_')}_Loads_Report.csv`);
    a.click();
  };

  // Converts real-world lat/lng to matching SVG map canvas percentage offsets
  const convertLatLngToPercent = (lat: number, lng: number) => {
    // Standard US coordinate boundary mapping matching our key cities:
    // Lat 49 (top=0%) down to Lat 24 (top=100%)
    // Lng -125 (left=0%) to Lng -66 (left=100%)
    const latMin = 24;
    const latMax = 49;
    const lngMin = -125;
    const lngMax = -66;

    const top = 100 - ((lat - latMin) / (latMax - latMin)) * 100;
    const left = ((lng - lngMin) / (lngMax - lngMin)) * 100;
    
    // clamp between 0 and 100 to guarantee safe rendering within viewport
    return {
      top: Math.max(0, Math.min(100, top)),
      left: Math.max(0, Math.min(100, left))
    };
  };

  // Resolves facility/address to real-world latitude/longitude
  const getCityCoordinates = (facilityName: string, address: string = '') => {
    const combined = `${facilityName} ${address}`.toLowerCase();
    
    const cities: Record<string, { lat: number; lng: number }> = {
      'phoenix': { lat: 33.4484, lng: -112.0740 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'la ': { lat: 34.0522, lng: -118.2437 },
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'seattle': { lat: 47.6062, lng: -122.3321 },
      'denver': { lat: 39.7392, lng: -104.9903 },
      'dallas': { lat: 32.7767, lng: -96.7970 },
      'houston': { lat: 29.7604, lng: -95.3698 },
      'san antonio': { lat: 29.4241, lng: -98.4936 },
      'chicago': { lat: 41.8781, lng: -87.6298 },
      'atlanta': { lat: 33.7490, lng: -84.3880 },
      'miami': { lat: 25.7617, lng: -80.1918 },
      'orlando': { lat: 28.5383, lng: -81.3792 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'nyc': { lat: 40.7128, lng: -74.0060 },
      'boston': { lat: 42.3601, lng: -71.0589 },
      'philadelphia': { lat: 39.9526, lng: -75.1652 },
      'washington': { lat: 38.9072, lng: -77.0369 },
      'charlotte': { lat: 35.2271, lng: -80.8431 },
      'nashville': { lat: 36.1627, lng: -86.7816 },
      'memphis': { lat: 35.1495, lng: -90.0490 },
      'indianapolis': { lat: 39.7684, lng: -86.1581 },
      'columbus': { lat: 39.9612, lng: -82.9988 },
      'detroit': { lat: 42.3314, lng: -83.0458 },
      'minneapolis': { lat: 44.9778, lng: -93.2650 },
      'kansas city': { lat: 39.0997, lng: -94.5786 },
      'st. louis': { lat: 38.6270, lng: -90.1994 },
      'new orleans': { lat: 29.9511, lng: -90.0715 },
      'salt lake': { lat: 40.7608, lng: -111.8910 },
      'las vegas': { lat: 36.1716, lng: -115.1398 },
      'portland': { lat: 45.5152, lng: -122.6784 },
      'albuquerque': { lat: 35.0844, lng: -106.6511 },
      'oklahoma': { lat: 35.4676, lng: -97.5164 },
      'omaha': { lat: 41.2565, lng: -95.9345 },
      'louisville': { lat: 38.2527, lng: -85.7585 },
      'richmond': { lat: 37.5407, lng: -77.4360 },
      'newark': { lat: 40.7357, lng: -74.1724 },
      'hartford': { lat: 41.7637, lng: -72.6851 },
      'providence': { lat: 41.8240, lng: -71.4128 },
      'boise': { lat: 43.6150, lng: -116.2023 },
      'helena': { lat: 46.5891, lng: -112.0391 },
      'cheyenne': { lat: 41.1400, lng: -104.8203 },
      'fargo': { lat: 46.8772, lng: -96.7898 },
      'sioux falls': { lat: 43.5473, lng: -96.7313 },
      'des moines': { lat: 41.5868, lng: -93.6250 },
      'milwaukee': { lat: 43.0389, lng: -87.9065 },
      'birmingham': { lat: 33.5186, lng: -86.8104 },
      'little rock': { lat: 34.7465, lng: -92.2896 },
      'jackson': { lat: 32.2988, lng: -90.1848 },
      'wichita': { lat: 37.6872, lng: -97.3301 },
      'billings': { lat: 45.7833, lng: -108.5007 },
      'cleveland': { lat: 41.4993, lng: -81.6944 },
      'pittsburgh': { lat: 40.4406, lng: -79.9959 },
      'baltimore': { lat: 39.2904, lng: -76.6122 },
      'jacksonville': { lat: 30.3322, lng: -81.6557 },
      'tampa': { lat: 27.9506, lng: -82.4572 },
      'sacramento': { lat: 38.5816, lng: -121.4944 },
      'san diego': { lat: 32.7157, lng: -117.1611 },
      'reno': { lat: 39.5296, lng: -119.8138 },
      'tucson': { lat: 32.2226, lng: -110.9747 },
      'el paso': { lat: 31.7619, lng: -106.4850 },
      'mcallen': { lat: 26.2034, lng: -98.2300 },
      'gary': { lat: 41.5934, lng: -87.3464 },
      'savannah': { lat: 32.0809, lng: -81.0912 },
      'charleston': { lat: 32.7765, lng: -79.9311 },
      'raleigh': { lat: 35.7796, lng: -78.6382 },
      'virginia beach': { lat: 36.8529, lng: -75.9780 },
    };

    const states: Record<string, { lat: number; lng: number }> = {
      'alabama': { lat: 32.3182, lng: -86.9023 },
      'alaska': { lat: 63.5887, lng: -154.4931 },
      'arizona': { lat: 34.0489, lng: -111.0937 },
      'arkansas': { lat: 35.2010, lng: -91.8318 },
      'california': { lat: 36.7783, lng: -119.4179 },
      'colorado': { lat: 39.5501, lng: -105.7821 },
      'connecticut': { lat: 41.6032, lng: -73.0877 },
      'delaware': { lat: 38.9108, lng: -75.5277 },
      'florida': { lat: 27.6648, lng: -81.5158 },
      'georgia': { lat: 32.1656, lng: -82.9001 },
      'hawaii': { lat: 19.8968, lng: -155.5828 },
      'idaho': { lat: 44.0682, lng: -114.7420 },
      'illinois': { lat: 40.6331, lng: -89.3985 },
      'indiana': { lat: 40.2672, lng: -86.1349 },
      'iowa': { lat: 41.8780, lng: -93.0977 },
      'kansas': { lat: 39.0119, lng: -98.4842 },
      'kentucky': { lat: 37.8393, lng: -84.2700 },
      'louisiana': { lat: 31.1695, lng: -91.8678 },
      'maine': { lat: 45.2538, lng: -69.4455 },
      'maryland': { lat: 39.0458, lng: -76.6413 },
      'massachusetts': { lat: 42.4072, lng: -71.3824 },
      'michigan': { lat: 44.3148, lng: -85.6024 },
      'minnesota': { lat: 46.7296, lng: -94.6859 },
      'mississippi': { lat: 32.3547, lng: -89.3985 },
      'missouri': { lat: 37.9643, lng: -91.8318 },
      'montana': { lat: 46.8797, lng: -110.3626 },
      'nebraska': { lat: 41.4925, lng: -99.9018 },
      'nevada': { lat: 38.8026, lng: -116.4194 },
      'new hampshire': { lat: 43.1939, lng: -71.5724 },
      'new jersey': { lat: 40.0583, lng: -74.4057 },
      'new mexico': { lat: 34.5199, lng: -105.8701 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'north carolina': { lat: 35.7596, lng: -79.0193 },
      'north dakota': { lat: 47.5515, lng: -101.0020 },
      'ohio': { lat: 40.4173, lng: -82.9071 },
      'oklahoma': { lat: 35.0078, lng: -97.0929 },
      'oregon': { lat: 43.8041, lng: -120.5542 },
      'pennsylvania': { lat: 41.2033, lng: -77.1945 },
      'rhode island': { lat: 41.5801, lng: -71.4774 },
      'south carolina': { lat: 33.8361, lng: -81.1637 },
      'south dakota': { lat: 44.3106, lng: -99.4312 },
      'tennessee': { lat: 35.5175, lng: -86.5804 },
      'texas': { lat: 31.9686, lng: -99.9018 },
      'utah': { lat: 39.3210, lng: -111.0937 },
      'vermont': { lat: 44.5588, lng: -72.5778 },
      'virginia': { lat: 37.4316, lng: -78.6569 },
      'washington': { lat: 47.7511, lng: -120.7401 },
      'west virginia': { lat: 38.5976, lng: -80.4549 },
      'wisconsin': { lat: 43.7844, lng: -88.7879 },
      'wyoming': { lat: 43.0760, lng: -107.2903 },
    };

    const stateAbbrs: Record<string, { lat: number; lng: number }> = {
      ' tx': { lat: 31.9686, lng: -99.9018 },
      ',tx': { lat: 31.9686, lng: -99.9018 },
      ' ca': { lat: 36.7783, lng: -119.4179 },
      ',ca': { lat: 36.7783, lng: -119.4179 },
      ' ny': { lat: 40.7128, lng: -74.0060 },
      ',ny': { lat: 40.7128, lng: -74.0060 },
      ' fl': { lat: 27.6648, lng: -81.5158 },
      ',fl': { lat: 27.6648, lng: -81.5158 },
      ' il': { lat: 40.6331, lng: -89.3985 },
      ',il': { lat: 40.6331, lng: -89.3985 },
      ' ga': { lat: 32.1656, lng: -82.9001 },
      ',ga': { lat: 32.1656, lng: -82.9001 },
      ' pa': { lat: 41.2033, lng: -77.1945 },
      ',pa': { lat: 41.2033, lng: -77.1945 },
      ' oh': { lat: 40.4173, lng: -82.9071 },
      ',oh': { lat: 40.4173, lng: -82.9071 },
      ' mi': { lat: 44.3148, lng: -85.6024 },
      ',mi': { lat: 44.3148, lng: -85.6024 },
      ' nc': { lat: 35.7596, lng: -79.0193 },
      ',nc': { lat: 35.7596, lng: -79.0193 },
      ' va': { lat: 37.4316, lng: -78.6569 },
      ',va': { lat: 37.4316, lng: -78.6569 },
      ' wa': { lat: 47.7511, lng: -120.7401 },
      ',wa': { lat: 47.7511, lng: -120.7401 },
      ' az': { lat: 34.0489, lng: -111.0937 },
      ',az': { lat: 34.0489, lng: -111.0937 },
      ' ma': { lat: 42.4072, lng: -71.3824 },
      ',ma': { lat: 42.4072, lng: -71.3824 },
      ' in': { lat: 40.2672, lng: -86.1349 },
      ',in': { lat: 40.2672, lng: -86.1349 },
      ' tn': { lat: 35.5175, lng: -86.5804 },
      ',tn': { lat: 35.5175, lng: -86.5804 },
      ' mo': { lat: 37.9643, lng: -91.8318 },
      ',mo': { lat: 37.9643, lng: -91.8318 },
      ' md': { lat: 39.0458, lng: -76.6413 },
      ',md': { lat: 39.0458, lng: -76.6413 },
      ' wi': { lat: 43.7844, lng: -88.7879 },
      ',wi': { lat: 43.7844, lng: -88.7879 },
      ' co': { lat: 39.5501, lng: -105.7821 },
      ',co': { lat: 39.5501, lng: -105.7821 },
      ' mn': { lat: 46.7296, lng: -94.6859 },
      ',mn': { lat: 46.7296, lng: -94.6859 },
      ' sc': { lat: 33.8361, lng: -81.1637 },
      ',sc': { lat: 33.8361, lng: -81.1637 },
      ' al': { lat: 32.3182, lng: -86.9023 },
      ',al': { lat: 32.3182, lng: -86.9023 },
      ' la': { lat: 31.1695, lng: -91.8678 },
      ',la': { lat: 31.1695, lng: -91.8678 },
      ' ky': { lat: 37.8393, lng: -84.2700 },
      ',ky': { lat: 37.8393, lng: -84.2700 },
      ' or': { lat: 43.8041, lng: -120.5542 },
      ',or': { lat: 43.8041, lng: -120.5542 },
      ' ok': { lat: 35.0078, lng: -97.0929 },
      ',ok': { lat: 35.0078, lng: -97.0929 },
    };

    // Check cities first
    for (const [cityName, coord] of Object.entries(cities)) {
      if (combined.includes(cityName)) {
        return coord;
      }
    }

    // Check states
    for (const [stateName, coord] of Object.entries(states)) {
      if (combined.includes(stateName)) {
        return coord;
      }
    }

    // Check abbreviations
    for (const [abbr, coord] of Object.entries(stateAbbrs)) {
      if (combined.includes(abbr)) {
        return coord;
      }
    }

    // Hash fallback
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = combined.charCodeAt(i) + ((hash << 5) - hash);
    }
    const pseudoLat = 30 + Math.abs(hash % 15);
    const pseudoLng = -120 + Math.abs((hash >> 4) % 45);
    return { lat: pseudoLat, lng: pseudoLng };
  };

  // Coordinates mapping on visual map using geoparsing & lat/lng conversion
  const getCityOffset = (facilityName: string, address: string = '') => {
    const coords = getCityCoordinates(facilityName, address);
    return convertLatLngToPercent(coords.lat, coords.lng);
  };

  // Centering & Zoom effect when load is changed
  useEffect(() => {
    if (selectedLoadId && activeTab === 'map') {
      const load = loads.find(l => l.id === selectedLoadId);
      if (load) {
        let targetX = 290;
        let targetY = 160;
        const start = getCityOffset(load.pickup.facilityName, load.pickup.address);
        const end = getCityOffset(load.delivery.facilityName, load.delivery.address);

        if (load.status === 'in_transit') {
          const historyPoints = load.gpsHistory || [];
          let truckX = (start.left + (end.left - start.left) * 0.6) * 5.8;
          let truckY = (start.top + (end.top - start.top) * 0.6) * 3.2;
          if (historyPoints.length > 0) {
            const lastPoint = historyPoints[historyPoints.length - 1];
            const mapped = convertLatLngToPercent(lastPoint.lat, lastPoint.lng);
            truckX = mapped.left * 5.8;
            truckY = mapped.top * 3.2;
          }
          targetX = truckX;
          targetY = truckY;
        } else {
          targetX = ((start.left + end.left) / 2) * 5.8;
          targetY = ((start.top + end.top) / 2) * 3.2;
        }
        setZoomScale(1.8);
        setPanOffset({
          x: 290 - 1.8 * targetX,
          y: 160 - 1.8 * targetY
        });
      }
    }
  }, [selectedLoadId, activeTab]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newScale = zoomScale;
    if (e.deltaY < 0) {
      newScale = Math.min(zoomScale * zoomFactor, 8);
    } else {
      newScale = Math.max(zoomScale / zoomFactor, 0.4);
    }
    setZoomScale(newScale);
  };

  const handleZoomIn = () => {
    setZoomScale(prev => Math.min(prev * 1.25, 8));
  };

  const handleZoomOut = () => {
    setZoomScale(prev => Math.max(prev / 1.25, 0.4));
  };

  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleCenterOnSelectedLoad = () => {
    const load = loads.find(l => l.id === selectedLoadId);
    if (load) {
      let targetX = 290;
      let targetY = 160;
      const start = getCityOffset(load.pickup.facilityName, load.pickup.address);
      const end = getCityOffset(load.delivery.facilityName, load.delivery.address);

      if (load.status === 'in_transit') {
        const historyPoints = (liveLocations && liveLocations.length > 0)
          ? liveLocations
          : (load.gpsHistory || []);

        let truckX = (start.left + (end.left - start.left) * 0.6) * 5.8;
        let truckY = (start.top + (end.top - start.top) * 0.6) * 3.2;
        if (historyPoints.length > 0) {
          const lastPoint = historyPoints[historyPoints.length - 1];
          const mapped = convertLatLngToPercent(lastPoint.lat, lastPoint.lng);
          truckX = mapped.left * 5.8;
          truckY = mapped.top * 3.2;
        }
        targetX = truckX;
        targetY = truckY;
      } else {
        targetX = ((start.left + end.left) / 2) * 5.8;
        targetY = ((start.top + end.top) / 2) * 3.2;
      }
      setZoomScale(2.2);
      setPanOffset({
        x: 290 - 2.2 * targetX,
        y: 160 - 2.2 * targetY
      });
    }
  };

  const renderPagination = (position: 'top' | 'bottom') => {
    const L = filteredLoads.length;
    if (L === 0) return null;
    const totalPages = totalLoadPages;
    const activePageNum = currentLoadPage;

    const startRange = (activePageNum - 1) * loadsPerPage + 1;
    const endRange = Math.min(L, activePageNum * loadsPerPage);

    const pageNumbers: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (activePageNum <= 4) {
        pageNumbers.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (activePageNum >= totalPages - 3) {
        pageNumbers.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pageNumbers.push(1, '...', activePageNum - 1, activePageNum, activePageNum + 1, '...', totalPages);
      }
    }

    const bgClass = pageTheme === 'industrial_terminal' 
      ? 'bg-black text-amber-400 font-mono' 
      : pageTheme === 'cosmic_dark' 
        ? 'bg-slate-900 text-slate-300' 
        : 'bg-white text-slate-600';

    const borderClass = position === 'top'
      ? pageTheme === 'industrial_terminal' ? 'border-b border-amber-500/20' : pageTheme === 'cosmic_dark' ? 'border-b border-slate-800' : 'border-b border-slate-100'
      : pageTheme === 'industrial_terminal' ? 'border-t border-amber-500/20' : pageTheme === 'cosmic_dark' ? 'border-t border-slate-800' : 'border-t border-slate-100';

    const activePageBtnClass = pageTheme === 'industrial_terminal'
      ? 'bg-amber-500 text-black font-extrabold border border-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'bg-purple-600 text-white shadow-sm font-bold'
        : 'bg-indigo-600 text-white font-bold shadow-sm';

    const inactivePageBtnClass = pageTheme === 'industrial_terminal'
      ? 'hover:bg-amber-500/10 text-amber-500/70 hover:text-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
        : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800';

    const navBtnClass = pageTheme === 'industrial_terminal'
      ? 'hover:bg-amber-500/10 text-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'hover:bg-slate-850 text-slate-300 hover:text-white'
        : 'hover:bg-slate-50 text-slate-700 hover:text-slate-950';

    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 ${bgClass} ${borderClass}`}>
        <div className="text-xs font-semibold select-none">
          {startRange}-{endRange} of {L.toLocaleString()} loads
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            disabled={activePageNum === 1}
            onClick={() => setLoadPage(prev => Math.max(1, prev - 1))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${navBtnClass} ${
              activePageNum === 1 ? 'opacity-30 cursor-not-allowed font-medium' : 'cursor-pointer font-bold'
            }`}
          >
            Previous
          </button>

          {pageNumbers.map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ell-${idx}`} className="px-2 py-1 text-xs text-slate-400 select-none font-bold">
                  ...
                </span>
              );
            }
            
            const isSelected = page === activePageNum;
            return (
              <button
                key={`page-${page}`}
                onClick={() => setLoadPage(page as number)}
                className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${
                  isSelected ? activePageBtnClass : inactivePageBtnClass
                }`}
              >
                {page}
              </button>
            );
          })}

          <button
            disabled={activePageNum === totalPages}
            onClick={() => setLoadPage(prev => Math.min(totalPages, prev + 1))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${navBtnClass} ${
              activePageNum === totalPages ? 'opacity-30 cursor-not-allowed font-medium' : 'cursor-pointer font-bold'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderArchivePagination = (position: 'top' | 'bottom') => {
    const L = filteredArchivedLoads.length;
    if (L === 0) return null;
    const totalPages = totalArchivePages;
    const activePageNum = currentArchivePage;

    const startRange = (activePageNum - 1) * archiveLoadsPerPage + 1;
    const endRange = Math.min(L, activePageNum * archiveLoadsPerPage);

    const pageNumbers: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (activePageNum <= 4) {
        pageNumbers.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (activePageNum >= totalPages - 3) {
        pageNumbers.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pageNumbers.push(1, '...', activePageNum - 1, activePageNum, activePageNum + 1, '...', totalPages);
      }
    }

    const bgClass = pageTheme === 'industrial_terminal' 
      ? 'bg-black text-amber-400 font-mono' 
      : pageTheme === 'cosmic_dark' 
        ? 'bg-slate-900 text-slate-300' 
        : 'bg-white text-slate-600';

    const borderClass = position === 'top'
      ? pageTheme === 'industrial_terminal' ? 'border-b border-amber-500/20' : pageTheme === 'cosmic_dark' ? 'border-b border-slate-800' : 'border-b border-slate-100'
      : pageTheme === 'industrial_terminal' ? 'border-t border-amber-500/20' : pageTheme === 'cosmic_dark' ? 'border-t border-slate-800' : 'border-t border-slate-100';

    const activePageBtnClass = pageTheme === 'industrial_terminal'
      ? 'bg-amber-500 text-black font-extrabold border border-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'bg-purple-600 text-white shadow-sm font-bold'
        : 'bg-indigo-600 text-white font-bold shadow-sm';

    const inactivePageBtnClass = pageTheme === 'industrial_terminal'
      ? 'hover:bg-amber-500/10 text-amber-500/70 hover:text-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
        : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800';

    const navBtnClass = pageTheme === 'industrial_terminal'
      ? 'hover:bg-amber-500/10 text-amber-500'
      : pageTheme === 'cosmic_dark'
        ? 'hover:bg-slate-850 text-slate-300 hover:text-white'
        : 'hover:bg-slate-50 text-slate-700 hover:text-slate-950';

    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 ${bgClass} ${borderClass}`}>
        <div className="text-xs font-semibold select-none">
          {startRange}-{endRange} of {L.toLocaleString()} loads
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            disabled={activePageNum === 1}
            onClick={() => setArchivePage(prev => Math.max(1, prev - 1))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${navBtnClass} ${
              activePageNum === 1 ? 'opacity-30 cursor-not-allowed font-medium' : 'cursor-pointer font-bold'
            }`}
          >
            Previous
          </button>

          {pageNumbers.map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ell-arc-${idx}`} className="px-2 py-1 text-xs text-slate-400 select-none font-bold">
                  ...
                </span>
              );
            }
            
            const isSelected = page === activePageNum;
            return (
              <button
                key={`page-arc-${page}`}
                onClick={() => setArchivePage(page as number)}
                className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${
                  isSelected ? activePageBtnClass : inactivePageBtnClass
                }`}
              >
                {page}
              </button>
            );
          })}

          <button
            disabled={activePageNum === totalPages}
            onClick={() => setArchivePage(prev => Math.min(totalPages, prev + 1))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${navBtnClass} ${
              activePageNum === totalPages ? 'opacity-30 cursor-not-allowed font-medium' : 'cursor-pointer font-bold'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // Dynamic Design Elements depending on pageTheme
  const cardClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white shadow-xl' :
    pageTheme === 'industrial_terminal' ? 'bg-black border border-amber-500/30 text-amber-400 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const titleBlockClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white shadow-sm' :
    pageTheme === 'industrial_terminal' ? 'bg-black border-2 border-amber-500 text-amber-500 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const textMutedClass = 
    pageTheme === 'cosmic_dark' ? 'text-slate-400' :
    pageTheme === 'industrial_terminal' ? 'text-amber-600/80' :
    'text-slate-400';

  const textColorClass = 
    pageTheme === 'cosmic_dark' ? 'text-white' :
    pageTheme === 'industrial_terminal' ? 'text-amber-400' :
    'text-slate-800';

  const buttonClass = (isActive: boolean) => {
    if (isActive) {
      return pageTheme === 'cosmic_dark' ? 'bg-purple-600 text-white shadow-sm' :
             pageTheme === 'industrial_terminal' ? 'bg-amber-500 text-black font-extrabold border border-amber-500' :
             'bg-indigo-600 text-white shadow-sm';
    } else {
      return pageTheme === 'cosmic_dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' :
             pageTheme === 'industrial_terminal' ? 'bg-slate-950 text-amber-500/70 border border-amber-500/20 hover:bg-slate-900 hover:text-amber-400' :
             'bg-slate-50 text-slate-600 hover:bg-slate-100';
    }
  };

  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${pageTheme === 'industrial_terminal' ? 'text-amber-400 font-mono bg-black' : ''}`} id="dispatcher-workspace">
      
      {/* Master Announcement Banner */}
      <MasterAnnouncementBanner userRole="dispatcher" />

      {/* Tab bar header */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-2xl p-4 shadow-sm ${titleBlockClass}`}>
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-indigo-50 text-indigo-600'}`}>
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className={`font-heading text-lg font-bold ${textColorClass}`}>Dispatch Command</h2>
            <p className={`text-xs ${textMutedClass}`}>Manage freight schedules, assign CDL operators, visual tracking, and load chats.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSelectedAlertIdForModal(null);
              setShowAlertCenterModal(true);
            }}
            id="tour-breakdown-alerts"
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/60 border border-red-500/50 cursor-pointer ${
              hasActiveBreakdownAlert ? 'animate-pulse' : ''
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-white" />
            <span>
              {activeBreakdownCount > 0
                ? `BREAKDOWN SOS CENTER (${activeBreakdownCount})`
                : 'BREAKDOWN SOS CENTER'}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('loads')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'loads')}`}
          >
            <ClipboardList className="h-3.5 w-3.5" /> Load Board ({companyLoads.length})
          </button>
          <button
            onClick={() => setActiveTab('map')}
            id="tour-gps-tracking"
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'map')}`}
          >
            <MapIcon className="h-3.5 w-3.5" /> GPS Logistics Map
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            id="tour-load-chat"
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'chat')}`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Load Chats
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'reports')}`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Performance Analytics
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'drivers')}`}
          >
            <User className="h-3.5 w-3.5" /> CDL Drivers ({companyDrivers.length})
          </button>
          <button
            onClick={() => setActiveTab('rate_confirmations')}
            id="tour-rate-parser"
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'rate_confirmations')}`}
          >
            <FileText className="h-3.5 w-3.5" /> Rate Confirmations
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'archive')}`}
            id="tab-btn-archived-loads"
          >
            <Archive className="h-3.5 w-3.5" /> Archived Loads ({companyArchivedLoads.length})
          </button>
          <button
            onClick={() => setActiveTab('accounting')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'accounting')}`}
            id="tab-btn-accounting-settlements"
          >
            <Calculator className="h-3.5 w-3.5" /> Financial Operations Center
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'compliance')}`}
            id="tab-btn-compliance-center"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Compliance Center
          </button>
          <button
            onClick={() => setActiveTab('fleet_equipment')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${buttonClass(activeTab === 'fleet_equipment')}`}
            id="tab-btn-fleet-equipment"
          >
            <TruckIcon className="h-3.5 w-3.5 text-emerald-400" /> Fleet & Equipment
          </button>
          <button
            onClick={() => setShowGuidedTour(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 cursor-pointer"
            title="Retake Product Tour"
            id="dispatcher-btn-take-tour-again"
          >
            <Compass className="h-3.5 w-3.5 text-purple-400" />
            <span>Take Tour Again</span>
          </button>
        </div>
      </div>

      {/* Main Container Panels */}
      {activeTab === 'loads' && editingLoadId && (
        (() => {
          const lObj = loads.find(ld => ld.id === editingLoadId);
          return lObj ? (
            <LoadEditWorkspace
              load={lObj}
              onClose={() => setEditingLoadId(null)}
              company={company}
              users={users}
              messages={messages}
              onSendMessage={handleSendMessageLocal}
              onUpdateLoad={onUpdateLoad}
              onAssignDriver={handleAssignDriverLocal}
              onUpdateLoadStatus={onUpdateLoadStatus}
              activeUser={users.find(u => u.id === auth.currentUser?.uid)}
              loads={loads}
              trucks={activeTrucksList}
            />
          ) : null;
        })()
      )}

      {activeTab === 'loads' && !editingLoadId && (
        <div className="space-y-6 animate-[fadeIn_0.2s]">
          
          {/* Real-time Fleet Noticeboard */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-indigo-600 animate-pulse" />
                <div>
                  <h3 className="text-sm font-heading font-bold text-slate-800">
                    Active Fleet Noticeboard
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time driver status, location, load, and availability overview
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleOpenGeneralOverrideModal}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold text-[11px] rounded-xl transition flex items-center gap-1 border border-indigo-100 cursor-pointer"
                >
                  <MapPin className="h-3 w-3" /> Manual Override Status
                </button>
                <button
                  onClick={() => setShowFleetTracker(!showFleetTracker)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  {showFleetTracker ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {showFleetTracker && (() => {
              const filteredNoticeboardDrivers = companyDrivers.filter((driver) => {
                if (!noticeboardSearchQuery.trim()) return true;
                const q = noticeboardSearchQuery.toLowerCase().trim();
                const activeLoads = loads.filter(
                  (l) => l.assignedDriverId === driver.id && ['booked', 'dispatched', 'at_pickup', 'arrived_pickup', 'loaded', 'in_transit', 'at_delivery'].includes(l.status)
                );
                const activeLoad = activeLoads[0];

                const matchName = (driver.name || '').toLowerCase().includes(q);
                const matchTruck = (driver.truckNumber || '').toLowerCase().includes(q);
                const matchPhone = (driver.phone || '').toLowerCase().includes(q);
                const matchEmail = (driver.email || '').toLowerCase().includes(q);
                const matchOO = (driver.ownerOperatorName || '').toLowerCase().includes(q);
                const matchCity = (driver.manualCity || '').toLowerCase().includes(q);
                const matchState = (driver.manualState || '').toLowerCase().includes(q);
                const matchNotes = (driver.manualNotes || '').toLowerCase().includes(q);

                let matchLoad = false;
                if (activeLoad) {
                  matchLoad =
                    (activeLoad.loadNumber || '').toLowerCase().includes(q) ||
                    (activeLoad.cargoType || '').toLowerCase().includes(q) ||
                    (activeLoad.delivery?.facilityName || '').toLowerCase().includes(q) ||
                    (activeLoad.delivery?.address || '').toLowerCase().includes(q) ||
                    (activeLoad.delivery?.dateTime || '').toLowerCase().includes(q);
                }

                return matchName || matchTruck || matchPhone || matchEmail || matchOO || matchCity || matchState || matchNotes || matchLoad;
              });

              const totalNoticeboardDrivers = filteredNoticeboardDrivers.length;
              const totalNoticeboardPages = Math.ceil(totalNoticeboardDrivers / noticeboardRowsPerPage) || 1;
              const currentNoticeboardPage = Math.min(noticeboardPage, totalNoticeboardPages);
              const startNoticeboardIndex = (currentNoticeboardPage - 1) * noticeboardRowsPerPage;
              const endNoticeboardIndex = Math.min(totalNoticeboardDrivers, currentNoticeboardPage * noticeboardRowsPerPage);
              const paginatedNoticeboardDrivers = filteredNoticeboardDrivers.slice(startNoticeboardIndex, endNoticeboardIndex);

              return (
                <div>
                  {/* Search bar bar for Active Fleet Noticeboard */}
                  {companyDrivers.length > 0 && (
                    <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <input
                          type="text"
                          placeholder="Search driver name, truck #, load #, location, delivery ETA..."
                          value={noticeboardSearchQuery}
                          onChange={(e) => {
                            setNoticeboardSearchQuery(e.target.value);
                            setNoticeboardPage(1);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                        />
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        {noticeboardSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setNoticeboardSearchQuery('');
                              setNoticeboardPage(1);
                            }}
                            className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Showing <strong>{totalNoticeboardDrivers}</strong> of {companyDrivers.length} active drivers
                      </span>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    {companyDrivers.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 font-sans">
                        No active company drivers found. Add drivers in the "CDL Drivers" registry to track their delivery statuses.
                      </div>
                    ) : filteredNoticeboardDrivers.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500 font-sans space-y-1">
                        <p className="font-semibold text-slate-700">No active drivers match "{noticeboardSearchQuery}"</p>
                        <p className="text-[11px] text-slate-400">Try searching by driver name, truck #, load #, or location.</p>
                      </div>
                    ) : (
                      <>
                        <table className="w-full text-left border-collapse min-w-[800px] text-xs font-sans">
                          <thead>
                            <tr className="bg-slate-50 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-100">
                              <th className="py-3 px-5 font-semibold">Driver</th>
                              <th className="py-3 px-4 font-semibold">Status</th>
                              <th className="py-3 px-4 font-semibold">Current Load</th>
                              <th className="py-3 px-5 font-semibold">Location</th>
                              <th className="py-3 px-5 font-semibold">Delivery / ETA</th>
                              <th className="py-3 px-4 font-semibold">Availability</th>
                              <th className="py-3 px-4 text-right font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedNoticeboardDrivers.map((driver) => {
                              const activeLoads = loads.filter(
                                (l) => l.assignedDriverId === driver.id && ['booked', 'dispatched', 'at_pickup', 'arrived_pickup', 'loaded', 'in_transit', 'at_delivery'].includes(l.status)
                              );
                              const hasActiveLoad = activeLoads.length > 0;
                              const activeLoad = activeLoads[0];

                              // Calculate visual fields
                              const isManual = driver.manualLocationEnabled;
                              
                              let statusLabel = 'Idle';
                              let statusColor = 'bg-slate-50 text-slate-500 border-slate-200';
                              if (isManual) {
                                statusLabel = 'Manual';
                                statusColor = 'bg-amber-50 text-amber-600 border-amber-200';
                              } else if (hasActiveLoad) {
                                statusLabel = 'Active Load';
                                statusColor = 'bg-emerald-50 text-emerald-600 border-emerald-200';
                              }

                              let loadDisplay = <span className="text-slate-300 font-medium">—</span>;
                              if (hasActiveLoad) {
                                loadDisplay = (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-150 rounded px-1.5 py-0.5 font-bold">
                                      #{activeLoad.loadNumber}
                                    </span>
                                    <span className="text-[9px] text-slate-400 max-w-[80px] truncate">
                                      {activeLoad.cargoType}
                                    </span>
                                  </div>
                                );
                              }

                              let locationDisplay = <span className="text-slate-300 font-medium">—</span>;
                              if (isManual) {
                                locationDisplay = (
                                  <div>
                                    <p className="font-bold text-slate-700 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0"></span>
                                      {driver.manualCity || 'Arizona'}
                                      {driver.manualState ? `, ${driver.manualState}` : ''}
                                    </p>
                                    {driver.manualNotes && (
                                      <p className="text-[10px] text-amber-600 font-sans italic truncate max-w-[200px]" title={driver.manualNotes}>
                                        "{driver.manualNotes}"
                                      </p>
                                    )}
                                  </div>
                                );
                              } else if (hasActiveLoad) {
                                locationDisplay = (
                                  <div className="max-w-[240px]">
                                    <p className="font-bold text-slate-700 flex items-center gap-1 truncate" title={activeLoad.delivery?.facilityName}>
                                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                                      {activeLoad.delivery?.facilityName || 'Delivering'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate" title={activeLoad.delivery?.address}>
                                      {activeLoad.delivery?.address}
                                    </p>
                                  </div>
                                );
                              }

                              let dateDisplay = <span className="text-slate-300 font-medium">—</span>;
                              if (isManual && driver.manualDateTime) {
                                dateDisplay = <span className="text-slate-600 font-medium font-mono">{driver.manualDateTime}</span>;
                              } else if (hasActiveLoad && activeLoad.delivery?.dateTime) {
                                dateDisplay = (
                                  <div className="font-mono text-slate-600 font-medium">
                                    <span>{activeLoad.delivery.dateTime}</span>
                                  </div>
                                );
                              }

                              let availabilityDisplay = (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                  Available
                                </span>
                              );
                              if (hasActiveLoad) {
                                availabilityDisplay = (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                    Busy
                                  </span>
                                );
                              }

                              return (
                                <tr key={driver.id} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-3 px-5">
                                    <div className="flex items-center gap-2">
                                      <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                                        <User className="h-3.5 w-3.5" />
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-slate-850 text-xs">{driver.name}</h4>
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 font-mono">
                                          <span>Truck: {driver.truckNumber || 'N/A'}</span>
                                          <span>•</span>
                                          <span>{driver.phone || 'No phone'}</span>
                                        </div>
                                        {driver.ownerOperatorName && (
                                          <p className="text-[9px] text-indigo-600 font-semibold font-sans">
                                            {driver.ownerOperatorName}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold border ${statusColor}`}>
                                      {statusLabel}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    {loadDisplay}
                                  </td>
                                  <td className="py-3 px-5">
                                    {locationDisplay}
                                  </td>
                                  <td className="py-3 px-5">
                                    {dateDisplay}
                                  </td>
                                  <td className="py-3 px-4">
                                    {availabilityDisplay}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      onClick={() => handleOpenOverrideModal(driver.id)}
                                      className="px-2.5 py-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-100 transition cursor-pointer"
                                    >
                                      Update Status
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Pagination Bar */}
                        {totalNoticeboardDrivers > 0 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 font-sans">
                            <div className="flex items-center gap-3">
                              <span>
                                Showing <strong className="text-slate-800">{totalNoticeboardDrivers === 0 ? 0 : startNoticeboardIndex + 1}</strong> to <strong className="text-slate-800">{endNoticeboardIndex}</strong> of <strong className="text-slate-800">{totalNoticeboardDrivers}</strong> drivers
                              </span>
                              <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                                <span>Per page:</span>
                                <select
                                  value={noticeboardRowsPerPage}
                                  onChange={(e) => {
                                    setNoticeboardRowsPerPage(Number(e.target.value));
                                    setNoticeboardPage(1);
                                  }}
                                  className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                  <option value={5}>5</option>
                                  <option value={10}>10</option>
                                  <option value={20}>20</option>
                                  <option value={50}>50</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={currentNoticeboardPage <= 1}
                                onClick={() => setNoticeboardPage(prev => Math.max(1, prev - 1))}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                              >
                                Previous
                              </button>
                              
                              <div className="flex items-center gap-1 font-mono text-xs">
                                {Array.from({ length: totalNoticeboardPages }, (_, i) => i + 1).map((p) => {
                                  if (
                                    p === 1 ||
                                    p === totalNoticeboardPages ||
                                    (p >= currentNoticeboardPage - 1 && p <= currentNoticeboardPage + 1)
                                  ) {
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setNoticeboardPage(p)}
                                        className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                                          p === currentNoticeboardPage
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        {p}
                                      </button>
                                    );
                                  }
                                  if (
                                    (p === 2 && currentNoticeboardPage > 3) ||
                                    (p === totalNoticeboardPages - 1 && currentNoticeboardPage < totalNoticeboardPages - 2)
                                  ) {
                                    return <span key={p} className="px-1 text-slate-400 font-bold">...</span>;
                                  }
                                  return null;
                                })}
                              </div>

                              <button
                                type="button"
                                disabled={currentNoticeboardPage >= totalNoticeboardPages}
                                onClick={() => setNoticeboardPage(prev => Math.min(totalNoticeboardPages, prev + 1))}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Filtering and Actions */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto self-start">
              {[
                { id: 'all', label: 'All Loads' },
                { id: 'booked', label: 'Booked' },
                { id: 'dispatched', label: 'Dispatched' },
                { id: 'in_transit', label: 'In-Transit' },
                { id: 'delivered', label: 'Delivered' },
              ].map((filterOpt) => (
                <button
                  key={filterOpt.id}
                  onClick={() => setStatusFilter(filterOpt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${statusFilter === filterOpt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {filterOpt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search load identifier, broker, cargo..."
                  value={loadSearchQuery}
                  onChange={(e) => setLoadSearchQuery(e.target.value)}
                  className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl pl-8 pr-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm font-sans"
                />
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>

              <button
                onClick={handleOpenCreateLoad}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow transition shrink-0"
              >
                <PlusCircle className="h-4 w-4" /> Schedule New Load
              </button>
            </div>
          </div>

          {/* Loads Listing */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {renderPagination('top')}
            
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[800px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider font-mono text-slate-500 border-b">
                  <tr>
                    <th className="p-4 w-12 text-center">#</th>
                    <th className="p-4">Load Identifier</th>
                    <th className="p-4">Stops (Pickup ➔ Dropoff)</th>
                    <th className="p-4">Cargo Description</th>
                    <th className="p-4">Contract Rate</th>
                    <th className="p-4">CDL Operator</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Routing Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {paginatedLoads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 font-medium">No loads found matching this criteria.</td>
                    </tr>
                  ) : (
                    paginatedLoads.map((l, idx) => (
                      <tr 
                        key={l.id} 
                        onClick={() => setEditingLoadId(l.id)}
                        className={`hover:bg-indigo-50/20 cursor-pointer transition ${l.id === selectedLoadId ? 'bg-indigo-50/10' : ''}`}
                      >
                        <td className="p-4 font-semibold font-mono text-slate-400 text-center bg-slate-50/40">
                          {startLoadIndex + idx + 1}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateLoad(l.id, { flagged: !l.flagged });
                              }}
                              className={`p-1 rounded hover:bg-slate-100 transition shrink-0 ${l.flagged ? 'text-red-500 hover:text-red-600' : 'text-slate-300 hover:text-slate-400'}`}
                              title={l.flagged ? "Flagged: Action Required" : "Flag this load"}
                            >
                              <Flag className={`h-4 w-4 ${l.flagged ? 'fill-red-500' : ''}`} />
                            </button>
                            <span className="font-mono text-sm font-bold text-slate-800">{l.loadNumber}</span>
                            {(l.criticalAlertActive || l.criticalAlertStatus === 'open' || l.criticalAlertStatus === 'acknowledged') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAlertIdForModal(l.criticalAlertId || null);
                                  setShowAlertCenterModal(true);
                                }}
                                className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-red-600 text-white border border-red-400 animate-pulse flex items-center gap-1 shadow-md shadow-red-950 cursor-pointer"
                                title="Driver reported critical breakdown! Click to view alert thread."
                              >
                                <ShieldAlert className="h-3 w-3 text-white shrink-0" />
                                <span>CRITICAL BREAKDOWN</span>
                              </button>
                            )}
                            {l.urgent && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-red-100 text-red-700 border border-red-200 animate-pulse">
                                Urgent
                              </span>
                            )}
                            {isLoadNumberDuplicate(l.loadNumber, l.id) && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse flex items-center gap-1" title="Duplicate load number detected in system!">
                                <ShieldAlert className="h-3 w-3 text-amber-600 shrink-0" /> Duplicate
                              </span>
                            )}
                            {l.podStatus !== 'approved' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 animate-pulse flex items-center gap-1" title="POD is not yet approved by Dispatch/Admin!">
                                <FileText className="h-3 w-3 text-amber-700 shrink-0" /> POD Unapproved
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-0.5 mt-1">
                            <span>ID: {l.id}</span>
                            {l.createdAt && (
                              <span className="text-indigo-600 font-semibold" id={`load-created-at-${l.id}`}>
                                Booked: {new Date(l.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            )}
                          </div>
                          {l.companyName && (
                            <span className="text-[10px] text-indigo-700 font-extrabold block mt-1 bg-indigo-50 px-1 py-0.5 rounded w-fit border border-indigo-100">Broker: {l.companyName}</span>
                          )}
                          {l.carrierName && (
                            <span className="text-[10px] text-indigo-800 font-semibold block mt-1 bg-indigo-50/50 px-1 py-0.5 rounded w-fit border border-indigo-50">Carrier: {l.carrierName}</span>
                          )}
                        </td>
                        <td className="p-4 max-w-xs">
                          <div className="flex items-start gap-2">
                            <div className="text-indigo-600 font-bold text-xs shrink-0 mt-0.5">PU:</div>
                            <div>
                              <div className="font-bold text-slate-800 text-xs leading-tight">{l.pickup.facilityName}</div>
                              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.pickup.address}</div>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 mt-2.5">
                            <div className="text-emerald-600 font-bold text-xs shrink-0 mt-0.5">DO:</div>
                            <div>
                              <div className="font-bold text-slate-800 text-xs leading-tight">{l.delivery.facilityName}</div>
                              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.delivery.address}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-800">{l.cargoType}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{formatWeight(l.weight)} | Val: {formatCurrency(l.value)}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-900 text-sm">
                          {formatCurrency(l.rate)}
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          {l.assignedDriverId ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-800 font-semibold">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{companyDrivers.find(d => d.id === l.assignedDriverId)?.name}</span>
                            </div>
                          ) : (
                            <select
                              onChange={(e) => handleAssignDriverLocal(l.id, e.target.value)}
                              className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold py-1 px-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              defaultValue=""
                            >
                              <option value="" disabled>⚠️ Assign Driver</option>
                              {companyDrivers.map((drv) => {
                                const isDriverOnboarding = (drv.lifecycleStatus || drv.status) === 'onboarding';
                                const isDriverSuspended = (drv.lifecycleStatus || drv.status) === 'suspended';
                                
                                const drvTruck = activeTrucksList.find(t => 
                                  (drv.currentTruckId && t.id === drv.currentTruckId) ||
                                  (drv.truckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(drv.truckNumber).trim().toUpperCase()) ||
                                  (drv.assignedTruck && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(drv.assignedTruck).trim().toUpperCase())
                                );
                                const drvPmGuard = drvTruck ? checkTruckPmGuard(drvTruck) : null;
                                const pmTag = drvPmGuard?.isBlocked ? ' ⛔ DISPATCH BLOCKED' : drvPmGuard?.isOverdueOrDue ? ' ⚠️ PM OVERDUE' : '';

                                const labelSuffix = isDriverOnboarding ? ' (⚠️ ONBOARDING - Awaiting Activation)' : isDriverSuspended ? ' (⛔ SUSPENDED)' : ` - ${drv.dutyStatus || 'Off Duty'}`;
                                return (
                                  <option key={drv.id} value={drv.id}>
                                    {drv.name} ({drv.truckNumber || 'No Truck'}{pmTag}){labelSuffix}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            l.status === 'booked' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            l.status === 'dispatched' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            l.status === 'in_transit' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                            'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              l.status === 'booked' ? 'bg-blue-500' :
                              l.status === 'dispatched' ? 'bg-amber-500' :
                              l.status === 'in_transit' ? 'bg-indigo-500 animate-pulse' :
                              'bg-emerald-500'
                            }`}></span>
                            {l.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedLoadId(l.id);
                                setActiveTab('chat');
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded border transition"
                              title="Open Load Chat log"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLoadId(l.id);
                                setActiveTab('map');
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded border transition"
                              title="Track GPS Path on Map"
                            >
                              <MapIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setArchiveTarget({
                                  type: 'load',
                                  id: l.id,
                                  label: `load #${l.loadNumber || l.id}`,
                                  status: l.status
                                });
                              }}
                              className={`p-1.5 rounded border transition cursor-pointer ${
                                l.status === 'in_transit' || l.status === 'delivered'
                                  ? "text-slate-400 bg-slate-100/80 hover:bg-slate-200/80 border-slate-200"
                                  : "text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border-slate-200"
                              }`}
                              title={
                                l.status === 'in_transit' || l.status === 'delivered'
                                  ? `Cannot archive active/completed load (${l.status.replace('_', ' ')})`
                                  : "Archive Load"
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {renderPagination('bottom')}
          </div>

        </div>
      )}

      {activeTab === 'map' && (
        !getPermission('gpsTracking') ? (
          <PermissionLockedScreen
            title="GPS Logistics Tracking Disabled"
            description="Real-time geo-coordinates, map overlays, vehicle speed indicators, and transit history are locked."
            permissionName="gpsTracking"
          />
        ) : !planFeatures.gpsTracking ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-2xl mx-auto my-12 space-y-6" id="gps-locked-screen">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 font-bold text-xl mx-auto border border-amber-200 shadow-sm">
              <Sparkles className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-800">Live GPS Tracking is a Premium Feature</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Live GPS tracking, driver route maps, and real-time consent workflows require a <strong>Premium Plan ($159.99/mo)</strong>.
              </p>
            </div>
            {isTenantAdminOrSuperAdmin ? (
              <div className="p-4 bg-purple-50 rounded-xl max-w-sm mx-auto border border-purple-100 space-y-2">
                <p className="text-xs text-purple-900 font-semibold">Ready to unlock live GPS tracking & AI automation?</p>
                <button
                  type="button"
                  onClick={() => {
                    alert('To upgrade to Premium Plan, go to Admin Dashboard -> SaaS Subscription Plan.');
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow transition"
                >
                  Upgrade to Premium ($159.99/mo)
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl max-w-sm mx-auto border border-slate-200 text-xs text-slate-600 font-medium">
                📞 Please request a plan upgrade from your Tenant Admin to activate GPS tracking.
              </div>
            )}
          </div>
        ) : !company?.gpsTrackingEnabled ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-2xl mx-auto my-12 space-y-6" id="gps-locked-screen">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-xl mx-auto border border-indigo-100">
              📡
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-800">GPS Load Tracking Offline</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                This premium feature is disabled under your company's software subscription. If you want to enable real-time GPS load tracking, high-fidelity routing telemetry, and live commercial maps, please contact your administrator.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl max-w-sm mx-auto border border-slate-100 text-xs text-slate-600 font-medium">
              📞 To enable the GPS tracking service, call your Admin.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-[fadeIn_0.2s]">
          {/* Map Sidebar (Left 4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b pb-3">
                <h3 className="font-heading font-bold text-sm text-slate-800">Fleet Route Tracker</h3>
                <p className="text-xs text-slate-400 mt-1">Select an active in-transit load to visualize live GPS polling.</p>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {companyLoads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLoadId(l.id)}
                    className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 ${
                      selectedLoadId === l.id
                        ? 'border-indigo-500 bg-indigo-50/20'
                        : 'border-slate-100 hover:border-slate-200 bg-slate-50/40'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800">{l.loadNumber}</span>
                        {isLoadNumberDuplicate(l.loadNumber, l.id) && (
                          <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200" title="Duplicate load number detected in system!">
                            Duplicate
                          </span>
                        )}
                        {l.podStatus !== 'approved' && (
                          <span className="px-1 py-0.5 rounded text-[7px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300" title="POD is not yet approved by Dispatch/Admin">
                            POD Unapproved
                          </span>
                        )}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                        l.status === 'in_transit' ? 'bg-indigo-100 text-indigo-700 animate-pulse' :
                        l.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {l.status}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-slate-500 font-medium leading-normal">
                      Route: {l.pickup.facilityName.split(' ')[0]} ➔ {l.delivery.facilityName.split(' ')[0]}
                    </div>
                    {l.gpsTrackingRequired !== false && l.currentGps && (
                      <div className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
                        <Compass className="h-3 w-3 text-indigo-500" />
                        <span>GPS Lat/Lng: {l.currentGps.lat.toFixed(4)}, {l.currentGps.lng.toFixed(4)}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {selectedLoad && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-heading text-xs font-bold text-slate-800 uppercase tracking-wide">Tracking Telemetry</h4>
                
                {isLoadNumberDuplicate(selectedLoad.loadNumber, selectedLoad.id) && (
                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex items-start gap-2 text-[10.5px] text-amber-800 font-semibold shadow-xs">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Warning: Duplicate Load Number detected in system!</span>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-sans">CARGO TYPE</span>
                    <strong className="text-slate-800 block text-[10px] mt-0.5">{selectedLoad.cargoType}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block font-sans">FLEET WEIGHT</span>
                    <strong className="text-slate-800 block text-[10px] mt-0.5">{formatWeight(selectedLoad.weight)}</strong>
                  </div>
                  {selectedLoad.companyName && (
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 block font-sans">BROKER / SHIPPER</span>
                      <strong className="text-indigo-700 block text-[10px] mt-0.5">{selectedLoad.companyName}</strong>
                    </div>
                  )}
                  {selectedLoad.carrierName && (
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 block font-sans">CARRIER COMPANY</span>
                      <strong className="text-indigo-800 block text-[10px] mt-0.5">{selectedLoad.carrierName}</strong>
                    </div>
                  )}
                  {selectedLoad.temperature && (
                    <div className="mt-1 col-span-2">
                      <span className="text-[9px] text-slate-400 block font-sans">REQUIRED TEMP (REEFER)</span>
                      <strong className="text-rose-600 block text-[10px] mt-0.5">❄️ {selectedLoad.temperature}</strong>
                    </div>
                  )}
                  <div className="mt-2 col-span-2">
                    <span className="text-[9px] text-slate-400 block font-sans">CURRENT LOCATION POLLING</span>
                    {selectedLoad.gpsTrackingRequired === false ? (
                      <strong className="text-slate-500 block text-[10px] mt-0.5">
                        Disabled (GPS Tracking Toggle OFF)
                      </strong>
                    ) : selectedLoad.currentGps && selectedLoad.gpsConsentAccepted ? (
                      <strong className="text-emerald-600 block text-[10px] mt-0.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                        Active: {selectedLoad.currentGps.lat.toFixed(5)}°N, {selectedLoad.currentGps.lng.toFixed(5)}°W
                      </strong>
                    ) : (
                      <strong className="text-amber-600 block text-[10px] mt-0.5">Offline (Consent Pending)</strong>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Map Viewer Visualizer (Right 8 cols) */}
          <div className="lg:col-span-8 bg-slate-900 rounded-2xl p-5 border border-slate-800 text-white min-h-[480px] flex flex-col justify-between relative shadow-xl overflow-hidden">
            
            {/* Map Header & Multi-Mode Toggle */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4 mb-4 z-20">
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-xs font-mono text-indigo-400 font-semibold tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  FLEET TELEMETRY ENGINE
                </span>
                <h3 className="text-base font-bold text-slate-100 font-heading tracking-tight mt-1">
                  {mapMode === 'real' ? 'Google Maps Live Tracking' : 'Offline High-Fidelity Vector Map'}
                </h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Mode Selector */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setMapMode('mock')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mapMode === 'mock' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    🗺️ Vector Map
                  </button>
                  {hasValidKeyResolved && (
                    <button
                      type="button"
                      onClick={() => setMapMode('real')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mapMode === 'real' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🌐 Google Map
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Map Container Area */}
            <div className="relative flex-grow flex items-center justify-center rounded-xl bg-slate-950 border border-slate-800 overflow-hidden h-[380px] w-full">
              
              {mapMode === 'real' && hasValidKeyResolved ? (
                /* Google Maps Active Mode */
                <APIProvider apiKey={resolvedMapsKey} version="weekly">
                  <GoogleMap
                    style={{ width: '100%', height: '100%' }}
                    defaultCenter={{ lat: 39.8283, lng: -98.5795 }} // Center of USA
                    defaultZoom={4}
                    mapId="DISPATCH_MAP_ID"
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  >
                    {selectedLoad && (() => {
                      const startCoords = getCityCoordinates(selectedLoad.pickup.facilityName, selectedLoad.pickup.address);
                      const endCoords = getCityCoordinates(selectedLoad.delivery.facilityName, selectedLoad.delivery.address);
                      const historyPoints = (liveLocations && liveLocations.length > 0)
                        ? liveLocations
                        : (selectedLoad.gpsHistory || []);
                      
                      let truckCoords = null;
                      if (selectedLoad.status === 'in_transit') {
                        if (historyPoints.length > 0) {
                          const lastPoint = historyPoints[historyPoints.length - 1];
                          truckCoords = { lat: lastPoint.lat, lng: lastPoint.lng };
                        } else {
                          truckCoords = {
                            lat: startCoords.lat + (endCoords.lat - startCoords.lat) * 0.6,
                            lng: startCoords.lng + (endCoords.lng - startCoords.lng) * 0.6
                          };
                        }
                      }

                      const pathPoints = historyPoints.map(p => ({ lat: p.lat, lng: p.lng }));
                      if (pathPoints.length === 0) {
                        pathPoints.push(startCoords);
                        pathPoints.push(endCoords);
                      }

                      return (
                        <>
                          {/* Pickup Marker */}
                          <AdvancedMarker position={startCoords} title={`PICKUP: ${selectedLoad.pickup.facilityName}`}>
                            <Pin background="#818cf8" borderColor="#4f46e5" glyphColor="#ffffff" glyph="P" />
                          </AdvancedMarker>

                          {/* Delivery Marker */}
                          <AdvancedMarker position={endCoords} title={`DELIVERY: ${selectedLoad.delivery.facilityName}`}>
                            <Pin background="#10b981" borderColor="#059669" glyphColor="#ffffff" glyph="D" />
                          </AdvancedMarker>

                          {/* Pulsing Active Truck */}
                          {truckCoords && (
                            <AdvancedMarker position={truckCoords} title="ACTIVE DISPATCHED TRUCK">
                              <div className="relative flex items-center justify-center cursor-pointer">
                                <div className="absolute h-10 w-10 bg-purple-500/40 rounded-full animate-ping" />
                                <div className="bg-purple-600 border border-white text-white p-2 rounded-full shadow-lg text-xs font-bold flex items-center justify-center">
                                  🚚
                                </div>
                              </div>
                            </AdvancedMarker>
                          )}

                          {/* Route Polyline */}
                          <MapPolyline
                            path={pathPoints}
                            strokeColor={selectedLoad.status === 'in_transit' ? '#a855f7' : '#818cf8'}
                            strokeWidth={4}
                            dashed={historyPoints.length === 0}
                          />
                        </>
                      );
                    })()}
                  </GoogleMap>
                </APIProvider>
              ) : (
                /* Google Maps Styled offline Fallback vector map (Beautiful details) */
                <div 
                  className="relative w-full h-full select-none overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  onWheel={handleWheel}
                >
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none flex flex-wrap">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="w-16 h-16 border-t border-l border-slate-500 font-mono text-[7px] text-slate-600 p-1">
                        GPS_G{i}
                      </div>
                    ))}
                  </div>

                  <svg className="w-full h-full text-slate-800" viewBox="0 0 580 320" preserveAspectRatio="xMidYMid slice">
                    <g 
                      transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomScale})`} 
                      style={{ transformOrigin: '290px 160px', transition: isPanning ? 'none' : 'transform 0.15s ease-out' }}
                    >
                      {/* Earth Pasture base terrain */}
                      <rect width="580" height="320" fill="#dbecd2" />
                      
                      {/* Oceans & Great Lakes blue water */}
                      <path d="M0,0 Q40,90 25,200 T0,320 L0,0 Z" fill="#aad3df" opacity="0.9" />
                      <path d="M580,0 Q545,90 555,200 T580,320 L580,0 Z" fill="#aad3df" opacity="0.9" />
                      <path d="M120,320 Q240,285 380,305 T520,320 Z" fill="#aad3df" opacity="0.9" />

                      {/* Great Lakes shapes */}
                      <ellipse cx="420" cy="40" rx="22" ry="10" fill="#aad3df" stroke="#8cb9ca" strokeWidth="0.5" />
                      <ellipse cx="445" cy="72" rx="9" ry="20" fill="#aad3df" stroke="#8cb9ca" strokeWidth="0.5" />
                      <ellipse cx="475" cy="65" rx="13" ry="14" fill="#aad3df" stroke="#8cb9ca" strokeWidth="0.5" />
                      <ellipse cx="505" cy="85" rx="14" ry="5" fill="#aad3df" stroke="#8cb9ca" strokeWidth="0.5" />
                      <ellipse cx="528" cy="78" rx="10" ry="4" fill="#aad3df" stroke="#8cb9ca" strokeWidth="0.5" />

                      {/* National Parks Green Spots */}
                      <rect x="150" y="60" width="28" height="22" rx="4" fill="#c1dfb7" stroke="#afdfa7" strokeWidth="0.5" opacity="0.8" />
                      <rect x="90" y="170" width="26" height="18" rx="4" fill="#c1dfb7" stroke="#afdfa7" strokeWidth="0.5" opacity="0.8" />
                      <rect x="465" y="180" width="22" height="14" rx="3" fill="#c1dfb7" stroke="#afdfa7" strokeWidth="0.5" opacity="0.8" />

                      {/* Major Highways underlays (thick orange lines) */}
                      <path d="M20,110 L560,110" fill="none" stroke="#f5b041" strokeWidth="2.5" opacity="0.85" />
                      <path d="M20,65 L560,75" fill="none" stroke="#f5b041" strokeWidth="2" opacity="0.8" />
                      <path d="M20,210 L560,210" fill="none" stroke="#eb984e" strokeWidth="2.5" opacity="0.85" />
                      <path d="M20,280 L560,290" fill="none" stroke="#eb984e" strokeWidth="2.5" opacity="0.85" />
                      <path d="M530,30 L550,320" fill="none" stroke="#f4d03f" strokeWidth="2" opacity="0.8" />
                      <path d="M35,30 L30,320" fill="none" stroke="#f4d03f" strokeWidth="2" opacity="0.8" />

                      {/* Highway Shields overlay (interstate labels) */}
                      <g transform="translate(180, 103) scale(0.5)">
                        <path d="M5,1 L15,1 L18,5 Q18,12 10,18 Q2,12 2,5 Z" fill="#0d47a1" stroke="#ffffff" strokeWidth="1" />
                        <text x="10" y="11" fill="#ffffff" textAnchor="middle" className="text-[7.5px] font-extrabold font-sans">80</text>
                      </g>
                      <g transform="translate(320, 203) scale(0.5)">
                        <path d="M5,1 L15,1 L18,5 Q18,12 10,18 Q2,12 2,5 Z" fill="#0d47a1" stroke="#ffffff" strokeWidth="1" />
                        <text x="10" y="11" fill="#ffffff" textAnchor="middle" className="text-[7.5px] font-extrabold font-sans">40</text>
                      </g>
                      <g transform="translate(120, 273) scale(0.5)">
                        <path d="M5,1 L15,1 L18,5 Q18,12 10,18 Q2,12 2,5 Z" fill="#0d47a1" stroke="#ffffff" strokeWidth="1" />
                        <text x="10" y="11" fill="#ffffff" textAnchor="middle" className="text-[7.5px] font-extrabold font-sans">10</text>
                      </g>
                      
                      {/* Cities Labels & Dots */}
                      {[
                        { name: 'Chicago, IL', top: 38, left: 62 },
                        { name: 'Dallas, TX', top: 70, left: 42 },
                        { name: 'Houston, TX', top: 82, left: 45 },
                        { name: 'St. Louis, MO', top: 52, left: 58 },
                        { name: 'Atlanta, GA', top: 68, left: 74 },
                        { name: 'Seattle, WA', top: 12, left: 10 },
                        { name: 'Los Angeles, CA', top: 62, left: 6 },
                        { name: 'New York, NY', top: 35, left: 91 },
                      ].map((city, i) => (
                        <g key={i} transform={`translate(${(city.left * 5.8)}, ${(city.top * 3.2)})`}>
                          <circle r="3" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
                          <text x="6" y="3.5" fill="#334155" className="text-[8.5px] font-sans font-bold select-none" pointerEvents="none">
                            {city.name}
                          </text>
                        </g>
                      ))}

                      {/* If selected load is plotted, draw planned path & history */}
                      {selectedLoad && (
                        <>
                          {/* Planned routing path (dashed purple line) */}
                          {(() => {
                            const start = getCityOffset(selectedLoad.pickup.facilityName, selectedLoad.pickup.address);
                            const end = getCityOffset(selectedLoad.delivery.facilityName, selectedLoad.delivery.address);
                            
                            return (
                              <g>
                                <line
                                  x1={start.left * 5.8}
                                  y1={start.top * 3.2}
                                  x2={end.left * 5.8}
                                  y2={end.top * 3.2}
                                  stroke="#6366f1"
                                  strokeWidth="3.5"
                                  strokeDasharray="6 4"
                                  className="opacity-75"
                                />
                                
                                {/* Highlight Active Node: Pickup */}
                                <g className="cursor-pointer group">
                                  <circle cx={start.left * 5.8} cy={start.top * 3.2} r="7.5" fill="#818cf8" stroke="#ffffff" strokeWidth="2" className="group-hover:scale-125 transition-transform" />
                                  <text x={start.left * 5.8 - 25} y={start.top * 3.2 - 12} fill="#ffffff" className="text-[8px] font-extrabold uppercase bg-indigo-900 border border-indigo-700 px-1.5 py-0.5 rounded font-mono group-hover:bg-indigo-700">
                                    PICKUP
                                  </text>
                                  <title>{selectedLoad.pickup.facilityName}&#10;{selectedLoad.pickup.address}</title>
                                </g>

                                {/* Highlight Active Node: Delivery */}
                                <g className="cursor-pointer group">
                                  <circle cx={end.left * 5.8} cy={end.top * 3.2} r="7.5" fill="#10b981" stroke="#ffffff" strokeWidth="2" className="group-hover:scale-125 transition-transform" />
                                  <text x={end.left * 5.8 - 25} y={end.top * 3.2 - 12} fill="#ffffff" className="text-[8px] font-extrabold uppercase bg-emerald-900 border border-emerald-700 px-1.5 py-0.5 rounded font-mono group-hover:bg-emerald-700">
                                    DELIVERY
                                  </text>
                                  <title>{selectedLoad.delivery.facilityName}&#10;{selectedLoad.delivery.address}</title>
                                </g>

                                {/* Real-time Traveled Path Polyline (if we have GPS history points) */}
                                {(() => {
                                  const historyPoints = (liveLocations && liveLocations.length > 0)
                                    ? liveLocations
                                    : (selectedLoad.gpsHistory || []);

                                  if (historyPoints.length < 2) return null;

                                  const pointsString = historyPoints.map(p => {
                                    const mapped = convertLatLngToPercent(p.lat, p.lng);
                                    return `${mapped.left * 5.8},${mapped.top * 3.2}`;
                                  }).join(' ');

                                  return (
                                    <polyline
                                      points={pointsString}
                                      fill="none"
                                      stroke="#a855f7"
                                      strokeWidth="4.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="opacity-95"
                                    />
                                  );
                                })()}

                                {/* Pulsing Active Truck Indicator or simulated mid-path if In-Transit */}
                                {selectedLoad.status === 'in_transit' && (() => {
                                  const historyPoints = (liveLocations && liveLocations.length > 0)
                                    ? liveLocations
                                    : (selectedLoad.gpsHistory || []);

                                  let truckX = (start.left + (end.left - start.left) * 0.6) * 5.8;
                                  let truckY = (start.top + (end.top - start.top) * 0.6) * 3.2;

                                  if (historyPoints.length > 0) {
                                    const lastPoint = historyPoints[historyPoints.length - 1];
                                    const mapped = convertLatLngToPercent(lastPoint.lat, lastPoint.lng);
                                    truckX = mapped.left * 5.8;
                                    truckY = mapped.top * 3.2;
                                  }

                                  const driverUser = users.find(u => u.id === selectedLoad.assignedDriverId);
                                  const driverName = driverUser ? driverUser.name.split(' ')[0].toUpperCase() : 'DRIVER';

                                  return (
                                    <g transform={`translate(${truckX}, ${truckY})`} className="cursor-pointer group">
                                      <circle r="15" fill="rgba(168,85,247,0.35)" className="animate-ping" />
                                      <circle r="8" fill="#a855f7" stroke="#ffffff" strokeWidth="2" />
                                      <text x="-4" y="3.5" fill="#ffffff" className="text-[10px] font-bold">🚚</text>
                                      <rect x="-35" y="-24" width="70" height="14" rx="3" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="1" className="opacity-95 shadow-md" />
                                      <text x="-31" y="-14" fill="#e0e7ff" className="text-[8px] font-mono font-semibold">{driverName} (TRK)</text>
                                      <title>Driver: {driverUser?.name || 'Assigned Driver'}&#10;Truck: {driverUser?.truckNumber || 'N/A'}&#10;Status: {selectedLoad.status.toUpperCase()}</title>
                                    </g>
                                  );
                                })()}
                                
                                {/* Truck at delivery if Delivered */}
                                {selectedLoad.status === 'delivered' && (
                                  <g transform={`translate(${(end.left * 5.8)}, ${(end.top * 3.2)})`}>
                                    <circle r="14" fill="rgba(16,185,129,0.35)" className="animate-pulse" />
                                    <text x="10" y="15" fill="#059669" className="text-[9px] font-extrabold bg-emerald-50 px-1.5 py-0.5 border border-emerald-300 rounded text-slate-850">ARRIVED</text>
                                  </g>
                                )}
                              </g>
                            );
                          })()}
                        </>
                      )}
                    </g>
                  </svg>

                      {/* Elegant Zoom and Navigation Controls Overlay */}
                      <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-20">
                        <button
                          type="button"
                          onClick={handleZoomIn}
                          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 border border-slate-700 rounded-xl text-white shadow-lg transition flex items-center justify-center cursor-pointer"
                          title="Zoom In"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleZoomOut}
                          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 border border-slate-700 rounded-xl text-white shadow-lg transition flex items-center justify-center cursor-pointer"
                          title="Zoom Out"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleResetZoom}
                          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 border border-slate-700 rounded-xl text-white shadow-lg transition flex items-center justify-center cursor-pointer"
                          title="Reset View"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        {selectedLoad && (
                          <button
                            type="button"
                            onClick={handleCenterOnSelectedLoad}
                            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded-xl text-white shadow-lg transition flex items-center justify-center cursor-pointer"
                            title="Focus Active Route / Truck"
                          >
                            <Locate className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Map bottom stats */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-3 border-t border-slate-900 gap-2 z-10">
                  <div className="text-[11px] text-slate-500 font-mono">
                    System telemetry connected to Firestore path: <span className="text-purple-400 font-semibold">/loads/{selectedLoadId || '*'}</span>
                  </div>
                  <div className="text-xs font-sans text-indigo-400 font-semibold flex items-center gap-1">
                    <Compass className="h-4 w-4 animate-spin" />
                    GPS streaming rate: 5s interval
                  </div>
                </div>

              </div>
            </div>
          )
        )}

      {activeTab === 'chat' && (
        !getPermission('loadChat') ? (
          <PermissionLockedScreen
            title="Load Chat Messaging Disabled"
            description="Instant communication channels, driver text loops, and operational attachments are locked."
            permissionName="loadChat"
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] animate-[fadeIn_0.2s]">
          
          {/* Chats Sidebar (Left 4 cols) */}
          <div className="lg:col-span-4 border-r border-slate-200 flex flex-col justify-between">
            <div>
              <div className="p-4 border-b bg-slate-50/50">
                <h3 className="font-heading font-bold text-sm text-slate-800">Dispatch Chat Channels</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Toggle threads to coordinate freight details.</p>
              </div>

              <div className="p-2 space-y-1">
                {/* General Channel */}
                <button
                  onClick={() => {
                    setSelectedChatChannel('general');
                  }}
                  className={`w-full text-left p-3 rounded-xl transition flex justify-between items-center ${
                    selectedChatChannel === 'general' ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-bold">📢</div>
                    <span className="text-xs font-semibold">General Company Broadcast</span>
                  </div>
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                </button>

                {/* Separator */}
                <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">Load-Specific Threads</div>

                {/* Load Channels */}
                {companyLoads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setSelectedLoadId(l.id);
                      setSelectedChatChannel('load');
                    }}
                    className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 ${
                      selectedChatChannel === 'load' && selectedLoadId === l.id
                        ? 'bg-indigo-50 text-indigo-900 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-mono font-bold">{l.loadNumber}</span>
                      <span className="text-[10px] text-slate-400">Driver: Nelson</span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate">{l.cargoType}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hint Box */}
            <div className="p-4 bg-slate-50 border-t text-[11px] text-slate-500 leading-normal">
              💡 <strong>Real-Time Sync</strong>: Messages sent here are synchronized instantly with the assigned driver's active mobile terminal.
            </div>
          </div>

          {/* Active Chat Thread (Right 8 cols) */}
          <div className="lg:col-span-8 flex flex-col justify-between h-[520px] bg-slate-50">
            {/* Header */}
            <div className="p-4 border-b bg-white flex justify-between items-center">
              <div>
                <h4 className="font-heading font-bold text-sm text-slate-800">
                  {selectedChatChannel === 'general' ? '📢 General Broadcast Room' : `💬 Thread: ${selectedLoad?.loadNumber || 'No Load Selected'}`}
                </h4>
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  {selectedChatChannel === 'general' ? 'Corporate dispatch stream to all driver ELDs' : `Direct communication for routing, BOLs, and custom clearances.`}
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border px-2 py-0.5 rounded font-bold">
                WebSocket Live
              </span>
            </div>

            {/* Message History Scroller */}
            <div className="flex-grow p-4 overflow-y-auto space-y-3.5">
              {messages
                .filter(msg => {
                  if (selectedChatChannel === 'general') return msg.channel === 'general' && msg.companyId === company.id;
                  return msg.channel === 'load' && msg.loadId === selectedLoadId && msg.companyId === company.id;
                })
                .map((msg) => {
                  const isSelf = msg.senderRole === 'dispatcher';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[85%] ${isSelf ? 'ml-auto' : 'mr-auto'}`}>
                      <div className="text-[9px] text-slate-400 font-mono mb-0.5 flex items-center gap-1">
                        <span>{msg.senderName}</span>
                        <span>•</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`p-3 rounded-2xl text-xs leading-normal shadow-sm ${
                        isSelf 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}>
                        {msg.text}
                        
                         {msg.attachmentName && (
                          <div className={`mt-2 p-1.5 rounded flex items-center gap-1.5 border text-[10px] font-mono ${
                            isSelf ? 'bg-indigo-700 border-indigo-500 text-indigo-100' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}>
                            <Paperclip className="h-3 w-3" />
                            {msg.attachmentUrl ? (
                              <a
                                href={msg.attachmentUrl}
                                download={msg.attachmentName}
                                target="_blank"
                                rel="noreferrer"
                                className="underline font-bold cursor-pointer hover:opacity-80"
                              >
                                {msg.attachmentName} (Download / Open)
                              </a>
                            ) : (
                              <a href="#" className="underline font-bold" onClick={(e) => { e.preventDefault(); alert(`Downloading simulated file: ${msg.attachmentName}`); }}>
                                {msg.attachmentName}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendMessageSubmit} className="p-4 bg-white border-t space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={selectedChatChannel === 'general' ? "Type a general dispatch bulletin..." : "Ask driver for location, POD scan status..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-grow border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                
                {/* File attachment upload/simulator */}
                <label
                  id="chat-file-upload-label"
                  className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center shrink-0 ${isUploadingFile ? 'bg-indigo-50 border-indigo-350 text-indigo-700 animate-pulse' : simulatedFile ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}
                  title={isUploadingFile ? "Uploading attachment..." : "Attach a file or document"}
                >
                  <Paperclip id="chat-file-upload-icon" className="h-4 w-4" />
                  <input
                    id="chat-file-upload-input"
                    type="file"
                    disabled={isUploadingFile}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setIsUploadingFile(true);
                          setSimulatedFile(`${file.name} (Uploading...)`);
                          const loadIdPart = selectedLoadId || 'general';
                          const storagePath = `communications/${company.id}/${loadIdPart}/${Date.now()}_${file.name}`;
                          const url = await uploadFileToStorage(file, storagePath);
                          setSimulatedFile(file.name);
                          setSimulatedFileUrl(url);
                        } catch (err) {
                          console.error("Failed to upload file to Storage:", err);
                          alert("Failed to upload attachment. Please try again.");
                          setSimulatedFile(null);
                          setSimulatedFileUrl(null);
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
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 px-3 rounded-xl shadow transition disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              {simulatedFile && (
                <div className="text-[10px] font-mono text-amber-700 bg-amber-50 rounded px-2.5 py-1 flex justify-between items-center border border-amber-200">
                  <span>Attachment attached: <strong>{simulatedFile}</strong></span>
                  <button type="button" onClick={() => { setSimulatedFile(null); setSimulatedFileUrl(null); }} className="text-slate-500 hover:text-black cursor-pointer font-bold px-1">✕</button>
                </div>
              )}
            </form>
          </div>

        </div>
      ))}

      {activeTab === 'reports' && (
        !getPermission('invoices') ? (
          <PermissionLockedScreen
            title="Performance & Finance Ledger Locked"
            description="Company shipping revenues, financial logs, and contract audit statistics are restricted."
            permissionName="invoices"
          />
        ) : (() => {
        // Precompute accurate synced values from actual loads with clean data sanitization
        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        
        const getDayOfWeek = (dateTimeStr: string): string => {
          if (!dateTimeStr) return 'Mon';
          const lower = dateTimeStr.toLowerCase().trim();
          if (lower.startsWith('mon') || lower.includes('monday')) return 'Mon';
          if (lower.startsWith('tue') || lower.includes('tuesday')) return 'Tue';
          if (lower.startsWith('wed') || lower.includes('wednesday')) return 'Wed';
          if (lower.startsWith('thu') || lower.includes('thursday')) return 'Thu';
          if (lower.startsWith('fri') || lower.includes('friday')) return 'Fri';
          if (lower.startsWith('sat') || lower.includes('saturday')) return 'Sat';
          if (lower.startsWith('sun') || lower.includes('sunday')) return 'Sun';

          try {
            const d = new Date(dateTimeStr);
            if (!isNaN(d.getTime())) {
              const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              return days[d.getDay()];
            }
          } catch (e) {
            // Ignore
          }

          // Distribute consistently to map neatly and cleanly
          let hash = 0;
          for (let i = 0; i < dateTimeStr.length; i++) {
            hash = dateTimeStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          return days[Math.abs(hash) % 7];
        };

        // Data Cleaning & Synchronization Layer
        let sourceLoads = [...companyLoads];
        let originalCount = sourceLoads.length;

        // 1. If Clean Data Only is enabled, filter out corrupt or incomplete loads
        if (cleanDataOnly) {
          sourceLoads = sourceLoads.filter(l => 
            l.rate > 0 && 
            l.cargoType && 
            l.pickup?.facilityName && 
            l.delivery?.facilityName && 
            l.assignedDriverId
          );
        }

        // 2. Filter based on selected timeframe / status filter
        if (analyticsTimeframe === 'delivered') {
          sourceLoads = sourceLoads.filter(l => l.status === 'delivered');
        } else if (analyticsTimeframe === 'transit') {
          sourceLoads = sourceLoads.filter(l => l.status === 'in_transit' || l.status === 'dispatched' || l.status === 'booked');
        }

        const filteredOutCount = originalCount - sourceLoads.length;

        // Recalculate stats cleanly using sanitized synced load dataset
        const totalValueManaged = sourceLoads.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
        const totalNetRevenue = sourceLoads.reduce((acc, c) => acc + (Number(c.rate) || 0), 0);
        const deliveredLoadsCount = sourceLoads.filter(l => l.status === 'delivered').length;
        const pipelineLoadsCount = sourceLoads.filter(l => l.status !== 'delivered').length;

        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const chartData = daysOfWeek.map(day => ({ day, revenue: 0, loads: 0 }));

        sourceLoads.forEach(load => {
          const day = getDayOfWeek(load.pickup?.dateTime || load.delivery?.dateTime || '');
          const target = chartData.find(d => d.day === day);
          if (target) {
            target.revenue += Number(load.rate) || 0;
            target.loads += 1;
          }
        });

        const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1000);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-[fadeIn_0.2s]">
            
            {/* Sync Control & Data Audit Header */}
            <div className="lg:col-span-12 bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <h3 className="font-heading font-bold text-sm">Performance Audit & Financial Ledger</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">Real-time synced dispatch telemetry. Clean out incomplete load data, audit freight invoices, and verify operational analytics.</p>
              </div>

              {/* Filtering Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 text-xs">
                  <button
                    onClick={() => setAnalyticsTimeframe('all')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${analyticsTimeframe === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    All Pipeline
                  </button>
                  <button
                    onClick={() => setAnalyticsTimeframe('delivered')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${analyticsTimeframe === 'delivered' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Delivered Only
                  </button>
                  <button
                    onClick={() => setAnalyticsTimeframe('transit')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${analyticsTimeframe === 'transit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    In Transit
                  </button>
                </div>

                <button
                  onClick={() => setCleanDataOnly(!cleanDataOnly)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                    cleanDataOnly 
                      ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700' 
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Filter out incomplete mock load values or corrupt records to view strictly clean operational stats."
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {cleanDataOnly ? 'Clean Mode: Active' : 'Sift & Clean Data'}
                </button>
              </div>
            </div>

            {/* Sync Warning Banner if data is filtered */}
            {filteredOutCount > 0 && (
              <div className="lg:col-span-12 bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-medium flex items-center gap-2">
                  ⚠️ <strong>Audit Sync active</strong>: {filteredOutCount} corrupted/incomplete load logs cleaned out from calculations.
                </span>
                <button 
                  onClick={() => { setCleanDataOnly(false); setAnalyticsTimeframe('all'); }} 
                  className="underline font-bold text-amber-900 hover:text-amber-950"
                >
                  Show All Raw Data
                </button>
              </div>
            )}

            {/* Analytics Overview Cards */}
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Total Freight Value Managed</span>
                <h3 className="font-heading text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalValueManaged)} USD</h3>
                <div className="text-xs text-slate-500 mt-2">Active loads fully covered by cargo insurance</div>
              </div>
              
              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Company Net Revenue ({currentMonthName})</span>
                <h3 className="font-heading text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalNetRevenue)}</h3>
                <div className="text-xs text-slate-500 mt-2">Aggregated active load billable rates</div>
              </div>

              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Completed Delivery PODs</span>
                <h3 className="font-heading text-2xl font-bold text-slate-800 mt-1">
                  {deliveredLoadsCount} / {sourceLoads.length} Loads
                </h3>
                <div className="text-xs text-slate-500 mt-2">Documents cataloged inside secure storage ({pipelineLoadsCount} in-transit)</div>
              </div>
            </div>

            {/* Custom SVG Performance Graph Charts (Left 7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-heading font-bold text-sm text-slate-800">Weekly Shipping Revenue Curve</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Performance tracking showing contract booking rates</p>
                </div>
                <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-semibold">
                  Daily Ledger
                </span>
              </div>

              {/* Custom high-fidelity SVG revenue graph bar chart */}
              <div className="h-[220px] flex items-end justify-between px-4 pt-4 select-none">
                {chartData.map((bar, idx) => {
                  const heightPercentage = (bar.revenue / maxRevenue) * 100;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 group relative cursor-pointer w-[12%]">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 bg-slate-900 text-white text-[9px] font-mono py-1 px-1.5 rounded transition shadow pointer-events-none z-10 whitespace-nowrap">
                        {formatCurrency(bar.revenue)} ({bar.loads} {bar.loads === 1 ? 'load' : 'loads'})
                      </div>
                      {/* Graph bar */}
                      <div className="w-full bg-slate-100 rounded-md h-[150px] flex items-end">
                        <div
                          style={{ height: `${heightPercentage}%` }}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-md transition-all duration-500 shadow-sm"
                        ></div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 font-bold">{bar.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          {/* Driver activity reports list (Right 5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-heading font-bold text-sm text-slate-800">Operator Performance Index</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tracking CDL driver statuses and logistics delivery rates.</p>
                </div>
                <button
                  onClick={() => setShowAddDriver(!showAddDriver)}
                  className="bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-bold py-1 px-2.5 rounded-lg border border-purple-200 transition-all flex items-center gap-1 shrink-0"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  {showAddDriver ? 'Cancel' : 'Add Driver'}
                </button>
              </div>

              {showAddDriver && (
                <form onSubmit={handleAddDriverSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 animate-fade-in text-xs">
                  <span className="font-bold text-slate-700 block border-b pb-1">Register New Driver Invitation</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Jack Nelson"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={driverEmail}
                        onChange={(e) => setDriverEmail(e.target.value)}
                        placeholder="nelson@company.com"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">Phone</label>
                      <input
                        type="tel"
                        value={driverPhone}
                        onChange={(e) => setDriverPhone(e.target.value)}
                        placeholder="(555) 019-2831"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">CDL License</label>
                      <input
                        type="text"
                        value={driverCdl}
                        onChange={(e) => setDriverCdl(e.target.value)}
                        placeholder="CDL-TX-8829"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">Truck ID</label>
                      <input
                        type="text"
                        value={driverTruck}
                        onChange={(e) => setDriverTruck(e.target.value)}
                        placeholder="TRK-900"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block">Owner Operator Vendor</label>
                      <select
                        value={
                          (ownerCompanies.find(o => o.legalName === driverOwnerOperator || o.dbaName === driverOwnerOperator || o.ownerName === driverOwnerOperator)?.id) ||
                          (driverOwnerOperator ? 'custom' : '')
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setDriverOwnerOperator('');
                          } else if (val === 'custom') {
                            setDriverOwnerOperator(driverOwnerOperator || '');
                          } else {
                            const matched = ownerCompanies.find(o => o.id === val);
                            if (matched) {
                              setDriverOwnerOperator(matched.legalName || matched.dbaName || matched.ownerName || '');
                            }
                          }
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                      >
                        <option value="">Not Selected (Can be assigned later in Fleet Overview)</option>
                        {ownerCompanies.map((oo) => (
                          <option key={oo.id} value={oo.id}>
                            {oo.legalName || oo.dbaName || oo.ownerName} {oo.ownerName ? `(${oo.ownerName})` : ''}
                          </option>
                        ))}
                        <option value="custom">-- Custom Vendor Name --</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block">Temporary Password *</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={driverPassword}
                        onChange={(e) => setDriverPassword(e.target.value)}
                        placeholder="Welcome123!"
                        className="w-full border border-slate-300 rounded pl-2 pr-20 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setDriverPassword(generateTempPassword())}
                        className="absolute right-1 top-1 bottom-1 px-2.5 bg-slate-200 hover:bg-slate-300 text-[10px] font-bold text-slate-700 rounded transition"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1.5 border-t">
                    <button
                      type="button"
                      disabled={isOnboarding}
                      onClick={() => setShowAddDriver(false)}
                      className="bg-white hover:bg-slate-100 text-slate-600 font-bold py-1 px-2.5 rounded border text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isOnboarding}
                      className={`text-white font-bold py-1 px-3 rounded text-[11px] flex items-center gap-1.5 transition ${isOnboarding ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                      {isOnboarding ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                          Onboarding Driver...
                        </>
                      ) : (
                        'Onboard Driver'
                      )}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3.5">
                {companyDrivers.map((drv, idx) => {
                  const driverLoads = companyLoads.filter(l => l.assignedDriverId === drv.id);
                  const deliveredCount = driverLoads.filter(l => l.status === 'delivered').length;
                  const activeCount = driverLoads.filter(l => l.status === 'in_transit').length;
                  
                  return (
                    <div key={drv.id} className="flex justify-between items-center text-xs border-b pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded">#{idx + 1}</span>
                        <div className="h-6 w-6 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 font-bold text-[10px]">
                          {drv.name.charAt(0)}
                        </div>
                        <div>
                          <strong className="text-slate-800 block text-[11px]">{drv.name.split(' ')[0]} ({drv.truckNumber})</strong>
                          <span className="text-[9px] text-slate-400 font-mono">Assigned Loads: {driverLoads.length}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <span className="text-[9px] text-emerald-600 font-bold block">✓ {deliveredCount} Delivered</span>
                          <span className="text-[9px] text-indigo-600 font-bold block">🚚 {activeCount} Transit</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleExportCsv}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow transition"
            >
              <Download className="h-3.5 w-3.5" /> Export Company Performance (.CSV)
            </button>
          </div>

          {/* Recent Carrier Activity & Notifications */}
          <div className="lg:col-span-12 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="font-heading font-bold text-sm text-slate-800 flex items-center gap-2">
                <Bell className="h-4 w-4 text-purple-600 animate-pulse" /> Recent Carrier Activity & Onboarding Alerts
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time status updates and staff onboarding history for this organization.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-1">
              {(() => {
                const companyNotifs = (notifications || []).filter(n => n.forCompanyId === company.id);
                if (companyNotifs.length === 0) {
                  return (
                    <div className="col-span-full py-8 text-center text-xs text-slate-400">
                      No recent activities recorded for this organization.
                    </div>
                  );
                }
                return companyNotifs.map((n) => {
                  let Icon = Info;
                  let colorClass = 'text-blue-500 bg-blue-50 border-blue-100';
                  if (n.type === 'success') {
                    Icon = CheckCircle2;
                    colorClass = 'text-emerald-500 bg-emerald-50 border-emerald-100';
                  } else if (n.type === 'warning') {
                    Icon = AlertCircle;
                    colorClass = 'text-amber-500 bg-amber-50 border-amber-100';
                  } else if (n.type === 'danger') {
                    Icon = ShieldAlert;
                    colorClass = 'text-rose-500 bg-rose-50 border-rose-100';
                  }
                  
                  return (
                    <div key={n.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 flex flex-col justify-between hover:bg-slate-100/50 transition">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5 min-w-0">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${n.type === 'success' ? 'text-emerald-500' : 'text-indigo-500'}`} />
                          <span className="truncate">{n.title}</span>
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded shrink-0">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-normal">{n.message}</p>
                      <div className="text-[9px] font-mono text-slate-400 border-t pt-1.5 mt-1 flex justify-between items-center">
                        <span>{new Date(n.timestamp).toLocaleDateString()}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${n.type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

        </div>
        );
      })()
      )}

      {activeTab === 'drivers' && (
        <div className="space-y-6 animate-[fadeIn_0.2s]">
          {/* Unified Driver & Fleet Onboarding Banner */}
          {canLaunchOnboardingWizard && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <span className="font-extrabold text-purple-950 text-xs flex items-center gap-1.5">
                  <TruckIcon className="w-4 h-4 text-purple-700" />
                  Unified Driver & Fleet Onboarding Workflow
                </span>
                <p className="text-[11px] text-purple-800">
                  Register complete CDL details, compliance dates, emergency contacts, and assign or create a centralized truck in one step.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetchCompanyTrucks();
                  setShowUnifiedOnboardingModal(true);
                }}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-sm shrink-0 transition flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Launch Onboarding Wizard
              </button>
            </div>
          )}

          {/* Top Info & Actions bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-heading font-bold text-slate-800">CDL Operator Registry</h3>
              <p className="text-xs text-slate-400 mt-0.5">Manage driver active credentials, assign truck configurations, and onboard new operators.</p>
            </div>
            <div className="flex items-center gap-2">
              {canLaunchOnboardingWizard && (
                <button
                  onClick={() => {
                    fetchCompanyTrucks();
                    setShowUnifiedOnboardingModal(true);
                  }}
                  className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" />
                  Launch Onboarding Wizard
                </button>
              )}
              <button
                onClick={() => setShowAddDriver(!showAddDriver)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                {showAddDriver ? 'Cancel Quick Form' : 'Quick Add Driver'}
              </button>
            </div>
          </div>

          {/* Add Driver inline form (if open) */}
          {showAddDriver && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 animate-[fadeIn_0.2s]">
              <div className="border-b pb-2 flex justify-between items-center">
                <span className="font-heading font-bold text-slate-800 text-sm">Register New Driver Invitation & Account</span>
                <span className="text-[10px] font-mono uppercase bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-bold">Auto-auth Enabled</span>
              </div>

              <form onSubmit={handleAddDriverSubmit} className="space-y-4">
                <FormErrorSummary
                  message={driverFormError}
                  fieldErrors={driverFieldErrors}
                  onDismiss={() => setDriverFormError(null)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={driverName}
                      onChange={(e) => {
                        setDriverName(e.target.value);
                        if (driverFieldErrors.driverName) setDriverFieldErrors(prev => ({ ...prev, driverName: '' }));
                      }}
                      placeholder="e.g. Jack Nelson"
                      className={getFieldInputClass(Boolean(driverFieldErrors.driverName))}
                    />
                    <FieldErrorMessage error={driverFieldErrors.driverName} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={driverEmail}
                      onChange={(e) => {
                        setDriverEmail(e.target.value);
                        if (driverFieldErrors.driverEmail) setDriverFieldErrors(prev => ({ ...prev, driverEmail: '' }));
                      }}
                      placeholder="e.g. driver@carrier.com"
                      className={getFieldInputClass(Boolean(driverFieldErrors.driverEmail))}
                    />
                    <FieldErrorMessage error={driverFieldErrors.driverEmail} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Phone Number</label>
                    <input
                      type="tel"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      placeholder="e.g. (555) 019-2831"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">CDL License Number</label>
                    <input
                      type="text"
                      value={driverCdl}
                      onChange={(e) => setDriverCdl(e.target.value)}
                      placeholder="e.g. CDL-TX-882910"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Truck / Rig ID</label>
                    <input
                      type="text"
                      value={driverTruck}
                      onChange={(e) => setDriverTruck(e.target.value)}
                      placeholder="e.g. TRK-900"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Owner Operator Name (Optional)</label>
                    <input
                      type="text"
                      value={driverOwnerOperator}
                      onChange={(e) => setDriverOwnerOperator(e.target.value)}
                      placeholder="e.g. JD Trucking LLC"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Configure Password *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={driverPassword}
                      onChange={(e) => {
                        setDriverPassword(e.target.value);
                        if (driverFieldErrors.driverPassword) setDriverFieldErrors(prev => ({ ...prev, driverPassword: '' }));
                      }}
                      placeholder="Password"
                      className={getFieldInputClass(Boolean(driverFieldErrors.driverPassword), "pl-3.5 pr-24 font-mono")}
                    />
                    <button
                      type="button"
                      onClick={() => setDriverPassword(generateTempPassword())}
                      className="absolute right-1 top-1 bottom-1 px-3 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 rounded-lg transition cursor-pointer"
                    >
                      Generate
                    </button>
                  </div>
                  <FieldErrorMessage error={driverFieldErrors.driverPassword} />
                  <p className="text-[10px] text-slate-400">
                    The driver will use this password combined with their email address to log in instantly.
                  </p>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddDriver(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-semibold rounded-xl text-slate-600 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <LoadingSubmitButton
                    isSubmitting={isOnboarding}
                    onClick={handleAddDriverSubmit}
                    idleText="Complete Driver Registration"
                    loadingText="Onboarding Driver..."
                    variant="indigo"
                  />
                </div>
              </form>
            </div>
          )}

          {/* Dispatch Alert Channel Overview Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-900/50 shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold font-mono tracking-wide uppercase text-amber-400 flex items-center gap-2">
                    <span>Driver Dispatch Alert System Active (Phase 1)</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Automated Email & SMS alerts are dispatched to drivers instantly upon load assignment or status updates. Use the <strong className="text-amber-300">"Test Alert"</strong> button on any driver row to verify their notification channels.
                  </p>
                </div>
              </div>
            </div>

            {testAlertSuccessMsg && (
              <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-[fadeIn_0.2s]">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{testAlertSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Active CDL Driver Noticeboard List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
              <div>
                <h4 className="font-heading font-bold text-sm text-slate-800 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-indigo-600" />
                  Active Fleet Noticeboard
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Real-time driver status, location, load, and availability overview</p>
              </div>
              <div className="relative w-full sm:w-72 shrink-0">
                <input
                  type="text"
                  placeholder="Search name, email, phone, owner operator..."
                  value={driverSearchQuery}
                  onChange={(e) => {
                    setDriverSearchQuery(e.target.value);
                    setDriverTabNoticeboardPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                />
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* Noticeboard Grid Table */}
            {(() => {
              const totalDriverTabCount = filteredDrivers.length;
              const totalDriverTabPages = Math.ceil(totalDriverTabCount / driverTabRowsPerPage) || 1;
              const currentDriverTabPage = Math.min(driverTabNoticeboardPage, totalDriverTabPages);
              const startDriverTabIndex = (currentDriverTabPage - 1) * driverTabRowsPerPage;
              const endDriverTabIndex = Math.min(totalDriverTabCount, currentDriverTabPage * driverTabRowsPerPage);
              const paginatedDriverTabDrivers = filteredDrivers.slice(startDriverTabIndex, endDriverTabIndex);

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                        <th className="p-4 pl-6">Driver & Carrier</th>
                        <th className="p-4">Equipment & Rig ID</th>
                        <th className="p-4">Current Active Load / Route</th>
                        <th className="p-4">Duty Status</th>
                        <th className="p-4">Availability Hub</th>
                        <th className="p-4 pr-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {companyDrivers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center space-y-2">
                            <div className="h-10 w-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                              <User className="h-5 w-5" />
                            </div>
                            <h5 className="text-xs font-bold text-slate-700">No CDL Drivers Registered</h5>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto">Click "Onboard New Driver" above to register and invite operators to your dispatch network.</p>
                          </td>
                        </tr>
                      ) : filteredDrivers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center space-y-2 animate-[fadeIn_0.2s]">
                            <div className="h-10 w-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                              <Search className="h-5 w-5" />
                            </div>
                            <h5 className="text-xs font-bold text-slate-700">No Drivers Match Your Search</h5>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto">Try refining your query. You can search by name, email, phone number, CDL number, truck ID, or owner company name.</p>
                          </td>
                        </tr>
                      ) : (
                        paginatedDriverTabDrivers.map((drv) => {
                          const driverLoads = companyLoads.filter(l => l.assignedDriverId === drv.id);
                          const activeLoad = driverLoads.find(l => ['booked', 'dispatched', 'at_pickup', 'arrived_pickup', 'loaded', 'in_transit', 'at_delivery'].includes(l.status));
                          const completedCount = driverLoads.filter(l => l.status === 'delivered').length;

                          // Determine availability state
                          let availabilityLabel = "Ready & Available";
                          let availabilityColorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                          let availabilityDotColor = "bg-emerald-500";

                          if (drv.dutyStatus === 'Off Duty') {
                            availabilityLabel = "Off Duty";
                            availabilityColorClass = "bg-slate-50 text-slate-600 border-slate-200";
                            availabilityDotColor = "bg-slate-400";
                          } else if (drv.dutyStatus === 'On Break') {
                            availabilityLabel = "Resting on Break";
                            availabilityColorClass = "bg-amber-50 text-amber-700 border-amber-200";
                            availabilityDotColor = "bg-amber-500";
                          } else if (activeLoad) {
                            availabilityLabel = `Engaged (${activeLoad.status.replace('_', ' ').toUpperCase()})`;
                            availabilityColorClass = "bg-indigo-50 text-indigo-700 border-indigo-200";
                            availabilityDotColor = "bg-indigo-500";
                          }

                          return (
                            <tr key={drv.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                              {/* Driver & Carrier */}
                              <td className="p-4 pl-6">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                                    {drv.name.charAt(0)}
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <strong className="text-slate-800 text-sm">{drv.name}</strong>
                                      {drv.ownerOperatorName && (
                                        <span className="bg-indigo-50 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-100 font-sans">
                                          {drv.ownerOperatorName}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {drv.email} • {drv.phone || 'No Phone Registered'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Equipment & Rig ID */}
                              <td className="p-4">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-slate-700 font-mono flex items-center gap-1">
                                    <TruckIcon className="h-3.5 w-3.5 text-slate-400" />
                                    {drv.truckNumber || 'Rig: N/A'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    CDL License: {drv.licenseNumber || 'N/A'}
                                  </span>
                                </div>
                              </td>

                              {/* Current Active Load / Route */}
                              <td className="p-4">
                                {activeLoad ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-indigo-100 text-indigo-900 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg border border-indigo-200">
                                        {activeLoad.loadNumber}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        Value: {formatCurrency(activeLoad.value || 0)}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
                                      <span className="truncate max-w-[130px] font-bold text-indigo-900" title={activeLoad.pickup.facilityName}>{activeLoad.pickup.facilityName}</span>
                                      <span className="text-slate-400">➔</span>
                                      <span className="truncate max-w-[130px] font-bold text-emerald-800" title={activeLoad.delivery.facilityName}>{activeLoad.delivery.facilityName}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Delivery target: {new Date(activeLoad.delivery.dateTime).toLocaleDateString()}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
                                    <span className="font-semibold text-slate-400 font-mono text-[10.5px]">📦 NO ACTIVE DISPATCH (IDLE)</span>
                                  </div>
                                )}
                              </td>

                              {/* Duty Status */}
                              <td className="p-4">
                                <select
                                  value={drv.dutyStatus || 'Off Duty'}
                                  onChange={(e) => handleUpdateUserProfileLocal(drv.id, { dutyStatus: e.target.value as any })}
                                  className={`border text-[10px] font-bold py-1.5 px-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer bg-white shadow-sm ${
                                    drv.dutyStatus === 'On Duty' ? 'text-emerald-600 border-emerald-200' :
                                    drv.dutyStatus === 'On Break' ? 'text-amber-600 border-amber-200' :
                                    'text-slate-500 border-slate-200'
                                  }`}
                                >
                                  <option value="On Duty">🟢 On Duty</option>
                                  <option value="Off Duty">⚫ Off Duty</option>
                                  <option value="On Break">🟡 On Break</option>
                                </select>
                              </td>

                              {/* Availability Hub */}
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border flex items-center gap-1.5 capitalize ${availabilityColorClass}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${availabilityDotColor} ${availabilityLabel === 'Ready & Available' ? 'animate-pulse' : ''}`} />
                                    {availabilityLabel}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({completedCount} completed loads)
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 pr-6 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDriverModal(drv)}
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                                      canEditDriver
                                        ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                        : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60'
                                    }`}
                                    title={canEditDriver ? "Edit Driver Profile & Operational Settings" : "Driver Edit Permission disabled by Admin"}
                                  >
                                    <UserCog className="h-3 w-3 text-purple-600" />
                                    <span>Edit Profile</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenDriverAssignModal(drv)}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                                    title="Assign Driver to a central fleet truck"
                                  >
                                    <TruckIcon className="h-3 w-3 text-emerald-600" />
                                    <span>Assign Truck</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenDriverHistoryModal(drv)}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-200 transition cursor-pointer flex items-center gap-1"
                                    title="View complete truck assignment history ledger"
                                  >
                                    <Clock className="h-3 w-3 text-indigo-600" />
                                    <span>Truck History</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={testingAlertDriverId === drv.id}
                                    onClick={async () => {
                                      try {
                                        setTestingAlertDriverId(drv.id);
                                        await sendDriverNotificationAlert({
                                          driverId: drv.id,
                                          driverName: drv.name,
                                          driverEmail: drv.email,
                                          driverPhone: drv.phone,
                                          title: 'Dispatcher Alert Test',
                                          message: `Test alert dispatched by ${company.name} Dispatcher. Driver channels verified: Email (${drv.email}), SMS (${drv.phone || 'Phone'}).`,
                                          type: 'test',
                                          companyId: company.id,
                                        });
                                        setTestAlertSuccessMsg(`Test Email & SMS alert successfully shot to ${drv.name} (${drv.email})!`);
                                        setTimeout(() => setTestAlertSuccessMsg(null), 6000);
                                      } catch (err) {
                                        console.error('Failed to send test alert:', err);
                                      } finally {
                                        setTestingAlertDriverId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-200 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                    title="Shoot test Email & SMS alert to driver"
                                  >
                                    {testingAlertDriverId === drv.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                                    ) : (
                                      <Bell className="h-3 w-3 text-amber-600" />
                                    )}
                                    <span>Test Alert</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setArchiveTarget({
                                        type: 'driver',
                                        id: drv.id,
                                        label: drv.name
                                      });
                                    }}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200 transition cursor-pointer"
                                  >
                                    Archive
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* CDL Drivers Pagination Footer */}
                  {totalDriverTabCount > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 font-sans">
                      <div className="flex items-center gap-3">
                        <span>
                          Showing <strong className="text-slate-800">{totalDriverTabCount === 0 ? 0 : startDriverTabIndex + 1}</strong> to <strong className="text-slate-800">{endDriverTabIndex}</strong> of <strong className="text-slate-800">{totalDriverTabCount}</strong> drivers
                        </span>
                        <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                          <span>Per page:</span>
                          <select
                            value={driverTabRowsPerPage}
                            onChange={(e) => {
                              setDriverTabRowsPerPage(Number(e.target.value));
                              setDriverTabNoticeboardPage(1);
                            }}
                            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={currentDriverTabPage <= 1}
                          onClick={() => setDriverTabNoticeboardPage(prev => Math.max(1, prev - 1))}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                        >
                          Previous
                        </button>
                        
                        <div className="flex items-center gap-1 font-mono text-xs">
                          {Array.from({ length: totalDriverTabPages }, (_, i) => i + 1).map((p) => {
                            if (
                              p === 1 ||
                              p === totalDriverTabPages ||
                              (p >= currentDriverTabPage - 1 && p <= currentDriverTabPage + 1)
                            ) {
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setDriverTabNoticeboardPage(p)}
                                  className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                                    p === currentDriverTabPage
                                      ? 'bg-indigo-600 text-white shadow-sm'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {p}
                                </button>
                              );
                            }
                            if (
                              (p === 2 && currentDriverTabPage > 3) ||
                              (p === totalDriverTabPages - 1 && currentDriverTabPage < totalDriverTabPages - 2)
                            ) {
                              return <span key={p} className="px-1 text-slate-400 font-bold">...</span>;
                            }
                            return null;
                          })}
                        </div>

                        <button
                          type="button"
                          disabled={currentDriverTabPage >= totalDriverTabPages}
                          onClick={() => setDriverTabNoticeboardPage(prev => Math.min(totalDriverTabPages, prev + 1))}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'rate_confirmations' && (
        !getPermission('rateConfirmations') ? (
          <PermissionLockedScreen
            title="Rate Confirmations Locked"
            description="Rate confirmation uploads, document parsing, load matching engines, and billing data are locked."
            permissionName="rateConfirmations"
          />
        ) : (
          <RateConfirmationsView 
            company={company} 
            users={users} 
            pageTheme={pageTheme} 
          />
        )
      )}

      {activeTab === 'archive' && (
        <div className="space-y-6 animate-[fadeIn_0.2s]" id="archived-loads-tab-panel">
          {/* Header notice */}
          <div className={`p-5 rounded-2xl border ${
            pageTheme === 'industrial_terminal'
              ? 'bg-black border-amber-500/30 text-amber-400'
              : pageTheme === 'cosmic_dark'
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
          } shadow-sm`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  pageTheme === 'industrial_terminal'
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    : 'bg-indigo-50 text-indigo-600'
                }`}>
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-heading font-bold">
                    Archived Loads Workspace (Read-Only)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    This panel displays deleted, completed, or canceled freight contracts that have been archived. 
                    Dispatchers have read-only visibility for logging and auditing. To restore a load, please contact your System Administrator.
                  </p>
                </div>
              </div>

              {/* Search bar */}
              <div className="relative w-full sm:w-72 shrink-0">
                <input
                  type="text"
                  placeholder="Search archive load number, route, cargo..."
                  value={archiveSearchQuery}
                  onChange={(e) => setArchiveSearchQuery(e.target.value)}
                  className={`w-full rounded-xl pl-8 pr-3.5 py-1.5 text-xs focus:outline-none focus:ring-1 shadow-sm transition ${
                    pageTheme === 'industrial_terminal'
                      ? 'bg-black border border-amber-500/30 text-amber-400 focus:ring-amber-500'
                      : pageTheme === 'cosmic_dark'
                        ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-purple-500'
                        : 'bg-white border border-slate-200 text-slate-800 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                />
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Archived Loads Listing */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${
            pageTheme === 'industrial_terminal'
              ? 'bg-black border-amber-500/30 text-amber-400'
              : pageTheme === 'cosmic_dark'
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
          }`}>
            {renderArchivePagination('top')}
            
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[800px]">
                <thead className={`text-[10px] uppercase tracking-wider font-mono border-b ${
                  pageTheme === 'industrial_terminal'
                    ? 'bg-black text-amber-500/70 border-amber-500/20'
                    : pageTheme === 'cosmic_dark'
                      ? 'bg-slate-950 text-slate-400 border-slate-800'
                      : 'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  <tr>
                    <th className="p-4 w-12 text-center">#</th>
                    <th className="p-4">Load Identifier</th>
                    <th className="p-4">Stops (Pickup ➔ Dropoff)</th>
                    <th className="p-4">Cargo Description</th>
                    <th className="p-4">Contract Rate</th>
                    <th className="p-4">CDL Operator</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Permissions Notice</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs ${
                  pageTheme === 'industrial_terminal'
                    ? 'divide-amber-500/10 text-amber-400/80'
                    : pageTheme === 'cosmic_dark'
                      ? 'divide-slate-800 text-slate-300'
                      : 'divide-slate-100 text-slate-600'
                }`}>
                  {paginatedArchivedLoads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 font-medium select-none">
                        No archived loads found matching this search.
                      </td>
                    </tr>
                  ) : (
                    paginatedArchivedLoads.map((l, idx) => (
                      <tr 
                        key={l.id} 
                        className={`transition ${
                          pageTheme === 'industrial_terminal'
                            ? 'hover:bg-amber-500/5'
                            : pageTheme === 'cosmic_dark'
                              ? 'hover:bg-slate-800/40'
                              : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className={`p-4 font-semibold font-mono text-center select-none ${
                          pageTheme === 'industrial_terminal'
                            ? 'bg-black/30 text-amber-600'
                            : pageTheme === 'cosmic_dark'
                              ? 'bg-slate-950/20 text-slate-500'
                              : 'bg-slate-50/40 text-slate-400'
                        }`}>
                          {startArchiveIndex + idx + 1}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{l.loadNumber}</span>
                            {l.urgent && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-red-100 text-red-700 border border-red-200">
                                Urgent
                              </span>
                            )}
                            {l.podStatus !== 'approved' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1" title="POD is not yet approved by Dispatch/Admin">
                                <FileText className="h-3 w-3 text-amber-400 shrink-0" /> POD Unapproved
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-0.5 mt-1 select-none">
                            <span>ID: {l.id}</span>
                            {l.createdAt && (
                              <span>Booked: {new Date(l.createdAt).toLocaleDateString()}</span>
                            )}
                          </div>
                          {l.companyName && (
                            <span className="text-[10px] font-semibold block mt-1 bg-indigo-50/5 text-indigo-400 px-1 py-0.5 rounded w-fit border border-indigo-500/10">Broker: {l.companyName}</span>
                          )}
                        </td>
                        <td className="p-4 max-w-xs">
                          {l.pickup && (
                            <div className="flex items-start gap-2">
                              <div className="text-indigo-400 font-bold text-xs shrink-0 mt-0.5">PU:</div>
                              <div>
                                <div className="font-bold text-xs leading-tight">{l.pickup.facilityName}</div>
                                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.pickup.address}</div>
                              </div>
                            </div>
                          )}
                          {l.delivery && (
                            <div className="flex items-start gap-2 mt-2.5">
                              <div className="text-emerald-400 font-bold text-xs shrink-0 mt-0.5">DO:</div>
                              <div>
                                <div className="font-bold text-xs leading-tight">{l.delivery.facilityName}</div>
                                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.delivery.address}</div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="font-semibold">{l.cargoType || 'General Freight'}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{formatWeight(l.weight)} | Val: {formatCurrency(l.value)}</div>
                        </td>
                        <td className="p-4 font-bold text-sm">
                          {formatCurrency(l.rate)}
                        </td>
                        <td className="p-4">
                          {l.assignedDriverId ? (
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{companyDrivers.find(d => d.id === l.assignedDriverId)?.name || 'Assigned Driver'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No driver assigned</span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-bold">
                          <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                            l.status === 'delivered'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                              : l.status === 'canceled'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/25'
                          }`}>
                            {l.status || 'archived'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/40 border border-slate-800 text-[10px] font-mono text-slate-400 select-none">
                            <span className="h-1.5 w-1.5 bg-amber-500 rounded-full"></span>
                            Read-Only
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {renderArchivePagination('bottom')}
          </div>
        </div>
      )}

      {activeTab === 'accounting' && (
        !hasDispatcherPermission(activeUserObj, 'accounting', 'view') && !getPermission('invoices') ? (
          <PermissionLockedScreen
            title="Financial Operations Center Restricted"
            description="Access to carrier financial records, driver compensation, settlements, and pay calculations is restricted by your Fleet Administrator."
            permissionName="accounting.view"
          />
        ) : (
          <div className="space-y-6 animate-[fadeIn_0.2s]" id="accounting-settlements-tab-panel">
            <AccountingCenter
              companyId={company.id}
              currentUser={
                activeUserObj ||
                ({
                  id: auth.currentUser?.uid || 'dispatcher',
                  name: 'Dispatcher',
                  email: 'dispatcher@carrier.com',
                  role: 'dispatcher',
                  companyId: company.id,
                  status: 'active',
                  phone: ''
                } as AppUser)
              }
            />
          </div>
        )
      )}

      {activeTab === 'compliance' && (
        !hasDispatcherPermission(activeUserObj, 'compliance', 'view') ? (
          <PermissionLockedScreen
            title="Compliance Center Restricted"
            description="Access to carrier compliance documents, driver files, expiration alerts, and audit packets is restricted by your Tenant Administrator."
            permissionName="compliance.view"
          />
        ) : (
          <div className="space-y-6 animate-[fadeIn_0.2s]" id="compliance-center-tab-panel">
            <ComplianceCenter
              company={company}
              currentUser={
                activeUserObj ||
                ({
                  id: auth.currentUser?.uid || 'dispatcher',
                  name: 'Dispatcher',
                  email: 'dispatcher@carrier.com',
                  role: 'dispatcher',
                  companyId: company.id,
                  status: 'active',
                  phone: ''
                } as AppUser)
              }
              users={users}
              pageTheme={pageTheme}
            />
          </div>
        )
      )}

      {activeTab === 'fleet_equipment' && (
        !hasDispatcherPermission(activeUserObj, 'fleet', 'viewFleet') ? (
          <PermissionLockedScreen
            title="Fleet & Equipment Operations Restricted"
            description="Access to power units, trailers, assignment history, maintenance, and vehicle compliance is restricted by your Tenant Administrator."
            permissionName="fleet.viewFleet"
          />
        ) : (
          <div className="space-y-6 animate-[fadeIn_0.2s]" id="fleet-equipment-tab-panel">
            <FleetEquipmentCenter
              company={company}
              users={users}
              pageTheme={pageTheme === 'cosmic_dark' || pageTheme === 'industrial_terminal' ? 'dark' : 'light'}
              currentUserId={auth.currentUser?.uid || ''}
              userRole="dispatcher"
            />
          </div>
        )
      )}

      {/* CREATE LOAD MODAL */}
      {showCreateLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" id="create-load-modal">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white border shadow-2xl text-slate-800 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-indigo-400" />
                <h3 className="font-heading font-semibold text-sm">Schedule Freight Load Booking</h3>
              </div>
              <button onClick={() => setShowCreateLoad(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            {/* Scrollable form body */}
            <form onSubmit={handleCreateLoadSubmit} className="p-6 overflow-y-auto space-y-6">
              <FormErrorSummary
                message={createLoadError}
                onDismiss={() => setCreateLoadError(null)}
              />
              
              {/* ✨ AI Rate Confirmation Auto-Parser */}
              {!planFeatures.aiParsing || !planFeatures.aiScraping ? (
                <div className="bg-amber-50/90 border border-amber-200 p-4 rounded-xl space-y-2 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500 text-white rounded-lg shadow-sm shrink-0">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 font-heading">AI Rate Confirmation Scraper (Premium Feature)</h4>
                        <p className="text-[11px] text-slate-600">AI rate confirmation parsing and load scraping require a Premium Plan ($159.99/mo).</p>
                      </div>
                    </div>
                    {isTenantAdminOrSuperAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          alert('To upgrade to Premium Plan, go to Admin Dashboard -> SaaS Subscription Plan.');
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow transition shrink-0"
                      >
                        Upgrade to Premium
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md shrink-0">
                        Request Upgrade from Admin
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
                        <Sparkles className="h-4 w-4 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 font-heading">AI Rate Confirmation Scraper</h4>
                        <p className="text-[10px] text-slate-500">Auto-fill all load fields from a PDF or Image rate confirmation document</p>
                      </div>
                    </div>
                    <span className="bg-indigo-100 text-indigo-700 text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Powered by Gemini</span>
                  </div>

                  {/* Mandatory AI Parsing Legal Disclaimer */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[11px] text-amber-800 dark:text-amber-300 leading-snug flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>AI Output Disclaimer</strong>: AI-generated outputs may be inaccurate or incomplete. Dispatchers must review and confirm all AI-extracted fields (rate, addresses, dates, reference numbers) before creating or dispatching loads.
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="file"
                        id="ai-scraper-file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setParseFile(file);
                          setParseError(null);
                          setParseSuccess(null);
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="ai-scraper-file"
                        className="flex items-center gap-2 justify-center border border-dashed border-indigo-200 hover:border-indigo-400 bg-white/80 hover:bg-white rounded-lg p-2.5 text-xs text-indigo-600 font-semibold cursor-pointer transition text-center"
                      >
                        <Paperclip className="h-4 w-4 shrink-0 text-indigo-500" />
                        <span className="truncate max-w-[200px]">
                          {parseFile ? parseFile.name : "Select Rate Confirmation (PDF or Image)"}
                        </span>
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={isParsing || !parseFile}
                      onClick={handleAutoParse}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${isParsing ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : parseFile ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 cursor-pointer animate-pulse' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      {isParsing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Scraping...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Auto-Parse
                        </>
                      )}
                    </button>
                  </div>

                  {parseError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2 text-xs text-rose-700 font-medium">
                      <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{parseError}</span>
                    </div>
                  )}

                  {parseSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-start gap-2 text-xs text-emerald-700 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{parseSuccess}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Row 1: Cargo details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <h4 className="font-heading text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <ClipboardList className="h-4 w-4 text-indigo-600" /> 1. Cargo, Broker/Shipper & Contract Pricing
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Broker/Shipper Company Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kool Logistics, LLC"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Carrier Company Name</label>
                    <input
                      type="text"
                      placeholder="e.g. KARAN TRANSPORT INC"
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold text-indigo-700 bg-indigo-50/10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Cargo Type / Commodity *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mixed Veg"
                      value={cargoType}
                      onChange={(e) => setCargoType(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Load / RC Number</label>
                    <input
                      type="text"
                      placeholder="e.g. M005126"
                      value={formLoadNumber}
                      onChange={(e) => setFormLoadNumber(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs font-semibold font-mono text-indigo-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-indigo-50/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Reefer Temp Setting (°F)</label>
                    <input
                      type="text"
                      placeholder="e.g. 33.0 F Continuous"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-emerald-50/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Cargo Weight (lbs)</label>
                    <input
                      type="number"
                      required
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Contract Rate ($)</label>
                    <input
                      type="number"
                      required
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold text-emerald-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Cargo Valuation / Insurance ($)</label>
                    <input
                      type="number"
                      required
                      value={value}
                      onChange={(e) => setValue(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6 md:col-span-2">
                    <input
                      type="checkbox"
                      id="urgent"
                      checked={urgent}
                      onChange={(e) => setUrgent(e.target.checked)}
                      className="text-indigo-600 border-slate-200 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <label htmlFor="urgent" className="text-xs font-bold text-red-600 flex items-center gap-1 select-none cursor-pointer">
                      <AlertCircle className="h-4 w-4 animate-pulse" /> Flag Urgent / Hot Load
                    </label>
                  </div>
                </div>
              </div>

              {/* Row 2: Pickup Stops */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b">
                  <h4 className="font-heading text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-indigo-600" /> 2. Pickup Stops (Origins)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setFormPickups([...formPickups, { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }])}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded bg-indigo-50/50"
                  >
                    ➕ Add Pickup Stop
                  </button>
                </div>

                <div className="space-y-4">
                  {formPickups.map((stop, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-indigo-100 relative space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-indigo-50">
                        <span className="text-xs font-bold text-indigo-700 font-mono">STOP #{idx + 1}: Pickup</span>
                        {formPickups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormPickups(formPickups.filter((_, i) => i !== idx))}
                            className="text-[10px] text-red-600 hover:text-red-800 hover:underline font-semibold"
                          >
                            ✕ Remove Stop
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Facility Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Dole Fresh Vegetables"
                            value={stop.facilityName}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].facilityName = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Physical Address *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 315 Neponset Rd, Salinas, CA"
                            value={stop.address}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].address = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">PU Reference / PO Number</label>
                          <input
                            type="text"
                            placeholder="e.g. PU TU970"
                            value={stop.referenceNumber || ''}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].referenceNumber = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none text-indigo-700 bg-indigo-50/10"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Scheduled Date & Time</label>
                          <input
                            type="text"
                            placeholder="e.g. 06/01/2026 13:00"
                            value={stop.dateTime || ''}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].dateTime = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Contact Person / Dept</label>
                          <input
                            type="text"
                            placeholder="e.g. SHIPPING"
                            value={stop.contactName || ''}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].contactName = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Stop Instructions / Pallets</label>
                          <input
                            type="text"
                            placeholder="e.g. Pallets IN: 14, same day appts only"
                            value={stop.notes || ''}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].notes = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Special Instructions</label>
                          <input
                            type="text"
                            placeholder="e.g. Reefer must be on continuous"
                            value={stop.specialInstructions || ''}
                            onChange={(e) => {
                              const updated = [...formPickups];
                              updated[idx].specialInstructions = e.target.value;
                              setFormPickups(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-red-600 bg-red-50/10"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 3: Delivery Stops */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b">
                  <h4 className="font-heading text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-emerald-600" /> 3. Delivery Stops (Destinations)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setFormDeliveries([...formDeliveries, { facilityName: '', address: '', dateTime: '', contactName: '', contactPhone: '', notes: '', referenceNumber: '', specialInstructions: '' }])}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 border border-emerald-200 hover:border-emerald-400 px-2 py-1 rounded bg-emerald-50/50"
                  >
                    ➕ Add Delivery Stop
                  </button>
                </div>

                <div className="space-y-4">
                  {formDeliveries.map((stop, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-emerald-100 relative space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-emerald-50">
                        <span className="text-xs font-bold text-emerald-700 font-mono">STOP #{idx + 1}: Delivery</span>
                        {formDeliveries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormDeliveries(formDeliveries.filter((_, i) => i !== idx))}
                            className="text-[10px] text-red-600 hover:text-red-800 hover:underline font-semibold"
                          >
                            ✕ Remove Stop
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Facility Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Lidl Regional Distribution Center"
                            value={stop.facilityName}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].facilityName = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Physical Address *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 6120 Smith Station Rd, Fredericksburg, VA"
                            value={stop.address}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].address = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">PO / SO Reference Number</label>
                          <input
                            type="text"
                            placeholder="e.g. PO F119506052601"
                            value={stop.referenceNumber || ''}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].referenceNumber = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none text-emerald-700 bg-emerald-50/10"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Scheduled Date & Time</label>
                          <input
                            type="text"
                            placeholder="e.g. 06/05/2026 05:30"
                            value={stop.dateTime || ''}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].dateTime = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Contact Person / Dept</label>
                          <input
                            type="text"
                            placeholder="e.g. CONSIGNEE"
                            value={stop.contactName || ''}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].contactName = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Stop Instructions / Pallets</label>
                          <input
                            type="text"
                            placeholder="e.g. Pallets OUT: 14, MUST SEND POD BEFORE LEAVING"
                            value={stop.notes || ''}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].notes = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-mono text-slate-500 font-bold">Special Instructions</label>
                          <input
                            type="text"
                            placeholder="e.g. early delivery must be pre-approved"
                            value={stop.specialInstructions || ''}
                            onChange={(e) => {
                              const updated = [...formDeliveries];
                              updated[idx].specialInstructions = e.target.value;
                              setFormDeliveries(updated);
                            }}
                            className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-red-600 bg-red-50/10"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks textarea */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Special Dispatch Instructions / Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Driver must monitor reefer temperature continuous mode. Security seal mandatory on arrival."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none bg-slate-50"
                />
              </div>

              {/* Button footer */}
              <div className="flex justify-end gap-2.5 pt-4 border-t shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateLoad(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <LoadingSubmitButton
                  isSubmitting={isSavingLoad}
                  onClick={handleCreateLoadSubmit}
                  idleText="Confirm Booking & Dispatch"
                  loadingText="Registering Load..."
                  variant="indigo"
                />
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MANUAL LOCATION OVERRIDE MODAL */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" id="driver-override-modal">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white border shadow-2xl text-slate-800 max-h-[90vh] flex flex-col animate-[fadeIn_0.15s_ease-out]">
            
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-indigo-400" />
                <h3 className="font-heading font-semibold text-sm">Manual Location & Availability Override</h3>
              </div>
              <button onClick={() => setShowOverrideModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOverrideSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {/* Driver Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Select CDL Driver</label>
                <select
                  value={selectedOverrideDriverId}
                  onChange={(e) => handleOverrideDriverChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm"
                >
                  <option value="" disabled>-- Select Driver --</option>
                  {companyDrivers.map((drv) => (
                    <option key={drv.id} value={drv.id}>
                      {drv.name} {drv.ownerOperatorName ? `(${drv.ownerOperatorName})` : ''} — Truck: {drv.truckNumber || 'N/A'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOverrideDriverId && (
                <>
                  {/* Multi-Load Dispatch Policy Toggle */}
                  <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <TruckIcon className="h-3.5 w-3.5 text-indigo-600" />
                          Allow Multiple Loads
                        </h4>
                        <p className="text-[10px] text-slate-500">Enable driver to receive & accept multiple assigned loads</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overrideMultiLoadEnabled}
                          onChange={(e) => setOverrideMultiLoadEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {overrideMultiLoadEnabled && (
                      <div className="pt-2 border-t border-indigo-100 space-y-1">
                        <label className="text-[10px] uppercase font-mono text-slate-600 font-bold block">
                          Maximum Open Loads (1-20)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={overrideMaximumOpenLoads}
                          onChange={(e) => setOverrideMaximumOpenLoads(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Status Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-800">Use Location Override</h4>
                      <p className="text-[10px] text-slate-400">Enable when the driver's active load is not tracked in the system</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideEnabled}
                        onChange={(e) => setOverrideEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {overrideEnabled && (
                    <div className="space-y-4 pt-1 animate-[fadeIn_0.15s_ease-out]">
                      <div className="grid grid-cols-2 gap-3">
                        {/* City */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">City / Territory</label>
                          <input
                            type="text"
                            placeholder="e.g. Phoenix"
                            value={overrideCity}
                            onChange={(e) => setOverrideCity(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm"
                            required={overrideEnabled}
                          />
                        </div>

                        {/* State */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">State</label>
                          <input
                            type="text"
                            placeholder="e.g. Arizona"
                            value={overrideState}
                            onChange={(e) => setOverrideState(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm"
                            required={overrideEnabled}
                          />
                        </div>
                      </div>

                      {/* Available Date/Time */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Availability Window / Date & Time</label>
                        <input
                          type="text"
                          placeholder="e.g. Mon, July 14, 08:00 AM or Available Now"
                          value={overrideDateTime}
                          onChange={(e) => setOverrideDateTime(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm"
                          required={overrideEnabled}
                        />
                      </div>

                      {/* Notes */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Dispatcher Planning Notes</label>
                        <textarea
                          rows={3}
                          placeholder="e.g. Driver is layover in Phoenix. Needs a step-deck backhaul load towards Dallas/Houston."
                          value={overrideNotes}
                          onChange={(e) => setOverrideNotes(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-sm resize-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-4 border-t shrink-0">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOverride || !selectedOverrideDriverId}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold shadow cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingOverride && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save Status Override
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CUSTOM ARCHIVE CONFIRMATION MODAL */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]" id="archive-confirmation-modal">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 flex flex-col">
            
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                <h3 className="font-heading font-semibold text-sm">System Archive Request</h3>
              </div>
              <button onClick={() => setArchiveTarget(null)} className="text-slate-400 hover:text-white text-sm cursor-pointer">✕</button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {archiveTarget.type === 'load' && (archiveTarget.status === 'in_transit' || archiveTarget.status === 'delivered') ? (
                // Blocked state for active/delivered loads
                <div className="space-y-4">
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex gap-3">
                    <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold">Archive Operation Blocked</p>
                      <p className="text-rose-700 leading-relaxed">
                        Any load with <strong className="font-semibold">In Transit</strong> or <strong className="font-semibold">Delivered</strong> status cannot be deleted or archived. 
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    This safeguard prevents accidental data loss or disruption to active logistics trackers. Please change the load status to Booked, Dispatched, or Canceled if you wish to archive it.
                  </p>
                </div>
              ) : (
                // Proceed Confirmation State
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-800">
                    Do you want to proceed?
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Are you sure you want to archive this {archiveTarget.type === 'load' ? 'load' : 'driver'} (<strong className="text-slate-900 font-semibold">{archiveTarget.label}</strong>)?
                  </p>
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {archiveTarget.type === 'load' 
                      ? 'The load will be marked as Canceled, removed from active dispatch tables, and securely stored in the system archives.' 
                      : 'The driver will be marked as Archived, and removed from active fleet boards, schedules, and active driver list.'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2.5 p-4 border-t bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {archiveTarget.type === 'load' && (archiveTarget.status === 'in_transit' || archiveTarget.status === 'delivered') ? 'Close' : 'Cancel'}
              </button>
              {!(archiveTarget.type === 'load' && (archiveTarget.status === 'in_transit' || archiveTarget.status === 'delivered')) && (
                <button
                  type="button"
                  onClick={handleConfirmArchive}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer transition flex items-center gap-1.5"
                >
                  Confirm Archive
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* COMPANY BREAKDOWN ALERT CENTER MODAL */}
      <CompanyAlertCenterModal
        company={company}
        currentUser={activeUserObj || {
          id: auth.currentUser?.uid || 'dispatcher',
          name: auth.currentUser?.displayName || 'Dispatcher',
          email: auth.currentUser?.email || '',
          phone: company.contactPhone || '',
          role: 'dispatcher',
          companyId: company.id,
          status: 'active'
        }}
        loads={loads}
        isOpen={showAlertCenterModal}
        onClose={() => {
          setShowAlertCenterModal(false);
          setSelectedAlertIdForModal(null);
        }}
        initialSelectedAlertId={selectedAlertIdForModal}
      />

      <GuidedProductTour
        user={activeUserObj || users.find(u => u.id === auth.currentUser?.uid) || { id: auth.currentUser?.uid || '', name: 'Dispatcher', role: 'dispatcher', companyId: company.id, email: '' }}
        isOpen={showGuidedTour}
        onClose={() => setShowGuidedTour(false)}
        roleOverride="dispatcher"
      />

      {/* MODAL: DISPATCHER ASSIGN DRIVER TO TRUCK */}
      {showDriverAssignModal && selectedDriverForAssign && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5 text-indigo-600" />
                  Assign Truck to {selectedDriverForAssign.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">Driver ID: {selectedDriverForAssign.id || (selectedDriverForAssign as any).uid}</p>
              </div>
              <button
                onClick={() => {
                  setShowDriverAssignModal(false);
                  setSelectedDriverForAssign(null);
                  setDriverAssignConflictError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Hooked Truck Display Banner */}
            {currentAssignedTruckForDriver ? (
              <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-950 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow">
                    <TruckIcon className="w-5 h-5 shrink-0" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                      <span>Truck #{currentAssignedTruckForDriver.truckNumber}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Currently Assigned
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700 font-mono mt-0.5">
                      VIN: {currentAssignedTruckForDriver.vin || 'N/A'} | Status: {currentAssignedTruckForDriver.status || 'Active'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnassignDriverFromTruck}
                  disabled={driverAssignSubmitting}
                  className="px-2.5 py-1.5 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition shrink-0 cursor-pointer shadow-sm"
                  title="Clear active truck assignment for this driver"
                >
                  Unassign Truck
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Driver currently has no active truck assigned. Select a registered unit below to assign.</span>
              </div>
            )}

            {driverAssignConflictError && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
                <div className="flex items-start gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Assignment Conflict Detected</span>
                </div>
                <p className="text-amber-800">{driverAssignConflictError.error}</p>
                <div className="pt-1 flex items-center justify-end">
                  <button
                    onClick={() => handleSaveDriverTruckAssignment(true)}
                    disabled={driverAssignSubmitting}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition"
                  >
                    {driverAssignSubmitting ? 'Overriding...' : 'Override & Reassign'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Fleet Truck *</label>
                <select
                  value={selectedTruckIdForDriver}
                  onChange={(e) => setSelectedTruckIdForDriver(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Select Central Registered Truck --</option>
                  {activeTrucksList.map((t: any, idx: number) => {
                    const isCurrent = currentAssignedTruckForDriver && (t.id === currentAssignedTruckForDriver.id || String(t.truckNumber).trim() === String(currentAssignedTruckForDriver.truckNumber).trim());
                    return (
                      <option key={t.id || `t-opt-${idx}`} value={t.id}>
                        Truck #{t.truckNumber} ({t.makeModel || t.make || 'Truck'}, VIN: {t.vin || 'N/A'}) {isCurrent ? '★ [CURRENTLY ASSIGNED]' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assignment Type</label>
                  <select
                    value={driverAssignType}
                    onChange={(e: any) => setDriverAssignType(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="primary">Primary Driver</option>
                    <option value="secondary">Co-Driver / Slipseat</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason</label>
                  <select
                    value={driverAssignReason}
                    onChange={(e) => setDriverAssignReason(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="truck_change">Routine Truck Swap</option>
                    <option value="new_assignment">New Onboarding</option>
                    <option value="temporary_cover">Breakdown Cover</option>
                    <option value="maintenance_swap">Maintenance Swap</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={driverAssignNotes}
                  onChange={(e) => setDriverAssignNotes(e.target.value)}
                  placeholder="e.g. Assigned for upcoming cross-country load"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowDriverAssignModal(false);
                  setSelectedDriverForAssign(null);
                  setDriverAssignConflictError(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveDriverTruckAssignment(false)}
                disabled={driverAssignSubmitting || !selectedTruckIdForDriver}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition cursor-pointer"
              >
                {driverAssignSubmitting ? 'Assigning...' : 'Confirm Truck Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DRIVER TRUCK ASSIGNMENT LEDGER */}
      {showDriverHistoryModal && selectedDriverForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  Truck Assignment History — {selectedDriverForHistory.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">Email: {selectedDriverForHistory.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowDriverHistoryModal(false);
                  setSelectedDriverForHistory(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 text-xs">
              {loadingDriverHistoryLedger ? (
                <div className="py-12 text-center text-slate-400">Loading driver history ledger...</div>
              ) : driverHistoryLedger.length === 0 ? (
                <div className="py-12 text-center text-slate-400">No truck assignment history records found for this driver.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase font-mono">
                      <th className="p-2.5">Truck #</th>
                      <th className="p-2.5">VIN</th>
                      <th className="p-2.5">Effective From</th>
                      <th className="p-2.5">Effective To</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {driverHistoryLedger.map((rec, idx) => (
                      <tr key={rec.id || `dhl-${idx}`} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold font-mono text-indigo-900">#{rec.truckNumberSnapshot || rec.truckId}</td>
                        <td className="p-2.5 font-mono text-slate-500">{rec.vinSnapshot || '—'}</td>
                        <td className="p-2.5 font-mono">{rec.effectiveFrom ? new Date(rec.effectiveFrom).toLocaleString() : '—'}</td>
                        <td className="p-2.5 font-mono">{rec.effectiveTo ? new Date(rec.effectiveTo).toLocaleString() : 'Present'}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rec.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500">{rec.reason || 'Routine'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => {
                  setShowDriverHistoryModal(false);
                  setSelectedDriverForHistory(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Profile Modal */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" id="edit-driver-modal">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-purple-400" />
                <div>
                  <h3 className="font-heading font-semibold text-sm">Modify Driver Profile & Operational Settings</h3>
                  <p className="text-[10px] text-slate-400">{editingDriver.name} • ID: {editingDriver.id.substring(0, 8)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditingDriver(null)} className="text-slate-400 hover:text-white text-xs p-1 cursor-pointer">✕</button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveDriverEditSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
              {/* Status Badge */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50 border border-purple-100 text-xs">
                <span className="font-bold text-purple-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                  Dispatcher Authorization
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${canEditDriver ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {canEditDriver ? '🟢 Edit Access Authorized' : '🔒 Permission Locked'}
                </span>
              </div>

              {/* Basic Driver Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editDriverName}
                    onChange={(e) => setEditDriverName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editDriverEmail}
                    onChange={(e) => setEditDriverEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Contact Phone Number</label>
                  <input
                    type="tel"
                    value={editDriverPhone}
                    onChange={(e) => setEditDriverPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Duty Status</label>
                  <select
                    value={editDriverDutyStatus}
                    onChange={(e) => setEditDriverDutyStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans font-semibold text-slate-700"
                  >
                    <option value="On Duty">🟢 On Duty</option>
                    <option value="Off Duty">⚫ Off Duty</option>
                    <option value="On Break">🟡 On Break</option>
                  </select>
                </div>
              </div>

              {/* License & Truck */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">CDL License #</label>
                  <input
                    type="text"
                    value={editDriverCdl}
                    onChange={(e) => setEditDriverCdl(e.target.value)}
                    placeholder="e.g. CDL-TX-882910"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Truck / Rig Code</label>
                  <input
                    type="text"
                    value={editDriverTruck}
                    onChange={(e) => setEditDriverTruck(e.target.value)}
                    placeholder="e.g. TRK-900"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                  />
                </div>
              </div>

              {/* Owner Operator Company Selection */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Owner Operator / Company</label>
                <select
                  value={
                    editDriverOwnerOperatorCompanyId ||
                    (ownerCompanies.find(o => o.legalName === editDriverOwnerOperator || o.dbaName === editDriverOwnerOperator || o.ownerName === editDriverOwnerOperator)?.id) ||
                    (editDriverOwnerOperator ? 'custom' : '')
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setEditDriverOwnerOperatorCompanyId('');
                      setEditDriverOwnerOperator('');
                    } else if (val === 'custom') {
                      setEditDriverOwnerOperatorCompanyId('');
                    } else {
                      setEditDriverOwnerOperatorCompanyId(val);
                      const matched = ownerCompanies.find(o => o.id === val);
                      if (matched) {
                        setEditDriverOwnerOperator(matched.legalName || matched.dbaName || matched.ownerName || '');
                      }
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans font-medium text-slate-800"
                >
                  <option value="">Not Selected (Can be assigned in Fleet Truck Overview)</option>
                  {ownerCompanies.map((oo) => (
                    <option key={oo.id} value={oo.id}>
                      {oo.legalName || oo.dbaName || oo.ownerName} {oo.ownerName ? `(${oo.ownerName})` : ''}
                    </option>
                  ))}
                  <option value="custom">-- Custom / Unregistered Company Name --</option>
                </select>

                {(!editDriverOwnerOperatorCompanyId && (editDriverOwnerOperator || ownerCompanies.length === 0)) && (
                  <input
                    type="text"
                    placeholder="Enter Custom Owner Operator or Company Name (e.g. JD Trucking LLC)"
                    value={editDriverOwnerOperator}
                    onChange={(e) => setEditDriverOwnerOperator(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans mt-1.5"
                  />
                )}
              </div>

              {/* Multi-Load Dispatch Settings */}
              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <TruckIcon className="h-3.5 w-3.5 text-purple-600" />
                      Allow Multiple Assigned Loads
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Allows driver to receive and view multiple simultaneous load dispatches
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDriverMultiLoadEnabled}
                      onChange={(e) => setEditDriverMultiLoadEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {editDriverMultiLoadEnabled && (
                  <div className="space-y-1 pt-2 border-t border-purple-100">
                    <label className="text-[10px] uppercase font-mono text-slate-600 font-bold block">
                      Maximum Open Loads (1-20)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editDriverMaximumOpenLoads}
                      onChange={(e) => setEditDriverMaximumOpenLoads(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Driver Operational Notes */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Operational Notes</label>
                <textarea
                  rows={2}
                  value={editDriverNotes}
                  onChange={(e) => setEditDriverNotes(e.target.value)}
                  placeholder="Special instructions, shift notes, preferred lanes..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans resize-none"
                />
              </div>

              {/* Form Footer Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDriver(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-semibold rounded-xl text-slate-600 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDriverEdit || !canEditDriver}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingDriverEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Updates...</span>
                    </>
                  ) : (
                    <span>Save Driver Profile</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Driver & Fleet Onboarding Modal */}
      <UnifiedDriverOnboardingModal
        isOpen={showUnifiedOnboardingModal}
        onClose={() => setShowUnifiedOnboardingModal(false)}
        company={company}
        existingTrucks={companyTrucksList}
        onSuccess={() => {
          setShowUnifiedOnboardingModal(false);
          fetchCompanyTrucks();
        }}
      />

    </div>
  );
}
