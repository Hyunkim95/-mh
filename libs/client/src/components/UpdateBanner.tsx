import { useDeploymentCheck } from "../hooks/useDeploymentCheck";

export const UpdateBanner = () => {
  const updateAvailable = useDeploymentCheck();

  if (!updateAvailable) return null;

  return (
    <div
      role="alert"
      data-testid="update-banner"
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-3 bg-[var(--laser-lemon-500)] px-4 py-2 text-sm font-medium text-black shadow"
    >
      <span>A new version of MultiHopper is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-[14px] border border-black/40 px-3 py-1 text-xs font-semibold hover:bg-black/10"
      >
        Reload
      </button>
    </div>
  );
};
