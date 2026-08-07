import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Bell, CheckCircle2, ShieldAlert, X, ChevronRight } from 'lucide-react';
import { SystemAnnouncement, UserRole } from '../types';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface MasterAnnouncementBannerProps {
  userRole: UserRole;
}

export default function MasterAnnouncementBanner({ userRole }: MasterAnnouncementBannerProps) {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [localDismissed, setLocalDismissed] = useState<string[]>([]);

  // Drivers must NEVER see announcement banner
  if (userRole === 'driver') {
    return null;
  }

  useEffect(() => {
    // Realtime Firestore listener for active system announcements
    const ancRef = collection(db, 'system_announcements');
    const q = query(ancRef, where('isActive', '==', true));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().toISOString();
      const list: SystemAnnouncement[] = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as SystemAnnouncement))
        .filter((item) => {
          if (item.expiresAt && item.expiresAt < now) return false;
          
          if (item.audience === 'admins_only' && userRole !== 'admin' && userRole !== 'super_admin') {
            return false;
          }
          if (
            item.audience === 'dispatchers_and_admins' &&
            userRole !== 'admin' &&
            userRole !== 'dispatcher' &&
            userRole !== 'super_admin'
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setAnnouncements(list);
    }, (err) => {
      console.warn('Announcement listener warning:', err);
    });

    return () => unsubscribe();
  }, [userRole]);

  const currentUserId = auth.currentUser?.uid || '';

  const handleDismiss = async (announcement: SystemAnnouncement) => {
    // Critical announcements cannot be dismissed by users
    if (announcement.severity === 'critical') return;

    setLocalDismissed((prev) => [...prev, announcement.id]);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`/api/system/announcements/${announcement.id}/dismiss`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error('Failed to dismiss announcement:', err);
    }
  };

  const visibleAnnouncements = announcements.filter((anc) => {
    if (localDismissed.includes(anc.id)) return false;
    if (anc.dismissedBy && currentUserId && anc.dismissedBy.includes(currentUserId) && anc.severity !== 'critical') {
      return false;
    }
    return true;
  });

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="w-full space-y-2 mb-4">
      {visibleAnnouncements.map((anc) => {
        let bgStyle = 'bg-slate-900 border-slate-700 text-slate-100';
        let icon = <Bell className="h-5 w-5 text-indigo-400 shrink-0" />;
        let badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

        if (anc.severity === 'critical') {
          bgStyle = 'bg-gradient-to-r from-red-950 via-red-900 to-rose-950 border-red-500/80 text-white shadow-xl shadow-red-950/40 animate-pulse';
          icon = <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 animate-bounce" />;
          badgeColor = 'bg-red-500 text-white font-extrabold uppercase tracking-wide border-red-400';
        } else if (anc.severity === 'warning') {
          bgStyle = 'bg-amber-950/90 border-amber-500/60 text-amber-100 shadow-md';
          icon = <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />;
          badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
        } else if (anc.severity === 'success') {
          bgStyle = 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100 shadow-md';
          icon = <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
          badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold';
        } else if (anc.severity === 'info') {
          bgStyle = 'bg-blue-950/90 border-blue-500/60 text-blue-100 shadow-md';
          icon = <Info className="h-5 w-5 text-blue-400 shrink-0" />;
          badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold';
        }

        return (
          <div
            key={anc.id}
            className={`relative rounded-xl border p-4 flex items-start justify-between gap-3 transition-all ${bgStyle}`}
          >
            <div className="flex items-start gap-3.5 flex-1 min-w-0">
              <div className="pt-0.5">{icon}</div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] rounded border ${badgeColor}`}>
                    {anc.severity.toUpperCase()}
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-wider opacity-75 text-slate-300">
                    TYPE: {anc.type.replace('_', ' ')}
                  </span>
                  <h4 className="font-bold text-sm tracking-tight">{anc.title}</h4>
                </div>
                <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">{anc.message}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono pt-1">
                  <span>Published by Platform Admin ({anc.createdByName || 'Super Admin'})</span>
                  <span>•</span>
                  <span>{new Date(anc.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Dismiss button only for non-critical announcements */}
            {anc.severity !== 'critical' ? (
              <button
                onClick={() => handleDismiss(anc)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 cursor-pointer"
                title="Dismiss Announcement"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <div className="shrink-0 px-2.5 py-1 rounded bg-red-800/80 border border-red-500/60 text-[10px] font-extrabold uppercase text-white shadow">
                MANDATORY NOTICE
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
