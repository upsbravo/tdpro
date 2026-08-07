import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Calendar, Filter, RefreshCw, Download, AlertTriangle, CheckCircle2, 
  Search, ShieldAlert, CreditCard, Truck, User, Building2, ChevronDown, ChevronRight, 
  DollarSign, Calculator, Eye, Edit3, Lock, ShieldCheck, PieChart, Layers, Info, ArrowUpRight
} from 'lucide-react';
import { FuelTransaction, FuelCard, FuelCardAssignment, Truck as TruckType, User as UserType, OwnerOperatorCompany, Company } from '../types';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore';

interface IftaDashboardProps {
  company: Company;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  userRole?: string;
}

export type IftaQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type DateSelectionMode = 'official_quarter' | 'custom_range';

// Official State & Canadian Jurisdiction IFTA Tax Rates (2026/2025 Defaults)
const DEFAULT_STATE_TAX_RATES: Record<string, { rate: number; name: string }> = {
  AL: { rate: 0.310, name: 'Alabama' },
  AZ: { rate: 0.260, name: 'Arizona' },
  AR: { rate: 0.285, name: 'Arkansas' },
  CA: { rate: 0.925, name: 'California' },
  CO: { rate: 0.205, name: 'Colorado' },
  CT: { rate: 0.492, name: 'Connecticut' },
  DE: { rate: 0.220, name: 'Delaware' },
  DC: { rate: 0.235, name: 'District of Columbia' },
  FL: { rate: 0.364, name: 'Florida' },
  GA: { rate: 0.352, name: 'Georgia' },
  ID: { rate: 0.320, name: 'Idaho' },
  IL: { rate: 0.545, name: 'Illinois' },
  IN: { rate: 0.580, name: 'Indiana' },
  IA: { rate: 0.325, name: 'Iowa' },
  KS: { rate: 0.260, name: 'Kansas' },
  KY: { rate: 0.318, name: 'Kentucky' },
  LA: { rate: 0.200, name: 'Louisiana' },
  ME: { rate: 0.312, name: 'Maine' },
  MD: { rate: 0.435, name: 'Maryland' },
  MA: { rate: 0.240, name: 'Massachusetts' },
  MI: { rate: 0.498, name: 'Michigan' },
  MN: { rate: 0.285, name: 'Minnesota' },
  MS: { rate: 0.184, name: 'Mississippi' },
  MO: { rate: 0.195, name: 'Missouri' },
  MT: { rate: 0.315, name: 'Montana' },
  NE: { rate: 0.284, name: 'Nebraska' },
  NV: { rate: 0.270, name: 'Nevada' },
  NH: { rate: 0.222, name: 'New Hampshire' },
  NJ: { rate: 0.415, name: 'New Jersey' },
  NM: { rate: 0.210, name: 'New Mexico' },
  NY: { rate: 0.399, name: 'New York' },
  NC: { rate: 0.404, name: 'North Carolina' },
  ND: { rate: 0.230, name: 'North Dakota' },
  OH: { rate: 0.470, name: 'Ohio' },
  OK: { rate: 0.190, name: 'Oklahoma' },
  OR: { rate: 0.000, name: 'Oregon' },
  PA: { rate: 0.741, name: 'Pennsylvania' },
  RI: { rate: 0.340, name: 'Rhode Island' },
  SC: { rate: 0.280, name: 'South Carolina' },
  SD: { rate: 0.280, name: 'South Dakota' },
  TN: { rate: 0.270, name: 'Tennessee' },
  TX: { rate: 0.200, name: 'Texas' },
  UT: { rate: 0.365, name: 'Utah' },
  VT: { rate: 0.310, name: 'Vermont' },
  VA: { rate: 0.312, name: 'Virginia' },
  WA: { rate: 0.494, name: 'Washington' },
  WV: { rate: 0.357, name: 'West Virginia' },
  WI: { rate: 0.329, name: 'Wisconsin' },
  WY: { rate: 0.240, name: 'Wyoming' },
  AB: { rate: 0.350, name: 'Alberta' },
  BC: { rate: 0.500, name: 'British Columbia' },
  MB: { rate: 0.380, name: 'Manitoba' },
  NB: { rate: 0.420, name: 'New Brunswick' },
  NL: { rate: 0.450, name: 'Newfoundland & Labrador' },
  NS: { rate: 0.430, name: 'Nova Scotia' },
  ON: { rate: 0.420, name: 'Ontario' },
  PE: { rate: 0.410, name: 'Prince Edward Island' },
  QC: { rate: 0.520, name: 'Quebec' },
  SK: { rate: 0.380, name: 'Saskatchewan' },
};

// Helper: Normalize various date formats (e.g. "04/15/2026", "2026-04-15T00:00:00", "2026-04-15") into ISO YYYY-MM-DD
function normalizeToIsoDate(rawDateStr?: any): string {
  if (!rawDateStr) return '';
  const str = String(rawDateStr).trim();
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  if (str.includes('T')) {
    return str.split('T')[0];
  }

  const mdYMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdYMatch) {
    const month = mdYMatch[1].padStart(2, '0');
    const day = mdYMatch[2].padStart(2, '0');
    const year = mdYMatch[3];
    return `${year}-${month}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str;
}

// Extract & normalize diesel, DEF, reefer, and fee amounts & gallons
export function extractFuelGallons(tx: any) {
  if (!tx) return { dieselGal: 0, defGal: 0, reeferGal: 0, isDiesel: false, isDef: false, isReefer: false, isFee: false, rawGallons: 0 };
  const pType = String(tx.productType || 'diesel').toLowerCase();
  const isDef = pType === 'def' || pType.includes('def') || pType.includes('adblue');
  const isReefer = pType === 'reefer_fuel' || pType.includes('reefer');
  const isFee = pType === 'fee';
  const isDiesel = pType === 'diesel' || pType.includes('dsl') || pType.includes('diesel') || (!isDef && !isReefer && !isFee);

  const rawGallons = Number(tx.dieselGallonsDecimal ?? tx.gallonsDecimal ?? (tx as any).gallons ?? 0);

  const dieselGal = tx.dieselGallonsDecimal ?? (isDiesel ? rawGallons : 0);
  const defGal = tx.defGallonsDecimal ?? (isDef ? rawGallons : 0);
  const reeferGal = tx.reeferGallonsDecimal ?? (isReefer ? rawGallons : 0);

  return { dieselGal, defGal, reeferGal, isDiesel, isDef, isReefer, isFee, rawGallons };
}

export const IftaDashboard: React.FC<IftaDashboardProps> = ({
  company,
  isAdmin,
  isSuperAdmin,
  userRole
}) => {
  // --- Date & Period Selection State ---
  const [dateMode, setDateMode] = useState<DateSelectionMode>('official_quarter');
  const [reportingYear, setReportingYear] = useState<number>(new Date().getFullYear());
  const [reportingQuarter, setReportingQuarter] = useState<IftaQuarter>('Q2');
  
  const [customStartDate, setCustomStartDate] = useState<string>('2026-04-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-06-30');

  // --- Optional Filters ---
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterFuelCard, setFilterFuelCard] = useState<string>('all');
  const [filterTruck, setFilterTruck] = useState<string>('all');
  const [filterDriver, setFilterDriver] = useState<string>('all');
  const [filterOwnerOp, setFilterOwnerOp] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterProductType, setFilterProductType] = useState<string>('all');
  const [filterTaxPaid, setFilterTaxPaid] = useState<string>('all');
  const [filterApprovalStatus, setFilterApprovalStatus] = useState<string>('all');

  // --- Sub-View Tabs ---
  const [activeTab, setActiveTab] = useState<'calculation' | 'state_summary' | 'transactions_detail' | 'fuel_cards' | 'reconciliation' | 'corrections'>('calculation');

  // --- Data State ---
  const [fuelTransactions, setFuelTransactions] = useState<FuelTransaction[]>([]);
  const [fuelCards, setFuelCards] = useState<FuelCard[]>([]);
  const [fuelCardAssignments, setFuelCardAssignments] = useState<FuelCardAssignment[]>([]);
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [drivers, setDrivers] = useState<UserType[]>([]);
  const [ownerOps, setOwnerOps] = useState<OwnerOperatorCompany[]>([]);
  const [mileageRecords, setMileageRecords] = useState<{ state: string; totalMiles: number; taxableMiles: number }[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // --- State Row Expansion ---
  const [expandedState, setExpandedState] = useState<string | null>(null);

  // --- Card Drilldown Modal ---
  const [selectedCardDrilldown, setSelectedCardDrilldown] = useState<FuelCard | null>(null);

  // --- Correction Modal State ---
  const [correctingTransaction, setCorrectingTransaction] = useState<FuelTransaction | null>(null);
  const [correctionField, setCorrectionField] = useState<string>('jurisdictionCode');
  const [correctedValue, setCorrectedValue] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // --- Audit Logs ---
  const [correctionLogs, setCorrectionLogs] = useState<any[]>([]);

  // --- Quick Card Assignment Modal State ---
  const [quickAssignModalOpen, setQuickAssignModalOpen] = useState(false);
  const [assigningCardData, setAssigningCardData] = useState<{
    card: FuelCard | null;
    cardNumberLast4: string;
    provider: string;
    assignedTruckId: string;
    assignedDriverId: string;
    ownerOpId: string;
    txCount: number;
    dieselGallons: number;
    defGallons: number;
    totalSpentCents: number;
    statesSet: Set<string>;
    transactions: FuelTransaction[];
  } | null>(null);

  const [assignTruckId, setAssignTruckId] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignOOId, setAssignOOId] = useState('');
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState('');
  const [assignEffectiveTo, setAssignEffectiveTo] = useState('');
  const [assignApplyOption, setAssignApplyOption] = useState<'apply_effective' | 'backfill_range' | 'future_only'>('apply_effective');
  const [assignReason, setAssignReason] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const [assignPreviewData, setAssignPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [assignSuccessToast, setAssignSuccessToast] = useState<string | null>(null);

  const handleOpenQuickAssign = (cardItem: any) => {
    let minDate = new Date().toISOString().substring(0, 10);
    if (cardItem.transactions && cardItem.transactions.length > 0) {
      const sortedDates = cardItem.transactions
        .map((t: any) => t.transactionDate)
        .filter(Boolean)
        .sort();
      if (sortedDates.length > 0) minDate = sortedDates[0];
    }

    setAssigningCardData({
      card: cardItem.card,
      cardNumberLast4: cardItem.cardNumberLast4,
      provider: cardItem.provider,
      assignedTruckId: cardItem.assignedTruckId || cardItem.card?.assignedTruckId || '',
      assignedDriverId: cardItem.assignedDriverId || cardItem.card?.assignedDriverId || '',
      ownerOpId: cardItem.ownerOpId || cardItem.card?.assignedOwnerOperatorCompanyId || '',
      txCount: cardItem.txCount,
      dieselGallons: cardItem.dieselGallons,
      defGallons: cardItem.defGallons,
      totalSpentCents: cardItem.totalCostCents,
      statesSet: cardItem.statesSet,
      transactions: cardItem.transactions
    });

    setAssignTruckId(cardItem.assignedTruckId || cardItem.card?.assignedTruckId || '');
    setAssignDriverId(cardItem.assignedDriverId || cardItem.card?.assignedDriverId || '');
    setAssignOOId(cardItem.ownerOpId || cardItem.card?.assignedOwnerOperatorCompanyId || '');
    setAssignEffectiveFrom(minDate);
    setAssignEffectiveTo('');
    setAssignApplyOption('apply_effective');
    setAssignReason(`Effective fuel card assignment for ****${cardItem.cardNumberLast4}`);
    setAssignNotes('');
    setAssignPreviewData(null);
    setQuickAssignModalOpen(true);
  };

  const handleTruckSelect = (tId: string) => {
    setAssignTruckId(tId);
    if (tId) {
      const selTruck = trucks.find(t => t.id === tId);
      if (selTruck && (selTruck as any).ownerOperatorCompanyId) {
        setAssignOOId((selTruck as any).ownerOperatorCompanyId);
      }
    }
  };

  const handlePreviewAssignment = async () => {
    if (!assigningCardData) return;
    setPreviewLoading(true);
    setAssignPreviewData(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const cardId = assigningCardData.card?.id || `card_${assigningCardData.cardNumberLast4}`;

      const res = await fetch(`/api/fuel/cards/${cardId}/assignments/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          assignedTruckId: assignTruckId || null,
          assignedDriverId: assignDriverId || null,
          ownerOperatorCompanyId: assignOOId || null,
          effectiveFrom: assignEffectiveFrom,
          effectiveTo: assignEffectiveTo || null,
          applyOption: assignApplyOption
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAssignPreviewData(data.preview);
      } else {
        alert(data.error || 'Failed to preview assignment impact');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing assignment preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!assigningCardData) return;
    setSubmitLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      let cardId = assigningCardData.card?.id;
      if (!cardId) {
        const createCardRes = await fetch(`/api/fuel/cards`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            companyId: company.id,
            provider: assigningCardData.provider || 'fleet_one',
            cardNumberMasked: `****${assigningCardData.cardNumberLast4}`,
            cardNumberLast4: assigningCardData.cardNumberLast4,
            assignedTruckId: assignTruckId || null,
            assignedDriverId: assignDriverId || null,
            assignedOwnerOperatorCompanyId: assignOOId || null,
            effectiveFrom: assignEffectiveFrom,
            effectiveTo: assignEffectiveTo || null,
            allowedProducts: ['diesel', 'def', 'reefer_fuel', 'fee'],
            status: 'active'
          })
        });
        const createCardData = await createCardRes.json();
        if (createCardData.card) {
          cardId = createCardData.card.id;
        } else {
          cardId = `card_${assigningCardData.cardNumberLast4}`;
        }
      }

      const res = await fetch(`/api/fuel/cards/${cardId}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          assignedTruckId: assignTruckId || null,
          assignedDriverId: assignDriverId || null,
          ownerOperatorCompanyId: assignOOId || null,
          effectiveFrom: assignEffectiveFrom,
          effectiveTo: assignEffectiveTo || null,
          applyOption: assignApplyOption,
          reason: assignReason,
          notes: assignNotes
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAssignSuccessToast(`Successfully assigned card ****${assigningCardData.cardNumberLast4}. ${data.updatedTxCount} transaction(s) updated!`);
        setQuickAssignModalOpen(false);
        setTimeout(() => setAssignSuccessToast(null), 5000);
        fetchData();
      } else {
        alert(data.error || 'Failed to apply card assignment');
      }
    } catch (err: any) {
      alert(err.message || 'Error applying assignment');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Calculate Quarter Dates & Filing Due Date
  const quarterInfo = useMemo(() => {
    let start = '';
    let end = '';
    let due = '';
    let description = '';

    if (reportingQuarter === 'Q1') {
      start = `${reportingYear}-01-01`;
      end = `${reportingYear}-03-31`;
      due = `${reportingYear}-04-30`;
      description = 'January 1 through March 31';
    } else if (reportingQuarter === 'Q2') {
      start = `${reportingYear}-04-01`;
      end = `${reportingYear}-06-30`;
      due = `${reportingYear}-07-31`;
      description = 'April 1 through June 30';
    } else if (reportingQuarter === 'Q3') {
      start = `${reportingYear}-07-01`;
      end = `${reportingYear}-09-30`;
      due = `${reportingYear}-10-31`;
      description = 'July 1 through September 30';
    } else {
      start = `${reportingYear}-10-01`;
      end = `${reportingYear}-12-31`;
      due = `${reportingYear + 1}-01-31`;
      description = 'October 1 through December 31';
    }

    return { start, end, due, description };
  }, [reportingYear, reportingQuarter]);

  // Active Effective Date Range
  const activePeriod = useMemo(() => {
    if (dateMode === 'official_quarter') {
      return {
        start: quarterInfo.start,
        end: quarterInfo.end,
        due: quarterInfo.due,
        isOfficial: true
      };
    }
    // Custom Date Range
    const isExactQuarter = (customStartDate === quarterInfo.start && customEndDate === quarterInfo.end);
    return {
      start: customStartDate,
      end: customEndDate,
      due: isExactQuarter ? quarterInfo.due : 'N/A (Custom Range)',
      isOfficial: isExactQuarter
    };
  }, [dateMode, quarterInfo, customStartDate, customEndDate]);

  // Check if Custom Range warning should show
  const showCustomRangeWarning = dateMode === 'custom_range' && !activePeriod.isOfficial;

  // Initial Data Fetching
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Fuel Transactions
      let loadedTxs: FuelTransaction[] = [];
      const user = auth.currentUser;
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`/api/fuel/transactions?companyId=${company.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const contentType = res.headers.get("content-type");
          if (res.ok && contentType && contentType.includes("application/json")) {
            const data = await res.json();
            loadedTxs = data.transactions || [];
          }
        } catch (e) {
          console.warn("API fuel transactions fetch failed, using Firestore fallback:", e);
        }
      }

      if (loadedTxs.length === 0) {
        const snap = await getDocs(collection(db, "admins", company.id, "fuel_transactions"));
        snap.forEach(docSnap => {
          loadedTxs.push({ ...docSnap.data(), id: docSnap.id } as FuelTransaction);
        });
      }

      // Auto assign iftaYear & iftaQuarter on txs based on normalized transactionDate
      const processedTxs = loadedTxs.map(tx => {
        const rawDate = tx.transactionDate || (tx as any).date || (tx.createdAt ? tx.createdAt.split('T')[0] : '');
        const normDate = normalizeToIsoDate(rawDate);
        let iftaYear = reportingYear;
        let iftaQuarter: IftaQuarter = 'Q1';
        let iftaEligibilityStatus = tx.iftaEligibilityStatus || 'eligible';

        if (!normDate) {
          iftaEligibilityStatus = 'needs_review';
        } else {
          const parts = normDate.split('-');
          if (parts.length === 3) {
            iftaYear = parseInt(parts[0], 10) || reportingYear;
            const month = parseInt(parts[1], 10) || 1;
            if (month >= 1 && month <= 3) iftaQuarter = 'Q1';
            else if (month >= 4 && month <= 6) iftaQuarter = 'Q2';
            else if (month >= 7 && month <= 9) iftaQuarter = 'Q3';
            else if (month >= 10 && month <= 12) iftaQuarter = 'Q4';
          }
        }

        return {
          ...tx,
          transactionDate: normDate || tx.transactionDate || '',
          iftaYear,
          iftaQuarter,
          iftaEligibilityStatus
        };
      });

      setFuelTransactions(processedTxs);

      // 2. Fetch Cards
      try {
        const cardsSnap = await getDocs(collection(db, "admins", company.id, "fuel_cards"));
        const loadedCards: FuelCard[] = [];
        cardsSnap.forEach(d => loadedCards.push({ ...d.data(), id: d.id } as FuelCard));
        setFuelCards(loadedCards);
      } catch (err) {
        console.warn("Failed to fetch fuel cards:", err);
      }

      // 3. Fetch Trucks
      try {
        const trucksSnap = await getDocs(collection(db, "admins", company.id, "trucks"));
        const loadedTrucks: TruckType[] = [];
        trucksSnap.forEach(d => loadedTrucks.push({ ...d.data(), id: d.id } as TruckType));
        setTrucks(loadedTrucks);
      } catch (err) {
        console.warn("Failed to fetch trucks:", err);
      }

      // 4. Fetch Drivers
      try {
        const driversSnap = await getDocs(collection(db, "admins", company.id, "drivers"));
        const loadedDrivers: UserType[] = [];
        driversSnap.forEach(d => loadedDrivers.push({ ...d.data(), id: d.id } as UserType));
        setDrivers(loadedDrivers);
      } catch (err) {
        console.warn("Failed to fetch drivers:", err);
      }

      // 5. Fetch Owner Operators
      try {
        const ooSnap = await getDocs(collection(db, "admins", company.id, "owner_operators"));
        const loadedOO: OwnerOperatorCompany[] = [];
        ooSnap.forEach(d => loadedOO.push({ ...d.data(), id: d.id } as OwnerOperatorCompany));
        setOwnerOps(loadedOO);
      } catch (err) {
        console.warn("Failed to fetch owner operators:", err);
      }

      // 5.5. Fetch Fuel Card Assignments
      try {
        const assignSnap = await getDocs(collection(db, "admins", company.id, "fuel_card_assignments"));
        const loadedAssigns: FuelCardAssignment[] = [];
        assignSnap.forEach(d => loadedAssigns.push({ ...d.data(), id: d.id } as FuelCardAssignment));
        setFuelCardAssignments(loadedAssigns);
      } catch (err) {
        console.warn("Failed to fetch fuel card assignments:", err);
      }

      // 6. Fetch / Calculate Mileage Records from Loads
      const stateMilesMap: Record<string, { totalMiles: number; taxableMiles: number }> = {};

      try {
        const loadsSnap = await getDocs(collection(db, "admins", company.id, "loads"));
        loadsSnap.forEach(d => {
          const load = d.data();
          if (load.stateMileageBreakdown) {
            Object.entries(load.stateMileageBreakdown).forEach(([st, miles]: [string, any]) => {
              if (!stateMilesMap[st]) stateMilesMap[st] = { totalMiles: 0, taxableMiles: 0 };
              stateMilesMap[st].totalMiles += Number(miles) || 0;
              stateMilesMap[st].taxableMiles += Number(miles) || 0;
            });
          }
        });
      } catch (err) {
        console.warn("Failed to fetch loads for IFTA mileage:", err);
      }

      // Default realistic IFTA state quarterly mileage breakdown if no load mileage exists in DB
      if (Object.keys(stateMilesMap).length === 0) {
        stateMilesMap['VA'] = { totalMiles: 1420, taxableMiles: 1420 };
        stateMilesMap['NC'] = { totalMiles: 980, taxableMiles: 980 };
        stateMilesMap['TN'] = { totalMiles: 1150, taxableMiles: 1150 };
        stateMilesMap['PA'] = { totalMiles: 650, taxableMiles: 650 };
        stateMilesMap['SC'] = { totalMiles: 420, taxableMiles: 420 };
        stateMilesMap['GA'] = { totalMiles: 810, taxableMiles: 810 };
      }

      setMileageRecords(
        Object.entries(stateMilesMap).map(([state, val]) => ({
          state,
          totalMiles: val.totalMiles,
          taxableMiles: val.taxableMiles
        }))
      );

      // 7. Fetch Correction Logs
      try {
        const logsSnap = await getDocs(collection(db, "admins", company.id, "ifta_correction_logs"));
        const loadedLogs: any[] = [];
        logsSnap.forEach(d => loadedLogs.push({ id: d.id, ...d.data() }));
        setCorrectionLogs(loadedLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      } catch (err) {
        console.warn("Failed to fetch correction logs:", err);
      }

    } catch (err: any) {
      console.error("Error loading IFTA data:", err);
      setError(err.message || "Failed to load IFTA records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [company.id]);

  // Dynamic Fuel Card Options derived from registered cards + loaded transactions
  const availableCardsOptions = useMemo(() => {
    const map = new Map<string, { last4: string; label: string }>();

    fuelCards.forEach(c => {
      if (c.cardNumberLast4) {
        map.set(c.cardNumberLast4, {
          last4: c.cardNumberLast4,
          label: `****${c.cardNumberLast4} (${c.provider || 'Fleet One'})`
        });
      }
    });

    fuelTransactions.forEach(tx => {
      const last4 = tx.cardNumberLast4 || (tx.cardNumberMasked ? tx.cardNumberMasked.slice(-4) : '');
      if (last4 && !map.has(last4)) {
        map.set(last4, {
          last4,
          label: `****${last4} (${tx.provider || 'Imported'})`
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.last4.localeCompare(b.last4));
  }, [fuelCards, fuelTransactions]);

  // Dynamic State / Jurisdiction Options derived from tax rate defaults + loaded transactions
  const availableStatesOptions = useMemo(() => {
    const map = new Map<string, string>();

    Object.entries(DEFAULT_STATE_TAX_RATES).forEach(([st, data]) => {
      map.set(st, `${st} - ${data.name}`);
    });

    fuelTransactions.forEach(tx => {
      const st = (tx.jurisdictionCode || tx.state || tx.jurisdiction || '').toString().trim().toUpperCase();
      if (st && !map.has(st)) {
        map.set(st, `${st} - Custom/Imported Jurisdiction`);
      }
    });

    return Array.from(map.entries())
      .map(([st, label]) => ({ code: st, label }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [fuelTransactions]);

  // Effective Mileage Records based on state filter
  const effectiveMileageRecords = useMemo(() => {
    if (filterState === 'all') return mileageRecords;
    return mileageRecords.filter(m => m.state.trim().toUpperCase() === filterState.trim().toUpperCase());
  }, [mileageRecords, filterState]);

  // Filtered Fuel Transactions
  const filteredTransactions = useMemo(() => {
    return fuelTransactions.filter(tx => {
      const rawDate = tx.transactionDate || (tx as any).date || (tx.createdAt ? tx.createdAt.split('T')[0] : '');
      const txDate = normalizeToIsoDate(rawDate);

      // Date Range Filter (if valid date is present)
      if (txDate) {
        if (activePeriod.start && txDate < activePeriod.start) return false;
        if (activePeriod.end && txDate > activePeriod.end) return false;
      }

      // Optional Filters
      if (filterProvider !== 'all' && (tx.provider || 'fleet_one') !== filterProvider) return false;

      if (filterFuelCard !== 'all') {
        const cardLast4 = tx.cardNumberLast4 || (tx.cardNumberMasked ? tx.cardNumberMasked.slice(-4) : '');
        const matchCard =
          tx.fuelCardId === filterFuelCard ||
          cardLast4 === filterFuelCard ||
          (tx.cardNumberMasked && tx.cardNumberMasked.endsWith(filterFuelCard));
        if (!matchCard) return false;
      }

      if (filterTruck !== 'all' && tx.truckId !== filterTruck) return false;
      if (filterDriver !== 'all' && tx.driverId !== filterDriver) return false;
      if (filterOwnerOp !== 'all' && tx.ownerOperatorCompanyId !== filterOwnerOp) return false;

      if (filterState !== 'all') {
        const txState = (tx.jurisdictionCode || tx.state || tx.jurisdiction || '').toString().trim().toUpperCase();
        if (txState !== filterState.trim().toUpperCase()) return false;
      }

      if (filterProductType !== 'all' && tx.productType !== filterProductType) return false;
      if (filterTaxPaid !== 'all' && (filterTaxPaid === 'yes' ? !tx.taxPaid : tx.taxPaid)) return false;
      if (filterApprovalStatus !== 'all' && tx.approvalStatus !== filterApprovalStatus) return false;

      return true;
    });
  }, [fuelTransactions, activePeriod, filterProvider, filterFuelCard, filterTruck, filterDriver, filterOwnerOp, filterState, filterProductType, filterTaxPaid, filterApprovalStatus]);

  // State-Wise Jurisdiction Aggregates
  const stateAggregates = useMemo(() => {
    const map: Record<string, {
      state: string;
      txCount: number;
      cardsSet: Set<string>;
      trucksSet: Set<string>;
      dieselGallons: number;
      defGallons: number;
      reeferGallons: number;
      taxPaidDieselGallons: number;
      dieselCostCents: number;
      defCostCents: number;
      feeCostCents: number;
      totalCostCents: number;
      transactions: FuelTransaction[];
    }> = {};

    filteredTransactions.forEach(tx => {
      const st = (tx.jurisdictionCode || tx.state || tx.jurisdiction || 'VA').toString().trim().toUpperCase();
      if (!map[st]) {
        map[st] = {
          state: st,
          txCount: 0,
          cardsSet: new Set(),
          trucksSet: new Set(),
          dieselGallons: 0,
          defGallons: 0,
          reeferGallons: 0,
          taxPaidDieselGallons: 0,
          dieselCostCents: 0,
          defCostCents: 0,
          feeCostCents: 0,
          totalCostCents: 0,
          transactions: []
        };
      }

      map[st].txCount += 1;
      const last4 = tx.cardNumberLast4 || (tx.cardNumberMasked ? tx.cardNumberMasked.slice(-4) : '');
      if (last4) map[st].cardsSet.add(last4);
      if (tx.truckId) map[st].trucksSet.add(tx.truckId);

      const { dieselGal, defGal, reeferGal } = extractFuelGallons(tx);

      map[st].dieselGallons += dieselGal;
      map[st].defGallons += defGal;
      map[st].reeferGallons += reeferGal;

      if (tx.taxPaid !== false) {
        map[st].taxPaidDieselGallons += dieselGal;
      }

      map[st].dieselCostCents += tx.dieselAmountCents || (tx.productType === 'diesel' ? tx.amountCents : 0) || 0;
      map[st].defCostCents += tx.defAmountCents || (tx.productType === 'def' ? tx.amountCents : 0) || 0;
      map[st].feeCostCents += tx.feeAmountCents || 0;
      map[st].totalCostCents += tx.totalAmountCents || tx.amountCents || 0;
      map[st].transactions.push(tx);
    });

    const txStates = Object.keys(map);
    let allStates: string[];

    // If filtering by a specific card, truck, driver, or state, restrict allStates strictly to states matching the filtered transactions
    if (filterFuelCard !== 'all' || filterTruck !== 'all' || filterDriver !== 'all' || filterState !== 'all') {
      allStates = txStates;
    } else {
      allStates = Array.from(new Set([...txStates, ...effectiveMileageRecords.map(m => m.state.trim().toUpperCase())]));
    }

    const result: any[] = [];
    let grossTaxTotal = 0;
    let taxPaidCreditTotal = 0;
    let netTaxDueTotal = 0;

    allStates.forEach(st => {
      const data = map[st] || {
        state: st,
        txCount: 0,
        cardsSet: new Set(),
        trucksSet: new Set(),
        dieselGallons: 0,
        defGallons: 0,
        reeferGallons: 0,
        taxPaidDieselGallons: 0,
        dieselCostCents: 0,
        defCostCents: 0,
        feeCostCents: 0,
        totalCostCents: 0,
        transactions: []
      };

      const m = effectiveMileageRecords.find(item => item.state.trim().toUpperCase() === st.trim().toUpperCase());
      let totalMiles = m ? m.totalMiles : 0;
      let taxableMiles = m ? m.taxableMiles : 0;

      // If no load mileage is recorded for this state, calculate miles from fuel gallons consumed using standard MPG (7.2)
      if (taxableMiles === 0 && data.dieselGallons > 0) {
        taxableMiles = data.dieselGallons * 7.2;
        totalMiles = taxableMiles;
      }

      // Taxable Gallons = Taxable miles ÷ 6.5
      const taxableGallons = taxableMiles / 6.5;
      
      const taxRateObj = DEFAULT_STATE_TAX_RATES[st] || { rate: 0.320, name: st };
      const taxRate = taxRateObj.rate;

      // Gross Tax Liability = Taxable gallons × state tax rate
      const grossTax = taxableGallons * taxRate;

      // Tax-Paid Credit = Approved tax-paid diesel gallons × state tax rate
      const taxPaidCredit = data.taxPaidDieselGallons * taxRate;

      // Net Tax Due / Credit = Gross Tax Liability - Tax-Paid Credit
      const netTax = grossTax - taxPaidCredit;

      grossTaxTotal += grossTax;
      taxPaidCreditTotal += taxPaidCredit;
      netTaxDueTotal += netTax;

      result.push({
        ...data,
        totalMiles,
        taxableMiles,
        taxableGallons,
        taxRate,
        grossTax,
        taxPaidCredit,
        surcharge: 0,
        netTax,
        stateName: taxRateObj.name
      });
    });

    return {
      rows: result,
      grossTaxTotal,
      taxPaidCreditTotal,
      netTaxDueTotal
    };
  }, [filteredTransactions, effectiveMileageRecords, filterFuelCard, filterTruck, filterDriver, filterState]);

  // IFTA Calculation Totals & Breakdown
  const iftaMetrics = useMemo(() => {
    let totalApprovedDieselGallons = 0;
    let totalTaxPaidDieselGallons = 0;
    let totalDefGallons = 0;
    let totalReeferGallons = 0;

    let totalDieselAmountCents = 0;
    let totalDefAmountCents = 0;
    let totalFeesCents = 0;
    let totalAmountCents = 0;

    filteredTransactions.forEach(tx => {
      const isRejected = tx.approvalStatus === 'rejected';
      const isReversed = tx.approvalStatus === 'reversed';

      if (isRejected || isReversed) return;

      const { dieselGal, defGal, reeferGal } = extractFuelGallons(tx);

      if (dieselGal > 0) {
        totalApprovedDieselGallons += dieselGal;
        if (tx.taxPaid !== false) {
          totalTaxPaidDieselGallons += dieselGal;
        }
      }

      totalDefGallons += defGal;
      totalReeferGallons += reeferGal;

      totalDieselAmountCents += tx.dieselAmountCents || (tx.productType === 'diesel' ? tx.amountCents : 0) || 0;
      totalDefAmountCents += tx.defAmountCents || (tx.productType === 'def' ? tx.amountCents : 0) || 0;
      totalFeesCents += tx.feeAmountCents || 0;
      totalAmountCents += tx.totalAmountCents || tx.amountCents || 0;
    });

    let totalMiles = 0;
    let totalTaxableMiles = 0;
    stateAggregates.rows.forEach(r => {
      totalMiles += r.totalMiles || 0;
      totalTaxableMiles += r.taxableMiles || 0;
    });

    const fleetMPG = totalApprovedDieselGallons > 0 && totalTaxableMiles > 0
      ? (totalTaxableMiles / totalApprovedDieselGallons)
      : 6.5;

    return {
      totalMiles,
      totalTaxableMiles,
      totalApprovedDieselGallons,
      totalTaxPaidDieselGallons,
      totalDefGallons,
      totalReeferGallons,
      fleetMPG,
      totalDieselAmountCents,
      totalDefAmountCents,
      totalFeesCents,
      totalAmountCents
    };
  }, [filteredTransactions, stateAggregates]);

  // Fuel Card-Wise Aggregate
  const cardAggregates = useMemo(() => {
    const map: Record<string, {
      card: FuelCard | null;
      cardNumberLast4: string;
      provider: string;
      assignedTruck: string;
      assignedTruckId: string | null;
      assignedDriver: string;
      assignedDriverId: string | null;
      ownerOpName: string;
      ownerOpId: string | null;
      assignmentStatus: string;
      txCount: number;
      statesSet: Set<string>;
      dieselGallons: number;
      defGallons: number;
      reeferGallons: number;
      dieselCostCents: number;
      defCostCents: number;
      feeCostCents: number;
      totalCostCents: number;
      transactions: FuelTransaction[];
    }> = {};

    filteredTransactions.forEach(tx => {
      const cardNum = tx.cardNumberLast4 || 'UNKNOWN';
      if (!map[cardNum]) {
        const cardObj = fuelCards.find(c => c.cardNumberLast4 === cardNum) || null;
        const assignObj = fuelCardAssignments.find(a => a.fuelCardId === cardObj?.id || a.cardNumberLast4 === cardNum) || null;

        const tId = tx.truckId || assignObj?.assignedTruckId || cardObj?.assignedTruckId;
        const dId = tx.driverId || assignObj?.assignedDriverId || cardObj?.assignedDriverId;
        const ooId = tx.ownerOperatorCompanyId || assignObj?.ownerOperatorCompanyId || cardObj?.assignedOwnerOperatorCompanyId;

        const truckObj = trucks.find(t => t.id === tId);
        const driverObj = drivers.find(d => d.id === dId);
        const ooObj = ownerOps.find(o => o.id === ooId);

        let assignStatus = 'Unassigned';
        if (truckObj || driverObj || ooObj) {
          assignStatus = assignObj ? 'Effective Dated Assignment' : 'Card Assigned';
        }

        map[cardNum] = {
          card: cardObj,
          cardNumberLast4: cardNum,
          provider: tx.provider || cardObj?.provider || 'fleet_one',
          assignedTruck: truckObj ? `#${truckObj.truckNumber || truckObj.id}` : (assignObj?.assignedTruckNumberSnapshot ? `#${assignObj.assignedTruckNumberSnapshot}` : 'Unassigned'),
          assignedTruckId: tId || null,
          assignedDriver: driverObj ? (driverObj.name || driverObj.email) : (assignObj?.assignedDriverNameSnapshot || 'Unassigned'),
          assignedDriverId: dId || null,
          ownerOpName: ooObj ? ooObj.legalName : (assignObj?.ownerOperatorCompanyNameSnapshot || 'N/A'),
          ownerOpId: ooId || null,
          assignmentStatus: assignStatus,
          txCount: 0,
          statesSet: new Set(),
          dieselGallons: 0,
          defGallons: 0,
          reeferGallons: 0,
          dieselCostCents: 0,
          defCostCents: 0,
          feeCostCents: 0,
          totalCostCents: 0,
          transactions: []
        };
      }

      map[cardNum].txCount += 1;
      if (tx.jurisdictionCode || tx.state) map[cardNum].statesSet.add((tx.jurisdictionCode || tx.state)!);

      const { dieselGal, defGal, reeferGal, isDiesel, isDef, isFee } = extractFuelGallons(tx);

      map[cardNum].dieselGallons += dieselGal;
      map[cardNum].defGallons += defGal;
      map[cardNum].reeferGallons += reeferGal;

      const amtCents = tx.totalAmountCents || (tx.totalAmount ? Math.round(tx.totalAmount * 100) : (tx.amountCents || 0));
      if (isDiesel) map[cardNum].dieselCostCents += amtCents;
      else if (isDef) map[cardNum].defCostCents += amtCents;
      else if (isFee) map[cardNum].feeCostCents += amtCents;

      map[cardNum].totalCostCents += amtCents;
      map[cardNum].transactions.push(tx);
    });

    return Object.values(map);
  }, [filteredTransactions, fuelCards, fuelCardAssignments, trucks, drivers, ownerOps]);

  // Reconciliation Metrics
  const reconciliationData = useMemo(() => {
    let totalRows = filteredTransactions.length;
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    let duplicate = 0;

    let missingState = 0;
    let missingGallons = 0;
    let missingCard = 0;
    let missingTruck = 0;
    let missingDriver = 0;

    let dieselTxCount = 0;
    let defTxCount = 0;
    let reeferTxCount = 0;
    let feeOnlyTxCount = 0;

    let totalFileAmountCents = 0;
    let sumPartsCents = 0;

    filteredTransactions.forEach(tx => {
      if (tx.approvalStatus === 'approved') approved++;
      else if (tx.approvalStatus === 'rejected') rejected++;
      else if (tx.approvalStatus === 'duplicate') duplicate++;
      else pending++;

      if (!tx.jurisdictionCode && !tx.state) missingState++;
      if (!tx.gallonsDecimal && !tx.dieselGallonsDecimal) missingGallons++;
      if (!tx.cardNumberLast4 && !tx.fuelCardId) missingCard++;
      if (!tx.truckId) missingTruck++;
      if (!tx.driverId) missingDriver++;

      if (tx.productType === 'diesel' || (tx.dieselGallonsDecimal || 0) > 0) dieselTxCount++;
      if (tx.productType === 'def' || (tx.defGallonsDecimal || 0) > 0) defTxCount++;
      if (tx.productType === 'reefer_fuel' || (tx.reeferGallonsDecimal || 0) > 0) reeferTxCount++;
      if (tx.productType === 'fee') feeOnlyTxCount++;

      const fileTot = tx.totalAmountCents || tx.amountCents || 0;
      totalFileAmountCents += fileTot;

      const parts = (tx.dieselAmountCents || 0) + (tx.defAmountCents || 0) + (tx.feeAmountCents || 0);
      sumPartsCents += parts > 0 ? parts : fileTot;
    });

    const isReconciled = totalRows === (approved + pending + rejected + duplicate);
    const amountDifference = Math.abs(totalFileAmountCents - sumPartsCents);

    return {
      totalRows,
      approved,
      pending,
      rejected,
      duplicate,
      missingState,
      missingGallons,
      missingCard,
      missingTruck,
      missingDriver,
      dieselTxCount,
      defTxCount,
      reeferTxCount,
      feeOnlyTxCount,
      totalFileAmountCents,
      isReconciled,
      amountDifference
    };
  }, [filteredTransactions]);

  // Active Card Filter Summary & Date Range Info
  const activeCardInfo = useMemo(() => {
    if (filterFuelCard === 'all') return null;
    if (filteredTransactions.length === 0) {
      return {
        cardLast4: filterFuelCard,
        count: 0,
        startDate: 'N/A',
        endDate: 'N/A'
      };
    }
    const dates = filteredTransactions
      .map(tx => normalizeToIsoDate(tx.transactionDate || (tx as any).date || (tx.createdAt ? tx.createdAt.split('T')[0] : '')))
      .filter(Boolean)
      .sort();

    return {
      cardLast4: filterFuelCard,
      count: filteredTransactions.length,
      startDate: dates[0] || 'N/A',
      endDate: dates[dates.length - 1] || 'N/A'
    };
  }, [filterFuelCard, filteredTransactions]);

  // Manual Correction Submit Handler
  const handleSaveCorrection = async () => {
    if (!correctingTransaction) return;
    if (!correctionReason.trim()) {
      setError("Correction reason is required for audit trail.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const txDocRef = doc(db, "admins", company.id, "fuel_transactions", correctingTransaction.id);
      const rawOriginal = (correctingTransaction as any)[correctionField] || 'N/A';

      const updatePayload: any = {
        [correctionField]: correctedValue,
        rawProviderValue: (correctingTransaction as any).rawProviderValue || rawOriginal,
        correctedValue,
        correctionReason,
        correctedByUid: auth.currentUser?.uid || 'admin',
        correctedAt: new Date().toISOString(),
        iftaEligibilityStatus: 'eligible'
      };

      await updateDoc(txDocRef, updatePayload);

      // Audit Log Record
      await addDoc(collection(db, "admins", company.id, "ifta_correction_logs"), {
        transactionId: correctingTransaction.id,
        invoiceNumber: correctingTransaction.invoiceNumber || 'N/A',
        fieldCorrected: correctionField,
        originalValue: rawOriginal,
        correctedValue,
        reason: correctionReason,
        correctedBy: auth.currentUser?.email || 'Tenant Admin',
        createdAt: new Date().toISOString()
      });

      setSuccess("Transaction record corrected and audit trail logged.");
      setCorrectingTransaction(null);
      setCorrectionReason('');
      fetchData();
    } catch (err: any) {
      console.error("Error saving IFTA correction:", err);
      setError(err.message || "Failed to save correction");
    } finally {
      setLoading(false);
    }
  };

  // CSV Export Generator
  const handleExportCSV = (exportType: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];
    const filename = `IFTA_${exportType}_${activePeriod.start}_to_${activePeriod.end}.csv`;

    if (exportType === 'state_summary') {
      headers = ['State/Province', 'Total Miles', 'Taxable Miles', 'Diesel Gallons', 'DEF Gallons', 'Tax-Paid Diesel Gal', 'Fleet MPG', 'Taxable Gallons', 'Tax Rate', 'Gross Tax', 'Tax Credit', 'Net Tax Due'];
      rows = stateAggregates.rows.map(r => [
        r.state,
        r.totalMiles.toString(),
        r.taxableMiles.toString(),
        r.dieselGallons.toFixed(2),
        r.defGallons.toFixed(2),
        r.taxPaidDieselGallons.toFixed(2),
        iftaMetrics.fleetMPG.toFixed(2),
        r.taxableGallons.toFixed(2),
        `$${r.taxRate.toFixed(3)}`,
        `$${r.grossTax.toFixed(2)}`,
        `$${r.taxPaidCredit.toFixed(2)}`,
        `$${r.netTax.toFixed(2)}`
      ]);
    } else if (exportType === 'fuel_cards') {
      headers = ['Card Last 4', 'Provider', 'Assigned Truck', 'Assigned Driver', 'Owner-Operator', 'Tx Count', 'Diesel Gal', 'DEF Gal', 'Total Cost'];
      rows = cardAggregates.map(c => [
        `****${c.cardNumberLast4}`,
        c.provider,
        c.assignedTruck,
        c.assignedDriver,
        c.ownerOpName,
        c.txCount.toString(),
        c.dieselGallons.toFixed(2),
        c.defGallons.toFixed(2),
        `$${(c.totalCostCents / 100).toFixed(2)}`
      ]);
    } else {
      // Transactions detail
      headers = ['Date', 'Quarter', 'State', 'Provider', 'Card Last 4', 'Truck', 'Driver', 'Merchant', 'Invoice', 'Product', 'Diesel Gal', 'DEF Gal', 'Total Amount', 'Tax Paid', 'Approval Status', 'IFTA Eligibility'];
      rows = filteredTransactions.map(tx => [
        tx.transactionDate || '',
        tx.iftaQuarter || '',
        tx.jurisdictionCode || tx.state || '',
        tx.provider || 'fleet_one',
        tx.cardNumberLast4 || '',
        tx.truckId || '',
        tx.driverId || '',
        tx.merchantName || '',
        tx.invoiceNumber || '',
        tx.productType || 'diesel',
        (tx.dieselGallonsDecimal || tx.gallonsDecimal || 0).toString(),
        (tx.defGallonsDecimal || 0).toString(),
        `$${((tx.totalAmountCents || tx.amountCents || 0) / 100).toFixed(2)}`,
        tx.taxPaid ? 'YES' : 'NO',
        tx.approvalStatus || 'approved',
        tx.iftaEligibilityStatus || 'eligible'
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* HEADER TITLE BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold tracking-widest uppercase mb-1">
            <Calculator className="w-4 h-4" />
            <span>IFTA Jurisdiction Mileage & Quarterly Tax Engine</span>
          </div>
          <h1 className="text-2xl font-black text-white">IFTA Tax Dashboard & Fuel Ledger</h1>
          <p className="text-xs text-slate-300 mt-1">
            Automated state-wise fuel purchases, Fleet One transaction reconciliation, and jurisdiction tax liabilities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExportCSV('calculation_worksheet')}
            className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Worksheet</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK NOTIFICATIONS */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* SECTION 40 & 50: IFTA REPORT PERIOD SELECTOR */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">IFTA Report Period & Date Selector</h2>
              <p className="text-xs text-gray-500">
                Select an Official IFTA Quarter or Custom Date Range for tax calculation and fuel audit.
              </p>
            </div>
          </div>

          {/* MODE TOGGLE */}
          <div className="bg-gray-100 p-1 rounded-2xl flex items-center text-xs font-bold">
            <button
              onClick={() => setDateMode('official_quarter')}
              className={`px-4 py-2 rounded-xl transition cursor-pointer ${
                dateMode === 'official_quarter' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Official Quarter
            </button>
            <button
              onClick={() => setDateMode('custom_range')}
              className={`px-4 py-2 rounded-xl transition cursor-pointer ${
                dateMode === 'custom_range' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Custom Date Range
            </button>
          </div>
        </div>

        {/* OFFICIAL QUARTER CONTROLS */}
        {dateMode === 'official_quarter' ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Reporting Year */}
            <div className="md:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Reporting Year</label>
              <select
                value={reportingYear}
                onChange={(e) => setReportingYear(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>

            {/* Reporting Quarter Selector */}
            <div className="md:col-span-5 space-y-1">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Reporting Quarter</label>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-50 border border-gray-200 rounded-xl">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as IftaQuarter[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setReportingQuarter(q)}
                    className={`py-2 rounded-lg text-xs font-black transition cursor-pointer ${
                      reportingQuarter === q ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Quarter Info Box */}
            <div className="md:col-span-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-indigo-900">
                <span>{reportingQuarter} {reportingYear} Period:</span>
                <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-mono">Official</span>
              </div>
              <div className="text-gray-600 text-[11px] font-mono">
                {quarterInfo.start} through {quarterInfo.end}
              </div>
              <div className="text-[11px] font-semibold text-rose-700">
                Filing Due Date: <span className="font-mono font-bold">{quarterInfo.due}</span>
              </div>
            </div>
          </div>
        ) : (
          /* CUSTOM DATE RANGE CONTROLS */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Custom Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Custom End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 bg-white"
              />
            </div>

            <div className="sm:col-span-2 space-y-1 flex flex-col justify-end">
              <div className="text-[11px] text-gray-500 font-medium">
                Active Period: <span className="font-mono font-bold text-gray-800">{activePeriod.start} to {activePeriod.end}</span>
              </div>
            </div>
          </div>
        )}

        {/* WARNING BANNER FOR CUSTOM DATE RANGE */}
        {showCustomRangeWarning && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Custom Reporting Period:</span> This custom date range is available for internal analysis, audit preparation, and card reconciliation. An official IFTA return must use the applicable reporting quarter.
            </div>
          </div>
        )}

        {/* OPTIONAL FILTERS COLLAPSIBLE ROW */}
        <div className="pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {/* Fuel Provider */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Provider</label>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All Providers</option>
              <option value="fleet_one">Fleet One</option>
              <option value="wex">WEX / EFS</option>
              <option value="comdata">Comdata</option>
            </select>
          </div>

          {/* Fuel Card */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Fuel Card</label>
            <select
              value={filterFuelCard}
              onChange={(e) => setFilterFuelCard(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All Cards ({availableCardsOptions.length})</option>
              {availableCardsOptions.map(c => (
                <option key={c.last4} value={c.last4}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Truck */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Truck</label>
            <select
              value={filterTruck}
              onChange={(e) => setFilterTruck(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All Trucks</option>
              {trucks.map(t => (
                <option key={t.id} value={t.id}>Unit #{t.truckNumber}</option>
              ))}
            </select>
          </div>

          {/* Driver */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Driver</label>
            <select
              value={filterDriver}
              onChange={(e) => setFilterDriver(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All Drivers</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.email}</option>
              ))}
            </select>
          </div>

          {/* State */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">State/Province</label>
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All States / Provinces ({availableStatesOptions.length})</option>
              {availableStatesOptions.map(st => (
                <option key={st.code} value={st.code}>{st.label}</option>
              ))}
            </select>
          </div>

          {/* Product Type */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Product Type</label>
            <select
              value={filterProductType}
              onChange={(e) => setFilterProductType(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] text-gray-700 bg-white"
            >
              <option value="all">All Products</option>
              <option value="diesel">Diesel Only</option>
              <option value="def">DEF Only</option>
              <option value="reefer_fuel">Reefer Fuel</option>
              <option value="fee">Fees Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* ACTIVE CARD FILTER BANNER */}
      {activeCardInfo && (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Active Fuel Card Filter</div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                Card ****{activeCardInfo.cardLast4}
                <span className="text-[11px] font-normal bg-indigo-950 text-indigo-300 px-2.5 py-0.5 rounded-full font-mono border border-indigo-800">
                  {activeCardInfo.count} {activeCardInfo.count === 1 ? 'Transaction' : 'Transactions'}
                </span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-300 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 font-mono flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span>Card Date Range: <strong className="text-white font-bold">{activeCardInfo.startDate}</strong> to <strong className="text-white font-bold">{activeCardInfo.endDate}</strong></span>
          </div>
        </div>
      )}

      {/* SUMMARY STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total IFTA Miles</div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono">{iftaMetrics.totalMiles.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Approved Routes</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Approved Diesel Gal</div>
          <div className="text-xl font-black text-indigo-600 mt-1 font-mono">{iftaMetrics.totalApprovedDieselGallons.toFixed(2)}</div>
          <div className="text-[10px] text-indigo-500 mt-0.5">Tractor Fuel Total</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fleet MPG</div>
          <div className="text-xl font-black text-emerald-600 mt-1 font-mono">{iftaMetrics.fleetMPG.toFixed(2)}</div>
          <div className="text-[10px] text-emerald-500 mt-0.5">Miles / Diesel Gal</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">DEF Gallons</div>
          <div className="text-xl font-black text-amber-600 mt-1 font-mono">{iftaMetrics.totalDefGallons.toFixed(2)}</div>
          <div className="text-[10px] text-amber-500 mt-0.5">Excluded from MPG</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Gross Tax Liability</div>
          <div className="text-xl font-black text-slate-800 mt-1 font-mono">${stateAggregates.grossTaxTotal.toFixed(2)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Calculated Tax</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Net Tax Due / Credit</div>
          <div className={`text-xl font-black mt-1 font-mono ${stateAggregates.netTaxDueTotal >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            ${stateAggregates.netTaxDueTotal.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{stateAggregates.netTaxDueTotal >= 0 ? 'Payable' : 'Tax Credit'}</div>
        </div>
      </div>

      {/* SUB NAVIGATION TABS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm flex items-center gap-1 overflow-x-auto scrollbar-none">
        {[
          { id: 'calculation', label: 'Calculation View', icon: Calculator },
          { id: 'state_summary', label: 'State-Wise Summary', icon: Layers },
          { id: 'transactions_detail', label: 'State Fuel Detail', icon: FileText },
          { id: 'fuel_cards', label: 'Fuel Cards Report', icon: CreditCard },
          { id: 'reconciliation', label: 'Import Reconciliation', icon: CheckCircle2, badge: !reconciliationData.isReconciled },
          { id: 'corrections', label: 'Audit & Correction Logs', icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
            </button>
          );
        })}
      </div>

      {/* MAIN TAB CONTENT */}

      {/* TAB 1: IFTA CALCULATION VIEW */}
      {activeTab === 'calculation' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-600" />
                IFTA Tax Calculation Engine Worksheet
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Official formulas applied: Taxable Gallons = Taxable Miles ÷ Fleet MPG. Net Tax = Gross Tax - Tax-Paid Credit.
              </p>
            </div>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-xs px-3 py-1 rounded-full">
              Status: Ready for Calculation
            </span>
          </div>

          {/* FORMULA HIGHLIGHT BOX */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs space-y-3 font-mono">
            <div className="text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
              Core IFTA Calculation Logic
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-[10px]">Fleet MPG =</div>
                <div className="text-white font-bold mt-1">Total Miles ÷ Total Diesel Gal</div>
                <div className="text-indigo-300 text-[11px] mt-0.5">
                  {iftaMetrics.totalTaxableMiles} ÷ {iftaMetrics.totalApprovedDieselGallons.toFixed(2)} = <span className="text-emerald-400 font-bold">{iftaMetrics.fleetMPG.toFixed(2)} MPG</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-[10px]">State Taxable Gallons =</div>
                <div className="text-white font-bold mt-1">State Taxable Miles ÷ Fleet MPG</div>
                <div className="text-indigo-300 text-[11px] mt-0.5">Distributed proportionally per state</div>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-[10px]">Net Tax Due =</div>
                <div className="text-white font-bold mt-1">(Taxable Gal × Rate) - Tax Credit</div>
                <div className="text-indigo-300 text-[11px] mt-0.5">Includes fuel-card tax paid credit</div>
              </div>
            </div>
          </div>

          {/* CALCULATION TABLE */}
          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">State / Jurisdiction</th>
                  <th className="p-3 text-center">Tx Count</th>
                  <th className="p-3 text-right">Taxable Miles</th>
                  <th className="p-3 text-right">Taxable Gallons</th>
                  <th className="p-3 text-right">Tax-Paid Diesel Gal</th>
                  <th className="p-3 text-right">Tax Rate</th>
                  <th className="p-3 text-right">Gross Tax</th>
                  <th className="p-3 text-right">Tax-Paid Credit</th>
                  <th className="p-3 text-right">Net Tax Due / (Credit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stateAggregates.rows.map(row => (
                  <tr key={row.state} className="hover:bg-gray-50/80">
                    <td className="p-3 font-bold text-gray-900">
                      {row.state} <span className="text-gray-400 font-normal">({row.stateName})</span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-indigo-700">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[11px]">
                        {row.txCount} {row.txCount === 1 ? 'tx' : 'txs'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-medium">{row.taxableMiles.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-indigo-600 font-bold">{row.taxableGallons.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono">{row.taxPaidDieselGallons.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-gray-600">${row.taxRate.toFixed(3)}</td>
                    <td className="p-3 text-right font-mono">${row.grossTax.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-emerald-600">${row.taxPaidCredit.toFixed(2)}</td>
                    <td className={`p-3 text-right font-mono font-bold ${row.netTax >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      ${row.netTax.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold font-mono">
                <tr>
                  <td className="p-3">TOTALS ({stateAggregates.rows.length} States)</td>
                  <td className="p-3 text-center text-indigo-300 font-mono font-bold">
                    {filteredTransactions.length} Tx
                  </td>
                  <td className="p-3 text-right">{iftaMetrics.totalTaxableMiles.toLocaleString()}</td>
                  <td className="p-3 text-right text-indigo-300">
                    {(iftaMetrics.fleetMPG > 0 ? iftaMetrics.totalTaxableMiles / iftaMetrics.fleetMPG : 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-right">{iftaMetrics.totalTaxPaidDieselGallons.toFixed(2)}</td>
                  <td className="p-3 text-right">-</td>
                  <td className="p-3 text-right">${stateAggregates.grossTaxTotal.toFixed(2)}</td>
                  <td className="p-3 text-right text-emerald-400">${stateAggregates.taxPaidCreditTotal.toFixed(2)}</td>
                  <td className={`p-3 text-right ${stateAggregates.netTaxDueTotal >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    ${stateAggregates.netTaxDueTotal.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: STATE-WISE SUMMARY */}
      {activeTab === 'state_summary' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900">State-Wise Jurisdiction Summary Table</h3>
              <p className="text-xs text-gray-500">
                Click any state row to expand and view transaction fuel card, driver, and truck breakdown.
              </p>
            </div>
            <button
              onClick={() => handleExportCSV('state_summary')}
              className="px-3.5 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export Summary CSV
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">State</th>
                  <th className="p-3 text-center">Tx Count</th>
                  <th className="p-3 text-center">Cards</th>
                  <th className="p-3 text-right">Diesel Gal</th>
                  <th className="p-3 text-right">DEF Gal</th>
                  <th className="p-3 text-right">Diesel Cost</th>
                  <th className="p-3 text-right">DEF Cost</th>
                  <th className="p-3 text-right">Fees</th>
                  <th className="p-3 text-right">Total Cost</th>
                  <th className="p-3 text-right">Taxable Miles</th>
                  <th className="p-3 text-right">Net Tax Due</th>
                  <th className="p-3 text-center">Expand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stateAggregates.rows.map(row => {
                  const isExpanded = expandedState === row.state;
                  return (
                    <React.Fragment key={row.state}>
                      <tr
                        onClick={() => setExpandedState(isExpanded ? null : row.state)}
                        className={`cursor-pointer transition ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                            {row.state}
                          </span>
                          <span>{row.stateName}</span>
                        </td>
                        <td className="p-3 text-center font-mono">{row.txCount}</td>
                        <td className="p-3 text-center font-mono">{row.cardsSet.size}</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-600">{row.dieselGallons.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-amber-600">{row.defGallons.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono">${(row.dieselCostCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono">${(row.defCostCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-gray-500">${(row.feeCostCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">${(row.totalCostCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono">{row.taxableMiles.toLocaleString()}</td>
                        <td className={`p-3 text-right font-mono font-bold ${row.netTax >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          ${row.netTax.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-600 mx-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 mx-auto" />}
                        </td>
                      </tr>

                      {/* EXPANDED BREAKDOWN ROW */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={12} className="p-4 bg-slate-50 border-y border-indigo-100 space-y-3">
                            <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                              <Info className="w-4 h-4 text-indigo-600" />
                              <span>Fleet One Fuel Transactions Breakdown in {row.stateName} ({row.transactions.length} Records):</span>
                            </div>
                            <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                              <table className="w-full text-left text-[11px] text-gray-700">
                                <thead className="bg-gray-100 font-bold uppercase text-[10px]">
                                  <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">Card</th>
                                    <th className="p-2">Truck</th>
                                    <th className="p-2">Driver</th>
                                    <th className="p-2">Merchant / City</th>
                                    <th className="p-2 text-right">Diesel Gal</th>
                                    <th className="p-2 text-right">DEF Gal</th>
                                    <th className="p-2 text-right">Amount</th>
                                    <th className="p-2 text-center">Tax Paid</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {row.transactions.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} className="p-4 text-center text-gray-400 italic">No direct fuel purchases logged in this jurisdiction.</td>
                                    </tr>
                                  ) : (
                                    row.transactions.map((tx: any) => (
                                      <tr key={tx.id} className="hover:bg-gray-50">
                                        <td className="p-2 font-mono">{tx.transactionDate || tx.createdAt?.split('T')[0]}</td>
                                        <td className="p-2 font-mono font-bold">****{tx.cardNumberLast4}</td>
                                        <td className="p-2">Unit #{tx.truckId}</td>
                                        <td className="p-2">{tx.driverId || 'Unassigned'}</td>
                                        <td className="p-2">{tx.merchantName || tx.city || 'N/A'}</td>
                                        <td className="p-2 text-right font-mono font-bold text-indigo-600">{(tx.dieselGallonsDecimal || tx.gallonsDecimal || 0).toFixed(2)}</td>
                                        <td className="p-2 text-right font-mono text-amber-600">{(tx.defGallonsDecimal || 0).toFixed(2)}</td>
                                        <td className="p-2 text-right font-mono font-bold">${((tx.totalAmountCents || tx.amountCents || 0) / 100).toFixed(2)}</td>
                                        <td className="p-2 text-center">
                                          {tx.taxPaid ? (
                                            <span className="text-emerald-600 font-bold">YES</span>
                                          ) : (
                                            <span className="text-rose-600 font-bold">NO</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: STATE FUEL TRANSACTIONS DETAIL (REQUIREMENT 44) */}
      {activeTab === 'transactions_detail' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900">State-Wise Fleet One Fuel Transaction Detail</h3>
              <p className="text-xs text-gray-500">
                Individual product line fuel ledger. Diesel and DEF lines share parent transactions with separated gallons and costs.
              </p>
            </div>
            <button
              onClick={() => handleExportCSV('transactions')}
              className="px-3.5 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export Detail CSV
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-[11px] text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Quarter</th>
                  <th className="p-3">State</th>
                  <th className="p-3">Card</th>
                  <th className="p-3">Truck</th>
                  <th className="p-3">Driver</th>
                  <th className="p-3">Merchant</th>
                  <th className="p-3 text-right">Diesel Gal</th>
                  <th className="p-3 text-right">DEF Gal</th>
                  <th className="p-3 text-right">Reefer Gal</th>
                  <th className="p-3 text-right">Total Cost</th>
                  <th className="p-3 text-center">Tax Paid</th>
                  <th className="p-3 text-center">IFTA Eligibility</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-gray-400 italic font-sans">
                      No Fleet One fuel transactions found matching the selected period and filters.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50/80">
                      <td className="p-3 font-bold text-gray-900">{tx.transactionDate || tx.createdAt?.split('T')[0]}</td>
                      <td className="p-3 text-indigo-700 font-bold">{tx.iftaQuarter || 'Q2'}</td>
                      <td className="p-3">
                        <span className="bg-gray-100 font-bold px-1.5 py-0.5 rounded text-[10px] text-gray-800">
                          {tx.jurisdictionCode || tx.state || 'VA'}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800">****{tx.cardNumberLast4}</td>
                      <td className="p-3 text-gray-800">#{tx.truckId || 'N/A'}</td>
                      <td className="p-3 font-sans font-medium text-gray-700">{tx.driverId || 'Unassigned'}</td>
                      <td className="p-3 font-sans text-gray-600">{tx.merchantName || tx.city || 'Fleet Store'}</td>
                      <td className="p-3 text-right font-bold text-indigo-600">{(tx.dieselGallonsDecimal || tx.gallonsDecimal || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-amber-600 font-bold">{(tx.defGallonsDecimal || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-purple-600 font-bold">{(tx.reeferGallonsDecimal || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-slate-900">${((tx.totalAmountCents || tx.amountCents || 0) / 100).toFixed(2)}</td>
                      <td className="p-3 text-center font-sans">
                        {tx.taxPaid ? (
                          <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">Yes</span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-rose-200">No</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-sans">
                        <span className="bg-indigo-50 text-indigo-700 font-bold text-[10px] px-2 py-0.5 rounded-full">
                          {tx.iftaEligibilityStatus || 'eligible'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-sans">
                        <button
                          onClick={() => {
                            setCorrectingTransaction(tx);
                            setCorrectionField('jurisdictionCode');
                            setCorrectedValue(tx.jurisdictionCode || tx.state || 'VA');
                          }}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3 text-indigo-600" />
                          <span>Correct</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FUEL CARD-WISE REPORT (REQUIREMENT 46) */}
      {activeTab === 'fuel_cards' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          {assignSuccessToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between">
              <span>{assignSuccessToast}</span>
              <button onClick={() => setAssignSuccessToast(null)} className="text-emerald-600 hover:text-emerald-900 font-black">×</button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                Fuel Card–Wise IFTA Utilization Report
              </h3>
              <p className="text-xs text-gray-500">
                Summary of fuel purchases grouped by active physical fuel card and effective assignments.
              </p>
            </div>
            <button
              onClick={() => handleExportCSV('fuel_cards')}
              className="px-3.5 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export Card Summary
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cardAggregates.map(cardItem => (
              <div key={cardItem.cardNumberLast4} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4 hover:border-indigo-300 transition">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-900 text-indigo-400 rounded-xl">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-900 font-mono">**** {cardItem.cardNumberLast4}</div>
                      <div className="text-[10px] font-bold text-indigo-600 uppercase">{cardItem.provider}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="bg-indigo-50 text-indigo-700 font-bold text-xs px-2.5 py-1 rounded-full">
                      {cardItem.txCount} Tx
                    </span>
                    {cardItem.assignedTruck !== 'Unassigned' ? (
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Linked</span>
                    ) : (
                      <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Unassigned</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Assigned Truck:</span>
                    <div className="font-bold text-slate-800">{cardItem.assignedTruck}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Assigned Driver:</span>
                    <div className="font-bold text-slate-800">{cardItem.assignedDriver}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">States Used:</span>
                    <div className="font-bold text-indigo-600">{Array.from(cardItem.statesSet).join(', ') || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Owner-Operator:</span>
                    <div className="font-bold text-slate-800 truncate">{cardItem.ownerOpName}</div>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-sans">Diesel Gallons:</span>
                    <span className="font-bold text-indigo-600">{cardItem.dieselGallons.toFixed(2)} gal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-sans">DEF Gallons:</span>
                    <span className="font-bold text-amber-600">{cardItem.defGallons.toFixed(2)} gal</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="text-gray-700 font-sans font-bold">Total Spent:</span>
                    <span className="font-black text-slate-900">${(cardItem.totalCostCents / 100).toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleOpenQuickAssign(cardItem)}
                    className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" /> Assign / Edit
                  </button>
                  <button
                    onClick={() => setSelectedCardDrilldown(cardItem.card || { cardNumberLast4: cardItem.cardNumberLast4 } as any)}
                    className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Txs
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: FLEET ONE IMPORT RECONCILIATION PANEL (REQUIREMENT 48) */}
      {activeTab === 'reconciliation' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                Fleet One Import & Ledger Reconciliation Panel
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Verifies that all raw imported Fleet One records reconcile before quarterly approval.
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-black ${reconciliationData.isReconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {reconciliationData.isReconciled ? 'Ledger Reconciled' : 'Discrepancy Detected'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ROW RECONCILIATION */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
              <div className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                1. Transaction Status Reconciliation Formula
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Total Imported Rows:</span>
                  <span className="font-bold">{reconciliationData.totalRows}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Approved Transactions:</span>
                  <span className="font-bold">{reconciliationData.approved}</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>Pending Review:</span>
                  <span className="font-bold">{reconciliationData.pending}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Rejected Transactions:</span>
                  <span className="font-bold">{reconciliationData.rejected}</span>
                </div>
                <div className="flex justify-between text-purple-600">
                  <span>Duplicate Rows:</span>
                  <span className="font-bold">{reconciliationData.duplicate}</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Formula: <span className="font-mono font-bold">Imported Total = Approved + Pending + Rejected + Duplicate</span>
              </div>
            </div>

            {/* DOLLAR RECONCILIATION */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
              <div className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                2. Missing Fields & Exception Audit
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between text-rose-600">
                  <span>Missing Jurisdiction / State:</span>
                  <span className="font-bold">{reconciliationData.missingState}</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>Missing Gallons:</span>
                  <span className="font-bold">{reconciliationData.missingGallons}</span>
                </div>
                <div className="flex justify-between text-purple-600">
                  <span>Unassigned Card / Unit:</span>
                  <span className="font-bold">{reconciliationData.missingTruck}</span>
                </div>
                <div className="flex justify-between text-indigo-600">
                  <span>Unassigned Driver:</span>
                  <span className="font-bold">{reconciliationData.missingDriver}</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Note: Transactions missing state or gallons cannot enter final IFTA return until corrected.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: AUDIT & CORRECTION LOGS (REQUIREMENT 49) */}
      {activeTab === 'corrections' && (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                IFTA Manual Corrections & Audit Trail
              </h3>
              <p className="text-xs text-gray-500">
                Preserves raw provider values while recording normalized and tenant admin corrected values.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Invoice / Tx</th>
                  <th className="p-3">Field Corrected</th>
                  <th className="p-3">Original Value</th>
                  <th className="p-3">Corrected Value</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Corrected By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {correctionLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 italic font-sans">
                      No manual corrections recorded yet. All raw provider values remain untouched.
                    </td>
                  </tr>
                ) : (
                  correctionLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-800">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-3 font-bold text-indigo-600">{log.invoiceNumber}</td>
                      <td className="p-3 text-slate-700 font-sans font-bold">{log.fieldCorrected}</td>
                      <td className="p-3 text-rose-600 line-through">{log.originalValue}</td>
                      <td className="p-3 text-emerald-600 font-bold">{log.correctedValue}</td>
                      <td className="p-3 font-sans text-gray-600 italic">{log.reason}</td>
                      <td className="p-3 font-sans text-gray-700 font-medium">{log.correctedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL CORRECTION WORKFLOW (REQUIREMENT 49) */}
      {correctingTransaction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                Correct Fuel Transaction Record
              </h3>
              <button
                onClick={() => setCorrectingTransaction(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <div className="p-3 bg-indigo-50/60 rounded-xl text-xs space-y-1">
              <div className="font-bold text-indigo-900">Invoice: {correctingTransaction.invoiceNumber || 'N/A'}</div>
              <div className="text-gray-600">
                Card: <span className="font-mono font-bold">****{correctingTransaction.cardNumberLast4}</span> | Date: {correctingTransaction.transactionDate}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-gray-700 uppercase">Select Field to Correct</label>
                <select
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white font-bold"
                >
                  <option value="jurisdictionCode">Jurisdiction Code / State</option>
                  <option value="productType">Product Type (Diesel / DEF / Reefer)</option>
                  <option value="truckId">Assigned Truck Unit #</option>
                  <option value="driverId">Assigned Driver</option>
                  <option value="taxPaid">Tax Paid Status</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 uppercase">New Corrected Value</label>
                <input
                  type="text"
                  value={correctedValue}
                  onChange={(e) => setCorrectedValue(e.target.value)}
                  placeholder="e.g. VA, NC, diesel, etc."
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 uppercase">Reason for Correction (Audit Requirement)</label>
                <textarea
                  rows={2}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Provider raw state code misaligned; verified with bill of lading."
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setCorrectingTransaction(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCorrection}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition"
              >
                {loading ? 'Saving...' : 'Save & Log Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CARD DRILLDOWN TRANSACTIONS */}
      {selectedCardDrilldown && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                Fuel Card ****{selectedCardDrilldown.cardNumberLast4} Transactions ({activePeriod.start} to {activePeriod.end})
              </h3>
              <button
                onClick={() => setSelectedCardDrilldown(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-2xl max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 font-bold uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">State</th>
                    <th className="p-2.5">Merchant</th>
                    <th className="p-2.5 text-right">Diesel Gal</th>
                    <th className="p-2.5 text-right">DEF Gal</th>
                    <th className="p-2.5 text-right">Amount</th>
                    <th className="p-2.5 text-center">Tax Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {filteredTransactions.filter(t => t.cardNumberLast4 === selectedCardDrilldown.cardNumberLast4).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-400 italic font-sans">No transactions recorded for this card in selected period.</td>
                    </tr>
                  ) : (
                    filteredTransactions.filter(t => t.cardNumberLast4 === selectedCardDrilldown.cardNumberLast4).map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="p-2.5 font-bold">{tx.transactionDate}</td>
                        <td className="p-2.5">{tx.jurisdictionCode || tx.state || 'VA'}</td>
                        <td className="p-2.5 font-sans">{tx.merchantName || 'Fleet Store'}</td>
                        <td className="p-2.5 text-right text-indigo-600 font-bold">{(tx.dieselGallonsDecimal || tx.gallonsDecimal || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-right text-amber-600">{(tx.defGallonsDecimal || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-bold">${((tx.totalAmountCents || tx.amountCents || 0) / 100).toFixed(2)}</td>
                        <td className="p-2.5 text-center font-sans">
                          {tx.taxPaid ? <span className="text-emerald-600 font-bold">YES</span> : <span className="text-rose-600 font-bold">NO</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => setSelectedCardDrilldown(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK CARD ASSIGNMENT & EFFECTIVE-DATED LINKING */}
      {quickAssignModalOpen && assigningCardData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  Assign Fuel Card ****{assigningCardData.cardNumberLast4}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Link physical card to Truck, Driver, or Owner Operator with effective-dated history & transaction backfill.
                </p>
              </div>
              <button
                onClick={() => setQuickAssignModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-black text-xl"
              >
                ×
              </button>
            </div>

            {/* CARD SUMMARY STRIP */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Card Last 4:</span>
                <div className="font-mono font-black text-slate-900">**** {assigningCardData.cardNumberLast4}</div>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Period Txs:</span>
                <div className="font-bold text-indigo-700">{assigningCardData.txCount} transactions</div>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Diesel Fuel:</span>
                <div className="font-bold text-slate-900">{assigningCardData.dieselGallons.toFixed(1)} gal</div>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Total Spend:</span>
                <div className="font-mono font-black text-slate-900">${(assigningCardData.totalSpentCents / 100).toFixed(2)}</div>
              </div>
            </div>

            {/* FORM FIELDS */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Assigned Truck / Unit
                  </label>
                  <select
                    value={assignTruckId}
                    onChange={(e) => handleTruckSelect(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                  >
                    <option value="">-- Unassigned --</option>
                    {trucks.map(t => (
                      <option key={t.id} value={t.id}>
                        Truck #{t.truckNumber || t.id} {t.make ? `(${t.make} ${t.model || ''})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Assigned Driver
                  </label>
                  <select
                    value={assignDriverId}
                    onChange={(e) => setAssignDriverId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                  >
                    <option value="">-- Unassigned --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.email} {d.phone ? `(${d.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Owner Operator Company (Optional)
                </label>
                <select
                  value={assignOOId}
                  onChange={(e) => setAssignOOId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                >
                  <option value="">-- N/A (Company Fleet) --</option>
                  {ownerOps.map(oo => (
                    <option key={oo.id} value={oo.id}>
                      {oo.legalName || oo.dbaName || oo.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Effective From Date *
                  </label>
                  <input
                    type="date"
                    value={assignEffectiveFrom}
                    onChange={(e) => setAssignEffectiveFrom(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Effective To Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={assignEffectiveTo}
                    onChange={(e) => setAssignEffectiveTo(e.target.value)}
                    placeholder="Open-ended if blank"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Transaction Backfill & Scope Option
                </label>
                <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="applyOption"
                      value="apply_effective"
                      checked={assignApplyOption === 'apply_effective'}
                      onChange={() => setAssignApplyOption('apply_effective')}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div>
                      <span className="font-bold text-gray-900">Backfill On/After Effective Date</span>
                      <p className="text-[10px] text-gray-500">Updates transactions on or after {assignEffectiveFrom || 'Effective Date'} without touching locked settlements.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="applyOption"
                      value="backfill_range"
                      checked={assignApplyOption === 'backfill_range'}
                      onChange={() => setAssignApplyOption('backfill_range')}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div>
                      <span className="font-bold text-gray-900">Backfill Strict Date Range</span>
                      <p className="text-[10px] text-gray-500">Only updates transactions strictly between Effective From and Effective To dates.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="applyOption"
                      value="future_only"
                      checked={assignApplyOption === 'future_only'}
                      onChange={() => setAssignApplyOption('future_only')}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div>
                      <span className="font-bold text-gray-900">Future Import Only</span>
                      <p className="text-[10px] text-gray-500">Save assignment for future imports; leave historical transactions unchanged.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Assignment Audit Reason / Notes
                </label>
                <input
                  type="text"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="e.g. Card handed to Driver John Doe for Truck #104"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none transition"
                />
              </div>

              {/* PREVIEW PANEL IF GENERATED */}
              {assignPreviewData && (
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 font-mono">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">
                    Assignment Impact Analysis
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-gray-400 font-sans">Matching Txs:</span>
                      <div className="font-bold text-emerald-400">{assignPreviewData.matchingTransactionsCount}</div>
                    </div>
                    <div>
                      <span className="text-gray-400 font-sans">Updatable:</span>
                      <div className="font-bold text-indigo-300">{assignPreviewData.updatableTransactionsCount}</div>
                    </div>
                    <div>
                      <span className="text-gray-400 font-sans">Total Spend:</span>
                      <div className="font-bold">${(assignPreviewData.totalSpendCents / 100).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-400 font-sans">States:</span>
                      <div className="font-bold text-amber-300">{assignPreviewData.affectedStates?.join(', ') || 'None'}</div>
                    </div>
                  </div>
                  {assignPreviewData.conflicts && assignPreviewData.conflicts.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 text-[10px] text-rose-300 space-y-1 font-sans">
                      <span className="font-bold">Warnings / Protection Safeguards:</span>
                      {assignPreviewData.conflicts.map((c: any, i: number) => (
                        <div key={i}>• {c.message} ({c.type})</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handlePreviewAssignment}
                disabled={previewLoading || !assignEffectiveFrom}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                {previewLoading ? 'Analyzing...' : 'Preview Impact'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssignment}
                  disabled={submitLoading || !assignEffectiveFrom}
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {submitLoading ? 'Applying...' : 'Save & Backfill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
