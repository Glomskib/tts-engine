/**
 * Client-side event tracking and analytics
 *
 * Wired to PostHog via components/PostHogProvider, which calls _setPosthog()
 * once the SDK has loaded. If no PostHog instance is registered (e.g. local
 * dev without NEXT_PUBLIC_POSTHOG_KEY), events fall back to console.log in
 * dev mode and silent no-op in production.
 */

// ============================================
// Types
// ============================================

interface TrackingEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

interface UserProperties {
  userId?: string;
  email?: string;
  plan?: string;
  role?: string;
  [key: string]: unknown;
}

interface PosthogLike {
  capture: (name: string, props?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
}

// ============================================
// State
// ============================================

let userProperties: UserProperties = {};
let isInitialized = false;
const eventQueue: TrackingEvent[] = [];

// Set by PostHogProvider once posthog-js has loaded. Kept as a generic
// PosthogLike so this module doesn't have to import posthog-js directly
// (it has a sizeable bundle and we don't want it on server-side imports).
let posthogClient: PosthogLike | null = null;

/** Internal hook for PostHogProvider. Don't call from feature code. */
export function _setPosthog(client: PosthogLike | null) {
  posthogClient = client;
}

// ============================================
// Core Functions
// ============================================

/**
 * Initialize tracking with optional configuration
 */
export function initTracking(config?: { debug?: boolean }) {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;

  isInitialized = true;

  if (config?.debug || process.env.NODE_ENV === 'development') {
    console.log('[Tracking] Initialized');
  }

  // Flush any queued events
  while (eventQueue.length > 0) {
    const event = eventQueue.shift();
    if (event) sendEvent(event);
  }
}

/**
 * Identify the current user
 */
export function identifyUser(properties: UserProperties) {
  userProperties = { ...userProperties, ...properties };

  if (posthogClient && properties.userId) {
    posthogClient.identify(properties.userId, {
      email: properties.email,
      plan: properties.plan,
      role: properties.role,
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking] User identified:', properties);
  }
}

/**
 * Clear user identity (on logout)
 */
export function resetTracking() {
  userProperties = {};

  if (posthogClient) {
    posthogClient.reset();
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking] Reset');
  }
}

/**
 * Send event to analytics service
 */
function sendEvent(event: TrackingEvent) {
  if (posthogClient) {
    posthogClient.capture(event.name, event.properties);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking]', event.name, event.properties);
  }
}

/**
 * Track a custom event
 */
export function track(name: string, properties?: Record<string, unknown>) {
  const event: TrackingEvent = {
    name,
    properties: {
      ...properties,
      ...userProperties,
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    },
    timestamp: new Date().toISOString(),
  };

  if (!isInitialized) {
    eventQueue.push(event);
    return;
  }

  sendEvent(event);
}

/**
 * Track a page view
 */
export function trackPageView(path?: string, title?: string) {
  track('page_view', {
    path: path || (typeof window !== 'undefined' ? window.location.pathname : ''),
    title: title || (typeof document !== 'undefined' ? document.title : ''),
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  });
}

// ============================================
// Pre-defined Event Trackers
// ============================================

export const events = {
  // Activation funnel — these are the "must-fire" events for the PostHog
  // signup → first-clip → first-export → first-paid funnel. Wire them at
  // each call site; PostHog dashboards key off these names exactly.
  signupCompleted: (params: { source?: string; referralCode?: string }) =>
    track('signup_completed', params),

  onboardingStarted: () =>
    track('onboarding_started'),

  onboardingCompleted: (params?: { stepCount?: number }) =>
    track('onboarding_completed', params),

  firstClipCreated: (params: { runId: string; source: 'upload' | 'youtube' | 'tiktok' }) =>
    track('first_clip_created', params),

  firstExportCompleted: (params: { runId: string; format?: string }) =>
    track('first_export_completed', params),

  firstPaidConverted: (params: { planId: string; amountUsd: number }) =>
    track('first_paid_converted', params),

  // Content generation
  scriptGenerated: (params: { style?: string; duration?: string; success: boolean }) =>
    track('script_generated', params),

  scriptCopied: (scriptId: string) =>
    track('script_copied', { scriptId }),

  scriptSaved: (scriptId: string) =>
    track('script_saved', { scriptId }),

  // Video pipeline
  videoRequestSubmitted: (params: { contentType: string; priority: number }) =>
    track('video_request_submitted', params),

  videoStatusChanged: (videoId: string, status: string) =>
    track('video_status_changed', { videoId, status }),

  // Subscription
  pricingViewed: () =>
    track('pricing_viewed'),

  checkoutStarted: (planId: string) =>
    track('checkout_started', { planId }),

  subscriptionCompleted: (planId: string) =>
    track('subscription_completed', { planId }),

  // Feature usage
  featureUsed: (feature: string) =>
    track('feature_used', { feature }),

  // Errors
  errorOccurred: (error: string, context?: string) =>
    track('error_occurred', { error, context }),

  // User actions
  buttonClicked: (buttonId: string, context?: string) =>
    track('button_clicked', { buttonId, context }),

  formSubmitted: (formId: string, success: boolean) =>
    track('form_submitted', { formId, success }),

  searchPerformed: (query: string, resultCount: number) =>
    track('search_performed', { query, resultCount }),

  // Remix
  remixCreated: (params: { remixSessionId?: string; platform: string; sourceUrl: string }) =>
    track('remix_created', params),

  remixShared: (remixSessionId: string) =>
    track('remix_shared', { remixSessionId }),

  remixViewed: (remixSessionId: string) =>
    track('remix_viewed', { remixSessionId }),
};

// ============================================
// Performance Monitoring
// ============================================

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
}

/**
 * Track a performance metric
 */
export function trackPerformance(metric: PerformanceMetric) {
  track('performance_metric', {
    metricName: metric.name,
    value: metric.value,
    unit: metric.unit,
  });
}

/**
 * Measure async operation duration
 */
export async function measureAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    const duration = Math.round(performance.now() - start);
    trackPerformance({ name, value: duration, unit: 'ms' });
  }
}

/**
 * Create a performance mark for later measurement
 */
export function startMeasure(name: string) {
  if (typeof performance === 'undefined') return () => {};

  const startMark = `${name}-start`;
  performance.mark(startMark);

  return () => {
    const endMark = `${name}-end`;
    performance.mark(endMark);

    try {
      const measure = performance.measure(name, startMark, endMark);
      trackPerformance({
        name,
        value: Math.round(measure.duration),
        unit: 'ms',
      });
    } catch {
      // Ignore measurement errors
    }

    // Clean up marks
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(name);
  };
}

/**
 * Track Web Vitals
 */
export function trackWebVitals() {
  if (typeof window === 'undefined') return;

  // LCP (Largest Contentful Paint)
  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    trackPerformance({
      name: 'LCP',
      value: Math.round(lastEntry.startTime),
      unit: 'ms',
    });
  });
  lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

  // FID (First Input Delay)
  const fidObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      if ('processingStart' in entry) {
        trackPerformance({
          name: 'FID',
          value: Math.round((entry as PerformanceEventTiming).processingStart - entry.startTime),
          unit: 'ms',
        });
      }
    });
  });
  fidObserver.observe({ type: 'first-input', buffered: true });

  // CLS (Cumulative Layout Shift)
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as LayoutShift).hadRecentInput) {
        clsValue += (entry as LayoutShift).value;
      }
    }
  });
  clsObserver.observe({ type: 'layout-shift', buffered: true });

  // Report CLS on page hide
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      trackPerformance({
        name: 'CLS',
        value: Math.round(clsValue * 1000) / 1000,
        unit: 'count',
      });
    }
  });
}

// Type declarations for Performance Observer entries
interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}
