export interface PlanFeatures {
  manualLoads: boolean;
  basicDispatch: boolean;
  basicCommunication: boolean;
  aiParsing: boolean;
  aiScraping: boolean;
  gpsTracking: boolean;
  advancedAutomation: boolean;
}

/**
 * Returns feature access flags based on company plan tier and subscription status.
 *
 * Basic Plan ($59.99/mo):
 * - Manual load entry
 * - Basic dispatching
 * - Basic communication & assignment
 * - No AI features (parsing, scraping)
 * - No GPS live tracking
 *
 * Premium Plan ($159.99/mo):
 * - Everything in Basic
 * - AI rate confirmation parsing & scraping
 * - AI load extraction/import
 * - Live GPS tracking & consent workflows
 * - Advanced dispatch tools
 */
export function getPlanFeatures(plan?: string, subscriptionStatus?: string): PlanFeatures {
  const normalizedPlan = (plan || 'Basic').trim().toLowerCase();
  const normalizedStatus = (subscriptionStatus || 'active').trim().toLowerCase();
  
  // Subscription status must be active, trialing, or paid
  const isStatusValid = ['active', 'trialing', 'paid'].includes(normalizedStatus);

  if (!isStatusValid) {
    return {
      manualLoads: true,
      basicDispatch: true,
      basicCommunication: true,
      aiParsing: false,
      aiScraping: false,
      gpsTracking: false,
      advancedAutomation: false,
    };
  }

  if (normalizedPlan === 'premium') {
    return {
      manualLoads: true,
      basicDispatch: true,
      basicCommunication: true,
      aiParsing: true,
      aiScraping: true,
      gpsTracking: true,
      advancedAutomation: true,
    };
  }

  // Basic Plan Defaults
  return {
    manualLoads: true,
    basicDispatch: true,
    basicCommunication: true,
    aiParsing: false,
    aiScraping: false,
    gpsTracking: false,
    advancedAutomation: false,
  };
}
