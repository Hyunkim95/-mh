import * as MultiHopperProjectIdlJson from "./multi_hopper_project.json";
import * as TransferHookGuardIdlJson from "./transfer_hook_guard.json";
import type { MultiHopperProject as MultiHopperProjectBase } from "./multi_hopper_project";
import type { TransferHookGuard as TransferHookGuardBase } from "./transfer_hook_guard";

export type MultiHopperIdl = typeof MultiHopperProjectIdlJson;

export type TransferHookGuardIdl = typeof TransferHookGuardIdlJson;

export type MultiHopperProject = MultiHopperProjectBase;
export type TransferHookGuard = TransferHookGuardBase;

export const MULTI_HOPPER_IDL = MultiHopperProjectIdlJson as MultiHopperIdl;

export const TRANSFER_HOOK_GUARD_IDL =
  TransferHookGuardIdlJson as TransferHookGuardIdl;
