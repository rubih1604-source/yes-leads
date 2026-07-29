/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // מאפשר להריץ קוד פעם אחת כשהשרת עולה (הטיימר של המנוע)
  experimental: { instrumentationHook: true },

  // שגיאת טיפוס או לינט לא תפיל יותר את הפריסה.
  // הבדיקות האמיתיות רצות בתיקיית tests
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
