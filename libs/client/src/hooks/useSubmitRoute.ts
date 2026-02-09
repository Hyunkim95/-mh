import { trpc } from "../trpc";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import type { DeployModalRoute } from "../components/DeployModal";
import { extractErrorMessage } from "../utils/extractErrorMessage";

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

  const handleRouteSubmit = async (
    data: any,
    type: "SPL" | "SOL"
  ): Promise<DeployModalRoute | null> => {
    console.log("Received route data:", data);
    try {
      const result = await createRoute.mutateAsync({
        name: data.name,
        tokenType: type,
        tokenMint: data.tokenMint,
        tokenSymbol: data.tokenSymbol,
        tokenDecimals: data.tokenDecimals,
        hopAmountTokens: data.hopAmountTokens,
        hopAmountRaw: data.hopAmountRaw,
        hops: data.hops,
        creator: publicKey?.toBase58() ?? "",
      });

      toast.success(`${type} Route created successfully!`);
      await getRoutes.refetch();

      // Return route data for deploy modal
      // Note: We use the input hops data since createRoute doesn't return hops
      const route = result.data;
      return {
        id: route.id,
        routeId: route.routeId,
        name: route.name,
        tokenType: route.tokenType as "SOL" | "SPL",
        tokenMint: route.tokenMint,
        tokenSymbol: route.tokenSymbol,
        hopAmountTokens: route.hopAmountTokens,
        hopAmountRaw: route.hopAmountRaw,
        totalSpendTokens: data.totalSpendTokens,
        hops: data.hops.map((hop: { recipient: string; scheduledAt: string }) => ({
          recipient: hop.recipient,
          scheduledAt: hop.scheduledAt,
        })),
      };
    } catch (error) {
      console.error(`${type} Route creation failed:`, error);
      toast.error(`${type} Route creation failed: ${extractErrorMessage(error)}`);
      return null;
    }
  };

  return {
    handleRouteSubmit,
  };
};
