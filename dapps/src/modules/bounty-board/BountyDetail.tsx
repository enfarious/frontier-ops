import { useState } from "react";
import { Badge, Button, Card, Flex, Heading, Separator, Text, TextField } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { EnrichedBounty } from "./hooks/useOnChainBounties";
import { BOUNTY_STATUS_OPTIONS } from "./bounty-types";
import type { KillmailData } from "../danger-alerts/danger-types";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000000000000000000000000000";

function addr(a: string) {
  return `${a.slice(0, 10)}...${a.slice(-6)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface BountyDetailProps {
  bounty: EnrichedBounty;
  onSubmitClaim: (objectId: string, proof: string) => void;
  onApproveClaim: (objectId: string) => void;
  onRejectClaim: (objectId: string) => void;
  onCancel: (objectId: string) => void;
  killmails: KillmailData[];
  isPending?: boolean;
  error?: string | null;
}

export function BountyDetail({
  bounty,
  onSubmitClaim,
  onApproveClaim,
  onRejectClaim,
  onCancel,
  killmails,
  isPending,
  error,
}: BountyDetailProps) {
  const account = useCurrentAccount();
  const isCreator = account?.address === bounty.creator;
  const hasHunter = bounty.hunter !== ZERO_ADDR;
  const statusOpt = BOUNTY_STATUS_OPTIONS.find((s) => s.value === bounty.status);
  const [proofInput, setProofInput] = useState("");

  // Find killmails matching the bounty target
  const matchingKillmails = killmails.filter(
    (km) =>
      km.victimId === bounty.target ||
      km.victimAddress === bounty.target ||
      km.victimName === bounty.target,
  );

  // Auto-detected match
  const autoMatch = bounty.matchedKillmailId
    ? killmails.find((km) => km.id === bounty.matchedKillmailId)
    : null;

  return (
    <Flex direction="column" gap="3">
      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Flex align="center" gap="2">
              <Heading size="3">{bounty.title || "(untitled)"}</Heading>
              <Badge color="blue" size="1" variant="surface">On-Chain Escrow</Badge>
            </Flex>
            <Badge color={statusOpt?.color ?? "gray"} size="2">
              {statusOpt?.label ?? `Status(${bounty.status})`}
            </Badge>
          </Flex>
          <Separator size="4" />

          {bounty.description && (
            <Text size="2" style={{ whiteSpace: "pre-wrap" }}>{bounty.description}</Text>
          )}

          <Flex gap="4" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Target</Text>
              <Text size="2" weight="bold" color="red">{bounty.target}</Text>
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Reward</Text>
              <Text size="2" weight="bold" color="blue">
                {bounty.rewardSui.toFixed(bounty.rewardSui < 1 ? 4 : 2)} SUI
              </Text>
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Creator</Text>
              <Text size="2" style={{ fontFamily: "monospace" }}>{addr(bounty.creator)}</Text>
            </Flex>
          </Flex>

          {/* Auto-detected kill match */}
          {autoMatch && bounty.status === 0 && (
            <>
              <Separator size="4" />
              <Flex
                direction="column" gap="2" p="2"
                style={{ borderRadius: 6, border: "1px solid var(--red-6)", background: "var(--red-a2)" }}
              >
                <Flex align="center" gap="2">
                  <Badge color="red" size="1" variant="solid">KILL DETECTED</Badge>
                  <Text size="2" weight="bold">
                    {autoMatch.killerName || autoMatch.killerId} destroyed {autoMatch.victimName || autoMatch.victimId}
                  </Text>
                </Flex>
                <Flex gap="3">
                  <Text size="1" color="gray">{autoMatch.solarSystemName || autoMatch.solarSystemId}</Text>
                  <Text size="1" color="gray">{timeAgo(autoMatch.killTimestamp)}</Text>
                  <Text size="1" color="gray">{autoMatch.lossType}</Text>
                </Flex>
              </Flex>
            </>
          )}

          {/* Pending claim */}
          {bounty.status === 1 && hasHunter && (
            <>
              <Separator size="4" />
              <Flex
                direction="column" gap="2" p="2"
                style={{ borderRadius: 6, border: "1px solid var(--orange-6)", background: "var(--orange-a2)" }}
              >
                <Text size="2" weight="bold">Claim Pending Approval</Text>
                <Flex gap="4" wrap="wrap">
                  <Flex direction="column" gap="1">
                    <Text size="1" color="gray">Hunter</Text>
                    <Text size="2" style={{ fontFamily: "monospace" }}>{addr(bounty.hunter)}</Text>
                  </Flex>
                  {bounty.proof && (
                    <Flex direction="column" gap="1">
                      <Text size="1" color="gray">Proof</Text>
                      <Text size="1" style={{ fontFamily: "monospace" }}>{bounty.proof}</Text>
                    </Flex>
                  )}
                </Flex>

                {isCreator && (
                  <Flex gap="2" mt="1">
                    <Button size="1" variant="soft" color="green"
                      onClick={() => onApproveClaim(bounty.objectId)} disabled={isPending}>
                      Approve & Pay ({bounty.rewardSui.toFixed(2)} SUI)
                    </Button>
                    <Button size="1" variant="soft" color="red"
                      onClick={() => onRejectClaim(bounty.objectId)} disabled={isPending}>
                      Reject Claim
                    </Button>
                  </Flex>
                )}
              </Flex>
            </>
          )}

          {/* Claimed / paid */}
          {bounty.status === 2 && hasHunter && (
            <>
              <Separator size="4" />
              <Flex gap="4" wrap="wrap">
                <Flex direction="column" gap="1">
                  <Text size="1" color="gray">Claimed By</Text>
                  <Text size="2" style={{ fontFamily: "monospace" }}>{addr(bounty.hunter)}</Text>
                </Flex>
                {bounty.proof && (
                  <Flex direction="column" gap="1">
                    <Text size="1" color="gray">Proof</Text>
                    <Text size="1" style={{ fontFamily: "monospace" }}>{bounty.proof}</Text>
                  </Flex>
                )}
              </Flex>
            </>
          )}

          {/* Object ID */}
          <Flex gap="1" align="center">
            <Text size="1" color="gray">Object:</Text>
            <Text size="1" style={{ fontFamily: "monospace" }}>{addr(bounty.objectId)}</Text>
          </Flex>

          {/* Actions */}
          <Flex gap="2" mt="2" wrap="wrap">
            {/* Submit claim with proof */}
            {bounty.status === 0 && account && !isCreator && (
              <Flex align="center" gap="2">
                <TextField.Root
                  size="1"
                  placeholder="Killmail ID or proof..."
                  value={proofInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProofInput(e.target.value)}
                  style={{ width: 200 }}
                />
                <Button size="1" variant="soft" color="green"
                  disabled={!proofInput.trim() || isPending}
                  onClick={() => onSubmitClaim(bounty.objectId, proofInput.trim())}>
                  Submit Claim
                </Button>
              </Flex>
            )}

            {/* Quick claim from matching killmails */}
            {bounty.status === 0 && account && !isCreator && matchingKillmails.length > 0 && (
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">Matching kills:</Text>
                {matchingKillmails.slice(0, 3).map((km) => (
                  <Button key={km.id} size="1" variant="outline" color="red"
                    disabled={isPending}
                    onClick={() => onSubmitClaim(bounty.objectId, km.id)}>
                    {km.killerName || km.killerId} killed {km.victimName} — {timeAgo(km.killTimestamp)}
                  </Button>
                ))}
              </Flex>
            )}

            {/* Cancel (active, creator only) */}
            {bounty.status === 0 && isCreator && (
              <Button size="1" variant="soft" color="red"
                onClick={() => onCancel(bounty.objectId)} disabled={isPending}>
                Cancel (Refund)
              </Button>
            )}
          </Flex>

          {error && (
            <Text size="1" color="red" style={{ whiteSpace: "pre-wrap" }}>{error}</Text>
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
