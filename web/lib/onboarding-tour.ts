// lib/onboarding-tour.ts — Tour steps definition + plan-aware step builder
import type { Step } from 'react-joyride';
import { meetsMinPlan } from '@/lib/plans';

export const TOUR_STORAGE_KEY = 'ff-main-tour-seen';

interface BuildTourStepsOptions {
  planId: string;
  hasProducts: boolean;
}

export function buildTourSteps({ planId, hasProducts }: BuildTourStepsOptions): Step[] {
  const steps: Step[] = [];

  // A) Products
  steps.push({
    target: '[data-tour="nav-products"]',
    title: 'Products',
    content: hasProducts
      ? 'Manage your products and brands here.'
      : 'Add at least 1 brand and 1-3 products (name, notes, pain points, link) — better product data = better scripts.',
    disableBeacon: true,
    data: { route: '/admin/products' },
  });

  // B) Transcriber
  steps.push({
    target: '[data-tour="nav-transcriber"]',
    title: 'Transcriber',
    content: 'Paste a TikTok URL to transcribe any video. Study the hook, scenes, and emotional triggers.',
    disableBeacon: true,
    data: { route: '/admin/transcribe' },
  });

  // C) Content Studio
  steps.push({
    target: '[data-tour="nav-content-studio"]',
    title: 'Content Studio',
    content: 'Pick a product, choose content type + persona, set length, and generate a script.',
    disableBeacon: true,
    data: { route: '/admin/content-studio' },
  });

  // D) Script Library (Lite+)
  steps.push({
    target: '[data-tour="nav-script-library"]',
    title: 'Script Library',
    content: 'Star and tag scripts you want to reuse. Your best scripts live here.',
    disableBeacon: true,
    data: { route: '/admin/script-library' },
  });

  // E) Winners Bank — Pro+ only
  if (meetsMinPlan(planId, 'creator_pro')) {
    steps.push({
      target: '[data-tour="nav-winners"]',
      title: 'Winners Bank',
      content: 'Add winning videos here. Patterns from winners automatically improve your script generation.',
      disableBeacon: true,
      data: { route: '/admin/winners' },
    });
  }

  // F) Production Board — Pro+ only
  if (meetsMinPlan(planId, 'creator_pro')) {
    steps.push({
      target: '[data-tour="nav-pipeline"]',
      title: 'Production Board',
      content: 'Move scripts through Draft → Needs Edit → Ready to Post to track production.',
      disableBeacon: true,
      data: { route: '/admin/pipeline' },
    });
  }

  // G) Posting Queue — Pro+ only
  if (meetsMinPlan(planId, 'creator_pro')) {
    steps.push({
      target: '[data-tour="nav-posting-queue"]',
      title: 'Posting Queue',
      content: 'Post videos from here. Verify the checklist — caption, hashtags, product link — before publishing.',
      disableBeacon: true,
      data: { route: '/admin/posting-queue' },
    });
  }

  return steps;
}
