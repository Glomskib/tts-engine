/**
 * Test IDs for E2E and integration testing
 *
 * Use these IDs in data-testid attributes for reliable test selectors.
 * Keeping IDs centralized prevents typos and makes refactoring easier.
 *
 * Usage in components:
 * <button data-testid={testIds.auth.loginButton}>Login</button>
 *
 * Usage in tests:
 * await page.getByTestId(testIds.auth.loginButton).click();
 */

export const testIds = {
  // ============================================
  // Authentication
  // ============================================
  auth: {
    loginForm: 'auth-login-form',
    loginButton: 'auth-login-button',
    signupButton: 'auth-signup-button',
    logoutButton: 'auth-logout-button',
    emailInput: 'auth-email-input',
    passwordInput: 'auth-password-input',
    errorMessage: 'auth-error-message',
  },

  // ============================================
  // Navigation
  // ============================================
  nav: {
    sidebar: 'nav-sidebar',
    sidebarToggle: 'nav-sidebar-toggle',
    mainMenu: 'nav-main-menu',
    mobileMenu: 'nav-mobile-menu',
    userMenu: 'nav-user-menu',
    logo: 'nav-logo',
  },

  // ============================================
  // Script Generator
  // ============================================
  scriptGenerator: {
    page: 'script-generator-page',
    productNameInput: 'script-product-name-input',
    descriptionInput: 'script-description-input',
    styleSelect: 'script-style-select',
    durationSelect: 'script-duration-select',
    generateButton: 'script-generate-button',
    resultCard: 'script-result-card',
    copyButton: 'script-copy-button',
    saveButton: 'script-save-button',
    regenerateButton: 'script-regenerate-button',
    loadingState: 'script-loading-state',
    errorState: 'script-error-state',
  },

  // ============================================
  // Script Library
  // ============================================
  scriptLibrary: {
    page: 'script-library-page',
    searchInput: 'script-library-search',
    filterDropdown: 'script-library-filter',
    scriptCard: 'script-library-card',
    scriptList: 'script-library-list',
    emptyState: 'script-library-empty',
    pagination: 'script-library-pagination',
  },

  // ============================================
  // Video Pipeline
  // ============================================
  videoPipeline: {
    page: 'video-pipeline-page',
    statusFilter: 'video-status-filter',
    videoCard: 'video-card',
    videoList: 'video-list',
    uploadButton: 'video-upload-button',
    statusBadge: 'video-status-badge',
    actionButton: 'video-action-button',
  },

  // ============================================
  // Video Creation Sheet
  // ============================================
  videoCreation: {
    sheet: 'video-creation-sheet',
    driveLinkInput: 'video-drive-link-input',
    prioritySelect: 'video-priority-select',
    notesInput: 'video-notes-input',
    submitButton: 'video-submit-button',
    closeButton: 'video-sheet-close',
  },

  // ============================================
  // Subscription / Upgrade
  // ============================================
  subscription: {
    page: 'subscription-page',
    planCard: 'subscription-plan-card',
    currentPlanBadge: 'subscription-current-plan',
    upgradeButton: 'subscription-upgrade-button',
    checkoutButton: 'subscription-checkout-button',
  },

  // ============================================
  // Admin
  // ============================================
  admin: {
    dashboard: 'admin-dashboard',
    statsCard: 'admin-stats-card',
    userTable: 'admin-user-table',
    actionDropdown: 'admin-action-dropdown',
  },

  // ============================================
  // Common UI Components
  // ============================================
  common: {
    loadingSpinner: 'common-loading-spinner',
    errorBoundary: 'common-error-boundary',
    toast: 'common-toast',
    modal: 'common-modal',
    modalClose: 'common-modal-close',
    confirmDialog: 'common-confirm-dialog',
    confirmButton: 'common-confirm-button',
    cancelButton: 'common-cancel-button',
    pagination: 'common-pagination',
    paginationNext: 'common-pagination-next',
    paginationPrev: 'common-pagination-prev',
  },

  // ============================================
  // Forms
  // ============================================
  form: {
    submitButton: 'form-submit-button',
    resetButton: 'form-reset-button',
    fieldError: 'form-field-error',
    successMessage: 'form-success-message',
  },
} as const;

/**
 * Helper to generate test ID with dynamic suffix
 */
export function getTestId(base: string, suffix?: string | number): string {
  return suffix !== undefined ? `${base}-${suffix}` : base;
}

/**
 * Helper to spread test ID props
 */
export function testIdProps(id: string) {
  // Only include test IDs in development/test environments
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_TEST_IDS) {
    return {};
  }
  return { 'data-testid': id };
}
