import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { prisma } from "@/lib/db";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "1";
const resendEnabled = Boolean(process.env.RESEND_API_KEY);

const providers = [];

if (resendEnabled) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "hackmywebsite.ai <no-reply@hackmywebsite.ai>",
      name: "Email",
    }),
  );
}

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Local development",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
        const role = adminEmails.includes(email) ? "ADMIN" : "USER";
        const user = await prisma.user.upsert({
          where: { email },
          update: { emailVerified: new Date(), role },
          create: { email, name: email.split("@")[0], emailVerified: new Date(), role },
        });
        await prisma.wallet.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, balanceCents: 0 },
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login", verifyRequest: "/login?sent=1" },
  providers,
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      const email = user.email.toLowerCase();
      const role = adminEmails.includes(email) ? "ADMIN" : "USER";
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { role } });
        await prisma.wallet.upsert({
          where: { userId: existing.id },
          update: {},
          create: { userId: existing.id, balanceCents: 0 },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role || (token.role as string) || "USER";
      }
      if (token.email && !token.role) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email.toLowerCase() } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = (token.role as string) || "USER";
      }
      return session;
    },
  },
});
