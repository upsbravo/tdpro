import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Truck as TruckIcon, 
  ShieldCheck, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Info, 
  X, 
  Upload, 
  Search,
  Building2,
  Mail,
  Copy,
  RotateCw,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { Company, Truck, OwnerOperatorCompany } from '../types';
import { auth } from '../firebase';

interface UnifiedDriverOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  existingTrucks: Truck[];
  ownerOperatorCompanies?: OwnerOperatorCompany[];
  onSuccess: () => void;
}

interface UploadedDoc {
  id: string;
  fileName: string;
  documentType: string;
  entityType: 'driver' | 'truck';
  fileSize?: number;
  mimeType?: string;
  issueDate?: string;
  expirationDate?: string;
  status: 'uploading' | 'completed' | 'error';
  progress?: number;
  errorMsg?: string;
  fileObj?: File;
  storagePath?: string;
}

function calculateAge(dobString: string, refDateString?: string): number {
  if (!dobString) return 0;
  const dob = new Date(dobString + 'T00:00:00Z');
  const ref = refDateString ? new Date(refDateString + 'T00:00:00Z') : new Date();
  if (isNaN(dob.getTime())) return 0;

  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

function getMaxInterstateBirthDate(refDateString?: string): string {
  const ref = refDateString ? new Date(refDateString + 'T00:00:00Z') : new Date();
  const maxYear = ref.getUTCFullYear() - 21;
  const m = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ref.getUTCDate()).padStart(2, '0');
  return `${maxYear}-${m}-${d}`;
}

export const UnifiedDriverOnboardingModal: React.FC<UnifiedDriverOnboardingModalProps> = ({
  isOpen,
  onClose,
  company,
  existingTrucks,
  ownerOperatorCompanies = [],
  onSuccess
}) => {
  if (!isOpen) return null;

  // Active Wizard Step
  const [activeStep, setActiveStep] = useState<number>(1);

  // --- STEP 1: ACCOUNT, IDENTITY & CONTACT ---
  const [fullName, setFullName] = useState('');
  const [legalFirstName, setLegalFirstName] = useState('');
  const [legalMiddleName, setLegalMiddleName] = useState('');
  const [legalLastName, setLegalLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [operationScope, setOperationScope] = useState<'interstate' | 'intrastate_only'>('interstate');
  const [intrastateAdminConfirmed, setIntrastateAdminConfirmed] = useState(false);
  
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // --- STEP 2: EMPLOYMENT & CLASSIFICATION ---
  const [employmentType, setEmploymentType] = useState<'company_driver' | 'owner_operator_driver' | 'contractor' | 'temporary'>('company_driver');
  const [hireDate, setHireDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [employmentStartDate, setEmploymentStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [driverStatus, setDriverStatus] = useState<string>('active');
  const [ownerOperatorCompanyId, setOwnerOperatorCompanyId] = useState<string>('');
  
  // Dynamic Owner-Operator Company Data Fetching State
  const [ooCompanies, setOoCompanies] = useState<OwnerOperatorCompany[]>(ownerOperatorCompanies);
  const [ooLoading, setOoLoading] = useState<boolean>(false);
  const [ooError, setOoError] = useState<string | null>(null);

  // Dynamic Owner-Operator Fleet Truck Fetching State
  const [ooFleetTrucks, setOoFleetTrucks] = useState<Truck[]>([]);
  const [ooFleetLoading, setOoFleetLoading] = useState<boolean>(false);

  // --- STEP 3: CDL & COMPLIANCE ---
  const [cdlNumber, setCdlNumber] = useState('');
  const [cdlIssuingState, setCdlIssuingState] = useState('');
  const [cdlClass, setCdlClass] = useState('A');
  const [cdlEndorsements, setCdlEndorsements] = useState<string[]>([]);
  const [cdlRestrictions, setCdlRestrictions] = useState<string[]>([]);
  const [cdlIssueDate, setCdlIssueDate] = useState('');
  const [cdlExpirationDate, setCdlExpirationDate] = useState('');
  const [medicalCardIssueDate, setMedicalCardIssueDate] = useState('');
  const [medicalCardExpirationDate, setMedicalCardExpirationDate] = useState('');
  const [clearinghouseStatus, setClearinghouseStatus] = useState<'cleared' | 'pending' | 'not_registered'>('cleared');
  const [clearinghouseQueryDate, setClearinghouseQueryDate] = useState('');
  const [drugTestingEnrollmentDate, setDrugTestingEnrollmentDate] = useState('');
  const [driverQualificationFileStatus, setDriverQualificationFileStatus] = useState('complete');

  // --- STEP 4: TRUCK ASSIGNMENT ---
  const [truckAssignmentMethod, setTruckAssignmentMethod] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [truckSearchTerm, setTruckSearchTerm] = useState('');
  const [overrideConflict, setOverrideConflict] = useState(false);
  const [conflictOverrideReason, setConflictOverrideReason] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [ignoreDuplicateWarning, setIgnoreDuplicateWarning] = useState(false);

  // New Truck Form Fields
  const [newTruckNumber, setNewTruckNumber] = useState('');
  const [newTruckVin, setNewTruckVin] = useState('');
  const [newTruckMake, setNewTruckMake] = useState('Peterbilt');
  const [newTruckModel, setNewTruckModel] = useState('579');
  const [newTruckYear, setNewTruckYear] = useState('2024');
  const [newTruckPlate, setNewTruckPlate] = useState('');
  const [newTruckPlateState, setNewTruckPlateState] = useState('TX');
  const [newTruckRegExp, setNewTruckRegExp] = useState('');
  const [newTruckAnnualInspExp, setNewTruckAnnualInspExp] = useState('');

  // --- STEP 5: DOCUMENTS ---
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docTypeToUpload, setDocTypeToUpload] = useState<string>('cdl_front');

  // --- UI & SUBMISSION STATE ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Post-submission registration summary result state
  const [onboardingResult, setOnboardingResult] = useState<{
    driverId: string;
    driverName: string;
    email: string;
    activationLink: string;
    invitationStatus: string;
    ageEligibilityStatus: string;
    driverStatus: string;
  } | null>(null);

  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch Owner-Operator Companies on Mount / Company Change
  const loadOwnerOperatorCompanies = async () => {
    setOoLoading(true);
    setOoError(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/personnel/owner-operator-companies?companyId=${company.id}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.ownerOperatorCompanies)) {
        setOoCompanies(data.ownerOperatorCompanies);
      } else {
        setOoCompanies(ownerOperatorCompanies || []);
      }
    } catch (err: any) {
      console.error("Failed to load owner-operator companies:", err);
      setOoError("Could not load owner-operator companies.");
      setOoCompanies(ownerOperatorCompanies || []);
    } finally {
      setOoLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerOperatorCompanies();
  }, [company.id]);

  // Fetch Owner-Operator Fleet when an Owner-Operator Company is selected
  useEffect(() => {
    if (!ownerOperatorCompanyId) {
      setOoFleetTrucks([]);
      return;
    }
    let isMounted = true;
    const fetchOOFleet = async () => {
      setOoFleetLoading(true);
      try {
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const res = await fetch(`/api/personnel/owner-operator-fleet?companyId=${company.id}&ownerOperatorCompanyId=${ownerOperatorCompanyId}`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.fleetTrucks)) {
          setOoFleetTrucks(data.fleetTrucks);
        }
      } catch (err) {
        console.error("Failed to fetch OO fleet:", err);
      } finally {
        if (isMounted) setOoFleetLoading(false);
      }
    };

    fetchOOFleet();
    return () => { isMounted = false; };
  }, [company.id, ownerOperatorCompanyId]);

  // Reset truck selection when OO company changes
  useEffect(() => {
    setSelectedTruckId('');
    setTruckSearchTerm('');
  }, [ownerOperatorCompanyId]);

  // AGE ELIGIBILITY COMPUTATIONS
  const driverAge = dateOfBirth ? calculateAge(dateOfBirth, employmentStartDate) : 0;
  const maxInterstateBirthDate = getMaxInterstateBirthDate(employmentStartDate);
  const isInterstateAgeBlocked = Boolean(dateOfBirth && operationScope === 'interstate' && driverAge < 21);
  const isIntrastateReviewRequired = Boolean(dateOfBirth && operationScope === 'intrastate_only' && driverAge < 21 && !intrastateAdminConfirmed);

  // FILTERED TRUCKS LIST FOR STEP 4
  const availableTruckList = ownerOperatorCompanyId ? ooFleetTrucks : existingTrucks;
  const filteredTrucks = availableTruckList.filter(t => {
    const q = truckSearchTerm.toLowerCase();
    return (
      (t.truckNumber || '').toLowerCase().includes(q) ||
      (t.vin || '').toLowerCase().includes(q) ||
      (t.licensePlate || '').toLowerCase().includes(q)
    );
  });

  const selectedTruck = availableTruckList.find(t => t.id === selectedTruckId);
  const hasAssignmentConflict = Boolean(selectedTruck && (selectedTruck.currentDriverId || selectedTruck.currentDriverName));

  // HANDLER: CHECK TRUCK DUPLICATES
  const handleCheckDuplicateTruck = async () => {
    if (!newTruckNumber && !newTruckVin) {
      setDuplicateWarning('Please enter a Truck Number or VIN to check.');
      return;
    }
    setDuplicateWarning(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/personnel/check-truck-duplicate?companyId=${company.id}&truckNumber=${encodeURIComponent(newTruckNumber)}&vin=${encodeURIComponent(newTruckVin)}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (data.hasConflict) {
        setDuplicateWarning(`Conflict: Truck #${data.conflictingTruck?.truckNumber || newTruckNumber} or VIN is already registered.`);
      } else {
        setSuccessMessage('No duplicate trucks found. Vehicle identifiers are available!');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err: any) {
      console.error("Duplicate check error:", err);
    }
  };

  // HANDLER: FILE UPLOAD (Real Document Processing)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 15MB maximum threshold.');
      return;
    }

    const tempDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newDoc: UploadedDoc = {
      id: tempDocId,
      fileName: file.name,
      documentType: docTypeToUpload,
      entityType: 'driver',
      fileSize: file.size,
      mimeType: file.type,
      status: 'uploading',
      progress: 40,
      fileObj: file
    };

    setUploadedDocs(prev => [...prev, newDoc]);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Content = (reader.result as string).split(',')[1];
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const res = await fetch('/api/personnel/upload-document', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            companyId: company.id,
            entityType: 'driver',
            documentType: docTypeToUpload,
            fileName: file.name,
            fileContentBase64: base64Content,
            mimeType: file.type
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setUploadedDocs(prev => prev.map(d => d.id === tempDocId ? {
            ...d,
            status: 'completed',
            progress: 100,
            storagePath: data.document.storagePath
          } : d));
        } else {
          setUploadedDocs(prev => prev.map(d => d.id === tempDocId ? {
            ...d,
            status: 'error',
            errorMsg: data.error || 'Upload failed'
          } : d));
        }
      };
      reader.onerror = () => {
        setUploadedDocs(prev => prev.map(d => d.id === tempDocId ? {
          ...d,
          status: 'error',
          errorMsg: 'FileReader failed to read document.'
        } : d));
      };
    } catch (err: any) {
      setUploadedDocs(prev => prev.map(d => d.id === tempDocId ? {
        ...d,
        status: 'error',
        errorMsg: err.message || 'Network upload error'
      } : d));
    }
  };

  // HANDLER: RESEND ACTIVATION EMAIL
  const handleResendActivation = async () => {
    if (!onboardingResult) return;
    setResendingEmail(true);
    setResendStatus(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/personnel/resend-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId: company.id,
          driverId: onboardingResult.driverId,
          email: onboardingResult.email
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResendStatus('Activation link email successfully queued and resent!');
        if (data.activationLink) {
          setOnboardingResult(prev => prev ? { ...prev, activationLink: data.activationLink } : null);
        }
      } else {
        setResendStatus(`Resend failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setResendStatus(`Error: ${err.message}`);
    } finally {
      setResendingEmail(false);
    }
  };

  // HANDLER: SUBMIT ONBOARDING WIZARD
  const handleSubmitOnboarding = async (isDraft: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // Frontend validations
    if (!isDraft) {
      if (!legalFirstName.trim() || !legalLastName.trim()) {
        setErrorMessage('Legal First and Last Name are required.');
        setActiveStep(1);
        return;
      }
      if (!email.trim()) {
        setErrorMessage('Driver email address is required for activation.');
        setActiveStep(1);
        return;
      }
      if (isInterstateAgeBlocked) {
        setErrorMessage(`Driver is ${driverAge} years old and ineligible for Interstate commerce (must be 21+). Correct birth date or select Intrastate-Only scope.`);
        setActiveStep(1);
        return;
      }
      if (isIntrastateReviewRequired) {
        setErrorMessage('Under-21 Intrastate-Only drivers require explicit admin eligibility confirmation checkbox.');
        setActiveStep(1);
        return;
      }
      if (employmentType === 'owner_operator_driver' && !ownerOperatorCompanyId) {
        setErrorMessage('Please select an affiliated Owner-Operator Company for this 1099 driver.');
        setActiveStep(2);
        return;
      }
      if (!cdlNumber.trim() || !cdlExpirationDate) {
        setErrorMessage('Valid CDL License Number and Expiration Date are required.');
        setActiveStep(3);
        return;
      }
      if (truckAssignmentMethod === 'existing' && !selectedTruckId) {
        setErrorMessage('Please select a truck from the Fleet Registry.');
        setActiveStep(4);
        return;
      }
      if (truckAssignmentMethod === 'existing' && hasAssignmentConflict && !overrideConflict) {
        setErrorMessage(`Truck #${selectedTruck?.truckNumber} is currently assigned. Check override box to reassign.`);
        setActiveStep(4);
        return;
      }
      if (truckAssignmentMethod === 'new' && (!newTruckNumber.trim() || !newTruckVin.trim())) {
        setErrorMessage('New truck requires both a Truck Number and a 17-digit VIN.');
        setActiveStep(4);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      
      const payload = {
        companyId: company.id,
        isDraft,
        fullName: fullName || `${legalFirstName} ${legalLastName}`.trim(),
        legalFirstName,
        legalMiddleName,
        legalLastName,
        preferredName,
        email,
        phone,
        dateOfBirth,
        operationScope,
        intrastateAdminConfirmed,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        countryCode,
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,

        employmentType,
        hireDate,
        employmentStartDate,
        driverStatus,
        ownerOperatorCompanyId,

        cdlNumber,
        cdlIssuingState,
        cdlClass,
        cdlEndorsements,
        cdlRestrictions,
        cdlIssueDate,
        cdlExpirationDate,
        medicalCardIssueDate,
        medicalCardExpirationDate,
        clearinghouseStatus,
        clearinghouseQueryDate,
        drugTestingEnrollmentDate,
        driverQualificationFileStatus,

        truckAssignmentMethod,
        selectedTruckId,
        overrideConflict,
        conflictOverrideReason,
        ignoreDuplicateWarning,

        newTruckData: truckAssignmentMethod === 'new' ? {
          truckNumber: newTruckNumber,
          vin: newTruckVin,
          make: newTruckMake,
          model: newTruckModel,
          year: newTruckYear,
          licensePlate: newTruckPlate,
          licensePlateState: newTruckPlateState,
          registrationExpirationDate: newTruckRegExp,
          annualInspectionExpirationDate: newTruckAnnualInspExp,
          ownerOperatorCompanyId: ownerOperatorCompanyId || null
        } : null,

        documents: uploadedDocs.filter(d => d.status === 'completed').map(d => ({
          fileName: d.fileName,
          documentType: d.documentType,
          entityType: d.entityType,
          storagePath: d.storagePath
        }))
      };

      const res = await fetch('/api/personnel/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'DUPLICATE_TRUCK_DETECTED') {
          setActiveStep(4);
          setDuplicateWarning(data.message);
          throw new Error(data.message);
        }
        if (data.error === 'ASSIGNMENT_CONFLICT_DETECTED') {
          setActiveStep(4);
          throw new Error(data.message);
        }
        if (data.error === 'COMMERCIAL_AGE_INELIGIBLE') {
          setActiveStep(1);
          throw new Error(data.message);
        }
        throw new Error(data.error || 'Failed to complete driver onboarding');
      }

      setSuccessMessage(data.message);

      // Save onboarding result card
      setOnboardingResult({
        driverId: data.driverId,
        driverName: payload.fullName,
        email: payload.email,
        activationLink: data.activationLink || '',
        invitationStatus: data.invitationStatus || 'email_queued',
        ageEligibilityStatus: data.ageEligibilityStatus || 'eligible',
        driverStatus: data.driverStatus || 'active'
      });

      onSuccess();
    } catch (err: any) {
      console.error('Onboarding submission error:', err);
      setErrorMessage(err.message || 'An error occurred during onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Account & Contact', icon: UserPlus },
    { num: 2, title: 'Employment', icon: Building2 },
    { num: 3, title: 'CDL & Compliance', icon: ShieldCheck },
    { num: 4, title: 'Truck Assignment', icon: TruckIcon },
    { num: 5, title: 'Documents', icon: FileText },
    { num: 6, title: 'Review & Submit', icon: CheckCircle2 }
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-2xl border border-purple-400/30">
              <UserPlus className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Onboard New CDL Driver</h2>
              <p className="text-xs text-purple-200/80">Unified Driver Registration & Centralized Fleet Assignment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* POST-SUBMISSION REGISTRATION & ACTIVATION CARD */}
        {onboardingResult ? (
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600 text-white rounded-2xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-emerald-950">Driver Onboarded & Registered Successfully!</h3>
                  <p className="text-emerald-800 text-xs">Driver record created in centralized database with full compliance tracking.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-2xl border border-emerald-200 text-slate-700 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold font-sans">Driver ID</span>
                  <span className="font-bold text-slate-900">{onboardingResult.driverId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold font-sans">Name</span>
                  <span className="font-bold text-slate-900">{onboardingResult.driverName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold font-sans">Email</span>
                  <span className="font-bold text-slate-900">{onboardingResult.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold font-sans">Status</span>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-900 rounded font-bold uppercase text-[9px]">{onboardingResult.driverStatus}</span>
                </div>
              </div>

              {/* ACTIVATION LINK SECTION */}
              <div className="p-4 bg-white border border-indigo-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-indigo-950 flex items-center gap-1.5 text-xs">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    Driver Secure Account Activation Link
                  </span>
                  <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded-full text-[10px]">
                    Status: {onboardingResult.invitationStatus}
                  </span>
                </div>

                {onboardingResult.activationLink ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={onboardingResult.activationLink}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-mono text-[10px] text-slate-700 select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(onboardingResult.activationLink);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2500);
                        }}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Share this activation link directly with the driver or check the invitation queue in system settings.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Activation link generation queued. Click 'Resend Activation Email' below to trigger immediate link dispatch.
                  </p>
                )}

                {/* RESEND BUTTON */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={handleResendActivation}
                    disabled={resendingEmail}
                    className="px-3.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold rounded-xl flex items-center gap-1.5 transition disabled:opacity-50 text-xs"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${resendingEmail ? 'animate-spin' : ''}`} />
                    <span>Resend Activation Email</span>
                  </button>

                  {resendStatus && (
                    <span className="text-[11px] font-bold text-indigo-700">{resendStatus}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setOnboardingResult(null);
                    setActiveStep(1);
                    setFullName('');
                    setLegalFirstName('');
                    setLegalLastName('');
                    setEmail('');
                    setCdlNumber('');
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100"
                >
                  Onboard Another Driver
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-md"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* STEPPER PROGRESS BAR */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 px-6 shrink-0 overflow-x-auto">
              <div className="flex items-center justify-between min-w-[600px] gap-2">
                {steps.map(s => {
                  const IconComp = s.icon;
                  const isActive = activeStep === s.num;
                  const isDone = activeStep > s.num;
                  return (
                    <button
                      key={s.num}
                      onClick={() => setActiveStep(s.num)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-sm'
                          : isDone
                          ? 'bg-purple-100 text-purple-900 hover:bg-purple-200'
                          : 'text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        isActive ? 'bg-white text-purple-700' : isDone ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isDone ? '✓' : s.num}
                      </span>
                      <span>{s.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ALERT NOTIFICATIONS */}
            {errorMessage && (
              <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* MODAL BODY (SCROLLABLE) */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* STEP 1: ACCOUNT & CONTACT */}
              {activeStep === 1 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">1. Account, Identity & Contact Information</h3>
                    <p className="text-slate-500">Legal driver name, birth date, age qualification, contact coordinates, and address.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Legal First Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="John"
                        value={legalFirstName}
                        onChange={(e) => setLegalFirstName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Middle Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="Robert"
                        value={legalMiddleName}
                        onChange={(e) => setLegalMiddleName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Legal Last Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Doe"
                        value={legalLastName}
                        onChange={(e) => setLegalLastName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Display / Preferred Name</label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Date of Birth (DOB) *</label>
                      <input
                        type="date"
                        required
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                      />
                    </div>
                  </div>

                  {/* COMMERCIAL DRIVING SCOPE & AGE ELIGIBILITY SECTION */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <span className="font-extrabold text-slate-900 block uppercase tracking-wider text-[11px]">
                      Commercial Operating Scope & Age Eligibility
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                        operationScope === 'interstate' ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white'
                      }`}>
                        <input
                          type="radio"
                          name="opScope"
                          checked={operationScope === 'interstate'}
                          onChange={() => setOperationScope('interstate')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">Interstate Commerce</span>
                          <span className="text-slate-500 text-[10px]">Crosses state lines. Requires age 21+ per FMCSA.</span>
                        </div>
                      </label>

                      <label className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                        operationScope === 'intrastate_only' ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white'
                      }`}>
                        <input
                          type="radio"
                          name="opScope"
                          checked={operationScope === 'intrastate_only'}
                          onChange={() => setOperationScope('intrastate_only')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">Intrastate-Only Scope</span>
                          <span className="text-slate-500 text-[10px]">Operates exclusively within home state. Subject to state rules.</span>
                        </div>
                      </label>
                    </div>

                    {/* DYNAMIC AGE ELIGIBILITY BANNERS */}
                    {isInterstateAgeBlocked && (
                      <div className="p-3.5 bg-rose-100 border-2 border-rose-300 text-rose-950 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-2 font-extrabold text-rose-900">
                          <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0" />
                          <span>Interstate Commercial Driving Age Ineligible</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          Commercial drivers operating in interstate commerce must be at least 21 years of age as of employment start date ({employmentStartDate}). Based on birth date {dateOfBirth}, driver will be <span className="font-bold">{driverAge} years old</span>. Maximum birth date allowed for 21+ interstate drivers: <span className="font-mono font-bold">{maxInterstateBirthDate}</span>.
                        </p>
                      </div>
                    )}

                    {isIntrastateReviewRequired && (
                      <div className="p-3.5 bg-amber-100 border-2 border-amber-300 text-amber-950 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 font-extrabold text-amber-900">
                          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                          <span>Intrastate-Only Under-21 Age Exception Confirmation</span>
                        </div>
                        <p className="text-[11px]">
                          Driver is <span className="font-bold">{driverAge} years old</span> operating under Intrastate-Only commerce scope. State commercial regulations permit under-21 operators subject to state certification. Please check the confirmation box below to verify qualification.
                        </p>
                        <label className="flex items-center gap-2 font-bold text-amber-950 text-xs cursor-pointer pt-1 border-t border-amber-200">
                          <input
                            type="checkbox"
                            checked={intrastateAdminConfirmed}
                            onChange={(e) => setIntrastateAdminConfirmed(e.target.checked)}
                            className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                          />
                          <span>Confirm Intrastate-Only Under-21 State Exception & Qualification</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
                      <input
                        type="email"
                        required
                        placeholder="john.doe@logistics.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="(555) 392-1092"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Address Fields */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 mt-2">
                    <span className="font-bold text-slate-800 block">Physical Address</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Address Line 1"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Address Line 2 (Apt/Suite)"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="p-2 border border-slate-300 rounded-xl bg-white col-span-2"
                      />
                      <input
                        type="text"
                        placeholder="State"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        className="p-2 border border-slate-300 rounded-xl bg-white font-mono uppercase"
                      />
                      <input
                        type="text"
                        placeholder="ZIP"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="p-2 border border-slate-300 rounded-xl bg-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-3">
                    <span className="font-bold text-purple-950 block">Emergency Contact</span>
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Contact Name"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="p-2 border border-purple-200 rounded-xl bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Relationship (e.g. Spouse)"
                        value={emergencyContactRelationship}
                        onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                        className="p-2 border border-purple-200 rounded-xl bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Emergency Phone"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        className="p-2 border border-purple-200 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: EMPLOYMENT & CLASSIFICATION */}
              {activeStep === 2 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">2. Employment & Classification</h3>
                    <p className="text-slate-500">Employment status, owner-operator company linkage, and fleet classification.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Employment Type</label>
                      <select
                        value={employmentType}
                        onChange={(e: any) => setEmploymentType(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="company_driver">Company Driver (W-2)</option>
                        <option value="owner_operator_driver">Owner-Operator Driver (1099)</option>
                        <option value="contractor">Contractor / Fleet Lease</option>
                        <option value="temporary">Temporary / Relief Operator</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Initial Status</label>
                      <select
                        value={driverStatus}
                        onChange={(e: any) => setDriverStatus(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="active">Active (Full Operational Access)</option>
                        <option value="onboarding">Onboarding / Pending Documents</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Hire Date</label>
                      <input
                        type="date"
                        value={hireDate}
                        onChange={(e) => setHireDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Employment Start Date</label>
                      <input
                        type="date"
                        value={employmentStartDate}
                        onChange={(e) => setEmploymentStartDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                  </div>

                  {/* OWNER OPERATOR COMPANY LINKAGE SELECTOR */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block font-bold text-slate-800">
                        Owner-Operator Company Linkage {employmentType === 'owner_operator_driver' ? '*' : '(Optional)'}
                      </label>
                      {ooLoading && <span className="text-purple-600 font-bold text-[10px]">Loading OO Companies...</span>}
                    </div>

                    {ooError && (
                      <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between">
                        <span>{ooError}</span>
                        <button
                          onClick={loadOwnerOperatorCompanies}
                          className="px-2 py-0.5 bg-rose-600 text-white font-bold rounded text-[10px]"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    <select
                      value={ownerOperatorCompanyId}
                      onChange={(e) => setOwnerOperatorCompanyId(e.target.value)}
                      className={`w-full p-2.5 border rounded-xl bg-white ${
                        employmentType === 'owner_operator_driver' && !ownerOperatorCompanyId
                          ? 'border-amber-400 focus:ring-amber-500'
                          : 'border-slate-300 focus:ring-purple-500'
                      }`}
                    >
                      <option value="">-- None (Direct Carrier Fleet) --</option>
                      {ooCompanies.map(oo => (
                        <option key={oo.id} value={oo.id}>
                          {oo.companyName || oo.legalName || oo.ownerName} (EIN: {oo.taxId || 'N/A'})
                        </option>
                      ))}
                    </select>

                    {employmentType === 'owner_operator_driver' && ooCompanies.length === 0 && !ooLoading && (
                      <p className="text-[11px] text-amber-800 font-medium">
                        No active owner-operator companies found in registry. You can create owner-operator entities in Accounting Center.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: CDL & COMPLIANCE */}
              {activeStep === 3 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">3. CDL License & Compliance Qualification</h3>
                    <p className="text-slate-500">Record Commercial Driver License, Medical Examiner Card, and FMCSA Clearinghouse records.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CDL Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="CDL-TX-892341"
                        value={cdlNumber}
                        onChange={(e) => setCdlNumber(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Issuing State *</label>
                      <input
                        type="text"
                        required
                        placeholder="TX"
                        value={cdlIssuingState}
                        onChange={(e) => setCdlIssuingState(e.target.value.toUpperCase())}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">License Class</label>
                      <select
                        value={cdlClass}
                        onChange={(e) => setCdlClass(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="A">Class A</option>
                        <option value="B">Class B</option>
                        <option value="C">Class C</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CDL Issue Date</label>
                      <input
                        type="date"
                        value={cdlIssueDate}
                        onChange={(e) => setCdlIssueDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CDL Expiration Date *</label>
                      <input
                        type="date"
                        required
                        value={cdlExpirationDate}
                        onChange={(e) => setCdlExpirationDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-purple-900 bg-purple-50/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Medical Card Issue Date</label>
                      <input
                        type="date"
                        value={medicalCardIssueDate}
                        onChange={(e) => setMedicalCardIssueDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Medical Card Expiration Date *</label>
                      <input
                        type="date"
                        required
                        value={medicalCardExpirationDate}
                        onChange={(e) => setMedicalCardExpirationDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-purple-900 bg-purple-50/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">FMCSA Clearinghouse Status</label>
                      <select
                        value={clearinghouseStatus}
                        onChange={(e: any) => setClearinghouseStatus(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="cleared">Cleared (No Violations Found)</option>
                        <option value="pending">Query Pending</option>
                        <option value="not_registered">Not Registered</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Drug & Alcohol Program Enrollment</label>
                      <input
                        type="date"
                        value={drugTestingEnrollmentDate}
                        onChange={(e) => setDrugTestingEnrollmentDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: TRUCK ASSIGNMENT */}
              {activeStep === 4 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">4. Centralized Fleet Truck Assignment</h3>
                    <p className="text-slate-500">Choose how to pair this driver with a truck in the central fleet registry.</p>
                  </div>

                  {/* SEGMENTED CONTROL SELECTION */}
                  <div className="space-y-3">
                    <label className="block font-extrabold text-slate-900 text-xs tracking-wider uppercase">
                      TRUCK ASSIGNMENT METHOD
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      
                      {/* OPTION 1: NONE */}
                      <label className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        truckAssignmentMethod === 'none'
                          ? 'border-purple-600 bg-purple-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="truckMethod"
                            checked={truckAssignmentMethod === 'none'}
                            onChange={() => setTruckAssignmentMethod('none')}
                            className="mt-1 text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">No truck assigned yet</span>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                              Create driver without an active vehicle. Driver can be assigned later via Fleet Center.
                            </p>
                          </div>
                        </div>
                      </label>

                      {/* OPTION 2: SELECT EXISTING */}
                      <label className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        truckAssignmentMethod === 'existing'
                          ? 'border-purple-600 bg-purple-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="truckMethod"
                            checked={truckAssignmentMethod === 'existing'}
                            onChange={() => setTruckAssignmentMethod('existing')}
                            className="mt-1 text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">Select an existing truck</span>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                              Pair with a vehicle currently registered in your central Fleet Registry.
                            </p>
                          </div>
                        </div>
                      </label>

                      {/* OPTION 3: CREATE NEW TRUCK */}
                      <label className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        truckAssignmentMethod === 'new'
                          ? 'border-purple-600 bg-purple-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="truckMethod"
                            checked={truckAssignmentMethod === 'new'}
                            onChange={() => setTruckAssignmentMethod('new')}
                            className="mt-1 text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">Create new truck & assign</span>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                              Register a new central truck record in Fleet Registry and assign this driver immediately.
                            </p>
                          </div>
                        </div>
                      </label>

                    </div>
                  </div>

                  {/* SUB-SECTION FOR OPTION 2: SELECT EXISTING TRUCK */}
                  {truckAssignmentMethod === 'existing' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">
                          {ownerOperatorCompanyId ? 'Owner-Operator Fleet Trucks' : 'Central Carrier Fleet Registry'}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {ooFleetLoading ? 'Loading OO Fleet...' : `${availableTruckList.length} trucks available`}
                        </span>
                      </div>

                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search by Truck #, VIN, or License Plate..."
                          value={truckSearchTerm}
                          onChange={(e) => setTruckSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white text-xs"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {filteredTrucks.map(trk => {
                          const isSelected = selectedTruckId === trk.id;
                          const isAssigned = trk.currentDriverId || trk.currentDriverName;
                          return (
                            <div
                              key={trk.id}
                              onClick={() => setSelectedTruckId(trk.id)}
                              className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                                isSelected
                                  ? 'border-purple-600 bg-purple-100/70 font-semibold'
                                  : 'border-slate-200 bg-white hover:bg-slate-100'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-900 block">Unit #{trk.truckNumber} ({trk.makeModel || `${trk.make || ''} ${trk.model || ''}`.trim() || 'Tractor'})</span>
                                <span className="text-slate-500 font-mono text-[10px] block">VIN: {trk.vin || 'N/A'} • Plate: {trk.licensePlate || 'N/A'} ({trk.licensePlateState || 'TX'})</span>
                              </div>
                              
                              <div className="text-right">
                                {isAssigned ? (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded text-[10px]">
                                    Assigned to {trk.currentDriverName || 'Driver'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                                    Unassigned / Available
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {filteredTrucks.length === 0 && (
                          <p className="text-slate-400 text-center py-4 italic text-[11px]">No matching trucks found in registry.</p>
                        )}
                      </div>

                      {/* CONFLICT WARNING BANNER */}
                      {hasAssignmentConflict && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
                          <div className="flex items-center gap-2 font-bold text-amber-800">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Assignment Conflict Detected</span>
                          </div>
                          <p className="text-[11px]">
                            Truck <span className="font-bold">#{selectedTruck?.truckNumber}</span> is currently assigned to <span className="font-bold">{selectedTruck?.currentDriverName || 'another driver'}</span>.
                          </p>
                          
                          <div className="pt-2 border-t border-amber-200/80 space-y-2">
                            <label className="flex items-center gap-2 font-bold text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={overrideConflict}
                                onChange={(e) => setOverrideConflict(e.target.checked)}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>Reassign Truck #{selectedTruck?.truckNumber} and end previous active assignment</span>
                            </label>

                            {overrideConflict && (
                              <input
                                type="text"
                                placeholder="Reason for reassignment override..."
                                value={conflictOverrideReason}
                                onChange={(e) => setConflictOverrideReason(e.target.value)}
                                className="w-full p-2 border border-amber-300 rounded-lg bg-white text-xs"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-SECTION FOR OPTION 3: CREATE NEW TRUCK */}
                  {truckAssignmentMethod === 'new' && (
                    <div className="p-4 bg-purple-50/40 border border-purple-200 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                        <span className="font-bold text-purple-950 flex items-center gap-2">
                          <TruckIcon className="w-4 h-4 text-purple-700" />
                          Create new truck in Central Fleet Registry
                        </span>
                        <button
                          type="button"
                          onClick={handleCheckDuplicateTruck}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-bold"
                        >
                          Check for Duplicates
                        </button>
                      </div>

                      {duplicateWarning && (
                        <div className="p-3 bg-amber-100 border border-amber-300 text-amber-900 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>{duplicateWarning}</span>
                          </div>
                          <label className="flex items-center gap-1.5 font-bold text-[10px]">
                            <input
                              type="checkbox"
                              checked={ignoreDuplicateWarning}
                              onChange={(e) => setIgnoreDuplicateWarning(e.target.checked)}
                            />
                            <span>Proceed anyway</span>
                          </label>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Truck Number *</label>
                          <input
                            type="text"
                            required
                            placeholder="TRK-404"
                            value={newTruckNumber}
                            onChange={(e) => setNewTruckNumber(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">VIN (Vehicle Identification Number) *</label>
                          <input
                            type="text"
                            required
                            placeholder="1X4AL49X8RD291048"
                            value={newTruckVin}
                            onChange={(e) => setNewTruckVin(e.target.value.toUpperCase())}
                            className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Make</label>
                          <input
                            type="text"
                            value={newTruckMake}
                            onChange={(e) => setNewTruckMake(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Model</label>
                          <input
                            type="text"
                            value={newTruckModel}
                            onChange={(e) => setNewTruckModel(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Year</label>
                          <input
                            type="text"
                            value={newTruckYear}
                            onChange={(e) => setNewTruckYear(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">License Plate</label>
                          <input
                            type="text"
                            placeholder="TX-89104"
                            value={newTruckPlate}
                            onChange={(e) => setNewTruckPlate(e.target.value.toUpperCase())}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Plate State</label>
                          <input
                            type="text"
                            value={newTruckPlateState}
                            onChange={(e) => setNewTruckPlateState(e.target.value.toUpperCase())}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono"
                          />
                        </div>
                      </div>

                      {/* Vehicle Compliance Expirations */}
                      <div className="p-3 bg-white border border-purple-100 rounded-xl space-y-2">
                        <span className="font-bold text-purple-900 block">Vehicle Compliance & Expirations</span>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-600 font-semibold mb-1">Registration Expiration</label>
                            <input
                              type="date"
                              value={newTruckRegExp}
                              onChange={(e) => setNewTruckRegExp(e.target.value)}
                              className="w-full p-2 border border-slate-300 rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 font-semibold mb-1">Annual DOT Inspection Exp.</label>
                            <input
                              type="date"
                              value={newTruckAnnualInspExp}
                              onChange={(e) => setNewTruckAnnualInspExp(e.target.value)}
                              className="w-full p-2 border border-slate-300 rounded-xl"
                            />
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-purple-800 font-semibold italic">
                        Save this truck to the centralized Fleet Registry and assign it to the new driver.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5: DOCUMENTS */}
              {activeStep === 5 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">5. Driver Qualification Documents & Verification</h3>
                    <p className="text-slate-500">Upload CDL front/back, Medical Examiner Card, MVR report, and Clearinghouse proof.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Document Type</label>
                      <select
                        value={docTypeToUpload}
                        onChange={(e) => setDocTypeToUpload(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        <option value="cdl_front">CDL License (Front)</option>
                        <option value="cdl_back">CDL License (Back)</option>
                        <option value="medical_card">Medical Examiner Certificate</option>
                        <option value="mvr_report">Motor Vehicle Report (MVR)</option>
                        <option value="clearinghouse_query">FMCSA Clearinghouse Consent / Query Result</option>
                        <option value="drug_test_result">Drug & Alcohol Test Result</option>
                        <option value="driver_application">Signed Driver Application</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <label className="w-full p-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl cursor-pointer text-center flex items-center justify-center gap-2 shadow-sm transition">
                        <Upload className="w-4 h-4" />
                        <span>Select & Upload Document</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* UPLOADED DOCUMENTS LIST */}
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-slate-800 block">Attached Qualification Files ({uploadedDocs.length})</span>
                    
                    {uploadedDocs.map(doc => (
                      <div key={doc.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between bg-white">
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{doc.fileName}</span>
                            <span className="text-slate-400 text-[10px] block">Type: {doc.documentType.replace('_', ' ').toUpperCase()}</span>
                          </div>
                        </div>

                        <div>
                          {doc.status === 'uploading' && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded animate-pulse">
                              Uploading ({doc.progress}%)
                            </span>
                          )}
                          {doc.status === 'completed' && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Uploaded
                            </span>
                          )}
                          {doc.status === 'error' && (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-600" /> {doc.errorMsg || 'Error'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {uploadedDocs.length === 0 && (
                      <p className="text-slate-400 text-center py-6 italic text-[11px] border-2 border-dashed border-slate-200 rounded-2xl">
                        No documents attached yet. Documents can also be uploaded after driver creation.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 6: REVIEW & SUBMIT */}
              {activeStep === 6 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-sm text-slate-900">6. Review Onboarding Profile & Confirm Activation</h3>
                    <p className="text-slate-500">Verify all information before creating database records and triggering activation emails.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* DRIVER SUMMARY */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                      <span className="font-extrabold text-slate-900 text-xs block uppercase tracking-wider">Driver Profile Summary</span>
                      <div className="space-y-1 text-slate-700">
                        <p><span className="font-bold">Name:</span> {fullName || `${legalFirstName} ${legalLastName}`}</p>
                        <p><span className="font-bold">DOB & Age:</span> {dateOfBirth || 'N/A'} ({driverAge} yrs)</p>
                        <p><span className="font-bold">Scope:</span> <span className="uppercase font-bold">{operationScope}</span></p>
                        <p><span className="font-bold">Email:</span> {email}</p>
                        <p><span className="font-bold">Phone:</span> {phone || 'N/A'}</p>
                        <p><span className="font-bold">CDL #:</span> {cdlNumber} ({cdlIssuingState})</p>
                        <p><span className="font-bold">CDL Expiration:</span> {cdlExpirationDate || 'N/A'}</p>
                        <p><span className="font-bold">Employment:</span> {employmentType.replace('_', ' ')}</p>
                      </div>
                    </div>

                    {/* TRUCK ASSIGNMENT SUMMARY */}
                    <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-2">
                      <span className="font-extrabold text-purple-950 text-xs block uppercase tracking-wider">Truck Assignment Summary</span>
                      {truckAssignmentMethod === 'none' && (
                        <p className="text-slate-600 italic">No truck assigned. Driver can be assigned later via Fleet Center.</p>
                      )}
                      {truckAssignmentMethod === 'existing' && (
                        <div className="space-y-1 text-purple-900">
                          <p><span className="font-bold">Assigned Truck:</span> Unit #{selectedTruck?.truckNumber}</p>
                          <p><span className="font-bold">VIN:</span> {selectedTruck?.vin || 'N/A'}</p>
                          <p><span className="font-bold">Make/Model:</span> {selectedTruck?.makeModel || 'N/A'}</p>
                          <p><span className="font-bold">Mode:</span> Existing Central Fleet Truck</p>
                        </div>
                      )}
                      {truckAssignmentMethod === 'new' && (
                        <div className="space-y-1 text-purple-900">
                          <p><span className="font-bold">New Central Truck:</span> Unit #{newTruckNumber}</p>
                          <p><span className="font-bold">VIN:</span> {newTruckVin}</p>
                          <p><span className="font-bold">Make/Model:</span> {newTruckMake} {newTruckModel} ({newTruckYear})</p>
                          <p><span className="font-bold">Mode:</span> New Central Record to be created in Fleet Registry</p>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* COMPLIANCE REQUIREMENTS PREVIEW */}
                  <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2">
                    <span className="font-bold text-emerald-950 block">Automatic Compliance Center Records to Create:</span>
                    <ul className="list-disc list-inside space-y-1 text-emerald-900 text-[11px]">
                      {cdlExpirationDate && <li>Driver Requirement: CDL License Renewal (Expires {cdlExpirationDate})</li>}
                      {medicalCardExpirationDate && <li>Driver Requirement: Medical Card Renewal (Expires {medicalCardExpirationDate})</li>}
                      {truckAssignmentMethod === 'new' && newTruckRegExp && <li>Vehicle Requirement: Truck #{newTruckNumber} Registration Renewal (Expires {newTruckRegExp})</li>}
                      {truckAssignmentMethod === 'new' && newTruckAnnualInspExp && <li>Vehicle Requirement: Truck #{newTruckNumber} DOT Annual Inspection (Expires {newTruckAnnualInspExp})</li>}
                    </ul>
                  </div>

                </div>
              )}

            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
                disabled={activeStep === 1 || isSubmitting}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30"
              >
                Previous
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSubmitOnboarding(true)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition disabled:opacity-50"
                >
                  Save Draft
                </button>

                {activeStep < 6 ? (
                  <button
                    onClick={() => setActiveStep(prev => Math.min(6, prev + 1))}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-sm transition flex items-center gap-1.5"
                  >
                    <span>Next Step</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubmitOnboarding(false)}
                    disabled={isSubmitting || isInterstateAgeBlocked || isIntrastateReviewRequired}
                    className="px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        <span>Processing Onboarding...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Create Driver & Send Secure Activation Link</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};
