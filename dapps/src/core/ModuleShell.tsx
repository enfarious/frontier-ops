import { Suspense } from "react";
import { Box, Flex, Spinner, Text } from "@radix-ui/themes";
import type { ModuleDefinition } from "./module-registry";

interface ModuleShellProps {
  module: ModuleDefinition | null;
}

export function ModuleShell({ module }: ModuleShellProps) {
  if (!module) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Select a module from the sidebar</Text>
      </Flex>
    );
  }

  const Component = module.component;

  return (
    <Suspense
      fallback={
        <Flex align="center" justify="center" style={{ height: "100%" }}>
          <Spinner size="3" />
        </Flex>
      }
    >
      <Box p="4" style={{ height: "100%", overflow: "auto" }}>
        <Component />
      </Box>
    </Suspense>
  );
}
