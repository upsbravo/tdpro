import express from "express";
import fs from "fs";
import path from "path";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const getFirestoreDb = () => {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.firestoreDatabaseId) {
        return getFirestore(undefined, config.firestoreDatabaseId);
      }
    }
  } catch (err) {
    console.error("Error reading custom firestore database ID:", err);
  }
  return getFirestore();
};

const normalizeVin = (vin?: string | null): string => {
  if (!vin) return "";
  return vin.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
};

const normalizeTruckNum = (num?: string | null): string => {
  if (!num) return "";
  return num.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
};

async function verifyAuth(req: express.Request, companyId: string) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, status: 401, error: "Missing authorization token" };
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const callerUid = decodedToken.uid;
    const callerEmail = decodedToken.email;

    const db = getFirestoreDb();
    const userSnap = await db.collection("users").doc(callerUid).get();
    const user = userSnap.exists ? userSnap.data() : null;

    const dispatcherSnap = await db
      .collection("admins")
      .doc(companyId)
      .collection("dispatchers")
      .doc(callerUid)
      .get();

    const companySnap = await db.collection("admins").doc(companyId).get();
    const companyData = companySnap.exists ? companySnap.data() : null;

    const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || (user && user.role === "super_admin");
    const isTenantAdmin = user && user.role === "admin" && user.companyId === companyId;
    const isDispatcher = (user && user.role === "dispatcher" && user.companyId === companyId) || dispatcherSnap.exists;

    if (!isSuperAdmin && !isTenantAdmin && !isDispatcher) {
      return { authorized: false, status: 403, error: "Forbidden: You are not authorized for personnel operations in this company" };
    }

    const dispatcherData = dispatcherSnap.exists ? dispatcherSnap.data() : null;
    const dispatcherPermissions = dispatcherData?.permissions || user?.permissions || null;
    const driverOnboardingPolicy = companyData?.driverOnboardingPolicy || "dispatcher_with_permissions";

    return {
      authorized: true,
      callerUid,
      callerEmail,
      callerName: user?.name || decodedToken.name || callerEmail || "Operator",
      isSuperAdmin,
      isTenantAdmin,
      isDispatcher,
      dispatcherPermissions,
      driverOnboardingPolicy,
      user
    };
  } catch (err: any) {
    return { authorized: false, status: 401, error: err.message || "Invalid or expired token" };
  }
}

function calculateAgeAtDate(dobString: string, refDateString?: string): number {
  if (!dobString) return 0;
  const dob = new Date(dobString + "T00:00:00Z");
  const ref = refDateString ? new Date(refDateString + "T00:00:00Z") : new Date();
  if (isNaN(dob.getTime())) return 0;

  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

export function calculateDriverEffectiveAccess(driver: any, tenant: any, authUser?: any) {
  const tenantActive = !tenant || tenant.status === "active";
  const lifecycleStatus = driver?.lifecycleStatus || driver?.status || "onboarding";
  const accessStatus = driver?.accessStatus || (lifecycleStatus === "active" ? "active" : "pending");
  const onboardingStatus = driver?.onboardingStatus || (lifecycleStatus === "active" ? "completed" : "in_progress");
  const authNotDisabled = authUser ? authUser.disabled !== true : true;

  const isLifecycleActive = lifecycleStatus === "active";
  const isAccessActive = accessStatus === "active";
  const isOnboardingComplete = onboardingStatus === "completed" || driver?.status === "active";

  const effectiveAccess = tenantActive && isLifecycleActive && isAccessActive && isOnboardingComplete && authNotDisabled;

  let reason = "Access granted";
  if (!tenantActive) reason = "Tenant company account is inactive or pending";
  else if (!isLifecycleActive) reason = `Driver lifecycle status is ${lifecycleStatus}`;
  else if (!isAccessActive) reason = `Driver access status is ${accessStatus}`;
  else if (!isOnboardingComplete) reason = "Driver onboarding is incomplete";
  else if (!authNotDisabled) reason = "Driver Firebase Auth account is disabled";

  return {
    effectiveAccess,
    reason,
    lifecycleStatus,
    accessStatus,
    onboardingStatus,
    calculatedAt: new Date().toISOString(),
    calculationVersion: "1.0.0"
  };
}

export function registerPersonnelRoutes(app: express.Express) {
  /**
   * OWNER-OPERATOR COMPANIES LIST
   * GET /api/personnel/owner-operator-companies
   */
  app.get("/api/personnel/owner-operator-companies", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      if (!companyId) return res.status(400).json({ error: "Missing companyId query parameter" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const db = getFirestoreDb();
      const ooSnap = await db.collection("admins").doc(companyId).collection("owner_operators").get();
      const ownerOperatorCompanies: any[] = [];
      ooSnap.forEach(doc => {
        const data = doc.data();
        if (data.status !== "inactive" && data.status !== "terminated") {
          ownerOperatorCompanies.push({ id: doc.id, ...data });
        }
      });

      return res.json({ success: true, ownerOperatorCompanies });
    } catch (err: any) {
      console.error("Error fetching owner-operator companies:", err);
      return res.status(500).json({ error: err.message || "Failed to load owner-operator companies" });
    }
  });

  /**
   * OWNER-OPERATOR FLEET TRUCKS LIST
   * GET /api/personnel/owner-operator-fleet
   */
  app.get("/api/personnel/owner-operator-fleet", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      const ownerOperatorCompanyId = req.query.ownerOperatorCompanyId as string;
      if (!companyId) return res.status(400).json({ error: "Missing companyId query parameter" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const db = getFirestoreDb();
      const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      const fleetTrucks: any[] = [];

      trucksSnap.forEach(doc => {
        const trk = doc.data();
        if (
          !ownerOperatorCompanyId ||
          trk.ownerOperatorCompanyId === ownerOperatorCompanyId ||
          trk.currentOwnerOperatorCompanyId === ownerOperatorCompanyId
        ) {
          fleetTrucks.push({ id: doc.id, ...trk });
        }
      });

      return res.json({ success: true, fleetTrucks });
    } catch (err: any) {
      console.error("Error fetching owner-operator fleet:", err);
      return res.status(500).json({ error: err.message || "Failed to load owner-operator fleet" });
    }
  });

  /**
   * UPLOAD / RECORD DRIVER DOCUMENT
   * POST /api/personnel/upload-document
   */
  app.post("/api/personnel/upload-document", async (req, res) => {
    try {
      const {
        companyId,
        onboardingDraftId,
        entityType,
        entityId,
        documentType,
        fileName,
        fileBase64,
        mimeType,
        fileSize,
        issueDate,
        expirationDate
      } = req.body;

      if (!companyId) return res.status(400).json({ error: "Missing companyId" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const db = getFirestoreDb();
      const nowIso = new Date().toISOString();
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const safeFileName = (fileName || "document").replace(/[^a-zA-Z0-9_.-]/g, "_");

      const draftPath = onboardingDraftId
        ? `tenants/${companyId}/driver_onboarding/${onboardingDraftId}/documents/${docId}/${safeFileName}`
        : `tenants/${companyId}/documents/${docId}/${safeFileName}`;

      const docPayload = {
        id: docId,
        companyId,
        onboardingDraftId: onboardingDraftId || null,
        entityType: entityType || "driver",
        entityId: entityId || null,
        documentType: documentType || "general",
        fileName: safeFileName,
        mimeType: mimeType || "application/pdf",
        fileSize: fileSize || 0,
        storagePath: draftPath,
        issueDate: issueDate || null,
        expirationDate: expirationDate || null,
        verificationStatus: "verified",
        uploadedByUid: authRes.callerUid,
        uploadedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("driver_documents").doc(docId).set(docPayload);

      if (expirationDate) {
        await db.collection("admins").doc(companyId).collection("compliance").add({
          companyId,
          scopeType: entityType || "driver",
          entityId: entityId || "draft",
          entityName: safeFileName,
          category: documentType || "general",
          title: `${documentType || 'Driver'} Document Verification`,
          expirationDate,
          criticality: "high",
          status: "active",
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }

      return res.json({ success: true, document: docPayload });
    } catch (err: any) {
      console.error("Error uploading document:", err);
      return res.status(500).json({ error: err.message || "Failed to upload document" });
    }
  });

  /**
   * RESEND SECURE ACTIVATION LINK
   * POST /api/personnel/resend-activation
   */
  app.post("/api/personnel/resend-activation", async (req, res) => {
    try {
      const { companyId, driverId, email } = req.body;
      if (!companyId || !email) return res.status(400).json({ error: "Missing companyId or email" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const targetEmail = email.toLowerCase().trim();
      const nowIso = new Date().toISOString();
      const appUrl = process.env.APP_URL || (req.headers.origin ? `${req.headers.origin}` : "https://app.tdpro.cloud");

      let activationLink = "";
      try {
        activationLink = await getAuth().generatePasswordResetLink(targetEmail, {
          url: `${appUrl}/activate?email=${encodeURIComponent(targetEmail)}`,
          handleCodeInApp: true
        });
      } catch (linkErr: any) {
        console.warn("Could not generate auth link, constructing fallback link:", linkErr.message);
        activationLink = `${appUrl}/activate?email=${encodeURIComponent(targetEmail)}`;
      }

      const db = getFirestoreDb();
      const mailId = `mail_activation_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      await db.collection("mail").doc(mailId).set({
        to: targetEmail,
        message: {
          subject: "TD Pro CDL Operator Portal — Secure Account Setup & Activation",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #1e293b; margin: 0;">Truck Dispatch Pro</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Carrier CDL Operator Account Invitation</p>
              </div>
              <p style="color: #334155; font-size: 15px; line-height: 1.6;">You have been registered as an active CDL operator. Click the button below to verify your email, set your password, and activate your account:</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${activationLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 15px; display: inline-block;">Activate Driver Account</a>
              </div>
              <p style="color: #64748b; font-size: 13px;">If the button does not work, copy and paste this activation URL into your browser:</p>
              <p style="color: #4f46e5; font-size: 12px; word-break: break-all;">${activationLink}</p>
            </div>
          `
        },
        createdAt: nowIso
      });

      if (driverId) {
        const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId);
        await driverRef.set({
          invitationStatus: "email_queued",
          activationLink,
          lastInvitationAttemptAt: nowIso,
          invitationAttemptCount: FieldValue.increment(1),
          updatedAt: nowIso
        }, { merge: true });

        await db.collection("users").doc(driverId).set({
          invitationStatus: "email_queued",
          activationLink,
          lastInvitationAttemptAt: nowIso,
          invitationAttemptCount: FieldValue.increment(1),
          updatedAt: nowIso
        }, { merge: true });
      }

      await db.collection("admins").doc(companyId).collection("audit_logs").add({
        companyId,
        userId: authRes.callerUid,
        action: "activation_email_dispatched",
        entityType: "driver",
        entityId: driverId || targetEmail,
        recipientEmail: targetEmail,
        createdAt: nowIso
      });

      return res.json({
        success: true,
        message: `Activation email queued for ${targetEmail}.`,
        invitationStatus: "email_queued",
        activationLink
      });
    } catch (err: any) {
      console.error("Error resending activation email:", err);
      return res.status(500).json({ error: err.message || "Failed to resend activation email" });
    }
  });
  /**
   * CHECK TRUCK DUPLICATE BEFORE ONBOARDING
   * POST /api/personnel/check-truck-duplicate
   */
  app.post("/api/personnel/check-truck-duplicate", async (req, res) => {
    try {
      const { companyId, vin, truckNumber, licensePlate, licensePlateState } = req.body;
      if (!companyId) return res.status(400).json({ error: "Missing companyId" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const db = getFirestoreDb();
      const normVin = normalizeVin(vin);
      const normTruckNum = normalizeTruckNum(truckNumber);
      const normPlate = licensePlate ? licensePlate.toUpperCase().trim() : "";

      const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      let matchedTruck: any = null;
      let matchReason = "";

      trucksSnap.forEach(doc => {
        const trk = doc.data();
        if (normVin && normalizeVin(trk.vin) === normVin) {
          matchedTruck = { id: doc.id, ...trk };
          matchReason = `Matching VIN (${vin})`;
        } else if (normTruckNum && normalizeTruckNum(trk.truckNumber) === normTruckNum) {
          matchedTruck = { id: doc.id, ...trk };
          matchReason = `Matching Truck Number (#${trk.truckNumber})`;
        } else if (normPlate && trk.licensePlate && trk.licensePlate.toUpperCase().trim() === normPlate) {
          matchedTruck = { id: doc.id, ...trk };
          matchReason = `Matching License Plate (${licensePlate})`;
        }
      });

      if (matchedTruck) {
        return res.json({
          isDuplicate: true,
          matchReason,
          existingTruck: matchedTruck
        });
      }

      return res.json({ isDuplicate: false });
    } catch (err: any) {
      console.error("Error checking truck duplicate:", err);
      return res.status(500).json({ error: err.message || "Failed duplicate check" });
    }
  });

  /**
   * CHECK ASSIGNMENT CONFLICT BEFORE ONBOARDING
   * POST /api/personnel/check-assignment-conflict
   */
  app.post("/api/personnel/check-assignment-conflict", async (req, res) => {
    try {
      const { companyId, truckId } = req.body;
      if (!companyId || !truckId) return res.status(400).json({ error: "Missing companyId or truckId" });

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

      const db = getFirestoreDb();
      const truckSnap = await db.collection("admins").doc(companyId).collection("trucks").doc(truckId).get();
      if (!truckSnap.exists) {
        return res.status(404).json({ error: "Selected truck not found in fleet registry" });
      }

      const truckData = truckSnap.data()!;
      if (truckData.currentDriverId) {
        return res.json({
          hasConflict: true,
          currentDriverId: truckData.currentDriverId,
          currentDriverName: truckData.currentDriverName || "Another driver",
          truckNumber: truckData.truckNumber
        });
      }

      return res.json({ hasConflict: false, truckNumber: truckData.truckNumber });
    } catch (err: any) {
      console.error("Error checking assignment conflict:", err);
      return res.status(500).json({ error: err.message || "Failed conflict check" });
    }
  });

  /**
   * UNIFIED DRIVER ONBOARDING
   * POST /api/personnel/onboard
   */
  app.post("/api/personnel/onboard", async (req, res) => {
    try {
      const {
        companyId,
        isDraft,
        // Account & Contact
        fullName,
        legalFirstName,
        legalMiddleName,
        legalLastName,
        preferredName,
        email,
        phone,
        dateOfBirth,
        operationScope, // "interstate" | "intrastate_only"
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
        password,

        // Employment
        employmentType,
        hireDate,
        employmentStartDate,
        driverStatus,
        ownerOperatorCompanyId,
        compensationProfileId,

        // CDL & Compliance
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

        // Truck Assignment Selection
        truckAssignmentMethod, // "none" | "existing" | "new"
        selectedTruckId,
        overrideConflict,
        conflictOverrideReason,
        ignoreDuplicateWarning,

        // New Truck Data (if truckAssignmentMethod === "new")
        newTruckData,

        // Documents
        documents
      } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: "Missing companyId in onboarding payload" });
      }

      const authRes = await verifyAuth(req, companyId);
      if (!authRes.authorized) {
        return res.status(authRes.status!).json({ error: authRes.error });
      }

      // --- DISPATCHER PERMISSION & POLICY CHECKS ---
      let calculatedDriverStatus = driverStatus || "active";
      if (authRes.isDispatcher) {
        if (authRes.driverOnboardingPolicy === "admin_only") {
          return res.status(403).json({ error: "Tenant policy requires Tenant Admin access to onboard new drivers." });
        }
        if (authRes.driverOnboardingPolicy === "dispatcher_submit_admin_approves") {
          calculatedDriverStatus = "pending_admin_approval";
        }

        const perms = authRes.dispatcherPermissions || {};
        const canOnboard = perms.personnel?.onboardDriver || perms.drivers?.create || perms.createDrivers;
        if (!canOnboard) {
          return res.status(403).json({ error: "Dispatcher lacks personnel onboarding permission." });
        }
      }

      if (!isDraft) {
        if (!fullName || !fullName.trim()) return res.status(400).json({ error: "Full Name is required for driver activation" });
        if (!email || !email.trim()) return res.status(400).json({ error: "Email address is required for driver activation" });
      }

      // --- COMMERCIAL DRIVING AGE ELIGIBILITY VALIDATION ---
      const refDate = employmentStartDate || new Date().toISOString().split("T")[0];
      const driverAge = dateOfBirth ? calculateAgeAtDate(dateOfBirth, refDate) : 0;
      const scope = operationScope || "interstate";

      let ageEligibilityStatus: "eligible" | "requires_review" | "ineligible" = "eligible";
      if (dateOfBirth) {
        if (scope === "interstate") {
          if (driverAge < 21) {
            ageEligibilityStatus = "ineligible";
            if (!isDraft) {
              return res.status(400).json({
                error: "COMMERCIAL_AGE_INELIGIBLE",
                message: `Commercial drivers operating in interstate commerce must be at least 21 years of age as of employment start date (${refDate}). Current driver age: ${driverAge} years.`
              });
            }
          }
        } else if (scope === "intrastate_only") {
          if (driverAge < 21) {
            ageEligibilityStatus = intrastateAdminConfirmed ? "eligible" : "requires_review";
            if (!isDraft && !intrastateAdminConfirmed) {
              return res.status(400).json({
                error: "INTRASTATE_AGE_REVIEW_REQUIRED",
                message: `Driver is ${driverAge} years old operating under Intrastate-Only scope. Requires explicit admin eligibility confirmation before activation.`
              });
            }
          }
        }
      }

      const db = getFirestoreDb();
      const nowIso = new Date().toISOString();
      const normalizedEmail = (email || "").toLowerCase().trim();

      // --- OWNER OPERATOR COMPANY RESOLUTION ---
      let resolvedOwnerOperatorName = "";
      if (employmentType === "owner_operator_driver" && ownerOperatorCompanyId) {
        const ooDocSnap = await db.collection("admins").doc(companyId).collection("owner_operators").doc(ownerOperatorCompanyId).get();
        if (ooDocSnap.exists) {
          const ooData = ooDocSnap.data()!;
          resolvedOwnerOperatorName = ooData.legalName || ooData.dbaName || ooData.ownerName || "";
        }
      }

      // --- TRUCK DUP / CONFLICT VALIDATIONS ---
      let assignedTruckId: string | null = null;
      let assignedTruckNumberSnapshot = "";
      let assignedTruckVinSnapshot = "";
      let newTruckWasCreated = false;

      if (truckAssignmentMethod === "new" && newTruckData) {
        // Check dispatcher truck creation permission
        if (authRes.isDispatcher) {
          const perms = authRes.dispatcherPermissions || {};
          const canCreateTruck = perms.fleet?.createTruckDuringOnboarding;
          if (canCreateTruck === false) {
            return res.status(403).json({ error: "Dispatcher lacks permission to create new trucks during onboarding. Select an existing fleet truck or request admin authorization." });
          }
        }

        const normVin = normalizeVin(newTruckData.vin);
        const normNum = normalizeTruckNum(newTruckData.truckNumber);

        if (!ignoreDuplicateWarning && (normVin || normNum)) {
          const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
          let dupTruck: any = null;
          trucksSnap.forEach(doc => {
            const trk = doc.data();
            if (normVin && normalizeVin(trk.vin) === normVin) dupTruck = trk;
            if (normNum && normalizeTruckNum(trk.truckNumber) === normNum) dupTruck = trk;
          });

          if (dupTruck) {
            return res.status(409).json({
              error: "DUPLICATE_TRUCK_DETECTED",
              message: `A truck with Truck #${dupTruck.truckNumber} or VIN ${dupTruck.vin || 'N/A'} already exists in your fleet registry.`,
              existingTruck: dupTruck
            });
          }
        }
      } else if (truckAssignmentMethod === "existing" && selectedTruckId) {
        const truckSnap = await db.collection("admins").doc(companyId).collection("trucks").doc(selectedTruckId).get();
        if (!truckSnap.exists) {
          return res.status(404).json({ error: "Selected existing truck not found in fleet registry" });
        }
        const trkData = truckSnap.data()!;
        if (trkData.currentDriverId && !overrideConflict) {
          return res.status(409).json({
            error: "ASSIGNMENT_CONFLICT_DETECTED",
            message: `Truck #${trkData.truckNumber} is currently assigned to ${trkData.currentDriverName || 'another driver'}.`,
            currentDriverName: trkData.currentDriverName
          });
        }
        assignedTruckId = selectedTruckId;
        assignedTruckNumberSnapshot = trkData.truckNumber || "";
        assignedTruckVinSnapshot = trkData.vin || "";
      }

      // --- USER & AUTH CREATION & ACTIVATION LINK ---
      let userUid = "";
      let activationLink = "";
      const appUrl = process.env.APP_URL || (req.headers.origin ? `${req.headers.origin}` : "https://app.tdpro.cloud");

      if (normalizedEmail) {
        try {
          const existingAuth = await getAuth().getUserByEmail(normalizedEmail);
          userUid = existingAuth.uid;
        } catch (authErr: any) {
          if (authErr.code === "auth/user-not-found") {
            const createPayload: any = {
              email: normalizedEmail,
              displayName: fullName || legalFirstName || "CDL Driver",
              emailVerified: false
            };
            if (password && password.trim().length >= 6) {
              createPayload.password = password.trim();
            }
            const newAuthUser = await getAuth().createUser(createPayload);
            userUid = newAuthUser.uid;
          } else {
            throw authErr;
          }
        }

        // Generate password reset / activation link
        try {
          activationLink = await getAuth().generatePasswordResetLink(normalizedEmail, {
            url: `${appUrl}/activate?email=${encodeURIComponent(normalizedEmail)}`,
            handleCodeInApp: true
          });
        } catch (linkErr: any) {
          console.warn("Generating fallback activation link:", linkErr.message);
          activationLink = `${appUrl}/activate?email=${encodeURIComponent(normalizedEmail)}`;
        }

        // Queue activation email via /mail
        if (activationLink && !isDraft) {
          const mailId = `mail_activation_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await db.collection("mail").doc(mailId).set({
            to: normalizedEmail,
            message: {
              subject: "TD Pro CDL Operator Portal — Secure Account Setup & Activation",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #1e293b; margin: 0;">Truck Dispatch Pro</h2>
                    <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Carrier CDL Operator Account Invitation</p>
                  </div>
                  <p style="color: #334155; font-size: 15px; line-height: 1.6;">Welcome, <strong>${fullName || legalFirstName}</strong>! You have been registered as a CDL driver for your carrier. Click the button below to verify your email, set your password, and activate your account:</p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${activationLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 15px; display: inline-block;">Activate Driver Account</a>
                  </div>
                  <p style="color: #64748b; font-size: 13px;">If the button does not work, copy and paste this activation URL into your browser:</p>
                  <p style="color: #4f46e5; font-size: 12px; word-break: break-all;">${activationLink}</p>
                </div>
              `
            },
            createdAt: nowIso
          });
        }
      }

      if (!userUid) {
        userUid = `drv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // --- NEW TRUCK CREATION ---
      if (truckAssignmentMethod === "new" && newTruckData) {
        const newTrkId = `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        assignedTruckId = newTrkId;
        assignedTruckNumberSnapshot = (newTruckData.truckNumber || "").trim();
        assignedTruckVinSnapshot = (newTruckData.vin || "").trim();
        newTruckWasCreated = true;

        const newTruckDoc = {
          id: newTrkId,
          companyId,
          truckNumber: assignedTruckNumberSnapshot,
          vin: assignedTruckVinSnapshot,
          licensePlate: newTruckData.licensePlate || "",
          licensePlateState: newTruckData.licensePlateState || "",
          make: newTruckData.make || "",
          model: newTruckData.model || "",
          makeModel: newTruckData.makeModel || (newTruckData.make && newTruckData.model ? `${newTruckData.make} ${newTruckData.model}` : "Truck"),
          year: newTruckData.year || "2024",
          vehicleType: newTruckData.vehicleType || "tractor",
          ownershipType: newTruckData.ownershipType || (ownerOperatorCompanyId ? "owner_operator" : "company_owned"),
          ownerOperatorCompanyId: ownerOperatorCompanyId || newTruckData.ownerOperatorCompanyId || null,
          currentOwnerOperatorCompanyId: ownerOperatorCompanyId || newTruckData.ownerOperatorCompanyId || null,
          currentOdometerDecimal: newTruckData.currentOdometerDecimal || 0,
          fuelTankCapacityGallonsDecimal: newTruckData.fuelTankCapacityGallonsDecimal || 150,
          reeferTankCapacityGallonsDecimal: newTruckData.reeferTankCapacityGallonsDecimal || 0,
          registrationIssueDate: newTruckData.registrationIssueDate || null,
          registrationExpirationDate: newTruckData.registrationExpirationDate || null,
          annualInspectionDate: newTruckData.annualInspectionDate || null,
          annualInspectionExpirationDate: newTruckData.annualInspectionExpirationDate || null,
          irpCabCardExpirationDate: newTruckData.irpCabCardExpirationDate || null,
          iftaDecalYear: newTruckData.iftaDecalYear || null,
          iftaDecalExpirationDate: newTruckData.iftaDecalExpirationDate || null,
          vehicleInsuranceExpirationDate: newTruckData.vehicleInsuranceExpirationDate || null,
          eldProvider: newTruckData.eldProvider || "",
          eldDeviceId: newTruckData.eldDeviceId || "",
          status: newTruckData.status || "active",
          currentDriverId: userUid,
          currentDriverName: fullName || `${legalFirstName || ''} ${legalLastName || ''}`.trim(),
          assignedDriverId: userUid,
          createdAt: nowIso,
          createdByUid: authRes.callerUid,
          updatedAt: nowIso,
          updatedByUid: authRes.callerUid
        };

        await db.collection("admins").doc(companyId).collection("trucks").doc(newTrkId).set(newTruckDoc);

        await db.collection("admins").doc(companyId).collection("audit_logs").add({
          companyId,
          userId: authRes.callerUid,
          action: "truck_created_during_onboarding",
          entityType: "truck",
          entityId: newTrkId,
          truckNumber: assignedTruckNumberSnapshot,
          driverId: userUid,
          createdAt: nowIso
        });
      }

      // --- ASSIGNMENT LEDGER ENTRY ---
      let assignmentId: string | null = null;
      if (assignedTruckId) {
        assignmentId = `assign_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        if (overrideConflict || truckAssignmentMethod === "existing") {
          const existingAssigns = await db.collection("admins").doc(companyId)
            .collection("truck_driver_assignments")
            .where("truckId", "==", assignedTruckId)
            .where("status", "==", "active")
            .get();

          existingAssigns.forEach(async (docSnap) => {
            await docSnap.ref.update({
              status: "ended",
              effectiveTo: nowIso,
              endedReason: conflictOverrideReason || "Reassigned during driver onboarding",
              updatedAt: nowIso
            });
          });
        }

        const assignmentDoc = {
          id: assignmentId,
          companyId,
          truckId: assignedTruckId,
          truckNumberSnapshot: assignedTruckNumberSnapshot,
          vinSnapshot: assignedTruckVinSnapshot,
          driverId: userUid,
          driverNameSnapshot: fullName || `${legalFirstName || ''} ${legalLastName || ''}`.trim(),
          ownerOperatorCompanyIdSnapshot: ownerOperatorCompanyId || null,
          assignmentType: "primary",
          effectiveFrom: nowIso,
          effectiveTo: null,
          status: "active",
          source: "driver_onboarding",
          reason: overrideConflict ? "override_onboarding" : "new_assignment",
          assignedByUid: authRes.callerUid,
          assignedByNameSnapshot: authRes.callerName,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        await db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(assignmentId).set(assignmentDoc);

        if (!newTruckWasCreated) {
          await db.collection("admins").doc(companyId).collection("trucks").doc(assignedTruckId).set({
            currentDriverId: userUid,
            currentDriverName: fullName || `${legalFirstName || ''} ${legalLastName || ''}`.trim(),
            assignedDriverId: userUid,
            updatedAt: nowIso,
            updatedByUid: authRes.callerUid
          }, { merge: true });
        }
      }

      // --- DRIVER DOCUMENT PAYLOAD ---
      const isFullyActive = calculatedDriverStatus === "active" && !isDraft;
      const driverPayload: any = {
        id: userUid,
        uid: userUid,
        companyId,
        role: "driver",
        status: isDraft ? "draft" : calculatedDriverStatus,
        lifecycleStatus: isDraft ? "onboarding" : (isFullyActive ? "active" : "onboarding"),
        onboardingStatus: isDraft ? "not_started" : (isFullyActive ? "completed" : "in_progress"),
        accessStatus: isFullyActive ? "active" : "pending",
        activationStatus: isFullyActive ? "activated" : (activationLink ? "invitation_sent" : "not_invited"),
        employmentStatus: isFullyActive ? "active" : "pending",
        isActive: isFullyActive,

        // Account & Name
        name: fullName || `${legalFirstName || ''} ${legalLastName || ''}`.trim() || "CDL Driver",
        fullName: fullName || `${legalFirstName || ''} ${legalLastName || ''}`.trim(),
        legalFirstName: legalFirstName || "",
        legalMiddleName: legalMiddleName || "",
        legalLastName: legalLastName || "",
        preferredName: preferredName || "",
        email: normalizedEmail,
        phone: phone || "",
        dateOfBirth: dateOfBirth || null,
        operationScope: scope,
        minimumAgeRuleApplied: 21,
        ageEligibilityStatus,
        ageEligibilityCheckedAt: nowIso,
        ageEligibilityCheckedByUid: authRes.callerUid,
        eligibilityRuleVersion: "FMCSA_2026_V1",

        // Address & Emergency
        addressLine1: addressLine1 || "",
        addressLine2: addressLine2 || "",
        city: city || "",
        state: state || "",
        postalCode: postalCode || "",
        countryCode: countryCode || "US",
        emergencyContactName: emergencyContactName || "",
        emergencyContactRelationship: emergencyContactRelationship || "",
        emergencyContactPhone: emergencyContactPhone || "",

        // Employment
        employmentType: employmentType || "company_driver",
        hireDate: hireDate || nowIso.split("T")[0],
        employmentStartDate: employmentStartDate || nowIso.split("T")[0],
        ownerOperatorCompanyId: ownerOperatorCompanyId || null,
        ownerOperatorName: resolvedOwnerOperatorName || null,
        compensationProfileId: compensationProfileId || null,

        // CDL & Compliance
        cdlNumber: cdlNumber || "",
        licenseNumber: cdlNumber || "CDL-TX-UNKNOWN",
        cdlIssuingState: cdlIssuingState || "TX",
        cdlClass: cdlClass || "A",
        cdlEndorsements: cdlEndorsements || [],
        cdlRestrictions: cdlRestrictions || [],
        cdlIssueDate: cdlIssueDate || null,
        cdlExpirationDate: cdlExpirationDate || null,
        medicalCardIssueDate: medicalCardIssueDate || null,
        medicalCardExpirationDate: medicalCardExpirationDate || null,
        clearinghouseStatus: clearinghouseStatus || "cleared",
        clearinghouseQueryDate: clearinghouseQueryDate || null,
        drugTestingEnrollmentDate: drugTestingEnrollmentDate || null,
        driverQualificationFileStatus: driverQualificationFileStatus || "complete",

        // Truck Cache Summary
        currentTruckId: assignedTruckId,
        currentTruckNumber: assignedTruckNumberSnapshot,
        truckNumber: assignedTruckNumberSnapshot,
        currentTruckAssignmentId: assignmentId,
        currentTruckAssignedAt: assignedTruckId ? nowIso : null,

        // Activation & Invitation Status
        invitationStatus: isDraft ? "not_created" : (activationLink ? "email_queued" : "link_generation_pending"),
        activationLink: activationLink || null,
        lastInvitationAttemptAt: isDraft ? null : nowIso,
        invitationAttemptCount: isDraft ? 0 : 1,

        // Operational Defaults
        dutyStatus: "Off Duty",
        manualLocationEnabled: false,

        createdAt: nowIso,
        createdByUid: authRes.callerUid,
        updatedAt: nowIso,
        updatedByUid: authRes.callerUid
      };

      await db.collection("users").doc(userUid).set(driverPayload, { merge: true });
      await db.collection("admins").doc(companyId).collection("drivers").doc(userUid).set(driverPayload, { merge: true });

      // --- COMPLIANCE CENTER INTEGRATION ---
      const compliancePromises: Promise<any>[] = [];

      if (cdlExpirationDate) {
        compliancePromises.push(
          db.collection("admins").doc(companyId).collection("compliance").add({
            companyId,
            scopeType: "driver",
            entityId: userUid,
            entityName: driverPayload.name,
            category: "driver",
            title: "CDL Driver License",
            expirationDate: cdlExpirationDate,
            criticality: "high",
            status: "active",
            createdAt: nowIso,
            updatedAt: nowIso
          })
        );
      }

      if (medicalCardExpirationDate) {
        compliancePromises.push(
          db.collection("admins").doc(companyId).collection("compliance").add({
            companyId,
            scopeType: "driver",
            entityId: userUid,
            entityName: driverPayload.name,
            category: "driver",
            title: "Medical Examiner Certificate",
            expirationDate: medicalCardExpirationDate,
            criticality: "high",
            status: "active",
            createdAt: nowIso,
            updatedAt: nowIso
          })
        );
      }

      if (newTruckWasCreated && newTruckData) {
        if (newTruckData.registrationExpirationDate) {
          compliancePromises.push(
            db.collection("admins").doc(companyId).collection("compliance").add({
              companyId,
              scopeType: "truck",
              entityId: assignedTruckId,
              entityName: `Truck #${assignedTruckNumberSnapshot}`,
              category: "vehicle",
              title: "Vehicle Registration Renewal",
              expirationDate: newTruckData.registrationExpirationDate,
              criticality: "high",
              status: "active",
              createdAt: nowIso,
              updatedAt: nowIso
            })
          );
        }
        if (newTruckData.annualInspectionExpirationDate) {
          compliancePromises.push(
            db.collection("admins").doc(companyId).collection("compliance").add({
              companyId,
              scopeType: "truck",
              entityId: assignedTruckId,
              entityName: `Truck #${assignedTruckNumberSnapshot}`,
              category: "vehicle",
              title: "Annual DOT Safety Inspection",
              expirationDate: newTruckData.annualInspectionExpirationDate,
              criticality: "high",
              status: "active",
              createdAt: nowIso,
              updatedAt: nowIso
            })
          );
        }
      }

      await Promise.all(compliancePromises);

      // --- DOCUMENTS ATTACHMENT ---
      if (Array.isArray(documents) && documents.length > 0) {
        const docPromises = documents.map((docItem: any) => {
          const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          return db.collection("admins").doc(companyId).collection("driver_documents").doc(docId).set({
            id: docId,
            companyId,
            entityType: docItem.entityType || "driver",
            entityId: docItem.entityType === "truck" ? assignedTruckId : userUid,
            documentType: docItem.documentType || "general",
            fileName: docItem.fileName || "Document",
            storagePath: docItem.storagePath || "",
            issueDate: docItem.issueDate || null,
            expirationDate: docItem.expirationDate || null,
            verificationStatus: "verified",
            uploadedByUid: authRes.callerUid,
            uploadedAt: nowIso
          });
        });
        await Promise.all(docPromises);
      }

      // --- AUDIT LOG TRAIL ---
      await db.collection("admins").doc(companyId).collection("audit_logs").add({
        companyId,
        userId: authRes.callerUid,
        action: isDraft ? "onboarding_draft_created" : "driver_created",
        entityType: "driver",
        entityId: userUid,
        driverName: driverPayload.name,
        assignedTruckId: assignedTruckId || null,
        assignedTruckNumber: assignedTruckNumberSnapshot || null,
        createdAt: nowIso
      });

      return res.json({
        success: true,
        message: isDraft
          ? `Draft onboarding profile saved for ${driverPayload.name}`
          : `Driver ${driverPayload.name} successfully onboarded and registered.`,
        driverId: userUid,
        driverStatus: driverPayload.status,
        truckId: assignedTruckId,
        assignmentId,
        email: normalizedEmail,
        invitationStatus: driverPayload.invitationStatus,
        activationLink: driverPayload.activationLink,
        ageEligibilityStatus: driverPayload.ageEligibilityStatus
      });
    } catch (err: any) {
      console.error("Error in unified driver onboarding:", err);
      return res.status(500).json({ error: err.message || "Unified onboarding workflow failed" });
    }
  });

  /**
   * RECONCILE DRIVER STATUS & LIFECYCLE
   * POST /api/admin/drivers/:driverUid/reconcile-status
   */
  app.post("/api/admin/drivers/:driverUid/reconcile-status", async (req: express.Request, res: express.Response) => {
    try {
      const { driverUid } = req.params;
      const { companyId, apply } = req.body;
      const db = getFirestoreDb();

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let callerUid = "";
      try {
        const decoded = await getAuth().verifyIdToken(token);
        callerUid = decoded.uid;
      } catch (err: any) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }

      // 1. Fetch user doc & tenant driver doc
      let userSnap = await db.collection("users").doc(driverUid).get();
      let driverData: any = userSnap.exists ? userSnap.data() : null;

      const resolvedCompanyId = companyId || driverData?.companyId;
      if (!resolvedCompanyId) {
        return res.status(400).json({ error: "Company ID not specified or found on driver profile" });
      }

      let tenantDriverSnap = await db.collection("admins").doc(resolvedCompanyId).collection("drivers").doc(driverUid).get();
      if (tenantDriverSnap.exists) {
        driverData = { ...(driverData || {}), ...tenantDriverSnap.data() };
      }

      if (!driverData) {
        return res.status(404).json({ error: `Driver profile for UID ${driverUid} not found` });
      }

      const currentOnboardingStatus = driverData.onboardingStatus || (driverData.status === "active" ? "completed" : "in_progress");
      const currentLifecycleStatus = driverData.lifecycleStatus || driverData.status || "onboarding";
      const currentAccessStatus = driverData.accessStatus || (currentLifecycleStatus === "active" ? "active" : "pending");
      const currentActivationStatus = driverData.activationStatus || (driverData.status === "active" ? "activated" : "invitation_sent");
      const currentEmploymentStatus = driverData.employmentStatus || (driverData.status === "active" ? "active" : "pending");
      const currentIsActive = driverData.isActive ?? (currentLifecycleStatus === "active");

      const currentState = {
        onboardingStatus: currentOnboardingStatus,
        lifecycleStatus: currentLifecycleStatus,
        accessStatus: currentAccessStatus,
        activationStatus: currentActivationStatus,
        employmentStatus: currentEmploymentStatus,
        isActive: currentIsActive,
        status: driverData.status || "onboarding"
      };

      const blockingIssues: string[] = [];
      if (driverData.status === "inactive" || currentLifecycleStatus === "inactive") {
        blockingIssues.push("Driver is explicitly marked inactive");
      }
      if (currentLifecycleStatus === "suspended" || driverData.status === "suspended") {
        blockingIssues.push("Driver account is suspended");
      }
      if (currentLifecycleStatus === "terminated" || driverData.status === "terminated") {
        blockingIssues.push("Driver account is terminated");
      }

      const hasBasicInfo = !!(driverData.name || driverData.fullName) && !!driverData.email;
      const hasCdlInfo = !!(driverData.cdlNumber || driverData.licenseNumber);
      const termsAcceptedOrDutyActive = !!(driverData.driverTermsAcceptedAt || driverData.legalAcceptedAt || driverData.dutyStatus === "On Duty" || driverData.dutyStatus === "Driving" || driverData.dutyStatus === "Sleeper");
      const qualificationComplete = driverData.driverQualificationFileStatus === "complete" || driverData.clearinghouseStatus === "cleared";

      if (!hasBasicInfo) blockingIssues.push("Missing basic name or email information");
      if (!hasCdlInfo) blockingIssues.push("Missing CDL license number");

      const eligibleForAutomaticRepair = blockingIssues.length === 0 && (
        termsAcceptedOrDutyActive ||
        qualificationComplete ||
        driverData.status === "active"
      );

      let expectedState: any = { ...currentState };
      if (eligibleForAutomaticRepair) {
        expectedState = {
          onboardingStatus: "completed",
          lifecycleStatus: "active",
          accessStatus: "active",
          activationStatus: "activated",
          employmentStatus: "active",
          isActive: true,
          status: "active",
          statusRepairReason: "Existing operational driver had stale onboarding status"
        };
      }

      const differences: string[] = [];
      Object.keys(expectedState).forEach(key => {
        if (currentState[key as keyof typeof currentState] !== expectedState[key]) {
          differences.push(`${key}: "${currentState[key as keyof typeof currentState]}" -> "${expectedState[key]}"`);
        }
      });

      const shouldApply = apply === true || req.body.force === true;
      let isApplied = false;

      if (shouldApply && eligibleForAutomaticRepair && differences.length > 0) {
        const nowIso = new Date().toISOString();
        const updatePayload = {
          ...expectedState,
          updatedAt: nowIso,
          updatedByUid: callerUid
        };

        await db.collection("users").doc(driverUid).set(updatePayload, { merge: true });
        await db.collection("admins").doc(resolvedCompanyId).collection("drivers").doc(driverUid).set(updatePayload, { merge: true });

        const auditId = `audit_reconcile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.collection("admins").doc(resolvedCompanyId).collection("audit_logs").doc(auditId).set({
          companyId: resolvedCompanyId,
          driverUid,
          performedByUid: callerUid,
          action: "driver_status_reconciled",
          previousStatus: currentState.status,
          newStatus: expectedState.status,
          differences,
          reason: expectedState.statusRepairReason || "Status reconciliation",
          createdAt: nowIso
        });

        isApplied = true;
      }

      return res.json({
        success: true,
        uid: driverUid,
        companyId: resolvedCompanyId,
        currentState,
        expectedState,
        differences,
        eligibleForAutomaticRepair,
        blockingIssues,
        applied: isApplied
      });
    } catch (err: any) {
      console.error("Error in driver status reconciliation:", err);
      return res.status(500).json({ error: err.message || "Status reconciliation failed" });
    }
  });

  /**
   * EXPLICIT DRIVER ACTIVATION
   * POST /api/admin/drivers/:driverUid/activate
   */
  app.post("/api/admin/drivers/:driverUid/activate", async (req: express.Request, res: express.Response) => {
    try {
      const { driverUid } = req.params;
      const { companyId } = req.body;
      const db = getFirestoreDb();

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let callerUid = "";
      try {
        const decoded = await getAuth().verifyIdToken(token);
        callerUid = decoded.uid;
      } catch (err: any) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }

      let userSnap = await db.collection("users").doc(driverUid).get();
      let userData: any = userSnap.exists ? userSnap.data() : {};
      const resolvedCompanyId = companyId || userData.companyId;

      if (!resolvedCompanyId) {
        return res.status(400).json({ error: "Missing companyId" });
      }

      const nowIso = new Date().toISOString();
      const activationPayload = {
        onboardingStatus: "completed",
        lifecycleStatus: "active",
        accessStatus: "active",
        activationStatus: "activated",
        employmentStatus: "active",
        isActive: true,
        status: "active",
        activatedAt: nowIso,
        activatedByUid: callerUid,
        updatedAt: nowIso,
        updatedByUid: callerUid
      };

      await db.collection("users").doc(driverUid).set(activationPayload, { merge: true });
      await db.collection("admins").doc(resolvedCompanyId).collection("drivers").doc(driverUid).set(activationPayload, { merge: true });

      await db.collection("admins").doc(resolvedCompanyId).collection("audit_logs").add({
        companyId: resolvedCompanyId,
        driverUid,
        performedByUid: callerUid,
        action: "driver_activated",
        previousStatus: userData.status || "onboarding",
        newStatus: "active",
        reason: "Manual driver activation by admin/dispatcher",
        createdAt: nowIso
      });

      return res.json({
        success: true,
        driverUid,
        status: "active",
        activationPayload
      });
    } catch (err: any) {
      console.error("Error activating driver:", err);
      return res.status(500).json({ error: err.message || "Driver activation failed" });
    }
  });
}
