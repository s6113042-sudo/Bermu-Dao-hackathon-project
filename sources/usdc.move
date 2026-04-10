/// 測試用 USDC 代幣
///
/// 僅用於測試環境，提供 faucet 讓玩家領取測試幣
module gamefi::usdc {
    use sui::coin::{Self, TreasuryCap};
    use sui::coin_registry;

    // === 代幣定義 ===

    public struct USDC has drop {}

    // === 初始化 ===

    fun init(witness: USDC, ctx: &mut TxContext) {
        let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
            witness,
            6,                          // 6 位小數（與真實 USDC 相同）
            b"USDC".to_string(),
            b"USD Coin".to_string(),
            b"Test USDC for GameFi platform".to_string(),
            b"".to_string(),            // icon URL（測試用留空）
            ctx,
        );
        let metadata_cap = builder.finalize(ctx);
        transfer::public_transfer(metadata_cap, ctx.sender());
        transfer::public_share_object(treasury_cap);
    }

    // === 水龍頭（測試用） ===

    /// 鑄造測試用 USDC 並發送到指定地址
    /// 生產環境應移除此函式
    public fun faucet(
        treasury_cap: &mut TreasuryCap<USDC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
