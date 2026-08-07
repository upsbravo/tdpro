export type IntegrationCategory =
  | 'load_board'
  | 'fleet_management'
  | 'fuel_card'
  | 'eld_gps'
  | 'accounting'
  | 'maintenance';

export type IntegrationStatus =
  | 'not_connected'
  | 'connected'
  | 'error'
  | 'disconnected'
  | 'pending_partner_approval';

export interface IntegrationCapabilities {
  capabilities: string[];
}

export interface IntegrationAdapter {
  providerId: string;
  providerName: string;
  category: IntegrationCategory;
  description: string;
  isPartnerApprovalRequired: boolean;
  getCapabilities(): string[];
  testConnection(
    companyId: string,
    credentials?: Record<string, any>
  ): Promise<{
    success: boolean;
    message: string;
    configSummary?: Record<string, any>;
    error?: string;
  }>;
  sync(
    companyId: string
  ): Promise<{
    success: boolean;
    recordsProcessed: number;
    message: string;
    error?: string;
  }>;
  disconnect(
    companyId: string
  ): Promise<{
    success: boolean;
    message: string;
  }>;
}

export interface CompanyIntegrationRecord {
  providerId: string;
  providerName: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  connectedByUid: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  enabledFeatures: string[];
  configSummary: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationLogRecord {
  id: string;
  providerId: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
  startedAt: string;
  finishedAt: string;
  recordsProcessed: number;
  error: string | null;
}
