import { trpc } from "../trpc";
import { captureClientError } from "../utils/monitoring";

export interface TriggerHopParams {
  routeId: number;
}

export const useTriggerHop = (onSuccessCallback?: () => void) => {
  return trpc.contract.triggerHop.useMutation({
    onSuccess: () => {
      if (onSuccessCallback) {
        onSuccessCallback();
      }
    },
    onError: (error) => {
      captureClientError(error, {
        area: "routes",
        action: "trigger-hop",
      });
    },
  });
};

export default useTriggerHop;
