import { useCallback, useMemo } from "react";
import { useSQLQuery } from "./useSQL";
import { execute } from "../database";
import type {
  TribeRole,
  TribeRoleAssignment,
  Permission,
} from "../access-types";

export function useTribeRoles(
  tribeId: string | undefined,
  ownerAddress?: string,
) {
  const { data: rows } = useSQLQuery(
    "SELECT roles, assignments FROM tribe_roles WHERE tribe_id = $tid",
    { $tid: tribeId ?? "" },
    [tribeId],
  );

  const { roles, assignments } = useMemo(() => {
    if (!tribeId || rows.length === 0) return { roles: [] as TribeRole[], assignments: [] as TribeRoleAssignment[] };
    const row = rows[0] as any;
    return {
      roles: JSON.parse(row.roles || "[]") as TribeRole[],
      assignments: JSON.parse(row.assignments || "[]") as TribeRoleAssignment[],
    };
  }, [tribeId, rows]);

  const saveRolesData = useCallback(
    async (newRoles: TribeRole[], newAssignments: TribeRoleAssignment[]) => {
      if (!tribeId) return;
      await execute(
        `INSERT INTO tribe_roles (tribe_id, roles, assignments)
        VALUES ($tid, $roles, $assignments)
        ON CONFLICT(tribe_id) DO UPDATE SET roles = $roles, assignments = $assignments`,
        {
          $tid: tribeId,
          $roles: JSON.stringify(newRoles),
          $assignments: JSON.stringify(newAssignments),
        },
      );
    },
    [tribeId],
  );

  const createRole = useCallback(
    async (role: Omit<TribeRole, "id">) => {
      if (!tribeId) return;
      const id = role.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
      await saveRolesData([...roles, { ...role, id }], assignments);
    },
    [tribeId, roles, assignments, saveRolesData],
  );

  const updateRole = useCallback(
    async (roleId: string, updates: Partial<Omit<TribeRole, "id">>) => {
      await saveRolesData(
        roles.map((r) => (r.id === roleId ? { ...r, ...updates } : r)),
        assignments,
      );
    },
    [roles, assignments, saveRolesData],
  );

  const deleteRole = useCallback(
    async (roleId: string) => {
      await saveRolesData(
        roles.filter((r) => r.id !== roleId),
        assignments.filter((a) => a.roleId !== roleId),
      );
    },
    [roles, assignments, saveRolesData],
  );

  const assignRole = useCallback(
    async (address: string, roleId: string) => {
      await saveRolesData(roles, [
        ...assignments.filter((a) => a.address !== address),
        { address, roleId },
      ]);
    },
    [roles, assignments, saveRolesData],
  );

  const unassignRole = useCallback(
    async (address: string) => {
      await saveRolesData(
        roles,
        assignments.filter((a) => a.address !== address),
      );
    },
    [roles, assignments, saveRolesData],
  );

  const getRoleForAddress = useCallback(
    (address: string): TribeRole | undefined => {
      const assignment = assignments.find((a) => a.address === address);
      if (!assignment) return undefined;
      return roles.find((r) => r.id === assignment.roleId);
    },
    [assignments, roles],
  );

  const hasPermission = useCallback(
    (address: string, permission: Permission): boolean => {
      if (ownerAddress && address === ownerAddress) return true;
      const role = getRoleForAddress(address);
      if (!role) return false;
      if (role.permissions.includes("view_only") && role.permissions.length === 1) {
        return permission === "view_only";
      }
      return role.permissions.includes(permission);
    },
    [ownerAddress, getRoleForAddress],
  );

  return useMemo(
    () => ({
      roles,
      assignments,
      createRole,
      updateRole,
      deleteRole,
      assignRole,
      unassignRole,
      getRoleForAddress,
      hasPermission,
    }),
    [
      roles,
      assignments,
      createRole,
      updateRole,
      deleteRole,
      assignRole,
      unassignRole,
      getRoleForAddress,
      hasPermission,
    ],
  );
}
