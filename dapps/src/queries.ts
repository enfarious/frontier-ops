import {
  getAssemblyWithOwner,
  getObjectWithJson,
  getOwnedObjectsByType,
  transformToAssembly,
} from "@evefrontier/dapp-kit";

async function fetchAssemblyInfo(assemblyId: string) {
  const { moveObject, assemblyOwner } =
    await getAssemblyWithOwner(assemblyId);

  if (!moveObject) {
    console.error("Assembly not found");
    return null;
  }

  const rawJson = moveObject.contents.json;
  console.log("Raw assembly data:", rawJson);
  console.log("Character owner:", assemblyOwner);

  const assembly = await transformToAssembly(assemblyId, moveObject, {
    character: assemblyOwner,
  });
  console.log("Transformed assembly:", assembly);

  return { assembly, character: assemblyOwner };
}

/** STEP 5 — getObjectWithJson() for object by ID with JSON. */
async function fetchObjectData(objectId: string) {
  const result = await getObjectWithJson(objectId);

  const json = result.data?.object?.asMoveObject?.contents?.json;
  const type = result.data?.object?.asMoveObject?.contents?.type?.repr;

  console.log("Object type:", type);
  console.log("Object data:", json);

  return json;
}

/** STEP 5 — getOwnedObjectsByType() for owned objects by type and wallet address. */
async function fetchUserAssemblies(
  walletAddress: string,
  assemblyType: string,
) {
  const result = await getOwnedObjectsByType(walletAddress, assemblyType);

  const objectAddresses = result.data?.address?.objects?.nodes.map(
    (node) => node.address,
  );

  console.log("Owned object addresses:", objectAddresses);
  return objectAddresses;
}

export { fetchAssemblyInfo, fetchObjectData, fetchUserAssemblies };
