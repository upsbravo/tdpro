import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import PDFDocument from "pdfkit";

function sanitizeText(str: string | null | undefined): string {
  if (!str) return "";
  let text = String(str).trim();
  // Clean up malformed import parser artifacts like "SWEET SEASONSm" or "Centerww"
  text = text.replace(/([A-Z]{2,})([a-z]{1,2})$/g, "$1");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/[\x00-\x1F\x7F]/g, "");
  return text;
}

async function getCompanyProfileData(db: any, companyId: string) {
  try {
    const compDoc = await db.collection("companies").doc(companyId).get();
    if (compDoc.exists) {
      return compDoc.data();
    }
    const adminDoc = await db.collection("admins").doc(companyId).get();
    if (adminDoc.exists) {
      return adminDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch company profile data:", err);
  }
  return null;
}

function resolveSettlementLineDescription(lineItem: any, loadsMap: Map<string, any>): { description: string; type: "earning" | "deduction" | "reimbursement"; category: string } {
  const sourceType = lineItem.sourceType || (lineItem.loadId ? 'load' : 'manual');
  const catLower = (lineItem.category || '').toLowerCase();

  // 1. Load Linehaul / Base Pay / Earnings
  if (sourceType === 'load' || catLower.includes('linehaul') || catLower.includes('base pay') || lineItem.type === 'earning' || lineItem.loadId) {
    const targetLoadId = lineItem.sourceId || lineItem.loadId;
    const load = targetLoadId ? loadsMap.get(targetLoadId) : null;
    let desc = "";
    if (load) {
      const loadNum = load.loadNumber || targetLoadId;
      const routeStr = load.origin && load.destination && load.origin !== 'N/A' && load.destination !== 'N/A' ? `${load.origin} to ${load.destination}` : 'route information unavailable';
      const custStr = load.customerName ? `${load.customerName} — ` : '';
      desc = `Load #${loadNum} — ${custStr}${routeStr}`;
    } else if (targetLoadId) {
      desc = `Load #${targetLoadId} — route information unavailable`;
    } else if (lineItem.description && !lineItem.description.toLowerCase().includes('standard adjustment')) {
      desc = lineItem.description;
    } else {
      desc = `Load Earning — route information unavailable`;
    }
    return {
      type: "earning",
      category: "linehaul",
      description: sanitizeText(desc)
    };
  }

  // 2. Fuel Transactions / Deductions / Reimbursements
  if (sourceType === 'fuel' || sourceType === 'fuel_transaction' || catLower.includes('fuel') || catLower.includes('diesel') || catLower.includes('def')) {
    const isReimb = lineItem.type === 'reimbursement' || catLower.includes('reimbursement');
    let desc = lineItem.description || 'Fuel Expense';
    return {
      type: isReimb ? "reimbursement" : "deduction",
      category: isReimb ? "fuel_reimbursement" : (catLower.includes('def') ? "def" : (catLower.includes('reefer') ? "reefer_fuel" : "diesel_fuel")),
      description: sanitizeText(desc)
    };
  }

  // 3. Advances / Comchecks
  if (sourceType === 'advance' || catLower.includes('advance') || catLower.includes('comcheck')) {
    let desc = lineItem.description;
    if (!desc || desc.toLowerCase().includes('standard adjustment')) {
      const checkNum = lineItem.checkNumber || lineItem.sourceId || 'ADV';
      desc = `Comcheck #${checkNum} repayment`;
    }
    return {
      type: "deduction",
      category: "advance_comcheck_repayment",
      description: sanitizeText(desc)
    };
  }

  // 4. Dispatch Fees
  if (sourceType === 'dispatch_fee' || catLower.includes('dispatch fee')) {
    const feePct = lineItem.percentageBasisPoints ? (lineItem.percentageBasisPoints / 100).toFixed(2) : '7.00';
    return {
      type: "deduction",
      category: "dispatch_fee",
      description: `Dispatch Fee — ${feePct}% of gross revenue`
    };
  }

  // 5. Insurance
  if (catLower.includes('insurance')) {
    return {
      type: "deduction",
      category: "insurance",
      description: sanitizeText(lineItem.description) || "Weekly insurance deduction"
    };
  }

  // 6. Escrow
  if (catLower.includes('escrow')) {
    return {
      type: "deduction",
      category: "escrow",
      description: sanitizeText(lineItem.description) || "Escrow contribution"
    };
  }

  // 7. Manual Adjustments / Generic Items
  const isDeduct = lineItem.type === 'deduction' || lineItem.amountCents < 0;
  const isReimb = lineItem.type === 'reimbursement';
  const resolvedType = isReimb ? "reimbursement" : (isDeduct ? "deduction" : "earning");
  let desc = lineItem.description || (sourceType === 'manual_adjustment' ? 'Manual Adjustment' : 'Standard adjustment');

  return {
    type: resolvedType,
    category: lineItem.category || (isDeduct ? "deduction" : "earning"),
    description: sanitizeText(desc)
  };
}

function getUniquePoNumber(idOrNum: string, savedPoNumber?: string | null): string {
  if (savedPoNumber && savedPoNumber.trim()) {
    const trimmed = savedPoNumber.trim();
    return trimmed.startsWith("PO") || trimmed.startsWith("#") ? trimmed : `PO #${trimmed}`;
  }
  let hash = 0;
  for (let i = 0; i < (idOrNum || "").length; i++) {
    hash = (hash << 5) - hash + idOrNum.charCodeAt(i);
    hash |= 0;
  }
  const uniqueNum = 100000 + (Math.abs(hash) % 899999);
  return `PO #${uniqueNum}`;
}

export async function checkLoadSettlementEligibility({
  companyId,
  loadId,
  proposedSettlementId,
  dbOverride
}: {
  companyId: string;
  loadId: string;
  proposedSettlementId?: string | null;
  dbOverride?: any;
}): Promise<{
  eligible: boolean;
  restrictionLevel: "none" | "warning" | "approval_required" | "hard_block";
  existingAllocations: any[];
  existingSettlements: any[];
  blockingReasons: string[];
  allowedCorrectionActions: string[];
}> {
  const db = dbOverride || getFirestoreDb();
  const blockingReasons: string[] = [];
  const existingSettlements: any[] = [];
  const existingAllocations: any[] = [];

  let restrictionLevel: "none" | "warning" | "approval_required" | "hard_block" = "none";

  // 1. Fetch load record
  const loadDocRef = db.collection("admins").doc(companyId).collection("loads").doc(loadId);
  const loadSnap = await loadDocRef.get();
  if (!loadSnap.exists) {
    return {
      eligible: false,
      restrictionLevel: "hard_block",
      existingAllocations: [],
      existingSettlements: [],
      blockingReasons: [`Load ${loadId} does not exist in company ${companyId}`],
      allowedCorrectionActions: ["cancel"]
    };
  }
  const loadData = loadSnap.data()!;
  const loadNumber = loadData.loadNumber || loadData.referenceNumber || loadId;

  // 2. Query settlement_allocations for sourceType='load' and sourceId=loadId
  try {
    const allocSnap = await db.collection("admins").doc(companyId).collection("settlement_allocations")
      .where("sourceType", "==", "load")
      .where("sourceId", "==", loadId)
      .get();

    allocSnap.forEach((doc: any) => {
      const data = doc.data();
      if (data.status !== "reversed") {
        existingAllocations.push({ id: doc.id, ...data });
      }
    });
  } catch (_) {}

  // 3. Query all settlements in company to check if this loadId is present
  const setSnap = await db.collection("admins").doc(companyId).collection("settlements").get();
  setSnap.forEach((doc: any) => {
    if (doc.id === proposedSettlementId) return; // Skip current draft being edited

    const set = doc.data();
    if (set.status === "void" || set.status === "deleted" || set.status === "reversed") return;

    let isIncluded = false;
    if (set.loadId === loadId) isIncluded = true;
    if (Array.isArray(set.loadIds) && set.loadIds.includes(loadId)) isIncluded = true;
    if (Array.isArray(set.includedLoadIds) && set.includedLoadIds.includes(loadId)) isIncluded = true;
    if (Array.isArray(set.lineItems) && set.lineItems.some((li: any) => li.loadId === loadId || (li.sourceType === "load" && li.sourceId === loadId))) isIncluded = true;

    if (isIncluded) {
      existingSettlements.push({
        id: doc.id,
        statementNumber: set.statementNumber || set.settlementNumber || doc.id,
        poNumber: set.poNumber || null,
        status: set.status || "draft",
        paymentStatus: set.paymentStatus || "unpaid",
        driverId: set.driverId || null,
        driverName: set.driverName || "N/A",
        netPayCents: set.netPayCents || set.netSettlementCents || 0,
        approvedAt: set.approvedAt || null,
        lockedAt: set.lockedAt || null,
        paidAt: set.paidAt || null,
        syncedAt: set.syncedAt || null
      });
    }
  });

  // Evaluate restriction levels based on existing settlements
  for (const st of existingSettlements) {
    const stStatus = (st.status || "draft").toLowerCase();
    const stNum = st.statementNumber || st.id;

    if (["approved", "locked", "synced", "paid"].includes(stStatus) || st.paymentStatus === "paid") {
      restrictionLevel = "hard_block";
      const paidDate = st.paidAt ? new Date(st.paidAt).toLocaleDateString() : (st.approvedAt ? new Date(st.approvedAt).toLocaleDateString() : "prior date");
      blockingReasons.push(
        `Load #${loadNumber} is ALREADY included in Statement #${stNum} (Status: ${stStatus.toUpperCase()}, Paid/Locked: ${paidDate}). Re-settling this load would create duplicate driver pay and illegal accounting records.`
      );
    } else if (stStatus === "reviewed" && restrictionLevel !== "hard_block") {
      restrictionLevel = "approval_required";
      blockingReasons.push(
        `Load #${loadNumber} is included in Statement #${stNum} which has passed initial review. Reopening requires accounting authorization.`
      );
    } else if (stStatus === "draft" && restrictionLevel === "none") {
      restrictionLevel = "warning";
      blockingReasons.push(
        `Load #${loadNumber} is currently attached to Draft Statement #${stNum}. It will be transferred if saved.`
      );
    }
  }

  // Also check if load document itself has settlementStatus === 'settled' but no active settlement found
  if (loadData.settlementStatus === "settled" && existingSettlements.length === 0) {
    restrictionLevel = "warning";
    blockingReasons.push(`Load #${loadNumber} is marked as settled in dispatch logs, but no active settlement statement was linked.`);
  }

  let allowedCorrectionActions: string[] = [];
  if (restrictionLevel === "hard_block") {
    allowedCorrectionActions = ["view_existing_statement", "create_adjustment", "request_review", "cancel"];
  } else if (restrictionLevel === "approval_required") {
    allowedCorrectionActions = ["view_existing_statement", "request_review", "remove_from_statement", "cancel"];
  } else if (restrictionLevel === "warning") {
    allowedCorrectionActions = ["transfer_from_draft", "remove_from_draft", "proceed_with_warning", "cancel"];
  } else {
    allowedCorrectionActions = ["proceed"];
  }

  return {
    eligible: restrictionLevel === "none" || restrictionLevel === "warning",
    restrictionLevel,
    existingAllocations,
    existingSettlements,
    blockingReasons,
    allowedCorrectionActions
  };
}

export function checkFuelAllocationEligibility({
  fuelTransaction,
  compProfile,
  payeeType
}: {
  fuelTransaction: any;
  compProfile?: any;
  payeeType?: string;
}): {
  classification: "company_expense" | "owner_operator_deduction" | "driver_deduction" | "reimbursement" | "ifta_only" | "excluded";
  isDeductible: boolean;
  reason: string;
} {
  const isOO = payeeType === 'owner_operator' || compProfile?.workerType === 'owner_operator';
  const deductActual = compProfile?.deductActualFuel !== false;

  if (fuelTransaction.reimbursementRequested || fuelTransaction.type === 'reimbursement') {
    return {
      classification: "reimbursement",
      isDeductible: false,
      reason: "Fuel expense eligible for driver reimbursement"
    };
  }

  if (isOO && deductActual) {
    return {
      classification: "owner_operator_deduction",
      isDeductible: true,
      reason: "Owner-operator authorized fuel deduction"
    };
  }

  if (!isOO) {
    return {
      classification: "company_expense",
      isDeductible: false,
      reason: "Company driver fuel expense paid by carrier (company expense)"
    };
  }

  return {
    classification: "excluded",
    isDeductible: false,
    reason: "Fuel transaction excluded based on compensation profile rules"
  };
}

export function consolidateFuelTransactions({
  fuelItems,
  groupingOption = "product_and_trip"
}: {
  fuelItems: any[];
  groupingOption?: "product" | "product_and_trip" | "product_and_truck";
}): {
  summaryLines: Array<{
    summaryKey: string;
    productType: "diesel" | "def" | "reefer" | "fees" | "other";
    description: string;
    transactionCount: number;
    quantityDecimal: number;
    amountCents: number;
    underlyingFuelTransactionIds: string[];
    underlyingProductLineIds: string[];
    underlyingAllocationIds: string[];
  }>;
  itemizedDetails: any[];
} {
  const groupsMap = new Map<string, any>();
  const itemizedDetails: any[] = [];

  (fuelItems || []).forEach(item => {
    const rawCategory = (item.category || item.productType || item.description || "").toLowerCase();
    let productType: "diesel" | "def" | "reefer" | "fees" | "other" = "diesel";

    if (rawCategory.includes("def")) {
      productType = "def";
    } else if (rawCategory.includes("reefer")) {
      productType = "reefer";
    } else if (rawCategory.includes("fee") || rawCategory.includes("card")) {
      productType = "fees";
    } else if (rawCategory.includes("diesel") || rawCategory.includes("fuel")) {
      productType = "diesel";
    } else {
      productType = "other";
    }

    const prodLabel = productType === "diesel" ? "Diesel Fuel"
      : productType === "def" ? "DEF"
      : productType === "reefer" ? "Reefer Fuel"
      : productType === "fees" ? "Fuel Card Fees"
      : "Other Fuel / Fluids";

    const loadRef = item.loadNumber ? `Load #${item.loadNumber}` : (item.loadId ? `Load #${item.loadId.slice(-6).toUpperCase()}` : "Unassigned Trip");
    const truckRef = item.truckNumber ? `Unit ${item.truckNumber}` : "Unassigned Truck";

    let groupKey = "";
    let desc = "";

    if (groupingOption === "product_and_trip") {
      groupKey = `${productType}_trip_${item.loadId || item.loadNumber || 'no_trip'}`;
      desc = item.loadId || item.loadNumber ? `${prodLabel} — ${loadRef}` : `${prodLabel} (Unassigned Trip)`;
    } else if (groupingOption === "product_and_truck") {
      groupKey = `${productType}_truck_${item.truckNumber || item.truckId || 'no_truck'}`;
      desc = item.truckNumber || item.truckId ? `${prodLabel} — ${truckRef}` : `${prodLabel} (Fleet General)`;
    } else {
      groupKey = productType;
      desc = prodLabel;
    }

    const qty = Number(item.quantityDecimal || item.gallons || item.quantity || 0);
    const amt = Math.round(Number(item.amountCents || (item.totalAmount ? item.totalAmount * 100 : 0)));
    const txId = item.sourceId || item.fuelTransactionId || item.id || `tx_${Math.random()}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        summaryKey: groupKey,
        productType,
        description: desc,
        transactionCount: 0,
        quantityDecimal: 0,
        amountCents: 0,
        underlyingFuelTransactionIds: [],
        underlyingProductLineIds: [],
        underlyingAllocationIds: []
      });
    }

    const grp = groupsMap.get(groupKey)!;
    grp.transactionCount += 1;
    grp.quantityDecimal += qty;
    grp.amountCents += amt;

    if (txId && !grp.underlyingFuelTransactionIds.includes(txId)) {
      grp.underlyingFuelTransactionIds.push(txId);
    }
    if (item.productLineId && !grp.underlyingProductLineIds.includes(item.productLineId)) {
      grp.underlyingProductLineIds.push(item.productLineId);
    }
    if (item.allocationId && !grp.underlyingAllocationIds.includes(item.allocationId)) {
      grp.underlyingAllocationIds.push(item.allocationId);
    }

    itemizedDetails.push({
      id: txId,
      transactionDate: item.transactionDate || item.date || item.createdAt || new Date().toISOString().split('T')[0],
      provider: item.provider || item.vendor || 'Fuel Card Integration',
      cardNumberMasked: item.cardNumberMasked || (item.cardLast4 ? `**** **** **** ${item.cardLast4}` : 'N/A'),
      merchantName: item.merchantName || item.locationName || item.station || 'Fuel Station',
      cityState: item.cityState || [item.city, item.state].filter(Boolean).join(', ') || 'N/A',
      truckNumber: item.truckNumber || 'N/A',
      driverName: item.driverName || 'N/A',
      loadNumber: item.loadNumber || 'N/A',
      productType,
      productLabel: prodLabel,
      gallons: qty,
      unitPriceCents: Math.round(Number(item.unitPriceCents || (qty > 0 ? amt / qty : 0))),
      grossAmountCents: Math.round(Number(item.grossAmountCents || amt)),
      discountCents: Math.round(Number(item.discountCents || 0)),
      netAmountCents: amt,
      receiptUrl: item.receiptUrl || null,
      receiptStatus: item.receiptUrl ? 'attached' : 'pending'
    });
  });

  const summaryLines = Array.from(groupsMap.values()).map(g => ({
    ...g,
    quantityDecimal: Number(g.quantityDecimal.toFixed(3))
  }));

  return { summaryLines, itemizedDetails };
}

export async function buildSettlementStatementViewModel({
  companyId,
  settlementId,
  dbOverride
}: {
  companyId: string;
  settlementId: string;
  dbOverride?: any;
}) {
  const db = dbOverride || getFirestoreDb();
  const setDocRef = db.collection("admins").doc(companyId).collection("settlements").doc(settlementId);
  const snap = await setDocRef.get();

  if (!snap.exists) {
    throw new Error(`Settlement ${settlementId} not found`);
  }

  const set = snap.data()!;

  // 1. Company Profile Data
  const companyProfile = await getCompanyProfileData(db, companyId);
  const company = {
    legalName: sanitizeText(companyProfile?.legalName || companyProfile?.companyName || companyProfile?.name || "LOGISTICS & FREIGHT CARRIER"),
    dbaName: companyProfile?.dbaName ? sanitizeText(companyProfile.dbaName) : null,
    logoUrl: companyProfile?.logoUrl || null,
    address: sanitizeText(companyProfile?.address || [companyProfile?.street, companyProfile?.city, companyProfile?.state, companyProfile?.zip].filter(Boolean).join(", ") || "Address on file"),
    phone: sanitizeText(companyProfile?.phone || companyProfile?.phoneNumber || "N/A"),
    email: sanitizeText(companyProfile?.email || "N/A"),
    website: companyProfile?.website || null,
    dotNumber: companyProfile?.usdotNumber || companyProfile?.dotNumber || null,
    mcNumber: companyProfile?.mcNumber || null
  };

  // Fetch tenant settings for fuelStatementGrouping
  const fuelStatementGrouping: "product" | "product_and_trip" | "product_and_truck" =
    companyProfile?.fuelStatementGrouping || set.fuelStatementGrouping || "product_and_trip";

  // 2. Fetch Subcollection line_items
  const lineSnap = await setDocRef.collection("line_items").get();
  const lineItemsList: any[] = [];
  lineSnap.forEach(doc => lineItemsList.push({ ...doc.data(), id: doc.id }));

  if (Array.isArray(set.lineItems)) {
    set.lineItems.forEach((li: any) => {
      if (li && li.id && !lineItemsList.some(existing => existing.id === li.id)) {
        lineItemsList.push(li);
      }
    });
  }

  // 3. Collect Included Load IDs
  const loadIdSet = new Set<string>();
  if (set.includedLoadIds && Array.isArray(set.includedLoadIds)) {
    set.includedLoadIds.forEach((id: string) => id && loadIdSet.add(id));
  }
  if (set.loadIds && Array.isArray(set.loadIds)) {
    set.loadIds.forEach((id: string) => id && loadIdSet.add(id));
  }
  if (set.loadId && typeof set.loadId === 'string') {
    loadIdSet.add(set.loadId);
  }
  lineItemsList.forEach((li: any) => {
    if (li.loadId) loadIdSet.add(li.loadId);
    if (li.sourceType === 'load' && li.sourceId) loadIdSet.add(li.sourceId);
  });

  // 4. Fetch All Included Loads with COMPLETE summaries
  const loadsMap = new Map<string, any>();
  const loadsList: any[] = [];

  for (const lId of Array.from(loadIdSet)) {
    const lDoc = await db.collection("admins").doc(companyId).collection("loads").doc(lId).get();
    if (lDoc.exists) {
      const lData = lDoc.data()!;
      const loadedMi = typeof lData.loadedMiles === 'number' ? lData.loadedMiles : (typeof lData.miles === 'number' ? lData.miles : null);
      const emptyMi = typeof lData.emptyMiles === 'number' ? lData.emptyMiles : null;
      const totalMi = (loadedMi !== null || emptyMi !== null) ? ((loadedMi || 0) + (emptyMi || 0)) : null;

      const loadObj = {
        loadId: lDoc.id,
        loadNumber: sanitizeText(lData.loadNumber || lData.referenceNumber || lDoc.id),
        poReferenceNumber: sanitizeText(lData.poNumber || lData.poReferenceNumber || lData.referenceNumber || lData.bolNumber || null),
        pickupDate: lData.pickupDate || lData.pickupDateIso || lData.pickup_date || null,
        deliveryDate: lData.deliveryDate || lData.deliveryDateIso || lData.delivery_date || null,
        originCity: sanitizeText(lData.originCity || (lData.origin ? lData.origin.split(',')[0] : null)),
        originState: sanitizeText(lData.originState || (lData.origin && lData.origin.includes(',') ? lData.origin.split(',')[1] : null)),
        destinationCity: sanitizeText(lData.destinationCity || (lData.destination ? lData.destination.split(',')[0] : null)),
        destinationState: sanitizeText(lData.destinationState || (lData.destination && lData.destination.includes(',') ? lData.destination.split(',')[1] : null)),
        origin: sanitizeText(lData.origin || [lData.originCity, lData.originState].filter(Boolean).join(', ') || 'N/A'),
        destination: sanitizeText(lData.destination || [lData.destinationCity, lData.destinationState].filter(Boolean).join(', ') || 'N/A'),
        customerName: sanitizeText(lData.customerName || lData.customer || lData.brokerName || lData.shipper || 'N/A'),
        brokerName: sanitizeText(lData.brokerName || lData.broker || null),
        driverId: lData.driverId || set.driverId || null,
        driverNameSnapshot: sanitizeText(lData.driverName || set.driverName || 'Assigned Driver'),
        truckId: lData.truckId || set.truckId || null,
        truckNumberSnapshot: sanitizeText(lData.truckNumber || set.truckNumber || 'Default Truck'),
        loadedMilesDecimal: loadedMi,
        emptyMilesDecimal: emptyMi,
        totalMilesDecimal: totalMi,
        grossRevenueCents: Math.round(Number(lData.grossRevenueCents || lData.rateCents || lData.grossPayCents || (lData.rate ? lData.rate * 100 : 0))),
        driverPayCents: Math.round(Number(lData.driverPayCents || lData.payCents || (lData.driverPay ? lData.driverPay * 100 : 0))),
        ownerOperatorPayCents: Math.round(Number(lData.ownerOperatorPayCents || lData.ooPayCents || 0)),
        compensationMethod: lData.compensationMethod || 'percentage_or_rate',
        compensationRateSnapshot: lData.compensationRateSnapshot || null
      };
      loadsMap.set(lDoc.id, loadObj);
      loadsList.push(loadObj);
    }
  }

  loadsList.sort((a, b) => {
    const da = a.pickupDate || a.deliveryDate || '';
    const db = b.pickupDate || b.deliveryDate || '';
    return da.localeCompare(db);
  });

  // 5. Determine Settlement Period
  let periodStart = set.periodStart || set.settlementPeriodStart || set.periodStartDate || null;
  let periodEnd = set.periodEnd || set.settlementPeriodEnd || set.periodEndDate || null;

  if (!periodStart || !periodEnd) {
    const dates = loadsList.map(l => l.pickupDate || l.deliveryDate).filter(Boolean);
    if (dates.length > 0) {
      dates.sort();
      if (!periodStart) periodStart = dates[0];
      if (!periodEnd) periodEnd = dates[dates.length - 1];
    }
  }
  if (!periodStart) {
    periodStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  }
  if (!periodEnd) {
    periodEnd = new Date().toISOString().split('T')[0];
  }

  // 6. Resolve Payee Information
  const targetDriverUid = set.driverId || set.workerId || set.ownerOperatorId;
  let driverDocData: any = null;
  if (targetDriverUid) {
    try {
      const dDoc = await db.collection("admins").doc(companyId).collection("drivers").doc(targetDriverUid).get();
      if (dDoc.exists) driverDocData = dDoc.data();
    } catch (_) {}
  }

  let ownerOpDocData: any = null;
  if (set.ownerOperatorCompanyId) {
    try {
      const ooDoc = await db.collection("admins").doc(companyId).collection("owner_operators").doc(set.ownerOperatorCompanyId).get();
      if (ooDoc.exists) ownerOpDocData = ooDoc.data();
    } catch (_) {}
  }

  const payeeType = set.settlementType === 'owner_operator' || set.workerType === 'owner_operator' || set.ownerOperatorCompanyId ? 'owner_operator' : 'driver';

  const payee = {
    payeeType,
    payeeId: targetDriverUid || '',
    legalName: sanitizeText(set.driverName || set.ownerOperatorName || driverDocData?.name || ownerOpDocData?.companyName || 'Assigned Driver'),
    contactName: sanitizeText(driverDocData?.name || ownerOpDocData?.contactName || set.driverName || 'N/A'),
    email: sanitizeText(set.driverEmail || driverDocData?.email || ownerOpDocData?.email || 'N/A'),
    phone: sanitizeText(set.driverPhone || driverDocData?.phone || driverDocData?.phoneNumber || ownerOpDocData?.phone || 'N/A'),
    vendorId: set.ownerOperatorCompanyId || ownerOpDocData?.id || null,
    quickBooksVendorId: set.quickBooksVendorId || null
  };

  // 7. Equipment & Fleet Breakdown
  const trucksMap = new Map<string, any>();
  loadsList.forEach(l => {
    const tNum = l.truckNumberSnapshot || set.truckNumber || driverDocData?.truckNumber || 'Default Truck';
    if (!trucksMap.has(tNum)) {
      trucksMap.set(tNum, {
        truckId: l.truckId || set.truckId || `TRK-${tNum}`,
        truckNumber: tNum,
        driverId: l.driverId || payee.payeeId,
        driverName: l.driverNameSnapshot || payee.legalName,
        trailerId: set.trailerNumber || '',
        trailerNumber: set.trailerNumber || 'N/A',
        ownerOperatorCompanyId: payee.vendorId || '',
        ownerOperatorCompanyName: payee.legalName || '',
        includedLoadCount: 0,
        grossRevenueCents: 0
      });
    }
    const trk = trucksMap.get(tNum)!;
    trk.includedLoadCount += 1;
    trk.grossRevenueCents += l.grossRevenueCents;
  });

  if (trucksMap.size === 0) {
    const tNum = set.truckNumber || set.assignedTruckNumber || driverDocData?.truckNumber || 'N/A';
    trucksMap.set(tNum, {
      truckId: set.truckId || `TRK-${tNum}`,
      truckNumber: tNum,
      driverId: payee.payeeId,
      driverName: payee.legalName,
      trailerId: set.trailerNumber || '',
      trailerNumber: set.trailerNumber || 'N/A',
      ownerOperatorCompanyId: payee.vendorId || '',
      ownerOperatorCompanyName: payee.legalName || '',
      includedLoadCount: 0,
      grossRevenueCents: set.grossRevenueCents || 0
    });
  }

  const trucksList = Array.from(trucksMap.values());
  const trailersList = Array.from(new Set(loadsList.map(l => set.trailerNumber).filter(Boolean)));
  if (trailersList.length === 0 && set.trailerNumber) trailersList.push(set.trailerNumber);
  const driversList = Array.from(new Set([payee.legalName, ...loadsList.map(l => l.driverNameSnapshot).filter(Boolean)]));

  // 8. Resolve Line Items & Consolidation
  const resolvedLineItems: any[] = [];
  const rawFuelItems: any[] = [];
  const advances: any[] = [];
  const deductions: any[] = [];
  const reimbursements: any[] = [];
  const otherEarnings: any[] = [];

  lineItemsList.forEach(li => {
    const res = resolveSettlementLineDescription(li, loadsMap);
    const itemObj = {
      id: li.id || `line_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: res.type,
      category: res.category,
      description: res.description,
      quantityDecimal: Number(li.quantityDecimal || 1),
      rateCents: Math.round(Number(li.rateCents || li.amountCents || 0)),
      amountCents: Math.round(Number(li.amountCents || 0)),
      sourceType: li.sourceType || (li.loadId ? 'load' : 'manual'),
      sourceId: li.sourceId || li.loadId || null,
      loadId: li.loadId || null,
      percentageBasisPoints: li.percentageBasisPoints || null,
      truckNumber: li.truckNumber || set.truckNumber || null,
      loadNumber: li.loadNumber || (li.loadId ? loadsMap.get(li.loadId)?.loadNumber : null) || null
    };

    resolvedLineItems.push(itemObj);

    if (res.category.includes('fuel') || li.sourceType === 'fuel_transaction' || li.sourceType === 'fuel') {
      rawFuelItems.push({
        ...itemObj,
        gallons: li.quantityDecimal || li.gallons || 1,
        vendor: li.vendor || li.provider || 'Fuel Card',
        cardLast4: li.cardLast4 || li.cardNumberMasked?.slice(-4) || 'N/A'
      });
    } else if (res.category.includes('advance') || li.sourceType === 'advance') {
      advances.push(itemObj);
    } else if (res.type === 'deduction') {
      deductions.push(itemObj);
    } else if (res.type === 'reimbursement') {
      reimbursements.push(itemObj);
    } else if (res.type === 'earning' && li.sourceType !== 'load') {
      otherEarnings.push(itemObj);
    }
  });

  // Ensure linehaul earnings exist if loads are present
  const hasEarnings = resolvedLineItems.some(item => item.type === 'earning');
  if (!hasEarnings && loadsList.length > 0) {
    loadsList.forEach(l => {
      const earnAmt = l.driverPayCents > 0 ? l.driverPayCents : l.grossRevenueCents;
      const res = resolveSettlementLineDescription({ sourceType: 'load', sourceId: l.loadId, loadId: l.loadId, type: 'earning' }, loadsMap);
      const itemObj = {
        id: `line_load_earn_${l.loadId}`,
        type: "earning" as const,
        category: "linehaul",
        description: res.description,
        quantityDecimal: 1,
        rateCents: earnAmt,
        amountCents: earnAmt,
        sourceType: "load",
        sourceId: l.loadId,
        loadId: l.loadId
      };
      resolvedLineItems.unshift(itemObj);
    });
  }

  // Consolidate Fuel Transactions
  const { summaryLines: fuelSummary, itemizedDetails: fuelDetails } = consolidateFuelTransactions({
    fuelItems: rawFuelItems,
    groupingOption: fuelStatementGrouping
  });

  // 9. Totals and Reconciliation
  const grossRevenueCents = loadsList.length > 0
    ? loadsList.reduce((acc, l) => acc + l.grossRevenueCents, 0)
    : Math.round(Number(set.grossRevenueCents || set.eligibleRevenueCents || 0));

  let totalEarningsCents = resolvedLineItems
    .filter(i => i.type === 'earning')
    .reduce((acc, i) => acc + i.amountCents, 0);

  if (totalEarningsCents === 0 && set.totalEarningsCents) {
    totalEarningsCents = Math.round(Number(set.totalEarningsCents));
  } else if (totalEarningsCents === 0 && grossRevenueCents > 0) {
    totalEarningsCents = grossRevenueCents;
  }

  const totalReimbursementsCents = resolvedLineItems
    .filter(i => i.type === 'reimbursement')
    .reduce((acc, i) => acc + i.amountCents, 0);

  const totalDeductionsCents = resolvedLineItems
    .filter(i => i.type === 'deduction')
    .reduce((acc, i) => acc + i.amountCents, 0);

  const netSettlementCents = totalEarningsCents + totalReimbursementsCents - totalDeductionsCents;

  const loadedMilesDecimal = loadsList.reduce((acc, l) => acc + (l.loadedMilesDecimal || 0), 0);
  const emptyMilesDecimal = loadsList.reduce((acc, l) => acc + (l.emptyMilesDecimal || 0), 0);
  const totalMilesDecimal = loadedMilesDecimal + emptyMilesDecimal;

  // 10. Audit Data
  const audit = {
    calculatedBy: set.createdByUid || null,
    reviewedBy: set.reviewedByUid || null,
    approvedBy: set.approvedByUid || null,
    lockedBy: set.lockedByUid || null,
    quickBooksSyncStatus: set.quickBooksSyncStatus || (set.syncedAt ? 'synced' : 'not_synced')
  };

  const generatedAt = new Date().toISOString();

  return {
    company,
    statement: {
      settlementId: set.id || settlementId,
      statementNumber: set.statementNumber || set.settlementNumber || set.id || settlementId,
      poNumber: getUniquePoNumber(set.id || set.settlementNumber || settlementId, set.poNumber || set.statementNumber || set.settlementNumber),
      settlementType: set.settlementType || (set.workerType === 'owner_operator' ? 'owner_operator' : 'driver'),
      status: set.status || 'draft',
      paymentStatus: set.paymentStatus || 'unpaid',
      periodStart,
      periodEnd,
      generatedAt,
      calculationVersion: set.calculationVersion || 1,
      calculationHash: set.calculationHash || null,
      fuelStatementGrouping
    },
    payee,
    equipment: {
      trucks: trucksList,
      trailers: trailersList,
      drivers: driversList,
      ownerOperatorCompany: ownerOpDocData || null
    },
    loads: loadsList,
    fuelSummary,
    fuelDetails,
    advances,
    deductions,
    reimbursements,
    otherEarnings,
    lineItems: resolvedLineItems,
    totals: {
      grossRevenueCents,
      totalEarningsCents,
      totalReimbursementsCents,
      totalDeductionsCents,
      netSettlementCents,
      loadedMilesDecimal,
      emptyMilesDecimal,
      totalMilesDecimal
    },
    audit
  };
}

function generateSettlementPDFBuffer(payload: {
  viewModel: any;
  pdfHash: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const vm = payload.viewModel;
      const comp = vm.company;
      const stmt = vm.statement;
      const payee = vm.payee;
      const equip = vm.equipment;
      const loads = vm.loads;
      const fuelSummary = vm.fuelSummary || [];
      const fuelDetails = vm.fuelDetails || [];
      const lineItems = vm.lineItems;
      const totals = vm.totals;

      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 36, bottom: 36, left: 36, right: 36 },
        bufferPages: true,
        info: {
          Title: `TD Pro Settlement ${stmt.statementNumber}`,
          Author: comp.legalName,
          Subject: "Official Driver / Owner-Operator Settlement Statement",
          Creator: "Truck Dispatch Pro"
        }
      });

      const chunks: Buffer[] = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", err => reject(err));

      const primaryColor = "#0f172a"; // Slate 900
      const accentColor = "#059669"; // Emerald 600
      const mutedColor = "#64748b"; // Slate 500
      const lightBg = "#f8fafc"; // Slate 50
      const borderColor = "#cbd5e1"; // Slate 300

      let currentY = 36;

      const ensureSpace = (heightNeeded: number, headerFn?: () => void) => {
        if (currentY + heightNeeded > 720) {
          doc.addPage();
          currentY = 36;
          if (headerFn) {
            headerFn();
          }
        }
      };

      // PAGE HEADER
      doc.rect(36, currentY, 540, 74).fillAndStroke(lightBg, borderColor);

      doc.fillColor(primaryColor).fontSize(13).font("Helvetica-Bold")
         .text(comp.legalName, 48, currentY + 10, { width: 310, lineBreak: false });

      doc.fillColor(mutedColor).fontSize(8).font("Helvetica");
      const subLines: string[] = [];
      if (comp.dbaName) subLines.push(`DBA: ${comp.dbaName}`);
      if (comp.address) subLines.push(comp.address);
      if (comp.phone) subLines.push(`Ph: ${comp.phone}`);
      if (comp.dotNumber) subLines.push(`USDOT: ${comp.dotNumber}`);
      if (comp.mcNumber) subLines.push(`MC: ${comp.mcNumber}`);

      doc.text(subLines.join(" | ") || "Carrier Registration Details On File", 48, currentY + 28, { width: 310, height: 38 });

      doc.fillColor(accentColor).fontSize(11).font("Helvetica-Bold")
         .text("SETTLEMENT STATEMENT", 370, currentY + 8, { align: "right", width: 194 });

      doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold")
         .text(`Statement #: ${stmt.statementNumber}`, 370, currentY + 22, { align: "right", width: 194 })
         .text(`PO #: ${stmt.poNumber || getUniquePoNumber(stmt.settlementId, stmt.poNumber)}`, 370, currentY + 33, { align: "right", width: 194 });

      const periodStr = `${stmt.periodStart} to ${stmt.periodEnd}`;
      doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica")
         .text(`Period: ${periodStr}`, 370, currentY + 45, { align: "right", width: 194 });

      doc.text(`Status: ${stmt.status.toUpperCase()} | Issued: ${new Date(stmt.generatedAt).toLocaleDateString('en-US')}`, 370, currentY + 56, { align: "right", width: 194 });

      currentY += 84;

      // PAYEE & EQUIPMENT CARDS
      doc.rect(36, currentY, 260, 85).fillAndStroke("#ffffff", borderColor);
      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text("PAYEE DETAILS", 46, currentY + 8);
      doc.fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(payee.legalName, 46, currentY + 22);
      doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica")
         .text(`Contact: ${payee.contactName}`, 46, currentY + 36)
         .text(`Email: ${payee.email}`, 46, currentY + 48)
         .text(`Phone: ${payee.phone}`, 46, currentY + 60)
         .text(`Type: ${payee.payeeType === 'owner_operator' ? 'Owner-Operator Vendor' : 'Company Driver'}`, 46, currentY + 72);

      const truckNums = equip.trucks.map((t: any) => t.truckNumber).join(", ") || "N/A";
      const trailerNums = equip.trailers.join(", ") || "N/A";
      doc.rect(306, currentY, 270, 85).fillAndStroke("#ffffff", borderColor);
      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text("EQUIPMENT & FLEET", 316, currentY + 8);
      doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica")
         .text(`Assigned Truck(s): ${truckNums}`, 316, currentY + 22)
         .text(`Trailer(s): ${trailerNums}`, 316, currentY + 34)
         .text(`Active Drivers: ${equip.drivers.join(", ") || payee.legalName}`, 316, currentY + 46)
         .text(`Total Miles: ${totals.totalMilesDecimal.toFixed(1)} mi (${totals.loadedMilesDecimal.toFixed(1)} loaded / ${totals.emptyMilesDecimal.toFixed(1)} empty)`, 316, currentY + 58)
         .text(`Payment Status: ${stmt.paymentStatus.toUpperCase()}`, 316, currentY + 70);

      currentY += 95;

      // 1. INCLUDED LOADS TABLE
      doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("1. INCLUDED LOADS & REVENUE BREAKDOWN", 36, currentY);
      currentY += 14;

      const drawLoadTableHeader = () => {
        doc.rect(36, currentY, 540, 18).fill("#0f172a");
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
        doc.text("Load / PO #", 42, currentY + 5, { width: 65 });
        doc.text("Pickup / Del Dates", 110, currentY + 5, { width: 80 });
        doc.text("Customer & Complete Route", 195, currentY + 5, { width: 175 });
        doc.text("Mileage Breakdown", 375, currentY + 5, { width: 60, align: "right" });
        doc.text("Gross Rev", 440, currentY + 5, { width: 55, align: "right" });
        doc.text("Pay Amount", 500, currentY + 5, { width: 70, align: "right" });
        currentY += 18;
      };

      drawLoadTableHeader();

      if (loads.length === 0) {
        doc.rect(36, currentY, 540, 20).fillAndStroke("#ffffff", borderColor);
        doc.fillColor(mutedColor).fontSize(8).font("Helvetica-Oblique").text("No direct load line items attached to this statement period.", 46, currentY + 6);
        currentY += 20;
      } else {
        loads.forEach((ld: any, idx: number) => {
          ensureSpace(32, drawLoadTableHeader);

          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(36, currentY, 540, 32).fillAndStroke(bg, borderColor);

          // Load & PO #
          doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold");
          doc.text(`Load #${ld.loadNumber}`, 42, currentY + 5, { width: 65, lineBreak: false });
          if (ld.poReferenceNumber) {
            doc.font("Helvetica").fontSize(6.5).fillColor(mutedColor);
            doc.text(`PO: ${ld.poReferenceNumber}`, 42, currentY + 17, { width: 65, lineBreak: false });
          }

          // Pickup & Delivery Dates
          doc.font("Helvetica").fontSize(7).fillColor(mutedColor);
          doc.text(`PU: ${ld.pickupDate || 'N/A'}`, 110, currentY + 5, { width: 80, lineBreak: false });
          doc.text(`DEL: ${ld.deliveryDate || 'N/A'}`, 110, currentY + 17, { width: 80, lineBreak: false });

          // Customer & Complete Route
          const custStr = ld.customerName ? ld.customerName : 'Direct Load';
          doc.fillColor(primaryColor).fontSize(7.5).font("Helvetica-Bold").text(custStr, 195, currentY + 5, { width: 175, lineBreak: false });
          doc.fillColor(mutedColor).fontSize(7).font("Helvetica").text(`${ld.origin} -> ${ld.destination}`, 195, currentY + 17, { width: 175, lineBreak: false });

          // Mileage Breakdown
          const loadedMi = ld.loadedMilesDecimal || 0;
          const emptyMi = ld.emptyMilesDecimal || 0;
          const totMi = ld.totalMilesDecimal || (loadedMi + emptyMi);
          doc.fillColor(primaryColor).fontSize(7).font("Helvetica");
          doc.text(`${totMi} mi total`, 375, currentY + 5, { width: 60, align: "right" });
          doc.fillColor(mutedColor).fontSize(6.5).text(`(${loadedMi} L / ${emptyMi} E)`, 375, currentY + 17, { width: 60, align: "right" });

          // Gross & Driver Pay
          const gross = (ld.grossRevenueCents || 0) / 100;
          doc.fillColor(primaryColor).fontSize(7.5).font("Helvetica").text(`$${gross.toFixed(2)}`, 440, currentY + 11, { width: 55, align: "right" });

          const pay = (ld.driverPayCents || gross) / 100;
          doc.fillColor(accentColor).fontSize(8).font("Helvetica-Bold").text(`$${pay.toFixed(2)}`, 500, currentY + 11, { width: 70, align: "right" });

          currentY += 32;
        });
      }

      currentY += 14;

      // 2. CONSOLIDATED FUEL TRANSACTIONS SUMMARY (IF PRESENT)
      if (fuelSummary.length > 0) {
        ensureSpace(40);
        doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("2. CONSOLIDATED FUEL DEDUCTIONS", 36, currentY);
        currentY += 14;

        const drawFuelSummaryHeader = () => {
          doc.rect(36, currentY, 540, 18).fill("#1e293b");
          doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
          doc.text("Fuel Category / Grouping", 42, currentY + 5, { width: 200 });
          doc.text("Trans. Count", 250, currentY + 5, { width: 80, align: "center" });
          doc.text("Total Gallons", 340, currentY + 5, { width: 90, align: "right" });
          doc.text("Total Deducted", 450, currentY + 5, { width: 120, align: "right" });
          currentY += 18;
        };

        drawFuelSummaryHeader();

        fuelSummary.forEach((fGroup: any, idx: number) => {
          ensureSpace(20, drawFuelSummaryHeader);
          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(36, currentY, 540, 20).fillAndStroke(bg, borderColor);

          doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold");
          doc.text(fGroup.description, 42, currentY + 6, { width: 200, lineBreak: false });

          doc.font("Helvetica").fontSize(7.5).fillColor(mutedColor);
          doc.text(`${fGroup.transactionCount} txn(s)`, 250, currentY + 6, { width: 80, align: "center" });
          doc.text(`${fGroup.quantityDecimal.toFixed(3)} gal`, 340, currentY + 6, { width: 90, align: "right" });

          const amt = fGroup.amountCents / 100;
          doc.fillColor("#dc2626").font("Helvetica-Bold").text(`-$${amt.toFixed(2)}`, 450, currentY + 6, { width: 120, align: "right" });

          currentY += 20;
        });

        currentY += 14;
      }

      // 3. OTHER ITEMIZED EARNINGS, DEDUCTIONS & REIMBURSEMENTS
      ensureSpace(40);
      const otherSectionTitle = fuelSummary.length > 0 ? "3. OTHER EARNINGS, DEDUCTIONS & REIMBURSEMENTS" : "2. ITEMIZED EARNINGS, DEDUCTIONS & REIMBURSEMENTS";
      doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text(otherSectionTitle, 36, currentY);
      currentY += 14;

      const nonFuelLineItems = lineItems.filter((li: any) => !li.category?.includes('fuel') && li.sourceType !== 'fuel_transaction' && li.sourceType !== 'fuel');

      const drawItemTableHeader = () => {
        doc.rect(36, currentY, 540, 18).fill("#334155");
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
        doc.text("Category / Item", 42, currentY + 5, { width: 130 });
        doc.text("Description & Details", 172, currentY + 5, { width: 250 });
        doc.text("Type", 422, currentY + 5, { width: 50, align: "center" });
        doc.text("Amount", 472, currentY + 5, { width: 98, align: "right" });
        currentY += 18;
      };

      drawItemTableHeader();

      if (nonFuelLineItems.length === 0) {
        doc.rect(36, currentY, 540, 20).fillAndStroke("#ffffff", borderColor);
        doc.fillColor(mutedColor).fontSize(8).font("Helvetica-Oblique").text("No additional itemized deductions or reimbursements reported.", 46, currentY + 6);
        currentY += 20;
      } else {
        nonFuelLineItems.forEach((li: any, idx: number) => {
          ensureSpace(20, drawItemTableHeader);

          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(36, currentY, 540, 20).fillAndStroke(bg, borderColor);

          doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold");
          const catTitle = (li.category || 'Adjustment').replace(/_/g, ' ').toUpperCase();
          doc.text(catTitle, 42, currentY + 6, { width: 130, lineBreak: false });

          doc.font("Helvetica").fontSize(7.5).fillColor(primaryColor);
          doc.text(li.description || 'Standard line item', 172, currentY + 6, { width: 250, lineBreak: false });

          const isDeduction = li.type === 'deduction';
          const isReimbursement = li.type === 'reimbursement';
          const typeLabel = isDeduction ? 'Deduction' : (isReimbursement ? 'Reimb.' : 'Earning');

          doc.fillColor(mutedColor).text(typeLabel, 422, currentY + 6, { width: 50, align: "center" });

          const amt = Math.abs(li.amountCents || 0) / 100;
          const amtStr = isDeduction ? `-$${amt.toFixed(2)}` : `+$${amt.toFixed(2)}`;
          const color = isDeduction ? "#dc2626" : accentColor;

          doc.fillColor(color).font("Helvetica-Bold").text(amtStr, 472, currentY + 6, { width: 98, align: "right" });

          currentY += 20;
        });
      }

      currentY += 16;

      // 4. RECONCILIATION SUMMARY BOX
      ensureSpace(120);

      const grossRev = (totals.grossRevenueCents || 0) / 100;
      const earnings = (totals.totalEarningsCents || 0) / 100;
      const reimbursements = (totals.totalReimbursementsCents || 0) / 100;
      const deductions = (totals.totalDeductionsCents || 0) / 100;
      const netPay = (totals.netSettlementCents || 0) / 100;

      doc.rect(286, currentY, 290, 114).fillAndStroke("#f1f5f9", borderColor);
      doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("SETTLEMENT RECONCILIATION SUMMARY", 298, currentY + 10);

      doc.fontSize(8).font("Helvetica").fillColor(primaryColor);
      doc.text("Total Gross Load Revenue:", 298, currentY + 28);
      doc.text(`$${grossRev.toFixed(2)}`, 450, currentY + 28, { align: "right", width: 116 });

      doc.text("Total Linehaul Earnings:", 298, currentY + 41);
      doc.text(`$${earnings.toFixed(2)}`, 450, currentY + 41, { align: "right", width: 116 });

      doc.text("Reimbursements / Additions (+):", 298, currentY + 54);
      doc.text(`+$${reimbursements.toFixed(2)}`, 450, currentY + 54, { align: "right", width: 116 });

      doc.fillColor("#dc2626").text("Total Deductions / Advances (-):", 298, currentY + 67);
      doc.text(`-$${deductions.toFixed(2)}`, 450, currentY + 67, { align: "right", width: 116 });

      doc.rect(294, currentY + 83, 274, 24).fill(accentColor);
      doc.fillColor("#ffffff").fontSize(9.5).font("Helvetica-Bold").text("NET SETTLEMENT PAY:", 304, currentY + 90);
      doc.fontSize(11.5).font("Helvetica-Bold").text(`$${netPay.toFixed(2)}`, 450, currentY + 89, { align: "right", width: 110 });

      currentY += 126;

      // 5. ITEMIZED FUEL APPENDIX (IF DETAILED TRANSACTIONS EXIST)
      if (fuelDetails.length > 0) {
        ensureSpace(80);
        doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("APPENDIX: ITEMIZED FUEL TRANSACTION LOG", 36, currentY);
        currentY += 14;

        const drawFuelDetailHeader = () => {
          doc.rect(36, currentY, 540, 16).fill("#475569");
          doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold");
          doc.text("Date", 42, currentY + 4, { width: 55 });
          doc.text("Merchant / Location", 100, currentY + 4, { width: 140 });
          doc.text("Card / Truck", 245, currentY + 4, { width: 90 });
          doc.text("Type / Product", 340, currentY + 4, { width: 75 });
          doc.text("Gallons", 420, currentY + 4, { width: 55, align: "right" });
          doc.text("Net Amount", 480, currentY + 4, { width: 90, align: "right" });
          currentY += 16;
        };

        drawFuelDetailHeader();

        fuelDetails.forEach((fd: any, idx: number) => {
          ensureSpace(18, drawFuelDetailHeader);
          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(36, currentY, 540, 18).fillAndStroke(bg, borderColor);

          doc.fillColor(primaryColor).fontSize(7).font("Helvetica");
          doc.text(fd.transactionDate, 42, currentY + 5, { width: 55, lineBreak: false });
          doc.text(`${fd.merchantName} (${fd.cityState})`, 100, currentY + 5, { width: 140, lineBreak: false });
          doc.text(`${fd.cardNumberMasked} / Trk #${fd.truckNumber}`, 245, currentY + 5, { width: 90, lineBreak: false });
          doc.text(fd.productLabel, 340, currentY + 5, { width: 75, lineBreak: false });
          doc.text(`${fd.gallons.toFixed(2)}`, 420, currentY + 5, { width: 55, align: "right" });

          const amt = fd.netAmountCents / 100;
          doc.text(`$${amt.toFixed(2)}`, 480, currentY + 5, { width: 90, align: "right" });

          currentY += 18;
        });

        currentY += 14;
      }

      // AUDIT & LEGAL DISCLAIMER
      ensureSpace(40);
      doc.fillColor(mutedColor).fontSize(7).font("Helvetica")
         .text(`AUDIT TRAIL & SYSTEM VERIFICATION: Generated by Truck Dispatch Pro for ${comp.legalName} on ${new Date(stmt.generatedAt).toLocaleString('en-US')}.`, 36, currentY)
         .text(`Document SHA-256 Hash: ${payload.pdfHash}`, 36, currentY + 10)
         .text("This settlement statement constitutes an official accounting record. For inquiries, contact carrier accounting.", 36, currentY + 20);

      // PAGE NUMBERING IN FOOTER
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica");
        doc.text(`Truck Dispatch Pro — Official Settlement Document #${stmt.statementNumber}`, 36, 762, { width: 320, lineBreak: false });
        doc.text(`Page ${i + 1} of ${range.count}`, 372, 762, { align: "right", width: 204, lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}


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
    console.error("Error reading custom firestore database ID in accounting module:", err);
  }
  return getFirestore();
};

export async function verifyAccountingAuth(req: express.Request, targetCompanyId: string) {
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
      return { authorized: false, status: 403, error: "Forbidden: Cross-tenant accounting access is strictly prohibited" };
    }

    if (role === "driver") {
      return { authorized: false, status: 403, error: "Forbidden: Drivers are not permitted to access tenant accounting routes" };
    }

    if (role === "dispatcher") {
      const dispatcherSnap = await db.collection("admins").doc(targetCompanyId).collection("dispatchers").doc(callerUid).get();
      const dispatcherData = dispatcherSnap.exists ? dispatcherSnap.data() : callerData;
      const perms = dispatcherData.permissions || dispatcherData.dispatcherPermissions || {};
      
      const hasAcc = perms.accounting?.view === true || perms.invoices === true || perms.invoices?.view === true;
      if (!hasAcc) {
        return { authorized: false, status: 403, error: "Forbidden: Dispatcher does not have accounting permission enabled by Tenant Admin." };
      }
    }

    return {
      authorized: true,
      callerUid,
      callerName: callerData.name || 'User',
      role,
      isSuperAdmin: false,
      companyId: targetCompanyId
    };
  } catch (err: any) {
    return { authorized: false, status: 401, error: "Unauthorized: Invalid or expired authentication token" };
  }
}

export function registerAccountingRoutes(app: express.Express) {

  // ==========================================
  // COMPENSATION PROFILES ENDPOINTS
  // ==========================================

  app.post("/api/accounting/compensation-profile", async (req, res) => {
    const {
      companyId,
      driverId,
      workerType,
      payMethod,
      settlementFrequency,
      loadedMileRateCents,
      emptyMileRateCents,
      flatPerLoadCents,
      hourlyRateCents,
      salaryAmountCents,
      ownerOperatorPercentageBasisPoints,
      dispatchFeeBasisPoints,
      stopPayCents,
      detentionHourlyRateCents,
      layoverDailyRateCents,
      defaultInsuranceDeductionCents,
      defaultTrailerRentCents,
      defaultEscrowDeductionCents,
      defaultMaintenanceDeductionCents,
      deductActualFuel,
      deductAdvances,
      deductTolls,
      deductChargebacks,
      effectiveFrom
    } = req.body;

    if (!companyId || !driverId || !workerType || !payMethod) {
      return res.status(400).json({ error: "Missing required fields: companyId, driverId, workerType, payMethod" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot modify compensation profiles" });
    }

    if (authRes.role === "dispatcher") {
      const db = getFirestoreDb();
      const dispatcherSnap = await db.collection("admins").doc(companyId).collection("dispatchers").doc(authRes.callerUid).get();
      const dispatcherData = dispatcherSnap.exists ? dispatcherSnap.data() : {};
      const perms = dispatcherData.permissions || dispatcherData.dispatcherPermissions || {};
      const canManageComp = perms.accounting?.manageCompensationProfiles === true;
      if (!canManageComp) {
        return res.status(403).json({ error: "Forbidden: Dispatcher does not have permission from Tenant Admin to modify Driver Compensation Profiles. Please ask your Admin to enable 'Compensation Profiles' under Dispatcher Staff Permissions." });
      }
    }

    try {
      const db = getFirestoreDb();
      const profilesRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId).collection("compensation_profiles");
      const snap = await profilesRef.get();

      let highestVersion = 0;
      const nowIso = new Date().toISOString();

      // Deactivate previous profiles and determine highest version
      const batch = db.batch();
      snap.forEach(docSnap => {
        const pData = docSnap.data();
        if (pData.version && pData.version > highestVersion) {
          highestVersion = pData.version;
        }
        if (pData.isActive) {
          batch.update(docSnap.ref, {
            isActive: false,
            effectiveTo: effectiveFrom || nowIso,
            updatedAt: nowIso
          });
        }
      });

      const newVersion = highestVersion + 1;
      const profileId = `cp_v${newVersion}_${Date.now()}`;

      const profileData = {
        id: profileId,
        companyId,
        driverId,
        workerType: workerType || 'company_driver',
        payMethod: payMethod || 'per_mile',
        settlementFrequency: settlementFrequency || 'weekly',

        loadedMileRateCents: loadedMileRateCents !== undefined ? Math.round(Number(loadedMileRateCents)) : null,
        emptyMileRateCents: emptyMileRateCents !== undefined ? Math.round(Number(emptyMileRateCents)) : null,
        flatPerLoadCents: flatPerLoadCents !== undefined ? Math.round(Number(flatPerLoadCents)) : null,
        hourlyRateCents: hourlyRateCents !== undefined ? Math.round(Number(hourlyRateCents)) : null,
        salaryAmountCents: salaryAmountCents !== undefined ? Math.round(Number(salaryAmountCents)) : null,
        ownerOperatorPercentageBasisPoints: ownerOperatorPercentageBasisPoints !== undefined ? Math.round(Number(ownerOperatorPercentageBasisPoints)) : null,
        dispatchFeeBasisPoints: dispatchFeeBasisPoints !== undefined ? Math.round(Number(dispatchFeeBasisPoints)) : null,

        stopPayCents: stopPayCents !== undefined ? Math.round(Number(stopPayCents)) : null,
        detentionHourlyRateCents: detentionHourlyRateCents !== undefined ? Math.round(Number(detentionHourlyRateCents)) : null,
        layoverDailyRateCents: layoverDailyRateCents !== undefined ? Math.round(Number(layoverDailyRateCents)) : null,

        defaultInsuranceDeductionCents: defaultInsuranceDeductionCents !== undefined ? Math.round(Number(defaultInsuranceDeductionCents)) : null,
        defaultTrailerRentCents: defaultTrailerRentCents !== undefined ? Math.round(Number(defaultTrailerRentCents)) : null,
        defaultEscrowDeductionCents: defaultEscrowDeductionCents !== undefined ? Math.round(Number(defaultEscrowDeductionCents)) : null,
        defaultMaintenanceDeductionCents: defaultMaintenanceDeductionCents !== undefined ? Math.round(Number(defaultMaintenanceDeductionCents)) : null,

        deductActualFuel: Boolean(deductActualFuel),
        deductAdvances: Boolean(deductAdvances),
        deductTolls: Boolean(deductTolls),
        deductChargebacks: Boolean(deductChargebacks),

        effectiveFrom: effectiveFrom || nowIso,
        effectiveTo: null,
        isActive: true,
        setupComplete: true,
        version: newVersion,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedByUid: authRes.callerUid
      };

      const newDocRef = profilesRef.doc(profileId);
      batch.set(newDocRef, profileData);
      await batch.commit();

      // Create Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "create_compensation_profile",
        entityType: "compensation_profile",
        entityId: profileId,
        after: profileData,
        createdAt: nowIso
      });

      return res.json({ success: true, profile: profileData });
    } catch (err: any) {
      console.error("Error saving compensation profile:", err);
      return res.status(500).json({ error: err.message || "Failed to save compensation profile" });
    }
  });

  app.get("/api/accounting/compensation-profile/:companyId/:driverId", async (req, res) => {
    const { companyId, driverId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const profilesRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId).collection("compensation_profiles");
      const snap = await profilesRef.get();

      const profiles: any[] = [];
      snap.forEach(doc => profiles.push(doc.data()));
      profiles.sort((a, b) => b.version - a.version);

      const activeProfile = profiles.find(p => p.isActive) || profiles[0] || null;

      return res.json({ success: true, activeProfile, profiles });
    } catch (err: any) {
      console.error("Error fetching compensation profile:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch compensation profile" });
    }
  });

  // ==========================================
  // ADVANCES ENDPOINTS
  // ==========================================

  app.post("/api/accounting/advance", async (req, res) => {
    const {
      companyId,
      driverId,
      ownerOperatorId,
      loadId,
      type,
      originalAmountCents,
      deductionMethod,
      fixedDeductionCents,
      percentageBasisPoints,
      notes,
      memo,
      checkNumber,
      comcheckNumber,
      referenceNumber,
      issuedAt
    } = req.body;

    if (!companyId || !driverId || !originalAmountCents || originalAmountCents <= 0) {
      return res.status(400).json({ error: "Missing required fields: companyId, driverId, valid originalAmountCents" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot issue advances" });
    }

    try {
      const db = getFirestoreDb();
      const advanceId = `adv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();
      const origAmt = Math.round(Number(originalAmountCents));

      const advanceData = {
        id: advanceId,
        companyId,
        driverId,
        ownerOperatorId: ownerOperatorId || null,
        loadId: loadId || null,
        type: type || 'cash',
        originalAmountCents: origAmt,
        deductedAmountCents: 0,
        remainingBalanceCents: origAmt,
        deductionMethod: deductionMethod || 'full_next_settlement',
        fixedDeductionCents: fixedDeductionCents ? Math.round(Number(fixedDeductionCents)) : null,
        percentageBasisPoints: percentageBasisPoints ? Math.round(Number(percentageBasisPoints)) : null,
        notes: notes || memo || null,
        memo: memo || notes || null,
        checkNumber: checkNumber || comcheckNumber || referenceNumber || null,
        comcheckNumber: comcheckNumber || checkNumber || null,
        referenceNumber: referenceNumber || checkNumber || comcheckNumber || null,
        status: 'open',
        issuedAt: issuedAt || nowIso,
        createdByUid: authRes.callerUid,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("advances").doc(advanceId).set(advanceData);

      // Audit log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "create_advance",
        entityType: "advance",
        entityId: advanceId,
        after: advanceData,
        createdAt: nowIso
      });

      return res.json({ success: true, advance: advanceData });
    } catch (err: any) {
      console.error("Error creating advance:", err);
      return res.status(500).json({ error: err.message || "Failed to create advance" });
    }
  });

  app.get("/api/accounting/advances/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let query: any = db.collection("admins").doc(companyId).collection("advances");

      if (authRes.role === "driver") {
        query = query.where("driverId", "==", authRes.callerUid);
      }

      const snap = await query.get();
      const advances: any[] = [];
      snap.forEach(doc => advances.push(doc.data()));

      advances.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

      return res.json({ success: true, advances });
    } catch (err: any) {
      console.error("Error fetching advances:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch advances" });
    }
  });

  // ==========================================
  // FUEL CENTER ENDPOINTS
  // ==========================================

  app.post("/api/accounting/fuel-entry", async (req, res) => {
    const {
      companyId,
      loadId,
      driverId,
      truckId,
      fuelDate,
      fuelVendor,
      fuelLocation,
      state,
      gallons,
      pricePerGallonCents,
      odometer,
      receiptUrl,
      fuelCardProvider,
      source
    } = req.body;

    if (!companyId || gallons === undefined || pricePerGallonCents === undefined) {
      return res.status(400).json({ error: "Missing required fields: companyId, gallons, pricePerGallonCents" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot create fuel accounting entries" });
    }

    try {
      const db = getFirestoreDb();
      const gallonsNum = Math.abs(Number(gallons) || 0);
      const ppgCentsNum = Math.abs(Math.round(Number(pricePerGallonCents) || 0));
      // Strictly server-side integer cents math
      const totalAmountCents = Math.round(gallonsNum * ppgCentsNum);

      const fuelEntryId = `fuel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();

      const fuelEntry = {
        id: fuelEntryId,
        companyId,
        loadId: loadId || null,
        driverId: driverId || null,
        truckId: truckId || null,
        fuelDate: fuelDate || nowIso.split("T")[0],
        fuelVendor: fuelVendor || "General Fuel Vendor",
        fuelLocation: fuelLocation || "",
        state: (state || "").toUpperCase(),
        gallons: gallonsNum,
        pricePerGallonCents: ppgCentsNum,
        totalAmountCents,
        odometer: odometer ? Number(odometer) : null,
        receiptUrl: receiptUrl || null,
        fuelCardProvider: fuelCardProvider || null,
        source: source || "manual",
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("fuel_entries").doc(fuelEntryId).set(fuelEntry);

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "create_fuel_entry",
        entityType: "fuel_entry",
        entityId: fuelEntryId,
        after: fuelEntry,
        createdAt: nowIso
      });

      return res.json({ success: true, fuelEntry });
    } catch (err: any) {
      console.error("Error creating fuel entry:", err);
      return res.status(500).json({ error: err.message || "Failed to save fuel entry" });
    }
  });

  app.get("/api/accounting/fuel-entries/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let query: any = db.collection("admins").doc(companyId).collection("fuel_entries");

      if (authRes.role === "driver") {
        query = query.where("driverId", "==", authRes.callerUid);
      }

      const snap = await query.get();
      const fuelEntries: any[] = [];
      snap.forEach((doc: any) => fuelEntries.push(doc.data()));

      fuelEntries.sort((a, b) => new Date(b.fuelDate).getTime() - new Date(a.fuelDate).getTime());

      return res.json({ success: true, fuelEntries });
    } catch (err: any) {
      console.error("Error fetching fuel entries:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch fuel entries" });
    }
  });

  // ==========================================
  // PAY RULES ENDPOINTS
  // ==========================================

  app.post("/api/accounting/pay-rule", async (req, res) => {
    const { companyId, name, appliesTo, method, percentage, ratePerMileCents, flatAmountCents, defaultDeductions, isActive } = req.body;

    if (!companyId || !name || !method) {
      return res.status(400).json({ error: "Missing required fields: companyId, name, method" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (!["admin", "company_admin", "fleet_admin"].includes(authRes.role) && !authRes.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Only Company Admins and Super Admins can manage Pay Rules" });
    }

    try {
      const db = getFirestoreDb();
      const payRuleId = `payrule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();

      const payRule = {
        id: payRuleId,
        companyId,
        name,
        appliesTo: appliesTo || "driver",
        method,
        percentage: percentage !== undefined ? Number(percentage) : null,
        ratePerMileCents: ratePerMileCents !== undefined ? Math.round(Number(ratePerMileCents)) : null,
        flatAmountCents: flatAmountCents !== undefined ? Math.round(Number(flatAmountCents)) : null,
        defaultDeductions: Array.isArray(defaultDeductions) ? defaultDeductions : [],
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("pay_rules").doc(payRuleId).set(payRule);

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "create_pay_rule",
        entityType: "pay_rule",
        entityId: payRuleId,
        after: payRule,
        createdAt: nowIso
      });

      return res.json({ success: true, payRule });
    } catch (err: any) {
      console.error("Error creating pay rule:", err);
      return res.status(500).json({ error: err.message || "Failed to create pay rule" });
    }
  });

  app.get("/api/accounting/pay-rules/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("pay_rules").get();
      const payRules: any[] = [];
      snap.forEach(doc => payRules.push(doc.data()));

      return res.json({ success: true, payRules });
    } catch (err: any) {
      console.error("Error fetching pay rules:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch pay rules" });
    }
  });

  // ==========================================
  // SETTLEMENT CALCULATION ENGINE
  // ==========================================

  app.post("/api/accounting/calculate-settlement", async (req, res) => {
    const { companyId, loadId, driverId, ownerOperatorId, saveDraft, settlementType, periodStart, periodEnd, allowDuplicate, forceRecreate } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Missing required companyId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot generate settlement calculations" });
    }

    try {
      const db = getFirestoreDb();
      let loadData: any = null;
      let driverData: any = null;
      let compProfile: any = null;

      // Helper to normalize dates to ISO YYYY-MM-DD
      const normDateStr = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') {
          if (val.includes('T')) return val.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        } else if (typeof val === 'number') {
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        } else if (val && typeof val === 'object' && typeof val.toDate === 'function') {
          return val.toDate().toISOString().split('T')[0];
        }
        return '';
      };

      const startIso = normDateStr(periodStart) || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const endIso = normDateStr(periodEnd) || new Date().toISOString().split('T')[0];

      // DOUBLE PAYMENT / DEDUCTION GUARD: Fetch existing settlements to identify already settled loads, fuel txs, and advances
      const existingSettlementsSnap = await db.collection("admins").doc(companyId).collection("settlements").get();
      const settledLoadMap = new Map<string, { id: string; settlementNumber: string; status: string }>();
      const settledFuelTxSet = new Set<string>();
      const settledAdvanceSet = new Set<string>();

      existingSettlementsSnap.forEach(sDoc => {
        const s = sDoc.data();
        if (s.status === 'void' || s.status === 'deleted') return;
        const sInfo = {
          id: sDoc.id,
          settlementNumber: s.settlementNumber || s.statementNumber || sDoc.id,
          status: s.status || 'draft'
        };

        if (s.loadId) settledLoadMap.set(String(s.loadId), sInfo);
        if (s.loadIds && Array.isArray(s.loadIds)) {
          s.loadIds.forEach((id: any) => settledLoadMap.set(String(id), sInfo));
        }
        if (s.lineItems && Array.isArray(s.lineItems)) {
          s.lineItems.forEach((li: any) => {
            if (li.loadId) settledLoadMap.set(String(li.loadId), sInfo);
            if (li.sourceType === 'fuel_transaction' && li.sourceId) settledFuelTxSet.add(String(li.sourceId));
            if (li.sourceType === 'advance' && li.sourceId) settledAdvanceSet.add(String(li.sourceId));
          });
        }
      });

      const rawPeriodLoads: any[] = [];
      if (loadId) {
        const loadDoc = await db.collection("admins").doc(companyId).collection("loads").doc(loadId).get();
        if (loadDoc.exists) {
          loadData = loadDoc.data();
          rawPeriodLoads.push({ id: loadDoc.id, ...loadData });
        }
      } else if (driverId) {
        // Query loads assigned to target driver for the requested date period
        const loadsSnap = await db.collection("admins").doc(companyId).collection("loads")
          .where("assignedDriverId", "==", driverId)
          .get();
        loadsSnap.forEach(doc => {
          const ld = doc.data();
          const ldDate = normDateStr(ld.deliveryDate || ld.completedAt || ld.pickupDate || ld.createdAt || ld.date);
          if (!ldDate || (ldDate >= startIso && ldDate <= endIso)) {
            rawPeriodLoads.push({ id: doc.id, ...ld });
          }
        });
        if (rawPeriodLoads.length === 0) {
          const loadsSnap2 = await db.collection("admins").doc(companyId).collection("loads")
            .where("driverId", "==", driverId)
            .get();
          loadsSnap2.forEach(doc => {
            const ld = doc.data();
            const ldDate = normDateStr(ld.deliveryDate || ld.completedAt || ld.pickupDate || ld.createdAt || ld.date);
            if (!ldDate || (ldDate >= startIso && ldDate <= endIso)) {
              if (!rawPeriodLoads.some(p => p.id === doc.id)) {
                rawPeriodLoads.push({ id: doc.id, ...ld });
              }
            }
          });
        }
        if (rawPeriodLoads.length > 0) {
          loadData = rawPeriodLoads[0];
        }
      }

      // Check guard for single load or period load request
      let duplicateLoadWarning = null;
      if (loadId) {
        if (settledLoadMap.has(loadId) || (loadData && loadData.settlementStatus === 'settled')) {
          const match = settledLoadMap.get(loadId);
          const stNum = match?.settlementNumber || match?.id || 'Existing Statement';
          const stStatus = (match?.status || 'Active').toUpperCase();
          if (!allowDuplicate && !forceRecreate) {
            return res.status(409).json({
              isDuplicate: true,
              existingSettlementNumber: stNum,
              existingSettlementId: match?.id,
              loadNumber: loadData?.loadNumber || loadId,
              error: `Load #${loadData?.loadNumber || loadId} is ALREADY included in Statement #${stNum} (Status: ${stStatus}). Generating a new statement will create a duplicate settlement calculation for this load.`
            });
          } else {
            duplicateLoadWarning = `Load #${loadData?.loadNumber || loadId} was previously included in Statement #${stNum}. Re-calculating as requested.`;
          }
        }
      }

      // Filter period loads to exclude already settled loads unless forced
      const periodLoads = rawPeriodLoads.filter(ld => {
        if (!forceRecreate && (settledLoadMap.has(ld.id) || ld.settlementStatus === 'settled')) return false;
        return true;
      });

      const targetDriverUid = driverId || loadData?.assignedDriverId;
      if (!targetDriverUid) {
        return res.status(400).json({ error: "No target driver specified for settlement calculation" });
      }

      const driverDoc = await db.collection("admins").doc(companyId).collection("drivers").doc(targetDriverUid).get();
      if (driverDoc.exists) {
        driverData = driverDoc.data();
      } else {
        const userDoc = await db.collection("users").doc(targetDriverUid).get();
        if (userDoc.exists) {
          driverData = userDoc.data();
        }
      }

      // Fetch driver's compensation profile
      const profilesSnap = await db.collection("admins").doc(companyId).collection("drivers").doc(targetDriverUid).collection("compensation_profiles").get();
      const profilesList: any[] = [];
      profilesSnap.forEach(d => profilesList.push(d.data()));
      profilesList.sort((a, b) => (b.version || 0) - (a.version || 0));

      compProfile = profilesList.find(p => p.isActive) || profilesList[0] || null;

      // Check load settlement readiness
      const podUploaded = Boolean(loadData?.podUrl || loadData?.podUploadedAt);
      const finalMilesConfirmed = Boolean(loadData?.miles || loadData?.distanceMiles || loadData?.actualLoadedMiles);
      const grossRevenueConfirmed = Boolean(loadData?.rateCents || loadData?.rate || loadData?.grossRevenueCents);
      const accessorialsConfirmed = true;
      const fuelSyncComplete = true;
      const advancesSyncComplete = true;
      const compensationProfileComplete = Boolean(compProfile && compProfile.setupComplete);

      const readinessChecks = {
        podUploaded,
        finalMilesConfirmed,
        grossRevenueConfirmed,
        accessorialsConfirmed,
        fuelSyncComplete,
        advancesSyncComplete,
        compensationProfileComplete
      };

      const settlementReadiness = Object.values(readinessChecks).every(Boolean) ? "ready" : "incomplete";

      const lineItems: any[] = [];
      const nowIso = new Date().toISOString();

      let grossRevenueCents = 0;
      let loadedMiles = 0;
      let emptyMiles = 0;

      const workerType = compProfile?.workerType || (driverData?.ownerOperatorName ? 'owner_operator' : 'company_driver');

      if (periodLoads.length > 0) {
        for (const ld of periodLoads) {
          let ldGrossCents = 0;
          if (typeof ld.rateCents === 'number' && ld.rateCents > 0) {
            ldGrossCents = Math.round(ld.rateCents);
          } else if (typeof ld.rate === 'number' && ld.rate > 0) {
            ldGrossCents = Math.round(ld.rate * 100);
          } else if (typeof ld.rate === 'string' && !isNaN(parseFloat(ld.rate)) && parseFloat(ld.rate) > 0) {
            ldGrossCents = Math.round(parseFloat(ld.rate) * 100);
          } else if (typeof ld.grossRevenueCents === 'number' && ld.grossRevenueCents > 0) {
            ldGrossCents = Math.round(ld.grossRevenueCents);
          } else if (typeof ld.grossRevenue === 'number' && ld.grossRevenue > 0) {
            ldGrossCents = Math.round(ld.grossRevenue * 100);
          } else if (typeof ld.agreedAmount === 'number' && ld.agreedAmount > 0) {
            ldGrossCents = Math.round(ld.agreedAmount * 100);
          } else if (typeof ld.flatRate === 'number' && ld.flatRate > 0) {
            ldGrossCents = Math.round(ld.flatRate * 100);
          } else if (typeof ld.totalPay === 'number' && ld.totalPay > 0) {
            ldGrossCents = Math.round(ld.totalPay * 100);
          }

          const ldLoaded = Number(ld.actualLoadedMiles || ld.miles || ld.distanceMiles || 0);
          const ldEmpty = Number(ld.actualEmptyMiles || ld.emptyMiles || 0);

          grossRevenueCents += ldGrossCents;
          loadedMiles += ldLoaded;
          emptyMiles += ldEmpty;

          const loadLabel = ld.loadNumber ? `Load #${ld.loadNumber}` : (ld.id ? `Load ${ld.id.slice(-6).toUpperCase()}` : 'Trip');

          if (compProfile) {
            if (workerType === 'owner_operator' || compProfile.payMethod === 'percentage_of_gross' || compProfile.payMethod === 'percentage_of_linehaul') {
              const percentageBasisPoints = compProfile.ownerOperatorPercentageBasisPoints || 8800; // 88%
              const revenueBaseCents = ldGrossCents > 0 ? ldGrossCents : (compProfile.flatPerLoadCents || 0);
              const ooPayCents = Math.round((revenueBaseCents * percentageBasisPoints) / 10000);

              if (ooPayCents > 0) {
                lineItems.push({
                  id: `line_earn_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Linehaul Pay",
                  description: `${loadLabel} Gross ($${(revenueBaseCents / 100).toFixed(2)}) @ ${(percentageBasisPoints / 100).toFixed(2)}%`,
                  quantityDecimal: 1,
                  rateCents: ooPayCents,
                  percentageBasisPoints,
                  amountCents: ooPayCents,
                  sourceType: "load",
                  createdAt: nowIso
                });
              }
            } else {
              if (compProfile.payMethod === 'per_mile') {
                const loadedRate = compProfile.loadedMileRateCents || 60;
                const loadedAmt = Math.round(ldLoaded * loadedRate);
                if (loadedAmt > 0) {
                  lineItems.push({
                    id: `line_earn_loaded_${ld.id}_${Date.now()}`,
                    companyId,
                    loadId: ld.id,
                    type: "earning",
                    category: "Loaded Miles Pay",
                    description: `${loadLabel}: ${ldLoaded} loaded mi @ $${(loadedRate / 100).toFixed(2)}/mi`,
                    quantityDecimal: ldLoaded,
                    rateCents: loadedRate,
                    amountCents: loadedAmt,
                    sourceType: "load",
                    createdAt: nowIso
                  });
                }
                if (ldEmpty > 0 && compProfile.emptyMileRateCents) {
                  const emptyRate = compProfile.emptyMileRateCents;
                  const emptyAmt = Math.round(ldEmpty * emptyRate);
                  lineItems.push({
                    id: `line_earn_empty_${ld.id}_${Date.now()}`,
                    companyId,
                    loadId: ld.id,
                    type: "earning",
                    category: "Empty Miles Pay",
                    description: `${loadLabel}: ${ldEmpty} empty mi @ $${(emptyRate / 100).toFixed(2)}/mi`,
                    quantityDecimal: ldEmpty,
                    rateCents: emptyRate,
                    amountCents: emptyAmt,
                    sourceType: "load",
                    createdAt: nowIso
                  });
                }
              } else if (compProfile.payMethod === 'per_load') {
                const flatAmt = compProfile.flatPerLoadCents || (ldGrossCents > 0 ? Math.round(ldGrossCents * 0.25) : 50000);
                lineItems.push({
                  id: `line_earn_flat_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Flat Load Pay",
                  description: `${loadLabel} Flat Pay`,
                  quantityDecimal: 1,
                  rateCents: flatAmt,
                  amountCents: flatAmt,
                  sourceType: "load",
                  createdAt: nowIso
                });
              } else if (compProfile.payMethod === 'hourly') {
                const hourlyRate = compProfile.hourlyRateCents || 2500;
                const hours = Number(ld.hours || 8);
                const hourlyAmt = Math.round(hours * hourlyRate);
                lineItems.push({
                  id: `line_earn_hourly_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Hourly Pay",
                  description: `${loadLabel}: ${hours} hrs @ $${(hourlyRate / 100).toFixed(2)}/hr`,
                  quantityDecimal: hours,
                  rateCents: hourlyRate,
                  amountCents: hourlyAmt,
                  sourceType: "load",
                  createdAt: nowIso
                });
              } else {
                const earnAmt = Math.round((ldGrossCents || 100000) * 0.6);
                lineItems.push({
                  id: `line_earn_default_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Base Pay",
                  description: `${loadLabel} Base Pay (60% of Gross)`,
                  quantityDecimal: 1,
                  rateCents: earnAmt,
                  amountCents: earnAmt,
                  sourceType: "load",
                  createdAt: nowIso
                });
              }

              // Accessorials
              if (compProfile.stopPayCents && compProfile.stopPayCents > 0) {
                lineItems.push({
                  id: `line_earn_stop_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Stop Pay",
                  description: `${loadLabel} Extra Stop Compensation`,
                  quantityDecimal: 1,
                  rateCents: compProfile.stopPayCents,
                  amountCents: compProfile.stopPayCents,
                  sourceType: "load",
                  createdAt: nowIso
                });
              }
              if (compProfile.detentionHourlyRateCents && compProfile.detentionHourlyRateCents > 0 && ld.detentionHours) {
                const detHours = Number(ld.detentionHours);
                const detAmt = Math.round(detHours * compProfile.detentionHourlyRateCents);
                lineItems.push({
                  id: `line_earn_det_${ld.id}_${Date.now()}`,
                  companyId,
                  loadId: ld.id,
                  type: "earning",
                  category: "Detention Pay",
                  description: `${loadLabel}: ${detHours} detention hrs @ $${(compProfile.detentionHourlyRateCents / 100).toFixed(2)}/hr`,
                  quantityDecimal: detHours,
                  rateCents: compProfile.detentionHourlyRateCents,
                  amountCents: detAmt,
                  sourceType: "load",
                  createdAt: nowIso
                });
              }
            }
          }
        }
      } else if (compProfile && compProfile.payMethod === 'salary') {
        const salAmt = compProfile.salaryAmountCents || 120000;
        lineItems.push({
          id: `line_earn_sal_${Date.now()}`,
          companyId,
          loadId: null,
          type: "earning",
          category: "Base Salary",
          description: `Fixed Salary Allocation (${startIso} to ${endIso})`,
          quantityDecimal: 1,
          rateCents: salAmt,
          amountCents: salAmt,
          sourceType: "system",
          createdAt: nowIso
        });
      }

        // Calculate total driver gross earnings accumulated so far
        const totalDriverGrossEarningsCents = lineItems
          .filter(l => l.type === "earning")
          .reduce((sum, l) => sum + Math.round(l.amountCents || 0), 0);

        // Universal Dispatch Fee Deduction and Recurring Deductions if compProfile exists
        if (compProfile) {
          if (compProfile.dispatchFeeBasisPoints && compProfile.dispatchFeeBasisPoints > 0) {
            // Base for dispatch fee: use grossRevenueCents if > 0, else fall back to driver's gross earnings for the load
            const dispatchBaseCents = grossRevenueCents > 0 ? grossRevenueCents : totalDriverGrossEarningsCents;
            if (dispatchBaseCents > 0) {
              const dispatchFeeCents = Math.round((dispatchBaseCents * compProfile.dispatchFeeBasisPoints) / 10000);
              if (dispatchFeeCents > 0) {
                lineItems.push({
                  id: `line_ded_dispatch_${Date.now()}`,
                  companyId,
                  loadId: loadId || null,
                  type: "deduction",
                  category: "Dispatch Fee",
                  description: `Dispatch Fee @ ${(compProfile.dispatchFeeBasisPoints / 100).toFixed(2)}%`,
                  quantityDecimal: 1,
                  rateCents: dispatchFeeCents,
                  percentageBasisPoints: compProfile.dispatchFeeBasisPoints,
                  amountCents: dispatchFeeCents,
                  sourceType: "deduction",
                  createdAt: nowIso
                });
              }
            }
          }

          // Universal Recurring Deductions
          if (compProfile.defaultInsuranceDeductionCents && compProfile.defaultInsuranceDeductionCents > 0) {
            lineItems.push({
              id: `line_ded_ins_${Date.now()}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: "Insurance",
              description: "Default Insurance Deduction",
              quantityDecimal: 1,
              rateCents: compProfile.defaultInsuranceDeductionCents,
              amountCents: compProfile.defaultInsuranceDeductionCents,
              sourceType: "deduction",
              createdAt: nowIso
            });
          }
          if (compProfile.defaultTrailerRentCents && compProfile.defaultTrailerRentCents > 0) {
            lineItems.push({
              id: `line_ded_trailer_${Date.now()}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: "Trailer Rent",
              description: "Default Trailer Rental Fee",
              quantityDecimal: 1,
              rateCents: compProfile.defaultTrailerRentCents,
              amountCents: compProfile.defaultTrailerRentCents,
              sourceType: "deduction",
              createdAt: nowIso
            });
          }
          if (compProfile.defaultEscrowDeductionCents && compProfile.defaultEscrowDeductionCents > 0) {
            lineItems.push({
              id: `line_ded_escrow_${Date.now()}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: "Escrow",
              description: "Default Escrow Account Contribution",
              quantityDecimal: 1,
              rateCents: compProfile.defaultEscrowDeductionCents,
              amountCents: compProfile.defaultEscrowDeductionCents,
              sourceType: "deduction",
              createdAt: nowIso
            });
          }
          if (compProfile.defaultMaintenanceDeductionCents && compProfile.defaultMaintenanceDeductionCents > 0) {
            lineItems.push({
              id: `line_ded_maint_${Date.now()}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: "Maintenance Escrow",
              description: "Default Maintenance Reserve",
              quantityDecimal: 1,
              rateCents: compProfile.defaultMaintenanceDeductionCents,
              amountCents: compProfile.defaultMaintenanceDeductionCents,
              sourceType: "deduction",
              createdAt: nowIso
            });
          }
        } else {
          // Fallback default if no compensation profile found
          const earnAmt = Math.round((grossRevenueCents || 100000) * 0.6);
          lineItems.push({
            id: `line_earn_fallback_${Date.now()}`,
            companyId,
            loadId: loadId || null,
            type: "earning",
            category: "Base Pay",
            description: `Base Pay (Standard Fallback)`,
            quantityDecimal: 1,
            rateCents: earnAmt,
            amountCents: earnAmt,
            sourceType: "load",
            createdAt: nowIso
          });
        }

      // Fetch Fuel Transactions & Entries for driver / load (Itemized Product Lines)
      if (targetDriverUid || loadId) {
        const deductDiesel = compProfile?.deductDieselFuel !== false && compProfile?.deductActualFuel !== false;
        const deductDef = compProfile?.deductDef !== false && compProfile?.deductActualFuel !== false;
        const deductReefer = compProfile?.deductReeferFuel !== false && compProfile?.deductActualFuel !== false;
        const deductFees = compProfile?.deductFuelCardFees !== false && compProfile?.deductActualFuel !== false;

        // 1. Query fuel_transactions connected to driver or driver fuel cards
        const driverCardLast4s = new Set<string>();
        const driverCardIds = new Set<string>();
        if (targetDriverUid) {
          try {
            const cardsSnap = await db.collection("admins").doc(companyId).collection("fuel_cards").get();
            cardsSnap.forEach(cdDoc => {
              const cd = cdDoc.data();
              if (cd.assignedDriverId === targetDriverUid || cd.driverId === targetDriverUid) {
                if (cd.id) driverCardIds.add(String(cd.id));
                if (cd.cardNumberLast4) driverCardLast4s.add(String(cd.cardNumberLast4));
                if (cd.cardNumberMasked) {
                  const digits = String(cd.cardNumberMasked).replace(/\D/g, '');
                  if (digits.length >= 4) driverCardLast4s.add(digits.slice(-4));
                }
              }
            });
          } catch (cErr) {
            console.warn("Could not query driver fuel cards:", cErr);
          }
        }

        const allTxSnap = await db.collection("admins").doc(companyId).collection("fuel_transactions").get();
        const candidateTxDocs: any[] = [];

        allTxSnap.forEach(txDoc => {
          const txData = txDoc.data();
          if (txData.settlementStatus === 'settled' || settledFuelTxSet.has(txDoc.id) || settledFuelTxSet.has(String(txData.id))) return;

          if (loadId) {
            if (txData.loadId === loadId) candidateTxDocs.push(txDoc);
          } else if (targetDriverUid) {
            const txCardLast4 = txData.cardNumberMasked ? String(txData.cardNumberMasked).replace(/\D/g, '').slice(-4) : (txData.cardNumberLast4 ? String(txData.cardNumberLast4) : '');
            const isDirectDriverMatch = txData.driverId === targetDriverUid || txData.assignedDriverId === targetDriverUid;
            const isCardMatch = (txData.fuelCardId && driverCardIds.has(String(txData.fuelCardId))) || (txCardLast4 && driverCardLast4s.has(txCardLast4));
            
            if (isDirectDriverMatch || isCardMatch) {
              candidateTxDocs.push(txDoc);
            }
          }
        });

        const rawFuelLineItems: any[] = [];

        for (const txDoc of candidateTxDocs) {
          const txData = txDoc.data();
          if (txData.settlementStatus !== 'settled') {
            const txDate = normDateStr(txData.transactionDate || txData.date || txData.createdAt);
            if (!loadId && txDate && (txDate < startIso || txDate > endIso)) {
              continue; // Exclude fuel transactions outside of the payroll date range
            }

            const productLinesSnap = await txDoc.ref.collection("product_lines").get();
            
            if (!productLinesSnap.empty) {
              productLinesSnap.forEach((plDoc: any) => {
                const pl = plDoc.data();
                const pType = pl.productType || 'diesel';
                let category = "Fuel Card Deduction";
                let shouldDeduct = true;

                if (pType === 'diesel') {
                  category = "Diesel Fuel Deduction";
                  shouldDeduct = deductDiesel;
                } else if (pType === 'def') {
                  category = "DEF (Fluid) Deduction";
                  shouldDeduct = deductDef;
                } else if (pType === 'reefer_fuel') {
                  category = "Reefer Fuel Deduction";
                  shouldDeduct = deductReefer;
                } else if (pType === 'fee') {
                  category = "Fuel Card Fee Deduction";
                  shouldDeduct = deductFees;
                }

                if (shouldDeduct && pl.amountCents > 0) {
                  rawFuelLineItems.push({
                    id: `line_tx_pl_${txData.id}_${plDoc.id}`,
                    companyId,
                    loadId: txData.loadId || loadId || null,
                    type: "deduction",
                    category,
                    description: `${pl.description || category} at ${txData.merchant || txData.vendor || 'Station'} (${txData.transactionDate || txDate})`,
                    quantityDecimal: pl.gallonsDecimal || 1,
                    rateCents: pl.pricePerGallonCents || 0,
                    amountCents: pl.amountCents,
                    sourceType: "fuel_transaction",
                    sourceId: txData.id,
                    createdAt: nowIso
                  });
                }
              });
            } else {
              // Fallback for single line fuel transaction
              if (deductDiesel && txData.totalAmountCents > 0) {
                rawFuelLineItems.push({
                  id: `line_tx_${txData.id}`,
                  companyId,
                  loadId: txData.loadId || loadId || null,
                  type: "deduction",
                  category: "Diesel Fuel Deduction",
                  description: `Fuel Card purchase at ${txData.merchant || txData.vendor || 'Station'} (${txData.transactionDate || txDate})`,
                  quantityDecimal: txData.gallonsDecimal || 1,
                  rateCents: txData.pricePerGallonCents || 0,
                  amountCents: txData.totalAmountCents,
                  sourceType: "fuel_transaction",
                  sourceId: txData.id,
                  createdAt: nowIso
                });
              }
            }
          }
        }

        // 2. Query legacy manual fuel_entries
        let fuelQuery: any = db.collection("admins").doc(companyId).collection("fuel_entries");
        if (loadId) {
          fuelQuery = fuelQuery.where("loadId", "==", loadId);
        } else if (targetDriverUid) {
          fuelQuery = fuelQuery.where("driverId", "==", targetDriverUid);
        }

        const fuelSnap = await fuelQuery.get();
        fuelSnap.forEach((doc: any) => {
          const fe = doc.data();
          if (fe.allocationStatus !== 'allocated' && fe.settlementStatus !== 'settled' && deductDiesel) {
            const feDate = normDateStr(fe.transactionDate || fe.date || fe.createdAt);
            if (!loadId && feDate && (feDate < startIso || feDate > endIso)) {
              return; // Exclude manual fuel entries outside date range
            }
            const amt = Math.round(Number(fe.totalAmountCents || 0));
            rawFuelLineItems.push({
              id: `line_fuel_${fe.id}`,
              companyId,
              loadId: fe.loadId || loadId || null,
              type: "deduction",
              category: "Fuel Deduction (Manual)",
              description: `Fuel purchase at ${fe.merchant || fe.fuelVendor || 'Station'} (${fe.gallonsDecimal || fe.gallons || 0} gal @ $${(((fe.pricePerGallonCents || 0)) / 100).toFixed(2)}/gal)`,
              quantityDecimal: fe.gallonsDecimal || fe.gallons || 1,
              rateCents: fe.pricePerGallonCents || 0,
              amountCents: amt,
              sourceType: "fuel",
              sourceId: fe.id,
              createdAt: nowIso
            });
          }
        });

        // Consolidate rawFuelLineItems into category summary rows
        const fuelGroups = new Map<string, {
          category: string;
          items: any[];
          totalAmountCents: number;
          totalGallons: number;
          sourceTransactionIds: string[];
          sourceEntryIds: string[];
        }>();

        rawFuelLineItems.forEach(fi => {
          const cat = fi.category || "Fuel Deduction";
          if (!fuelGroups.has(cat)) {
            fuelGroups.set(cat, {
              category: cat,
              items: [],
              totalAmountCents: 0,
              totalGallons: 0,
              sourceTransactionIds: [],
              sourceEntryIds: []
            });
          }
          const grp = fuelGroups.get(cat)!;
          grp.items.push(fi);
          grp.totalAmountCents += fi.amountCents || 0;
          grp.totalGallons += Number(fi.quantityDecimal || 0);

          if (fi.sourceType === 'fuel_transaction' && fi.sourceId) {
            if (!grp.sourceTransactionIds.includes(fi.sourceId)) grp.sourceTransactionIds.push(fi.sourceId);
          } else if ((fi.sourceType === 'fuel' || fi.sourceType === 'fuel_entry') && fi.sourceId) {
            if (!grp.sourceEntryIds.includes(fi.sourceId)) grp.sourceEntryIds.push(fi.sourceId);
          }
        });

        fuelGroups.forEach((grp, cat) => {
          if (grp.items.length === 1) {
            lineItems.push(grp.items[0]);
          } else if (grp.items.length > 1) {
            const galStr = grp.totalGallons > 0 ? `, ${grp.totalGallons.toFixed(1)} Gallons` : '';
            const avgRateCents = grp.totalGallons > 0 ? Math.round(grp.totalAmountCents / grp.totalGallons) : 0;
            lineItems.push({
              id: `line_fuel_summary_${cat.replace(/\s+/g, '_')}_${Date.now()}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: grp.category,
              description: `Total ${grp.category} Charges (${grp.items.length} Transactions${galStr})`,
              quantityDecimal: grp.totalGallons || 1,
              rateCents: avgRateCents,
              amountCents: grp.totalAmountCents,
              sourceType: "fuel_transaction_group",
              sourceTransactionIds: grp.sourceTransactionIds,
              sourceEntryIds: grp.sourceEntryIds,
              createdAt: nowIso
            });
          }
        });
      }

      // Fetch open Advances for driver
      if (targetDriverUid) {
        const advSnap = await db.collection("admins").doc(companyId).collection("advances")
          .where("driverId", "==", targetDriverUid)
          .where("status", "==", "open")
          .get();

        advSnap.forEach((doc: any) => {
          const adv = doc.data();
          if (settledAdvanceSet.has(doc.id) || settledAdvanceSet.has(String(adv.id)) || adv.status === 'repaid' || adv.status === 'void') return;
          
          const advDate = normDateStr(adv.issuedAt || adv.createdAt || adv.issueDate);
          if (!loadId && advDate && advDate > endIso) {
            return; // Exclude advances issued after period end date
          }
          const remBal = Math.round(Number(adv.remainingBalanceCents || 0));
          if (remBal > 0) {
            let deductAmt = remBal;
            if (adv.deductionMethod === 'fixed_per_settlement' && adv.fixedDeductionCents) {
              deductAmt = Math.min(remBal, adv.fixedDeductionCents);
            }
            const issueDateStr = adv.issuedAt ? new Date(adv.issuedAt).toLocaleDateString() : (adv.createdAt ? new Date(adv.createdAt).toLocaleDateString() : '—');
            const checkRefStr = adv.checkNumber || adv.comcheckNumber || adv.referenceNumber || adv.id;
            const typeLabel = adv.type ? (adv.type === 'check' || adv.type === 'comcheck' ? 'Comcheck / Check' : adv.type.toUpperCase()) : 'Cash Advance';
            const notesStr = (adv.notes || adv.memo) ? ` | Note: ${adv.notes || adv.memo}` : '';

            lineItems.push({
              id: `line_adv_${adv.id}`,
              companyId,
              loadId: loadId || null,
              type: "deduction",
              category: "Advance / Comcheck Repayment",
              description: `${typeLabel} (Check/Ref #${checkRefStr}) - Issued: ${issueDateStr}${notesStr}`,
              quantityDecimal: 1,
              rateCents: deductAmt,
              amountCents: deductAmt,
              sourceType: "advance",
              sourceId: adv.id,
              issuedAt: adv.issuedAt || adv.createdAt || null,
              checkNumber: checkRefStr,
              notes: adv.notes || adv.memo || null,
              createdAt: nowIso
            });
          }
        });
      }

      // Calculate Totals Server-Side in Cents
      let totalEarningsCents = 0;
      let totalDeductionsCents = 0;
      let totalReimbursementsCents = 0;

      lineItems.forEach(item => {
        if (item.type === "earning") {
          totalEarningsCents += Math.round(item.amountCents);
        } else if (item.type === "deduction") {
          totalDeductionsCents += Math.round(item.amountCents);
        } else if (item.type === "reimbursement") {
          totalReimbursementsCents += Math.round(item.amountCents);
        }
      });

      const netPayCents = totalEarningsCents + totalReimbursementsCents - totalDeductionsCents;
      const calculationVersion = 1;

      // Compute Calculation Hash for Hash Verification & Lock Audit
      const hashPayload = JSON.stringify({
        companyId,
        driverId: targetDriverUid,
        loadId: loadId || null,
        compProfileId: compProfile?.id || null,
        compProfileVersion: compProfile?.version || null,
        totalEarningsCents,
        totalDeductionsCents,
        totalReimbursementsCents,
        netPayCents,
        lineItems: lineItems.map(l => ({ id: l.id, amountCents: l.amountCents, type: l.type }))
      });

      const calculationHash = crypto.createHash("sha256").update(hashPayload).digest("hex");
      const settlementId = `settlement_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const settlementNumber = `SET-${Math.floor(100000 + Math.random() * 900000)}`;
      const poNumber = req.body.poNumber || `PO #${Math.floor(100000 + Math.random() * 900000)}`;

      const typeOfSettlement = settlementType || (workerType === 'owner_operator' ? "owner_operator" : "driver");

      const settlement = {
        id: settlementId,
        settlementNumber,
        poNumber,
        companyId,
        workerId: targetDriverUid,
        workerType,
        loadId: loadId || null,
        loadIds: loadId ? [loadId] : [],
        driverId: targetDriverUid || null,
        driverName: driverData?.name || driverData?.email || 'Assigned Driver',
        driverEmail: driverData?.email || null,
        driverPhone: driverData?.phone || driverData?.phoneNumber || null,
        ownerOperatorId: ownerOperatorId || (workerType === 'owner_operator' ? targetDriverUid : null),
        ownerOperatorName: driverData?.ownerOperatorName || null,
        truckId: loadData?.truckId || driverData?.truckNumber || null,
        settlementType: typeOfSettlement,
        compensationProfileId: compProfile?.id || null,
        compensationProfileVersion: compProfile?.version || null,
        periodStart: periodStart || (loadData?.pickupDate ? loadData.pickupDate : (loadData?.deliveryDate ? loadData.deliveryDate : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])),
        periodEnd: periodEnd || (loadData?.deliveryDate ? loadData.deliveryDate : new Date().toISOString().split('T')[0]),
        settlementPeriodStart: periodStart || (loadData?.pickupDate ? loadData.pickupDate : (loadData?.deliveryDate ? loadData.deliveryDate : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])),
        settlementPeriodEnd: periodEnd || (loadData?.deliveryDate ? loadData.deliveryDate : new Date().toISOString().split('T')[0]),
        totalMiles: loadedMiles + emptyMiles,
        status: "draft",
        grossRevenueCents,
        eligibleRevenueCents: grossRevenueCents,
        totalEarningsCents,
        totalDeductionsCents,
        totalReimbursementsCents,
        netPayCents,
        currency: "USD",
        calculationVersion,
        calculationHash,
        quickBooksVendorId: null,
        quickBooksBillId: null,
        quickBooksBillPaymentId: null,
        stripeTransferId: null,
        paymentStatus: "unpaid",
        createdByUid: authRes.callerUid,
        reviewedByUid: null,
        approvedByUid: null,
        lockedByUid: null,
        paidByUid: null,
        createdAt: nowIso,
        calculatedAt: nowIso,
        reviewedAt: null,
        approvedAt: null,
        lockedAt: null,
        syncedAt: null,
        paidAt: null,
        readinessChecks,
        settlementReadiness,
        lineItems: lineItems.map(li => ({ ...li, settlementId }))
      };

      if (saveDraft) {
        // Save settlement document
        const { lineItems: itemsToSave, ...settlementDoc } = settlement;
        await db.collection("admins").doc(companyId).collection("settlements").doc(settlementId).set(settlementDoc);

        // Save line items subcollection & mark fuel transactions as settled
        for (const li of itemsToSave) {
          await db.collection("admins").doc(companyId).collection("settlements").doc(settlementId).collection("line_items").doc(li.id).set(li);
          if (li.sourceType === 'fuel_transaction_group') {
            if (Array.isArray(li.sourceTransactionIds)) {
              for (const srcId of li.sourceTransactionIds) {
                await db.collection("admins").doc(companyId).collection("fuel_transactions").doc(srcId).update({
                  settlementStatus: 'settled',
                  settlementId,
                  settledAt: nowIso,
                  deductedInSettlement: true
                }).catch(() => {});
              }
            }
            if (Array.isArray(li.sourceEntryIds)) {
              for (const srcId of li.sourceEntryIds) {
                await db.collection("admins").doc(companyId).collection("fuel_entries").doc(srcId).update({
                  settlementStatus: 'settled',
                  allocationStatus: 'allocated',
                  settlementId,
                  settledAt: nowIso,
                  deductedInSettlement: true
                }).catch(() => {});
              }
            }
          } else if (li.sourceType === 'fuel_transaction' && li.sourceId) {
            await db.collection("admins").doc(companyId).collection("fuel_transactions").doc(li.sourceId).update({
              settlementStatus: 'settled',
              settlementId,
              settledAt: nowIso,
              deductedInSettlement: true
            }).catch(() => {});
          } else if ((li.sourceType === 'fuel' || li.sourceType === 'fuel_entry') && li.sourceId) {
            await db.collection("admins").doc(companyId).collection("fuel_entries").doc(li.sourceId).update({
              settlementStatus: 'settled',
              allocationStatus: 'allocated',
              settlementId,
              settledAt: nowIso,
              deductedInSettlement: true
            }).catch(() => {});
          }
        }

        // Audit log
        const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
          id: auditId,
          companyId,
          userId: authRes.callerUid,
          action: "calculate_settlement_draft",
          entityType: "settlement",
          entityId: settlementId,
          after: settlementDoc,
          createdAt: nowIso
        });
      }

      return res.json({ success: true, settlement });
    } catch (err: any) {
      console.error("Error calculating settlement:", err);
      return res.status(500).json({ error: err.message || "Failed to calculate settlement" });
    }
  });

  // ==========================================
  // SETTLEMENT STATUS & LOCK WORKFLOW
  // ==========================================

  app.post("/api/accounting/settlement-status", async (req, res) => {
    const { companyId, settlementId, targetStatus, lineItems } = req.body;

    if (!companyId || !settlementId || !targetStatus) {
      return res.status(400).json({ error: "Missing required fields: companyId, settlementId, targetStatus" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot alter settlement status" });
    }

    try {
      const db = getFirestoreDb();
      const setDocRef = db.collection("admins").doc(companyId).collection("settlements").doc(settlementId);
      const snap = await setDocRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: "Settlement record not found" });
      }

      const existingData = snap.data()!;
      const currentStatus = existingData.status;

      // MANDATORY LOCK RULE: Locked or Paid settlements CANNOT be modified or unlocked!
      if (currentStatus === "locked" || currentStatus === "paid" || currentStatus === "synced") {
        if (targetStatus !== "paid" && targetStatus !== "synced") {
          return res.status(400).json({
            error: `Settlement ${settlementId} is ${currentStatus} and strictly LOCKED. Once locked, modifications are prohibited. Create an adjustment record instead.`
          });
        }
      }

      // Role Check for Status Transitions
      if (targetStatus === "approved" || targetStatus === "locked") {
        const isAllowedAdmin = ["admin", "company_admin", "fleet_admin"].includes(authRes.role) || authRes.isSuperAdmin;
        const isAllowedDispatcher = authRes.role === "dispatcher";
        if (!isAllowedAdmin && !isAllowedDispatcher) {
          return res.status(403).json({ error: `Forbidden: Only Admins or authorized Dispatchers can move settlements to '${targetStatus}'` });
        }
      }

      const nowIso = new Date().toISOString();
      const updates: any = {
        status: targetStatus,
        updatedAt: nowIso
      };

      if (targetStatus === "reviewed") {
        updates.reviewedByUid = authRes.callerUid;
        updates.reviewedAt = nowIso;
      } else if (targetStatus === "approved") {
        updates.approvedByUid = authRes.callerUid;
        updates.approvedAt = nowIso;
      } else if (targetStatus === "locked") {
        updates.lockedByUid = authRes.callerUid;
        updates.lockedAt = nowIso;
      } else if (targetStatus === "paid") {
        updates.paidByUid = authRes.callerUid;
        updates.paidAt = nowIso;
        updates.paymentStatus = "paid";
      }

      // Recalculate line items if passed and settlement is not locked
      if (Array.isArray(lineItems) && currentStatus !== "locked" && currentStatus !== "paid") {
        let eCents = 0;
        let dCents = 0;
        let rCents = 0;

        for (const item of lineItems) {
          const qty = Number(item.quantity || 1);
          const rate = Math.round(Number(item.rateCents || item.amountCents || 0));
          const amt = Math.round(Number(item.amountCents || qty * rate));

          if (item.type === "earning") eCents += amt;
          else if (item.type === "deduction") dCents += amt;
          else if (item.type === "reimbursement") rCents += amt;

          const itemId = item.id || `line_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          await setDocRef.collection("line_items").doc(itemId).set({
            ...item,
            id: itemId,
            settlementId,
            companyId,
            amountCents: amt,
            createdAt: item.createdAt || nowIso
          });
        }

        updates.totalEarningsCents = eCents;
        updates.totalDeductionsCents = dCents;
        updates.totalReimbursementsCents = rCents;
        updates.netPayCents = eCents - dCents + rCents;
      }

      await setDocRef.update(updates);

      // Mark linked fuel transactions / entries as settled when status is approved, locked, or paid
      if (targetStatus === "approved" || targetStatus === "locked" || targetStatus === "paid") {
        try {
          const lineSnap = await setDocRef.collection("line_items").get();
          lineSnap.forEach(liDoc => {
            const li = liDoc.data();
            if (li.sourceType === 'fuel_transaction' && li.sourceId) {
              db.collection("admins").doc(companyId).collection("fuel_transactions").doc(li.sourceId).update({
                settlementStatus: 'settled',
                settlementId,
                settledAt: nowIso,
                deductedInSettlement: true
              }).catch(() => {});
            } else if ((li.sourceType === 'fuel' || li.sourceType === 'fuel_entry') && li.sourceId) {
              db.collection("admins").doc(companyId).collection("fuel_entries").doc(li.sourceId).update({
                settlementStatus: 'settled',
                allocationStatus: 'allocated',
                settlementId,
                settledAt: nowIso,
                deductedInSettlement: true
              }).catch(() => {});
            }
          });
        } catch (fErr) {
          console.warn("Could not sync fuel transaction settled status:", fErr);
        }
      }

      // Save Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: `update_status_to_${targetStatus}`,
        entityType: "settlement",
        entityId: settlementId,
        before: existingData,
        after: { ...existingData, ...updates },
        createdAt: nowIso
      });

      return res.json({ success: true, settlementId, targetStatus, updates });
    } catch (err: any) {
      console.error("Error updating settlement status:", err);
      return res.status(500).json({ error: err.message || "Failed to update settlement status" });
    }
  });

  app.get("/api/accounting/settlements/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let query: any = db.collection("admins").doc(companyId).collection("settlements");

      if (authRes.role === "driver") {
        query = query.where("driverId", "==", authRes.callerUid);
      }

      const snap = await query.get();
      const settlements: any[] = [];

      for (const doc of snap.docs) {
        const sData = doc.data();

        // Security check for driver: only view approved/locked/synced/paid
        if (authRes.role === "driver") {
          if (!["approved", "locked", "synced", "paid"].includes(sData.status)) {
            continue;
          }
        }

        let viewModel: any = null;
        try {
          viewModel = await buildSettlementStatementViewModel({ companyId, settlementId: doc.id, dbOverride: db });
        } catch (vErr) {
          console.warn(`Could not build view model for settlement ${doc.id}:`, vErr);
        }

        if (viewModel) {
          settlements.push({
            ...sData,
            periodStart: viewModel.statement.periodStart,
            periodEnd: viewModel.statement.periodEnd,
            settlementPeriodStart: viewModel.statement.periodStart,
            settlementPeriodEnd: viewModel.statement.periodEnd,
            grossRevenueCents: viewModel.totals.grossRevenueCents,
            totalEarningsCents: viewModel.totals.totalEarningsCents,
            totalDeductionsCents: viewModel.totals.totalDeductionsCents,
            totalReimbursementsCents: viewModel.totals.totalReimbursementsCents,
            netPayCents: viewModel.totals.netSettlementCents,
            driverName: viewModel.payee.legalName,
            truckNumber: viewModel.equipment.trucks[0]?.truckNumber || sData.truckNumber || 'N/A',
            includedLoadIds: viewModel.loads.map((l: any) => l.loadId),
            lineItems: viewModel.lineItems,
            loads: viewModel.loads,
            viewModel
          });
        } else {
          // Fetch line items fallback
          const lineSnap = await doc.ref.collection("line_items").get();
          const lineItems: any[] = [];
          lineSnap.forEach(lDoc => lineItems.push(lDoc.data()));

          settlements.push({
            ...sData,
            lineItems
          });
        }
      }

      settlements.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return res.json({ success: true, settlements });
    } catch (err: any) {
      console.error("Error fetching settlements:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch settlements" });
    }
  });

  app.delete("/api/accounting/settlement/:companyId/:settlementId", async (req, res) => {
    const { companyId, settlementId } = req.params;

    if (!companyId || !settlementId) {
      return res.status(400).json({ error: "Missing required parameters: companyId, settlementId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot delete settlements" });
    }

    try {
      const db = getFirestoreDb();
      const setRef = db.collection("admins").doc(companyId).collection("settlements").doc(settlementId);
      const snap = await setRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: "Settlement record not found" });
      }

      const existingData = snap.data()!;
      const currentStatus = (existingData.status || "draft").toString().toLowerCase();

      if (currentStatus !== "draft" && currentStatus !== "reviewed") {
        return res.status(400).json({
          error: `Cannot delete settlement with status '${existingData.status}'. Only draft settlements can be deleted.`
        });
      }

      // Delete subcollection line items and settlement document
      const lineSnap = await setRef.collection("line_items").get();
      const batch = db.batch();
      lineSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      batch.delete(setRef);
      await batch.commit();

      // Save Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "delete_settlement_draft",
        entityType: "settlement",
        entityId: settlementId,
        before: existingData,
        createdAt: new Date().toISOString()
      });

      return res.json({ success: true, deletedSettlementId: settlementId });
    } catch (err: any) {
      console.error("Error deleting settlement:", err);
      return res.status(500).json({ error: err.message || "Failed to delete settlement" });
    }
  });

  // ==========================================
  // CUSTOMER INVOICES
  // ==========================================

  app.post("/api/accounting/invoice", async (req, res) => {
    const { companyId, loadId, customerId, brokerName, invoiceNumber, lineItems, status } = req.body;

    if (!companyId || !brokerName) {
      return res.status(400).json({ error: "Missing required fields: companyId, brokerName" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot create customer invoices" });
    }

    try {
      const db = getFirestoreDb();
      const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();

      const items = Array.isArray(lineItems) ? lineItems : [
        { id: `invline_1`, category: "Linehaul", description: `Freight Charges`, amountCents: 150000 }
      ];

      let subtotalCents = 0;
      items.forEach((item: any) => {
        subtotalCents += Math.round(Number(item.amountCents || 0));
      });

      const taxCents = 0;
      const totalCents = subtotalCents + taxCents;

      const invoice = {
        id: invoiceId,
        companyId,
        loadId: loadId || null,
        customerId: customerId || null,
        brokerName,
        invoiceNumber: invoiceNumber || `INV-${Math.floor(100000 + Math.random() * 900000)}`,
        status: status || "draft",
        subtotalCents,
        taxCents,
        totalCents,
        currency: "USD",
        quickBooksInvoiceId: null,
        lineItems: items,
        createdAt: nowIso,
        approvedAt: status === "approved" ? nowIso : null,
        sentAt: null,
        paidAt: null
      };

      await db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId).set(invoice);

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "create_customer_invoice",
        entityType: "invoice",
        entityId: invoiceId,
        after: invoice,
        createdAt: nowIso
      });

      return res.json({ success: true, invoice });
    } catch (err: any) {
      console.error("Error creating customer invoice:", err);
      return res.status(500).json({ error: err.message || "Failed to create customer invoice" });
    }
  });

  app.get("/api/accounting/invoices/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("invoices").get();
      const invoices: any[] = [];
      snap.forEach(doc => invoices.push(doc.data()));

      invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ success: true, invoices });
    } catch (err: any) {
      console.error("Error fetching customer invoices:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch invoices" });
    }
  });

  app.delete("/api/accounting/invoice/:companyId/:invoiceId", async (req, res) => {
    const { companyId, invoiceId } = req.params;

    if (!companyId || !invoiceId) {
      return res.status(400).json({ error: "Missing required parameters: companyId, invoiceId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot delete customer invoices" });
    }

    try {
      const db = getFirestoreDb();
      const invRef = db.collection("admins").doc(companyId).collection("invoices").doc(invoiceId);
      const snap = await invRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: "Invoice record not found" });
      }

      const existingData = snap.data()!;
      const currentStatus = (existingData.status || "draft").toLowerCase();

      if (currentStatus !== "draft" && currentStatus !== "reviewed") {
        return res.status(400).json({
          error: `Cannot delete invoice with status '${existingData.status}'. Only draft invoices can be deleted.`
        });
      }

      await invRef.delete();

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "delete_customer_invoice_draft",
        entityType: "invoice",
        entityId: invoiceId,
        before: existingData,
        createdAt: new Date().toISOString()
      });

      return res.json({ success: true, deletedInvoiceId: invoiceId });
    } catch (err: any) {
      console.error("Error deleting customer invoice:", err);
      return res.status(500).json({ error: err.message || "Failed to delete customer invoice" });
    }
  });

  // ==========================================
  // QUICKBOOKS SYNC & IDEMPOTENCY
  // ==========================================

  app.post("/api/accounting/quickbooks-sync", async (req, res) => {
    const { companyId, entityType, entityId } = req.body;

    if (!companyId || !entityType || !entityId) {
      return res.status(400).json({ error: "Missing required fields: companyId, entityType, entityId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();

      // Check QuickBooks connection & account mapping
      const qbDoc = await db.collection("companies").doc(companyId).collection("integrations").doc("quickbooks").get();
      if (!qbDoc.exists || qbDoc.data()?.status !== "connected") {
        return res.status(400).json({ error: "QuickBooks Online is not connected for this carrier company." });
      }
      if (!qbDoc.data()?.accountMappingComplete) {
        return res.status(400).json({ error: "QuickBooks connected. Complete account mapping before syncing accounting records." });
      }

      const nowIso = new Date().toISOString();
      const collectionName = entityType === "invoice" ? "invoices" : entityType === "settlement" ? "settlements" : "fuel_entries";

      const docRef = db.collection("admins").doc(companyId).collection(collectionName).doc(entityId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: `${entityType} with ID ${entityId} not found` });
      }

      const entity = snap.data()!;

      // STRICT RULE: Do not sync draft records! Must be approved or locked.
      if (entity.status === "draft" || entity.status === "reviewed") {
        return res.status(400).json({
          error: `Cannot sync ${entityType} in '${entity.status}' status. Only APPROVED or LOCKED records can be synced to QuickBooks.`
        });
      }

      // IDEMPOTENCY CHECK: If already synced, prevent double-syncing!
      if (entity.status === "synced" && (entity.quickBooksInvoiceId || entity.quickBooksBillId)) {
        return res.json({
          success: true,
          message: `${entityType} ${entityId} is already synced to QuickBooks.`,
          externalId: entity.quickBooksInvoiceId || entity.quickBooksBillId,
          alreadySynced: true
        });
      }

      // Simulated QuickBooks Sandbox API Call
      const externalId = entityType === "invoice"
        ? `QB-INV-${Date.now()}`
        : entityType === "settlement"
        ? `QB-BILL-${Date.now()}`
        : `QB-EXP-${Date.now()}`;

      const updatePayload: any = {
        status: "synced",
        updatedAt: nowIso
      };

      if (entityType === "invoice") {
        updatePayload.quickBooksInvoiceId = externalId;
      } else if (entityType === "settlement") {
        updatePayload.quickBooksBillId = externalId;
      }

      await docRef.update(updatePayload);

      // Sync Log Record
      const syncLogId = `synclog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const syncLog = {
        id: syncLogId,
        companyId,
        provider: "quickbooks",
        action: `sync_${entityType}`,
        entityType,
        localEntityId: entityId,
        externalEntityId: externalId,
        status: "success",
        message: `Successfully synced ${entityType} to QuickBooks Sandbox. External ID: ${externalId}`,
        startedAt: nowIso,
        finishedAt: nowIso,
        error: null
      };

      await db.collection("admins").doc(companyId).collection("accounting_sync_logs").doc(syncLogId).set(syncLog);

      // Audit Log Record
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: `quickbooks_sync_${entityType}`,
        entityType: "quickbooks_sync",
        entityId,
        before: entity,
        after: { ...entity, ...updatePayload },
        createdAt: nowIso
      });

      return res.json({
        success: true,
        message: `Successfully synced ${entityType} to QuickBooks.`,
        externalId,
        syncLog
      });
    } catch (err: any) {
      console.error("Error syncing to QuickBooks:", err);
      return res.status(500).json({ error: err.message || "QuickBooks sync failed" });
    }
  });

  // ==========================================
  // QUICKBOOKS PAYMENT STATUS SYNC
  // ==========================================

  app.post("/api/accounting/quickbooks-payment-update", async (req, res) => {
    const { companyId, entityType, entityId, paymentStatus, paidAmountCents, externalPaymentId } = req.body;

    if (!companyId || !entityType || !entityId || !paymentStatus) {
      return res.status(400).json({ error: "Missing required fields: companyId, entityType, entityId, paymentStatus" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const collectionName = entityType === "invoice" ? "invoices" : "settlements";
      const docRef = db.collection("admins").doc(companyId).collection(collectionName).doc(entityId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: `${entityType} record ${entityId} not found` });
      }

      const existingData = snap.data()!;
      const nowIso = new Date().toISOString();

      const updatePayload: any = {
        paymentStatus,
        updatedAt: nowIso
      };

      if (paidAmountCents !== undefined) {
        updatePayload.paidAmountCents = Math.round(Number(paidAmountCents));
      }

      if (paymentStatus === "paid") {
        updatePayload.paidAt = nowIso;
        updatePayload.status = "paid";
      } else if (paymentStatus === "partially_paid") {
        updatePayload.status = "partially_paid";
      }

      if (entityType === "invoice") {
        updatePayload.quickBooksPaymentId = externalPaymentId || `QB-PMT-${Date.now()}`;
      } else {
        updatePayload.quickBooksBillPaymentId = externalPaymentId || `QB-BILLPMT-${Date.now()}`;
      }

      await docRef.update(updatePayload);

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: `quickbooks_payment_status_${paymentStatus}`,
        entityType: entityType,
        entityId,
        before: existingData,
        after: { ...existingData, ...updatePayload },
        createdAt: nowIso
      });

      return res.json({ success: true, message: `Updated payment status for ${entityType} ${entityId} to ${paymentStatus}`, updates: updatePayload });
    } catch (err: any) {
      console.error("Error updating QuickBooks payment status:", err);
      return res.status(500).json({ error: err.message || "QuickBooks payment update failed" });
    }
  });

  // ==========================================
  // SYNC & AUDIT LOGS ENDPOINT
  // ==========================================

  // ==========================================
  // OWNER OPERATOR COMPANIES & TRUCKS ENDPOINTS
  // ==========================================

  app.get("/api/accounting/owner-operators/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const snap = await db.collection("admins").doc(companyId).collection("owner_operators").get();
      const ownerOperators: any[] = [];
      snap.forEach(doc => ownerOperators.push(doc.data()));

      return res.json({ success: true, ownerOperators });
    } catch (err: any) {
      console.error("Error fetching owner operators:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch owner operators" });
    }
  });

  app.post("/api/accounting/owner-operator", async (req, res) => {
    const {
      companyId,
      id,
      legalName,
      dbaName,
      ownerName,
      email,
      phone,
      address,
      taxIdLast4,
      quickBooksVendorId,
      settlementFrequency,
      defaultPayMethod,
      defaultPayBasisPoints,
      dispatchFeeBasisPoints,
      deductFuel,
      deductAdvances,
      deductTolls,
      deductInsurance,
      deductTrailerRent,
      deductMaintenance,
      deductEscrow,
      deductChargebacks,
      defaultInsuranceDeductionCents,
      defaultTrailerRentCents,
      defaultEscrowDeductionCents,
      defaultMaintenanceDeductionCents,
      status,
      confirmDuplicate
    } = req.body;

    const fieldErrors: Record<string, string> = {};

    const trimmedLegalName = typeof legalName === 'string' ? legalName.trim() : '';
    const trimmedOwnerName = typeof ownerName === 'string' ? ownerName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedTaxIdLast4 = typeof taxIdLast4 === 'string' ? taxIdLast4.trim() : '';

    if (!companyId) {
      fieldErrors.companyId = "Company ID is required.";
    }
    if (!trimmedLegalName) {
      fieldErrors.legalName = "Legal Company Name is required.";
    }
    if (!trimmedOwnerName) {
      fieldErrors.ownerName = "Owner / Primary Contact is required.";
    }
    if (trimmedTaxIdLast4 && !/^\d{4}$/.test(trimmedTaxIdLast4)) {
      fieldErrors.taxIdLast4 = "Tax ID / EIN Last 4 must contain exactly 4 digits.";
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = "Please enter a valid email address.";
    }

    const payBasisVal = defaultPayBasisPoints !== undefined ? Number(defaultPayBasisPoints) : 8500;
    if (isNaN(payBasisVal) || payBasisVal < 0 || payBasisVal > 10000) {
      fieldErrors.defaultPayBasisPoints = "Default Pay Basis must be between 0% and 100%.";
    }

    const dispatchFeeVal = dispatchFeeBasisPoints !== undefined ? Number(dispatchFeeBasisPoints) : 1000;
    if (isNaN(dispatchFeeVal) || dispatchFeeVal < 0 || dispatchFeeVal > 10000) {
      fieldErrors.dispatchFeeBasisPoints = "Dispatch Fee must be between 0% and 100%.";
    }

    if (defaultInsuranceDeductionCents !== undefined && Number(defaultInsuranceDeductionCents) < 0) {
      fieldErrors.insurance = "Insurance deduction cannot be negative.";
    }
    if (defaultMaintenanceDeductionCents !== undefined && Number(defaultMaintenanceDeductionCents) < 0) {
      fieldErrors.maintenance = "Maintenance deduction cannot be negative.";
    }
    if (defaultEscrowDeductionCents !== undefined && Number(defaultEscrowDeductionCents) < 0) {
      fieldErrors.escrow = "Escrow deduction cannot be negative.";
    }
    if (defaultTrailerRentCents !== undefined && Number(defaultTrailerRentCents) < 0) {
      fieldErrors.trailerRent = "Trailer Rent deduction cannot be negative.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({
        success: false,
        errorCode: "VALIDATION_ERROR",
        error: "We could not save this owner-operator company. Review the highlighted fields.",
        fieldErrors
      });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot manage owner operator companies" });
    }

    try {
      const db = getFirestoreDb();

      // Duplicate Check if creating new and not confirmed
      if (!id && companyId && !confirmDuplicate) {
        const existingSnap = await db.collection("admins").doc(companyId).collection("owner_operators").get();
        let duplicateMatch: any = null;
        existingSnap.forEach(doc => {
          const d = doc.data();
          if (d.legalName && d.legalName.trim().toLowerCase() === trimmedLegalName.toLowerCase()) {
            duplicateMatch = d;
          } else if (trimmedTaxIdLast4 && d.taxIdLast4 && d.taxIdLast4.trim() === trimmedTaxIdLast4) {
            duplicateMatch = d;
          }
        });
        if (duplicateMatch) {
          return res.status(409).json({
            success: false,
            isDuplicate: true,
            errorCode: "DUPLICATE_FOUND",
            error: "A company with a similar legal name or Tax ID may already exist.",
            duplicateRecord: duplicateMatch
          });
        }
      }

      const ooId = id || `oo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();

      const ooDoc = {
        id: ooId,
        companyId,
        legalName: legalName.trim(),
        dbaName: dbaName ? dbaName.trim() : "",
        ownerName: ownerName.trim(),
        email: email ? email.trim() : "",
        phone: phone ? phone.trim() : "",
        address: address ? address.trim() : "",
        taxIdLast4: taxIdLast4 ? taxIdLast4.trim() : "",
        quickBooksVendorId: quickBooksVendorId || null,

        settlementFrequency: settlementFrequency || "weekly",
        defaultPayMethod: defaultPayMethod || "percentage_of_gross",
        defaultPayBasisPoints: defaultPayBasisPoints !== undefined ? Number(defaultPayBasisPoints) : 8500, // default 85%
        dispatchFeeBasisPoints: dispatchFeeBasisPoints !== undefined ? Number(dispatchFeeBasisPoints) : 1000, // default 10%

        deductFuel: deductFuel !== undefined ? Boolean(deductFuel) : true,
        deductAdvances: deductAdvances !== undefined ? Boolean(deductAdvances) : true,
        deductTolls: deductTolls !== undefined ? Boolean(deductTolls) : true,
        deductInsurance: deductInsurance !== undefined ? Boolean(deductInsurance) : true,
        deductTrailerRent: deductTrailerRent !== undefined ? Boolean(deductTrailerRent) : false,
        deductMaintenance: deductMaintenance !== undefined ? Boolean(deductMaintenance) : true,
        deductEscrow: deductEscrow !== undefined ? Boolean(deductEscrow) : true,
        deductChargebacks: deductChargebacks !== undefined ? Boolean(deductChargebacks) : true,

        defaultInsuranceDeductionCents: defaultInsuranceDeductionCents ? Math.round(Number(defaultInsuranceDeductionCents)) : 0,
        defaultTrailerRentCents: defaultTrailerRentCents ? Math.round(Number(defaultTrailerRentCents)) : 0,
        defaultEscrowDeductionCents: defaultEscrowDeductionCents ? Math.round(Number(defaultEscrowDeductionCents)) : 0,
        defaultMaintenanceDeductionCents: defaultMaintenanceDeductionCents ? Math.round(Number(defaultMaintenanceDeductionCents)) : 0,

        status: status || "active",
        setupComplete: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedByUid: authRes.callerUid
      };

      await db.collection("admins").doc(companyId).collection("owner_operators").doc(ooId).set(ooDoc, { merge: true });

      // Audit log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: id ? "update_owner_operator_company" : "create_owner_operator_company",
        entityType: "owner_operator_company",
        entityId: ooId,
        after: ooDoc,
        createdAt: nowIso
      });

      return res.json({ success: true, ownerOperatorCompany: ooDoc });
    } catch (err: any) {
      console.error("Error saving owner operator company:", err);
      return res.status(500).json({ error: err.message || "Failed to save owner operator company" });
    }
  });

  app.delete("/api/accounting/owner-operator", async (req, res) => {
    const companyId = (req.body?.companyId || req.query?.companyId) as string;
    const ooId = (req.body?.id || req.query?.id) as string;

    if (!companyId || !ooId) {
      return res.status(400).json({ error: "Company ID and Owner Operator ID are required." });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot delete owner operator companies." });
    }

    try {
      const db = getFirestoreDb();
      const ooRef = db.collection("admins").doc(companyId).collection("owner_operators").doc(ooId);
      const ooSnap = await ooRef.get();

      if (!ooSnap.exists) {
        return res.status(404).json({ error: "Owner operator company profile not found." });
      }

      const existingData = ooSnap.data();

      // Unlink trucks from this OO company without deleting the truck document
      const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").get();
      const batch = db.batch();
      let unlinkedTruckCount = 0;

      trucksSnap.forEach(doc => {
        const t = doc.data();
        if (t.ownerOperatorCompanyId === ooId || t.currentOwnerOperatorCompanyId === ooId) {
          batch.update(doc.ref, {
            ownerOperatorCompanyId: null,
            currentOwnerOperatorCompanyId: null,
            ownerOperatorVendor: null,
            updatedAt: new Date().toISOString()
          });
          unlinkedTruckCount++;
        }
      });

      // Unlink drivers from this OO company without deleting the driver document
      const driversSnap = await db.collection("admins").doc(companyId).collection("drivers").get();
      let unlinkedDriverCount = 0;

      driversSnap.forEach(doc => {
        const d = doc.data();
        if (d.ownerOperatorCompanyId === ooId) {
          batch.update(doc.ref, {
            ownerOperatorCompanyId: null,
            ownerOperatorName: null,
            updatedAt: new Date().toISOString()
          });
          unlinkedDriverCount++;
        }
      });

      // Delete the Owner Operator profile document
      batch.delete(ooRef);

      // Audit log
      const nowIso = new Date().toISOString();
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const auditRef = db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId);
      batch.set(auditRef, {
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "delete_owner_operator_company",
        entityType: "owner_operator_company",
        entityId: ooId,
        before: existingData,
        unlinkedTrucks: unlinkedTruckCount,
        unlinkedDrivers: unlinkedDriverCount,
        createdAt: nowIso
      });

      await batch.commit();

      return res.json({
        success: true,
        message: "Owner operator profile deleted successfully. Assigned drivers and trucks remain intact.",
        unlinkedTrucks: unlinkedTruckCount,
        unlinkedDrivers: unlinkedDriverCount
      });
    } catch (err: any) {
      console.error("Error deleting owner operator company:", err);
      return res.status(500).json({ error: err.message || "Failed to delete owner operator company" });
    }
  });

  app.get("/api/accounting/trucks/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
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

  app.post("/api/accounting/truck", async (req, res) => {
    const {
      companyId,
      id,
      truckNumber,
      vin,
      makeModel,
      year,
      ownerOperatorCompanyId,
      assignedDriverId,
      settlementGroupId,
      status,
      overrideDuplicate
    } = req.body;

    if (!companyId || !truckNumber) {
      return res.status(400).json({ error: "Missing required fields: companyId, truckNumber" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    if (authRes.role === "driver") {
      return res.status(403).json({ error: "Forbidden: Drivers cannot manage trucks" });
    }

    try {
      const db = getFirestoreDb();
      const cleanTruckNum = String(truckNumber).trim();
      const cleanVin = vin ? String(vin).trim() : "";
      const normNum = cleanTruckNum.replace(/^(TRUCK|TRK|UNIT)\s*#?\s*-?\s*/i, "").replace(/[^A-Z0-9]/g, "").toUpperCase();

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
        const otherNorm = (trkData.normalizedTruckNumber || otherNum.replace(/^(TRUCK|TRK|UNIT)\s*#?\s*-?\s*/i, "").replace(/[^A-Z0-9]/g, "")).toUpperCase();

        const vinMatch = cleanVin && otherVin && cleanVin.toLowerCase() === otherVin.toLowerCase();
        const numMatch = normNum && otherNorm && normNum === otherNorm;

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

      const truckId = targetTruckId || (existingDupDoc && overrideDuplicate ? existingDupDoc.id : `truck_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
      const nowIso = new Date().toISOString();

      const truckDoc = {
        id: truckId,
        companyId,
        truckNumber: cleanTruckNum,
        normalizedTruckNumber: normNum,
        vin: cleanVin,
        makeModel: makeModel ? makeModel.trim() : "",
        year: year ? String(year).trim() : "",
        ownerOperatorCompanyId: ownerOperatorCompanyId || null,
        assignedDriverId: assignedDriverId || null,
        settlementGroupId: settlementGroupId || null,
        status: status || "active",
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("trucks").doc(truckId).set(truckDoc, { merge: true });

      // Audit log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: id ? "update_truck" : "create_truck",
        entityType: "truck",
        entityId: truckId,
        after: truckDoc,
        createdAt: nowIso
      });

      return res.json({ success: true, truck: truckDoc });
    } catch (err: any) {
      console.error("Error saving truck:", err);
      return res.status(500).json({ error: err.message || "Failed to save truck" });
    }
  });

  app.post("/api/accounting/assign-driver-owner-operator", async (req, res) => {
    const { companyId, driverId, ownerOperatorCompanyId, workerType } = req.body;

    if (!companyId || !driverId) {
      return res.status(400).json({ error: "Missing required fields: companyId, driverId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let ooName = "";
      if (ownerOperatorCompanyId) {
        const ooDoc = await db.collection("admins").doc(companyId).collection("owner_operator_companies").doc(ownerOperatorCompanyId).get();
        if (ooDoc.exists) {
          const ooData = ooDoc.data();
          ooName = ooData?.legalName || ooData?.dbaName || ooData?.ownerName || "";
        }
      }

      const updates: any = {
        ownerOperatorCompanyId: ownerOperatorCompanyId || null,
        ownerOperatorName: ooName,
        workerType: workerType || "owner_operator_driver",
        updatedAt: new Date().toISOString()
      };

      // Keep /users/{driverId} and /admins/{companyId}/drivers/{driverId} synchronized
      const batch = db.batch();
      const adminDriverRef = db.collection("admins").doc(companyId).collection("drivers").doc(driverId);
      const userRef = db.collection("users").doc(driverId);

      batch.set(adminDriverRef, updates, { merge: true });
      batch.set(userRef, updates, { merge: true });

      if (ownerOperatorCompanyId) {
        const ooRef = db.collection("admins").doc(companyId).collection("owner_operator_companies").doc(ownerOperatorCompanyId);
        batch.set(ooRef, {
          assignedDriverIds: FirebaseFirestore.FieldValue.arrayUnion(driverId),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      await batch.commit();

      return res.json({ success: true, driverId, updates });
    } catch (err: any) {
      console.error("Error assigning driver to owner operator:", err);
      return res.status(500).json({ error: err.message || "Failed to assign driver" });
    }
  });

  // ==========================================
  // CALCULATE OWNER OPERATOR COMPANY SETTLEMENT
  // ==========================================

  app.post("/api/accounting/calculate-owner-operator-settlement", async (req, res) => {
    const { companyId, ownerOperatorCompanyId, periodStart, periodEnd, saveDraft } = req.body;

    if (!companyId || !ownerOperatorCompanyId) {
      return res.status(400).json({ error: "Missing required fields: companyId, ownerOperatorCompanyId" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();

      // Fetch Owner Operator Company
      const ooSnap = await db.collection("admins").doc(companyId).collection("owner_operators").doc(ownerOperatorCompanyId).get();
      if (!ooSnap.exists) {
        return res.status(404).json({ error: `Owner Operator Company ${ownerOperatorCompanyId} not found` });
      }
      const ooData = ooSnap.data()!;

      // Fetch all trucks for this OO Company
      const trucksSnap = await db.collection("admins").doc(companyId).collection("trucks").where("ownerOperatorCompanyId", "==", ownerOperatorCompanyId).get();
      const trucks: any[] = [];
      trucksSnap.forEach(tDoc => {
        const d = tDoc.data();
        trucks.push({ ...d, id: d.id || tDoc.id });
      });
      const truckIds = trucks.map(t => t.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      const truckNumbers = trucks.map(t => t.truckNumber).filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

      // Fetch drivers for this OO Company
      const driversSnap = await db.collection("admins").doc(companyId).collection("drivers").where("ownerOperatorCompanyId", "==", ownerOperatorCompanyId).get();
      const drivers: any[] = [];
      driversSnap.forEach(dDoc => {
        const d = dDoc.data();
        drivers.push({ ...d, id: d.id || dDoc.id });
      });
      const driverIds = drivers.map(d => d.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

      // Fetch all existing active settlements to identify loads that have ALREADY been drafted/settled
      const existingSettlementsSnap = await db.collection("admins").doc(companyId).collection("settlements").get();
      const settledLoadIds = new Set<string>();

      existingSettlementsSnap.forEach(sDoc => {
        const s = sDoc.data();
        if (s.status === 'void' || s.status === 'deleted') return;
        if (s.loadId) settledLoadIds.add(String(s.loadId));
        if (s.loadIds && Array.isArray(s.loadIds)) {
          s.loadIds.forEach((id: any) => settledLoadIds.add(String(id)));
        }
        if (s.lineItems && Array.isArray(s.lineItems)) {
          s.lineItems.forEach((li: any) => {
            if (li.loadId) settledLoadIds.add(String(li.loadId));
          });
        }
      });

      // Fetch completed loads belonging to assigned trucks or drivers
      const loadsSnap = await db.collection("admins").doc(companyId).collection("loads").get();
      const matchingLoads: any[] = [];
      loadsSnap.forEach(lDoc => {
        const l: any = { ...lDoc.data(), id: lDoc.data().id || lDoc.id };
        if (l.status === "delivered") {
          // Double payment guard: exclude loads already drafted/settled in an active statement
          if (settledLoadIds.has(l.id) || l.settlementStatus === 'settled') return;

          const loadTruckMatch = l.truckId && truckIds.includes(l.truckId);
          const loadDriverMatch = l.assignedDriverId && driverIds.includes(l.assignedDriverId);
          const loadOOMatch = l.ownerOperatorCompanyId === ownerOperatorCompanyId;
          if (loadTruckMatch || loadDriverMatch || loadOOMatch) {
            matchingLoads.push(l);
          }
        }
      });

      // Calculate Gross Revenue & Itemize Loads
      let grossRevenueCents = 0;
      let totalLoadedMiles = 0;
      let totalEmptyMiles = 0;
      const lineItems: any[] = [];
      const loadIds: string[] = [];

      matchingLoads.forEach(l => {
        const loadRateCents = Math.round((Number(l.rate) || 0) * 100);
        grossRevenueCents += loadRateCents;
        loadIds.push(l.id);

        lineItems.push({
          id: `line_load_${l.id}_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          truckId: l.truckId || null,
          driverId: l.assignedDriverId || null,
          loadId: l.id,
          type: "earning",
          category: "linehaul",
          description: `Load #${l.loadNumber || l.id}: ${l.pickup?.facilityName || 'Origin'} -> ${l.delivery?.facilityName || 'Destination'}`,
          rateCents: loadRateCents,
          amountCents: loadRateCents,
          sourceType: "load",
          sourceId: l.id,
          createdAt: new Date().toISOString()
        });
      });

      // Dispatch Fee Calculation
      const dispatchFeeBasisPoints = ooData.dispatchFeeBasisPoints || 1000; // 10% default
      const dispatchFeeCents = Math.round((grossRevenueCents * dispatchFeeBasisPoints) / 10000);
      if (dispatchFeeCents > 0) {
        lineItems.push({
          id: `line_dispatch_fee_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          type: "deduction",
          category: "dispatch_fee",
          description: `Dispatch Fee (${(dispatchFeeBasisPoints / 100).toFixed(2)}% of Gross)`,
          percentageBasisPoints: dispatchFeeBasisPoints,
          amountCents: dispatchFeeCents,
          sourceType: "system",
          createdAt: new Date().toISOString()
        });
      }

      // Fuel Deductions (Idempotent check by providerTransactionId / allocationStatus)
      let fuelDeductionsCents = 0;
      if (ooData.deductFuel !== false) {
        const fuelSnap = await db.collection("admins").doc(companyId).collection("fuel_entries").get();
        fuelSnap.forEach(fDoc => {
          const f = fDoc.data();
          const matchesOO = f.ownerOperatorCompanyId === ownerOperatorCompanyId ||
                            (f.truckId && truckIds.includes(f.truckId)) ||
                            (f.driverId && driverIds.includes(f.driverId));
          const notAlreadyAllocated = f.allocationStatus !== "allocated";

          if (matchesOO && notAlreadyAllocated) {
            const fAmt = Math.round(Number(f.totalAmountCents || 0));
            if (fAmt > 0) {
              fuelDeductionsCents += fAmt;
              lineItems.push({
                id: `line_fuel_${f.id}`,
                companyId,
                ownerOperatorCompanyId,
                truckId: f.truckId || null,
                driverId: f.driverId || null,
                loadId: f.loadId || null,
                type: "deduction",
                category: "fuel",
                description: `Fuel Purchase: ${f.fuelVendor || 'Vendor'} (${f.city || ''}, ${f.state || ''}) - ${f.gallonsDecimal || f.gallons || 0} gal`,
                amountCents: fAmt,
                sourceType: "fuel",
                sourceId: f.id,
                createdAt: new Date().toISOString()
              });
            }
          }
        });
      }

      // Advance Deductions
      let advanceDeductionsCents = 0;
      if (ooData.deductAdvances !== false) {
        const advSnap = await db.collection("admins").doc(companyId).collection("advances").where("status", "in", ["open", "partially_repaid"]).get();
        advSnap.forEach(aDoc => {
          const adv = aDoc.data();
          const matchesOO = adv.ownerOperatorCompanyId === ownerOperatorCompanyId ||
                            (adv.driverId && driverIds.includes(adv.driverId));

          if (matchesOO && adv.remainingBalanceCents > 0) {
            let deductAmt = adv.remainingBalanceCents;
            if (adv.deductionMethod === "fixed_per_settlement" && adv.fixedDeductionCents) {
              deductAmt = Math.min(adv.remainingBalanceCents, adv.fixedDeductionCents);
            }
            if (deductAmt > 0) {
              advanceDeductionsCents += deductAmt;
              const issueDateStr = adv.issuedAt ? new Date(adv.issuedAt).toLocaleDateString() : (adv.createdAt ? new Date(adv.createdAt).toLocaleDateString() : '—');
              const checkRefStr = adv.checkNumber || adv.comcheckNumber || adv.referenceNumber || adv.id;
              const typeLabel = adv.type ? (adv.type === 'check' || adv.type === 'comcheck' ? 'Comcheck / Check' : adv.type.toUpperCase()) : 'Cash Advance';

              lineItems.push({
                id: `line_advance_${adv.id}`,
                companyId,
                ownerOperatorCompanyId,
                driverId: adv.driverId || null,
                type: "deduction",
                category: "Advance / Comcheck Repayment",
                description: `${typeLabel} (Check/Ref #${checkRefStr}) - Issued: ${issueDateStr}`,
                amountCents: deductAmt,
                sourceType: "advance",
                sourceId: adv.id,
                issuedAt: adv.issuedAt || adv.createdAt || null,
                checkNumber: checkRefStr,
                createdAt: new Date().toISOString()
              });
            }
          }
        });
      }

      // Recurring Deductions
      let insuranceDeductionsCents = 0;
      let trailerRentDeductionsCents = 0;
      let maintenanceDeductionsCents = 0;
      let escrowDeductionsCents = 0;

      if (ooData.deductInsurance !== false && ooData.defaultInsuranceDeductionCents > 0) {
        insuranceDeductionsCents = ooData.defaultInsuranceDeductionCents;
        lineItems.push({
          id: `line_ins_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          type: "deduction",
          category: "insurance",
          description: "Liability & Cargo Insurance Deduction",
          amountCents: insuranceDeductionsCents,
          sourceType: "system",
          createdAt: new Date().toISOString()
        });
      }

      if (ooData.deductTrailerRent !== false && ooData.defaultTrailerRentCents > 0) {
        trailerRentDeductionsCents = ooData.defaultTrailerRentCents;
        lineItems.push({
          id: `line_trailer_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          type: "deduction",
          category: "trailer_rent",
          description: "Trailer Rental Fee",
          amountCents: trailerRentDeductionsCents,
          sourceType: "system",
          createdAt: new Date().toISOString()
        });
      }

      if (ooData.deductMaintenance !== false && ooData.defaultMaintenanceDeductionCents > 0) {
        maintenanceDeductionsCents = ooData.defaultMaintenanceDeductionCents;
        lineItems.push({
          id: `line_maint_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          type: "deduction",
          category: "maintenance",
          description: "Maintenance Escrow / Fund",
          amountCents: maintenanceDeductionsCents,
          sourceType: "system",
          createdAt: new Date().toISOString()
        });
      }

      if (ooData.deductEscrow !== false && ooData.defaultEscrowDeductionCents > 0) {
        escrowDeductionsCents = ooData.defaultEscrowDeductionCents;
        lineItems.push({
          id: `line_escrow_${Date.now()}`,
          companyId,
          ownerOperatorCompanyId,
          type: "deduction",
          category: "escrow",
          description: "Safety / Damage Escrow Reserve",
          amountCents: escrowDeductionsCents,
          sourceType: "system",
          createdAt: new Date().toISOString()
        });
      }

      const totalDeductionsCents = dispatchFeeCents + fuelDeductionsCents + advanceDeductionsCents +
        insuranceDeductionsCents + trailerRentDeductionsCents + maintenanceDeductionsCents + escrowDeductionsCents;
      const totalReimbursementsCents = 0;
      const eligibleRevenueCents = grossRevenueCents;
      const netPayCents = grossRevenueCents - totalDeductionsCents + totalReimbursementsCents;

      const nowIso = new Date().toISOString();
      const settlementId = `settlement_oo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const settlementNumber = `SET-OO-${Math.floor(100000 + Math.random() * 900000)}`;
      const poNumber = req.body.poNumber || `PO #${Math.floor(100000 + Math.random() * 900000)}`;

      const settlement = {
        id: settlementId,
        companyId,
        settlementNumber,
        poNumber,
        settlementType: "owner_operator_company",
        ownerOperatorCompanyId,
        ownerOperatorName: ooData.legalName || ooData.ownerName,
        settlementPeriodStart: periodStart || nowIso.split('T')[0],
        settlementPeriodEnd: periodEnd || nowIso.split('T')[0],

        truckIds: truckIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
        driverIds: driverIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
        loadIds: loadIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),

        totalLoads: matchingLoads.length,
        totalLoadedMiles,
        totalEmptyMiles,

        grossRevenueCents,
        eligibleRevenueCents,
        dispatchFeeCents,
        fuelDeductionsCents,
        advanceDeductionsCents,
        tollDeductionsCents: 0,
        insuranceDeductionsCents,
        trailerRentDeductionsCents,
        maintenanceDeductionsCents,
        escrowDeductionsCents,
        chargebackDeductionsCents: 0,
        otherDeductionsCents: 0,
        reimbursementsCents: totalReimbursementsCents,

        totalEarningsCents: grossRevenueCents,
        totalDeductionsCents,
        totalReimbursementsCents,
        netPayCents,

        status: "draft",
        quickBooksVendorId: ooData.quickBooksVendorId || null,
        quickBooksBillId: null,
        quickBooksBillPaymentId: null,

        createdByUid: authRes.callerUid,
        createdAt: nowIso,
        calculatedAt: nowIso,
        reviewedAt: null,
        approvedAt: null,
        lockedAt: null,
        syncedAt: null,
        paidAt: null,
        lineItems: lineItems.map(li => ({ ...li, settlementId }))
      };

      if (saveDraft) {
        const { lineItems: itemsToSave, ...settlementDoc } = settlement;
        await db.collection("admins").doc(companyId).collection("settlements").doc(settlementId).set(settlementDoc);

        for (const li of itemsToSave) {
          await db.collection("admins").doc(companyId).collection("settlements").doc(settlementId).collection("line_items").doc(li.id).set(li);
        }

        // Audit Log
        const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
          id: auditId,
          companyId,
          userId: authRes.callerUid,
          action: "calculate_owner_operator_settlement_draft",
          entityType: "settlement",
          entityId: settlementId,
          after: settlementDoc,
          createdAt: nowIso
        });
      }

      return res.json({ success: true, settlement });
    } catch (err: any) {
      console.error("Error calculating owner operator settlement:", err);
      return res.status(500).json({ error: err.message || "Failed to calculate owner operator settlement" });
    }
  });

  app.get("/api/accounting/logs/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const syncSnap = await db.collection("admins").doc(companyId).collection("accounting_sync_logs").get();
      const auditSnap = await db.collection("admins").doc(companyId).collection("accounting_audit_logs").get();

      const syncLogs: any[] = [];
      const auditLogs: any[] = [];

      syncSnap.forEach(doc => syncLogs.push(doc.data()));
      auditSnap.forEach(doc => auditLogs.push(doc.data()));

      syncLogs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      auditLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ success: true, syncLogs, auditLogs });
    } catch (err: any) {
      console.error("Error fetching accounting logs:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch accounting logs" });
    }
  });

  // ==========================================
  // COMPANY PROFILE & BRANDING FOR LETTERHEAD
  // ==========================================

  async function getCompanyProfileData(db: any, companyId: string) {
    let profile: any = {
      legalName: "Truck Dispatch Pro Carrier",
      companyName: "Truck Dispatch Pro Carrier",
      adminName: "",
      dbaName: "",
      address: "100 Logistics Way, Suite 400, Dallas, TX 75201",
      phone: "(800) 555-8782",
      email: "dispatch@truckdispatchpro.com",
      website: "https://truckdispatchpro.com",
      logoUrl: "",
      usdot: "3892014",
      mcNumber: "1482093"
    };

    try {
      const compDoc = await db.collection("companies").doc(companyId).get();
      if (compDoc.exists) {
        const cData = compDoc.data();
        profile = {
          ...profile,
          ...cData,
          legalName: cData.legalName || cData.companyName || cData.name || profile.legalName,
          companyName: cData.companyName || cData.legalName || cData.name || profile.companyName,
          adminName: cData.adminName || cData.ownerName || cData.primaryContact || cData.contactName || profile.adminName,
          phone: cData.phone || cData.phoneNumber || cData.contactPhone || profile.phone,
          email: cData.email || cData.contactEmail || profile.email,
          address: cData.address || cData.companyAddress || (cData.street ? `${cData.street}, ${cData.city || ''}, ${cData.state || ''} ${cData.zip || ''}` : profile.address),
          usdot: cData.usdot || cData.dotNumber || cData.usdotNumber || profile.usdot,
          mcNumber: cData.mcNumber || cData.mc || cData.docketNumber || profile.mcNumber
        };
      } else {
        const adminDoc = await db.collection("admins").doc(companyId).get();
        if (adminDoc.exists) {
          const aData = adminDoc.data();
          profile = {
            ...profile,
            ...aData,
            legalName: aData.legalName || aData.companyName || aData.name || profile.legalName,
            companyName: aData.companyName || aData.legalName || aData.name || profile.companyName,
            adminName: aData.adminName || aData.ownerName || aData.primaryContact || aData.contactName || profile.adminName,
            phone: aData.phone || aData.phoneNumber || aData.contactPhone || profile.phone,
            email: aData.email || aData.contactEmail || profile.email,
            address: aData.address || aData.companyAddress || profile.address,
            usdot: aData.usdot || aData.dotNumber || profile.usdot,
            mcNumber: aData.mcNumber || aData.mc || profile.mcNumber
          };
        }
      }

      // Query admin user details if adminName or contact info is generic
      if (!profile.adminName || profile.email === 'dispatch@truckdispatchpro.com') {
        const adminUsersSnap = await db.collection("users")
          .where("companyId", "==", companyId)
          .where("role", "in", ["admin", "super_admin", "dispatcher"])
          .limit(1)
          .get();
        if (!adminUsersSnap.empty) {
          const uData = adminUsersSnap.docs[0].data();
          if (!profile.adminName && (uData.name || uData.displayName)) {
            profile.adminName = uData.name || uData.displayName;
          }
          if ((!profile.email || profile.email === 'dispatch@truckdispatchpro.com') && uData.email) {
            profile.email = uData.email;
          }
          if ((!profile.phone || profile.phone === '(800) 555-8782') && (uData.phone || uData.phoneNumber)) {
            profile.phone = uData.phone || uData.phoneNumber;
          }
        }
      }
    } catch (err) {
      console.warn("Error resolving company profile data:", err);
    }

    return profile;
  }

  app.get("/api/accounting/company-profile/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const profile = await getCompanyProfileData(db, companyId);
      return res.json({ success: true, profile });
    } catch (err: any) {
      console.error("Error fetching company profile:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch company profile" });
    }
  });

  // ==========================================
  // SETTLEMENT PDF & AUDIT ACTIONS
  // ==========================================

  app.get("/api/accounting/settlements/:companyId/:settlementId/view-model", async (req, res) => {
    const { companyId, settlementId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const viewModel = await buildSettlementStatementViewModel({ companyId, settlementId, dbOverride: db });

      if (authRes.role === "driver" && viewModel.payee.payeeId !== authRes.callerUid) {
        return res.status(403).json({ error: "Forbidden: Drivers can only access their own settlements" });
      }

      return res.json({ success: true, viewModel });
    } catch (err: any) {
      console.error("Error building settlement view model:", err);
      return res.status(500).json({ error: err.message || "Failed to build settlement view model" });
    }
  });

  app.get("/api/accounting/settlements/:companyId/:settlementId/pdf", async (req, res) => {
    const { companyId, settlementId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const viewModel = await buildSettlementStatementViewModel({ companyId, settlementId, dbOverride: db });

      // RBAC Security Check
      if (authRes.role === "driver") {
        if (viewModel.payee.payeeId !== authRes.callerUid) {
          return res.status(403).json({ error: "Forbidden: Drivers can only access their own settlements" });
        }
        if (!["approved", "locked", "synced", "paid"].includes(viewModel.statement.status)) {
          return res.status(403).json({ error: "Forbidden: Drivers can only download approved/locked settlements" });
        }
      }

      const nowIso = new Date().toISOString();
      const pdfHash = crypto.createHash('sha256').update(`${settlementId}_${nowIso}`).digest('hex');

      const setDocRef = db.collection("admins").doc(companyId).collection("settlements").doc(settlementId);
      // Update PDF metadata on settlement document
      await setDocRef.update({
        pdfGenerated: true,
        pdfGeneratedAt: nowIso,
        pdfVersion: "1.0",
        pdfHash
      }).catch(err => console.warn("Could not update settlement PDF metadata:", err));

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "settlement_pdf_downloaded",
        entityType: "settlement",
        entityId: settlementId,
        createdAt: nowIso,
        metadata: {
          settlementNumber: viewModel.statement.statementNumber,
          driverId: viewModel.payee.payeeId,
          ownerOperatorCompanyId: viewModel.payee.vendorId,
          netPayCents: viewModel.totals.netSettlementCents
        }
      }).catch(err => console.warn("Could not write PDF audit log:", err));

      const pdfBuffer = await generateSettlementPDFBuffer({
        viewModel,
        pdfHash
      });

      const dispositionType = req.query.disposition === "attachment" ? "attachment" : "inline";
      const filename = `TDPro-Settlement-${viewModel.statement.statementNumber}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${dispositionType}; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    } catch (err: any) {
      console.error("Error generating settlement PDF buffer:", err);
      return res.status(500).json({ error: err.message || "Failed to generate settlement PDF" });
    }
  });

  app.post("/api/accounting/settlements/:companyId/:settlementId/audit-action", async (req, res) => {
    const { companyId, settlementId } = req.params;
    const { action, recipientEmail } = req.body;

    if (!companyId || !settlementId || !action) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const nowIso = new Date().toISOString();
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: action, // "settlement_printed" | "settlement_pdf_downloaded" | "settlement_emailed"
        entityType: "settlement",
        entityId: settlementId,
        createdAt: nowIso,
        metadata: {
          recipientEmail: recipientEmail || null,
          userRole: authRes.role
        }
      });

      return res.json({ success: true, auditId });
    } catch (err: any) {
      console.error("Error recording settlement audit action:", err);
      return res.status(500).json({ error: err.message || "Failed to record audit action" });
    }
  });

  app.post("/api/accounting/settlements/:companyId/:settlementId/email", async (req, res) => {
    const { companyId, settlementId } = req.params;
    const { emailRecipient, ccAdmin } = req.body;

    if (!companyId || !settlementId) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const setDocRef = db.collection("admins").doc(companyId).collection("settlements").doc(settlementId);
      const snap = await setDocRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: `Settlement ${settlementId} not found` });
      }

      const settlement = snap.data()!;
      const recipient = emailRecipient || settlement.driverEmail || settlement.ownerOperatorEmail || "driver@truckdispatchpro.com";
      const nowIso = new Date().toISOString();

      // Enqueue mail record if /mail queue exists
      const mailId = `mail_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("mail").doc(mailId).set({
        to: recipient,
        cc: ccAdmin ? (authRes.callerName || authRes.callerUid || null) : null,
        message: {
          subject: `Settlement Statement ${settlement.id} - ${settlement.driverName || 'Payee'}`,
          text: `Attached/enclosed is your official settlement statement ${settlement.id} for period ending ${settlement.periodEnd || new Date().toISOString().split('T')[0]}.\n\nNet Pay: $${((settlement.netPayCents || 0) / 100).toFixed(2)}`,
          html: `<p>Enclosed is your official settlement statement <strong>${settlement.id}</strong> for period ending <strong>${settlement.periodEnd || new Date().toISOString().split('T')[0]}</strong>.</p><p><strong>Net Pay: $${((settlement.netPayCents || 0) / 100).toFixed(2)}</strong></p>`
        },
        createdAt: nowIso
      });

      // Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("admins").doc(companyId).collection("accounting_audit_logs").doc(auditId).set({
        id: auditId,
        companyId,
        userId: authRes.callerUid,
        action: "settlement_emailed",
        entityType: "settlement",
        entityId: settlementId,
        createdAt: nowIso,
        metadata: {
          recipient,
          ccAdmin: Boolean(ccAdmin),
          netPayCents: settlement.netPayCents || 0
        }
      });

      return res.json({
        success: true,
        message: `Settlement statement ${settlement.id} successfully queued for email delivery to ${recipient}.`
      });
    } catch (err: any) {
      console.error("Error emailing settlement statement:", err);
      return res.status(500).json({ error: err.message || "Failed to email settlement statement" });
    }
  });

  // POST /api/accounting/settlements/request-review (Phase 4 Owner-Operator Portal Feature)
  app.post("/api/accounting/settlements/request-review", async (req, res) => {
    const { companyId, settlementId, lineItemId, reviewType, notes } = req.body;

    if (!companyId || !settlementId || !notes) {
      return res.status(400).json({ error: "Missing required parameters: companyId, settlementId, notes" });
    }

    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      const nowIso = new Date().toISOString();
      const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const reviewRecord = {
        id: reviewId,
        companyId,
        settlementId,
        lineItemId: lineItemId || null,
        reviewType: reviewType || 'fuel_deduction_dispute', // 'fuel_deduction_dispute', 'mileage_dispute', 'accessorial_missing', 'other'
        requestedByUid: authRes.callerUid,
        requestedByName: authRes.callerName || 'Owner Operator',
        notes,
        status: 'open',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await db.collection("admins").doc(companyId).collection("settlement_reviews").doc(reviewId).set(reviewRecord);

      // Create in-app notification for company admin & dispatchers
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.collection("notifications").doc(notifId).set({
        id: notifId,
        companyId,
        title: "Settlement Review Requested",
        message: `${authRes.callerName || 'Owner Operator'} requested review for settlement ${settlementId}: "${notes.substring(0, 80)}"`,
        type: "settlement_review",
        entityId: settlementId,
        reviewId,
        read: false,
        createdAt: nowIso
      });

      return res.json({ success: true, review: reviewRecord, message: "Settlement review request submitted successfully." });
    } catch (err: any) {
      console.error("Error submitting settlement review request:", err);
      return res.status(500).json({ error: err.message || "Failed to submit settlement review request" });
    }
  });

  // GET /api/accounting/settlement-reviews/:companyId
  app.get("/api/accounting/settlement-reviews/:companyId", async (req, res) => {
    const { companyId } = req.params;
    const authRes = await verifyAccountingAuth(req, companyId);
    if (!authRes.authorized) {
      return res.status(authRes.status!).json({ error: authRes.error });
    }

    try {
      const db = getFirestoreDb();
      let query: any = db.collection("admins").doc(companyId).collection("settlement_reviews");

      if (authRes.role === 'driver') {
        query = query.where("requestedByUid", "==", authRes.callerUid);
      }

      const snap = await query.get();
      const reviews: any[] = [];
      snap.forEach(doc => reviews.push(doc.data()));
      reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ success: true, reviews });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch settlement review requests" });
    }
  });

}

