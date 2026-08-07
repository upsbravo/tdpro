import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { getFirestore } from 'firebase-admin/firestore';
import { applicationDefault } from 'firebase-admin/app';

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  process.env.GOOGLE_CLOUD_PROJECT = config.projectId;
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = config.projectId;
  admin.initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
  });
} else {
  admin.initializeApp();
}

const getDb = () => {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.firestoreDatabaseId) {
      return getFirestore(undefined, config.firestoreDatabaseId);
    }
  }
  return getFirestore();
};

async function inspect() {
  const db = getDb();
  console.log("Inspecting users and subcollections...");
  
  const uids = ["OBcUdnIKr6cBmDKswtYQHWVcZTo1", "nR5jGRH7CGYYqlIl0ZN8FMzkMzx2"];
  for (const uid of uids) {
    console.log(`\n--- Inspecting UID: ${uid} ---`);
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      console.log("Global User Doc:", userDoc.id, userDoc.data());
      const data = userDoc.data() || {};
      const companyId = data.companyId;
      const role = data.role;
      if (companyId) {
        if (role === "driver") {
          const tenantDoc = await db.collection("admins").doc(companyId).collection("drivers").doc(uid).get();
          console.log(`Tenant Driver Doc (${tenantDoc.exists ? "exists" : "DOES NOT exist"}):`, tenantDoc.exists ? tenantDoc.data() : null);
        } else if (role === "dispatcher") {
          const tenantDoc = await db.collection("admins").doc(companyId).collection("dispatchers").doc(uid).get();
          console.log(`Tenant Dispatcher Doc (${tenantDoc.exists ? "exists" : "DOES NOT exist"}):`, tenantDoc.exists ? tenantDoc.data() : null);
        } else if (role === "admin") {
          console.log(`Admin user, company ID: ${companyId}`);
        }
      } else {
        console.log("No companyId for user");
      }
    } else {
      console.log("Global User Doc DOES NOT exist");
    }
  }
}

inspect().catch(console.error);
