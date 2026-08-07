import React, { useState, useEffect, useRef } from 'react';
import { UserRole, Company, User as AppUser, Load, Message, Invoice, AppNotification, LoadStatus, Stop, Truck } from './types';
import { sendDriverNotificationAlert } from './services/notificationService';
import { checkTruckPmGuard } from './utils';
import {
  INITIAL_COMPANIES,
  INITIAL_USERS,
  INITIAL_LOADS,
  INITIAL_MESSAGES,
  INITIAL_INVOICES,
  INITIAL_NOTIFICATIONS,
  HUB_COORDINATES,
} from './data';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot,
  query,
  where,
  deleteDoc,
  addDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInAnonymously,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, db, secondaryAuth, OperationType, handleFirestoreError, uploadFileToStorage, uploadDataUrlToStorage } from './firebase';
import { sanitizeFirestoreData, sanitizeNumber } from './utils/sanitizeData';
import RoleSelector from './components/RoleSelector';
import SuperAdminView from './components/SuperAdminView';
import AdminView from './components/AdminView';
import DispatcherView from './components/DispatcherView';
import DriverView from './components/DriverView';
import SignUpGate from './components/SignUpGate';
import SettingsModal from './components/SettingsModal';
import { PaymentRequiredView } from './components/PaymentRequiredView';
import { ShieldCheck, Info, Sparkles, Megaphone, Terminal, Cloud, CloudOff, Check, Loader2, WifiOff } from 'lucide-react';
import CustomConfirmModal from './components/CustomConfirmModal';

const getThemeStyleOverride = (hexColor: string) => {
  if (!hexColor) return '';
  return `
    :root {
      --color-purple-50: ${hexColor}1a;
      --color-purple-100: ${hexColor}33;
      --color-purple-200: ${hexColor}4d;
      --color-purple-300: ${hexColor}66;
      --color-purple-400: ${hexColor}99;
      --color-purple-500: ${hexColor}cc;
      --color-purple-600: ${hexColor};
      --color-purple-700: ${hexColor};
      --color-purple-800: ${hexColor};
      --color-purple-900: ${hexColor};
      --color-purple-950: ${hexColor};
    }
  `;
};

// Local storage key names
const STORAGE_KEYS = {
  COMPANIES: 'td_companies_v1',
  USERS: 'td_users_v1',
  LOADS: 'td_loads_v1',
  MESSAGES: 'td_messages_v1',
  INVOICES: 'td_invoices_v1',
  NOTIFICATIONS: 'td_notifications_v1',
};

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Page Layout Design Style
  const [pageTheme, setPageTheme] = useState<'cosmic_dark' | 'enterprise_light' | 'industrial_terminal'>(() => {
    return 'enterprise_light';
  });

  const handlePageThemeChange = (newTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal') => {
    setPageTheme(newTheme);
    localStorage.setItem('truck_dispatch_theme', newTheme);
  };

  // Sandbox State variables
  const [activeRole, setActiveRole] = useState<UserRole>('dispatcher'); // Default to dispatcher so they see the maps/chats immediately
  const [activeCompanyId, setActiveCompanyId] = useState<string>('co_apex');
  const [isSimPanelOpen, setIsSimPanelOpen] = useState<boolean>(false);
  const [isAutoGpsActive, setIsAutoGpsActive] = useState<boolean>(false);

  // Custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('td_dismissed_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const loadsRef = useRef<Load[]>([]);
  useEffect(() => {
    loadsRef.current = loads;
  }, [loads]);

  // Firebase connection and auth states
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [isProfileReady, setIsProfileReady] = useState<boolean>(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [googleMapsKey, setGoogleMapsKey] = useState<string>('');

  // Stripe return-session reconciliation state
  const [isReconcilingSession, setIsReconcilingSession] = useState<boolean>(false);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);

  // Cloud Sync Feedback States
  const [activeWritesCount, setActiveWritesCount] = useState<number>(0);
  const [showSavedIndicator, setShowSavedIndicator] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const savedTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (activeWritesCount > 0) {
      setShowSavedIndicator(true);
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = null;
      }
    } else if (activeWritesCount === 0 && lastSyncTime !== null) {
      savedTimeoutRef.current = setTimeout(() => {
        setShowSavedIndicator(false);
      }, 4000);
    }
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, [activeWritesCount, lastSyncTime]);

  const trackWrite = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setActiveWritesCount(prev => prev + 1);
    setSyncError(null);
    try {
      const result = await operation();
      setLastSyncTime(new Date());
      return result;
    } catch (err: any) {
      console.error("Cloud Write Error:", err);
      setSyncError(err?.message || String(err));
      throw err;
    } finally {
      setActiveWritesCount(prev => Math.max(0, prev - 1));
    }
  };

  // SaaS Master API Key synchronization
  useEffect(() => {
    if (!db) return;
    const docRef = doc(db, 'system_settings', 'google_maps');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const key = snap.data().apiKey || '';
        setGoogleMapsKey(key);
        (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY = key;
      } else {
        setGoogleMapsKey('');
      }
    }, (error) => {
      console.warn("SaaS Google Maps Master API Key subscription bypassed:", error);
    });
    return () => unsub();
  }, [firebaseUser]);

  // 1. Initial State Loading with LocalStorage fallback
  useEffect(() => {
    const loadOrInit = <T,>(key: string, defaultData: T): T => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error(`Failed parsing local storage key ${key}`, e);
        }
      }
      localStorage.setItem(key, JSON.stringify(defaultData));
      return defaultData;
    };

    setCompanies(loadOrInit(STORAGE_KEYS.COMPANIES, INITIAL_COMPANIES));
    setUsers(loadOrInit(STORAGE_KEYS.USERS, INITIAL_USERS));
    setLoads(loadOrInit(STORAGE_KEYS.LOADS, INITIAL_LOADS));
    setMessages(loadOrInit(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES));
    setInvoices(loadOrInit(STORAGE_KEYS.INVOICES, INITIAL_INVOICES));
    setNotifications(loadOrInit(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS));
  }, []);

  // 2. Firebase seeding helper
  const seedDatabase = async () => {
    console.log("Seeding database with default multi-tenant records...");
    try {
      // Seed Companies
      for (const co of INITIAL_COMPANIES) {
        await setDoc(doc(db, 'companies', co.id), co);
      }
      // Seed Users
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'users', u.id), u);
        if (u.role === 'driver' && u.companyId) {
          await setDoc(doc(db, 'admins', u.companyId, 'drivers', u.id), u);
        } else if (u.role === 'dispatcher' && u.companyId) {
          await setDoc(doc(db, 'admins', u.companyId, 'dispatchers', u.id), u);
        }
      }
      // Seed Loads
      for (const l of INITIAL_LOADS) {
        await setDoc(doc(db, 'admins', l.companyId, 'loads', l.id), l);
      }
      // Seed Invoices
      for (const inv of INITIAL_INVOICES) {
        await setDoc(doc(db, 'admins', inv.companyId, 'invoices', inv.id), inv);
      }
      // Seed Notifications
      for (const n of INITIAL_NOTIFICATIONS) {
        await setDoc(doc(db, 'notifications', n.id), n);
      }
      // Seed Messages
      for (const m of INITIAL_MESSAGES) {
        if (m.channel === 'general') {
          await setDoc(doc(db, 'admins', m.companyId, 'general_communications', m.id), m);
        } else if (m.channel === 'load' && m.loadId) {
          await setDoc(doc(db, 'admins', m.companyId, 'loads', m.loadId, 'communications', m.id), m);
        }
      }
      console.log("Database seeded successfully.");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'seeding');
    }
  };

  // 3. Auth observer & auto profile registrar
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setFirebaseUser(user);
        setIsFirebaseConnected(true);
        
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          let currentUserRole: UserRole;

          if (!userSnap.exists()) {
            const lowerEmail = user.email?.toLowerCase() || '';
            let isInvitedUser = false;
            let qSnapInvite: any = null;
            try {
              const qInvite = query(collection(db, 'users'), where('email', '==', lowerEmail));
              qSnapInvite = await getDocs(qInvite);
              isInvitedUser = qSnapInvite && !qSnapInvite.empty;
            } catch (inviteErr) {
              console.warn("Bypassed invite query due to restricted read permissions during registration phase: ", inviteErr);
            }

            let isCompanyOwner = false;
            let companyDocData: any = null;
            let companyIdResolved = '';

            if (!isInvitedUser && lowerEmail) {
              try {
                const qCompany = query(collection(db, 'companies'), where('contactEmail', '==', lowerEmail));
                const qSnapCompany = await getDocs(qCompany);
                if (qSnapCompany && !qSnapCompany.empty) {
                  isCompanyOwner = true;
                  companyDocData = qSnapCompany.docs[0].data();
                  companyIdResolved = qSnapCompany.docs[0].id;
                }
              } catch (err) {
                console.warn("Failed to check company owner mapping in onAuthStateChanged: ", err);
              }
            }

            let newUserProfile: AppUser;

            if (isInvitedUser && qSnapInvite) {
              const invitedDoc = qSnapInvite.docs[0];
              const invitedData = invitedDoc.data() as AppUser;
              newUserProfile = {
                ...invitedData,
                id: user.uid,
              };

              // Archive the old pre-registered/invited temporary user document
              if (invitedDoc.id !== user.uid) {
                try {
                  await setDoc(doc(db, 'users', invitedDoc.id), {
                    ...invitedData,
                    status: 'inactive',
                    email: `registered_${Date.now()}_${invitedData.email}`
                  });
                } catch (archiveErr) {
                  console.error("Failed to archive old pre-registered invitation document during OAuth profile creation: ", archiveErr);
                }
              }
            } else if (isCompanyOwner) {
              newUserProfile = {
                id: user.uid,
                name: user.displayName || companyDocData.contactName || 'Carrier Admin',
                email: lowerEmail,
                role: 'admin',
                status: 'active',
                phone: user.phoneNumber || companyDocData.contactPhone || '(555) 019-2831',
                companyId: companyIdResolved,
              };
            } else {
              const matchedInitialUser = INITIAL_USERS.find(u => u.email.toLowerCase() === lowerEmail);
              
              if (matchedInitialUser) {
                newUserProfile = {
                  ...matchedInitialUser,
                  id: user.uid,
                };
              } else {
                const isSuper = user.isAnonymous || lowerEmail === 'nexusweft@gmail.com' || lowerEmail === 'admin@dispatchpro.com';
                newUserProfile = {
                  id: user.uid,
                  name: user.displayName || (user.isAnonymous ? 'Guest Super Admin' : 'Operator'),
                  email: lowerEmail || 'guest@example.com',
                  role: isSuper ? 'super_admin' : 'admin',
                  status: 'active',
                  phone: user.phoneNumber || '(555) 019-2831',
                };
                if (!isSuper) {
                  newUserProfile.companyId = 'co_apex';
                }
              }
            }

            await setDoc(userRef, newUserProfile);
            if (newUserProfile.role === 'driver' && newUserProfile.companyId) {
              await setDoc(doc(db, 'admins', newUserProfile.companyId, 'drivers', user.uid), newUserProfile);
            } else if (newUserProfile.role === 'dispatcher' && newUserProfile.companyId) {
              await setDoc(doc(db, 'admins', newUserProfile.companyId, 'dispatchers', user.uid), newUserProfile);
            }
            currentUserRole = newUserProfile.role;
            setActiveRole(newUserProfile.role);
            if (newUserProfile.companyId) {
              setActiveCompanyId(newUserProfile.companyId);
            }
          } else {
            let profileData = userSnap.data() as AppUser;
            
            // Auto-heal fallback profile if there's an unclaimed pre-registered/invited profile
            if (profileData.companyId === 'co_apex' && profileData.role === 'admin' && user.email) {
              try {
                const lowerEmail = user.email.toLowerCase();
                const qInvite = query(collection(db, 'users'), where('email', '==', lowerEmail));
                const qSnapInvite = await getDocs(qInvite);
                const invitedDoc = qSnapInvite.docs.find(d => d.id !== user.uid);
                if (invitedDoc) {
                  const invitedData = invitedDoc.data() as AppUser;
                  console.log("Found unclaimed invited profile for existing fallback user. Healing...", invitedData);
                  
                  profileData = {
                    ...invitedData,
                    id: user.uid
                  };
                  
                  // Overwrite the current user document with the invited profile details
                  await setDoc(userRef, profileData);
                  
                  // Archive/deactivate the old invitation document to prevent double-claiming
                  await setDoc(doc(db, 'users', invitedDoc.id), {
                    ...invitedData,
                    status: 'inactive',
                    email: `claimed_${Date.now()}_${invitedData.email}`
                  });
                }
              } catch (healErr) {
                console.warn("Failed to heal/link invited profile on existing user: ", healErr);
              }
            }

            currentUserRole = profileData.role;
            setActiveRole(profileData.role);
            if (profileData.companyId) {
              setActiveCompanyId(profileData.companyId);

              // Auto-sync / heal missing subcollection documents (e.g., if registered via standard Sign Up tab)
              if (profileData.role === 'driver') {
                try {
                  await setDoc(doc(db, 'admins', profileData.companyId, 'drivers', user.uid), profileData);
                } catch (subErr) {
                  console.warn("Soft: Auto-healing driver subcollection document skipped or failed: ", subErr);
                }
              } else if (profileData.role === 'dispatcher') {
                try {
                  await setDoc(doc(db, 'admins', profileData.companyId, 'dispatchers', user.uid), profileData);
                } catch (subErr) {
                  console.warn("Soft: Auto-healing dispatcher subcollection document skipped or failed: ", subErr);
                }
              }
            }
          }
          
          // Seed if database is blank and active user is super_admin
          if (currentUserRole === 'super_admin') {
            try {
              const companiesSnap = await getDocs(collection(db, 'companies'));
              if (companiesSnap.empty) {
                await seedDatabase();
              }
            } catch (seedError) {
              console.warn("Seeding check bypassed or failed: ", seedError);
            }
          }

          // Access control verification for tenant & user active status
          try {
            const idToken = await user.getIdToken(true);
            const accessCheck = await fetch('/api/auth/access-status', {
              headers: { Authorization: `Bearer ${idToken}` }
            });
            const accessData = await accessCheck.json();
            if (!accessCheck.ok || !accessData.effectiveAccess) {
              const deactReason = accessData.reason || 'tenant_deactivated';
              let alertMsg = 'This company account has been deactivated. Contact your company administrator or TD Pro support.';
              if (deactReason === 'user_deactivated' || deactReason === 'user_disabled') {
                alertMsg = 'Your user account has been disabled or deactivated. Contact your administrator or TD Pro support.';
              } else if (deactReason === 'membership_suspended') {
                alertMsg = 'Your membership access to this carrier company has been suspended.';
              }
              await auth.signOut();
              setFirebaseUser(null);
              setIsProfileReady(false);
              setAuthErrorMsg(alertMsg);
              alert(alertMsg);
              return;
            }
          } catch (accessErr) {
            console.warn("Soft access status verification check skipped/failed: ", accessErr);
          }

          setIsProfileReady(true);
        } catch (error: any) {
          console.warn("Firebase auth profile registration failed: ", error);
          const errorMsgStr = error instanceof Error ? error.message : String(error);
          setAuthErrorMsg(`Security verification failed. Profile loading or registration has been blocked to prevent unauthenticated database access. Detail: ${errorMsgStr}`);
          setIsProfileReady(false);
        }
      } else {
        setFirebaseUser(null);
        setIsFirebaseConnected(false);
        setIsProfileReady(false);
      }
    });
    
    return () => unsubscribeAuth();
  }, []);

  // 3.a Active Tenant & User Access Enforcement Effect (Real-time listener)
  useEffect(() => {
    if (!firebaseUser) return;
    const activeUser = users.find(u => u.id === firebaseUser.uid);
    if (activeUser?.role === 'super_admin') return;
    const companyId = activeUser?.companyId;

    let unsubCompany: (() => void) | null = null;
    if (companyId) {
      unsubCompany = onSnapshot(doc(db, 'companies', companyId), async (snap) => {
        if (snap.exists()) {
          const coData = snap.data();
          if (coData.status && (coData.status === 'deactivated' || coData.status === 'suspended')) {
            const msg = 'This company account has been deactivated. Contact your company administrator or TD Pro support.';
            alert(msg);
            await auth.signOut();
            localStorage.clear();
            window.location.reload();
          }
        }
      });
    }

    const unsubUser = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snap) => {
      if (snap.exists()) {
        const uData = snap.data();
        if (uData.status === 'inactive' || uData.lifecycleStatus === 'terminated' || uData.accessStatus === 'suspended') {
          const msg = 'Your user account access has been deactivated or suspended. Contact your administrator.';
          alert(msg);
          await auth.signOut();
          localStorage.clear();
          window.location.reload();
        }
      }
    });

    return () => {
      if (unsubCompany) unsubCompany();
      unsubUser();
    };
  }, [firebaseUser, users]);

  // 3.b Stripe Checkout Session Return Reconciliation Effect
  useEffect(() => {
    if (!isProfileReady || !firebaseUser) return;

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (sessionId) {
      const reconcileSession = async () => {
        setIsReconcilingSession(true);
        setReconcileNotice(null);
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch('/api/stripe/verify-checkout-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ sessionId })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            if (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trialing') {
              setReconcileNotice(null);
            } else {
              setReconcileNotice("Payment is processing, please wait.");
            }
          } else {
            console.warn("Session verification response:", data);
            setReconcileNotice("Payment is processing, please wait.");
          }
        } catch (err) {
          console.error("Failed to reconcile Stripe checkout session:", err);
          setReconcileNotice("Payment is processing, please wait.");
        } finally {
          setIsReconcilingSession(false);
          // Clean URL using window.history.replaceState
          try {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } catch (e) {
            console.warn("Could not clean URL:", e);
          }
        }
      };

      reconcileSession();
    }
  }, [isProfileReady, firebaseUser]);

  // 4. Real-time Firestore synchronizer
  useEffect(() => {
    if (!isProfileReady || !firebaseUser || firebaseUser.isSandbox) return;

    // Subscriptions
    const unsubCompanies = activeRole === 'super_admin'
      ? onSnapshot(collection(db, 'companies'), (snapshot) => {
          const list: Company[] = [];
          snapshot.forEach(doc => list.push(doc.data() as Company));
          setCompanies(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'companies');
        })
      : onSnapshot(doc(db, 'companies', activeCompanyId), (snapshot) => {
          if (snapshot.exists()) {
            setCompanies([snapshot.data() as Company]);
          } else {
            setCompanies([]);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `companies/${activeCompanyId}`);
        });

    const unsubUsers = activeRole === 'super_admin'
      ? onSnapshot(collection(db, 'users'), (snapshot) => {
          const list: AppUser[] = [];
          snapshot.forEach(doc => list.push(doc.data() as AppUser));
          setUsers(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
        })
      : onSnapshot(query(collection(db, 'users'), where('companyId', '==', activeCompanyId)), (snapshot) => {
          const list: AppUser[] = [];
          snapshot.forEach(doc => list.push(doc.data() as AppUser));
          setUsers(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users?companyId=${activeCompanyId}`);
        });

    const targetDriverId = activeDriver?.id || firebaseUser.uid;
    const unsubLoads = activeRole === 'driver'
      ? onSnapshot(query(collection(db, 'admins', activeCompanyId, 'loads'), where('assignedDriverId', '==', targetDriverId)), (snapshot) => {
          const list: Load[] = [];
          snapshot.forEach(doc => list.push(doc.data() as Load));
          setLoads(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/loads?assignedDriverId=${targetDriverId}`);
        })
      : onSnapshot(collection(db, 'admins', activeCompanyId, 'loads'), (snapshot) => {
          const list: Load[] = [];
          snapshot.forEach(doc => list.push(doc.data() as Load));
          setLoads(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/loads`);
        });

    const unsubInvoices = activeRole === 'driver'
      ? () => {}
      : onSnapshot(collection(db, 'admins', activeCompanyId, 'invoices'), (snapshot) => {
          const list: Invoice[] = [];
          snapshot.forEach(doc => list.push(doc.data() as Invoice));
          setInvoices(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/invoices`);
        });

    const unsubNotifications = activeRole === 'super_admin'
      ? onSnapshot(collection(db, 'notifications'), (snapshot) => {
          const list: AppNotification[] = [];
          snapshot.forEach(doc => list.push(doc.data() as AppNotification));
          setNotifications(list.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'notifications');
        })
      : onSnapshot(query(collection(db, 'notifications'), where('forCompanyId', '==', activeCompanyId)), (snapshot) => {
          const list: AppNotification[] = [];
          snapshot.forEach(doc => list.push(doc.data() as AppNotification));
          setNotifications(list.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `notifications?forCompanyId=${activeCompanyId}`);
        });

    // Sync messages: General Communications
    const unsubGeneralMsgs = onSnapshot(collection(db, 'admins', activeCompanyId, 'general_communications'), (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach(doc => list.push(doc.data() as Message));
      setMessages(prev => {
        const loadMsgs = prev.filter(m => m.channel === 'load');
        const combined = [...list, ...loadMsgs];
        // Remove duplicates by ID
        const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
        return unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/general_communications`);
    });

    // Sync trucks: Fleet Power Units & PM Statuses
    const unsubTrucks = onSnapshot(collection(db, 'admins', activeCompanyId, 'trucks'), (snapshot) => {
      const list: Truck[] = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Truck));
      setTrucks(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/trucks`);
    });

    return () => {
      unsubCompanies();
      unsubUsers();
      unsubLoads();
      unsubInvoices();
      unsubNotifications();
      unsubGeneralMsgs();
      unsubTrucks();
    };
  }, [isProfileReady, firebaseUser, activeCompanyId, activeRole]);

  // Sync Load communications dynamically for in-transit/active loads
  useEffect(() => {
    if (!isProfileReady || !firebaseUser || firebaseUser.isSandbox || loads.length === 0) return;

    const activeLoads = loads.filter(l => {
      if (l.companyId !== activeCompanyId) return false;
      if (activeRole === 'driver') {
        const targetDriverId = activeDriver?.id || firebaseUser.uid;
        return l.assignedDriverId === targetDriverId;
      }
      return true;
    });
    const unsubscribes = activeLoads.map(load => {
      return onSnapshot(collection(db, 'admins', activeCompanyId, 'loads', load.id, 'communications'), (snapshot) => {
        const loadList: Message[] = [];
        snapshot.forEach(doc => loadList.push(doc.data() as Message));
        if (loadList.length > 0) {
          setMessages(prev => {
            const nonLoadMsgs = prev.filter(m => m.loadId !== load.id);
            const combined = [...nonLoadMsgs, ...loadList];
            const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
            return unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `admins/${activeCompanyId}/loads/${load.id}/communications`);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [isProfileReady, firebaseUser, loads, activeCompanyId]);

  // Auth Operations
  const handleSignInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google Authenticated Sign-In Failed: ", error);
      
      const isPopupClosed = error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed');
      const isPopupBlocked = error?.code === 'auth/popup-blocked' || error?.message?.includes('popup-blocked');
      
      if (isPopupClosed || isPopupBlocked) {
        const popupWarning: AppNotification = {
          id: `notif_popup_blocked_${Date.now()}`,
          title: 'Google Auth Popup Restricted',
          message: 'The Google Sign-In popup was closed or blocked by the sandboxed preview browser. Click "Guest Cloud Sync" to connect instantly without popups!',
          type: 'warning',
          timestamp: new Date().toISOString(),
          read: false,
          forRole: 'all'
        };
        handleUpdateNotifications([popupWarning, ...notifications]);
      }
    }
  };

  const handleLocalSandbox = () => {
    const sandboxUser = {
      uid: 'sandbox_super_admin',
      displayName: 'Marcus Vance (Sandbox)',
      email: 'admin@dispatchpro.com',
      isAnonymous: false,
      isSandbox: true,
    };
    setFirebaseUser(sandboxUser);
    setActiveRole('super_admin');
    setIsProfileReady(true);
  };

  const handleSignInAnonymously = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error("Anonymous Sign-In Failed: ", error);
      if (error?.code === 'auth/operation-not-allowed') {
        handleLocalSandbox();
      }
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthErrorMsg(null);
      await signOut(auth);
      setFirebaseUser(null);
      setIsProfileReady(false);
    } catch (error) {
      console.error("Sign-Out Failed: ", error);
    }
  };

  // 2. Synchronize State changes back to LocalStorage
  const saveToStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleUpdateCompanies = async (updated: Company[]) => {
    const changed = updated.filter(co => {
      const existing = companies.find(c => c.id === co.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(co);
    });

    setCompanies(updated);
    saveToStorage(STORAGE_KEYS.COMPANIES, updated);

    if (auth.currentUser && changed.length > 0) {
      for (const co of changed) {
        try {
          await trackWrite(async () => {
            await setDoc(doc(db, 'companies', co.id), co);
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `companies/${co.id}`);
        }
      }
    }
  };

  const handleUpdateUsers = async (updated: AppUser[]) => {
    const changed = updated.filter(u => {
      const existing = users.find(x => x.id === u.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(u);
    });

    setUsers(updated);
    saveToStorage(STORAGE_KEYS.USERS, updated);

    if (auth.currentUser && changed.length > 0) {
      for (const u of changed) {
        try {
          await trackWrite(async () => {
            await setDoc(doc(db, 'users', u.id), u);
            if (u.role === 'driver' && u.companyId) {
              await setDoc(doc(db, 'admins', u.companyId, 'drivers', u.id), u);
            } else if (u.role === 'dispatcher' && u.companyId) {
              await setDoc(doc(db, 'admins', u.companyId, 'dispatchers', u.id), u);
            }
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${u.id}`);
        }
      }
    }
  };

  const handleUpdateLoads = async (updated: Load[]) => {
    const processedUpdated = updated.map(l => {
      const existing = loads.find(x => x.id === l.id);
      if (l.status === 'delivered' && existing && existing.status !== 'delivered') {
        // Compile all chat messages for this load from local state (sorted chronologically)
        const loadMessages = [...messages]
          .filter(m => m.channel === 'load' && m.loadId === l.id)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        if (loadMessages.length > 0) {
          const chatLog = loadMessages.map(m => {
            const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const attachStr = m.attachmentName ? ` [Attachment: ${m.attachmentName}]` : '';
            return `[${timeStr}] ${m.senderName}: ${m.text}${attachStr}`;
          }).join('\n');

          const logHeader = `\n\n--- DELIVERED CHAT LOG ---\n${chatLog}`;
          // Only append if not already appended
          if (!l.notes || !l.notes.includes('--- DELIVERED CHAT LOG ---')) {
            const finalNotes = l.notes 
              ? `${l.notes}${logHeader}`
              : `--- DELIVERED CHAT LOG ---\n${chatLog}`;
            return { ...l, notes: finalNotes };
          }
        }
      } else if (l.status !== 'delivered' && existing && existing.status === 'delivered') {
        // Strip the delivered chat log block from the notes if it exists
        if (l.notes && l.notes.includes('--- DELIVERED CHAT LOG ---')) {
          const cleanedNotes = l.notes.split('\n\n--- DELIVERED CHAT LOG ---')[0];
          return { ...l, notes: cleanedNotes.trim() };
        }
      }
      return l;
    });

    const changed = processedUpdated.filter(l => {
      const existing = loads.find(x => x.id === l.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(l);
    });

    setLoads(processedUpdated);
    saveToStorage(STORAGE_KEYS.LOADS, processedUpdated);

    if (auth.currentUser && changed.length > 0) {
      for (const l of changed) {
        try {
          const existing = loads.find(x => x.id === l.id);
          await trackWrite(async () => {
            if (!existing) {
              // Send full load object with all required fields for creation
              const fullLoad = sanitizeFirestoreData({
                id: l.id,
                loadNumber: l.loadNumber || `APX-${Date.now()}`,
                companyId: l.companyId || activeCompanyId,
                status: l.status || 'booked',
                cargoType: l.cargoType || 'General Freight',
                weight: sanitizeNumber(l.weight, 0),
                value: sanitizeNumber(l.value, 0),
                rate: sanitizeNumber(l.rate, 0),
                urgent: l.urgent ?? false,
                pickup: l.pickup,
                delivery: l.delivery,
                gpsConsentAccepted: l.gpsConsentAccepted ?? false,
                gpsTrackingRequired: l.gpsTrackingRequired ?? false,
                gpsTrackingRequestedBy: l.gpsTrackingRequestedBy ?? null,
                gpsConsentAcceptedBy: l.gpsConsentAcceptedBy ?? null,
                gpsConsentAcceptedAt: l.gpsConsentAcceptedAt ?? null,
                gpsHistory: l.gpsHistory ?? [],
                companyName: l.companyName ?? "",
                carrierName: l.carrierName ?? "",
                temperature: l.temperature ?? "",
                assignedDriverId: l.assignedDriverId ?? "",
                assignedDispatcherId: l.assignedDispatcherId ?? "",
                notes: l.notes ?? "",
                currentGps: l.currentGps ?? null,
                podUrl: l.podUrl ?? "",
                podUploadedAt: l.podUploadedAt ?? "",
                podFileName: l.podFileName ?? "",
                flagged: l.flagged ?? false,
                pickups: l.pickups ?? [],
                deliveries: l.deliveries ?? [],
                podStatus: l.podStatus ?? "pending",
                rcNumber: l.rcNumber ?? "",
                dispatchedBy: l.dispatchedBy ?? "",
                createdAt: l.createdAt ?? null
              });
              await setDoc(doc(db, 'admins', l.companyId || activeCompanyId, 'loads', l.id), fullLoad);
            } else {
              // Send only changed fields for update
              const rawPartialFields: any = {};
              const keys = Array.from(new Set([...Object.keys(existing), ...Object.keys(l)]));
              for (const key of keys) {
                const valExisting = (existing as any)[key];
                const valNew = (l as any)[key];
                if (JSON.stringify(valExisting) !== JSON.stringify(valNew)) {
                  if (key === 'weight' || key === 'value' || key === 'rate') {
                    rawPartialFields[key] = sanitizeNumber(valNew, 0);
                  } else {
                    rawPartialFields[key] = valNew !== undefined ? valNew : null;
                  }
                }
              }
              const partialFields = sanitizeFirestoreData(rawPartialFields);
              if (Object.keys(partialFields).length > 0) {
                const loadRef = doc(db, 'admins', l.companyId || activeCompanyId, 'loads', l.id);
                await updateDoc(loadRef, partialFields);
              }
            }
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `admins/${l.companyId}/loads/${l.id}`);
        }
      }
    }
  };

  const handleUpdateMessages = async (updated: Message[]) => {
    const changed = updated.filter(m => {
      const existing = messages.find(x => x.id === m.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(m);
    });

    setMessages(updated);
    saveToStorage(STORAGE_KEYS.MESSAGES, updated);

    if (auth.currentUser && changed.length > 0) {
      for (const m of changed) {
        try {
          const messageData = {
            id: m.id,
            channel: m.channel,
            companyId: m.companyId,
            senderId: m.senderId,
            senderName: m.senderName,
            senderRole: m.senderRole,
            text: m.text,
            timestamp: m.timestamp,
            ...(m.loadId ? { loadId: m.loadId } : {}),
            ...(m.attachmentName ? { attachmentName: m.attachmentName } : {}),
            ...(m.attachmentUrl ? { attachmentUrl: m.attachmentUrl } : {}),
          };
          
          console.log("Saving exact messageData before writing to Firestore:", JSON.stringify(messageData, null, 2));

          await trackWrite(async () => {
            if (messageData.channel === 'general') {
              await setDoc(doc(db, 'admins', messageData.companyId, 'general_communications', messageData.id), messageData);
            } else if (messageData.channel === 'load' && messageData.loadId) {
              await setDoc(doc(db, 'admins', messageData.companyId, 'loads', messageData.loadId, 'communications', messageData.id), messageData);
            }
          });
        } catch (e) {
          const actualPath = m.channel === 'general'
            ? `admins/${m.companyId}/general_communications/${m.id}`
            : `admins/${m.companyId}/loads/${m.loadId}/communications/${m.id}`;
          handleFirestoreError(e, OperationType.WRITE, actualPath);
        }
      }
    }
  };

  const handleUpdateInvoices = async (updated: Invoice[]) => {
    const changed = updated.filter(inv => {
      const existing = invoices.find(x => x.id === inv.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(inv);
    });

    setInvoices(updated);
    saveToStorage(STORAGE_KEYS.INVOICES, updated);

    if (auth.currentUser && changed.length > 0) {
      for (const inv of changed) {
        try {
          await trackWrite(async () => {
            await setDoc(doc(db, 'admins', inv.companyId, 'invoices', inv.id), inv);
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `admins/${inv.companyId}/invoices/${inv.id}`);
        }
      }
    }
  };

  const handleUpdateNotifications = async (updated: AppNotification[]) => {
    const changed = updated.filter(n => {
      const existing = notifications.find(x => x.id === n.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(n);
    });

    setNotifications(updated);
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, updated);

    if (auth.currentUser && changed.length > 0) {
      for (const n of changed) {
        try {
          await trackWrite(async () => {
            await setDoc(doc(db, 'notifications', n.id), n);
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `notifications/${n.id}`);
        }
      }
    }
  };

  // 2.5 Simulation Interval and Event handlers
  useEffect(() => {
    if (!isAutoGpsActive) return;

    const interval = setInterval(async () => {
      const currentLoads = loadsRef.current;
      const loadObj = currentLoads.find(l => 
        l.companyId === activeCompanyId && 
        l.status === 'in_transit' && 
        l.gpsTrackingRequired !== false && 
        l.gpsConsentAccepted === true
      );
      if (!loadObj) return;

      let startCity = loadObj.pickup.facilityName.includes('Houston') ? 'Houston' : 'Chicago';
      let endCity = loadObj.delivery.facilityName.includes('Dallas') ? 'Dallas' : 'LosAngeles';
      if (loadObj.pickup.facilityName.includes('Gary')) {
        startCity = 'Chicago';
      }
      if (loadObj.delivery.facilityName.includes('St. Louis')) {
        endCity = 'Dallas';
      }

      const startCoord = HUB_COORDINATES[startCity as keyof typeof HUB_COORDINATES] || HUB_COORDINATES.Houston;
      const endCoord = HUB_COORDINATES[endCity as keyof typeof HUB_COORDINATES] || HUB_COORDINATES.Dallas;

      const currentPointsCount = loadObj.gpsHistory.length;
      const nextPercentage = Math.min(100, (currentPointsCount + 1) * 15);
      
      const fraction = nextPercentage / 100;
      const arc = Math.sin(fraction * Math.PI) * 1.5;
      const lat = startCoord.lat + (endCoord.lat - startCoord.lat) * fraction + arc * 0.12;
      const lng = startCoord.lng + (endCoord.lng - startCoord.lng) * fraction - arc * 0.05;

      const nextGpsPoint = {
        lat,
        lng,
        timestamp: new Date().toISOString(),
      };

      const updatedGpsHistory = [...loadObj.gpsHistory, nextGpsPoint];

      const updatedLoad = {
        ...loadObj,
        currentGps: nextGpsPoint,
        gpsHistory: updatedGpsHistory,
      };

      const updated = currentLoads.map(l => l.id === loadObj.id ? updatedLoad : l);

      // Update state
      setLoads(updated);
      // Update local storage fallback
      saveToStorage(STORAGE_KEYS.LOADS, updated);

      // Sync to Firebase Firestore in real-time
      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, 'admins', loadObj.companyId, 'loads', loadObj.id), {
            currentGps: nextGpsPoint,
            gpsHistory: updatedGpsHistory
          });
        } catch (e) {
          console.error("Failed to sync simulated GPS telemetry to Firestore: ", e);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAutoGpsActive, activeCompanyId]);

  // 2.6 Real Geolocation API (watchPosition) for Driver Active Load Tracking
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation || !auth.currentUser) return;

    // Check if there is an in-transit load assigned to this driver that has GPS consent accepted
    const currentLoads = loads;
    const driverId = auth.currentUser.uid;
    const activeDriverLoad = currentLoads.find(l => 
      l.assignedDriverId === driverId && 
      l.status === 'in_transit' && 
      l.gpsTrackingRequired !== false && 
      l.gpsConsentAccepted === true
    );

    if (!activeDriverLoad) return;

    // Set up tracking options with high accuracy as required
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000,
    };

    let lastLoggedTime = 0;
    let lastLoggedLat = 0;
    let lastLoggedLng = 0;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, speed, heading } = position.coords;
        const now = Date.now();

        // Throttling criteria:
        // - At least 15 seconds have passed
        // - OR distance moved is meaningful (e.g. > 0.0001 deg, about 11m)
        const timeElapsed = now - lastLoggedTime;
        const distMoved = Math.abs(latitude - lastLoggedLat) + Math.abs(longitude - lastLoggedLng);

        if (lastLoggedTime !== 0 && timeElapsed < 15000 && distMoved < 0.0001) {
          // Skip reporting to conserve battery/bandwidth
          return;
        }

        lastLoggedTime = now;
        lastLoggedLat = latitude;
        lastLoggedLng = longitude;

        const nextGpsPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: new Date().toISOString(),
          speed: speed ?? undefined,
          heading: heading ?? undefined,
        };

        // 1. Update Firestore Locations Subcollection
        const adminId = activeDriverLoad.companyId;
        const loadId = activeDriverLoad.id;
        try {
          const pointRef = doc(collection(db, 'admins', adminId, 'loads', loadId, 'locations'));
          await setDoc(pointRef, nextGpsPoint);
        } catch (err) {
          console.error("Failed to write live GPS point to Firestore:", err);
        }

        // 2. Update parent load document with current position & history for backwards compatibility
        const currentLoadLatest = loadsRef.current.find(l => l.id === loadId);
        if (currentLoadLatest) {
          const updatedHistory = [...(currentLoadLatest.gpsHistory || []), nextGpsPoint];
          const updatedLoad = {
            ...currentLoadLatest,
            currentGps: nextGpsPoint,
            gpsHistory: updatedHistory,
          };
          const updated = loadsRef.current.map(l => l.id === loadId ? updatedLoad : l);
          setLoads(updated);
          saveToStorage(STORAGE_KEYS.LOADS, updated);

          try {
            await updateDoc(doc(db, 'admins', adminId, 'loads', loadId), {
              currentGps: nextGpsPoint,
              gpsHistory: updatedHistory
            });
          } catch (err) {
            console.error("Failed to sync load GPS details to Firestore:", err);
          }
        }
      },
      (error) => {
        console.warn("Geolocation watchPosition error:", error.message);
      },
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [loads, activeCompanyId, firebaseUser]);

  const handleToggleAutoGps = (loadId: string) => {
    setIsAutoGpsActive(prev => !prev);
  };

  const handleSimulateIncomingMessage = (text: string, role: 'driver' | 'dispatcher') => {
    const companyUsers = users.filter(u => u.companyId === activeCompanyId);
    const targetUser = companyUsers.find(u => u.role === role);
    const senderId = targetUser?.id || `sim_${role}_${Date.now()}`;
    const senderName = targetUser?.name || (role === 'driver' ? 'Jack Nelson (Driver)' : 'Tom Miller (Dispatcher)');

    const inTransitLoad = loads.find(l => l.companyId === activeCompanyId && l.status === 'in_transit');
    const loadId = inTransitLoad?.id || loads.find(l => l.companyId === activeCompanyId)?.id;

    const newMsg: Message = {
      id: `msg_sim_${Date.now()}`,
      loadId,
      channel: inTransitLoad ? 'load' : 'general',
      companyId: activeCompanyId,
      senderId,
      senderName,
      senderRole: role,
      text,
      timestamp: new Date().toISOString(),
    };

    handleUpdateMessages([newMsg, ...messages]);

    const newNotif: AppNotification = {
      id: `notif_sim_msg_${Date.now()}`,
      title: `Message from ${role === 'driver' ? 'Driver Nelson' : 'Tom Miller (Dispatcher)'}`,
      message: text.substring(0, 70) + (text.length > 70 ? '...' : ''),
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: role === 'driver' ? 'dispatcher' : 'driver',
      forCompanyId: activeCompanyId,
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  const handleSimulateNewTenant = () => {
    const newCompany: Company = {
      id: `co_titan_${Date.now()}`,
      name: 'Titan Heavy Haul',
      dotNumber: 'DOT-2901923',
      contactEmail: 'safety@titanhaul.com',
      contactPhone: '(555) 902-1823',
      address: '400 Heavy Freight Way, Gary, IN',
      status: 'pending',
      plan: 'Basic',
      stripeCustomerId: 'cus_titan_sim_1',
      joinedDate: new Date().toISOString().split('T')[0],
    };

    handleUpdateCompanies([...companies, newCompany]);

    const newNotif: AppNotification = {
      id: `notif_tenant_sim_${Date.now()}`,
      title: 'New Carrier DOT Compliance Audit Required',
      message: 'Company "Titan Heavy Haul" submitted DOT FMCSA registration papers. Super Admin verification pending.',
      type: 'warning',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'super_admin'
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  const handleSimulateStripeWebhook = () => {
    handleUpgradePlan('Premium');
  };

  const handleSimulateRoadHazard = (city: string) => {
    const hazards = [
      `Severe flash flood watch active on Interstate corridor near ${city}. CDL operators reduce speed below 45mph.`,
      `DOT truck weigh station mandatory safety enforcement active outside ${city}. Expect delays.`,
      `Major freight lane construction and lane closures on major loop around ${city}. Diversion route advised.`,
    ];
    const hazardMessage = hazards[Math.floor(Math.random() * hazards.length)];
    handleSendGlobalBroadcast(`Road & Weather Hazard Warning (${city})`, hazardMessage);
  };

  // 3. Admin / Super Admin actions
  const handleApproveCompany = (companyId: string) => {
    const updated = companies.map(co => co.id === companyId ? { ...co, status: 'active' as const } : co);
    handleUpdateCompanies(updated);

    // Create a global notification
    const companyName = companies.find(c => c.id === companyId)?.name || 'New Tenant';
    const newNotif: AppNotification = {
      id: `notif_${Date.now()}`,
      title: 'FMCSA DOT Compliance Approved',
      message: `Company "${companyName}" successfully verified DOT compliance background. SaaS access activated.`,
      type: 'success',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'all',
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  const handleOnboardTenant = async (tenant: { name: string; contactEmail: string; contactName: string; dotNumber: string; plan: 'Basic' | 'Premium'; offerTrial?: boolean }) => {
    if (!auth.currentUser) {
      alert("Error: You must be logged in as a Super Admin to onboard tenants.");
      return;
    }

    let generatedCoId = `co_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let uid = `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let fallbackToClient = false;
    let fallbackReason = "";
    const isTrial = tenant.offerTrial !== false;
    const nowIso = new Date().toISOString();
    const trialEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    try {
      // 1. Get current Super Admin ID token
      const idToken = await auth.currentUser.getIdToken();

      // 2. Make API call to our new secure server-side onboarding endpoint
      const response = await fetch("/api/admin/create-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          name: tenant.name,
          contactEmail: tenant.contactEmail,
          contactName: tenant.contactName,
          dotNumber: tenant.dotNumber,
          plan: tenant.plan,
          offerTrial: isTrial,
          portalUrl: window.location.origin
        })
      });

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      if (contentType.includes("text/html") || text.includes("<html") || text.includes("<!DOCTYPE html>")) {
        fallbackReason = "Browser third-party cookie restrictions in the embedded preview iframe.";
        fallbackToClient = true;
        console.warn("Tenant onboarding returned HTML (iframe cookie block). Falling back to client-side Firestore tenant creation.");
      } else if (!response.ok) {
        let errMsg = "Failed to onboard tenant via server-side API";
        try {
          const errData = JSON.parse(text);
          errMsg = errData.error || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      } else {
        try {
          const result = JSON.parse(text);
          console.log("Tenant onboarded successfully:", result);
          generatedCoId = result.companyId;
          uid = result.userId;
        } catch (e) {
          fallbackReason = "Invalid JSON response from onboarding API.";
          fallbackToClient = true;
        }
      }
    } catch (error: any) {
      console.error("Failed server-side tenant onboarding:", error);
      fallbackReason = error.message || String(error);
      fallbackToClient = true;
    }

    const normalizedEmail = tenant.contactEmail.toLowerCase().trim();

    const newCompany: Company = {
      id: generatedCoId,
      name: tenant.name,
      dotNumber: tenant.dotNumber,
      address: '',
      contactEmail: normalizedEmail,
      contactPhone: '',
      plan: tenant.plan,
      status: 'pending',
      subscriptionStatus: isTrial ? 'trialing' : 'pending',
      paymentStatus: isTrial ? 'trialing' : 'pending',
      trialEnabled: isTrial,
      trialStart: isTrial ? nowIso : undefined,
      trialEnd: isTrial ? trialEndIso : undefined,
      stripeCustomerId: `cus_${Math.random().toString(36).substring(2, 10)}`,
      joinedDate: new Date().toISOString().split('T')[0],
      onboardingEmailsSent: 1,
      lastOnboardingEmailSent: new Date().toISOString(),
      invitationHistory: [
        {
          sentAt: new Date().toISOString(),
          sentBy: 'super_admin',
          email: normalizedEmail
        }
      ]
    };

    const preUser: AppUser = {
      id: uid,
      name: tenant.contactName,
      email: normalizedEmail,
      role: 'admin',
      status: 'active',
      phone: '',
      companyId: generatedCoId,
    };

    if (fallbackToClient) {
      try {
        // Save to Firestore directly using client-side SDK
        await handleUpdateCompanies([...companies, newCompany]);
        await handleUpdateUsers([...users, preUser]);
      } catch (e: any) {
        console.error("Failed client-side fallback write:", e);
      }
    } else {
      // Just keep local state in sync (snapshots will also trigger but this provides instant UI update)
      setCompanies([...companies, newCompany]);
      setUsers([...users, preUser]);
    }

    // Create a global notification
    const newNotif: AppNotification = {
      id: `notif_${Date.now()}`,
      title: 'New Fleet Tenant Onboarded',
      message: `Company "${tenant.name}" has been registered by Super Admin. Invited Administrator email: ${tenant.contactEmail}`,
      type: 'success',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'super_admin',
    };
    handleUpdateNotifications([newNotif, ...notifications]);

    if (fallbackToClient) {
      alert(
        `Notice: Due to third-party cookie restrictions or server-side configuration (${fallbackReason}) in the embedded preview, the secure server-side Auth account could not be initialized.\n\n` +
        `However, the tenant company "${tenant.name}" and admin user "${tenant.contactName}" have been successfully registered directly in Firestore so you can test company-admin login and onboarding!\n\n` +
        `To enable full email/password authentication, please click 'Open in New Tab' at the top-right of the preview and onboard the tenant there.`
      );
    } else {
      alert(`✓ Onboarding API Executed Successfully!\nCompany: ${tenant.name}\nAdmin: ${tenant.contactEmail}\n\nA secure password reset & setup invitation has been dispatched.`);
    }
  };

  const handleSuspendCompany = (companyId: string) => {
    const updated = companies.map(co => co.id === companyId ? { ...co, status: 'suspended' as const } : co);
    handleUpdateCompanies(updated);

    if (activeCompanyId === companyId) {
      const remainingActive = updated.find(co => co.status !== 'suspended');
      if (remainingActive) {
        setActiveCompanyId(remainingActive.id);
      }
    }
  };

  const handleUpdateCompany = async (companyId: string, updates: Partial<Company>) => {
    const updated = companies.map(co => co.id === companyId ? { ...co, ...updates } : co);
    await handleUpdateCompanies(updated);
  };

  const handleSendGlobalBroadcast = (title: string, message: string) => {
    const newNotif: AppNotification = {
      id: `notif_${Date.now()}`,
      title: `📢 GLOBAL BULLETIN: ${title}`,
      message,
      type: 'warning',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'all',
    };
    handleUpdateNotifications([newNotif, ...notifications]);

    // Post to all active general chat channels too!
    const broadcastMessages: Message[] = companies.map(co => ({
      id: `msg_broadcast_${co.id}_${Date.now()}`,
      channel: 'general',
      companyId: co.id,
      senderId: 'system_super_admin',
      senderName: 'Marcus Vance (Super Admin)',
      senderRole: 'super_admin',
      text: `[SYSTEM BULLETIN] ${title}: ${message}`,
      timestamp: new Date().toISOString()
    }));

    handleUpdateMessages([...broadcastMessages, ...messages]);
  };

  const handleTriggerEmailTest = async (recipient: string) => {
    const newNotif: AppNotification = {
      id: `notif_email_${Date.now()}`,
      title: 'SMTP Mail Event Dispatched',
      message: `Trigger Email extension queued mail transport log in /mail root for recipient: ${recipient}`,
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'super_admin'
    };
    handleUpdateNotifications([newNotif, ...notifications]);

    if (auth.currentUser) {
      const mailId = `mail_test_${Date.now()}`;
      try {
        await setDoc(doc(db, 'mail', mailId), {
          to: recipient,
          message: {
            subject: 'TruckDispatch SMTP Testing Relay Check',
            html: `<h3>TruckDispatch Pro - SMTP Testing Channel</h3><p>Your SMTP credentials and Firebase "Trigger Email" extension are operating perfectly.</p><p>Timestamp: ${new Date().toLocaleString()}</p>`
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `mail/${mailId}`);
      }
    }
  };

  const handleImpersonateCompany = (companyId: string) => {
    setActiveCompanyId(companyId);
    setActiveRole('admin');
  };

  const handleResendOnboardingEmail = async (companyId: string, email: string, name: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const currentCount = company.onboardingEmailsSent || 1;
    const currentHistory = company.invitationHistory || [
      {
        sentAt: company.lastOnboardingEmailSent || new Date().toISOString(),
        sentBy: 'super_admin',
        email: company.contactEmail
      }
    ];
    const newHistoryEntry = {
      sentAt: new Date().toISOString(),
      sentBy: 'super_admin',
      email: email
    };
    const updatedCos = companies.map(c => c.id === companyId ? {
      ...c,
      onboardingEmailsSent: currentCount + 1,
      lastOnboardingEmailSent: new Date().toISOString(),
      invitationHistory: [...currentHistory, newHistoryEntry]
    } : c);

    await handleUpdateCompanies(updatedCos);

    const newNotif: AppNotification = {
      id: `notif_resend_${Date.now()}`,
      title: '✓ Onboarding Email Re-dispatched',
      message: `Onboarding instructions successfully sent to "${email}" for company "${company.name}". (Dispatch Count: ${currentCount + 1})`,
      type: 'success',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'super_admin',
    };
    handleUpdateNotifications([newNotif, ...notifications]);

    if (auth.currentUser) {
      const mailId = `mail_resend_onboard_${Date.now()}`;
      const portalUrl = window.location.origin;
      try {
        await setDoc(doc(db, 'mail', mailId), {
          to: email,
          message: {
            subject: 'Welcome to TruckDispatch Pro - Your Tenant Portal is Ready!',
            html: `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px; text-align: center;">
                  <h1 style="color: #4f46e5; font-size: 24px; margin: 0; font-weight: 700;">TruckDispatch Pro</h1>
                  <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">SaaS Enterprise Portal</span>
                </div>
                
                <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Welcome, ${name}!</h2>
                
                <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                  Your carrier fleet tenant space for <strong>${company.name}</strong> has been successfully provisioned. This is a duplicate copy of your onboarding credentials requested by the administrator.
                </p>
                
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <h3 style="margin-top: 0; font-size: 14px; color: #4f46e5; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">📋 Tenant Configuration Profile:</h3>
                  <table style="width: 100%; font-size: 13px; color: #4e5d78; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 4px 0; font-weight: 600;">Carrier Fleet:</td>
                      <td style="padding: 4px 0; text-align: right; color: #0f172a;">${company.name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; font-weight: 600;">FMCSA DOT #:</td>
                      <td style="padding: 4px 0; text-align: right; color: #0f172a; font-family: monospace;">${company.dotNumber}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; font-weight: 600;">SaaS Subscription:</td>
                      <td style="padding: 4px 0; text-align: right; color: #0f172a;"><span style="background-color: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${company.plan}</span></td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; font-weight: 600;">Admin Email Address:</td>
                      <td style="padding: 4px 0; text-align: right; color: #4f46e5; font-weight: 600;">${email}</td>
                    </tr>
                  </table>
                </div>

                <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; background-color: #fffbeb; margin-bottom: 20px;">
                  <h3 style="margin-top: 0; font-size: 14px; color: #b45309;">🔑 Account Activation Credentials & Instructions:</h3>
                  <p style="font-size: 13px; margin: 5px 0 12px 0; line-height: 1.5; color: #78350f;">
                    Because self-registration is strictly restricted to pre-authorized logistics nodes, you must complete your setup using your invited email:
                  </p>
                  <ol style="font-size: 13px; line-height: 1.6; color: #451a03; padding-left: 20px; margin: 0;">
                    <li>Go to the <strong>Sign In</strong> interface.</li>
                    <li>Click on the <strong>Register / Activate Invitation</strong> tab.</li>
                    <li>Fill in your Full Name (<strong>${name}</strong>) and your Registered Email (<strong>${email}</strong>).</li>
                    <li>Choose a secure password and submit the form to instantly activate your Fleet Administration Panel.</li>
                  </ol>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${portalUrl}?inviteEmail=${email}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2), 0 2px 4px -1px rgba(79, 70, 229, 0.1); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                    Go to Portal & Activate Account
                  </a>
                  <p style="font-size: 11px; color: #64748b; margin-top: 10px;">
                    Or copy & paste this link into your browser:<br/>
                    <a href="${portalUrl}?inviteEmail=${email}" style="color: #4f46e5; text-decoration: underline;">${portalUrl}?inviteEmail=${email}</a>
                  </p>
                </div>

                <div style="text-align: center; margin-top: 25px; border-top: 1px solid #f1f5f9; pt: 15px;">
                  <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                    This is a secure automated system transmission. Do not forward.
                  </p>
                </div>
              </div>
            `
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `mail/${mailId}`);
      }
    }
  };

  const handleResetOnboardingEmailCount = async (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const updatedCos = companies.map(c => c.id === companyId ? {
      ...c,
      onboardingEmailsSent: 1,
      lastOnboardingEmailSent: new Date().toISOString(),
      invitationHistory: [
        {
          sentAt: new Date().toISOString(),
          sentBy: 'super_admin',
          email: c.contactEmail
        }
      ]
    } : c);

    await handleUpdateCompanies(updatedCos);

    const newNotif: AppNotification = {
      id: `notif_reset_onboard_${Date.now()}`,
      title: '✓ Onboarding History Reset',
      message: `Onboarding dispatch count successfully reset to 1 for "${company.name}".`,
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'super_admin',
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  const handleClearAllData = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset Application Database',
      message: 'Are you sure you want to completely clear all dummy companies, loads, messages, invoices, notifications, and non-admin users from both local storage and Firestore? This action is irreversible.',
      confirmText: 'Clear & Reset',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        console.log("Clearing all records from local storage and Firestore...");
        try {
          // 1. Clear Local Storage keys
          Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
          
          // 2. Clear state variables (empty arrays)
          setCompanies([]);
          setLoads([]);
          setMessages([]);
          setInvoices([]);
          setNotifications([]);
          
          // Keep only current logged-in user or active super admin in users
          if (auth.currentUser) {
            const activeUserId = auth.currentUser.uid;
            const currentProfile = users.find(u => u.id === activeUserId);
            if (currentProfile) {
              setUsers([currentProfile]);
              saveToStorage(STORAGE_KEYS.USERS, [currentProfile]);
            } else {
              setUsers([]);
            }
          } else {
            setUsers([]);
          }

          // 3. Clear Firestore collections if connected and logged-in
          if (auth.currentUser) {
            // Delete Companies
            const cosSnap = await getDocs(collection(db, 'companies'));
            for (const docObj of cosSnap.docs) {
              await deleteDoc(docObj.ref);
            }

            // Delete Users (except the current user!)
            const usersSnap = await getDocs(collection(db, 'users'));
            for (const docObj of usersSnap.docs) {
              if (docObj.id !== auth.currentUser.uid) {
                await deleteDoc(docObj.ref);
              }
            }

            // Delete Notifications
            const notifsSnap = await getDocs(collection(db, 'notifications'));
            for (const docObj of notifsSnap.docs) {
              await deleteDoc(docObj.ref);
            }

            // Delete Mail logs
            const mailSnap = await getDocs(collection(db, 'mail'));
            for (const docObj of mailSnap.docs) {
              await deleteDoc(docObj.ref);
            }

            // Clean up nested collections under each company
            for (const docObj of cosSnap.docs) {
              const coId = docObj.id;
              
              // Delete drivers
              const driversSnap = await getDocs(collection(db, 'admins', coId, 'drivers'));
              for (const s of driversSnap.docs) {
                await deleteDoc(s.ref);
              }

              // Delete dispatchers
              const dispatchersSnap = await getDocs(collection(db, 'admins', coId, 'dispatchers'));
              for (const s of dispatchersSnap.docs) {
                await deleteDoc(s.ref);
              }

              // Delete invoices
              const invoicesSnap = await getDocs(collection(db, 'admins', coId, 'invoices'));
              for (const s of invoicesSnap.docs) {
                await deleteDoc(s.ref);
              }

              // Delete loads & their communications
              const loadsSnap = await getDocs(collection(db, 'admins', coId, 'loads'));
              for (const s of loadsSnap.docs) {
                const loadId = s.id;
                const commsSnap = await getDocs(collection(db, 'admins', coId, 'loads', loadId, 'communications'));
                for (const c of commsSnap.docs) {
                  await deleteDoc(c.ref);
                }
                await deleteDoc(s.ref);
              }

              // Delete general communications
              const genCommsSnap = await getDocs(collection(db, 'admins', coId, 'general_communications'));
              for (const s of genCommsSnap.docs) {
                await deleteDoc(s.ref);
              }
            }
          }

          alert("✓ All dummy data and persistent storage records cleared successfully!");
        } catch (e) {
          console.error("Error clearing database: ", e);
          alert(`Error clearing database: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
  };

  const handleUpdateUserProfile = async (userId: string, profile: Partial<AppUser>) => {
    const userExists = users.some(u => u.id === userId);
    let updated: AppUser[];
    let userToSave: AppUser;

    if (userExists) {
      updated = users.map(u => u.id === userId ? { ...u, ...profile } : u);
      userToSave = updated.find(u => u.id === userId)!;
    } else {
      // Fallback profile construction if they aren't in users array yet
      const fallbackUser: AppUser = {
        id: userId,
        name: currentUserObj?.name || firebaseUser?.displayName || 'Nelson Vance (Driver)',
        email: firebaseUser?.email || 'driver@example.com',
        role: 'driver',
        status: 'active',
        phone: '(555) 019-2831',
        companyId: activeCompanyId || 'co_apex',
        dutyStatus: 'On Duty',
        truckNumber: 'TRK-9021',
        licenseNumber: 'CDL-TX-882910',
        ...profile
      };
      updated = [...users, fallbackUser];
      userToSave = fallbackUser;
    }

    setUsers(updated);
    saveToStorage(STORAGE_KEYS.USERS, updated);
    
    if (auth.currentUser && !userId.includes('mock') && !userId.includes('preview')) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch("/api/profile/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            targetUserId: userId,
            updates: profile
          })
        });

        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        if (contentType.includes("text/html") || text.includes("<html") || text.includes("<!DOCTYPE html>")) {
          throw new Error("Unable to update profile. Secure credentials cannot be processed in the current layout context. Please click 'Open in New Tab' and try again.");
        } else if (!response.ok) {
          let errorMsg = "Failed to update profile via secure API";
          try {
            const data = JSON.parse(text);
            if (data && data.error) errorMsg = data.error;
          } catch (pe) {}
          throw new Error(errorMsg);
        }
      } catch (e: any) {
        console.error("Profile update error: ", e);
        throw e;
      }
    }

    const newNotif: AppNotification = {
      id: `notif_profile_${Date.now()}`,
      title: '✓ Profile Settings Saved',
      message: `${userToSave?.name || 'User'}'s personal profile settings have been securely synchronized with the database.`,
      type: 'success',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: userToSave?.role === 'super_admin' ? 'super_admin' : 'all',
      forCompanyId: userToSave?.companyId,
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    const updated = users.filter(u => u.id !== userId);
    setUsers(updated);
    saveToStorage(STORAGE_KEYS.USERS, updated);

    if (auth.currentUser) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        if (userToDelete.companyId) {
          if (userToDelete.role === 'driver') {
            await deleteDoc(doc(db, 'admins', userToDelete.companyId, 'drivers', userId));
          } else if (userToDelete.role === 'dispatcher') {
            await deleteDoc(doc(db, 'admins', userToDelete.companyId, 'dispatchers', userId));
          }
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `users/${userId}`);
      }
    }

    const newNotif: AppNotification = {
      id: `notif_delete_${Date.now()}`,
      title: '🗑️ User Removed',
      message: `User ${userToDelete.name} has been permanently deleted from the carrier organization.`,
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'all',
      forCompanyId: userToDelete.companyId,
    };
    handleUpdateNotifications([newNotif, ...notifications]);
  };

  // 4. Company Admin specific actions
  const handleUpdateCompanyProfile = (profile: Partial<Company>) => {
    const updated = companies.map(co => co.id === activeCompanyId ? { ...co, ...profile } : co);
    handleUpdateCompanies(updated);
  };

  const handleAddUser = async (user: Omit<AppUser, 'id'>, password?: string) => {
    // 0. Check if email is already registered locally
    const emailLower = user.email.trim().toLowerCase();
    const existingUser = users.find(u => u.email.trim().toLowerCase() === emailLower);
    if (existingUser) {
      const errMsg = `This email address (${user.email}) is already registered in the platform for user "${existingUser.name}" with role "${existingUser.role}".`;
      alert(errMsg);
      throw new Error(errMsg);
    }

    let finalId = `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let isCreatedInAuth = false;
    let fallbackToClient = false;
    let fallbackReason = "";

    // 1. If in real mode and a password is provided, try creating via secure server-side onboarding API
    if (auth.currentUser && !firebaseUser?.isSandbox && password) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch("/api/admin/create-staff", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            name: user.name,
            email: user.email,
            password: password,
            role: user.role,
            companyId: user.companyId,
            phone: user.phone,
            licenseNumber: (user as any).licenseNumber,
            truckNumber: (user as any).truckNumber,
            ownerOperatorName: (user as any).ownerOperatorName,
            permissions: (user as any).permissions || (user as any).dispatcherPermissions,
          })
        });

        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        if (contentType.includes("text/html") || text.includes("<html") || text.includes("<!DOCTYPE html>")) {
          throw new Error("Secure authentication credentials cannot be safely processed within the frame due to iframe restrictions. Please click 'Open in New Tab' at the top-right of the preview and try again there.");
        } else if (!response.ok) {
          let errMsg = "Staff onboarding API failed";
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        } else {
          try {
            const resData = JSON.parse(text);
            finalId = resData.userId;
            isCreatedInAuth = true;
          } catch (e) {
            throw new Error("Invalid response received from onboarding API. Please try again.");
          }
        }
      } catch (authErr: any) {
        console.error("Failed server-side staff onboarding:", authErr);
        throw authErr;
      }
    } else {
      fallbackToClient = true;
    }

    if (fallbackToClient) {
      // Build the AppUser object (Sandbox / Fallback mode)
      const newUser: AppUser = {
        ...user,
        id: finalId,
      };

      // Write user profile to state & database
      await handleUpdateUsers([...users, newUser]);

      // Create and save a platform notification
      const newNotif: AppNotification = {
        id: `notif_add_user_${Date.now()}`,
        title: newUser.role === 'dispatcher' ? '👤 New Dispatcher Onboarded' : '👤 CDL Driver Onboarded',
        message: newUser.role === 'dispatcher' 
          ? `Dispatcher ${newUser.name} (${newUser.email}) has been successfully added to the carrier organization.`
          : `CDL Driver ${newUser.name} (Truck: ${newUser.truckNumber || 'N/A'}, CDL: ${newUser.licenseNumber || 'N/A'}) has been successfully added to the carrier organization.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'all',
        forCompanyId: newUser.companyId,
      };
      handleUpdateNotifications([newNotif, ...notifications]);

      // If we are in real mode but fell back, alert the user about the iframe limitation
      if (auth.currentUser && !firebaseUser.isSandbox && password) {
        alert(
          `Notice: Due to third-party cookie restrictions or server-side configuration (${fallbackReason}) in the embedded preview, the secure Auth account could not be initialized server-side.\n\n` +
          `However, the ${user.role} profile has been successfully registered directly in Firestore so you can assign loads and test the dashboard! To enable full mobile login, please click 'Open in New Tab' at the top-right of the preview and add the user there.`
        );
      }
    }
  };

  const handleUpgradePlan = (plan: 'Basic' | 'Premium') => {
    // 1. Upgrade company subscription state
    const updatedCos = companies.map(co => co.id === activeCompanyId ? { ...co, plan, status: 'active' as const } : co);
    handleUpdateCompanies(updatedCos);

    // 2. Generate new Stripe sync invoice
    const cost = plan === 'Basic' ? 59.99 : 159.99;
    const newInvoice: Invoice = {
      id: `stripe_inv_${Date.now()}`,
      invoiceNumber: `INV-${new Date().getFullYear()}-00${invoices.length + 1}`,
      companyId: activeCompanyId,
      amount: cost,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 2592000000).toISOString().split('T')[0], // 30 days later
      status: 'paid',
      isManual: false,
      description: `TruckDispatch Pro SaaS - ${plan} Tier Monthly Subscription (Paid via Stripe Checkout)`,
    };
    handleUpdateInvoices([newInvoice, ...invoices]);

    // 3. Create SaaS Alert for Super Admin & Company
    const companyName = companies.find(c => c.id === activeCompanyId)?.name || 'SaaS Customer';
    const alerts: AppNotification[] = [
      {
        id: `notif_upgrade_${Date.now()}_sa`,
        title: 'Subscription Revenue Synced',
        message: `Stripe successfully billed ${companyName} for ${plan} plan upgrade ($${cost}/mo). Webhook synced.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'super_admin'
      },
      {
        id: `notif_upgrade_${Date.now()}_co`,
        title: 'Billing Tier Upgraded',
        message: `Your company plan has been upgraded to ${plan} Tier! High-speed routing APIs are now unlocked.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'admin',
        forCompanyId: activeCompanyId
      }
    ];
    handleUpdateNotifications([...alerts, ...notifications]);
  };

  // 5. Dispatcher actions
  const handleAddLoad = async (load: Omit<Load, 'id' | 'loadNumber' | 'companyId' | 'gpsHistory' | 'gpsConsentAccepted' | 'status'> & { loadNumber?: string; rcNumber?: string; pickups?: Stop[]; deliveries?: Stop[] }) => {
    const finalLoadNumber = load.loadNumber || `APX-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const loadId = `load_${Date.now()}`;
    const defaultStop: Stop = {
      facilityName: '',
      address: '',
      dateTime: '',
      contactName: '',
      contactPhone: ''
    };
    const creationTime = new Date().toISOString();
    const newLoad: Load = {
      ...load,
      id: loadId,
      loadNumber: finalLoadNumber,
      rcNumber: load.rcNumber || finalLoadNumber,
      companyId: activeCompanyId,
      status: 'booked',
      cargoType: load.cargoType || 'General Freight',
      weight: Number(load.weight ?? 0),
      value: Number(load.value ?? 0),
      rate: Number(load.rate ?? 0),
      urgent: Boolean(load.urgent),
      pickup: load.pickup || load.pickups?.[0] || defaultStop,
      delivery: load.delivery || load.deliveries?.[load.deliveries.length - 1] || defaultStop,
      pickups: load.pickups || [],
      deliveries: load.deliveries || [],
      gpsConsentAccepted: false,
      gpsHistory: [],
      createdAt: creationTime
    };
    await handleUpdateLoads([newLoad, ...loads]);

    // Add initial log activity message
    handleSendMessage(loadId, 'load', `🚚 Load booked and added to the dispatch system.`);

    // Notify dispatch team
    const alert: AppNotification = {
      id: `notif_load_${Date.now()}`,
      title: 'New Freight Booking Scheduled',
      message: `Load ${finalLoadNumber} (${load.cargoType}) booked successfully. Ready for driver assignment.`,
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'dispatcher',
      forCompanyId: activeCompanyId
    };
    handleUpdateNotifications([alert, ...notifications]);
  };

  const handleAssignDriver = (loadId: string, driverId: string) => {
    let matchedTruck: Truck | undefined;
    const driverObj = users.find(u => u.id === driverId);
    if (driverObj) {
      const drvLifecycle = (driverObj.lifecycleStatus || driverObj.status || 'active').toLowerCase();
      const drvAccess = (driverObj.accessStatus || (drvLifecycle === 'active' ? 'active' : 'pending')).toLowerCase();

      if (drvLifecycle === 'onboarding' || driverObj.status === 'onboarding') {
        alert(`Cannot assign load: Driver ${driverObj.name} is in ONBOARDING status. Please complete onboarding and activate driver before operational dispatch.`);
        return;
      }
      if (drvLifecycle === 'suspended' || drvAccess === 'suspended') {
        alert(`Cannot assign load: Driver ${driverObj.name} account is SUSPENDED.`);
        return;
      }
      if (drvLifecycle === 'terminated' || drvLifecycle === 'inactive' || driverObj.status === 'inactive') {
        alert(`Cannot assign load: Driver ${driverObj.name} is ${drvLifecycle.toUpperCase()} and cannot be dispatched.`);
        return;
      }

      // Check open loads limit according to Multi-Load settings
      const existingOpenLoads = loads.filter(l => 
        l.assignedDriverId === driverId && 
        l.id !== loadId && 
        l.status !== 'delivered' && 
        l.status !== 'canceled'
      );

      const isMultiLoadAllowed = Boolean(driverObj.multiLoadEnabled);
      const maxOpenLoads = driverObj.maximumOpenLoads || 5;

      if (!isMultiLoadAllowed && existingOpenLoads.length >= 1) {
        alert(`Cannot assign load: Driver ${driverObj.name} already has an open load assigned. Enable 'Allow Multiple Loads' in driver settings to assign additional loads.`);
        return;
      }

      if (isMultiLoadAllowed && existingOpenLoads.length >= maxOpenLoads) {
        alert(`Cannot assign load: Driver ${driverObj.name} already has the maximum number of open loads (${maxOpenLoads}).`);
        return;
      }

      // PM GUARD CHECK: Check if driver's assigned power unit is PM overdue/due or blocked
      matchedTruck = trucks.find(t => 
        (driverObj.currentTruckId && t.id === driverObj.currentTruckId) ||
        (driverObj.truckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(driverObj.truckNumber).trim().toUpperCase()) ||
        (driverObj.assignedTruck && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(driverObj.assignedTruck).trim().toUpperCase())
      );

      if (matchedTruck) {
        const pmGuard = checkTruckPmGuard(matchedTruck);

        if (pmGuard.isBlocked) {
          alert(`⛔ DISPATCH BLOCKED BY PM GUARD POLICY\n\nCannot assign Driver ${driverObj.name} to load.\n\nPower Unit #${matchedTruck.truckNumber} is PM ${pmGuard.status.toUpperCase()} (${pmGuard.milesOverdue.toLocaleString()} mi overdue) and Fleet Policy is set to '${pmGuard.policy.toUpperCase()}'.\n\nTo dispatch this unit, please complete required PM service or clear block in Fleet Operations.`);
          return;
        }
      }
    }

    const nowIso = new Date().toISOString();
    const drvPmGuard = matchedTruck ? checkTruckPmGuard(matchedTruck) : null;
    const isPmWarning = Boolean(drvPmGuard && drvPmGuard.isOverdueOrDue);
    const activeUserObj = users.find(u => u.id === auth.currentUser?.uid);

    const updated = loads.map(l => {
      if (l.id === loadId) {
        if (!driverId) {
          // Unassign driver -> completely clear driver, truck assignment, and PM warning records on load
          return {
            ...l,
            assignedDriverId: '',
            assignedDriverNameSnapshot: '',
            assignedTruckId: null,
            assignedTruckNumber: '',
            assignedTruckVinSnapshot: '',
            truckDriverAssignmentId: null,
            assignmentCapturedAt: nowIso,
            driverAcceptanceStatus: 'pending' as const,
            pmWarningAcknowledged: false,
            pmWarningAcknowledgedBy: null,
            pmWarningAcknowledgedAt: null,
            pmWarningTruckNumber: null,
            pmWarningMilesOverdue: null
          };
        }
        return {
          ...l,
          assignedDriverId: driverId,
          assignedDriverNameSnapshot: driverObj.name || '',
          assignedTruckId: (driverObj as any)?.currentTruckId || matchedTruck?.id || null,
          assignedTruckNumber: (driverObj as any)?.currentTruckNumber || (driverObj as any)?.truckNumber || driverObj?.assignedTruck || matchedTruck?.truckNumber || '',
          assignedTruckVinSnapshot: (driverObj as any)?.currentTruckVin || matchedTruck?.vin || '',
          truckDriverAssignmentId: (driverObj as any)?.currentTruckAssignmentId || null,
          assignmentCapturedAt: nowIso,
          status: 'booked' as const,
          driverAcceptanceStatus: 'pending' as const,
          pmWarningAcknowledged: isPmWarning ? true : Boolean(l.pmWarningAcknowledged),
          pmWarningAcknowledgedBy: isPmWarning ? (activeUserObj?.name || 'Dispatcher') : (l.pmWarningAcknowledgedBy || null),
          pmWarningAcknowledgedAt: isPmWarning ? nowIso : (l.pmWarningAcknowledgedAt || null),
          pmWarningTruckNumber: isPmWarning && matchedTruck ? matchedTruck.truckNumber : (l.pmWarningTruckNumber || null),
          pmWarningMilesOverdue: isPmWarning && drvPmGuard ? drvPmGuard.milesOverdue : (l.pmWarningMilesOverdue || null)
        };
      }
      return l;
    });
    handleUpdateLoads(updated);

    const loadObj = loads.find(l => l.id === loadId);
    
    // Phase 1: Automated Email & SMS Dispatch Notification Alert
    if (driverObj) {
      sendDriverNotificationAlert({
        driverId: driverObj.id,
        driverName: driverObj.name,
        driverEmail: driverObj.email,
        driverPhone: driverObj.phone,
        loadNumber: loadObj?.loadNumber || '',
        title: 'New Dispatch Assignment',
        message: `You have been assigned to Load #${loadObj?.loadNumber || 'New Load'} (${loadObj?.cargoType || 'Freight'}). Pickup: ${loadObj?.pickup?.facilityName || 'Origin'}, Dropoff: ${loadObj?.delivery?.facilityName || 'Destination'}.`,
        type: 'assignment',
        companyId: activeCompanyId,
      }).catch(err => console.warn('Driver alert dispatch issue:', err));
    }

    // Notify Driver ELD and Dispatcher
    const alerts: AppNotification[] = [
      {
        id: `notif_assign_drv_${Date.now()}`,
        title: 'Driver Assignment Confirmed',
        message: `Driver ${driverObj?.name || 'CDL Operator'} assigned to Load ${loadObj?.loadNumber}.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'dispatcher',
        forCompanyId: activeCompanyId
      },
      {
        id: `notif_assign_ld_${Date.now()}`,
        title: 'New Dispatch Schedule',
        message: `You have been dispatched to haul Load ${loadObj?.loadNumber} (${loadObj?.cargoType}). Acknowledge to roll.`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'driver',
        forCompanyId: activeCompanyId
      }
    ];
    handleUpdateNotifications([...alerts, ...notifications]);
  };

  const handleUpdateLoad = (loadId: string, updates: Partial<Load>) => {
    const updated = loads.map(l => l.id === loadId ? { ...l, ...updates } : l);
    handleUpdateLoads(updated);
  };

  const handleUpdateLoadStatus = (loadId: string, status: LoadStatus) => {
    // PM GUARD CHECK: Verify assigned truck status before dispatching or setting in_transit
    const statusStr = String(status);
    if (statusStr === 'dispatched' || statusStr === 'in_transit' || statusStr === 'at_pickup') {
      const targetLoad = loads.find(l => l.id === loadId);
      if (targetLoad && targetLoad.assignedDriverId) {
        const driverObj = users.find(u => u.id === targetLoad.assignedDriverId);
        const matchedTruck = trucks.find(t => 
          (targetLoad.assignedTruckId && t.id === targetLoad.assignedTruckId) ||
          (driverObj?.currentTruckId && t.id === driverObj.currentTruckId) ||
          (targetLoad.assignedTruckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(targetLoad.assignedTruckNumber).trim().toUpperCase()) ||
          (driverObj?.truckNumber && t.truckNumber && String(t.truckNumber).trim().toUpperCase() === String(driverObj.truckNumber).trim().toUpperCase())
        );

        if (matchedTruck) {
          const pmGuard = checkTruckPmGuard(matchedTruck);

          if (pmGuard.isBlocked) {
            window.alert(`⛔ DISPATCH BLOCKED BY PM GUARD POLICY\n\nCannot update Load #${targetLoad.loadNumber} to ${status.toUpperCase().replace('_', ' ')}.\n\nPower Unit #${matchedTruck.truckNumber} is PM ${pmGuard.status.toUpperCase()} (${pmGuard.milesOverdue.toLocaleString()} mi overdue) and Fleet Policy is '${pmGuard.policy.toUpperCase()}'.\n\nPlease log completed PM maintenance in Fleet Operations first.`);
            return;
          }

          if (pmGuard.isOverdueOrDue && pmGuard.policy !== 'none') {
            const confirmed = window.confirm(
              `⚠️ PREVENTIVE MAINTENANCE WARNING\n\nPower Unit #${matchedTruck.truckNumber} assigned to Load #${targetLoad.loadNumber} is PM ${pmGuard.status.toUpperCase()} (${pmGuard.milesOverdue.toLocaleString()} mi overdue).\n\nAre you sure you want to change load status to ${status.toUpperCase().replace('_', ' ')}?`
            );
            if (!confirmed) return;
          }
        }
      }
    }

    const updated = loads.map(l => l.id === loadId ? { ...l, status } : l);
    handleUpdateLoads(updated);

    const loadObj = loads.find(l => l.id === loadId);
    const driverObj = loadObj?.assignedDriverId ? users.find(u => u.id === loadObj.assignedDriverId) : null;

    if (driverObj) {
      sendDriverNotificationAlert({
        driverId: driverObj.id,
        driverName: driverObj.name,
        driverEmail: driverObj.email,
        driverPhone: driverObj.phone,
        loadNumber: loadObj?.loadNumber || '',
        title: `Load Status Updated: ${status.toUpperCase().replace('_', ' ')}`,
        message: `Load #${loadObj?.loadNumber} status has been updated to ${status.toUpperCase().replace('_', ' ')}.`,
        type: 'status_update',
        companyId: activeCompanyId,
      }).catch(err => console.warn('Driver status alert dispatch issue:', err));
    }

    const alert: AppNotification = {
      id: `notif_status_${Date.now()}`,
      title: 'Load Tracking Update',
      message: `Load ${loadObj?.loadNumber} progressed to: ${status.toUpperCase().replace('_', ' ')}.`,
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
      forRole: 'dispatcher',
      forCompanyId: activeCompanyId
    };
    handleUpdateNotifications([alert, ...notifications]);
  };

  const handleUpdateSingleLoad = (loadId: string, updates: Partial<Load>) => {
    const updated = loads.map(l => l.id === loadId ? { ...l, ...updates } : l);
    handleUpdateLoads(updated);

    const loadObj = loads.find(l => l.id === loadId);
    const effectiveLoad = { ...loadObj, ...updates };
    const driverId = effectiveLoad?.assignedDriverId;
    const driverObj = driverId ? users.find(u => u.id === driverId) : null;

    if (driverObj) {
      sendDriverNotificationAlert({
        driverId: driverObj.id,
        driverName: driverObj.name,
        driverEmail: driverObj.email,
        driverPhone: driverObj.phone,
        loadNumber: effectiveLoad?.loadNumber || '',
        title: `Load #${effectiveLoad?.loadNumber || ''} Updated`,
        message: `Dispatch updated details for Load #${effectiveLoad?.loadNumber || ''} (${effectiveLoad?.cargoType || 'Freight'}). Pickup: ${effectiveLoad?.pickup?.facilityName || 'Origin'}, Dropoff: ${effectiveLoad?.delivery?.facilityName || 'Destination'}. Check mobile dashboard for updated itinerary.`,
        type: 'load_update',
        companyId: activeCompanyId,
      }).catch(err => console.warn('Driver edit alert dispatch issue:', err));
    }
  };

  // 6. Driver specific actions
  const handleUploadPod = async (loadId: string, podDataUrl: string, fileName: string) => {
    let finalUrl = podDataUrl;
    try {
      if (podDataUrl.startsWith('data:')) {
        const storagePath = `admins/${activeCompanyId}/loads/${loadId}/pods/${Date.now()}_${fileName}`;
        finalUrl = await uploadDataUrlToStorage(podDataUrl, storagePath);
      }
    } catch (err) {
      console.error("Failed to upload POD to Storage:", err);
    }

    const updated = loads.map(l => l.id === loadId ? { 
      ...l, 
      podUrl: finalUrl, 
      podFileName: fileName,
      podUploadedAt: new Date().toISOString()
    } : l);
    handleUpdateLoads(updated);

    const loadObj = loads.find(l => l.id === loadId);
    
    const currentUid = auth.currentUser?.uid;
    const driverObj = (currentUid && firebaseUser && !firebaseUser.isSandbox)
      ? users.find(u => u.id === currentUid)
      : users.find(u => u.role === 'driver' && u.companyId === activeCompanyId);

    const driverName = driverObj?.name || 'Jack Nelson';
    const driverId = (currentUid && firebaseUser && !firebaseUser.isSandbox) ? currentUid : (driverObj?.id || 'system_driver');
    
    // Create POD log alerts
    const alerts: AppNotification[] = [
      {
        id: `notif_pod_${Date.now()}_disp`,
        title: 'POD Scanned & Verified',
        message: `Driver ${driverName} uploaded Proof of Delivery for Load ${loadObj?.loadNumber}. Invoice ready.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'dispatcher',
        forCompanyId: activeCompanyId
      }
    ];
    handleUpdateNotifications([...alerts, ...notifications]);

    // Automatically post checked-in notification message to the Direct Load Chat!
    const directMsg: Message = {
      id: `msg_pod_auto_${Date.now()}`,
      loadId,
      channel: 'load',
      companyId: activeCompanyId,
      senderId: driverId,
      senderName: driverName,
      senderRole: 'driver',
      text: `[AUTOMATED FILE SYNC] Delivery signature complete. Uploading straightened document: ${fileName}`,
      attachmentName: fileName,
      attachmentUrl: finalUrl,
      timestamp: new Date().toISOString()
    };
    handleUpdateMessages([directMsg, ...messages]);
  };

  const handleSendMessage = (loadId: string | undefined, channel: 'load' | 'general', text: string, attachmentName?: string, attachmentUrl?: string) => {
    // Determine sender based on active workspace role, preferring actual logged-in user profile
    let senderId = 'user_super_admin';
    let senderName = 'Marcus Vance (Super Admin)';
    
    if (firebaseUser && !firebaseUser.isSandbox) {
      senderId = firebaseUser.uid;
      const activeUser = users.find(u => u.id === firebaseUser.uid);
      if (activeUser) {
        senderName = activeUser.name;
        if (activeRole === 'admin') {
          senderName = `${activeUser.name} (Admin)`;
        } else if (activeRole === 'dispatcher') {
          senderName = `${activeUser.name} (Dispatcher)`;
        } else if (activeRole === 'driver') {
          senderName = `${activeUser.name} (Driver)`;
        }
      } else {
        const roleLabel = activeRole.charAt(0).toUpperCase() + activeRole.slice(1);
        senderName = `${firebaseUser.displayName || firebaseUser.email || 'Operator'} (${roleLabel})`;
      }
    } else {
      if (activeRole === 'admin') {
        const activeAdmin = users.find(u => u.companyId === activeCompanyId && u.role === 'admin');
        senderId = activeAdmin?.id || 'user_apex_admin';
        senderName = `${activeAdmin?.name || 'Sarah Jenkins'} (Admin)`;
      } else if (activeRole === 'dispatcher') {
        const activeDisp = users.find(u => u.companyId === activeCompanyId && u.role === 'dispatcher');
        senderId = activeDisp?.id || 'user_apex_disp1';
        senderName = activeDisp?.name || 'Tom Miller (Dispatcher)';
      } else if (activeRole === 'driver') {
        const activeDrv = users.find(u => u.companyId === activeCompanyId && u.role === 'driver');
        senderId = activeDrv?.id || 'user_apex_driver1';
        senderName = activeDrv?.name || 'Jack Nelson (Driver)';
      }
    }

    const newMsg: Message = {
      id: `msg_${Date.now()}`,
      channel,
      companyId: activeCompanyId,
      senderId,
      senderName,
      senderRole: activeRole,
      text,
      timestamp: new Date().toISOString(),
    };

    if (loadId) {
      newMsg.loadId = loadId;
    }
    if (attachmentName) {
      newMsg.attachmentName = attachmentName;
    }
    if (attachmentUrl) {
      newMsg.attachmentUrl = attachmentUrl;
    }

    handleUpdateMessages([newMsg, ...messages]);

    // Sync sent messages (and attachments) into individual load's notes in the database
    if (channel === 'load' && loadId) {
      const targetLoad = loads.find(l => l.id === loadId);
      if (targetLoad) {
        const timeStr = new Date(newMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const attachStr = attachmentName ? ` [Attachment: ${attachmentName}]` : '';
        const newLine = `[${timeStr}] ${senderName}: ${text}${attachStr}`;
        const updatedNotes = targetLoad.notes
          ? `${targetLoad.notes}\n${newLine}`
          : newLine;

        const updatedLoads = loads.map(l => l.id === loadId ? { ...l, notes: updatedNotes } : l);
        handleUpdateLoads(updatedLoads);
      }
    }
  };

  const handleToggleGpsConsent = async (loadId: string, accepted: boolean, statusToUpdate?: LoadStatus) => {
    const driverId = auth.currentUser?.uid || 'driver_uid';
    const updated = loads.map(l => l.id === loadId ? { 
      ...l, 
      gpsConsentAccepted: accepted,
      gpsConsentAcceptedBy: accepted ? driverId : null,
      gpsConsentAcceptedAt: accepted ? new Date().toISOString() : null,
      ...(statusToUpdate ? { status: statusToUpdate } : {})
    } : l);
    await handleUpdateLoads(updated);

    if (statusToUpdate) {
      const loadObj = loads.find(l => l.id === loadId);
      const alert: AppNotification = {
        id: `notif_status_${Date.now()}`,
        title: 'Load Tracking Update',
        message: `Load ${loadObj?.loadNumber} progressed to: ${statusToUpdate.toUpperCase().replace('_', ' ')}.`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
        forRole: 'dispatcher',
        forCompanyId: activeCompanyId
      };
      handleUpdateNotifications([alert, ...notifications]);
    }

    if (accepted && auth.currentUser) {
      const loadObj = loads.find(l => l.id === loadId);
      const adminId = loadObj?.companyId || activeCompanyId;
      if (adminId) {
        try {
          // 1. Write the real GPS consent audit record with correct schema and status = 'granted'
          const consentId = `consent_${Date.now()}`;
          const consentRef = doc(db, 'admins', adminId, 'drivers', driverId, 'consents', consentId);
          await setDoc(consentRef, {
            loadId,
            timestamp: new Date().toISOString(),
            status: 'granted',
            userId: driverId
          });
          console.log("Consent audit record created in Firestore successfully:", consentId);

          // 2. Write the system chat message to the plural communications subcollection
          const messageId = `msg_${Date.now()}`;
          const currentUserProfile = users.find(u => u.id === driverId);
          const messageData = {
            id: messageId,
            channel: 'load',
            companyId: adminId,
            senderId: driverId,
            senderName: currentUserProfile?.name || 'Jack Nelson (Driver)',
            senderRole: 'driver',
            text: 'GPS tracking consent has been recorded for this load.',
            timestamp: new Date().toISOString(),
            loadId: loadId
          };
          console.log("Saving exact consent system messageData before writing to Firestore:", JSON.stringify(messageData, null, 2));
          await setDoc(doc(db, 'admins', adminId, 'loads', loadId, 'communications', messageId), messageData);
          console.log("Consent system message posted to communications successfully.");
        } catch (e) {
          console.error("Failed to write consent and message records:", e);
        }
      }
    }
  };

  const handleSimulateGpsTick = (loadId: string) => {
    const loadObj = loads.find(l => l.id === loadId);
    if (!loadObj) return;

    if (loadObj.gpsTrackingRequired === false) {
      alert("GPS Tracking is toggled OFF for this load. Enable 'GPS Tracking Required' in Load Details to stream location data.");
      return;
    }

    if (!loadObj.gpsConsentAccepted) {
      alert("GPS Consent has not been granted by the driver for this load yet.");
      return;
    }

    // Get pickup and delivery approximate coordinates
    let startCity = loadObj.pickup.facilityName.includes('Houston') ? 'Houston' : 'Chicago';
    let endCity = loadObj.delivery.facilityName.includes('Dallas') ? 'Dallas' : 'LosAngeles';
    if (loadObj.pickup.facilityName.includes('Gary')) {
      startCity = 'Chicago';
    }
    if (loadObj.delivery.facilityName.includes('St. Louis')) {
      endCity = 'Dallas'; // approximate
    }

    const startCoord = HUB_COORDINATES[startCity as keyof typeof HUB_COORDINATES] || HUB_COORDINATES.Houston;
    const endCoord = HUB_COORDINATES[endCity as keyof typeof HUB_COORDINATES] || HUB_COORDINATES.Dallas;

    // Tick progresses coordinate by 15% segments
    const currentPointsCount = loadObj.gpsHistory.length;
    const nextPercentage = Math.min(100, (currentPointsCount + 1) * 15);
    
    // Bilinear curve offset
    const fraction = nextPercentage / 100;
    const arc = Math.sin(fraction * Math.PI) * 1.5;
    const lat = startCoord.lat + (endCoord.lat - startCoord.lat) * fraction + arc * 0.12;
    const lng = startCoord.lng + (endCoord.lng - startCoord.lng) * fraction - arc * 0.05;

    const nextGpsPoint = {
      lat,
      lng,
      timestamp: new Date().toISOString(),
    };

    const updatedGpsHistory = [...loadObj.gpsHistory, nextGpsPoint];

    const updated = loads.map(l => l.id === loadId ? {
      ...l,
      currentGps: nextGpsPoint,
      gpsHistory: updatedGpsHistory,
    } : l);

    handleUpdateLoads(updated);
  };

  // Filter components by active context
  const activeCompany = companies.find(c => c.id === activeCompanyId);
  const dbDriver = firebaseUser && !firebaseUser.isSandbox
    ? (users.find(u => u.id === firebaseUser.uid && u.role === 'driver') || users.find(u => u.companyId === activeCompanyId && u.role === 'driver'))
    : users.find(u => u.companyId === activeCompanyId && u.role === 'driver');

  // Guard against missing driver profile during role testing/previewing
  const currentUserObj = firebaseUser ? users.find(u => u.id === firebaseUser.uid) : null;
  const activeDriver = dbDriver ? {
    ...dbDriver,
    dutyStatus: dbDriver.dutyStatus || 'Off Duty',
  } : (activeRole === 'driver' ? {
    id: firebaseUser?.uid || 'mock_driver_preview',
    name: currentUserObj?.name || firebaseUser?.displayName || 'Nelson Vance (Driver)',
    email: firebaseUser?.email || 'driver@example.com',
    role: 'driver' as const,
    companyId: activeCompanyId || currentUserObj?.companyId || 'co_apex',
    status: 'active' as const,
    phone: currentUserObj?.phone || '(555) 019-2831',
    dutyStatus: currentUserObj?.dutyStatus || 'On Duty',
    truckNumber: currentUserObj?.truckNumber || 'TRK-9021',
    licenseNumber: currentUserObj?.licenseNumber || 'CDL-TX-882910'
  } : undefined);

  const pendingTenantsCount = companies.filter(co => co.status === 'pending').length;
  const companyLoads = loads.filter(l => l.companyId === activeCompanyId);
  const urgentLoadsCount = companyLoads.filter(l => l.urgent && l.status !== 'delivered').length;
  const assignedLoadsCount = activeDriver ? companyLoads.filter(l => l.assignedDriverId === activeDriver.id && l.status !== 'delivered').length : 0;

  if (authErrorMsg) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/40 border border-rose-500/30 rounded-2xl p-6 text-center space-y-6 backdrop-blur-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
            ⚠️
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-200">Security / Authentication Error</h3>
            <p className="text-xs text-rose-400 font-mono bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 text-left overflow-auto max-h-32 leading-relaxed">
              {authErrorMsg}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setAuthErrorMsg(null);
                setIsProfileReady(false);
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              Retry Connection
            </button>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <SignUpGate
        users={users}
        onSuccess={(user, role) => {
          setFirebaseUser(user);
          setActiveRole(role);
        }}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSignInAnonymously={handleSignInAnonymously}
        onLocalSandbox={handleLocalSandbox}
      />
    );
  }

  if (firebaseUser && !isProfileReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
          <p className="text-sm font-medium text-slate-300">Synchronizing Logistics Control Profile...</p>
          <p className="text-xs text-slate-500">Establishing secure link with control deck...</p>
        </div>
      </div>
    );
  }

  const themeBgClass = 
    pageTheme === 'cosmic_dark' ? 'bg-slate-950 text-slate-100 theme-cosmic' :
    pageTheme === 'industrial_terminal' ? 'bg-black text-amber-400 font-mono theme-terminal' :
    'bg-slate-100 text-slate-900 theme-light';

  return (
    <div className={`min-h-screen ${themeBgClass} flex flex-col select-none antialiased relative`} id="root-viewport">
      
      {/* 1. Sandbox Control deck header */}
      <RoleSelector
        activeRole={activeRole}
        onChangeRole={setActiveRole}
        activeCompanyId={activeCompanyId}
        onChangeCompany={setActiveCompanyId}
        companies={companies}
        pendingTenantsCount={pendingTenantsCount}
        urgentLoadsCount={urgentLoadsCount}
        assignedLoadsCount={assignedLoadsCount}
        firebaseUser={firebaseUser}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSignInAnonymously={handleSignInAnonymously}
        onSignOut={handleSignOut}
        onOpenSettings={() => setIsSettingsOpen(true)}
        pageTheme={pageTheme}
        onChangePageTheme={handlePageThemeChange}
        cloudSyncWidget={
          <div className="pointer-events-none flex items-center shrink-0" id="cloud-sync-container">
            <div 
              className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-md transition-all duration-300 transform scale-95 hover:scale-100 ${
                activeWritesCount > 0 
                  ? 'bg-slate-900/95 border-indigo-500/50 text-indigo-200'
                  : showSavedIndicator 
                    ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 animate-[pulse_2s_infinite]'
                    : syncError
                      ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-300 shadow-sm'
              }`} 
              id="cloud-sync-indicator-card"
              title={
                activeWritesCount > 0 
                  ? `Saving ${activeWritesCount} pending update(s) to Firestore...` 
                  : showSavedIndicator 
                    ? "All changes successfully saved and synced to live Firestore database!" 
                    : syncError 
                      ? `Sync Error: ${syncError}` 
                      : lastSyncTime 
                        ? `Live Firestore Connected. Last synced: ${lastSyncTime.toLocaleTimeString()}` 
                        : "No changes to sync yet. Running locally."
              }
            >
              {/* Visual Cloud Icon / Progress Spinner */}
              <div className="relative flex items-center justify-center shrink-0">
                {activeWritesCount > 0 ? (
                  <div className="relative">
                    <Cloud className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                    <Loader2 className="h-2 w-2 text-white absolute inset-0 m-auto animate-spin" />
                  </div>
                ) : showSavedIndicator ? (
                  <div className="relative flex items-center justify-center">
                    <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                    <Check className="h-2 w-2 text-emerald-200 absolute inset-0 m-auto font-black" />
                  </div>
                ) : syncError ? (
                  <CloudOff className="h-3.5 w-3.5 text-rose-400" />
                ) : (
                  <Cloud className="h-3.5 w-3.5 text-slate-500" />
                )}
              </div>

              {/* Compressed Sync Label */}
              <span className="text-[10px] font-mono font-bold tracking-tight select-none">
                {activeWritesCount > 0 ? (
                  <span className="text-indigo-300">Saving...</span>
                ) : showSavedIndicator ? (
                  <span className="text-emerald-400">Synced</span>
                ) : syncError ? (
                  <span className="text-rose-400">Sync Error</span>
                ) : (
                  <span className="text-slate-400">Cloud Active</span>
                )}
              </span>
            </div>
          </div>
        }
      />

      {/* 1.b Stripe Session Reconciliation Loading Overlay */}
      {isReconcilingSession && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 mx-auto border border-purple-500/30 animate-pulse">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Finalizing subscription...</h3>
              <p className="text-xs text-slate-400">Verifying secure billing details with Stripe gateway...</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Global Informational Notification Banners */}
      {reconcileNotice && (
        <div className="bg-amber-900/90 border-b border-amber-700 text-amber-100 px-6 py-2.5 flex items-center justify-between text-xs animate-pulse" id="reconcile-notice-banner">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-300 shrink-0" />
            <span><strong>Stripe Billing Status</strong>: {reconcileNotice}</span>
          </div>
          <button
            onClick={() => setReconcileNotice(null)}
            className="text-amber-300 hover:text-white font-bold ml-4 cursor-pointer p-1 rounded hover:bg-amber-800 transition"
            title="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}
      {(() => {
        if (activeRole === 'driver') return null;
        const firstUnread = notifications.find(n => !n.read && !dismissedNotificationIds.includes(n.id));
        if (!firstUnread) return null;
        return (
          <div className="bg-purple-900 border-b border-purple-800 text-white px-6 py-2 flex items-center justify-between text-xs animate-[fadeIn_0.3s]" id="global-alert-banner">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-yellow-400 animate-ping shrink-0"></span>
              <Megaphone className="h-4 w-4 text-purple-300 shrink-0" />
              <span>
                <strong>REAL-TIME TELEMETRY EVENT</strong>: {firstUnread.title} — {firstUnread.message}
              </span>
            </div>
            <button
              onClick={() => {
                const updatedDismissed = [...dismissedNotificationIds, firstUnread.id];
                setDismissedNotificationIds(updatedDismissed);
                localStorage.setItem('td_dismissed_notifications', JSON.stringify(updatedDismissed));

                const updated = notifications.map(not => not.id === firstUnread.id ? { ...not, read: true } : not);
                handleUpdateNotifications(updated);
              }}
              className="text-purple-300 hover:text-white font-bold ml-4 cursor-pointer p-1 rounded hover:bg-purple-800 transition"
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* 3. Primary Workspace View Port */}
      <main className="flex-grow">
        {(() => {
          const isBillingRestricted = activeRole !== 'super_admin' && activeCompany && (() => {
            if (activeCompany.billingAccessOverride && activeCompany.overrideExpiresAt && new Date(activeCompany.overrideExpiresAt) > new Date()) {
              return false;
            }
            const status = activeCompany.status;
            if (status === 'deactivated' || status === 'suspended') return true;

            const subStatus = (activeCompany.subscriptionStatus || '').toLowerCase();
            const payStatus = (activeCompany.paymentStatus || '').toLowerCase();

            if (subStatus === 'trialing' || activeCompany.trialEnabled) {
              if (activeCompany.trialEnd && new Date(activeCompany.trialEnd) < new Date()) {
                if (payStatus !== 'paid' && subStatus !== 'active') {
                  return true;
                }
              }
              return false;
            }

            if (['past_due', 'incomplete', 'incomplete_expired', 'unpaid', 'paused', 'canceled'].includes(subStatus)) {
              return true;
            }
            if (payStatus === 'failed') {
              return true;
            }
            return false;
          })();

          if (isBillingRestricted && activeCompany) {
            return (
              <PaymentRequiredView
                company={activeCompany}
                currentUser={users.find(u => u.id === firebaseUser?.uid) || null}
                onLogout={handleSignOut}
                onRefreshAccess={async () => {
                  if (firebaseUser) {
                    const token = await firebaseUser.getIdToken(true);
                    const res = await fetch('/api/auth/access-status', {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.accessAllowed) {
                      window.location.reload();
                    }
                  }
                }}
              />
            );
          }

          return (
            <>
              {activeRole === 'super_admin' && (
                <SuperAdminView
                  companies={companies}
                  invoices={invoices}
                  notifications={notifications}
                  users={users}
                  onApproveCompany={handleApproveCompany}
                  onSuspendCompany={handleSuspendCompany}
                  onUpdateCompany={handleUpdateCompany}
                  onSendGlobalBroadcast={handleSendGlobalBroadcast}
                  onTriggerEmailTest={handleTriggerEmailTest}
                  onImpersonateCompany={handleImpersonateCompany}
                  onAddTenant={handleOnboardTenant}
                  onAddUser={handleAddUser}
                  pageTheme={pageTheme}
                  currentUserId={firebaseUser.uid}
                  onUpdateUserProfile={handleUpdateUserProfile}
                  onResendOnboardingEmail={handleResendOnboardingEmail}
                  onResetOnboardingEmailCount={handleResetOnboardingEmailCount}
                  onClearAllDatabaseData={handleClearAllData}
                />
              )}

              {activeRole === 'admin' && activeCompany && (
                <AdminView
                  company={activeCompany}
                  users={users}
                  invoices={invoices}
                  onUpdateCompanyProfile={handleUpdateCompanyProfile}
                  onAddUser={handleAddUser}
                  onUpgradePlan={handleUpgradePlan}
                  onAcceptLegal={() => {}}
                  pageTheme={pageTheme}
                  onUpdateUserProfile={handleUpdateUserProfile}
                  onDeleteUser={handleDeleteUser}
                  notifications={notifications}
                  loads={loads}
                  onUpdateLoad={handleUpdateSingleLoad}
                />
              )}

              {/* Fallback loader/status gate if profile is ready but company details are still loading from Firestore */}
              {activeRole !== 'super_admin' && !activeCompany && (
                <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center p-6 text-center" id="company-loading-gate">
                  <div className="max-w-md space-y-6">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 font-bold text-xl mx-auto border border-purple-500/20 animate-pulse">
                      ⏳
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-slate-200">Retrieving Carrier Workspace</h3>
                      <p className="text-xs text-slate-400">
                        Connecting to your secure multi-tenant dispatch database...
                      </p>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left space-y-2">
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Secure Company ID:</strong> {activeCompanyId || 'Resolving...'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Assigned Role:</strong> {activeRole?.toUpperCase()}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Auth Account:</strong> {firebaseUser?.email}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      If this card persists, please request your carrier Administrator or Platform Super Admin to verify your account onboarding.
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                    >
                      Sign Out / Switch Account
                    </button>
                  </div>
                </div>
              )}

              {activeRole === 'dispatcher' && activeCompany && (
                activeCompany.status === 'pending' ? (
                  <div className="min-h-[calc(100vh-140px)] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center" id="pending-activation-gate">
                    <div className="max-w-md space-y-6">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 font-bold text-xl mx-auto border border-amber-500/20 animate-pulse">
                        ⚡
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-heading font-bold text-slate-200">Awaiting Fleet Activation</h2>
                        <p className="text-sm text-slate-400">
                          Your carrier company profile for <strong>{activeCompany?.name}</strong> is currently pending activation by your Fleet Administrator.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-left">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          <span>CARRIER: {activeCompany?.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          <span>DOT NUMBER: {activeCompany?.dotNumber || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-ping"></span>
                          <span>YOUR ROLE: {activeRole.toUpperCase()}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Please contact your Fleet Administrator to complete the company registration, legal agreement, and billing activation. Once active, your control deck will load automatically.
                      </p>
                      <button
                        onClick={handleSignOut}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                      >
                        Sign Out / Switch Account
                      </button>
                    </div>
                  </div>
                ) : (
                  <DispatcherView
                    company={activeCompany}
                    loads={loads}
                    users={users}
                    trucks={trucks}
                    messages={messages}
                    onAddLoad={handleAddLoad}
                    onAssignDriver={handleAssignDriver}
                    onUpdateLoadStatus={handleUpdateLoadStatus}
                    onSendMessage={handleSendMessage}
                    onAddUser={handleAddUser}
                    pageTheme={pageTheme}
                    onUpdateUserProfile={handleUpdateUserProfile}
                    notifications={notifications}
                    onUpdateLoad={handleUpdateSingleLoad}
                    googleMapsKey={googleMapsKey}
                  />
                )
              )}

              {/* Fallback state if they are logged in as driver but activeDriver profile is not yet fully populated */}
              {activeRole === 'driver' && activeCompany && !activeDriver && (
                <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center p-6 text-center" id="driver-loading-gate">
                  <div className="max-w-md space-y-6">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 font-bold text-xl mx-auto border border-purple-500/20 animate-pulse">
                      🚛
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-slate-200">Retrieving Driver Profile</h3>
                      <p className="text-xs text-slate-400">
                        Connecting to the fleet carrier's commercial logistics logs...
                      </p>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left space-y-2">
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Company Name:</strong> {activeCompany.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Carrier Dot:</strong> {activeCompany.dotNumber}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        <strong className="text-purple-400">Account Email:</strong> {firebaseUser?.email}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      Please verify with your Fleet Administrator that they have added your active CDL credentials under this email address in their Fleet panel.
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                    >
                      Sign Out / Switch Account
                    </button>
                  </div>
                </div>
              )}

              {activeRole === 'driver' && activeCompany && activeDriver && (
                activeCompany.status === 'pending' ? (
                  <div className="min-h-[calc(100vh-140px)] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center" id="pending-activation-gate">
                    <div className="max-w-md space-y-6">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 font-bold text-xl mx-auto border border-amber-500/20 animate-pulse">
                        ⚡
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-heading font-bold text-slate-200">Awaiting Fleet Activation</h2>
                        <p className="text-sm text-slate-400">
                          Your carrier company profile for <strong>{activeCompany?.name}</strong> is currently pending activation by your Fleet Administrator.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-left">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          <span>CARRIER: {activeCompany?.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          <span>DOT NUMBER: {activeCompany?.dotNumber || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-ping"></span>
                          <span>YOUR ROLE: {activeRole.toUpperCase()}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Please contact your Fleet Administrator to complete the company registration, legal agreement, and billing activation. Once active, your control deck will load automatically.
                      </p>
                      <button
                        onClick={handleSignOut}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                      >
                        Sign Out / Switch Account
                      </button>
                    </div>
                  </div>
                ) : (activeDriver.lifecycleStatus === 'suspended' || activeDriver.lifecycleStatus === 'terminated' || activeDriver.status === 'suspended' || activeDriver.status === 'terminated' || activeDriver.status === 'inactive') ? (
                  <div className="min-h-[calc(100vh-140px)] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center" id="driver-restricted-gate">
                    <div className="max-w-md space-y-6">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 font-bold text-xl mx-auto border border-rose-500/20">
                        🚫
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-heading font-bold text-slate-200">Driver Account Restricted</h2>
                        <p className="text-sm text-slate-400">
                          Your driver account status is currently set to <strong className="uppercase text-rose-400">{activeDriver.lifecycleStatus || activeDriver.status}</strong>. Operational access to dispatches and load console is suspended.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-left text-xs font-mono text-slate-400">
                        <div>DRIVER: {activeDriver.name}</div>
                        <div>CARRIER: {activeCompany.name}</div>
                        <div>EMAIL: {activeDriver.email}</div>
                        <div>STATUS: {(activeDriver.lifecycleStatus || activeDriver.status || 'SUSPENDED').toUpperCase()}</div>
                      </div>
                      <p className="text-xs text-slate-500">
                        If you believe this is an error, please contact your carrier's Dispatch or Fleet Management team to reconcile your driver account status.
                      </p>
                      <button
                        onClick={handleSignOut}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                      >
                        Sign Out / Switch Account
                      </button>
                    </div>
                  </div>
                ) : (
                  <DriverView
                    company={activeCompany}
                    driver={activeDriver}
                    loads={loads}
                    messages={messages}
                    users={users}
                    onUpdateLoadStatus={handleUpdateLoadStatus}
                    onUpdateLoad={handleUpdateLoad}
                    onUploadPod={handleUploadPod}
                    onSendMessage={handleSendMessage}
                    onToggleGpsConsent={handleToggleGpsConsent}
                    onSimulateGpsTick={handleSimulateGpsTick}
                    pageTheme={pageTheme}
                    onUpdateUserProfile={handleUpdateUserProfile}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    googleMapsKey={googleMapsKey}
                    isSandbox={firebaseUser?.isSandbox ?? true}
                  />
                )
              )}
            </>
          );
        })()}
      </main>

      {/* Corporate Branding Primary Accent Override */}
      {activeCompany?.themeColor && (
        <style dangerouslySetInnerHTML={{ __html: getThemeStyleOverride(activeCompany.themeColor) }} />
      )}

      {/* Global Profile and Settings Management Control */}
      {firebaseUser && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          firebaseUser={firebaseUser}
          userProfile={users.find(u => u.id === firebaseUser.uid)}
          companyProfile={activeCompany}
          onUpdateUserProfile={(updates) => handleUpdateUserProfile(firebaseUser.uid, updates)}
          onUpdateCompanyProfile={handleUpdateCompanyProfile}
          onSignOut={handleSignOut}
          pageTheme={pageTheme}
        />
      )}

      <CustomConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
        theme={pageTheme}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
}
