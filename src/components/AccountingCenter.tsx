import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Fuel, 
  FileText, 
  Settings, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  AlertCircle, 
  AlertTriangle,
  Plus, 
  Download, 
  Building2, 
  ShieldAlert, 
  ExternalLink,
  ChevronRight,
  Eye,
  FileCheck,
  Zap,
  ArrowRight,
  UserCheck,
  Banknote,
  Trash2,
  Truck as TruckIcon,
  Printer,
  Briefcase,
  ShieldCheck,
  CheckSquare,
  Layers,
  Users,
  Mail,
  Send,
  Calendar,
  Sparkles,
  X,
  Search,
  Check,
  Loader2
} from 'lucide-react';
import { 
  FormErrorSummary, 
  FieldErrorMessage, 
  getFieldInputClass, 
  LoadingSubmitButton, 
  UnsavedChangesDialog 
} from './common/FormComponents';
import { User, FuelEntry, Settlement, PayRule, CustomerInvoice, AccountingAuditLog, AccountingSyncLog, Advance, OwnerOperatorCompany, Truck, hasDispatcherPermission } from '../types';
import { db, auth } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import CompensationProfileManager from './CompensationProfileManager';
import { FuelCardsManager } from './FuelCardsManager';

interface AccountingCenterProps {
  currentUser: User;
  companyId: string;
}

export const AccountingCenter: React.FC<AccountingCenterProps> = ({ currentUser, companyId }) => {
  const [activeTab, setActiveTab] = useState<'settlements' | 'owner_operators' | 'comp_profiles' | 'advances' | 'fuel' | 'pay_rules' | 'invoices' | 'logs'>('settlements');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [payRules, setPayRules] = useState<PayRule[]>([]);
  const [invoices, setCustomerInvoices] = useState<CustomerInvoice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AccountingAuditLog[]>([]);
  const [syncLogs, setSyncLogs] = useState<AccountingSyncLog[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [selectedDriverForProfile, setSelectedDriverForProfile] = useState<User | null>(null);

  // Owner Operator & Truck States
  const [ownerOperators, setOwnerOperators] = useState<OwnerOperatorCompany[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loads, setLoads] = useState<any[]>([]);

  // Modals
  const [showCalculateModal, setShowCalculateModal] = useState<boolean>(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);
  const [showFuelModal, setShowFuelModal] = useState<boolean>(false);
  const [showPayRuleModal, setShowPayRuleModal] = useState<boolean>(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState<boolean>(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ type: 'settlement' | 'invoice'; id: string; name: string } | null>(null);

  // Owner Operator Modals
  const [showOOModal, setShowOOModal] = useState<boolean>(false);
  const [showTruckModal, setShowTruckModal] = useState<boolean>(false);
  const [showAssignDriverModal, setShowAssignDriverModal] = useState<boolean>(false);
  const [showAssignTruckDriverModal, setShowAssignTruckDriverModal] = useState<boolean>(false);
  const [showOOCalcModal, setShowOOCalcModal] = useState<boolean>(false);
  const [showStatementModal, setShowStatementModal] = useState<boolean>(false);
  const [selectedOOForStatement, setSelectedOOForStatement] = useState<OwnerOperatorCompany | null>(null);

  // Fleet Registry & Assignment Ledger States
  const [selectedTruckForAssign, setSelectedTruckForAssign] = useState<Truck | null>(null);
  const [assignDriverUid, setAssignDriverUid] = useState<string>('');
  const [assignType, setAssignType] = useState<'primary' | 'secondary'>('primary');
  const [assignReason, setAssignReason] = useState<string>('truck_change');
  const [assignNotes, setAssignNotes] = useState<string>('');
  const [assignConflictError, setAssignConflictError] = useState<any | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);

  const [showTruckHistoryModal, setShowTruckHistoryModal] = useState<boolean>(false);
  const [selectedTruckForHistory, setSelectedTruckForHistory] = useState<Truck | null>(null);
  const [truckAssignmentHistory, setTruckAssignmentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const [showMigrationModal, setShowMigrationModal] = useState<boolean>(false);
  const [migrationPreviewData, setMigrationPreviewData] = useState<any | null>(null);
  const [loadingMigrationPreview, setLoadingMigrationPreview] = useState<boolean>(false);
  const [executingMigration, setExecutingMigration] = useState<boolean>(false);
  const [migrationSuccessMsg, setMigrationSuccessMsg] = useState<string | null>(null);

  // Company Profile & Email Statement States
  const [companyProfile, setCompanyProfile] = useState<{
    legalName?: string;
    dbaName?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
    usdot?: string;
    mcNumber?: string;
  } | null>(null);

  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [emailRecipientInput, setEmailRecipientInput] = useState<string>('');
  const [emailCCAdmin, setEmailCCAdmin] = useState<boolean>(true);
  const [emailSending, setEmailSending] = useState<boolean>(false);

  // PDF Preview Modal State
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState<boolean>(false);
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [loadingPdfPreview, setLoadingPdfPreview] = useState<boolean>(false);

  // OO Company Form Validation & Saving State
  const [isSavingOO, setIsSavingOO] = useState<boolean>(false);
  const [ooFormError, setOoFormError] = useState<string | null>(null);
  const [ooFieldErrors, setOoFieldErrors] = useState<Record<string, string>>({});
  const [ooDuplicateWarning, setOoDuplicateWarning] = useState<any | null>(null);
  const [showOoUnsavedDialog, setShowOoUnsavedDialog] = useState<boolean>(false);

  const ooLegalNameRef = React.useRef<HTMLInputElement>(null);
  const ooOwnerNameRef = React.useRef<HTMLInputElement>(null);
  const ooTaxIdRef = React.useRef<HTMLInputElement>(null);
  const ooEmailRef = React.useRef<HTMLInputElement>(null);
  const ooPayBasisRef = React.useRef<HTMLInputElement>(null);
  const ooDispatchFeeRef = React.useRef<HTMLInputElement>(null);

  // Truck Form Validation & Saving State
  const [isSavingTruck, setIsSavingTruck] = useState<boolean>(false);
  const [truckFormError, setTruckFormError] = useState<string | null>(null);
  const [truckFieldErrors, setTruckFieldErrors] = useState<Record<string, string>>({});
  const [showTruckUnsavedDialog, setShowTruckUnsavedDialog] = useState<boolean>(false);

  const truckNumberRef = React.useRef<HTMLInputElement>(null);
  const truckVinRef = React.useRef<HTMLInputElement>(null);

  // Assign Driver Form Validation & Saving State
  const [isSavingAssign, setIsSavingAssign] = useState<boolean>(false);
  const [assignFormError, setAssignFormError] = useState<string | null>(null);
  const [assignFieldErrors, setAssignFieldErrors] = useState<Record<string, string>>({});

  // OO Calc Form Validation State
  const [isCalculatingOO, setIsCalculatingOO] = useState<boolean>(false);
  const [calcFormError, setCalcFormError] = useState<string | null>(null);

  // OO Company Form
  const [editingOOId, setEditingOOId] = useState<string | null>(null);
  const [ooLegalName, setOoLegalName] = useState<string>('');
  const [ooDbaName, setOoDbaName] = useState<string>('');
  const [ooOwnerName, setOoOwnerName] = useState<string>('');
  const [ooEmail, setOoEmail] = useState<string>('');
  const [ooPhone, setOoPhone] = useState<string>('');
  const [ooAddress, setOoAddress] = useState<string>('');
  const [ooTaxIdLast4, setOoTaxIdLast4] = useState<string>('');
  const [ooFrequency, setOoFrequency] = useState<'weekly' | 'per_load' | 'biweekly' | 'monthly'>('weekly');
  const [ooPayMethod, setOoPayMethod] = useState<'percentage_of_gross' | 'percentage_of_linehaul' | 'flat_per_load' | 'custom'>('percentage_of_gross');
  const [ooPayBasisPoints, setOoPayBasisPoints] = useState<string>('85.00'); // 85%
  const [ooDispatchFeeBasisPoints, setOoDispatchFeeBasisPoints] = useState<string>('10.00'); // 10%
  const [ooDeductFuel, setOoDeductFuel] = useState<boolean>(true);
  const [ooDeductAdvances, setOoDeductAdvances] = useState<boolean>(true);
  const [ooDeductInsurance, setOoDeductInsurance] = useState<boolean>(true);
  const [ooDeductTrailerRent, setOoDeductTrailerRent] = useState<boolean>(false);
  const [ooDeductMaintenance, setOoDeductMaintenance] = useState<boolean>(true);
  const [ooDeductEscrow, setOoDeductEscrow] = useState<boolean>(true);
  const [ooInsuranceDollars, setOoInsuranceDollars] = useState<string>('150.00');
  const [ooTrailerRentDollars, setOoTrailerRentDollars] = useState<string>('0.00');
  const [ooMaintenanceDollars, setOoMaintenanceDollars] = useState<string>('100.00');
  const [ooEscrowDollars, setOoEscrowDollars] = useState<string>('50.00');

  // Truck Form
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [truckNumber, setTruckNumber] = useState<string>('');
  const [truckVin, setTruckVin] = useState<string>('');
  const [truckMakeModel, setTruckMakeModel] = useState<string>('');
  const [truckYear, setTruckYear] = useState<string>('2024');
  const [truckLicensePlate, setTruckLicensePlate] = useState<string>('');
  const [truckOwnershipType, setTruckOwnershipType] = useState<string>('company_owned');
  const [truckOOCompanyId, setTruckOOCompanyId] = useState<string>('');
  const [truckDriverId, setTruckDriverId] = useState<string>('');
  const [truckStatus, setTruckStatus] = useState<string>('active');

  // Truck Deletion Verification Modal
  const [showDeleteTruckModal, setShowDeleteTruckModal] = useState<boolean>(false);
  const [selectedTruckForDelete, setSelectedTruckForDelete] = useState<Truck | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState<string>('');
  const [isDeletingTruck, setIsDeletingTruck] = useState<boolean>(false);

  // Assign Driver Form
  const [assignOOCompanyId, setAssignOOCompanyId] = useState<string>('');

  // OO Calc Form
  const [ooCalcCompanyId, setOoCalcCompanyId] = useState<string>('');
  const [ooCalcStart, setOoCalcStart] = useState<string>(new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
  const [ooCalcEnd, setOoCalcEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  // Advance Form
  const [advDriverUid, setAdvDriverUid] = useState<string>('');
  const [advType, setAdvType] = useState<'cash' | 'fuel' | 'check' | 'other'>('cash');
  const [advAmountDollars, setAdvAmountDollars] = useState<string>('250.00');
  const [advDeductionMethod, setAdvDeductionMethod] = useState<'full_next_settlement' | 'fixed_per_settlement'>('full_next_settlement');
  const [advFixedDeductionDollars, setAdvFixedDeductionDollars] = useState<string>('50.00');
  const [advNotes, setAdvNotes] = useState<string>('');
  const [advRefNumber, setAdvRefNumber] = useState<string>('');

  // Filter and pagination state for settlements
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [settlementSearchQuery, setSettlementSearchQuery] = useState<string>('');
  const [settlementPage, setSettlementPage] = useState<number>(1);
  const [settlementsPerPage, setSettlementsPerPage] = useState<number>(5);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);

  // Search and pagination state for Fleet Trucks
  const [truckSearchQuery, setTruckSearchQuery] = useState<string>('');
  const [truckPage, setTruckPage] = useState<number>(1);
  const [trucksPerPage, setTrucksPerPage] = useState<number>(5);

  // Search and delete state for Owner Operators
  const [ooSearchQuery, setOoSearchQuery] = useState<string>('');
  const [ooToDelete, setOoToDelete] = useState<OwnerOperatorCompany | null>(null);
  const [isDeletingOO, setIsDeletingOO] = useState<boolean>(false);
  const [ooDeleteError, setOoDeleteError] = useState<string | null>(null);

  // Calculation form
  const [calcLoadId, setCalcLoadId] = useState<string>('');
  const [calcDriverUid, setCalcDriverUid] = useState<string>('');
  const [calcPayRuleId, setCalcPayRuleId] = useState<string>('');
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    message: string;
    existingSettlementNumber?: string;
    loadNumber?: string;
  }>({ isOpen: false, message: '' });
  const [calcPeriodStart, setCalcPeriodStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [calcPeriodEnd, setCalcPeriodEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [calcSettlementType, setCalcSettlementType] = useState<'period' | 'load'>('period');

  // Fuel form
  const [fuelDate, setFuelDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [fuelVendor, setFuelVendor] = useState<string>('');
  const [fuelLocation, setFuelLocation] = useState<string>('');
  const [fuelState, setFuelState] = useState<string>('TX');
  const [fuelGallons, setFuelGallons] = useState<string>('');
  const [fuelPricePerGal, setFuelPricePerGal] = useState<string>('');
  const [fuelDriverUid, setFuelDriverUid] = useState<string>('');
  const [fuelLoadId, setFuelLoadId] = useState<string>('');

  // Pay Rule form
  const [ruleName, setRuleName] = useState<string>('');
  const [ruleAppliesTo, setRuleAppliesTo] = useState<'driver' | 'owner_operator'>('driver');
  const [ruleMethod, setRuleMethod] = useState<'percentage_of_gross' | 'per_mile' | 'flat_per_load'>('percentage_of_gross');
  const [rulePercentage, setRulePercentage] = useState<string>('60');
  const [ruleRatePerMile, setRuleRatePerMile] = useState<string>('0.75');
  const [ruleFlatAmount, setRuleFlatAmount] = useState<string>('1200.00');

  // Invoice form
  const [invBrokerName, setInvBrokerName] = useState<string>('');
  const [invLoadNumber, setInvLoadNumber] = useState<string>('');
  const [invAmount, setInvAmount] = useState<string>('2500.00');

  const isDriver = currentUser.role === 'driver';
  const isAdminOrSuper = currentUser.role === 'admin' || currentUser.role === 'super_admin';

  useEffect(() => {
    fetchData();
  }, [companyId, currentUser]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Missing auth token");

      const headers = { Authorization: `Bearer ${token}` };

      // Fetch Company Profile for Letterhead
      try {
        const resProfile = await fetch(`/api/accounting/company-profile/${companyId}`, { headers });
        if (resProfile.ok) {
          const dataProfile = await resProfile.json();
          setCompanyProfile(dataProfile.profile || null);
        }
      } catch (pErr) {
        console.warn("Could not fetch company profile:", pErr);
      }

      // Fetch Settlements
      const resSet = await fetch(`/api/accounting/settlements/${companyId}`, { headers });
      if (resSet.ok) {
        const dataSet = await resSet.json();
        setSettlements(dataSet.settlements || []);
      }

      // Fetch Advances
      const resAdv = await fetch(`/api/accounting/advances/${companyId}`, { headers });
      if (resAdv.ok) {
        const dataAdv = await resAdv.json();
        setAdvances(dataAdv.advances || []);
      }

      if (!isDriver) {
        // Fetch Owner Operators
        try {
          const resOO = await fetch(`/api/accounting/owner-operators/${companyId}`, { headers });
          if (resOO.ok) {
            const dataOO = await resOO.json();
            setOwnerOperators(dataOO.ownerOperators || []);
          }
        } catch (ooErr) {
          console.warn("Error fetching owner operators:", ooErr);
        }

        // Fetch Trucks
        try {
          const resTrucks = await fetch(`/api/accounting/trucks/${companyId}`, { headers });
          if (resTrucks.ok) {
            const dataTrucks = await resTrucks.json();
            setTrucks(dataTrucks.trucks || []);
          }
        } catch (trErr) {
          console.warn("Error fetching trucks:", trErr);
        }

        // Fetch Drivers List for selection
        try {
          const driversSnap = await getDocs(collection(db, "admins", companyId, "drivers"));
          const driversList: User[] = [];
          driversSnap.forEach((docSnap) => {
            const d = docSnap.data();
            driversList.push({
              ...d,
              id: docSnap.id,
              uid: docSnap.id,
              name: d.name || d.displayName || d.email || docSnap.id,
              email: d.email || '',
              phone: d.phone || d.phoneNumber || '',
              role: 'driver',
              companyId: companyId,
              status: d.status || 'active',
              ownerOperatorCompanyId: d.ownerOperatorCompanyId || null,
              ownerOperatorName: d.ownerOperatorName || '',
              truckNumber: d.truckNumber || d.currentTruckNumber || '',
              currentTruckId: d.currentTruckId || d.assignedTruckId || ''
            } as unknown as User);
          });
          setDrivers(driversList);
          if (driversList.length > 0) {
            setSelectedDriverForProfile(prev => prev || driversList[0]);
          }
        } catch (dErr) {
          console.warn("Could not fetch drivers list:", dErr);
        }

        // Fetch Fuel
        const resFuel = await fetch(`/api/accounting/fuel-entries/${companyId}`, { headers });
        if (resFuel.ok) {
          const dataFuel = await resFuel.json();
          setFuelEntries(dataFuel.fuelEntries || []);
        }

        // Fetch Pay Rules
        const resRules = await fetch(`/api/accounting/pay-rules/${companyId}`, { headers });
        if (resRules.ok) {
          const dataRules = await resRules.json();
          setPayRules(dataRules.payRules || []);
        }

        // Fetch Invoices
        const resInv = await fetch(`/api/accounting/invoices/${companyId}`, { headers });
        if (resInv.ok) {
          const dataInv = await resInv.json();
          setCustomerInvoices(dataInv.invoices || []);
        }

        // Fetch Logs
        const resLogs = await fetch(`/api/accounting/logs/${companyId}`, { headers });
        if (resLogs.ok) {
          const dataLogs = await resLogs.json();
          setAuditLogs(dataLogs.auditLogs || []);
          setSyncLogs(dataLogs.syncLogs || []);
        }

        // Fetch Loads for Mileage & Load Breakdown
        try {
          const loadsSnap = await getDocs(collection(db, "admins", companyId, "loads"));
          const loadsList: any[] = [];
          loadsSnap.forEach((dSnap) => {
            loadsList.push({ id: dSnap.id, ...dSnap.data() });
          });
          setLoads(loadsList);
        } catch (lErr) {
          console.warn("Could not fetch loads for accounting:", lErr);
        }
      }
    } catch (err: any) {
      console.error("Error loading accounting data:", err);
      setError(err.message || "Failed to load accounting details");
    } finally {
      setLoading(false);
    }
  };

  // Helper to format integer cents to USD
  const formatCents = (cents: number | undefined | null) => {
    if (cents === undefined || cents === null || isNaN(cents)) return '$0.00';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const reloadTrucks = async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers = { Authorization: `Bearer ${idToken}` };
      const res = await fetch(`/api/fleet/trucks/${companyId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTrucks(data.trucks || []);
      }
    } catch (err) {
      console.warn("Failed to reload trucks:", err);
    }
  };

  const handleOpenAssignDriverModal = (truck: Truck) => {
    setSelectedTruckForAssign(truck);
    setAssignDriverUid(truck.assignedDriverId || '');
    setAssignType('primary');
    setAssignReason('truck_change');
    setAssignNotes('');
    setAssignConflictError(null);
    setShowAssignTruckDriverModal(true);
  };

  const handleCreateAssignment = async (override = false) => {
    if (!selectedTruckForAssign || !assignDriverUid) return;
    setAssignSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/fleet/truck-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId,
          truckId: selectedTruckForAssign.id,
          driverId: assignDriverUid,
          assignmentType: assignType,
          reason: assignReason,
          notes: assignNotes,
          overrideConflict: override
        })
      });

      const data = await res.json();
      if (res.status === 409 && data.requiresOverride) {
        setAssignConflictError(data);
        setAssignSubmitting(false);
        return;
      }

      if (!res.ok) {
        alert(data.error || 'Failed to save truck assignment');
        setAssignSubmitting(false);
        return;
      }

      setShowAssignTruckDriverModal(false);
      setSelectedTruckForAssign(null);
      setAssignConflictError(null);
      await reloadTrucks();
      alert(data.message || 'Truck assignment saved successfully');
    } catch (err: any) {
      alert(err.message || 'Error submitting assignment');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleOpenTruckHistoryModal = async (truck: Truck) => {
    setSelectedTruckForHistory(truck);
    setShowTruckHistoryModal(true);
    setLoadingHistory(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/truck-assignments/${companyId}?truckId=${truck.id}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTruckAssignmentHistory(data.assignments || []);
      }
    } catch (err) {
      console.warn("Failed to fetch truck history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to end this assignment record?")) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/truck-assignments/${assignmentId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ companyId, endedReason: "Ended manually from Truck Registry" })
      });
      if (res.ok) {
        if (selectedTruckForHistory) {
          handleOpenTruckHistoryModal(selectedTruckForHistory);
        }
        await reloadTrucks();
      }
    } catch (err) {
      console.warn("Error ending assignment:", err);
    }
  };

  const handleOpenMigrationModal = async () => {
    setShowMigrationModal(true);
    setLoadingMigrationPreview(true);
    setMigrationSuccessMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/migration-preview/${companyId}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMigrationPreviewData(data);
      }
    } catch (err) {
      console.warn("Failed to fetch migration preview:", err);
    } finally {
      setLoadingMigrationPreview(false);
    }
  };

  const handleExecuteMigration = async () => {
    setExecutingMigration(true);
    setMigrationSuccessMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/execute-migration/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMigrationSuccessMsg(data.message || "Migration executed successfully!");
        await reloadTrucks();
        handleOpenMigrationModal();
      } else {
        alert(data.error || "Migration failed");
      }
    } catch (err: any) {
      alert(err.message || "Error executing migration");
    } finally {
      setExecutingMigration(false);
    }
  };

  const formatCompactStatementId = (id: string): string => {
    if (!id) return '—';
    let cleaned = id.replace(/^(settlement_|stl_|settlement-)/i, '');
    if (/^\d+$/.test(cleaned) && cleaned.length > 8) {
      cleaned = cleaned.slice(-8);
    }
    return `#${cleaned.toUpperCase()}`;
  };

  const getUniquePoNumber = (item: { id?: string; poNumber?: string; settlementNumber?: string; statementNumber?: string; invoiceNumber?: string } | null | undefined): string => {
    if (!item) return 'PO #102100';
    if (item.poNumber && item.poNumber.trim()) {
      const p = item.poNumber.trim();
      return p.startsWith('PO') || p.startsWith('#') ? p : `PO #${p}`;
    }
    const baseStr = item.settlementNumber || item.statementNumber || item.invoiceNumber || item.id || '102100';
    let hash = 0;
    for (let i = 0; i < baseStr.length; i++) {
      hash = (hash << 5) - hash + baseStr.charCodeAt(i);
      hash |= 0;
    }
    const num = 100000 + (Math.abs(hash) % 899999);
    return `PO #${num}`;
  };

  const formatSettlementPeriod = (s: Settlement) => {
    let start = s.periodStart || (s as any).settlementPeriodStart;
    let end = s.periodEnd || (s as any).settlementPeriodEnd;

    if (!start) {
      if (s.createdAt) {
        const d = new Date(s.createdAt);
        d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
      } else {
        start = new Date().toISOString().split('T')[0];
      }
    } else if (start.includes('T')) {
      start = start.split('T')[0];
    }

    if (!end) {
      if (s.createdAt) {
        end = s.createdAt.split('T')[0];
      } else {
        end = new Date().toISOString().split('T')[0];
      }
    } else if (end.includes('T')) {
      end = end.split('T')[0];
    }

    return `${start} to ${end}`;
  };

  const getSettlementLoads = (s: Settlement) => {
    if (!loads || loads.length === 0) return [];

    const loadIdsToMatch: string[] = [];
    if (s.loadId) loadIdsToMatch.push(s.loadId);
    if (s.loadIds && Array.isArray(s.loadIds)) loadIdsToMatch.push(...s.loadIds);
    if ((s as any).includedLoadIds && Array.isArray((s as any).includedLoadIds)) loadIdsToMatch.push(...(s as any).includedLoadIds);

    if (s.lineItems && s.lineItems.length > 0) {
      s.lineItems.forEach(li => {
        if (li.loadId && !loadIdsToMatch.includes(li.loadId)) {
          loadIdsToMatch.push(li.loadId);
        }
      });
    }

    if (loadIdsToMatch.length > 0) {
      return loads.filter(l => loadIdsToMatch.includes(l.id));
    }

    if (s.driverId) {
      return loads.filter(l => l.assignedDriverId === s.driverId && (l.status === 'delivered' || l.status === 'completed'));
    }
    if (s.ownerOperatorCompanyId) {
      return loads.filter(l => l.ownerOperatorCompanyId === s.ownerOperatorCompanyId && (l.status === 'delivered' || l.status === 'completed'));
    }

    return [];
  };

  const getSettlementTotalMiles = (s: Settlement) => {
    if (typeof s.totalMiles === 'number' && s.totalMiles > 0) return s.totalMiles;
    if (typeof (s as any).totalLoadedMiles === 'number' && (s as any).totalLoadedMiles > 0) {
      return ((s as any).totalLoadedMiles || 0) + ((s as any).totalEmptyMiles || 0);
    }

    const matchingLoads = getSettlementLoads(s);
    if (matchingLoads.length > 0) {
      return matchingLoads.reduce((sum, l) => {
        const loaded = Number(l.actualLoadedMiles || l.miles || l.distanceMiles || 0);
        const empty = Number(l.actualEmptyMiles || l.emptyMiles || 0);
        return sum + loaded + empty;
      }, 0);
    }

    return 0;
  };

  const getSettlementAdvancesList = (s: Settlement) => {
    const advLineItems = (s.lineItems || []).filter(li =>
      li.sourceType === 'advance' ||
      (li.category && li.category.toLowerCase().includes('advance')) ||
      (li.category && li.category.toLowerCase().includes('comcheck'))
    );

    if (advLineItems.length > 0) {
      return advLineItems.map(li => {
        const relatedAdv = advances.find(a => a.id === li.sourceId);
        return {
          id: li.id,
          category: li.category,
          description: li.description,
          amountCents: li.amountCents,
          issuedAt: (li as any).issuedAt || (relatedAdv ? relatedAdv.issuedAt : null) || (relatedAdv ? relatedAdv.createdAt : null) || li.createdAt,
          checkNumber: (li as any).checkNumber || (relatedAdv ? relatedAdv.checkNumber || relatedAdv.comcheckNumber || relatedAdv.referenceNumber : null) || '—',
          type: relatedAdv ? relatedAdv.type : 'Cash Advance'
        };
      });
    }

    if (s.driverId) {
      return advances.filter(a => a.driverId === s.driverId).map(a => ({
        id: a.id,
        category: 'Advance / Comcheck Repayment',
        description: `Advance (${a.type || 'Cash'})`,
        amountCents: a.originalAmountCents || 0,
        issuedAt: a.issuedAt || a.createdAt,
        checkNumber: a.checkNumber || a.comcheckNumber || a.referenceNumber || a.id,
        type: a.type
      }));
    }

    return [];
  };

  // Calculate Settlement Handler
  const handleCalculateSettlement = async (saveDraft: boolean, forceRecreate = false) => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/calculate-settlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          loadId: calcLoadId || null,
          driverId: calcDriverUid || currentUser.uid,
          payRuleId: calcPayRuleId || null,
          periodStart: calcPeriodStart,
          periodEnd: calcPeriodEnd,
          settlementType: calcSettlementType,
          saveDraft,
          forceRecreate
        })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }

      if (res.status === 409 || data.isDuplicate) {
        setDuplicateModal({
          isOpen: true,
          message: data.error || "This load or pay period has already been included in a generated settlement statement.",
          existingSettlementNumber: data.existingSettlementNumber,
          loadNumber: data.loadNumber
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || "Calculation failed");

      setSuccess(saveDraft ? "Settlement draft calculated and saved successfully!" : "Settlement preview generated!");
      if (data.settlement) {
        setSelectedSettlement(data.settlement);
      }
      setShowCalculateModal(false);
      setDuplicateModal({ isOpen: false, message: '' });
      setActiveTab('settlements');
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to calculate settlement");
    }
  };

  // Update Status Handler
  const handleUpdateStatus = async (settlementId: string, targetStatus: string) => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/settlement-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          settlementId,
          targetStatus
        })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }
      if (!res.ok) throw new Error(data.error || "Status update failed");

      setSuccess(`Settlement status updated to ${targetStatus.toUpperCase()}`);
      if (selectedSettlement && selectedSettlement.id === settlementId) {
        setSelectedSettlement(prev => prev ? { ...prev, status: targetStatus as any } : null);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  // View PDF Statement Preview Handler
  const handleViewStatementPreview = async () => {
    if (!selectedSettlement) return;
    try {
      setLoadingPdfPreview(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/accounting/settlements/${companyId}/${selectedSettlement.id}/pdf?disposition=inline`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        let errText = "Failed to load settlement PDF preview";
        try {
          const errData = await res.json();
          errText = errData.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      if (previewPdfBlobUrl) {
        window.URL.revokeObjectURL(previewPdfBlobUrl);
      }
      const url = window.URL.createObjectURL(blob);
      setPreviewPdfBlobUrl(url);
      setShowPdfPreviewModal(true);
    } catch (err: any) {
      setError(err.message || "Failed to load settlement preview");
    } finally {
      setLoadingPdfPreview(false);
    }
  };

  // Dedicated Print Statement Handler
  const handlePrintStatement = async () => {
    if (!selectedSettlement) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/accounting/settlements/${companyId}/${selectedSettlement.id}/pdf?disposition=inline`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        let errText = "Failed to load settlement PDF for printing";
        try {
          const errData = await res.json();
          errText = errData.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      // Print dedicated PDF in invisible iframe
      const printIframe = document.createElement("iframe");
      printIframe.style.position = "fixed";
      printIframe.style.right = "0";
      printIframe.style.bottom = "0";
      printIframe.style.width = "0";
      printIframe.style.height = "0";
      printIframe.style.border = "0";
      printIframe.src = blobUrl;

      document.body.appendChild(printIframe);

      printIframe.onload = () => {
        try {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
        } catch (printErr) {
          console.warn("Direct iframe print failed, opening PDF in new window:", printErr);
          window.open(blobUrl, "_blank");
        }
        setTimeout(() => {
          if (document.body.contains(printIframe)) {
            document.body.removeChild(printIframe);
          }
          window.URL.revokeObjectURL(blobUrl);
        }, 60000);
      };

      setSuccess(`Statement PDF generated and sent to printer for ${selectedSettlement.id}.`);
    } catch (err: any) {
      setError(err.message || "Error printing settlement statement");
    } finally {
      setLoading(false);
    }
  };

  // Dedicated Download PDF Handler
  const handleDownloadPDF = async () => {
    if (!selectedSettlement) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/accounting/settlements/${companyId}/${selectedSettlement.id}/pdf?disposition=attachment`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        let errText = "Failed to download settlement PDF";
        try {
          const errData = await res.json();
          errText = errData.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `TDPro-Settlement-${selectedSettlement.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(`Settlement PDF downloaded successfully for statement ${selectedSettlement.id}.`);
    } catch (err: any) {
      setError(err.message || "Failed to download settlement PDF");
    } finally {
      setLoading(false);
    }
  };

  // Send Email Statement Handler
  const handleSendEmailStatement = async () => {
    if (!selectedSettlement || !emailRecipientInput) return;
    try {
      setEmailSending(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/accounting/settlements/${companyId}/${selectedSettlement.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          emailRecipient: emailRecipientInput,
          ccAdmin: emailCCAdmin
        })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }
      if (!res.ok) throw new Error(data.error || "Failed to send settlement email");

      setSuccess(data.message || `Settlement statement ${selectedSettlement.id} successfully queued for email delivery.`);
      setShowEmailModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to send email statement");
    } finally {
      setEmailSending(false);
    }
  };

  // Execute Delete Settlement
  const executeDeleteSettlement = async (settlementId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/accounting/settlement/${companyId}/${settlementId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }
      if (!res.ok) throw new Error(data.error || "Failed to delete settlement");

      setSuccess("Draft settlement deleted successfully.");
      if (selectedSettlement?.id === settlementId) {
        setSelectedSettlement(null);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to delete settlement");
    }
  };

  // Execute Delete Invoice
  const executeDeleteInvoice = async (invoiceId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/accounting/invoice/${companyId}/${invoiceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }
      if (!res.ok) throw new Error(data.error || "Failed to delete invoice");

      setSuccess("Draft invoice deleted successfully.");
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to delete invoice");
    }
  };

  // OO Company Handlers
  const resetOoForm = () => {
    setEditingOOId(null);
    setOoLegalName('');
    setOoDbaName('');
    setOoOwnerName('');
    setOoEmail('');
    setOoPhone('');
    setOoAddress('');
    setOoTaxIdLast4('');
    setOoFrequency('weekly');
    setOoPayMethod('percentage_of_gross');
    setOoPayBasisPoints('85.00');
    setOoDispatchFeeBasisPoints('10.00');
    setOoInsuranceDollars('150.00');
    setOoTrailerRentDollars('0.00');
    setOoMaintenanceDollars('100.00');
    setOoEscrowDollars('50.00');
    setOoFormError(null);
    setOoFieldErrors({});
    setOoDuplicateWarning(null);
  };

  const handleAttemptCloseOOModal = () => {
    if (isSavingOO) return;
    const isOoDirty = Boolean(
      ooLegalName.trim() ||
      ooDbaName.trim() ||
      ooOwnerName.trim() ||
      ooEmail.trim() ||
      ooPhone.trim() ||
      ooTaxIdLast4.trim()
    );
    if (isOoDirty) {
      setShowOoUnsavedDialog(true);
    } else {
      setShowOOModal(false);
      resetOoForm();
    }
  };

  const handleSaveOOCompany = async (confirmDuplicate = false) => {
    setOoFormError(null);
    setOoFieldErrors({});
    setOoDuplicateWarning(null);

    const errors: Record<string, string> = {};
    const trimmedLegal = ooLegalName.trim();
    const trimmedOwner = ooOwnerName.trim();

    if (!trimmedLegal) {
      errors.legalName = "Legal Company Name is required.";
    }
    if (!trimmedOwner) {
      errors.ownerName = "Owner / Primary Contact is required.";
    }
    if (ooTaxIdLast4.trim() && !/^\d{4}$/.test(ooTaxIdLast4.trim())) {
      errors.taxIdLast4 = "Tax ID / EIN Last 4 must contain exactly 4 digits.";
    }
    if (ooEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ooEmail.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    const payBasis = parseFloat(ooPayBasisPoints);
    if (isNaN(payBasis) || payBasis < 0 || payBasis > 100) {
      errors.payBasis = "Default Pay Basis must be between 0% and 100%.";
    }

    const dispatchFee = parseFloat(ooDispatchFeeBasisPoints);
    if (isNaN(dispatchFee) || dispatchFee < 0 || dispatchFee > 100) {
      errors.dispatchFee = "Dispatch Fee must be between 0% and 100%.";
    }

    if (Object.keys(errors).length > 0) {
      setOoFormError("We could not save this owner-operator company. Review the highlighted fields.");
      setOoFieldErrors(errors);

      if (errors.legalName) {
        ooLegalNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooLegalNameRef.current?.focus();
      } else if (errors.ownerName) {
        ooOwnerNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooOwnerNameRef.current?.focus();
      } else if (errors.taxIdLast4) {
        ooTaxIdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooTaxIdRef.current?.focus();
      } else if (errors.email) {
        ooEmailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooEmailRef.current?.focus();
      } else if (errors.payBasis) {
        ooPayBasisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooPayBasisRef.current?.focus();
      } else if (errors.dispatchFee) {
        ooDispatchFeeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ooDispatchFeeRef.current?.focus();
      }
      return;
    }

    try {
      setIsSavingOO(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/owner-operator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          id: editingOOId || undefined,
          legalName: trimmedLegal,
          dbaName: ooDbaName.trim(),
          ownerName: trimmedOwner,
          email: ooEmail.trim(),
          phone: ooPhone.trim(),
          address: ooAddress.trim(),
          taxIdLast4: ooTaxIdLast4.trim(),
          settlementFrequency: ooFrequency,
          defaultPayMethod: ooPayMethod,
          defaultPayBasisPoints: Math.round(payBasis * 100),
          dispatchFeeBasisPoints: Math.round(dispatchFee * 100),
          deductFuel: ooDeductFuel,
          deductAdvances: ooDeductAdvances,
          deductInsurance: ooDeductInsurance,
          deductTrailerRent: ooDeductTrailerRent,
          deductMaintenance: ooDeductMaintenance,
          deductEscrow: ooDeductEscrow,
          defaultInsuranceDeductionCents: Math.round((parseFloat(ooInsuranceDollars) || 0) * 100),
          defaultTrailerRentCents: Math.round((parseFloat(ooTrailerRentDollars) || 0) * 100),
          defaultMaintenanceDeductionCents: Math.round((parseFloat(ooMaintenanceDollars) || 0) * 100),
          defaultEscrowDeductionCents: Math.round((parseFloat(ooEscrowDollars) || 0) * 100),
          confirmDuplicate
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.isDuplicate) {
          setOoDuplicateWarning(data);
          setOoFormError(data.error || "A company with a similar legal name or Tax ID may already exist.");
          return;
        }
        if (data.fieldErrors) {
          setOoFieldErrors(data.fieldErrors);
        }
        throw new Error(data.error || "Failed to save Owner Operator Company profile.");
      }

      setSuccess("Owner Operator Company profile saved successfully.");
      setShowOOModal(false);
      resetOoForm();
      fetchData();
    } catch (err: any) {
      setOoFormError(err.message || "Failed to save Owner Operator Company");
    } finally {
      setIsSavingOO(false);
    }
  };

  const handleDeleteOOCompany = async (ooId: string) => {
    try {
      setIsDeletingOO(true);
      setOoDeleteError(null);
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch('/api/accounting/owner-operator', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          id: ooId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete Owner Operator profile');
      }

      setSuccess('Owner Operator tile deleted successfully. Assigned drivers and trucks remain intact.');
      setOoToDelete(null);
      fetchData();
    } catch (err: any) {
      setOoDeleteError(err.message || 'Failed to delete Owner Operator profile');
    } finally {
      setIsDeletingOO(false);
    }
  };

  // Truck Handlers
  const resetTruckForm = () => {
    setEditingTruckId(null);
    setTruckNumber('');
    setTruckVin('');
    setTruckMakeModel('');
    setTruckYear('2024');
    setTruckLicensePlate('');
    setTruckOwnershipType('company_owned');
    setTruckOOCompanyId('');
    setTruckDriverId('');
    setTruckStatus('active');
    setTruckFormError(null);
    setTruckFieldErrors({});
  };

  const handleAttemptCloseTruckModal = () => {
    if (isSavingTruck) return;
    const isTruckDirty = Boolean(truckNumber.trim() || truckVin.trim() || truckLicensePlate.trim());
    if (isTruckDirty) {
      setShowTruckUnsavedDialog(true);
    } else {
      setShowTruckModal(false);
      resetTruckForm();
    }
  };

  const handleOpenNewTruckModal = () => {
    resetTruckForm();
    setShowTruckModal(true);
  };

  const handleOpenEditTruckModal = (t: Truck) => {
    setEditingTruckId(t.id);
    setTruckNumber(t.truckNumber || '');
    setTruckVin(t.vin || '');
    setTruckMakeModel(t.makeModel || (t.make && t.model ? `${t.make} ${t.model}` : ''));
    setTruckYear(t.year || '2024');
    setTruckLicensePlate(t.licensePlate || '');
    setTruckOwnershipType(t.ownershipType || (t.ownerOperatorCompanyId || t.currentOwnerOperatorCompanyId ? 'owner_operator' : 'company_owned'));
    setTruckOOCompanyId(t.ownerOperatorCompanyId || t.currentOwnerOperatorCompanyId || '');
    setTruckDriverId(t.assignedDriverId || t.currentDriverId || '');
    setTruckStatus(t.status || 'active');
    setTruckFormError(null);
    setTruckFieldErrors({});
    setShowTruckModal(true);
  };

  const handleSaveTruck = async () => {
    setTruckFormError(null);
    setTruckFieldErrors({});

    const errors: Record<string, string> = {};
    const trimmedNumber = truckNumber.trim();
    if (!trimmedNumber) {
      errors.truckNumber = "Truck Number is required.";
    }

    if (Object.keys(errors).length > 0) {
      setTruckFormError("We could not save this truck. Review the highlighted fields.");
      setTruckFieldErrors(errors);
      truckNumberRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      truckNumberRef.current?.focus();
      return;
    }

    try {
      setIsSavingTruck(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/trucks/${companyId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: editingTruckId || undefined,
          companyId,
          truckNumber: trimmedNumber,
          vin: truckVin ? truckVin.trim() : null,
          makeModel: truckMakeModel ? truckMakeModel.trim() : null,
          year: truckYear ? String(truckYear).trim() : null,
          licensePlate: truckLicensePlate ? truckLicensePlate.trim() : null,
          ownershipType: truckOwnershipType,
          currentOwnerOperatorCompanyId: truckOOCompanyId || null,
          ownerOperatorCompanyId: truckOOCompanyId || null,
          assignedDriverId: truckDriverId || null,
          currentDriverId: truckDriverId || null,
          status: truckStatus
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) setTruckFieldErrors(data.fieldErrors);
        throw new Error(data.error || "Failed to save Truck");
      }

      setSuccess(`Truck #${trimmedNumber} saved successfully.`);
      setShowTruckModal(false);
      resetTruckForm();
      await reloadTrucks();
      fetchData();
    } catch (err: any) {
      setTruckFormError(err.message || "Failed to save Truck");
    } finally {
      setIsSavingTruck(false);
    }
  };

  const handleOpenDeleteTruckModal = (t: Truck) => {
    setSelectedTruckForDelete(t);
    setDeleteConfirmInput('');
    setShowDeleteTruckModal(true);
  };

  const handleConfirmDeleteTruck = async (mode: 'archive' | 'permanent') => {
    if (!selectedTruckForDelete) return;
    if (deleteConfirmInput.trim().toUpperCase() !== 'DELETE') {
      setError('Please type "DELETE" exactly to confirm truck removal.');
      return;
    }

    try {
      setIsDeletingTruck(true);
      setError(null);
      const targetId = selectedTruckForDelete.id || selectedTruckForDelete.truckNumber || selectedTruckForDelete.vin;
      if (!targetId) {
        throw new Error("Target truck ID is missing.");
      }
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/trucks/${companyId}/${encodeURIComponent(targetId)}?mode=${mode}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove truck');

      setSuccess(data.message || `Truck #${selectedTruckForDelete.truckNumber || targetId} removed.`);
      setShowDeleteTruckModal(false);
      setSelectedTruckForDelete(null);
      setDeleteConfirmInput('');
      await reloadTrucks();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error executing truck deletion/archiving');
    } finally {
      setIsDeletingTruck(false);
    }
  };

  const handleDeduplicateFleet = async () => {
    try {
      setIsDeletingTruck(true);
      setError(null);
      setSuccess(null);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/fleet/deduplicate-trucks/${companyId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deduplicate fleet');
      setSuccess(data.message || 'Duplicate trucks consolidated successfully.');
      await reloadTrucks();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error executing fleet deduplication');
    } finally {
      setIsDeletingTruck(false);
    }
  };

  // Assign Driver to OO Company Handler
  const handleAssignDriverOO = async () => {
    setAssignFormError(null);
    setAssignFieldErrors({});

    const errors: Record<string, string> = {};
    if (!assignDriverUid) {
      errors.driver = "Please select a driver.";
    }
    if (!assignOOCompanyId) {
      errors.company = "Please select an Owner Operator Company.";
    }

    if (Object.keys(errors).length > 0) {
      setAssignFormError("Please select both a driver and an Owner Operator Company.");
      setAssignFieldErrors(errors);
      return;
    }

    try {
      setIsSavingAssign(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/assign-driver-owner-operator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          driverId: assignDriverUid,
          ownerOperatorCompanyId: assignOOCompanyId,
          workerType: 'owner_operator_driver'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign driver");

      setSuccess("Driver assigned to Owner Operator Company successfully.");
      setShowAssignDriverModal(false);
      setAssignDriverUid('');
      setAssignOOCompanyId('');
      setAssignFormError(null);
      setAssignFieldErrors({});
      fetchData();
    } catch (err: any) {
      setAssignFormError(err.message || "Failed to assign driver");
    } finally {
      setIsSavingAssign(false);
    }
  };

  // Calculate Owner Operator Settlement Handler
  const handleCalculateOOSettlement = async (saveDraft: boolean) => {
    setCalcFormError(null);
    if (!ooCalcCompanyId) {
      setCalcFormError("Please select an Owner Operator Company.");
      return;
    }

    try {
      setIsCalculatingOO(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/calculate-owner-operator-settlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          ownerOperatorCompanyId: ooCalcCompanyId,
          periodStart: ooCalcStart,
          periodEnd: ooCalcEnd,
          saveDraft
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to calculate owner operator settlement");

      setSuccess(saveDraft ? "Owner Operator draft settlement saved successfully!" : "Preview generated!");
      if (data.settlement) {
        setSelectedSettlement(data.settlement);
      }
      setShowOOCalcModal(false);
      setActiveTab('settlements');
      fetchData();
    } catch (err: any) {
      setCalcFormError(err.message || "Failed to calculate owner operator settlement");
    } finally {
      setIsCalculatingOO(false);
    }
  };

  // QuickBooks Sync Handler
  const handleQuickBooksSync = async (entityType: 'invoice' | 'settlement', entityId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/quickbooks-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          entityType,
          entityId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "QuickBooks sync failed");

      setSuccess(data.message || "QuickBooks sync completed successfully!");
      fetchData();
    } catch (err: any) {
      setError(err.message || "QuickBooks sync failed");
    }
  };

  // QuickBooks Payment Status Update Handler
  const handleQuickBooksPaymentUpdate = async (entityType: 'invoice' | 'settlement', entityId: string, paymentStatus: 'paid' | 'partially_paid') => {
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/quickbooks-payment-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          entityType,
          entityId,
          paymentStatus,
          externalPaymentId: `QB-PMT-${Date.now()}`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment update failed");

      setSuccess(`Payment status synced from QuickBooks: ${paymentStatus.toUpperCase()}`);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update payment status");
    }
  };

  // Create Advance Handler
  const handleCreateAdvance = async () => {
    setError(null);
    setSuccess(null);
    try {
      if (!advDriverUid) throw new Error("Please select a target driver for the advance");
      const origCents = Math.round(parseFloat(advAmountDollars || '0') * 100);
      if (!origCents || origCents <= 0) throw new Error("Please enter a valid advance amount");

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/advance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          driverId: advDriverUid,
          type: advType,
          originalAmountCents: origCents,
          deductionMethod: advDeductionMethod,
          fixedDeductionCents: advDeductionMethod === 'fixed_per_settlement' ? Math.round(parseFloat(advFixedDeductionDollars || '0') * 100) : null,
          notes: advNotes,
          checkNumber: advRefNumber,
          referenceNumber: advRefNumber
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create advance");

      setSuccess("Advance issued and recorded successfully!");
      setAdvNotes('');
      setAdvRefNumber('');
      setShowAdvanceModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to issue advance");
    }
  };

  // Add Fuel Entry Handler
  const handleAddFuelEntry = async () => {
    setError(null);
    setSuccess(null);
    try {
      const g = parseFloat(fuelGallons);
      const ppg = parseFloat(fuelPricePerGal);

      if (!g || !ppg || g <= 0 || ppg <= 0) {
        throw new Error("Please enter valid gallons and price per gallon");
      }

      const ppgCents = Math.round(ppg * 100);

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/fuel-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          loadId: fuelLoadId || null,
          driverId: fuelDriverUid || currentUser.uid,
          fuelDate,
          fuelVendor: fuelVendor || 'Fleet Fuel Station',
          fuelLocation: fuelLocation || 'Highway Stop',
          state: fuelState,
          gallons: g,
          pricePerGallonCents: ppgCents,
          source: 'manual'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add fuel entry");

      setSuccess("Fuel entry recorded successfully with integer-cents calculation!");
      setShowFuelModal(false);
      setFuelGallons('');
      setFuelPricePerGal('');
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save fuel entry");
    }
  };

  // Add Pay Rule Handler
  const handleAddPayRule = async () => {
    setError(null);
    setSuccess(null);
    try {
      if (!ruleName) throw new Error("Pay rule name is required");

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/pay-rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          name: ruleName,
          appliesTo: ruleAppliesTo,
          method: ruleMethod,
          percentage: ruleMethod === 'percentage_of_gross' ? parseFloat(rulePercentage) : null,
          ratePerMileCents: ruleMethod === 'per_mile' ? Math.round(parseFloat(ruleRatePerMile) * 100) : null,
          flatAmountCents: ruleMethod === 'flat_per_load' ? Math.round(parseFloat(ruleFlatAmount) * 100) : null,
          defaultDeductions: [
            { id: 'def_1', category: 'Insurance', description: 'Weekly Bobtail Insurance', amountCents: 5000 }
          ],
          isActive: true
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create pay rule");

      setSuccess("Pay rule created successfully!");
      setShowPayRuleModal(false);
      setRuleName('');
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save pay rule");
    }
  };

  // Create Invoice Handler
  const handleAddInvoice = async () => {
    setError(null);
    setSuccess(null);
    try {
      if (!invBrokerName) throw new Error("Broker/Customer name is required");

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          brokerName: invBrokerName,
          invoiceNumber: `INV-${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'draft',
          lineItems: [
            { id: 'invline_1', category: 'Linehaul', description: `Freight Charges - ${invLoadNumber || 'Load'}`, amountCents: Math.round(parseFloat(invAmount) * 100) }
          ]
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");

      setSuccess("Customer broker invoice created successfully!");
      setShowInvoiceModal(false);
      setInvBrokerName('');
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save invoice");
    }
  };

  const filteredSettlements = settlements.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) {
      return false;
    }
    if (settlementSearchQuery.trim()) {
      const q = settlementSearchQuery.toLowerCase();
      const matchId = (s.id || '').toLowerCase().includes(q);
      const matchDriver = (s.driverName || '').toLowerCase().includes(q);
      const matchOO = (s.ownerOperatorName || '').toLowerCase().includes(q);
      const matchStatus = (s.status || '').toLowerCase().includes(q);
      const matchNet = (s.netPayCents ? (s.netPayCents / 100).toFixed(2) : '0').includes(q);
      const matchType = (s.settlementType || '').toLowerCase().includes(q);
      return matchId || matchDriver || matchOO || matchStatus || matchNet || matchType;
    }
    return true;
  });

  return (
    <div className="space-y-6 text-slate-800">
      {/* Top Banner / System Header */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">Financial Operations Center</h2>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 font-medium px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                Audit-Safe (Integer Cents)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Server-authoritative fleet registry, driver assignments & financial calculation engine with immutable lock enforcement & QuickBooks integration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 text-xs font-bold hover:underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 text-xs font-bold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
            activeTab === 'settlements'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Driver & OO Settlements
        </button>

        {!isDriver && (
          <>
            <button
              onClick={() => setActiveTab('owner_operators')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'owner_operators'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Owner Operator Companies
            </button>

            <button
              onClick={() => setActiveTab('comp_profiles')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'comp_profiles'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Compensation Profiles
            </button>

            <button
              onClick={() => setActiveTab('advances')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'advances'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Banknote className="w-4 h-4" />
              Driver Advances
            </button>

            <button
              onClick={() => setActiveTab('fuel')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'fuel'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Fuel className="w-4 h-4" />
              Fuel Center
            </button>

            <button
              onClick={() => setActiveTab('pay_rules')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'pay_rules'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              Pay Rules
            </button>

            <button
              onClick={() => setActiveTab('invoices')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'invoices'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              Broker Invoices
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              Sync & Audit Logs
            </button>
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* TAB: OWNER OPERATOR COMPANIES              */}
      {/* ========================================== */}
      {activeTab === 'owner_operators' && (
        <div className="space-y-6">
          {/* Top Controls Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-600" />
                Owner Operator Companies (Vendors)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage vendor companies owning 1+ trucks, assign drivers, configure default deductions & calculate multi-truck settlements.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setEditingOOId(null);
                  setOoLegalName('');
                  setOoDbaName('');
                  setOoOwnerName('');
                  setOoEmail('');
                  setOoPhone('');
                  setOoAddress('');
                  setOoTaxIdLast4('');
                  setShowOOModal(true);
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add OO Company
              </button>

              <button
                onClick={() => setShowOOCalcModal(true)}
                className="flex items-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl transition border border-emerald-300"
              >
                <Calculator className="w-4 h-4" />
                Calculate OO Settlement
              </button>
            </div>
          </div>

          {/* OO Search Engine Bar */}
          {ownerOperators.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative flex-1 max-w-lg">
                <input
                  type="text"
                  placeholder="Search OO companies, owner name, DBA, EIN/SSN, email, phone..."
                  value={ooSearchQuery}
                  onChange={(e) => setOoSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white shadow-xs transition"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                {ooSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOoSearchQuery('')}
                    className="absolute right-2.5 top-2.5 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
                  Showing {ownerOperators.filter((oo) => {
                    if (!ooSearchQuery.trim()) return true;
                    const q = ooSearchQuery.toLowerCase().trim();
                    return (oo.legalName || '').toLowerCase().includes(q) ||
                      (oo.dbaName || '').toLowerCase().includes(q) ||
                      (oo.ownerName || '').toLowerCase().includes(q) ||
                      (oo.email || '').toLowerCase().includes(q) ||
                      (oo.phone || '').toLowerCase().includes(q) ||
                      (oo.taxIdLast4 || '').toLowerCase().includes(q);
                  }).length} of {ownerOperators.length} OO Companies
                </span>
                {ooSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOoSearchQuery('')}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline px-2 py-1 cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>
          )}

          {/* OO Companies Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ownerOperators.length === 0 ? (
              <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
                <Briefcase className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-base font-bold text-slate-700">No Owner Operator Companies Registered</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Click "Add OO Company" above to register an owner-operator company/vendor that owns multiple trucks and drivers.
                </p>
              </div>
            ) : (() => {
              const filteredOwnerOperators = ownerOperators.filter((oo) => {
                if (!ooSearchQuery.trim()) return true;
                const q = ooSearchQuery.toLowerCase().trim();
                return (oo.legalName || '').toLowerCase().includes(q) ||
                  (oo.dbaName || '').toLowerCase().includes(q) ||
                  (oo.ownerName || '').toLowerCase().includes(q) ||
                  (oo.email || '').toLowerCase().includes(q) ||
                  (oo.phone || '').toLowerCase().includes(q) ||
                  (oo.taxIdLast4 || '').toLowerCase().includes(q);
              });

              if (filteredOwnerOperators.length === 0) {
                return (
                  <div className="col-span-full bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-3">
                    <Search className="w-10 h-10 text-slate-300 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-800">No Owner Operator Companies Match "{ooSearchQuery}"</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Try adjusting your search query or clear the filter to see all owner-operator tiles.
                    </p>
                    <button
                      type="button"
                      onClick={() => setOoSearchQuery('')}
                      className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl transition border border-slate-300 cursor-pointer"
                    >
                      Clear Search Filter
                    </button>
                  </div>
                );
              }

              return filteredOwnerOperators.map((oo, idx) => {
                const ooTrucks = trucks.filter(t =>
                  t.ownerOperatorCompanyId === oo.id ||
                  (t.ownerOperatorVendor && (
                    t.ownerOperatorVendor.trim().toLowerCase() === (oo.legalName || '').trim().toLowerCase() ||
                    t.ownerOperatorVendor.trim().toLowerCase() === (oo.dbaName || '').trim().toLowerCase() ||
                    t.ownerOperatorVendor.trim().toLowerCase() === (oo.ownerName || '').trim().toLowerCase()
                  ))
                );

                const ooDrivers = drivers.filter(d => {
                  const dOOId = (d as any).ownerOperatorCompanyId;
                  const dOOName = ((d as any).ownerOperatorName || '').trim().toLowerCase();
                  const ooLegal = (oo.legalName || '').trim().toLowerCase();
                  const ooDba = (oo.dbaName || '').trim().toLowerCase();
                  const ooOwner = (oo.ownerName || '').trim().toLowerCase();

                  if (dOOId && dOOId === oo.id) return true;
                  if (Array.isArray((oo as any).assignedDriverIds) && ((oo as any).assignedDriverIds.includes(d.id) || (oo as any).assignedDriverIds.includes((d as any).uid))) return true;
                  if (Array.isArray((oo as any).driverIds) && ((oo as any).driverIds.includes(d.id) || (oo as any).driverIds.includes((d as any).uid))) return true;

                  if (dOOName && (
                    (ooLegal && dOOName === ooLegal) ||
                    (ooDba && dOOName === ooDba) ||
                    (ooOwner && dOOName === ooOwner)
                  )) return true;

                  const assignedTruck = ooTrucks.find(t =>
                    (t.assignedDriverId && (t.assignedDriverId === d.id || t.assignedDriverId === (d as any).uid)) ||
                    (t.currentDriverId && (t.currentDriverId === d.id || t.currentDriverId === (d as any).uid)) ||
                    ((d as any).currentTruckId && t.id === (d as any).currentTruckId) ||
                    ((d as any).truckNumber && t.truckNumber === (d as any).truckNumber)
                  );
                  if (assignedTruck) return true;

                  return false;
                });

                return (
                  <div key={oo.id || `oo-${idx}`} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-slate-300 transition flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="text-base font-bold text-slate-900">{oo.legalName}</h4>
                          {oo.dbaName && <p className="text-xs text-slate-500 font-medium">DBA: {oo.dbaName}</p>}
                          <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" /> Owner: <strong className="text-slate-800">{oo.ownerName}</strong>
                          </p>
                        </div>
                        <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200 uppercase font-bold">
                          {oo.settlementFrequency || 'Weekly'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Pay Basis</span>
                          <span className="font-semibold text-slate-700">
                            {((oo.defaultPayBasisPoints || 8500) / 100).toFixed(1)}% of Gross
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Dispatch Fee</span>
                          <span className="font-semibold text-slate-700">
                            {((oo.dispatchFeeBasisPoints || 1000) / 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Trucks</span>
                          <span className="font-bold text-emerald-600 flex items-center gap-1">
                            <TruckIcon className="w-3 h-3" /> {ooTrucks.length} Trucks
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Drivers</span>
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {ooDrivers.length} Drivers
                          </span>
                        </div>
                      </div>

                      {/* Contact & Tax Info */}
                      <div className="text-xs space-y-1 text-slate-600">
                        {oo.email && <p className="truncate">Email: {oo.email}</p>}
                        {oo.phone && <p>Phone: {oo.phone}</p>}
                        {oo.taxIdLast4 && <p className="font-mono text-[11px] text-slate-500">EIN/SSN: ***-**-{oo.taxIdLast4}</p>}
                      </div>

                      {/* Deductions badges */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {oo.deductFuel !== false && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Fuel</span>}
                        {oo.deductAdvances !== false && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Advances</span>}
                        {oo.deductInsurance !== false && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Insurance</span>}
                        {oo.deductMaintenance !== false && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Maintenance</span>}
                        {oo.deductEscrow !== false && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Escrow</span>}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOOForStatement(oo);
                            setShowStatementModal(true);
                          }}
                          className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition border border-emerald-200 flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" /> Statement
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingOOId(oo.id);
                            setOoLegalName(oo.legalName);
                            setOoDbaName(oo.dbaName || '');
                            setOoOwnerName(oo.ownerName);
                            setOoEmail(oo.email || '');
                            setOoPhone(oo.phone || '');
                            setOoAddress(oo.address || '');
                            setOoTaxIdLast4(oo.taxIdLast4 || '');
                            setOoFrequency(oo.settlementFrequency as any || 'weekly');
                            setOoPayBasisPoints(((oo.defaultPayBasisPoints || 8500) / 100).toString());
                            setOoDispatchFeeBasisPoints(((oo.dispatchFeeBasisPoints || 1000) / 100).toString());
                            setShowOOModal(true);
                          }}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setOoToDelete(oo);
                          setOoDeleteError(null);
                        }}
                        title="Delete Owner Operator Tile"
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition border border-rose-200/60 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete Tile</span>
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Fleet Trucks Table */}
          {(() => {
            const filteredTrucks = trucks.filter((t) => {
              if (!truckSearchQuery.trim()) return true;
              const q = truckSearchQuery.toLowerCase().trim();
              const ooComp = ownerOperators.find(o => o.id === (t.ownerOperatorCompanyId || t.currentOwnerOperatorCompanyId));
              const drv = drivers.find(d => (d.id || d.uid) === (t.assignedDriverId || t.currentDriverId));

              const matchTruckNum = (t.truckNumber || '').toLowerCase().includes(q);
              const matchVin = (t.vin || '').toLowerCase().includes(q);
              const matchPlate = (t.licensePlate || '').toLowerCase().includes(q);
              const matchMakeModel = (t.makeModel || `${t.make || ''} ${t.model || ''}`).toLowerCase().includes(q);
              const matchYear = (t.year || '').toString().includes(q);
              const matchOO = (ooComp?.legalName || 'Company Owned').toLowerCase().includes(q);
              const matchDriver = (drv?.name || 'Unassigned').toLowerCase().includes(q) || (drv?.email || '').toLowerCase().includes(q);
              const matchStatus = (t.status || 'Active').toLowerCase().includes(q);

              return matchTruckNum || matchVin || matchPlate || matchMakeModel || matchYear || matchOO || matchDriver || matchStatus;
            });

            // Duplicate VIN calculation
            const vinCounts: { [vin: string]: number } = {};
            trucks.forEach(t => {
              if (t.vin && String(t.vin).trim()) {
                const k = String(t.vin).trim().toUpperCase();
                vinCounts[k] = (vinCounts[k] || 0) + 1;
              }
            });
            const duplicateVins = Object.keys(vinCounts).filter(k => vinCounts[k] > 1);

            const totalTrucks = filteredTrucks.length;
            const totalTruckPages = Math.ceil(totalTrucks / trucksPerPage) || 1;
            const currentTruckPage = Math.min(truckPage, totalTruckPages);
            const startTruckIndex = (currentTruckPage - 1) * trucksPerPage;
            const endTruckIndex = Math.min(totalTrucks, currentTruckPage * trucksPerPage);
            const paginatedTrucks = filteredTrucks.slice(startTruckIndex, endTruckIndex);

            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <TruckIcon className="w-4 h-4 text-slate-600" /> Fleet Trucks Overview ({trucks.length})
                  </h4>

                  {/* Instant Search Engine Bar */}
                  <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="relative w-full">
                      <input
                        type="text"
                        placeholder="Search truck #, VIN, make, driver, vendor..."
                        value={truckSearchQuery}
                        onChange={(e) => {
                          setTruckSearchQuery(e.target.value);
                          setTruckPage(1);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white shadow-sm transition"
                      />
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      {truckSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setTruckSearchQuery('');
                            setTruckPage(1);
                          }}
                          className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {duplicateVins.length > 0 && (
                      <button
                        onClick={handleDeduplicateFleet}
                        disabled={isDeletingTruck}
                        className="text-xs text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        title="Consolidate duplicate truck entries into single primary records"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {isDeletingTruck ? 'Cleaning...' : 'Deduplicate Fleet'}
                      </button>
                    )}
                    <button
                      onClick={handleOpenMigrationModal}
                      className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title="Dry run preview and centralize legacy truck strings"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Sync & Centralize Fleet
                    </button>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                      <Eye className="w-3.5 h-3.5 text-slate-500" /> Read-Only View
                    </span>
                  </div>
                </div>

                {/* READ-ONLY FLEET MANAGEMENT NOTICE BANNER */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2.5 shadow-sm">
                  <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                  <p className="text-[11px]">
                    <strong className="text-slate-800">Centralized Fleet Ledger:</strong> Power unit creation, spec editing, driver assignments, and status updates are managed strictly in the central <strong>Fleet &amp; Equipment Operations Center</strong> tab to keep all data synchronized.
                  </p>
                </div>

                {/* DUPLICATE VIN WARNING BANNER */}
                {duplicateVins.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-bold">Duplicate Fleet Entries Detected ({duplicateVins.length} VINs affected)</p>
                        <p className="text-[11px] text-amber-800">
                          Multiple truck records share identical VIN numbers ({duplicateVins.slice(0, 3).join(', ')}{duplicateVins.length > 3 ? '...' : ''}). Click Deduplicate to clean automatically.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleDeduplicateFleet}
                      disabled={isDeletingTruck}
                      className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isDeletingTruck ? 'Cleaning...' : 'Clean Duplicate Trucks'}
                    </button>
                  </div>
                )}

                {trucks.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No trucks registered yet.</p>
                ) : filteredTrucks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500 font-sans space-y-1">
                    <p className="font-semibold text-slate-700">No trucks match "{truckSearchQuery}"</p>
                    <p className="text-[11px] text-slate-400">Try searching by truck number, VIN, make/model, driver name, or vendor.</p>
                  </div>
                ) : (
                  <div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="p-3">Truck #</th>
                            <th className="p-3">VIN</th>
                            <th className="p-3">Make / Model / Year</th>
                            <th className="p-3">Owner Operator Vendor</th>
                            <th className="p-3">Assigned Driver</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedTrucks.map((t, idx) => {
                            const ooComp = ownerOperators.find(o => o.id === (t.ownerOperatorCompanyId || t.currentOwnerOperatorCompanyId));
                            const drv = drivers.find(d => (d.id || d.uid) === (t.assignedDriverId || t.currentDriverId));
                            const isArchived = t.status === 'archived';
                            const isVinDuplicate = t.vin && String(t.vin).trim() && vinCounts[String(t.vin).trim().toUpperCase()] > 1;

                            return (
                              <tr key={t.id || `truck-${idx}`} className={`hover:bg-slate-50/80 ${isArchived ? 'bg-slate-50/50 opacity-70' : ''}`}>
                                <td className="p-3 font-bold font-mono text-slate-900">
                                  #{t.truckNumber}
                                  {t.licensePlate && (
                                    <span className="block text-[10px] text-slate-400 font-sans font-normal">Plate: {t.licensePlate}</span>
                                  )}
                                </td>
                                <td className="p-3 font-mono text-slate-600">
                                  {t.vin || '—'}
                                  {isVinDuplicate && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                      <AlertTriangle className="w-2.5 h-2.5 text-rose-600" /> DUPLICATE
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-700">{t.makeModel || (t.make && t.model ? `${t.make} ${t.model}` : 'Truck')} ({t.year || '2024'})</td>
                                <td className="p-3 font-semibold text-slate-800">{ooComp ? ooComp.legalName : '— (Company Owned)'}</td>
                                <td className="p-3 text-slate-700 font-medium">
                                  {drv ? (
                                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                      {drv.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                    isArchived
                                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                                      : t.status === 'maintenance'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : t.status === 'out_of_service'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}>
                                    {t.status || 'Active'}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    <button
                                      onClick={() => handleOpenTruckHistoryModal(t)}
                                      className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer flex items-center gap-1"
                                      title="View assignment and maintenance ledger history"
                                    >
                                      History
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Engine Footer */}
                    {totalTrucks > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-600 font-sans mt-3">
                        <div className="flex items-center gap-3">
                          <span>
                            Showing <strong className="text-slate-800">{totalTrucks === 0 ? 0 : startTruckIndex + 1}</strong> to <strong className="text-slate-800">{endTruckIndex}</strong> of <strong className="text-slate-800">{totalTrucks}</strong> trucks
                          </span>
                          <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                            <span>Per page:</span>
                            <select
                              value={trucksPerPage}
                              onChange={(e) => {
                                setTrucksPerPage(Number(e.target.value));
                                setTruckPage(1);
                              }}
                              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
                            disabled={currentTruckPage <= 1}
                            onClick={() => setTruckPage(prev => Math.max(1, prev - 1))}
                            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                          >
                            Previous
                          </button>
                          
                          <div className="flex items-center gap-1 font-mono text-xs">
                            {Array.from({ length: totalTruckPages }, (_, i) => i + 1).map((p) => {
                              if (
                                p === 1 ||
                                p === totalTruckPages ||
                                (p >= currentTruckPage - 1 && p <= currentTruckPage + 1)
                              ) {
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => setTruckPage(p)}
                                    className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                                      p === currentTruckPage
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                );
                              }
                              if (
                                (p === 2 && currentTruckPage > 3) ||
                                (p === totalTruckPages - 1 && currentTruckPage < totalTruckPages - 2)
                              ) {
                                return <span key={p} className="px-1 text-slate-400 font-bold">...</span>;
                              }
                              return null;
                            })}
                          </div>

                          <button
                            type="button"
                            disabled={currentTruckPage >= totalTruckPages}
                            onClick={() => setTruckPage(prev => Math.min(totalTruckPages, prev + 1))}
                            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 1: SETTLEMENTS                         */}
      {/* ========================================== */}
      {activeTab === 'settlements' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
              {['all', 'draft', 'reviewed', 'approved', 'locked', 'synced', 'paid'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition capitalize ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {!isDriver && (
              <button
                onClick={() => setShowCalculateModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Calculate New Settlement
              </button>
            )}
          </div>

          {/* Settlements Grid / List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Settlement List */}
            {(() => {
              const totalCount = filteredSettlements.length;
              const totalPages = Math.ceil(totalCount / settlementsPerPage) || 1;
              const currentPage = Math.min(settlementPage, totalPages);
              const startIndex = (currentPage - 1) * settlementsPerPage;
              const endIndex = Math.min(totalCount, currentPage * settlementsPerPage);
              const paginatedSettlements = filteredSettlements.slice(startIndex, endIndex);

              return (
                <div className="lg:col-span-1 space-y-3">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Settlement Statements ({totalCount})
                    </h3>
                  </div>

                  {/* Search Engine Input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search statement ID, driver, operator..."
                      value={settlementSearchQuery}
                      onChange={(e) => {
                        setSettlementSearchQuery(e.target.value);
                        setSettlementPage(1);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-sm"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    {settlementSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettlementSearchQuery('');
                          setSettlementPage(1);
                        }}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {filteredSettlements.length === 0 ? (
                    <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
                      No settlements found for selected filter or search query.
                    </div>
                  ) : (
                    <>
                      {paginatedSettlements.map((s, idx) => {
                        const isSelected = selectedSettlement?.id === s.id;
                        const isLocked = s.status === 'locked' || s.status === 'synced' || s.status === 'paid';

                        return (
                          <div
                            key={s.id || `stl-${idx}`}
                            onClick={() => setSelectedSettlement(s)}
                            className={`p-4 rounded-xl border transition cursor-pointer space-y-2.5 ${
                              isSelected
                                ? 'bg-emerald-50/50 border-emerald-500 shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-mono font-semibold text-slate-600 truncate max-w-[100px]" title={s.id}>
                                  {formatCompactStatementId(s.id)}
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200" title="Unique PO Number for accounting">
                                  {getUniquePoNumber(s)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  s.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                  s.status === 'locked' ? 'bg-indigo-100 text-indigo-800' :
                                  s.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                  s.status === 'reviewed' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {isLocked && <Lock className="w-2.5 h-2.5 inline mr-1" />}
                                  {s.status}
                                </span>
                                {(s.status === 'draft' || s.status === 'reviewed' || !s.status) && !isDriver && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmTarget({ type: 'settlement', id: s.id, name: s.driverName || s.id });
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                    title="Delete draft settlement"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="font-bold text-slate-900 text-sm">{s.driverName || 'Driver Settlement'}</div>
                              <div className="text-xs text-slate-500">{s.ownerOperatorName ? `Owner Op: ${s.ownerOperatorName}` : 'W-2 Driver'}</div>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                              <span className="text-slate-500">Net Pay:</span>
                              <span className="font-bold text-slate-900 text-sm">{formatCents(s.netPayCents)}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination Controls */}
                      {totalCount > 0 && (
                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              Showing <strong>{totalCount === 0 ? 0 : startIndex + 1}</strong>–<strong>{endIndex}</strong> of <strong>{totalCount}</strong>
                            </span>
                            <div className="flex items-center gap-1">
                              <span>Per page:</span>
                              <select
                                value={settlementsPerPage}
                                onChange={(e) => {
                                  setSettlementsPerPage(Number(e.target.value));
                                  setSettlementPage(1);
                                }}
                                className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                              >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                            <button
                              type="button"
                              disabled={currentPage <= 1}
                              onClick={() => setSettlementPage(prev => Math.max(1, prev - 1))}
                              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[11px]"
                            >
                              Prev
                            </button>

                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                                if (
                                  p === 1 ||
                                  p === totalPages ||
                                  (p >= currentPage - 1 && p <= currentPage + 1)
                                ) {
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => setSettlementPage(p)}
                                      className={`w-6 h-6 rounded-md font-bold flex items-center justify-center transition cursor-pointer ${
                                        p === currentPage
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      {p}
                                    </button>
                                  );
                                }
                                if (
                                  (p === 2 && currentPage > 3) ||
                                  (p === totalPages - 1 && currentPage < totalPages - 2)
                                ) {
                                  return <span key={p} className="px-0.5 text-slate-400 font-bold">..</span>;
                                }
                                return null;
                              })}
                            </div>

                            <button
                              type="button"
                              disabled={currentPage >= totalPages}
                              onClick={() => setSettlementPage(prev => Math.min(totalPages, prev + 1))}
                              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[11px]"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Right Column: Detailed Statement Inspector */}
            <div className="lg:col-span-2">
              {selectedSettlement ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 printable-statement">
                  {/* Top Action Bar (Print, PDF, Email, Status Transitions) */}
                  <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 border-b border-slate-100 pb-4 print:hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-slate-900 text-white font-bold px-2.5 py-1 rounded-lg max-w-[180px] truncate" title={selectedSettlement.id}>
                        {formatCompactStatementId(selectedSettlement.id)}
                      </span>
                      <span className="text-xs font-mono bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" title="Unique PO Number for Accounting">
                        {getUniquePoNumber(selectedSettlement)}
                      </span>
                      <span className={`text-xs px-2.5 py-1 rounded-lg font-bold capitalize ${
                        selectedSettlement.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        selectedSettlement.status === 'locked' || selectedSettlement.status === 'synced' ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' :
                        selectedSettlement.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {selectedSettlement.status || 'draft'}
                      </span>
                    </div>

                    {/* TOP-RIGHT ACTION BUTTONS */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleViewStatementPreview}
                        disabled={loadingPdfPreview}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm disabled:opacity-50"
                        title="View Dedicated PDF Statement Preview"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        {loadingPdfPreview ? "Loading..." : "View Statement"}
                      </button>

                      <button
                        onClick={handlePrintStatement}
                        className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
                        title="Print Dedicated PDF Statement"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        Print Statement
                      </button>

                      <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
                        title="Download Statement PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>

                      <button
                        onClick={() => {
                          setEmailRecipientInput(selectedSettlement.driverEmail || selectedSettlement.ownerOperatorEmail || '');
                          setShowEmailModal(true);
                        }}
                        className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold px-3.5 py-2 rounded-xl transition"
                        title="Email Statement to Payee"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Email Statement
                      </button>

                      {/* Admin Workflow Status Actions */}
                      {!isDriver && (
                        <>
                          {(selectedSettlement.status === 'draft' || selectedSettlement.status === 'reviewed' || !selectedSettlement.status) && (
                            <button
                              onClick={() => setDeleteConfirmTarget({ type: 'settlement', id: selectedSettlement.id, name: selectedSettlement.driverName || selectedSettlement.id })}
                              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-2 rounded-xl transition flex items-center gap-1"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}

                          {selectedSettlement.status === 'draft' && (
                            <button
                              onClick={() => handleUpdateStatus(selectedSettlement.id, 'reviewed')}
                              className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-2 rounded-xl transition"
                            >
                              Reviewed
                            </button>
                          )}

                          {(selectedSettlement.status === 'draft' || selectedSettlement.status === 'reviewed') && (
                            <button
                              onClick={() => handleUpdateStatus(selectedSettlement.id, 'approved')}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl transition"
                            >
                              Approve
                            </button>
                          )}

                          {selectedSettlement.status === 'approved' && (
                            <button
                              onClick={() => handleUpdateStatus(selectedSettlement.id, 'locked')}
                              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-xl transition flex items-center gap-1"
                            >
                              <Lock className="w-3 h-3" />
                              Lock
                            </button>
                          )}

                          {(selectedSettlement.status === 'approved' || selectedSettlement.status === 'locked') && (
                            <button
                              onClick={() => handleQuickBooksSync('settlement', selectedSettlement.id)}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl transition flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3" />
                              Sync QB
                            </button>
                          )}

                          {(selectedSettlement.status === 'locked' || selectedSettlement.status === 'synced') && (
                            <button
                              onClick={() => handleUpdateStatus(selectedSettlement.id, 'paid')}
                              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-xl transition"
                            >
                              Mark Paid
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Lock Warning Banner */}
                  {(selectedSettlement.status === 'locked' || selectedSettlement.status === 'synced' || selectedSettlement.status === 'paid') && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl flex items-center gap-3 text-xs print:hidden">
                      <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        <strong>IMMUTABLE AUDIT LOCK:</strong> This statement is locked and backed by audit log records.
                      </span>
                    </div>
                  )}

                  {/* CARRIER / ADMIN LETTERHEAD BRANDING */}
                  <div className="border-b-2 border-slate-900 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      {companyProfile?.logoUrl ? (
                        <img src={companyProfile.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
                      ) : (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl font-bold flex items-center justify-center text-sm shadow-sm">
                          <TruckIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                      )}
                      <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                          {companyProfile?.companyName || companyProfile?.legalName || companyProfile?.name || 'Truck Dispatch Pro Carrier'}
                        </h2>
                        {companyProfile?.adminName && (
                          <p className="text-xs font-bold text-slate-700 mt-0.5">
                            Admin / Fleet Contact: <span className="text-slate-900">{companyProfile.adminName}</span>
                          </p>
                        )}
                        {companyProfile?.dbaName && (
                          <p className="text-xs text-slate-500 font-medium">DBA: {companyProfile.dbaName}</p>
                        )}
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {companyProfile?.address || '100 Logistics Way, Suite 400, Dallas, TX 75201'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-600 space-y-0.5">
                      <p>Phone: <strong>{companyProfile?.phone || '(800) 555-8782'}</strong></p>
                      <p>Email: <strong>{companyProfile?.email || 'dispatch@truckdispatchpro.com'}</strong></p>
                      {companyProfile?.website && <p>Web: <strong>{companyProfile.website}</strong></p>}
                      <div className="flex justify-end gap-2 text-[10px] text-slate-500 font-mono mt-1">
                        {companyProfile?.usdot && <span>USDOT: <strong>{companyProfile.usdot}</strong></span>}
                        {companyProfile?.mcNumber && <span>MC: <strong>{companyProfile.mcNumber}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {/* STATEMENT HEADER & PERIOD METADATA */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block truncate">Statement #</span>
                      <strong className="font-mono text-slate-900 block truncate text-xs" title={selectedSettlement.id}>
                        {formatCompactStatementId(selectedSettlement.id)}
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase block truncate">PO Number (Unique)</span>
                      <strong className="font-mono text-indigo-900 block truncate text-xs font-black bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        {getUniquePoNumber(selectedSettlement)}
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block truncate">Settlement Type</span>
                      <strong className="capitalize text-slate-800 block truncate" title={selectedSettlement.settlementType ? selectedSettlement.settlementType.replace(/_/g, ' ') : (selectedSettlement.ownerOperatorCompanyId ? 'Owner Operator Company' : 'Company Driver')}>
                        {selectedSettlement.settlementType ? selectedSettlement.settlementType.replace(/_/g, ' ') : (selectedSettlement.ownerOperatorCompanyId ? 'Owner Operator Company' : 'Company Driver')}
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block truncate">Settlement Period</span>
                      <strong className="text-slate-800 block truncate" title={formatSettlementPeriod(selectedSettlement)}>
                        {formatSettlementPeriod(selectedSettlement)}
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block truncate">Total Miles</span>
                      <strong className="text-slate-800 block truncate font-mono">
                        {getSettlementTotalMiles(selectedSettlement).toLocaleString()} mi
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block truncate">Generated Date</span>
                      <strong className="text-slate-800 block truncate">
                        {new Date(selectedSettlement.createdAt).toLocaleDateString()}
                      </strong>
                    </div>
                  </div>

                  {/* PAYEE SECTION */}
                  <div className="border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payee Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <span className="text-slate-500 block">Name:</span>
                        <strong className="text-slate-900 text-sm">{selectedSettlement.driverName || selectedSettlement.ownerOperatorName || 'Payee'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Contact Email:</span>
                        <span className="text-slate-800">{selectedSettlement.driverEmail || selectedSettlement.ownerOperatorEmail || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Vendor ID / QB ID:</span>
                        <span className="font-mono text-slate-800">{selectedSettlement.quickBooksBillId || selectedSettlement.driverId || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* LOAD & MILEAGE BREAKDOWN SECTION */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Load & Mileage Breakdown</h4>
                      <span className="text-[11px] text-slate-500 font-mono font-medium">
                        Total Distance: <strong>{getSettlementTotalMiles(selectedSettlement).toLocaleString()} mi</strong>
                      </span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <th className="p-2.5">Load #</th>
                            <th className="p-2.5">1st Pickup Date</th>
                            <th className="p-2.5">Final Delivery Date</th>
                            <th className="p-2.5">Customer & Complete Route</th>
                            <th className="p-2.5 text-right">Loaded Mi</th>
                            <th className="p-2.5 text-right">Empty Mi</th>
                            <th className="p-2.5 text-right">Total Distance</th>
                            <th className="p-2.5 text-right">Gross Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {getSettlementLoads(selectedSettlement).length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-3 text-center text-slate-400">
                                {selectedSettlement.loadId ? (
                                  <span>Load #{selectedSettlement.loadId} — {getSettlementTotalMiles(selectedSettlement)} total miles recorded</span>
                                ) : (
                                  <span>Single load or bulk period summary statement ({getSettlementTotalMiles(selectedSettlement)} total miles)</span>
                                )}
                              </td>
                            </tr>
                          ) : (
                            getSettlementLoads(selectedSettlement).map((l, idx) => {
                              const loaded = Number(l.actualLoadedMiles || l.loadedMiles || l.miles || l.distanceMiles || 0);
                              const empty = Number(l.actualEmptyMiles || l.emptyMiles || 0);
                              const tot = Number(l.totalMiles || (loaded + empty));
                              const origin = l.origin || l.pickupAddress || l.pickupCity || (l.originCity ? `${l.originCity}, ${l.originState || ''}` : '—');
                              const dest = l.destination || l.deliveryAddress || l.deliveryCity || (l.destinationCity ? `${l.destinationCity}, ${l.destinationState || ''}` : '—');
                              const pickupDate = l.pickupDate || l.pickupDateTime || l.firstPickupDate || (l.stops && l.stops.length > 0 ? (l.stops[0].date || l.stops[0].pickupDate) : null);
                              const deliveryDate = l.deliveryDate || l.deliveryDateTime || l.finalDeliveryDate || (l.stops && l.stops.length > 0 ? (l.stops[l.stops.length - 1].date || l.stops[l.stops.length - 1].deliveryDate) : null);
                              const formattedPickup = pickupDate ? String(pickupDate).split('T')[0] : '—';
                              const formattedDelivery = deliveryDate ? String(deliveryDate).split('T')[0] : '—';
                              const custStr = l.customerName || l.customer || l.brokerName || '—';
                              const rate = l.rateCents ? l.rateCents : (l.rate ? Math.round(Number(l.rate) * 100) : 0);

                              return (
                                <tr key={l.id || `load-${idx}`} className="hover:bg-slate-50/50">
                                  <td className="p-2.5 font-mono font-bold text-slate-900">#{l.loadNumber || l.id.slice(-6).toUpperCase()}</td>
                                  <td className="p-2.5 text-slate-800 font-medium">{formattedPickup}</td>
                                  <td className="p-2.5 text-slate-800 font-medium">{formattedDelivery}</td>
                                  <td className="p-2.5 text-slate-700">
                                    <span className="font-semibold text-slate-900 block">{custStr !== '—' ? custStr : 'Direct Load'}</span>
                                    <span className="text-[11px] text-slate-500 font-mono">{origin} → {dest}</span>
                                  </td>
                                  <td className="p-2.5 text-right font-mono">{loaded > 0 ? `${loaded} mi` : '—'}</td>
                                  <td className="p-2.5 text-right font-mono">{empty > 0 ? `${empty} mi` : '—'}</td>
                                  <td className="p-2.5 text-right font-mono font-bold text-slate-900">{tot > 0 ? `${tot} mi` : '—'}</td>
                                  <td className="p-2.5 text-right font-bold text-emerald-700">{formatCents(rate)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ADVANCES & COMCHECKS ISSUED SECTION */}
                  {getSettlementAdvancesList(selectedSettlement).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Advances & Comchecks Deducted</h4>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-amber-50 text-amber-900 font-bold border-b border-amber-200">
                              <th className="p-2.5">Issued Date</th>
                              <th className="p-2.5">Type</th>
                              <th className="p-2.5">Check / Ref #</th>
                              <th className="p-2.5">Description</th>
                              <th className="p-2.5 text-right">Deducted Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {getSettlementAdvancesList(selectedSettlement).map((adv, idx) => (
                              <tr key={adv.id || `adv-${idx}`} className="hover:bg-amber-50/30">
                                <td className="p-2.5 font-mono text-slate-800">
                                  {adv.issuedAt ? new Date(adv.issuedAt).toLocaleDateString() : '—'}
                                </td>
                                <td className="p-2.5 font-semibold capitalize text-slate-800">
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-bold">
                                    {adv.type ? adv.type.toUpperCase() : 'CASH ADVANCE'}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono text-slate-900 font-bold">#{adv.checkNumber}</td>
                                <td className="p-2.5 text-slate-600">{adv.description}</td>
                                <td className="p-2.5 text-right font-bold text-rose-600">-{formatCents(adv.amountCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* OWNER OPERATOR COMPANY TRUCK BREAKDOWN (IF APPLICABLE) */}
                  {selectedSettlement.settlementType === 'owner_operator_company' && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Owner Operator Fleet Breakdown</h4>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="p-2.5">Truck #</th>
                              <th className="p-2.5">Driver</th>
                              <th className="p-2.5 text-center">Loads</th>
                              <th className="p-2.5 text-right">Loaded Miles</th>
                              <th className="p-2.5 text-right">Gross Revenue</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {trucks.filter(t => t.ownerOperatorCompanyId === selectedSettlement.ownerOperatorCompanyId).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-3 text-center text-slate-400">Fleet details recorded on summary statement</td>
                              </tr>
                            ) : (
                              trucks.filter(t => t.ownerOperatorCompanyId === selectedSettlement.ownerOperatorCompanyId).map((t, idx) => {
                                const drv = drivers.find(d => (d.id || d.uid) === t.assignedDriverId);
                                return (
                                  <tr key={t.id || `oo-truck-${idx}`}>
                                    <td className="p-2.5 font-mono font-bold">#{t.truckNumber}</td>
                                    <td className="p-2.5">{drv ? drv.name : 'Unassigned'}</td>
                                    <td className="p-2.5 text-center">{selectedSettlement.includedLoadIds ? selectedSettlement.includedLoadIds.length : 1}</td>
                                    <td className="p-2.5 text-right font-mono">{selectedSettlement.totalMiles || 0} mi</td>
                                    <td className="p-2.5 text-right font-bold text-slate-900">{formatCents(selectedSettlement.grossRevenueCents)}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* FINANCIAL METRICS SUMMARY */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Gross Revenue</div>
                      <div className="text-base font-bold text-slate-900 mt-1">{formatCents(selectedSettlement.grossRevenueCents)}</div>
                    </div>
                    <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">(+) Total Earnings</div>
                      <div className="text-base font-bold text-emerald-800 mt-1">{formatCents(selectedSettlement.totalEarningsCents)}</div>
                    </div>
                    <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200">
                      <div className="text-[10px] font-bold text-rose-700 uppercase">(-) Total Deductions</div>
                      <div className="text-base font-bold text-rose-800 mt-1">{formatCents(selectedSettlement.totalDeductionsCents)}</div>
                    </div>
                    <div className="p-3.5 bg-slate-900 text-white rounded-xl">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase">(=) Net Settlement</div>
                      <div className="text-base font-bold text-white mt-1">{formatCents(selectedSettlement.netPayCents)}</div>
                    </div>
                  </div>

                  {/* FUEL CONSOLIDATION & TRANSACTION SUMMARY CARD */}
                  {selectedSettlement.fuelConsolidation && selectedSettlement.fuelConsolidation.summaryGroups && selectedSettlement.fuelConsolidation.summaryGroups.length > 0 && (
                    <div className="space-y-3 bg-slate-50/80 border border-slate-200 p-4 rounded-xl">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Fuel className="w-4 h-4 text-amber-600" />
                          <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                            Fuel & Fluid Consolidation Summary
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
                          Total Volume: {selectedSettlement.fuelConsolidation.grandTotalGallons.toFixed(2)} gal | Total Deducted: {formatCents(selectedSettlement.fuelConsolidation.grandTotalAmountCents)}
                        </span>
                      </div>

                      {/* Product Category Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {selectedSettlement.fuelConsolidation.summaryGroups.map((grp: any, gIdx: number) => (
                          <div key={`fg-${gIdx}`} className="bg-white p-2.5 rounded-lg border border-slate-200">
                            <div className="font-bold text-slate-800 text-[11px] truncate">{grp.category}</div>
                            <div className="text-slate-500 font-mono text-[10px] mt-0.5">
                              {grp.transactionCount} txn{grp.transactionCount > 1 ? 's' : ''} ({grp.totalGallons.toFixed(1)} gal)
                            </div>
                            <div className="font-bold text-rose-600 font-mono mt-1 text-xs">
                              -{formatCents(grp.totalAmountCents)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Itemized Fuel Appendix Drawer */}
                      {selectedSettlement.fuelConsolidation.itemizedTransactions && selectedSettlement.fuelConsolidation.itemizedTransactions.length > 0 && (
                        <details className="text-xs pt-1 group">
                          <summary className="cursor-pointer font-bold text-emerald-700 hover:text-emerald-800 text-[11px] flex items-center gap-1 select-none">
                            <span>View Itemized Fuel Transaction Appendix ({selectedSettlement.fuelConsolidation.itemizedTransactions.length} records)</span>
                            <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                          </summary>
                          <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white text-[11px]">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                  <th className="p-2">Date</th>
                                  <th className="p-2">Merchant / Location</th>
                                  <th className="p-2">Product</th>
                                  <th className="p-2 text-right">Gallons</th>
                                  <th className="p-2 text-right">Rate / Gal</th>
                                  <th className="p-2 text-right">Total Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-600 font-mono">
                                {selectedSettlement.fuelConsolidation.itemizedTransactions.map((tx: any, tIdx: number) => (
                                  <tr key={`item-tx-${tIdx}`} className="hover:bg-slate-50">
                                    <td className="p-2 font-sans font-medium text-slate-800">{tx.date}</td>
                                    <td className="p-2 font-sans">{tx.merchant}</td>
                                    <td className="p-2 font-sans font-semibold capitalize text-slate-700">{tx.product}</td>
                                    <td className="p-2 text-right">{tx.gallons > 0 ? tx.gallons.toFixed(2) : '—'}</td>
                                    <td className="p-2 text-right">{tx.rate ? `$${(tx.rate / 100).toFixed(3)}` : '—'}</td>
                                    <td className="p-2 text-right font-bold text-rose-600">-{formatCents(tx.totalCents)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {/* ITEMIZED BREAKDOWN TABLE */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Itemized Line Items</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                            <th className="p-3">Type</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Description</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {selectedSettlement.lineItems && selectedSettlement.lineItems.length > 0 ? (
                            selectedSettlement.lineItems.map((li, idx) => (
                              <tr key={li.id ? `${li.id}-${idx}` : `li-${idx}`} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold capitalize">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    li.type === 'earning' ? 'bg-emerald-100 text-emerald-800' :
                                    li.type === 'deduction' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {li.type}
                                  </span>
                                </td>
                                <td className="p-3 font-medium text-slate-900">{li.category}</td>
                                <td className="p-3 text-slate-500">{li.description}</td>
                                <td className={`p-3 text-right font-bold ${
                                  li.type === 'deduction' ? 'text-rose-600' : 'text-emerald-600'
                                }`}>
                                  {li.type === 'deduction' ? '-' : '+'}{formatCents(li.amountCents)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-slate-400">No line items recorded</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* REQUIRED LEGAL DISCLAIMER FOOTER */}
                  <div className="border-t border-slate-200 pt-4 text-[10px] text-slate-500 italic leading-normal text-center">
                    This settlement statement was generated from dispatch, fuel, advance, deduction, and accounting records maintained by the tenant company. Final payment, tax classification, payroll treatment, and accounting approval remain the responsibility of the tenant company.
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                  <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium">Select a settlement statement from the list to inspect audit details and line items.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB: COMPENSATION PROFILES                 */}
      {/* ========================================== */}
      {activeTab === 'comp_profiles' && !isDriver && (
        currentUser.role === 'dispatcher' && !hasDispatcherPermission(currentUser, 'accounting', 'manageCompensationProfiles') ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-white space-y-3">
            <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Access Denied: Compensation Profile Management</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Your Tenant Administrator has not granted "Compensation Profiles" permissions for your dispatcher account. Contact your Tenant Admin to update your access permissions in the Dispatcher Permissions Editor.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm text-white">Driver Compensation Profile Management</h3>
                <p className="text-xs text-slate-400">Configure W-2 driver or Owner Operator compensation, basis point rates, and default deductions.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Select Driver:</span>
                <select
                  value={selectedDriverForProfile?.id || selectedDriverForProfile?.uid || ''}
                  onChange={(e) => {
                    const selVal = e.target.value;
                    const found = drivers.find(d => d.id === selVal || d.uid === selVal);
                    if (found) {
                      setSelectedDriverForProfile(found);
                    } else {
                      setSelectedDriverForProfile({ id: selVal, name: selVal } as any);
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 text-xs px-3 py-1.5 rounded-lg text-white font-medium focus:border-emerald-500 focus:outline-none min-w-[220px]"
                >
                  {drivers.length === 0 ? (
                    <option value={currentUser.uid}>
                      {currentUser.name || currentUser.email || 'No Drivers Registered'}
                    </option>
                  ) : (
                    drivers.map((d, idx) => (
                      <option key={d.id || d.uid || `drv-select-${idx}`} value={d.id || d.uid}>
                        {d.name || 'Driver'} {d.email ? `(${d.email})` : d.phone ? `(${d.phone})` : `(${d.id})`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <CompensationProfileManager
              companyId={companyId}
              driver={selectedDriverForProfile || ({ id: currentUser.uid, name: currentUser.name || currentUser.email || 'Selected Driver' } as any)}
              currentUser={currentUser}
              currentUserRole={currentUser.role}
              isSuperAdmin={currentUser.role === 'super_admin'}
              onProfileUpdated={() => fetchData()}
            />
          </div>
        )
      )}

      {/* ========================================== */}
      {/* TAB: DRIVER ADVANCES                       */}
      {/* ========================================== */}
      {activeTab === 'advances' && !isDriver && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Driver Cash & Fuel Advances</h3>
              <p className="text-xs text-slate-500">Track and manage advance balances to be automatically deducted from upcoming driver settlements.</p>
            </div>
            <button
              onClick={() => setShowAdvanceModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Issue Driver Advance
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5">Issue Date</th>
                  <th className="p-3.5">Driver</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Check / Ref #</th>
                  <th className="p-3.5 text-right">Original Amount</th>
                  <th className="p-3.5 text-right">Remaining Balance</th>
                  <th className="p-3.5">Note Box / Memo</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">No active or historical driver advances found.</td>
                  </tr>
                ) : (
                  advances.map((adv, idx) => {
                    const drv = drivers.find(d => (d.id || d.uid) === adv.driverId);
                    const drvName = drv?.name || adv.driverId || 'Driver';
                    const checkRef = adv.checkNumber || adv.comcheckNumber || adv.referenceNumber || '—';
                    const notes = adv.notes || adv.memo || '—';

                    return (
                      <tr key={adv.id || `adv-table-${idx}`} className="hover:bg-slate-50">
                        <td className="p-3.5 font-medium">{adv.issuedAt ? new Date(adv.issuedAt).toLocaleDateString() : (adv.createdAt ? new Date(adv.createdAt).toLocaleDateString() : '—')}</td>
                        <td className="p-3.5 font-semibold text-slate-900">{drvName}</td>
                        <td className="p-3.5 uppercase font-semibold text-slate-800">{adv.type}</td>
                        <td className="p-3.5 font-mono text-slate-800 font-medium">{checkRef !== '—' ? `#${checkRef}` : '—'}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900">{formatCents(adv.originalAmountCents)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-rose-600">{formatCents(adv.remainingBalanceCents)}</td>
                        <td className="p-3.5 text-slate-600 max-w-[200px] truncate" title={notes}>{notes}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            adv.status === 'repaid' || adv.status === 'fully_deducted' ? 'bg-emerald-100 text-emerald-800' :
                            adv.status === 'open' || adv.status === 'active' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {adv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ========================================== */}
      {activeTab === 'fuel' && !isDriver && (
        <div className="space-y-6">
          <FuelCardsManager
            companyId={companyId}
            drivers={drivers}
            trucks={trucks}
            ownerOperators={ownerOperators}
            onRefreshFuelEntries={() => fetchData()}
          />

          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Manual Fuel Entries Ledger</h4>
                <p className="text-xs text-slate-500">Quick entries recorded manually or via receipt scans</p>
              </div>
              <button
                onClick={() => setShowFuelModal(true)}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Manual Fuel Entry
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Vendor</th>
                    <th className="p-3.5">Location</th>
                    <th className="p-3.5">State</th>
                    <th className="p-3.5 text-right">Gallons</th>
                    <th className="p-3.5 text-right">Price/Gal</th>
                    <th className="p-3.5 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fuelEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">No manual fuel entries recorded.</td>
                    </tr>
                  ) : (
                    fuelEntries.map((f, idx) => (
                      <tr key={f.id || `fuel-${idx}`} className="hover:bg-slate-50">
                        <td className="p-3.5 font-medium">{f.fuelDate}</td>
                        <td className="p-3.5 font-bold text-slate-900">{f.fuelVendor}</td>
                        <td className="p-3.5 text-slate-500">{f.fuelLocation}</td>
                        <td className="p-3.5 font-semibold text-slate-700">{f.state}</td>
                        <td className="p-3.5 text-right font-mono">{f.gallons} gal</td>
                        <td className="p-3.5 text-right font-mono">{formatCents(f.pricePerGallonCents)}</td>
                        <td className="p-3.5 text-right font-bold text-emerald-700 font-mono">{formatCents(f.totalAmountCents)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: PAY RULES                           */}
      {/* ========================================== */}
      {activeTab === 'pay_rules' && !isDriver && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Pay Rules Engine</h3>
              <p className="text-xs text-slate-500">Configure company pay templates for W-2 drivers and Owner Operators</p>
            </div>
            <button
              onClick={() => setShowPayRuleModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Pay Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payRules.length === 0 ? (
              <div className="col-span-2 bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
                No custom pay rules created. System uses fallback 60% gross revenue rule.
              </div>
            ) : (
              payRules.map((r, idx) => (
                <div key={r.id || `rule-${idx}`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">{r.name}</h4>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase">
                      {r.method.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <div>Applies to: <strong className="text-slate-800 capitalize">{r.appliesTo}</strong></div>
                    {r.method === 'percentage_of_gross' && <div>Rate: <strong className="text-slate-800">{r.percentage}% of gross load revenue</strong></div>}
                    {r.method === 'per_mile' && <div>Rate: <strong className="text-slate-800">{formatCents(r.ratePerMileCents)} / mile</strong></div>}
                    {r.method === 'flat_per_load' && <div>Rate: <strong className="text-slate-800">{formatCents(r.flatAmountCents)} flat / load</strong></div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 4: BROKER INVOICES                      */}
      {/* ========================================== */}
      {activeTab === 'invoices' && !isDriver && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Broker & Customer Invoices</h3>
              <p className="text-xs text-slate-500">Generate carrier billing invoices for customer/broker sync</p>
            </div>
            <button
              onClick={() => setShowInvoiceModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5">Invoice #</th>
                  <th className="p-3.5">PO Number</th>
                  <th className="p-3.5">Broker / Customer</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Total Amount</th>
                  <th className="p-3.5 text-right">QuickBooks ID</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">No customer invoices created yet.</td>
                  </tr>
                ) : (
                  invoices.map((inv, idx) => (
                    <tr key={inv.id || `inv-${idx}`} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold text-slate-900 font-mono">{inv.invoiceNumber}</td>
                      <td className="p-3.5 font-mono text-indigo-700 font-bold bg-indigo-50/50 rounded">{getUniquePoNumber(inv)}</td>
                      <td className="p-3.5 font-medium">{inv.brokerName}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                          inv.status === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-900 font-mono">{formatCents(inv.totalCents)}</td>
                      <td className="p-3.5 text-right font-mono text-slate-500">{inv.quickBooksInvoiceId || '—'}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(inv.status === 'draft' || inv.status === 'reviewed' || !inv.status) && (
                            <button
                              onClick={() => setDeleteConfirmTarget({ type: 'invoice', id: inv.id, name: inv.invoiceNumber ? `Invoice #${inv.invoiceNumber}` : inv.id })}
                              className="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-2.5 py-1 rounded transition inline-flex items-center gap-1"
                              title="Delete draft invoice"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          )}
                          <button
                            onClick={() => handleQuickBooksSync('invoice', inv.id)}
                            className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-bold px-2.5 py-1 rounded transition inline-flex items-center gap-1"
                          >
                            <Zap className="w-3 h-3 text-emerald-400" />
                            Sync QB
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 5: SYNC & AUDIT LOGS                    */}
      {/* ========================================== */}
      {activeTab === 'logs' && !isDriver && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Accounting Audit & Sync Trail</h3>
            <p className="text-xs text-slate-500">Immutable record of every server calculation, status update, and QuickBooks sync</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-50 p-3.5 border-b border-slate-200 font-bold text-xs text-slate-700">
              Audit Logs ({auditLogs.length})
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">User UID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400 font-sans">No audit logs recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs.map((log, idx) => (
                      <tr key={log.id || `log-${idx}`} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="p-3 font-bold text-slate-900 font-sans">{log.action}</td>
                        <td className="p-3 text-slate-600">{log.entityType}: {log.entityId}</td>
                        <td className="p-3 text-slate-400 text-[11px]">{log.userId}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CALCULATE SETTLEMENT */}
      {showCalculateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Calculate Settlement Statement</h3>
                <p className="text-xs text-slate-500">Generates server-side integer cents calculations for driver earnings, fuel deductions, and advances.</p>
              </div>
              <button onClick={() => setShowCalculateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* CALCULATION TYPE TOGGLE */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Calculation Basis</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setCalcSettlementType('period');
                      setCalcLoadId('');
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                      calcSettlementType === 'period'
                        ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Pay Period (Date Range)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcSettlementType('load')}
                    className={`py-2 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                      calcSettlementType === 'load'
                        ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TruckIcon className="w-4 h-4" />
                    Single Trip / Load
                  </button>
                </div>
              </div>

              {/* SELECT DRIVER */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Driver <span className="text-red-500">*</span></label>
                <select
                  value={calcDriverUid}
                  onChange={(e) => setCalcDriverUid(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((d, idx) => (
                    <option key={d.id || d.uid || `drv-calc-${idx}`} value={d.id || d.uid}>
                      {d.name || 'Driver'} {d.email ? `(${d.email})` : d.phone ? `(${d.phone})` : `(${d.id})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* DATE RANGE SELECTION */}
              <div className="space-y-2.5 border border-slate-200 bg-slate-50/70 p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    Payroll Date Range (From / To)
                  </label>
                  {/* PRESET SHORTCUTS */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
                        const lastDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
                        setCalcPeriodStart(firstDayOfWeek.toISOString().split('T')[0]);
                        setCalcPeriodEnd(lastDayOfWeek.toISOString().split('T')[0]);
                      }}
                      className="px-2 py-0.5 text-[10px] bg-white border border-slate-200 rounded font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                    >
                      This Week
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const prevWeekStart = new Date(now.setDate(now.getDate() - now.getDay() - 7));
                        const prevWeekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6));
                        setCalcPeriodStart(prevWeekStart.toISOString().split('T')[0]);
                        setCalcPeriodEnd(prevWeekEnd.toISOString().split('T')[0]);
                      }}
                      className="px-2 py-0.5 text-[10px] bg-white border border-slate-200 rounded font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                    >
                      Last Week
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                        setCalcPeriodStart(monthStart.toISOString().split('T')[0]);
                        setCalcPeriodEnd(new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2 py-0.5 text-[10px] bg-white border border-slate-200 rounded font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                    >
                      This Month
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-0.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date (Period Start)</label>
                    <input
                      type="date"
                      value={calcPeriodStart}
                      onChange={(e) => setCalcPeriodStart(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date (Period End)</label>
                    <input
                      type="date"
                      value={calcPeriodEnd}
                      onChange={(e) => setCalcPeriodEnd(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Only trips, fuel purchases, and cash advances dated between <strong className="text-slate-700">{calcPeriodStart}</strong> and <strong className="text-slate-700">{calcPeriodEnd}</strong> will be included in this driver's payroll.
                </p>
              </div>

              {/* LOAD ID FIELD (Show if single trip/load basis selected or optional) */}
              {calcSettlementType === 'load' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Specific Load ID</label>
                  <input
                    type="text"
                    placeholder="e.g. load_123"
                    value={calcLoadId}
                    onChange={(e) => setCalcLoadId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">If specified, settlement will be restricted to earnings and fuel linked directly to this Load ID.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCalculateModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCalculateSettlement(true)}
                disabled={!calcDriverUid}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Calculate & Save Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DUPLICATE STATEMENT WARNING CONFIRMATION */}
      {duplicateModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Duplicate Settlement Statement Protection</h3>
                <p className="text-xs text-amber-800 font-medium">Statement Already Exists for this Load / Period</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
              <p className="font-medium leading-relaxed">
                {duplicateModal.message}
              </p>
              <div className="pt-1 text-[11px] text-amber-700">
                <strong>Safety Safeguard:</strong> Re-generating a settlement statement for an already paid or calculated load may lead to duplicate payouts for the driver.
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to force recalculation and recreate this statement anyway?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDuplicateModal({ isOpen: false, message: '' })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCalculateSettlement(true, true)}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Yes, Force Recreate Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD FUEL ENTRY */}
      {showFuelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Record Fuel Purchase</h3>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gallons</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="120.5"
                    value={fuelGallons}
                    onChange={(e) => setFuelGallons(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Price / Gal ($)</label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="3.85"
                    value={fuelPricePerGal}
                    onChange={(e) => setFuelPricePerGal(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vendor Name</label>
                <input
                  type="text"
                  placeholder="Love's Travel Stop #402"
                  value={fuelVendor}
                  onChange={(e) => setFuelVendor(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowFuelModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFuelEntry}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Save Fuel Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PAY RULE */}
      {showPayRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Create Pay Rule Template</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Standard 70% Owner Operator Pay"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Calculation Method</label>
                <select
                  value={ruleMethod}
                  onChange={(e: any) => setRuleMethod(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                >
                  <option value="percentage_of_gross">Percentage of Gross Revenue</option>
                  <option value="per_mile">Rate Per Mile</option>
                  <option value="flat_per_load">Flat Amount Per Load</option>
                </select>
              </div>

              {ruleMethod === 'percentage_of_gross' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Percentage (%)</label>
                  <input
                    type="number"
                    value={rulePercentage}
                    onChange={(e) => setRulePercentage(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowPayRuleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayRule}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Save Pay Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE INVOICE */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Create Broker Invoice</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Broker / Customer Name</label>
                <input
                  type="text"
                  placeholder="C.H. Robinson Freight"
                  value={invBrokerName}
                  onChange={(e) => setInvBrokerName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInvoice}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Create Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE DRIVER ADVANCE */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-600" /> Issue Driver Advance
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Driver</label>
                <select
                  value={advDriverUid}
                  onChange={(e) => setAdvDriverUid(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((d, idx) => (
                    <option key={d.id || d.uid || `drv-adv-${idx}`} value={d.id || d.uid}>
                      {d.name || 'Driver'} {d.email ? `(${d.email})` : d.phone ? `(${d.phone})` : `(${d.id})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Advance Type</label>
                  <select
                    value={advType}
                    onChange={(e: any) => setAdvType(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs capitalize"
                  >
                    <option value="cash">Cash Advance</option>
                    <option value="fuel">Fuel Advance</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={advAmountDollars}
                    onChange={(e) => setAdvAmountDollars(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deduction Method</label>
                <select
                  value={advDeductionMethod}
                  onChange={(e: any) => setAdvDeductionMethod(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                >
                  <option value="full_next_settlement">Deduct Full Amount on Next Settlement</option>
                  <option value="fixed_per_settlement">Deduct Fixed Installment per Settlement</option>
                </select>
              </div>

              {advDeductionMethod === 'fixed_per_settlement' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fixed Installment Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={advFixedDeductionDollars}
                    onChange={(e) => setAdvFixedDeductionDollars(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Check / Comcheck / Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. #10294, wire ref 49201"
                  value={advRefNumber}
                  onChange={(e) => setAdvRefNumber(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Note Box / Memo (Tied to this entry)</label>
                <textarea
                  rows={2}
                  placeholder="Write down any reference numbers, load details, or purpose notes tied to this advance entry..."
                  value={advNotes}
                  onChange={(e) => setAdvNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAdvance}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Issue Advance Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT OWNER OPERATOR COMPANY */}
      {showOOModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-emerald-600" />
                {editingOOId ? 'Edit Owner Operator Vendor' : 'Register Owner Operator Vendor'}
              </h3>
              <button
                type="button"
                onClick={handleAttemptCloseOOModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* FORM ERROR SUMMARY (LEVEL 2) - INSIDE MODAL AND STICKY */}
            <FormErrorSummary
              message={ooFormError}
              fieldErrors={ooFieldErrors}
              onDismiss={() => setOoFormError(null)}
            />

            {/* DUPLICATE WARNING BANNER (INSIDE MODAL) */}
            {ooDuplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2 mb-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">A company with a similar legal name or Tax ID may already exist.</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Existing match: <span className="font-semibold">{ooDuplicateWarning.duplicateRecord?.legalName}</span> (Owner: {ooDuplicateWarning.duplicateRecord?.ownerName || 'N/A'})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSaveOOCompany(true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                  >
                    Confirm & Save Anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setOoDuplicateWarning(null)}
                    className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-lg text-xs transition cursor-pointer"
                  >
                    Continue Editing
                  </button>
                  <button
                    type="button"
                    onClick={handleAttemptCloseOOModal}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-bold rounded-lg text-xs hover:bg-amber-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Legal Company Name *</label>
                  <input
                    ref={ooLegalNameRef}
                    type="text"
                    placeholder="Apex Express Logistics LLC"
                    value={ooLegalName}
                    onChange={(e) => {
                      setOoLegalName(e.target.value);
                      if (ooFieldErrors.legalName) {
                        setOoFieldErrors(prev => ({ ...prev, legalName: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.legalName)}
                  />
                  <FieldErrorMessage error={ooFieldErrors.legalName} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DBA Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="Apex Logistics"
                    value={ooDbaName}
                    onChange={(e) => setOoDbaName(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Owner / Primary Contact *</label>
                  <input
                    ref={ooOwnerNameRef}
                    type="text"
                    placeholder="John Doe"
                    value={ooOwnerName}
                    onChange={(e) => {
                      setOoOwnerName(e.target.value);
                      if (ooFieldErrors.ownerName) {
                        setOoFieldErrors(prev => ({ ...prev, ownerName: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.ownerName)}
                  />
                  <FieldErrorMessage error={ooFieldErrors.ownerName} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax ID / EIN (Last 4)</label>
                  <input
                    ref={ooTaxIdRef}
                    type="text"
                    maxLength={4}
                    placeholder="9876"
                    value={ooTaxIdLast4}
                    onChange={(e) => {
                      setOoTaxIdLast4(e.target.value);
                      if (ooFieldErrors.taxIdLast4) {
                        setOoFieldErrors(prev => ({ ...prev, taxIdLast4: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.taxIdLast4, "font-mono")}
                  />
                  <FieldErrorMessage error={ooFieldErrors.taxIdLast4} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    ref={ooEmailRef}
                    type="email"
                    placeholder="billing@apexexpress.com"
                    value={ooEmail}
                    onChange={(e) => {
                      setOoEmail(e.target.value);
                      if (ooFieldErrors.email) {
                        setOoFieldErrors(prev => ({ ...prev, email: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.email)}
                  />
                  <FieldErrorMessage error={ooFieldErrors.email} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="(555) 234-5678"
                    value={ooPhone}
                    onChange={(e) => setOoPhone(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Default Pay Basis (%)</label>
                  <input
                    ref={ooPayBasisRef}
                    type="number"
                    step="0.1"
                    placeholder="85.0"
                    value={ooPayBasisPoints}
                    onChange={(e) => {
                      setOoPayBasisPoints(e.target.value);
                      if (ooFieldErrors.payBasis) {
                        setOoFieldErrors(prev => ({ ...prev, payBasis: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.payBasis, "font-mono")}
                  />
                  <FieldErrorMessage error={ooFieldErrors.payBasis} />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">% of Gross Load Revenue</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dispatch Fee (%)</label>
                  <input
                    ref={ooDispatchFeeRef}
                    type="number"
                    step="0.1"
                    placeholder="10.0"
                    value={ooDispatchFeeBasisPoints}
                    onChange={(e) => {
                      setOoDispatchFeeBasisPoints(e.target.value);
                      if (ooFieldErrors.dispatchFee) {
                        setOoFieldErrors(prev => ({ ...prev, dispatchFee: '' }));
                      }
                    }}
                    className={getFieldInputClass(!!ooFieldErrors.dispatchFee, "font-mono")}
                  />
                  <FieldErrorMessage error={ooFieldErrors.dispatchFee} />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">% Dispatch Fee</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <label className="block font-bold text-slate-800 text-xs">Default Recurring Deductions ($)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 block text-[11px] mb-0.5">Insurance ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ooInsuranceDollars}
                      onChange={(e) => setOoInsuranceDollars(e.target.value)}
                      className={getFieldInputClass(!!ooFieldErrors.insurance, "font-mono p-2 rounded-lg")}
                    />
                    <FieldErrorMessage error={ooFieldErrors.insurance} />
                  </div>
                  <div>
                    <label className="text-slate-600 block text-[11px] mb-0.5">Maintenance ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ooMaintenanceDollars}
                      onChange={(e) => setOoMaintenanceDollars(e.target.value)}
                      className={getFieldInputClass(!!ooFieldErrors.maintenance, "font-mono p-2 rounded-lg")}
                    />
                    <FieldErrorMessage error={ooFieldErrors.maintenance} />
                  </div>
                  <div>
                    <label className="text-slate-600 block text-[11px] mb-0.5">Escrow ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ooEscrowDollars}
                      onChange={(e) => setOoEscrowDollars(e.target.value)}
                      className={getFieldInputClass(!!ooFieldErrors.escrow, "font-mono p-2 rounded-lg")}
                    />
                    <FieldErrorMessage error={ooFieldErrors.escrow} />
                  </div>
                  <div>
                    <label className="text-slate-600 block text-[11px] mb-0.5">Trailer Rent ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ooTrailerRentDollars}
                      onChange={(e) => setOoTrailerRentDollars(e.target.value)}
                      className={getFieldInputClass(!!ooFieldErrors.trailerRent, "font-mono p-2 rounded-lg")}
                    />
                    <FieldErrorMessage error={ooFieldErrors.trailerRent} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleAttemptCloseOOModal}
                disabled={isSavingOO}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <LoadingSubmitButton
                isSubmitting={isSavingOO}
                onClick={() => handleSaveOOCompany(false)}
                idleText={editingOOId ? "Update Owner Operator Profile" : "Register Owner Operator"}
                loadingText="Saving Owner Operator..."
                variant="emerald"
              />
            </div>
          </div>
        </div>
      )}

      {/* UNSAVED CHANGES DIALOG FOR OO MODAL */}
      <UnsavedChangesDialog
        isOpen={showOoUnsavedDialog}
        onContinueEditing={() => setShowOoUnsavedDialog(false)}
        onDiscardChanges={() => {
          setShowOoUnsavedDialog(false);
          setShowOOModal(false);
          resetOoForm();
        }}
      />

      {/* MODAL: ADD / EDIT TRUCK */}
      {showTruckModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <TruckIcon className="w-5 h-5 text-emerald-600" />
                {editingTruckId ? `Edit Truck #${truckNumber}` : 'Register Truck to Fleet'}
              </h3>
              <button
                type="button"
                onClick={handleAttemptCloseTruckModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <FormErrorSummary
              message={truckFormError}
              fieldErrors={truckFieldErrors}
              onDismiss={() => setTruckFormError(null)}
            />

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Truck Number *</label>
                <input
                  ref={truckNumberRef}
                  type="text"
                  placeholder="e.g. 101"
                  value={truckNumber}
                  onChange={(e) => {
                    setTruckNumber(e.target.value);
                    if (truckFieldErrors.truckNumber) {
                      setTruckFieldErrors(prev => ({ ...prev, truckNumber: '' }));
                    }
                  }}
                  className={getFieldInputClass(!!truckFieldErrors.truckNumber, "font-mono")}
                />
                <FieldErrorMessage error={truckFieldErrors.truckNumber} />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">VIN Number</label>
                <input
                  ref={truckVinRef}
                  type="text"
                  placeholder="1XPRD49X8KD123456"
                  value={truckVin}
                  onChange={(e) => setTruckVin(e.target.value)}
                  className={getFieldInputClass(!!truckFieldErrors.vin, "font-mono uppercase")}
                />
                <FieldErrorMessage error={truckFieldErrors.vin} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Make / Model</label>
                  <input
                    type="text"
                    placeholder="Freightliner Cascadia"
                    value={truckMakeModel}
                    onChange={(e) => setTruckMakeModel(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Year</label>
                  <input
                    type="text"
                    placeholder="2024"
                    value={truckYear}
                    onChange={(e) => setTruckYear(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">License Plate (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. TX-98432"
                    value={truckLicensePlate}
                    onChange={(e) => setTruckLicensePlate(e.target.value)}
                    className={getFieldInputClass(false, "font-mono uppercase")}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ownership Type</label>
                  <select
                    value={truckOwnershipType}
                    onChange={(e) => setTruckOwnershipType(e.target.value)}
                    className={getFieldInputClass(false)}
                  >
                    <option value="company_owned">Company Owned</option>
                    <option value="owner_operator">Owner Operator</option>
                    <option value="leased">Leased</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Owner Operator Vendor (Optional)</label>
                <select
                  value={truckOOCompanyId}
                  onChange={(e) => setTruckOOCompanyId(e.target.value)}
                  className={getFieldInputClass(false)}
                >
                  <option value="">-- Company Owned Truck --</option>
                  {ownerOperators.map((oo, idx) => (
                    <option key={oo.id || `oo-opt-${idx}`} value={oo.id}>{oo.legalName} ({oo.ownerName})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Driver (Optional)</label>
                  <select
                    value={truckDriverId}
                    onChange={(e) => setTruckDriverId(e.target.value)}
                    className={getFieldInputClass(false)}
                  >
                    <option value="">-- Unassigned --</option>
                    {drivers.map((d, idx) => (
                      <option key={d.id || d.uid || `drv-truck-opt-${idx}`} value={d.id || d.uid}>{d.name} ({d.email || d.phone})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={truckStatus}
                    onChange={(e) => setTruckStatus(e.target.value)}
                    className={getFieldInputClass(false)}
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="out_of_service">Out of Service</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleAttemptCloseTruckModal}
                disabled={isSavingTruck}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <LoadingSubmitButton
                isSubmitting={isSavingTruck}
                onClick={handleSaveTruck}
                idleText={editingTruckId ? "Update Truck" : "Save Truck"}
                loadingText="Saving Truck..."
                variant="emerald"
              />
            </div>
          </div>
        </div>
      )}

      {/* UNSAVED CHANGES DIALOG FOR TRUCK MODAL */}
      <UnsavedChangesDialog
        isOpen={showTruckUnsavedDialog}
        onContinueEditing={() => setShowTruckUnsavedDialog(false)}
        onDiscardChanges={() => {
          setShowTruckUnsavedDialog(false);
          setShowTruckModal(false);
          resetTruckForm();
        }}
      />

      {/* MODAL: DELETE / ARCHIVE TRUCK CONFIRMATION */}
      {showDeleteTruckModal && selectedTruckForDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" />
                Archive or Delete Truck #{selectedTruckForDelete.truckNumber}
              </h3>
              <button
                onClick={() => {
                  setShowDeleteTruckModal(false);
                  setSelectedTruckForDelete(null);
                  setDeleteConfirmInput('');
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Verification Required Before Removal
              </p>
              <p>
                Archiving or deleting Truck <span className="font-bold font-mono">#{selectedTruckForDelete.truckNumber}</span> will automatically unassign any currently linked drivers. Historical settlement statements, fuel logs, and dispatch records remain preserved for audit compliance.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-800">
                Type <span className="font-mono text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">DELETE</span> below to unlock verification:
              </label>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value.toUpperCase())}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono tracking-wider uppercase font-bold focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 flex-wrap">
              <button
                onClick={() => {
                  setShowDeleteTruckModal(false);
                  setSelectedTruckForDelete(null);
                  setDeleteConfirmInput('');
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={deleteConfirmInput.trim() !== 'DELETE' || isDeletingTruck}
                onClick={() => handleConfirmDeleteTruck('archive')}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingTruck ? 'Processing...' : 'Archive Truck'}
              </button>

              <button
                disabled={deleteConfirmInput.trim() !== 'DELETE' || isDeletingTruck}
                onClick={() => handleConfirmDeleteTruck('permanent')}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingTruck ? 'Processing...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN DRIVER TO OO COMPANY */}
      {showAssignDriverModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                Assign Driver to Owner Operator
              </h3>
              <button
                type="button"
                onClick={() => setShowAssignDriverModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <FormErrorSummary
              message={assignFormError}
              fieldErrors={assignFieldErrors}
              onDismiss={() => setAssignFormError(null)}
            />

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Driver *</label>
                <select
                  value={assignDriverUid}
                  onChange={(e) => {
                    setAssignDriverUid(e.target.value);
                    if (assignFieldErrors.driver) {
                      setAssignFieldErrors(prev => ({ ...prev, driver: '' }));
                    }
                  }}
                  className={getFieldInputClass(!!assignFieldErrors.driver, "font-medium")}
                >
                  <option value="">-- Select Driver --</option>
                  {drivers.map((d, idx) => (
                    <option key={d.id || d.uid || `drv-oo-opt-${idx}`} value={d.id || d.uid}>{d.name} ({d.email || d.phone})</option>
                  ))}
                </select>
                <FieldErrorMessage error={assignFieldErrors.driver} />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Owner Operator Vendor *</label>
                <select
                  value={assignOOCompanyId}
                  onChange={(e) => {
                    setAssignOOCompanyId(e.target.value);
                    if (assignFieldErrors.company) {
                      setAssignFieldErrors(prev => ({ ...prev, company: '' }));
                    }
                  }}
                  className={getFieldInputClass(!!assignFieldErrors.company, "font-medium")}
                >
                  <option value="">-- Select Owner Operator Vendor --</option>
                  {ownerOperators.map((oo, idx) => (
                    <option key={oo.id || `oo-assign-opt-${idx}`} value={oo.id}>{oo.legalName} ({oo.ownerName})</option>
                  ))}
                </select>
                <FieldErrorMessage error={assignFieldErrors.company} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAssignDriverModal(false)}
                disabled={isSavingAssign}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition disabled:opacity-50"
              >
                Cancel
              </button>
              <LoadingSubmitButton
                isSubmitting={isSavingAssign}
                onClick={handleAssignDriverOO}
                idleText="Save Driver Assignment"
                loadingText="Assigning Driver..."
                variant="emerald"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CALCULATE OO SETTLEMENT */}
      {showOOCalcModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-600" />
                Calculate Owner Operator Settlement
              </h3>
              <button
                type="button"
                onClick={() => setShowOOCalcModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <FormErrorSummary
              message={calcFormError}
              onDismiss={() => setCalcFormError(null)}
            />

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Owner Operator Vendor *</label>
                <select
                  value={ooCalcCompanyId}
                  onChange={(e) => setOoCalcCompanyId(e.target.value)}
                  className={getFieldInputClass(false, "font-medium")}
                >
                  <option value="">-- Choose Vendor --</option>
                  {ownerOperators.map((oo, idx) => (
                    <option key={oo.id || `oo-calc-opt-${idx}`} value={oo.id}>{oo.legalName} ({oo.ownerName})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Period Start Date</label>
                  <input
                    type="date"
                    value={ooCalcStart}
                    onChange={(e) => setOoCalcStart(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Period End Date</label>
                  <input
                    type="date"
                    value={ooCalcEnd}
                    onChange={(e) => setOoCalcEnd(e.target.value)}
                    className={getFieldInputClass(false)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOOCalcModal(false)}
                disabled={isCalculatingOO}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCalculatingOO}
                onClick={() => handleCalculateOOSettlement(false)}
                className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Preview Math
              </button>
              <LoadingSubmitButton
                isSubmitting={isCalculatingOO}
                onClick={() => handleCalculateOOSettlement(true)}
                idleText="Save Draft Settlement"
                loadingText="Calculating..."
                variant="emerald"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DOWNLOADABLE STATEMENT VIEW WITH TRUCK BREAKDOWN */}
      {showStatementModal && selectedOOForStatement && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 space-y-6 shadow-2xl border border-slate-200 my-8">
            {/* Header / Actions */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Official Owner Operator Settlement Statement
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </button>
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="space-y-6 text-slate-800">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">SETTLEMENT STATEMENT</h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Carrier Workspace ID: {companyId}</p>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <p className="font-bold text-slate-900">{selectedOOForStatement.legalName}</p>
                  {selectedOOForStatement.dbaName && <p className="text-slate-500">DBA: {selectedOOForStatement.dbaName}</p>}
                  <p className="text-slate-600">Owner: {selectedOOForStatement.ownerName}</p>
                  {selectedOOForStatement.taxIdLast4 && <p className="font-mono text-slate-500">Tax ID: ***-**-{selectedOOForStatement.taxIdLast4}</p>}
                </div>
              </div>

              {/* Truck Breakdown Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Truck & Driver Fleet Breakdown</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Truck #</th>
                        <th className="p-2.5">VIN</th>
                        <th className="p-2.5">Driver</th>
                        <th className="p-2.5 text-right">Pay Basis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trucks.filter(t => t.ownerOperatorCompanyId === selectedOOForStatement.id).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-3 text-center text-slate-400">No trucks assigned to this vendor</td>
                        </tr>
                      ) : (
                        trucks.filter(t => t.ownerOperatorCompanyId === selectedOOForStatement.id).map((t, idx) => {
                          const drv = drivers.find(d => (d.id || d.uid) === t.assignedDriverId);
                          return (
                            <tr key={t.id || `truck-stmt-${idx}`}>
                              <td className="p-2.5 font-bold font-mono">#{t.truckNumber}</td>
                              <td className="p-2.5 font-mono text-slate-500">{t.vin || '—'}</td>
                              <td className="p-2.5">{drv ? drv.name : 'Unassigned Driver'}</td>
                              <td className="p-2.5 text-right font-medium text-emerald-700">
                                {((selectedOOForStatement.defaultPayBasisPoints || 8500) / 100).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deductions & Accounting Terms */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <h4 className="font-bold text-slate-800">Active Vendor Deduction Settings:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-600">
                  <div>Dispatch Fee: <strong>{((selectedOOForStatement.dispatchFeeBasisPoints || 1000) / 100).toFixed(1)}%</strong></div>
                  <div>Insurance: <strong>{formatCents(selectedOOForStatement.defaultInsuranceDeductionCents)}</strong></div>
                  <div>Maintenance: <strong>{formatCents(selectedOOForStatement.defaultMaintenanceDeductionCents)}</strong></div>
                  <div>Escrow Reserve: <strong>{formatCents(selectedOOForStatement.defaultEscrowDeductionCents)}</strong></div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
                This settlement statement is generated by the server-authoritative accounting engine. All monetary calculations are handled in integer cents and backed by audit log records.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Delete Draft {deleteConfirmTarget.type === 'settlement' ? 'Settlement' : 'Invoice'}
                </h3>
                <p className="text-xs text-slate-500">This action will permanently delete the draft record.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              Are you sure you want to delete draft {deleteConfirmTarget.type} <strong className="text-slate-900">{deleteConfirmTarget.name}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = deleteConfirmTarget;
                  setDeleteConfirmTarget(null);
                  if (target.type === 'settlement') {
                    executeDeleteSettlement(target.id);
                  } else {
                    executeDeleteInvoice(target.id);
                  }
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition"
              >
                Yes, Delete Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL STATEMENT MODAL */}
      {showEmailModal && selectedSettlement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Email Settlement Statement</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedSettlement.id}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Recipient Email Address</label>
                <input
                  type="email"
                  value={emailRecipientInput}
                  onChange={(e) => setEmailRecipientInput(e.target.value)}
                  placeholder="payee@example.com"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-2 text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={emailCCAdmin}
                  onChange={(e) => setEmailCCAdmin(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Send copy to current accounting admin</span>
              </label>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-500 text-[11px]">
                Statement will be emailed with company branding, itemized breakdown, and audit confirmation.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmailStatement}
                disabled={emailSending || !emailRecipientInput}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {emailSending ? 'Sending...' : 'Send Statement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN DRIVER TO TRUCK */}
      {showAssignTruckDriverModal && selectedTruckForAssign && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5 text-emerald-600" />
                  Assign Driver to Truck #{selectedTruckForAssign.truckNumber}
                </h3>
                <p className="text-xs text-slate-500 font-mono">VIN: {selectedTruckForAssign.vin || 'N/A'}</p>
              </div>
              <button
                onClick={() => {
                  setShowAssignTruckDriverModal(false);
                  setSelectedTruckForAssign(null);
                  setAssignConflictError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assignConflictError && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
                <div className="flex items-start gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Assignment Conflict Detected</span>
                </div>
                <p className="text-amber-800">{assignConflictError.error}</p>
                {assignConflictError.existingAssignment && (
                  <div className="text-[11px] bg-white/80 p-2 rounded border border-amber-200 font-mono space-y-0.5">
                    <div>Active Truck: #{assignConflictError.existingAssignment.truckNumberSnapshot || assignConflictError.existingAssignment.truckId}</div>
                    <div>Effective Since: {new Date(assignConflictError.existingAssignment.effectiveFrom).toLocaleDateString()}</div>
                  </div>
                )}
                <div className="pt-1 flex items-center justify-end">
                  <button
                    onClick={() => handleCreateAssignment(true)}
                    disabled={assignSubmitting}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition"
                  >
                    {assignSubmitting ? 'Overriding...' : 'Override & Reassign Driver'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Driver *</label>
                <select
                  value={assignDriverUid}
                  onChange={(e) => setAssignDriverUid(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((d, idx) => (
                    <option key={d.id || d.uid || `drv-truck-assign-opt-${idx}`} value={d.id || d.uid}>
                      {d.name} ({d.truckNumber ? `Current Rig: ${d.truckNumber}` : 'Unassigned'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assignment Type</label>
                  <select
                    value={assignType}
                    onChange={(e: any) => setAssignType(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="primary">Primary Driver</option>
                    <option value="secondary">Co-Driver / Slipseat</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assignment Reason</label>
                  <select
                    value={assignReason}
                    onChange={(e) => setAssignReason(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="truck_change">Routine Truck Swap</option>
                    <option value="new_assignment">New Driver Onboarding</option>
                    <option value="temporary_cover">Temporary Breakdown Cover</option>
                    <option value="maintenance_swap">Maintenance Swap</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Swapped due to PM service on #102"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowAssignDriverModal(false);
                  setSelectedTruckForAssign(null);
                  setAssignConflictError(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateAssignment(false)}
                disabled={assignSubmitting || !assignDriverUid}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition"
              >
                {assignSubmitting ? 'Saving...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRUCK ASSIGNMENT HISTORY LEDGER */}
      {showTruckHistoryModal && selectedTruckForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  Driver Assignment History — Truck #{selectedTruckForHistory.truckNumber}
                </h3>
                <p className="text-xs text-slate-500 font-mono">VIN: {selectedTruckForHistory.vin || 'N/A'}</p>
              </div>
              <button
                onClick={() => {
                  setShowTruckHistoryModal(false);
                  setSelectedTruckForHistory(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 text-xs">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400">Loading history ledger...</div>
              ) : truckAssignmentHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-400">No historical assignment records found for this truck.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase font-mono">
                      <th className="p-2.5">Driver</th>
                      <th className="p-2.5">Effective From</th>
                      <th className="p-2.5">Effective To</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Reason</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {truckAssignmentHistory.map((rec, idx) => (
                      <tr key={rec.id || `tassign-rec-${idx}`} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-slate-900">{rec.driverNameSnapshot || rec.driverId}</td>
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
                        <td className="p-2.5 text-right">
                          {rec.status === 'active' && (
                            <button
                              onClick={() => handleEndAssignment(rec.id)}
                              className="px-2 py-1 text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded border border-rose-200 transition"
                            >
                              End Assignment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => {
                  setShowTruckHistoryModal(false);
                  setSelectedTruckForHistory(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SYNC & CENTRALIZE FLEET (MIGRATION PREVIEW) */}
      {showMigrationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Centralize Fleet & Legacy Truck String Migration Tool
                </h3>
                <p className="text-xs text-slate-500">Scan legacy string fields across drivers & loads, create central registry records, and link driver history idempotently.</p>
              </div>
              <button
                onClick={() => setShowMigrationModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {migrationSuccessMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{migrationSuccessMsg}</span>
              </div>
            )}

            <div className="overflow-y-auto flex-1 space-y-4 text-xs">
              {loadingMigrationPreview ? (
                <div className="py-12 text-center text-slate-400">Scanning driver records and loads for unlinked truck strings...</div>
              ) : migrationPreviewData ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Existing Central Registry</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5">{migrationPreviewData.existingCentralTrucksCount} Trucks</div>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <div className="text-[10px] font-bold text-indigo-700 uppercase">Unlinked Driver Strings</div>
                      <div className="text-lg font-bold text-indigo-900 mt-0.5">{migrationPreviewData.unlinkedDriverTruckStringsCount} Strings</div>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Suggested New Central Trucks</div>
                      <div className="text-lg font-bold text-emerald-900 mt-0.5">{migrationPreviewData.suggestedCentralTrucksCount} Trucks</div>
                    </div>
                  </div>

                  {/* Drivers Needing Migration Table */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800 uppercase text-[11px] tracking-wider">Drivers Identified for Central Registry Linking</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase font-mono">
                          <tr>
                            <th className="p-2.5">Driver Name</th>
                            <th className="p-2.5">Current Text Rig String</th>
                            <th className="p-2.5">Suggested Central Truck ID</th>
                            <th className="p-2.5 text-right">Match Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {migrationPreviewData.driversNeedingMigration?.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-slate-400">All drivers are already linked to official central truck records!</td>
                            </tr>
                          ) : (
                            migrationPreviewData.driversNeedingMigration?.map((d: any, idx: number) => (
                              <tr key={d.driverId || `m-drv-${idx}`} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-bold text-slate-900">{d.driverName}</td>
                                <td className="p-2.5 font-mono text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded w-fit">{d.legacyTruckString}</td>
                                <td className="p-2.5 font-mono text-slate-800">#{d.suggestedTruckNumber}</td>
                                <td className="p-2.5 text-right font-bold text-emerald-600">Ready to Link</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-slate-400 italic">This migration is 100% idempotent and safely merges duplicate truck strings.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMigrationModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  onClick={handleExecuteMigration}
                  disabled={executingMigration || !migrationPreviewData}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {executingMigration ? 'Executing Migration...' : 'Execute Idempotent Migration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* PDF PREVIEW MODAL */}
      {showPdfPreviewModal && previewPdfBlobUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Official Settlement Statement PDF</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedSettlement?.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => {
                    setShowPdfPreviewModal(false);
                    if (previewPdfBlobUrl) {
                      window.URL.revokeObjectURL(previewPdfBlobUrl);
                      setPreviewPdfBlobUrl(null);
                    }
                  }}
                  className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950 p-4">
              <iframe
                src={previewPdfBlobUrl}
                className="w-full h-full rounded-xl border border-slate-800 bg-white"
                title="Settlement Statement PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
      {/* DUPLICATE SETTLEMENT PREVENTION WARNING / OVERRIDE MODAL */}
      {duplicateModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-rose-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Duplicate Settlement Blocked</h3>
                <p className="text-xs text-slate-500 font-mono">Financial Protection Guard</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2 text-xs text-slate-800">
              <p className="font-medium leading-relaxed">{duplicateModal.message}</p>
              {duplicateModal.existingSettlementNumber && (
                <div className="pt-2 border-t border-rose-200/60 font-mono text-[11px] text-rose-900 flex justify-between">
                  <span>Statement Ref:</span>
                  <strong className="font-bold">#{duplicateModal.existingSettlementNumber}</strong>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDuplicateModal({ isOpen: false, message: '' })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel & Keep Protected
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateModal({ isOpen: false, message: '' });
                  handleCalculateSettlement(true, true);
                }}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Force Recalculate (Override)
              </button>
            </div>
          </div>
        </div>
      )}
      {/* DELETE OO TILE CONFIRMATION MODAL */}
      {ooToDelete && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Owner Operator Tile?</h3>
                <p className="text-xs text-slate-500 font-mono">Removal Confirmation</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-700">
              <p className="font-bold text-slate-900 text-sm">{ooToDelete.legalName}</p>
              {ooToDelete.ownerName && <p>Owner: <strong className="text-slate-800">{ooToDelete.ownerName}</strong></p>}
              {ooToDelete.dbaName && <p>DBA: {ooToDelete.dbaName}</p>}

              <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 text-emerald-800 bg-emerald-50/80 p-2.5 rounded-lg border-emerald-200">
                <p className="font-bold text-[11px] flex items-center gap-1 text-emerald-900">
                  <Check className="w-3.5 h-3.5" /> Preserved Safety Policy:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Deleting this tile will <strong>NOT</strong> delete any assigned trucks, assigned drivers, or historical financial records.
                  Assigned units and drivers will remain completely intact in your fleet.
                </p>
              </div>
            </div>

            {ooDeleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {ooDeleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingOO}
                onClick={() => {
                  setOoToDelete(null);
                  setOoDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingOO}
                onClick={() => handleDeleteOOCompany(ooToDelete.id)}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingOO ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting Tile...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Confirm Delete Tile
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
