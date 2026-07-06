/**
 * Centralized version module
 * All version strings are injected at build time by Webpack/Vite DefinePlugin.
 * Fallback values (0.0.0) are never used in production builds.
 */
export const SCRIPT_VERSION = typeof __SCRIPT_VERSION__ !== 'undefined'
  ? __SCRIPT_VERSION__ : '0.0.0';

export const VIEWER_VERSION = typeof __VIEWER_VERSION__ !== 'undefined'
  ? __VIEWER_VERSION__ : '0.0.0';
