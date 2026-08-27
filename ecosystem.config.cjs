module.exports = {
  apps: [
    {
      name: "url-shortener-api",
      script: "./server.js",
      instances: "max", // Scale to all available CPU cores
      exec_mode: "cluster",
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      max_memory_restart: "500M",
      watch: false,
    },
  ],
};
