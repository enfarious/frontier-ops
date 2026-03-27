export type AccessEntryType = "address" | "tribe";

export interface AccessEntry {
  id: string;
  type: AccessEntryType;
  label?: string;
  addedAt: number;
}

export type Permission =
  | "manage_turrets"
  | "manage_gates"
  | "manage_storage"
  | "manage_access_lists"
  | "manage_roles"
  | "view_only";

export const ALL_PERMISSIONS: { value: Permission; label: string }[] = [
  { value: "manage_turrets", label: "Manage Turrets" },
  { value: "manage_gates", label: "Manage Gates" },
  { value: "manage_storage", label: "Manage Storage" },
  { value: "manage_access_lists", label: "Manage Access Lists" },
  { value: "manage_roles", label: "Manage Roles" },
  { value: "view_only", label: "View Only" },
];

export interface TribeRole {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface TribeRoleAssignment {
  address: string;
  roleId: string;
}

export interface TribeRolesData {
  tribeId: string;
  roles: TribeRole[];
  assignments: TribeRoleAssignment[];
}
