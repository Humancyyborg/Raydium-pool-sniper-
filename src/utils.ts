import { Connection, PublicKey, Transaction, TransactionSignature } from "@solana/web3.js";
import { TransactionWithSigners } from "./constants";
import { WalletAdapter } from "@metaplex-foundation/js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";

export type ClusterType = "mainnet-beta" | "testnet" | "devnet" | "custom";

export const escape_markdown = (text: any) => {
    return text.replace(/([\.\+\-\|\(\)\#\_\[\]\~\=\{\}\,\!\`\>\<])/g, "\\$1").replaceAll('"', '`')
}

export async function signTransactions({
    transactionsAndSigners,
    wallet,
    connection,
  }: {
    transactionsAndSigners: TransactionWithSigners[];
    wallet: NodeWallet;
    connection: Connection;
  }) {
    if (!wallet.signAllTransactions) {
      throw new Error("Wallet not connected");
    }
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("max");
    transactionsAndSigners.forEach(({ transaction, signers = [] }) => {
      if (!wallet.publicKey) {
        throw new Error("Wallet not connected");
      }
  
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.setSigners(
        wallet.publicKey,
        ...signers.map((s) => s.publicKey)
      );
      if (signers?.length > 0) {
        transaction.partialSign(...signers);
      }
    });
  
    return await wallet.signAllTransactions(
      transactionsAndSigners.map(({ transaction }) => transaction)
    );
  }

  export async function sendSignedTransaction({
    signedTransaction,
    connection,
    successCallback,
    sendingCallback,
    timeout = DEFAULT_TIMEOUT,
    skipPreflight = true,
  }: {
    signedTransaction: Transaction;
    connection: Connection;
    successCallback?: (txSig: string) => Promise<void>;
    sendingCallback?: () => Promise<void>;
    // sentCallback?: (txSig: string) => void;
    timeout?: number;
    skipPreflight?: boolean;
  }): Promise<string> {
    const rawTransaction = signedTransaction.serialize();
    const startTime = getUnixTs();
  
    sendingCallback && sendingCallback();
  
    const txid: TransactionSignature = await connection.sendRawTransaction(
      rawTransaction,
      {
        skipPreflight,
      }
    );
  
    console.log("Started awaiting confirmation for", txid);
  
    let done = false;
    (async () => {
      while (!done && getUnixTs() - startTime < timeout) {
        connection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
        });
        await sleep(300);
      }
    })();
    try {
      await awaitTransactionSignatureConfirmation(txid, timeout, connection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.timeout) {
        throw new Error("Timed out awaiting confirmation on transaction");
      }
      const simulateResult = await connection.simulateTransaction(
        signedTransaction
      );
      if (simulateResult && simulateResult.value.err) {
        if (simulateResult.value.logs) {
          for (let i = simulateResult.value.logs.length - 1; i >= 0; --i) {
            const line = simulateResult.value.logs[i];
            if (line.startsWith("Program log: ")) {
              throw new Error(
                "Transaction failed: " + line.slice("Program log: ".length)
              );
            }
          }
        }
        throw new Error(JSON.stringify(simulateResult.value.err));
      }
      throw new Error("Transaction failed");
    } finally {
      done = true;
    }
  
    successCallback && successCallback(txid);
  
    console.log("Latency", txid, getUnixTs() - startTime);
    return txid;
  }

  async function awaitTransactionSignatureConfirmation(
    txid: TransactionSignature,
    timeout: number,
    connection: Connection
  ) {
    let done = false;
    const result = await new Promise((resolve, reject) => {
      (async () => {
        setTimeout(() => {
          if (done) {
            return;
          }
          done = true;
          console.log("Timed out for txid", txid);
          reject({ timeout: true });
        }, timeout);
        try {
          connection.onSignature(
            txid,
            (result) => {
              console.log("WS confirmed", txid, result);
              done = true;
              if (result.err) {
                reject(result.err);
              } else {
                resolve(result);
              }
            },
            connection.commitment
          );
          console.log("Set up WS connection", txid);
        } catch (e) {
          done = true;
          console.log("WS error in setup", txid, e);
        }
        while (!done) {
          // eslint-disable-next-line no-loop-func
          (async () => {
            try {
              const signatureStatuses = await connection.getSignatureStatuses([
                txid,
              ]);
              const result = signatureStatuses && signatureStatuses.value[0];
              if (!done) {
                if (!result) {
                  // console.log('REST null result for', txid, result);
                } else if (result.err) {
                  console.log("REST error for", txid, result);
                  done = true;
                  reject(result.err);
                } else if (
                  !(
                    result.confirmations ||
                    result.confirmationStatus === "confirmed" ||
                    result.confirmationStatus === "finalized"
                  )
                ) {
                  console.log("REST not confirmed", txid, result);
                } else {
                  console.log("REST confirmed", txid, result);
                  done = true;
                  resolve(result);
                }
              }
            } catch (e) {
              if (!done) {
                console.log("REST connection error: txid", txid, e);
              }
            }
          })();
          await sleep(300);
        }
      })();
    });
    done = true;
    return result;
  }

  export const getUnixTs = () => {
    return new Date().getTime() / 1000;
  };
  export function getExplorerAccountLink(
    account: PublicKey,
    cluster: ClusterType
  ): string {
    return `https://explorer.solana.com/address/${account.toString()}?cluster=${
      cluster === "mainnet-beta" ? null : cluster
    }`;
  }
  
  export const isLocalhost = (url: string) => {
    return url.includes("localhost") || url.includes("127.0.0.1");
  };
  
  export async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
 
  const DEFAULT_TIMEOUT = 30000;