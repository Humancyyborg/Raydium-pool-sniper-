import { connection, tokenBaseInfo, wallet } from "./config";
import { PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, SystemProgram, Keypair } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion } from './src/constants';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { Liquidity, Logger, MARKET_STATE_LAYOUT_V3, Token, TokenAmount, simulateTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, getWalletTokenAccount } from "./src/raydiumUtil";
import { searcherClient } from "./src/clients/jito";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { lookupTableProvider } from "./src/clients/LookupTableProvider";
import { getRandomTipAccount } from "./src/clients/config";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";

const logger = Logger.from('Liquidity')


async function start() {


    let myToken = new PublicKey(tokenBaseInfo.tokenAddress)
    let tokenInfo = await getMint(connection, myToken, 'finalized', TOKEN_PROGRAM_ID)

    const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.address), tokenInfo.decimals, 'DBD', 'DBD') // USDC
    const quoteToken = DEFAULT_TOKEN.SOL // RAYx
    const targetMarketId = new PublicKey(tokenBaseInfo.marketId)


    const startTime = Math.floor(Date.now() / 2000)
    const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)


    const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
    const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
    console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
    let poolKeys: any = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint,
        quoteMint,
        baseDecimals: tokenInfo.decimals,
        quoteDecimals: 9,
        marketId: targetMarketId,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
    })
    poolKeys.marketBaseVault = baseVault;
    poolKeys.marketQuoteVault = quoteVault;
    poolKeys.marketBids = bids;
    poolKeys.marketAsks = asks;
    poolKeys.marketEventQueue = eventQueue;
    // console.log("Pool Keys:", poolKeys);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);



    const baseMintAmount = (0.01) * Number(tokenBaseInfo.addLP) * Number(tokenBaseInfo.tokenSupply) * 10 ** tokenInfo.decimals;
    const quoteMintAmount = Number(tokenBaseInfo.addSol) * 10 ** 9;

    console.log(baseMintAmount);
    const addBaseAmount = new BN(baseMintAmount)
    const addQuoteAmount = new BN(quoteMintAmount)


    ammCreatePool({
        startTime,
        addBaseAmount,
        addQuoteAmount,
        baseToken,
        quoteToken,
        targetMarketId,
        wallet: wallet.payer,
        walletTokenAccounts,
    }).then(async ({ txs }) => {
        console.log('txids')


        const createPoolInstructions: TransactionInstruction[] = [];
        for (const itemIx of txs.innerTransactions) {
            createPoolInstructions.push(...itemIx.instructions)
        }
        const tipIxn = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: getRandomTipAccount(),
            lamports: BigInt('10000000'),
        });
        createPoolInstructions.push(tipIxn);

        const addressesMain: PublicKey[] = [];
        createPoolInstructions.forEach((ixn) => {
            ixn.keys.forEach((key) => {
                addressesMain.push(key.pubkey);
            });
        });
        const lookupTablesMain =
            lookupTableProvider.computeIdealLookupTablesForAddresses(addressesMain);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const messageMain = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash,
            instructions: createPoolInstructions,
        }).compileToV0Message(lookupTablesMain);
        const txMain = new VersionedTransaction(messageMain);



        try {
            const serializedMsg = txMain.serialize();
            if (serializedMsg.length > 1232) {
                console.log('tx too big');
                process.exit(0);
            }
            txMain.sign([wallet.payer]);
        } catch (e) {
            console.log(e, 'error signing txMain');
            process.exit(0);
        }



        // -------- step 2: create instructions by SDK function --------
        const txMainSwaps: any = await createWalletSwaps(poolKeys, baseToken, blockhash)

        const bundle = [txMain];

        for (var tnx of txMainSwaps) {
            bundle.push(tnx)
        }

        console.log('sending FINAL BUNDLE HERE  ', bundle)

        searcherClient
            .sendBundle(new JitoBundle(bundle, bundle.length))
            .then((bundleId) => {
                logger.info(
                    `Bundle ${bundleId} sent, backrunning ${bs58.encode(
                        bundle[0].signatures[0],
                    )}`,
                );

            }).catch((error) => {

                console.log(error, 'Error sending bundle');
                if (
                    error?.message?.includes(
                        'Bundle Dropped, no connected leader up soon',
                    )
                ) {
                    console.log(
                        'Error sending bundle: Bundle Dropped, no connected leader up soon.',
                    );
                } else {
                    console.log(error, 'Error sending bundle');
                }

            });

        searcherClient.onBundleResult(
            (bundleResult: any) => {
                const bundleId = bundleResult.bundleId;
                const isAccepted = bundleResult.accepted;
                const isRejected = bundleResult.rejected;
                if (isAccepted) {
                    logger.info(
                        `Bundle ${bundleId} accepted in slot ${bundleResult?.accepted.slot}`,
                    );

                }
                if (isRejected) {
                    logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);

                }
            },
            (error) => {
                console.log(error);
                throw error;
            },
        );



    })





}


start()



const createWalletSwaps = async (poolKeys: any, baseToken: Token, blockhash: string) => {

    const txsSigned: VersionedTransaction[] = [];


    for (var item of tokenBaseInfo.wallets) {

        console.debug('Create Step 1 Swap ')
        const userwallet = Keypair.fromSecretKey(Uint8Array.from(item.privateKey));
        const swapperwallet = new NodeWallet(userwallet);

        const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
        const outputTokenAmount = new TokenAmount(baseToken, 1, false);
        const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, item.amountToSwap, false);
        const { innerTransactions: swapTransactions } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: userwalletTokenAccounts,
                owner: swapperwallet.publicKey,
            },
            amountIn: inTokenAmount,
            amountOut: outputTokenAmount,
            fixedSide: 'in',
            makeTxVersion,
            lookupTableCache: addLookupTableInfo
        });
        console.debug('Create Step 2 makeSwapInstructionSimple ')

        const createSwapInstructions: TransactionInstruction[] = [];
        for (const itemIx of swapTransactions) {
            createSwapInstructions.push(...itemIx.instructions);
        }
        const tipSwapIxn = SystemProgram.transfer({
            fromPubkey: swapperwallet.publicKey,
            toPubkey: getRandomTipAccount(),
            lamports: BigInt('10000000'),
        });
        createSwapInstructions.push(tipSwapIxn);
        console.debug('Create Step 3 makeSwapInstructionSimple ')

        const addressesSwapMain: PublicKey[] = [];
        createSwapInstructions.forEach((ixn) => {
            ixn.keys.forEach((key) => {
                addressesSwapMain.push(key.pubkey);
            });
        });
        const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);
        console.debug('Create Step 4 makeSwapInstructionSimple ')

        const messageMainSwap = new TransactionMessage({
            payerKey: swapperwallet.publicKey,
            recentBlockhash: blockhash,
            instructions: createSwapInstructions,
        }).compileToV0Message(lookupTablesSwapMain);
        const txMainSwap = new VersionedTransaction(messageMainSwap);

        console.debug('Create Step 5 makeSwapInstructionSimple ')

        try {
            const serializedMsg = txMainSwap.serialize();
            if (serializedMsg.length > 1232) {
                console.log('tx too big');
                return null;
            }
            txMainSwap.sign([swapperwallet.payer]);


            console.debug('sending bundles ')

            txsSigned.push(txMainSwap);

            const tx: any = txMainSwap;
            const a = await simulateTransaction(connection, [tx], false)

            console.debug('simulateTransaction bundles ', a)


        } catch (e) {
            console.debug(e, 'error signing txMain');
            return null;
        }

        console.debug('Final  ')


    }


    return txsSigned;
}
