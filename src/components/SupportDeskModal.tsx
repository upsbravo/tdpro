import React, { useState, useEffect, useRef } from 'react';
import { 
  HelpCircle, MessageSquare, Plus, CheckCircle2, Clock, AlertTriangle, 
  X, Send, RefreshCw, User, ShieldAlert, Sparkles, Filter, Search, ArrowLeft,
  Lock, Check, Tag, Building2, ExternalLink
} from 'lucide-react';
import { 
  SupportTicket, SupportMessage, SupportTicketCategory, 
  SupportTicketPriority, SupportTicketStatus, UserRole 
} from '../types';
import { auth } from '../firebase';

interface SupportDeskModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: UserRole;
  currentCompanyId?: string;
  currentCompanyName?: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserEmail?: string;
}

const CATEGORIES: SupportTicketCategory[] = [
  'Login / Access',
  'Billing / Subscription',
  'Driver Issue',
  'Dispatcher Issue',
  'Load Issue',
  'GPS / Tracking',
  'AI Parser / Rate Confirmation',
  'SMS / Email Notifications',
  'Bug / Error',
  'Other'
];

const PRIORITIES: SupportTicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export const SupportDeskModal: React.FC<SupportDeskModalProps> = ({
  isOpen,
  onClose,
  currentUserRole,
  currentCompanyId = '',
  currentCompanyName = '',
  currentUserId = '',
  currentUserName = '',
  currentUserEmail = ''
}) => {
  const isSuperAdmin = currentUserRole === 'super_admin';

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [sendingMsg, setSendingMsg] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create Ticket State
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [submittingTicket, setSubmittingTicket] = useState<boolean>(false);
  const [newSubject, setNewSubject] = useState<string>('');
  const [newCategory, setNewCategory] = useState<SupportTicketCategory>('Billing / Subscription');
  const [newPriority, setNewPriority] = useState<SupportTicketPriority>('normal');
  const [newDescription, setNewDescription] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const url = isSuperAdmin 
        ? '/api/support/tickets' 
        : `/api/support/tickets?companyId=${encodeURIComponent(currentCompanyId)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load support tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    setMessagesLoading(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
    }
  }, [isOpen, currentCompanyId, currentUserRole]);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
      // Interval poll for messages when viewing chat
      const interval = setInterval(() => {
        fetchMessages(selectedTicket.id);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedTicket?.id]);

  if (!isOpen) return null;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) {
      setCreateError('Please complete all required fields.');
      return;
    }

    setSubmittingTicket(true);
    setCreateError(null);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId: currentCompanyId,
          companyName: currentCompanyName,
          createdByUid: currentUserId,
          createdByName: currentUserName,
          createdByEmail: currentUserEmail,
          subject: newSubject,
          category: newCategory,
          priority: newPriority,
          description: newDescription
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsCreating(false);
        setNewSubject('');
        setNewDescription('');
        await fetchTickets();
        if (data.ticket) {
          setSelectedTicket(data.ticket);
        }
      } else {
        setCreateError(data.error || 'Failed to submit ticket');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error creating support ticket');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setSendingMsg(true);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          message: replyText,
          senderId: currentUserId || 'user',
          senderName: currentUserName || (isSuperAdmin ? 'Nexusweft Support Admin' : 'Tenant Admin'),
          senderRole: isSuperAdmin ? 'super_admin' : 'admin',
          companyId: currentCompanyId
        })
      });

      if (res.ok) {
        setReplyText('');
        await fetchMessages(selectedTicket.id);
        await fetchTickets();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket || !isSuperAdmin) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ closedBy: currentUserName || 'Super Admin' })
      });
      if (res.ok) {
        await fetchTickets();
        const updated = { ...selectedTicket, status: 'closed' as SupportTicketStatus };
        setSelectedTicket(updated);
        await fetchMessages(selectedTicket.id);
      }
    } catch (err) {
      console.error('Failed to close ticket:', err);
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket || !isSuperAdmin) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        }
      });
      if (res.ok) {
        await fetchTickets();
        const updated = { ...selectedTicket, status: 'open' as SupportTicketStatus };
        setSelectedTicket(updated);
        await fetchMessages(selectedTicket.id);
      }
    } catch (err) {
      console.error('Failed to reopen ticket:', err);
    }
  };

  const handleUpdateStatus = async (status: SupportTicketStatus) => {
    if (!selectedTicket || !isSuperAdmin) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchTickets();
        setSelectedTicket({ ...selectedTicket, status });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = t.subject?.toLowerCase().includes(q);
      const matchCompany = t.companyName?.toLowerCase().includes(q);
      const matchCategory = t.category?.toLowerCase().includes(q);
      if (!matchSubject && !matchCompany && !matchCategory) return false;
    }
    return true;
  });

  const getPriorityBadge = (p: SupportTicketPriority) => {
    switch (p) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs">URGENT</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">HIGH</span>;
      case 'normal':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs">NORMAL</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">LOW</span>;
    }
  };

  const getStatusBadge = (s: SupportTicketStatus) => {
    switch (s) {
      case 'open':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-950 border border-blue-300 shadow-2xs">OPEN</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100 text-indigo-950 border border-indigo-300 shadow-2xs">IN PROGRESS</span>;
      case 'awaiting_customer':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs">AWAITING YOU</span>;
      case 'resolved':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">RESOLVED</span>;
      case 'closed':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs">CLOSED</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 border border-indigo-400/30 rounded-xl">
              <HelpCircle className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight font-heading flex items-center gap-2">
                {isSuperAdmin ? 'Platform Support Desk' : 'Tenant Support Center'}
                {isSuperAdmin && (
                  <span className="text-[10px] bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded font-mono border border-purple-700/50 uppercase">
                    Super Admin View
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {isSuperAdmin 
                  ? 'Manage and resolve carrier support tickets across all platform tenants.' 
                  : 'Contact Nexusweft support team for assistance with your carrier workspace.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex overflow-hidden bg-slate-50">
          
          {/* Left Column: Ticket List */}
          <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0 ${selectedTicket ? 'hidden md:flex' : 'flex'}`}>
            
            {/* Action & Filter Header */}
            <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
              {!isSuperAdmin && (
                <button
                  onClick={() => { setIsCreating(true); setSelectedTicket(null); }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Create Support Ticket
                </button>
              )}

              {/* Search Bar */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl text-xs pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Filter Row */}
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold py-1.5 px-2 text-slate-700 focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="awaiting_customer">Awaiting Customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-28 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold py-1.5 px-2 text-slate-700 focus:outline-none"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>

                <button
                  onClick={fetchTickets}
                  className="p-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:text-indigo-600 transition"
                  title="Refresh tickets"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading && tickets.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading support tickets...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <HelpCircle className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500">No support tickets found</p>
                  <p className="text-[11px] text-slate-400">
                    {!isSuperAdmin ? 'Click above to create your first support ticket.' : 'No open support tickets matching current filters.'}
                  </p>
                </div>
              ) : (
                filteredTickets.map(ticket => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  return (
                    <div
                      key={ticket.id}
                      onClick={() => { setSelectedTicket(ticket); setIsCreating(false); }}
                      className={`p-4 cursor-pointer transition border-l-4 ${
                        isSelected 
                          ? 'bg-indigo-50/70 border-l-indigo-600' 
                          : 'hover:bg-slate-50 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{ticket.id.slice(-6)}</span>
                        <div className="flex items-center gap-1.5">
                          {getPriorityBadge(ticket.priority)}
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-slate-800 truncate mb-1">{ticket.subject}</h4>

                      {isSuperAdmin && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 mb-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{ticket.companyName}</span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">{ticket.lastMessagePreview || 'No messages yet.'}</p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="truncate">{ticket.category}</span>
                        <span>{new Date(ticket.lastMessageAt || ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Ticket Content / Create Form / Placeholder */}
          <div className={`flex-1 flex flex-col bg-white overflow-hidden ${!selectedTicket && !isCreating ? 'hidden md:flex' : 'flex'}`}>
            
            {isCreating ? (
              /* Create Ticket Form */
              <div className="p-6 overflow-y-auto max-w-2xl mx-auto w-full space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 font-heading">Submit Support Ticket</h3>
                    <p className="text-xs text-slate-500">Describe your issue in detail. Our support team will review and respond promptly.</p>
                  </div>
                  <button
                    onClick={() => setIsCreating(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                </div>

                {createError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateTicket} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Carrier / Company</label>
                    <input
                      type="text"
                      disabled
                      value={currentCompanyName || 'Current Carrier Workspace'}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl text-xs py-2.5 px-3.5 text-slate-600 font-medium cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Subject / Issue Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Unable to sync rate confirmation PDF with load dispatcher"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl text-xs py-2.5 px-3.5 text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Category *</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as SupportTicketCategory)}
                        className="w-full bg-white border border-slate-300 rounded-xl text-xs py-2.5 px-3 text-slate-900 focus:outline-none focus:border-indigo-600"
                      >
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Priority Level *</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as SupportTicketPriority)}
                        className="w-full bg-white border border-slate-300 rounded-xl text-xs py-2.5 px-3 text-slate-900 focus:outline-none focus:border-indigo-600"
                      >
                        <option value="low">Low - General Question</option>
                        <option value="normal">Normal - Standard Operational Inquiry</option>
                        <option value="high">High - Feature Impairment</option>
                        <option value="urgent">Urgent - Critical Blocker / Outage</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Description *</label>
                    <textarea
                      required
                      rows={6}
                      placeholder="Please include exact load IDs, error codes, driver names, or steps to reproduce..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl text-xs p-3.5 text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl border border-slate-200 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingTicket}
                      className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {submittingTicket ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit Ticket
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedTicket ? (
              /* Selected Ticket Workspace */
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                
                {/* Chat Top Bar */}
                <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="md:hidden p-1.5 text-slate-500 hover:bg-slate-200 rounded-lg"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono font-bold text-slate-400">Ticket #{selectedTicket.id.slice(-6)}</span>
                        {getPriorityBadge(selectedTicket.priority)}
                        {getStatusBadge(selectedTicket.status)}
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 font-heading">{selectedTicket.subject}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-semibold text-slate-700">{selectedTicket.companyName}</span>
                        <span>•</span>
                        <span>Created by {selectedTicket.createdByName} ({selectedTicket.createdByEmail})</span>
                      </div>
                    </div>
                  </div>

                  {/* Super Admin Controls */}
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateStatus(e.target.value as SupportTicketStatus)}
                        className="bg-white border border-slate-300 rounded-xl text-xs font-bold py-1.5 px-3 text-slate-800 focus:outline-none"
                      >
                        <option value="open">Set: Open</option>
                        <option value="in_progress">Set: In Progress</option>
                        <option value="awaiting_customer">Set: Awaiting Customer</option>
                        <option value="resolved">Set: Resolved</option>
                        <option value="closed">Set: Closed</option>
                      </select>

                      {selectedTicket.status === 'closed' ? (
                        <button
                          onClick={handleReopenTicket}
                          className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Reopen
                        </button>
                      ) : (
                        <button
                          onClick={handleCloseTicket}
                          className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Lock className="h-3.5 w-3.5" /> Close Ticket
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Message Thread */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-100/50">
                  {messagesLoading && messages.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">Loading conversation thread...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">No messages found in this ticket.</div>
                  ) : (
                    messages.map((msg) => {
                      if (msg.type === 'system') {
                        return (
                          <div key={msg.id} className="flex justify-center my-3">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-slate-200/80 px-3 py-1 rounded-full border border-slate-300/60">
                              {msg.message}
                            </span>
                          </div>
                        );
                      }

                      if (msg.type === 'ai_auto_reply') {
                        return (
                          <div key={msg.id} className="max-w-2xl mx-auto my-3 p-4 bg-emerald-50/90 border border-emerald-200/80 rounded-2xl shadow-sm space-y-2">
                            <div className="flex items-center gap-2 text-emerald-800">
                              <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="text-xs font-extrabold uppercase tracking-wider font-mono">Nexusweft AI Support Assistant</span>
                              <span className="text-[10px] text-emerald-600 font-mono ml-auto">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed font-medium">{msg.message}</p>
                          </div>
                        );
                      }

                      const isSuperMsg = msg.type === 'super_admin' || msg.senderRole === 'super_admin';
                      const isCurrentUser = msg.senderId === currentUserId;

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isSuperMsg ? 'items-start' : (isCurrentUser ? 'items-end' : 'items-start')}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[10px] font-bold text-slate-700">{msg.senderName}</span>
                            {isSuperMsg && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-950 border border-purple-300">
                                SUPPORT ADMIN
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div
                            className={`p-3.5 rounded-2xl max-w-xl text-xs leading-relaxed shadow-sm ${
                              isSuperMsg
                                ? 'bg-slate-900 text-white rounded-tl-none border border-slate-800'
                                : (isCurrentUser 
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-white text-slate-900 rounded-tl-none border border-slate-300')
                            }`}
                          >
                            <p className={`whitespace-pre-wrap break-words font-medium ${isSuperMsg || isCurrentUser ? 'text-white' : 'text-slate-900'}`}>{msg.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Input Box */}
                <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                  {selectedTicket.status === 'closed' ? (
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <span>This support ticket has been closed by Super Admin and is read-only.</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type your response or additional details..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl text-xs px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                      />
                      <button
                        type="submit"
                        disabled={sendingMsg || !replyText.trim()}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {sendingMsg ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send
                      </button>
                    </form>
                  )}
                </div>

              </div>
            ) : (
              /* Empty Selection Placeholder */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
                <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 mb-3">
                  <MessageSquare className="h-8 w-8 text-indigo-500" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 font-heading">Select a Ticket to View Discussion</h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Choose a support ticket from the list on the left to view messages, auto-replies, and platform admin updates.
                </p>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
