/**
 * Actions Module - Re-exports all action handlers
 */

export { openTab, closeTab, switchTab, handleTabAction } from './tabActions';
export type { TabActionResult } from './tabActions';

export { navigate, goBack, reload, isRestrictedPage, SAFE_ACTIONS_ON_RESTRICTED } from './navigationActions';
export type { NavigationResult } from './navigationActions';

export { speak, resolveElement, executePageAction } from './pageActions';
export type { PageActionResult, SpeakCallbacks } from './pageActions';
