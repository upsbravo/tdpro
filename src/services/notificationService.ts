import { DispatchNotificationLog } from '../types';
import { db } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

export interface SendDriverAlertParams {
  driverId?: string;
  driverName?: string;
  driverEmail?: string;
  driverPhone?: string;
  loadNumber?: string;
  title: string;
  message: string;
  type: 'assignment' | 'status_update' | 'load_update' | 'urgent' | 'test';
  companyId?: string;
}

export async function sendDriverNotificationAlert(params: SendDriverAlertParams): Promise<{ success: boolean; dispatchId?: string; error?: string }> {
  try {
    const dispatchId = `dispatch_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Call server endpoint for email & SMS dispatch logging
    let serverOk = false;
    try {
      const response = await fetch('/api/notifications/dispatch-driver-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (response.ok) {
        serverOk = true;
      }
    } catch (err) {
      console.warn('Backend notification dispatch endpoint unreachable, falling back to direct Firestore log:', err);
    }

    // Always create a Firestore log in dispatch_logs for client auditability
    const channels: ('email' | 'sms' | 'in_app')[] = ['in_app'];
    if (params.driverEmail) channels.push('email');
    if (params.driverPhone) channels.push('sms');

    const logEntry: DispatchNotificationLog = {
      id: dispatchId,
      driverId: params.driverId || '',
      driverName: params.driverName || 'Driver',
      driverEmail: params.driverEmail || '',
      driverPhone: params.driverPhone || '',
      loadNumber: params.loadNumber || '',
      title: params.title,
      message: params.message,
      type: params.type,
      channels,
      status: 'dispatched',
      companyId: params.companyId || '',
      timestamp: new Date().toISOString(),
    };

    if (db) {
      try {
        await setDoc(doc(db, 'dispatch_logs', dispatchId), logEntry);
      } catch (fsErr) {
        console.warn('Firestore dispatch_logs write warning:', fsErr);
      }
    }

    return { success: true, dispatchId };
  } catch (err: any) {
    console.error('Failed to dispatch driver notification alert:', err);
    return { success: false, error: err.message || 'Dispatch failed' };
  }
}
