# Raydium-LP-Manager
You can create pool and swap in one Jito Bundle. So, you will be first to buy your own token, then sell it later or Remove liquidity. 


# Detailed Features
1. Create Pool + Add Liquidity: The program allows you to enter desired amount of base tokens(COIN) and quote tokens(SOL), upon which it will create the liquidity pool.
2. Swap: Buy tokens with 2-4 snipers.
3. Sell: Manage your tokens and sell with buyers.


# Guide
1. Run `npm i`
2. Edit config.ts
3. ts-node jitoPool.ts


# Contacts
For support join our discord!
https://discord.gg/rn84eaRv7Y

Lots of cool defi tech and support hehe.


# You can check the whole source code for any sort of wallet drainers, if you dont trust an open sourced code.


# Faqs.
1. BlockHash Not found ERROR:
- Ignore it, but if it continously gives the error for more than a minute then you need to change your rpc as it suggests that your rpc is not healthy.
2. Bundle keeps getting rejected:
- Goto jitoPool.ts, at line 233 and increase jito tip fees which is in SOL lamports.
