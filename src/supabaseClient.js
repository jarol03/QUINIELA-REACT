import { insforge } from "./insforgeClient";

export { insforge } from "./insforgeClient";
export {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  saveSession,
  getSession,
  clearSession,
  verifyUserStillExists,
} from "./insforgeClient";

export const supabase = insforge.database;
