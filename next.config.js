module.exports = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard-v2",
        permanent: true,
      },
      {
        source: "/dashboard",
        destination: "/dashboard-v2",
        permanent: true,
      },
    ];
  },
};
