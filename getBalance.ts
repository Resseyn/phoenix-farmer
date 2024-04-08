import { clusterApiUrl, Connection, PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as bs58 from "bs58";

export async function GetTradeBalance(trader: Keypair, mint: string){
    // connection
    const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
    const owner = new PublicKey(trader.publicKey);
    const response = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });

    for (const accountInfo of response.value) {
      if (mint == accountInfo.account.data["parsed"]["info"]["mint"]) {
          return accountInfo.account.data["parsed"]["info"]["tokenAmount"]["amount"]
      }
    }
    return 0;
  }
  