import {
  Button,
  Card,
  Flex,
  Heading,
  SegmentedControl,
  Separator,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import type { Contact, ContactStanding } from "./contacts-types";

interface ContactDetailProps {
  contact: Contact;
  onUpdate: (id: string, updates: Partial<Omit<Contact, "id" | "addedAt">>) => void;
  onRemove: (id: string) => void;
}

export function ContactDetail({ contact, onUpdate, onRemove }: ContactDetailProps) {
  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Heading size="3">Contact Details</Heading>
          <Button
            size="1"
            variant="soft"
            color="red"
            onClick={() => onRemove(contact.id)}
          >
            Remove
          </Button>
        </Flex>
        <Separator size="4" />

        <Flex direction="column" gap="1">
          <Text size="1" color="gray">Name</Text>
          <TextField.Root
            size="2"
            value={contact.name}
            onChange={(e) => onUpdate(contact.id, { name: e.target.value })}
          />
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="1" color="gray">Standing</Text>
          <SegmentedControl.Root
            value={contact.standing}
            onValueChange={(v) =>
              onUpdate(contact.id, { standing: v as ContactStanding })
            }
            size="1"
          >
            <SegmentedControl.Item value="friendly">Friendly</SegmentedControl.Item>
            <SegmentedControl.Item value="neutral">Neutral</SegmentedControl.Item>
            <SegmentedControl.Item value="hostile">Hostile</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="1" color="gray">Address / ID</Text>
          <Text size="1" style={{ fontFamily: "monospace" }}>
            {contact.id}
          </Text>
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="1" color="gray">Notes</Text>
          <TextArea
            size="2"
            placeholder="Add notes about this contact..."
            value={contact.notes}
            onChange={(e) => onUpdate(contact.id, { notes: e.target.value })}
            rows={4}
          />
        </Flex>

        <Text size="1" color="gray">
          Added {new Date(contact.addedAt).toLocaleDateString()}
        </Text>
      </Flex>
    </Card>
  );
}
