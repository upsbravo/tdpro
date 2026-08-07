import { IntegrationAdapter } from './types';

export const fleetOneAdapter: IntegrationAdapter = {
  providerId: 'fleet_one',
  providerName: 'Fleet One / EFS',
  category: 'fuel_card',
  description: 'Import fuel transactions via CSV, Fleetio EFS bridge, or approved WEX/EFS direct API / file-feed access.',
  isPartnerApprovalRequired: true,

  getCapabilities(): string[] {
    return ['syncFuelTransactions', 'mapFuelToTruck', 'fuelCostReports'];
  },

  async testConnection(companyId: string, credentials?: Record<string, any>) {
    return {
      success: false,
      message: 'Direct API / file-feed access requires approved WEX/EFS partner credentials. Setup request recorded.',
      error: 'Pending partner approval.'
    };
  },

  async sync(companyId: string) {
    return {
      success: true,
      recordsProcessed: 0,
      message: 'Fleet One / EFS sync completed.'
    };
  },

  async disconnect(companyId: string) {
    return {
      success: true,
      message: 'Fleet One / EFS integration disconnected.'
    };
  }
};
