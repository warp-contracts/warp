export type Action =
  | {
      function: "balanceOf";
      target: string;
      tokenId?: string | null;
    }
  | {
      from?: string | null;
      function: "transfer";
      qty: string;
      to: string;
      tokenId?: string | null;
    }
  | {
      allowFreeTransfer?: boolean | null;
      canEvolve?: boolean | null;
      function: "configure";
      operators?: string[] | null;
      paused?: boolean | null;
      proxies?: string[] | null;
      superOperators?: string[] | null;
    }
  | {
      approved: boolean;
      function: "setApprovalForAll";
      operator: string;
    }
  | {
      function: "isApprovedForAll";
      operator: string;
      owner: string;
    }
  | {
      function: "evolve";
      value: string;
    }
  | {
      baseId?: string | null;
      function: "mint";
      prefix?: string | null;
      qty: string;
    }
  | {
      function: "burn";
      owner?: string | null;
      qty: string;
      tokenId?: string | null;
    }
  | {
      actions: Action[];
      function: "batch";
    };

/**
 * This type allows to restrict the type of an interaction to a specific action.
 *
 * Example:
 * ```typescript
 * const specificAction: Actions["specificAction"] = { function: "specificAction", foo: "bar" };
 * ```
 */
export type Actions = {
    [K in Action["function"]]: Action & { function: K };
};