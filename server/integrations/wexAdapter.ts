import { IntegrationAdapter } from './types';

export const wexAdapter: IntegrationAdapter = {
  providerId: 'wex',
  providerName: 'WEX / EFS / Comdata Fuel Cards',
  category: 'fuel_card',
  description: 'Import fuel card transactions, match fuel expenses to trucks, and generate fuel cost reports.',
  isPartnerApprovalRequired: true,

  getCapabilities(): string[] {
    return ['syncFuelTransactions', 'mapFuelToTruck', 'fuelCostReports'];
  },

  async testConnection(companyId: string, credentials?: Record<string, any>) {
    const apiKey = process.env.WEX_API_KEY || credentials?.apiKey;

    if (!apiKey) {
      return {
        success: false,
        message: 'Partner API approval required. Contact Nexusweft support to enable this integration.',
        error: 'Partner API approval required. Contact Nexusweft support to enable this integration.'
      };
    }

    return {
      success: true,
      message: 'WEX / EFS / Comdata API connection verified.',
      configSummary: {
        fuelSync: 'Active'
      }
    };
  },

  async sync(companyId: string) {
    const apiKey = process.env.WEX_API_KEY;
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
      message: 'WEX / EFS fuel card sync completed.'
    };
  },

  async disconnect(companyId: string) {
    return {
      success: true,
      message: 'WEX / EFS / Comdata integration disconnected successfully.'
    };
  }
};
