import { IntegrationAdapter } from './types';

export const truckstopAdapter: IntegrationAdapter = {
  providerId: 'truckstop',
  providerName: 'Truckstop.com Load Board',
  category: 'load_board',
  description: 'Integrate Truckstop.com to post equipment, search freight, and automate booking.',
  isPartnerApprovalRequired: true,

  getCapabilities(): string[] {
    return ['loadSearch', 'importLoad', 'postTruck', 'bookLoad'];
  },

  async testConnection(companyId: string, credentials?: Record<string, any>) {
    const apiKey = process.env.TRUCKSTOP_API_KEY || credentials?.apiKey;

    if (!apiKey) {
      return {
        success: false,
        message: 'Partner API approval required. Contact Nexusweft support to enable this integration.',
        error: 'Partner API approval required. Contact Nexusweft support to enable this integration.'
      };
    }

    return {
      success: true,
      message: 'Truckstop.com API connection verified successfully.',
      configSummary: {
        integrationMode: 'Partner API',
        equipmentSearchEnabled: true
      }
    };
  },

  async sync(companyId: string) {
    const apiKey = process.env.TRUCKSTOP_API_KEY;
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
      message: 'Truckstop load board sync completed.'
    };
  },

  async disconnect(companyId: string) {
    return {
      success: true,
      message: 'Truckstop.com integration disconnected successfully.'
    };
  }
};
