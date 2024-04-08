import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram,
  } from "@solana/web3.js";
  
  import base58 from "bs58";
  import * as Phoenix from "@ellipsis-labs/phoenix-sdk";
  import { isPhoenixMarketEventFillSummary } from "@ellipsis-labs/phoenix-sdk";
  import { GetTradeBalance } from "./getBalance";
  import { feePrice, numberOfTransactions, privateKey, slippage } from "./config";
  

  const mint = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  }
  
  export async function swap(side: Phoenix.Side) {
    const connection = new Connection("https://api.mainnet-beta.solana.com");

    const trader = Keypair.fromSecretKey(
      base58.decode(
        privateKey
      )
    );
  
    const marketAddress = new PublicKey(
      "4DoNfFBfF7UokCC2FQzriy7yHK6DY6NVdYpuekQ5pRgg"
    );
    const marketAccount = await connection.getAccountInfo(
      marketAddress,
      "confirmed"
    );
    if (!marketAccount) {
      throw Error(
        "Market account not found for address: " + marketAddress.toBase58()
      );
    }
  
    const client = await Phoenix.Client.createWithMarketAddresses(connection, [
      marketAddress,
    ]);
  
    const marketState = client.marketStates.get(marketAddress.toBase58());
    if (marketState === undefined) {
      throw Error("Market not found");
    }

    // const BidTokenAccount = await getOrCreateAssociatedTokenAccount(
    //     connection,
    //     trader,
    //     side == Phoenix.Side.Bid ? new PublicKey(mint["USDC"]) : new PublicKey(mint["SOL"]),
    //     trader.publicKey
    //   );
    //   const AskTokenAccount = await getOrCreateAssociatedTokenAccount(
    //     connection,
    //     trader,
    //     side == Phoenix.Side.Ask ? new PublicKey(mint["USDC"]) : new PublicKey(mint["SOL"]),
    //     trader.publicKey
    //   );
    
  
    const setupNewMakerIxs = await Phoenix.getMakerSetupInstructionsForMarket(
      connection,
      marketState,
      trader.publicKey
    );
    
    const setupTx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: feePrice}))

    if (setupNewMakerIxs.length !== 0) {
      setupTx.add(...setupNewMakerIxs); 
    }

    
    const balance = await GetTradeBalance(trader, (side == Phoenix.Side.Bid ? mint["USDC"] : mint["SOL"]))

    const inAmount = balance / (side == Phoenix.Side.Bid ? 10 ** 6 : 10 ** 9)

    console.log(
      side === Phoenix.Side.Ask ? "Selling" : "Market buy for",
      inAmount,
      side === Phoenix.Side.Ask ? "SOL" : "USDC",
      "with",
      slippage * 100,
      "% slippage"
    );
  
    const swapPacket = marketState.getSwapOrderPacket({
      side,
      inAmount,
      slippage,
    });
  
  
    // Generate a swap instruction from the order packet
    const swapIx = marketState.createSwapInstruction(swapPacket, trader.publicKey);
    // Create a transaction with the swap instruction
  
    setupTx.add(swapIx)
  
    const expectedOutAmount = client.getMarketExpectedOutAmount({
      marketAddress: marketAddress.toBase58(),
      side,
      inAmount,
    });
    console.log(
      "Expected out amount:",
      expectedOutAmount,
      side === Phoenix.Side.Ask ? "USDC" : "SOL"
    );
    const txId = await sendAndConfirmTransaction(connection, setupTx, [trader], {
      commitment: "confirmed",
    });
    console.log("Transaction ID:", txId);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const txResult = await Phoenix.getPhoenixEventsFromTransactionSignature(
      connection,
      txId
    );
  
    if (txResult.txFailed) {
      console.log("Swap transaction failed");
      return;
    }
  
    const fillEvents = txResult.instructions[0];
  
    const summaryEvent = fillEvents.events[fillEvents.events.length - 1];
    if (!isPhoenixMarketEventFillSummary(summaryEvent)) {
      throw Error(`Unexpected event type: ${summaryEvent}`);
    }
  
    // This is pretty sketch
    const summary: Phoenix.FillSummaryEvent = summaryEvent.fields[0];
  
    if (side == Phoenix.Side.Bid) {
      console.log(
        "Filled",
        marketState.baseLotsToRawBaseUnits(Phoenix.toNum(summary.totalBaseLotsFilled)),
        "SOL"
      );
    } else {
      console.log(
        "Sold",
        inAmount,
        "SOL for",
        marketState.quoteLotsToQuoteUnits(Phoenix.toNum(summary.totalQuoteLotsFilled)),
        "USDC"
      );
    }
    const fees = marketState.quoteLotsToQuoteUnits(
      Phoenix.toNum(summary.totalFeeInQuoteLots)
    );
  
    console.log(`Paid ${fees} in Phoenix fees`);
  }
  
  (async function () {
    for (let i = 0; i < numberOfTransactions * 2; i++) {
      console.log("Swap", i + 1, "of", numberOfTransactions * 2);
      try {
        if (i % 2 == 0){ 
          await swap(Phoenix.Side.Ask);
        } else {
          await swap(Phoenix.Side.Bid);
        }
        await new Promise((resolve) => setTimeout(resolve, 50000));
        console.log();
      } catch (err) {
        console.log("Error: ", err);
        i--
      }
    }
  
    process.exit(0);
  })();
  