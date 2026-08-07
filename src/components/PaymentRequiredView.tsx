import React, { useState } from 'react';
import { Company, User } from '../types';
import { 
  CreditCard, 
  AlertTriangle, 
  FileText, 
  ExternalLink, 
  LogOut, 
  HelpCircle, 
  RefreshCw,
  CheckCircle2,
  Lock,
  Building2,
  ShieldAlert
} from 'lucide-react';

interface PaymentRequiredViewProps {
  company: Company | null;
  currentUser: User | null;
  onLogout: () => void;
  onOpenSupport?: () => void;
  onRefreshAccess?: () => void;
}

export const PaymentRequiredView: React.FC<PaymentRequiredViewProps> = ({
  company,
  currentUser,
  onLogout,
  onOpenSupport,
  onRefreshAccess
}) => {
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const companyName = company?.name || 'Carrier Tenant';
  const plan = company?.plan || 'Basic';
  const subscriptionStatus = company?.subscriptionStatus || 'past_due';
  const isTrialEnded = company?.trialEnd && new Date(company.trialEnd) < new Date() && subscriptionStatus !== 'active';

  const handleOpenStripePortal = async () => {
    if (!company?.id) return;
    setLoadingPortal(true);
    setErrorMsg(null);
    try {
      const authHeader = `Bearer ${await currentUser?.idToken || ''}`;
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          companyId: company.id,
          portalUrl: window.location.origin
        })
      });

      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.error || 'Could not launch Stripe Customer Portal.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error attempting to open Customer Portal.');
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleCheckAccess = async () => {
    setRefreshing(true);
    setErrorMsg(null);
    try {
      if (onRefreshAccess) {
        await onRefreshAccess();
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      setErrorMsg('Failed to refresh access status.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 md:p-8 font-sans">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
            TD
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">TruckDispatch Pro</h1>
            <p className="text-xs text-slate-500 font-mono">Tenant ID: {company?.id || 'System'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSupport && (
            <button
              onClick={onOpenSupport}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              Support
            </button>
          )}
          <button
            onClick={onLogout}
            className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto w-full my-auto py-8">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Banner */}
          <div className="bg-amber-50 border-b border-amber-200 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                  {isTrialEnded ? '30-Day Free Trial Ended' : 'Subscription Payment Required'}
                </span>
                <span className="text-xs text-amber-700 font-mono">Restricted Access</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {isTrialEnded ? 'Your 30-Day Free Trial Has Ended' : 'Account Subscription Requires Attention'}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {companyName}'s active SaaS tier ({plan} Plan) requires an updated payment method to unlock operational dispatch features.
              </p>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 md:p-8 space-y-6">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Tenant Details Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Carrier Entity:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {companyName}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Subscription Tier:</span>
                <span className="font-bold text-slate-900">
                  {plan} Tier ({plan === 'Premium' ? '$159.99/mo' : '$59.99/mo'})
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Billing Status:</span>
                <span className="font-bold text-amber-700 uppercase font-mono bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                  {subscriptionStatus.replace('_', ' ')}
                </span>
              </div>
            </div>

            {isAdmin ? (
              /* Admin Specific View */
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  As the <strong>Tenant Administrator</strong>, you can instantly restore full operational access by opening the secure Stripe Customer Portal to complete payment or add a credit card.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleOpenStripePortal}
                    disabled={loadingPortal}
                    className="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition"
                  >
                    {loadingPortal ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                    <span>Pay Invoice & Manage Payment Method</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>

                  <button
                    onClick={handleCheckAccess}
                    disabled={refreshing}
                    className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>Check Payment Status</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Dispatcher / Driver View */
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Notice for Staff & Operations</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your carrier company's TD Pro subscription is currently pending payment confirmation. Please contact your <strong>Tenant Administrator</strong> ({company?.contactEmail || 'Admin'}) to complete subscription renewal and unlock dispatch operations.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleCheckAccess}
                    disabled={refreshing}
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-xs flex items-center gap-2 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>Re-verify Access</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>TruckDispatch Pro • Revenue Guard v2.0</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Multi-tenant Isolated
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-slate-400 py-4 font-mono">
        &copy; {new Date().getFullYear()} Nexusweft LLC. All rights reserved. • Secure Stripe Billing Guard Protocol
      </footer>
    </div>
  );
};
