/**
 * Personal ratings CRUD — local SQLite ratings you leave after transactions.
 */

import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";
import type { PersonalRating, RatingContext } from "../../../core/rating-types";

function rowToRating(row: any): PersonalRating {
  return {
    id: row.id,
    subjectAddress: row.subject_address,
    subjectName: row.subject_name ?? undefined,
    contextType: row.context_type as RatingContext,
    contextId: row.context_id ?? undefined,
    score: row.score,
    comment: row.comment ?? "",
    createdAt: row.created_at,
  };
}

export function useRatings(subjectAddress?: string) {
  const { data: rows } = useSQLQuery(
    subjectAddress
      ? "SELECT * FROM ratings WHERE subject_address = $addr ORDER BY created_at DESC"
      : "SELECT * FROM ratings ORDER BY created_at DESC",
    subjectAddress ? { $addr: subjectAddress } : undefined,
  );

  const ratings = useMemo(() => rows.map(rowToRating), [rows]);

  const averageScore = useMemo(() => {
    if (ratings.length === 0) return null;
    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }, [ratings]);

  const addRating = useCallback(
    async (
      subjectAddr: string,
      contextType: RatingContext,
      score: number,
      comment = "",
      subjectName?: string,
      contextId?: string,
    ) => {
      const id = `rating-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO ratings (id, subject_address, subject_name, context_type, context_id, score, comment, created_at)
        VALUES ($id, $addr, $name, $ctx, $cid, $score, $comment, $created)`,
        {
          $id: id,
          $addr: subjectAddr,
          $name: subjectName ?? null,
          $ctx: contextType,
          $cid: contextId ?? null,
          $score: score,
          $comment: comment,
          $created: Date.now(),
        },
      );
      return id;
    },
    [],
  );

  const removeRating = useCallback(
    async (id: string) => {
      await execute("DELETE FROM ratings WHERE id = $id", { $id: id });
    },
    [],
  );

  return { ratings, averageScore, addRating, removeRating };
}

/** Hook to get all ratings (not filtered by address). */
export function useAllRatings() {
  return useRatings(undefined);
}
