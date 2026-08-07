import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronLeft, ChevronRight, X, CheckCircle, HelpCircle, Compass, Target } from 'lucide-react';
import { User, UserRole, RoleTourStatus } from '../../types';
import { auth, db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';

export const CURRENT_TOUR_VERSION = 'v1';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  badge?: string;
}

export const TOUR_STEPS_BY_ROLE: Record<UserRole, TourStep[]> = {
  admin: [
    {
      id: 'admin-welcome',
      title: 'Welcome to Truck Dispatch Pro',
      description: 'Your carrier admin dashboard controls company profile setup, team rosters, subscription plans, compliance, and operations.',
      badge: 'Tenant Admin'
    },
    {
      id: 'admin-company',
      title: 'Company Profile & Settings',
      description: 'Manage your company details, DOT/MC numbers, corporate contact info, logo, theme colors, and legal records.',
      targetSelector: '#tour-company-profile',
      badge: 'Company Setup'
    },
    {
      id: 'admin-team',
      title: 'Team Roster & Staff Management',
      description: 'Add and manage dispatchers and CDL drivers, assign operational permissions, reset credentials, and view active staff statuses.',
      targetSelector: '#tour-team-roster',
      badge: 'Staff Management'
    },
    {
      id: 'admin-billing',
      title: 'Stripe Subscription & Billing',
      description: 'View your current plan (Basic $59.99/mo or Premium $159.99/mo), manage trial status, view invoices, or open Stripe Customer Portal.',
      targetSelector: '#tour-billing-section',
      badge: 'Billing & Plans'
    },
    {
      id: 'admin-rate-conf',
      title: 'Rate Confirmations & AI Parsing',
      description: 'Upload rate confirmation documents manually or utilize Premium AI PDF parsing to extract load details automatically.',
      targetSelector: '#tour-rate-confirmations',
      badge: 'Rate Confirmations'
    },
    {
      id: 'admin-sos',
      title: 'Breakdown SOS Emergency Center',
      description: 'Monitors real-time breakdown and roadside SOS emergency alerts submitted by your CDL drivers on active loads.',
      targetSelector: '#tour-breakdown-center',
      badge: 'Safety & SOS'
    },
    {
      id: 'admin-support',
      title: 'Support Center & Help Desk',
      description: 'Contact Nexusweft technical support, search help guides, open priority tickets, and view platform support responses.',
      targetSelector: '#tour-support-center',
      badge: 'Support Desk'
    },
    {
      id: 'admin-status',
      title: 'System Announcements & Status Bar',
      description: 'Stay updated with global platform health alerts, scheduled maintenance notices, and broadcast system announcements.',
      targetSelector: '#tour-system-status',
      badge: 'System Health'
    },
    {
      id: 'admin-finish',
      title: 'Tour Complete!',
      description: 'You are all set to manage your carrier fleet. You can retake this guided product tour anytime from the Help menu or Support Center.',
      badge: 'Get Started'
    }
  ],
  dispatcher: [
    {
      id: 'disp-welcome',
      title: 'Welcome to Dispatch Board',
      description: 'Your operational command center for creating loads, assigning CDL drivers, tracking transit progress, and managing load chats.',
      badge: 'Operations'
    },
    {
      id: 'disp-loads',
      title: 'Create & Manage Loads',
      description: 'Create new freight loads, set pickup/delivery addresses, rates, weight, reference numbers, and manage active load lifecycles.',
      targetSelector: '#tour-create-load',
      badge: 'Load Management'
    },
    {
      id: 'disp-assign',
      title: 'Assign Drivers & Power Units',
      description: 'Assign available, on-duty CDL drivers and power units to loads, sending instant dispatch notifications.',
      targetSelector: '#tour-assign-driver',
      badge: 'Driver Assignment'
    },
    {
      id: 'disp-tracking',
      title: 'Load Status Tracking',
      description: 'Monitor load progress through Dispatched, En Route, At Pickup, Loaded, At Delivery, and Delivered status stages.',
      targetSelector: '#tour-load-status',
      badge: 'Transit Tracking'
    },
    {
      id: 'disp-chat',
      title: 'Load Communications & Chat',
      description: 'Send direct load-based messages to assigned drivers with timestamped record keeping and audit history.',
      targetSelector: '#tour-load-chat',
      badge: 'Load Chat'
    },
    {
      id: 'disp-rate-parser',
      title: 'Rate Confirmation Parser',
      description: 'Drop rate confirmation PDF documents to instantly parse origin, destination, rate, and broker details with Gemini AI.',
      targetSelector: '#tour-rate-parser',
      badge: 'AI Rate Parser'
    },
    {
      id: 'disp-gps',
      title: 'Live Driver GPS Tracking',
      description: 'View consent-governed GPS location updates and travel route points for drivers assigned to active loads.',
      targetSelector: '#tour-gps-tracking',
      badge: 'GPS Telemetry'
    },
    {
      id: 'disp-sos-alerts',
      title: 'Breakdown & SOS Alerts',
      description: 'Receive immediate visual and audible notifications whenever a driver reports a breakdown or roadside emergency.',
      targetSelector: '#tour-breakdown-alerts',
      badge: 'Critical Alerts'
    },
    {
      id: 'disp-notifs',
      title: 'In-App Notifications',
      description: 'Stay alerted on driver status updates, message delivery, and operational changes.',
      targetSelector: '#tour-notifications',
      badge: 'Notifications'
    },
    {
      id: 'disp-finish',
      title: 'Dispatch Tour Complete!',
      description: 'You are ready to dispatch freight efficiently. Retake this product tour anytime from the top Help / Support menu.',
      badge: 'Ready to Work'
    }
  ],
  driver: [
    {
      id: 'drv-welcome',
      title: 'Welcome to Driver Portal',
      description: 'Your mobile-friendly driver terminal for managing assigned freight loads, updating duty status, and messaging dispatch.',
      badge: 'CDL Operator'
    },
    {
      id: 'drv-loads',
      title: 'View Assigned Loads',
      description: 'Inspect assigned load details, shipper/consignee addresses, pickup/delivery appointment times, and broker rate details.',
      targetSelector: '#tour-driver-loads',
      badge: 'Freight Loads'
    },
    {
      id: 'drv-status',
      title: 'Update Load Status',
      description: 'Update your load status in real-time as you arrive at pickup, finish loading, begin transit, and arrive at delivery.',
      targetSelector: '#tour-driver-status',
      badge: 'Status Updates'
    },
    {
      id: 'drv-chat',
      title: 'Communicate with Dispatch',
      description: 'Chat directly with your company dispatch team on assigned loads to report delays, gate passes, or load updates.',
      targetSelector: '#tour-driver-chat',
      badge: 'Dispatch Chat'
    },
    {
      id: 'drv-pod',
      title: 'Upload POD & Documents',
      description: 'Upload photos or PDF scans of signed Proof of Delivery (POD) and Bill of Lading (BOL) documents right from your truck.',
      targetSelector: '#tour-driver-pod',
      badge: 'Document Capture'
    },
    {
      id: 'drv-gps',
      title: 'Consent-Based GPS Tracking',
      description: 'Understand how load-active GPS tracking operates transparently while you are assigned to an active load.',
      targetSelector: '#tour-driver-gps',
      badge: 'GPS Privacy'
    },
    {
      id: 'drv-sos',
      title: 'Report Breakdown / Emergency SOS',
      description: 'Instantly notify dispatch if you suffer a tire blowout, mechanical failure, or roadside emergency while on duty.',
      targetSelector: '#tour-driver-sos',
      badge: 'Roadside SOS'
    },
    {
      id: 'drv-notifs',
      title: 'Dispatch Notifications',
      description: 'Receive instant push alerts whenever dispatch assigns a new load, updates instructions, or replies to messages.',
      targetSelector: '#tour-driver-notifs',
      badge: 'Alerts'
    },
    {
      id: 'drv-finish',
      title: 'Driver Tour Complete!',
      description: 'Drive safely! You can launch this guided tour again at any time from your profile or Help menu.',
      badge: 'Safe Travel'
    }
  ],
  super_admin: [
    {
      id: 'sa-welcome',
      title: 'Welcome to Super Admin Console',
      description: 'Global SaaS management center for monitoring carrier tenants, user authentication, system health, and platform communications.',
      badge: 'Global Owner'
    },
    {
      id: 'sa-tenants',
      title: 'Tenant & Carrier Management',
      description: 'View all onboarded carrier companies, DOT numbers, active subscription plans, trial statuses, and account controls.',
      targetSelector: '#tour-super-companies',
      badge: 'Tenant Directory'
    },
    {
      id: 'sa-create',
      title: 'Provision New Carrier Tenant',
      description: 'Provision new tenant companies, invite tenant administrators, set initial plans, and trigger automated setup links.',
      targetSelector: '#tour-super-create-tenant',
      badge: 'Tenant Onboarding'
    },
    {
      id: 'sa-announcements',
      title: 'Platform System Announcements',
      description: 'Broadcast global system announcements, banner alerts, and maintenance windows across all carrier tenants in real-time.',
      targetSelector: '#tour-super-announcements',
      badge: 'Broadcasting'
    },
    {
      id: 'sa-health',
      title: 'System Health & Metrics',
      description: 'Monitor server latency, Firestore query performance, API endpoints, and active environment status.',
      targetSelector: '#tour-super-health',
      badge: 'System Status'
    },
    {
      id: 'sa-support',
      title: 'Global Support Ticket Desk',
      description: 'Review and answer support requests submitted by carrier administrators, dispatchers, and CDL drivers.',
      targetSelector: '#tour-super-support',
      badge: 'Helpdesk'
    },
    {
      id: 'sa-billing',
      title: 'Billing & Revenue Overview',
      description: 'Monitor overall subscription tiers, Stripe Customer IDs, trial conversions, and billing statuses.',
      targetSelector: '#tour-super-billing',
      badge: 'Financials'
    },
    {
      id: 'sa-audit',
      title: 'Compliance & Legal Records',
      description: 'Review electronic audit trails, legal agreements, signed ESIGN disclosures, and tenant activity logs.',
      targetSelector: '#tour-super-audit',
      badge: 'Audit Trail'
    },
    {
      id: 'sa-finish',
      title: 'Super Admin Tour Complete!',
      description: 'You have full oversight of the Truck Dispatch Pro multi-tenant SaaS platform.',
      badge: 'Platform Control'
    }
  ]
};

// Function to check if tour should be automatically displayed for user
export function shouldShowTourForUser(user: User | null, roleOverride?: UserRole): boolean {
  if (!user) return false;
  const role = roleOverride || user.role;

  // 1. Check local device storage first for instant response on page refresh
  try {
    const localKey = `tour_done_${user.id}_${role}`;
    if (localStorage.getItem(localKey) === 'true') {
      return false;
    }
  } catch (e) {
    // ignore localStorage errors
  }

  // 2. Check user object's tourStatus record from database
  const roleStatus: RoleTourStatus | undefined = user.tourStatus?.[role];

  if (roleStatus) {
    if (roleStatus.completed || roleStatus.skipped) {
      try {
        localStorage.setItem(`tour_done_${user.id}_${role}`, 'true');
      } catch (e) {}
      return false; // Completed or skipped -> hide
    }
    if (roleStatus.version === CURRENT_TOUR_VERSION) {
      return false;
    }
  }

  return true;
}

// Function to save tour status to backend API and local Firestore fallback
export async function saveTourStatus(
  user: User,
  role: UserRole,
  completed: boolean,
  skipped: boolean
): Promise<void> {
  const timestamp = new Date().toISOString();

  // 1. Persist to local storage immediately so refresh knows tour was finished/skipped
  try {
    const localKey = `tour_done_${user.id}_${role}`;
    localStorage.setItem(localKey, 'true');
  } catch (e) {
    console.warn('Failed to save tour status to localStorage:', e);
  }

  // 2. Immediately mutate in-memory user tourStatus object
  if (!user.tourStatus) {
    (user as any).tourStatus = {};
  }
  user.tourStatus[role] = {
    version: CURRENT_TOUR_VERSION,
    completed,
    skipped,
    ...(completed ? { completedAt: timestamp } : {}),
    ...(skipped ? { skippedAt: timestamp } : {})
  };

  const payload = {
    role,
    version: CURRENT_TOUR_VERSION,
    completed,
    skipped
  };

  // 3. Try Express Backend API endpoint
  try {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      const idToken = await firebaseUser.getIdToken();
      await fetch('/api/user/tour-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });
      console.log(`Tour status saved via API for ${role}: completed=${completed}, skipped=${skipped}`);
    }
  } catch (apiErr) {
    console.warn('Backend tour API failed, falling back to direct Firestore update:', apiErr);
  }

  // 4. Always update Firestore user document so backend/db state is synchronized
  try {
    const roleStatus: RoleTourStatus = {
      version: CURRENT_TOUR_VERSION,
      completed,
      skipped,
      ...(completed ? { completedAt: timestamp } : {}),
      ...(skipped ? { skippedAt: timestamp } : {})
    };

    await setDoc(
      doc(db, 'users', user.id),
      {
        tourStatus: {
          [role]: roleStatus
        },
        updatedAt: timestamp
      },
      { merge: true }
    );
    console.log(`Tour status saved via Firestore for ${role}: completed=${completed}, skipped=${skipped}`);
  } catch (fsErr) {
    console.error('Failed to save tour status via Firestore:', fsErr);
  }
}

interface GuidedProductTourProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  roleOverride?: UserRole;
}

export const GuidedProductTour: React.FC<GuidedProductTourProps> = ({
  user,
  isOpen,
  onClose,
  roleOverride
}) => {
  const role = roleOverride || user.role;
  const steps = TOUR_STEPS_BY_ROLE[role] || TOUR_STEPS_BY_ROLE.admin;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const currentStep = steps[currentStepIndex] || steps[0];

  // Highlight target element if available on current screen
  useEffect(() => {
    if (!isOpen) {
      setHighlightRect(null);
      return;
    }

    const targetSelector = currentStep?.targetSelector;
    if (targetSelector) {
      const el = document.querySelector(targetSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setHighlightRect(rect);
        // Scroll element into view if needed
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } else {
        setHighlightRect(null);
      }
    } else {
      setHighlightRect(null);
    }
  }, [currentStepIndex, isOpen, currentStep]);

  const handleNext = async () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Last step -> Finish
      await saveTourStatus(user, role, true, false);
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = async () => {
    await saveTourStatus(user, role, false, true);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
        {/* Dark Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleSkip}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Target Element Highlight Box if selector matches */}
        {highlightRect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute border-2 border-amber-400/90 rounded-2xl shadow-[0_0_25px_rgba(251,191,36,0.35)] transition-all duration-300 z-50"
            style={{
              top: highlightRect.top - 6,
              left: highlightRect.left - 6,
              width: highlightRect.width + 12,
              height: highlightRect.height + 12
            }}
          >
            <div className="absolute -top-3 -right-3 h-6 w-6 bg-amber-400 text-slate-950 rounded-full flex items-center justify-center font-bold text-[10px] shadow-md animate-pulse">
              <Target className="h-3.5 w-3.5" />
            </div>
          </motion.div>
        )}

        {/* Tour Card Popover */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative z-50 w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden text-slate-100"
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono block">
                  Product Tour • Step {currentStepIndex + 1} of {steps.length}
                </span>
                <h4 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                  {currentStep.title}
                </h4>
              </div>
            </div>

            <button
              onClick={handleSkip}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Skip Tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-[10px] font-bold tracking-wide uppercase">
                {currentStep.badge || role.toUpperCase()}
              </span>
              {currentStep.targetSelector && (
                <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <Sparkles className="h-3 w-3" /> Target Highlighted
                </span>
              )}
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              {currentStep.description}
            </p>

            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-1.5 pt-2">
              {steps.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentStepIndex
                      ? 'w-6 bg-indigo-400'
                      : idx < currentStepIndex
                      ? 'w-2 bg-indigo-600/60'
                      : 'w-2 bg-slate-800'
                  }`}
                  title={`Go to step ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Footer Navigation */}
          <div className="bg-slate-950/80 p-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-slate-400 hover:text-slate-200 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-900 transition cursor-pointer"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {currentStepIndex === steps.length - 1 ? (
                  <>
                    <span>Finish Tour</span> <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
                  </>
                ) : (
                  <>
                    <span>Next</span> <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};

export default GuidedProductTour;
