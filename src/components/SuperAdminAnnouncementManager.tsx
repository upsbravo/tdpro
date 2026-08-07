import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, ShieldAlert, CheckCircle2, AlertTriangle, Info, Bell, Power, Trash2, Clock, Users, RefreshCw } from 'lucide-react';
import { SystemAnnouncement, AnnouncementType, AnnouncementSeverity, AnnouncementAudience } from '../types';
import { auth, db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function SuperAdminAnnouncementManager() {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AnnouncementType>('general');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('info');
  const [audience, setAudience] = useState<AnnouncementAudience>('all_except_drivers');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'system_announcements'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemAnnouncement));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setAnnouncements(list);
    }, (err) => {
      console.warn('Super Admin announcements listener warning:', err);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setErrorMsg('Title and Message are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Auth token missing');

      const res = await fetch('/api/system/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          severity,
          audience,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          isActive
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create announcement');

      // Reset form
      setTitle('');
      setMessage('');
      setType('general');
      setSeverity('info');
      setAudience('all_except_drivers');
      setExpiresAt('');
      setIsActive(true);
      setShowCreateModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error publishing announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (anc: SystemAnnouncement) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      await fetch(`/api/system/announcements/${anc.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          isActive: !anc.isActive
        })
      });
    } catch (err) {
      console.error('Failed to toggle announcement status:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-heading font-bold text-base text-indigo-400 flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Master Announcement Banner Center
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Broadcast platform-wide operational notices, maintenance advisories, and critical alerts to Tenant Admins and Dispatchers.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50 border border-indigo-500/40 transition flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" /> Publish New Announcement
        </button>
      </div>

      {/* Announcements List */}
      <div className="grid grid-cols-1 gap-4">
        {announcements.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <Megaphone className="h-8 w-8 mx-auto mb-2 text-slate-600" />
            <p className="text-sm font-semibold">No platform announcements published yet.</p>
            <p className="text-xs text-slate-500 mt-1">Click "Publish New Announcement" above to broadcast to all non-driver users.</p>
          </div>
        ) : (
          announcements.map((anc) => {
            let severityBadge = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            if (anc.severity === 'critical') severityBadge = 'bg-red-500/20 text-red-400 border-red-500/40 font-bold animate-pulse';
            if (anc.severity === 'warning') severityBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
            if (anc.severity === 'success') severityBadge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

            return (
              <div
                key={anc.id}
                className={`bg-slate-900 border rounded-2xl p-5 text-white shadow-md transition ${
                  anc.isActive ? 'border-slate-800' : 'border-slate-800/40 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-mono rounded border ${severityBadge}`}>
                        {anc.severity}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] uppercase font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {anc.type.replace('_', ' ')}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] uppercase font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">
                        <Users className="h-3 w-3" /> {anc.audience.replace(/_/g, ' ')}
                      </span>
                      {anc.isActive ? (
                        <span className="px-2 py-0.5 text-[10px] uppercase font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                          ● ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] uppercase font-mono rounded bg-slate-800 text-slate-500 border border-slate-700">
                          ○ INACTIVE
                        </span>
                      )}
                    </div>

                    <h4 className="text-base font-bold text-slate-100">{anc.title}</h4>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{anc.message}</p>

                    <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono pt-2">
                      <span>By: {anc.createdByName || 'Super Admin'}</span>
                      <span>Created: {new Date(anc.createdAt).toLocaleString()}</span>
                      {anc.expiresAt && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Clock className="h-3 w-3" /> Expires: {new Date(anc.expiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleActive(anc)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      anc.isActive
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    <Power className="h-4 w-4" />
                    {anc.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal to Create Announcement */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-indigo-400" /> Publish Platform Announcement
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Announcement Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled AI Parser Maintenance"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Message Body *</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Detailed announcement description..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Severity Level</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="info">Info (Blue)</option>
                    <option value="warning">Warning (Yellow)</option>
                    <option value="critical">Critical (Red Pulsing - Non-dismissible)</option>
                    <option value="success">Success (Green)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notice Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AnnouncementType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="general">General Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="system_issue">System Issue</option>
                    <option value="feature_update">Feature Release</option>
                    <option value="billing_notice">Billing Notice</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Target Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all_except_drivers">All Except Drivers (Admins + Dispatchers)</option>
                    <option value="admins_only">Tenant Admins Only</option>
                    <option value="dispatchers_and_admins">Dispatchers & Admins</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expiration Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ancIsActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="ancIsActive" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Activate Announcement Immediately on Publishing
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
