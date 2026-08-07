import { Company, User, Load, Message, Invoice, AppNotification, GpsPoint } from './types';

// Standard logistics coordinates
export const HUB_COORDINATES = {
  Chicago: { lat: 41.8781, lng: -87.6298 },
  Dallas: { lat: 32.7767, lng: -96.7970 },
  LosAngeles: { lat: 34.0522, lng: -118.2437 },
  Atlanta: { lat: 33.7490, lng: -84.3880 },
  NewYork: { lat: 40.7128, lng: -74.0060 },
  Houston: { lat: 29.7604, lng: -95.3698 },
  Denver: { lat: 39.7392, lng: -104.9903 },
  Seattle: { lat: 47.6062, lng: -122.3321 },
  Phoenix: { lat: 33.4484, lng: -112.0740 },
  KansasCity: { lat: 39.0997, lng: -94.5786 },
};

export const INITIAL_COMPANIES: Company[] = [];

export const INITIAL_USERS: User[] = [
  {
    id: 'user_super_admin',
    name: 'Marcus Vance',
    email: 'admin@dispatchpro.com', // Active user
    role: 'super_admin',
    status: 'active',
    phone: '(800) 555-9000',
  }
];

// Generate simple curved GPS coordinates between two points
export function generateGpsHistory(from: { lat: number, lng: number }, to: { lat: number, lng: number }, percentage: number): GpsPoint[] {
  const history: GpsPoint[] = [];
  const pointsCount = 12;
  const currentTotal = Math.floor((pointsCount * percentage) / 100);

  for (let i = 0; i <= currentTotal; i++) {
    const fraction = i / pointsCount;
    // Add a slight arc/curve to make the road path look dynamic rather than a straight line
    const arc = Math.sin(fraction * Math.PI) * 1.8;
    const lat = from.lat + (to.lat - from.lat) * fraction + arc * 0.15;
    const lng = from.lng + (to.lng - from.lng) * fraction - arc * 0.08;
    
    // Offset standard time (each point is 1.5 hours later)
    const dateObj = new Date();
    dateObj.setHours(dateObj.getHours() - (currentTotal - i) * 1.5);

    history.push({
      lat,
      lng,
      timestamp: dateObj.toISOString()
    });
  }
  return history;
}

export const INITIAL_LOADS: Load[] = [];

export const INITIAL_MESSAGES: Message[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
