import type { ReactNode } from "react";
import type { Permission } from "../access-types";
import { useOperatingContext } from "../OperatingContext";

interface PermissionGateProps {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({
  permission,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { checkPermission } = useOperatingContext();
  return checkPermission(permission) ? <>{children}</> : <>{fallback}</>;
}
