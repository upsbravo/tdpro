import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Upload, 
  FileText, 
  Trash2, 
  Loader2, 
  FileCheck2, 
  AlertCircle, 
  Clock, 
  User2,
  Sparkles
} from 'lucide-react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, uploadFileToStorage, auth } from '../firebase';
import { Company, User as AppUser } from '../types';
import CustomConfirmModal from './CustomConfirmModal';

interface RateConfirmation {
  id: string;
  lrcn: string;
  fileName: string;
  fileUrl: string;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
}

interface RateConfirmationsViewProps {
  company: Company;
  users: AppUser[];
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
}

export default function RateConfirmationsView({ company, users, pageTheme }: RateConfirmationsViewProps) {
  const [lrcn, setLrcn] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rateConfirmations, setRateConfirmations] = useState<RateConfirmation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Find active uploader
  const currentUserObj = users.find(u => u.id === auth.currentUser?.uid);
  const uploaderName = currentUserObj?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown User';

  // Fetch Rate Confirmations
  const fetchConfirmations = async () => {
    setIsFetching(true);
    setErrorMsg(null);
    try {
      const colRef = collection(db, 'admins', company.id, 'rate_confirmations');
      const q = query(colRef, orderBy('uploadedAt', 'desc'));
      const snapshot = await getDocs(q);
      const list: RateConfirmation[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          lrcn: data.lrcn || '',
          fileName: data.fileName || 'document.pdf',
          fileUrl: data.fileUrl || '',
          uploaderId: data.uploaderId || '',
          uploaderName: data.uploaderName || 'Unknown User',
          uploadedAt: data.uploadedAt || new Date().toISOString()
        });
      });
      setRateConfirmations(list);
    } catch (err: any) {
      console.error("Failed to fetch rate confirmations:", err);
      setErrorMsg("Failed to load rate confirmations from database. Please verify your permissions.");
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchConfirmations();
  }, [company.id]);

  // Handle upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lrcn.trim()) {
      setErrorMsg("Please enter a valid Load Rate Confirmation Number (LRCN).");
      return;
    }
    if (!selectedFile) {
      setErrorMsg("Please choose a Rate Confirmation document or image file first.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const timestamp = Date.now();
      const sanitizedFileName = selectedFile.name.replace(/\s+/g, '_');
      const storagePath = `rate_confirmations/${company.id}/${timestamp}_${sanitizedFileName}`;
      
      // Upload file to Firebase Storage
      const fileUrl = await uploadFileToStorage(selectedFile, storagePath);

      // Save metadata in Firestore
      const colRef = collection(db, 'admins', company.id, 'rate_confirmations');
      await addDoc(colRef, {
        lrcn: lrcn.trim(),
        fileName: selectedFile.name,
        fileUrl,
        uploaderId: auth.currentUser?.uid || '',
        uploaderName,
        uploadedAt: new Date().toISOString()
      });

      setSuccessMsg(`Rate Confirmation ${lrcn.trim()} uploaded and registered successfully.`);
      setLrcn('');
      setSelectedFile(null);
      
      // Reset input element
      const fileInput = document.getElementById('rc-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Refresh list
      await fetchConfirmations();
    } catch (err: any) {
      console.error("Failed to upload rate confirmation:", err);
      setErrorMsg(`Failed to complete rate confirmation upload: ${err.message || err}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Delete
  const handleDelete = (rcId: string, lrcnVal: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Rate Confirmation',
      message: `Are you sure you want to permanently delete the Rate Confirmation record for LRCN "${lrcnVal}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
          const docRef = doc(db, 'admins', company.id, 'rate_confirmations', rcId);
          await deleteDoc(docRef);
          setSuccessMsg(`Rate Confirmation record for "${lrcnVal}" has been deleted.`);
          await fetchConfirmations();
        } catch (err: any) {
          console.error("Failed to delete confirmation:", err);
          setErrorMsg("Failed to delete the rate confirmation record.");
        }
      }
    });
  };

  // Format Date for listing
  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
      });
    } catch (e) {
      return isoString;
    }
  };

  // Local filtered search
  const filteredConfirmations = rateConfirmations.filter(rc => 
    rc.lrcn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rc.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dynamic Theme Classes
  const cardClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-900 border border-slate-800 text-white shadow-xl' :
    pageTheme === 'industrial_terminal' ? 'bg-black border border-amber-500/30 text-amber-400 font-mono shadow-[0_0_15px_rgba(245,158,11,0.05)]' :
    'bg-white border border-slate-200 text-slate-800 shadow-sm';

  const inputClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-950 border-slate-800 focus:border-purple-500 text-white placeholder-slate-600 focus:ring-1 focus:ring-purple-500' :
    pageTheme === 'industrial_terminal' ? 'bg-black border-amber-500/30 focus:border-amber-500 text-amber-400 placeholder-amber-700 focus:ring-1 focus:ring-amber-500' :
    'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-800 focus:ring-1 focus:ring-indigo-500';

  const buttonPrimary = 
    pageTheme === 'cosmic_dark' ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/10' :
    pageTheme === 'industrial_terminal' ? 'bg-amber-500 text-black font-black border-2 border-amber-500 hover:bg-amber-400' :
    'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10';

  const titleClass = 
    pageTheme === 'industrial_terminal' ? 'text-amber-400 uppercase font-black tracking-wider' : 'font-heading font-bold text-slate-900 dark:text-white';

  const tableHeaderClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-950/50 text-slate-400 font-semibold' :
    pageTheme === 'industrial_terminal' ? 'bg-amber-500/5 text-amber-500/80 border-b border-amber-500/20 font-black uppercase' :
    'bg-slate-50 text-slate-500 font-semibold';

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="rate-confirmations-view">
      
      {/* Messages */}
      {errorMsg && (
        <div className={`p-4 rounded-xl border flex gap-3 items-start ${
          pageTheme === 'industrial_terminal' ? 'border-red-500/30 bg-black text-red-500' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-200 text-xs'
        }`} id="rc-error-alert">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Error:</span> {errorMsg}
          </div>
        </div>
      )}

      {successMsg && (
        <div className={`p-4 rounded-xl border flex gap-3 items-start ${
          pageTheme === 'industrial_terminal' ? 'border-amber-500 bg-black text-amber-500' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-xs'
        }`} id="rc-success-alert">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500 dark:text-emerald-400" />
          <div>
            <span className="font-bold">Success:</span> {successMsg}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form (5 cols) */}
        <div className="lg:col-span-4">
          <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`} id="rc-upload-form-card">
            <div>
              <h3 className={`text-md ${titleClass}`}>Upload Rate Confirmation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enter the LRCN and upload the PDF or image file.
              </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-800 dark:text-amber-300 leading-snug flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>AI Review Disclaimer</strong>: AI-extracted rate confirmations and documents must be verified by licensed dispatch personnel before finalizing load invoices or dispatch orders.
              </span>
            </div>

            <form onSubmit={handleUpload} className="space-y-4" id="rc-upload-form">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 block">
                  Load Rate Confirmation Number (LRCN)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 123456-ABC"
                  value={lrcn}
                  onChange={e => setLrcn(e.target.value)}
                  className={`w-full text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-1 border transition ${inputClass}`}
                  id="rc-lrcn-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 block">
                  Document File
                </label>
                <div className="relative">
                  <input
                    type="file"
                    required
                    accept=".pdf,image/*"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setSelectedFile(file);
                    }}
                    className={`w-full text-xs font-mono font-semibold rounded-xl p-2.5 border file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold ${
                      pageTheme === 'cosmic_dark' ? 'bg-slate-950 border-slate-800 text-slate-300 file:bg-slate-800 file:text-purple-300 hover:file:bg-slate-700' :
                      pageTheme === 'industrial_terminal' ? 'bg-black border-amber-500/30 text-amber-500 file:bg-amber-500/10 file:text-amber-500 file:border file:border-amber-500/20 hover:file:bg-amber-500/20' :
                      'bg-slate-50 border-slate-200 text-slate-700 file:bg-slate-200 file:text-indigo-700 hover:file:bg-slate-300'
                    }`}
                    id="rc-file-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${buttonPrimary}`}
                id="rc-upload-submit-btn"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Uploading File...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload File</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Table/List (7 cols) */}
        <div className="lg:col-span-8">
          <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`} id="rc-list-card">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className={`text-md ${titleClass}`}>Uploaded Confirmations</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  A list of all uploaded rate confirmations.
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by LRCN..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl focus:outline-none focus:ring-1 border transition ${inputClass}`}
                  id="rc-search-input"
                />
              </div>
            </div>

            {/* Content Container */}
            <div className="overflow-x-auto" id="rc-table-wrapper">
              {isFetching ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-500" id="rc-loading-state">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400 mb-2" />
                  <span>Fetching record logs from carrier database...</span>
                </div>
              ) : filteredConfirmations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center" id="rc-empty-state">
                  <div className="p-3 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 mb-3">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">No Rate Confirmations Found</h4>
                  <p className="text-[10px] text-slate-400 max-w-xs mt-1">
                    {searchQuery ? "No records match your search criteria. Try a different search." : "No Rate Confirmation documents have been uploaded for this carrier company profile yet."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse" id="rc-table">
                  <thead>
                    <tr className={`text-[10px] uppercase tracking-wider rounded-xl ${tableHeaderClass}`}>
                      <th className="p-3 font-semibold rounded-l-xl">LRCN</th>
                      <th className="p-3 font-semibold">File Name</th>
                      <th className="p-3 font-semibold">Uploaded</th>
                      <th className="p-3 font-semibold text-right rounded-r-xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConfirmations.map((rc, idx) => (
                      <tr 
                        key={rc.id} 
                        className={`text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800/50 last:border-0 ${
                          pageTheme === 'industrial_terminal' ? 'hover:bg-amber-500/5 border-amber-500/10' : ''
                        }`}
                        id={`rc-row-${rc.id}`}
                      >
                        {/* LRCN */}
                        <td className="p-3 font-bold font-sans">
                          {rc.lrcn}
                        </td>
                        
                        {/* File Name */}
                        <td className="p-3 font-semibold">
                          <a 
                            href={rc.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-purple-400 hover:underline transition font-semibold"
                            id={`rc-link-${rc.id}`}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[150px] sm:max-w-[220px] truncate">{rc.fileName}</span>
                          </a>
                        </td>

                        {/* Uploaded By & Time */}
                        <td className="p-3 text-[10px] text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <User2 className="h-3 w-3 text-slate-400" />
                            <span>{rc.uploaderName}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-slate-400 font-mono text-[9px]">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{formatDateTime(rc.uploadedAt)}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(rc.id, rc.lrcn)}
                            className="text-rose-500 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                            title="Delete Rate Confirmation Record"
                            id={`rc-delete-btn-${rc.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

      </div>

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

    </div>
  );
}
