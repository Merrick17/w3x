import { tool } from "ai";
import { z } from "zod";
import { createSolanaRpc, address, isAddress, signature } from "@solana/kit";

// Default to mainnet for read-only tools if no RPC provided
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export const solanaTools = {
  getSolanaBalance: tool({
    description: "Get SOL balance for a Solana address using @solana/kit.",
    inputSchema: z.object({
      addr: z.string().describe("Solana wallet address (base58)"),
      rpcUrl: z.string().optional().describe("Optional custom RPC URL"),
    }),
    execute: async ({ addr, rpcUrl }) => {
      if (!isAddress(addr)) return { error: "Invalid Solana address" };

      const rpc = createSolanaRpc(rpcUrl || DEFAULT_RPC);
      try {
        const balance = await rpc.getBalance(address(addr)).send();
        return {
          address: addr,
          lamports: balance.value.toString(),
          sol: (Number(balance.value) / 1_000_000_000).toFixed(9),
        };
      } catch (err) {
        return {
          error: `Failed to fetch balance: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  }),

  resolveSNS: tool({
    description: "Simulated resolution of Solana Name Service (.sol) domains.",
    inputSchema: z.object({
      domain: z.string().describe('Domain name (e.g., "bonfida.sol")'),
    }),
    execute: async ({ domain }) => {
      // In a real implementation, we would use @bonfida/spl-name-service
      return {
        domain,
        resolved: "fake_address_for_demo_purposes",
        message:
          "SNS resolution requires additional specialized libraries. This is a placeholder for the agent to implement further.",
      };
    },
  }),

  analyzeSolanaTransaction: tool({
    description: "Fetch and analyze a Solana transaction signature using @solana/kit.",
    inputSchema: z.object({
      sig: z.string().describe("Transaction signature"),
      rpcUrl: z.string().optional().describe("Optional custom RPC URL"),
    }),
    execute: async ({ sig, rpcUrl }) => {
      const rpc = createSolanaRpc(rpcUrl || DEFAULT_RPC);
      try {
        const tx = await rpc
          .getTransaction(signature(sig), { maxSupportedTransactionVersion: 0, encoding: "json" })
          .send();
        if (!tx) return { error: "Transaction not found" };

        return {
          signature: sig,
          slot: tx.slot.toString(),
          blockTime: tx.blockTime,
          err: tx.meta?.err,
          fee: tx.meta?.fee.toString(),
        };
      } catch (err) {
        return {
          error: `Failed to fetch transaction: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  }),

  createSolanaRpcClient: tool({
    description: "Generate boilerplate code for a Solana RPC client using @solana/kit.",
    inputSchema: z.object({
      network: z.enum(["mainnet", "devnet", "testnet"]).describe("Target network"),
    }),
    execute: async ({ network }) => {
      const urls = {
        mainnet: "https://api.mainnet-beta.solana.com",
        devnet: "https://api.devnet.solana.com",
        testnet: "https://api.testnet.solana.com",
      };

      const code = `
import { createSolanaRpc, address } from '@solana/kit';

const rpc = createSolanaRpc('${urls[network]}');
const myAddress = address('YourAddressHere');

// Example: Get balance
const balance = await rpc.getBalance(myAddress).send();
console.log('Balance:', balance.value);
      `.trim();

      return { network, url: urls[network], boilerplate: code };
    },
  }),
};
