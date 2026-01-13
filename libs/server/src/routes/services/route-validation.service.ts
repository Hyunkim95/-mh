import { PublicKey } from "@solana/web3.js";
import {
  getTokenConfigSPL,
  getTokenConfigSOL,
} from "../../solana/services/contract.service";

interface RouteInput {
  tokenType: "SPL" | "SOL";
  tokenMint?: string;
  hopAmountRaw: string;
  hops: Array<{
    recipient: string;
    scheduledAt: string;
  }>;
  creator: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a route against token configuration constraints
 */
export async function validateRouteAgainstTokenConfig(
  routeInput: RouteInput
): Promise<ValidationResult> {
  const errors: string[] = [];

  try {
    // Fetch token configuration based on token type
    let tokenConfig;
    if (routeInput.tokenType === "SPL") {
      if (!routeInput.tokenMint) {
        errors.push("Token mint is required for SPL token routes");
        return { isValid: false, errors };
      }

      const result = await getTokenConfigSPL(routeInput.tokenMint);
      if (!result) {
        errors.push(
          `Token configuration not found for SPL token: ${routeInput.tokenMint}`
        );
        return { isValid: false, errors };
      }
      tokenConfig = result;
    } else {
      const result = await getTokenConfigSOL();
      if (!result) {
        errors.push("SOL token configuration not found");
        return { isValid: false, errors };
      }
      tokenConfig = result;
    }

    // Validate maximum hops - DISABLED to match Easy Mode behavior
    // const hopCount = routeInput.hops.length;
    // const maxHops = parseInt(tokenConfig.maxHops);
    // if (hopCount > maxHops) {
    //   errors.push(
    //     `Route has ${hopCount} hops but token config allows maximum ${maxHops} hops`
    //   );
    // }

    // Validate minimum transfer amount
    const hopAmountRaw = BigInt(routeInput.hopAmountRaw);
    const minTransfer = BigInt(tokenConfig.minTransfer);
    if (hopAmountRaw < minTransfer) {
      errors.push(
        `Hop amount ${hopAmountRaw} is below minimum transfer amount ${minTransfer}`
      );
    }

    // Validate hop delays against maximum delay
    const maxDelaySeconds = parseInt(tokenConfig.maxDelaySeconds);

    // Calculate delays between consecutive hops
    for (let i = 1; i < routeInput.hops.length; i++) {
      const currentHopTime = new Date(routeInput.hops[i].scheduledAt).getTime();
      const previousHopTime = new Date(
        routeInput.hops[i - 1].scheduledAt
      ).getTime();
      const delaySeconds = Math.floor(
        (currentHopTime - previousHopTime) / 1000
      );

      if (delaySeconds > maxDelaySeconds) {
        errors.push(
          `Delay between hop ${i} and hop ${
            i + 1
          } is ${delaySeconds} seconds, which exceeds maximum allowed delay of ${maxDelaySeconds} seconds`
        );
      }

      if (delaySeconds < 0) {
        errors.push(
          `Hop ${
            i + 1
          } is scheduled before hop ${i}. Hops must be scheduled in chronological order`
        );
      }
    }

    // Additional validation: ensure first hop is not scheduled too far in the future
    if (routeInput.hops.length > 0) {
      const firstHopTime = new Date(routeInput.hops[0].scheduledAt).getTime();
      const now = Date.now();
      const delayToFirstHop = Math.floor((firstHopTime - now) / 1000);

      if (delayToFirstHop > maxDelaySeconds) {
        errors.push(
          `First hop is scheduled ${delayToFirstHop} seconds in the future, which exceeds maximum allowed delay of ${maxDelaySeconds} seconds`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error("Error validating route against token config:", error);
    errors.push(
      "Failed to validate route: Unable to fetch token configuration"
    );
    return { isValid: false, errors };
  }
}

/**
 * Validates recipient addresses in hops
 */
export function validateHopRecipients(
  hops: Array<{ recipient: string }>
): ValidationResult {
  const errors: string[] = [];

  for (let i = 0; i < hops.length; i++) {
    const recipient = hops[i].recipient;

    try {
      // Validate that recipient is a valid Solana public key
      new PublicKey(recipient);
    } catch {
      errors.push(`Hop ${i + 1} has invalid recipient address: ${recipient}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates hop scheduling timestamps
 */
export function validateHopScheduling(
  hops: Array<{ scheduledAt: string }>
): ValidationResult {
  const errors: string[] = [];
  const now = Date.now();

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];

    try {
      const scheduledTime = new Date(hop.scheduledAt);

      // Check if date is valid
      if (isNaN(scheduledTime.getTime())) {
        errors.push(
          `Hop ${i + 1} has invalid scheduled time: ${hop.scheduledAt}`
        );
        continue;
      }

      // Check if hop is scheduled in the past (with 1 minute tolerance)
      const oneMinuteAgo = now - 60 * 1000;
      if (scheduledTime.getTime() < oneMinuteAgo) {
        errors.push(
          `Hop ${i + 1} is scheduled in the past: ${hop.scheduledAt}`
        );
      }

      // Check chronological order
      if (i > 0) {
        const previousHopTime = new Date(hops[i - 1].scheduledAt);
        if (scheduledTime <= previousHopTime) {
          errors.push(`Hop ${i + 1} must be scheduled after hop ${i}`);
        }
      }
    } catch (error) {
      errors.push(
        `Hop ${i + 1} has invalid scheduled time format: ${hop.scheduledAt}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive route validation that combines all checks
 */
export async function validateRoute(
  routeInput: RouteInput
): Promise<ValidationResult> {
  const allErrors: string[] = [];

  // Basic hop recipient validation
  const recipientValidation = validateHopRecipients(routeInput.hops);
  allErrors.push(...recipientValidation.errors);

  // Hop scheduling validation
  const schedulingValidation = validateHopScheduling(routeInput.hops);
  allErrors.push(...schedulingValidation.errors);

  // Token config compliance validation
  const tokenConfigValidation = await validateRouteAgainstTokenConfig(
    routeInput
  );
  allErrors.push(...tokenConfigValidation.errors);

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}
