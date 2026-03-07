/**
 * Render an EditPlan to a final video file.
 *
 * Stub — will eventually shell out to FFmpeg or a cloud rendering service.
 */

import type { EditPlan } from './types';

export interface RenderResult {
  output_url: string;
  storage_path: string;
  duration_sec: number;
}

/**
 * Execute an EditPlan against a source video and produce a rendered output.
 * @throws Error — not yet implemented.
 */
export async function renderPlan(
  _sourceUrl: string,
  _plan: EditPlan,
): Promise<RenderResult> {
  throw new Error('NOT_IMPLEMENTED: renderPlan is scaffolding only');
}
