import { trpc } from "../trpc";

export interface TriggerHopParams {
  routeId: number;
}

export const useTriggerHop = (onSuccessCallback?: () => void) => {
  return trpc.contract.triggerHop.useMutation({
    onSuccess: (data) => {
      console.log("Hop triggered successfully:", data);
      if (onSuccessCallback) {
        onSuccessCallback();
      }
    },
    onError: (error) => {
      console.error("Failed to trigger hop:", error);
    },
  });
};

export default useTriggerHop;
