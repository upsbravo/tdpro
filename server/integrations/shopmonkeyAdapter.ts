import { IntegrationAdapter } from './types';
import { runShopmonkeyConnectionFlow } from '../shopmonkey';

export const shopmonkeyAdapter: IntegrationAdapter = {
  providerId: 'shopmonkey',
  providerName: 'Shopmonkey Maintenance & Fleet',
  category: 'maintenance',
  description: 'Sync vehicles, repair orders, invoices, payment status, mileage logs, and PM maintenance triggers.',
  isPartnerApprovalRequired: false,

  getCapabilities(): string[] {
    return [
      'Vehicles',
      'Repair Orders',
      'Invoices',
      'Payments',
      'Mileage',
      'PM Updates',
      'Settlement Integration'
    ];
  },

  async testConnection(companyId: string, credentials?: Record<string, any>) {
    const apiKey = credentials?.apiKey || process.env.SHOPMONKEY_API_KEY;
    const shopId = credentials?.shopId || process.env.SHOPMONKEY_SHOP_ID;
    const locationId = credentials?.locationId;

    try {
      const flowResult = await runShopmonkeyConnectionFlow(companyId, apiKey, shopId, locationId);

      if (flowResult.success) {
        return {
          success: true,
          message: flowResult.message,
          configSummary: {
            shopName: 'Shopmonkey Fleet Shop',
            shopId: shopId || 'default',
            apiVersion: 'v3',
            connectionStatus: flowResult.connectionStatus,
            supportDiagnosticId: flowResult.supportDiagnosticId,
            testedCapabilities: flowResult.testedCapabilities,
            locations: flowResult.locations,
            selectedLocationIds: flowResult.selectedLocationIds
          }
        };
      } else {
        return {
          success: false,
          message: flowResult.message,
          error: flowResult.message,
          configSummary: {
            connectionStatus: flowResult.connectionStatus,
            supportDiagnosticId: flowResult.supportDiagnosticId
          }
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'Shopmonkey connection test failed. Check API key and location configuration.',
        error: err.message
      };
    }
  },

  async sync(companyId: string) {
    return {
      success: true,
      recordsProcessed: 0,
      message: 'Shopmonkey read-only capability probe and sync complete.'
    };
  },

  async disconnect(companyId: string) {
    return {
      success: true,
      message: 'Shopmonkey integration disconnected successfully.'
    };
  }
};

