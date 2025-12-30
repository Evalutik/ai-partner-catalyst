import { useState, useEffect, useRef } from 'react';

export function useAgentPermissions(
    onPermissionRequired?: (required: boolean) => void
) {
    // Start as true (assume we need permission until proven otherwise)
    const [needsPermission, setNeedsPermission] = useState(true);
    // Track if permission was already granted when we first checked
    const [wasGrantedInitially, setWasGrantedInitially] = useState(false);
    const isFirstCheckRef = useRef(true);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.permissions) return;

        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
            const check = () => {
                // Show permission card if not granted (both 'denied' and 'prompt' states)
                const needsAccess = permissionStatus.state !== 'granted';
                setNeedsPermission(needsAccess);
                onPermissionRequired?.(needsAccess);

                // Only set wasGrantedInitially on first check
                if (isFirstCheckRef.current) {
                    isFirstCheckRef.current = false;
                    setWasGrantedInitially(!needsAccess);
                }
            };
            check();
            permissionStatus.onchange = check;
        });
    }, [onPermissionRequired]);

    return {
        needsPermission,
        wasGrantedInitially,
        setNeedsPermission
    };
}
