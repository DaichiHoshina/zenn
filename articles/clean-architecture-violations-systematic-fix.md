---
title: "クリーンアーキテクチャ違反を系統的に潰した話"
emoji: "🏗️"
type: "tech"
topics: ["go", "cleanarchitecture", "ddd", "microservices", "refactoring"]
published: false
---

## 外部レビューでCritical指摘が大量に出た

外部のコードレビューを受けたところ、複数のサービスからCritical指摘が出ました。

- Repository層にビジネスロジックがある
- UseCase層がインフラ層に直接依存している
- PII（個人情報）がログに出力されている
- 型アサーションが安全でない

「動いてるからOK」じゃなくて、「構造的に正しいか」を問われた形です。14サービスを横断して、これを系統的に潰していくことにしました。

## 違反パターンを体系化する

まず全サービスを調査して、違反を4パターンに分類しました。

| パターン | 内容 | 件数が多かったサービス |
|---------|------|----------------------|
| **依存方向違反** | UseCase → Infrastructure の直接依存 | 決済、注文 |
| **責務違反** | Repository層にドメインルール | 料金計算、配送統合 |
| **セキュリティ違反** | ログにPII出力 | 店舗管理 |
| **型安全性違反** | interface{}の安全でないキャスト | 全般 |

サービスごとの違反件数を可視化して、多い順に対応していきました。

## Repository層のビジネスロジック移動

一番多かった違反です。

### 料金計算サービスの例

Repositoryの中で配送料の計算ロジックが走ってました。Repositoryは「データの取得」だけに責務を限定すべきなのに、計算ロジックまで入ってたんですよね。

**修正前** — Repositoryに計算ロジックがある:

```go
func (r *FeeRepository) GetShippingFee(ctx context.Context, params FeeParams) (int, error) {
    tariff, err := r.db.FindTariff(ctx, params.ServiceID)
    if err != nil {
        return 0, err
    }
    // ビジネスロジックがRepository層にある
    baseFee := tariff.BaseFee
    if params.Weight > tariff.WeightThreshold {
        baseFee += (params.Weight - tariff.WeightThreshold) * tariff.ExtraPerKg
    }
    return baseFee, nil
}
```

**修正後** — 計算ロジックをドメイン層に移動:

```go
// domain/fee.go
type Tariff struct { /* ... */ }

func (t *Tariff) Calculate(weight int) int {
    baseFee := t.BaseFee
    if weight > t.WeightThreshold {
        baseFee += (weight - t.WeightThreshold) * t.ExtraPerKg
    }
    return baseFee
}

// repository — データの取得だけ
func (r *FeeRepository) FindTariff(ctx context.Context, serviceID string) (*domain.Tariff, error) {
    return r.db.FindTariff(ctx, serviceID)
}

// usecase — ドメインロジックを呼び出す
func (u *FeeUseCase) Calculate(ctx context.Context, params FeeParams) (int, error) {
    tariff, err := u.repo.FindTariff(ctx, params.ServiceID)
    if err != nil {
        return 0, err
    }
    return tariff.Calculate(params.Weight), nil
}
```

### トランザクションインターフェースの配置

配送統合サービスでは、トランザクションのインターフェースがUseCase層にありました。これをドメイン層に移動して、UseCase → Domain → Infrastructure の依存方向を確保しました。

## PIIログの修正

店舗管理サービスで、ログにメールアドレスが出力されてました。

対応方針はシンプルです。

- ログには「storeID」「操作名」のみ出力
- PIIが必要な調査は別の安全なストレージから確認する
- 「何をログに出してよいか」のガイドラインを策定

```go
// 修正前
logger.Info("store created", "email", store.Email, "name", store.Name)

// 修正後
logger.Info("store created", "storeID", store.ID)
```

地味ですが、これが本番で漏れてたと思うとゾッとします。

## interface{} → any の一括置換

Go 1.18以降は`any`が使えるので、全サービスで一括置換しました。

単純な置換ですが、14サービスで一気にやることで「統一された」感が出ます。合わせて、安全でない型アサーションを`type switch`に変更しました。

```go
// 修正前 — panicの可能性あり
value := data.(string)

// 修正後 — 安全
value, ok := data.(string)
if !ok {
    return fmt.Errorf("unexpected type: %T", data)
}
```

lintルールで再発防止も入れています。

## DDD構造改善

### パッケージ名の改善

決済サービスでは`server/`という曖昧なパッケージ名を`interface/grpc/`に変更しました。名前が変わるだけで、コードの意図がぐっと分かりやすくなります。

### ビジネスルールの適切な配置

注文サービスで「EC連携解除後の注文をどう扱うか」がRepository層で判断されてました。これはドメインの判断なので、Domain Serviceに移動しました。

## 再発防止

修正して終わりだと同じことが起きるので、仕組みで防ぐようにしました。

| 対策 | 内容 |
|------|------|
| golangci-lint | カスタムルール追加 |
| CI | 依存方向チェック |
| コードレビュー | チェックリストに追加 |
| テンプレート | 新規サービス作成時のひな形を更新 |

## おわりに

「動いてるから触るな」は負債を増やすだけです。「動いてるうちに直す」が正解でした。

今回はCRITレビューという外圧を活用して一気に進めましたが、進め方としては違反パターンの体系化 → 優先度付け → パイロット → 展開のプロセスが再現可能だと思います。

技術的負債の返済は「一気にやるか、少しずつやるか」の戦略が必要です。うちの場合は外部レビューという良いタイミングがあったので一気にやりましたが、そういうきっかけがなくても、まず全サービスの違反を可視化するところから始めてみてください！
