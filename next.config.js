/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Images are served directly from their source (Unsplash, Vercel Blob,
    // any CDN). Turning off Next's image optimizer avoids its security
    // surface and Vercel's paid image-optimization quota.
    unoptimized: true
  }
};
module.exports = nextConfig;
