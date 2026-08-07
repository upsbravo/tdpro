import React, { useState, useEffect } from 'react';
import { AlertTriangle, MapPin, X, Send, ShieldAlert, CheckCircle2, Loader2, Phone, Truck, RefreshCw } from 'lucide-react';
import { Company, User as AppUser, Load, DriverAlertType, DriverAlertLocation } from '../types';
import { auth } from '../firebase';

interface DriverBreakdownModalProps {
  company: Company;
  driver: AppUser;
  activeLoad?: Load | null;
  assignedLoads: Load[];
  isOpen: boolean;
  onClose: () => void;
  onAlertCreated?: (alertId: string) => void;
}

const ALERT_TYPES: DriverAlertType[] = [
  'Truck Breakdown',
  'Tire Blowout',
  'Accident',
  'Stuck / Roadside Issue',
  'Medical / Safety Emergency',
  'Other'
];

export default function DriverBreakdownModal({
  company,
  driver,
  activeLoad,
  assignedLoads,
  isOpen,
  onClose,
  onAlertCreated,
}: DriverBreakdownModalProps) {
  const [selectedType, setSelectedType] = useState<DriverAlertType>('Truck Breakdown');
  const [description, setDescription] = useState('');
  const [selectedLoadId, setSelectedLoadId] = useState<string>(activeLoad?.id || '');
  const [confirmedEmergency, setConfirmedEmergency] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // GPS Location Capture
  const [location, setLocation] = useState<DriverAlertLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (activeLoad?.id) {
      setSelectedLoadId(activeLoad.id);
    }
  }, [activeLoad]);

  useEffect(() => {
    if (isOpen) {
      captureLocation();
    }
  }, [isOpen]);

  const captureLocation = () => {
    setIsLocating(true);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser/device.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString()
        });
        setIsLocating(false);
      },
      (err) => {
        console.warn('GPS location capture warning:', err.message);
        setLocationError(`Could not fetch high-accuracy GPS: ${err.message}. Defaulting to manual report.`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (confirmDuplicate = false) => {
    if (!confirmedEmergency) {
      setErrorMessage('Please check the confirmation box to verify this breakdown/alert.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setDuplicateWarning(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Authentication token required. Please re-login.');
      }

      const res = await fetch('/api/driver-alerts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId: company.id,
          driverId: driver.id,
          loadId: selectedLoadId || null,
          alertType: selectedType,
          description,
          location,
          confirmDuplicate
        })
      });

      const data = await res.json();

      if (res.status === 409 && data.isDuplicateWarning) {
        setDuplicateWarning(data.error);
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit critical alert');
      }

      // Reset & Close
      setDescription('');
      setConfirmedEmergency(false);
      setIsSubmitting(false);
      if (onAlertCreated) onAlertCreated(data.alertId);
      onClose();
    } catch (err: any) {
      console.error('Error submitting driver alert:', err);
      setErrorMessage(err.message || 'Failed to submit breakdown alert. Please try again or call dispatch directly.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-2xl max-w-md w-full p-5 text-white shadow-2xl relative space-y-4 my-8">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-500 tracking-wide font-heading uppercase flex items-center gap-2">
                BREAKDOWN / SOS MODE
              </h2>
              <p className="text-[11px] text-zinc-400">
                Immediately notifies dispatch & logs location.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Duplicate Warning Dialog */}
        {duplicateWarning && (
          <div className="bg-amber-950/90 border border-amber-700 text-amber-200 text-xs p-3.5 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Recent Alert Detected</span>
            </div>
            <p className="text-[11px] text-amber-300/90">{duplicateWarning}</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleSubmit(true)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold py-1.5 px-3 rounded-lg text-xs transition"
              >
                Yes, Submit Second Alert
              </button>
              <button
                onClick={() => setDuplicateWarning(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-1.5 px-3 rounded-lg text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="space-y-3 text-xs">
          
          {/* Mandatory Emergency / 911 Legal Disclaimer */}
          <div className="bg-red-950/70 border border-red-800/80 rounded-xl p-3 text-[11px] leading-relaxed text-red-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-red-400 uppercase tracking-wider text-[10px]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Important Emergency Disclaimer
            </div>
            <p className="text-[10.5px]">
              Driver Breakdown / SOS alerts notify your carrier company’s dispatch/admin team only. This feature <strong>does NOT contact emergency services, police, ambulance, fire department, roadside assistance, insurance providers, or government agencies</strong>.
            </p>
            <p className="font-semibold text-red-300">
              If you are in immediate physical danger or need life-saving assistance, call <strong>911</strong> or local emergency services immediately before submitting this alert.
            </p>
          </div>

          {/* Issue Type Selector */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Issue / Breakdown Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALERT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`p-2 rounded-xl text-[11px] font-semibold border text-left transition flex items-center gap-2 ${
                    selectedType === type
                      ? 'bg-red-950/60 border-red-500 text-red-200 font-bold shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${selectedType === type ? 'bg-red-500 animate-ping' : 'bg-zinc-600'}`} />
                  <span className="truncate">{type}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Linked Load Selection */}
          {assignedLoads.length > 0 && (
            <div>
              <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Affected Assigned Load
              </label>
              <select
                value={selectedLoadId}
                onChange={(e) => setSelectedLoadId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
              >
                <option value="">No specific load / General truck issue</option>
                {assignedLoads.map((load) => (
                  <option key={load.id} value={load.id}>
                    Load #{load.loadNumber} - {load.pickup.facilityName.split(',')[0]} to {load.delivery.facilityName.split(',')[0]} ({load.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Details / Situation Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Mile marker 142 on I-80 W. Front driver tire blew out. Stopped safely on right shoulder."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Location Status Box */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400" /> GPS Location Report
              </span>
              <button
                type="button"
                onClick={captureLocation}
                disabled={isLocating}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold text-[10px] transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isLocating ? 'animate-spin' : ''}`} />
                {isLocating ? 'Locating...' : 'Refresh GPS'}
              </button>
            </div>

            {location ? (
              <div className="text-[10px] text-emerald-400 font-mono flex items-center justify-between bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                <span>LAT: {location.lat.toFixed(5)}, LNG: {location.lng.toFixed(5)}</span>
                <span className="text-zinc-500">±{Math.round(location.accuracy || 0)}m</span>
              </div>
            ) : locationError ? (
              <div className="text-[10px] text-amber-400 bg-amber-950/40 p-2 rounded-lg border border-amber-900/50">
                {locationError}
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500">
                Acquiring GPS coordinates...
              </div>
            )}
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmedEmergency}
              onChange={(e) => setConfirmedEmergency(e.target.checked)}
              className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-red-600 focus:ring-red-500 h-4 w-4"
            />
            <span className="text-[11px] text-zinc-300 leading-snug">
              I confirm this is an active breakdown / emergency requiring urgent dispatch assistance.
            </span>
          </label>

        </div>

        {/* Footer Actions */}
        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold py-2.5 px-4 rounded-xl text-xs transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !confirmedEmergency}
            onClick={() => handleSubmit(false)}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg shadow-red-950 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending Alert...
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" />
                SEND CRITICAL ALERT
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
