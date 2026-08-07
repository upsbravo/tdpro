export type UserRole = 'super_admin' | 'admin' | 'dispatcher' | 'driver';

export interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  themeColor?: string;
  dotNumber: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  status: 'pending' | 'active' | 'deactivation_pending' | 'deactivated' | 'suspended';
  deactivatedAt?: string;
  deactivatedByUid?: string;
  deactivationReason?: string;
  reactivatedAt?: string;
  reactivatedByUid?: string;
  plan: 'Basic' | 'Premium';
  subscriptionStatus?: string;
  paymentStatus?: string;
  trialEnabled?: boolean;
  offerTrial?: boolean;
  trialStart?: string;
  trialEnd?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId: string;
  joinedDate: string;
  onboardingEmailsSent?: number;
  lastOnboardingEmailSent?: string;
  legalAcceptedAt?: string;
  legalSignedBy?: string;
  viewedAt?: string;
  registeredAt?: string;
  invitationHistory?: { sentAt: string; sentBy: string; email: string }[];
  gpsTrackingEnabled?: boolean;
  smsNotificationsEnabled?: boolean;
}

export type DispatcherPresetName = 'standard' | 'senior' | 'accounting' | 'readonly' | 'custom';

export interface DispatcherPermissions {
  preset?: DispatcherPresetName;
  loads?: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    assignDriver?: boolean;
    updateStatus?: boolean;
    uploadDocuments?: boolean;
    useAIParser?: boolean;
  };
  drivers?: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    deactivate?: boolean;
    viewDocuments?: boolean;
    onboardWizard?: boolean;
  };
  accounting?: {
    view?: boolean;
    calculateSettlement?: boolean;
    createDraftSettlement?: boolean;
    reviewSettlement?: boolean;
    approveSettlement?: boolean;
    lockSettlement?: boolean;
    downloadStatementPdf?: boolean;
    emailStatement?: boolean;
    manageCompensationProfiles?: boolean;
  };
  fuel?: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    importCsv?: boolean;
    manageAdvances?: boolean;
    applyDeductions?: boolean;
    manageFuelCards?: boolean;
    assignFuelCards?: boolean;
    editFuelCardAssignments?: boolean;
    backfillFuelAssignments?: boolean;
    overrideAssignmentConflict?: boolean;
  };
  ifta?: {
    view?: boolean;
    recalculateDraftQuarter?: boolean;
    requestAmendment?: boolean;
    approveQuarter?: boolean;
  };
  invoices?: {
    view?: boolean;
    create?: boolean;
    editDraft?: boolean;
    send?: boolean;
    syncQuickBooks?: boolean;
  };
  integrations?: {
    viewQuickBooksStatus?: boolean;
    syncApprovedRecords?: boolean;
    retryFailedSync?: boolean;
    connectDisconnect?: boolean;
  };
  reports?: {
    viewDispatchReports?: boolean;
    viewRevenueReports?: boolean;
    viewSettlementReports?: boolean;
    exportReports?: boolean;
  };
  support?: {
    createTicket?: boolean;
    replyTicket?: boolean;
    viewCompanyTickets?: boolean;
  };
  compliance?: {
    view?: boolean;
    upload?: boolean;
    approve?: boolean;
    requestDocuments?: boolean;
    downloadAuditPacket?: boolean;
    manageTemplates?: boolean;
  };
  fleet?: {
    view?: boolean;
    viewFleet?: boolean;
    createTruck?: boolean;
    editTruck?: boolean;
    createTrailer?: boolean;
    viewAssignments?: boolean;
    assignDriver?: boolean;
    assignDriverToVehicle?: boolean;
    endAssignment?: boolean;
    overrideAssignmentConflict?: boolean;
    changeOperationalStatus?: boolean;
    manageMaintenance?: boolean;
    uploadDocuments?: boolean;
    viewFuelPerformance?: boolean;
    viewCompliance?: boolean;
    exportFleetReport?: boolean;
    logOdometer?: boolean;
  };
  // Legacy flat fields for backwards compatibility
  createLoads?: boolean;
  assignDrivers?: boolean;
  createDrivers?: boolean;
  updateDriverOperationalInfo?: boolean;
  loadChat?: boolean;
  gpsTracking?: boolean;
  rateConfirmations?: boolean;
  viewCompanyProfile?: boolean;
  legalWaiverRecords?: boolean;
}

export const PRESET_STANDARD_DISPATCHER: Required<Omit<DispatcherPermissions, 'createLoads'|'assignDrivers'|'createDrivers'|'updateDriverOperationalInfo'|'loadChat'|'gpsTracking'|'rateConfirmations'|'viewCompanyProfile'|'legalWaiverRecords'>> = {
  preset: 'standard',
  loads: { view: true, create: true, edit: true, assignDriver: true, updateStatus: true, uploadDocuments: true, useAIParser: false },
  drivers: { view: true, create: false, edit: false, deactivate: false, viewDocuments: false, onboardWizard: false },
  accounting: { view: false, calculateSettlement: false, createDraftSettlement: false, reviewSettlement: false, approveSettlement: false, lockSettlement: false, downloadStatementPdf: false, emailStatement: false, manageCompensationProfiles: false },
  fuel: { view: false, create: false, edit: false, importCsv: false, manageAdvances: false, applyDeductions: false, manageFuelCards: false, assignFuelCards: false, editFuelCardAssignments: false, backfillFuelAssignments: false, overrideAssignmentConflict: false },
  ifta: { view: true, recalculateDraftQuarter: false, requestAmendment: false, approveQuarter: false },
  invoices: { view: false, create: false, editDraft: false, send: false, syncQuickBooks: false },
  integrations: { viewQuickBooksStatus: false, syncApprovedRecords: false, retryFailedSync: false, connectDisconnect: false },
  reports: { viewDispatchReports: true, viewRevenueReports: false, viewSettlementReports: false, exportReports: false },
  support: { createTicket: true, replyTicket: true, viewCompanyTickets: false },
  compliance: { view: true, upload: true, approve: false, requestDocuments: true, downloadAuditPacket: false, manageTemplates: false },
  fleet: { view: true, viewFleet: true, createTruck: true, editTruck: true, createTrailer: true, viewAssignments: true, assignDriver: true, assignDriverToVehicle: true, endAssignment: true, overrideAssignmentConflict: false, changeOperationalStatus: true, manageMaintenance: true, uploadDocuments: true, viewFuelPerformance: true, viewCompliance: true, exportFleetReport: false, logOdometer: true },
};

export const PRESET_SENIOR_DISPATCHER: typeof PRESET_STANDARD_DISPATCHER = {
  preset: 'senior',
  loads: { view: true, create: true, edit: true, assignDriver: true, updateStatus: true, uploadDocuments: true, useAIParser: true },
  drivers: { view: true, create: true, edit: true, deactivate: false, viewDocuments: false, onboardWizard: true },
  accounting: { view: false, calculateSettlement: false, createDraftSettlement: false, reviewSettlement: false, approveSettlement: false, lockSettlement: false, downloadStatementPdf: false, emailStatement: false, manageCompensationProfiles: false },
  fuel: { view: true, create: false, edit: false, importCsv: false, manageAdvances: false, applyDeductions: false, manageFuelCards: true, assignFuelCards: true, editFuelCardAssignments: true, backfillFuelAssignments: true, overrideAssignmentConflict: false },
  ifta: { view: true, recalculateDraftQuarter: true, requestAmendment: true, approveQuarter: false },
  invoices: { view: false, create: false, editDraft: false, send: false, syncQuickBooks: false },
  integrations: { viewQuickBooksStatus: false, syncApprovedRecords: false, retryFailedSync: false, connectDisconnect: false },
  reports: { viewDispatchReports: true, viewRevenueReports: false, viewSettlementReports: false, exportReports: false },
  support: { createTicket: true, replyTicket: true, viewCompanyTickets: true },
  compliance: { view: true, upload: true, approve: true, requestDocuments: true, downloadAuditPacket: true, manageTemplates: false },
  fleet: { view: true, viewFleet: true, createTruck: true, editTruck: true, viewAssignments: true, assignDriver: true, assignDriverToVehicle: true, endAssignment: true, overrideAssignmentConflict: false, changeOperationalStatus: true, manageMaintenance: true, uploadDocuments: true, viewFuelPerformance: true, viewCompliance: true, exportFleetReport: true, createTrailer: true, logOdometer: true },
};

export const PRESET_ACCOUNTING_DISPATCHER: typeof PRESET_STANDARD_DISPATCHER = {
  preset: 'accounting',
  loads: { view: true, create: false, edit: false, assignDriver: false, updateStatus: false, uploadDocuments: false, useAIParser: false },
  drivers: { view: true, create: false, edit: false, deactivate: false, viewDocuments: false, onboardWizard: false },
  accounting: { view: true, calculateSettlement: true, createDraftSettlement: true, reviewSettlement: true, approveSettlement: false, lockSettlement: false, downloadStatementPdf: true, emailStatement: true, manageCompensationProfiles: true },
  fuel: { view: true, create: true, edit: false, importCsv: false, manageAdvances: true, applyDeductions: true, manageFuelCards: true, assignFuelCards: true, editFuelCardAssignments: true, backfillFuelAssignments: true, overrideAssignmentConflict: true },
  ifta: { view: true, recalculateDraftQuarter: true, requestAmendment: true, approveQuarter: true },
  invoices: { view: true, create: true, editDraft: true, send: false, syncQuickBooks: false },
  integrations: { viewQuickBooksStatus: true, syncApprovedRecords: true, retryFailedSync: true, connectDisconnect: false },
  reports: { viewDispatchReports: true, viewRevenueReports: true, viewSettlementReports: true, exportReports: false },
  support: { createTicket: true, replyTicket: true, viewCompanyTickets: false },
  compliance: { view: true, upload: true, approve: false, requestDocuments: true, downloadAuditPacket: true, manageTemplates: false },
  fleet: { view: true, viewFleet: true, createTruck: false, editTruck: false, viewAssignments: true, assignDriver: false, assignDriverToVehicle: false, endAssignment: false, overrideAssignmentConflict: false, changeOperationalStatus: false, manageMaintenance: false, uploadDocuments: true, viewFuelPerformance: true, viewCompliance: true, exportFleetReport: true, createTrailer: false, logOdometer: false },
};

export const PRESET_READONLY_DISPATCHER: typeof PRESET_STANDARD_DISPATCHER = {
  preset: 'readonly',
  loads: { view: true, create: false, edit: false, assignDriver: false, updateStatus: false, uploadDocuments: false, useAIParser: false },
  drivers: { view: true, create: false, edit: false, deactivate: false, viewDocuments: false, onboardWizard: false },
  accounting: { view: false, calculateSettlement: false, createDraftSettlement: false, reviewSettlement: false, approveSettlement: false, lockSettlement: false, downloadStatementPdf: false, emailStatement: false, manageCompensationProfiles: false },
  fuel: { view: false, create: false, edit: false, importCsv: false, manageAdvances: false, applyDeductions: false, manageFuelCards: false, assignFuelCards: false, editFuelCardAssignments: false, backfillFuelAssignments: false, overrideAssignmentConflict: false },
  ifta: { view: true, recalculateDraftQuarter: false, requestAmendment: false, approveQuarter: false },
  invoices: { view: false, create: false, editDraft: false, send: false, syncQuickBooks: false },
  integrations: { viewQuickBooksStatus: false, syncApprovedRecords: false, retryFailedSync: false, connectDisconnect: false },
  reports: { viewDispatchReports: false, viewRevenueReports: false, viewSettlementReports: false, exportReports: false },
  support: { createTicket: true, replyTicket: false, viewCompanyTickets: false },
  compliance: { view: false, upload: false, approve: false, requestDocuments: false, downloadAuditPacket: false, manageTemplates: false },
  fleet: { view: true, viewFleet: true, createTruck: false, editTruck: false, viewAssignments: true, assignDriver: false, assignDriverToVehicle: false, endAssignment: false, overrideAssignmentConflict: false, changeOperationalStatus: false, manageMaintenance: false, uploadDocuments: false, viewFuelPerformance: false, viewCompliance: false, exportFleetReport: false, createTrailer: false, logOdometer: false },
};

export function getDispatcherPermissions(user: Partial<User> | null | undefined): Required<Omit<DispatcherPermissions, 'createLoads'|'assignDrivers'|'createDrivers'|'updateDriverOperationalInfo'|'loadChat'|'gpsTracking'|'rateConfirmations'|'viewCompanyProfile'|'legalWaiverRecords'>> {
  if (!user) return PRESET_STANDARD_DISPATCHER;

  if (user.role === 'admin' || user.role === 'super_admin') {
    return {
      preset: 'custom',
      loads: { view: true, create: true, edit: true, assignDriver: true, updateStatus: true, uploadDocuments: true, useAIParser: true },
      drivers: { view: true, create: true, edit: true, deactivate: true, viewDocuments: true, onboardWizard: true },
      accounting: { view: true, calculateSettlement: true, createDraftSettlement: true, reviewSettlement: true, approveSettlement: true, lockSettlement: true, downloadStatementPdf: true, emailStatement: true, manageCompensationProfiles: true },
      fuel: { view: true, create: true, edit: true, importCsv: true, manageAdvances: true, applyDeductions: true, manageFuelCards: true, assignFuelCards: true, editFuelCardAssignments: true, backfillFuelAssignments: true, overrideAssignmentConflict: true },
      ifta: { view: true, recalculateDraftQuarter: true, requestAmendment: true, approveQuarter: true },
      invoices: { view: true, create: true, editDraft: true, send: true, syncQuickBooks: true },
      integrations: { viewQuickBooksStatus: true, syncApprovedRecords: true, retryFailedSync: true, connectDisconnect: true },
      reports: { viewDispatchReports: true, viewRevenueReports: true, viewSettlementReports: true, exportReports: true },
      support: { createTicket: true, replyTicket: true, viewCompanyTickets: true },
      compliance: { view: true, upload: true, approve: true, requestDocuments: true, downloadAuditPacket: true, manageTemplates: true },
      fleet: { view: true, viewFleet: true, createTruck: true, editTruck: true, viewAssignments: true, assignDriver: true, assignDriverToVehicle: true, endAssignment: true, overrideAssignmentConflict: true, changeOperationalStatus: true, manageMaintenance: true, uploadDocuments: true, viewFuelPerformance: true, viewCompliance: true, exportFleetReport: true, createTrailer: true, logOdometer: true },
    };
  }

  if (user.role === 'driver') {
    return PRESET_READONLY_DISPATCHER;
  }

  const raw = (user as any).permissions || user.dispatcherPermissions;
  if (!raw) return PRESET_STANDARD_DISPATCHER;

  const def = PRESET_STANDARD_DISPATCHER;

  // Handle legacy flat format if raw doesn't have category objects
  const loadsObj = raw.loads || {
    view: true,
    create: raw.createLoads !== undefined ? raw.createLoads : def.loads.create,
    edit: raw.createLoads !== undefined ? raw.createLoads : def.loads.edit,
    assignDriver: raw.assignDrivers !== undefined ? raw.assignDrivers : def.loads.assignDriver,
    updateStatus: true,
    uploadDocuments: true,
    useAIParser: false,
  };

  const driversObj = raw.drivers || {
    view: true,
    create: raw.createDrivers !== undefined ? raw.createDrivers : def.drivers.create,
    edit: raw.updateDriverOperationalInfo !== undefined ? raw.updateDriverOperationalInfo : def.drivers.edit,
    deactivate: false,
    viewDocuments: false,
    onboardWizard: raw.onboardWizard !== undefined ? raw.onboardWizard : (raw.createDrivers !== undefined ? raw.createDrivers : def.drivers.onboardWizard),
  };

  return {
    preset: raw.preset || 'custom',
    loads: { ...def.loads, ...loadsObj },
    drivers: { ...def.drivers, ...driversObj, onboardWizard: driversObj.onboardWizard !== undefined ? driversObj.onboardWizard : driversObj.create },
    accounting: { ...def.accounting, ...(raw.accounting || {}) },
    fuel: { ...def.fuel, ...(raw.fuel || {}) },
    ifta: { ...def.ifta, ...(raw.ifta || {}) },
    invoices: { ...def.invoices, ...(raw.invoices || {}) },
    integrations: { ...def.integrations, ...(raw.integrations || {}) },
    reports: { ...def.reports, ...(raw.reports || {}) },
    support: { ...def.support, ...(raw.support || {}) },
    compliance: { ...def.compliance, ...(raw.compliance || {}) },
    fleet: { ...def.fleet, ...(raw.fleet || {}) },
  };
}

export function hasDispatcherPermission(
  user: Partial<User> | null | undefined,
  category: keyof Omit<DispatcherPermissions, 'preset' | 'createLoads' | 'assignDrivers' | 'createDrivers' | 'updateDriverOperationalInfo' | 'loadChat' | 'gpsTracking' | 'rateConfirmations' | 'viewCompanyProfile' | 'legalWaiverRecords'>,
  action: string
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (user.role !== 'dispatcher') return false;

  const perms = getDispatcherPermissions(user);
  const catObj = (perms as any)[category];
  if (!catObj) return false;
  if (catObj[action] !== undefined) return Boolean(catObj[action]);
  // Fallback if action is onboardWizard and not set, check create
  if (category === 'drivers' && action === 'onboardWizard') {
    return Boolean(catObj['create']);
  }
  return false;
}

export interface RoleTourStatus {
  version: string;
  completed: boolean;
  skipped: boolean;
  completedAt?: string;
  skippedAt?: string;
}

export type UserTourStatus = {
  [role in UserRole]?: RoleTourStatus;
};

export type DriverOnboardingStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'completed';
export type DriverLifecycleStatus = 'onboarding' | 'active' | 'inactive' | 'suspended' | 'terminated' | 'archived';
export type DriverAccessStatus = 'pending' | 'active' | 'suspended' | 'revoked';
export type DriverActivationStatus = 'not_invited' | 'invitation_sent' | 'invitation_accepted' | 'activated' | 'activation_failed';
export type DriverEmploymentStatus = 'pending' | 'active' | 'leave' | 'terminated';

export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: UserRole;
  companyId?: string; // empty for super_admin
  status: 'active' | 'inactive' | 'pending' | 'invited' | 'suspended' | 'onboarding' | 'terminated' | 'archived' | string;
  lifecycleStatus?: DriverLifecycleStatus | string;
  onboardingStatus?: DriverOnboardingStatus | string;
  accessStatus?: DriverAccessStatus | string;
  activationStatus?: DriverActivationStatus | string;
  employmentStatus?: DriverEmploymentStatus | string;
  isActive?: boolean;
  accessDisabledReason?: 'tenant_deactivated' | 'user_deactivated' | 'security_hold' | 'billing_suspension' | null;
  accessDisabledAt?: string;
  accessDisabledByUid?: string;
  phone: string;
  licenseNumber?: string; // for drivers
  truckNumber?: string; // for drivers (legacy string)
  assignedTruck?: string; // for drivers
  currentTruckId?: string; // Centralized truck reference
  currentTruckNumber?: string; // Denormalized cache
  currentTruckAssignmentId?: string; // Active assignment ledger ID
  currentTruckAssignedAt?: string; // Active assignment start timestamp
  ownerOperatorCompanyId?: string | null;
  ownerOperatorName?: string; // for drivers (Owner operator name / Driver company name)
  dutyStatus?: 'On Duty' | 'Off Duty' | 'On Break';
  manualLocationEnabled?: boolean;
  manualCity?: string;
  manualState?: string;
  manualDateTime?: string;
  manualNotes?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  driverTermsAcceptedAt?: string;
  gpsConsentAcceptedAt?: string;
  smsConsentAcceptedAt?: string;
  legalAcceptedAt?: string;
  tourStatus?: UserTourStatus;
  dispatcherPermissions?: DispatcherPermissions;
  notificationPreferences?: {
    emailAlerts?: boolean;
    smsAlerts?: boolean;
    loadAssignmentAlerts?: boolean;
    loadStatusAlerts?: boolean;
    urgentAlerts?: boolean;
  };
  multiLoadEnabled?: boolean;
  maximumOpenLoads?: number;
  multiLoadEnabledAt?: string;
  multiLoadEnabledByUid?: string;
  notes?: string;
}

export interface FailedUserDeactivation {
  uid: string;
  safeErrorCode: string;
}

export interface ReconciliationResult {
  companyId: string;
  totalUsers: number;
  membershipsSuspended: number;
  authUsersDisabled: number;
  refreshTokensRevoked: number;
  failedUsers: FailedUserDeactivation[];
  status: 'completed' | 'partial_failure' | 'failed';
  message?: string;
}

export interface AuditLogEntry {
  id: string;
  companyId: string;
  action: string;
  targetUid?: string;
  performedByUid: string;
  reason?: string;
  previousStatus?: string;
  newStatus?: string;
  operationId?: string;
  safeErrorCode?: string;
  createdAt: string;
}

export interface DispatchNotificationLog {
  id: string;
  driverId?: string;
  driverName?: string;
  driverEmail?: string;
  driverPhone?: string;
  loadNumber?: string;
  title: string;
  message: string;
  type: 'assignment' | 'status_update' | 'load_update' | 'urgent' | 'test';
  channels: ('email' | 'sms' | 'in_app')[];
  status: 'dispatched' | 'pending' | 'failed';
  companyId?: string;
  timestamp: string;
}

export interface Stop {
  facilityName: string;
  address: string;
  dateTime: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
  referenceNumber?: string;
  specialInstructions?: string;
}

export type LoadStatus = 'booked' | 'dispatched' | 'in_transit' | 'delivered' | 'canceled';

export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Load {
  id: string;
  loadNumber: string;
  companyId: string;
  companyName?: string;
  carrierName?: string;
  temperature?: string;
  assignedDriverId?: string;
  assignedDispatcherId?: string;
  assignedTruckId?: string | null;
  assignedTruckNumber?: string | null;
  status: LoadStatus;
  cargoType: string;
  weight: number; // in lbs
  value: number; // cargo value
  rate: number; // payment rate
  urgent: boolean;
  notes?: string;
  pickup: Stop;
  delivery: Stop;
  currentGps?: GpsPoint;
  gpsHistory: GpsPoint[];
  gpsConsentAccepted: boolean;
  gpsTrackingRequired?: boolean;
  gpsTrackingRequestedBy?: string | null;
  gpsConsentAcceptedBy?: string | null;
  gpsConsentAcceptedAt?: string | null;
  podUrl?: string;
  podUploadedAt?: string;
  podFileName?: string;
  flagged?: boolean;
  pickups?: Stop[];
  deliveries?: Stop[];
  podStatus?: 'pending' | 'uploaded' | 'approved' | 'rejected';
  rcNumber?: string;
  dispatchedBy?: string;
  internalNotes?: string;
  attachments?: { name: string; url: string; }[];
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  createdAt?: string;
  criticalAlertActive?: boolean;
  criticalAlertId?: string;
  criticalAlertType?: string;
  criticalAlertStatus?: DriverAlertStatus;
  criticalAlertCreatedAt?: string;
  criticalAlertDriverId?: string;
  criticalAlertDriverName?: string;
  driverAcceptanceStatus?: 'pending' | 'accepted' | 'declined';
  pmWarningAcknowledged?: boolean;
  pmWarningAcknowledgedBy?: string | null;
  pmWarningAcknowledgedAt?: string | null;
  pmWarningTruckNumber?: string | null;
  pmWarningMilesOverdue?: number | null;
  driverAcceptedAt?: string;
  driverDeclinedAt?: string;
  driverDeclineReason?: string;
}

export interface Message {
  id: string;
  loadId?: string; // empty for general channel
  channel: 'load' | 'general';
  companyId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  timestamp: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  amount: number;
  date: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid';
  isManual: boolean;
  description: string;
  pdfUrl?: string;
  hostedInvoiceUrl?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  timestamp: string;
  read: boolean;
  forRole: UserRole | 'all';
  forCompanyId?: string;
  ticketId?: string;
}

export type SupportTicketStatus = 'open' | 'in_progress' | 'awaiting_customer' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketCategory = 
  | 'Login / Access'
  | 'Billing / Subscription'
  | 'Driver Issue'
  | 'Dispatcher Issue'
  | 'Load Issue'
  | 'GPS / Tracking'
  | 'AI Parser / Rate Confirmation'
  | 'SMS / Email Notifications'
  | 'Bug / Error'
  | 'Other';

export interface SupportTicket {
  id: string;
  companyId: string;
  companyName: string;
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedTo?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
}

export type SupportMessageType = 'user' | 'super_admin' | 'ai_auto_reply' | 'system';

export interface SupportMessage {
  id: string;
  ticketId: string;
  companyId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  type: SupportMessageType;
  createdAt: string;
}

export type DriverAlertStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'false_alarm';

export type DriverAlertType = 
  | 'Truck Breakdown'
  | 'Tire Blowout'
  | 'Accident'
  | 'Stuck / Roadside Issue'
  | 'Medical / Safety Emergency'
  | 'Other';

export interface DriverAlertLocation {
  lat?: number;
  lng?: number;
  accuracy?: number;
  capturedAt?: string;
  address?: string;
}

export interface DriverAlert {
  id: string;
  companyId: string;
  loadId?: string | null;
  driverId: string;
  driverName: string;
  driverPhone?: string;
  truckNumber?: string;
  alertType: DriverAlertType | string;
  description: string;
  status: DriverAlertStatus;
  priority: 'critical' | 'high' | 'normal';
  severity: 'red' | 'amber' | 'green';
  location?: DriverAlertLocation;
  createdByUid: string;
  createdByRole: UserRole;
  acknowledgedBy?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export interface DriverAlertMessage {
  id: string;
  companyId: string;
  alertId: string;
  loadId?: string | null;
  senderId: string;
  senderName: string;
  senderRole: UserRole | 'system';
  message: string;
  type: 'driver_update' | 'dispatcher_update' | 'admin_update' | 'system';
  createdAt: string;
}

// Master Announcement Banner Types
export type AnnouncementType = 'system_issue' | 'maintenance' | 'feature_update' | 'billing_notice' | 'general';
export type AnnouncementSeverity = 'info' | 'warning' | 'critical' | 'success';
export type AnnouncementAudience = 'all_except_drivers' | 'admins_only' | 'dispatchers_and_admins';

export interface SystemAnnouncement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  severity: AnnouncementSeverity;
  isActive: boolean;
  audience: AnnouncementAudience;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  dismissedBy?: string[];
}

// System Status / Health Center Types
export type HealthStatusValue = 'operational' | 'degraded' | 'partial_outage' | 'outage' | 'maintenance';

export interface SystemStatus {
  overallStatus: HealthStatusValue;
  backendApi: HealthStatusValue;
  firebaseAuth: HealthStatusValue;
  firestore: HealthStatusValue;
  stripeBilling: HealthStatusValue;
  aiParser: HealthStatusValue;
  aiScraping: HealthStatusValue;
  gpsTracking: HealthStatusValue;
  smsNotifications: HealthStatusValue;
  emailNotifications: HealthStatusValue;
  dispatchModule: HealthStatusValue;
  driverPortal: HealthStatusValue;
  adminPortal: HealthStatusValue;
  lastCheckedAt?: string;
  updatedByUid?: string;
  updatedByName?: string;
  updatedAt?: string;
  statusMessage?: string;
}

// ==========================================
// ACCOUNTING & SETTLEMENTS TYPES
// ==========================================

export type WorkerType = 'company_driver' | 'owner_operator' | 'contractor';

export type PayMethod =
  | 'per_mile'
  | 'per_load'
  | 'percentage_of_gross'
  | 'percentage_of_linehaul'
  | 'hourly'
  | 'salary'
  | 'custom_combination';

export type SettlementFrequency =
  | 'per_load'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

export interface CompensationProfile {
  id: string;
  companyId: string;
  driverId: string;
  workerType: WorkerType;
  payMethod: PayMethod;
  settlementFrequency: SettlementFrequency;

  loadedMileRateCents?: number | null;
  emptyMileRateCents?: number | null;
  flatPerLoadCents?: number | null;
  hourlyRateCents?: number | null;
  salaryAmountCents?: number | null;
  ownerOperatorPercentageBasisPoints?: number | null;
  dispatchFeeBasisPoints?: number | null;

  stopPayCents?: number | null;
  detentionHourlyRateCents?: number | null;
  layoverDailyRateCents?: number | null;

  defaultInsuranceDeductionCents?: number | null;
  defaultTrailerRentCents?: number | null;
  defaultEscrowDeductionCents?: number | null;
  defaultMaintenanceDeductionCents?: number | null;

  deductActualFuel?: boolean;
  deductAdvances?: boolean;
  deductTolls?: boolean;
  deductChargebacks?: boolean;

  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  setupComplete: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedByUid: string;
}

export type AdvanceType = 'cash' | 'check' | 'fuel' | 'maintenance' | 'other';
export type AdvanceDeductionMethod = 'full_next_settlement' | 'fixed_per_settlement' | 'percentage_per_settlement' | 'manual_schedule';
export type AdvanceStatus = 'open' | 'partially_repaid' | 'repaid' | 'void';

export interface Advance {
  id: string;
  companyId: string;
  driverId: string;
  ownerOperatorId?: string | null;
  loadId?: string | null;
  type: AdvanceType;
  originalAmountCents: number;
  deductedAmountCents: number;
  remainingBalanceCents: number;
  deductionMethod: AdvanceDeductionMethod;
  fixedDeductionCents?: number | null;
  percentageBasisPoints?: number | null;
  notes?: string | null;
  memo?: string | null;
  checkNumber?: string | null;
  comcheckNumber?: string | null;
  referenceNumber?: string | null;
  status: AdvanceStatus;
  issuedAt: string;
  createdByUid: string;
  updatedAt?: string;
}

export type FuelSourceType = 'manual' | 'csv' | 'fleetio' | 'wex' | 'efs' | 'comdata' | 'quickbooks';
export type FuelAllocationMethod = 'direct_load' | 'settlement_period' | 'mileage_allocation' | 'manual';

export interface FuelEntry {
  id: string;
  companyId: string;
  loadId?: string | null;
  driverId?: string | null;
  truckId?: string | null;
  settlementPeriodId?: string | null;
  providerTransactionId?: string | null;
  fuelDate?: string;
  transactionDate?: string;
  merchant?: string;
  fuelVendor?: string;
  fuelLocation?: string;
  city?: string;
  state: string;
  gallons?: number;
  gallonsDecimal?: number;
  pricePerGallonCents: number;
  totalAmountCents: number;
  odometer?: number | null;
  receiptUrl?: string | null;
  fuelCardProvider?: string | null;
  source: FuelSourceType;
  allocationMethod?: FuelAllocationMethod;
  allocationStatus?: 'unallocated' | 'allocated' | 'void';
  createdAt: string;
  updatedAt: string;
}

export type FuelCardProvider = 'fleet_one' | 'efs' | 'wex' | 'comdata' | 'fleetio' | 'manual' | 'other';
export type FuelCardAllowedProduct = 'diesel' | 'def' | 'reefer_fuel' | 'gasoline' | 'oil' | 'fee' | 'other';
export type FuelCardStatus = 'active' | 'inactive' | 'lost' | 'replaced';

export interface FuelCard {
  id: string;
  companyId: string;
  provider: FuelCardProvider;
  cardNumberMasked: string;
  cardNumberLast4: string;
  externalCardId?: string;
  assignedTruckId?: string | null;
  assignedDriverId?: string | null;
  assignedOwnerOperatorCompanyId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  allowedProducts: FuelCardAllowedProduct[];
  status: FuelCardStatus;
  createdAt: string;
  updatedAt: string;
  updatedByUid: string;
}

export interface FuelCardAssignment {
  id: string;
  companyId: string;
  fuelCardId: string;
  provider: FuelCardProvider | string;
  externalCardId?: string;
  cardNumberMasked?: string;
  cardNumberLast4?: string;
  assignedTruckId?: string | null;
  assignedTruckNumberSnapshot?: string | null;
  assignedDriverId?: string | null;
  assignedDriverNameSnapshot?: string | null;
  ownerOperatorCompanyId?: string | null;
  ownerOperatorCompanyNameSnapshot?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  assignmentSource: 'manual' | 'import' | 'migration' | 'integration';
  reason?: string;
  notes?: string;
  assignedByUid?: string;
  assignedAt?: string;
  endedByUid?: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type FuelImportSource = 'csv' | 'xlsx' | 'pdf' | 'api' | 'sftp' | 'fleetio';
export type FuelImportBatchStatus = 'uploaded' | 'parsing' | 'parsed' | 'needs_review' | 'pending_review' | 'approved' | 'rejected' | 'deleted' | 'failed';

export interface FuelImportBatch {
  id: string;
  companyId: string;
  provider: string;
  originalFileName?: string;
  fileBase64?: string | null;
  fileMimeType?: string | null;
  source: FuelImportSource;
  periodStart?: string;
  periodEnd?: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  needsReviewRows: number;
  totalTransactionAmountCents: number;
  totalDieselGallonsDecimal?: number;
  totalDefGallonsDecimal?: number;
  totalReeferGallonsDecimal?: number;
  totalFeeAmountCents?: number;
  status: FuelImportBatchStatus;
  uploadedByUid: string;
  uploadedAt: string;
  approvedByUid?: string | null;
  approvedAt?: string | null;
  rejectedByUid?: string | null;
  rejectedAt?: string | null;
  deletedByUid?: string | null;
  deletedAt?: string | null;
  deletedReason?: string | null;
  errorSummary?: string | null;
}

export type FuelProductType = 'diesel' | 'def' | 'reefer_fuel' | 'gasoline' | 'oil' | 'fee' | 'scale_ticket' | 'truck_wash' | 'tolls' | 'parking' | 'supplies' | 'other';

export interface FuelProductLine {
  id: string;
  companyId: string;
  fuelTransactionId: string;
  providerLineId?: string;
  productCode?: string;
  productType: FuelProductType;
  gallonsDecimal: number;
  pricePerGallonCents: number;
  amountCents: number;
  taxPaid?: boolean;
  taxPaidAmountCents?: number;
  eligibleForTractorMpg?: boolean;
  eligibleForIfta?: boolean;
  eligibleForSettlementDeduction?: boolean;
  createdAt: string;
}

export type FuelMatchStatus = 'unmatched' | 'auto_matched' | 'manually_matched' | 'needs_review';
export type FuelAllocationStatus = 'unallocated' | 'partially_allocated' | 'fully_allocated';
export type FuelApprovalStatus = 'pending_review' | 'approved' | 'rejected' | 'reversed';
export type FuelSettlementStatus = 'not_deducted' | 'pending_deduction' | 'deducted' | 'settled' | 'reversed';

export interface FuelTransaction {
  id: string;
  companyId: string;
  importBatchId?: string | null;
  provider: string;
  providerTransactionId?: string | null;
  transactionFingerprint?: string;
  transactionDate: string;
  transactionTimestamp: string;
  cardNumberMasked?: string;
  cardNumberLast4?: string;
  externalCardId?: string;
  rawDriverName?: string;
  rawUnitNumber?: string;
  rawInvoiceNumber?: string;
  driverId?: string | null;
  truckId?: string | null;
  ownerOperatorCompanyId?: string | null;
  vendor?: string;
  locationName?: string;
  city?: string;
  state: string;
  jurisdictionCode?: string;
  postalCode?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  productType?: string;
  gallonsDecimal?: number;
  gallons?: number;
  pricePerGallonCents?: number;
  dieselGallonsDecimal?: number;
  dieselAmountCents?: number;
  reeferGallonsDecimal?: number;
  reeferAmountCents?: number;
  subtotalAmountCents?: number;
  feeAmountCents?: number;
  totalAmountCents: number;
  currency: 'USD';
  odometerDecimal?: number | null;
  matchStatus: FuelMatchStatus;
  matchConfidenceScore?: number;
  matchReasons?: string[];
  allocationStatus: FuelAllocationStatus;
  approvalStatus: FuelApprovalStatus;
  settlementStatus: FuelSettlementStatus;
  quickBooksSyncStatus?: string;
  iftaIncluded?: boolean;
  iftaEligibilityStatus?: 'eligible' | 'excluded' | 'needs_review' | 'rejected';
  iftaQuarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  iftaYear?: number;
  productLines?: FuelProductLine[];
  receiptUrl?: string | null;
  sourceFileUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  approvedByUid?: string | null;
}

export type FuelAllocationType = 'direct_load' | 'split_by_miles' | 'settlement_period' | 'truck_period' | 'manual' | 'unallocated';

export interface FuelAllocation {
  id: string;
  companyId: string;
  fuelTransactionId: string;
  allocationType: FuelAllocationType;
  loadId?: string | null;
  settlementId?: string | null;
  settlementPeriodId?: string | null;
  truckId?: string | null;
  driverId?: string | null;
  ownerOperatorCompanyId?: string | null;
  allocationPercentageBasisPoints: number;
  allocatedDieselGallonsDecimal?: number;
  allocatedDefGallonsDecimal?: number;
  allocatedReeferGallonsDecimal?: number;
  allocatedAmountCents: number;
  reason?: string;
  calculationMethod?: string;
  approvedByUid?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface FuelMatchException {
  id: string;
  companyId: string;
  fuelTransactionId: string;
  reason: string;
  evidence?: string;
  severity: 'info' | 'warning' | 'critical';
  confidence?: number;
  reviewStatus: 'needs_review' | 'resolved' | 'dismissed';
  reviewedByUid?: string;
  reviewNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface TripFuelStatement {
  id: string;
  statementId: string;
  companyId: string;
  statementNumber: string;
  poNumber?: string;
  statementVersion: number;
  tripId: string;
  tripNumber?: string;
  loadId?: string;
  loadNumber?: string;
  driverId?: string | null;
  driverNameSnapshot?: string;
  truckId?: string | null;
  truckNumberSnapshot?: string;
  ownerOperatorCompanyId?: string | null;
  ownerOperatorNameSnapshot?: string | null;
  status: 'draft' | 'approved' | 'locked' | 'disputed';
  transactionCount: number;
  dieselGallonsDecimal: number;
  dieselAmountCents: number;
  defGallonsDecimal: number;
  defAmountCents: number;
  reeferGallonsDecimal: number;
  reeferAmountCents: number;
  scaleTicketsCents?: number;
  truckWashCents?: number;
  otherExpensesCents?: number;
  driverReimbursementsCents?: number;
  otherProductAmountCents: number;
  feesCents: number;
  discountsCents: number;
  grossFuelCostCents: number;
  netFuelCostCents: number;
  companyExpenseCents: number;
  proposedDriverDeductionCents: number;
  proposedOwnerOperatorDeductionCents: number;
  generatedAt: string;
  generatedByUid?: string;
  approvedAt?: string | null;
  approvedByUid?: string | null;
  lockedAt?: string | null;
  lockedByUid?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FuelReceipt {
  id: string;
  receiptId: string;
  companyId: string;
  originalFileName: string;
  mimeType: string;
  uploadedByUid: string;
  uploadedByRole?: string;
  uploadedAt: string;
  driverId?: string | null;
  truckId?: string | null;
  loadId?: string | null;
  tripId?: string | null;
  fuelCardId?: string | null;
  merchant?: string;
  expenseCategory?: 'fuel' | 'scale_ticket' | 'truck_wash' | 'tolls' | 'parking' | 'supplies' | 'other';
  paymentMethod?: 'fuel_card' | 'driver_paid_reimbursement' | 'company_direct';
  ticketNumber?: string;
  notes?: string;
  amountCents?: number;
  gallonsDecimal?: number;
  transactionDate?: string;
  extractionStatus: 'not_started' | 'processing' | 'completed' | 'failed';
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewerNotes?: string;
  extractedFields?: any;
  fileData?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SettlementType = 'driver' | 'owner_operator' | 'owner_operator_company';

export interface OwnerOperatorCompany {
  id: string;
  companyId: string;
  legalName: string;
  dbaName?: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  taxIdLast4?: string;
  quickBooksVendorId?: string | null;

  settlementFrequency: 'per_load' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  defaultPayMethod: 'percentage_of_gross' | 'percentage_of_linehaul' | 'flat_per_load' | 'custom';
  defaultPayBasisPoints?: number;
  dispatchFeeBasisPoints?: number;

  deductFuel?: boolean;
  deductAdvances?: boolean;
  deductTolls?: boolean;
  deductInsurance?: boolean;
  deductTrailerRent?: boolean;
  deductMaintenance?: boolean;
  deductEscrow?: boolean;
  deductChargebacks?: boolean;

  defaultInsuranceDeductionCents?: number;
  defaultTrailerRentCents?: number;
  defaultEscrowDeductionCents?: number;
  defaultMaintenanceDeductionCents?: number;

  status: 'active' | 'inactive' | 'suspended';
  setupComplete?: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByUid?: string;
}

export type TruckVehicleType = 'tractor' | 'straight_truck' | 'box_truck' | 'other';
export type TruckOwnershipType = 'company_owned' | 'owner_operator' | 'leased' | 'rented';
export type TruckStatus = 'active' | 'maintenance' | 'out_of_service' | 'inactive' | 'sold';
export type TruckOperationalStatus = 'active' | 'available' | 'maintenance' | 'out_of_service' | 'inactive' | 'sold';
export type TruckComplianceStatus = 'compliant' | 'expiring_soon' | 'expired' | 'missing_proof' | 'pending_review';
export type TruckAssignmentStatus = 'assigned' | 'unassigned' | 'scheduled' | 'conflict';
export type TruckPmStatus = 'not_configured' | 'current' | 'approaching_due' | 'due' | 'overdue' | 'service_in_progress';
export type TruckPmDispatchPolicy = 'warning_only' | 'approval_required' | 'hard_block';
export type TruckOdometerSource = 'eld' | 'gps' | 'telematics' | 'maintenance_record' | 'load_completion' | 'manual';

export interface Truck {
  id: string;
  companyId: string;

  truckNumber: string;
  normalizedTruckNumber?: string;

  vin?: string;
  licensePlate?: string;
  licensePlateState?: string;

  make?: string;
  model?: string;
  makeModel?: string; // legacy support
  year?: string;

  vehicleType?: TruckVehicleType;
  ownershipType?: TruckOwnershipType;

  // Owner Operator Link
  ownerOperatorCompanyId?: string | null; // legacy
  currentOwnerOperatorCompanyId?: string | null;

  // Active Driver Link (Denormalized Cache)
  assignedDriverId?: string | null; // legacy
  currentDriverId?: string | null;
  currentDriverName?: string | null;

  settlementGroupId?: string | null;
  status?: TruckStatus;

  // Granular Fleet Operational & Compliance Statuses
  operationalStatus?: TruckOperationalStatus;
  complianceStatus?: TruckComplianceStatus;
  assignmentStatus?: TruckAssignmentStatus;

  // Centralized Odometer Tracking
  currentOdometerDecimal?: number;
  currentOdometerRecordedAt?: string;
  currentOdometerSource?: TruckOdometerSource;
  currentOdometerVerificationStatus?: 'verified' | 'estimated' | 'pending_review';
  currentOdometerUpdatedByUid?: string;

  // Preventive Maintenance (PM) Schedule
  nextPmDueOdometerDecimal?: number;
  pmIntervalMilesDecimal?: number;
  lastPmOdometerDecimal?: number;
  lastPmCompletedAt?: string;
  pmStatus?: TruckPmStatus;
  pmDispatchPolicy?: TruckPmDispatchPolicy;
  pmWarningMilesDecimal?: number;
  pmOverdueToleranceMilesDecimal?: number;

  // Maintenance & Hold Status
  maintenanceStatus?: 'none' | 'scheduled' | 'in_progress' | 'waiting_parts' | 'completed';
  dispatchBlocked?: boolean;
  dispatchBlockedReason?: string;

  // Document Expiration Dates
  annualInspectionExpiresAt?: string;
  registrationExpiresAt?: string;

  fuelTankCapacityGallonsDecimal?: number;
  reeferTankCapacityGallonsDecimal?: number;

  createdByUid?: string;
  updatedByUid?: string;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
}

export type TrailerType = 'dry_van' | 'reefer' | 'flatbed' | 'stepdeck' | 'lowboy' | 'tanker' | 'container_chassis' | 'other';
export type TrailerStatus = 'active' | 'available' | 'maintenance' | 'out_of_service' | 'inactive';

export interface Trailer {
  id: string;
  companyId: string;
  unitNumber: string;
  vin?: string;
  licensePlate?: string;
  licensePlateState?: string;
  year?: string;
  make?: string;
  model?: string;
  type?: TrailerType;
  status?: TrailerStatus;
  color?: string;
  size?: string;
  lengthFeet?: string | number;
  widthInches?: string | number;
  heightFeet?: string | number;
  isReefer?: boolean;
  reeferMakeModel?: string;
  reeferHours?: number;
  doorType?: 'swing' | 'roll_up' | 'other' | string;
  floorType?: 'wood' | 'aluminum' | 'duct' | 'other' | string;
  maxPayloadLbs?: number;
  ownershipType?: 'company_owned' | 'leased' | 'owner_operator' | string;
  currentTruckId?: string | null;
  currentTruckNumber?: string | null;
  currentDriverId?: string | null;
  currentDriverName?: string | null;
  annualInspectionExpiresAt?: string;
  registrationExpiresAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
}

export type AssignmentType = 'primary' | 'temporary' | 'team_driver' | 'relief_driver' | 'yard' | 'other';
export type AssignmentStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type AssignmentSource = 'manual' | 'dispatch' | 'migration' | 'integration' | 'system';
export type AssignmentReason = 'new_assignment' | 'truck_change' | 'driver_change' | 'maintenance_replacement' | 'temporary_coverage' | 'termination' | 'other';

export interface TruckDriverAssignment {
  id: string;
  companyId: string;

  equipmentType?: 'truck' | 'trailer';
  truckId?: string;
  truckNumberSnapshot?: string;
  trailerId?: string;
  trailerNumberSnapshot?: string;
  vinSnapshot?: string;

  driverId: string;
  driverNameSnapshot: string;

  ownerOperatorCompanyIdSnapshot?: string | null;

  assignmentType: AssignmentType;

  effectiveFrom: string; // ISO 8601 string or Timestamp
  effectiveTo?: string | null; // ISO 8601 string or null if active

  status: AssignmentStatus;
  source: AssignmentSource;
  reason?: AssignmentReason;
  notes?: string;

  assignedByUid?: string;
  assignedByNameSnapshot?: string;

  endedByUid?: string;
  endedByNameSnapshot?: string;
  endedReason?: string;

  migrationConfidence?: 'high' | 'medium' | 'low';
  requiresReview?: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface TruckOwnerAssignment {
  id: string;
  companyId: string;
  truckId: string;
  ownerOperatorCompanyId: string;
  relationshipType: 'owned' | 'leased_on' | 'rented' | 'managed';
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'active' | 'completed' | 'terminated';
  createdByUid?: string;
  createdAt: string;
}

export type SettlementStatus =
  | 'draft'
  | 'calculated'
  | 'reviewed'
  | 'approved'
  | 'locked'
  | 'sync_pending'
  | 'synced'
  | 'partially_paid'
  | 'paid'
  | 'void';

export type LineItemType = 'earning' | 'deduction' | 'reimbursement';

export interface SettlementLineItem {
  id: string;
  settlementId?: string;
  companyId: string;
  ownerOperatorCompanyId?: string | null;
  type: LineItemType;
  category: string;
  description: string;
  quantity?: number;
  quantityDecimal?: number;
  rateCents?: number;
  percentageBasisPoints?: number | null;
  amountCents: number;
  sourceType?: 'load' | 'fuel' | 'advance' | 'deduction' | 'manual_adjustment' | 'reimbursement' | 'system';
  source?: string;
  sourceId?: string | null;
  loadId?: string | null;
  truckId?: string | null;
  driverId?: string | null;
  taxable?: boolean;
  createdAt: string;
}

export interface Settlement {
  id: string;
  companyId: string;
  settlementNumber?: string;
  poNumber?: string;
  workerId?: string;
  workerType?: WorkerType;
  loadId?: string | null;
  loadIds?: string[];
  driverId?: string | null;
  driverName?: string | null;
  ownerOperatorId?: string | null;
  ownerOperatorName?: string | null;
  ownerOperatorCompanyId?: string | null;
  truckId?: string | null;
  truckIds?: string[];
  driverIds?: string[];
  settlementType: SettlementType;
  settlementPeriodStart?: string | null;
  settlementPeriodEnd?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  totalMiles?: number;
  totalLoads?: number;
  totalLoadedMiles?: number;
  totalEmptyMiles?: number;
  payRuleId?: string | null;
  compensationProfileId?: string | null;
  compensationProfileVersion?: number | null;
  status: SettlementStatus;
  grossRevenueCents: number;
  eligibleRevenueCents?: number;
  dispatchFeeCents?: number;
  fuelDeductionsCents?: number;
  advanceDeductionsCents?: number;
  tollDeductionsCents?: number;
  insuranceDeductionsCents?: number;
  trailerRentDeductionsCents?: number;
  maintenanceDeductionsCents?: number;
  escrowDeductionsCents?: number;
  chargebackDeductionsCents?: number;
  otherDeductionsCents?: number;
  reimbursementsCents?: number;
  totalEarningsCents: number;
  totalDeductionsCents: number;
  totalReimbursementsCents: number;
  netPayCents: number;
  currency: 'USD';
  calculationVersion?: number;
  calculationHash?: string;
  quickBooksVendorId?: string | null;
  quickBooksBillId?: string | null;
  quickBooksBillPaymentId?: string | null;
  stripeTransferId?: string | null;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid' | 'failed' | null;
  paidAmountCents?: number;
  createdByUid: string;
  reviewedByUid?: string | null;
  approvedByUid?: string | null;
  lockedByUid?: string | null;
  paidByUid?: string | null;
  createdAt: string;
  calculatedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;
  syncedAt?: string | null;
  paidAt?: string | null;
  lineItems?: SettlementLineItem[];
}

export type PayRuleMethod = 'percentage_of_gross' | 'per_mile' | 'flat_per_load' | 'hourly' | 'custom_manual';

export interface DefaultDeduction {
  id: string;
  category: string;
  description: string;
  amountCents: number;
}

export interface PayRule {
  id: string;
  companyId: string;
  name: string;
  appliesTo: 'driver' | 'owner_operator';
  method: PayRuleMethod;
  percentage?: number | null;
  ratePerMileCents?: number | null;
  flatAmountCents?: number | null;
  defaultDeductions?: DefaultDeduction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomerInvoiceStatus = 'draft' | 'approved' | 'sent' | 'synced' | 'partially_paid' | 'paid' | 'void';

export interface CustomerInvoiceLine {
  id: string;
  category: string; // Linehaul, Fuel Surcharge, Detention, Layover, Lumper, Other
  description: string;
  amountCents: number;
}

export interface CustomerInvoice {
  id: string;
  companyId: string;
  loadId?: string | null;
  loadNumber?: string | null;
  customerId?: string | null;
  brokerName: string;
  invoiceNumber: string;
  poNumber?: string;
  status: CustomerInvoiceStatus;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  receivedAmountCents?: number;
  balanceCents?: number;
  currency: 'USD';
  quickBooksInvoiceId?: string | null;
  quickBooksPaymentId?: string | null;
  lineItems?: CustomerInvoiceLine[];
  createdAt: string;
  approvedAt?: string | null;
  sentAt?: string | null;
  syncedAt?: string | null;
  paidAt?: string | null;
}

export interface QuickBooksIntegrationConfig {
  providerId: 'quickbooks';
  status: 'not_connected' | 'connected' | 'error';
  realmId?: string | null;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastError?: string | null;
}

export interface AccountingSyncLog {
  id: string;
  companyId: string;
  provider: 'quickbooks';
  action: string;
  entityType: 'invoice' | 'settlement' | 'fuel_entry';
  localEntityId: string;
  externalEntityId?: string | null;
  status: 'success' | 'error' | 'info';
  message: string;
  startedAt: string;
  finishedAt: string;
  error?: string | null;
}

export interface AccountingAuditLog {
  id: string;
  companyId: string;
  userId: string;
  action: string;
  entityType: 'settlement' | 'fuel_entry' | 'pay_rule' | 'invoice' | 'quickbooks_sync' | 'compensation_profile' | 'advance';
  entityId: string;
  before?: any;
  after?: any;
  createdAt: string;
}

export type ComplianceScopeType =
  | 'company'
  | 'driver'
  | 'vehicle'
  | 'trailer'
  | 'owner_operator_company'
  | 'tax'
  | 'insurance'
  | 'safety';

export type ComplianceCategory =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'insurance'
  | 'tax_ifta'
  | 'safety_fmcsa'
  | 'maintenance'
  | 'other';

export type ComplianceCriticality = 'low' | 'medium' | 'high' | 'critical';

export type ComplianceRecurrence =
  | 'none'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'custom';

export type ComplianceStatus =
  | 'compliant'
  | 'expiring_soon'
  | 'expired'
  | 'missing_proof'
  | 'pending_review'
  | 'rejected'
  | 'not_applicable';

export type ComplianceSource =
  | 'manual'
  | 'system_template'
  | 'ai_extracted'
  | 'integration';

export interface ComplianceRequirement {
  id: string;
  companyId: string;
  title: string;
  description?: string;
  scopeType: ComplianceScopeType;
  category: ComplianceCategory;
  criticality: ComplianceCriticality;
  entityId?: string;
  entityDisplayName?: string;
  required: boolean;
  dueDate?: string;
  expirationDate?: string;
  issueDate?: string;
  effectiveDate?: string;
  recurrence?: ComplianceRecurrence;
  recurrenceIntervalDays?: number;
  status: ComplianceStatus;
  proofDocumentId?: string;
  proofFileUrl?: string;
  proofFileName?: string;
  reviewedByUid?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  lastAlertSentAt?: string;
  nextAlertAt?: string;
  source: ComplianceSource;
  createdByUid?: string;
  updatedByUid?: string;
  createdAt: string;
  updatedAt: string;
  // IFTA & Tax specific fields
  iftaQuarter?: string;
  iftaYear?: number;
  iftaFiledDate?: string;
  iftaPaidDate?: string;
  iftaAmountPaidCents?: number;
}

export type ComplianceDocumentType =
  | 'cdl_license'
  | 'medical_card'
  | 'annual_dot_inspection'
  | 'ifta_filing'
  | 'insurance_coi'
  | 'clearinghouse_query'
  | 'eld_verification'
  | 'registration'
  | 'irp'
  | 'ucr'
  | 'boc3'
  | 'mvr'
  | 'drug_alcohol_enrollment'
  | 'accident_register'
  | 'maintenance_record'
  | 'other';

export interface ComplianceDocument {
  id: string;
  companyId: string;
  requirementId: string;
  scopeType: ComplianceScopeType;
  entityId?: string;
  documentType: ComplianceDocumentType;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  extractedFields?: {
    driverName?: string;
    truckNumber?: string;
    vin?: string;
    policyNumber?: string;
    insuranceCarrier?: string;
    dotNumber?: string;
    mcNumber?: string;
    issueDate?: string;
    effectiveDate?: string;
    expirationDate?: string;
    dueDate?: string;
    state?: string;
    documentNumber?: string;
  };
  extractionStatus?: 'not_started' | 'extracted' | 'needs_confirmation' | 'failed';
  verificationStatus: 'pending_review' | 'approved' | 'rejected';
  approvedByUid?: string;
  approvedAt?: string;
  rejectedByUid?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  uploadedByUid: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceAlert {
  id: string;
  companyId: string;
  requirementId: string;
  documentId?: string;
  scopeType: ComplianceScopeType;
  entityId?: string;
  alertType:
    | 'missing_proof'
    | 'expiring_60_days'
    | 'expiring_30_days'
    | 'expiring_14_days'
    | 'expiring_7_days'
    | 'expiring_1_day'
    | 'expired'
    | 'rejected_document';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  sentToUids?: string[];
  sentEmail?: boolean;
  sentSms?: boolean;
  sentInApp?: boolean;
  status: 'pending' | 'sent' | 'dismissed' | 'resolved';
  createdAt: string;
  sentAt?: string;
  resolvedAt?: string;
}

export interface ComplianceAuditLog {
  id: string;
  companyId: string;
  userId: string;
  action:
    | 'requirement_created'
    | 'document_uploaded'
    | 'document_extracted'
    | 'document_approved'
    | 'document_rejected'
    | 'requirement_status_changed'
    | 'alert_sent'
    | 'audit_packet_downloaded'
    | 'requirement_marked_not_applicable';
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  createdAt: string;
}



