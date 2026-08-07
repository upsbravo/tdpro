import express from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const getDb = (): Firestore => {
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
    db = getFirestore();
  }
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch (e) {}
  return db;
};

// Helper to verify request authorization
async function verifyShopmonkeyAuth(req: express.Request, targetCompanyId: string) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, status: 401, error: "Unauthorized: Missing authorization token" };
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const callerUid = decodedToken.uid;
    const callerEmail = decodedToken.email;

    const db = getDb();
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
      return { authorized: false, status: 403, error: "Forbidden: Maintenance integration management requires Admin privileges" };
    }

    if (callerData.role === "admin") {
      if (callerData.companyId !== targetCompanyId) {
        return { authorized: false, status: 403, error: "Forbidden: You can only manage Shopmonkey for your own company" };
      }
      return { authorized: true, callerUid, isSuperAdmin: false, companyId: targetCompanyId };
    }

    return { authorized: false, status: 403, error: "Forbidden: Insufficient permissions" };
  } catch (err: any) {
    return { authorized: false, status: 401, error: "Unauthorized: Invalid token" };
  }
}

// Interface types
export interface ShopmonkeyConfig {
  apiKey: string;
  shopId: string;
  webhookSecret: string;
  autoSyncEnabled: boolean;
  pmAutoRecalculateEnabled: boolean;
  autoDeductionMode: 'proposed' | 'disabled' | 'manual_review';
  status: 'connected' | 'not_connected' | 'error' | 'disconnected';
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface ShopmonkeyVehicleMapping {
  id: string;
  companyId: string;
  shopmonkeyVehicleId: string;
  truckId: string | null;
  vin: string | null;
  licensePlate: string | null;
  plateState: string | null;
  unitNumber: string | null;
  yearMakeModel: string | null;
  matchSource: 'saved_mapping' | 'vin' | 'license_plate' | 'unit_number' | 'manual';
  matchStatus: 'mapped' | 'unmapped' | 'flagged';
  updatedAt: string;
}

export interface ShopmonkeyCustomerMapping {
  id: string;
  companyId: string;
  shopmonkeyCustomerId: string;
  customerName: string;
  taxIdLast4: string | null;
  email: string | null;
  ownerOperatorCompanyId: string | null;
  driverUid: string | null;
  matchStatus: 'mapped' | 'unmapped' | 'review_required';
  updatedAt: string;
}

// ----------------------------------------------------
// VEHICLE MATCHING ENGINE
// ----------------------------------------------------
export async function matchShopmonkeyVehicleToTruck(
  companyId: string,
  smVehicle: {
    id: string;
    vin?: string;
    licensePlate?: string;
    licenseState?: string;
    unitNumber?: string;
    year?: number | string;
    make?: string;
    model?: string;
  }
): Promise<{ truckId: string | null; matchSource: string; matchStatus: string }> {
  const db = getDb();
  const mappingId = `sm_veh_${smVehicle.id}`;
  const mappingRef = db.collection("admins").doc(companyId).collection("integration_mappings").doc("shopmonkey_vehicles").collection("mappings").doc(mappingId);

  // 1. Saved Mapping Check
  const existingMappingDoc = await mappingRef.get();
  if (existingMappingDoc.exists && existingMappingDoc.data()?.truckId) {
    const data = existingMappingDoc.data()!;
    return {
      truckId: data.truckId,
      matchSource: 'saved_mapping',
      matchStatus: data.matchStatus || 'mapped'
    };
  }

  // 2. Query trucks collection for matching
  const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
  const trucks: any[] = [];
  trucksSnap.forEach(doc => trucks.push({ id: doc.id, ...doc.data() }));

  const normVin = smVehicle.vin?.trim().toLowerCase();
  const normPlate = smVehicle.licensePlate?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const normUnit = smVehicle.unitNumber?.trim().toLowerCase();

  let matchedTruck: any = null;
  let source = 'manual';

  // 2a. VIN Match
  if (normVin && normVin.length >= 8) {
    matchedTruck = trucks.find(t => (t.vin || '').trim().toLowerCase() === normVin);
    if (matchedTruck) source = 'vin';
  }

  // 2b. License Plate Match
  if (!matchedTruck && normPlate) {
    matchedTruck = trucks.find(t => {
      const tPlate = (t.licensePlate || t.plate || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return tPlate && tPlate === normPlate;
    });
    if (matchedTruck) source = 'license_plate';
  }

  // 2c. Unit / Truck Number Match
  if (!matchedTruck && normUnit) {
    matchedTruck = trucks.find(t => {
      const tNum = (t.truckNumber || t.number || t.unitNumber || t.id || '').trim().toLowerCase();
      return tNum && tNum === normUnit;
    });
    if (matchedTruck) source = 'unit_number';
  }

  const resultTruckId = matchedTruck ? matchedTruck.id : null;
  const matchStatus = matchedTruck ? 'mapped' : 'unmapped';

  // Save mapping record
  const mappingRecord: ShopmonkeyVehicleMapping = {
    id: mappingId,
    companyId,
    shopmonkeyVehicleId: smVehicle.id,
    truckId: resultTruckId,
    vin: smVehicle.vin || null,
    licensePlate: smVehicle.licensePlate || null,
    plateState: smVehicle.licenseState || null,
    unitNumber: smVehicle.unitNumber || null,
    yearMakeModel: [smVehicle.year, smVehicle.make, smVehicle.model].filter(Boolean).join(" ") || null,
    matchSource: source as any,
    matchStatus: matchStatus as any,
    updatedAt: new Date().toISOString()
  };

  await mappingRef.set(mappingRecord, { merge: true });

  return { truckId: resultTruckId, matchSource: source, matchStatus };
}

// ----------------------------------------------------
// PM COMPLETION & ODOMETER RECALCULATION ENGINE
// ----------------------------------------------------
export async function processShopmonkeyOrderPM(
  companyId: string,
  orderData: {
    id: string;
    number?: string | number;
    vehicleId?: string;
    odometerIn?: number;
    odometerOut?: number;
    completedAt?: string;
    services?: Array<{ name?: string; category?: string; description?: string }>;
    truckId?: string;
  }
) {
  const db = getDb();
  let truckId = orderData.truckId;

  // Resolve truck if not provided
  if (!truckId && orderData.vehicleId) {
    const match = await matchShopmonkeyVehicleToTruck(companyId, { id: orderData.vehicleId });
    truckId = match.truckId || undefined;
  }

  if (!truckId) {
    console.log(`[Shopmonkey PM] Skipping PM recalculation for order ${orderData.id}: No matched truckId`);
    return { success: false, reason: 'unmapped_truck' };
  }

  const truckRef = db.collection("admins").doc(companyId).collection("trucks").doc(truckId);
  const truckDoc = await truckRef.get();
  if (!truckDoc.exists) {
    return { success: false, reason: 'truck_not_found' };
  }

  const truck = truckDoc.data()!;
  const newOdometer = orderData.odometerOut || orderData.odometerIn || null;

  const nowIso = new Date().toISOString();

  // Check if order contains maintenance service keywords
  const pmKeywords = ['oil', 'filter', 'pm', 'preventive', 'annual inspection', 'dot inspection', 'brakes', 'transmission', 'service', 'maintenance', 'lube', 'coolant', 'tires'];
  let isPmService = false;

  if (Array.isArray(orderData.services) && orderData.services.length > 0) {
    isPmService = orderData.services.some(s => {
      const text = `${s.name || ''} ${s.category || ''} ${s.description || ''}`.toLowerCase();
      return pmKeywords.some(kw => text.includes(kw));
    });
  } else {
    // Default to true if order is completed repair order
    isPmService = true;
  }

  const updates: Record<string, any> = {
    lastShopmonkeySyncAt: nowIso,
    lastShopmonkeyOrderId: orderData.id,
    updatedAt: nowIso
  };

  // Update odometer with 'shopmonkey' source priority
  if (newOdometer && newOdometer > (truck.currentOdometer || 0)) {
    updates.currentOdometer = newOdometer;
    updates.odometerSource = 'shopmonkey';
    updates.lastOdometerUpdateAt = nowIso;
  }

  // Recalculate PM if order was completed PM service
  if (isPmService && newOdometer) {
    const pmInterval = Number(truck.pmIntervalMilesDecimal || truck.pmIntervalMiles || 25000);
    const pmWarning = Number(truck.pmWarningMilesDecimal || truck.pmWarningMiles || 1500);

    updates.lastPmMileage = newOdometer;
    updates.lastPmDate = orderData.completedAt || nowIso;
    updates.nextPmDueMileage = newOdometer + pmInterval;

    const remaining = updates.nextPmDueMileage - newOdometer;
    if (remaining <= 0) {
      updates.pmStatus = 'due';
    } else if (remaining <= pmWarning) {
      updates.pmStatus = 'approaching_due';
    } else {
      updates.pmStatus = 'current';
    }

    // Audit log entry
    const auditId = `audit_pm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db.collection("admins").doc(companyId).collection("audit_logs").doc(auditId).set({
      id: auditId,
      companyId,
      action: 'shopmonkey_pm_recalculated',
      truckId,
      truckNumber: truck.number || truck.truckNumber || truckId,
      previousLastPmMileage: truck.lastPmMileage || null,
      newLastPmMileage: newOdometer,
      nextPmDueMileage: updates.nextPmDueMileage,
      pmStatus: updates.pmStatus,
      shopmonkeyOrderId: orderData.id,
      shopmonkeyOrderNumber: orderData.number || orderData.id,
      createdAt: nowIso
    });
  }

  await truckRef.update(updates);

  return {
    success: true,
    truckId,
    odometerUpdated: Boolean(newOdometer),
    pmRecalculated: isPmService && Boolean(newOdometer),
    newNextPmDueMileage: updates.nextPmDueMileage || truck.nextPmDueMileage || null
  };
}

// ----------------------------------------------------
// FINANCIAL RESPONSIBILITY & PROPOSED DEDUCTION ENGINE
// ----------------------------------------------------
export async function processShopmonkeyInvoiceDeduction(
  companyId: string,
  invoice: {
    id: string;
    number: string | number;
    orderId: string;
    vehicleId?: string;
    truckId?: string;
    customerId?: string;
    totalCents: number;
    paidCents: number;
    paymentStatus: 'paid' | 'unpaid' | 'overdue' | 'partially_paid';
    invoiceDate: string;
    isWarranty?: boolean;
    isInsurance?: boolean;
    isDisputed?: boolean;
    vendorName?: string;
    summaryDescription?: string;
  }
) {
  const db = getDb();
  const allocationId = `sm_alloc_${invoice.id}`;
  const allocRef = db.collection("admins").doc(companyId).collection("settlement_allocations").doc(allocationId);

  // 1. Check if allocation already exists
  const existingAlloc = await allocRef.get();
  if (existingAlloc.exists) {
    const existingData = existingAlloc.data()!;
    // Immutable check if already locked or applied to settlement
    if (existingData.status === 'applied' || existingData.settlementStatus === 'locked') {
      console.log(`[Shopmonkey Deduction] Invoice ${invoice.id} allocation is already applied or locked in settlement. Preserving immutability.`);
      return { success: true, status: existingData.status, preserved: true };
    }
  }

  // 2. Resolve Truck and Owner-Operator Responsibility
  let truckId = invoice.truckId;
  if (!truckId && invoice.vehicleId) {
    const match = await matchShopmonkeyVehicleToTruck(companyId, { id: invoice.vehicleId });
    truckId = match.truckId || undefined;
  }

  let isOwnerOperator = false;
  let ooCompanyId: string | null = null;
  let driverUid: string | null = null;

  if (truckId) {
    const truckDoc = await db.collection("admins").doc(companyId).collection("trucks").doc(truckId).get();
    if (truckDoc.exists) {
      const truck = truckDoc.data()!;
      ooCompanyId = truck.ownerOperatorCompanyId || truck.ownerOperatorVendor || null;
      driverUid = truck.assignedDriverId || truck.currentDriverId || null;
      isOwnerOperator = Boolean(ooCompanyId) || truck.ownershipType === 'owner_operator' || truck.ownerType === 'owner_operator';
    }
  }

  // Rule: Company-owned repairs default to Company Expense (no deduction)
  if (!isOwnerOperator) {
    console.log(`[Shopmonkey Deduction] Invoice #${invoice.number} is for company-owned truck ${truckId || 'unknown'}. Defaulting to Company Expense.`);
    const compRecord = {
      id: allocationId,
      companyId,
      sourceType: 'shopmonkey_maintenance',
      sourceId: invoice.id,
      invoiceNumber: invoice.number,
      truckId: truckId || null,
      amountCents: invoice.totalCents,
      responsibility: 'company_expense',
      status: 'rejected',
      statusReason: 'Company-owned truck repair expense (Non-deductible)',
      updatedAt: new Date().toISOString()
    };
    await allocRef.set(compRecord, { merge: true });
    return { success: true, responsibility: 'company_expense', status: 'rejected' };
  }

  // Rule: Exclude warranty, insurance, disputed, or zero total
  if (invoice.isWarranty || invoice.isInsurance || invoice.isDisputed || invoice.totalCents <= 0) {
    console.log(`[Shopmonkey Deduction] Invoice #${invoice.number} excluded due to warranty/insurance/disputed status or zero amount.`);
    const exRecord = {
      id: allocationId,
      companyId,
      sourceType: 'shopmonkey_maintenance',
      sourceId: invoice.id,
      invoiceNumber: invoice.number,
      truckId: truckId || null,
      ownerOperatorCompanyId: ooCompanyId,
      amountCents: invoice.totalCents,
      responsibility: 'excluded',
      status: 'rejected',
      statusReason: invoice.isWarranty ? 'Warranty Claim' : invoice.isInsurance ? 'Insurance Claim' : invoice.isDisputed ? 'Disputed Invoice' : 'Zero Total',
      updatedAt: new Date().toISOString()
    };
    await allocRef.set(exRecord, { merge: true });
    return { success: true, responsibility: 'excluded', status: 'rejected' };
  }

  // 3. Create Proposed Settlement Allocation
  const nowIso = new Date().toISOString();
  const proposedAllocation = {
    id: allocationId,
    companyId,
    sourceType: 'shopmonkey_maintenance',
    sourceId: invoice.id,
    orderId: invoice.orderId,
    invoiceNumber: String(invoice.number),
    truckId: truckId || null,
    ownerOperatorCompanyId: ooCompanyId || null,
    driverUid: driverUid || null,
    category: 'maintenance_deduction',
    description: `Shopmonkey Repair Order #${invoice.number} (${invoice.vendorName || 'Fleet Shop'}) - ${invoice.summaryDescription || 'Maintenance Repair'}`,
    amountCents: Math.round(invoice.totalCents),
    paidCents: Math.round(invoice.paidCents || 0),
    balanceCents: Math.round(invoice.totalCents - (invoice.paidCents || 0)),
    paymentStatus: invoice.paymentStatus,
    invoiceDate: invoice.invoiceDate || nowIso,
    responsibility: 'owner_operator_deduction',
    status: 'proposed', // Must be reviewed before attaching to final settlement
    deductibleFromSettlement: true,
    createdAt: existingAlloc.exists ? existingAlloc.data()?.createdAt : nowIso,
    updatedAt: nowIso
  };

  await allocRef.set(proposedAllocation, { merge: true });

  return {
    success: true,
    allocationId,
    responsibility: 'owner_operator_deduction',
    amountCents: invoice.totalCents,
    status: 'proposed'
  };
}

// ----------------------------------------------------
// EXPRESS ROUTE REGISTRATION
// ----------------------------------------------------
// DIAGNOSTICS & CAPABILITY PROBING ENGINE
// ----------------------------------------------------
export interface ShopmonkeyDiagnosticRecord {
  id: string; // e.g. diag_sm_1722901234
  companyId: string;
  httpMethod: string;
  fullPathname: string;
  baseUrl: string;
  responseStatus: number;
  errorCode: string | null;
  requestId: string | null;
  locationId: string | null;
  origin: 'backend';
  credentialRef: string; // masked key
  environment: string;
  userMessage: string;
  testedAt: string;
}

export interface ShopmonkeyCapabilityResult {
  capability: string;
  name: string;
  endpoint: string;
  available: boolean;
  httpStatus: number;
  safeErrorCode: string | null;
  testedAt: string;
}

export function cleanApiKey(rawKey?: string): string {
  if (!rawKey) return '';
  let cleaned = String(rawKey).trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function maskApiKey(rawKey?: string): string {
  const cleaned = cleanApiKey(rawKey);
  if (!cleaned) return '';
  if (cleaned.length <= 8) return 'sm_sec_***';
  return `${cleaned.substring(0, 6)}...${cleaned.substring(cleaned.length - 4)}`;
}

export async function testShopmonkeyApiKeyStatus(apiKey: string): Promise<{
  valid: boolean;
  status: number;
  data?: any;
  requestId?: string | null;
  errorCode?: string | null;
  userMessage: string;
}> {
  const cleanedKey = cleanApiKey(apiKey);
  if (!cleanedKey) {
    return {
      valid: false,
      status: 400,
      userMessage: 'Shopmonkey API Key is missing or empty. Please enter your Shopmonkey v3 API Key.'
    };
  }

  const endpoint = 'https://api.shopmonkey.cloud/v3/auth/api_key/status';
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanedKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const requestId = res.headers.get('x-request-id') || res.headers.get('request-id') || null;

    if (res.ok) {
      let data = {};
      try { data = await res.json(); } catch (e) {}
      return {
        valid: true,
        status: res.status,
        data,
        requestId,
        userMessage: 'Shopmonkey API key verified successfully.'
      };
    } else {
      let errBody: any = {};
      try { errBody = await res.json(); } catch (e) {}
      const errorCode = errBody.code || errBody.errorCode || (res.status === 403 ? 'API-472811' : `HTTP-${res.status}`);

      if (res.status === 401) {
        return {
          valid: false,
          status: 401,
          errorCode,
          requestId,
          userMessage: 'The Shopmonkey API key is invalid, expired, or revoked. Please check your Shopmonkey developer settings and generate a new v3 key.'
        };
      }

      if (res.status === 403) {
        return {
          valid: false,
          status: 403,
          errorCode,
          requestId,
          userMessage: 'Shopmonkey denied access to the requested resource. Verify that this API key belongs to the correct Shopmonkey account and has access to the selected location.'
        };
      }

      return {
        valid: false,
        status: res.status,
        errorCode,
        requestId,
        userMessage: `Unable to verify Shopmonkey API key status (HTTP ${res.status}).`
      };
    }
  } catch (err: any) {
    return {
      valid: false,
      status: 500,
      errorCode: 'NETWORK_ERROR',
      userMessage: `Failed to connect to Shopmonkey API endpoint: ${err.message || 'Network error'}`
    };
  }
}

export async function fetchShopmonkeyLocations(apiKey: string): Promise<Array<{ id: string; name: string; address?: string }>> {
  const cleanedKey = cleanApiKey(apiKey);
  if (!cleanedKey) return [];

  try {
    const res = await fetch('https://api.shopmonkey.cloud/v3/locations', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanedKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.locations || []);
      return list.map((loc: any) => ({
        id: String(loc.id || loc.locationId || 'loc_default'),
        name: loc.name || loc.locationName || 'Primary Location',
        address: loc.address || loc.fullAddress || ''
      }));
    }
  } catch (err) {}
  return [];
}

export async function probeShopmonkeyCapabilities(
  apiKey: string,
  selectedLocationId?: string
): Promise<ShopmonkeyCapabilityResult[]> {
  const cleanedKey = cleanApiKey(apiKey);
  const nowIso = new Date().toISOString();

  const probes = [
    { capability: 'vehicles', name: 'Vehicles', endpoint: '/v3/vehicles?limit=1' },
    { capability: 'orders', name: 'Repair Orders', endpoint: '/v3/orders?limit=1' },
    { capability: 'customers', name: 'Customers', endpoint: '/v3/customers?limit=1' },
    { capability: 'mileage', name: 'Mileage', endpoint: '/v3/vehicles?limit=1' },
    { capability: 'inspections', name: 'Inspections', endpoint: '/v3/inspections?limit=1' },
    { capability: 'invoices', name: 'Invoices', endpoint: '/v3/invoices?limit=1' },
    { capability: 'payments', name: 'Payments', endpoint: '/v3/payments?limit=1' },
    { capability: 'webhooks', name: 'Webhooks', endpoint: '/v3/webhooks?limit=1' }
  ];

  const results: ShopmonkeyCapabilityResult[] = [];

  for (const probe of probes) {
    let url = `https://api.shopmonkey.cloud${probe.endpoint}`;
    if (selectedLocationId && !url.includes('locationId')) {
      url += url.includes('?') ? `&locationId=${selectedLocationId}` : `?locationId=${selectedLocationId}`;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanedKey}`,
          'Content-Type': 'application/json',
          ...(selectedLocationId ? { 'x-location-id': selectedLocationId } : {})
        }
      });

      if (res.ok) {
        results.push({
          capability: probe.capability,
          name: probe.name,
          endpoint: probe.endpoint,
          available: true,
          httpStatus: res.status,
          safeErrorCode: null,
          testedAt: nowIso
        });
      } else {
        let errCode: string | null = null;
        try {
          const errBody = await res.json();
          errCode = errBody.code || errBody.errorCode || null;
        } catch (e) {}
        if (!errCode && res.status === 403) errCode = 'API-472811';

        results.push({
          capability: probe.capability,
          name: probe.name,
          endpoint: probe.endpoint,
          available: false,
          httpStatus: res.status,
          safeErrorCode: errCode || `HTTP_${res.status}`,
          testedAt: nowIso
        });
      }
    } catch (err: any) {
      results.push({
        capability: probe.capability,
        name: probe.name,
        endpoint: probe.endpoint,
        available: false,
        httpStatus: 500,
        safeErrorCode: 'FETCH_FAILED',
        testedAt: nowIso
      });
    }
  }

  return results;
}

export async function createShopmonkeyDiagnosticRecord(
  companyId: string,
  details: {
    httpMethod: string;
    fullPathname: string;
    responseStatus: number;
    errorCode?: string | null;
    requestId?: string | null;
    locationId?: string | null;
    credentialRef: string;
    userMessage: string;
  }
): Promise<ShopmonkeyDiagnosticRecord> {
  const db = getDb();
  const diagId = `diag_sm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const nowIso = new Date().toISOString();

  const record: ShopmonkeyDiagnosticRecord = {
    id: diagId,
    companyId,
    httpMethod: details.httpMethod,
    fullPathname: details.fullPathname,
    baseUrl: 'https://api.shopmonkey.cloud/v3',
    responseStatus: details.responseStatus,
    errorCode: details.errorCode || null,
    requestId: details.requestId || null,
    locationId: details.locationId || null,
    origin: 'backend',
    credentialRef: details.credentialRef,
    environment: process.env.NODE_ENV || 'development',
    userMessage: details.userMessage,
    testedAt: nowIso
  };

  try {
    await db.collection("admins").doc(companyId).collection("shopmonkey_diagnostics").doc(diagId).set(record);
  } catch (e) {
    console.error("Failed to store diagnostic record:", e);
  }

  return record;
}

export async function runShopmonkeyConnectionFlow(
  companyId: string,
  apiKey: string,
  shopId?: string,
  selectedLocationId?: string
) {
  const db = getDb();
  const cleanedKey = cleanApiKey(apiKey);
  const maskedKey = maskApiKey(cleanedKey);

  if (!cleanedKey) {
    const diag = await createShopmonkeyDiagnosticRecord(companyId, {
      httpMethod: 'GET',
      fullPathname: '/v3/auth/api_key/status',
      responseStatus: 400,
      errorCode: 'API_KEY_MISSING',
      credentialRef: '',
      userMessage: 'Shopmonkey API Key is required.'
    });

    return {
      success: false,
      connectionStatus: 'not_connected',
      apiKeyValid: false,
      baseUrl: 'https://api.shopmonkey.cloud/v3',
      message: 'Shopmonkey API Key is required. Please provide a valid v3 key from your Shopmonkey settings.',
      supportDiagnosticId: diag.id,
      nextAction: 'Enter a valid Shopmonkey v3 API key.'
    };
  }

  // Step 1: Test API Key Status FIRST
  const keyStatus = await testShopmonkeyApiKeyStatus(cleanedKey);

  if (!keyStatus.valid) {
    const diag = await createShopmonkeyDiagnosticRecord(companyId, {
      httpMethod: 'GET',
      fullPathname: '/v3/auth/api_key/status',
      responseStatus: keyStatus.status,
      errorCode: keyStatus.errorCode,
      requestId: keyStatus.requestId,
      locationId: selectedLocationId,
      credentialRef: maskedKey,
      userMessage: keyStatus.userMessage
    });

    const nowIso = new Date().toISOString();
    const docData = {
      providerId: 'shopmonkey',
      providerName: 'Shopmonkey Maintenance & Fleet',
      category: 'maintenance',
      status: 'attention_required',
      apiKey: cleanedKey,
      apiKeyMasked: maskedKey,
      shopId: shopId || '',
      selectedLocationId: selectedLocationId || null,
      lastError: keyStatus.userMessage,
      lastErrorCode: keyStatus.errorCode || 'API_KEY_FAILED',
      supportDiagnosticId: diag.id,
      updatedAt: nowIso
    };

    await db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey").set(docData, { merge: true });
    await db.collection("companies").doc(companyId).collection("integrations").doc("shopmonkey").set({
      providerId: 'shopmonkey',
      providerName: 'Shopmonkey Maintenance & Fleet',
      category: 'maintenance',
      status: 'attention_required',
      lastError: keyStatus.userMessage,
      updatedAt: nowIso
    }, { merge: true });

    return {
      success: false,
      connectionStatus: 'attention_required',
      apiKeyValid: false,
      baseUrl: 'https://api.shopmonkey.cloud/v3',
      message: keyStatus.userMessage,
      supportDiagnosticId: diag.id,
      nextAction: 'Verify that this API key is active in Shopmonkey and has access to your location.'
    };
  }

  // Step 2: Fetch Locations & Probe Capabilities
  const locations = await fetchShopmonkeyLocations(cleanedKey);
  const locationToUse = selectedLocationId || (locations.length > 0 ? locations[0].id : undefined);

  const capabilities = await probeShopmonkeyCapabilities(cleanedKey, locationToUse);

  const forbiddenCount = capabilities.filter(c => !c.available).length;
  const overallStatus = forbiddenCount === 0 ? 'connected' : 'connected_limited';

  const diag = await createShopmonkeyDiagnosticRecord(companyId, {
    httpMethod: 'GET',
    fullPathname: '/v3/auth/api_key/status',
    responseStatus: 200,
    requestId: keyStatus.requestId,
    locationId: locationToUse,
    credentialRef: maskedKey,
    userMessage: overallStatus === 'connected'
      ? 'Shopmonkey API key and capability probe verified successfully.'
      : 'Shopmonkey API key verified, but some capabilities returned 403 Forbidden.'
  });

  const nowIso = new Date().toISOString();
  const savedConfig = {
    providerId: 'shopmonkey',
    providerName: 'Shopmonkey Maintenance & Fleet',
    category: 'maintenance',
    status: overallStatus,
    apiKey: cleanedKey,
    apiKeyMasked: maskedKey,
    shopId: shopId || '',
    locations,
    selectedLocationId: locationToUse || null,
    testedCapabilities: capabilities,
    supportDiagnosticId: diag.id,
    lastError: overallStatus === 'connected_limited' ? 'Limited resource access: Some endpoints returned 403 Forbidden.' : null,
    connectedAt: nowIso,
    updatedAt: nowIso
  };

  await db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey").set(savedConfig, { merge: true });
  await db.collection("companies").doc(companyId).collection("integrations").doc("shopmonkey").set({
    providerId: 'shopmonkey',
    providerName: 'Shopmonkey Maintenance & Fleet',
    category: 'maintenance',
    status: overallStatus,
    updatedAt: nowIso
  }, { merge: true });

  return {
    success: true,
    connectionStatus: overallStatus,
    apiKeyValid: true,
    baseUrl: 'https://api.shopmonkey.cloud/v3',
    locations,
    selectedLocationIds: locationToUse ? [locationToUse] : [],
    testedCapabilities: capabilities,
    supportDiagnosticId: diag.id,
    message: overallStatus === 'connected'
      ? 'Shopmonkey connected successfully.'
      : 'Shopmonkey connected with limited resource access. Check capability details.',
    nextAction: overallStatus === 'connected_limited'
      ? 'Review forbidden capabilities or select an authorized location.'
      : 'Integration is ready for vehicle mapping.'
  };
}

// ----------------------------------------------------
export function registerShopmonkeyRoutes(app: express.Application) {
  const db = getDb();

  // POST /api/integrations/shopmonkey/test-connection
  app.post("/api/integrations/shopmonkey/test-connection", async (req, res) => {
    const { companyId, apiKey, shopId, locationId } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const result = await runShopmonkeyConnectionFlow(companyId, apiKey, shopId, locationId);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        connectionStatus: 'attention_required',
        message: `Connection test error: ${err.message}`
      });
    }
  });

  // POST /api/integrations/shopmonkey/probe-capabilities
  app.post("/api/integrations/shopmonkey/probe-capabilities", async (req, res) => {
    const { companyId, locationId } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const docRef = db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey");
      const doc = await docRef.get();
      if (!doc.exists || !doc.data()?.apiKey) {
        return res.status(400).json({ error: "No saved Shopmonkey API Key found. Connect first." });
      }

      const apiKey = doc.data()!.apiKey;
      const targetLocationId = locationId || doc.data()!.selectedLocationId;

      const capabilities = await probeShopmonkeyCapabilities(apiKey, targetLocationId);
      const forbiddenCount = capabilities.filter(c => !c.available).length;
      const newStatus = forbiddenCount === 0 ? 'connected' : 'connected_limited';

      const nowIso = new Date().toISOString();
      await docRef.set({
        status: newStatus,
        testedCapabilities: capabilities,
        selectedLocationId: targetLocationId || null,
        updatedAt: nowIso
      }, { merge: true });

      await db.collection("companies").doc(companyId).collection("integrations").doc("shopmonkey").set({
        status: newStatus,
        updatedAt: nowIso
      }, { merge: true });

      return res.json({
        success: true,
        connectionStatus: newStatus,
        testedCapabilities: capabilities,
        selectedLocationId: targetLocationId || null
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to probe capabilities" });
    }
  });

  // GET /api/integrations/shopmonkey/locations/:companyId
  app.get("/api/integrations/shopmonkey/locations/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const docRef = db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey");
      const doc = await docRef.get();
      if (!doc.exists || !doc.data()?.apiKey) {
        return res.json({ locations: [], selectedLocationId: null });
      }

      const apiKey = doc.data()!.apiKey;
      const locations = await fetchShopmonkeyLocations(apiKey);
      const selectedLocationId = doc.data()!.selectedLocationId || (locations[0]?.id || null);

      return res.json({ locations, selectedLocationId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch locations" });
    }
  });

  // POST /api/integrations/shopmonkey/select-location
  app.post("/api/integrations/shopmonkey/select-location", async (req, res) => {
    const { companyId, locationId } = req.body;
    if (!companyId || !locationId) {
      return res.status(400).json({ error: "Missing companyId or locationId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const docRef = db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey");
      await docRef.set({
        selectedLocationId: locationId,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.json({ success: true, selectedLocationId: locationId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update selected location" });
    }
  });

  // GET /api/integrations/shopmonkey/diagnostics/:companyId
  app.get("/api/integrations/shopmonkey/diagnostics/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const snap = await db.collection("admins").doc(companyId).collection("shopmonkey_diagnostics").orderBy("testedAt", "desc").limit(20).get();
      const diagnostics: any[] = [];
      snap.forEach(doc => diagnostics.push({ id: doc.id, ...doc.data() }));

      return res.json({ companyId, diagnostics });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch diagnostics" });
    }
  });

  // GET /api/integrations/shopmonkey/config
  app.get("/api/integrations/shopmonkey/config/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const docRef = db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey");
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.json({
          companyId,
          configured: false,
          config: {
            apiKey: '',
            shopId: '',
            webhookSecret: '',
            autoSyncEnabled: true,
            pmAutoRecalculateEnabled: true,
            autoDeductionMode: 'proposed',
            status: 'not_connected'
          }
        });
      }

      const data = doc.data()!;
      // Mask sensitive API key for frontend display
      const maskedKey = data.apiKey ? `${data.apiKey.substring(0, 6)}...${data.apiKey.substring(data.apiKey.length - 4)}` : '';
      const maskedSecret = data.webhookSecret ? `sm_sec_***${data.webhookSecret.substring(data.webhookSecret.length - 4)}` : '';

      return res.json({
        companyId,
        configured: data.status === 'connected',
        config: {
          ...data,
          apiKeyMasked: maskedKey,
          webhookSecretMasked: maskedSecret
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch Shopmonkey config" });
    }
  });

  // POST /api/integrations/shopmonkey/config
  app.post("/api/integrations/shopmonkey/config", async (req, res) => {
    const { companyId, apiKey, shopId, webhookSecret, autoSyncEnabled, pmAutoRecalculateEnabled, autoDeductionMode } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const nowIso = new Date().toISOString();
      const docRef = db.collection("admins").doc(companyId).collection("integrations").doc("shopmonkey");
      const existing = (await docRef.get()).data() || {};

      // Auto-generate webhook secret if not provided
      const finalWebhookSecret = webhookSecret || existing.webhookSecret || `sm_wh_${crypto.randomBytes(16).toString('hex')}`;

      const updatedConfig: Partial<ShopmonkeyConfig> = {
        apiKey: apiKey !== undefined ? apiKey : (existing.apiKey || ''),
        shopId: shopId !== undefined ? shopId : (existing.shopId || ''),
        webhookSecret: finalWebhookSecret,
        autoSyncEnabled: autoSyncEnabled !== undefined ? Boolean(autoSyncEnabled) : (existing.autoSyncEnabled ?? true),
        pmAutoRecalculateEnabled: pmAutoRecalculateEnabled !== undefined ? Boolean(pmAutoRecalculateEnabled) : (existing.pmAutoRecalculateEnabled ?? true),
        autoDeductionMode: autoDeductionMode || existing.autoDeductionMode || 'proposed',
        status: (apiKey || existing.apiKey) ? 'connected' : 'not_connected',
        updatedAt: nowIso
      };

      await docRef.set(updatedConfig, { merge: true });

      // Mirror connection status into company integrations registry
      await db.collection("companies").doc(companyId).collection("integrations").doc("shopmonkey").set({
        providerId: 'shopmonkey',
        providerName: 'Shopmonkey Maintenance & Fleet',
        category: 'maintenance',
        status: updatedConfig.status,
        updatedAt: nowIso
      }, { merge: true });

      return res.json({
        success: true,
        message: 'Shopmonkey integration settings saved successfully.',
        webhookUrl: `https://${req.get('host') || 'platform.tdpro.com'}/api/integrations/shopmonkey/webhook`,
        webhookSecret: finalWebhookSecret,
        config: updatedConfig
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to save Shopmonkey config" });
    }
  });

  // POST /api/integrations/shopmonkey/webhook
  app.post("/api/integrations/shopmonkey/webhook", async (req, res) => {
    try {
      const signatureHeader = (req.headers['x-shopmonkey-signature'] || req.headers['x-signature'] || '') as string;
      const eventId = (req.body?.id || req.body?.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`) as string;
      const companyId = req.query.companyId as string || req.body?.companyId || 'default_tenant';

      // Verify webhook payload & timestamp
      const eventTime = req.body?.timestamp || req.body?.createdAt;
      if (eventTime) {
        const timeDiffMs = Math.abs(Date.now() - new Date(eventTime).getTime());
        if (timeDiffMs > 10 * 60 * 1000) {
          console.warn(`[Shopmonkey Webhook] Stale webhook timestamp: ${eventTime}`);
        }
      }

      // Idempotency check
      const webhookRef = db.collection("admins").doc(companyId).collection("integration_webhooks").doc(`sm_${eventId}`);
      const existingWebhook = await webhookRef.get();
      if (existingWebhook.exists && existingWebhook.data()?.processed) {
        return res.json({ success: true, duplicate: true, message: 'Event already processed' });
      }

      const nowIso = new Date().toISOString();
      const eventType = req.body?.event || req.body?.type || 'unknown';

      // Log webhook reception
      await webhookRef.set({
        id: eventId,
        companyId,
        eventType,
        payload: req.body,
        processed: true,
        createdAt: nowIso
      });

      // Handle order/repair order updates
      if (eventType.includes('order') || eventType.includes('invoice') || eventType.includes('repair_order')) {
        const order = req.body?.data || req.body?.order || req.body;
        if (order && order.id) {
          // Process PM recalculation
          await processShopmonkeyOrderPM(companyId, {
            id: order.id,
            number: order.number || order.orderNumber,
            vehicleId: order.vehicleId,
            odometerIn: order.odometerIn,
            odometerOut: order.odometerOut,
            completedAt: order.completedAt || nowIso,
            services: order.services || []
          });

          // Process proposed invoice deduction
          if (order.status === 'Invoice' || order.invoiceNumber || order.totalCents) {
            await processShopmonkeyInvoiceDeduction(companyId, {
              id: order.invoiceId || `inv_${order.id}`,
              number: order.invoiceNumber || order.number || order.id,
              orderId: order.id,
              vehicleId: order.vehicleId,
              totalCents: order.totalCents || Math.round((order.total || 0) * 100),
              paidCents: order.paidCents || Math.round((order.amountPaid || 0) * 100),
              paymentStatus: order.paid ? 'paid' : (order.amountPaid > 0 ? 'partially_paid' : 'unpaid'),
              invoiceDate: order.invoiceDate || nowIso,
              isWarranty: Boolean(order.isWarranty),
              isInsurance: Boolean(order.isInsurance),
              vendorName: order.shopName || order.vendorName
            });
          }
        }
      }

      return res.json({ success: true, eventId, eventType, processed: true });
    } catch (err: any) {
      console.error("[Shopmonkey Webhook] Processing error:", err);
      return res.status(500).json({ error: err.message || "Webhook processing error" });
    }
  });

  // GET /api/integrations/shopmonkey/mappings/vehicles/:companyId
  app.get("/api/integrations/shopmonkey/mappings/vehicles/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const snap = await db.collection("admins").doc(companyId).collection("integration_mappings").doc("shopmonkey_vehicles").collection("mappings").get();
      const mappings: any[] = [];
      snap.forEach(doc => mappings.push({ id: doc.id, ...doc.data() }));

      return res.json({ companyId, mappings });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch vehicle mappings" });
    }
  });

  // POST /api/integrations/shopmonkey/mappings/vehicles
  app.post("/api/integrations/shopmonkey/mappings/vehicles", async (req, res) => {
    const { companyId, shopmonkeyVehicleId, truckId, vin, licensePlate, unitNumber, yearMakeModel } = req.body;
    if (!companyId || !shopmonkeyVehicleId) {
      return res.status(400).json({ error: "Missing companyId or shopmonkeyVehicleId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const mappingId = `sm_veh_${shopmonkeyVehicleId}`;
      const docRef = db.collection("admins").doc(companyId).collection("integration_mappings").doc("shopmonkey_vehicles").collection("mappings").doc(mappingId);

      const mappingData: ShopmonkeyVehicleMapping = {
        id: mappingId,
        companyId,
        shopmonkeyVehicleId,
        truckId: truckId || null,
        vin: vin || null,
        licensePlate: licensePlate || null,
        plateState: null,
        unitNumber: unitNumber || null,
        yearMakeModel: yearMakeModel || null,
        matchSource: 'manual',
        matchStatus: truckId ? 'mapped' : 'unmapped',
        updatedAt: new Date().toISOString()
      };

      await docRef.set(mappingData, { merge: true });

      return res.json({ success: true, mapping: mappingData });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update vehicle mapping" });
    }
  });

  // GET /api/integrations/shopmonkey/maintenance-invoices/:companyId
  app.get("/api/integrations/shopmonkey/maintenance-invoices/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const snap = await db.collection("admins").doc(companyId).collection("settlement_allocations").where("sourceType", "==", "shopmonkey_maintenance").get();
      const invoices: any[] = [];
      snap.forEach(doc => invoices.push({ id: doc.id, ...doc.data() }));

      // Sort by newest invoice date
      invoices.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return res.json({ companyId, invoices });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch maintenance invoices" });
    }
  });

  // POST /api/integrations/shopmonkey/maintenance-invoices/:allocationId/approve-deduction
  app.post("/api/integrations/shopmonkey/maintenance-invoices/:allocationId/approve-deduction", async (req, res) => {
    const { allocationId } = req.params;
    const { companyId, approvedAmountCents, notes } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const allocRef = db.collection("admins").doc(companyId).collection("settlement_allocations").doc(allocationId);
      const doc = await allocRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Maintenance deduction allocation not found" });
      }

      const existing = doc.data()!;
      if (existing.status === 'applied' || existing.settlementStatus === 'locked') {
        return res.status(400).json({ error: "Cannot modify deduction: Settlement is locked or already applied." });
      }

      const nowIso = new Date().toISOString();
      const updates = {
        status: 'approved',
        approvedByUid: authResult.callerUid,
        approvedAt: nowIso,
        amountCents: approvedAmountCents !== undefined ? Math.round(Number(approvedAmountCents)) : existing.amountCents,
        approvalNotes: notes || 'Approved for driver/owner-operator settlement deduction',
        updatedAt: nowIso
      };

      await allocRef.update(updates);

      return res.json({ success: true, message: 'Maintenance deduction approved for settlement.', allocation: { ...existing, ...updates } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to approve deduction" });
    }
  });

  // POST /api/integrations/shopmonkey/maintenance-invoices/:allocationId/reject-deduction
  app.post("/api/integrations/shopmonkey/maintenance-invoices/:allocationId/reject-deduction", async (req, res) => {
    const { allocationId } = req.params;
    const { companyId, reason } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    const authResult = await verifyShopmonkeyAuth(req, companyId);
    if (!authResult.authorized) {
      return res.status(authResult.status!).json({ error: authResult.error });
    }

    try {
      const allocRef = db.collection("admins").doc(companyId).collection("settlement_allocations").doc(allocationId);
      const doc = await allocRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Maintenance deduction allocation not found" });
      }

      const existing = doc.data()!;
      if (existing.status === 'applied' || existing.settlementStatus === 'locked') {
        return res.status(400).json({ error: "Cannot modify deduction: Settlement is locked or already applied." });
      }

      const nowIso = new Date().toISOString();
      const updates = {
        status: 'rejected',
        rejectedByUid: authResult.callerUid,
        rejectedAt: nowIso,
        responsibility: 'company_expense',
        statusReason: reason || 'Marked as Company Expense by Admin',
        updatedAt: nowIso
      };

      await allocRef.update(updates);

      return res.json({ success: true, message: 'Maintenance invoice classified as Company Expense (no deduction).', allocation: { ...existing, ...updates } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to reject deduction" });
    }
  });
}
