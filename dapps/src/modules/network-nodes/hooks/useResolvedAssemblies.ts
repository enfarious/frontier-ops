import { useQuery } from "@tanstack/react-query";
import { executeGraphQLQuery } from "@evefrontier/dapp-kit";

export interface ResolvedAssembly {
  id: string;
  name: string;
  shortType: string;
  typeRepr: string;
}

const GET_OBJECT = `
query GetObject($address: SuiAddress!) {
  object(address: $address) {
    asMoveObject {
      contents {
        type { repr }
        json
      }
    }
  }
}
`;

function shortTypeName(typeRepr: string): string {
  if (typeRepr.includes("turret::Turret")) return "Turret";
  if (typeRepr.includes("storage_unit::StorageUnit")) return "SSU";
  if (typeRepr.includes("gate::Gate")) return "Gate";
  if (typeRepr.includes("network_node::NetworkNode")) return "Network Node";
  if (typeRepr.includes("assembly::Assembly")) return "Assembly";
  // Extract last segment: "0x...::module::TypeName" → "TypeName"
  const parts = typeRepr.split("::");
  return parts[parts.length - 1] || "Unknown";
}

function extractName(json: Record<string, unknown>, shortType: string): string {
  const meta = json.metadata as Record<string, unknown> | undefined;
  const metaName = meta?.name as string | undefined;
  if (metaName) return metaName;
  const name = json.name as string | undefined;
  if (name) return name;
  return shortType;
}

async function resolveAll(ids: string[]): Promise<Map<string, ResolvedAssembly>> {
  const result = new Map<string, ResolvedAssembly>();
  // Fetch 3 at a time to be gentle
  for (let i = 0; i < ids.length; i += 3) {
    const batch = ids.slice(i, i + 3);
    const settled = await Promise.allSettled(
      batch.map(async (id) => {
        const res = await executeGraphQLQuery<any>(GET_OBJECT, { address: id });
        const contents = res.data?.object?.asMoveObject?.contents;
        if (!contents?.json) return null;
        const typeRepr = (contents.type?.repr as string) ?? "";
        const shortType = shortTypeName(typeRepr);
        const name = extractName(contents.json, shortType);
        return { id, name, shortType, typeRepr } satisfies ResolvedAssembly;
      }),
    );
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value) {
        result.set(s.value.id, s.value);
      }
    }
  }
  return result;
}

/**
 * Resolves a list of assembly object IDs to their names and types.
 * Returns a Map<id, ResolvedAssembly>.
 */
export function useResolvedAssemblies(ids: string[]): Map<string, ResolvedAssembly> {
  const key = ids.length > 0 ? ids.join(",") : "";

  const { data } = useQuery({
    queryKey: ["resolved-assemblies", key],
    queryFn: () => resolveAll(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000, // 10 min — names don't change often
  });

  return data ?? new Map();
}
