import React, { useState } from 'react';
import { 
  ArrowLeft, Plus, Trash2, Calendar, Clock, MapPin, Phone, User, 
  MessageSquare, Paperclip, Send, ShieldAlert, FileText, Upload, 
  CheckCircle, XCircle, Flag, Info, ToggleLeft, ToggleRight, DollarSign, Weight, Box, Compass, Edit
} from 'lucide-react';
import { Company, User as AppUser, Load, Message, Stop, LoadStatus, Truck } from '../types';
import { formatCurrency, formatWeight, formatDate, checkTruckPmGuard } from '../utils';
import { uploadFileToStorage } from '../firebase';

interface LoadEditWorkspaceProps {
  load: Load;
  onClose: () => void;
  company: Company;
  users: AppUser[];
  messages: Message[];
  onSendMessage: (loadId: string | undefined, channel: 'load' | 'general', text: string, attachmentName?: string, attachmentUrl?: string) => void;
  onUpdateLoad: (loadId: string, updates: Partial<Load>) => void;
  onAssignDriver: (loadId: string, driverId: string) => void;
  onUpdateLoadStatus: (loadId: string, status: LoadStatus) => void;
  activeUser?: AppUser;
  loads?: Load[];
  trucks?: Truck[];
}

export default function LoadEditWorkspace({
  load,
  onClose,
  company,
  users,
  messages,
  onSendMessage,
  onUpdateLoad,
  onAssignDriver,
  onUpdateLoadStatus,
  activeUser,
  loads = [],
  trucks = []
}: LoadEditWorkspaceProps) {
  
  // Local state for pickups and deliveries
  const [pickups, setPickups] = useState<Stop[]>(load.pickups || [load.pickup]);
  const [deliveries, setDeliveries] = useState<Stop[]>(load.deliveries || [load.delivery]);
  
  // Local state for comment input
  const [commentText, setCommentText] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; url: string } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  
  // Local state for POD preview modal
  const [showPodPreview, setShowPodPreview] = useState(false);

  // Local state for Load ID/Load Number editing pop-up
  const [showLoadIdPopup, setShowLoadIdPopup] = useState(false);
  const [loadIdInputVal, setLoadIdInputVal] = useState(load.loadNumber);

  // Local state for PM Warning Soft Box / Acknowledgment Modal
  const [pmAckModalData, setPmAckModalData] = useState<{
    driverId: string;
    driverName: string;
    truckNumber: string;
    pmStatus: string;
    milesOverdue: number;
    policy: string;
    isBlocked: boolean;
    isChecked: boolean;
  } | null>(null);

  // Active dispatcher name resolving
  const dispatcherName = activeUser?.name || 'Dispatcher';

  // Get active driver
  const companyDrivers = users.filter(u => u.role === 'driver' && u.companyId === company.id);
  const assignedDriver = users.find(u => u.id === load.assignedDriverId);

  // Filter messages for this load
  const loadMessages = messages.filter(m => m.loadId === load.id);

  // Stop field updating helper
  const handleUpdateStop = (
    type: 'pickup' | 'delivery',
    index: number,
    field: keyof Stop,
    value: string
  ) => {
    if (type === 'pickup') {
      const updated = [...pickups];
      updated[index] = { ...updated[index], [field]: value };
      setPickups(updated);
      
      // Sync primary stop & update load in parent
      onUpdateLoad(load.id, {
        pickups: updated,
        pickup: updated[0] // first pickup is synced to primary pickup
      });
    } else {
      const updated = [...deliveries];
      updated[index] = { ...updated[index], [field]: value };
      setDeliveries(updated);
      
      // Sync primary stop & update load in parent
      onUpdateLoad(load.id, {
        deliveries: updated,
        delivery: updated[0] // first delivery is synced to primary delivery
      });
    }
  };

  // Add stop helper
  const handleAddStop = (type: 'pickup' | 'delivery') => {
    const emptyStop: Stop = {
      facilityName: '',
      address: '',
      dateTime: new Date().toISOString().substring(0, 16),
      contactName: '',
      contactPhone: '',
      notes: '',
      referenceNumber: '',
      specialInstructions: ''
    };

    if (type === 'pickup') {
      const updated = [...pickups, emptyStop];
      setPickups(updated);
      onUpdateLoad(load.id, { pickups: updated });
    } else {
      const updated = [...deliveries, emptyStop];
      setDeliveries(updated);
      onUpdateLoad(load.id, { deliveries: updated });
    }
  };

  // Remove stop helper
  const handleRemoveStop = (type: 'pickup' | 'delivery', index: number) => {
    if (type === 'pickup') {
      if (pickups.length <= 1) return; // Must have at least one stop
      const updated = pickups.filter((_, idx) => idx !== index);
      setPickups(updated);
      onUpdateLoad(load.id, {
        pickups: updated,
        pickup: updated[0]
      });
    } else {
      if (deliveries.length <= 1) return; // Must have at least one stop
      const updated = deliveries.filter((_, idx) => idx !== index);
      setDeliveries(updated);
      onUpdateLoad(load.id, {
        deliveries: updated,
        delivery: updated[0]
      });
    }
  };

  // Chat/Activity Comment submitting
  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() && !attachedFile) return;
    
    const messageText = commentText.trim() || `Sent attachment: ${attachedFile?.name}`;
    onSendMessage(load.id, 'load', messageText, attachedFile?.name, attachedFile?.url);
    
    setCommentText('');
    setAttachedFile(null);
  };

  // Approve Proof of Delivery
  const handleApprovePod = () => {
    onUpdateLoad(load.id, { podStatus: 'approved' });
    onSendMessage(load.id, 'load', `${dispatcherName} (Dispatcher) approved the Proof of Delivery for this load.`);
    alert('Proof of Delivery approved successfully.');
  };

  // Reject Proof of Delivery
  const handleRejectPod = () => {
    onUpdateLoad(load.id, { 
      podStatus: 'rejected',
      podUrl: undefined, // remove POD image so driver can re-upload
      status: 'in_transit' // step status back so driver can interact with it
    });
    onSendMessage(load.id, 'load', `${dispatcherName} (Dispatcher) rejected the previously uploaded Proof of Delivery. Driver needs to re-upload clear document.`);
    alert('Proof of Delivery rejected. Driver will be notified to scan a new copy.');
  };

  const isDuplicate = load.loadNumber && loads.some(l => l.loadNumber?.trim().toLowerCase() === load.loadNumber?.trim().toLowerCase() && l.id !== load.id);

  return (
    <div className="bg-slate-50 min-h-screen pb-12 -mx-4 -mt-6 p-6 space-y-6" id="load-edit-workspace">
      
      {/* Workspace Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Back to Load Board"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                Active Logistics Workspace
              </span>
              {load.flagged && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded animate-pulse">
                  <Flag className="h-3 w-3 fill-red-600" /> Action Required
                </span>
              )}
              {isDuplicate && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded animate-pulse">
                  <ShieldAlert className="h-3 w-3 text-amber-600 shrink-0" /> Duplicate Load
                </span>
              )}
              {load.podStatus !== 'approved' && (
                <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border animate-pulse ${
                  load.podUrl 
                    ? 'bg-amber-100 text-amber-900 border-amber-300' 
                    : 'bg-rose-100 text-rose-900 border-rose-300'
                }`} title="Proof of Delivery is not yet approved by Dispatch or Admin">
                  <ShieldAlert className="h-3 w-3 text-amber-600 shrink-0" /> POD Not Approved
                </span>
              )}
            </div>
            <h2 
              onClick={() => {
                setLoadIdInputVal(load.loadNumber);
                setShowLoadIdPopup(true);
              }}
              className="font-heading text-lg font-extrabold text-slate-800 mt-0.5 cursor-pointer hover:text-indigo-600 transition flex items-center gap-1.5"
              title="Click to edit Load ID"
              id="load-h2-title"
            >
              Load #{load.loadNumber}
              <Edit className="h-3.5 w-3.5 text-slate-400 hover:text-indigo-600 shrink-0" />
            </h2>
            {load.createdAt && (
              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block" id="load-workspace-created-at">
                System Booked: {new Date(load.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </div>

        {/* Load ID Edit Pop-up Modal */}
        {showLoadIdPopup && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="load-id-popup-overlay">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm space-y-4 text-slate-800 animate-[fadeIn_0.15s]">
              <div className="flex items-center gap-2 border-b pb-2.5 border-slate-100">
                <Edit className="h-4 w-4 text-indigo-600" />
                <h3 className="font-heading font-extrabold text-sm text-slate-800">Edit Load Identifier</h3>
              </div>
              <p className="text-xs text-slate-500">
                Specify the custom Load ID or Load Number below. This updates the primary reference ID for this freight.
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 block">Load ID / Reference #</label>
                <input
                  type="text"
                  value={loadIdInputVal}
                  onChange={(e) => setLoadIdInputVal(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono font-bold text-slate-800 bg-slate-50"
                  autoFocus
                  placeholder="e.g. APX-2026-944"
                />
              </div>
              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowLoadIdPopup(false)}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (loadIdInputVal.trim()) {
                      onUpdateLoad(load.id, { loadNumber: loadIdInputVal.trim() });
                      setShowLoadIdPopup(false);
                    }
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm"
                >
                  Save Identifier
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Flag Toggle Button */}
          <button
            onClick={() => onUpdateLoad(load.id, { flagged: !load.flagged })}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
              load.flagged 
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Flag className={`h-3.5 w-3.5 ${load.flagged ? 'fill-red-600' : ''}`} />
            {load.flagged ? 'Flagged (Unflag)' : 'Flag Load'}
          </button>
          
          <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide border ${
            load.status === 'booked' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            load.status === 'dispatched' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            load.status === 'in_transit' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
            'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            ● {load.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {isDuplicate && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div className="text-xs text-amber-800">
            <p className="font-extrabold uppercase tracking-wide">Duplicate Load Number Detected</p>
            <p className="mt-0.5 text-amber-700 font-medium leading-relaxed">
              Warning: Another load in the company database has the identical load number <strong>#{load.loadNumber}</strong>. Please ensure this is unique to avoid driver routing errors or tracking conflicts.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner: POD Unapproved Alert */}
      {load.podStatus !== 'approved' && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs" id="pod-unapproved-top-banner">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-200 text-amber-950 rounded-xl shrink-0">
              <ShieldAlert className="h-5 w-5 text-amber-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                  POD NOT APPROVED BY DISPATCH / ADMIN
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[9px] bg-amber-200 text-amber-900 font-black tracking-wider uppercase animate-pulse">
                  FLAGGED - ACTION REQUIRED
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-0.5 font-medium">
                {load.podUrl
                  ? "A Proof of Delivery (POD) document was submitted by driver but has NOT been verified or approved by dispatch yet."
                  : "This load does not have an approved Proof of Delivery (POD) on file."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {load.podUrl && (
              <button
                type="button"
                onClick={handleApprovePod}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1 shadow-xs"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve POD Now
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const card = document.getElementById('pod-section-card');
                if (card) card.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs px-3 py-2 rounded-xl transition"
            >
              Review POD Details
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Left (Forms) / Right (Sidebars) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side (Pickups, Drops, Activity) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Pickup Locations Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="font-heading font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <span className="h-5 w-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center font-mono text-[10px] font-bold">PU</span>
                Pickup Locations & Origin Stops
              </h3>
              <button
                onClick={() => handleAddStop('pickup')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add Pickup Location
              </button>
            </div>

            <div className="space-y-6">
              {pickups.map((stop, idx) => (
                <div key={idx} className="relative p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-extrabold text-indigo-700 font-mono">
                      Pickup #{idx + 1} {idx === 0 && <span className="text-[9px] font-sans font-medium text-slate-400 ml-1.5">(Primary Origin)</span>}
                    </h4>
                    {pickups.length > 1 && (
                      <button
                        onClick={() => handleRemoveStop('pickup', idx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                        title="Delete Pickup Stop"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Facility Name</label>
                      <input
                        type="text"
                        value={stop.facilityName}
                        onChange={(e) => handleUpdateStop('pickup', idx, 'facilityName', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.facilityName) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Facility Name to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. Apex Core Logistics Warehouse"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Pickup Address</label>
                      <input
                        type="text"
                        value={stop.address}
                        onChange={(e) => handleUpdateStop('pickup', idx, 'address', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.address) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Address to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. 5400 Apex Pkwy, Dallas, TX"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Date & Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 06/01/2026 13:00"
                        value={stop.dateTime}
                        onChange={(e) => handleUpdateStop('pickup', idx, 'dateTime', e.target.value)}
                        onBlur={(e) => {
                          onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Date & Time to "${e.target.value}".`);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Reference Number</label>
                      <input
                        type="text"
                        value={stop.referenceNumber || ''}
                        onChange={(e) => handleUpdateStop('pickup', idx, 'referenceNumber', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.referenceNumber) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Reference Number to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. PU-98440-C"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={stop.contactName}
                          onChange={(e) => handleUpdateStop('pickup', idx, 'contactName', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value.trim() !== stop.contactName) {
                              onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Contact Name to "${e.target.value.trim()}".`);
                            }
                          }}
                          placeholder="e.g. Gary"
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Phone</label>
                        <input
                          type="text"
                          value={stop.contactPhone}
                          onChange={(e) => handleUpdateStop('pickup', idx, 'contactPhone', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value.trim() !== stop.contactPhone) {
                              onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Contact Phone to "${e.target.value.trim()}".`);
                            }
                          }}
                          placeholder="e.g. 555-0199"
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Special Instructions (Optional)</label>
                    <textarea
                      value={stop.specialInstructions || ''}
                      onChange={(e) => handleUpdateStop('pickup', idx, 'specialInstructions', e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== stop.specialInstructions) {
                          onSendMessage(load.id, 'load', `${dispatcherName} updated pickup #${idx + 1} Special Instructions.`);
                        }
                      }}
                      placeholder="e.g. Must call shipper 30 minutes prior to arrival. Gate code: #4400"
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs h-14 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none text-slate-800 font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dropoff Locations Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <h3 className="font-heading font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <span className="h-5 w-5 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center font-mono text-[10px] font-bold">DO</span>
                Dropoff Locations & Destination Stops
              </h3>
              <button
                onClick={() => handleAddStop('delivery')}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add Dropoff Location
              </button>
            </div>

            <div className="space-y-6">
              {deliveries.map((stop, idx) => (
                <div key={idx} className="relative p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-extrabold text-emerald-700 font-mono">
                      Dropoff #{idx + 1} {idx === 0 && <span className="text-[9px] font-sans font-medium text-slate-400 ml-1.5">(Primary Destination)</span>}
                    </h4>
                    {deliveries.length > 1 && (
                      <button
                        onClick={() => handleRemoveStop('delivery', idx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                        title="Delete Dropoff Stop"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Facility Name</label>
                      <input
                        type="text"
                        value={stop.facilityName}
                        onChange={(e) => handleUpdateStop('delivery', idx, 'facilityName', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.facilityName) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Facility Name to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. Apex Core Logistics Receiving"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Dropoff Address</label>
                      <input
                        type="text"
                        value={stop.address}
                        onChange={(e) => handleUpdateStop('delivery', idx, 'address', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.address) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Address to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. 1100 Industrial Pkwy, Chicago, IL"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Date & Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 06/01/2026 13:00"
                        value={stop.dateTime}
                        onChange={(e) => handleUpdateStop('delivery', idx, 'dateTime', e.target.value)}
                        onBlur={(e) => {
                          onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Date & Time to "${e.target.value}".`);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Reference Number</label>
                      <input
                        type="text"
                        value={stop.referenceNumber || ''}
                        onChange={(e) => handleUpdateStop('delivery', idx, 'referenceNumber', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== stop.referenceNumber) {
                            onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Reference Number to "${e.target.value.trim()}".`);
                          }
                        }}
                        placeholder="e.g. DO-1092-F"
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={stop.contactName}
                          onChange={(e) => handleUpdateStop('delivery', idx, 'contactName', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value.trim() !== stop.contactName) {
                              onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Contact Name to "${e.target.value.trim()}".`);
                            }
                          }}
                          placeholder="e.g. Sarah"
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Phone</label>
                        <input
                          type="text"
                          value={stop.contactPhone}
                          onChange={(e) => handleUpdateStop('delivery', idx, 'contactPhone', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value.trim() !== stop.contactPhone) {
                              onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Contact Phone to "${e.target.value.trim()}".`);
                            }
                          }}
                          placeholder="e.g. 555-0144"
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Special Instructions (Optional)</label>
                    <textarea
                      value={stop.specialInstructions || ''}
                      onChange={(e) => handleUpdateStop('delivery', idx, 'specialInstructions', e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== stop.specialInstructions) {
                          onSendMessage(load.id, 'load', `${dispatcherName} updated dropoff #${idx + 1} Special Instructions.`);
                        }
                      }}
                      placeholder="e.g. Check in at security booth. Rear unload docking bay 12."
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs h-14 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none text-slate-800 font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity / Chat Log Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-heading font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b pb-3 border-slate-100">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              Log Activity Stream & Chat Logs
            </h3>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 max-h-[300px] overflow-y-auto space-y-3">
                {loadMessages.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No log activity recorded yet for Load #{load.loadNumber}. Start typing below to add logs.
                  </div>
                ) : (
                  loadMessages.map((m) => (
                    <div key={m.id} className="text-xs space-y-1 bg-white p-2.5 rounded-lg border border-slate-150 shadow-2xs">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          {m.senderName} 
                          <span className="px-1 py-0.2 bg-slate-100 text-[8px] rounded uppercase text-slate-500 font-mono">
                            {m.senderRole}
                          </span>
                        </span>
                        <span className="text-slate-400 font-mono">{new Date(m.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-600 leading-normal">{m.text}</p>
                      {m.attachmentName && (
                        m.attachmentUrl ? (
                          <a
                            href={m.attachmentUrl}
                            download={m.attachmentName}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-bold text-indigo-700 mt-1 hover:bg-indigo-100 transition cursor-pointer"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Paperclip className="h-2.5 w-2.5" />
                            <span>Attachment: {m.attachmentName} (Download)</span>
                          </a>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-bold text-indigo-700 mt-1">
                            <Paperclip className="h-2.5 w-2.5" />
                            <span>Attachment: {m.attachmentName}</span>
                          </div>
                        )
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Attached file preview chip */}
              {(attachedFile || isUploadingFile) && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 text-xs text-indigo-850" id="pending-attachment-chip">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span className="font-mono font-semibold truncate max-w-xs flex-1">
                    {isUploadingFile ? "Uploading attachment..." : attachedFile?.name}
                  </span>
                  {!isUploadingFile && (
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="text-indigo-400 hover:text-indigo-600 transition font-bold text-sm px-1.5 cursor-pointer"
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Chat Send Form */}
              <form onSubmit={handleCommentSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type a message to add to the activity log..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 font-semibold"
                />
                
                {/* Paperclip attachment button */}
                <label 
                  id="activity-file-upload-label"
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl cursor-pointer transition flex items-center justify-center shrink-0"
                >
                  <Paperclip id="activity-file-upload-icon" className="h-4 w-4" />
                  <input
                    id="activity-file-upload-input"
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setIsUploadingFile(true);
                          const storagePath = `communications/${company.id}/${load.id}/${Date.now()}_${file.name}`;
                          const fileUrl = await uploadFileToStorage(file, storagePath);
                          setAttachedFile({ name: file.name, url: fileUrl });
                        } catch (err) {
                          console.error("Failed to upload comment file:", err);
                          alert("Failed to upload comment file. Please try again.");
                        } finally {
                          setIsUploadingFile(false);
                        }
                      }
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={isUploadingFile}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shrink-0 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </form>
            </div>
          </div>

          {/* GPS History Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h3 className="font-heading font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b pb-3 border-slate-100">
              <Compass className="h-4 w-4 text-indigo-600" />
              GPS History Coordinates
            </h3>
            
            {load.gpsHistory && load.gpsHistory.length > 0 ? (
              <div className="max-h-[140px] overflow-y-auto space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                {load.gpsHistory.map((g, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-mono text-slate-500 py-1 border-b border-slate-100 last:border-0">
                    <span className="font-bold text-slate-600">Tick #{idx + 1}</span>
                    <span>Lat: {g.lat.toFixed(5)}, Lng: {g.lng.toFixed(5)}</span>
                    <span className="text-slate-400">{new Date(g.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                No GPS coordinates tracked yet. In-transit simulation will populate points.
              </div>
            )}
          </div>

        </div>

        {/* Right Side (Sidebar Cards) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Sidebar Card 1: Load Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h4 className="font-heading font-extrabold text-xs text-slate-400 uppercase tracking-wider">
              1. Load Details & Controls
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Company Name</label>
                <input
                  type="text"
                  value={load.companyName || ''}
                  onChange={(e) => onUpdateLoad(load.id, { companyName: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== load.companyName) {
                      onSendMessage(load.id, 'load', `${dispatcherName} updated Broker/Shipper Company Name to "${e.target.value.trim()}".`);
                    }
                  }}
                  placeholder="Enter custom Company Name"
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Carrier Company Name</label>
                <input
                  type="text"
                  value={load.carrierName || ''}
                  onChange={(e) => onUpdateLoad(load.id, { carrierName: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value.trim() !== load.carrierName) {
                      onSendMessage(load.id, 'load', `${dispatcherName} updated Carrier Company Name to "${e.target.value.trim()}".`);
                    }
                  }}
                  placeholder="Enter Carrier Company Name"
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold text-indigo-700 bg-indigo-50/20"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Load ID</label>
                <input
                  type="text"
                  value={load.loadNumber}
                  onChange={(e) => onUpdateLoad(load.id, { loadNumber: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== load.loadNumber) {
                      onSendMessage(load.id, 'load', `${dispatcherName} updated Load ID / Reference # to "${e.target.value.trim()}".`);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Reefer Temperature Setting (°F)</label>
                <input
                  type="text"
                  value={load.temperature || ''}
                  onChange={(e) => onUpdateLoad(load.id, { temperature: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value.trim() !== load.temperature) {
                      onSendMessage(load.id, 'load', `${dispatcherName} updated Reefer Temperature setting to "${e.target.value.trim()}".`);
                    }
                  }}
                  placeholder="e.g. 33.0 F Continuous"
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold text-rose-600 bg-rose-50/20"
                />
              </div>

              {/* PM Guard Warning Banner */}
              {(() => {
                const currentAssignedDriver = load.assignedDriverId ? companyDrivers.find(d => d.id === load.assignedDriverId) : null;
                const matchedTruckForLoad = currentAssignedDriver ? trucks.find(t => 
                  (load.assignedTruckId && t.id === load.assignedTruckId) ||
                  (currentAssignedDriver.currentTruckId && t.id === currentAssignedDriver.currentTruckId) ||
                  (load.assignedTruckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(load.assignedTruckNumber).trim().toUpperCase()) ||
                  (currentAssignedDriver.truckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(currentAssignedDriver.truckNumber).trim().toUpperCase()) ||
                  (currentAssignedDriver.assignedTruck && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(currentAssignedDriver.assignedTruck).trim().toUpperCase())
                ) : null;
                const pmGuard = matchedTruckForLoad ? checkTruckPmGuard(matchedTruckForLoad) : null;

                if (!pmGuard || (!pmGuard.isOverdueOrDue && !pmGuard.isBlocked)) return null;

                if (load.pmWarningAcknowledged && !pmGuard.isBlocked) {
                  return (
                    <div className="p-3.5 rounded-xl border bg-emerald-50/90 border-emerald-200 text-emerald-950 text-xs space-y-1.5 animate-in fade-in shadow-xs">
                      <div className="font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>DISPATCH ACKNOWLEDGED & AUTHORIZED</span>
                        </span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 uppercase font-extrabold text-emerald-900">
                          Unit #{matchedTruckForLoad?.truckNumber}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-emerald-900">
                        Power Unit #{matchedTruckForLoad?.truckNumber} is PM <strong>{pmGuard.status.toUpperCase()}</strong> ({pmGuard.milesOverdue.toLocaleString()} mi overdue). Dispatch authorized by <strong>{load.pmWarningAcknowledgedBy || dispatcherName}</strong>{load.pmWarningAcknowledgedAt ? ` on ${formatDate(load.pmWarningAcknowledgedAt)}` : ''}.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-2 animate-in fade-in ${
                    pmGuard.isBlocked 
                      ? 'bg-rose-50 border-rose-200 text-rose-900' 
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className={`h-4 w-4 shrink-0 ${pmGuard.isBlocked ? 'text-rose-600' : 'text-amber-600'}`} />
                        <span>{pmGuard.isBlocked ? '⛔ DISPATCH BLOCKED BY PM GUARD' : '⚠️ PREVENTIVE MAINTENANCE WARNING'}</span>
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/80 border uppercase font-bold">
                        Unit #{matchedTruckForLoad?.truckNumber}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-95">
                      {pmGuard.reason} Fleet Policy: <strong className="uppercase font-mono">{pmGuard.policy}</strong>.
                    </p>

                    {!pmGuard.isBlocked && currentAssignedDriver && (
                      <button
                        type="button"
                        onClick={() => {
                          setPmAckModalData({
                            driverId: currentAssignedDriver.id,
                            driverName: currentAssignedDriver.name,
                            truckNumber: matchedTruckForLoad?.truckNumber || 'N/A',
                            pmStatus: pmGuard.status,
                            milesOverdue: pmGuard.milesOverdue,
                            policy: pmGuard.policy,
                            isBlocked: false,
                            isChecked: false
                          });
                        }}
                        className="mt-1.5 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Acknowledge & Authorize Dispatch
                      </button>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Status</label>
                <select
                  value={load.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as LoadStatus;
                    onUpdateLoadStatus(load.id, nextStatus);
                    onSendMessage(load.id, 'load', `${dispatcherName} updated status to ${nextStatus.toUpperCase().replace('_', ' ')}.`);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold cursor-pointer text-slate-800"
                >
                  <option value="booked" className="text-slate-800 bg-white">Booked</option>
                  <option value="dispatched" className="text-slate-800 bg-white">Dispatched</option>
                  <option value="in_transit" className="text-slate-800 bg-white">In-Transit</option>
                  <option value="delivered" className="text-slate-800 bg-white">Delivered</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Assign Driver</label>
                <select
                  value={load.assignedDriverId || ''}
                  onChange={(e) => {
                    const driverId = e.target.value;
                    if (!driverId) {
                      onAssignDriver(load.id, '');
                      onSendMessage(load.id, 'load', `${dispatcherName} unassigned driver from this load.`, undefined);
                      return;
                    }

                    const selectedDrv = companyDrivers.find(d => d.id === driverId);
                    if (!selectedDrv) return;

                    const drvTruck = trucks.find(t => 
                      (selectedDrv.currentTruckId && t.id === selectedDrv.currentTruckId) ||
                      (selectedDrv.truckNumber && t.truckNumber && String(selectedDrv.truckNumber).trim().toUpperCase() === String(t.truckNumber).trim().toUpperCase()) ||
                      (selectedDrv.assignedTruck && t.truckNumber && String(selectedDrv.assignedTruck).trim().toUpperCase() === String(t.truckNumber).trim().toUpperCase())
                    );
                    const drvPmGuard = drvTruck ? checkTruckPmGuard(drvTruck) : null;

                    if (drvPmGuard && (drvPmGuard.isOverdueOrDue || drvPmGuard.isBlocked)) {
                      setPmAckModalData({
                        driverId: selectedDrv.id,
                        driverName: selectedDrv.name,
                        truckNumber: drvTruck?.truckNumber || selectedDrv.truckNumber || 'N/A',
                        pmStatus: drvPmGuard.status,
                        milesOverdue: drvPmGuard.milesOverdue,
                        policy: drvPmGuard.policy,
                        isBlocked: drvPmGuard.isBlocked,
                        isChecked: false
                      });
                    } else {
                      onAssignDriver(load.id, driverId);
                      onSendMessage(load.id, 'load', `${dispatcherName} assigned driver ${selectedDrv.name} to this load.`, undefined);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold cursor-pointer text-slate-800"
                >
                  <option value="" className="text-slate-500 bg-white">⚠️ Unassigned / Select Driver</option>
                  {companyDrivers.map((drv) => {
                    const drvTruck = trucks.find(t => 
                      (drv.currentTruckId && t.id === drv.currentTruckId) ||
                      (drv.truckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(drv.truckNumber).trim().toUpperCase()) ||
                      (drv.assignedTruck && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(drv.assignedTruck).trim().toUpperCase())
                    );
                    const drvPmGuard = drvTruck ? checkTruckPmGuard(drvTruck) : null;
                    const pmBadge = drvPmGuard?.isBlocked ? ' ⛔ DISPATCH BLOCKED' : drvPmGuard?.isOverdueOrDue ? ' ⚠️ PM OVERDUE' : '';

                    return (
                      <option key={drv.id} value={drv.id} className="text-slate-800 bg-white">
                        {drv.name} ({drv.truckNumber || 'No Truck'}{pmBadge})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">GPS Tracking Required</label>
                    <span className="text-[9px] text-slate-400 font-medium">Require ELD stream for this load</span>
                  </div>
                  <button
                    onClick={() => {
                      const nextVal = !load.gpsTrackingRequired;
                      onUpdateLoad(load.id, { 
                        gpsTrackingRequired: nextVal,
                        gpsTrackingRequestedBy: nextVal ? (activeUser?.id || 'dispatcher_uid') : null,
                        ...(nextVal ? {} : {
                          gpsConsentAccepted: false,
                          gpsConsentAcceptedBy: null,
                          gpsConsentAcceptedAt: null,
                          currentGps: null
                        })
                      });
                      onSendMessage(
                        load.id, 
                        'load', 
                        `${dispatcherName} ${nextVal ? 'set GPS tracking as REQUIRED' : 'removed the GPS tracking requirement'} for this load.`
                      );
                    }}
                    className="text-indigo-600 hover:text-indigo-800 transition"
                  >
                    {load.gpsTrackingRequired ? (
                      <ToggleRight className="h-8 w-8 text-indigo-600" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-slate-300" />
                    )}
                  </button>
                </div>

                {load.gpsTrackingRequired && (
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 font-medium">ELD Consent Status:</span>
                    {load.gpsConsentAccepted ? (
                      <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        ✓ Granted
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                        ⚠️ Pending Driver
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Card 2: Financials ("For Internal Use Only") */}
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-lg p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center">
              <h4 className="font-heading font-extrabold text-xs text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                Financials & Commodity
              </h4>
              <span className="text-[8px] bg-indigo-900/60 text-indigo-300 px-1.5 py-0.2 rounded font-mono uppercase tracking-wide border border-indigo-700/50">
                INTERNAL ONLY
              </span>
            </div>

            <div className="space-y-3 relative z-10">
              <div>
                <label className="block text-[10px] uppercase font-extrabold text-slate-400 mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-emerald-400" /> Rate (Dispatcher input)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono font-bold">$</span>
                  <input
                    type="number"
                    value={load.rate}
                    onChange={(e) => onUpdateLoad(load.id, { rate: parseFloat(e.target.value) || 0 })}
                    onBlur={(e) => onSendMessage(load.id, 'load', `${dispatcherName} updated Rate to ${formatCurrency(parseFloat(e.target.value) || 0)}.`)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-1.5 pl-6 pr-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-extrabold text-slate-400 mb-1 flex items-center gap-1">
                    <Box className="h-3 w-3 text-indigo-400" /> Cargo Type
                  </label>
                  <input
                    type="text"
                    value={load.cargoType}
                    onChange={(e) => onUpdateLoad(load.id, { cargoType: e.target.value })}
                    onBlur={(e) => onSendMessage(load.id, 'load', `${dispatcherName} updated Cargo Type to "${e.target.value}".`)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-extrabold text-slate-400 mb-1 flex items-center gap-1">
                    <Weight className="h-3 w-3 text-indigo-400" /> Weight (lbs)
                  </label>
                  <input
                    type="number"
                    value={load.weight}
                    onChange={(e) => onUpdateLoad(load.id, { weight: parseInt(e.target.value) || 0 })}
                    onBlur={(e) => onSendMessage(load.id, 'load', `${dispatcherName} updated Cargo Weight to ${formatWeight(parseInt(e.target.value) || 0)}.`)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-extrabold text-slate-400 mb-1">Cargo Value ($)</label>
                <input
                  type="number"
                  value={load.value}
                  onChange={(e) => onUpdateLoad(load.id, { value: parseFloat(e.target.value) || 0 })}
                  onBlur={(e) => onSendMessage(load.id, 'load', `${dispatcherName} updated Cargo Valuation to ${formatCurrency(parseFloat(e.target.value) || 0)}.`)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-1.5 px-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-extrabold text-slate-400 mb-1">Internal Notes</label>
                <textarea
                  value={load.internalNotes || ''}
                  onChange={(e) => onUpdateLoad(load.id, { internalNotes: e.target.value })}
                  onBlur={(e) => onSendMessage(load.id, 'load', `${dispatcherName} updated internal Dispatcher Notes.`)}
                  placeholder="These notes are confidential and will never be shared or sync'd with CDL driver's ELD screen."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-1.5 px-3 text-xs h-20 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none text-[11px] leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Sidebar Card 4: Proof of Delivery */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" id="pod-section-card">
            <div className="flex items-center justify-between">
              <h4 className="font-heading font-extrabold text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1">
                Proof of Delivery (POD)
              </h4>
              <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full uppercase tracking-wider ${
                load.podStatus === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                load.podStatus === 'rejected' ? 'bg-red-100 text-red-800 border border-red-200' :
                'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
              }`}>
                {load.podStatus === 'approved' ? 'Approved' : load.podStatus === 'rejected' ? 'Rejected' : 'Not Approved'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">RC Number / Reference</label>
                <input
                  type="text"
                  value={load.rcNumber || ''}
                  onChange={(e) => onUpdateLoad(load.id, { rcNumber: e.target.value })}
                  placeholder="e.g. RC-982440"
                  className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {load.podUploadedAt && (
                <div className="text-[10px] font-mono text-slate-400">
                  Uploaded: {new Date(load.podUploadedAt).toLocaleString()}
                </div>
              )}

              {/* View Scanned POD Action */}
              {load.podUrl ? (
                <button
                  type="button"
                  onClick={() => setShowPodPreview(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <FileText className="h-4 w-4" /> View Uploaded POD Document
                </button>
              ) : (
                <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 font-medium">
                  No POD document scanned or uploaded by driver yet.
                </div>
              )}

              {/* Approve/Reject Controls */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                <button
                  type="button"
                  onClick={handleApprovePod}
                  className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-extrabold text-xs py-2 px-2.5 rounded-lg transition flex items-center justify-center gap-1"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Approve POD
                </button>
                <button
                  type="button"
                  onClick={handleRejectPod}
                  className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-extrabold text-xs py-2 px-2.5 rounded-lg transition flex items-center justify-center gap-1"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject POD
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* POD Preview Modal Dialog */}
      {showPodPreview && load.podUrl && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden border border-slate-800 shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center text-white">
              <span className="text-xs font-mono font-bold">POD Document: {load.loadNumber}</span>
              <button
                onClick={() => setShowPodPreview(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-white flex items-center justify-center aspect-[3/4]">
              <img src={load.podUrl} alt="POD scan document" className="max-h-[70vh] object-contain" />
            </div>
            <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowPodPreview(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PM Overdue Soft Box / Modal Acknowledgment Dialog */}
      {pmAckModalData && (
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden border border-slate-200 shadow-2xl">
            <div className={`p-4 border-b flex justify-between items-center text-white ${
              pmAckModalData.isBlocked ? 'bg-rose-900 border-rose-800' : 'bg-amber-900 border-amber-800'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-300 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {pmAckModalData.isBlocked ? '⛔ Dispatch Blocked by PM Policy' : '⚠️ PM Overdue Dispatch Acknowledgment'}
                </span>
              </div>
              <button
                onClick={() => setPmAckModalData(null)}
                className="text-amber-200 hover:text-white transition font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Power Unit Number:</span>
                  <span className="font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border">
                    Unit #{pmAckModalData.truckNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Assigned Driver:</span>
                  <span className="font-bold text-slate-900">{pmAckModalData.driverName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Maintenance Status:</span>
                  <span className="font-bold text-rose-600 font-mono">
                    PM {pmAckModalData.pmStatus.toUpperCase()} ({pmAckModalData.milesOverdue.toLocaleString()} mi overdue)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Fleet Policy:</span>
                  <span className="font-bold text-slate-800 font-mono uppercase">{pmAckModalData.policy}</span>
                </div>
              </div>

              {pmAckModalData.isBlocked ? (
                <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl leading-relaxed">
                  Dispatch is strictly blocked under fleet policy <strong>HARD_BLOCK</strong>. Power Unit #{pmAckModalData.truckNumber} cannot be dispatched until preventive maintenance is completed and logged in Fleet Operations.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Power Unit #{pmAckModalData.truckNumber} is currently overdue for scheduled preventive maintenance. Under policy <strong>{pmAckModalData.policy.toUpperCase()}</strong>, dispatcher authorization is required to assign and dispatch this load.
                  </p>

                  {/* Soft Box Checkbox */}
                  <label className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-300 rounded-xl cursor-pointer hover:bg-amber-100/80 transition select-none">
                    <input
                      type="checkbox"
                      checked={pmAckModalData.isChecked}
                      onChange={(e) => setPmAckModalData({ ...pmAckModalData, isChecked: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-xs text-amber-950 font-semibold leading-relaxed">
                      I, <strong>{dispatcherName}</strong>, hereby acknowledge that Power Unit #{pmAckModalData.truckNumber} has PM Overdue ({pmAckModalData.milesOverdue.toLocaleString()} mi overdue) and authorize assignment & dispatch under fleet policy.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setPmAckModalData(null)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              {!pmAckModalData.isBlocked && (
                <button
                  disabled={!pmAckModalData.isChecked}
                  onClick={() => {
                    const drvId = pmAckModalData.driverId;
                    const drvName = pmAckModalData.driverName;
                    const trkNum = pmAckModalData.truckNumber;
                    const miOver = pmAckModalData.milesOverdue;
                    
                    // 1. Assign driver
                    onAssignDriver(load.id, drvId);
                    
                    // 2. Save PM acknowledgment record on load
                    onUpdateLoad(load.id, {
                      pmWarningAcknowledged: true,
                      pmWarningAcknowledgedBy: dispatcherName,
                      pmWarningAcknowledgedAt: new Date().toISOString(),
                      pmWarningTruckNumber: trkNum,
                      pmWarningMilesOverdue: miOver
                    });

                    onSendMessage(load.id, 'load', `${dispatcherName} assigned driver ${drvName} and acknowledged PM Overdue warning for Power Unit #${trkNum}.`, undefined);

                    setPmAckModalData(null);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Acknowledge & Dispatch</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
