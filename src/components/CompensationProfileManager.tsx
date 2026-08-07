import React, { useState, useEffect } from 'react';
import { DollarSign, Shield, Percent, Calendar, CheckCircle2, History, AlertTriangle, Save, Loader2, RefreshCw } from 'lucide-react';
import { CompensationProfile, WorkerType, PayMethod, SettlementFrequency, User, hasDispatcherPermission } from '../types';
import { auth } from '../firebase';

interface CompensationProfileManagerProps {
  companyId: string;
  driver: User;
  currentUser?: User;
  currentUserRole?: string;
  isSuperAdmin?: boolean;
  onProfileUpdated?: (profile: CompensationProfile) => void;
}

export const CompensationProfileManager: React.FC<CompensationProfileManagerProps> = ({
  companyId,
  driver,
  currentUser,
  currentUserRole,
  isSuperAdmin,
  onProfileUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [activeProfile, setActiveProfile] = useState<CompensationProfile | null>(null);
  const [profilesHistory, setProfilesHistory] = useState<CompensationProfile[]>([]);

  // Form State
  const [workerType, setWorkerType] = useState<WorkerType>('company_driver');
  const [payMethod, setPayMethod] = useState<PayMethod>('per_mile');
  const [settlementFrequency, setSettlementFrequency] = useState<SettlementFrequency>('weekly');

  const [loadedMileRateDollars, setLoadedMileRateDollars] = useState('0.60');
  const [emptyMileRateDollars, setEmptyMileRateDollars] = useState('0.40');
  const [flatPerLoadDollars, setFlatPerLoadDollars] = useState('500.00');
  const [hourlyRateDollars, setHourlyRateDollars] = useState('25.00');
  const [salaryAmountDollars, setSalaryAmountDollars] = useState('1200.00');
  const [ownerOperatorPercentage, setOwnerOperatorPercentage] = useState('88.00');
  const [dispatchFeePercentage, setDispatchFeePercentage] = useState('5.00');

  const [stopPayDollars, setStopPayDollars] = useState('50.00');
  const [detentionHourlyRateDollars, setDetentionHourlyRateDollars] = useState('25.00');
  const [layoverDailyRateDollars, setLayoverDailyRateDollars] = useState('150.00');

  const [insuranceDeductionDollars, setInsuranceDeductionDollars] = useState('125.00');
  const [trailerRentDollars, setTrailerRentDollars] = useState('150.00');
  const [escrowDeductionDollars, setEscrowDeductionDollars] = useState('100.00');
  const [maintenanceDeductionDollars, setMaintenanceDeductionDollars] = useState('75.00');

  const [deductActualFuel, setDeductActualFuel] = useState(true);
  const [deductAdvances, setDeductAdvances] = useState(true);
  const [deductTolls, setDeductTolls] = useState(true);
  const [deductChargebacks, setDeductChargebacks] = useState(true);

  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);

  const effectiveRole = currentUserRole || currentUser?.role;
  const isDispatcher = effectiveRole === 'dispatcher';
  const isAdmin = isSuperAdmin || effectiveRole === 'admin' || effectiveRole === 'super_admin';
  const dispatcherHasPermission = isDispatcher ? hasDispatcherPermission(currentUser, 'accounting', 'manageCompensationProfiles') : false;

  const canEdit = isAdmin || (isDispatcher && dispatcherHasPermission);

  useEffect(() => {
    fetchProfile();
  }, [companyId, driver.id]);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/accounting/compensation-profile/${companyId}/${driver.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.activeProfile) {
          populateForm(data.activeProfile);
          setActiveProfile(data.activeProfile);
        }
        if (Array.isArray(data.profiles)) {
          setProfilesHistory(data.profiles);
        }
      } else {
        setError(data.error || 'Failed to load compensation profile');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to accounting server');
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (p: CompensationProfile) => {
    setWorkerType(p.workerType || 'company_driver');
    setPayMethod(p.payMethod || 'per_mile');
    setSettlementFrequency(p.settlementFrequency || 'weekly');

    setLoadedMileRateDollars(p.loadedMileRateCents ? (p.loadedMileRateCents / 100).toFixed(2) : '0.60');
    setEmptyMileRateDollars(p.emptyMileRateCents ? (p.emptyMileRateCents / 100).toFixed(2) : '0.40');
    setFlatPerLoadDollars(p.flatPerLoadCents ? (p.flatPerLoadCents / 100).toFixed(2) : '500.00');
    setHourlyRateDollars(p.hourlyRateCents ? (p.hourlyRateCents / 100).toFixed(2) : '25.00');
    setSalaryAmountDollars(p.salaryAmountCents ? (p.salaryAmountCents / 100).toFixed(2) : '1200.00');

    setOwnerOperatorPercentage(p.ownerOperatorPercentageBasisPoints ? (p.ownerOperatorPercentageBasisPoints / 100).toFixed(2) : '88.00');
    setDispatchFeePercentage(p.dispatchFeeBasisPoints ? (p.dispatchFeeBasisPoints / 100).toFixed(2) : '5.00');

    setStopPayDollars(p.stopPayCents ? (p.stopPayCents / 100).toFixed(2) : '50.00');
    setDetentionHourlyRateDollars(p.detentionHourlyRateCents ? (p.detentionHourlyRateCents / 100).toFixed(2) : '25.00');
    setLayoverDailyRateDollars(p.layoverDailyRateCents ? (p.layoverDailyRateCents / 100).toFixed(2) : '150.00');

    setInsuranceDeductionDollars(p.defaultInsuranceDeductionCents ? (p.defaultInsuranceDeductionCents / 100).toFixed(2) : '125.00');
    setTrailerRentDollars(p.defaultTrailerRentCents ? (p.defaultTrailerRentCents / 100).toFixed(2) : '150.00');
    setEscrowDeductionDollars(p.defaultEscrowDeductionCents ? (p.defaultEscrowDeductionCents / 100).toFixed(2) : '100.00');
    setMaintenanceDeductionDollars(p.defaultMaintenanceDeductionCents ? (p.defaultMaintenanceDeductionCents / 100).toFixed(2) : '75.00');

    setDeductActualFuel(p.deductActualFuel !== undefined ? p.deductActualFuel : true);
    setDeductAdvances(p.deductAdvances !== undefined ? p.deductAdvances : true);
    setDeductTolls(p.deductTolls !== undefined ? p.deductTolls : true);
    setDeductChargebacks(p.deductChargebacks !== undefined ? p.deductChargebacks : true);

    if (p.effectiveFrom) {
      setEffectiveFrom(p.effectiveFrom.split('T')[0]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload = {
      companyId,
      driverId: driver.id,
      workerType,
      payMethod,
      settlementFrequency,

      loadedMileRateCents: Math.round(parseFloat(loadedMileRateDollars || '0') * 100),
      emptyMileRateCents: Math.round(parseFloat(emptyMileRateDollars || '0') * 100),
      flatPerLoadCents: Math.round(parseFloat(flatPerLoadDollars || '0') * 100),
      hourlyRateCents: Math.round(parseFloat(hourlyRateDollars || '0') * 100),
      salaryAmountCents: Math.round(parseFloat(salaryAmountDollars || '0') * 100),

      ownerOperatorPercentageBasisPoints: Math.round(parseFloat(ownerOperatorPercentage || '0') * 100),
      dispatchFeeBasisPoints: Math.round(parseFloat(dispatchFeePercentage || '0') * 100),

      stopPayCents: Math.round(parseFloat(stopPayDollars || '0') * 100),
      detentionHourlyRateCents: Math.round(parseFloat(detentionHourlyRateDollars || '0') * 100),
      layoverDailyRateCents: Math.round(parseFloat(layoverDailyRateDollars || '0') * 100),

      defaultInsuranceDeductionCents: Math.round(parseFloat(insuranceDeductionDollars || '0') * 100),
      defaultTrailerRentCents: Math.round(parseFloat(trailerRentDollars || '0') * 100),
      defaultEscrowDeductionCents: Math.round(parseFloat(escrowDeductionDollars || '0') * 100),
      defaultMaintenanceDeductionCents: Math.round(parseFloat(maintenanceDeductionDollars || '0') * 100),

      deductActualFuel,
      deductAdvances,
      deductTolls,
      deductChargebacks,

      effectiveFrom: new Date(effectiveFrom).toISOString()
    };

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/accounting/compensation-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMsg(`Compensation Profile saved successfully (Version ${data.profile.version})`);
        setActiveProfile(data.profile);
        if (onProfileUpdated) onProfileUpdated(data.profile);
        fetchProfile();
      } else {
        setError(data.error || 'Failed to save compensation profile');
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading Compensation Profile...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Compensation & Settlement Profile
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure worker type, pay rates, basis points, and automatic recurring deductions for {driver.name || driver.email}.
          </p>
        </div>
        {activeProfile && (
          <div className="text-right">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Version {activeProfile.version} Active
            </span>
            <p className="text-[10px] text-slate-500 mt-1">
              Effective: {new Date(activeProfile.effectiveFrom).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {isDispatcher && !dispatcherHasPermission && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Read-Only Mode:</strong> Your Administrator has not granted "Compensation Profiles" editing permission for your dispatcher account. Contact your Tenant Admin to update your access permissions.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Classification & Method */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Worker Type</label>
            <select
              value={workerType}
              onChange={(e) => setWorkerType(e.target.value as WorkerType)}
              disabled={!canEdit}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            >
              <option value="company_driver">Company Driver (W-2)</option>
              <option value="owner_operator">Owner Operator (1099)</option>
              <option value="contractor">Contractor / Fleet Driver</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Pay Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PayMethod)}
              disabled={!canEdit}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            >
              <option value="per_mile">Per Mile Rate</option>
              <option value="percentage_of_gross">Percentage of Gross Revenue</option>
              <option value="percentage_of_linehaul">Percentage of Linehaul Only</option>
              <option value="per_load">Flat Rate Per Load</option>
              <option value="hourly">Hourly Rate</option>
              <option value="salary">Fixed Salary</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Settlement Frequency</label>
            <select
              value={settlementFrequency}
              onChange={(e) => setSettlementFrequency(e.target.value as SettlementFrequency)}
              disabled={!canEdit}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            >
              <option value="per_load">Per Load</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Section 2: Pay Rates & Basis Points */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Percent className="w-4 h-4 text-emerald-400" /> Pay Rates & Revenue Split
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workerType === 'owner_operator' || payMethod === 'percentage_of_gross' || payMethod === 'percentage_of_linehaul' ? (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Revenue Split Share (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={ownerOperatorPercentage}
                    onChange={(e) => setOwnerOperatorPercentage(e.target.value)}
                    disabled={!canEdit}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-xs font-semibold">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Stored as {Math.round(parseFloat(ownerOperatorPercentage || '0') * 100)} basis points (BP).
                </p>
              </div>
            ) : null}

            {payMethod === 'per_mile' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Loaded Mile Rate ($/mi)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={loadedMileRateDollars}
                      onChange={(e) => setLoadedMileRateDollars(e.target.value)}
                      disabled={!canEdit}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Empty Mile Rate ($/mi)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={emptyMileRateDollars}
                      onChange={(e) => setEmptyMileRateDollars(e.target.value)}
                      disabled={!canEdit}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {payMethod === 'per_load' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Flat Rate Per Load ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={flatPerLoadDollars}
                    onChange={(e) => setFlatPerLoadDollars(e.target.value)}
                    disabled={!canEdit}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {payMethod === 'hourly' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Hourly Rate ($/hr)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={hourlyRateDollars}
                    onChange={(e) => setHourlyRateDollars(e.target.value)}
                    disabled={!canEdit}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {payMethod === 'salary' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Salary Amount ($/period)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={salaryAmountDollars}
                    onChange={(e) => setSalaryAmountDollars(e.target.value)}
                    disabled={!canEdit}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Dispatch Fee Deduction (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={dispatchFeePercentage}
                  onChange={(e) => setDispatchFeePercentage(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-slate-500 text-xs font-semibold">%</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Stored as {Math.round(parseFloat(dispatchFeePercentage || '0') * 100)} basis points (BP).
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Accessorials & Add-ons */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Accessorial Rates
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Stop Pay ($/stop)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={stopPayDollars}
                  onChange={(e) => setStopPayDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Detention Rate ($/hr)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={detentionHourlyRateDollars}
                  onChange={(e) => setDetentionHourlyRateDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Layover Rate ($/day)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={layoverDailyRateDollars}
                  onChange={(e) => setLayoverDailyRateDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Recurring Deductions (Insurance, Trailer, Escrow) */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Automatic Recurring Deductions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Insurance ($/settlement)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={insuranceDeductionDollars}
                  onChange={(e) => setInsuranceDeductionDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Trailer Rental ($/settlement)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={trailerRentDollars}
                  onChange={(e) => setTrailerRentDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Escrow Contribution ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={escrowDeductionDollars}
                  onChange={(e) => setEscrowDeductionDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Maintenance Escrow ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={maintenanceDeductionDollars}
                  onChange={(e) => setMaintenanceDeductionDollars(e.target.value)}
                  disabled={!canEdit}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Automated Deduction Rules */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Automated Deduction Rules
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deductActualFuel}
                onChange={(e) => setDeductActualFuel(e.target.checked)}
                disabled={!canEdit}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Deduct Fuel Purchases</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deductAdvances}
                onChange={(e) => setDeductAdvances(e.target.checked)}
                disabled={!canEdit}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Deduct Cash Advances</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deductTolls}
                onChange={(e) => setDeductTolls(e.target.checked)}
                disabled={!canEdit}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Deduct Tolls</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deductChargebacks}
                onChange={(e) => setDeductChargebacks(e.target.checked)}
                disabled={!canEdit}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Deduct Chargebacks</span>
            </label>
          </div>
        </div>

        {/* Section 6: Effective Date & Save */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Effective Date</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={!canEdit}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save & Version Compensation Profile</span>
            </button>
          )}
        </div>
      </form>

      {/* History Table */}
      {profilesHistory.length > 0 && (
        <div className="border-t border-slate-800 pt-6 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" /> Profile Version History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-2.5">Version</th>
                  <th className="p-2.5">Worker Type</th>
                  <th className="p-2.5">Pay Method</th>
                  <th className="p-2.5">Effective Date</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {profilesHistory.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40">
                    <td className="p-2.5 font-mono font-bold text-white">v{p.version}</td>
                    <td className="p-2.5 capitalize">{p.workerType?.replace('_', ' ')}</td>
                    <td className="p-2.5 capitalize">{p.payMethod?.replace(/_/g, ' ')}</td>
                    <td className="p-2.5">{new Date(p.effectiveFrom).toLocaleDateString()}</td>
                    <td className="p-2.5">
                      {p.isActive ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">Archived</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default CompensationProfileManager;
