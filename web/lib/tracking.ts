/**
 * Client-side event tracking and analytics
 *
 * Replace console logging with actual analytics service:
 * - Google Analytics: gtag('event', name, params)
 * - Mixpanel: mixpanel.track(name, params)
 * - Amplitude: amplitude.track(name, params)
 * - PostHog: posthog.capture(name, params)
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

// ============================================
// State
// ============================================

let userProperties: UserProperties = {};
let isInitialized = false;
const eventQueue: TrackingEvent[] = [];

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

  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking] User identified:', properties);
  }
}

/**
 * Clear user identity (on logout)
 */
export function resetTracking() {
  userProperties = {};

  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking] Reset');
  }
}

/**
 * Send event to analytics service
 */
function sendEvent(event: TrackingEvent) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking]', event.name, event.properties);
  }

  // Production: Send to analytics service
  // Example: gtag('event', event.name, event.properties);
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
