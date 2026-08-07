import "./pre-init.ts";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import Stripe from "stripe";
import { AVAILABLE_INTEGRATIONS, getAdapter } from "./server/integrations";
import { registerAccountingRoutes } from "./server/accounting";
import { registerQuickBooksRoutes, startQuickBooksReconciliationWorker } from "./server/quickbooks";
import { registerFuelRoutes } from "./server/fuel";
import { registerComplianceRoutes, startComplianceWorker } from "./server/compliance";
import { registerFleetRoutes } from "./server/fleet";
import { registerPersonnelRoutes } from "./server/personnel";
import { registerShopmonkeyRoutes } from "./server/shopmonkey";

// Initialize Firebase Admin SDK
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    admin.initializeApp({
      credential: applicationDefault(),
      projectId: config.projectId,
    });
    console.log("Firebase Admin SDK initialized with projectId and ADC:", config.projectId);
  } else {
    admin.initializeApp();
    console.log("Firebase Admin SDK initialized with default credentials");
  }
} catch (e) {
  console.error("Failed to initialize firebase-admin SDK:", e);
}

const getFirestoreDb = () => {
  let db: Firestore;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.firestoreDatabaseId) {
        db = getFirestore(undefined, config.firestoreDatabaseId);
      } else {
        db = getFirestore();
      }
    } else {
      db = getFirestore();
    }
  } catch (err) {
    console.error("Error reading custom firestore database ID:", err);
    db = getFirestore();
  }
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch (e) {
    // Settings already applied
  }
  return db;
};

let stripeClient: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not defined.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2025-01-27.acacia" as any,
    });
  }
  return stripeClient;
};

async function resolveAuthUserRecord(uid: string, email?: string) {
  if (!uid) return null;
  try {
    const record = await getAuth().getUser(uid);
    if (record) return record;
  } catch (err: any) {
    if (err.code !== "auth/user-not-found") {
      console.warn(`[resolveAuthUserRecord] Error looking up auth UID ${uid}:`, err.message || err);
    }
  }
  if (email && typeof email === "string" && email.trim()) {
    try {
      const record = await getAuth().getUserByEmail(email.trim().toLowerCase());
      if (record) return record;
    } catch (err: any) {
      if (err.code !== "auth/user-not-found") {
        console.warn(`[resolveAuthUserRecord] Error looking up auth email ${email}:`, err.message || err);
      }
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial: Increase request size limits for base64 PDF/image uploads and capture rawBody for Stripe
  app.use(express.json({
    limit: "50mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Register Accounting & Settlements API Routes
  registerAccountingRoutes(app);

  // Register QuickBooks Online Integration API Routes & Reconciliation Worker
  registerQuickBooksRoutes(app);
  startQuickBooksReconciliationWorker();

  // Register Fuel Import & Card Bridge Routes
  registerFuelRoutes(app);

  // Register Compliance Center API Routes & Audit Scheduler
  registerComplianceRoutes(app);
  startComplianceWorker();

  // Register Centralized Fleet Registry & Assignment Ledger Routes
  registerFleetRoutes(app);

  // Register Unified Personnel & Driver Onboarding Routes
  registerPersonnelRoutes(app);

  // Register Shopmonkey Maintenance, Mileage & Settlement Deduction Routes
  registerShopmonkeyRoutes(app);

  // Helper for Integration Authorization
  async function verifyIntegrationAuth(req: express.Request, targetCompanyId: string) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { authorized: false, status: 401, error: "Unauthorized: Missing authorization header" };
    }
    const token = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data();

      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || (callerData && callerData.role === "super_admin");

      if (isSuperAdmin) {
        return { authorized: true, callerUid, isSuperAdmin: true, companyId: targetCompanyId };
      }

      if (!callerData) {
        return { authorized: false, status: 403, error: "Forbidden: User profile not found" };
      }

      if (callerData.role === "dispatcher" || callerData.role === "driver") {
        return { authorized: false, status: 403, error: "Forbidden: Integration management is restricted to Company Admins and Super Admins" };
      }

      if (callerData.role === "admin") {
        if (callerData.companyId !== targetCompanyId) {
          return { authorized: false, status: 403, error: "Forbidden: You can only manage integrations for your own company" };
        }
        return { authorized: true, callerUid, isSuperAdmin: false, companyId: targetCompanyId };
      }

      return { authorized: false, status: 403, error: "Forbidden: Insufficient permissions" };
    } catch (err: any) {
      return { authorized: false, status: 401, error: "Unauthorized: Invalid or expired token" };
    }
  }

  // GET /api/integrations/available
  app.get("/api/integrations/available", (req, res) => {
    return res.json({ integrations: AVAILABLE_INTEGRATIONS });
  });

  // GET /api/integrations/company/:companyId
  app.get("/api/integrations/company/:companyId", async (req, res) => {
    const companyId = req.params.companyId;
    const authResult = await verifyIntegrationAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const db = getFirestoreDb();
      const integrationsSnap = await db.collection("companies").doc(companyId).collection("integrations").get();
      const savedIntegrationsMap: Record<string, any> = {};
      integrationsSnap.forEach(doc => {
        savedIntegrationsMap[doc.id] = doc.data();
      });

      // Merge saved integration status with available providers
      const mergedIntegrations = AVAILABLE_INTEGRATIONS.map(provider => {
        const saved = savedIntegrationsMap[provider.providerId];
        return {
          ...provider,
          status: saved?.status || 'not_connected',
          connectedByUid: saved?.connectedByUid || null,
          connectedAt: saved?.connectedAt || null,
          disconnectedAt: saved?.disconnectedAt || null,
          lastSyncAt: saved?.lastSyncAt || null,
          lastSyncStatus: saved?.lastSyncStatus || null,
          lastError: saved?.lastError || null,
          configSummary: saved?.configSummary || {}
        };
      });

      // Fetch recent 30 integration logs
      const logsSnap = await db
        .collection("companies")
        .doc(companyId)
        .collection("integration_logs")
        .orderBy("startedAt", "desc")
        .limit(30)
        .get();

      const logs: any[] = [];
      logsSnap.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() });
      });

      return res.json({ companyId, integrations: mergedIntegrations, logs });
    } catch (err: any) {
      console.error("Failed to fetch company integrations:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch company integrations" });
    }
  });

  // POST /api/integrations/:provider/connect
  app.post("/api/integrations/:provider/connect", async (req, res) => {
    const { provider } = req.params;
    const { companyId, credentials } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId in request body" });
    }

    const authResult = await verifyIntegrationAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    const adapter = getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ error: `Provider adapter '${provider}' not found` });
    }

    try {
      const db = getFirestoreDb();
      const testResult = await adapter.testConnection(companyId, credentials);
      const nowIso = new Date().toISOString();

      const status = testResult.configSummary?.connectionStatus || (testResult.success ? 'connected' : 'pending_partner_approval');
      const docRef = db.collection("companies").doc(companyId).collection("integrations").doc(adapter.providerId);
      const existingDoc = (await docRef.get()).data();

      const docData = {
        providerId: adapter.providerId,
        providerName: adapter.providerName,
        category: adapter.category,
        status,
        connectedByUid: authResult.callerUid,
        connectedAt: testResult.success ? nowIso : (existingDoc?.connectedAt || null),
        disconnectedAt: null,
        lastSyncAt: testResult.success ? nowIso : (existingDoc?.lastSyncAt || null),
        lastSyncStatus: testResult.success ? 'success' : 'error',
        lastError: testResult.error || testResult.message,
        enabledFeatures: adapter.getCapabilities(),
        configSummary: testResult.configSummary || existingDoc?.configSummary || {},
        createdAt: existingDoc?.createdAt || nowIso,
        updatedAt: nowIso
      };

      await docRef.set(docData, { merge: true });

      // Write log
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("companies").doc(companyId).collection("integration_logs").doc(logId).set({
        id: logId,
        providerId: adapter.providerId,
        action: 'connect',
        status: testResult.success ? 'success' : 'error',
        message: testResult.message,
        startedAt: nowIso,
        finishedAt: nowIso,
        recordsProcessed: 0,
        error: testResult.error || null
      });

      return res.json({
        success: testResult.success,
        status,
        message: testResult.message,
        integration: docData
      });
    } catch (err: any) {
      console.error(`Error connecting provider ${provider}:`, err);
      return res.status(500).json({ error: err.message || "Failed to process connect request" });
    }
  });

  // POST /api/integrations/:provider/test
  app.post("/api/integrations/:provider/test", async (req, res) => {
    const { provider } = req.params;
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId in request body" });
    }

    const authResult = await verifyIntegrationAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    const adapter = getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ error: `Provider adapter '${provider}' not found` });
    }

    try {
      const db = getFirestoreDb();
      const testResult = await adapter.testConnection(companyId);
      const nowIso = new Date().toISOString();

      const docRef = db.collection("companies").doc(companyId).collection("integrations").doc(adapter.providerId);
      await docRef.set({
        lastSyncStatus: testResult.success ? 'success' : 'error',
        lastError: testResult.error || testResult.message,
        updatedAt: nowIso
      }, { merge: true });

      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("companies").doc(companyId).collection("integration_logs").doc(logId).set({
        id: logId,
        providerId: adapter.providerId,
        action: 'test_connection',
        status: testResult.success ? 'success' : 'error',
        message: testResult.message,
        startedAt: nowIso,
        finishedAt: nowIso,
        recordsProcessed: 0,
        error: testResult.error || null
      });

      return res.json({
        success: testResult.success,
        message: testResult.message,
        error: testResult.error || null
      });
    } catch (err: any) {
      console.error(`Error testing provider ${provider}:`, err);
      return res.status(500).json({ error: err.message || "Failed to test connection" });
    }
  });

  // POST /api/integrations/:provider/disconnect
  app.post("/api/integrations/:provider/disconnect", async (req, res) => {
    const { provider } = req.params;
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId in request body" });
    }

    const authResult = await verifyIntegrationAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    const adapter = getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ error: `Provider adapter '${provider}' not found` });
    }

    try {
      const db = getFirestoreDb();
      const dcResult = await adapter.disconnect(companyId);
      const nowIso = new Date().toISOString();

      const docRef = db.collection("companies").doc(companyId).collection("integrations").doc(adapter.providerId);
      await docRef.set({
        status: 'disconnected',
        disconnectedAt: nowIso,
        updatedAt: nowIso
      }, { merge: true });

      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("companies").doc(companyId).collection("integration_logs").doc(logId).set({
        id: logId,
        providerId: adapter.providerId,
        action: 'disconnect',
        status: 'success',
        message: dcResult.message,
        startedAt: nowIso,
        finishedAt: nowIso,
        recordsProcessed: 0,
        error: null
      });

      return res.json({
        success: true,
        message: dcResult.message
      });
    } catch (err: any) {
      console.error(`Error disconnecting provider ${provider}:`, err);
      return res.status(500).json({ error: err.message || "Failed to disconnect integration" });
    }
  });

  // POST /api/integrations/:provider/sync
  app.post("/api/integrations/:provider/sync", async (req, res) => {
    const { provider } = req.params;
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId in request body" });
    }

    const authResult = await verifyIntegrationAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    const adapter = getAdapter(provider);
    if (!adapter) {
      return res.status(404).json({ error: `Provider adapter '${provider}' not found` });
    }

    try {
      const db = getFirestoreDb();
      const syncResult = await adapter.sync(companyId);
      const nowIso = new Date().toISOString();

      const docRef = db.collection("companies").doc(companyId).collection("integrations").doc(adapter.providerId);
      await docRef.set({
        lastSyncAt: nowIso,
        lastSyncStatus: syncResult.success ? 'success' : 'error',
        lastError: syncResult.error || null,
        updatedAt: nowIso
      }, { merge: true });

      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("companies").doc(companyId).collection("integration_logs").doc(logId).set({
        id: logId,
        providerId: adapter.providerId,
        action: 'sync',
        status: syncResult.success ? 'success' : 'error',
        message: syncResult.message,
        startedAt: nowIso,
        finishedAt: nowIso,
        recordsProcessed: syncResult.recordsProcessed,
        error: syncResult.error || null
      });

      return res.json({
        success: syncResult.success,
        message: syncResult.message,
        recordsProcessed: syncResult.recordsProcessed,
        error: syncResult.error || null
      });
    } catch (err: any) {
      console.error(`Error syncing provider ${provider}:`, err);
      return res.status(500).json({ error: err.message || "Failed to sync integration" });
    }
  });

  app.post("/api/user/tour-status", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      const { role, version, completed, skipped, targetUid } = req.body;
      if (!role || !version) {
        return res.status(400).json({ error: "Missing required fields: role and version" });
      }

      const db = getFirestoreDb();

      let uidToUpdate = callerUid;
      if (targetUid && targetUid !== callerUid) {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        const callerData = callerDoc.data();
        const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || (callerData && callerData.role === "super_admin");
        if (!isSuperAdmin) {
          return res.status(403).json({ error: "Forbidden: Only Super Admin can update tour status for another user" });
        }
        uidToUpdate = targetUid;
      }

      const userRef = db.collection("users").doc(uidToUpdate);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User document not found" });
      }

      const now = new Date().toISOString();
      const roleTourData: any = {
        version: version || "v1",
        completed: Boolean(completed),
        skipped: Boolean(skipped),
      };
      if (completed) {
        roleTourData.completedAt = now;
      }
      if (skipped) {
        roleTourData.skippedAt = now;
      }

      await userRef.set(
        {
          tourStatus: {
            [role]: roleTourData,
          },
          updatedAt: now,
        },
        { merge: true }
      );

      return res.json({ success: true, uid: uidToUpdate, role, tourStatus: roleTourData });
    } catch (err: any) {
      console.error("Failed to update tour status:", err);
      res.status(500).json({ error: err.message || "Internal server error updating tour status" });
    }
  });

  // Helper function: Verify ID token with revoked-token checking enabled
  async function verifyAndAuthorizeToken(req: express.Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw { status: 401, errorCode: "UNAUTHORIZED", message: "Missing authorization header" };
    }
    const token = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      // Enable revoked-token checking (checkRevoked = true)
      decodedToken = await getAuth().verifyIdToken(token, true);
    } catch (err: any) {
      if (err.code === "auth/id-token-revoked") {
        throw { status: 401, errorCode: "TOKEN_REVOKED", message: "Token has been revoked." };
      }
      if (err.code === "auth/user-disabled") {
        throw { status: 403, errorCode: "USER_DISABLED", message: "User account is disabled." };
      }
      throw { status: 401, errorCode: "INVALID_TOKEN", message: err.message || "Invalid ID token" };
    }

    try {
      const authUser = await getAuth().getUser(decodedToken.uid);
      if (authUser.disabled) {
        throw { status: 403, errorCode: "USER_DISABLED", message: "Your user account has been disabled." };
      }
    } catch (err: any) {
      if (err.status) throw err;
    }

    return decodedToken;
  }

  // ----------------------------------------------------
  // AUTHENTICATION & TENANT ACCESS STATUS CHECK
  // ----------------------------------------------------
  app.get("/api/auth/access-status", async (req, res) => {
    try {
      const decodedToken = await verifyAndAuthorizeToken(req);
      const uid = decodedToken.uid;
      const db = getFirestoreDb();

      // 1. Fetch user document
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "user_not_found",
          message: "User profile not found."
        });
      }

      const userData = userDoc.data() || {};
      
      // Check user lifecycle / active status
      if (userData.status === "inactive" || userData.lifecycleStatus === "terminated" || userData.isActive === false) {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "user_deactivated",
          message: "Your user account has been deactivated."
        });
      }

      // Super Admin has global platform access
      if (userData.role === "super_admin" || decodedToken.email === "nexusweft@gmail.com") {
        return res.json({
          authenticated: true,
          effectiveAccess: true,
          role: "super_admin",
          isSuperAdmin: true,
        });
      }

      // Tenant check
      const companyId = userData.companyId;
      if (!companyId) {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "no_company_association",
          message: "User is not associated with a company."
        });
      }

      const companyDoc = await db.collection("companies").doc(companyId).get();
      if (!companyDoc.exists) {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "company_not_found",
          message: "Company profile not found."
        });
      }

      const companyData = companyDoc.data() || {};
      if (companyData.status !== "active") {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "tenant_deactivated",
          companyStatus: companyData.status,
          message: "This company account has been deactivated."
        });
      }

      // Check membership access status if explicitly set
      if (userData.accessStatus && userData.accessStatus !== "active") {
        return res.status(403).json({
          authenticated: true,
          effectiveAccess: false,
          reason: "membership_suspended",
          message: "Your access to this company has been suspended."
        });
      }

      return res.json({
        authenticated: true,
        effectiveAccess: true,
        role: userData.role,
        companyId,
        userStatus: userData.status,
        tenantStatus: companyData.status
      });
    } catch (err: any) {
      const statusCode = err.status || 500;
      return res.status(statusCode).json({
        authenticated: false,
        effectiveAccess: false,
        errorCode: err.errorCode || "AUTH_CHECK_FAILED",
        message: err.message || "Failed to verify access status"
      });
    }
  });

  // ----------------------------------------------------
  // SUPER ADMIN TENANT DEACTIVATION
  // ----------------------------------------------------
  app.post("/api/super-admin/companies/:companyId/deactivate", async (req, res) => {
    try {
      const decodedToken = await verifyAndAuthorizeToken(req);
      const callerUid = decodedToken.uid;
      const db = getFirestoreDb();

      // Verify Super Admin
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const isSuper = decodedToken.email === "nexusweft@gmail.com" || callerData.role === "super_admin";
      if (!isSuper) {
        return res.status(403).json({ error: "Unauthorized. Super Admin permissions required." });
      }

      const { companyId } = req.params;
      const { reason } = req.body || {};
      if (!companyId) {
        return res.status(400).json({ error: "Missing companyId parameter." });
      }

      const companyRef = db.collection("companies").doc(companyId);
      const companyDoc = await companyRef.get();
      if (!companyDoc.exists) {
        return res.status(404).json({ error: "Company not found." });
      }

      const nowIso = new Date().toISOString();
      const operationId = `op_deact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Mark tenant status = "deactivation_pending"
      await companyRef.update({
        status: "deactivation_pending",
        updatedAt: nowIso
      });

      // Audit log start
      await db.collection("audit_logs").add({
        companyId,
        action: "tenant_deactivation_started",
        performedByUid: callerUid,
        reason: reason || "Super Admin deactivation initiated",
        previousStatus: companyDoc.data()?.status || "active",
        newStatus: "deactivation_pending",
        operationId,
        createdAt: nowIso
      });

      // 2. Load all associated tenant users and members
      const userMap = new Map<string, { uid: string; email?: string }>();

      const usersSnap = await db.collection("users").where("companyId", "==", companyId).get();
      for (const d of usersSnap.docs) {
        const uData = d.data();
        const uid = d.id;
        if (uid && !uid.startsWith("usr_pre_") && !uid.startsWith("inv_")) {
          userMap.set(uid, { uid, email: uData.email });
        }
      }

      const dispatchersSnap = await db.collection("admins").doc(companyId).collection("dispatchers").get();
      for (const d of dispatchersSnap.docs) {
        const uData = d.data();
        const uid = d.id;
        if (uid && !uid.startsWith("usr_pre_") && !uid.startsWith("inv_")) {
          userMap.set(uid, { uid, email: uData.email });
        }
      }

      const driversSnap = await db.collection("admins").doc(companyId).collection("drivers").get();
      for (const d of driversSnap.docs) {
        const uData = d.data();
        const uid = d.id;
        if (uid && !uid.startsWith("usr_pre_") && !uid.startsWith("inv_")) {
          userMap.set(uid, { uid, email: uData.email });
        }
      }

      const totalUsers = userMap.size;
      let membershipsSuspended = 0;
      let authUsersDisabled = 0;
      let refreshTokensRevoked = 0;
      const failedUsers: { uid: string; safeErrorCode: string }[] = [];

      for (const [uid, uInfo] of userMap.entries()) {
        try {
          // Suspend Firestore user document
          await db.collection("users").doc(uid).set({
            status: "inactive",
            lifecycleStatus: "inactive",
            isActive: false,
            accessStatus: "suspended",
            accessDisabledReason: "tenant_deactivated",
            accessDisabledAt: nowIso,
            accessDisabledByUid: callerUid,
            updatedAt: nowIso
          }, { merge: true });

          // Dispatcher subcollection
          const dispRef = db.collection("admins").doc(companyId).collection("dispatchers").doc(uid);
          const dispDoc = await dispRef.get();
          if (dispDoc.exists) {
            await dispRef.set({
              status: "inactive",
              accessStatus: "suspended",
              accessDisabledReason: "tenant_deactivated",
              accessDisabledAt: nowIso,
              accessDisabledByUid: callerUid,
              updatedAt: nowIso
            }, { merge: true });
          }

          // Driver subcollection
          const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(uid);
          const driverDoc = await driverRef.get();
          if (driverDoc.exists) {
            await driverRef.set({
              status: "inactive",
              accessStatus: "suspended",
              accessDisabledReason: "tenant_deactivated",
              accessDisabledAt: nowIso,
              accessDisabledByUid: callerUid,
              updatedAt: nowIso
            }, { merge: true });
          }

          membershipsSuspended++;

          await db.collection("audit_logs").add({
            companyId,
            action: "tenant_membership_suspended",
            targetUid: uid,
            performedByUid: callerUid,
            reason: "tenant_deactivated",
            operationId,
            createdAt: nowIso
          });

        } catch (fErr: any) {
          console.error(`Error suspending Firestore membership for user ${uid}:`, fErr);
        }

        // Disable in Firebase Auth and Revoke Refresh Tokens
        try {
          const authUser = await resolveAuthUserRecord(uid, uInfo?.email);
          if (authUser) {
            await getAuth().updateUser(authUser.uid, { disabled: true });
            authUsersDisabled++;

            await db.collection("audit_logs").add({
              companyId,
              action: "firebase_user_disabled",
              targetUid: authUser.uid,
              performedByUid: callerUid,
              operationId,
              createdAt: nowIso
            });

            await getAuth().revokeRefreshTokens(authUser.uid);
            refreshTokensRevoked++;

            await db.collection("audit_logs").add({
              companyId,
              action: "refresh_tokens_revoked",
              targetUid: authUser.uid,
              performedByUid: callerUid,
              operationId,
              createdAt: nowIso
            });

            try {
              const currentClaims = authUser.customClaims || {};
              await getAuth().setCustomUserClaims(authUser.uid, {
                ...currentClaims,
                tenantActive: false,
                accessVersion: Date.now()
              });
            } catch (claimsErr) {
              console.warn(`Could not update custom claims for ${authUser.uid}:`, claimsErr);
            }
          } else {
            console.log(`[deactivateCompany] User record ${uid} (${uInfo?.email || 'no email'}) does not have a Firebase Auth login account. Skipping Auth disable.`);
          }

        } catch (authErr: any) {
          if (authErr.code === "auth/user-not-found") {
            console.log(`[deactivateCompany] User ${uid} not found in Firebase Auth, skipping Auth disable.`);
          } else {
            console.error(`Failed to disable Firebase Auth user ${uid}:`, authErr);
            const safeCode = authErr.code || authErr.message || "auth_disable_failed";
            failedUsers.push({ uid, safeErrorCode: safeCode });
          }
        }
      }

      const overallStatus = failedUsers.length === 0 ? "completed" : "partial_failure";
      const finalTenantStatus = overallStatus === "completed" ? "deactivated" : "deactivation_pending";

      await companyRef.update({
        status: finalTenantStatus,
        deactivatedAt: nowIso,
        deactivatedByUid: callerUid,
        deactivationReason: reason || "Super Admin deactivation",
        updatedAt: nowIso
      });

      await db.collection("audit_logs").add({
        companyId,
        action: overallStatus === "completed" ? "tenant_deactivation_completed" : "tenant_deactivation_partial_failure",
        performedByUid: callerUid,
        reason: reason || "Super Admin deactivation",
        previousStatus: "deactivation_pending",
        newStatus: finalTenantStatus,
        operationId,
        safeErrorCode: failedUsers.length > 0 ? failedUsers[0].safeErrorCode : null,
        createdAt: nowIso
      });

      return res.json({
        companyId,
        totalUsers,
        membershipsSuspended,
        authUsersDisabled,
        refreshTokensRevoked,
        failedUsers,
        status: overallStatus,
        message: overallStatus === "completed" 
          ? "Company access and associated accounts successfully deactivated." 
          : `Tenant access was partially disabled. ${failedUsers.length} user accounts require attention.`
      });

    } catch (err: any) {
      console.error("Super Admin company deactivation failed:", err);
      return res.status(err.status || 500).json({
        error: err.message || "Internal server error during company deactivation"
      });
    }
  });

  // ----------------------------------------------------
  // SUPER ADMIN TENANT REACTIVATION
  // ----------------------------------------------------
  app.post("/api/super-admin/companies/:companyId/reactivate", async (req, res) => {
    try {
      const decodedToken = await verifyAndAuthorizeToken(req);
      const callerUid = decodedToken.uid;
      const db = getFirestoreDb();

      // Verify Super Admin
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const isSuper = decodedToken.email === "nexusweft@gmail.com" || callerData.role === "super_admin";
      if (!isSuper) {
        return res.status(403).json({ error: "Unauthorized. Super Admin permissions required." });
      }

      const { companyId } = req.params;
      const { reason } = req.body || {};
      if (!companyId) {
        return res.status(400).json({ error: "Missing companyId parameter." });
      }

      const companyRef = db.collection("companies").doc(companyId);
      const companyDoc = await companyRef.get();
      if (!companyDoc.exists) {
        return res.status(404).json({ error: "Company not found." });
      }

      const nowIso = new Date().toISOString();
      const operationId = `op_react_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      await db.collection("audit_logs").add({
        companyId,
        action: "tenant_reactivation_started",
        performedByUid: callerUid,
        reason: reason || "Super Admin reactivation initiated",
        previousStatus: companyDoc.data()?.status || "deactivated",
        newStatus: "active",
        operationId,
        createdAt: nowIso
      });

      const userMap = new Map<string, any>();
      const usersSnap = await db.collection("users").where("companyId", "==", companyId).get();
      for (const d of usersSnap.docs) {
        if (d.id && !d.id.startsWith("usr_pre_") && !d.id.startsWith("inv_")) {
          userMap.set(d.id, d.data());
        }
      }

      const dispatchersSnap = await db.collection("admins").doc(companyId).collection("dispatchers").get();
      for (const d of dispatchersSnap.docs) {
        if (d.id && !d.id.startsWith("usr_pre_") && !d.id.startsWith("inv_") && !userMap.has(d.id)) {
          userMap.set(d.id, d.data());
        }
      }

      const driversSnap = await db.collection("admins").doc(companyId).collection("drivers").get();
      for (const d of driversSnap.docs) {
        if (d.id && !d.id.startsWith("usr_pre_") && !d.id.startsWith("inv_") && !userMap.has(d.id)) {
          userMap.set(d.id, d.data());
        }
      }

      const totalUsers = userMap.size;
      let membershipsRestored = 0;
      let authUsersReenabled = 0;
      const failedUsers: { uid: string; safeErrorCode: string }[] = [];

      for (const [uid, userData] of userMap.entries()) {
        const disabledReason = userData.accessDisabledReason;
        const lifecycleStatus = userData.lifecycleStatus;

        if (lifecycleStatus === "terminated" || (disabledReason && disabledReason !== "tenant_deactivated")) {
          console.log(`Skipping reactivation for user ${uid} due to independent status: lifecycleStatus=${lifecycleStatus}, reason=${disabledReason}`);
          continue;
        }

        try {
          await db.collection("users").doc(uid).set({
            status: "active",
            lifecycleStatus: "active",
            isActive: true,
            accessStatus: "active",
            accessDisabledReason: null,
            accessDisabledAt: null,
            accessDisabledByUid: null,
            updatedAt: nowIso
          }, { merge: true });

          const dispRef = db.collection("admins").doc(companyId).collection("dispatchers").doc(uid);
          const dispDoc = await dispRef.get();
          if (dispDoc.exists) {
            await dispRef.set({
              status: "active",
              accessStatus: "active",
              accessDisabledReason: null,
              accessDisabledAt: null,
              accessDisabledByUid: null,
              updatedAt: nowIso
            }, { merge: true });
          }

          const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(uid);
          const driverDoc = await driverRef.get();
          if (driverDoc.exists) {
            await driverRef.set({
              status: "active",
              accessStatus: "active",
              accessDisabledReason: null,
              accessDisabledAt: null,
              accessDisabledByUid: null,
              updatedAt: nowIso
            }, { merge: true });
          }

          membershipsRestored++;

          await db.collection("audit_logs").add({
            companyId,
            action: "tenant_membership_restored",
            targetUid: uid,
            performedByUid: callerUid,
            operationId,
            createdAt: nowIso
          });

        } catch (fErr: any) {
          console.error(`Failed restoring Firestore user ${uid}:`, fErr);
        }

        try {
          const authUser = await resolveAuthUserRecord(uid, userData?.email);
          if (authUser) {
            await getAuth().updateUser(authUser.uid, { disabled: false });
            authUsersReenabled++;

            await getAuth().revokeRefreshTokens(authUser.uid);

            await db.collection("audit_logs").add({
              companyId,
              action: "firebase_user_reenabled",
              targetUid: authUser.uid,
              performedByUid: callerUid,
              operationId,
              createdAt: nowIso
            });

            try {
              const currentClaims = authUser.customClaims || {};
              await getAuth().setCustomUserClaims(authUser.uid, {
                ...currentClaims,
                tenantActive: true,
                accessVersion: Date.now()
              });
            } catch (claimsErr) {
              console.warn(`Could not update custom claims on re-enable for ${authUser.uid}:`, claimsErr);
            }
          } else {
            console.log(`[reactivateCompany] User record ${uid} (${userData?.email || 'no email'}) does not have a Firebase Auth login account. Skipping Auth re-enable.`);
          }

        } catch (authErr: any) {
          if (authErr.code === "auth/user-not-found") {
            console.log(`[reactivateCompany] User ${uid} not found in Firebase Auth, skipping Auth re-enable.`);
          } else {
            console.error(`Failed to re-enable Firebase Auth user ${uid}:`, authErr);
            failedUsers.push({ uid, safeErrorCode: authErr.code || authErr.message || "auth_enable_failed" });
          }
        }
      }

      await companyRef.update({
        status: "active",
        reactivatedAt: nowIso,
        reactivatedByUid: callerUid,
        updatedAt: nowIso
      });

      await db.collection("audit_logs").add({
        companyId,
        action: "tenant_reactivation_completed",
        performedByUid: callerUid,
        reason: reason || "Super Admin reactivation",
        previousStatus: companyDoc.data()?.status || "deactivated",
        newStatus: "active",
        operationId,
        createdAt: nowIso
      });

      return res.json({
        companyId,
        totalUsers,
        membershipsRestored,
        authUsersReenabled,
        failedUsers,
        status: failedUsers.length === 0 ? "completed" : "partial_failure",
        message: "Tenant company reactivated successfully. Re-enabled users must sign in fresh."
      });

    } catch (err: any) {
      console.error("Super Admin company reactivation failed:", err);
      return res.status(err.status || 500).json({
        error: err.message || "Internal server error during company reactivation"
      });
    }
  });

  app.post("/api/admin/create-tenant", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      // 1. Verify caller ID token
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      // 2. Validate Caller is Super Admin
      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data();
      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || (callerData && callerData.role === "super_admin");

      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: Super Admin privileges required" });
      }

      // 3. Parse input body
      const { name, contactEmail, contactName, dotNumber, plan, offerTrial, portalUrl } = req.body;
      if (!name || !contactEmail || !contactName || !dotNumber || !plan) {
        return res.status(400).json({ error: "Missing required fields in request body" });
      }

      const normalizedEmail = contactEmail.toLowerCase().trim();
      const isTrial = offerTrial !== false;
      const nowIso = new Date().toISOString();
      const trialEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // 4. Create or fetch Auth user
      let userRecord;
      try {
        userRecord = await getAuth().getUserByEmail(normalizedEmail);
        console.log(`User already exists in Firebase Auth: ${userRecord.uid}`);
      } catch (authErr: any) {
        if (authErr.code === "auth/user-not-found") {
          userRecord = await getAuth().createUser({
            email: normalizedEmail,
            displayName: contactName,
            emailVerified: true,
          });
          console.log(`Created new Firebase Auth user: ${userRecord.uid}`);
        } else {
          throw authErr;
        }
      }

      const uid = userRecord.uid;
      const generatedCoId = `co_vendor_${Date.now().toString().slice(-5)}_${Math.floor(100 + Math.random() * 900)}`;

      // 5. Create real Stripe customer if Stripe key is present, else simulation ID
      let stripeCustomerId = `cus_sim_${Math.random().toString(36).substring(2, 10)}`;
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          const customer = await stripe.customers.create({
            email: normalizedEmail,
            name: `${name} (${contactName})`,
            metadata: {
              companyId: generatedCoId,
              companyName: name,
              adminName: contactName,
              dotNumber: dotNumber || "",
              plan: plan || "Basic",
              isTrial: isTrial ? "true" : "false"
            }
          });
          stripeCustomerId = customer.id;
          console.log(`Created Stripe Customer ${customer.id} for company ${generatedCoId}`);
        } catch (custErr: any) {
          console.warn(`Could not create real Stripe Customer during onboarding: ${custErr.message}`);
        }
      }

      // Create Company document
      const companyData = {
        id: generatedCoId,
        name,
        dotNumber,
        address: "",
        contactEmail: normalizedEmail,
        contactPhone: "",
        plan,
        status: "pending",
        subscriptionStatus: "pending_checkout",
        paymentStatus: "pending",
        trialEnabled: isTrial,
        trialStart: isTrial ? nowIso : null,
        trialEnd: isTrial ? trialEndIso : null,
        stripeCustomerId,
        joinedDate: new Date().toISOString().split("T")[0],
        onboardingEmailsSent: 1,
        lastOnboardingEmailSent: new Date().toISOString(),
        invitationHistory: [
          {
            sentAt: new Date().toISOString(),
            sentBy: "super_admin",
            email: normalizedEmail,
          },
        ],
      };
      await db.collection("companies").doc(generatedCoId).set(companyData);

      // Create Stripe Customer record mapping if customer ID exists
      if (stripeCustomerId) {
        await db.collection("stripe_customers").doc(stripeCustomerId).set({
          stripeCustomerId,
          companyId: generatedCoId,
          companyName: name,
          contactEmail: normalizedEmail,
          contactName,
          plan,
          subscriptionStatus: isTrial ? "trialing" : "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 6. Create Admin record
      const adminData = {
        companyName: name,
        updatedAt: new Date().toISOString(),
      };
      await db.collection("admins").doc(generatedCoId).set(adminData, { merge: true });

      // 7. Create User profile
      const userData = {
        id: uid,
        name: contactName,
        email: normalizedEmail,
        role: "admin",
        status: "active",
        phone: "",
        companyId: generatedCoId,
        onboardingStatus: "password_setup_required",
      };
      await db.collection("users").doc(uid).set(userData);

      // 8. Generate password reset / setup link
      const resolvedPortalUrl = portalUrl || "http://localhost:3000";
      const setupLink = await getAuth().generatePasswordResetLink(normalizedEmail, {
        url: resolvedPortalUrl,
      });

      // 9. Queue welcome onboarding email in `/mail` collection
      const mailId = `mail_onboard_${Date.now()}`;
      const mailData = {
        to: normalizedEmail,
        message: {
          subject: "Welcome to TruckDispatch Pro - Your Tenant Portal is Ready!",
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
              <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px; text-align: center;">
                <h1 style="color: #4f46e5; font-size: 24px; margin: 0; font-weight: 700;">TruckDispatch Pro</h1>
                <span style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">SaaS Enterprise Portal</span>
              </div>
              
              <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Welcome, ${contactName}!</h2>
              
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                Your carrier fleet tenant space for <strong>${name}</strong> has been successfully provisioned by the Platform Administrator.
              </p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0; font-size: 14px; color: #4f46e5; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">📋 Tenant Configuration Profile:</h3>
                <table style="width: 100%; font-size: 13px; color: #4e5d78; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600;">Carrier Fleet:</td>
                    <td style="padding: 4px 0; text-align: right; color: #0f172a;">${name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600;">FMCSA DOT #:</td>
                    <td style="padding: 4px 0; text-align: right; color: #0f172a; font-family: monospace;">${dotNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600;">SaaS Subscription:</td>
                    <td style="padding: 4px 0; text-align: right; color: #0f172a;"><span style="background-color: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${plan}</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-weight: 600;">Admin Email Address:</td>
                    <td style="padding: 4px 0; text-align: right; color: #4f46e5; font-weight: 600;">${normalizedEmail}</td>
                  </tr>
                </table>
              </div>

              <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; background-color: #fffbeb; margin-bottom: 20px;">
                <h3 style="margin-top: 0; font-size: 14px; color: #b45309;">🔑 Account Activation Instructions:</h3>
                <p style="font-size: 13px; margin: 5px 0 12px 0; line-height: 1.5; color: #78350f;">
                  To secure your workspace, click the button below to set up your master password and activate your tenant:
                </p>
                <ol style="font-size: 13px; line-height: 1.6; color: #451a03; padding-left: 20px; margin: 0;">
                  <li>Click on the <strong>Set Password & Activate</strong> button below.</li>
                  <li>Configure your private login password.</li>
                  <li>Log in to your newly activated Fleet Administration Panel.</li>
                </ol>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${setupLink}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                  Set Password & Activate Account
                </a>
              </div>

              <div style="text-align: center; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  This is a secure automated system transmission. Do not forward.
                </p>
              </div>
            </div>
          `,
        },
      };
      await db.collection("mail").doc(mailId).set(mailData);

      // 10. Success Response
      res.json({
        success: true,
        companyId: generatedCoId,
        userId: uid,
        setupLink,
      });

    } catch (err: any) {
      console.error("Failed to onboard tenant Admin server-side:", err);
      res.status(500).json({ error: err.message || "Internal server error during tenant creation" });
    }
  });

  app.post("/api/admin/create-staff", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      // 1. Verify caller ID token
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      // 2. Parse input body
      const { name, email, password, role, companyId, phone, licenseNumber, truckNumber, ownerOperatorName } = req.body;
      if (!name || !email || !password || !role || !companyId) {
        return res.status(400).json({ error: "Missing required fields in request body" });
      }

      // 3. Authorization check
      const db = getFirestoreDb();
      const userSnap = await db.collection("users").doc(callerUid).get();
      const user = userSnap.exists ? userSnap.data() : null;

      const dispatcherSnap = await db
        .collection("admins")
        .doc(companyId)
        .collection("dispatchers")
        .doc(callerUid)
        .get();

      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || (user && user.role === "super_admin");
      const isTenantAdmin = user && user.role === "admin" && user.companyId === companyId;
      const isDispatcher = (user && user.role === "dispatcher" && user.companyId === companyId) || dispatcherSnap.exists;

      const allowed = isSuperAdmin || isTenantAdmin || (isDispatcher && role === "driver");

      if (!allowed) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to onboard staff for this company. Dispatchers are only permitted to onboard drivers." });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // 4. Create or fetch Auth user
      let userRecord;
      try {
        userRecord = await getAuth().getUserByEmail(normalizedEmail);
        console.log(`Staff already exists in Firebase Auth: ${userRecord.uid}`);
      } catch (authErr: any) {
        if (authErr.code === "auth/user-not-found") {
          userRecord = await getAuth().createUser({
            email: normalizedEmail,
            displayName: name,
            password: password,
            emailVerified: true,
          });
          console.log(`Created new Firebase Auth staff user: ${userRecord.uid}`);
        } else {
          throw authErr;
        }
      }

      const uid = userRecord.uid;

      // 5. Build full User Profile document
      const userData: any = {
        id: uid,
        name,
        email: normalizedEmail,
        role,
        status: "active",
        phone: phone || "",
        companyId,
      };

      if (role === "driver") {
        userData.licenseNumber = licenseNumber || "CDL-TX-882910";
        userData.truckNumber = truckNumber || "TRK-900";
        userData.ownerOperatorName = ownerOperatorName || "";
        userData.dutyStatus = "Off Duty";
        userData.manualLocationEnabled = false;
        userData.manualCity = "";
        userData.manualState = "";
        userData.manualDateTime = "";
        userData.manualNotes = "";
      } else if (role === "dispatcher") {
        if (req.body.permissions) {
          userData.permissions = req.body.permissions;
          userData.dispatcherPermissions = req.body.permissions;
        } else if (req.body.dispatcherPermissions) {
          userData.permissions = req.body.dispatcherPermissions;
          userData.dispatcherPermissions = req.body.dispatcherPermissions;
        }
      }

      // 6. Write to 'users' collection using Admin Privileges
      await db.collection("users").doc(uid).set(userData);

      // 7. Write to specific role subcollections under 'admins/{companyId}'
      if (role === "driver") {
        await db.collection("admins").doc(companyId).collection("drivers").doc(uid).set(userData);
      } else if (role === "dispatcher") {
        await db.collection("admins").doc(companyId).collection("dispatchers").doc(uid).set(userData);

        // Security Audit Log for Dispatcher Creation
        const auditId = `audit_onboard_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await db.collection("admins").doc(companyId).collection("security_audit_logs").doc(auditId).set({
          id: auditId,
          timestamp: new Date().toISOString(),
          actorUid: callerUid,
          actorEmail: callerEmail,
          actorRole: isSuperAdmin ? 'super_admin' : 'admin',
          targetUid: uid,
          targetEmail: normalizedEmail,
          action: 'DISPATCHER_CREATED',
          permissions: userData.permissions || null,
          notes: `Dispatcher ${name} onboarded with permission toggles`
        });
      }

      // 8. Queue a system notification
      const notifId = `notif_add_user_${Date.now()}`;
      const notifData = {
        id: notifId,
        title: role === "dispatcher" ? "👤 New Dispatcher Onboarded" : "👤 CDL Driver Onboarded",
        message: role === "dispatcher" 
          ? `Dispatcher ${name} (${normalizedEmail}) has been successfully added to the carrier organization.`
          : `CDL Driver ${name} (Truck: ${truckNumber || "N/A"}, CDL: ${licenseNumber || "N/A"}) has been successfully added to the carrier organization.`,
        type: "success",
        timestamp: new Date().toISOString(),
        read: false,
        forRole: "all",
        forCompanyId: companyId,
      };
      await db.collection("notifications").doc(notifId).set(notifData);

      // 8.5 Queue welcome email in `/mail` collection
      const mailId = `mail_staff_invite_${Date.now()}`;
      const mailData = {
        to: normalizedEmail,
        message: {
          subject: `Welcome to the Fleet Team! Your account is ready`,
          html: `
            <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #6d28d9; margin-top: 0; font-size: 20px;">Welcome to the Fleet Team!</h2>
              <p>Hello <strong>${name}</strong>,</p>
              <p>An account has been created for you as a <strong>${role.toUpperCase()}</strong> on the TruckDispatch Pro platform.</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Your Access Credentials:</strong></p>
                <p style="margin: 4px 0; font-size: 13px;">📧 <strong>Email:</strong> ${normalizedEmail}</p>
                <p style="margin: 4px 0; font-size: 13px;">🔑 <strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${password}</code></p>
              </div>

              <p>Please log in using your registered email and temporary password. We recommend updating your password immediately after logging in from your <strong>Settings</strong> panel.</p>
              
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="font-size: 11px; color: #64748b;">This invitation email was dispatched automatically by request of your Fleet Administrator. If you believe this is in error, please disregard this message.</p>
            </div>
          `,
        },
      };
      await db.collection("mail").doc(mailId).set(mailData);

      // 9. Success Response
      res.json({
        success: true,
        userId: uid,
      });

    } catch (err: any) {
      console.error("Failed to onboard staff member server-side:", err);
      res.status(500).json({ error: err.message || "Internal server error during staff creation" });
    }
  });

  // Phase 1: Automated Driver Notification Alert Dispatch Endpoint
  app.post("/api/notifications/dispatch-driver-alert", async (req, res) => {
    try {
      const { driverEmail, driverPhone, driverName, loadNumber, title, message, type, companyId } = req.body;

      if (!title || !message) {
        return res.status(400).json({ error: "Missing required notification title or message" });
      }

      const db = getFirestoreDb();
      const dispatchId = `dispatch_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = new Date().toISOString();

      // If driverEmail is present, queue in Firestore mail collection for email dispatch
      if (driverEmail) {
        try {
          const mailId = `mail_alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await db.collection("mail").doc(mailId).set({
            to: [driverEmail],
            message: {
              subject: `[TruckDispatchPro] ${title} ${loadNumber ? `- Load #${loadNumber}` : ''}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
                  <div style="background-color: #0f172a; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h2 style="color: #f59e0b; margin: 0; font-size: 20px;">TruckDispatchPro Operator Alert</h2>
                  </div>
                  <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background-color: #ffffff;">
                    <p style="font-size: 16px; font-weight: bold; margin-top: 0;">Hello ${driverName || 'Driver'},</p>
                    <p style="font-size: 14px; color: #334155;">${message}</p>
                    ${loadNumber ? `<div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin: 16px 0; font-family: monospace; font-size: 14px; font-weight: bold; text-align: center; color: #0284c7;">LOAD REF: #${loadNumber}</div>` : ''}
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                    <p style="font-size: 11px; color: #64748b; margin-bottom: 0;">This is an automated dispatch notification from your carrier fleet dashboard.</p>
                  </div>
                </div>
              `
            },
            createdAt: timestamp
          });
        } catch (mailErr) {
          console.warn("Could not queue mail doc:", mailErr);
        }
      }

      // If driverPhone is present, queue in Firestore sms_queue & dispatch via Twilio API if credentials exist
      let smsStatus = "skipped";
      if (driverPhone) {
        const smsBody = `[TruckDispatchPro Alert] ${title}: ${message}${loadNumber ? ` (Load #${loadNumber})` : ''}`;
        const smsId = `sms_alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        
        try {
          const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
          const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
          const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;

          if (twilioAccountSid && twilioAuthToken && twilioFromNumber) {
            // Live Twilio REST API SMS dispatch
            const authHeader = "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            const params = new URLSearchParams();
            params.append("To", driverPhone);
            params.append("From", twilioFromNumber);
            params.append("Body", smsBody);

            const twilioRes = await fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Authorization": authHeader,
                "Content-Type": "application/x-www-form-urlencoded"
              },
              body: params.toString()
            });

            if (twilioRes.ok) {
              smsStatus = "sent_via_twilio";
            } else {
              const errData = await twilioRes.text();
              let twilioMsg = "";
              try {
                const parsed = JSON.parse(errData);
                twilioMsg = parsed.message || errData;
              } catch {
                twilioMsg = errData;
              }
              console.info(`[SMS Dispatch] Twilio notification status (${twilioRes.status}): ${twilioMsg}`);
              smsStatus = "queued_in_app";
            }
          } else {
            smsStatus = "queued_in_sms_queue";
          }

          await db.collection("sms_queue").doc(smsId).set({
            to: driverPhone,
            body: smsBody,
            status: smsStatus,
            driverName: driverName || 'Driver',
            loadNumber: loadNumber || '',
            companyId: companyId || '',
            createdAt: timestamp
          });
        } catch (smsErr) {
          console.warn("Could not process SMS dispatch:", smsErr);
        }
      }

      // Record dispatch log entry
      const logEntry = {
        id: dispatchId,
        driverName: driverName || 'Driver',
        driverEmail: driverEmail || '',
        driverPhone: driverPhone || '',
        loadNumber: loadNumber || '',
        title,
        message,
        type: type || 'status_update',
        channels: [
          'in_app',
          ...(driverEmail ? ['email'] : []),
          ...(driverPhone ? ['sms'] : [])
        ],
        status: 'dispatched',
        companyId: companyId || '',
        timestamp
      };

      await db.collection("dispatch_logs").doc(dispatchId).set(logEntry);

      return res.json({
        success: true,
        dispatchId,
        channelsSent: logEntry.channels,
        smsStatus,
        timestamp
      });
    } catch (err: any) {
      console.error("Failed to process driver notification alert:", err);
      res.status(500).json({ error: err.message || "Internal server error during notification dispatch" });
    }
  });

  app.get("/api/notification-status", (req, res) => {
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    const accountSidConfigured = Boolean(twilioAccountSid && twilioAccountSid.trim() !== "");
    const authTokenConfigured = Boolean(twilioAuthToken && twilioAuthToken.trim() !== "");
    const phoneNumberConfigured = Boolean(twilioPhoneNumber && twilioPhoneNumber.trim() !== "");

    res.json({
      smsProvider: "Twilio",
      twilioConfigured: accountSidConfigured && authTokenConfigured && phoneNumberConfigured,
      details: {
        accountSidSet: accountSidConfigured,
        accountSidMasked: twilioAccountSid ? `${twilioAccountSid.substring(0, 4)}...${twilioAccountSid.slice(-4)}` : null,
        authTokenSet: authTokenConfigured,
        phoneNumberSet: phoneNumberConfigured,
        phoneNumberMasked: twilioPhoneNumber ? `${twilioPhoneNumber.substring(0, 3)}***${twilioPhoneNumber.slice(-4)}` : null,
      },
      queueFallback: "Firestore /sms_queue & /mail active"
    });
  });

  app.post("/api/profile/update", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      // 1. Verify token
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      // 2. Parse request body
      const { targetUserId, updates } = req.body;
      if (!targetUserId || !updates) {
        return res.status(400).json({ error: "Missing required fields: targetUserId and updates are required." });
      }

      const db = getFirestoreDb();

      // 3. Fetch caller and target profile
      let callerUserDoc = await db.collection("users").doc(callerUid).get();
      let callerUserData = callerUserDoc.exists ? (callerUserDoc.data() || {}) : {};
      
      if (!callerUserDoc.exists) {
        // Fallback: search across company staff directories if user doc hasn't been written to global /users
        const adminDoc = await db.collection("users").doc(callerUid).get();
        if (adminDoc.exists) {
          callerUserData = adminDoc.data() || {};
        } else {
          callerUserData = { role: (decodedToken as any).role || 'admin', companyId: (decodedToken as any).companyId || 'co_apex', email: callerEmail };
        }
      }

      let targetUserDoc = await db.collection("users").doc(targetUserId).get();
      let targetUserData = targetUserDoc.exists ? (targetUserDoc.data() || {}) : {};

      if (!targetUserDoc.exists) {
        if (targetUserId === callerUid) {
          targetUserData = callerUserData;
        } else {
          targetUserData = { id: targetUserId, role: 'driver', companyId: callerUserData.companyId };
        }
      }

      // 4. Perform authorization checks
      let isAllowed = false;
      let allowedKeys: string[] = [];

      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || callerUserData.role === "super_admin";

      const commonAllowedFields = [
        "name",
        "phone",
        "avatarUrl",
        "title",
        "notes",
        "licenseNumber",
        "licenseState",
        "licenseExpiration",
        "medCardExpiration",
        "address",
        "emergencyContactName",
        "emergencyContactPhone",
        "driverType",
        "equipmentType",
        "payRate",
        "payType",
        "carrierDotNumber",
        "mcNumber",
        "companyName",
        "truckNumber",
        "ownerOperatorName",
        "ownerOperatorCompanyId",
        "multiLoadEnabled",
        "maximumOpenLoads",
        "multiLoadEnabledAt",
        "multiLoadEnabledByUid",
        "currentTruckId",
        "currentTruckNumber",
        "currentOwnerOperatorCompanyId",
        "dutyStatus",
        "notes",
        "manualLocationEnabled",
        "manualCity",
        "manualState",
        "manualDateTime",
        "manualNotes",
        "email",
        "driverTermsAcceptedAt",
        "gpsConsentAcceptedAt",
        "smsConsentAcceptedAt",
        "legalAcceptedAt",
        "tourStatus",
        "notificationPreferences",
        "onboardingStatus",
        "lifecycleStatus",
        "accessStatus",
        "activationStatus",
        "employmentStatus",
        "isActive",
        "status",
        "complianceStatus",
        "onboardingStep",
        "updatedAt"
      ];

      if (isSuperAdmin) {
        isAllowed = true;
        allowedKeys = Object.keys(updates);
      } else if (targetUserId === callerUid) {
        // Self-update
        isAllowed = true;
        allowedKeys = commonAllowedFields;
      } else if (callerUserData.role === "admin" && callerUserData.companyId === targetUserData.companyId) {
        // Tenant Admin updating company staff
        isAllowed = true;
        allowedKeys = [
          ...commonAllowedFields,
          "status",
          "permissions",
          "dispatcherPermissions",
          "isArchived"
        ];
      } else if (callerUserData.role === "dispatcher" && callerUserData.companyId === targetUserData.companyId && targetUserData.role === "driver") {
        // Dispatcher updating driver
        isAllowed = true;
        allowedKeys = commonAllowedFields;
      }

      if (!isAllowed) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to update this profile." });
      }

      // Filter updates
      const dataToSave: any = {};
      for (const key of Object.keys(updates)) {
        if (allowedKeys.includes(key)) {
          dataToSave[key] = updates[key];
        }
      }

      if (Object.keys(dataToSave).length === 0) {
        return res.status(400).json({ error: "No permissible fields were provided for updating." });
      }

      if (targetUserData.role === "driver" && (dataToSave.driverTermsAcceptedAt || dataToSave.legalAcceptedAt || dataToSave.status === "active")) {
        dataToSave.onboardingStatus = "completed";
        dataToSave.lifecycleStatus = "active";
        dataToSave.accessStatus = "active";
        dataToSave.activationStatus = "activated";
        dataToSave.employmentStatus = "active";
        dataToSave.isActive = true;
        dataToSave.status = "active";
      }

      dataToSave.updatedAt = new Date().toISOString();

      // 5. Update both documents atomically using write batch
      const batch = db.batch();

      // Update global user document
      const userDocRef = db.collection("users").doc(targetUserId);
      batch.set(userDocRef, dataToSave, { merge: true });

      // Update tenant-specific role document if applicable
      const resolvedRole = targetUserData.role;
      const resolvedCompanyId = targetUserData.companyId;

      if (resolvedRole === "driver" && resolvedCompanyId) {
        const driverDocRef = db.collection("admins").doc(resolvedCompanyId).collection("drivers").doc(targetUserId);
        batch.set(driverDocRef, dataToSave, { merge: true });
      } else if (resolvedRole === "dispatcher" && resolvedCompanyId) {
        const dispatcherDocRef = db.collection("admins").doc(resolvedCompanyId).collection("dispatchers").doc(targetUserId);
        batch.set(dispatcherDocRef, dataToSave, { merge: true });
      }

      await batch.commit();

      if ((dataToSave.permissions || dataToSave.dispatcherPermissions) && resolvedRole === "dispatcher" && resolvedCompanyId) {
        try {
          const auditId = `audit_perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await db.collection("admins").doc(resolvedCompanyId).collection("security_audit_logs").doc(auditId).set({
            id: auditId,
            timestamp: new Date().toISOString(),
            actorUid: callerUid,
            actorEmail: callerEmail,
            actorRole: isSuperAdmin ? 'super_admin' : (callerUserData.role || 'admin'),
            targetUid: targetUserId,
            targetEmail: targetUserData.email || '',
            action: 'DISPATCHER_PERMISSIONS_UPDATED',
            permissions: dataToSave.permissions || dataToSave.dispatcherPermissions,
            notes: `Dispatcher access control permissions updated for ${targetUserData.name || targetUserId}`
          });
        } catch (auditErr) {
          console.error("Failed to write security audit log:", auditErr);
        }
      }

      res.json({ success: true, updatedFields: Object.keys(dataToSave) });
    } catch (err: any) {
      console.error("Failed to update profile server-side:", err);
      res.status(500).json({ error: err.message || "Internal server error during profile update" });
    }
  });

  app.post("/api/parse-rate-confirmation", async (req, res) => {
    const { fileData, mimeType, companyId } = req.body;

    if (!fileData || !mimeType) {
      return res.status(400).json({ error: "Missing fileData or mimeType" });
    }

    if (companyId) {
      try {
        const db = getFirestoreDb();
        const companyDoc = await db.collection("companies").doc(companyId).get();
        if (companyDoc.exists) {
          const compData = companyDoc.data();
          const plan = (compData?.plan || "Basic").toLowerCase();
          const subStatus = (compData?.subscriptionStatus || "active").toLowerCase();
          const isActive = ["active", "trialing", "paid"].includes(subStatus);
          if (!isActive || (plan !== "premium" && plan !== "enterprise")) {
            return res.status(403).json({
              error: "AI Rate Confirmation Parsing is a Premium Plan feature ($159.99/mo). Please upgrade your subscription on the Billing page to unlock AI features."
            });
          }
        }
      } catch (err) {
        console.warn("Could not check company subscription for AI parsing:", err);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not defined in environment variables");
      return res.status(500).json({ 
        error: "Gemini API key is not configured on the server. Please add GEMINI_API_KEY in the settings/environment variables." 
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      // Strip potential base64 prefix if present (e.g. "data:application/pdf;base64,")
      let cleanBase64 = fileData;
      if (fileData.includes(";base64,")) {
        cleanBase64 = fileData.split(";base64,")[1];
      }

      console.log(`Sending parsing request to gemini-3.5-flash (mimeType: ${mimeType})...`);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: "You are an expert logistics AI. Analyze this multi-page Rate Confirmation / Load Confirmation document and extract ALL structured logistics, pricing, and routing details. " +
                  "Look very carefully at all sections:\n" +
                  "1. LOAD/CONFIRMATION NUMBER: Look at the top right header area (e.g. 'M005126' on page 1) and 'Order' number (e.g. '0090379'). Extract 'M005126' as the main loadNumber and '0090379' as the order reference.\n" +
                  "2. REEFER TEMPERATURE: Extract the required trailer temperature (e.g. '33.0 Continuous' or '33 degrees').\n" +
                  "3. ROUTING STOPS (PICKUPS & DELIVERIES):\n" +
                  "   - Parse ALL pickup stops in order (PU 1, PU 2, PU 3, etc.) and ALL delivery/drop stops in order (SO 4, etc.).\n" +
                  "   - For EACH stop, extract the exact facility name, complete physical address (including city, state, and zip code), scheduled date and time (e.g. '06/01/2026 13:00' or '06/01/2026 10:00 - 16:00'), contact department or name, phone number, and any associated PU/PO reference numbers (e.g. PU 'TU970' or PU '236025', PO 'F119506052601').\n" +
                  "   - Capture stop-specific notes (like pallet counts, e.g., 'Pallets IN 14', 'Pallets IN 9', or instructions like 'MUST SEND POD BEFORE LEAVING').\n" +
                  "4. INSTRUCTIONS & GENERAL NOTES: Extract the overall carrier instructions, accessorial fees, fines ($500 early/late delivery fine, reefer continuous mode requirement, check call instructions) into the notes field.\n" +
                  "5. FINANCIALS: Extract total carrier pay (e.g. '$12,000.00' total pay consisting of '$11,500.00' carrier pay and '$500.00' miscellaneous)."
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              loadNumber: { type: Type.STRING, description: "The load confirmation or rate confirmation ID. Often at the top right corner of page 1 (e.g. 'M005126')." },
              companyName: { type: Type.STRING, description: "Freight broker, shipper, or logistics company name (e.g., Kool Logistics, LLC)" },
              carrierName: { type: Type.STRING, description: "Carrier company name to whom the load is issued (e.g., KARAN TRANSPORT INC or APEX LOGISTICS)" },
              cargoType: { type: Type.STRING, description: "Commodity type (e.g., Mixed Veg)" },
              weight: { type: Type.INTEGER, description: "Total cargo weight in lbs (integer, e.g. 35000)" },
              value: { type: Type.INTEGER, description: "Total cargo valuation or insurance coverage in USD (integer)" },
              rate: { type: Type.INTEGER, description: "Agreed total carrier payment rate in USD (integer, e.g., 12000)" },
              temperature: { type: Type.STRING, description: "Required trailer temperature setting (e.g., '33.0 F Continuous')" },
              urgent: { type: Type.BOOLEAN, description: "Whether the shipment is flagged as urgent or hot" },
              notes: { type: Type.STRING, description: "General shipment notes, carrier instructions, rules, fines, and reefer continuous mode instructions" },
              
              pickups: {
                type: Type.ARRAY,
                description: "Array of all pickup stops (PU 1, PU 2, etc.) in exact order.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    facilityName: { type: Type.STRING, description: "Facility name" },
                    address: { type: Type.STRING, description: "Street, city, state, zip" },
                    dateTime: { type: Type.STRING, description: "Scheduled date & time (e.g., '06/01/2026 13:00' or '06/01/2026 10:00 - 16:00')" },
                    contactName: { type: Type.STRING, description: "Contact person or receiving department" },
                    contactPhone: { type: Type.STRING, description: "Contact phone number" },
                    notes: { type: Type.STRING, description: "Specific stop-level notes (e.g., Pallets count, appointments, open hours)" },
                    referenceNumber: { type: Type.STRING, description: "PU number, order number or reference number for this specific pickup stop" },
                    specialInstructions: { type: Type.STRING, description: "Any special instructions for this pickup" }
                  },
                  required: ["facilityName", "address"]
                }
              },
              
              deliveries: {
                type: Type.ARRAY,
                description: "Array of all delivery drop stops (SO 4, etc.) in exact order.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    facilityName: { type: Type.STRING, description: "Facility name" },
                    address: { type: Type.STRING, description: "Street, city, state, zip" },
                    dateTime: { type: Type.STRING, description: "Scheduled delivery date & time (e.g., '06/05/2026 05:30')" },
                    contactName: { type: Type.STRING, description: "Contact person or receiving department" },
                    contactPhone: { type: Type.STRING, description: "Contact phone number" },
                    notes: { type: Type.STRING, description: "Specific stop-level notes (e.g., Pallets count, 'MUST SEND POD BEFORE LEAVING')" },
                    referenceNumber: { type: Type.STRING, description: "PO number or reference number for this specific delivery stop" },
                    specialInstructions: { type: Type.STRING, description: "Any special instructions for this delivery" }
                  },
                  required: ["facilityName", "address"]
                }
              }
            },
            required: [
              "loadNumber", "companyName", "cargoType", "weight", "rate", "pickups", "deliveries"
            ],
          },
        },
      });

      if (!response.text) {
        throw new Error("No response text received from Gemini API");
      }

      console.log("Successfully parsed rate confirmation from Gemini!");
      const parsedData = JSON.parse(response.text);
      res.json(parsedData);
    } catch (err: any) {
      console.error("Failed to parse Rate Confirmation with Gemini API:", err);
      res.status(500).json({ 
        error: "Failed to parse Rate Confirmation document: " + (err.message || err) 
      });
    }
  });

  // ==========================================
  // BILLING GUARD & ONE-SUBSCRIPTION ENGINE
  // ==========================================

  function calculateTenantBillingAccess(params: {
    companyData: any;
    stripeSubscription?: any;
    latestInvoice?: any;
    integrityResult?: any;
    now?: Date;
  }) {
    const { companyData, stripeSubscription, integrityResult, now = new Date() } = params;
    const status = companyData?.status || "active";
    const subStatus = (stripeSubscription?.status || companyData?.subscriptionStatus || "active").toLowerCase();
    const isDeactivated = status === "deactivated" || status === "suspended";

    let trialEndIso = companyData?.trialEnd || null;
    if (stripeSubscription?.trial_end) {
      trialEndIso = new Date(stripeSubscription.trial_end * 1000).toISOString();
    }

    let accessState: "full_access" | "trial_access" | "billing_warning" | "billing_restricted" | "administratively_deactivated" = "full_access";
    let accessAllowed = true;
    let restrictionReason: string | null = null;

    if (isDeactivated) {
      accessState = "administratively_deactivated";
      accessAllowed = false;
      restrictionReason = companyData?.deactivationReason || "account_deactivated";
    } else if (companyData?.billingAccessOverride && companyData?.overrideExpiresAt && new Date(companyData.overrideExpiresAt) > now) {
      accessState = "full_access";
      accessAllowed = true;
      restrictionReason = "manual_override_active";
    } else if (integrityResult?.integrityStatus === "duplicate_detected") {
      accessState = "billing_warning";
      accessAllowed = true;
      restrictionReason = "duplicate_subscription_detected";
    } else if (subStatus === "trialing" || (companyData?.trialEnabled && trialEndIso)) {
      if (trialEndIso && new Date(trialEndIso) > now) {
        accessState = "trial_access";
        accessAllowed = true;
      } else {
        if (companyData?.paymentStatus === "paid" || subStatus === "active") {
          accessState = "full_access";
          accessAllowed = true;
        } else {
          accessState = "billing_restricted";
          accessAllowed = false;
          restrictionReason = "trial_ended";
        }
      }
    } else if (subStatus === "active") {
      const periodEndIso = companyData?.currentPeriodEnd || (stripeSubscription?.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null);
      if (companyData?.cancelAtPeriodEnd && periodEndIso && new Date(periodEndIso) < now) {
        accessState = "billing_restricted";
        accessAllowed = false;
        restrictionReason = "subscription_period_expired";
      } else {
        accessState = "full_access";
        accessAllowed = true;
      }
    } else if (["past_due", "incomplete", "incomplete_expired", "unpaid", "paused", "canceled"].includes(subStatus)) {
      accessState = "billing_restricted";
      accessAllowed = false;
      restrictionReason = subStatus;
    } else {
      if (companyData?.paymentStatus === "failed" || companyData?.status === "pending_billing" || companyData?.status === "pending") {
        accessState = "billing_restricted";
        accessAllowed = false;
        restrictionReason = "payment_pending_or_failed";
      }
    }

    return {
      accessState,
      accessAllowed,
      dashboardAllowed: accessAllowed,
      billingPageAllowed: true,
      restrictionReason,
      calculatedAt: now.toISOString(),
      effectiveAt: now.toISOString(),
      calculationVersion: "2.0.0"
    };
  }

  async function syncStripeInvoicesForTenant(companyId: string) {
    const db = getFirestoreDb();
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) return [];
    const compData = companyDoc.data() || {};
    const customerId = compData.stripeCustomerId;
    if (!customerId || !customerId.startsWith("cus_") || !process.env.STRIPE_SECRET_KEY) return [];

    try {
      const stripe = getStripe();
      const invoicesList = await stripe.invoices.list({ customer: customerId, limit: 100 });
      const synced: any[] = [];
      for (const inv of invoicesList.data) {
        const invoiceId = "stripe_inv_" + inv.id;
        const invData = {
          id: invoiceId,
          invoiceNumber: inv.number || `INV-${new Date().getFullYear()}-001`,
          companyId: companyId,
          amount: (inv.amount_paid || inv.total || 0) / 100,
          status: inv.status === "paid" ? "paid" : "unpaid",
          date: new Date((inv.created || Date.now() / 1000) * 1000).toISOString().split("T")[0],
          dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
          description: inv.lines?.data[0]?.description || `TruckDispatch Pro SaaS Subscription`,
          pdfUrl: inv.invoice_pdf || null,
          hostedInvoiceUrl: inv.hosted_invoice_url || null,
          syncedAt: new Date().toISOString()
        };
        await db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId).set(invData, { merge: true });
        synced.push(invData);
      }
      return synced;
    } catch (err: any) {
      console.warn(`[Invoice Sync] Error syncing invoices for ${companyId}:`, err.message);
      return [];
    }
  }

  async function getOrCreateCanonicalStripeCustomer(companyId: string) {
    const db = getFirestoreDb();
    const companyRef = db.collection("companies").doc(companyId);
    
    const companyDoc = await companyRef.get();
    if (!companyDoc.exists) {
      throw new Error(`Company ${companyId} not found`);
    }
    const companyData = companyDoc.data() || {};
    const canonicalName = companyData.name || companyData.legalName || "TD Pro Tenant";
    const billingEmail = companyData.contactEmail || companyData.billingEmail || "";

    // 1. If stripeCustomerId exists, verify and reuse
    if (companyData.stripeCustomerId && companyData.stripeCustomerId.startsWith("cus_")) {
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          const existingCustomer = await stripe.customers.retrieve(companyData.stripeCustomerId);
          if (existingCustomer && !('deleted' in existingCustomer && existingCustomer.deleted)) {
            const cust = existingCustomer as any;
            if (cust.name !== canonicalName || cust.metadata?.companyId !== companyId) {
              await stripe.customers.update(cust.id, {
                name: canonicalName,
                description: `TD Pro tenant — ${canonicalName}`,
                metadata: {
                  ...cust.metadata,
                  companyId: companyId,
                  tenantLegalName: canonicalName,
                  billingOwnerUid: companyData.ownerUid || "",
                  environment: process.env.NODE_ENV || "development"
                }
              });
            }
            return { customerId: cust.id, customer: cust };
          }
        } catch (e: any) {
          console.warn(`Stored Stripe Customer ${companyData.stripeCustomerId} invalid:`, e.message);
        }
      } else {
        return { customerId: companyData.stripeCustomerId };
      }
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      const simId = `cus_sim_${Math.random().toString(36).substring(2, 10)}`;
      await companyRef.set({ stripeCustomerId: simId, billingUpdatedAt: new Date().toISOString() }, { merge: true });
      return { customerId: simId };
    }

    const stripe = getStripe();

    // 2. Search Stripe by metadata companyId
    try {
      const searchRes = await stripe.customers.search({
        query: `metadata['companyId']:'${companyId}'`
      });
      const validMatch = searchRes.data.filter((c: any) => !c.deleted);
      if (validMatch.length === 1) {
        const matchedCust = validMatch[0];
        if (matchedCust.name !== canonicalName) {
          await stripe.customers.update(matchedCust.id, {
            name: canonicalName,
            description: `TD Pro tenant — ${canonicalName}`
          });
        }
        await companyRef.set({ stripeCustomerId: matchedCust.id, billingUpdatedAt: new Date().toISOString() }, { merge: true });
        return { customerId: matchedCust.id, customer: matchedCust };
      } else if (validMatch.length > 1) {
        for (const cust of validMatch) {
          const subs = await stripe.subscriptions.list({ customer: cust.id, limit: 5 });
          if (subs.data.some(s => ["active", "trialing", "past_due"].includes(s.status))) {
            await stripe.customers.update(cust.id, {
              name: canonicalName,
              description: `TD Pro tenant — ${canonicalName}`
            });
            await companyRef.set({ stripeCustomerId: cust.id, billingUpdatedAt: new Date().toISOString() }, { merge: true });
            return { customerId: cust.id, customer: cust, reviewRequired: true };
          }
        }
      }
    } catch (searchErr: any) {
      console.warn(`Customer search by metadata failed for ${companyId}:`, searchErr.message);
    }

    // 3. Create canonical Customer with Idempotency Key
    const idempotencyKey = `tdpro:${process.env.NODE_ENV || "test"}:${companyId}:create_customer:v1`;
    const newCustomer = await stripe.customers.create({
      email: billingEmail,
      name: canonicalName,
      description: `TD Pro tenant — ${canonicalName}`,
      metadata: {
        companyId: companyId,
        tenantLegalName: canonicalName,
        billingOwnerUid: companyData.ownerUid || "",
        environment: process.env.NODE_ENV || "development"
      }
    }, { idempotencyKey });

    await companyRef.set({
      stripeCustomerId: newCustomer.id,
      customerCreationStatus: "completed",
      billingUpdatedAt: new Date().toISOString()
    }, { merge: true });

    return { customerId: newCustomer.id, customer: newCustomer };
  }

  async function checkTenantSubscriptionIntegrity(companyId: string) {
    const db = getFirestoreDb();
    const companyDoc = await db.collection("companies").doc(companyId).get();
    if (!companyDoc.exists) {
      return {
        companyId,
        integrityStatus: "missing_customer",
        nonTerminalSubscriptionCount: 0,
        duplicateSubscriptionIds: []
      };
    }

    const compData = companyDoc.data() || {};
    const customerId = compData.stripeCustomerId;
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

    let nonTerminalSubs: any[] = [];
    let totalSubs = 0;

    if (hasStripeKey && customerId && customerId.startsWith("cus_")) {
      try {
        const stripe = getStripe();
        const subsList = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
        totalSubs = subsList.data.length;
        nonTerminalSubs = subsList.data.filter((s: any) =>
          ["trialing", "active", "incomplete", "past_due", "unpaid", "paused"].includes(s.status)
        );
      } catch (err: any) {
        console.warn(`[Integrity Scanner] Error querying Stripe subscriptions for ${customerId}:`, err.message);
      }
    }

    const nonTerminalCount = nonTerminalSubs.length;
    const duplicateDetected = nonTerminalCount > 1;
    const integrityStatus = duplicateDetected
      ? "duplicate_detected"
      : (!customerId || customerId.startsWith("cus_sim_") ? "healthy" : (totalSubs === 0 && compData.plan ? "missing_subscription" : "healthy"));

    if (duplicateDetected) {
      const duplicateIds = nonTerminalSubs.map((s: any) => s.id);
      await companyDoc.ref.set({
        duplicateSubscriptionDetected: true,
        billingIntegrityStatus: "duplicate_detected",
        duplicateSubscriptionIds: duplicateIds,
        billingUpdatedAt: new Date().toISOString()
      }, { merge: true });

      const alertId = "alert_dup_sub_" + companyId;
      await db.collection("notifications").doc(alertId).set({
        id: alertId,
        title: "Duplicate Subscriptions Detected",
        message: `Company ${compData.name || companyId} has ${nonTerminalCount} active/non-terminal Stripe subscriptions. Immediate review required in Super Admin Billing Guard.`,
        type: "error",
        timestamp: new Date().toISOString(),
        read: false,
        forRole: "super_admin",
        forCompanyId: companyId
      }, { merge: true });
    } else {
      await companyDoc.ref.set({
        duplicateSubscriptionDetected: false,
        billingIntegrityStatus: integrityStatus,
        billingUpdatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return {
      companyId,
      customerCount: customerId ? 1 : 0,
      subscriptionCount: totalSubs,
      nonTerminalSubscriptionCount: nonTerminalCount,
      canonicalSubscriptionId: nonTerminalSubs[0]?.id || compData.stripeSubscriptionId || null,
      duplicateSubscriptionIds: duplicateDetected ? nonTerminalSubs.map((s: any) => s.id) : [],
      integrityStatus
    };
  }

  // Auth Access Status Check
  app.get("/api/auth/access-status", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ authenticated: false, error: "Missing authorization token" });
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      const userData = userDoc.data();

      if (!userData) {
        return res.status(404).json({ authenticated: false, error: "User profile not found" });
      }

      if (userData.role === "super_admin") {
        return res.json({
          authenticated: true,
          uid: decoded.uid,
          role: "super_admin",
          accessState: "full_access",
          accessAllowed: true,
          allowedRoutes: ["*"],
          companyId: userData.companyId || null
        });
      }

      const companyId = userData.companyId;
      if (!companyId) {
        return res.json({
          authenticated: true,
          uid: decoded.uid,
          role: userData.role,
          companyId: null,
          accessState: "billing_restricted",
          accessAllowed: false,
          allowedRoutes: ["/billing", "/billing/payment-required", "/support", "/logout"],
          reason: "missing_company"
        });
      }

      const companyDoc = await db.collection("companies").doc(companyId).get();
      const companyData = companyDoc.data() || {};

      const accessCalc = calculateTenantBillingAccess({ companyData });

      res.json({
        authenticated: true,
        uid: decoded.uid,
        role: userData.role,
        companyId,
        companyName: companyData.name || "Carrier Tenant",
        plan: companyData.plan || "Basic",
        subscriptionStatus: companyData.subscriptionStatus || "active",
        paymentStatus: companyData.paymentStatus || "paid",
        accessState: accessCalc.accessState,
        accessAllowed: accessCalc.accessAllowed,
        allowedRoutes: accessCalc.accessAllowed
          ? ["*"]
          : ["/billing", "/billing/payment-required", "/support", "/logout"],
        reason: accessCalc.restrictionReason,
        stripeCustomerId: companyData.stripeCustomerId || null,
        trialEnd: companyData.trialEnd || null
      });
    } catch (err: any) {
      console.error("Failed to check auth access status:", err);
      res.status(401).json({ authenticated: false, error: "Invalid token" });
    }
  });

  // ==========================================
  // STRIPE & BILLING INTEGRATION ENDPOINTS
  // ==========================================

  // 1. Create Checkout Session
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    const { plan, companyId, trialEnabled, portalUrl } = req.body;
    if (!plan || !companyId) {
      return res.status(400).json({ error: "Missing required fields: plan, companyId" });
    }

    const normPlan = (plan || "Basic").toLowerCase() === "premium" ? "Premium" : "Basic";
    const requestedTrial = Boolean(trialEnabled);
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
    let callerUid = "anonymous";
    let callerRole = "";

    // Verify Firebase ID token if stripe key is active (real production mode)
    if (hasStripeKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
      }
      const token = authHeader.split("Bearer ")[1];
      try {
        const decodedToken = await getAuth().verifyIdToken(token);
        callerUid = decodedToken.uid;
        const db = getFirestoreDb();
        const userDoc = await db.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();
        if (!userData || (userData.role !== "admin" && userData.role !== "super_admin")) {
          return res.status(403).json({ error: "Forbidden: Tenant Admins or Super Admins only" });
        }
        if (userData.role === "admin" && userData.companyId !== companyId) {
          return res.status(403).json({ error: "Forbidden: You do not belong to this company" });
        }
        callerRole = userData.role;
      } catch (err: any) {
        console.error("Token verification failed for Stripe checkout:", err);
        return res.status(401).json({ error: "Unauthorized: Invalid session token" });
      }
    }

    try {
      const db = getFirestoreDb();
      const companyDoc = await db.collection("companies").doc(companyId).get();
      const companyData = companyDoc.data() || {};

      // ONE-SUBSCRIPTION CHECK: Block creation of duplicate subscription if one is already active/trialing/past_due WITH a real stripeSubscriptionId
      const subStatus = (companyData.subscriptionStatus || "").toLowerCase();
      const hasRealSub = Boolean(companyData.stripeSubscriptionId && companyData.stripeSubscriptionId.startsWith("sub_"));
      if (hasRealSub && ["active", "trialing", "past_due", "incomplete", "paused"].includes(subStatus)) {
        return res.status(400).json({
          errorCode: "SUBSCRIPTION_ALREADY_EXISTS",
          message: "This company already has an active or pending subscription. Manage your existing subscription from Billing Portal.",
          action: "OPEN_BILLING_PORTAL"
        });
      }

      // Record Operation Lock
      const operationId = "op_sub_" + Date.now();
      await db.collection("companies").doc(companyId).collection("billing_operations").doc(operationId).set({
        operationType: "create_subscription",
        status: "started",
        planCode: normPlan,
        createdByUid: callerUid,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });

      // Only allow trial if caller is super_admin OR company has offerTrial/trialEnabled authorized by Super Admin
      const isSuperAdmin = callerRole === "super_admin";
      const isTrialAuthorizedBySuperAdmin = Boolean(companyData.offerTrial || companyData.trialEnabled);
      const isTrial = requestedTrial && (isSuperAdmin || isTrialAuthorizedBySuperAdmin);

      if (hasStripeKey) {
        const stripe = getStripe();
        
        let line_items;
        const priceId = (normPlan === "Premium" ? process.env.STRIPE_PRICE_PREMIUM : process.env.STRIPE_PRICE_BASIC)?.trim();
        const unitAmount = normPlan === "Premium" ? 15999 : 5999; // $159.99/mo or $59.99/mo

        if (priceId) {
          if (priceId.startsWith("price_") || priceId.startsWith("plan_")) {
            line_items = [{ price: priceId, quantity: 1 }];
          } else if (priceId.startsWith("prod_")) {
            line_items = [{
              price_data: {
                currency: "usd",
                product: priceId,
                unit_amount: unitAmount,
                recurring: { interval: "month" }
              },
              quantity: 1
            }];
          } else {
            line_items = [{ price: priceId, quantity: 1 }];
          }
        } else {
          line_items = [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `TruckDispatch Pro - ${normPlan} Plan`,
                description: `Monthly SaaS License (${normPlan} Tier)`,
              },
              unit_amount: unitAmount,
              recurring: { interval: "month" }
            },
            quantity: 1
          }];
        }

        const originHeader = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer as string).origin : undefined);
        const appUrl = portalUrl || process.env.PUBLIC_APP_URL || process.env.APP_URL || originHeader || "http://localhost:3000";
        const sessionParams: any = {
          payment_method_types: ["card"],
          mode: "subscription",
          client_reference_id: companyId,
          line_items,
          success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/billing?cancel=true`,
          metadata: {
            companyId,
            tenantAdminUid: callerUid,
            operationId,
            plan: normPlan,
            trialEnabled: isTrial ? "true" : "false",
          },
          subscription_data: {
            metadata: {
              companyId,
              tenantAdminUid: callerUid,
              operationId,
              plan: normPlan,
              trialEnabled: isTrial ? "true" : "false",
            }
          }
        };

        if (isTrial) {
          sessionParams.subscription_data.trial_period_days = 30;
        }

        try {
          const { customerId } = await getOrCreateCanonicalStripeCustomer(companyId);
          if (customerId) {
            sessionParams.customer = customerId;
            delete sessionParams.customer_email;
          }
        } catch (custErr: any) {
          console.warn("Canonical customer lookup warning during checkout creation:", custErr.message);
          if (companyData.stripeCustomerId && companyData.stripeCustomerId.startsWith("cus_") && !companyData.stripeCustomerId.startsWith("cus_sim_")) {
            sessionParams.customer = companyData.stripeCustomerId;
          } else if (companyData.billingEmail || companyData.contactEmail) {
            sessionParams.customer_email = companyData.billingEmail || companyData.contactEmail;
          }
        }

        let session;
        const idempotencyKey = `tdpro:${process.env.NODE_ENV || "dev"}:${companyId}:${operationId}`;

        try {
          session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });
        } catch (stripeErr: any) {
          console.warn("Initial Stripe Checkout session creation failed:", stripeErr.message);
          let retryNeeded = false;

          // Handle stale/invalid Stripe Customer ID (e.g. No such customer: 'cus_...')
          if (
            sessionParams.customer &&
            (stripeErr?.message?.includes("No such customer") ||
             stripeErr?.message?.includes("No such Customer") ||
             (stripeErr?.code === "resource_missing" && stripeErr?.param === "customer"))
          ) {
            console.warn(`Stripe Customer ${sessionParams.customer} not found. Removing customer param and using email fallback...`);
            delete sessionParams.customer;
            if (companyData.billingEmail || companyData.contactEmail) {
              sessionParams.customer_email = companyData.billingEmail || companyData.contactEmail;
            }
            db.collection("companies").doc(companyId).update({ stripeCustomerId: null }).catch(e => console.warn("Could not clear invalid stripeCustomerId:", e));
            retryNeeded = true;
          }

          if (
            priceId &&
            (stripeErr?.code === "resource_missing" ||
             stripeErr?.type === "StripeInvalidRequestError" ||
             stripeErr?.message?.includes("No such price") ||
             stripeErr?.message?.includes("No such product"))
          ) {
            console.warn("Retrying Stripe Checkout creation with inline product_data fallback...");
            sessionParams.line_items = [{
              price_data: {
                currency: "usd",
                product_data: {
                  name: `TruckDispatch Pro - ${normPlan} Plan`,
                  description: `Monthly SaaS License (${normPlan} Tier)`,
                },
                unit_amount: unitAmount,
                recurring: { interval: "month" }
              },
              quantity: 1
            }];
            retryNeeded = true;
          }

          if (retryNeeded) {
            session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: idempotencyKey + "_retry" });
          } else {
            throw stripeErr;
          }
        }

        await db.collection("companies").doc(companyId).collection("billing_operations").doc(operationId).update({
          status: "completed",
          checkoutSessionId: session.id
        });

        res.json({ success: true, url: session.url });
      } else {
        console.log(`Running checkout in Sandbox Simulation mode for company ${companyId} on ${normPlan} plan (trial: ${isTrial})`);
        const mockUrl = `/api/stripe/mock-checkout?plan=${normPlan}&companyId=${companyId}&trialEnabled=${isTrial ? "true" : "false"}&portalUrl=${encodeURIComponent(portalUrl || "http://localhost:3000")}`;
        res.json({ success: true, url: mockUrl });
      }
    } catch (err: any) {
      console.error("Failed to create Stripe Checkout Session:", err);
      res.status(500).json({ error: err.message || "Failed to initialize checkout session" });
    }
  });

  // 1.b Verify Checkout Session (Return-Session Reconciliation Fallback)
  app.post("/api/stripe/verify-checkout-session", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing required field: sessionId" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }

    const token = authHeader.split("Bearer ")[1];
    let callerUid = "";
    let callerRole = "";
    let callerCompanyId = "";

    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      callerUid = decodedToken.uid;
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data();
      if (!userData || (userData.role !== "admin" && userData.role !== "super_admin")) {
        return res.status(403).json({ error: "Forbidden: Admin or Super Admin access required" });
      }
      callerRole = userData.role;
      callerCompanyId = userData.companyId || "";
    } catch (err: any) {
      console.error("Token verification failed for verify-checkout-session:", err);
      return res.status(401).json({ error: "Unauthorized: Invalid session token" });
    }

    const db = getFirestoreDb();
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

    try {
      if (hasStripeKey && !sessionId.startsWith("cs_sim_") && !sessionId.startsWith("mock_")) {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["subscription"]
        });

        if (!session || session.status !== "complete") {
          return res.status(400).json({ error: "Checkout session is not complete" });
        }

        if (session.mode !== "subscription") {
          return res.status(400).json({ error: "Checkout session is not a subscription session" });
        }

        if (!session.subscription) {
          return res.status(400).json({ error: "No subscription attached to checkout session" });
        }

        const companyId = session.metadata?.companyId;
        if (!companyId) {
          return res.status(400).json({ error: "Missing companyId in session metadata" });
        }

        if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
          return res.status(403).json({ error: "Forbidden: Session belongs to another company" });
        }

        const subscription: any = typeof session.subscription === "string" 
          ? await stripe.subscriptions.retrieve(session.subscription) 
          : session.subscription;

        const subStatus = subscription.status; // e.g. "active", "trialing", etc.
        const isBillingActive = subStatus === "active" || subStatus === "trialing";
        const payStatus = subStatus === "trialing" ? "trialing" : (isBillingActive ? "paid" : "pending");
        const rawPlan = session.metadata?.plan || subscription?.metadata?.plan || "Basic";
        const normPlan = rawPlan.toString().toLowerCase() === "premium" ? "Premium" : "Basic";

        let periodStart = new Date().toISOString();
        let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        let trialStartIso: string | null = null;
        let trialEndIso: string | null = null;

        if (subscription.current_period_start) {
          periodStart = new Date(subscription.current_period_start * 1000).toISOString();
        }
        if (subscription.current_period_end) {
          periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
        }
        if (subscription.trial_start) {
          trialStartIso = new Date(subscription.trial_start * 1000).toISOString();
        }
        if (subscription.trial_end) {
          trialEndIso = new Date(subscription.trial_end * 1000).toISOString();
        }

        const stripeCustomerId = typeof session.customer === "string" ? session.customer : (session.customer?.id || "");
        const stripeSubscriptionId = typeof subscription === "string" ? subscription : subscription.id;
        const stripePriceId = subscription.items?.data?.[0]?.price?.id || "";

        // Update company document idempotently
        await db.collection("companies").doc(companyId).set({
          plan: normPlan,
          status: isBillingActive ? "active" : "pending_billing",
          subscriptionStatus: subStatus,
          paymentStatus: payStatus,
          trialEnabled: subStatus === "trialing",
          stripeCustomerId: stripeCustomerId || null,
          stripeSubscriptionId: stripeSubscriptionId || null,
          stripePriceId: stripePriceId || null,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialStart: trialStartIso,
          trialEnd: trialEndIso,
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          billingUpdatedAt: new Date().toISOString()
        }, { merge: true });

        // Update stripe customer mapping
        if (stripeCustomerId) {
          await db.collection("stripe_customers").doc(stripeCustomerId).set({
            stripeCustomerId,
            companyId,
            plan: normPlan,
            subscriptionStatus: subStatus,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        // Create billing audit record for reconciliation
        const reconcileEventId = `reconcile_${sessionId}`;
        await db.collection("admins").doc(companyId).collection("billing_events").doc(reconcileEventId).set({
          stripeEventId: reconcileEventId,
          type: "checkout.session.reconciled_return",
          companyId,
          sessionId,
          plan: normPlan,
          subscriptionStatus: subStatus,
          status: "reconciled",
          processedAt: new Date().toISOString(),
          source: "return_url_verification"
        }, { merge: true });

        return res.json({
          success: true,
          companyId,
          subscriptionStatus: subStatus,
          status: isBillingActive ? "active" : "pending_billing"
        });
      } else {
        // Fallback for simulation / mock mode
        const companyId = callerCompanyId;
        if (!companyId) {
          return res.status(400).json({ error: "Missing companyId for user" });
        }

        await db.collection("companies").doc(companyId).set({
          status: "active",
          subscriptionStatus: "active",
          paymentStatus: "paid",
          billingUpdatedAt: new Date().toISOString()
        }, { merge: true });

        const reconcileEventId = `reconcile_${sessionId}`;
        await db.collection("admins").doc(companyId).collection("billing_events").doc(reconcileEventId).set({
          stripeEventId: reconcileEventId,
          type: "checkout.session.reconciled_return",
          companyId,
          sessionId,
          subscriptionStatus: "active",
          status: "reconciled",
          processedAt: new Date().toISOString(),
          source: "return_url_verification_sim"
        }, { merge: true });

        return res.json({
          success: true,
          companyId,
          subscriptionStatus: "active",
          status: "active"
        });
      }
    } catch (err: any) {
      console.error("Failed to verify checkout session:", err);
      return res.status(500).json({ error: err.message || "Failed to verify checkout session" });
    }
  });

  // 2. Create Customer Portal Session
  app.post("/api/stripe/create-portal-session", async (req, res) => {
    const { companyId, portalUrl } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: "Missing required field: companyId" });
    }

    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

    if (hasStripeKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
      }
      const token = authHeader.split("Bearer ")[1];
      try {
        const decodedToken = await getAuth().verifyIdToken(token);
        const db = getFirestoreDb();
        const userDoc = await db.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();
        if (!userData || (userData.role !== "admin" && userData.role !== "super_admin")) {
          return res.status(403).json({ error: "Forbidden: Admin access required" });
        }
        if (userData.role === "admin" && userData.companyId !== companyId) {
          return res.status(403).json({ error: "Forbidden: You do not belong to this company" });
        }
      } catch (err: any) {
        console.error("Token verification failed for Stripe billing portal:", err);
        return res.status(401).json({ error: "Unauthorized: Invalid session token" });
      }
    }

    try {
      const db = getFirestoreDb();
      const companyDoc = await db.collection("companies").doc(companyId).get();
      const companyData = companyDoc.data();
      
      if (!companyData) {
        return res.status(404).json({ error: "Company profile not found" });
      }

      if (hasStripeKey) {
        const stripe = getStripe();
        let customerId = companyData.stripeCustomerId;
        const originHeader = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer as string).origin : undefined);
        const appUrl = portalUrl || process.env.PUBLIC_APP_URL || process.env.APP_URL || originHeader || "http://localhost:3000";
        const companyEmail = companyData.contactEmail || companyData.billingEmail || "";

        // 1. If customerId is missing or simulation ID, search or create customer in Stripe
        if (!customerId || customerId.startsWith("cus_sim_") || !customerId.startsWith("cus_")) {
          console.log(`[Stripe Portal] No valid stripeCustomerId found for company ${companyId}. Searching or creating customer in Stripe...`);
          if (companyEmail) {
            try {
              const existingList = await stripe.customers.list({ email: companyEmail, limit: 1 });
              if (existingList.data.length > 0) {
                customerId = existingList.data[0].id;
              } else {
                const newCustomer = await stripe.customers.create({
                  email: companyEmail,
                  name: companyData.name || "Carrier Tenant",
                  metadata: { companyId }
                });
                customerId = newCustomer.id;
              }
              // Save reconciled customerId to Firestore
              await db.collection("companies").doc(companyId).set({
                stripeCustomerId: customerId,
                billingUpdatedAt: new Date().toISOString()
              }, { merge: true });
            } catch (custErr: any) {
              console.warn("[Stripe Portal] Could not resolve Stripe customer:", custErr.message);
            }
          }
        }

        // 2. Attempt to create Billing Portal session
        if (customerId && customerId.startsWith("cus_")) {
          try {
            const session = await stripe.billingPortal.sessions.create({
              customer: customerId,
              return_url: `${appUrl}/billing`,
            });
            return res.json({ success: true, url: session.url });
          } catch (portalErr: any) {
            console.warn(`[Stripe Portal] Customer Portal creation failed for ${customerId}:`, portalErr.message);

            // If customer was missing/deleted in Stripe, try re-creating customer
            if (
              portalErr?.message?.includes("No such customer") ||
              portalErr?.message?.includes("No such Customer") ||
              (portalErr?.code === "resource_missing" && portalErr?.param === "customer")
            ) {
              console.log(`[Stripe Portal] Customer ${customerId} not found in Stripe. Re-creating customer...`);
              if (companyEmail) {
                try {
                  const newCust = await stripe.customers.create({
                    email: companyEmail,
                    name: companyData.name || "Carrier Tenant",
                    metadata: { companyId }
                  });
                  customerId = newCust.id;
                  await db.collection("companies").doc(companyId).set({
                    stripeCustomerId: customerId,
                    billingUpdatedAt: new Date().toISOString()
                  }, { merge: true });

                  const session = await stripe.billingPortal.sessions.create({
                    customer: customerId,
                    return_url: `${appUrl}/billing`,
                  });
                  return res.json({ success: true, url: session.url });
                } catch (retryErr: any) {
                  console.warn("[Stripe Portal] Retry with new customer failed:", retryErr.message);
                }
              }
            }
          }
        }

        // 3. Fallback: If Customer Portal cannot be opened, generate a Checkout Session URL
        console.log(`[Stripe Portal] Redirecting company ${companyId} to Checkout Session fallback`);
        const normPlan = companyData.plan || "Basic";
        const unitAmount = normPlan === "Premium" ? 15999 : 5999;
        const checkoutParams: any = {
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `TruckDispatch Pro - ${normPlan} Plan`,
                description: `Monthly SaaS License (${normPlan} Tier)`,
              },
              unit_amount: unitAmount,
              recurring: { interval: "month" }
            },
            quantity: 1
          }],
          success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/billing?cancel=true`,
          metadata: { companyId, plan: normPlan }
        };

        if (customerId && customerId.startsWith("cus_")) {
          checkoutParams.customer = customerId;
        } else if (companyEmail) {
          checkoutParams.customer_email = companyEmail;
        }

        if (companyData.offerTrial || companyData.trialEnabled) {
          checkoutParams.subscription_data = {
            trial_period_days: 30,
            metadata: { companyId, plan: normPlan, trialEnabled: "true" }
          };
        }

        const checkoutSession = await stripe.checkout.sessions.create(checkoutParams);
        return res.json({ success: true, url: checkoutSession.url, redirectedToCheckout: true });
      } else {
        console.log(`Running billing portal in Sandbox Simulation mode for company ${companyId}`);
        const mockUrl = `/api/stripe/mock-portal?companyId=${companyId}&portalUrl=${encodeURIComponent(portalUrl || "http://localhost:3000")}`;
        res.json({ success: true, url: mockUrl });
      }
    } catch (err: any) {
      console.error("Failed to create billing portal session:", err);
      res.status(500).json({ error: err.message || "Failed to initialize customer portal session" });
    }
  });

  // 3. Get Subscription Status & Feature Flags
  app.get("/api/stripe/subscription-status", async (req, res) => {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId query parameter" });
    }

    try {
      const db = getFirestoreDb();
      const companyDoc = await db.collection("companies").doc(companyId).get();
      if (!companyDoc.exists) {
        return res.status(404).json({ error: "Company not found" });
      }

      const compData = companyDoc.data() || {};
      const plan = compData.plan || "Basic";
      const subscriptionStatus = compData.subscriptionStatus || "active";
      const paymentStatus = compData.paymentStatus || "paid";

      const isNormPremium = (plan.toLowerCase() === "premium" || plan.toLowerCase() === "enterprise");
      const isStatusActive = ["active", "trialing", "paid"].includes(subscriptionStatus.toLowerCase());
      const isPremiumAndActive = isNormPremium && isStatusActive;

      res.json({
        success: true,
        companyId,
        plan,
        subscriptionStatus,
        paymentStatus,
        trialEnabled: Boolean(compData.trialEnabled || subscriptionStatus === "trialing"),
        trialStart: compData.trialStart || null,
        trialEnd: compData.trialEnd || null,
        stripeCustomerId: compData.stripeCustomerId || null,
        currentPeriodStart: compData.currentPeriodStart || null,
        currentPeriodEnd: compData.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(compData.cancelAtPeriodEnd),
        billingEmail: compData.billingEmail || compData.contactEmail || null,
        features: {
          aiParsing: isPremiumAndActive,
          gpsTracking: isPremiumAndActive,
          aiScraping: isPremiumAndActive,
          advancedAutomation: isPremiumAndActive,
          manualLoads: true,
          basicDispatch: true
        }
      });
    } catch (err: any) {
      console.error("Failed to fetch subscription status:", err);
      res.status(500).json({ error: "Failed to retrieve subscription status" });
    }
  });

  // 4. Simulated Hosted Checkout UI Page (HTML)
  app.get("/api/stripe/mock-checkout", (req, res) => {
    const { plan, companyId, trialEnabled, portalUrl } = req.query;
    const isTrial = trialEnabled === "true";
    const price = plan === "Premium" ? "$159.99" : "$59.99";
    const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stripe Checkout (Simulation)</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; }
        </style>
      </head>
      <body class="bg-[#f6f9fc] text-[#30313d] min-h-screen flex items-center justify-center p-4">
        <div class="bg-white shadow-xl rounded-2xl overflow-hidden w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
          <!-- Left Panel (Product Details) -->
          <div class="md:col-span-5 bg-[#0a2540] text-white p-8 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 mb-8">
                <div class="h-6 w-6 rounded bg-[#635bff] flex items-center justify-center text-white font-bold text-xs">S</div>
                <span class="font-semibold text-sm tracking-tight text-[#cbf4c9]">TruckDispatch Pro Sandbox</span>
              </div>
              
              <div class="space-y-1">
                <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Subscribe to</p>
                <h2 class="text-2xl font-bold">TruckDispatch Pro</h2>
                <p class="text-sm text-slate-300 font-medium">${plan} Plan ${isTrial ? '(30-Day Free Trial)' : ''}</p>
              </div>
            </div>
            
            <div class="mt-8 border-t border-slate-700/50 pt-6">
              ${isTrial ? `
                <div class="bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-3 mb-4">
                  <span class="text-xs font-bold text-emerald-400 uppercase tracking-wide block">30-Day Free Trial Offered</span>
                  <p class="text-[11px] text-slate-300 mt-1">Payment details are collected today. Your first charge of ${price} will be on <strong>${trialEndDate}</strong>.</p>
                </div>
              ` : ''}
              <div class="flex justify-between items-baseline mb-2">
                <span class="text-2xl font-extrabold text-[#cbf4c9]">${isTrial ? '$0.00 today' : price}</span>
                <span class="text-xs text-slate-400">${isTrial ? `then ${price}/mo` : 'USD / month'}</span>
              </div>
              <p class="text-[11px] text-slate-400">Cancel anytime via the self-service billing portal.</p>
            </div>
          </div>
          
          <!-- Right Panel (Simulated Payment Form) -->
          <div class="md:col-span-7 p-8 flex flex-col justify-between bg-white">
            <div>
              <div class="flex justify-between items-center pb-4 mb-6 border-b">
                <h3 class="font-bold text-lg text-[#0a2540]">Pay with card</h3>
                <span class="bg-yellow-50 text-yellow-700 border border-yellow-100 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                  Demo Sandbox
                </span>
              </div>
              
              <form action="/api/stripe/mock-checkout-complete" method="POST" class="space-y-4">
                <input type="hidden" name="plan" value="${plan}">
                <input type="hidden" name="companyId" value="${companyId}">
                <input type="hidden" name="trialEnabled" value="${isTrial ? 'true' : 'false'}">
                <input type="hidden" name="portalUrl" value="${portalUrl}">
                
                <div class="space-y-1">
                  <label class="text-xs font-semibold text-[#4f5b66]">Email</label>
                  <input type="email" required class="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#635bff]" value="admin@carrier.com" readonly>
                </div>
                
                <div class="space-y-1">
                  <label class="text-xs font-semibold text-[#4f5b66]">Card information</label>
                  <div class="relative">
                    <input type="text" required class="w-full border rounded-lg p-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#635bff]" value="4242 •••• •••• 4242" readonly>
                    <div class="absolute right-3 top-3 text-[#a3acb9]">
                      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2 mt-2">
                    <input type="text" placeholder="MM / YY" value="12/28" class="border rounded-lg p-2.5 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#635bff]" readonly>
                    <input type="text" placeholder="CVC" value="412" class="border rounded-lg p-2.5 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#635bff]" readonly>
                  </div>
                </div>
                
                <div class="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs text-purple-900 leading-relaxed">
                  <strong>Stripe Integration Mode</strong>: This page simulates the Stripe Hosted Checkout flow. Clicking below will trigger simulated webhooks and activate the <strong>${plan} Plan</strong> ${isTrial ? 'with a 30-day free trial' : 'immediately'}.
                </div>
                
                <button type="submit" class="w-full bg-[#635bff] hover:bg-[#0a2540] text-white font-semibold py-3 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2">
                  ${isTrial ? 'Start 30-Day Free Trial' : 'Simulate Successful Subscription'} <span class="font-extrabold">&rarr;</span>
                </button>
              </form>
            </div>
            
            <div class="text-[11px] text-slate-400 text-center border-t pt-4 mt-6">
              Powered by <strong class="text-slate-500">Stripe</strong>. Simulated secure transactions.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  });

  // 5. Simulated Checkout Completion Redirect Handlers
  app.post("/api/stripe/mock-checkout-complete", async (req, res) => {
    const { plan, companyId, trialEnabled, portalUrl } = req.body;
    if (!companyId) {
      return res.status(400).send("Missing companyId");
    }

    try {
      const db = getFirestoreDb();
      const companyRef = db.collection("companies").doc(companyId);
      
      const isTrial = trialEnabled === "true";
      const stripeCustomerId = "cus_sim_" + Math.random().toString(36).substring(2, 10);
      const stripeSubscriptionId = "sub_sim_" + Math.random().toString(36).substring(2, 10);
      const currentPeriodStart = new Date().toISOString();
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const trialStart = isTrial ? currentPeriodStart : null;
      const trialEnd = isTrial ? currentPeriodEnd : null;
      const normPlan = (plan || "Basic").toLowerCase() === "premium" ? "Premium" : "Basic";
      
      await companyRef.update({
        plan: normPlan,
        status: "active",
        subscriptionStatus: isTrial ? "trialing" : "active",
        paymentStatus: isTrial ? "trialing" : "paid",
        trialEnabled: isTrial,
        trialStart: trialStart,
        trialEnd: trialEnd,
        stripeCustomerId,
        stripeSubscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        billingUpdatedAt: new Date().toISOString()
      });

      // Create simulated billing invoice if not trial
      if (!isTrial) {
        const invoiceId = "sim_inv_" + Date.now();
        const invoiceNumber = `INV-${new Date().getFullYear()}-00` + Math.floor(100 + Math.random() * 900);
        await db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId).set({
          id: invoiceId,
          invoiceNumber: invoiceNumber,
          companyId: companyId,
          amount: normPlan === "Premium" ? 159.99 : 59.99,
          date: new Date().toISOString().split("T")[0],
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          status: "paid",
          isManual: false,
          description: `TruckDispatch Pro - ${normPlan} Plan Subscription (Sandbox)`
        });
      }

      // Audit event
      const eventId = "evt_sim_" + Date.now();
      await db.collection("admins").doc(companyId).collection("billing_events").doc(eventId).set({
        stripeEventId: eventId,
        type: "checkout.session.completed",
        companyId: companyId,
        plan: normPlan,
        subscriptionStatus: isTrial ? "trialing" : "active",
        trialStart: trialStart,
        trialEnd: trialEnd,
        status: "processed",
        processedAt: new Date().toISOString(),
        summary: isTrial
          ? `Simulated checkout completed with 30-day free trial for ${normPlan} plan.`
          : `Simulated checkout completed for ${normPlan} plan.`
      });

      // Send real-time notification
      const notifId = "notif_billing_" + Date.now();
      await db.collection("notifications").doc(notifId).set({
        id: notifId,
        title: isTrial ? "30-Day Free Trial Activated" : "Subscription Activated",
        message: isTrial
          ? `Your 30-day free trial for ${normPlan} Plan is now active! Enjoy full feature access.`
          : `Your company subscription has been successfully upgraded to ${normPlan} Plan! Welcome to TruckDispatch Pro.`,
        type: "success",
        timestamp: new Date().toISOString(),
        read: false,
        forRole: "admin",
        forCompanyId: companyId
      });

      res.redirect(`${portalUrl}/billing?success=true&session_id=cs_sim_${Date.now()}`);
    } catch (err: any) {
      console.error("Failed to complete mock checkout:", err);
      res.status(500).send("Simulation error: " + err.message);
    }
  });

  // 6. Simulated Self-Service Customer Portal (HTML)
  app.get("/api/stripe/mock-portal", (req, res) => {
    const { companyId, portalUrl } = req.query;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stripe Customer Portal (Simulation)</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; }
        </style>
      </head>
      <body class="bg-[#f8fafc] text-slate-800 min-h-screen">
        <div class="max-w-4xl mx-auto py-12 px-4">
          <!-- Header -->
          <div class="flex justify-between items-center pb-8 border-b border-slate-200 mb-8">
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded bg-purple-600 flex items-center justify-center text-white font-extrabold text-sm">S</div>
              <div>
                <h1 class="text-xl font-bold tracking-tight text-[#0a2540]">TruckDispatch Pro Billing</h1>
                <p class="text-xs text-slate-500">Stripe Customer Billing Portal Simulation</p>
              </div>
            </div>
            <a href="${portalUrl}/billing" class="text-xs bg-[#0a2540] text-white hover:bg-slate-800 px-4 py-2 rounded-lg font-semibold transition shadow-sm">
              Exit Portal
            </a>
          </div>
          
          <!-- Main Panel -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
            <!-- Left Content -->
            <div class="md:col-span-8 space-y-6">
              <!-- Active Plans -->
              <div class="bg-white border rounded-xl p-6 shadow-sm">
                <h2 class="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Current Subscription Plan</h2>
                <div class="flex justify-between items-start">
                  <div>
                    <h3 class="text-lg font-bold text-slate-900">TruckDispatch Pro (Monthly License)</h3>
                    <p class="text-xs text-slate-500 mt-1">Billed to registered fleet card ending in 4242</p>
                  </div>
                  <span class="bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                    ✓ Active
                  </span>
                </div>
                
                <div class="mt-6 flex gap-4 border-t pt-6">
                  <form action="/api/stripe/mock-portal-action" method="POST">
                    <input type="hidden" name="companyId" value="${companyId}">
                    <input type="hidden" name="portalUrl" value="${portalUrl}">
                    <input type="hidden" name="action" value="cancel">
                    <button type="submit" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 text-xs px-4 py-2 rounded-lg font-semibold transition">
                      Cancel Subscription
                    </button>
                  </form>
                </div>
              </div>
            </div>
            
            <!-- Right Stats / Instructions -->
            <div class="md:col-span-4 space-y-6">
              <div class="bg-yellow-50 border border-yellow-100 rounded-xl p-5 text-xs text-yellow-800 leading-relaxed space-y-3">
                <h3 class="font-bold uppercase tracking-wider text-yellow-900 text-[10px]">Developer Notice</h3>
                <p>You are viewing the simulated Customer Portal because the production Stripe Key is running in Sandbox mode.</p>
                <p>Here you can test client subscription lifecycles such as cancelling, updating payment methods, or viewing receipts.</p>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  });

  // 7. Simulated Customer Portal Action Redirection Handler
  app.post("/api/stripe/mock-portal-action", async (req, res) => {
    const { companyId, portalUrl, action } = req.body;
    if (!companyId) {
      return res.status(400).send("Missing companyId");
    }

    try {
      const db = getFirestoreDb();
      const companyRef = db.collection("companies").doc(companyId);
      
      if (action === "cancel") {
        await companyRef.update({
          subscriptionStatus: "canceled",
          cancelAtPeriodEnd: true,
          billingUpdatedAt: new Date().toISOString()
        });

        // Audit event
        const eventId = "evt_sim_" + Date.now();
        await db.collection("admins").doc(companyId).collection("billing_events").doc(eventId).set({
          stripeEventId: eventId,
          type: "customer.subscription.deleted",
          companyId: companyId,
          status: "processed",
          processedAt: new Date().toISOString(),
          summary: "Simulated subscription cancellation."
        });

        const notifId = "notif_billing_" + Date.now();
        await db.collection("notifications").doc(notifId).set({
          id: notifId,
          title: "Subscription Cancelled",
          message: "Your monthly subscription has been canceled and will end at the current period end.",
          type: "warning",
          timestamp: new Date().toISOString(),
          read: false,
          forRole: "admin",
          forCompanyId: companyId
        });
      }

      res.redirect(`${portalUrl}/billing`);
    } catch (err: any) {
      console.error("Failed to execute mock portal action:", err);
      res.status(500).send("Simulation error: " + err.message);
    }
  });

  // 8. Real Stripe Webhook Signature Verification & Processing Handler
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig && webhookSecret) {
      return res.status(400).send("Missing stripe-signature header");
    }

    try {
      const stripe = getStripe();
      const payload = (req as any).rawBody || req.body;
      let event: Stripe.Event;

      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(payload, sig as string, webhookSecret);
      } else {
        event = typeof payload === "string" ? JSON.parse(payload) : payload;
      }
      
      const db = getFirestoreDb();

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const companyId = session.metadata?.companyId;
          const plan = session.metadata?.plan || "Premium";
          const normPlan = plan.toLowerCase() === "premium" ? "Premium" : "Basic";
          const isTrialRequested = session.metadata?.trialEnabled === "true" || session.subscription_data?.trial_period_days === 30;
          
          if (companyId) {
            const companyRef = db.collection("companies").doc(companyId);
            const periodStart = new Date().toISOString();
            const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            let subStatus = isTrialRequested ? "trialing" : "active";
            let payStatus = isTrialRequested ? "trialing" : "paid";
            let trialStartIso: string | null = null;
            let trialEndIso: string | null = null;

            if (session.subscription) {
              try {
                const sub = await stripe.subscriptions.retrieve(session.subscription);
                subStatus = sub.status;
                payStatus = sub.status === "trialing" ? "trialing" : (sub.status === "active" ? "paid" : "failed");
                if (sub.trial_start) trialStartIso = new Date(sub.trial_start * 1000).toISOString();
                if (sub.trial_end) trialEndIso = new Date(sub.trial_end * 1000).toISOString();
              } catch (err) {
                console.warn("Could not retrieve subscription details from Stripe:", err);
              }
            }

            await companyRef.update({
              plan: normPlan,
              status: "active",
              subscriptionStatus: subStatus,
              paymentStatus: payStatus,
              trialEnabled: subStatus === "trialing",
              trialStart: trialStartIso,
              trialEnd: trialEndIso,
              stripeCustomerId: session.customer || "",
              stripeSubscriptionId: session.subscription || "",
              stripePriceId: session.line_items?.data[0]?.price?.id || "",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              billingEmail: session.customer_details?.email || "",
              billingUpdatedAt: new Date().toISOString()
            });
            
            if (subStatus === "active") {
              const invoiceId = "stripe_inv_" + session.id;
              const invoiceNumber = `INV-${new Date().getFullYear()}-00` + Math.floor(100 + Math.random() * 900);
              await db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId).set({
                id: invoiceId,
                invoiceNumber: invoiceNumber,
                companyId: companyId,
                amount: normPlan === "Premium" ? 159.99 : 59.99,
                date: new Date().toISOString().split("T")[0],
                dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                status: "paid",
                isManual: false,
                description: `TruckDispatch Pro - ${normPlan} Plan Subscription`
              });
            }

            if (session.customer) {
              await db.collection("stripe_customers").doc(session.customer).set({
                stripeCustomerId: session.customer,
                companyId,
                plan: normPlan,
                subscriptionStatus: subStatus,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }

            // Audit event log
            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              plan: normPlan,
              subscriptionStatus: subStatus,
              trialStart: trialStartIso,
              trialEnd: trialEndIso,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: subStatus === "trialing"
                ? `Checkout completed with 30-day trial for ${normPlan} plan.`
                : `Checkout session completed for ${normPlan} plan.`
            });
            
            const notifId = "notif_billing_" + Date.now();
            await db.collection("notifications").doc(notifId).set({
              id: notifId,
              title: subStatus === "trialing" ? "30-Day Free Trial Activated" : "Subscription Activated",
              message: subStatus === "trialing"
                ? `Your 30-day free trial for ${normPlan} Plan has started!`
                : `Your company subscription has been successfully updated to ${normPlan} Plan via Stripe!`,
              type: "success",
              timestamp: new Date().toISOString(),
              read: false,
              forRole: "admin",
              forCompanyId: companyId
            });
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as any;
          const stripeCustomerId = subscription.customer;
          const companyQuery = await db.collection("companies").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
          if (!companyQuery.empty) {
            const companyDoc = companyQuery.docs[0];
            const companyId = companyDoc.id;
            const priceId = subscription.items?.data[0]?.price?.id || "";
            const subMetaPlan = (subscription.metadata?.plan || "").toString().toLowerCase();
            const priceName = (subscription.items?.data[0]?.price?.nickname || subscription.items?.data[0]?.product?.name || "").toString().toLowerCase();
            const isPremium = 
              subMetaPlan === "premium" ||
              (process.env.STRIPE_PRICE_PREMIUM && priceId === process.env.STRIPE_PRICE_PREMIUM) ||
              priceName.includes("premium");
            const normPlan = isPremium ? "Premium" : (subMetaPlan === "basic" ? "Basic" : (companyDoc.data()?.plan || "Basic"));

            const subStatus = subscription.status;
            const isTrial = subStatus === "trialing";
            const payStatus = isTrial ? "trialing" : (subStatus === "active" ? "paid" : "failed");

            const trialStartIso = subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null;
            const trialEndIso = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

            const updateData: any = {
              plan: normPlan,
              subscriptionStatus: subStatus,
              paymentStatus: payStatus,
              trialEnabled: isTrial,
              cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : new Date().toISOString(),
              currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : new Date().toISOString(),
              billingUpdatedAt: new Date().toISOString()
            };

            if (trialStartIso) updateData.trialStart = trialStartIso;
            if (trialEndIso) updateData.trialEnd = trialEndIso;

            await companyDoc.ref.update(updateData);

            // Audit event log
            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              plan: normPlan,
              subscriptionStatus: subStatus,
              trialStart: trialStartIso,
              trialEnd: trialEndIso,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: `Subscription ${subStatus} updated for ${normPlan} plan.`
            });
          }
          break;
        }

        case "customer.subscription.trial_will_end": {
          const subscription = event.data.object as any;
          const stripeCustomerId = subscription.customer;
          const companyQuery = await db.collection("companies").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
          if (!companyQuery.empty) {
            const companyDoc = companyQuery.docs[0];
            const companyId = companyDoc.id;
            const companyData = companyDoc.data() || {};
            const normPlan = companyData.plan || "Basic";
            const trialEndIso = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              plan: normPlan,
              subscriptionStatus: "trial_ending_soon",
              trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
              trialEnd: trialEndIso,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: `30-day trial will end soon on ${trialEndIso}.`
            });

            const notifId = "notif_trial_end_" + Date.now();
            await db.collection("notifications").doc(notifId).set({
              id: notifId,
              title: "Trial Ending Soon",
              message: `Your 30-day free trial will end in 3 days. Your registered payment method will be charged automatically.`,
              type: "warning",
              timestamp: new Date().toISOString(),
              read: false,
              forRole: "admin",
              forCompanyId: companyId
            });
          }
          break;
        }
        
        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          const stripeCustomerId = subscription.customer;
          const companyQuery = await db.collection("companies").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
          if (!companyQuery.empty) {
            const companyDoc = companyQuery.docs[0];
            const companyId = companyDoc.id;

            await companyDoc.ref.update({
              subscriptionStatus: "canceled",
              paymentStatus: "pending",
              trialEnabled: false,
              cancelAtPeriodEnd: false,
              billingUpdatedAt: new Date().toISOString()
            });

            // Audit event log
            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: `Subscription canceled.`
            });
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as any;
          const stripeCustomerId = invoice.customer;
          const companyQuery = await db.collection("companies").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
          if (!companyQuery.empty) {
            const companyDoc = companyQuery.docs[0];
            const companyId = companyDoc.id;
            const compData = companyDoc.data() || {};
            const normPlan = compData.plan || "Basic";

            await companyDoc.ref.update({
              paymentStatus: "paid",
              subscriptionStatus: "active",
              trialEnabled: false,
              billingUpdatedAt: new Date().toISOString()
            });

            // Save Invoice
            const invoiceId = "stripe_inv_" + (invoice.id || Date.now());
            await db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId).set({
              id: invoiceId,
              invoiceNumber: invoice.number || `INV-${new Date().getFullYear()}-00` + Math.floor(100 + Math.random() * 900),
              companyId,
              amount: (invoice.amount_paid || 0) / 100,
              date: new Date(invoice.created * 1000).toISOString().split("T")[0],
              dueDate: new Date((invoice.created + 15 * 24 * 3600) * 1000).toISOString().split("T")[0],
              status: "paid",
              isManual: false,
              description: `TruckDispatch Pro Subscription Payment`
            });

            // Audit event log
            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              plan: normPlan,
              subscriptionStatus: "active",
              trialStart: compData.trialStart || null,
              trialEnd: compData.trialEnd || null,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: `Invoice ${invoice.number || invoice.id} paid. Subscription activated/renewed.`
            });
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as any;
          const stripeCustomerId = invoice.customer;
          const companyQuery = await db.collection("companies").where("stripeCustomerId", "==", stripeCustomerId).limit(1).get();
          if (!companyQuery.empty) {
            const companyDoc = companyQuery.docs[0];
            const companyId = companyDoc.id;
            const compData = companyDoc.data() || {};
            const normPlan = compData.plan || "Basic";

            await companyDoc.ref.update({
              paymentStatus: "failed",
              subscriptionStatus: "past_due",
              trialEnabled: false,
              billingUpdatedAt: new Date().toISOString()
            });

            // Audit event log
            await db.collection("admins").doc(companyId).collection("billing_events").doc(event.id).set({
              stripeEventId: event.id,
              type: event.type,
              companyId,
              plan: normPlan,
              subscriptionStatus: "past_due",
              trialStart: compData.trialStart || null,
              trialEnd: compData.trialEnd || null,
              status: "processed",
              processedAt: new Date().toISOString(),
              summary: `Invoice payment failed. Subscription marked past_due.`
            });

            const notifId = "notif_pay_failed_" + Date.now();
            await db.collection("notifications").doc(notifId).set({
              id: notifId,
              title: "Payment Failed",
              message: `Automatic payment for your subscription failed. Please update your payment details in the Billing Portal.`,
              type: "error",
              timestamp: new Date().toISOString(),
              read: false,
              forRole: "admin",
              forCompanyId: companyId
            });
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("Stripe Webhook handling error:", err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // Alias for Stripe Webhook
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    // Forward directly to /api/stripe/webhook handler logic
    req.url = "/api/stripe/webhook";
    return app._router.handle(req, res);
  });

  // Super Admin: Reconcile Subscription with Stripe
  app.post("/api/super-admin/companies/:companyId/billing/reconcile", async (req, res) => {
    const { companyId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "super_admin") {
        return res.status(403).json({ error: "Forbidden: Super Admin only" });
      }

      const companyDoc = await db.collection("companies").doc(companyId).get();
      if (!companyDoc.exists) {
        return res.status(404).json({ error: "Company not found" });
      }

      const companyData = companyDoc.data() || {};
      const integrity = await checkTenantSubscriptionIntegrity(companyId);

      let stripeSubscription: any = null;
      let activeSubStatus = companyData.subscriptionStatus || "active";
      let activePlan = companyData.plan || "Basic";

      if (process.env.STRIPE_SECRET_KEY && companyData.stripeCustomerId && companyData.stripeCustomerId.startsWith("cus_")) {
        const stripe = getStripe();
        const subs = await stripe.subscriptions.list({ customer: companyData.stripeCustomerId, limit: 5 });
        if (subs.data.length > 0) {
          stripeSubscription = subs.data[0];
          activeSubStatus = stripeSubscription.status;
          const priceId = stripeSubscription.items?.data[0]?.price?.id;
          const isPremium = priceId === process.env.STRIPE_PRICE_PREMIUM || stripeSubscription.metadata?.plan?.toLowerCase() === "premium";
          activePlan = isPremium ? "Premium" : "Basic";
        }
      }

      const accessCalc = calculateTenantBillingAccess({
        companyData,
        stripeSubscription,
        integrityResult: integrity
      });

      await companyDoc.ref.set({
        subscriptionStatus: activeSubStatus,
        plan: activePlan,
        billingIntegrityStatus: integrity.integrityStatus,
        duplicateSubscriptionDetected: integrity.nonTerminalSubscriptionCount > 1,
        billingUpdatedAt: new Date().toISOString()
      }, { merge: true });

      // Audit Log
      await db.collection("admins").doc(companyId).collection("billing_events").doc("rec_" + Date.now()).set({
        type: "superadmin.reconciliation",
        companyId,
        performedByUid: decoded.uid,
        accessState: accessCalc.accessState,
        integrityStatus: integrity.integrityStatus,
        processedAt: new Date().toISOString(),
        summary: `Super Admin triggered billing reconciliation for ${companyData.name || companyId}.`
      });

      res.json({
        success: true,
        companyId,
        integrity,
        accessCalc,
        reconciledAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Failed to reconcile company billing:", err);
      res.status(500).json({ error: err.message || "Reconciliation failed" });
    }
  });

  // Super Admin: Emergency Override Billing Access
  app.post("/api/super-admin/companies/:companyId/billing/override", async (req, res) => {
    const { companyId } = req.params;
    const { overrideDays = 7, reason } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "super_admin") {
        return res.status(403).json({ error: "Forbidden: Super Admin only" });
      }

      const companyDoc = await db.collection("companies").doc(companyId).get();
      if (!companyDoc.exists) {
        return res.status(404).json({ error: "Company not found" });
      }

      const expiresAt = new Date(Date.now() + overrideDays * 24 * 60 * 60 * 1000).toISOString();

      await companyDoc.ref.set({
        billingAccessOverride: true,
        overrideGrantedAt: new Date().toISOString(),
        overrideExpiresAt: expiresAt,
        overrideGrantedByUid: decoded.uid,
        overrideReason: reason || "Super Admin emergency access grant",
        billingUpdatedAt: new Date().toISOString()
      }, { merge: true });

      // Audit Log
      await db.collection("admins").doc(companyId).collection("billing_events").doc("override_" + Date.now()).set({
        type: "superadmin.override_granted",
        companyId,
        performedByUid: decoded.uid,
        overrideDays,
        expiresAt,
        reason: reason || "Emergency Override",
        processedAt: new Date().toISOString(),
        summary: `Super Admin granted ${overrideDays}-day emergency billing override.`
      });

      res.json({
        success: true,
        companyId,
        overrideGranted: true,
        expiresAt,
        message: `Granted ${overrideDays} days emergency access override.`
      });
    } catch (err: any) {
      console.error("Failed to apply emergency billing override:", err);
      res.status(500).json({ error: err.message || "Override failed" });
    }
  });

  // Tenant API: Sync Invoices
  app.post("/api/companies/:companyId/invoices/sync", async (req, res) => {
    const { companyId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      const userData = userDoc.data();

      if (!userData) {
        return res.status(404).json({ error: "User profile not found" });
      }

      if (userData.role !== "super_admin" && userData.companyId !== companyId) {
        return res.status(403).json({ error: "Forbidden: Cross-tenant invoice access denied" });
      }

      const syncedInvoices = await syncStripeInvoicesForTenant(companyId);
      res.json({ success: true, companyId, syncedCount: syncedInvoices.length, invoices: syncedInvoices });
    } catch (err: any) {
      console.error("Failed to sync tenant invoices:", err);
      res.status(500).json({ error: err.message || "Failed to sync invoices" });
    }
  });

  // Tenant API: Get Invoices
  app.get("/api/companies/:companyId/invoices", async (req, res) => {
    const { companyId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      const userData = userDoc.data();

      if (!userData) {
        return res.status(404).json({ error: "User profile not found" });
      }

      if (userData.role !== "super_admin" && userData.companyId !== companyId) {
        return res.status(403).json({ error: "Forbidden: Cross-tenant invoice access denied" });
      }

      // Auto sync invoices from Stripe before serving
      await syncStripeInvoicesForTenant(companyId).catch(err => console.warn("Auto invoice sync warning:", err.message));

      const invSnap = await db.collection("admins").doc(companyId).collection("invoices").orderBy("date", "desc").limit(50).get();
      const invoices = invSnap.docs.map(doc => doc.data());

      res.json({ companyId, invoices });
    } catch (err: any) {
      console.error("Failed to fetch tenant invoices:", err);
      res.status(500).json({ error: err.message || "Failed to fetch invoices" });
    }
  });

  // ==========================================
  // SUPPORT TICKETS & TENANT DESK API
  // ==========================================
  app.post("/api/support/tickets", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const authHeader = req.headers.authorization;
      let callerUid = "anonymous";
      let callerRole = "admin";
      let callerEmail = "";

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.split("Bearer ")[1];
        try {
          const decoded = await getAuth().verifyIdToken(idToken);
          callerUid = decoded.uid;
          callerEmail = (decoded.email || "").toLowerCase();
          const userDoc = await db.collection("users").doc(callerUid).get();
          if (userDoc.exists) {
            callerRole = userDoc.data()?.role || "admin";
          } else if (callerEmail === "admin@dispatchpro.com" || callerEmail === "nexusweft@gmail.com") {
            callerRole = "super_admin";
          }
        } catch (e) {
          console.warn("Token verify failed for support ticket create:", e);
        }
      }

      const { companyId, companyName, createdByUid, createdByName, createdByEmail, subject, category, priority, description } = req.body;

      if (!subject || !category || !priority || !description) {
        return res.status(400).json({ error: "Missing required ticket fields" });
      }

      const effectiveCompanyId = companyId || "global";
      const now = new Date().toISOString();
      const ticketId = "ticket_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);

      const newTicket = {
        id: ticketId,
        companyId: effectiveCompanyId,
        companyName: companyName || "Unknown Company",
        createdByUid: createdByUid || callerUid,
        createdByName: createdByName || "Tenant Admin",
        createdByEmail: createdByEmail || callerEmail || "admin@company.com",
        subject,
        category,
        priority: priority || "normal",
        status: "open",
        lastMessageAt: now,
        lastMessagePreview: description.slice(0, 150),
        createdAt: now,
        updatedAt: now
      };

      await db.collection("support_tickets").doc(ticketId).set(newTicket);

      // Create initial user message
      const msgId1 = "msg_" + Date.now() + "_1";
      const userMsg = {
        id: msgId1,
        ticketId,
        companyId: effectiveCompanyId,
        senderId: createdByUid || callerUid,
        senderName: createdByName || "Tenant Admin",
        senderRole: "admin",
        message: description,
        type: "user",
        createdAt: now
      };
      await db.collection("support_tickets").doc(ticketId).collection("messages").doc(msgId1).set(userMsg);

      // Create AI auto-reply
      const aiReplyText = `Thank you for contacting Nexusweft Support. We received your support request and a platform support admin has been notified. Someone will review your ticket shortly. Please keep this ticket open and add any screenshots, error messages, or additional details that may help us resolve the issue.`;
      const msgId2 = "msg_" + (Date.now() + 1) + "_2";
      const aiMsg = {
        id: msgId2,
        ticketId,
        companyId: effectiveCompanyId,
        senderId: "system_ai",
        senderName: "Nexusweft AI Assistant",
        senderRole: "super_admin",
        message: aiReplyText,
        type: "ai_auto_reply",
        createdAt: new Date(Date.now() + 500).toISOString()
      };
      await db.collection("support_tickets").doc(ticketId).collection("messages").doc(msgId2).set(aiMsg);

      // Create Super Admin notification
      const notifId = "notif_ticket_" + Date.now();
      await db.collection("notifications").doc(notifId).set({
        id: notifId,
        title: "New Support Ticket",
        message: `${companyName || "Carrier"} opened a support ticket: ${subject}`,
        type: "warning",
        timestamp: now,
        read: false,
        forRole: "super_admin",
        forCompanyId: null,
        ticketId
      });

      res.status(201).json({ success: true, ticket: newTicket });
    } catch (err: any) {
      console.error("Failed to create support ticket:", err);
      res.status(500).json({ error: err.message || "Failed to create support ticket" });
    }
  });

  app.get("/api/support/tickets", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const authHeader = req.headers.authorization;
      let callerRole = "admin";
      let callerCompanyId = (req.query.companyId as string) || "";

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.split("Bearer ")[1];
        try {
          const decoded = await getAuth().verifyIdToken(idToken);
          const callerEmail = (decoded.email || "").toLowerCase();
          const userDoc = await db.collection("users").doc(decoded.uid).get();
          if (userDoc.exists) {
            callerRole = userDoc.data()?.role || "admin";
            if (!callerCompanyId) callerCompanyId = userDoc.data()?.companyId || "";
          } else if (callerEmail === "admin@dispatchpro.com" || callerEmail === "nexusweft@gmail.com") {
            callerRole = "super_admin";
          }
        } catch (e) {
          console.warn("Token verify warning in GET /api/support/tickets:", e);
        }
      }

      let query: any = db.collection("support_tickets");
      if (callerRole !== "super_admin") {
        if (!callerCompanyId) {
          return res.status(400).json({ error: "Missing companyId for non-super admin" });
        }
        query = query.where("companyId", "==", callerCompanyId);
      }

      const snapshot = await query.get();
      const tickets: any[] = [];
      snapshot.forEach((doc: any) => {
        tickets.push(doc.data());
      });

      // Sort by updatedAt descending
      tickets.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

      res.json({ tickets });
    } catch (err: any) {
      console.error("Failed to fetch support tickets:", err);
      res.status(500).json({ error: err.message || "Failed to fetch tickets" });
    }
  });

  app.get("/api/support/tickets/:ticketId/messages", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const { ticketId } = req.params;
      const snapshot = await db.collection("support_tickets").doc(ticketId).collection("messages").get();
      const messages: any[] = [];
      snapshot.forEach((doc: any) => {
        messages.push(doc.data());
      });

      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      res.json({ messages });
    } catch (err: any) {
      console.error("Failed to fetch ticket messages:", err);
      res.status(500).json({ error: err.message || "Failed to fetch messages" });
    }
  });

  app.post("/api/support/tickets/:ticketId/messages", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const { ticketId } = req.params;
      const { message, senderId, senderName, senderRole, companyId } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message text is required" });
      }

      const ticketDoc = await db.collection("support_tickets").doc(ticketId).get();
      if (!ticketDoc.exists) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticketData = ticketDoc.data() || {};
      if (ticketData.status === "closed") {
        return res.status(400).json({ error: "Ticket is closed. Contact Super Admin to reopen." });
      }

      const now = new Date().toISOString();
      const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
      const isSuper = senderRole === "super_admin";

      const newMsg = {
        id: msgId,
        ticketId,
        companyId: companyId || ticketData.companyId,
        senderId: senderId || "user",
        senderName: senderName || (isSuper ? "Nexusweft Support Admin" : "Tenant Admin"),
        senderRole: isSuper ? "super_admin" : "admin",
        message: message.trim(),
        type: isSuper ? "super_admin" : "user",
        createdAt: now
      };

      await db.collection("support_tickets").doc(ticketId).collection("messages").doc(msgId).set(newMsg);

      // Update ticket status & last message
      const updatedStatus = isSuper ? "in_progress" : (ticketData.status === "awaiting_customer" ? "in_progress" : ticketData.status);
      await db.collection("support_tickets").doc(ticketId).update({
        lastMessageAt: now,
        lastMessagePreview: message.trim().slice(0, 150),
        status: updatedStatus,
        updatedAt: now
      });

      // Notification
      const notifId = "notif_msg_" + Date.now();
      if (isSuper) {
        await db.collection("notifications").doc(notifId).set({
          id: notifId,
          title: "Support Replied",
          message: `Nexusweft Support replied to your ticket: ${ticketData.subject || "Support Ticket"}`,
          type: "info",
          timestamp: now,
          read: false,
          forRole: "admin",
          forCompanyId: ticketData.companyId,
          ticketId
        });
      } else {
        await db.collection("notifications").doc(notifId).set({
          id: notifId,
          title: "New Ticket Message",
          message: `${ticketData.companyName || "Carrier"} sent a message on ticket: ${ticketData.subject}`,
          type: "info",
          timestamp: now,
          read: false,
          forRole: "super_admin",
          forCompanyId: null,
          ticketId
        });
      }

      res.status(201).json({ success: true, message: newMsg });
    } catch (err: any) {
      console.error("Failed to post message:", err);
      res.status(500).json({ error: err.message || "Failed to send message" });
    }
  });

  app.post("/api/support/tickets/:ticketId/close", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const { ticketId } = req.params;
      const { closedBy } = req.body;

      const ticketRef = db.collection("support_tickets").doc(ticketId);
      const ticketDoc = await ticketRef.get();
      if (!ticketDoc.exists) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const now = new Date().toISOString();
      await ticketRef.update({
        status: "closed",
        closedAt: now,
        closedBy: closedBy || "Super Admin",
        updatedAt: now
      });

      // Insert system message
      const msgId = "msg_sys_" + Date.now();
      await ticketRef.collection("messages").doc(msgId).set({
        id: msgId,
        ticketId,
        companyId: ticketDoc.data()?.companyId || "",
        senderId: "system",
        senderName: "System",
        senderRole: "super_admin",
        message: "Ticket closed by Super Admin.",
        type: "system",
        createdAt: now
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to close ticket:", err);
      res.status(500).json({ error: err.message || "Failed to close ticket" });
    }
  });

  app.post("/api/support/tickets/:ticketId/reopen", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const { ticketId } = req.params;

      const ticketRef = db.collection("support_tickets").doc(ticketId);
      const ticketDoc = await ticketRef.get();
      if (!ticketDoc.exists) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const now = new Date().toISOString();
      await ticketRef.update({
        status: "open",
        closedAt: null,
        closedBy: null,
        updatedAt: now
      });

      // Insert system message
      const msgId = "msg_sys_" + Date.now();
      await ticketRef.collection("messages").doc(msgId).set({
        id: msgId,
        ticketId,
        companyId: ticketDoc.data()?.companyId || "",
        senderId: "system",
        senderName: "System",
        senderRole: "super_admin",
        message: "Ticket reopened by Super Admin.",
        type: "system",
        createdAt: now
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to reopen ticket:", err);
      res.status(500).json({ error: err.message || "Failed to reopen ticket" });
    }
  });

  app.patch("/api/support/tickets/:ticketId/status", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const { ticketId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const ticketRef = db.collection("support_tickets").doc(ticketId);
      const now = new Date().toISOString();
      await ticketRef.update({
        status,
        updatedAt: now
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to update ticket status:", err);
      res.status(500).json({ error: err.message || "Failed to update status" });
    }
  });

  // ==========================================
  // DRIVER CRITICAL ALERT / BREAKDOWN MODE APIS
  // ==========================================

  // 1. Create Critical Driver Alert
  app.post("/api/driver-alerts/create", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data() || {};
      const callerRole = userData.role || "driver";
      const callerCompanyId = userData.companyId || "";
      const callerName = userData.name || "User";

      const { companyId, driverId, loadId, alertType, description, location, confirmDuplicate } = req.body;

      if (!companyId || !driverId || !alertType) {
        return res.status(400).json({ error: "Missing required fields: companyId, driverId, alertType" });
      }

      // Tenant Authorization Check
      if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
        return res.status(403).json({ error: "Forbidden: Access denied to other tenant data" });
      }

      if (callerRole === "driver" && callerUid !== driverId) {
        return res.status(403).json({ error: "Forbidden: Drivers can only report alerts for themselves" });
      }

      // Fetch driver details
      let driverName = userData.name || "Driver";
      let driverPhone = userData.phone || "";
      let truckNumber = userData.truckNumber || "";

      try {
        const driverDoc = await db.collection("admins").doc(companyId).collection("drivers").doc(driverId).get();
        if (driverDoc.exists) {
          const dData = driverDoc.data() || {};
          if (dData.name) driverName = dData.name;
          if (dData.phone) driverPhone = dData.phone;
          if (dData.truckNumber) truckNumber = dData.truckNumber;
        }
      } catch (e) {
        console.warn("Could not fetch driver doc from admins subcollection:", e);
      }

      // Check for duplicate active alerts within the last 5 minutes
      if (!confirmDuplicate) {
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const activeAlertsSnap = await db.collection("admins")
          .doc(companyId)
          .collection("driver_alerts")
          .where("driverId", "==", driverId)
          .where("createdAt", ">=", fiveMinsAgo)
          .get();

        const openAlerts = activeAlertsSnap.docs.filter(d => ['open', 'acknowledged', 'in_progress'].includes(d.data().status));
        if (openAlerts.length > 0) {
          return res.status(409).json({
            error: "An active critical alert was reported recently. Do you want to submit another alert anyway?",
            isDuplicateWarning: true,
            existingAlertId: openAlerts[0].id
          });
        }
      }

      // Verify load if provided
      let loadNumber = "";
      if (loadId) {
        const loadDoc = await db.collection("admins").doc(companyId).collection("loads").doc(loadId).get();
        if (loadDoc.exists) {
          loadNumber = loadDoc.data()?.loadNumber || loadId;
        }
      }

      const alertId = "alert_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const now = new Date().toISOString();

      const alertDoc = {
        id: alertId,
        companyId,
        loadId: loadId || null,
        driverId,
        driverName,
        driverPhone,
        truckNumber,
        alertType,
        description: description || "",
        status: "open",
        priority: "critical",
        severity: "red",
        location: location || null,
        createdByUid: callerUid,
        createdByRole: callerRole,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        lastMessagePreview: `[CRITICAL ALERT] ${alertType}: ${(description || "").substring(0, 80)}`
      };

      // 1. Save Alert Document
      await db.collection("admins").doc(companyId).collection("driver_alerts").doc(alertId).set(alertDoc);

      // 2. Create Initial Message
      const firstMsgId = "msg_1_" + Date.now();
      await db.collection("admins").doc(companyId).collection("driver_alerts").doc(alertId).collection("messages").doc(firstMsgId).set({
        id: firstMsgId,
        companyId,
        alertId,
        loadId: loadId || null,
        senderId: callerUid,
        senderName: callerRole === "driver" ? driverName : callerName,
        senderRole: callerRole,
        message: `CRITICAL ALERT REPORTED (${alertType}): ${description || "No additional description provided."}`,
        type: callerRole === "driver" ? "driver_update" : "system",
        createdAt: now
      });

      // 3. Update Load if linked
      if (loadId) {
        await db.collection("admins").doc(companyId).collection("loads").doc(loadId).update({
          criticalAlertActive: true,
          criticalAlertId: alertId,
          criticalAlertType: alertType,
          criticalAlertStatus: "open",
          criticalAlertCreatedAt: now,
          criticalAlertDriverId: driverId,
          criticalAlertDriverName: driverName
        });

        // Add system message to load communications
        const loadMsgId = "msg_alert_" + Date.now();
        await db.collection("admins").doc(companyId).collection("loads").doc(loadId).collection("communications").doc(loadMsgId).set({
          id: loadMsgId,
          channel: "load",
          companyId,
          senderId: "system",
          senderName: "System Alert",
          senderRole: "system",
          text: `CRITICAL ALERT: Driver reported ${alertType}. Dispatch team notified immediately.`,
          timestamp: now,
          type: "critical_alert",
          alertId
        });
      }

      // 4. Create In-App Notification for Company Staff
      const notifId = "notif_alert_" + Date.now();
      await db.collection("notifications").doc(notifId).set({
        id: notifId,
        title: "CRITICAL DRIVER BREAKDOWN ALERT",
        message: `Driver ${driverName} reported ${alertType}${loadNumber ? ' on Load #' + loadNumber : ''}. Immediate dispatch review required.`,
        type: "danger",
        priority: "critical",
        alertId,
        loadId: loadId || null,
        driverId,
        forRole: "admin_dispatcher",
        forCompanyId: companyId,
        read: false,
        timestamp: now
      });

      // 5. Queue Email Alert
      try {
        const companyDoc = await db.collection("companies").doc(companyId).get();
        const cData = companyDoc.data() || {};
        const contactEmail = cData.contactEmail;
        if (contactEmail) {
          await db.collection("mail").add({
            to: contactEmail,
            message: {
              subject: `CRITICAL DRIVER ALERT - ${alertType}${loadNumber ? ' (Load #' + loadNumber + ')' : ''}`,
              html: `
                <div style="font-family: sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 8px;">
                  <h2 style="color: #dc2626; margin-top: 0;">CRITICAL DRIVER ALERT REPORTED</h2>
                  <p><strong>Driver:</strong> ${driverName} (${driverPhone || 'No phone'})</p>
                  <p><strong>Truck #:</strong> ${truckNumber || 'N/A'}</p>
                  <p><strong>Alert Type:</strong> ${alertType}</p>
                  ${loadNumber ? `<p><strong>Load #:</strong> ${loadNumber}</p>` : ''}
                  <p><strong>Description:</strong> ${description || 'N/A'}</p>
                  ${location && location.lat ? `<p><strong>Location:</strong> <a href="https://maps.google.com/?q=${location.lat},${location.lng}" target="_blank">View Map (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})</a></p>` : ''}
                  <p><strong>Reported At:</strong> ${new Date(now).toLocaleString()}</p>
                  <p style="margin-top: 20px; font-weight: bold; color: #dc2626;">Please log into TruckDispatch Pro immediately to review and acknowledge this alert.</p>
                </div>
              `
            },
            createdAt: now
          });
        }
      } catch (err) {
        console.warn("Failed to queue email alert:", err);
      }

      return res.json({ success: true, alertId, alert: alertDoc });
    } catch (err: any) {
      console.error("Failed to create driver alert:", err);
      return res.status(500).json({ error: err.message || "Failed to create driver alert" });
    }
  });

  // 2. Fetch Driver Alerts for Company
  app.get("/api/driver-alerts/company/:companyId", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const { companyId } = req.params;
      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data() || {};
      const callerRole = userData.role || "driver";
      const callerCompanyId = userData.companyId || "";

      if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
        return res.status(403).json({ error: "Forbidden: Access denied to other company alerts" });
      }

      let query = db.collection("admins").doc(companyId).collection("driver_alerts");
      let snapshot;

      if (callerRole === "driver") {
        snapshot = await query.where("driverId", "==", callerUid).get();
      } else {
        snapshot = await query.get();
      }

      const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      alerts.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      res.json({ success: true, alerts });
    } catch (err: any) {
      console.error("Failed to fetch driver alerts:", err);
      res.status(500).json({ error: err.message || "Failed to fetch driver alerts" });
    }
  });

  // 3. Post Message to Alert Thread
  app.post("/api/driver-alerts/:alertId/message", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const { alertId } = req.params;
      const { companyId, message } = req.body;

      if (!companyId || !message) {
        return res.status(400).json({ error: "Missing required fields: companyId, message" });
      }

      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data() || {};
      const callerRole = userData.role || "driver";
      const callerCompanyId = userData.companyId || "";
      const callerName = userData.name || "User";

      if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const alertRef = db.collection("admins").doc(companyId).collection("driver_alerts").doc(alertId);
      const alertDoc = await alertRef.get();

      if (!alertDoc.exists) {
        return res.status(404).json({ error: "Alert not found" });
      }

      const msgType = callerRole === "driver" ? "driver_update" : (callerRole === "admin" ? "admin_update" : "dispatcher_update");
      const now = new Date().toISOString();
      const msgId = "msg_" + Date.now();

      await alertRef.collection("messages").doc(msgId).set({
        id: msgId,
        companyId,
        alertId,
        loadId: alertDoc.data()?.loadId || null,
        senderId: callerUid,
        senderName: callerName,
        senderRole: callerRole,
        message,
        type: msgType,
        createdAt: now
      });

      await alertRef.update({
        updatedAt: now,
        lastMessageAt: now,
        lastMessagePreview: `${callerName}: ${message.substring(0, 80)}`
      });

      res.json({ success: true, messageId: msgId });
    } catch (err: any) {
      console.error("Failed to post alert message:", err);
      res.status(500).json({ error: err.message || "Failed to post message" });
    }
  });

  // 4. Acknowledge Driver Alert (Dispatcher / Admin)
  app.post("/api/driver-alerts/:alertId/acknowledge", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const { alertId } = req.params;
      const { companyId } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: "Missing required field: companyId" });
      }

      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data() || {};
      const callerRole = userData.role || "driver";
      const callerCompanyId = userData.companyId || "";
      const callerName = userData.name || "Dispatcher";

      if (callerRole !== "super_admin" && callerRole !== "admin" && callerRole !== "dispatcher") {
        return res.status(403).json({ error: "Forbidden: Only dispatchers or admins can acknowledge alerts" });
      }

      if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const alertRef = db.collection("admins").doc(companyId).collection("driver_alerts").doc(alertId);
      const alertDoc = await alertRef.get();
      if (!alertDoc.exists) {
        return res.status(404).json({ error: "Alert not found" });
      }

      const aData = alertDoc.data() || {};
      const now = new Date().toISOString();

      await alertRef.update({
        status: "acknowledged",
        acknowledgedBy: callerUid,
        acknowledgedByName: callerName,
        acknowledgedAt: now,
        updatedAt: now,
        lastMessageAt: now,
        lastMessagePreview: `[SYSTEM] Alert acknowledged by ${callerName}`
      });

      // System message in alert thread
      const msgId = "msg_ack_" + Date.now();
      await alertRef.collection("messages").doc(msgId).set({
        id: msgId,
        companyId,
        alertId,
        loadId: aData.loadId || null,
        senderId: callerUid,
        senderName: callerName,
        senderRole: callerRole,
        message: `Alert acknowledged by ${callerName}. Dispatch team is reviewing the situation.`,
        type: "system",
        createdAt: now
      });

      // Update linked load if active
      if (aData.loadId) {
        await db.collection("admins").doc(companyId).collection("loads").doc(aData.loadId).update({
          criticalAlertStatus: "acknowledged"
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to acknowledge alert:", err);
      res.status(500).json({ error: err.message || "Failed to acknowledge alert" });
    }
  });

  // 5. Resolve Driver Alert (Dispatcher / Admin)
  app.post("/api/driver-alerts/:alertId/resolve", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const { alertId } = req.params;
      const { companyId, resolutionNote } = req.body;

      if (!companyId || !resolutionNote) {
        return res.status(400).json({ error: "Missing required fields: companyId, resolutionNote" });
      }

      const db = getFirestoreDb();
      const userDoc = await db.collection("users").doc(callerUid).get();
      const userData = userDoc.data() || {};
      const callerRole = userData.role || "driver";
      const callerCompanyId = userData.companyId || "";
      const callerName = userData.name || "Dispatcher";

      if (callerRole !== "super_admin" && callerRole !== "admin" && callerRole !== "dispatcher") {
        return res.status(403).json({ error: "Forbidden: Only dispatchers or admins can resolve alerts" });
      }

      if (callerRole !== "super_admin" && callerCompanyId !== companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const alertRef = db.collection("admins").doc(companyId).collection("driver_alerts").doc(alertId);
      const alertDoc = await alertRef.get();
      if (!alertDoc.exists) {
        return res.status(404).json({ error: "Alert not found" });
      }

      const aData = alertDoc.data() || {};
      const now = new Date().toISOString();

      await alertRef.update({
        status: "resolved",
        resolvedBy: callerUid,
        resolvedByName: callerName,
        resolvedAt: now,
        resolutionNote,
        updatedAt: now,
        lastMessageAt: now,
        lastMessagePreview: `[RESOLVED] ${resolutionNote.substring(0, 80)}`
      });

      // System message in alert thread
      const msgId = "msg_res_" + Date.now();
      await alertRef.collection("messages").doc(msgId).set({
        id: msgId,
        companyId,
        alertId,
        loadId: aData.loadId || null,
        senderId: callerUid,
        senderName: callerName,
        senderRole: callerRole,
        message: `Alert marked RESOLVED by ${callerName}. Resolution Note: ${resolutionNote}`,
        type: "system",
        createdAt: now
      });

      // Update linked load if active
      if (aData.loadId) {
        await db.collection("admins").doc(companyId).collection("loads").doc(aData.loadId).update({
          criticalAlertActive: false,
          criticalAlertStatus: "resolved",
          criticalAlertResolvedAt: now
        });

        // Add system message to load communications
        const loadMsgId = "msg_res_" + Date.now();
        await db.collection("admins").doc(companyId).collection("loads").doc(aData.loadId).collection("communications").doc(loadMsgId).set({
          id: loadMsgId,
          channel: "load",
          companyId,
          senderId: "system",
          senderName: "System Alert",
          senderRole: "system",
          text: `CRITICAL ALERT RESOLVED: ${resolutionNote}`,
          timestamp: now,
          type: "critical_alert_resolved",
          alertId
        });
      }

      // In-app notification to driver
      if (aData.driverId) {
        const notifId = "notif_res_" + Date.now();
        await db.collection("notifications").doc(notifId).set({
          id: notifId,
          title: "Critical Alert Resolved",
          message: `Your breakdown alert reported on ${new Date(aData.createdAt).toLocaleDateString()} has been resolved by dispatch. Note: ${resolutionNote}`,
          type: "success",
          priority: "normal",
          alertId,
          driverId: aData.driverId,
          forRole: "driver",
          forCompanyId: companyId,
          read: false,
          timestamp: now
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to resolve alert:", err);
      res.status(500).json({ error: err.message || "Failed to resolve alert" });
    }
  });

  // ==========================================================
  // SYSTEM STATUS & HEALTH CENTER API ENDPOINTS
  // ==========================================================

  // GET /api/system/status
  app.get("/api/system/status", async (req, res) => {
    try {
      const db = getFirestoreDb();
      const statusDoc = await db.collection("system_status").doc("current").get();
      if (!statusDoc.exists) {
        return res.json({
          overallStatus: "operational",
          backendApi: "operational",
          firebaseAuth: "operational",
          firestore: "operational",
          stripeBilling: "operational",
          aiParser: "operational",
          aiScraping: "operational",
          gpsTracking: "operational",
          smsNotifications: "operational",
          emailNotifications: "operational",
          dispatchModule: "operational",
          driverPortal: "operational",
          adminPortal: "operational",
          lastCheckedAt: new Date().toISOString(),
          statusMessage: "All systems operational"
        });
      }
      res.json(statusDoc.data());
    } catch (err: any) {
      console.error("Failed to get system status:", err);
      res.status(500).json({ error: "Failed to fetch system status" });
    }
  });

  // POST /api/system/status (Super Admin Only)
  app.post("/api/system/status", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || callerData.role === "super_admin";

      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: Super Admin privileges required" });
      }

      const now = new Date().toISOString();
      const payload = {
        ...req.body,
        lastCheckedAt: now,
        updatedAt: now,
        updatedByUid: callerUid,
        updatedByName: callerData.name || callerEmail || "Super Admin"
      };

      await db.collection("system_status").doc("current").set(payload, { merge: true });
      res.json({ success: true, status: payload });
    } catch (err: any) {
      console.error("Failed to update system status:", err);
      res.status(500).json({ error: err.message || "Failed to update system status" });
    }
  });

  // GET /api/system/announcements/active
  app.get("/api/system/announcements/active", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const callerRole = callerData.role || "driver";

      // Drivers do NOT see master announcement banner
      if (callerRole === "driver") {
        return res.json({ announcements: [] });
      }

      const snap = await db.collection("system_announcements").where("isActive", "==", true).get();
      const now = new Date().toISOString();

      const announcements = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => {
          // Check expiration
          if (item.expiresAt && item.expiresAt < now) return false;

          // Check audience
          if (item.audience === "admins_only" && callerRole !== "admin" && callerRole !== "super_admin") return false;
          if (item.audience === "dispatchers_and_admins" && callerRole !== "admin" && callerRole !== "dispatcher" && callerRole !== "super_admin") return false;

          return true;
        })
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      res.json({ announcements });
    } catch (err: any) {
      console.error("Failed to get active announcements:", err);
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  });

  // POST /api/system/announcements (Super Admin Only)
  app.post("/api/system/announcements", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || callerData.role === "super_admin";

      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: Super Admin privileges required" });
      }

      const { title, message, type, severity, isActive, audience, expiresAt } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: "Missing required fields: title, message" });
      }

      const now = new Date().toISOString();
      const announcementId = "anc_" + Date.now();

      const newAnnouncement = {
        id: announcementId,
        title,
        message,
        type: type || "general",
        severity: severity || "info",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        audience: audience || "all_except_drivers",
        createdByUid: callerUid,
        createdByName: callerData.name || callerEmail || "Super Admin",
        createdAt: now,
        updatedAt: now,
        expiresAt: expiresAt || null,
        dismissedBy: []
      };

      await db.collection("system_announcements").doc(announcementId).set(newAnnouncement);

      // If critical announcement, notify tenant admins and dispatchers
      if (newAnnouncement.severity === "critical" && newAnnouncement.isActive) {
        const usersSnap = await db.collection("users").where("role", "in", ["admin", "dispatcher"]).get();
        const batch = db.batch();

        usersSnap.docs.forEach(uDoc => {
          const uData = uDoc.data();
          const notifId = "notif_anc_" + Date.now() + "_" + uDoc.id.substring(0, 6);
          const notifRef = db.collection("notifications").doc(notifId);
          batch.set(notifRef, {
            id: notifId,
            title: `CRITICAL SYSTEM ANNOUNCEMENT: ${title}`,
            message,
            type: "warning",
            priority: "high",
            forRole: uData.role,
            forCompanyId: uData.companyId || null,
            recipientUid: uDoc.id,
            announcementId,
            read: false,
            timestamp: now
          });
        });

        await batch.commit();
      }

      res.json({ success: true, announcement: newAnnouncement });
    } catch (err: any) {
      console.error("Failed to create announcement:", err);
      res.status(500).json({ error: err.message || "Failed to create announcement" });
    }
  });

  // PATCH /api/system/announcements/:announcementId (Super Admin Only)
  app.patch("/api/system/announcements/:announcementId", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      const db = getFirestoreDb();
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data() || {};
      const isSuperAdmin = callerEmail === "nexusweft@gmail.com" || callerData.role === "super_admin";

      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: Super Admin privileges required" });
      }

      const { announcementId } = req.params;
      const now = new Date().toISOString();

      const updateData = {
        ...req.body,
        updatedAt: now
      };

      await db.collection("system_announcements").doc(announcementId).update(updateData);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to update announcement:", err);
      res.status(500).json({ error: err.message || "Failed to update announcement" });
    }
  });

  // POST /api/system/announcements/:announcementId/dismiss
  app.post("/api/system/announcements/:announcementId/dismiss", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
      }

      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;

      const db = getFirestoreDb();
      const { announcementId } = req.params;
      const ancDoc = await db.collection("system_announcements").doc(announcementId).get();

      if (!ancDoc.exists) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      const data = ancDoc.data() || {};
      const currentDismissed = Array.isArray(data.dismissedBy) ? data.dismissedBy : [];

      if (!currentDismissed.includes(callerUid)) {
        currentDismissed.push(callerUid);
        await db.collection("system_announcements").doc(announcementId).update({
          dismissedBy: currentDismissed
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to dismiss announcement:", err);
      res.status(500).json({ error: err.message || "Failed to dismiss announcement" });
    }
  });

  // Vite middleware for development

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
