/**
 * Hybrid reputation display for a contact's detail view.
 * Shows chain reputation (market data) + personal ratings (your experience).
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Flex, Separator, Text } from "@radix-ui/themes";
import { StarDisplay } from "../../tradecraft/components/RatingDialog";
import { RatingDialog } from "../../tradecraft/components/RatingDialog";
import { useRatings } from "../../tradecraft/hooks/useRatings";
import { syncReputation } from "../../../core/chain-reputation";
import type { ChainReputation, RatingContext } from "../../../core/rating-types";
import {
  computeChainTrustScore,
  trustScoreLabel,
  trustScoreColor,
  RATING_CONTEXT_LABELS,
} from "../../../core/rating-types";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  contactAddress: string;
  contactName: string;
}

export function ReputationSection({ contactAddress, contactName }: Props) {
  const [chainRep, setChainRep] = useState<ChainReputation | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const { ratings, averageScore, addRating } = useRatings(contactAddress);

  const doSync = useCallback(async () => {
    if (!contactAddress || contactAddress.startsWith("contact-")) return;
    setSyncing(true);
    try {
      const rep = await syncReputation(contactAddress);
      setChainRep(rep);
    } catch (e) {
      console.error("[Reputation] Sync failed:", e);
    } finally {
      setSyncing(false);
    }
  }, [contactAddress]);

  useEffect(() => { doSync(); }, [doSync]);

  const isWalletAddress = contactAddress.startsWith("0x");
  const chainScore = chainRep ? computeChainTrustScore(chainRep) : 0;
  const hasChainActivity = chainRep && (
    chainRep.totalSales > 0 || chainRep.totalPurchases > 0 ||
    chainRep.totalBountiesPosted > 0 || chainRep.totalBountiesFulfilled > 0
  );

  return (
    <>
      <Separator size="4" />

      {/* Personal Trust Score */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text size="2" weight="bold">Your Experience</Text>
          <Flex gap="2">
            <Text
              size="1"
              color="blue"
              style={{ cursor: "pointer" }}
              onClick={() => setRateOpen(true)}
            >
              + Add Rating
            </Text>
          </Flex>
        </Flex>

        {averageScore !== null ? (
          <Card>
            <Flex gap="3" align="center">
              <StarDisplay score={averageScore} size={16} />
              <Text size="2" weight="bold">{averageScore}/5</Text>
              <Text size="1" color="gray">({ratings.length} rating{ratings.length !== 1 ? "s" : ""})</Text>
            </Flex>
          </Card>
        ) : (
          <Text size="1" color="gray">No personal ratings yet. Rate after a transaction.</Text>
        )}

        {/* Rating history */}
        {ratings.length > 0 && (
          <Flex direction="column" gap="1" style={{ maxHeight: 160, overflow: "auto" }}>
            {ratings.map((r) => (
              <Flex key={r.id} gap="2" align="center" style={{ padding: "2px 0" }}>
                <StarDisplay score={r.score} size={10} />
                <Badge size="1" variant="outline" color="gray">
                  {RATING_CONTEXT_LABELS[r.contextType]}
                </Badge>
                {r.comment && (
                  <Text size="1" color="gray" style={{ flex: 1 }}>
                    {r.comment.length > 60 ? r.comment.slice(0, 60) + "..." : r.comment}
                  </Text>
                )}
                <Text size="1" color="gray">{timeAgo(r.createdAt)}</Text>
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>

      {/* Chain Reputation */}
      <Separator size="4" />
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text size="2" weight="bold">Chain Reputation</Text>
          {isWalletAddress && (
            <Text
              size="1"
              color="blue"
              style={{ cursor: "pointer" }}
              onClick={doSync}
            >
              {syncing ? "Syncing..." : "Refresh"}
            </Text>
          )}
        </Flex>

        {!isWalletAddress ? (
          <Text size="1" color="gray">No wallet address — chain reputation unavailable.</Text>
        ) : !chainRep ? (
          <Text size="1" color="gray">{syncing ? "Loading chain data..." : "No chain data cached."}</Text>
        ) : !hasChainActivity ? (
          <Text size="1" color="gray">No marketplace activity found on-chain.</Text>
        ) : (
          <Card>
            <Flex direction="column" gap="2">
              <Flex gap="2" align="center">
                <Badge size="1" variant="solid" color={trustScoreColor(chainScore)}>
                  {chainScore}/100
                </Badge>
                <Text size="2" weight="bold" color={trustScoreColor(chainScore)}>
                  {trustScoreLabel(chainScore)}
                </Text>
              </Flex>

              <Flex gap="4" wrap="wrap">
                {chainRep.totalSales > 0 && (
                  <Text size="1" color="gray">{chainRep.totalSales} sale{chainRep.totalSales !== 1 ? "s" : ""}</Text>
                )}
                {chainRep.totalPurchases > 0 && (
                  <Text size="1" color="gray">{chainRep.totalPurchases} purchase{chainRep.totalPurchases !== 1 ? "s" : ""}</Text>
                )}
                {chainRep.totalBountiesPosted > 0 && (
                  <Text size="1" color="gray">{chainRep.totalBountiesPosted} bounties posted</Text>
                )}
                {chainRep.fulfillmentsAccepted > 0 && (
                  <Text size="1" color="green">{chainRep.fulfillmentsAccepted} accepted</Text>
                )}
                {chainRep.fulfillmentsRejected > 0 && (
                  <Text size="1" color="red">{chainRep.fulfillmentsRejected} rejected</Text>
                )}
              </Flex>

              {chainRep.lastSyncedAt > 0 && (
                <Text size="1" color="gray">Last synced {timeAgo(chainRep.lastSyncedAt)}</Text>
              )}
            </Flex>
          </Card>
        )}
      </Flex>

      {/* Rating Dialog */}
      <RatingDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        subjectName={contactName}
        subjectAddress={contactAddress}
        contextType={"package_purchase" as RatingContext}
        onSubmit={addRating}
      />
    </>
  );
}
