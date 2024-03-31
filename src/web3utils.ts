import { ASSOCIATED_TOKEN_PROGRAM_ID, ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent, createInitializeMintInstruction, createInitializeTransferFeeConfigInstruction, getAssociatedTokenAddress, getMintLen, getTransferFeeAmount, mintTo, unpackAccount, withdrawWithheldTokensFromAccounts } from "@solana/spl-token";
import { Account, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { AccountsAmount } from "./types";
import { NFTStorage } from 'nft.storage';
import { METADATA_2022_PROGRAM_ID, METADATA_2022_PROGRAM_ID_TESTNET, SUPPORTED_CHAINS } from "./constants";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage } from "@metaplex-foundation/js";
import * as fs from 'fs';
import * as mime from 'mime';
import { File } from "nft.storage";
import { NFT_STORAGE_TOKEN, RPC_URL, connection, privateKey, tokenInfo } from "../config";
import path from "path";
import { toMetaplexFile } from "@metaplex-foundation/js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { Umi, createSignerFromKeypair } from "@metaplex-foundation/umi";
import * as splToken from "@solana/spl-token";
import nftStorage from '@metaplex-foundation/umi-uploader-nft-storage'
import { bool, publicKey, struct, u32, u64, u8 } from "@raydium-io/raydium-sdk";
import { initializeAccount } from "@project-serum/serum/lib/token-instructions";
import { ASSOCIATED_PROGRAM_ID } from '@project-serum/anchor/dist/cjs/utils/token';

export const METAPLEX = Metaplex.make(connection)
    .use(keypairIdentity(privateKey))

function validateAddress(address: string) {
    let isValid = false;
    // Check if the address is valid
    try {
        new PublicKey(address);
        isValid = true;
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return isValid;
}

export async function initSolanaWeb3Connection(rpc: string): Promise<Connection> {
    let connection: Connection = new Connection(rpc, 'confirmed');
    try {
        connection = new Connection(rpc, 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return connection;
}


async function fileFromPath(filePath: string) {
    const content = await fs.promises.readFile(filePath)
    return new File([content], path.basename(filePath))
}

export async function uploadImageLogo(imagePath: string, name: string, symbol: string, description: string) {
    let imageUrl = ""


    try {

        const client = new NFTStorage({ token: NFT_STORAGE_TOKEN })
        const metadataInfo = await client.store({
            name: name,
            symbol: symbol,
            description: description,
            image: await fileFromPath(imagePath)
        })

        imageUrl = `https://${metadataInfo.ipnft}.ipfs.nftstorage.link/metadata.json`;
    } catch (ex) {
        console.log(ex)
    }
    return imageUrl
}
export async function uploadImage(umi: Umi, fileName: string): Promise<string> {
    console.log(`Step 1 - Uploading Image`);
    const imgBuffer = fs.readFileSync(fileName);
    const imgMetaplexFile = toMetaplexFile(imgBuffer, fileName);

    console.log(`Step 1 - Uploading Image ${fileName}`);
    console.log(`Step 1 - Uploading Image ${imgMetaplexFile}`);
    const [fileUri] = await umi.uploader.upload([imgMetaplexFile])


    const imgUri = fileUri;
    console.log(`   Image URI:`, imgUri); return imgUri;
}
export async function uploadMetadata(umi: Umi,imgUri: string, imgType: string) {
    console.log(`Step 2 - Uploading Metadata`);


    const uri = await umi.uploader.uploadJson({
        name: tokenInfo.tokenName,
        description: tokenInfo.description,
        image: imgUri,
        telegram:`https://t.me/${tokenInfo.symbol}_portal`,
        twitter:  ``,
        discord:``,
        website:``,
        properties: {
            files: [
                {
                    type: imgType,
                    uri: imgUri,
                },
            ]
        }
    })


    console.log('   Metadata URI:', uri);
    return uri;
}
interface Metadata {
    name: string;
    symbol: string;
    uri: string;
    tokenSupply: string;
    description: string;
}
export const metadata: Metadata = {
    name: tokenInfo.tokenName,
    symbol: tokenInfo.symbol,
    uri: null!,
    tokenSupply: tokenInfo.supply,
    description: tokenInfo.description + ` \n Telegram : https://t.me/${tokenInfo.symbol}_portal`
};
interface CreateMarketInfo {
    baseToken: PublicKey;
    quoteToken: PublicKey;
    baseLotSize: number;
    quoteLotSize: number;
    feeRateBps: number;
}
export const umi = createUmi(RPC_URL);
export const userWallet = umi.eddsa.createKeypairFromSecretKey(privateKey.secretKey);
export const userWalletSigner = createSignerFromKeypair(umi, userWallet);
export const SOL = 'So11111111111111111111111111111111111111112';


export async function revokeMintAuthority(baseMint: PublicKey) {

    try {
        let authorityTransaction = new Transaction().add(
            splToken.createSetAuthorityInstruction(
                baseMint,
                privateKey.publicKey,
                splToken.AuthorityType.MintTokens,
                null,
                [],
                TOKEN_PROGRAM_ID
            )
        );
        console.log(`REVOKING MINT AUTHORITY  -     `)

        const transactionId = await sendAndConfirmTransaction(
            connection,
            authorityTransaction,
            [privateKey]
        ).catch((error) => {
            console.log(error)
        })
        console.log(`REVOKED MINT AUTHORITY  -     ` + transactionId)

        return transactionId;
    } catch (error) {
        console.log(error);

        return null;
    }

}
export async function resetMintAuthority(baseMint: PublicKey) {

  try {
      let authorityTransaction = new Transaction().add(
          splToken.createSetAuthorityInstruction(
              baseMint,
              privateKey.publicKey,
              splToken.AuthorityType.MintTokens,
              privateKey.publicKey,
              [],
              TOKEN_PROGRAM_ID
          )
      );
      console.log(`RESETT MINT AUTHORITY  -     `)

      const transactionId = await sendAndConfirmTransaction(
          connection,
          authorityTransaction,
          [privateKey]
      ).catch((error) => {
          console.log(error)
      })
      console.log(`RESETT MINT AUTHORITY  -     ` + transactionId)

      return transactionId;
  } catch (error) {
      console.log(error);

      return null;
  }

}

export async function revokeFreezeAuthority(baseMint: PublicKey) {

    try {
        let authorityTransaction = new Transaction().add(
            splToken.createSetAuthorityInstruction(
                baseMint,
                privateKey.publicKey,
                splToken.AuthorityType.FreezeAccount,
                null,
                [],
                TOKEN_PROGRAM_ID
            )
        );
        console.log(`REVOKING FREEZE AUTHORITY  -     `)

        const transactionId = await sendAndConfirmTransaction(
            connection,
            authorityTransaction,
            [privateKey]
        ).catch((error) => {
            console.log(error)
        })
        console.log(`REVOKED FREEZE AUTHORITY  -     ` + transactionId)

        return transactionId;
    } catch (error) {
        console.log(error);

        return null;
    }

}


export async function createProgramAccountIfNotExist(
    connection: Connection,
    account: string | undefined | null,
    owner: PublicKey,
    programId: PublicKey,
    lamports: number | null,
    layout: any,
  
    transaction: Transaction,
    signer: Array<Account>
  ) {
    let publicKey
  
    if (account) {
      publicKey = new PublicKey(account)
    } else {
      const newAccount = new Account()
      publicKey = newAccount.publicKey
  
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: publicKey,
          lamports:
            lamports ??
            (await connection.getMinimumBalanceForRentExemption(layout.span)),
          space: layout.span,
          programId,
        })
      )
  
      signer.push(newAccount)
    }
  
    return publicKey
  }
// https://github.com/solana-labs/solana-program-library/blob/master/token/js/client/token.js#L210
export const ACCOUNT_LAYOUT = struct([
    publicKey('mint'),
    publicKey('owner'),
    u64('amount'),
    u32('delegateOption'),
    publicKey('delegate'),
    u8('state'),
    u32('isNativeOption'),
    u64('isNative'),
    u64('delegatedAmount'),
    u32('closeAuthorityOption'),
    publicKey('closeAuthority'),
  ])
  
  export const MINT_LAYOUT = struct([
    u32('mintAuthorityOption'),
    publicKey('mintAuthority'),
    u64('supply'),
    u8('decimals'),
    bool('initialized'),
    u32('freezeAuthorityOption'),
    publicKey('freezeAuthority'),
  ])
  
export async function createTokenAccountIfNotExist(
    connection: Connection,
    account: string | undefined | null,
    owner: PublicKey,
    mintAddress: string,
    lamports: number | null,
  
    transaction: Transaction,
    signer: Array<Account>
  ) {
    let publicKey
  
    if (account) {
      publicKey = new PublicKey(account)
    } else {
      publicKey = await createProgramAccountIfNotExist(
        connection,
        account,
        owner,
        TOKEN_PROGRAM_ID,
        lamports,
        ACCOUNT_LAYOUT,
        transaction,
        signer
      )
  
      transaction.add(
        initializeAccount({
          account: publicKey,
          mint: new PublicKey(mintAddress),
          owner,
        })
      )
    }
  
    return publicKey
  }


export async function createAssociatedTokenAccountIfNotExist(
    account: string | undefined | null,
    owner: PublicKey,
    mintAddress: string,
  
    transaction: Transaction,
    atas: string[] = []
  ) {
    let publicKey
    if (account) {
      publicKey = new PublicKey(account)
    }
  
    const mint = new PublicKey(mintAddress)
    // @ts-ignore without ts ignore, yarn build will failed
    const ata = await splToken.getAssociatedTokenAddress( 
      mint,
      owner,
      false,
      TOKEN_PROGRAM_ID,      
      ASSOCIATED_TOKEN_PROGRAM_ID,

    )
  
    if (
      (!publicKey || !ata.equals(publicKey)) &&
      !atas.includes(ata.toBase58())
    ) {
      transaction.add(
        splToken.createAssociatedTokenAccountInstruction(
            owner,
            ata,
            owner,mint,TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
      atas.push(ata.toBase58())
    }
  
    return ata
  }