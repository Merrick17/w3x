import { tool } from "ai";
import { z } from "zod";
import { createPublicClient, http, formatEther, parseAbi } from "viem";
import { mainnet, arbitrum, polygon, base, optimism, bsc } from "viem/chains";

const CHAINS = [
  { chain: mainnet, rpc: "https://eth.llamarpc.com" },
  { chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc" },
  { chain: polygon, rpc: "https://polygon-rpc.com" },
  { chain: base, rpc: "https://mainnet.base.org" },
  { chain: optimism, rpc: "https://mainnet.optimism.io" },
  { chain: bsc, rpc: "https://bsc-dataseed.binance.org" },
];

interface ReadChainArgs {
  chainId: number;
  address: string;
  method?: string;
  abiSnippet?: string;
  args?: string[];
}

interface SendTransactionArgs {
  chainId: number;
  to: string;
  value: string;
  data?: string;
}

export const web3Tools = {
  readChain: tool({
    description:
      "Read from an EVM blockchain using viem. Supports reading balance, block number, and calling arbitrary smart contract methods if ABI is provided.",
    inputSchema: z.object({
      chainId: z
        .number()
        .describe("Chain ID (1=ETH, 42161=ARB, 137=MATIC, 8453=BASE, 10=OP, 56=BSC)"),
      address: z.string().describe("Address to query"),
      method: z
        .string()
        .optional()
        .describe("Contract method name to call. If omitted, returns ETH balance."),
      abiSnippet: z
        .string()
        .optional()
        .describe(
          'Human-readable ABI snippet (e.g., "function balanceOf(address) view returns (uint256)")',
        ),
      args: z.array(z.string()).optional().describe("Arguments for the contract method"),
    }),
    execute: async ({ chainId, address, method, abiSnippet, args }: ReadChainArgs) => {
      const chainObj = CHAINS.find((c) => c.chain.id === chainId) || CHAINS[0];
      const client = createPublicClient({ chain: chainObj.chain, transport: http(chainObj.rpc) });
      try {
        if (!method) {
          const balance = await client.getBalance({ address: address as `0x${string}` });
          return {
            success: true,
            result: `Balance of ${address} on ${chainObj.chain.name}: ${formatEther(balance)} ETH`,
          };
        }
        if (!abiSnippet)
          return { success: false, message: "ABI snippet required for contract calls." };
        const abi = parseAbi([abiSnippet]);
        const data = await client.readContract({
          address: address as `0x${string}`,
          abi,
          functionName: method as never,
          args: args
            ? args.map((a: string) => (!isNaN(Number(a)) && a.trim() !== "" ? BigInt(a) : a))
            : [],
        } as never);
        return {
          success: true,
          result: `Call to ${method} on ${chainObj.chain.name} returned: ${String(data)}`,
        };
      } catch (err) {
        return {
          success: false,
          error: `Chain read error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  }),

  sendTransaction: tool({
    description:
      "Prepare a blockchain transaction for review. Actual sending requires explicit approval.",
    inputSchema: z.object({
      chainId: z.number(),
      to: z.string().describe("Recipient address"),
      value: z.string().describe("Value in ETH"),
      data: z.string().optional().describe("Call data (hex)"),
    }),
    execute: async ({ chainId, to, value, data }: SendTransactionArgs) => {
      const chainObj = CHAINS.find((c) => c.chain.id === chainId) || CHAINS[0];
      return {
        success: true,
        result: `Transaction prepared for ${chainObj.chain.name}:\n  To: ${to}\n  Value: ${value} ETH\n  Data: ${data || "none"}\n  [Actual sending requires user broadcast]`,
      };
    },
  }),

  listChains: tool({
    description: "List all supported blockchain networks with chain IDs.",
    inputSchema: z.object({}),
    execute: async () => ({ chains: CHAINS.map((c) => `${c.chain.name} (ID: ${c.chain.id})`) }),
  }),
};
