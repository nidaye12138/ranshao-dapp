import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HTML must not advertise year-long s-maxage to reverse proxies (BT nginx
  // proxy_cache was serving a pre-i18n homepage and hid the locale toggle).
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Optional peers pulled by wagmi connector barrel; we only use injected().
    config.externals = config.externals || [];
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
      "porto": false,
      "accounts": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@walletconnect/ethereum-provider": false,
    };
    return config;
  },
};

export default nextConfig;
