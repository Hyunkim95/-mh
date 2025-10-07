import bs58 from "bs58";
import { PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";

export const generateNonce = () => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const length = Math.max(8, Math.floor(Math.random() * 12) + 8);

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

export const createMessage = (nonce: string) => {
  return `Welcome to the application. Sign this message to prove you own this address: ${nonce}`;
};

export const verifySignature = async (
  address: string,
  nonce: string,
  signature: string,
  isHardwareWallet: boolean = false
): Promise<boolean> => {
  if (!nonce) {
    throw new Error("Missing nonce");
  }
  if (!signature) {
    throw new Error("Missing signature");
  }

  try {
    if (!isHardwareWallet) {
      // Standard wallet signature verification
      const publicKey = new PublicKey(address);
      const messageBytes = decodeUTF8(createMessage(nonce));
      const signatureBytes = bs58.decode(signature);

      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes()
      );
    } else {
      // Hardware wallet signature verification (transaction-based)
      const transaction = Transaction.from(bs58.decode(signature));
      const instructions = transaction.instructions;

      const memoInstruction = instructions.find((instruction) =>
        instruction.programId.equals(
          new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
        )
      );

      if (!memoInstruction) {
        throw new Error(
          "Invalid hardware wallet signature - no memo instruction found"
        );
      }

      return memoInstruction.data.toString() === createMessage(nonce);
    }
  } catch (error) {
    throw new Error(
      `Error validating signature: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

export const createChallenge = () => {
  const nonce = generateNonce();
  const message = createMessage(nonce);
  return { nonce, message };
};

export const authService = {
  createChallenge,
  verifySignature,
};
