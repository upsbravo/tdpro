import { IntegrationAdapter } from './types';
import { datAdapter } from './datAdapter';
import { truckstopAdapter } from './truckstopAdapter';
import { fleetioAdapter } from './fleetioAdapter';
import { motiveAdapter } from './motiveAdapter';
import { wexAdapter } from './wexAdapter';
import { fleetOneAdapter } from './fleetOneAdapter';
import { quickbooksAdapter } from './quickbooksAdapter';
import { shopmonkeyAdapter } from './shopmonkeyAdapter';

export * from './types';

export const ALL_ADAPTERS: Record<string, IntegrationAdapter> = {
  dat: datAdapter,
  truckstop: truckstopAdapter,
  fleetio: fleetioAdapter,
  motive: motiveAdapter,
  wex: wexAdapter,
  fleet_one: fleetOneAdapter,
  quickbooks: quickbooksAdapter,
  shopmonkey: shopmonkeyAdapter
};

export const AVAILABLE_INTEGRATIONS = Object.values(ALL_ADAPTERS).map(adapter => ({
  providerId: adapter.providerId,
  providerName: adapter.providerName,
  category: adapter.category,
  description: adapter.description,
  isPartnerApprovalRequired: adapter.isPartnerApprovalRequired,
  capabilities: adapter.getCapabilities()
}));

export function getAdapter(providerId: string): IntegrationAdapter | null {
  return ALL_ADAPTERS[providerId.toLowerCase()] || null;
}
