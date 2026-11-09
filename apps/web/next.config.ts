import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
