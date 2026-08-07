import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific custom database instance ID and ignore undefined fields
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Secondary Auth instance used to onboard/create staff users (Drivers, Dispatchers) 
// without terminating the active session of the logged-in Administrator/Dispatcher.
const secondaryAppName = 'SecondaryAuthApp';
const secondaryApp = getApps().find(app => app.name === secondaryAppName) 
  || initializeApp(firebaseConfig, secondaryAppName);
export const secondaryAuth = getAuth(secondaryApp);

// Operational types for Firestore error logs
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Hardened Error Handler required by rules
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errStr = error instanceof Error ? error.message : String(error);
  const isPermissionError = errStr.toLowerCase().includes('permission') || errStr.toLowerCase().includes('denied');

  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };

  if (!isPermissionError) {
    console.warn('Firestore Non-Fatal Error (Offline/Network): ', JSON.stringify(errInfo));
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Validate Connection to Firestore on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase Connection verified.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network (Client is offline).");
    } else {
      console.warn("Firebase Connection check bypassed/offline: ", error);
    }
  }
}
testConnection();

// Helper to compress images to ensure they comfortably fit within Firestore's 1MB limit when falling back to Base64 database storage
async function compressImageIfPossible(file: File | Blob): Promise<Blob | File> {
  if (!file.type.startsWith('image/')) {
    return file; // Only compress images (PDFs, etc., are bypassed)
  }
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Downscale image if width or height is larger than 1000px
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to highly-compressed JPEG (extremely clear but reduces size by 90%+)
        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
            resolve(blob);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.65);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Firebase Storage Helpers for Real Document Upload with Bulletproof Database Fallbacks
export async function uploadFileToStorage(file: Blob | File, path: string): Promise<string> {
  try {
    const fileRef = ref(storage, path);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn(`Firebase Storage uploadFile error for path ${path}. Falling back to compressed Base64 data URL:`, error);
    
    // Fallback: Compress the file (if image) and convert to Base64 data URL
    const processedFile = await compressImageIfPossible(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data);
      };
      reader.onerror = (err) => {
        reject(new Error("Failed to read file for database storage: " + err));
      };
      reader.readAsDataURL(processedFile);
    });
  }
}

export async function uploadDataUrlToStorage(dataUrl: string, path: string): Promise<string> {
  try {
    const fileRef = ref(storage, path);
    // uploadString automatically decodes data_url (e.g. data:image/png;base64,...)
    const snapshot = await uploadString(fileRef, dataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn(`Firebase Storage uploadDataUrl error for path ${path}. Returning original data URL:`, error);
    return dataUrl;
  }
}
