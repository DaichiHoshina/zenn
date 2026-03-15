---
title: "配達希望日の状態管理が地獄だったので、ReactでDDDした"
emoji: "🔄"
type: "tech"
topics: ["react", "typescript", "ddd", "frontend", "statemanagement"]
published: false
---

## 一見シンプルな要件でした

ユーザーが配送サービスを切り替えたとき、配達希望日をどうするか。要件はこんな感じです。

- 同じ配送会社内の切替（例: 通常便 → クール便）: 配達希望日を引き継ぐ
- 別の配送会社への切替: リセットする
- 日時指定不可のサービスに切替: 強制リセット
- 日時指定不可から戻したとき: 以前の値を復元する

「if文いくつか書けば終わるでしょ」と思ってたんですが、全然終わりませんでした。20回くらいコミットしてやっと辿り着いた設計を紹介します。

## 最初のアプローチ（失敗）

`useState`で配達希望日を管理して、サービス切替の`onChange`で条件分岐するシンプルな実装から始めました。

3つの問題にぶつかりました。

### 1. stale closure

`onChange`ハンドラーの中で参照する状態が古い問題です。Reactのクロージャあるあるですね。

```tsx
// これだとserviceSettingsが古い値を参照する
const handleServiceChange = (serviceId: string) => {
    // serviceSettingsはレンダリング時点の値で固定されてる
    if (isSameCarrier(serviceSettings, serviceId)) {
        // 期待通りに動かない
    }
};
```

### 2. レース条件

サービス情報のfetchが完了する前に、ユーザーが次の切替をすると、古いfetchの結果が後から到着して上書きしてしまいます。

### 3. 条件分岐の肥大化

要件を全部`onChange`に書いていったら、読めないレベルまで条件分岐が膨らみました。

## useRefでstale closureを解決

まず`serviceSettings`を`useRef`に変更しました。

```tsx
const serviceSettingsRef = useRef(serviceSettings);
serviceSettingsRef.current = serviceSettings;

const handleServiceChange = (serviceId: string) => {
    // .currentは常に最新の値を参照する
    if (isSameCarrier(serviceSettingsRef.current, serviceId)) {
        keepDeliveryDate();
    }
};
```

「表示に使う状態」と「ロジックに使う状態」を分離するのがポイントです。`useRef`は再レンダリングを起こさないので、パフォーマンスも改善しました。

ただし、これだけでは根本解決にはなりません。

## ドメインロジックを分離する（DDD的アプローチ）

フロントエンドでもDDD的に考えることにしました。

### ヘルパー関数を抽出

条件判断のロジックをコンポーネントから切り出して、純粋関数にしました。

```tsx
// domain/shipping.ts
export const isSameCarrier = (
    currentSettings: ServiceSettings,
    nextServiceId: string
): boolean => {
    return currentSettings.carrierId === getCarrierId(nextServiceId);
};

export const canSpecifyDeliveryDate = (
    service: ShippingService
): boolean => {
    return service.allowDateSpecification;
};

export const shouldResetDeliveryDate = (
    currentSettings: ServiceSettings,
    nextService: ShippingService
): boolean => {
    if (!canSpecifyDeliveryDate(nextService)) return true;
    if (!isSameCarrier(currentSettings, nextService.id)) return true;
    return false;
};
```

これで`useShippingForm`の可読性が劇的に改善しました。条件分岐が関数名で読めるようになったんですよね。

### テストが書けるようになった

ドメインロジックが純粋関数になったので、Reactに依存しないテストが書けるようになりました。

```tsx
const sameCarrierService: ShippingService = {
    id: "service-b", carrierId: "carrier-a", allowDateSpecification: true,
};
const differentCarrierService: ShippingService = {
    id: "service-c", carrierId: "carrier-b", allowDateSpecification: true,
};

test("同一キャリアの切替では配達希望日を引き継ぐ", () => {
    const settings = { carrierId: "carrier-a", deliveryDate: "2026-03-20" };
    expect(shouldResetDeliveryDate(settings, sameCarrierService)).toBe(false);
});

test("異なるキャリアへの切替ではリセットする", () => {
    const settings = { carrierId: "carrier-a", deliveryDate: "2026-03-20" };
    expect(shouldResetDeliveryDate(settings, differentCarrierService)).toBe(true);
});
```

## フォールバック復元の設計

日時指定不可のサービスを経由して戻ったとき、以前の配達希望日を復元したいという要件がありました。

設計はこうです。

1. サービス切替時に、現在の値を`serviceSettings`に保存しておく
2. 戻ったときに`serviceSettings`から復元する
3. 同じ配送会社の別サービスの設定もフォールバック候補にする

ここでハマったのが、「指定なし」をデフォルト値として保存してしまうケースです。日時指定不可サービスに切り替えた時点で値がリセットされるので、その状態を保存してしまうと復元しても「指定なし」が返ってくるだけになります。**保存するタイミングはリセット前**にする必要がありました。

## レース条件ガード

最後に残った問題がレース条件です。

サービス切替 → fetchServiceSettings → 状態更新、という非同期フローで、ユーザーが高速に切り替えると古いfetchの結果が後から到着して上書きしてしまいます。

解決方法は、`useRef`で最新のサービスIDを保持して、fetch完了時に比較することです。

```tsx
const latestServiceIdRef = useRef<string>("");

const handleServiceChange = async (serviceId: string) => {
    latestServiceIdRef.current = serviceId;

    const settings = await fetchServiceSettings(serviceId);

    // fetch中に別のサービスに切り替えられてたら無視
    if (latestServiceIdRef.current !== serviceId) return;

    applySettings(settings);
};
```

シンプルですが、これがないと本番で意図しない状態になります。

## おわりに

フロントエンドの「状態管理が複雑」問題って、多くの場合ドメインロジックがコンポーネントに散らばっていることが原因だと思います。

DDDの考え方はバックエンドだけのものじゃなくて、フロントエンドでも十分使えます。ロジックを純粋関数に切り出すだけで、テストも書けるし可読性も上がります。

20回コミットした試行錯誤は無駄じゃなくて、設計の妥当性を検証するプロセスでした。stale closureとレース条件はReactの非同期処理では避けて通れないので、パターンとして知っておくと役立つと思います！
