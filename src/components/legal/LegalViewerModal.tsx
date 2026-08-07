import React, { useState } from 'react';
import { FileText, X, Search, ShieldCheck, Scale, Lock, ShieldAlert, Check, Copy } from 'lucide-react';
import { LEGAL_DOCUMENTS, LegalDocument } from './legalDocuments';

interface LegalViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSlug?: string;
}

export default function LegalViewerModal({ isOpen, onClose, initialSlug = 'terms-of-service' }: LegalViewerModalProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSlug);
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const docKeys = Object.keys(LEGAL_DOCUMENTS);
  const currentDoc: LegalDocument = LEGAL_DOCUMENTS[selectedSlug] || LEGAL_DOCUMENTS['terms-of-service'];

  const filteredDocs = docKeys.filter((key) => {
    const doc = LEGAL_DOCUMENTS[key];
    return (
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.summary.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(currentDoc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-md">
      <div className="w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Truck Dispatch Pro Compliance & Legal Center
                <span className="text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  {currentDoc.version}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Official binding agreements, disclosures, and regulatory policies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Copy current document text"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body with Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Document Directory Sidebar */}
          <div className="w-72 border-r border-slate-800 bg-slate-950/40 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-800/80">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search 19 policies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl text-xs py-1.5 left-2 pl-8 pr-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
              {filteredDocs.map((key) => {
                const doc = LEGAL_DOCUMENTS[key];
                const isSelected = doc.slug === currentDoc.slug;

                return (
                  <button
                    key={doc.slug}
                    onClick={() => setSelectedSlug(doc.slug)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition cursor-pointer flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate pr-1">{doc.title}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        {doc.version}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Document Content */}
          <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {currentDoc.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{currentDoc.summary}</p>
              </div>

              <div className="text-right text-[11px] text-slate-500 font-mono">
                <div>Effective: {currentDoc.effectiveDate}</div>
                <div>Status: Active / Immutable</div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto scrollbar-thin font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
              {currentDoc.content}
            </div>

            <div className="p-3 px-6 bg-slate-950/80 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Truck Dispatch Pro Legal Compliance Engine • SHA-256 Verified
              </span>
              <span>Doc ID: {currentDoc.slug}-{currentDoc.version}</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
