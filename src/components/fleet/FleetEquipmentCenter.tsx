import React, { useState, useEffect } from 'react';
import {
  Truck as TruckIcon,
  Container,
  UserCheck,
  Wrench,
  ShieldAlert,
  Gauge,
  FileText,
  Calendar,
  Search,
  Filter,
  Plus,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Fuel,
  History,
  X,
  Building2,
  User,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  Edit,
  Sliders,
  Check,
  Trash2,
  Archive,
  RotateCcw,
  UserX,
  Thermometer,
  Ruler,
  Palette,
  Eye,
  Layers
} from 'lucide-react';
import {
  Company,
  User as UserType,
  UserRole,
  Truck,
  Trailer,
  TruckDriverAssignment,
  OwnerOperatorCompany,
  Load,
  TruckOperationalStatus,
  TruckPmStatus,
  TruckPmDispatchPolicy
} from '../../types';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';

interface TablePaginationBarProps {
  currentPage: number;
  totalItems: number;
  rowsPerPage: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  theme: any;
}

const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  currentPage,
  totalItems,
  rowsPerPage,
  itemLabel,
  onPageChange,
  onRowsPerPageChange,
  theme
}) => {
  const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(totalItems, currentPage * rowsPerPage);

  if (totalItems === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t text-xs font-sans ${theme.barBg} ${theme.modalBorder || 'border-slate-800'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={theme.subText}>
          Showing <strong className={theme.headingText}>{startIndex}</strong> to <strong className={theme.headingText}>{endIndex}</strong> of <strong className={theme.headingText}>{totalItems}</strong> {itemLabel}
        </span>
        <div className={`flex items-center gap-1.5 text-[11px] ${theme.subText}`}>
          <span>Per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              onRowsPerPageChange(Number(e.target.value));
              onPageChange(1);
            }}
            className={`rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer border ${theme.inputBg}`}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className={`px-3 py-1 rounded-lg font-semibold border text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${theme.btnSecondary}`}
        >
          Previous
        </button>

        <div className="flex items-center gap-1 font-mono text-xs">
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
                  onClick={() => onPageChange(p)}
                  className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                    p === currentPage
                      ? 'bg-purple-600 text-white shadow-xs'
                      : theme.btnSecondary
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
              return <span key={p} className={`px-1 font-bold ${theme.subText}`}>...</span>;
            }
            return null;
          })}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className={`px-3 py-1 rounded-lg font-semibold border text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${theme.btnSecondary}`}
        >
          Next
        </button>
      </div>
    </div>
  );
};

interface TableSearchBarProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  showingText: string;
  theme: any;
  children?: React.ReactNode;
}

const TableSearchBar: React.FC<TableSearchBarProps> = ({
  placeholder,
  value,
  onChange,
  showingText,
  theme,
  children
}) => {
  return (
    <div className={`flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between p-3 rounded-xl ${theme.barBg}`}>
      <div className="flex-1 flex flex-wrap items-center gap-3">
        <div className="relative flex-grow max-w-md min-w-[240px]">
          <Search className={`w-4 h-4 absolute left-3 top-2.5 ${theme.subText}`} />
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded-lg pl-9 pr-8 py-1.5 text-xs ${theme.inputBg}`}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className={`absolute right-2.5 top-1.5 ${theme.subText} hover:${theme.headingText} text-xs font-bold cursor-pointer`}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
      <div className={`text-[11px] font-mono shrink-0 ${theme.subText}`}>
        {showingText}
      </div>
    </div>
  );
};

// Helper function to resolve active load for a power unit safely
const getActiveLoadForTruck = (truck: Truck, loadsList: Load[], driversList: UserType[]): Load | null => {
  if (!truck || !loadsList || loadsList.length === 0) return null;
  const activeStatuses = ['booked', 'dispatched', 'at_pickup', 'arrived_pickup', 'loaded', 'in_transit', 'at_delivery'];

  return loadsList.find(l => {
    // 1. Must be in an active status (unassigned, canceled, delivered, completed, archived are excluded)
    if (!l || !l.status || !activeStatuses.includes(l.status)) {
      return false;
    }

    // 2. Must have an assigned driver (an unassigned load is never active on a unit)
    if (!l.assignedDriverId || !l.assignedDriverId.trim()) {
      return false;
    }

    // 3. Find driver assigned to load
    const loadDriver = driversList.find(d => d.id === l.assignedDriverId || d.uid === l.assignedDriverId);

    // 4. Verify if load's assigned driver is currently assigned to this truck
    const isDriverLinkedToTruck = Boolean(
      (truck.currentDriverId && (l.assignedDriverId === truck.currentDriverId)) ||
      (truck.assignedDriverId && (l.assignedDriverId === truck.assignedDriverId)) ||
      (loadDriver && truck.truckNumber && (
        (loadDriver.assignedTruck && loadDriver.assignedTruck.trim().toUpperCase() === truck.truckNumber.trim().toUpperCase()) ||
        (loadDriver.truckNumber && loadDriver.truckNumber.trim().toUpperCase() === truck.truckNumber.trim().toUpperCase()) ||
        (loadDriver.currentTruckId === truck.id)
      ))
    );

    // If load's assigned driver is NOT assigned to this truck, truck does not have this load
    if (!isDriverLinkedToTruck) {
      return false;
    }

    // 5. If load explicitly specifies a different truck, reject
    if (l.assignedTruckId && l.assignedTruckId !== truck.id) {
      return false;
    }
    if (l.assignedTruckNumber && truck.truckNumber && l.assignedTruckNumber.trim().toUpperCase() !== truck.truckNumber.trim().toUpperCase()) {
      return false;
    }

    return true;
  }) || null;
};

interface FleetEquipmentCenterProps {
  company: Company;
  users: UserType[];
  pageTheme?: 'dark' | 'light';
  currentUserId: string;
  userRole?: UserRole;
}

export const FleetEquipmentCenter: React.FC<FleetEquipmentCenterProps> = ({
  company,
  users,
  pageTheme = 'dark',
  currentUserId,
  userRole = 'admin'
}) => {
  const isLight = pageTheme === 'light';

  // Dynamic theme styles based on day/night light mode
  const theme = {
    cardBg: isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800',
    cardSubtleBg: isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800',
    barBg: isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800',
    headingText: isLight ? 'text-slate-900' : 'text-slate-100',
    subText: isLight ? 'text-slate-600' : 'text-slate-400',
    mutedText: isLight ? 'text-slate-500' : 'text-slate-500',
    monoLabel: isLight ? 'text-slate-700 font-semibold' : 'text-slate-400 font-mono',
    inputBg: isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20'
      : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none',
    tableWrapper: isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800',
    tableHeader: isLight ? 'bg-slate-100/90 border-b border-slate-200 text-slate-700 font-mono font-semibold' : 'bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono',
    tableRowHover: isLight ? 'hover:bg-slate-50/90' : 'hover:bg-slate-800/40',
    tableDivide: isLight ? 'divide-slate-200' : 'divide-slate-800/60',
    btnSecondary: isLight
      ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    btnSync: isLight
      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
      : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40',
    badgeActive: isLight
      ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-semibold'
      : 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300',
    badgeMaintenance: isLight
      ? 'bg-amber-100 border-amber-300 text-amber-800 font-semibold'
      : 'bg-amber-950/60 border-amber-500/30 text-amber-300',
    badgeOutOfService: isLight
      ? 'bg-rose-100 border-rose-300 text-rose-800 font-semibold'
      : 'bg-rose-950/60 border-rose-500/30 text-rose-300',
    badgeDefault: isLight
      ? 'bg-slate-100 border-slate-300 text-slate-700 font-semibold'
      : 'bg-slate-800 border-slate-700 text-slate-300',
    textEmerald: isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400',
    textPurple: isLight ? 'text-purple-700 font-semibold' : 'text-purple-400',
    textCyan: isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-400',
    textAmber: isLight ? 'text-amber-700 font-semibold' : 'text-amber-400',
    textRose: isLight ? 'text-rose-700 font-semibold' : 'text-rose-400',
    modalBg: isLight ? 'bg-white border-slate-200 text-slate-800 shadow-2xl' : 'bg-slate-900 border-slate-800 text-slate-100 shadow-2xl',
    modalBackdrop: isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-slate-950/80 backdrop-blur-sm',
    modalBorder: isLight ? 'border-slate-200' : 'border-slate-800'
  };

  // Sub-navigation tab
  const [activeTab, setActiveTab] = useState<'power_units' | 'trailers' | 'assignments' | 'maintenance' | 'documents' | 'fuel_performance'>('power_units');

  // Firestore collections data
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [assignments, setAssignments] = useState<TruckDriverAssignment[]>([]);
  const [ownerCompanies, setOwnerCompanies] = useState<OwnerOperatorCompany[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [operationalFilter, setOperationalFilter] = useState<string>('all');
  const [pmFilter, setPmFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<string>('all');

  // Search & Pagination per Tab
  const [searchTermPowerUnits, setSearchTermPowerUnits] = useState('');
  const [pagePowerUnits, setPagePowerUnits] = useState(1);
  const [rowsPerPagePowerUnits, setRowsPerPagePowerUnits] = useState(10);

  const [searchTermTrailers, setSearchTermTrailers] = useState('');
  const [pageTrailers, setPageTrailers] = useState(1);
  const [rowsPerPageTrailers, setRowsPerPageTrailers] = useState(10);

  const [searchTermAssignments, setSearchTermAssignments] = useState('');
  const [pageAssignments, setPageAssignments] = useState(1);
  const [rowsPerPageAssignments, setRowsPerPageAssignments] = useState(10);

  const [searchTermMaintenance, setSearchTermMaintenance] = useState('');
  const [pageMaintenance, setPageMaintenance] = useState(1);
  const [rowsPerPageMaintenance, setRowsPerPageMaintenance] = useState(10);

  const [searchTermDocuments, setSearchTermDocuments] = useState('');
  const [pageDocuments, setPageDocuments] = useState(1);
  const [rowsPerPageDocuments, setRowsPerPageDocuments] = useState(10);

  const [searchTermFuel, setSearchTermFuel] = useState('');
  const [pageFuel, setPageFuel] = useState(1);
  const [rowsPerPageFuel, setRowsPerPageFuel] = useState(10);

  // Modals & Drawers
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedTrailer, setSelectedTrailer] = useState<Trailer | null>(null);
  const [isTrailerDetailDrawerOpen, setIsTrailerDetailDrawerOpen] = useState(false);
  const [isAddTruckModalOpen, setIsAddTruckModalOpen] = useState(false);
  const [isAddTrailerModalOpen, setIsAddTrailerModalOpen] = useState(false);
  const [isAssignDriverModalOpen, setIsAssignDriverModalOpen] = useState(false);
  const [isAssignTrailerDriverModalOpen, setIsAssignTrailerDriverModalOpen] = useState(false);
  const [isOdometerModalOpen, setIsOdometerModalOpen] = useState(false);
  const [isRecordPmModalOpen, setIsRecordPmModalOpen] = useState(false);

  // Sync, Archive & History states
  const [syncingFleet, setSyncingFleet] = useState(false);
  const [showArchivedUnits, setShowArchivedUnits] = useState(false);

  // Quick Edit Driver modal
  const [quickEditTruck, setQuickEditTruck] = useState<Truck | null>(null);
  const [quickDriverId, setQuickDriverId] = useState<string>('');
  const [isQuickEditDriverModalOpen, setIsQuickEditDriverModalOpen] = useState(false);

  const [quickEditTrailer, setQuickEditTrailer] = useState<Trailer | null>(null);
  const [quickTrailerDriverId, setQuickTrailerDriverId] = useState<string>('');
  const [isQuickEditTrailerDriverModalOpen, setIsQuickEditTrailerDriverModalOpen] = useState(false);

  // History modal
  const [historyUnit, setHistoryUnit] = useState<{ id: string; number: string; type: 'truck' | 'trailer' } | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Delete confirmation modal
  const [unitToDelete, setUnitToDelete] = useState<{ id: string; number: string; type: 'truck' | 'trailer' } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form states
  const [truckForm, setTruckForm] = useState<Partial<Truck>>({
    truckNumber: '',
    vin: '',
    licensePlate: '',
    licensePlateState: '',
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    vehicleType: 'tractor',
    ownershipType: 'company_owned',
    operationalStatus: 'available',
    currentOdometerDecimal: 0,
    nextPmDueOdometerDecimal: 15000,
    pmIntervalMilesDecimal: 15000,
    pmWarningMilesDecimal: 1000,
    pmDispatchPolicy: 'warning_only'
  });

  const [trailerForm, setTrailerForm] = useState<Partial<Trailer>>({
    unitNumber: '',
    vin: '',
    licensePlate: '',
    licensePlateState: '',
    type: 'dry_van',
    color: '',
    size: '53 ft',
    lengthFeet: '53',
    widthInches: '102',
    heightFeet: '13.5',
    isReefer: false,
    reeferMakeModel: '',
    reeferHours: 0,
    doorType: 'swing',
    floorType: 'wood',
    maxPayloadLbs: 45000,
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    ownershipType: 'company_owned',
    status: 'available',
    annualInspectionExpiresAt: '',
    registrationExpiresAt: '',
    notes: ''
  });

  const [assignForm, setAssignForm] = useState({
    truckId: '',
    driverId: '',
    notes: ''
  });

  const [trailerAssignForm, setTrailerAssignForm] = useState({
    trailerId: '',
    driverId: '',
    notes: ''
  });

  const [odometerForm, setOdometerForm] = useState({
    truckId: '',
    newOdometer: 0,
    source: 'manual' as 'eld' | 'gps' | 'telematics' | 'maintenance_record' | 'manual',
    reason: ''
  });

  const [pmForm, setPmForm] = useState({
    truckId: '',
    serviceOdometer: 0,
    serviceDate: new Date().toISOString().split('T')[0],
    vendor: '',
    notes: ''
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Firestore data
  useEffect(() => {
    if (!company?.id) return;

    // 1. Trucks listener
    const trucksRef = collection(db, 'admins', company.id, 'trucks');
    const unsubTrucks = onSnapshot(trucksRef, (snap) => {
      const list: Truck[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Truck));
      setTrucks(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load trucks:", err);
      setLoading(false);
    });

    // 2. Trailers listener
    const trailersRef = collection(db, 'admins', company.id, 'trailers');
    const unsubTrailers = onSnapshot(trailersRef, (snap) => {
      const list: Trailer[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trailer));
      setTrailers(list);
    }, (err) => {
      console.error("Failed to load trailers:", err);
    });

    // 3. Assignments listener
    const assignmentsRef = collection(db, 'admins', company.id, 'truck_driver_assignments');
    const unsubAssignments = onSnapshot(query(assignmentsRef, orderBy('createdAt', 'desc')), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckDriverAssignment));
      setAssignments(list);
    }, (err) => {
      console.error("Failed to load truck driver assignments:", err);
    });

    // 4. Owner companies
    getDocs(collection(db, 'admins', company.id, 'owner_operator_companies')).then(snap => {
      setOwnerCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() } as OwnerOperatorCompany)));
    }).catch(e => console.error("Error loading owner ops:", e));

    // 5. Active Loads listener
    const loadsRef = collection(db, 'admins', company.id, 'loads');
    const unsubLoads = onSnapshot(loadsRef, (snap) => {
      setLoads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Load)));
    }, (err) => {
      console.error("Failed to load loads in fleet center:", err);
    });

    return () => {
      unsubTrucks();
      unsubTrailers();
      unsubAssignments();
      unsubLoads();
    };
  }, [company?.id]);

  // Derived Drivers
  const drivers = users.filter(u => u.role === 'driver');

  // Compute PM Status
  const getPmStatus = (truck: Truck): { status: TruckPmStatus; milesRemaining: number } => {
    const currentOdometer = truck.currentOdometerDecimal || 0;
    const nextDue = truck.nextPmDueOdometerDecimal || 0;
    const warningMiles = truck.pmWarningMilesDecimal || 1000;
    const overdueTolerance = truck.pmOverdueToleranceMilesDecimal || 500;

    if (!nextDue || nextDue === 0) {
      return { status: 'not_configured', milesRemaining: 0 };
    }

    const milesRemaining = nextDue - currentOdometer;

    if (milesRemaining < -overdueTolerance) {
      return { status: 'overdue', milesRemaining };
    }
    if (milesRemaining <= 0) {
      return { status: 'due', milesRemaining };
    }
    if (milesRemaining <= warningMiles) {
      return { status: 'approaching_due', milesRemaining };
    }
    return { status: 'current', milesRemaining };
  };

  // Metrics
  const totalPowerUnits = trucks.length;
  const activePowerUnits = trucks.filter(t => (t.operationalStatus || t.status || 'available') === 'active').length;
  const availablePowerUnits = trucks.filter(t => (t.operationalStatus || t.status || 'available') === 'available').length;
  const maintenancePowerUnits = trucks.filter(t => (t.operationalStatus || t.status || 'available') === 'maintenance').length;
  const outOfServicePowerUnits = trucks.filter(t => (t.operationalStatus || t.status) === 'out_of_service' || t.dispatchBlocked).length;

  const pmApproachingCount = trucks.filter(t => getPmStatus(t).status === 'approaching_due').length;
  const pmDueOrOverdueCount = trucks.filter(t => ['due', 'overdue'].includes(getPmStatus(t).status)).length;

  const totalTrailers = trailers.length;
  const availableTrailers = trailers.filter(tr => tr.status === 'available').length;

  // Filtered Trucks list (Power Units)
  const filteredTrucks = trucks.filter(truck => {
    const term = (searchTermPowerUnits || searchTerm).toLowerCase();
    const matchesSearch =
      truck.truckNumber.toLowerCase().includes(term) ||
      (truck.vin || '').toLowerCase().includes(term) ||
      (truck.licensePlate || '').toLowerCase().includes(term) ||
      (truck.currentDriverName || '').toLowerCase().includes(term) ||
      (truck.makeModel || '').toLowerCase().includes(term) ||
      (truck.make || '').toLowerCase().includes(term) ||
      (truck.model || '').toLowerCase().includes(term);

    const opStatus = truck.operationalStatus || truck.status || 'available';
    const matchesOp = operationalFilter === 'all' || opStatus === operationalFilter;

    const pmObj = getPmStatus(truck);
    const matchesPm = pmFilter === 'all' || pmObj.status === pmFilter;

    const matchesOwnership = ownershipFilter === 'all' || truck.ownershipType === ownershipFilter;

    const matchesArchive = showArchivedUnits ? truck.isArchived === true : !truck.isArchived;

    return matchesSearch && matchesOp && matchesPm && matchesOwnership && matchesArchive;
  });
  const startTrucksIdx = (pagePowerUnits - 1) * rowsPerPagePowerUnits;
  const paginatedTrucks = filteredTrucks.slice(startTrucksIdx, startTrucksIdx + rowsPerPagePowerUnits);

  // Filtered Trailers list
  const filteredTrailers = trailers.filter(tr => {
    const term = searchTermTrailers.toLowerCase();
    const matchesSearch =
      tr.unitNumber.toLowerCase().includes(term) ||
      (tr.vin || '').toLowerCase().includes(term) ||
      (tr.licensePlate || '').toLowerCase().includes(term) ||
      (tr.currentDriverName || '').toLowerCase().includes(term) ||
      (tr.color || '').toLowerCase().includes(term) ||
      (tr.type || '').toLowerCase().includes(term) ||
      (tr.make || '').toLowerCase().includes(term) ||
      (tr.model || '').toLowerCase().includes(term);
    const matchesArchive = showArchivedUnits ? tr.isArchived === true : !tr.isArchived;
    return matchesSearch && matchesArchive;
  });
  const startTrailersIdx = (pageTrailers - 1) * rowsPerPageTrailers;
  const paginatedTrailers = filteredTrailers.slice(startTrailersIdx, startTrailersIdx + rowsPerPageTrailers);

  // Filtered Assignments list
  const filteredAssignments = assignments.filter(asg => {
    const term = searchTermAssignments.toLowerCase();
    if (!term) return true;
    const isTrailerAsg = asg.equipmentType === 'trailer' || Boolean(asg.trailerId);
    const unitLabel = isTrailerAsg ? `trailer ${asg.trailerNumberSnapshot || ''}` : `unit ${asg.truckNumberSnapshot || ''}`;
    return (
      unitLabel.toLowerCase().includes(term) ||
      (asg.driverNameSnapshot || '').toLowerCase().includes(term) ||
      (asg.status || '').toLowerCase().includes(term) ||
      (asg.notes || '').toLowerCase().includes(term) ||
      (asg.equipmentType || '').toLowerCase().includes(term)
    );
  });
  const startAssignmentsIdx = (pageAssignments - 1) * rowsPerPageAssignments;
  const paginatedAssignments = filteredAssignments.slice(startAssignmentsIdx, startAssignmentsIdx + rowsPerPageAssignments);

  // Filtered Maintenance list
  const filteredMaintenanceTrucks = trucks.filter(truck => {
    const term = searchTermMaintenance.toLowerCase();
    if (!term) return true;
    const pmObj = getPmStatus(truck);
    return (
      (truck.truckNumber || '').toLowerCase().includes(term) ||
      (pmObj.status || '').toLowerCase().includes(term) ||
      (truck.pmDispatchPolicy || '').toLowerCase().includes(term) ||
      (truck.currentOdometerDecimal || 0).toString().includes(term) ||
      (truck.currentDriverName || '').toLowerCase().includes(term)
    );
  });
  const startMaintenanceIdx = (pageMaintenance - 1) * rowsPerPageMaintenance;
  const paginatedMaintenanceTrucks = filteredMaintenanceTrucks.slice(startMaintenanceIdx, startMaintenanceIdx + rowsPerPageMaintenance);

  // Filtered Compliance list
  const filteredComplianceTrucks = trucks.filter(truck => {
    const term = searchTermDocuments.toLowerCase();
    if (!term) return true;
    return (
      (truck.truckNumber || '').toLowerCase().includes(term) ||
      (truck.complianceStatus || '').toLowerCase().includes(term) ||
      (truck.annualInspectionExpiresAt || '').toLowerCase().includes(term) ||
      (truck.registrationExpiresAt || '').toLowerCase().includes(term) ||
      (truck.currentDriverName || '').toLowerCase().includes(term)
    );
  });
  const startComplianceIdx = (pageDocuments - 1) * rowsPerPageDocuments;
  const paginatedComplianceTrucks = filteredComplianceTrucks.slice(startComplianceIdx, startComplianceIdx + rowsPerPageDocuments);

  // Filtered Fuel list
  const filteredFuelTrucks = trucks.filter(truck => {
    const term = searchTermFuel.toLowerCase();
    if (!term) return true;
    return (
      (truck.truckNumber || '').toLowerCase().includes(term) ||
      (truck.currentDriverName || '').toLowerCase().includes(term) ||
      (truck.makeModel || '').toLowerCase().includes(term) ||
      (truck.make || '').toLowerCase().includes(term) ||
      (truck.vin || '').toLowerCase().includes(term)
    );
  });
  const startFuelIdx = (pageFuel - 1) * rowsPerPageFuel;
  const paginatedFuelTrucks = filteredFuelTrucks.slice(startFuelIdx, startFuelIdx + rowsPerPageFuel);

  // Centralized Fleet Sync Handler
  const handleSyncCentralizedFleet = async () => {
    if (!company?.id) return;
    setSyncingFleet(true);
    setActionMessage(null);

    try {
      let createdCount = 0;
      let reconciledCount = 0;

      const driverList = users.filter(u => u.companyId === company.id && (u.role === 'driver' || (u as any).isDriver));

      const existingTrucksMap = new Map<string, Truck>();
      trucks.forEach(t => {
        if (t.truckNumber) {
          existingTrucksMap.set(t.truckNumber.trim().toUpperCase(), t);
        }
      });

      const discoveredUnits = new Map<string, { driverId?: string; driverName?: string }>();

      driverList.forEach(drv => {
        const trkNum = drv.assignedTruck || drv.truckNumber || (drv as any).unitNumber;
        if (trkNum && typeof trkNum === 'string' && trkNum.trim()) {
          const cleanNum = trkNum.trim().toUpperCase();
          discoveredUnits.set(cleanNum, { driverId: drv.id, driverName: drv.name });
        }
      });

      loads.forEach(ld => {
        const trkNum = ld.assignedTruckNumber;
        if (trkNum && typeof trkNum === 'string' && trkNum.trim()) {
          const cleanNum = trkNum.trim().toUpperCase();
          if (!discoveredUnits.has(cleanNum)) {
            discoveredUnits.set(cleanNum, {});
          }
        }
      });

      for (const [unitNum, drvInfo] of discoveredUnits.entries()) {
        const existing = existingTrucksMap.get(unitNum);
        if (!existing) {
          const newTruckId = `truck_${unitNum.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const newTruckData: Truck = {
            id: newTruckId,
            companyId: company.id,
            truckNumber: unitNum,
            make: 'Freightliner',
            model: 'Cascadia',
            year: '2023',
            vehicleType: 'tractor',
            ownershipType: 'company_owned',
            operationalStatus: drvInfo.driverId ? 'active' : 'available',
            currentDriverId: drvInfo.driverId || '',
            currentDriverName: drvInfo.driverName || '',
            currentOdometerDecimal: 0,
            nextPmDueOdometerDecimal: 15000,
            pmIntervalMilesDecimal: 15000,
            pmWarningMilesDecimal: 1000,
            pmDispatchPolicy: 'warning_only',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await setDoc(doc(db, 'admins', company.id, 'trucks', newTruckId), newTruckData);
          createdCount++;

          if (drvInfo.driverId) {
            const assignId = `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await setDoc(doc(db, 'admins', company.id, 'truck_driver_assignments', assignId), {
              id: assignId,
              companyId: company.id,
              truckId: newTruckId,
              truckNumberSnapshot: unitNum,
              driverId: drvInfo.driverId,
              driverNameSnapshot: drvInfo.driverName || 'Driver',
              effectiveFrom: new Date().toISOString(),
              status: 'active',
              notes: 'Auto-registered during Centralized Fleet Sync',
              createdAt: new Date().toISOString()
            });
          }
        } else {
          if (drvInfo.driverId && existing.currentDriverId !== drvInfo.driverId) {
            await updateDoc(doc(db, 'admins', company.id, 'trucks', existing.id), {
              currentDriverId: drvInfo.driverId,
              currentDriverName: drvInfo.driverName || '',
              operationalStatus: 'active',
              updatedAt: new Date().toISOString()
            });
            reconciledCount++;
          }
        }
      }

      setActionMessage({
        type: 'success',
        text: `Sync Complete: Reconciled ${reconciledCount} unit assignment(s) and auto-registered ${createdCount} new power unit(s) into Centralized Fleet.`
      });
    } catch (err: any) {
      console.error("Centralized Fleet Sync failed:", err);
      setActionMessage({ type: 'error', text: err.message || "Centralized Fleet Sync failed" });
    } finally {
      setSyncingFleet(false);
    }
  };

  // Quick edit driver handler
  const handleOpenQuickEditDriver = (truck: Truck) => {
    setQuickEditTruck(truck);
    setQuickDriverId(truck.currentDriverId || '');
    setIsQuickEditDriverModalOpen(true);
  };

  const handleSaveQuickDriverAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditTruck || !company?.id) return;
    setActionLoading(true);
    setActionMessage(null);

    try {
      const newDriver = drivers.find(d => d.id === quickDriverId);
      const oldDriverId = quickEditTruck.currentDriverId;
      const nowIso = new Date().toISOString();

      // Close previous active assignments for this truck or driver
      const oldAsgs = assignments.filter(a =>
        a.status === 'active' && (a.truckId === quickEditTruck.id || (newDriver && a.driverId === newDriver.id) || (oldDriverId && a.driverId === oldDriverId))
      );
      for (const oldAsg of oldAsgs) {
        try {
          await updateDoc(doc(db, 'admins', company.id, 'truck_driver_assignments', oldAsg.id), {
            status: 'completed',
            effectiveTo: nowIso,
            endedReason: 'Driver reassigned via Fleet Equipment Center',
            updatedAt: nowIso
          });
        } catch (e) {
          console.warn("Skipped updating old assignment record:", e);
        }
      }

      await updateDoc(doc(db, 'admins', company.id, 'trucks', quickEditTruck.id), {
        currentDriverId: newDriver ? newDriver.id : '',
        currentDriverName: newDriver ? newDriver.name : '',
        assignedDriverId: newDriver ? newDriver.id : '',
        assignmentStatus: newDriver ? 'assigned' : 'unassigned',
        operationalStatus: newDriver ? 'active' : 'available',
        updatedAt: nowIso
      });

      if (oldDriverId && oldDriverId !== quickDriverId) {
        try {
          await updateDoc(doc(db, 'admins', company.id, 'drivers', oldDriverId), {
            assignedTruck: '',
            truckNumber: '',
            currentTruckId: null,
            currentTruckNumber: null,
            updatedAt: nowIso
          });
          await updateDoc(doc(db, 'users', oldDriverId), {
            assignedTruck: '',
            truckNumber: '',
            currentTruckId: null,
            currentTruckNumber: null,
            updatedAt: nowIso
          });
        } catch (e) {
          console.warn("Old driver doc update skipped:", e);
        }
      }

      if (newDriver) {
        try {
          await updateDoc(doc(db, 'admins', company.id, 'drivers', newDriver.id), {
            assignedTruck: quickEditTruck.truckNumber,
            truckNumber: quickEditTruck.truckNumber,
            currentTruckId: quickEditTruck.id,
            currentTruckNumber: quickEditTruck.truckNumber,
            updatedAt: nowIso
          });
          await updateDoc(doc(db, 'users', newDriver.id), {
            assignedTruck: quickEditTruck.truckNumber,
            truckNumber: quickEditTruck.truckNumber,
            currentTruckId: quickEditTruck.id,
            currentTruckNumber: quickEditTruck.truckNumber,
            updatedAt: nowIso
          });
        } catch (e) {
          console.warn("New driver doc update skipped:", e);
        }

        const assignId = `asg_${Date.now()}`;
        await setDoc(doc(db, 'admins', company.id, 'truck_driver_assignments', assignId), {
          id: assignId,
          companyId: company.id,
          truckId: quickEditTruck.id,
          truckNumberSnapshot: quickEditTruck.truckNumber,
          driverId: newDriver.id,
          driverNameSnapshot: newDriver.name,
          effectiveFrom: nowIso,
          effectiveTo: null,
          status: 'active',
          notes: 'Updated via Quick Driver Assignment',
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }

      setActionMessage({
        type: 'success',
        text: newDriver
          ? `Assigned ${newDriver.name} to Power Unit ${quickEditTruck.truckNumber}.`
          : `Cleared assigned driver for Power Unit ${quickEditTruck.truckNumber}.`
      });
      setIsQuickEditDriverModalOpen(false);
      setQuickEditTruck(null);
    } catch (err: any) {
      console.error("Failed to update assigned driver:", err);
      setActionMessage({ type: 'error', text: err.message || "Failed to update assigned driver" });
    } finally {
      setActionLoading(false);
    }
  };

  // Archive / Unarchive Truck
  const handleToggleArchiveTruck = async (truck: Truck) => {
    if (!company?.id) return;
    setActionLoading(true);
    try {
      const willArchive = !truck.isArchived;
      await updateDoc(doc(db, 'admins', company.id, 'trucks', truck.id), {
        isArchived: willArchive,
        operationalStatus: willArchive ? 'out_of_service' : 'available',
        updatedAt: new Date().toISOString()
      });
      setActionMessage({
        type: 'success',
        text: willArchive
          ? `Power Unit ${truck.truckNumber} archived.`
          : `Power Unit ${truck.truckNumber} unarchived & restored to available.`
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Failed to archive power unit" });
    } finally {
      setActionLoading(false);
    }
  };

  // Archive / Unarchive Trailer
  const handleToggleArchiveTrailer = async (trailer: Trailer) => {
    if (!company?.id) return;
    setActionLoading(true);
    try {
      const willArchive = !trailer.isArchived;
      await updateDoc(doc(db, 'admins', company.id, 'trailers', trailer.id), {
        isArchived: willArchive,
        status: willArchive ? 'out_of_service' : 'available',
        updatedAt: new Date().toISOString()
      });
      setActionMessage({
        type: 'success',
        text: willArchive
          ? `Trailer ${trailer.unitNumber} archived.`
          : `Trailer ${trailer.unitNumber} unarchived & restored.`
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Failed to archive trailer" });
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Unit Permanently
  const handleConfirmDeleteUnit = async () => {
    if (!unitToDelete || !company?.id) return;
    setActionLoading(true);
    try {
      if (unitToDelete.type === 'truck') {
        await deleteDoc(doc(db, 'admins', company.id, 'trucks', unitToDelete.id));
      } else {
        await deleteDoc(doc(db, 'admins', company.id, 'trailers', unitToDelete.id));
      }
      setActionMessage({
        type: 'success',
        text: `Permanently deleted ${unitToDelete.type === 'truck' ? 'Power Unit' : 'Trailer'} ${unitToDelete.number}.`
      });
      setIsDeleteModalOpen(false);
      setUnitToDelete(null);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Failed to delete unit" });
    } finally {
      setActionLoading(false);
    }
  };

  // Handler to populate form for editing a truck
  const handleOpenEditTruck = (truck: Truck) => {
    setTruckForm({
      id: truck.id,
      truckNumber: truck.truckNumber || '',
      vin: truck.vin || '',
      licensePlate: truck.licensePlate || '',
      licensePlateState: truck.licensePlateState || '',
      make: truck.make || '',
      model: truck.model || '',
      year: truck.year || new Date().getFullYear().toString(),
      vehicleType: truck.vehicleType || 'tractor',
      ownershipType: truck.ownershipType || 'company_owned',
      operationalStatus: truck.operationalStatus || 'available',
      currentDriverId: truck.currentDriverId || '',
      currentDriverName: truck.currentDriverName || '',
      currentOdometerDecimal: truck.currentOdometerDecimal || 0,
      nextPmDueOdometerDecimal: truck.nextPmDueOdometerDecimal || 15000,
      pmIntervalMilesDecimal: truck.pmIntervalMilesDecimal || 15000,
      pmWarningMilesDecimal: truck.pmWarningMilesDecimal || 1000,
      pmDispatchPolicy: truck.pmDispatchPolicy || 'warning_only',
      annualInspectionExpiresAt: truck.annualInspectionExpiresAt || '',
      registrationExpiresAt: truck.registrationExpiresAt || ''
    });
    setIsAddTruckModalOpen(true);
  };

  // Action: Save / Create Truck
  const handleSaveTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckForm.truckNumber?.trim() || !company?.id) return;
    setActionLoading(true);
    setActionMessage(null);

    try {
      const truckId = truckForm.id || `truck_${Date.now()}`;
      const truckRef = doc(db, 'admins', company.id, 'trucks', truckId);
      const cleanUnitNumber = truckForm.truckNumber.trim();

      const payload: Partial<Truck> = {
        ...truckForm,
        id: truckId,
        companyId: company.id,
        truckNumber: cleanUnitNumber,
        vin: truckForm.vin || '',
        licensePlate: truckForm.licensePlate || '',
        licensePlateState: truckForm.licensePlateState || '',
        make: truckForm.make || '',
        model: truckForm.model || '',
        year: truckForm.year || '',
        vehicleType: truckForm.vehicleType || 'tractor',
        ownershipType: truckForm.ownershipType || 'company_owned',
        operationalStatus: truckForm.operationalStatus || 'available',
        currentOdometerDecimal: Number(truckForm.currentOdometerDecimal) || 0,
        nextPmDueOdometerDecimal: Number(truckForm.nextPmDueOdometerDecimal) || 15000,
        pmIntervalMilesDecimal: Number(truckForm.pmIntervalMilesDecimal) || 15000,
        pmWarningMilesDecimal: Number(truckForm.pmWarningMilesDecimal) || 1000,
        pmDispatchPolicy: truckForm.pmDispatchPolicy || 'warning_only',
        annualInspectionExpiresAt: truckForm.annualInspectionExpiresAt || '',
        registrationExpiresAt: truckForm.registrationExpiresAt || '',
        pmStatus: getPmStatus({
          currentOdometerDecimal: Number(truckForm.currentOdometerDecimal) || 0,
          nextPmDueOdometerDecimal: Number(truckForm.nextPmDueOdometerDecimal) || 15000,
          pmWarningMilesDecimal: Number(truckForm.pmWarningMilesDecimal) || 1000,
        } as Truck).status,
        updatedAt: new Date().toISOString(),
        updatedByUid: currentUserId
      };

      if (!truckForm.id) {
        payload.createdAt = new Date().toISOString();
        payload.createdByUid = currentUserId;
      }

      await setDoc(truckRef, payload, { merge: true });

      // If unit number changed and truck has an assigned driver, sync driver record
      if (truckForm.currentDriverId) {
        try {
          await updateDoc(doc(db, 'admins', company.id, 'drivers', truckForm.currentDriverId), {
            assignedTruck: cleanUnitNumber,
            truckNumber: cleanUnitNumber,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Driver record update failed:", e);
        }
      }

      // If detail drawer is open for this truck, update selectedTruck
      if (selectedTruck && selectedTruck.id === truckId) {
        setSelectedTruck({
          ...selectedTruck,
          ...payload as Truck
        });
      }

      setActionMessage({ type: 'success', text: `Power Unit ${cleanUnitNumber} details successfully updated.` });
      setIsAddTruckModalOpen(false);
      setTruckForm({
        truckNumber: '',
        vin: '',
        licensePlate: '',
        make: '',
        model: '',
        year: new Date().getFullYear().toString(),
        vehicleType: 'tractor',
        ownershipType: 'company_owned',
        operationalStatus: 'available',
        currentOdometerDecimal: 0,
        nextPmDueOdometerDecimal: 15000,
        pmIntervalMilesDecimal: 15000
      });
    } catch (err: any) {
      console.error("Failed to save truck:", err);
      setActionMessage({ type: 'error', text: err.message || "Failed to save truck" });
    } finally {
      setActionLoading(false);
    }
  };

  // Populate form for editing a trailer
  const handleOpenEditTrailer = (trailer: Trailer) => {
    setTrailerForm({
      id: trailer.id,
      unitNumber: trailer.unitNumber || '',
      vin: trailer.vin || '',
      licensePlate: trailer.licensePlate || '',
      licensePlateState: trailer.licensePlateState || '',
      type: trailer.type || 'dry_van',
      color: trailer.color || '',
      size: trailer.size || '53 ft',
      lengthFeet: trailer.lengthFeet || '53',
      widthInches: trailer.widthInches || '102',
      heightFeet: trailer.heightFeet || '13.5',
      isReefer: trailer.isReefer || (trailer.type === 'reefer'),
      reeferMakeModel: trailer.reeferMakeModel || '',
      reeferHours: trailer.reeferHours || 0,
      doorType: trailer.doorType || 'swing',
      floorType: trailer.floorType || 'wood',
      maxPayloadLbs: trailer.maxPayloadLbs || 45000,
      make: trailer.make || '',
      model: trailer.model || '',
      year: trailer.year || new Date().getFullYear().toString(),
      ownershipType: trailer.ownershipType || 'company_owned',
      status: trailer.status || 'available',
      annualInspectionExpiresAt: trailer.annualInspectionExpiresAt || '',
      registrationExpiresAt: trailer.registrationExpiresAt || '',
      notes: trailer.notes || ''
    });
    setIsAddTrailerModalOpen(true);
  };

  // Action: Save / Create / Update Trailer
  const handleSaveTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trailerForm.unitNumber?.trim() || !company?.id) return;
    setActionLoading(true);

    try {
      const trailerId = trailerForm.id || `tr_${Date.now()}`;
      const trailerRef = doc(db, 'admins', company.id, 'trailers', trailerId);
      const isReeferUnit = trailerForm.type === 'reefer' || Boolean(trailerForm.isReefer);

      const payload: Partial<Trailer> = {
        unitNumber: trailerForm.unitNumber.trim(),
        companyId: company.id,
        id: trailerId,
        vin: trailerForm.vin || '',
        licensePlate: trailerForm.licensePlate || '',
        licensePlateState: trailerForm.licensePlateState || '',
        type: trailerForm.type || 'dry_van',
        color: trailerForm.color || '',
        size: trailerForm.size || '',
        lengthFeet: trailerForm.lengthFeet || '',
        widthInches: trailerForm.widthInches || '',
        heightFeet: trailerForm.heightFeet || '',
        isReefer: isReeferUnit,
        reeferMakeModel: isReeferUnit ? (trailerForm.reeferMakeModel || '') : '',
        reeferHours: isReeferUnit ? Number(trailerForm.reeferHours || 0) : 0,
        doorType: trailerForm.doorType || 'swing',
        floorType: trailerForm.floorType || 'wood',
        maxPayloadLbs: Number(trailerForm.maxPayloadLbs || 0),
        make: trailerForm.make || '',
        model: trailerForm.model || '',
        year: trailerForm.year || '',
        ownershipType: trailerForm.ownershipType || 'company_owned',
        status: trailerForm.status || 'available',
        annualInspectionExpiresAt: trailerForm.annualInspectionExpiresAt || '',
        registrationExpiresAt: trailerForm.registrationExpiresAt || '',
        notes: trailerForm.notes || '',
        updatedAt: new Date().toISOString()
      };

      if (!trailerForm.id) {
        payload.createdAt = new Date().toISOString();
        payload.isArchived = false;
      }

      await setDoc(trailerRef, payload, { merge: true });

      if (selectedTrailer && selectedTrailer.id === trailerId) {
        setSelectedTrailer({ ...selectedTrailer, ...payload as Trailer });
      }

      setActionMessage({
        type: 'success',
        text: trailerForm.id
          ? `Trailer ${payload.unitNumber} details updated successfully.`
          : `New Commercial Trailer ${payload.unitNumber} added to registry.`
      });
      setIsAddTrailerModalOpen(false);
      setTrailerForm({
        unitNumber: '',
        vin: '',
        licensePlate: '',
        licensePlateState: '',
        type: 'dry_van',
        color: '',
        size: '53 ft',
        status: 'available'
      });
    } catch (err: any) {
      console.error("Failed to save trailer:", err);
      setActionMessage({ type: 'error', text: err.message || "Failed to save trailer" });
    } finally {
      setActionLoading(false);
    }
  };

  // Quick Trailer Driver Assignment Handler
  const handleSaveQuickTrailerDriverAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id || !quickEditTrailer) return;

    setActionLoading(true);
    try {
      const newDriver = users.find(u => u.id === quickTrailerDriverId && u.role === 'driver');

      // Complete previous active assignments for this trailer in the assignment history ledger
      const oldAsgs = assignments.filter(a => a.trailerId === quickEditTrailer.id && a.status === 'active');
      for (const oldAsg of oldAsgs) {
        await updateDoc(doc(db, 'admins', company.id, 'truck_driver_assignments', oldAsg.id), {
          status: 'completed',
          effectiveTo: new Date().toISOString(),
          endedReason: 'Trailer driver reassigned',
          updatedAt: new Date().toISOString()
        });
      }

      // Update trailer document with driver info
      await updateDoc(doc(db, 'admins', company.id, 'trailers', quickEditTrailer.id), {
        currentDriverId: newDriver ? newDriver.id : null,
        currentDriverName: newDriver ? newDriver.name : null,
        status: newDriver ? 'assigned' : 'available',
        updatedAt: new Date().toISOString()
      });

      if (newDriver) {
        // Sync driver profile
        try {
          await updateDoc(doc(db, 'admins', company.id, 'drivers', newDriver.id), {
            assignedTrailer: quickEditTrailer.unitNumber,
            trailerNumber: quickEditTrailer.unitNumber,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Driver record update warning:", e);
        }

        // Add record to truck_driver_assignments ledger
        const assignId = `asg_tr_${Date.now()}`;
        await setDoc(doc(db, 'admins', company.id, 'truck_driver_assignments', assignId), {
          id: assignId,
          companyId: company.id,
          equipmentType: 'trailer',
          trailerId: quickEditTrailer.id,
          trailerNumberSnapshot: quickEditTrailer.unitNumber,
          driverId: newDriver.id,
          driverNameSnapshot: newDriver.name,
          effectiveFrom: new Date().toISOString(),
          status: 'active',
          assignmentType: 'primary',
          source: 'manual',
          notes: 'Updated via Trailer Driver Assignment',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      setActionMessage({
        type: 'success',
        text: newDriver
          ? `Driver ${newDriver.name} assigned to Trailer ${quickEditTrailer.unitNumber}. Assignment history logged.`
          : `Cleared driver assignment for Trailer ${quickEditTrailer.unitNumber}.`
      });
      setIsQuickEditTrailerDriverModalOpen(false);
      setQuickEditTrailer(null);
    } catch (err: any) {
      console.error("Failed to update trailer driver assignment:", err);
      setActionMessage({ type: 'error', text: err.message || "Failed to update driver assignment" });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Assign Driver to Truck
  const handleAssignDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.truckId || !assignForm.driverId) return;
    setActionLoading(true);

    try {
      const selectedT = trucks.find(t => t.id === assignForm.truckId);
      const selectedD = drivers.find(d => d.id === assignForm.driverId);

      if (!selectedT || !selectedD) return;

      // 1. Create assignment ledger doc
      const assignId = `assign_${Date.now()}`;
      const assignRef = doc(db, 'admins', company.id, 'truck_driver_assignments', assignId);

      await setDoc(assignRef, {
        id: assignId,
        companyId: company.id,
        truckId: selectedT.id,
        truckNumberSnapshot: selectedT.truckNumber,
        vinSnapshot: selectedT.vin || '',
        driverId: selectedD.id,
        driverNameSnapshot: selectedD.name,
        assignmentType: 'primary',
        effectiveFrom: new Date().toISOString(),
        status: 'active',
        source: 'manual',
        notes: assignForm.notes,
        assignedByUid: currentUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 2. Update Truck record
      await updateDoc(doc(db, 'admins', company.id, 'trucks', selectedT.id), {
        currentDriverId: selectedD.id,
        currentDriverName: selectedD.name,
        assignedDriverId: selectedD.id,
        assignmentStatus: 'assigned',
        operationalStatus: selectedT.operationalStatus === 'available' ? 'active' : selectedT.operationalStatus,
        updatedAt: new Date().toISOString(),
        updatedByUid: currentUserId
      });

      // 3. Update User profile record (mirroring)
      await updateDoc(doc(db, 'users', selectedD.id), {
        currentTruckId: selectedT.id,
        currentTruckNumber: selectedT.truckNumber,
        currentTruckAssignmentId: assignId,
        currentTruckAssignedAt: new Date().toISOString()
      });

      // Also mirror in tenant driver directory if present
      try {
        await updateDoc(doc(db, 'admins', company.id, 'drivers', selectedD.id), {
          currentTruckId: selectedT.id,
          currentTruckNumber: selectedT.truckNumber
        });
      } catch (ignore) {}

      setActionMessage({ type: 'success', text: `Assigned Driver ${selectedD.name} to Unit ${selectedT.truckNumber}` });
      setIsAssignDriverModalOpen(false);
      setAssignForm({ truckId: '', driverId: '', notes: '' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Driver assignment failed" });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Update Odometer
  const handleUpdateOdometer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odometerForm.truckId || odometerForm.newOdometer <= 0) return;
    setActionLoading(true);

    try {
      const targetTruck = trucks.find(t => t.id === odometerForm.truckId);
      if (!targetTruck) return;

      const newOdometer = Number(odometerForm.newOdometer);
      const newPmObj = getPmStatus({
        ...targetTruck,
        currentOdometerDecimal: newOdometer
      });

      await updateDoc(doc(db, 'admins', company.id, 'trucks', targetTruck.id), {
        currentOdometerDecimal: newOdometer,
        currentOdometerRecordedAt: new Date().toISOString(),
        currentOdometerSource: odometerForm.source,
        currentOdometerVerificationStatus: 'verified',
        currentOdometerUpdatedByUid: currentUserId,
        pmStatus: newPmObj.status,
        updatedAt: new Date().toISOString()
      });

      // Add audit log
      await setDoc(doc(db, 'admins', company.id, 'audit_logs', `odo_${Date.now()}`), {
        companyId: company.id,
        action: 'odometer_updated',
        performedByUid: currentUserId,
        targetTruckId: targetTruck.id,
        previousOdometer: targetTruck.currentOdometerDecimal || 0,
        newOdometer: newOdometer,
        source: odometerForm.source,
        reason: odometerForm.reason || 'Manual Odometer Log',
        createdAt: new Date().toISOString()
      });

      setActionMessage({ type: 'success', text: `Updated Odometer for Unit ${targetTruck.truckNumber} to ${newOdometer.toLocaleString()} miles.` });
      setIsOdometerModalOpen(false);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Failed to update odometer" });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Record Completed PM Service
  const handleRecordPmService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pmForm.truckId || pmForm.serviceOdometer <= 0) return;
    setActionLoading(true);

    try {
      const targetTruck = trucks.find(t => t.id === pmForm.truckId);
      if (!targetTruck) return;

      const serviceOdo = Number(pmForm.serviceOdometer);
      const interval = targetTruck.pmIntervalMilesDecimal || 15000;
      const nextPmDue = serviceOdo + interval;

      const updatedOdometer = Math.max(targetTruck.currentOdometerDecimal || 0, serviceOdo);

      const newPmObj = getPmStatus({
        ...targetTruck,
        currentOdometerDecimal: updatedOdometer,
        nextPmDueOdometerDecimal: nextPmDue
      });

      await updateDoc(doc(db, 'admins', company.id, 'trucks', targetTruck.id), {
        currentOdometerDecimal: updatedOdometer,
        lastPmOdometerDecimal: serviceOdo,
        lastPmCompletedAt: pmForm.serviceDate || new Date().toISOString(),
        nextPmDueOdometerDecimal: nextPmDue,
        pmStatus: newPmObj.status,
        maintenanceStatus: 'none',
        updatedAt: new Date().toISOString()
      });

      // Save maintenance record doc
      await setDoc(doc(db, 'admins', company.id, 'maintenance_records', `maint_${Date.now()}`), {
        companyId: company.id,
        truckId: targetTruck.id,
        truckNumber: targetTruck.truckNumber,
        serviceType: 'preventive_maintenance',
        serviceOdometer: serviceOdo,
        serviceDate: pmForm.serviceDate,
        vendor: pmForm.vendor || 'Internal Shop',
        notes: pmForm.notes,
        completedByUid: currentUserId,
        createdAt: new Date().toISOString()
      });

      setActionMessage({ type: 'success', text: `Recorded PM Service for Unit ${targetTruck.truckNumber}. Next PM due at ${nextPmDue.toLocaleString()} miles.` });
      setIsRecordPmModalOpen(false);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || "Failed to record PM service" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={`p-4 md:p-6 space-y-6 ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'}`} id="fleet-equipment-hub">
      {/* Top Banner Header */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              <TruckIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold tracking-tight font-heading ${theme.headingText}`}>
                Fleet & Equipment Operations Center
              </h1>
              <p className={`text-xs md:text-sm ${theme.subText}`}>
                Authoritative power unit registry, trailer management, assignment ledgers, and PM schedule compliance.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncCentralizedFleet}
            disabled={syncingFleet}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 ${theme.btnSync}`}
            title="Reconcile driver profiles and active load power units with central fleet"
          >
            <RefreshCw className={`w-4 h-4 ${isLight ? 'text-emerald-700' : 'text-emerald-400'} ${syncingFleet ? 'animate-spin' : ''}`} />
            <span>{syncingFleet ? 'Syncing Fleet...' : 'Sync Centralized Fleet'}</span>
          </button>

          <button
            onClick={() => {
              setTruckForm({
                truckNumber: '',
                vin: '',
                licensePlate: '',
                make: '',
                model: '',
                year: new Date().getFullYear().toString(),
                vehicleType: 'tractor',
                ownershipType: 'company_owned',
                operationalStatus: 'available',
                currentOdometerDecimal: 0,
                nextPmDueOdometerDecimal: 15000,
                pmIntervalMilesDecimal: 15000,
                pmWarningMilesDecimal: 1000,
                pmDispatchPolicy: 'warning_only'
              });
              setIsAddTruckModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Power Unit</span>
          </button>

          <button
            onClick={() => setIsAddTrailerModalOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs rounded-xl transition cursor-pointer ${theme.btnSecondary}`}
          >
            <Container className={`w-4 h-4 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
            <span>Add Trailer</span>
          </button>

          <button
            onClick={() => setIsAssignDriverModalOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs rounded-xl transition cursor-pointer ${theme.btnSecondary}`}
          >
            <UserCheck className={`w-4 h-4 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
            <span>Assign Driver</span>
          </button>
        </div>
      </div>

      {/* Global Action Message Feedback */}
      {actionMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
          actionMessage.type === 'success'
            ? isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs' : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
            : isLight ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-xs' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' 
              ? <CheckCircle2 className={`w-4 h-4 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} /> 
              : <AlertTriangle className={`w-4 h-4 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className={isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fleet Dashboard Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className={`p-3.5 rounded-xl space-y-1 transition ${theme.cardBg}`}>
          <div className={`flex items-center justify-between text-xs ${theme.subText}`}>
            <span>Total Trucks</span>
            <TruckIcon className={`w-4 h-4 ${theme.subText}`} />
          </div>
          <div className={`text-xl font-bold ${theme.headingText}`}>{totalPowerUnits}</div>
          <div className={`text-[11px] ${theme.mutedText} font-mono`}>Central Power Units</div>
        </div>

        <div className={`p-3.5 rounded-xl space-y-1 transition ${
          isLight ? 'bg-emerald-50/90 border border-emerald-200/80 shadow-xs text-emerald-900' : 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isLight ? 'text-emerald-800 font-semibold' : 'text-emerald-400'}`}>
            <span>Active / On Road</span>
            <CheckCircle2 className={`w-4 h-4 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
          </div>
          <div className={`text-xl font-bold ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>{activePowerUnits}</div>
          <div className={`text-[11px] font-mono ${isLight ? 'text-emerald-700' : 'text-emerald-500/80'}`}>{availablePowerUnits} unassigned</div>
        </div>

        <div className={`p-3.5 rounded-xl space-y-1 transition ${
          isLight ? 'bg-amber-50/90 border border-amber-200/80 shadow-xs text-amber-900' : 'bg-amber-950/30 border border-amber-800/40 text-amber-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isLight ? 'text-amber-800 font-semibold' : 'text-amber-400'}`}>
            <span>Maintenance</span>
            <Wrench className={`w-4 h-4 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
          </div>
          <div className={`text-xl font-bold ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>{maintenancePowerUnits}</div>
          <div className={`text-[11px] font-mono ${isLight ? 'text-amber-700' : 'text-amber-500/80'}`}>In service bay</div>
        </div>

        <div className={`p-3.5 rounded-xl space-y-1 transition ${
          isLight ? 'bg-rose-50/90 border border-rose-200/80 shadow-xs text-rose-900' : 'bg-rose-950/30 border border-rose-800/40 text-rose-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isLight ? 'text-rose-800 font-semibold' : 'text-rose-400'}`}>
            <span>Out of Service</span>
            <XCircle className={`w-4 h-4 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />
          </div>
          <div className={`text-xl font-bold ${isLight ? 'text-rose-800' : 'text-rose-200'}`}>{outOfServicePowerUnits}</div>
          <div className={`text-[11px] font-mono ${isLight ? 'text-rose-700' : 'text-rose-500/80'}`}>Dispatch Blocked</div>
        </div>

        <div className={`p-3.5 rounded-xl space-y-1 transition ${
          isLight ? 'bg-cyan-50/90 border border-cyan-200/80 shadow-xs text-cyan-900' : 'bg-cyan-950/30 border border-cyan-800/40 text-cyan-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isLight ? 'text-cyan-800 font-semibold' : 'text-cyan-400'}`}>
            <span>PM Approaching / Due</span>
            <Gauge className={`w-4 h-4 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
          </div>
          <div className={`text-xl font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-200'}`}>
            {pmApproachingCount + pmDueOrOverdueCount}
          </div>
          <div className={`text-[11px] font-mono ${isLight ? 'text-cyan-700' : 'text-cyan-500/80'}`}>{pmDueOrOverdueCount} due/overdue</div>
        </div>

        <div className={`p-3.5 rounded-xl space-y-1 transition ${
          isLight ? 'bg-purple-50/90 border border-purple-200/80 shadow-xs text-purple-900' : 'bg-purple-950/30 border border-purple-800/40 text-purple-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isLight ? 'text-purple-800 font-semibold' : 'text-purple-400'}`}>
            <span>Active Trailers</span>
            <Container className={`w-4 h-4 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
          </div>
          <div className={`text-xl font-bold ${isLight ? 'text-purple-800' : 'text-purple-200'}`}>{totalTrailers}</div>
          <div className={`text-[11px] font-mono ${isLight ? 'text-purple-700' : 'text-purple-500/80'}`}>{availableTrailers} available</div>
        </div>
      </div>

      {/* Main Section Navigation Tabs */}
      <div className={`border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'power_units', label: 'Power Units (Trucks)', icon: TruckIcon, count: totalPowerUnits },
            { id: 'trailers', label: 'Trailers Registry', icon: Container, count: totalTrailers },
            { id: 'assignments', label: 'Driver & Owner Assignments', icon: UserCheck, count: assignments.length },
            { id: 'maintenance', label: 'Preventive Maintenance', icon: Gauge, alert: pmDueOrOverdueCount > 0 },
            { id: 'documents', label: 'Documents & Compliance', icon: ShieldCheck },
            { id: 'fuel_performance', label: 'Fuel & Mileage Performance', icon: Fuel }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-medium transition cursor-pointer border-b-2 whitespace-nowrap ${
                  isActive
                    ? isLight 
                      ? 'border-emerald-600 bg-white text-emerald-800 font-bold shadow-xs' 
                      : 'border-emerald-500 bg-slate-900 text-emerald-400 font-semibold'
                    : isLight
                      ? 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${
                  isActive 
                    ? isLight ? 'text-emerald-700' : 'text-emerald-400' 
                    : isLight ? 'text-slate-500' : 'text-slate-400'
                }`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isActive 
                      ? isLight ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-emerald-500/20 text-emerald-300' 
                      : isLight ? 'bg-slate-200 text-slate-700 font-medium' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {tab.alert && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: POWER UNITS (TRUCKS) TABLE */}
      {activeTab === 'power_units' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <TableSearchBar
            placeholder="Search unit #, VIN, plate, driver, make/model..."
            value={searchTermPowerUnits || searchTerm}
            onChange={(val) => {
              setSearchTermPowerUnits(val);
              setSearchTerm(val);
              setPagePowerUnits(1);
            }}
            showingText={`Showing ${filteredTrucks.length} of ${trucks.length} active power units`}
            theme={theme}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className={`flex items-center gap-1.5 ${theme.monoLabel}`}>
                <Filter className="w-3.5 h-3.5" />
                <span>Status:</span>
              </div>
              <select
                value={operationalFilter}
                onChange={e => {
                  setOperationalFilter(e.target.value);
                  setPagePowerUnits(1);
                }}
                className={`rounded-lg px-2.5 py-1 ${theme.inputBg}`}
              >
                <option value="all">All Operational Statuses</option>
                <option value="active">Active / On Road</option>
                <option value="available">Available / Unassigned</option>
                <option value="maintenance">In Maintenance</option>
                <option value="out_of_service">Out of Service</option>
              </select>

              <select
                value={pmFilter}
                onChange={e => {
                  setPmFilter(e.target.value);
                  setPagePowerUnits(1);
                }}
                className={`rounded-lg px-2.5 py-1 ${theme.inputBg}`}
              >
                <option value="all">All PM Statuses</option>
                <option value="current">PM Current</option>
                <option value="approaching_due">PM Approaching Due</option>
                <option value="due">PM Due</option>
                <option value="overdue">PM Overdue</option>
              </select>

              <select
                value={ownershipFilter}
                onChange={e => {
                  setOwnershipFilter(e.target.value);
                  setPagePowerUnits(1);
                }}
                className={`rounded-lg px-2.5 py-1 ${theme.inputBg}`}
              >
                <option value="all">All Ownership Types</option>
                <option value="company_owned">Company Owned</option>
                <option value="owner_operator">Owner Operator</option>
                <option value="leased">Leased</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setShowArchivedUnits(!showArchivedUnits);
                  setPagePowerUnits(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 border transition cursor-pointer ${
                  showArchivedUnits
                    ? isLight ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    : theme.inputBg
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{showArchivedUnits ? 'Showing Archived' : 'Show Archived'}</span>
              </button>
            </div>
          </TableSearchBar>

          {/* Trucks Table */}
          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={theme.tableHeader}>
                    <th className="py-3 px-4">Unit Number</th>
                    <th className="py-3 px-4">Vehicle Specs</th>
                    <th className="py-3 px-4">VIN / Plate</th>
                    <th className="py-3 px-4">Ownership</th>
                    <th className="py-3 px-4">Assigned Driver</th>
                    <th className="py-3 px-4">Active Load</th>
                    <th className="py-3 px-4">Odometer & PM</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${theme.tableDivide}`}>
                  {paginatedTrucks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={`py-8 text-center ${theme.subText}`}>
                        {loading ? 'Loading power units from database...' : 'No power units match the specified filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedTrucks.map(truck => {
                      const pmObj = getPmStatus(truck);
                      const opStatus = truck.operationalStatus || truck.status || 'available';
                      const activeLoad = getActiveLoadForTruck(truck, loads, drivers);

                      return (
                        <tr
                          key={truck.id}
                          className={`${theme.tableRowHover} transition cursor-pointer`}
                          onClick={() => {
                            setSelectedTruck(truck);
                            setIsDetailDrawerOpen(true);
                          }}
                        >
                          <td className={`py-3 px-4 font-mono font-bold ${theme.textEmerald}`}>
                            {truck.truckNumber}
                          </td>
                          <td className={`py-3 px-4 ${isLight ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                            <div>{truck.year || ''} {truck.make || truck.makeModel || 'N/A'} {truck.model || ''}</div>
                            <div className={`text-[10px] capitalize ${isLight ? 'text-slate-500 font-medium' : 'text-slate-500'}`}>{truck.vehicleType || 'Tractor'}</div>
                          </td>
                          <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                            <div className="truncate max-w-[120px]">{truck.vin || 'No VIN'}</div>
                            <div className={`text-[10px] ${isLight ? 'text-slate-500 font-medium' : 'text-slate-500'}`}>{truck.licensePlate ? `${truck.licensePlate} (${truck.licensePlateState || ''})` : 'No Plate'}</div>
                          </td>
                          <td className={`py-3 px-4 capitalize ${isLight ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                            <div>{(truck.ownershipType || 'company_owned').replace('_', ' ')}</div>
                            {truck.currentOwnerOperatorCompanyId && (
                              <div className={`text-[10px] font-mono ${isLight ? 'text-purple-800 font-bold' : 'text-purple-400'}`}>
                                Owner Op Linked
                              </div>
                            )}
                          </td>
                          <td className={`py-3 px-4 ${isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-medium'}`}>
                            {truck.currentDriverName ? (
                              <div className="flex items-center gap-1.5">
                                <User className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                                <span>{truck.currentDriverName}</span>
                              </div>
                            ) : (
                              <span className={`italic ${isLight ? 'text-slate-400 font-normal' : 'text-slate-500'}`}>Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {activeLoad ? (
                              <div className={`font-mono text-[11px] ${isLight ? 'text-cyan-800 font-bold' : 'text-cyan-400'}`}>
                                #{activeLoad.loadNumber} ({activeLoad.status})
                              </div>
                            ) : (
                              <span className={`text-[11px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                              {(truck.currentOdometerDecimal || 0).toLocaleString()} mi
                            </div>
                            <div className={`text-[10px] ${
                              pmObj.status === 'overdue' ? (isLight ? 'text-rose-800 font-bold' : 'text-rose-400 font-bold') :
                              pmObj.status === 'due' ? (isLight ? 'text-amber-800 font-bold' : 'text-amber-400 font-bold') :
                              pmObj.status === 'approaching_due' ? (isLight ? 'text-cyan-800 font-semibold' : 'text-cyan-400') : (isLight ? 'text-slate-600' : 'text-slate-500')
                            }`}>
                              PM: {pmObj.status.replace('_', ' ')} ({pmObj.milesRemaining.toLocaleString()} mi)
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                              opStatus === 'active' ? theme.badgeActive :
                              opStatus === 'maintenance' ? theme.badgeMaintenance :
                              opStatus === 'out_of_service' ? theme.badgeOutOfService :
                              theme.badgeDefault
                            }`}>
                              {opStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedTruck(truck);
                                  setIsDetailDrawerOpen(true);
                                }}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${theme.btnSecondary}`}
                                title="View Details & Specs"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => handleOpenEditTruck(truck)}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                  isLight ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-emerald-950/70 hover:bg-emerald-900 border-emerald-500/30 text-emerald-300'
                                }`}
                                title="Edit Unit Number & Power Unit Specs"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenQuickEditDriver(truck)}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                  isLight ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800' : 'bg-cyan-950/70 hover:bg-cyan-900 border-cyan-500/30 text-cyan-300'
                                }`}
                                title="Edit Assigned Driver"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setHistoryUnit({ id: truck.id, number: truck.truckNumber, type: 'truck' });
                                  setIsHistoryModalOpen(true);
                                }}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${theme.btnSecondary}`}
                                title="Unit Assignment History"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleArchiveTruck(truck)}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                  truck.isArchived
                                    ? isLight ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' : 'bg-amber-950/70 hover:bg-amber-900 border-amber-500/40 text-amber-300'
                                    : theme.btnSecondary
                                }`}
                                title={truck.isArchived ? "Unarchive Power Unit" : "Archive Power Unit"}
                              >
                                {truck.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => {
                                  setUnitToDelete({ id: truck.id, number: truck.truckNumber, type: 'truck' });
                                  setIsDeleteModalOpen(true);
                                }}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                  isLight ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-800' : 'bg-rose-950/70 hover:bg-rose-900 border-rose-500/30 text-rose-300'
                                }`}
                                title="Delete Power Unit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePaginationBar
              currentPage={pagePowerUnits}
              totalItems={filteredTrucks.length}
              rowsPerPage={rowsPerPagePowerUnits}
              itemLabel="power units"
              onPageChange={setPagePowerUnits}
              onRowsPerPageChange={setRowsPerPagePowerUnits}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* TAB 2: TRAILERS REGISTRY */}
      {activeTab === 'trailers' && (
        <div className="space-y-4">
          <TableSearchBar
            placeholder="Search trailer unit #, VIN, plate, driver, color, type, make/model..."
            value={searchTermTrailers}
            onChange={(val) => {
              setSearchTermTrailers(val);
              setPageTrailers(1);
            }}
            showingText={`Showing ${filteredTrailers.length} of ${trailers.length} registered trailers`}
            theme={theme}
          >
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setShowArchivedUnits(!showArchivedUnits);
                  setPageTrailers(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 border transition cursor-pointer ${
                  showArchivedUnits
                    ? isLight ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    : theme.inputBg
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{showArchivedUnits ? 'Showing Archived' : 'Show Archived'}</span>
              </button>
              <button
                onClick={() => {
                  setTrailerForm({
                    unitNumber: '',
                    vin: '',
                    licensePlate: '',
                    licensePlateState: '',
                    type: 'dry_van',
                    color: '',
                    size: '53 ft',
                    lengthFeet: '53',
                    widthInches: '102',
                    heightFeet: '13.5',
                    isReefer: false,
                    reeferMakeModel: '',
                    reeferHours: 0,
                    doorType: 'swing',
                    floorType: 'wood',
                    maxPayloadLbs: 45000,
                    make: '',
                    model: '',
                    year: new Date().getFullYear().toString(),
                    ownershipType: 'company_owned',
                    status: 'available',
                    annualInspectionExpiresAt: '',
                    registrationExpiresAt: '',
                    notes: ''
                  });
                  setIsAddTrailerModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Trailer Unit</span>
              </button>
            </div>
          </TableSearchBar>

          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={theme.tableHeader}>
                  <th className="py-3 px-4">Trailer Unit</th>
                  <th className="py-3 px-4">Type & Details</th>
                  <th className="py-3 px-4">Specs & Capacity</th>
                  <th className="py-3 px-4">VIN & Registration</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Power Unit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme.tableDivide}`}>
                {paginatedTrailers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`py-6 text-center ${theme.subText}`}>
                      No commercial trailers match the current filter.
                    </td>
                  </tr>
                ) : (
                  paginatedTrailers.map(trailer => (
                    <tr
                      key={trailer.id}
                      className={`${theme.tableRowHover} transition cursor-pointer`}
                      onClick={() => {
                        setSelectedTrailer(trailer);
                        setIsTrailerDetailDrawerOpen(true);
                      }}
                    >
                      <td className={`py-3 px-4 font-mono font-bold ${theme.textPurple}`}>
                        <div className="flex items-center gap-1.5">
                          <Container className="w-4 h-4 text-purple-500 shrink-0" />
                          <span>{trailer.unitNumber}</span>
                        </div>
                        {trailer.color && (
                          <div className={`text-[10px] font-normal flex items-center gap-1 mt-0.5 ${theme.subText}`}>
                            <span className="w-2 h-2 rounded-full border" style={{ backgroundColor: trailer.color.toLowerCase() }} />
                            <span>{trailer.color}</span>
                          </div>
                        )}
                      </td>
                      <td className={`py-3 px-4 capitalize ${isLight ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                        <div className="font-semibold">{(trailer.type || 'dry_van').replace('_', ' ')}</div>
                        {trailer.size && <div className={`text-[10px] font-mono ${theme.subText}`}>Size: {trailer.size}</div>}
                        {(trailer.type === 'reefer' || trailer.isReefer) && trailer.reeferMakeModel && (
                          <div className="text-[10px] text-cyan-600 font-mono flex items-center gap-1 mt-0.5">
                            <Thermometer className="w-3 h-3" />
                            <span>{trailer.reeferMakeModel} ({trailer.reeferHours || 0} hrs)</span>
                          </div>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-[11px] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        <div>{trailer.doorType ? `${trailer.doorType.replace('_', ' ')} doors` : 'Swing doors'}, {trailer.floorType ? `${trailer.floorType} floor` : 'Wood floor'}</div>
                        {trailer.maxPayloadLbs ? (
                          <div className={`text-[10px] font-mono ${theme.subText}`}>
                            Max Payload: {trailer.maxPayloadLbs.toLocaleString()} lbs
                          </div>
                        ) : null}
                      </td>
                      <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                        <div className="truncate max-w-[120px]">{trailer.vin || 'N/A'}</div>
                        <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                          {trailer.licensePlate ? `${trailer.licensePlate} (${trailer.licensePlateState || ''})` : 'No Plate'}
                        </div>
                      </td>
                      <td className={`py-3 px-4 ${isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-medium'}`} onClick={e => e.stopPropagation()}>
                        {trailer.currentDriverName ? (
                          <div className="flex items-center gap-1.5">
                            <User className={`w-3.5 h-3.5 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
                            <span>{trailer.currentDriverName}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setQuickEditTrailer(trailer);
                              setQuickTrailerDriverId('');
                              setIsQuickEditTrailerDriverModalOpen(true);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium border border-dashed transition cursor-pointer hover:border-purple-400 ${
                              isLight ? 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-300' : 'text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 border-purple-500/50'
                            }`}
                          >
                            + Assign Driver
                          </button>
                        )}
                      </td>
                      <td className={`py-3 px-4 font-mono ${theme.textEmerald}`}>
                        {trailer.currentTruckNumber ? `Unit ${trailer.currentTruckNumber}` : 'Uncoupled'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                          trailer.status === 'assigned' ? 'bg-purple-100 border-purple-300 text-purple-900 font-semibold' :
                          trailer.status === 'available' ? theme.badgeActive : theme.badgeDefault
                        }`}>
                          {trailer.status || 'available'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedTrailer(trailer);
                              setIsTrailerDetailDrawerOpen(true);
                            }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${theme.btnSecondary}`}
                            title="View Trailer Specs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditTrailer(trailer)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isLight ? 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800' : 'bg-purple-950/70 hover:bg-purple-900 border-purple-500/30 text-purple-300'
                            }`}
                            title="Edit Trailer Details & Specs"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setQuickEditTrailer(trailer);
                              setQuickTrailerDriverId(trailer.currentDriverId || '');
                              setIsQuickEditTrailerDriverModalOpen(true);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isLight ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800' : 'bg-cyan-950/70 hover:bg-cyan-900 border-cyan-500/30 text-cyan-300'
                            }`}
                            title="Assign or Change Driver"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setHistoryUnit({ id: trailer.id, number: trailer.unitNumber, type: 'trailer' });
                              setIsHistoryModalOpen(true);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${theme.btnSecondary}`}
                            title="Trailer Driver Assignment History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleArchiveTrailer(trailer)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              trailer.isArchived
                                ? isLight ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' : 'bg-amber-950/70 hover:bg-amber-900 border-amber-500/40 text-amber-300'
                                : theme.btnSecondary
                            }`}
                            title={trailer.isArchived ? "Unarchive Trailer" : "Archive Trailer"}
                          >
                            {trailer.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => {
                              setUnitToDelete({ id: trailer.id, number: trailer.unitNumber, type: 'trailer' });
                              setIsDeleteModalOpen(true);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isLight ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-800' : 'bg-rose-950/70 hover:bg-rose-900 border-rose-500/30 text-rose-300'
                            }`}
                            title="Delete Trailer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <TablePaginationBar
              currentPage={pageTrailers}
              totalItems={filteredTrailers.length}
              rowsPerPage={rowsPerPageTrailers}
              itemLabel="trailers"
              onPageChange={setPageTrailers}
              onRowsPerPageChange={setRowsPerPageTrailers}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* TAB 3: ASSIGNMENTS LEDGER */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <TableSearchBar
            placeholder="Search unit #, driver name, assignment status, notes..."
            value={searchTermAssignments}
            onChange={(val) => {
              setSearchTermAssignments(val);
              setPageAssignments(1);
            }}
            showingText={`Showing ${filteredAssignments.length} of ${assignments.length} assignment records`}
            theme={theme}
          >
            <button
              onClick={() => setIsAssignDriverModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition cursor-pointer ml-auto"
            >
              <UserCheck className="w-4 h-4" />
              <span>Assign Truck Driver</span>
            </button>
          </TableSearchBar>

          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={theme.tableHeader}>
                  <th className="py-3 px-4">Equipment Type</th>
                  <th className="py-3 px-4">Equipment Unit</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Effective From</th>
                  <th className="py-3 px-4">Effective To</th>
                  <th className="py-3 px-4">Assignment Status</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme.tableDivide}`}>
                {paginatedAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`py-6 text-center ${theme.subText}`}>
                      No assignment records found in the ledger.
                    </td>
                  </tr>
                ) : (
                  paginatedAssignments.map(asg => {
                    const isTrailerAsg = asg.equipmentType === 'trailer' || Boolean(asg.trailerId);
                    const unitLabel = isTrailerAsg
                      ? `Trailer ${asg.trailerNumberSnapshot || 'N/A'}`
                      : `Unit ${asg.truckNumberSnapshot || 'N/A'}`;

                    return (
                      <tr key={asg.id} className={`${theme.tableRowHover} transition`}>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            isTrailerAsg
                              ? 'bg-purple-100 border-purple-300 text-purple-900'
                              : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                          }`}>
                            {isTrailerAsg ? 'Trailer' : 'Power Unit'}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-mono font-bold ${isTrailerAsg ? theme.textPurple : theme.textEmerald}`}>
                          {unitLabel}
                        </td>
                        <td className={`py-3 px-4 ${isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-medium'}`}>
                          {asg.driverNameSnapshot}
                        </td>
                        <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {asg.effectiveFrom ? new Date(asg.effectiveFrom).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {asg.effectiveTo ? new Date(asg.effectiveTo).toLocaleDateString() : 'Active (Ongoing)'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                            asg.status === 'active' ? theme.badgeActive : theme.badgeDefault
                          }`}>
                            {asg.status}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-[11px] ${theme.subText}`}>
                          {asg.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <TablePaginationBar
              currentPage={pageAssignments}
              totalItems={filteredAssignments.length}
              rowsPerPage={rowsPerPageAssignments}
              itemLabel="assignment records"
              onPageChange={setPageAssignments}
              onRowsPerPageChange={setRowsPerPageAssignments}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* TAB 4: PREVENTIVE MAINTENANCE & ODOMETER MANAGER */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <TableSearchBar
            placeholder="Search unit #, PM status, dispatch policy, driver..."
            value={searchTermMaintenance}
            onChange={(val) => {
              setSearchTermMaintenance(val);
              setPageMaintenance(1);
            }}
            showingText={`Showing ${filteredMaintenanceTrucks.length} of ${trucks.length} PM records`}
            theme={theme}
          >
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setIsOdometerModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold text-xs rounded-xl transition cursor-pointer ${theme.btnSecondary}`}
              >
                <Gauge className={`w-4 h-4 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
                <span>Log Odometer</span>
              </button>
              <button
                onClick={() => setIsRecordPmModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                <span>Record PM Completion</span>
              </button>
            </div>
          </TableSearchBar>

          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={theme.tableHeader}>
                  <th className="py-3 px-4">Power Unit</th>
                  <th className="py-3 px-4">Current Odometer</th>
                  <th className="py-3 px-4">Last PM Odometer</th>
                  <th className="py-3 px-4">Next PM Due</th>
                  <th className="py-3 px-4">Miles Remaining</th>
                  <th className="py-3 px-4">PM Status</th>
                  <th className="py-3 px-4">Dispatch Policy</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme.tableDivide}`}>
                {paginatedMaintenanceTrucks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`py-6 text-center ${theme.subText}`}>
                      No preventive maintenance records match current filter.
                    </td>
                  </tr>
                ) : (
                  paginatedMaintenanceTrucks.map(truck => {
                    const pmObj = getPmStatus(truck);
                    return (
                      <tr key={truck.id} className={`${theme.tableRowHover} transition`}>
                        <td className={`py-3 px-4 font-mono font-bold ${theme.textEmerald}`}>
                          Unit {truck.truckNumber}
                        </td>
                        <td className={`py-3 px-4 font-mono font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          {(truck.currentOdometerDecimal || 0).toLocaleString()} mi
                        </td>
                        <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {truck.lastPmOdometerDecimal ? `${truck.lastPmOdometerDecimal.toLocaleString()} mi` : 'N/A'}
                        </td>
                        <td className={`py-3 px-4 font-mono ${theme.textCyan}`}>
                          {truck.nextPmDueOdometerDecimal ? `${truck.nextPmDueOdometerDecimal.toLocaleString()} mi` : 'Not Set'}
                        </td>
                        <td className={`py-3 px-4 font-mono font-bold ${
                          pmObj.milesRemaining < 0 ? (isLight ? 'text-rose-800' : 'text-rose-400') :
                          pmObj.milesRemaining < 1000 ? (isLight ? 'text-amber-800' : 'text-amber-400') : (isLight ? 'text-emerald-800' : 'text-emerald-400')
                        }`}>
                          {pmObj.milesRemaining.toLocaleString()} mi
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                            pmObj.status === 'overdue' ? theme.badgeOutOfService :
                            pmObj.status === 'due' ? theme.badgeMaintenance :
                            pmObj.status === 'approaching_due' ? (isLight ? 'bg-cyan-100 border-cyan-300 text-cyan-800 font-semibold' : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300') :
                            theme.badgeActive
                          }`}>
                            {pmObj.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-mono text-[11px] uppercase ${theme.subText}`}>
                          {truck.pmDispatchPolicy || 'warning_only'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setPmForm(p => ({ ...p, truckId: truck.id, serviceOdometer: truck.currentOdometerDecimal || 0 }));
                              setIsRecordPmModalOpen(true);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${theme.btnSecondary}`}
                          >
                            Complete PM
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <TablePaginationBar
              currentPage={pageMaintenance}
              totalItems={filteredMaintenanceTrucks.length}
              rowsPerPage={rowsPerPageMaintenance}
              itemLabel="PM records"
              onPageChange={setPageMaintenance}
              onRowsPerPageChange={setRowsPerPageMaintenance}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* TAB 5: DOCUMENTS & VEHICLE COMPLIANCE */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <TableSearchBar
            placeholder="Search unit #, compliance status, driver..."
            value={searchTermDocuments}
            onChange={(val) => {
              setSearchTermDocuments(val);
              setPageDocuments(1);
            }}
            showingText={`Showing ${filteredComplianceTrucks.length} of ${trucks.length} compliance records`}
            theme={theme}
          />

          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={theme.tableHeader}>
                  <th className="py-3 px-4">Power Unit</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Annual DOT Inspection</th>
                  <th className="py-3 px-4">State Registration</th>
                  <th className="py-3 px-4">Overall Compliance Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme.tableDivide}`}>
                {paginatedComplianceTrucks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`py-6 text-center ${theme.subText}`}>
                      No vehicle compliance records match current filter.
                    </td>
                  </tr>
                ) : (
                  paginatedComplianceTrucks.map(truck => (
                    <tr key={truck.id} className={`${theme.tableRowHover} transition`}>
                      <td className={`py-3 px-4 font-mono font-bold ${theme.textEmerald}`}>
                        Unit {truck.truckNumber}
                      </td>
                      <td className={`py-3 px-4 font-medium ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                        {truck.currentDriverName || 'Unassigned'}
                      </td>
                      <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                        {truck.annualInspectionExpiresAt ? new Date(truck.annualInspectionExpiresAt).toLocaleDateString() : 'Missing Record'}
                      </td>
                      <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                        {truck.registrationExpiresAt ? new Date(truck.registrationExpiresAt).toLocaleDateString() : 'Missing Record'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${theme.badgeActive}`}>
                          {truck.complianceStatus || 'Compliant'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <TablePaginationBar
              currentPage={pageDocuments}
              totalItems={filteredComplianceTrucks.length}
              rowsPerPage={rowsPerPageDocuments}
              itemLabel="compliance records"
              onPageChange={setPageDocuments}
              onRowsPerPageChange={setRowsPerPageDocuments}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* TAB 6: FUEL & MILEAGE PERFORMANCE */}
      {activeTab === 'fuel_performance' && (
        <div className="space-y-4">
          <TableSearchBar
            placeholder="Search unit #, VIN, make/model, driver..."
            value={searchTermFuel}
            onChange={(val) => {
              setSearchTermFuel(val);
              setPageFuel(1);
            }}
            showingText={`Showing ${filteredFuelTrucks.length} of ${trucks.length} fuel performance records`}
            theme={theme}
          />

          <div className={`rounded-xl overflow-hidden ${theme.tableWrapper}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={theme.tableHeader}>
                  <th className="py-3 px-4">Power Unit</th>
                  <th className="py-3 px-4">Vehicle Specs</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Current Odometer</th>
                  <th className="py-3 px-4">Fuel Capacity</th>
                  <th className="py-3 px-4">Est. MPG</th>
                  <th className="py-3 px-4">IFTA Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme.tableDivide}`}>
                {paginatedFuelTrucks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`py-6 text-center ${theme.subText}`}>
                      No fuel performance records match current filter.
                    </td>
                  </tr>
                ) : (
                  paginatedFuelTrucks.map(truck => (
                    <tr key={truck.id} className={`${theme.tableRowHover} transition`}>
                      <td className={`py-3 px-4 font-mono font-bold ${theme.textEmerald}`}>
                        Unit {truck.truckNumber}
                      </td>
                      <td className={`py-3 px-4 ${isLight ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                        {truck.year || ''} {truck.make || truck.makeModel || 'N/A'} {truck.model || ''}
                      </td>
                      <td className={`py-3 px-4 font-medium ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                        {truck.currentDriverName || 'Unassigned'}
                      </td>
                      <td className={`py-3 px-4 font-mono font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                        {(truck.currentOdometerDecimal || 0).toLocaleString()} mi
                      </td>
                      <td className={`py-3 px-4 font-mono ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        120 gal
                      </td>
                      <td className={`py-3 px-4 font-mono font-bold text-amber-600`}>
                        6.8 MPG
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${theme.badgeActive}`}>
                          Tracked
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <TablePaginationBar
              currentPage={pageFuel}
              totalItems={filteredFuelTrucks.length}
              rowsPerPage={rowsPerPageFuel}
              itemLabel="fuel performance records"
              onPageChange={setPageFuel}
              onRowsPerPageChange={setRowsPerPageFuel}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* SLIDE-OVER TRUCK DETAIL DRAWER */}
      {isDetailDrawerOpen && selectedTruck && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-xl ${theme.modalBg} border-l h-full overflow-y-auto p-6 space-y-6 shadow-2xl`}>
            {/* Drawer Header */}
            <div className={`flex items-center justify-between border-b pb-4 ${theme.modalBorder}`}>
              <div>
                <div className={`text-xs font-mono font-bold ${theme.textEmerald}`}>POWER UNIT PROFILE</div>
                <h2 className={`text-xl font-bold font-heading flex items-center gap-3 ${theme.headingText}`}>
                  <span>Unit {selectedTruck.truckNumber}</span>
                  <button
                    onClick={() => handleOpenEditTruck(selectedTruck)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="Edit Unit Number & Power Unit Specifications"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Unit</span>
                  </button>
                </h2>
              </div>
              <button
                onClick={() => setIsDetailDrawerOpen(false)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${theme.btnSecondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Specs Grid */}
            <div className={`grid grid-cols-2 gap-3 p-4 border rounded-xl font-mono text-xs ${theme.barBg}`}>
              <div>
                <span className={theme.subText}>Unit Number:</span>
                <div className={`font-bold ${theme.textEmerald}`}>{selectedTruck.truckNumber}</div>
              </div>
              <div>
                <span className={theme.subText}>VIN:</span>
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{selectedTruck.vin || 'N/A'}</div>
              </div>
              <div>
                <span className={theme.subText}>License Plate:</span>
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {selectedTruck.licensePlate ? `${selectedTruck.licensePlate} (${selectedTruck.licensePlateState || ''})` : 'N/A'}
                </div>
              </div>
              <div>
                <span className={theme.subText}>Make / Model / Year:</span>
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {selectedTruck.year || ''} {selectedTruck.make || selectedTruck.makeModel || ''} {selectedTruck.model || ''}
                </div>
              </div>
              <div>
                <span className={theme.subText}>Ownership Type:</span>
                <div className={`font-semibold capitalize ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {(selectedTruck.ownershipType || 'company_owned').replace('_', ' ')}
                </div>
              </div>
              <div>
                <span className={theme.subText}>Operational Status:</span>
                <div className={`font-semibold capitalize ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {(selectedTruck.operationalStatus || 'available').replace('_', ' ')}
                </div>
              </div>
              <div>
                <span className={theme.subText}>PM Dispatch Policy:</span>
                <div className={`font-semibold uppercase ${theme.textCyan}`}>
                  {selectedTruck.pmDispatchPolicy || 'warning_only'}
                </div>
              </div>
              <div>
                <span className={theme.subText}>DOT Annual Inspection Exp:</span>
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {selectedTruck.annualInspectionExpiresAt ? new Date(selectedTruck.annualInspectionExpiresAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <span className={theme.subText}>State Registration Exp:</span>
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {selectedTruck.registrationExpiresAt ? new Date(selectedTruck.registrationExpiresAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>

            {/* Current Driver & Active Assignment */}
            {(() => {
              const activeLoadForDrawer = getActiveLoadForTruck(selectedTruck, loads, drivers);

              const matchedDriverObj = drivers.find(d => 
                d.id === selectedTruck.currentDriverId || 
                d.id === selectedTruck.assignedDriverId || 
                d.uid === selectedTruck.currentDriverId || 
                d.uid === selectedTruck.assignedDriverId ||
                (selectedTruck.truckNumber && (d.assignedTruck === selectedTruck.truckNumber || d.truckNumber === selectedTruck.truckNumber))
              );
              const driverName = selectedTruck.currentDriverName || 
                matchedDriverObj?.name || 
                (activeLoadForDrawer?.assignedDriverId ? drivers.find(d => d.id === activeLoadForDrawer.assignedDriverId || d.uid === activeLoadForDrawer.assignedDriverId)?.name : null);

              const hasDriver = Boolean(driverName || selectedTruck.currentDriverId || selectedTruck.assignedDriverId || matchedDriverObj || activeLoadForDrawer);

              const calculatedAssignmentStatus = (() => {
                if (!hasDriver) return 'unassigned';
                if (activeLoadForDrawer) {
                  const statusFmt = activeLoadForDrawer.status.replace(/_/g, ' ');
                  return `assigned (${statusFmt.toUpperCase()} - Load #${activeLoadForDrawer.loadNumber || activeLoadForDrawer.id.slice(-6).toUpperCase()})`;
                }
                return (selectedTruck.assignmentStatus && selectedTruck.assignmentStatus !== 'unassigned') 
                  ? selectedTruck.assignmentStatus 
                  : 'assigned';
              })();

              return (
                <div className={`p-4 border rounded-xl space-y-2 ${theme.barBg}`}>
                  <h3 className={`text-xs font-bold font-mono uppercase ${theme.subText}`}>Assigned Driver & Assignment Ledger</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-sm font-semibold ${theme.textEmerald}`}>
                        {driverName || 'No Driver Currently Assigned'}
                      </div>
                      <div className={`text-[11px] font-mono ${theme.subText}`}>
                        Status: <span className={hasDriver ? (isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-bold') : theme.subText}>{calculatedAssignmentStatus}</span>
                      </div>
                      {activeLoadForDrawer && (
                        <div className={`mt-2 px-2.5 py-1 rounded-md text-xs font-mono font-medium border inline-flex items-center gap-1.5 ${
                          isLight ? 'bg-cyan-50 border-cyan-200 text-cyan-900' : 'bg-cyan-950/60 border-cyan-800 text-cyan-300'
                        }`}>
                          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                          <span>Active Load #{activeLoadForDrawer.loadNumber || activeLoadForDrawer.id.slice(-6).toUpperCase()} — <span className="uppercase font-bold">{activeLoadForDrawer.status.replace(/_/g, ' ')}</span></span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setAssignForm({ truckId: selectedTruck.id, driverId: '', notes: '' });
                        setIsAssignDriverModalOpen(true);
                      }}
                      className={`px-3 py-1 text-xs rounded-lg font-medium cursor-pointer ${theme.btnSecondary}`}
                    >
                      Change Assignment
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Odometer & PM Schedule Details */}
            <div className={`p-4 border rounded-xl space-y-3 ${theme.barBg}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xs font-bold font-mono uppercase ${theme.subText}`}>Odometer & PM Schedule</h3>
                <button
                  onClick={() => {
                    setOdometerForm({ truckId: selectedTruck.id, newOdometer: selectedTruck.currentOdometerDecimal || 0, source: 'manual', reason: '' });
                    setIsOdometerModalOpen(true);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono cursor-pointer border ${isLight ? 'bg-cyan-50 border-cyan-300 text-cyan-800 font-bold' : 'bg-cyan-950/80 border-cyan-800 text-cyan-300'}`}
                >
                  Log Odometer
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className={`p-2.5 rounded-lg border ${theme.cardBg}`}>
                  <div className={`text-[10px] ${theme.subText}`}>CURRENT ODOMETER</div>
                  <div className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                    {(selectedTruck.currentOdometerDecimal || 0).toLocaleString()} mi
                  </div>
                </div>
                <div className={`p-2.5 rounded-lg border ${theme.cardBg}`}>
                  <div className={`text-[10px] ${theme.subText}`}>NEXT PM DUE</div>
                  <div className={`text-base font-bold ${theme.textCyan}`}>
                    {(selectedTruck.nextPmDueOdometerDecimal || 0).toLocaleString()} mi
                  </div>
                </div>
              </div>
            </div>

            {/* Close Drawer Button */}
            <button
              onClick={() => setIsDetailDrawerOpen(false)}
              className={`w-full py-2.5 font-semibold text-xs rounded-xl cursor-pointer ${theme.btnSecondary}`}
            >
              Close Drawer
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT POWER UNIT */}
      {isAddTruckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-lg ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                {truckForm.id ? 'Edit Power Unit' : 'Register New Power Unit (Truck)'}
              </h3>
              <button onClick={() => setIsAddTruckModalOpen(false)} className={`${theme.subText} hover:${theme.headingText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTruck} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Unit Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2025"
                    value={truckForm.truckNumber || ''}
                    onChange={e => setTruckForm(f => ({ ...f, truckNumber: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>VIN Number</label>
                  <input
                    type="text"
                    placeholder="17-digit VIN"
                    value={truckForm.vin || ''}
                    onChange={e => setTruckForm(f => ({ ...f, vin: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Year</label>
                  <input
                    type="text"
                    value={truckForm.year || ''}
                    onChange={e => setTruckForm(f => ({ ...f, year: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Make</label>
                  <input
                    type="text"
                    placeholder="e.g. Freightliner"
                    value={truckForm.make || ''}
                    onChange={e => setTruckForm(f => ({ ...f, make: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Cascadia"
                    value={truckForm.model || ''}
                    onChange={e => setTruckForm(f => ({ ...f, model: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>License Plate</label>
                  <input
                    type="text"
                    placeholder="e.g. 7XYZ999"
                    value={truckForm.licensePlate || ''}
                    onChange={e => setTruckForm(f => ({ ...f, licensePlate: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>License State</label>
                  <input
                    type="text"
                    placeholder="e.g. CA"
                    value={truckForm.licensePlateState || ''}
                    onChange={e => setTruckForm(f => ({ ...f, licensePlateState: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono uppercase ${theme.inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Ownership Type</label>
                  <select
                    value={truckForm.ownershipType || 'company_owned'}
                    onChange={e => setTruckForm(f => ({ ...f, ownershipType: e.target.value as any }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  >
                    <option value="company_owned">Company Owned</option>
                    <option value="owner_operator">Owner Operator</option>
                    <option value="leased">Leased</option>
                  </select>
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Operational Status</label>
                  <select
                    value={truckForm.operationalStatus || 'available'}
                    onChange={e => setTruckForm(f => ({ ...f, operationalStatus: e.target.value as any }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  >
                    <option value="active">Active</option>
                    <option value="available">Available</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="out_of_service">Out of Service</option>
                  </select>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-3 pt-2 border-t ${theme.modalBorder}`}>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Current Odometer (mi)</label>
                  <input
                    type="number"
                    value={truckForm.currentOdometerDecimal || 0}
                    onChange={e => setTruckForm(f => ({ ...f, currentOdometerDecimal: Number(e.target.value) }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>PM Interval (mi)</label>
                  <input
                    type="number"
                    value={truckForm.pmIntervalMilesDecimal || 15000}
                    onChange={e => setTruckForm(f => ({ ...f, pmIntervalMilesDecimal: Number(e.target.value) }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>PM Warning Threshold (mi)</label>
                  <input
                    type="number"
                    value={truckForm.pmWarningMilesDecimal || 1000}
                    onChange={e => setTruckForm(f => ({ ...f, pmWarningMilesDecimal: Number(e.target.value) }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>PM Dispatch Policy</label>
                  <select
                    value={truckForm.pmDispatchPolicy || 'warning_only'}
                    onChange={e => setTruckForm(f => ({ ...f, pmDispatchPolicy: e.target.value as any }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  >
                    <option value="warning_only">Warning Only</option>
                    <option value="block_dispatch">Block Dispatch</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-3 pt-2 border-t ${theme.modalBorder}`}>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Annual DOT Inspection Exp</label>
                  <input
                    type="date"
                    value={truckForm.annualInspectionExpiresAt ? truckForm.annualInspectionExpiresAt.split('T')[0] : ''}
                    onChange={e => setTruckForm(f => ({ ...f, annualInspectionExpiresAt: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Registration Expiration</label>
                  <input
                    type="date"
                    value={truckForm.registrationExpiresAt ? truckForm.registrationExpiresAt.split('T')[0] : ''}
                    onChange={e => setTruckForm(f => ({ ...f, registrationExpiresAt: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddTruckModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Power Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT TRAILER */}
      {isAddTrailerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className={`w-full max-w-2xl ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl my-8`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <div className="flex items-center gap-2">
                <Container className="w-5 h-5 text-purple-500" />
                <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                  {trailerForm.id ? `Edit Commercial Trailer - Unit ${trailerForm.unitNumber}` : 'Register New Commercial Trailer'}
                </h3>
              </div>
              <button
                onClick={() => setIsAddTrailerModalOpen(false)}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTrailer} className="space-y-4 text-xs">
              {/* SECTION 1: CORE IDENTIFICATION */}
              <div>
                <h4 className={`text-[11px] font-mono font-bold uppercase tracking-wider mb-2 ${theme.textPurple}`}>
                  1. Core Unit Identification
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Trailer Unit Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TR-5301"
                      value={trailerForm.unitNumber}
                      onChange={e => setTrailerForm(f => ({ ...f, unitNumber: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono font-bold ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Trailer Type *</label>
                    <select
                      value={trailerForm.type}
                      onChange={e => {
                        const val = e.target.value as any;
                        setTrailerForm(f => ({
                          ...f,
                          type: val,
                          isReefer: val === 'reefer'
                        }));
                      }}
                      className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                    >
                      <option value="dry_van">Dry Van</option>
                      <option value="reefer">Reefer (Refrigerated)</option>
                      <option value="flatbed">Flatbed</option>
                      <option value="stepdeck">Stepdeck / Dropdeck</option>
                      <option value="lowboy">Lowboy / Heavy Haul</option>
                      <option value="tanker">Liquid Tanker</option>
                      <option value="container_chassis">Container Chassis</option>
                      <option value="other">Other Commercial Trailer</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Trailer Color</label>
                    <input
                      type="text"
                      placeholder="e.g. White, Silver, Dark Blue"
                      value={trailerForm.color || ''}
                      onChange={e => setTrailerForm(f => ({ ...f, color: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: DIMENSIONS & SPECS */}
              <div className={`pt-3 border-t ${theme.modalBorder}`}>
                <h4 className={`text-[11px] font-mono font-bold uppercase tracking-wider mb-2 ${theme.textPurple}`}>
                  2. Dimensions & Physical Specifications
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Size / Length</label>
                    <select
                      value={trailerForm.size || '53 ft'}
                      onChange={e => setTrailerForm(f => ({ ...f, size: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                    >
                      <option value="53 ft">53 ft</option>
                      <option value="48 ft">48 ft</option>
                      <option value="45 ft">45 ft</option>
                      <option value="40 ft">40 ft</option>
                      <option value="28 ft">28 ft (Pup)</option>
                      <option value="Other">Custom Size</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Door Type</label>
                    <select
                      value={trailerForm.doorType || 'swing'}
                      onChange={e => setTrailerForm(f => ({ ...f, doorType: e.target.value as any }))}
                      className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                    >
                      <option value="swing">Swing Doors</option>
                      <option value="roll_up">Roll-up Door</option>
                      <option value="open_top">Open Top / Tarp</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Floor Type</label>
                    <select
                      value={trailerForm.floorType || 'wood'}
                      onChange={e => setTrailerForm(f => ({ ...f, floorType: e.target.value as any }))}
                      className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                    >
                      <option value="wood">Hardwood / Oak</option>
                      <option value="aluminum">Duct Aluminum</option>
                      <option value="steel">Steel Plate</option>
                      <option value="composite">Composite</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Max Payload (lbs)</label>
                    <input
                      type="number"
                      placeholder="45000"
                      value={trailerForm.maxPayloadLbs || ''}
                      onChange={e => setTrailerForm(f => ({ ...f, maxPayloadLbs: Number(e.target.value) }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                    />
                  </div>
                </div>
              </div>

              {/* REEFER SPECIFIC FIELDS IF REEFER */}
              {(trailerForm.type === 'reefer' || trailerForm.isReefer) && (
                <div className={`p-3 rounded-xl border space-y-3 ${
                  isLight ? 'bg-cyan-50/70 border-cyan-200' : 'bg-cyan-950/30 border-cyan-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-cyan-600" />
                    <h5 className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
                      Refrigeration Unit Specs
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={`block font-mono mb-1 ${theme.subText}`}>Reefer Make & Model</label>
                      <input
                        type="text"
                        placeholder="e.g. Thermo King Precedent S-600 / Carrier Vector 8500"
                        value={trailerForm.reeferMakeModel || ''}
                        onChange={e => setTrailerForm(f => ({ ...f, reeferMakeModel: e.target.value }))}
                        className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                      />
                    </div>
                    <div>
                      <label className={`block font-mono mb-1 ${theme.subText}`}>Engine Hours</label>
                      <input
                        type="number"
                        placeholder="e.g. 1250"
                        value={trailerForm.reeferHours || ''}
                        onChange={e => setTrailerForm(f => ({ ...f, reeferHours: Number(e.target.value) }))}
                        className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: REGISTRATION & COMPLIANCE */}
              <div className={`pt-3 border-t ${theme.modalBorder}`}>
                <h4 className={`text-[11px] font-mono font-bold uppercase tracking-wider mb-2 ${theme.textPurple}`}>
                  3. VIN & Registration Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>VIN Number</label>
                    <input
                      type="text"
                      placeholder="17-digit VIN"
                      value={trailerForm.vin || ''}
                      onChange={e => setTrailerForm(f => ({ ...f, vin: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono uppercase ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>License Plate</label>
                    <input
                      type="text"
                      placeholder="e.g. TRK-9921"
                      value={trailerForm.licensePlate || ''}
                      onChange={e => setTrailerForm(f => ({ ...f, licensePlate: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono uppercase ${theme.inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block font-mono mb-1 ${theme.subText}`}>Plate State</label>
                    <input
                      type="text"
                      placeholder="e.g. TX, IL, CA"
                      maxLength={2}
                      value={trailerForm.licensePlateState || ''}
                      onChange={e => setTrailerForm(f => ({ ...f, licensePlateState: e.target.value.toUpperCase() }))}
                      className={`w-full rounded-lg px-3 py-2 font-mono uppercase ${theme.inputBg}`}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: MAKE, YEAR & OWNERSHIP */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Make / Manufacturer</label>
                  <input
                    type="text"
                    placeholder="e.g. Great Dane, Utility, Wabash"
                    value={trailerForm.make || ''}
                    onChange={e => setTrailerForm(f => ({ ...f, make: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Model Year</label>
                  <input
                    type="text"
                    placeholder="2024"
                    value={trailerForm.year || ''}
                    onChange={e => setTrailerForm(f => ({ ...f, year: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Ownership Structure</label>
                  <select
                    value={trailerForm.ownershipType || 'company_owned'}
                    onChange={e => setTrailerForm(f => ({ ...f, ownershipType: e.target.value as any }))}
                    className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                  >
                    <option value="company_owned">Company Owned</option>
                    <option value="leased">Leased</option>
                    <option value="owner_operator">Owner Operator</option>
                  </select>
                </div>
                <div>
                  <label className={`block font-mono mb-1 ${theme.subText}`}>Operational Status</label>
                  <select
                    value={trailerForm.status || 'available'}
                    onChange={e => setTrailerForm(f => ({ ...f, status: e.target.value as any }))}
                    className={`w-full rounded-lg px-3 py-2 capitalize ${theme.inputBg}`}
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="out_of_service">Out Of Service</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Remarks & Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Additional specs, notes, or operating instructions..."
                  value={trailerForm.notes || ''}
                  onChange={e => setTrailerForm(f => ({ ...f, notes: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                />
              </div>

              <div className={`flex justify-end gap-2 pt-3 border-t ${theme.modalBorder}`}>
                <button
                  type="button"
                  onClick={() => setIsAddTrailerModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : trailerForm.id ? 'Save Trailer Specs' : 'Register Trailer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: TRAILER DETAILS & SPECS */}
      {isTrailerDetailDrawerOpen && selectedTrailer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-xl h-full ${theme.modalBg} border-l ${theme.modalBorder} p-6 space-y-6 overflow-y-auto shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-4 ${theme.modalBorder}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                  <Container className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold font-heading ${theme.headingText}`}>
                    Trailer Unit #{selectedTrailer.unitNumber}
                  </h3>
                  <p className={`text-xs ${theme.subText}`}>
                    {(selectedTrailer.type || 'dry_van').replace('_', ' ').toUpperCase()} &bull; {selectedTrailer.size || '53 ft'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsTrailerDetailDrawerOpen(false);
                  setSelectedTrailer(null);
                }}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STATUS BADGES & QUICK ACTIONS */}
            <div className="flex items-center justify-between gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-mono uppercase font-bold border ${
                selectedTrailer.status === 'assigned' ? 'bg-purple-100 border-purple-300 text-purple-900' :
                selectedTrailer.status === 'available' ? theme.badgeActive : theme.badgeDefault
              }`}>
                Status: {selectedTrailer.status || 'available'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditTrailer(selectedTrailer)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    isLight ? 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800' : 'bg-purple-950/70 hover:bg-purple-900 border-purple-500/30 text-purple-300'
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Specs</span>
                </button>
                <button
                  onClick={() => {
                    setHistoryUnit({ id: selectedTrailer.id, number: selectedTrailer.unitNumber, type: 'trailer' });
                    setIsHistoryModalOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${theme.btnSecondary}`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Assignment History</span>
                </button>
              </div>
            </div>

            {/* SPECIFICATION GRID */}
            <div className="space-y-4 text-xs">
              <div className={`p-4 rounded-xl border space-y-3 ${theme.barBg}`}>
                <h4 className={`font-mono font-bold uppercase tracking-wider ${theme.textPurple}`}>
                  Physical Specifications
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Trailer Type</span>
                    <span className={`font-semibold capitalize ${theme.headingText}`}>{(selectedTrailer.type || 'dry_van').replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Color</span>
                    <span className={`font-semibold ${theme.headingText}`}>{selectedTrailer.color || 'Standard White'}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Size / Length</span>
                    <span className={`font-mono font-bold ${theme.headingText}`}>{selectedTrailer.size || '53 ft'}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Max Payload</span>
                    <span className={`font-mono font-bold ${theme.headingText}`}>{selectedTrailer.maxPayloadLbs ? `${selectedTrailer.maxPayloadLbs.toLocaleString()} lbs` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Door Configuration</span>
                    <span className={`font-semibold capitalize ${theme.headingText}`}>{(selectedTrailer.doorType || 'swing').replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Flooring</span>
                    <span className={`font-semibold capitalize ${theme.headingText}`}>{selectedTrailer.floorType || 'wood'}</span>
                  </div>
                </div>
              </div>

              {/* REEFER DETAILS IF APPLICABLE */}
              {(selectedTrailer.type === 'reefer' || selectedTrailer.isReefer) && (
                <div className={`p-4 rounded-xl border space-y-2 ${
                  isLight ? 'bg-cyan-50/80 border-cyan-200' : 'bg-cyan-950/40 border-cyan-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-cyan-600" />
                    <h4 className="font-mono font-bold text-cyan-800 dark:text-cyan-300">
                      Refrigeration Unit Details
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className={`block font-mono ${theme.subText}`}>Reefer Unit Make/Model</span>
                      <span className="font-semibold">{selectedTrailer.reeferMakeModel || 'Unspecified'}</span>
                    </div>
                    <div>
                      <span className={`block font-mono ${theme.subText}`}>Engine Run Hours</span>
                      <span className="font-mono font-bold">{selectedTrailer.reeferHours || 0} hrs</span>
                    </div>
                  </div>
                </div>
              )}

              {/* DRIVER & TRACTOR ASSIGNMENT */}
              <div className={`p-4 rounded-xl border space-y-3 ${theme.barBg}`}>
                <h4 className={`font-mono font-bold uppercase tracking-wider ${theme.textPurple}`}>
                  Current Operations & Assignment
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Assigned Driver</span>
                    {selectedTrailer.currentDriverName ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <User className="w-4 h-4 text-purple-500" />
                        <span className={`font-bold ${theme.headingText}`}>{selectedTrailer.currentDriverName}</span>
                      </div>
                    ) : (
                      <span className="italic text-slate-400">Unassigned</span>
                    )}
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Coupled Power Unit</span>
                    <span className={`font-mono font-bold ${theme.textEmerald}`}>
                      {selectedTrailer.currentTruckNumber ? `Unit #${selectedTrailer.currentTruckNumber}` : 'Uncoupled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* REGISTRATION & VEHICLE DATA */}
              <div className={`p-4 rounded-xl border space-y-3 ${theme.barBg}`}>
                <h4 className={`font-mono font-bold uppercase tracking-wider ${theme.textPurple}`}>
                  VIN & Registration Records
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>VIN Number</span>
                    <span className={`font-mono font-bold ${theme.headingText}`}>{selectedTrailer.vin || 'N/A'}</span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>License Plate & State</span>
                    <span className={`font-mono font-bold ${theme.headingText}`}>
                      {selectedTrailer.licensePlate ? `${selectedTrailer.licensePlate} (${selectedTrailer.licensePlateState || ''})` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Make & Model Year</span>
                    <span className={`font-semibold ${theme.headingText}`}>
                      {selectedTrailer.year || ''} {selectedTrailer.make || 'N/A'} {selectedTrailer.model || ''}
                    </span>
                  </div>
                  <div>
                    <span className={`block font-mono ${theme.subText}`}>Ownership Type</span>
                    <span className={`font-semibold capitalize ${theme.headingText}`}>
                      {(selectedTrailer.ownershipType || 'company_owned').replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {selectedTrailer.notes && (
                <div className={`p-3 rounded-xl border ${theme.barBg}`}>
                  <span className={`block font-mono mb-1 ${theme.subText}`}>Operational Notes</span>
                  <p className={theme.headingText}>{selectedTrailer.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK EDIT TRAILER DRIVER ASSIGNMENT */}
      {isQuickEditTrailerDriverModalOpen && quickEditTrailer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <div className="flex items-center gap-2">
                <UserCheck className={`w-5 h-5 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
                <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                  Assign Driver to Trailer {quickEditTrailer.unitNumber}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsQuickEditTrailerDriverModalOpen(false);
                  setQuickEditTrailer(null);
                }}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickTrailerDriverAssignment} className="space-y-4 text-xs">
              <div className={`p-3 rounded-xl border space-y-1 font-mono ${theme.barBg}`}>
                <div className={theme.subText}>Trailer Unit: <span className={`font-bold ${theme.textPurple}`}>{quickEditTrailer.unitNumber}</span> ({(quickEditTrailer.type || 'dry_van').replace('_', ' ')})</div>
                <div className={theme.subText}>Current Assigned Driver: <span className={isLight ? 'text-slate-900 font-semibold' : 'text-slate-200'}>{quickEditTrailer.currentDriverName || 'Unassigned'}</span></div>
              </div>

              <div>
                <label className={`block font-medium mb-1.5 ${theme.headingText}`}>Select Driver to Assign</label>
                <select
                  value={quickTrailerDriverId}
                  onChange={e => setQuickTrailerDriverId(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 ${theme.inputBg}`}
                >
                  <option value="">-- Unassign Driver (Clear Trailer Assignment) --</option>
                  {drivers.map(drv => (
                    <option key={drv.id} value={drv.id}>
                      {drv.name} ({drv.email || drv.id}) {drv.assignedTrailer && drv.assignedTrailer !== quickEditTrailer.unitNumber ? `[Trailer: ${drv.assignedTrailer}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`flex justify-end gap-2 pt-2 border-t ${theme.modalBorder}`}>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickEditTrailerDriverModalOpen(false);
                    setQuickEditTrailer(null);
                  }}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{actionLoading ? 'Updating Assignment...' : 'Save Trailer Driver'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN DRIVER TO POWER UNIT */}
      {isAssignDriverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                Assign Driver to Power Unit
              </h3>
              <button onClick={() => setIsAssignDriverModalOpen(false)} className={`${theme.subText} hover:${theme.headingText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignDriver} className="space-y-3 text-xs">
              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Select Power Unit *</label>
                <select
                  required
                  value={assignForm.truckId}
                  onChange={e => setAssignForm(f => ({ ...f, truckId: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                >
                  <option value="">-- Choose Power Unit --</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>
                      Unit {t.truckNumber} ({t.make || ''} - {t.currentDriverName ? `Currently: ${t.currentDriverName}` : 'Unassigned'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Select Driver *</label>
                <select
                  required
                  value={assignForm.driverId}
                  onChange={e => setAssignForm(f => ({ ...f, driverId: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Assignment Note</label>
                <input
                  type="text"
                  placeholder="e.g. Primary driver assignment"
                  value={assignForm.notes}
                  onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAssignDriverModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG ODOMETER */}
      {isOdometerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                Log New Odometer Reading
              </h3>
              <button onClick={() => setIsOdometerModalOpen(false)} className={`${theme.subText} hover:${theme.headingText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateOdometer} className="space-y-3 text-xs">
              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Select Power Unit *</label>
                <select
                  required
                  value={odometerForm.truckId}
                  onChange={e => {
                    const tid = e.target.value;
                    const tr = trucks.find(t => t.id === tid);
                    setOdometerForm(f => ({
                      ...f,
                      truckId: tid,
                      newOdometer: tr ? (tr.currentOdometerDecimal || 0) : 0
                    }));
                  }}
                  className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                >
                  <option value="">-- Choose Power Unit --</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>
                      Unit {t.truckNumber} (Current: {(t.currentOdometerDecimal || 0).toLocaleString()} mi)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>New Odometer Reading (Miles) *</label>
                <input
                  type="number"
                  required
                  value={odometerForm.newOdometer || ''}
                  onChange={e => setOdometerForm(f => ({ ...f, newOdometer: Number(e.target.value) }))}
                  className={`w-full rounded-lg px-3 py-2 font-mono text-sm ${theme.inputBg}`}
                />
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Verification Source</label>
                <select
                  value={odometerForm.source}
                  onChange={e => setOdometerForm(f => ({ ...f, source: e.target.value as any }))}
                  className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                >
                  <option value="manual">Manual Admin Entry</option>
                  <option value="eld">ELD / Telematics Integration</option>
                  <option value="maintenance_record">Maintenance Service Log</option>
                  <option value="gps">GPS Telematics</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOdometerModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Updating...' : 'Save Odometer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD PM SERVICE COMPLETION */}
      {isRecordPmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                Record Preventive Maintenance Service
              </h3>
              <button onClick={() => setIsRecordPmModalOpen(false)} className={`${theme.subText} hover:${theme.headingText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPmService} className="space-y-3 text-xs">
              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Select Power Unit *</label>
                <select
                  required
                  value={pmForm.truckId}
                  onChange={e => {
                    const tid = e.target.value;
                    const tr = trucks.find(t => t.id === tid);
                    setPmForm(f => ({
                      ...f,
                      truckId: tid,
                      serviceOdometer: tr ? (tr.currentOdometerDecimal || 0) : 0
                    }));
                  }}
                  className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                >
                  <option value="">-- Choose Power Unit --</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>
                      Unit {t.truckNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Service Odometer (Miles) *</label>
                <input
                  type="number"
                  required
                  value={pmForm.serviceOdometer || ''}
                  onChange={e => setPmForm(f => ({ ...f, serviceOdometer: Number(e.target.value) }))}
                  className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                />
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Service Date</label>
                <input
                  type="date"
                  value={pmForm.serviceDate}
                  onChange={e => setPmForm(f => ({ ...f, serviceDate: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 font-mono ${theme.inputBg}`}
                />
              </div>

              <div>
                <label className={`block font-mono mb-1 ${theme.subText}`}>Service Vendor / Shop Name</label>
                <input
                  type="text"
                  placeholder="e.g. TA Truck Service"
                  value={pmForm.vendor}
                  onChange={e => setPmForm(f => ({ ...f, vendor: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 ${theme.inputBg}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsRecordPmModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Record PM & Recalculate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUICK EDIT ASSIGNED DRIVER */}
      {isQuickEditDriverModalOpen && quickEditTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <div className="flex items-center gap-2">
                <UserCheck className={`w-5 h-5 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
                <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                  Edit Assigned Driver - Unit {quickEditTruck.truckNumber}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsQuickEditDriverModalOpen(false);
                  setQuickEditTruck(null);
                }}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickDriverAssignment} className="space-y-4 text-xs">
              <div className={`p-3 rounded-xl border space-y-1 font-mono ${theme.barBg}`}>
                <div className={theme.subText}>Power Unit: <span className={`font-bold ${theme.textEmerald}`}>{quickEditTruck.truckNumber}</span> ({quickEditTruck.year || ''} {quickEditTruck.make || ''})</div>
                <div className={theme.subText}>Current Assigned Driver: <span className={isLight ? 'text-slate-900 font-semibold' : 'text-slate-200'}>{quickEditTruck.currentDriverName || 'Unassigned'}</span></div>
              </div>

              <div>
                <label className={`block font-medium mb-1.5 ${theme.headingText}`}>Select Primary Driver</label>
                <select
                  value={quickDriverId}
                  onChange={e => setQuickDriverId(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 ${theme.inputBg}`}
                >
                  <option value="">-- Unassign Driver (Clear Assignment) --</option>
                  {drivers.map(drv => (
                    <option key={drv.id} value={drv.id}>
                      {drv.name} ({drv.email || drv.id}) {drv.assignedTruck && drv.assignedTruck !== quickEditTruck.truckNumber ? `[Assigned to ${drv.assignedTruck}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`flex justify-end gap-2 pt-2 border-t ${theme.modalBorder}`}>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickEditDriverModalOpen(false);
                    setQuickEditTruck(null);
                  }}
                  className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{actionLoading ? 'Updating Assignment...' : 'Save Driver Assignment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UNIT ASSIGNMENT HISTORY ARCHIVE */}
      {isHistoryModalOpen && historyUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-2xl ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <div className="flex items-center gap-2">
                <History className={`w-5 h-5 ${theme.textEmerald}`} />
                <div>
                  <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                    Assignment & Usage History
                  </h3>
                  <p className={`text-xs ${theme.subText}`}>
                    {historyUnit.type === 'truck' ? 'Power Unit' : 'Trailer'} #{historyUnit.number} History Archive
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  setHistoryUnit(null);
                }}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {assignments.filter(a =>
                historyUnit.type === 'trailer'
                  ? (a.trailerId === historyUnit.id || a.trailerNumberSnapshot === historyUnit.number)
                  : (a.truckId === historyUnit.id || a.truckNumberSnapshot === historyUnit.number)
              ).length === 0 ? (
                <div className={`p-8 text-center font-mono text-xs rounded-xl border ${theme.barBg} ${theme.subText}`}>
                  No historical driver assignment records found in ledger for Unit {historyUnit.number}.
                </div>
              ) : (
                <div className={`border rounded-xl overflow-hidden text-xs ${theme.tableWrapper}`}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={theme.tableHeader}>
                        <th className="py-2.5 px-3">Equipment Type</th>
                        <th className="py-2.5 px-3">Assigned Driver</th>
                        <th className="py-2.5 px-3">Effective From</th>
                        <th className="py-2.5 px-3">Effective To</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${theme.tableDivide}`}>
                      {assignments
                        .filter(a =>
                          historyUnit.type === 'trailer'
                            ? (a.trailerId === historyUnit.id || a.trailerNumberSnapshot === historyUnit.number)
                            : (a.truckId === historyUnit.id || a.truckNumberSnapshot === historyUnit.number)
                        )
                        .map(a => (
                          <tr key={a.id} className={`${theme.tableRowHover} transition`}>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                                a.equipmentType === 'trailer' || a.trailerId ? 'bg-purple-100 border-purple-300 text-purple-900' : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                              }`}>
                                {a.equipmentType === 'trailer' || a.trailerId ? 'Trailer' : 'Power Unit'}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 font-medium ${isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}`}>{a.driverNameSnapshot}</td>
                            <td className={`py-2.5 px-3 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{a.effectiveFrom ? new Date(a.effectiveFrom).toLocaleDateString() : 'N/A'}</td>
                            <td className={`py-2.5 px-3 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{a.effectiveTo ? new Date(a.effectiveTo).toLocaleDateString() : 'Active'}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                                a.status === 'active' ? theme.badgeActive : theme.badgeDefault
                              }`}>
                                {a.status}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 ${theme.subText}`}>{a.notes || 'N/A'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={`flex justify-end pt-2 border-t ${theme.modalBorder}`}>
              <button
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  setHistoryUnit(null);
                }}
                className={`px-4 py-2 rounded-xl font-semibold cursor-pointer text-xs ${theme.btnSecondary}`}
              >
                Close Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE EQUIPMENT UNIT CONFIRMATION */}
      {isDeleteModalOpen && unitToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md ${theme.modalBg} border ${theme.modalBorder} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.modalBorder}`}>
              <div className={`flex items-center gap-2 ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>
                <Trash2 className="w-5 h-5" />
                <h3 className={`text-base font-bold font-heading ${theme.headingText}`}>
                  Delete {unitToDelete.type === 'truck' ? 'Power Unit' : 'Trailer'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setUnitToDelete(null);
                }}
                className={`${theme.subText} hover:${theme.headingText}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className={`p-3 rounded-xl border ${
                isLight ? 'bg-rose-50 border-rose-300 text-rose-900 font-medium' : 'bg-rose-950/50 border-rose-500/30 text-rose-200'
              }`}>
                <strong className="block mb-1">Warning: Irreversible Operation!</strong>
                Are you sure you want to permanently delete {unitToDelete.type === 'truck' ? 'Power Unit' : 'Trailer'} <span className="font-mono font-bold">#{unitToDelete.number}</span>? This unit will be removed from your equipment registry.
              </p>
            </div>

            <div className={`flex justify-end gap-2 pt-2 border-t text-xs ${theme.modalBorder}`}>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setUnitToDelete(null);
                }}
                className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${theme.btnSecondary}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUnit}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{actionLoading ? 'Deleting...' : 'Permanently Delete Unit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetEquipmentCenter;
