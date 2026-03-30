import { useState } from "react";
import { Button, Dialog, Flex, Text, TextArea } from "@radix-ui/themes";
import { StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import type { RatingContext } from "../../../core/rating-types";
import { RATING_CONTEXT_LABELS } from "../../../core/rating-types";

interface RatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
  subjectAddress: string;
  contextType: RatingContext;
  contextId?: string;
  onSubmit: (
    subjectAddress: string,
    contextType: RatingContext,
    score: number,
    comment: string,
    subjectName?: string,
    contextId?: string,
  ) => Promise<unknown>;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <Flex gap="1" align="center">
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          size="5"
          color={star <= (hover || value) ? "yellow" : "gray"}
          style={{ cursor: "pointer", lineHeight: 1 }}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
        >
          {star <= (hover || value) ? <StarFilledIcon width={20} height={20} /> : <StarIcon width={20} height={20} />}
        </Text>
      ))}
      {value > 0 && <Text size="2" color="gray" ml="1">{value}/5</Text>}
    </Flex>
  );
}

export function RatingDialog({
  open,
  onOpenChange,
  subjectName,
  subjectAddress,
  contextType,
  contextId,
  onSubmit,
}: RatingDialogProps) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (score === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(subjectAddress, contextType, score, comment, subjectName, contextId);
      setScore(0);
      setComment("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 380 }}>
        <Dialog.Title>Rate {subjectName || subjectAddress.slice(0, 10) + "..."}</Dialog.Title>
        <Text size="1" color="gray">{RATING_CONTEXT_LABELS[contextType]}</Text>

        <Flex direction="column" gap="3" mt="3">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Rating</Text>
            <StarRating value={score} onChange={setScore} />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Comment (optional)</Text>
            <TextArea
              placeholder="How was your experience?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button
            disabled={score === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving..." : "Submit Rating"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Inline star display (read-only). */
export function StarDisplay({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <Flex gap="0" align="center" style={{ display: "inline-flex" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} color={star <= Math.round(score) ? "yellow" : "gray"} style={{ lineHeight: 1 }}>
          {star <= Math.round(score)
            ? <StarFilledIcon width={size} height={size} />
            : <StarIcon width={size} height={size} />}
        </Text>
      ))}
    </Flex>
  );
}
