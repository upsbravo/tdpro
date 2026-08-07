import React, { useState, useEffect } from 'react';
import { 
  X, Lock, Shield, Building2, User, Palette, 
  Eye, EyeOff, Save, LogOut, Check, Loader2, ShieldCheck, HelpCircle,
  UploadCloud, RefreshCw
} from 'lucide-react';
import { User as AppUser, Company, UserRole } from '../types';
import { auth, db, uploadFileToStorage } from '../firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: any;
  userProfile: AppUser | undefined;
  companyProfile: Company | undefined;
  onUpdateUserProfile: (updates: Partial<AppUser>) => void | Promise<void>;
  onUpdateCompanyProfile: (updates: Partial<Company>) => void | Promise<void>;
  onSignOut: () => void;
  pageTheme: 'cosmic_dark' | 'enterprise_light' | 'industrial_terminal';
}

const COLOR_PRESETS = [
  { name: 'Default Purple', hex: '#8b5cf6', desc: 'Royal Violet' },
  { name: 'Royal Blue', hex: '#2563eb', desc: 'Fleet Blue' },
  { name: 'Emerald Green', hex: '#10b981', desc: 'Logistics Green' },
  { name: 'Sunset Amber', hex: '#f59e0b', desc: 'Industrial Amber' },
  { name: 'Crimson Red', hex: '#ef4444', desc: 'Priority Red' },
  { name: 'Slate Gray', hex: '#64748b', desc: 'Steel Slate' },
];

export default function SettingsModal({
  isOpen,
  onClose,
  firebaseUser,
  userProfile,
  companyProfile,
  onUpdateUserProfile,
  onUpdateCompanyProfile,
  onSignOut,
  pageTheme,
}: SettingsModalProps) {
  const isSandbox = !firebaseUser || firebaseUser.isSandbox;
  const role: UserRole = userProfile?.role || 'driver';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'profile' | 'branding' | 'security'>('profile');

  // Profile Form States
  const [name, setName] = useState(userProfile?.name || '');
  const [email, setEmail] = useState(userProfile?.email || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [licenseNumber, setLicenseNumber] = useState(userProfile?.licenseNumber || '');
  const [truckNumber, setTruckNumber] = useState(userProfile?.truckNumber || '');
  const [ownerOperatorName, setOwnerOperatorName] = useState(userProfile?.ownerOperatorName || '');
  const [dutyStatus, setDutyStatus] = useState(userProfile?.dutyStatus || 'Off Duty');

  useEffect(() => {
    if (isOpen && userProfile) {
      setName(userProfile.name || '');
      setEmail(userProfile.email || '');
      setPhone(userProfile.phone || '');
      setLicenseNumber(userProfile.licenseNumber || '');
      setTruckNumber(userProfile.truckNumber || '');
      setOwnerOperatorName(userProfile.ownerOperatorName || '');
      setDutyStatus(userProfile.dutyStatus || 'Off Duty');
    }
  }, [isOpen, userProfile]);

  // Branding Form States (Admin only)
  const [companyName, setCompanyName] = useState(companyProfile?.name || '');
  const [logoUrl, setLogoUrl] = useState(companyProfile?.logoUrl || '');
  const [themeColor, setThemeColor] = useState(companyProfile?.themeColor || '#8b5cf6');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const storagePath = `branding/${companyProfile?.id || 'unknown'}/${Date.now()}_${file.name}`;
      const url = await uploadFileToStorage(file, storagePath);
      setLogoUrl(url);
    } catch (err: any) {
      console.error("Error uploading company logo in SettingsModal:", err);
      setErrorMsg("Failed to upload company logo: " + (err.message || err));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Security Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Status/Loading States
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!name.trim()) {
        throw new Error('Full Operational Name is required.');
      }

      const updates: Partial<AppUser> = {
        name: name.trim(),
        phone: phone.trim()
      };

      if (role === 'driver') {
        updates.licenseNumber = licenseNumber.trim();
        updates.truckNumber = truckNumber.trim();
        updates.ownerOperatorName = ownerOperatorName.trim();
        updates.dutyStatus = dutyStatus as any;
      }

      if (role === 'super_admin') {
        // Super admins can update their email and password
        if (isSandbox) {
          updates.email = email.trim();
        } else {
          const user = auth.currentUser;
          if (user && email !== user.email) {
            // Re-auth check for email update
            if (!currentPassword) {
              throw new Error('Current password is required to update your email address.');
            }
            const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updateEmail(user, email);
          }
          updates.email = email.trim();
        }
      }

      await onUpdateUserProfile(updates);
      setSuccessMsg('Profile settings updated successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to update profile settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBrandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin' && role !== 'super_admin') {
      setErrorMsg('Unauthorized: Only Company Administrators can modify company branding assets.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!companyName.trim()) {
        throw new Error('Company Name cannot be empty.');
      }

      await onUpdateCompanyProfile({
        name: companyName,
        logoUrl: logoUrl,
        themeColor: themeColor,
      });

      // Sync brand metadata to /admins/{adminId} document in Firestore for visibility and real-time listeners
      if (!isSandbox && companyProfile?.id) {
        await setDoc(doc(db, 'admins', companyProfile.id), {
          companyName: companyName,
          logoUrl: logoUrl,
          themeColor: themeColor,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      setSuccessMsg('Company branding configurations synchronized successfully! All dispatchers and driver portals updated instantly.');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to synchronize company branding.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('Please enter your current password to authenticate.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setIsSaving(true);

    try {
      if (isSandbox) {
        // Simulated update
        setSuccessMsg('✓ Password updated successfully (Simulated Local Session)! Logging out...');
        setTimeout(() => {
          onSignOut();
          onClose();
        }, 2000);
      } else {
        const user = auth.currentUser;
        if (!user || !user.email) {
          throw new Error('User session not found.');
        }

        // 1. Re-authenticate
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // 2. Update password
        await updatePassword(user, newPassword);

        setSuccessMsg('✓ Password updated successfully! Session is now being re-established, logging out...');
        setTimeout(() => {
          onSignOut();
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'Failed to update password.';
      if (err.code === 'auth/wrong-password') {
        msg = 'Current password is incorrect. Re-authentication failed.';
      }
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Theme support
  const textTitleClass = pageTheme === 'industrial_terminal' ? 'text-amber-400 font-mono' : 'text-slate-800';
  const textMutedClass = pageTheme === 'industrial_terminal' ? 'text-amber-500/60 font-mono' : 'text-slate-500';
  const cardBgClass = pageTheme === 'industrial_terminal' ? 'bg-black border border-amber-500/30' : 'bg-white';
  const inputClass = pageTheme === 'industrial_terminal' 
    ? 'w-full bg-black border border-amber-500/40 text-amber-400 p-2 font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none'
    : 'w-full border border-slate-200 rounded-lg py-2 px-3 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:outline-none';
  const labelClass = 'text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="settings-overlay-panel">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[550px] ${cardBgClass}`} id="settings-dialog-frame">
        
        {/* Left Sidebar Menu */}
        <div className="w-full md:w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div>
              <span className="text-[10px] uppercase font-mono tracking-widest text-purple-400 font-bold">Settings Engine</span>
              <h3 className="text-white font-heading font-bold text-sm mt-1">Profile Control Desk</h3>
            </div>

            {/* Menu options */}
            <div className="space-y-1">
              <button
                onClick={() => { setActiveTab('profile'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`w-full px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition ${
                  activeTab === 'profile' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <User className="h-4 w-4 shrink-0" />
                <span>My Profile</span>
              </button>

              {(role === 'admin' || role === 'super_admin') && (
                <button
                  onClick={() => { setActiveTab('branding'); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`w-full px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition ${
                    activeTab === 'branding' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Palette className="h-4 w-4 shrink-0" />
                  <span>Company Branding</span>
                </button>
              )}

              <button
                onClick={() => { setActiveTab('security'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`w-full px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition ${
                  activeTab === 'security' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span>Security & Password</span>
              </button>
            </div>
          </div>

          {/* User quick badge */}
          <div className="border-t border-slate-850 pt-3 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-purple-400 border border-slate-700 uppercase">
              {role.charAt(0)}
            </div>
            <div className="min-w-0 flex-grow">
              <p className="text-[11px] font-bold text-slate-200 truncate">{userProfile?.name || 'Loading Operator...'}</p>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">{role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex-grow p-6 flex flex-col justify-between overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start pb-4 border-b border-slate-100/10 shrink-0">
            <div>
              <h4 className={`text-base font-heading font-bold ${textTitleClass}`}>
                {activeTab === 'profile' && 'Personal Profile Settings'}
                {activeTab === 'branding' && 'Carrier Branding Customization'}
                {activeTab === 'security' && 'Account Credentials & Security'}
              </h4>
              <p className={`text-xs ${textMutedClass}`}>
                {activeTab === 'profile' && 'Review operational identities. Sensitive fields require administrative override.'}
                {activeTab === 'branding' && 'Design white-label dashboards for all drivers and dispatchers.'}
                {activeTab === 'security' && 'Modify passwords and configure multi-tenant session authentications.'}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-full hover:bg-slate-100/10 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Banner */}
          {errorMsg && (
            <div className="my-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 animate-[fadeIn_0.15s]">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="my-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-[fadeIn_0.15s]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form Area */}
          <div className="flex-grow py-4">
            
            {/* 1. PROFILE TAB */}
            {activeTab === 'profile' && (
              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClass}>Full Operational Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>Corporate/CDL Email Address</label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        disabled
                        className={`${inputClass} bg-slate-100/5 cursor-not-allowed opacity-80`}
                        placeholder="email@carrier.com"
                      />
                      <span className="absolute right-2.5 top-2.5" title="Corporate account email is locked for security">
                        <Lock className="h-3.5 w-3.5 text-slate-500" />
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>Emergency Dispatch Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputClass}
                      placeholder="(555) 019-2831"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>Assigned Carrier ID</label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled
                        value={companyProfile?.id || 'GLOBAL_SUPER_TENANT'}
                        className={`${inputClass} bg-slate-100/5 cursor-not-allowed opacity-70 font-mono`}
                      />
                      <span className="absolute right-2.5 top-2.5" title="Carrier lock">
                        <Building2 className="h-3.5 w-3.5 text-slate-500" />
                      </span>
                    </div>
                  </div>

                  {/* Driver Specific Fields */}
                  {role === 'driver' && (
                    <>
                      <div className="space-y-1">
                        <label className={labelClass}>Commercial Driver's License (CDL) #</label>
                        <input
                          type="text"
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          className={inputClass}
                          placeholder="CDL-12345-A"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={labelClass}>Assigned Truck / Trailer Number</label>
                        <input
                          type="text"
                          value={truckNumber}
                          onChange={(e) => setTruckNumber(e.target.value)}
                          className={inputClass}
                          placeholder="TRK-9021"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={labelClass}>Owner Operator Name (Optional)</label>
                        <input
                          type="text"
                          value={ownerOperatorName}
                          onChange={(e) => setOwnerOperatorName(e.target.value)}
                          className={inputClass}
                          placeholder="e.g. JD Trucking LLC"
                        />
                      </div>

                      <div className="space-y-1 col-span-1 sm:col-span-2">
                        <label className={labelClass}>Operational Duty Status</label>
                        <select
                          value={dutyStatus}
                          onChange={(e) => setDutyStatus(e.target.value)}
                          className={`${inputClass} bg-slate-900 border border-slate-700 text-white cursor-pointer`}
                        >
                          <option value="On Duty">🟢 On Duty</option>
                          <option value="Off Duty">⚫ Off Duty</option>
                          <option value="On Break">🟡 On Break</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex gap-2.5 mt-2">
                  <ShieldCheck className="h-5 w-5 text-purple-400 shrink-0" />
                  <div className="text-[11px] text-slate-400 leading-normal">
                    <strong className="text-white block font-semibold mb-0.5">Secure Carrier Synchronization</strong>
                    Operational names, CDLs, phone numbers, and duty statuses are real-time synced to carrier dispatchers and active transit logs. Sensitive email and organizational fields require administrator override.
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100/5 shrink-0">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2 px-5 rounded-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Save Profile Settings</span>
                  </button>
                </div>
              </form>
            )}

            {/* 2. BRANDING TAB (ADMIN ONLY) */}
            {activeTab === 'branding' && (role === 'admin' || role === 'super_admin') && (
              <form onSubmit={handleBrandingSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className={labelClass}>Company/Brand Display Name</label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Apex Carrier Logistics"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className={labelClass}>Company Brand Logo</label>
                    <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border ${
                      pageTheme === 'industrial_terminal'
                        ? 'bg-black border-amber-500/30'
                        : 'bg-slate-50/50 border-slate-200/10'
                    }`}>
                      {/* Logo Preview box */}
                      <div className={`h-16 w-16 rounded-lg border flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-sm ${
                        pageTheme === 'industrial_terminal'
                          ? 'bg-black border-amber-500/40'
                          : 'bg-slate-900/40 border-slate-700/50'
                      }`}>
                        {logoUrl ? (
                          <img src={logoUrl} alt="Company logo preview" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <Building2 className={`h-8 w-8 ${pageTheme === 'industrial_terminal' ? 'text-amber-500/30' : 'text-slate-600'}`} />
                        )}
                      </div>
                      
                      {/* Upload Controls */}
                      <div className="flex-1 space-y-2 w-full">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <label className={`flex items-center justify-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-semibold cursor-pointer select-none transition shrink-0 ${
                            pageTheme === 'industrial_terminal'
                              ? 'border-amber-500/50 text-amber-400 bg-black hover:bg-amber-500/10'
                              : 'border-slate-700 text-slate-200 bg-slate-800 hover:bg-slate-700/80'
                          } ${isUploadingLogo ? 'opacity-60 pointer-events-none' : ''}`}>
                            {isUploadingLogo ? (
                              <>
                                <RefreshCw className={`h-3 w-3 animate-spin ${pageTheme === 'industrial_terminal' ? 'text-amber-500' : 'text-purple-400'}`} />
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <>
                                <UploadCloud className="h-3 w-3 text-slate-400" />
                                <span>Upload Logo</span>
                              </>
                            )}
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleLogoUpload} 
                              className="hidden" 
                              disabled={isUploadingLogo}
                            />
                          </label>
                          <input
                            type="text"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            className={inputClass}
                            placeholder="Or paste image URL here..."
                          />
                        </div>
                        <p className={`text-[10px] ${pageTheme === 'industrial_terminal' ? 'text-amber-500/60' : 'text-slate-400'}`}>
                          Upload a brand logo (PNG, JPG, or SVG). This branding is white-labeled across all driver and dispatcher dashboards.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 col-span-2">
                    <label className={labelClass}>Custom Primary Theme Accent Color</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setThemeColor(p.hex)}
                          className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                            themeColor.toLowerCase() === p.hex.toLowerCase() 
                              ? 'border-purple-500 bg-purple-500/10 shadow-md' 
                              : 'border-slate-200/20 hover:bg-slate-800'
                          }`}
                        >
                          <span 
                            className="h-5 w-5 rounded-full shadow-inner border border-white/20 block"
                            style={{ backgroundColor: p.hex }}
                          />
                          <span className="text-[9px] font-semibold text-slate-300 truncate w-full">{p.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2.5 pt-1">
                      <span className="text-[10px] text-slate-400">Custom hex:</span>
                      <input
                        type="color"
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        className="h-7 w-12 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        className={`${inputClass} !w-28 text-center uppercase font-mono font-bold`}
                        placeholder="#8B5CF6"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100/5 shrink-0">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2 px-5 rounded-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Sync Branding Identity</span>
                  </button>
                </div>
              </form>
            )}

            {/* 3. SECURITY TAB */}
            {activeTab === 'security' && (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-1">
                    <label className={labelClass}>Confirm Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className={inputClass}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-2.5 top-2 px-1 text-slate-400 hover:text-slate-200 transition"
                      >
                        {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Required for security verification to update password fields.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>Enter New Secure Password</label>
                    <div className="relative">
                      <input
                        type={showNewPass ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Minimum 6 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-2.5 top-2 px-1 text-slate-400 hover:text-slate-200 transition"
                      >
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>Verify New Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100/5 shrink-0">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2 px-5 rounded-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    <span>Execute Password Update</span>
                  </button>
                </div>
              </form>
            )}

          </div>

          {/* Footer controls */}
          <div className="border-t border-slate-100/10 pt-4 shrink-0 flex justify-between items-center bg-transparent mt-2">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
              <span>Identity Verified Account</span>
            </span>
            <button
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/10 rounded-lg px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out Account</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
