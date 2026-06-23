import { createAppContext, handleAppRequest } from "./app.js";
import type { GhostShiftEnv } from "./domain/ledger.js";

export default {
  fetch(request: Request, env: GhostShiftEnv) {
    return handleAppRequest(request, createAppContext(env));
  }
};
