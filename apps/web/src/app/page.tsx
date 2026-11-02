import Link from "next/link";
import { isConfigured } from "@/lib/addresses";

export default function HomePage() {
  return (
    <section className="hero">
      <h1>燃烧</h1>
      <p className="lead">
        在 BNB Smart Chain 上购买社区代币，绑定直推获得即时奖励与业绩档位，存币生息，申请有限席位股东。
      </p>
      <div className="cta-row">
        <Link className="btn primary" href="/buy">
          立即购币
        </Link>
        <Link className="btn" href="/promo">
          绑定邀请 / 推广
        </Link>
        <Link className="btn" href="/stake">
          存币生息
        </Link>
      </div>
      {!isConfigured && (
        <p className="banner warn" style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
          尚未配置合约地址。请复制 <code>apps/web/.env.example</code> 为 <code>.env.local</code>，填入部署后的地址。
        </p>
      )}
    </section>
  );
}
