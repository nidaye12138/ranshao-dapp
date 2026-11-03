import Link from "next/link";
import { isConfigured } from "@/lib/addresses";

export default function HomePage() {
  return (
    <section className="hero-bleed">
      <div className="hero-plane" aria-hidden="true" />
      <div className="hero-content">
        <p className="hero-brand">燃烧</p>
        <h1 className="hero-kicker">社区代币，在链上点燃。</h1>
        <p className="hero-lead">
          用 BNB 或 USDT 购币，绑定直推拿即时奖励与业绩档位，存币生息，申请有限席位股东。
        </p>
        <div className="cta-row">
          <Link className="btn primary" href="/buy">
            立即购币
          </Link>
          <Link className="btn" href="/promo">
            绑定邀请
          </Link>
        </div>
        {!isConfigured && (
          <p className="banner warn hero-note">
            尚未配置合约地址。请复制 <code>apps/web/.env.example</code> 为 <code>.env.local</code>
            ，填入部署后的地址。
          </p>
        )}
      </div>
    </section>
  );
}
