import { ActionResult } from '../../types';

export function actionNavigate(url: string): ActionResult {
    window.location.href = url;
    return { success: true, message: `Navigating to ${url}` };
}
