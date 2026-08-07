export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  version: string;
  effectiveDate: string;
  category: 'terms' | 'privacy' | 'compliance' | 'operational' | 'policies';
  summary: string;
  content: string;
}

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  'privacy-policy': {
    id: 'privacy-policy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'privacy',
    summary: 'Explains how Truck Dispatch Pro collects, uses, protects, and discloses personal information and operational data.',
    content: `TRUCK DISPATCH PRO - PRIVACY POLICY
Effective Date: July 26, 2026 | Version v1.0

1. OVERVIEW & SCOPE
Truck Dispatch Pro ("Platform", "we", "us", or "our") respects your privacy and is committed to protecting personal and enterprise data. This Privacy Policy outlines our practices regarding data collection, usage, storage, and disclosure when you access or use our SaaS platform, mobile driver portal, dispatch coordination tools, and related services.

2. INFORMATION WE COLLECT
We collect data necessary to provide truck dispatching, fleet management, and operational services:
- Account & Profile Data: Full name, business email address, phone number, carrier company name, USDOT/MC numbers, physical address, role, and billing details.
- Driver & Fleet Operational Data: Driver credentials, duty status (ELD/HOS), assigned loads, truck numbers, trailer details, rate confirmation documents, and proof of delivery files.
- GPS & Location Data: Real-time location coordinates, location timestamps, speed, and heading collected strictly during active dispatch loads or authorized driver breakdown/SOS events.
- Communications Data: Load chat messages, in-app notifications, SMS transaction logs, and support ticket submissions.
- Technical & Device Data: IP address, browser type, operating system, user-agent headers, session timestamps, and device identifiers.

3. SMS & TEXT MESSAGING PRIVACY CLAUSE
Text messaging originator opt-in data and consent will not be sold, rented, shared, or disclosed to third parties or affiliates for their marketing or promotional purposes.

4. HOW WE USE YOUR INFORMATION
We use collected data strictly for operational, compliance, and service delivery purposes:
- Provisioning and maintaining dispatch, load assignment, and fleet management features.
- Processing real-time GPS tracking when drivers are on active dispatch loads with explicit consent.
- Sending transactional SMS notifications, load updates, account alerts, and driver SOS communications.
- Managing subscription billing, payment processing, and account authorization.
- Ensuring compliance with transportation regulations, FMCSA mandates, and security standards.
- Maintaining immutable audit logs for legal agreement signatures and driver consents.

5. DATA SHARING & THIRD PARTIES
We do not sell personal or carrier data. We share data only with trusted service providers strictly necessary to operate the Platform:
- Infrastructure & Hosting Providers: Secure cloud infrastructure and storage (e.g., Google Cloud Platform / Firebase).
- Payment Processors: PCI-DSS compliant payment gateways (e.g., Stripe) for subscription billing.
- Communication Carriers: Telephony and SMS providers (e.g., Twilio/SendGrid/Resend) for transactional alerts.
- Subprocessors: Authorized subprocessors listed in our Subprocessor Policy, bound by contractual confidentiality and DPA obligations.

6. DATA SECURITY & RETENTION
We implement military-grade encryption (TLS 1.3 in transit, AES-256 at rest), attribute-based access control (RBAC), and strict multi-tenant isolation. Operational data and agreement acceptance logs are retained in accordance with our Data Retention Policy and applicable transportation laws.

7. YOUR PRIVACY RIGHTS
Depending on your jurisdiction, you may have rights to request access, correction, export, or deletion of personal data, subject to legitimate transportation recordkeeping obligations. Contact support@truckdispatchpro.com for privacy requests.

8. UPDATES TO THIS POLICY
We may update this Privacy Policy from time to time. Material changes will be communicated via the Platform or email before becoming effective.`
  },

  'terms-of-service': {
    id: 'terms-of-service',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'terms',
    summary: 'Governs the use of Truck Dispatch Pro platform by carriers, dispatchers, drivers, and enterprise users.',
    content: `TRUCK DISPATCH PRO - TERMS OF SERVICE
Effective Date: July 26, 2026 | Version v1.0

1. ACCEPTANCE OF TERMS
By accessing, signing up for, or using Truck Dispatch Pro ("Platform"), you agree to be bound by these Terms of Service. If you are entering into these terms on behalf of a carrier company or legal entity, you represent and warrant that you have full legal authority to bind such entity.

2. DESCRIPTION OF SERVICE
Truck Dispatch Pro is a multi-tenant SaaS platform providing truck dispatching, rate confirmation processing, driver load assignment, active load chat, consent-based GPS tracking, and carrier operations management tools.

3. ACCOUNT RESPONSIBILITIES
- You must maintain accurate, current, and complete account information.
- You are responsible for safeguarding user credentials and restricting unauthorized account access.
- Carrier Admins are solely responsible for managing internal roles (dispatchers, drivers) and ensuring proper user authorization.
- Carrier companies are responsible for obtaining all legally required driver consents for GPS tracking, SMS notifications, and system communications.

4. ACCEPTABLE USE & RESTRICTION
You agree not to:
- Use the Platform for fraudulent, illegal, or unauthorized transportation activities.
- Attempt to gain unauthorized access to other tenants' data or system infrastructure.
- Reverse engineer, decompile, or copy the Platform's software architecture.
- Transmit malicious code, spam, or abusive communications through the load chat or SMS features.

5. SUBSCRIPTION & BILLING
Use of the Platform is subject to active subscription fees as detailed in our Billing, Trial, Cancellation, and Refund Policy. Subscriptions automatically renew unless canceled prior to the renewal date.

6. INTELLECTUAL PROPERTY
Truck Dispatch Pro retains all right, title, and interest in and to the Platform, including proprietary algorithms, UI designs, trademarks, and documentation. Customers retain ownership of their proprietary carrier data.

7. DISCLAIMER OF WARRANTIES
THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

8. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, TRUCK DISPATCH PRO SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNATIVE DAMAGES, OR LOSS OF FREIGHT, PROFITS, OR REVENUE.

9. GOVERNING LAW
These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles.`
  },

  'master-services-agreement': {
    id: 'master-services-agreement',
    slug: 'master-services-agreement',
    title: 'Master Services Agreement',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'terms',
    summary: 'Enterprise contract governing multi-tenant SaaS provisioning, tenant isolation, availability, and enterprise support.',
    content: `TRUCK DISPATCH PRO - MASTER SERVICES AGREEMENT (MSA)
Effective Date: July 26, 2026 | Version v1.0

1. PURPOSE & STRUCTURE
This Master Services Agreement ("MSA") governs the commercial relationship between Truck Dispatch Pro and Customer ("Carrier Company"). Individual subscription plans, feature tiers, and billing schedules are incorporated herein.

2. TENANT ISOLATION & DATA SECURITY
- Truck Dispatch Pro guarantees multi-tenant software isolation enforcing complete data segregation between tenant companies.
- Neither Customer nor its authorized users shall be granted access to third-party tenant data.
- Data security controls include AES-256 encryption at rest, TLS 1.3 in transit, and role-based access control (RBAC).

3. SERVICE LEVEL & AVAILABILITY
Truck Dispatch Pro targets 99.9% operational availability for dispatch, load management, and core database systems, excluding scheduled maintenance windows as set forth in our System Status & Support Policies.

4. COMPLIANCE & DRIVER CONSENTS
- Customer acknowledges full responsibility for compliance with all local, state, federal, and FMCSA transportation laws.
- Customer agrees to obtain explicit, legally binding driver consents for GPS location tracking and SMS notifications prior to dispatching drivers on the Platform.

5. INDEMNIFICATION
Customer shall defend, indemnify, and hold harmless Truck Dispatch Pro from and against claims, liabilities, damages, and costs arising from Customer's breach of law, unauthorized dispatching, or failure to secure mandatory driver consents.

6. TERM & TERMINATION
This MSA remains in effect for the duration of Customer's active subscription. Either party may terminate for material breach if uncured after 30 days written notice.`
  },

  'billing-trial-cancellation-refund-policy': {
    id: 'billing-trial-cancellation-refund-policy',
    slug: 'billing-trial-cancellation-refund-policy',
    title: 'Billing, Trial, Cancellation & Refund Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'policies',
    summary: 'Outlines subscription pricing tiers ($59.99/mo Basic, $159.99/mo Premium), 30-day trial terms, payment conditions, auto-renewals, and refund terms.',
    content: `TRUCK DISPATCH PRO - BILLING, TRIAL, CANCELLATION & REFUND POLICY
Effective Date: July 26, 2026 | Version v1.0

1. SUBSCRIPTION PRICING TIERS
Truck Dispatch Pro offers two primary SaaS subscription plans for motor carriers:
- Basic Tier: $59.99 / month. Includes core dispatching, load management, basic driver portal, rate confirmation storage, and standard communications.
- Premium Tier: $159.99 / month. Includes full dispatch suite, active GPS tracking telemetry, AI rate confirmation parsing, advanced fleet analytics, priority support, and multi-dispatcher management.

2. 30-DAY FREE TRIAL TERMS
- Optional 30-Day Free Trial may be made available to eligible new carrier accounts.
- A valid credit card or payment method is required upfront at the time of signup to initiate the trial.
- $0.00 will be charged during the 30-day trial period.
- At the end of the 30-day trial period, the selected subscription tier ($59.99/mo or $159.99/mo) will automatically bill to the payment method on file, unless canceled prior to trial expiration.

3. RECURRING BILLING & AUTOMATIC RENEWAL
Subscriptions are billed in advance on a monthly recurring cycle. Your payment method will be automatically charged on each renewal date unless canceled in advance through the Tenant Admin billing settings.

4. PAYMENT FAILURE & FEATURE PAUSE
- If a recurring payment fails, a 3-day grace period will be initiated.
- If payment is not resolved within 3 days, Premium features (including AI parsing, active GPS tracking, and advanced dispatch tools) may be automatically paused or downgraded.
- Continued failure to resolve billing will result in account suspension.

5. CANCELLATION POLICY
You may cancel your subscription at any time via the Tenant Portal billing settings. Cancellation takes effect at the conclusion of the current prepaid billing cycle. You will retain access until the end of your prepaid period.

6. REFUND POLICY
All subscription fees are non-refundable. We do not provide prorated refunds or credits for partial monthly subscription periods, unused driver seats, or downgraded feature tiers.`
  },

  'sms-terms': {
    id: 'sms-terms',
    slug: 'sms-terms',
    title: 'SMS Terms & Conditions',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'policies',
    summary: 'Governs transactional SMS notification services, opt-in consent, frequency, rate disclaimers, opt-out commands, and strict non-sharing data privacy commitment.',
    content: `TRUCK DISPATCH PRO - SMS TERMS & CONDITIONS
Effective Date: July 26, 2026 | Version v1.0

1. PROGRAM DESCRIPTION & OPT-IN
Truck Dispatch Pro provides transactional SMS notification services to carrier admins, dispatchers, and drivers. Notifications include assigned load details, pickup/delivery updates, GPS tracking consent requests, account security alerts, support ticket updates, and driver breakdown/SOS alerts.

2. SMS OPT-IN CONSENT CLAUSE
"I agree to receive SMS notifications from Truck Dispatch Pro and my carrier company regarding dispatch operations, assigned loads, pickup/delivery updates, GPS consent requests, account alerts, support updates, and critical driver alerts. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase."

3. NON-SHARING & PRIVACY COMMITMENT
Text messaging originator opt-in data and consent will not be sold, rented, shared, or disclosed to third parties or affiliates for their marketing or promotional purposes.

4. OPT-OUT & HELP COMMANDS
- You may opt out of SMS notifications at any time by replying STOP to any text message received.
- Reply HELP for assistance, or contact support@truckdispatchpro.com.
- After opting out, you will receive a single confirmation message verifying your removal from SMS notifications.

5. MESSAGE FREQUENCY & RATES
Message frequency varies based on active dispatch loads, driver alerts, and carrier account activity. Standard message and data rates applied by your wireless carrier may apply.

6. CARRIER COMPLIANCE & WIRELESS DISCLAIMER
Carriers and mobile network operators (e.g., AT&T, T-Mobile, Verizon) are not liable for delayed or undelivered text messages.`
  },

  'gps-location-consent': {
    id: 'gps-location-consent',
    slug: 'gps-location-consent',
    title: 'GPS & Location Tracking Consent Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Mandates load-based, consent-driven GPS location tracking rules for drivers and fleet operators.',
    content: `TRUCK DISPATCH PRO - GPS & LOCATION TRACKING CONSENT POLICY
Effective Date: July 26, 2026 | Version v1.0

1. CONSENT-BASED & LOAD-RESTRICTED TRACKING
Truck Dispatch Pro strictly enforces consent-driven, operational GPS location tracking:
- GPS location data is tracked ONLY when a driver is assigned to an active dispatch load or has reported an active SOS/breakdown alert.
- GPS tracking is NEVER active continuously 24/7 or outside active load assignments.
- Drivers retain full visibility into active tracking status and may review recorded location breadcrumbs on assigned loads.

2. REQUIRED DRIVER GPS CONSENT CLAUSE
"I understand that my carrier company may request GPS/location updates through Truck Dispatch Pro for active dispatch operations, assigned loads, delivery visibility, breakdown alerts, and safety-related dispatch coordination."

3. PURPOSE OF GPS TRACKING
Location data is processed solely for:
- Providing real-time load tracking and estimated arrival times (ETA) to carrier dispatchers.
- Locating drivers during roadside emergencies or vehicle breakdown SOS alerts.
- Creating verifiable delivery location audit trails for shippers and brokers.

4. RECORDKEEPING & CONSENT STORAGE
Driver GPS consents are recorded with an immutable timestamp, driver ID, document version, IP address, and user-agent details under /admins/{companyId}/drivers/{driverId}/consents/{consentId}.`
  },

  'driver-terms': {
    id: 'driver-terms',
    slug: 'driver-terms',
    title: 'Driver Terms of Use',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'terms',
    summary: 'Rules and terms governing commercial drivers operating the Truck Dispatch Pro driver portal.',
    content: `TRUCK DISPATCH PRO - DRIVER TERMS OF USE
Effective Date: July 26, 2026 | Version v1.0

1. DRIVER PORTAL USE
As a commercial driver operating on Truck Dispatch Pro, you agree to use the mobile portal strictly for authorized transportation activities, updating duty status, reviewing assigned loads, submitting proof of delivery (POD), and communicating with your carrier dispatcher.

2. DRIVER RESPONSIBILITIES
- Maintain safe operating practices in full compliance with federal and state highway safety laws.
- NEVER interact with mobile devices or the Platform while physically operating a motor vehicle.
- Provide accurate duty status updates and load documentation.

3. CONSENTS & ACKNOWLEDGMENTS
Upon initial login, drivers must review and accept:
- Driver Terms of Use & Privacy Policy acknowledgment
- GPS / Location Tracking Consent
- SMS Notification Consent
- SOS / Breakdown Emergency Disclaimer

4. DATA RESTRICTIONS & PRIVACY
Drivers may only view loads, communications, and data assigned specifically to them. Drivers shall not access billing, company setup, administrative controls, or other drivers' data.`
  },

  'ai-features-disclaimer': {
    id: 'ai-features-disclaimer',
    slug: 'ai-features-disclaimer',
    title: 'AI Features & Output Disclaimer',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Disclaims automated accuracy for AI rate confirmation document parsing and automated extraction tools.',
    content: `TRUCK DISPATCH PRO - AI FEATURES & OUTPUT DISCLAIMER
Effective Date: July 26, 2026 | Version v1.0

1. AI PARSING & AUTOMATION NOTICE
Truck Dispatch Pro incorporates artificial intelligence and machine learning features for rate confirmation document parsing, load data extraction, and automated text ingestion.

2. MANDATORY AI DISCLAIMER CLAUSE
"AI-generated outputs may be inaccurate or incomplete. Users must review and confirm all AI-generated data before relying on it for dispatch, billing, compliance, pickup/delivery, or safety decisions."

3. USER RESPONSIBILITY
All rate confirmation data, addresses, rate amounts, pickup/delivery dates, commodity details, and special instructions extracted by AI tools MUST be human-verified by authorized carrier personnel prior to dispatching drivers or generating invoices.`
  },

  'acceptable-use-policy': {
    id: 'acceptable-use-policy',
    slug: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'policies',
    summary: 'Defines acceptable operational behavior and strictly prohibits system abuse, scraping, data theft, and unauthorized access.',
    content: `TRUCK DISPATCH PRO - ACCEPTABLE USE POLICY (AUP)
Effective Date: July 26, 2026 | Version v1.0

1. PROHIBITED CONDUCT
Users of Truck Dispatch Pro must adhere strictly to lawful commercial transportation conduct. You may not:
- Impersonate another carrier, broker, driver, or government official.
- Use automated scrapers, bots, or data harvesting scripts on the Platform.
- Upload fraudulent rate confirmations, falsified bills of lading, or deceptive identity documents.
- Attempt to bypass multi-tenant firewalls, RBAC permissions, or database security rules.
- Interfere with system performance or launch denial-of-service attacks.

2. ENFORCEMENT & SUSPENSION
Violation of this Acceptable Use Policy may result in immediate account suspension, termination of services, and legal reporting to law enforcement or FMCSA regulatory authorities.`
  },

  'data-processing-addendum': {
    id: 'data-processing-addendum',
    slug: 'data-processing-addendum',
    title: 'Data Processing Addendum (DPA)',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Contractual terms governing personal data processing under GDPR, CCPA, and US state privacy regulations.',
    content: `TRUCK DISPATCH PRO - DATA PROCESSING ADDENDUM (DPA)
Effective Date: July 26, 2026 | Version v1.0

1. ROLES & SCOPE
For the purposes of applicable data privacy laws (GDPR, CCPA/CPRA, VCDPA):
- Customer ("Carrier") is the Data Controller / Business.
- Truck Dispatch Pro is the Data Processor / Service Provider processing personal data strictly to provide dispatching and logistics software services.

2. PROCESSOR OBLIGATIONS
Truck Dispatch Pro shall:
- Process personal data strictly in accordance with Customer's documented instructions and this DPA.
- Maintain technical and organizational security measures protecting data against unauthorized access or disclosure.
- Ensure all personnel authorized to process data are bound by strict confidentiality obligations.
- Promptly notify Customer in the event of a confirmed security incident affecting Customer data.`
  },

  'subprocessors': {
    id: 'subprocessors',
    slug: 'subprocessors',
    title: 'Subprocessor List',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Public directory of third-party subprocessors utilized by Truck Dispatch Pro for cloud hosting, database, payments, and SMS.',
    content: `TRUCK DISPATCH PRO - SUBPROCESSOR LIST
Effective Date: July 26, 2026 | Version v1.0

Truck Dispatch Pro engages the following third-party subprocessors to deliver core SaaS capabilities:

1. Cloud Infrastructure & Database Services
- Google Cloud Platform (GCP) / Firebase: Cloud hosting, Firestore database storage, authentication, and encrypted document storage. Location: USA.

2. Payment Processing
- Stripe, Inc.: PCI-DSS Level 1 compliant payment gateway and subscription billing processing. Location: USA.

3. Telephony & Communication Services
- Twilio / Resend / SendGrid: Transactional SMS delivery, dispatch notifications, and email queue processing. Location: USA.

4. Mapping & Location Services
- Google Maps Platform: Mapping visualization, address geocoding, and distance matrix routing. Location: USA.`
  },

  'cookie-policy': {
    id: 'cookie-policy',
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'policies',
    summary: 'Explains essential browser cookies, local storage tokens, and session persistence used for authentication.',
    content: `TRUCK DISPATCH PRO - COOKIE POLICY
Effective Date: July 26, 2026 | Version v1.0

1. USE OF COOKIES & LOCAL STORAGE
Truck Dispatch Pro uses essential cookies and browser local storage strictly required for system functionality, session authentication, and security token management.

2. CATEGORIES OF TECHNOLOGIES USED
- Essential Session Cookies: Required to maintain secure login sessions and multi-tenant authentication tokens.
- Functional Local Storage: Stores user interface preferences (e.g., active dashboard theme, table column filters).
- Security Tokens: Short-lived authentication tokens preventing cross-site request forgery (CSRF).

3. NO THIRD-PARTY ADVERTISING COOKIES
Truck Dispatch Pro does NOT use third-party advertising cookies or cross-site tracking beacons.`
  },

  'security-overview': {
    id: 'security-overview',
    slug: 'security-overview',
    title: 'Security Overview',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'operational',
    summary: 'Detailed summary of military-grade security infrastructure, RBAC controls, data encryption, and multi-tenant rules.',
    content: `TRUCK DISPATCH PRO - SECURITY OVERVIEW
Effective Date: July 26, 2026 | Version v1.0

1. ARCHITECTURAL SECURITY
- Zero-Trust Firestore Security: Attribute-based access control (ABAC) rules preventing unauthorized tenant data reads or writes.
- Backend Authorization: Sensitive tenant management, staff creation, and billing operations executed exclusively via server-side Firebase Admin SDK routines.
- Data Encryption: All data in transit is encrypted using TLS 1.3. Data at rest is encrypted using AES-256.

2. ROLE-BASED ACCESS CONTROL (RBAC)
Strict hierarchy enforced across all user types:
- Super Admin: Platform owner administration.
- Tenant Admin: Full operational & company administration.
- Dispatcher: Operations manager (loads, drivers, dispatch, GPS, communications).
- Driver: Restricted portal access (assigned loads, own status/GPS/POD, load chat).`
  },

  'support-policy': {
    id: 'support-policy',
    slug: 'support-policy',
    title: 'Support Policy & SLA',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'operational',
    summary: 'Details support desk ticket priorities, response SLAs, and customer assistance channels.',
    content: `TRUCK DISPATCH PRO - SUPPORT POLICY & SLA
Effective Date: July 26, 2026 | Version v1.0

1. SUPPORT CHANNELS
Support is available via the in-app Support Center and email at support@truckdispatchpro.com.

2. TARGET RESPONSE TIMES
- Critical (System Outage / Dispatch Blocking): Initial response within 1 hour.
- High (Load Assignment / GPS Issues): Initial response within 4 hours.
- Normal (Account / Billing Inquiries): Initial response within 1 business day.`
  },

  'system-status-policy': {
    id: 'system-status-policy',
    slug: 'system-status-policy',
    title: 'System Status Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'operational',
    summary: 'Defines system status reporting, scheduled maintenance windows, and incident notification guidelines.',
    content: `TRUCK DISPATCH PRO - SYSTEM STATUS POLICY
Effective Date: July 26, 2026 | Version v1.0

1. MAINTENANCE WINDOWS
Scheduled system updates are conducted during low-traffic hours (Sundays 01:00 - 03:00 EST) with 48 hours advance notice posted in the System Health dashboard.

2. UPTIME COMMITMENT
We target 99.9% uptime for core dispatch, database, and rate confirmation systems.`
  },

  'data-retention-policy': {
    id: 'data-retention-policy',
    slug: 'data-retention-policy',
    title: 'Data Retention Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'operational',
    summary: 'Establishes retention schedules for dispatch records, rate confirmations, driver consents, and GPS breadcrumbs.',
    content: `TRUCK DISPATCH PRO - DATA RETENTION POLICY
Effective Date: July 26, 2026 | Version v1.0

1. RETENTION SCHEDULES
- Legal Agreement Records & Driver Consents: Retained permanently for audit compliance.
- Rate Confirmations & Bills of Lading: Retained for 7 years to satisfy commercial transportation accounting standards.
- Active Load GPS Coordinates: Summary stored on load document; detailed breadcrumbs retained for 90 days following load completion.
- Chat & Communications: Retained for the duration of the active tenant subscription.`
  },

  'incident-response-policy': {
    id: 'incident-response-policy',
    slug: 'incident-response-policy',
    title: 'Incident Response Policy',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'operational',
    summary: 'Protocol for security incident containment, investigation, and mandatory tenant notification.',
    content: `TRUCK DISPATCH PRO - INCIDENT RESPONSE POLICY
Effective Date: July 26, 2026 | Version v1.0

1. INCIDENT MANAGEMENT PROTOCOL
In the event of a confirmed cybersecurity incident or data breach, Truck Dispatch Pro executes rapid containment, forensic investigation, and regulatory disclosure protocols within 72 hours.`
  },

  'sos-breakdown-disclaimer': {
    id: 'sos-breakdown-disclaimer',
    slug: 'sos-breakdown-disclaimer',
    title: 'SOS / Breakdown Emergency Disclaimer',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Mandatory safety disclaimer stating that driver breakdown SOS alerts notify carrier dispatchers only and do NOT contact 911 emergency services.',
    content: `TRUCK DISPATCH PRO - SOS / BREAKDOWN EMERGENCY DISCLAIMER
Effective Date: July 26, 2026 | Version v1.0

MANDATORY EMERGENCY DISCLAIMER:
"Driver Breakdown / SOS alerts notify your carrier company’s dispatch/admin team only. This feature does not contact emergency services, police, ambulance, fire department, roadside assistance, insurance providers, or government agencies. If you are in immediate danger or need emergency help, call 911 or local emergency services immediately."`
  },

  'transportation-compliance-disclaimer': {
    id: 'transportation-compliance-disclaimer',
    slug: 'transportation-compliance-disclaimer',
    title: 'Transportation & FMCSA Compliance Disclaimer',
    version: 'v1.0',
    effectiveDate: 'July 26, 2026',
    category: 'compliance',
    summary: 'Disclaimer clarifying that Truck Dispatch Pro is a software provider and not a licensed freight broker, motor carrier, or ELD provider.',
    content: `TRUCK DISPATCH PRO - TRANSPORTATION & FMCSA COMPLIANCE DISCLAIMER
Effective Date: July 26, 2026 | Version v1.0

1. SOFTWARE PROVIDER STATUS
Truck Dispatch Pro is a technology software platform. Truck Dispatch Pro is NOT a motor carrier, freight broker, freight forwarder, or electronic logging device (ELD) hardware manufacturer.

2. CARRIER COMPLIANCE RESPONSIBILITY
Motor carrier customers are solely responsible for compliance with Federal Motor Carrier Safety Administration (FMCSA) regulations, Hours of Service (HOS) rules, driver qualification files, and vehicle inspection reports.`
  }
};

export const FOOTER_LEGAL_LINKS = [
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'terms-of-service', label: 'Terms of Service' },
  { slug: 'sms-terms', label: 'SMS Terms' },
  { slug: 'cookie-policy', label: 'Cookie Policy' },
  { slug: 'security-overview', label: 'Security' },
  { slug: 'subprocessors', label: 'Subprocessors' },
  { slug: 'support-policy', label: 'Support Policy' },
];
