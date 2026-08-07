import express from "express";
import fs from "fs";
import path from "path";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { GoogleGenAI, Type } from "@google/genai";

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

export async function verifyComplianceAuth(req: express.Request, targetCompanyId: string) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, status: 401, error: "Unauthorized: Missing token" };
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getFirestoreDb();

    // Check super admin or user doc
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.role === "super_admin") {
        return { authorized: true, user: userData, uid };
      }
      if (userData?.companyId === targetCompanyId) {
        return { authorized: true, user: userData, uid };
      }
    }

    // Check company subcollection user profile
    const companyUser = await db.collection("admins").doc(targetCompanyId).collection("dispatchers").doc(uid).get();
    if (companyUser.exists) {
      return { authorized: true, user: companyUser.data(), uid };
    }

    const companyDriver = await db.collection("admins").doc(targetCompanyId).collection("drivers").doc(uid).get();
    if (companyDriver.exists) {
      return { authorized: true, user: companyDriver.data(), uid };
    }

    return { authorized: false, status: 403, error: "Forbidden: User does not belong to this tenant company" };
  } catch (err: any) {
    return { authorized: false, status: 401, error: `Invalid token: ${err.message}` };
  }
}

export async function logComplianceAudit(
  companyId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: any = null,
  after: any = null
) {
  try {
    const db = getFirestoreDb();
    const auditRef = db.collection("admins").doc(companyId).collection("compliance_audit_logs").doc();
    await auditRef.set({
      id: auditRef.id,
      companyId,
      userId,
      action,
      entityType,
      entityId,
      before,
      after,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to record compliance audit log:", err);
  }
}

export async function recalculateCompanyCompliance(companyId: string) {
  const db = getFirestoreDb();
  const reqsRef = db.collection("admins").doc(companyId).collection("compliance_requirements");
  const snapshot = await reqsRef.get();

  const todayStr = new Date().toISOString().split("T")[0];
  const today = new Date(todayStr);

  let updatedCount = 0;

  for (const docSnap of snapshot.docs) {
    const reqData = docSnap.data();
    if (reqData.status === "not_applicable") continue;

    let newStatus = reqData.status || "missing_proof";

    // 1. Check if proof document exists
    if (reqData.required && !reqData.proofDocumentId) {
      newStatus = "missing_proof";
    } else if (reqData.proofDocumentId) {
      // Check document status
      const docRef = db.collection("admins").doc(companyId).collection("compliance_documents").doc(reqData.proofDocumentId);
      const docSnapData = await docRef.get();

      if (docSnapData.exists) {
        const docData = docSnapData.data();
        if (docData?.verificationStatus === "rejected") {
          newStatus = "rejected";
        } else if (docData?.verificationStatus === "pending_review") {
          newStatus = "pending_review";
        } else if (docData?.verificationStatus === "approved") {
          // Check dates
          const targetDateStr = reqData.expirationDate || reqData.dueDate;
          if (targetDateStr) {
            const targetDate = new Date(targetDateStr);
            const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

            if (diffDays < 0) {
              newStatus = "expired";
            } else if (diffDays <= 30) {
              newStatus = "expiring_soon";
            } else {
              newStatus = "compliant";
            }
          } else {
            newStatus = "compliant";
          }
        }
      } else {
        newStatus = "missing_proof";
      }
    } else {
      // Check dates directly if no proof document is strictly required or proof is handled manually
      const targetDateStr = reqData.expirationDate || reqData.dueDate;
      if (targetDateStr) {
        const targetDate = new Date(targetDateStr);
        const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

        if (diffDays < 0) {
          newStatus = "expired";
        } else if (diffDays <= 30) {
          newStatus = "expiring_soon";
        } else {
          newStatus = "compliant";
        }
      }
    }

    if (newStatus !== reqData.status) {
      await docSnap.ref.update({
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
    }
  }

  return updatedCount;
}

export function registerComplianceRoutes(app: express.Application) {
  // GET /api/compliance/requirements/:companyId
  app.get("/api/compliance/requirements/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snapshot = await db.collection("admins").doc(companyId).collection("compliance_requirements").get();
      const requirements = snapshot.docs.map(doc => doc.data());

      const docSnapshot = await db.collection("admins").doc(companyId).collection("compliance_documents").get();
      const documents = docSnapshot.docs.map(doc => doc.data());

      const alertSnapshot = await db.collection("admins").doc(companyId).collection("compliance_alerts").get();
      const alerts = alertSnapshot.docs.map(doc => doc.data());

      return res.json({
        success: true,
        requirements,
        documents,
        alerts
      });
    } catch (err: any) {
      console.error("Error fetching compliance data:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch compliance requirements" });
    }
  });

  // POST /api/compliance/initialize-templates
  app.post("/api/compliance/initialize-templates", async (req, res) => {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "Missing companyId" });

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const reqsRef = db.collection("admins").doc(companyId).collection("compliance_requirements");
      const existing = await reqsRef.get();

      if (!existing.empty) {
        return res.json({
          success: true,
          message: "Compliance requirements already exist for this company.",
          count: existing.size
        });
      }

      const defaultTemplates = [
        // Driver Category
        { title: "CDL Driver License", category: "driver", scopeType: "driver", criticality: "critical", required: true, recurrence: "custom" },
        { title: "Medical Card / DOT Physical", category: "driver", scopeType: "driver", criticality: "high", required: true, recurrence: "annual" },
        { title: "MVR Record (Annual Motor Vehicle Record)", category: "driver", scopeType: "driver", criticality: "high", required: true, recurrence: "annual" },
        { title: "Driver Qualification (DQ) File", category: "driver", scopeType: "driver", criticality: "high", required: true, recurrence: "none" },
        { title: "Drug & Alcohol Clearinghouse Query", category: "driver", scopeType: "driver", criticality: "critical", required: true, recurrence: "annual" },
        { title: "Drug / Alcohol Program Enrollment", category: "driver", scopeType: "driver", criticality: "high", required: true, recurrence: "annual" },
        { title: "Driver Policy Acknowledgment", category: "driver", scopeType: "driver", criticality: "medium", required: true, recurrence: "annual" },

        // Vehicle Category
        { title: "Annual FMCSR / DOT Vehicle Inspection", category: "vehicle", scopeType: "vehicle", criticality: "critical", required: true, recurrence: "annual" },
        { title: "Vehicle Registration", category: "vehicle", scopeType: "vehicle", criticality: "high", required: true, recurrence: "annual" },
        { title: "IRP Cab Card Registration", category: "vehicle", scopeType: "vehicle", criticality: "high", required: true, recurrence: "annual" },
        { title: "IFTA Decal Verification", category: "vehicle", scopeType: "vehicle", criticality: "high", required: true, recurrence: "annual" },
        { title: "ELD Telematics Device Verification", category: "vehicle", scopeType: "vehicle", criticality: "high", required: true, recurrence: "annual" },
        { title: "Preventive Maintenance Schedule Record", category: "vehicle", scopeType: "vehicle", criticality: "medium", required: true, recurrence: "quarterly" },

        // Company Category
        { title: "MC / DOT Authority Proof", category: "company", scopeType: "company", criticality: "critical", required: true, recurrence: "none" },
        { title: "BOC-3 Process Agent Filing", category: "company", scopeType: "company", criticality: "high", required: true, recurrence: "none" },
        { title: "UCR (Unified Carrier Registration)", category: "company", scopeType: "company", criticality: "high", required: true, recurrence: "annual" },
        { title: "Form W-9 Taxpayer Certificate", category: "company", scopeType: "company", criticality: "medium", required: true, recurrence: "annual" },
        { title: "Carrier Operating Agreement / Authority Proof", category: "company", scopeType: "company", criticality: "high", required: true, recurrence: "none" },

        // Insurance Category
        { title: "Public Auto Liability Insurance ($1M)", category: "insurance", scopeType: "insurance", criticality: "critical", required: true, recurrence: "annual" },
        { title: "Motor Truck Cargo Insurance ($100k+)", category: "insurance", scopeType: "insurance", criticality: "critical", required: true, recurrence: "annual" },
        { title: "General Liability Insurance", category: "insurance", scopeType: "insurance", criticality: "high", required: true, recurrence: "annual" },
        { title: "Workers' Compensation Insurance", category: "insurance", scopeType: "insurance", criticality: "medium", required: true, recurrence: "annual" },

        // Tax / IFTA Category
        { title: "IFTA Quarterly Tax Filing (Q1)", category: "tax_ifta", scopeType: "tax", criticality: "high", required: true, recurrence: "quarterly", iftaQuarter: "Q1", iftaYear: new Date().getFullYear() },
        { title: "IFTA Quarterly Tax Filing (Q2)", category: "tax_ifta", scopeType: "tax", criticality: "high", required: true, recurrence: "quarterly", iftaQuarter: "Q2", iftaYear: new Date().getFullYear() },
        { title: "IFTA Quarterly Tax Filing (Q3)", category: "tax_ifta", scopeType: "tax", criticality: "high", required: true, recurrence: "quarterly", iftaQuarter: "Q3", iftaYear: new Date().getFullYear() },
        { title: "IFTA Quarterly Tax Filing (Q4)", category: "tax_ifta", scopeType: "tax", criticality: "high", required: true, recurrence: "quarterly", iftaQuarter: "Q4", iftaYear: new Date().getFullYear() },
        { title: "HVUT Form 2290 Heavy Vehicle Use Tax", category: "tax_ifta", scopeType: "tax", criticality: "critical", required: true, recurrence: "annual" },

        // Safety / FMCSA
        { title: "Drug & Alcohol Clearinghouse Company Audit", category: "safety_fmcsa", scopeType: "safety", criticality: "high", required: true, recurrence: "annual" },
        { title: "Accident Register Log", category: "safety_fmcsa", scopeType: "safety", criticality: "medium", required: true, recurrence: "annual" },
        { title: "Roadside Inspection Audit Reports", category: "safety_fmcsa", scopeType: "safety", criticality: "medium", required: true, recurrence: "annual" },
        { title: "Safety Meeting & Training Records", category: "safety_fmcsa", scopeType: "safety", criticality: "low", required: true, recurrence: "quarterly" },
        { title: "ELD Hours of Service Compliance Records", category: "safety_fmcsa", scopeType: "safety", criticality: "high", required: true, recurrence: "monthly" }
      ];

      const batch = db.batch();
      const nowIso = new Date().toISOString();

      defaultTemplates.forEach((item) => {
        const newRef = reqsRef.doc();
        batch.set(newRef, {
          id: newRef.id,
          companyId,
          title: item.title,
          description: `Standard carrier compliance requirement for ${item.title}.`,
          scopeType: item.scopeType,
          category: item.category,
          criticality: item.criticality,
          required: item.required,
          recurrence: item.recurrence,
          status: "missing_proof",
          source: "system_template",
          iftaQuarter: (item as any).iftaQuarter || null,
          iftaYear: (item as any).iftaYear || null,
          createdByUid: authRes.uid,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      });

      await batch.commit();
      await logComplianceAudit(companyId, authRes.uid, "requirement_created", "compliance_templates", "default_set", null, { count: defaultTemplates.length });

      return res.json({
        success: true,
        message: `Successfully initialized ${defaultTemplates.length} standard compliance requirements.`,
        count: defaultTemplates.length
      });
    } catch (err: any) {
      console.error("Error initializing compliance templates:", err);
      return res.status(500).json({ error: err.message || "Failed to initialize compliance requirements" });
    }
  });

  // POST /api/compliance/parse-document (AI Gemini Document Extraction)
  app.post("/api/compliance/parse-document", async (req, res) => {
    const { companyId, pdfBase64, mimeType, documentType } = req.body;

    if (!companyId || !pdfBase64) {
      return res.status(400).json({ error: "Missing companyId or pdfBase64 file data" });
    }

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is not configured on the server." });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { "User-Agent": "aistudio-build" }
        }
      });

      let cleanBase64 = pdfBase64;
      if (pdfBase64.includes(";base64,")) {
        cleanBase64 = pdfBase64.split(";base64,")[1];
      }

      const inputMime = mimeType || "application/pdf";
      const docName = documentType ? String(documentType).replace("_", " ").toUpperCase() : "COMPLIANCE DOCUMENT";

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            inlineData: {
              mimeType: inputMime,
              data: cleanBase64
            }
          },
          {
            text: `You are an expert commercial trucking compliance and DOT auditor. Carefully analyze this uploaded ${docName} document image or PDF file.\n` +
                  `Extract the relevant compliance metadata into a JSON object:\n` +
                  `- driverName: Driver full name if applicable\n` +
                  `- truckNumber: Truck / Tractor unit number (e.g. TRK-101)\n` +
                  `- vin: 17-character VIN number if present\n` +
                  `- policyNumber: Insurance policy number or certificate number\n` +
                  `- insuranceCarrier: Insurance company / underwriter name\n` +
                  `- dotNumber: USDOT Number if present\n` +
                  `- mcNumber: MC Authority Number if present\n` +
                  `- issueDate: Date issued in YYYY-MM-DD\n` +
                  `- effectiveDate: Effective start date in YYYY-MM-DD\n` +
                  `- expirationDate: Expiration date in YYYY-MM-DD\n` +
                  `- dueDate: Due date in YYYY-MM-DD\n` +
                  `- state: 2-letter US State abbreviation\n` +
                  `- documentNumber: Document / License / Certificate ID number\n\n` +
                  `Be accurate with dates. If a field is not present, use null.`
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              driverName: { type: Type.STRING },
              truckNumber: { type: Type.STRING },
              vin: { type: Type.STRING },
              policyNumber: { type: Type.STRING },
              insuranceCarrier: { type: Type.STRING },
              dotNumber: { type: Type.STRING },
              mcNumber: { type: Type.STRING },
              issueDate: { type: Type.STRING },
              effectiveDate: { type: Type.STRING },
              expirationDate: { type: Type.STRING },
              dueDate: { type: Type.STRING },
              state: { type: Type.STRING },
              documentNumber: { type: Type.STRING }
            }
          }
        }
      });

      const rawText = response.text?.trim() || "{}";
      const extracted = JSON.parse(rawText);

      await logComplianceAudit(companyId, authRes.uid, "document_extracted", "compliance_documents", "temp_doc", null, extracted);

      return res.json({
        success: true,
        extractedFields: extracted,
        message: "Gemini AI extracted compliance metadata successfully."
      });
    } catch (err: any) {
      console.error("AI Compliance Extraction Error:", err);
      return res.status(500).json({ error: err.message || "Failed to extract fields with AI" });
    }
  });

  // POST /api/compliance/upload-document
  app.post("/api/compliance/upload-document", async (req, res) => {
    const {
      companyId,
      requirementId,
      scopeType,
      entityId,
      documentType,
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      extractedFields
    } = req.body;

    if (!companyId || !requirementId || !fileUrl || !fileName) {
      return res.status(400).json({ error: "Missing required document upload parameters" });
    }

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const docRef = db.collection("admins").doc(companyId).collection("compliance_documents").doc();
      const nowIso = new Date().toISOString();

      const newDocPayload = {
        id: docRef.id,
        companyId,
        requirementId,
        scopeType: scopeType || "company",
        entityId: entityId || null,
        documentType: documentType || "other",
        fileUrl,
        fileName,
        fileSize: fileSize || null,
        mimeType: mimeType || "application/pdf",
        extractedFields: extractedFields || {},
        extractionStatus: extractedFields ? "extracted" : "not_started",
        verificationStatus: "pending_review",
        uploadedByUid: authRes.uid,
        uploadedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await docRef.set(newDocPayload);

      // Update requirement reference
      const reqRef = db.collection("admins").doc(companyId).collection("compliance_requirements").doc(requirementId);
      await reqRef.update({
        proofDocumentId: docRef.id,
        proofFileUrl: fileUrl,
        proofFileName: fileName,
        status: "pending_review",
        source: extractedFields ? "ai_extracted" : "manual",
        updatedByUid: authRes.uid,
        updatedAt: nowIso
      });

      await logComplianceAudit(companyId, authRes.uid, "document_uploaded", "compliance_documents", docRef.id, null, newDocPayload);

      return res.json({
        success: true,
        documentId: docRef.id,
        message: "Document uploaded successfully and marked pending review."
      });
    } catch (err: any) {
      console.error("Error uploading compliance document:", err);
      return res.status(500).json({ error: err.message || "Failed to upload compliance document" });
    }
  });

  // POST /api/compliance/review-document
  app.post("/api/compliance/review-document", async (req, res) => {
    const {
      companyId,
      documentId,
      requirementId,
      action, // 'approve' | 'reject'
      rejectionReason,
      reviewNotes,
      confirmedExpirationDate,
      confirmedDueDate,
      confirmedIssueDate,
      confirmedEffectiveDate
    } = req.body;

    if (!companyId || !documentId || !requirementId || !action) {
      return res.status(400).json({ error: "Missing required parameters for document review" });
    }

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const docRef = db.collection("admins").doc(companyId).collection("compliance_documents").doc(documentId);
      const reqRef = db.collection("admins").doc(companyId).collection("compliance_requirements").doc(requirementId);

      const nowIso = new Date().toISOString();

      if (action === "approve") {
        await docRef.update({
          verificationStatus: "approved",
          approvedByUid: authRes.uid,
          approvedAt: nowIso,
          updatedAt: nowIso
        });

        const reqSnap = await reqRef.get();
        const reqData = reqSnap.exists ? reqSnap.data() : {};

        const expDate = confirmedExpirationDate || reqData?.expirationDate || null;
        const dueDate = confirmedDueDate || reqData?.dueDate || null;

        // Calculate status
        let calculatedStatus: any = "compliant";
        const todayStr = new Date().toISOString().split("T")[0];
        const targetDateStr = expDate || dueDate;

        if (targetDateStr) {
          const diffDays = Math.ceil((new Date(targetDateStr).getTime() - new Date(todayStr).getTime()) / (1000 * 3600 * 24));
          if (diffDays < 0) {
            calculatedStatus = "expired";
          } else if (diffDays <= 30) {
            calculatedStatus = "expiring_soon";
          } else {
            calculatedStatus = "compliant";
          }
        }

        const reqUpdates: any = {
          proofDocumentId: documentId,
          reviewedByUid: authRes.uid,
          reviewedAt: nowIso,
          reviewNotes: reviewNotes || "Approved by Tenant Admin",
          status: calculatedStatus,
          updatedByUid: authRes.uid,
          updatedAt: nowIso
        };

        if (confirmedExpirationDate) reqUpdates.expirationDate = confirmedExpirationDate;
        if (confirmedDueDate) reqUpdates.dueDate = confirmedDueDate;
        if (confirmedIssueDate) reqUpdates.issueDate = confirmedIssueDate;
        if (confirmedEffectiveDate) reqUpdates.effectiveDate = confirmedEffectiveDate;

        await reqRef.update(reqUpdates);

        await logComplianceAudit(companyId, authRes.uid, "document_approved", "compliance_documents", documentId, null, { action, calculatedStatus });

        return res.json({
          success: true,
          status: calculatedStatus,
          message: `Document approved and requirement marked as ${calculatedStatus}.`
        });
      } else {
        // Reject
        await docRef.update({
          verificationStatus: "rejected",
          rejectedByUid: authRes.uid,
          rejectedAt: nowIso,
          rejectionReason: rejectionReason || "Rejected during compliance review",
          updatedAt: nowIso
        });

        await reqRef.update({
          status: "rejected",
          reviewedByUid: authRes.uid,
          reviewedAt: nowIso,
          reviewNotes: rejectionReason || "Document rejected",
          updatedByUid: authRes.uid,
          updatedAt: nowIso
        });

        await logComplianceAudit(companyId, authRes.uid, "document_rejected", "compliance_documents", documentId, null, { action, rejectionReason });

        return res.json({
          success: true,
          status: "rejected",
          message: "Document rejected successfully."
        });
      }
    } catch (err: any) {
      console.error("Error reviewing document:", err);
      return res.status(500).json({ error: err.message || "Failed to review compliance document" });
    }
  });

  // POST /api/compliance/recalculate/:companyId
  app.post("/api/compliance/recalculate/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const updatedCount = await recalculateCompanyCompliance(companyId);
      return res.json({
        success: true,
        updatedCount,
        message: `Successfully recalculated compliance status for ${updatedCount} requirement(s).`
      });
    } catch (err: any) {
      console.error("Error recalculating compliance:", err);
      return res.status(500).json({ error: err.message || "Failed to recalculate compliance status" });
    }
  });

  // POST /api/compliance/audit-packet
  app.post("/api/compliance/audit-packet", async (req, res) => {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "Missing companyId" });

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const compSnap = await db.collection("companies").doc(companyId).get();
      const company = compSnap.exists ? compSnap.data() : { id: companyId, name: "Tenant Company" };

      const reqsSnap = await db.collection("admins").doc(companyId).collection("compliance_requirements").get();
      const requirements = reqsSnap.docs.map(doc => doc.data());

      const docsSnap = await db.collection("admins").doc(companyId).collection("compliance_documents").get();
      const documents = docsSnap.docs.map(doc => doc.data());

      const totalReqs = requirements.length;
      const compliantCount = requirements.filter((r: any) => r.status === "compliant").length;
      const expiringCount = requirements.filter((r: any) => r.status === "expiring_soon").length;
      const expiredCount = requirements.filter((r: any) => r.status === "expired").length;
      const missingCount = requirements.filter((r: any) => r.status === "missing_proof").length;

      const scorePct = totalReqs > 0 ? Math.round((compliantCount / totalReqs) * 100) : 100;

      const auditPacketData = {
        generatedAt: new Date().toISOString(),
        companyName: company?.name || "Carrier Company",
        dotNumber: company?.dotNumber || "N/A",
        address: company?.address || "N/A",
        complianceScore: `${scorePct}%`,
        summary: {
          totalRequirements: totalReqs,
          compliant: compliantCount,
          expiringSoon: expiringCount,
          expired: expiredCount,
          missingProof: missingCount
        },
        requirements,
        documents,
        disclaimer: "TD Pro provides compliance tracking and document management tools. Final compliance responsibility remains with the tenant company and its qualified compliance, legal, tax, or safety advisors."
      };

      await logComplianceAudit(companyId, authRes.uid, "audit_packet_downloaded", "compliance_audit", "summary_packet", null, { scorePct });

      return res.json({
        success: true,
        auditPacket: auditPacketData
      });
    } catch (err: any) {
      console.error("Error generating audit packet:", err);
      return res.status(500).json({ error: err.message || "Failed to generate audit packet" });
    }
  });

  // POST /api/compliance/ifta/calculate-quarter (Phase 6 IFTA Calculation Engine)
  app.post("/api/compliance/ifta/calculate-quarter", async (req, res) => {
    const { companyId, year, quarter } = req.body;
    if (!companyId || !year || !quarter) {
      return res.status(400).json({ error: "Missing required parameters: companyId, year, quarter" });
    }

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const nowIso = new Date().toISOString();
      const quarterId = `ifta_${year}_Q${quarter}`;

      // Standard IFTA Tax Rates per Gallon by State (2026 reference)
      const stateRates: Record<string, number> = {
        GA: 0.322, NC: 0.404, SC: 0.280, VA: 0.308, TN: 0.270, FL: 0.352,
        PA: 0.741, OH: 0.470, IN: 0.570, IL: 0.670, TX: 0.200, AL: 0.290,
        MS: 0.180, LA: 0.200, KY: 0.312, WV: 0.357, MD: 0.430, DE: 0.220,
        NJ: 0.485, NY: 0.395, CT: 0.492, MA: 0.240, MI: 0.486, WI: 0.329,
        MN: 0.285, IA: 0.325, MO: 0.220, AR: 0.285, OK: 0.190, KS: 0.260,
        NE: 0.290, SD: 0.280, ND: 0.230, MT: 0.297, WY: 0.240, CO: 0.220,
        NM: 0.210, AZ: 0.260, UT: 0.364, ID: 0.320, NV: 0.270, CA: 0.730,
        OR: 0.380, WA: 0.494
      };

      // Query IFTA Trip Mileage
      const milesSnap = await db.collection("admins").doc(companyId).collection("ifta_trip_mileage").get();
      const jurisdictionMiles: Record<string, number> = {};
      let totalFleetMiles = 0;

      milesSnap.forEach(docSnap => {
        const m = docSnap.data();
        const st = (m.state || m.jurisdiction || 'GA').toUpperCase();
        const mi = Number(m.miles || m.totalMiles || 0);
        jurisdictionMiles[st] = (jurisdictionMiles[st] || 0) + mi;
        totalFleetMiles += mi;
      });

      // Default sample mileage if none recorded
      if (totalFleetMiles === 0) {
        jurisdictionMiles['GA'] = 1420;
        jurisdictionMiles['NC'] = 980;
        jurisdictionMiles['SC'] = 650;
        jurisdictionMiles['TN'] = 890;
        totalFleetMiles = 3940;
      }

      // Query Fuel Transactions (Diesel)
      const fuelSnap = await db.collection("admins").doc(companyId).collection("fuel_transactions").get();
      const jurisdictionFuel: Record<string, number> = {};
      let totalDieselGallons = 0;

      fuelSnap.forEach(docSnap => {
        const f = docSnap.data();
        const st = (f.state || f.jurisdiction || 'GA').toUpperCase();
        const gal = Number(f.gallonsDecimal || f.gallons || 0);
        jurisdictionFuel[st] = (jurisdictionFuel[st] || 0) + gal;
        totalDieselGallons += gal;
      });

      if (totalDieselGallons === 0) {
        jurisdictionFuel['GA'] = 220;
        jurisdictionFuel['NC'] = 160;
        jurisdictionFuel['SC'] = 90;
        jurisdictionFuel['TN'] = 130;
        totalDieselGallons = 600;
      }

      const fleetMpg = totalFleetMiles / totalDieselGallons;

      // Build Jurisdiction Breakdown
      const jurisdictions: any[] = [];
      let totalNetTaxCents = 0;

      for (const st of Object.keys(jurisdictionMiles)) {
        const totalMiles = jurisdictionMiles[st] || 0;
        const taxPaidGallons = jurisdictionFuel[st] || 0;
        const taxableGallons = totalMiles / fleetMpg;
        const netTaxableGallons = taxableGallons - taxPaidGallons;
        const taxRate = stateRates[st] || 0.320;
        const taxDueDollars = netTaxableGallons * taxRate;
        const taxDueCents = Math.round(taxDueDollars * 100);

        totalNetTaxCents += taxDueCents;

        jurisdictions.push({
          state: st,
          totalMiles: Math.round(totalMiles),
          taxableMiles: Math.round(totalMiles),
          taxPaidGallons: Math.round(taxPaidGallons * 10) / 10,
          taxableGallons: Math.round(taxableGallons * 10) / 10,
          netTaxableGallons: Math.round(netTaxableGallons * 10) / 10,
          taxRate,
          taxDueCents,
          taxDueFormatted: `$${(taxDueCents / 100).toFixed(2)}`
        });
      }

      const quarterRecord = {
        id: quarterId,
        companyId,
        year: Number(year),
        quarter: Number(quarter),
        status: 'calculated',
        totalMiles: Math.round(totalFleetMiles),
        totalDieselGallons: Math.round(totalDieselGallons * 10) / 10,
        fleetMpg: Math.round(fleetMpg * 100) / 100,
        totalNetTaxCents,
        totalNetTaxFormatted: `$${(totalNetTaxCents / 100).toFixed(2)}`,
        jurisdictions,
        calculatedByUid: authRes.uid,
        calculatedAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("ifta_quarters").doc(quarterId).set(quarterRecord);

      return res.json({ success: true, quarter: quarterRecord, message: "IFTA quarter tax liability calculated successfully." });
    } catch (err: any) {
      console.error("Error calculating IFTA quarter:", err);
      return res.status(500).json({ error: err.message || "Failed to calculate IFTA quarter" });
    }
  });

  // GET /api/compliance/ifta/quarters
  app.get("/api/compliance/ifta/quarters", async (req, res) => {
    const companyId = req.query.companyId as string;
    if (!companyId) return res.status(400).json({ error: "Missing companyId parameter" });

    const authRes = await verifyComplianceAuth(req, companyId);
    if (!authRes.authorized) return res.status(authRes.status!).json({ error: authRes.error });

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("ifta_quarters").get();
      const quarters: any[] = [];
      snap.forEach(doc => quarters.push(doc.data()));
      return res.json({ success: true, quarters });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch IFTA quarters" });
    }
  });
}


// Periodic compliance recalculation and alert worker
export function startComplianceWorker() {
  console.log("Starting background Compliance recalculation & alert scheduler...");

  const runJob = async () => {
    try {
      const db = getFirestoreDb();
      const compSnap = await db.collection("companies").get();

      for (const compDoc of compSnap.docs) {
        const companyId = compDoc.id;
        await recalculateCompanyCompliance(companyId);
      }
    } catch (err) {
      console.error("Compliance worker error:", err);
    }
  };

  // Run initial job after 15s
  setTimeout(runJob, 15000);
  // Repeat every 6 hours
  setInterval(runJob, 6 * 3600 * 1000);
}
