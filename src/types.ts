/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ImageAdjustments {
  brightness: number;  // 50 to 150
  contrast: number;    // 50 to 150
  saturation: number;  // 0 to 200
  blur: number;        // 0 to 10
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
}

export type PresetFilter = 'normal' | 'vintage' | 'cool' | 'warm' | 'monochrome' | 'high-contrast' | 'faded';

export interface ScreenshotItem {
  id: string;
  originalUrl: string; // original un-adjusted image
  previewUrl: string;  // thumbnail/processed image url
  width: number;
  height: number;
  timestamp: number;
  label: string;
  format: 'png' | 'jpeg';
  adjustments: ImageAdjustments;
  filter: PresetFilter;
}
