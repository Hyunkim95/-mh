import { toast } from "react-hot-toast";
import { trpc } from "../trpc";
import { extractErrorMessage } from "../utils/extractErrorMessage";

export const useReplayRoute = () => {
  const replayMutation = trpc.routes.replay.useMutation();
  const utils = trpc.useUtils();

  const replay = async (params: { id: number; creator: string }) => {
    try {
      toast.loading("Cloning route for replay...", { id: "replay-route" });
      const result = await replayMutation.mutateAsync(params);
      toast.success("Replay route created", { id: "replay-route" });
      // Ensure the history list refreshes so the cloned route appears on top
      await utils.routes.getByCreator.invalidate({ creator: params.creator });
      return result.data;
    } catch (error) {
      toast.error(extractErrorMessage(error, "Failed to replay route"), {
        id: "replay-route",
      });
      throw error;
    }
  };

  return {
    replay,
    isPending: replayMutation.isPending,
    error: replayMutation.error,
    data: replayMutation.data,
    reset: replayMutation.reset,
  };
};
