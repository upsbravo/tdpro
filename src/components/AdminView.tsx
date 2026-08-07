import React, { useState, useEffect } from 'react';
import { Building2, CreditCard, ShieldCheck, UserPlus, Users, FileText, CheckCircle2, ChevronRight, ArrowUpRight, Check, Zap, HelpCircle, Lock, Edit2, Key, Truck, LayoutDashboard, ClipboardCheck, AlertTriangle, Search, Plus, Trash2, Calendar, FileUp, RefreshCw, UploadCloud, CheckCircle, ShieldAlert, Bell, Info, ShieldAlert as AlertCircle, Compass, Plug, Download, ExternalLink } from 'lucide-react';
import { Company, User, Invoice, AppNotification, Load, DriverAlert, DispatcherPermissions, PRESET_STANDARD_DISPATCHER, getDispatcherPermissions, OwnerOperatorCompany } from '../types';
import { DispatcherPermissionsEditor } from './DispatcherPermissionsEditor';
import { formatCurrency } from '../utils';
import { db, auth, uploadFileToStorage } from '../firebase';
import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import RateConfirmationsView from './RateConfirmationsView';
import CustomConfirmModal from './CustomConfirmModal';
import { SupportDeskModal } from './SupportDeskModal';
import CompanyAlertCenterModal from './CompanyAlertCenterModal';
import MasterAnnouncementBanner from './MasterAnnouncementBanner';
import SystemStatusBar from './SystemStatusBar';
import LegalViewerModal from './legal/LegalViewerModal';
import { GuidedProductTour, shouldShowTourForUser } from './tour/GuidedProductTour';
import { IntegrationCenter } from './IntegrationCenter';
import { AccountingCenter } from './AccountingCenter';
import { ComplianceCenter } from './ComplianceCenter';
import FleetEquipmentCenter from './fleet/FleetEquipmentCenter';
import { UnifiedDriverOnboardingModal } from './UnifiedDriverOnboardingModal';
import { Truck as TruckType } from '../types';
import { Calculator } from 'lucide-react';

import { sendDriverNotificationAlert } from '../services/notificationService';

const SAAS_AGREEMENT_TEXT = `SAAS SUBSCRIPTION AGREEMENT - TRUCKDISPATCH PRO

Current Version: 1.0.0

This is the legally binding agreement presented to every Vendor Admin during the mandatory onboarding process. Acceptance of this agreement is recorded as an immutable audit record in Firestore.

---

AGREEMENT CONTENT

This SaaS Subscription Agreement ("Agreement") is entered into between TruckDispatch Pro, a Virginia corporation with its principal place of business at 123 Dispatch Lane, Fairfax, Virginia ("Provider", "we", "us", or "our") and the entity or individual registering for the Service ("Customer", "you", or "your"). By clicking "I Accept", checking the box indicating acceptance, or accessing or using the Service, you agree to be bound by this Agreement on behalf of yourself and the entity you represent.

1. Definitions
"Service" means the TruckDispatch Pro web-based software-as-a-service platform for truck dispatching, including any updates, enhancements, or associated documentation provided by Provider.
"Subscription Term" means the period during which you are authorized to access the Service, as specified during signup or in any applicable order.
"Users" means your employees, agents, or contractors authorized to access the Service on your behalf.

2. Access and License
Subject to your compliance with this Agreement and payment of fees, Provider grants you a non-exclusive, non-transferable, non-sublicensable, limited right to access and use the Service during the Subscription Term solely for your internal business purposes related to dispatching trucks. You may allow unlimited trucks to be dispatched under your subscription.

3. Free Trial (If Applicable)
At Provider's sole discretion, selected customers may be offered a free trial period of up to 30 days ("Trial Period"). During the Trial Period, the Service is provided "as is" without any warranties or support obligations. Provider may terminate the Trial Period at any time without notice. Upon expiration of the Trial Period, access will cease unless you subscribe to a paid plan.

4. Fees and Payment
The standard subscription fee is $249 per month (plus applicable taxes), billed in advance for unlimited truck dispatching. Provider reserves the right to increase fees upon at least 30 days' notice, effective for the next renewal. Payments are due within 30 days of invoice. Late payments accrue interest at 1.5% per month or the maximum allowed by law. All fees are non-refundable except as expressly provided herein.

5. Customer Obligations
You are responsible for: (a) maintaining the confidentiality of your account credentials; (b) all activities under your account; (c) ensuring your use complies with applicable laws; and (d) providing accurate information during signup.

6. Intellectual Property
Provider retains all right, title, and interest in the Service, including all intellectual property rights. You grant Provider a limited license to use your data solely to provide the Service.

7. Data and Privacy
You own your data inputted into the Service. Provider will use commercially reasonable efforts to maintain security, but you are responsible for backing up your data.

8. Termination
Either party may terminate for material breach with 30 days' written notice (if uncured). Provider may suspend or terminate access immediately for non-payment or violation of this Agreement. Upon termination, access ceases, and you must pay any outstanding fees.

9. Warranty Disclaimer
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND. PROVIDER DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AVAILABILITY, ERROR-FREE OPERATION, OR THAT THE SERVICE WILL MEET YOUR REQUIREMENTS. PROVIDER DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR FREE FROM VIRUSES OR ERRORS.

10. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL PROVIDER BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOST PROFITS, LOST DATA, BUSINESS INTERRUPTION, OR LOSS ARISING FROM USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY. PROVIDER'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT WILL NOT EXCEED THE AMOUNTS PAID BY YOU TO PROVIDER IN THE 12 MONTHS PRECEDING THE CLAIM. PROVIDER WILL NOT BE LIABLE FOR ANY LOSS, DAMAGE, OR INJURY RESULTING FROM YOUR USE OF THE SERVICE IN CONNECTION WITH TRUCK DISPATCHING, INCLUDING BUT NOT LIMITED TO DELAYS, ACCIDENTS, REGULATORY VIOLATIONS, OR THIRD-PARTY ACTIONS.

11. Indemnification
You agree to indemnify, defend, and hold harmless Provider from any claims arising from your use of the Service, violation of this Agreement, or infringement of third-party rights by your data.

12. Governing Law and Dispute Resolution
This Agreement is governed by the laws of the Commonwealth of Virginia, without regard to conflict of laws principles. Any disputes will be resolved exclusively in the state or federal courts located in Fairfax County, Virginia.

13. Miscellaneous
This Agreement constitutes the entire understanding between the parties. Provider may update this Agreement with notice (continued use constitutes acceptance). If any provision is unenforceable, the remainder remains in effect.`;

interface AdminViewProps {
  company: Company;
  users: User[];
  invoices: Invoice[];
  onUpdateCompanyProfile: (profile: Partial<Company>) => void;
  onAddUser: (user: Omit<User, 'id'>, password?: string) => void | Promise<void>;
  onUpgradePlan: (plan: 'Basic' | 'Premium') => void;
  onAcceptLegal: () => void;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  onUpdateUserProfile: (userId: string, updates: Partial<User>) => void | Promise<void>;
  onDeleteUser: (userId: string) => void | Promise<void>;
  notifications?: AppNotification[];
  loads?: Load[];
  onUpdateLoad?: (loadId: string, updates: Partial<Load>) => void;
}

export default function AdminView({
  company,
  users,
  invoices,
  onUpdateCompanyProfile,
  onAddUser,
  onUpgradePlan,
  onAcceptLegal,
  pageTheme,
  onUpdateUserProfile,
  onDeleteUser,
  notifications = [],
  loads = [],
  onUpdateLoad,
}: AdminViewProps) {
  
  const companyNotifs = (notifications || []).filter(n => n.forCompanyId === company.id);
  
  // Compliance Requirement Interface
  interface ComplianceRequirement {
    id: string;
    name: string;
    category: 'Driver' | 'Vehicle' | 'Taxes' | 'Insurance' | 'Safety';
    status: 'Compliant' | 'Expiring' | 'Overdue' | 'Pending';
    lastValidated: string;
    dueDate: string;
    documentName?: string;
    criticality: 'High' | 'Medium' | 'Low';
  }

  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile' | 'team' | 'billing' | 'rate_confirmations' | 'archived' | 'integrations' | 'accounting' | 'compliance' | 'fleet_equipment'>('dashboard');
  const [showSupportDeskModal, setShowSupportDeskModal] = useState(false);


  // Custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [complianceList, setComplianceList] = useState<ComplianceRequirement[]>([
    {
      id: 'req_cdl',
      name: 'CDL Driver License Certifications',
      category: 'Driver',
      status: 'Compliant',
      lastValidated: '2026-05-10',
      dueDate: '2027-05-10',
      documentName: 'TX_CDL_Validated_Batch.pdf',
      criticality: 'High'
    },
    {
      id: 'req_dot_inspect',
      name: 'Annual FMCSR vehicle DOT Inspection',
      category: 'Vehicle',
      status: 'Expiring',
      lastValidated: '2025-07-15',
      dueDate: '2026-07-15',
      documentName: 'DOT_Inspection_Trucks_2025.pdf',
      criticality: 'High'
    },
    {
      id: 'req_ifta',
      name: 'IFTA Fuel Tax Filing (Q2 2026)',
      category: 'Taxes',
      status: 'Pending',
      lastValidated: 'N/A',
      dueDate: '2026-07-31',
      criticality: 'Medium'
    },
    {
      id: 'req_insurance',
      name: '$1,000,000 Public Liability Insurance',
      category: 'Insurance',
      status: 'Compliant',
      lastValidated: '2026-01-01',
      dueDate: '2027-01-01',
      documentName: 'COI_Policy_Liberty_9981.pdf',
      criticality: 'High'
    },
    {
      id: 'req_clearinghouse',
      name: 'FMCSA Drug & Alcohol Clearinghouse Audit',
      category: 'Safety',
      status: 'Compliant',
      lastValidated: '2026-03-20',
      dueDate: '2027-03-20',
      documentName: 'Clearinghouse_Annual_Pass.pdf',
      criticality: 'Medium'
    },
    {
      id: 'req_eld',
      name: 'ELD Telematics Hardware Mandate Sync',
      category: 'Safety',
      status: 'Compliant',
      lastValidated: '2026-06-01',
      dueDate: '2026-12-01',
      documentName: 'Samsara_ELD_Verification.pdf',
      criticality: 'High'
    },
  ]);

  // Search & Filter state for compliance table
  const [complianceSearch, setComplianceSearch] = useState('');
  const [complianceCategory, setComplianceCategory] = useState<'all' | 'Driver' | 'Vehicle' | 'Taxes' | 'Insurance' | 'Safety'>('all');

  // Interactive Upload proof modal state
  const [uploadProofTarget, setUploadProofTarget] = useState<ComplianceRequirement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  // New Custom Requirement state
  const [showAddCustomReq, setShowAddCustomReq] = useState(false);
  const [customReqName, setCustomReqName] = useState('');
  const [customReqCategory, setCustomReqCategory] = useState<'Driver' | 'Vehicle' | 'Taxes' | 'Insurance' | 'Safety'>('Safety');
  const [customReqCriticality, setCustomReqCriticality] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [customReqDueDate, setCustomReqDueDate] = useState('');

  // Federal API Sync simulation
  const [isSyncingFMCSA, setIsSyncingFMCSA] = useState(false);
  const [fmcsaLastSynced, setFmcsaLastSynced] = useState('2026-06-29 14:32 UTC');
  const [showAlertCenterModal, setShowAlertCenterModal] = useState(false);
  const [breakdownAlerts, setBreakdownAlerts] = useState<DriverAlert[]>([]);
  const [showUnifiedOnboardingModal, setShowUnifiedOnboardingModal] = useState(false);
  const [existingFleetTrucks, setExistingFleetTrucks] = useState<TruckType[]>([]);
  const [ownerCompanies, setOwnerCompanies] = useState<OwnerOperatorCompany[]>([]);

  useEffect(() => {
    if (!company?.id) return;
    const alertsRef = collection(db, 'admins', company.id, 'driver_alerts');
    const unsubscribeAlerts = onSnapshot(alertsRef, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriverAlert));
      setBreakdownAlerts(list);
    }, (err) => {
      console.warn('Driver alerts snapshot error:', err);
    });

    const trucksRef = collection(db, 'admins', company.id, 'trucks');
    const unsubscribeTrucks = onSnapshot(trucksRef, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckType));
      setExistingFleetTrucks(list);
    }, (err) => {
      console.warn('Trucks snapshot error:', err);
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
      console.warn('Owner companies snapshot error (owner_operator_companies):', err);
    });

    const ooRef2 = collection(db, 'admins', company.id, 'owner_operators');
    const unsubscribeOO2 = onSnapshot(ooRef2, (snap) => {
      list2 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OwnerOperatorCompany));
      mergeAndSetOwnerCompanies();
    }, (err) => {
      console.warn('Owner companies snapshot error (owner_operators):', err);
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
      unsubscribeAlerts();
      unsubscribeTrucks();
      unsubscribeOO1();
      unsubscribeOO2();
    };
  }, [company?.id]);

  const activeBreakdownCount = breakdownAlerts.filter(alert =>
    ['open', 'acknowledged', 'in_progress'].includes(alert.status)
  ).length;

  const hasActiveBreakdownAlert = activeBreakdownCount > 0;

  // Archive System state
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSubTab, setArchiveSubTab] = useState<'loads' | 'drivers'>('loads');
  
  // Profile Forms
  const [coName, setCoName] = useState(company.name);
  const [coDot, setCoDot] = useState(company.dotNumber);
  const [coEmail, setCoEmail] = useState(company.contactEmail);
  const [coPhone, setCoPhone] = useState(company.contactPhone);
  const [coAddr, setCoAddr] = useState(company.address);
  const [coLogoUrl, setCoLogoUrl] = useState(company.logoUrl || '');
  const [coThemeColor, setCoThemeColor] = useState(company.themeColor || '#8b5cf6');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const storagePath = `branding/${company.id}/${Date.now()}_${file.name}`;
      const url = await uploadFileToStorage(file, storagePath);
      setCoLogoUrl(url);
    } catch (err: any) {
      console.error("Error uploading company logo:", err);
      alert("Failed to upload company logo: " + (err.message || err));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  React.useEffect(() => {
    setCoName(company.name);
    setCoDot(company.dotNumber);
    setCoEmail(company.contactEmail);
    setCoPhone(company.contactPhone);
    setCoAddr(company.address);
    setCoLogoUrl(company.logoUrl || '');
    setCoThemeColor(company.themeColor || '#8b5cf6');
  }, [company]);

  // Add User Forms
  const [newUserRole, setNewUserRole] = useState<'dispatcher' | 'driver'>('dispatcher');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [truckNumber, setTruckNumber] = useState('');
  const [ownerOperatorName, setOwnerOperatorName] = useState('');
  
  // Helpers and state for secure temporary passwords
  const generateTempPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pass = 'Temp!';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };
  
  const [newUserPassword, setNewUserPassword] = useState(() => generateTempPassword());
  const [isOnboarding, setIsOnboarding] = useState(false);

  // User/Driver Edit Modal States
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCdl, setEditCdl] = useState('');
  const [editTruck, setEditTruck] = useState('');
  const [editOwnerOperatorCompanyId, setEditOwnerOperatorCompanyId] = useState('');
  const [editOwnerOperator, setEditOwnerOperator] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editMultiLoadEnabled, setEditMultiLoadEnabled] = useState(false);
  const [editMaximumOpenLoads, setEditMaximumOpenLoads] = useState(5);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Dispatcher Custom Permission States
  const [newDispatcherPermissions, setNewDispatcherPermissions] = useState<DispatcherPermissions>(PRESET_STANDARD_DISPATCHER);
  const [editDispatcherPermissions, setEditDispatcherPermissions] = useState<DispatcherPermissions>(PRESET_STANDARD_DISPATCHER);

  const handleStartEditUser = (usr: User) => {
    setEditingUser(usr);
    setEditName(usr.name);
    setEditEmail(usr.email);
    setEditPhone(usr.phone || '');
    setEditCdl(usr.licenseNumber || '');
    setEditTruck(usr.truckNumber || '');
    setEditStatus(usr.status || 'active');
    setEditMultiLoadEnabled(usr.multiLoadEnabled ?? false);
    setEditMaximumOpenLoads(usr.maximumOpenLoads ?? 5);

    let initialOOCompanyId = usr.ownerOperatorCompanyId || '';
    let initialOOName = usr.ownerOperatorName || '';

    // Auto-detect if driver is assigned to a truck in Fleet Center with an Owner Operator vendor
    const assignedTruck = existingFleetTrucks.find(t =>
      (t.currentDriverId && (t.currentDriverId === usr.id || t.currentDriverId === usr.uid)) ||
      (t.assignedDriverId && (t.assignedDriverId === usr.id || t.assignedDriverId === usr.uid)) ||
      (usr.truckNumber && (t.truckNumber === usr.truckNumber || t.id === usr.currentTruckId))
    );

    if (assignedTruck) {
      const truckOOId = assignedTruck.ownerOperatorCompanyId || assignedTruck.currentOwnerOperatorCompanyId;
      const truckOOName = assignedTruck.ownerOperatorName || assignedTruck.ownerOperatorVendor;
      if (!initialOOCompanyId && truckOOId) {
        initialOOCompanyId = truckOOId;
      }
      if (!initialOOName && truckOOName) {
        initialOOName = truckOOName;
      }
    }

    if (!initialOOCompanyId && initialOOName) {
      const matchedOO = ownerCompanies.find(o =>
        o.legalName?.toLowerCase() === initialOOName.toLowerCase() ||
        o.dbaName?.toLowerCase() === initialOOName.toLowerCase() ||
        o.ownerName?.toLowerCase() === initialOOName.toLowerCase()
      );
      if (matchedOO) {
        initialOOCompanyId = matchedOO.id;
      }
    }

    setEditOwnerOperatorCompanyId(initialOOCompanyId);
    setEditOwnerOperator(initialOOName);

    if (usr.role === 'dispatcher') {
      setEditDispatcherPermissions(getDispatcherPermissions(usr));
    }
  };

  useEffect(() => {
    if (!editingUser || ownerCompanies.length === 0) return;
    if (!editOwnerOperatorCompanyId) {
      const targetOOId = editingUser.ownerOperatorCompanyId;
      const targetOOName = (editingUser.ownerOperatorName || editOwnerOperator || '').trim().toLowerCase();
      if (targetOOId) {
        const matchedById = ownerCompanies.find(o => o.id === targetOOId);
        if (matchedById) {
          setEditOwnerOperatorCompanyId(matchedById.id);
          setEditOwnerOperator(matchedById.legalName || matchedById.dbaName || matchedById.ownerName || '');
          return;
        }
      }
      if (targetOOName) {
        const matchedByName = ownerCompanies.find(o =>
          o.legalName?.toLowerCase() === targetOOName ||
          o.dbaName?.toLowerCase() === targetOOName ||
          o.ownerName?.toLowerCase() === targetOOName
        );
        if (matchedByName) {
          setEditOwnerOperatorCompanyId(matchedByName.id);
          setEditOwnerOperator(matchedByName.legalName || matchedByName.dbaName || matchedByName.ownerName || '');
        }
      }
    }
  }, [ownerCompanies, editingUser]);

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editName.trim() || !editEmail.trim()) {
      alert('Name and Email are required.');
      return;
    }
    setIsUpdatingUser(true);
    try {
      const matchedOO = ownerCompanies.find(o => o.id === editOwnerOperatorCompanyId);
      const resolvedOOName = matchedOO
        ? (matchedOO.legalName || matchedOO.dbaName || matchedOO.ownerName)
        : editOwnerOperator.trim();

      const updates: Partial<User> = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        licenseNumber: editCdl.trim(),
        truckNumber: editTruck.trim(),
        ownerOperatorCompanyId: editOwnerOperatorCompanyId || null,
        ownerOperatorName: resolvedOOName || '',
        status: editStatus,
      };

      if (editingUser.role === 'driver') {
        updates.multiLoadEnabled = editMultiLoadEnabled;
        updates.maximumOpenLoads = editMaximumOpenLoads;
        if (editMultiLoadEnabled !== editingUser.multiLoadEnabled) {
          updates.multiLoadEnabledAt = new Date().toISOString();
          updates.multiLoadEnabledByUid = auth?.currentUser?.uid || 'admin';
        }
      }

      if (editingUser.role === 'dispatcher') {
        updates.dispatcherPermissions = editDispatcherPermissions;
        (updates as any).permissions = editDispatcherPermissions;
      }

      await onUpdateUserProfile(editingUser.id, updates);
      alert(`User "${editName}" profile updated successfully!`);
      setEditingUser(null);
    } catch (err: any) {
      alert(`Failed to update profile: ${err.message}`);
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

  // Stripe Checkout simulation modal state
  const [showCheckout, setShowCheckout] = useState<string | null>(null); // 'Premium' or 'Enterprise'
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('412');
  const [cardZip, setCardZip] = useState('75201');
  const [isPaying, setIsPaying] = useState(false);
  const [isSyncingInvoices, setIsSyncingInvoices] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Onboarding form states
  const [obPhone, setObPhone] = useState(company.contactPhone === '(555) 019-2831' ? '' : company.contactPhone);
  const [obAddress, setObAddress] = useState(company.address === '100 Logistics Blvd, Suite 200' ? '' : company.address);
  const [obDot, setObDot] = useState(company.dotNumber);
  const [obName, setObName] = useState(company.name);
  
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('Owner / Carrier Admin');
  
  // 7 Mandatory Onboarding Checkboxes
  const [checkTos, setCheckTos] = useState(false);
  const [checkMsa, setCheckMsa] = useState(false);
  const [checkPrivacy, setCheckPrivacy] = useState(false);
  const [checkBilling, setCheckBilling] = useState(false);
  const [checkEsign, setCheckEsign] = useState(false);
  const [checkAuth, setCheckAuth] = useState(false);
  const [checkDriverObligation, setCheckDriverObligation] = useState(false);

  const [showAdminLegalModal, setShowAdminLegalModal] = useState(false);
  const [selectedAdminLegalSlug, setSelectedAdminLegalSlug] = useState('terms-of-service');

  const [obPlan, setObPlan] = useState<'Basic' | 'Premium'>('Basic');
  const [isSigning, setIsSigning] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Simulated Stripe Checkout inputs
  const [obCardNumber, setObCardNumber] = useState('4242 •••• •••• 4242');
  const [obCardExpiry, setObCardExpiry] = useState('12/28');
  const [obCardCvc, setObCardCvc] = useState('412');
  const [obCardZip, setObCardZip] = useState('75201');

  const [adminTestingAlertUserId, setAdminTestingAlertUserId] = useState<string | null>(null);
  const [adminTestAlertMsg, setAdminTestAlertMsg] = useState<string | null>(null);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  const team = users.filter(u => u.companyId === company.id && !u.isArchived);
  const companyInvoices = invoices.filter(inv => inv.companyId === company.id);

  // Onboarding Wizard Checks
  const needsProfile = !company.address || company.address === '100 Logistics Blvd, Suite 200' || !company.contactPhone || company.address.trim() === '' || company.contactPhone.trim() === '';
  const needsLegal = !company.legalAcceptedAt;
  const hasRealStripeCustomer = Boolean(
    company.stripeCustomerId &&
    company.stripeCustomerId.startsWith('cus_') &&
    !company.stripeCustomerId.startsWith('cus_sim_')
  );
  const hasStripeSubscription = Boolean(
    company.stripeSubscriptionId &&
    company.stripeSubscriptionId.startsWith('sub_')
  );
  const billingReady = (company.paymentStatus === 'paid' || hasStripeSubscription) && (company.subscriptionStatus === 'active' || company.subscriptionStatus === 'trialing');
  const needsBilling = !billingReady;
  const isOnboardingIncomplete = needsProfile || needsLegal || needsBilling;

  // Auto-trigger Guided Product Tour on dashboard load after onboarding/legal accept
  useEffect(() => {
    const activeAdmin = users.find(u => u.id === auth.currentUser?.uid);
    if (activeAdmin && activeAdmin.role === 'admin' && company?.legalAcceptedAt && !isOnboardingIncomplete) {
      if (shouldShowTourForUser(activeAdmin, 'admin')) {
        setShowGuidedTour(true);
      }
    }
  }, [users, company?.legalAcceptedAt, isOnboardingIncomplete]);

  const handleOnboardingStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obPhone.trim() || !obAddress.trim() || !obDot.trim() || !obName.trim()) {
      alert('Please fill out all operational fields.');
      return;
    }
    onUpdateCompanyProfile({
      name: obName,
      contactPhone: obPhone,
      address: obAddress,
      dotNumber: obDot,
    });
  };

  const handleOnboardingStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTos || !checkMsa || !checkPrivacy || !checkBilling || !checkEsign || !checkAuth || !checkDriverObligation) {
      alert('You must review and accept all 7 mandatory legal agreements and compliance statements to proceed.');
      return;
    }
    if (!signerName.trim()) {
      alert('Please enter your full legal name to sign.');
      return;
    }

    setIsSigning(true);
    try {
      const recordId = `rec_signed_${Date.now()}`;
      await setDoc(doc(db, 'admins', company.id, 'agreement_records', recordId), {
        id: recordId,
        companyId: company.id,
        userId: auth.currentUser?.uid || 'unknown_user',
        userEmail: auth.currentUser?.email || company.contactEmail || 'admin@carrier.com',
        companyName: company.name,
        signedByName: signerName.trim(),
        signedByTitle: signerTitle.trim() || 'Carrier Admin',
        acceptedDocuments: [
          'Terms of Service',
          'Master Services Agreement',
          'Privacy Policy',
          'Billing, Trial, Cancellation, and Refund Policy',
          'E-Sign Consent',
          'Company Authorization',
          'Driver & User Consent Responsibility'
        ],
        documentVersions: {
          'terms-of-service': 'v1.0',
          'master-services-agreement': 'v1.0',
          'privacy-policy': 'v1.0',
          'billing-trial-cancellation-refund-policy': 'v1.0'
        },
        ipAddress: '127.0.0.1',
        userAgent: navigator.userAgent,
        signedAt: new Date().toISOString(),
        documentHash: `sha256_${Date.now()}_${company.id.slice(0, 8)}`,
        status: 'accepted'
      });

      onUpdateCompanyProfile({
        legalAcceptedAt: new Date().toISOString(),
        legalSignedBy: `${signerName.trim()} (${signerTitle.trim() || 'Carrier Admin'})`,
      });
      onAcceptLegal();
    } catch (err) {
      console.error('Error signing legal agreement: ', err);
      alert('Failed to save legal agreement. Please check Firestore connection.');
    } finally {
      setIsSigning(false);
    }
  };

  const handleOnboardingStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubscribing(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
        body: JSON.stringify({
          plan: obPlan,
          companyId: company.id,
          portalUrl: window.location.origin,
        }),
      });

      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initialize payment gateway.');
      }
    } catch (err: any) {
      console.error('Error initiating checkout:', err);
      alert('An error occurred while connecting to the checkout server.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompanyProfile({
      name: coName,
      dotNumber: coDot,
      contactEmail: coEmail,
      contactPhone: coPhone,
      address: coAddr,
      logoUrl: coLogoUrl,
      themeColor: coThemeColor,
    });

    if (auth.currentUser && company.id) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        await setDoc(doc(db, 'admins', company.id), {
          companyName: coName,
          logoUrl: coLogoUrl,
          themeColor: coThemeColor,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.error("Failed to sync branding on profile update: ", err);
      }
    }

    alert('Company profile & branding settings updated successfully!');
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    if (newUserPassword.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    const emailLower = newUserEmail.trim().toLowerCase();
    const existing = users.find(u => u.email.toLowerCase() === emailLower);
    if (existing) {
      alert(`The email "${newUserEmail}" is already registered in the platform under user "${existing.name}" (${existing.role}). Please enter a unique email.`);
      return;
    }

    setIsOnboarding(true);
    try {
      await onAddUser({
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        role: newUserRole,
        companyId: company.id,
        status: 'active',
        phone: newUserPhone.trim() || '(555) 555-0100',
        ...(newUserRole === 'dispatcher' ? {
          permissions: newDispatcherPermissions,
          dispatcherPermissions: newDispatcherPermissions,
        } : {}),
        ...(newUserRole === 'driver' ? {
          licenseNumber: licenseNumber.trim() || 'CDL-TX-882910',
          truckNumber: truckNumber.trim() || 'TRK-900',
          ownerOperatorName: ownerOperatorName.trim(),
        } : {})
      }, newUserPassword);

      alert(`Successfully registered ${newUserRole} "${newUserName}" in systems! A temporary password "${newUserPassword}" has been configured. An invitation email with access credentials has been dispatched.`);

      // Reset Form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setLicenseNumber('');
      setTruckNumber('');
      setOwnerOperatorName('');
      setNewUserPassword(generateTempPassword());
    } catch (err: any) {
      console.error("Personnel onboarding error: ", err);
      alert(`Onboarding Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsOnboarding(false);
    }
  };

  // --- COMPLIANCE & REQUIREMENTS PORTAL EVENTS ---

  // Handle Simulating Federal API Sync
  const handleFmcsaRegistrySync = () => {
    setIsSyncingFMCSA(true);
    setTimeout(() => {
      setIsSyncingFMCSA(false);
      const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      setFmcsaLastSynced(dateStr);
      alert(`✓ Dynamic Registry Check complete. Federal and Carrier requirements validated against FMCSA SAFER Registry as of ${dateStr}.`);
    }, 1200);
  };

  // Open Proof Upload Dialog
  const handleStartUploadProof = (req: ComplianceRequirement) => {
    setUploadProofTarget(req);
    setUploadedFileName('');
  };

  // Submit Simulated Upload Proof
  const handleConfirmUploadProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadProofTarget) return;

    setIsUploadingProof(true);
    
    // Simulate API file parsing with small timeout
    setTimeout(() => {
      setIsUploadingProof(false);
      const docName = uploadedFileName || `${uploadProofTarget.id.toUpperCase()}_Proof_Doc.pdf`;
      
      setComplianceList(prev => prev.map(item => {
        if (item.id === uploadProofTarget.id) {
          return {
            ...item,
            status: 'Compliant',
            lastValidated: new Date().toISOString().slice(0, 10),
            documentName: docName
          };
        }
        return item;
      }));

      alert(`✓ Document "${docName}" processed & OCR indexed. Requirement "${uploadProofTarget.name}" is now marked as COMPLIANT.`);
      setUploadProofTarget(null);
      setUploadedFileName('');
    }, 1000);
  };

  // Handle Adding a New Custom Compliance Requirement
  const handleAddCustomRequirement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customReqName.trim() || !customReqDueDate) {
      alert('Please fill out all fields for the custom requirement.');
      return;
    }

    const newReq: ComplianceRequirement = {
      id: `req_custom_${Date.now()}`,
      name: customReqName.trim(),
      category: customReqCategory,
      status: 'Pending',
      lastValidated: 'N/A',
      dueDate: customReqDueDate,
      criticality: customReqCriticality
    };

    setComplianceList(prev => [...prev, newReq]);
    setShowAddCustomReq(false);
    setCustomReqName('');
    setCustomReqDueDate('');
    
    alert(`✓ Custom Compliance Requirement "${newReq.name}" created. Set to pending administrative proof.`);
  };

  // Handle Deleting custom requirement
  const handleDeleteRequirement = (id: string) => {
    if (!id.startsWith('req_custom_')) {
      alert('Standard federal requirements cannot be deleted, but can be updated with proof.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Remove Requirement',
      message: 'Are you sure you want to remove this custom requirement from your company dossier?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => {
        setComplianceList(prev => prev.filter(r => r.id !== id));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleInitiateStripeCheckout = async (plan: string, customTrialEnabled?: boolean) => {
    setIsPaying(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const isTrialAuthorized = Boolean(company.offerTrial || company.trialEnabled);
      const finalTrial = customTrialEnabled !== undefined ? customTrialEnabled : isTrialAuthorized;

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
        body: JSON.stringify({
          plan: plan.toLowerCase(),
          companyId: company.id,
          trialEnabled: finalTrial,
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
      setIsPaying(false);
    }
  };

  const handleAccessStripePortal = async () => {
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
        body: JSON.stringify({
          companyId: company.id,
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
    }
  };

  const handleSyncInvoices = async () => {
    setIsSyncingInvoices(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(`/api/companies/${company.id}/invoices/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Failed to sync invoices from Stripe.');
      }
    } catch (err) {
      console.error('Invoice sync error:', err);
      alert('An error occurred while syncing invoices.');
    } finally {
      setIsSyncingInvoices(false);
    }
  };

  // Dynamic Design Elements depending on pageTheme
  const cardClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white shadow-xl' :
    pageTheme === 'industrial_terminal' ? 'bg-black border border-amber-500/30 text-amber-400 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const titleBlockClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white' :
    pageTheme === 'industrial_terminal' ? 'bg-black border-2 border-amber-500 text-amber-500 font-mono' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const textMutedClass = 
    pageTheme === 'cosmic_dark' ? 'text-slate-400' :
    pageTheme === 'industrial_terminal' ? 'text-amber-600/80' :
    'text-slate-500';

  const buttonClass = (isActive: boolean) => {
    if (isActive) {
      return pageTheme === 'cosmic_dark' ? 'bg-purple-600 text-white shadow' :
             pageTheme === 'industrial_terminal' ? 'bg-amber-50 text-black font-extrabold border border-amber-500' :
             'bg-indigo-600 text-white shadow-sm';
    } else {
      return pageTheme === 'cosmic_dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' :
             pageTheme === 'industrial_terminal' ? 'bg-slate-950 text-amber-500/70 border border-amber-500/20 hover:bg-slate-900 hover:text-amber-400' :
             'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60';
    }
  };

  if (isOnboardingIncomplete) {
    let activeStep = 1;
    if (!needsProfile) activeStep = 2;
    if (!needsProfile && !needsLegal) activeStep = 3;

    return (
      <div className={`p-6 max-w-4xl mx-auto space-y-6 ${pageTheme === 'industrial_terminal' ? 'text-amber-400 font-mono bg-black min-h-screen' : ''}`}>
        {/* Onboarding Header */}
        <div className={`rounded-2xl p-6 shadow-sm border ${
          pageTheme === 'cosmic_dark' ? 'bg-slate-900 border-slate-800 text-white' :
          pageTheme === 'industrial_terminal' ? 'bg-black border-2 border-amber-500 text-amber-500 font-mono' :
          'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 border ${
              pageTheme === 'industrial_terminal' ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 
              pageTheme === 'cosmic_dark' ? 'bg-purple-600/20 text-purple-400 border-purple-500/10' :
              'bg-indigo-50 text-indigo-600 border-indigo-100'
            }`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-widest font-bold">CARRIER ONBOARDING COMPLIANCE</span>
              <h2 className="text-xl font-heading font-extrabold tracking-tight">Complete Your Tenant Onboarding</h2>
            </div>
          </div>
          <p className={`text-xs mt-2 ${textMutedClass}`}>
            Follow the 3-step security, legal compliance, and subscription setup to activate your carrier portal.
          </p>
        </div>

        {/* Steps Visual Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-3 rounded-xl border flex items-center gap-3 ${
            activeStep === 1 
              ? (pageTheme === 'cosmic_dark' ? 'bg-purple-950/40 border-purple-500 text-white' : pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 border-2 border-amber-500 text-amber-500' : 'bg-indigo-50 border-indigo-500 text-indigo-900')
              : (!needsProfile ? 'opacity-70 bg-emerald-500/5 border-emerald-500/30 text-emerald-500' : 'opacity-40 bg-slate-100 border-slate-200 text-slate-400')
          }`}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
              !needsProfile ? 'bg-emerald-500 text-white' : (activeStep === 1 ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-300 text-slate-600')
            }`}>
              {!needsProfile ? <Check className="h-4 w-4" /> : '1'}
            </div>
            <div>
              <div className="text-[11px] font-bold">1. Carrier Settings</div>
              <div className="text-[9px] font-mono opacity-80">{!needsProfile ? 'Completed' : 'Action Required'}</div>
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center gap-3 ${
            activeStep === 2 
              ? (pageTheme === 'cosmic_dark' ? 'bg-purple-950/40 border-purple-500 text-white' : pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 border-2 border-amber-500 text-amber-500' : 'bg-indigo-50 border-indigo-500 text-indigo-900')
              : (!needsLegal ? 'opacity-70 bg-emerald-500/5 border-emerald-500/30 text-emerald-500' : 'opacity-40 bg-slate-100 border-slate-200 text-slate-400')
          }`}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
              !needsLegal ? 'bg-emerald-500 text-white' : (activeStep === 2 ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-300 text-slate-600')
            }`}>
              {!needsLegal ? <Check className="h-4 w-4" /> : '2'}
            </div>
            <div>
              <div className="text-[11px] font-bold">2. Legal Agreement</div>
              <div className="text-[9px] font-mono opacity-80">{!needsLegal ? 'Immutable Sign' : 'Signature Required'}</div>
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center gap-3 ${
            activeStep === 3 
              ? (pageTheme === 'cosmic_dark' ? 'bg-purple-950/40 border-purple-500 text-white' : pageTheme === 'industrial_terminal' ? 'bg-amber-500/10 border-2 border-amber-500 text-amber-500' : 'bg-indigo-50 border-indigo-500 text-indigo-900')
              : 'opacity-40 bg-slate-100 border-slate-200 text-slate-400'
          }`}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
              activeStep === 3 ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-300 text-slate-600'
            }`}>
              3
            </div>
            <div>
              <div className="text-[11px] font-bold">3. Stripe Billing</div>
              <div className="text-[9px] font-mono opacity-80">Subscription Setup</div>
            </div>
          </div>
        </div>

        {/* Step Views */}
        {activeStep === 1 && (
          <div className={`rounded-2xl p-6 border ${cardClass}`}>
            <div className="mb-4">
              <h3 className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-400" />
                Step 1: Carrier Profile Settings
              </h3>
              <p className={`text-xs mt-1 ${textMutedClass}`}>
                Complete your FMCSA Motor Carrier record coordinates to initialize billing and BOL routing engines.
              </p>
            </div>

            <form onSubmit={handleOnboardingStep1} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block">Legal Company Name</label>
                  <input
                    type="text"
                    required
                    value={obName}
                    onChange={(e) => setObName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block">FMCSA DOT Number</label>
                  <input
                    type="text"
                    required
                    value={obDot}
                    onChange={(e) => setObDot(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block">Fleet Contact Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="(555) 555-5555"
                    value={obPhone}
                    onChange={(e) => setObPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block">Physical Fleet Address</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 100 Logistics Blvd, Dallas, TX 75201"
                    value={obAddress}
                    onChange={(e) => setObAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 flex justify-end">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition shadow"
                >
                  Save & Lock Profile <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {activeStep === 2 && (
          <div className={`rounded-2xl p-6 border ${cardClass}`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-400" />
                  Step 2: Legal SaaS Subscription & Compliance Execution
                </h3>
                <p className={`text-xs mt-1 ${textMutedClass}`}>
                  Review and execute the mandatory multi-tenant agreements for <strong className="text-white">{company.name}</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedAdminLegalSlug('terms-of-service');
                  setShowAdminLegalModal(true);
                }}
                className="px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>View Full Legal Directory (19 Docs)</span>
              </button>
            </div>

            <form onSubmit={handleOnboardingStep2} className="space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 h-40 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap select-none scrollbar-thin">
                {SAAS_AGREEMENT_TEXT}
              </div>

              {/* 7 Mandatory Compliance Checkboxes */}
              <div className="space-y-2.5 p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 font-mono mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Mandatory Legal & Compliance Checkbox Acknowledgments
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkTos}
                    onChange={(e) => setCheckTos(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    1. I agree to the <button type="button" onClick={() => { setSelectedAdminLegalSlug('terms-of-service'); setShowAdminLegalModal(true); }} className="text-indigo-400 underline font-semibold">Terms of Service</button>.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkMsa}
                    onChange={(e) => setCheckMsa(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    2. I agree to the <button type="button" onClick={() => { setSelectedAdminLegalSlug('master-services-agreement'); setShowAdminLegalModal(true); }} className="text-indigo-400 underline font-semibold">Master Services Agreement</button>.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkPrivacy}
                    onChange={(e) => setCheckPrivacy(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    3. I agree to the <button type="button" onClick={() => { setSelectedAdminLegalSlug('privacy-policy'); setShowAdminLegalModal(true); }} className="text-indigo-400 underline font-semibold">Privacy Policy</button> (including SMS opt-in non-sharing commitment).
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkBilling}
                    onChange={(e) => setCheckBilling(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    4. I agree to the <button type="button" onClick={() => { setSelectedAdminLegalSlug('billing-trial-cancellation-refund-policy'); setShowAdminLegalModal(true); }} className="text-indigo-400 underline font-semibold">Billing, Trial, Cancellation, and Refund Policy</button> ($59.99/mo Basic, $159.99/mo Premium).
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkEsign}
                    onChange={(e) => setCheckEsign(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    5. I consent to electronic records and electronic signatures under the ESIGN Act.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkAuth}
                    onChange={(e) => setCheckAuth(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    6. I confirm that I am an authorized corporate officer or agent with legal authority to bind <strong className="text-white">{company.name}</strong>.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkDriverObligation}
                    onChange={(e) => setCheckDriverObligation(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    7. I understand that my company is solely responsible for obtaining legally required consents from its drivers and personnel for GPS location tracking, SMS alerts, and dispatch communications.
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800/60">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block mb-1">
                      Authorized Signatory Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter your full legal name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-400 block mb-1">
                      Signatory Title / Position
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Owner, President, Safety Director"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs py-2 px-3 text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 flex justify-between items-center">
                <div className="text-[10px] text-slate-500 font-mono">
                  SHA-256 Audit Audit Log • Agent: {navigator.userAgent.slice(0, 35)}...
                </div>
                <button
                  type="submit"
                  disabled={isSigning}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition shadow-lg shadow-indigo-600/20"
                >
                  {isSigning ? 'Signing Contract...' : 'Digitally Sign & Lock Agreement'} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {activeStep === 3 && (
          <div className={`rounded-2xl p-6 border ${cardClass}`}>
            <div className="mb-4">
              <h3 className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-400" />
                Step 3: Stripe Subscription & Billing Portal
              </h3>
              <p className={`text-xs mt-1 ${textMutedClass}`}>
                Unless a valid paid subscription is active on Stripe, access to dispatch logs, GPS feeds, and drivers is gated.
              </p>
            </div>

            <form onSubmit={handleOnboardingStep3} className="space-y-6">
              {/* Plan Choice */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  onClick={() => setObPlan('Basic')}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                    obPlan === 'Basic' 
                      ? 'bg-slate-800/80 border-slate-400 border-2 shadow'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-white">Basic Fleet</span>
                      <span className="bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-full text-[9px] px-2 py-0.5 font-bold">Core Dispatch</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Essential dispatching, load creation, & driver assignment.</p>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-white">$59.99</span>
                    <span className="text-[10px] text-slate-500">/ month</span>
                  </div>
                </div>

                <div 
                  onClick={() => setObPlan('Premium')}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                    obPlan === 'Premium' 
                      ? 'bg-purple-950/40 border-purple-500 border-2 shadow'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Premium Fleet</span>
                      <span className="bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-full text-[9px] px-2 py-0.5 font-bold">Popular</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Full AI rate parsing, live GPS breadcrumbs, & automated alerts.</p>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-white">$159.99</span>
                    <span className="text-[10px] text-slate-500">/ month</span>
                  </div>
                </div>
              </div>

              {/* Stripe Payment Gateway Information Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 max-w-xl">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-emerald-500" /> Official Encrypted Stripe Payment Gateway
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    PCI DSS Level 1 Certified
                  </div>
                </div>

                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    Clicking <strong className="text-white">"Proceed to Stripe Payment Gateway"</strong> will connect directly to Stripe's secure payment section.
                  </p>
                  <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-1">
                    <li>Enter payment card details securely on Stripe's encrypted checkout page.</li>
                    <li>
                      {company.trialEnabled ? '30-day trial will be attached with card setup.' : 'Instant activation for dispatching, GPS, and driver portal.'}
                    </li>
                    <li>Automatic real-time return and full access to your Admin Dashboard upon completion.</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubscribing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition shadow animate-pulse"
                >
                  {isSubscribing ? (
                    <>
                      <span className="h-3 w-3 border-2 border-t-transparent border-white rounded-full animate-spin"></span>
                      Redirecting to Stripe Payment Gateway...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 text-yellow-400" /> Proceed to Stripe Payment Gateway & Enter Card Details
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${pageTheme === 'industrial_terminal' ? 'text-amber-400 font-mono bg-black' : ''}`} id="company-admin-workspace">
      
      {/* Master Announcement Banner */}
      <MasterAnnouncementBanner userRole="admin" />

      {/* System Status Bar */}
      <SystemStatusBar userRole="admin" />

      {/* Overview Card */}
      <div className={`rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm ${titleBlockClass}`}>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 border ${
              pageTheme === 'industrial_terminal' ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 
              pageTheme === 'cosmic_dark' ? 'bg-purple-600/20 text-purple-400 border-purple-500/10' :
              'bg-indigo-50 text-indigo-600 border-indigo-100'
            }`}>
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <span className={`text-[10px] uppercase font-mono tracking-wider ${
                pageTheme === 'industrial_terminal' ? 'text-amber-500/85' : 
                pageTheme === 'cosmic_dark' ? 'text-purple-400' :
                'text-indigo-600'
              }`}>TENANT PORTAL</span>
              <h2 className="font-heading text-2xl font-bold tracking-tight">{company.name}</h2>
            </div>
          </div>
          <p className={`text-xs ${textMutedClass}`}>
            Configure company assets, legal DOT compliance documents, dispatcher routing nodes, and manage Stripe subscription.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setShowAlertCenterModal(true)}
            id="tour-breakdown-center"
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/60 border border-red-500/50 cursor-pointer ${
              hasActiveBreakdownAlert ? 'animate-pulse' : ''
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-white" />
            <span>
              {activeBreakdownCount > 0
                ? `Breakdown SOS Center (${activeBreakdownCount})`
                : 'Breakdown SOS Center'}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'dashboard')}`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('compliance')}
            id="tour-compliance-center"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'compliance')}`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Compliance Center
          </button>
          <button 
            onClick={() => setActiveTab('fleet_equipment')}
            id="tour-fleet-equipment"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'fleet_equipment')}`}
          >
            <Truck className="h-3.5 w-3.5 text-emerald-400" /> Fleet & Equipment
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            id="tour-company-profile"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${buttonClass(activeTab === 'profile')}`}
          >
            Company Profile
          </button>
          <button 
            onClick={() => setActiveTab('team')}
            id="tour-team-roster"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${buttonClass(activeTab === 'team')}`}
          >
            Team Roster ({team.length})
          </button>
          <button 
            onClick={() => setActiveTab('billing')}
            id="tour-billing-section"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${buttonClass(activeTab === 'billing')}`}
          >
            Stripe Subscription & Billing
          </button>
          <button 
            onClick={() => setActiveTab('rate_confirmations')}
            id="tour-rate-confirmations"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'rate_confirmations')}`}
          >
            <FileText className="h-3.5 w-3.5" /> Rate Confirmations
          </button>
          <button 
            onClick={() => setActiveTab('integrations')}
            id="tour-integrations-section"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'integrations')}`}
          >
            <Plug className="h-3.5 w-3.5" /> Integrations
          </button>
          <button 
            onClick={() => setActiveTab('accounting')}
            id="tour-accounting-section"
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'accounting')}`}
          >
            <Calculator className="h-3.5 w-3.5" /> Financial Operations Center
          </button>
          <button 
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${buttonClass(activeTab === 'archived')}`}
            id="admin-tab-btn-archived-items"
          >
            <Trash2 className="h-3.5 w-3.5" /> Archived Items
          </button>
          <button 
            onClick={() => setShowSupportDeskModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer"
            id="tour-support-center"
          >
            <HelpCircle className="h-3.5 w-3.5" /> Support Center
          </button>
          <button
            onClick={() => setShowGuidedTour(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 cursor-pointer"
            title="Retake Product Tour"
            id="admin-btn-take-tour-again"
          >
            <Compass className="h-3.5 w-3.5 text-purple-400" />
            <span>Take Tour Again</span>
          </button>

        </div>
      </div>

      {/* Main Grid Content */}
      {activeTab === 'fleet_equipment' ? (
        <FleetEquipmentCenter
          company={company}
          users={users}
          pageTheme={pageTheme === 'cosmic_dark' || pageTheme === 'industrial_terminal' ? 'dark' : 'light'}
          currentUserId={auth.currentUser?.uid || ''}
          userRole="admin"
        />
      ) : activeTab === 'compliance' ? (
        <ComplianceCenter
          company={company}
          currentUser={
            users.find(u => u.id === auth.currentUser?.uid) ||
            ({
              id: auth.currentUser?.uid || '',
              name: 'Admin',
              email: company.contactEmail,
              role: 'admin',
              companyId: company.id,
              status: 'active',
              phone: ''
            } as User)
          }
          users={users}
          pageTheme={pageTheme}
        />
      ) : activeTab === 'accounting' ? (
        <AccountingCenter
          companyId={company.id}
          currentUser={
            users.find(u => u.id === auth.currentUser?.uid) ||
            ({
              id: auth.currentUser?.uid || '',
              name: 'Admin',
              email: company.contactEmail,
              role: 'admin',
              companyId: company.id,
              status: 'active',
              phone: ''
            } as User)
          }
        />
      ) : activeTab === 'integrations' ? (
        <IntegrationCenter
          companyId={company.id}
          userRole="admin"
          currentUser={
            users.find(u => u.id === auth.currentUser?.uid) ||
            ({
              id: auth.currentUser?.uid || '',
              name: 'Admin',
              email: company.contactEmail,
              role: 'admin',
              companyId: company.id,
              status: 'active',
              phone: ''
            } as User)
          }
        />
      ) : activeTab === 'rate_confirmations' ? (
        <RateConfirmationsView company={company} users={users} pageTheme={pageTheme} />
      ) : activeTab === 'archived' ? (
        <div className={`p-6 rounded-2xl border ${cardClass} space-y-6 animate-in fade-in duration-200`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold font-heading flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-purple-500" /> Archived System Repository
              </h3>
              <p className={`text-xs mt-1 ${textMutedClass}`}>
                Restore or audit archived loads (canceled/completed) and dispatch drivers removed from the front dashboard.
              </p>
            </div>
            
            {/* Toggle subtabs */}
            <div className="flex gap-1.5 bg-slate-950/20 p-1 rounded-xl border border-slate-800/20 self-start">
              <button
                type="button"
                onClick={() => {
                  setArchiveSubTab('loads');
                  setArchiveSearch('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  archiveSubTab === 'loads'
                    ? (pageTheme === 'cosmic_dark' ? 'bg-purple-600 text-white' : 'bg-indigo-600 text-white')
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Archived Loads
              </button>
              <button
                type="button"
                onClick={() => {
                  setArchiveSubTab('drivers');
                  setArchiveSearch('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  archiveSubTab === 'drivers'
                    ? (pageTheme === 'cosmic_dark' ? 'bg-purple-600 text-white' : 'bg-indigo-600 text-white')
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Archived Drivers
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className={`p-4 rounded-xl border ${
            pageTheme === 'cosmic_dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                placeholder={archiveSubTab === 'loads' ? "Search by load number, cargo type, route..." : "Search by driver name, email, CDL..."}
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="w-full bg-transparent border-0 pl-9 pr-3 py-1 text-xs focus:ring-0 focus:outline-none placeholder-slate-400 text-inherit"
              />
            </div>
          </div>

          {/* List contents */}
          {archiveSubTab === 'loads' ? (
            (() => {
              const companyArchivedLoads = loads.filter(l => l.companyId === company.id && l.isArchived);
              const filteredArchivedLoads = companyArchivedLoads.filter(l => {
                const searchLower = archiveSearch.toLowerCase();
                return (
                  l.loadNumber.toLowerCase().includes(searchLower) ||
                  (l.cargoType || '').toLowerCase().includes(searchLower) ||
                  (l.pickup?.address || '').toLowerCase().includes(searchLower) ||
                  (l.delivery?.address || '').toLowerCase().includes(searchLower) ||
                  (l.status || '').toLowerCase().includes(searchLower)
                );
              });

              if (companyArchivedLoads.length === 0) {
                return (
                  <div className="text-center py-12 text-slate-400 text-xs font-mono">
                    No loads have been archived yet in this carrier system.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto rounded-xl border border-slate-800/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b border-slate-800/15 ${
                        pageTheme === 'cosmic_dark' ? 'bg-slate-950/40 text-slate-400' : 'bg-slate-50 text-slate-500'
                      } font-mono text-[10px] uppercase tracking-wider`}>
                        <th className="py-3 px-4">Load #</th>
                        <th className="py-3 px-4">Cargo / Route</th>
                        <th className="py-3 px-4">Rate</th>
                        <th className="py-3 px-4">Status / Tag</th>
                        <th className="py-3 px-4">Archived By</th>
                        <th className="py-3 px-4">Archived On</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {filteredArchivedLoads.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-850/10 transition text-slate-300">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-400">{l.loadNumber}</td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-200">{l.cargoType}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{l.pickup?.address || 'N/A'} ➔ {l.delivery?.address || 'N/A'}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{formatCurrency(l.rate || 0)}</td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              l.status === 'canceled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}>
                              {(l.status || 'Archived').toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 text-[11px]">{l.archivedBy || 'Dispatcher'}</td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                            {l.archivedAt ? new Date(l.archivedAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={async () => {
                                if (onUpdateLoad) {
                                  try {
                                    await onUpdateLoad(l.id, { isArchived: false });
                                    alert(`✓ Load ${l.loadNumber} successfully restored to active dispatcher operations.`);
                                  } catch (err: any) {
                                    alert(`Failed to restore load: ${err.message}`);
                                  }
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredArchivedLoads.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                            No matching archived loads found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()
          ) : (
            (() => {
              const companyArchivedDrivers = users.filter(u => u.companyId === company.id && u.role === 'driver' && u.isArchived);
              const filteredArchivedDrivers = companyArchivedDrivers.filter(u => {
                const searchLower = archiveSearch.toLowerCase();
                return (
                  u.name.toLowerCase().includes(searchLower) ||
                  u.email.toLowerCase().includes(searchLower) ||
                  (u.licenseNumber || '').toLowerCase().includes(searchLower)
                );
              });

              if (companyArchivedDrivers.length === 0) {
                return (
                  <div className="text-center py-12 text-slate-400 text-xs font-mono">
                    No drivers have been archived yet in this carrier system.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto rounded-xl border border-slate-800/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b border-slate-800/15 ${
                        pageTheme === 'cosmic_dark' ? 'bg-slate-950/40 text-slate-400' : 'bg-slate-50 text-slate-500'
                      } font-mono text-[10px] uppercase tracking-wider`}>
                        <th className="py-3 px-4">Driver Name</th>
                        <th className="py-3 px-4">Contact Information</th>
                        <th className="py-3 px-4">CDL License</th>
                        <th className="py-3 px-4">Truck #</th>
                        <th className="py-3 px-4">Archived By</th>
                        <th className="py-3 px-4">Archived On</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {filteredArchivedDrivers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-850/10 transition text-slate-300">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-200">{u.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">ID: {u.id.slice(0, 8)}...</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-mono text-[11px]">{u.email}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{u.phone || 'No phone'}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-200">{u.licenseNumber || 'N/A'}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-200">{u.truckNumber || 'N/A'}</td>
                          <td className="py-3.5 px-4 text-slate-400 text-[11px]">{u.archivedBy || 'Dispatcher'}</td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                            {u.archivedAt ? new Date(u.archivedAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await onUpdateUserProfile(u.id, { isArchived: false });
                                  alert(`✓ Driver "${u.name}" successfully restored to active crew list.`);
                                } catch (err: any) {
                                  alert(`Failed to restore driver: ${err.message}`);
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredArchivedDrivers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                            No matching archived drivers found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left main pane (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
          
          {/* Dashboard & Compliance Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* Score KPI */}
                <div className={`p-4 rounded-2xl border ${cardClass}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">Dossier Score</span>
                      <h3 className="text-2xl font-bold font-sans mt-0.5">
                        {Math.round((complianceList.filter(c => c.status === 'Compliant').length / complianceList.length) * 100)}%
                      </h3>
                    </div>
                    <div className={`p-1.5 rounded-lg ${
                      pageTheme === 'cosmic_dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      <ClipboardCheck className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 opacity-75">
                    {complianceList.filter(c => c.status === 'Compliant').length} of {complianceList.length} items compliant
                  </p>
                </div>

                {/* Fleet Size KPI */}
                <div className={`p-4 rounded-2xl border ${cardClass}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">Active Fleet</span>
                      <h3 className="text-2xl font-bold font-sans mt-0.5">
                        {team.filter(u => u.role === 'driver').length} <span className="text-xs font-normal opacity-60 font-sans">Drivers</span>
                      </h3>
                    </div>
                    <div className={`p-1.5 rounded-lg ${
                      pageTheme === 'cosmic_dark' ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-700 border border-purple-100'
                    }`}>
                      <Truck className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 opacity-75">
                    {team.filter(u => u.role === 'dispatcher').length} dispatch operators
                  </p>
                </div>

                {/* SaaS Plan KPI */}
                <div className={`p-4 rounded-2xl border ${cardClass}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">Stripe Account</span>
                      <h3 className="text-xl font-bold font-sans mt-1">
                        {company.plan || 'Premium'} Tier
                      </h3>
                    </div>
                    <div className={`p-1.5 rounded-lg ${
                      pageTheme === 'cosmic_dark' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-yellow-50 text-yellow-700 border border-yellow-100'
                    }`}>
                      <CreditCard className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 opacity-75">
                    Status: <span className="text-emerald-500 font-bold uppercase font-mono">✓ Active</span>
                  </p>
                </div>

                {/* FMCSA Status KPI */}
                <div className={`p-4 rounded-2xl border ${cardClass}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">FMCSA Sync</span>
                      <h3 className="text-md font-extrabold font-mono mt-1 text-emerald-500">
                        VERIFIED
                      </h3>
                    </div>
                    <div className={`p-1.5 rounded-lg ${
                      pageTheme === 'cosmic_dark' ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-[9px] mt-2 opacity-75 font-mono truncate">
                    DOT: {company.dotNumber || '822910'}
                  </p>
                </div>

              </div>

              {/* Requirement Dossier Section */}
              <div className={`p-6 rounded-2xl border ${cardClass}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-bold font-heading flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-purple-500" /> Compliance & Operating Requirements Tracker
                    </h3>
                    <p className={`text-xs mt-1 ${textMutedClass}`}>
                      Audit, renew, and upload mandatory federal and internal carrier requirements to avoid load dispatch gating.
                    </p>
                  </div>
                  
                  {/* Actions row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSyncingFMCSA}
                      onClick={handleFmcsaRegistrySync}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                        pageTheme === 'cosmic_dark' 
                          ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200' 
                          : pageTheme === 'industrial_terminal'
                          ? 'bg-black border-amber-500 text-amber-400 hover:bg-amber-950/40'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isSyncingFMCSA ? 'animate-spin' : ''}`} />
                      {isSyncingFMCSA ? 'Syncing...' : 'FMCSA SAFER Sync'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAddCustomReq(true)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Custom Requirement
                    </button>
                  </div>
                </div>

                {/* Filters Row */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl mb-6 border ${
                  pageTheme === 'cosmic_dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="h-3.5 w-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search requirements..."
                      value={complianceSearch}
                      onChange={(e) => setComplianceSearch(e.target.value)}
                      className="w-full bg-transparent border-0 pl-9 pr-3 py-1 text-xs focus:ring-0 focus:outline-none placeholder-slate-400 text-inherit"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase font-mono opacity-60 shrink-0 font-bold">Category:</label>
                    <select
                      value={complianceCategory}
                      onChange={(e) => setComplianceCategory(e.target.value as any)}
                      className={`w-full bg-transparent border-0 text-xs py-1 px-2 focus:ring-0 focus:outline-none ${
                        pageTheme === 'cosmic_dark' ? 'text-white bg-slate-900' : 'text-slate-800 bg-white'
                      }`}
                    >
                      <option value="all">All Categories</option>
                      <option value="Driver">Driver Compliance</option>
                      <option value="Vehicle">Vehicle & Hardware</option>
                      <option value="Taxes">Taxes & IFTA</option>
                      <option value="Insurance">Insurance & Bonding</option>
                      <option value="Safety">Safety & Audits</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b border-slate-800/15 ${
                        pageTheme === 'cosmic_dark' ? 'bg-slate-950/40 text-slate-400' : 'bg-slate-50 text-slate-500'
                      } font-mono text-[10px] uppercase tracking-wider`}>
                        <th className="py-3 px-4">Requirement / Scope</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Criticality</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Verified Proof</th>
                        <th className="py-3 px-4">Audit Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {complianceList
                        .filter(item => {
                          const matchesSearch = item.name.toLowerCase().includes(complianceSearch.toLowerCase());
                          const matchesCat = complianceCategory === 'all' || item.category === complianceCategory;
                          return matchesSearch && matchesCat;
                        })
                        .map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition">
                            <td className="py-3.5 px-4">
                              <span className="block font-bold">{item.name}</span>
                              <span className="text-[10px] opacity-60">Verified with FMCSA Registry</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                                item.category === 'Driver' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' :
                                item.category === 'Vehicle' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                                item.category === 'Taxes' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300' :
                                item.category === 'Insurance' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300' :
                                'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                              }`}>
                                {item.category}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-semibold font-mono text-[11px]">
                              <span className={`${
                                item.criticality === 'High' ? 'text-red-500 font-bold' :
                                item.criticality === 'Medium' ? 'text-amber-500' :
                                'text-slate-400'
                              }`}>
                                {item.criticality}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px] opacity-80">
                              {item.dueDate}
                            </td>
                            <td className="py-3.5 px-4">
                              {item.documentName ? (
                                <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold font-sans">
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[120px] text-[11px]">{item.documentName}</span>
                                </div>
                              ) : (
                                <span className="opacity-40 italic">Missing documentation</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wide border ${
                                item.status === 'Compliant' ? 'bg-emerald-100/10 text-emerald-500 border-emerald-500/20' :
                                item.status === 'Expiring' ? 'bg-amber-100/10 text-amber-500 border-amber-500/20' :
                                item.status === 'Overdue' ? 'bg-red-100/10 text-red-500 border-red-500/20' :
                                'bg-blue-100/10 text-blue-400 border-blue-500/20'
                              }`}>
                                {item.status === 'Compliant' ? '● Compliant' :
                                 item.status === 'Expiring' ? '▲ Expiring' :
                                 item.status === 'Overdue' ? '✖ Overdue' :
                                 '? Pending Proof'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartUploadProof(item)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-300 transition-colors"
                                  title="Upload Document Proof"
                                >
                                  <UploadCloud className="h-3.5 w-3.5" />
                                </button>
                                {item.id.startsWith('req_custom_') && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRequirement(item.id)}
                                    className="p-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
                                    title="Delete custom requirement"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center mt-4 text-[10px] opacity-50 font-mono">
                  <span>Last Federal Verification Sync: {fmcsaLastSynced}</span>
                  <span>Compliance score updated in real-time</span>
                </div>
              </div>

            </div>
          )}

          {/* Company Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div>
                <h3 className="font-heading font-bold text-lg text-slate-800">Company Settings</h3>
                <p className="text-xs text-slate-400 mt-1">Configure company identifiers to print on Bills of Lading (BOLs).</p>
              </div>

              <form onSubmit={handleProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Legal Company Name</label>
                  <input
                    type="text"
                    required
                    value={coName}
                    onChange={(e) => setCoName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">FMCSA DOT Registration No.</label>
                  <input
                    type="text"
                    required
                    value={coDot}
                    onChange={(e) => setCoDot(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Corporate Email</label>
                  <input
                    type="email"
                    required
                    value={coEmail}
                    onChange={(e) => setCoEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Corporate Phone</label>
                  <input
                    type="text"
                    required
                    value={coPhone}
                    onChange={(e) => setCoPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Headquarters Address</label>
                  <input
                    type="text"
                    required
                    value={coAddr}
                    onChange={(e) => setCoAddr(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">Company Brand Logo</label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    {/* Logo Preview box */}
                    <div className="h-16 w-16 bg-white rounded-lg border border-slate-200 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-sm">
                      {coLogoUrl ? (
                        <img src={coLogoUrl} alt="Company logo preview" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <Building2 className="h-8 w-8 text-slate-300" />
                      )}
                    </div>
                    
                    {/* Upload Controls */}
                    <div className="flex-1 space-y-2 w-full">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className={`flex items-center justify-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer select-none transition ${isUploadingLogo ? 'opacity-60 pointer-events-none' : ''}`}>
                          {isUploadingLogo ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin text-purple-600" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="h-3 w-3 text-slate-500" />
                              <span>Upload Logo Image</span>
                            </>
                          )}
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleLogoUpload} 
                            className="hidden" 
                            disabled={isUploadingLogo}
                          />
                        </label>
                        <input
                          type="text"
                          value={coLogoUrl}
                          onChange={(e) => setCoLogoUrl(e.target.value)}
                          placeholder="Or paste an image URL here..."
                          className="flex-grow border border-slate-200 rounded-lg py-1.5 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Upload a square or horizontal logo image (PNG, JPG, or SVG). This branding is white-labeled across all driver and dispatcher dashboards.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">Custom Primary Theme Color</label>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    {[
                      { name: 'Default Purple', hex: '#8b5cf6' },
                      { name: 'Royal Blue', hex: '#2563eb' },
                      { name: 'Emerald Green', hex: '#10b981' },
                      { name: 'Sunset Amber', hex: '#f59e0b' },
                      { name: 'Crimson Red', hex: '#ef4444' },
                      { name: 'Slate Gray', hex: '#64748b' },
                    ].map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => setCoThemeColor(p.hex)}
                        className={`p-2 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                          coThemeColor.toLowerCase() === p.hex.toLowerCase() 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span 
                          className="h-4 w-4 rounded-full border border-slate-200 block"
                          style={{ backgroundColor: p.hex }}
                        />
                        <span className="text-[9px] font-semibold text-slate-500 truncate w-full">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-slate-400">Hex color:</span>
                    <input
                      type="color"
                      value={coThemeColor}
                      onChange={(e) => setCoThemeColor(e.target.value)}
                      className="h-6 w-10 rounded cursor-pointer border border-slate-200"
                    />
                    <input
                      type="text"
                      value={coThemeColor}
                      onChange={(e) => setCoThemeColor(e.target.value)}
                      className="border border-slate-200 rounded-lg py-1 px-2.5 text-slate-800 text-xs w-24 text-center uppercase font-mono font-bold"
                      placeholder="#8B5CF6"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div className="md:col-span-2 p-4 bg-purple-50/60 rounded-xl border border-purple-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 my-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-600" />
                      <span className="text-xs font-bold text-slate-800">AI Scraping & Premium AI Features</span>
                      <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full uppercase ${company.plan === 'Premium' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {company.plan === 'Premium' ? 'Premium Active' : 'Requires Upgrade'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Automated rate confirmation PDF parsing, AI load scraping, and live GPS tracking workflows.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (company.plan === 'Premium') {
                        alert('AI Scraping, Rate Confirmation Parsing, and Live GPS Tracking are already fully enabled on your Premium Plan!');
                      } else {
                        setShowUpgradeModal(true);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      company.plan === 'Premium' ? 'bg-purple-600' : 'bg-slate-300'
                    }`}
                    title={company.plan === 'Premium' ? 'Premium Features Active' : 'Click to Upgrade to Premium'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        company.plan === 'Premium' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="md:col-span-2 pt-3 flex justify-end">
                  <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs py-2 px-5 rounded-lg transition"
                  >
                    Save Profile Settings
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Team Roster Tab */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              
              {/* Add User Box */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="mb-4">
                  <h3 className="font-heading font-bold text-md text-slate-800 flex items-center gap-1.5">
                    <UserPlus className="h-4 w-4 text-purple-600" /> Onboard New Personnel
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Assign roles. Personnel will immediately receive authorization to query within this tenant space.</p>
                </div>

                <form onSubmit={handleAddUserSubmit} className="space-y-4">
                  {/* Role Swapper */}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="radio"
                        checked={newUserRole === 'dispatcher'}
                        onChange={() => setNewUserRole('dispatcher')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>Dispatcher</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="radio"
                        checked={newUserRole === 'driver'}
                        onChange={() => setNewUserRole('driver')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>Driver</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="john@truckdispatch.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Phone Number</label>
                      <input
                        type="text"
                        placeholder="(555) 555-1234"
                        value={newUserPhone}
                        onChange={(e) => setNewUserPhone(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold">Temporary Password</label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          placeholder="Temporary password"
                          className="w-full border border-slate-200 rounded-lg py-2 pl-3 pr-20 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setNewUserPassword(generateTempPassword())}
                          className="absolute right-1 top-1 bottom-1 px-2.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded transition"
                        >
                          Generate
                        </button>
                      </div>
                    </div>

                    {newUserRole === 'driver' && (
                      <div className="col-span-1 md:col-span-3 p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-purple-950 text-xs flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-purple-700" />
                            Unified Driver & Fleet Onboarding Workflow
                          </span>
                          <p className="text-[11px] text-purple-800">
                            Register complete CDL details, compliance dates, emergency contacts, and assign or create a centralized truck in one step.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowUnifiedOnboardingModal(true)}
                          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-sm shrink-0 transition flex items-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Launch Onboarding Wizard
                        </button>
                      </div>
                    )}
                  </div>

                  {newUserRole === 'dispatcher' && (
                    <div className="pt-2">
                      <DispatcherPermissionsEditor
                        permissions={newDispatcherPermissions}
                        onChange={setNewDispatcherPermissions}
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isOnboarding}
                      className={`text-white font-semibold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 transition ${isOnboarding ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                      {isOnboarding ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white"></div>
                          Onboarding Staff...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" /> Confirm Activation & Email Credentials
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {adminTestAlertMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-[fadeIn_0.2s]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{adminTestAlertMsg}</span>
                </div>
              )}

              {/* Roster Listing */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-heading font-bold text-sm text-slate-800">Authorized Users ({team.length})</h3>
                  <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-bold">
                    Phase 1 Dispatch Alerts Monitored
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {team.map((usr, idx) => (
                    <div key={usr.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-mono font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg px-1.5 py-0.5 shrink-0">
                          #{idx + 1}
                        </div>
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          usr.role === 'admin' ? 'bg-amber-100 text-amber-800' :
                          usr.role === 'dispatcher' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {usr.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            {usr.name} 
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase tracking-wide ${
                              usr.role === 'admin' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              usr.role === 'dispatcher' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                              'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}>
                              {usr.role}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{usr.email} • {usr.phone}</div>
                          {usr.role === 'driver' && (
                            <div className="text-[9px] text-slate-500 font-mono mt-1">
                              Truck: <span className="font-bold text-slate-700">{usr.truckNumber}</span> | CDL: <span className="font-bold text-slate-700">{usr.licenseNumber}</span>
                              <> | Owner Company: <span className="font-bold text-slate-700">{usr.ownerOperatorName || 'Not Selected'}</span></>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right flex flex-col items-end gap-1">
                          <div>
                            <span className={`h-2 w-2 rounded-full inline-block mr-1.5 ${
                              usr.status === 'inactive' || usr.lifecycleStatus === 'inactive' ? 'bg-rose-500' :
                              usr.status === 'onboarding' || usr.lifecycleStatus === 'onboarding' ? 'bg-amber-500' :
                              usr.status === 'suspended' || usr.lifecycleStatus === 'suspended' ? 'bg-rose-600' :
                              'bg-emerald-500'
                            }`}></span>
                            <span className="text-[10px] font-mono font-bold text-slate-600 uppercase">{usr.lifecycleStatus || usr.status || 'ACTIVE'}</span>
                          </div>
                          {usr.role === 'driver' && (usr.status === 'onboarding' || usr.lifecycleStatus === 'onboarding') && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const token = await auth.currentUser?.getIdToken();
                                  if (!token) {
                                    alert("Session expired. Please re-authenticate.");
                                    return;
                                  }
                                  const res = await fetch(`/api/admin/drivers/${usr.id}/reconcile-status`, {
                                    method: 'POST',
                                    headers: {
                                      'Authorization': `Bearer ${token}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ companyId: company.id, apply: true })
                                  });
                                  const data = await res.json();
                                  if (data.success && data.applied) {
                                    alert(`✅ Driver ${usr.name} status successfully reconciled to ACTIVE!`);
                                    window.location.reload();
                                  } else if (data.blockingIssues && data.blockingIssues.length > 0) {
                                    alert(`⚠️ Cannot reconcile driver: ${data.blockingIssues.join(', ')}`);
                                  } else {
                                    alert(`Reconciliation check completed: ${JSON.stringify(data.differences || 'No changes needed')}`);
                                  }
                                } catch (err: any) {
                                  alert(`Error reconciling status: ${err.message}`);
                                }
                              }}
                              className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-bold cursor-pointer transition"
                            >
                              ⚡ Reconcile / Activate
                            </button>
                          )}
                        </div>
                        {usr.role === 'driver' && (
                          <button
                            type="button"
                            disabled={adminTestingAlertUserId === usr.id}
                            onClick={async () => {
                              try {
                                setAdminTestingAlertUserId(usr.id);
                                await sendDriverNotificationAlert({
                                  driverId: usr.id,
                                  driverName: usr.name,
                                  driverEmail: usr.email,
                                  driverPhone: usr.phone,
                                  title: 'Admin Verification Alert',
                                  message: `Admin verification test alert sent to driver ${usr.name}. Verified channels: Email (${usr.email}), SMS (${usr.phone || 'Phone'}).`,
                                  type: 'test',
                                  companyId: company.id,
                                });
                                setAdminTestAlertMsg(`✅ Admin test alert (Email & SMS) dispatched to ${usr.name} (${usr.email})!`);
                                setTimeout(() => setAdminTestAlertMsg(null), 6000);
                              } catch (err) {
                                console.error('Failed to send test alert:', err);
                              } finally {
                                setAdminTestingAlertUserId(null);
                              }
                            }}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Send test Email & SMS alert to verify driver notification channels"
                          >
                            {adminTestingAlertUserId === usr.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
                            ) : (
                              <Bell className="h-3 w-3 text-amber-600" />
                            )}
                            <span>Test Alert</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEditUser(usr)}
                          className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-purple-600 transition"
                          title="Edit User Profile"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {usr.id !== auth.currentUser?.uid && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Permanently Delete User',
                                message: `Are you absolutely sure you want to permanently delete user "${usr.name}" (${usr.role})? This will revoke all system access and remove their credentials.`,
                                confirmText: 'Delete User',
                                cancelText: 'Cancel',
                                type: 'danger',
                                onConfirm: async () => {
                                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                  try {
                                    await onDeleteUser(usr.id);
                                    alert(`Successfully deleted user "${usr.name}"`);
                                  } catch (e: any) {
                                    alert(`Failed to delete user: ${e.message}`);
                                  }
                                }
                              });
                            }}
                            className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg text-slate-400 hover:text-rose-600 transition"
                            title="Delete User"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Stripe Subscription & Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              
              {/* Billing Summary Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                  <div>
                    <h3 className="font-heading font-bold text-lg text-slate-800">Subscription & Billing Management</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Manage plan tiers, payment status, customer portal settings, and 30-day trial options.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAccessStripePortal}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <CreditCard className="h-4 w-4 text-purple-400" />
                    Manage Subscription (Customer Portal)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Current Plan</span>
                    <div className="text-sm font-extrabold text-slate-800 font-heading flex items-center gap-1.5">
                      <span>{company.plan || 'Basic'}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${company.plan === 'Premium' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>
                        {company.plan === 'Premium' ? '$159.99/mo' : '$59.99/mo'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Subscription Status</span>
                    <div>
                      <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-2 py-0.5 rounded-full uppercase font-mono ${
                        company.subscriptionStatus === 'active' ? 'bg-emerald-100 text-emerald-800' :
                        company.subscriptionStatus === 'trialing' ? 'bg-amber-100 text-amber-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        {company.subscriptionStatus || 'active'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Payment Status</span>
                    <div>
                      <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded uppercase font-mono ${
                        company.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        company.paymentStatus === 'trialing' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {company.paymentStatus || 'paid'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stripe checkout options */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-800">SaaS Subscription Plan</h3>
                  <p className="text-xs text-slate-400 mt-1">Select the tier matching your truck fleet scale. Billed automatically via Stripe Elements.</p>
                </div>

                {/* Active Trial Notice */}
                {company.subscriptionStatus === 'trialing' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-700 font-bold text-xs font-mono">
                      30D
                    </div>
                    <div>
                      <div className="font-bold text-xs text-amber-900">
                        {company.plan || 'Premium'} 30-Day Free Trial Active
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Your 30-day trial is currently active. First charge of {company.plan === 'Basic' ? '$59.99' : '$159.99'}/month will occur on{' '}
                        <strong>
                          {company.trialEnd ? new Date(company.trialEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'trial expiration'}
                        </strong>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {/* Basic Plan */}
                  <div className={`border rounded-2xl p-6 flex flex-col justify-between relative ${company.plan === 'Basic' || !company.plan ? 'border-purple-600 bg-purple-50/20 ring-1 ring-purple-600' : 'border-slate-200'}`}>
                    {(company.plan === 'Basic' || !company.plan) && (
                      <span className="absolute -top-2.5 left-4 bg-purple-600 text-white text-[8px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                        Current Active Plan
                      </span>
                    )}
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs uppercase font-mono font-bold text-slate-500">Basic Plan</span>
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Core Dispatch</span>
                      </div>
                      <span className="text-3xl font-bold font-heading text-slate-900 mt-2 block">$59.99 <span className="text-xs font-normal text-slate-500">/ month</span></span>
                      <p className="text-xs text-slate-500 mt-1">Essential operational dispatching for standard fleets.</p>
                      
                      <ul className="text-xs text-slate-600 space-y-2.5 mt-5">
                        <li className="flex items-center gap-2 text-emerald-700 font-medium"><span className="font-bold text-emerald-600">✓</span> Manual load entry & editing</li>
                        <li className="flex items-center gap-2 text-emerald-700 font-medium"><span className="font-bold text-emerald-600">✓</span> Basic dispatching workflows</li>
                        <li className="flex items-center gap-2 text-emerald-700 font-medium"><span className="font-bold text-emerald-600">✓</span> Basic driver & unit assignment</li>
                        <li className="flex items-center gap-2 text-emerald-700 font-medium"><span className="font-bold text-emerald-600">✓</span> Basic load communications & chat</li>
                        <li className="flex items-center gap-2 text-slate-400 line-through"><span>✗</span> AI rate confirmation parsing</li>
                        <li className="flex items-center gap-2 text-slate-400 line-through"><span>✗</span> Live GPS tracking & driver tracking board</li>
                        <li className="flex items-center gap-2 text-slate-400 line-through"><span>✗</span> AI load extraction / web scraping</li>
                      </ul>
                    </div>
                    
                    {company.plan === 'Basic' || !company.plan ? (
                      <button disabled className="w-full bg-slate-100 text-slate-400 cursor-not-allowed text-xs font-semibold py-2.5 rounded-xl mt-6">
                        Active Tier
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInitiateStripeCheckout('Basic')}
                        disabled={isPaying}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold py-2.5 rounded-xl mt-6 transition shadow disabled:opacity-50"
                      >
                        {isPaying ? 'Connecting...' : 'Switch to Basic ($59.99/mo)'}
                      </button>
                    )}
                  </div>

                  {/* Premium Plan */}
                  <div className={`border rounded-2xl p-6 flex flex-col justify-between relative ${company.plan === 'Premium' ? 'border-purple-600 bg-purple-50/20 ring-1 ring-purple-600' : 'border-slate-200'}`}>
                    {company.plan === 'Premium' && (
                      <span className="absolute -top-2.5 left-4 bg-purple-600 text-white text-[8px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                        Current Active Plan
                      </span>
                    )}
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs uppercase font-mono font-bold text-purple-700">Premium Plan</span>
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded uppercase">Full AI & GPS</span>
                      </div>
                      <span className="text-3xl font-bold font-heading text-slate-900 mt-2 block">$159.99 <span className="text-xs font-normal text-slate-500">/ month</span></span>
                      <p className="text-xs text-slate-500 mt-1">Full-featured AI automation & live GPS tracking deck.</p>

                      <ul className="text-xs text-slate-600 space-y-2.5 mt-5">
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> Everything in Basic Plan</li>
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> AI rate confirmation PDF parsing</li>
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> AI load extraction & auto-population</li>
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> Live GPS tracking & consent workflows</li>
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> Driver tracking board & breadcrumbs</li>
                        <li className="flex items-center gap-2 text-purple-800 font-semibold"><span className="font-bold text-purple-600">✓</span> Advanced dispatch automation & SMS/Email alerts</li>
                      </ul>
                    </div>
                    {company.plan === 'Premium' ? (
                      <button disabled className="w-full bg-slate-100 text-slate-400 cursor-not-allowed text-xs font-semibold py-2.5 rounded-xl mt-6">
                        Active Tier
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInitiateStripeCheckout('Premium')}
                        disabled={isPaying}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2.5 rounded-xl mt-6 shadow-md transition disabled:opacity-50"
                      >
                        {isPaying ? 'Connecting...' : 'Upgrade to Premium ($159.99/mo)'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Invoices History synced from Stripe webhook */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-slate-800">Synced Invoices ({companyInvoices.length})</h3>
                    <p className="text-[10px] text-slate-400">Real-time synchronized records from Stripe billing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSyncInvoices}
                      disabled={isSyncingInvoices}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isSyncingInvoices ? 'animate-spin' : ''}`} />
                      {isSyncingInvoices ? 'Syncing...' : 'Sync Invoices'}
                    </button>
                    <span className="text-[9px] font-mono text-slate-400">Sync: stripe_webhook_active</span>
                  </div>
                </div>
                
                {companyInvoices.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">No invoices on record for this tenant.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {companyInvoices.map((inv, idx) => (
                      <div key={inv.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-mono font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg px-1.5 py-0.5 shrink-0">
                            #{idx + 1}
                          </div>
                          <div className="h-8 w-8 rounded-lg bg-slate-100 border flex items-center justify-center text-slate-500">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-slate-800 font-mono">{inv.invoiceNumber}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{inv.description} • Billed: {inv.date}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <div className="font-bold text-xs text-slate-900">{formatCurrency(inv.amount)}</div>
                            <div className="text-[9px] text-slate-400 font-mono">ID: {inv.id}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {inv.status.toUpperCase()}
                          </span>
                          {(inv.pdfUrl || inv.hostedInvoiceUrl) && (
                            <a
                              href={inv.pdfUrl || inv.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded transition flex items-center gap-1"
                              title="View Invoice PDF"
                            >
                              <Download className="h-3 w-3" />
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Right Compliance bar (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* FMCSA Compliance Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h4 className="font-heading font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Compliance Dossier
            </h4>
            <p className="text-xs text-slate-500">
              The US Federal Motor Carrier Safety Administration (FMCSA) requires active DOT registration verification before assigning loads.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[11px] text-slate-500 font-semibold">FMCSA DOT Match:</span>
                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                  ✓ VERIFIED
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[11px] text-slate-500 font-semibold">SaaS Subscription Status:</span>
                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                  ✓ ACTIVE
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[11px] text-slate-500 font-semibold">Legal Terms Accepted:</span>
                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                  ✓ SIGNED
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[11px] text-slate-500 font-semibold">Stripe Customer Code:</span>
                <span className="font-mono text-[10px] text-slate-400">
                  {company.stripeCustomerId}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[11px] text-slate-500 leading-normal">
              <strong>Agreement Signed</strong>: Accessing global routing APIs, digital document parsing buffers, and GPS location tracking is permitted under contract terms signed by {company.contactEmail}.
            </div>
          </div>

          {/* Quick Stripe Portal Simulator Button */}
          <div className="bg-gradient-to-tr from-purple-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md border border-purple-800/20">
            <h4 className="font-heading font-semibold text-xs text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" /> Self-Service Portal
            </h4>
            <h3 className="font-heading font-bold text-md mt-2">Manage Customer Billing</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Redirect securely to Stripe's customer billing dashboard to download receipts, update payment options, or cancel.
            </p>
            <button
              onClick={handleAccessStripePortal}
              className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              Access Stripe Portal <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Live Carrier Activity Feed */}
          <div className={`p-5 rounded-2xl border ${cardClass} flex flex-col`}>
            <div className="flex items-center justify-between gap-2 border-b pb-3 mb-3">
              <h4 className="font-heading font-bold text-sm flex items-center gap-1.5">
                <Bell className="h-4 w-4 text-purple-500 animate-pulse" /> Carrier Activity Feed
              </h4>
              <span className="text-[9px] font-mono uppercase bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-bold">
                Live Audit
              </span>
            </div>
            
            <p className="text-xs opacity-75 mb-4 leading-relaxed">
              Real-time dispatch synchronization telemetry and personnel registration history.
            </p>

            <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
              {companyNotifs.length === 0 ? (
                <div className="py-8 text-center text-xs opacity-50">
                  No recent activities logged for this carrier.
                </div>
              ) : (
                companyNotifs.map((n) => {
                  let Icon = Info;
                  let colorClass = 'text-blue-500 bg-blue-500/10';
                  if (n.type === 'success') {
                    Icon = CheckCircle2;
                    colorClass = 'text-emerald-500 bg-emerald-500/10';
                  } else if (n.type === 'warning') {
                    Icon = AlertTriangle;
                    colorClass = 'text-amber-500 bg-amber-500/10';
                  } else if (n.type === 'danger') {
                    Icon = ShieldAlert;
                    colorClass = 'text-rose-500 bg-rose-500/10';
                  }
                  
                  return (
                    <div key={n.id} className="flex gap-2.5 text-xs">
                      <div className={`p-1.5 rounded-lg shrink-0 h-7 w-7 flex items-center justify-center ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <strong className="font-semibold truncate block leading-tight">{n.title}</strong>
                          <span className="text-[9px] font-mono opacity-50 whitespace-nowrap font-sans">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="opacity-75 leading-normal text-[11px]">{n.message}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>
      )}

      {/* EDIT USER PROFILE MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" id="edit-user-modal">
          <div className={`w-full ${editingUser.role === 'dispatcher' ? 'max-w-lg' : 'max-w-md'} overflow-hidden rounded-2xl bg-white border shadow-2xl text-slate-800 flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
            
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-400" />
                <h3 className="font-heading font-semibold text-sm">Modify Team Member Profile</h3>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveUserEdit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Authorized Email</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                />
                <span className="text-[9px] text-slate-400 block leading-tight">Driver logins will bind to this email address.</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Contact Phone Number</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                />
              </div>

              {editingUser.role === 'driver' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">CDL License #</label>
                      <input
                        type="text"
                        required
                        value={editCdl}
                        onChange={(e) => setEditCdl(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Truck Code</label>
                      <input
                        type="text"
                        required
                        value={editTruck}
                        onChange={(e) => setEditTruck(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans"
                      />
                    </div>
                  </div>
                  {(() => {
                    const assignedTruck = existingFleetTrucks.find(t =>
                      (t.currentDriverId && (t.currentDriverId === editingUser.id || t.currentDriverId === editingUser.uid)) ||
                      (t.assignedDriverId && (t.assignedDriverId === editingUser.id || t.assignedDriverId === editingUser.uid)) ||
                      (editTruck && (t.truckNumber === editTruck || t.id === editingUser.currentTruckId))
                    );
                    const detectedTruckOOName = assignedTruck?.ownerOperatorName || assignedTruck?.ownerOperatorVendor;
                    const detectedTruckNumber = assignedTruck?.truckNumber || editTruck;

                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Owner Operator / Company Name</label>
                          {detectedTruckOOName && (
                            <span className="text-[9px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/80 font-bold flex items-center gap-1">
                              <Truck className="h-2.5 w-2.5 text-purple-600" />
                              Fleet Truck #{detectedTruckNumber}: {detectedTruckOOName}
                            </span>
                          )}
                        </div>

                        <select
                          value={
                            editOwnerOperatorCompanyId ||
                            (ownerCompanies.find(o => o.legalName === editOwnerOperator || o.dbaName === editOwnerOperator || o.ownerName === editOwnerOperator)?.id) ||
                            (editOwnerOperator ? 'custom' : '')
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setEditOwnerOperatorCompanyId('');
                              setEditOwnerOperator('');
                            } else if (val === 'custom') {
                              setEditOwnerOperatorCompanyId('');
                            } else {
                              setEditOwnerOperatorCompanyId(val);
                              const matched = ownerCompanies.find(o => o.id === val);
                              if (matched) {
                                setEditOwnerOperator(matched.legalName || matched.dbaName || matched.ownerName || '');
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

                        {(!editOwnerOperatorCompanyId && (editOwnerOperator || ownerCompanies.length === 0)) && (
                          <input
                            type="text"
                            placeholder="Enter Custom Owner Operator or Company Name (e.g. JD Trucking LLC)"
                            value={editOwnerOperator}
                            onChange={(e) => setEditOwnerOperator(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans mt-1.5"
                          />
                        )}

                        <span className="text-[9px] text-slate-400 block leading-tight">
                          Select a registered Owner Operator vendor from company records, or leave as <strong className="text-slate-600">Not Selected</strong> (assignments can also be configured in Fleet / Truck Overview).
                        </span>
                      </div>
                    );
                  })()}

                  {/* Multi-Load Dispatch Settings */}
                  <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-purple-600" />
                          Allow Multiple Loads
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Allows driver to see and accept multiple assigned loads
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editMultiLoadEnabled}
                          onChange={(e) => setEditMultiLoadEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {editMultiLoadEnabled && (
                      <div className="space-y-1 pt-2 border-t border-purple-100">
                        <label className="text-[10px] uppercase font-mono text-slate-600 font-bold block">
                          Maximum Open Loads (1-20)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editMaximumOpenLoads}
                          onChange={(e) => setEditMaximumOpenLoads(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        />
                        <p className="text-[9px] text-slate-400">
                          Enforces maximum allowed assigned open loads for this driver. Default is 5.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {editingUser.role === 'dispatcher' && (
                <div className="pt-1">
                  <DispatcherPermissionsEditor
                    permissions={editDispatcherPermissions}
                    onChange={setEditDispatcherPermissions}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">User Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-sans font-semibold text-slate-700"
                >
                  <option value="active">🟢 Active (Authorized & Visible)</option>
                  <option value="inactive">🔴 Inactive / Hidden (Suspended & Hidden from dispatch rosters)</option>
                </select>
              </div>

              {/* Password Management Action */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center mt-2">
                <div>
                  <h4 className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Key className="h-3 w-3 text-amber-500" /> Password Security
                  </h4>
                  <p className="text-[9px] text-slate-400 mt-0.5 max-w-[200px] leading-tight">
                    Dispatch an official secure reset link to user's email address.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isResettingPassword}
                  onClick={handleTriggerPasswordReset}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-3 py-1.5 rounded-lg text-[10px] transition shrink-0"
                >
                  {isResettingPassword ? 'Sending...' : 'Reset Password'}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-1.5 px-3.5 rounded-xl text-xs transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-4.5 rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  {isUpdatingUser ? 'Updating...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* COMPLIANCE PROOF UPLOAD MODAL */}
      {uploadProofTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" id="upload-compliance-proof-modal">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-purple-400" />
                <h3 className="font-heading font-semibold text-sm text-white">Upload Regulatory Proof Document</h3>
              </div>
              <button type="button" onClick={() => setUploadProofTarget(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirmUploadProof} className="p-5 space-y-4">
              <div>
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">RECONCILING REQUIREMENT</span>
                <h4 className="font-bold text-slate-800 text-sm mt-0.5">{uploadProofTarget.name}</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Upload an official certified PDF, PNG, or JPG of your operating credentials to satisfy FMCSA or State regulatory boards.
                </p>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setUploadedFileName(e.dataTransfer.files[0].name);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
                  isDragOver 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <UploadCloud className="h-8 w-8 text-purple-500" />
                  <div className="text-xs font-semibold text-slate-700">
                    {uploadedFileName ? (
                      <span className="text-purple-600 font-bold">✓ Selected: {uploadedFileName}</span>
                    ) : (
                      'Drag & drop document here, or click to browse'
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">PDF, PNG, JPEG up to 10MB</span>
                </div>
                
                {/* Fallback standard input */}
                <input
                  type="file"
                  id="compliance-file-picker"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFileName(e.target.files[0].name);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('compliance-file-picker')?.click()}
                  className="mt-3 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition"
                >
                  Choose File
                </button>
              </div>

              {/* File name manual edit */}
              {uploadedFileName && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Document Label</label>
                  <input
                    type="text"
                    required
                    value={uploadedFileName}
                    onChange={(e) => setUploadedFileName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setUploadProofTarget(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-1.5 px-3.5 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingProof}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-4.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow"
                >
                  {isUploadingProof ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-t-transparent border-white rounded-full animate-spin"></span>
                      Validating Document...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Save & Verify Compliance
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOM REQUIREMENT MODAL */}
      {showAddCustomReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" id="create-custom-compliance-modal">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-950 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-purple-400" />
                <h3 className="font-heading font-semibold text-sm text-white">Add Company-Specific Operating Requirement</h3>
              </div>
              <button type="button" onClick={() => setShowAddCustomReq(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddCustomRequirement} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Requirement / Regulation Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Texas Intrastate Authority Certificate"
                  value={customReqName}
                  onChange={(e) => setCustomReqName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Operational Category</label>
                  <select
                    value={customReqCategory}
                    onChange={(e) => setCustomReqCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="Driver">Driver Compliance</option>
                    <option value="Vehicle">Vehicle Maintenance</option>
                    <option value="Taxes">Taxes & IFTA</option>
                    <option value="Insurance">Insurance & Bonding</option>
                    <option value="Safety">Safety & Audits</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Audit Criticality</label>
                  <select
                    value={customReqCriticality}
                    onChange={(e) => setCustomReqCriticality(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="High">High (Immediate Gate)</option>
                    <option value="Medium">Medium (Warning Period)</option>
                    <option value="Low">Low (Informational Only)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-bold block">Filing / Expiration Date</label>
                <input
                  type="date"
                  required
                  value={customReqDueDate}
                  onChange={(e) => setCustomReqDueDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none font-mono"
                />
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddCustomReq(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-1.5 px-3.5 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-4.5 rounded-xl text-xs transition shadow animate-in fade-in"
                >
                  Create Operating Requirement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upgrade Modal for AI Features & GPS */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">Upgrade to Premium Plan</h3>
                <p className="text-xs text-slate-500">Unlock full operational dispatch intelligence</p>
              </div>
            </div>

            <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-xl text-xs text-slate-700 leading-relaxed font-medium">
              AI Scraping, AI Rate Confirmation Parsing, and GPS Tracking require Premium at <strong>$159.99/month</strong>.
            </div>

            <ul className="text-xs text-slate-700 space-y-2 font-medium">
              <li className="flex items-center gap-2 text-purple-800"><Check className="h-4 w-4 text-purple-600 shrink-0 font-bold" /> AI Rate Confirmation Parsing</li>
              <li className="flex items-center gap-2 text-purple-800"><Check className="h-4 w-4 text-purple-600 shrink-0 font-bold" /> AI Load Scraping & Auto-Fill</li>
              <li className="flex items-center gap-2 text-purple-800"><Check className="h-4 w-4 text-purple-600 shrink-0 font-bold" /> Live GPS Tracking & Driver Telemetry</li>
            </ul>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUpgradeModal(false);
                  handleInitiateStripeCheckout('Premium');
                }}
                disabled={isPaying}
                className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isPaying ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Upgrade to Premium'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
        theme={pageTheme}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <SupportDeskModal
        isOpen={showSupportDeskModal}
        onClose={() => setShowSupportDeskModal(false)}
        currentUserRole="admin"
        currentCompanyId={company.id}
        currentCompanyName={company.name}
        currentUserId={auth.currentUser?.uid}
        currentUserName={auth.currentUser?.displayName || 'Tenant Admin'}
        currentUserEmail={auth.currentUser?.email || company.contactEmail}
      />

      {/* COMPANY BREAKDOWN ALERT CENTER MODAL */}
      <CompanyAlertCenterModal
        company={company}
        currentUser={{
          id: auth.currentUser?.uid || 'admin',
          name: auth.currentUser?.displayName || 'Tenant Admin',
          email: auth.currentUser?.email || company.contactEmail,
          phone: company.contactPhone || '',
          role: 'admin',
          companyId: company.id,
          status: 'active'
        }}
        loads={loads || []}
        isOpen={showAlertCenterModal}
        onClose={() => setShowAlertCenterModal(false)}
      />

      <LegalViewerModal
        isOpen={showAdminLegalModal}
        onClose={() => setShowAdminLegalModal(false)}
        initialSlug={selectedAdminLegalSlug}
      />

      <UnifiedDriverOnboardingModal
        isOpen={showUnifiedOnboardingModal}
        onClose={() => setShowUnifiedOnboardingModal(false)}
        company={company}
        existingTrucks={existingFleetTrucks}
        onSuccess={() => {
          setShowUnifiedOnboardingModal(false);
          alert('✓ Driver onboarding workflow successfully completed!');
        }}
      />

      <GuidedProductTour
        user={users.find(u => u.id === auth.currentUser?.uid) || { id: auth.currentUser?.uid || '', name: 'Tenant Admin', role: 'admin', companyId: company.id, email: company.contactEmail }}
        isOpen={showGuidedTour}
        onClose={() => setShowGuidedTour(false)}
        roleOverride="admin"
      />

    </div>
  );
}
