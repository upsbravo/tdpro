import React, { useState } from 'react';
import { X, Activity, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Shield, Server, Zap, Database, CreditCard, Cpu, Navigation, MessageSquare, Mail, Layers, Smartphone, LayoutDashboard } from 'lucide-react';
import { SystemStatus, HealthStatusValue, UserRole } from '../types';
import { auth } from '../firebase';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatus | null;
  userRole: UserRole;
  onStatusUpdated?: () => void;
}

const SERVICES_LIST = [
  { key: 'backendApi', label: 'Backend API Service', icon: Server },
  { key: 'firebaseAuth', label: 'Firebase Authentication', icon: Shield },
  { key: 'firestore', label: 'Firestore Database', icon: Database },
  { key: 'stripeBilling', label: 'Stripe Billing Engine', icon: CreditCard },
  { key: 'aiParser', label: 'AI Rate Con & Load Parser', icon: Cpu },
  { key: 'aiScraping', label: 'AI Scraping & Search Engine', icon: Zap },
  { key: 'gpsTracking', label: 'GPS Live Location Tracking', icon: Navigation },
  { key: 'smsNotifications', label: 'SMS Carrier Dispatcher Queue', icon: MessageSquare },
  { key: 'emailNotifications', label: 'Email Notification Service', icon: Mail },
  { key: 'dispatchModule', label: 'Load Dispatch Operations', icon: Layers },
  { key: 'driverPortal', label: 'Driver Mobile PWA Portal', icon: Smartphone },
  { key: 'adminPortal', label: 'Admin Workspace Control', icon: LayoutDashboard },
] as const;

export default function SystemHealthModal({
  isOpen,
  onClose,
  status,
  userRole,
  onStatusUpdated
}: SystemHealthModalProps) {
  if (!isOpen) return null;

  const isSuperAdmin = userRole === 'super_admin';

  // State for super admin editing
  const [editingStatus, setEditingStatus] = useState<SystemStatus>(() => {
    return status || {
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
    };
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getBadgeStyle = (val: HealthStatusValue) => {
    switch (val) {
      case 'operational':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'degraded':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'partial_outage':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'outage':
        return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse font-bold';
      case 'maintenance':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStatusIcon = (val: HealthStatusValue) => {
    switch (val) {
      case 'operational':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case 'partial_outage':
      case 'outage':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'maintenance':
        return <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />;
    }
  };

  const handleSaveStatus = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication token missing');

      const res = await fetch('/api/system/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editingStatus)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update system status');

      setSaveSuccess(true);
      if (onStatusUpdated) onStatusUpdated();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save status updates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                System Status & Health Center
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  REAL-TIME DIAGNOSTICS
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Platform-wide infrastructure operational status and telemetry summary.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> System health telemetry updated successfully!
            </div>
          )}

          {/* Overall Banner */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {getStatusIcon(editingStatus.overallStatus)}
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Overall System Health
                </span>
                <span className="text-base font-bold text-white capitalize">
                  {editingStatus.overallStatus.replace('_', ' ')}
                </span>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">Override Status:</span>
                <select
                  value={editingStatus.overallStatus}
                  onChange={(e) =>
                    setEditingStatus((prev) => ({ ...prev, overallStatus: e.target.value as HealthStatusValue }))
                  }
                  className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="operational">Operational</option>
                  <option value="degraded">Degraded</option>
                  <option value="partial_outage">Partial Outage</option>
                  <option value="outage">Full Outage</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            )}
          </div>

          {/* Status Message / Notice */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">System Status Notice / Advisory</label>
            {isSuperAdmin ? (
              <input
                type="text"
                value={editingStatus.statusMessage || ''}
                onChange={(e) => setEditingStatus((prev) => ({ ...prev, statusMessage: e.target.value }))}
                placeholder="e.g. AI parser temporarily running slower than normal. Manual dispatching operational."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
                {editingStatus.statusMessage || 'All systems operational.'}
              </div>
            )}
          </div>

          {/* Individual Sub-services Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Component Service Statuses ({SERVICES_LIST.length} Services Monitored)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SERVICES_LIST.map(({ key, label, icon: ServiceIcon }) => {
                const val = (editingStatus as any)[key] || 'operational';

                return (
                  <div
                    key={key}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ServiceIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-200 truncate">{label}</span>
                    </div>

                    {isSuperAdmin ? (
                      <select
                        value={val}
                        onChange={(e) =>
                          setEditingStatus((prev) => ({
                            ...prev,
                            [key]: e.target.value as HealthStatusValue
                          }))
                        }
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
                      >
                        <option value="operational">Operational</option>
                        <option value="degraded">Degraded</option>
                        <option value="partial_outage">Partial Outage</option>
                        <option value="outage">Outage</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 shrink-0 ${getBadgeStyle(
                          val
                        )}`}
                      >
                        {getStatusIcon(val)}
                        <span className="capitalize">{val.replace('_', ' ')}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Telemetry info */}
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Last checked: {editingStatus.lastCheckedAt ? new Date(editingStatus.lastCheckedAt).toLocaleString() : 'Just now'}</span>
            <span>Updated by: {editingStatus.updatedByName || 'Automated Monitor'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            Close Diagnostics
          </button>

          {isSuperAdmin && (
            <button
              onClick={handleSaveStatus}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50 border border-indigo-500/40 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving Changes...
                </>
              ) : (
                'Save Health Telemetry'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
