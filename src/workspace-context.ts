import { createContext } from "react";

/** Files in this workspace already synchronize through the notebook editor. */
export const WorkspaceVaultContext = createContext<string | null>(null);
