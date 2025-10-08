import { config } from "dotenv";
config({
  path: "../../.env",
});

export const env = {
  NODE_ENV: process.env.NODE_ENV,
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED,
  DUAL_DIRECTION_ENABLED: process.env.DUAL_DIRECTION_ENABLED,
};
