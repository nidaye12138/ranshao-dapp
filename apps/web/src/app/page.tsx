import Image from "next/image";
import Link from "next/link";
import { isConfigured } from "@/lib/addresses";

export default function HomePage() {
  return (
    <section className="hero-bleed">
      <div className="hero-plane" aria-hidden="true" />
      <div className="hero-content">
        <Image
          src="/umidor-logo.png"
          alt="Umidor"
          width={240}
          height={228}
          className="hero-logo"
          priority
        />
        <h1 className="hero-kicker">买入、燃烧、四档分红，在链上运转。</h1>
        <p className="hero-lead">
          BNB / USDT 购币即时 0.5%+0.5%；燃烧 70/20/10 拆账，九层奖励与 SPCXB 四档池。
        </p>
        <div className="cta-row">
          <Link className="btn primary" href="/buy">
            立即购币
          </Link>
          <Link className="btn" href="/burn">
            去燃烧
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
