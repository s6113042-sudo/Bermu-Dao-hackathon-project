/// 測試用 SUI 代幣（TSUI）
///
/// 僅用於開發網測試，模擬 SUI 的精度與行為
/// 提供免費水龍頭讓測試帳號領取
module tsui::tsui {
    use sui::coin::{Self, TreasuryCap};
    use sui::coin_registry;

    public struct TSUI has drop {}

    fun init(witness: TSUI, ctx: &mut TxContext) {
        let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
            witness,
            9,                              // 9 位小數（與真實 SUI/MIST 相同）
            b"TSUI".to_string(),
            b"Test SUI".to_string(),
            b"Test SUI for GameFi devnet testing".to_string(),
            b"".to_string(),
            ctx,
        );
        let metadata_cap = builder.finalize(ctx);
        transfer::public_transfer(metadata_cap, ctx.sender());
        transfer::public_share_object(treasury_cap);
    }

    /// 水龍頭：鑄造 TSUI 並發送到指定地址
    public fun faucet(
        treasury_cap: &mut TreasuryCap<TSUI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
