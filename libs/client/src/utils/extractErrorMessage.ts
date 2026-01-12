/**
 * Extracts a user-friendly error message from various error types,
 * including TRPC errors which have a specific structure.
 *
 * TRPC errors can have the message in different locations:
 * - error.message (sometimes just "INTERNAL_SERVER_ERROR")
 * - error.shape.message (the actual error message)
 * - error.data.message (additional context)
 */
export function extractErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred"
): string {
  if (!error) return fallback;

  // Handle TRPC error shape first (most specific)
  if (typeof error === "object" && error !== null) {
    const trpcError = error as {
      message?: string;
      shape?: { message?: string };
      data?: { message?: string; code?: string };
    };

    // Try to get the most specific message available
    // TRPC shape.message usually has the actual error message
    if (trpcError.shape?.message) {
      return trpcError.shape.message;
    }

    // data.message can have additional context
    if (trpcError.data?.message) {
      return trpcError.data.message;
    }

    // Fall back to error.message if it's not a generic code
    if (
      trpcError.message &&
      trpcError.message !== "INTERNAL_SERVER_ERROR" &&
      trpcError.message !== "BAD_REQUEST" &&
      trpcError.message !== "UNAUTHORIZED" &&
      trpcError.message !== "FORBIDDEN" &&
      trpcError.message !== "NOT_FOUND"
    ) {
      return trpcError.message;
    }
  }

  // Standard Error object
  if (error instanceof Error) {
    return error.message;
  }

  // String error
  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

