import jwt from "jsonwebtoken";

export type AuthUser = {
  userId: string;
  email: string;
  fullName: string;
  role: "student" | "teacher";
};

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error("JWT_SECRET is required.");
}

const jwtSecret: string = secret;

export function signToken(user: AuthUser): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(user, jwtSecret, { expiresIn });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, jwtSecret) as unknown as AuthUser;
}
