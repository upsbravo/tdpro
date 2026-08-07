import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User as AppUser, UserRole } from '../types';
import { ShieldCheck, Lock, Mail, UserPlus, LogIn, KeyRound, Smartphone, Sparkles, AlertCircle, RefreshCw, Scale } from 'lucide-react';
import { motion } from 'motion/react';
import LegalViewerModal from './legal/LegalViewerModal';
import { FOOTER_LEGAL_LINKS } from './legal/legalDocuments';

interface SignUpGateProps {
  users: AppUser[];
  onSuccess: (user: any, role: UserRole) => void;
  onSignInWithGoogle: () => void;
  onSignInAnonymously: () => void;
  onLocalSandbox?: () => void;
}

export default function SignUpGate({ users, onSuccess, onSignInWithGoogle, onSignInAnonymously, onLocalSandbox }: SignUpGateProps) {
  const [activeTab, setActiveTab] = useState<'signup' | 'signin'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [usdotNumber, setUsdotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Legal viewer modal state
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [selectedLegalSlug, setSelectedLegalSlug] = useState('terms-of-service');

  // Parse invite link on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteEmail = params.get('inviteEmail') || params.get('email');
    if (inviteEmail) {
      setEmail(inviteEmail.toLowerCase().trim());
      setActiveTab('signup');
    }
  }, []);

  // Update company viewedAt timestamp when the email is entered in registration tab
  React.useEffect(() => {
    if (activeTab !== 'signup' || !email) return;
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) return;
    if (!auth.currentUser) return; // Prevent permission warnings for unauthenticated queries

    const timer = setTimeout(async () => {
      try {
        const q = query(collection(db, 'companies'), where('contactEmail', '==', cleanEmail));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const docSnap = qSnap.docs[0];
          const data = docSnap.data();
          // Only update if they haven't viewed it yet or we want to record the view timestamp
          if (!data.viewedAt) {
            await setDoc(doc(db, 'companies', docSnap.id), {
              ...data,
              viewedAt: new Date().toISOString()
            });
            console.log(`Company ${docSnap.id} invitation viewed: updated viewedAt`);
          }
        }
      } catch (err) {
        console.error("Error auto-updating viewedAt: ", err);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [email, activeTab]);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMsg('Please enter your email address in the field below first so we can send a password reset link.');
      setResetSuccessMsg(null);
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setResetSuccessMsg(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccessMsg(`Password reset link sent to ${email}. Please check your inbox or spam folder!`);
    } catch (err: any) {
      console.error("Password reset error:", err);
      let friendlyMsg = err.message;
      if (err.code === 'auth/user-not-found') {
        friendlyMsg = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMsg = 'Please enter a valid email address.';
      }
      setErrorMsg(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (activeTab === 'signup') {
        if (!name.trim()) throw new Error('Full Name is required');
        if (!email.trim() || !password.trim()) throw new Error('Email and Password are required');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        const lowerEmail = email.toLowerCase();
        const matchedLocalUser = users.find(u => u.email.toLowerCase() === lowerEmail);
        const resolvedRole: UserRole = matchedLocalUser 
          ? matchedLocalUser.role 
          : (lowerEmail === 'nexusweft@gmail.com' ? 'super_admin' : 'admin');

        // 1. Create firebase user first so we are authenticated in Firestore security rules!
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const user = credential.user;

        // 2. Check if there is an invited user profile for this email (now we are authenticated, so list rules on /users permit this query)
        let isInvitedUser = false;
        let qSnapInvite: any = null;
        try {
          const qInvite = query(collection(db, 'users'), where('email', '==', lowerEmail));
          qSnapInvite = await getDocs(qInvite);
          isInvitedUser = !qSnapInvite.empty;
        } catch (dbErr) {
          console.error("Error checking user invitation after registration: ", dbErr);
          // Clean up created user to prevent orphaned auth accounts
          await user.delete();
          throw dbErr;
        }

        // 2.5 Check if they are a company owner/contact for an onboarded company
        let isCompanyOwner = false;
        let companyDocData: any = null;
        let companyIdResolved = '';
        try {
          const qCompany = query(collection(db, 'companies'), where('contactEmail', '==', lowerEmail));
          const qSnapCompany = await getDocs(qCompany);
          if (!qSnapCompany.empty) {
            isCompanyOwner = true;
            companyDocData = qSnapCompany.docs[0].data();
            companyIdResolved = qSnapCompany.docs[0].id;
          }
        } catch (coErr) {
          console.error("Error checking company contact registration in SignUpGate: ", coErr);
        }

        if (resolvedRole !== 'super_admin' && !isInvitedUser && !isCompanyOwner) {
          // Clean up the created auth account since registration is restricted
          await user.delete();
          throw new Error('Access Restricted. Self-registration is disabled on this private logistics node. Please ask your Fleet Administrator or Platform Super Admin to authorize and register your email address before activating your profile.');
        }

        const profile: AppUser = {
          id: user.uid,
          name: name,
          email: lowerEmail,
          role: isCompanyOwner ? 'admin' : resolvedRole,
          status: 'active',
          phone: phone || '(555) 019-2831',
        };
        if (isCompanyOwner) {
          profile.companyId = companyIdResolved;
          if (companyDocData.contactName && !name) {
            profile.name = companyDocData.contactName;
          }
        }

        let finalRole: UserRole = isCompanyOwner ? 'admin' : resolvedRole;

        if (isInvitedUser) {
          // Inherit their pre-registered profile!
          const preData = qSnapInvite.docs[0].data() as AppUser;
          profile.role = preData.role;
          profile.companyId = preData.companyId;
          profile.phone = preData.phone || profile.phone;
          profile.name = name; // Prefer the typed name
          finalRole = preData.role;

          // Delete the temporary pre-registered user doc to prevent duplicate emails
          if (qSnapInvite.docs[0].id !== user.uid) {
            try {
              const oldId = qSnapInvite.docs[0].id;
              const renamedEmail = `registered_${Date.now()}_${preData.email}`;

              // Overwrite with inactive/renamed to avoid unique index issues
              await setDoc(doc(db, 'users', oldId), { 
                ...preData, 
                status: 'inactive', 
                email: renamedEmail 
              });

              // Also archive the old subcollection record so it doesn't clutter active lists
              if (preData.role === 'driver' && preData.companyId) {
                try {
                  await setDoc(doc(db, 'admins', preData.companyId, 'drivers', oldId), {
                    ...preData,
                    status: 'inactive',
                    email: renamedEmail
                  });
                } catch (subErr) {
                  console.warn("Failed to archive old driver subcollection record:", subErr);
                }
              } else if (preData.role === 'dispatcher' && preData.companyId) {
                try {
                  await setDoc(doc(db, 'admins', preData.companyId, 'dispatchers', oldId), {
                    ...preData,
                    status: 'inactive',
                    email: renamedEmail
                  });
                } catch (subErr) {
                  console.warn("Failed to archive old dispatcher subcollection record:", subErr);
                }
              }
            } catch (writeErr) {
              console.error("Failed to archive pre-registered invitation document: ", writeErr);
            }
          }
        }

        // Save in firestore
        await setDoc(doc(db, 'users', user.uid), profile);

        // Also write to role-based subcollections to ensure permission rules authorize properly
        if (profile.role === 'driver' && profile.companyId) {
          try {
            await setDoc(doc(db, 'admins', profile.companyId, 'drivers', user.uid), profile);
          } catch (subErr) {
            console.error("Failed to write to drivers subcollection during signup:", subErr);
          }
        } else if (profile.role === 'dispatcher' && profile.companyId) {
          try {
            await setDoc(doc(db, 'admins', profile.companyId, 'dispatchers', user.uid), profile);
          } catch (subErr) {
            console.error("Failed to write to dispatchers subcollection during signup:", subErr);
          }
        }

        if (isCompanyOwner && companyIdResolved) {
          try {
            await setDoc(doc(db, 'companies', companyIdResolved), {
              ...companyDocData,
              status: 'active',
              registeredAt: new Date().toISOString()
            });
            console.log(`Company ${companyIdResolved} updated to 'active' on registration`);
          } catch (coActiveErr) {
            console.error("Failed to update company to active during registration: ", coActiveErr);
          }
        }

        onSuccess(user, finalRole);
      } else {
        if (!email.trim() || !password.trim()) throw new Error('Email and Password are required');
        
        const lowerEmail = email.toLowerCase();
        const matchedLocalUser = users.find(u => u.email.toLowerCase() === lowerEmail);
        
        let credential;
        try {
          credential = await signInWithEmailAndPassword(auth, email, password);
        } catch (signInErr: any) {
          // Check if this error is because the account doesn't exist yet (e.g., auth/user-not-found or auth/invalid-credential)
          if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
            const isAuthorized = lowerEmail === 'nexusweft@gmail.com' || !!matchedLocalUser;
            
            if (isAuthorized) {
              try {
                // Auto-register authorized user since their auth record doesn't exist in a fresh environment
                credential = await createUserWithEmailAndPassword(auth, email, password);
                const user = credential.user;
                
                const resolvedRole = lowerEmail === 'nexusweft@gmail.com' ? 'super_admin' : (matchedLocalUser?.role || 'dispatcher');
                
                const profile: AppUser = {
                  id: user.uid,
                  name: matchedLocalUser?.name || 'Marcus Vance',
                  email: lowerEmail,
                  role: resolvedRole,
                  status: 'active',
                  phone: matchedLocalUser?.phone || '(555) 019-2831',
                  companyId: matchedLocalUser?.companyId,
                };
                
                await setDoc(doc(db, 'users', user.uid), profile);
                
                // Write to role-specific subcollections if applicable
                if (profile.role === 'driver' && profile.companyId) {
                  await setDoc(doc(db, 'admins', profile.companyId, 'drivers', user.uid), profile);
                } else if (profile.role === 'dispatcher' && profile.companyId) {
                  await setDoc(doc(db, 'admins', profile.companyId, 'dispatchers', user.uid), profile);
                }
              } catch (signUpErr) {
                // If register fails because it already exists (e.g., auth/email-already-in-use),
                // it means the password they typed was just wrong. Throw the original sign-in error.
                throw signInErr;
              }
            } else {
              throw signInErr;
            }
          } else {
            throw signInErr;
          }
        }

        const user = credential.user;
        
        // Fetch the user's actual profile to resolve their registered role (e.g. Driver, Dispatcher, Admin)
        let resolvedRole: UserRole = matchedLocalUser 
          ? matchedLocalUser.role 
          : (lowerEmail === 'nexusweft@gmail.com' ? 'super_admin' : 'dispatcher');

        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            const profileData = userSnap.data() as AppUser;
            resolvedRole = profileData.role;
          } else {
            // Fallback lookup: Check if there's a pre-registered invited profile under their email
            const qInvite = query(collection(db, 'users'), where('email', '==', lowerEmail));
            const qSnapInvite = await getDocs(qInvite);
            if (!qSnapInvite.empty) {
              const preData = qSnapInvite.docs[0].data() as AppUser;
              resolvedRole = preData.role;

              const newUserProfile: AppUser = {
                ...preData,
                id: user.uid,
                status: 'active',
              };

              // Write to /users/{user.uid}
              await setDoc(doc(db, 'users', user.uid), newUserProfile);

              // Write to role subcollection
              if (newUserProfile.role === 'driver' && newUserProfile.companyId) {
                await setDoc(doc(db, 'admins', newUserProfile.companyId, 'drivers', user.uid), newUserProfile);
              } else if (newUserProfile.role === 'dispatcher' && newUserProfile.companyId) {
                await setDoc(doc(db, 'admins', newUserProfile.companyId, 'dispatchers', user.uid), newUserProfile);
              }

              // Archive the old invited document
              if (qSnapInvite.docs[0].id !== user.uid) {
                try {
                  const oldId = qSnapInvite.docs[0].id;
                  const renamedEmail = `registered_${Date.now()}_${preData.email}`;

                  await setDoc(doc(db, 'users', oldId), {
                    ...preData,
                    status: 'inactive',
                    email: renamedEmail
                  });

                  // Try to archive the subcollection records as well (non-blocking)
                  if (preData.role === 'driver' && preData.companyId) {
                    try {
                      await setDoc(doc(db, 'admins', preData.companyId, 'drivers', oldId), {
                        ...preData,
                        status: 'inactive',
                        email: renamedEmail
                      });
                    } catch (subErr) {
                      console.warn("Failed to archive old driver subcollection record:", subErr);
                    }
                  } else if (preData.role === 'dispatcher' && preData.companyId) {
                    try {
                      await setDoc(doc(db, 'admins', preData.companyId, 'dispatchers', oldId), {
                        ...preData,
                        status: 'inactive',
                        email: renamedEmail
                      });
                    } catch (subErr) {
                      console.warn("Failed to archive old dispatcher subcollection record:", subErr);
                    }
                  }
                } catch (archiveErr) {
                  console.error("Failed to archive old pre-registered document in SignUpGate: ", archiveErr);
                }
              }
            }
          }
        } catch (fetchErr) {
          console.warn("Could not retrieve user role from Firestore, falling back to local lookup: ", fetchErr);
        }
        
        onSuccess(user, resolvedRole);
      }
    } catch (err: any) {
      console.error("Authentication failed: ", err);
      let friendlyMessage = err.message;
      if (err.code === 'auth/user-disabled') {
        friendlyMessage = 'This account has been deactivated. Contact your company administrator or TD Pro support.';
      } else if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        friendlyMessage = 'Invalid email or password combination.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/operation-not-allowed') {
        friendlyMessage = 'Email/Password Authentication is not enabled in your Firebase console yet! Please enable it under Firebase Auth -> Sign-in method.';
      }
      setErrorMsg(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const autofillSuperAdmin = () => {
    setName('Marcus Vance');
    setEmail('admin@dispatchpro.com');
    setPhone('(555) 888-9999');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans select-none" id="signup-gate-portal">
      {/* Decorative ambient background lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/15 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10" id="signup-container">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl mb-4 shadow-inner" id="brand-logo-container">
            <ShieldCheck className="h-8 w-8 text-purple-400" />
          </div>
          <h1 className="text-3xl font-heading font-extrabold tracking-tight text-white" id="brand-name">
            TruckDispatch <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">Pro</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Enterprise Fleet Routing & Multi-Tenant Logistics Control Center
          </p>
        </div>

        {/* Auth Panel Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative" id="auth-panel-card">
          {/* Subtle glow border */}
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />

          {/* Closed Enterprise Gateway */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 mb-5 text-[11px] leading-relaxed text-slate-400 flex gap-2.5 items-start" id="super-admin-notice">
            <Lock className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Closed Enterprise Gateway:</span> Public self-registration is disabled. Access is limited to authorized fleet administrators, dispatchers, and pre-invited operators.
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl mb-6 border border-slate-800/50" id="auth-tabs">
            <button
              onClick={() => { setActiveTab('signin'); setErrorMsg(null); }}
              type="button"
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                activeTab === 'signin' 
                  ? 'bg-slate-900 text-purple-400 border border-purple-500/10 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              id="tab-signin"
            >
              <LogIn className="h-3.5 w-3.5 inline mr-1.5" />
              Sign In
            </button>
            <button
              onClick={() => { setActiveTab('signup'); setErrorMsg(null); }}
              type="button"
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                activeTab === 'signup' 
                  ? 'bg-slate-900 text-purple-400 border border-purple-500/10 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              id="tab-signup"
            >
              <UserPlus className="h-3.5 w-3.5 inline mr-1.5" />
              Activate Invitation
            </button>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl p-3 mb-4 flex gap-2 items-center" 
              id="auth-error-banner"
            >
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          {/* Success Banner */}
          {resetSuccessMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs rounded-xl p-3 mb-4 flex gap-2 items-center" 
              id="auth-success-banner"
            >
              <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{resetSuccessMsg}</span>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleCustomAuth} className="space-y-4" id="auth-form">
            {activeTab === 'signup' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Full Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Marcus Vance"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Phone Number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-600" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 019-2831"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-600" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@company.com"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
                />
              </div>
              {activeTab === 'signup' && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Note: Your email address must exactly match your platform pre-authorization.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center" id="password-label-row">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Password</label>
                {activeTab === 'signin' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[10px] text-purple-400 hover:text-purple-300 transition hover:underline bg-transparent border-none p-0 cursor-pointer"
                    id="forgot-password-btn"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-600" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              id="auth-submit-btn"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
              ) : (
                <span>{activeTab === 'signup' ? 'Activate Pre-authorized Account' : 'Sign In to Dashboard'}</span>
              )}
            </button>
          </form>

        </div>

        {/* Console Footnote */}
        <p className="text-center text-[10px] text-slate-500 mt-6 max-w-xs mx-auto">
          Authorized enterprise personnel only. Direct queries, writes, and real-time streams are recorded with military-grade encryption via security rules.
        </p>

        {/* Public Legal & Compliance Footer */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center max-w-lg mx-auto space-y-3">
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <button
                key={link.slug}
                onClick={() => {
                  setSelectedLegalSlug(link.slug);
                  setShowLegalModal(true);
                }}
                className="hover:text-indigo-400 hover:underline transition cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 leading-normal">
            Text messaging originator opt-in data and consent will not be sold, rented, shared, or disclosed to third parties or affiliates for their marketing or promotional purposes.
          </p>

          <p className="text-[10px] text-slate-600 font-mono">
            © 2026 Truck Dispatch Pro. All Rights Reserved. • Version 2.4.0
          </p>
        </div>
      </div>

      {/* Legal & Compliance Viewer Modal */}
      <LegalViewerModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialSlug={selectedLegalSlug}
      />
    </div>
  );
}
