import { useState, useEffect } from 'react';

export function useAgentPermissions(
    onPermissionRequired?: (required: boolean) => void
) {
    const [needsPermission, setNeedsPermission] = useState(false);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.permissions) return;

        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
            const check = () => {
                // If state is 'prompt', we also want to show the PermissionCard (so user can click button)
                // instead of showing idle state without a clear way to enable it.
                const isNotGranted = permissionStatus.state !== 'granted';
                setNeedsPermission(isNotGranted);
                onPermissionRequired?.(isNotGranted);
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
