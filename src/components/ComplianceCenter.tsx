import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  FileCheck,
  FileX,
  Upload,
  Sparkles,
  Download,
  Filter,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  FileText,
  User,
  Truck,
  Building2,
  Calendar,
  AlertCircle,
  Send,
  HelpCircle,
  ChevronRight,
  Info,
  Check,
  Layers,
  Award,
  ArrowUpRight,
  Printer
} from 'lucide-react';
import { auth, uploadFileToStorage } from '../firebase';
import {
  Company,
  User as AppUser,
  ComplianceRequirement,
  ComplianceDocument,
  ComplianceAlert,
  ComplianceStatus,
  ComplianceCategory,
  ComplianceScopeType,
  ComplianceCriticality,
  hasDispatcherPermission
} from '../types';
import { IftaDashboard } from './IftaDashboard';

interface ComplianceCenterProps {
  company: Company;
  currentUser: AppUser;
  users?: AppUser[];
  pageTheme?: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
}

export function ComplianceCenter({
  company,
  currentUser,
  users = [],
  pageTheme = 'enterprise_light'
}: ComplianceCenterProps) {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const isAdmin = currentUser.role === 'admin' || isSuperAdmin;
  const isDispatcher = currentUser.role === 'dispatcher';
  const isDriver = currentUser.role === 'driver';

  // Permission checks
  const canView = isAdmin || (isDispatcher && hasDispatcherPermission(currentUser, 'compliance', 'view')) || isDriver;
  const canUpload = isAdmin || (isDispatcher && hasDispatcherPermission(currentUser, 'compliance', 'upload')) || isDriver;
  const canApprove = isAdmin || (isDispatcher && hasDispatcherPermission(currentUser, 'compliance', 'approve'));
  const canRequest = isAdmin || (isDispatcher && hasDispatcherPermission(currentUser, 'compliance', 'requestDocuments'));
  const canDownloadAudit = isAdmin || (isDispatcher && hasDispatcherPermission(currentUser, 'compliance', 'downloadAuditPacket'));

  // Tab State
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'expiring'
    | 'missing'
    | 'driver'
    | 'vehicle'
    | 'company'
    | 'insurance'
    | 'tax_ifta'
    | 'safety_fmcsa'
    | 'vault'
    | 'audit'
  >('dashboard');

  // Firestore & API State
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCriticality, setSelectedCriticality] = useState<string>('all');

  // Upload & Extraction Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState<ComplianceRequirement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBase64, setUploadBase64] = useState<string>('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [parsingAi, setParsingAi] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  // Form Field Confirmations
  const [confExpirationDate, setConfExpirationDate] = useState('');
  const [confDueDate, setConfDueDate] = useState('');
  const [confIssueDate, setConfIssueDate] = useState('');
  const [confEffectiveDate, setConfEffectiveDate] = useState('');
  const [confDriverName, setConfDriverName] = useState('');
  const [confTruckNumber, setConfTruckNumber] = useState('');

  // Review Modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingDoc, setReviewingDoc] = useState<ComplianceDocument | null>(null);
  const [reviewingReq, setReviewingReq] = useState<ComplianceRequirement | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Add Requirement Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ComplianceCategory>('driver');
  const [newScope, setNewScope] = useState<ComplianceScopeType>('driver');
  const [newCriticality, setNewCriticality] = useState<ComplianceCriticality>('high');
  const [newDueDate, setNewDueDate] = useState('');
  const [newExpDate, setNewExpDate] = useState('');

  // Audit Packet Modal / Printable
  const [auditPacket, setAuditPacket] = useState<any>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Fetch Requirements from Backend API
  const fetchData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/compliance/requirements/${company.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setRequirements(data.requirements || []);
        setDocuments(data.documents || []);
        setAlerts(data.alerts || []);

        // Auto initialize standard templates if empty
        if ((data.requirements || []).length === 0 && (isAdmin || isSuperAdmin)) {
          await initializeTemplates(token);
        }
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to load compliance data' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error connecting to compliance service' });
    } finally {
      setLoading(false);
    }
  };

  const initializeTemplates = async (authToken?: string) => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = authToken || (await firebaseUser.getIdToken());

      const res = await fetch('/api/compliance/initialize-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId: company.id })
      });
      const data = await res.json();
      if (data.success) {
        // Re-fetch
        const fetchRes = await fetch(`/api/compliance/requirements/${company.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fetchDataJson = await fetchRes.json();
        if (fetchDataJson.success) {
          setRequirements(fetchDataJson.requirements || []);
        }
      }
    } catch (err) {
      console.error('Failed to initialize compliance templates:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [company.id]);

  const handleRecalculate = async () => {
    setRefreshing(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/compliance/recalculate/${company.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: 'success', text: data.message });
        await fetchData();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to recalculate' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setRefreshing(false);
    }
  };

  // Filtered Requirements
  const filteredRequirements = useMemo(() => {
    return requirements.filter((r) => {
      // Driver scope constraint if user is driver
      if (isDriver && r.scopeType !== 'driver' && r.entityId !== currentUser.id) {
        return false;
      }

      // Tab filter
      if (activeTab === 'expiring' && r.status !== 'expiring_soon') return false;
      if (activeTab === 'missing' && r.status !== 'missing_proof') return false;
      if (activeTab === 'driver' && r.category !== 'driver') return false;
      if (activeTab === 'vehicle' && r.category !== 'vehicle') return false;
      if (activeTab === 'company' && r.category !== 'company') return false;
      if (activeTab === 'insurance' && r.category !== 'insurance') return false;
      if (activeTab === 'tax_ifta' && r.category !== 'tax_ifta') return false;
      if (activeTab === 'safety_fmcsa' && r.category !== 'safety_fmcsa') return false;

      // Dropdown filters
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && r.status !== selectedStatus) return false;
      if (selectedCriticality !== 'all' && r.criticality !== selectedCriticality) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = r.title.toLowerCase().includes(q);
        const nameMatch = r.entityDisplayName?.toLowerCase().includes(q);
        const fileMatch = r.proofFileName?.toLowerCase().includes(q);
        return titleMatch || nameMatch || fileMatch;
      }

      return true;
    });
  }, [requirements, activeTab, selectedCategory, selectedStatus, selectedCriticality, searchQuery, isDriver, currentUser.id]);

  // Metric Summaries
  const totalReqs = requirements.length;
  const compliantCount = requirements.filter((r) => r.status === 'compliant').length;
  const expiringCount = requirements.filter((r) => r.status === 'expiring_soon').length;
  const expiredCount = requirements.filter((r) => r.status === 'expired').length;
  const missingCount = requirements.filter((r) => r.status === 'missing_proof').length;
  const reviewCount = requirements.filter((r) => r.status === 'pending_review').length;
  const criticalCount = requirements.filter(
    (r) => (r.criticality === 'critical' || r.criticality === 'high') && (r.status === 'expired' || r.status === 'missing_proof')
  ).length;

  const complianceScore = totalReqs > 0 ? Math.round((compliantCount / totalReqs) * 100) : 100;

  // File Upload & AI Parse Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setUploadFileName(file.name);
    setExtractedData(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      setUploadBase64((evt.target?.result as string) || '');
    };
    reader.readAsDataURL(file);
  };

  const handleParseWithAi = async () => {
    if (!uploadBase64) {
      setFeedback({ type: 'error', text: 'Please select a PDF document or file first.' });
      return;
    }

    setParsingAi(true);
    setFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/compliance/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          pdfBase64: uploadBase64,
          mimeType: uploadFile?.type || 'application/pdf',
          documentType: selectedReq?.category || 'cdl_license'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExtractedData(data.extractedFields || {});
        if (data.extractedFields?.expirationDate) setConfExpirationDate(data.extractedFields.expirationDate);
        if (data.extractedFields?.dueDate) setConfDueDate(data.extractedFields.dueDate);
        if (data.extractedFields?.issueDate) setConfIssueDate(data.extractedFields.issueDate);
        if (data.extractedFields?.effectiveDate) setConfEffectiveDate(data.extractedFields.effectiveDate);
        if (data.extractedFields?.driverName) setConfDriverName(data.extractedFields.driverName);
        if (data.extractedFields?.truckNumber) setConfTruckNumber(data.extractedFields.truckNumber);

        setFeedback({ type: 'success', text: 'Gemini AI extracted metadata. Please review and confirm dates below.' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'AI parsing failed' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to extract file data with AI' });
    } finally {
      setParsingAi(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || (!uploadFile && !uploadBase64)) {
      setFeedback({ type: 'error', text: 'Please select a file to upload.' });
      return;
    }

    setUploading(true);
    setFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      // Upload file to storage
      let publicFileUrl = '';
      if (uploadFile) {
        publicFileUrl = await uploadFileToStorage(
          uploadFile,
          `compliance/${company.id}/${selectedReq.id}_${Date.now()}_${uploadFile.name}`
        );
      }

      if (!publicFileUrl) {
        publicFileUrl = `https://storage.googleapis.com/demo-buckets/${company.id}/${uploadFileName}`;
      }

      const uploadRes = await fetch('/api/compliance/upload-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          requirementId: selectedReq.id,
          scopeType: selectedReq.scopeType,
          entityId: selectedReq.entityId,
          documentType: selectedReq.category,
          fileUrl: publicFileUrl,
          fileName: uploadFileName || uploadFile?.name || 'document.pdf',
          fileSize: uploadFile?.size,
          mimeType: uploadFile?.type || 'application/pdf',
          extractedFields: extractedData || {
            expirationDate: confExpirationDate,
            dueDate: confDueDate,
            issueDate: confIssueDate,
            effectiveDate: confEffectiveDate,
            driverName: confDriverName,
            truckNumber: confTruckNumber
          }
        })
      });

      const uploadDataJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadDataJson.success) {
        throw new Error(uploadDataJson.error || 'Failed to save uploaded document record');
      }

      // If user is Admin or has approve permission, auto approve with confirmed dates
      if (canApprove) {
        await fetch('/api/compliance/review-document', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            companyId: company.id,
            documentId: uploadDataJson.documentId,
            requirementId: selectedReq.id,
            action: 'approve',
            reviewNotes: 'Verified and confirmed during upload',
            confirmedExpirationDate: confExpirationDate || null,
            confirmedDueDate: confDueDate || null,
            confirmedIssueDate: confIssueDate || null,
            confirmedEffectiveDate: confEffectiveDate || null
          })
        });
      }

      setFeedback({
        type: 'success',
        text: canApprove
          ? 'Proof document uploaded and marked compliant!'
          : 'Proof document submitted successfully! Sent to Fleet Admin for verification review.'
      });

      setShowUploadModal(false);
      setSelectedReq(null);
      setUploadFile(null);
      setUploadBase64('');
      setExtractedData(null);
      await fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to complete document upload' });
    } finally {
      setUploading(false);
    }
  };

  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (!reviewingDoc || !reviewingReq) return;

    setReviewSubmitting(true);
    setFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/compliance/review-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          documentId: reviewingDoc.id,
          requirementId: reviewingReq.id,
          action,
          rejectionReason,
          reviewNotes,
          confirmedExpirationDate: confExpirationDate || reviewingReq.expirationDate,
          confirmedDueDate: confDueDate || reviewingReq.dueDate
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: action === 'approve' ? 'Document approved and requirement compliant!' : 'Document rejected.'
        });
        setShowReviewModal(false);
        setReviewingDoc(null);
        setReviewingReq(null);
        await fetchData();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to review document' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error processing document review' });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleGenerateAuditPacket = async () => {
    setLoadingAudit(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/compliance/audit-packet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ companyId: company.id })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAuditPacket(data.auditPacket);
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to generate audit packet' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error creating audit packet' });
    } finally {
      setLoadingAudit(false);
    }
  };

  const getStatusBadge = (status: ComplianceStatus) => {
    switch (status) {
      case 'compliant':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Compliant
          </span>
        );
      case 'expiring_soon':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Expiring Soon
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            Expired
          </span>
        );
      case 'missing_proof':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
            <FileX className="w-3.5 h-3.5 text-purple-600" />
            Missing Proof
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            Pending Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-700" />
            Rejected
          </span>
        );
      case 'not_applicable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
            Not Applicable
          </span>
        );
      default:
        return null;
    }
  };

  const getCriticalityBadge = (criticality: ComplianceCriticality) => {
    switch (criticality) {
      case 'critical':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">Critical</span>;
      case 'high':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">High</span>;
      case 'medium':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">Medium</span>;
      case 'low':
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Low</span>;
      default:
        return null;
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl my-6">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Compliance Center Restricted</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
          Your account role does not have permission to view commercial carrier compliance records. Please request permission <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">permissions.compliance.view</code> from your Fleet Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-indigo-900/40">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <ShieldCheck className="w-72 h-72 text-indigo-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> FMCSR & DOT Regulatory Fleet Control
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2.5 py-1 rounded-full">
                Multi-Tenant Vault
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              Compliance Center
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/80 max-w-2xl leading-relaxed">
              Track CDL certifications, annual DOT inspections, public liability insurance, quarterly IFTA filings, clearinghouse queries, and FMCSA safety audit records for <strong>{company.name}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleRecalculate}
              disabled={refreshing}
              className="px-4 py-2.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition border border-white/15 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Recalculating...' : 'Recalculate Status'}</span>
            </button>

            {canDownloadAudit && (
              <button
                onClick={() => {
                  setActiveTab('audit');
                  handleGenerateAuditPacket();
                }}
                className="px-4 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Audit Packet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold text-gray-500 hover:text-gray-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: Compliance Score */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
            <span>Audit Score</span>
            <Award className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-2xl font-black ${complianceScore >= 90 ? 'text-emerald-600' : complianceScore >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>
              {complianceScore}%
            </span>
            <span className="text-[10px] text-gray-400 font-medium">compliant</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${complianceScore >= 90 ? 'bg-emerald-500' : complianceScore >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${complianceScore}%` }}
            ></div>
          </div>
        </div>

        {/* Metric 2: Compliant */}
        <div className="bg-white border border-emerald-100 bg-emerald-50/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Compliant</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-700">{compliantCount}</span>
            <span className="text-[10px] text-emerald-600/80 font-medium ml-1">/ {totalReqs} items</span>
          </div>
        </div>

        {/* Metric 3: Expiring Soon */}
        <div className="bg-white border border-amber-100 bg-amber-50/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold">
            <span>Expiring Soon</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-800">{expiringCount}</span>
            <span className="text-[10px] text-amber-600/80 font-medium ml-1">within 30d</span>
          </div>
        </div>

        {/* Metric 4: Expired */}
        <div className="bg-white border border-rose-100 bg-rose-50/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-800 text-xs font-semibold">
            <span>Expired</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-700">{expiredCount}</span>
            <span className="text-[10px] text-rose-600/80 font-medium ml-1">action needed</span>
          </div>
        </div>

        {/* Metric 5: Missing Proof */}
        <div className="bg-white border border-purple-100 bg-purple-50/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-800 text-xs font-semibold">
            <span>Missing Proof</span>
            <FileX className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-purple-800">{missingCount}</span>
            <span className="text-[10px] text-purple-600/80 font-medium ml-1">no document</span>
          </div>
        </div>

        {/* Metric 6: Pending Review */}
        <div className="bg-white border border-blue-100 bg-blue-50/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-800 text-xs font-semibold">
            <span>Pending Review</span>
            <RefreshCw className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-blue-800">{reviewCount}</span>
            <span className="text-[10px] text-blue-600/80 font-medium ml-1">needs verification</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto scrollbar-none flex items-center gap-1">
        {[
          { id: 'dashboard', label: 'Overview Dashboard', icon: ShieldCheck },
          { id: 'expiring', label: `Expiring Soon (${expiringCount})`, icon: Clock, badge: expiringCount > 0 },
          { id: 'missing', label: `Missing Proof (${missingCount})`, icon: FileX, badge: missingCount > 0 },
          { id: 'driver', label: 'Driver Compliance', icon: User },
          { id: 'vehicle', label: 'Vehicle Compliance', icon: Truck },
          { id: 'company', label: 'Company Authority', icon: Building2 },
          { id: 'insurance', label: 'Insurance (COI)', icon: ShieldCheck },
          { id: 'tax_ifta', label: 'Tax & IFTA', icon: FileText },
          { id: 'safety_fmcsa', label: 'Safety / FMCSA', icon: ShieldAlert },
          { id: 'vault', label: 'Document Vault', icon: Layers },
          { id: 'audit', label: 'Audit Reports', icon: FileCheck }
        ].map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {activeTab === 'audit' ? (
        /* AUDIT PACKET VIEW */
        <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                FMCSR & DOT Carrier Audit Packet
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Official compliance audit report summary for {company.name} (DOT #{company.dotNumber || 'N/A'}).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateAuditPacket}
                disabled={loadingAudit}
                className="px-4 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                <span>Generate Latest Audit Packet</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>

          {auditPacket ? (
            <div className="space-y-6 print:p-0">
              {/* Carrier Letterhead */}
              <div className="p-6 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-extrabold tracking-widest text-indigo-400 uppercase">
                    OFFICIAL CARRIER COMPLIANCE DOSSIER
                  </div>
                  <h3 className="text-xl font-black text-white">{auditPacket.companyName}</h3>
                  <div className="text-xs text-slate-300 font-mono flex flex-wrap gap-3">
                    <span>DOT #{auditPacket.dotNumber}</span>
                    <span>ADDRESS: {auditPacket.address}</span>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6 space-y-1">
                  <div className="text-xs text-slate-400">Compliance Audit Score</div>
                  <div className="text-3xl font-black text-emerald-400">{auditPacket.complianceScore}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Generated: {new Date(auditPacket.generatedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Requirements Audit Table */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Requirement / Category</th>
                      <th className="p-3">Scope / Entity</th>
                      <th className="p-3">Criticality</th>
                      <th className="p-3">Expiration / Due Date</th>
                      <th className="p-3">Verified Document</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {(auditPacket.requirements || []).map((req: any) => (
                      <tr key={req.id} className="hover:bg-gray-50/50">
                        <td className="p-3 font-bold text-gray-900">
                          {req.title}
                          <div className="text-[10px] text-gray-400 uppercase font-mono">{req.category}</div>
                        </td>
                        <td className="p-3 capitalize">{req.scopeType}</td>
                        <td className="p-3">{getCriticalityBadge(req.criticality)}</td>
                        <td className="p-3 font-mono font-medium">{req.expirationDate || req.dueDate || 'N/A'}</td>
                        <td className="p-3">
                          {req.proofFileName ? (
                            <span className="text-indigo-600 font-semibold">{req.proofFileName}</span>
                          ) : (
                            <span className="text-gray-400 italic">No document attached</span>
                          )}
                        </td>
                        <td className="p-3">{getStatusBadge(req.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legal Disclaimer Box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-500 leading-relaxed font-sans">
                <div className="font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Compliance Management System Disclaimer
                </div>
                {auditPacket.disclaimer}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs text-gray-500 font-medium">Building audit summary report packet...</p>
            </div>
          )}
        </div>
      ) : activeTab === 'vault' ? (
        /* DOCUMENT VAULT VIEW */
        <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Compliance Document Vault ({documents.length} File{documents.length !== 1 ? 's' : ''})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Central repository for driver CDLs, DOT inspections, insurance certificates, and tax filings.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-[11px]">
                <tr>
                  <th className="p-3">File Name / Type</th>
                  <th className="p-3">Scope / Entity</th>
                  <th className="p-3">Uploaded Date</th>
                  <th className="p-3">AI Metadata Extraction</th>
                  <th className="p-3">Verification Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400 italic">
                      No documents uploaded yet in the compliance vault.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50/50">
                      <td className="p-3 font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>{doc.fileName}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 uppercase font-mono mt-0.5">{doc.documentType}</div>
                      </td>
                      <td className="p-3 capitalize">{doc.scopeType}</td>
                      <td className="p-3 font-mono">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        {doc.extractedFields?.expirationDate ? (
                          <div className="text-[11px] text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-100 inline-block font-mono">
                            Exp: {doc.extractedFields.expirationDate}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">No dates extracted</span>
                        )}
                      </td>
                      <td className="p-3">
                        {doc.verificationStatus === 'approved' && (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full text-[10px]">
                            Approved
                          </span>
                        )}
                        {doc.verificationStatus === 'pending_review' && (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full text-[10px]">
                            Pending Review
                          </span>
                        )}
                        {doc.verificationStatus === 'rejected' && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 font-bold px-2 py-0.5 rounded-full text-[10px]">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> View File
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'tax_ifta' ? (
        /* IFTA TAX DASHBOARD & FUEL LEDGER ENGINE */
        <IftaDashboard
          company={company}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          userRole={currentUser.role}
        />
      ) : (
        /* DASHBOARD / CATEGORY FILTERED REQUIREMENTS LIST */
        <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4 shadow-sm">
          {/* Controls & Search Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search requirement, driver, truck #, or document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Categories</option>
                <option value="driver">Driver</option>
                <option value="vehicle">Vehicle</option>
                <option value="company">Company Authority</option>
                <option value="insurance">Insurance</option>
                <option value="tax_ifta">Tax & IFTA</option>
                <option value="safety_fmcsa">Safety & FMCSA</option>
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="compliant">Compliant</option>
                <option value="expiring_soon">Expiring Soon</option>
                <option value="expired">Expired</option>
                <option value="missing_proof">Missing Proof</option>
                <option value="pending_review">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Criticality Filter */}
              <select
                value={selectedCriticality}
                onChange={(e) => setSelectedCriticality(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Criticality</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Requirements Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Requirement / Scope</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Criticality</th>
                  <th className="p-3.5">Due / Expiration Date</th>
                  <th className="p-3.5">Verified Proof</th>
                  <th className="p-3.5">Audit Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      <span>Loading compliance records...</span>
                    </td>
                  </tr>
                ) : filteredRequirements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                      No compliance requirements found matching the current search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRequirements.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50/60 transition">
                      <td className="p-3.5 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{req.title}</span>
                          {req.source === 'ai_extracted' && (
                            <span className="bg-purple-100 text-purple-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> AI
                            </span>
                          )}
                        </div>
                        {req.description && <div className="text-[11px] text-gray-500 font-normal mt-0.5">{req.description}</div>}
                      </td>

                      <td className="p-3.5">
                        <span className="bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-lg uppercase text-[10px]">
                          {req.category}
                        </span>
                      </td>

                      <td className="p-3.5">{getCriticalityBadge(req.criticality)}</td>

                      <td className="p-3.5 font-mono">
                        {req.expirationDate || req.dueDate ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800">{req.expirationDate || req.dueDate}</span>
                            <span className="text-[10px] text-gray-400">
                              {req.expirationDate ? 'Expiration' : 'Due Date'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No date set</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        {req.proofFileName ? (
                          <div className="flex items-center gap-1.5 font-semibold text-indigo-600">
                            <FileText className="w-3.5 h-3.5" />
                            <a href={req.proofFileUrl} target="_blank" rel="noreferrer" className="hover:underline">
                              {req.proofFileName}
                            </a>
                          </div>
                        ) : (
                          <span className="text-rose-500 font-medium text-[11px]">No proof uploaded</span>
                        )}
                      </td>

                      <td className="p-3.5">{getStatusBadge(req.status)}</td>

                      <td className="p-3.5 text-right space-x-1.5">
                        {canUpload && (
                          <button
                            onClick={() => {
                              setSelectedReq(req);
                              setShowUploadModal(true);
                              setExtractedData(null);
                              setConfExpirationDate(req.expirationDate || '');
                              setConfDueDate(req.dueDate || '');
                            }}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Upload className="w-3 h-3" /> Proof
                          </button>
                        )}

                        {canApprove && req.status === 'pending_review' && req.proofDocumentId && (
                          <button
                            onClick={() => {
                              const matchingDoc = documents.find((d) => d.id === req.proofDocumentId);
                              setReviewingReq(req);
                              setReviewingDoc(matchingDoc || null);
                              setShowReviewModal(true);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition inline-flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Legal Disclaimer Footer */}
          <div className="pt-4 text-center text-[11px] text-gray-400 border-t border-gray-100 leading-relaxed">
            TD Pro provides compliance tracking and document management tools. Final compliance responsibility remains with the tenant company and its qualified compliance, legal, tax, or safety advisors.
          </div>
        </div>
      )}

      {/* UPLOAD & AI EXTRACTION MODAL */}
      {showUploadModal && selectedReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Upload Compliance Proof</h3>
                  <p className="text-xs text-gray-500">{selectedReq.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* File Drop Area */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Select Document File (PDF or Image)</label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileSelect}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-200 rounded-xl p-1"
                  />
                  <button
                    type="button"
                    onClick={handleParseWithAi}
                    disabled={!uploadBase64 || parsingAi}
                    className="px-3.5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {parsingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Extract Dates (AI)</span>
                  </button>
                </div>
              </div>

              {/* Confirmed Dates Fields */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={confExpirationDate}
                    onChange={(e) => setConfExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={confDueDate}
                    onChange={(e) => setConfDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{canApprove ? 'Upload & Confirm Compliant' : 'Submit for Review'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN REVIEW MODAL */}
      {showReviewModal && reviewingDoc && reviewingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Review Compliance Document</h3>
                  <p className="text-xs text-gray-500">{reviewingReq.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <div className="font-semibold text-gray-800">Uploaded File: {reviewingDoc.fileName}</div>
                <div>
                  <a href={reviewingDoc.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline">
                    Click to Open & View Uploaded File
                  </a>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Confirm Expiration Date</label>
                <input
                  type="date"
                  value={confExpirationDate || reviewingReq.expirationDate || ''}
                  onChange={(e) => setConfExpirationDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Review Notes (Optional)</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Notes for audit log..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Rejection Reason (If rejecting)</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Expired document, illegible scan"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => handleReviewAction('reject')}
                  disabled={reviewSubmitting}
                  className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition"
                >
                  Reject Document
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewAction('approve')}
                  disabled={reviewSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                >
                  Approve & Mark Compliant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
