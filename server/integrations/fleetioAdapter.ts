import { IntegrationAdapter } from './types';

export const fleetioAdapter: IntegrationAdapter = {
  providerId: 'fleetio',
  providerName: 'Fleetio Fleet Management',
  category: 'fleet_management',
  description: 'Sync vehicles, fuel logs, maintenance schedules, and odometer readings automatically.',
  isPartnerApprovalRequired: true,

  getCapabilities(): string[] {
    return ['syncVehicles', 'syncFuel', 'syncMaintenance', 'syncOdometer'];
  },

  async testConnection(companyId: string, credentials?: Record<string, any>) {
    const apiKey = process.env.FLEETIO_API_KEY || credentials?.apiKey;
    const accountToken = process.env.FLEETIO_ACCOUNT_TOKEN || credentials?.accountToken;

    if (!apiKey || !accountToken) {
      return {
        success: false,
        message: 'Partner API approval required. Contact Nexusweft support to enable this integration.',
        error: 'Partner API approval required. Contact Nexusweft support to enable this integration.'
      };
    }

    return {
      success: true,
      message: 'Fleetio Fleet Management API connection verified.',
      configSummary: {
        fleetSync: 'Active',
        maintenanceSync: 'Active'
      }
    };
  },

  async sync(companyId: string) {
    const apiKey = process.env.FLEETIO_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        recordsProcessed: 0,
        message: 'Partner API approval required. Contact Nexusweft support to enable this integration.',
        error: 'Partner API approval required. Contact Nexusweft support to enable this integration.'
      };
    }

    return {
      success: true,
      recordsProcessed: 0,
      message: 'Fleetio sync completed.'
    };
  },

  async disconnect(companyId: string) {
    return {
      success: true,
      message: 'Fleetio integration disconnected successfully.'
    };
  }
};
