import { db } from "../../db";
import { userSchema } from "../schema/user.entities";
import { eq } from "drizzle-orm";
import { verifySignature } from "./auth.service";

export const findUserByPublicKey = async (publicKey: string) => {
  const user = await db
    .select()
    .from(userSchema)
    .where(eq(userSchema.publicKey, publicKey));
  if (user.length === 0) {
    return null;
  }
  return user[0];
};

export const createUser = async (publicKey: string) => {
  const user = await db
    .insert(userSchema)
    .values({ publicKey })
    .onConflictDoUpdate({
      target: userSchema.publicKey,
      set: { updatedAt: new Date() },
    })
    .returning();
  return user[0];
};

export const verifyUserWithSignature = async (
  nonce: string,
  address: string,
  signature: string,
  isHardwareWallet: boolean = false
) => {
  const isValid = await verifySignature(
    address,
    nonce,
    signature,
    isHardwareWallet
  );

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  let user = await findUserByPublicKey(address);
  if (!user) {
    user = await createUser(address);
  }

  return user;
};

export const usersService = {
  verifyUserWithSignature,
};
