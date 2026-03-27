import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";
import type { Contact, ContactStanding } from "../contacts-types";

function rowToContact(row: any): Contact {
  return {
    id: row.id,
    name: row.name,
    standing: row.standing as ContactStanding,
    notes: row.notes ?? "",
    addedAt: row.added_at,
  };
}

export function useContacts() {
  const { data: rows } = useSQLQuery(
    "SELECT * FROM contacts ORDER BY added_at DESC",
  );

  const contacts = useMemo(() => rows.map(rowToContact), [rows]);

  const addContact = useCallback(
    async (name: string, standing: ContactStanding, id?: string) => {
      const contactId = id || `contact-${Date.now()}`;
      await execute(
        `INSERT OR IGNORE INTO contacts (id, name, standing, notes, added_at, scope)
        VALUES ($id, $name, $standing, '', $added_at, 'solo')`,
        { $id: contactId, $name: name, $standing: standing, $added_at: Date.now() },
      );
    },
    [],
  );

  const updateContact = useCallback(
    async (id: string, updates: Partial<Omit<Contact, "id" | "addedAt">>) => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { $id: id };
      if (updates.name !== undefined) { sets.push("name = $name"); params.$name = updates.name; }
      if (updates.standing !== undefined) { sets.push("standing = $standing"); params.$standing = updates.standing; }
      if (updates.notes !== undefined) { sets.push("notes = $notes"); params.$notes = updates.notes; }
      if (sets.length === 0) return;
      await execute(`UPDATE contacts SET ${sets.join(", ")} WHERE id = $id`, params);
    },
    [],
  );

  const removeContact = useCallback(
    async (id: string) => {
      await execute("DELETE FROM contacts WHERE id = $id", { $id: id });
    },
    [],
  );

  const getContact = useCallback(
    (id: string) => contacts.find((c) => c.id === id),
    [contacts],
  );

  return { contacts, addContact, updateContact, removeContact, getContact };
}
