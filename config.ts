import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair } from "@solana/web3.js"

export const tokenBaseInfo ={ 
    tokenAddress:'',
    marketId:'',
    tokenSupply:1000000, // 1 Million tokens
    addLP: 90,   // 90% of Tokens
    addSol: 2,  // sol amount to add
    devnet:false,
    tips:10,  // tips  jito bundler
    wallets:[ 
        {
            address:'',
            amountToSwap:0.25,
            privateKey:[] 
               } ,
        {
            address:'',
            amountToSwap:0.25,
            privateKey:[] 

        } 
    ]
}
 

 const deployerKey=[]

export const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(deployerKey)));
 

export const RPC_URL = tokenBaseInfo.devnet? 'https://solana-devnet.g.alchemy.com/v2/xxxx':
    'https://solana-mainnet.g.alchemy.com/v2/xxxx';

export const connection = new Connection(RPC_URL,'confirmed') 
