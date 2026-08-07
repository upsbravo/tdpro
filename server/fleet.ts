import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

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
    console.error("Error reading custom firestore database ID in fleet module:", err);
  }
  return getFirestore();
};

export async function verifyFleetAuth(req: express.Request, targetCompanyId: string) {
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
      return { authorized: true, callerUid, callerName: callerData?.name || 'Super Admin', role: 'super_admin', isSuperAdmin: true, companyId: targetCompanyId };
    }

    if (!callerData) {
      return { authorized: false, status: 403, error: "Forbidden: User profile not found" };
    }

    const role = callerData.role;
    const companyId = callerData.companyId;

    if (companyId !== targetCompanyId) {
      return { authorized: false, status: 403, error: "Forbidden: Cross-tenant access is strictly prohibited" };
    }

    return { authorized: true, callerUid, callerName: callerData.name || 'User', role, companyId };
  } catch (err: any) {
    return { authorized: false, status: 401, error: "Unauthorized: Token verification failed" };
  }
}

// Normalize truck numbers for conservative grouping
export function normalizeTruckNumber(truckNum: string | null | undefined): string {
  if (!truckNum) return "";
  let clean = String(truckNum).trim().toUpperCase();
  // Strip prefixes like "TRUCK #", "TRK-", "UNIT "
  clean = clean.replace(/^(TRUCK|TRK|UNIT)\s*#?\s*-?\s*/i, "");
  // Keep alphanumeric characters
  return clean.replace(/[^A-Z0-9]/g, "");
}

/**
 * Historical Assignment Lookup Service
 */
export async function getTruckDriverAssignmentAtTime(params: {
  companyId: string;
  truckId?: string | null;
  driverId?: string | null;
  timestamp: string;
}) {
  const db = getFirestoreDb();
  const { companyId, truckId, driverId, timestamp } = params;

  if (!companyId || (!truckId && !driverId)) {
    return { confidence: "not_found", assignment: null };
  }

  const queryDateIso = new Date(timestamp).toISOString();

  let query = db.collection("admins").doc(companyId).collection("truck_driver_assignments") as any;

  if (truckId) {
    query = query.where("truckId", "==", truckId);
  } else if (driverId) {
    query = query.where("driverId", "==", driverId);
  }

  const snap = await query.get();
  if (snap.empty) {
    return { confidence: "not_found", assignment: null };
  }

  const matches: any[] = [];
  snap.forEach((doc: any) => {
    const data = doc.data();
    if (data.status === "cancelled") return;

    const effectiveFrom = data.effectiveFrom;
    const effectiveTo = data.effectiveTo;

    // Check date range
    if (effectiveFrom <= queryDateIso && (!effectiveTo || effectiveTo >= queryDateIso)) {
      matches.push(data);
    }
  });

  if (matches.length === 1) {
    return { confidence: "exact", assignment: matches[0] };
  } else if (matches.length > 1) {
    const primary = matches.find(m => m.assignmentType === 'primary') || matches[0];
    return { confidence: "ambiguous", assignment: primary, allMatches: matches };
  }

  return { confidence: "not_found", assignment: null };
}

export function registerFleetRoutes(app: express.Express) {
  /**
   * GET CENTRALIZED TRUCKS
   * GET /api/fleet/trucks/:companyId
   */
  app.get("/api/fleet/trucks/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("trucks").get();
      const trucks: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        trucks.push({ ...d, id: d.id || doc.id, companyId });
      });
      return res.json({ success: true, trucks });
    } catch (err: any) {
      console.error("Error fetching trucks:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch trucks" });
    }
  });

  /**
   * CREATE / UPDATE CENTRAL TRUCK
   * POST /api/fleet/trucks/:companyId
   */
  app.post("/api/fleet/trucks/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    const {
      id,
      truckNumber,
      vin,
      licensePlate,
      licensePlateState,
      make,
      model,
      year,
      vehicleType,
      ownershipType,
      currentOwnerOperatorCompanyId,
      ownerOperatorCompanyId,
      status,
      fuelTankCapacityGallonsDecimal,
      reeferTankCapacityGallonsDecimal,
      overrideDuplicate
    } = req.body;

    if (!truckNumber || !String(truckNumber).trim()) {
      return res.status(400).json({ error: "truckNumber is required" });
    }

    try {
      const db = getFirestoreDb();
      const norm = normalizeTruckNumber(truckNumber);
      const cleanTruckNum = String(truckNumber).trim();
      const cleanVin = vin ? String(vin).trim() : "";

      // DUPLICATE DETECTION CHECK
      const allTrucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      let targetTruckId = id || null;
      let existingDupDoc: any = null;

      allTrucksSnap.forEach(d => {
        const trkData = d.data();
        const trkDocId = trkData.id || d.id;
        if (targetTruckId && trkDocId === targetTruckId) return;

        const otherVin = trkData.vin ? String(trkData.vin).trim() : "";
        const otherNum = trkData.truckNumber ? String(trkData.truckNumber).trim() : "";
        const otherNorm = (trkData.normalizedTruckNumber || normalizeTruckNumber(otherNum)).toUpperCase();

        const vinMatch = cleanVin && otherVin && cleanVin.toLowerCase() === otherVin.toLowerCase();
        const numMatch = norm && otherNorm && norm === otherNorm;

        if (vinMatch || numMatch) {
          existingDupDoc = { id: trkDocId, ref: d.ref, ...trkData };
        }
      });

      if (existingDupDoc && !overrideDuplicate) {
        return res.status(409).json({
          error: `Duplicate truck detected: A truck with ${cleanVin && existingDupDoc.vin?.toLowerCase() === cleanVin.toLowerCase() ? `VIN '${cleanVin}'` : `Truck #${cleanTruckNum}`} already exists in your fleet registry (ID: ${existingDupDoc.id}).`,
          duplicateTruckId: existingDupDoc.id
        });
      }

      const truckId = targetTruckId || (existingDupDoc && overrideDuplicate ? existingDupDoc.id : `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      const now = new Date().toISOString();

      const existingRef = db.collection("admins").doc(companyId).collection("trucks").doc(truckId);
      const existingSnap = await existingRef.get();

      const ownerOpId = currentOwnerOperatorCompanyId || ownerOperatorCompanyId || null;

      const payload: any = {
        id: truckId,
        companyId,
        truckNumber: cleanTruckNum,
        normalizedTruckNumber: norm,
        vin: cleanVin || null,
        licensePlate: licensePlate ? String(licensePlate).trim() : null,
        licensePlateState: licensePlateState ? String(licensePlateState).trim() : null,
        make: make ? String(make).trim() : null,
        model: model ? String(model).trim() : null,
        makeModel: make && model ? `${make} ${model}` : (make || model || null),
        year: year ? String(year).trim() : null,
        vehicleType: vehicleType || "tractor",
        ownershipType: ownershipType || "company_owned",
        currentOwnerOperatorCompanyId: ownerOpId,
        ownerOperatorCompanyId: ownerOpId,
        status: status || "active",
        fuelTankCapacityGallonsDecimal: fuelTankCapacityGallonsDecimal ? Number(fuelTankCapacityGallonsDecimal) : null,
        reeferTankCapacityGallonsDecimal: reeferTankCapacityGallonsDecimal ? Number(reeferTankCapacityGallonsDecimal) : null,
        currentOdometerDecimal: req.body.currentOdometerDecimal !== undefined ? Number(req.body.currentOdometerDecimal) : null,
        nextPmDueOdometerDecimal: req.body.nextPmDueOdometerDecimal !== undefined ? Number(req.body.nextPmDueOdometerDecimal) : null,
        pmIntervalMilesDecimal: req.body.pmIntervalMilesDecimal !== undefined ? Number(req.body.pmIntervalMilesDecimal) : null,
        pmWarningMilesDecimal: req.body.pmWarningMilesDecimal !== undefined ? Number(req.body.pmWarningMilesDecimal) : null,
        pmOverdueToleranceMilesDecimal: req.body.pmOverdueToleranceMilesDecimal !== undefined ? Number(req.body.pmOverdueToleranceMilesDecimal) : null,
        pmDispatchPolicy: req.body.pmDispatchPolicy || 'warning_only',
        pmStatus: req.body.pmStatus || null,
        dispatchBlocked: req.body.dispatchBlocked !== undefined ? Boolean(req.body.dispatchBlocked) : false,
        dispatchBlockedReason: req.body.dispatchBlockedReason ? String(req.body.dispatchBlockedReason).trim() : null,
        updatedAt: now,
        updatedByUid: authRes.callerUid
      };

      if (!existingSnap.exists) {
        payload.createdAt = now;
        payload.createdByUid = authRes.callerUid;
        payload.currentDriverId = null;
        payload.currentDriverName = null;
        payload.assignedDriverId = null;
      }

      await existingRef.set(payload, { merge: true });

      // Write audit log
      await db.collection("admins").doc(companyId).collection("audit_logs").add({
        companyId,
        userId: authRes.callerUid,
        action: existingSnap.exists ? "truck_updated" : "truck_created",
        entityType: "truck",
        entityId: truckId,
        after: payload,
        createdAt: now
      });

      return res.json({ success: true, truck: { id: truckId, ...payload } });
    } catch (err: any) {
      console.error("Error saving truck:", err);
      return res.status(500).json({ error: err.message || "Failed to save truck" });
    }
  });

  /**
   * ARCHIVE / DELETE CENTRAL TRUCK
   * DELETE /api/fleet/trucks/:companyId/:truckId
   */
  app.delete("/api/fleet/trucks/:companyId/:truckId", async (req, res) => {
    const { companyId, truckId } = req.params;
    const mode = (req.query.mode as string) || "archive"; // 'archive' or 'permanent'
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(truckId);
      let truckSnap = await truckRef.get();

      // Flexible fallback lookup if document ID mismatch exists
      if (!truckSnap.exists) {
        const allTrucks = await db.collection("admins").doc(companyId).collection("trucks").get();
        let matchedDoc: any = null;
        allTrucks.forEach(d => {
          const trkData = d.data();
          if (
            d.id === truckId ||
            trkData.id === truckId ||
            trkData.truckNumber === truckId ||
            (trkData.vin && trkData.vin === truckId)
          ) {
            matchedDoc = d;
          }
        });

        if (matchedDoc) {
          truckRef = matchedDoc.ref;
          truckSnap = matchedDoc;
        } else {
          return res.status(404).json({ error: `Truck '${truckId}' not found in fleet registry` });
        }
      }

      const truckData = truckSnap.data()!;
      const realDocId = truckSnap.id;
      const now = new Date().toISOString();

      // If assigned to a driver, unassign driver
      if (truckData.currentDriverId || truckData.assignedDriverId) {
        const drvId = truckData.currentDriverId || truckData.assignedDriverId;
        const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(drvId);
        const driverSnap = await driverRef.get();
        if (driverSnap.exists) {
          await driverRef.set({
            currentTruckId: null,
            currentTruckNumber: null,
            truckNumber: "",
            updatedAt: now
          }, { merge: true });
        }
      }

      if (mode === "permanent") {
        await truckRef.delete();
      } else {
        await truckRef.set({
          status: "archived",
          archivedAt: now,
          archivedByUid: authRes.callerUid,
          currentDriverId: null,
          currentDriverName: null,
          assignedDriverId: null,
          updatedAt: now
        }, { merge: true });
      }

      // Write audit log
      await db.collection("admins").doc(companyId).collection("audit_logs").add({
        companyId,
        userId: authRes.callerUid,
        action: mode === "permanent" ? "truck_deleted" : "truck_archived",
        entityType: "truck",
        entityId: realDocId,
        truckNumber: truckData.truckNumber || "",
        createdAt: now
      });

      return res.json({
        success: true,
        message: mode === "permanent"
          ? `Truck #${truckData.truckNumber || realDocId} permanently deleted from registry`
          : `Truck #${truckData.truckNumber || realDocId} successfully archived`
      });
    } catch (err: any) {
      console.error("Error deleting/archiving truck:", err);
      return res.status(500).json({ error: err.message || "Failed to process truck removal" });
    }
  });

  /**
   * AUTOMATIC FLEET DEDUPLICATION
   * POST /api/fleet/deduplicate-trucks/:companyId
   */
  app.post("/api/fleet/deduplicate-trucks/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("trucks").get();
      
      const trucksList: any[] = [];
      snap.forEach(d => {
        trucksList.push({ docId: d.id, ref: d.ref, ...d.data() });
      });

      // Group by VIN first, then by normalized truck number
      const groupsByVin: { [vin: string]: any[] } = {};
      const groupsByNum: { [num: string]: any[] } = {};

      trucksList.forEach(t => {
        const vinKey = t.vin ? String(t.vin).trim().toUpperCase() : null;
        const numKey = t.truckNumber ? normalizeTruckNumber(t.truckNumber) : null;

        if (vinKey) {
          if (!groupsByVin[vinKey]) groupsByVin[vinKey] = [];
          groupsByVin[vinKey].push(t);
        } else if (numKey) {
          if (!groupsByNum[numKey]) groupsByNum[numKey] = [];
          groupsByNum[numKey].push(t);
        }
      });

      let removedCount = 0;
      const processedDocIds = new Set<string>();

      // Deduplicate VIN groups
      for (const vinKey of Object.keys(groupsByVin)) {
        const list = groupsByVin[vinKey];
        if (list.length > 1) {
          // Sort to pick primary: prefer active, assigned driver, or most complete record
          list.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (b.status === 'active' && a.status !== 'active') return 1;
            if (a.assignedDriverId && !b.assignedDriverId) return -1;
            if (b.assignedDriverId && !a.assignedDriverId) return 1;
            return (b.updatedAt || '').localeCompare(a.updatedAt || '');
          });

          const primary = list[0];
          processedDocIds.add(primary.docId);

          for (let i = 1; i < list.length; i++) {
            const dup = list[i];
            if (!processedDocIds.has(dup.docId)) {
              await dup.ref.delete();
              processedDocIds.add(dup.docId);
              removedCount++;
            }
          }
        }
      }

      // Deduplicate Number groups
      for (const numKey of Object.keys(groupsByNum)) {
        const list = groupsByNum[numKey];
        if (list.length > 1) {
          list.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (b.status === 'active' && a.status !== 'active') return 1;
            return (b.updatedAt || '').localeCompare(a.updatedAt || '');
          });

          const primary = list[0];
          processedDocIds.add(primary.docId);

          for (let i = 1; i < list.length; i++) {
            const dup = list[i];
            if (!processedDocIds.has(dup.docId)) {
              await dup.ref.delete();
              processedDocIds.add(dup.docId);
              removedCount++;
            }
          }
        }
      }

      return res.json({
        success: true,
        removedCount,
        message: removedCount > 0
          ? `Successfully removed ${removedCount} duplicate truck document(s) from registry!`
          : "No duplicate truck records were found."
      });
    } catch (err: any) {
      console.error("Error deduplicating fleet:", err);
      return res.status(500).json({ error: err.message || "Failed to deduplicate fleet" });
    }
  });

  /**
   * ATOMIC TRUCK-DRIVER ASSIGNMENT SERVICE
   * POST /api/fleet/truck-assignments
   */
  app.post("/api/fleet/truck-assignments", async (req, res) => {
    const {
      companyId,
      driverId,
      truckId,
      assignmentType,
      reason,
      notes,
      effectiveFrom,
      overrideConflict
    } = req.body;

    if (!companyId || !driverId) {
      return res.status(400).json({ error: "Missing required fields: companyId, driverId" });
    }

    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const nowIso = effectiveFrom || new Date().toISOString();

      // Handle Unassign request
      if (!truckId || truckId === 'unassign' || truckId === 'none' || truckId === 'clear') {
        const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId);
        const driverSnap = await driverRef.get();
        if (!driverSnap.exists) {
          return res.status(404).json({ error: `Driver ${driverId} not found` });
        }
        const driverData = driverSnap.data()!;
        const driverName = driverData.name || driverData.displayName || driverData.email || driverId;

        const driverActiveAssignmentsSnap = await db.collection("admins").doc(companyId)
          .collection("truck_driver_assignments")
          .where("driverId", "==", driverId)
          .where("status", "==", "active")
          .get();

        const batch = db.batch();

        driverActiveAssignmentsSnap.forEach(d => {
          const ref = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(d.id);
          batch.update(ref, {
            effectiveTo: nowIso,
            status: "completed",
            endedByUid: authRes.callerUid,
            endedByNameSnapshot: authRes.callerName,
            endedReason: reason || "Driver unassigned",
            updatedAt: nowIso
          });
        });

        // Clear Driver document
        batch.set(driverRef, {
          currentTruckId: null,
          currentTruckNumber: null,
          truckNumber: "",
          assignedTruck: "",
          currentTruckAssignmentId: null,
          currentTruckAssignedAt: null,
          updatedAt: nowIso
        }, { merge: true });

        // Clear /users/{driverId}
        const userDocRef = db.collection("users").doc(driverId);
        batch.set(userDocRef, {
          currentTruckId: null,
          currentTruckNumber: null,
          truckNumber: "",
          assignedTruck: "",
          updatedAt: nowIso
        }, { merge: true });

        // Clear truck docs currently assigned to this driver
        const assignedTrucksSnap = await db.collection("admins").doc(companyId).collection("trucks")
          .where("currentDriverId", "==", driverId)
          .get();
        
        assignedTrucksSnap.forEach(tDoc => {
          batch.set(tDoc.ref, {
            currentDriverId: null,
            currentDriverName: null,
            assignedDriverId: null,
            updatedAt: nowIso
          }, { merge: true });
        });

        await batch.commit();

        return res.json({
          success: true,
          message: `Driver ${driverName} was successfully unassigned from all trucks.`
        });
      }

      // 1. Fetch Truck
      const truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(truckId);
      const truckSnap = await truckRef.get();
      if (!truckSnap.exists) {
        return res.status(404).json({ error: `Truck ${truckId} not found in central registry` });
      }
      const truckData = truckSnap.data()!;

      // 2. Fetch Driver
      const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId);
      const driverSnap = await driverRef.get();
      if (!driverSnap.exists) {
        return res.status(404).json({ error: `Driver ${driverId} not found` });
      }
      const driverData = driverSnap.data()!;
      const driverName = driverData.name || driverData.displayName || driverData.email || driverId;

      // 3. Conflict Detection
      // Check if driver currently has an active assignment
      const driverActiveAssignmentsSnap = await db.collection("admins").doc(companyId)
        .collection("truck_driver_assignments")
        .where("driverId", "==", driverId)
        .where("status", "==", "active")
        .get();

      // Check if truck currently has an active assignment
      const truckActiveAssignmentsSnap = await db.collection("admins").doc(companyId)
        .collection("truck_driver_assignments")
        .where("truckId", "==", truckId)
        .where("status", "==", "active")
        .get();

      const conflictingDriverAssignments: any[] = [];
      driverActiveAssignmentsSnap.forEach(d => {
        if (d.data().truckId !== truckId) {
          conflictingDriverAssignments.push({ id: d.id, ...d.data() });
        }
      });

      const conflictingTruckAssignments: any[] = [];
      truckActiveAssignmentsSnap.forEach(t => {
        if (t.data().driverId !== driverId) {
          conflictingTruckAssignments.push({ id: t.id, ...t.data() });
        }
      });

      if ((conflictingDriverAssignments.length > 0 || conflictingTruckAssignments.length > 0) && !overrideConflict) {
        return res.status(409).json({
          error: "Assignment conflict detected",
          requiresOverride: true,
          conflictingDriverAssignments,
          conflictingTruckAssignments,
          message: `Driver or Truck already has an active primary assignment. Pass overrideConflict: true to reassign.`
        });
      }

      // 4. Close existing active assignments if reassigning
      const batch = db.batch();

      driverActiveAssignmentsSnap.forEach(d => {
        const ref = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(d.id);
        batch.update(ref, {
          effectiveTo: nowIso,
          status: "completed",
          endedByUid: authRes.callerUid,
          endedByNameSnapshot: authRes.callerName,
          endedReason: reason || "Reassigned to new truck",
          updatedAt: nowIso
        });
      });

      truckActiveAssignmentsSnap.forEach(t => {
        const ref = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(t.id);
        batch.update(ref, {
          effectiveTo: nowIso,
          status: "completed",
          endedByUid: authRes.callerUid,
          endedByNameSnapshot: authRes.callerName,
          endedReason: reason || "Reassigned to new driver",
          updatedAt: nowIso
        });
      });

      // Also clear old truck if driver had another truck cached
      if (driverData.currentTruckId && driverData.currentTruckId !== truckId) {
        const oldTruckRef = db.collection("admins").doc(companyId).collection("trucks").doc(driverData.currentTruckId);
        batch.set(oldTruckRef, {
          currentDriverId: null,
          currentDriverName: null,
          assignedDriverId: null,
          updatedAt: nowIso
        }, { merge: true });
      }

      // Also clear old driver if truck had another driver cached
      if (truckData.currentDriverId && truckData.currentDriverId !== driverId) {
        const oldDriverRef = db.collection("admins").doc(companyId).collection("drivers").doc(truckData.currentDriverId);
        batch.set(oldDriverRef, {
          currentTruckId: null,
          currentTruckNumber: null,
          truckNumber: "",
          assignedTruck: "",
          currentTruckAssignmentId: null,
          updatedAt: nowIso
        }, { merge: true });
      }

      // 5. Create new Assignment Ledger Record
      const newAssignmentId = `assign_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newAssignmentRef = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(newAssignmentId);

      const assignmentDoc = {
        id: newAssignmentId,
        companyId,
        truckId,
        truckNumberSnapshot: truckData.truckNumber || "",
        vinSnapshot: truckData.vin || "",
        driverId,
        driverNameSnapshot: driverName,
        ownerOperatorCompanyIdSnapshot: truckData.currentOwnerOperatorCompanyId || truckData.ownerOperatorCompanyId || null,
        assignmentType: assignmentType || "primary",
        effectiveFrom: nowIso,
        effectiveTo: null,
        status: "active",
        source: "manual",
        reason: reason || "truck_change",
        notes: notes || "",
        assignedByUid: authRes.callerUid,
        assignedByNameSnapshot: authRes.callerName,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      batch.set(newAssignmentRef, assignmentDoc);

      // 6. Update Driver current-truck cache
      batch.set(driverRef, {
        currentTruckId: truckId,
        currentTruckNumber: truckData.truckNumber || "",
        truckNumber: truckData.truckNumber || "", // legacy field sync
        assignedTruck: truckData.truckNumber || "",
        currentTruckAssignmentId: newAssignmentId,
        currentTruckAssignedAt: nowIso,
        updatedAt: nowIso
      }, { merge: true });

      // Also update /users/{driverId} if present
      const userDocRef = db.collection("users").doc(driverId);
      batch.set(userDocRef, {
        currentTruckId: truckId,
        currentTruckNumber: truckData.truckNumber || "",
        truckNumber: truckData.truckNumber || "",
        assignedTruck: truckData.truckNumber || "",
        updatedAt: nowIso
      }, { merge: true });

      // 7. Update Truck current-driver cache
      batch.set(truckRef, {
        currentDriverId: driverId,
        currentDriverName: driverName,
        assignedDriverId: driverId, // legacy sync
        updatedAt: nowIso
      }, { merge: true });

      // 8. Audit Log
      const auditRef = db.collection("admins").doc(companyId).collection("audit_logs").doc();
      batch.set(auditRef, {
        companyId,
        userId: authRes.callerUid,
        action: "assignment_created",
        entityType: "truck_driver_assignment",
        entityId: newAssignmentId,
        after: assignmentDoc,
        createdAt: nowIso
      });

      await batch.commit();

      return res.json({
        success: true,
        assignment: assignmentDoc,
        message: `Driver ${driverName} successfully assigned to Truck #${truckData.truckNumber}`
      });
    } catch (err: any) {
      console.error("Error creating truck assignment:", err);
      return res.status(500).json({ error: err.message || "Failed to create assignment" });
    }
  });

  /**
   * END AN ASSIGNMENT
   * POST /api/fleet/truck-assignments/:assignmentId/end
   */
  app.post("/api/fleet/truck-assignments/:assignmentId/end", async (req, res) => {
    const { assignmentId } = req.params;
    const { companyId, endedReason } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const assignRef = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(assignmentId);
      const assignSnap = await assignRef.get();

      if (!assignSnap.exists) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignData = assignSnap.data()!;
      const nowIso = new Date().toISOString();

      const batch = db.batch();

      batch.update(assignRef, {
        effectiveTo: nowIso,
        status: "completed",
        endedByUid: authRes.callerUid,
        endedByNameSnapshot: authRes.callerName,
        endedReason: endedReason || "Assignment ended manually",
        updatedAt: nowIso
      });

      // Clear Driver cache if it matches this assignment
      const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(assignData.driverId);
      const driverSnap = await driverRef.get();
      if (driverSnap.exists && driverSnap.data()?.currentTruckAssignmentId === assignmentId) {
        batch.set(driverRef, {
          currentTruckId: null,
          currentTruckNumber: null,
          currentTruckAssignmentId: null,
          currentTruckAssignedAt: null,
          updatedAt: nowIso
        }, { merge: true });
      }

      // Clear Truck cache if it matches this driver
      const truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(assignData.truckId);
      const truckSnap = await truckRef.get();
      if (truckSnap.exists && truckSnap.data()?.currentDriverId === assignData.driverId) {
        batch.set(truckRef, {
          currentDriverId: null,
          currentDriverName: null,
          assignedDriverId: null,
          updatedAt: nowIso
        }, { merge: true });
      }

      // Audit Log
      const auditRef = db.collection("admins").doc(companyId).collection("audit_logs").doc();
      batch.set(auditRef, {
        companyId,
        userId: authRes.callerUid,
        action: "assignment_ended",
        entityType: "truck_driver_assignment",
        entityId: assignmentId,
        reason: endedReason || "Manual end",
        createdAt: nowIso
      });

      await batch.commit();

      return res.json({ success: true, message: "Assignment ended successfully" });
    } catch (err: any) {
      console.error("Error ending assignment:", err);
      return res.status(500).json({ error: err.message || "Failed to end assignment" });
    }
  });

  /**
   * GET ASSIGNMENTS HISTORY
   * GET /api/fleet/truck-assignments/:companyId
   */
  app.get("/api/fleet/truck-assignments/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const { driverId, truckId } = req.query;

    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let query = db.collection("admins").doc(companyId).collection("truck_driver_assignments") as any;

      if (driverId) {
        query = query.where("driverId", "==", String(driverId));
      } else if (truckId) {
        query = query.where("truckId", "==", String(truckId));
      }

      const snap = await query.get();
      const assignments: any[] = [];
      snap.forEach(doc => {
        assignments.push({ id: doc.id, ...doc.data() });
      });

      // Sort by effectiveFrom desc
      assignments.sort((a, b) => (b.effectiveFrom || b.createdAt || '').localeCompare(a.effectiveFrom || a.createdAt || ''));

      // Automatic reconciliation: If there are multiple 'active' assignment records for the same driver or truck,
      // keep only the latest one active and mark older ones as completed.
      const activeByDriver = new Map<string, any[]>();
      assignments.forEach(a => {
        if (a.status === 'active' && a.driverId) {
          const list = activeByDriver.get(a.driverId) || [];
          list.push(a);
          activeByDriver.set(a.driverId, list);
        }
      });

      const batch = db.batch();
      let needsBatchCommit = false;

      activeByDriver.forEach((activeList) => {
        if (activeList.length > 1) {
          // Keep activeList[0] active (newest), mark activeList[1..N] as completed
          for (let i = 1; i < activeList.length; i++) {
            const stale = activeList[i];
            stale.status = 'completed';
            stale.effectiveTo = stale.effectiveTo || activeList[0].effectiveFrom || new Date().toISOString();
            stale.endedReason = stale.endedReason || 'Superseded by newer active assignment';

            const staleRef = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(stale.id);
            batch.update(staleRef, {
              status: 'completed',
              effectiveTo: stale.effectiveTo,
              endedReason: stale.endedReason,
              updatedAt: new Date().toISOString()
            });
            needsBatchCommit = true;
          }
        }
      });

      if (needsBatchCommit) {
        await batch.commit().catch(e => console.warn("Failed committing assignment de-duplication batch:", e));
      }

      return res.json({ success: true, assignments });
    } catch (err: any) {
      console.error("Error fetching assignments:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch assignments" });
    }
  });

  /**
   * EXECUTE IDEMPOTENT MIGRATION
   * POST /api/fleet/execute-migration/:companyId
   */
  app.post("/api/fleet/execute-migration/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();

      // 1. Fetch preview first
      const previewRes = await fetch(`http://localhost:3000/api/fleet/migration-preview/${companyId}`, {
        headers: { Authorization: req.headers.authorization || '' }
      });

      if (!previewRes.ok) {
        throw new Error("Failed to generate migration preview for execution");
      }

      const previewData = await previewRes.json();
      const { suggestedCentralTrucks, driversWithTruckStrings } = previewData;

      const nowIso = new Date().toISOString();
      let createdTrucksCount = 0;
      let createdAssignmentsCount = 0;

      const batch = db.batch();

      // Map to hold newly created or matched trucks by normalized number
      const normalizedToTruckMap = new Map<string, { id: string; truckNumber: string; vin?: string; ownerOpId?: string }>();

      // Populate existing trucks in map
      const existingTrucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      existingTrucksSnap.forEach(d => {
        const trk = d.data();
        const norm = normalizeTruckNumber(trk.truckNumber);
        if (norm) {
          normalizedToTruckMap.set(norm, {
            id: d.id,
            truckNumber: trk.truckNumber,
            vin: trk.vin,
            ownerOpId: trk.currentOwnerOperatorCompanyId || trk.ownerOperatorCompanyId || null
          });
        }
      });

      // Create new central trucks
      for (const st of suggestedCentralTrucks) {
        if (!normalizedToTruckMap.has(st.normalizedTruckNumber)) {
          const newTruckId = `trk_mig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(newTruckId);

          const newTruckDoc = {
            companyId,
            truckNumber: st.truckNumber,
            normalizedTruckNumber: st.normalizedTruckNumber,
            status: "active",
            vehicleType: "tractor",
            ownershipType: "company_owned",
            currentDriverId: null,
            currentDriverName: null,
            createdAt: nowIso,
            createdByUid: authRes.callerUid,
            source: "migration"
          };

          batch.set(truckRef, newTruckDoc);
          normalizedToTruckMap.set(st.normalizedTruckNumber, { id: newTruckId, truckNumber: st.truckNumber });
          createdTrucksCount++;
        }
      }

      // Process Driver Truck Assignments
      for (const drv of driversWithTruckStrings) {
        const norm = drv.normalizedTruckNumber;
        if (!norm) continue;

        const matchedTruck = normalizedToTruckMap.get(norm);
        if (!matchedTruck) continue;

        // Check if driver already has an active assignment
        const existingAssignmentSnap = await db.collection("admins").doc(companyId)
          .collection("truck_driver_assignments")
          .where("driverId", "==", drv.driverId)
          .where("status", "==", "active")
          .get();

        if (existingAssignmentSnap.empty) {
          const assignId = `assign_mig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const assignRef = db.collection("admins").doc(companyId).collection("truck_driver_assignments").doc(assignId);

          const assignDoc = {
            id: assignId,
            companyId,
            truckId: matchedTruck.id,
            truckNumberSnapshot: matchedTruck.truckNumber,
            vinSnapshot: matchedTruck.vin || "",
            driverId: drv.driverId,
            driverNameSnapshot: drv.driverName,
            ownerOperatorCompanyIdSnapshot: matchedTruck.ownerOpId || null,
            assignmentType: "primary",
            effectiveFrom: nowIso,
            effectiveTo: null,
            status: "active",
            source: "migration",
            reason: "new_assignment",
            notes: "Migrated from legacy driver truck string",
            assignedByUid: authRes.callerUid,
            assignedByNameSnapshot: authRes.callerName,
            migrationConfidence: drv.hasCentralMatch ? "high" : "medium",
            createdAt: nowIso,
            updatedAt: nowIso
          };

          batch.set(assignRef, assignDoc);
          createdAssignmentsCount++;

          // Update driver current truck cache
          const driverRef = db.collection("admins").doc(companyId).collection("drivers").doc(drv.driverId);
          batch.set(driverRef, {
            currentTruckId: matchedTruck.id,
            currentTruckNumber: matchedTruck.truckNumber,
            currentTruckAssignmentId: assignId,
            currentTruckAssignedAt: nowIso,
            updatedAt: nowIso
          }, { merge: true });

          // Update truck current driver cache
          const truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(matchedTruck.id);
          batch.set(truckRef, {
            currentDriverId: drv.driverId,
            currentDriverName: drv.driverName,
            assignedDriverId: drv.driverId,
            updatedAt: nowIso
          }, { merge: true });
        }
      }

      // Audit Log
      const auditRef = db.collection("admins").doc(companyId).collection("audit_logs").doc();
      batch.set(auditRef, {
        companyId,
        userId: authRes.callerUid,
        action: "migration_executed",
        entityType: "fleet_migration",
        entityId: `mig_${Date.now()}`,
        details: { createdTrucksCount, createdAssignmentsCount },
        createdAt: nowIso
      });

      await batch.commit();

      return res.json({
        success: true,
        message: `Migration completed successfully! Created ${createdTrucksCount} central trucks and ${createdAssignmentsCount} assignment records.`,
        createdTrucksCount,
        createdAssignmentsCount
      });
    } catch (err: any) {
      console.error("Error executing fleet migration:", err);
      return res.status(500).json({ error: err.message || "Failed to execute migration" });
    }
  });

  /**
   * READ-ONLY MIGRATION PREVIEW (Phase 1)
   * GET /api/fleet/migration-preview/:companyId
   */
  app.get("/api/fleet/migration-preview/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyFleetAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();

      // 1. Existing central trucks
      const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      const existingCentralTrucks: any[] = [];
      const centralTruckNumbersSet = new Set<string>();
      const normalizedCentralMap = new Map<string, any>();

      trucksSnap.forEach(doc => {
        const trk: any = { id: doc.id, ...doc.data() };
        existingCentralTrucks.push(trk);
        if (trk.truckNumber) {
          centralTruckNumbersSet.add(trk.truckNumber.trim().toUpperCase());
          const norm = normalizeTruckNumber(trk.truckNumber);
          if (norm) normalizedCentralMap.set(norm, trk);
        }
      });

      // 2. Drivers with text truck numbers
      const driversSnap = await db.collection("admins").doc(companyId).collection("drivers").get();
      const driversWithTruckStrings: any[] = [];
      const unlinkedTextTruckNumbers = new Set<string>();

      driversSnap.forEach(doc => {
        const d = doc.data();
        const rawTruck = d.truckNumber || d.truck || d.unitNumber || d.currentTruckNumber || "";
        if (rawTruck) {
          const norm = normalizeTruckNumber(rawTruck);
          const hasCentralMatch = Boolean(
            centralTruckNumbersSet.has(rawTruck.trim().toUpperCase()) ||
            (norm && normalizedCentralMap.has(norm))
          );

          driversWithTruckStrings.push({
            driverId: doc.id,
            driverName: d.name || d.email || doc.id,
            rawTruckNumber: rawTruck,
            normalizedTruckNumber: norm,
            hasCentralMatch,
            matchedTruckId: hasCentralMatch ? (normalizedCentralMap.get(norm)?.id || null) : null
          });

          if (!hasCentralMatch) {
            unlinkedTextTruckNumbers.add(rawTruck.trim());
          }
        }
      });

      // 3. Scan recent loads for any additional truck numbers
      const loadsSnap = await db.collection("admins").doc(companyId).collection("loads")
        .limit(100)
        .get();

      loadsSnap.forEach(doc => {
        const l = doc.data();
        const rawTruck = l.assignedTruckNumber || l.truckNumber || "";
        if (rawTruck) {
          const norm = normalizeTruckNumber(rawTruck);
          const hasCentralMatch = Boolean(
            centralTruckNumbersSet.has(rawTruck.trim().toUpperCase()) ||
            (norm && normalizedCentralMap.has(norm))
          );
          if (!hasCentralMatch) {
            unlinkedTextTruckNumbers.add(rawTruck.trim());
          }
        }
      });

      // 4. Proposed central trucks to create
      const suggestedCentralTrucks: any[] = [];
      const ambiguousDuplicates: any[] = [];
      const processedNorms = new Set<string>();

      unlinkedTextTruckNumbers.forEach(rawTruck => {
        const norm = normalizeTruckNumber(rawTruck);
        if (!norm) return;

        if (processedNorms.has(norm)) {
          ambiguousDuplicates.push({ rawTruckNumber: rawTruck, normalized: norm, reason: "Duplicate normalized key among unlinked trucks" });
          return;
        }
        processedNorms.add(norm);

        suggestedCentralTrucks.push({
          suggestedId: `truck_mig_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          companyId,
          truckNumber: rawTruck,
          normalizedTruckNumber: norm,
          status: "active",
          ownershipType: "company_owned",
          vehicleType: "tractor",
          source: "migration_preview"
        });
      });

      // 5. Suggested assignments for drivers
      const suggestedAssignments = driversWithTruckStrings.map(d => ({
        driverId: d.driverId,
        driverName: d.driverName,
        truckNumber: d.rawTruckNumber,
        matchedExistingTruckId: d.matchedTruckId,
        suggestedAssignmentType: "primary",
        effectiveFrom: new Date().toISOString(),
        migrationConfidence: d.hasCentralMatch ? "high" : "medium"
      }));

      return res.json({
        success: true,
        companyId,
        existingCentralTrucksCount: existingCentralTrucks.length,
        existingCentralTrucks,
        driversWithTruckCount: driversWithTruckStrings.length,
        driversWithTruckStrings,
        unlinkedTruckNumbersCount: unlinkedTextTruckNumbers.size,
        unlinkedTruckNumbers: Array.from(unlinkedTextTruckNumbers),
        suggestedCentralTrucksCount: suggestedCentralTrucks.length,
        suggestedCentralTrucks,
        suggestedAssignments,
        ambiguousDuplicates,
        status: "preview_ready",
        previewGeneratedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Error generating fleet migration preview:", err);
      return res.status(500).json({ error: err.message || "Failed to generate migration preview" });
    }
  });
}

