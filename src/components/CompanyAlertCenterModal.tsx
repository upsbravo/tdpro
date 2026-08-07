import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, Clock, Phone, MapPin, Send, MessageSquare, X, ExternalLink, Loader2, User, Truck, Check, RefreshCw } from 'lucide-react';
import { Company, User as AppUser, Load, DriverAlert, DriverAlertMessage } from '../types';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface CompanyAlertCenterModalProps {
  company: Company;
  currentUser: AppUser;
  loads: Load[];
  isOpen: boolean;
  onClose: () => void;
  initialSelectedAlertId?: string | null;
}

export default function CompanyAlertCenterModal({
  company,
  currentUser,
  loads,
  isOpen,
  onClose,
  initialSelectedAlertId,
}: CompanyAlertCenterModalProps) {
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(initialSelectedAlertId || null);
  const [messages, setMessages] = useState<DriverAlertMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  // Resolution modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isStaff = currentUser.role === 'admin' || currentUser.role === 'dispatcher' || currentUser.role === 'super_admin';

  // 1. Listen to Driver Alerts collection in real time
  useEffect(() => {
    if (!isOpen || !company.id) return;

    const alertsRef = collection(db, 'admins', company.id, 'driver_alerts');
    let q;
    if (currentUser.role === 'driver') {
      q = query(alertsRef, where('driverId', '==', currentUser.id));
    } else {
      q = query(alertsRef);
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      const list: DriverAlert[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriverAlert));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setAlerts(list);

      // Default selected alert
      if (initialSelectedAlertId && list.some(a => a.id === initialSelectedAlertId)) {
        setSelectedAlertId(initialSelectedAlertId);
      } else if (list.length > 0 && !selectedAlertId) {
        setSelectedAlertId(list[0].id);
      }
    }, (err) => {
      console.warn('Real-time alerts snapshot listener warning:', err);
    });

    return () => unsubscribe();
  }, [isOpen, company.id, currentUser.id, currentUser.role, initialSelectedAlertId]);

  // 2. Listen to Messages subcollection for selected alert
  useEffect(() => {
    if (!isOpen || !company.id || !selectedAlertId) {
      setMessages([]);
      return;
    }

    const msgsRef = collection(db, 'admins', company.id, 'driver_alerts', selectedAlertId, 'messages');
    const unsubscribe = onSnapshot(msgsRef, (snap) => {
      const msgList: DriverAlertMessage[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriverAlertMessage));
      msgList.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      setMessages(msgList);
    }, (err) => {
      console.warn('Alert messages listener warning:', err);
    });

    return () => unsubscribe();
  }, [isOpen, company.id, selectedAlertId]);

  // Scroll to bottom of chat on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedAlert = alerts.find(a => a.id === selectedAlertId) || null;
  const linkedLoad = selectedAlert?.loadId ? loads.find(l => l.id === selectedAlert.loadId) : null;

  // Actions
  const handleAcknowledge = async () => {
    if (!selectedAlert) return;
    setIsActioning(true);
    setActionError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/driver-alerts/${selectedAlert.id}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ companyId: company.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to acknowledge alert');
      setIsActioning(false);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Failed to acknowledge alert');
      setIsActioning(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert || !resolutionNote.trim()) return;
    setIsActioning(true);
    setActionError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/driver-alerts/${selectedAlert.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ companyId: company.id, resolutionNote })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve alert');
      setShowResolveModal(false);
      setResolutionNote('');
      setIsActioning(false);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Failed to resolve alert');
      setIsActioning(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert || !messageInput.trim()) return;

    setIsSendingMsg(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/driver-alerts/${selectedAlert.id}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId: company.id,
          message: messageInput.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setMessageInput('');
      setIsSendingMsg(false);
    } catch (err: any) {
      console.error(err);
      alert(`Message error: ${err.message}`);
      setIsSendingMsg(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-5xl w-full h-[90vh] text-white shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="bg-zinc-900/90 border-b border-zinc-800 px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-base tracking-wide text-white">
                  BREAKDOWN & EMERGENCY ALERT CENTER
                </h2>
                <span className="bg-red-950 text-red-400 border border-red-800 text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full">
                  {alerts.filter(a => a.status === 'open' || a.status === 'acknowledged').length} Active
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Live driver breakdown, roadside, and safety issue management space.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Legal Emergency Banner */}
        <div className="bg-red-950/40 border-b border-red-900/60 px-5 py-2 flex items-center justify-between text-[10.5px] text-red-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span>
              <strong>Dispatcher Disclaimer</strong>: Breakdown SOS alerts notify carrier personnel only. This system does NOT contact 911 or emergency services.
            </span>
          </div>
          <span className="text-zinc-500 font-mono text-[10px] hidden md:inline">49 CFR Compliance Notice</span>
        </div>

        {/* Action Error Notification */}
        {actionError && (
          <div className="bg-red-950/80 border-b border-red-800 text-red-200 text-xs px-5 py-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              {actionError}
            </span>
            <button onClick={() => setActionError(null)} className="text-zinc-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Content Body: Split Left (Alert List) & Right (Detail + Thread) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Left Panel: Alert List */}
          <div className="w-full md:w-80 border-r border-zinc-800 flex flex-col bg-zinc-950/60 shrink-0 overflow-y-auto">
            <div className="p-3 border-b border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase font-bold flex justify-between items-center bg-zinc-900/40">
              <span>ALERT LOGS ({alerts.length})</span>
              <span className="text-zinc-500">{company.name}</span>
            </div>

            {alerts.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs space-y-2 my-auto">
                <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/50" />
                <p className="font-semibold">No critical breakdown alerts recorded.</p>
                <p className="text-[11px] text-zinc-600">All drivers are operating smoothly.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-900">
                {alerts.map((alert) => {
                  const isSelected = alert.id === selectedAlertId;
                  const isOpenStatus = alert.status === 'open';
                  const isAckStatus = alert.status === 'acknowledged';

                  return (
                    <button
                      key={alert.id}
                      onClick={() => setSelectedAlertId(alert.id)}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-850 border-l-4 border-red-500'
                          : 'hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-200 truncate max-w-[170px]">
                          {alert.driverName}
                        </span>
                        <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                          isOpenStatus
                            ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                            : isAckStatus
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {alert.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-[11px] font-semibold text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span className="truncate">{alert.alertType}</span>
                      </div>

                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                        {alert.description || 'No description provided.'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                        <span>{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {alert.truckNumber && <span>TRK: {alert.truckNumber}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Selected Alert Details & Thread */}
          {selectedAlert ? (
            <div className="flex-1 flex flex-col min-h-0 bg-zinc-900/30 overflow-hidden">
              
              {/* Alert Status Banner & Header Info */}
              <div className="p-4 bg-zinc-900/80 border-b border-zinc-800 space-y-3 shrink-0">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-lg text-white">
                        {selectedAlert.alertType}
                      </h3>
                      <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border ${
                        selectedAlert.status === 'open'
                          ? 'bg-red-950 text-red-400 border-red-800'
                          : selectedAlert.status === 'acknowledged'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      }`}>
                        STATUS: {selectedAlert.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Reported by <span className="text-zinc-200 font-semibold">{selectedAlert.driverName}</span> at {new Date(selectedAlert.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Staff Action Buttons */}
                  {isStaff && (
                    <div className="flex items-center gap-2">
                      {selectedAlert.status === 'open' && (
                        <button
                          onClick={handleAcknowledge}
                          disabled={isActioning}
                          className="bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold py-1.5 px-3 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                          Acknowledge Alert
                        </button>
                      )}

                      {selectedAlert.status !== 'resolved' && (
                        <button
                          onClick={() => setShowResolveModal(true)}
                          disabled={isActioning}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve Breakdown
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Driver Contact & Load Info Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  
                  {/* Driver Contact Box */}
                  <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">DRIVER CONTACT</div>
                    <div className="font-bold text-zinc-200">{selectedAlert.driverName}</div>
                    {selectedAlert.driverPhone ? (
                      <a
                        href={`tel:${selectedAlert.driverPhone}`}
                        className="text-yellow-500 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <Phone className="h-3 w-3" /> {selectedAlert.driverPhone}
                      </a>
                    ) : (
                      <span className="text-zinc-500 text-[11px]">No phone listed</span>
                    )}
                  </div>

                  {/* Truck & Location Box */}
                  <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">TRUCK & LOCATION</div>
                    <div className="text-zinc-300">TRK: <span className="text-yellow-500 font-bold">{selectedAlert.truckNumber || 'N/A'}</span></div>
                    {selectedAlert.location?.lat ? (
                      <a
                        href={`https://maps.google.com/?q=${selectedAlert.location.lat},${selectedAlert.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <MapPin className="h-3 w-3" /> View Map ({selectedAlert.location.lat.toFixed(4)}, {selectedAlert.location.lng.toFixed(4)})
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <span className="text-zinc-500 text-[11px]">No GPS captured</span>
                    )}
                  </div>

                  {/* Linked Load Box */}
                  <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">LINKED LOAD</div>
                    {linkedLoad ? (
                      <div>
                        <div className="font-bold text-yellow-500">Load #{linkedLoad.loadNumber}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{linkedLoad.pickup.facilityName.split(',')[0]} ➔ {linkedLoad.delivery.facilityName.split(',')[0]}</div>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-[11px]">No load specified</span>
                    )}
                  </div>

                </div>

                {/* Alert Description Details */}
                {selectedAlert.description && (
                  <div className="bg-red-950/20 border border-red-900/40 p-3 rounded-xl text-xs text-red-200">
                    <span className="font-bold text-red-400 block mb-0.5">Driver Report:</span>
                    {selectedAlert.description}
                  </div>
                )}

                {/* Resolution Note display if resolved */}
                {selectedAlert.status === 'resolved' && selectedAlert.resolutionNote && (
                  <div className="bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-xl text-xs text-emerald-200">
                    <span className="font-bold text-emerald-400 block mb-0.5">
                      Resolved by {selectedAlert.resolvedByName || 'Dispatch'} on {new Date(selectedAlert.resolvedAt || '').toLocaleString()}:
                    </span>
                    {selectedAlert.resolutionNote}
                  </div>
                )}

              </div>

              {/* Chat / Dispatch Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0">
                <div className="text-[10px] font-mono text-center text-zinc-500 uppercase font-bold tracking-wider">
                  ── LIVE ALERT THREAD & DISPATCH LOGS ──
                </div>

                {messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;
                  const isSystem = msg.type === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center my-2">
                        <span className="bg-zinc-800 text-zinc-400 text-[10px] font-mono px-3 py-1 rounded-full border border-zinc-700">
                          ⚙️ {msg.message} ({new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      <div className="text-[10px] text-zinc-400 mb-0.5 px-1 font-semibold">
                        {msg.senderName} ({msg.senderRole.toUpperCase()})
                      </div>
                      <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                        isMe
                          ? 'bg-yellow-500 text-zinc-950 font-medium rounded-tr-none'
                          : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700'
                      }`}>
                        {msg.message}
                      </div>
                      <span className="text-[9px] text-zinc-500 mt-1 px-1 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 bg-zinc-900 border-t border-zinc-800 flex gap-2 shrink-0">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type updates or instructions for breakdown response..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500"
                />
                <button
                  type="submit"
                  disabled={isSendingMsg || !messageInput.trim()}
                  className="bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </form>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-xs">
              Select an alert from the list to view report details & live dispatch thread.
            </div>
          )}

        </div>

      </div>

      {/* Resolution Dialog Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-5 text-white space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Mark Breakdown Alert Resolved
            </h3>
            <p className="text-xs text-zinc-400">
              Please enter resolution notes describing how the breakdown/emergency was handled (e.g., roadside service dispatched, load reassigned, tire replaced).
            </p>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="e.g. Loves Roadside replaced left drive tire. Driver back on duty and resuming route."
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold py-2 px-3 rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={isActioning || !resolutionNote.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
