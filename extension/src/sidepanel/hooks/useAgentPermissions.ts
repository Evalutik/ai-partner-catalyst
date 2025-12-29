import { useState, useEffect } from 'react';

export function useAgentPermissions(
    onPermissionRequired?: (required: boolean) => void
) {
    const [needsPermission, setNeedsPermission] = useState(false);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.permissions) return;

        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
            const check = () => {
                const denied = permissionStatus.state === 'denied';
                setNeedsPermission(denied);
                onPermissionRequired?.(denied);
            };
            check();
            permissionStatus.onchange = check;
        });
    }, [onPermissionRequired]);

    return {
        needsPermission,
        setNeedsPermission
    };
}
