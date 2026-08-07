import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, AlertTriangle, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { SystemStatus, UserRole } from '../types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import SystemHealthModal from './SystemHealthModal';

interface SystemStatusBarProps {
  userRole: UserRole;
}

export default function SystemStatusBar({ userRole }: SystemStatusBarProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Visible to super_admin and tenant admin (admin). Not visible to drivers.
  if (userRole === 'driver') {
    return null;
  }

  useEffect(() => {
    // Realtime Firestore listener for /system_status/current
    const unsubscribe = onSnapshot(
      doc(db, 'system_status', 'current'),
      (snap) => {
        if (snap.exists()) {
          setStatus(snap.data() as SystemStatus);
        } else {
          // Default status if document does not exist yet
          setStatus({
            overallStatus: 'operational',
            backendApi: 'operational',
            firebaseAuth: 'operational',
            firestore: 'operational',
            stripeBilling: 'operational',
            aiParser: 'operational',
            aiScraping: 'operational',
            gpsTracking: 'operational',
            smsNotifications: 'operational',
            emailNotifications: 'operational',
            dispatchModule: 'operational',
            driverPortal: 'operational',
            adminPortal: 'operational',
            statusMessage: 'All systems operational'
          });
        }
      },
      (err) => {
        console.warn('System status snapshot listener warning:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  const overall = status?.overallStatus || 'operational';

  let statusBg = 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200 hover:border-emerald-500/60';
  let dotColor = 'bg-emerald-400 shadow-emerald-500/50';
  let labelText = 'All systems operational';
  let IconComponent = ShieldCheck;

  if (overall === 'degraded') {
    statusBg = 'bg-amber-950/40 border-amber-500/40 text-amber-200 hover:border-amber-500/70';
    dotColor = 'bg-amber-400 shadow-amber-500/50';
    labelText = 'Some services are degraded';
    IconComponent = AlertTriangle;
  } else if (overall === 'partial_outage') {
    statusBg = 'bg-orange-950/40 border-orange-500/40 text-orange-200 hover:border-orange-500/70';
    dotColor = 'bg-orange-400 shadow-orange-500/50';
    labelText = 'Partial system outage';
    IconComponent = AlertCircle;
  } else if (overall === 'outage') {
    statusBg = 'bg-red-950/60 border-red-500/60 text-red-100 hover:border-red-500/90 animate-pulse';
    dotColor = 'bg-red-500 shadow-red-500/80 animate-ping';
    labelText = 'System issue detected';
    IconComponent = AlertCircle;
  } else if (overall === 'maintenance') {
    statusBg = 'bg-blue-950/40 border-blue-500/40 text-blue-200 hover:border-blue-500/70';
    dotColor = 'bg-blue-400 shadow-blue-500/50';
    labelText = 'Scheduled maintenance in progress';
    IconComponent = RefreshCw;
  }

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={`w-full rounded-xl border px-3.5 py-2 mb-3 flex items-center justify-between gap-3 transition cursor-pointer shadow-sm ${statusBg}`}
        title="Click to view full System Health Diagnostics"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
          </span>

          <IconComponent className="h-4 w-4 shrink-0 opacity-90" />

          <span className="text-xs font-semibold tracking-tight shrink-0">{labelText}</span>

          {status?.statusMessage && (
            <span className="text-xs text-slate-400 truncate hidden md:inline border-l border-slate-700/60 pl-2.5">
              {status.statusMessage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono opacity-80 shrink-0">
          <span>System Health</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <SystemHealthModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        status={status}
        userRole={userRole}
      />
    </>
  );
}
