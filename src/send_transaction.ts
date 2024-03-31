
import { Connection, Signer, Transaction } from "@solana/web3.js";
import { tokenInfo } from "../config";



//sleep function
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//sending a transaction
export async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>) {

  const hash_info = (await connection.getLatestBlockhashAndContext()).value;

  transaction.recentBlockhash = hash_info.blockhash
  transaction.lastValidBlockHeight = hash_info.lastValidBlockHeight
  transaction.feePayer = signers[0].publicKey


  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();


  var txid: string;
  try {
    txid = await connection.sendRawTransaction(rawTransaction, { skipPreflight: false, })

    if (tokenInfo.devnet)
      console.log(
        ` Transaction: https://solscan.io/tx/${txid}?cluster=devnet`,
      );
    else
      console.log(
        ` Transaction: https://solscan.io/tx/${txid}`,
      );

  }
  catch (e) {
    console.log(e)
    return 1
  }

  while (true) {
    const ret = await connection.getSignatureStatus(txid, { searchTransactionHistory: true })
    try {
      //@ts-ignore
      if (ret) {
        if (ret.value && ret.value.err == null) {
          return txid
        } else if (ret.value && ret.value.err != null) {

          console.log(ret.value.err)
          return 1
        } else {
          continue
        }
      }
    } catch (e) {
      console.log(e)
      return 1
    }

  }

}