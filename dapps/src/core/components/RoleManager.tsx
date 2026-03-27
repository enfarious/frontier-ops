import { useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Select,
  Separator,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Cross1Icon, Pencil1Icon, PlusIcon } from "@radix-ui/react-icons";
import { useOperatingContext } from "../OperatingContext";
import { ALL_PERMISSIONS } from "../access-types";
import type { Permission, TribeRole } from "../access-types";

export function RoleManager() {
  const { tribeRoles, isOwner, checkPermission } = useOperatingContext();
  const { roles, assignments, createRole, updateRole, deleteRole, assignRole, unassignRole } =
    tribeRoles;

  const canManageRoles = isOwner || checkPermission("manage_roles");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<TribeRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);

  const [newMemberAddr, setNewMemberAddr] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");

  function openCreate() {
    setRoleName("");
    setSelectedPerms([]);
    setEditingRole(null);
    setShowCreateDialog(true);
  }

  function openEdit(role: TribeRole) {
    setRoleName(role.name);
    setSelectedPerms([...role.permissions]);
    setEditingRole(role);
    setShowCreateDialog(true);
  }

  function handleSave() {
    if (!roleName.trim()) return;
    if (editingRole) {
      updateRole(editingRole.id, { name: roleName.trim(), permissions: selectedPerms });
    } else {
      createRole({ name: roleName.trim(), permissions: selectedPerms });
    }
    setShowCreateDialog(false);
  }

  function togglePerm(perm: Permission) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  function handleAssign() {
    const addr = newMemberAddr.trim();
    if (!addr || !newMemberRole) return;
    assignRole(addr, newMemberRole);
    setNewMemberAddr("");
    setNewMemberRole("");
  }

  if (!canManageRoles) {
    return (
      <Text size="2" color="gray">
        You don't have permission to manage roles.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="5">
      {/* Roles section */}
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Heading size="3">Roles</Heading>
          <Button size="1" variant="soft" onClick={openCreate}>
            <PlusIcon /> Add Role
          </Button>
        </Flex>

        {roles.length === 0 ? (
          <Text size="1" color="gray">
            No roles defined yet. Create a role to assign permissions to tribe
            members.
          </Text>
        ) : (
          <Table.Root variant="surface" size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Permissions</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="80px">Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {roles.map((role) => (
                <Table.Row key={role.id}>
                  <Table.Cell>
                    <Text size="2" weight="bold">
                      {role.name}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="1" wrap="wrap">
                      {role.permissions.map((p) => (
                        <Badge key={p} size="1" variant="soft">
                          {ALL_PERMISSIONS.find((ap) => ap.value === p)?.label ?? p}
                        </Badge>
                      ))}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="1">
                      <IconButton
                        size="1"
                        variant="ghost"
                        onClick={() => openEdit(role)}
                      >
                        <Pencil1Icon />
                      </IconButton>
                      <IconButton
                        size="1"
                        variant="ghost"
                        color="red"
                        onClick={() => deleteRole(role.id)}
                      >
                        <Cross1Icon />
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Flex>

      <Separator size="4" />

      {/* Assignments section */}
      <Flex direction="column" gap="3">
        <Heading size="3">Member Assignments</Heading>

        {assignments.length === 0 ? (
          <Text size="1" color="gray">
            No members assigned yet.
          </Text>
        ) : (
          <Table.Root variant="surface" size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Address</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="50px" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {assignments.map((a) => (
                <Table.Row key={a.address}>
                  <Table.Cell>
                    <Text size="1" style={{ fontFamily: "monospace" }}>
                      {a.address.slice(0, 10)}...{a.address.slice(-6)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="1" variant="soft">
                      {roles.find((r) => r.id === a.roleId)?.name ?? a.roleId}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => unassignRole(a.address)}
                    >
                      <Cross1Icon />
                    </IconButton>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}

        {roles.length > 0 && (
          <Flex gap="2" align="end">
            <TextField.Root
              size="1"
              placeholder="Member address (0x...)"
              value={newMemberAddr}
              onChange={(e) => setNewMemberAddr(e.target.value)}
              style={{ flex: 1 }}
            />
            <Select.Root value={newMemberRole} onValueChange={setNewMemberRole} size="1">
              <Select.Trigger placeholder="Role..." />
              <Select.Content>
                {roles.map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <IconButton size="1" onClick={handleAssign}>
              <PlusIcon />
            </IconButton>
          </Flex>
        )}
      </Flex>

      {/* Create/Edit Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Content maxWidth="420px">
          <Dialog.Title>
            {editingRole ? "Edit Role" : "Create Role"}
          </Dialog.Title>

          <Flex direction="column" gap="3" mt="3">
            <TextField.Root
              placeholder="Role name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
            />

            <Text size="2" weight="bold">
              Permissions
            </Text>
            <Flex direction="column" gap="2">
              {ALL_PERMISSIONS.map((p) => (
                <Flex key={p.value} align="center" gap="2" asChild>
                  <label>
                    <Checkbox
                      checked={selectedPerms.includes(p.value)}
                      onCheckedChange={() => togglePerm(p.value)}
                    />
                    <Text size="2">{p.label}</Text>
                  </label>
                </Flex>
              ))}
            </Flex>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={!roleName.trim()}>
              {editingRole ? "Save" : "Create"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}
