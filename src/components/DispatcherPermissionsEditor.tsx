import React from 'react';
import {
  DispatcherPermissions,
  DispatcherPresetName,
  PRESET_STANDARD_DISPATCHER,
  PRESET_SENIOR_DISPATCHER,
  PRESET_ACCOUNTING_DISPATCHER,
  PRESET_READONLY_DISPATCHER
} from '../types';
import {
  ShieldAlert,
  Lock,
  Check,
  AlertTriangle,
  ChevronDown,
  Layers,
  Truck,
  Users,
  Calculator,
  Fuel,
  FileText,
  RefreshCw,
  BarChart3,
  HelpCircle
} from 'lucide-react';

interface DispatcherPermissionsEditorProps {
  permissions: DispatcherPermissions;
  onChange: (updated: DispatcherPermissions) => void;
  readOnly?: boolean;
}

export function DispatcherPermissionsEditor({
  permissions,
  onChange,
  readOnly = false,
}: DispatcherPermissionsEditorProps) {
  const currentPreset = permissions.preset || 'custom';

  const handlePresetSelect = (presetName: DispatcherPresetName) => {
    if (readOnly) return;
    if (presetName === 'standard') onChange({ ...PRESET_STANDARD_DISPATCHER });
    else if (presetName === 'senior') onChange({ ...PRESET_SENIOR_DISPATCHER });
    else if (presetName === 'accounting') onChange({ ...PRESET_ACCOUNTING_DISPATCHER });
    else if (presetName === 'readonly') onChange({ ...PRESET_READONLY_DISPATCHER });
    else onChange({ ...permissions, preset: 'custom' });
  };

  const togglePermission = (
    category: keyof Omit<DispatcherPermissions, 'preset' | 'createLoads' | 'assignDrivers' | 'createDrivers' | 'updateDriverOperationalInfo' | 'loadChat' | 'gpsTracking' | 'rateConfirmations' | 'viewCompanyProfile' | 'legalWaiverRecords'>,
    action: string
  ) => {
    if (readOnly) return;
    const currentCategoryObj = (permissions[category] as any) || {};
    const updatedCategoryObj = {
      ...currentCategoryObj,
      [action]: !currentCategoryObj[action],
    };

    onChange({
      ...permissions,
      preset: 'custom',
      [category]: updatedCategoryObj,
    });
  };

  const isChecked = (
    category: keyof Omit<DispatcherPermissions, 'preset' | 'createLoads' | 'assignDrivers' | 'createDrivers' | 'updateDriverOperationalInfo' | 'loadChat' | 'gpsTracking' | 'rateConfirmations' | 'viewCompanyProfile' | 'legalWaiverRecords'>,
    action: string
  ) => {
    const catObj = (permissions[category] as any) || {};
    return Boolean(catObj[action]);
  };

  return (
    <div className="space-y-4 bg-slate-900/90 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-xl">
      {/* Header & Preset Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-purple-400" />
            <h4 className="text-sm font-bold font-heading text-slate-100">
              Dispatcher Staff Access Control & Permissions
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Granular access toggles enforced across frontend views and Express backend API routes.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <Layers className="h-3.5 w-3.5 text-purple-400 ml-1" />
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Preset:</span>
          <select
            value={currentPreset}
            disabled={readOnly}
            onChange={(e) => handlePresetSelect(e.target.value as DispatcherPresetName)}
            className="bg-slate-900 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
          >
            <option value="standard">Standard Dispatcher</option>
            <option value="senior">Senior Dispatcher</option>
            <option value="accounting">Accounting Dispatcher</option>
            <option value="readonly">Read-Only Dispatcher</option>
            <option value="custom">Custom Configuration</option>
          </select>
        </div>
      </div>

      {/* Grouped Permission Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1. LOAD MANAGEMENT */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <Truck className="h-4 w-4 text-indigo-400" />
            <span>Load Management</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Loads" help="Access load board and load details" category="loads" action="view" checked={isChecked('loads', 'view')} onToggle={() => togglePermission('loads', 'view')} readOnly={readOnly} />
            <ToggleRow label="Create Loads" help="Build new loads and manually input dispatch details" category="loads" action="create" checked={isChecked('loads', 'create')} onToggle={() => togglePermission('loads', 'create')} readOnly={readOnly} />
            <ToggleRow label="Edit Loads" help="Modify stops, cargo, rates, and pickup/delivery windows" category="loads" action="edit" checked={isChecked('loads', 'edit')} onToggle={() => togglePermission('loads', 'edit')} readOnly={readOnly} />
            <ToggleRow label="Assign Drivers" help="Assign drivers to loads and trigger dispatch alerts" category="loads" action="assignDriver" checked={isChecked('loads', 'assignDriver')} onToggle={() => togglePermission('loads', 'assignDriver')} readOnly={readOnly} />
            <ToggleRow label="Update Status" help="Update load status to In Transit, Delivered, or Completed" category="loads" action="updateStatus" checked={isChecked('loads', 'updateStatus')} onToggle={() => togglePermission('loads', 'updateStatus')} readOnly={readOnly} />
            <ToggleRow label="Upload Documents" help="Attach Rate Confirmations and signed PODs" category="loads" action="uploadDocuments" checked={isChecked('loads', 'uploadDocuments')} onToggle={() => togglePermission('loads', 'uploadDocuments')} readOnly={readOnly} />
            <ToggleRow label="AI Parser" help="Use AI model to parse Rate Confirmations" category="loads" action="useAIParser" checked={isChecked('loads', 'useAIParser')} onToggle={() => togglePermission('loads', 'useAIParser')} readOnly={readOnly} />
          </div>
        </div>

        {/* 2. DRIVER MANAGEMENT */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <Users className="h-4 w-4 text-blue-400" />
            <span>Driver Management</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Drivers" help="View driver directory and active locations" category="drivers" action="view" checked={isChecked('drivers', 'view')} onToggle={() => togglePermission('drivers', 'view')} readOnly={readOnly} />
            <ToggleRow label="Onboard Drivers" help="Create new driver accounts in carrier tenant" category="drivers" action="create" checked={isChecked('drivers', 'create')} onToggle={() => togglePermission('drivers', 'create')} readOnly={readOnly} />
            <ToggleRow label="Launch Onboarding Wizard" help="Access complete CDL, truck & compliance onboarding workflow" category="drivers" action="onboardWizard" checked={isChecked('drivers', 'onboardWizard')} onToggle={() => togglePermission('drivers', 'onboardWizard')} readOnly={readOnly} />
            <ToggleRow label="Edit Driver Details" help="Update operational fields, CDL, and trucks" category="drivers" action="edit" checked={isChecked('drivers', 'edit')} onToggle={() => togglePermission('drivers', 'edit')} readOnly={readOnly} />
            <ToggleRow label="Deactivate Drivers" help="Deactivate or archive driver profiles" category="drivers" action="deactivate" checked={isChecked('drivers', 'deactivate')} onToggle={() => togglePermission('drivers', 'deactivate')} readOnly={readOnly} />
            <ToggleRow label="View Driver Documents" help="View driver medical cards and CDL documents" category="drivers" action="viewDocuments" checked={isChecked('drivers', 'viewDocuments')} onToggle={() => togglePermission('drivers', 'viewDocuments')} readOnly={readOnly} />
          </div>
        </div>

        {/* 3. FINANCIAL OPERATIONS CENTER */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Calculator className="h-4 w-4 text-emerald-400" />
              <span>Financial Operations Center</span>
            </div>
            <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded">
              Restricted
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Settlements" help="Access Accounting & Settlement Center" category="accounting" action="view" checked={isChecked('accounting', 'view')} onToggle={() => togglePermission('accounting', 'view')} readOnly={readOnly} />
            <ToggleRow label="Calculate Settlement" help="Run gross pay & driver settlement calculations" category="accounting" action="calculateSettlement" checked={isChecked('accounting', 'calculateSettlement')} onToggle={() => togglePermission('accounting', 'calculateSettlement')} readOnly={readOnly} />
            <ToggleRow label="Create Draft Settlement" help="Save unfinalized settlement drafts" category="accounting" action="createDraftSettlement" checked={isChecked('accounting', 'createDraftSettlement')} onToggle={() => togglePermission('accounting', 'createDraftSettlement')} readOnly={readOnly} />
            <ToggleRow label="Review Settlement" help="Mark settlement as reviewed" category="accounting" action="reviewSettlement" checked={isChecked('accounting', 'reviewSettlement')} onToggle={() => togglePermission('accounting', 'reviewSettlement')} readOnly={readOnly} />
            <ToggleRow label="Approve Settlement" help="Approve settlement for payroll payout" category="accounting" action="approveSettlement" checked={isChecked('accounting', 'approveSettlement')} onToggle={() => togglePermission('accounting', 'approveSettlement')} readOnly={readOnly} isDangerous warning="Allows approving financial payouts" />
            <ToggleRow label="Lock Settlement" help="Lock settlement document against further edits" category="accounting" action="lockSettlement" checked={isChecked('accounting', 'lockSettlement')} onToggle={() => togglePermission('accounting', 'lockSettlement')} readOnly={readOnly} isDangerous warning="Permanently locks settlement totals" />
            <ToggleRow label="Download PDF" help="Download driver settlement statement PDF" category="accounting" action="downloadStatementPdf" checked={isChecked('accounting', 'downloadStatementPdf')} onToggle={() => togglePermission('accounting', 'downloadStatementPdf')} readOnly={readOnly} />
            <ToggleRow label="Email Statement" help="Email settlement PDF directly to driver" category="accounting" action="emailStatement" checked={isChecked('accounting', 'emailStatement')} onToggle={() => togglePermission('accounting', 'emailStatement')} readOnly={readOnly} />
            <ToggleRow label="Compensation Profiles" help="Configure driver pay rates, mileage rates & recurring deductions" category="accounting" action="manageCompensationProfiles" checked={isChecked('accounting', 'manageCompensationProfiles')} onToggle={() => togglePermission('accounting', 'manageCompensationProfiles')} readOnly={readOnly} isDangerous warning="Allows editing driver compensation rates and deduction profiles" />
          </div>
        </div>

        {/* 4. FUEL & ADVANCES */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <Fuel className="h-4 w-4 text-amber-400" />
            <span>Fuel & Cash Advances</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Fuel & Advances" help="View recorded fuel purchases and advances" category="fuel" action="view" checked={isChecked('fuel', 'view')} onToggle={() => togglePermission('fuel', 'view')} readOnly={readOnly} />
            <ToggleRow label="Create Fuel Entry" help="Log manual fuel card receipts" category="fuel" action="create" checked={isChecked('fuel', 'create')} onToggle={() => togglePermission('fuel', 'create')} readOnly={readOnly} />
            <ToggleRow label="Edit Fuel Entries" help="Modify fuel details and gallon amounts" category="fuel" action="edit" checked={isChecked('fuel', 'edit')} onToggle={() => togglePermission('fuel', 'edit')} readOnly={readOnly} />
            <ToggleRow label="Import Fuel CSV" help="Bulk upload WEX/EFS fuel CSV statements" category="fuel" action="importCsv" checked={isChecked('fuel', 'importCsv')} onToggle={() => togglePermission('fuel', 'importCsv')} readOnly={readOnly} />
            <ToggleRow label="Manage Cash Advances" help="Issue driver cash advances and comchecks" category="fuel" action="manageAdvances" checked={isChecked('fuel', 'manageAdvances')} onToggle={() => togglePermission('fuel', 'manageAdvances')} readOnly={readOnly} />
            <ToggleRow label="Apply Deductions" help="Apply fuel & advance deductions to settlements" category="fuel" action="applyDeductions" checked={isChecked('fuel', 'applyDeductions')} onToggle={() => togglePermission('fuel', 'applyDeductions')} readOnly={readOnly} />
          </div>
        </div>

        {/* 5. CUSTOMER INVOICES */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <FileText className="h-4 w-4 text-cyan-400" />
            <span>Customer Invoices</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Invoices" help="Access customer billing and invoice board" category="invoices" action="view" checked={isChecked('invoices', 'view')} onToggle={() => togglePermission('invoices', 'view')} readOnly={readOnly} />
            <ToggleRow label="Create Invoices" help="Generate customer load invoices" category="invoices" action="create" checked={isChecked('invoices', 'create')} onToggle={() => togglePermission('invoices', 'create')} readOnly={readOnly} />
            <ToggleRow label="Edit Draft Invoices" help="Edit unsubmitted draft invoices" category="invoices" action="editDraft" checked={isChecked('invoices', 'editDraft')} onToggle={() => togglePermission('invoices', 'editDraft')} readOnly={readOnly} />
            <ToggleRow label="Send Invoices" help="Email invoice PDF directly to factoring or broker" category="invoices" action="send" checked={isChecked('invoices', 'send')} onToggle={() => togglePermission('invoices', 'send')} readOnly={readOnly} />
            <ToggleRow label="Sync Invoice to QB" help="Push invoices to QuickBooks Online" category="invoices" action="syncQuickBooks" checked={isChecked('invoices', 'syncQuickBooks')} onToggle={() => togglePermission('invoices', 'syncQuickBooks')} readOnly={readOnly} />
          </div>
        </div>

        {/* 6. QUICKBOOKS SYNC & INTEGRATIONS */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <RefreshCw className="h-4 w-4 text-teal-400" />
            <span>QuickBooks & Integrations</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View QB Sync Status" help="Check QuickBooks integration status and logs" category="integrations" action="viewQuickBooksStatus" checked={isChecked('integrations', 'viewQuickBooksStatus')} onToggle={() => togglePermission('integrations', 'viewQuickBooksStatus')} readOnly={readOnly} />
            <ToggleRow label="Sync Approved Records" help="Push approved settlements and invoices to QB" category="integrations" action="syncApprovedRecords" checked={isChecked('integrations', 'syncApprovedRecords')} onToggle={() => togglePermission('integrations', 'syncApprovedRecords')} readOnly={readOnly} />
            <ToggleRow label="Retry Failed Syncs" help="Re-attempt failed accounting syncs" category="integrations" action="retryFailedSync" checked={isChecked('integrations', 'retryFailedSync')} onToggle={() => togglePermission('integrations', 'retryFailedSync')} readOnly={readOnly} />
            <ToggleRow label="Connect / Disconnect" help="Manage OAuth connection to QuickBooks" category="integrations" action="connectDisconnect" checked={isChecked('integrations', 'connectDisconnect')} onToggle={() => togglePermission('integrations', 'connectDisconnect')} readOnly={readOnly} isDangerous warning="Modifies carrier QuickBooks OAuth connection" />
          </div>
        </div>

        {/* 7. REPORTS */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            <span>Reports & Analytics</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="Dispatch Reports" help="View dispatch operational performance" category="reports" action="viewDispatchReports" checked={isChecked('reports', 'viewDispatchReports')} onToggle={() => togglePermission('reports', 'viewDispatchReports')} readOnly={readOnly} />
            <ToggleRow label="Revenue Reports" help="View carrier gross revenue and RPM" category="reports" action="viewRevenueReports" checked={isChecked('reports', 'viewRevenueReports')} onToggle={() => togglePermission('reports', 'viewRevenueReports')} readOnly={readOnly} />
            <ToggleRow label="Settlement Reports" help="View settlement summaries and driver payouts" category="reports" action="viewSettlementReports" checked={isChecked('reports', 'viewSettlementReports')} onToggle={() => togglePermission('reports', 'viewSettlementReports')} readOnly={readOnly} />
            <ToggleRow label="Export Reports" help="Export analytics to CSV or PDF" category="reports" action="exportReports" checked={isChecked('reports', 'exportReports')} onToggle={() => togglePermission('reports', 'exportReports')} readOnly={readOnly} />
          </div>
        </div>

        {/* 8. SUPPORT CENTER */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <HelpCircle className="h-4 w-4 text-rose-400" />
            <span>Support Center</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="Create Support Ticket" help="Submit new support requests" category="support" action="createTicket" checked={isChecked('support', 'createTicket')} onToggle={() => togglePermission('support', 'createTicket')} readOnly={readOnly} />
            <ToggleRow label="Reply to Tickets" help="Respond to ongoing support tickets" category="support" action="replyTicket" checked={isChecked('support', 'replyTicket')} onToggle={() => togglePermission('support', 'replyTicket')} readOnly={readOnly} />
            <ToggleRow label="View Company Tickets" help="View tickets submitted by other company staff" category="support" action="viewCompanyTickets" checked={isChecked('support', 'viewCompanyTickets')} onToggle={() => togglePermission('support', 'viewCompanyTickets')} readOnly={readOnly} />
          </div>
        </div>

        {/* 9. FLEET & EQUIPMENT OPERATIONS */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-1.5">
            <Truck className="h-4 w-4 text-emerald-400" />
            <span>Fleet & Equipment Operations</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <ToggleRow label="View Fleet & Equipment" help="Access fleet center, trucks, trailers, and status" category="fleet" action="viewFleet" checked={isChecked('fleet', 'viewFleet')} onToggle={() => togglePermission('fleet', 'viewFleet')} readOnly={readOnly} />
            <ToggleRow label="Register Trucks" help="Add new power units to central fleet directory" category="fleet" action="createTruck" checked={isChecked('fleet', 'createTruck')} onToggle={() => togglePermission('fleet', 'createTruck')} readOnly={readOnly} />
            <ToggleRow label="Edit Truck Info" help="Update truck specs, VIN, and operational status" category="fleet" action="editTruck" checked={isChecked('fleet', 'editTruck')} onToggle={() => togglePermission('fleet', 'editTruck')} readOnly={readOnly} />
            <ToggleRow label="Manage Trailers" help="Register and edit trailer equipment" category="fleet" action="createTrailer" checked={isChecked('fleet', 'createTrailer')} onToggle={() => togglePermission('fleet', 'createTrailer')} readOnly={readOnly} />
            <ToggleRow label="Assign Driver to Vehicle" help="Assign driver to power unit or trailer" category="fleet" action="assignDriverToVehicle" checked={isChecked('fleet', 'assignDriverToVehicle')} onToggle={() => togglePermission('fleet', 'assignDriverToVehicle')} readOnly={readOnly} />
            <ToggleRow label="Log Odometers" help="Record odometer readings and mileage logs" category="fleet" action="logOdometer" checked={isChecked('fleet', 'logOdometer')} onToggle={() => togglePermission('fleet', 'logOdometer')} readOnly={readOnly} />
            <ToggleRow label="Record Maintenance & PM" help="Log preventive maintenance and service items" category="fleet" action="manageMaintenance" checked={isChecked('fleet', 'manageMaintenance')} onToggle={() => togglePermission('fleet', 'manageMaintenance')} readOnly={readOnly} />
          </div>
        </div>

      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  help: string;
  category: string;
  action: string;
  checked: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  isDangerous?: boolean;
  warning?: string;
}

function ToggleRow({
  label,
  help,
  checked,
  onToggle,
  readOnly = false,
  isDangerous = false,
  warning,
}: ToggleRowProps) {
  return (
    <div className={`flex items-start justify-between gap-3 p-2 rounded-lg transition ${
      checked ? (isDangerous ? 'bg-amber-950/30 border border-amber-800/50' : 'bg-slate-900/80 border border-slate-800') : 'bg-slate-900/30 border border-transparent hover:bg-slate-900/50'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-200 truncate">{label}</span>
          {isDangerous && (
            <span className="text-[9px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
              Restricted
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{help}</p>
        {isDangerous && checked && warning && (
          <p className="text-[9px] text-amber-400/90 font-medium mt-1 leading-tight flex items-center gap-1">
            <span>⚠️</span> {warning}
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={readOnly}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 ${
          checked ? (isDangerous ? 'bg-amber-500' : 'bg-purple-600') : 'bg-slate-700'
        } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
