import React, { useState, useEffect } from 'react';
import {
  CreditCard, Fuel, Plus, RefreshCw, AlertTriangle, CheckCircle2, Search, Trash2, Edit3,
  ShieldAlert, FileText, Layers, Upload, Check, X, Clock, Filter, Lock, Eye, Download,
  Building2, UserCheck, BarChart3, ChevronRight, FileSpreadsheet, ArrowUpRight,
  ChevronLeft, ChevronsLeft, ChevronsRight, Snowflake, Play, Zap
} from 'lucide-react';
import {
  FuelCard, FuelCardProvider, FuelCardAllowedProduct, FuelTransaction, FuelImportBatch,
  Truck, User, OwnerOperatorCompany, FuelCardAssignment, FuelReceipt, TripFuelStatement,
  FuelMatchException
} from '../types';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const PaginationFooter: React.FC<{
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}> = ({ currentPage, pageSize, totalItems, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  const maxButtons = 5;
  let startPage = Math.max(1, validCurrentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  const pageNumbers: number[] = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 font-medium">
      <div className="flex items-center gap-3">
        <span>
          Showing <strong className="text-slate-900">{startItem}</strong> to <strong className="text-slate-900">{endItem}</strong> of <strong className="text-slate-900">{totalItems}</strong> entries
        </span>
        <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
          <span className="text-[11px] text-slate-500">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="p-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={validCurrentPage <= 1}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
          title="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(validCurrentPage - 1)}
          disabled={validCurrentPage <= 1}
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-1 font-semibold text-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </button>

        {startPage > 1 && <span className="px-1 text-slate-400">...</span>}
        {pageNumbers.map((num) => (
          <button
            key={num}
            onClick={() => onPageChange(num)}
            className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
              num === validCurrentPage
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            {num}
          </button>
        ))}
        {endPage < totalPages && <span className="px-1 text-slate-400">...</span>}

        <button
          onClick={() => onPageChange(validCurrentPage + 1)}
          disabled={validCurrentPage >= totalPages}
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-1 font-semibold text-xs"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={validCurrentPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
          title="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const getUniquePoNumber = (item: { id?: string; poNumber?: string; statementNumber?: string; tripNumber?: string; loadNumber?: string } | null | undefined): string => {
  if (!item) return 'PO #102100';
  if (item.poNumber && item.poNumber.trim()) {
    const p = item.poNumber.trim();
    return p.startsWith('PO') || p.startsWith('#') ? p : `PO #${p}`;
  }
  const baseStr = item.statementNumber || item.loadNumber || item.tripNumber || item.id || '102100';
  let hash = 0;
  for (let i = 0; i < baseStr.length; i++) {
    hash = (hash << 5) - hash + baseStr.charCodeAt(i);
    hash |= 0;
  }
  const num = 100000 + (Math.abs(hash) % 899999);
  return `PO #${num}`;
};

interface FuelCardsManagerProps {
  companyId: string;
  drivers: User[];
  trucks: Truck[];
  ownerOperators: OwnerOperatorCompany[];
  onRefreshFuelEntries?: () => void;
}

export const FuelCardsManager: React.FC<FuelCardsManagerProps> = ({
  companyId,
  drivers,
  trucks,
  ownerOperators,
  onRefreshFuelEntries
}) => {
  const [subTab, setSubTab] = useState<
    'overview' | 'cards' | 'assignments' | 'imports' | 'receipts' | 'transactions' | 'exceptions' | 'trip_statements' | 'allocations' | 'ifta' | 'history'
  >('overview');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Core Data Collections
  const [fuelCards, setFuelCards] = useState<FuelCard[]>([]);
  const [assignments, setAssignments] = useState<FuelCardAssignment[]>([]);
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [importBatches, setImportBatches] = useState<FuelImportBatch[]>([]);
  const [receipts, setReceipts] = useState<FuelReceipt[]>([]);
  const [tripStatements, setTripStatements] = useState<TripFuelStatement[]>([]);
  const [exceptions, setExceptions] = useState<FuelMatchException[]>([]);
  const [iftaSummary, setIftaSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [iftaQuarter, setIftaQuarter] = useState<string>('2026-Q1');

  // Modals & Active View Details
  const [showCardModal, setShowCardModal] = useState<boolean>(false);
  const [editingCard, setEditingCard] = useState<FuelCard | null>(null);
  const [cardToDelete, setCardToDelete] = useState<FuelCard | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<TripFuelStatement | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<FuelReceipt | null>(null);

  // Card Form Fields
  const [cardProvider, setCardProvider] = useState<FuelCardProvider>('fleet_one');
  const [cardNumberLast4, setCardNumberLast4] = useState<string>('');
  const [assignedTruckId, setAssignedTruckId] = useState<string>('');
  const [assignedDriverId, setAssignedDriverId] = useState<string>('');
  const [assignedOOCompanyId, setAssignedOOCompanyId] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState<string>('');
  const [allowedProducts, setAllowedProducts] = useState<FuelCardAllowedProduct[]>(['diesel', 'def', 'reefer_fuel', 'fee']);
  const [cardStatus, setCardStatus] = useState<'active' | 'inactive' | 'lost' | 'replaced'>('active');

  // Import State
  const [importProvider, setImportProvider] = useState<string>('Fleet One / EFS');
  const [importTargetCardId, setImportTargetCardId] = useState<string>('auto');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importProgressStep, setImportProgressStep] = useState<'idle' | 'reading' | 'parsing' | 'saving' | 'completed' | 'error'>('idle');
  const [importProgressMessage, setImportProgressMessage] = useState<string>('');
  const [lastImportDetails, setLastImportDetails] = useState<{
    batchId?: string;
    totalRows: number;
    importedRows: number;
    duplicateRows: number;
    totalAmountCents: number;
    cardLast4?: string;
    status?: string;
  } | null>(null);

  // Source Document Viewer Modal State
  const [selectedBatchDoc, setSelectedBatchDoc] = useState<{
    batchId: string;
    originalFileName: string;
    fileMimeType: string;
    fileBase64: string | null;
  } | null>(null);
  const [loadingBatchDoc, setLoadingBatchDoc] = useState<boolean>(false);

  // Receipt Upload State
  const [showReceiptUploadModal, setShowReceiptUploadModal] = useState<boolean>(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptDriverId, setReceiptDriverId] = useState<string>('');
  const [receiptTruckId, setReceiptTruckId] = useState<string>('');
  const [receiptLoadId, setReceiptLoadId] = useState<string>('');
  const [receiptMerchant, setReceiptMerchant] = useState<string>('');
  const [receiptAmount, setReceiptAmount] = useState<string>('');
  const [receiptExpenseCategory, setReceiptExpenseCategory] = useState<'fuel' | 'scale_ticket' | 'truck_wash' | 'tolls' | 'parking' | 'supplies' | 'other'>('fuel');
  const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<'fuel_card' | 'driver_paid_reimbursement' | 'company_direct'>('fuel_card');
  const [receiptTicketNumber, setReceiptTicketNumber] = useState<string>('');
  const [receiptNotes, setReceiptNotes] = useState<string>('');

  // Assignment Modal
  const [showAssignmentModal, setShowAssignmentModal] = useState<boolean>(false);
  const [selectedCardForAssign, setSelectedCardForAssign] = useState<string>('');

  // Exception Resolution State
  const [resolvingTx, setResolvingTx] = useState<FuelTransaction | null>(null);
  const [resolveTruckId, setResolveTruckId] = useState<string>('');
  const [resolveDriverId, setResolveDriverId] = useState<string>('');
  const [exceptionFilter, setExceptionFilter] = useState<'all' | 'unmatched' | 'anomalies'>('all');

  // Transactions Filter Engine & Custom Selection State
  const [txCardFilter, setTxCardFilter] = useState<string>('all');
  const [txStartDate, setTxStartDate] = useState<string>('');
  const [txEndDate, setTxEndDate] = useState<string>('');
  const [txMatchStatusFilter, setTxMatchStatusFilter] = useState<string>('all');
  const [txDriverFilter, setTxDriverFilter] = useState<string>('all');
  const [txTruckFilter, setTxTruckFilter] = useState<string>('all');
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState<boolean>(false);
  const [bulkDriverId, setBulkDriverId] = useState<string>('');
  const [bulkTruckId, setBulkTruckId] = useState<string>('');
  const [batchToDelete, setBatchToDelete] = useState<FuelImportBatch | null>(null);
  const [deleteBatchReason, setDeleteBatchReason] = useState<string>('');

  // Pagination States
  const [cardsPage, setCardsPage] = useState<number>(1);
  const [cardsPageSize, setCardsPageSize] = useState<number>(10);

  const [assignmentsPage, setAssignmentsPage] = useState<number>(1);
  const [assignmentsPageSize, setAssignmentsPageSize] = useState<number>(10);

  const [batchesPage, setBatchesPage] = useState<number>(1);
  const [batchesPageSize, setBatchesPageSize] = useState<number>(10);

  const [receiptsPage, setReceiptsPage] = useState<number>(1);
  const [receiptsPageSize, setReceiptsPageSize] = useState<number>(10);

  const [txPage, setTxPage] = useState<number>(1);
  const [txPageSize, setTxPageSize] = useState<number>(10);

  const [unmatchedPage, setUnmatchedPage] = useState<number>(1);
  const [unmatchedPageSize, setUnmatchedPageSize] = useState<number>(10);

  const [anomaliesPage, setAnomaliesPage] = useState<number>(1);
  const [anomaliesPageSize, setAnomaliesPageSize] = useState<number>(10);

  const [statementsPage, setStatementsPage] = useState<number>(1);
  const [statementsPageSize, setStatementsPageSize] = useState<number>(10);

  const [iftaPage, setIftaPage] = useState<number>(1);
  const [iftaPageSize, setIftaPageSize] = useState<number>(10);

  const fetchAllFuelData = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';

      // 1. Fetch Cards
      let loadedCards: FuelCard[] = [];
      if (token) {
        try {
          const res = await fetch(`/api/fuel/cards?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            loadedCards = data.cards || [];
          }
        } catch (e) { console.warn("API cards fetch fallback:", e); }
      }
      if (loadedCards.length === 0) {
        const snap = await getDocs(collection(db, "admins", companyId, "fuel_cards"));
        snap.forEach(d => loadedCards.push({ id: d.id, ...d.data() } as FuelCard));
      }
      setFuelCards(loadedCards);

      // 2. Fetch Assignments
      let loadedAssignments: FuelCardAssignment[] = [];
      if (token) {
        try {
          const res = await fetch(`/api/fuel/card-assignments?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            loadedAssignments = data.assignments || [];
          }
        } catch (e) { console.warn("API assignments fetch fallback:", e); }
      }

      if (loadedAssignments.length === 0) {
        try {
          const assignSnap = await getDocs(collection(db, "admins", companyId, "fuel_card_assignments"));
          assignSnap.forEach(d => loadedAssignments.push({ id: d.id, ...d.data() } as FuelCardAssignment));
          loadedAssignments.sort((a, b) => (b.assignedAt || b.createdAt || '').localeCompare(a.assignedAt || a.createdAt || ''));
        } catch (e) { console.warn("Firestore assignments fetch fallback error:", e); }
      }

      setAssignments(loadedAssignments);

      // 3. Fetch Transactions & Batches
      const txSnap = await getDocs(collection(db, "admins", companyId, "fuel_transactions"));
      const txList: FuelTransaction[] = [];
      txSnap.forEach(d => txList.push({ id: d.id, ...d.data() } as FuelTransaction));
      txList.sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));
      setTransactions(txList);

      const batchSnap = await getDocs(collection(db, "admins", companyId, "fuel_import_batches"));
      const batchList: FuelImportBatch[] = [];
      batchSnap.forEach(d => batchList.push({ id: d.id, ...d.data() } as FuelImportBatch));
      batchList.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
      setImportBatches(batchList);

      // 4. Fetch Receipts
      if (token) {
        try {
          const res = await fetch(`/api/fuel/receipts?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setReceipts(data.receipts || []);
          }
        } catch (e) { console.warn("API receipts fetch fallback:", e); }
      }

      // 5. Fetch Trip Fuel Statements
      if (token) {
        try {
          const res = await fetch(`/api/fuel/trip-statements?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setTripStatements(data.statements || []);
          }
        } catch (e) { console.warn("API trip statements fetch fallback:", e); }
      }

      // 6. Fetch Exceptions
      if (token) {
        try {
          const res = await fetch(`/api/fuel/exceptions?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setExceptions(data.exceptions || []);
          }
        } catch (e) { console.warn("API exceptions fetch fallback:", e); }
      }

      // 7. Fetch Analytics & IFTA Summary
      if (token) {
        try {
          const aRes = await fetch(`/api/fuel/analytics?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (aRes.ok) {
            const aData = await aRes.json();
            setAnalytics(aData.summary || null);
          }
          const iRes = await fetch(`/api/fuel/ifta-summary?companyId=${companyId}&quarter=${iftaQuarter}`, { headers: { Authorization: `Bearer ${token}` } });
          if (iRes.ok) {
            const iData = await iRes.json();
            setIftaSummary(iData || null);
          }
        } catch (e) { console.warn("API analytics fetch fallback:", e); }
      }

    } catch (err: any) {
      console.error("Error loading fuel system data:", err);
      setError(err.message || "Failed to load fuel data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchAllFuelData();
    }
  }, [companyId, iftaQuarter]);

  // Fuel Card Actions
  const handleOpenAddCardModal = () => {
    setEditingCard(null);
    setCardProvider('fleet_one');
    setCardNumberLast4('');
    setAssignedTruckId('');
    setAssignedDriverId('');
    setAssignedOOCompanyId('');
    setEffectiveFrom(new Date().toISOString().split('T')[0]);
    setEffectiveTo('');
    setAllowedProducts(['diesel', 'def', 'reefer_fuel', 'fee']);
    setCardStatus('active');
    setShowCardModal(true);
  };

  const handleOpenEditCardModal = (card: FuelCard) => {
    setEditingCard(card);
    setCardProvider(card.provider || 'fleet_one');
    setCardNumberLast4(card.cardNumberLast4 || '');
    setAssignedTruckId(card.assignedTruckId || '');
    setAssignedDriverId(card.assignedDriverId || '');
    setAssignedOOCompanyId(card.assignedOwnerOperatorCompanyId || '');
    setEffectiveFrom(card.effectiveFrom || new Date().toISOString().split('T')[0]);
    setEffectiveTo(card.effectiveTo || '');
    setAllowedProducts(card.allowedProducts || ['diesel', 'def', 'reefer_fuel', 'fee']);
    setCardStatus(card.status || 'active');
    setShowCardModal(true);
  };

  const handleSaveCard = async () => {
    if (!cardNumberLast4 || cardNumberLast4.length < 4) {
      setError("Please provide a valid 4-digit card number.");
      return;
    }

    const last4 = cardNumberLast4.slice(-4);

    // Client-side duplicate card check
    const isDuplicate = fuelCards.some(c =>
      c.cardNumberLast4 === last4 &&
      (c.provider || 'fleet_one').toLowerCase() === cardProvider.toLowerCase() &&
      c.id !== editingCard?.id &&
      c.status !== 'deleted'
    );

    if (isDuplicate) {
      setError(`A fuel card ending in ****${last4} (${cardProvider.toUpperCase()}) already exists in your company. Duplicate cards are strictly prohibited for settlement accuracy.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;

      const payload = {
        companyId,
        provider: cardProvider,
        cardNumberMasked: `****${last4}`,
        cardNumberLast4: last4,
        assignedTruckId: assignedTruckId || null,
        assignedDriverId: assignedDriverId || null,
        assignedOwnerOperatorCompanyId: assignedOOCompanyId || null,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        allowedProducts,
        status: cardStatus
      };

      let successSaved = false;

      if (user) {
        const token = await user.getIdToken();
        if (editingCard) {
          const res = await fetch(`/api/fuel/cards/${editingCard.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ companyId, updates: payload })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to update fuel card.");
          }
          successSaved = true;
        } else {
          const res = await fetch(`/api/fuel/cards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to create fuel card.");
          }
          successSaved = true;
        }
      }

      if (!successSaved) {
        const nowIso = new Date().toISOString();
        if (editingCard) {
          await updateDoc(doc(db, "admins", companyId, "fuel_cards", editingCard.id), {
            ...payload,
            updatedAt: nowIso
          });
        } else {
          const newCardId = `card_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await setDoc(doc(db, "admins", companyId, "fuel_cards", newCardId), {
            id: newCardId,
            ...payload,
            createdAt: nowIso,
            updatedAt: nowIso
          });
        }
      }

      setSuccess(editingCard ? "Fuel card updated successfully." : "Fuel card created successfully.");
      setShowCardModal(false);
      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Error saving fuel card:", err);
      setError(err.message || "Failed to save fuel card");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (card: FuelCard) => {
    if (!card || !card.id) return;
    const cardId = card.id;
    try {
      setLoading(true);
      setError(null);
      setCardToDelete(null);

      setFuelCards(prev => prev.filter(c => c.id !== cardId));
      const user = auth.currentUser;
      let deleted = false;

      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`/api/fuel/cards/${cardId}?companyId=${companyId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) deleted = true;
        } catch (e) { console.warn("API delete fallback:", e); }
      }

      if (!deleted) {
        await deleteDoc(doc(db, "admins", companyId, "fuel_cards", cardId));
      }

      setSuccess("Fuel card deleted successfully.");
      fetchAllFuelData();
    } catch (err: any) {
      console.error("Error deleting fuel card:", err);
      setError(err.message || "Failed to delete fuel card");
      fetchAllFuelData();
    } finally {
      setLoading(false);
    }
  };

  // CSV / File Import Action
  const handleImportFile = async () => {
    if (!importFile) {
      setError("Please select a fuel report file (CSV or PDF).");
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setSuccess(null);
      setLastImportDetails(null);
      setImportProgressStep('reading');
      setImportProgressMessage(`Reading statement file: ${importFile.name}...`);

      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const isPdf = importFile.name.toLowerCase().endsWith('.pdf');

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target?.result;
          if (!fileContent) {
            throw new Error("Empty file content received.");
          }

          let finalImportResponse: any = null;
          const rawString = typeof fileContent === 'string' ? fileContent : '';

          if (isPdf) {
            // STEP 1: Gemini AI Parse PDF
            setImportProgressStep('parsing');
            setImportProgressMessage(`Step 1/2: Gemini AI analyzing & extracting transactions from PDF statement (${importFile.name})...`);

            const parseRes = await fetch('/api/fuel/parse-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                companyId,
                pdfBase64: rawString,
                mimeType: 'application/pdf',
                provider: importProvider,
                targetFuelCardId: importTargetCardId
              })
            });

            if (!parseRes.ok) {
              const parseErr = await parseRes.json().catch(() => ({}));
              throw new Error(parseErr.error || "Gemini AI failed to parse PDF fuel report.");
            }

            const parseData = await parseRes.json();
            const extractedRows = parseData.rows || [];

            if (extractedRows.length === 0) {
              throw new Error("Gemini AI could not extract any valid fuel transaction rows from this PDF.");
            }

            // STEP 2: Save extracted rows into Ledger via /api/fuel/import-csv
            setImportProgressStep('saving');
            setImportProgressMessage(`Step 2/2: Staging ${extractedRows.length} extracted transaction(s) into database for human approval...`);

            const saveRes = await fetch('/api/fuel/import-csv', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                companyId,
                provider: importProvider,
                rows: extractedRows,
                fileName: importFile.name,
                targetFuelCardId: importTargetCardId,
                fileBase64: rawString,
                fileMimeType: 'application/pdf',
                source: 'pdf'
              })
            });

            if (!saveRes.ok) {
              const saveErr = await saveRes.json().catch(() => ({}));
              throw new Error(saveErr.error || "Failed to save extracted transactions.");
            }

            finalImportResponse = await saveRes.json();
          } else {
            // CSV Import
            setImportProgressStep('saving');
            setImportProgressMessage(`Processing & staging CSV statement for human approval...`);

            const csvText = typeof fileContent === 'string' ? fileContent : '';
            const csvRes = await fetch('/api/fuel/import-csv', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                companyId,
                provider: importProvider,
                csvText,
                fileName: importFile.name,
                targetFuelCardId: importTargetCardId,
                fileBase64: csvText,
                fileMimeType: 'text/csv',
                source: 'csv'
              })
            });

            if (!csvRes.ok) {
              const csvErr = await csvRes.json().catch(() => ({}));
              throw new Error(csvErr.error || "Failed to import CSV fuel file.");
            }

            finalImportResponse = await csvRes.json();
          }

          if (finalImportResponse && finalImportResponse.success) {
            const b = finalImportResponse.batch || {};
            const cardObj = importTargetCardId !== 'auto' ? fuelCards.find(c => c.id === importTargetCardId) : null;

            setLastImportDetails({
              batchId: b.id || finalImportResponse.importBatchId,
              totalRows: b.totalRows || finalImportResponse.totalRows || 0,
              importedRows: b.importedRows || finalImportResponse.importedRows || 0,
              duplicateRows: b.duplicateRows || finalImportResponse.duplicateRows || 0,
              totalAmountCents: b.totalTransactionAmountCents || finalImportResponse.totalTransactionAmountCents || 0,
              cardLast4: cardObj?.cardNumberLast4,
              status: b.status || 'needs_review'
            });

            setImportProgressStep('completed');
            setImportProgressMessage(finalImportResponse.message || "Import batch created. Awaiting human approval before posting to active Ledger.");
            setSuccess(`Batch ${b.id || finalImportResponse.importBatchId} created! Status: PENDING HUMAN APPROVAL.`);
            setImportFile(null);

            await fetchAllFuelData();
            if (onRefreshFuelEntries) onRefreshFuelEntries();
          } else {
            throw new Error(finalImportResponse?.error || "Import processing failed.");
          }
        } catch (innerErr: any) {
          console.error("File processing error:", innerErr);
          setImportProgressStep('error');
          setError(innerErr.message || "Failed to process fuel report file.");
        } finally {
          setImporting(false);
        }
      };

      reader.onerror = () => {
        setImportProgressStep('error');
        setError("Failed to read file from disk.");
        setImporting(false);
      };

      if (isPdf) {
        reader.readAsDataURL(importFile);
      } else {
        reader.readAsText(importFile);
      }
    } catch (err: any) {
      console.error("Fuel import error:", err);
      setImportProgressStep('error');
      setError(err.message || "Failed to import fuel file.");
      setImporting(false);
    }
  };

  const handleApproveBatch = async (batchId: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/import-batches/${batchId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Failed to approve import batch (${res.status}).`);
      }

      setSuccess(data.message || `Import batch ${batchId} approved and posted to active Ledger.`);
      setImportProgressStep('completed');
      setImportProgressMessage(`Batch ${batchId} officially APPROVED by human reviewer! Transactions posted to active Ledger.`);

      if (lastImportDetails?.batchId === batchId) {
        setLastImportDetails(prev => prev ? { ...prev, status: 'approved' } : null);
      }

      await fetchAllFuelData();
      if (onRefreshFuelEntries) onRefreshFuelEntries();
    } catch (err: any) {
      console.error("Batch approval error:", err);
      setError(err.message || "Failed to approve batch");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectBatch = async (batchId: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/import-batches/${batchId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Failed to reject import batch (${res.status}).`);
      }

      setSuccess(data.message || `Import batch ${batchId} marked as REJECTED.`);

      if (lastImportDetails?.batchId === batchId) {
        setLastImportDetails(prev => prev ? { ...prev, status: 'rejected' } : null);
      }

      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Batch rejection error:", err);
      setError(err.message || "Failed to reject batch");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string, reason?: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/import-batches/${batchId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, reason: reason || deleteBatchReason })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Failed to delete import batch (${res.status}).`);
      }

      setSuccess(data.message || `Import batch ${batchId} deleted and ${data.deletedTxCount || 0} transaction(s) purged from database.`);

      if (lastImportDetails?.batchId === batchId) {
        setLastImportDetails(prev => prev ? { ...prev, status: 'deleted' } : null);
      }

      setBatchToDelete(null);
      setDeleteBatchReason('');

      await fetchAllFuelData();
      if (onRefreshFuelEntries) onRefreshFuelEntries();
    } catch (err: any) {
      console.error("Batch deletion error:", err);
      setError(err.message || "Failed to delete import batch");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTripStatement = async (statementId: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/trip-statements/${statementId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      const resText = await res.text();
      let data: any = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Failed to approve trip statement (${res.status}).`);
      }

      setSuccess("Trip Fuel Statement approved successfully.");
      if (selectedStatement && selectedStatement.id === statementId) {
        setSelectedStatement(prev => prev ? { ...prev, status: 'approved' } : null);
      }
      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Statement approval error:", err);
      setError(err.message || "Failed to approve statement");
    } finally {
      setLoading(false);
    }
  };

  const handleViewBatchDocument = async (batchId: string) => {
    try {
      setLoadingBatchDoc(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/import-batches/${batchId}/document?companyId=${companyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to retrieve source statement document.");
      }

      const docData = await res.json();
      const localBatch = importBatches.find(b => b.id === batchId);

      const base64Val = docData.fileBase64 || localBatch?.fileBase64 || null;
      const fileNameVal = docData.originalFileName || localBatch?.originalFileName || "fuel_statement_document.pdf";
      const mimeTypeVal = docData.fileMimeType || localBatch?.fileMimeType || (fileNameVal.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/csv');

      if (!base64Val) {
        throw new Error("No original statement document data was stored for this batch.");
      }

      setSelectedBatchDoc({
        batchId,
        originalFileName: fileNameVal,
        fileMimeType: mimeTypeVal,
        fileBase64: base64Val
      });
    } catch (err: any) {
      console.error("Error viewing batch document:", err);
      setError(err.message || "Could not view source document.");
    } finally {
      setLoadingBatchDoc(false);
    }
  };

  const handleDownloadBatchDocument = (docObj: { originalFileName: string; fileMimeType: string; fileBase64: string | null }) => {
    if (!docObj.fileBase64) return;
    try {
      const link = document.createElement('a');
      const dataUri = docObj.fileBase64.startsWith('data:')
        ? docObj.fileBase64
        : `data:${docObj.fileMimeType || 'application/pdf'};base64,${docObj.fileBase64}`;
      link.href = dataUri;
      link.download = docObj.originalFileName || 'fuel_statement.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      console.error("Download failed:", e);
      setError("Failed to download file.");
    }
  };

  // Driver Receipt Upload Action
  const handleUploadReceipt = async () => {
    if (!receiptFile && !receiptMerchant) {
      setError("Please select a receipt image/PDF file or provide merchant details.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      const token = await user.getIdToken();

      let base64 = '';
      if (receiptFile) {
        base64 = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(receiptFile);
        });
      }

      const res = await fetch('/api/fuel/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId,
          originalFileName: receiptFile?.name || `${receiptExpenseCategory}_receipt.jpg`,
          fileBase64: base64,
          mimeType: receiptFile?.type || 'image/jpeg',
          driverId: receiptDriverId || user.uid,
          truckId: receiptTruckId || null,
          loadId: receiptLoadId || null,
          merchant: receiptMerchant || (receiptExpenseCategory === 'scale_ticket' ? 'CAT Scale / Weigh Station' : receiptExpenseCategory === 'truck_wash' ? 'Truck Wash / Washout' : 'Fuel Station'),
          expenseCategory: receiptExpenseCategory,
          paymentMethod: receiptPaymentMethod,
          ticketNumber: receiptTicketNumber || null,
          notes: receiptNotes || null,
          amountCents: receiptAmount ? Math.round(Number(receiptAmount) * 100) : 0
        })
      });

      if (res.ok) {
        setSuccess(`${receiptExpenseCategory.replace('_', ' ')} receipt/charge logged successfully.`);
        setShowReceiptUploadModal(false);
        setReceiptFile(null);
        setReceiptMerchant('');
        setReceiptAmount('');
        setReceiptTicketNumber('');
        setReceiptNotes('');
        setReceiptLoadId('');
        fetchAllFuelData();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload fuel receipt");
      }
    } catch (err: any) {
      console.error("Receipt upload error:", err);
      setError(err.message || "Failed to upload receipt");
    } finally {
      setLoading(false);
    }
  };

  // Review Receipt Action
  const handleReviewReceipt = async (receiptId: string, reviewStatus: 'approved' | 'rejected') => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/receipts/${receiptId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, reviewStatus })
      });

      if (res.ok) {
        setSuccess(`Receipt marked as ${reviewStatus}.`);
        setSelectedReceipt(null);
        fetchAllFuelData();
      }
    } catch (err: any) {
      setError(err.message || "Failed to review receipt");
    } finally {
      setLoading(false);
    }
  };

  // Run Matching Engine
  const handleRunMatchingEngine = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch('/api/fuel/match-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || "Scored and matched fuel transactions successfully.");
        fetchAllFuelData();
      }
    } catch (err: any) {
      setError(err.message || "Failed to run matching engine");
    } finally {
      setLoading(false);
    }
  };

  // Detect Exceptions
  const handleDetectExceptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch('/api/fuel/detect-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || "Exception detection complete.");
        fetchAllFuelData();
      }
    } catch (err: any) {
      setError(err.message || "Failed to detect exceptions");
    } finally {
      setLoading(false);
    }
  };

  // Full Automated Resolution & Deduplication Engine
  const handleAutoResolveAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch('/api/fuel/auto-resolve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || "Auto-resolution and duplicate cleanup completed successfully.");
        await fetchAllFuelData();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to execute auto-resolution engine.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to execute auto-resolution engine");
    } finally {
      setLoading(false);
    }
  };

  // Manual Resolution for Single Transaction
  const handleResolveTransaction = async (txId: string, truckIdVal?: string, driverIdVal?: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const targetTruck = truckIdVal !== undefined ? truckIdVal : resolveTruckId;
      const targetDriver = driverIdVal !== undefined ? driverIdVal : resolveDriverId;

      const res = await fetch(`/api/fuel/transactions/${txId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId,
          truckId: targetTruck,
          driverId: targetDriver,
          matchStatus: (targetTruck && targetDriver) ? 'auto_matched' : 'needs_review'
        })
      });

      if (res.ok) {
        setSuccess("Transaction assignment resolved and matched successfully.");
        setResolvingTx(null);
        setResolveTruckId('');
        setResolveDriverId('');
        await fetchAllFuelData();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to resolve transaction assignment.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to resolve transaction assignment");
    } finally {
      setLoading(false);
    }
  };

  // Resolve Anomaly Exception Alert
  const handleResolveException = async (exceptionId: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch(`/api/fuel/exceptions/${exceptionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId,
          reviewerNotes: 'Exception alert reviewed and marked resolved by dispatch'
        })
      });

      if (res.ok) {
        setSuccess("Exception alert marked as resolved.");
        await fetchAllFuelData();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to resolve exception alert.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to resolve exception alert");
    } finally {
      setLoading(false);
    }
  };

  const toggleAllowedProduct = (prod: FuelCardAllowedProduct) => {
    if (allowedProducts.includes(prod)) {
      setAllowedProducts(allowedProducts.filter(p => p !== prod));
    } else {
      setAllowedProducts([...allowedProducts, prod]);
    }
  };

  // Date Preset Helper
  const applyDatePreset = (preset: 'today' | 'this_month' | 'last_30' | 'clear') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (preset === 'today') {
      setTxStartDate(todayStr);
      setTxEndDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      setTxStartDate(firstDay);
      setTxEndDate(todayStr);
    } else if (preset === 'last_30') {
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setTxStartDate(thirtyDaysAgo);
      setTxEndDate(todayStr);
    } else if (preset === 'clear') {
      setTxStartDate('');
      setTxEndDate('');
    }
    setTxPage(1);
  };

  const resetTxFilters = () => {
    setSearchTerm('');
    setTxCardFilter('all');
    setTxStartDate('');
    setTxEndDate('');
    setTxMatchStatusFilter('all');
    setTxDriverFilter('all');
    setTxTruckFilter('all');
    setTxPage(1);
  };

  // Selection & Bulk Operations
  const toggleSelectTx = (id: string) => {
    setSelectedTxIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPageTxs = (pageTxs: FuelTransaction[]) => {
    const pageIds = pageTxs.map(t => t.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedTxIds.includes(id));
    if (allSelected) {
      setSelectedTxIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedTxIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleBulkLockAndApprove = async () => {
    if (selectedTxIds.length === 0) return;
    try {
      setLoading(true);
      for (const txId of selectedTxIds) {
        const txRef = doc(db, "admins", companyId, "fuel_transactions", txId);
        await updateDoc(txRef, {
          approvalStatus: 'approved',
          matchStatus: 'auto_matched',
          updatedAt: new Date().toISOString()
        });
      }
      setSuccess(`Successfully locked & approved ${selectedTxIds.length} transactions.`);
      setSelectedTxIds([]);
      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Bulk approve error:", err);
      setError(err.message || "Failed to lock selected transactions.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUnlock = async () => {
    if (selectedTxIds.length === 0) return;
    try {
      setLoading(true);
      for (const txId of selectedTxIds) {
        const txRef = doc(db, "admins", companyId, "fuel_transactions", txId);
        await updateDoc(txRef, {
          approvalStatus: 'pending',
          matchStatus: 'needs_review',
          updatedAt: new Date().toISOString()
        });
      }
      setSuccess(`Unlocked ${selectedTxIds.length} transactions for review.`);
      setSelectedTxIds([]);
      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Bulk unlock error:", err);
      setError(err.message || "Failed to unlock selected transactions.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssignDriverAndTruck = async () => {
    if (selectedTxIds.length === 0) return;
    if (!bulkDriverId && !bulkTruckId) {
      setError("Please select a driver or a truck to assign.");
      return;
    }
    try {
      setLoading(true);
      for (const txId of selectedTxIds) {
        const txRef = doc(db, "admins", companyId, "fuel_transactions", txId);
        const updates: any = { updatedAt: new Date().toISOString() };
        if (bulkDriverId) updates.driverId = bulkDriverId;
        if (bulkTruckId) updates.truckId = bulkTruckId;
        updates.matchStatus = 'auto_matched';
        updates.approvalStatus = 'approved';
        await updateDoc(txRef, updates);
      }
      setSuccess(`Assigned truck/driver and locked ${selectedTxIds.length} transactions.`);
      setSelectedTxIds([]);
      setShowBulkAssignModal(false);
      setBulkDriverId('');
      setBulkTruckId('');
      await fetchAllFuelData();
    } catch (err: any) {
      console.error("Bulk assign error:", err);
      setError(err.message || "Failed to assign driver/truck.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSingleLock = async (tx: FuelTransaction) => {
    try {
      setLoading(true);
      const newStatus = tx.approvalStatus === 'approved' ? 'pending' : 'approved';
      const newMatch = newStatus === 'approved' ? 'auto_matched' : 'needs_review';
      const txRef = doc(db, "admins", companyId, "fuel_transactions", tx.id);
      await updateDoc(txRef, {
        approvalStatus: newStatus,
        matchStatus: newMatch,
        updatedAt: new Date().toISOString()
      });
      setSuccess(newStatus === 'approved' ? `Transaction locked & approved.` : `Transaction unlocked.`);
      await fetchAllFuelData();
    } catch (err: any) {
      setError("Failed to update transaction status.");
    } finally {
      setLoading(false);
    }
  };

  // Unique Card Number Last4 list for card dropdown
  const availableCardLast4s = Array.from(
    new Set([
      ...fuelCards.map(c => c.cardNumberLast4).filter(Boolean),
      ...transactions.map(t => t.cardNumberLast4).filter(Boolean)
    ])
  ).sort();

  const filteredTransactions = transactions.filter(t => {
    // 1. Text Search query
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchVendor = t.vendor && t.vendor.toLowerCase().includes(term);
      const matchCard = t.cardNumberLast4 && t.cardNumberLast4.toLowerCase().includes(term);
      const matchTruck = t.truckId && t.truckId.toLowerCase().includes(term);
      const matchDriver = t.driverId && t.driverId.toLowerCase().includes(term);
      const matchCity = t.city && t.city.toLowerCase().includes(term);
      const matchState = t.state && t.state.toLowerCase().includes(term);
      const matchInvoice = t.rawInvoiceNumber && t.rawInvoiceNumber.toLowerCase().includes(term);
      if (!matchVendor && !matchCard && !matchTruck && !matchDriver && !matchCity && !matchState && !matchInvoice) {
        return false;
      }
    }

    // 2. Card Last4 Filter
    if (txCardFilter && txCardFilter !== 'all') {
      if (t.cardNumberLast4 !== txCardFilter) return false;
    }

    // 3. Date Range Filter
    if (txStartDate) {
      const txDate = t.transactionDate ? t.transactionDate.split('T')[0] : '';
      if (txDate < txStartDate) return false;
    }
    if (txEndDate) {
      const txDate = t.transactionDate ? t.transactionDate.split('T')[0] : '';
      if (txDate > txEndDate) return false;
    }

    // 4. Match / Approval Status Filter
    if (txMatchStatusFilter && txMatchStatusFilter !== 'all') {
      if (txMatchStatusFilter === 'approved') {
        if (t.approvalStatus !== 'approved') return false;
      } else {
        if (t.matchStatus !== txMatchStatusFilter) return false;
      }
    }

    // 5. Driver Filter
    if (txDriverFilter && txDriverFilter !== 'all') {
      if (t.driverId !== txDriverFilter) return false;
    }

    // 6. Truck Filter
    if (txTruckFilter && txTruckFilter !== 'all') {
      if (t.truckId !== txTruckFilter) return false;
    }

    return true;
  });

  const activeCardsCount = fuelCards.filter(c => c.status === 'active').length;
  const unmatchedTransactionsList = transactions.filter(t => t.matchStatus === 'unmatched' || t.matchStatus === 'needs_review' || t.matchStatus === 'duplicate_flagged');
  const unmatchedCount = unmatchedTransactionsList.length;
  const activeExceptionsList = exceptions.filter(e => e.reviewStatus !== 'resolved');
  const activeExceptionsCount = activeExceptionsList.length;
  const totalExceptionsBadge = unmatchedCount + activeExceptionsCount;
  const pendingReceiptsCount = receipts.filter(r => r.reviewStatus === 'pending').length;
  const totalFuelCostCents = transactions.reduce((sum, t) => sum + (t.totalAmountCents || 0), 0);

  return (
    <div className="space-y-6">
      {/* TOP MODULE HEADER & INTERNAL NAVIGATION TABS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Fuel Management & Intelligence Center</h3>
              <p className="text-xs text-slate-500">
                Multi-tenant card registry, date-effective matching, Trip Fuel Statements, settlement deductions & IFTA accounting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReceiptUploadModal(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
            >
              <Upload className="w-4 h-4 text-emerald-400" /> Upload Receipt
            </button>
            <button
              onClick={handleOpenAddCardModal}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Register Card
            </button>
            <button
              onClick={() => fetchAllFuelData()}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              title="Refresh All Fuel Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 12 OPERATIONAL SUB-TABS */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-1 border-t border-slate-100 text-xs font-semibold text-slate-600 scrollbar-none">
          <button
            onClick={() => setSubTab('overview')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'overview' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Fuel Overview
          </button>
          <button
            onClick={() => setSubTab('cards')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'cards' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" /> Fuel Cards ({fuelCards.length})
          </button>
          <button
            onClick={() => setSubTab('assignments')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'assignments' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" /> Card Assignments
          </button>
          <button
            onClick={() => setSubTab('imports')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'imports' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Import Reports ({importBatches.length})
          </button>
          <button
            onClick={() => setSubTab('receipts')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'receipts' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Receipt Inbox {pendingReceiptsCount > 0 && <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">{pendingReceiptsCount}</span>}
          </button>
          <button
            onClick={() => setSubTab('transactions')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'transactions' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Transactions ({transactions.length})
          </button>
          <button
            onClick={() => setSubTab('exceptions')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'exceptions' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Exceptions {totalExceptionsBadge > 0 && <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">{totalExceptionsBadge}</span>}
          </button>
          <button
            onClick={() => setSubTab('trip_statements')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'trip_statements' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Trip Statements ({tripStatements.length})
          </button>
          <button
            onClick={() => setSubTab('allocations')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'allocations' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Settlement Allocations
          </button>
          <button
            onClick={() => setSubTab('ifta')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
              subTab === 'ifta' ? 'bg-slate-900 text-white font-bold shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> IFTA Fuel Summary
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold text-rose-900">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-xl flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="font-bold text-emerald-900">✕</button>
        </div>
      )}

      {/* SUB-VIEW 1: OVERVIEW METRICS DASHBOARD */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-500 text-xs font-semibold">Active Cards</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{activeCardsCount} <span className="text-xs font-normal text-slate-400">/ {fuelCards.length}</span></div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">Date-effective active</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-500 text-xs font-semibold">Approved Fuel Spend</div>
              <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">${(totalFuelCostCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">{transactions.length} ledger transactions</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-500 text-xs font-semibold">Exceptions & Review Needed</div>
              <div className="text-2xl font-black text-amber-600 mt-1">{unmatchedCount}</div>
              <div className="text-[11px] text-amber-700 font-semibold mt-1">Unmatched card or truck</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-500 text-xs font-semibold">Fleet Fuel Efficiency</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{analytics?.fleetMpg || '6.5'} <span className="text-xs font-normal text-slate-500">MPG</span></div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">Cost / Mile: {analytics?.costPerMileFormatted || '$0.520'}</div>
            </div>
          </div>

          {/* Quick Engine Triggers & Live Working Status */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-700/60">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" /> Automated Fuel Matching & Exception Engines
                </h4>
                {/* Clear Working Status Badge */}
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 border transition ${
                  loading
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                  {loading ? 'Status: Engine Working / Processing...' : 'Status: Engine Operational & Active'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>Multi-factor scoring against active drivers, trucks, loads, and MPG anomaly engines.</span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
                  <Zap className="w-3 h-3 inline mr-0.5" /> Ready
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunMatchingEngine}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                {loading ? 'Running Scored Matcher...' : 'Run Scored Matcher'}
              </button>
              <button
                onClick={handleDetectExceptions}
                disabled={loading}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5 border border-slate-600"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                {loading ? 'Detecting Anomalies...' : 'Detect Anomaly Alerts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: FUEL CARDS DIRECTORY */}
      {subTab === 'cards' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3.5">Provider</th>
                <th className="p-3.5">Card Number</th>
                <th className="p-3.5">Assigned Truck</th>
                <th className="p-3.5">Assigned Driver</th>
                <th className="p-3.5">Date Effective Window</th>
                <th className="p-3.5">Allowed Products</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fuelCards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No fuel cards registered. Click "Register Card" above to define card assignments.
                  </td>
                </tr>
              ) : (
                fuelCards
                  .slice((cardsPage - 1) * cardsPageSize, cardsPage * cardsPageSize)
                  .map((card) => {
                  const driverObj = drivers.find(d => (d.id || d.uid) === card.assignedDriverId);
                  const truckObj = trucks.find(t => t.id === card.assignedTruckId || t.truckNumber === card.assignedTruckId);
                  return (
                    <tr key={card.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold uppercase text-slate-900">{card.provider.replace('_', ' ')}</td>
                      <td className="p-3.5 font-mono text-slate-800 font-semibold">{card.cardNumberMasked || `****${card.cardNumberLast4}`}</td>
                      <td className="p-3.5 font-medium">{truckObj ? `Truck #${truckObj.truckNumber}` : card.assignedTruckId ? `#${card.assignedTruckId}` : '—'}</td>
                      <td className="p-3.5 font-medium">{driverObj ? driverObj.name : card.assignedDriverId || '—'}</td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {card.effectiveFrom} {card.effectiveTo ? ` to ${card.effectiveTo}` : '(Active indefinitely)'}
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {card.allowedProducts && card.allowedProducts.map(p => (
                            <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 uppercase">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          card.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {card.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditCardModal(card)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                            title="Edit Fuel Card"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setCardToDelete(card)}
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
                            title="Delete Fuel Card"
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
          <PaginationFooter
            currentPage={cardsPage}
            pageSize={cardsPageSize}
            totalItems={fuelCards.length}
            onPageChange={setCardsPage}
            onPageSizeChange={setCardsPageSize}
          />
        </div>
      )}

      {/* SUB-VIEW 3: CARD ASSIGNMENTS */}
      {subTab === 'assignments' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">Effective-Dated Fuel Card Assignments History</h4>
            <button
              onClick={handleOpenAddCardModal}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition"
            >
              + New Effective Assignment
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Card</th>
                <th className="p-3">Assigned Truck</th>
                <th className="p-3">Assigned Driver</th>
                <th className="p-3">Effective From</th>
                <th className="p-3">Effective To</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    No assignment records logged. Card updates automatically create assignment history entries.
                  </td>
                </tr>
              ) : (
                assignments
                  .slice((assignmentsPage - 1) * assignmentsPageSize, assignmentsPage * assignmentsPageSize)
                  .map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-800">{a.cardNumberMasked || a.fuelCardId}</td>
                    <td className="p-3 font-semibold">{a.assignedTruckNumberSnapshot || a.assignedTruckId || '—'}</td>
                    <td className="p-3 font-semibold">{a.assignedDriverNameSnapshot || a.assignedDriverId || '—'}</td>
                    <td className="p-3 font-mono">{a.effectiveFrom}</td>
                    <td className="p-3 font-mono">{a.effectiveTo || 'Active'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationFooter
            currentPage={assignmentsPage}
            pageSize={assignmentsPageSize}
            totalItems={assignments.length}
            onPageChange={setAssignmentsPage}
            onPageSizeChange={setAssignmentsPageSize}
          />
        </div>
      )}

      {/* SUB-VIEW 4: IMPORT REPORTS HUB */}
      {subTab === 'imports' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Upload Fuel Provider Statement / Report (CSV or PDF)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fuel Card Provider</label>
                <select
                  value={importProvider}
                  onChange={(e) => setImportProvider(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="Fleet One / EFS">Fleet One / EFS</option>
                  <option value="WEX">WEX Carrier Services</option>
                  <option value="Comdata">Comdata Fuel Card</option>
                  <option value="Fuelman">Fuelman Network</option>
                  <option value="Love's Express">Love's Express</option>
                  <option value="Pilot Flying J">Pilot Flying J Direct</option>
                  <option value="Other">Custom Provider CSV</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target / Fallback Registered Fuel Card</label>
                <select
                  value={importTargetCardId}
                  onChange={(e) => setImportTargetCardId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 bg-slate-50/50 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="auto">Auto-Match Card from Statement</option>
                  {fuelCards.map(c => {
                    const truck = trucks.find(t => t.id === c.assignedTruckId);
                    const driver = drivers.find(d => d.uid === c.assignedDriverId || d.id === c.assignedDriverId);
                    const label = `****${c.cardNumberLast4} - ${c.provider.toUpperCase()} (${driver?.name || truck?.truckNumber || 'Registered Card'})`;
                    return <option key={c.id} value={c.id}>{label}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Report File (.csv or .pdf)</label>
                <input
                  type="file"
                  accept=".csv,.pdf,.xlsx"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null);
                    setImportProgressStep('idle');
                    setImportProgressMessage('');
                  }}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleImportFile}
                  disabled={importing || !importFile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {importing ? "Processing Batch..." : "Upload & Parse Batch"}
                </button>
              </div>
            </div>

            {/* LIVE STEP-BY-STEP PROGRESS & COMPLETION STATUS BANNER */}
            {(importing || importProgressStep !== 'idle') && (
              <div className={`p-4 rounded-xl border text-xs space-y-3 transition-all ${
                importProgressStep === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : importProgressStep === 'completed'
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-950'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 font-bold text-sm">
                    {importing ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                    ) : importProgressStep === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <span>{importProgressMessage}</span>
                  </div>
                  {importProgressStep === 'completed' && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-200 text-emerald-900">
                      Processing Complete
                    </span>
                  )}
                </div>

                {importing && (
                  <div className="w-full bg-indigo-200/70 rounded-full h-2 overflow-hidden">
                    <div className="bg-indigo-600 h-2 rounded-full animate-pulse w-3/4"></div>
                  </div>
                )}

                {importProgressStep === 'completed' && lastImportDetails && (
                  <div className="p-3.5 bg-white rounded-xl border border-emerald-200/80 shadow-xs space-y-3">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-mono font-bold px-2 py-0.5 rounded">
                          Batch ID: {lastImportDetails.batchId}
                        </span>
                        <span className="text-xs text-slate-600">Saved to Ledger Database</span>
                      </div>
                      <span className="font-mono text-emerald-700 font-extrabold text-base">
                        ${(lastImportDetails.totalAmountCents / 100).toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-100 pt-2.5">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Extracted Rows</span>
                        <strong className="text-slate-900 text-sm font-bold">{lastImportDetails.totalRows}</strong>
                      </div>
                      <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                        <span className="text-emerald-700 block text-[10px] uppercase font-bold">Imported to Ledger</span>
                        <strong className="text-emerald-800 text-sm font-bold">{lastImportDetails.importedRows}</strong>
                      </div>
                      <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                        <span className="text-amber-700 block text-[10px] uppercase font-bold">Duplicates Skipped</span>
                        <strong className="text-amber-800 text-sm font-bold">{lastImportDetails.duplicateRows}</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Card Last 4</span>
                        <strong className="font-mono text-slate-900 text-sm font-bold">
                          {lastImportDetails.cardLast4 ? `****${lastImportDetails.cardLast4}` : 'Auto-Matched'}
                        </strong>
                      </div>
                    </div>

                    {lastImportDetails.status !== 'approved' && lastImportDetails.status !== 'rejected' && (
                      <div className="flex items-center gap-2.5 text-amber-900 bg-amber-50/80 p-3 rounded-xl border border-amber-200/80 mt-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="flex-1">
                          <strong className="block text-xs uppercase tracking-wide font-extrabold text-amber-900">Human Review & Approval Required</strong>
                          <p className="text-[11px] text-amber-800">
                            Transactions extracted & staged in batch <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-bold">{lastImportDetails.batchId}</code>. Click <strong>Approve Batch & Post to Ledger</strong> to finalize.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      {lastImportDetails.status !== 'approved' && lastImportDetails.status !== 'rejected' && lastImportDetails.status !== 'deleted' && lastImportDetails.batchId && (
                        <>
                          <button
                            onClick={() => handleApproveBatch(lastImportDetails.batchId!)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition"
                          >
                            <Check className="w-4 h-4" /> Approve Batch & Post to Ledger
                          </button>
                          <button
                            onClick={() => handleRejectBatch(lastImportDetails.batchId!)}
                            className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-xl text-xs transition"
                          >
                            Reject Batch
                          </button>
                        </>
                      )}
                      {lastImportDetails.status !== 'deleted' && lastImportDetails.batchId && (
                        <button
                          onClick={() => {
                            const b = importBatches.find(x => x.id === lastImportDetails.batchId) || ({ id: lastImportDetails.batchId, provider: 'Import Batch' } as FuelImportBatch);
                            setBatchToDelete(b);
                          }}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete Batch
                        </button>
                      )}
                      {lastImportDetails.batchId && (
                        <button
                          onClick={() => handleViewBatchDocument(lastImportDetails.batchId!)}
                          className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-600" /> View Stored Document
                        </button>
                      )}
                      <button
                        onClick={() => setSubTab('transactions')}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                      >
                        <BarChart3 className="w-3.5 h-3.5" /> View Transactions Ledger ({transactions.length})
                      </button>
                      <button
                        onClick={() => setSubTab('overview')}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition"
                      >
                        Fuel Overview & Analytics
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-xs flex items-center justify-between">
              <span>Import Batches History ({importBatches.length})</span>
              <span className="text-[11px] font-normal text-slate-500">Human approval required for all uploaded statements</span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5">Import Date</th>
                  <th className="p-3.5">Batch ID & Document</th>
                  <th className="p-3.5">Provider</th>
                  <th className="p-3.5 text-center">Total Rows</th>
                  <th className="p-3.5 text-center">Imported</th>
                  <th className="p-3.5 text-center">Duplicates</th>
                  <th className="p-3.5 text-right">Total Amount</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Review Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importBatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      No import batches logged yet. Upload a Fleet One/EFS CSV or PDF above.
                    </td>
                  </tr>
                ) : (
                  importBatches
                    .slice((batchesPage - 1) * batchesPageSize, batchesPage * batchesPageSize)
                    .map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-medium text-slate-800">{new Date(b.uploadedAt).toLocaleDateString()}</td>
                      <td className="p-3.5">
                        <div className="font-mono text-slate-700 text-[11px] font-bold">{b.id}</div>
                        {b.originalFileName && (
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{b.originalFileName}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">{b.provider}</td>
                      <td className="p-3.5 text-center font-bold text-slate-700">{b.totalRows}</td>
                      <td className="p-3.5 text-center font-bold text-emerald-700">{b.importedRows}</td>
                      <td className="p-3.5 text-center font-bold text-amber-700">{b.duplicateRows}</td>
                      <td className="p-3.5 text-right font-bold text-slate-900 font-mono">
                        ${((b.totalTransactionAmountCents || 0) / 100).toFixed(2)}
                      </td>
                      <td className="p-3.5 text-center">
                        {b.status === 'approved' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-700" /> Approved
                          </span>
                        ) : b.status === 'rejected' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                            <X className="w-3 h-3 text-amber-700" /> Rejected
                          </span>
                        ) : b.status === 'deleted' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-900 border border-rose-200 inline-flex items-center gap-1" title={b.deletedReason || "Batch deleted from import history"}>
                            <Trash2 className="w-3 h-3 text-rose-700" /> DELETED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-700" /> Pending Review
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewBatchDocument(b.id)}
                            title="View / Download Source Document"
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Doc</span>
                          </button>
                          {b.status !== 'deleted' ? (
                            <>
                              {b.status !== 'approved' && b.status !== 'rejected' && (
                                <>
                                  <button
                                    onClick={() => handleApproveBatch(b.id)}
                                    title="Approve batch and record transactions into active Ledger"
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => handleRejectBatch(b.id)}
                                    title="Reject batch"
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => setBatchToDelete(b)}
                                title="Delete batch & purge associated transactions"
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span className="hidden md:inline">Delete</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold italic">Purged</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <PaginationFooter
              currentPage={batchesPage}
              pageSize={batchesPageSize}
              totalItems={importBatches.length}
              onPageChange={setBatchesPage}
              onPageSizeChange={setBatchesPageSize}
            />
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: RECEIPT INBOX */}
      {subTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">Driver Uploaded Fuel Receipts Inbox</h4>
            <button
              onClick={() => setShowReceiptUploadModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition"
            >
              + Upload Driver Receipt
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Upload Date</th>
                <th className="p-3">Merchant</th>
                <th className="p-3">Driver / Truck</th>
                <th className="p-3 text-right">Amount ($)</th>
                <th className="p-3 text-center">AI Extraction</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Review Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No fuel receipts uploaded yet. Drivers can upload receipts directly from mobile views.
                  </td>
                </tr>
              ) : (
                receipts
                  .slice((receiptsPage - 1) * receiptsPageSize, receiptsPage * receiptsPageSize)
                  .map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-700">{r.transactionDate || r.uploadedAt?.split('T')[0]}</td>
                    <td className="p-3 font-bold text-slate-900">{r.merchant || 'Fuel Vendor'}</td>
                    <td className="p-3 font-medium text-slate-800">{r.driverId || 'Driver'} / {r.truckId || 'Unit'}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">${((r.amountCents || 0) / 100).toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.extractionStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {r.extractionStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.reviewStatus === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                        r.reviewStatus === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.reviewStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {r.reviewStatus === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleReviewReceipt(r.id, 'approved')}
                            className="p-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-bold"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewReceipt(r.id, 'rejected')}
                            className="p-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationFooter
            currentPage={receiptsPage}
            pageSize={receiptsPageSize}
            totalItems={receipts.length}
            onPageChange={setReceiptsPage}
            onPageSizeChange={setReceiptsPageSize}
          />
        </div>
      )}

      {/* SUB-VIEW 6: TRANSACTIONS LEDGER */}
      {subTab === 'transactions' && (
        <div className="space-y-4">
          {/* SEARCH & MULTI-FILTER CONTROL ENGINE */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Main Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search vendor, card #, truck, driver, location, invoice..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setTxPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Card Number Selector */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Card:</span>
                  <select
                    value={txCardFilter}
                    onChange={(e) => { setTxCardFilter(e.target.value); setTxPage(1); }}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Card Numbers ({availableCardLast4s.length})</option>
                    {availableCardLast4s.map(c => (
                      <option key={c} value={c}>Card ****{c}</option>
                    ))}
                  </select>
                </div>

                {/* Match / Lock Status */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Status:</span>
                  <select
                    value={txMatchStatusFilter}
                    onChange={(e) => { setTxMatchStatusFilter(e.target.value); setTxPage(1); }}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="auto_matched">Auto Matched</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="unmatched">Unmatched</option>
                    <option value="approved">Locked & Approved</option>
                  </select>
                </div>

                <button
                  onClick={() => fetchAllFuelData()}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                  title="Refresh Fuel Data"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* DATE RANGE & PRESET CONTROLS + TRUCK/DRIVER FILTERS */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              {/* Date Inputs & Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500">From:</span>
                  <input
                    type="date"
                    value={txStartDate}
                    onChange={(e) => { setTxStartDate(e.target.value); setTxPage(1); }}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                  <span className="text-[10px] font-bold text-slate-500">To:</span>
                  <input
                    type="date"
                    value={txEndDate}
                    onChange={(e) => { setTxEndDate(e.target.value); setTxPage(1); }}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => applyDatePreset('today')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px]"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => applyDatePreset('this_month')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px]"
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => applyDatePreset('last_30')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px]"
                  >
                    Last 30 Days
                  </button>
                  {(txStartDate || txEndDate) && (
                    <button
                      onClick={() => applyDatePreset('clear')}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-[10px] flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear Dates
                    </button>
                  )}
                </div>
              </div>

              {/* Truck & Driver Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={txDriverFilter}
                  onChange={(e) => { setTxDriverFilter(e.target.value); setTxPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none"
                >
                  <option value="all">All Assigned Drivers</option>
                  {drivers.map(d => (
                    <option key={d.id || d.uid} value={d.id || d.uid}>{d.name}</option>
                  ))}
                </select>

                <select
                  value={txTruckFilter}
                  onChange={(e) => { setTxTruckFilter(e.target.value); setTxPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none"
                >
                  <option value="all">All Assigned Trucks</option>
                  {trucks.map(t => (
                    <option key={t.id || t.number} value={t.number || t.id}>Truck #{t.number || t.id}</option>
                  ))}
                </select>

                {(searchTerm || txCardFilter !== 'all' || txStartDate || txEndDate || txMatchStatusFilter !== 'all' || txDriverFilter !== 'all' || txTruckFilter !== 'all') && (
                  <button
                    onClick={resetTxFilters}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-[10px] transition"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* BULK SELECTION ACTION BANNER */}
          {selectedTxIds.length > 0 && (
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 transition">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-500/30">
                  {selectedTxIds.length} Selected
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  Total Amount:{' '}
                  <span className="font-mono font-bold text-white">
                    ${(
                      transactions
                        .filter(t => selectedTxIds.includes(t.id))
                        .reduce((sum, t) => sum + (t.totalAmountCents || 0), 0) / 100
                    ).toFixed(2)}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkLockAndApprove}
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" /> Lock & Approve ({selectedTxIds.length})
                </button>
                <button
                  onClick={() => setShowBulkAssignModal(true)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Assign Driver/Truck
                </button>
                <button
                  onClick={handleBulkUnlock}
                  disabled={loading}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5" /> Unlock
                </button>
                <button
                  onClick={() => setSelectedTxIds([])}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
                  title="Deselect All"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TRANSACTIONS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredTransactions.slice((txPage - 1) * txPageSize, txPage * txPageSize).length > 0 &&
                        filteredTransactions
                          .slice((txPage - 1) * txPageSize, txPage * txPageSize)
                          .every(t => selectedTxIds.includes(t.id))
                      }
                      onChange={() =>
                        toggleSelectAllPageTxs(
                          filteredTransactions.slice((txPage - 1) * txPageSize, txPage * txPageSize)
                        )
                      }
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3.5">Tx Date</th>
                  <th className="p-3.5">Vendor / Location</th>
                  <th className="p-3.5">Card Last 4</th>
                  <th className="p-3.5">Assigned Truck / Driver</th>
                  <th className="p-3.5 text-center">Product</th>
                  <th className="p-3.5 text-right">Diesel (Gal / $)</th>
                  <th className="p-3.5 text-right">Reefer Fuel ($ / Gal)</th>
                  <th className="p-3.5 text-right">Total Amount ($)</th>
                  <th className="p-3.5 text-center">Match & Lock Status</th>
                  <th className="p-3.5 text-center">Lock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      No fuel transactions match query or filters. Adjust dates, card selector, or search term.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions
                    .slice((txPage - 1) * txPageSize, txPage * txPageSize)
                    .map((tx) => {
                    const matchedDriver = drivers.find(d => (d.id || d.uid) === tx.driverId);
                    const isSelected = selectedTxIds.includes(tx.id);
                    const isApproved = tx.approvalStatus === 'approved';

                    const pTypeRaw = String(tx.productType || tx.productLines?.[0]?.productType || 'DIESEL').toUpperCase();
                    const isReefer = pTypeRaw.includes('REEFER') || Boolean(tx.reeferAmountCents && tx.reeferAmountCents > 0);
                    const isDef = pTypeRaw.includes('DEF');
                    const isFee = pTypeRaw.includes('FEE');
                    const isDiesel = pTypeRaw.includes('DIESEL') || (!isReefer && !isDef && !isFee);

                    const reeferAmountCents = tx.reeferAmountCents || (isReefer ? (tx.totalAmountCents || 0) : 0);
                    const reeferGallons = tx.reeferGallonsDecimal || (isReefer ? (tx.gallonsDecimal || tx.gallons || 0) : 0);

                    const dieselAmountCents = tx.dieselAmountCents || (isDiesel ? (tx.totalAmountCents || 0) : 0);
                    const dieselGallons = tx.dieselGallonsDecimal || (isDiesel ? (tx.gallonsDecimal || tx.gallons || 0) : 0);

                    return (
                      <tr key={tx.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTx(tx.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3.5 font-medium text-slate-900 font-mono whitespace-nowrap">
                          {tx.transactionDate}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{tx.vendor || tx.locationName || 'Fuel Station'}</div>
                          <div className="text-[11px] text-slate-500">{[tx.city, tx.state].filter(Boolean).join(', ')}</div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-700 whitespace-nowrap">
                          {tx.cardNumberLast4 ? (
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold border border-slate-200">
                              ****{tx.cardNumberLast4}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-800">
                            {tx.truckId ? `Truck #${tx.truckId}` : 'Unassigned Truck'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {matchedDriver ? matchedDriver.name : tx.driverId ? `Driver: ${tx.driverId}` : 'Unassigned Driver'}
                          </div>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide inline-flex items-center gap-1 border ${
                            isReefer
                              ? 'bg-purple-100 text-purple-900 border-purple-200 shadow-sm'
                              : isDef
                              ? 'bg-amber-100 text-amber-900 border-amber-200'
                              : isFee
                              ? 'bg-slate-100 text-slate-800 border-slate-200'
                              : 'bg-blue-100 text-blue-900 border-blue-200'
                          }`}>
                            {isReefer && <Snowflake className="w-3 h-3 text-purple-600 animate-pulse" />}
                            {isReefer ? 'REEFER' : isDef ? 'DEF' : isFee ? 'FEE' : 'DIESEL'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                          {dieselAmountCents > 0 || dieselGallons > 0 ? (
                            <div>
                              <div className="font-bold text-slate-900">${(dieselAmountCents / 100).toFixed(2)}</div>
                              <div className="text-[10px] text-slate-500">{dieselGallons.toFixed(2)} gal</div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-mono text-xs whitespace-nowrap">
                          {reeferAmountCents > 0 || reeferGallons > 0 ? (
                            <div className="bg-purple-50 p-1.5 rounded-lg border border-purple-200 inline-block text-right">
                              <div className="font-extrabold text-purple-900 flex items-center justify-end gap-1">
                                <Snowflake className="w-3 h-3 text-purple-600 inline" />
                                ${(reeferAmountCents / 100).toFixed(2)}
                              </div>
                              <div className="text-[10px] text-purple-700 font-semibold">{reeferGallons.toFixed(2)} gal</div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700 font-mono text-sm whitespace-nowrap">
                          ${((tx.totalAmountCents || 0) / 100).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleToggleSingleLock(tx)}
                            title={isApproved ? "Unlock transaction" : "Lock & approve transaction"}
                            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center mx-auto ${
                              isApproved
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <PaginationFooter
              currentPage={txPage}
              pageSize={txPageSize}
              totalItems={filteredTransactions.length}
              onPageChange={setTxPage}
              onPageSizeChange={setTxPageSize}
            />
          </div>
        </div>
      )}

      {/* SUB-VIEW 7: MATCHING EXCEPTIONS & RESOLUTION CENTER */}
      {subTab === 'exceptions' && (
        <div className="space-y-6">
          {/* Top Banner & Control Engine */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" /> Fuel Exception Resolution & Anomaly Intelligence Center
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clear duplicate fuel cards, resolve unmatched driver/truck ledger entries, and audit anomaly policy alerts.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAutoResolveAll}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Auto-Resolve & Clear Duplicates
                </button>
                <button
                  onClick={handleDetectExceptions}
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-Scan Anomaly Rules
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 font-medium">Total Actionable Items</span>
                  <div className="text-lg font-black text-slate-900">{totalExceptionsBadge}</div>
                </div>
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between">
                <div>
                  <span className="text-amber-800 font-medium">Unmatched Transactions</span>
                  <div className="text-lg font-black text-amber-900">{unmatchedCount}</div>
                </div>
                <CreditCard className="w-5 h-5 text-amber-600" />
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 flex items-center justify-between">
                <div>
                  <span className="text-rose-800 font-medium">Anomaly Policy Alerts</span>
                  <div className="text-lg font-black text-rose-900">{activeExceptionsCount}</div>
                </div>
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
            </div>

            {/* Filter Toggle Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-xs font-semibold">
              <button
                onClick={() => setExceptionFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  exceptionFilter === 'all' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Action Items ({totalExceptionsBadge})
              </button>
              <button
                onClick={() => setExceptionFilter('unmatched')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  exceptionFilter === 'unmatched' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Unmatched Transactions ({unmatchedCount})
              </button>
              <button
                onClick={() => setExceptionFilter('anomalies')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  exceptionFilter === 'anomalies' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Policy Anomaly Alerts ({activeExceptionsCount})
              </button>
            </div>
          </div>

          {/* SECTION 1: UNMATCHED LEDGER TRANSACTIONS */}
          {(exceptionFilter === 'all' || exceptionFilter === 'unmatched') && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-600" /> Unmatched Fuel Transactions ({unmatchedCount})
                </h5>
                <span className="text-[11px] text-slate-500">Assign Truck & Driver to resolve settlement deductions</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="p-3">Tx Date</th>
                      <th className="p-3">Vendor / Location</th>
                      <th className="p-3">Card Last 4</th>
                      <th className="p-3">Amount & Gallons</th>
                      <th className="p-3">Match Diagnosis</th>
                      <th className="p-3 text-right">Quick Assignment & Resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unmatchedTransactionsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                          No unmatched transactions found! All fuel ledger entries are matched to active trucks and drivers cleanly.
                        </td>
                      </tr>
                    ) : (
                      unmatchedTransactionsList
                        .slice((unmatchedPage - 1) * unmatchedPageSize, unmatchedPage * unmatchedPageSize)
                        .map((tx) => {
                        const isResolving = resolvingTx?.id === tx.id;
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-medium text-slate-900">{tx.transactionDate}</td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{tx.vendor || tx.merchant || 'Fuel Vendor'}</div>
                              <div className="text-[11px] text-slate-500">{[tx.city, tx.state].filter(Boolean).join(', ')}</div>
                            </td>
                            <td className="p-3 font-mono font-semibold text-slate-700">****{tx.cardNumberLast4 || '—'}</td>
                            <td className="p-3 font-mono">
                              <div className="font-bold text-emerald-700">${((tx.totalAmountCents || 0) / 100).toFixed(2)}</div>
                              <div className="text-[11px] text-slate-500">{tx.gallonsDecimal ? `${tx.gallonsDecimal} gal` : '—'}</div>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block mb-1 ${
                                tx.matchStatus === 'duplicate_flagged' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {tx.matchStatus?.replace('_', ' ') || 'unmatched'}
                              </span>
                              <div className="text-[11px] text-slate-600 font-medium">
                                {tx.matchReasons && tx.matchReasons.length > 0 ? tx.matchReasons[0] : 'Missing assigned truck or driver'}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {isResolving ? (
                                <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                  <select
                                    value={resolveTruckId}
                                    onChange={(e) => setResolveTruckId(e.target.value)}
                                    className="p-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-medium"
                                  >
                                    <option value="">-- Select Truck --</option>
                                    {trucks.map(t => (
                                      <option key={t.id} value={t.id}>Truck #{t.truckNumber || t.id}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={resolveDriverId}
                                    onChange={(e) => setResolveDriverId(e.target.value)}
                                    className="p-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-medium"
                                  >
                                    <option value="">-- Select Driver --</option>
                                    {drivers.map(d => (
                                      <option key={d.id || d.uid} value={d.id || d.uid}>{d.name || d.email}</option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleResolveTransaction(tx.id)}
                                      disabled={loading || (!resolveTruckId && !resolveDriverId)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => { setResolvingTx(null); setResolveTruckId(''); setResolveDriverId(''); }}
                                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setResolvingTx(tx);
                                      setResolveTruckId(tx.truckId || '');
                                      setResolveDriverId(tx.driverId || '');
                                    }}
                                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
                                  >
                                    Assign & Resolve
                                  </button>
                                  <button
                                    onClick={() => handleResolveTransaction(tx.id, tx.truckId || undefined, tx.driverId || undefined)}
                                    className="p-1.5 hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold transition"
                                    title="Auto-Match Single Transaction"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                currentPage={unmatchedPage}
                pageSize={unmatchedPageSize}
                totalItems={unmatchedTransactionsList.length}
                onPageChange={setUnmatchedPage}
                onPageSizeChange={setUnmatchedPageSize}
              />
            </div>
          )}

          {/* SECTION 2: ANOMALY & POLICY ALERTS */}
          {(exceptionFilter === 'all' || exceptionFilter === 'anomalies') && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" /> Policy & Anomaly Exception Alerts ({activeExceptionsCount})
                </h5>
                <span className="text-[11px] text-slate-500">Flags unusual MPG, fuel capacity overflows, and missing assignments</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="p-3">Severity</th>
                      <th className="p-3">Transaction Ref</th>
                      <th className="p-3">Reason / Description</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeExceptionsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                          No active anomaly alerts detected! All fuel entries pass realistic MPG and policy bounds.
                        </td>
                      </tr>
                    ) : (
                      activeExceptionsList
                        .slice((anomaliesPage - 1) * anomaliesPageSize, anomaliesPage * anomaliesPageSize)
                        .map(ex => (
                        <tr key={ex.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              ex.severity === 'critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {ex.severity}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-700">{ex.fuelTransactionId}</td>
                          <td className="p-3 text-slate-900 font-medium">{ex.reason}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                              {ex.reviewStatus}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleResolveException(ex.id)}
                              className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition"
                            >
                              Mark Resolved
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                currentPage={anomaliesPage}
                pageSize={anomaliesPageSize}
                totalItems={activeExceptionsList.length}
                onPageChange={setAnomaliesPage}
                onPageSizeChange={setAnomaliesPageSize}
              />
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 8: TRIP FUEL STATEMENTS */}
      {subTab === 'trip_statements' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">Trip Fuel Statements (TFS-XXXX)</h4>
            <p className="text-xs text-slate-500">Trip statements aggregate load fuel costs for driver & owner-operator settlement deductions</p>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Statement #</th>
                <th className="p-3">PO Number</th>
                <th className="p-3">Trip / Load #</th>
                <th className="p-3">Driver / Unit</th>
                <th className="p-3 text-right">Diesel Gal</th>
                <th className="p-3 text-right">Gross Fuel ($)</th>
                <th className="p-3 text-right">Proposed Deduction ($)</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tripStatements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No Trip Fuel Statements generated yet. Statements generate automatically when dispatch loads complete.
                  </td>
                </tr>
              ) : (
                tripStatements
                  .slice((statementsPage - 1) * statementsPageSize, statementsPage * statementsPageSize)
                  .map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold font-mono text-slate-900">{s.statementNumber}</td>
                    <td className="p-3 font-mono font-bold text-indigo-700 bg-indigo-50/60 px-2 py-1 rounded border border-indigo-100">{getUniquePoNumber(s)}</td>
                    <td className="p-3 font-semibold text-slate-800">{s.loadNumber || s.tripNumber}</td>
                    <td className="p-3">{s.driverNameSnapshot || 'Driver'} / {s.truckNumberSnapshot || 'Truck'}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">{s.dieselGallonsDecimal} gal</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">${((s.grossFuelCostCents || 0) / 100).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-700">
                      ${(((s.proposedOwnerOperatorDeductionCents || s.proposedDriverDeductionCents || 0)) / 100).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        s.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                        s.status === 'locked' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3 text-right flex items-center justify-end gap-1.5">
                      {s.status !== 'approved' && s.status !== 'locked' && (
                        <button
                          onClick={() => handleApproveTripStatement(s.id)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition shadow-xs"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedStatement(s)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-bold transition"
                      >
                        View Statement
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationFooter
            currentPage={statementsPage}
            pageSize={statementsPageSize}
            totalItems={tripStatements.length}
            onPageChange={setStatementsPage}
            onPageSizeChange={setStatementsPageSize}
          />
        </div>
      )}

      {/* SUB-VIEW 9: SETTLEMENT ALLOCATIONS */}
      {subTab === 'allocations' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h4 className="font-bold text-slate-900 text-sm">Settlement Fuel Allocations & Deductions</h4>
          <p className="text-xs text-slate-500">
            Fuel expenses posted directly to settlements based on driver/owner-operator compensation rules.
          </p>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <div className="font-bold text-slate-900">Allocation Logic Rules:</div>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Company Drivers:</strong> Fuel costs are recorded as company operating expenses; fuel advance fees or unauthorized merchandise items are flagged for payroll deduction.</li>
              <li><strong>Owner-Operators:</strong> 100% of tax-paid diesel, DEF, and reefer fuel is deducted on settlement statements according to the OO contract.</li>
            </ul>
          </div>
        </div>
      )}

      {/* SUB-VIEW 10: IFTA FUEL SUMMARY */}
      {subTab === 'ifta' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">IFTA Tax-Paid Fuel Summary</h4>
              <p className="text-xs text-slate-500">Quarterly tax-paid diesel gallons grouped by US jurisdiction state code</p>
            </div>

            <select
              value={iftaQuarter}
              onChange={(e) => setIftaQuarter(e.target.value)}
              className="p-2 border border-slate-300 rounded-xl text-xs font-bold"
            >
              <option value="2026-Q1">2026 Q1</option>
              <option value="2026-Q2">2026 Q2</option>
              <option value="2026-Q3">2026 Q3</option>
              <option value="2026-Q4">2026 Q4</option>
            </select>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">State / Jurisdiction</th>
                <th className="p-3 text-center">Tx Count</th>
                <th className="p-3 text-right">Tax-Paid Diesel Gallons</th>
                <th className="p-3 text-right">Total Amount ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!iftaSummary?.jurisdictions || iftaSummary.jurisdictions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400">
                    No IFTA fuel transactions logged for {iftaQuarter}.
                  </td>
                </tr>
              ) : (
                (iftaSummary.jurisdictions || [])
                  .slice((iftaPage - 1) * iftaPageSize, iftaPage * iftaPageSize)
                  .map((j: any) => (
                  <tr key={j.state} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900 font-mono">{j.state}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{j.txCount}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">{j.totalGallons.toFixed(2)} gal</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">${((j.amountCents || 0) / 100).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationFooter
            currentPage={iftaPage}
            pageSize={iftaPageSize}
            totalItems={iftaSummary?.jurisdictions?.length || 0}
            onPageChange={setIftaPage}
            onPageSizeChange={setIftaPageSize}
          />
        </div>
      )}

      {/* MODAL: CREATE / EDIT FUEL CARD */}
      {showCardModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                {editingCard ? 'Edit Fuel Card Assignment' : 'Register New Fuel Card'}
              </h3>
              <button onClick={() => setShowCardModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Provider</label>
                  <select
                    value={cardProvider}
                    onChange={(e: any) => setCardProvider(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold capitalize"
                  >
                    <option value="fleet_one">Fleet One</option>
                    <option value="efs">EFS</option>
                    <option value="wex">WEX</option>
                    <option value="comdata">Comdata</option>
                    <option value="fleetio">Fleetio</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Card Last 4 Digits *</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="4829"
                    value={cardNumberLast4}
                    onChange={(e) => setCardNumberLast4(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Truck</label>
                  <select
                    value={assignedTruckId}
                    onChange={(e) => setAssignedTruckId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="">-- Unassigned --</option>
                    {trucks.map(t => (
                      <option key={t.id} value={t.truckNumber}>Truck #{t.truckNumber}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Driver</label>
                  <select
                    value={assignedDriverId}
                    onChange={(e) => setAssignedDriverId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="">-- Unassigned --</option>
                    {drivers.map(d => (
                      <option key={d.id || d.uid} value={d.id || d.uid}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Effective From Date</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Effective To Date</label>
                  <input
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    placeholder="Optional"
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Allowed Products</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(['diesel', 'def', 'reefer_fuel', 'gasoline', 'oil', 'fee'] as FuelCardAllowedProduct[]).map(prod => (
                    <button
                      type="button"
                      key={prod}
                      onClick={() => toggleAllowedProduct(prod)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                        allowedProducts.includes(prod)
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {prod}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowCardModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCard}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Save Fuel Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DRIVER RECEIPT & SCALE TICKET / EXPENSE UPLOAD */}
      {showReceiptUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" /> Log Fuel Receipt, Scale Ticket & Trip Expense
              </h3>
              <button onClick={() => setShowReceiptUploadModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Type / Category *</label>
                  <select
                    value={receiptExpenseCategory}
                    onChange={(e: any) => setReceiptExpenseCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="fuel">Fuel (Diesel / DEF / Reefer)</option>
                    <option value="scale_ticket">Scale Ticket (CAT Scale)</option>
                    <option value="truck_wash">Truck Wash / Washout</option>
                    <option value="tolls">Tolls / Bridge Fees</option>
                    <option value="parking">Parking / Overnight</option>
                    <option value="supplies">Supplies & Maintenance</option>
                    <option value="other">Other Operational Charge</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={receiptPaymentMethod}
                    onChange={(e: any) => setReceiptPaymentMethod(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="fuel_card">Fuel Card (Company Account)</option>
                    <option value="driver_paid_reimbursement">Driver Out-of-Pocket (Reimbursement)</option>
                    <option value="company_direct">Company Credit Card / Direct</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Receipt Image or Scale Ticket Document</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Merchant / Facility Name</label>
                  <input
                    type="text"
                    placeholder={receiptExpenseCategory === 'scale_ticket' ? 'CAT Scale #1024' : receiptExpenseCategory === 'truck_wash' ? 'Blue Beacon Truck Wash' : "Love's Travel Stop"}
                    value={receiptMerchant}
                    onChange={(e) => setReceiptMerchant(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Scale Ticket / Invoice #</label>
                  <input
                    type="text"
                    placeholder="e.g. ST-88291"
                    value={receiptTicketNumber}
                    onChange={(e) => setReceiptTicketNumber(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="13.50"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Unit</label>
                  <select
                    value={receiptTruckId}
                    onChange={(e) => setReceiptTruckId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="">-- Select Truck --</option>
                    {trucks.map(t => (
                      <option key={t.id} value={t.truckNumber}>Truck #{t.truckNumber}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trip / Load #</label>
                  <input
                    type="text"
                    placeholder="e.g. LD-1002"
                    value={receiptLoadId}
                    onChange={(e) => setReceiptLoadId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes & Description</label>
                <input
                  type="text"
                  placeholder="Optional details (e.g. Gross weight recheck, trailer wash out before reefer load)"
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowReceiptUploadModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadReceipt}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
              >
                Log Receipt / Charge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINTABLE TRIP FUEL & EXPENSE STATEMENT */}
      {selectedStatement && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-900">{selectedStatement.statementNumber}</h3>
                  <span className="text-xs font-mono font-black bg-indigo-600 text-white px-2.5 py-1 rounded-lg">
                    {getUniquePoNumber(selectedStatement)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-semibold">TRIP FUEL & EXPENSE SETTLEMENT STATEMENT</p>
              </div>
              <button onClick={() => setSelectedStatement(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕ Close</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-indigo-600 font-bold uppercase text-[10px] block">PO Number (Unique)</span>
                <span className="font-bold font-mono text-indigo-900 text-sm bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block">{getUniquePoNumber(selectedStatement)}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Load / Trip Number</span>
                <span className="font-bold text-slate-900 text-sm">{selectedStatement.loadNumber || selectedStatement.tripNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Assigned Driver</span>
                <span className="font-bold text-slate-900 text-sm">{selectedStatement.driverNameSnapshot || 'Driver'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Assigned Unit</span>
                <span className="font-bold text-slate-900 text-sm">{selectedStatement.truckNumberSnapshot || 'Unit'}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-900">Trip Expenses & Fuel Breakdown:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-emerald-800 font-semibold">Diesel Fuel</div>
                  <div className="text-lg font-black text-emerald-900">{selectedStatement.dieselGallonsDecimal} gal</div>
                  <div className="text-xs font-mono font-bold text-emerald-700">${((selectedStatement.dieselAmountCents || 0) / 100).toFixed(2)}</div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="text-blue-800 font-semibold">DEF Fluid</div>
                  <div className="text-lg font-black text-blue-900">{selectedStatement.defGallonsDecimal} gal</div>
                  <div className="text-xs font-mono font-bold text-blue-700">${((selectedStatement.defAmountCents || 0) / 100).toFixed(2)}</div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-amber-800 font-semibold">Reefer Fuel</div>
                  <div className="text-lg font-black text-amber-900">{selectedStatement.reeferGallonsDecimal} gal</div>
                  <div className="text-xs font-mono font-bold text-amber-700">${((selectedStatement.reeferAmountCents || 0) / 100).toFixed(2)}</div>
                </div>

                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <div className="text-indigo-800 font-semibold">CAT Scale Tickets</div>
                  <div className="text-lg font-black text-indigo-900">${((selectedStatement.scaleTicketsCents || 0) / 100).toFixed(2)}</div>
                  <div className="text-xs font-mono text-indigo-700 font-bold">Weigh Station Fees</div>
                </div>

                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="text-teal-800 font-semibold">Truck Washes</div>
                  <div className="text-lg font-black text-teal-900">${((selectedStatement.truckWashCents || 0) / 100).toFixed(2)}</div>
                  <div className="text-xs font-mono text-teal-700 font-bold">Washout / Care</div>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="text-purple-800 font-semibold">Fees & Discounts</div>
                  <div className="text-lg font-black text-purple-900">${((selectedStatement.feesCents || 0) / 100).toFixed(2)}</div>
                  <div className="text-xs font-mono font-bold text-purple-700">Card Fees</div>
                </div>
              </div>
            </div>

            {selectedStatement.driverReimbursementsCents ? (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-900">
                <div>
                  <span>Driver Out-of-Pocket Reimbursement Due:</span>
                  <span className="block text-[10px] text-emerald-700 font-normal">Scale tickets, car/truck washes, or tolls paid directly by driver</span>
                </div>
                <span className="text-base font-mono font-black">${((selectedStatement.driverReimbursementsCents || 0) / 100).toFixed(2)}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-xl">
              <div>
                <div className="text-xs text-slate-400 font-semibold">Total Trip Gross Charges</div>
                <div className="text-xl font-mono font-black text-emerald-400">${((selectedStatement.grossFuelCostCents || 0) / 100).toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 font-semibold">Proposed Settlement Deduction</div>
                <div className="text-xl font-mono font-black text-rose-400">
                  ${(((selectedStatement.proposedOwnerOperatorDeductionCents || selectedStatement.proposedDriverDeductionCents || 0)) / 100).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {selectedStatement.status !== 'approved' && selectedStatement.status !== 'locked' && (
                <button
                  onClick={() => handleApproveTripStatement(selectedStatement.id)}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Approving...' : 'Approve Statement'}
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-800 transition"
              >
                Print / Export PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE FUEL CARD CONFIRMATION */}
      {cardToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Fuel Card?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete fuel card <span className="font-mono font-bold text-slate-800">{cardToDelete.cardNumberMasked || `****${cardToDelete.cardNumberLast4}`}</span> ({cardToDelete.provider?.replace('_', ' ').toUpperCase()})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setCardToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCard(cardToDelete)}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Yes, Delete Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE IMPORT BATCH CONFIRMATION */}
      {batchToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Import Batch?</h3>
                <p className="text-xs text-slate-500">Batch ID: <span className="font-mono font-bold text-slate-800">{batchToDelete.id}</span></p>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-600">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  Warning: All Batch Transactions Will Be Purged
                </p>
                <p className="text-[11px] text-rose-800">
                  Deleting this batch will permanently remove all fuel transactions created by this statement from your database ledger, while marking the batch status as <strong>DELETED</strong> to maintain historical audit trail compliance.
                </p>
              </div>

              {batchToDelete.originalFileName && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-slate-700 font-medium">
                  <span className="text-slate-500">File Name:</span>
                  <span className="font-bold text-slate-900">{batchToDelete.originalFileName}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Deletion (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Wrong document uploaded / Incorrect statement date range"
                  value={deleteBatchReason}
                  onChange={(e) => setDeleteBatchReason(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setBatchToDelete(null);
                  setDeleteBatchReason('');
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBatch(batchToDelete.id, deleteBatchReason)}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {loading ? 'Purging Batch...' : 'Confirm Delete Batch & Purge Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK ASSIGN DRIVER & TRUCK */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" /> Assign Driver & Truck to {selectedTxIds.length} Transactions
              </h3>
              <button onClick={() => setShowBulkAssignModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Driver to Assign</label>
                <select
                  value={bulkDriverId}
                  onChange={(e) => setBulkDriverId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Leave Unchanged / Select Driver --</option>
                  {drivers.map(d => (
                    <option key={d.id || d.uid} value={d.id || d.uid}>{d.name} ({d.email || 'Driver'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Truck Unit to Assign</label>
                <select
                  value={bulkTruckId}
                  onChange={(e) => setBulkTruckId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Leave Unchanged / Select Truck --</option>
                  {trucks.map(t => (
                    <option key={t.id || t.number} value={t.number || t.id}>Truck #{t.number || t.id}</option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] font-medium leading-relaxed">
                Assigning a driver or truck to selected transactions will update their operational mapping and automatically mark the transactions as <strong>Auto-Matched & Approved</strong>.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowBulkAssignModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssignDriverAndTruck}
                disabled={loading || (!bulkDriverId && !bulkTruckId)}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? 'Assigning...' : `Apply Assignment (${selectedTxIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SOURCE DOCUMENT VIEWER */}
      {selectedBatchDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm text-white">{selectedBatchDoc.originalFileName}</h3>
                  <span className="text-[10px] font-mono text-slate-400">Batch Reference ID: {selectedBatchDoc.batchId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadBatchDocument(selectedBatchDoc)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" /> Download File
                </button>
                <button
                  onClick={() => setSelectedBatchDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto bg-slate-100 flex flex-col items-center justify-center">
              {selectedBatchDoc.fileMimeType?.includes('pdf') || selectedBatchDoc.originalFileName?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={selectedBatchDoc.fileBase64?.startsWith('data:') ? selectedBatchDoc.fileBase64 : `data:application/pdf;base64,${selectedBatchDoc.fileBase64}`}
                  className="w-full h-[600px] rounded-xl border border-slate-300 shadow-inner bg-white"
                  title="Statement Document Preview"
                />
              ) : (
                <div className="w-full h-[600px] bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-xl overflow-auto border border-slate-800 leading-relaxed">
                  <pre className="whitespace-pre-wrap break-all">
                    {selectedBatchDoc.fileBase64?.startsWith('data:') ? atob(selectedBatchDoc.fileBase64.split(',')[1] || '') : selectedBatchDoc.fileBase64}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelCardsManager;
