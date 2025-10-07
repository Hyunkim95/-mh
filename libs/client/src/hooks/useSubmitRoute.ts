import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";

export const useSubmitRoute = ({
  publicKey,
}: {
  publicKey: PublicKey | null;
}) => {
  const createRoute = trpc.routes.create.useMutation();
  const getRoutes = trpc.routes.getByCreator.useQuery(
    {
      creator: publicKey?.toBase58() ?? "",
    },
    {
      enabled: !!publicKey,
    }
  );

  const handleRouteSubmit = async (data: any, type: "SPL" | "SOL") => {
    console.log("Received route data:", data);
    try {
      await createRoute.mutateAsync({
        tokenType: type,
        tokenMint: data.tokenMint,
        tokenDecimals: data.tokenDecimals,
        hopAmountTokens: data.hopAmountTokens,
        hopAmountRaw: data.hopAmountRaw,
        hops: data.hops,
        creator: publicKey?.toBase58() ?? "",
      });

      toast.success(`${type} Route created successfully!`);
      await getRoutes.refetch();
    } catch (error) {
      console.error(`${type} Route creation failed:`, error);
      toast.error(
        `${type} Route creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  return {
    handleRouteSubmit,
  };
};
