
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    webpack: (config) => {
        config.module.rules.push({
            test: /\.yml$/,
            use: 'raw-loader',
        });

        return config;
    },
};

module.exports = nextConfig;
