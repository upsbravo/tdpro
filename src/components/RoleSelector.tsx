import React from 'react';
import { ShieldAlert, Building2, Terminal, Truck, HelpCircle, Users, Activity, BellRing, Palette, Sun, Moon } from 'lucide-react';
import { UserRole, Company } from '../types';

interface RoleSelectorProps {
  activeRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  activeCompanyId: string;
  onChangeCompany: (companyId: string) => void;
  companies: Company[];
  pendingTenantsCount: number;
  urgentLoadsCount: number;
  assignedLoadsCount: number;
  firebaseUser?: any;
  onSignInWithGoogle?: () => void;
  onSignInAnonymously?: () => void;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
  onChangePageTheme: (theme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal') => void;
  cloudSyncWidget?: React.ReactNode;
}

export default function RoleSelector({
  activeRole,
  onChangeRole,
  activeCompanyId,
  onChangeCompany,
  companies,
  pendingTenantsCount,
  urgentLoadsCount,
  assignedLoadsCount,
  firebaseUser,
  onSignInWithGoogle,
  onSignInAnonymously,
  onSignOut,
  onOpenSettings,
  pageTheme,
  onChangePageTheme,
  cloudSyncWidget,
}: RoleSelectorProps) {
  
  const activeCompany = companies.find(c => c.id === activeCompanyId);

  return (
    <div className="bg-slate-950 border-b border-slate-800 text-white py-3 px-4 md:px-6 relative z-40 shadow-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" id="role-control-deck">
      {/* Platform Title */}
      <div className="flex items-center gap-2.5">
        {activeRole !== 'super_admin' && activeCompany?.logoUrl ? (
          <img 
            src={activeCompany.logoUrl} 
            alt="Company Logo" 
            className="h-9 w-9 object-contain rounded-lg border border-slate-800" 
            referrerPolicy="no-referrer" 
          />
        ) : (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-heading font-bold text-lg shadow-lg">
            {activeRole !== 'super_admin' && activeCompany ? activeCompany.name.charAt(0).toUpperCase() : 'T'}
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 font-mono text-[9px] font-bold text-slate-950 animate-pulse">
              ★
            </span>
          </div>
        )}
        <div>
          <h1 className="font-heading text-sm font-bold leading-none tracking-tight flex items-center gap-1.5">
            {activeRole !== 'super_admin' && activeCompany ? activeCompany.name : 'TruckDispatch Pro'}
          </h1>
          <p className="text-[10px] text-slate-400 mt-1">
            {activeRole !== 'super_admin' && activeCompany ? 'Carrier Partner Portal' : 'Multi-Tenant Cross-Role Platform'}
          </p>
        </div>
      </div>

      {/* Role Selection Tabs */}
      {firebaseUser && !firebaseUser.isSandbox ? (
        <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800/80 px-4 py-2 rounded-xl" id="authorized-personnel-badge">
          <div className="h-5 w-5 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-500/20">
            ✓
          </div>
          <div className="text-left">
            <span className="text-[9px] uppercase font-mono tracking-widest text-slate-500 block">AUTHENTICATED PERSONNEL SESSION</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-200">
                {activeRole === 'super_admin' && '🛡️ Super Admin Overlord'}
                {activeRole === 'admin' && '🏢 Company Administrator'}
                {activeRole === 'dispatcher' && '🎙️ Fleet Dispatcher'}
                {activeRole === 'driver' && '🚚 CDL Operator Portal'}
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-700 block"></span>
              <span className="text-[10px] font-mono text-slate-400 font-semibold">{firebaseUser.email}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-center">
          {[
            {
              id: 'super_admin' as UserRole,
              label: 'Super Admin',
              icon: ShieldAlert,
              badge: pendingTenantsCount > 0 ? pendingTenantsCount : null,
              badgeColor: 'bg-emerald-500 text-slate-950',
              desc: 'Global SaaS Control',
            },
            {
              id: 'admin' as UserRole,
              label: 'Company Admin',
              icon: Building2,
              badge: null,
              desc: 'Tenant Config & Billing',
            },
            {
              id: 'dispatcher' as UserRole,
              label: 'Dispatcher',
              icon: Activity,
              badge: urgentLoadsCount > 0 ? urgentLoadsCount : null,
              badgeColor: 'bg-red-500 text-white animate-pulse',
              desc: 'Load Board & Live Chat',
            },
            {
              id: 'driver' as UserRole,
              label: 'Driver Portal',
              icon: Truck,
              badge: assignedLoadsCount > 0 ? assignedLoadsCount : null,
              badgeColor: 'bg-amber-500 text-slate-950',
              desc: 'Tasks, GPS & Scan POD',
            },
          ].map((roleOpt) => {
            const Icon = roleOpt.icon;
            const isActive = activeRole === roleOpt.id;
            return (
              <button
                key={roleOpt.id}
                onClick={() => onChangeRole(roleOpt.id)}
                className={`relative px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-xs font-semibold ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={roleOpt.desc}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{roleOpt.label}</span>
                {roleOpt.badge !== null && (
                  <span className={`flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9px] font-bold ${roleOpt.badgeColor}`}>
                    {roleOpt.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-Tenant Switcher (only relevant for non-super_admin in sandbox/demo mode) */}
      {activeRole !== 'driver' && activeRole !== 'super_admin' && (!firebaseUser || firebaseUser.isSandbox) && (
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2 sm:border-0 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">Active Tenant:</span>
          <select
            value={activeCompanyId}
            onChange={(e) => onChangeCompany(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-purple-300 font-semibold text-xs py-1.5 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
          >
            {companies.filter(co => co.status !== 'suspended').map((co) => (
              <option key={co.id} value={co.id}>
                {co.name} ({co.plan} Plan)
              </option>
            ))}
          </select>
          
          <div className="hidden md:flex h-5 w-px bg-slate-800 mx-2"></div>
          
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
            <span>DOT: {activeCompany?.dotNumber}</span>
          </div>
        </div>
      )}

      {/* Authenticated Carrier Badge (locks authenticated admins, dispatchers, and drivers to their company) */}
      {activeRole !== 'driver' && activeRole !== 'super_admin' && firebaseUser && !firebaseUser.isSandbox && activeCompany && (
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2 sm:border-0 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">CARRIER ORGANIZATION:</span>
          <div className="bg-purple-950/60 border border-purple-800/60 text-purple-300 font-bold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span>{activeCompany.name}</span>
          </div>
          <div className="hidden md:flex h-5 w-px bg-slate-800 mx-2"></div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
            <span>DOT: {activeCompany.dotNumber}</span>
          </div>
        </div>
      )}





      {/* Theme Switcher: Daylight Mode vs Dark Mode */}
      {activeRole !== 'driver' && (
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2 sm:border-0 sm:pt-0" id="style-font-presets">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-[11px]">
            <button
              type="button"
              onClick={() => onChangePageTheme('enterprise_light')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                pageTheme === 'enterprise_light'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Switch to Daylight Mode (Light Theme)"
              id="theme-btn-daylight"
            >
              <Sun className="h-3.5 w-3.5 text-amber-700" />
              <span>Daylight Mode</span>
            </button>

            <button
              type="button"
              onClick={() => onChangePageTheme('cosmic_dark')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                pageTheme === 'cosmic_dark'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Switch to Dark Mode (Cosmic Dark)"
              id="theme-btn-dark"
            >
              <Moon className="h-3.5 w-3.5 text-indigo-300" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Firebase Live Cloud Sync status indicator */}
      <div className="flex items-center gap-3 border-t border-slate-800 pt-2 sm:border-0 sm:pt-0">
        {cloudSyncWidget}
        {firebaseUser ? (
          <>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px]" id="firebase-sync-active">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              <span className="text-slate-300 font-semibold max-w-[140px] truncate">
                {firebaseUser.isAnonymous ? 'Guest Cloud Sync Active' : (firebaseUser.displayName || firebaseUser.email)}
              </span>
              <button
                onClick={onSignOut}
                className="text-slate-500 hover:text-red-400 font-bold transition text-[9px] uppercase ml-1 cursor-pointer"
                title="Disconnect live Cloud Sync"
              >
                Disconnect
              </button>
            </div>
            
            {/* Avatar Profile Trigger */}
            <button
              onClick={onOpenSettings}
              className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-500/30 flex items-center justify-center font-bold text-white text-xs shadow-md transition-all active:scale-95 hover:scale-105 cursor-pointer relative"
              title="Open Profile Settings"
              id="profile-avatar-trigger"
            >
              {(firebaseUser.displayName || firebaseUser.email || 'U').charAt(0).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-950"></span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onSignInWithGoogle}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-[11px] py-1.5 px-3 rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
              id="firebase-sync-inactive"
              title="Authenticate with Google to activate real-time multi-tenant cloud database rules"
            >
              <span className="flex h-1.5 w-1.5 rounded-full bg-yellow-400 animate-ping shrink-0"></span>
              <span>Cloud Sync (Google Auth)</span>
            </button>
            <button
              onClick={onSignInAnonymously}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-[11px] py-1.5 px-3 rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
              id="firebase-sync-guest"
              title="Activate real-time sync with database rules without opening popups"
            >
              <span>Guest Cloud Sync</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
